#!/usr/bin/env python3
"""Bundle each app's src/index.html and everything it references into one self-contained HTML file.

Every directory with a src/index.html below apps/, prototypes/ or testbeds/ is built to dist/<dir name>.html.
In index.html:

* <link rel="stylesheet" href="...">            -> inline <style>
* <script src="..."></script>                     -> inline classic <script>
* <script type="module" src="..."></script>       -> inline <script type="module">
* <script type="importmap" data-src="a.json"></script>
                                                  -> import map. Each data-src (several can be given,
                                                     separated by spaces) is an import map whose values are
                                                     file paths relative to the JSON file. The modules are
                                                     embedded as text; a small script turns them into Blob
                                                     URLs and inserts the import map before any module runs
                                                     (CSP: script-src blob:). Browsers block external module
                                                     scripts on file:// but not Blob URLs, so ES-module
                                                     libraries work without a bundler (tools/vendor_esm.py).
                                                     data-mode="data" embeds data: URLs instead (slower).

* <script type="application/octet-stream" id="x" data-src="f.wasm"></script>
                                                  -> the file gzip-compressed and base64-encoded as the
                                                     element's text (unpack with DecompressionStream, see
                                                     shared/js/embed.js). For WASM and other binaries.
* <script type="application/octet-stream" data-bundle="bundle.json"></script>
                                                  -> every file listed in bundle.json ({"files": {name: path}})
                                                     as a gzip + base64 element with data-bundle-file="name",
                                                     plus the other keys of bundle.json as JSON (#bundle-meta).
* <script type="application/json" data-shortcuts="texteditor"></script>
                                                  -> the keyboard shortcuts of the app as JSON (#suite-shortcuts,
                                                     {"en": [...], "de": [...]}), taken from the section
                                                     "## Keyboard shortcuts" / "## Tastenkürzel" of
                                                     docs/<lang>/apps/<app>.md: rows "| `Ctrl+S` | Save |",
                                                     "### Group" headings start groups. Shown by the shell's ? dialog.
* <script type="text/plain" id="x" data-src="w.js"></script>
                                                  -> the file as text, e.g. worker code that is started
                                                     from a Blob URL (workers cannot be loaded from file://).

%%BUILD_VERSION%% is replaced by the content of the VERSION file. The build is reproducible: the same
sources always produce a byte-identical file. Only the Python standard library is used (no node/npm).

Usage:
    python3 build.py                 # build all apps and prototypes
    python3 build.py prototypes/x    # build only the given directories
    python3 build.py --check         # exit 1 if a built file is out of date
"""
import base64
import gzip
import hashlib
import json
import os
import pathlib
import re
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent
DIST = pathlib.Path(os.environ.get("SUITE_DIST", ROOT / "dist")).resolve()  # SUITE_DIST: build elsewhere (e.g. while tests use dist/)

LINK_RE = re.compile(r'<link\s+rel="stylesheet"\s+href="([^"]+)"\s*/?>')
SCRIPT_RE = re.compile(r'<script(\s+type="module")?\s+src="([^"]+)"\s*></script>')
IMPORTMAP_RE = re.compile(r'<script\s+type="importmap"\s+data-src="([^"]+)"(?:\s+data-mode="(data|blob)")?\s*></script>')
BUNDLE_RE = re.compile(r'<script\s+type="application/octet-stream"\s+data-bundle="([^"]+)"\s*></script>')
SHORTCUTS_RE = re.compile(r'<script\s+type="application/json"\s+data-shortcuts="([^"]+)"\s*></script>')
SHORTCUT_SECTIONS = {"en": "## Keyboard shortcuts", "de": "## Tastenkürzel"}
EMBED_RE = re.compile(r'<script\s+type="(application/octet-stream|text/plain)"\s+id="([^"]+)"\s+data-src="([^"]+)"\s*></script>')
SOURCEMAP_RE = re.compile(r"^\s*//[#@] sourceMappingURL=.*$|/\*[#@] sourceMappingURL=.*?\*/", re.M)


def resolve(base, href):
    path = (base / href).resolve()
    if ROOT not in path.parents:
        raise SystemExit(f"refusing to inline file outside the project: {href}")
    return path


def read_asset(base, href):
    return SOURCEMAP_RE.sub("", resolve(base, href).read_text(encoding="utf-8")).strip()


def escape_script(text):
    # A literal "</script" or "<!--" inside inline JS would end/confuse the HTML parser.
    text = re.sub(r"</(script)", r"<\\/\1", text, flags=re.I)
    return text.replace("<!--", "<\\!--")


def importmap(base, hrefs, mode="blob"):
    modules = {}
    for href in hrefs.split():
        path = resolve(base, href)
        for spec, file in json.loads(path.read_text(encoding="utf-8"))["imports"].items():
            if spec in modules:
                raise SystemExit(f"duplicate import map entry: {spec}")
            modules[spec] = SOURCEMAP_RE.sub("", resolve(path.parent, file).read_text(encoding="utf-8"))
    if mode == "data":
        imports = {spec: "data:text/javascript;base64," + base64.b64encode(code.encode("utf-8")).decode("ascii")
                   for spec, code in modules.items()}
        return '<script type="importmap">\n' + json.dumps({"imports": imports}, indent=1, sort_keys=True) + "\n</script>"
    # blob mode: module code as plain text elements; a classic script turns them into Blob URLs and
    # inserts the import map before any module script runs (faster than data: URLs, no base64 overhead)
    parts = [f'<script type="text/plain" data-module="{spec}">{escape_script(code)}</script>' for spec, code in sorted(modules.items())]
    parts.append("<script>" + BLOB_IMPORTMAP_LOADER + "</script>")
    return "\n".join(parts)


BLOB_IMPORTMAP_LOADER = """(function () {
  var imports = {};
  document.querySelectorAll('script[data-module]').forEach(function (el) {
    imports[el.dataset.module] = URL.createObjectURL(new Blob([el.textContent], { type: 'text/javascript' }));
    el.remove();
  });
  var map = document.createElement('script');
  map.type = 'importmap';
  map.textContent = JSON.stringify({ imports: imports });
  document.currentScript.after(map);
})();"""


def embed(base, kind, element_id, href):
    path = resolve(base, href)
    if kind == "text/plain":
        content = escape_script(SOURCEMAP_RE.sub("", path.read_text(encoding="utf-8")).strip())
    else:
        # mtime=0 keeps the output reproducible
        content = base64.b64encode(gzip.compress(path.read_bytes(), compresslevel=9, mtime=0)).decode("ascii")
    return f'<script type="{kind}" id="{element_id}">{content}</script>'


def bundle(base, href):
    """Embed all files listed in a bundle.json ({"files": {name: path}}) as gzip + base64 elements."""
    path = resolve(base, href)
    meta = json.loads(path.read_text(encoding="utf-8"))
    parts = [f'<script type="application/json" id="bundle-meta">{escape_script(json.dumps({k: v for k, v in meta.items() if k != "files"}))}</script>']
    for name, file in sorted(meta["files"].items()):
        src = resolve(path.parent, file)
        if src.is_relative_to(ROOT / "dist"):  # built apps come from SUITE_DIST if set
            src = DIST / src.relative_to(ROOT / "dist")
        data = src.read_bytes()
        content = base64.b64encode(gzip.compress(data, compresslevel=6, mtime=0)).decode("ascii")
        parts.append(f'<script type="application/octet-stream" data-bundle-file="{name}">{content}</script>')
    return "\n".join(parts)


# ---- licences: the suite's licence and the third-party components of each app (about dialog) ---------------------

COPYRIGHT = "© 2026 Adrian Fuchs"
SOURCE_URL = "https://software.adrianfuchs.at/local-tools/portable-web-app-suite/"
VENDOR = ROOT / "vendor"
VENDOR_REF_RE = re.compile(r'(?:\.\./)+vendor/([^"\s]+)')
SPDX = [("Apache-2.0", "Apache-2.0"), ("MPL-2.0", "MPL-2.0"), ("MPL-1.1", "MPL-1.1"), ("LGPL-2.1", "LGPL-2.1-only"), ("GPL-3.0", "GPL-3.0-only"),
        ("GPL-2.0", "GPL-2.0-only"), ("BSD-3-Clause", "BSD-3-Clause"), ("BSD-2-Clause", "BSD-2-Clause"), ("0BSD", "0BSD"), ("MIT-0", "MIT-0"),
        ("ISC", "ISC"), ("Zlib", "Zlib"), ("PSF-2.0", "PSF-2.0"), ("CC0-1.0", "CC0-1.0"), ("OFL-1.1", "OFL-1.1")]


def spdx_texts(expression):
    """Standard licence texts (vendor/licenses/spdx) for the identifiers in a licence expression."""
    expression = expression or ""
    files = [f"licenses/spdx/{name}.txt" for ident, name in SPDX if re.search(rf"(?<![\w-]){re.escape(ident)}(?![\w])", expression)]
    if re.search(r"(?<![\w-])MIT(?![\w-])", expression):
        files.append("licenses/spdx/MIT.txt")
    return files


def vendor_refs(project):
    refs = set(VENDOR_REF_RE.findall((project / "src" / "index.html").read_text(encoding="utf-8")))
    if project.name == "overview":  # embeds all apps
        for other in (ROOT / "apps").glob("*/src/index.html"):
            if other.parts[-3] != "overview":
                refs |= set(VENDOR_REF_RE.findall(other.read_text(encoding="utf-8")))
    return refs


def components(project):
    """Third-party components embedded in an app: [{name, version, license, files: [paths below vendor/ or (wheel, member)]}]."""
    refs = vendor_refs(project)
    out = []
    for d in sorted({r.split("/")[1] for r in refs if r.startswith("esm/")}):
        lock = json.loads((VENDOR / "esm" / d / "lock.json").read_text(encoding="utf-8"))
        for name, info in sorted(lock.items()):
            text = VENDOR / "esm" / d / "licenses" / (re.sub(r"[^A-Za-z0-9._-]+", "__", name.lstrip("@")) + ".LICENSE.txt")
            files = [str(text.relative_to(VENDOR))] if text.exists() else spdx_texts(info["license"])
            out.append({"name": name, "version": info["version"], "license": info["license"], "files": files})
    curated = json.loads((VENDOR / "components.json").read_text(encoding="utf-8"))
    for prefix, entries in curated.items():
        if not prefix.startswith("_") and any(r.startswith(prefix) for r in refs):
            for entry in entries:
                base = next((c for c in out if c["name"] == entry.get("extends")), None)
                if base is not None:  # more licence texts for a component of a lock file
                    base["license"] = entry.get("license", base["license"])
                    base["files"] = base["files"] + [f for f in entry["files"] if f not in base["files"]]
                else:
                    out.append(entry)
    if any(r.startswith("pyodide/") for r in refs):
        for wheel, info in sorted(json.loads((VENDOR / "pyodide" / "licenses.json").read_text(encoding="utf-8")).items()):
            if not wheel.endswith(".whl"):
                continue
            license_name = (info.get("license") or "").strip()
            if "\n" in license_name or len(license_name) > 60 or license_name.startswith("="):
                license_name = "see the licence text"
            members = [(wheel, m) for m in info.get("license_files", [])]
            out.append({"name": info["name"], "version": info["version"], "license": license_name or "see the licence text",
                        "files": members or spdx_texts(license_name)})
    seen, unique = set(), []
    for c in out:
        if (c["name"], c["version"]) not in seen:
            seen.add((c["name"], c["version"]))
            unique.append(c)
    return unique


def licence_text(source):
    if isinstance(source, (tuple, list)):
        with zipfile.ZipFile(VENDOR / "pyodide" / source[0]) as z:
            return z.read(source[1]).decode("utf-8", "replace")
    return (VENDOR / source).read_text(encoding="utf-8", errors="replace")


def modified():
    """First line of the file MODIFIED (a modified version must say so visibly, see NOTICE.md), or None.
    SUITE_MODIFIED_FILE names another file (used by the tests)."""
    path = pathlib.Path(os.environ.get("SUITE_MODIFIED_FILE", ROOT / "MODIFIED"))
    if not path.exists():
        return None
    line = next((l.strip() for l in path.read_text(encoding="utf-8").splitlines() if l.strip()), "")
    return line or "Modified version"


def about(project):
    """#suite-about (shown at once) and #suite-licenses (gzip + base64 JSON, decoded when the licence section is opened)."""
    notice = (ROOT / "NOTICE.md").read_text(encoding="utf-8")
    english, german = notice.split("\n## Deutsch\n", 1)
    english = english.split("\n## English\n", 1)[1]
    texts, comps = {}, []
    for c in components(project):
        ids = []
        for source in c["files"]:
            text = licence_text(source).strip()
            key = hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]
            texts.setdefault(key, text)
            ids.append(key)
        comps.append({"name": c["name"], "version": c["version"], "license": c["license"], "texts": ids})
    data = {"license": {"en": (ROOT / "LICENSE").read_text(encoding="utf-8"), "de": (ROOT / "LICENSE-de.txt").read_text(encoding="utf-8")},
            "notice": {"en": english.strip(), "de": german.strip()}, "components": comps, "texts": texts}
    packed = base64.b64encode(gzip.compress(json.dumps(data, ensure_ascii=False, sort_keys=True).encode("utf-8"), compresslevel=9, mtime=0)).decode("ascii")
    head = {"copyright": COPYRIGHT, "license": "EUPL-1.2", "source": SOURCE_URL, "version": version(), "modified": modified(), "components": len(comps)}
    return (f'<script type="application/json" id="suite-about">{escape_script(json.dumps(head, ensure_ascii=False))}</script>\n'
            f'<script type="application/octet-stream" id="suite-licenses">{packed}</script>\n')


def version():
    path = ROOT / "VERSION"
    return path.read_text(encoding="utf-8").strip() if path.exists() else "0.0.0-dev"


def shortcuts(app):
    """Keyboard shortcuts of an app from its user documentation: {lang: [{"group", "keys": [[...]], "text"}]}."""
    out = {}
    for lang, heading in SHORTCUT_SECTIONS.items():
        path = ROOT / "docs" / lang / "apps" / f"{app}.md"
        rows, group, inside = [], "", False
        for line in path.read_text(encoding="utf-8").splitlines() if path.exists() else []:
            if line.startswith("## "):
                inside = line.strip() == heading
                continue
            if not inside:
                continue
            if line.startswith("### "):
                group = line[4:].strip()
            elif line.startswith("|") and "`" in line:
                cells = [c.strip() for c in line.strip().strip("|").split("|")]
                # alternatives are separated by commas outside the backticks; each alternative is one `combination`
                keys = re.findall(r"`([^`]+)`", cells[0])
                text = re.sub(r"`([^`]+)`", r"\1", re.sub(r"\*\*([^*]+)\*\*", r"\1", " | ".join(cells[1:]))).strip()
                if keys and text:
                    rows.append({"group": group, "keys": keys, "text": text})
        out[lang] = rows
    if not any(out.values()):
        raise SystemExit(f"no keyboard shortcuts documented for {app} (docs/*/apps/{app}.md)")
    return '<script type="application/json" id="suite-shortcuts">' + escape_script(json.dumps(out, ensure_ascii=False, separators=(",", ":"))) + "</script>"


def build(project):
    source = project / "src" / "index.html"
    base = source.parent
    html = source.read_text(encoding="utf-8")
    # (before inlining: inlined code may contain "</head>" in strings)
    html = html.replace("</head>", about(project) + "</head>", 1)
    html = LINK_RE.sub(lambda m: "<style>\n" + read_asset(base, m.group(1)) + "\n</style>", html)
    html = IMPORTMAP_RE.sub(lambda m: importmap(base, m.group(1), m.group(2) or "blob"), html)
    html = EMBED_RE.sub(lambda m: embed(base, *m.groups()), html)
    html = SHORTCUTS_RE.sub(lambda m: shortcuts(m.group(1)), html)
    html = BUNDLE_RE.sub(lambda m: bundle(base, m.group(1)), html)
    html = SCRIPT_RE.sub(
        lambda m: f"<!-- {m.group(2).split('/')[-1]} -->\n<script{m.group(1) or ''}>\n"
        + escape_script(read_asset(base, m.group(2))) + "\n</script>", html)
    leftover = [r for r in re.findall(r'<(?:script|link)[^>]+(?:src|href)="([^"]+)"', html) if not r.startswith("data:")]
    if leftover:
        raise SystemExit(f"{project.name}: unbundled references left: {leftover}")
    return html.replace("%%BUILD_VERSION%%", version())


def projects(args):
    if args:
        return [(ROOT / a).resolve() for a in args]
    found = [p.parent.parent for p in ROOT.glob("*/*/src/index.html") if p.parts[-4] in ("apps", "prototypes", "testbeds")]
    # the overview embeds the other built apps (dist/*.html), so it is built last
    return sorted(found, key=lambda p: (p.name == "overview", p))


def shown(path):
    return path.relative_to(ROOT) if path.is_relative_to(ROOT) else path


def main():
    check = "--check" in sys.argv
    status = 0
    for project in projects([a for a in sys.argv[1:] if not a.startswith("--")]):
        html = build(project)
        target = DIST / f"{project.name}.html"
        if check:
            if not target.exists() or target.read_text(encoding="utf-8") != html:
                print(f"{shown(target)} is out of date, run: python3 build.py")
                status = 1
            continue
        DIST.mkdir(exist_ok=True)
        target.write_text(html, encoding="utf-8")
        print(f"wrote {shown(target)} ({len(html.encode()) // 1024} KiB)")
    return status


if __name__ == "__main__":
    sys.exit(main())
