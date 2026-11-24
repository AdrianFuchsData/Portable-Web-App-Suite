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

/**
 * Redaction: a NEW document is built from the pages – copied as they are, except the pages in `images` (index -> { jpeg,
 * width, height } in points), which become a picture of the page with the blacked-out areas. Only what the new pages
 * reference is written, so no text or hidden object of a redacted page survives (outline, form fields and metadata are not
 * taken over either).
 */
export async function redact(bytes, images) {
  const { PDFDocument } = await pdflib();
  const src = await load(bytes);
  const out = await PDFDocument.create();
  const count = src.getPageCount();
  const keep = [...Array(count).keys()].filter((i) => !images.has(i));
  const copied = keep.length ? await out.copyPages(src, keep) : [];
  let k = 0;
  for (let i = 0; i < count; i++) {
    const img = images.get(i);
    if (!img) { out.addPage(copied[k++]); continue; }
    const page = out.addPage([img.width, img.height]);
    const embedded = await out.embedJpg(img.jpeg);
    page.drawImage(embedded, { x: 0, y: 0, width: img.width, height: img.height });
  }
  return out.save();
}

// ---- compress: smaller pictures, compressed streams, no unused objects ------------------------------------------------------

/** Undo the PNG predictors (DecodeParms /Predictor ≥ 10) of decoded Flate data: rows of 1 filter byte + width × comps bytes. */
function unpredict(data, width, comps) {
  const row = width * comps, out = new Uint8Array(row * Math.floor(data.length / (row + 1)));
  for (let y = 0, o = 0, i = 0; o < out.length; y++, o += row) {
    const type = data[i++];
    for (let x = 0; x < row; x++, i++) {
      const a = x >= comps ? out[o + x - comps] : 0, b = y ? out[o + x - row] : 0, c = y && x >= comps ? out[o + x - row - comps] : 0;
      let p = 0;
      if (type === 1) p = a; else if (type === 2) p = b; else if (type === 3) p = (a + b) >> 1;
      else if (type === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[o + x] = (data[i] + p) & 255;
    }
  }
  return out;
}

const jpegOf = (canvas, quality) => new Promise((res) => canvas.toBlob((b) => b.arrayBuffer().then((a) => res(new Uint8Array(a))), 'image/jpeg', quality));

/**
 * Make the PDF smaller: pictures larger than `dpi` on an A4 page (longest side > dpi × 11.7 pixels) are scaled down and pictures
 * are stored as JPEG at `quality` – each only when the result is smaller; uncompressed streams get Flate; objects nothing refers
 * to any more (old versions of edited objects) are dropped; the file is written with object streams. Masks, CMYK, indexed and
 * 1-bit pictures stay as they are. Returns { bytes, images } (images: the number of pictures changed).
 */
export async function compress(bytes, { dpi = 150, quality = 0.75 } = {}) {
  const { PDFName, PDFRawStream, PDFNumber, PDFDict, PDFArray, PDFRef, PDFBool } = await pdflib();
  const { unzlibSync, zlibSync } = await import('fflate');
  const doc = await load(bytes);
  const ctx = doc.context;
  const N = (s) => PDFName.of(s);
  const look = (v) => (v instanceof PDFRef ? ctx.lookup(v) : v);

  // what is reachable from the trailer: everything else is dropped
  const reach = new Set();
  const walk = (v) => {
    const stack = [v];
    while (stack.length) {
      let o = stack.pop();
      if (o instanceof PDFRef) { if (reach.has(o)) continue; reach.add(o); o = ctx.lookup(o); }
      if (!o) continue;
      if (o instanceof PDFDict) for (const [, x] of o.entries()) stack.push(x);
      else if (o instanceof PDFArray) for (const x of o.asArray()) stack.push(x);
      else if (o.dict instanceof PDFDict) stack.push(o.dict);
    }
  };
  for (const k of ['Root', 'Info', 'Encrypt']) if (ctx.trailerInfo[k]) walk(ctx.trailerInfo[k]);
  for (const [ref] of ctx.enumerateIndirectObjects()) if (!reach.has(ref)) ctx.delete(ref);

  // masks of other pictures stay as they are (they must stay gray / 1-bit)
  const masks = new Set();
  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    for (const k of ['SMask', 'Mask']) { const m = obj.dict.get(N(k)); if (m instanceof PDFRef) masks.add(m); }
  }

  const maxSide = Math.round(dpi * 11.7);
  let images = 0;
  for (const [ref, obj] of [...ctx.enumerateIndirectObjects()]) {
    if (!(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    const filter = look(dict.get(N('Filter')));
    const filters = filter instanceof PDFArray ? filter.asArray().map(look) : filter ? [filter] : [];
    if (look(dict.get(N('Subtype'))) !== N('Image')) {
      const type = look(dict.get(N('Type')));
      if (!filters.length && obj.contents.length > 64 && type !== N('XRef') && type !== N('ObjStm')) {
        const packed = zlibSync(obj.contents, { level: 9 });
        if (packed.length < obj.contents.length) {
          const d = dict.clone(ctx);
          d.set(N('Filter'), N('FlateDecode'));
          ctx.assign(ref, PDFRawStream.of(d, packed));
        }
      }
      continue;
    }
    if (masks.has(ref) || look(dict.get(N('ImageMask'))) === PDFBool.True || dict.get(N('Decode')) || look(dict.get(N('Mask'))) instanceof PDFArray) continue;
    const w = look(dict.get(N('Width')))?.asNumber?.(), h = look(dict.get(N('Height')))?.asNumber?.();
    if (!w || !h || look(dict.get(N('BitsPerComponent')))?.asNumber?.() !== 8) continue;
    let cs = look(dict.get(N('ColorSpace'))), comps = 0;
    if (cs === N('DeviceRGB')) comps = 3; else if (cs === N('DeviceGray')) comps = 1;
    else if (cs instanceof PDFArray && look(cs.get(0)) === N('ICCBased')) comps = look(look(cs.get(1))?.dict?.get(N('N')))?.asNumber?.() || 0;
    if (comps !== 1 && comps !== 3) continue;
    const k = Math.min(1, maxSide / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * k)), th = Math.max(1, Math.round(h * k));
    try {
      let source;
      if (filters.length === 1 && filters[0] === N('DCTDecode')) {
        source = await createImageBitmap(new Blob([obj.contents], { type: 'image/jpeg' }));
      } else if (filters.length <= 1 && (!filters.length || filters[0] === N('FlateDecode'))) {
        let raw = filters.length ? unzlibSync(obj.contents) : obj.contents;
        const parms = look(dict.get(N('DecodeParms')));
        const predictor = parms instanceof PDFDict ? look(parms.get(N('Predictor')))?.asNumber?.() || 1 : 1;
        if (predictor >= 10) raw = unpredict(raw, w, comps); else if (predictor !== 1) continue;
        if (raw.length < w * h * comps) continue;
        const px = new ImageData(w, h);
        for (let i = 0, j = 0; i < w * h; i++, j += comps) {
          px.data[i * 4] = raw[j]; px.data[i * 4 + 1] = raw[j + (comps === 3 ? 1 : 0)]; px.data[i * 4 + 2] = raw[j + (comps === 3 ? 2 : 0)]; px.data[i * 4 + 3] = 255;
        }
        source = await createImageBitmap(px);
      } else continue;
      const canvas = document.createElement('canvas');
      canvas.width = tw; canvas.height = th;
      const g = canvas.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(source, 0, 0, tw, th);
      source.close?.();
      const jpeg = await jpegOf(canvas, quality);
      canvas.width = canvas.height = 0;
      if (jpeg.length >= obj.contents.length) continue;
      const d = dict.clone(ctx);
      d.set(N('Width'), PDFNumber.of(tw)); d.set(N('Height'), PDFNumber.of(th));
      d.set(N('Filter'), N('DCTDecode')); d.set(N('ColorSpace'), N('DeviceRGB')); d.set(N('BitsPerComponent'), PDFNumber.of(8));
      d.delete(N('DecodeParms'));
      ctx.assign(ref, PDFRawStream.of(d, jpeg));
      images++;
    } catch (e) { console.warn('compress: picture skipped', e); }
  }
  return { bytes: await doc.save({ useObjectStreams: true }), images };
}
