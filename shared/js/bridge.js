/*
 * App bridge: open a file of one app in another app of the suite and save it back ("Open with…").
 *
 * A source app (archive, SFTP, mail attachments, …) calls
 *   Suite.bridge.openWith(name, { data, type, save, source })   // asks for the app, then openIn()
 *   Suite.bridge.openIn(appId, { name, data, type, save, source })
 * data: Uint8Array | ArrayBuffer | Blob | a function returning a promise of one of them (the window opens first);
 * save: async (Uint8Array) => void, or null for a read-only copy. Call it from a click handler (popup blockers).
 *
 * A target app calls Suite.bridge.receive(({ file, handle }) => …) once at start. The handle is a stand-in for a
 * File System Access handle: Suite.files.save() writes through it, which sends the bytes back to the source.
 *
 * Where the target runs:
 *  - started from the overview app (window name "suite-hub-app"): the overview opens the app in a new tab and passes
 *    the file and a MessagePort on;
 *  - otherwise the sibling file "<app>.html" next to the current file is opened in a new window.
 * All further messages (save → saved/error) go over a MessageChannel between source and target.
 */
(function (Suite) {
  'use strict';

  const HUB_NAME = 'suite-hub-app';
  const READY_TIMEOUT_MS = 30000;
  const TAG = 'suite-bridge';

  const TEXT = ['txt', 'md', 'markdown', 'json', 'js', 'mjs', 'cjs', 'ts', 'css', 'scss', 'html', 'htm', 'xml', 'yml', 'yaml', 'ini', 'cfg', 'conf', 'log',
    'csv', 'tsv', 'py', 'sh', 'bash', 'bat', 'cmd', 'ps1', 'java', 'kt', 'c', 'h', 'cpp', 'hpp', 'cs', 'go', 'rs', 'php', 'rb', 'pl', 'lua', 'sql', 'toml',
    'properties', 'env', 'svg', 'tex', 'rst', 'gitignore', 'dockerfile', 'makefile', 'vue', 'jsx', 'tsx', 'r', 'swift', 'dart', 'gradle'];

  /** Apps of the suite: id (= file name without .html), names, file extensions they open (order = preference). */
  const APPS = [
    { id: 'texteditor', icon: '📝', name: { en: 'Text editor', de: 'Texteditor' }, ext: TEXT },
    { id: 'hexeditor', icon: '🔢', name: { en: 'Hex editor', de: 'Hex-Editor' }, ext: ['*'] },
    { id: 'archive', icon: '📦', name: { en: 'Archive manager', de: 'Archivmanager' }, ext: ['zip', 'tar', 'tgz', 'gz', 'jar', 'war', 'apk', 'epub', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'whl', 'nupkg', 'vsix', '7z', 'rar', 'xz', 'txz', 'bz2', 'tbz2', 'zst', 'iso', 'cab', 'deb', 'rpm', 'cpio'] },
    { id: 'mediaplayer', icon: '▶️', name: { en: 'Media player', de: 'Mediaplayer' }, ext: ['mp3', 'ogg', 'oga', 'opus', 'wav', 'flac', 'm4a', 'aac', 'mp4', 'm4v', 'webm', 'ogv', 'mkv', 'mov', 'm3u', 'm3u8', 'pls'] },
    { id: 'audioeditor', icon: '🎚️', name: { en: 'Audio editor', de: 'Audio-Editor' }, ext: ['wav', 'mp3', 'ogg', 'oga', 'opus', 'flac', 'm4a', 'aac', 'webm'] },
    { id: 'videoeditor', icon: '🎬', name: { en: 'Video editor', de: 'Video-Editor' }, ext: ['mp4', 'm4v', 'webm', 'mkv', 'mov', 'ogv'] },
    { id: 'imageeditor', icon: '🎨', name: { en: 'Image editor', de: 'Bildbearbeitung' }, ext: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif', 'svg', 'ora', 'psd'] },
    { id: 'barcode', icon: '▦', name: { en: 'Barcodes', de: 'Barcodes' }, ext: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif'] },
    { id: 'diagram', icon: '📐', name: { en: 'Diagram editor', de: 'Diagramm-Editor' }, ext: ['drawio', 'dio', 'excalidraw', 'svg'] },
    { id: 'keepass', icon: '🔐', name: { en: 'KeePass', de: 'KeePass' }, ext: ['kdbx'] },
    { id: 'spreadsheet', icon: '📊', name: { en: 'Spreadsheet', de: 'Tabellenkalkulation' }, ext: ['xlsx', 'xlsm', 'xls', 'ods', 'csv', 'tsv'] },
    { id: 'document', icon: '📄', name: { en: 'Document', de: 'Dokument' }, ext: ['docx', 'odt', 'rtf', 'txt', 'md', 'html', 'htm'] },
    { id: 'presentation', icon: '📽️', name: { en: 'Presentation', de: 'Präsentation' }, ext: ['pptx'] },
    { id: 'reveal', icon: '🎞️', name: { en: 'Web slides', de: 'Web-Folien' }, ext: ['ipynb', 'md', 'markdown', 'html', 'htm', 'pptx'] },
    { id: 'pdfviewer', icon: '📕', name: { en: 'PDF viewer', de: 'PDF-Betrachter' }, ext: ['pdf'] },
    { id: 'calendar', icon: '📅', name: { en: 'Calendar', de: 'Kalender' }, ext: ['ics', 'ical', 'ifb', 'icalendar'] },
    { id: 'mail', icon: '✉️', name: { en: 'Mail', de: 'E-Mail' }, ext: ['eml', 'mbox', 'vcf'] },
    { id: 'dbtool', icon: '🗄️', name: { en: 'Database tool', de: 'Datenbankwerkzeug' }, ext: ['sqlite', 'sqlite3', 'db', 'db3', 's3db'] },
    { id: 'ssh', icon: '🖥️', name: { en: 'SSH client', de: 'SSH-Client' }, ext: [] },
    { id: 'ftp', icon: '📁', name: { en: 'FTP/SFTP client', de: 'FTP/SFTP-Client' }, ext: [] },
    { id: 'http', icon: '🌐', name: { en: 'HTTP analyzer', de: 'HTTP-Analysator' }, ext: [] },
    { id: 'webinspector', icon: '🔍', name: { en: 'Web inspector', de: 'Web-Inspektor' }, ext: ['har', 'html', 'htm'] },
    { id: 'notebook', icon: '🐍', name: { en: 'Python notebook', de: 'Python-Notebook' }, ext: ['ipynb', 'py'] },
  ];

  Suite.i18n.register({
    en: {
      'bridge.openWith': 'Open with…', 'bridge.choose': 'Open “{0}” with', 'bridge.other': 'Other apps', 'bridge.cancel': 'Cancel',
      'bridge.opened': 'Opened from {0}. “Save” writes the file back to {0}.', 'bridge.copy': 'Opened from {0} as a copy.',
      'bridge.notFound': '{0} could not be started. Keep the apps of the suite in one folder with their original file names, or start them from the overview app.',
      'bridge.closed': '{0} is no longer open; the file cannot be saved back. Use “Save as”.', 'bridge.saving': 'Saving to {0}…',
    },
    de: {
      'bridge.openWith': 'Öffnen mit…', 'bridge.choose': '„{0}“ öffnen mit', 'bridge.other': 'Andere Anwendungen', 'bridge.cancel': 'Abbrechen',
      'bridge.opened': 'Aus {0} geöffnet. „Speichern“ schreibt die Datei zurück nach {0}.', 'bridge.copy': 'Aus {0} als Kopie geöffnet.',
      'bridge.notFound': '{0} konnte nicht gestartet werden. Legen Sie die Anwendungen der Suite mit ihren ursprünglichen Dateinamen in einen Ordner oder starten Sie sie über die Übersicht.',
      'bridge.closed': '{0} ist nicht mehr geöffnet; die Datei kann nicht zurückgespeichert werden. Verwenden Sie „Speichern unter“.', 'bridge.saving': 'Speichere nach {0}…',
    },
  });

  const app = (id) => APPS.find((a) => a.id === id);
  const appName = (id) => { const a = app(id); return a ? a.name[Suite.i18n.language] || a.name.en : id; };
  const extOf = (name) => { const m = /\.([^./\\]+)$/.exec(String(name || '').toLowerCase()); return m ? m[1] : ''; };

  /** Apps that open a file name, best first ({ preferred: [...], others: [...] }). The hex editor opens anything. */
  function appsFor(name, { exclude = null } = {}) {
    const ext = extOf(name);
    const preferred = APPS.filter((a) => a.id !== exclude && ext && a.ext.includes(ext));
    if (!preferred.some((a) => a.id === 'hexeditor') && exclude !== 'hexeditor') preferred.push(app('hexeditor'));
    const others = APPS.filter((a) => a.id !== exclude && a.ext.length && !preferred.includes(a));
    return { preferred, others };
  }

  /** The overview app this app was started from (parent frame or opener), or null. */
  function hub() {
    if (window.name !== HUB_NAME) return null;
    if (window.parent && window.parent !== window) return window.parent;
    return window.opener && !window.opener.closed ? window.opener : null;
  }

  const toBytes = async (data) => {
    if (typeof data === 'function') data = await data();
    if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    return new TextEncoder().encode(String(data));
  };
  const transferable = (bytes) => (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer);

  /** Answer save requests of a target on a port with the source's save callback. */
  function serve(port, save) {
    port.onmessage = async (e) => {
      const msg = e.data || {};
      if (msg.type !== 'save') return;
      try {
        await save(new Uint8Array(msg.bytes));
        port.postMessage({ type: 'saved', id: msg.id });
      } catch (err) {
        port.postMessage({ type: 'error', id: msg.id, message: Suite.i18n.describe(err) });
      }
    };
  }

  // ---- source side ------------------------------------------------------------------------------------------------

  const pending = new Map(); // window -> { send(win) }

  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (!msg || msg.suite !== TAG || msg.type !== 'ready') return;
    const p = pending.get(e.source);
    if (p) { pending.delete(e.source); p.send(e.source); }
  });

  /**
   * Open a file in another app. Must be called synchronously from a user action (opens a window). Resolves when the
   * file was handed over; rejects if the app could not be started.
   */
  function openIn(appId, { name, data, type = '', save = null, source = document.title } = {}) {
    const channel = save ? new MessageChannel() : null;
    if (channel) serve(channel.port1, save);
    const message = async () => {
      const bytes = await toBytes(data);
      return { suite: TAG, name, type, bytes: transferable(bytes), writable: !!save, source };
    };
    const host = hub();
    if (host) {
      return message().then((msg) => {
        host.postMessage({ ...msg, type: 'open-in', app: appId, fileType: type }, '*', [msg.bytes, ...(channel ? [channel.port2] : [])]);
      });
    }
    const win = window.open(new URL(`${appId}.html`, location.href).href, '_blank');
    const prepared = message();
    return new Promise((resolve, reject) => {
      if (!win) { reject(new Suite.LocalizedError('bridge.notFound', appName(appId))); return; }
      const timer = setTimeout(() => { pending.delete(win); reject(new Suite.LocalizedError('bridge.notFound', appName(appId))); }, READY_TIMEOUT_MS);
      pending.set(win, {
        async send(target) {
          clearTimeout(timer);
          try {
            const msg = await prepared;
            target.postMessage({ ...msg, type: 'open', fileType: type }, '*', [msg.bytes, ...(channel ? [channel.port2] : [])]);
            resolve();
          } catch (err) { reject(err); }
        },
      });
    });
  }

  /** Show a small dialog with the apps for a file name. Resolves to an app id or null. */
  function chooseApp(name, { exclude = null } = {}) {
    return new Promise((resolve) => {
      const { preferred, others } = appsFor(name, { exclude });
      const dialog = document.createElement('dialog');
      dialog.dataset.testid = 'open-with-dialog';
      dialog.className = 'suite-open-with';
      const article = document.createElement('article');
      const header = document.createElement('header');
      header.textContent = Suite.t('bridge.choose', name);
      article.append(header);
      const done = (id) => { dialog.close(); dialog.remove(); resolve(id); };
      const list = (apps) => {
        const div = document.createElement('div');
        div.className = 'suite-open-with-list';
        for (const a of apps) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'secondary outline';
          b.dataset.app = a.id;
          b.textContent = `${a.icon} ${a.name[Suite.i18n.language] || a.name.en}`;
          b.addEventListener('click', () => done(a.id));
          div.append(b);
        }
        return div;
      };
      article.append(list(preferred));
      if (others.length) {
        const more = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = Suite.t('bridge.other');
        more.append(summary, list(others));
        article.append(more);
      }
      const footer = document.createElement('footer');
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'secondary';
      cancel.textContent = Suite.t('bridge.cancel');
      cancel.addEventListener('click', () => done(null));
      footer.append(cancel);
      article.append(footer);
      dialog.append(article);
      dialog.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
      document.body.append(dialog);
      dialog.showModal();
    });
  }

  /**
   * "Open with…": let the user choose an app and open the file there. The app is opened directly from the click on
   * its button (popup blockers). Errors are shown as a toast. options: as openIn, plus exclude (the own app id).
   */
  async function openWith(name, options = {}) {
    const id = await chooseApp(name, { exclude: options.exclude || null });
    if (!id) return null;
    try {
      await openIn(id, { name, ...options });
    } catch (err) {
      if (Suite.shell && Suite.shell.toast) Suite.shell.toast(Suite.i18n.describe(err), 'error'); else throw err;
    }
    return id;
  }

  // ---- target side ------------------------------------------------------------------------------------------------

  let receiving = false;

  /** A file handle stand-in that saves through the bridge port. */
  function bridgedHandle(file, port, source) {
    let current = file;
    let nextId = 1;
    const waiting = new Map();
    let closed = false;
    port.onmessage = (e) => {
      const msg = e.data || {};
      const w = waiting.get(msg.id);
      if (!w) return;
      waiting.delete(msg.id);
      if (msg.type === 'saved') w.resolve(); else w.reject(new Error(msg.message || 'save failed'));
    };
    port.start();
    const send = (bytes) => new Promise((resolve, reject) => {
      if (closed) { reject(new Suite.LocalizedError('bridge.closed', source)); return; }
      const id = nextId++;
      const timer = setTimeout(() => { waiting.delete(id); closed = true; reject(new Suite.LocalizedError('bridge.closed', source)); }, READY_TIMEOUT_MS);
      waiting.set(id, { resolve: () => { clearTimeout(timer); resolve(); }, reject: (err) => { clearTimeout(timer); reject(err); } });
      const buffer = transferable(bytes);
      port.postMessage({ type: 'save', id, bytes: buffer }, [buffer]);
    });
    const handle = {
      kind: 'file',
      name: file.name,
      bridged: true,
      source,
      getFile: async () => current,
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      isSameEntry: async (other) => other === handle,
      async createWritable() {
        const parts = [];
        return {
          write: async (data) => { parts.push(data && data.type === 'write' ? data.data : data); },
          close: async () => {
            const blob = new Blob(parts.map((p) => (p instanceof ArrayBuffer || ArrayBuffer.isView(p) || p instanceof Blob ? p : String(p))));
            const bytes = new Uint8Array(await blob.arrayBuffer());
            await send(bytes);
            current = new File([bytes], file.name, { type: file.type, lastModified: Date.now() });
          },
          abort: async () => {},
        };
      },
    };
    return handle;
  }

  /**
   * Accept files opened from another app: onOpen({ file, handle }) is called (handle null for read-only copies).
   * Call once when the app is ready to open files.
   */
  function receive(onOpen, { app: appId = '' } = {}) {
    if (receiving) return;
    receiving = true;
    const host = hub() || (window.opener && !window.opener.closed ? window.opener : null);
    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (!msg || msg.suite !== TAG || msg.type !== 'open' || (host && e.source !== host)) return;
      const file = new File([msg.bytes], msg.name, { type: msg.fileType || '' });
      const port = e.ports && e.ports[0];
      const handle = msg.writable && port ? bridgedHandle(file, port, msg.source) : null;
      Promise.resolve(onOpen({ file, handle })).then(() => {
        if (Suite.shell && Suite.shell.toast) Suite.shell.toast(Suite.t(handle ? 'bridge.opened' : 'bridge.copy', msg.source));
      }, (err) => { if (Suite.shell && Suite.shell.toast) Suite.shell.toast(Suite.i18n.describe(err), 'error'); });
    });
    if (host) {
      try { host.postMessage({ suite: TAG, type: 'ready', app: appId }, '*'); } catch (err) { /* opener gone */ }
    }
    // installed hosted variant (tools/build_pwa.py): files opened with the app from the operating system (file_handlers)
    if (window.launchQueue && typeof window.launchQueue.setConsumer === 'function') {
      window.launchQueue.setConsumer(async (params) => {
        const [handle] = (params && params.files) || [];
        if (!handle) return;
        try { await onOpen({ file: await handle.getFile(), handle }); } catch (err) { if (Suite.shell && Suite.shell.toast) Suite.shell.toast(Suite.i18n.describe(err), 'error'); }
      });
    }
  }

  Suite.bridge = { APPS, HUB_NAME, app, appName, appsFor, hub, openIn, openWith, chooseApp, receive, serve };
})(window.Suite = window.Suite || {});
