/*
 * Spreadsheet: Univer Sheets (formulas, formatting, sheets, sorting, filters …) with file import/export in
 * shared/js/univer-xlsx.js (XLSX/XLSM with ExcelJS, ODS/XLS/CSV with SheetJS) and the suite shell (open, save back, recent).
 */
import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import enUS from '@univerjs/preset-sheets-core/locales/en-US';
import deDE from '@univerjs/preset-sheets-core/locales/de-DE';
import { UniverSheetsConditionalFormattingPreset } from '@univerjs/preset-sheets-conditional-formatting';
import cfEnUS from '@univerjs/preset-sheets-conditional-formatting/locales/en-US';
import cfDeDE from '@univerjs/preset-sheets-conditional-formatting/locales/de-DE';
import { UniverSheetsDataValidationPreset } from '@univerjs/preset-sheets-data-validation';
import dvEnUS from '@univerjs/preset-sheets-data-validation/locales/en-US';
import dvDeDE from '@univerjs/preset-sheets-data-validation/locales/de-DE';
import { UniverSheetsDrawingPreset } from '@univerjs/preset-sheets-drawing';
import drawingEnUS from '@univerjs/preset-sheets-drawing/locales/en-US';
import drawingDeDE from '@univerjs/preset-sheets-drawing/locales/de-DE';
import { UniverSheetsSortPreset } from '@univerjs/preset-sheets-sort';
import sortEnUS from '@univerjs/preset-sheets-sort/locales/en-US';
import sortDeDE from '@univerjs/preset-sheets-sort/locales/de-DE';
import { UniverSheetsFilterPreset } from '@univerjs/preset-sheets-filter';
import filterEnUS from '@univerjs/preset-sheets-filter/locales/en-US';
import filterDeDE from '@univerjs/preset-sheets-filter/locales/de-DE';
import { UniverSheetsHyperLinkPreset } from '@univerjs/preset-sheets-hyper-link';
import linkEnUS from '@univerjs/preset-sheets-hyper-link/locales/en-US';
import linkDeDE from '@univerjs/preset-sheets-hyper-link/locales/de-DE';
import { UniverSheetsFindReplacePreset } from '@univerjs/preset-sheets-find-replace';
import findEnUS from '@univerjs/preset-sheets-find-replace/locales/en-US';
import findDeDE from '@univerjs/preset-sheets-find-replace/locales/de-DE';
import { UniverSheetsNotePreset } from '@univerjs/preset-sheets-note';
import noteEnUS from '@univerjs/preset-sheets-note/locales/en-US';
import noteDeDE from '@univerjs/preset-sheets-note/locales/de-DE';
import { IUndoRedoService } from '@univerjs/core';
import { IDrawingManagerService } from '@univerjs/drawing';
import { GroupingDoubleIcon, BrushIcon } from '@univerjs/icons';
import { IFontService } from '@univerjs/ui';

const { html } = Suite.shell;
const t = Suite.t;
const APP = 'spreadsheet';
const OPEN_TYPES = [{ description: 'Spreadsheets', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx', '.xlsm', '.xls', '.ods', '.fods', '.csv', '.tsv', '.numbers'] } }];
const FORMATS = {
  xlsx: { label: 'Excel (.xlsx)', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  ods: { label: 'OpenDocument (.ods)', mime: 'application/vnd.oasis.opendocument.spreadsheet' },
  xls: { label: 'Excel 97–2003 (.xls)', mime: 'application/vnd.ms-excel' },
  csv: { label: 'CSV (.csv)', mime: 'text/csv' },
};

Suite.i18n.register({
  en: {
    'app.title': 'Spreadsheet', 'ss.new': 'New', 'ss.open': 'Open', 'ss.save': 'Save', 'ss.saveAs': 'Save as', 'ss.diagram': 'Diagram', 'ss.diagramGone': 'The diagram is no longer in the workbook.', 'ss.fileName': 'File name', 'ss.format': 'Format',
    'ss.cancel': 'Cancel', 'ss.untitled': 'Spreadsheet', 'ss.discard': 'Discard the unsaved changes?', 'ss.loading': 'Opening “{0}”…',
    'ss.csvNote': 'CSV and XLS files keep only values and formulas: formatting, and for CSV all sheets but the first, are lost.',
    'ss.xlsmNote': 'Macros cannot be kept: the workbook is saved as .xlsx.', 'ss.cannotOpen': '“{0}” cannot be opened: {1}',
    'ss.csvImport': 'Import text file', 'ss.encoding': 'Encoding', 'ss.auto': 'Automatic ({0})', 'ss.separator': 'Separator', 'ss.sepComma': 'Comma',
    'ss.sepSemicolon': 'Semicolon', 'ss.sepTab': 'Tab', 'ss.sepPipe': 'Vertical bar', 'ss.types': 'Values', 'ss.typesAuto': 'Recognise numbers and dates',
    'ss.typesText': 'Everything as text', 'ss.decimal': 'Decimal separator', 'ss.preview': 'Preview ({0} rows)', 'ss.import': 'Import',
    'ss.dedupe': 'Remove duplicates', 'ss.dedupeRange': 'Range {0}', 'ss.dedupeHeader': 'The first row contains headers', 'ss.dedupeColumns': 'Compare the columns',
    'ss.dedupeAll': 'All', 'ss.dedupeNone': 'None', 'ss.columnN': 'Column {0}', 'ss.dedupeOk': 'Remove', 'ss.dedupeDone': '{0} duplicate rows removed, {1} rows remain.',
    'ss.dedupeNothing': 'No duplicate rows found.', 'ss.split': 'Text to columns', 'ss.splitOneColumn': 'Select the cells of one column to split.',
    'ss.splitSpace': 'Space', 'ss.splitOther': 'Other', 'ss.splitConsecutive': 'Treat consecutive separators as one', 'ss.splitOk': 'Split',
    'ss.splitReplace': 'Replace the contents of the cells to the right?', 'ss.toolsEmpty': 'The selected range is empty.',
    'ss.print': 'Print / PDF', 'ss.printTitle': 'Print / PDF (Ctrl+P)', 'ss.printWhat': 'Print', 'ss.printSelection': 'Selection ({0})', 'ss.printSheet': 'This sheet',
    'ss.printAll': 'All sheets', 'ss.paper': 'Paper', 'ss.orientation': 'Orientation', 'ss.portrait': 'Portrait', 'ss.landscape': 'Landscape',
    'ss.fit': 'Size', 'ss.fitNone': 'Actual size', 'ss.fitWidth': 'Fit all columns on one page', 'ss.fitPage': 'Fit the sheet on one page',
    'ss.repeat': 'Rows repeated at the top of each page', 'ss.gridlines': 'Gridlines', 'ss.printOk': 'Print',
    'ss.printHint': 'Choose “Save as PDF” as the printer in the print dialog for a PDF file.', 'ss.printEmpty': 'There is nothing to print.',
  },
  de: {
    'app.title': 'Tabellenkalkulation', 'ss.new': 'Neu', 'ss.open': 'Öffnen', 'ss.save': 'Speichern', 'ss.saveAs': 'Speichern unter', 'ss.diagram': 'Diagramm', 'ss.diagramGone': 'Das Diagramm ist nicht mehr in der Arbeitsmappe.', 'ss.fileName': 'Dateiname', 'ss.format': 'Format',
    'ss.cancel': 'Abbrechen', 'ss.untitled': 'Tabelle', 'ss.discard': 'Die ungespeicherten Änderungen verwerfen?', 'ss.loading': '„{0}“ wird geöffnet…',
    'ss.csvNote': 'CSV- und XLS-Dateien behalten nur Werte und Formeln: Formatierung und bei CSV alle Blätter außer dem ersten gehen verloren.',
    'ss.xlsmNote': 'Makros können nicht erhalten werden: Die Arbeitsmappe wird als .xlsx gespeichert.', 'ss.cannotOpen': '„{0}“ kann nicht geöffnet werden: {1}',
    'ss.csvImport': 'Textdatei importieren', 'ss.encoding': 'Kodierung', 'ss.auto': 'Automatisch ({0})', 'ss.separator': 'Trennzeichen', 'ss.sepComma': 'Komma',
    'ss.sepSemicolon': 'Strichpunkt', 'ss.sepTab': 'Tabulator', 'ss.sepPipe': 'Senkrechter Strich', 'ss.types': 'Werte', 'ss.typesAuto': 'Zahlen und Datumswerte erkennen',
    'ss.typesText': 'Alles als Text', 'ss.decimal': 'Dezimaltrennzeichen', 'ss.preview': 'Vorschau ({0} Zeilen)', 'ss.import': 'Importieren',
    'ss.dedupe': 'Duplikate entfernen', 'ss.dedupeRange': 'Bereich {0}', 'ss.dedupeHeader': 'Die erste Zeile enthält Überschriften', 'ss.dedupeColumns': 'Diese Spalten vergleichen',
    'ss.dedupeAll': 'Alle', 'ss.dedupeNone': 'Keine', 'ss.columnN': 'Spalte {0}', 'ss.dedupeOk': 'Entfernen', 'ss.dedupeDone': '{0} doppelte Zeilen entfernt, {1} Zeilen bleiben.',
    'ss.dedupeNothing': 'Keine doppelten Zeilen gefunden.', 'ss.split': 'Text in Spalten', 'ss.splitOneColumn': 'Markieren Sie die Zellen einer Spalte, die aufgeteilt werden sollen.',
    'ss.splitSpace': 'Leerzeichen', 'ss.splitOther': 'Anderes', 'ss.splitConsecutive': 'Aufeinanderfolgende Trennzeichen als eines behandeln', 'ss.splitOk': 'Aufteilen',
    'ss.splitReplace': 'Den Inhalt der Zellen rechts davon ersetzen?', 'ss.toolsEmpty': 'Der markierte Bereich ist leer.',
    'ss.print': 'Drucken / PDF', 'ss.printTitle': 'Drucken / PDF (Strg+P)', 'ss.printWhat': 'Drucken', 'ss.printSelection': 'Markierung ({0})', 'ss.printSheet': 'Dieses Blatt',
    'ss.printAll': 'Alle Blätter', 'ss.paper': 'Papier', 'ss.orientation': 'Ausrichtung', 'ss.portrait': 'Hochformat', 'ss.landscape': 'Querformat',
    'ss.fit': 'Größe', 'ss.fitNone': 'Tatsächliche Größe', 'ss.fitWidth': 'Alle Spalten auf einer Seite', 'ss.fitPage': 'Blatt auf einer Seite',
    'ss.repeat': 'Zeilen, die oben auf jeder Seite wiederholt werden', 'ss.gridlines': 'Gitternetzlinien', 'ss.printOk': 'Drucken',
    'ss.printHint': 'Wählen Sie im Druckdialog „Als PDF speichern“ als Drucker, um eine PDF-Datei zu erhalten.', 'ss.printEmpty': 'Es gibt nichts zu drucken.',
  },
});

const state = { name: '', handle: null, format: 'xlsx', dirty: false, dialog: null, busy: false, csv: null, separator: ',', tool: null, print: null };
// csv: the import dialog { bytes, name, handle, encoding, separator, types, decimal }
state.name = `${t('ss.untitled')}.xlsx`;

let queued = false;
function render() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; Suite.shell.refresh(); });
}
const fail = (e) => { console.warn(e); Suite.shell.toast(Suite.i18n.describe(e), 'error'); };

// ---- Univer ------------------------------------------------------------------------------------------------

const host = document.createElement('div');
host.className = 'ss-univer';
host.dataset.testid = 'sheet';
document.body.appendChild(host); // moved into the layout once it is rendered
const dark = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
const locale = () => (Suite.i18n.language === 'de' ? LocaleType.DE_DE : LocaleType.EN_US);

const { univerAPI } = createUniver({
  locale: locale(),
  locales: { [LocaleType.EN_US]: mergeLocales(enUS, cfEnUS, dvEnUS, drawingEnUS, sortEnUS, filterEnUS, linkEnUS, findEnUS, noteEnUS, SSOutline.locales.en, SSTools.locales.en), [LocaleType.DE_DE]: mergeLocales(deDE, cfDeDE, dvDeDE, drawingDeDE, sortDeDE, filterDeDE, linkDeDE, findDeDE, noteDeDE, SSOutline.locales.de, SSTools.locales.de) },
  darkMode: dark(),
  presets: [UniverSheetsCorePreset({ container: host }), UniverSheetsConditionalFormattingPreset(), UniverSheetsDataValidationPreset(), UniverSheetsDrawingPreset(),
    UniverSheetsSortPreset(), UniverSheetsFilterPreset(), UniverSheetsHyperLinkPreset(), UniverSheetsFindReplacePreset(), UniverSheetsNotePreset()],
});
let workbook = univerAPI.createWorkbook({ name: t('ss.untitled') });
univerAPI.registerComponent('SSOutlineIcon', GroupingDoubleIcon);
const outline = SSOutline.install(univerAPI, () => workbook); // Data → Group (row and column groups)
univerAPI.registerComponent('SSToolsIcon', BrushIcon);
SSTools.install(univerAPI, (kind) => openTool(kind)); // Data → Clean up
let loadedAt = performance.now(); // mutations count as edits only after user input that follows the latest load

// ---- fonts (shared/js/fonts.js): the bundled and imported fonts in Univer's font menus ------------------------------------------
function syncFonts() {
  const service = univerAPI._injector.get(IFontService);
  for (const f of Suite.fonts ? Suite.fonts.families() : []) if (!service.getFontByValue(f.name)) service.addFont({ value: f.name, label: f.name });
}
syncFonts();
if (Suite.fonts) { Suite.fonts.onChange(syncFonts); Suite.fonts.ready.then(syncFonts); }
/** The font families of Univer data (text runs, styles) – for the fonts of a print frame. */
function fontsOf(data) {
  const names = new Set();
  JSON.stringify(data, (k, v) => { if (k === 'ff' && typeof v === 'string') names.add(v); return v; });
  return [...names];
}


// a mutation (changed cells, formats, sheets, …) shortly after user input makes the document dirty; selection changes are
// operations, not mutations, and Univer's own set-up mutations have no user input before them
const MUTATION = 2;
let lastInput = -Infinity;
for (const type of ['pointerdown', 'keydown', 'paste', 'cut', 'drop']) host.addEventListener(type, () => { lastInput = performance.now(); }, true);
univerAPI.addEvent(univerAPI.Event.CommandExecuted, (event) => {
  if (event.type !== MUTATION || state.dirty || lastInput < loadedAt || performance.now() - lastInput > 3000) return;
  state.dirty = true;
  Suite.shell.setDirty(true);
  render();
});

new MutationObserver(() => univerAPI.toggleDarkMode(dark())).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => univerAPI.toggleDarkMode(dark()));
Suite.i18n.onChange(() => univerAPI.setLocale(locale()));

function load(data, name, handle = null, format = 'xlsx') {
  const previous = workbook;
  workbook = univerAPI.createWorkbook(data);
  if (previous) univerAPI.disposeUnit(previous.getId());
  Object.assign(state, { name, handle, format, dirty: false });
  Suite.shell.setDirty(false);
  loadedAt = performance.now(); // Univer emits set-up mutations for a while after creating a unit: they are not edits
  if (data.images) insertImportedImages(workbook, data.images).catch((e) => console.warn(e));
  setTimeout(outline.refresh, 300); // (the headers of the new workbook show its groups once it is rendered)
  render();
}

/** Pictures of an imported file (shared/js/univer-xlsx.js): placed by Univer, then not part of the undo history. */
async function insertImportedImages(wb, images) {
  for (const [sheetId, list] of Object.entries(images)) {
    const ws = wb.getSheetBySheetId(sheetId);
    if (!ws) continue;
    const drawings = [];
    for (const img of list) {
      drawings.push(await ws.newOverGridImage().setSource(img.source, 'BASE64').setColumn(img.column).setColumnOffset(img.columnOffset).setRow(img.row)
        .setRowOffset(img.rowOffset).setWidth(img.width).setHeight(img.height).buildAsync());
    }
    if (drawings.length) ws.insertImages(drawings);
  }
  univerAPI._injector.get(IUndoRedoService).clearUndoRedo(wb.getId());
  loadedAt = performance.now();
}

// ---- diagrams (shared/js/diagram-embed.js: a PNG with the draw.io diagram inside, edited in the diagram editor) ------

univerAPI._injector.get(IDrawingManagerService).focus$.subscribe(() => render()); // "Edit diagram" follows the selected picture

const markChanged = () => { state.dirty = true; Suite.shell.setDirty(true); render(); };

/** The selected picture if it carries a diagram: { sheet, id, src } or null. */
function focusedDiagram() {
  try {
    const ws = workbook.getActiveSheet();
    const [active] = ws.getActiveImages(); // (not an image object: its id leads to one)
    const id = active && (typeof active.getId === 'function' ? active.getId() : active.drawingId);
    const img = id && ws.getImageById(id);
    const src = img && img.toBuilder().getSource(); // (the image object itself has no getSource)
    return src && Suite.diagrams.isDiagram(src) ? { sheet: ws, id, src } : null;
  } catch (e) { return null; }
}

/** The stored size of a picture (the drawing resource of the workbook). */
function drawingOf(sheetId, id) {
  const r = (workbook.save().resources || []).find((x) => x.name === 'SHEET_DRAWING_PLUGIN');
  try { return JSON.parse(r.data)[sheetId].data[id]; } catch (e) { return null; }
}

/** A new picture from the diagram editor: same anchor and scale (one undo step). */
async function replaceDiagram(ws, id, res) {
  const img = ws.getImageById(id);
  const old = drawingOf(ws.getSheetId(), id);
  if (!img || !old) return false;
  const size = Suite.diagrams.newSize(old.source, old.width || res.width, res);
  ws.updateImages([await img.toBuilder().setSource(res.src, 'BASE64').setWidth(size.width).setHeight(size.height).buildAsync()]);
  markChanged();
  return true;
}

function insertDiagram() {
  const ws = workbook.getActiveSheet();
  const range = ws.getActiveRange();
  const at = { row: range ? range.getRow() : 0, column: range ? range.getColumn() : 0 };
  let id = null;
  Suite.diagrams.insert({
    onSave: async (res) => {
      if (id && await replaceDiagram(ws, id, res)) return;
      const drawing = await ws.newOverGridImage().setSource(res.src, 'BASE64').setColumn(at.column).setRow(at.row).setWidth(res.width).setHeight(res.height).buildAsync();
      ws.insertImages([drawing]);
      id = drawing.drawingId;
      markChanged();
    },
  });
}

// ---- charts (shared/js/charts.js: a picture with its data, made from the selected cells) ----------------------------------------

const CHART_SIZE = { width: 480, height: 288 };

/** The selected picture if it is a chart: { sheet, id, model } or null. */
function focusedChart() {
  try {
    const ws = workbook.getActiveSheet();
    const [active] = ws.getActiveImages();
    const id = active && (typeof active.getId === 'function' ? active.getId() : active.drawingId);
    const img = id && ws.getImageById(id);
    const model = img && Suite.charts.modelOf(img.toBuilder().getSource());
    return model ? { sheet: ws, id, model } : null;
  } catch (e) { return null; }
}

/** The model of a range of cells (with the range as its source). */
function chartFromRange(ws, a1) {
  const model = Suite.charts.fromRows(ws.getRange(a1).getValues());
  return model && { ...model, source: { sheet: ws.getSheetId(), range: a1 } };
}

async function insertChart() {
  const ws = workbook.getActiveSheet();
  let range = ws.getSelection() && ws.getSelection().getActiveRange();
  if (!range) return;
  if (range.getHeight() === 1 && range.getWidth() === 1) range = currentRegion(ws, range.getRow(), range.getColumn()); // (the table around the cell)
  const model = chartFromRange(ws, range.getA1Notation());
  if (!model) { Suite.shell.toast(t('ch.noData'), 'warning'); return; }
  model.title = model.series.length === 1 ? model.series[0].name : '';
  // beside the table, or below it when it would not be seen there (phones, narrow windows)
  const besideCol = range.getColumn() + range.getWidth() + 1;
  let left = 46; // (the row headers)
  try { for (let c = 0; c < besideCol; c++) left += ws.getColumnWidth(c); } catch (e) { left = 0; }
  const below = left + CHART_SIZE.width > (host.clientWidth || window.innerWidth);
  const image = await ws.newOverGridImage().setSource(Suite.charts.toPng(model, CHART_SIZE.width, CHART_SIZE.height), 'BASE64')
    .setColumn(below ? range.getColumn() : besideCol).setRow(below ? range.getRow() + range.getHeight() + 1 : range.getRow())
    .setWidth(CHART_SIZE.width).setHeight(CHART_SIZE.height).buildAsync();
  ws.insertImages([image]);
  markChanged();
}

function editChart() {
  const f = focusedChart();
  if (!f) return;
  const src = f.model.source;
  Suite.charts.edit({
    model: f.model,
    refresh: src ? () => { const sheet = workbook.getSheetBySheetId(src.sheet); try { return sheet && chartFromRange(sheet, src.range); } catch (e) { return null; } } : null,
    onSave: async (model) => {
      const img = f.sheet.getImageById(f.id);
      const old = drawingOf(f.sheet.getSheetId(), f.id);
      if (!img || !old) { Suite.shell.toast(t('ss.diagramGone'), 'warning'); return; }
      const width = old.width || (old.transform && old.transform.width) || CHART_SIZE.width, height = old.height || (old.transform && old.transform.height) || CHART_SIZE.height;
      f.sheet.updateImages([await img.toBuilder().setSource(Suite.charts.toPng(model, width, height), 'BASE64').setWidth(width).setHeight(height).buildAsync()]);
      markChanged();
    },
  });
}

function editDiagram() {
  const f = focusedDiagram();
  if (f) Suite.diagrams.edit({ src: f.src, onSave: async (res) => { if (!(await replaceDiagram(f.sheet, f.id, res))) throw new Error(t('ss.diagramGone')); } });
}

// recovery copies of unsaved work (shared/js/autosave.js): the Univer snapshot
Suite.autosave.register({
  app: APP,
  save: () => (state.dirty ? { name: state.name, handle: state.handle, format: state.format, data: JSON.parse(JSON.stringify(workbook.save())) } : null),
  restore: (s) => { load(s.data, s.name, s.handle || null, s.format || 'xlsx'); state.dirty = true; Suite.shell.setDirty(true); render(); },
});

// ---- files ----------------------------------------------------------------------------------------------------

const formatOf = (name) => { const e = (name.split('.').pop() || '').toLowerCase(); return e === 'xlsm' ? 'xlsx' : FORMATS[e] ? e : 'xlsx'; };

async function confirmDiscard() { return !state.dirty || Suite.shell.confirm(t('ss.discard')); }

async function openPicked({ file, handle }) {
  if (/\.(csv|tsv|txt)$/i.test(file.name)) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { text, encoding } = SSCSV.decode(bytes);
    const separator = /\.tsv$/i.test(file.name) ? '\t' : SSCSV.sniff(text);
    state.csv = { bytes, name: file.name, handle, encoding: 'auto', detected: encoding, separator, types: 'auto', decimal: separator === ';' ? ',' : '.' };
    render();
    return;
  }
  state.busy = true;
  render();
  try {
    const data = await Suite.univerXlsx.importFile(await file.arrayBuffer(), file.name);
    const macro = /\.xlsm$/i.test(file.name);
    const keep = /\.(xlsx|ods|xls|csv)$/i.test(file.name);
    load(data, macro ? file.name.replace(/\.xlsm$/i, '.xlsx') : keep ? file.name : file.name.replace(/\.[^.]+$/, '.xlsx'), keep ? handle : null, formatOf(file.name));
    if (macro) Suite.shell.toast(t('ss.xlsmNote'), 'warning');
    if (handle && keep) Suite.files.remember(APP, handle);
  } catch (e) { console.warn(e); Suite.shell.toast(t('ss.cannotOpen', file.name, e.message), 'error'); } finally { state.busy = false; render(); }
}

async function open() {
  if (!(await confirmDiscard())) return;
  const picked = await Suite.files.open({ types: OPEN_TYPES }).catch(fail);
  if (picked) await openPicked(picked[0]);
}

async function newWorkbook() {
  if (!(await confirmDiscard())) return;
  load({ name: t('ss.untitled') }, `${t('ss.untitled')}.xlsx`);
}

async function importCsv() {
  const c = state.csv;
  state.csv = null;
  state.busy = true;
  render();
  try {
    const { text } = SSCSV.decode(c.bytes, c.encoding);
    const rows = SSCSV.convert(SSCSV.parse(text, c.separator), c);
    const data = await Suite.univerXlsx.importRows(rows, c.name.replace(/\.[^.]+$/, ''), c.name.replace(/\.[^.]+$/, ''));
    const keep = /\.csv$/i.test(c.name);
    load(data, keep ? c.name : c.name.replace(/\.[^.]+$/, '.xlsx'), keep ? c.handle : null, keep ? 'csv' : 'xlsx');
    state.separator = c.separator === '\t' ? ',' : c.separator; // saved again with the same separator
    if (c.handle && keep) Suite.files.remember(APP, c.handle);
  } catch (e) { console.warn(e); Suite.shell.toast(t('ss.cannotOpen', c.name, e.message), 'error'); } finally { state.busy = false; render(); }
}

async function save({ as = false, name = state.name, format = state.format } = {}) {
  try {
    const bytes = await Suite.univerXlsx.exportFile(workbook.save(), format, { separator: state.separator });
    const info = FORMATS[format];
    const types = [{ description: info.label, accept: { [info.mime]: [`.${format}`] } }];
    const result = as || !state.handle ? await Suite.files.saveAs(bytes, { suggestedName: name, types, type: info.mime })
      : await Suite.files.save({ name, handle: state.handle }, bytes, { type: info.mime });
    if (!result) return;
    if (result.mode === 'downloaded') Suite.shell.banner(result.message); else Suite.shell.toast(result.message);
    if (format === 'csv' || format === 'xls') Suite.shell.toast(t('ss.csvNote'), 'warning');
    Object.assign(state, { name: result.name || name, handle: result.handle || state.handle, format, dirty: false });
    Suite.shell.setDirty(false);
    render();
  } catch (e) { fail(e); }
}

// ---- UI --------------------------------------------------------------------------------------------------------

function SaveAsDialog() {
  const d = state.dialog;
  if (!d) return null;
  return html`<dialog open class="pico" data-testid="save-as-dialog"><article>
    <form onSubmit=${(e) => { e.preventDefault(); state.dialog = null; render(); save({ as: true, name: `${d.stem}.${d.format}`, format: d.format }); }}>
      <label>${t('ss.fileName')}<input data-testid="save-as-name" defaultValue=${d.stem} onInput=${(e) => { d.stem = e.target.value; }} /></label>
      <label>${t('ss.format')}<select data-testid="save-as-format" onChange=${(e) => { d.format = e.target.value; render(); }}>
        ${Object.entries(FORMATS).map(([k, f]) => html`<option value=${k} selected=${d.format === k}>${f.label}</option>`)}</select></label>
      ${d.format === 'csv' || d.format === 'xls' ? html`<small>${t('ss.csvNote')}</small>` : null}
      <footer><button type="button" class="secondary" onClick=${() => { state.dialog = null; render(); }}>${t('ss.cancel')}</button>
        <button type="submit" data-testid="save-as-ok">${t('ss.saveAs')}</button></footer>
    </form>
  </article></dialog>`;
}

function CsvDialog() {
  const c = state.csv;
  if (!c) return null;
  const set = (k) => (e) => { c[k] = e.target.value; render(); };
  const { text, encoding } = SSCSV.decode(c.bytes, c.encoding);
  const rows = SSCSV.parse(text, c.separator, 9);
  const values = SSCSV.convert(rows, c);
  const cols = Math.min(12, Math.max(0, ...rows.map((r) => r.length)));
  const show = (v) => (v instanceof Date ? v.toISOString().replace(/T00:00:00\.000Z$/, '').replace(/:00\.000Z$/, '').replace('T', ' ') : v == null ? '' : String(v));
  const seps = [[',', 'ss.sepComma'], [';', 'ss.sepSemicolon'], ['\t', 'ss.sepTab'], ['|', 'ss.sepPipe']];
  return html`<dialog open class="pico" data-testid="csv-dialog"><article class="ss-csv">
    <header><strong>${t('ss.csvImport')}</strong> <small>${c.name}</small></header>
    <div class="ss-csv-options">
      <label>${t('ss.encoding')}<select data-testid="csv-encoding" onChange=${set('encoding')}>
        <option value="auto" selected=${c.encoding === 'auto'}>${t('ss.auto', c.encoding === 'auto' ? encoding.toUpperCase() : c.detected.toUpperCase())}</option>
        ${['utf-8', 'windows-1252', 'iso-8859-15', 'utf-16le', 'utf-16be'].map((x) => html`<option value=${x} selected=${c.encoding === x}>${x.toUpperCase()}</option>`)}</select></label>
      <label>${t('ss.separator')}<select data-testid="csv-separator" onChange=${set('separator')}>
        ${seps.map(([v, k]) => html`<option value=${v} selected=${c.separator === v}>${t(k)}</option>`)}</select></label>
      <label>${t('ss.types')}<select data-testid="csv-types" onChange=${set('types')}>
        <option value="auto" selected=${c.types === 'auto'}>${t('ss.typesAuto')}</option><option value="text" selected=${c.types === 'text'}>${t('ss.typesText')}</option></select></label>
      ${c.types === 'auto' ? html`<label>${t('ss.decimal')}<select data-testid="csv-decimal" onChange=${set('decimal')}>
        <option value="." selected=${c.decimal === '.'}>1,234.5</option><option value="," selected=${c.decimal === ','}>1.234,5</option></select></label>` : null}
    </div>
    <small>${t('ss.preview', rows.length)}</small>
    <div class="ss-csv-preview"><table data-testid="csv-preview"><tbody>${values.map((r) => html`<tr>${Array.from({ length: cols }, (_, i) => html`<td class=${typeof r[i] === 'number' || r[i] instanceof Date ? 'num' : ''}>${show(r[i])}</td>`)}</tr>`)}</tbody></table></div>
    <footer><button type="button" class="secondary" data-testid="csv-cancel" onClick=${() => { state.csv = null; render(); }}>${t('ss.cancel')}</button>
      <button data-testid="csv-import" onClick=${importCsv}>${t('ss.import')}</button></footer>
  </article></dialog>`;
}

// ---- Data → Clean up: remove duplicates, text to columns ----------------------------------------------------------------

const columnLetter = (i) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

/** The table around a cell, like Excel's current region: grown while a neighbouring row or column has content. */
function currentRegion(ws, row, column) {
  const lastRow = ws.getLastRow(), lastColumn = ws.getLastColumn();
  if (lastRow < 0 || lastColumn < 0) return ws.getRange(row, column);
  const values = ws.getRange(0, 0, lastRow + 1, lastColumn + 1).getValues();
  const filled = (r, c) => r >= 0 && c >= 0 && r <= lastRow && c <= lastColumn && values[r][c] !== null && values[r][c] !== undefined && values[r][c] !== '';
  const any = (r0, r1, c0, c1) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (filled(r, c)) return true; return false; };
  let [top, bottom, left, right] = [row, row, column, column];
  for (let grown = true; grown;) {
    grown = false;
    if (top > 0 && any(top - 1, top - 1, left - 1, right + 1)) { top--; grown = true; }
    if (bottom < lastRow && any(bottom + 1, bottom + 1, left - 1, right + 1)) { bottom++; grown = true; }
    if (left > 0 && any(top, bottom, left - 1, left - 1)) { left--; grown = true; }
    if (right < lastColumn && any(top, bottom, right + 1, right + 1)) { right++; grown = true; }
  }
  return ws.getRange(top, left, bottom - top + 1, right - left + 1);
}

function openTool(kind) {
  const ws = workbook.getActiveSheet();
  let range = ws.getSelection() && ws.getSelection().getActiveRange();
  if (!range) return;
  if (kind === 'dedupe') {
    // a single cell stands for the table around it
    if (range.getHeight() === 1 && range.getWidth() === 1) range = currentRegion(ws, range.getRow(), range.getColumn());
    const values = range.getValues();
    if (!values.flat().some((v) => v !== null && v !== undefined && v !== '')) { Suite.shell.toast(t('ss.toolsEmpty'), 'warning'); return; }
    const first = range.getColumn();
    const header = values[0].every((v) => typeof v === 'string' && v.trim()) && values.length > 1;
    state.tool = { kind, range: range.getA1Notation(), header, columns: values[0].map((_, i) => i), first, names: values[0] };
  } else {
    if (range.getWidth() !== 1) { Suite.shell.toast(t('ss.splitOneColumn'), 'warning'); return; }
    if (range.getHeight() === 1) range = ws.getRange(range.getRow(), range.getColumn(), Math.max(1, ws.getLastRow() - range.getRow() + 1), 1);
    const texts = range.getValues().map((r) => (r[0] === null || r[0] === undefined ? '' : String(r[0])));
    if (!texts.some(Boolean)) { Suite.shell.toast(t('ss.toolsEmpty'), 'warning'); return; }
    const sample = texts.filter(Boolean).slice(0, 20).join('\n');
    const sep = /\t/.test(sample) ? '\t' : SSCSV.sniff(sample);
    state.tool = { kind, range: range.getA1Notation(), texts, separator: [',', ';', '\t', ' '].includes(sep) ? sep : ',', other: '', consecutive: false, types: 'auto', decimal: sep === ';' ? ',' : '.' };
  }
  render();
}

function removeDuplicates() {
  const d = state.tool;
  state.tool = null;
  render();
  const ws = workbook.getActiveSheet();
  const range = ws.getRange(d.range);
  const cells = range.getCellDatas();
  const values = range.getValues();
  const start = d.header ? 1 : 0;
  const keep = SSTools.duplicates(values.slice(start), d.columns);
  const removed = values.length - start - keep.length;
  if (!removed) { Suite.shell.toast(t('ss.dedupeNothing')); return; }
  // the kept rows move up (with their formats, like deleted cells in Excel); the rows freed at the bottom are emptied
  const empty = () => ({ v: null, p: null, f: null, si: null, s: null });
  const rows = [...cells.slice(0, start), ...keep.map((i) => cells[start + i])].map((row) => row.map((c) => (c ? { v: null, p: null, f: null, si: null, s: null, ...c } : empty())));
  while (rows.length < cells.length) rows.push(cells[0].map(empty));
  range.setValues(rows);
  Suite.shell.toast(t('ss.dedupeDone', removed, keep.length));
}

async function splitColumn() {
  const d = state.tool;
  const separator = d.separator === 'other' ? d.other : d.separator;
  if (!separator) return;
  const rows = SSTools.split(d.texts, { separator, consecutive: d.consecutive, types: d.types, decimal: d.decimal });
  const width = Math.max(1, ...rows.map((r) => r.length));
  const ws = workbook.getActiveSheet();
  const source = ws.getRange(d.range);
  const [row, column] = [source.getRow(), source.getColumn()];
  if (width > 1) {
    const right = ws.getRange(row, column + 1, rows.length, width - 1).getValues();
    if (right.flat().some((v) => v !== null && v !== undefined && v !== '') && !(await Suite.shell.confirm(t('ss.splitReplace')))) return;
  }
  state.tool = null;
  render();
  if (column + width > ws.getMaxColumns()) ws.insertColumnsAfter(ws.getMaxColumns() - 1, column + width - ws.getMaxColumns());
  ws.getRange(row, column, rows.length, width).setValues(rows.map((r) => Array.from({ length: width }, (_, i) => SSTools.cell(r[i]))));
}

function ToolDialog() {
  const d = state.tool;
  if (!d) return null;
  const close = () => { state.tool = null; render(); };
  if (d.kind === 'dedupe') {
    const toggle = (i) => { d.columns = d.columns.includes(i) ? d.columns.filter((c) => c !== i) : [...d.columns, i].sort((a, b) => a - b); render(); };
    const name = (i) => (d.header && d.names[i] ? `${columnLetter(d.first + i)} – ${d.names[i]}` : t('ss.columnN', columnLetter(d.first + i)));
    return html`<dialog open class="pico" data-testid="dedupe-dialog"><article class="ss-tool">
      <header><strong>${t('ss.dedupe')}</strong> <small>${t('ss.dedupeRange', d.range)}</small></header>
      <label><input type="checkbox" data-testid="dedupe-header" checked=${d.header} onChange=${(e) => { d.header = e.target.checked; render(); }} />${t('ss.dedupeHeader')}</label>
      <fieldset><legend>${t('ss.dedupeColumns')} <a href="#" onClick=${(e) => { e.preventDefault(); d.columns = d.names.map((_, i) => i); render(); }}>${t('ss.dedupeAll')}</a> · <a href="#" onClick=${(e) => { e.preventDefault(); d.columns = []; render(); }}>${t('ss.dedupeNone')}</a></legend>
        <div class="ss-tool-columns">${d.names.map((_, i) => html`<label><input type="checkbox" data-testid="dedupe-column" checked=${d.columns.includes(i)} onChange=${() => toggle(i)} />${name(i)}</label>`)}</div></fieldset>
      <footer><button type="button" class="secondary" onClick=${close}>${t('ss.cancel')}</button>
        <button data-testid="dedupe-ok" disabled=${!d.columns.length} onClick=${removeDuplicates}>${t('ss.dedupeOk')}</button></footer>
    </article></dialog>`;
  }
  const set = (k) => (e) => { d[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; render(); };
  const separator = d.separator === 'other' ? d.other : d.separator;
  const preview = separator ? SSTools.split(d.texts.slice(0, 8), { separator, consecutive: d.consecutive, types: d.types, decimal: d.decimal }) : [];
  const cols = Math.min(12, Math.max(1, ...preview.map((r) => r.length)));
  const show = (v) => (v instanceof Date ? v.toISOString().replace(/T00:00:00\.000Z$/, '').replace(/:00\.000Z$/, '').replace('T', ' ') : v == null ? '' : String(v));
  const seps = [[',', 'ss.sepComma'], [';', 'ss.sepSemicolon'], ['\t', 'ss.sepTab'], [' ', 'ss.splitSpace'], ['other', 'ss.splitOther']];
  return html`<dialog open class="pico" data-testid="split-dialog"><article class="ss-csv">
    <header><strong>${t('ss.split')}</strong> <small>${t('ss.dedupeRange', d.range)}</small></header>
    <div class="ss-csv-options">
      <label>${t('ss.separator')}<select data-testid="split-separator" onChange=${set('separator')}>
        ${seps.map(([v, k]) => html`<option value=${v} selected=${d.separator === v}>${t(k)}</option>`)}</select></label>
      ${d.separator === 'other' ? html`<label>${t('ss.splitOther')}<input data-testid="split-other" maxlength="1" value=${d.other} onInput=${set('other')} /></label>` : null}
      <label>${t('ss.types')}<select data-testid="split-types" onChange=${set('types')}>
        <option value="auto" selected=${d.types === 'auto'}>${t('ss.typesAuto')}</option><option value="text" selected=${d.types === 'text'}>${t('ss.typesText')}</option></select></label>
      ${d.types === 'auto' ? html`<label>${t('ss.decimal')}<select data-testid="split-decimal" onChange=${set('decimal')}>
        <option value="." selected=${d.decimal === '.'}>1,234.5</option><option value="," selected=${d.decimal === ','}>1.234,5</option></select></label>` : null}
    </div>
    <label><input type="checkbox" data-testid="split-consecutive" checked=${d.consecutive} onChange=${set('consecutive')} />${t('ss.splitConsecutive')}</label>
    <div class="ss-csv-preview"><table data-testid="split-preview"><tbody>${preview.map((r) => html`<tr>${Array.from({ length: cols }, (_, i) => html`<td class=${typeof r[i] === 'number' || r[i] instanceof Date ? 'num' : ''}>${show(r[i])}</td>`)}</tr>`)}</tbody></table></div>
    <footer><button type="button" class="secondary" onClick=${close}>${t('ss.cancel')}</button>
      <button data-testid="split-ok" disabled=${!separator} onClick=${splitColumn}>${t('ss.splitOk')}</button></footer>
  </article></dialog>`;
}

// ---- print / PDF (js/print.js renders the cells; the browser's print dialog prints or saves a PDF) ---------------------------

const PRINT_PREFS = 'suite.spreadsheet.print';
function printPrefs() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(PRINT_PREFS) || '{}') || {}; } catch (e) { /* defaults */ }
  return { paper: /^en-US$/.test(navigator.language) ? 'Letter' : 'A4', orientation: 'portrait', fit: 'width', gridlines: false, ...saved };
}

function openPrint() {
  const ws = workbook.getActiveSheet();
  const range = ws.getSelection() && ws.getSelection().getActiveRange();
  const multi = range && (range.getHeight() > 1 || range.getWidth() > 1);
  const freeze = ws.getFreeze ? ws.getFreeze() : null;
  state.print = { ...printPrefs(), what: multi ? 'selection' : 'sheet', selection: multi ? range.getA1Notation() : '', repeat: freeze && freeze.startRow > 0 ? freeze.startRow : 0 };
  render();
}

/** The parts to print (js/print.js): the selection, the active sheet or all visible sheets. */
function printParts(p) {
  const data = workbook.save();
  const active = workbook.getActiveSheet().getSheetId();
  const ids = p.what === 'all' ? (data.sheetOrder || Object.keys(data.sheets)).filter((id) => data.sheets[id] && !data.sheets[id].hidden) : [active];
  const parts = [];
  for (const id of ids) {
    const sheet = data.sheets[id];
    const used = SSPrint.usedRange(sheet, data.styles);
    let range = used;
    if (p.what === 'selection' && p.selection) {
      const r = workbook.getSheetBySheetId(id).getRange(p.selection);
      range = { r0: r.getRow(), c0: r.getColumn(), r1: r.getLastRow(), c1: r.getLastColumn() };
      if (used) { range.r1 = Math.min(range.r1, Math.max(used.r1, range.r0)); range.c1 = Math.min(range.c1, Math.max(used.c1, range.c0)); } // (whole rows or columns)
    }
    if (!range) continue;
    const text = workbook.getSheetBySheetId(id).getRange(0, 0, range.r1 + 1, range.c1 + 1).getDisplayValues();
    parts.push({ name: sheet.name, sheet, styles: data.styles || {}, text, range });
  }
  return parts;
}

function printSheets() {
  const p = state.print;
  const parts = printParts(p);
  if (!parts.length) { Suite.shell.toast(t('ss.printEmpty'), 'warning'); return; }
  state.print = null;
  render();
  try { localStorage.setItem(PRINT_PREFS, JSON.stringify({ paper: p.paper, orientation: p.orientation, fit: p.fit, gridlines: p.gridlines })); } catch (e) { /* storage blocked */ }
  document.querySelectorAll('iframe.ss-print-frame').forEach((f) => f.remove());
  const frame = document.createElement('iframe');
  frame.className = 'ss-print-frame';
  frame.dataset.testid = 'print-frame';
  const fonts = Suite.fonts ? Suite.fonts.cssFor(['Arial', ...fontsOf(parts.map((x) => ({ sheet: x.sheet.cellData, styles: x.styles })))]) : ''; // (a frame of its own)
  frame.srcdoc = SSPrint.html(parts, { title: state.name.replace(/\.[^.]+$/, ''), paper: p.paper, orientation: p.orientation, fit: p.fit, repeat: +p.repeat || 0, gridlines: p.gridlines })
    .replace('</head>', `<style>${fonts}</style></head>`);
  frame.onload = () => {
    frame.contentWindow.addEventListener('afterprint', () => setTimeout(() => frame.remove(), 2000));
    setTimeout(() => frame.remove(), 120000);
    frame.contentWindow.print();
  };
  document.body.append(frame);
}

function PrintDialog() {
  const p = state.print;
  if (!p) return null;
  const set = (k) => (e) => { p[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; render(); };
  const option = (value, key, current, ...args) => html`<option value=${value} selected=${current === value}>${t(key, ...args)}</option>`;
  return html`<dialog open class="pico" data-testid="print-dialog"><article class="ss-tool">
    <header><strong>${t('ss.print')}</strong></header>
    <form onSubmit=${(e) => { e.preventDefault(); printSheets(); }}>
      <div class="ss-csv-options">
        <label>${t('ss.printWhat')}<select data-testid="print-what" onChange=${set('what')}>
          ${p.selection ? option('selection', 'ss.printSelection', p.what, p.selection) : null}
          ${option('sheet', 'ss.printSheet', p.what)}${option('all', 'ss.printAll', p.what)}</select></label>
        <label>${t('ss.paper')}<select data-testid="print-paper" onChange=${set('paper')}>
          <option value="A4" selected=${p.paper === 'A4'}>A4</option><option value="Letter" selected=${p.paper === 'Letter'}>Letter</option></select></label>
        <label>${t('ss.orientation')}<select data-testid="print-orientation" onChange=${set('orientation')}>
          ${option('portrait', 'ss.portrait', p.orientation)}${option('landscape', 'ss.landscape', p.orientation)}</select></label>
        <label>${t('ss.fit')}<select data-testid="print-fit" onChange=${set('fit')}>
          ${option('none', 'ss.fitNone', p.fit)}${option('width', 'ss.fitWidth', p.fit)}${option('page', 'ss.fitPage', p.fit)}</select></label>
        <label>${t('ss.repeat')}<input type="number" min="0" max="100" data-testid="print-repeat" value=${p.repeat} onInput=${set('repeat')} /></label>
      </div>
      <label><input type="checkbox" data-testid="print-gridlines" checked=${p.gridlines} onChange=${set('gridlines')} />${t('ss.gridlines')}</label>
      <small>${t('ss.printHint')}</small>
      <footer><button type="button" class="secondary" onClick=${() => { state.print = null; render(); }}>${t('ss.cancel')}</button>
        <button type="submit" data-testid="print-ok">${t('ss.printOk')}</button></footer>
    </form>
  </article></dialog>`;
}

function Toolbar() {
  return html`<nav class="ss-toolbar" role="toolbar">
    <button class="secondary" data-testid="new" onClick=${newWorkbook}>${t('ss.new')}</button>
    <button class="secondary" data-testid="open" onClick=${open} aria-busy=${state.busy}>${t('ss.open')}</button>
    <${Suite.shell.Recent} app=${APP} before=${confirmDiscard} onOpen=${(p) => openPicked(p)} />
    <button class=${state.dirty ? '' : 'secondary outline'} data-testid="save" onClick=${() => save()}>${t('ss.save')}</button>
    <button class="secondary outline" data-testid="save-as" onClick=${() => { state.dialog = { stem: state.name.replace(/\.[^.]+$/, ''), format: state.format }; render(); }}>${t('ss.saveAs')}</button>
    <button class="secondary outline" data-testid="print" title=${t('ss.printTitle')} onClick=${openPrint}>🖨 ${t('ss.print')}</button>
    <button class="secondary outline" data-testid="add-diagram" title=${t('dia.insert')} onClick=${insertDiagram}>📐 ${t('ss.diagram')}</button>
    ${focusedDiagram() ? html`<button class="secondary" data-testid="edit-diagram" onClick=${editDiagram}>📐 ${t('dia.edit')}</button>` : null}
    <button class="secondary outline" data-testid="add-chart" title=${t('ch.insert')} onClick=${() => insertChart().catch(fail)}>📊 ${t('ch.chart')}</button>
    ${focusedChart() ? html`<button class="secondary" data-testid="edit-chart" onClick=${editChart}>📊 ${t('ch.edit')}</button>` : null}
    <span class="ss-name" data-testid="file-name">${state.name}${state.dirty ? ' •' : ''}</span>
  </nav>`;
}

function Main() {
  return html`<div class="ss-layout" ref=${(el) => { if (el && host.parentElement !== el) el.appendChild(host); }}><${SaveAsDialog} /><${CsvDialog} /><${ToolDialog} /><${PrintDialog} /></div>`;
}

Suite.shell.mount({ id: APP, title: 'app.title', version: '%%BUILD_VERSION%%', toolbar: () => html`<${Toolbar} />`, main: () => html`<${Main} />` });
Suite.files.dropZone(document.body, async (picked) => { if (picked.length && await confirmDiscard()) await openPicked(picked[0]); });
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (e.shiftKey) { state.dialog = { stem: state.name.replace(/\.[^.]+$/, ''), format: state.format }; render(); } else save(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); open(); }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); e.stopPropagation(); openPrint(); }
}, true);

Suite.bridge.receive((picked) => openPicked(picked), { app: 'spreadsheet' }); // files opened from other apps ("Open with…")

// the open file for "Create an archive from the open files" (about dialog): the workbook in its format (an empty new one is left out)
Suite.openFiles.register(async () => {
  const data = workbook.save();
  const filled = Object.values(data.sheets || {}).some((sh) => Object.keys(sh.cellData || {}).length);
  if (!state.dirty && !filled) return [];
  return [{ name: state.name, bytes: await Suite.univerXlsx.exportFile(data, state.format, { separator: state.separator }), dirty: state.dirty }];
});

// for tests
window.SS = {
  fonts: () => univerAPI._injector.get(IFontService).getFonts(), univerAPI, state, get workbook() { return workbook; }, outline, openTool, openPrint, printParts, insertChart, editChart, focusedChart, insertDiagram, editDiagram, focusedDiagram, drawingManager: () => univerAPI._injector.get(IDrawingManagerService),
  async importBase64(b64, name) { const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); load(await Suite.univerXlsx.importFile(bin.buffer, name), name); },
};
document.body.dataset.ready = 'true';
