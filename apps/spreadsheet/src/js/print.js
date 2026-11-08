/*
 * Print / PDF of the spreadsheet: the printed cells as an HTML document (tables with the column widths, row heights, formats,
 * borders and merged cells of Univer's snapshot), printed from a hidden frame by main.js – "Save as PDF" in the browser's print
 * dialog makes a PDF.
 *
 *   SSPrint.html(parts, options) -> HTML document
 *     parts: [{ name, sheet (snapshot of the sheet), styles (snapshot.styles), text (display values: text[row][column], from row 0
 *              and column 0 to the end of the range), range: { r0, c0, r1, c1 } }]   (one part per sheet; each starts a new page)
 *     options: { title, paper: 'A4' | 'Letter', orientation: 'portrait' | 'landscape', fit: 'none' | 'width' | 'page',
 *                repeat: rows at the top of each sheet repeated on every page, gridlines, margin (mm) }
 *   SSPrint.usedRange(sheet) -> { r0, c0, r1, c1 } of the cells with content or style (merges included), or null
 *   SSPrint.pageWidth(options), SSPrint.pageHeight(options): the printable size in CSS px
 */
(function () {
  'use strict';

  const PAPER = { A4: [210, 297], Letter: [215.9, 279.4] }; // mm
  const PX_PER_MM = 96 / 25.4;
  const DEFAULT_COLUMN_WIDTH = 88;
  const DEFAULT_ROW_HEIGHT = 24;
  // Univer's border styles (shared/js/univer-xlsx.js: BORDER) as CSS
  const BORDER = { 1: '1px solid', 2: '0.5px solid', 3: '1px dotted', 4: '1px dashed', 5: '1px dashed', 6: '1px dashed', 7: '3px double', 8: '2px solid',
    9: '2px dashed', 10: '2px dashed', 11: '2px dashed', 12: '2px dashed', 13: '3px solid' };
  const SIDES = { t: 'top', b: 'bottom', l: 'left', r: 'right' };
  const ALIGN = { 1: 'left', 2: 'center', 3: 'right', 4: 'justify' };
  const VALIGN = { 1: 'top', 2: 'middle', 3: 'bottom' };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cssString = (s) => `"${String(s).replace(/["\\]/g, '\\$&').replace(/[\r\n]+/g, ' ')}"`;
  const color = (c) => (c && typeof c.rgb === 'string' && /^#?[0-9a-f]{3,8}$/i.test(c.rgb) ? (c.rgb[0] === '#' ? c.rgb : `#${c.rgb}`) : null);

  const page = (o) => { const [w, h] = PAPER[o.paper] || PAPER.A4; return o.orientation === 'landscape' ? [h, w] : [w, h]; };
  const pageWidth = (o) => (page(o)[0] - 2 * (o.margin ?? 12)) * PX_PER_MM;
  const pageHeight = (o) => (page(o)[1] - 2 * (o.margin ?? 12)) * PX_PER_MM;

  const hiddenRow = (sheet, r) => !!(sheet.rowData && sheet.rowData[r] && sheet.rowData[r].hd);
  const hiddenColumn = (sheet, c) => !!(sheet.columnData && sheet.columnData[c] && sheet.columnData[c].hd);
  const rowHeight = (sheet, r) => (sheet.rowData && sheet.rowData[r] && sheet.rowData[r].h) || sheet.defaultRowHeight || DEFAULT_ROW_HEIGHT;
  const columnWidth = (sheet, c) => (sheet.columnData && sheet.columnData[c] && sheet.columnData[c].w) || sheet.defaultColumnWidth || DEFAULT_COLUMN_WIDTH;
  const styleOf = (styles, cell) => (!cell || !cell.s ? {} : typeof cell.s === 'string' ? (styles && styles[cell.s]) || {} : cell.s);

  /** The cells with content or a visible style (background, borders), merges included. */
  function usedRange(sheet, styles = {}) {
    let r0 = Infinity, c0 = Infinity, r1 = -1, c1 = -1;
    const take = (r, c) => { r0 = Math.min(r0, r); c0 = Math.min(c0, c); r1 = Math.max(r1, r); c1 = Math.max(c1, c); };
    for (const [r, row] of Object.entries(sheet.cellData || {})) {
      for (const [c, cell] of Object.entries(row || {})) {
        if (!cell) continue;
        const s = styleOf(styles, cell);
        const filled = (cell.v !== undefined && cell.v !== null && cell.v !== '') || cell.p || cell.f || s.bg || (s.bd && Object.keys(s.bd).length);
        if (filled) take(+r, +c);
      }
    }
    for (const m of sheet.mergeData || []) if (r1 >= 0 && m.startRow <= r1 && m.startColumn <= c1 && m.endRow >= r0 && m.endColumn >= c0) { take(m.startRow, m.startColumn); take(m.endRow, m.endColumn); }
    return r1 < 0 ? null : { r0, c0, r1, c1 };
  }

  function cellCss(s, cell) {
    const css = [];
    if (s.ff) css.push(`font-family:${cssString(s.ff)},Arial,sans-serif`);
    if (s.fs) css.push(`font-size:${s.fs}pt`);
    if (s.bl) css.push('font-weight:bold');
    if (s.it) css.push('font-style:italic');
    const deco = [s.ul && s.ul.s ? 'underline' : '', s.st && s.st.s ? 'line-through' : ''].filter(Boolean).join(' ');
    if (deco) css.push(`text-decoration:${deco}`);
    if (color(s.cl)) css.push(`color:${color(s.cl)}`);
    if (color(s.bg)) css.push(`background:${color(s.bg)}`);
    const numeric = cell && (cell.t === 2 || (cell.t === undefined && typeof cell.v === 'number'));
    const align = ALIGN[s.ht] || (numeric ? 'right' : cell && cell.t === 3 ? 'center' : '');
    if (align) css.push(`text-align:${align}`);
    css.push(`vertical-align:${VALIGN[s.vt] || 'bottom'}`);
    if (s.tb === 3) css.push('white-space:pre-wrap;overflow-wrap:anywhere');
    for (const [k, side] of Object.entries(SIDES)) {
      const b = s.bd && s.bd[k];
      if (b && BORDER[b.s]) css.push(`border-${side}:${BORDER[b.s]} ${color(b.cl) || '#000'}`);
    }
    return css.join(';');
  }

  /** The rows of a section as <tr>s (merged cells clipped to the section and the printed columns). */
  function rowsHtml(part, rows, columns) {
    const { sheet, styles, text } = part;
    const rowSet = new Set(rows), colSet = new Set(columns);
    const covered = new Set(), spans = new Map(); // "r,c"
    for (const m of sheet.mergeData || []) {
      const mr = rows.filter((r) => r >= m.startRow && r <= m.endRow);
      const mc = columns.filter((c) => c >= m.startColumn && c <= m.endColumn);
      if (!mr.length || !mc.length) continue;
      spans.set(`${mr[0]},${mc[0]}`, { rows: mr.length, cols: mc.length, from: [m.startRow, m.startColumn] });
      for (const r of mr) for (const c of mc) if (r !== mr[0] || c !== mc[0]) covered.add(`${r},${c}`);
    }
    return rows.filter((r) => rowSet.has(r)).map((r) => {
      const cells = columns.filter((c) => colSet.has(c) && !covered.has(`${r},${c}`)).map((c) => {
        const span = spans.get(`${r},${c}`);
        const [sr, sc] = span ? span.from : [r, c];
        const cell = sheet.cellData && sheet.cellData[sr] && sheet.cellData[sr][sc];
        const value = text[sr] && text[sr][sc] != null ? String(text[sr][sc]) : '';
        const attrs = span ? `${span.rows > 1 ? ` rowspan="${span.rows}"` : ''}${span.cols > 1 ? ` colspan="${span.cols}"` : ''}` : '';
        return `<td${attrs} style="${esc(cellCss(styleOf(styles, cell), cell))}">${esc(value)}</td>`;
      }).join('');
      return `<tr style="height:${rowHeight(sheet, r)}px">${cells}</tr>`;
    }).join('\n');
  }

  function partHtml(part, o) {
    const { sheet, range } = part;
    const columns = [];
    for (let c = range.c0; c <= range.c1; c++) if (!hiddenColumn(sheet, c)) columns.push(c);
    const repeat = Math.max(0, Math.min(o.repeat || 0, range.r1 + 1));
    const head = [], body = [];
    for (let r = 0; r < repeat; r++) if (!hiddenRow(sheet, r)) head.push(r);
    for (let r = Math.max(range.r0, repeat); r <= range.r1; r++) if (!hiddenRow(sheet, r)) body.push(r);
    const width = columns.reduce((n, c) => n + columnWidth(sheet, c), 0);
    const height = [...head, ...body].reduce((n, r) => n + rowHeight(sheet, r), 0);
    // fit: the table is zoomed (Chromium and Firefox) so that it fits the width of the page, or the whole page
    let zoom = 1;
    if (o.fit === 'width' || o.fit === 'page') zoom = Math.min(1, pageWidth(o) / width);
    if (o.fit === 'page') zoom = Math.min(zoom, pageHeight(o) / height);
    return `<section class="sheet" data-sheet="${esc(part.name)}">
<table style="width:${width}px${zoom < 1 ? `;zoom:${zoom.toFixed(4)}` : ''}" class="${o.gridlines ? 'grid' : ''}">
<colgroup>${columns.map((c) => `<col style="width:${columnWidth(sheet, c)}px">`).join('')}</colgroup>
${head.length ? `<thead>\n${rowsHtml(part, head, columns)}\n</thead>` : ''}
<tbody>
${rowsHtml(part, body, columns)}
</tbody>
</table>
</section>`;
  }

  function html(parts, options = {}) {
    const o = { paper: 'A4', orientation: 'portrait', fit: 'width', repeat: 0, gridlines: false, margin: 12, ...options };
    const [w, h] = page(o);
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(o.title || '')}</title>
<style>
@page { size: ${w}mm ${h}mm; margin: ${o.margin}mm; }
html, body { margin: 0; background: #fff; color: #000; }
body { font: 11pt Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sheet + .sheet { break-before: page; }
table { border-collapse: collapse; table-layout: fixed; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
td { padding: 0 3px; white-space: nowrap; overflow: visible; line-height: 1.2; border: none; }
table.grid td { border: 0.5px solid #c0c0c0; }
</style></head>
<body>
${parts.map((p) => partHtml(p, o)).join('\n')}
</body></html>`;
  }

  window.SSPrint = { html, usedRange, pageWidth, pageHeight };
})();
