/*
 * Python notebook and console: Pyodide in a worker (shared/js/python-kernel.js), Jupyter notebooks (.ipynb, nbformat 4.5)
 * and Python scripts with "# %%" cells, a console (REPL) on the same kernel, files in the Python file system, wheels.
 */
import { EditorView, basicSetup } from 'codemirror';
import { keymap } from '@codemirror/view';
import { Prec, Compartment } from '@codemirror/state';
import { indentUnit } from '@codemirror/language';
import { python } from '@codemirror/lang-python';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { createWidgets, VIEW_MIME } from '@app/widgets.js';
import { createTerminal } from '@app/terminal.js';
import 'app/spell-dom'; // spelling selector in the header, marks in text fields (shared/js/spell-dom.js)
import { spellChecking } from 'app/cm-spell';
import 'app/cm-symbols'; // emoji and symbols insert through the editor (shared/js/cm-symbols.js)
import { indentKeys } from 'app/cm-indent'; // Tab indents, Ctrl+Alt+I inserts a tab character (shared/js/cm-indent.js)

const { html } = Suite.shell;
const t = Suite.t;
const APP = 'notebook';
const HOME = '/home/pyodide';
const TYPES = [{ description: 'Jupyter notebook', accept: { 'application/x-ipynb+json': ['.ipynb'] } }, { description: 'Python', accept: { 'text/x-python': ['.py'] } }];

Suite.i18n.register({
  en: {
    'nb.editorLabel': 'Cell content',
    'app.title': 'Python notebook',
    'nb.new': 'New', 'nb.open': 'Open', 'nb.save': 'Save', 'nb.saveAs': 'Save as', 'nb.exportPy': 'Export .py', 'nb.code': '+ Code', 'nb.markdown': '+ Markdown', 'nb.raw': 'Raw',
    'nb.runAll': '▶▶ Run all', 'nb.restart': '⟲ Restart', 'nb.notebook': 'Notebook', 'nb.console': 'Console', 'nb.files': 'Files', 'nb.upload': 'Upload…',
    'nb.wheel': 'Install wheel…', 'nb.refresh': 'Refresh', 'nb.delete': 'Delete', 'nb.deleteConfirm': 'Delete “{0}”?', 'nb.starting': 'Starting Python…',
    'nb.ready': 'Python {0} ready', 'nb.busy': 'busy', 'nb.untitled': 'Untitled', 'nb.discard': 'Discard the unsaved changes?', 'nb.run': 'Run', 'nb.moveUp': 'Move up',
    'nb.moveDown': 'Move down', 'nb.deleteCell': 'Delete cell', 'nb.slideshow': 'Slideshow', 'nb.slideType': 'Slide type', 'nb.asSlides': 'Slides', 'nb.asSlidesTitle': 'Open as reveal.js slides (Web slides)', 'nb.undo': 'Undo cell operation', 'nb.redo': 'Redo cell operation', 'nb.toMarkdown': 'Markdown', 'nb.toCode': 'Code', 'nb.consoleHint': 'Enter runs, Shift+Enter starts a new line, ↑/↓ history.',
    'nb.clearConsole': 'Clear', 'nb.restartConfirm': 'Restart Python? All variables are lost (files stay until the page is closed).', 'nb.installed': '{0} installed.',
    'nb.export': 'Export', 'nb.exportHtml': 'HTML page', 'nb.exportHtmlNoCode': 'HTML page without code (report)', 'nb.exportPdf': 'PDF (print)',
    'nb.variables': 'Variables', 'nb.noVariables': 'No variables yet.', 'nb.name': 'Name', 'nb.type': 'Type', 'nb.shape': 'Size', 'nb.value': 'Value',
    'nb.showTable': 'Show as a table', 'nb.close': 'Close',
    'nb.clearOutputs': 'Clear outputs', 'nb.panels': 'Files · Variables', 'nb.loadError': 'The file cannot be opened: {0}', 'nb.up': 'Up',
    'nb.interrupt': '⏹ Interrupt', 'nb.interruptTitle': 'Interrupt the running cell (KeyboardInterrupt; I, I)', 'nb.stop': '⏹ Stop',
    'nb.stopTitle': 'Stop the running cell by restarting Python: variables are lost (I, I). Interrupting without a restart needs the notebook served by the relay (relay.py --serve).',
    'nb.stopConfirm': 'Python cannot be interrupted here (only when the notebook is served by the relay, relay.py --serve). Stop the running cell by restarting Python? All variables are lost.',
    'nb.stopOnError': 'Stop on error', 'nb.stopOnErrorTitle': 'When a cell raises an error, the cells queued after it are not run',
    'nb.skipped': 'An error occurred: {0} queued cell(s) were not run.', 'nb.copied': '{0} cell(s) copied.',
    'nb.mount': '📦 Mount archive…', 'nb.mountTitle': 'Mount an archive of the archive manager below /mnt (changes are written back after every cell)',
    'nb.mounted': '“{0}” is mounted at {1}.', 'nb.unmount': 'Unmount (write the changes back)', 'nb.mountClosedMark': 'closed',
    'nb.mountClosed': 'The archive “{0}” was closed in the archive manager: changes in {1} are no longer saved into it.',
    'nb.mountNone': 'No archive is open in an archive manager this notebook can reach. Open one with “📦 Mount archive…” in the Files panel.',
    'nb.mountWhich': 'Several archives are open ({0}): name one, e.g. await suite.archives.mount("{1}").', 'nb.mountCancelled': 'Mounting was not allowed.',
    'nb.mountLarge': 'The archive holds {0} – mounting copies it completely into the notebook\'s memory. Continue?', 'nb.notMounted': '“{0}” is not mounted.',
    'nb.mountsDropped': 'Python was restarted: the archives are no longer mounted ({0}).',
    'nb.isolated': '🔓 Network and interrupt', 'nb.isolatedTitle': 'Served by the relay (cross-origin isolated): Python can open network connections through the relay (sockets, smtplib, ftplib, suite.ssh …) and running cells can be interrupted.',
    'nb.notIsolated': 'Opened as a file', 'nb.notIsolatedTitle': 'Opened as a file: requests works through the relay (if set), but no sockets or SSH from Python, and stopping a cell restarts Python. Open the notebook through the relay (relay.py --serve) for both.',
    'nb.hostKey': 'The server {0} presented this {1} host key:\n{2}\nCheck the fingerprint with the administrator. Trust it?',
    'nb.hostKeyChanged': 'WARNING: the host key of {0} has CHANGED (saved: {1}, now: {2}). Someone may be intercepting the connection. Trust the new key?',
    'nb.hostKeyRefused': 'The host key of {0} was not trusted.', 'nb.noRelay': 'No relay is set (Files panel: Relay).', 'nb.network': 'Network',
    'nb.received': '“{0}” was put into {1} (Files panel; in the Terminal: ls).',
    'nb.terminal': 'Terminal', 'nb.termWelcome': 'Shell on the Python file system (in memory). help lists the commands; less and nano are interactive.',
    'nb.termQuit': 'quit, / search, n next', 'nb.termNotFound': 'Not found', 'nb.termModified': '(modified)', 'nb.termSave': 'Save', 'nb.termExit': 'Exit',
    'nb.termSearch': 'Search', 'nb.termCut': 'Cut line', 'nb.termPaste': 'Paste', 'nb.termWrote': 'Wrote {0} lines', 'nb.termFileName': 'File name to write',
    'nb.termSaveChanges': 'Save the changes (y/n)?', 'nb.termCancelled': 'Cancelled', 'nb.termNanoHelp': 'nano – Ctrl+O saves, Ctrl+X exits',
    'nb.fsName': 'Python notebook “{0}”', 'nb.fsSaveTitle': 'Save “{0}” in the Python file system', 'nb.fsOpenTitle': 'Open from the Python file system',
    'nb.fsFrom': 'Requested by {0}.', 'nb.fsFolder': 'Folder', 'nb.fsName2': 'File name', 'nb.fsSave': 'Save here', 'nb.fsOpen': 'Open',
    'nb.fsAll': 'Show all files', 'nb.fsNone': 'No matching files in the Python file system.', 'nb.fsCancel': 'Cancel', 'nb.fsBadName': 'Enter a file name without “/”.',
    'nb.fsReplace': '“{0}” exists. Replace it?', 'nb.fsBusy': 'Another application is already waiting for an answer here.', 'nb.fsDone': 'Done – you can go back to {0}.',
    'nb.fsWarning': 'The Python file system lives only in memory: these files are gone when this page is closed or Python restarts.',
    'nb.fsLinks': 'Files of the Python file system are open in other applications: {0}. After a restart they can neither be loaded nor saved there. Restart anyway?',
  },
  de: {
    'nb.editorLabel': 'Zelleninhalt',
    'app.title': 'Python-Notebook',
    'nb.new': 'Neu', 'nb.open': 'Öffnen', 'nb.save': 'Speichern', 'nb.saveAs': 'Speichern unter', 'nb.exportPy': 'Als .py exportieren', 'nb.code': '+ Code', 'nb.markdown': '+ Markdown', 'nb.raw': 'Roh',
    'nb.runAll': '▶▶ Alle ausführen', 'nb.restart': '⟲ Neu starten', 'nb.notebook': 'Notebook', 'nb.console': 'Konsole', 'nb.files': 'Dateien', 'nb.upload': 'Hochladen…',
    'nb.wheel': 'Wheel installieren…', 'nb.refresh': 'Aktualisieren', 'nb.delete': 'Löschen', 'nb.deleteConfirm': '„{0}“ löschen?', 'nb.starting': 'Python startet…',
    'nb.ready': 'Python {0} bereit', 'nb.busy': 'beschäftigt', 'nb.untitled': 'Unbenannt', 'nb.discard': 'Die ungespeicherten Änderungen verwerfen?', 'nb.run': 'Ausführen', 'nb.moveUp': 'Nach oben',
    'nb.moveDown': 'Nach unten', 'nb.deleteCell': 'Zelle löschen', 'nb.slideshow': 'Folien', 'nb.slideType': 'Folientyp', 'nb.asSlides': 'Folien', 'nb.asSlidesTitle': 'Als reveal.js-Folien öffnen (Web-Folien)', 'nb.undo': 'Zellenaktion rückgängig', 'nb.redo': 'Zellenaktion wiederholen', 'nb.toMarkdown': 'Markdown', 'nb.toCode': 'Code', 'nb.consoleHint': 'Eingabe führt aus, Umschalt+Eingabe beginnt eine neue Zeile, ↑/↓ Verlauf.',
    'nb.clearConsole': 'Leeren', 'nb.restartConfirm': 'Python neu starten? Alle Variablen gehen verloren (Dateien bleiben, bis die Seite geschlossen wird).', 'nb.installed': '{0} installiert.',
    'nb.export': 'Exportieren', 'nb.exportHtml': 'HTML-Seite', 'nb.exportHtmlNoCode': 'HTML-Seite ohne Code (Bericht)', 'nb.exportPdf': 'PDF (Drucken)',
    'nb.variables': 'Variablen', 'nb.noVariables': 'Noch keine Variablen.', 'nb.name': 'Name', 'nb.type': 'Typ', 'nb.shape': 'Größe', 'nb.value': 'Wert',
    'nb.showTable': 'Als Tabelle anzeigen', 'nb.close': 'Schließen',
    'nb.clearOutputs': 'Ausgaben löschen', 'nb.panels': 'Dateien · Variablen', 'nb.loadError': 'Die Datei kann nicht geöffnet werden: {0}', 'nb.up': 'Nach oben',
    'nb.interrupt': '⏹ Unterbrechen', 'nb.interruptTitle': 'Die laufende Zelle unterbrechen (KeyboardInterrupt; I, I)', 'nb.stop': '⏹ Stoppen',
    'nb.stopTitle': 'Die laufende Zelle durch einen Neustart von Python stoppen: Variablen gehen verloren (I, I). Unterbrechen ohne Neustart geht, wenn das Notebook vom Relay bereitgestellt wird (relay.py --serve).',
    'nb.stopConfirm': 'Python lässt sich hier nicht unterbrechen (nur wenn das Notebook vom Relay bereitgestellt wird, relay.py --serve). Die laufende Zelle durch einen Neustart von Python stoppen? Alle Variablen gehen verloren.',
    'nb.stopOnError': 'Bei Fehler anhalten', 'nb.stopOnErrorTitle': 'Wenn eine Zelle einen Fehler auslöst, werden die danach eingereihten Zellen nicht ausgeführt',
    'nb.skipped': 'Ein Fehler ist aufgetreten: {0} eingereihte Zelle(n) wurden nicht ausgeführt.', 'nb.copied': '{0} Zelle(n) kopiert.',
    'nb.mount': '📦 Archiv einbinden…', 'nb.mountTitle': 'Ein Archiv des Archivmanagers unter /mnt einbinden (Änderungen werden nach jeder Zelle zurückgeschrieben)',
    'nb.mounted': '„{0}“ ist unter {1} eingebunden.', 'nb.unmount': 'Lösen (die Änderungen zurückschreiben)', 'nb.mountClosedMark': 'geschlossen',
    'nb.mountClosed': 'Das Archiv „{0}“ wurde im Archivmanager geschlossen: Änderungen in {1} werden nicht mehr darin gespeichert.',
    'nb.mountNone': 'In keinem Archivmanager, den dieses Notebook erreicht, ist ein Archiv geöffnet. Öffnen Sie eines mit „📦 Archiv einbinden…“ im Dateibereich.',
    'nb.mountWhich': 'Mehrere Archive sind geöffnet ({0}): Nennen Sie eines, z. B. await suite.archives.mount("{1}").', 'nb.mountCancelled': 'Das Einbinden wurde nicht erlaubt.',
    'nb.mountLarge': 'Das Archiv enthält {0} – beim Einbinden wird es vollständig in den Speicher des Notebooks kopiert. Fortfahren?', 'nb.notMounted': '„{0}“ ist nicht eingebunden.',
    'nb.mountsDropped': 'Python wurde neu gestartet: Die Archive sind nicht mehr eingebunden ({0}).',
    'nb.isolated': '🔓 Netzwerk und Unterbrechen', 'nb.isolatedTitle': 'Vom Relay bereitgestellt (cross-origin-isoliert): Python kann über das Relay Netzwerkverbindungen öffnen (Sockets, smtplib, ftplib, suite.ssh …), und laufende Zellen lassen sich unterbrechen.',
    'nb.notIsolated': 'Als Datei geöffnet', 'nb.notIsolatedTitle': 'Als Datei geöffnet: requests funktioniert über das Relay (falls eingestellt), aber keine Sockets oder SSH aus Python, und Anhalten einer Zelle startet Python neu. Öffnen Sie das Notebook über das Relay (relay.py --serve) für beides.',
    'nb.hostKey': 'Der Server {0} hat diesen {1}-Host-Schlüssel gesendet:\n{2}\nPrüfen Sie den Fingerabdruck mit der Administration. Vertrauen?',
    'nb.hostKeyChanged': 'WARNUNG: Der Host-Schlüssel von {0} hat sich GEÄNDERT (gespeichert: {1}, jetzt: {2}). Möglicherweise wird die Verbindung abgehört. Dem neuen Schlüssel vertrauen?',
    'nb.hostKeyRefused': 'Dem Host-Schlüssel von {0} wurde nicht vertraut.', 'nb.noRelay': 'Kein Relay eingestellt (Dateibereich: Relay).', 'nb.network': 'Netzwerk',
    'nb.received': '„{0}“ wurde nach {1} gelegt (Dateibereich; im Terminal: ls).',
    'nb.terminal': 'Terminal', 'nb.termWelcome': 'Shell auf dem Python-Dateisystem (im Speicher). help listet die Befehle; less und nano sind interaktiv.',
    'nb.termQuit': 'beenden, / suchen, n weiter', 'nb.termNotFound': 'Nicht gefunden', 'nb.termModified': '(geändert)', 'nb.termSave': 'Speichern', 'nb.termExit': 'Beenden',
    'nb.termSearch': 'Suchen', 'nb.termCut': 'Zeile ausschneiden', 'nb.termPaste': 'Einfügen', 'nb.termWrote': '{0} Zeilen geschrieben', 'nb.termFileName': 'Dateiname zum Schreiben',
    'nb.termSaveChanges': 'Änderungen speichern (j/n)?', 'nb.termCancelled': 'Abgebrochen', 'nb.termNanoHelp': 'nano – Strg+O speichert, Strg+X beendet',
    'nb.fsName': 'Python-Notebook „{0}“', 'nb.fsSaveTitle': '„{0}“ im Python-Dateisystem speichern', 'nb.fsOpenTitle': 'Aus dem Python-Dateisystem öffnen',
    'nb.fsFrom': 'Angefordert von {0}.', 'nb.fsFolder': 'Ordner', 'nb.fsName2': 'Dateiname', 'nb.fsSave': 'Hier speichern', 'nb.fsOpen': 'Öffnen',
    'nb.fsAll': 'Alle Dateien zeigen', 'nb.fsNone': 'Keine passenden Dateien im Python-Dateisystem.', 'nb.fsCancel': 'Abbrechen', 'nb.fsBadName': 'Geben Sie einen Dateinamen ohne „/“ ein.',
    'nb.fsReplace': '„{0}“ existiert. Ersetzen?', 'nb.fsBusy': 'Eine andere Anwendung wartet hier bereits auf eine Antwort.', 'nb.fsDone': 'Fertig – Sie können zu {0} zurückkehren.',
    'nb.fsWarning': 'Das Python-Dateisystem existiert nur im Speicher: Diese Dateien sind weg, wenn diese Seite geschlossen oder Python neu gestartet wird.',
    'nb.fsLinks': 'Dateien des Python-Dateisystems sind in anderen Anwendungen geöffnet: {0}. Nach einem Neustart lassen sie sich dort weder laden noch speichern. Trotzdem neu starten?',
  },
});

// ---- state ------------------------------------------------------------------------------------------------

const state = {
  cells: [], selected: null, count: 0, file: null, name: '', dirty: false, status: '', ready: false, busy: 0,
  tab: 'notebook', consoleEntries: [], history: [], historyIndex: -1, files: [], cwd: HOME, panels: false, wheels: new Map(),
  variables: [], sideTab: 'files', table: null, // table: { name, html } in the table viewer
  marked: new Set(), anchor: null, clipboard: null, // further selected cells (with Shift), the start of the selection, copied cells
  stopOnError: (() => { try { return localStorage.getItem('suite.notebook.stopOnError') !== '0'; } catch (e) { return true; } })(),
};
state.name = `${t('nb.untitled')}.ipynb`;
const kernel = Suite.python.start({
  onStatus: (s) => { state.status = s; render(); }, onComm: (msg) => widgets.onComm(msg), onCall: (name, args) => pageCall(name, args),
  onSyncCall: (name, args, bytes) => syncCall(name, args, bytes), preloadImports: ['numpy', 'pandas', 'matplotlib.pyplot'],
});
// connections and the relay (shared/js/appdata.js): requests and, on isolated pages, sockets and SSH from Python go through it
const data = Suite.appdata.create(APP, { onChange: () => { pushRelay(); render(); } });

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
    extensions: [Prec.highest(keymap.of(keys)), basicSetup, indentKeys(), indentUnit.of('    '), EditorView.contentAttributes.of({ 'aria-label': t('nb.editorLabel') }), spellChecking(spellMode), language.of(lang), theme.of(dark() ? oneDark : []), EditorView.lineWrapping,
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
    if (cell.type !== type) { cell.type = type; cell.rendered = false; cell.view.setLanguage(langOf(type)); }
    if (kind === 'outputs') { cell.outputs = outputs; cell.count = count; }
  }
  state.cells = snap.cells.map((s) => s.cell);
  if (!state.cells.includes(state.selected)) state.selected = state.cells[0];
  changed();
  render();
}

let nextCellId = 1;
const cellId = () => `c${Date.now().toString(36)}${(nextCellId++).toString(36)}`;

/** The editor language of a cell type (raw cells: plain text). */
const langOf = (type) => (type === 'code' ? python() : type === 'markdown' ? markdown() : []);

function newCell(type = 'code', source = '', { outputs = [], count = null, id = null, metadata = {} } = {}) {
  const cell = { id: id || cellId(), type, outputs, count, metadata, running: false, rendered: type === 'markdown' && !!source };
  const run = (mode) => () => { runCell(cell, mode); return true; };
  cell.view = makeEditor(source, langOf(type), [
    { key: 'Shift-Enter', run: run('advance') }, { key: 'Mod-Enter', run: run('stay') }, { key: 'Alt-Enter', run: run('insert') },
    { key: 'Escape', run: () => { cell.view.contentDOM.blur(); document.querySelector(`[data-cell="${cell.id}"]`)?.focus(); return true; } },
  ], changed, () => (cell.type === 'markdown' ? 'prose' : 'code'));
  cell.view.onFocus = () => { if (state.selected !== cell || state.marked.size) select(cell); };
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

/** Select a cell; extend: from the anchor to the cell (Shift+click, Shift+↑/↓). */
function select(cell, { extend = false } = {}) {
  if (extend && state.anchor && state.cells.includes(state.anchor)) {
    const [a, b] = [state.cells.indexOf(state.anchor), state.cells.indexOf(cell)].sort((x, y) => x - y);
    state.marked = new Set(state.cells.slice(a, b + 1));
  } else {
    state.marked = new Set();
    state.anchor = cell;
  }
  state.selected = cell;
  render();
}

/** The selected cells in notebook order (the current cell and those selected with Shift). */
const selectedCells = () => state.cells.filter((c) => c === state.selected || state.marked.has(c));

function setTypes(cells, type) {
  const change = cells.filter((c) => c.type !== type);
  if (!change.length) return;
  recordCells('outputs');
  for (const cell of change) {
    cell.type = type;
    cell.outputs = [];
    cell.count = null;
    cell.rendered = false;
    cell.view.setLanguage(langOf(type));
  }
  changed();
  render();
}

function deleteCells(cells) {
  if (!cells.length) return;
  const first = state.cells.indexOf(cells[0]);
  recordCells();
  state.cells = state.cells.filter((c) => !cells.includes(c));
  if (!state.cells.length) state.cells.push(newCell());
  select(state.cells[Math.min(first, state.cells.length - 1)]);
  changed();
}

/** Move the selected cells one place up (-1) or down (1) as a block. */
function moveCells(cells, dir) {
  const idx = cells.map((c) => state.cells.indexOf(c));
  if (dir < 0 ? idx[0] === 0 : idx[idx.length - 1] === state.cells.length - 1) return;
  recordCells();
  const rest = state.cells.filter((c) => !cells.includes(c));
  const at = dir < 0 ? idx[0] - 1 : idx[0] + 1;
  rest.splice(at, 0, ...cells);
  state.cells = rest;
  changed();
  render();
}

const snapshot = (c) => ({ type: c.type, source: c.view.state.doc.toString(), outputs: structuredClone(c.outputs), count: c.count, metadata: structuredClone(c.metadata || {}) });

function copyCells(cells, cut = false) {
  state.clipboard = cells.map(snapshot);
  Suite.shell.toast(t('nb.copied', cells.length));
  if (cut) deleteCells(cells);
}

/** Paste the copied cells below (or above) the current cell. */
function pasteCells(above = false) {
  if (!state.clipboard || !state.clipboard.length) return;
  const at = state.cells.indexOf(state.selected) + (above ? 0 : 1);
  const cells = state.clipboard.map((c) => newCell(c.type, c.source, { outputs: structuredClone(c.outputs), count: c.count, metadata: structuredClone(c.metadata) }));
  recordCells();
  state.cells.splice(at, 0, ...cells);
  state.anchor = cells[0];
  select(cells[cells.length - 1], { extend: true });
  changed();
}

/** Merge the selected cells (one selected cell: with the next one) into one cell of the first cell's type. */
function mergeCells(cells) {
  if (cells.length === 1) { const next = state.cells[state.cells.indexOf(cells[0]) + 1]; if (!next) return; cells = [cells[0], next]; }
  const merged = newCell(cells[0].type, cells.map((c) => c.view.state.doc.toString()).join('\n\n'), { metadata: structuredClone(cells[0].metadata || {}) });
  recordCells();
  state.cells.splice(state.cells.indexOf(cells[0]), 0, merged);
  state.cells = state.cells.filter((c) => !cells.includes(c));
  select(merged);
  changed();
}

function setType(cell, type) {
  if (cell.type === type) return;
  recordCells('outputs');
  cell.type = type;
  cell.outputs = [];
  cell.count = null;
  cell.rendered = false;
  cell.view.setLanguage(langOf(type));
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

function deleteCell(cell) { deleteCells([cell]); }

// ---- running ----------------------------------------------------------------------------------------------------

/** Run code; resolves to { count, status: 'ok' | 'error' }. */
async function execute(code, outputs) {
  const count = ++state.count;
  let status = 'error';
  state.busy++;
  render();
  try {
    await kernel.ready;
    widgets.running(outputs); // widgets created now belong to this cell (outputs of their callbacks go here)
    status = await kernel.run(code, count, (o) => appendOutput(outputs, o));
  } catch (e) {
    appendOutput(outputs, { output_type: 'error', ename: 'KernelError', evalue: e.message, traceback: [e.message] });
  } finally {
    widgets.running(null);
    state.busy--;
    render();
    refreshFiles();
    refreshVariables();
  }
  return { count, status };
}

const queue = []; // cells waiting to run: [{ cell, done }]
let draining = false;

/** Queue cells to run; resolves when they have run (or were taken out of the queue). */
function enqueue(cells) {
  const waits = cells.map((cell) => {
    const queued = queue.find((q) => q.cell === cell);
    if (queued) return queued.promise;
    const item = { cell };
    item.promise = new Promise((resolve) => { item.done = resolve; });
    if (cell.type === 'code') cell.queued = true;
    queue.push(item);
    return item.promise;
  });
  render();
  drain();
  return Promise.all(waits);
}

/** Take the waiting cells out of the queue (after an error, an interrupt or a restart); the number of code cells. */
function clearQueue() {
  const items = queue.splice(0);
  for (const { cell, done } of items) { cell.queued = false; done('skipped'); }
  render();
  return items.filter((q) => q.cell.type === 'code').length;
}

async function drain() {
  if (draining) return;
  draining = true;
  try {
    while (queue.length) {
      const { cell, done } = queue.shift();
      cell.queued = false;
      if (!state.cells.includes(cell)) { done('skipped'); continue; }
      let status = 'ok';
      if (cell.type !== 'code') { // (raw cells are kept as they are)
        cell.rendered = cell.type === 'markdown';
        render();
      } else {
        cell.outputs = [];
        cell.running = true;
        render();
        ({ count: cell.count, status } = await execute(cell.view.state.doc.toString(), cell.outputs));
        if (mounts.length) await syncMounts();
        cell.running = false;
        changed();
        render();
      }
      done(status);
      if (status === 'error' && state.stopOnError && queue.length) {
        const skipped = clearQueue();
        if (skipped) Suite.shell.toast(t('nb.skipped', skipped), 'warning');
      }
    }
  } finally {
    draining = false;
    render();
  }
}

/** Run a cell (mode 'advance': select the next cell, 'insert': a new cell below); resolves when it has run. */
async function runCell(cell, mode = 'stay') {
  const done = enqueue([cell]);
  if (mode === 'advance' || mode === 'insert') {
    const i = state.cells.indexOf(cell);
    let next = mode === 'advance' ? state.cells[i + 1] : null;
    if (!next) next = insertCell('code', i + 1);
    select(next);
    if (next.type === 'code' || !next.rendered) requestAnimationFrame(() => next.view.focus());
  }
  return done;
}

/** Run the selected cells (command mode: Shift+Enter, Ctrl+Enter, Alt+Enter). */
function runSelected(mode) {
  const cells = selectedCells();
  const done = enqueue(cells);
  const last = cells[cells.length - 1];
  if (mode === 'advance' || mode === 'insert') {
    const i = state.cells.indexOf(last);
    const next = mode === 'advance' && state.cells[i + 1] ? state.cells[i + 1] : insertCell('code', i + 1);
    select(next);
    if (mode === 'insert') requestAnimationFrame(() => next.view.focus());
  }
  return done;
}

async function runAll() { await enqueue([...state.cells]); }

/** Stop the running cell: KeyboardInterrupt where the page may share memory with the worker, otherwise a restart. */
async function stop() {
  if (kernel.canInterrupt) {
    clearQueue();
    kernel.interrupt();
    return;
  }
  await restart(true, t('nb.stopConfirm'));
}

async function restart(ask = true, question = t('nb.restartConfirm')) {
  if (ask && !(await Suite.shell.confirm(question))) return;
  if (fsLinks.size && !(await Suite.shell.confirm(t('nb.fsLinks', [...fsLinks.values()].map((l) => l.label).join(', '))))) return;
  clearQueue();
  dropMounts();
  closeConnections();
  closeFsLinks();
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
  entry.count = (await execute(code, entry.outputs)).count;
  if (mounts.length) await syncMounts();
  render();
  requestAnimationFrame(() => { const log = document.querySelector('.nb-console-log'); if (log) log.scrollTop = log.scrollHeight; });
}

// ---- mounted archives (module suite.archives, shared/js/python-suite.py; links of shared/js/archive-link.js) ---------

const MOUNT_ROOT = '/mnt';
const MOUNT_WARN = 512 * 1024 * 1024; // bytes: above, mounting asks (the archive is copied into memory)
const mounts = []; // { name, path, link, snapshot: Map(relative path -> 'dir' | 'size:mtime'), closed }
const folderName = (name) => String(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+$/, '_') || 'archive';
const sizeText = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MiB` : `${Math.ceil(n / 1024)} KiB`);

async function snapshotOf(path) {
  return new Map((await kernel.walk(path)).map((f) => [f.path, f.dir ? 'dir' : `${f.size}:${f.mtime}`]));
}

/** Mount the archive of a target (Suite.archiveLink): the archive manager asks the user; resolves to the folder. */
async function mountTarget(target) {
  const result = await Suite.archiveLink.connect(target, { mode: 'mount', label: t('app.title') });
  if (!result) throw new Error(t('nb.mountCancelled'));
  const { link } = result;
  const path = `${MOUNT_ROOT}/${folderName(link.name)}`;
  try {
    const entries = await link.request('list');
    const total = entries.reduce((n, e) => n + (e.dir ? 0 : e.size || 0), 0);
    if (total > MOUNT_WARN && !(await Suite.shell.confirm(t('nb.mountLarge', sizeText(total))))) throw new Error(t('nb.mountCancelled'));
    await kernel.ready;
    const old = mounts.findIndex((m) => m.path === path);
    if (old >= 0) { mounts[old].link.release(); mounts.splice(old, 1); }
    await kernel.removeTree(path);
    await kernel.mkdirs(path);
    for (const e of entries) {
      if (e.dir) await kernel.mkdirs(`${path}/${e.path}`);
      else await kernel.writeFile(`${path}/${e.path}`, await link.request('read', { path: e.path }));
    }
    mounts.push({ name: link.name, path, link, snapshot: await snapshotOf(path), closed: false });
  } catch (err) { link.release(); throw err; }
  Suite.shell.toast(t('nb.mounted', link.name, path));
  refreshFiles();
  render();
  return path;
}

async function mountFromDialog() {
  try {
    const choice = await Suite.archiveLink.choose('mount');
    if (choice && choice.kind === 'archive') await mountTarget(choice.target);
  } catch (e) { fail(e); }
}

/** Write new, changed and deleted files of the mounted archives back; the number of changes. */
async function syncMounts() {
  let changes = 0;
  for (const m of mounts) {
    if (m.closed) continue;
    try {
      const now = await snapshotOf(m.path);
      for (const [rel, sig] of now) {
        const old = m.snapshot.get(rel);
        if (old === sig) continue;
        if (sig === 'dir') { if (old === undefined) { await m.link.request('mkdir', { path: rel }); changes++; } continue; }
        await m.link.request('write', { path: rel, bytes: await kernel.readFile(`${m.path}/${rel}`) });
        changes++;
      }
      // (a deleted folder deletes everything below it in the archive)
      const gone = [...m.snapshot.keys()].filter((rel) => !now.has(rel));
      for (const rel of gone) {
        if (gone.some((other) => rel.startsWith(`${other}/`))) continue;
        await m.link.request('delete', { path: rel });
        changes++;
        // a folder that stays (empty) in the file system stays in the archive (its folder may only have been implied)
        const parent = rel.split('/').slice(0, -1).join('/');
        if (parent && now.get(parent) === 'dir') await m.link.request('mkdir', { path: parent });
      }
      m.snapshot = now;
    } catch (e) {
      if (!m.link.closed) { fail(e); continue; }
      m.closed = true;
      Suite.shell.toast(t('nb.mountClosed', m.name, m.path), 'error', 10000);
      render();
    }
  }
  return changes;
}

async function unmount(nameOrPath) {
  const m = mounts.find((x) => x.name === nameOrPath || x.path === nameOrPath || x.path === nameOrPath.replace(/\/+$/, ''));
  if (!m) throw new Error(t('nb.notMounted', nameOrPath));
  if (!m.closed) await syncMounts();
  m.link.release();
  mounts.splice(mounts.indexOf(m), 1);
  try { await kernel.removeTree(m.path); } catch (e) { /* the kernel was restarted */ }
  if (state.cwd.startsWith(m.path)) state.cwd = HOME;
  refreshFiles();
  render();
  return m.path;
}

/** A restart empties Python's file system: the links are released. */
function dropMounts() {
  if (!mounts.length) return;
  Suite.shell.toast(t('nb.mountsDropped', mounts.map((m) => m.name).join(', ')), 'warning');
  for (const m of mounts.splice(0)) m.link.release();
  render();
}

/** Calls of the Python module "suite" (shared/js/python-suite.py). */
async function pageCall(name, args = {}) {
  switch (name) {
    case 'archives.mount': {
      const archives = await Suite.archiveLink.listArchives();
      const pick = args.name ? archives.find((a) => a.name === args.name) : archives.length === 1 ? archives[0] : null;
      if (!pick) throw new Error(archives.length && !args.name ? t('nb.mountWhich', archives.map((a) => a.name).join(', '), archives[0].name) : t('nb.mountNone'));
      return mountTarget(pick.target);
    }
    case 'archives.unmount': return unmount(args.name);
    case 'archives.sync': return syncMounts();
    case 'archives.mounted': return mounts.map((m) => ({ name: m.name, path: m.path, closed: m.closed }));
    default: throw new Error(`unknown call ${name}`);
  }
}

// ---- network from Python through the relay (shared/js/python-net.py, python-ssh.py) --------------------------------------

/** The relay for requests without isolation (a synchronous XMLHttpRequest of the worker): address and credential. */
async function pushRelay() {
  if (!data.relayConfigured()) { kernel.setRelay(null); return; }
  const relay = data.relayConfig();
  try {
    const token = relay.user ? (await Suite.relay.login(relay)).token : relay.token;
    kernel.setRelay({ url: relay.url, token });
  } catch (e) { kernel.setRelay(null); fail(e); }
}

const sockets = new Map(); // id -> { conn, buffer: Uint8Array, eof, pending }
const sshClients = new Map(); // id -> engine client
const sftps = new Map(); // id -> engine sftp
let nextNet = 1;
const knownHostsKey = 'suite.notebook.knownHosts';
const knownHosts = () => { try { return JSON.parse(localStorage.getItem(knownHostsKey) || '{}'); } catch (e) { return {}; } };
const concat = (a, b) => { const out = new Uint8Array(a.length + b.length); out.set(a); out.set(b, a.length); return out; };
const fromB64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const toB64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
const relayOrFail = () => { if (!data.relayConfigured()) throw new Error(t('nb.noRelay')); return data.relayConfig(); };
const get = (map, id) => { const v = map.get(id); if (!v) throw new Error('the connection is closed'); return v; };

/** Ask before trusting an unknown or changed SSH host key (remembered in this browser). */
async function verifyHostKey(host, port, info) {
  const key = `${host}:${port}`;
  const known = knownHosts()[key];
  if (known === info.fingerprint) return true;
  const ok = await Suite.shell.confirm(known ? t('nb.hostKeyChanged', key, known, info.fingerprint) : t('nb.hostKey', key, info.type, info.fingerprint));
  if (ok) { try { localStorage.setItem(knownHostsKey, JSON.stringify({ ...knownHosts(), [key]: info.fingerprint })); } catch (e) { /* storage blocked */ } }
  return ok;
}

/** Synchronous calls of the Python modules suite.net and suite.ssh (isolated pages; the worker waits for the answer). */
async function syncCall(name, args = {}, bytes = null) {
  switch (name) {
    case 'relay.status': return { configured: data.relayConfigured() };
    case 'relay.http': {
      const relay = relayOrFail();
      try {
        const r = await Suite.relay.http(relay, { ...args, body: args.body ? fromB64(args.body) : undefined });
        return { ...r, body: toB64(r.body) };
      } catch (e) { return { error: Suite.i18n.describe(e) }; }
    }
    case 'tcp.open': {
      const conn = await Suite.relay.connect(relayOrFail(), { host: args.host, port: args.port });
      const id = nextNet++;
      sockets.set(id, { conn, buffer: new Uint8Array(0), eof: false, pending: null });
      return { id };
    }
    case 'tcp.send': get(sockets, args.id).conn.send(bytes); return true;
    case 'tcp.recv': {
      const s = get(sockets, args.id);
      if (!s.buffer.length && !s.eof) {
        // (a read that outlives a timeout keeps its data for the next recv)
        if (!s.pending) s.pending = s.conn.read().then((chunk) => { s.pending = null; if (chunk === null) s.eof = true; else s.buffer = concat(s.buffer, chunk); });
        const timeout = args.timeout == null ? null : Math.max(0, args.timeout * 1000);
        const done = await (timeout === null ? s.pending.then(() => true) : Promise.race([s.pending.then(() => true), new Promise((r) => setTimeout(() => r(false), timeout))]));
        if (!done) return { timeout: true };
      }
      const out = s.buffer.slice(0, args.max);
      s.buffer = s.buffer.slice(out.length);
      return out;
    }
    case 'tcp.starttls': await get(sockets, args.id).conn.startTls(!!args.insecure); return true;
    case 'tcp.close': { const s = sockets.get(args.id); if (s) { s.conn.close(); sockets.delete(args.id); } return true; }
    case 'ssh.connect': {
      const client = await Suite.ssh.connect(relayOrFail(), {
        host: args.host, port: args.port, user: args.user, password: args.password || undefined, privateKey: args.privateKey || undefined,
        passphrase: args.passphrase || undefined,
        hostKey: async (info) => { if (await verifyHostKey(args.host, args.port, info)) return true; throw new Error(t('nb.hostKeyRefused', args.host)); },
      });
      const id = nextNet++;
      sshClients.set(id, client);
      return { id };
    }
    case 'ssh.run': {
      const r = await get(sshClients, args.id).exec(args.command);
      const text = (b) => new TextDecoder().decode(b);
      return { stdout: text(r.stdout), stderr: text(r.stderr), code: r.code };
    }
    case 'ssh.close': { const c = sshClients.get(args.id); if (c) { c.close(); sshClients.delete(args.id); } return true; }
    case 'sftp.open': { const id = nextNet++; sftps.set(id, await get(sshClients, args.id).sftp()); return { id }; }
    case 'sftp.list': return get(sftps, args.id).list(args.path);
    case 'sftp.stat': return get(sftps, args.id).stat(args.path);
    case 'sftp.realpath': return { path: await get(sftps, args.id).realpath(args.path) };
    case 'sftp.read': return get(sftps, args.id).readAt(args.path, args.offset, args.length);
    case 'sftp.write': await get(sftps, args.id).writeAt(args.path, args.offset, bytes || new Uint8Array(0), !!args.truncate); return true;
    case 'sftp.mkdir': await get(sftps, args.id).mkdir(args.path); return true;
    case 'sftp.remove': await get(sftps, args.id).remove(args.path); return true;
    case 'sftp.rmdir': await get(sftps, args.id).rmdir(args.path); return true;
    case 'sftp.rename': await get(sftps, args.id).rename(args.from, args.to); return true;
    case 'sftp.close': { const f = sftps.get(args.id); if (f) { f.close(); sftps.delete(args.id); } return true; }
    default: throw new Error(`unknown call ${name}`);
  }
}

/** A restart ends the worker: its connections are closed. */
function closeConnections() {
  for (const s of sockets.values()) s.conn.close();
  for (const f of sftps.values()) { try { f.close(); } catch (e) { /* gone */ } }
  for (const c of sshClients.values()) { try { c.close(); } catch (e) { /* gone */ } }
  sockets.clear(); sftps.clear(); sshClients.clear();
}

// ---- the Python file system for other apps (shared/js/archive-link.js: open from and save into it, like an archive) ---------

const fsLinks = new Map(); // id -> { id, label, port }
let nextFsLink = 1;
const absPath = (path) => (String(path).startsWith('/') ? String(path) : `${HOME}/${path}`).replace(/\/+/g, '/').replace(/\/$/, '');
const relPath = (path) => (path.startsWith(`${HOME}/`) ? path.slice(HOME.length + 1) : path);
const fsInfo = () => ({ name: t('nb.fsName', state.name), format: 'Pyodide', kind: 'python' });

/** Python restarted (or the page is closed): the files that other apps have open are gone. */
function closeFsLinks() {
  for (const l of fsLinks.values()) { try { l.port.postMessage({ type: 'closed' }); } catch (e) { /* gone */ } }
  fsLinks.clear();
}
window.addEventListener('pagehide', closeFsLinks);

async function fsOp(msg) {
  const path = absPath(msg.path || '');
  switch (msg.op) {
    case 'info': return fsInfo();
    case 'list': return (await kernel.walk(HOME)).map((f) => ({ path: f.path, dir: f.dir, size: f.size, mtime: f.mtime }));
    case 'read': return new Uint8Array(await kernel.readFile(path));
    case 'write': await kernel.writeFile(path, new Uint8Array(msg.bytes)); refreshFiles(); return true;
    case 'delete': await kernel.removeTree(path); refreshFiles(); return true;
    case 'mkdir': await kernel.mkdirs(path); refreshFiles(); return true;
    default: throw new Error(`unknown request ${msg.op}`);
  }
}

function serveFsLink(link) {
  link.port.onmessage = async (e) => {
    const msg = e.data || {};
    if (msg.op === 'release') { fsLinks.delete(link.id); return; }
    if (!fsLinks.has(link.id)) { link.port.postMessage({ id: msg.id, ok: false, error: 'closed' }); return; }
    try { link.port.postMessage({ id: msg.id, ok: true, result: await fsOp(msg) }); } catch (err) { link.port.postMessage({ id: msg.id, ok: false, error: Suite.i18n.describe(err) }); }
  };
}

function finishFsLink(paths) {
  const { request, port } = state.fsLink;
  state.fsLink = null;
  const link = { id: nextFsLink++, label: `${request.label || '?'}: ${paths.join(', ')}`, port };
  fsLinks.set(link.id, link);
  serveFsLink(link);
  port.postMessage({ type: 'connected', paths, info: fsInfo() });
  Suite.shell.toast(t('nb.fsDone', request.label || '?'));
  render();
}

function cancelFsLink() {
  if (!state.fsLink) return;
  const { port } = state.fsLink;
  state.fsLink = null;
  port.postMessage({ type: 'cancelled' });
  port.close();
  render();
}

// other apps ask whether this is a storage (archive-info) and connect to it (archive-connect); mounting is for archives
window.addEventListener('message', async (e) => {
  const msg = e.data;
  const port = e.ports && e.ports[0];
  if (!msg || msg.suite !== 'suite-bridge' || !port) return;
  if (msg.type === 'archive-info') { port.postMessage(state.ready ? fsInfo() : {}); return; }
  if (msg.type !== 'archive-connect') return;
  const request = msg.request || {};
  if (state.fsLink || request.mode === 'mount' || !state.ready) {
    port.postMessage({ type: 'cancelled' });
    port.close();
    if (state.fsLink) Suite.shell.toast(t('nb.fsBusy'), 'warning');
    return;
  }
  let files = [];
  try { files = (await kernel.walk(HOME)).filter((f) => !f.dir).map((f) => f.path).sort(); } catch (err) { /* empty */ }
  state.fsLink = { request, port, folder: relPath(state.cwd) === HOME ? '' : relPath(state.cwd), name: request.name || '', files, chosen: new Set(), all: false, error: '' };
  render();
});

function FsLinkDialog() {
  const l = state.fsLink;
  if (!l) return null;
  const r = l.request;
  let body;
  let ok;
  if (r.mode === 'save') {
    body = html`<label>${t('nb.fsFolder')}<input data-testid="fs-folder" value=${l.folder} placeholder=${HOME} onInput=${(e) => { l.folder = e.target.value.trim().replace(/^\/+|\/+$/g, ''); }} /></label>
      <label>${t('nb.fsName2')}<input data-testid="fs-name" value=${l.name} onInput=${(e) => { l.name = e.target.value; l.error = ''; }} /></label>`;
    ok = html`<button data-testid="fs-ok" onClick=${async () => {
      const name = l.name.trim();
      if (!name || name.includes('/')) { l.error = t('nb.fsBadName'); render(); return; }
      const path = l.folder ? `${l.folder}/${name}` : name;
      if (l.files.includes(path) && !(await Suite.shell.confirm(t('nb.fsReplace', path)))) return;
      finishFsLink([path]);
    }}>${t('nb.fsSave')}</button>`;
  } else {
    const exts = r.exts || [];
    const shown = l.all || !exts.length ? l.files : l.files.filter((p) => exts.some((x) => x === '*' || p.toLowerCase().endsWith(`.${x}`)));
    body = html`${shown.length ? html`<ul class="nb-fs-files" data-testid="fs-files">${shown.map((p) => html`<li><label>
        <input type=${r.multiple ? 'checkbox' : 'radio'} name="fs-file" data-testid="fs-file" value=${p} checked=${l.chosen.has(p)}
          onChange=${(e) => { if (!r.multiple) l.chosen = new Set(); if (e.target.checked) l.chosen.add(p); else l.chosen.delete(p); render(); }} /> ${p}</label></li>`)}</ul>`
      : html`<p>${t('nb.fsNone')}</p>`}
      ${exts.length ? html`<label><input type="checkbox" data-testid="fs-all" checked=${l.all} onChange=${(e) => { l.all = e.target.checked; render(); }} /> ${t('nb.fsAll')}</label>` : null}`;
    ok = html`<button data-testid="fs-ok" disabled=${!l.chosen.size} onClick=${() => finishFsLink(l.files.filter((p) => l.chosen.has(p)))}>${t('nb.fsOpen')}</button>`;
  }
  return html`<dialog open data-testid="fs-dialog"><article>
    <header><strong>${r.mode === 'save' ? t('nb.fsSaveTitle', r.name || '') : t('nb.fsOpenTitle')}</strong></header>
    <p><small>${t('nb.fsFrom', r.label || '?')}</small></p>
    <p class="nb-fs-warning" data-testid="fs-warning">⚠ ${t('nb.fsWarning')}</p>
    ${body}
    ${l.error ? html`<p class="nb-stderr" data-testid="fs-error">${l.error}</p>` : null}
    <footer><button type="button" class="secondary" data-testid="fs-cancel" onClick=${cancelFsLink}>${t('nb.fsCancel')}</button>${ok}</footer>
  </article></dialog>`;
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
      : { cell_type: c.type === 'raw' ? 'raw' : 'markdown', id: c.id, metadata: c.metadata || {}, source: lines(c.view.state.doc.toString()) })),
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
    // raw cells (for nbconvert, e.g. LaTeX or reStructuredText) are kept as plain text and saved unchanged
    cells.push(newCell(c.cell_type === 'markdown' || c.cell_type === 'raw' ? c.cell_type : 'code', text(c.source), { outputs: c.outputs || [], count: c.execution_count ?? null, id: typeof c.id === 'string' ? c.id : null, metadata: c.metadata && typeof c.metadata === 'object' ? c.metadata : {} }));
  }
  return cells;
}

/** Python script with "# %%" cell markers (the "percent" format of VS Code, Spyder and Jupytext). */
function fromPython(source) {
  const parts = source.split(/^# %%(.*)$/m);
  const cells = [];
  if (parts[0].trim()) cells.push(newCell('code', parts[0].trim()));
  for (let i = 1; i < parts.length; i += 2) {
    const kind = /\[(markdown|raw)\]/i.exec(parts[i]);
    let body = parts[i + 1].replace(/^\n/, '').replace(/\n+$/, '');
    if (kind) body = body.split('\n').map((l) => l.replace(/^# ?/, '')).join('\n');
    cells.push(newCell(kind ? kind[1].toLowerCase() : 'code', body));
  }
  return cells.length ? cells : [newCell('code', source)];
}

function toPython() {
  return `${state.cells.map((c) => (c.type === 'code' ? `# %%\n${c.view.state.doc.toString()}` : `# %% [${c.type}]\n${c.view.state.doc.toString().split('\n').map((l) => `# ${l}`.trimEnd()).join('\n')}`)).join('\n\n')}\n`;
}

// recovery copies of unsaved work (shared/js/autosave.js)
Suite.autosave.register({
  app: APP,
  save: () => (state.dirty ? { name: state.name, file: state.file && state.file.handle ? { handle: state.file.handle, name: state.file.name } : null, nb: toNotebook() } : null),
  restore: (s) => { setCells(fromNotebook(s.nb), s.name, s.file); changed(); },
});

function setCells(cells, name, file) {
  clearQueue();
  state.cells = cells.length ? cells : [newCell()];
  cellHistory.clear();
  state.selected = state.cells[0];
  state.marked = new Set();
  state.anchor = state.selected;
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
    if (cell.type === 'raw') return ''; // (like nbconvert: raw cells are not part of a web page)
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
  const also = state.marked.has(cell); // (selected with Shift)
  return html`<div class=${`nb-cell ${cell.type} ${selected || also ? 'selected' : ''} ${also ? 'marked' : ''} ${cell.running ? 'running' : ''} ${cell.queued ? 'queued' : ''}`}
      data-testid="cell" data-type=${cell.type} data-cell=${cell.id} tabindex="-1" data-selected=${selected || also ? 'true' : 'false'}
      onPointerDown=${(e) => { if (e.shiftKey) e.preventDefault(); }}
      onClick=${(e) => {
        if (e.shiftKey) { // (extends the selection of cells in command mode, not the text selection)
          cell.view.contentDOM.blur();
          select(cell, { extend: true });
          document.querySelector(`[data-cell="${cell.id}"]`)?.focus();
        } else if (!selected || state.marked.size) select(cell);
      }}>
    <div class="nb-prompt" data-testid="prompt">${cell.type === 'code' ? `[${cell.running || cell.queued ? '*' : cell.count ?? ' '}]` : cell.type === 'raw' ? t('nb.raw') : ''}</div>
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

// the Terminal tab: a shell on the Python file system (apps/notebook/src/js/terminal.js, shared/js/python-shell.py)
let terminal = null;
function TerminalTab() {
  if (!terminal) terminal = createTerminal({ kernel, t, onFilesChanged: () => { refreshFiles(); if (mounts.length) syncMounts(); } });
  return html`<section class="nb-terminal-host" ref=${(el) => { if (el) terminal.attach(el); }}></section>`;
}
window.addEventListener('resize', () => { if (terminal && state.tab === 'terminal') terminal.fit(); });

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
    <details class="nb-network" data-testid="network"><summary>${t('nb.network')}: ${t('appdata.relay')}</summary><${data.RelayFields} /><${data.Bar} /></details>
    <div class="nb-files-head"><strong>${t('nb.files')}</strong><code>${state.cwd}</code></div>
    <div class="nb-files-buttons">
      <button class="secondary outline" data-testid="upload" onClick=${() => pick(null, true, uploadFile)}>${t('nb.upload')}</button>
      <button class="secondary outline" data-testid="install-wheel" onClick=${() => pick('.whl', true, installWheel)}>${t('nb.wheel')}</button>
      <button class="secondary outline" title=${t('nb.refresh')} onClick=${refreshFiles}>⟳</button>
      <button class="secondary outline" data-testid="mount-archive" title=${t('nb.mountTitle')} onClick=${mountFromDialog}>${t('nb.mount')}</button>
    </div>
    ${mounts.length ? html`<ul class="nb-mounts" data-testid="mounts">${mounts.map((m) => html`<li data-testid="mount">
      <a href="#" onClick=${(e) => { e.preventDefault(); state.cwd = m.path; refreshFiles(); }}>📦 ${m.path}</a>${m.closed ? html` <small class="nb-stderr">(${t('nb.mountClosedMark')})</small>` : null}
      <button class="secondary outline" data-testid="unmount" title=${t('nb.unmount')} aria-label=${t('nb.unmount')} onClick=${() => unmount(m.path).catch(fail)}>⏏</button></li>`)}</ul>` : null}
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
    ${state.busy || queue.length ? html`<button class="secondary" data-testid="stop" title=${kernel.canInterrupt ? t('nb.interruptTitle') : t('nb.stopTitle')}
      onClick=${() => stop()}>${kernel.canInterrupt ? t('nb.interrupt') : t('nb.stop')}</button>` : null}
    <label class="nb-check" title=${t('nb.stopOnErrorTitle')}><input type="checkbox" data-testid="stop-on-error" checked=${state.stopOnError}
      onChange=${(e) => { state.stopOnError = e.target.checked; try { localStorage.setItem('suite.notebook.stopOnError', state.stopOnError ? '1' : '0'); } catch (err) { /* storage blocked */ } render(); }} />${t('nb.stopOnError')}</label>
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
        <button role="tab" class=${state.tab === 'terminal' ? '' : 'secondary outline'} data-testid="tab-terminal" onClick=${() => { state.tab = 'terminal'; render(); }}>${t('nb.terminal')}</button>
        <span class=${`nb-status ${state.busy ? 'busy' : state.ready ? 'ready' : ''}`} data-testid="status">${state.busy ? t('nb.busy') : state.status}</span>
        <span class=${`nb-mode ${kernel.isolated ? 'isolated' : ''}`} data-testid="isolation" title=${kernel.isolated ? t('nb.isolatedTitle') : t('nb.notIsolatedTitle')}>${kernel.isolated ? t('nb.isolated') : t('nb.notIsolated')}</span>
      </div>
      ${state.tab === 'notebook' ? html`<${Notebook} />` : state.tab === 'terminal' ? html`<${TerminalTab} />` : html`<${Console} />`}
    </div>
    <${Files} />${state.panels ? Suite.shell.backdrop(() => { state.panels = false; render(); }) : null}
    <${TableDialog} /><${data.Dialog} /><${FsLinkDialog} />
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
  if (state.tab !== 'notebook' || (e.altKey && e.key !== 'Enter')) return;
  const active = document.activeElement;
  if (active && (active.closest('.cm-editor') || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))) return;
  // command mode: Z / Shift+Z (as in Jupyter) and Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z undo and redo cell operations
  const undoKey = Suite.UndoHistory.key(e) || (!mod && e.key.toLowerCase() === 'z' ? (e.shiftKey ? 'redo' : 'undo') : null);
  if (undoKey) { e.preventDefault(); cellStep(undoKey === 'redo'); return; }
  const cell = state.selected;
  if (!cell) return;
  const i = state.cells.indexOf(cell);
  const cells = selectedCells();
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  // two presses in a row (as in Jupyter): D, D deletes, I, I interrupts, 0, 0 restarts
  const twice = (k) => { const now = performance.now(); const hit = lastKey.key === k && now - lastKey.time < 800; lastKey = hit ? { key: '', time: 0 } : { key: k, time: now }; return hit; };
  const move = (j) => select(state.cells[Math.max(0, Math.min(state.cells.length - 1, j))], { extend: e.shiftKey });
  const keys = mod ? {
    Enter: () => runSelected('stay'), a: () => { state.anchor = state.cells[0]; select(state.cells[state.cells.length - 1], { extend: true }); },
    ...(e.shiftKey ? { ArrowUp: () => moveCells(cells, -1), ArrowDown: () => moveCells(cells, 1) } : {}),
  } : {
    Enter: () => {
      if (e.shiftKey) return runSelected('advance');
      select(cell);
      if (cell.type === 'markdown') cell.rendered = false;
      render();
      requestAnimationFrame(() => cell.view.focus());
    },
    a: () => insertCell('code', i), b: () => insertCell('code', i + 1),
    m: () => (e.shiftKey ? mergeCells(cells) : setTypes(cells, 'markdown')), y: () => setTypes(cells, 'code'), r: () => setTypes(cells, 'raw'),
    c: () => copyCells(cells), x: () => copyCells(cells, true), v: () => pasteCells(e.shiftKey),
    d: () => { if (twice('d')) deleteCells(cells); }, i: () => { if (twice('i') && (state.busy || queue.length)) stop(); }, 0: () => { if (twice('0')) restart(); },
    ArrowUp: () => move(i - 1), ArrowDown: () => move(i + 1), k: () => move(i - 1), j: () => move(i + 1),
    Delete: () => deleteCells(cells), Escape: () => select(cell),
  };
  if (e.altKey && key === 'Enter' && !mod) { e.preventDefault(); runSelected('insert'); return; }
  const fn = keys[key];
  if (fn) { e.preventDefault(); fn(); }
});
let lastKey = { key: '', time: 0 };

// start
state.cells = [
  newCell('markdown', '# Python notebook\nRuns **completely in the browser** (Pyodide). `Shift+Enter` runs a cell.'),
  newCell('code', "import numpy as np\nimport pandas as pd\nimport matplotlib.pyplot as plt\n\ndf = pd.DataFrame({'x': np.arange(10), 'y': np.arange(10) ** 2})\ndf.head()"),
];
state.selected = state.cells[1];
state.status = t('nb.starting');
const started = performance.now();
pushRelay();
kernel.ready.then((info) => {
  state.ready = true;
  state.status = `${t('nb.ready', info.python)} (${((performance.now() - started) / 1000).toFixed(1)} s)`;
  document.body.dataset.kernel = 'ready';
  refreshFiles();
  render();
}).catch((e) => { state.status = e.message; render(); });

// files opened from other apps ("Open with…") or examples: notebooks and .py files open as notebooks, other files (data, shell
// scripts …) are put into the Python file system
Suite.bridge.receive(async (picked) => {
  if (/\.(ipynb|py)$/i.test(picked.file.name)) { await openPicked(picked); return; }
  await uploadFile(picked.file);
  refreshFiles();
  Suite.shell.toast(t('nb.received', picked.file.name, state.cwd));
}, { app: 'notebook' }); // files opened from other apps ("Open with…")

// for tests
window.NB = { restartWidgets: () => widgets.stop(), get terminal() { return terminal; }, widgets, toHtml, state, mounts, syncMounts, refreshVariables, cellHistory, cellStep, kernel, insertCell, runCell, toNotebook, fromPython, toPython, setCells, fromNotebook };
document.body.dataset.ready = 'true';
