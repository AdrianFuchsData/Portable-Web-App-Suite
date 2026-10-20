#!/usr/bin/env python3
"""Vendor PDF.js (pdfjs-dist) for the PDF viewer, without node/npm.

Writes vendor/pdfjs/:
* pdf.min.mjs, pdf_viewer.mjs        ES modules (import map: importmap.json, "pdfjs-dist", "pdfjs-dist/web/pdf_viewer")
* pdf.worker.classic.js              the worker converted to a classic script (workers cannot load ES modules on file://)
* pdf_viewer.css                     with the referenced images inlined as data: URLs
* cmaps/, standard_fonts/, wasm/     data that PDF.js loads on demand; bundle.json lists them for build.py (data-bundle)
* LICENSE*, version.json

Only the Python standard library is used.

Usage:
    python3 tools/vendor_pdfjs.py 6.4.299
"""
import base64
import json
import mimetypes
import pathlib
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "vendor" / "pdfjs"


def fetch(url):
    with urllib.request.urlopen(url, timeout=120) as response:
        return response.read()


def to_classic(source):
    """pdf.worker.min.mjs -> classic script (ends with export{...}; uses import.meta.url)."""
    source = source.replace("import.meta.url", '"https://pdfjs.invalid/pdf.worker.mjs"')
    m = re.search(r"export\s*\{([^}]*)\};?\s*$", source)
    if not m:
        raise SystemExit("unexpected end of pdf.worker.min.mjs")
    return "(function(){" + source[:m.start()] + "})();\n"


def main():
    version = sys.argv[1] if len(sys.argv) > 1 else json.loads(fetch("https://data.jsdelivr.com/v1/packages/npm/pdfjs-dist/resolved?specifier=latest"))["version"]
    base = f"https://cdn.jsdelivr.net/npm/pdfjs-dist@{version}/"
    listing = json.loads(fetch(f"https://data.jsdelivr.com/v1/packages/npm/pdfjs-dist@{version}?structure=flat"))
    names = [f["name"].lstrip("/") for f in listing["files"]]
    data_files = [n for n in names if n.startswith(("cmaps/", "standard_fonts/")) and not n.endswith(("LICENSE", ".md"))]
    data_files += [f"wasm/{n}" for n in ("openjpeg.wasm", "jbig2.wasm", "qcms_bg.wasm")]
    licenses = ["LICENSE", "wasm/LICENSE_OPENJPEG", "wasm/LICENSE_JBIG2", "wasm/LICENSE_QCMS", "standard_fonts/LICENSE_FOXIT", "standard_fonts/LICENSE_LIBERATION"]
    licenses = [n for n in licenses if n in names]

    OUT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(12) as pool:
        files = dict(zip(data_files + licenses, pool.map(lambda n: fetch(base + n), data_files + licenses)))
    for name, data in files.items():
        target = OUT / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

    (OUT / "pdf.min.mjs").write_bytes(fetch(base + "build/pdf.min.mjs"))
    viewer = fetch(base + "web/pdf_viewer.mjs").decode("utf-8")
    viewer = re.sub(r"^//# sourceMappingURL=.*$", "", viewer, flags=re.M)
    (OUT / "pdf_viewer.mjs").write_text(viewer, encoding="utf-8")
    worker = fetch(base + "build/pdf.worker.min.mjs").decode("utf-8")
    (OUT / "pdf.worker.classic.js").write_text(to_classic(worker), encoding="utf-8")

    css = fetch(base + "web/pdf_viewer.css").decode("utf-8")

    def inline(m):
        ref = m.group(2)
        if ref.startswith(("data:", "#")):
            return m.group(0)
        data = fetch(base + "web/" + ref)
        mime = mimetypes.guess_type(ref)[0] or "application/octet-stream"
        return f'url("data:{mime};base64,{base64.b64encode(data).decode()}")'
    css = re.sub(r"""url\((["']?)([^)"']+)\1\)""", inline, css)
    (OUT / "pdf_viewer.css").write_text(css, encoding="utf-8")

    (OUT / "importmap.json").write_text(json.dumps({"imports": {"pdfjs-dist": "pdf.min.mjs", "pdfjs-dist/web/pdf_viewer": "pdf_viewer.mjs"}}, indent=2) + "\n", encoding="utf-8")
    (OUT / "bundle.json").write_text(json.dumps({"files": {n: n for n in sorted(data_files)}}, indent=1) + "\n", encoding="utf-8")
    (OUT / "version.json").write_text(json.dumps({"pdfjs-dist": version, "license": "Apache-2.0"}, indent=2) + "\n", encoding="utf-8")
    size = sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file())
    print(f"PDF.js {version}: {len(data_files)} data files, {size // 1024} KiB in {OUT}")


if __name__ == "__main__":
    main()
