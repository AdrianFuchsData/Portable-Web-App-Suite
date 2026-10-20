#!/usr/bin/env python3
"""Vendor reveal.js (classic UMD builds, stylesheets, themes) into vendor/reveal/ without node/npm.

The themes of reveal.js embed their fonts as data: URLs (about 0.5 MB per theme). This script moves every @font-face
rule into vendor/reveal/fonts/<family>.css (each font stored once) and writes the themes without them, plus
themes.json: {theme: [font files]} so that apps can add the fonts a theme needs.

Usage:
    python3 tools/vendor_reveal.py [version]
"""
import hashlib
import json
import pathlib
import re
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "vendor" / "reveal"
VERSION = sys.argv[1] if len(sys.argv) > 1 else "6.0.2"
CDN = f"https://cdn.jsdelivr.net/npm/reveal.js@{VERSION}"
SCRIPTS = ["reveal.js", "plugin/highlight.js", "plugin/markdown.js", "plugin/notes.js", "plugin/zoom.js", "plugin/search.js"]
STYLES = ["reveal.css", "reset.css", "plugin/highlight/monokai.css", "plugin/highlight/zenburn.css"]
THEMES = ["black", "white", "league", "beige", "night", "serif", "simple", "sky", "solarized", "moon", "dracula", "blood",
          "black-contrast", "white-contrast"]
FONT_FACE_RE = re.compile(r"@font-face\s*\{[^}]*\}")
FAMILY_RE = re.compile(r"font-family\s*:\s*([^;}]+)")


def fetch(path):
    with urllib.request.urlopen(f"{CDN}/{path}", timeout=120) as response:
        return response.read()


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "plugin").mkdir(exist_ok=True)
    (OUT / "theme").mkdir(exist_ok=True)
    (OUT / "fonts").mkdir(exist_ok=True)
    lock = {"package": "reveal.js", "version": VERSION, "license": "MIT", "files": {}}
    for name in SCRIPTS + STYLES:
        data = fetch(f"dist/{name}")
        target = OUT / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        lock["files"][name] = hashlib.sha256(data).hexdigest()
    fonts = {}  # digest -> file name
    themes = {}
    for theme in THEMES:
        css = fetch(f"dist/theme/{theme}.css").decode("utf-8")
        used = []
        for rule in FONT_FACE_RE.findall(css):
            digest = hashlib.sha256(rule.encode()).hexdigest()[:12]
            if digest not in fonts:
                family = slug(FAMILY_RE.search(rule).group(1).strip("'\" ")) if FAMILY_RE.search(rule) else "font"
                fonts[digest] = f"{family}-{digest}.css"
                (OUT / "fonts" / fonts[digest]).write_text(rule + "\n", encoding="utf-8")
            if fonts[digest] not in used:
                used.append(fonts[digest])
        stripped = FONT_FACE_RE.sub("", css)
        # imports of web fonts (Google Fonts) cannot load offline; the themes fall back to their next font
        stripped = re.sub(r"@import\s+(?:url\([^)]*\)|\"[^\"]*\"|'[^']*')[^;]*;?", "", stripped)
        (OUT / "theme" / f"{theme}.css").write_text(stripped, encoding="utf-8")
        themes[theme] = used
        lock["files"][f"theme/{theme}.css"] = hashlib.sha256(css.encode()).hexdigest()
    (OUT / "themes.json").write_text(json.dumps(themes, indent=1) + "\n", encoding="utf-8")
    (OUT / "LICENSE").write_bytes(fetch("LICENSE"))
    (OUT / "lock.json").write_text(json.dumps(lock, indent=1) + "\n", encoding="utf-8")
    print(f"reveal.js {VERSION}: {len(SCRIPTS + STYLES)} files, {len(THEMES)} themes, {len(fonts)} fonts -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
