#!/usr/bin/env python3
"""Download Pyodide and a set of Python packages for the Python notebook, without node/npm.

Reads a manifest (vendor/pyodide.json):

    {"version": "314.0.7", "out": "pyodide",
     "packages": ["numpy", "pandas", "matplotlib"],      # from the Pyodide distribution (+ dependencies)
     "preload": ["numpy", "pandas", "matplotlib"],      # loaded in the background after start-up
     "pypi": ["seaborn==0.13.2",                          # pure-Python wheels (py3-none-any) from PyPI,
              {"requirement": "pykeepass==4.2.0", "depends": ["lxml"]}]}   # with dependencies (lock names)

and writes to vendor/<out>/ (git-ignored, the files are large):

* the Pyodide core (pyodide.mjs, pyodide.asm.mjs, pyodide.asm.wasm, python_stdlib.zip), plus the two
  modules converted to classic scripts (*.classic.js, see to_classic()),
* the package wheels (with all dependencies from pyodide-lock.json), checked against their SHA-256,
* pyodide-lock.json reduced to the vendored packages,
* bundle.json (file name -> path, embedded into the HTML by build.py),
* licenses.json (license metadata of every wheel).

vendor/pyodide.lock.json (committed) records the SHA-256 of every downloaded file; later runs verify
the downloads against it, so the vendored files are reproducible. Only the Python standard library.

Usage:
    python3 tools/vendor_pyodide.py vendor/pyodide.json
"""
import email.parser
import hashlib
import io
import json
import re
import pathlib
import sys
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parent.parent
CORE = ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip"]


def fetch(url):
    with urllib.request.urlopen(url, timeout=300) as response:
        return response.read()


def closure(packages, wanted):
    seen = []
    stack = list(wanted)
    while stack:
        name = stack.pop()
        if name in seen:
            continue
        if name not in packages:
            raise SystemExit(f"package not in the Pyodide distribution: {name}")
        seen.append(name)
        stack.extend(packages[name].get("depends", []))
    return sorted(seen)


def pypi_wheel(entry):
    """entry: "name==version" or {"requirement": "name==version", "depends": [...]} (depends: lock names)."""
    requirement = entry if isinstance(entry, str) else entry["requirement"]
    depends = [] if isinstance(entry, str) else entry.get("depends", [])
    name, _, version = requirement.partition("==")
    info = json.loads(fetch(f"https://pypi.org/pypi/{name}/{version + '/' if version else ''}json"))
    wheels = [f for f in info["urls"] if f["packagetype"] == "bdist_wheel" and re.search(r"-(py2\.)?py3-none-any\.whl$", f["filename"])]
    if not wheels:
        raise SystemExit(f"no pure-Python wheel on PyPI for {requirement}")
    w = wheels[0]
    return {"name": canonical(info["info"]["name"]), "version": info["info"]["version"], "file_name": w["filename"], "url": w["url"],
            "sha256": w["digests"]["sha256"], "depends": [canonical(d) for d in depends]}


def canonical(name):
    return re.sub(r"[-_.]+", "-", name).lower()


def top_level_imports(data):
    """Importable top-level names of a wheel (top_level.txt, else derived from the file list)."""
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        names = z.namelist()
        top = next((n for n in names if n.endswith(".dist-info/top_level.txt")), None)
        if top:
            return sorted({line.strip() for line in z.read(top).decode().splitlines() if line.strip()})
        result = set()
        for n in names:
            first = n.split("/")[0]
            if first.endswith((".dist-info", ".data")):
                continue
            result.add(first[:-3] if first.endswith(".py") and "/" not in n else first)
        return sorted(r for r in result if r.isidentifier())


def wheel_license(data):
    """License information from a wheel's METADATA."""
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        meta_name = next((n for n in z.namelist() if n.endswith(".dist-info/METADATA")), None)
        if not meta_name:
            return None
        meta = email.parser.Parser().parsestr(z.read(meta_name).decode("utf-8", "replace"), headersonly=True)
        classifiers = [c.split(" :: ")[-1] for c in meta.get_all("Classifier", []) if c.startswith("License ::")]
        license_text = meta.get("License-Expression") or (meta.get("License") or "").splitlines()[0:1]
        return {"name": meta.get("Name"), "version": meta.get("Version"),
                "license": license_text if isinstance(license_text, str) else (license_text[0] if license_text else None),
                "classifiers": classifiers,
                "license_files": [n for n in z.namelist() if "/licenses/" in n or n.split("/")[-1].upper().startswith(("LICENSE", "COPYING", "LICENCE"))][:10]}


def to_classic(source, name):
    """Turn one of Pyodide's ES modules into a classic script that defines globals.

    Workers on file:// pages cannot load ES modules (neither module workers nor import() or importScripts()
    of Blob URLs work), so the notebook concatenates these classic scripts into its worker script.
    """
    source = re.sub(r"^\s*//# sourceMappingURL=.*$", "", source, flags=re.M)
    source = source.replace("import.meta.url", json.dumps(f"https://pyodide.invalid/{name}"))
    # Pyodide refuses to run in classic workers (it detects them with importScripts("data:...")); the
    # converted scripts work there, so report "not a classic worker"
    source = source.replace('return globalThis.importScripts("data:text/javascript,"),!0', "return!1")
    m = re.search(r"export\s*\{([^}]*)\};?\s*$", source)
    if m:
        pairs = [p.strip().split(" as ") for p in m.group(1).split(",") if p.strip()]
        assign = "".join(f"self.{(p[1] if len(p) > 1 else p[0]).strip()}={p[0].strip()};" for p in pairs)
        return "(function(){" + source[:m.start()] + assign + "})();\n"
    m = re.search(r"export\s+default\s+([A-Za-z_$][\w$]*);?\s*$", source)
    if m:
        return "(function(){" + source[:m.start()] + f"self.{m.group(1)}={m.group(1)};" + "})();\n"
    raise SystemExit(f"cannot convert {name} to a classic script")


def main():
    manifest_path = pathlib.Path(sys.argv[1]).resolve()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    version = manifest["version"]
    base = f"https://cdn.jsdelivr.net/pyodide/v{version}/full/"
    out = (manifest_path.parent / manifest["out"]).resolve()
    out.mkdir(parents=True, exist_ok=True)
    lock_path = manifest_path.with_suffix(".lock.json")
    known = json.loads(lock_path.read_text(encoding="utf-8")) if lock_path.exists() else {}
    if known.get("version") != version:
        known = {}

    lock = json.loads(fetch(base + "pyodide-lock.json"))
    names = closure(lock["packages"], manifest.get("packages", []))
    downloads = [(f, base + f, None) for f in CORE]
    downloads += [(lock["packages"][n]["file_name"], base + lock["packages"][n]["file_name"], lock["packages"][n]["sha256"]) for n in names]
    extra = [pypi_wheel(r) for r in manifest.get("pypi", [])]
    downloads += [(w["file_name"], w["url"], w["sha256"]) for w in extra]

    def download(item):
        name, url, sha = item
        target = out / name
        data = target.read_bytes() if target.exists() else fetch(url)
        digest = hashlib.sha256(data).hexdigest()
        if sha and digest != sha:
            raise SystemExit(f"checksum mismatch for {name}")
        if name in known.get("files", {}) and known["files"][name] != digest:
            raise SystemExit(f"{name} differs from the recorded checksum in {lock_path.name}")
        target.write_bytes(data)
        return name, digest, data

    with ThreadPoolExecutor(8) as pool:
        results = list(pool.map(download, downloads))

    wanted = {name for name, _, _ in results}
    for old in out.iterdir():
        if old.is_file() and old.name not in wanted | {"pyodide-lock.json", "bundle.json", "licenses.json", "pyodide.classic.js", "pyodide.asm.classic.js"}:
            old.unlink()
    classic = {}
    for name in ("pyodide.mjs", "pyodide.asm.mjs"):
        target = name.replace(".mjs", ".classic.js")
        (out / target).write_text(to_classic((out / name).read_text(encoding="utf-8"), name), encoding="utf-8")
        classic[name] = target
    packages = {n: lock["packages"][n] for n in names}
    # PyPI wheels become lock entries, so that Pyodide loads them (and their dependencies) on import
    data_of = {name: data for name, _, data in results}
    for w in extra:
        missing = [d for d in w["depends"] if d not in packages and d not in {e["name"] for e in extra}]
        if missing:
            raise SystemExit(f"{w['name']}: dependencies not in the bundle: {missing}")
        packages[w["name"]] = {"name": w["name"], "version": w["version"], "file_name": w["file_name"], "install_dir": "site",
                               "sha256": w["sha256"], "package_type": "package", "imports": top_level_imports(data_of[w["file_name"]]),
                               "depends": w["depends"], "unvendored_tests": False}
    reduced = dict(lock, packages=packages)
    (out / "pyodide-lock.json").write_text(json.dumps(reduced, indent=1), encoding="utf-8")
    bundle = {name: name for name, _, _ in results if name not in classic}
    bundle.update({target: target for target in classic.values()})
    bundle["pyodide-lock.json"] = "pyodide-lock.json"
    (out / "bundle.json").write_text(json.dumps({"files": bundle, "packages": sorted(packages), "preload": closure(lock["packages"], manifest.get("preload", [])),
                                                  "wheels": []}, indent=1), encoding="utf-8")
    licenses = {name: wheel_license(data) for name, _, data in results if name.endswith(".whl")}
    licenses["pyodide"] = {"license": "MPL-2.0", "note": "Pyodide runtime; includes CPython (PSF-2.0) and the Python standard library"}
    (out / "licenses.json").write_text(json.dumps(licenses, indent=1), encoding="utf-8")
    files = {name: digest for name, digest, _ in results}
    lock_path.write_text(json.dumps({"version": version, "files": dict(sorted(files.items()))}, indent=1) + "\n", encoding="utf-8")

    sizes = sorted(((len(data), name) for name, _, data in results), reverse=True)
    total = sum(s for s, _ in sizes)
    print(f"Pyodide {version}: {len(names)} packages + {len(extra)} PyPI wheels, {total / 1048576:.1f} MiB in {out}")
    for size, name in sizes[:12]:
        print(f"  {size / 1048576:6.1f} MiB  {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
