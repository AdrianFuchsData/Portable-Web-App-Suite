/*
 * Text encodings and line endings of the text editor.
 *
 *   const doc = TE.encoding.decode(bytes);   // { text, encoding, bom, eol } – text always uses "\n"
 *   const bytes = TE.encoding.encode(text, { encoding, bom, eol });
 *
 * Encodings: utf-8, utf-16le, utf-16be, windows-1252 (also used for ISO-8859-1 files). Detection: byte order
 * mark, then valid UTF-8 (incl. pure ASCII), then UTF-16 without BOM (many zero bytes), else windows-1252.
 */
(function (TE) {
  'use strict';

  const ENCODINGS = ['utf-8', 'utf-16le', 'utf-16be', 'windows-1252'];
  const LABELS = { 'utf-8': 'UTF-8', 'utf-16le': 'UTF-16 LE', 'utf-16be': 'UTF-16 BE', 'windows-1252': 'Windows-1252' };
  const EOLS = { lf: '\n', crlf: '\r\n', cr: '\r' };
  // windows-1252 code points of the bytes 0x80-0x9F (undefined bytes map to the C1 control characters)
  const CP1252 = [0x20AC, 0x81, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8D, 0x017D, 0x8F,
    0x90, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x9D, 0x017E, 0x0178];

  function detectEncoding(bytes) {
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return { encoding: 'utf-8', bom: true };
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) return { encoding: 'utf-16le', bom: true };
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) return { encoding: 'utf-16be', bom: true };
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      // UTF-16 text without BOM decodes as "valid" UTF-8 with many NUL characters
      const sample = bytes.subarray(0, 4096);
      let evenZero = 0;
      let oddZero = 0;
      for (let i = 0; i < sample.length; i++) if (sample[i] === 0) { if (i % 2) oddZero++; else evenZero++; }
      if (sample.length >= 4 && oddZero > sample.length / 4 && evenZero === 0) return { encoding: 'utf-16le', bom: false };
      if (sample.length >= 4 && evenZero > sample.length / 4 && oddZero === 0) return { encoding: 'utf-16be', bom: false };
      return { encoding: 'utf-8', bom: false };
    } catch (e) {
      return { encoding: 'windows-1252', bom: false };
    }
  }

  function detectEol(text) {
    const crlf = (text.match(/\r\n/g) || []).length;
    const lf = (text.match(/(^|[^\r])\n/g) || []).length;
    const cr = (text.match(/\r(?!\n)/g) || []).length;
    if (crlf >= lf && crlf >= cr && crlf > 0) return 'crlf';
    if (cr > lf) return 'cr';
    return 'lf';
  }

  function decode(data, forced = null) {
    const bytes = new Uint8Array(data);
    const detected = forced ? { encoding: forced, bom: false } : detectEncoding(bytes);
    let offset = 0;
    if (detected.bom || forced) {
      if (detected.encoding === 'utf-8' && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) { offset = 3; detected.bom = true; }
      if (detected.encoding !== 'utf-8' && detected.encoding.startsWith('utf-16') && ((bytes[0] === 0xFF && bytes[1] === 0xFE) || (bytes[0] === 0xFE && bytes[1] === 0xFF))) { offset = 2; detected.bom = true; }
    }
    const body = bytes.subarray(offset);
    let raw;
    if (detected.encoding === 'windows-1252') {
      raw = Array.from(body, (b) => String.fromCharCode(b >= 0x80 && b <= 0x9F ? CP1252[b - 0x80] : b)).join('');
    } else {
      raw = new TextDecoder(detected.encoding).decode(body);
    }
    const eol = detectEol(raw);
    return { text: raw.replace(/\r\n?/g, '\n'), encoding: detected.encoding, bom: detected.bom, eol };
  }

  /** Characters that cannot be stored in the encoding (only windows-1252 is limited). */
  function unencodable(text, encoding) {
    if (encoding !== 'windows-1252') return [];
    const bad = new Set();
    for (const ch of text) {
      const c = ch.codePointAt(0);
      if (c > 0xFF && !CP1252.includes(c)) bad.add(ch);
    }
    return [...bad];
  }

  function encode(text, { encoding = 'utf-8', bom = false, eol = 'lf' } = {}) {
    const converted = text.replace(/\r\n?/g, '\n').replace(/\n/g, EOLS[eol] || '\n');
    if (encoding === 'utf-8') {
      const body = new TextEncoder().encode(converted);
      if (!bom) return body;
      const out = new Uint8Array(body.length + 3);
      out.set([0xEF, 0xBB, 0xBF]);
      out.set(body, 3);
      return out;
    }
    if (encoding === 'utf-16le' || encoding === 'utf-16be') {
      const le = encoding === 'utf-16le';
      const offset = bom ? 2 : 0;
      const out = new Uint8Array(offset + converted.length * 2);
      const view = new DataView(out.buffer);
      if (bom) view.setUint16(0, 0xFEFF, le);
      for (let i = 0; i < converted.length; i++) view.setUint16(offset + i * 2, converted.charCodeAt(i), le);
      return out;
    }
    if (encoding === 'windows-1252') {
      const out = [];
      for (const ch of converted) {
        const c = ch.codePointAt(0);
        const i = CP1252.indexOf(c);
        out.push(i >= 0 && !(c >= 0x80 && c <= 0x9F) ? 0x80 + i : c <= 0xFF ? c : 0x3F); // "?" for unencodable characters
      }
      return new Uint8Array(out);
    }
    throw new Error(`unknown encoding: ${encoding}`);
  }

  TE.encoding = { decode, encode, unencodable, detectEncoding, ENCODINGS, LABELS, EOLS };
})(window.TE = window.TE || {});
