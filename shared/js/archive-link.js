/*
 * Files in archives for every app: Suite.files.open() and Suite.files.saveAs() ask whether to use the file system or an
 * archive (setting suite.files.archives, on by default). Archives are opened, created and edited by the archive manager
 * (apps/archive); an app is connected to an archive manager by a link (a MessagePort), so the other apps need no archive
 * code. A file opened from or saved into an archive gets a file handle stand-in that reads and writes through the link
 * ("Save" writes into the archive). The notebook mounts whole archives through the same link (step "mount").
 * The Python notebook answers the same requests for its Pyodide file system (info.kind 'python'): files can be opened from
 * and saved into it like into an archive; it lives only in memory (gone when the page closes or Python restarts).
 *
 *   const target = await Suite.archiveLink.choose('save', name);   // null | { kind: 'fs' } | { kind: 'archive', target }
 *   const link = await Suite.archiveLink.connect(target, { mode: 'save', name });   // -> { link, paths } or null (cancelled)
 *   await link.request('write', { path, bytes });   link.handle(path) -> file handle stand-in   link.release()
 *
 * Protocol on the link (requests { id, op, ... } -> { id, ok: true, result } | { id, ok: false, error }):
 *   info -> { name, format }   list -> [{ path, dir, size, mtime }]   read { path } -> Uint8Array   write { path, bytes }
 *   delete { path }   mkdir { path }   release (no answer). The archive manager sends { type: 'closed' } when the archive is
 *   closed or replaced; every later request fails (ar.linkClosed).
 * Connecting (bridge messages, suite: 'suite-bridge'):
 *   { type: 'archive-info' } + port   -> { name, format } on the port (only an archive manager with an open archive answers)
 *   { type: 'archive-connect', request: { mode: 'open' | 'save' | 'mount', name, multiple, exts, label } } + port
 *     -> the archive manager shows its dialog; { type: 'connected', paths } or { type: 'cancelled' } on the port, then the protocol.
 *   In the overview, the hub routes them to its archive tabs: { type: 'archive-list' } + port -> [{ tab, name, format }] and
 *   { type: 'archive-connect', tab (null: a new archive manager), request } + port. Standalone, the windows of archive managers
 *   that this app opened, and the one that opened it, are asked.
 */
(function (Suite) {
  'use strict';

  const TAG = 'suite-bridge';
  const KEY = 'suite.files.archives';
  const TIMEOUT = 30000;
  const INFO_TIMEOUT = 600;

  Suite.i18n.register({
    en: {
      'alink.openTitle': 'Open from', 'alink.mountTitle': 'Mount an archive', 'alink.saveTitle': 'Save “{0}” to', 'alink.fs': '💾 File system', 'alink.archives': 'Archives',
      'alink.other': '📦 Another archive… (open or create one)', 'alink.searching': 'Looking for open archives…', 'alink.cancel': 'Cancel',
      'alink.saved': 'Saved as “{0}” in the archive “{1}”.', 'alink.waiting': 'Choose in the archive manager…',
      'alink.setting': 'Offer archives when opening and saving files (the archive manager opens, creates and saves them)',
      'alink.closed': 'The archive “{0}” was closed or replaced: “{1}” cannot be loaded or saved there any more. Use “Save as”.',
      'alink.timeout': 'The archive manager does not answer.',
      'alink.python': 'Python notebooks (in memory)', 'alink.pythonItem': '🐍 {0}',
      'alink.pythonWarning': 'The Python file system lives only in memory: files saved there are gone when the notebook page is closed or Python restarts. Download or save them elsewhere to keep them.',
      'alink.savedPython': 'Saved as “{0}” in the Python file system of “{1}” (in memory only).',
      'alink.closedPython': 'Python in “{0}” was restarted or its page was closed: “{1}” is gone from its file system. Use “Save as”.',
    },
    de: {
      'alink.openTitle': 'Öffnen aus', 'alink.mountTitle': 'Ein Archiv einbinden', 'alink.saveTitle': '„{0}“ speichern in', 'alink.fs': '💾 Dateisystem', 'alink.archives': 'Archive',
      'alink.other': '📦 Anderes Archiv… (öffnen oder neu anlegen)', 'alink.searching': 'Suche geöffnete Archive…', 'alink.cancel': 'Abbrechen',
      'alink.saved': 'Als „{0}“ im Archiv „{1}“ gespeichert.', 'alink.waiting': 'Wählen Sie im Archivmanager…',
      'alink.setting': 'Beim Öffnen und Speichern von Dateien Archive anbieten (der Archivmanager öffnet, erstellt und speichert sie)',
      'alink.closed': 'Das Archiv „{0}“ wurde geschlossen oder ersetzt: „{1}“ lässt sich dort nicht mehr laden oder speichern. Verwenden Sie „Speichern unter“.',
      'alink.timeout': 'Der Archivmanager antwortet nicht.',
      'alink.python': 'Python-Notebooks (im Speicher)', 'alink.pythonItem': '🐍 {0}',
      'alink.pythonWarning': 'Das Python-Dateisystem existiert nur im Speicher: Dort gespeicherte Dateien sind weg, wenn die Notebook-Seite geschlossen oder Python neu gestartet wird. Laden Sie sie herunter oder speichern Sie sie anderswo, um sie zu behalten.',
      'alink.savedPython': 'Als „{0}“ im Python-Dateisystem von „{1}“ gespeichert (nur im Speicher).',
      'alink.closedPython': 'Python in „{0}“ wurde neu gestartet oder seine Seite geschlossen: „{1}“ ist nicht mehr in seinem Dateisystem. Verwenden Sie „Speichern unter“.',
    },
  });

  const read = () => { try { return localStorage.getItem(KEY) !== '0'; } catch (e) { return true; } };
  let session = null; // the setting when the storage is blocked
  const settings = { get enabled() { return session === null ? read() : session; } };
  function setEnabled(on) {
    session = !!on;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* storage blocked: for this session */ }
  }

  const baseName = (path) => String(path).split('/').pop();
  const hub = () => (Suite.bridge ? Suite.bridge.hub() : null);
  const known = new Set(); // windows of archive managers (standalone)

  /** Ask a window on a new port; resolves to the first answer or null after the timeout. */
  function ask(win, msg, timeout = INFO_TIMEOUT) {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); resolve(null); }, timeout);
      channel.port1.onmessage = (e) => { clearTimeout(timer); channel.port1.close(); resolve(e.data); };
      try { win.postMessage({ suite: TAG, ...msg }, '*', [channel.port2]); } catch (err) { clearTimeout(timer); resolve(null); }
    });
  }

  /** The open archives that can be reached: [{ name, format, target }] (target: { tab } in the overview, { win } otherwise). */
  async function listArchives() {
    const host = hub();
    if (host) {
      const list = await ask(host, { type: 'archive-list' }, 2000);
      return (Array.isArray(list) ? list : []).map((a) => ({ name: a.name, format: a.format, kind: a.kind || 'archive', target: { tab: a.tab } }));
    }
    if (window.opener && !window.opener.closed) known.add(window.opener);
    const wins = [...known].filter((w) => w && !w.closed && w !== window);
    const answers = await Promise.all(wins.map((win) => ask(win, { type: 'archive-info' }).then((info) => (info && info.name ? { kind: 'archive', ...info, target: { win } } : null))));
    return answers.filter(Boolean);
  }

  /** Start an archive manager for a connection: a new tab of the overview, or a new window (call from a click). */
  function startArchiveManager() {
    if (hub()) return { tab: null };
    const win = window.open(new URL('archive.html', location.href).href, '_blank');
    if (!win) throw new Suite.LocalizedError('bridge.notFound', Suite.bridge.appName('archive'));
    known.add(win);
    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { window.removeEventListener('message', on); reject(new Suite.LocalizedError('bridge.notFound', Suite.bridge.appName('archive'))); }, TIMEOUT);
      function on(e) {
        const msg = e.data;
        if (e.source !== win || !msg || msg.suite !== TAG || msg.type !== 'ready') return;
        clearTimeout(timer);
        window.removeEventListener('message', on);
        resolve();
      }
      window.addEventListener('message', on);
    });
    return { win, ready };
  }

  /**
   * The dialog "Open from" / "Save … to" / "Mount an archive" (kind 'open' | 'save' | 'mount'): the file system (not for
   * mounting), the open archives (found while the dialog is shown) or another archive. Resolves to { kind: 'fs' },
   * { kind: 'archive', target } or null (cancelled).
   */
  function choose(kind, name = '') {
    return new Promise((resolve) => {
      const dialog = document.createElement('dialog');
      dialog.dataset.testid = 'storage-dialog';
      dialog.className = 'suite-open-with suite-storage';
      const article = document.createElement('article');
      const header = document.createElement('header');
      header.textContent = kind === 'save' ? Suite.t('alink.saveTitle', name) : kind === 'mount' ? Suite.t('alink.mountTitle') : Suite.t('alink.openTitle');
      const done = (value) => { dialog.close(); dialog.remove(); resolve(value); };
      const button = (text, testid, onClick, cls = 'secondary outline') => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = cls;
        b.dataset.testid = testid;
        b.textContent = text;
        b.addEventListener('click', onClick);
        return b;
      };
      const fs = button(Suite.t('alink.fs'), 'storage-fs', () => done({ kind: 'fs' }), '');
      const list = document.createElement('div');
      list.className = 'suite-open-with-list';
      list.dataset.testid = 'storage-archives';
      const status = document.createElement('small');
      status.textContent = Suite.t('alink.searching');
      const legend = document.createElement('strong');
      legend.textContent = Suite.t('alink.archives');
      // (window.open must run in the click itself, popup blockers)
      list.append(button(Suite.t('alink.other'), 'storage-other', () => { try { done({ kind: 'archive', target: startArchiveManager() }); } catch (err) { done(null); Suite.shell.toast(Suite.i18n.describe(err), 'error'); } }));
      const footer = document.createElement('footer');
      footer.append(button(Suite.t('alink.cancel'), 'storage-cancel', () => done(null), 'secondary'));
      article.append(header, ...(kind === 'mount' ? [] : [fs]), legend, list, status, footer);
      dialog.append(article);
      dialog.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
      document.body.append(dialog);
      dialog.showModal();
      if (kind !== 'mount') fs.focus();
      listArchives().then((found) => {
        status.remove();
        const archives = found.filter((a) => a.kind !== 'python');
        for (const a of archives.reverse()) list.prepend(button(`📦 ${a.name}${a.format ? ` (${a.format})` : ''}`, 'storage-archive', () => done({ kind: 'archive', target: a.target })));
        // Python notebooks: their file system, with the warning that it lives only in memory (not for mounting)
        const pythons = kind === 'mount' ? [] : found.filter((a) => a.kind === 'python');
        if (pythons.length) {
          const title = document.createElement('strong');
          title.textContent = Suite.t('alink.python');
          const plist = document.createElement('div');
          plist.className = 'suite-open-with-list';
          plist.dataset.testid = 'storage-pythons';
          for (const a of pythons) plist.append(button(Suite.t('alink.pythonItem', a.name), 'storage-python', () => done({ kind: 'archive', target: a.target })));
          const warning = document.createElement('p');
          warning.className = 'suite-storage-warning';
          warning.dataset.testid = 'storage-python-warning';
          warning.textContent = `⚠ ${Suite.t('alink.pythonWarning')}`;
          footer.before(title, plist, warning);
        }
      }, () => status.remove());
    });
  }

  /** A link on a port: request(op, args) -> result; closed after { type: 'closed' } or release(). */
  function makeLink(port, info) {
    let nextId = 1;
    let closed = false;
    const waiting = new Map();
    const link = { name: info.name || '', format: info.format || '', kind: info.kind || 'archive', get closed() { return closed; } };
    const closedError = (path = '') => new Suite.LocalizedError(link.kind === 'python' ? 'alink.closedPython' : 'alink.closed', link.name, path);
    port.onmessage = (e) => {
      const msg = e.data || {};
      if (msg.type === 'closed') {
        closed = true;
        for (const w of waiting.values()) w.reject(closedError(w.path));
        waiting.clear();
        return;
      }
      const w = waiting.get(msg.id);
      if (!w) return;
      waiting.delete(msg.id);
      if (msg.ok) w.resolve(msg.result); else w.reject(msg.error === 'closed' ? closedError(w.path) : new Error(msg.error || 'archive error'));
    };
    link.request = (op, args = {}) => new Promise((resolve, reject) => {
      if (closed) { reject(closedError(args.path || '')); return; }
      const id = nextId++;
      const timer = setTimeout(() => { waiting.delete(id); reject(new Suite.LocalizedError('alink.timeout')); }, TIMEOUT);
      waiting.set(id, { path: args.path || '', resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (err) => { clearTimeout(timer); reject(err); } });
      const transfer = args.bytes ? [args.bytes.buffer] : [];
      port.postMessage({ id, op, ...args, ...(args.bytes ? { bytes: args.bytes } : {}) }, transfer);
    });
    link.release = () => { if (!closed) { closed = true; try { port.postMessage({ op: 'release' }); } catch (e) { /* gone */ } port.close(); } };
    /** A file handle stand-in for a file of the archive (Suite.files.save writes through it). */
    link.handle = (path, type = '') => {
      const handle = {
        kind: 'file', name: baseName(path), bridged: true, archive: link.name, path, source: `${link.name}: ${path}`,
        async getFile() { const bytes = await link.request('read', { path }); return new File([bytes], baseName(path), { type }); },
        queryPermission: async () => 'granted',
        requestPermission: async () => 'granted',
        isSameEntry: async (other) => other === handle,
        async createWritable() {
          const parts = [];
          return {
            write: async (data) => { parts.push(data && data.type === 'write' ? data.data : data); },
            close: async () => {
              const blob = new Blob(parts.map((p) => (p instanceof ArrayBuffer || ArrayBuffer.isView(p) || p instanceof Blob ? p : String(p))));
              await link.request('write', { path, bytes: new Uint8Array(await blob.arrayBuffer()) });
            },
            abort: async () => {},
          };
        },
      };
      return handle;
    };
    window.addEventListener('pagehide', () => link.release());
    return link;
  }

  /**
   * Connect to an archive manager (target from choose()); it shows its dialog for the request ({ mode, name, multiple, exts,
   * label }). Resolves to { link, paths } or null if the user cancelled there.
   */
  async function connect(target, request) {
    const channel = new MessageChannel();
    const answer = new Promise((resolve) => {
      channel.port1.onmessage = (e) => {
        const msg = e.data || {};
        if (msg.type === 'connected') resolve({ link: makeLink(channel.port1, msg.info || {}), paths: msg.paths || [] });
        else if (msg.type === 'cancelled') { channel.port1.close(); resolve(null); }
      };
    });
    const req = { label: document.title, ...request };
    const host = hub();
    if (host) host.postMessage({ suite: TAG, type: 'archive-connect', tab: target.tab ?? null, request: req }, '*', [channel.port2]);
    else {
      if (target.ready) await target.ready;
      target.win.postMessage({ suite: TAG, type: 'archive-connect', request: req }, '*', [channel.port2]);
    }
    const result = await answer;
    if (host) host.postMessage({ suite: TAG, type: 'activate' }, '*'); // (back to this app's tab)
    return result;
  }

  const extsOf = (types = []) => types.flatMap((t) => Object.values(t.accept || {}).flat()).map((x) => String(x).replace(/^\./, '').toLowerCase());

  /** Suite.files.open() from an archive: [{ file, handle }] or null. */
  async function openFrom(target, { types = [], multiple = false } = {}) {
    const result = await connect(target, { mode: 'open', multiple, exts: extsOf(types) });
    if (!result || !result.paths.length) return null;
    return Promise.all(result.paths.map(async (path) => {
      const handle = result.link.handle(path);
      return { file: await handle.getFile(), handle };
    }));
  }

  /** Suite.files.saveAs() into an archive: { mode: 'archive', name, handle, message } or null. */
  async function saveInto(target, data, { suggestedName = 'file' } = {}) {
    const result = await connect(target, { mode: 'save', name: suggestedName });
    if (!result || !result.paths.length) return null;
    const path = result.paths[0];
    const blob = data instanceof Blob ? data : new Blob([data]);
    await result.link.request('write', { path, bytes: new Uint8Array(await blob.arrayBuffer()) });
    const message = result.link.kind === 'python' ? Suite.t('alink.savedPython', path, result.link.name) : Suite.t('alink.saved', path, result.link.name);
    return { mode: 'archive', name: baseName(path), handle: result.link.handle(path), message };
  }

  Suite.archiveLink = {
    settings, setEnabled, disabled: false, choose, connect, listArchives, openFrom, saveInto, startArchiveManager,
    /** Whether open/saveAs offer archives in this app (not in the archive manager and the overview themselves). */
    get offered() { return settings.enabled && !this.disabled; },
  };
})(window.Suite = window.Suite || {});
