/**
 * Batch processing: the same steps for many images, the results in one ZIP. Every file is opened as a document, changed by
 * the chosen steps (in this order: resize, rotate, flip, auto levels, grayscale, sharpen, watermark), encoded and added to
 * the archive; files that cannot be read are listed instead.
 */
import { zipSync } from 'fflate';
import { openFile, encode, SAVE_FORMATS } from '@app/doc.js';
import { autoLevels, applyCssFilter, convolve, KERNELS } from '@app/filters.js';

export const DEFAULT_STEPS = {
  resize: { on: false, width: 1920, height: 1920, enlarge: false },
  rotate: { on: false, degrees: 90 },
  flip: { on: false, horizontal: true },
  autoLevels: { on: false },
  grayscale: { on: false },
  sharpen: { on: false },
  watermark: { on: false, text: '© ', size: 4, opacity: 60, position: 'br', color: '#ffffff' },
  output: { format: 'jpeg', quality: 85, pattern: '{name}' },
};

/** The new size for "fit into width × height" (keeping the proportions; smaller images grow only with `enlarge`). */
export function fitSize(w, h, maxW, maxH, enlarge = false) {
  const k = Math.min(maxW / w, maxH / h);
  if (k >= 1 && !enlarge) return [w, h];
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
}

function watermark(doc, wm) {
  const layer = doc.layers[doc.layers.length - 1];
  const ctx = layer.canvas.getContext('2d');
  const size = Math.max(8, Math.round((Math.min(doc.width, doc.height) * wm.size) / 100));
  const pad = Math.round(size * 0.6);
  ctx.save();
  ctx.font = `bold ${size}px sans-serif`;
  ctx.globalAlpha = wm.opacity / 100;
  ctx.fillStyle = wm.color;
  ctx.strokeStyle = 'rgba(0,0,0,.5)';
  ctx.lineWidth = Math.max(1, size / 16);
  const w = ctx.measureText(wm.text).width;
  const [h, v] = [wm.position[1], wm.position[0]];
  const x = h === 'l' ? pad : h === 'c' ? (doc.width - w) / 2 : doc.width - pad - w;
  ctx.textBaseline = v === 't' ? 'top' : v === 'm' ? 'middle' : 'bottom';
  const y = v === 't' ? pad : v === 'm' ? doc.height / 2 : doc.height - pad;
  ctx.strokeText(wm.text, x, y);
  ctx.fillText(wm.text, x, y);
  ctx.restore();
}

/** The output name: {name} (without extension), {n} (running number, 3 digits), {w}, {h}; plus the format's extension. */
export function outputName(pattern, name, n, w, h, ext) {
  const stem = name.replace(/\.[^.]+$/, '');
  const base = (pattern || '{name}').replace(/\{name\}/g, stem).replace(/\{n\}/g, String(n).padStart(3, '0')).replace(/\{w\}/g, w).replace(/\{h\}/g, h)
    .replace(/[\\/:*?"<>|]/g, '_').trim() || stem;
  return `${base}${ext}`;
}

/** One image through the steps: the encoded bytes and its new size. */
export async function processOne(bytes, name, steps) {
  const doc = await openFile(bytes, name);
  doc.record = doc.recordOnly = () => {}; // (no undo history: one image after the other, without copies)
  doc.flatten();
  if (steps.resize.on) {
    const [w, h] = fitSize(doc.width, doc.height, steps.resize.width, steps.resize.height, steps.resize.enlarge);
    if (w !== doc.width || h !== doc.height) doc.resize(w, h, true);
  }
  if (steps.rotate.on) doc.rotate(steps.rotate.degrees);
  if (steps.flip.on) doc.flip(steps.flip.horizontal);
  if (steps.autoLevels.on) autoLevels(doc);
  if (steps.grayscale.on) applyCssFilter(doc, 'grayscale(100%)');
  if (steps.sharpen.on) convolve(doc, KERNELS.sharpen);
  if (steps.watermark.on && steps.watermark.text) watermark(doc, steps.watermark);
  const out = await encode(doc, steps.output.format, { quality: steps.output.quality / 100 });
  return { bytes: out, width: doc.width, height: doc.height };
}

/**
 * All files ([{ name, bytes }]) through the steps: { zip (Uint8Array), done, errors: [{ name, message }] }. onProgress(i, n).
 * (Documents are made one after the other, so only one image is in memory at a time.)
 */
export async function runBatch(files, steps, { onProgress = () => {}, cancelled = () => false } = {}) {
  const entries = {};
  const errors = [];
  const ext = SAVE_FORMATS[steps.output.format].ext;
  let done = 0;
  for (let i = 0; i < files.length; i++) {
    if (cancelled()) break;
    onProgress(i, files.length);
    const f = files[i];
    try {
      const r = await processOne(f.bytes, f.name, steps);
      const first = outputName(steps.output.pattern, f.name, i + 1, r.width, r.height, ext);
      let name = first;
      for (let k = 2; entries[name]; k++) name = first.slice(0, -ext.length) + `-${k}${ext}`; // (two inputs with the same name)
      entries[name] = [r.bytes, { level: 0 }]; // (the images are compressed already)
      done++;
    } catch (e) {
      errors.push({ name: f.name, message: String((e && e.message) || e) });
    }
    await new Promise((r) => setTimeout(r)); // (the page stays responsive)
  }
  onProgress(files.length, files.length);
  if (errors.length) entries['errors.txt'] = [new TextEncoder().encode(errors.map((e) => `${e.name}: ${e.message}`).join('\n') + '\n')];
  return { zip: zipSync(entries), done, errors };
}
