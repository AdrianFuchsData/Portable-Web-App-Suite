/*
 * Tools of the image editor. Each tool gets pointer positions in image pixels and works on the editor context `ed`:
 *   ed.doc, ed.opts ({ size, opacity, fillShape, tolerance, contiguous, font, fontSize, aligned, pickSource, blurMode }),
 *   ed.colors ({ primary, secondary }),
 *   ed.preview ({ layer, canvas } shown instead of the layer while working), ed.render(), ed.changed(), ed.textAt(point)
 * Tool interface: { id, down(p, e), move(p, e), up(p, e), overlay(ctx, zoom) } — all optional except id.
 */
import { canvas, copyCanvas, selectionPath, maskSelection, combineSelections } from '@app/doc.js';

function hexToRgba(hex, alpha = 1) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, Math.round(alpha * 255)];
}

/** Constrain the end point for Shift: squares/circles, or lines in steps of 45 degrees. */
function constrain(start, p, e, mode) {
  if (!e.shiftKey) return p;
  const dx = p.x - start.x, dy = p.y - start.y;
  if (mode === 'line') {
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const len = Math.hypot(dx, dy);
    return { x: start.x + Math.cos(angle) * len, y: start.y + Math.sin(angle) * len };
  }
  const d = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: start.x + Math.sign(dx || 1) * d, y: start.y + Math.sign(dy || 1) * d };
}

/** Compose layer + stroke into ed.preview (clipped to the selection). */
function composeStroke(ed, base, stroke, erase) {
  const work = ed.preview.canvas;
  const ctx = work.getContext('2d');
  ctx.clearRect(0, 0, work.width, work.height);
  ctx.drawImage(base, 0, 0);
  ctx.save();
  ed.doc.clip(ctx);
  ctx.globalAlpha = ed.opts.opacity;
  ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
  ctx.drawImage(stroke, 0, 0);
  ctx.restore();
}

function finishPreview(ed) {
  if (!ed.preview) return;
  ed.preview.layer.canvas = ed.preview.canvas;
  ed.preview = null;
  ed.changed();
}

// ---- painting ---------------------------------------------------------------------------------------

function paintTool(id, { erase = false, pixel = false } = {}) {
  let base, stroke, last;
  const draw = (p, e) => {
    const ctx = stroke.getContext('2d');
    const pressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 1;
    const size = Math.max(1, ed_opts.size * pressure);
    ctx.fillStyle = ctx.strokeStyle = erase ? '#000' : ed_colors.primary;
    if (pixel) {
      // pencil: hard square pixels along the line (Bresenham), no antialiasing
      let x0 = Math.floor(last.x), y0 = Math.floor(last.y);
      const x1 = Math.floor(p.x), y1 = Math.floor(p.y);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      const half = Math.floor(size / 2);
      for (;;) {
        ctx.fillRect(x0 - half, y0 - half, Math.round(size), Math.round(size));
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    } else {
      ctx.lineCap = ctx.lineJoin = 'round';
      ctx.lineWidth = size;
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      if (last.x === p.x && last.y === p.y) { ctx.beginPath(); ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2); ctx.fill(); }
    }
    last = p;
  };
  let ed_opts, ed_colors;
  return {
    id,
    down(p, e, ed) {
      ed.doc.record('layer');
      ed_opts = ed.opts; ed_colors = ed.colors;
      base = copyCanvas(ed.doc.layer.canvas);
      stroke = canvas(ed.doc.width, ed.doc.height);
      ed.preview = { layer: ed.doc.layer, canvas: canvas(ed.doc.width, ed.doc.height) };
      last = p;
      draw(p, e);
      composeStroke(ed, base, stroke, erase);
    },
    move(p, e, ed) {
      if (!stroke) return;
      for (const ev of (e.getCoalescedEvents ? e.getCoalescedEvents() : []).slice(0, -1)) draw(ed.toImage(ev), ev);
      draw(p, e);
      composeStroke(ed, base, stroke, erase);
    },
    up(p, e, ed) {
      if (!stroke) return;
      finishPreview(ed);
      base = stroke = null;
    },
    cancel(ed) { ed.preview = null; base = stroke = null; },
  };
}

// ---- retouching: clone stamp, healing brush, smudge, blur/sharpen -----------------------------------------------

/** A round dab with a soft edge (radial alpha), reused for all dabs of one size. */
let dabCache = { size: 0, canvas: null };
function dabMask(size) {
  const d = Math.max(2, Math.ceil(size));
  if (dabCache.size === d) return dabCache.canvas;
  const c = canvas(d, d);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(d / 2, d / 2, 0, d / 2, d / 2, d / 2);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.6, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, d, d);
  dabCache = { size: d, canvas: c };
  return c;
}

/** Draw a soft dab of `src` (shifted by dx, dy: the pixel at p comes from p + (dx, dy)) at p onto ctx. */
function dabFrom(ctx, src, p, dx, dy, size, alpha = 1) {
  const d = Math.max(2, Math.ceil(size));
  const x = Math.round(p.x - d / 2), y = Math.round(p.y - d / 2);
  const tmp = dabFrom.tmp && dabFrom.tmp.width === d ? dabFrom.tmp : (dabFrom.tmp = canvas(d, d));
  const t = tmp.getContext('2d');
  t.globalCompositeOperation = 'copy';
  t.drawImage(src, x + dx, y + dy, d, d, 0, 0, d, d);
  t.globalCompositeOperation = 'destination-in';
  t.drawImage(dabMask(d), 0, 0);
  ctx.globalAlpha = alpha;
  ctx.drawImage(tmp, x, y);
  ctx.globalAlpha = 1;
}

/** Points from a to b every `step` pixels (b included). */
function along(a, b, step) {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, step)));
  return Array.from({ length: n }, (_, i) => ({ x: a.x + ((b.x - a.x) * (i + 1)) / n, y: a.y + ((b.y - a.y) * (i + 1)) / n }));
}

/**
 * Healing: the cloned texture keeps its detail but takes the colour and brightness of the surroundings —
 * result = clone + blur(original) − blur(clone), inside the painted area (`mask` alpha).
 */
export function healArea(base, clone, mask, radius = 6) {
  const w = base.width, h = base.height;
  const blurred = (src) => {
    const c = canvas(w, h);
    const ctx = c.getContext('2d');
    ctx.filter = `blur(${radius}px)`;
    ctx.drawImage(src, 0, 0);
    return ctx.getImageData(0, 0, w, h).data;
  };
  const bBase = blurred(base), bClone = blurred(clone);
  const out = clone.getContext('2d').getImageData(0, 0, w, h);
  const m = mask.getContext('2d').getImageData(0, 0, w, h).data;
  const o = out.data;
  for (let i = 0; i < o.length; i += 4) {
    if (!m[i + 3]) continue;
    for (let c = 0; c < 3; c++) o[i + c] = Math.max(0, Math.min(255, o[i + c] + bBase[i + c] - bClone[i + c]));
  }
  clone.getContext('2d').putImageData(out, 0, 0);
}

/**
 * Clone stamp and healing brush: Alt+click (or the "set source" option, for touch screens) picks the source; painting copies
 * the pixels at the same offset. "Aligned" keeps the offset for later strokes, otherwise every stroke starts at the source.
 */
function cloneTool(id, { heal = false } = {}) {
  let base, stroke, last, offset = null;
  let state = { source: null, aligned: true }; // shared with the overlay
  return {
    id,
    get source() { return state.source; },
    down(p, e, ed) {
      if (e.altKey || ed.opts.pickSource || !state.source) {
        state.source = { x: p.x, y: p.y };
        offset = null;
        ed.opts.pickSource = false;
        ed.render();
        if (ed.refresh) ed.refresh(); // the tool options show that a source is set
        return;
      }
      if (!offset || !ed.opts.aligned) offset = { x: state.source.x - p.x, y: state.source.y - p.y };
      ed.doc.record('layer');
      base = copyCanvas(ed.doc.layer.canvas);
      stroke = canvas(ed.doc.width, ed.doc.height);
      ed.preview = { layer: ed.doc.layer, canvas: canvas(ed.doc.width, ed.doc.height) };
      last = p;
      dabFrom(stroke.getContext('2d'), base, p, Math.round(offset.x), Math.round(offset.y), ed.opts.size);
      composeStroke(ed, base, stroke, false);
    },
    move(p, e, ed) {
      if (!stroke) return;
      const ctx = stroke.getContext('2d');
      for (const q of along(last, p, ed.opts.size / 4)) dabFrom(ctx, base, q, Math.round(offset.x), Math.round(offset.y), ed.opts.size);
      last = p;
      composeStroke(ed, base, stroke, false);
    },
    up(p, e, ed) {
      if (!stroke) return;
      if (heal) {
        // the clone of the whole layer at the offset, corrected, then cut to the painted area
        const shifted = canvas(base.width, base.height);
        shifted.getContext('2d').drawImage(base, -Math.round(offset.x), -Math.round(offset.y));
        healArea(base, shifted, stroke, Math.max(2, ed.opts.size / 3));
        const ctx = shifted.getContext('2d');
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(stroke, 0, 0);
        composeStroke(ed, base, shifted, false);
      }
      finishPreview(ed);
      base = stroke = null;
    },
    cancel(ed) { ed.preview = null; base = stroke = null; },
    overlay(ctx, zoom, ed) {
      if (!state.source) return;
      // the source: a cross, following the brush while painting
      const s = stroke && offset && last ? { x: last.x + offset.x, y: last.y + offset.y } : state.source;
      const r = 6 / zoom;
      ctx.save();
      ctx.lineWidth = 2 / zoom;
      ctx.strokeStyle = '#000';
      for (const [w, color] of [[3 / zoom, 'rgba(0,0,0,.7)'], [1.2 / zoom, '#fff']]) {
        ctx.lineWidth = w;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(s.x - r, s.y); ctx.lineTo(s.x + r, s.y);
        ctx.moveTo(s.x, s.y - r); ctx.lineTo(s.x, s.y + r);
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}

/** Smudge: drags the colours along the stroke (each dab takes the pixels of the previous position); opacity = strength. */
function smudgeTool() {
  let work, last;
  return {
    id: 'smudge',
    down(p, e, ed) {
      ed.doc.record('layer');
      work = copyCanvas(ed.doc.layer.canvas);
      ed.preview = { layer: ed.doc.layer, canvas: canvas(ed.doc.width, ed.doc.height) };
      last = p;
      this.show(ed);
    },
    move(p, e, ed) {
      if (!work) return;
      const ctx = work.getContext('2d');
      ctx.save();
      ed.doc.clip(ctx);
      for (const q of along(last, p, Math.max(1, ed.opts.size / 8))) {
        dabFrom(ctx, work, q, Math.round(last.x - q.x), Math.round(last.y - q.y), ed.opts.size, ed.opts.opacity);
        last = q;
      }
      ctx.restore();
      this.show(ed);
    },
    show(ed) {
      const ctx = ed.preview.canvas.getContext('2d');
      ctx.globalCompositeOperation = 'copy';
      ctx.drawImage(work, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
    },
    up(p, e, ed) { if (!work) return; finishPreview(ed); work = null; },
    cancel(ed) { ed.preview = null; work = null; },
  };
}

/** Blur or sharpen brush (option "mode"): paints a blurred or sharpened (unsharp mask) copy of the layer. */
export function processedCopy(src, mode, radius = 2, amount = 1) {
  const w = src.width, h = src.height;
  const blurred = canvas(w, h);
  const b = blurred.getContext('2d');
  b.filter = `blur(${radius}px)`;
  b.drawImage(src, 0, 0);
  b.filter = 'none';
  if (mode !== 'sharpen') return blurred;
  const a = src.getContext('2d').getImageData(0, 0, w, h);
  const bd = b.getImageData(0, 0, w, h).data;
  const d = a.data;
  for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, d[i + c] + (d[i + c] - bd[i + c]) * amount));
  const out = canvas(w, h);
  out.getContext('2d').putImageData(a, 0, 0);
  return out;
}

function blurTool() {
  let base, stroke, src, last;
  return {
    id: 'blur',
    down(p, e, ed) {
      ed.doc.record('layer');
      base = copyCanvas(ed.doc.layer.canvas);
      src = processedCopy(base, ed.opts.blurMode || 'blur', Math.max(1, ed.opts.size / 10));
      stroke = canvas(ed.doc.width, ed.doc.height);
      ed.preview = { layer: ed.doc.layer, canvas: canvas(ed.doc.width, ed.doc.height) };
      last = p;
      dabFrom(stroke.getContext('2d'), src, p, 0, 0, ed.opts.size);
      composeStroke(ed, base, stroke, false);
    },
    move(p, e, ed) {
      if (!stroke) return;
      for (const q of along(last, p, ed.opts.size / 4)) dabFrom(stroke.getContext('2d'), src, q, 0, 0, ed.opts.size);
      last = p;
      composeStroke(ed, base, stroke, false);
    },
    up(p, e, ed) { if (!stroke) return; finishPreview(ed); base = stroke = src = null; },
    cancel(ed) { ed.preview = null; base = stroke = src = null; },
  };
}

// ---- flood fill -------------------------------------------------------------------------------------

/** Pixels of the active layer similar to the one at (x, y): contiguous (flood fill) or everywhere. 1 = part of the region. */
export function regionMask(doc, x, y, { tolerance = 32, contiguous = true } = {}) {
  const { width: w, height: h } = doc;
  const d = doc.layer.canvas.getContext('2d').getImageData(0, 0, w, h).data;
  return regionOf(d, w, h, x, y, tolerance, contiguous);
}

function regionOf(d, w, h, x, y, tolerance, contiguous) {
  const i0 = (y * w + x) * 4;
  const target = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]];
  const tol = (tolerance / 100) * 255;
  const matches = (i) => Math.abs(d[i] - target[0]) <= tol && Math.abs(d[i + 1] - target[1]) <= tol && Math.abs(d[i + 2] - target[2]) <= tol && Math.abs(d[i + 3] - target[3]) <= tol;
  const fill = new Uint8Array(w * h);
  if (contiguous) {
    const stack = [x, y];
    while (stack.length) {
      const sy = stack.pop(), sx0 = stack.pop();
      let sx = sx0;
      while (sx > 0 && !fill[sy * w + sx - 1] && matches((sy * w + sx - 1) * 4)) sx--;
      let up = false, down = false;
      for (; sx < w && !fill[sy * w + sx] && matches((sy * w + sx) * 4); sx++) {
        fill[sy * w + sx] = 1;
        if (sy > 0) { const m = !fill[(sy - 1) * w + sx] && matches(((sy - 1) * w + sx) * 4); if (m && !up) stack.push(sx, sy - 1); up = m; }
        if (sy < h - 1) { const m = !fill[(sy + 1) * w + sx] && matches(((sy + 1) * w + sx) * 4); if (m && !down) stack.push(sx, sy + 1); down = m; }
      }
    }
  } else {
    for (let i = 0; i < w * h; i++) if (matches(i * 4)) fill[i] = 1;
  }
  return fill;
}

export function floodFill(doc, x, y, color, { tolerance = 32, contiguous = true, opacity = 1 } = {}) {
  x = Math.floor(x); y = Math.floor(y);
  const { width: w, height: h } = doc;
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  const mask = doc.selectionMask();
  if (mask && !mask[y * w + x]) return false;
  doc.record('layer');
  const ctx = doc.layer.canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const fill = regionOf(d, w, h, x, y, tolerance, contiguous);
  const [r, g, b, a] = hexToRgba(color, opacity);
  for (let i = 0; i < w * h; i++) {
    if (!fill[i]) continue;
    const k = mask ? (mask[i] / 255) * (a / 255) : a / 255;
    const j = i * 4;
    // source-over of the fill colour
    const outA = k + (d[j + 3] / 255) * (1 - k);
    if (outA <= 0) continue;
    d[j] = Math.round((r * k + d[j] * (d[j + 3] / 255) * (1 - k)) / outA);
    d[j + 1] = Math.round((g * k + d[j + 1] * (d[j + 3] / 255) * (1 - k)) / outA);
    d[j + 2] = Math.round((b * k + d[j + 2] * (d[j + 3] / 255) * (1 - k)) / outA);
    d[j + 3] = Math.round(outA * 255);
  }
  ctx.putImageData(img, 0, 0);
  doc.dirty = true;
  return true;
}

const fillTool = {
  id: 'fill',
  down(p, e, ed) {
    if (floodFill(ed.doc, p.x, p.y, e.button === 2 ? ed.colors.secondary : ed.colors.primary, ed.opts)) ed.changed();
  },
};

// ---- eyedropper -------------------------------------------------------------------------------------

export function sampleColor(doc, x, y) {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) return null;
  const c = canvas(1, 1);
  const ctx = c.getContext('2d');
  ctx.translate(-x, -y);
  doc.drawLayers(ctx);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const pickerTool = {
  id: 'picker',
  down(p, e, ed) {
    const color = sampleColor(ed.doc, p.x, p.y);
    if (!color) return;
    if (e.button === 2 || e.altKey) ed.colors.secondary = color; else ed.colors.primary = color;
    ed.render();
  },
};

// ---- shapes and gradient ------------------------------------------------------------------------------

function drawShape(ctx, kind, a, b, ed) {
  const { size, fillShape } = ed.opts;
  ctx.lineWidth = size;
  ctx.strokeStyle = ed.colors.primary;
  ctx.fillStyle = ed.colors.secondary;
  ctx.lineCap = ctx.lineJoin = kind === 'line' ? 'round' : 'miter';
  ctx.beginPath();
  if (kind === 'line') { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); return; }
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
  if (kind === 'rect') ctx.rect(x, y, w, h); else ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  if (fillShape) ctx.fill();
  ctx.stroke();
}

function shapeTool(id, kind) {
  let start = null, end = null;
  return {
    id,
    down(p) { start = end = p; },
    move(p, e, ed) { if (start) { end = constrain(start, p, e, kind); ed.render(); } },
    up(p, e, ed) {
      if (!start) return;
      end = constrain(start, p, e, kind);
      if (Math.hypot(end.x - start.x, end.y - start.y) >= 1) {
        ed.doc.record('layer');
        const ctx = ed.doc.layer.canvas.getContext('2d');
        ctx.save();
        ed.doc.clip(ctx);
        ctx.globalAlpha = ed.opts.opacity;
        drawShape(ctx, kind, start, end, ed);
        ctx.restore();
        ed.doc.dirty = true;
        ed.changed();
      }
      start = end = null;
      ed.render();
    },
    overlay(ctx, zoom, ed) {
      if (!start) return;
      ctx.save();
      ctx.globalAlpha = ed.opts.opacity;
      drawShape(ctx, kind, start, end, ed);
      ctx.restore();
    },
    cancel() { start = end = null; },
  };
}

function gradientTool() {
  let start = null, end = null;
  const paint = (ctx, ed) => {
    const g = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
    g.addColorStop(0, ed.colors.primary);
    g.addColorStop(1, ed.colors.secondary);
    const b = ed.doc.selectionBounds();
    ctx.fillStyle = g;
    ctx.fillRect(b.x, b.y, b.w, b.h);
  };
  return {
    id: 'gradient',
    down(p) { start = end = p; },
    move(p, e, ed) { if (start) { end = constrain(start, p, e, 'line'); ed.render(); } },
    up(p, e, ed) {
      if (!start) return;
      end = constrain(start, p, e, 'line');
      if (Math.hypot(end.x - start.x, end.y - start.y) >= 1) {
        ed.doc.record('layer');
        const ctx = ed.doc.layer.canvas.getContext('2d');
        ctx.save();
        ed.doc.clip(ctx);
        ctx.globalAlpha = ed.opts.opacity;
        paint(ctx, ed);
        ctx.restore();
        ed.doc.dirty = true;
        ed.changed();
      }
      start = end = null;
      ed.render();
    },
    overlay(ctx, zoom) {
      if (!start) return;
      ctx.save();
      ctx.lineWidth = 1 / zoom;
      ctx.strokeStyle = '#fff';
      ctx.setLineDash([4 / zoom, 4 / zoom]);
      ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
      ctx.restore();
    },
    cancel() { start = end = null; },
  };
}

// ---- text ---------------------------------------------------------------------------------------------

export function drawText(doc, p, text, { color, font = 'sans-serif', fontSize = 32, bold = false, italic = false, opacity = 1 }) {
  if (!text) return;
  doc.record('layer');
  const ctx = doc.layer.canvas.getContext('2d');
  ctx.save();
  doc.clip(ctx);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${fontSize}px ${font}`;
  text.split('\n').forEach((line, i) => ctx.fillText(line, p.x, p.y + i * fontSize * 1.25));
  ctx.restore();
  doc.dirty = true;
}

const textTool = {
  id: 'text',
  down(p, e, ed) { ed.textAt(p); },
};

// ---- selection ------------------------------------------------------------------------------------------

/**
 * Pixel range [lo, hi) between two coordinates: the pixels under both points are included, except for snapped
 * coordinates, which lie on pixel boundaries (guides, grid, image edges).
 */
function span(a, b, snapA, snapB) {
  const forward = a <= b;
  const lo = (forward ? snapA : snapB) ? Math.round(Math.min(a, b)) : Math.floor(Math.min(a, b));
  let hi = (forward ? snapB : snapA) ? Math.round(Math.max(a, b)) : Math.floor(Math.max(a, b)) + 1;
  if (hi <= lo) hi = lo + 1;
  return [lo, hi];
}

/** Clamp a selection rectangle to the image (null if nothing is left). */
export function clampSelection(doc, type, x0, y0, x1, y1) {
  const x = Math.max(0, Math.min(x0, x1)), y = Math.max(0, Math.min(y0, y1));
  const w = Math.min(doc.width, Math.max(x0, x1)) - x, h = Math.min(doc.height, Math.max(y0, y1)) - y;
  return w >= 1 && h >= 1 ? { type, x, y, w, h } : null;
}

/** How a new selection combines with the existing one: Shift adds, Alt subtracts, otherwise the tool option. */
export function selectionOp(e, ed) {
  if (e && e.shiftKey) return 'add';
  if (e && e.altKey) return 'subtract';
  return ed.opts.selOp || 'new';
}

function finishSelection(ed, base, op, next) {
  ed.doc.selection = op === 'new' ? next : combineSelections(ed.doc, base, next, op);
}

function selectTool(id, type) {
  let start = null, base = null, op = 'new';
  /** The selection from start to end, with the tool options' mode (free, fixed aspect ratio, fixed size). */
  const rect = (ed, end, e) => {
    const o = ed.opts;
    if (o.selMode === 'size' && o.selW >= 1 && o.selH >= 1) {
      const sx = start.snappedX ? Math.round(start.x) : Math.floor(start.x), sy = start.snappedY ? Math.round(start.y) : Math.floor(start.y);
      const x = end.x >= start.x ? sx : sx + 1 - o.selW, y = end.y >= start.y ? sy : sy + 1 - o.selH;
      return clampSelection(ed.doc, type, x, y, x + o.selW, y + o.selH);
    }
    let p = constrain(start, end, e, 'box');
    if (o.selMode === 'ratio' && o.selRatioW > 0 && o.selRatioH > 0) {
      const dx = end.x - start.x, dy = end.y - start.y, r = o.selRatioH / o.selRatioW;
      p = Math.abs(dy) > Math.abs(dx) * r
        ? { x: start.x + Math.sign(dx || 1) * Math.abs(dy) / r, y: end.y, snappedY: end.snappedY }
        : { x: end.x, y: start.y + Math.sign(dy || 1) * Math.abs(dx) * r, snappedX: end.snappedX };
    }
    const [x0, x1] = span(start.x, p.x, start.snappedX, p.snappedX);
    const [y0, y1] = span(start.y, p.y, start.snappedY, p.snappedY);
    return clampSelection(ed.doc, type, x0, y0, x1, y1);
  };
  let moved = false;
  return {
    id,
    type,
    snaps: true,
    down(p, e, ed) { start = p; moved = false; ed.selecting = true; base = ed.doc.selection; op = selectionOp(e, ed); if (op === 'new') ed.doc.selection = null; ed.render(); },
    move(p, e, ed) {
      if (!start) return;
      moved = true;
      ed.doc.selection = rect(ed, p, e);
      ed.render();
    },
    up(p, e, ed) {
      if (!start) return;
      // a click without dragging removes the selection (with a fixed size, it places one)
      const next = moved || ed.opts.selMode === 'size' ? rect(ed, p, e) : null;
      if (next || op === 'new') finishSelection(ed, base, op, next); else ed.doc.selection = base;
      start = null;
      ed.selecting = false;
      ed.render();
    },
    cancel(ed) { start = null; if (ed) ed.selecting = false; },
  };
}

/** Freehand lasso (drag) and polygon lasso (click the corners; double-click, Enter or a click on the first point closes). */
function lassoTool(id, polygon) {
  let points = null, base = null, op = 'new', hover = null;
  const finish = (ed) => {
    const pts = points;
    points = null; hover = null; ed.selecting = false;
    if (!pts || pts.length < 3) { ed.render(); return; }
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    const x = Math.floor(Math.min(...xs)), y = Math.floor(Math.min(...ys));
    const next = { type: 'poly', x, y, w: Math.ceil(Math.max(...xs)) - x, h: Math.ceil(Math.max(...ys)) - y, points: pts.map(([px, py]) => [px - x, py - y]) };
    finishSelection(ed, base, op, next);
    ed.render();
  };
  return {
    id,
    down(p, e, ed) {
      const q = [Math.max(0, Math.min(ed.doc.width, p.x)), Math.max(0, Math.min(ed.doc.height, p.y))];
      if (!points) { points = [q]; base = ed.doc.selection; op = selectionOp(e, ed); ed.selecting = true; if (op === 'new') ed.doc.selection = null; ed.render(); return; }
      if (!polygon) return;
      const first = points[0];
      const close = e.detail >= 2 || (points.length > 2 && Math.hypot(q[0] - first[0], q[1] - first[1]) * ed.view.zoom < 8);
      if (close) { finish(ed); return; }
      points.push(q);
      ed.render();
    },
    move(p, e, ed) {
      if (!points) return;
      const q = [Math.max(0, Math.min(ed.doc.width, p.x)), Math.max(0, Math.min(ed.doc.height, p.y))];
      if (polygon) { hover = q; ed.render(); return; }
      const last = points[points.length - 1];
      if (Math.hypot(q[0] - last[0], q[1] - last[1]) * ed.view.zoom >= 2) { points.push(q); ed.render(); }
    },
    up(p, e, ed) { if (points && !polygon) finish(ed); },
    onKey(e, ed) {
      if (!points) return false;
      if (e.key === 'Enter') { finish(ed); return true; }
      if (e.key === 'Escape') { points = null; hover = null; ed.selecting = false; ed.doc.selection = base; ed.render(); return true; }
      if (e.key === 'Backspace' && polygon && points.length > 1) { points.pop(); ed.render(); return true; }
      return false;
    },
    overlay(ctx, zoom) {
      if (!points) return;
      ctx.save();
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (hover) ctx.lineTo(hover[0], hover[1]);
      ctx.strokeStyle = '#000'; ctx.stroke();
      ctx.setLineDash([4 / zoom, 4 / zoom]); ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.restore();
    },
    cancel(ed) { points = null; hover = null; if (ed) ed.selecting = false; },
  };
}

/** Magic wand: selects similar pixels of the active layer (tolerance, contiguous as for the fill tool). */
const wandTool = {
  id: 'select-wand',
  down(p, e, ed) {
    const x = Math.floor(p.x), y = Math.floor(p.y);
    const { width: w, height: h } = ed.doc;
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const region = regionMask(ed.doc, x, y, { tolerance: ed.opts.tolerance, contiguous: ed.opts.contiguous });
    finishSelection(ed, ed.doc.selection, selectionOp(e, ed), maskSelection(region, w, h));
    ed.render();
  },
};

// ---- move ---------------------------------------------------------------------------------------------------

function moveTool() {
  let start = null, base = null, float = null, sel = null;
  const compose = (ed, dx, dy) => {
    const ctx = ed.preview.canvas.getContext('2d');
    ctx.clearRect(0, 0, ed.doc.width, ed.doc.height);
    if (float) { ctx.drawImage(base, 0, 0); ctx.drawImage(float, dx, dy); } else ctx.drawImage(base, dx, dy);
  };
  /** Movement in whole pixels; a moved selection snaps its edges to guides, grid and image edges. */
  const offset = (ed, p) => {
    let dx = Math.round(p.x - start.x), dy = Math.round(p.y - start.y);
    if (sel && ed.snapRect) { const s = ed.snapRect({ x: sel.x + dx, y: sel.y + dy, w: sel.w, h: sel.h }); dx += Math.round(s.dx); dy += Math.round(s.dy); }
    return [dx, dy];
  };
  return {
    id: 'move',
    down(p, e, ed) {
      ed.doc.record('layer');
      start = p;
      const layer = ed.doc.layer;
      base = copyCanvas(layer.canvas);
      sel = ed.doc.selection ? { ...ed.doc.selection } : null;
      if (sel) {
        // lift the selected pixels: float = selection content, base = layer without it
        float = canvas(ed.doc.width, ed.doc.height);
        const fctx = float.getContext('2d');
        fctx.save(); fctx.beginPath(); selectionPath(fctx, sel); fctx.clip(); fctx.drawImage(base, 0, 0); fctx.restore();
        const bctx = base.getContext('2d');
        bctx.save(); bctx.beginPath(); selectionPath(bctx, sel); bctx.clip(); bctx.clearRect(0, 0, base.width, base.height); bctx.restore();
      } else float = null;
      ed.preview = { layer, canvas: canvas(ed.doc.width, ed.doc.height) };
      compose(ed, 0, 0);
    },
    move(p, e, ed) {
      if (!start) return;
      const [dx, dy] = offset(ed, p);
      compose(ed, dx, dy);
      if (sel) ed.doc.selection = { ...sel, x: sel.x + dx, y: sel.y + dy };
      ed.render();
    },
    up(p, e, ed) {
      if (!start) return;
      const [dx, dy] = offset(ed, p);
      compose(ed, dx, dy);
      if (sel) ed.doc.selection = { ...sel, x: sel.x + dx, y: sel.y + dy };
      if (dx || dy) finishPreview(ed); else { ed.preview = null; ed.doc.undoStack.pop(); }
      start = base = float = null;
      ed.render();
    },
    cancel(ed) { if (sel) ed.doc.selection = sel; ed.preview = null; start = base = float = null; },
  };
}

export const TOOLS = [
  { ...moveTool(), icon: '✥', key: 'v' },
  { ...selectTool('select-rect', 'rect'), icon: '⬚', key: 'm' },
  { ...selectTool('select-ellipse', 'ellipse'), icon: '◌', key: 'q' },
  { ...lassoTool('select-lasso', false), icon: '➰', key: 'f' },
  { ...lassoTool('select-polygon', true), icon: '⬠', key: 'p' },
  { ...wandTool, icon: '🪄', key: 'w' },
  { ...paintTool('brush'), icon: '🖌', key: 'b' },
  { ...paintTool('pencil', { pixel: true }), icon: '✏', key: 'n' },
  { ...paintTool('eraser', { erase: true }), icon: '⌫', key: 'e' },
  Object.assign(cloneTool('clone'), { icon: '⎘', key: 's' }), Object.assign(cloneTool('heal', { heal: true }), { icon: '🩹', key: 'j' }),
  { ...smudgeTool(), icon: '👆', key: 'u' }, { ...blurTool(), icon: '◍', key: 'k' },
  { ...fillTool, icon: '🪣', key: 'g' },
  { ...gradientTool(), icon: '▤', key: 'd', snaps: true },
  { ...pickerTool, icon: '💧', key: 'i' },
  { ...shapeTool('line', 'line'), icon: '╱', key: 'l', snaps: true },
  { ...shapeTool('rect', 'rect'), icon: '▭', key: 'r', snaps: true },
  { ...shapeTool('ellipse', 'ellipse'), icon: '◯', key: 'o', snaps: true },
  { ...textTool, icon: 'T', key: 't', snaps: true },
  { id: 'hand', icon: '✋', key: 'h' },
];
