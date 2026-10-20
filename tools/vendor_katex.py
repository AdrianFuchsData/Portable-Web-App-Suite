#!/usr/bin/env python3
"""Vendor KaTeX (math typesetting for the web slides) into vendor/katex/ without node/npm.

Writes katex.min.js, auto-render.min.js (contrib) and katex.css, a copy of katex.min.css whose @font-face rules use
only the WOFF2 fonts, embedded as data: URLs, so that presentations work offline from a single file.

Usage:
    python3 tools/vendor_katex.py [version]
"""
import base64
import hashlib
import json
import pathlib
import re
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "vendor" / "katex"
VERSION = sys.argv[1] if len(sys.argv) > 1 else "0.16.22"
CDN = f"https://cdn.jsdelivr.net/npm/katex@{VERSION}"
SRC_RE = re.compile(r"src:([^;}]+)")
URL_RE = re.compile(r"url\((fonts/[^)]+\.woff2)\)\s*format\([\"']woff2[\"']\)")


def fetch(path):
    with urllib.request.urlopen(f"{CDN}/{path}", timeout=120) as response:
        return response.read()


def inline_fonts(css):
    def src(match):
        woff2 = URL_RE.search(match.group(1))
        if not woff2:
            return match.group(0)
        data = base64.b64encode(fetch(f"dist/{woff2.group(1)}")).decode("ascii")
        return f'src:url(data:font/woff2;base64,{data}) format("woff2")'
    return SRC_RE.sub(src, css)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    lock = {"package": "katex", "version": VERSION, "license": "MIT", "files": {}}
    files = {
        "katex.min.js": fetch("dist/katex.min.js"),
        "auto-render.min.js": fetch("dist/contrib/auto-render.min.js"),
        "katex.css": inline_fonts(fetch("dist/katex.min.css").decode("utf-8")).encode("utf-8"),
        "LICENSE": fetch("LICENSE"),
    }
    for name, data in files.items():
        (OUT / name).write_bytes(data)
        lock["files"][name] = hashlib.sha256(data).hexdigest()
    (OUT / "lock.json").write_text(json.dumps(lock, indent=2) + "\n")
    print(f"KaTeX {VERSION}: " + ", ".join(f"{n} {len(d) // 1024} KiB" for n, d in files.items()))


if __name__ == "__main__":
    main()
