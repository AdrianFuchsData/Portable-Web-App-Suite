/*
 * Python notebook and console: Pyodide in a worker (shared/js/python-kernel.js), Jupyter notebooks (.ipynb, nbformat 4.5)
 * and Python scripts with "# %%" cells, a console (REPL) on the same kernel, files in the Python file system, wheels.
 */
import { EditorView, basicSetup } from 'codemirror';
import { keymap } from '@codemirror/view';
import { Prec, Compartment } from '@codemirror/state';
import { python } from '@codemirror/lang-python';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { createWidgets, VIEW_MIME } from '@app/widgets.js';
import 'app/spell-dom'; // spelling selector in the header, marks in text fields (shared/js/spell-dom.js)
import { spellChecking } from 'app/cm-spell';

const { html } = Suite.shell;
const t = Suite.t;
const APP = 'notebook';
const HOME = '/home/pyodide';
const TYPES = [{ description: 'Jupyter notebook', accept: { 'application/x-ipynb+json': ['.ipynb'] } }, { description: 'Python', accept: { 'text/x-python': ['.py'] } }];

Suite.i18n.register({
  en: {
    'nb.editorLabel': 'Cell content',
    'app.title': 'Python notebook',
    'nb.new': 'New', 'nb.open': 'Open', 'nb.save': 'Save', 'nb.saveAs': 'Save as', 'nb.exportPy': 'Export .py', 'nb.code': '+ Code', 'nb.markdown': '+ Markdown',
    'nb.runAll': '▶▶ Run all', 'nb.restart': '⟲ Restart', 'nb.notebook': 'Notebook', 'nb.console': 'Console', 'nb.files': 'Files', 'nb.upload': 'Upload…',
    'nb.wheel': 'Install wheel…', 'nb.refresh': 'Refresh', 'nb.delete': 'Delete', 'nb.deleteConfirm': 'Delete “{0}”?', 'nb.starting': 'Starting Python…',
    'nb.ready': 'Python {0} ready', 'nb.busy': 'busy', 'nb.untitled': 'Untitled', 'nb.discard': 'Discard the unsaved changes?', 'nb.run': 'Run', 'nb.moveUp': 'Move up',
    'nb.moveDown': 'Move down', 'nb.deleteCell': 'Delete cell', 'nb.slideshow': 'Slideshow', 'nb.slideType': 'Slide type', 'nb.asSlides': 'Slides', 'nb.asSlidesTitle': 'Open as reveal.js slides (Web slides)', 'nb.undo': 'Undo cell operation', 'nb.redo': 'Redo cell operation', 'nb.toMarkdown': 'Markdown', 'nb.toCode': 'Code', 'nb.consoleHint': 'Enter runs, Shift+Enter starts a new line, ↑/↓ history.',
    'nb.clearConsole': 'Clear', 'nb.restartConfirm': 'Restart Python? All variables are lost (files stay until the page is closed).', 'nb.installed': '{0} installed.',
    'nb.export': 'Export', 'nb.exportHtml': 'HTML page', 'nb.exportHtmlNoCode': 'HTML page without code (report)', 'nb.exportPdf': 'PDF (print)',
    'nb.variables': 'Variables', 'nb.noVariables': 'No variables yet.', 'nb.name': 'Name', 'nb.type': 'Type', 'nb.shape': 'Size', 'nb.value': 'Value',
    'nb.showTable': 'Show as a table', 'nb.close': 'Close',
    'nb.clearOutputs': 'Clear outputs', 'nb.panels': 'Files · Variables', 'nb.loadError': 'The file cannot be opened: {0}', 'nb.up': 'Up',
  },
  de: {
    'nb.editorLabel': 'Zelleninhalt',
    'app.title': 'Python-Notebook',
    'nb.new': 'Neu', 'nb.open': 'Öffnen', 'nb.save': 'Speichern', 'nb.saveAs': 'Speichern unter', 'nb.exportPy': 'Als .py exportieren', 'nb.code': '+ Code', 'nb.markdown': '+ Markdown',
    'nb.runAll': '▶▶ Alle ausführen', 'nb.restart': '⟲ Neu starten', 'nb.notebook': 'Notebook', 'nb.console': 'Konsole', 'nb.files': 'Dateien', 'nb.upload': 'Hochladen…',
    'nb.wheel': 'Wheel installieren…', 'nb.refresh': 'Aktualisieren', 'nb.delete': 'Löschen', 'nb.deleteConfirm': '„{0}“ löschen?', 'nb.starting': 'Python startet…',
    'nb.ready': 'Python {0} bereit', 'nb.busy': 'beschäftigt', 'nb.untitled': 'Unbenannt', 'nb.discard': 'Die ungespeicherten Änderungen verwerfen?', 'nb.run': 'Ausführen', 'nb.moveUp': 'Nach oben',
    'nb.moveDown': 'Nach unten', 'nb.deleteCell': 'Zelle löschen', 'nb.slideshow': 'Folien', 'nb.slideType': 'Folientyp', 'nb.asSlides': 'Folien', 'nb.asSlidesTitle': 'Als reveal.js-Folien öffnen (Web-Folien)', 'nb.undo': 'Zellenaktion rückgängig', 'nb.redo': 'Zellenaktion wiederholen', 'nb.toMarkdown': 'Markdown', 'nb.toCode': 'Code', 'nb.consoleHint': 'Eingabe führt aus, Umschalt+Eingabe beginnt eine neue Zeile, ↑/↓ Verlauf.',
    'nb.clearConsole': 'Leeren', 'nb.restartConfirm': 'Python neu starten? Alle Variablen gehen verloren (Dateien bleiben, bis die Seite geschlossen wird).', 'nb.installed': '{0} installiert.',
    'nb.export': 'Exportieren', 'nb.exportHtml': 'HTML-Seite', 'nb.exportHtmlNoCode': 'HTML-Seite ohne Code (Bericht)', 'nb.exportPdf': 'PDF (Drucken)',
    'nb.variables': 'Variablen', 'nb.noVariables': 'Noch keine Variablen.', 'nb.name': 'Name', 'nb.type': 'Typ', 'nb.shape': 'Größe', 'nb.value': 'Wert',
    'nb.showTable': 'Als Tabelle anzeigen', 'nb.close': 'Schließen',
    'nb.clearOutputs': 'Ausgaben löschen', 'nb.panels': 'Dateien · Variablen', 'nb.loadError': 'Die Datei kann nicht geöffnet werden: {0}', 'nb.up': 'Nach oben',
  },
});

// ---- state ------------------------------------------------------------------------------------------------

const state = {
  cells: [], selected: null, count: 0, file: null, name: '', dirty: false, status: '', ready: false, busy: 0,
  tab: 'notebook', consoleEntries: [], history: [], historyIndex: -1, files: [], cwd: HOME, panels: false, wheels: new Map(),
  variables: [], sideTab: 'files', table: null, // table: { name, html } in the table viewer
};
state.name = `${t('nb.untitled')}.ipynb`;
const kernel = Suite.python.start({ onStatus: (s) => { state.status = s; render(); }, onComm: (msg) => widgets.onComm(msg), preloadImports: ['numpy', 'pandas', 'matplotlib.pyplot'] });

let queued = false;
function render() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; Suite.shell.refresh(); });
}
const fail = (e) => { console.warn(e); Suite.shell.toast(Suite.i18n.describe(e), 'error'); };
function changed() { if (!state.dirty) { state.dirty = true; Suite.shell.setDirty(true); render(); } }

// ---- outputs (nbformat 4) ----------------------------------------------------------------------------------

// HTML from outputs and Markdown may come from other people's notebooks: no scripts, no event handlers,
// and only embedded (data:/blob:) images and in-page links
const clean = (h) => DOMPurify.sanitize(h, { FORBID_TAGS: ['style'], FORBID_ATTR: ['srcset'], ALLOWED_URI_REGEXP: /^(?:data:image\/|blob:|#)/i });
const text = (v) => (Array.isArray(v) ? v.join('') : v || '');
const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');

Suite.notebookClean = clean; // (for the HTML widget)

function Output({ o }) {
  const view = o.data && o.data[VIEW_MIME];
  if (view && widgets.has(view.model_id)) return html`<div data-testid="output" class="nb-widget"><${widgets.View} id=${view.model_id} /></div>`;
  if (o.output_type === 'stream') return html`<pre class=${o.name === 'stderr' ? 'nb-stderr' : ''} data-testid="output">${text(o.text)}</pre>`;
  if (o.output_type === 'error') return html`<pre class="nb-error" data-testid="output">${stripAnsi(text(o.traceback) || `${o.ename}: ${o.evalue}`)}</pre>`;
  const d = o.data || {};
  if (d['image/png']) return html`<img data-testid="output" src=${`data:image/png;base64,${text(d['image/png']).replace(/\s/g, '')}`} alt="" />`;
  if (d['image/jpeg']) return html`<img data-testid="output" src=${`data:image/jpeg;base64,${text(d['image/jpeg']).replace(/\s/g, '')}`} alt="" />`;
  for (const type of ['image/svg+xml', 'text/html']) if (d[type]) return html`<div class="nb-html" data-testid="output" dangerouslySetInnerHTML=${{ __html: clean(text(d[type])) }}></div>`;
  if (d['text/markdown']) return html`<div class="nb-html" data-testid="output" dangerouslySetInnerHTML=${{ __html: clean(marked.parse(text(d['text/markdown']))) }}></div>`;
  return html`<pre data-testid="output">${text(d['text/plain'])}</pre>`;
}

function appendOutput(list, output) {
  if (output.output_type === 'clear_output') { list.length = 0; render(); return; } // (not an nbformat output)
  // merge consecutive stream outputs of the same kind (like Jupyter)
  const last = list[list.length - 1];
  if (output.output_type === 'stream' && last && last.output_type === 'stream' && last.name === output.name) last.text = text(last.text) + output.text;
  else list.push(output);
  render();
}

// interactive widgets (ipywidgets subset, shared/js/python-widgets.py)
const widgets = createWidgets({ kernel, render, appendOutput });
widgets.setOutputView(Output);

// ---- editors ----------------------------------------------------------------------------------------------------

const dark = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
const themes = new Set();
new MutationObserver(() => { for (const fn of themes) fn(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

/** spellMode: () => 'prose' (Markdown cells) or 'code' (only comments and strings), see shared/js/cm-spell.js */
function makeEditor(doc, lang, keys, onChange, spellMode = () => 'code') {
  const theme = new Compartment();
  const language = new Compartment();
  const view = new EditorView({
    doc,
    extensions: [Prec.highest(keymap.of(keys)), basicSetup, EditorView.contentAttributes.of({ 'aria-label': t('nb.editorLabel') }), spellChecking(spellMode), language.of(lang), theme.of(dark() ? oneDark : []), EditorView.lineWrapping,
      EditorView.updateListener.of((u) => { if (u.docChanged && onChange) onChange(); if (u.focusChanged && u.view.hasFocus && view.onFocus) view.onFocus(); })],
  });
  themes.add(() => view.dispatch({ effects: theme.reconfigure(dark() ? oneDark : []) }));
  view.setLanguage = (l) => view.dispatch({ effects: language.reconfigure(l) });
  return view;
}

// ---- undo of cell operations (insert, delete, move, change type, clear outputs) -----------------------------------
// The text inside a cell has the editor's own undo. Cells keep their editor, so a snapshot refers to the cell objects.
// Outputs are only restored for 'outputs' steps (clearing, changing the type), so running cells is never undone.

const cellHistory = new Suite.UndoHistory({
  limit: 50,
  clone: ({ kind, cells }) => ({ kind, cells: cells.map((c) => ({ cell: c, type: c.type, outputs: c.outputs, count: c.count })) }),
  onChange: () => render(),
});
const recordCells = (kind = 'cells') => cellHistory.record({ kind, cells: state.cells });

function cellStep(redo) {
  const stack = redo ? cellHistory.redoStack : cellHistory.undoStack;
  if (!stack.length) return;
  const kind = stack[stack.length - 1].snap.kind;
  const snap = redo ? cellHistory.redo({ kind, cells: state.cells }) : cellHistory.undo({ kind, cells: state.cells });
  for (const { cell, type, outputs, count } of snap.cells) {
    if (cell.type !== type) { cell.type = type; cell.rendered = false; cell.view.setLanguage(type === 'code' ? python() : markdown()); }
    if (kind === 'outputs') { cell.outputs = outputs; cell.count = count; }
  }
  state.cells = snap.cells.map((s) => s.cell);
  if (!state.cells.includes(state.selected)) state.selected = state.cells[0];
  changed();
  render();
}

let nextCellId = 1;
const cellId = () => `c${Date.now().toString(36)}${(nextCellId++).toString(36)}`;

function newCell(type = 'code', source = '', { outputs = [], count = null, id = null, metadata = {} } = {}) {
  const cell = { id: id || cellId(), type, outputs, count, metadata, running: false, rendered: type === 'markdown' && !!source };
  const run = (mode) => () => { runCell(cell, mode); return true; };
  cell.view = makeEditor(source, type === 'code' ? python() : markdown(), [
    { key: 'Shift-Enter', run: run('advance') }, { key: 'Mod-Enter', run: run('stay') }, { key: 'Alt-Enter', run: run('insert') },
    { key: 'Escape', run: () => { cell.view.contentDOM.blur(); document.querySelector(`[data-cell="${cell.id}"]`)?.focus(); return true; } },
  ], changed, () => (cell.type === 'markdown' ? 'prose' : 'code'));
  cell.view.onFocus = () => { if (state.selected !== cell) { state.selected = cell; render(); } };
  return cell;
}

function insertCell(type, at = null, source = '') {
  const cell = newCell(type, source);
  const index = at === null ? state.cells.length : at;
  recordCells();
  state.cells.splice(index, 0, cell);
  state.selected = cell;
  changed();
  render();
  requestAnimationFrame(() => cell.view.focus());
  return cell;
}

const selectedIndex = () => Math.max(0, state.cells.indexOf(state.selected));

function setType(cell, type) {
  if (cell.type === type) return;
  recordCells('outputs');
  cell.type = type;
  cell.outputs = [];
  cell.count = null;
  cell.rendered = false;
  cell.view.setLanguage(type === 'code' ? python() : markdown());
  changed();
  render();
}

function moveCell(cell, dir) {
  const i = state.cells.indexOf(cell);
  const j = i + dir;
  if (j < 0 || j >= state.cells.length) return;
  recordCells();
  state.cells.splice(i, 1);
  state.cells.splice(j, 0, cell);
  changed();
  render();
}

function deleteCell(cell) {
  const i = state.cells.indexOf(cell);
  recordCells();
  state.cells.splice(i, 1);
  if (!state.cells.length) state.cells.push(newCell());
  state.selected = state.cells[Math.min(i, state.cells.length - 1)];
  changed();
  render();
}

// ---- running ----------------------------------------------------------------------------------------------------

async function execute(code, outputs) {
  const count = ++state.count;
  state.busy++;
  render();
  try {
    await kernel.ready;
    widgets.running(outputs); // widgets created now belong to this cell (outputs of their callbacks go here)
    await kernel.run(code, count, (o) => appendOutput(outputs, o));
  } catch (e) {
    appendOutput(outputs, { output_type: 'error', ename: 'KernelError', evalue: e.message, traceback: [e.message] });
  } finally {
    widgets.running(null);
    state.busy--;
    render();
    refreshFiles();
    refreshVariables();
  }
  return count;
}

async function runCell(cell, mode = 'stay') {
  if (cell.type === 'markdown') {
    cell.rendered = true;
    render();
  } else {
    cell.outputs = [];
    cell.running = true;
    render();
    cell.count = await execute(cell.view.state.doc.toString(), cell.outputs);
    cell.running = false;
    changed();
    render();
  }
  if (mode === 'advance' || mode === 'insert') {
    const i = state.cells.indexOf(cell);
    let next = mode === 'advance' ? state.cells[i + 1] : null;
    if (!next) next = insertCell('code', i + 1);
    state.selected = next;
    render();
    if (next.type === 'code' || !next.rendered) requestAnimationFrame(() => next.view.focus());
  }
}

async function runAll() { for (const c of [...state.cells]) await runCell(c, 'stay'); }

async function restart(ask = true) {
  if (ask && !(await Suite.shell.confirm(t('nb.restartConfirm')))) return;
  state.count = 0;
  state.variables = [];
  state.ready = false;
  widgets.stop();
  render();
  try {
    const info = await kernel.restart();
    for (const [name, bytes] of state.wheels) await kernel.installWheel(name, bytes.slice());
    state.ready = true;
    state.status = t('nb.ready', info.python);
  } catch (e) { fail(e); }
  render();
  refreshFiles();
}

// ---- console ----------------------------------------------------------------------------------------------------

const consoleEditor = makeEditor('', python(), [
  { key: 'Enter', run: () => { runConsole(); return true; } },
  { key: 'ArrowUp', run: (v) => historyStep(v, -1) },
  { key: 'ArrowDown', run: (v) => historyStep(v, 1) },
]);
consoleEditor.dom.dataset.testid = 'console-input';

function historyStep(view, dir) {
  const { state: s } = view;
  const line = s.doc.lineAt(s.selection.main.head);
  if (dir < 0 && line.number !== 1) return false;
  if (dir > 0 && line.number !== s.doc.lines) return false;
  if (!state.history.length) return false;
  const i = state.historyIndex < 0 ? state.history.length : state.historyIndex;
  const next = Math.max(0, Math.min(state.history.length, i + dir));
  state.historyIndex = next;
  const value = next === state.history.length ? '' : state.history[next];
  view.dispatch({ changes: { from: 0, to: s.doc.length, insert: value }, selection: { anchor: value.length } });
  return true;
}

async function runConsole() {
  const code = consoleEditor.state.doc.toString();
  if (!code.trim()) return;
  consoleEditor.dispatch({ changes: { from: 0, to: consoleEditor.state.doc.length, insert: '' } });
  state.history.push(code);
  state.historyIndex = -1;
  const entry = { code, outputs: [], count: null };
  state.consoleEntries.push(entry);
  render();
  entry.count = await execute(code, entry.outputs);
  render();
  requestAnimationFrame(() => { const log = document.querySelector('.nb-console-log'); if (log) log.scrollTop = log.scrollHeight; });
}

// ---- files ----------------------------------------------------------------------------------------------------------

async function refreshVariables() {
  if (!state.ready) return;
  try { state.variables = await kernel.variables(); } catch (e) { console.warn(e); }
  render();
}

async function showTable(name) {
  try { state.table = { name, html: await kernel.table(name) }; } catch (e) { fail(e); }
  render();
}

async function refreshFiles() {
  if (!state.ready) return;
  try {
    const list = await kernel.listFiles(state.cwd);
    state.files = list.sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name));
  } catch (e) { state.cwd = HOME; }
  render();
}

function pick(accept, multiple, handler) {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = multiple;
  if (accept) input.accept = accept;
  input.style.display = 'none';
  input.onchange = async () => { const files = [...input.files]; input.remove(); for (const f of files) await handler(f).catch(fail); refreshFiles(); };
  document.body.appendChild(input);
  input.click();
}

async function uploadFile(file) { await kernel.ready; await kernel.writeFile(`${state.cwd}/${file.name}`, new Uint8Array(await file.arrayBuffer())); }

async function installWheel(file) {
  await kernel.ready;
  const bytes = new Uint8Array(await file.arrayBuffer());
  state.busy++;
  render();
  try {
    await kernel.installWheel(file.name, bytes.slice());
    state.wheels.set(file.name, bytes); // re-installed after a restart (lost when the page is closed)
    Suite.shell.toast(t('nb.installed', file.name));
  } finally { state.busy--; render(); }
}

// ---- notebook files ----------------------------------------------------------------------------------------------------

const lines = (s) => s.split(/(?<=\n)/);

function toNotebook() {
  return {
    cells: state.cells.map((c) => (c.type === 'code'
      ? { cell_type: 'code', id: c.id, execution_count: c.count, metadata: c.metadata || {}, outputs: c.outputs, source: lines(c.view.state.doc.toString()) }
      : { cell_type: 'markdown', id: c.id, metadata: c.metadata || {}, source: lines(c.view.state.doc.toString()) })),
    metadata: {
      kernelspec: { name: 'python3', display_name: 'Python 3 (Pyodide)', language: 'python' },
      language_info: { name: 'python', file_extension: '.py', mimetype: 'text/x-python' },
      ...(() => { const w = widgets.toMetadata(state.cells.filter((c) => c.type === 'code').map((c) => c.outputs)); return w ? { widgets: w } : {}; })(),
    },
    nbformat: 4,
    nbformat_minor: 5,
  };
}

function fromNotebook(nb) {
  if (!nb || !Array.isArray(nb.cells)) throw new Error('no "cells" list');
  widgets.fromMetadata(nb.metadata); // saved widget state: shown inactive until the cells run again
  const cells = [];
  for (const c of nb.cells) {
    if (c.cell_type === 'raw') continue;
    cells.push(newCell(c.cell_type === 'markdown' ? 'markdown' : 'code', text(c.source), { outputs: c.outputs || [], count: c.execution_count ?? null, id: typeof c.id === 'string' ? c.id : null, metadata: c.metadata && typeof c.metadata === 'object' ? c.metadata : {} }));
  }
  return cells;
}

/** Python script with "# %%" cell markers (the "percent" format of VS Code, Spyder and Jupytext). */
function fromPython(source) {
  const parts = source.split(/^# %%(.*)$/m);
  const cells = [];
  if (parts[0].trim()) cells.push(newCell('code', parts[0].trim()));
  for (let i = 1; i < parts.length; i += 2) {
    const markdownCell = /\[markdown\]/i.test(parts[i]);
    let body = parts[i + 1].replace(/^\n/, '').replace(/\n+$/, '');
    if (markdownCell) body = body.split('\n').map((l) => l.replace(/^# ?/, '')).join('\n');
    cells.push(newCell(markdownCell ? 'markdown' : 'code', body));
  }
  return cells.length ? cells : [newCell('code', source)];
}

function toPython() {
  return `${state.cells.map((c) => (c.type === 'code' ? `# %%\n${c.view.state.doc.toString()}` : `# %% [markdown]\n${c.view.state.doc.toString().split('\n').map((l) => `# ${l}`.trimEnd()).join('\n')}`)).join('\n\n')}\n`;
}

// recovery copies of unsaved work (shared/js/autosave.js)
Suite.autosave.register({
  app: APP,
  save: () => (state.dirty ? { name: state.name, file: state.file && state.file.handle ? { handle: state.file.handle, name: state.file.name } : null, nb: toNotebook() } : null),
  restore: (s) => { setCells(fromNotebook(s.nb), s.name, s.file); changed(); },
});

function setCells(cells, name, file) {
  state.cells = cells.length ? cells : [newCell()];
  cellHistory.clear();
  state.selected = state.cells[0];
  state.name = name;
  state.file = file;
  state.dirty = false;
  Suite.shell.setDirty(false);
  render();
}

async function openFile() {
  if (state.dirty && !(await Suite.shell.confirm(t('nb.discard')))) return;
  const picked = await Suite.files.open({ types: TYPES }).catch(fail);
  if (picked) await openPicked(picked[0]);
}

async function openPicked({ file, handle }) {
  try {
    const content = await file.text();
    if (/\.py$/i.test(file.name)) setCells(fromPython(content), file.name.replace(/\.py$/i, '.ipynb'), null);
    else { setCells(fromNotebook(JSON.parse(content)), file.name, { handle }); if (handle) Suite.files.remember(APP, handle); }
  } catch (e) { Suite.shell.toast(t('nb.loadError', e.message), 'error'); }
}

async function save(as = false) {
  try {
    const bytes = new TextEncoder().encode(`${JSON.stringify(toNotebook(), null, 1)}\n`);
    const result = as || !state.file || !state.file.handle ? await Suite.files.saveAs(bytes, { suggestedName: state.name, types: [TYPES[0]], type: 'application/x-ipynb+json' })
      : await Suite.files.save({ name: state.name, handle: state.file.handle }, bytes, { type: 'application/x-ipynb+json' });
    if (!result) return;
    if (result.mode === 'downloaded') Suite.shell.banner(result.message); else Suite.shell.toast(result.message);
    state.file = { handle: result.handle || (state.file && state.file.handle) };
    state.name = result.name || state.name;
    state.dirty = false;
    Suite.shell.setDirty(false);
    render();
  } catch (e) { fail(e); }
}

// ---- UI -------------------------------------------------------------------------------------------------------------

// ---- export as HTML / PDF ---------------------------------------------------------------------------------------

const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function outputHtml(o) {
  if (o.output_type === 'stream') return `<pre class="${o.name === 'stderr' ? 'stderr' : 'stream'}">${escHtml(text(o.text))}</pre>`;
  if (o.output_type === 'error') return `<pre class="error">${escHtml(stripAnsi(text(o.traceback) || `${o.ename}: ${o.evalue}`))}</pre>`;
  const d = o.data || {};
  if (d['image/png']) return `<img alt="" src="data:image/png;base64,${text(d['image/png']).replace(/\s/g, '')}">`;
  if (d['image/jpeg']) return `<img alt="" src="data:image/jpeg;base64,${text(d['image/jpeg']).replace(/\s/g, '')}">`;
  for (const type of ['image/svg+xml', 'text/html']) if (d[type]) return `<div class="html">${clean(text(d[type]))}</div>`;
  if (d['text/markdown']) return `<div class="html">${clean(marked.parse(text(d['text/markdown'])))}</div>`;
  return `<pre class="stream">${escHtml(text(d['text/plain']))}</pre>`;
}

const EXPORT_CSS = `body{font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem;color:#1d1f23}
.cell{margin:0 0 1rem}.code pre.src{background:#f5f6f8;border:1px solid #e1e4e8;border-radius:4px;padding:.6rem .8rem;overflow:auto;margin:0}
.prompt{color:#888;font:12px ui-monospace,monospace;margin:.2rem 0}pre{white-space:pre-wrap;word-break:break-word;font:13px/1.45 ui-monospace,"Cascadia Mono",Consolas,monospace}
.out{margin:.3rem 0 0 .2rem}.out pre{margin:.2rem 0}.stderr{background:#fff5f5}.error{color:#b00020}img{max-width:100%}
table{border-collapse:collapse;font-size:13px}th,td{border:1px solid #ddd;padding:.2rem .5rem}th{background:#f5f6f8}
@media print{body{margin:0;max-width:none}.cell{break-inside:avoid}}`;

/** The notebook as a self-contained HTML page (code optional; outputs and Markdown sanitized like on screen). */
function toHtml({ code = true } = {}) {
  const cells = state.cells.map((cell) => {
    const src = cell.view.state.doc.toString();
    if (cell.type === 'markdown') return `<section class="cell md">${clean(marked.parse(src))}</section>`;
    const input = code ? `<div class="prompt">In [${cell.count ?? ' '}]:</div><pre class="src">${escHtml(src)}</pre>` : '';
    const outs = cell.outputs.length ? `<div class="out">${cell.outputs.map(outputHtml).join('')}</div>` : '';
    return input || outs ? `<section class="cell code">${input}${outs}</section>` : '';
  }).join('\n');
  const title = escHtml(state.name.replace(/\.(ipynb|py)$/i, ''));
  return `<!doctype html>\n<html lang="${Suite.i18n.language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>${EXPORT_CSS}</style></head>\n<body>\n${cells}\n</body></html>\n`;
}

function exportAs(kind) {
  const stem = state.name.replace(/\.(ipynb|py)$/i, '');
  if (kind === 'py') Suite.files.download(new TextEncoder().encode(toPython()), `${stem}.py`, 'text/x-python');
  if (kind === 'html' || kind === 'html-nocode') Suite.files.download(new TextEncoder().encode(toHtml({ code: kind === 'html' })), `${stem}.html`, 'text/html');
  if (kind === 'pdf') {
    // print the export in a hidden frame; the browser's "Save as PDF" gives a PDF
    document.querySelectorAll('iframe.nb-print-frame').forEach((f) => f.remove());
    const frame = document.createElement('iframe');
    frame.className = 'nb-print-frame';
    frame.srcdoc = toHtml({ code: true });
    frame.onload = () => {
      frame.contentWindow.addEventListener('afterprint', () => setTimeout(() => frame.remove(), 2000));
      setTimeout(() => frame.remove(), 120000);
      frame.contentWindow.print();
    };
    document.body.append(frame);
  }
}

function Cell({ cell }) {
  const selected = state.selected === cell;
  return html`<div class=${`nb-cell ${cell.type} ${selected ? 'selected' : ''} ${cell.running ? 'running' : ''}`} data-testid="cell" data-type=${cell.type} data-cell=${cell.id} tabindex="-1"
      onClick=${() => { if (!selected) { state.selected = cell; render(); } }}>
    <div class="nb-prompt" data-testid="prompt">${cell.type === 'code' ? `[${cell.running ? '*' : cell.count ?? ' '}]` : ''}</div>
    <div class="nb-body">
      ${cell.type === 'markdown' && cell.rendered
        ? html`<div class="nb-markdown" data-testid="markdown" onDblClick=${() => { cell.rendered = false; render(); requestAnimationFrame(() => cell.view.focus()); }}
            dangerouslySetInnerHTML=${{ __html: clean(marked.parse(cell.view.state.doc.toString())) }}></div>`
        : html`<div class="nb-editor" ref=${(el) => { if (el && cell.view.dom.parentElement !== el) el.replaceChildren(cell.view.dom); }}></div>`}
      ${cell.outputs.length ? html`<div class="nb-outputs" data-testid="outputs">${cell.outputs.map((o) => html`<${Output} o=${o} />`)}</div>` : null}
    </div>
    ${state.slideshow ? html`<select class="nb-slide-type" title=${t('nb.slideType')} aria-label=${t('nb.slideType')} data-testid="slide-type" onClick=${(e) => e.stopPropagation()}
      onChange=${(e) => { cell.metadata = { ...cell.metadata, slideshow: { slide_type: e.target.value } }; if (e.target.value === '-') delete cell.metadata.slideshow; changed(); }}>
      ${['-', 'slide', 'subslide', 'fragment', 'skip', 'notes'].map((v) => html`<option value=${v} selected=${((cell.metadata || {}).slideshow || {}).slide_type === v || (v === '-' && !(cell.metadata || {}).slideshow)}>${v}</option>`)}
    </select>` : null}
    <div class="nb-tools">
      <button class="secondary outline" title=${t('nb.run')} data-testid="run-cell" onClick=${(e) => { e.stopPropagation(); runCell(cell, 'stay'); }}>▶</button>
      <button class="secondary outline" title=${cell.type === 'code' ? t('nb.toMarkdown') : t('nb.toCode')} data-testid="toggle-type" onClick=${() => setType(cell, cell.type === 'code' ? 'markdown' : 'code')}>${cell.type === 'code' ? 'M' : '{ }'}</button>
      <button class="secondary outline" title=${t('nb.moveUp')} onClick=${() => moveCell(cell, -1)}>↑</button>
      <button class="secondary outline" title=${t('nb.moveDown')} onClick=${() => moveCell(cell, 1)}>↓</button>
      <button class="secondary outline" title=${t('nb.deleteCell')} data-testid="delete-cell" onClick=${() => deleteCell(cell)}>✕</button>
    </div>
  </div>`;
}

function Notebook() {
  return html`<section class="nb-cells" data-testid="cells">${state.cells.map((c) => html`<${Cell} cell=${c} key=${c.id} />`)}
    <div class="nb-add"><button class="secondary outline" onClick=${() => insertCell('code')}>${t('nb.code')}</button><button class="secondary outline" onClick=${() => insertCell('markdown')}>${t('nb.markdown')}</button></div>
  </section>`;
}

function Console() {
  return html`<section class="nb-console" data-testid="console">
    <div class="nb-console-log" data-testid="console-log">${state.consoleEntries.map((e) => html`<div class="nb-console-entry" data-testid="console-entry">
      <pre class="nb-console-code"><span class="nb-prompt">[${e.count ?? '*'}]</span> ${e.code}</pre>
      ${e.outputs.map((o) => html`<${Output} o=${o} />`)}</div>`)}</div>
    <div class="nb-console-input"><span class="nb-prompt">>>></span><div class="nb-editor" ref=${(el) => { if (el && consoleEditor.dom.parentElement !== el) { el.replaceChildren(consoleEditor.dom); requestAnimationFrame(() => consoleEditor.focus()); } }}></div></div>
    <div class="nb-console-bar"><small>${t('nb.consoleHint')}</small><button class="secondary outline" data-testid="clear-console" onClick=${() => { state.consoleEntries = []; render(); }}>${t('nb.clearConsole')}</button></div>
  </section>`;
}

function Variables() {
  return html`<section class="nb-vars" data-testid="variables">
    ${state.variables.length ? html`<table><thead><tr><th>${t('nb.name')}</th><th>${t('nb.type')}</th><th>${t('nb.shape')}</th><th>${t('nb.value')}</th></tr></thead>
      <tbody>${state.variables.map((v) => html`<tr data-testid="variable" class=${v.table ? 'nb-var-table' : ''} title=${v.table ? t('nb.showTable') : v.value}
        onClick=${() => { if (v.table) { state.panels = false; showTable(v.name); } }}>
        <td><code>${v.name}</code></td><td>${v.type}${v.dtype ? html`<small> ${v.dtype}</small>` : null}</td><td>${v.shape}</td><td class="nb-var-value">${v.table ? '▦ ' : ''}${v.value}</td></tr>`)}</tbody></table>`
      : html`<p><small>${t('nb.noVariables')}</small></p>`}
  </section>`;
}

function TableDialog() {
  const tb = state.table;
  if (!tb) return null;
  const close = () => { state.table = null; render(); };
  return html`<dialog open data-testid="table-dialog" onKeyDown=${(e) => { if (e.key === 'Escape') close(); }}><article class="nb-table-view">
    <header><strong><code>${tb.name}</code></strong></header>
    <div class="nb-html nb-table-scroll" dangerouslySetInnerHTML=${{ __html: clean(tb.html) }}></div>
    <footer><button data-testid="table-close" onClick=${close}>${t('nb.close')}</button></footer>
  </article></dialog>`;
}

function Files() {
  return html`<aside class=${`nb-files suite-drawer ${state.panels ? 'open' : ''}`} data-testid="files">
    <div class="nb-side-tabs" role="tablist">
      <button role="tab" class=${state.sideTab === 'files' ? '' : 'secondary outline'} data-testid="side-files" onClick=${() => { state.sideTab = 'files'; render(); }}>${t('nb.files')}</button>
      <button role="tab" class=${state.sideTab === 'variables' ? '' : 'secondary outline'} data-testid="side-variables" onClick=${() => { state.sideTab = 'variables'; refreshVariables(); render(); }}>${t('nb.variables')}${state.variables.length ? ` (${state.variables.length})` : ''}</button>
    </div>
    ${state.sideTab === 'variables' ? html`<${Variables} />` : html`<${FileList} />`}
  </aside>`;
}

function FileList() {
  return html`<div class="nb-file-list">
    <div class="nb-files-head"><strong>${t('nb.files')}</strong><code>${state.cwd}</code></div>
    <div class="nb-files-buttons">
      <button class="secondary outline" data-testid="upload" onClick=${() => pick(null, true, uploadFile)}>${t('nb.upload')}</button>
      <button class="secondary outline" data-testid="install-wheel" onClick=${() => pick('.whl', true, installWheel)}>${t('nb.wheel')}</button>
      <button class="secondary outline" title=${t('nb.refresh')} onClick=${refreshFiles}>⟳</button>
    </div>
    <ul>
      ${state.cwd !== HOME && state.cwd !== '/' ? html`<li><a href="#" data-testid="files-up" onClick=${(e) => { e.preventDefault(); state.cwd = state.cwd.replace(/\/[^/]+$/, '') || '/'; refreshFiles(); }}>📁 ..</a></li>` : null}
      ${state.files.map((f) => html`<li data-testid="file">
        <a href="#" data-testid="file-name" title=${f.dir ? '' : `${f.size} B`} onClick=${async (e) => {
          e.preventDefault();
          if (f.dir) { state.cwd = `${state.cwd}/${f.name}`; refreshFiles(); return; }
          try { Suite.files.download(await kernel.readFile(`${state.cwd}/${f.name}`), f.name); } catch (err) { fail(err); }
        }}>${f.dir ? '📁' : '📄'} ${f.name}</a>
        ${f.dir ? null : html`<button class="secondary outline" title=${t('bridge.openWith')} aria-label=${t('bridge.openWith')} data-testid="file-open-with" onClick=${() => {
          const path = `${state.cwd}/${f.name}`;
          Suite.bridge.openWith(f.name, { exclude: 'notebook', source: `Python: ${path}`, data: () => kernel.readFile(path), save: async (bytes) => { await kernel.writeFile(path, bytes); refreshFiles(); } });
        }}>↗</button>`}
        <button class="secondary outline" title=${t('nb.delete')} data-testid="file-delete" onClick=${async () => { if (await Suite.shell.confirm(t('nb.deleteConfirm', f.name))) { try { await kernel.removeFile(`${state.cwd}/${f.name}`); } catch (e) { fail(e); } refreshFiles(); } }}>×</button></li>`)}
    </ul>
  </div>`;
}

function Toolbar() {
  return html`<nav class="nb-toolbar" role="toolbar">
    <button class="secondary" data-testid="new" onClick=${async () => { if (!state.dirty || await Suite.shell.confirm(t('nb.discard'))) setCells([newCell()], `${t('nb.untitled')}.ipynb`, null); }}>${t('nb.new')}</button>
    <button class="secondary" data-testid="open" onClick=${openFile}>${t('nb.open')}</button>
    <${Suite.shell.Recent} app=${APP} before=${() => !state.dirty || Suite.shell.confirm(t('nb.discard'))} onOpen=${(p) => openPicked(p)} />
    <button class=${state.dirty ? '' : 'secondary outline'} data-testid="save" onClick=${() => save()}>${t('nb.save')}</button>
    <button class="secondary outline" data-testid="save-as" onClick=${() => save(true)}>${t('nb.saveAs')}</button>
    <select data-testid="export" aria-label=${t('nb.export')} onChange=${(e) => { const v = e.target.value; e.target.value = ''; if (v) exportAs(v); }}>
      <option value="">${t('nb.export')}…</option>
      <option value="py">${t('nb.exportPy')}</option><option value="html">${t('nb.exportHtml')}</option><option value="html-nocode">${t('nb.exportHtmlNoCode')}</option><option value="pdf">${t('nb.exportPdf')}</option></select>
    <span class="nb-sep"></span>
    <button class="secondary outline" title="${t('nb.undo')} (Z)" data-testid="undo" disabled=${!cellHistory.canUndo} onClick=${() => cellStep(false)}>↶</button>
    <button class="secondary outline" title="${t('nb.redo')} (Shift+Z)" data-testid="redo" disabled=${!cellHistory.canRedo} onClick=${() => cellStep(true)}>↷</button>
    <button class="secondary outline" data-testid="add-code" onClick=${() => insertCell('code', selectedIndex() + 1)}>${t('nb.code')}</button>
    <button class="secondary outline" data-testid="add-markdown" onClick=${() => insertCell('markdown', selectedIndex() + 1)}>${t('nb.markdown')}</button>
    <button data-testid="run-all" onClick=${runAll}>${t('nb.runAll')}</button>
    <button class="secondary outline" data-testid="clear-outputs" onClick=${() => { recordCells('outputs'); for (const c of state.cells) { c.outputs = []; c.count = null; } changed(); render(); }}>${t('nb.clearOutputs')}</button>
    <button class="secondary outline" data-testid="restart" onClick=${() => restart()}>${t('nb.restart')}</button>
    <button class=${state.slideshow ? '' : 'secondary outline'} aria-pressed=${!!state.slideshow} data-testid="slideshow" onClick=${() => { state.slideshow = !state.slideshow; render(); }}>${t('nb.slideshow')}</button>
    <button class="secondary outline" title=${t('nb.asSlidesTitle')} data-testid="as-slides"
      onClick=${() => Suite.bridge.openIn('reveal', { name: state.name.replace(/\.py$/i, '.ipynb'), data: JSON.stringify(toNotebook()), source: state.name }).catch(fail)}>🎞️ ${t('nb.asSlides')}</button>
    <button class="secondary outline nb-only-phone" data-testid="toggle-panels" onClick=${() => { state.panels = !state.panels; render(); }}>${t('nb.panels')}</button>
  </nav>`;
}

function Main() {
  return html`<div class="nb-layout">
    <div class="nb-work">
      <div class="nb-tabs" role="tablist">
        <button role="tab" class=${state.tab === 'notebook' ? '' : 'secondary outline'} data-testid="tab-notebook" onClick=${() => { state.tab = 'notebook'; render(); }}>📓 ${t('nb.notebook')}: ${state.name}${state.dirty ? ' •' : ''}</button>
        <button role="tab" class=${state.tab === 'console' ? '' : 'secondary outline'} data-testid="tab-console" onClick=${() => { state.tab = 'console'; render(); }}>${t('nb.console')}</button>
        <span class=${`nb-status ${state.busy ? 'busy' : state.ready ? 'ready' : ''}`} data-testid="status">${state.busy ? t('nb.busy') : state.status}</span>
      </div>
      ${state.tab === 'notebook' ? html`<${Notebook} />` : html`<${Console} />`}
    </div>
    <${Files} />${state.panels ? Suite.shell.backdrop(() => { state.panels = false; render(); }) : null}
    <${TableDialog} />
  </div>`;
}

Suite.shell.mount({ id: APP, title: 'app.title', version: '%%BUILD_VERSION%%', toolbar: () => html`<${Toolbar} />`, main: () => html`<${Main} />` });
Suite.files.dropZone(document.body, async (picked) => {
  for (const p of picked) {
    if (/\.(ipynb|py)$/i.test(p.file.name)) { if (!state.dirty || await Suite.shell.confirm(t('nb.discard'))) await openPicked(p); return; }
    if (/\.whl$/i.test(p.file.name)) await installWheel(p.file).catch(fail); else await uploadFile(p.file).catch(fail);
  }
  refreshFiles();
});

// command mode: keys on a selected cell that is not being edited
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(e.shiftKey); return; }
  if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); openFile(); return; }
  if (state.tab !== 'notebook' || e.altKey) return;
  const active = document.activeElement;
  if (active && (active.closest('.cm-editor') || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))) return;
  // command mode: Z / Shift+Z (as in Jupyter) and Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z undo and redo cell operations
  const undoKey = Suite.UndoHistory.key(e) || (!mod && e.key.toLowerCase() === 'z' ? (e.shiftKey ? 'redo' : 'undo') : null);
  if (undoKey) { e.preventDefault(); cellStep(undoKey === 'redo'); return; }
  if (mod) return;
  const cell = state.selected;
  if (!cell) return;
  const i = state.cells.indexOf(cell);
  const keys = {
    Enter: () => { if (cell.type === 'markdown') cell.rendered = false; render(); requestAnimationFrame(() => cell.view.focus()); },
    a: () => insertCell('code', i), b: () => insertCell('code', i + 1), m: () => setType(cell, 'markdown'), y: () => setType(cell, 'code'),
    ArrowUp: () => { state.selected = state.cells[Math.max(0, i - 1)]; render(); }, ArrowDown: () => { state.selected = state.cells[Math.min(state.cells.length - 1, i + 1)]; render(); },
    Delete: () => deleteCell(cell),
  };
  const fn = keys[e.key];
  if (fn) { e.preventDefault(); fn(); }
});

// start
state.cells = [
  newCell('markdown', '# Python notebook\nRuns **completely in the browser** (Pyodide). `Shift+Enter` runs a cell.'),
  newCell('code', "import numpy as np\nimport pandas as pd\nimport matplotlib.pyplot as plt\n\ndf = pd.DataFrame({'x': np.arange(10), 'y': np.arange(10) ** 2})\ndf.head()"),
];
state.selected = state.cells[1];
state.status = t('nb.starting');
const started = performance.now();
kernel.ready.then((info) => {
  state.ready = true;
  state.status = `${t('nb.ready', info.python)} (${((performance.now() - started) / 1000).toFixed(1)} s)`;
  document.body.dataset.kernel = 'ready';
  refreshFiles();
  render();
}).catch((e) => { state.status = e.message; render(); });

Suite.bridge.receive((picked) => openPicked(picked), { app: 'notebook' }); // files opened from other apps ("Open with…")

// for tests
window.NB = { restartWidgets: () => widgets.stop(), widgets, toHtml, state, refreshVariables, cellHistory, cellStep, kernel, insertCell, runCell, toNotebook, fromPython, toPython, setCells, fromNotebook };
document.body.dataset.ready = 'true';
