/*
 * Image document of the image editor: full-size layer canvases, selection, undo history (memory-bounded snapshots),
 * compositing and file formats (raster images via the browser, BMP writer, OpenRaster with fflate, Photoshop PSD with ag-psd).
 */
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

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

  get layer() { return this.layers[this.active]; }

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
    const src = this.layer;
    const layer = { ...src, id: nextLayerId++, name: `${src.name} copy`, canvas: copyCanvas(src.canvas) };
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
    if (top.visible) {
      const ctx = below.canvas.getContext('2d');
      ctx.save();
      ctx.globalAlpha = top.opacity;
      ctx.globalCompositeOperation = compositeOp(top.blend);
      ctx.drawImage(top.canvas, 0, 0);
      ctx.restore();
    }
    this.layers.splice(this.active, 1);
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
      if (filterLayer === layer && filter !== 'none') ctx.filter = filter;
      ctx.drawImage(override && override.layer === layer ? override.canvas : layer.canvas, 0, 0);
      ctx.restore();
    }
  }

  composite() {
    const out = canvas(this.width, this.height);
    this.drawLayers(out.getContext('2d'));
    return out;
  }

  // ---- selection ----------------------------------------------------------------------------------

  /** Clip ctx to the selection (no-op without selection). */
  clip(ctx) {
    const s = this.selection;
    if (!s) return;
    ctx.beginPath();
    selectionPath(ctx, s);
    ctx.clip();
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
      const layer = this.layers.find((l) => l.id === layerId);
      return layer ? { scope, layerId, canvas: copyCanvas(layer.canvas), selection: this.selection && { ...this.selection } } : null;
    }
    if (scope === 'props') return { scope, layers: this.layers.map((l) => ({ id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend })), active: this.active };
    return {
      scope: 'doc', width: this.width, height: this.height, active: this.active, selection: this.selection && { ...this.selection },
      layers: this.layers.map((l) => ({ ...l, canvas: copyCanvas(l.canvas) })),
    };
  }

  restore(snap) {
    if (snap.scope === 'layer') {
      const layer = this.layers.find((l) => l.id === snap.layerId);
      if (layer) layer.canvas = snap.canvas;
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
    }
  }

  static bytes(snap) {
    if (snap.scope === 'layer') return snap.canvas.width * snap.canvas.height * 4;
    if (snap.scope === 'props') return 100;
    return snap.layers.reduce((n, l) => n + l.canvas.width * l.canvas.height * 4, 0);
  }

  /** Remember the current state before a change. scope: 'layer' (the active layer), 'props' or 'doc'. */
  record(scope = 'layer', { coalesce = null } = {}) {
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

  /** Replace every layer by fn(layerCanvas) -> new canvas; the document gets the new size. */
  transformAll(width, height, fn) {
    this.record('doc');
    for (const layer of this.layers) layer.canvas = fn(layer.canvas);
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
    this.transformAll(width, height, (src) => { const c = canvas(width, height); c.getContext('2d').drawImage(src, dx, dy); return c; });
  }

  crop({ x, y, w, h }) {
    if (w < 1 || h < 1) return;
    this.transformAll(w, h, (src) => { const c = canvas(w, h); c.getContext('2d').drawImage(src, -x, -y); return c; });
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

/**
 * Path of a selection: rect and ellipse by their box; 'poly' (lasso) by points relative to (x, y); 'mask' (magic wand,
 * combined selections) by runs of pixels [dx, dy, length, …] relative to (x, y). Moving a selection only changes x and y.
 */
export function selectionPath(ctx, s) {
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

/** Combine two selections: 'add', 'subtract' or 'intersect' (the result is a 'mask' selection, or null when empty). */
export function combineSelections(doc, a, b, op) {
  if (!a || op === 'new') return op === 'subtract' || op === 'intersect' ? null : b;
  if (!b) return op === 'add' || op === 'subtract' ? a : null;
  const ma = doc.selectionMask(a), mb = doc.selectionMask(b);
  const out = new Uint8Array(ma.length);
  for (let i = 0; i < out.length; i++) {
    const x = ma[i] >= 128, y = mb[i] >= 128;
    out[i] = op === 'add' ? x || y : op === 'subtract' ? x && !y : x && y;
  }
  return maskSelection(out, doc.width, doc.height);
}

// ---- file formats -----------------------------------------------------------------------------------

export const SAVE_FORMATS = {
  png: { label: 'PNG', mime: 'image/png', ext: '.png' },
  jpeg: { label: 'JPEG', mime: 'image/jpeg', ext: '.jpg', quality: true },
  webp: { label: 'WebP', mime: 'image/webp', ext: '.webp', quality: true },
  bmp: { label: 'BMP', mime: 'image/bmp', ext: '.bmp' },
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
  const c = await decodeImage(new Blob([bytes], { type }));
  const doc = new ImageDoc(c.width, c.height);
  doc.layers[0].name = 'Background';
  doc.layers[0].canvas = c;
  return doc;
}

const toBlob = (c, mime, quality) => new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error(`cannot encode ${mime}`))), mime, quality));

export async function encode(doc, format, { quality = 0.9, background = '#ffffff' } = {}) {
  if (format === 'ora') return writeOra(doc);
  if (format === 'psd') return writePsd(doc);
  let flat = doc.composite();
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

async function writeOra(doc) {
  const png = async (c) => new Uint8Array(await (await toBlob(c, 'image/png')).arrayBuffer());
  const files = { mimetype: [strToU8('image/openraster'), { level: 0 }] };
  const entries = [];
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const l = doc.layers[i];
    const src = `data/layer${i}.png`;
    files[src] = [await png(l.canvas), { level: 0 }];
    entries.push(`    <layer name="${xmlEscape(l.name)}" src="${src}" x="0" y="0" opacity="${l.opacity}" visibility="${l.visible ? 'visible' : 'hidden'}" composite-op="${l.blend === 'normal' ? 'svg:src-over' : `svg:${l.blend}`}"/>`);
  }
  const flat = doc.composite();
  files['mergedimage.png'] = [await png(flat), { level: 0 }];
  const scale = Math.min(1, 256 / Math.max(doc.width, doc.height));
  const thumb = canvas(doc.width * scale, doc.height * scale);
  thumb.getContext('2d').drawImage(flat, 0, 0, thumb.width, thumb.height);
  files['Thumbnails/thumbnail.png'] = [await png(thumb), { level: 0 }];
  files['stack.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>\n<image version="0.0.5" w="${doc.width}" h="${doc.height}">\n  <stack>\n${entries.join('\n')}\n  </stack>\n</image>\n`);
  return zipSync(files);
}

async function readOra(bytes) {
  const files = unzipSync(bytes);
  if (!files['stack.xml']) throw new Error('stack.xml missing');
  const xml = new DOMParser().parseFromString(strFromU8(files['stack.xml']), 'application/xml');
  const image = xml.documentElement;
  const doc = new ImageDoc(parseInt(image.getAttribute('w'), 10), parseInt(image.getAttribute('h'), 10));
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
    });
  }
  if (layers.length) { doc.layers = layers; doc.active = layers.length - 1; }
  return doc;
}

// Photoshop PSD (ag-psd, loaded on first use): pixel layers with position, opacity, visibility, blend mode and layer masks;
// groups are flattened into their layers (hidden groups hide them, group opacity multiplies), text and adjustment layers
// keep the pixels Photoshop stored for them.

const PSD_BLEND = { 'linear dodge': 'lighter' }; // ag-psd names -> canvas composite operations
const psdToBlend = (m) => { const b = PSD_BLEND[m] || String(m || 'normal').replace(/ /g, '-'); return BLEND_MODES.includes(b) || b === 'lighter' ? b : 'normal'; };
const blendToPsd = (b) => (b === 'lighter' ? 'linear dodge' : b.replace(/-/g, ' '));

/** A layer mask (grey levels; defaultColor outside its rectangle) applied to the layer's alpha. */
function applyMask(c, mask) {
  const w = c.width, h = c.height;
  const ctx = c.getContext('2d');
  const img = ctx.getImageData(0, 0, w, h);
  const outside = (mask.defaultColor ?? 255) / 255;
  const m = mask.canvas.getContext('2d').getImageData(0, 0, mask.canvas.width, mask.canvas.height).data;
  const mw = mask.canvas.width, mh = mask.canvas.height, ml = mask.left || 0, mt = mask.top || 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const mx = x - ml, my = y - mt;
      const f = mx >= 0 && my >= 0 && mx < mw && my < mh ? m[(my * mw + mx) * 4] / 255 : outside;
      if (f < 1) img.data[(y * w + x) * 4 + 3] *= f;
    }
  }
  ctx.putImageData(img, 0, 0);
}

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
      if (l.mask && l.mask.canvas && !l.mask.disabled) applyMask(c, l.mask);
      layers.push({ id: nextLayerId++, name: l.name || `Layer ${layers.length + 1}`, canvas: c, visible: !(hidden || l.hidden), opacity: opacity * (l.opacity ?? 1), blend: psdToBlend(l.blendMode) });
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
    children: doc.layers.map((l) => ({ name: l.name, canvas: l.canvas, left: 0, top: 0, opacity: l.opacity, hidden: !l.visible, blendMode: blendToPsd(l.blend) })),
    canvas: doc.composite(), // the merged image other programs show as preview
  };
  return new Uint8Array(write(psd, { generateThumbnail: true }));
}
