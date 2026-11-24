/*
 * CSV for the suite (RFC 4180): fields in quotes may contain separators, quotes ("") and line breaks.
 *   Suite.csv.parse(text, separator?) -> rows (arrays of strings); without a separator, the one of , ; tab that is most
 *     frequent in the first line is used; a BOM is removed and empty lines are skipped
 *   Suite.csv.stringify(rows) -> text (comma, CRLF, quoted where needed)
 */
(function (Suite) {
  'use strict';

  function detectSeparator(text) {
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let quoted = false;
    for (const ch of text) {
      if (ch === '"') quoted = !quoted;
      else if (!quoted && ch === '\n') break;
      else if (!quoted && ch in counts) counts[ch]++;
    }
    const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return n ? best : ',';
  }

  function parse(text, separator = null) {
    text = String(text).replace(/^﻿/, '');
    const sep = separator || detectSeparator(text);
    const rows = [];
    let row = [], cell = '', quoted = false, i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
          quoted = false; i++; continue;
        }
        cell += ch; i++; continue;
      }
      if (ch === '"' && cell === '') { quoted = true; i++; continue; }
      if (ch === sep) { row.push(cell); cell = ''; i++; continue; }
      if (ch === '\r' || ch === '\n') {
        row.push(cell); cell = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
        i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
        continue;
      }
      cell += ch; i++;
    }
    if (cell !== '' || row.length) { row.push(cell); if (row.length > 1 || row[0] !== '') rows.push(row); }
    return rows;
  }

  const quote = (v) => { const s = v == null ? '' : String(v); return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const stringify = (rows) => rows.map((r) => r.map(quote).join(',')).join('\r\n') + '\r\n';

  Suite.csv = { parse, stringify, detectSeparator };
})(window.Suite = window.Suite || {});
