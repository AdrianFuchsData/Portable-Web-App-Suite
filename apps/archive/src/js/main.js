/*
 * Archive manager: open, browse, extract, create and edit ZIP, TAR, TAR.GZ and GZ archives (formats in archive.js), read 7z,
 * RAR, XZ, BZip2 and further formats and write 7z through libarchive (multi.js).
 */
import { read, write, detect, formatOfName, cleanPath, ArchiveError, addPassword, clearPasswords, locked, encryptionOf } from '@app/archive.js';
import { detectMulti, readMulti, write7z } from '@app/multi.js';

const { html } = Suite.shell;
const t = Suite.t;
const APP = 'archive';
const EXTENSIONS = ['.zip', '.tar', '.tgz', '.gz', '.jar', '.war', '.apk', '.epub', '.docx', '.xlsx', '.pptx', '.odt', '.ods', '.odp', '.whl', '.nupkg', '.vsix',
  '.7z', '.rar', '.xz', '.txz', '.bz2', '.tbz', '.tbz2', '.zst', '.tzst', '.lzma', '.tlz', '.iso', '.cab', '.deb', '.rpm', '.cpio', '.ar', '.xar'];
const FORMATS = { zip: { label: 'ZIP', ext: '.zip' }, '7z': { label: '7Z', ext: '.7z' }, tar: { label: 'TAR', ext: '.tar' }, tgz: { label: 'TAR.GZ', ext: '.tar.gz' }, gz: { label: 'GZ', ext: '.gz' } };
const formatLabel = () => (FORMATS[state.format] ? FORMATS[state.format].label : state.formatLabel || state.format);
const IMAGE = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif' };
const MEDIA = { mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac', m4a: 'audio/mp4', opus: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg' };
const PREVIEW_TEXT_LIMIT = 2 * 1024 * 1024;

Suite.i18n.register({
  en: {
    'app.title': 'Archive manager',
    'ar.new': 'New', 'ar.open': 'Open', 'ar.save': 'Save', 'ar.saveAs': 'Save as', 'ar.addFiles': 'Add files', 'ar.addFolder': 'Add folder',
    'ar.test': 'Test', 'ar.testTitle': 'Test the integrity of all files (decompress and check the CRC)', 'ar.testOk': 'All {0} file(s) are intact.',
    'ar.testFailed': '{0} of {1} file(s) are damaged:', 'ar.testResult': 'Integrity test',
    'ar.newFolder': 'New folder', 'ar.extract': 'Extract', 'ar.extractAll': 'Extract all', 'ar.delete': 'Delete', 'ar.rename': 'Rename', 'ar.up': 'Up',
    'ar.compression': 'Compression', 'ar.level0': 'Store', 'ar.level1': 'Fastest', 'ar.level6': 'Normal', 'ar.level9': 'Maximum',
    'ar.name': 'Name', 'ar.size': 'Size', 'ar.packed': 'Packed', 'ar.modified': 'Modified', 'ar.empty': 'This folder is empty.',
    'ar.welcome': 'Open an archive (ZIP, 7Z, RAR, TAR, TAR.GZ, TAR.XZ, ISO, …) or create a new one. You can also drop an archive or files onto this window.',
    'ar.openArchive': 'Open archive…', 'ar.newArchive': 'New archive', 'ar.recent': 'Recently used',
    'ar.items': '{0} items', 'ar.selected': '{0} selected', 'ar.summary': '{0} · {1} files, {2} folders, {3} unpacked',
    'ar.deleteConfirm': 'Delete {0} item(s) from the archive?', 'ar.replaceConfirm': '{0} already exists in the archive. Replace it?',
    'ar.exists': 'An item named “{0}” already exists.', 'ar.invalidName': 'Invalid name.', 'ar.extracted': '{0} file(s) extracted to “{1}”.',
    'ar.added': '{0} file(s) added.', 'ar.noPreview': 'No preview for this file type.', 'ar.download': 'Download', 'ar.close': 'Close',
    'ar.truncated': 'Only the first 2 MiB are shown.', 'ar.saveAsTitle': 'Save archive as', 'ar.fileName': 'File name', 'ar.format': 'Format',
    'ar.untitled': 'archive', 'ar.discard': 'Discard the unsaved changes of the current archive?', 'ar.newFolderName': 'New folder',
    'ar.unknownFormat': 'This file is not a supported archive (ZIP, 7Z, RAR, TAR, GZ, XZ, BZ2, ISO, …).', 'ar.unsupportedFormat': '{0} archives are not supported.',
    'ar.libarchive': 'The archive cannot be read: {0}', 'ar.7zNames': 'A 7Z archive can only be written with names of plain ASCII characters (“{0}” has others). Save it as ZIP or TAR instead, which keep all names.', 'ar.encryptedUnsupported': 'Encrypted {0} archives cannot be opened (only encrypted ZIP archives are supported).',
    'ar.singleCompressed': 'This {0} file contains no archive (e.g. a TAR archive): single compressed files cannot be opened.', 'ar.cancelled': 'Cancelled.', 'ar.sevenZipHint': '7z archives are written without encryption; folders are taken from the paths.',
    'ar.corrupt': 'The archive is damaged or incomplete.', 'ar.needPassword': '“{0}” is encrypted: a password is needed.', 'ar.wrongPassword': 'Wrong password for “{0}”.',
    'ar.passwordTitle': 'Password', 'ar.passwordPrompt': '“{0}” is encrypted. Enter the password:', 'ar.passwordWrong': 'The password is wrong. Try again:',
    'ar.encryption': 'Encryption', 'ar.encNone': 'none', 'ar.encAes': 'AES-256 (recommended)', 'ar.encZipCrypto': 'ZipCrypto (weak; for Windows Explorer)',
    'ar.password': 'Password', 'ar.passwordRepeat': 'Repeat the password', 'ar.passwordMismatch': 'The passwords do not match.',
    'ar.encryptedWith': '🔒 {0}', 'ar.encryptionHint': 'New and changed files are encrypted; encrypted files stay as they are.',
    'ar.unsupportedMethod': '“{0}” uses an unsupported compression method ({1}).', 'ar.crc': '“{0}” is damaged (checksum error).',
    'ar.tooLarge': 'The archive is too large for the ZIP format without ZIP64 (4 GiB, 65,535 entries).',
    'ar.gzSingle': 'A GZ file contains exactly one file. Choose TAR.GZ or ZIP for several files.', 'ar.link': 'Link → {0}', 'ar.lock': 'encrypted',
    'ar.root': 'Archive root', 'ar.undo': 'Undo', 'ar.redo': 'Redo', 'ar.updated': '“{0}” was updated in the archive. Save the archive to keep the change.',
  },
  de: {
    'app.title': 'Archivmanager',
    'ar.new': 'Neu', 'ar.open': 'Öffnen', 'ar.save': 'Speichern', 'ar.saveAs': 'Speichern unter', 'ar.addFiles': 'Dateien hinzufügen', 'ar.addFolder': 'Ordner hinzufügen',
    'ar.test': 'Testen', 'ar.testTitle': 'Die Unversehrtheit aller Dateien prüfen (entpacken und CRC prüfen)', 'ar.testOk': 'Alle {0} Datei(en) sind in Ordnung.',
    'ar.testFailed': '{0} von {1} Datei(en) sind beschädigt:', 'ar.testResult': 'Integritätstest',
    'ar.newFolder': 'Neuer Ordner', 'ar.extract': 'Entpacken', 'ar.extractAll': 'Alles entpacken', 'ar.delete': 'Löschen', 'ar.rename': 'Umbenennen', 'ar.up': 'Nach oben',
    'ar.compression': 'Kompression', 'ar.level0': 'Speichern', 'ar.level1': 'Schnell', 'ar.level6': 'Normal', 'ar.level9': 'Maximal',
    'ar.name': 'Name', 'ar.size': 'Größe', 'ar.packed': 'Gepackt', 'ar.modified': 'Geändert', 'ar.empty': 'Dieser Ordner ist leer.',
    'ar.welcome': 'Öffnen Sie ein Archiv (ZIP, 7Z, RAR, TAR, TAR.GZ, TAR.XZ, ISO, …) oder legen Sie ein neues an. Sie können ein Archiv oder Dateien auch auf dieses Fenster ziehen.',
    'ar.openArchive': 'Archiv öffnen…', 'ar.newArchive': 'Neues Archiv', 'ar.recent': 'Zuletzt verwendet',
    'ar.items': '{0} Elemente', 'ar.selected': '{0} ausgewählt', 'ar.summary': '{0} · {1} Dateien, {2} Ordner, {3} entpackt',
    'ar.deleteConfirm': '{0} Element(e) aus dem Archiv löschen?', 'ar.replaceConfirm': '{0} ist bereits im Archiv. Ersetzen?',
    'ar.exists': 'Ein Element namens „{0}“ existiert bereits.', 'ar.invalidName': 'Ungültiger Name.', 'ar.extracted': '{0} Datei(en) nach „{1}“ entpackt.',
    'ar.added': '{0} Datei(en) hinzugefügt.', 'ar.noPreview': 'Für diesen Dateityp gibt es keine Vorschau.', 'ar.download': 'Herunterladen', 'ar.close': 'Schließen',
    'ar.truncated': 'Nur die ersten 2 MiB werden angezeigt.', 'ar.saveAsTitle': 'Archiv speichern unter', 'ar.fileName': 'Dateiname', 'ar.format': 'Format',
    'ar.untitled': 'archiv', 'ar.discard': 'Die ungespeicherten Änderungen des aktuellen Archivs verwerfen?', 'ar.newFolderName': 'Neuer Ordner',
    'ar.unknownFormat': 'Diese Datei ist kein unterstütztes Archiv (ZIP, 7Z, RAR, TAR, GZ, XZ, BZ2, ISO, …).', 'ar.unsupportedFormat': '{0}-Archive werden nicht unterstützt.',
    'ar.libarchive': 'Das Archiv kann nicht gelesen werden: {0}', 'ar.7zNames': 'Ein 7Z-Archiv lässt sich nur mit Namen aus einfachen ASCII-Zeichen schreiben („{0}“ enthält andere). Speichern Sie es stattdessen als ZIP oder TAR, die alle Namen erhalten.', 'ar.encryptedUnsupported': 'Verschlüsselte {0}-Archive lassen sich nicht öffnen (unterstützt werden nur verschlüsselte ZIP-Archive).',
    'ar.singleCompressed': 'Diese {0}-Datei enthält kein Archiv (z. B. ein TAR-Archiv): einzelne komprimierte Dateien lassen sich nicht öffnen.', 'ar.cancelled': 'Abgebrochen.', 'ar.sevenZipHint': '7z-Archive werden ohne Verschlüsselung geschrieben; Ordner ergeben sich aus den Pfaden.',
    'ar.corrupt': 'Das Archiv ist beschädigt oder unvollständig.', 'ar.needPassword': '„{0}“ ist verschlüsselt: ein Passwort wird benötigt.', 'ar.wrongPassword': 'Falsches Passwort für „{0}“.',
    'ar.passwordTitle': 'Passwort', 'ar.passwordPrompt': '„{0}“ ist verschlüsselt. Geben Sie das Passwort ein:', 'ar.passwordWrong': 'Das Passwort ist falsch. Bitte erneut versuchen:',
    'ar.encryption': 'Verschlüsselung', 'ar.encNone': 'keine', 'ar.encAes': 'AES-256 (empfohlen)', 'ar.encZipCrypto': 'ZipCrypto (schwach; für den Windows-Explorer)',
    'ar.password': 'Passwort', 'ar.passwordRepeat': 'Passwort wiederholen', 'ar.passwordMismatch': 'Die Passwörter stimmen nicht überein.',
    'ar.encryptedWith': '🔒 {0}', 'ar.encryptionHint': 'Neue und geänderte Dateien werden verschlüsselt; verschlüsselte Dateien bleiben, wie sie sind.',
    'ar.unsupportedMethod': '„{0}“ verwendet ein nicht unterstütztes Kompressionsverfahren ({1}).', 'ar.crc': '„{0}“ ist beschädigt (Prüfsummenfehler).',
    'ar.tooLarge': 'Das Archiv ist für das ZIP-Format ohne ZIP64 zu groß (4 GiB, 65.535 Einträge).',
    'ar.gzSingle': 'Eine GZ-Datei enthält genau eine Datei. Wählen Sie TAR.GZ oder ZIP für mehrere Dateien.', 'ar.link': 'Verknüpfung → {0}', 'ar.lock': 'verschlüsselt',
    'ar.root': 'Archivwurzel', 'ar.undo': 'Rückgängig', 'ar.redo': 'Wiederholen', 'ar.updated': '„{0}“ wurde im Archiv aktualisiert. Speichern Sie das Archiv, um die Änderung zu behalten.',
  },
});

const state = {
  entries: null, name: '', handle: null, format: 'zip', fileSize: 0, dirty: false, level: 6,
  cwd: '', selected: new Set(), anchor: null, sort: { key: 'name', asc: true },
  renaming: null, preview: null, saveAs: null, recent: [], busy: false, test: null, // test: { total, errors: [{ path, message }] }
  encryption: null, passwordPrompt: null, // encryption: { password, method: 'aes' | 'zipcrypto' } of new and changed files
};

// entries are copied shallowly: their load() closures keep the (immutable) data
const history = new Suite.UndoHistory({ clone: (s) => ({ entries: s.entries.map((e) => ({ ...e })), cwd: s.cwd }), onChange: () => render() });
const snapshot = () => ({ entries: state.entries, cwd: state.cwd });
const recordUndo = () => history.record(snapshot());

function restore(snap) {
  if (!snap) return;
  state.entries = snap.entries;
  state.cwd = snap.cwd;
  while (state.cwd && !exists(state.cwd)) state.cwd = parentOf(state.cwd);
  Object.assign(state, { selected: new Set(), anchor: null, renaming: null });
  setDirty();
}
const undo = () => { if (state.entries) restore(history.undo(snapshot())); };
const redo = () => { if (state.entries) restore(history.redo(snapshot())); };

let renderQueued = false;
function render() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; Suite.shell.refresh(); });
}

function describe(e) {
  if (e instanceof ArchiveError) return t(e.key, ...e.args);
  return Suite.i18n.describe(e);
}
const fail = (e) => { console.warn(e); Suite.shell.toast(describe(e), 'error'); };

function setDirty(dirty = true) {
  state.dirty = dirty;
  Suite.shell.setDirty(dirty);
  render();
}

const locale = () => (Suite.i18n.language === 'de' ? 'de-AT' : 'en-GB');
function fmtSize(n) {
  if (n == null) return '';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toLocaleString(locale(), { maximumFractionDigits: i ? 1 : 0 })} ${units[i]}`;
}
const fmtDate = (d) => (d && !isNaN(d) ? d.toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' }) : '');
const join = (...parts) => cleanPath(parts.filter(Boolean).join('/'));
const baseName = (path) => path.split('/').pop();
const parentOf = (path) => path.split('/').slice(0, -1).join('/');
const isUnder = (path, node) => path === node || path.startsWith(`${node}/`);

// ---- loading and saving ---------------------------------------------------------------------------

async function busy(fn) {
  state.busy = true;
  render();
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); // let the busy indicator paint
  try { return await fn(); } finally { state.busy = false; render(); }
}

async function confirmDiscard() {
  return !state.dirty || Suite.shell.confirm(t('ar.discard'));
}

async function load(name, bytes, handle = null, keepHistory = false) {
  // 7z, RAR, XZ, … go through libarchive (extracted completely, a password is asked for encrypted archives)
  const multi = detectMulti(bytes, name);
  const archive = multi ? await readMulti(bytes, name, (wrong) => askPassword(name, wrong)) : read(bytes, name);
  if (!keepHistory) history.clear();
  if (!keepHistory) { clearPasswords(); state.encryption = null; }
  const format = multi ? (archive.kind === '7z' ? '7z' : 'multi') : archive.format;
  Object.assign(state, { entries: archive.entries, format, formatLabel: archive.label || null, name, handle, fileSize: bytes.length, cwd: '', selected: new Set(), anchor: null, renaming: null, preview: null });
  setDirty(false);
}

/** Bytes of the archive in a format (7z through libarchive, the others in archive.js). */
async function encodeArchive(entries, format, options) {
  return format === '7z' ? write7z(entries) : write(entries, format, options);
}

// recovery copies of unsaved work (shared/js/autosave.js); passwords are never stored, encrypted entries stay encrypted
const AUTOSAVE_LIMIT = 64 * 1024 * 1024;
Suite.autosave.register({
  app: APP,
  save: () => {
    if (!state.dirty || !state.entries || state.entries.reduce((n, e) => n + (e.size || 0), 0) > AUTOSAVE_LIMIT) return null;
    // (synchronous formats only: 7z, RAR, … are kept as ZIP)
    const format = ['zip', 'tar', 'tgz', 'gz'].includes(state.format) && (state.format === 'zip' || !state.entries.some((e) => locked(e))) ? state.format : 'zip';
    return { name: state.name, handle: state.handle, format, bytes: write(ordered(), format, { level: 1 }) };
  },
  restore: async (s) => { await load(s.name, s.bytes, s.handle || null); setDirty(true); render(); },
});

// ---- passwords ------------------------------------------------------------------------------------

/** Ask for a password (null when cancelled). */
function askPassword(path, wrong) {
  return new Promise((resolve) => { state.passwordPrompt = { path, wrong, resolve: (v) => { state.passwordPrompt = null; render(); resolve(v); } }; render(); });
}

/**
 * Make sure the encrypted entries among `entries` can be read: ask for passwords until each one opens (false when the
 * user cancels). The first password that works also encrypts files added later (state.encryption).
 */
async function unlock(entries) {
  for (const entry of entries) {
    let wrong = false;
    while (locked(entry)) {
      const pw = await askPassword(entry.path, wrong);
      if (pw == null) return false;
      addPassword(pw);
      wrong = locked(entry);
      if (!wrong && !state.encryption && state.format === 'zip') state.encryption = { password: pw, method: entry.aes ? 'aes' : 'zipcrypto' };
    }
  }
  return true;
}

async function openPicked(picked) {
  const { file, handle } = picked;
  await busy(async () => {
    try {
      await load(file.name, new Uint8Array(await file.arrayBuffer()), handle);
      if (handle) { Suite.files.remember(APP, handle); state.recent = await Suite.files.recent(APP); }
    } catch (e) { fail(e); }
  });
}

async function openArchive() {
  if (!(await confirmDiscard())) return;
  try {
    const picked = await Suite.files.open({ types: [{ description: t('app.title'), accept: { 'application/octet-stream': EXTENSIONS } }] });
    if (picked) await openPicked(picked[0]);
  } catch (e) { fail(e); }
}

async function newArchive() {
  if (!(await confirmDiscard())) return;
  Object.assign(state, { entries: [], format: 'zip', name: `${t('ar.untitled')}.zip`, handle: null, fileSize: 0, cwd: '', selected: new Set(), anchor: null, renaming: null });
  history.clear();
  setDirty(false);
}

function report(result) { if (result.mode === 'downloaded') Suite.shell.banner(result.message); else Suite.shell.toast(result.message); }

/** Entries sorted so that parents come before their contents. */
function ordered() {
  return state.entries.slice().sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

async function save({ as = false, name = state.name, format = state.format } = {}) {
  if (!state.entries) return;
  if (!FORMATS[format]) { openSaveAs(); return; } // RAR, XZ, … can only be read: save in another format
  await busy(async () => {
    try {
      if (format !== 'zip' && !(await unlock(state.entries))) return;
      const bytes = await encodeArchive(ordered(), format, { level: state.level, encryption: format === 'zip' ? state.encryption : null });
      const types = [{ description: FORMATS[format].label, accept: { 'application/octet-stream': [FORMATS[format].ext] } }];
      const result = as || !state.handle && !state.fileSize ? await Suite.files.saveAs(bytes, { suggestedName: name, types })
        : await Suite.files.save({ name, handle: state.handle }, bytes);
      if (!result) return;
      report(result);
      const cwd = state.cwd;
      await load(result.name || name, bytes, result.handle || state.handle, true); // continue with what was written
      state.format = format;
      if (state.entries.some((e) => isUnder(e.path, cwd))) state.cwd = cwd;
    } catch (e) { fail(e); }
  });
}

function openSaveAs() {
  const stem = state.name.replace(/(\.tar)?\.[^.]+$/i, '') || t('ar.untitled');
  state.saveAs = { stem, format: FORMATS[state.format] ? state.format : state.format === 'multi' ? '7z' : 'zip', encryption: state.encryption ? state.encryption.method : 'none', password: state.encryption ? state.encryption.password : '', repeat: state.encryption ? state.encryption.password : '' };
  render();
}

// ---- tree -----------------------------------------------------------------------------------------

/** Children of a folder: explicit entries and folders implied by deeper paths. */
function children(dir) {
  const prefix = dir ? `${dir}/` : '';
  const map = new Map();
  for (const e of state.entries) {
    if (dir && !e.path.startsWith(prefix)) continue;
    const rest = e.path.slice(prefix.length);
    if (!rest) continue;
    const slash = rest.indexOf('/');
    const name = slash < 0 ? rest : rest.slice(0, slash);
    const path = prefix + name;
    let node = map.get(name);
    if (!node) { node = { name, path, dir: slash >= 0 || e.dir, size: 0, csize: 0, mtime: null, files: 0 }; map.set(name, node); }
    if (slash < 0) { node.entry = e; node.dir = e.dir; node.mtime = e.mtime; }
    if (!e.dir) { node.size += e.size || 0; node.csize += e.csize || 0; node.files += 1; }
    if (slash >= 0) node.dir = true;
  }
  const list = [...map.values()];
  const { key, asc } = state.sort;
  const val = (n) => (key === 'name' ? n.name.toLowerCase() : key === 'mtime' ? (n.mtime ? +n.mtime : 0) : n[key] || 0);
  list.sort((a, b) => (a.dir !== b.dir ? (a.dir ? -1 : 1) : (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * (asc ? 1 : -1)));
  return list;
}

const exists = (path) => state.entries.some((e) => isUnder(e.path, path));
const entriesUnder = (node) => state.entries.filter((e) => isUnder(e.path, node));

function cd(path) {
  state.cwd = path;
  state.selected = new Set();
  state.anchor = null;
  state.renaming = null;
  render();
}

// ---- editing --------------------------------------------------------------------------------------

/** Ensure explicit folder entries for every parent of path (so that empty folders and tar archives keep them). */
function ensureFolders(path) {
  for (let p = parentOf(path); p; p = parentOf(p)) {
    if (!state.entries.some((e) => e.path === p && e.dir)) state.entries.push({ path: p, dir: true, size: 0, csize: 0, mtime: new Date(), mode: 0o755, modified: true });
  }
}

/** files: [{ file, path }] with paths relative to the current folder; folders: extra (possibly empty) folder paths. */
async function addFiles(files, folders = []) {
  if (!state.entries) { state.entries = []; state.name = `${t('ar.untitled')}.zip`; state.format = 'zip'; state.fileSize = 0; }
  let replaceAll = null;
  let added = 0;
  recordUndo();
  for (const dir of folders) {
    const path = join(state.cwd, dir);
    if (path && !state.entries.some((e) => e.path === path)) { state.entries.push({ path, dir: true, size: 0, csize: 0, mtime: new Date(), mode: 0o755, modified: true }); ensureFolders(path); }
  }
  for (const { file, path: rel } of files) {
    const path = join(state.cwd, rel);
    if (!path) continue;
    const existing = state.entries.find((e) => e.path === path);
    if (existing) {
      if (existing.dir) { Suite.shell.toast(t('ar.exists', path), 'error'); continue; }
      if (replaceAll === null) replaceAll = await Suite.shell.confirm(t('ar.replaceConfirm', path));
      if (!replaceAll) continue;
      state.entries.splice(state.entries.indexOf(existing), 1);
    }
    const data = new Uint8Array(await file.arrayBuffer());
    state.entries.push({ path, dir: false, size: data.length, csize: null, mtime: new Date(file.lastModified || Date.now()), mode: 0o644, modified: true, load: () => data });
    ensureFolders(path);
    added++;
  }
  if (added) Suite.shell.toast(t('ar.added', added));
  else if (!folders.length) { history.drop(); return; }
  setDirty();
}

function pickFiles(folder) {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  if (folder) input.webkitdirectory = true;
  input.style.display = 'none';
  input.addEventListener('change', () => {
    const files = [...input.files].map((file) => ({ file, path: file.webkitRelativePath || file.name }));
    input.remove();
    if (files.length) addFiles(files).catch(fail);
  });
  input.addEventListener('cancel', () => input.remove());
  document.body.appendChild(input);
  input.click();
}

function newFolder() {
  if (!state.entries) return;
  let name = t('ar.newFolderName');
  for (let i = 2; exists(join(state.cwd, name)); i++) name = `${t('ar.newFolderName')} ${i}`;
  const path = join(state.cwd, name);
  recordUndo();
  state.entries.push({ path, dir: true, size: 0, csize: 0, mtime: new Date(), mode: 0o755, modified: true });
  state.selected = new Set([path]);
  state.renaming = path;
  setDirty();
}

function rename(node, newName) {
  if (state.renaming !== node) return; // Enter submits, then the removed input fires blur
  state.renaming = null;
  newName = newName.trim();
  if (!newName || newName === baseName(node)) { render(); return; }
  if (/[/\\]/.test(newName) || newName === '.' || newName === '..') { Suite.shell.toast(t('ar.invalidName'), 'error'); render(); return; }
  const target = join(parentOf(node), newName);
  if (exists(target)) { Suite.shell.toast(t('ar.exists', newName), 'error'); render(); return; }
  recordUndo();
  for (const e of entriesUnder(node)) e.path = target + e.path.slice(node.length);
  state.selected = new Set([target]);
  setDirty();
}

async function deleteSelected() {
  const nodes = [...state.selected];
  if (!nodes.length || !(await Suite.shell.confirm(t('ar.deleteConfirm', nodes.length)))) return;
  recordUndo();
  state.entries = state.entries.filter((e) => !nodes.some((n) => isUnder(e.path, n)));
  // keep the folder that we are in
  if (state.cwd && !exists(state.cwd)) state.entries.push({ path: state.cwd, dir: true, size: 0, csize: 0, mtime: new Date(), mode: 0o755, modified: true });
  state.selected = new Set();
  setDirty();
}

// ---- extracting -----------------------------------------------------------------------------------

/** Files (and empty folders) below the selection (or the whole current folder), relative to the current folder. */
function extraction(nodes) {
  const prefix = state.cwd ? `${state.cwd}/` : '';
  const roots = nodes.length ? nodes : children(state.cwd).map((n) => n.path);
  const list = state.entries.filter((e) => roots.some((r) => isUnder(e.path, r)) && !(e.link && !e.load));
  return list.map((e) => ({ entry: e, rel: e.path.slice(prefix.length) }));
}

async function extract(all = false) {
  if (!state.entries) return;
  const items = extraction(all ? [] : [...state.selected]);
  const files = items.filter((i) => !i.entry.dir);
  if (!files.length) return;
  if (!(await unlock(files.map((i) => i.entry)))) return;
  try {
    if (files.length === 1 && items.length === 1) {
      Suite.files.download(files[0].entry.load(), baseName(files[0].rel));
      return;
    }
    if (typeof window.showDirectoryPicker === 'function' && window.isSecureContext) {
      let dir;
      try { dir = await window.showDirectoryPicker({ mode: 'readwrite' }); } catch (e) { if (e && e.name === 'AbortError') return; throw e; }
      await busy(async () => {
        let count = 0;
        const errors = [];
        for (const { entry, rel } of items) {
          try {
            const parts = rel.split('/');
            let target = dir;
            for (const part of entry.dir ? parts : parts.slice(0, -1)) target = await target.getDirectoryHandle(part, { create: true });
            if (entry.dir || entry.link) continue;
            const handle = await target.getFileHandle(parts[parts.length - 1], { create: true });
            const writable = await handle.createWritable();
            await writable.write(entry.load());
            await writable.close();
            count++;
          } catch (e) { errors.push(describe(e)); }
        }
        Suite.shell.toast(t('ar.extracted', count, dir.name));
        if (errors.length) Suite.shell.toast(errors.slice(0, 3).join('\n'), 'error');
      });
      return;
    }
    // without a folder picker (Firefox, Android): one ZIP download with the selected files
    await busy(async () => {
      const copies = items.map(({ entry, rel }) => ({ ...entry, path: rel, modified: entry.modified || !entry.zip }));
      const name = items.length === 1 || !state.selected.size ? (state.selected.size === 1 ? baseName([...state.selected][0]) : baseName(state.cwd) || state.name.replace(/(\.tar)?\.[^.]+$/i, '')) : `${state.name.replace(/(\.tar)?\.[^.]+$/i, '')}-${t('ar.extract').toLowerCase()}`;
      Suite.files.download(write(copies.sort((a, b) => (a.path < b.path ? -1 : 1)), 'zip', { level: state.level }), `${name}.zip`, 'application/zip');
    });
  } catch (e) { fail(e); }
}

/** Decompress every file (checks the CRC of ZIP entries, the gzip trailer, the tar structure) and report damaged ones. */
async function testArchive() {
  if (!state.entries) return;
  const files = state.entries.filter((e) => !e.dir && e.load && !e.link);
  if (!(await unlock(files))) return;
  await busy(async () => {
    const errors = [];
    let last = performance.now();
    for (const entry of files) {
      try { entry.load(); } catch (e) { errors.push({ path: entry.path, message: describe(e) }); }
      if (performance.now() - last > 50) { await new Promise((r) => setTimeout(r, 0)); last = performance.now(); } // keep the page responsive
    }
    state.test = { total: files.length, errors };
  });
}

function TestDialog() {
  const r = state.test;
  if (!r) return null;
  const close = () => { state.test = null; render(); };
  return html`<dialog open data-testid="test-dialog"><article>
    <header><strong>${t('ar.testResult')}</strong></header>
    ${r.errors.length ? html`<p data-testid="test-summary" class="ar-test-bad">✗ ${t('ar.testFailed', r.errors.length, r.total)}</p>
      <ul class="ar-test-errors">${r.errors.map((e) => html`<li data-testid="test-error"><code>${e.path}</code>: ${e.message}</li>`)}</ul>`
      : html`<p data-testid="test-summary" class="ar-test-ok">✓ ${t('ar.testOk', r.total)}</p>`}
    <footer><button data-testid="test-close" onClick=${close}>${t('ar.close')}</button></footer>
  </article></dialog>`;
}

// ---- preview --------------------------------------------------------------------------------------

function closePreview() {
  if (state.preview && state.preview.url) URL.revokeObjectURL(state.preview.url);
  state.preview = null;
  render();
}

async function preview(node) {
  const entry = node.entry;
  if (!entry || entry.dir) return;
  if (!(await unlock([entry]))) return;
  try {
    const ext = (node.name.split('.').pop() || '').toLowerCase();
    const data = entry.load();
    const p = { path: node.path, name: node.name, entry, size: data.length };
    if (entry.link) {
      p.kind = 'text'; p.text = t('ar.link', entry.linkTarget());
    } else if (IMAGE[ext]) {
      p.kind = 'image'; p.url = URL.createObjectURL(new Blob([data], { type: IMAGE[ext] }));
    } else if (MEDIA[ext]) {
      p.kind = MEDIA[ext].startsWith('audio') ? 'audio' : 'video'; p.url = URL.createObjectURL(new Blob([data], { type: MEDIA[ext] }));
    } else {
      const head = data.subarray(0, PREVIEW_TEXT_LIMIT);
      const sample = head.subarray(0, 8192);
      if (!sample.includes(0)) {
        p.kind = 'text';
        p.text = new TextDecoder().decode(head);
        p.truncated = data.length > PREVIEW_TEXT_LIMIT;
      } else p.kind = 'none';
    }
    state.preview = p;
    render();
  } catch (e) { fail(e); }
}

/**
 * "Open with…": edit files of the archive in another app; saving there writes them back into the archive. Several
 * files are offered to the apps with tabs (text and hex editor), which open all of them in one window.
 */
async function openWith(entries) {
  entries = [].concat(entries).filter((e) => e && !e.dir && !e.link);
  if (!entries.length || !(await unlock(entries))) return;
  const items = entries.map((entry) => {
    const path = entry.path;
    return {
      name: baseName(path),
      data: () => entry.load(),
      save: async (bytes) => {
        if (!state.entries) throw new Error(t('ar.discard'));
        recordUndo();
        let target = state.entries.find((e) => e.path === path && !e.dir);
        if (!target) { target = { path, dir: false, mode: 0o644 }; state.entries.push(target); ensureFolders(path); }
        Object.assign(target, { size: bytes.length, csize: null, mtime: new Date(), modified: true, encrypted: false, load: () => bytes });
        setDirty();
        Suite.shell.toast(t('ar.updated', baseName(path)));
      },
    };
  });
  Suite.bridge.openWithMany(items, { exclude: APP, source: state.name });
}

function openNode(node) {
  if (node.dir) cd(node.path);
  else preview(node);
}

// ---- selection ------------------------------------------------------------------------------------

const coarse = window.matchMedia('(pointer: coarse)');

function clickRow(e, node, list) {
  if (state.renaming) return;
  if (coarse.matches && !e.ctrlKey && !e.shiftKey) { openNode(node); return; }
  if (e.shiftKey && state.anchor) {
    const a = list.findIndex((n) => n.path === state.anchor);
    const b = list.findIndex((n) => n.path === node.path);
    if (a >= 0 && b >= 0) state.selected = new Set(list.slice(Math.min(a, b), Math.max(a, b) + 1).map((n) => n.path));
  } else if (e.ctrlKey || e.metaKey) {
    if (state.selected.has(node.path)) state.selected.delete(node.path); else state.selected.add(node.path);
    state.anchor = node.path;
  } else {
    state.selected = new Set([node.path]);
    state.anchor = node.path;
  }
  render();
}

function toggle(node) {
  if (state.selected.has(node.path)) state.selected.delete(node.path); else state.selected.add(node.path);
  state.anchor = node.path;
  render();
}

// ---- drag & drop ----------------------------------------------------------------------------------

async function readDropped(dataTransfer) {
  const files = [];
  const folders = [];
  const entries = [...dataTransfer.items].map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null));
  if (!entries.some(Boolean)) return { files: [...dataTransfer.files].map((file) => ({ file, path: file.name })), folders };
  const walk = async (entry, path) => {
    if (!entry) return;
    if (entry.isFile) {
      files.push({ file: await new Promise((res, rej) => entry.file(res, rej)), path });
    } else if (entry.isDirectory) {
      folders.push(path);
      const reader = entry.createReader();
      for (;;) {
        const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const child of batch) await walk(child, `${path}/${child.name}`);
      }
    }
  };
  for (const entry of entries) await walk(entry, entry ? entry.name : '');
  return { files, folders };
}

document.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
document.addEventListener('drop', async (e) => {
  if (!e.dataTransfer || !e.dataTransfer.files.length) return;
  e.preventDefault();
  const handles = typeof DataTransferItem !== 'undefined' && 'getAsFileSystemHandle' in DataTransferItem.prototype ? [...e.dataTransfer.items].map((i) => i.getAsFileSystemHandle()) : [];
  const { files, folders } = await readDropped(e.dataTransfer);
  if (!state.entries && files.length === 1 && !folders.length) {
    // dropping a single archive while nothing is open opens it
    const bytes = new Uint8Array(await files[0].file.slice(0, 512).arrayBuffer());
    let isArchive = true;
    try { detect(bytes, files[0].file.name); } catch (err) { isArchive = !!detectMulti(bytes, files[0].file.name) || EXTENSIONS.some((x) => files[0].file.name.toLowerCase().endsWith(x)); }
    if (isArchive) {
      const handle = handles.length ? await handles[0].catch(() => null) : null;
      await openPicked({ file: files[0].file, handle: handle && handle.kind === 'file' ? handle : null });
      return;
    }
  }
  await addFiles(files, folders).catch(fail);
});

// ---- UI -------------------------------------------------------------------------------------------

/** The selected entries if all of them are files (not folders or links), else null. */
function selectedFiles() {
  if (!state.selected.size) return null;
  const files = [...state.selected].map((path) => state.entries.find((e) => e.path === path && !e.dir && !e.link));
  return files.every(Boolean) ? files : null;
}

function Toolbar() {
  const open = !!state.entries;
  const sel = state.selected.size;
  return html`<nav class="ar-toolbar" role="toolbar">
    <button class="secondary" data-testid="new" onClick=${newArchive}>${t('ar.new')}</button>
    <button class="secondary" data-testid="open" onClick=${openArchive}>${t('ar.open')}</button>
    ${open ? html`
      <button class=${state.dirty ? '' : 'secondary'} data-testid="save" onClick=${() => save()}>${t('ar.save')}</button>
      <button class="secondary outline" data-testid="save-as" onClick=${openSaveAs}>${t('ar.saveAs')}</button>
      <button class="secondary outline" title="${t('ar.undo')} (Ctrl+Z)" data-testid="undo" disabled=${!history.canUndo} onClick=${undo}>↶</button>
      <button class="secondary outline" title="${t('ar.redo')} (Ctrl+Y)" data-testid="redo" disabled=${!history.canRedo} onClick=${redo}>↷</button>
      <span class="ar-sep"></span>
      <button class="secondary outline" data-testid="add-files" onClick=${() => pickFiles(false)}>+ ${t('ar.addFiles')}</button>
      <button class="secondary outline" data-testid="add-folder" onClick=${() => pickFiles(true)}>+ ${t('ar.addFolder')}</button>
      <button class="secondary outline" data-testid="new-folder" onClick=${newFolder}>📁 ${t('ar.newFolder')}</button>
      <span class="ar-sep"></span>
      <button class="secondary outline" data-testid="extract" disabled=${!sel} onClick=${() => extract(false)}>${t('ar.extract')}</button>
      <button class="secondary outline" data-testid="extract-all" onClick=${() => extract(true)}>${t('ar.extractAll')}</button>
      <button class="secondary outline" data-testid="test" title=${t('ar.testTitle')} onClick=${testArchive}>✓ ${t('ar.test')}</button>
      <button class="secondary outline" data-testid="open-with" disabled=${!selectedFiles()} onClick=${() => openWith(selectedFiles())}>${t('bridge.openWith')}</button>
      <button class="secondary outline" data-testid="rename" disabled=${sel !== 1} onClick=${() => { state.renaming = [...state.selected][0]; render(); }}>${t('ar.rename')}</button>
      <button class="secondary outline" data-testid="delete" disabled=${!sel} onClick=${deleteSelected}>${t('ar.delete')}</button>` : null}
  </nav>`;
}

function Breadcrumbs() {
  const parts = state.cwd ? state.cwd.split('/') : [];
  return html`<div class="ar-path" data-testid="path">
    <button class="secondary outline" data-testid="up" disabled=${!state.cwd} title=${t('ar.up')} onClick=${() => cd(parentOf(state.cwd))}>↑</button>
    <a href="#" data-testid="crumb" onClick=${(e) => { e.preventDefault(); cd(''); }} title=${t('ar.root')}>📦 ${state.name}</a>
    ${parts.map((p, i) => html`<span class="ar-crumb-sep">›</span><a href="#" data-testid="crumb" onClick=${(e) => { e.preventDefault(); cd(parts.slice(0, i + 1).join('/')); }}>${p}</a>`)}
  </div>`;
}

function SortHeader({ k, label, cls }) {
  const active = state.sort.key === k;
  return html`<th class=${cls} onClick=${() => { state.sort = { key: k, asc: active ? !state.sort.asc : true }; render(); }} aria-sort=${active ? (state.sort.asc ? 'ascending' : 'descending') : 'none'}>
    ${label}${active ? (state.sort.asc ? ' ▲' : ' ▼') : ''}</th>`;
}

function Listing() {
  const list = children(state.cwd);
  const allSelected = list.length && list.every((n) => state.selected.has(n.path));
  return html`<div class="ar-list" data-testid="list">
    ${list.length ? html`<table class="ar-table">
      <thead><tr>
        <th class="ar-check"><input type="checkbox" aria-label="all" checked=${allSelected} data-testid="select-all"
          onChange=${(e) => { state.selected = e.target.checked ? new Set(list.map((n) => n.path)) : new Set(); render(); }} /></th>
        <${SortHeader} k="name" label=${t('ar.name')} />
        <${SortHeader} k="size" label=${t('ar.size')} cls="ar-num" />
        <${SortHeader} k="csize" label=${t('ar.packed')} cls="ar-num ar-wide" />
        <${SortHeader} k="mtime" label=${t('ar.modified')} cls="ar-wide" />
      </tr></thead>
      <tbody>${list.map((node) => html`<tr key=${node.path} class=${state.selected.has(node.path) ? 'selected' : ''} data-testid="row" data-path=${node.path}
          onClick=${(e) => clickRow(e, node, list)} onDblClick=${() => !state.renaming && openNode(node)}>
        <td class="ar-check" onClick=${(e) => e.stopPropagation()}><input type="checkbox" checked=${state.selected.has(node.path)} data-testid="select" onChange=${() => toggle(node)} /></td>
        <td class="ar-name">${state.renaming === node.path
          ? html`<form onSubmit=${(e) => { e.preventDefault(); rename(node.path, e.target.elements.name.value); }}>
              <input name="name" data-testid="rename-input" defaultValue=${node.name} autofocus onClick=${(e) => e.stopPropagation()}
                onKeyDown=${(e) => { if (e.key === 'Escape') { state.renaming = null; render(); } }} onBlur=${(e) => rename(node.path, e.target.value)} /></form>`
          : html`<span class="ar-icon">${node.dir ? '📁' : node.entry && node.entry.link ? '🔗' : '📄'}</span><span data-testid="name">${node.name}</span>${node.entry && node.entry.encrypted ? html` <small title=${`${t('ar.lock')}: ${encryptionOf(node.entry)}`} data-testid="lock">🔒</small>` : null}`}</td>
        <td class="ar-num">${node.dir ? t('ar.items', children(node.path).length) : fmtSize(node.size)}</td>
        <td class="ar-num ar-wide">${node.dir || node.csize == null || !node.entry || node.entry.csize == null ? '' : fmtSize(node.csize)}</td>
        <td class="ar-wide">${fmtDate(node.mtime)}</td>
      </tr>`)}</tbody>
    </table>` : html`<p class="ar-empty" data-testid="empty">${t('ar.empty')}</p>`}
  </div>`;
}

function StatusBar() {
  const files = state.entries.filter((e) => !e.dir);
  const folders = new Set();
  for (const e of state.entries) for (let p = e.dir ? e.path : parentOf(e.path); p; p = parentOf(p)) folders.add(p);
  const total = files.reduce((n, e) => n + (e.size || 0), 0);
  return html`<footer class="ar-status" data-testid="status">
    <span>${t('ar.summary', formatLabel(), files.length, folders.size, fmtSize(total))}${state.fileSize ? ` · ${fmtSize(state.fileSize)}` : ''}</span>
    ${state.selected.size ? html`<span data-testid="selection">${t('ar.selected', state.selected.size)}</span>` : null}
    ${state.format === 'zip' && state.encryption ? html`<span data-testid="encryption">${t('ar.encryptedWith', state.encryption.method === 'aes' ? 'AES-256' : 'ZipCrypto')}</span>` : null}
    ${state.format === 'zip' || state.format === 'tgz' || state.format === 'gz' ? html`<label class="ar-level">${t('ar.compression')}
        <select data-testid="level" value=${state.level} onChange=${(e) => { state.level = +e.target.value; render(); }}>
          ${[0, 1, 6, 9].filter((l) => l || state.format === 'zip').map((l) => html`<option value=${l} selected=${state.level === l}>${t(`ar.level${l}`)}</option>`)}
        </select></label>` : null}
  </footer>`;
}

function PreviewDialog() {
  const p = state.preview;
  if (!p) return null;
  return html`<dialog open data-testid="preview" onClick=${(e) => { if (e.target.tagName === 'DIALOG') closePreview(); }}><article class="ar-preview">
    <header><strong>${p.name}</strong> <small>${fmtSize(p.size)}</small></header>
    ${p.kind === 'image' ? html`<img src=${p.url} alt=${p.name} data-testid="preview-image" />`
      : p.kind === 'audio' ? html`<audio controls src=${p.url}></audio>`
      : p.kind === 'video' ? html`<video controls src=${p.url}></video>`
      : p.kind === 'text' ? html`<pre data-testid="preview-text">${p.text}</pre>${p.truncated ? html`<small>${t('ar.truncated')}</small>` : null}`
      : html`<p data-testid="preview-none">${t('ar.noPreview')}</p>`}
    <footer>
      <button class="secondary" data-testid="preview-close" onClick=${closePreview}>${t('ar.close')}</button>
      ${p.entry.link ? null : html`<button class="secondary outline" data-testid="preview-open-with" onClick=${() => openWith(p.entry)}>${t('bridge.openWith')}</button>`}
      ${p.entry.link ? null : html`<button data-testid="preview-download" onClick=${() => { try { Suite.files.download(p.entry.load(), p.name); } catch (e) { fail(e); } }}>${t('ar.download')}</button>`}
    </footer>
  </article></dialog>`;
}

function SaveAsDialog() {
  const s = state.saveAs;
  if (!s) return null;
  return html`<dialog open data-testid="save-as-dialog"><article>
    <header><strong>${t('ar.saveAsTitle')}</strong></header>
    <form onSubmit=${(e) => {
      e.preventDefault();
      const encrypt = s.format === 'zip' && s.encryption !== 'none';
      if (encrypt && (!s.password || s.password !== s.repeat)) { s.error = t('ar.passwordMismatch'); render(); return; }
      if (s.format === 'zip') state.encryption = encrypt ? { password: s.password, method: s.encryption, all: true } : null;
      state.saveAs = null;
      save({ as: true, name: `${s.stem}${FORMATS[s.format].ext}`, format: s.format });
    }}>
      <label>${t('ar.fileName')}<input data-testid="save-as-name" value=${s.stem} onInput=${(e) => { s.stem = e.target.value; }} /></label>
      <label>${t('ar.format')}<select data-testid="save-as-format" onChange=${(e) => { s.format = e.target.value; render(); }}>
        ${Object.entries(FORMATS).map(([k, f]) => html`<option value=${k} selected=${s.format === k}>${f.label} (${f.ext})</option>`)}</select></label>
      ${s.format === 'zip' ? html`<label>${t('ar.encryption')}<select data-testid="save-as-encryption" onChange=${(e) => { s.encryption = e.target.value; render(); }}>
          ${[['none', 'ar.encNone'], ['aes', 'ar.encAes'], ['zipcrypto', 'ar.encZipCrypto']].map(([v, k]) => html`<option value=${v} selected=${s.encryption === v}>${t(k)}</option>`)}</select></label>
        ${s.encryption !== 'none' ? html`<label>${t('ar.password')}<input type="password" autocomplete="new-password" data-testid="save-as-password" value=${s.password} onInput=${(e) => { s.password = e.target.value; }} /></label>
          <label>${t('ar.passwordRepeat')}<input type="password" autocomplete="new-password" data-testid="save-as-password2" value=${s.repeat} onInput=${(e) => { s.repeat = e.target.value; }} /></label>
          <small>${t('ar.encryptionHint')}</small>` : null}
        ${s.error ? html`<p class="ar-error" data-testid="save-as-error">${s.error}</p>` : null}` : null}
      ${s.format === '7z' ? html`<small data-testid="save-as-7z-hint">${t('ar.sevenZipHint')}</small>` : null}
      <footer>
        <button type="button" class="secondary" onClick=${() => { state.saveAs = null; render(); }}>${t('ar.close')}</button>
        <button type="submit" data-testid="save-as-ok">${t('ar.saveAs')}</button>
      </footer>
    </form>
  </article></dialog>`;
}

function PasswordDialog() {
  const p = state.passwordPrompt;
  if (!p) return null;
  return html`<dialog open data-testid="password-dialog"><article>
    <header><strong>${t('ar.passwordTitle')}</strong></header>
    <form onSubmit=${(e) => { e.preventDefault(); p.resolve(e.target.elements.password.value); }}>
      <p>${p.wrong ? t('ar.passwordWrong') : t('ar.passwordPrompt', p.path)}</p>
      <input type="password" name="password" data-testid="password" autocomplete="off" autofocus />
      <footer><button type="button" class="secondary" data-testid="password-cancel" onClick=${() => p.resolve(null)}>${t('ar.close')}</button>
        <button type="submit" data-testid="password-ok">OK</button></footer>
    </form></article></dialog>`;
}

function Welcome() {
  return html`<div class="ar-welcome" data-testid="welcome">
    <p>${t('ar.welcome')}</p>
    <div class="ar-buttons">
      <button data-testid="welcome-open" onClick=${openArchive}>${t('ar.openArchive')}</button>
      <button class="secondary" data-testid="welcome-new" onClick=${newArchive}>${t('ar.newArchive')}</button>
    </div>
    ${state.recent.length ? html`<h3>${t('ar.recent')}</h3><ul>${state.recent.map((r) => html`<li><a href="#" onClick=${async (e) => {
      e.preventDefault();
      const picked = await Suite.files.reopen(r.handle);
      if (picked) openPicked(picked);
    }}>${r.name}</a></li>`)}</ul>` : null}
  </div>`;
}

function Main() {
  return html`<div class="ar-main" aria-busy=${state.busy}>
    ${state.entries ? html`<${Breadcrumbs} /><${Listing} /><${StatusBar} />` : html`<${Welcome} />`}
    <${PreviewDialog} /><${SaveAsDialog} /><${PasswordDialog} /><${TestDialog} />
  </div>`;
}

Suite.shell.mount({ id: APP, title: 'app.title', version: '%%BUILD_VERSION%%', toolbar: () => html`<${Toolbar} />`, main: () => html`<${Main} />` });

document.addEventListener('keydown', (e) => {
  const el = document.activeElement;
  // text fields keep their keys; the selection checkboxes of the list do not
  const inField = !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !(el.type === 'checkbox' && el.dataset.testid === 'select');
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (mod && k === 's') { e.preventDefault(); if (e.shiftKey) openSaveAs(); else save(); return; }
  if (mod && k === 'o') { e.preventDefault(); openArchive(); return; }
  if (inField || !state.entries || state.preview || state.saveAs || state.passwordPrompt) { if (e.key === 'Escape' && state.preview) closePreview(); return; }
  const step = Suite.UndoHistory.key(e);
  if (step) { e.preventDefault(); if (step === 'undo') undo(); else redo(); return; }
  if (mod && k === 'a') { e.preventDefault(); state.selected = new Set(children(state.cwd).map((n) => n.path)); render(); }
  else if (e.key === 'Delete') deleteSelected();
  else if (e.key === 'F2' && state.selected.size === 1) { state.renaming = [...state.selected][0]; render(); }
  else if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowUp')) { if (state.cwd) { e.preventDefault(); cd(parentOf(state.cwd)); } }
  else if (e.key === 'Enter' && state.selected.size === 1) {
    const node = children(state.cwd).find((n) => n.path === [...state.selected][0]);
    if (node) openNode(node);
  }
});

Suite.files.recent(APP).then((r) => { state.recent = r; render(); });

Suite.bridge.receive((picked) => openPicked(picked), { app: 'archive' }); // files opened from other apps ("Open with…")

// for tests
window.AR = { app: { state, history, undo, redo, load: (name, bytes) => load(name, new Uint8Array(bytes)), save, addFiles, write, read, readMulti, write7z, addPassword } };
document.body.dataset.ready = 'true';
