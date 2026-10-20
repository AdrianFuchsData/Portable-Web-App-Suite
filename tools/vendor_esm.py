#!/usr/bin/env python3
"""Vendor ES-module-only npm packages without node/npm.

jsDelivr serves every npm package as a single ES module at /npm/<pkg>@<version>/+esm. Its imports
point to further /npm/.../+esm URLs. This script downloads the requested packages and, recursively,
everything they import, and stores them in a vendor directory. Every import is rewritten to a bare
specifier ("@codemirror/state", "pkg/subpath"), and an import map (importmap.json) maps each
specifier to its file. build.py turns that import map into data: URLs, so the browser resolves the
modules from a single HTML file opened via file://, without a bundler.

Exactly one version per package is kept (like an npm dedupe): the version pinned in the manifest,
otherwise the highest version requested by any dependent. Libraries such as CodeMirror break if a
package (e.g. @codemirror/state) is loaded twice.

Manifest (JSON): {"out": "esm/codemirror", "packages": {"codemirror": "6.0.2", "@codemirror/lang-javascript": "6"},
                  "modules": ["pkg/subpath"], "assets": {"@xterm/xterm": ["css/xterm.css"]}}
"modules" lists additional subpath modules that are not imported by the packages themselves
(e.g. "@univerjs/preset-sheets-core/locales/de-DE"); "subpath_only" lists packages that have no main module.
"exclude"/"include" are glob patterns of module
specifiers that are left out (or kept despite "exclude"); see excluded(). "stub" writes a small replacement
module for every excluded specifier: {"template": "export const {name} = ...;", "name": {"regex": "...",
"pascal": true}} ({name} = first regex group of the specifier, optionally in PascalCase). "assets" are further text files of a package (e.g. stylesheets), stored in assets/<package>/<file>;
"data_packages" ({"dictionary-en": "4.0.0"}, exact versions) are packages that only provide such assets (no module is loaded).
"patches" ({"pkg": [["find", "replace"], ...]}) fix modules after the import rewrite (each "find" must occur exactly once),
e.g. jsDelivr's conversion of CommonJS packages that call a namespace import as a function.
Versions may be exact or partial ("6"); partial versions are resolved by jsDelivr and recorded in
the lock file (lock.json, with the license of each package) next to the downloaded files; license
texts are stored in licenses/.

Only the Python standard library is used.

Usage:
    python3 tools/vendor_esm.py vendor/codemirror.esm.json
"""
import fnmatch
import json
import pathlib
import re
import shutil
import sys
import urllib.error
from concurrent.futures import ThreadPoolExecutor
import urllib.request

CDN = "https://cdn.jsdelivr.net"
# /npm/<name>@<version>[/<subpath>]/+esm, where <name> may be scoped (@scope/name)
# the version is missing in some imports (then the latest version is used)
NPM_URL_RE = re.compile(r'"(/npm/((?:@[^/"@]+/)?[^/"@]+)(?:@([^/"]+))?((?:/[^"]*?)?)/\+esm)"')
LATEST = {}
EXCLUDED = set()
SOURCEMAP_RE = re.compile(r"^\s*//[#@] sourceMappingURL=.*$", re.M)
HEADER_RE = re.compile(r"\A/\*\*.*?\*/\s*", re.S)


def fetch(path):
    try:
        with urllib.request.urlopen(CDN + path, timeout=60) as response:
            return response.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{e.code} for {CDN + path}") from None


def version_key(version):
    return tuple(int(p) if p.isdigit() else 0 for p in re.split(r"[.+-]", version))


def resolve(name, version):
    """Resolve a partial version via jsDelivr's resolver API."""
    url = f"https://data.jsdelivr.com/v1/packages/npm/{name}/resolved?specifier={version}"
    with urllib.request.urlopen(url, timeout=60) as response:
        resolved = json.load(response).get("version")
    if not resolved:
        raise SystemExit(f"cannot resolve {name}@{version}")
    return resolved


def specifier(name, subpath):
    return name + subpath


def filename(spec):
    return re.sub(r"[^A-Za-z0-9._-]+", "__", spec.lstrip("@")) + ".js"


def discover(source, manifest, pinned, versions, sources):
    """Return the (name, subpath) imports of a module, raising package versions as needed."""
    found = []
    for _, dep, dep_version, dep_subpath in NPM_URL_RE.findall(source):
        if excluded(specifier(dep, dep_subpath), manifest):
            EXCLUDED.add(specifier(dep, dep_subpath))
            continue
        if not dep_version:
            if dep not in LATEST:
                LATEST[dep] = resolve(dep, "latest")
            dep_version = LATEST[dep]
        if dep not in pinned and (dep not in versions or version_key(dep_version) > version_key(versions[dep])):
            versions[dep] = dep_version
            # a newer version invalidates already fetched files of this package
            found.extend(k for k in sources if k[0] == dep)
        found.append((dep, dep_subpath))
    return found


def license_of(name, version):
    """Return (license from package.json, license text or None)."""
    meta = json.loads(fetch(f"/npm/{name}@{version}/package.json"))
    url = f"https://data.jsdelivr.com/v1/packages/npm/{name}@{version}?structure=flat"
    with urllib.request.urlopen(url, timeout=60) as response:
        files = [f["name"] for f in json.load(response)["files"]]
    candidates = sorted(f for f in files if f.count("/") == 1 and re.match(r"/(licen[cs]e|copying)", f, re.I))
    text = fetch(f"/npm/{name}@{version}{candidates[0]}") if candidates else None
    return meta.get("license", "UNKNOWN"), text


def excluded(spec, manifest):
    """Modules matching "exclude" (and not "include") are not vendored. Only use this for modules that
    are loaded with dynamic import() and not needed (e.g. hyphenation patterns of other languages):
    importing them fails at runtime."""
    if any(fnmatch.fnmatch(spec, p) for p in manifest.get("include", [])):
        return False
    return any(fnmatch.fnmatch(spec, p) for p in manifest.get("exclude", []))


def main():
    manifest_path = pathlib.Path(sys.argv[1]).resolve()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    out = (manifest_path.parent / manifest["out"]).resolve()
    pinned = {name: resolve(name, v) for name, v in manifest["packages"].items()}

    # Pass 1: discover the dependency graph and the highest requested version per package.
    versions = dict(pinned)
    sources = {}  # (name, subpath) -> source of the chosen version
    # packages without a main module (only subpath modules, e.g. @codemirror/legacy-modes)
    subpath_only = set(manifest.get("subpath_only", []))
    queue = [(name, "") for name in pinned if name not in subpath_only]
    for module in manifest.get("modules", []):  # explicit subpath modules, e.g. "pkg/locales/de-DE"
        parts = module.split("/")
        n = 2 if module.startswith("@") else 1
        name, subpath = "/".join(parts[:n]), "/" + "/".join(parts[n:])
        if name not in pinned:
            raise SystemExit(f"module {module}: package {name} must be listed in packages")
        queue.append((name, subpath))
    seen = set()
    with ThreadPoolExecutor(16) as pool:
        while queue:
            # fetch one level of the graph in parallel
            batch = []
            for name, subpath in queue:
                key = (name, subpath, versions[name])
                if key not in seen:
                    seen.add(key)
                    batch.append(key)
            queue = []
            fetched = pool.map(lambda k: (k, fetch(f"/npm/{k[0]}@{k[2]}{k[1]}/+esm")), batch)
            for (name, subpath, version), source in fetched:
                if version != versions[name]:
                    continue  # superseded by a newer version while this level was fetched
                sources[(name, subpath)] = (version, source)
                queue.extend(discover(source, manifest, pinned, versions, sources))

    # Pass 2: write the files with rewritten imports.
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.js"):
        old.unlink()
    if (out / "assets").exists():
        shutil.rmtree(out / "assets")
    imports, lock = {}, {}
    for (name, subpath), (version, source) in sorted(sources.items()):
        if version != versions[name]:
            raise SystemExit(f"internal error: stale version for {name}")
        spec = specifier(name, subpath)
        source = HEADER_RE.sub("", source)
        source = SOURCEMAP_RE.sub("", source).strip() + "\n"
        source = NPM_URL_RE.sub(lambda m: json.dumps(specifier(m.group(2), m.group(4))), source)
        for find, replace in manifest.get("patches", {}).get(spec, []):
            if source.count(find) != 1:
                raise SystemExit(f"patch for {spec} does not apply ({source.count(find)} matches): {find}")
            source = source.replace(find, replace)
        leftover = re.findall(r'["\'](/npm/[^"\']+)["\']', source)
        if leftover:
            raise SystemExit(f"unrewritten imports in {spec}: {leftover}")
        (out / filename(spec)).write_text(f"/* {name}@{version}{subpath} (jsDelivr +esm) */\n" + source, encoding="utf-8")
        imports[spec] = filename(spec)
        lock[name] = version
    for name, version in manifest.get("data_packages", {}).items():
        versions[name] = lock[name] = version
    licenses = out / "licenses"
    licenses.mkdir(exist_ok=True)
    for old in licenses.glob("*"):
        old.unlink()
    with ThreadPoolExecutor(16) as pool:
        results = dict(zip(lock, pool.map(lambda item: license_of(*item), lock.items())))
    for name, (license_name, license_text) in results.items():
        if license_text is None:
            print(f"warning: no license file found for {name}@{lock[name]} ({license_name})", file=sys.stderr)
        else:
            (licenses / (filename(name)[:-3] + ".LICENSE.txt")).write_text(license_text, encoding="utf-8")
        lock[name] = {"version": lock[name], "license": license_name}
    # stub modules for excluded specifiers, so that a dynamic import() of them does not fail
    stub = manifest.get("stub")
    if stub:
        for spec in sorted(EXCLUDED):
            m = re.match(stub["name"]["regex"], spec)
            name = m.group(1) if m else "stub"
            if stub["name"].get("pascal"):
                name = "".join(part[:1].upper() + part[1:] for part in name.split("-") if part)
            (out / filename(spec)).write_text(f"/* stub for excluded module {spec} */\n" + stub["template"].replace("{name}", name) + "\n", encoding="utf-8")
            imports[spec] = filename(spec)
    for name, files in manifest.get("assets", {}).items():
        for file in files:
            target = out / "assets" / name.lstrip("@").replace("/", "__") / file
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(fetch(f"/npm/{name}@{versions[name]}/{file}"), encoding="utf-8")
    (out / "importmap.json").write_text(json.dumps({"imports": imports}, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (out / "lock.json").write_text(json.dumps(dict(sorted(lock.items())), indent=2) + "\n", encoding="utf-8")
    size = sum(f.stat().st_size for f in out.glob("*.js"))
    print(f"vendored {len(imports)} modules from {len(lock)} packages into {out} ({size // 1024} KiB)")


if __name__ == "__main__":
    main()
