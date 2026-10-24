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
      ${d ? html`<dialog open class="pico" data-testid="confirm"><article>
        <p>${d.message}</p>
        <footer>
          <button class="secondary" data-testid="confirm-cancel" onClick=${() => d.resolve(false)}>${d.cancel}</button>
          <button data-testid="confirm-ok" onClick=${() => d.resolve(true)}>${d.ok}</button>
        </footer></article></dialog>` : null}
      ${state.about ? html`<dialog open class="pico" data-testid="about-dialog"><article class="suite-about">
        <header><strong>${Suite.t(app.title)}</strong></header>
        ${aboutInfo().modified ? html`<p class="suite-modified" data-testid="modified-notice" role="note"><strong>${Suite.t('shell.modifiedVersion')}:</strong> ${aboutInfo().modified}</p>` : null}
        <p>${Suite.t('shell.offline')}</p>
        <${Shortcuts} />
        ${Suite.preferences ? html`<${Suite.preferences.Section} />` : null}
        <${Licence} />
        <p><small>Portable Web App Suite${app.version ? ` · ${app.version}` : ''}</small></p>
        <footer><button onClick=${() => { state.about = false; refresh(); }}>${Suite.t('common.close')}</button></footer>
      </article></dialog>` : null}`;
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
    return html`<div class="suite-backdrop" data-testid="backdrop" onClick=${(e) => { e.preventDefault(); onClose(); }}></div>`;
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

  Suite.shell = { mount, refresh, toast, banner, confirm, setDirty, setTheme, backdrop, Recent, setFileName, closeAbout, addHeaderItem, html };
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

  const { html } = htmPreact;
  const KEY = /^suite\.|^[a-z]+\.prefs$/;
  const SKIP = new Set(['suite.mediaplayer.resume']); // playback positions belong to this device
  const TYPES = [{ description: 'Settings', accept: { 'application/json': ['.json'] } }];

  Suite.i18n.register({
    en: {
      'prefs.title': 'Settings', 'prefs.hint': 'Theme, language and the settings of the applications, as a file (for another computer or browser).',
      'prefs.export': 'Export…', 'prefs.import': 'Import…', 'prefs.imported': '{0} settings imported.', 'prefs.reload': 'Reload to apply them?',
      'prefs.none': 'The file contains no settings.', 'prefs.kdbx': 'KeePass files are opened with “Connections: Open…” in an application with connections (database tool, SSH, FTP, mail, HTTP).',
      'prefs.inFile': 'The file also contains settings of the suite.', 'prefs.apply': 'Apply settings',
    },
    de: {
      'prefs.title': 'Einstellungen', 'prefs.hint': 'Design, Sprache und die Einstellungen der Anwendungen als Datei (für einen anderen Rechner oder Browser).',
      'prefs.export': 'Exportieren…', 'prefs.import': 'Importieren…', 'prefs.imported': '{0} Einstellungen importiert.', 'prefs.reload': 'Neu laden, um sie anzuwenden?',
      'prefs.none': 'Die Datei enthält keine Einstellungen.', 'prefs.kdbx': 'KeePass-Dateien werden mit „Verbindungen: Öffnen…“ in einer Anwendung mit Verbindungen geöffnet (Datenbank-Werkzeug, SSH, FTP, Mail, HTTP).',
      'prefs.inFile': 'Die Datei enthält auch Einstellungen der Suite.', 'prefs.apply': 'Einstellungen übernehmen',
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
    if (await Suite.shell.confirm(`${Suite.t('prefs.imported', n)} ${Suite.t('prefs.reload')}`)) location.reload();
  }

  const fileOf = (prefs) => ({ format: 'portable-web-app-suite', version: 1, apps: { suite: { settings: { preferences: prefs } } } });

  async function exportFile() {
    const bytes = new TextEncoder().encode(`${JSON.stringify(fileOf(collect()), null, 2)}\n`);
    const result = await Suite.files.saveAs(bytes, { suggestedName: 'suite-settings.json', types: TYPES, type: 'application/json' });
    if (result) Suite.shell.toast(result.message);
  }

  async function importFile() {
    const picked = await Suite.files.open({ types: [{ description: 'Settings', accept: { 'application/json': ['.json'], 'application/octet-stream': ['.kdbx'] } }] });
    if (!picked) return;
    const bytes = new Uint8Array(await picked[0].file.arrayBuffer());
    if (bytes[0] === 0x03 && bytes[1] === 0xd9 && bytes[2] === 0xa2 && bytes[3] === 0x9a) { Suite.shell.toast(Suite.t('prefs.kdbx'), 'warning', 8000); return; }
    let prefs = null;
    try {
      const json = JSON.parse(new TextDecoder().decode(bytes));
      prefs = json && json.apps && json.apps.suite && json.apps.suite.settings && json.apps.suite.settings.preferences;
    } catch (e) { /* not JSON */ }
    if (!prefs) { Suite.shell.toast(Suite.t('prefs.none'), 'warning'); return; }
    Suite.shell.closeAbout();
    await applyAndReload(prefs);
  }

  const fail = (e) => { console.warn(e); Suite.shell.toast(Suite.i18n.describe(e), 'error'); };

  function Section() {
    return html`<details class="suite-prefs" data-testid="prefs">
      <summary>⚙ ${Suite.t('prefs.title')}</summary>
      <p><small>${Suite.t('prefs.hint')}</small></p>
      <div role="group">
        <button class="secondary outline" data-testid="prefs-export" onClick=${() => exportFile().catch(fail)}>${Suite.t('prefs.export')}</button>
        <button class="secondary outline" data-testid="prefs-import" onClick=${() => importFile().catch(fail)}>${Suite.t('prefs.import')}</button>
      </div>
      ${Suite.symbols && Suite.symbols.available() ? html`<fieldset class="suite-prefs-symbols" data-testid="prefs-symbols">
        <legend>${Suite.t('sym.settings')}</legend>
        <label><input type="checkbox" role="switch" data-testid="pref-symbols-button" checked=${Suite.symbols.settings.button}
          onChange=${(e) => Suite.symbols.setSetting('button', e.target.checked)} /> ${Suite.t('sym.settingButton')}</label>
        <label><input type="checkbox" role="switch" data-testid="pref-symbols-emoticons" checked=${Suite.symbols.settings.emoticons}
          onChange=${(e) => Suite.symbols.setSetting('emoticons', e.target.checked)} /> ${Suite.t('sym.settingEmoticons')}</label>
      </fieldset>` : null}
      ${Suite.colors ? html`<label class="suite-prefs-colors">${Suite.t('col.setting')}
        <select data-testid="pref-colors" onChange=${(e) => Suite.colors.setNative(e.target.value === 'browser')}>
          <option value="own" selected=${!Suite.colors.settings.native}>${Suite.t('col.own')}</option>
          <option value="browser" selected=${Suite.colors.settings.native}>${Suite.t('col.browser')}</option>
        </select></label>` : null}
    </details>`;
  }

  Suite.preferences = { collect, apply, applyAndReload, Section };
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
