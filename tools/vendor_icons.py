#!/usr/bin/env python3
"""Vendor the suite's icons: a chosen set of Lucide icons (lucide-static, ISC licence) from the npm registry.

Writes vendor/icons/:
  icons.json    {name: inner SVG markup (the <path>/<circle>/… elements of the 24×24 icon)}, read by shared/js/icons.js
  LICENSE.txt   Lucide's licence (ISC; parts derived from Feather, MIT)
  lock.json     package, version and the SHA-512 of the downloaded package

The icons are the values of tools/icon_symbols.py SYMBOLS (the symbols the user interface replaced) plus EXTRA below (icons the
code names directly). Only the Python standard library is used; the package is checked against its npm integrity value.

Usage:
    python3 tools/vendor_icons.py
"""
import base64
import hashlib
import io
import json
import pathlib
import re
import sys
import tarfile
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "vendor" / "icons"
PACKAGE, VERSION = "lucide-static", "1.70.0"
INTEGRITY = "sha512-A9UgY98g94IuHQY7rl7/AFwHX7T1qNpzryim+Kw5CGhdV2STobtBY+ib/Z44ohyqXEJB88gvXFAeJ87uOOHKLw=="
URL = f"https://registry.npmjs.org/{PACKAGE}/-/{PACKAGE}-{VERSION}.tgz"

# icons used by name in the code (Suite.icon('…')) besides the replaced symbols
EXTRA = [
    "arrow-up", "arrow-down", "arrow-left", "arrow-right", "arrow-big-left", "chevron-up", "chevron-left", "chevron-right", "chevron-down",
    "panel-top-close", "panel-top-open", "ellipsis", "plus", "minus", "zoom-in", "zoom-out", "case-sensitive", "regex", "whole-word",
    "text-select", "replace", "replace-all", "import", "reply", "reply-all", "flip-horizontal-2", "flip-vertical-2",
    "align-horizontal-justify-start", "align-horizontal-justify-center", "align-horizontal-justify-end",
    "align-vertical-justify-start", "align-vertical-justify-center", "align-vertical-justify-end",
    "align-horizontal-distribute-center", "align-vertical-distribute-center", "group", "ungroup", "square-check", "list-checks",
    "rotate-ccw", "history", "info", "circle-help", "languages", "house", "app-window", "layout-grid", "file-text", "file-plus",
    "folder-plus", "file-code", "terminal", "table", "presentation", "file-spreadsheet", "file-archive", "binary", "music", "video",
    "audio-lines", "shapes", "image", "receipt", "kanban", "mail", "database", "server", "globe", "scan-search", "qr-code",
    "shield-check", "notebook-pen", "book-open", "send", "inbox", "star", "flag", "tag", "filter", "list", "list-tree", "sliders-horizontal",
    "circle-plus", "circle-minus", "square-plus", "copy-plus", "clipboard-paste", "type", "bold", "italic", "underline", "strikethrough",
    "text-cursor-input", "layers", "bring-to-front", "send-to-back", "crop", "pipette", "eraser", "hand", "mouse-pointer-2", "lasso",
    "square-dashed-mouse-pointer", "wand-sparkles", "move", "spline", "pen-tool", "minus", "highlighter", "sticky-note", "message-square-text",
    "volume-2", "volume-x", "mic", "radio", "waves", "activity", "gauge", "timer", "alarm-clock", "calendar-days", "calendar-plus",
    "list-todo", "contact", "users", "user-plus", "at-sign", "paperclip", "forward", "archive", "archive-restore", "file-down", "file-up",
    "hard-drive", "cloud-upload", "cloud-download", "plug", "unplug", "cable", "router", "wifi", "key-square", "fingerprint",
    "bookmark", "bookmark-plus", "corner-down-left", "split", "merge", "git-compare", "diff", "code", "braces", "brackets", "wrap-text",
    "pilcrow", "indent-increase", "indent-decrease", "list-ordered", "heading", "link-2", "unlink", "maximize", "minimize", "fullscreen",
    "picture-in-picture-2", "monitor-play", "captions", "subtitles", "gallery-vertical", "scissors", "slice", "combine", "blend",
    "sun-moon", "eye", "eye-off", "printer", "share-2", "external-link", "log-out", "power", "refresh-ccw", "loader", "badge-check",
]


# icon names written in the code: Suite.icon('name'), Suite.icons.svg('name'), icon('name', …) (cm-search.js), { icon: 'name' } (app lists,
# tool lists) and the icon tables (… _ICON = { key: 'name' })
USED = [re.compile(r"""\b(?:Suite\.icon|icons\.svg|icon)\(\s*'([a-z0-9-]+)'"""), re.compile(r"""\bicon: '([a-z0-9-]+)'"""),
        re.compile(r"""_ICON = \{([^}]*)\}""")]


def used_names():
    names = set()
    for path in list((ROOT / "apps").glob("*/src/js/*.js")) + list((ROOT / "shared" / "js").glob("*.js")):
        text = path.read_text(encoding="utf-8")
        for rx in USED[:2]:
            names.update(rx.findall(text))
        for table in USED[2].findall(text):
            names.update(re.findall(r"'([a-z0-9-]+)'", table))
    return names


def main():
    sys.path.insert(0, str(ROOT / "tools"))
    from icon_symbols import SYMBOLS
    names = sorted({v for v in SYMBOLS.values() if v} | set(EXTRA) | used_names())
    with urllib.request.urlopen(URL) as r:
        data = r.read()
    algorithm, digest = INTEGRITY.split("-", 1)
    if base64.b64encode(hashlib.new(algorithm, data).digest()).decode() != digest:
        sys.exit(f"{URL}: integrity check failed")
    icons, missing = {}, []
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
        members = {m.name: m for m in tar.getmembers()}
        for name in names:
            m = members.get(f"package/icons/{name}.svg")
            if not m:
                missing.append(name)
                continue
            svg = tar.extractfile(m).read().decode("utf-8")
            inner = re.search(r"<svg[^>]*>(.*)</svg>", svg, re.S).group(1)
            icons[name] = re.sub(r"\s*\n\s*", "", inner).replace(" />", "/>").strip()
        license_text = tar.extractfile(members["package/LICENSE"]).read().decode("utf-8")
    if missing:
        sys.exit(f"not in {PACKAGE} {VERSION}: {', '.join(missing)}")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "icons.json").write_text(json.dumps(icons, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n", encoding="utf-8")
    (OUT / "LICENSE.txt").write_text(license_text, encoding="utf-8")
    (OUT / "lock.json").write_text(json.dumps({"package": PACKAGE, "version": VERSION, "license": "ISC", "integrity": INTEGRITY, "icons": len(icons)}, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT / 'icons.json'}: {len(icons)} icons ({(OUT / 'icons.json').stat().st_size // 1024} KiB)")


if __name__ == "__main__":
    main()
