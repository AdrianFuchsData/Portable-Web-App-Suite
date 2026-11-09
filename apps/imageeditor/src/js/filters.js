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
  doc.paintThrough(ctx, (c) => { c.clearRect(0, 0, out.width, out.height); c.drawImage(filtered, 0, 0); });
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
      const k = mask ? mask[y * w + x] / 255 : 1; // (a partly selected pixel changes that much)
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          const yy = Math.min(h - 1, Math.max(0, y + ky));
          for (let kx = -1; kx <= 1; kx++) {
            const xx = Math.min(w - 1, Math.max(0, x + kx));
            sum += s[(yy * w + xx) * 4 + c] * kernel[(ky + 1) * 3 + kx + 1];
          }
        }
        d[i + c] = k === 1 ? sum : s[i + c] + (Math.max(0, Math.min(255, sum)) - s[i + c]) * k;
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
    const k = mask ? mask[i] / 255 : 1;
    for (let c = 0; c < 3; c++) {
      const range = Math.max(1, hi[c] - lo[c]);
      const v = Math.max(0, Math.min(255, ((d[i * 4 + c] - lo[c]) * 255) / range));
      d[i * 4 + c] = d[i * 4 + c] + (v - d[i * 4 + c]) * k;
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
    if (mask && mask[i] < 255) {
      const k = mask[i] / 255;
      d[i * 4] += (luts.r[d[i * 4]] - d[i * 4]) * k; d[i * 4 + 1] += (luts.g[d[i * 4 + 1]] - d[i * 4 + 1]) * k; d[i * 4 + 2] += (luts.b[d[i * 4 + 2]] - d[i * 4 + 2]) * k;
    } else { d[i * 4] = luts.r[d[i * 4]]; d[i * 4 + 1] = luts.g[d[i * 4 + 1]]; d[i * 4 + 2] = luts.b[d[i * 4 + 2]]; }
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

// ---- pixel adjustments (live preview, through the selection) -------------------------------------------------------------

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const lumOf = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * Adjustments computed on the pixels: params [key, min, max, default, step?] (sliders) or { key, options, default } (choices);
 * run(data, w, h, values, src) changes the RGBA data in place (src: the layer canvas, for those that need a blurred copy).
 */
export const PIXEL_ADJUSTMENTS = {
  colorBalance: {
    params: [{ key: 'range', options: ['shadows', 'midtones', 'highlights'], default: 'midtones' },
      ['cyanRed', -100, 100, 0], ['magentaGreen', -100, 100, 0], ['yellowBlue', -100, 100, 0], { key: 'preserve', check: true, default: true }],
    perRange: ['cyanRed', 'magentaGreen', 'yellowBlue'], // (each tone range keeps its own values)
    run(d, w, h, v) {
      // the shift of each range is weighted by how much a pixel belongs to it (by its lightness)
      const weights = (l) => [Math.max(0, 1 - l * 2) ** 1.5, Math.max(0, 1 - Math.abs(l - 0.5) * 2), Math.max(0, l * 2 - 1) ** 1.5];
      const shifts = ['shadows', 'midtones', 'highlights'].map((r) => [(v[r] || {}).cyanRed || 0, (v[r] || {}).magentaGreen || 0, (v[r] || {}).yellowBlue || 0]);
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const l = lumOf(r, g, b) / 255;
        const ws = weights(l);
        let nr = r, ng = g, nb = b;
        for (let k = 0; k < 3; k++) { nr += shifts[k][0] * 1.28 * ws[k]; ng += shifts[k][1] * 1.28 * ws[k]; nb += shifts[k][2] * 1.28 * ws[k]; }
        if (v.preserve) { const diff = lumOf(r, g, b) - lumOf(nr, ng, nb); nr += diff; ng += diff; nb += diff; }
        d[i] = clamp255(nr); d[i + 1] = clamp255(ng); d[i + 2] = clamp255(nb);
      }
    },
  },
  vibrance: {
    params: [['vibrance', -100, 100, 30]],
    run(d, w, h, v) {
      // more saturation for dull colours, little for already saturated ones (and skin tones keep their warmth)
      const a = v.vibrance / 100;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const sat = max ? (max - min) / max : 0;
        const f = a > 0 ? a * (1 - sat) : a;
        const l = lumOf(r, g, b);
        d[i] = clamp255(l + (r - l) * (1 + f)); d[i + 1] = clamp255(l + (g - l) * (1 + f)); d[i + 2] = clamp255(l + (b - l) * (1 + f));
      }
    },
  },
  threshold: {
    params: [['level', 0, 255, 128]],
    run(d, w, h, v) {
      for (let i = 0; i < d.length; i += 4) { const x = lumOf(d[i], d[i + 1], d[i + 2]) >= v.level ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = x; }
    },
  },
  posterize: {
    params: [['levels', 2, 32, 4]],
    run(d, w, h, v) {
      const n = Math.max(2, v.levels) - 1;
      const lut = new Uint8Array(256);
      for (let x = 0; x < 256; x++) lut[x] = Math.round(Math.round((x / 255) * n) * (255 / n));
      for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
    },
  },
  unsharpMask: {
    params: [['radius', 1, 50, 3, 0.5], ['amount', 0, 500, 100], ['threshold', 0, 255, 0]],
    run(d, w, h, v, src) {
      // original + amount × (original − blurred), where the difference reaches the threshold
      const c = canvas(w, h);
      const ctx = c.getContext('2d');
      ctx.filter = `blur(${v.radius}px)`;
      ctx.drawImage(src, 0, 0);
      const bl = ctx.getImageData(0, 0, w, h).data;
      const k = v.amount / 100;
      for (let i = 0; i < d.length; i += 4) {
        for (let c2 = 0; c2 < 3; c2++) {
          const diff = d[i + c2] - bl[i + c2];
          if (Math.abs(diff) >= v.threshold) d[i + c2] = clamp255(d[i + c2] + k * diff);
        }
      }
    },
  },
  median: {
    params: [['radius', 1, 10, 2]],
    run(d, w, h, v) {
      // per channel a sliding 256-bin histogram along each row (Huang): O(width × height × radius)
      const r = Math.max(1, Math.round(v.radius));
      const src = Uint8ClampedArray.from(d);
      const hist = new Uint32Array(256);
      for (let ch = 0; ch < 3; ch++) {
        for (let y = 0; y < h; y++) {
          hist.fill(0);
          const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
          const n = () => (y1 - y0 + 1);
          let count = 0;
          const add = (x, s) => { if (x < 0 || x >= w) return; for (let yy = y0; yy <= y1; yy++) hist[src[(yy * w + x) * 4 + ch]] += s; count += s * n(); };
          for (let x = -r; x <= r; x++) add(x, 1);
          for (let x = 0; x < w; x++) {
            if (x > 0) { add(x - r - 1, -1); add(x + r, 1); }
            let acc = 0, m = 0;
            const target = count / 2;
            for (; m < 255; m++) { acc += hist[m]; if (acc >= target) break; }
            d[(y * w + x) * 4 + ch] = m;
          }
        }
      }
    },
  },
  vignette: {
    params: [['amount', -100, 100, 50], ['size', 0, 100, 60], ['softness', 1, 100, 50]],
    run(d, w, h, v) {
      // darkens (or, negative, lightens) towards the corners: 0 inside the ellipse of `size`, full at the corners
      const inner = v.size / 100, soft = Math.max(0.01, v.softness / 100);
      const a = v.amount / 100;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dist = Math.hypot((x + 0.5 - w / 2) / (w / 2), (y + 0.5 - h / 2) / (h / 2)) / Math.SQRT2;
          let t = (dist - inner * 0.9) / (soft * (1 - inner * 0.9) + 1e-6);
          t = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
          if (!t) continue;
          const i = (y * w + x) * 4;
          for (let c2 = 0; c2 < 3; c2++) d[i + c2] = a > 0 ? d[i + c2] * (1 - a * t) : d[i + c2] + (255 - d[i + c2]) * -a * t;
        }
      }
    },
  },
};

/** The default values of a pixel adjustment. */
export function pixelDefaults(kind) {
  const def = PIXEL_ADJUSTMENTS[kind];
  const v = {};
  for (const p of def.params) { if (Array.isArray(p)) v[p[0]] = p[3]; else v[p.key] = p.default; }
  if (def.perRange) for (const r of ['shadows', 'midtones', 'highlights']) v[r] = Object.fromEntries(def.perRange.map((k) => [k, 0]));
  return v;
}

/** A copy of the active layer with the adjustment applied (partly selected pixels: that much), for the preview and to apply. */
export function pixelAdjustCanvas(doc, kind, values) {
  const { width: w, height: h } = doc;
  const src = doc.layer.canvas;
  const out = canvas(w, h);
  const ctx = out.getContext('2d');
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const orig = Uint8ClampedArray.from(img.data);
  PIXEL_ADJUSTMENTS[kind].run(img.data, w, h, values, src);
  const mask = doc.selectionMask();
  if (mask) {
    const d = img.data;
    for (let i = 0; i < mask.length; i++) {
      const m = mask[i];
      if (m === 255) continue;
      const j = i * 4;
      if (!m) { d[j] = orig[j]; d[j + 1] = orig[j + 1]; d[j + 2] = orig[j + 2]; d[j + 3] = orig[j + 3]; continue; }
      const k = m / 255;
      for (let c2 = 0; c2 < 4; c2++) d[j + c2] = orig[j + c2] + (d[j + c2] - orig[j + c2]) * k;
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

export function applyPixelAdjust(doc, kind, values) {
  const out = pixelAdjustCanvas(doc, kind, values);
  doc.record('layer');
  doc.layer.canvas = out;
  doc.dirty = true;
}
