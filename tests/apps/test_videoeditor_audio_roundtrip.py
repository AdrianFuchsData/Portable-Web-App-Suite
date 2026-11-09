"""Video editor → audio editor → back: "Edit in audio editor" (bridge) replaces the sound of a clip."""
import pytest
from playwright.sync_api import expect

from helpers.media_samples import HAS_FFMPEG, make_color_webm, make_wav
from test_videoeditor import add, import_media, ready

pytestmark = pytest.mark.skipif(not HAS_FFMPEG, reason="ffmpeg is needed")


def edit_in_audio_editor(page):
    with page.context.expect_page() as new_page:
        page.click("[data-testid=clip-edit-audio]")
    ae = new_page.value
    ae.errors = []
    ae.on("pageerror", lambda e: ae.errors.append(str(e)))
    ae.wait_for_load_state()
    assert ae.url.endswith("/audioeditor.html")
    expect(ae.locator("[data-testid=track]")).to_have_count(1, timeout=30000)
    return ae


def test_audio_clip_round_trip(app_page, tmp_path):
    page = ready(app_page)
    import_media(page, make_wav(tmp_path / "ton.wav", seconds=2, freq=440))
    add(page, "ton.wav")
    page.locator("[data-testid=clip]").first.click()
    ae = edit_in_audio_editor(page)
    assert abs(ae.evaluate("AE.clips.trackEnd(AE.state.tracks[0].clips) / AE.state.rate") - 2) < 0.02
    # shorten it to one second and save: the clip in the video editor plays the edited sound
    ae.evaluate("() => { const tr = AE.state.tracks[0]; const n = AE.state.rate; AE.state.tracks[0] = { ...tr, clips: AE.clips.removeRange(tr.clips, n, 2 * n) }; AE.state.dirty = true; }")
    ae.keyboard.press("Control+s")
    expect(page.locator("[data-testid=media]")).to_have_count(2, timeout=30000)
    page.wait_for_function("() => VE.state.project.clips[0].source !== [...VE.state.sources.values()][0].id")
    c = page.evaluate("VE.state.project.clips[0]")
    assert c["kind"] == "audio" and abs(c["out"] - c["in"] - 1) < 0.02
    assert "edited" in page.evaluate("VE.state.sources.get(VE.state.project.clips[0].source).name")
    assert page.errors == [] and ae.errors == []


def test_video_clip_sound_goes_to_an_audio_track(app_page, tmp_path):
    page = ready(app_page)
    import_media(page, make_color_webm(tmp_path / "rot.webm", "red", seconds=1))
    add(page, "rot.webm")
    page.locator("[data-testid=clip]").first.click()
    ae = edit_in_audio_editor(page)
    ae.keyboard.press("Control+s")
    page.wait_for_function("() => VE.state.project.clips.length === 2", timeout=30000)
    v = page.evaluate("VE.state.project.clips.find((c) => c.kind === 'video')")
    a = page.evaluate("VE.state.project.clips.find((c) => c.kind === 'audio')")
    assert v["volume"] == 0 and a["start"] == v["start"] and abs((a["out"] - a["in"]) - 1) < 0.05
    assert page.errors == [] and ae.errors == []
