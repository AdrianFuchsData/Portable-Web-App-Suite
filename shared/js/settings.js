/*
 * Application data of all apps (settings, connections, credentials), stored in a file chosen by the user:
 * a JSON file (unencrypted) or a KeePass database (encrypted). One store can hold the data of several apps.
 *
 *   const store = await Suite.settings.create('kdbx', { password });          // or create('json')
 *   const store = await Suite.settings.open(bytes, { password, keyFile });    // JSON or KDBX (detected)
 *   const app = store.app('sftp');
 *   app.settings = { theme: 'dark' };   app.settings;                        // any JSON value
 *   app.saveConnection({ name: 'Server', url: 'sftp://host', username: 'anna', password: 'x', port: 22 });
 *   app.connections();   app.deleteConnection(id);
 *   const bytes = await store.toBytes();                                     // save with Suite.files
 *
 * JSON format: { format: "portable-web-app-suite", version: 1, apps: { <app>: { settings, connections } } }.
 * KDBX layout: group "Portable Web App Suite/<app>"; settings as attachment "settings.json" of the entry
 * "Settings"; every connection is a normal KeePass entry (name → Title, username → UserName,
 * password → Password, url → URL, notes → Notes), the other properties are custom fields (secret ones
 * protected). Everything else in the database is left untouched, so an existing database can be used.
 */
(function (Suite) {
  'use strict';

  const FORMAT = 'portable-web-app-suite';
  const ROOT_GROUP = 'Portable Web App Suite';
  const SETTINGS_ENTRY = 'Settings';
  const ID_FIELD = 'SuiteId';
  const STANDARD = { name: 'Title', username: 'UserName', password: 'Password', url: 'URL', notes: 'Notes' };
  /** Connection properties that are stored protected in KeePass. */
  const SECRETS = new Set(['password', 'smtpPassword', 'privateKey', 'passphrase', 'token', 'secret', 'apiKey']);

  Suite.i18n.register({
    en: { 'settings.badFile': 'This file is neither an application data file (JSON) nor a KeePass database.' },
    de: { 'settings.badFile': 'Diese Datei ist weder eine Anwendungsdaten-Datei (JSON) noch eine KeePass-Datenbank.' },
  });

  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

  // ---- JSON store ---------------------------------------------------------------------------------

  class JsonApp {
    constructor(data) { this.data = data; }

    get settings() { return clone(this.data.settings); }

    set settings(value) { this.data.settings = clone(value); }

    connections() { return clone(this.data.connections); }

    saveConnection(connection) {
      const c = { ...clone(connection), id: connection.id || newId() };
      const i = this.data.connections.findIndex((x) => x.id === c.id);
      if (i >= 0) this.data.connections[i] = c; else this.data.connections.push(c);
      return c.id;
    }

    deleteConnection(id) { this.data.connections = this.data.connections.filter((c) => c.id !== id); }
  }

  class JsonStore {
    constructor(data) {
      this.kind = 'json';
      this.data = data || { format: FORMAT, version: 1, apps: {} };
    }

    app(name) {
      const apps = this.data.apps;
      if (!apps[name]) apps[name] = { settings: {}, connections: [] };
      apps[name].settings = apps[name].settings || {};
      apps[name].connections = apps[name].connections || [];
      return new JsonApp(apps[name]);
    }

    apps() { return Object.keys(this.data.apps); }

    async toBytes() { return new TextEncoder().encode(JSON.stringify(this.data, null, 2) + '\n'); }
  }

  // ---- KeePass store ------------------------------------------------------------------------------

  class KdbxApp {
    constructor(db, name) {
      this.db = db;
      this.group = db.group(`${ROOT_GROUP}/${name}`, { create: true });
    }

    settingsEntry(create) {
      let entry = this.db.entries(this.group, { recursive: false }).find((e) => this.db.field(e, 'Title') === SETTINGS_ENTRY && !this.db.field(e, ID_FIELD));
      if (!entry && create) entry = this.db.addEntry(this.group, { Title: SETTINGS_ENTRY });
      return entry;
    }

    get settings() {
      if (this.pendingSettings !== undefined) return clone(this.pendingSettings); // set, not yet written
      const entry = this.settingsEntry(false);
      const bytes = entry && this.db.attachment(entry, 'settings.json');
      return bytes ? JSON.parse(new TextDecoder().decode(bytes)) : {};
    }

    /** Settings are written with store.toBytes() (attachments are created asynchronously). */
    set settings(value) { this.pendingSettings = clone(value); }

    async flush() {
      if (this.pendingSettings === undefined) return;
      await this.db.setAttachment(this.settingsEntry(true), 'settings.json', JSON.stringify(this.pendingSettings, null, 2));
      this.pendingSettings = undefined;
    }

    connectionEntries() { return this.db.entries(this.group, { recursive: false }).filter((e) => this.db.field(e, ID_FIELD)); }

    connections() {
      return this.connectionEntries().map((entry) => {
        const fields = this.db.fields(entry);
        const c = { id: fields[ID_FIELD] };
        for (const [prop, field] of Object.entries(STANDARD)) if (fields[field]) c[prop] = fields[field];
        for (const [key, value] of Object.entries(fields)) {
          if (key === ID_FIELD || Object.values(STANDARD).includes(key)) continue;
          // strings are stored as they are (readable in KeePass), other values as JSON
          let parsed;
          try { parsed = JSON.parse(value); } catch (e) { parsed = undefined; }
          c[key] = parsed !== undefined && typeof parsed !== 'string' && JSON.stringify(parsed) === value ? parsed : value;
        }
        return c;
      });
    }

    saveConnection(connection) {
      const id = connection.id || newId();
      let entry = this.connectionEntries().find((e) => this.db.field(e, ID_FIELD) === id);
      const values = { [ID_FIELD]: id };
      const protect = [];
      for (const [key, value] of Object.entries(connection)) {
        if (key === 'id') continue;
        const field = STANDARD[key] || key;
        values[field] = STANDARD[key] || typeof value === 'string' ? String(value ?? '') : JSON.stringify(value);
        if (SECRETS.has(key)) protect.push(field);
      }
      if (entry) {
        // remove properties that are no longer present
        for (const key of Object.keys(this.db.fields(entry))) if (!(key in values) && !Object.values(STANDARD).includes(key)) values[key] = null;
        this.db.setFields(entry, values, { protect });
      } else {
        entry = this.db.addEntry(this.group, values, { protect });
      }
      return id;
    }

    deleteConnection(id) {
      const entry = this.connectionEntries().find((e) => this.db.field(e, ID_FIELD) === id);
      if (entry) this.db.deleteEntry(entry);
    }
  }

  class KdbxStore {
    constructor(db) {
      this.kind = 'kdbx';
      this.db = db;
      this.cache = new Map();
    }

    app(name) {
      if (!this.cache.has(name)) this.cache.set(name, new KdbxApp(this.db, name));
      return this.cache.get(name);
    }

    apps() {
      const root = this.db.group(ROOT_GROUP);
      return root ? root.groups.filter((g) => !this.db.isInRecycleBin(g)).map((g) => g.name) : [];
    }

    async toBytes() {
      for (const app of this.cache.values()) await app.flush();
      return this.db.save();
    }
  }

  // ---- public API ---------------------------------------------------------------------------------

  /** New store: kind 'json' or 'kdbx' ({ password, withKeyFile, name }). Resolves to { store, keyFile }. */
  async function create(kind, options = {}) {
    if (kind === 'json') return { store: new JsonStore(), keyFile: null };
    const { db, keyFile } = await Suite.kdbx.create({ name: options.name || ROOT_GROUP, ...options });
    return { store: new KdbxStore(db), keyFile };
  }

  /** Open a store file (KeePass database or JSON). KeePass needs { password and/or keyFile }. */
  async function open(data, options = {}) {
    const bytes = new Uint8Array(data);
    if (Suite.kdbx.isKdbx(bytes)) return new KdbxStore(await Suite.kdbx.open(bytes, options));
    let parsed;
    try { parsed = JSON.parse(new TextDecoder().decode(bytes)); } catch (e) { throw new Suite.LocalizedError('settings.badFile'); }
    if (!parsed || parsed.format !== FORMAT || typeof parsed.apps !== 'object') throw new Suite.LocalizedError('settings.badFile');
    return new JsonStore(parsed);
  }

  /** True if the file needs a password (KeePass database). */
  const needsPassword = (data) => Suite.kdbx.isKdbx(new Uint8Array(data));

  Suite.settings = { create, open, needsPassword, FORMAT, ROOT_GROUP };
})(window.Suite = window.Suite || {});
