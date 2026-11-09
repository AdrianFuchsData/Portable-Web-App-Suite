/**
 * Brush tips of the image editor: dab-based painting like GIMP. A tip is either generated (shape circle / square / diamond,
 * spikes, hardness, aspect ratio, angle – GIMP's "generated brushes", also read from .vbr files) or a grey mask (from GIMP
 * .gbr files or from images: dark = paint). A stroke places dabs every `spacing` % of the size along the path; dabs are
 * combined by their maximum (like GIMP without incremental painting), so a soft tip stays soft however dense the dabs are.
 */
import { canvas } from '@app/doc.js';

/** Built-in tips: generated shapes (the first is the default, the hard round brush). */
export const BUILTIN_TIPS = [
  { id: 'round', name: 'Round', shape: 'circle', hardness: 1 },
  { id: 'soft', name: 'Soft round', shape: 'circle', hardness: 0.3 },
  { id: 'square', name: 'Square', shape: 'square', hardness: 1 },
  { id: 'diamond', name: 'Diamond', shape: 'diamond', hardness: 1 },
  { id: 'star', name: 'Star', shape: 'diamond', hardness: 1, spikes: 5 },
  { id: 'calligraphy', name: 'Calligraphy', shape: 'circle', hardness: 0.9, aspect: 6, angle: 45 },
  { id: 'scatter', name: 'Scatter', mask: 'scatter' },
];

// ---- tip masks ---------------------------------------------------------------------------------------------------

/**
 * The alpha (Float32Array d*d, 0–1) of a generated tip of diameter d: GIMP's formula – the point is turned by the angle, its
 * y stretched by the aspect ratio, folded into one spike and measured as circle / square / diamond; hardness h gives GIMP's
 * profile gauss(r^(1 / (1 − h))) (a smooth step: 1 − 2f² up to ½, then 2(1 − f)²), and the edge is antialiased.
 */
export function generatedMask(d, { shape = 'circle', hardness = 1, aspect = 1, angle = 0, spikes = 2 } = {}) {
  const out = new Float32Array(d * d);
  const R = d / 2;
  const a = (angle * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const k = Math.max(1, aspect);
  const exp = hardness >= 0.999 ? 0 : 1 / Math.max(1e-6, 1 - hardness);
  const gauss = (f) => (f < 0.5 ? 1 - 2 * f * f : 2 * (1 - f) * (1 - f));
  const sector = spikes > 2 ? Math.PI / spikes : 0;
  for (let y = 0; y < d; y++) {
    for (let x = 0; x < d; x++) {
      let px = x + 0.5 - R, py = y + 0.5 - R;
      let u = px * cos + py * sin, v = (-px * sin + py * cos) * k;
      if (sector) {
        const r = Math.hypot(u, v);
        let t = Math.atan2(v, u);
        t -= Math.round(t / (2 * sector)) * 2 * sector; // (into -sector..sector)
        u = r * Math.cos(t); v = r * Math.abs(Math.sin(t));
      }
      const dist = shape === 'square' ? Math.max(Math.abs(u), Math.abs(v)) : shape === 'diamond' ? Math.abs(u) + Math.abs(v) : Math.hypot(u, v);
      if (dist >= R + 0.5) continue;
      const edge = Math.min(1, R + 0.5 - dist); // antialiasing: one pixel
      const inner = exp ? gauss(Math.pow(Math.min(1, dist / R), exp)) : 1;
      out[y * d + x] = Math.min(edge, inner);
    }
  }
  return out;
}

/** A deterministic scatter of small soft dots (the "Scatter" tip), 64×64. */
function scatterMask() {
  const d = 64;
  const out = new Float32Array(d * d);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let n = 0; n < 28; n++) {
    const r = 1.5 + rnd() * 3, cx = 4 + rnd() * (d - 8), cy = 4 + rnd() * (d - 8);
    if (Math.hypot(cx - d / 2, cy - d / 2) > d / 2 - r) continue;
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) {
      for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
        const v = Math.min(1, Math.max(0, r + 0.5 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy)));
        if (x >= 0 && y >= 0 && x < d && y < d) out[y * d + x] = Math.max(out[y * d + x], v);
      }
    }
  }
  return { width: d, height: d, alpha: out };
}

/** A grey mask { width, height, alpha } from an image: opaque dark pixels paint, light and transparent ones do not. */
export function maskFromImageData(img) {
  const { width, height, data } = img;
  const alpha = new Float32Array(width * height);
  for (let i = 0; i < alpha.length; i++) {
    const lum = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    alpha[i] = ((255 - lum) / 255) * (data[i * 4 + 3] / 255);
  }
  return { width, height, alpha };
}

/**
 * Read a GIMP brush (.gbr, versions 1–3: header size, version, width, height, bytes per pixel, [magic "GIMP", spacing], name;
 * then the pixels: 1 byte grey = the amount of paint, or 4 bytes RGBA, of which the alpha is used).
 */
export function parseGbr(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 28) throw new Error('not a GIMP brush');
  const headerSize = dv.getUint32(0), version = dv.getUint32(4), width = dv.getUint32(8), height = dv.getUint32(12), bpp = dv.getUint32(16);
  if (version < 1 || version > 3 || ![1, 4].includes(bpp) || !width || !height || width > 4096 || height > 4096) throw new Error('not a GIMP brush');
  let spacing = 25, nameStart = 20;
  if (version >= 2) {
    if (String.fromCharCode(...bytes.subarray(20, 24)) !== 'GIMP') throw new Error('not a GIMP brush');
    spacing = dv.getUint32(24);
    nameStart = 28;
  }
  if (headerSize < nameStart || headerSize + width * height * bpp > bytes.length) throw new Error('the GIMP brush is incomplete');
  const name = new TextDecoder().decode(bytes.subarray(nameStart, headerSize)).replace(/\0[\s\S]*$/, '').trim();
  const alpha = new Float32Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = bytes[headerSize + i * bpp + (bpp === 4 ? 3 : 0)] / 255;
  return { name, width, height, alpha, spacing };
}

/** Read a GIMP parametric brush (.vbr, text: versions 1.0 and 1.5) as a generated tip. */
export function parseVbr(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  if (lines[0] !== 'GIMP-VBR') throw new Error('not a GIMP parametric brush');
  const num = (i) => { const v = parseFloat(lines[i]); if (!Number.isFinite(v)) throw new Error('not a GIMP parametric brush'); return v; };
  if (lines[1] === '1.0') {
    return { name: lines[2], shape: 'circle', spacing: num(3), radius: num(4), hardness: num(5), aspect: num(6), angle: num(7), spikes: 2 };
  }
  if (lines[1] === '1.5') {
    const shape = { circle: 'circle', square: 'square', diamond: 'diamond' }[lines[3]] || 'circle';
    return { name: lines[2], shape, spacing: num(4), radius: num(5), spikes: num(6), hardness: num(7), aspect: num(8), angle: num(9) };
  }
  throw new Error('unknown version of a GIMP parametric brush');
}

/** Write a grey mask as a GIMP brush (version 2, 1 byte per pixel), e.g. to keep a tip made from an image. */
export function writeGbr({ name = 'Brush', width, height, alpha, spacing = 10 }) {
  const nameBytes = new TextEncoder().encode(`${name}\0`);
  const header = 28 + nameBytes.length;
  const out = new Uint8Array(header + width * height);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, header); dv.setUint32(4, 2); dv.setUint32(8, width); dv.setUint32(12, height); dv.setUint32(16, 1);
  out.set([71, 73, 77, 80], 20); dv.setUint32(24, spacing);
  out.set(nameBytes, 28);
  for (let i = 0; i < width * height; i++) out[header + i] = Math.round(Math.min(1, Math.max(0, alpha[i])) * 255);
  return out;
}

// ---- own tips (stored in the browser) -------------------------------------------------------------------------------

const STORE = 'suite.imageeditor.brushes';

/** Own tips: [{ id, name, gbr (base64) } | { id, name, vbr: { shape, hardness, … } }]. */
export function loadOwnTips() {
  try { return JSON.parse(localStorage.getItem(STORE) || '[]').filter((x) => x && x.id); } catch (e) { return []; }
}

export function saveOwnTips(list) {
  try { localStorage.setItem(STORE, JSON.stringify(list)); return true; } catch (e) { return false; }
}

const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** An own tip from a file (.gbr, .vbr or an image; images are decoded by decodeImage). Returns the stored entry. */
export async function tipFromFile(name, bytes, decodeImage) {
  const id = `own-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const stem = name.replace(/\.[^.]+$/, '');
  if (/\.vbr$/i.test(name)) {
    const v = parseVbr(new TextDecoder().decode(bytes));
    return { id, name: v.name || stem, vbr: { shape: v.shape, hardness: v.hardness, aspect: v.aspect, angle: v.angle, spikes: v.spikes }, spacing: v.spacing };
  }
  if (/\.gbr$/i.test(name)) {
    const g = parseGbr(bytes);
    return { id, name: g.name || stem, gbr: b64(writeGbr({ ...g, name: g.name || stem })), spacing: g.spacing };
  }
  const img = await decodeImage(new Blob([bytes]));
  const max = 512; // (larger pictures are scaled down: a tip is drawn at the brush size anyway)
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const m = maskFromImageData(ctx.getImageData(0, 0, w, h));
  return { id, name: stem, gbr: b64(writeGbr({ ...m, name: stem })) };
}

/** The tip definition for an id: { shape… } (generated) or { mask: { width, height, alpha } }. */
export function tipById(id, own = loadOwnTips()) {
  const b = BUILTIN_TIPS.find((x) => x.id === id);
  if (b) return b.mask === 'scatter' ? { ...b, mask: scatterMask() } : b;
  const o = own.find((x) => x.id === id);
  if (!o) return BUILTIN_TIPS[0];
  if (o.vbr) return { id: o.id, name: o.name, ...o.vbr };
  try { return { id: o.id, name: o.name, mask: parseGbr(unb64(o.gbr)) }; } catch (e) { return BUILTIN_TIPS[0]; }
}

// ---- dabs ------------------------------------------------------------------------------------------------------------

/**
 * The tip at diameter d (the larger side) with the options applied: Float32Array alpha, w×h. Generated tips take the
 * options' hardness, aspect ratio and angle (when not fixed by the tip); masks are scaled and turned by the angle.
 */
export function tipMask(tip, d, { hardness, angle = 0, aspect } = {}) {
  d = Math.max(1, Math.ceil(d));
  if (!tip.mask) {
    const alpha = generatedMask(d, { shape: tip.shape, spikes: tip.spikes || 2, hardness: hardness ?? tip.hardness ?? 1,
      aspect: aspect ?? tip.aspect ?? 1, angle: (tip.angle || 0) + angle });
    return { width: d, height: d, alpha };
  }
  const m = tip.mask;
  const s = d / Math.max(m.width, m.height);
  const a = (angle * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const sw = m.width * s, sh = m.height * s;
  const w = Math.max(1, Math.ceil(Math.abs(sw * cos) + Math.abs(sh * sin))), h = Math.max(1, Math.ceil(Math.abs(sw * sin) + Math.abs(sh * cos)));
  const alpha = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // back into the mask: turn by −angle, scale by 1/s, bilinear
      const px = x + 0.5 - w / 2, py = y + 0.5 - h / 2;
      const u = (px * cos + py * sin) / s + m.width / 2 - 0.5, v = (-px * sin + py * cos) / s + m.height / 2 - 0.5;
      alpha[y * w + x] = sample(m, u, v);
    }
  }
  return { width: w, height: h, alpha };
}

function sample(m, u, v) {
  const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
  const at = (x, y) => (x < 0 || y < 0 || x >= m.width || y >= m.height ? 0 : m.alpha[y * m.width + x]);
  return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
}

/**
 * One stroke: an alpha buffer of the image size that dabs raise to their maximum, and the canvas showing it in a colour.
 * opts: { tip, size, hardness, spacing (% of the size), angle, aspect, pressureSize, pressureOpacity, color }.
 */
export class Stroke {
  constructor(target, opts) {
    this.target = target; // canvas of the image size (the stroke canvas)
    this.w = target.width; this.h = target.height;
    this.buf = new Float32Array(this.w * this.h);
    this.opts = opts;
    this.full = tipMask(opts.tip, opts.size, opts);
    this.scaled = new Map(); // diameter -> mask (pressure changes the size)
    this.rest = 0; // distance since the last dab
    this.last = null;
    this.dirty = null;
    const c = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(opts.color || '#000000') || [0, '00', '00', '00'];
    this.rgb = [parseInt(c[1], 16), parseInt(c[2], 16), parseInt(c[3], 16)];
  }

  maskFor(size) {
    if (size >= this.opts.size - 0.5) return this.full;
    const d = Math.max(1, Math.round(size));
    if (!this.scaled.has(d)) this.scaled.set(d, tipMask(this.opts.tip, d, this.opts));
    return this.scaled.get(d);
  }

  /** Put one dab at p (pressure 0–1). */
  dab(p, pressure = 1) {
    const o = this.opts;
    const size = o.pressureSize ? Math.max(1, o.size * pressure) : o.size;
    const flow = o.pressureOpacity ? pressure : 1;
    const m = this.maskFor(size);
    // the mask's centre at p (sub-pixel: shift by bilinear weights)
    const left = p.x - m.width / 2, top = p.y - m.height / 2;
    const x0 = Math.floor(left), y0 = Math.floor(top), fx = left - x0, fy = top - y0;
    const at = (x, y) => (x < 0 || y < 0 || x >= m.width || y >= m.height ? 0 : m.alpha[y * m.width + x]);
    for (let y = 0; y <= m.height; y++) {
      const iy = y0 + y;
      if (iy < 0 || iy >= this.h) continue;
      for (let x = 0; x <= m.width; x++) {
        const ix = x0 + x;
        if (ix < 0 || ix >= this.w) continue;
        // value at pixel (ix, iy) = mask at (x − fx, y − fy)
        const a = ((at(x - 1, y - 1) * fx + at(x, y - 1) * (1 - fx)) * fy + (at(x - 1, y) * fx + at(x, y) * (1 - fx)) * (1 - fy)) * flow;
        const i = iy * this.w + ix;
        if (a > this.buf[i]) this.buf[i] = a;
      }
    }
    this.grow(x0, y0, x0 + m.width + 1, y0 + m.height + 1);
  }

  grow(x0, y0, x1, y1) {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(this.w, x1); y1 = Math.min(this.h, y1);
    if (x1 <= x0 || y1 <= y0) return;
    const d = this.dirty;
    this.dirty = d ? [Math.min(d[0], x0), Math.min(d[1], y0), Math.max(d[2], x1), Math.max(d[3], y1)] : [x0, y0, x1, y1];
  }

  /** Dabs from the last point to p (the first call puts one dab). */
  to(p, pressure = 1) {
    if (!this.last) { this.dab(p, pressure); this.last = { ...p, pressure }; return; }
    const o = this.opts;
    const dx = p.x - this.last.x, dy = p.y - this.last.y, len = Math.hypot(dx, dy);
    if (!len) return;
    let t = 0;
    for (;;) {
      const size = o.pressureSize ? Math.max(1, o.size * (this.last.pressure + (pressure - this.last.pressure) * (t / len))) : o.size;
      const step = Math.max(0.5, (size * Math.max(1, o.spacing)) / 100);
      const need = step - this.rest;
      if (t + need > len) { this.rest += len - t; break; }
      t += need;
      this.rest = 0;
      const f = t / len;
      this.dab({ x: this.last.x + dx * f, y: this.last.y + dy * f }, this.last.pressure + (pressure - this.last.pressure) * f);
    }
    this.last = { ...p, pressure };
  }

  /** Bring the changed part of the buffer into the stroke canvas. */
  flush() {
    if (!this.dirty) return;
    const [x0, y0, x1, y1] = this.dirty;
    this.dirty = null;
    const w = x1 - x0, h = y1 - y0;
    const ctx = this.target.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;
    const [r, g, b] = this.rgb;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const j = (y * w + x) * 4;
        d[j] = r; d[j + 1] = g; d[j + 2] = b; d[j + 3] = Math.round(this.buf[(y0 + y) * this.w + x0 + x] * 255);
      }
    }
    ctx.putImageData(img, x0, y0);
  }
}

/** A small preview of a tip (for the tip buttons): a canvas of size × size, dark on transparent. */
export function tipPreview(tip, size = 28) {
  const m = tipMask(tip, size - 4);
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(m.width, m.height);
  for (let i = 0; i < m.alpha.length; i++) img.data[i * 4 + 3] = Math.round(m.alpha[i] * 255);
  ctx.putImageData(img, Math.floor((size - m.width) / 2), Math.floor((size - m.height) / 2));
  return c;
}
