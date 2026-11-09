/**
 * Image metadata: reading EXIF (camera, date, location, …), XMP, IPTC, comments and text chunks of JPEG, PNG and WebP files,
 * and removing them without re-encoding the image (lossless): the colour profile stays, and the orientation is kept in a minimal
 * EXIF block so that the picture still stands upright.
 */

const TAGS = {
  0x010e: 'description', 0x010f: 'make', 0x0110: 'model', 0x0112: 'orientation', 0x0131: 'software', 0x0132: 'dateTime', 0x013b: 'artist',
  0x8298: 'copyright', 0x9003: 'dateTimeOriginal', 0x829a: 'exposureTime', 0x829d: 'fNumber', 0x8827: 'iso', 0x920a: 'focalLength',
  0xa434: 'lens', 0xa431: 'serialNumber', 0xa430: 'owner',
};
const GPS_TAGS = { 1: 'latRef', 2: 'lat', 3: 'lonRef', 4: 'lon', 5: 'altRef', 6: 'alt' };
const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

/** The tags of a TIFF structure (EXIF): { make, model, orientation, …, gps: { lat, lon, alt } } (only the known ones). */
export function parseExif(tiff) {
  const dv = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const le = tiff[0] === 0x49;
  if (!((tiff[0] === 0x49 && tiff[1] === 0x49) || (tiff[0] === 0x4d && tiff[1] === 0x4d))) return null;
  const u16 = (o) => dv.getUint16(o, le), u32 = (o) => dv.getUint32(o, le), s32 = (o) => dv.getInt32(o, le);
  const value = (type, count, at) => {
    const size = (TYPE_SIZE[type] || 1) * count;
    const off = size <= 4 ? at : u32(at);
    if (off + size > tiff.length) return undefined;
    if (type === 2) return new TextDecoder().decode(tiff.subarray(off, off + count)).replace(/\0[\s\S]*$/, '').trim();
    const one = (i) => {
      if (type === 3) return u16(off + i * 2);
      if (type === 4) return u32(off + i * 4);
      if (type === 9) return s32(off + i * 4);
      if (type === 5) { const d = u32(off + i * 8 + 4); return d ? u32(off + i * 8) / d : 0; }
      if (type === 10) { const d = s32(off + i * 8 + 4); return d ? s32(off + i * 8) / d : 0; }
      return tiff[off + i];
    };
    if (type === 7) return tiff.subarray(off, off + count);
    return count === 1 ? one(0) : Array.from({ length: Math.min(count, 16) }, (_, i) => one(i));
  };
  const ifd = (start, names, out, depth = 0) => {
    if (!start || start + 2 > tiff.length || depth > 3) return;
    const n = u16(start);
    for (let i = 0; i < n && start + 2 + i * 12 + 12 <= tiff.length; i++) {
      const at = start + 2 + i * 12;
      const tag = u16(at), type = u16(at + 2), count = u32(at + 4);
      if (count > 1e6) continue;
      if (names === TAGS && tag === 0x8769) { ifd(u32(at + 8), TAGS, out, depth + 1); continue; } // Exif IFD
      if (names === TAGS && tag === 0x8825) { out.gps = out.gps || {}; ifd(u32(at + 8), GPS_TAGS, out.gps, depth + 1); continue; }
      const name = names[tag];
      if (!name) continue;
      try { const v = value(type, count, at + 8); if (v !== undefined && v !== '') out[name] = v; } catch (e) { /* damaged entry */ }
    }
  };
  const out = {};
  try { ifd(u32(4), TAGS, out); } catch (e) { /* damaged */ }
  if (out.gps) {
    const deg = (v, ref, neg) => (Array.isArray(v) ? (v[0] + (v[1] || 0) / 60 + (v[2] || 0) / 3600) * (ref === neg ? -1 : 1) : undefined);
    const g = out.gps;
    out.gps = { lat: deg(g.lat, g.latRef, 'S'), lon: deg(g.lon, g.lonRef, 'W'), alt: typeof g.alt === 'number' ? (g.altRef === 1 ? -g.alt : g.alt) : undefined };
    if (out.gps.lat === undefined && out.gps.lon === undefined) delete out.gps;
  }
  return out;
}

const ascii = (u8, a, b) => String.fromCharCode(...u8.subarray(a, b));

/** JPEG segments before the image data: [{ marker, start, end, data }] and the offset where the rest (SOS…) starts. */
function jpegSegments(b) {
  const segs = [];
  let p = 2;
  while (p + 4 <= b.length) {
    if (b[p] !== 0xff) return null;
    const marker = b[p + 1];
    if (marker === 0xff) { p++; continue; } // (fill bytes)
    if (marker === 0xda || marker === 0xd9) return { segs, rest: p };
    const len = (b[p + 2] << 8) | b[p + 3];
    if (len < 2 || p + 2 + len > b.length) return null;
    segs.push({ marker, start: p, end: p + 2 + len, data: b.subarray(p + 4, p + 2 + len) });
    p += 2 + len;
  }
  return null;
}

/** PNG chunks: [{ type, start, end, data }]. */
function pngChunks(b) {
  const out = [];
  let p = 8;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  while (p + 12 <= b.length) {
    const len = dv.getUint32(p);
    if (p + 12 + len > b.length) return null;
    out.push({ type: ascii(b, p + 4, p + 8), start: p, end: p + 12 + len, data: b.subarray(p + 8, p + 8 + len) });
    p += 12 + len;
  }
  return out;
}

/** WebP (RIFF) chunks: [{ type, start, end, data }]. */
function webpChunks(b) {
  const out = [];
  let p = 12;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  while (p + 8 <= b.length) {
    const len = dv.getUint32(p + 4, true);
    const end = p + 8 + len + (len & 1);
    if (p + 8 + len > b.length) return null;
    out.push({ type: ascii(b, p, p + 4), start: p, end: Math.min(end, b.length), data: b.subarray(p + 8, p + 8 + len) });
    p = end;
  }
  return out;
}

export function formatOfBytes(b) {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8) return 'jpeg';
  if (b.length > 8 && b[0] === 0x89 && ascii(b, 1, 4) === 'PNG') return 'png';
  if (b.length > 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'webp';
  return null;
}

/**
 * The metadata of a JPEG, PNG or WebP file: { format, exif (tags, see parseExif) | null, xmp, iptc, comments: [text],
 * texts: [{ key, value }], icc, kinds: [what there is, for the message] } – or null for other formats.
 */
export function readMetadata(b) {
  const format = formatOfBytes(b);
  if (!format) return null;
  const m = { format, exif: null, xmp: false, iptc: false, comments: [], texts: [], icc: false, kinds: [] };
  const exifFrom = (tiff) => { const e = parseExif(tiff); if (e) m.exif = { ...(m.exif || {}), ...e }; };
  if (format === 'jpeg') {
    const j = jpegSegments(b);
    for (const s of (j ? j.segs : [])) {
      if (s.marker === 0xe1 && ascii(s.data, 0, 6) === 'Exif\0\0') exifFrom(s.data.subarray(6));
      else if (s.marker === 0xe1 && ascii(s.data, 0, 28) === 'http://ns.adobe.com/xap/1.0/') m.xmp = true;
      else if (s.marker === 0xed) m.iptc = true;
      else if (s.marker === 0xfe) m.comments.push(new TextDecoder().decode(s.data));
      else if (s.marker === 0xe2 && ascii(s.data, 0, 11) === 'ICC_PROFILE') m.icc = true;
    }
  } else if (format === 'png') {
    for (const c of pngChunks(b) || []) {
      if (c.type === 'eXIf') exifFrom(c.data);
      else if (c.type === 'iTXt' && ascii(c.data, 0, 17) === 'XML:com.adobe.xmp') m.xmp = true;
      else if (c.type === 'tEXt' || c.type === 'iTXt' || c.type === 'zTXt') {
        const zero = c.data.indexOf(0);
        const key = ascii(c.data, 0, Math.max(0, zero));
        m.texts.push({ key, value: c.type === 'tEXt' ? new TextDecoder('latin1').decode(c.data.subarray(zero + 1)).slice(0, 500) : '…' });
      } else if (c.type === 'iCCP') m.icc = true;
    }
  } else {
    for (const c of webpChunks(b) || []) {
      if (c.type === 'EXIF') exifFrom(ascii(c.data, 0, 6) === 'Exif\0\0' ? c.data.subarray(6) : c.data);
      else if (c.type === 'XMP ') m.xmp = true;
      else if (c.type === 'ICCP') m.icc = true;
    }
  }
  const e = m.exif || {};
  if (Object.keys(e).some((k) => k !== 'orientation')) m.kinds.push('exif');
  if (e.gps) m.kinds.push('gps');
  if (m.xmp) m.kinds.push('xmp');
  if (m.iptc) m.kinds.push('iptc');
  if (m.comments.length) m.kinds.push('comment');
  if (m.texts.length) m.kinds.push('text');
  return m;
}

/** A minimal EXIF (TIFF) block with only the orientation. */
function orientationTiff(orientation) {
  const t = new Uint8Array(26);
  const dv = new DataView(t.buffer);
  t.set([0x4d, 0x4d, 0, 42]);
  dv.setUint32(4, 8);
  dv.setUint16(8, 1);
  dv.setUint16(10, 0x0112); dv.setUint16(12, 3); dv.setUint32(14, 1); dv.setUint16(18, orientation);
  dv.setUint32(22, 0);
  return t;
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function crc32(bytes) {
  let c = ~0;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

/**
 * The file without its metadata (EXIF, location, XMP, IPTC, comments, text chunks), the image data unchanged. Kept: the colour
 * profile and – when the picture is turned by its EXIF orientation – a minimal EXIF block with only the orientation.
 * Returns null for formats it cannot handle.
 */
export function stripMetadata(b, { orientation: keep = true } = {}) {
  const format = formatOfBytes(b);
  const meta = readMetadata(b);
  const orientation = keep && meta && meta.exif && meta.exif.orientation > 1 && meta.exif.orientation <= 8 ? meta.exif.orientation : 0;
  if (format === 'jpeg') {
    const j = jpegSegments(b);
    if (!j) return null;
    const keep = j.segs.filter((s) => {
      if (s.marker === 0xe0) return ascii(s.data, 0, 5) === 'JFIF\0'; // JFIF header (not the thumbnails of JFXX)
      if (s.marker === 0xe2) return ascii(s.data, 0, 11) === 'ICC_PROFILE';
      if (s.marker === 0xee) return ascii(s.data, 0, 5) === 'Adobe'; // (colour transform of CMYK/YCCK images)
      return !(s.marker >= 0xe1 && s.marker <= 0xef) && s.marker !== 0xfe;
    });
    const exif = () => { const tiff = orientationTiff(orientation); const len = 2 + 6 + tiff.length; return [new Uint8Array([0xff, 0xe1, len >> 8, len & 255]), new TextEncoder().encode('Exif\0\0'), tiff]; };
    const parts = [b.subarray(0, 2)];
    // the orientation goes right after the JFIF header, or first
    const jfif = keep.length && keep[0].marker === 0xe0 ? 1 : 0;
    keep.slice(0, jfif).forEach((s) => parts.push(b.subarray(s.start, s.end)));
    if (orientation) parts.push(...exif());
    keep.slice(jfif).forEach((s) => parts.push(b.subarray(s.start, s.end)));
    parts.push(b.subarray(j.rest));
    return concat(parts);
  }
  if (format === 'png') {
    const chunks = pngChunks(b);
    if (!chunks) return null;
    const parts = [b.subarray(0, 8)];
    for (const c of chunks) {
      if (['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME'].includes(c.type)) continue;
      parts.push(b.subarray(c.start, c.end));
      if (c.type === 'IHDR' && orientation) {
        const tiff = orientationTiff(orientation);
        const head = new Uint8Array(8);
        new DataView(head.buffer).setUint32(0, tiff.length);
        head.set(new TextEncoder().encode('eXIf'), 4);
        const crc = new Uint8Array(4);
        new DataView(crc.buffer).setUint32(0, crc32(concat([head.subarray(4), tiff])));
        parts.push(head, tiff, crc);
      }
    }
    return concat(parts);
  }
  if (format === 'webp') {
    const chunks = webpChunks(b);
    if (!chunks) return null;
    const parts = [];
    for (const c of chunks) {
      if (c.type === 'XMP ' || c.type === 'EXIF') continue;
      const bytes = b.slice(c.start, c.end);
      if (c.type === 'VP8X') bytes[8] &= ~(0x04 | 0x08); // (flags: no XMP, no EXIF)
      parts.push(bytes);
    }
    if (orientation && chunks.some((c) => c.type === 'VP8X')) {
      const tiff = orientationTiff(orientation);
      const head = new Uint8Array(8);
      head.set(new TextEncoder().encode('EXIF'));
      new DataView(head.buffer).setUint32(4, tiff.length, true);
      parts.push(head, tiff);
      const vp8x = parts.find((p) => ascii(p, 0, 4) === 'VP8X');
      vp8x[8] |= 0x08;
    }
    const body = concat(parts);
    const out = new Uint8Array(12 + body.length);
    out.set(b.subarray(0, 12));
    new DataView(out.buffer).setUint32(4, 4 + body.length, true);
    out.set(body, 12);
    return out;
  }
  return null;
}

// ---- EXIF orientation -------------------------------------------------------------------------------------------------

/** The EXIF orientation (1–8) of a JPEG, PNG or WebP file, 1 when there is none. */
export function orientationOf(bytes) {
  try { const m = readMetadata(bytes); const o = m && m.exif && m.exif.orientation; return o >= 1 && o <= 8 ? o : 1; } catch (e) { return 1; }
}

/**
 * Decode a file upright by its EXIF orientation, the same in every browser (some apply it, some only when the EXIF block comes
 * first): the file is decoded without any metadata and turned here. decode: blob -> canvas.
 */
export async function decodeUpright(bytes, type, decode) {
  const o = orientationOf(bytes);
  if (o === 1) return decode(new Blob([bytes], { type }));
  const c = await decode(new Blob([stripMetadata(bytes, { orientation: false }) || bytes], { type }));
  const w = c.width, h = c.height, swap = o >= 5;
  const out = document.createElement('canvas');
  out.width = swap ? h : w; out.height = swap ? w : h;
  const ctx = out.getContext('2d');
  const m = { 2: [-1, 0, 0, 1, w, 0], 3: [-1, 0, 0, -1, w, h], 4: [1, 0, 0, -1, 0, h], 5: [0, 1, 1, 0, 0, 0], 6: [0, 1, -1, 0, h, 0], 7: [0, -1, -1, 0, h, w], 8: [0, -1, 1, 0, 0, w] }[o];
  ctx.transform(...m);
  ctx.drawImage(c, 0, 0);
  return out;
}
