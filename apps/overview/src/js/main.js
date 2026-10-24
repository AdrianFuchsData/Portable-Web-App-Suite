/*
 * Overview ("hub") of the suite: contains all apps (embedded by build.py), starts them in tabs or windows, saves them
 * as single files, and passes files between them ("Open with…", shared/js/bridge.js).
 *
 * Apps are started by writing their HTML into an empty frame or window (about:blank). Such documents have the origin
 * of this page, so they keep a secure context (File System Access API, Web Crypto, storage) – Blob URL documents do
 * not on file:// in Chromium. They also inherit this page's Content-Security-Policy (see index.html).
 */
(function () {
  'use strict';

  const { html } = Suite.shell;
  const t = Suite.t;
  const APP = 'overview';
  const TAG = 'suite-bridge';

  Suite.i18n.register({
    en: {
      'app.title': 'Portable Web App Suite',
      'ov.home': 'Apps', 'ov.open': 'Open', 'ov.window': 'Open in a new window', 'ov.save': 'Save as file', 'ov.openFile': 'Open file…', 'ov.saveAll': 'Save all apps…',
      'ov.close': 'Close', 'ov.closeConfirm': '{0} has unsaved changes. Close it anyway?', 'ov.loading': 'Starting {0}…', 'ov.blocked': 'The browser blocked the new window. Allow pop-ups for this page or open the app in a tab.',
      'ov.savedAll': '{0} apps saved to “{1}”.', 'ov.intro': 'All applications of the suite in one file. Start them here – files can be passed between them with “Open with…” – or save single apps as their own HTML files, e.g. for computers that only need some of them.',
      'ov.dropHint': 'Drop a file here to open it with an app.',
      'cat.files': 'Files and media', 'cat.security': 'Security', 'cat.office': 'Office', 'cat.web': 'Network and web', 'cat.data': 'Data science',
      'desc.texteditor': 'Text and source code with syntax highlighting, several documents, search and replace.',
      'desc.hexeditor': 'View and edit any file byte by byte.',
      'desc.archive': 'Browse, extract, create and edit ZIP, TAR and GZ archives.',
      'desc.mediaplayer': 'Play audio and video files with playlists and subtitles.',
      'desc.audioeditor': 'Cut, mix and record audio, effects, WAV export.',
      'desc.videoeditor': 'Edit videos on a timeline with titles and transitions; export as WebM/MP4.',
      'desc.imageeditor': 'Paint and edit images with layers, selections and filters.',
      'desc.diagram': 'Flowcharts and diagrams; draw.io and Excalidraw files.',
      'desc.keepass': 'Open and edit KeePass password databases (KDBX).',
      'desc.spreadsheet': 'Spreadsheets with formulas: XLSX, ODS, CSV.',
      'desc.document': 'Text documents: DOCX, ODT, PDF export.',
      'desc.presentation': 'Slides with text, shapes and images; PPTX.',
      'desc.reveal': 'reveal.js presentations: visual editor, transitions, fragments, speaker notes; Markdown and Jupyter notebooks.',
      'desc.barcode': 'Read QR codes and other barcodes with the camera or from images; create them for links, Wi-Fi, contacts and more.',
      'desc.pdfviewer': 'Read, search and annotate PDF files.',
      'desc.calendar': 'Calendars with recurring events; iCalendar files.',
      'desc.mail': 'E-mail over IMAP/SMTP with address book (needs the relay).',
      'desc.dbtool': 'Query and edit SQLite and PostgreSQL databases.',
      'desc.ftp': 'Transfer files with FTP, FTPS and SFTP (needs the relay).',
      'desc.ssh': 'Terminal sessions over SSH, file transfer (needs the relay).',
      'desc.http': 'Send HTTP requests, inspect responses, collections.',
      'desc.webinspector': 'Inspect web pages, headers and HAR files; developer tools bookmarklet.',
      'desc.notebook': 'Python notebook and console with pandas, numpy, matplotlib (large: ≈ 50 MB).',
    },
    de: {
      'app.title': 'Portable Web App Suite',
      'ov.home': 'Anwendungen', 'ov.open': 'Öffnen', 'ov.window': 'In neuem Fenster öffnen', 'ov.save': 'Als Datei speichern', 'ov.openFile': 'Datei öffnen…', 'ov.saveAll': 'Alle Anwendungen speichern…',
      'ov.close': 'Schließen', 'ov.closeConfirm': '{0} hat ungespeicherte Änderungen. Trotzdem schließen?', 'ov.loading': '{0} wird gestartet…', 'ov.blocked': 'Der Browser hat das neue Fenster blockiert. Erlauben Sie Pop-ups für diese Seite oder öffnen Sie die Anwendung in einem Tab.',
      'ov.savedAll': '{0} Anwendungen in „{1}“ gespeichert.', 'ov.intro': 'Alle Anwendungen der Suite in einer Datei. Starten Sie sie hier – Dateien lassen sich mit „Öffnen mit…“ zwischen ihnen weitergeben – oder speichern Sie einzelne Anwendungen als eigene HTML-Dateien, z. B. für Rechner, die nur einige davon brauchen.',
      'ov.dropHint': 'Ziehen Sie eine Datei hierher, um sie mit einer Anwendung zu öffnen.',
      'cat.files': 'Dateien und Medien', 'cat.security': 'Sicherheit', 'cat.office': 'Büro', 'cat.web': 'Netzwerk und Web', 'cat.data': 'Datenanalyse',
      'desc.texteditor': 'Text und Quellcode mit Syntaxhervorhebung, mehreren Dokumenten, Suchen und Ersetzen.',
      'desc.hexeditor': 'Beliebige Dateien Byte für Byte ansehen und bearbeiten.',
      'desc.archive': 'ZIP-, TAR- und GZ-Archive ansehen, entpacken, anlegen und bearbeiten.',
      'desc.mediaplayer': 'Audio- und Videodateien abspielen, mit Wiedergabelisten und Untertiteln.',
      'desc.audioeditor': 'Audio schneiden, mischen und aufnehmen, Effekte, WAV-Export.',
      'desc.videoeditor': 'Videos auf einer Zeitleiste mit Titeln und Übergängen bearbeiten; Export als WebM/MP4.',
      'desc.imageeditor': 'Bilder malen und bearbeiten, mit Ebenen, Auswahlen und Filtern.',
      'desc.diagram': 'Flussdiagramme und Diagramme; draw.io- und Excalidraw-Dateien.',
      'desc.keepass': 'KeePass-Passwortdatenbanken (KDBX) öffnen und bearbeiten.',
      'desc.spreadsheet': 'Tabellen mit Formeln: XLSX, ODS, CSV.',
      'desc.document': 'Textdokumente: DOCX, ODT, PDF-Export.',
      'desc.presentation': 'Folien mit Text, Formen und Bildern; PPTX.',
      'desc.reveal': 'reveal.js-Präsentationen: visueller Editor, Übergänge, Fragmente, Sprechernotizen; Markdown und Jupyter-Notebooks.',
      'desc.barcode': 'QR-Codes und andere Barcodes mit der Kamera oder aus Bildern lesen; Codes für Links, WLAN, Kontakte und mehr erstellen.',
      'desc.pdfviewer': 'PDF-Dateien lesen, durchsuchen und kommentieren.',
      'desc.calendar': 'Kalender mit Serienterminen; iCalendar-Dateien.',
      'desc.mail': 'E-Mail über IMAP/SMTP mit Adressbuch (braucht das Relay).',
      'desc.dbtool': 'SQLite- und PostgreSQL-Datenbanken abfragen und bearbeiten.',
      'desc.ftp': 'Dateien über FTP, FTPS und SFTP übertragen (braucht das Relay).',
      'desc.ssh': 'Terminalsitzungen über SSH, Dateiübertragung (braucht das Relay).',
      'desc.http': 'HTTP-Anfragen senden, Antworten untersuchen, Sammlungen.',
      'desc.webinspector': 'Webseiten, Header und HAR-Dateien untersuchen; Entwicklerwerkzeuge als Lesezeichen.',
      'desc.notebook': 'Python-Notebook und Konsole mit pandas, numpy, matplotlib (groß: ≈ 50 MB).',
    },
  });

  const CATEGORIES = [
    ['files', ['texteditor', 'hexeditor', 'archive', 'mediaplayer', 'audioeditor', 'videoeditor', 'imageeditor', 'diagram', 'barcode']],
    ['security', ['keepass']],
    ['office', ['spreadsheet', 'document', 'presentation', 'reveal', 'pdfviewer', 'calendar']],
    ['web', ['mail', 'dbtool', 'ftp', 'ssh', 'http', 'webinspector']],
    ['data', ['notebook']],
  ];

  // ---- embedded apps --------------------------------------------------------------------------------------------

  const embedded = {};
  for (const el of document.querySelectorAll('script[data-bundle-file]')) embedded[el.dataset.bundleFile] = el;
  const available = (id) => !!embedded[id];
  const cache = new Map(); // id -> Promise<string>

  /** HTML of an embedded app (gzip + base64, decoded on first use). */
  function appHtml(id) {
    if (!cache.has(id)) {
      cache.set(id, (async () => {
        const binary = atob(embedded[id].textContent.trim());
        const packed = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) packed[i] = binary.charCodeAt(i);
        return new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
      })());
    }
    return cache.get(id);
  }

  // ---- state ----------------------------------------------------------------------------------------------------

  const state = { tabs: [], active: null, loading: null };
  let nextTab = 1;
  const windows = new Set();

  let queued = false;
  function render() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; Suite.shell.refresh(); });
  }
  const fail = (e) => { console.warn(e); Suite.shell.toast(Suite.i18n.describe(e), 'error'); };
  const name = (id) => Suite.bridge.appName(id);
  const icon = (id) => (Suite.bridge.app(id) || {}).icon || '';

  // frames live outside of Preact (re-rendering must never reload an app)
  const frames = document.createElement('div');
  frames.className = 'ov-frames';

  function updateDirty() { Suite.shell.setDirty(state.tabs.some((x) => x.dirty)); }

  /** Write an app into a frame or window document. */
  async function start(win, id) {
    const text = await appHtml(id);
    win.name = Suite.bridge.HUB_NAME;
    const doc = win.document;
    doc.open();
    doc.write(text);
    doc.close();
  }

  /** Open an app in a new tab; file: { name, fileType, bytes, writable, source, port } is handed over when it is ready. */
  /** A tab with an app; file: one file or a list of files to open in it once it is ready. */
  async function openTab(id, file = null) {
    const tab = { id: nextTab++, app: id, dirty: false, pending: file, frame: document.createElement('iframe') };
    tab.frame.name = Suite.bridge.HUB_NAME;
    tab.frame.title = name(id);
    tab.frame.dataset.app = id;
    tab.frame.dataset.testid = 'app-frame';
    tab.frame.setAttribute('allow', 'clipboard-read; clipboard-write; fullscreen; microphone; camera; display-capture');
    frames.append(tab.frame);
    state.tabs.push(tab);
    activate(tab.id);
    state.loading = id;
    render();
    try {
      await start(tab.frame.contentWindow, id);
    } catch (e) { fail(e); } finally { state.loading = null; render(); }
    return tab;
  }

  function openWindow(id) {
    const win = window.open('about:blank', '_blank');
    if (!win) { Suite.shell.toast(t('ov.blocked'), 'error'); return; }
    windows.add(win);
    start(win, id).catch(fail);
  }

  function activate(tabId) {
    state.active = tabId;
    for (const tab of state.tabs) tab.frame.classList.toggle('active', tab.id === tabId);
    frames.hidden = tabId === null;
    render();
    const tab = state.tabs.find((x) => x.id === tabId);
    if (tab) requestAnimationFrame(() => tab.frame.focus());
  }

  async function closeTab(tab) {
    if (tab.dirty && !(await Suite.shell.confirm(t('ov.closeConfirm', name(tab.app))))) return;
    const i = state.tabs.indexOf(tab);
    state.tabs.splice(i, 1);
    tab.frame.remove();
    if (state.active === tab.id) activate(state.tabs.length ? state.tabs[Math.min(i, state.tabs.length - 1)].id : null);
    updateDirty();
    render();
  }

  // ---- saving apps ----------------------------------------------------------------------------------------------

  const HTML_TYPES = [{ description: 'HTML', accept: { 'text/html': ['.html'] } }];

  async function saveApp(id) {
    try {
      const bytes = new TextEncoder().encode(await appHtml(id));
      const result = await Suite.files.saveAs(bytes, { suggestedName: `${id}.html`, types: HTML_TYPES, type: 'text/html' });
      if (result) Suite.shell.toast(result.message);
    } catch (e) { fail(e); }
  }

  async function saveAll() {
    const ids = Object.keys(embedded);
    try {
      if (typeof window.showDirectoryPicker === 'function' && window.isSecureContext) {
        let dir;
        try { dir = await window.showDirectoryPicker({ mode: 'readwrite' }); } catch (e) { if (e && e.name === 'AbortError') return; throw e; }
        state.loading = 'all';
        render();
        for (const id of ids) {
          const handle = await dir.getFileHandle(`${id}.html`, { create: true });
          await Suite.files.writeToHandle(handle, new TextEncoder().encode(await appHtml(id)));
        }
        Suite.shell.toast(t('ov.savedAll', ids.length, dir.name));
        return;
      }
      state.loading = 'all';
      render();
      const files = [];
      for (const id of ids) files.push({ name: `portable-web-app-suite/${id}.html`, bytes: new TextEncoder().encode(await appHtml(id)) });
      Suite.files.download(OV.zip(files), 'portable-web-app-suite.zip', 'application/zip');
    } catch (e) { fail(e); } finally { state.loading = null; render(); }
  }

  // ---- opening local files with an app ----------------------------------------------------------------------------

  async function openLocal(picked) {
    const { file, handle } = picked;
    const id = await Suite.bridge.chooseApp(file.name);
    if (!id) return;
    let port = null;
    if (handle) {
      const channel = new MessageChannel();
      Suite.bridge.serve(channel.port1, (bytes) => Suite.files.writeToHandle(handle, bytes));
      port = channel.port2;
    }
    openTab(id, { name: file.name, fileType: file.type, bytes: await file.arrayBuffer(), writable: !!handle, source: file.name, port });
  }

  async function openFile() {
    try {
      const picked = await Suite.files.open();
      if (picked) await openLocal(picked[0]);
    } catch (e) { fail(e); }
  }

  // ---- messages from the apps --------------------------------------------------------------------------------------

  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (!msg || msg.suite !== TAG) return;
    const tab = state.tabs.find((x) => x.frame.contentWindow === e.source);
    if (!tab && !windows.has(e.source)) return; // only apps started here
    if (msg.type === 'ready' && tab && tab.pending) {
      const files = [].concat(tab.pending);
      tab.pending = null;
      for (const f of files) e.source.postMessage({ suite: TAG, type: 'open', name: f.name, fileType: f.fileType, bytes: f.bytes, writable: f.writable, source: f.source }, '*', [f.bytes, ...(f.port ? [f.port] : [])]);
    } else if (msg.type === 'dirty' && tab) {
      tab.dirty = !!msg.dirty;
      updateDirty();
      render();
    } else if (msg.type === 'open-in' && available(msg.app)) {
      // one tab for all files of an "Open with…" (ports by index)
      const files = (msg.files || [{ ...msg, port: 0 }]).map((f) => ({ name: f.name, fileType: f.fileType, bytes: f.bytes, writable: f.writable, source: f.source, port: f.port >= 0 ? e.ports[f.port] || null : null }));
      openTab(msg.app, files);
    }
  });

  // ---- UI ---------------------------------------------------------------------------------------------------------

  function Toolbar() {
    return html`<nav class="ov-toolbar" role="toolbar">
      <button class="secondary" data-testid="open-file" onClick=${openFile}>${t('ov.openFile')}</button>
      <button class="secondary outline" data-testid="save-all" aria-busy=${state.loading === 'all'} onClick=${saveAll}>💾 ${t('ov.saveAll')}</button>
    </nav>`;
  }

  function Tabs() {
    return html`<div class="ov-tabs" role="tablist" data-testid="tabs">
      <button role="tab" class=${state.active === null ? '' : 'secondary outline'} aria-selected=${state.active === null} data-testid="tab-home" onClick=${() => activate(null)}>▦ ${t('ov.home')}</button>
      ${state.tabs.map((tab) => html`<span class=${`ov-tab ${state.active === tab.id ? 'active' : ''}`} data-testid="tab" data-app=${tab.app}>
        <button role="tab" class=${state.active === tab.id ? '' : 'secondary outline'} aria-selected=${state.active === tab.id} onClick=${() => activate(tab.id)}>${icon(tab.app)} ${name(tab.app)}${tab.dirty ? ' •' : ''}</button>
        <button class="secondary outline ov-tab-close" title=${t('ov.close')} aria-label=${t('ov.close')} data-testid="tab-close" onClick=${() => closeTab(tab)}>×</button>
      </span>`)}
      ${state.loading && state.loading !== 'all' ? html`<small class="ov-loading" aria-busy="true">${t('ov.loading', name(state.loading))}</small>` : null}
    </div>`;
  }

  function Card({ id }) {
    const ok = available(id);
    return html`<article class="ov-card" data-testid="app-card" data-app=${id}>
      <header><span class="ov-icon">${icon(id)}</span> <strong>${name(id)}</strong></header>
      <p>${t(`desc.${id}`)}</p>
      <footer>
        <button data-testid="open-app" disabled=${!ok} onClick=${() => openTab(id)}>${t('ov.open')}</button>
        <button class="secondary outline" title=${t('ov.window')} aria-label=${t('ov.window')} data-testid="open-window" disabled=${!ok} onClick=${() => openWindow(id)}>↗</button>
        <button class="secondary outline" title=${t('ov.save')} aria-label=${t('ov.save')} data-testid="save-app" disabled=${!ok} onClick=${() => saveApp(id)}>💾</button>
      </footer>
    </article>`;
  }

  function Home() {
    return html`<section class="ov-home" data-testid="home">
      <p class="ov-intro">${t('ov.intro')}</p>
      ${CATEGORIES.map(([cat, ids]) => html`<h2>${t(`cat.${cat}`)}</h2><div class="ov-grid">${ids.map((id) => html`<${Card} id=${id} />`)}</div>`)}
      <p class="ov-intro"><small>${t('ov.dropHint')}</small></p>
    </section>`;
  }

  function Main() {
    return html`<div class="ov-layout">
      <${Tabs} />
      ${state.active === null ? html`<${Home} />` : null}
      <div class="ov-frame-host" hidden=${state.active === null} ref=${(el) => { if (el && frames.parentElement !== el) el.appendChild(frames); }}></div>
    </div>`;
  }

  Suite.shell.mount({ id: APP, title: 'app.title', version: '%%BUILD_VERSION%%', toolbar: () => html`<${Toolbar} />`, main: () => html`<${Main} />` });
  Suite.files.dropZone(document.body, (picked) => { if (picked.length) openLocal(picked[0]).catch(fail); });

  // for tests
  window.OV = Object.assign(window.OV || {}, { state, openTab, openWindow, appHtml, embedded });
  document.body.dataset.ready = 'true';
})();
