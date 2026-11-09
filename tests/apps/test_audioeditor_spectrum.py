"""Audio editor: frequency analysis (plot spectrum) – peaks at the right frequency and level, note names, CSV export."""
import re

from playwright.sync_api import expect

from test_audioeditor import make_wav, open_files, ready


def test_spectrum(app_page, tmp_path):
    page = ready(app_page)
    r = page.evaluate("""() => { const rate = 48000, n = rate; const x = new Float32Array(n);
      for (let i = 0; i < n; i++) x[i] = 0.5 * Math.sin(2 * Math.PI * 1000 * i / rate) + 0.05 * Math.sin(2 * Math.PI * 3000 * i / rate);
      const sp = AE.fx.spectrum(x, rate, 8192);
      const p1 = AE.fx.peakNear(sp, 1000), p3 = AE.fx.peakNear(sp, 3000);
      return [p1.hz, p1.db, p3.hz, p3.db, AE.fx.noteOf(440), AE.fx.noteOf(261.63), AE.fx.noteOf(450)]; }""")
    assert abs(r[0] - 1000) < 1 and abs(r[1] - (-6.02)) < 0.5  # amplitude 0.5: −6 dB
    assert abs(r[2] - 3000) < 1 and abs(r[3] - (-26.02)) < 0.5
    assert r[4] == "A4" and r[5] == "C4" and r[6] == "A4 +39"
    open_files(page, make_wav(tmp_path / "a.wav", seconds=1.0, rate=22050, channels=1, freq=440, amp=0.5))
    page.click("[data-testid=tracks-menu]")
    page.click("[data-testid=menu-plotSpectrum]")
    canvas = page.locator("[data-testid=spectrum-canvas]")
    expect(canvas).to_be_visible()
    box = canvas.bounding_box()
    # point at 440 Hz on the logarithmic axis (20 Hz … 11025 Hz)
    import math
    x = box["x"] + box["width"] * math.log(440 / 20) / math.log(11025 / 20)
    page.mouse.move(x, box["y"] + box["height"] / 2)
    readout = page.locator("[data-testid=spectrum-readout]")
    expect(readout).to_contain_text("A4")
    expect(readout).to_contain_text(re.compile(r"peak (439\.\d|440\.\d) Hz"))
    page.select_option("[data-testid=spectrum-size]", "1024")
    assert page.evaluate("AE.state.dialog.size") == 1024
    with page.expect_download() as d:
        page.click("[data-testid=spectrum-csv]")
    lines = open(d.value.path()).read().splitlines()
    assert lines[0] == "frequency_hz;level_db" and len(lines) == 513
    page.click("[data-testid=spectrum-close]")
    expect(page.locator("[data-testid=spectrum-dialog]")).to_have_count(0)
    assert page.errors == []
