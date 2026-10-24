/*
 * FTP/SFTP client: remote files (FTP, FTPS, SFTP through the relay) next to a local folder (File System Access API in
 * Chromium; elsewhere uploads from the file picker and downloads), transfer queue with progress, saved sites.
 */
import { openFtp, openSftp, parseListLine, parseMlsdLine, concat } from '@app/remote.js';

const { html } = Suite.shell;
const t = Suite.t;
const APP = 'ftp';
const PORTS = { sftp: 22, ftp: 21, ftps: 21, ftpsi: 990 };

Suite.i18n.register({
  en: {
    'app.title': 'FTP/SFTP client',
    'ftp.protocol': 'Protocol', 'ftp.host': 'Host', 'ftp.port': 'Port', 'ftp.user': 'User', 'ftp.password': 'Password', 'ftp.connect': 'Connect', 'ftp.disconnect': 'Disconnect',
    'ftp.ftps': 'FTPS (explicit TLS)', 'ftp.ftpsi': 'FTPS (implicit TLS)', 'ftp.ftp': 'FTP (not encrypted)', 'ftp.sftp': 'SFTP (SSH)', 'ftp.key': 'Private key (SFTP)',
    'ftp.sites': 'Sites', 'ftp.saveSite': 'Save site', 'ftp.siteName': 'Site name', 'ftp.local': 'Local', 'ftp.remote': 'Remote', 'ftp.chooseFolder': 'Choose local folder…',
    'ftp.noFolder': 'This browser cannot open local folders. Upload files with the button; downloads go to the browser’s download folder.', 'ftp.uploadFiles': 'Upload files…',
    'ftp.upload': 'Upload', 'ftp.savedBack': '“{0}” was uploaded to the server.', 'ftp.download': 'Download', 'ftp.mkdir': 'New folder', 'ftp.rename': 'Rename', 'ftp.delete': 'Delete', 'ftp.refresh': 'Refresh',
    'ftp.deleteConfirm': 'Delete {0} item(s) on the server?', 'ftp.queue': 'Transfers', 'ftp.clearDone': 'Clear finished', 'ftp.waiting': 'waiting', 'ftp.done': 'done',
    'ftp.failed': 'failed', 'ftp.notConnected': 'Not connected.', 'ftp.connecting': 'Connecting…', 'ftp.folderName': 'Folder name', 'ftp.newName': 'New name', 'ftp.cancel': 'Cancel',
    'ftp.hostKey': 'Accept the {0} host key of {1}?\n{2}', 'ftp.overwrite': '“{0}” exists. Overwrite?', 'ftp.relayMissing': 'Configure the relay first (address and token).',
    'ftp.insecure': 'Accept untrusted certificates', 'ftp.deleteSite': 'Delete the site “{0}”?', 'ftp.ok': 'OK', 'ftp.size': 'Size', 'ftp.modified': 'Modified', 'ftp.name': 'Name',
    'ftp.resume': 'Resume', 'ftp.resumeDown': '“{0}” is partly downloaded ({1} of {2}). Resume the download? (Cancel downloads it again.)',
    'ftp.resumeUp': '“{0}” is partly uploaded ({1} of {2}). Resume the upload? (Cancel asks whether to overwrite it.)', 'ftp.resumed': 'resumed at {0}',
    'ftp.compare': 'Compare / synchronize', 'ftp.syncTitle': 'Synchronize “{0}” with “{1}”', 'ftp.comparing': 'Comparing folders…', 'ftp.syncMode': 'Direction',
    'ftp.modeBoth': 'both ways (the newer file wins)', 'ftp.modeUp': 'upload only (local → server)', 'ftp.modeDown': 'download only (server → local)',
    'ftp.useTimes': 'Compare modification times when the sizes are equal', 'ftp.st.onlyLocal': 'only local', 'ftp.st.onlyRemote': 'only on the server',
    'ftp.st.localNewer': 'local is newer', 'ftp.st.remoteNewer': 'server is newer', 'ftp.st.differs': 'different size', 'ftp.st.same': 'same',
    'ftp.act.up': 'upload', 'ftp.act.down': 'download', 'ftp.act.skip': 'skip', 'ftp.syncRun': 'Synchronize ({0})', 'ftp.syncNothing': 'The folders are in sync.',
    'ftp.showSame': 'Show identical files ({0})', 'ftp.syncTruncated': 'Only the first {0} files are compared.', 'ftp.syncNeeds': 'Open a local folder and connect to a server first.',
  },
  de: {
    'app.title': 'FTP/SFTP-Client',
    'ftp.protocol': 'Protokoll', 'ftp.host': 'Host', 'ftp.port': 'Port', 'ftp.user': 'Benutzer', 'ftp.password': 'Passwort', 'ftp.connect': 'Verbinden', 'ftp.disconnect': 'Trennen',
    'ftp.ftps': 'FTPS (explizites TLS)', 'ftp.ftpsi': 'FTPS (implizites TLS)', 'ftp.ftp': 'FTP (unverschlüsselt)', 'ftp.sftp': 'SFTP (SSH)', 'ftp.key': 'Privater Schlüssel (SFTP)',
    'ftp.sites': 'Server', 'ftp.saveSite': 'Server speichern', 'ftp.siteName': 'Name', 'ftp.local': 'Lokal', 'ftp.remote': 'Server', 'ftp.chooseFolder': 'Lokalen Ordner wählen…',
    'ftp.noFolder': 'Dieser Browser kann keine lokalen Ordner öffnen. Laden Sie Dateien mit der Schaltfläche hoch; Downloads landen im Download-Ordner des Browsers.', 'ftp.uploadFiles': 'Dateien hochladen…',
    'ftp.upload': 'Hochladen', 'ftp.savedBack': '„{0}“ wurde auf den Server hochgeladen.', 'ftp.download': 'Herunterladen', 'ftp.mkdir': 'Neuer Ordner', 'ftp.rename': 'Umbenennen', 'ftp.delete': 'Löschen', 'ftp.refresh': 'Aktualisieren',
    'ftp.deleteConfirm': '{0} Element(e) auf dem Server löschen?', 'ftp.queue': 'Übertragungen', 'ftp.clearDone': 'Erledigte entfernen', 'ftp.waiting': 'wartet', 'ftp.done': 'fertig',
    'ftp.failed': 'fehlgeschlagen', 'ftp.notConnected': 'Nicht verbunden.', 'ftp.connecting': 'Verbinde…', 'ftp.folderName': 'Ordnername', 'ftp.newName': 'Neuer Name', 'ftp.cancel': 'Abbrechen',
    'ftp.hostKey': 'Den {0}-Host-Schlüssel von {1} akzeptieren?\n{2}', 'ftp.overwrite': '„{0}“ existiert. Überschreiben?', 'ftp.relayMissing': 'Richten Sie zuerst das Relay ein (Adresse und Token).',
    'ftp.insecure': 'Nicht vertrauenswürdige Zertifikate akzeptieren', 'ftp.deleteSite': 'Den Server „{0}“ löschen?', 'ftp.ok': 'OK', 'ftp.size': 'Größe', 'ftp.modified': 'Geändert', 'ftp.name': 'Name',
    'ftp.resume': 'Fortsetzen', 'ftp.resumeDown': '„{0}“ ist teilweise heruntergeladen ({1} von {2}). Den Download fortsetzen? (Abbrechen lädt die Datei neu.)',
    'ftp.resumeUp': '„{0}“ ist teilweise hochgeladen ({1} von {2}). Das Hochladen fortsetzen? (Abbrechen fragt, ob überschrieben werden soll.)', 'ftp.resumed': 'fortgesetzt bei {0}',
    'ftp.compare': 'Vergleichen / synchronisieren', 'ftp.syncTitle': '„{0}“ mit „{1}“ synchronisieren', 'ftp.comparing': 'Vergleiche Ordner…', 'ftp.syncMode': 'Richtung',
    'ftp.modeBoth': 'in beide Richtungen (die neuere Datei gewinnt)', 'ftp.modeUp': 'nur hochladen (lokal → Server)', 'ftp.modeDown': 'nur herunterladen (Server → lokal)',
    'ftp.useTimes': 'Bei gleicher Größe die Änderungszeiten vergleichen', 'ftp.st.onlyLocal': 'nur lokal', 'ftp.st.onlyRemote': 'nur auf dem Server',
    'ftp.st.localNewer': 'lokal neuer', 'ftp.st.remoteNewer': 'Server neuer', 'ftp.st.differs': 'andere Größe', 'ftp.st.same': 'gleich',
    'ftp.act.up': 'hochladen', 'ftp.act.down': 'herunterladen', 'ftp.act.skip': 'überspringen', 'ftp.syncRun': 'Synchronisieren ({0})', 'ftp.syncNothing': 'Die Ordner sind synchron.',
    'ftp.showSame': 'Gleiche Dateien zeigen ({0})', 'ftp.syncTruncated': 'Nur die ersten {0} Dateien werden verglichen.', 'ftp.syncNeeds': 'Öffnen Sie zuerst einen lokalen Ordner und verbinden Sie sich mit einem Server.',
  },
});

const hasFolderPicker = typeof window.showDirectoryPicker === 'function' && window.isSecureContext;
const state = {
  site: { name: '', protocol: 'sftp', host: '', port: 22, username: '', password: '', privateKey: '', insecure: false },
  fs: null, connecting: false, remotePath: null, remote: [], remoteSel: new Set(),
  localRoot: null, localStack: [], local: [], localSel: new Set(), queue: [], dialog: null, panels: false, sync: null,
};
let nextJob = 1;
const data = Suite.appdata.create(APP, { onChange: () => render() });

let queued = false;
function render() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; Suite.shell.refresh(); });
}
const fail = (e) => { console.warn(e); Suite.shell.toast(Suite.i18n.describe(e), 'error'); };
const join = (dir, name) => (dir === '/' ? `/${name}` : `${dir.replace(/\/+$/, '')}/${name}`);
const parent = (dir) => dir.replace(/\/[^/]*\/?$/, '') || '/';
const fmtSize = (n) => (n == null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KiB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MiB` : `${(n / 1073741824).toFixed(2)} GiB`);
const fmtDate = (ms) => (ms ? new Date(ms).toLocaleString(Suite.i18n.language === 'de' ? 'de-AT' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '');
const sortEntries = (list) => list.sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name, undefined, { numeric: true }));

// ---- connection --------------------------------------------------------------------------------------

async function connect(site = state.site) {
  const r = data.relay;
  if (!data.relayConfigured()) { Suite.shell.toast(t('ftp.relayMissing'), 'error'); return; }
  await disconnect();
  state.site = { ...site };
  state.connecting = true;
  render();
  try {
    const relay = data.relayConfig();
    const p = site.protocol;
    state.fs = p === 'sftp'
      ? await openSftp({ relay, host: site.host, port: site.port, user: site.username, password: site.password, privateKey: site.privateKey, hostKey: (info) => verifyHostKey(site, info) })
      : await openFtp({ relay, host: site.host, port: site.port, user: site.username, password: site.password, tls: p === 'ftps' ? 'explicit' : p === 'ftpsi' ? 'implicit' : 'none', insecure: !!site.insecure });
    await listRemote(await state.fs.home());
  } catch (e) {
    state.fs = null;
    fail(e);
  } finally { state.connecting = false; render(); }
}

async function verifyHostKey(site, info) {
  if (site.hostKey && site.hostKey === info.fingerprint) return true;
  const ok = await Suite.shell.confirm(t('ftp.hostKey', info.type, site.host, info.fingerprint));
  if (ok && site.id) {
    const saved = data.connections().find((c) => c.id === site.id);
    if (saved) data.saveConnection({ ...saved, hostKey: info.fingerprint });
  }
  return ok;
}

async function disconnect() {
  if (state.fs) { const fs = state.fs; state.fs = null; await fs.close().catch(() => {}); }
  state.remote = [];
  state.remotePath = null;
  state.remoteSel = new Set();
  render();
}

async function listRemote(path = state.remotePath) {
  try {
    state.remote = sortEntries(await state.fs.list(path));
    state.remotePath = path;
    state.remoteSel = new Set();
  } catch (e) { fail(e); }
  render();
}

// ---- local folder (File System Access API) --------------------------------------------------------------

const localDir = () => state.localStack[state.localStack.length - 1] || null;

async function chooseLocal() {
  try {
    const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    state.localRoot = dir;
    state.localStack = [dir];
    await listLocal();
  } catch (e) { if (e.name !== 'AbortError') fail(e); }
}

async function listLocal() {
  const dir = localDir();
  if (!dir) return;
  const out = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'file') { const f = await handle.getFile(); out.push({ name, isDir: false, size: f.size, mtime: f.lastModified, handle }); } else out.push({ name, isDir: true, handle });
  }
  state.local = sortEntries(out);
  state.localSel = new Set();
  render();
}

// ---- transfers --------------------------------------------------------------------------------------------

let running = false;
function enqueue(job) {
  state.queue.push({ id: nextJob++, status: 'waiting', done: 0, total: job.size || 0, ...job });
  render();
  pump();
}

async function pump() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const job = state.queue.find((j) => j.status === 'waiting');
      if (!job) break;
      job.status = 'running';
      render();
      try {
        await job.run((done, total) => { job.done = done; if (total) job.total = total; render(); }, job);
        job.status = 'done';
      } catch (e) { job.status = 'failed'; job.error = Suite.i18n.describe(e).replace(/^.*?: /, ''); }
      render();
    }
  } finally { running = false; }
  if (state.fs) await listRemote();
  if (localDir()) await listLocal();
}

async function writeLocal(dir, name, bytes) {
  const handle = await dir.getFileHandle(name, { create: true });
  const w = await handle.createWritable();
  await w.write(bytes);
  await w.close();
}

/** Download remote entries (folders recursively when a local folder is open). */
async function download(entries) {
  const fs = state.fs;
  for (const e of entries) {
    const path = join(state.remotePath, e.name);
    const local = localDir();
    if (e.isDir) {
      if (!local) continue;
      await downloadDir(fs, path, await local.getDirectoryHandle(e.name, { create: true }));
      continue;
    }
    const partial = local ? await partialLocal(local, e) : null;
    enqueueDownload({ fs, path, name: e.name, size: e.size, partial, write: (bytes) => (local ? writeLocal(local, e.name, bytes) : Suite.files.download(bytes, e.name)) });
  }
}

/** The content of a local file that looks like an interrupted download of a remote file (smaller), if the user resumes it. */
async function partialLocal(dir, e) {
  let file;
  try { file = await (await dir.getFileHandle(e.name)).getFile(); } catch (err) { return null; }
  if (!file.size || !e.size || file.size >= e.size) return null;
  if (!(await Suite.shell.confirm(t('ftp.resumeDown', e.name, fmtSize(file.size), fmtSize(e.size))))) return null;
  return new Uint8Array(await file.arrayBuffer());
}

/**
 * A download job that can be resumed: the bytes received before a failure are kept (job.partial) and the next run asks the
 * server for the rest only (REST for FTP, an offset for SFTP).
 */
function enqueueDownload({ fs, path, name, size, partial = null, write }) {
  enqueue({
    direction: 'down', name, size, partial,
    run: async (progress, job) => {
      const offset = job.partial ? job.partial.length : 0;
      if (offset) job.note = t('ftp.resumed', fmtSize(offset));
      let rest;
      try { rest = await fs.read(path, progress, { offset }); } catch (err) {
        if (err.partial && err.partial.length) job.partial = job.partial ? concat([job.partial, err.partial]) : err.partial;
        throw err;
      }
      const bytes = job.partial ? concat([job.partial, rest]) : rest;
      job.partial = null;
      await write(bytes);
    },
  });
}

/** An upload job; a retry continues after the bytes the server already has. */
function enqueueUpload({ fs, path, name, file, offset = 0, mtime = null }) {
  enqueue({
    direction: 'up', name, size: file.size, offset,
    run: async (progress, job) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let from = job.offset || 0;
      if (job.retry) { const have = await fs.size(path).catch(() => null); from = have && have < bytes.length ? have : 0; }
      if (from) job.note = t('ftp.resumed', fmtSize(from));
      await fs.write(path, bytes, progress, { offset: from });
      if (mtime) await fs.setTime(path, mtime); // keeps the local time, so a later comparison sees the same file
    },
  });
}

function resume(job) {
  Object.assign(job, { status: 'waiting', error: null, retry: true });
  render();
  pump();
}

async function downloadDir(fs, path, dir) {
  for (const e of await fs.list(path)) {
    const p = join(path, e.name);
    if (e.isDir) await downloadDir(fs, p, await dir.getDirectoryHandle(e.name, { create: true }));
    else enqueueDownload({ fs, path: p, name: p, size: e.size, write: (bytes) => writeLocal(dir, e.name, bytes) });
  }
}

/** Run a transfer in the queue and resolve with its result. */
function transfer(job) {
  return new Promise((resolve, reject) => {
    enqueue({ ...job, run: async (progress) => { try { resolve(await job.run(progress)); } catch (e) { reject(e); throw e; } } });
  });
}

/**
 * "Open with…": edit remote files in another app; saving there uploads them again. Several files are offered to the
 * apps with tabs (text and hex editor), which open all of them in one window.
 */
function openWith(entries) {
  entries = [].concat(entries).filter((e) => e && !e.isDir);
  if (!entries.length) return;
  const fs = state.fs;
  const host = state.site ? state.site.host || '' : '';
  const items = entries.map((entry) => {
    const path = join(state.remotePath, entry.name);
    return {
      name: entry.name,
      source: `${host}:${path}`,
      data: () => transfer({ direction: 'down', name: entry.name, size: entry.size, run: (progress) => fs.read(path, progress) }),
      save: async (bytes) => {
        await transfer({ direction: 'up', name: entry.name, size: bytes.length, run: (progress) => fs.write(path, bytes, progress) });
        Suite.shell.toast(t('ftp.savedBack', entry.name));
      },
    };
  });
  Suite.bridge.openWithMany(items, { exclude: 'ftp', source: `${host}:${state.remotePath}` });
}

/** Upload File objects or local entries (folders recursively) into the current remote folder. */
async function upload(items, target = state.remotePath) {
  const fs = state.fs;
  const existing = new Map(state.remote.map((e) => [e.name, e]));
  let overwriteAll = null;
  for (const item of items) {
    if (item.isDir) { await uploadDir(fs, item.handle, join(target, item.name)); continue; }
    const name = item.name;
    const file = item.handle ? await item.handle.getFile() : item;
    let offset = 0;
    const there = target === state.remotePath ? existing.get(name) : null;
    if (there && !there.isDir) {
      // a smaller file on the server is probably an interrupted upload
      if (there.size > 0 && there.size < file.size && await Suite.shell.confirm(t('ftp.resumeUp', name, fmtSize(there.size), fmtSize(file.size)))) offset = there.size;
      else {
        if (overwriteAll === null) overwriteAll = await Suite.shell.confirm(t('ftp.overwrite', name));
        if (!overwriteAll) continue;
      }
    }
    enqueueUpload({ fs, path: join(target, name), name, file, offset, mtime: item.handle ? file.lastModified : null });
  }
}

async function uploadDir(fs, dirHandle, path) {
  await fs.mkdir(path).catch(() => {}); // may exist
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'directory') await uploadDir(fs, handle, join(path, name));
    else { const file = await handle.getFile(); enqueueUpload({ fs, path: join(path, name), name: join(path, name), file, mtime: file.lastModified }); }
  }
}

// ---- comparing and synchronizing folders ------------------------------------------------------------------------

const SYNC_LIMIT = 5000;
const TIME_SLACK = 2 * 60000; // LIST shows minutes only, servers and clients disagree by seconds

/** Files below a local directory handle: Map relative path -> { size, mtime, handle, dir }. */
async function localTree(dir, prefix = '', out = new Map()) {
  for await (const [name, handle] of dir.entries()) {
    if (out.size >= SYNC_LIMIT) break;
    const rel = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'directory') await localTree(handle, rel, out);
    else { const f = await handle.getFile(); out.set(rel, { size: f.size, mtime: f.lastModified, handle, dir }); }
  }
  return out;
}

/** Files below a remote path: Map relative path -> { size, mtime, path }. */
async function remoteTree(fs, path, prefix = '', out = new Map()) {
  for (const e of await fs.list(path)) {
    if (out.size >= SYNC_LIMIT) break;
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDir) await remoteTree(fs, join(path, e.name), rel, out);
    else if (!e.link) out.set(rel, { size: e.size, mtime: e.mtime, path: join(path, e.name) });
  }
  return out;
}

/** Status and proposed action of one file for the comparison. */
function compareEntry(local, remote, { mode = 'both', useTimes = false } = {}) {
  let status;
  if (local && !remote) status = 'onlyLocal';
  else if (!local) status = 'onlyRemote';
  else if (local.size === remote.size && (!useTimes || !local.mtime || !remote.mtime || Math.abs(local.mtime - remote.mtime) <= TIME_SLACK)) status = 'same';
  else if (local.mtime && remote.mtime && Math.abs(local.mtime - remote.mtime) > TIME_SLACK) status = local.mtime > remote.mtime ? 'localNewer' : 'remoteNewer';
  else status = 'differs';
  const want = { onlyLocal: 'up', onlyRemote: 'down', localNewer: 'up', remoteNewer: 'down', differs: 'skip', same: 'skip' }[status];
  const action = mode === 'up' ? (want === 'up' || status === 'differs' ? 'up' : 'skip') : mode === 'down' ? (want === 'down' || status === 'differs' ? 'down' : 'skip') : want;
  return { status, action };
}

async function startCompare() {
  const dir = localDir();
  if (!dir || !state.fs) { Suite.shell.toast(t('ftp.syncNeeds'), 'warning'); return; }
  state.sync = { busy: true, mode: 'both', useTimes: false, rows: [], showSame: false, local: null, remote: null, base: state.remotePath, dir };
  render();
  try {
    const [local, remote] = [await localTree(dir), await remoteTree(state.fs, state.remotePath)];
    Object.assign(state.sync, { local, remote, busy: false, truncated: local.size >= SYNC_LIMIT || remote.size >= SYNC_LIMIT });
    planSync();
  } catch (e) { state.sync = null; fail(e); }
  render();
}

function planSync() {
  const s = state.sync;
  const paths = [...new Set([...s.local.keys(), ...s.remote.keys()])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  s.rows = paths.map((rel) => ({ rel, local: s.local.get(rel) || null, remote: s.remote.get(rel) || null, ...compareEntry(s.local.get(rel), s.remote.get(rel), s) }));
}

async function localDirFor(root, rel) {
  let dir = root;
  for (const part of rel.split('/').slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true });
  return dir;
}

async function runSync() {
  const s = state.sync;
  const fs = state.fs;
  const made = new Set();
  const ensureRemote = async (rel) => {
    const parts = rel.split('/').slice(0, -1);
    for (let i = 1; i <= parts.length; i++) {
      const p = join(s.base, parts.slice(0, i).join('/'));
      if (!made.has(p) && ![...s.remote.keys()].some((k) => k.startsWith(`${parts.slice(0, i).join('/')}/`))) await fs.mkdir(p).catch(() => {});
      made.add(p);
    }
  };
  state.sync = null;
  render();
  try {
    for (const r of s.rows) {
      const name = r.rel.split('/').pop();
      if (r.action === 'up') {
        await ensureRemote(r.rel);
        const file = await r.local.handle.getFile();
        enqueueUpload({ fs, path: join(s.base, r.rel), name: r.rel, file, mtime: file.lastModified });
      } else if (r.action === 'down') {
        const dir = await localDirFor(s.dir, r.rel);
        enqueueDownload({ fs, path: r.remote.path, name: r.rel, size: r.remote.size, write: (bytes) => writeLocal(dir, name, bytes) });
      }
    }
  } catch (e) { fail(e); }
}

function pickUpload() {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.style.display = 'none';
  input.onchange = () => { const files = [...input.files]; input.remove(); if (files.length) upload(files).catch(fail); };
  document.body.appendChild(input);
  input.click();
}

async function remoteAction(kind) {
  const sel = state.remote.filter((e) => state.remoteSel.has(e.name));
  try {
    if (kind === 'mkdir') { state.dialog = { title: t('ftp.folderName'), value: '', run: async (name) => { await state.fs.mkdir(join(state.remotePath, name)); await listRemote(); } }; render(); return; }
    if (kind === 'rename' && sel.length === 1) { state.dialog = { title: t('ftp.newName'), value: sel[0].name, run: async (name) => { await state.fs.rename(join(state.remotePath, sel[0].name), join(state.remotePath, name)); await listRemote(); } }; render(); return; }
    if (kind === 'delete' && sel.length) {
      if (!(await Suite.shell.confirm(t('ftp.deleteConfirm', sel.length)))) return;
      for (const e of sel) await deleteRemote(join(state.remotePath, e.name), e.isDir);
      await listRemote();
    }
  } catch (e) { fail(e); await listRemote(); }
}

async function deleteRemote(path, isDir) {
  if (!isDir) { await state.fs.remove(path); return; }
  for (const e of await state.fs.list(path)) await deleteRemote(join(path, e.name), e.isDir);
  await state.fs.rmdir(path);
}

// ---- UI -------------------------------------------------------------------------------------------------------

function QuickConnect() {
  const s = state.site;
  const set = (k) => (e) => { s[k] = e.target.type === 'number' ? Number(e.target.value) : e.target.type === 'checkbox' ? e.target.checked : e.target.value; if (k === 'protocol') { s.port = PORTS[s.protocol]; render(); } };
  return html`<form class="ftp-quick" data-testid="quick-connect" onSubmit=${(e) => { e.preventDefault(); connect({ ...s }); }}>
    <label>${t('ftp.protocol')}<select data-testid="q-protocol" onChange=${set('protocol')}>
      ${['sftp', 'ftps', 'ftpsi', 'ftp'].map((p) => html`<option value=${p} selected=${s.protocol === p}>${t(`ftp.${p}`)}</option>`)}</select></label>
    <label>${t('ftp.host')}<input data-testid="q-host" value=${s.host} required onInput=${set('host')} /></label>
    <label class="ftp-port">${t('ftp.port')}<input type="number" data-testid="q-port" value=${s.port} onInput=${set('port')} /></label>
    <label>${t('ftp.user')}<input data-testid="q-user" value=${s.username} autocomplete="username" onInput=${set('username')} /></label>
    <label>${t('ftp.password')}<input type="password" data-testid="q-password" value=${s.password} autocomplete="current-password" onInput=${set('password')} /></label>
    ${s.protocol === 'sftp' ? html`<label class="ftp-key">${t('ftp.key')}<textarea rows="1" data-testid="q-key" spellcheck="false" onInput=${set('privateKey')}>${s.privateKey}</textarea></label>`
      : s.protocol !== 'ftp' ? html`<label class="ftp-check"><input type="checkbox" checked=${s.insecure} data-testid="q-insecure" onChange=${set('insecure')} /> ${t('ftp.insecure')}</label>` : null}
    <button type="submit" data-testid="q-connect" aria-busy=${state.connecting}>${t('ftp.connect')}</button>
    ${state.fs ? html`<button type="button" class="secondary" data-testid="disconnect" onClick=${disconnect}>${t('ftp.disconnect')}</button>` : null}
    <button type="button" class="secondary outline" data-testid="save-site" onClick=${() => {
      state.dialog = { title: t('ftp.siteName'), value: s.name || s.host, run: async (name) => {
        s.name = name;
        const stored = { ...s, url: `${s.protocol === 'sftp' ? 'sftp' : s.protocol === 'ftp' ? 'ftp' : 'ftps'}://${s.host}:${s.port}` };
        s.id = data.saveConnection(stored);
      } };
      render();
    }}>${t('ftp.saveSite')}</button>
  </form>`;
}

function Sites() {
  return html`<aside class=${`ftp-side suite-drawer ${state.panels ? 'open' : ''}`} data-testid="sidebar">
    <strong>${t('ftp.sites')}</strong>
    <ul class="ftp-sites">${data.connections().map((c) => html`<li data-testid="site">
      <a href="#" onClick=${(e) => { e.preventDefault(); state.panels = false; state.site = { ...c }; connect(c); }}>${c.protocol === 'sftp' ? '🔐' : '🌐'} ${c.name}</a>
      <button class="secondary outline" data-testid="edit-site" onClick=${() => { state.site = { ...c }; render(); }}>✎</button>
      <button class="secondary outline" data-testid="delete-site" onClick=${async () => { if (await Suite.shell.confirm(t('ftp.deleteSite', c.name))) data.deleteConnection(c.id); }}>×</button></li>`)}</ul>
    <${data.Bar} />
    <details><summary>${t('appdata.relay')}</summary><${data.RelayFields} /></details>
  </aside>`;
}

function FileTable({ entries, sel, onOpen, testid, draggable, onDragStartItem }) {
  return html`<div class="ftp-table-wrap"><table class="ftp-table" data-testid=${testid}>
    <thead><tr><th>${t('ftp.name')}</th><th class="num">${t('ftp.size')}</th><th class="ftp-wide">${t('ftp.modified')}</th></tr></thead>
    <tbody>${entries.map((e) => html`<tr class=${sel.has(e.name) ? 'selected' : ''} data-testid="entry" draggable=${draggable}
        onDragStart=${(ev) => onDragStartItem && onDragStartItem(ev, e)}
        onClick=${(ev) => { if (!(ev.ctrlKey || ev.metaKey)) sel.clear(); if (sel.has(e.name) && (ev.ctrlKey || ev.metaKey)) sel.delete(e.name); else sel.add(e.name); render(); }}
        onDblClick=${() => onOpen(e)}>
      <td data-testid="entry-name">${e.isDir ? '📁' : '📄'} ${e.name}</td><td class="num">${e.isDir ? '' : fmtSize(e.size)}</td><td class="ftp-wide">${fmtDate(e.mtime)}</td></tr>`)}</tbody>
  </table></div>`;
}

function LocalPane() {
  const dir = localDir();
  return html`<section class="ftp-pane" data-testid="local"
      onDragOver=${(e) => { if (e.dataTransfer.types.includes('application/x-ftp-remote')) e.preventDefault(); }}
      onDrop=${(e) => { if (e.dataTransfer.types.includes('application/x-ftp-remote')) { e.preventDefault(); download(state.remote.filter((x) => state.remoteSel.has(x.name))).catch(fail); } }}>
    <div class="ftp-pane-head"><strong>${t('ftp.local')}</strong>
      ${hasFolderPicker ? html`<button class="secondary outline" data-testid="choose-folder" onClick=${chooseLocal}>${t('ftp.chooseFolder')}</button>` : null}
      ${dir ? html`<code>${state.localStack.map((d) => d.name).join('/')}</code>` : null}
    </div>
    ${dir ? html`
      <div class="ftp-buttons">
        <button class="secondary outline" data-testid="local-up" disabled=${state.localStack.length < 2} onClick=${() => { state.localStack.pop(); listLocal(); }}>↑</button>
        <button class="secondary outline" data-testid="upload-selected" disabled=${!state.fs || !state.localSel.size} onClick=${() => upload(state.local.filter((x) => state.localSel.has(x.name))).catch(fail)}>${t('ftp.upload')} →</button>
        <button class="secondary outline" title=${t('ftp.refresh')} onClick=${listLocal}>⟳</button>
        <button class="secondary outline" data-testid="compare" disabled=${!state.fs} onClick=${startCompare}>⇄ ${t('ftp.compare')}</button>
      </div>
      <${FileTable} entries=${state.local} sel=${state.localSel} testid="local-list" draggable=${true}
        onDragStartItem=${(ev, e) => { if (!state.localSel.has(e.name)) { state.localSel = new Set([e.name]); } ev.dataTransfer.setData('application/x-ftp-local', e.name); }}
        onOpen=${(e) => { if (e.isDir) { state.localStack.push(e.handle); listLocal(); } else if (state.fs) upload([e]).catch(fail); }} />`
      : html`<p class="ftp-hint">${hasFolderPicker ? '' : t('ftp.noFolder')}</p>
        <button class="secondary" data-testid="upload-files" disabled=${!state.fs} onClick=${pickUpload}>${t('ftp.uploadFiles')}</button>`}
  </section>`;
}

function RemotePane() {
  return html`<section class="ftp-pane" data-testid="remote"
      onDragOver=${(e) => { if ([...e.dataTransfer.types].some((ty) => ty === 'Files' || ty === 'application/x-ftp-local')) e.preventDefault(); }}
      onDrop=${(e) => {
        if (!state.fs) return;
        e.preventDefault();
        if (e.dataTransfer.types.includes('application/x-ftp-local')) upload(state.local.filter((x) => state.localSel.has(x.name))).catch(fail);
        else if (e.dataTransfer.files.length) upload([...e.dataTransfer.files]).catch(fail);
      }}>
    <div class="ftp-pane-head"><strong>${t('ftp.remote')}</strong>
      ${state.fs ? html`<input class="ftp-path" data-testid="remote-path" key=${state.remotePath} defaultValue=${state.remotePath || ''} onKeyDown=${(e) => { if (e.key === 'Enter') listRemote(e.target.value); }} />` : null}
    </div>
    ${state.fs ? html`
      <div class="ftp-buttons">
        <button class="secondary outline" data-testid="remote-up" disabled=${state.remotePath === '/'} onClick=${() => listRemote(parent(state.remotePath))}>↑</button>
        <button class="secondary outline" data-testid="download-selected" disabled=${!state.remoteSel.size} onClick=${() => download(state.remote.filter((x) => state.remoteSel.has(x.name))).catch(fail)}>← ${t('ftp.download')}</button>
        <button class="secondary outline" data-testid="remote-open-with" disabled=${!state.remoteSel.size || state.remote.some((x) => state.remoteSel.has(x.name) && x.isDir)}
          onClick=${() => openWith(state.remote.filter((x) => state.remoteSel.has(x.name)))}>${t('bridge.openWith')}</button>
        <button class="secondary outline" data-testid="remote-mkdir" onClick=${() => remoteAction('mkdir')}>${t('ftp.mkdir')}</button>
        <button class="secondary outline" data-testid="remote-rename" disabled=${state.remoteSel.size !== 1} onClick=${() => remoteAction('rename')}>${t('ftp.rename')}</button>
        <button class="secondary outline" data-testid="remote-delete" disabled=${!state.remoteSel.size} onClick=${() => remoteAction('delete')}>${t('ftp.delete')}</button>
        <button class="secondary outline" title=${t('ftp.refresh')} data-testid="remote-refresh" onClick=${() => listRemote()}>⟳</button>
      </div>
      <${FileTable} entries=${state.remote} sel=${state.remoteSel} testid="remote-list" draggable=${true}
        onDragStartItem=${(ev, e) => { if (!state.remoteSel.has(e.name)) state.remoteSel = new Set([e.name]); ev.dataTransfer.setData('application/x-ftp-remote', e.name); }}
        onOpen=${(e) => (e.isDir ? listRemote(join(state.remotePath, e.name)) : download([e]).catch(fail))} />`
      : html`<p class="ftp-hint" data-testid="not-connected">${state.connecting ? t('ftp.connecting') : t('ftp.notConnected')}</p>`}
  </section>`;
}

function Queue() {
  if (!state.queue.length) return null;
  return html`<section class="ftp-queue" data-testid="queue">
    <div class="ftp-pane-head"><strong>${t('ftp.queue')}</strong>
      <button class="secondary outline" data-testid="clear-done" onClick=${() => { state.queue = state.queue.filter((j) => j.status !== 'done'); render(); }}>${t('ftp.clearDone')}</button></div>
    <ul>${state.queue.map((j) => html`<li data-testid="job" data-status=${j.status}>
      <span>${j.direction === 'up' ? '⬆' : '⬇'} ${j.name}</span>
      <progress value=${j.status === 'done' ? 1 : j.total ? j.done / j.total : 0} max="1"></progress>
      <small>${j.status === 'running' ? `${fmtSize(j.done)}${j.total ? ` / ${fmtSize(j.total)}` : ''}${j.note ? ` · ${j.note}` : ''}` : j.status === 'failed' ? `${t('ftp.failed')}: ${j.error}` : t(`ftp.${j.status}`)}</small>
      ${j.status === 'failed' ? html`<button class="secondary outline ftp-mini" data-testid="job-resume" onClick=${() => resume(j)}>↻ ${t('ftp.resume')}</button>` : null}</li>`)}</ul>
  </section>`;
}

function NameDialog() {
  const d = state.dialog;
  if (!d) return null;
  return html`<dialog open data-testid="name-dialog"><article>
    <form onSubmit=${async (e) => { e.preventDefault(); const v = e.target.elements.name.value.trim(); state.dialog = null; render(); if (v) await d.run(v).catch(fail); render(); }}>
      <label>${d.title}<input name="name" data-testid="name-input" defaultValue=${d.value} autofocus /></label>
      <footer><button type="button" class="secondary" onClick=${() => { state.dialog = null; render(); }}>${t('ftp.cancel')}</button><button type="submit" data-testid="name-ok">${t('ftp.ok')}</button></footer>
    </form>
  </article></dialog>`;
}

function SyncDialog() {
  const s = state.sync;
  if (!s) return null;
  const close = () => { state.sync = null; render(); };
  if (s.busy) return html`<dialog open data-testid="sync-dialog"><article><p aria-busy="true">${t('ftp.comparing')}</p><footer><button class="secondary" onClick=${close}>${t('ftp.cancel')}</button></footer></article></dialog>`;
  const same = s.rows.filter((r) => r.status === 'same').length;
  const shown = s.rows.filter((r) => s.showSame || r.status !== 'same');
  const todo = s.rows.filter((r) => r.action !== 'skip').length;
  const set = (k, v) => { s[k] = v; planSync(); render(); };
  const side = (x) => (x ? html`${fmtSize(x.size)}<br /><small>${fmtDate(x.mtime)}</small>` : '—');
  return html`<dialog open data-testid="sync-dialog" class="ftp-sync"><article>
    <header><strong>${t('ftp.syncTitle', state.localStack.map((d) => d.name).join('/'), s.base)}</strong></header>
    <div class="ftp-sync-options">
      <label>${t('ftp.syncMode')} <select data-testid="sync-mode" onChange=${(e) => set('mode', e.target.value)}>
        ${['both', 'up', 'down'].map((m) => html`<option value=${m} selected=${s.mode === m}>${t(`ftp.mode${m[0].toUpperCase()}${m.slice(1)}`)}</option>`)}</select></label>
      <label class="ftp-check"><input type="checkbox" data-testid="sync-times" checked=${s.useTimes} onChange=${(e) => set('useTimes', e.target.checked)} /> ${t('ftp.useTimes')}</label>
      <label class="ftp-check"><input type="checkbox" data-testid="sync-same" checked=${s.showSame} onChange=${(e) => { s.showSame = e.target.checked; render(); }} /> ${t('ftp.showSame', same)}</label>
    </div>
    ${s.truncated ? html`<p class="ftp-hint">${t('ftp.syncTruncated', SYNC_LIMIT)}</p>` : null}
    ${shown.length ? html`<div class="ftp-table-wrap"><table class="ftp-table" data-testid="sync-table">
      <thead><tr><th>${t('ftp.name')}</th><th class="num">${t('ftp.local')}</th><th class="num">${t('ftp.remote')}</th><th></th><th></th></tr></thead>
      <tbody>${shown.map((r) => html`<tr data-testid="sync-row" data-status=${r.status} data-action=${r.action}>
        <td data-testid="sync-name">${r.rel}</td><td class="num">${side(r.local)}</td><td class="num">${side(r.remote)}</td><td><small>${t(`ftp.st.${r.status}`)}</small></td>
        <td><select data-testid="sync-action" onChange=${(e) => { r.action = e.target.value; render(); }}>
          ${['up', 'down', 'skip'].filter((a) => a === 'skip' || (a === 'up' ? r.local : r.remote)).map((a) => html`<option value=${a} selected=${r.action === a}>${a === 'up' ? '→ ' : a === 'down' ? '← ' : ''}${t(`ftp.act.${a}`)}</option>`)}</select></td></tr>`)}</tbody>
    </table></div>` : null}
    ${!todo ? html`<p data-testid="sync-nothing">${t('ftp.syncNothing')}</p>` : null}
    <footer><button class="secondary" onClick=${close}>${t('ftp.cancel')}</button>
      <button data-testid="sync-run" disabled=${!todo} onClick=${runSync}>${t('ftp.syncRun', todo)}</button></footer>
  </article></dialog>`;
}

function Toolbar() {
  return html`<nav class="ftp-toolbar"><button class="secondary outline ftp-only-phone" data-testid="toggle-panels" onClick=${() => { state.panels = !state.panels; render(); }}>☰ ${t('ftp.sites')}</button></nav>`;
}

function Main() {
  return html`<div class="ftp-layout">
    <${Sites} />${state.panels ? Suite.shell.backdrop(() => { state.panels = false; render(); }) : null}
    <div class="ftp-work"><${QuickConnect} /><div class="ftp-panes"><${LocalPane} /><${RemotePane} /></div><${Queue} /></div>
    <${NameDialog} /><${SyncDialog} /><${data.Dialog} />
  </div>`;
}

Suite.shell.mount({ id: APP, title: 'app.title', version: '%%BUILD_VERSION%%', toolbar: () => html`<${Toolbar} />`, main: () => html`<${Main} />` });
Suite.ssh.load().catch(() => {});

// for tests
window.FTP = { state, data, connect, parseListLine, parseMlsdLine, compareEntry };
document.body.dataset.ready = 'true';
