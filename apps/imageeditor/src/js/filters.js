/*
 * Adjustments and filters of the image editor. CSS-filter based adjustments are previewed live by rendering the active
 * layer with ctx.filter; convolution filters work on ImageData. All work on the active layer, clipped to the selection.
 */
import { canvas } from '@app/doc.js';

/** Adjustments with parameters: [key, min, max, default, unit]. */
export const ADJUSTMENTS = {
  brightnessContrast: { params: [['brightness', -100, 100, 0], ['contrast', -100, 100, 0]] },
  hueSaturation: { params: [['hue', -180, 180, 0], ['saturation', -100, 100, 0], ['lightness', -100, 100, 0]] },
  blur: { params: [['radius', 0, 50, 2]] },
};

export function cssFilter(kind, v) {
  if (kind === 'brightnessContrast') return `brightness(${100 + v.brightness}%) contrast(${100 + v.contrast}%)`;
  if (kind === 'hueSaturation') return `hue-rotate(${v.hue}deg) saturate(${100 + v.saturation}%) brightness(${100 + v.lightness}%)`;
  if (kind === 'blur') return `blur(${v.radius}px)`;
  if (kind === 'grayscale') return 'grayscale(100%)';
  if (kind === 'sepia') return 'sepia(100%)';
  if (kind === 'invert') return 'invert(100%)';
  return 'none';
}

/** Apply a CSS filter to the active layer (inside the selection). */
export function applyCssFilter(doc, filter) {
  doc.record('layer');
  const layer = doc.layer;
  const src = layer.canvas;
  const filtered = canvas(src.width, src.height);
  const fctx = filtered.getContext('2d');
  fctx.filter = filter;
  fctx.drawImage(src, 0, 0);
  const out = canvas(src.width, src.height);
  const ctx = out.getContext('2d');
  ctx.drawImage(src, 0, 0);
  ctx.save();
  if (doc.selection) {
    doc.clip(ctx);
    ctx.clearRect(0, 0, out.width, out.height);
  } else ctx.clearRect(0, 0, out.width, out.height);
  ctx.drawImage(filtered, 0, 0);
  ctx.restore();
  layer.canvas = out;
  doc.dirty = true;
}

/** 3x3 convolution on the active layer (inside the selection). */
export function convolve(doc, kernel) {
  doc.record('layer');
  const { width: w, height: h } = doc;
  const ctx = doc.layer.canvas.getContext('2d');
  const src = ctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  const s = src.data, d = out.data;
  const mask = doc.selectionMask();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (mask && !mask[y * w + x]) { d[i] = s[i]; d[i + 1] = s[i + 1]; d[i + 2] = s[i + 2]; d[i + 3] = s[i + 3]; continue; }
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          const yy = Math.min(h - 1, Math.max(0, y + ky));
          for (let kx = -1; kx <= 1; kx++) {
            const xx = Math.min(w - 1, Math.max(0, x + kx));
            sum += s[(yy * w + xx) * 4 + c] * kernel[(ky + 1) * 3 + kx + 1];
          }
        }
        d[i + c] = sum;
      }
      d[i + 3] = s[i + 3];
    }
  }
  ctx.putImageData(out, 0, 0);
  doc.dirty = true;
}

export const KERNELS = {
  sharpen: [0, -1, 0, -1, 5, -1, 0, -1, 0],
  emboss: [-2, -1, 0, -1, 1, 1, 0, 1, 2],
  edges: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
};

/** Stretch each colour channel to the full range (ignoring 0.5 % outliers). */
export function autoLevels(doc) {
  doc.record('layer');
  const { width: w, height: h } = doc;
  const ctx = doc.layer.canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const mask = doc.selectionMask();
  const lo = [0, 0, 0], hi = [255, 255, 255];
  for (let c = 0; c < 3; c++) {
    const hist = new Uint32Array(256);
    let n = 0;
    for (let i = 0; i < w * h; i++) if ((!mask || mask[i]) && d[i * 4 + 3]) { hist[d[i * 4 + c]]++; n++; }
    const cut = n * 0.005;
    let acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > cut) { lo[c] = v; break; } }
    acc = 0;
    for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > cut) { hi[c] = v; break; } }
  }
  for (let i = 0; i < w * h; i++) {
    if (mask && !mask[i]) continue;
    for (let c = 0; c < 3; c++) {
      const range = Math.max(1, hi[c] - lo[c]);
      d[i * 4 + c] = Math.max(0, Math.min(255, ((d[i * 4 + c] - lo[c]) * 255) / range));
    }
  }
  ctx.putImageData(img, 0, 0);
  doc.dirty = true;
}

// ---- levels and curves (lookup tables per channel) ---------------------------------------------------------------

/** Histograms of the active layer (inside the selection): { rgb (luminance), r, g, b }, 256 counts each. */
export function histogram(doc) {
  const { width: w, height: h } = doc;
  const d = doc.layer.canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const mask = doc.selectionMask();
  const out = { rgb: new Uint32Array(256), r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256) };
  for (let i = 0; i < w * h; i++) {
    if ((mask && !mask[i]) || !d[i * 4 + 3]) continue;
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    out.r[r]++; out.g[g]++; out.b[b]++;
    out.rgb[Math.round(0.299 * r + 0.587 * g + 0.114 * b)]++;
  }
  return out;
}

/** Levels: input black/white point, gamma (mid-tones), output black/white. */
export function levelsLut({ black = 0, white = 255, gamma = 1, outBlack = 0, outWhite = 255 } = {}) {
  const lut = new Uint8Array(256);
  const range = Math.max(1, white - black);
  for (let v = 0; v < 256; v++) {
    const x = Math.min(1, Math.max(0, (v - black) / range));
    lut[v] = Math.round(outBlack + (outWhite - outBlack) * Math.pow(x, 1 / gamma));
  }
  return lut;
}

/** Curve through control points [[x, y], …] (0…255) with monotone cubic interpolation (no overshoot). */
export function curveLut(points) {
  const p = [...points].sort((a, b) => a[0] - b[0]).filter((q, i, arr) => !i || q[0] !== arr[i - 1][0]);
  const lut = new Uint8Array(256);
  if (p.length < 2) { for (let v = 0; v < 256; v++) lut[v] = v; return lut; }
  const n = p.length;
  const dx = [], m = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = p[i + 1][0] - p[i][0]; m[i] = (p[i + 1][1] - p[i][1]) / dx[i]; }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
  t[n - 1] = m[n - 2];
  let k = 0;
  for (let v = 0; v < 256; v++) {
    let y;
    if (v <= p[0][0]) y = p[0][1];
    else if (v >= p[n - 1][0]) y = p[n - 1][1];
    else {
      while (v > p[k + 1][0]) k++;
      const h = dx[k], s = (v - p[k][0]) / h;
      const h00 = (1 + 2 * s) * (1 - s) ** 2, h10 = s * (1 - s) ** 2, h01 = s * s * (3 - 2 * s), h11 = s * s * (s - 1);
      y = h00 * p[k][1] + h10 * h * t[k] + h01 * p[k + 1][1] + h11 * h * t[k + 1];
    }
    lut[v] = Math.max(0, Math.min(255, Math.round(y)));
  }
  return lut;
}

/** Combine a master table (all channels) with per-channel tables: { r, g, b }. */
export function channelLuts(master, { r = null, g = null, b = null } = {}) {
  const chain = (c) => (c ? Uint8Array.from(master, (v) => c[v]) : master);
  return { r: chain(r), g: chain(g), b: chain(b) };
}

/** A copy of the active layer with the tables applied inside the selection (for the preview, and to apply). */
export function lutCanvas(doc, luts) {
  const { width: w, height: h } = doc;
  const out = canvas(w, h);
  const ctx = out.getContext('2d');
  ctx.drawImage(doc.layer.canvas, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const mask = doc.selectionMask();
  for (let i = 0; i < w * h; i++) {
    if (mask && !mask[i]) continue;
    d[i * 4] = luts.r[d[i * 4]]; d[i * 4 + 1] = luts.g[d[i * 4 + 1]]; d[i * 4 + 2] = luts.b[d[i * 4 + 2]];
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

export function applyLuts(doc, luts) {
  const out = lutCanvas(doc, luts);
  doc.record('layer');
  doc.layer.canvas = out;
  doc.dirty = true;
}
