#!/usr/bin/env python3
"""Vendor the suite's bundled fonts (Fontsource packages from jsDelivr; all SIL Open Font License 1.1).

Writes vendor/fonts/:
  fonts.css       @font-face rules with the WOFF2 files as data: URLs (regular, bold, italic, bold italic; the subsets in SUBSETS, each
                  with its unicode-range, so a browser decodes only what a text needs). Apps include it with
                  <link rel="stylesheet" href="../../../vendor/fonts/fonts.css">; build.py inlines it. It starts with "/* suite-fonts */",
                  so that the overview can keep one copy for all the apps it embeds (see build.py).
  fonts-mono.css  the same for the monospaced families only ("/* suite-fonts-mono */"; text editor, terminal)
  fonts.json    the families for the font menus: [{ "name", "category": "sans-serif" | "serif" | "monospace", "aliases", "package", "version" }]
  licenses/     the licence of each package (and a NOTICE of the aliases)
  lock.json     package versions

Liberation Sans, Serif and Mono (2.x) are built from Arimo, Tinos and Cousine – the same glyphs and metrics –, so they are aliases
of those files (no package of the Liberation fonts exists); shared/js/fonts.js registers the aliases from the rules at runtime, so the
data is in the file once. Only the Python standard library is used.

Usage:
    python3 tools/vendor_fonts.py
"""
import base64
import json
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "vendor" / "fonts"
CDN = "https://cdn.jsdelivr.net/npm"
SUBSETS = ["latin", "latin-ext"]
# (package, family name, category, aliases); pinned versions
FAMILIES = [
    ("arimo", "Arimo", "sans-serif", ["Liberation Sans"]),
    ("tinos", "Tinos", "serif", ["Liberation Serif"]),
    ("cousine", "Cousine", "monospace", ["Liberation Mono"]),
    ("carlito", "Carlito", "sans-serif", []),
    ("caladea", "Caladea", "serif", []),
    ("gelasio", "Gelasio", "serif", []),
    ("inter", "Inter", "sans-serif", []),
    ("open-sans", "Open Sans", "sans-serif", []),
    ("roboto", "Roboto", "sans-serif", []),
    ("lato", "Lato", "sans-serif", []),
    ("montserrat", "Montserrat", "sans-serif", []),
    ("source-serif-4", "Source Serif 4", "serif", ["Source Serif"]),
    ("merriweather", "Merriweather", "serif", []),
    ("jetbrains-mono", "JetBrains Mono", "monospace", []),
    ("fira-code", "Fira Code", "monospace", []),
    ("source-code-pro", "Source Code Pro", "monospace", []),
]
VERSIONS = {"source-serif-4": "5.3.1", "source-code-pro": "5.3.1"}
DEFAULT_VERSION = "5.3.0"
# unicode ranges of Fontsource's subsets (the same as Google Fonts')
RANGES = {
    "latin": "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    "latin-ext": "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
}


def fetch(url, binary=False):
    with urllib.request.urlopen(url, timeout=60) as r:
        data = r.read()
    return data if binary else data.decode("utf-8")


def main():
    (OUT / "licenses").mkdir(parents=True, exist_ok=True)
    rules, mono, families, lock, total = [], [], [], {}, 0
    for package, name, category, aliases in FAMILIES:
        version = VERSIONS.get(package, DEFAULT_VERSION)
        base = f"{CDN}/@fontsource/{package}@{version}"
        meta = json.loads(fetch(f"{base}/metadata.json"))
        lock[f"@fontsource/{package}"] = {"version": version, "license": json.loads(fetch(f"{base}/package.json")).get("license")}
        (OUT / "licenses" / f"{package}.LICENSE.txt").write_text(fetch(f"{base}/LICENSE"), encoding="utf-8")
        styles = [s for s in ("normal", "italic") if s in meta["styles"]]
        for style in styles:
            for weight in (400, 700):
                if weight not in meta["weights"]:
                    continue
                for subset in SUBSETS:
                    if subset not in meta["subsets"]:
                        continue
                    data = fetch(f"{base}/files/{package}-{subset}-{weight}-{style}.woff2", binary=True)
                    total += len(data)
                    src = "data:font/woff2;base64," + base64.b64encode(data).decode("ascii")
                    rule = (f'@font-face{{font-family:"{name}";font-style:{style};font-weight:{weight};font-display:swap;'
                            f'src:url({src}) format("woff2");unicode-range:{RANGES[subset]}}}')
                    rules.append(rule)
                    if category == "monospace":
                        mono.append(rule)
        families.append({"name": name, "category": category, "aliases": aliases, "package": f"@fontsource/{package}", "version": version})
        print(f"{name}: {', '.join(styles)}")
    (OUT / "fonts.css").write_text("/* suite-fonts */\n" + "\n".join(rules) + "\n", encoding="utf-8")
    (OUT / "fonts-mono.css").write_text("/* suite-fonts-mono */\n" + "\n".join(mono) + "\n", encoding="utf-8")
    (OUT / "fonts.json").write_text(json.dumps(families, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    (OUT / "lock.json").write_text(json.dumps(lock, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    (OUT / "licenses" / "NOTICE.txt").write_text(
        "The fonts are from the Fontsource packages listed in lock.json (SIL Open Font License 1.1, see the licence files).\n"
        "Liberation Sans, Liberation Serif and Liberation Mono are names given to the unmodified files of Arimo, Tinos and Cousine,\n"
        "from which Liberation 2.x is built (same glyphs and metrics).\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(families)} families, {total // 1024} KiB of WOFF2")


if __name__ == "__main__":
    main()
