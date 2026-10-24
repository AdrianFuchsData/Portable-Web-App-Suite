/*
 * HTTP analyzer: build and send HTTP requests (through the relay without CORS limits, or directly with fetch), inspect
 * responses, collections (Postman v2.1 files), environments with variables (stored with Suite.appdata), cURL, history.
 */
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { json } from '@codemirror/lang-json';
import { xml } from '@codemirror/lang-xml';
import { html as htmlLang } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { newRequest, newId, paramsOf, withParams, variableMap, build, fromCurl, toCurl, fromPostman, toPostman } from '@app/model.js';
import { runScript } from '@app/scripts.js';
import { fromOpenApi } from '@app/openapi.js';
import 'app/cm-symbols'; // emoji and symbols insert through the editor (shared/js/cm-symbols.js)

const { html } = Suite.shell;
const t = Suite.t;
const APP = 'http';
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const COLLECTION_TYPES = [{ description: 'Postman collection, OpenAPI', accept: { 'application/json': ['.json', '.postman_collection', '.yaml', '.yml'] } }];

Suite.i18n.register({
  en: {
    'app.title': 'HTTP analyzer',
    'h.newRequest': 'New request', 'h.newFolder': 'New folder', 'h.open': 'Open collection…', 'h.save': 'Save collection', 'h.importCurl': 'Import cURL…', 'h.send': 'Send',
    'h.method': 'Method', 'h.params': 'Params', 'h.headers': 'Headers', 'h.body': 'Body', 'h.auth': 'Auth', 'h.code': 'cURL', 'h.key': 'Key', 'h.value': 'Value', 'h.none': 'none',
    'h.raw': 'raw', 'h.urlencoded': 'x-www-form-urlencoded', 'h.formdata': 'form-data', 'h.file': 'file', 'h.chooseFile': 'Choose file…', 'h.authNone': 'No auth',
    'h.basic': 'Basic', 'h.bearer': 'Bearer token', 'h.user': 'User', 'h.password': 'Password', 'h.token': 'Token', 'h.response': 'Response', 'h.pretty': 'Pretty',
    'h.preview': 'Preview', 'h.saveBody': 'Save body', 'h.noResponse': 'Send a request to see the response.', 'h.sending': 'Sending…', 'h.collection': 'Collection',
    'h.history': 'History', 'h.environment': 'Environment', 'h.noEnvironment': 'No environment', 'h.environments': 'Environments…', 'h.via': 'Send via',
    'h.viaRelay': 'relay (no browser limits)', 'h.viaDirect': 'browser (CORS rules apply)', 'h.corsError': 'The request failed: network error or blocked by the browser (CORS). Send it through the relay to avoid browser limits.',
    'h.relayMissing': 'Configure the relay first (address and token), or send directly from the browser.', 'h.curlTitle': 'Import a cURL command', 'h.import': 'Import',
    'h.close': 'Close', 'h.copy': 'Copy', 'h.copied': 'Copied.', 'h.rename': 'Rename', 'h.delete': 'Delete', 'h.deleteConfirm': 'Delete “{0}”?', 'h.discard': 'Discard the unsaved changes of the collection?',
    'h.name': 'Name', 'h.envTitle': 'Environments', 'h.addEnv': 'Add environment', 'h.variables': 'Variables', 'h.collectionVars': 'Collection variables',
    'h.insecure': 'Accept untrusted certificates', 'h.followRedirects': 'Follow redirects', 'h.size': '{0}', 'h.time': '{0} ms', 'h.untitled': 'My collection',
    'h.connect': 'Connect', 'h.disconnect': 'Disconnect', 'h.wsMessage': 'Message (Ctrl+Enter sends)', 'h.wsSend': 'Send', 'h.wsClear': 'Clear',
    'h.wsConnecting': 'Connecting…', 'h.wsOpen': 'Connected{0}', 'h.wsClosed': 'Disconnected (code {0}{1})', 'h.wsError': 'The connection failed.',
    'h.wsDirect': 'WebSockets are opened directly by the browser (not through the relay). Subprotocols: header "Sec-WebSocket-Protocol".',
    'h.wsBinary': 'binary, {0}', 'h.wsEmpty': 'No messages yet.',
    'h.openapiImported': '{0} requests created from the OpenAPI description. Fill in the values of the (collection) variables.',
    'h.scripts': 'Scripts', 'h.prerequest': 'Pre-request', 'h.testsScript': 'Tests (after the response)', 'h.tests': 'Tests', 'h.console': 'Console',
    'h.scriptHint': 'JavaScript with pm.* as in Postman: pm.environment/collectionVariables/variables, pm.request, pm.response, pm.test(), pm.expect(). Runs isolated, without access to the suite.',
    'h.scriptError': 'Script error: {0}', 'h.passed': '{0} of {1} tests passed',
    'h.binary': 'Binary content ({0}). Use “Save body” to store it.', 'h.newName': 'New name', 'h.ok': 'OK', 'h.cancel': 'Cancel', 'h.duplicate': 'Duplicate', 'h.undo': 'Undo', 'h.redo': 'Redo',
  },
  de: {
    'app.title': 'HTTP-Analyse',
    'h.newRequest': 'Neue Anfrage', 'h.newFolder': 'Neuer Ordner', 'h.open': 'Sammlung öffnen…', 'h.save': 'Sammlung speichern', 'h.importCurl': 'cURL importieren…', 'h.send': 'Senden',
    'h.method': 'Methode', 'h.params': 'Parameter', 'h.headers': 'Header', 'h.body': 'Body', 'h.auth': 'Anmeldung', 'h.code': 'cURL', 'h.key': 'Schlüssel', 'h.value': 'Wert', 'h.none': 'keiner',
    'h.raw': 'roh', 'h.urlencoded': 'x-www-form-urlencoded', 'h.formdata': 'form-data', 'h.file': 'Datei', 'h.chooseFile': 'Datei wählen…', 'h.authNone': 'Keine Anmeldung',
    'h.basic': 'Basic', 'h.bearer': 'Bearer-Token', 'h.user': 'Benutzer', 'h.password': 'Passwort', 'h.token': 'Token', 'h.response': 'Antwort', 'h.pretty': 'Formatiert',
    'h.preview': 'Vorschau', 'h.saveBody': 'Body speichern', 'h.noResponse': 'Senden Sie eine Anfrage, um die Antwort zu sehen.', 'h.sending': 'Sende…', 'h.collection': 'Sammlung',
    'h.history': 'Verlauf', 'h.environment': 'Umgebung', 'h.noEnvironment': 'Keine Umgebung', 'h.environments': 'Umgebungen…', 'h.via': 'Senden über',
    'h.viaRelay': 'Relay (ohne Browser-Grenzen)', 'h.viaDirect': 'Browser (CORS-Regeln gelten)', 'h.corsError': 'Die Anfrage ist fehlgeschlagen: Netzwerkfehler oder vom Browser blockiert (CORS). Senden Sie sie über das Relay, um Browser-Grenzen zu umgehen.',
    'h.relayMissing': 'Richten Sie zuerst das Relay ein (Adresse und Token) oder senden Sie direkt aus dem Browser.', 'h.curlTitle': 'cURL-Befehl importieren', 'h.import': 'Importieren',
    'h.close': 'Schließen', 'h.copy': 'Kopieren', 'h.copied': 'Kopiert.', 'h.rename': 'Umbenennen', 'h.delete': 'Löschen', 'h.deleteConfirm': '„{0}“ löschen?', 'h.discard': 'Die ungespeicherten Änderungen der Sammlung verwerfen?',
    'h.name': 'Name', 'h.envTitle': 'Umgebungen', 'h.addEnv': 'Umgebung hinzufügen', 'h.variables': 'Variablen', 'h.collectionVars': 'Variablen der Sammlung',
    'h.insecure': 'Nicht vertrauenswürdige Zertifikate akzeptieren', 'h.followRedirects': 'Weiterleitungen folgen', 'h.size': '{0}', 'h.time': '{0} ms', 'h.untitled': 'Meine Sammlung',
    'h.connect': 'Verbinden', 'h.disconnect': 'Trennen', 'h.wsMessage': 'Nachricht (Strg+Eingabe sendet)', 'h.wsSend': 'Senden', 'h.wsClear': 'Leeren',
    'h.wsConnecting': 'Verbinde…', 'h.wsOpen': 'Verbunden{0}', 'h.wsClosed': 'Getrennt (Code {0}{1})', 'h.wsError': 'Die Verbindung ist fehlgeschlagen.',
    'h.wsDirect': 'WebSockets werden direkt vom Browser geöffnet (nicht über das Relay). Unterprotokolle: Header „Sec-WebSocket-Protocol“.',
    'h.wsBinary': 'binär, {0}', 'h.wsEmpty': 'Noch keine Nachrichten.',
    'h.openapiImported': '{0} Anfragen aus der OpenAPI-Beschreibung erstellt. Tragen Sie die Werte der Variablen (Sammlung) ein.',
    'h.scripts': 'Skripte', 'h.prerequest': 'Vor der Anfrage', 'h.testsScript': 'Tests (nach der Antwort)', 'h.tests': 'Tests', 'h.console': 'Konsole',
    'h.scriptHint': 'JavaScript mit pm.* wie in Postman: pm.environment/collectionVariables/variables, pm.request, pm.response, pm.test(), pm.expect(). Läuft abgeschottet ohne Zugriff auf die Suite.',
    'h.scriptError': 'Skriptfehler: {0}', 'h.passed': '{0} von {1} Tests bestanden',
    'h.binary': 'Binärer Inhalt ({0}). Mit „Body speichern“ sichern.', 'h.newName': 'Neuer Name', 'h.ok': 'OK', 'h.cancel': 'Abbrechen', 'h.duplicate': 'Duplizieren', 'h.undo': 'Rückgängig', 'h.redo': 'Wiederholen',
  },
});

// ---- state ------------------------------------------------------------------------------------------------

const first = newRequest({ name: 'Example', url: 'https://example.org/' });
const state = {
  collection: { name: '', items: [first], variables: [] }, file: null, dirty: false,
  current: first, tab: 'params', response: null, responseTab: 'body', bodyView: 'pretty', sending: false, history: [],
  via: null, insecure: false, followRedirects: true, dialog: null, panels: false,
};
state.collection.name = t('h.untitled');
const data = Suite.appdata.create(APP, { onChange: () => render() });

let queued = false;
function render() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; Suite.shell.refresh(); });
}
const fail = (e) => { console.warn(e); Suite.shell.toast(Suite.i18n.describe(e), 'error'); };

// Undo of collection changes: after every change the snapshot taken after the previous change goes to the history.
// Typing into the same field within a second is one step.
const history = new Suite.UndoHistory({ clone: (snap) => snap, onChange: () => render() });
let baseline = structuredClone(state.collection);
let inputTarget = null; // the element of the input event that caused the change (not the focus: Firefox does not focus selects)
document.addEventListener('input', (e) => { inputTarget = e.target; }, true);
const typingKey = () => {
  const el = inputTarget;
  inputTarget = null;
  if (!el || !(el.isContentEditable || el.closest('.cm-content') || (el.tagName === 'INPUT' && /^(text|search|url|password|)$/.test(el.type)) || el.tagName === 'TEXTAREA')) return null;
  return `typing:${state.current.id}:${el.closest('[data-testid]')?.dataset.testid || el.tagName}`;
};
// recovery copies of unsaved work (shared/js/autosave.js)
Suite.autosave.register({
  app: APP,
  save: () => (state.dirty ? { name: state.file ? state.file.name : state.collection.name, file: state.file, collection: toPostman(state.collection) } : null),
  restore: (s) => {
    state.collection = fromPostman(JSON.stringify(s.collection));
    state.file = s.file || null;
    const first = (function find(items) { for (const it of items) { if (it.type === 'folder') { const r = find(it.items); if (r) return r; } else return it; } return null; }(state.collection.items));
    if (first) select(first);
    resetHistory();
    state.dirty = true;
    Suite.shell.setDirty(true);
    render();
  },
});

function resetHistory() { history.clear(); baseline = structuredClone(state.collection); }
function changed() {
  history.record(baseline, typingKey());
  baseline = structuredClone(state.collection);
  state.dirty = true;
  Suite.shell.setDirty(true);
  render();
}
function undoStep(redo) {
  const snap = redo ? history.redo(structuredClone(state.collection)) : history.undo(structuredClone(state.collection));
  if (!snap) return;
  state.collection = snap;
  baseline = structuredClone(snap);
  const all = [];
  const walk = (items) => items.forEach((x) => (x.type === 'folder' ? walk(x.items) : all.push(x)));
  walk(snap.items);
  const req = all.find((r) => r.id === state.current.id) || all[0];
  if (req) { state.current = req; bodyEditor.setText(req.body.raw || ''); bodyEditor.setLang(req.body.language); }
  state.dirty = true;
  Suite.shell.setDirty(true);
  render();
}
const fmtSize = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KiB` : `${(n / 1048576).toFixed(1)} MiB`);

const settings = () => ({ environments: [], activeEnv: null, ...(data.settings || {}) });
const environment = () => settings().environments.find((e) => e.id === settings().activeEnv) || null;
const via = () => state.via || (data.relayConfigured() ? 'relay' : 'direct');

// ---- editors (CodeMirror) -----------------------------------------------------------------------------------

const dark = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
const LANGS = { json: () => json(), xml: () => xml(), html: () => htmlLang(), javascript: () => javascript(), text: () => [] };

function makeEditor(readOnly, onChange) {
  const lang = new Compartment();
  const theme = new Compartment();
  const view = new EditorView({
    doc: '',
    extensions: [basicSetup, lang.of([]), theme.of(dark() ? oneDark : []), EditorState.readOnly.of(readOnly), EditorView.lineWrapping,
      EditorView.updateListener.of((u) => { if (u.docChanged && onChange && !view.silent) onChange(u.state.doc.toString()); })],
  });
  view.setLang = (name) => view.dispatch({ effects: lang.reconfigure((LANGS[name] || LANGS.text)()) });
  view.setTheme = () => view.dispatch({ effects: theme.reconfigure(dark() ? oneDark : []) });
  view.setText = (text) => { if (view.state.doc.toString() === text) return; view.silent = true; view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }); view.silent = false; };
  return view;
}
const bodyEditor = makeEditor(false, (text) => { state.current.body.raw = text; changed(); });
bodyEditor.dom.dataset.testid = 'body-editor';
const preEditor = makeEditor(false, (text) => { state.current.prerequest = text; changed(); });
preEditor.dom.dataset.testid = 'prerequest-editor';
preEditor.setLang('javascript');
const testEditor = makeEditor(false, (text) => { state.current.tests = text; changed(); });
testEditor.dom.dataset.testid = 'tests-editor';
testEditor.setLang('javascript');
const responseEditor = makeEditor(true);
responseEditor.dom.dataset.testid = 'response-body';
new MutationObserver(() => { bodyEditor.setTheme(); responseEditor.setTheme(); preEditor.setTheme(); testEditor.setTheme(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

function mountEditor(view) {
  return (el) => { if (el && view.dom.parentElement !== el) el.replaceChildren(view.dom); };
}

// ---- collection tree ---------------------------------------------------------------------------------------

function findParent(items, item) {
  for (const it of items) {
    if (it === item) return items;
    if (it.type === 'folder') { const p = findParent(it.items, item); if (p) return p; }
  }
  return null;
}

function select(req) {
  state.current = req;
  state.response = null;
  bodyEditor.setText(req.body.raw || '');
  bodyEditor.setLang(req.body.language);
  preEditor.setText(req.prerequest || '');
  testEditor.setText(req.tests || '');
  state.scriptRun = null;
  state.panels = false;
  render();
}

function addRequest(folder = null) {
  const req = newRequest();
  (folder ? folder.items : state.collection.items).push(req);
  select(req);
  changed();
}

function addFolder() {
  state.dialog = { kind: 'name', title: t('h.newFolder'), value: t('h.newFolder'), run: (name) => { state.collection.items.push({ type: 'folder', id: newId(), name, items: [] }); changed(); } };
  render();
}

async function removeItem(item) {
  if (!(await Suite.shell.confirm(t('h.deleteConfirm', item.name)))) return;
  const list = findParent(state.collection.items, item);
  list.splice(list.indexOf(item), 1);
  if (state.current === item || (item.type === 'folder' && JSON.stringify(item).includes(state.current.id))) {
    const any = [];
    const walk = (items) => items.forEach((x) => (x.type === 'folder' ? walk(x.items) : any.push(x)));
    walk(state.collection.items);
    if (any.length) select(any[0]); else addRequest();
  }
  changed();
}

function renameItem(item) {
  state.dialog = { kind: 'name', title: t('h.newName'), value: item.name, run: (name) => { item.name = name; changed(); } };
  render();
}

function duplicate(item) {
  const copy = { ...structuredClone({ ...item, body: { ...item.body, file: null, fields: item.body.fields.map((f) => ({ ...f, file: null })) } }), id: newId(), name: `${item.name} (2)` };
  const list = findParent(state.collection.items, item);
  list.splice(list.indexOf(item) + 1, 0, copy);
  select(copy);
  changed();
}

// ---- files --------------------------------------------------------------------------------------------------

const countRequests = (items) => items.reduce((n, it) => n + (it.type === 'folder' ? countRequests(it.items) : 1), 0);

async function openCollection() {
  if (state.dirty && !(await Suite.shell.confirm(t('h.discard')))) return;
  const picked = await Suite.files.open({ types: COLLECTION_TYPES }).catch(fail);
  if (!picked) return;
  try {
    const text = await picked[0].file.text();
    // OpenAPI/Swagger descriptions become a new collection (saved as a Postman collection next to them)
    const openapi = /^\s*(\{[\s\S]*"(openapi|swagger)"\s*:|(openapi|swagger)\s*:)/m.test(text) || /\.ya?ml$/i.test(picked[0].file.name);
    const collection = openapi ? fromOpenApi(text) : fromPostman(text);
    state.collection = collection;
    state.file = openapi ? { name: `${collection.name.replace(/[\\/:*?"<>|]+/g, '_')}.postman_collection.json`, handle: null } : { name: picked[0].file.name, handle: picked[0].handle };
    state.dirty = false;
    Suite.shell.setDirty(false);
    const firstReq = (function find(items) { for (const it of items) { if (it.type === 'folder') { const r = find(it.items); if (r) return r; } else return it; } return null; }(collection.items));
    if (firstReq) select(firstReq); else addRequest();
    resetHistory();
    if (openapi) Suite.shell.toast(t('h.openapiImported', countRequests(collection.items)));
  } catch (e) { fail(e); }
}

async function saveCollection(as = false) {
  try {
    const bytes = new TextEncoder().encode(`${JSON.stringify(toPostman(state.collection), null, 2)}\n`);
    const name = (state.file && state.file.name) || `${state.collection.name.replace(/[\\/:*?"<>|]/g, '_')}.postman_collection.json`;
    const result = as || !state.file ? await Suite.files.saveAs(bytes, { suggestedName: name, types: COLLECTION_TYPES, type: 'application/json' })
      : await Suite.files.save({ name, handle: state.file.handle }, bytes, { type: 'application/json' });
    if (!result) return;
    if (result.mode === 'downloaded') Suite.shell.banner(result.message); else Suite.shell.toast(result.message);
    state.file = { name: result.name || name, handle: result.handle || (state.file && state.file.handle) };
    state.dirty = false;
    Suite.shell.setDirty(false);
    render();
  } catch (e) { fail(e); }
}

// ---- sending ---------------------------------------------------------------------------------------------------

function vars() {
  const env = environment();
  return variableMap(state.collection.variables, env && env.variables);
}

const toObject = (list) => Object.fromEntries((list || []).filter((v) => v.enabled !== false && v.key).map((v) => [v.key, v.value ?? '']));

/** Write variables changed by a script back into the environment and the collection. */
function applyVariables(result, before) {
  const merge = (list, after, previous) => {
    const out = (list || []).filter((v) => !(v.key in previous) || v.key in after);
    for (const [key, value] of Object.entries(after)) {
      const row = out.find((v) => v.key === key);
      if (row) { if (previous[key] !== value) Object.assign(row, { value, enabled: true }); } else out.push({ key, value, enabled: true });
    }
    return out;
  };
  const env = environment();
  if (env && JSON.stringify(result.environment) !== JSON.stringify(before.environment)) {
    const s = settings();
    data.settings = { ...s, environments: s.environments.map((e) => (e.id === env.id ? { ...e, variables: merge(e.variables, result.environment, before.environment) } : e)) };
  }
  if (JSON.stringify(result.collection) !== JSON.stringify(before.collection)) {
    state.collection.variables = merge(state.collection.variables, result.collection, before.collection);
    changed();
  }
}

async function runRequestScript(kind, req, request, response = null, variables = {}) {
  const env = environment();
  const context = { kind, name: req.name, request, response, environment: toObject(env && env.variables), collection: toObject(state.collection.variables), variables };
  const result = await runScript(kind === 'prerequest' ? req.prerequest : req.tests, context);
  applyVariables(result, context);
  return result;
}

// ---- WebSocket ------------------------------------------------------------------------------------------

const isWs = (url) => /^wss?:\/\//i.test(resolveUrl(url));
const resolveUrl = (url) => String(url || '').replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, k) => (vars().has(k) ? vars().get(k) : m)).trim();
let ws = null; // { socket, request, status: 'connecting' | 'open' | 'closed', protocol, messages: [{ dir: 'in' | 'out' | 'info', text, size, binary, time }], draft }

function wsLog(entry) {
  ws.messages.push({ time: new Date(), ...entry });
  if (ws.messages.length > 2000) ws.messages.splice(0, ws.messages.length - 2000);
  render();
  requestAnimationFrame(() => { const el = document.querySelector('[data-testid=ws-log]'); if (el) el.scrollTop = el.scrollHeight; });
}

function wsConnect() {
  const req = state.current;
  if (ws && ws.socket && ws.status !== 'closed') { ws.socket.close(1000); return; }
  const url = resolveUrl(req.url);
  const header = req.headers.find((h) => h.enabled && /^sec-websocket-protocol$/i.test(h.key));
  const protocols = header ? resolveUrl(header.value).split(',').map((x) => x.trim()).filter(Boolean) : [];
  const draft = ws && ws.request === req ? ws.draft : '';
  ws = { request: req, status: 'connecting', messages: ws && ws.request === req ? ws.messages : [], draft, protocol: '' };
  let socket;
  try { socket = new WebSocket(url, protocols); } catch (e) { ws.status = 'closed'; wsLog({ dir: 'info', text: e.message }); return; }
  socket.binaryType = 'arraybuffer';
  ws.socket = socket;
  wsLog({ dir: 'info', text: `${t('h.wsConnecting')} ${url}` });
  socket.onopen = () => { ws.status = 'open'; ws.protocol = socket.protocol; wsLog({ dir: 'info', text: t('h.wsOpen', socket.protocol ? ` (${socket.protocol})` : '') }); };
  socket.onmessage = (e) => {
    if (typeof e.data === 'string') wsLog({ dir: 'in', text: e.data, size: new TextEncoder().encode(e.data).length });
    else { const bytes = new Uint8Array(e.data); wsLog({ dir: 'in', binary: true, size: bytes.length, text: Array.from(bytes.slice(0, 64), (b) => b.toString(16).padStart(2, '0')).join(' ') + (bytes.length > 64 ? ' …' : '') }); }
  };
  socket.onerror = () => { if (ws.status === 'connecting') wsLog({ dir: 'info', text: t('h.wsError') }); };
  socket.onclose = (e) => { if (ws.socket !== socket) return; ws.status = 'closed'; wsLog({ dir: 'info', text: t('h.wsClosed', e.code, e.reason ? `: ${e.reason}` : '') }); };
}

function wsSend() {
  if (!ws || ws.status !== 'open' || !ws.draft) return;
  const text = resolveUrl(ws.draft) === ws.draft ? ws.draft : String(ws.draft).replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, k) => (vars().has(k) ? vars().get(k) : m));
  ws.socket.send(text);
  wsLog({ dir: 'out', text, size: new TextEncoder().encode(text).length });
}

function WsPanel() {
  const w = ws && ws.request === state.current ? ws : null;
  const fmt = (d) => d.toLocaleTimeString(Suite.i18n.language === 'de' ? 'de-AT' : 'en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return html`<section class="h-response h-ws" data-testid="ws">
    <p class="h-ws-note"><small>${t('h.wsDirect')}</small></p>
    <ol class="h-ws-log" data-testid="ws-log">${w && w.messages.length ? w.messages.map((m) => html`<li class=${`h-ws-${m.dir}`} data-testid="ws-message" data-dir=${m.dir}>
      <span class="h-ws-meta">${m.dir === 'in' ? '↓' : m.dir === 'out' ? '↑' : '•'} ${fmt(m.time)}${m.binary ? ` · ${t('h.wsBinary', fmtSize(m.size))}` : ''}</span>
      <code>${m.text}</code></li>`) : html`<li class="h-empty">${t('h.wsEmpty')}</li>`}</ol>
    <div class="h-ws-compose">
      <textarea rows="3" data-testid="ws-input" placeholder=${t('h.wsMessage')} disabled=${!w || w.status !== 'open'} value=${w ? w.draft : ''}
        onInput=${(e) => { if (ws) ws.draft = e.target.value; }} onKeyDown=${(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); wsSend(); } }}></textarea>
      <div><button data-testid="ws-send" disabled=${!w || w.status !== 'open'} onClick=${wsSend}>${t('h.wsSend')}</button>
        <button class="secondary outline" data-testid="ws-clear" disabled=${!w || !w.messages.length} onClick=${() => { w.messages = []; render(); }}>${t('h.wsClear')}</button></div>
    </div>
  </section>`;
}

async function send() {
  const req = state.current;
  if (isWs(req.url)) { wsConnect(); return; }
  if (!req.url.trim() || state.sending) return;
  state.sending = true;
  state.response = null;
  state.scriptRun = null;
  render();
  let built;
  const run = { logs: [], tests: [], error: null };
  try {
    let effective = req;
    let local = {};
    if ((req.prerequest || '').trim()) {
      const pre = await runRequestScript('prerequest', req, { method: req.method, url: req.url, headers: req.headers.filter((h) => h.enabled && h.key).map((h) => [h.key, h.value]), body: req.body.mode === 'raw' ? req.body.raw : '' });
      run.logs.push(...pre.logs);
      if (pre.error) throw new Error(t('h.scriptError', pre.error));
      local = pre.variables;
      effective = { ...req, method: pre.request.method, url: pre.request.url, headers: pre.request.headers.map(([key, value]) => ({ key, value, enabled: true })) };
    }
    built = await build(effective, new Map([...vars(), ...Object.entries(local)]));
    let response;
    if (via() === 'relay') {
      const r = data.relay;
      if (!data.relayConfigured()) throw new Error(t('h.relayMissing'));
      response = await Suite.relay.http(data.relayConfig(), { method: built.method, url: built.url, headers: built.headers, body: built.body || undefined, insecure: state.insecure, followRedirects: state.followRedirects, timeout: 60 });
    } else {
      const t0 = performance.now();
      let res;
      try {
        res = await fetch(built.url, { method: built.method, headers: built.headers, body: built.body || undefined, redirect: state.followRedirects ? 'follow' : 'manual', credentials: 'omit' });
      } catch (e) { throw new Error(t('h.corsError')); }
      const body = new Uint8Array(await res.arrayBuffer());
      response = { status: res.status, reason: res.statusText, url: res.url, headers: [...res.headers.entries()], body, timeMs: Math.round(performance.now() - t0), direct: true };
    }
    state.response = response;
    showResponse(response);
    if ((req.tests || '').trim()) {
      const text = bodyText(response) ?? '';
      let sentBody = '';
      try { sentBody = built.body ? new TextDecoder('utf-8', { fatal: true }).decode(built.body) : ''; } catch (e) { sentBody = ''; }
      const after = await runRequestScript('test', req, { method: built.method, url: built.url, headers: built.headers, body: sentBody },
        { code: response.status, status: response.reason || '', headers: response.headers, body: text, responseTime: response.timeMs }, local);
      run.logs.push(...after.logs);
      run.tests = after.tests;
      run.error = after.error;
    }
    state.history.unshift({ id: newId(), method: built.method, url: built.url, status: response.status, time: new Date(), request: structuredClone({ ...req, body: { ...req.body, file: null, fields: req.body.fields.map((f) => ({ ...f, file: null })) } }) });
    state.history = state.history.slice(0, 50);
  } catch (e) {
    state.response = { error: e.message };
  } finally {
    state.scriptRun = run.logs.length || run.tests.length || run.error ? run : null;
    if (state.scriptRun && (run.tests.length || run.error) && state.response && !state.response.error) state.responseTab = 'tests';
    state.sending = false;
    render();
  }
}

const header = (res, name) => ((res.headers || []).find(([k]) => k.toLowerCase() === name) || [])[1] || '';

function bodyText(res) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(res.body); } catch (e) { return null; }
}

function languageOf(res) {
  const ct = header(res, 'content-type');
  if (/json/i.test(ct)) return 'json';
  if (/html/i.test(ct)) return 'html';
  if (/xml/i.test(ct)) return 'xml';
  if (/javascript/i.test(ct)) return 'javascript';
  return 'text';
}

function showResponse(res) {
  const text = bodyText(res);
  const lang = languageOf(res);
  let shown = text ?? '';
  if (text !== null && state.bodyView === 'pretty' && lang === 'json') { try { shown = JSON.stringify(JSON.parse(text), null, 2); } catch (e) { /* not valid JSON */ } }
  responseEditor.setLang(state.bodyView === 'pretty' ? lang : 'text');
  responseEditor.setText(shown);
}

function saveBody() {
  const res = state.response;
  const ct = header(res, 'content-type').split(';')[0];
  const ext = { 'application/json': 'json', 'text/html': 'html', 'application/xml': 'xml', 'text/xml': 'xml', 'text/plain': 'txt', 'image/png': 'png', 'image/jpeg': 'jpg', 'application/pdf': 'pdf' }[ct] || 'bin';
  let name = 'response';
  try { name = decodeURIComponent(new URL(res.url).pathname.split('/').pop()) || name; } catch (e) { /* keep */ }
  Suite.files.download(res.body, /\.\w+$/.test(name) ? name : `${name}.${ext}`, ct || 'application/octet-stream');
}

// ---- UI: rows editor ---------------------------------------------------------------------------------------------

function Rows({ rows, onChange, testid, files = false }) {
  const update = (fn) => { fn(); onChange(); };
  const list = [...rows, null]; // the last empty row adds a new one
  // typing into the empty row creates a row; further input before the next render goes to that row, not a new one
  const created = (e) => { const tr = e.target.closest('tr'); if (!tr._row) { tr._row = { key: '', value: '', enabled: true, type: 'text' }; rows.push(tr._row); } return tr._row; };
  return html`<table class="h-rows" data-testid=${testid}>
    <thead><tr><th></th><th>${t('h.key')}</th><th>${t('h.value')}</th><th></th></tr></thead>
    <tbody>${list.map((r, i) => html`<tr key=${i} data-testid="row">
      <td>${r ? html`<input type="checkbox" checked=${r.enabled} onChange=${(e) => update(() => { r.enabled = e.target.checked; })} />` : null}</td>
      <td><input data-testid="row-key" placeholder=${t('h.key')} value=${r ? r.key : ''} onInput=${(e) => update(() => { (r || created(e)).key = e.target.value; })} /></td>
      <td class="h-value">${r && files && r.type === 'file'
        ? html`<label class="h-file" role="button">${r.file ? r.file.name : r.value || t('h.chooseFile')}<input type="file" hidden onChange=${(e) => update(() => { r.file = e.target.files[0] || null; r.value = r.file ? r.file.name : ''; })} /></label>`
        : html`<input data-testid="row-value" placeholder=${t('h.value')} value=${r ? r.value : ''} onInput=${(e) => update(() => { (r || created(e)).value = e.target.value; })} />`}
        ${r && files ? html`<select class="h-type" onChange=${(e) => update(() => { r.type = e.target.value; })}><option value="text" selected=${r.type !== 'file'}>text</option><option value="file" selected=${r.type === 'file'}>${t('h.file')}</option></select>` : null}</td>
      <td>${r ? html`<button class="secondary outline" data-testid="row-delete" onClick=${() => update(() => rows.splice(i, 1))}>×</button>` : null}</td>
    </tr>`)}</tbody>
  </table>`;
}

// ---- UI: request ---------------------------------------------------------------------------------------------------

function RequestEditor() {
  const req = state.current;
  const params = paramsOf(req.url);
  const setParams = () => { req.url = withParams(req.url, params); changed(); };
  const b = req.body;
  const scripted = ((req.prerequest || '').trim() ? 1 : 0) + ((req.tests || '').trim() ? 1 : 0);
  const tabs = [['params', `${t('h.params')}${params.length ? ` (${params.length})` : ''}`], ['headers', `${t('h.headers')}${req.headers.length ? ` (${req.headers.length})` : ''}`], ['body', t('h.body')], ['auth', t('h.auth')],
    ['scripts', `${t('h.scripts')}${scripted ? ` (${scripted})` : ''}`]];
  return html`<section class="h-request" data-testid="request">
    <form class="h-urlbar" onSubmit=${(e) => { e.preventDefault(); send(); }}>
      <select class="h-method" data-testid="method" aria-label=${t('h.method')} onChange=${(e) => { req.method = e.target.value; changed(); }}>${METHODS.map((m) => html`<option value=${m} selected=${req.method === m}>${m}</option>`)}</select>
      <input class="h-url" data-testid="url" placeholder="https://api.example.org/items?page=1" value=${req.url} spellcheck="false" onInput=${(e) => { req.url = e.target.value; changed(); }} />
      <button type="submit" data-testid="send" aria-busy=${state.sending || (isWs(req.url) && ws && ws.request === req && ws.status === 'connecting')}>${isWs(req.url) ? (ws && ws.request === req && ws.status !== 'closed' ? t('h.disconnect') : t('h.connect')) : t('h.send')}</button>
    </form>
    <div class="h-tabs-row"><div class="h-tabs" role="tablist">${tabs.map(([id, label]) => html`<button role="tab" aria-selected=${state.tab === id ? 'true' : 'false'} class=${state.tab === id ? '' : 'secondary outline'} data-testid=${`tab-${id}`} onClick=${() => { state.tab = id; render(); }}>${label}</button>`)}</div>
    <div class="h-tabs-extra"><button class="secondary outline" data-testid="show-curl" onClick=${async () => { try { state.dialog = { kind: 'curl-out', text: toCurl(await build(req, vars())) }; render(); } catch (e) { fail(e); } }}>${t('h.code')}</button></div></div>
    <div class="h-tab-body">
      ${state.tab === 'params' ? html`<${Rows} rows=${params} testid="params" onChange=${setParams} />` : null}
      ${state.tab === 'headers' ? html`<${Rows} rows=${req.headers} testid="headers" onChange=${changed} />` : null}
      ${state.tab === 'body' ? html`<div class="h-body">
        <div class="h-body-modes">${['none', 'raw', 'urlencoded', 'formdata', 'file'].map((m) => html`<label><input type="radio" name="bodymode" checked=${b.mode === m} data-testid=${`body-${m}`} onChange=${() => { b.mode = m; changed(); }} /> ${t(`h.${m}`)}</label>`)}
          ${b.mode === 'raw' ? html`<select data-testid="body-language" onChange=${(e) => { b.language = e.target.value; bodyEditor.setLang(b.language); changed(); }}>${['json', 'xml', 'text', 'html', 'javascript'].map((l) => html`<option value=${l} selected=${b.language === l}>${l}</option>`)}</select>` : null}</div>
        ${b.mode === 'raw' ? null : b.mode === 'urlencoded' || b.mode === 'formdata' ? html`<${Rows} rows=${b.fields} testid="fields" files=${b.mode === 'formdata'} onChange=${changed} />`
          : b.mode === 'file' ? html`<label class="h-file" role="button">${b.file ? `${b.file.name} (${fmtSize(b.file.size)})` : t('h.chooseFile')}<input type="file" hidden data-testid="body-file" onChange=${(e) => { b.file = e.target.files[0] || null; changed(); }} /></label>` : null}
        <div class="h-editor" hidden=${b.mode !== 'raw'} ref=${mountEditor(bodyEditor)}></div>
      </div>` : null}
      ${state.tab === 'scripts' ? html`<div class="h-scripts">
        <small>${t('h.scriptHint')}</small>
        <strong>${t('h.prerequest')}</strong><div class="h-editor h-script-editor" ref=${mountEditor(preEditor)}></div>
        <strong>${t('h.testsScript')}</strong><div class="h-editor h-script-editor" ref=${mountEditor(testEditor)}></div>
      </div>` : null}
      ${state.tab === 'auth' ? html`<div class="h-auth">
        <select data-testid="auth-type" onChange=${(e) => { req.auth.type = e.target.value; changed(); }}>
          ${[['none', 'h.authNone'], ['basic', 'h.basic'], ['bearer', 'h.bearer']].map(([v, l]) => html`<option value=${v} selected=${req.auth.type === v}>${t(l)}</option>`)}</select>
        ${req.auth.type === 'basic' ? html`<label>${t('h.user')}<input data-testid="auth-user" value=${req.auth.username} onInput=${(e) => { req.auth.username = e.target.value; changed(); }} /></label>
          <label>${t('h.password')}<input type="password" data-testid="auth-password" value=${req.auth.password} onInput=${(e) => { req.auth.password = e.target.value; changed(); }} /></label>` : null}
        ${req.auth.type === 'bearer' ? html`<label>${t('h.token')}<input data-testid="auth-token" value=${req.auth.token} onInput=${(e) => { req.auth.token = e.target.value; changed(); }} /></label>` : null}
      </div>` : null}
    </div>
  </section>`;
}

// ---- UI: response ---------------------------------------------------------------------------------------------------

function statusClass(s) { return s >= 500 ? 'err' : s >= 400 ? 'warn' : s >= 300 ? 'redir' : 'ok'; }

function testsLabel() {
  const r = state.scriptRun;
  const passed = r.tests.filter((x) => x.passed).length;
  return `${t('h.tests')}${r.tests.length ? ` (${passed}/${r.tests.length})` : ''}${r.error ? ' ⚠' : ''}`;
}

function TestResults({ run }) {
  const passed = run.tests.filter((x) => x.passed).length;
  return html`<div class="h-tests" data-testid="test-results">
    ${run.error ? html`<p class="h-error" data-testid="script-error">${t('h.scriptError', run.error)}</p>` : null}
    ${run.tests.length ? html`<p data-testid="tests-summary" class=${passed === run.tests.length ? 'h-pass' : 'h-fail'}>${t('h.passed', passed, run.tests.length)}</p>` : null}
    <ul>${run.tests.map((x) => html`<li data-testid="test-result" class=${x.passed ? 'h-pass' : 'h-fail'}>${x.passed ? '✓' : '✗'} ${x.name}${x.error ? html`<br /><small>${x.error}</small>` : null}</li>`)}</ul>
    ${run.logs.length ? html`<strong>${t('h.console')}</strong><pre class="h-console" data-testid="script-console">${run.logs.map((l) => `${l.level === 'log' ? '' : `[${l.level}] `}${l.text}`).join('\n')}</pre>` : null}
  </div>`;
}

function Response() {
  const res = state.response;
  if (!res) return html`<section class="h-response"><p class="h-empty" data-testid="no-response">${state.sending ? t('h.sending') : t('h.noResponse')}</p></section>`;
  if (res.error) return html`<section class="h-response"><p class="h-error" data-testid="response-error">${res.error}</p></section>`;
  const text = bodyText(res);
  const ct = header(res, 'content-type');
  const image = /^image\//i.test(ct);
  return html`<section class="h-response" data-testid="response">
    <div class="h-status">
      <span class=${`h-code ${statusClass(res.status)}`} data-testid="status">${res.status} ${res.reason || ''}</span>
      <span data-testid="time">${t('h.time', res.timeMs)}</span>
      <span data-testid="size">${fmtSize(res.body.length)}</span>
      <button class="secondary outline" data-testid="save-body" onClick=${saveBody}>${t('h.saveBody')}</button>
    </div>
    <div class="h-tabs" role="tablist">${[['body', t('h.body')], ['headers', `${t('h.headers')} (${res.headers.length})`], ...(state.scriptRun ? [['tests', testsLabel()]] : [])].map(([id, label]) => html`<button role="tab" aria-selected=${state.responseTab === id ? 'true' : 'false'} class=${state.responseTab === id ? '' : 'secondary outline'} data-testid=${`rtab-${id}`} onClick=${() => { state.responseTab = id; render(); }}>${label}</button>`)}
      ${state.responseTab === 'body' ? html`<span class="h-views">${['pretty', 'raw', 'preview'].map((v) => html`<label><input type="radio" name="bodyview" checked=${state.bodyView === v} data-testid=${`view-${v}`} onChange=${() => { state.bodyView = v; showResponse(res); render(); }} /> ${t(`h.${v}`)}</label>`)}</span>` : null}</div>
    ${state.responseTab === 'tests' && state.scriptRun ? html`<${TestResults} run=${state.scriptRun} />` : null}
    ${state.responseTab === 'headers' ? html`<table class="h-headers" data-testid="response-headers">${res.headers.map(([k, v]) => html`<tr><th>${k}</th><td>${v}</td></tr>`)}</table>` : null}
    ${state.responseTab === 'body' && state.bodyView === 'preview' ? (image ? html`<img class="h-preview-img" data-testid="preview-image" src=${URL.createObjectURL(new Blob([res.body], { type: ct }))} alt="" />`
      : /html/i.test(ct) && text !== null ? html`<iframe class="h-preview" sandbox="" data-testid="preview-frame" srcdoc=${text}></iframe>` : html`<pre class="h-preview-text">${text ?? t('h.binary', fmtSize(res.body.length))}</pre>`) : null}
    <div class="h-editor h-response-editor" hidden=${state.responseTab !== 'body' || state.bodyView === 'preview' || text === null} ref=${mountEditor(responseEditor)}></div>
    ${state.responseTab === 'body' && state.bodyView !== 'preview' && text === null ? html`<p class="h-empty">${t('h.binary', fmtSize(res.body.length))}</p>` : null}
  </section>`;
}

// ---- UI: sidebar ---------------------------------------------------------------------------------------------------

function Tree({ items, depth = 0 }) {
  return html`<ul class="h-tree">${items.map((it) => (it.type === 'folder'
    ? html`<li key=${it.id}><details open><summary data-testid="folder"><span>📁 ${it.name}</span>
        <span class="h-tree-actions"><button class="secondary outline" title=${t('h.newRequest')} onClick=${(e) => { e.preventDefault(); addRequest(it); }}>+</button>
        <button class="secondary outline" title=${t('h.rename')} onClick=${(e) => { e.preventDefault(); renameItem(it); }}>✎</button>
        <button class="secondary outline" title=${t('h.delete')} onClick=${(e) => { e.preventDefault(); removeItem(it); }}>×</button></span></summary>
        <${Tree} items=${it.items} depth=${depth + 1} /></details></li>`
    : html`<li key=${it.id} class=${state.current === it ? 'active' : ''} data-testid="tree-request">
        <a href="#" onClick=${(e) => { e.preventDefault(); select(it); }}><b class=${`h-m h-m-${it.method}`}>${it.method}</b> ${it.name}</a>
        <span class="h-tree-actions"><button class="secondary outline" title=${t('h.duplicate')} onClick=${() => duplicate(it)}>⧉</button>
        <button class="secondary outline" title=${t('h.rename')} data-testid="rename-request" onClick=${() => renameItem(it)}>✎</button>
        <button class="secondary outline" title=${t('h.delete')} data-testid="delete-request" onClick=${() => removeItem(it)}>×</button></span></li>`))}</ul>`;
}

function Sidebar() {
  return html`<aside class=${`h-side suite-drawer ${state.panels ? 'open' : ''}`} data-testid="sidebar">
    <div class="h-side-head"><strong data-testid="collection-name">${state.collection.name}${state.dirty ? ' •' : ''}</strong></div>
    <div class="h-side-buttons">
      <button class="secondary outline" data-testid="new-request" onClick=${() => addRequest()}>+ ${t('h.newRequest')}</button>
      <button class="secondary outline" data-testid="new-folder" onClick=${addFolder}>+ ${t('h.newFolder')}</button>
    </div>
    <${Tree} items=${state.collection.items} />
    <details class="h-history"><summary>${t('h.history')} (${state.history.length})</summary>
      <ul data-testid="history">${state.history.map((h) => html`<li data-testid="history-item"><a href="#" onClick=${(e) => {
        e.preventDefault();
        const req = newRequest({ ...structuredClone(h.request), id: newId(), name: `${h.method} ${h.url}` });
        state.collection.items.push(req);
        select(req);
        changed();
      }}><b class=${`h-code ${statusClass(h.status)}`}>${h.status}</b> ${h.method} ${h.url}</a></li>`)}</ul></details>
    <${data.Bar} />
  </aside>`;
}

function Toolbar() {
  const s = settings();
  return html`<nav class="h-toolbar" role="toolbar">
    <button class="secondary outline h-only-phone" data-testid="toggle-panels" onClick=${() => { state.panels = !state.panels; render(); }}>☰</button>
    <button class="secondary" data-testid="open" onClick=${openCollection}>${t('h.open')}</button>
    <button class=${state.dirty ? '' : 'secondary outline'} data-testid="save" onClick=${() => saveCollection()}>${t('h.save')}</button>
    <button class="secondary outline" title="${t('h.undo')} (Ctrl+Z)" data-testid="undo" disabled=${!history.canUndo} onClick=${() => undoStep(false)}>↶</button>
    <button class="secondary outline" title="${t('h.redo')} (Ctrl+Y)" data-testid="redo" disabled=${!history.canRedo} onClick=${() => undoStep(true)}>↷</button>
    <button class="secondary outline" data-testid="import-curl" onClick=${() => { state.dialog = { kind: 'curl-in', text: '' }; render(); }}>${t('h.importCurl')}</button>
    <span class="h-sep"></span>
    <label class="h-inline">${t('h.environment')}<select data-testid="environment" onChange=${(e) => { data.settings = { ...s, activeEnv: e.target.value || null }; }}>
      <option value="">${t('h.noEnvironment')}</option>${s.environments.map((env) => html`<option value=${env.id} selected=${s.activeEnv === env.id}>${env.name}</option>`)}</select></label>
    <button class="secondary outline" data-testid="manage-environments" onClick=${() => { state.dialog = { kind: 'env' }; render(); }}>${t('h.environments')}</button>
    <label class="h-inline">${t('h.via')}<select data-testid="via" onChange=${(e) => { state.via = e.target.value; render(); }}>
      <option value="relay" selected=${via() === 'relay'}>${t('h.viaRelay')}</option><option value="direct" selected=${via() === 'direct'}>${t('h.viaDirect')}</option></select></label>
  </nav>`;
}

// ---- dialogs ----------------------------------------------------------------------------------------------------------

function Dialog() {
  const d = state.dialog;
  if (!d) return null;
  const close = () => { state.dialog = null; render(); };
  if (d.kind === 'name') {
    return html`<dialog open data-testid="name-dialog"><article><form onSubmit=${(e) => { e.preventDefault(); const v = e.target.elements.name.value.trim(); close(); if (v) d.run(v); }}>
      <label>${d.title}<input name="name" data-testid="name-input" defaultValue=${d.value} autofocus /></label>
      <footer><button type="button" class="secondary" onClick=${close}>${t('h.cancel')}</button><button type="submit" data-testid="name-ok">${t('h.ok')}</button></footer></form></article></dialog>`;
  }
  if (d.kind === 'curl-in') {
    return html`<dialog open data-testid="curl-dialog"><article class="h-dialog"><header><strong>${t('h.curlTitle')}</strong></header>
      <textarea rows="8" data-testid="curl-input" spellcheck="false" placeholder="curl 'https://…' -H 'Accept: application/json'" onInput=${(e) => { d.text = e.target.value; }}></textarea>
      <footer><button class="secondary" onClick=${close}>${t('h.cancel')}</button><button data-testid="curl-import" onClick=${() => {
        try { const req = fromCurl(d.text); state.collection.items.push(req); close(); select(req); changed(); } catch (e) { fail(e); }
      }}>${t('h.import')}</button></footer></article></dialog>`;
  }
  if (d.kind === 'curl-out') {
    return html`<dialog open data-testid="curl-out-dialog"><article class="h-dialog"><header><strong>cURL</strong></header>
      <pre class="h-curl" data-testid="curl-output">${d.text}</pre>
      <footer><button class="secondary" onClick=${close}>${t('h.close')}</button><button data-testid="curl-copy" onClick=${() => navigator.clipboard.writeText(d.text).then(() => Suite.shell.toast(t('h.copied')), fail)}>${t('h.copy')}</button></footer></article></dialog>`;
  }
  // environments
  const s = settings();
  const save = () => { data.settings = { ...s, environments: s.environments }; };
  return html`<dialog open data-testid="env-dialog"><article class="h-dialog"><header><strong>${t('h.envTitle')}</strong></header>
    ${s.environments.map((env) => html`<fieldset class="h-env" data-testid="env">
      <div class="h-env-head"><input data-testid="env-name" value=${env.name} onChange=${(e) => { env.name = e.target.value; save(); }} />
        <button class="secondary outline" onClick=${() => { s.environments.splice(s.environments.indexOf(env), 1); save(); }}>×</button></div>
      <${Rows} rows=${env.variables} testid="env-vars" onChange=${save} /></fieldset>`)}
    <button class="secondary outline" data-testid="add-env" onClick=${() => { s.environments.push({ id: newId(), name: `Environment ${s.environments.length + 1}`, variables: [] }); save(); }}>+ ${t('h.addEnv')}</button>
    <h4>${t('h.collectionVars')}</h4>
    <${Rows} rows=${state.collection.variables} testid="collection-vars" onChange=${changed} />
    <details><summary>${t('appdata.relay')}</summary><${data.RelayFields} />
      <label><input type="checkbox" checked=${state.insecure} data-testid="insecure" onChange=${(e) => { state.insecure = e.target.checked; }} /> ${t('h.insecure')}</label>
      <label><input type="checkbox" checked=${state.followRedirects} data-testid="follow-redirects" onChange=${(e) => { state.followRedirects = e.target.checked; }} /> ${t('h.followRedirects')}</label></details>
    <footer><button data-testid="env-close" onClick=${close}>${t('h.close')}</button></footer></article></dialog>`;
}

function Main() {
  return html`<div class="h-layout"><${Sidebar} />${state.panels ? Suite.shell.backdrop(() => { state.panels = false; render(); }) : null}<div class="h-work"><${RequestEditor} />${isWs(state.current.url) ? html`<${WsPanel} />` : html`<${Response} />`}</div><${Dialog} /><${data.Dialog} /></div>`;
}

Suite.shell.mount({ id: APP, title: 'app.title', version: '%%BUILD_VERSION%%', toolbar: () => html`<${Toolbar} />`, main: () => html`<${Main} />` });
select(first);
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); send(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveCollection(e.shiftKey); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); openCollection(); }
  const undoKey = Suite.UndoHistory.key(e);
  if (undoKey && !state.dialog) { e.preventDefault(); undoStep(undoKey === 'redo'); }
});

// for tests
window.HTTP = { state, history, undoStep, data, select, get ws() { return ws; } };
document.body.dataset.ready = 'true';
