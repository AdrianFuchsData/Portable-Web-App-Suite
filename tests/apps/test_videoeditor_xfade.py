"""Video editor: cross-fade with the next clip (dissolve and sound), transitions between all clips of a track, normalising."""
import pytest
from PIL import Image

from helpers.media_samples import HAS_FFMPEG, make_color_webm, make_wav
from test_videoeditor import add, center_pixel, import_media, ready

pytestmark = pytest.mark.skipif(not HAS_FFMPEG, reason="ffmpeg is needed")


def tracks_of(page):
    return page.evaluate("VE.state.project.clips.map((c) => [c.track, Math.round(c.start * 100) / 100, Math.round(VE.tl.length(c) * 100) / 100]).sort((a, b) => a[1] - b[1])")


def test_crossfade_with_next(app_page, tmp_path):
    page = ready(app_page)
    import_media(page, make_color_webm(tmp_path / "rot.webm", "red", seconds=2), make_color_webm(tmp_path / "blau.webm", "blue", seconds=2, freq=660))
    add(page, "rot.webm")
    page.evaluate("""() => { const p = VE.state.project; const c = p.clips[0]; VE.commit(VE.tl.trimClip(p, c.id, 'right', 1, 2)); }""")
    add(page, "blau.webm")
    assert tracks_of(page) == [["v1", 0, 1], ["v1", 1, 2]]
    page.evaluate("VE.state.sel = VE.state.project.clips.find((c) => c.start === 0).id; VE.state.xfadeOpen = true; VE.commit(VE.state.project)")
    page.fill("[data-testid=xfade-length]", "0.5")
    page.press("[data-testid=xfade-length]", "Enter")
    page.click("[data-testid=xfade-next]")
    t = tracks_of(page)
    assert t[0] == ["v1", 0, 1.5] and t[1][1:] == [1, 2] and t[1][0] != "v1"  # red extended, blue above it
    b = page.evaluate("VE.state.project.clips.find((c) => c.start === 1)")
    assert b["fadeIn"] == 0.5 and b["transitionIn"] == "fade"
    r, g, bl = center_pixel(page, 1.25)
    assert r > 60 and bl > 60  # halfway: both
    r, g, bl = center_pixel(page, 0.8)
    assert r > 180 and bl < 60
    r, g, bl = center_pixel(page, 1.7)
    assert bl > 180 and r < 60
    # the sound cross-fades too: the red clip's sound fades out
    assert page.evaluate("VE.tl.audioFade(VE.state.project.clips.find((c) => c.start === 0), 1.25)") == pytest.approx(0.5, abs=0.01)
    assert page.errors == []


def test_transitions_on_track_and_normalise(app_page, tmp_path):
    page = ready(app_page)
    paths = []
    for name, col in (("a.png", (255, 0, 0)), ("b.png", (0, 255, 0)), ("c.png", (0, 0, 255))):
        Image.new("RGB", (64, 36), col).save(tmp_path / name)
        paths.append(tmp_path / name)
    import_media(page, *paths)
    for name in ("a.png", "b.png", "c.png"):
        add(page, name)
    page.evaluate("VE.state.sel = VE.state.project.clips[0].id; VE.state.xfadeOpen = true; VE.commit(VE.state.project)")
    page.click("[data-testid=xfade-track]")
    t = tracks_of(page)
    # a (V1) extended under b; b on the track above, extended over c and fading out; c stays on V1
    assert [x[0] == "v1" for x in t] == [True, False, True]
    assert t[0][2] == 6 and t[1][2] == 6
    r, g, b = center_pixel(page, 10.5)
    assert g > 60 and b > 60  # b (5–11 s) fades out over c (from 10 s)
    r, g, b = center_pixel(page, 5.5)
    assert g > 60 and r > 60  # b fades in over a (extended to 6 s)
    # normalise a quiet sound clip: −1 dBFS peak
    import_media(page, make_wav(tmp_path / "leise.wav", seconds=1, freq=440))
    add(page, "leise.wav")
    page.evaluate("VE.state.sel = VE.state.project.clips.find((c) => c.kind === 'audio').id; VE.commit(VE.state.project)")
    page.click("[data-testid=clip-normalize]")
    page.wait_for_function("() => VE.state.project.clips.find((c) => c.kind === 'audio').volume !== 1")
    vol = page.evaluate("VE.state.project.clips.find((c) => c.kind === 'audio').volume")
    peak = page.evaluate("""async () => { const c = VE.state.project.clips.find((x) => x.kind === 'audio'); return VE.ex.peakOf(VE.state.sources.get(c.source), c.in, c.out); }""")
    assert abs(20 * __import__("math").log10(vol * peak) - (-1)) < 0.05
    assert page.errors == []
