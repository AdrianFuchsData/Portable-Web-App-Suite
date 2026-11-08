/*
 * Common frame of all apps (Preact + htm, vendor/htm-preact-standalone.umd.js; styles in shared/css/suite.css).
 *
 *   Suite.shell.mount({
 *     id: 'texteditor', title: 'app.title', version: '%%BUILD_VERSION%%',
 *     toolbar: () => html`<button onClick=${save}>${Suite.t('common.save')}</button>`,   // optional
 *     main: () => html`<div>…</div>`,
 *   });
 *   Suite.shell.toast(message, 'info' | 'warning' | 'error');
 *   Suite.shell.banner(message) / Suite.shell.banner(null);     // e.g. the "replace the original file" hint
 *   Suite.shell.banner(message, [{ label, run, testid }]);      // with action buttons (the banner closes after one)
 *   await Suite.shell.confirm(message)  -> true | false
 *   Suite.shell.setDirty(true);                                // warns before closing the page
 *   Suite.shell.refresh();                                     // re-render (also on language changes)
 *   Suite.shell.setFileName('plan.drawio •')                   // window title "plan.drawio • – Diagram editor"
 *   Suite.shell.backdrop(onClose)                              // shade behind a phone drawer; a tap closes it
 *   html`<${Suite.shell.Recent} app="diagram" onOpen=${(picked) => openPicked(picked)} before=${confirmDiscard} />`
 *   Suite.palette.register(() => [{ label, run }])            // extra entries for the command palette (end of this file)
 *                                     // "Recent" list of the app's files (Chromium keeps the file handles; hidden elsewhere)
 *
 * Phone layout: side panels become drawers (position: fixed) that start below the header: the shell keeps the CSS
 * variable --suite-top at the bottom edge of the header (and banner), which wraps to several lines on narrow screens.
 */
(function (Suite) {
  'use strict';

  const { html, render, useState, useEffect } = htmPreact;
  const THEME_KEY = 'suite.theme';
  const state = { toasts: [], banner: null, dialog: null, dirty: false, about: false };
  let app = null;
  let container = null;
  let nextToast = 1;

  function storedTheme() {
    try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) { return 'auto'; }
  }

  function applyTheme(theme) {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  }

  function setTheme(theme) {
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* storage blocked */ }
    applyTheme(theme);
    refresh();
  }

  function toast(message, kind = 'info', timeout = kind === 'error' ? 8000 : 4000) {
    const id = nextToast++;
    state.toasts = [...state.toasts, { id, message, kind }];
    refresh();
    setTimeout(() => { state.toasts = state.toasts.filter((t) => t.id !== id); refresh(); }, timeout);
  }

  function banner(message, actions = null) {
    state.banner = message || null;
    state.bannerActions = message ? actions : null;
    refresh();
  }

  function confirm(message, { ok = Suite.t('common.ok'), cancel = Suite.t('common.cancel') } = {}) {
    return new Promise((resolve) => {
      state.dialog = { message, ok, cancel, resolve: (value) => { state.dialog = null; refresh(); resolve(value); } };
      refresh();
    });
  }

  function setDirty(dirty) {
    state.dirty = !!dirty;
    if (Suite.autosave) Suite.autosave.dirtyChanged(state.dirty);
    // tell the overview app (tabs show unsaved changes and ask before closing)
    try { const hub = Suite.bridge && Suite.bridge.hub(); if (hub) hub.postMessage({ suite: 'suite-bridge', type: 'dirty', dirty: state.dirty }, '*'); } catch (e) { /* no overview */ }
  }

  // Hardening: a link from an opened file (documents, spreadsheets, PDFs, mails, …) must not run code in the app. Clicks on
  // javascript:/vbscript: links and such URLs passed to window.open are refused (the web inspector's bookmarklet is dragged
  // to the bookmarks, not clicked).
  const SCRIPT_URL = /^[\s\u0000-\u001f]*(javascript|vbscript|livescript)\s*:/i;
  const refuseScriptUrl = (url) => SCRIPT_URL.test(String(url ?? '').replace(/[\t\n\r]/g, ''));
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a[href], area[href]') : null;
    if (a && refuseScriptUrl(a.getAttribute('href'))) e.preventDefault();
  }, true);
  const nativeOpen = window.open;
  window.open = function open(url, ...rest) {
    if (refuseScriptUrl(url)) { console.warn('Refused to open a script URL'); return null; }
    return nativeOpen.call(window, url, ...rest);
  };

  window.addEventListener('beforeunload', (e) => {
    if (!state.dirty) return undefined;
    e.preventDefault();
    e.returnValue = Suite.t('shell.unsaved');
    return e.returnValue;
  });

  const THEMES = ['auto', 'light', 'dark'];
  const THEME_ICON = { auto: '◐', light: '☀', dark: '☾' };

  function Header() {
    const theme = storedTheme();
    const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    const other = Suite.i18n.languages.find((l) => l !== Suite.i18n.language);
    return html`<header class="suite-header pico">
      <h1 data-testid="app-title">${Suite.t(app.title)}${aboutInfo().modified ? html` <small class="suite-modified-badge" data-testid="modified-badge" title=${aboutInfo().modified}>${Suite.t('shell.modifiedShort')}</small>` : null}</h1>
      ${app.toolbar ? app.toolbar() : null}
      <span class="suite-spacer"></span>
      ${headerItems.map((Item) => html`<${Item} />`)}
      <button class="secondary outline suite-palette-button" data-testid="palette-button" title=${Suite.t('palette.open')} aria-label=${Suite.t('palette.open')}
              onClick=${() => Suite.palette.open()}>⌘</button>
      <button class="secondary outline" data-testid="theme" title=${`${Suite.t('shell.theme')}: ${Suite.t(`theme.${theme}`)}`}
              onClick=${() => setTheme(next)}>${THEME_ICON[theme]}</button>
      <button class="secondary outline" data-testid="language" title=${Suite.t('shell.language')}
              onClick=${() => Suite.i18n.setLanguage(other)}>${other.toUpperCase()}</button>
      <button class="secondary outline" data-testid="about" title=${Suite.t('shell.about')}
              onClick=${() => { state.about = true; refresh(); }}>?</button>
    </header>`;
  }

  function Dialogs() {
    const d = state.dialog;
    return html`
      ${state.about ? html`<dialog open class="pico" data-testid="about-dialog"><article class="suite-about">
        <header><strong>${Suite.t(app.title)}</strong></header>
        ${aboutInfo().modified ? html`<p class="suite-modified" data-testid="modified-notice" role="note"><strong>${Suite.t('shell.modifiedVersion')}:</strong> ${aboutInfo().modified}</p>` : null}
        <p>${Suite.t('shell.offline')}</p>
        <${Examples} />
        ${Suite.openFiles ? html`<${Suite.openFiles.Section} />` : null}
        ${Suite.workspace ? html`<${Suite.workspace.Section} />` : null}
        <${Shortcuts} />
        ${Suite.preferences ? html`<${Suite.preferences.Section} />` : null}
        <${Licence} />
        <p><small>Portable Web App Suite${app.version ? ` · ${app.version}` : ''}</small></p>
        <footer><button onClick=${() => { state.about = false; refresh(); }}>${Suite.t('common.close')}</button></footer>
      </article></dialog>` : null}
      ${/* (after the about dialog: a question asked from it comes in front of it) */ null}
      ${d ? html`<dialog open class="pico suite-confirm" data-testid="confirm"><article>
        <p>${d.message}</p>
        <footer>
          <button class="secondary" data-testid="confirm-cancel" onClick=${() => d.resolve(false)}>${d.cancel}</button>
          <button data-testid="confirm-ok" onClick=${() => d.resolve(true)}>${d.ok}</button>
        </footer></article></dialog>` : null}`;
  }

  // ---- licence (#suite-about, #suite-licenses: written by build.py) ----------------------------------------------

  let aboutData;
  function aboutInfo() {
    if (aboutData === undefined) {
      const el = document.getElementById('suite-about');
      try { aboutData = el ? JSON.parse(el.textContent) : {}; } catch (e) { aboutData = {}; }
    }
    return aboutData;
  }

  let licences = null; // decoded #suite-licenses
  async function loadLicences() {
    if (licences) return licences;
    const el = document.getElementById('suite-licenses');
    if (!el) return null;
    const binary = atob(el.textContent.trim());
    const packed = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) packed[i] = binary.charCodeAt(i);
    const text = await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    licences = JSON.parse(text);
    return licences;
  }

  function Licence() {
    const info = aboutInfo();
    const [data, setData] = useState(licences);
    if (!info.license) return null;
    const lang = Suite.i18n.language === 'de' ? 'de' : 'en';
    const open = (e) => { if (e.target.open && !data) loadLicences().then(setData, (err) => toast(Suite.i18n.describe(err), 'error')); };
    return html`<details class="suite-licence" data-testid="licence" onToggle=${open}>
      <summary>⚖ ${Suite.t('shell.licence')}</summary>
      <p data-testid="licence-summary">${info.copyright} · ${Suite.t('shell.licensedUnder', info.license)}<br />
        <small>${Suite.t('shell.source')}: <a href=${info.source} target="_blank" rel="noopener noreferrer">${info.source}</a></small></p>
      ${data ? html`
        <details data-testid="licence-notice"><summary>${Suite.t('shell.notice')}</summary><pre>${data.notice[lang]}</pre></details>
        <details data-testid="licence-text"><summary>${Suite.t('shell.licenceText', info.license)}</summary><pre>${data.license[lang]}</pre></details>
        <details data-testid="licence-components"><summary>${Suite.t('shell.components', data.components.length)}</summary>
          <ul class="suite-components">${data.components.map((c) => html`<li data-testid="component"><details><summary>${c.name} ${c.version} – ${c.license}</summary>
            ${c.texts.length ? c.texts.map((id) => html`<pre>${data.texts[id]}</pre>`) : html`<p><small>${Suite.t('shell.noLicenceText')}</small></p>`}</details></li>`)}</ul>
        </details>` : html`<p aria-busy="true"></p>`}
    </details>`;
  }

  /** Example files of the app (#suite-examples, embedded by build.py from tools/make_examples.py): opened in the app. */
  function Examples() {
    const el = document.getElementById('suite-examples');
    if (!el || !Suite.bridge || !Suite.bridge.openLocal) return null;
    let items = [];
    try { items = JSON.parse(el.textContent); } catch (e) { return null; }
    const lang = Suite.i18n.language;
    const shown = items.some((x) => x.lang === lang) ? items.filter((x) => x.lang === lang) : items.filter((x) => x.lang === 'en');
    if (!shown.length) return null;
    const open = async (item) => {
      try {
        const binary = atob(item.data);
        const packed = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        const blob = await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).blob();
        state.about = false;
        refresh();
        await Suite.bridge.openLocal(new File([blob], item.name));
      } catch (e) { toast(Suite.i18n.describe(e), 'error'); }
    };
    return html`<details class="suite-examples" data-testid="examples">
      <summary>📂 ${Suite.t('shell.examples')}</summary>
      <ul>${shown.map((x) => html`<li><button class="secondary outline" data-testid="example" data-name=${x.name} onClick=${() => open(x)}>${x.name}</button> <small>${x.title}</small></li>`)}</ul>
    </details>`;
  }

  /** Keyboard shortcuts of the app (#suite-shortcuts, built from the user documentation by build.py). */
  let shortcutData;
  function shortcutList() {
    if (shortcutData === undefined) {
      const el = document.getElementById('suite-shortcuts');
      try { shortcutData = el ? JSON.parse(el.textContent) : null; } catch (e) { shortcutData = null; }
    }
    return shortcutData ? shortcutData[Suite.i18n.language] || shortcutData.en || [] : [];
  }

  function Shortcuts() {
    const rows = shortcutList();
    if (!rows.length) return null;
    const groups = [];
    for (const r of rows) { if (!groups.length || groups[groups.length - 1].name !== r.group) groups.push({ name: r.group, rows: [] }); groups[groups.length - 1].rows.push(r); }
    const keys = (combo) => combo.split(/(?<=[^+])\+(?=.)/).map((k, i) => html`${i ? '+' : ''}<kbd>${k}</kbd>`);
    return html`<details class="suite-shortcuts" data-testid="shortcuts" open>
      <summary>⌨ ${Suite.t('shell.shortcuts')}</summary>
      ${groups.map((g) => html`${g.name ? html`<h4>${g.name}</h4>` : null}<table><tbody>${g.rows.map((r) => html`<tr data-testid="shortcut">
        <td>${r.keys.map((k, i) => html`${i ? html`<span class="suite-or"> / </span>` : null}${keys(k)}`)}</td><td>${r.text}</td></tr>`)}</tbody></table>`)}
    </details>`;
  }

  // Escape closes the information dialog, before an editor of the app (e.g. Univer, which listens on window) handles the key itself
  window.addEventListener('keydown', (e) => {
    if (!state.about || e.key !== 'Escape' || e.defaultPrevented) return;
    const inDialog = e.target && e.target.closest && e.target.closest('dialog');
    if (inDialog && !inDialog.matches('[data-testid=about-dialog]')) return; // (a dialog of its own, e.g. the colour picker)
    e.preventDefault();
    e.stopPropagation();
    state.about = false;
    refresh();
  }, true);

  // F1 or ? (outside of text fields) shows the information and keyboard shortcuts of the app
  document.addEventListener('keydown', (e) => {
    if (state.about && e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); state.about = false; refresh(); return; }
    if (!app || state.about || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key !== 'F1' && e.key !== '?') return;
    const el = e.target;
    if (e.key === '?' && el && el.closest && el.closest('input, textarea, select, [contenteditable], .cm-editor, .xterm')) return;
    e.preventDefault();
    state.about = true;
    refresh();
  });

  // Ctrl+Alt+I inserts a tab character into a multi-line text field (Tab itself moves the focus there; CodeMirror editors
  // have the same key in shared/js/cm-indent.js)
  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || !e.altKey || e.shiftKey || e.metaKey || e.code !== 'KeyI' || e.defaultPrevented) return;
    const el = e.target;
    if (!el || el.tagName !== 'TEXTAREA' || el.readOnly || el.disabled) return;
    e.preventDefault();
    // (insertText keeps the browser's undo; setRangeText where it is not supported)
    if (!document.execCommand || !document.execCommand('insertText', false, '\t')) {
      el.setRangeText('\t', el.selectionStart, el.selectionEnd, 'end');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  function Shell() {
    const [, setTick] = useState(0);
    useEffect(() => Suite.i18n.onChange(() => setTick((n) => n + 1)), []);
    return html`
      <${Header} />
      ${state.banner ? html`<p class="suite-banner pico" role="status" data-testid="banner">
        <span>${state.banner}</span>${(state.bannerActions || []).map((a) => html`<button data-testid=${a.testid || null} onClick=${() => { banner(null); a.run(); }}>${a.label}</button>`)}
        ${state.bannerActions ? null : html`<button class="secondary" onClick=${() => banner(null)}>${Suite.t('common.close')}</button>`}</p>` : null}
      <main class="suite-main" data-testid="main">${app.main ? app.main() : null}</main>
      <div class="suite-toasts pico" aria-live="polite">${state.toasts.map((t) => html`<div class=${`suite-toast ${t.kind}`} data-testid="toast" key=${t.id}>${t.message}</div>`)}</div>
      <${Dialogs} />
      ${Suite.palette ? html`<${Suite.palette.Palette} />` : null}`;
  }

  function refresh() {
    if (container) render(html`<${Shell} key=${Suite.i18n.language} />`, container);
    measure();
  }

  /** Window/tab title: "file name – app" (setFileName) or the app title. */
  let fileName = '';
  function updateTitle() {
    if (!app) return;
    // a modified version says so in the window title (NOTICE.md)
    const title = aboutInfo().modified ? `${Suite.t(app.title)} (${Suite.t('shell.modifiedShort')})` : Suite.t(app.title);
    document.title = fileName ? `${fileName} – ${title}` : title;
  }
  function setFileName(name) { if ((name || '') !== fileName) { fileName = name || ''; updateTitle(); } }

  /** Keep --suite-top at the bottom of the header (drawers and fixed panels start there). */
  let measured = -1;
  function measure() {
    const header = container && container.querySelector('.suite-header');
    if (!header) return;
    const banner = container.querySelector('.suite-banner');
    const bottom = Math.round(Math.max(header.getBoundingClientRect().bottom, banner ? banner.getBoundingClientRect().bottom : 0));
    if (bottom !== measured) { measured = bottom; document.documentElement.style.setProperty('--suite-top', `${bottom}px`); }
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(measure).observe(document.documentElement);
  window.addEventListener('resize', measure);

  /**
   * Select with the recently used files of an app (Suite.files.recent). Choosing one asks before() (e.g. to discard
   * unsaved changes), reopens the handle (the browser may ask for permission) and calls onOpen({ file, handle }).
   */
  function Recent({ app: id, onOpen, before = null }) {
    const [list, setList] = useState([]);
    useEffect(() => {
      let alive = true;
      const load = () => Suite.files.recent(id).then((l) => { if (alive) setList(l); });
      const changed = (e) => { if (e.detail === id) load(); };
      load();
      window.addEventListener('suite-recent', changed);
      return () => { alive = false; window.removeEventListener('suite-recent', changed); };
    }, [id]);
    if (!Suite.files.canWriteBack) return null;
    const pick = async (e) => {
      const value = e.target.value;
      e.target.value = '';
      if (value === 'clear') { await Suite.files.forget(id); return; }
      const item = list[Number(value)];
      if (!item || (before && !(await before()))) return;
      let picked = null;
      try { picked = await Suite.files.reopen(item.handle); } catch (err) { picked = null; }
      if (!picked) { toast(Suite.t('shell.reopenFailed'), 'error'); return; }
      Suite.files.remember(id, picked.handle);
      onOpen(picked);
    };
    return html`<select class="suite-recent" data-testid="recent" aria-label=${Suite.t('shell.recent')} title=${Suite.t('shell.recent')} onChange=${pick}>
      <option value="">🕘 ${Suite.t('shell.recent')}</option>
      ${list.length ? list.map((r, i) => html`<option value=${i}>${r.name}</option>`) : html`<option disabled>${Suite.t('shell.noRecent')}</option>`}
      ${list.length ? html`<option value="clear">✕ ${Suite.t('shell.clearRecent')}</option>` : null}
    </select>`;
  }

  /** Shade behind an open drawer on phones (hidden on wide screens); a tap on it calls onClose. */
  function backdrop(onClose) {
    return html`<div class="suite-backdrop" data-testid="backdrop" onMouseDown=${(e) => { const a = document.activeElement; if (a && a !== document.body && !a.closest('.suite-drawer')) e.preventDefault(); /* (keeps e.g. text editing outside the drawer; fields in it still commit on blur) */ }} onClick=${(e) => { e.preventDefault(); onClose(); }}></div>`;
  }

  /**
   * Icon-only buttons (✕, 🖨, ⏏ …) get their title as aria-label: screen readers would otherwise read the symbol, and titles are
   * not announced on touch devices. Buttons with words keep their text as name; an aria-label set by the app is kept.
   */
  const ICON_ONLY = (s) => !/\p{L}{2}/u.test(s);
  function labelIcons(root) {
    for (const el of root.querySelectorAll('button[title], [role=button][title], a[title], summary[title]')) {
      const auto = el.dataset.autoLabel !== undefined;
      if (el.hasAttribute('aria-label') && !auto) continue;
      if (!ICON_ONLY(el.textContent)) { if (auto) { el.removeAttribute('aria-label'); delete el.dataset.autoLabel; } continue; }
      const title = el.getAttribute('title');
      if (el.getAttribute('aria-label') !== title) { el.setAttribute('aria-label', title); el.dataset.autoLabel = ''; }
    }
  }
  let labelQueued = false;
  new MutationObserver(() => {
    if (labelQueued) return;
    labelQueued = true;
    queueMicrotask(() => { labelQueued = false; labelIcons(document.body); });
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['title'], characterData: true });

  /** Render the app frame into #app (or options.container). */
  function mount(options) {
    app = options;
    container = options.container || document.getElementById('app');
    applyTheme(storedTheme());
    Suite.i18n.onChange(() => { updateTitle(); refresh(); });
    updateTitle();
    refresh();
  }

  function closeAbout() { state.about = false; refresh(); }

  /** Extra controls in the header, before the shell's own buttons (e.g. the spelling selector of shared/js/spell-dom.js). */
  const headerItems = [];
  function addHeaderItem(component) { headerItems.push(component); refresh(); }

  Suite.shell = { get appId() { return app && app.id; }, mount, refresh, toast, banner, confirm, setDirty, setTheme, backdrop, Recent, setFileName, closeAbout, addHeaderItem, html };
})(window.Suite = window.Suite || {});

/*
 * Preferences of the suite (theme, language and the settings of every app, kept in localStorage) as a file: exported and
 * imported in the about dialog, in the format of the application data files (shared/js/settings.js), so that the same
 * JSON file – or, through the connection file of an app with connections (shared/js/appdata.js), a KeePass database –
 * holds connections and preferences of the whole suite:
 *
 *   { format: "portable-web-app-suite", version: 1, apps: { suite: { settings: { preferences: { "suite.theme": "dark", ... } } } } }
 *
 *   Suite.preferences.collect() -> { key: value }      Suite.preferences.apply(prefs) -> number of keys written
 *
 * Chromium shares localStorage among all apps opened from file://; Firefox keeps it per file, so there the file carries the
 * preferences of the app it was exported from (and the shared ones).
 */
(function (Suite) {
  'use strict';

  const { html, useState } = htmPreact;
  const KEY = /^suite\.|^[a-z]+\.prefs$/;
  const SKIP = new Set(['suite.mediaplayer.resume']); // playback positions belong to this device
  const TYPES = { json: [{ description: 'Settings', accept: { 'application/json': ['.json'] } }], kdbx: [{ description: 'KeePass', accept: { 'application/octet-stream': ['.kdbx'] } }] };

  Suite.i18n.register({
    en: {
      'prefs.author': 'Your name (for comments)', 'prefs.title': 'Settings', 'prefs.hint': 'Theme, language and the settings of the applications, as a file (for another computer or browser).',
      'prefs.export': 'Export…', 'prefs.import': 'Import…', 'prefs.imported': '{0} settings imported.', 'prefs.reload': 'Reload to apply them?',
      'prefs.none': 'The file contains no settings.',
      'prefs.inFile': 'The file also contains settings of the suite.', 'prefs.apply': 'Apply settings',
      'prefs.format': 'Format', 'prefs.kdbxFormat': 'KeePass database (encrypted)', 'prefs.jsonFormat': 'JSON file (not encrypted)', 'prefs.password': 'Password',
      'prefs.repeat': 'Repeat password', 'prefs.mismatch': 'The passwords do not match.', 'prefs.save': 'Save', 'prefs.open': 'Open', 'prefs.cancel': 'Cancel',
      'prefs.unlock': 'The file is a KeePass database: enter its password.', 'prefs.wrongPassword': 'The password is wrong, or the file is damaged.',
      'prefs.noKdbx': 'This application cannot read KeePass files.', 'prefs.include': 'Include', 'prefs.take': 'Take from the file',
      'prefs.credentials': 'passwords', 'prefs.others': 'The file also contains connections of: {0} – open it as the connection file of that application.',
      'prefs.unencrypted': 'The JSON file will contain passwords and other credentials in readable form: anyone who gets the file can use them. Use a KeePass database instead, or leave them out.',
      'prefs.ack': 'I understand: write them unencrypted', 'prefs.ackNeeded': 'Confirm that the credentials may be written unencrypted, choose KeePass, or leave them out.',
      'prefs.importedData': '{0} entries imported (save the connection file to keep them). Settings take effect after a reload.',
      'prefs.group.general': 'General (theme, language, spelling, symbols, …)', 'prefs.group.texteditor': 'Text editor', 'prefs.group.hexeditor': 'Hex editor', 'prefs.group.archive': 'Archive manager', 'prefs.group.mediaplayer': 'Media player', 'prefs.group.audioeditor': 'Audio editor', 'prefs.group.videoeditor': 'Video editor', 'prefs.group.imageeditor': 'Image editor', 'prefs.group.diagram': 'Diagram editor', 'prefs.group.keepass': 'KeePass', 'prefs.group.spreadsheet': 'Spreadsheet', 'prefs.group.document': 'Document', 'prefs.group.presentation': 'Presentation', 'prefs.group.reveal': 'Web slides', 'prefs.group.pdfviewer': 'PDF viewer', 'prefs.group.calendar': 'Calendar', 'prefs.group.mail': 'Mail', 'prefs.group.dbtool': 'Database tool', 'prefs.group.ssh': 'SSH', 'prefs.group.ftp': 'FTP/SFTP', 'prefs.group.http': 'HTTP analyzer', 'prefs.group.webinspector': 'Web inspector', 'prefs.group.barcode': 'Barcode', 'prefs.group.notebook': 'Python notebook', 'prefs.group.overview': 'Overview',
    },
    de: {
      'prefs.author': 'Ihr Name (für Kommentare)', 'prefs.title': 'Einstellungen', 'prefs.hint': 'Design, Sprache und die Einstellungen der Anwendungen als Datei (für einen anderen Rechner oder Browser).',
      'prefs.export': 'Exportieren…', 'prefs.import': 'Importieren…', 'prefs.imported': '{0} Einstellungen importiert.', 'prefs.reload': 'Neu laden, um sie anzuwenden?',
      'prefs.none': 'Die Datei enthält keine Einstellungen.',
      'prefs.inFile': 'Die Datei enthält auch Einstellungen der Suite.', 'prefs.apply': 'Einstellungen übernehmen',
      'prefs.format': 'Format', 'prefs.kdbxFormat': 'KeePass-Datenbank (verschlüsselt)', 'prefs.jsonFormat': 'JSON-Datei (unverschlüsselt)', 'prefs.password': 'Passwort',
      'prefs.repeat': 'Passwort wiederholen', 'prefs.mismatch': 'Die Passwörter stimmen nicht überein.', 'prefs.save': 'Speichern', 'prefs.open': 'Öffnen', 'prefs.cancel': 'Abbrechen',
      'prefs.unlock': 'Die Datei ist eine KeePass-Datenbank: Geben Sie ihr Passwort ein.', 'prefs.wrongPassword': 'Das Passwort ist falsch oder die Datei beschädigt.',
      'prefs.noKdbx': 'Diese Anwendung kann keine KeePass-Dateien lesen.', 'prefs.include': 'Aufnehmen', 'prefs.take': 'Aus der Datei übernehmen',
      'prefs.credentials': 'Passwörter', 'prefs.others': 'Die Datei enthält auch Verbindungen von: {0} – öffnen Sie sie als Verbindungsdatei dieser Anwendung.',
      'prefs.unencrypted': 'Die JSON-Datei enthält Passwörter und andere Zugangsdaten lesbar: Wer die Datei erhält, kann sie verwenden. Wählen Sie stattdessen eine KeePass-Datenbank, oder lassen Sie sie weg.',
      'prefs.ack': 'Verstanden: unverschlüsselt schreiben', 'prefs.ackNeeded': 'Bestätigen Sie, dass die Zugangsdaten unverschlüsselt geschrieben werden dürfen, wählen Sie KeePass, oder lassen Sie sie weg.',
      'prefs.importedData': '{0} Einträge importiert (speichern Sie die Verbindungsdatei, um sie zu behalten). Einstellungen wirken nach dem Neuladen.',
      'prefs.group.general': 'Allgemein (Design, Sprache, Rechtschreibung, Symbole, …)', 'prefs.group.texteditor': 'Texteditor', 'prefs.group.hexeditor': 'Hex-Editor', 'prefs.group.archive': 'Archivmanager', 'prefs.group.mediaplayer': 'Medienplayer', 'prefs.group.audioeditor': 'Audio-Editor', 'prefs.group.videoeditor': 'Video-Editor', 'prefs.group.imageeditor': 'Bildbearbeitung', 'prefs.group.diagram': 'Diagramm-Editor', 'prefs.group.keepass': 'KeePass', 'prefs.group.spreadsheet': 'Tabellenkalkulation', 'prefs.group.document': 'Dokument', 'prefs.group.presentation': 'Präsentation', 'prefs.group.reveal': 'Web-Folien', 'prefs.group.pdfviewer': 'PDF-Betrachter', 'prefs.group.calendar': 'Kalender', 'prefs.group.mail': 'Mail', 'prefs.group.dbtool': 'Datenbank-Werkzeug', 'prefs.group.ssh': 'SSH', 'prefs.group.ftp': 'FTP/SFTP', 'prefs.group.http': 'HTTP-Analyse', 'prefs.group.webinspector': 'Web-Inspektor', 'prefs.group.barcode': 'Barcode', 'prefs.group.notebook': 'Python-Notebook', 'prefs.group.overview': 'Übersicht',
    },
  });

  function collect() {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (KEY.test(k) && !SKIP.has(k)) out[k] = localStorage.getItem(k);
      }
    } catch (e) { /* storage blocked */ }
    return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
  }

  function apply(prefs) {
    let n = 0;
    for (const [k, v] of Object.entries(prefs || {})) {
      if (!KEY.test(k) || SKIP.has(k) || typeof v !== 'string') continue;
      try { localStorage.setItem(k, v); n += 1; } catch (e) { /* storage blocked */ }
    }
    return n;
  }

  /** Apply preferences and offer to reload (apps read their settings when they start). */
  async function applyAndReload(prefs) {
    const n = apply(prefs);
    if (!n) { Suite.shell.toast(Suite.t('prefs.none'), 'warning'); return; }
    if (!(await Suite.shell.confirm(`${Suite.t('prefs.imported', n)} ${Suite.t('prefs.reload')}`))) return;
    // (kept for the reloaded page as well: see the beginning of i18n.js)
    try { sessionStorage.setItem('suite.importedPrefs', JSON.stringify(Object.fromEntries(Object.entries(prefs).filter(([k, v]) => KEY.test(k) && !SKIP.has(k) && typeof v === 'string')))); } catch (e) { /* storage blocked */ }
    location.reload();
  }

  const fail = (e) => { console.warn(e); Suite.shell.toast(Suite.i18n.describe(e), 'error'); };
  const isKdbx = (bytes) => bytes[0] === 0x03 && bytes[1] === 0xd9 && bytes[2] === 0xa2 && bytes[3] === 0x9a;
  const canKdbx = () => !!(Suite.settings && Suite.kdbx);

  // ---- what an export contains -------------------------------------------------------------------------------------
  // Preferences are grouped by application (keys suite.<app>… and <app>.prefs; the rest is "general"). An application shows its
  // own group and the general one; the overview shows all. Other data – connections and passwords, the relay sign-in – comes
  // from sources the applications register (shared/js/appdata.js):
  //   Suite.preferences.register({ id, label(), sensitive, available(), write(store), count(store), read(store) -> number })

  const APPS = ['texteditor', 'hexeditor', 'archive', 'mediaplayer', 'audioeditor', 'videoeditor', 'imageeditor', 'diagram', 'keepass', 'spreadsheet',
    'document', 'presentation', 'reveal', 'pdfviewer', 'calendar', 'mail', 'dbtool', 'ssh', 'ftp', 'http', 'webinspector', 'barcode', 'notebook', 'overview'];
  const groupOf = (key) => {
    const m = /^suite\.([a-z]+)(?:\.|$)/.exec(key) || /^([a-z]+)\.prefs$/.exec(key);
    return m && APPS.includes(m[1]) ? m[1] : 'general';
  };
  /** The preference groups of this page: { group: { key: value } } (an application: its own and the general ones). */
  function groupsOf(prefs, all = Suite.shell.appId === 'overview') {
    const out = {};
    for (const [k, v] of Object.entries(prefs)) {
      const g = groupOf(k);
      if (!all && g !== 'general' && g !== Suite.shell.appId) continue;
      (out[g] = out[g] || {})[k] = v;
    }
    return out;
  }
  const groupLabel = (g) => Suite.t(`prefs.group.${g}`);
  const sources = [];
  function register(source) { if (!sources.some((x) => x.id === source.id)) sources.push(source); }

  /** Write the chosen data into a new store: kind 'json' (not encrypted) or 'kdbx' (KeePass with the password). */
  async function settingsBytes({ kind = 'json', password = '', prefs = collect(), from = [] } = {}) {
    const { store } = await Suite.settings.create(kind, { password, name: 'Portable Web App Suite settings' });
    store.app('suite').settings = { ...(store.app('suite').settings || {}), preferences: prefs };
    for (const src of from) await src.write(store);
    return new Uint8Array(await store.toBytes());
  }
  async function exportFile({ kind = 'json', password = '', prefs = collect(), from = [] } = {}) {
    const bytes = await settingsBytes({ kind, password, prefs, from });
    const result = await Suite.files.saveAs(bytes, kind === 'kdbx'
      ? { suggestedName: 'suite-settings.kdbx', types: TYPES.kdbx, type: 'application/octet-stream' }
      : { suggestedName: 'suite-settings.json', types: TYPES.json, type: 'application/json' });
    if (result) Suite.shell.toast(result.message);
    return !!result;
  }

  /** Open a settings file (JSON, or KeePass with the password – also a connection file of an application). */
  async function openFile(bytes, password = '') {
    if (isKdbx(bytes)) {
      if (!canKdbx()) throw new Suite.LocalizedError('prefs.noKdbx');
      try { return await Suite.settings.open(bytes, { password }); } catch (e) { throw new Suite.LocalizedError('prefs.wrongPassword'); }
    }
    try { return await Suite.settings.open(bytes); } catch (e) { throw new Suite.LocalizedError('prefs.none'); }
  }
  /** The preferences of a settings file (or null). */
  async function readFile(bytes, password = '') {
    const store = await openFile(bytes, password);
    return (store.app('suite').settings || {}).preferences || null;
  }

  /** Pick a settings file; resolves to { bytes, kdbx } or null. */
  async function pickFile() {
    const picked = await Suite.files.open({ types: [{ description: 'Settings', accept: { 'application/json': ['.json'], 'application/octet-stream': ['.kdbx'] } }] });
    if (!picked) return null;
    const bytes = new Uint8Array(await picked[0].file.arrayBuffer());
    return { bytes, kdbx: isKdbx(bytes) };
  }

  /** Export: choose what to include and the format; import: what to take from the file (after its password). */
  function Transfer() {
    const [form, setForm] = useState(null);
    const [error, setError] = useState('');
    const update = (patch) => setForm({ ...form, ...patch });
    const toggle = (set, id) => { const next = new Set(form[set]); if (next.has(id)) next.delete(id); else next.add(id); update({ [set]: next }); };

    const startExport = () => {
      setError('');
      const groups = groupsOf(collect());
      const available = allSources().filter((src) => src.available());
      setForm({ mode: 'export', kind: canKdbx() ? 'kdbx' : 'json', password: '', repeat: '', ack: false, groups, available,
        chosen: new Set(Object.keys(groups)), chosenSources: new Set(available.map((src) => src.id)) });
    };
    const startImport = async () => {
      const file = await pickFile();
      if (!file) return;
      if (file.kdbx && !canKdbx()) { Suite.shell.toast(Suite.t('prefs.noKdbx'), 'warning'); return; }
      setError('');
      if (file.kdbx) { setForm({ mode: 'unlock', bytes: file.bytes, password: '' }); return; }
      await showContents(await openFile(file.bytes));
    };
    const showContents = async (store) => {
      const prefs = (store.app('suite').settings || {}).preferences || {};
      const groups = groupsOf(prefs);
      const offered = allSources().filter((src) => src.count(store) > 0);
      const others = store.apps().filter((a) => a !== 'suite' && !offered.some((src) => src.app === a) && ((store.app(a).connections() || []).length));
      if (!Object.keys(groups).length && !offered.length) { setForm(null); Suite.shell.toast(Suite.t('prefs.none'), 'warning'); return; }
      setForm({ mode: 'import', store, groups, offered, others, chosen: new Set(Object.keys(groups)), chosenSources: new Set(offered.map((src) => src.id)) });
    };

    const submit = async (e) => {
      e.preventDefault();
      setError('');
      try {
        if (form.mode === 'unlock') { await showContents(await openFile(form.bytes, form.password)); return; }
        const prefs = Object.assign({}, ...[...form.chosen].map((g) => form.groups[g] || {}));
        const picked = form[form.mode === 'export' ? 'available' : 'offered'].filter((src) => form.chosenSources.has(src.id));
        if (form.mode === 'export') {
          if (form.kind === 'kdbx' && form.password !== form.repeat) { setError(Suite.t('prefs.mismatch')); return; }
          if (form.kind === 'json' && picked.some((src) => src.sensitive) && !form.ack) { setError(Suite.t('prefs.ackNeeded')); return; }
          if (await exportFile({ kind: form.kind, password: form.password, prefs, from: picked })) setForm(null);
          return;
        }
        // import: the data of the sources first (they live in memory: no reload then), then the preferences
        let n = 0;
        for (const src of picked) n += await src.read(form.store);
        setForm(null);
        if (n) {
          apply(prefs);
          Suite.shell.closeAbout();
          Suite.shell.toast(Suite.t('prefs.importedData', n), 'info', 8000);
        } else if (Object.keys(prefs).length) {
          Suite.shell.closeAbout();
          await applyAndReload(prefs);
        }
      } catch (err) { setError(Suite.i18n.describe(err)); }
    };

    const box = (set, id, label, extra = null) => html`<label class="suite-prefs-item"><input type="checkbox" data-testid=${`prefs-item-${id}`} checked=${form[set].has(id)}
      onChange=${() => toggle(set, id)} />${label}${extra}</label>`;
    const items = () => html`<fieldset class="suite-prefs-items" data-testid="prefs-items"><legend>${Suite.t(form.mode === 'export' ? 'prefs.include' : 'prefs.take')}</legend>
      ${Object.keys(form.groups).sort((a, b) => (a === 'general' ? -1 : b === 'general' ? 1 : groupLabel(a).localeCompare(groupLabel(b))))
        .map((g) => box('chosen', g, groupLabel(g), html` <small>(${Object.keys(form.groups[g]).length})</small>`))}
      ${(form.available || form.offered).map((src) => box('chosenSources', src.id, src.label(), src.sensitive ? html` <small class="suite-prefs-secret">🔑 ${Suite.t('prefs.credentials')}</small>` : null))}
      ${form.others && form.others.length ? html`<small>${Suite.t('prefs.others', form.others.map(groupLabel).join(', '))}</small>` : null}
    </fieldset>`;
    const unencryptedSecrets = form && form.mode === 'export' && form.kind === 'json' && form.available.some((src) => src.sensitive && form.chosenSources.has(src.id));

    return html`<div role="group">
        <button class="secondary outline" data-testid="prefs-export" onClick=${startExport}>${Suite.t('prefs.export')}</button>
        <button class="secondary outline" data-testid="prefs-import" onClick=${() => startImport().catch(fail)}>${Suite.t('prefs.import')}</button>
      </div>
      ${form ? html`<form class="suite-prefs-form" data-testid="prefs-form" onSubmit=${submit}>
        ${form.mode === 'unlock' ? html`<small>${Suite.t('prefs.unlock')}</small>
          <label>${Suite.t('prefs.password')}<input type="password" data-testid="prefs-password" autocomplete="current-password" value=${form.password} onInput=${(e) => update({ password: e.target.value })} /></label>` : items()}
        ${form.mode === 'export' ? html`
          <label>${Suite.t('prefs.format')}<select data-testid="prefs-format" onChange=${(e) => update({ kind: e.target.value })}>
            ${canKdbx() ? html`<option value="kdbx" selected=${form.kind === 'kdbx'}>${Suite.t('prefs.kdbxFormat')}</option>` : null}
            <option value="json" selected=${form.kind === 'json'}>${Suite.t('prefs.jsonFormat')}</option></select></label>
          ${form.kind === 'kdbx' ? html`
            <label>${Suite.t('prefs.password')}<input type="password" data-testid="prefs-password" autocomplete="new-password" value=${form.password} onInput=${(e) => update({ password: e.target.value })} /></label>
            <label>${Suite.t('prefs.repeat')}<input type="password" data-testid="prefs-repeat" autocomplete="new-password" value=${form.repeat} onInput=${(e) => update({ repeat: e.target.value })} /></label>` : null}
          ${unencryptedSecrets ? html`<div class="suite-prefs-warning" data-testid="prefs-warning" role="alert">⚠ ${Suite.t('prefs.unencrypted')}
            <label><input type="checkbox" data-testid="prefs-ack" checked=${form.ack} onChange=${(e) => update({ ack: e.target.checked })} />${Suite.t('prefs.ack')}</label></div>` : null}` : null}
        ${error ? html`<small class="suite-prefs-error" data-testid="prefs-error" role="alert">${error}</small>` : null}
        <div role="group"><button type="button" class="secondary outline" onClick=${() => setForm(null)}>${Suite.t('prefs.cancel')}</button>
          <button type="submit" data-testid="prefs-ok">${form.mode === 'export' ? Suite.t('prefs.save') : form.mode === 'unlock' ? Suite.t('prefs.open') : Suite.t('prefs.apply')}</button></div>
      </form>` : null}`;
  }

  const authorSetting = () => { try { return localStorage.getItem('suite.author') || ''; } catch (e) { return ''; } };
  function Section() {
    return html`<details class="suite-prefs" data-testid="prefs">
      <summary>⚙ ${Suite.t('prefs.title')}</summary>
      <p><small>${Suite.t('prefs.hint')}</small></p>
      <${Transfer} />
      ${Suite.symbols && Suite.symbols.available() ? html`<fieldset class="suite-prefs-symbols" data-testid="prefs-symbols">
        <legend>${Suite.t('sym.settings')}</legend>
        <label><input type="checkbox" role="switch" data-testid="pref-symbols-button" checked=${Suite.symbols.settings.button}
          onChange=${(e) => Suite.symbols.setSetting('button', e.target.checked)} /> ${Suite.t('sym.settingButton')}</label>
        <label><input type="checkbox" role="switch" data-testid="pref-symbols-emoticons" checked=${Suite.symbols.settings.emoticons}
          onChange=${(e) => Suite.symbols.setSetting('emoticons', e.target.checked)} /> ${Suite.t('sym.settingEmoticons')}</label>
      </fieldset>` : null}
      <label class="suite-prefs-author">${Suite.t('prefs.author')}<input data-testid="pref-author" autocomplete="name" value=${authorSetting()}
        onChange=${(e) => { try { localStorage.setItem('suite.author', e.target.value.trim()); } catch (err) { /* storage blocked */ } window.dispatchEvent(new CustomEvent('suite-author')); }} /></label>
      ${Suite.fonts ? html`<${Suite.fonts.Settings} />` : null}
      ${Suite.archiveLink ? html`<label class="suite-prefs-archives"><input type="checkbox" role="switch" data-testid="pref-archives" checked=${Suite.archiveLink.settings.enabled}
          onChange=${(e) => Suite.archiveLink.setEnabled(e.target.checked)} /> ${Suite.t('alink.setting')}</label>` : null}
      ${Suite.colors ? html`<label class="suite-prefs-colors">${Suite.t('col.setting')}
        <select data-testid="pref-colors" onChange=${(e) => Suite.colors.setNative(e.target.value === 'browser')}>
          <option value="own" selected=${!Suite.colors.settings.native}>${Suite.t('col.own')}</option>
          <option value="browser" selected=${Suite.colors.settings.native}>${Suite.t('col.browser')}</option>
        </select></label>` : null}
    </details>`;
  }

  /** The sources of this page (and, in the overview, of the applications in its tabs: setHosted(() => [window, …])). */
  let hosted = () => [];
  const setHosted = (fn) => { hosted = fn; };
  function allSources() {
    const out = [...sources];
    for (const w of hosted()) {
      try { for (const src of (w && w.Suite && w.Suite.preferences ? w.Suite.preferences.ownSources() : [])) if (!out.some((x) => x.id === src.id)) out.push(src); } catch (e) { /* not ready */ }
    }
    return out;
  }

  Suite.preferences = { collect, apply, applyAndReload, readFile, openFile, exportFile, settingsBytes, register, groupOf, groupsOf, isKdbx, canKdbx,
    ownSources: () => sources, allSources, setHosted, Section };
})(window.Suite = window.Suite || {});

/*
 * Command palette of every app (Ctrl+Shift+P, Ctrl+Shift+Space or ⌘ in the header): search all actions of the page and run
 * one with Enter. The actions are collected from the page itself – enabled buttons, tabs and the entries of menus (select
 * elements) – so every app has a palette without registering anything; apps can add more:
 *
 *   Suite.palette.register(() => [{ label: 'Insert table', run: () => insertTable() }]);
 *
 * Elements inside dialogs, the palette itself and the shell's own header buttons are left out.
 */
(function (Suite) {
  'use strict';

  const { html } = htmPreact;
  const providers = [];
  const state = { open: false, query: '', index: 0, items: [], restore: null };

  Suite.i18n.register({
    en: { 'palette.title': 'Commands', 'palette.placeholder': 'Type to search the commands…', 'palette.none': 'No matching command.', 'palette.open': 'Command palette (Ctrl+Shift+P)' },
    de: { 'palette.title': 'Befehle', 'palette.placeholder': 'Tippen, um die Befehle zu durchsuchen…', 'palette.none': 'Kein passender Befehl.', 'palette.open': 'Befehlspalette (Strg+Umschalt+P)' },
  });

  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const hasWords = (s) => /\p{L}{2}/u.test(s);

  function labelOf(el) {
    const text = clean(el.textContent);
    const title = clean(el.getAttribute('title') || el.getAttribute('aria-label'));
    if (title && text && hasWords(text) && !fold(title).includes(fold(text))) return `${text} – ${title}`;
    return title || text;
  }

  /** The actions of the page: [{ label, run, group }]. */
  function collect() {
    const out = [];
    const seen = new Set();
    const add = (label, run, group = '') => {
      const l = clean(label);
      if (!l || !hasWords(l) && l.length < 2) return;
      const key = fold(l);
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ label: l, run, group });
    };
    const root = document.getElementById('app') || document.body;
    for (const el of root.querySelectorAll('button, [role=tab], a[href="#"], select')) {
      if (el.closest('dialog, .suite-palette, [data-palette-skip]') || el.disabled || el.closest('[aria-hidden=true]')) continue;
      if (['theme', 'language', 'about', 'palette-button'].includes(el.dataset.testid)) continue;
      if (el.tagName === 'SELECT') {
        const first = el.options[0];
        const name = clean(el.getAttribute('aria-label') || el.getAttribute('title') || (first && first.value === '' ? first.textContent : ''));
        for (const opt of el.options) {
          if (opt.disabled || opt.value === '' || opt.selected) continue;
          add(name ? `${name.replace(/^\W+/u, '')}: ${clean(opt.textContent)}` : clean(opt.textContent), () => {
            el.value = opt.value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          });
        }
        continue;
      }
      add(labelOf(el), () => el.click());
    }
    for (const provider of providers) {
      try { for (const c of provider() || []) add(c.label, c.run, c.group); } catch (e) { console.warn(e); }
    }
    return out;
  }

  function matches(items, query) {
    const terms = fold(query).split(/\s+/).filter(Boolean);
    return items.filter((c) => terms.every((term) => fold(c.label).includes(term)));
  }

  function open() {
    state.restore = document.activeElement;
    state.items = collect();
    state.open = true;
    state.query = '';
    state.index = 0;
    Suite.shell.refresh();
    requestAnimationFrame(() => { const input = document.querySelector('[data-testid=palette-input]'); if (input) input.focus(); });
  }

  function close() {
    state.open = false;
    Suite.shell.refresh();
    const back = state.restore;
    if (back && back.isConnected && back.focus) back.focus();
  }

  function run(item) {
    close();
    if (item) setTimeout(() => item.run(), 0); // after the palette has closed and the focus is back
  }

  function Palette() {
    if (!state.open) return null;
    const list = matches(state.items, state.query);
    const index = Math.min(state.index, Math.max(0, list.length - 1));
    const key = (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        state.index = (index + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % Math.max(1, list.length);
        Suite.shell.refresh();
        requestAnimationFrame(() => { const el = document.querySelector('.suite-palette li.active'); if (el) el.scrollIntoView({ block: 'nearest' }); });
      } else if (e.key === 'Enter') { e.preventDefault(); run(list[index]); } else if (e.key === 'Escape') { e.preventDefault(); close(); }
    };
    return html`<div class="suite-palette-shade" onClick=${close}></div>
      <div class="suite-palette pico" role="dialog" aria-label=${Suite.t('palette.title')} data-testid="palette">
        <input type="search" data-testid="palette-input" placeholder=${Suite.t('palette.placeholder')} value=${state.query} autocomplete="off"
          role="combobox" aria-label=${Suite.t('palette.title')} aria-expanded="true" aria-controls="suite-palette-list" aria-autocomplete="list"
          aria-activedescendant=${list.length ? `suite-palette-${index}` : undefined}
          onInput=${(e) => { state.query = e.target.value; state.index = 0; Suite.shell.refresh(); }} onKeyDown=${key} />
        <ul role="listbox" id="suite-palette-list" aria-label=${Suite.t('palette.title')}>${list.slice(0, 60).map((c, i) => html`<li role="option" id=${`suite-palette-${i}`} aria-selected=${i === index ? 'true' : 'false'} class=${i === index ? 'active' : ''} data-testid="palette-item"
          onPointerDown=${(e) => e.preventDefault()} onClick=${() => run(c)}>${c.label}</li>`)}</ul>
        ${list.length ? null : html`<p data-testid="palette-none">${Suite.t('palette.none')}</p>`}
      </div>`;
  }

  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod || !e.shiftKey || e.altKey || !(e.code === 'KeyP' || e.code === 'Space')) return;
    e.preventDefault();
    e.stopPropagation();
    if (state.open) close(); else open();
  }, true);

  Suite.palette = { open, close, register: (provider) => providers.push(provider), Palette, collect, get isOpen() { return state.open; } };
})(window.Suite = window.Suite || {});

/*
 * The open files of an app as one archive: apps register what they have open (current content, also unsaved changes); the
 * about dialog (and the command palette) offers "Create an archive from the open files". The ZIP opens in the archive manager
 * (Suite.bridge) – there it can be changed, saved or passed on –, or is saved when the archive manager cannot be reached.
 *
 *   Suite.openFiles.register(async () => [{ name: 'notes.txt', bytes: Uint8Array }, …]);
 *   await Suite.openFiles.list()      -> [{ name, bytes, app }]   (the overview: the files of all its open apps, in folders per app)
 *   await Suite.openFiles.zip(files)  -> Uint8Array (deflated ZIP, UTF-8 names)
 */
(function (Suite) {
  'use strict';

  const { html, useState } = htmPreact;
  const providers = [];

  Suite.i18n.register({
    en: {
      'of.title': 'Open files', 'of.create': 'Create an archive from the open files…', 'of.none': 'No files are open.', 'of.make': 'Create archive',
      'of.cancel': 'Cancel', 'of.hint': 'The archive opens in the archive manager, where it can be changed and saved.', 'of.saved': 'The archive manager cannot be opened: the archive is saved instead.',
      'of.total': 'Together: {0}', 'of.unsaved': 'unsaved changes',
    },
    de: {
      'of.title': 'Geöffnete Dateien', 'of.create': 'Archiv aus den geöffneten Dateien erstellen…', 'of.none': 'Es sind keine Dateien geöffnet.', 'of.make': 'Archiv erstellen',
      'of.cancel': 'Abbrechen', 'of.hint': 'Das Archiv öffnet sich im Archivmanager, wo es geändert und gespeichert werden kann.', 'of.saved': 'Der Archivmanager kann nicht geöffnet werden: Das Archiv wird stattdessen gespeichert.',
      'of.total': 'Zusammen: {0}', 'of.unsaved': 'ungespeicherte Änderungen',
    },
  });

  const register = (provider) => { providers.push(provider); };
  let opener = null; // (name, make) => opens the archive in the archive manager; the overview opens it in a tab
  const setOpener = (fn) => { opener = fn; };
  const size = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

  /** The open files of this page (unique names; in the overview: "<app>/<name>" of every open app). */
  async function list() {
    const out = [];
    for (const provider of providers) {
      for (const f of (await provider()) || []) {
        if (!f || !f.name || !f.bytes) continue;
        out.push({ ...f, bytes: f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes), app: f.app || Suite.shell.appId });
      }
    }
    const seen = new Set();
    for (const f of out) {
      let name = f.name.replace(/^[\\/]+/, '').replace(/[\\]/g, '/');
      for (let n = 2; seen.has(name); n += 1) name = f.name.replace(/(\.[^./]+)?$/, ` (${n})$1`);
      seen.add(name);
      f.name = name;
    }
    return out;
  }

  // ---- ZIP writer (deflate with CompressionStream, store when that is missing or does not help) ----------------------------
  const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  async function deflate(bytes) {
    if (typeof CompressionStream !== 'function') return null;
    try { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); } catch (e) { return null; }
  }
  async function zip(files) {
    const parts = [], central = [];
    let offset = 0;
    const now = new Date();
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    for (const f of files) {
      const name = new TextEncoder().encode(f.name);
      const packed = await deflate(f.bytes);
      const method = packed && packed.length < f.bytes.length ? 8 : 0;
      const data = method ? packed : f.bytes;
      const crc = crc32(f.bytes);
      const header = (sig, extra) => {
        const h = new Uint8Array(extra + name.length);
        const v = new DataView(h.buffer);
        v.setUint32(0, sig, true);
        return [h, v];
      };
      const [local, lv] = header(0x04034b50, 30);
      lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, method, true); lv.setUint16(10, time, true); lv.setUint16(12, date, true);
      lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, f.bytes.length, true); lv.setUint16(26, name.length, true);
      local.set(name, 30);
      const [cd, cv] = header(0x02014b50, 46);
      cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, method, true); cv.setUint16(12, time, true); cv.setUint16(14, date, true);
      cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, f.bytes.length, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
      cd.set(name, 46);
      parts.push(local, data);
      central.push(cd);
      offset += local.length + data.length;
    }
    const size = central.reduce((n, c) => n + c.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, size, true); ev.setUint32(16, offset, true);
    return new Uint8Array(await new Blob([...parts, ...central, end]).arrayBuffer());
  }

  const archiveName = () => `${Suite.shell.appId === 'overview' ? 'suite' : Suite.shell.appId || 'files'}-open-files.zip`;

  /**
   * Make the archive of the files (an array, or a function returning a promise of one) and open it in the archive manager, or
   * save it. Call it from a click handler: the archive manager's window opens first (popup blockers), the archive follows.
   */
  async function createArchive(files) {
    const make = async () => zip(typeof files === 'function' ? await files() : files);
    const name = archiveName();
    if (opener) { await opener(name, make); return; }
    if (Suite.bridge && Suite.bridge.openIn) {
      try { await Suite.bridge.openIn('archive', { name, data: make, save: null }); return; } catch (e) { Suite.shell.toast(Suite.t('of.saved'), 'warning'); }
    }
    const result = await Suite.files.saveAs(await make(), { suggestedName: name, types: [{ description: 'ZIP', accept: { 'application/zip': ['.zip'] } }], type: 'application/zip' });
    if (result) Suite.shell.toast(result.message);
  }

  function Section() {
    const [files, setFiles] = useState(null); // null | [{ name, bytes, app, chosen }]
    if (!providers.length) return null;
    const start = async () => {
      try { setFiles((await list()).map((f) => ({ ...f, chosen: true }))); } catch (e) { Suite.shell.toast(Suite.i18n.describe(e), 'error'); }
    };
    const chosen = (files || []).filter((f) => f.chosen);
    const make = async () => {
      try { await createArchive(chosen); setFiles(null); Suite.shell.closeAbout(); } catch (e) { Suite.shell.toast(Suite.i18n.describe(e), 'error'); }
    };
    return html`<details class="suite-prefs suite-open-files" data-testid="open-files">
      <summary>📦 ${Suite.t('of.title')}</summary>
      <button class="secondary outline" data-testid="open-files-start" onClick=${start}>${Suite.t('of.create')}</button>
      ${files ? html`<div class="suite-prefs-form" data-testid="open-files-form">
        ${files.length ? html`<fieldset class="suite-prefs-items"><small>${Suite.t('of.hint')}</small>
          ${files.map((f, i) => html`<label class="suite-prefs-item"><input type="checkbox" data-testid="open-files-item" checked=${f.chosen}
            onChange=${() => setFiles(files.map((x, k) => (k === i ? { ...x, chosen: !x.chosen } : x)))} />${f.name} <small>${size(f.bytes.length)}${f.dirty ? ` · ${Suite.t('of.unsaved')}` : ''}</small></label>`)}
          <small data-testid="open-files-total">${Suite.t('of.total', size(chosen.reduce((n, f) => n + f.bytes.length, 0)))}</small></fieldset>`
        : html`<small data-testid="open-files-none">${Suite.t('of.none')}</small>`}
        <div role="group"><button type="button" class="secondary outline" onClick=${() => setFiles(null)}>${Suite.t('of.cancel')}</button>
          <button type="button" data-testid="open-files-ok" disabled=${!chosen.length} onClick=${make}>${Suite.t('of.make')}</button></div>
      </div>` : null}
    </details>`;
  }

  if (Suite.palette) Suite.palette.register(() => (providers.length ? [{ label: Suite.t('of.create').replace('…', ''), run: () => createArchive(list).catch((e) => Suite.shell.toast(Suite.i18n.describe(e), 'error')) }] : []));

  Suite.openFiles = { register, setOpener, list, zip, createArchive, Section };
})(window.Suite = window.Suite || {});

/**
 * Workspace (*.suite.zip): the open files (their current content) in a folder per application, workspace.json (which
 * application opens which file, the tab order and the active tab) and optionally the settings – settings.json, or
 * settings.kdbx (KeePass, with a password) as soon as credentials are included: those are never written unencrypted.
 * Opening a workspace restores the files as copies – the overview opens a tab per saved tab (setHost), an application only its
 * own files – applies the settings of this page (effective after a restart) and reads credentials into the connections.
 *   Suite.workspace.build({ files, settings, from, password }) -> ZIP bytes     Suite.workspace.read(bytes) -> { manifest, files, settings, kdbx }
 *   Suite.workspace.restore(ws, { files, settings, password }) -> { opened, prefs, entries }     Suite.workspace.unzip(bytes) -> Map
 */
(function (Suite) {
  const { html, useState } = htmPreact;
  const FORMAT = 'portable-web-app-suite-workspace';
  let host = null; // the overview: { restore(files, activeTab) -> number of files opened }
  const setHost = (h) => { host = h; };
  const P = () => Suite.preferences;
  const overview = () => Suite.shell.appId === 'overview';

  Suite.i18n.register({
    en: {
      'ws.title': 'Workspace', 'ws.hint': 'A workspace (.suite.zip) holds the open files – with unsaved changes – and, if you like, the settings, so you can continue elsewhere.',
      'ws.save': 'Save workspace…', 'ws.open': 'Open workspace…', 'ws.files': 'Files', 'ws.settings': 'Settings', 'ws.settingsOf': 'Settings of this application (and the general ones)',
      'ws.settingsAll': 'Settings of all applications', 'ws.password': 'Password (needed for credentials: the settings are then encrypted as a KeePass database)',
      'ws.passwordNeeded': 'Credentials are only written encrypted: enter a password, or leave them out.', 'ws.openFiles': 'Open {0} files (as copies)',
      'ws.others': '{0} files of other applications are not opened here – open the workspace in the overview for all of them.', 'ws.applySettings': 'Apply the settings (and connections) of the workspace',
      'ws.unlock': 'Password of the settings (KeePass)', 'ws.ok': 'Save', 'ws.openOk': 'Open', 'ws.cancel': 'Cancel', 'ws.invalid': 'This is not a workspace of the Portable Web App Suite.',
      'ws.notZip': 'The file is not a ZIP archive.', 'ws.unsupported': 'The archive uses a compression or encryption that is not supported.',
      'ws.opened': '{0} files opened.', 'ws.prefsApplied': '{0} settings applied (effective after a restart).', 'ws.entries': '{0} entries imported (save the connection file to keep them).',
      'ws.total': 'Together: {0}', 'ws.nothing': 'Choose at least one file or the settings.',
    },
    de: {
      'ws.title': 'Arbeitsbereich', 'ws.hint': 'Ein Arbeitsbereich (.suite.zip) enthält die geöffneten Dateien – mit ungespeicherten Änderungen – und auf Wunsch die Einstellungen, damit Sie anderswo weiterarbeiten können.',
      'ws.save': 'Arbeitsbereich speichern…', 'ws.open': 'Arbeitsbereich öffnen…', 'ws.files': 'Dateien', 'ws.settings': 'Einstellungen', 'ws.settingsOf': 'Einstellungen dieser Anwendung (und die allgemeinen)',
      'ws.settingsAll': 'Einstellungen aller Anwendungen', 'ws.password': 'Passwort (nötig für Zugangsdaten: die Einstellungen werden dann als KeePass-Datenbank verschlüsselt)',
      'ws.passwordNeeded': 'Zugangsdaten werden nur verschlüsselt geschrieben: Geben Sie ein Passwort ein, oder lassen Sie sie weg.', 'ws.openFiles': '{0} Dateien öffnen (als Kopien)',
      'ws.others': '{0} Dateien anderer Anwendungen werden hier nicht geöffnet – öffnen Sie den Arbeitsbereich in der Übersicht, um alle zu öffnen.', 'ws.applySettings': 'Die Einstellungen (und Verbindungen) des Arbeitsbereichs übernehmen',
      'ws.unlock': 'Passwort der Einstellungen (KeePass)', 'ws.ok': 'Speichern', 'ws.openOk': 'Öffnen', 'ws.cancel': 'Abbrechen', 'ws.invalid': 'Das ist kein Arbeitsbereich der Portable Web App Suite.',
      'ws.notZip': 'Die Datei ist kein ZIP-Archiv.', 'ws.unsupported': 'Das Archiv verwendet eine Komprimierung oder Verschlüsselung, die nicht unterstützt wird.',
      'ws.opened': '{0} Dateien geöffnet.', 'ws.prefsApplied': '{0} Einstellungen übernommen (wirksam nach einem Neustart).', 'ws.entries': '{0} Einträge importiert (speichern Sie die Verbindungsdatei, um sie zu behalten).',
      'ws.total': 'Zusammen: {0}', 'ws.nothing': 'Wählen Sie mindestens eine Datei oder die Einstellungen.',
    },
  });

  // ---- ZIP reader (stored and deflated entries; DecompressionStream) -------------------------------------------------------
  async function inflate(data) {
    if (typeof DecompressionStream !== 'function') throw new Suite.LocalizedError('ws.unsupported');
    return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  }
  /** The files of a ZIP archive: Map path -> bytes (folders left out). */
  async function unzip(bytes) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = bytes.length - 22;
    while (end >= 0 && v.getUint32(end, true) !== 0x06054b50) end -= 1;
    if (end < 0) throw new Suite.LocalizedError('ws.notZip');
    const count = v.getUint16(end + 10, true);
    let p = v.getUint32(end + 16, true);
    const out = new Map();
    const utf8 = new TextDecoder();
    for (let i = 0; i < count; i++) {
      if (p + 46 > bytes.length || v.getUint32(p, true) !== 0x02014b50) throw new Suite.LocalizedError('ws.notZip');
      const flags = v.getUint16(p + 8, true), method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true);
      const nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
      const name = utf8.decode(bytes.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + xlen + clen;
      if (name.endsWith('/')) continue;
      if (flags & 1 || (method !== 0 && method !== 8)) throw new Suite.LocalizedError('ws.unsupported');
      const start = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true);
      const data = bytes.subarray(start, start + csize);
      out.set(name, method === 8 ? await inflate(data) : data.slice());
    }
    return out;
  }

  /** The open files of this page with their place in the workspace ("<app>/<name>"). */
  async function filesOf() {
    return (await Suite.openFiles.list()).map((f) => ({ ...f, path: overview() ? f.name : `${f.app}/${f.name}`, file: f.file || f.name, tab: f.tab ?? 0 }));
  }
  const prefsOfPage = (prefs) => Object.assign({}, ...Object.values(P().groupsOf(prefs || {})));

  /** The workspace archive: files [{ path, app, file, tab, active, bytes }], settings (this page's), from: sources, password. */
  async function build({ files, settings = false, from = [], password = '' }) {
    const enc = new TextEncoder();
    const manifest = {
      format: FORMAT, version: 1, created: new Date().toISOString(), app: Suite.shell.appId,
      files: files.map((f) => ({ path: f.path, app: f.app, name: f.file, tab: f.tab })),
      activeTab: (files.find((f) => f.active) || {}).tab ?? null, settings: null,
    };
    const entries = files.map((f) => ({ name: f.path, bytes: f.bytes }));
    if (settings || from.length) {
      const kind = password || from.some((src) => src.sensitive) ? 'kdbx' : 'json';
      if (kind === 'kdbx' && !password) throw new Suite.LocalizedError('ws.passwordNeeded');
      manifest.settings = kind === 'kdbx' ? 'settings.kdbx' : 'settings.json';
      entries.push({ name: manifest.settings, bytes: await P().settingsBytes({ kind, password, prefs: settings ? prefsOfPage(P().collect()) : {}, from }) });
    }
    return Suite.openFiles.zip([{ name: 'workspace.json', bytes: enc.encode(JSON.stringify(manifest, null, 2)) }, ...entries]);
  }

  async function save(options) {
    const bytes = await build(options);
    const result = await Suite.files.saveAs(bytes, { suggestedName: `${overview() ? 'suite' : Suite.shell.appId}-workspace.suite.zip`,
      types: [{ description: 'Workspace', accept: { 'application/zip': ['.zip'] } }], type: 'application/zip' });
    if (result) Suite.shell.toast(result.message);
    return !!result;
  }

  /** Read a workspace archive. */
  async function read(bytes) {
    const entries = await unzip(bytes);
    let manifest = null;
    try { manifest = JSON.parse(new TextDecoder().decode(entries.get('workspace.json'))); } catch (e) { /* below */ }
    if (!manifest || manifest.format !== FORMAT || !Array.isArray(manifest.files)) throw new Suite.LocalizedError('ws.invalid');
    const files = manifest.files.filter((f) => f && typeof f.path === 'string' && typeof f.app === 'string' && entries.has(f.path))
      .map((f) => ({ path: f.path, app: f.app, tab: f.tab ?? 0, name: String(f.name || f.path).split(/[\\/]/).pop(), bytes: entries.get(f.path) }));
    const settings = (typeof manifest.settings === 'string' && entries.get(manifest.settings)) || null;
    return { manifest, files, settings, kdbx: !!settings && P().isKdbx(settings) };
  }
  /** The files of a workspace this page opens: in the overview all, in an application its own. */
  const filesFor = (ws) => (host ? ws.files : ws.files.filter((f) => f.app === Suite.shell.appId));

  /** Restore a workspace: the files (copies), then the settings and the credentials (after the password was checked). */
  async function restore(ws, { files = true, settings = false, password = '' } = {}) {
    const store = settings && ws.settings ? await P().openFile(ws.settings, password) : null; // a wrong password fails before anything opens
    let opened = 0;
    if (files) {
      if (host) opened = await host.restore(ws.files, ws.manifest.activeTab ?? null);
      else for (const f of filesFor(ws)) if (await Suite.bridge.openLocal(new File([f.bytes], f.name))) opened += 1;
    }
    let prefs = 0, entries = 0;
    if (store) {
      prefs = P().apply(prefsOfPage((store.app('suite').settings || {}).preferences));
      for (const src of P().allSources()) if (src.count(store) > 0) entries += await src.read(store);
    }
    return { opened, prefs, entries };
  }

  const size = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

  function Section() {
    const [form, setForm] = useState(null);
    const [error, setError] = useState('');
    if (!Suite.openFiles || !Suite.preferences || !Suite.settings) return null;
    const update = (patch) => setForm({ ...form, ...patch });
    const fail = (e) => setError(Suite.i18n.describe(e));

    const startSave = async () => {
      try {
        setError('');
        setForm({ mode: 'save', files: (await filesOf()).map((f) => ({ ...f, chosen: true })), settings: true, password: '', repeat: '',
          sources: P().allSources().filter((src) => src.available()),
          chosenSources: new Set(P().allSources().filter((src) => src.available() && !src.sensitive).map((src) => src.id)) }); // (credentials only when chosen)
      } catch (e) { fail(e); }
    };
    const startOpen = async () => {
      try {
        const picked = await Suite.files.open({ types: [{ description: 'Workspace', accept: { 'application/zip': ['.zip'] } }] });
        if (!picked) return;
        setError('');
        const ws = await read(new Uint8Array(await picked[0].file.arrayBuffer()));
        const mine = filesFor(ws);
        setForm({ mode: 'open', ws, mine, files: !!mine.length, settings: !!ws.settings, password: '' });
      } catch (e) { setForm(null); Suite.shell.toast(Suite.i18n.describe(e), 'error'); }
    };
    const submit = async (e) => {
      e.preventDefault();
      setError('');
      try {
        if (form.mode === 'save') {
          const files = form.files.filter((f) => f.chosen);
          const from = form.sources.filter((src) => form.chosenSources.has(src.id));
          if (!files.length && !form.settings && !from.length) { setError(Suite.t('ws.nothing')); return; }
          if (from.some((src) => src.sensitive) && !form.password) { setError(Suite.t('ws.passwordNeeded')); return; }
          if (form.password && form.password !== form.repeat) { setError(Suite.t('prefs.mismatch')); return; }
          if (await save({ files, settings: form.settings, from, password: form.password })) setForm(null);
          return;
        }
        const r = await restore(form.ws, { files: form.files, settings: form.settings, password: form.password });
        setForm(null);
        Suite.shell.closeAbout();
        Suite.shell.toast([Suite.t('ws.opened', r.opened), r.prefs ? Suite.t('ws.prefsApplied', r.prefs) : '', r.entries ? Suite.t('ws.entries', r.entries) : ''].filter(Boolean).join(' '), 'info', 8000);
      } catch (err) { fail(err); }
    };
    const toggleSource = (id) => { const next = new Set(form.chosenSources); if (next.has(id)) next.delete(id); else next.add(id); update({ chosenSources: next }); };
    const pw = (key, testid, label, auto) => html`<label>${label}<input type="password" data-testid=${testid} autocomplete=${auto} value=${form[key]}
      onInput=${(e) => update({ [key]: e.target.value })} /></label>`;

    const saveForm = () => {
      const chosen = form.files.filter((f) => f.chosen);
      return html`
        <fieldset class="suite-prefs-items"><legend>${Suite.t('ws.files')}</legend>
          ${form.files.length ? form.files.map((f, i) => html`<label class="suite-prefs-item"><input type="checkbox" data-testid="workspace-file" checked=${f.chosen}
            onChange=${() => update({ files: form.files.map((x, k) => (k === i ? { ...x, chosen: !x.chosen } : x)) })} />${f.path} <small>${size(f.bytes.length)}${f.dirty ? ` · ${Suite.t('of.unsaved')}` : ''}</small></label>`)
            : html`<small data-testid="workspace-nofiles">${Suite.t('of.none')}</small>`}
          <small data-testid="workspace-total">${Suite.t('ws.total', size(chosen.reduce((n, f) => n + f.bytes.length, 0)))}</small></fieldset>
        <fieldset class="suite-prefs-items"><legend>${Suite.t('ws.settings')}</legend>
          <label class="suite-prefs-item"><input type="checkbox" data-testid="workspace-settings" checked=${form.settings} onChange=${() => update({ settings: !form.settings })} />${Suite.t(overview() ? 'ws.settingsAll' : 'ws.settingsOf')}</label>
          ${form.sources.map((src) => html`<label class="suite-prefs-item"><input type="checkbox" data-testid=${`workspace-source-${src.id}`} checked=${form.chosenSources.has(src.id)}
            onChange=${() => toggleSource(src.id)} />${src.label()}${src.sensitive ? html` <small class="suite-prefs-secret">🔑 ${Suite.t('prefs.credentials')}</small>` : null}</label>`)}</fieldset>
        ${(form.settings || form.chosenSources.size) && P().canKdbx() ? html`${pw('password', 'workspace-password', Suite.t('ws.password'), 'new-password')}
          ${form.password ? pw('repeat', 'workspace-repeat', Suite.t('prefs.repeat'), 'new-password') : null}` : null}`;
    };
    const openForm = () => {
      const others = form.ws.files.length - form.mine.length;
      return html`
        <fieldset class="suite-prefs-items">
          <label class="suite-prefs-item"><input type="checkbox" data-testid="workspace-files" checked=${form.files} disabled=${!form.mine.length}
            onChange=${() => update({ files: !form.files })} />${Suite.t('ws.openFiles', form.mine.length)} <small>${size(form.mine.reduce((n, f) => n + f.bytes.length, 0))}</small></label>
          ${form.mine.map((f) => html`<small class="suite-prefs-item" data-testid="workspace-entry">${f.path}</small>`)}
          ${others ? html`<small data-testid="workspace-others">${Suite.t('ws.others', others)}</small>` : null}
          ${form.ws.settings ? html`<label class="suite-prefs-item"><input type="checkbox" data-testid="workspace-settings" checked=${form.settings}
            onChange=${() => update({ settings: !form.settings })} />${Suite.t('ws.applySettings')}${form.ws.kdbx ? html` <small class="suite-prefs-secret">🔒 KeePass</small>` : null}</label>` : null}
        </fieldset>
        ${form.settings && form.ws.kdbx ? pw('password', 'workspace-password', Suite.t('ws.unlock'), 'current-password') : null}`;
    };

    return html`<details class="suite-prefs suite-workspace" data-testid="workspace">
      <summary>🗂 ${Suite.t('ws.title')}</summary>
      <p><small>${Suite.t('ws.hint')}</small></p>
      <div role="group">
        <button class="secondary outline" data-testid="workspace-save" onClick=${startSave}>${Suite.t('ws.save')}</button>
        <button class="secondary outline" data-testid="workspace-open" onClick=${startOpen}>${Suite.t('ws.open')}</button>
      </div>
      ${form ? html`<form class="suite-prefs-form" data-testid="workspace-form" onSubmit=${submit}>
        ${form.mode === 'save' ? saveForm() : openForm()}
        ${error ? html`<small class="suite-prefs-error" data-testid="workspace-error" role="alert">${error}</small>` : null}
        <div role="group"><button type="button" class="secondary outline" onClick=${() => setForm(null)}>${Suite.t('ws.cancel')}</button>
          <button type="submit" data-testid="workspace-ok">${Suite.t(form.mode === 'save' ? 'ws.ok' : 'ws.openOk')}</button></div>
      </form>` : null}
    </details>`;
  }

  Suite.workspace = { build, read, restore, unzip, setHost, Section, FORMAT };
})(window.Suite = window.Suite || {});
