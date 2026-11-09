"""Audio editor: loudness (BS.1770 / EBU R 128) – measuring and normalising to LUFS –, truncating silence and the noise gate."""
import math

from playwright.sync_api import expect

from test_audioeditor import make_wav, open_files, ready, select, track_lengths, wait_idle


def fx(page, name, **params):
    before = page.evaluate("AE.state.history.length")
    page.click("[data-testid=effects]")
    page.click(f"[data-testid=menu-{name}]")
    if params:
        for k, v in params.items():
            page.fill(f"[data-testid=param-{k}]", str(v))
        page.click("[data-testid=param-ok]")
    page.wait_for_function(f"() => !AE.state.busy && AE.state.history.length === {before + 1}", timeout=60000)


def test_loudness_measure_and_normalise(app_page, tmp_path):
    page = ready(app_page)
    # reference values: a 1 kHz sine of peak A, mono, is about 20·log10(A) − 3.01 LUFS (BS.1770: K-weighting ≈ +0.69 dB at 1 kHz)
    r = page.evaluate("""() => { const rate = 48000, n = rate * 3; const sine = (amp, ch) => ({ rate, channels: Array.from({ length: ch }, () => Float32Array.from({ length: n }, (_, i) => amp * Math.sin(2 * Math.PI * 1000 * i / rate))) });
      return [AE.fx.loudness(sine(1, 1)), AE.fx.loudness(sine(0.1, 1)), AE.fx.loudness(sine(0.1, 2)), AE.fx.loudness({ rate, channels: [new Float32Array(n)] })]; }""")
    assert abs(r[0] - (-3.01)) < 0.15 and abs(r[1] - (-23.01)) < 0.15 and abs(r[2] - (-20.0)) < 0.15 and r[3] == -math.inf
    open_files(page, make_wav(tmp_path / "quiet.wav", seconds=2.0, rate=16000, channels=1, freq=1000, amp=0.05))
    page.click("[data-testid=effects]")
    page.click("[data-testid=menu-measureLoudness]")
    lufs = page.evaluate("AE.state.loudness.lufs")
    assert abs(lufs - (20 * math.log10(0.05) - 3.01)) < 0.3
    fx(page, "loudness", lufs=-16, ceiling=-1)
    after = page.evaluate("AE.fx.loudness(AE.trackAudio(AE.state.tracks[0]))")
    assert abs(after - (-16)) < 0.2
    # the ceiling wins: −2 LUFS would need a peak of about +1 dBFS
    page.click("[data-testid=undo]")
    fx(page, "loudness", lufs=-2, ceiling=-1)
    peak = page.evaluate("AE.dsp.peak(AE.trackAudio(AE.state.tracks[0]))")
    assert abs(20 * math.log10(peak) - (-1)) < 0.05
    assert page.errors == []


def test_truncate_silence_and_gate(app_page, tmp_path):
    page = ready(app_page)
    # 0.5 s tone, 1.5 s silence, 0.5 s tone (8 kHz)
    page.evaluate("""() => { const rate = 8000; const parts = [[0.5, 0.5], [1.5, 0], [0.5, 0.5]]; const n = parts.reduce((s, p) => s + p[0] * rate, 0);
      const c = new Float32Array(n); let o = 0; for (const [sec, amp] of parts) { for (let i = 0; i < sec * rate; i++) c[o + i] = amp * Math.sin(2 * Math.PI * 440 * i / rate); o += sec * rate; }
      window.TEST_AUDIO = { rate, channels: [c] }; }""")
    out = page.evaluate("AE.dsp.length(AE.fx.truncateSilence(TEST_AUDIO, { threshold: -40, minLength: 0.5, keep: 0.2 }))")
    assert abs(out - (0.5 + 0.2 + 0.5) * 8000) < 40  # the 1.5 s pause is now 0.2 s (sine zero crossings count as quiet only briefly)
    assert page.evaluate("AE.dsp.length(AE.fx.truncateSilence(TEST_AUDIO, { threshold: -40, minLength: 2, keep: 0.2 }))") == 20000
    # gate: a quiet hum (−46 dBFS) between loud notes is pushed down, the notes stay
    g = page.evaluate("""() => { const rate = 8000, n = rate * 2; const c = new Float32Array(n);
      for (let i = 0; i < n; i++) c[i] = (i < rate / 2 ? 0.5 : 0.005) * Math.sin(2 * Math.PI * 300 * i / rate);
      const out = AE.fx.noiseGate({ rate, channels: [c] }, 0, n, { threshold: -30, reduction: 40, attack: 1, hold: 50, release: 50 }).channels[0];
      const peak = (a, b) => { let m = 0; for (let i = a; i < b; i++) m = Math.max(m, Math.abs(out[i])); return m; };
      return [peak(1000, 3000), peak(12000, 16000)]; }""")
    assert g[0] > 0.45 and g[1] < 0.005 * 10 ** (-30 / 20)
    # through the menu: the length of the track changes
    open_files(page, make_wav(tmp_path / "x.wav", seconds=1.0, rate=8000, channels=1, amp=0.0))
    fx(page, "truncateSilence", threshold=-40, minLength=0.5, keep=0.25)
    wait_idle(page)
    assert track_lengths(page) == [2000]
    assert page.errors == []
