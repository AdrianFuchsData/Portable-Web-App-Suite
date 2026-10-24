/*
 * Diagrams in other applications (presentation, web slides, document, spreadsheet): a diagram is stored as an ordinary
 * PNG image that carries the draw.io XML in a tEXt chunk "mxfile" (as draw.io's "editable PNG"), so PPTX, DOCX and XLSX
 * keep it unchanged and other programs show the picture. Inserting and editing go through the app bridge: the diagram
 * editor opens the image and every "Save" there hands the new image back (docs/planning/spike-results.md, S-11).
 *
 *   Suite.diagrams.isDiagram(src)                // src: data URL or Uint8Array; PNG with "mxfile" or SVG with content="…<mxfile"
 *   Suite.diagrams.insert({ onSave })            // an empty diagram; onSave({ src, width, height }) for every save
 *   Suite.diagrams.edit({ src, name, onSave })   // an existing diagram image
 *   (width/height: the size to show it at – half the pixels of the editor's 2× PNG)
 *   Suite.diagrams.newSize(oldSrc, oldWidth, res, maxWidth)   // the size of an updated picture (same scale as before)
 * Call insert/edit from a click handler (they open a window, popup blockers).
 */
(function (Suite) {
  'use strict';

  Suite.i18n.register({
    en: { 'dia.insert': 'Insert diagram', 'dia.edit': 'Edit diagram', 'dia.name': 'diagram', 'dia.updated': 'The diagram was updated.' },
    de: { 'dia.insert': 'Diagramm einfügen', 'dia.edit': 'Diagramm bearbeiten', 'dia.name': 'diagramm', 'dia.updated': 'Das Diagramm wurde aktualisiert.' },
  });

  const latin1 = new TextDecoder('latin1');

  function toBytes(src) {
    if (src instanceof Uint8Array) return src;
    if (src instanceof ArrayBuffer) return new Uint8Array(src);
    const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(String(src || ''));
    if (!m) return new Uint8Array(0);
    if (m[2]) return Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0));
    return new TextEncoder().encode(decodeURIComponent(m[3]));
  }

  function toDataUrl(bytes, type) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return `data:${type};base64,${btoa(bin)}`;
  }

  const isPng = (b) => b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

  /** The chunks of a PNG: [{ type, data, start, end }]. */
  function chunks(b) {
    const out = [];
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    for (let p = 8; p + 12 <= b.length;) {
      const len = v.getUint32(p);
      const type = latin1.decode(b.subarray(p + 4, p + 8));
      out.push({ type, data: b.subarray(p + 8, p + 8 + len), start: p, end: p + 12 + len });
      if (type === 'IEND') break;
      p += 12 + len;
    }
    return out;
  }

  /** Does the image carry a diagram? */
  function isDiagram(src) {
    const b = toBytes(src);
    if (isPng(b)) return chunks(b).some((c) => (c.type === 'tEXt' || c.type === 'zTXt' || c.type === 'iTXt') && latin1.decode(c.data.subarray(0, 7)) === 'mxfile\0');
    const text = new TextDecoder().decode(b.subarray(0, 200000));
    return /<svg[\s\S]*content="[^"]*(&lt;|<)mxfile/.test(text);
  }

  /** Pixel size of a PNG (IHDR) or of an SVG (width/height attributes). */
  function pixelSize(b) {
    if (isPng(b)) { const v = new DataView(b.buffer, b.byteOffset, b.byteLength); return { width: v.getUint32(16), height: v.getUint32(20) }; }
    const m = /<svg[^>]*\swidth="([\d.]+)"[^>]*\sheight="([\d.]+)"/.exec(new TextDecoder().decode(b.subarray(0, 4000)));
    return m ? { width: +m[1] * 2, height: +m[2] * 2 } : { width: 400, height: 300 };
  }

  // ---- an empty diagram as a PNG (1×1 white pixel with an empty draw.io file inside) ------------------------------

  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  const crc32 = (bytes) => { let c = 0xffffffff; for (const x of bytes) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

  function chunk(type, data) {
    const out = new Uint8Array(12 + data.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  }

  const EMPTY_XML = '<mxfile><diagram name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>';
  // 1×1 white RGB pixel (zlib stream of the row "0 ff ff ff")
  const PIXEL = [0x78, 0x9c, 0x63, 0xf8, 0xff, 0xff, 0x3f, 0x00, 0x05, 0xfe, 0x02, 0xfe];

  function emptyDiagramPng() {
    const ihdr = new Uint8Array(13);
    const v = new DataView(ihdr.buffer);
    v.setUint32(0, 1); v.setUint32(4, 1);
    ihdr.set([8, 2, 0, 0, 0], 8);
    const text = new TextEncoder().encode(`mxfile\0${encodeURIComponent(EMPTY_XML)}`);
    const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('tEXt', text), chunk('IDAT', new Uint8Array(PIXEL)), chunk('IEND', new Uint8Array(0))];
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  // ---- opening the diagram editor ------------------------------------------------------------------------------------

  /** What the host gets for a saved image: a data URL and the size to show it at. */
  function result(bytes) {
    const png = isPng(bytes);
    const px = pixelSize(bytes);
    return { src: toDataUrl(bytes, png ? 'image/png' : 'image/svg+xml'), width: Math.max(1, Math.round(px.width / 2)), height: Math.max(1, Math.round(px.height / 2)), bytes };
  }

  function open(bytes, name, onSave) {
    return Suite.bridge.openIn('diagram', {
      name, data: bytes, type: /\.svg$/i.test(name) ? 'image/svg+xml' : 'image/png', source: document.title,
      save: async (saved) => { await onSave(result(saved)); if (Suite.shell && Suite.shell.toast) Suite.shell.toast(Suite.t('dia.updated')); },
    }).catch((err) => { if (Suite.shell && Suite.shell.toast) Suite.shell.toast(Suite.i18n.describe(err), 'error'); });
  }

  /** A new, empty diagram; onSave is called with every save in the diagram editor (the first one inserts it). */
  function insert({ onSave, name = `${Suite.t('dia.name')}.drawio.png` }) {
    return open(emptyDiagramPng(), name, onSave);
  }

  /** Edit a diagram image (data URL or bytes). */
  function edit({ src, onSave, name }) {
    const bytes = toBytes(src);
    const svg = !isPng(bytes);
    return open(bytes, name || `${Suite.t('dia.name')}.drawio.${svg ? 'svg' : 'png'}`, onSave);
  }

  /**
   * Size for a new picture of a diagram shown at oldWidth: the same scale as before (a bigger diagram gets a bigger picture),
   * at most maxWidth wide.
   */
  function newSize(oldSrc, oldWidth, res, maxWidth = Infinity) {
    const before = pixelSize(toBytes(oldSrc)).width / 2 || res.width;
    const scale = oldWidth / before;
    const k = Math.min(scale, maxWidth / res.width);
    return { width: Math.max(1, Math.round(res.width * k)), height: Math.max(1, Math.round(res.height * k)) };
  }

  Suite.diagrams = { isDiagram, insert, edit, newSize, toBytes, toDataUrl, pixelSize, emptyDiagramPng };
})(window.Suite = window.Suite || {});
