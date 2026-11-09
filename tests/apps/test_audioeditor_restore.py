"""Audio editor: click removal and de-esser (effects.js)."""
from test_audioeditor import make_wav, open_files, ready
from test_audioeditor_loudness import fx


def test_click_removal(app_page, tmp_path):
    page = ready(app_page)
    r = page.evaluate("""() => { const rate = 44100, n = rate; const c = new Float32Array(n);
      for (let i = 0; i < n; i++) c[i] = 0.3 * Math.sin(2 * Math.PI * 220 * i / rate);
      const clean = c.slice();
      for (const at of [5000, 20000, 33333]) { c[at] += 0.8; c[at + 1] -= 0.6; }  // three clicks
      const out = AE.fx.removeClicks({ rate, channels: [c] }, 0, n, { sensitivity: 8, width: 2 });
      let err = 0; for (let i = 0; i < n; i++) err = Math.max(err, Math.abs(out.channels[0][i] - clean[i]));
      // a clean tone stays untouched
      const same = AE.fx.removeClicks({ rate, channels: [clean] }, 0, n, {});
      let diff = 0; for (let i = 0; i < n; i++) diff = Math.max(diff, Math.abs(same.channels[0][i] - clean[i]));
      return [out.clicks, err, same.clicks, diff]; }""")
    assert r[0] == 3 and r[1] < 0.02 and r[2] == 0 and r[3] == 0
    open_files(page, make_wav(tmp_path / "t.wav", seconds=0.5, rate=8000, channels=1, amp=0.3))
    page.evaluate("() => { const c = AE.state.tracks[0].clips[0].audio.channels[0]; c[1000] = 0.95; c[1001] = -0.9; }")
    fx(page, "clickRemoval", sensitivity=8, width=2)
    assert page.evaluate("Math.abs(AE.trackAudio(AE.state.tracks[0]).channels[0][1000])") < 0.35
    assert page.errors == []


def test_de_esser(app_page):
    page = ready(app_page)
    r = page.evaluate("""() => { const rate = 44100, n = rate; const c = new Float32Array(n);
      // a voice-like 200 Hz tone throughout, a loud 8 kHz "s" in the second half
      for (let i = 0; i < n; i++) c[i] = 0.3 * Math.sin(2 * Math.PI * 200 * i / rate) + (i > n / 2 ? 0.3 * Math.sin(2 * Math.PI * 8000 * i / rate) : 0);
      const out = AE.fx.deEss({ rate, channels: [c] }, 0, n, { frequency: 5000, threshold: -30, reduction: 12 }).channels[0];
      const band = (x, f, a, b) => { let re = 0, im = 0; for (let i = a; i < b; i++) { re += x[i] * Math.cos(2 * Math.PI * f * i / rate); im += x[i] * Math.sin(2 * Math.PI * f * i / rate); } return 2 * Math.hypot(re, im) / (b - a); };
      return [band(out, 8000, n * 0.6, n * 0.9), band(out, 200, n * 0.6, n * 0.9), band(out, 200, 1000, n * 0.4)]; }""")
    assert r[0] < 0.3 * 10 ** (-9 / 20)  # the sibilance is down by about 12 dB
    assert abs(r[1] - 0.3) < 0.03 and abs(r[2] - 0.3) < 0.01  # the voice stays
    assert page.errors == []
