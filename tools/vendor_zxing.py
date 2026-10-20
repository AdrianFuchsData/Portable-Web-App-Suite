#!/usr/bin/env python3
"""Vendor zxing-wasm (ZXing-C++ as WebAssembly: barcode reading and writing) into vendor/zxing/ without node/npm.

Downloads the npm tarball, keeps the ES module build of the "full" variant (reader and writer) and its shared chunk,
rewrites the relative import to a bare specifier ("zxing-wasm/share") for the import map, and stores the WebAssembly
file, which the app embeds and passes as wasmBinary (zxing-wasm would otherwise fetch it from a CDN).

Usage:
    python3 tools/vendor_zxing.py [version]
"""
import hashlib
import io
import json
import pathlib
import sys
import tarfile
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "vendor" / "zxing"
VERSION = sys.argv[1] if len(sys.argv) > 1 else "3.1.5"


def main():
    url = f"https://registry.npmjs.org/zxing-wasm/-/zxing-wasm-{VERSION}.tgz"
    with urllib.request.urlopen(url, timeout=120) as response:
        tgz = tarfile.open(fileobj=io.BytesIO(response.read()), mode="r:gz")
    files = {m.name: tgz.extractfile(m).read() for m in tgz.getmembers() if m.isfile()}
    OUT.mkdir(parents=True, exist_ok=True)
    share = files["package/dist/es/share.js"].decode("utf-8")
    full = files["package/dist/es/full/index.js"].decode("utf-8").replace('from "../share.js"', 'from "zxing-wasm/share"')
    assert 'from "zxing-wasm/share"' in full, "import of the shared chunk not found"
    outputs = {
        "zxing.js": full.encode("utf-8"),
        "share.js": share.encode("utf-8"),
        "zxing_full.wasm": files["package/dist/full/zxing_full.wasm"],
        "LICENSE": files["package/LICENSE"],
    }
    for name, data in outputs.items():
        (OUT / name).write_bytes(data)
    (OUT / "importmap.json").write_text(json.dumps({"imports": {"zxing-wasm": "zxing.js", "zxing-wasm/share": "share.js"}}, indent=2) + "\n")
    lock = {"package": "zxing-wasm", "version": VERSION, "license": "MIT (zxing-wasm), Apache-2.0 (ZXing-C++ in the WebAssembly)",
            "files": {name: hashlib.sha256(data).hexdigest() for name, data in outputs.items()}}
    (OUT / "lock.json").write_text(json.dumps(lock, indent=1) + "\n")
    print(f"zxing-wasm {VERSION}: {', '.join(f'{n} ({len(d) // 1024} KiB)' for n, d in outputs.items())} -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
