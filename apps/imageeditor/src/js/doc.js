/*
 * Image document of the image editor: full-size layer canvases, selection, undo history (memory-bounded snapshots),
 * compositing and file formats (raster images via the browser, BMP writer, OpenRaster with fflate, Photoshop PSD with ag-psd).
 */
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { decodeUpright } from '@app/meta.js';
import { encodeGif, encodeIco } from '@app/gif.js';

export const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light',
  'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];
const HISTORY_BYTES = 512 * 1024 * 1024;
const HISTORY_STEPS = 50;

let nextLayerId = 1;

export function canvas(width, height) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(width));
  c.height = Math.max(1, Math.round(height));
  return c;
}

export function copyCanvas(source) {
  const c = canvas(source.width, source.height);
  c.getContext('2d').drawImage(source, 0, 0);
  return c;
}

export const compositeOp = (blend) => (blend === 'normal' ? 'source-over' : blend);

export class ImageDoc {
  constructor(width, height, { background = 'transparent' } = {}) {
    this.width = width;
    this.height = height;
    this.layers = [];
    this.active = 0;
    this.selection = null; // { type: 'rect' | 'ellipse' | 'poly' | 'mask', x, y, w, h, points?, runs? } in image pixels (see selectionPath)
    this.undoStack = [];
    this.redoStack = [];
    this.dirty = false;
    const layer = this.addLayer(background === 'transparent' ? 'Layer 1' : 'Background', { record: false });
    if (background !== 'transparent') {
      const ctx = layer.canvas.getContext('2d');
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }
  }

  /** The layer that tools change: the active layer, or the quick mask while it is on. */
  get layer() {
    if (this.quickMask) return this.quickMask;
    const l = this.layers[this.active];
    return l && l.mask && this.editMask ? this.maskTarget(l) : l;
  }

  layerById(id) {
    if (this.quickMask && this.quickMask.id === id) return this.quickMask;
    if (typeof id === 'string' && id.startsWith('mask-')) { const l = this.layers.find((x) => `mask-${x.id}` === id); return l && l.mask ? this.maskTarget(l) : null; }
    return this.layers.find((l) => l.id === id);
  }

  // ---- text layers: a layer with `text` is drawn from it and can be edited until its pixels are changed --------------

  /** Make a new text layer above the active one (text: see renderText). */
  addTextLayer(text) {
    const layer = this.addLayer(text.text.split('\n')[0].slice(0, 40) || 'Text', { index: this.active + 1 });
    layer.text = { ...text };
    renderText(layer, this.width, this.height);
    return layer;
  }

  /** Change the text of a text layer (undoable). */
  setText(index, text) {
    const layer = this.layers[index];
    if (!layer) return;
    this.active = index;
    this.recordOnly('layer');
    layer.text = { ...text };
    renderText(layer, this.width, this.height);
    this.dirty = true;
  }

  /** A text layer becomes a normal layer (its pixels stay). */
  rasterize(index = this.active) {
    const layer = this.layers[index];
    if (!layer || !layer.text) return;
    this.active = index;
    this.record('layer');
  }

  // ---- quick mask: the selection as a grey image that the painting tools change (white: selected, black: not) -------------------

  enterQuickMask() {
    if (this.quickMask) return;
    const c = canvas(this.width, this.height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.width, this.height);
    const m = this.maskCanvas();
    if (m) {
      const mctx = m.getContext('2d');
      mctx.globalCompositeOperation = 'source-in';
      mctx.fillStyle = '#fff';
      mctx.fillRect(0, 0, this.width, this.height);
      ctx.drawImage(m, 0, 0);
    }
    this.quickMask = { id: nextLayerId++, name: 'Quick mask', canvas: c, visible: true, opacity: 1, blend: 'normal' };
    this.selection = null; // (painting on the mask is not limited)
  }

  /** Back to the layers: the mask becomes the selection (brightness × opacity of each pixel); its history steps are dropped. */
  leaveQuickMask() {
    const qm = this.quickMask;
    if (!qm) return;
    const d = qm.canvas.getContext('2d').getImageData(0, 0, this.width, this.height).data;
    const mask = new Uint8Array(this.width * this.height);
    for (let i = 0; i < mask.length; i++) mask[i] = Math.round(((0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) * d[i * 4 + 3]) / 255);
    this.quickMask = null;
    this.selection = alphaSelection(mask, this.width, this.height);
    const own = (snap) => snap.scope === 'layer' && snap.layerId === qm.id;
    this.undoStack = this.undoStack.filter((x) => !own(x));
    this.redoStack = this.redoStack.filter((x) => !own(x));
  }

  // ---- layers -------------------------------------------------------------------------------------

  addLayer(name, { source = null, index = this.layers.length, record = true } = {}) {
    if (record) this.record('doc');
    const layer = { id: nextLayerId++, name: name || `Layer ${this.layers.length + 1}`, canvas: canvas(this.width, this.height), visible: true, opacity: 1, blend: 'normal' };
    if (source) layer.canvas.getContext('2d').drawImage(source, 0, 0);
    this.layers.splice(index, 0, layer);
    this.active = index;
    this.dirty = record || this.dirty;
    return layer;
  }

  duplicateLayer() {
    this.record('doc');
    const src = this.layers[this.active];
    const layer = { ...src, id: nextLayerId++, name: `${src.name} copy`, canvas: copyCanvas(src.canvas), mask: src.mask ? copyCanvas(src.mask) : null };
    delete layer.maskProxy;
    this.layers.splice(this.active + 1, 0, layer);
    this.active += 1;
    this.dirty = true;
  }

  deleteLayer() {
    if (this.layers.length < 2) return;
    this.record('doc');
    this.layers.splice(this.active, 1);
    this.active = Math.min(this.active, this.layers.length - 1);
    this.dirty = true;
  }

  moveLayer(from, to) {
    if (to < 0 || to >= this.layers.length || from === to) return;
    this.record('doc');
    const [layer] = this.layers.splice(from, 1);
    this.layers.splice(to, 0, layer);
    this.active = to;
    this.dirty = true;
  }

  mergeDown() {
    if (this.active === 0) return;
    this.record('doc');
    const top = this.layers[this.active];
    const below = this.layers[this.active - 1];
    below.text = null; // (its pixels change)
    if (top.visible) {
      const ctx = below.canvas.getContext('2d');
      ctx.save();
      ctx.globalAlpha = top.opacity;
      ctx.globalCompositeOperation = compositeOp(top.blend);
      ctx.drawImage(top.mask && !top.maskDisabled ? maskedPixels(top.canvas, top.mask, 'none', false) : top.canvas, 0, 0);
      ctx.restore();
    }
    this.layers.splice(this.active, 1);
    this.editMask = false;
    this.active -= 1;
    this.dirty = true;
  }

  flatten() {
    this.record('doc');
    const flat = this.composite();
    this.layers = [{ id: nextLayerId++, name: 'Background', canvas: flat, visible: true, opacity: 1, blend: 'normal' }];
    this.active = 0;
    this.dirty = true;
  }

  setLayerProps(index, props) {
    const layer = this.layers[index];
    if (!layer) return;
    this.record('props', { coalesce: `props-${layer.id}-${Object.keys(props).join()}` });
    Object.assign(layer, props);
    this.dirty = true;
  }

  // ---- compositing --------------------------------------------------------------------------------

  /** Draw all visible layers into ctx (with its current transform); override: { layer, canvas } replaces one layer's pixels. */
  drawLayers(ctx, { override = null, filterLayer = null, filter = 'none' } = {}) {
    for (const layer of this.layers) {
      if (!layer.visible) continue;
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = compositeOp(layer.blend);
      const pixels = override && override.layer === layer ? override.canvas : layer.canvas;
      if (layer.mask && !layer.maskDisabled) {
        // through the layer mask (its preview while it is painted on)
        const mask = override && override.layer === this.maskTarget(layer) ? override.canvas : layer.mask;
        ctx.drawImage(maskedPixels(pixels, mask, filterLayer === layer ? filter : 'none', !(override && (override.layer === layer || override.layer === this.maskTarget(layer)))), 0, 0);
      } else {
        if (filterLayer === layer && filter !== 'none') ctx.filter = filter;
        ctx.drawImage(pixels, 0, 0);
      }
      ctx.restore();
    }
  }

  // ---- layer masks: a grey canvas per layer (white: visible, black: hidden; transparent counts as white) -----------------

  /** Give the active layer a mask: 'white' (all visible), 'black' (all hidden) or 'selection' (visible where selected). */
  addMask(kind = 'white', index = this.active) {
    const layer = this.layers[index];
    if (!layer || layer.mask) return;
    this.record('doc');
    const m = canvas(this.width, this.height);
    const ctx = m.getContext('2d');
    ctx.fillStyle = kind === 'black' || kind === 'selection' ? '#000' : '#fff';
    ctx.fillRect(0, 0, this.width, this.height);
    if (kind === 'selection' && this.selection) {
      const sel = this.maskCanvas();
      const sctx = sel.getContext('2d');
      sctx.globalCompositeOperation = 'source-in';
      sctx.fillStyle = '#fff';
      sctx.fillRect(0, 0, this.width, this.height);
      ctx.drawImage(sel, 0, 0);
    }
    layer.mask = m;
    layer.maskDisabled = false;
    this.editMask = true;
    this.dirty = true;
  }

  /** 'apply' bakes the mask into the layer's pixels, 'delete' drops it. */
  removeMask(mode = 'delete', index = this.active) {
    const layer = this.layers[index];
    if (!layer || !layer.mask) return;
    this.record('doc');
    if (mode === 'apply' && !layer.maskDisabled) { layer.canvas = maskedPixels(layer.canvas, layer.mask, 'none', false); layer.text = null; }
    layer.mask = null;
    layer.maskDisabled = false;
    this.editMask = false;
    this.dirty = true;
  }

  /** The stand-in "layer" whose canvas is the mask of a layer (what the tools paint on while the mask is edited). */
  maskTarget(layer) {
    if (!layer || !layer.mask) return null;
    if (!layer.maskProxy) {
      Object.defineProperty(layer, 'maskProxy', { enumerable: false, configurable: true, writable: true, value: {
        id: `mask-${layer.id}`, name: `${layer.name} (mask)`, visible: true, opacity: 1, blend: 'normal', text: null, isMask: true, owner: layer,
        get canvas() { return layer.mask; }, set canvas(c) { layer.mask = c; },
      } });
    }
    return layer.maskProxy;
  }

  composite() {
    const out = canvas(this.width, this.height);
    this.drawLayers(out.getContext('2d'));
    return out;
  }

  // ---- selection ----------------------------------------------------------------------------------

  /** Clip ctx to the selection (no-op without selection; a partly selected pixel ('alpha') counts from 50 %). */
  clip(ctx) {
    const s = this.selection;
    if (!s) return;
    ctx.beginPath();
    selectionPath(ctx, s);
    ctx.clip();
  }

  /** True when the selection has partly selected pixels (feathered): drawing must go through paintThrough. */
  get softSelection() { return !!this.selection && this.selection.type === 'alpha'; }

  /**
   * Draw with draw(ctx) into ctx (a context of an image-sized canvas without transform), limited to the selection: with a
   * partly selected pixel the result is that much of the drawing and the rest of what was there before (like GIMP).
   */
  paintThrough(ctx, draw) {
    if (!this.softSelection) { ctx.save(); this.clip(ctx); draw(ctx); ctx.restore(); return; }
    const before = copyCanvas(ctx.canvas);
    ctx.save(); draw(ctx); ctx.restore();
    blendThrough(ctx.canvas, before, this.maskCanvas());
  }

  /** The selection as a canvas of the image's size whose alpha is how much a pixel is selected (null without selection). */
  maskCanvas(s = this.selection) {
    if (!s) return null;
    const c = canvas(this.width, this.height);
    const ctx = c.getContext('2d');
    if (s.type === 'alpha') {
      const img = ctx.createImageData(s.w, s.h);
      for (let i = 0; i < s.alpha.length; i++) img.data[i * 4 + 3] = s.alpha[i];
      ctx.putImageData(img, s.x, s.y);
      return c;
    }
    ctx.fillStyle = '#000';
    ctx.beginPath();
    selectionPath(ctx, s);
    ctx.fill();
    return c;
  }

  selectionBounds() {
    const s = this.selection;
    if (!s) return { x: 0, y: 0, w: this.width, h: this.height };
    const x = Math.max(0, Math.floor(s.x));
    const y = Math.max(0, Math.floor(s.y));
    return { x, y, w: Math.min(this.width, Math.ceil(s.x + s.w)) - x, h: Math.min(this.height, Math.ceil(s.y + s.h)) - y };
  }

  /** Alpha mask (Uint8Array, width*height) of the selection (or of another selection object), or null. */
  selectionMask(s = this.selection) {
    if (!s) return null;
    if (s.type === 'alpha') {
      const mask = new Uint8Array(this.width * this.height);
      for (let y = Math.max(0, -s.y); y < s.h && s.y + y < this.height; y++) {
        const x0 = Math.max(0, -s.x), x1 = Math.min(s.w, this.width - s.x);
        if (x1 > x0) mask.set(s.alpha.subarray(y * s.w + x0, y * s.w + x1), (s.y + y) * this.width + s.x + x0);
      }
      return mask;
    }
    const c = canvas(this.width, this.height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.beginPath();
    selectionPath(ctx, s);
    ctx.fill();
    const data = ctx.getImageData(0, 0, this.width, this.height).data;
    const mask = new Uint8Array(this.width * this.height);
    for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3];
    return mask;
  }

  // ---- history ------------------------------------------------------------------------------------

  capture(scope, layerId) {
    if (scope === 'layer') {
      const layer = this.layerById(layerId);
      return layer ? { scope, layerId, canvas: copyCanvas(layer.canvas), text: layer.text || null, selection: this.selection && { ...this.selection } } : null;
    }
    if (scope === 'props') return { scope, layers: this.layers.map((l) => ({ id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend, maskDisabled: !!l.maskDisabled })), active: this.active };
    return {
      scope: 'doc', width: this.width, height: this.height, active: this.active, selection: this.selection && { ...this.selection },
      layers: this.layers.map((l) => ({ ...l, canvas: copyCanvas(l.canvas), mask: l.mask ? copyCanvas(l.mask) : null })), editMask: this.editMask,
    };
  }

  restore(snap) {
    if (snap.scope === 'layer') {
      const layer = this.layerById(snap.layerId);
      if (layer) { layer.canvas = snap.canvas; layer.text = snap.text || null; }
      this.selection = snap.selection;
    } else if (snap.scope === 'props') {
      for (const p of snap.layers) { const l = this.layers.find((x) => x.id === p.id); if (l) Object.assign(l, p); }
      this.active = snap.active;
    } else {
      this.width = snap.width;
      this.height = snap.height;
      this.layers = snap.layers;
      this.active = snap.active;
      this.selection = snap.selection;
      this.editMask = !!snap.editMask && !!(this.layers[this.active] || {}).mask;
    }
  }

  static bytes(snap) {
    if (snap.scope === 'layer') return snap.canvas.width * snap.canvas.height * 4;
    if (snap.scope === 'props') return 100;
    return snap.layers.reduce((n, l) => n + l.canvas.width * l.canvas.height * (l.mask ? 8 : 4), 0);
  }

  /**
   * Remember the current state before a change. scope: 'layer' (the active layer), 'props' or 'doc'. A change of the pixels of a
   * text layer ('layer') makes it a normal layer (the history keeps the text: undo makes it a text layer again).
   */
  record(scope = 'layer', { coalesce = null } = {}) {
    if (scope === 'layer' && this.layer && this.layer.text) {
      this.recordOnly(scope);
      this.layer.text = null;
      return;
    }
    this.recordOnly(scope, { coalesce });
  }

  recordOnly(scope = 'layer', { coalesce = null } = {}) {
    const top = this.undoStack[this.undoStack.length - 1];
    if (coalesce && top && top.coalesce === coalesce && Date.now() - top.time < 1500) { top.time = Date.now(); return; }
    const snap = this.capture(scope, this.layer && this.layer.id);
    if (!snap) return;
    snap.coalesce = coalesce;
    snap.time = Date.now();
    this.undoStack.push(snap);
    this.redoStack = [];
    let total = this.undoStack.reduce((n, s) => n + ImageDoc.bytes(s), 0);
    while (this.undoStack.length > 1 && (this.undoStack.length > HISTORY_STEPS || total > HISTORY_BYTES)) total -= ImageDoc.bytes(this.undoStack.shift());
  }

  undo() { return this.step(this.undoStack, this.redoStack); }
  redo() { return this.step(this.redoStack, this.undoStack); }

  step(from, to) {
    const snap = from.pop();
    if (!snap) return false;
    to.push(this.capture(snap.scope, snap.layerId));
    this.restore(snap);
    this.dirty = true;
    return true;
  }

  // ---- whole-image operations ---------------------------------------------------------------------

  /**
   * Replace every layer by fn(layerCanvas) -> new canvas; the document gets the new size. shift: [dx, dy] when the content only
   * moves (canvas size, crop) – text layers stay text layers there; otherwise they become normal layers.
   */
  transformAll(width, height, fn, shift = null) {
    this.record('doc');
    for (const layer of this.layers) {
      layer.canvas = fn(layer.canvas);
      if (layer.mask) layer.mask = fn(layer.mask); // (areas outside the old mask are transparent: visible)
      if (layer.text) layer.text = shift ? { ...layer.text, x: layer.text.x + shift[0], y: layer.text.y + shift[1] } : null;
    }
    this.width = width;
    this.height = height;
    this.selection = null;
    this.dirty = true;
  }

  resize(width, height, smooth = true) {
    this.transformAll(width, height, (src) => {
      const c = canvas(width, height);
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = smooth;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, 0, 0, width, height);
      return c;
    });
  }

  resizeCanvas(width, height, anchorX = 0.5, anchorY = 0.5) {
    const dx = Math.round((width - this.width) * anchorX);
    const dy = Math.round((height - this.height) * anchorY);
    this.transformAll(width, height, (src) => { const c = canvas(width, height); c.getContext('2d').drawImage(src, dx, dy); return c; }, [dx, dy]);
  }

  crop({ x, y, w, h }) {
    if (w < 1 || h < 1) return;
    this.transformAll(w, h, (src) => { const c = canvas(w, h); c.getContext('2d').drawImage(src, -x, -y); return c; }, [-x, -y]);
  }

  rotate(degrees) {
    const quarter = ((degrees % 360) + 360) % 360;
    const swap = quarter === 90 || quarter === 270;
    const w = swap ? this.height : this.width;
    const h = swap ? this.width : this.height;
    this.transformAll(w, h, (src) => {
      const c = canvas(w, h);
      const ctx = c.getContext('2d');
      ctx.translate(w / 2, h / 2);
      ctx.rotate((quarter * Math.PI) / 180);
      ctx.drawImage(src, -src.width / 2, -src.height / 2);
      return c;
    });
  }

  /**
   * Rotate the image by any angle (degrees, clockwise). mode: 'expand' (the canvas grows to hold the whole image), 'keep' (same
   * size, the corners become transparent) or 'crop' (the largest rectangle of the image's aspect ratio without empty corners).
   */
  rotateBy(degrees, mode = 'expand') {
    const a = (degrees * Math.PI) / 180, cos = Math.abs(Math.cos(a)), sin = Math.abs(Math.sin(a));
    const W = this.width, H = this.height;
    let w = W, h = H;
    if (mode === 'expand') { w = Math.ceil(W * cos + H * sin - 1e-6); h = Math.ceil(W * sin + H * cos - 1e-6); } else if (mode === 'crop') {
      const s = Math.min(W / (W * cos + H * sin), H / (W * sin + H * cos));
      w = Math.max(1, Math.floor(W * s + 1e-6)); h = Math.max(1, Math.floor(H * s + 1e-6));
    }
    this.transformAll(w, h, (src) => {
      const c = canvas(w, h);
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.translate(w / 2, h / 2);
      ctx.rotate(a);
      ctx.drawImage(src, -src.width / 2, -src.height / 2);
      return c;
    });
  }

  flip(horizontal, onlyActive = false) {
    const fn = (src) => {
      const c = canvas(src.width, src.height);
      const ctx = c.getContext('2d');
      ctx.translate(horizontal ? src.width : 0, horizontal ? 0 : src.height);
      ctx.scale(horizontal ? -1 : 1, horizontal ? 1 : -1);
      ctx.drawImage(src, 0, 0);
      return c;
    };
    if (onlyActive) { this.record('layer'); this.layer.canvas = fn(this.layer.canvas); this.dirty = true; } else this.transformAll(this.width, this.height, fn);
  }
}

// ---- layer masks ----------------------------------------------------------------------------------------------------------

const alphaCache = new WeakMap(); // mask canvas -> { canvas (alpha), stamp }
let maskStamp = 0;
/** Masks changed (painting, undo): cached alpha versions are made again. */
export function masksChanged() { maskStamp++; }

/** The mask as alpha: (grey × alpha + 255 × (1 − alpha)) per pixel – white and transparent show, black hides. */
function maskAlpha(mask, cached) {
  const hit = cached && alphaCache.get(mask);
  if (hit && hit.stamp === maskStamp) return hit.canvas;
  const { width: w, height: h } = mask;
  const d = mask.getContext('2d').getImageData(0, 0, w, h).data;
  const c = (hit && hit.canvas.width === w && hit.canvas.height === h) ? hit.canvas : canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const o = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    o[i + 3] = ((0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * a + 255 * (255 - a)) / 255;
  }
  ctx.putImageData(img, 0, 0);
  if (cached) alphaCache.set(mask, { canvas: c, stamp: maskStamp });
  return c;
}

/** The pixels of a layer through its mask (and a CSS filter for the adjustment preview). */
/** A mask without transparency (transparent = white), as PSD wants it. */
function opaqueMask(mask) {
  const c = canvas(mask.width, mask.height);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(mask, 0, 0);
  return c;
}

export function maskedPixels(pixels, mask, filter = 'none', cached = true) {
  const out = canvas(pixels.width, pixels.height);
  const ctx = out.getContext('2d');
  if (filter !== 'none') ctx.filter = filter;
  ctx.drawImage(pixels, 0, 0);
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(maskAlpha(mask, cached), 0, 0);
  return out;
}

// ---- text layers ---------------------------------------------------------------------------------------------------

/** CSS font of a text: { font, fontSize, bold, italic }. */
export const textFont = (t) => `${t.italic ? 'italic ' : ''}${t.bold ? 'bold ' : ''}${t.fontSize}px ${t.font || 'sans-serif'}`;

const measureCtx = () => (measureCtx.c ||= canvas(1, 1).getContext('2d'));

/** Lines of a text with their x offset (alignment) and width; the line height is 1.25 × the size. */
function textLines(t) {
  const ctx = measureCtx();
  ctx.font = textFont(t);
  const lines = String(t.text || '').split('\n').map((line) => ({ line, width: ctx.measureText(line).width }));
  const widest = Math.max(0, ...lines.map((l) => l.width));
  return { widest, lines: lines.map((l) => ({ ...l, dx: t.align === 'center' ? (widest - l.width) / 2 : t.align === 'right' ? widest - l.width : 0 })) };
}

/** The rectangle a text layer's text covers (image pixels). */
export function textBounds(t) {
  const { widest, lines } = textLines(t);
  return { x: t.x, y: t.y, w: Math.max(1, widest), h: Math.max(1, lines.length * t.fontSize * 1.25) };
}

/**
 * Draw a text layer from its text { text, x, y, font, fontSize, bold, italic, color, align ('left' | 'center' | 'right') }
 * (the font must be loaded: document.fonts.load before).
 */
export function renderText(layer, width, height) {
  const t = layer.text;
  const c = canvas(width, height);
  const ctx = c.getContext('2d');
  ctx.fillStyle = t.color || '#000000';
  ctx.textBaseline = 'top';
  ctx.font = textFont(t);
  textLines(t).lines.forEach(({ line, dx }, i) => ctx.fillText(line, t.x + dx, t.y + i * t.fontSize * 1.25));
  layer.canvas = c;
}

/**
 * Path of a selection: rect and ellipse by their box; 'poly' (lasso) by points relative to (x, y); 'mask' (magic wand,
 * combined selections) by runs of pixels [dx, dy, length, …] relative to (x, y). Moving a selection only changes x and y.
 */
export function selectionPath(ctx, s) {
  if (s.type === 'alpha') s = hardSelection(s);
  if (s.type === 'poly') {
    s.points.forEach(([px, py], i) => (i ? ctx.lineTo(s.x + px, s.y + py) : ctx.moveTo(s.x + px, s.y + py)));
    ctx.closePath();
    return;
  }
  if (s.type === 'mask') {
    for (let i = 0; i < s.runs.length; i += 3) ctx.rect(s.x + s.runs[i], s.y + s.runs[i + 1], s.runs[i + 2], 1);
    return;
  }
  const x = Math.min(s.x, s.x + s.w), y = Math.min(s.y, s.y + s.h), w = Math.abs(s.w), h = Math.abs(s.h);
  if (s.type === 'ellipse') ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else ctx.rect(x, y, w, h);
}

/** A 'mask' selection from a mask (width*height, non-zero = selected), or null when nothing is selected. */
export function maskSelection(mask, width, height) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  const runs = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1;) {
      if (!mask[y * width + x]) { x++; continue; }
      const start = x;
      while (x <= x1 && mask[y * width + x]) x++;
      runs.push(start - x0, y - y0, x - start);
    }
  }
  return { type: 'mask', x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, runs: Int32Array.from(runs) };
}

const outlines = new WeakMap();
/** Outline of a selection for the marching ants (for 'mask' only the border between selected and unselected pixels). */
export function selectionOutline(ctx, s) {
  if (s.type === 'alpha') s = hardSelection(s); // (the marching ants at 50 %, like GIMP)
  if (s.type !== 'mask') { selectionPath(ctx, s); return; }
  let segs = outlines.get(s.runs);
  if (!segs) {
    const { w, h } = s;
    const m = new Uint8Array((w + 2) * (h + 2));
    for (let i = 0; i < s.runs.length; i += 3) for (let k = 0; k < s.runs[i + 2]; k++) m[(s.runs[i + 1] + 1) * (w + 2) + s.runs[i] + k + 1] = 1;
    const at = (x, y) => m[(y + 1) * (w + 2) + x + 1];
    segs = [];
    for (let y = 0; y <= h; y++) { // horizontal edges, merged along x
      for (let x = 0; x < w;) {
        if (at(x, y - 1) === at(x, y)) { x++; continue; }
        const start = x;
        while (x < w && at(x, y - 1) !== at(x, y)) x++;
        segs.push(start, y, x, y);
      }
    }
    for (let x = 0; x <= w; x++) { // vertical edges, merged along y
      for (let y = 0; y < h;) {
        if (at(x - 1, y) === at(x, y)) { y++; continue; }
        const start = y;
        while (y < h && at(x - 1, y) !== at(x, y)) y++;
        segs.push(x, start, x, y);
      }
    }
    outlines.set(s.runs, segs);
  }
  for (let i = 0; i < segs.length; i += 4) { ctx.moveTo(s.x + segs[i], s.y + segs[i + 1]); ctx.lineTo(s.x + segs[i + 2], s.y + segs[i + 3]); }
}

/**
 * Combine two selections: 'add', 'subtract' or 'intersect' (the result is a 'mask' selection, or null when empty). With a
 * partly selected ('alpha') selection, the amounts combine (maximum, minimum) and the result keeps them.
 */
export function combineSelections(doc, a, b, op) {
  if (!a || op === 'new') return op === 'subtract' || op === 'intersect' ? null : b;
  if (!b) return op === 'add' || op === 'subtract' ? a : null;
  const ma = doc.selectionMask(a), mb = doc.selectionMask(b);
  const out = new Uint8Array(ma.length);
  if (a.type === 'alpha' || b.type === 'alpha') {
    for (let i = 0; i < out.length; i++) out[i] = op === 'add' ? Math.max(ma[i], mb[i]) : op === 'subtract' ? Math.min(ma[i], 255 - mb[i]) : Math.min(ma[i], mb[i]);
    return alphaSelection(out, doc.width, doc.height);
  }
  for (let i = 0; i < out.length; i++) {
    const x = ma[i] >= 128, y = mb[i] >= 128;
    out[i] = op === 'add' ? x || y : op === 'subtract' ? x && !y : x && y;
  }
  return maskSelection(out, doc.width, doc.height);
}

// ---- partly selected pixels (feather, grow, shrink, border) -------------------------------------------------------------------

const hardOf = new WeakMap();
/** The pixels selected at least 50 % of an 'alpha' selection as a 'mask' selection (for clipping and the outline). */
function hardSelection(s) {
  let hard = hardOf.get(s.alpha);
  if (!hard) {
    const bin = new Uint8Array(s.alpha.length);
    for (let i = 0; i < bin.length; i++) bin[i] = s.alpha[i] >= 128 ? 1 : 0;
    hard = maskSelection(bin, s.w, s.h) || { type: 'mask', x: 0, y: 0, w: 0, h: 0, runs: new Int32Array(0) };
    hardOf.set(s.alpha, hard);
  }
  return { ...hard, x: s.x + hard.x, y: s.y + hard.y };
}

/**
 * A selection from an amount per pixel (width*height, 0–255): an 'alpha' selection of the bounds of the selected pixels, a
 * plain 'mask' selection when every pixel is either selected or not, or null when nothing is selected.
 */
export function alphaSelection(mask, width, height) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1, soft = false;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = mask[y * width + x];
      if (!v) continue;
      if (v < 255) soft = true;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  if (!soft) return maskSelection(mask, width, height);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const alpha = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) alpha.set(mask.subarray((y0 + y) * width + x0, (y0 + y) * width + x0 + w), y * w);
  return { type: 'alpha', x: x0, y: y0, w, h, alpha };
}

/**
 * Blend target with what it was before: target = target * mask + before * (1 - mask) per pixel (premultiplied, as the canvas
 * composites), mask: a canvas whose alpha is the amount.
 */
export function blendThrough(target, before, mask) {
  const after = copyCanvas(target);
  const actx = after.getContext('2d');
  actx.globalCompositeOperation = 'destination-in';
  actx.drawImage(mask, 0, 0);
  const rest = copyCanvas(before);
  const rctx = rest.getContext('2d');
  rctx.globalCompositeOperation = 'destination-out';
  rctx.drawImage(mask, 0, 0);
  const ctx = target.getContext('2d');
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'copy';
  ctx.drawImage(rest, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(after, 0, 0);
  ctx.restore();
}

/** Euclidean distance of every pixel to the nearest pixel where on[i] is true (Felzenszwalb–Huttenlocher, squared, in O(n)). */
export function distanceTo(on, width, height) {
  const INF = 1e20;
  const d = new Float64Array(width * height);
  for (let i = 0; i < d.length; i++) d[i] = on[i] ? 0 : INF;
  const n = Math.max(width, height);
  const f = new Float64Array(n), out = new Float64Array(n), z = new Float64Array(n + 1);
  const v = new Int32Array(n);
  const pass = (len) => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let sq = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (sq <= z[k]) { k--; sq = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = sq; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      out[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
  };
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = d[y * width + x];
    pass(height);
    for (let y = 0; y < height; y++) d[y * width + x] = out[y];
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) f[x] = d[y * width + x];
    pass(width);
    for (let x = 0; x < width; x++) d[y * width + x] = Math.sqrt(out[x]);
  }
  return d;
}

/** Box blur of an amount per pixel along both axes (radius r), in place. */
function boxBlur(m, width, height, r) {
  const tmp = new Float32Array(Math.max(width, height));
  const run = (get, set, len) => {
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += get(Math.min(len - 1, Math.max(0, i)));
    for (let i = 0; i < len; i++) {
      tmp[i] = sum / (2 * r + 1);
      sum += get(Math.min(len - 1, i + r + 1)) - get(Math.max(0, i - r));
    }
    for (let i = 0; i < len; i++) set(i, tmp[i]);
  };
  for (let y = 0; y < height; y++) run((x) => m[y * width + x], (x, v) => { m[y * width + x] = v; }, width);
  for (let x = 0; x < width; x++) run((y) => m[y * width + x], (y, v) => { m[y * width + x] = v; }, height);
}

/**
 * Change the selection of doc: 'feather' (soft edge over about radius pixels), 'grow' and 'shrink' (by radius pixels, round),
 * 'border' (a band of radius pixels on each side of the edge, soft). Returns the new selection (null when nothing is left).
 */
export function modifySelection(doc, op, radius) {
  const { width: w, height: h } = doc;
  const mask = doc.selectionMask();
  if (!mask) return null;
  const r = Math.max(0, +radius || 0);
  const out = new Uint8Array(w * h);
  if (op === 'feather') {
    // three box blurs approximate a Gaussian (sigma about radius / 2), like GIMP's feather radius
    const m = Float32Array.from(mask);
    const box = Math.max(1, Math.round(r / 3));
    if (r > 0) for (let k = 0; k < 3; k++) boxBlur(m, w, h, box);
    for (let i = 0; i < out.length; i++) out[i] = Math.round(m[i]);
    return alphaSelection(out, w, h);
  }
  const on = new Uint8Array(w * h);
  for (let i = 0; i < on.length; i++) on[i] = mask[i] >= 128 ? 1 : 0;
  const grown = () => {
    const d = distanceTo(on, w, h);
    return (i) => Math.max(mask[i], Math.round(255 * Math.min(1, Math.max(0, r + 1 - d[i])))); // (edge pixels half selected: smooth)
  };
  const shrunk = () => {
    const off = new Uint8Array(w * h);
    for (let i = 0; i < off.length; i++) off[i] = on[i] ? 0 : 1;
    // the image edge counts as outside (GIMP's default)
    const W = w + 2, H = h + 2, big = new Uint8Array(W * H).fill(1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) big[(y + 1) * W + x + 1] = off[y * w + x];
    const d = distanceTo(big, W, H);
    return (i) => Math.min(mask[i], Math.round(255 * Math.min(1, Math.max(0, d[(Math.floor(i / w) + 1) * W + (i % w) + 1] - r))));
  };
  if (op === 'grow') { const g = grown(); for (let i = 0; i < out.length; i++) out[i] = g(i); } else if (op === 'shrink') { const s = shrunk(); for (let i = 0; i < out.length; i++) out[i] = s(i); } else if (op === 'border') {
    const g = grown(), s = shrunk();
    for (let i = 0; i < out.length; i++) out[i] = Math.min(g(i), 255 - s(i));
  } else throw new Error(`unknown selection change ${op}`);
  return alphaSelection(out, w, h);
}

/** The selection inverted (partly selected pixels keep their rest). */
export function invertedSelection(doc) {
  const mask = doc.selectionMask();
  if (!mask) return null;
  if (doc.selection.type !== 'alpha') { for (let i = 0; i < mask.length; i++) mask[i] = mask[i] >= 128 ? 0 : 255; return maskSelection(mask, doc.width, doc.height); }
  for (let i = 0; i < mask.length; i++) mask[i] = 255 - mask[i];
  return alphaSelection(mask, doc.width, doc.height);
}

// ---- file formats -----------------------------------------------------------------------------------

export const SAVE_FORMATS = {
  png: { label: 'PNG', mime: 'image/png', ext: '.png' },
  jpeg: { label: 'JPEG', mime: 'image/jpeg', ext: '.jpg', quality: true },
  webp: { label: 'WebP', mime: 'image/webp', ext: '.webp', quality: true },
  bmp: { label: 'BMP', mime: 'image/bmp', ext: '.bmp' },
  gif: { label: 'GIF (256 colours)', mime: 'image/gif', ext: '.gif' },
  ico: { label: 'ICO (icon)', mime: 'image/x-icon', ext: '.ico' },
  ora: { label: 'OpenRaster (layers)', mime: 'image/openraster', ext: '.ora' },
  psd: { label: 'Photoshop PSD (layers)', mime: 'image/vnd.adobe.photoshop', ext: '.psd' },
};

export function formatOfName(name) {
  const e = (name.split('.').pop() || '').toLowerCase();
  if (e === 'jpg' || e === 'jpeg' || e === 'jfif') return 'jpeg';
  if (SAVE_FORMATS[e]) return e;
  return 'png';
}

/** Decode an image file (anything the browser can show in <img>) into a canvas. */
export async function decodeImage(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = canvas(img.naturalWidth || 300, img.naturalHeight || 150);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally { URL.revokeObjectURL(url); }
}

export async function openFile(bytes, name) {
  if (/\.ora$/i.test(name) || (bytes.length > 60 && strFromU8(bytes.subarray(30, 54)) === 'mimetypeimage/openraster')) return readOra(bytes);
  if (/\.(psd|psb)$/i.test(name) || (bytes.length > 4 && strFromU8(bytes.subarray(0, 4)) === '8BPS')) return readPsd(bytes);
  const type = /\.svg$/i.test(name) ? 'image/svg+xml' : '';
  const c = await decodeUpright(bytes, type, decodeImage); // (EXIF orientation)
  const doc = new ImageDoc(c.width, c.height);
  doc.layers[0].name = 'Background';
  doc.layers[0].canvas = c;
  return doc;
}

const toBlob = (c, mime, quality) => new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error(`cannot encode ${mime}`))), mime, quality));

export async function encode(doc, format, { quality = 0.9, background = '#ffffff', dither = true, icoSizes = [16, 32, 48, 256] } = {}) {
  if (format === 'ora') return writeOra(doc);
  if (format === 'psd') return writePsd(doc);
  let flat = doc.composite();
  if (format === 'gif') return encodeGif(flat.getContext('2d').getImageData(0, 0, flat.width, flat.height).data, flat.width, flat.height, { dither });
  if (format === 'ico') return encodeIco(flat, icoSizes, async (c) => new Uint8Array(await (await toBlob(c, 'image/png')).arrayBuffer()));
  if (format === 'jpeg' || format === 'bmp') { // no transparency: put the image on a background colour
    const c = canvas(flat.width, flat.height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(flat, 0, 0);
    flat = c;
  }
  if (format === 'bmp') return writeBmp(flat);
  const blob = await toBlob(flat, SAVE_FORMATS[format].mime, SAVE_FORMATS[format].quality ? quality : undefined);
  if (format !== 'png' && blob.type !== SAVE_FORMATS[format].mime) throw new Error(`${SAVE_FORMATS[format].label} is not supported by this browser`);
  return new Uint8Array(await blob.arrayBuffer());
}

function writeBmp(c) {
  const { width: w, height: h } = c;
  const data = c.getContext('2d').getImageData(0, 0, w, h).data;
  const row = Math.ceil((w * 3) / 4) * 4;
  const out = new Uint8Array(54 + row * h);
  const v = new DataView(out.buffer);
  out[0] = 0x42; out[1] = 0x4d;
  v.setUint32(2, out.length, true); v.setUint32(10, 54, true); v.setUint32(14, 40, true);
  v.setInt32(18, w, true); v.setInt32(22, h, true); v.setUint16(26, 1, true); v.setUint16(28, 24, true);
  v.setUint32(34, row * h, true); v.setInt32(38, 2835, true); v.setInt32(42, 2835, true);
  for (let y = 0; y < h; y++) {
    const o = 54 + (h - 1 - y) * row;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      out[o + x * 3] = data[i + 2]; out[o + x * 3 + 1] = data[i + 1]; out[o + x * 3 + 2] = data[i];
    }
  }
  return out;
}

// OpenRaster: ZIP with "mimetype" (stored, first), stack.xml (first layer = top), data/*.png, mergedimage.png, Thumbnails/thumbnail.png

const xmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const ORA_NS = 'urn:portable-web-app-suite:openraster'; // (text layers: suite:text = the text as JSON)

/** The text of a text layer read from a file, or null when it is not a valid one. */
function textFromJson(json) {
  try {
    const t = JSON.parse(json);
    if (!t || typeof t.text !== 'string' || !Number.isFinite(t.x) || !Number.isFinite(t.y) || !(t.fontSize > 0 && t.fontSize < 10000)) return null;
    return { text: t.text, x: t.x, y: t.y, fontSize: t.fontSize, font: typeof t.font === 'string' ? t.font : 'sans-serif', bold: !!t.bold, italic: !!t.italic,
      color: /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : '#000000', align: ['left', 'center', 'right'].includes(t.align) ? t.align : 'left' };
  } catch (e) { return null; }
}

async function writeOra(doc) {
  const png = async (c) => new Uint8Array(await (await toBlob(c, 'image/png')).arrayBuffer());
  const files = { mimetype: [strToU8('image/openraster'), { level: 0 }] };
  const entries = [];
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const l = doc.layers[i];
    const src = `data/layer${i}.png`;
    files[src] = [await png(l.canvas), { level: 0 }];
    let text = l.text ? ` suite:text="${xmlEscape(JSON.stringify(l.text))}"` : ''; // (other programs show the pixels)
    if (l.mask) {
      // other programs show the masked result; the suite keeps the pixels and the mask apart
      files[`data/pixels${i}.png`] = [await png(l.canvas), { level: 0 }];
      files[`data/mask${i}.png`] = [await png(l.mask), { level: 0 }];
      if (!l.maskDisabled) files[src] = [await png(maskedPixels(l.canvas, l.mask, 'none', false)), { level: 0 }];
      text += ` suite:pixels="data/pixels${i}.png" suite:mask="data/mask${i}.png"${l.maskDisabled ? ' suite:mask-disabled="true"' : ''}`;
    }
    entries.push(`    <layer name="${xmlEscape(l.name)}" src="${src}" x="0" y="0" opacity="${l.opacity}" visibility="${l.visible ? 'visible' : 'hidden'}" composite-op="${l.blend === 'normal' ? 'svg:src-over' : `svg:${l.blend}`}"${text}/>`);
  }
  const flat = doc.composite();
  files['mergedimage.png'] = [await png(flat), { level: 0 }];
  const scale = Math.min(1, 256 / Math.max(doc.width, doc.height));
  const thumb = canvas(doc.width * scale, doc.height * scale);
  thumb.getContext('2d').drawImage(flat, 0, 0, thumb.width, thumb.height);
  files['Thumbnails/thumbnail.png'] = [await png(thumb), { level: 0 }];
  files['stack.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>\n<image version="0.0.5" w="${doc.width}" h="${doc.height}" xmlns:suite="${ORA_NS}">\n  <stack>\n${entries.join('\n')}\n  </stack>\n</image>\n`);
  return zipSync(files);
}

async function readOra(bytes) {
  const files = unzipSync(bytes);
  if (!files['stack.xml']) throw new Error('stack.xml missing');
  const xml = new DOMParser().parseFromString(strFromU8(files['stack.xml']), 'application/xml');
  const image = xml.documentElement;
  const w = parseInt(image.getAttribute('w'), 10);
  const h = parseInt(image.getAttribute('h'), 10);
  // (a damaged stack.xml: Firefox replaces the whole document by <parsererror>, Chromium keeps a part)
  if (xml.getElementsByTagName('parsererror').length || image.localName !== 'image' || !(w > 0 && h > 0)) throw new Error('stack.xml is damaged');
  const doc = new ImageDoc(w, h);
  const layers = [];
  // nested stacks are flattened; document order is top to bottom
  for (const el of [...xml.getElementsByTagName('layer')].reverse()) {
    const data = files[el.getAttribute('src')];
    if (!data) continue;
    const img = await decodeImage(new Blob([data], { type: 'image/png' }));
    const c = canvas(doc.width, doc.height);
    c.getContext('2d').drawImage(img, parseInt(el.getAttribute('x') || '0', 10), parseInt(el.getAttribute('y') || '0', 10));
    const op = (el.getAttribute('composite-op') || 'svg:src-over').replace(/^svg:/, '');
    layers.push({
      id: nextLayerId++, name: el.getAttribute('name') || `Layer ${layers.length + 1}`, canvas: c,
      visible: el.getAttribute('visibility') !== 'hidden', opacity: el.hasAttribute('opacity') ? parseFloat(el.getAttribute('opacity')) : 1,
      blend: BLEND_MODES.includes(op) ? op : 'normal',
      text: el.hasAttributeNS(ORA_NS, 'text') ? textFromJson(el.getAttributeNS(ORA_NS, 'text')) : null, // (the stored pixels are kept until it is edited)
    });
    const pixels = files[el.getAttributeNS(ORA_NS, 'pixels') || ''], maskData = files[el.getAttributeNS(ORA_NS, 'mask') || ''];
    if (pixels && maskData) {
      const layer = layers[layers.length - 1];
      const at = (img) => { const x = canvas(doc.width, doc.height); x.getContext('2d').drawImage(img, 0, 0); return x; };
      layer.canvas = at(await decodeImage(new Blob([pixels], { type: 'image/png' })));
      layer.mask = at(await decodeImage(new Blob([maskData], { type: 'image/png' })));
      layer.maskDisabled = el.getAttributeNS(ORA_NS, 'mask-disabled') === 'true';
    }
  }
  if (layers.length) { doc.layers = layers; doc.active = layers.length - 1; }
  return doc;
}

// Photoshop PSD (ag-psd, loaded on first use): pixel layers with position, opacity, visibility, blend mode and layer masks;
// groups are flattened into their layers (hidden groups hide them, group opacity multiplies), layer masks stay editable, text and adjustment layers
// keep the pixels Photoshop stored for them.

const PSD_BLEND = { 'linear dodge': 'lighter' }; // ag-psd names -> canvas composite operations
const psdToBlend = (m) => { const b = PSD_BLEND[m] || String(m || 'normal').replace(/ /g, '-'); return BLEND_MODES.includes(b) || b === 'lighter' ? b : 'normal'; };
const blendToPsd = (b) => (b === 'lighter' ? 'linear dodge' : b.replace(/-/g, ' '));


async function readPsd(bytes) {
  const { readPsd: read } = await import('ag-psd');
  const psd = read(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { skipThumbnail: true });
  const doc = new ImageDoc(psd.width, psd.height);
  const layers = [];
  const walk = (children, hidden, opacity) => {
    for (const l of children || []) {
      if (l.children) { walk(l.children, hidden || !!l.hidden, opacity * (l.opacity ?? 1)); continue; }
      if (!l.canvas) continue;
      const c = canvas(doc.width, doc.height);
      c.getContext('2d').drawImage(l.canvas, l.left || 0, l.top || 0);
      // the layer mask stays editable: a grey canvas of the image size (outside its rectangle: its default colour)
      let mask = null;
      if (l.mask && l.mask.canvas) {
        mask = canvas(doc.width, doc.height);
        const mctx = mask.getContext('2d');
        const def = l.mask.defaultColor ?? 255;
        mctx.fillStyle = `rgb(${def},${def},${def})`;
        mctx.fillRect(0, 0, doc.width, doc.height);
        mctx.drawImage(l.mask.canvas, l.mask.left || 0, l.mask.top || 0);
      }
      layers.push({ id: nextLayerId++, name: l.name || `Layer ${layers.length + 1}`, canvas: c, visible: !(hidden || l.hidden), opacity: opacity * (l.opacity ?? 1), blend: psdToBlend(l.blendMode),
        mask, maskDisabled: !!(mask && l.mask.disabled) });
    }
  };
  walk(psd.children, false, 1);
  if (!layers.length && psd.canvas) { // a flat PSD: only the composite image
    const c = canvas(doc.width, doc.height);
    c.getContext('2d').drawImage(psd.canvas, 0, 0);
    layers.push({ id: nextLayerId++, name: 'Background', canvas: c, visible: true, opacity: 1, blend: 'normal' });
  }
  if (layers.length) { doc.layers = layers; doc.active = layers.length - 1; } // ag-psd lists layers from the bottom up, like the document
  return doc;
}

async function writePsd(doc) {
  const { writePsd: write } = await import('ag-psd');
  const psd = {
    width: doc.width, height: doc.height,
    children: doc.layers.map((l) => ({ name: l.name, canvas: l.canvas, left: 0, top: 0, opacity: l.opacity, hidden: !l.visible, blendMode: blendToPsd(l.blend),
      ...(l.mask ? { mask: { top: 0, left: 0, bottom: doc.height, right: doc.width, defaultColor: 255, disabled: !!l.maskDisabled, canvas: opaqueMask(l.mask) } } : {}) })),
    canvas: doc.composite(), // the merged image other programs show as preview
  };
  return new Uint8Array(write(psd, { generateThumbnail: true }));
}
