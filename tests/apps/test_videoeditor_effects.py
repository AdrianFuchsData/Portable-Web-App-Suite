"""Video editor: picture effects (blur, grayscale, sepia, hue, invert) and chroma key (green screen) in preview and export."""
import pytest
from PIL import Image
from playwright.sync_api import expect

from helpers.media_samples import HAS_FFMPEG
from test_videoeditor import add, import_media, ready

pytestmark = pytest.mark.skipif(not HAS_FFMPEG, reason="ffmpeg is needed")

AT = """([t, fx, fy]) => { const c = document.querySelector('[data-testid=preview-canvas]'); const g = c.getContext('2d'); VE.compose(g, t);
  return [...g.getImageData(Math.round(c.width * fx), Math.round(c.height * fy), 1, 1).data].slice(0, 3); }"""


def set_field(page, testid, value):
    page.fill(f"[data-testid={testid}]", str(value))
    page.press(f"[data-testid={testid}]", "Enter")


def test_effects_and_chroma_key(app_page, tmp_path):
    # a person on a green screen: a red square on green; behind it a blue picture
    fg = tmp_path / "person.png"
    img = Image.new("RGB", (160, 90), (0, 255, 0))
    img.paste((220, 30, 30), (60, 25, 100, 65))
    img.save(fg)
    bg = tmp_path / "sky.png"
    Image.new("RGB", (160, 90), (30, 60, 220)).save(bg)
    page = ready(app_page)
    import_media(page, fg, bg)
    add(page, "sky.png")  # → V1
    page.evaluate("() => { const c = VE.state.project.clips[0]; VE.commit({ ...VE.state.project, clips: [{ ...c, track: 'v1' }] }); }")
    add(page, "person.png")
    page.evaluate("""() => { const p = VE.state.project; const [a, b] = p.clips; VE.commit({ ...p, clips: [a, { ...b, track: 'v2', start: 0 }] }); }""")
    assert page.evaluate(AT, [1, 0.1, 0.5])[1] > 200  # the green screen covers the sky
    page.evaluate("VE.state.sel = VE.state.project.clips.find((c) => c.track === 'v2').id; VE.state.pictureOpen = true;")
    page.evaluate("VE.commit(VE.state.project)")
    expect(page.locator("[data-testid=clip-key]")).to_be_visible()
    page.check("[data-testid=clip-key]")
    r, g, b = page.evaluate(AT, [1, 0.1, 0.5])
    assert b > 180 and g < 100  # the sky shows through
    r, g, b = page.evaluate(AT, [1, 0.5, 0.5])
    assert r > 180 and g < 80  # the person stays
    # tolerance 0: nothing is keyed except exactly matching (still green)
    set_field(page, "clip-key-tolerance", 0)
    set_field(page, "clip-key-softness", 0)
    assert page.evaluate(AT, [1, 0.1, 0.5])[2] > 180  # (pure green is the key colour itself: still transparent)
    set_field(page, "clip-key-tolerance", 30)
    # effects: grayscale makes the red person grey
    set_field(page, "clip-grayscale", 100)
    r, g, b = page.evaluate(AT, [1, 0.5, 0.5])
    assert abs(r - g) < 12 and abs(g - b) < 12
    set_field(page, "clip-grayscale", 0)
    page.check("[data-testid=clip-invert]")
    r, g, b = page.evaluate(AT, [1, 0.5, 0.5])
    assert r < 80 and g > 180  # red inverted → cyan
    page.uncheck("[data-testid=clip-invert]")
    set_field(page, "clip-hue", 120)
    r, g, b = page.evaluate(AT, [1, 0.5, 0.5])
    assert g > r
    # the chroma key function itself
    k = page.evaluate("""() => { const d = new Uint8ClampedArray([0, 255, 0, 255, 220, 30, 30, 255, 120, 200, 110, 255]);
      VE.tl.chromaKey(d, { color: '#00ff00', tolerance: 30, softness: 10, spill: 100 }); return Array.from(d); }""")
    assert k[3] == 0 and k[7] == 255 and k[9] <= 120  # green gone, red kept, green cast of the edge pixel removed
    assert page.errors == []
