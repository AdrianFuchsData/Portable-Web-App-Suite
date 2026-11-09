"""Audio editor: auto duck (as volume automation) and the parametric equaliser."""
from playwright.sync_api import expect

from test_audioeditor import make_wav, open_files, ready, wait_idle


def test_auto_duck(app_page, tmp_path):
    page = ready(app_page)
    # "voice": silence, 1 s tone (1.0–2.0 s), silence; "music": 4 s tone
    voice = make_wav(tmp_path / "voice.wav", seconds=4.0, rate=8000, channels=1, amp=0.5)
    open_files(page, voice, make_wav(tmp_path / "music.wav", seconds=4.0, rate=8000, channels=1, amp=0.3))
    page.evaluate("() => { const c = AE.state.tracks[0].clips[0].audio.channels[0]; for (let i = 0; i < c.length; i++) if (i < 8000 || i >= 16000) c[i] = 0; }")
    page.click("[data-testid=tracks-menu]")
    page.click("[data-testid=menu-autoDuck]")
    page.select_option("[data-testid=param-control]", page.evaluate("String(AE.state.tracks[0].id)"))
    page.fill("[data-testid=param-amount]", "-12")
    page.fill("[data-testid=param-fadeDown]", "0.5")
    page.fill("[data-testid=param-fadeUp]", "0.5")
    page.click("[data-testid=param-ok]")
    env = page.evaluate("AE.state.tracks[1].envelope")
    assert env == [{"t": 0.5, "db": 0}, {"t": 1, "db": -12}, {"t": 2, "db": -12}, {"t": 2.5, "db": 0}]
    assert not page.evaluate("AE.state.tracks[0].envelope && AE.state.tracks[0].envelope.length")
    # the mix follows: quieter during the voice
    peak = lambda a, b: page.evaluate(f"(() => {{ const t = AE.state.tracks[1]; const x = AE.trackAudio(t, 0, 32000); let m = 0; for (let i = {a}; i < {b}; i++) m = Math.max(m, Math.abs(x.channels[0][i])); return m; }})()")
    assert peak(0, 3000) > 0.29
    page.click("[data-testid=undo]")
    assert not page.evaluate("AE.state.tracks[1].envelope && AE.state.tracks[1].envelope.length")
    assert page.errors == []


def test_parametric_eq(app_page, tmp_path):
    page = ready(app_page)
    r = page.evaluate("""() => { const fs = 48000; const b = [{ type: 'peaking', freq: 1000, gain: 6, q: 1, on: true }, { type: 'highpass', freq: 100, gain: 0, q: 0.71, on: true }];
      return [AE.fx.eqResponseDb(b, fs, 1000), AE.fx.eqResponseDb(b, fs, 100), AE.fx.eqResponseDb(b, fs, 20), AE.fx.eqResponseDb(b, fs, 8000)]; }""")
    assert abs(r[0] - 6) < 0.1 and abs(r[1] - (-3)) < 0.3 and r[2] < -25 and abs(r[3]) < 0.5
    open_files(page, make_wav(tmp_path / "t.wav", seconds=1.0, rate=44100, channels=1, freq=1000, amp=0.25))
    page.click("[data-testid=effects]")
    page.click("[data-testid=menu-parametricEq]")
    expect(page.locator("[data-testid=peq-canvas]")).to_be_visible()
    page.fill("[data-testid=peq-gain-2]", "6")  # band 3: bell at 1 kHz
    page.locator("[data-testid=peq-gain-2]").press("Tab")
    # drag band 4 (3 kHz bell) up: its gain changes, the frequency follows the pointer
    canvas = page.locator("[data-testid=peq-canvas]")
    box = canvas.bounding_box()
    import math
    x = box["x"] + box["width"] * math.log(3000 / 20) / math.log(1000)
    y = box["y"] + box["height"] / 2
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x, y - box["height"] / 4, steps=4)
    page.mouse.up()
    bands = page.evaluate("AE.state.dialog.bands")
    assert bands[3]["gain"] > 8 and 2500 < bands[3]["freq"] < 3500
    page.fill("[data-testid=peq-gain-3]", "0")
    page.locator("[data-testid=peq-gain-3]").press("Tab")
    page.click("[data-testid=peq-ok]")
    wait_idle(page)
    peak = page.evaluate("AE.dsp.peak(AE.trackAudio(AE.state.tracks[0]), 4410, 44100)")
    assert abs(20 * math.log10(peak / 0.25) - 6) < 0.3
    # remembered for the next time
    page.click("[data-testid=effects]")
    page.click("[data-testid=menu-parametricEq]")
    expect(page.locator("[data-testid=peq-gain-2]")).to_have_value("6")
    assert page.errors == []
