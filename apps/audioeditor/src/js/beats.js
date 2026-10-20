/*
 * Beat and cue detection and tempo changes that keep the pitch.
 *
 * onsetEnvelope: spectral flux (positive change of the log magnitude spectrum, Hann window, about 86 frames per second).
 * detectBeats: tempo from the autocorrelation of the envelope (weighted towards 120 BPM), then a constant-tempo grid
 * (tempo and phase) that maximises the envelope at the beat positions, like the beat grids of DJ software.
 * detectCues: the strongest onsets with a minimum distance (plus the first sound).
 * timeStretch: WSOLA (waveform similarity overlap-add) – the tempo changes, the pitch stays.
 */

/** In-place radix-2 FFT of (re, im); n must be a power of 2. */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

/** Onset strength per frame: { env, hop, fps, delay } (delay: samples from the frame position to the onset it reports). */
export function onsetEnvelope(mono, rate) {
  const hop = 2 ** Math.max(6, Math.round(Math.log2(rate / 86)));
  const win = hop * 2;
  const frames = Math.max(0, Math.floor((mono.length - win) / hop) + 1);
  const env = new Float32Array(frames);
  const hann = new Float32Array(win).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / win));
  const re = new Float64Array(win), im = new Float64Array(win);
  const bins = win / 2;
  let prev = new Float32Array(bins), cur = new Float32Array(bins);
  for (let f = 0; f < frames; f++) {
    const o = f * hop;
    for (let i = 0; i < win; i++) { re[i] = mono[o + i] * hann[i]; im[i] = 0; }
    fft(re, im);
    let flux = 0;
    for (let k = 1; k < bins; k++) {
      cur[k] = Math.log1p(100 * Math.hypot(re[k], im[k]));
      const d = cur[k] - prev[k];
      if (d > 0 && f) flux += d;
    }
    env[f] = flux;
    [prev, cur] = [cur, prev];
  }
  // remove the slowly changing part (loudness), keep the peaks
  const w = Math.max(1, Math.round(rate / hop / 2));
  const out = new Float32Array(frames);
  let sum = 0;
  for (let i = 0; i < frames; i++) {
    sum += env[i];
    if (i >= 2 * w + 1) sum -= env[i - 2 * w - 1];
    const lo = Math.max(0, i - 2 * w), n = i - lo + 1;
    const c = i - w;
    if (c >= 0) out[c] = Math.max(0, env[c] - sum / n);
  }
  for (let c = Math.max(0, frames - w); c < frames; c++) out[c] = Math.max(0, env[c] - sum / Math.min(frames, 2 * w + 1));
  return { env: out, hop, fps: rate / hop, delay: win - hop };
}

const smooth = (env) => env.map((_, i) => 0.25 * (env[i - 1] || 0) + 0.5 * env[i] + 0.25 * (env[i + 1] || 0));
const at = (env, x) => { const i = Math.floor(x), f = x - i; return i < 0 || i + 1 >= env.length ? 0 : env[i] * (1 - f) + env[i + 1] * f; };

/** Tempo (BPM) from the autocorrelation of the envelope. */
export function estimateTempo(env, fps, { min = 60, max = 200, prefer = 120 } = {}) {
  const n = env.length;
  const mean = env.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const x = env.map((v) => v - mean);
  const lo = Math.max(1, Math.floor((60 * fps) / max)), hi = Math.min(n - 1, Math.ceil((60 * fps) / min));
  const ac = new Float64Array(hi + 2);
  for (let lag = lo - 1; lag <= hi + 1; lag++) { let s = 0; for (let i = lag; i < n; i++) s += x[i] * x[i - lag]; ac[lag] = s / (n - lag); }
  let best = -1, bestScore = -Infinity;
  for (let lag = lo; lag <= hi; lag++) {
    const bpm = (60 * fps) / lag;
    const score = ac[lag] * Math.exp(-0.5 * Math.log2(bpm / prefer) ** 2);
    if (score > bestScore && ac[lag] >= ac[lag - 1] && ac[lag] >= ac[lag + 1]) { bestScore = score; best = lag; }
  }
  if (best < 0) return 0;
  const [a, b, c] = [ac[best - 1], ac[best], ac[best + 1]];
  const d = a - 2 * b + c;
  return (60 * fps) / (best + (d ? (0.5 * (a - c)) / d : 0));
}

/** Constant-tempo beat grid { bpm, phase (samples) } of mono audio, or null if no tempo is found. */
export function detectBeats(mono, rate, options = {}) {
  const { env: raw, fps, hop, delay } = onsetEnvelope(mono, rate);
  if (raw.length < fps * 2) return null;
  const env = smooth(raw);
  const bpm0 = options.bpm || estimateTempo(env, fps, options);
  if (!bpm0) return null;
  // fine search around the estimate: period and phase that collect the most onset strength
  let best = { score: -1 };
  const p0 = (60 * fps) / bpm0;
  for (let step = -60; step <= 60; step++) {
    const period = p0 * (1 + step * 0.0005);
    for (let phase = 0; phase < period; phase += 0.25) {
      let s = 0, k = 0;
      for (let x = phase; x < env.length; x += period, k++) s += at(env, x);
      s /= Math.max(1, k);
      if (s > best.score) best = { score: s, period, phase };
    }
  }
  const period = best.period * hop;
  const phase = best.phase * hop + delay;
  return { bpm: Math.round(((60 * rate) / period) * 100) / 100, phase: phase - Math.floor(phase / period) * period };
}

/**
 * Cue points (sample positions): the first sound and the strongest onsets, at least minGap seconds apart.
 * sensitivity 0…1: more cues with higher values.
 */
export function detectCues(mono, rate, { sensitivity = 0.5, minGap = 2 } = {}) {
  const { env: raw, fps, hop, delay } = onsetEnvelope(mono, rate);
  const env = smooth(raw);
  const n = env.length;
  const cues = [];
  const threshold = 10 ** (-40 / 20);
  const first = mono.findIndex((v) => Math.abs(v) > threshold);
  if (first >= 0) cues.push(first);
  if (!n) return cues;
  const mean = env.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(env.reduce((a, b) => a + (b - mean) ** 2, 0) / n) || 1;
  const limit = mean + (1 + 5 * (1 - sensitivity)) * sd;
  const w = Math.max(1, Math.round(fps * 0.05));
  const peaks = [];
  for (let i = 0; i < n; i++) {
    if (env[i] < limit) continue;
    let max = true;
    for (let j = Math.max(0, i - w); j <= Math.min(n - 1, i + w) && max; j++) if (env[j] > env[i] || (env[j] === env[i] && j < i)) max = false;
    if (max) peaks.push(i);
  }
  peaks.sort((a, b) => env[b] - env[a]);
  const gap = minGap * rate;
  for (const i of peaks) {
    const pos = Math.max(0, Math.round(i * hop + delay));
    if (cues.every((c) => Math.abs(c - pos) >= gap)) cues.push(pos);
  }
  return cues.sort((a, b) => a - b);
}

/**
 * Change the tempo, keep the pitch (WSOLA). factor > 1 is faster (shorter). Works on all channels with the same
 * frame positions (found on the mono mix), so the stereo image stays intact.
 */
export function timeStretch(audio, factor) {
  const rate = audio.rate, chans = audio.channels;
  const len = chans[0] ? chans[0].length : 0;
  const outLen = Math.max(0, Math.round(len / factor));
  if (!len || Math.abs(factor - 1) < 1e-6) return { rate, channels: chans.map((c) => c.slice()) };
  const N = 2 * Math.round((rate * 0.04) / 2); // 40 ms frames
  const Hs = N / 2, Ha = Hs * factor, tol = Math.round(N / 4);
  // mono mix with zero padding (no bounds checks in the search), and a version decimated by 4 for the coarse search
  const pad = N + tol + 8;
  const mono = new Float32Array(len + 2 * pad);
  for (const c of chans) for (let i = 0; i < len; i++) mono[pad + i] += c[i] / chans.length;
  const dec = new Float32Array(Math.ceil(mono.length / 4));
  for (let i = 0; i < dec.length; i++) dec[i] = mono[4 * i] + (mono[4 * i + 1] || 0) + (mono[4 * i + 2] || 0) + (mono[4 * i + 3] || 0);
  const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const out = chans.map(() => new Float32Array(outLen + N));
  const norm = new Float32Array(outLen + N);
  // similarity of the overlap: natural continuation of the previous frame (a) vs. candidate (b)
  const corr = (a, b) => { let s = 0; a += pad; b += pad; for (let i = 0; i < Hs; i++) s += mono[a + i] * mono[b + i]; return s; };
  const corr4 = (a, b) => { let s = 0; a = (a + pad) >> 2; b = (b + pad) >> 2; for (let i = 0, n = Hs >> 2; i < n; i++) s += dec[a + i] * dec[b + i]; return s; };
  let prev = 0;
  for (let k = 0; k * Hs < outLen; k++) {
    let pos = Math.min(len, Math.round(k * Ha));
    if (k > 0) {
      const target = prev + Hs;
      let best = pos, bestScore = -Infinity;
      for (let d = -tol; d <= tol; d += 4) { const s = corr4(target, pos + d); if (s > bestScore) { bestScore = s; best = pos + d; } }
      const coarse = best;
      bestScore = -Infinity;
      for (let d = -3; d <= 3; d++) { const s = corr(target, coarse + d); if (s > bestScore) { bestScore = s; best = coarse + d; } }
      pos = best;
    }
    const o = k * Hs;
    const i0 = Math.max(0, -pos), i1 = Math.min(N, len - pos);
    for (let i = i0; i < i1; i++) norm[o + i] += win[i];
    for (let ci = 0; ci < chans.length; ci++) { const src = chans[ci], dst = out[ci]; for (let i = i0; i < i1; i++) dst[o + i] += src[pos + i] * win[i]; }
    prev = pos;
  }
  for (let i = 0; i < outLen; i++) { const w = norm[i] > 1e-3 ? norm[i] : 1; for (const c of out) c[i] /= w; }
  return { rate, channels: out.map((c) => c.slice(0, outLen)) };
}

/**
 * Spectrogram of a mono signal for display: { size, hop, frames, bins, data } with data[frame * bins + bin] the level
 * from 0 (≤ -100 dB) to 255 (0 dB) of a Hann-windowed FFT of `size` samples; at most maxFrames frames (the hop grows).
 */
export function spectrogram(mono, { size = 1024, maxFrames = 6000 } = {}) {
  const bins = size / 2;
  const hop = Math.max(size / 4, Math.ceil(mono.length / maxFrames));
  const frames = Math.max(1, Math.ceil(mono.length / hop));
  const data = new Uint8Array(frames * bins);
  const win = new Float32Array(size).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
  const re = new Float32Array(size), im = new Float32Array(size);
  const norm = 2 / (size / 2); // a full-scale sine reaches about 0 dB
  for (let f = 0; f < frames; f++) {
    const start = f * hop - size / 2;
    for (let i = 0; i < size; i++) { const j = start + i; re[i] = j >= 0 && j < mono.length ? mono[j] * win[i] : 0; im[i] = 0; }
    fft(re, im);
    for (let b = 0; b < bins; b++) {
      const mag = Math.hypot(re[b], im[b]) * norm;
      const db = 20 * Math.log10(mag + 1e-12);
      data[f * bins + b] = Math.max(0, Math.min(255, Math.round((db + 100) * 2.55)));
    }
  }
  return { size, hop, frames, bins, data };
}
