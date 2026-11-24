"""Media player: audio visualisation (spectrum bars, waveform, circle) through the Web Audio analyser."""
from playwright.sync_api import expect

from helpers.media_samples import make_wav
from test_mediaplayer import NO_PICKERS, open_files, poll, wait_media

PAINTED = """() => { const c = document.querySelector('[data-testid=visualiser]'); if (!c || !c.width) return 0;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; }"""


def test_visualisation(app_page, tmp_path):
    page = app_page("mediaplayer", init_script=NO_PICKERS)
    open_files(page, make_wav(tmp_path / "tone.wav", 4.0, 440))
    wait_media(page, "v.readyState >= 1")
    page.select_option("[data-testid=vis]", "bars")
    expect(page.locator("[data-testid=visualiser]")).to_be_visible()
    page.evaluate("() => { if (MP.app.video.paused) MP.app.video.play(); }")  # (opening may already play)
    wait_media(page, "!v.paused && v.currentTime > 0.3")
    assert page.evaluate("MP.app.video === MP.app.graph.el")  # (played through Web Audio)
    poll(page, PAINTED)
    for mode in ("wave", "circle"):
        page.select_option("[data-testid=vis]", mode)
        poll(page, PAINTED)
    assert page.evaluate("!MP.app.video.paused")  # (switching modes keeps playing)
    # remembered; off shows the note again
    assert page.evaluate("JSON.parse(localStorage.getItem('suite.mediaplayer')).vis") == "circle"
    page.select_option("[data-testid=vis]", "off")
    expect(page.locator("[data-testid=visualiser]")).to_have_count(0)
    assert page.errors == []
