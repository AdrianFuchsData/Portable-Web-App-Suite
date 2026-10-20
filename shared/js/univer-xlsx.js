/*
 * Import and export of spreadsheet files for Univer Sheets (Univer's open-source core has no XLSX support).
 *
 * XLSX/XLSM are read and written with ExcelJS (values, formulas incl. shared formulas, styles, merged
 * cells, column widths, row heights, frozen panes, tab colors, hidden sheets/rows/columns, conditional formatting and data
 * validation, which Univer keeps in the workbook resources of its plugins). Other formats
 * (ODS, XLS, CSV, ...) are converted with SheetJS Community Edition, which keeps values, formulas and
 * merged cells but no styles.
 *
 * Needs the globals ExcelJS (vendor/exceljs.min.js) and, for formats other than XLSX, XLSX
 * (vendor/xlsx.full.min.js).
 */
(function (Suite) {
  'use strict';

  // Univer enums (from @univerjs/core)
  const CellValueType = { STRING: 1, NUMBER: 2, BOOLEAN: 3 };
  const HORIZONTAL = { left: 1, center: 2, right: 3, justify: 4, fill: 5, distributed: 6, centerContinuous: 2 };
  const VERTICAL = { top: 1, middle: 2, bottom: 3, justify: 2, distributed: 2 };
  const BORDER = {
    thin: 1, hair: 2, dotted: 3, dashed: 4, dashDot: 5, dashDotDot: 6, double: 7, medium: 8,
    mediumDashed: 9, mediumDashDot: 10, mediumDashDotDot: 11, slantDashDot: 12, thick: 13,
  };
  const BORDER_NAMES = Object.fromEntries(Object.entries(BORDER).map(([k, v]) => [v, k]));
  const SIDES = { top: 't', bottom: 'b', left: 'l', right: 'r' };
  const WRAP = 3;
  const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
  const DEFAULT_COLUMN_WIDTH = 88; // px, Univer default
  const DEFAULT_ROW_HEIGHT = 24;

  // Default Office theme, used when a file has no theme part
  const DEFAULT_THEME = ['000000', 'FFFFFF', '44546A', 'E7E6E6', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '0563C1', '954F72'];
  // Legacy indexed palette (indexes 0-63; 64/65 are the system foreground/background)
  const INDEXED = ('000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF 000000 FFFFFF FF0000 00FF00 0000FF FFFF00 '
    + 'FF00FF 00FFFF 800000 008000 000080 808000 800080 008080 C0C0C0 808080 9999FF 993366 FFFFCC CCFFFF 660066 FF8080 '
    + '0066CC CCCCFF 000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF 00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC '
    + 'CC99FF FFCC99 3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 003366 339966 003300 333300 993300 993366 '
    + '333399 333333 000000 FFFFFF').split(' ');

  const CF_RESOURCE = 'SHEET_CONDITIONAL_FORMATTING_PLUGIN';
  const DV_RESOURCE = 'SHEET_DATA_VALIDATION_PLUGIN';
  const DV_ERROR_STYLE = { information: 0, stop: 1, warning: 2 }; // Univer DataValidationErrorStyle
  const DV_ERROR_NAMES = { 0: 'information', 1: 'stop', 2: 'warning' };
  const CF_VALUE_TYPES = { min: 'min', max: 'max', num: 'num', percent: 'percent', percentile: 'percentile', formula: 'formula' };
  const TEXT_OPERATORS = { containsText: 'containsText', notContains: 'notContainsText', beginsWith: 'beginsWith', endsWith: 'endsWith' };
  const uid = () => Math.random().toString(36).slice(2, 10);

  // ---- helpers ---------------------------------------------------------------------------------

  function columnName(index) { // 0 -> A
    let name = '';
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
    return name;
  }

  function columnIndex(name) { // A -> 0
    let n = 0;
    for (const ch of name.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
    return n - 1;
  }

  function parseRange(ref) { // "A7:D7" -> {startRow: 6, startColumn: 0, endRow: 6, endColumn: 3}
    const [a, b = a] = ref.replace(/\$/g, '').split(':');
    const p = (s) => { const m = /^([A-Z]+)(\d+)$/i.exec(s); return [Number(m[2]) - 1, columnIndex(m[1])]; };
    const [r1, c1] = p(a);
    const [r2, c2] = p(b);
    return { startRow: Math.min(r1, r2), startColumn: Math.min(c1, c2), endRow: Math.max(r1, r2), endColumn: Math.max(c1, c2) };
  }

  /**
   * Move the relative A1 references of a formula by (rows, columns), as Excel does when a formula is
   * copied. Text in quotes is left alone; absolute ($) parts are kept.
   */
  function shiftFormula(formula, rows, columns) {
    if (!rows && !columns) return formula;
    return formula.split(/("(?:[^"]|"")*")/).map((part, i) => (i % 2 ? part : part.replace(
      /(^|[^A-Za-z0-9_.$!'"])(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?![\d(A-Za-z_])/g,
      (m, pre, colAbs, col, rowAbs, row) => {
        const c = colAbs ? col : columnName(columnIndex(col) + columns);
        const r = rowAbs ? row : String(Number(row) + rows);
        return `${pre}${colAbs}${c}${rowAbs}${r}`;
      },
    ).replace(
      // references after a sheet name (Sheet1!A1, 'My Sheet'!A1)
      /(!)(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?![\d(A-Za-z_])/g,
      (m, pre, colAbs, col, rowAbs, row) => `${pre}${colAbs}${colAbs ? col : columnName(columnIndex(col) + columns)}${rowAbs}${rowAbs ? row : Number(row) + rows}`,
    ))).join('');
  }

  function dateToSerial(date) {
    return (date.getTime() - EXCEL_EPOCH) / 86400000;
  }

  // ---- colors ----------------------------------------------------------------------------------

  function themeColors(workbook) {
    const xml = (workbook._themes && workbook._themes.theme1) || (workbook.model && workbook.model.themes && workbook.model.themes.theme1);
    if (!xml) return DEFAULT_THEME;
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const scheme = doc.getElementsByTagNameNS('*', 'clrScheme')[0];
    if (!scheme) return DEFAULT_THEME;
    const colors = [...scheme.children].map((el) => {
      const c = el.firstElementChild;
      return (c && (c.getAttribute('val') === 'windowText' ? '000000' : c.getAttribute('val') === 'window' ? 'FFFFFF' : c.getAttribute('lastClr') || c.getAttribute('val'))) || '000000';
    });
    // theme order in the file: dk1 lt1 dk2 lt2 ...; color indexes in cells: lt1 dk1 lt2 dk2 ...
    return colors.length >= 12 ? colors : DEFAULT_THEME;
  }

  function applyTint(hex, tint) {
    if (!tint) return hex;
    let [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.substr(i, 2), 16) / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    let l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h /= 6;
    }
    l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
    const hue = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    if (s === 0) { r = g = b = l; } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      [r, g, b] = [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)];
    }
    return [r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  /** ExcelJS color ({argb} | {theme, tint} | {indexed}) -> Univer {rgb: '#RRGGBB'} or undefined. */
  function toUniverColor(color, theme) {
    if (!color) return undefined;
    let hex;
    if (color.argb) hex = color.argb.length === 8 ? color.argb.slice(2) : color.argb;
    else if (color.theme !== undefined) {
      const order = [1, 0, 3, 2, 4, 5, 6, 7, 8, 9, 10, 11]; // cell index -> scheme position
      hex = theme[order[color.theme]] || '000000';
    } else if (color.indexed !== undefined) hex = INDEXED[color.indexed];
    if (!hex) return undefined;
    return { rgb: '#' + applyTint(hex.toUpperCase(), color.tint) };
  }

  function toExcelColor(color) {
    return color && color.rgb ? { argb: 'FF' + color.rgb.replace('#', '').toUpperCase().padStart(6, '0').slice(-6) } : undefined;
  }

  // ---- styles ----------------------------------------------------------------------------------

  function toUniverStyle(style, theme) {
    const s = {};
    const f = style.font;
    if (f) {
      if (f.name) s.ff = f.name;
      if (f.size) s.fs = f.size;
      if (f.bold) s.bl = 1;
      if (f.italic) s.it = 1;
      if (f.underline && f.underline !== 'none') s.ul = { s: 1 };
      if (f.strike) s.st = { s: 1 };
      const cl = toUniverColor(f.color, theme);
      if (cl) s.cl = cl;
      if (f.vertAlign === 'superscript') s.va = 3;
      if (f.vertAlign === 'subscript') s.va = 2;
    }
    const fill = style.fill;
    if (fill && fill.type === 'pattern' && fill.pattern === 'solid') {
      const bg = toUniverColor(fill.fgColor, theme);
      if (bg) s.bg = bg;
    }
    if (style.border) {
      const bd = {};
      for (const [side, key] of Object.entries(SIDES)) {
        const b = style.border[side];
        if (b && BORDER[b.style]) bd[key] = { s: BORDER[b.style], cl: toUniverColor(b.color, theme) || { rgb: '#000000' } };
      }
      if (Object.keys(bd).length) s.bd = bd;
    }
    const a = style.alignment;
    if (a) {
      if (HORIZONTAL[a.horizontal]) s.ht = HORIZONTAL[a.horizontal];
      if (VERTICAL[a.vertical]) s.vt = VERTICAL[a.vertical];
      if (a.wrapText) s.tb = WRAP;
      if (a.textRotation === 'vertical' || a.textRotation === 255) s.tr = { a: 0, v: 1 };
      else if (typeof a.textRotation === 'number' && a.textRotation) s.tr = { a: a.textRotation > 90 ? 90 - a.textRotation : a.textRotation, v: 0 };
    }
    if (style.numFmt && style.numFmt !== 'General') s.n = { pattern: style.numFmt };
    return s;
  }

  function toExcelStyle(s) {
    const style = {};
    const font = {};
    if (s.ff) font.name = s.ff;
    if (s.fs) font.size = s.fs;
    if (s.bl) font.bold = true;
    if (s.it) font.italic = true;
    if (s.ul && s.ul.s) font.underline = true;
    if (s.st && s.st.s) font.strike = true;
    if (s.cl) font.color = toExcelColor(s.cl);
    if (s.va === 3) font.vertAlign = 'superscript';
    if (s.va === 2) font.vertAlign = 'subscript';
    if (Object.keys(font).length) style.font = font;
    if (s.bg && s.bg.rgb) style.fill = { type: 'pattern', pattern: 'solid', fgColor: toExcelColor(s.bg) };
    if (s.bd) {
      const border = {};
      for (const [side, key] of Object.entries(SIDES)) {
        const b = s.bd[key];
        if (b && BORDER_NAMES[b.s]) border[side] = { style: BORDER_NAMES[b.s], color: toExcelColor(b.cl) || { argb: 'FF000000' } };
      }
      if (Object.keys(border).length) style.border = border;
    }
    const alignment = {};
    const h = Object.keys(HORIZONTAL).find((k) => HORIZONTAL[k] === s.ht);
    if (h) alignment.horizontal = h;
    if (s.vt === 1) alignment.vertical = 'top';
    if (s.vt === 2) alignment.vertical = 'middle';
    if (s.vt === 3) alignment.vertical = 'bottom';
    if (s.tb === WRAP) alignment.wrapText = true;
    if (s.tr && s.tr.v) alignment.textRotation = 'vertical';
    else if (s.tr && s.tr.a) alignment.textRotation = s.tr.a < 0 ? 90 - s.tr.a : s.tr.a;
    if (Object.keys(alignment).length) style.alignment = alignment;
    if (s.n && s.n.pattern) style.numFmt = s.n.pattern;
    return style;
  }

  // ---- import ----------------------------------------------------------------------------------

  /** Convert a loaded ExcelJS workbook to Univer workbook data (IWorkbookData). */
  function fromExcelJS(workbook, name = 'Workbook') {
    const theme = themeColors(workbook);
    const styles = {};
    const styleIds = new Map();
    const styleId = (style) => {
      const s = toUniverStyle(style || {}, theme);
      if (!Object.keys(s).length) return undefined;
      const key = JSON.stringify(s);
      if (!styleIds.has(key)) {
        const id = 's' + styleIds.size;
        styleIds.set(key, id);
        styles[id] = s;
      }
      return styleIds.get(key);
    };
    const sheets = {};
    const sheetOrder = [];
    const cfRules = {};
    const dvRules = {};
    workbook.worksheets.forEach((ws, index) => {
      const id = 'sheet' + (index + 1);
      const cellData = {};
      const rowData = {};
      const columnData = {};
      const shared = {}; // master address -> formula id
      let formulaIds = 0;
      ws.eachRow({ includeEmpty: true }, (row, r) => {
        if (row.height || row.hidden) rowData[r - 1] = { ...(row.height ? { h: Math.round((row.height * 96) / 72) } : {}), ...(row.hidden ? { hd: 1 } : {}) };
        row.eachCell({ includeEmpty: true }, (cell, c) => {
          const data = {};
          const s = styleId(cell.style);
          if (s) data.s = s;
          const v = cell.value;
          const T = ExcelJS.ValueType;
          switch (cell.type) {
            case T.Merge:
            case T.Null:
              break;
            case T.Number: data.v = v; data.t = CellValueType.NUMBER; break;
            case T.String:
            case T.SharedString: data.v = String(v); data.t = CellValueType.STRING; break;
            case T.Date: data.v = dateToSerial(v); data.t = CellValueType.NUMBER; break;
            case T.Boolean: data.v = v ? 1 : 0; data.t = CellValueType.BOOLEAN; break;
            case T.RichText: data.v = v.richText.map((run) => run.text).join(''); data.t = CellValueType.STRING; break;
            case T.Hyperlink: data.v = typeof v.text === 'string' ? v.text : (v.text && v.text.richText ? v.text.richText.map((x) => x.text).join('') : v.hyperlink); data.t = CellValueType.STRING; break;
            case T.Error: data.v = v.error; data.t = CellValueType.STRING; break;
            case T.Formula: {
              if (v.sharedFormula) { // follower of a shared formula
                const master = ws.getCell(v.sharedFormula);
                if (!shared[master.address]) shared[master.address] = 'f' + id + '_' + (formulaIds++);
                data.si = shared[master.address];
              } else {
                data.f = '=' + v.formula;
                if (v.shareType === 'shared') {
                  if (!shared[cell.address]) shared[cell.address] = 'f' + id + '_' + (formulaIds++);
                  data.si = shared[cell.address];
                }
              }
              const result = v.result;
              if (result instanceof Date) { data.v = dateToSerial(result); data.t = CellValueType.NUMBER; } else if (typeof result === 'number') { data.v = result; data.t = CellValueType.NUMBER; } else if (typeof result === 'boolean') { data.v = result ? 1 : 0; data.t = CellValueType.BOOLEAN; } else if (typeof result === 'string') { data.v = result; data.t = CellValueType.STRING; } else if (result && result.error) { data.v = result.error; }
              break;
            }
            default:
              if (v !== null && v !== undefined) { data.v = String(v); data.t = CellValueType.STRING; }
          }
          if (Object.keys(data).length) (cellData[r - 1] = cellData[r - 1] || {})[c - 1] = data;
        });
      });
      // a master cell may come after a follower in reading order: make sure every master has its id
      for (const [address, si] of Object.entries(shared)) {
        const { startRow, startColumn } = parseRange(address);
        const cell = cellData[startRow] && cellData[startRow][startColumn];
        if (cell) cell.si = si;
      }
      (ws.columns || []).forEach((col, c) => {
        const entry = {};
        if (col.width) entry.w = Math.round(col.width * 7 + 5);
        if (col.hidden) entry.hd = 1;
        if (Object.keys(entry).length) columnData[c] = entry;
      });
      const view = (ws.views && ws.views[0]) || {};
      const freeze = view.state === 'frozen' && (view.xSplit || view.ySplit)
        ? { xSplit: view.xSplit || 0, ySplit: view.ySplit || 0, startRow: view.ySplit || 0, startColumn: view.xSplit || 0 }
        : undefined;
      const merges = ((ws.model && ws.model.merges) || []).map(parseRange);
      const tab = ws.properties && ws.properties.tabColor && toUniverColor(ws.properties.tabColor, theme);
      cfRules[id] = importConditionalFormats(ws, id, theme);
      dvRules[id] = importValidations(ws, id);
      sheets[id] = {
        id,
        name: ws.name,
        hidden: ws.state === 'hidden' || ws.state === 'veryHidden' ? 1 : 0,
        ...(tab ? { tabColor: tab.rgb } : {}),
        ...(freeze ? { freeze } : {}),
        ...(view.showGridLines === false ? { showGridlines: 0 } : {}),
        rowCount: Math.max(1000, ws.rowCount + 100),
        columnCount: Math.max(26, ws.columnCount + 10),
        defaultColumnWidth: ws.properties && ws.properties.defaultColWidth ? Math.round(ws.properties.defaultColWidth * 7 + 5) : DEFAULT_COLUMN_WIDTH,
        defaultRowHeight: ws.properties && ws.properties.defaultRowHeight ? Math.round((ws.properties.defaultRowHeight * 96) / 72) : DEFAULT_ROW_HEIGHT,
        mergeData: merges,
        cellData,
        rowData,
        columnData,
      };
      sheetOrder.push(id);
    });
    const resources = [];
    if (Object.values(cfRules).some((x) => x.length)) resources.push({ name: CF_RESOURCE, data: JSON.stringify(cfRules) });
    if (Object.values(dvRules).some((x) => x.length)) resources.push({ name: DV_RESOURCE, data: JSON.stringify(dvRules) });
    return { id: 'workbook-' + Math.random().toString(36).slice(2), name, appVersion: '1.0.0', locale: 'enUS', styles, sheetOrder, sheets, resources };
  }

  // ---- conditional formatting and data validation ---------------------------------------------------

  const univerRanges = (ref, sheetId) => String(ref || '').split(/\s+/).filter(Boolean).map((r) => ({ ...parseRange(r.replace(/\$/g, '')), rangeType: 0, sheetId }));
  const excelRef = (ranges) => ranges.map((r) => (r.startRow === r.endRow && r.startColumn === r.endColumn
    ? columnName(r.startColumn) + (r.startRow + 1)
    : columnName(r.startColumn) + (r.startRow + 1) + ':' + columnName(r.endColumn) + (r.endRow + 1))).join(' ');
  const hexOf = (color, theme) => { const c = color && toUniverColor(color, theme); return c ? c.rgb : undefined; };
  const argbOf = (rgb) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(rgb || '').trim()); if (m) return { argb: 'FF' + m[1].toUpperCase() }; const r = /rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(rgb || ''); return r ? { argb: 'FF' + r.slice(1, 4).map((v) => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase() } : undefined; };
  const number = (v) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

  /** The differential style of an Excel rule as a Univer style. */
  function cfStyle(style, theme) {
    if (!style) return {};
    const out = {};
    const fill = style.fill;
    const bg = fill && hexOf(fill.bgColor || fill.fgColor, theme);
    if (bg) out.bg = { rgb: bg };
    const font = style.font || {};
    const cl = hexOf(font.color, theme);
    if (cl) out.cl = { rgb: cl };
    if (font.bold) out.bl = 1;
    if (font.italic) out.it = 1;
    if (font.underline) out.ul = { s: 1 };
    if (font.strike) out.st = { s: 1 };
    return out;
  }

  function excelDxf(style) {
    if (!style) return undefined;
    const out = {};
    const bg = style.bg && argbOf(style.bg.rgb);
    if (bg) out.fill = { type: 'pattern', pattern: 'solid', bgColor: bg };
    const font = {};
    const cl = style.cl && argbOf(style.cl.rgb);
    if (cl) font.color = cl;
    if (style.bl) font.bold = true;
    if (style.it) font.italic = true;
    if (style.ul && style.ul.s) font.underline = true;
    if (style.st && style.st.s) font.strike = true;
    if (Object.keys(font).length) out.font = font;
    return out;
  }

  const cfvoToUniver = (v) => ({ type: CF_VALUE_TYPES[v && v.type] || 'num', ...(v && v.value !== undefined ? { value: number(v.value) ?? v.value } : {}) });
  const cfvoToExcel = (v) => ({ type: (v && v.type) || 'num', ...(v && v.value !== undefined && v.value !== null && v.value !== '' ? { value: v.value } : {}) });

  /** Excel rules (ExcelJS) of a sheet -> Univer conditional formatting rules. Icon sets are not taken over. */
  function importConditionalFormats(ws, sheetId, theme) {
    const out = [];
    const list = [...(ws.conditionalFormattings || [])].flatMap((cf) => (cf.rules || []).map((rule) => ({ ref: cf.ref, rule }))).sort((a, b) => (a.rule.priority || 0) - (b.rule.priority || 0));
    for (const { ref, rule } of list) {
      const ranges = univerRanges(ref, sheetId);
      if (!ranges.length) continue;
      const topLeft = columnName(ranges[0].startColumn) + (ranges[0].startRow + 1);
      const style = cfStyle(rule.style, theme);
      let r = null;
      const f = rule.formulae || [];
      switch (rule.type) {
        case 'cellIs': {
          const nums = f.map(number);
          if (nums.every((x) => x !== null)) r = { type: 'highlightCell', subType: 'number', operator: rule.operator, value: /between/i.test(rule.operator) ? [nums[0], nums[1]] : nums[0], style };
          else if (f.length === 1 && /^".*"$/.test(String(f[0])) && (rule.operator === 'equal' || rule.operator === 'notEqual')) r = { type: 'highlightCell', subType: 'text', operator: rule.operator, value: String(f[0]).slice(1, -1), style };
          else {
            const ops = { equal: '=', notEqual: '<>', greaterThan: '>', lessThan: '<', greaterThanOrEqual: '>=', lessThanOrEqual: '<=' };
            if (ops[rule.operator]) r = { type: 'highlightCell', subType: 'formula', value: `=${topLeft}${ops[rule.operator]}${f[0]}`, style };
          }
          break;
        }
        case 'containsText': {
          // ExcelJS writes the rule without its text attribute: then the text comes from the formula
          const m = /"((?:[^"]|"")*)"/.exec(String(f[0] || ''));
          const text = rule.text != null ? rule.text : m ? m[1].replace(/""/g, '"') : '';
          r = { type: 'highlightCell', subType: 'text', operator: TEXT_OPERATORS[rule.operator] || 'containsText', value: text, style };
          break;
        }
        case 'expression': r = { type: 'highlightCell', subType: 'formula', value: '=' + String(f[0] || '').replace(/^=/, ''), style }; break;
        case 'timePeriod': r = { type: 'highlightCell', subType: 'timePeriod', operator: rule.timePeriod, style }; break;
        case 'top10': r = { type: 'highlightCell', subType: 'rank', isTop: !rule.bottom, isPercent: !!rule.percent, value: rule.rank || 10, style }; break;
        case 'aboveAverage': r = { type: 'highlightCell', subType: 'average', operator: (rule.aboveAverage === false ? 'lessThan' : 'greaterThan') + (rule.equalAverage ? 'OrEqual' : ''), style }; break;
        case 'duplicateValues': r = { type: 'highlightCell', subType: 'duplicateValues', style }; break;
        case 'uniqueValues': r = { type: 'highlightCell', subType: 'uniqueValues', style }; break;
        case 'colorScale': r = { type: 'colorScale', config: (rule.cfvo || []).map((v, index) => ({ index, color: hexOf((rule.color || [])[index], theme) || '#ffffff', value: cfvoToUniver(v) })) }; break;
        case 'dataBar': {
          const [min, max] = rule.cfvo || [{ type: 'min' }, { type: 'max' }];
          r = { type: 'dataBar', config: { min: cfvoToUniver(min), max: cfvoToUniver(max), positiveColor: hexOf(rule.color, theme) || '#638EC6', nativeColor: '#FF0000', isGradient: rule.gradient !== false } };
          break;
        }
        default: break;
      }
      if (r) out.push({ cfId: uid(), ranges, stopIfTrue: !!rule.stopIfTrue, rule: r });
    }
    return out;
  }

  /** Univer conditional formatting rules of a sheet -> ExcelJS (worksheet.addConditionalFormatting). */
  function exportConditionalFormats(ws, rules) {
    let priority = 1;
    for (const cf of rules || []) {
      const r = cf.rule || {};
      const ranges = cf.ranges || [];
      if (!ranges.length) continue;
      const ref = excelRef(ranges);
      const topLeft = columnName(ranges[0].startColumn) + (ranges[0].startRow + 1);
      const abs = '$' + columnName(ranges[0].startColumn) + '$' + (ranges[0].startRow + 1) + ':$' + columnName(ranges[0].endColumn) + '$' + (ranges[0].endRow + 1);
      const style = excelDxf(r.style);
      let rule = null;
      if (r.type === 'highlightCell') {
        switch (r.subType) {
          case 'number': rule = { type: 'cellIs', operator: r.operator, formulae: Array.isArray(r.value) ? r.value.map(String) : [String(r.value)], style }; break;
          case 'text': {
            const v = String(r.value ?? '');
            const q = v.replace(/"/g, '""');
            if (r.operator === 'equal' || r.operator === 'notEqual') rule = { type: 'cellIs', operator: r.operator, formulae: [`"${q}"`], style };
            else if (r.operator === 'containsBlanks') rule = { type: 'expression', formulae: [`LEN(TRIM(${topLeft}))=0`], style };
            else if (r.operator === 'notContainsBlanks') rule = { type: 'expression', formulae: [`LEN(TRIM(${topLeft}))>0`], style };
            else if (r.operator === 'containsErrors') rule = { type: 'expression', formulae: [`ISERROR(${topLeft})`], style };
            else if (r.operator === 'notContainsErrors') rule = { type: 'expression', formulae: [`NOT(ISERROR(${topLeft}))`], style };
            else {
              const op = Object.keys(TEXT_OPERATORS).find((k) => TEXT_OPERATORS[k] === r.operator) || 'containsText';
              const formula = { containsText: `NOT(ISERROR(SEARCH("${q}",${topLeft})))`, notContains: `ISERROR(SEARCH("${q}",${topLeft}))`, beginsWith: `LEFT(${topLeft},${v.length})="${q}"`, endsWith: `RIGHT(${topLeft},${v.length})="${q}"` }[op];
              rule = { type: 'containsText', operator: op, text: v, formulae: [formula], style };
            }
            break;
          }
          case 'formula': rule = { type: 'expression', formulae: [String(r.value || '').replace(/^=/, '')], style }; break;
          case 'timePeriod': rule = { type: 'timePeriod', timePeriod: r.operator, style }; break;
          case 'rank': rule = { type: 'top10', rank: Number(r.value) || 10, percent: !!r.isPercent, bottom: !r.isTop, style }; break;
          case 'average': rule = { type: 'aboveAverage', aboveAverage: /greater/i.test(r.operator || 'greaterThan'), ...(/OrEqual/.test(r.operator || '') ? { equalAverage: true } : {}), style }; break;
          case 'duplicateValues': rule = { type: 'expression', formulae: [`COUNTIF(${abs},${topLeft})>1`], style }; break;
          case 'uniqueValues': rule = { type: 'expression', formulae: [`COUNTIF(${abs},${topLeft})=1`], style }; break;
          default: break;
        }
      } else if (r.type === 'colorScale') {
        const config = [...(r.config || [])].sort((a, b) => a.index - b.index);
        rule = { type: 'colorScale', cfvo: config.map((c) => cfvoToExcel(c.value)), color: config.map((c) => argbOf(c.color) || { argb: 'FFFFFFFF' }) };
      } else if (r.type === 'dataBar') {
        const c = r.config || {};
        rule = { type: 'dataBar', cfvo: [cfvoToExcel(c.min || { type: 'min' }), cfvoToExcel(c.max || { type: 'max' })], color: argbOf(c.positiveColor) || { argb: 'FF638EC6' }, gradient: c.isGradient !== false };
      }
      if (!rule) continue;
      rule.priority = priority++;
      if (cf.stopIfTrue) rule.stopIfTrue = true;
      ws.addConditionalFormatting({ ref, rules: [rule] });
    }
  }

  /** ExcelJS data validations (one entry per cell) -> Univer rules (equal settings joined into column runs). */
  function importValidations(ws, sheetId) {
    const model = (ws.dataValidations && ws.dataValidations.model) || {};
    const groups = new Map();
    for (const [address, v] of Object.entries(model)) {
      if (!v || !v.type || v.type === 'any') continue;
      const key = JSON.stringify(v);
      if (!groups.has(key)) groups.set(key, { v, cells: [] });
      for (const a of address.replace(/^range:/, '').split(/\s+/)) groups.get(key).cells.push(parseRange(a.replace(/\$/g, '')));
    }
    const out = [];
    for (const { v, cells } of groups.values()) {
      // join vertically adjacent single cells of a column into ranges
      const ranges = [];
      for (const c of cells.sort((a, b) => a.startColumn - b.startColumn || a.startRow - b.startRow)) {
        const last = ranges[ranges.length - 1];
        if (last && last.startColumn === c.startColumn && last.endColumn === c.endColumn && c.startRow === last.endRow + 1) last.endRow = c.endRow;
        else ranges.push({ ...c, rangeType: 0, sheetId });
      }
      const f = (v.formulae || []).map((x) => (x instanceof Date ? dateToSerial(x) : x));
      let formula1 = f[0] !== undefined ? String(f[0]) : undefined;
      if (v.type === 'list' && formula1 !== undefined) formula1 = /^".*"$/.test(formula1) ? formula1.slice(1, -1) : '=' + formula1.replace(/^=/, '');
      if (v.type === 'custom' && formula1 !== undefined) formula1 = '=' + formula1.replace(/^=/, '');
      out.push({
        uid: uid(), ranges, type: v.type, ...(v.operator ? { operator: v.operator } : (['whole', 'decimal', 'date', 'time', 'textLength'].includes(v.type) ? { operator: 'between' } : {})),
        ...(formula1 !== undefined ? { formula1 } : {}), ...(f[1] !== undefined ? { formula2: String(f[1]) } : {}),
        allowBlank: v.allowBlank !== false, ...(v.type === 'list' ? { showDropDown: true } : {}),
        showErrorMessage: !!v.showErrorMessage, showInputMessage: !!v.showInputMessage,
        ...(v.errorStyle ? { errorStyle: DV_ERROR_STYLE[v.errorStyle] ?? 1 } : {}),
        ...(v.errorTitle ? { errorTitle: v.errorTitle } : {}), ...(v.error ? { error: v.error } : {}),
        ...(v.promptTitle ? { promptTitle: v.promptTitle } : {}), ...(v.prompt ? { prompt: v.prompt } : {}),
      });
    }
    return out;
  }

  /** Univer data validation rules -> ExcelJS (per cell, or per range for large ranges). */
  function exportValidations(ws, rules) {
    for (const r of rules || []) {
      const type = r.type === 'listMultiple' ? 'list' : r.type === 'checkbox' ? null : r.type;
      if (!type || type === 'any' || type === 'none') continue;
      let f1 = r.formula1;
      if (type === 'list' && f1 !== undefined) {
        if (/^\s*\[/.test(f1)) { try { f1 = JSON.parse(f1).join(','); } catch (e) { /* keep */ } }
        f1 = /^=/.test(f1) ? f1.slice(1) : `"${String(f1).replace(/"/g, '')}"`;
      } else if (f1 !== undefined) f1 = String(f1).replace(/^=/, '');
      const formulae = [f1, r.formula2 !== undefined && r.formula2 !== '' ? String(r.formula2).replace(/^=/, '') : undefined].filter((x) => x !== undefined);
      const v = {
        type, formulae: formulae.map((x) => (type !== 'list' && type !== 'custom' && number(x) !== null ? number(x) : x)),
        ...(r.operator && type !== 'list' && type !== 'custom' ? { operator: r.operator } : {}),
        allowBlank: r.allowBlank !== false, showErrorMessage: r.showErrorMessage !== false, showInputMessage: !!r.showInputMessage,
        ...(r.errorStyle !== undefined ? { errorStyle: DV_ERROR_NAMES[r.errorStyle] || 'stop' } : {}),
        ...(r.errorTitle ? { errorTitle: r.errorTitle } : {}), ...(r.error ? { error: r.error } : {}),
        ...(r.promptTitle ? { promptTitle: r.promptTitle } : {}), ...(r.prompt ? { prompt: r.prompt } : {}),
      };
      for (const range of r.ranges || []) {
        const cells = (range.endRow - range.startRow + 1) * (range.endColumn - range.startColumn + 1);
        if (cells > 20000) { ws.dataValidations.add(excelRef([range]), { ...v }); continue; }
        for (let row = range.startRow; row <= range.endRow; row++) {
          for (let col = range.startColumn; col <= range.endColumn; col++) ws.getCell(row + 1, col + 1).dataValidation = { ...v };
        }
      }
    }
  }

  /** The rules of a plugin resource ({ sheetId: [rules] }), or {}. */
  function resource(data, name) {
    const r = (data.resources || []).find((x) => x.name === name);
    if (!r || !r.data) return {};
    try { return JSON.parse(r.data) || {}; } catch (e) { return {}; }
  }

  async function importXlsx(buffer, name) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    return fromExcelJS(workbook, name);
  }

  /** Convert any format SheetJS can read to XLSX (values, formulas, merges, column widths). */
  function convertWithSheetJS(buffer, bookType, options = {}) {
    const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', cellFormula: true, cellStyles: true, cellNF: true, dense: false });
    return XLSX.write(wb, { type: 'array', bookType, cellStyles: true, ...options });
  }

  /** Import rows of values (numbers, strings, booleans, Dates, null) as a one-sheet workbook. */
  async function importRows(rows, name, sheetName = 'Sheet1') {
    // Dates (UTC wall times from the CSV parser) become serial numbers with a date format (SheetJS would use the local zone)
    const formats = [];
    const values = rows.map((r, y) => r.map((v, x) => {
      if (!(v instanceof Date)) return v;
      formats.push([x, y, v.getUTCHours() || v.getUTCMinutes() || v.getUTCSeconds() ? 'yyyy-mm-dd hh:mm' : 'yyyy-mm-dd']);
      return (v.getTime() - EXCEL_EPOCH) / 86400000;
    }));
    const ws = XLSX.utils.aoa_to_sheet(values);
    for (const [c, r, z] of formats) ws[XLSX.utils.encode_cell({ c, r })].z = z;
    const widths = [];
    for (const r of rows.slice(0, 200)) r.forEach((v, i) => { widths[i] = Math.max(widths[i] || 6, Math.min(50, String(v ?? '').length + 2)); });
    ws['!cols'] = widths.map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    return importXlsx(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), name);
  }

  /** Import a spreadsheet file (ArrayBuffer) by its file name extension. Resolves to IWorkbookData. */
  async function importFile(buffer, filename) {
    const name = filename.replace(/\.[^.]+$/, '');
    if (/\.(xlsx|xlsm)$/i.test(filename)) return importXlsx(buffer, name);
    return importXlsx(convertWithSheetJS(buffer, 'xlsx'), name);
  }

  // ---- export ----------------------------------------------------------------------------------

  function cellStyle(data, styles) {
    if (!data.s) return null;
    return typeof data.s === 'string' ? styles[data.s] || null : data.s;
  }

  /** Convert Univer workbook data (IWorkbookData, e.g. from workbook.save()) to an ExcelJS workbook. */
  function toExcelJS(data) {
    const workbook = new ExcelJS.Workbook();
    const styles = data.styles || {};
    const cfRules = resource(data, CF_RESOURCE);
    const dvRules = resource(data, DV_RESOURCE);
    for (const id of data.sheetOrder) {
      const sheet = data.sheets[id];
      const freeze = sheet.freeze && (sheet.freeze.xSplit > 0 || sheet.freeze.ySplit > 0) ? sheet.freeze : null;
      const ws = workbook.addWorksheet(sheet.name, {
        state: sheet.hidden ? 'hidden' : 'visible',
        properties: sheet.tabColor ? { tabColor: toExcelColor({ rgb: sheet.tabColor }) } : {},
        views: [{
          ...(freeze ? { state: 'frozen', xSplit: freeze.xSplit, ySplit: freeze.ySplit } : {}),
          ...(sheet.showGridlines === 0 ? { showGridLines: false } : {}),
        }],
      });
      for (const [c, col] of Object.entries(sheet.columnData || {})) {
        const column = ws.getColumn(Number(c) + 1);
        if (col.w) column.width = Math.max(0, (col.w - 5) / 7);
        if (col.hd) column.hidden = true;
      }
      for (const [r, row] of Object.entries(sheet.rowData || {})) {
        const excelRow = ws.getRow(Number(r) + 1);
        if (row.h && row.h !== sheet.defaultRowHeight) excelRow.height = (row.h * 72) / 96;
        if (row.hd) excelRow.hidden = true;
      }
      const cells = sheet.cellData || {};
      const masters = {}; // formula id -> {row, column, formula}
      for (const [r, row] of Object.entries(cells)) {
        for (const [c, cell] of Object.entries(row || {})) {
          if (cell && cell.si && cell.f) masters[cell.si] = { row: Number(r), column: Number(c), formula: cell.f };
        }
      }
      for (const [r, row] of Object.entries(cells)) {
        for (const [c, cell] of Object.entries(row || {})) {
          if (!cell) continue;
          const excelCell = ws.getCell(Number(r) + 1, Number(c) + 1);
          let formula = cell.f;
          if (!formula && cell.si && masters[cell.si]) {
            const m = masters[cell.si];
            formula = '=' + shiftFormula(m.formula.replace(/^=/, ''), Number(r) - m.row, Number(c) - m.column);
          }
          const isBool = cell.t === CellValueType.BOOLEAN;
          const value = cell.v === undefined || cell.v === null ? undefined
            : isBool ? (cell.v === true || cell.v === 1 || cell.v === '1' || String(cell.v).toUpperCase() === 'TRUE')
              : cell.t === CellValueType.NUMBER && typeof cell.v !== 'number' && cell.v !== '' && !Number.isNaN(Number(cell.v)) ? Number(cell.v)
                : cell.v;
          if (formula) excelCell.value = { formula: formula.replace(/^=/, ''), result: value };
          else if (value !== undefined && value !== '') excelCell.value = value;
          const s = cellStyle(cell, styles);
          if (s) excelCell.style = toExcelStyle(s);
        }
      }
      for (const m of sheet.mergeData || []) ws.mergeCells(m.startRow + 1, m.startColumn + 1, m.endRow + 1, m.endColumn + 1);
      exportConditionalFormats(ws, cfRules[id]);
      exportValidations(ws, dvRules[id]);
    }
    return workbook;
  }

  async function exportXlsx(data) {
    return new Uint8Array(await toExcelJS(data).xlsx.writeBuffer());
  }

  /** Export to 'xlsx', 'ods' or 'csv' (CSV: first sheet). Resolves to a Uint8Array. */
  async function exportFile(data, format, { separator = ',' } = {}) {
    const xlsx = await exportXlsx(data);
    if (format === 'csv') return new Uint8Array(convertWithSheetJS(xlsx, 'csv', { FS: separator }));
    if (format === 'xlsx') return xlsx;
    return new Uint8Array(convertWithSheetJS(xlsx, format));
  }

  Suite.univerXlsx = { importXlsx, importRows, importFile, exportXlsx, exportFile, fromExcelJS, toExcelJS, shiftFormula };
})(window.Suite = window.Suite || {});
