"""The suite's bundled icons (shared/js/icons.js, vendor/icons/icons.json from tools/vendor_icons.py): every icon name the code uses
is in the bundle, the templates have no emoji or symbol characters left where an icon belongs, and the icons render."""
import json
import pathlib
import sys


ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import icon_symbols  # noqa: E402
import vendor_icons  # noqa: E402

ICONS = json.loads((ROOT / "vendor" / "icons" / "icons.json").read_text(encoding="utf-8"))


def test_every_used_icon_is_bundled():
    missing = sorted(n for n in vendor_icons.used_names() if n not in ICONS)
    assert not missing, f"run tools/vendor_icons.py: {missing}"


def test_no_mapped_symbols_left_in_templates():
    left = [f"{p.relative_to(ROOT)}:{text.count(chr(10), 0, a) + 1}: {text[a:b]}" for p, text, a, b, kind, in_option in icon_symbols.found()
            if text[a:b].strip("'\"").strip().rstrip("️") in icon_symbols.SYMBOLS]
    assert not left, left


def test_every_app_embeds_the_icons():
    for index in (ROOT / "apps").glob("*/src/index.html"):
        html = index.read_text(encoding="utf-8")
        assert 'id="suite-icons"' in html and "shared/js/icons.js" in html, index
