/*
 * Further effects of the audio editor (same conventions as dsp.js: audio { rate, channels }, ranges [from, to), new arrays):
 * compressor/limiter, 3-band equaliser, reverb, pitch shift that keeps the tempo, and noise reduction (spectral gate).
 */
import * as dsp from '@app/dsp.js';
import { fft, timeStretch } from '@app/beats.js';

const clampRange = (a, from, to) => [Math.max(0, Math.min(from, dsp.length(a))), Math.max(0, Math.min(to, dsp.length(a)))];

/**
 * Dynamic range compression with linked channels: above `threshold` (dBFS) the level rises only 1/ratio as much; attack and
 * release (ms) smooth the gain; makeup (dB) raises the result. A high ratio (20) with a short attack works as a limiter.
 */
export function compress(a, from, to, { threshold = -18, ratio = 4, attack = 10, release = 150, makeup = 0 } = {}) {
  [from, to] = clampRange(a, from, to);
  const chans = a.channels.map((c) => c.slice());
  const att = Math.exp(-1 / Math.max(1, (attack / 1000) * a.rate)), rel = Math.exp(-1 / Math.max(1, (release / 1000) * a.rate));
  const mk = dsp.dbToGain(makeup);
  let env = 0; // level follower (linear)
  for (let i = from; i < to; i++) {
    let x = 0;
    for (const c of a.channels) { const v = Math.abs(c[i]); if (v > x) x = v; }
    env = x > env ? att * env + (1 - att) * x : rel * env + (1 - rel) * x;
    const db = dsp.gainToDb(env);
    const over = db - threshold;
    const g = (over > 0 ? dsp.dbToGain(-over * (1 - 1 / ratio)) : 1) * mk;
    for (const c of chans) c[i] *= g;
  }
  return { rate: a.rate, channels: chans };
}

/** Render the range through a chain of Web Audio nodes (offline); the result keeps the length of the range. */
async function through(a, from, to, build) {
  [from, to] = clampRange(a, from, to);
  const part = dsp.slice(a, from, to);
  const n = dsp.length(part);
  if (!n) return a;
  const ctx = new OfflineAudioContext(part.channels.length, n, a.rate);
  const buffer = ctx.createBuffer(part.channels.length, n, a.rate);
  part.channels.forEach((c, i) => buffer.copyToChannel(c, i));
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  build(ctx, src).connect(ctx.destination);
  src.start();
  const out = await ctx.startRendering();
  return dsp.replace(a, from, to, { rate: a.rate, channels: Array.from({ length: out.numberOfChannels }, (_, i) => out.getChannelData(i).slice()) });
}

/** Three-band equaliser: low shelf (bass, 120 Hz), peak (middle, 1 kHz), high shelf (treble, 6 kHz); gains in dB. */
export function equalize(a, from, to, { bass = 0, middle = 0, treble = 0 } = {}) {
  return through(a, from, to, (ctx, src) => {
    let node = src;
    for (const [type, frequency, gain] of [['lowshelf', 120, bass], ['peaking', 1000, middle], ['highshelf', 6000, treble]]) {
      if (!gain) continue;
      const f = ctx.createBiquadFilter();
      Object.assign(f, { type });
      f.frequency.value = frequency;
      f.gain.value = gain;
      if (type === 'peaking') f.Q.value = 0.8;
      node.connect(f);
      node = f;
    }
    return node;
  });
}

/** Reverb: a convolution with a decaying noise impulse response (`size` seconds), mixed with `wet` (0–1). */
export function reverb(a, from, to, { size = 1.5, wet = 0.3 } = {}) {
  return through(a, from, to, (ctx, src) => {
    const n = Math.max(1, Math.round(size * a.rate));
    const ir = ctx.createBuffer(2, n, a.rate);
    let seed = 12345; // deterministic noise: the same settings give the same result
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; };
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < n; i++) d[i] = rnd() * (1 - i / n) ** 3; }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    const dry = ctx.createGain(), wetGain = ctx.createGain(), out = ctx.createGain();
    dry.gain.value = 1 - wet * 0.5;
    wetGain.gain.value = wet;
    src.connect(dry); src.connect(conv); conv.connect(wetGain);
    dry.connect(out); wetGain.connect(out);
    return out;
  });
}

/** Change the pitch by `semitones` and keep the length: time-stretch by the factor, then resample back. */
export async function pitchShift(a, semitones) {
  const r = 2 ** (semitones / 12);
  if (Math.abs(r - 1) < 1e-6 || !dsp.length(a)) return a;
  const stretched = timeStretch(a, 1 / r); // r times longer
  const n = dsp.length(a);
  const ctx = new OfflineAudioContext(a.channels.length, n, a.rate);
  const buffer = ctx.createBuffer(a.channels.length, Math.max(1, dsp.length(stretched)), a.rate);
  stretched.channels.forEach((c, i) => buffer.copyToChannel(c, i));
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = r;
  src.connect(ctx.destination);
  src.start();
  const out = await ctx.startRendering();
  return { rate: a.rate, channels: Array.from({ length: out.numberOfChannels }, (_, i) => out.getChannelData(i).slice()) };
}

/**
 * Noise reduction (spectral gate): the noise level of every frequency is estimated from the quietest tenth of the frames
 * (or from `profile`, audio that contains only noise); bins below noise × (1 + sensitivity) are lowered by `reduction` dB.
 * STFT with 2048 samples, 75 % overlap, Hann window; the gains are smoothed over neighbouring bins and frames.
 */
export function reduceNoise(a, from, to, { reduction = 12, sensitivity = 1.5, profile = null } = {}) {
  [from, to] = clampRange(a, from, to);
  const N = 2048, H = N / 4;
  const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const floor = dsp.dbToGain(-reduction);
  const bins = N / 2 + 1;
  const spectra = (c, s, e) => {
    const frames = [];
    for (let p = s - N / 2; p < e; p += H) {
      const re = new Float32Array(N), im = new Float32Array(N);
      for (let i = 0; i < N; i++) { const j = p + i; re[i] = j >= s && j < e ? c[j] * win[i] : 0; }
      fft(re, im);
      frames.push({ p, re, im });
    }
    return frames;
  };
  const out = a.channels.map((c) => c.slice());
  a.channels.forEach((c, ci) => {
    const frames = spectra(c, from, to);
    if (!frames.length) return;
    // noise level per bin
    const noise = new Float32Array(bins);
    // frames that reach over the edges contain zeros: they would look like the quietest ones
    const inside = frames.filter((f) => f.p >= from && f.p + N <= to);
    const source = profile ? spectra(profile.channels[Math.min(ci, profile.channels.length - 1)], 0, dsp.length(profile)) : inside.length >= 4 ? inside : frames;
    const energy = source.map((f) => { let e = 0; for (let b = 0; b < bins; b++) e += f.re[b] ** 2 + f.im[b] ** 2; return e; });
    const order = energy.map((e, i) => [e, i]).sort((x, y) => x[0] - y[0]);
    const quiet = profile ? source : order.slice(0, Math.max(1, Math.floor(order.length / 10))).map(([, i]) => source[i]);
    for (const f of quiet) for (let b = 0; b < bins; b++) noise[b] += Math.hypot(f.re[b], f.im[b]) / quiet.length;
    // gains: gate, smoothed over 3 bins and over time
    let previous = new Float32Array(bins).fill(1);
    const acc = new Float32Array(to - from + N), norm = new Float32Array(to - from + N);
    for (const f of frames) {
      const g = new Float32Array(bins);
      for (let b = 0; b < bins; b++) g[b] = Math.hypot(f.re[b], f.im[b]) > noise[b] * (1 + sensitivity) ? 1 : floor;
      const smooth = new Float32Array(bins);
      for (let b = 0; b < bins; b++) smooth[b] = Math.max(g[b], ((g[b - 1] ?? g[b]) + g[b] + (g[b + 1] ?? g[b])) / 3);
      for (let b = 0; b < bins; b++) { smooth[b] = Math.max(smooth[b], previous[b] * 0.6); }
      previous = smooth;
      for (let b = 0; b < bins; b++) {
        f.re[b] *= smooth[b]; f.im[b] *= smooth[b];
        if (b > 0 && b < N / 2) { f.re[N - b] *= smooth[b]; f.im[N - b] *= smooth[b]; }
      }
      // inverse FFT via the conjugate
      for (let i = 0; i < N; i++) f.im[i] = -f.im[i];
      fft(f.re, f.im);
      for (let i = 0; i < N; i++) {
        const j = f.p + i - from;
        if (j < 0 || j >= to - from) continue;
        acc[j] += (f.re[i] / N) * win[i];
        norm[j] += win[i] * win[i];
      }
    }
    const dst = out[ci];
    for (let j = 0; j < to - from; j++) dst[from + j] = norm[j] > 1e-6 ? acc[j] / norm[j] : dst[from + j];
  });
  return { rate: a.rate, channels: out };
}
