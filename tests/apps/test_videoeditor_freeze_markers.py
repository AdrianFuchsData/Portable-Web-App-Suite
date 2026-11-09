"""Video editor: freeze frame, markers (add, jump, name, snap, saved), export of a range and of only the sound."""
import io
import wave

import pytest
from playwright.sync_api import expect

from helpers.media_samples import HAS_FFMPEG, make_color_webm, make_wav, pixel, streams
from test_videoeditor import add, center_pixel, clips, import_media, ready

pytestmark = pytest.mark.skipif(not HAS_FFMPEG, reason="ffmpeg is needed")


def test_freeze_frame_and_markers(app_page, tmp_path):
    page = ready(app_page)
    red = make_color_webm(tmp_path / "rot.webm", "red", seconds=2)
    import_media(page, red)
    add(page, "rot.webm")
    page.evaluate("VE.seek(1)")
    page.keyboard.press("f")
    expect(page.locator("[data-testid=media]")).to_have_count(2)
    page.wait_for_function("() => VE.state.project.clips.length === 3")
    assert clips(page) == [["v1", "video", 0, 1], ["v1", "image", 1, 2], ["v1", "video", 3, 1]]
    r, g, b = center_pixel(page, 2)
    assert r > 180 and g < 80  # the held red frame
    page.keyboard.press("Control+z")
    assert clips(page) == [["v1", "video", 0, 2]]
    page.keyboard.press("Control+y")
    # markers: M adds one at the playhead, "," and "." jump, a double-click names it
    page.evaluate("VE.seek(0.5)")
    page.keyboard.press("m")
    page.evaluate("VE.seek(2.5)")
    page.keyboard.press("m")
    expect(page.locator("[data-testid=marker]")).to_have_count(2)
    page.evaluate("VE.seek(4)")
    page.keyboard.press(",")
    assert page.evaluate("VE.state.time") == 2.5
    page.keyboard.press(",")
    assert page.evaluate("VE.state.time") == 0.5
    page.keyboard.press(".")
    assert page.evaluate("VE.state.time") == 2.5
    page.locator("[data-testid=marker]").first.dblclick()
    page.fill("[data-testid=marker-text]", "Intro")
    page.click("[data-testid=marker-ok]")
    expect(page.locator("[data-testid=marker]").first).to_contain_text("Intro")
    assert page.evaluate("VE.tl.snap(VE.state.project, 2.47, 0.1)") == 2.5  # clips snap to markers
    assert page.evaluate("JSON.stringify(VE.state.project.markers.map((m) => [m.t, m.text]))") == '[[0.5,"Intro"],[2.5,""]]'
    page.locator("[data-testid=marker]").nth(1).dblclick()
    page.click("[data-testid=marker-delete]")
    expect(page.locator("[data-testid=marker]")).to_have_count(1)
    assert page.errors == []


def test_export_range_and_sound_only(app_page, tmp_path):
    page = ready(app_page)
    import_media(page, make_color_webm(tmp_path / "rot.webm", "red", seconds=1), make_color_webm(tmp_path / "blau.webm", "blue", seconds=1, freq=660))
    add(page, "rot.webm")
    add(page, "blau.webm")
    page.click("[data-testid=export]")
    page.select_option("[data-testid=export-format]", "webm-vp8")
    page.select_option("[data-testid=export-quality]", "low")
    page.fill("[data-testid=export-from]", "0.5")
    page.fill("[data-testid=export-to]", "1.5")
    with page.expect_download(timeout=120000) as d:
        page.click("[data-testid=export-ok]")
    out = tmp_path / "range.webm"
    d.value.save_as(out)
    info = streams(out)
    assert abs(info["duration"] - 1) < 0.15
    r, g, b = pixel(out, 0.2)
    assert r > 180 and b < 80  # 0.7 s of the timeline: red
    r, g, b = pixel(out, 0.8)
    assert b > 180 and r < 80  # 1.3 s: blue
    # only the sound, as WAV
    page.click("[data-testid=export]")
    page.select_option("[data-testid=export-what]", "audio")
    expect(page.locator("[data-testid=export-audio-format]")).to_be_visible()
    with page.expect_download(timeout=60000) as d:
        page.click("[data-testid=export-ok]")
    assert d.value.suggested_filename.endswith(".wav")
    with wave.open(io.BytesIO(open(d.value.path(), "rb").read())) as w:
        assert abs(w.getnframes() / w.getframerate() - 2) < 0.05 and w.getnchannels() == 2
    assert page.errors == []
