/*
 * SSH client: terminal sessions in tabs (xterm.js) with an SFTP file panel for upload and download, saved connections
 * (Suite.appdata: JSON or KeePass), host key verification, extra keys for touch screens. SSH engine: shared/js/ssh.js.
 */
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

const { html } = Suite.shell;
const t = Suite.t;
const APP = 'ssh';

Suite.i18n.register({
  en: {
    'ssh.forwards': 'Forwarding', 'ssh.forwardLocal': 'Local (here → server)', 'ssh.forwardRemote': 'Remote (server → here)', 'ssh.localPort': 'Local port (empty = any)', 'ssh.serverPort': 'Server port',
    'ssh.onServer': 'server', 'ssh.forwardActive': 'active · {0} connection(s)', 'ssh.fw.starting': 'starting…', 'ssh.fw.stopped': 'stopped', 'ssh.forwardStop': 'Stop',
    'ssh.forwardSave': 'Save these forwardings with the connection (they start whenever it connects)', 'ssh.forwardSaved': 'The forwardings were saved with the connection.',
    'ssh.forwardLocalHint': 'Programs on this computer connect to 127.0.0.1 at the local port (the relay listens there); the SSH server connects on to host:port – e.g. a database only reachable from the server.',
    'ssh.forwardRemoteHint': 'The SSH server listens on its port 127.0.0.1:port; connections go back through this browser and the relay to host:port here.',
    'ssh.forwardStarted': 'Forwarding {0}', 'ssh.forwardFailed': 'Forwarding {0} failed: {1}',
    'ssh.route': 'Proxy and jump host', 'ssh.jump': 'Jump host (ProxyJump)', 'ssh.jumpNone': 'none – connect directly', 'ssh.jumpHint': 'The connection goes through the saved connection chosen as jump host; its proxy is used for the first hop.',
    'ssh.jumpMissing': 'The jump host of this connection is no longer saved.', 'ssh.jumpLoop': 'Too many jump hosts (a loop?).', 'ssh.viaJump': 'Connecting to {0} through the jump host…',
    'ssh.proxy': 'Proxy', 'ssh.proxyNone': 'none', 'ssh.proxySocks': 'SOCKS5', 'ssh.proxyHttp': 'HTTP (CONNECT)', 'ssh.proxyHost': 'Proxy host', 'ssh.proxyUser': 'Proxy user (optional)', 'ssh.proxyPassword': 'Proxy password',
    'ssh.snippets': 'Snippets', 'ssh.snippet': 'Snippet', 'ssh.snippetAdd': 'Snippet', 'ssh.snippetCommand': 'Command(s)', 'ssh.snippetRun': 'Run',
    'ssh.snippetHint': 'Several lines are sent one after the other. {{name}} asks for a value before sending, e.g. tail -n 50 {{log file}}.',
    'ssh.snippetEnter': 'Press Enter after the command', 'ssh.snippetNoSession': 'Open a connection first.',
    'app.title': 'SSH client',
    'ssh.new': 'New connection', 'ssh.saved': 'Saved connections', 'ssh.connect': 'Connect', 'ssh.save': 'Save connection', 'ssh.cancel': 'Cancel',
    'ssh.name': 'Name', 'ssh.host': 'Host', 'ssh.port': 'Port', 'ssh.user': 'User', 'ssh.auth': 'Authentication', 'ssh.password': 'Password',
    'ssh.key': 'Private key', 'ssh.keyHint': 'OpenSSH or PEM private key (paste it or load the file)', 'ssh.loadKey': 'Load key file…', 'ssh.passphrase': 'Key passphrase',
    'ssh.savePassword': 'Save password and passphrase with the connection', 'ssh.connecting': 'Connecting to {0}…', 'ssh.connected': 'Connected ({0})',
    'ssh.closed': 'Connection closed.', 'ssh.exited': '[session ended with code {0}]', 'ssh.reconnect': 'Reconnect', 'ssh.files': 'Files', 'ssh.empty': 'Open a connection to start a terminal session.',
    'ssh.hostKeyTitle': 'Unknown host key', 'ssh.hostKeyText': 'The server {0} presented this {1} host key. Check the fingerprint with the administrator before you trust it.',
    'ssh.hostKeyChanged': 'WARNING: the host key of {0} has CHANGED. Someone may be intercepting the connection. Saved fingerprint: {1}',
    'ssh.acceptOnce': 'Accept once', 'ssh.acceptSave': 'Accept and save', 'ssh.reject': 'Reject', 'ssh.upload': 'Upload…', 'ssh.mkdir': 'New folder', 'ssh.refresh': 'Refresh',
    'ssh.folderName': 'Folder name', 'ssh.rename': 'Rename', 'ssh.delete': 'Delete', 'ssh.deleteConfirm': 'Delete “{0}”?', 'ssh.uploaded': '{0} file(s) uploaded.',
    'ssh.download': 'Download', 'ssh.savedBack': '“{0}” was uploaded to the server.', 'ssh.deleteConnection': 'Delete the connection “{0}”?', 'ssh.edit': 'Edit', 'ssh.fontSize': 'Font size', 'ssh.font': 'Font', 'ssh.systemFont': 'System font', 'ssh.copy': 'Copy', 'ssh.paste': 'Paste',
    'ssh.relayMissing': 'Configure the relay first (address and token).', 'ssh.newName': 'New name',
    'ssh.keygen': 'New key pair…', 'ssh.keyType': 'Key type', 'ssh.comment': 'Comment', 'ssh.keyPassphrase': 'Passphrase (optional, encrypts the private key)',
    'ssh.generate': 'Generate', 'ssh.generating': 'Generating…', 'ssh.publicKey': 'Public key (add it to ~/.ssh/authorized_keys on the server)', 'ssh.fingerprint': 'Fingerprint',
    'ssh.copyPublic': 'Copy', 'ssh.savePrivate': 'Save private key', 'ssh.savePublic': 'Save public key', 'ssh.useKey': 'Use in a new connection', 'ssh.close': 'Close',
    'ssh.copied': 'Copied.', 'ssh.record': 'Record the session to a log file', 'ssh.stopRecord': 'Stop recording and save the log', 'ssh.saveOutput': 'Save the terminal output (scrollback) as text',
    'ssh.knownHosts': 'Known host keys', 'ssh.forgetHostKey': 'Forget this host key (it is asked for again on the next connection)',
  },
  de: {
    'ssh.forwards': 'Weiterleitung', 'ssh.forwardLocal': 'Lokal (hier → Server)', 'ssh.forwardRemote': 'Entfernt (Server → hier)', 'ssh.localPort': 'Lokaler Port (leer = beliebig)', 'ssh.serverPort': 'Server-Port',
    'ssh.onServer': 'Server', 'ssh.forwardActive': 'aktiv · {0} Verbindung(en)', 'ssh.fw.starting': 'startet…', 'ssh.fw.stopped': 'beendet', 'ssh.forwardStop': 'Beenden',
    'ssh.forwardSave': 'Diese Weiterleitungen mit der Verbindung speichern (sie starten bei jedem Verbinden)', 'ssh.forwardSaved': 'Die Weiterleitungen wurden mit der Verbindung gespeichert.',
    'ssh.forwardLocalHint': 'Programme auf diesem Rechner verbinden sich mit 127.0.0.1 am lokalen Port (dort lauscht das Relay); der SSH-Server verbindet weiter zu Host:Port – etwa eine Datenbank, die nur vom Server erreichbar ist.',
    'ssh.forwardRemoteHint': 'Der SSH-Server lauscht an seinem Port 127.0.0.1:Port; Verbindungen gehen über diesen Browser und das Relay zurück zu Host:Port hier.',
    'ssh.forwardStarted': 'Weiterleitung {0}', 'ssh.forwardFailed': 'Weiterleitung {0} fehlgeschlagen: {1}',
    'ssh.route': 'Proxy und Sprungserver', 'ssh.jump': 'Sprungserver (ProxyJump)', 'ssh.jumpNone': 'keiner – direkt verbinden', 'ssh.jumpHint': 'Die Verbindung läuft über die als Sprungserver gewählte gespeicherte Verbindung; deren Proxy gilt für den ersten Abschnitt.',
    'ssh.jumpMissing': 'Der Sprungserver dieser Verbindung ist nicht mehr gespeichert.', 'ssh.jumpLoop': 'Zu viele Sprungserver (eine Schleife?).', 'ssh.viaJump': 'Verbinde über den Sprungserver mit {0}…',
    'ssh.proxy': 'Proxy', 'ssh.proxyNone': 'keiner', 'ssh.proxySocks': 'SOCKS5', 'ssh.proxyHttp': 'HTTP (CONNECT)', 'ssh.proxyHost': 'Proxy-Host', 'ssh.proxyUser': 'Proxy-Benutzer (optional)', 'ssh.proxyPassword': 'Proxy-Passwort',
    'ssh.snippets': 'Befehle', 'ssh.snippet': 'Gespeicherter Befehl', 'ssh.snippetAdd': 'Befehl', 'ssh.snippetCommand': 'Befehl(e)', 'ssh.snippetRun': 'Ausführen',
    'ssh.snippetHint': 'Mehrere Zeilen werden nacheinander gesendet. {{Name}} fragt vor dem Senden nach einem Wert, z. B. tail -n 50 {{Logdatei}}.',
    'ssh.snippetEnter': 'Nach dem Befehl Enter drücken', 'ssh.snippetNoSession': 'Öffnen Sie zuerst eine Verbindung.',
    'app.title': 'SSH-Client',
    'ssh.new': 'Neue Verbindung', 'ssh.saved': 'Gespeicherte Verbindungen', 'ssh.connect': 'Verbinden', 'ssh.save': 'Verbindung speichern', 'ssh.cancel': 'Abbrechen',
    'ssh.name': 'Name', 'ssh.host': 'Host', 'ssh.port': 'Port', 'ssh.user': 'Benutzer', 'ssh.auth': 'Anmeldung', 'ssh.password': 'Passwort',
    'ssh.key': 'Privater Schlüssel', 'ssh.keyHint': 'Privater Schlüssel im OpenSSH- oder PEM-Format (einfügen oder Datei laden)', 'ssh.loadKey': 'Schlüsseldatei laden…', 'ssh.passphrase': 'Passphrase des Schlüssels',
    'ssh.savePassword': 'Passwort und Passphrase mit der Verbindung speichern', 'ssh.connecting': 'Verbinde mit {0}…', 'ssh.connected': 'Verbunden ({0})',
    'ssh.closed': 'Verbindung geschlossen.', 'ssh.exited': '[Sitzung mit Code {0} beendet]', 'ssh.reconnect': 'Neu verbinden', 'ssh.files': 'Dateien', 'ssh.empty': 'Öffnen Sie eine Verbindung, um eine Terminalsitzung zu starten.',
    'ssh.hostKeyTitle': 'Unbekannter Host-Schlüssel', 'ssh.hostKeyText': 'Der Server {0} hat diesen {1}-Host-Schlüssel gesendet. Prüfen Sie den Fingerabdruck mit der Administration, bevor Sie ihm vertrauen.',
    'ssh.hostKeyChanged': 'WARNUNG: Der Host-Schlüssel von {0} hat sich GEÄNDERT. Möglicherweise wird die Verbindung abgehört. Gespeicherter Fingerabdruck: {1}',
    'ssh.acceptOnce': 'Einmal akzeptieren', 'ssh.acceptSave': 'Akzeptieren und speichern', 'ssh.reject': 'Ablehnen', 'ssh.upload': 'Hochladen…', 'ssh.mkdir': 'Neuer Ordner', 'ssh.refresh': 'Aktualisieren',
    'ssh.folderName': 'Ordnername', 'ssh.rename': 'Umbenennen', 'ssh.delete': 'Löschen', 'ssh.deleteConfirm': '„{0}“ löschen?', 'ssh.uploaded': '{0} Datei(en) hochgeladen.',
    'ssh.download': 'Herunterladen', 'ssh.savedBack': '„{0}“ wurde auf den Server hochgeladen.', 'ssh.deleteConnection': 'Die Verbindung „{0}“ löschen?', 'ssh.edit': 'Bearbeiten', 'ssh.fontSize': 'Schriftgröße', 'ssh.font': 'Schrift', 'ssh.systemFont': 'Systemschrift', 'ssh.copy': 'Kopieren', 'ssh.paste': 'Einfügen',
    'ssh.relayMissing': 'Richten Sie zuerst das Relay ein (Adresse und Token).', 'ssh.newName': 'Neuer Name',
    'ssh.keygen': 'Neues Schlüsselpaar…', 'ssh.keyType': 'Schlüsseltyp', 'ssh.comment': 'Kommentar', 'ssh.keyPassphrase': 'Passphrase (optional, verschlüsselt den privaten Schlüssel)',
    'ssh.generate': 'Erzeugen', 'ssh.generating': 'Erzeuge…', 'ssh.publicKey': 'Öffentlicher Schlüssel (auf dem Server in ~/.ssh/authorized_keys eintragen)', 'ssh.fingerprint': 'Fingerabdruck',
    'ssh.copyPublic': 'Kopieren', 'ssh.savePrivate': 'Privaten Schlüssel speichern', 'ssh.savePublic': 'Öffentlichen Schlüssel speichern', 'ssh.useKey': 'In neuer Verbindung verwenden', 'ssh.close': 'Schließen',
    'ssh.copied': 'Kopiert.', 'ssh.record': 'Sitzung in eine Protokolldatei aufzeichnen', 'ssh.stopRecord': 'Aufzeichnung beenden und Protokoll speichern', 'ssh.saveOutput': 'Terminalausgabe (Verlauf) als Text speichern',
    'ssh.knownHosts': 'Bekannte Host-Schlüssel', 'ssh.forgetHostKey': 'Diesen Host-Schlüssel vergessen (bei der nächsten Verbindung wird erneut gefragt)',
  },
});

const state = { tabs: [], active: null, dialog: null, hostKey: null, panels: false, fontSize: 14, ctrl: false, font: (() => { try { return localStorage.getItem('suite.ssh.font') || ''; } catch (e) { return ''; } })() };
const TERM_FONTS = 'ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace';
const termFont = () => (state.font ? `"${state.font}", ${TERM_FONTS}` : TERM_FONTS);
let nextTab = 1;
const data = Suite.appdata.create(APP, { onChange: () => render() });

let queued = false;
function render() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; Suite.shell.refresh(); requestAnimationFrame(fitActive); });
}
const fail = (e) => { console.warn(e); Suite.shell.toast(Suite.i18n.describe(e), 'error'); };
const tab = () => state.tabs.find((x) => x.id === state.active) || null;
const join = (dir, name) => `${dir.replace(/\/+$/, '')}/${name}`;
const parent = (dir) => dir.replace(/\/[^/]*\/?$/, '') || '/';

// ---- host keys ------------------------------------------------------------------------------------------

/** Ask the user about a host key unless it matches the saved one. Resolves to true or false. */
function verifyHostKey(conn, info) {
  if (conn.hostKey && conn.hostKey === info.fingerprint) return Promise.resolve(true);
  return new Promise((resolve) => {
    state.hostKey = { conn, info, changed: !!conn.hostKey, resolve };
    render();
  });
}

function answerHostKey(accept, save) {
  const h = state.hostKey;
  state.hostKey = null;
  if (accept && save && h.conn.id) {
    const saved = data.connections().find((c) => c.id === h.conn.id);
    if (saved) data.saveConnection({ ...saved, hostKey: h.info.fingerprint });
    h.conn.hostKey = h.info.fingerprint;
  }
  h.resolve(accept);
  render();
}

// ---- sessions -------------------------------------------------------------------------------------------

function newTerminal() {
  const term = new Terminal({ cursorBlink: true, fontSize: state.fontSize, fontFamily: termFont(), allowProposedApi: false, scrollback: 5000 });
  const fit = new FitAddon();
  term.loadAddon(fit);
  const el = document.createElement('div');
  el.className = 'ssh-term';
  el.dataset.testid = 'terminal';
  term.open(el);
  return { term, fit, el };
}

async function connect(conn) {
  const r = data.relay;
  if (!data.relayConfigured()) { Suite.shell.toast(t('ssh.relayMissing'), 'error'); return; }
  const tb = { id: nextTab++, conn: { ...conn }, title: conn.name || `${conn.username}@${conn.host}`, status: 'connecting', client: null, shell: null, sftp: null, files: null, cwd: null, showFiles: false, ...newTerminal() };
  state.tabs.push(tb);
  state.active = tb.id;
  render();
  tb.term.writeln(t('ssh.connecting', `${conn.host}:${conn.port || 22}`));
  tb.term.onData((d) => {
    if (!tb.shell) return;
    if (state.ctrl && d.length === 1) { state.ctrl = false; render(); const c = d.toUpperCase().charCodeAt(0); if (c >= 64 && c <= 95) { tb.shell.write(new Uint8Array([c - 64])); return; } }
    tb.shell.write(new TextEncoder().encode(d));
  });
  tb.term.onResize(({ cols, rows }) => { if (tb.shell) tb.shell.resize(cols, rows); });
  await openSession(tb);
}

/** The proxy settings of a connection for Suite.ssh.connect (or null). */
const proxyOf = (c) => (c.proxyType && c.proxyType !== 'none' && c.proxyHost ? { type: c.proxyType, host: c.proxyHost, port: Number(c.proxyPort) || (c.proxyType === 'http' ? 8080 : 1080), user: c.proxyUser || '', password: c.proxyPassword || '' } : null);

/**
 * Connect a client for a connection: directly, through its proxy, or through its jump host (a saved connection, connected first –
 * itself possibly through a jump host). The jump clients are returned too, so that they are closed with the session.
 */
async function openClient(conn, jumps = [], depth = 0) {
  let via = null;
  if (conn.jump) {
    const hop = data.connections().find((x) => x.id === conn.jump);
    if (!hop) throw new Error(t('ssh.jumpMissing'));
    if (depth > 5) throw new Error(t('ssh.jumpLoop'));
    via = await openClient(hop, jumps, depth + 1);
    jumps.push(via);
  }
  if (depth) tabWrite(t('ssh.viaJump', `${conn.username}@${conn.host}`));
  return Suite.ssh.connect(data.relayConfig(), {
    host: conn.host, port: Number(conn.port) || 22, user: conn.username, password: conn.password || '', privateKey: conn.privateKey || '', passphrase: conn.passphrase || '',
    hostKey: (info) => verifyHostKey(conn, info), proxy: via ? null : proxyOf(conn), via,
  });
}
let tabWrite = () => {};

async function openSession(tb) {
  const conn = tb.conn;
  tb.status = 'connecting';
  render();
  try {
    tb.jumps = [];
    tabWrite = (line) => tb.term.writeln(line);
    tb.client = await openClient(conn, tb.jumps);
    tb.status = 'connected';
    tb.term.writeln(`\x1b[32m${t('ssh.connected', tb.client.serverVersion)}\x1b[0m`);
    stopForwards(tb);
    for (const f of conn.forwards || []) startForward(tb, f).then((r) => tb.term.writeln(r.status === 'active' ? `\x1b[36m${t('ssh.forwardStarted', forwardLabel({ ...f, listenPort: r.active }))}\x1b[0m` : `\x1b[33m${t('ssh.forwardFailed', forwardLabel(f), r.error)}\x1b[0m`));
    await new Promise((r) => requestAnimationFrame(r));
    fitActive();
    tb.shell = await tb.client.shell({
      cols: tb.term.cols, rows: tb.term.rows,
      onData: (bytes) => { tb.term.write(bytes); if (tb.log) { tb.log.parts.push(tb.log.decoder.decode(bytes, { stream: true })); tb.log.size += bytes.length; if (tb.log.size - (tb.log.shown || 0) > 1024) { tb.log.shown = tb.log.size; render(); } } },
      onExit: (code) => { tb.term.writeln(`\r\n\x1b[33m${t('ssh.exited', code)}\x1b[0m`); tb.status = 'closed'; tb.shell = null; render(); },
    });
    if (tb.id === state.active) tb.term.focus();
  } catch (e) {
    tb.status = 'closed';
    for (const j of tb.jumps || []) try { j.close(); } catch (x) { /* closed */ }
    tb.term.writeln(`\r\n\x1b[31m${Suite.i18n.describe(e)}\x1b[0m`);
  }
  render();
}

async function reconnect(tb) {
  stopForwards(tb);
  try { if (tb.client) tb.client.close(); for (const j of tb.jumps || []) j.close(); } catch (e) { /* ignore */ }
  tb.client = tb.shell = tb.sftp = null;
  tb.files = null;
  tb.term.writeln('');
  await openSession(tb);
}

function closeTab(tb) {
  stopForwards(tb);
  try { if (tb.shell) tb.shell.close(); if (tb.client) tb.client.close(); for (const j of tb.jumps || []) j.close(); } catch (e) { /* ignore */ }
  tb.term.dispose();
  state.tabs = state.tabs.filter((x) => x !== tb);
  if (state.active === tb.id) state.active = state.tabs.length ? state.tabs[state.tabs.length - 1].id : null;
  render();
}

function fitActive() {
  const tb = tab();
  if (tb && tb.el.isConnected && tb.el.offsetWidth) { try { tb.fit.fit(); } catch (e) { /* not visible */ } }
}
window.addEventListener('resize', () => fitActive());

// ---- SFTP --------------------------------------------------------------------------------------------------

async function sftpOf(tb) {
  if (!tb.sftp) tb.sftp = await tb.client.sftp();
  return tb.sftp;
}

async function listDir(tb, dir) {
  try {
    const sftp = await sftpOf(tb);
    const path = await sftp.realpath(dir || tb.cwd || '.');
    const entries = await sftp.list(path);
    entries.sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    tb.cwd = path;
    tb.files = entries;
  } catch (e) { fail(e); }
  render();
}

async function toggleFiles(tb) {
  tb.showFiles = !tb.showFiles;
  render();
  if (tb.showFiles && !tb.files && tb.client) await listDir(tb, '.');
}

async function download(tb, entry) {
  try {
    const bytes = await (await sftpOf(tb)).readFile(join(tb.cwd, entry.name));
    Suite.files.download(bytes, entry.name);
  } catch (e) { fail(e); }
}

/** "Open with…": edit a remote file in another app; saving there writes it back over SFTP. */
function openWith(tb, entry) {
  const path = join(tb.cwd, entry.name);
  Suite.bridge.openWith(entry.name, {
    exclude: 'ssh',
    source: `${tb.title}:${path}`,
    data: async () => (await sftpOf(tb)).readFile(path),
    save: async (bytes) => {
      await (await sftpOf(tb)).writeFile(path, bytes);
      Suite.shell.toast(t('ssh.savedBack', entry.name));
      if (tb.cwd === path.slice(0, path.length - entry.name.length - 1) || tb.cwd === '/') listDir(tb, tb.cwd);
    },
  });
}

async function uploadFiles(tb, files) {
  try {
    const sftp = await sftpOf(tb);
    for (const f of files) await sftp.writeFile(join(tb.cwd, f.name), new Uint8Array(await f.arrayBuffer()));
    Suite.shell.toast(t('ssh.uploaded', files.length));
    await listDir(tb, tb.cwd);
  } catch (e) { fail(e); }
}

function pickUpload(tb) {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.style.display = 'none';
  input.onchange = () => { const files = [...input.files]; input.remove(); if (files.length) uploadFiles(tb, files); };
  document.body.appendChild(input);
  input.click();
}

async function sftpAction(tb, kind, entry) {
  const sftp = await sftpOf(tb);
  try {
    if (kind === 'mkdir') { state.dialog = { kind: 'name', title: t('ssh.folderName'), value: '', run: async (name) => { await sftp.mkdir(join(tb.cwd, name)); await listDir(tb, tb.cwd); } }; render(); return; }
    if (kind === 'rename') { state.dialog = { kind: 'name', title: t('ssh.newName'), value: entry.name, run: async (name) => { await sftp.rename(join(tb.cwd, entry.name), join(tb.cwd, name)); await listDir(tb, tb.cwd); } }; render(); return; }
    if (kind === 'delete') {
      if (!(await Suite.shell.confirm(t('ssh.deleteConfirm', entry.name)))) return;
      await (entry.isDir ? sftp.rmdir(join(tb.cwd, entry.name)) : sftp.remove(join(tb.cwd, entry.name)));
      await listDir(tb, tb.cwd);
    }
  } catch (e) { fail(e); }
}

// ---- UI ------------------------------------------------------------------------------------------------------

const fmtSize = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KiB` : `${(n / 1048576).toFixed(1)} MiB`);

function openDialog(c = null) {
  state.dialog = { kind: 'conn', c: c ? { ...c, savePassword: !!(c.password || c.passphrase) } : { name: '', host: '', port: 22, username: '', auth: 'key', password: '', privateKey: '', passphrase: '', savePassword: false } };
  if (!state.dialog.c.auth) state.dialog.c.auth = state.dialog.c.privateKey ? 'key' : 'password';
  render();
}

// ---- session log, key pairs ------------------------------------------------------------------------------------

const stripAnsi = (s) => s.replace(/\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[()][A-Z0-9]|\x1b[=>]/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const logName = (tb) => `${tb.title.replace(/[^\w.@-]+/g, '_')}-${stamp()}.log`;

/** Start or stop recording the output of a session; stopping saves it as a text file (without escape sequences). */
function toggleRecord(tb) {
  if (!tb.log) { tb.log = { parts: [], size: 0, decoder: new TextDecoder(), started: new Date() }; render(); return; }
  const text = `# ${tb.title} – ${tb.log.started.toISOString()} … ${new Date().toISOString()}\n${stripAnsi(tb.log.parts.join(''))}`;
  tb.log = null;
  Suite.files.download(new TextEncoder().encode(text), logName(tb), 'text/plain');
  render();
}

/** Save what the terminal shows, including its scrollback. */
function saveOutput(tb) {
  const b = tb.term.buffer.active;
  const lines = [];
  for (let i = 0; i < b.length; i++) lines.push(b.getLine(i).translateToString(true));
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  Suite.files.download(new TextEncoder().encode(lines.join('\n') + '\n'), logName(tb), 'text/plain');
}

async function generateKey(d) {
  d.busy = true;
  render();
  try {
    const engine = await Suite.ssh.load();
    d.result = await engine.generateKey(d.type, d.comment, d.passphrase);
  } catch (e) { fail(e); }
  d.busy = false;
  render();
}

const keyFileName = (d) => ({ ed25519: 'id_ed25519', ecdsa: 'id_ecdsa', rsa: 'id_rsa' }[d.type]);

function KeygenDialog() {
  const d = state.dialog;
  const r = d.result;
  return html`<dialog open data-testid="keygen-dialog"><article class="ssh-dialog">
    <header><strong>${t('ssh.keygen').replace('…', '')}</strong></header>
    ${r ? html`<label>${t('ssh.publicKey')}<textarea rows="4" readonly data-testid="keygen-public">${r.publicKey}</textarea></label>
        <p><small>${t('ssh.fingerprint')}: <code data-testid="keygen-fingerprint">${r.fingerprint}</code></small></p>
        <div class="ssh-keygen-buttons">
          <button class="secondary outline" data-testid="keygen-copy" onClick=${() => navigator.clipboard.writeText(r.publicKey).then(() => Suite.shell.toast(t('ssh.copied')), fail)}>${t('ssh.copyPublic')}</button>
          <button class="secondary outline" data-testid="keygen-save-public" onClick=${() => Suite.files.download(new TextEncoder().encode(r.publicKey), `${keyFileName(d)}.pub`, 'text/plain')}>${t('ssh.savePublic')}</button>
          <button class="secondary outline" data-testid="keygen-save-private" onClick=${() => Suite.files.download(new TextEncoder().encode(r.privateKey), keyFileName(d), 'application/octet-stream')}>${t('ssh.savePrivate')}</button>
          <button data-testid="keygen-use" onClick=${() => { const key = r.privateKey, pass = d.passphrase; openDialog(); Object.assign(state.dialog.c, { auth: 'key', privateKey: key, passphrase: pass }); render(); }}>${t('ssh.useKey')}</button>
        </div>`
      : html`<form onSubmit=${(e) => { e.preventDefault(); generateKey(d); }}>
        <label>${t('ssh.keyType')}<select data-testid="keygen-type" onChange=${(e) => { d.type = e.target.value; }}>
          ${[['ed25519', 'Ed25519'], ['ecdsa', 'ECDSA P-256'], ['rsa', 'RSA 4096']].map(([v, l]) => html`<option value=${v} selected=${d.type === v}>${l}</option>`)}</select></label>
        <label>${t('ssh.comment')}<input data-testid="keygen-comment" value=${d.comment} onInput=${(e) => { d.comment = e.target.value; }} /></label>
        <label>${t('ssh.keyPassphrase')}<input type="password" data-testid="keygen-passphrase" autocomplete="new-password" onInput=${(e) => { d.passphrase = e.target.value; }} /></label>
        <button type="submit" data-testid="keygen-generate" aria-busy=${d.busy} disabled=${d.busy}>${d.busy ? t('ssh.generating') : t('ssh.generate')}</button>
      </form>`}
    <footer><button class="secondary" data-testid="keygen-close" onClick=${() => { state.dialog = null; render(); }}>${t('ssh.close')}</button></footer>
  </article></dialog>`;
}

// ---- port forwarding: local (the relay listens on this computer, the server connects on) and remote (the server listens) ----

/** Copy data between two connections ({read, send, close}) until one ends. */
function pipe(a, b, onEnd = () => {}) {
  let ended = false;
  const end = () => { if (ended) return; ended = true; try { a.close(); } catch (e) { /* closed */ } try { b.close(); } catch (e) { /* closed */ } onEnd(); };
  const pump = async (from, to) => {
    try { for (;;) { const chunk = await from.read(); if (!chunk) break; if (chunk.length) to.send(chunk); } } catch (e) { /* ended */ }
    end();
  };
  pump(a, b); pump(b, a);
}

const forwardLabel = (f) => (f.type === 'remote' ? `R ${f.listenPort} → ${f.host}:${f.port}` : `L ${f.listenPort || '*'} → ${f.host}:${f.port}`);

async function startForward(tb, f) {
  const run = { ...f, status: 'starting', count: 0, error: '' };
  tb.forwards = [...(tb.forwards || []), run];
  render();
  try {
    if (f.type === 'remote') {
      const l = await tb.client.listen('127.0.0.1', Number(f.listenPort) || 0);
      run.stop = () => l.close();
      run.active = l.port || f.listenPort;
      (async () => {
        for (;;) {
          const ch = await l.accept();
          if (!ch) break;
          run.count++; render();
          Suite.relay.connect(data.relayConfig(), { host: f.host, port: Number(f.port) }).then((c) => pipe(ch, c)).catch(() => ch.close());
        }
      })();
    } else {
      const l = await Suite.relay.listen(data.relayConfig(), Number(f.listenPort) || 0, (conn) => {
        run.count++; render();
        tb.client.dial(f.host, Number(f.port)).then((ch) => pipe(conn, ch)).catch((e) => { conn.close(); tb.term.writeln(`\r\n\x1b[33m${t('ssh.forwardFailed', forwardLabel(f), Suite.i18n.describe(e))}\x1b[0m`); });
      });
      run.stop = () => l.close();
      run.active = l.port;
      l.onclose = () => { if (run.status === 'active') { run.status = 'stopped'; render(); } };
    }
    run.status = 'active';
  } catch (e) { run.status = 'failed'; run.error = Suite.i18n.describe(e); }
  render();
  return run;
}

function stopForward(tb, run) {
  try { if (run.stop) run.stop(); } catch (e) { /* closed */ }
  tb.forwards = (tb.forwards || []).filter((x) => x !== run);
  render();
}

function stopForwards(tb) { for (const r of tb.forwards || []) try { if (r.stop) r.stop(); } catch (e) { /* closed */ } tb.forwards = []; }

function ForwardPanel({ tb }) {
  if (!tb.showForwards) return null;
  const d = tb.newForward || (tb.newForward = { type: 'local', listenPort: '', host: 'localhost', port: '' });
  return html`<section class="ssh-forwards" data-testid="forwards">
    <strong>${t('ssh.forwards')}</strong>
    <ul>${(tb.forwards || []).map((r) => html`<li data-testid="forward" data-status=${r.status}>
      <code>${r.type === 'remote' ? `${t('ssh.onServer')} 127.0.0.1:${r.active || r.listenPort}` : `127.0.0.1:${r.active || r.listenPort || '…'}`} ${Suite.icon('arrow-right')} ${r.host}:${r.port}</code>
      <small>${r.status === 'failed' ? r.error : r.status === 'active' ? t('ssh.forwardActive', r.count) : t(`ssh.fw.${r.status}`)}</small>
      <button class="secondary outline" title=${t('ssh.forwardStop')} data-testid="forward-stop" onClick=${() => stopForward(tb, r)}>×</button></li>`)}</ul>
    <form class="ssh-forward-new" onSubmit=${(e) => { e.preventDefault(); if (!d.host || !d.port) return; const f = { type: d.type, listenPort: Number(d.listenPort) || 0, host: d.host, port: Number(d.port) }; tb.newForward = null; startForward(tb, f); }}>
      <select data-testid="forward-type" onChange=${(e) => { d.type = e.target.value; render(); }}>
        <option value="local" selected=${d.type === 'local'}>${t('ssh.forwardLocal')}</option><option value="remote" selected=${d.type === 'remote'}>${t('ssh.forwardRemote')}</option></select>
      <input type="number" min="0" max="65535" data-testid="forward-listen" placeholder=${d.type === 'local' ? t('ssh.localPort') : t('ssh.serverPort')} value=${d.listenPort} onInput=${(e) => { d.listenPort = e.target.value; }} />
      <span>${Suite.icon('arrow-right')}</span>
      <input data-testid="forward-host" placeholder=${t('ssh.host')} value=${d.host} onInput=${(e) => { d.host = e.target.value; }} />
      <input type="number" min="1" max="65535" data-testid="forward-port" placeholder=${t('ssh.port')} value=${d.port} onInput=${(e) => { d.port = e.target.value; }} />
      <button type="submit" data-testid="forward-add">+</button>
      <button type="button" class="secondary outline" title=${t('ssh.forwardSave')} data-testid="forward-save" disabled=${!tb.conn.id || !(tb.forwards || []).length}
        onClick=${() => { const c = data.connections().find((x) => x.id === tb.conn.id); if (c) { data.saveConnection({ ...c, forwards: (tb.forwards || []).map(({ type, listenPort, host, port }) => ({ type, listenPort, host, port })) }); Suite.shell.toast(t('ssh.forwardSaved')); } }}>${Suite.icon('save')}</button>
    </form>
    <small>${t(d.type === 'local' ? 'ssh.forwardLocalHint' : 'ssh.forwardRemoteHint')}</small>
  </section>`;
}

function Toolbar() {
  const tb = tab();
  return html`<nav class="ssh-toolbar" role="toolbar">
    <button class="secondary outline ssh-only-phone" data-testid="toggle-panels" title=${Suite.t('common.panels')} onClick=${() => { state.panels = !state.panels; render(); }}>${Suite.icon('menu')}</button>
    <button data-testid="new-connection" onClick=${() => openDialog()}>+ ${t('ssh.new')}</button>
    ${tb ? html`<button class=${tb.showFiles ? '' : 'secondary outline'} data-testid="toggle-files" disabled=${!tb.client} onClick=${() => toggleFiles(tb)}>${Suite.icon('folder')} ${t('ssh.files')}</button>
      <button class=${tb.showForwards ? '' : 'secondary outline'} data-testid="toggle-forwards" disabled=${!tb.client} onClick=${() => { tb.showForwards = !tb.showForwards; render(); }}>${Suite.icon('arrow-left-right')} ${t('ssh.forwards')}${(tb.forwards || []).length ? ` (${tb.forwards.length})` : ''}</button>
      ${tb.status === 'closed' ? html`<button class="secondary" data-testid="reconnect" onClick=${() => reconnect(tb)}>${t('ssh.reconnect')}</button>` : null}
      <button class="secondary outline" title=${t('ssh.copy')} data-testid="copy" onClick=${() => { const s = tb.term.getSelection(); if (s) navigator.clipboard.writeText(s).catch(fail); }}>${Suite.icon('copy')}</button>
      <button class=${tb.log ? '' : 'secondary outline'} title=${tb.log ? t('ssh.stopRecord') : t('ssh.record')} data-testid="record" onClick=${() => toggleRecord(tb)}>${tb.log ? html`${Suite.icon('square')} ${fmtSize(tb.log.size)}` : Suite.icon('circle-dot')}</button>
      <button class="secondary outline" title=${t('ssh.saveOutput')} data-testid="save-output" onClick=${() => saveOutput(tb)}>${Suite.icon('download')}</button>
      <button class="secondary outline" title=${t('ssh.paste')} data-testid="paste" onClick=${async () => { try { const text = await navigator.clipboard.readText(); if (tb.shell) tb.shell.write(new TextEncoder().encode(text)); } catch (e) { fail(e); } }}>${Suite.icon('clipboard')}</button>` : null}
    <label class="ssh-font">${t('ssh.fontSize')}<select data-testid="font-size" onChange=${(e) => { state.fontSize = +e.target.value; for (const x of state.tabs) x.term.options.fontSize = state.fontSize; render(); }}>
      ${[11, 12, 13, 14, 16, 18, 20].map((s) => html`<option value=${s} selected=${state.fontSize === s}>${s}</option>`)}</select></label>
    ${Suite.fonts && Suite.fonts.families('monospace').length ? html`<label class="ssh-font">${t('ssh.font')}<select data-testid="font" onChange=${(e) => {
      state.font = e.target.value;
      try { localStorage.setItem('suite.ssh.font', state.font); } catch (err) { /* storage blocked */ }
      // (a terminal measures its cells with the font: loaded first)
      document.fonts.load(`14px ${termFont()}`).catch(() => null).then(() => { for (const x of state.tabs) x.term.options.fontFamily = termFont(); });
      render();
    }}><option value="" selected=${!state.font}>${t('ssh.systemFont')}</option>
      ${Suite.fonts.families('monospace').map((f) => html`<option value=${f.name} selected=${state.font === f.name}>${f.name}</option>`)}</select></label>` : null}
  </nav>`;
}

// ---- snippets: saved commands (kept with the connections), {{placeholders}} are asked for -------------------------------

const snippets = () => (data.settings.snippets || []).slice();
const placeholders = (command) => [...new Set([...command.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]))];

function saveSnippets(list) { data.settings = { ...data.settings, snippets: list }; render(); }

function runSnippet(sn, values = null) {
  const tb = tab();
  if (!tb || !tb.shell) { Suite.shell.toast(t('ssh.snippetNoSession'), 'warning'); return; }
  const names = placeholders(sn.command);
  if (names.length && !values) { state.dialog = { kind: 'snippet-run', sn, values: Object.fromEntries(names.map((n) => [n, ''])) }; render(); return; }
  const text = sn.command.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, n) => (values ? values[n] ?? '' : ''));
  tb.shell.write(new TextEncoder().encode(text.replace(/\r?\n/g, '\r') + (sn.enter === false ? '' : '\r')));
  state.panels = false;
  render();
  requestAnimationFrame(() => tb.term.focus());
}

function SnippetDialog() {
  const d = state.dialog;
  const sn = d.sn;
  const close = () => { state.dialog = null; render(); };
  if (d.kind === 'snippet-run') {
    return html`<dialog open data-testid="snippet-run-dialog"><article class="ssh-dialog">
      <header><strong>${sn.name}</strong></header>
      <form onSubmit=${(e) => { e.preventDefault(); const v = d.values; state.dialog = null; runSnippet(sn, v); }}>
        ${Object.keys(d.values).map((n, i) => html`<label>${n}<input data-testid=${`snippet-value-${i}`} autofocus=${i === 0} onInput=${(e) => { d.values[n] = e.target.value; }} /></label>`)}
        <footer><button type="button" class="secondary" onClick=${close}>${t('ssh.cancel')}</button><button type="submit" data-testid="snippet-run-ok">${t('ssh.snippetRun')}</button></footer>
      </form></article></dialog>`;
  }
  return html`<dialog open data-testid="snippet-dialog"><article class="ssh-dialog">
    <header><strong>${t('ssh.snippet')}</strong></header>
    <form onSubmit=${(e) => { e.preventDefault(); if (!sn.command.trim()) return; const list = snippets(); const i = list.findIndex((x) => x.id === sn.id); const item = { ...sn, name: sn.name.trim() || sn.command.trim().split('\n')[0].slice(0, 40) }; if (i >= 0) list[i] = item; else list.push(item); saveSnippets(list); close(); }}>
      <label>${t('ssh.name')}<input data-testid="snippet-name" value=${sn.name} onInput=${(e) => { sn.name = e.target.value; }} /></label>
      <label>${t('ssh.snippetCommand')}<textarea rows="4" data-testid="snippet-command" spellcheck="false" value=${sn.command} onInput=${(e) => { sn.command = e.target.value; }}></textarea></label>
      <small>${t('ssh.snippetHint')}</small>
      <label><input type="checkbox" checked=${sn.enter !== false} data-testid="snippet-enter" onChange=${(e) => { sn.enter = e.target.checked; }} /> ${t('ssh.snippetEnter')}</label>
      <footer>${d.existing ? html`<button type="button" class="secondary outline" data-testid="snippet-delete" onClick=${() => { saveSnippets(snippets().filter((x) => x.id !== sn.id)); close(); }}>${t('ssh.delete')}</button>` : null}
        <button type="button" class="secondary" onClick=${close}>${t('ssh.cancel')}</button><button type="submit" data-testid="snippet-save">${t('ssh.save')}</button></footer>
    </form></article></dialog>`;
}

function Snippets() {
  const list = snippets();
  const tb = tab();
  return html`<details class="ssh-snippets" data-testid="snippets" open>
    <summary><strong>${t('ssh.snippets')}</strong></summary>
    <ul>${list.map((sn) => html`<li data-testid="snippet">
      <a href="#" title=${sn.command} class=${tb && tb.shell ? '' : 'disabled'} onClick=${(e) => { e.preventDefault(); runSnippet(sn); }}>${Suite.icon('play')} ${sn.name}</a>
      <button class="secondary outline" title=${t('ssh.edit')} data-testid="snippet-edit" onClick=${() => { state.dialog = { kind: 'snippet', sn: { ...sn }, existing: true }; render(); }}>${Suite.icon('pencil')}</button></li>`)}</ul>
    <button class="secondary outline" data-testid="snippet-add" onClick=${() => {
      const sel = tb ? tb.term.getSelection() : '';
      state.dialog = { kind: 'snippet', sn: { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: '', command: sel ? sel.trim() : '', enter: true } }; render();
    }}>+ ${t('ssh.snippetAdd')}</button>
  </details>`;
}

function Sidebar() {
  return html`<aside class=${`ssh-side suite-drawer ${state.panels ? 'open' : ''}`} data-testid="sidebar">
    <strong>${t('ssh.saved')}</strong>
    <ul class="ssh-saved">${data.connections().map((c) => html`<li data-testid="saved-connection">
      <a href="#" onClick=${(e) => { e.preventDefault(); state.panels = false; if (c.password || c.privateKey) connect(c); else openDialog(c); }}>${Suite.icon('monitor')} ${c.name}</a>
      <button class="secondary outline" title=${t('ssh.edit')} data-testid="edit-connection" onClick=${() => openDialog(c)}>${Suite.icon('pencil')}</button>
      <button class="secondary outline" title=${t('ssh.delete')} data-testid="delete-connection" onClick=${async () => { if (await Suite.shell.confirm(t('ssh.deleteConnection', c.name))) data.deleteConnection(c.id); }}>×</button></li>`)}</ul>
    <${Snippets} />
    <button class="secondary outline" data-testid="keygen" onClick=${() => { state.panels = false; state.dialog = { kind: 'keygen', type: 'ed25519', comment: 'suite', passphrase: '', result: null }; render(); }}>${Suite.icon('key-round')} ${t('ssh.keygen')}</button>
    ${data.connections().some((c) => c.hostKey) ? html`<strong>${t('ssh.knownHosts')}</strong>
      <ul class="ssh-known" data-testid="known-hosts">${data.connections().filter((c) => c.hostKey).map((c) => html`<li data-testid="known-host">
        <span>${c.host}${c.port && Number(c.port) !== 22 ? `:${c.port}` : ''}<br /><code>${c.hostKey}</code></span>
        <button class="secondary outline" title=${t('ssh.forgetHostKey')} data-testid="forget-host-key" onClick=${() => { const { hostKey, ...rest } = c; data.saveConnection(rest); }}>×</button></li>`)}</ul>` : null}
    <${data.Bar} />
  </aside>`;
}

function Files({ tb }) {
  if (!tb.showFiles) return null;
  return html`<section class="ssh-files" data-testid="files"
      onDragOver=${(e) => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); }}
      onDrop=${(e) => { e.preventDefault(); e.stopPropagation(); uploadFiles(tb, [...e.dataTransfer.files]); }}>
    <div class="ssh-files-head">
      <input class="ssh-path" data-testid="path" key=${tb.cwd} defaultValue=${tb.cwd || ''} onKeyDown=${(e) => { if (e.key === 'Enter') listDir(tb, e.target.value); }} />
      <button class="secondary outline" title=${t('ssh.refresh')} data-testid="files-refresh" onClick=${() => listDir(tb, tb.cwd)}>${Suite.icon('rotate-cw')}</button>
    </div>
    <div class="ssh-files-buttons">
      <button class="secondary outline" data-testid="upload" onClick=${() => pickUpload(tb)}>${Suite.icon('upload')} ${t('ssh.upload')}</button>
      <button class="secondary outline" data-testid="mkdir" onClick=${() => sftpAction(tb, 'mkdir')}>+ ${t('ssh.mkdir')}</button>
    </div>
    <ul class="ssh-file-list">
      ${tb.cwd && tb.cwd !== '/' ? html`<li><a href="#" data-testid="up" onClick=${(e) => { e.preventDefault(); listDir(tb, parent(tb.cwd)); }}>${Suite.icon('folder')} ..</a></li>` : null}
      ${(tb.files || []).map((f) => html`<li data-testid="file">
        <a href="#" data-testid="file-name" onClick=${(e) => { e.preventDefault(); if (f.isDir) listDir(tb, join(tb.cwd, f.name)); else download(tb, f); }}>${f.isDir ? Suite.icon('folder') : Suite.icon('file')} ${f.name}</a>
        <small>${f.isDir ? '' : fmtSize(f.size)}</small>
        <span class="ssh-file-actions">
          ${f.isDir ? null : html`<button class="secondary outline" title=${t('bridge.openWith')} aria-label=${t('bridge.openWith')} data-testid="file-open-with" onClick=${() => openWith(tb, f)}>${Suite.icon('external-link')}</button>`}
          ${f.isDir ? null : html`<button class="secondary outline" title=${t('ssh.download')} data-testid="file-download" onClick=${() => download(tb, f)}>${Suite.icon('download')}</button>`}
          <button class="secondary outline" title=${t('ssh.rename')} data-testid="file-rename" onClick=${() => sftpAction(tb, 'rename', f)}>${Suite.icon('pencil')}</button>
          <button class="secondary outline" title=${t('ssh.delete')} data-testid="file-delete" onClick=${() => sftpAction(tb, 'delete', f)}>×</button>
        </span></li>`)}
    </ul>
  </section>`;
}

const KEYS = [['Esc', '\x1b'], ['Tab', '\t'], ['↑', '\x1b[A'], ['↓', '\x1b[B'], ['←', '\x1b[D'], ['→', '\x1b[C'], ['|', '|'], ['/', '/'], ['-', '-'], ['~', '~']];

function Work() {
  const tb = tab();
  if (!tb) return html`<div class="ssh-work"><p class="ssh-empty" data-testid="empty">${t('ssh.empty')}</p></div>`;
  return html`<div class="ssh-work">
    <div class="ssh-tabs" role="tablist">${state.tabs.map((x) => html`<button role="tab" class=${x.id === state.active ? '' : 'secondary outline'} data-testid="tab" data-status=${x.status}
      onClick=${() => { state.active = x.id; render(); requestAnimationFrame(() => x.term.focus()); }}>
      <span class=${`ssh-dot ${x.status}`}></span>${x.title}<span class="ssh-tab-x" data-testid="close-tab" onClick=${(e) => { e.stopPropagation(); closeTab(x); }}>×</span></button>`)}</div>
    <div class="ssh-body">
      <div class="ssh-term-box" ref=${(el) => { if (el && tb.el.parentElement !== el) { el.replaceChildren(tb.el); requestAnimationFrame(fitActive); } }}></div>
      <${Files} tb=${tb} />
    </div>
    <${ForwardPanel} tb=${tb} />
    <div class="ssh-keys" data-testid="extra-keys">
      <button class=${state.ctrl ? '' : 'secondary outline'} data-testid="key-ctrl" onClick=${() => { state.ctrl = !state.ctrl; render(); tb.term.focus(); }}>Ctrl</button>
      ${KEYS.map(([label, seq]) => html`<button class="secondary outline" onClick=${() => { if (tb.shell) tb.shell.write(new TextEncoder().encode(seq)); tb.term.focus(); }}>${label}</button>`)}
    </div>
  </div>`;
}

function ConnDialog() {
  const d = state.dialog;
  const c = d.c;
  const field = (key, label, type = 'text', extra = {}) => html`<label>${t(label)}<input type=${type} data-testid=${`conn-${key}`} value=${c[key] ?? ''} ...${extra}
    onInput=${(e) => { c[key] = type === 'number' ? Number(e.target.value) : e.target.value; }} /></label>`;
  const stored = () => {
    const s = { ...c };
    delete s.savePassword;
    if (!c.savePassword) { s.password = ''; s.passphrase = ''; s.proxyPassword = ''; }
    if (c.auth === 'password') s.privateKey = '';
    s.url = `ssh://${c.username}@${c.host}:${c.port || 22}`;
    s.name = c.name || `${c.username}@${c.host}`;
    return s;
  };
  return html`<dialog open data-testid="conn-dialog"><article class="ssh-dialog">
    <header><strong>${c.id ? c.name : t('ssh.new')}</strong></header>
    <form onSubmit=${(e) => { e.preventDefault(); state.dialog = null; state.panels = false; connect({ ...c, name: c.name || `${c.username}@${c.host}` }); }}>
      ${field('name', 'ssh.name')}
      <div class="ssh-row">${field('host', 'ssh.host', 'text', { required: true })}${field('port', 'ssh.port', 'number')}</div>
      ${field('username', 'ssh.user', 'text', { required: true, autocomplete: 'username' })}
      <fieldset class="ssh-auth"><legend>${t('ssh.auth')}</legend>
        <label><input type="radio" name="auth" checked=${c.auth === 'key'} data-testid="auth-key" onChange=${() => { c.auth = 'key'; render(); }} /> ${t('ssh.key')}</label>
        <label><input type="radio" name="auth" checked=${c.auth === 'password'} data-testid="auth-password" onChange=${() => { c.auth = 'password'; render(); }} /> ${t('ssh.password')}</label>
      </fieldset>
      ${c.auth === 'key' ? html`<label>${t('ssh.key')}<textarea rows="4" data-testid="conn-privateKey" placeholder=${t('ssh.keyHint')} spellcheck="false" onInput=${(e) => { c.privateKey = e.target.value; }}>${c.privateKey || ''}</textarea></label>
        <label class="ssh-file-button" role="button">${t('ssh.loadKey')}<input type="file" hidden onChange=${async (e) => { if (e.target.files[0]) { c.privateKey = await e.target.files[0].text(); render(); } }} /></label>
        ${field('passphrase', 'ssh.passphrase', 'password', { autocomplete: 'off' })}`
        : field('password', 'ssh.password', 'password', { autocomplete: 'current-password' })}
      <label><input type="checkbox" checked=${c.savePassword} data-testid="conn-save-password" onChange=${(e) => { c.savePassword = e.target.checked; }} /> ${t('ssh.savePassword')}</label>
      <details class="ssh-route" open=${!!(c.jump || (c.proxyType && c.proxyType !== 'none'))}><summary>${t('ssh.route')}</summary>
        <label>${t('ssh.jump')}<select data-testid="conn-jump" onChange=${(e) => { c.jump = e.target.value || ''; render(); }}>
          <option value="">${t('ssh.jumpNone')}</option>
          ${data.connections().filter((x) => x.id !== c.id).map((x) => html`<option value=${x.id} selected=${c.jump === x.id}>${x.name}</option>`)}</select></label>
        ${!c.jump ? html`<label>${t('ssh.proxy')}<select data-testid="conn-proxy-type" onChange=${(e) => { c.proxyType = e.target.value; render(); }}>
            ${[['none', 'ssh.proxyNone'], ['socks5', 'ssh.proxySocks'], ['http', 'ssh.proxyHttp']].map(([v, l]) => html`<option value=${v} selected=${(c.proxyType || 'none') === v}>${t(l)}</option>`)}</select></label>
          ${c.proxyType && c.proxyType !== 'none' ? html`<div class="ssh-row">${field('proxyHost', 'ssh.proxyHost', 'text', { required: true })}${field('proxyPort', 'ssh.port', 'number', { placeholder: c.proxyType === 'http' ? '8080' : '1080' })}</div>
            <div class="ssh-row">${field('proxyUser', 'ssh.proxyUser', 'text', { autocomplete: 'off' })}${field('proxyPassword', 'ssh.proxyPassword', 'password', { autocomplete: 'off' })}</div>` : null}`
          : html`<small>${t('ssh.jumpHint')}</small>`}
      </details>
      <${data.RelayFields} />
      <footer>
        <button type="button" class="secondary" onClick=${() => { state.dialog = null; render(); }}>${t('ssh.cancel')}</button>
        <button type="button" class="secondary outline" data-testid="conn-save" onClick=${() => { c.id = data.saveConnection(stored()); state.dialog = null; render(); }}>${t('ssh.save')}</button>
        <button type="submit" data-testid="conn-connect">${t('ssh.connect')}</button>
      </footer>
    </form>
  </article></dialog>`;
}

function NameDialog() {
  const d = state.dialog;
  return html`<dialog open data-testid="name-dialog"><article>
    <form onSubmit=${async (e) => { e.preventDefault(); const v = e.target.elements.name.value.trim(); state.dialog = null; render(); if (v) await d.run(v).catch(fail); }}>
      <label>${d.title}<input name="name" data-testid="name-input" defaultValue=${d.value} autofocus /></label>
      <footer><button type="button" class="secondary" onClick=${() => { state.dialog = null; render(); }}>${t('ssh.cancel')}</button><button type="submit" data-testid="name-ok">OK</button></footer>
    </form>
  </article></dialog>`;
}

function HostKeyDialog() {
  const h = state.hostKey;
  if (!h) return null;
  return html`<dialog open data-testid="hostkey-dialog"><article>
    <header><strong>${t('ssh.hostKeyTitle')}</strong></header>
    ${h.changed ? html`<p class="ssh-warning" data-testid="hostkey-changed">${t('ssh.hostKeyChanged', h.conn.host, h.conn.hostKey)}</p>` : null}
    <p>${t('ssh.hostKeyText', h.conn.host, h.info.type)}</p>
    <p><code data-testid="hostkey-fingerprint">${h.info.fingerprint}</code></p>
    <footer>
      <button class="secondary" data-testid="hostkey-reject" onClick=${() => answerHostKey(false)}>${t('ssh.reject')}</button>
      <button class="secondary outline" data-testid="hostkey-once" onClick=${() => answerHostKey(true, false)}>${t('ssh.acceptOnce')}</button>
      ${h.conn.id ? html`<button data-testid="hostkey-save" onClick=${() => answerHostKey(true, true)}>${t('ssh.acceptSave')}</button>` : null}
    </footer>
  </article></dialog>`;
}

function Main() {
  return html`<div class="ssh-layout">
    <${Sidebar} /><${Work} />${state.panels ? Suite.shell.backdrop(() => { state.panels = false; render(); }) : null}
    ${state.dialog && state.dialog.kind === 'conn' ? html`<${ConnDialog} />` : null}
    ${state.dialog && state.dialog.kind === 'name' ? html`<${NameDialog} />` : null}
    ${state.dialog && state.dialog.kind === 'keygen' ? html`<${KeygenDialog} />` : null}
    ${state.dialog && (state.dialog.kind === 'snippet' || state.dialog.kind === 'snippet-run') ? html`<${SnippetDialog} />` : null}
    <${HostKeyDialog} /><${data.Dialog} />
  </div>`;
}

Suite.shell.mount({ id: APP, title: 'app.title', version: '%%BUILD_VERSION%%', toolbar: () => html`<${Toolbar} />`, main: () => html`<${Main} />` });
Suite.ssh.load().catch(fail); // start the engine early

// for tests
window.SSH = { state, data, tab, startForward };
document.body.dataset.ready = 'true';
