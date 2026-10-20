/*
 * Audio data and processing for the audio editor. Audio is { rate, channels: [Float32Array, ...] }; every function returns
 * new arrays (the undo history shares unchanged data). Ranges are sample indices [from, to).
 */

export const length = (a) => (a.channels[0] ? a.channels[0].length : 0);
export const duration = (a) => length(a) / a.rate;
const map = (a, fn) => ({ rate: a.rate, channels: a.channels.map(fn) });
const clampRange = (a, from, to) => [Math.max(0, Math.min(from, length(a))), Math.max(0, Math.min(to, length(a)))];

export function silence(rate, channels, samples) {
  return { rate, channels: Array.from({ length: channels }, () => new Float32Array(Math.max(0, Math.round(samples)))) };
}

export function slice(a, from, to) {
  [from, to] = clampRange(a, from, to);
  return map(a, (c) => c.slice(from, to));
}

/** a with the range removed. */
export function remove(a, from, to) {
  [from, to] = clampRange(a, from, to);
  return map(a, (c) => { const out = new Float32Array(c.length - (to - from)); out.set(c.subarray(0, from)); out.set(c.subarray(to), from); return out; });
}

/** Insert b into a at a sample position (channel counts are matched: mono is duplicated, extra channels are mixed). */
export function insert(a, at, b) {
  b = matchChannels(b, a.channels.length);
  at = Math.max(0, Math.min(at, length(a)));
  return { rate: a.rate, channels: a.channels.map((c, i) => { const n = b.channels[i]; const out = new Float32Array(c.length + n.length); out.set(c.subarray(0, at)); out.set(n, at); out.set(c.subarray(at), at + n.length); return out; }) };
}

/** Replace the range with b (which may have another length). */
export function replace(a, from, to, b) { return insert(remove(a, from, to), Math.min(from, length(a)), b); }

/** a padded with silence to at least n samples. */
export function padTo(a, n) {
  if (length(a) >= n) return a;
  return map(a, (c) => { const out = new Float32Array(n); out.set(c); return out; });
}

export function matchChannels(b, n) {
  if (b.channels.length === n) return b;
  if (b.channels.length === 1) return { rate: b.rate, channels: Array.from({ length: n }, () => b.channels[0].slice()) };
  if (n === 1) return { rate: b.rate, channels: [mono(b)] };
  return { rate: b.rate, channels: Array.from({ length: n }, (_, i) => (b.channels[i] || b.channels[b.channels.length - 1]).slice()) };
}

export function mono(a) {
  const out = new Float32Array(length(a));
  for (const c of a.channels) for (let i = 0; i < c.length; i++) out[i] += c[i] / a.channels.length;
  return out;
}

/** Apply fn(channel range copy) to the range and put the result back (same length). */
function process(a, from, to, fn) {
  [from, to] = clampRange(a, from, to);
  return map(a, (c, ci) => { const out = c.slice(); const part = out.subarray(from, to); fn(part, ci); return out; });
}

export const dbToGain = (db) => 10 ** (db / 20);
export const gainToDb = (g) => (g > 0 ? 20 * Math.log10(g) : -Infinity);

export function peak(a, from = 0, to = length(a)) {
  let p = 0;
  for (const c of a.channels) for (let i = from; i < to; i++) { const v = Math.abs(c[i]); if (v > p) p = v; }
  return p;
}

export function amplify(a, from, to, db) { const g = dbToGain(db); return process(a, from, to, (p) => { for (let i = 0; i < p.length; i++) p[i] *= g; }); }

/** Scale the range so that its peak is at the given level (dBFS). */
export function normalize(a, from, to, db = -1) {
  const p = peak(a, from, to);
  if (!p) return a;
  const g = dbToGain(db) / p;
  return process(a, from, to, (part) => { for (let i = 0; i < part.length; i++) part[i] *= g; });
}

/** Fade the range in or out; the ramp runs over [spanFrom, spanTo) (default: the range), e.g. over several clips. */
export function fade(a, from, to, direction, spanFrom = from, spanTo = to) {
  const n = spanTo - spanFrom;
  return process(a, from, to, (p) => {
    for (let i = 0; i < p.length; i++) { const x = n > 1 ? Math.min(1, Math.max(0, (from + i - spanFrom) / (n - 1))) : 1; p[i] *= direction === 'in' ? x : 1 - x; }
  });
}

export function silenceRange(a, from, to) { return process(a, from, to, (p) => p.fill(0)); }
export function reverse(a, from, to) { return process(a, from, to, (p) => p.reverse()); }
export function invert(a, from, to) { return process(a, from, to, (p) => { for (let i = 0; i < p.length; i++) p[i] = -p[i]; }); }

/** Echo: delayed copies (feedback) added inside the range. */
export function echo(a, from, to, delaySeconds, decay) {
  const d = Math.max(1, Math.round(delaySeconds * a.rate));
  return process(a, from, to, (p) => { for (let i = d; i < p.length; i++) p[i] += p[i - d] * decay; });
}

/** A generated tone (sine, square, sawtooth, triangle) or noise. */
export function tone(rate, channels, seconds, { wave = 'sine', frequency = 440, amplitude = 0.8 } = {}) {
  const n = Math.round(seconds * rate);
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const ph = (i * frequency / rate) % 1;
    let v;
    if (wave === 'square') v = ph < 0.5 ? 1 : -1;
    else if (wave === 'sawtooth') v = 2 * ph - 1;
    else if (wave === 'triangle') v = 1 - 4 * Math.abs(ph - 0.5);
    else if (wave === 'noise') v = Math.random() * 2 - 1;
    else v = Math.sin(2 * Math.PI * ph);
    c[i] = v * amplitude;
  }
  return { rate, channels: Array.from({ length: channels }, () => c.slice()) };
}

// ---- rendering with the Web Audio API (resampling, speed, filters) --------------------------------------------------

function toAudioBuffer(a, ctx) {
  const b = ctx.createBuffer(a.channels.length, Math.max(1, length(a)), a.rate);
  a.channels.forEach((c, i) => b.copyToChannel(c, i));
  return b;
}
const fromAudioBuffer = (b) => ({ rate: b.sampleRate, channels: Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i).slice()) });

/** Render a through a node chain at a target rate: build(ctx, source) returns the last node. */
async function render(a, { rate = a.rate, speed = 1, build = (ctx, n) => n } = {}) {
  const frames = Math.max(1, Math.ceil(length(a) / speed * rate / a.rate));
  const ctx = new OfflineAudioContext(a.channels.length, frames, rate);
  const src = ctx.createBufferSource();
  src.buffer = toAudioBuffer(a, ctx);
  src.playbackRate.value = speed;
  build(ctx, src).connect(ctx.destination);
  src.start();
  return fromAudioBuffer(await ctx.startRendering());
}

export async function resample(a, rate) { return a.rate === rate || !length(a) ? { ...a, rate } : render(a, { rate }); }

/** Change the speed (and pitch) of the range: the range gets shorter (speed > 1) or longer. */
export async function changeSpeed(a, from, to, speed) {
  const part = await render(slice(a, from, to), { speed });
  return replace(a, from, to, part);
}

/** Low-pass or high-pass filter on the range (12 dB/octave biquad). */
export async function filter(a, from, to, type, frequency) {
  const part = await render(slice(a, from, to), { build: (ctx, n) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = frequency; n.connect(f); return f; } });
  return replace(a, from, to, { rate: a.rate, channels: part.channels.map((c) => c.subarray(0, Math.min(c.length, to - from))) });
}

// ---- mixing ------------------------------------------------------------------------------------------------------------

/** Mix tracks [{ audio, gain (dB), pan (-1..1), mute, solo }] into `channels` channels over [from, to). */
export function mix(tracks, rate, channels, from, to) {
  const n = Math.max(0, to - from);
  const out = Array.from({ length: channels }, () => new Float32Array(n));
  const solo = tracks.some((t) => t.solo);
  for (const t of tracks) {
    if (t.mute || (solo && !t.solo)) continue;
    const g = dbToGain(t.gain || 0);
    const pan = t.pan || 0;
    const a = t.audio;
    const len = length(a);
    // equal-power pan for stereo output (unity gain in the centre); mono sources go to both sides
    const angle = (Math.max(-1, Math.min(1, pan)) + 1) * Math.PI / 4;
    for (let o = 0; o < channels; o++) {
      const gain = g * (channels === 2 ? (o === 0 ? Math.cos(angle) : Math.sin(angle)) * Math.SQRT2 : 1);
      const src = a.channels.length === 1 ? a.channels[0] : channels === 1 ? null : a.channels[Math.min(o, a.channels.length - 1)];
      const dst = out[o];
      if (src) { for (let i = 0; i < n && from + i < len; i++) dst[i] += src[from + i] * gain; } else {
        for (const c of a.channels) for (let i = 0; i < n && from + i < len; i++) dst[i] += c[from + i] * gain / a.channels.length;
      }
    }
  }
  return { rate, channels: out };
}

// ---- WAV --------------------------------------------------------------------------------------------------------------------

/** Decode a RIFF/RF64 WAVE file (PCM 8/16/24/32 bit, IEEE float 32/64, extensible). Returns null if it is not a WAV file. */
export function decodeWav(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (bytes.length < 12 || !['RIFF', 'RF64'].includes(tag(0)) || tag(8) !== 'WAVE') return null;
  let fmt = null, data = null, o = 12;
  while (o + 8 <= bytes.length) {
    const id = tag(o);
    let size = v.getUint32(o + 4, true);
    if (id === 'data' && (size === 0xffffffff || o + 8 + size > bytes.length)) size = bytes.length - o - 8;
    if (id === 'fmt ') {
      let format = v.getUint16(o + 8, true);
      const bits = v.getUint16(o + 22, true);
      if (format === 0xfffe && size >= 40) format = v.getUint16(o + 32, true);
      fmt = { format, channels: v.getUint16(o + 10, true), rate: v.getUint32(o + 12, true), bits, block: v.getUint16(o + 20, true) };
    } else if (id === 'data') data = { offset: o + 8, size };
    o += 8 + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('WAV: fmt or data chunk missing');
  if (![1, 3].includes(fmt.format)) throw new Error(`WAV: unsupported format ${fmt.format}`);
  const frames = Math.floor(data.size / fmt.block);
  const bps = fmt.bits / 8;
  const channels = Array.from({ length: fmt.channels }, () => new Float32Array(frames));
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < fmt.channels; c++) {
      const p = data.offset + f * fmt.block + c * bps;
      let s;
      if (fmt.format === 3) s = fmt.bits === 64 ? v.getFloat64(p, true) : v.getFloat32(p, true);
      else if (fmt.bits === 8) s = (bytes[p] - 128) / 128;
      else if (fmt.bits === 16) s = v.getInt16(p, true) / 32768;
      else if (fmt.bits === 24) s = (((bytes[p + 2] << 24) | (bytes[p + 1] << 16) | (bytes[p] << 8)) >> 8) / 8388608;
      else if (fmt.bits === 32) s = v.getInt32(p, true) / 2147483648;
      else throw new Error(`WAV: unsupported sample size ${fmt.bits}`);
      channels[c][f] = s;
    }
  }
  return { rate: fmt.rate, channels, bits: fmt.bits, float: fmt.format === 3 };
}

/** WAV file of audio: bits 16 or 24 (PCM) or 32 (IEEE float). */
export function encodeWav(a, bits = 16) {
  const ch = a.channels.length, n = length(a);
  const bps = bits / 8, block = ch * bps, size = n * block;
  const buf = new ArrayBuffer(44 + size);
  const v = new DataView(buf);
  const u8 = new Uint8Array(buf);
  const str = (o, s) => { for (let i = 0; i < 4; i++) u8[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); v.setUint32(4, 36 + size, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, bits === 32 ? 3 : 1, true); v.setUint16(22, ch, true); v.setUint32(24, a.rate, true);
  v.setUint32(28, a.rate * block, true); v.setUint16(32, block, true); v.setUint16(34, bits, true); str(36, 'data'); v.setUint32(40, size, true);
  let p = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, a.channels[c][i]));
      if (bits === 32) v.setFloat32(p, a.channels[c][i], true);
      // scaled like the decoder (2^(bits-1)), so that PCM files are written back unchanged
      else if (bits === 24) { const x = Math.min(8388607, Math.round(s * 8388608)); u8[p] = x & 255; u8[p + 1] = (x >> 8) & 255; u8[p + 2] = (x >> 16) & 255; } else v.setInt16(p, Math.min(32767, Math.round(s * 32768)), true);
      p += bps;
    }
  }
  return u8;
}

// ---- peaks for drawing -----------------------------------------------------------------------------------------------------

export const PEAK_BIN = 256;

/** Min/max per PEAK_BIN samples and channel. */
export function peaks(a) {
  return a.channels.map((c) => {
    const bins = Math.ceil(c.length / PEAK_BIN);
    const min = new Float32Array(bins), max = new Float32Array(bins);
    for (let b = 0; b < bins; b++) {
      let lo = 1, hi = -1;
      const end = Math.min(c.length, (b + 1) * PEAK_BIN);
      for (let i = b * PEAK_BIN; i < end; i++) { const s = c[i]; if (s < lo) lo = s; if (s > hi) hi = s; }
      min[b] = lo; max[b] = hi;
    }
    return { min, max };
  });
}
