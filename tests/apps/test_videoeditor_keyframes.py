"""Video editor: keyframes (position, size, opacity, rotation over time), kept through splitting, in preview and export."""
import pytest
from PIL import Image
from playwright.sync_api import expect

from helpers.media_samples import HAS_FFMPEG, pixel
from test_videoeditor import add, import_media, ready

pytestmark = pytest.mark.skipif(not HAS_FFMPEG, reason="ffmpeg is needed")

AT = """([t, fx, fy]) => { const c = document.querySelector('[data-testid=preview-canvas]'); const g = c.getContext('2d'); VE.compose(g, t);
  return [...g.getImageData(Math.round(c.width * fx), Math.round(c.height * fy), 1, 1).data].slice(0, 3); }"""


def set_field(page, testid, value):
    page.fill(f"[data-testid={testid}]", str(value))
    page.press(f"[data-testid={testid}]", "Enter")


def test_keyframes(app_page, tmp_path):
    Image.new("RGB", (64, 36), (0, 220, 0)).save(tmp_path / "g.png")
    page = ready(app_page)
    import_media(page, tmp_path / "g.png")
    add(page, "g.png")
    page.locator("[data-testid=clip]").first.click()
    # opacity: 0 % at 0 s, 100 % at 4 s
    page.evaluate("VE.seek(0)")
    set_field(page, "clip-opacity", 0)
    page.click("[data-testid=key-opacity]")
    expect(page.locator("[data-testid=key-opacity]")).to_have_attribute("aria-pressed", "true")
    page.evaluate("VE.seek(4)")
    expect(page.locator("[data-testid=key-opacity]")).to_have_attribute("aria-pressed", "false")
    set_field(page, "clip-opacity", 100)  # (animated: typing sets a key here)
    keys = page.evaluate("VE.state.project.clips[0].keys.opacity")
    assert keys == [{"t": 0, "v": 0}, {"t": 4, "v": 1}]
    expect(page.locator("[data-testid=keymark]")).to_have_count(2)
    assert page.evaluate(AT, [0, 0.5, 0.5])[1] < 10
    assert 100 < page.evaluate(AT, [2, 0.5, 0.5])[1] < 120
    assert page.evaluate(AT, [4.5, 0.5, 0.5])[1] > 210
    # the field follows the playhead
    page.evaluate("VE.seek(1)")
    expect(page.locator("[data-testid=clip-opacity]")).to_have_value("25")
    # position: moves from left to right
    page.evaluate("VE.seek(0)")
    set_field(page, "clip-x", -400)
    page.click("[data-testid=key-x]")
    page.evaluate("VE.seek(4)")
    set_field(page, "clip-x", 400)
    assert page.evaluate(AT, [4, 0.85, 0.5])[1] > 200 and page.evaluate(AT, [4, 0.15, 0.5])[1] < 10
    # split at 2 s: the second part continues the animation
    page.evaluate("VE.seek(2)")
    page.keyboard.press("s")
    second = page.evaluate("VE.state.project.clips.find((c) => c.start > 1).keys.opacity")
    assert second[0] == {"t": 0, "v": 0.5} and second[-1]["v"] == 1
    assert 100 < page.evaluate(AT, [2.01, 0.5, 0.5])[1] < 125
    # removing all keys: static again
    page.locator("[data-testid=clip]").first.click()
    page.click("[data-testid=keys-clear]")
    assert page.evaluate("VE.state.project.clips.find((c) => c.start === 0).keys") is None
    assert page.errors == []


def test_keyframes_in_the_export(app_page, tmp_path):
    Image.new("RGB", (64, 36), (0, 220, 0)).save(tmp_path / "g.png")
    page = ready(app_page)
    import_media(page, tmp_path / "g.png")
    add(page, "g.png")
    page.evaluate("""() => { const p = VE.state.project; const c = p.clips[0];
      VE.commit({ ...p, clips: [{ ...c, out: 2, keys: { opacity: [{ t: 0, v: 0 }, { t: 2, v: 1 }] } }] }); }""")
    page.click("[data-testid=export]")
    page.select_option("[data-testid=export-format]", "webm-vp8")
    page.select_option("[data-testid=export-quality]", "low")
    with page.expect_download(timeout=120000) as d:
        page.click("[data-testid=export-ok]")
    out = tmp_path / "k.webm"
    d.value.save_as(out)
    assert pixel(out, 0.1)[1] < 40 and 90 < pixel(out, 1)[1] < 140 and pixel(out, 1.9)[1] > 180
    assert page.errors == []
