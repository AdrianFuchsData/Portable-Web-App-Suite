/**
 * Writers for GIF (a palette of up to 256 colours by median cut, optional Floyd–Steinberg dithering, transparency, LZW
 * compression; one frame or an animation) and ICO (several square sizes, each stored as PNG – understood by Windows since
 * Vista and by browsers). Used by the image editor and the video editor (animated GIF export).
 */

// ---- palette: median cut on a 5-bit-per-channel histogram ------------------------------------------------------------------

/** Up to maxColors colours for the opaque pixels (alpha ≥ 128) of RGBA data: [[r, g, b], …]. */
export function medianCut(data, maxColors = 256) {
  const count = new Uint32Array(32768), sr = new Float64Array(32768), sg = new Float64Array(32768), sb = new Float64Array(32768);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const k = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    count[k]++; sr[k] += data[i]; sg[k] += data[i + 1]; sb[k] += data[i + 2];
  }
  const bins = [];
  for (let k = 0; k < 32768; k++) if (count[k]) bins.push(k);
  if (!bins.length) return [[0, 0, 0]];
  const comp = (k, c) => (c === 0 ? k >> 10 : c === 1 ? (k >> 5) & 31 : k & 31);
  const boxOf = (list) => {
    const lo = [31, 31, 31], hi = [0, 0, 0];
    let n = 0;
    for (const k of list) { for (let c = 0; c < 3; c++) { const v = comp(k, c); if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; } n += count[k]; }
    return { list, lo, hi, n };
  };
  const boxes = [boxOf(bins)];
  while (boxes.length < maxColors) {
    // split the box with the most pixels × widest range along its widest channel, at the median pixel
    let best = -1, score = 0;
    boxes.forEach((b, i) => {
      if (b.list.length < 2) return;
      const range = Math.max(b.hi[0] - b.lo[0], b.hi[1] - b.lo[1], b.hi[2] - b.lo[2]);
      const s = range * Math.sqrt(b.n);
      if (s > score) { score = s; best = i; }
    });
    if (best < 0) break;
    const b = boxes[best];
    const ranges = [0, 1, 2].map((c) => b.hi[c] - b.lo[c]);
    const c = ranges.indexOf(Math.max(...ranges));
    const sorted = b.list.slice().sort((x, y) => comp(x, c) - comp(y, c));
    let acc = 0, cut = 1;
    for (let i = 0; i < sorted.length - 1; i++) { acc += count[sorted[i]]; if (acc >= b.n / 2) { cut = i + 1; break; } cut = i + 1; }
    boxes.splice(best, 1, boxOf(sorted.slice(0, cut)), boxOf(sorted.slice(cut)));
  }
  return boxes.map((b) => {
    let n = 0, r = 0, g = 0, bl = 0;
    for (const k of b.list) { n += count[k]; r += sr[k]; g += sg[k]; bl += sb[k]; }
    return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)];
  });
}

/** Indices into the palette for every pixel (transparent pixels: index `transparent`), optionally dithered. */
function mapPixels(data, w, h, palette, transparent, dither) {
  const cache = new Int16Array(32768).fill(-1);
  const nearest = (r, g, b) => {
    const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    if (cache[k] >= 0 && !dither) return cache[k];
    let best = 0, bd = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const p = palette[i];
      const d = (p[0] - r) ** 2 * 3 + (p[1] - g) ** 2 * 4 + (p[2] - b) ** 2 * 2;
      if (d < bd) { bd = d; best = i; }
    }
    cache[k] = best;
    return best;
  };
  const out = new Uint8Array(w * h);
  const err = dither ? new Float32Array(w * h * 3) : null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x, j = i * 4;
      if (data[j + 3] < 128) { out[i] = transparent; continue; }
      let r = data[j], g = data[j + 1], b = data[j + 2];
      if (err) { r = Math.max(0, Math.min(255, r + err[i * 3])); g = Math.max(0, Math.min(255, g + err[i * 3 + 1])); b = Math.max(0, Math.min(255, b + err[i * 3 + 2])); }
      const p = nearest(Math.round(r), Math.round(g), Math.round(b));
      out[i] = p;
      if (err) {
        const e = [r - palette[p][0], g - palette[p][1], b - palette[p][2]];
        const spread = (dx, dy, f) => {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || xx >= w || yy >= h) return;
          const q = (yy * w + xx) * 3;
          err[q] += e[0] * f; err[q + 1] += e[1] * f; err[q + 2] += e[2] * f;
        };
        spread(1, 0, 7 / 16); spread(-1, 1, 3 / 16); spread(0, 1, 5 / 16); spread(1, 1, 1 / 16);
      }
    }
  }
  return out;
}

// ---- LZW (GIF variant: variable code size, clear and end codes) ---------------------------------------------------------------

function lzw(indices, minSize) {
  const out = [];
  let bits = 0, acc = 0;
  const clear = 1 << minSize, end = clear + 1;
  let size = minSize + 1, next = end + 1;
  let dict = new Map();
  const emit = (code) => {
    acc |= code << bits; bits += size;
    while (bits >= 8) { out.push(acc & 255); acc >>>= 8; bits -= 8; }
  };
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = prefix * 256 + k;
    const found = dict.get(key);
    if (found !== undefined) { prefix = found; continue; }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > 1 << size && size < 12) size++;
    } else { emit(clear); dict = new Map(); size = minSize + 1; next = end + 1; }
    prefix = k;
  }
  emit(prefix);
  emit(end);
  if (bits > 0) out.push(acc & 255);
  return out;
}

/** A GIF file (one frame) of RGBA data. Pixels with alpha < 128 are transparent. */
export function encodeGif(data, w, h, { dither = true } = {}) {
  let transparent = false;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 128) { transparent = true; break; }
  const palette = medianCut(data, transparent ? 255 : 256);
  const tIndex = palette.length;
  const indices = mapPixels(data, w, h, palette, tIndex, dither);
  const colors = palette.length + (transparent ? 1 : 0);
  const bitsNeeded = Math.max(1, Math.ceil(Math.log2(Math.max(2, colors))));
  const tableSize = 1 << bitsNeeded;
  const bytes = [];
  const u16 = (v) => bytes.push(v & 255, (v >> 8) & 255);
  bytes.push(...[...'GIF89a'].map((c) => c.charCodeAt(0)));
  u16(w); u16(h);
  bytes.push(0x80 | 0x70 | (bitsNeeded - 1), 0, 0); // global colour table, 8-bit colour resolution
  for (let i = 0; i < tableSize; i++) { const p = palette[i] || [0, 0, 0]; bytes.push(p[0], p[1], p[2]); }
  if (transparent) bytes.push(0x21, 0xf9, 4, 0x01, 0, 0, tIndex, 0); // graphic control: transparent colour index
  bytes.push(0x2c); u16(0); u16(0); u16(w); u16(h); bytes.push(0);
  const minSize = Math.max(2, bitsNeeded);
  bytes.push(minSize);
  const comp = lzw(indices, minSize);
  for (let i = 0; i < comp.length; i += 255) { const part = comp.slice(i, i + 255); bytes.push(part.length, ...part); }
  bytes.push(0, 0x3b);
  return Uint8Array.from(bytes);
}

// ---- animated GIF -------------------------------------------------------------------------------------------------------

/**
 * An animated GIF writer: one global palette (median cut over sample frames passed to the constructor), every frame added with
 * add(rgba) and its delay in hundredths of a second, looping forever. finish() returns the file.
 */
export class GifAnimation {
  constructor(width, height, samples, { dither = false } = {}) {
    this.w = width; this.h = height; this.dither = dither;
    // the palette from a few frames (concatenated)
    const total = samples.reduce((n, s) => n + s.length, 0);
    const all = new Uint8ClampedArray(total);
    let o = 0;
    for (const s of samples) { all.set(s, o); o += s.length; }
    this.palette = medianCut(all, 256);
    this.bits = Math.max(1, Math.ceil(Math.log2(Math.max(2, this.palette.length))));
    const bytes = [];
    const u16 = (v) => bytes.push(v & 255, (v >> 8) & 255);
    bytes.push(...[...'GIF89a'].map((c) => c.charCodeAt(0)));
    u16(width); u16(height);
    bytes.push(0x80 | 0x70 | (this.bits - 1), 0, 0);
    for (let i = 0; i < 1 << this.bits; i++) { const p = this.palette[i] || [0, 0, 0]; bytes.push(p[0], p[1], p[2]); }
    bytes.push(0x21, 0xff, 11, ...[...'NETSCAPE2.0'].map((c) => c.charCodeAt(0)), 3, 1, 0, 0, 0); // loop forever
    this.parts = [Uint8Array.from(bytes)];
  }

  add(rgba, delay) {
    const indices = mapPixels(rgba, this.w, this.h, this.palette, 0, this.dither);
    const head = [0x21, 0xf9, 4, 0x04, delay & 255, (delay >> 8) & 255, 0, 0, 0x2c, 0, 0, 0, 0, this.w & 255, this.w >> 8, this.h & 255, this.h >> 8, 0];
    const minSize = Math.max(2, this.bits);
    const comp = lzw(indices, minSize);
    const body = [minSize];
    for (let i = 0; i < comp.length; i += 255) { const part = comp.slice(i, i + 255); body.push(part.length, ...part); }
    body.push(0);
    this.parts.push(Uint8Array.from(head), Uint8Array.from(body));
  }

  finish() {
    this.parts.push(Uint8Array.of(0x3b));
    const out = new Uint8Array(this.parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of this.parts) { out.set(p, o); o += p.length; }
    return out;
  }
}

// ---- ICO -------------------------------------------------------------------------------------------------------------

export const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/**
 * An ICO file with the image at the given square sizes (each fitted into the square, transparent around it), stored as PNG.
 * toPng: canvas -> Promise<Uint8Array>.
 */
export async function encodeIco(source, sizes, toPng) {
  const list = [...new Set(sizes)].filter((s) => s >= 1 && s <= 256).sort((a, b) => a - b);
  const pngs = [];
  for (const s of list) {
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    const k = Math.min(s / source.width, s / source.height);
    const w = Math.max(1, Math.round(source.width * k)), h = Math.max(1, Math.round(source.height * k));
    ctx.drawImage(source, Math.floor((s - w) / 2), Math.floor((s - h) / 2), w, h);
    pngs.push(await toPng(c));
  }
  const head = 6 + 16 * list.length;
  const total = head + pngs.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint16(2, 1, true); dv.setUint16(4, list.length, true);
  let offset = head;
  list.forEach((s, i) => {
    const e = 6 + i * 16;
    out[e] = s >= 256 ? 0 : s; out[e + 1] = s >= 256 ? 0 : s;
    dv.setUint16(e + 4, 1, true); dv.setUint16(e + 6, 32, true);
    dv.setUint32(e + 8, pngs[i].length, true); dv.setUint32(e + 12, offset, true);
    out.set(pngs[i], offset);
    offset += pngs[i].length;
  });
  return out;
}
