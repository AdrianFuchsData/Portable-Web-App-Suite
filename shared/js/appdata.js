/*
 * Application data file UI for apps with connections (database tool, SSH, SFTP, mail, HTTP): connections and the relay
 * settings live in a store of shared/js/settings.js (JSON or KeePass file) that the user opens, creates and saves.
 * Until a file is chosen, the data is kept in memory.
 *
 *   const data = Suite.appdata.create('dbtool', { onChange: render });
 *   data.connections(); data.saveConnection(c); data.deleteConnection(id);
 *   data.relay / data.relay = { url, token }        // shared by all apps of the store (app "suite")
 *   html`<${data.Bar} />`  html`<${data.Dialog} />` // file bar and its dialogs
 */
(function (Suite) {
  'use strict';

  const { html } = htmPreact;
  const t = (...a) => Suite.t(...a);
  const TYPES = [{ description: 'App data', accept: { 'application/octet-stream': ['.kdbx', '.json'] } }];

  Suite.i18n.register({
    en: {
      'appdata.label': 'Connections', 'appdata.notSaved': 'not saved', 'appdata.open': 'Open…', 'appdata.new': 'Save as…', 'appdata.save': 'Save',
      'appdata.password': 'Password', 'appdata.keyFile': 'Key file (optional)', 'appdata.unlock': 'Open', 'appdata.cancel': 'Cancel',
      'appdata.createTitle': 'Save connections', 'appdata.kind': 'Format', 'appdata.kdbx': 'KeePass database (encrypted, recommended)',
      'appdata.json': 'JSON file (not encrypted: passwords are readable)', 'appdata.repeat': 'Repeat password', 'appdata.mismatch': 'The passwords do not match.',
      'appdata.unsaved': 'Connections have unsaved changes.', 'appdata.relay': 'Relay', 'appdata.relayUrl': 'Relay address', 'appdata.relayToken': 'Relay token',
      'appdata.relayHint': 'Network connections need the relay (see the user guide). Start it on this computer and enter the address and token it prints, or enter the address and your account of a shared relay.',
      'appdata.relayOk': 'Relay reachable (version {0}).', 'appdata.relayLoggedIn': 'Relay reachable, logged in as {0}.', 'appdata.test': 'Test',
      'appdata.relayAuth': 'Sign-in', 'appdata.authToken': 'Token', 'appdata.authPassword': 'User name and password', 'appdata.authProxy': 'Reverse proxy / client certificate',
      'appdata.relayUser': 'User name', 'appdata.relayPassword': 'Password', 'appdata.allowInsecure': 'Allow an unencrypted connection (http) to another computer – trusted networks only',
    },
    de: {
      'appdata.label': 'Verbindungen', 'appdata.notSaved': 'nicht gespeichert', 'appdata.open': 'Öffnen…', 'appdata.new': 'Speichern unter…', 'appdata.save': 'Speichern',
      'appdata.password': 'Passwort', 'appdata.keyFile': 'Schlüsseldatei (optional)', 'appdata.unlock': 'Öffnen', 'appdata.cancel': 'Abbrechen',
      'appdata.createTitle': 'Verbindungen speichern', 'appdata.kind': 'Format', 'appdata.kdbx': 'KeePass-Datenbank (verschlüsselt, empfohlen)',
      'appdata.json': 'JSON-Datei (unverschlüsselt: Passwörter sind lesbar)', 'appdata.repeat': 'Passwort wiederholen', 'appdata.mismatch': 'Die Passwörter stimmen nicht überein.',
      'appdata.unsaved': 'Die Verbindungen haben ungespeicherte Änderungen.', 'appdata.relay': 'Relay', 'appdata.relayUrl': 'Relay-Adresse', 'appdata.relayToken': 'Relay-Token',
      'appdata.relayHint': 'Netzwerkverbindungen brauchen das Relay (siehe Benutzerhandbuch). Starten Sie es auf diesem Rechner und tragen Sie die angezeigte Adresse und das Token ein, oder geben Sie Adresse und Ihr Konto eines gemeinsamen Relays an.',
      'appdata.relayOk': 'Relay erreichbar (Version {0}).', 'appdata.relayLoggedIn': 'Relay erreichbar, angemeldet als {0}.', 'appdata.test': 'Testen',
      'appdata.relayAuth': 'Anmeldung', 'appdata.authToken': 'Token', 'appdata.authPassword': 'Benutzername und Passwort', 'appdata.authProxy': 'Reverse-Proxy / Client-Zertifikat',
      'appdata.relayUser': 'Benutzername', 'appdata.relayPassword': 'Passwort', 'appdata.allowInsecure': 'Unverschlüsselte Verbindung (http) zu einem anderen Rechner erlauben – nur in vertrauenswürdigen Netzen',
    },
  });

  function create(appName, { onChange = () => {} } = {}) {
    const state = { store: null, name: null, handle: null, dirty: false, dialog: null, keyFile: null };
    let memory = null;
    const changed = () => onChange();

    // synchronous access needs a store: create the in-memory JSON store right away
    Suite.settings.create('json').then(({ store }) => { if (!state.store) { memory = store; state.store = store; changed(); } });

    const app = () => (state.store ? state.store.app(appName) : null);
    const markDirty = () => { state.dirty = true; changed(); };

    const data = {
      get name() { return state.name; },
      get dirty() { return state.dirty; },
      get ready() { return !!state.store; },
      connections: () => (app() ? app().connections() : []),
      saveConnection(c) { const id = app().saveConnection(c); markDirty(); return id; },
      deleteConnection(id) { app().deleteConnection(id); markDirty(); },
      get settings() { return (app() && app().settings) || {}; },
      set settings(v) { app().settings = v; markDirty(); },
      get relay() { const s = state.store ? state.store.app('suite').settings : null; return (s && s.relay) || { url: 'http://127.0.0.1:8765', token: '' }; },
      set relay(v) { const s = state.store.app('suite'); s.settings = { ...(s.settings || {}), relay: v }; markDirty(); },
      /** Whether the relay settings are complete (address and the credentials of the chosen sign-in). */
      relayConfigured() {
        const r = data.relay;
        if (!r || !r.url) return false;
        if (r.auth === 'password') return !!(r.user && r.password);
        return r.auth === 'proxy' || !!r.token;
      },
      relayConfig() {
        const r = data.relay;
        return Suite.relay.config(r.url || 'http://127.0.0.1:8765', r.auth === 'password' ? '' : r.token || '',
          { user: r.auth === 'password' ? r.user || '' : '', password: r.auth === 'password' ? r.password || '' : '', allowInsecure: !!r.allowInsecure });
      },

      async open() {
        const picked = await Suite.files.open({ types: TYPES });
        if (!picked) return;
        const { file, handle } = picked[0];
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (Suite.settings.needsPassword(bytes)) { state.dialog = { kind: 'unlock', bytes, file, handle, error: '' }; changed(); return; }
        await finishOpen(await Suite.settings.open(bytes), file.name, handle);
      },

      async save() {
        if (!state.name) { state.dialog = { kind: 'create', format: 'kdbx', error: '' }; changed(); return; }
        await write(false);
      },

      saveAs() { state.dialog = { kind: 'create', format: 'kdbx', error: '' }; changed(); },

      Bar() {
        return html`<div class="appdata-bar" data-testid="appdata">
          <span>${t('appdata.label')}: <b data-testid="appdata-name">${state.name || t('appdata.notSaved')}</b>${state.dirty ? ' •' : ''}</span>
          <button class="secondary outline" data-testid="appdata-open" onClick=${() => data.open().catch(fail)}>${t('appdata.open')}</button>
          <button class=${state.dirty ? '' : 'secondary outline'} data-testid="appdata-save" onClick=${() => data.save().catch(fail)}>${t('appdata.save')}</button>
          ${state.name ? html`<button class="secondary outline" data-testid="appdata-save-as" onClick=${() => data.saveAs()}>${t('appdata.new')}</button>` : null}
        </div>`;
      },

      Dialog() {
        const d = state.dialog;
        if (!d) return null;
        const close = () => { state.dialog = null; changed(); };
        if (d.kind === 'unlock') {
          return html`<dialog open data-testid="appdata-unlock"><article>
            <header><strong>${d.file.name}</strong></header>
            <form onSubmit=${async (e) => {
              e.preventDefault();
              try {
                const store = await Suite.settings.open(d.bytes, { password: e.target.elements.password.value, keyFile: d.keyFile || null });
                state.dialog = null;
                await finishOpen(store, d.file.name, d.handle);
              } catch (err) { d.error = Suite.i18n.describe(err); changed(); }
            }}>
              <label>${t('appdata.password')}<input type="password" name="password" data-testid="appdata-password" autofocus autocomplete="current-password" /></label>
              <label>${t('appdata.keyFile')}<input type="file" onChange=${async (e) => { d.keyFile = e.target.files[0] ? new Uint8Array(await e.target.files[0].arrayBuffer()) : null; }} /></label>
              ${d.error ? html`<p class="appdata-error" data-testid="appdata-error">${d.error}</p>` : null}
              <footer><button type="button" class="secondary" onClick=${close}>${t('appdata.cancel')}</button><button type="submit" data-testid="appdata-unlock-ok">${t('appdata.unlock')}</button></footer>
            </form>
          </article></dialog>`;
        }
        return html`<dialog open data-testid="appdata-create"><article>
          <header><strong>${t('appdata.createTitle')}</strong></header>
          <form onSubmit=${async (e) => {
            e.preventDefault();
            const f = e.target.elements;
            try {
              if (d.format === 'kdbx') {
                if (f.password.value !== f.repeat.value) { d.error = t('appdata.mismatch'); changed(); return; }
                const { store } = await Suite.settings.create('kdbx', { password: f.password.value });
                // copy the current data into the new store
                copyStore(state.store, store);
                state.store = store;
              } else if (state.store !== memory && state.name && /\.kdbx$/i.test(state.name)) {
                const { store } = await Suite.settings.create('json');
                copyStore(state.store, store);
                state.store = store;
              }
              state.dialog = null;
              state.name = d.format === 'kdbx' ? 'connections.kdbx' : 'connections.json';
              await write(true);
            } catch (err) { d.error = Suite.i18n.describe(err); changed(); }
          }}>
            <fieldset>
              <legend>${t('appdata.kind')}</legend>
              <label><input type="radio" name="format" value="kdbx" checked=${d.format === 'kdbx'} data-testid="appdata-kdbx" onChange=${() => { d.format = 'kdbx'; changed(); }} /> ${t('appdata.kdbx')}</label>
              <label><input type="radio" name="format" value="json" checked=${d.format === 'json'} data-testid="appdata-json" onChange=${() => { d.format = 'json'; changed(); }} /> ${t('appdata.json')}</label>
            </fieldset>
            ${d.format === 'kdbx' ? html`<label>${t('appdata.password')}<input type="password" name="password" data-testid="appdata-new-password" autocomplete="new-password" required /></label>
              <label>${t('appdata.repeat')}<input type="password" name="repeat" data-testid="appdata-new-repeat" autocomplete="new-password" required /></label>` : null}
            ${d.error ? html`<p class="appdata-error" data-testid="appdata-error">${d.error}</p>` : null}
            <footer><button type="button" class="secondary" onClick=${close}>${t('appdata.cancel')}</button><button type="submit" data-testid="appdata-create-ok">${t('appdata.save')}</button></footer>
          </form>
        </article></dialog>`;
      },

      /** Relay settings form (address, token, test). */
      RelayFields() {
        const r = data.relay;
        return html`<fieldset class="appdata-relay" data-testid="relay-settings">
          <legend>${t('appdata.relay')}</legend>
          <small>${t('appdata.relayHint')}</small>
          <label>${t('appdata.relayUrl')}<input data-testid="relay-url" defaultValue=${r.url} key=${`u${r.url}`} onChange=${(e) => { data.relay = { ...data.relay, url: e.target.value.trim() }; }} /></label>
          <label>${t('appdata.relayAuth')}<select data-testid="relay-auth" onChange=${(e) => { data.relay = { ...data.relay, auth: e.target.value }; }}>
            ${[['token', 'appdata.authToken'], ['password', 'appdata.authPassword'], ['proxy', 'appdata.authProxy']].map(([v, l]) => html`<option value=${v} selected=${(r.auth || 'token') === v}>${t(l)}</option>`)}
          </select></label>
          ${(r.auth || 'token') === 'token' ? html`<label>${t('appdata.relayToken')}<input type="password" data-testid="relay-token" defaultValue=${r.token} key=${`t${r.token}`} onChange=${(e) => { data.relay = { ...data.relay, token: e.target.value.trim() }; }} /></label>` : null}
          ${r.auth === 'password' ? html`<label>${t('appdata.relayUser')}<input data-testid="relay-user" autocomplete="username" defaultValue=${r.user || ''} key=${`n${r.user}`} onChange=${(e) => { data.relay = { ...data.relay, user: e.target.value.trim() }; }} /></label>
            <label>${t('appdata.relayPassword')}<input type="password" data-testid="relay-password" autocomplete="current-password" defaultValue=${r.password || ''} key=${`p${r.password ? 1 : 0}`} onChange=${(e) => { data.relay = { ...data.relay, password: e.target.value }; }} /></label>` : null}
          ${/^http:/i.test(r.url || '') && !/^http:\/\/(127\.|localhost|\[::1\])/i.test(r.url || '') ? html`<label><input type="checkbox" data-testid="relay-insecure" checked=${!!r.allowInsecure} onChange=${(e) => { data.relay = { ...data.relay, allowInsecure: e.target.checked }; }} /> ${t('appdata.allowInsecure')}</label>` : null}
          <button type="button" class="secondary outline" data-testid="relay-test" onClick=${async () => {
            try {
              const relay = data.relayConfig();
              const info = await Suite.relay.info(relay);
              if (relay.user) { const s = await Suite.relay.login(relay); Suite.shell.toast(t('appdata.relayLoggedIn', s.user)); } else Suite.shell.toast(t('appdata.relayOk', info.version || '1'));
            } catch (e) { fail(e); }
          }}>${t('appdata.test')}</button>
        </fieldset>`;
      },
    };

    function copyStore(from, to) {
      for (const name of [appName, 'suite']) {
        const src = from.app(name), dst = to.app(name);
        if (src.settings !== undefined) dst.settings = src.settings;
        for (const c of src.connections()) dst.saveConnection(c);
      }
    }

    async function finishOpen(store, name, handle) {
      state.store = store;
      state.name = name;
      state.handle = handle;
      state.dirty = false;
      changed();
      // preferences of the suite saved with the file (see below): offer to take them over if they differ
      const prefs = (store.app('suite').settings || {}).preferences;
      const current = Suite.preferences ? Suite.preferences.collect() : {};
      if (prefs && Suite.preferences && Object.entries(prefs).some(([k, v]) => current[k] !== v)) {
        Suite.shell.banner(t('prefs.inFile'), [{ label: t('prefs.apply'), testid: 'appdata-apply-prefs', run: () => Suite.preferences.applyAndReload(prefs) },
          { label: Suite.t('common.close'), run: () => {} }]);
      }
    }

    async function write(as) {
      // the file also carries the preferences of the suite (theme, language, app settings: shared/js/shell.js)
      if (Suite.preferences) { const s = state.store.app('suite'); s.settings = { ...(s.settings || {}), preferences: Suite.preferences.collect() }; }
      const bytes = await state.store.toBytes();
      const result = as || !state.handle ? await Suite.files.saveAs(bytes, { suggestedName: state.name, types: TYPES })
        : await Suite.files.save({ name: state.name, handle: state.handle }, bytes);
      if (!result) return;
      if (result.mode === 'downloaded') Suite.shell.banner(result.message); else Suite.shell.toast(result.message);
      if (result.handle) state.handle = result.handle;
      state.name = result.name || state.name;
      state.dirty = false;
      changed();
    }

    const fail = (e) => { console.warn(e); Suite.shell.toast(Suite.i18n.describe(e), 'error'); };
    return data;
  }

  Suite.appdata = { create };
})(window.Suite = window.Suite || {});
