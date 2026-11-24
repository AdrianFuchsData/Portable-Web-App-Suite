/*
 * Batch creation: many codes at once from lines of text or the rows of a CSV file, with the format and look of the generator,
 * as a ZIP of PNG or SVG pictures or as a PDF sheet of labels (columns × rows per page). Contents that cannot be encoded in the
 * chosen format are listed (and written to errors.txt in a ZIP).
 *
 *   items(source) -> [{ line, content, caption, name }]   source: { text } or { rows, header, contentCol, captionCol, nameCol }
 *   run(items, { encode, draw, output, page, cols, rows, onProgress }) -> { bytes, name, type, done, errors: [{ line, content, message }] }
 */
import { zipSync, strToU8 } from 'fflate';

export const PAGES = { A4: [595.28, 841.89], Letter: [612, 792] };
const MM = 72 / 25.4;

/** The items of a batch: lines of the text, or rows of a CSV file (columns chosen by index; -1 = none). */
export function items(source) {
  if (source.rows) {
    const body = source.header ? source.rows.slice(1) : source.rows;
    const first = source.header ? 2 : 1;
    const cell = (row, i) => (i >= 0 && row[i] != null ? String(row[i]) : '');
    return body.map((row, i) => ({ line: first + i, content: cell(row, source.contentCol), caption: source.captionCol >= 0 ? cell(row, source.captionCol) : null, name: cell(row, source.nameCol) }))
      .filter((it) => it.content.trim());
  }
  return String(source.text || '').replace(/\r/g, '').split('\n').map((content, i) => ({ line: i + 1, content, caption: null, name: '' })).filter((it) => it.content.trim());
}

/** A file name from a text (letters, digits, - _ . only). */
export const fileStem = (s) => String(s).replace(/^[a-z]+:\/*/i, '').replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 60);

const tick = () => new Promise((r) => setTimeout(r));

/**
 * Create the codes. encode(content) -> symbol or throws; draw(symbol, item) -> { svg, canvas() }.
 * output: 'zip-png' | 'zip-svg' | 'pdf'.
 */
export async function run(list, { encode, draw, output = 'pdf', page = 'A4', cols = 3, rows = 8, margin = 10, onProgress = () => {}, cancelled = () => false }) {
  const errors = [];
  const files = {};
  const used = new Set();
  const width = String(list.length).length;
  let pdf = null, lib = null, slot = 0, current = null;
  if (output === 'pdf') {
    lib = await import('pdf-lib');
    pdf = await lib.PDFDocument.create();
  }
  const [pw, ph] = PAGES[page] || PAGES.A4;
  const m = margin * MM;
  const cw = (pw - 2 * m) / cols, ch = (ph - 2 * m) / rows;
  let done = 0;
  for (let i = 0; i < list.length; i++) {
    if (cancelled()) break;
    const it = list[i];
    if (i % 10 === 0) { onProgress(i, list.length); await tick(); }
    let symbol;
    try { symbol = await encode(it.content); } catch (e) { errors.push({ line: it.line, content: it.content, message: String((e && e.message) || e) }); continue; }
    const drawn = draw(symbol, it);
    if (output === 'pdf') {
      if (!current || slot >= cols * rows) { current = pdf.addPage([pw, ph]); slot = 0; }
      const canvas = drawn.canvas();
      const png = await new Promise((res) => canvas.toBlob((b) => b.arrayBuffer().then((a) => res(new Uint8Array(a))), 'image/png'));
      const image = await pdf.embedPng(png);
      const pad = 2 * MM;
      const k = Math.min((cw - 2 * pad) / canvas.width, (ch - 2 * pad) / canvas.height);
      const w = canvas.width * k, h = canvas.height * k;
      const c = slot % cols, r = Math.floor(slot / cols);
      current.drawImage(image, { x: m + c * cw + (cw - w) / 2, y: ph - m - (r + 1) * ch + (ch - h) / 2, width: w, height: h });
      slot++;
    } else {
      const ext = output === 'zip-svg' ? 'svg' : 'png';
      const base = fileStem(it.name) || `${String(i + 1).padStart(Math.max(3, width), '0')}-${fileStem(it.content) || 'code'}`;
      let name = `${base}.${ext}`;
      for (let k = 2; used.has(name.toLowerCase()); k++) name = `${base}-${k}.${ext}`;
      used.add(name.toLowerCase());
      if (ext === 'svg') files[name] = [strToU8(drawn.svg), { level: 6 }];
      else {
        const canvas = drawn.canvas();
        files[name] = [await new Promise((res) => canvas.toBlob((b) => b.arrayBuffer().then((a) => res(new Uint8Array(a))), 'image/png')), { level: 0 }];
      }
    }
    done++;
  }
  onProgress(list.length, list.length);
  const report = errors.map((e) => `${e.line}: ${e.content} – ${e.message}`).join('\n');
  if (output === 'pdf') {
    if (!pdf.getPageCount()) pdf.addPage([pw, ph]);
    pdf.setTitle('Barcodes');
    pdf.setCreator('Portable Web App Suite');
    return { bytes: await pdf.save(), type: 'application/pdf', ext: 'pdf', done, errors, report };
  }
  if (errors.length) files['errors.txt'] = [strToU8(`${report}\n`)];
  return { bytes: zipSync(files), type: 'application/zip', ext: 'zip', done, errors, report };
}
