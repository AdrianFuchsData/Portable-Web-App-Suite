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

// ---- loudness (ITU-R BS.1770 / EBU R 128) ---------------------------------------------------------------------------------------

/** The two K-weighting biquads (high shelf about +4 dB above 1.7 kHz, high pass at 38 Hz) for a sample rate (libebur128's formulas). */
function kWeighting(fs) {
  let K = Math.tan((Math.PI * 1681.974450955533) / fs);
  const Q1 = 0.7071752369554196, Vh = 10 ** (3.999843853973347 / 20), Vb = Vh ** 0.4996667741545416;
  let a0 = 1 + K / Q1 + K * K;
  const shelf = { b: [(Vh + (Vb * K) / Q1 + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q1 + K * K) / a0], a: [(2 * (K * K - 1)) / a0, (1 - K / Q1 + K * K) / a0] };
  K = Math.tan((Math.PI * 38.13547087602444) / fs);
  const Q2 = 0.5003270373238773;
  a0 = 1 + K / Q2 + K * K;
  const hp = { b: [1, -2, 1], a: [(2 * (K * K - 1)) / a0, (1 - K / Q2 + K * K) / a0] };
  return [shelf, hp];
}

function biquad(x, { b, a }) {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/**
 * Integrated loudness (LUFS) of the range: K-weighted mean square in 400 ms blocks (75 % overlap), gated at −70 LUFS and
 * 10 LU below the ungated mean. -Infinity for silence (or ranges shorter than one block).
 */
export function loudness(a, from = 0, to = dsp.length(a)) {
  [from, to] = clampRange(a, from, to);
  const [shelf, hp] = kWeighting(a.rate);
  const weighted = a.channels.map((c) => biquad(biquad(c.subarray(from, to), shelf), hp));
  const n = to - from, block = Math.round(0.4 * a.rate), step = Math.round(0.1 * a.rate);
  if (n < block) return -Infinity;
  // running sums of squares for fast block means
  const sums = weighted.map((w) => { const s = new Float64Array(w.length + 1); for (let i = 0; i < w.length; i++) s[i + 1] = s[i] + w[i] * w[i]; return s; });
  const powers = [];
  for (let s = 0; s + block <= n; s += step) powers.push(sums.reduce((acc, sum) => acc + (sum[s + block] - sum[s]) / block, 0));
  const lufs = (p) => -0.691 + 10 * Math.log10(p);
  const mean = (list) => list.reduce((x, y) => x + y, 0) / list.length;
  const abs = powers.filter((p) => lufs(p) > -70);
  if (!abs.length) return -Infinity;
  const relGate = lufs(mean(abs)) - 10;
  const rel = abs.filter((p) => lufs(p) > relGate);
  return rel.length ? lufs(mean(rel)) : -Infinity;
}

// ---- silence and gating -------------------------------------------------------------------------------------------------------

/**
 * Shorten pauses: every stretch at least `minLength` seconds long where all channels stay below `threshold` (dBFS) is cut down
 * to `keep` seconds (half of it kept at each end). The length changes.
 */
export function truncateSilence(a, { threshold = -40, minLength = 0.5, keep = 0.25 } = {}) {
  const n = dsp.length(a), thr = dsp.dbToGain(threshold);
  const min = Math.max(1, Math.round(minLength * a.rate)), k = Math.max(0, Math.round(keep * a.rate));
  const cuts = []; // [from, to) to remove
  let start = -1;
  for (let i = 0; i <= n; i++) {
    let quiet = i < n;
    if (quiet) for (const c of a.channels) if (Math.abs(c[i]) >= thr) { quiet = false; break; }
    if (quiet) { if (start < 0) start = i; continue; }
    if (start >= 0 && i - start >= min && i - start > k) { const head = Math.floor(k / 2); cuts.push([start + head, i - (k - head)]); }
    start = -1;
  }
  if (!cuts.length) return a;
  const keepParts = [];
  let pos = 0;
  for (const [s, e] of cuts) { keepParts.push([pos, s]); pos = e; }
  keepParts.push([pos, n]);
  const total = keepParts.reduce((m, [s, e]) => m + (e - s), 0);
  const channels = a.channels.map((c) => {
    const out = new Float32Array(total);
    let o = 0;
    for (const [s, e] of keepParts) { out.set(c.subarray(s, e), o); o += e - s; }
    return out;
  });
  return { rate: a.rate, channels };
}

/**
 * Noise gate: below `threshold` (dBFS) the sound is turned down by `reduction` (dB); it opens within `attack` ms, stays open
 * `hold` ms after the level falls and closes within `release` ms. Channels are gated together.
 */
export function noiseGate(a, from, to, { threshold = -40, reduction = 60, attack = 5, hold = 80, release = 150 } = {}) {
  [from, to] = clampRange(a, from, to);
  const chans = a.channels.map((c) => c.slice());
  const thr = dsp.dbToGain(threshold), floor = dsp.dbToGain(-Math.abs(reduction));
  const att = 1 - Math.exp(-1 / Math.max(1, (attack / 1000) * a.rate)), rel = 1 - Math.exp(-1 / Math.max(1, (release / 1000) * a.rate));
  const holdN = Math.round((hold / 1000) * a.rate);
  let g = floor, held = 0;
  for (let i = from; i < to; i++) {
    let x = 0;
    for (const c of a.channels) { const v = Math.abs(c[i]); if (v > x) x = v; }
    if (x >= thr) held = holdN; else if (held > 0) held--;
    const target = x >= thr || held > 0 ? 1 : floor;
    g += (target - g) * (target > g ? att : rel);
    for (const c of chans) c[i] *= g;
  }
  return { rate: a.rate, channels: chans };
}

// ---- spectrum analysis ----------------------------------------------------------------------------------------------------------

/**
 * The average spectrum of mono audio (Welch: Hann windows of `size` samples, half overlapping): { freqs, db } with one value per
 * FFT bin up to Nyquist; levels in dB relative to a full-scale sine (0 dB).
 */
export function spectrum(mono, rate, size = 4096) {
  const n = mono.length;
  const win = new Float64Array(size);
  let wsum = 0;
  for (let i = 0; i < size; i++) { win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)); wsum += win[i]; }
  const power = new Float64Array(size / 2 + 1);
  const re = new Float64Array(size), im = new Float64Array(size);
  let frames = 0;
  const hop = size / 2;
  const starts = [];
  if (n <= size) starts.push(0); else for (let s = 0; s + size <= n; s += hop) starts.push(s);
  for (const s of starts) {
    for (let i = 0; i < size; i++) { re[i] = (s + i < n ? mono[s + i] : 0) * win[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k <= size / 2; k++) power[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
  }
  // a sine of amplitude A gives |X| = A · Σw / 2 at its bin
  const ref = (wsum / 2) ** 2;
  const freqs = new Float64Array(size / 2 + 1), db = new Float64Array(size / 2 + 1);
  for (let k = 0; k <= size / 2; k++) { freqs[k] = (k * rate) / size; db[k] = 10 * Math.log10(Math.max(1e-20, power[k] / frames / ref)); }
  return { freqs, db, size, rate };
}

const NOTES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
/** The note nearest to a frequency (A4 = 440 Hz), with the deviation in cents: "A4 +3". */
export function noteOf(hz) {
  if (!(hz > 0)) return '';
  const m = 69 + 12 * Math.log2(hz / 440);
  const r = Math.round(m);
  const cents = Math.round((m - r) * 100);
  return `${NOTES[((r % 12) + 12) % 12]}${Math.floor(r / 12) - 1}${cents ? ` ${cents > 0 ? '+' : ''}${cents}` : ''}`;
}

/** The highest peak near a frequency (within ±range bins): { hz (interpolated), db }. */
export function peakNear(sp, hz, range = 8) {
  const k0 = Math.round((hz * sp.size) / sp.rate);
  let best = Math.max(1, Math.min(sp.db.length - 2, k0));
  for (let k = Math.max(1, k0 - range); k <= Math.min(sp.db.length - 2, k0 + range); k++) if (sp.db[k] > sp.db[best]) best = k;
  // parabolic interpolation of the peak in dB
  const a = sp.db[best - 1], b = sp.db[best], c = sp.db[best + 1];
  const p = (a - 2 * b + c) ? (0.5 * (a - c)) / (a - 2 * b + c) : 0;
  return { hz: ((best + p) * sp.rate) / sp.size, db: b - 0.25 * (a - c) * p };
}

// ---- restoration: clicks, sibilance ----------------------------------------------------------------------------------------------

/** RBJ cookbook biquad coefficients { b: [b0, b1, b2], a: [a1, a2] } (normalised) for type, frequency, Q and gain (dB). */
export function rbj(type, fs, f0, q = Math.SQRT1_2, gainDb = 0) {
  const A = 10 ** (gainDb / 40), w = (2 * Math.PI * Math.min(f0, fs * 0.49)) / fs, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'highpass') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; } else if (type === 'lowpass') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; } else if (type === 'notch') { b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; } else if (type === 'peaking') { b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; } else {
    const s = 2 * Math.sqrt(A) * al, sign = type === 'lowshelf' ? 1 : -1;
    b0 = A * ((A + 1) - sign * (A - 1) * cw + s); b1 = sign * 2 * A * ((A - 1) - sign * (A + 1) * cw); b2 = A * ((A + 1) - sign * (A - 1) * cw - s);
    a0 = (A + 1) + sign * (A - 1) * cw + s; a1 = -sign * 2 * ((A - 1) + sign * (A + 1) * cw); a2 = (A + 1) + sign * (A - 1) * cw - s;
  }
  return { b: [b0 / a0, b1 / a0, b2 / a0], a: [a1 / a0, a2 / a0] };
}

/**
 * Remove clicks and crackle: a sample whose high-frequency part (second difference) is `sensitivity` times above its
 * neighbourhood (median of the surrounding 20 ms) starts a click; clicks up to `width` ms are replaced by a smooth curve
 * (cubic Hermite) between the samples around them. Returns the audio and the number of clicks (`clicks`).
 */
export function removeClicks(a, from, to, { sensitivity = 8, width = 2 } = {}) {
  [from, to] = clampRange(a, from, to);
  const maxW = Math.max(1, Math.round((width / 1000) * a.rate));
  const win = Math.max(16, Math.round(0.02 * a.rate));
  let clicks = 0;
  const chans = a.channels.map((c) => {
    const out = c.slice();
    const n = to - from;
    const d2 = new Float32Array(n);
    for (let i = 1; i < n - 1; i++) d2[i] = Math.abs(c[from + i - 1] - 2 * c[from + i] + c[from + i + 1]);
    // a slowly updated neighbourhood level: the median of blocks
    const block = win, levels = new Float32Array(Math.ceil(n / block));
    for (let b = 0; b < levels.length; b++) {
      const part = Array.from(d2.subarray(Math.max(0, b * block - block), Math.min(n, b * block + 2 * block))).sort((x, y) => x - y);
      levels[b] = Math.max(1e-6, part[Math.floor(part.length / 2)] || 0);
    }
    for (let i = 2; i < n - 2; i++) {
      if (d2[i] <= sensitivity * 4 * levels[Math.floor(i / block)]) continue;
      // the click: until the samples are calm again (at most maxW)
      let j = i;
      while (j < n - 2 && j - i < maxW * 2 && d2[j] > sensitivity * levels[Math.floor(j / block)]) j++;
      if (j - i > maxW) { i = j; continue; } // (too long for a click: a real sound)
      const s = from + Math.max(1, i - 2), e = from + Math.min(n - 2, j + 1);
      const p0 = c[s], p1 = c[e], m0 = c[s] - c[s - 1], m1 = c[e + 1] - c[e];
      const len = e - s;
      for (let k = 1; k < len; k++) {
        const t = k / len, t2 = t * t, t3 = t2 * t;
        out[s + k] = (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 * len + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1 * len;
      }
      clicks++;
      i = j + 2;
    }
    return out;
  });
  return { rate: a.rate, channels: chans, clicks };
}

/**
 * De-esser: the band above `frequency` (sharp "s" and "sh" sounds) is turned down while it is louder than `threshold` (dBFS),
 * by at most `reduction` dB. The rest of the sound stays as it is (the band is split off exactly: low + high = input).
 */
export function deEss(a, from, to, { frequency = 6000, threshold = -30, reduction = 12, attack = 1, release = 60 } = {}) {
  [from, to] = clampRange(a, from, to);
  const hp = rbj('highpass', a.rate, frequency, Math.SQRT1_2);
  // forwards and backwards: no phase shift, so the band can be taken away exactly where it is too loud
  const highs = a.channels.map((c) => biquad(biquad(c.subarray(from, to), hp).reverse(), hp).reverse());
  const thr = dsp.dbToGain(threshold), floor = dsp.dbToGain(-Math.abs(reduction));
  const att = 1 - Math.exp(-1 / Math.max(1, (attack / 1000) * a.rate)), rel = 1 - Math.exp(-1 / Math.max(1, (release / 1000) * a.rate));
  let env = 0;
  const chans = a.channels.map((c) => c.slice());
  for (let i = 0; i < to - from; i++) {
    let x = 0;
    for (const h of highs) { const v = Math.abs(h[i]); if (v > x) x = v; }
    env += (x - env) * (x > env ? att : rel);
    const g = env > thr ? Math.max(floor, thr / env) : 1;
    if (g < 1) for (let ch = 0; ch < chans.length; ch++) chans[ch][from + i] -= highs[ch][i] * (1 - g);
  }
  return { rate: a.rate, channels: chans };
}

// ---- parametric equaliser ------------------------------------------------------------------------------------------------------

export const EQ_TYPES = ['peaking', 'lowshelf', 'highshelf', 'lowpass', 'highpass', 'notch'];

/** Response in dB of a band list [{ type, freq, gain, q, on }] at frequency f (sample rate fs). */
export function eqResponseDb(bands, fs, f) {
  const w = (2 * Math.PI * f) / fs, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
  let db = 0;
  for (const band of bands) {
    if (band.on === false) continue;
    const { b, a } = rbj(band.type, fs, band.freq, band.q, band.gain);
    const nr = b[0] + b[1] * c1 + b[2] * c2, ni = -(b[1] * s1 + b[2] * s2);
    const dr = 1 + a[0] * c1 + a[1] * c2, di = -(a[0] * s1 + a[1] * s2);
    db += 10 * Math.log10(Math.max(1e-24, (nr * nr + ni * ni) / (dr * dr + di * di)));
  }
  return db;
}

/** Filter the range through the bands (RBJ biquads in series). */
export function parametricEq(a, from, to, bands) {
  [from, to] = clampRange(a, from, to);
  const active = bands.filter((b) => b.on !== false).map((b) => rbj(b.type, a.rate, b.freq, b.q, b.gain));
  if (!active.length) return a;
  return {
    rate: a.rate,
    channels: a.channels.map((c) => {
      let part = c.subarray(from, to);
      for (const f of active) part = biquad(part, f);
      const out = c.slice();
      out.set(Float32Array.from(part), from);
      return out;
    }),
  };
}

// ---- auto-duck ------------------------------------------------------------------------------------------------------------------

/**
 * Where the control audio (e.g. a voice) is louder than `threshold` (dBFS RMS over 50 ms): [[start, end], …] in seconds, pauses
 * shorter than `maxPause` seconds joined.
 */
export function activeRegions(mono, rate, { threshold = -30, maxPause = 1 } = {}) {
  const win = Math.max(1, Math.round(0.05 * rate)), thr = dsp.dbToGain(threshold);
  const out = [];
  let start = -1;
  for (let s = 0; s < mono.length; s += win) {
    let sum = 0;
    const e = Math.min(mono.length, s + win);
    for (let i = s; i < e; i++) sum += mono[i] * mono[i];
    const loud = Math.sqrt(sum / (e - s)) >= thr;
    if (loud && start < 0) start = s;
    if (!loud && start >= 0) { out.push([start / rate, s / rate]); start = -1; }
  }
  if (start >= 0) out.push([start / rate, mono.length / rate]);
  const joined = [];
  for (const r of out) {
    const last = joined[joined.length - 1];
    if (last && r[0] - last[1] < maxPause) last[1] = r[1]; else joined.push([...r]);
  }
  return joined;
}

/**
 * The volume automation that ducks by `amount` dB (negative) during the regions: fading down `fadeDown` seconds before each
 * and up `fadeUp` seconds after it, added to an existing automation `base` (points [{ t, db }]; dbAt(t) gives its level).
 */
export function duckEnvelope(regions, { amount = -12, fadeDown = 0.5, fadeUp = 0.5 } = {}, base = [], dbAt = () => 0) {
  // the ducking curve on its own
  const pts = [];
  for (const [s, e] of regions) {
    const a = Math.max(0, s - fadeDown), b = e + fadeUp;
    const last = pts[pts.length - 1];
    if (last && a <= last.t) pts.pop(); // (close to the previous one: it stays down in between)
    else pts.push({ t: a, db: 0 }, { t: s, db: amount });
    pts.push({ t: e, db: amount }, { t: b, db: 0 });
  }
  if (!pts.length) return base;
  const duckAt = (t) => {
    if (t <= pts[0].t) return pts[0].db;
    if (t >= pts[pts.length - 1].t) return pts[pts.length - 1].db;
    let i = 1;
    while (pts[i].t < t) i++;
    const p = pts[i - 1], q = pts[i];
    return p.db + ((q.db - p.db) * (t - p.t)) / Math.max(1e-9, q.t - p.t);
  };
  const times = [...new Set([...pts.map((p) => p.t), ...base.map((p) => p.t)])].sort((x, y) => x - y);
  return times.map((t) => ({ t: Math.round(t * 1000) / 1000, db: Math.round((dbAt(t) + duckAt(t)) * 10) / 10 }));
}
