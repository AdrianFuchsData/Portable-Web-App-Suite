#!/usr/bin/env python3
"""Find (and replace) emoji and pictographic symbols in the visible text of the apps' htm templates.

The apps write their user interface as htm tagged templates (html`<button>💾 ${t('save')}</button>`). Emoji and many symbol
characters look different in every browser and system font (or are missing), so the buttons use the suite's bundled icons
(shared/js/icons.js, Lucide) instead: this tool lists the symbols in text positions of the templates – text between tags, and
string literals that are only a symbol inside a ${…} expression there (${playing ? '⏸' : '▶'}) – and with --write replaces
them with ${Suite.icon('name')} according to SYMBOLS. Symbols inside <option> elements (which cannot show pictures) are removed.
Attribute values, i18n strings and other code are not changed.

Usage:
    python3 tools/icon_symbols.py              # list the symbols in text positions and where they are
    python3 tools/icon_symbols.py --write      # replace the mapped ones
    python3 tools/icon_symbols.py --names      # the icon names used (for tools/vendor_icons.py)
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = sorted(list((ROOT / "apps").glob("*/src/js/*.js")) + list((ROOT / "shared" / "js").glob("*.js")))
SKIP = {"symbols.js", "icons.js"}  # (the symbol picker's own data, the icon module)

SYMBOL = re.compile(r"[⊤⊥⋮⋯⟀-⟿←-⇿⌀-⏿①-⓿■-➿⤀-⯿\U0001F000-\U0001FAFF]️?")

# symbol -> Lucide icon name (None: leave the symbol, it is text, e.g. an arrow in a label)
SYMBOLS = {
    "💾": "save", "📂": "folder-open", "📁": "folder", "📄": "file", "📑": "files", "📋": "clipboard", "📎": "paperclip",
    "🔍": "search", "🔎": "search", "🖨": "printer", "🗑": "trash-2", "✕": "x", "❌": "x", "✖": "x", "✗": "x",
    "✓": "check", "✅": "circle-check", "✔": "check", "⚠": "triangle-alert", "⚙": "settings", "🛠": "wrench",
    "✎": "pencil", "✏": "pencil", "✍": "pen-line", "🖌": "brush", "🪣": "paint-bucket", "🎨": "palette", "🪄": "wand-sparkles",
    "↶": "undo-2", "↷": "redo-2", "↩": "corner-down-left", "↪": "corner-up-right", "↻": "rotate-cw", "↺": "rotate-ccw", "🔄": "refresh-cw",
    "🔁": "repeat", "🔂": "repeat-1", "🔀": "shuffle",
    "▶": "play", "⏵": "play", "⏸": "pause", "⏹": "square", "⏺": "circle", "⏮": "skip-back", "⏭": "skip-forward", "⏴": "rewind",
    "◀": "step-back", "⏏": "eject", "🔊": "volume-2", "🔇": "volume-x", "🎤": "mic", "🎚": "sliders-horizontal",
    "📷": "camera", "🖼": "image", "🎞": "film", "🎬": "clapperboard", "📽": "projector",
    "🔒": "lock", "🔓": "lock-open", "🔐": "lock-keyhole", "🔑": "key-round", "🛡": "shield", "👁": "eye", "🙈": "eye-off",
    "📦": "package", "🗄": "database", "🗃": "archive", "🗂": "folder-tree", "🐘": "database", "🐬": "database", "⛁": "database",
    "📊": "chart-column", "📈": "chart-line", "📅": "calendar", "🕒": "clock", "🕘": "clock", "🔔": "bell", "✉": "mail", "📥": "inbox",
    "💬": "message-square", "👤": "user", "🧍": "user", "👋": "hand", "✋": "hand", "👆": "pointer", "🏢": "building-2",
    "🔗": "link", "🌐": "globe", "🖥": "monitor", "⌨": "keyboard", "🖧": "network", "☁": "cloud",
    "▦": "qr-code", "📐": "ruler", "⛶": "maximize", "⤢": "maximize-2", "⤡": "minimize-2", "↗": "external-link",
    "⬇": "download", "⤓": "download", "⬆": "upload", "⤒": "upload", "⇩": "download", "⇧": "upload", "📝": "notebook-pen", "📓": "notebook",
    "☰": "menu", "⋮": "ellipsis-vertical", "▾": "chevron-down", "▸": "chevron-right", "▼": "chevron-down", "▲": "chevron-up",
    "⌄": "chevron-down", "★": "star", "♪": "music", "🔢": "hash", "♯": "hash", "🎲": "dices", "✂": "scissors", "⧉": "copy", "⎘": "copy",
    "🧲": "magnet", "🩺": "stethoscope", "🩹": "bandage", "🐍": "terminal", "◐": "contrast", "☀": "sun", "☾": "moon", "⌘": "command",
    "♿": "accessibility", "⚖": "scale", "❄": "snowflake", "💧": "droplet", "🧠": "brain", "🧵": "spool", "🏃": "person-standing",
    "⇄": "arrow-left-right", "⇆": "arrow-left-right", "⇔": "arrow-left-right", "↔": "move-horizontal", "↕": "move-vertical",
    "⇤": "arrow-left-to-line", "⇥": "arrow-right-to-line", "⇅": "arrow-down-up", "⇵": "arrow-down-up",
    "⌫": "delete", "🔉": "volume-1", "❝": "quote", "🔣": "type", "✥": "move", "➰": "spline", "◯": "circle", "▭": "rectangle-horizontal",
    "◇": "diamond", "◆": "diamond", "⬚": "square-dashed", "▢": "square", "◻": "square", "◼": "square", "■": "square", "⬠": "pentagon", "╱": "slash",
    "📕": "book", "🏊": "waves", "↖": "mouse-pointer-2", "🔤": "type", "⤴": "corner-right-up", "↧": "arrow-down-to-line",
    "⇠": "arrow-left", "⇢": "arrow-right", "⬛": "square", "◎": "target", "◫": "columns-2", "▣": "square-dot", "▤": "rows-3",
    "↑": "arrow-up", "↓": "arrow-down", "←": "arrow-left", "→": "arrow-right", "⇐": "arrow-big-left", "☐": "square", "⇪": "import",
    "⇋": "flip-horizontal-2", "⇇": "reply-all", "⫷": "align-horizontal-justify-start", "⇹": "align-horizontal-justify-center",
    "⫸": "align-horizontal-justify-end", "⊤": "align-vertical-justify-start", "⇳": "align-vertical-justify-center", "⊥": "align-vertical-justify-end",
    "⋯": "ellipsis", "⟶": "move-right", "⟲": "rotate-ccw", "⟳": "rotate-cw",
    "◌": "circle-dashed", "◍": "circle-dot", "▮": "rectangle-vertical", "❚": "grip-vertical", "⫶": "grip-vertical", "Ⓜ": "badge-info",
}


def scan(text):
    """(start, end, kind, inside_option) of the symbols in text positions of html`…` templates, each once. kind: 'text' or 'string'."""
    hits = {}
    for m in re.finditer(r"\bhtml`", text):
        for h in template(text, m.end()):
            hits.setdefault((h[0], h[1]), h)
    return sorted(hits.values())


def template(text, i):
    """Walk an htm template from position i (after the backtick) to its closing backtick."""
    in_tag = False
    quote = None
    stack = []  # open element names
    n = len(text)
    while i < n:
        c = text[i]
        if c == "\\":
            i += 2
            continue
        if c == "`" and quote is None:
            return
        if c == "$" and text.startswith("${", i):
            end = expression_end(text, i + 2)
            if not in_tag:
                yield from expression(text, i + 2, end, "option" in stack)
            else:
                yield from nested(text, i + 2, end)
            i = end + 1
            continue
        if in_tag:
            if quote:
                if c == quote:
                    quote = None
            elif c in "\"'":
                quote = c
            elif c == ">":
                in_tag = False
                tag = re.match(r"<\s*(/?)\s*([a-zA-Z][\w-]*)", text[tag_start:i + 1])
                if tag and not text[i - 1] == "/":
                    if tag.group(1):
                        if tag.group(2) in stack:
                            del stack[len(stack) - 1 - stack[::-1].index(tag.group(2)):]
                    else:
                        stack.append(tag.group(2))
            i += 1
            continue
        if c == "<":
            in_tag = True
            tag_start = i
            i += 1
            continue
        m = SYMBOL.match(text, i)
        if m:
            yield (m.start(), m.end(), "text", "option" in stack)
            i = m.end()
            continue
        i += 1


def expression_end(text, i):
    """Index of the } closing the ${ expression that starts at i."""
    depth = 0
    n = len(text)
    while i < n:
        c = text[i]
        if c in "\"'":
            i = string_end(text, i) + 1
            continue
        if c == "`":
            i = template_end(text, i + 1) + 1
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            if depth == 0:
                return i
            depth -= 1
        i += 1
    return n


def string_end(text, i):
    q = text[i]
    i += 1
    while i < len(text) and text[i] != q:
        i += 2 if text[i] == "\\" else 1
    return i


def template_end(text, i):
    while i < len(text):
        if text[i] == "\\":
            i += 2
            continue
        if text[i] == "`":
            return i
        if text.startswith("${", i):
            i = expression_end(text, i + 2) + 1
            continue
        i += 1
    return i


def expression(text, start, end, in_option):
    """Symbols in an expression at a text position: string literals that are only a symbol, and nested templates."""
    i = start
    while i < end:
        c = text[i]
        if c in "\"'":
            j = string_end(text, i)
            literal = text[i + 1:j]
            m = SYMBOL.fullmatch(literal.strip())
            if m:
                yield (i, j + 1, "string", in_option)
            i = j + 1
            continue
        if text.startswith("html`", i):
            yield from template(text, i + 5)
            i = template_end(text, i + 5) + 1
            continue
        if c == "`":
            i = template_end(text, i + 1) + 1
            continue
        i += 1


def nested(text, start, end):
    """Templates nested in an attribute expression (e.g. a component's prop) are walked too."""
    for m in re.finditer(r"\bhtml`", text[start:end]):
        yield from template(text, start + m.end())


def found():
    for path in FILES:
        if path.name in SKIP:
            continue
        text = path.read_text(encoding="utf-8")
        for start, end, kind, in_option in scan(text):
            yield path, text, start, end, kind, in_option


def main():
    args = sys.argv[1:]
    if "--names" in args:
        print("\n".join(sorted(set(v for v in SYMBOLS.values() if v))))
        return
    if "--write" not in args:
        missing = {}
        for path, text, start, end, kind, in_option in found():
            sym = text[start:end].strip("'\"").strip().rstrip("️")
            line = text.count("\n", 0, start) + 1
            mark = "" if sym in SYMBOLS else "  <-- not mapped"
            print(f"{path.relative_to(ROOT)}:{line}: {sym} {kind}{' (option)' if in_option else ''}{mark}")
            if sym not in SYMBOLS:
                missing[sym] = missing.get(sym, 0) + 1
        print("not mapped:", missing, file=sys.stderr)
        return
    changed = 0
    for path in FILES:
        if path.name in SKIP:
            continue
        text = path.read_text(encoding="utf-8")
        hits = [h for h in scan(text)]
        out = text
        for start, end, kind, in_option in sorted(hits, key=lambda h: -h[0]):
            sym = text[start:end].strip("'\"").strip().rstrip("️")
            name = SYMBOLS.get(sym)
            if not name:
                continue
            if kind == "text":
                # (a space after the symbol stays only before more text; inside an option the symbol goes)
                after = end + 1 if out[end:end + 1] == " " and in_option else end
                out = out[:start] + ("" if in_option else f"${{Suite.icon('{name}')}}") + out[after:]
            else:
                out = out[:start] + ("''" if in_option else f"Suite.icon('{name}')") + out[end:]
            changed += 1
        if out != text:
            path.write_text(out, encoding="utf-8")
    print(f"{changed} symbols replaced")


if __name__ == "__main__":
    main()
