/*
 * Row and column groups (outline) for the spreadsheet. Univer's free packages have no grouping (it is part of Univer Pro), so:
 *   - the outline level of a row or column is kept in its custom data (rowData[r].custom.outline, columnData[c].custom.outline),
 *     written with Univer's undoable set-row-data / set-col-data commands; Univer moves it along when rows or columns are
 *     inserted, removed or moved, and univer-xlsx.js reads and writes it as Excel's outlineLevel;
 *   - collapsing a group hides its rows or columns, expanding shows them again;
 *   - the row and column headers show the outline: "│" per level in front of a grouped row or column, and ⊟ (expanded) or ⊞
 *     (collapsed) at the summary row below a group or the summary column right of it, as in Excel.
 *
 *   SSOutline.install(univerAPI, () => workbook) adds Data → Group and keeps the headers up to date
 *   SSOutline.locales.en / .de: menu texts for Univer's locales
 *   SSOutline.levels(levelsByIndex, index) and SSOutline.span(...): the pure helpers (exported for tests)
 */
(function () {
  'use strict';

  const MAX = 7; // Excel's deepest outline level
  const ROW_HEADER = 46; // Univer's default row header width (px)

  const locales = {
    en: { 'ss-outline': { group: 'Group', groupRows: 'Group rows', ungroupRows: 'Ungroup rows', groupColumns: 'Group columns', ungroupColumns: 'Ungroup columns',
      collapse: 'Hide details', expand: 'Show details', clear: 'Remove all groups of the sheet' } },
    de: { 'ss-outline': { group: 'Gruppieren', groupRows: 'Zeilen gruppieren', ungroupRows: 'Zeilengruppierung aufheben', groupColumns: 'Spalten gruppieren',
      ungroupColumns: 'Spaltengruppierung aufheben', collapse: 'Details ausblenden', expand: 'Details einblenden', clear: 'Alle Gruppen des Blatts entfernen' } },
  };

  const levelOf = (data, i) => { const e = data && data[i]; return (e && e.custom && e.custom.outline) || 0; };
  const hiddenOf = (data, i) => { const e = data && data[i]; return !!(e && e.hd); };

  /** [first, last] of the group around `index` at `level`: the neighbouring rows (columns) whose level is at least `level`. */
  function span(data, index, level) {
    let a = index, b = index;
    while (a > 0 && levelOf(data, a - 1) >= level) a--;
    while (levelOf(data, b + 1) >= level) b++;
    return [a, b];
  }

  /** The group that `index` belongs to, or whose summary row (column) it is: { level, first, last } or null. */
  function groupAt(data, index) {
    const own = levelOf(data, index), before = index > 0 ? levelOf(data, index - 1) : 0;
    if (before > own) { const [first, last] = span(data, index - 1, before); return { level: before, first, last }; } // summary below / right
    if (own) { const [first, last] = span(data, index, own); return { level: own, first, last }; }
    return null;
  }

  /** Header labels: { index: text } for the grouped rows/columns and their summary rows/columns, and the deepest level. */
  function labels(data, name) {
    const out = {};
    let deepest = 0;
    for (const key of Object.keys(data || {})) {
      const i = Number(key), level = levelOf(data, i);
      if (level) { out[i] = '│'.repeat(level) + ' ' + name(i); deepest = Math.max(deepest, level); }
      // the row (column) after a group is its summary: ⊟ when the group is shown, ⊞ when it is hidden
      if (level > levelOf(data, i + 1)) out[i + 1] = (hiddenOf(data, i) ? '⊞ ' : '⊟ ') + name(i + 1);
    }
    return { labels: out, deepest };
  }

  const columnName = (i) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

  function install(univerAPI, workbookOf) {
    const sheetModel = (ws) => ws.getSheet().getConfig();
    const dataOf = (ws, kind) => (kind === 'rows' ? sheetModel(ws).rowData : sheetModel(ws).columnData) || {};

    function setLevels(ws, kind, levels) {
      const data = dataOf(ws, kind);
      const changes = {};
      for (const [i, level] of Object.entries(levels)) {
        const custom = { ...((data[i] && data[i].custom) || {}) };
        if (level > 0) custom.outline = level; else delete custom.outline;
        changes[i] = { custom: Object.keys(custom).length ? custom : null };
      }
      const wb = workbookOf();
      const params = { unitId: wb.getId(), subUnitId: ws.getSheetId(), [kind === 'rows' ? 'rowData' : 'columnData']: changes };
      return univerAPI.executeCommand(kind === 'rows' ? 'sheet.command.set-row-data' : 'sheet.command.set-col-data', params);
    }

    const active = () => {
      const ws = workbookOf().getActiveSheet();
      const range = ws.getSelection() && ws.getSelection().getActiveRange();
      return range && { ws, range };
    };

    async function regroup(kind, step) {
      const a = active();
      if (!a) return;
      const data = dataOf(a.ws, kind);
      const [first, last] = kind === 'rows' ? [a.range.getRow(), a.range.getLastRow()] : [a.range.getColumn(), a.range.getLastColumn()];
      if (last - first > 100000) return;
      const levels = {};
      for (let i = first; i <= last; i++) levels[i] = Math.max(0, Math.min(MAX, levelOf(data, i) + step));
      await setLevels(a.ws, kind, levels);
      refresh();
    }

    /** Hide or show the group at the active cell: rows first, then columns. */
    async function toggle(show) {
      const a = active();
      if (!a) return;
      for (const kind of ['rows', 'columns']) {
        const data = dataOf(a.ws, kind);
        const g = groupAt(data, kind === 'rows' ? a.range.getRow() : a.range.getColumn());
        if (!g) continue;
        const count = g.last - g.first + 1;
        if (kind === 'rows') {
          if (show) a.ws.showRows(g.first, count);
          else { a.ws.hideRows(g.first, count); a.ws.getRange(g.last + 1, a.range.getColumn()).activate(); } // (onto the summary row)
        } else if (show) a.ws.showColumns(g.first, count);
        else { a.ws.hideColumns(g.first, count); a.ws.getRange(a.range.getRow(), g.last + 1).activate(); }
        refresh();
        return;
      }
    }

    async function clear() {
      const ws = workbookOf().getActiveSheet();
      for (const kind of ['rows', 'columns']) {
        const data = dataOf(ws, kind);
        const grouped = Object.keys(data).map(Number).filter((i) => levelOf(data, i));
        if (!grouped.length) continue;
        // hidden grouped rows (columns) are shown again, run by run
        const hidden = grouped.filter((i) => hiddenOf(data, i));
        for (let k = 0; k < hidden.length;) {
          let n = 1;
          while (hidden[k + n] === hidden[k] + n) n++;
          if (kind === 'rows') ws.showRows(hidden[k], n); else ws.showColumns(hidden[k], n);
          k += n;
        }
        await setLevels(ws, kind, Object.fromEntries(grouped.map((i) => [i, 0])));
      }
      refresh();
    }

    const customized = new Set(); // sheets whose headers show an outline
    function refresh() {
      const wb = workbookOf();
      if (!wb) return;
      for (const ws of wb.getSheets()) {
        const key = wb.getId() + '/' + ws.getSheetId();
        const rows = labels(dataOf(ws, 'rows'), (i) => String(i + 1));
        const columns = labels(dataOf(ws, 'columns'), columnName);
        const any = Object.keys(rows.labels).length || Object.keys(columns.labels).length;
        if (!any && !customized.has(key)) continue;
        try {
          ws.customizeRowHeader({ headerStyle: { size: ROW_HEADER + 7 * rows.deepest + (rows.deepest ? 8 : 0) }, rowsCfg: rows.labels });
          ws.customizeColumnHeader({ columnsCfg: columns.labels });
        } catch (e) { continue; } // (no render unit yet: refreshed again on the next change)
        if (any) customized.add(key); else customized.delete(key);
      }
    }

    let pending = 0;
    const later = () => { clearTimeout(pending); pending = setTimeout(refresh, 30); };
    univerAPI.addEvent(univerAPI.Event.CommandExecuted, (event) => { if (event.type === 2 || /active-sheet|set-worksheet-activate/.test(event.id)) later(); });

    // Data → Group (after sort and filter: on narrow screens the last buttons move into the ribbon's overflow menu)
    const items = [
      ['group-rows', 'groupRows', () => regroup('rows', 1)], ['ungroup-rows', 'ungroupRows', () => regroup('rows', -1)],
      ['group-columns', 'groupColumns', () => regroup('columns', 1)], ['ungroup-columns', 'ungroupColumns', () => regroup('columns', -1)],
      ['collapse', 'collapse', () => toggle(false)], ['expand', 'expand', () => toggle(true)], ['clear', 'clear', clear],
    ];
    SSMenu.submenu(univerAPI, { id: 'ss-outline-menu', title: 'ss-outline.group', icon: 'SSOutlineIcon', order: 10, // (icon registered by main.js)
      items: items.map(([id, title, action]) => ['ss-outline-' + id, 'ss-outline.' + title, action]) });

    return { refresh, regroup, toggle, clear };
  }

  window.SSOutline = { install, locales, span, groupAt, labels, MAX };
})();
