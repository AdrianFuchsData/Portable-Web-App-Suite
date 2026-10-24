#!/usr/bin/env python3
"""Build the emoji and symbol data of the suite (shared/js/symbols.js) from the vendored data packages.

Sources (vendor/symbols.esm.json, vendored with tools/vendor_esm.py into vendor/esm/symbols/assets/):
  * emojibase-data (MIT): emoji with English and German names and keywords, groups, skin tones, emoticons (":)"),
    GitHub shortcodes (English) and CLDR shortcodes (German);
  * cldr-annotations-full (Unicode-3.0): English and German names and keywords of symbols (arrows, currency, maths …).
Names of the other symbols come from Python's unicodedata (the Unicode Character Database).

Output: vendor/esm/symbols/symbols.json, embedded into the apps by build.py (gzip + base64):
  {"unicode": "<version of unicodedata>",
   "groups": [{"id", "icon", "en", "de", "kind": "emoji" | "symbol"}],
   "items": [[char, group, en name, de name, en keywords, de keywords, shortcodes, emoticons, skins]]}
   (keywords, shortcodes, emoticons and the five skin tone variants space-separated; "" if none)

Only the Python standard library is used.

Usage:
    python3 tools/build_symbols.py
"""
import json
import pathlib
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parents[1]
ASSETS = ROOT / "vendor" / "esm" / "symbols" / "assets"
OUT = ROOT / "vendor" / "esm" / "symbols" / "symbols.json"

EMOJI_GROUP_ICONS = {"smileys-emotion": "😀", "people-body": "👋", "animals-nature": "🐻", "food-drink": "🍔", "travel-places": "✈️",
                     "activities": "⚽", "objects": "💡", "symbols": "❤️", "flags": "🏁"}

# symbol groups: id, icon, English and German name, code point ranges (inclusive)
SYMBOL_GROUPS = [
    ("punctuation", "§", "Punctuation", "Satzzeichen", [(0x00A1, 0x00BF), (0x2010, 0x2027), (0x2030, 0x205E), (0x2E18, 0x2E18)]),
    ("currency", "€", "Currency", "Währungen", [(0x0024, 0x0024), (0x00A2, 0x00A5), (0x20A0, 0x20C0)]),
    ("arrows", "→", "Arrows", "Pfeile", [(0x2190, 0x21FF), (0x27F0, 0x27FF), (0x2B00, 0x2B11)]),
    ("math", "∑", "Mathematics", "Mathematik", [(0x00B1, 0x00B1), (0x00D7, 0x00D7), (0x00F7, 0x00F7), (0x2200, 0x22FF), (0x2070, 0x209C),
                                               (0x00BC, 0x00BE), (0x2150, 0x215F), (0x2189, 0x2189), (0x27C0, 0x27EF)]),
    ("letterlike", "℃", "Letterlike and technical", "Buchstabenähnlich und technisch", [(0x2100, 0x214F), (0x2300, 0x23FF)]),
    ("greek", "Ω", "Greek", "Griechisch", [(0x0391, 0x03A9), (0x03B1, 0x03C9), (0x03D1, 0x03D6)]),
    ("latin", "Ä", "Latin letters", "Lateinische Buchstaben", [(0x00C0, 0x00FF), (0x0100, 0x017F), (0x0180, 0x024F), (0x1E9E, 0x1E9E)]),
    ("shapes", "■", "Shapes and box drawing", "Formen und Rahmen", [(0x2500, 0x257F), (0x2580, 0x259F), (0x25A0, 0x25FF), (0x2B1B, 0x2B59)]),
    ("dingbats", "✓", "Symbols and dingbats", "Symbole und Dingbats", [(0x2600, 0x26FF), (0x2700, 0x27BF)]),
]


TONES = ("1F3FB", "1F3FC", "1F3FD", "1F3FE", "1F3FF")
# German names of Latin and Greek letters, translated from their Unicode names (CLDR has none for them)
GERMAN_WORDS = [("latin capital letter", "lateinischer Großbuchstabe"), ("latin small letter", "lateinischer Kleinbuchstabe"),
                ("greek capital letter", "griechischer Großbuchstabe"), ("greek small letter", "griechischer Kleinbuchstabe"),
                ("greek", "griechisches"), ("with", "mit"), ("double acute", "Doppelakut"), ("acute", "Akut"), ("grave", "Gravis"),
                ("circumflex", "Zirkumflex"), ("diaeresis", "Trema"), ("tilde", "Tilde"), ("ring above", "Ring"), ("cedilla", "Cedille"),
                ("caron", "Hatschek"), ("stroke", "Strich"), ("macron", "Makron"), ("breve", "Brevis"), ("ogonek", "Ogonek"),
                ("dot above", "Punkt"), ("middle dot", "Mittelpunkt"), ("sharp s", "scharfes S"), ("symbol", "Symbol"), ("and", "und"),
                ("hook", "Haken"), ("final sigma", "Schluss-Sigma")]


def german_letter_name(official):
    """'latin capital letter a with diaeresis' -> 'lateinischer Großbuchstabe A mit Trema' (only Latin and Greek letters)."""
    if not official.startswith(("latin ", "greek ")):
        return ""
    out = official
    for en, de in GERMAN_WORDS:
        out = out.replace(en, de)
    words = out.split(" ")
    # the letter itself: a single character or a Greek letter name after "…buchstabe"
    for i, w in enumerate(words):
        if i and words[i - 1].endswith("buchstabe") and w.isascii() and w.islower() and w != "scharfes":
            words[i] = w.upper() if len(w) == 1 else w.capitalize()
    return " ".join(words)


PRIORITY = ["currency", "math", "arrows", "greek", "latin", "letterlike", "shapes", "dingbats", "punctuation"]


def with_noses(emoticons):
    """":)" -> ":)", ":-)" (the variants with a nose are common, emojibase lists only those without)."""
    out = []
    for e in emoticons:
        out.append(e)
        if len(e) == 2 and e[0] in ":;=8" and e[1] not in "-'":
            out.append(e[0] + "-" + e[1])
    return out


def load(path):
    return json.loads((ASSETS / path).read_text(encoding="utf-8"))


def cldr(lang):
    """{char: (name, [keywords])} from the CLDR annotations."""
    out = {}
    for char, a in load(f"cldr-annotations-full/annotations/{lang}/annotations.json")["annotations"]["annotations"].items():
        name = (a.get("tts") or [""])[0]
        out[char] = (name, [k for k in a.get("default", []) if k != name])
    return out


def main():
    en, de = load("emojibase-data/en/compact.json"), load("emojibase-data/de/compact.json")
    de_by_hex = {e["hexcode"]: e for e in de}
    groups_en = {g["order"]: g for g in load("emojibase-data/en/messages.json")["groups"]}
    groups_de = {g["order"]: g for g in load("emojibase-data/de/messages.json")["groups"]}
    github = load("emojibase-data/en/shortcodes/github.json")
    cldr_de_codes = load("emojibase-data/de/shortcodes/cldr.json")
    as_list = lambda v: v if isinstance(v, list) else [v] if v else []

    groups, index = [], {}
    for order in sorted(groups_en):
        key = groups_en[order]["key"]
        if key == "component":  # skin tone and hair components
            continue
        index[order] = len(groups)
        groups.append({"id": key, "icon": EMOJI_GROUP_ICONS.get(key, "•"), "en": groups_en[order]["message"].replace(" & ", " and "),
                       "de": groups_de[order]["message"], "kind": "emoji"})

    items, seen = [], set()
    for e in sorted((e for e in en if e.get("group") in index), key=lambda e: e.get("order", 0)):
        d = de_by_hex.get(e["hexcode"], {})
        codes = as_list(github.get(e["hexcode"])) + as_list(cldr_de_codes.get(e["hexcode"]))
        # the five variants with one skin tone modifier (1F3FB … 1F3FF)
        skins = [s["unicode"] for s in e.get("skins", []) if sum(s["hexcode"].count(m) for m in TONES) == 1][:5]
        items.append([e["unicode"], index[e["group"]], e["label"], d.get("label", ""), " ".join(e.get("tags", [])), " ".join(d.get("tags", [])),
                      " ".join(codes), " ".join(with_noses(as_list(e.get("emoticon")))), " ".join(skins) if len(skins) == 5 else ""])
        seen.add(e["unicode"])
        seen.add(e["unicode"].replace("️", ""))

    names_en, names_de = cldr("en"), cldr("de")
    # characters in several ranges belong to the first group in this order (punctuation last)
    owner = {}
    for gid in PRIORITY:
        for lo, hi in next(r for g, _, _, _, r in SYMBOL_GROUPS if g == gid):
            for cp in range(lo, hi + 1):
                owner.setdefault(cp, gid)
    for gid, icon, label_en, label_de, ranges in SYMBOL_GROUPS:
        g = len(groups)
        groups.append({"id": gid, "icon": icon, "en": label_en, "de": label_de, "kind": "symbol"})
        for cp in sorted(cp for cp, o in owner.items() if o == gid):
            ch = chr(cp)
            name = unicodedata.name(ch, "")
            if not name or ch in seen or unicodedata.category(ch) in ("Cc", "Cf", "Cn", "Co", "Cs", "Zs", "Zl", "Zp", "Mn"):
                continue
            seen.add(ch)
            en_name, en_keys = names_en.get(ch, ("", []))
            de_name, de_keys = names_de.get(ch, ("", []))
            official = name.lower()
            items.append([ch, g, en_name or official, de_name or german_letter_name(official),
                          " ".join(en_keys + ([official] if en_name and en_name.lower() != official else [])), " ".join(de_keys), "", "", ""])

    OUT.write_text(json.dumps({"unicode": unicodedata.unidata_version, "groups": groups, "items": items}, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(groups)} groups, {len(items)} characters, {OUT.stat().st_size // 1024} KiB (Unicode {unicodedata.unidata_version})")


if __name__ == "__main__":
    main()
