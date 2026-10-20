/*
 * CSV import for the spreadsheet: encoding, separator detection, RFC 4180 parsing and conversion of the values.
 *
 *   SSCSV.decode(bytes, 'auto' | 'utf-8' | 'windows-1252' | 'utf-16le' | 'utf-16be') -> { text, encoding }
 *   SSCSV.sniff(text) -> ',' | ';' | '\t' | '|'
 *   SSCSV.parse(text, separator, limit) -> [[...cells]]
 *   SSCSV.convert(rows, { types: 'auto' | 'text', decimal: '.' | ',' }) -> rows with numbers, Dates and strings
 */
(function () {
  'use strict';

  function decode(bytes, encoding = 'auto') {
    let enc = encoding;
    let start = 0;
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) { start = 3; if (enc === 'auto') enc = 'utf-8'; } else if (bytes[0] === 0xFF && bytes[1] === 0xFE) { start = 2; if (enc === 'auto') enc = 'utf-16le'; } else if (bytes[0] === 0xFE && bytes[1] === 0xFF) { start = 2; if (enc === 'auto') enc = 'utf-16be'; }
    const body = bytes.subarray(start);
    if (enc === 'auto') {
      try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(body), encoding: 'utf-8' }; } catch (e) { enc = 'windows-1252'; }
    }
    return { text: new TextDecoder(enc).decode(body), encoding: enc };
  }

  const SEPARATORS = [',', ';', '\t', '|'];

  /** The separator that gives the most columns consistently over the first lines (quotes respected). */
  function sniff(text) {
    let best = ',', bestScore = -1;
    for (const sep of SEPARATORS) {
      const rows = parse(text, sep, 20).filter((r) => r.length > 1 || r[0] !== '');
      if (!rows.length) continue;
      const counts = rows.map((r) => r.length);
      const first = counts[0];
      if (first < 2) continue;
      const consistent = counts.filter((c) => c === first).length / counts.length;
      const score = consistent * 100 + first;
      if (score > bestScore) { bestScore = score; best = sep; }
    }
    return best;
  }

  function parse(text, sep, limit = Infinity) {
    const rows = [];
    let row = [], cell = '', quoted = false, i = 0;
    const n = text.length;
    while (i < n && rows.length < limit) {
      const c = text[i];
      if (quoted) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i += 2; continue; } quoted = false; i++; continue; }
        if (c === '\r') { cell += '\n'; i += text[i + 1] === '\n' ? 2 : 1; continue; } // line breaks in cells become \n
        cell += c; i++; continue;
      }
      if (c === '"' && cell === '') { quoted = true; i++; continue; }
      if (c === sep) { row.push(cell); cell = ''; i++; continue; }
      if (c === '\r' || c === '\n') {
        row.push(cell); rows.push(row); row = []; cell = '';
        i += c === '\r' && text[i + 1] === '\n' ? 2 : 1;
        continue;
      }
      cell += c; i++;
    }
    if ((cell !== '' || row.length) && rows.length < limit) { row.push(cell); rows.push(row); }
    return rows;
  }

  function number(s, decimal) {
    const t = s.trim();
    if (!t || /^[+-]?0\d/.test(t)) return null; // leading zeros (postcodes, phone numbers) stay text
    const thousands = decimal === ',' ? '.' : ',';
    const re = decimal === ','
      ? /^[+-]?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?(%?)$/
      : /^[+-]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?([eE][+-]?\d+)?(%?)$/;
    if (!re.test(t)) return null;
    let v = Number(t.replace('%', '').split(thousands).join('').replace(decimal, '.'));
    if (!Number.isFinite(v)) return null;
    if (t.endsWith('%')) v /= 100;
    return v;
  }

  function date(s) {
    let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s.trim());
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)));
    m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s.trim());
    if (m && +m[2] <= 12 && +m[1] <= 31) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    return null;
  }

  function convert(rows, { types = 'auto', decimal = '.' } = {}) {
    if (types === 'text') return rows.map((r) => r.map((c) => c));
    return rows.map((r) => r.map((c) => {
      if (c === '') return null;
      const v = number(c, decimal);
      if (v != null) return v;
      const d = date(c);
      if (d) return d;
      if (/^(true|false)$/i.test(c.trim())) return /^true$/i.test(c.trim());
      return c;
    }));
  }

  window.SSCSV = { decode, sniff, parse, convert, SEPARATORS };
})();
