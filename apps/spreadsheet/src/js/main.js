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
    'app.title': 'Spreadsheet', 'ss.new': 'New', 'ss.open': 'Open', 'ss.save': 'Save', 'ss.saveAs': 'Save as', 'ss.fileName': 'File name', 'ss.format': 'Format',
    'ss.cancel': 'Cancel', 'ss.untitled': 'Spreadsheet', 'ss.discard': 'Discard the unsaved changes?', 'ss.loading': 'Opening “{0}”…',
    'ss.csvNote': 'CSV and XLS files keep only values and formulas: formatting, and for CSV all sheets but the first, are lost.',
    'ss.xlsmNote': 'Macros cannot be kept: the workbook is saved as .xlsx.', 'ss.cannotOpen': '“{0}” cannot be opened: {1}',
    'ss.csvImport': 'Import text file', 'ss.encoding': 'Encoding', 'ss.auto': 'Automatic ({0})', 'ss.separator': 'Separator', 'ss.sepComma': 'Comma',
    'ss.sepSemicolon': 'Semicolon', 'ss.sepTab': 'Tab', 'ss.sepPipe': 'Vertical bar', 'ss.types': 'Values', 'ss.typesAuto': 'Recognise numbers and dates',
    'ss.typesText': 'Everything as text', 'ss.decimal': 'Decimal separator', 'ss.preview': 'Preview ({0} rows)', 'ss.import': 'Import',
  },
  de: {
    'app.title': 'Tabellenkalkulation', 'ss.new': 'Neu', 'ss.open': 'Öffnen', 'ss.save': 'Speichern', 'ss.saveAs': 'Speichern unter', 'ss.fileName': 'Dateiname', 'ss.format': 'Format',
    'ss.cancel': 'Abbrechen', 'ss.untitled': 'Tabelle', 'ss.discard': 'Die ungespeicherten Änderungen verwerfen?', 'ss.loading': '„{0}“ wird geöffnet…',
    'ss.csvNote': 'CSV- und XLS-Dateien behalten nur Werte und Formeln: Formatierung und bei CSV alle Blätter außer dem ersten gehen verloren.',
    'ss.xlsmNote': 'Makros können nicht erhalten werden: Die Arbeitsmappe wird als .xlsx gespeichert.', 'ss.cannotOpen': '„{0}“ kann nicht geöffnet werden: {1}',
    'ss.csvImport': 'Textdatei importieren', 'ss.encoding': 'Kodierung', 'ss.auto': 'Automatisch ({0})', 'ss.separator': 'Trennzeichen', 'ss.sepComma': 'Komma',
    'ss.sepSemicolon': 'Strichpunkt', 'ss.sepTab': 'Tabulator', 'ss.sepPipe': 'Senkrechter Strich', 'ss.types': 'Werte', 'ss.typesAuto': 'Zahlen und Datumswerte erkennen',
    'ss.typesText': 'Alles als Text', 'ss.decimal': 'Dezimaltrennzeichen', 'ss.preview': 'Vorschau ({0} Zeilen)', 'ss.import': 'Importieren',
  },
});

const state = { name: '', handle: null, format: 'xlsx', dirty: false, dialog: null, busy: false, csv: null, separator: ',' };
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
  locales: { [LocaleType.EN_US]: mergeLocales(enUS, cfEnUS, dvEnUS), [LocaleType.DE_DE]: mergeLocales(deDE, cfDeDE, dvDeDE) },
  darkMode: dark(),
  presets: [UniverSheetsCorePreset({ container: host }), UniverSheetsConditionalFormattingPreset(), UniverSheetsDataValidationPreset()],
});
let workbook = univerAPI.createWorkbook({ name: t('ss.untitled') });
let loadedAt = performance.now(); // mutations count as edits only after user input that follows the latest load

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
  render();
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

function Toolbar() {
  return html`<nav class="ss-toolbar" role="toolbar">
    <button class="secondary" data-testid="new" onClick=${newWorkbook}>${t('ss.new')}</button>
    <button class="secondary" data-testid="open" onClick=${open} aria-busy=${state.busy}>${t('ss.open')}</button>
    <${Suite.shell.Recent} app=${APP} before=${confirmDiscard} onOpen=${(p) => openPicked(p)} />
    <button class=${state.dirty ? '' : 'secondary outline'} data-testid="save" onClick=${() => save()}>${t('ss.save')}</button>
    <button class="secondary outline" data-testid="save-as" onClick=${() => { state.dialog = { stem: state.name.replace(/\.[^.]+$/, ''), format: state.format }; render(); }}>${t('ss.saveAs')}</button>
    <span class="ss-name" data-testid="file-name">${state.name}${state.dirty ? ' •' : ''}</span>
  </nav>`;
}

function Main() {
  return html`<div class="ss-layout" ref=${(el) => { if (el && host.parentElement !== el) el.appendChild(host); }}><${SaveAsDialog} /><${CsvDialog} /></div>`;
}

Suite.shell.mount({ id: APP, title: 'app.title', version: '%%BUILD_VERSION%%', toolbar: () => html`<${Toolbar} />`, main: () => html`<${Main} />` });
Suite.files.dropZone(document.body, async (picked) => { if (picked.length && await confirmDiscard()) await openPicked(picked[0]); });
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (e.shiftKey) { state.dialog = { stem: state.name.replace(/\.[^.]+$/, ''), format: state.format }; render(); } else save(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); open(); }
}, true);

Suite.bridge.receive((picked) => openPicked(picked), { app: 'spreadsheet' }); // files opened from other apps ("Open with…")

// for tests
window.SS = {
  univerAPI, state, get workbook() { return workbook; },
  async importBase64(b64, name) { const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); load(await Suite.univerXlsx.importFile(bin.buffer, name), name); },
};
document.body.dataset.ready = 'true';
