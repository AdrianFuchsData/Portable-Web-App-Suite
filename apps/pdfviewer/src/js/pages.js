/*
 * Page operations with pdf-lib (vendor/esm/pdflib, loaded on demand): every function takes the bytes of a PDF and returns
 * the bytes of the changed PDF. Pages are 0-based indices. The document is changed in place (catalog, forms and
 * metadata stay); encrypted PDFs cannot be changed (pdf-lib cannot write them).
 */
let lib = null;
const pdflib = () => (lib = lib || import('pdf-lib'));

export class EncryptedError extends Error {}

async function load(bytes) {
  const { PDFDocument } = await pdflib();
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (e) {
    if (/encrypt/i.test(e.message || '')) throw new EncryptedError(e.message);
    throw e;
  }
}

const save = (doc) => doc.save();

/** Rotate pages by delta degrees (multiples of 90). */
export async function rotate(bytes, indices, delta) {
  const { degrees } = await pdflib();
  const doc = await load(bytes);
  for (const i of indices) {
    const page = doc.getPage(i);
    page.setRotation(degrees((((page.getRotation().angle + delta) % 360) + 360) % 360));
  }
  return save(doc);
}

/** Remove pages (at least one page stays). */
export async function remove(bytes, indices) {
  const doc = await load(bytes);
  const sorted = [...new Set(indices)].sort((a, b) => b - a);
  if (sorted.length >= doc.getPageCount()) throw new Error('A PDF needs at least one page.');
  for (const i of sorted) doc.removePage(i);
  return save(doc);
}

/** Put the pages into a new order: order[i] is the old index of the page at position i. */
export async function reorder(bytes, order) {
  const doc = await load(bytes);
  const pages = doc.getPages();
  for (let i = pages.length - 1; i >= 0; i--) doc.removePage(i);
  order.forEach((old, i) => doc.insertPage(i, pages[old]));
  return save(doc);
}

/** A new PDF with copies of some pages. */
export async function extract(bytes, indices) {
  const { PDFDocument } = await pdflib();
  const doc = await load(bytes);
  const out = await PDFDocument.create();
  for (const page of await out.copyPages(doc, indices)) out.addPage(page);
  return save(out);
}

/** Insert all pages of other PDFs (list of bytes) at an index (pageCount = append). */
export async function insert(bytes, at, others) {
  const doc = await load(bytes);
  let pos = at;
  for (const other of others) {
    const src = await load(other);
    for (const page of await doc.copyPages(src, src.getPageIndices())) doc.insertPage(pos++, page);
  }
  return save(doc);
}

/**
 * New order after moving the selected pages (indices) one step earlier (-1) or later (+1) as a block, or to a position
 * (0-based index of the first moved page in the result).
 */
export function moved(count, indices, { step = 0, to = null } = {}) {
  const sel = [...new Set(indices)].sort((a, b) => a - b);
  const rest = [...Array(count).keys()].filter((i) => !sel.includes(i));
  let target;
  if (to != null) target = to;
  else {
    const first = sel[0];
    // position of the block among the remaining pages
    const before = rest.filter((i) => i < first).length;
    target = before + step;
  }
  target = Math.max(0, Math.min(rest.length, target));
  return [...rest.slice(0, target), ...sel, ...rest.slice(target)];
}

/** Draw a PNG image (e.g. a signature) on a page; x, y is the top left corner in PDF points of the unrotated page. */
export async function stamp(bytes, index, png, { x, y, width, height }) {
  const doc = await load(bytes);
  const image = await doc.embedPng(png);
  doc.getPage(index).drawImage(image, { x, y: y - height, width, height });
  return save(doc);
}
