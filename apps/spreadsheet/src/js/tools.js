/*
 * Data → Clean up: remove duplicate rows and split text into columns (Univer's free packages have neither dialog).
 *
 *   SSTools.duplicates(rows, columns) -> indexes of the rows to keep (the first of equal rows; equal: the compared columns have the
 *                                        same values, text compared without regard to case and surrounding spaces, as Excel does)
 *   SSTools.split(texts, { separator, consecutive, types, decimal }) -> rows of values (numbers, Dates, strings; through SSCSV, so
 *                                        quoted fields may contain the separator)
 *   SSTools.cell(value) -> Univer cell data for a value (dates as serial numbers with a date format)
 *   SSTools.install(univerAPI, open) adds the menu; open('dedupe' | 'split') shows the app's dialog
 *   SSTools.locales.en / .de: menu texts for Univer's locales
 */
(function () {
  'use strict';

  const locales = {
    en: { 'ss-tools': { menu: 'Clean up', dedupe: 'Remove duplicates…', split: 'Text to columns…' } },
    de: { 'ss-tools': { menu: 'Bereinigen', dedupe: 'Duplikate entfernen…', split: 'Text in Spalten…' } },
  };

  const key = (v) => (v === null || v === undefined ? '' : typeof v === 'string' ? 's' + v.trim().toLowerCase() : typeof v + String(v));

  function duplicates(rows, columns) {
    const seen = new Set();
    const keep = [];
    rows.forEach((row, i) => {
      const k = JSON.stringify(columns.map((c) => key(row[c])));
      if (!seen.has(k)) { seen.add(k); keep.push(i); }
    });
    return keep;
  }

  function split(texts, { separator = ',', consecutive = false, types = 'auto', decimal = '.' } = {}) {
    const rows = texts.map((text) => {
      if (text === null || text === undefined || text === '') return [];
      let line = String(text).replace(/\r?\n/g, ' ');
      if (consecutive) line = line.split(separator).filter((part, i, all) => part !== '' || i === 0 || i === all.length - 1).join(separator);
      return SSCSV.parse(line, separator, 1)[0] || [];
    });
    return SSCSV.convert(rows, { types, decimal });
  }

  const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
  function cell(value) {
    const blank = { p: null, f: null, si: null };
    if (value === null || value === undefined || value === '') return { ...blank, v: null };
    if (value instanceof Date) {
      const serial = (value.getTime() - EXCEL_EPOCH) / 86400000;
      return { ...blank, v: serial, t: 2, s: { n: { pattern: Number.isInteger(serial) ? 'yyyy-mm-dd' : 'yyyy-mm-dd hh:mm' } } };
    }
    if (typeof value === 'number') return { ...blank, v: value, t: 2 };
    if (typeof value === 'boolean') return { ...blank, v: value ? 1 : 0, t: 3 };
    return { ...blank, v: String(value), t: 1 };
  }

  function install(univerAPI, open) {
    SSMenu.submenu(univerAPI, {
      id: 'ss-tools-menu', title: 'ss-tools.menu', icon: 'SSToolsIcon', order: 11, // (icon registered by main.js)
      items: [['ss-tools-dedupe', 'ss-tools.dedupe', () => open('dedupe')], ['ss-tools-split', 'ss-tools.split', () => open('split')]],
    });
  }

  window.SSTools = { duplicates, split, cell, install, locales };
})();
