/*
 * Database tool: SQLite files (sql.js, in memory, saved back to the file) and Postgres servers (through the relay).
 * Schema browser, SQL editor with schema-aware completion, result grids, table browsing with editing, CSV/JSON export.
 */
import { EditorView, basicSetup } from 'codemirror';
import { suiteSearch } from 'app/cm-search';
import { keymap } from '@codemirror/view';
import { Compartment, Prec } from '@codemirror/state';
import { sql, SQLite, PostgreSQL, MySQL } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { openSqlite, openPostgres, openMysql } from '@app/drivers.js';
import { erDiagram } from '@app/er.js';
import { writeXlsx, readTable, columnTypes } from '@app/table-io.js';
import { sqlExtras } from '@app/completion.js';
import 'app/cm-symbols'; // emoji and symbols insert through the editor (shared/js/cm-symbols.js)
import { indentKeys } from 'app/cm-indent'; // Tab indents, Ctrl+Alt+I inserts a tab character (shared/js/cm-indent.js)

const { html } = Suite.shell;
const t = Suite.t;
const APP = 'dbtool';
const MAX_ROWS = 1000;
const BROWSE_LIMIT = 200;
const SQLITE_TYPES = [{ description: 'SQLite', accept: { 'application/vnd.sqlite3': ['.sqlite', '.sqlite3', '.db', '.db3', '.s3db'] } }];

Suite.i18n.register({
  en: {
    'app.title': 'Database tool',
    'db.newSqlite': 'New SQLite', 'db.openSqlite': 'Open SQLite…', 'db.saveDb': 'Save database', 'db.connect': 'Connect to a server…', 'db.serverTitle': 'Database server', 'db.serverKind': 'Server type', 'db.run': 'Run',
    'db.import': 'Import', 'db.importHint': 'Import a CSV or Excel file (.xlsx) into a table', 'db.importTitle': 'Import “{0}”', 'db.importRows': '{0} rows', 'db.importHeader': 'The first row holds the column names',
    'db.importNew': 'New table', 'db.importExisting': 'Existing table', 'db.importName': 'Table name', 'db.importTable': 'Table', 'db.importOk': 'Import',
    'db.importUnknown': 'Columns without a matching column in the table are left out: {0}', 'db.importNoColumns': 'No column of the file matches a column of the table.',
    'db.imported': '{0} rows imported into “{1}”.', 'db.importEmpty': 'The file contains no rows.', 'db.importUnreadable': '“{0}” cannot be read: {1}', 'db.exported': '{0} rows exported.',
    'db.runAll': 'Run all', 'db.export': 'Export', 'db.sessions': 'Open databases', 'db.saved': 'Saved connections', 'db.schema': 'Schema', 'db.noSession': 'Open or create a SQLite database, or connect to a PostgreSQL, MySQL or MariaDB server.',
    'db.close': 'Close', 'db.refresh': 'Refresh', 'db.rows': '{0} row(s)', 'db.shown': 'showing the first {0} of {1} rows', 'db.affected': '{0}: {1} row(s) affected', 'db.done': 'Done in {0} ms',
    'db.noResult': 'No result.', 'db.name': 'Name', 'db.host': 'Host', 'db.port': 'Port', 'db.database': 'Database', 'db.user': 'User', 'db.password': 'Password',
    'db.savePassword': 'Save the password with the connection', 'db.ssl': 'SSL', 'db.sslPrefer': 'prefer', 'db.sslRequire': 'require', 'db.sslDisable': 'disable',
    'db.insecure': 'Accept untrusted certificates (self-signed)', 'db.connectButton': 'Connect', 'db.saveConnection': 'Save connection', 'db.cancel': 'Cancel',
    'db.edit': 'Edit', 'db.delete': 'Delete', 'db.deleteConfirm': 'Delete the connection “{0}”?', 'db.connecting': 'Connecting…', 'db.addRow': 'Add row',
    'db.undo': 'Undo', 'db.redo': 'Redo', 'db.undone': 'Undone: {0}', 'db.redone': 'Redone: {0}', 'db.deleteRow': 'Delete row', 'db.deleteRowConfirm': 'Delete this row?', 'db.null': 'NULL', 'db.insert': 'Insert', 'db.unsaved': '“{0}” has unsaved changes. Close it anyway?',
    'db.noKey': 'The table has no primary key; rows cannot be edited.', 'db.browse': 'Browse', 'db.untitled': 'database', 'db.views': 'Views', 'db.tables': 'Tables',
    'db.result': 'Result {0}', 'db.messages': 'Messages', 'db.relayMissing': 'Configure the relay first (address and token).', 'db.filter': 'Filter tables',
    'db.er': 'ER diagram', 'db.erTitle': 'Show the tables and their relations in the diagram editor', 'db.erEmpty': 'The database has no tables.',
    'db.history': 'History', 'db.clearHistory': 'Clear the history', 'db.clearHistoryConfirm': 'Delete the query history of this browser?', 'db.explain': 'Explain',
    'db.explainTitle': 'Show the query plan of the current statement', 'db.plan': 'Query plan', 'db.fromHistory': 'Put into the editor (double-click: run)',
  },
  de: {
    'app.title': 'Datenbankwerkzeug',
    'db.newSqlite': 'Neue SQLite', 'db.openSqlite': 'SQLite öffnen…', 'db.saveDb': 'Datenbank speichern', 'db.connect': 'Mit einem Server verbinden…', 'db.serverTitle': 'Datenbankserver', 'db.serverKind': 'Servertyp', 'db.run': 'Ausführen',
    'db.import': 'Importieren', 'db.importHint': 'Eine CSV- oder Excel-Datei (.xlsx) in eine Tabelle importieren', 'db.importTitle': '„{0}“ importieren', 'db.importRows': '{0} Zeilen', 'db.importHeader': 'Die erste Zeile enthält die Spaltennamen',
    'db.importNew': 'Neue Tabelle', 'db.importExisting': 'Vorhandene Tabelle', 'db.importName': 'Tabellenname', 'db.importTable': 'Tabelle', 'db.importOk': 'Importieren',
    'db.importUnknown': 'Spalten ohne passende Spalte in der Tabelle werden ausgelassen: {0}', 'db.importNoColumns': 'Keine Spalte der Datei passt zu einer Spalte der Tabelle.',
    'db.imported': '{0} Zeilen in „{1}“ importiert.', 'db.importEmpty': 'Die Datei enthält keine Zeilen.', 'db.importUnreadable': '„{0}“ kann nicht gelesen werden: {1}', 'db.exported': '{0} Zeilen exportiert.',
    'db.runAll': 'Alles ausführen', 'db.export': 'Exportieren', 'db.sessions': 'Offene Datenbanken', 'db.saved': 'Gespeicherte Verbindungen', 'db.schema': 'Schema', 'db.noSession': 'Öffnen oder erstellen Sie eine SQLite-Datenbank oder verbinden Sie sich mit einem PostgreSQL-, MySQL- oder MariaDB-Server.',
    'db.close': 'Schließen', 'db.refresh': 'Aktualisieren', 'db.rows': '{0} Zeile(n)', 'db.shown': 'die ersten {0} von {1} Zeilen werden angezeigt', 'db.affected': '{0}: {1} Zeile(n) betroffen', 'db.done': 'Fertig in {0} ms',
    'db.noResult': 'Kein Ergebnis.', 'db.name': 'Name', 'db.host': 'Host', 'db.port': 'Port', 'db.database': 'Datenbank', 'db.user': 'Benutzer', 'db.password': 'Passwort',
    'db.savePassword': 'Passwort mit der Verbindung speichern', 'db.ssl': 'SSL', 'db.sslPrefer': 'bevorzugen', 'db.sslRequire': 'erforderlich', 'db.sslDisable': 'aus',
    'db.insecure': 'Nicht vertrauenswürdige Zertifikate akzeptieren (selbst signiert)', 'db.connectButton': 'Verbinden', 'db.saveConnection': 'Verbindung speichern', 'db.cancel': 'Abbrechen',
    'db.edit': 'Bearbeiten', 'db.delete': 'Löschen', 'db.deleteConfirm': 'Die Verbindung „{0}“ löschen?', 'db.connecting': 'Verbinde…', 'db.addRow': 'Zeile hinzufügen',
    'db.undo': 'Rückgängig', 'db.redo': 'Wiederholen', 'db.undone': 'Rückgängig gemacht: {0}', 'db.redone': 'Wiederholt: {0}', 'db.deleteRow': 'Zeile löschen', 'db.deleteRowConfirm': 'Diese Zeile löschen?', 'db.null': 'NULL', 'db.insert': 'Einfügen', 'db.unsaved': '„{0}“ hat ungespeicherte Änderungen. Trotzdem schließen?',
    'db.noKey': 'Die Tabelle hat keinen Primärschlüssel; Zeilen können nicht bearbeitet werden.', 'db.browse': 'Anzeigen', 'db.untitled': 'datenbank', 'db.views': 'Sichten', 'db.tables': 'Tabellen',
    'db.result': 'Ergebnis {0}', 'db.messages': 'Meldungen', 'db.relayMissing': 'Richten Sie zuerst das Relay ein (Adresse und Token).', 'db.filter': 'Tabellen filtern',
    'db.er': 'ER-Diagramm', 'db.erTitle': 'Tabellen und ihre Beziehungen im Diagrammeditor zeigen', 'db.erEmpty': 'Die Datenbank hat keine Tabellen.',
    'db.history': 'Verlauf', 'db.clearHistory': 'Verlauf löschen', 'db.clearHistoryConfirm': 'Den Abfrageverlauf dieses Browsers löschen?', 'db.explain': 'Erklären',
    'db.explainTitle': 'Den Abfrageplan der aktuellen Anweisung anzeigen', 'db.plan': 'Abfrageplan', 'db.fromHistory': 'In den Editor übernehmen (Doppelklick: ausführen)',
  },
});

// ---- state ----------------------------------------------------------------------------------------------

const state = {
  sessions: [], active: null, results: [], resultTab: 0, message: null, busy: false, dialog: null, editing: null, filter: '', panels: false,
};
let nextSessionId = 1;
const data = Suite.appdata.create(APP, { onChange: () => render() });

let queued = false;
function render() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; Suite.shell.refresh(); });
}
const fail = (e) => { console.warn(e); Suite.shell.toast(Suite.i18n.describe(e), 'error'); };
const session = () => state.sessions.find((s) => s.id === state.active) || null;
const updateDirty = () => Suite.shell.setDirty(state.sessions.some((s) => s.dirty) || data.dirty);

// ---- editor ------------------------------------------------------------------------------------------------

const language = new Compartment();
const theme = new Compartment();
const dark = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
const editor = new EditorView({
  doc: '',
  extensions: [
    basicSetup, suiteSearch(),
    indentKeys(),
    language.of([sql({ dialect: SQLite }), sqlExtras(SQLite, 'sqlite', () => session() && session().schema)]),
    theme.of(dark() ? oneDark : []),
    Prec.highest(keymap.of([
      { key: 'Mod-Enter', run: () => { runCurrent(); return true; } },
      { key: 'Shift-Mod-Enter', run: () => { runAll(); return true; } },
    ])),
    EditorView.updateListener.of((u) => { if (u.docChanged && session()) session().sql = u.state.doc.toString(); }),
  ],
});
editor.dom.dataset.testid = 'editor';

function configureEditor(s) {
  const schema = {};
  for (const tbl of (s && s.schema) || []) schema[tbl.schema && tbl.schema !== 'main' && tbl.schema !== 'public' ? `${tbl.schema}.${tbl.name}` : tbl.name] = tbl.columns.map((c) => c.name);
  const dialect = s && s.driver.kind === 'postgres' ? PostgreSQL : s && s.driver.kind === 'mysql' ? MySQL : SQLite;
  editor.dispatch({ effects: language.reconfigure([sql({ dialect, schema, upperCaseKeywords: true }), sqlExtras(dialect, s ? s.driver.kind : 'sqlite', () => session() && session().schema)]) });
}

function setEditorText(text) { editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: text } }); }

/** Statements of the text with their positions (split at semicolons outside strings, identifiers and comments). */
function statements(text) {
  const out = [];
  let start = 0, i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "'" || c === '"') { const q = c; i++; while (i < text.length && !(text[i] === q && text[i + 1] !== q)) i += text[i] === q ? 2 : 1; i++; continue; }
    if (c === '-' && text[i + 1] === '-') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') { const end = text.indexOf('*/', i + 2); i = end < 0 ? text.length : end + 2; continue; }
    if (c === '$') { const m = /^\$[A-Za-z_]*\$/.exec(text.slice(i)); if (m) { const end = text.indexOf(m[0], i + m[0].length); i = end < 0 ? text.length : end + m[0].length; continue; } }
    if (c === ';') { out.push({ from: start, to: i + 1 }); start = i + 1; }
    i++;
  }
  if (text.slice(start).trim()) out.push({ from: start, to: text.length });
  return out.filter((s) => text.slice(s.from, s.to).replace(/--.*$/gm, '').replace(/[;\s]/g, ''));
}

/** The selected text, or the statement at the cursor. */
function currentStatement() {
  const sel = editor.state.selection.main;
  const text = editor.state.doc.toString();
  if (!sel.empty) return text.slice(sel.from, sel.to);
  const list = statements(text);
  const cur = list.find((s) => sel.head >= s.from && sel.head <= s.to) || list.filter((s) => s.to <= sel.head).pop() || list[0];
  return cur ? text.slice(cur.from, cur.to) : '';
}

function runCurrent() { const sql = currentStatement(); if (sql) execute(sql); }

/** The query plan of the current statement: SQLite's EXPLAIN QUERY PLAN as an indented tree, Postgres' EXPLAIN text. */
async function explainCurrent() {
  const s = session();
  const sql = currentStatement().trim().replace(/;\s*$/, '');
  if (!s || !sql) return;
  const sqlite = s.driver.kind === 'sqlite';
  await execute(`${sqlite ? 'EXPLAIN QUERY PLAN' : 'EXPLAIN'} ${sql}`, { history: false });
  const res = state.results[state.resultTab];
  if (!sqlite || !res || !res.columns.length) return;
  const col = (n) => res.columns.findIndex((c) => c.name === n);
  const [id, parent, detail] = [col('id'), col('parent'), col('detail')];
  if (id < 0 || parent < 0 || detail < 0) return;
  const depth = new Map([[0, -1]]);
  const rows = res.rows.map((r) => { const d = (depth.get(Number(r[parent])) ?? -1) + 1; depth.set(Number(r[id]), d); return [`${'    '.repeat(d)}${d ? '└─ ' : ''}${r[detail]}`]; });
  state.results[state.resultTab] = { ...res, columns: [{ name: t('db.plan') }], rows, plan: true };
  render();
}

// ---- query history (this browser only) ------------------------------------------------------------------

const HISTORY_KEY = 'suite.dbtool.history';
let history = (() => { try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch (e) { return []; } })();
function addHistory(sql, s, ok) {
  const text = sql.trim();
  if (!text) return;
  history = [{ sql: text, db: s.name, ok, time: Date.now() }, ...history.filter((h) => h.sql !== text)].slice(0, 200);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch (e) { /* storage blocked or full */ }
}
async function clearHistory() {
  if (!(await Suite.shell.confirm(t('db.clearHistoryConfirm')))) return;
  history = [];
  try { localStorage.removeItem(HISTORY_KEY); } catch (e) { /* storage blocked */ }
  render();
}
function runAll() { execute(editor.state.doc.toString()); }

// ---- running SQL --------------------------------------------------------------------------------------------

const READ_ONLY = /^(SELECT|PRAGMA|EXPLAIN|WITH|VALUES|SHOW)$/i;

// ---- undo ------------------------------------------------------------------------------------------------------
// SQLite: snapshots of the database file before every change (grid edits and executed statements), up to a size
// limit. Postgres: inverse statements for the edits in the result grid (statements typed by the user are not undone).

const MODIFYING = /\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|VACUUM|REINDEX|PRAGMA|ATTACH|DETACH)\b/i;
const MAX_UNDO = 20;
const MAX_SNAPSHOT_BYTES = 32 * 1024 * 1024;

function sqliteSnapshot(s) {
  if (s.driver.kind !== 'sqlite') return null;
  try { return s.driver.size() <= MAX_SNAPSHOT_BYTES ? s.driver.export() : null; } catch (e) { return null; }
}

function pushUndo(s, op) {
  s.undo = [...(s.undo || []), op].slice(-MAX_UNDO);
  s.redo = [];
}

async function undoStep(redo) {
  const s = session();
  if (!s || state.busy) return;
  const from = redo ? s.redo : s.undo;
  if (!from || !from.length) return;
  const op = from.pop();
  const to = redo ? (s.undo = s.undo || []) : (s.redo = s.redo || []);
  try {
    if (op.bytes) {
      to.push({ bytes: s.driver.export(), label: op.label });
      s.driver.restore(op.bytes);
      s.dirty = true;
      updateDirty();
    } else {
      await s.driver.query(redo ? op.redoSql : op.undoSql);
      to.push(op);
    }
    await refreshSchema(s);
    const res = state.results[state.resultTab];
    if (res && res.browse) {
      const tbl = s.schema.find((x) => x.name === res.browse.table.name && x.schema === res.browse.table.schema);
      if (tbl) await browse(tbl, { offset: res.browse.offset });
    }
    state.message = { kind: 'ok', text: t(redo ? 'db.redone' : 'db.undone', op.label) };
  } catch (e) { state.message = { kind: 'error', text: e.message }; }
  render();
}

async function execute(text, { browse = null, history: remember = !browse } = {}) {
  const s = session();
  if (!s || !text.trim() || state.busy) return;
  state.busy = true;
  state.message = null;
  render();
  const t0 = performance.now();
  const before = MODIFYING.test(text) ? sqliteSnapshot(s) : null;
  const modified = (results) => results.find((r) => r.command && !r.columns.length && !READ_ONLY.test(r.command));
  try {
    const results = await s.driver.query(text);
    if (before && modified(results)) pushUndo(s, { bytes: before, label: modified(results).command });
    const ms = Math.round(performance.now() - t0);
    state.results = results.map((r) => ({ ...r, browse: browse && r.columns.length ? browse : null }));
    state.resultTab = Math.max(0, state.results.findIndex((r) => r.columns.length));
    const changes = results.filter((r) => !r.columns.length && r.command);
    state.message = { kind: 'ok', text: [...changes.map((r) => t('db.affected', r.command, r.rowCount)), t('db.done', ms)].join(' · ') };
    if (remember) addHistory(text, s, true);
    if (s.driver.kind === 'sqlite' && results.some((r) => r.command && !READ_ONLY.test(r.command))) { s.dirty = true; updateDirty(); }
    if (results.some((r) => /^(CREATE|DROP|ALTER)$/i.test(r.command))) await refreshSchema(s);
  } catch (e) {
    state.results = (e.results || []).map((r) => ({ ...r }));
    if (remember) addHistory(text, s, false);
    if (before && modified(state.results)) pushUndo(s, { bytes: before, label: modified(state.results).command });
    state.message = { kind: 'error', text: e.fields ? `${e.fields.S || 'ERROR'} ${e.code || ''}: ${e.message}${e.fields.D ? `\n${e.fields.D}` : ''}${e.fields.H ? `\n${e.fields.H}` : ''}` : Suite.i18n.describe(e).replace(/^.*?: /, '') };
  } finally {
    state.busy = false;
    render();
  }
}

/** The schema as an ER diagram, opened in the diagram editor (a new tab or window). */
async function openErDiagram() {
  const s = session();
  if (!s) return;
  const tables = s.schema.filter((x) => x.type === 'table' || x.type === 'view');
  if (!tables.length) { Suite.shell.toast(t('db.erEmpty'), 'warning'); return; }
  try {
    const xml = erDiagram(tables, await s.driver.foreignKeys());
    state.lastEr = xml; // for tests
    await Suite.bridge.openIn('diagram', { name: `${s.name.replace(/\.[^.]+$/, '')}.drawio`, data: xml, source: s.name });
  } catch (e) { fail(e); }
}

async function refreshSchema(s = session()) {
  if (!s) return;
  try { s.schema = await s.driver.schema(); } catch (e) { fail(e); }
  if (s === session()) configureEditor(s);
  render();
}

// ---- sessions ------------------------------------------------------------------------------------------------

async function addSession(props) {
  const s = { id: nextSessionId++, sql: '', schema: [], dirty: false, ...props };
  state.sessions.push(s);
  activate(s);
  await refreshSchema(s);
  return s;
}

function activate(s) {
  const prev = session();
  if (prev) prev.sql = editor.state.doc.toString();
  state.active = s ? s.id : null;
  state.results = [];
  state.message = null;
  setEditorText(s ? s.sql : '');
  configureEditor(s);
  render();
}

async function newSqlite() {
  try { await addSession({ name: `${t('db.untitled')}.sqlite`, driver: await openSqlite(), fileName: null, handle: null, isNew: true }); } catch (e) { fail(e); }
}

async function openSqliteFile() {
  const picked = await Suite.files.open({ types: SQLITE_TYPES }).catch(fail);
  if (picked) await openPicked(picked[0]);
}

// recovery copies of unsaved work (shared/js/autosave.js): changed SQLite databases
Suite.autosave.register({
  app: APP,
  save: () => {
    const list = state.sessions.filter((s) => s.dirty && s.driver.kind === 'sqlite').map((s) => ({ name: s.name, fileName: s.fileName, handle: s.handle || null, bytes: s.driver.export() }));
    return list.length ? { name: list.map((s) => s.name).join(', '), sessions: list } : null;
  },
  restore: async (snap) => {
    for (const x of snap.sessions) {
      await addSession({ name: x.name, driver: await openSqlite(x.bytes), fileName: x.fileName, handle: x.handle });
      session().dirty = true;
    }
    updateDirty();
    render();
  },
});

async function openPicked({ file, handle }) {
  try {
    const driver = await openSqlite(new Uint8Array(await file.arrayBuffer()));
    await addSession({ name: file.name, driver, fileName: file.name, handle });
    if (handle) Suite.files.remember(APP, handle);
  } catch (e) { fail(e); }
}

async function saveDb(as = false) {
  const s = session();
  if (!s || s.driver.kind !== 'sqlite') return;
  try {
    const bytes = s.driver.export();
    const result = as || !s.handle && s.isNew ? await Suite.files.saveAs(bytes, { suggestedName: s.name, types: SQLITE_TYPES, type: 'application/vnd.sqlite3' })
      : await Suite.files.save({ name: s.fileName || s.name, handle: s.handle }, bytes, { type: 'application/vnd.sqlite3' });
    if (!result) return;
    if (result.mode === 'downloaded') Suite.shell.banner(result.message); else Suite.shell.toast(result.message);
    if (result.handle) s.handle = result.handle;
    s.name = s.fileName = result.name || s.name;
    s.isNew = false;
    s.dirty = false;
    updateDirty();
    render();
  } catch (e) { fail(e); }
}

async function closeSession(s) {
  if (s.dirty && !(await Suite.shell.confirm(t('db.unsaved', s.name)))) return;
  await s.driver.close().catch(() => {});
  state.sessions = state.sessions.filter((x) => x !== s);
  if (state.active === s.id) activate(state.sessions[0] || null);
  updateDirty();
  render();
}

async function connectPostgres(c) {
  const relay = data.relay;
  if (!data.relayConfigured()) { Suite.shell.toast(t('db.relayMissing'), 'error'); return false; }
  state.busy = true;
  render();
  try {
    const open = c.kind === 'mysql' ? openMysql : openPostgres;
    const driver = await open({ relay: data.relayConfig(), host: c.host, port: c.port, database: c.database, user: c.username, password: c.password, ssl: c.ssl || 'prefer', insecure: !!c.insecure });
    await addSession({ name: c.name || `${c.username}@${c.host}/${c.database}`, driver });
    return true;
  } catch (e) {
    Suite.shell.toast(e.errno ? `${e.errno}${e.code && e.code !== String(e.errno) ? ` (${e.code})` : ''}: ${e.message}` : e.fields ? `${e.code}: ${e.message}` : Suite.i18n.describe(e), 'error');
    return false;
  } finally { state.busy = false; render(); }
}

// ---- browsing and editing tables ------------------------------------------------------------------------------

const KIND_ICON = { sqlite: 'database', postgres: 'database-zap', mysql: 'database-backup' };
const DEFAULT_PORT = { postgres: 5432, mysql: 3306 };
const qualified = (s, tbl) => (s.driver.kind === 'postgres' ? `${s.driver.quote(tbl.schema)}.${s.driver.quote(tbl.name)}` : s.driver.quote(tbl.name));

async function browse(tbl, { offset = 0 } = {}) {
  const s = session();
  const key = tbl.type === 'table' ? s.driver.rowKey(tbl) : [];
  const keyCols = key.filter((k) => !tbl.columns.some((c) => c.name === k)); // e.g. rowid
  const select = [...keyCols.map((k) => s.driver.quote(k)), '*'].join(', ');
  const text = `SELECT ${select} FROM ${qualified(s, tbl)}${key.length ? ` ORDER BY ${key.map((k) => s.driver.quote(k)).join(', ')}` : ''} LIMIT ${BROWSE_LIMIT} OFFSET ${offset};`;
  setEditorText(text);
  await execute(text, { browse: { table: tbl, key, offset, hidden: keyCols.length } });
}

function keyWhere(s, res, row) {
  return res.browse.key.map((k) => {
    const i = res.columns.findIndex((c) => c.name === k);
    return `${s.driver.quote(k)} = ${s.driver.literal(row[i])}`;
  }).join(' AND ');
}

async function updateCell(res, rowIndex, colIndex, value) {
  const s = session();
  const row = res.rows[rowIndex];
  const col = res.columns[colIndex];
  const literal = value === null ? 'NULL' : col.numeric && value !== '' && !isNaN(Number(value)) ? value : s.driver.literal(value);
  const text = `UPDATE ${qualified(s, res.browse.table)} SET ${s.driver.quote(col.name)} = ${literal} WHERE ${keyWhere(s, res, row)};`;
  const before = sqliteSnapshot(s);
  const old = row[colIndex];
  try {
    await s.driver.query(text);
    row[colIndex] = value === null ? null : col.numeric && value !== '' && !isNaN(Number(value)) ? Number(value) : value;
    pushUndo(s, before ? { bytes: before, label: 'UPDATE' }
      : { label: 'UPDATE', redoSql: text, undoSql: `UPDATE ${qualified(s, res.browse.table)} SET ${s.driver.quote(col.name)} = ${s.driver.literal(old)} WHERE ${keyWhere(s, res, row)};` });
    if (s.driver.kind === 'sqlite') { s.dirty = true; updateDirty(); }
    state.message = { kind: 'ok', text };
  } catch (e) { state.message = { kind: 'error', text: e.message }; }
  render();
}

async function deleteRow(res, rowIndex) {
  if (!(await Suite.shell.confirm(t('db.deleteRowConfirm')))) return;
  const s = session();
  const row = res.rows[rowIndex];
  const text = `DELETE FROM ${qualified(s, res.browse.table)} WHERE ${keyWhere(s, res, row)};`;
  const before = sqliteSnapshot(s);
  const cols = res.columns.map((c, i) => [c, i]).slice(res.browse.hidden || 0);
  try {
    await s.driver.query(text);
    pushUndo(s, before ? { bytes: before, label: 'DELETE' }
      : { label: 'DELETE', redoSql: text, undoSql: `INSERT INTO ${qualified(s, res.browse.table)} (${cols.map(([c]) => s.driver.quote(c.name)).join(', ')}) VALUES (${cols.map(([, i]) => s.driver.literal(row[i])).join(', ')});` });
    res.rows.splice(rowIndex, 1);
    if (s.driver.kind === 'sqlite') { s.dirty = true; updateDirty(); }
    state.message = { kind: 'ok', text };
  } catch (e) { state.message = { kind: 'error', text: e.message }; }
  render();
}

async function insertRow(tbl, values) {
  const s = session();
  const cols = Object.keys(values).filter((k) => values[k] !== undefined);
  const text = cols.length
    ? `INSERT INTO ${qualified(s, tbl)} (${cols.map((c) => s.driver.quote(c)).join(', ')}) VALUES (${cols.map((c) => (values[c] === null ? 'NULL' : s.driver.literal(values[c]))).join(', ')});`
    : `INSERT INTO ${qualified(s, tbl)} DEFAULT VALUES;`;
  const before = sqliteSnapshot(s);
  try {
    await s.driver.query(text);
    if (before) pushUndo(s, { bytes: before, label: 'INSERT' });
    if (s.driver.kind === 'sqlite') { s.dirty = true; updateDirty(); }
    state.dialog = null;
    await browse(tbl);
  } catch (e) { state.dialog.error = e.message; render(); }
}

// ---- export ----------------------------------------------------------------------------------------------------

function visibleColumns(res) { return res.columns.map((c, i) => ({ c, i })).slice(res.browse ? res.browse.hidden : 0); }

/** Export a result (a browsed table: all its rows, not only the loaded page) as CSV, JSON or XLSX. */
async function exportResult(res, format) {
  const cols = visibleColumns(res);
  let header = cols.map(({ c }) => c.name);
  let rows = res.rows.map((r) => cols.map(({ i }) => r[i]));
  const base = res.browse ? res.browse.table.name : 'result';
  if (res.browse) {
    const s = session();
    try {
      const tbl = res.browse.table;
      const [full] = await s.driver.query(`SELECT * FROM ${qualified(s, tbl)}${res.browse.key.length ? ` ORDER BY ${res.browse.key.map((k) => s.driver.quote(k)).join(', ')}` : ''};`);
      if (full) { header = full.columns.map((c) => c.name); rows = full.rows; }
    } catch (e) { Suite.shell.toast(e.message, 'error'); return; }
  }
  let bytes, type, ext;
  if (format === 'csv') {
    bytes = new TextEncoder().encode(`﻿${Suite.csv.stringify([header, ...rows.map((r) => r.map((v) => (v === null ? '' : v)))])}`);
    type = 'text/csv'; ext = 'csv';
  } else if (format === 'xlsx') {
    bytes = writeXlsx(base, header, rows);
    type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; ext = 'xlsx';
  } else {
    bytes = new TextEncoder().encode(JSON.stringify(rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]]))), null, 2));
    type = 'application/json'; ext = 'json';
  }
  Suite.files.download(bytes, `${base}.${ext}`, type);
  Suite.shell.toast(t('db.exported', rows.length));
}

// ---- import (CSV, TSV, XLSX) into a new or an existing table -------------------------------------------------------

const IMPORT_TYPES = [{ description: 'CSV / XLSX', accept: { 'text/csv': ['.csv', '.tsv', '.txt'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }];
const tableName = (file) => file.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}_]+/gu, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, '_$1') || 'imported';

async function chooseImport() {
  const s = session();
  if (!s) return;
  const picked = await Suite.files.open({ types: IMPORT_TYPES }).catch((e) => { Suite.shell.toast(Suite.i18n.describe(e), 'error'); });
  if (!picked) return;
  try {
    const rows = readTable(new Uint8Array(await picked[0].file.arrayBuffer()), picked[0].file.name);
    if (!rows.length) { Suite.shell.toast(t('db.importEmpty'), 'warning'); return; }
    const tables = (session().schema || []).filter((x) => x.type === 'table');
    state.dialog = { kind: 'import', file: picked[0].file.name, rows, header: true, mode: 'new', name: tableName(picked[0].file.name), target: tables[0] ? tables[0].name : '', error: '' };
    render();
  } catch (e) { Suite.shell.toast(t('db.importUnreadable', picked[0].file.name, e.message), 'error'); }
}

/** The plan of an import: { columns: [{ name, type, index }], body, table (existing or null), unknown (file columns without a target) }. */
function importPlan(d) {
  const width = Math.max(...d.rows.map((r) => r.length));
  const names = Array.from({ length: width }, (_, i) => (d.header && d.rows[0][i] != null && String(d.rows[0][i]).trim() ? String(d.rows[0][i]).trim() : `column${i + 1}`));
  const body = d.header ? d.rows.slice(1) : d.rows;
  const types = columnTypes(body);
  if (d.mode === 'new') return { columns: names.map((name, index) => ({ name, type: types[index], index })), body, table: null, unknown: [] };
  const table = (session().schema || []).find((x) => x.type === 'table' && x.name === d.target);
  if (!table) return { columns: [], body, table: null, unknown: names };
  const columns = [], unknown = [];
  names.forEach((name, index) => {
    const col = d.header ? table.columns.find((c) => c.name.toLowerCase() === name.toLowerCase()) : table.columns[index];
    if (col) columns.push({ name: col.name, type: /int|real|float|double|num|dec/i.test(col.type) ? 'real' : 'text', index }); else unknown.push(name);
  });
  return { columns, body, table, unknown };
}

const SQL_TYPES = { sqlite: { integer: 'INTEGER', real: 'REAL', text: 'TEXT' }, postgres: { integer: 'bigint', real: 'double precision', text: 'text' }, mysql: { integer: 'BIGINT', real: 'DOUBLE', text: 'TEXT' } };

async function runImport() {
  const d = state.dialog;
  const s = session();
  const plan = importPlan(d);
  if (!plan.columns.length) { d.error = t('db.importNoColumns'); render(); return; }
  const types = SQL_TYPES[s.driver.kind] || SQL_TYPES.sqlite;
  const name = d.mode === 'new' ? d.name.trim() : plan.table.name;
  const target = d.mode === 'new' ? qualified(s, { schema: s.driver.kind === 'postgres' ? 'public' : 'main', name }) : qualified(s, plan.table);
  const value = (v, type) => {
    if (v === null || v === undefined || v === '') return 'NULL';
    if (typeof v === 'boolean') return v ? '1' : '0';
    if ((type === 'integer' || type === 'real') && /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(String(v).trim())) return String(v).trim();
    return s.driver.literal(String(v));
  };
  const before = sqliteSnapshot(s);
  state.busy = true; d.error = ''; render();
  try {
    await s.driver.query('BEGIN;');
    if (d.mode === 'new') await s.driver.query(`CREATE TABLE ${target} (${plan.columns.map((c) => `${s.driver.quote(c.name)} ${types[c.type]}`).join(', ')});`);
    const cols = plan.columns.map((c) => s.driver.quote(c.name)).join(', ');
    for (let i = 0; i < plan.body.length; i += 200) {
      const chunk = plan.body.slice(i, i + 200).map((r) => `(${plan.columns.map((c) => value(r[c.index], c.type)).join(', ')})`);
      await s.driver.query(`INSERT INTO ${target} (${cols}) VALUES ${chunk.join(', ')};`);
    }
    await s.driver.query('COMMIT;');
    if (before) pushUndo(s, { bytes: before, label: 'IMPORT' });
    if (s.driver.kind === 'sqlite') { s.dirty = true; updateDirty(); }
    state.dialog = null;
    state.busy = false;
    Suite.shell.toast(t('db.imported', plan.body.length, name));
    await refreshSchema(s);
    const tbl = (session().schema || []).find((x) => x.name === name);
    if (tbl) await browse(tbl);
  } catch (e) {
    try { await s.driver.query('ROLLBACK;'); } catch (x) { /* not in a transaction */ }
    d.error = e.message;
  } finally { state.busy = false; render(); }
}

function ImportDialog() {
  const d = state.dialog;
  const plan = importPlan(d);
  const preview = plan.body.slice(0, 5);
  const tables = (session().schema || []).filter((x) => x.type === 'table');
  return html`<dialog open data-testid="import-dialog"><article class="db-dialog db-import">
    <header><strong>${t('db.importTitle', d.file)}</strong></header>
    <p><small>${t('db.importRows', plan.body.length)}</small></p>
    <label class="db-check"><input type="checkbox" checked=${d.header} data-testid="import-header" onChange=${(e) => { d.header = e.target.checked; render(); }} /> ${t('db.importHeader')}</label>
    <div class="db-row">
      <label><input type="radio" name="mode" checked=${d.mode === 'new'} data-testid="import-new" onChange=${() => { d.mode = 'new'; render(); }} /> ${t('db.importNew')}</label>
      <label><input type="radio" name="mode" checked=${d.mode === 'existing'} disabled=${!tables.length} data-testid="import-existing" onChange=${() => { d.mode = 'existing'; render(); }} /> ${t('db.importExisting')}</label>
    </div>
    ${d.mode === 'new' ? html`<label>${t('db.importName')}<input data-testid="import-name" value=${d.name} onInput=${(e) => { d.name = e.target.value; }} /></label>`
      : html`<label>${t('db.importTable')}<select data-testid="import-table" onChange=${(e) => { d.target = e.target.value; render(); }}>${tables.map((x) => html`<option value=${x.name} selected=${x.name === d.target}>${x.name}</option>`)}</select></label>`}
    <div class="db-import-preview"><table data-testid="import-preview"><thead><tr>${plan.columns.map((c) => html`<th>${c.name}<br /><small>${d.mode === 'new' ? (SQL_TYPES[session().driver.kind] || SQL_TYPES.sqlite)[c.type] : ''}</small></th>`)}</tr></thead>
      <tbody>${preview.map((r) => html`<tr>${plan.columns.map((c) => html`<td>${r[c.index] === null || r[c.index] === undefined ? '' : String(r[c.index])}</td>`)}</tr>`)}</tbody></table></div>
    ${plan.unknown.length ? html`<p class="db-warn" data-testid="import-unknown">${t('db.importUnknown', plan.unknown.join(', '))}</p>` : null}
    ${d.error ? html`<p class="db-error" data-testid="import-error">${d.error}</p>` : null}
    <footer><button type="button" class="secondary" onClick=${() => { state.dialog = null; render(); }}>${t('db.cancel')}</button>
      <button type="button" data-testid="import-ok" aria-busy=${state.busy} disabled=${state.busy || !plan.columns.length || (d.mode === 'new' && !d.name.trim())} onClick=${runImport}>${t('db.importOk')}</button></footer>
  </article></dialog>`;
}

// ---- UI ----------------------------------------------------------------------------------------------------------

function Toolbar() {
  const s = session();
  const res = state.results[state.resultTab];
  return html`<nav class="db-toolbar" role="toolbar">
    <button class="secondary outline db-only-phone" data-testid="toggle-panels" title=${Suite.t('common.panels')} onClick=${() => { state.panels = !state.panels; render(); }}>${Suite.icon('menu')}</button>
    <button class="secondary" data-testid="new-sqlite" onClick=${newSqlite}>${t('db.newSqlite')}</button>
    <button class="secondary" data-testid="open-sqlite" onClick=${openSqliteFile}>${t('db.openSqlite')}</button>
    <${Suite.shell.Recent} app=${APP} onOpen=${(p) => openPicked(p)} />
    ${s && s.driver.kind === 'sqlite' ? html`<button class=${s.dirty ? '' : 'secondary outline'} data-testid="save-db" onClick=${() => saveDb()}>${t('db.saveDb')}</button>` : null}
    <button class="secondary outline" data-testid="connect" onClick=${() => { state.dialog = { kind: 'pg', c: { kind: 'postgres', name: '', host: 'localhost', port: 5432, database: '', username: '', password: '', ssl: 'prefer', insecure: false, savePassword: false } }; render(); }}>${t('db.connect')}</button>
    ${s ? html`<button class="secondary outline" title="${t('db.undo')} (Ctrl+Z)" data-testid="undo" disabled=${!(s.undo && s.undo.length) || state.busy} onClick=${() => undoStep(false)}>${Suite.icon('undo-2')}</button>
      <button class="secondary outline" title="${t('db.redo')} (Ctrl+Y)" data-testid="redo" disabled=${!(s.redo && s.redo.length) || state.busy} onClick=${() => undoStep(true)}>${Suite.icon('redo-2')}</button>` : null}
    <span class="db-sep"></span>
    <button data-testid="run" disabled=${!s || state.busy} title="Ctrl+Enter" aria-busy=${state.busy} onClick=${runCurrent}>${Suite.icon('play')} ${t('db.run')}</button>
    <button class="secondary outline" data-testid="run-all" disabled=${!s || state.busy} title="Ctrl+Shift+Enter" onClick=${runAll}>${t('db.runAll')}</button>
    <button class="secondary outline" data-testid="explain" disabled=${!s || state.busy} title=${t('db.explainTitle')} onClick=${explainCurrent}>${t('db.explain')}</button>
    ${res && res.columns.length ? html`<button class="secondary outline" data-testid="export-csv" onClick=${() => exportResult(res, 'csv')}>CSV</button>
      <button class="secondary outline" data-testid="export-xlsx" onClick=${() => exportResult(res, 'xlsx')}>XLSX</button>
      <button class="secondary outline" data-testid="export-json" onClick=${() => exportResult(res, 'json')}>JSON</button>` : null}
    <button class="secondary outline" data-testid="import-data" disabled=${!s || state.busy} title=${t('db.importHint')} onClick=${chooseImport}>${Suite.icon('import')} ${t('db.import')}</button>
  </nav>`;
}

function Sidebar() {
  const s = session();
  const q = state.filter.trim().toLowerCase();
  const tables = s ? s.schema.filter((x) => !q || x.name.toLowerCase().includes(q)) : [];
  const conns = data.connections();
  return html`<aside class=${`db-side suite-drawer ${state.panels ? 'open' : ''}`} data-testid="sidebar">
    <section>
      <strong>${t('db.sessions')}</strong>
      <ul class="db-sessions">${state.sessions.map((x) => html`<li class=${x.id === state.active ? 'active' : ''} data-testid="session">
        <span class="db-session-name" onClick=${() => { state.panels = false; activate(x); }}>${Suite.icon(KIND_ICON[x.driver.kind] || 'database')} ${x.name}${x.dirty ? ' •' : ''}</span>
        <button class="secondary outline" title=${t('db.close')} data-testid="close-session" onClick=${() => closeSession(x)}>×</button></li>`)}</ul>
    </section>
    ${s ? html`<section class="db-schema" data-testid="schema">
      <div class="db-schema-head"><strong>${t('db.schema')}</strong>
        <button class="secondary outline" title=${t('db.erTitle')} data-testid="er-diagram" onClick=${() => { state.panels = false; openErDiagram(); }}>${Suite.icon('database')} ${t('db.er')}</button>
        <button class="secondary outline" title=${t('db.refresh')} data-testid="refresh-schema" onClick=${() => refreshSchema()}>${Suite.icon('rotate-cw')}</button></div>
      <input type="search" placeholder=${t('db.filter')} value=${state.filter} onInput=${(e) => { state.filter = e.target.value; render(); }} />
      <ul class="db-tree">${tables.map((tbl) => html`<li data-testid="table">
        <details><summary><span class="db-table-name" data-testid="table-name">${tbl.type === 'view' ? Suite.icon('eye') : Suite.icon('table')} ${tbl.schema && !['main', 'public'].includes(tbl.schema) ? `${tbl.schema}.` : ''}${tbl.name}</span>
          <button class="secondary outline" data-testid="browse" onClick=${(e) => { e.preventDefault(); state.panels = false; browse(tbl); }}>${t('db.browse')}</button></summary>
          <ul>${tbl.columns.map((c) => html`<li class="db-col">${c.pk ? Suite.icon('key-round') : ''}${c.name} <small>${c.type}${c.notnull ? ' NOT NULL' : ''}</small></li>`)}</ul>
        </details></li>`)}</ul>
    </section>` : null}
    ${history.length ? html`<section class="db-history" data-testid="history">
      <div class="db-schema-head"><strong>${t('db.history')}</strong><button class="secondary outline" title=${t('db.clearHistory')} data-testid="clear-history" onClick=${clearHistory}>×</button></div>
      <ul>${history.slice(0, 30).map((h) => html`<li data-testid="history-item" class=${h.ok ? '' : 'failed'} title=${`${h.db} · ${new Date(h.time).toLocaleString()}\n${h.sql}`}
        onClick=${() => { setEditorText(h.sql); state.panels = false; render(); editor.focus(); }} onDblClick=${() => { setEditorText(h.sql); execute(h.sql); }}>
        <code>${h.sql.replace(/\s+/g, ' ').slice(0, 120)}</code></li>`)}</ul>
    </section>` : null}
    <section class="db-saved">
      <strong>${t('db.saved')}</strong>
      <ul>${conns.map((c) => html`<li data-testid="saved-connection">
        <a href="#" onClick=${(e) => { e.preventDefault(); state.panels = false; if (c.password) connectPostgres(c); else { state.dialog = { kind: 'pg', c: { ...c, savePassword: false } }; render(); } }}>${Suite.icon(KIND_ICON[c.kind || 'postgres'])} ${c.name}</a>
        <button class="secondary outline" title=${t('db.edit')} data-testid="edit-connection" onClick=${() => { state.dialog = { kind: 'pg', c: { ...c, savePassword: !!c.password } }; render(); }}>${Suite.icon('pencil')}</button>
        <button class="secondary outline" title=${t('db.delete')} data-testid="delete-connection" onClick=${async () => { if (await Suite.shell.confirm(t('db.deleteConfirm', c.name))) data.deleteConnection(c.id); }}>×</button></li>`)}</ul>
      <${data.Bar} />
    </section>
  </aside>`;
}

function Cell({ res, r, i, editable }) {
  const v = res.rows[r][i];
  const editing = state.editing && state.editing.res === res && state.editing.r === r && state.editing.i === i;
  if (editing) {
    return html`<td class="db-editing"><input data-testid="cell-input" defaultValue=${v === null ? '' : String(v)} autofocus
      onKeyDown=${(e) => {
        if (e.key === 'Enter') { state.editing = null; updateCell(res, r, i, e.target.value); }
        if (e.key === 'Escape') { state.editing = null; render(); }
        if (e.key === 'Delete' && e.ctrlKey) { state.editing = null; updateCell(res, r, i, null); }
      }} onBlur=${() => { if (state.editing && state.editing.res === res) { state.editing = null; render(); } }} /></td>`;
  }
  return html`<td class=${`${res.columns[i].numeric ? 'num' : ''} ${v === null ? 'null' : ''}`} data-testid="cell"
    onDblClick=${editable ? () => { state.editing = { res, r, i }; render(); } : null}>${v === null ? 'NULL' : typeof v === 'boolean' ? String(v) : String(v).length > 300 ? `${String(v).slice(0, 300)}…` : String(v)}</td>`;
}

function ResultGrid({ res }) {
  const cols = visibleColumns(res);
  const editable = res.browse && res.browse.key.length > 0;
  const rows = res.rows.slice(0, MAX_ROWS);
  return html`<div class="db-grid-wrap">
    ${res.browse ? html`<div class="db-browse-bar">
      <strong>${res.browse.table.name}</strong>
      ${res.browse.table.type === 'table' ? html`<button class="secondary outline" data-testid="add-row" onClick=${() => { state.dialog = { kind: 'insert', table: res.browse.table, values: {} }; render(); }}>+ ${t('db.addRow')}</button>` : null}
      <button class="secondary outline" disabled=${res.browse.offset === 0} data-testid="page-prev" onClick=${() => browse(res.browse.table, { offset: Math.max(0, res.browse.offset - BROWSE_LIMIT) })}>‹</button>
      <span>${res.browse.offset + 1}–${res.browse.offset + res.rows.length}</span>
      <button class="secondary outline" disabled=${res.rows.length < BROWSE_LIMIT} data-testid="page-next" onClick=${() => browse(res.browse.table, { offset: res.browse.offset + BROWSE_LIMIT })}>›</button>
      ${res.browse.table.type === 'table' && !editable ? html`<small>${t('db.noKey')}</small>` : null}
    </div>` : null}
    <div class="db-grid" data-testid="grid">
      <table>
        <thead><tr><th class="db-rownum">#</th>${cols.map(({ c }) => html`<th title=${c.type}>${c.name}</th>`)}${editable ? html`<th></th>` : null}</tr></thead>
        <tbody>${rows.map((row, r) => html`<tr data-testid="row">
          <td class="db-rownum">${(res.browse ? res.browse.offset : 0) + r + 1}</td>
          ${cols.map(({ i }) => html`<${Cell} res=${res} r=${r} i=${i} editable=${editable} />`)}
          ${editable ? html`<td class="db-row-actions"><button class="secondary outline" title=${t('db.deleteRow')} data-testid="delete-row" onClick=${() => deleteRow(res, r)}>×</button></td>` : null}
        </tr>`)}</tbody>
      </table>
    </div>
    <p class="db-count" data-testid="row-count">${res.rows.length > MAX_ROWS ? t('db.shown', MAX_ROWS, res.rows.length) : t('db.rows', res.rows.length)}</p>
  </div>`;
}

function Results() {
  const sets = state.results.filter((r) => r.columns.length);
  const res = state.results[state.resultTab];
  return html`<section class="db-results" data-testid="results">
    ${sets.length > 1 ? html`<div class="db-result-tabs">${state.results.map((r, i) => (r.columns.length ? html`<button class=${i === state.resultTab ? '' : 'secondary outline'} data-testid="result-tab"
      onClick=${() => { state.resultTab = i; render(); }}>${t('db.result', sets.indexOf(r) + 1)}</button>` : null))}</div>` : null}
    ${state.message ? html`<pre class=${`db-message ${state.message.kind}`} data-testid="message">${state.message.text}</pre>` : null}
    ${res && res.columns.length ? html`<${ResultGrid} res=${res} />` : null}
  </section>`;
}

function PgDialog() {
  const d = state.dialog;
  const c = d.c;
  const field = (key, label, type = 'text', extra = {}) => html`<label>${t(label)}<input type=${type} data-testid=${`pg-${key}`} value=${c[key] ?? ''} ...${extra}
    onInput=${(e) => { c[key] = type === 'number' ? Number(e.target.value) : e.target.value; }} /></label>`;
  const saveConn = () => {
    const stored = { ...c };
    delete stored.savePassword;
    if (!c.savePassword) stored.password = '';
    stored.url = `${c.kind === 'mysql' ? 'mysql' : 'postgres'}://${c.host}:${c.port}/${c.database}`;
    stored.name = c.name || `${c.username}@${c.host}/${c.database}`;
    c.id = data.saveConnection(stored);
  };
  return html`<dialog open data-testid="pg-dialog"><article class="db-dialog">
    <header><strong>${t('db.serverTitle')}</strong></header>
    <form onSubmit=${async (e) => { e.preventDefault(); if (await connectPostgres(c)) { state.dialog = null; render(); } }}>
      <label>${t('db.serverKind')}<select data-testid="pg-kind" onChange=${(e) => { const kind = e.target.value; if (c.port === DEFAULT_PORT[c.kind || 'postgres']) c.port = DEFAULT_PORT[kind]; c.kind = kind; render(); }}>
        <option value="postgres" selected=${(c.kind || 'postgres') === 'postgres'}>PostgreSQL</option><option value="mysql" selected=${c.kind === 'mysql'}>MySQL / MariaDB</option></select></label>
      ${field('name', 'db.name')}
      <div class="db-row">${field('host', 'db.host')}${field('port', 'db.port', 'number')}</div>
      <div class="db-row">${field('database', 'db.database')}${field('username', 'db.user', 'text', { autocomplete: 'username' })}</div>
      ${field('password', 'db.password', 'password', { autocomplete: 'current-password' })}
      <label><input type="checkbox" checked=${c.savePassword} data-testid="pg-save-password" onChange=${(e) => { c.savePassword = e.target.checked; }} /> ${t('db.savePassword')}</label>
      <div class="db-row">
        <label>${t('db.ssl')}<select data-testid="pg-ssl" onChange=${(e) => { c.ssl = e.target.value; }}>
          ${['prefer', 'require', 'disable'].map((v) => html`<option value=${v} selected=${(c.ssl || 'prefer') === v}>${t(`db.ssl${v[0].toUpperCase()}${v.slice(1)}`)}</option>`)}</select></label>
        <label class="db-check"><input type="checkbox" checked=${c.insecure} data-testid="pg-insecure" onChange=${(e) => { c.insecure = e.target.checked; }} /> ${t('db.insecure')}</label>
      </div>
      <${data.RelayFields} />
      <footer>
        <button type="button" class="secondary" onClick=${() => { state.dialog = null; render(); }}>${t('db.cancel')}</button>
        <button type="button" class="secondary outline" data-testid="pg-save" onClick=${() => { saveConn(); Suite.shell.toast(t('db.saveConnection')); state.dialog = null; render(); }}>${t('db.saveConnection')}</button>
        <button type="submit" data-testid="pg-connect" aria-busy=${state.busy}>${t('db.connectButton')}</button>
      </footer>
    </form>
  </article></dialog>`;
}

function InsertDialog() {
  const d = state.dialog;
  return html`<dialog open data-testid="insert-dialog"><article class="db-dialog">
    <header><strong>${t('db.addRow')}: ${d.table.name}</strong></header>
    <form onSubmit=${(e) => { e.preventDefault(); insertRow(d.table, d.values); }}>
      ${d.table.columns.map((c) => html`<label>${c.name} <small>${c.type}${c.pk ? Suite.icon('key-round') : ''}</small>
        <input data-testid=${`insert-${c.name}`} placeholder=${c.notnull ? '' : t('db.null')} onInput=${(e) => { d.values[c.name] = e.target.value === '' ? undefined : e.target.value; }} /></label>`)}
      ${d.error ? html`<p class="db-error" data-testid="insert-error">${d.error}</p>` : null}
      <footer><button type="button" class="secondary" onClick=${() => { state.dialog = null; render(); }}>${t('db.cancel')}</button><button type="submit" data-testid="insert-ok">${t('db.insert')}</button></footer>
    </form>
  </article></dialog>`;
}

function Main() {
  const s = session();
  return html`<div class="db-layout">
    <${Sidebar} />${state.panels ? Suite.shell.backdrop(() => { state.panels = false; render(); }) : null}
    <div class="db-work">
      <div class="db-editor" ref=${(el) => { if (el && editor.dom.parentElement !== el) el.appendChild(editor.dom); }} hidden=${!s}></div>
      ${s ? html`<${Results} />` : html`<p class="db-empty" data-testid="empty">${t('db.noSession')}</p>`}
    </div>
    ${state.dialog && state.dialog.kind === 'pg' ? html`<${PgDialog} />` : null}
    ${state.dialog && state.dialog.kind === 'insert' ? html`<${InsertDialog} />` : null}
    ${state.dialog && state.dialog.kind === 'import' ? html`<${ImportDialog} />` : null}
    <${data.Dialog} />
  </div>`;
}

Suite.shell.mount({ id: APP, title: 'app.title', version: '%%BUILD_VERSION%%', toolbar: () => html`<${Toolbar} />`, main: () => html`<${Main} />` });
new MutationObserver(() => editor.dispatch({ effects: theme.reconfigure(dark() ? oneDark : []) })).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

Suite.files.dropZone(document.body, async (picked) => { for (const p of picked) await openPicked(p); });
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveDb(e.shiftKey); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); openSqliteFile(); }
  const undoKey = Suite.UndoHistory.key(e);
  if (undoKey && !state.dialog) { e.preventDefault(); undoStep(undoKey === 'redo'); }
});

Suite.bridge.receive((picked) => openPicked(picked), { app: 'dbtool' }); // files opened from other apps ("Open with…")

// the open file(s) for "Create an archive from the open files" (about dialog)
// (SQLite databases; server connections have no file)
Suite.openFiles.register(() => state.sessions.filter((s) => s.driver.kind === 'sqlite')
  .map((s) => ({ name: s.fileName || (/\.(sqlite3?|db)$/i.test(s.name) ? s.name : `${s.name}.sqlite`), bytes: s.driver.export(), dirty: !!s.dirty })));

// for tests
window.DB = { exportResult, chooseImport, erDiagram, state, undoStep, editor, execute, setEditorText, session, data, explainCurrent, get history() { return history; } };
document.body.dataset.ready = 'true';
