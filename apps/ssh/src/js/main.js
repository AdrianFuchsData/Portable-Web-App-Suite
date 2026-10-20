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
    'ssh.download': 'Download', 'ssh.savedBack': '“{0}” was uploaded to the server.', 'ssh.deleteConnection': 'Delete the connection “{0}”?', 'ssh.edit': 'Edit', 'ssh.fontSize': 'Font size', 'ssh.copy': 'Copy', 'ssh.paste': 'Paste',
    'ssh.relayMissing': 'Configure the relay first (address and token).', 'ssh.newName': 'New name',
    'ssh.keygen': 'New key pair…', 'ssh.keyType': 'Key type', 'ssh.comment': 'Comment', 'ssh.keyPassphrase': 'Passphrase (optional, encrypts the private key)',
    'ssh.generate': 'Generate', 'ssh.generating': 'Generating…', 'ssh.publicKey': 'Public key (add it to ~/.ssh/authorized_keys on the server)', 'ssh.fingerprint': 'Fingerprint',
    'ssh.copyPublic': 'Copy', 'ssh.savePrivate': 'Save private key', 'ssh.savePublic': 'Save public key', 'ssh.useKey': 'Use in a new connection', 'ssh.close': 'Close',
    'ssh.copied': 'Copied.', 'ssh.record': 'Record the session to a log file', 'ssh.stopRecord': 'Stop recording and save the log', 'ssh.saveOutput': 'Save the terminal output (scrollback) as text',
    'ssh.knownHosts': 'Known host keys', 'ssh.forgetHostKey': 'Forget this host key (it is asked for again on the next connection)',
  },
  de: {
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
    'ssh.download': 'Herunterladen', 'ssh.savedBack': '„{0}“ wurde auf den Server hochgeladen.', 'ssh.deleteConnection': 'Die Verbindung „{0}“ löschen?', 'ssh.edit': 'Bearbeiten', 'ssh.fontSize': 'Schriftgröße', 'ssh.copy': 'Kopieren', 'ssh.paste': 'Einfügen',
    'ssh.relayMissing': 'Richten Sie zuerst das Relay ein (Adresse und Token).', 'ssh.newName': 'Neuer Name',
    'ssh.keygen': 'Neues Schlüsselpaar…', 'ssh.keyType': 'Schlüsseltyp', 'ssh.comment': 'Kommentar', 'ssh.keyPassphrase': 'Passphrase (optional, verschlüsselt den privaten Schlüssel)',
    'ssh.generate': 'Erzeugen', 'ssh.generating': 'Erzeuge…', 'ssh.publicKey': 'Öffentlicher Schlüssel (auf dem Server in ~/.ssh/authorized_keys eintragen)', 'ssh.fingerprint': 'Fingerabdruck',
    'ssh.copyPublic': 'Kopieren', 'ssh.savePrivate': 'Privaten Schlüssel speichern', 'ssh.savePublic': 'Öffentlichen Schlüssel speichern', 'ssh.useKey': 'In neuer Verbindung verwenden', 'ssh.close': 'Schließen',
    'ssh.copied': 'Kopiert.', 'ssh.record': 'Sitzung in eine Protokolldatei aufzeichnen', 'ssh.stopRecord': 'Aufzeichnung beenden und Protokoll speichern', 'ssh.saveOutput': 'Terminalausgabe (Verlauf) als Text speichern',
    'ssh.knownHosts': 'Bekannte Host-Schlüssel', 'ssh.forgetHostKey': 'Diesen Host-Schlüssel vergessen (bei der nächsten Verbindung wird erneut gefragt)',
  },
});

const state = { tabs: [], active: null, dialog: null, hostKey: null, panels: false, fontSize: 14, ctrl: false };
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
  const term = new Terminal({ cursorBlink: true, fontSize: state.fontSize, fontFamily: 'ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace', allowProposedApi: false, scrollback: 5000 });
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

async function openSession(tb) {
  const conn = tb.conn;
  tb.status = 'connecting';
  render();
  try {
    tb.client = await Suite.ssh.connect(data.relayConfig(), {
      host: conn.host, port: Number(conn.port) || 22, user: conn.username, password: conn.password || '', privateKey: conn.privateKey || '', passphrase: conn.passphrase || '',
      hostKey: (info) => verifyHostKey(conn, info),
    });
    tb.status = 'connected';
    tb.term.writeln(`\x1b[32m${t('ssh.connected', tb.client.serverVersion)}\x1b[0m`);
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
    tb.term.writeln(`\r\n\x1b[31m${Suite.i18n.describe(e)}\x1b[0m`);
  }
  render();
}

async function reconnect(tb) {
  try { if (tb.client) tb.client.close(); } catch (e) { /* ignore */ }
  tb.client = tb.shell = tb.sftp = null;
  tb.files = null;
  tb.term.writeln('');
  await openSession(tb);
}

function closeTab(tb) {
  try { if (tb.shell) tb.shell.close(); if (tb.client) tb.client.close(); } catch (e) { /* ignore */ }
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

function Toolbar() {
  const tb = tab();
  return html`<nav class="ssh-toolbar" role="toolbar">
    <button class="secondary outline ssh-only-phone" data-testid="toggle-panels" onClick=${() => { state.panels = !state.panels; render(); }}>☰</button>
    <button data-testid="new-connection" onClick=${() => openDialog()}>+ ${t('ssh.new')}</button>
    ${tb ? html`<button class=${tb.showFiles ? '' : 'secondary outline'} data-testid="toggle-files" disabled=${!tb.client} onClick=${() => toggleFiles(tb)}>📁 ${t('ssh.files')}</button>
      ${tb.status === 'closed' ? html`<button class="secondary" data-testid="reconnect" onClick=${() => reconnect(tb)}>${t('ssh.reconnect')}</button>` : null}
      <button class="secondary outline" title=${t('ssh.copy')} data-testid="copy" onClick=${() => { const s = tb.term.getSelection(); if (s) navigator.clipboard.writeText(s).catch(fail); }}>⧉</button>
      <button class=${tb.log ? '' : 'secondary outline'} title=${tb.log ? t('ssh.stopRecord') : t('ssh.record')} data-testid="record" onClick=${() => toggleRecord(tb)}>${tb.log ? `⏹ ${fmtSize(tb.log.size)}` : '⏺'}</button>
      <button class="secondary outline" title=${t('ssh.saveOutput')} data-testid="save-output" onClick=${() => saveOutput(tb)}>⤓</button>
      <button class="secondary outline" title=${t('ssh.paste')} data-testid="paste" onClick=${async () => { try { const text = await navigator.clipboard.readText(); if (tb.shell) tb.shell.write(new TextEncoder().encode(text)); } catch (e) { fail(e); } }}>📋</button>` : null}
    <label class="ssh-font">${t('ssh.fontSize')}<select data-testid="font-size" onChange=${(e) => { state.fontSize = +e.target.value; for (const x of state.tabs) x.term.options.fontSize = state.fontSize; render(); }}>
      ${[11, 12, 13, 14, 16, 18, 20].map((s) => html`<option value=${s} selected=${state.fontSize === s}>${s}</option>`)}</select></label>
  </nav>`;
}

function Sidebar() {
  return html`<aside class=${`ssh-side suite-drawer ${state.panels ? 'open' : ''}`} data-testid="sidebar">
    <strong>${t('ssh.saved')}</strong>
    <ul class="ssh-saved">${data.connections().map((c) => html`<li data-testid="saved-connection">
      <a href="#" onClick=${(e) => { e.preventDefault(); state.panels = false; if (c.password || c.privateKey) connect(c); else openDialog(c); }}>🖥 ${c.name}</a>
      <button class="secondary outline" title=${t('ssh.edit')} data-testid="edit-connection" onClick=${() => openDialog(c)}>✎</button>
      <button class="secondary outline" title=${t('ssh.delete')} data-testid="delete-connection" onClick=${async () => { if (await Suite.shell.confirm(t('ssh.deleteConnection', c.name))) data.deleteConnection(c.id); }}>×</button></li>`)}</ul>
    <button class="secondary outline" data-testid="keygen" onClick=${() => { state.panels = false; state.dialog = { kind: 'keygen', type: 'ed25519', comment: 'suite', passphrase: '', result: null }; render(); }}>🔑 ${t('ssh.keygen')}</button>
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
      <button class="secondary outline" title=${t('ssh.refresh')} data-testid="files-refresh" onClick=${() => listDir(tb, tb.cwd)}>⟳</button>
    </div>
    <div class="ssh-files-buttons">
      <button class="secondary outline" data-testid="upload" onClick=${() => pickUpload(tb)}>⬆ ${t('ssh.upload')}</button>
      <button class="secondary outline" data-testid="mkdir" onClick=${() => sftpAction(tb, 'mkdir')}>+ ${t('ssh.mkdir')}</button>
    </div>
    <ul class="ssh-file-list">
      ${tb.cwd && tb.cwd !== '/' ? html`<li><a href="#" data-testid="up" onClick=${(e) => { e.preventDefault(); listDir(tb, parent(tb.cwd)); }}>📁 ..</a></li>` : null}
      ${(tb.files || []).map((f) => html`<li data-testid="file">
        <a href="#" data-testid="file-name" onClick=${(e) => { e.preventDefault(); if (f.isDir) listDir(tb, join(tb.cwd, f.name)); else download(tb, f); }}>${f.isDir ? '📁' : '📄'} ${f.name}</a>
        <small>${f.isDir ? '' : fmtSize(f.size)}</small>
        <span class="ssh-file-actions">
          ${f.isDir ? null : html`<button class="secondary outline" title=${t('bridge.openWith')} aria-label=${t('bridge.openWith')} data-testid="file-open-with" onClick=${() => openWith(tb, f)}>↗</button>`}
          ${f.isDir ? null : html`<button class="secondary outline" title=${t('ssh.download')} data-testid="file-download" onClick=${() => download(tb, f)}>⬇</button>`}
          <button class="secondary outline" title=${t('ssh.rename')} data-testid="file-rename" onClick=${() => sftpAction(tb, 'rename', f)}>✎</button>
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
    if (!c.savePassword) { s.password = ''; s.passphrase = ''; }
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
    <${HostKeyDialog} /><${data.Dialog} />
  </div>`;
}

Suite.shell.mount({ id: APP, title: 'app.title', version: '%%BUILD_VERSION%%', toolbar: () => html`<${Toolbar} />`, main: () => html`<${Main} />` });
Suite.ssh.load().catch(fail); // start the engine early

// for tests
window.SSH = { state, data, tab };
document.body.dataset.ready = 'true';
