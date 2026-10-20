#!/usr/bin/env python3
"""Vendor libarchive.js (libarchive compiled to WebAssembly) into vendor/libarchive/ without node/npm.

The archive manager uses it to read 7z, RAR (4 and 5), XZ, BZip2, LZMA, ISO, CAB and further formats and to write 7z.
Files: libarchive.js (ES module, the API; comlink is bundled), worker-bundle.js (the module worker with the Emscripten
glue), libarchive.wasm, and the licence texts (libarchive.js: MIT, libarchive: BSD 2-clause, comlink: Apache-2.0).
The archive manager embeds the worker as text and the wasm as binary and starts the worker from Blob URLs (see
apps/archive/src/js/libarchive.js), because a page opened from file:// cannot load workers or wasm by URL.

Usage:
    python3 tools/vendor_libarchive.py [version]
"""
import hashlib
import json
import pathlib
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "vendor" / "libarchive"
VERSION = sys.argv[1] if len(sys.argv) > 1 else "2.0.2"
CDN = f"https://cdn.jsdelivr.net/npm/libarchive.js@{VERSION}"
LICENSES = {
    "LICENSE": f"{CDN}/LICENSE",
    "LICENSE.libarchive": "https://raw.githubusercontent.com/libarchive/libarchive/v3.7.2/COPYING",
    "LICENSE.comlink": "https://raw.githubusercontent.com/GoogleChromeLabs/comlink/v4.4.1/LICENSE",
}


def fetch(url):
    with urllib.request.urlopen(url, timeout=120) as response:
        return response.read()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    lock = {"package": "libarchive.js", "version": VERSION, "license": "MIT (libarchive: BSD-2-Clause, comlink: Apache-2.0)", "files": {}}
    files = {name: fetch(f"{CDN}/dist/{name}") for name in ("libarchive.js", "worker-bundle.js", "libarchive.wasm")}
    files.update({name: fetch(url) for name, url in LICENSES.items()})
    for name, data in files.items():
        (OUT / name).write_bytes(data)
        lock["files"][name] = hashlib.sha256(data).hexdigest()
    (OUT / "lock.json").write_text(json.dumps(lock, indent=2) + "\n")
    (OUT / "importmap.json").write_text(json.dumps({"imports": {"libarchive.js": "libarchive.js"}}, indent=2) + "\n")
    print(f"libarchive.js {VERSION}: " + ", ".join(f"{n} {len(d) // 1024} KiB" for n, d in files.items()))


if __name__ == "__main__":
    main()
