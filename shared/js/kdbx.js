/*
 * KeePass databases (KDBX 3.1/4.x) for all apps, based on kdbxweb (vendor/kdbxweb.min.js) and Argon2 from
 * hash-wasm (vendor/hash-wasm-argon2.umd.min.js). Derived from the web-authenticator's vault.js.
 *
 *   const db = await Suite.kdbx.open(bytes, { password, keyFile });      // keyFile: ArrayBuffer/Uint8Array or null
 *   const { db, keyFile } = await Suite.kdbx.create({ name, password, withKeyFile: true });
 *   const group = db.group('Portable Web App Suite/Text editor', { create: true });
 *   const entry = db.addEntry(group, { Title: 'Server', UserName: 'anna', Password: 'secret' });
 *   db.field(entry, 'Password');  db.setFields(entry, { URL: '...' });  db.setAttachment(entry, 'x.json', bytes);
 *   db.merge(otherDb)          // same database: synchronize; another database: import its entries into a group
 *   const bytes = await db.save();                                         // verified before it is returned
 */
(function (Suite) {
  'use strict';

  const { Kdbx, Credentials, ProtectedValue, Consts, KdbxError, VarDictionary, Int64 } = kdbxweb;

  // KDBX 4 uses Argon2, which kdbxweb delegates to an external implementation (WASM from hash-wasm)
  kdbxweb.CryptoEngine.setArgon2Impl((password, salt, memory, iterations, length, parallelism, type) => {
    const fn = type === kdbxweb.CryptoEngine.Argon2TypeArgon2id ? hashwasm.argon2id : hashwasm.argon2d;
    return fn({
      password: new Uint8Array(password), salt: new Uint8Array(salt), parallelism, iterations,
      memorySize: memory, // KiB
      hashLength: length, outputType: 'binary',
    });
  });

  /** KDF settings for new databases (comparable to KeePassXC defaults). */
  const NEW_DB_KDF = { memory: 64 * 1024 * 1024, iterations: 4, parallelism: 2 };
  const STANDARD_FIELDS = ['Title', 'UserName', 'Password', 'URL', 'Notes'];
  const PROTECTED_FIELDS = new Set(['Password']);

  Suite.i18n.register({
    en: {
      'kdbx.invalidKey': 'Wrong password or key file.',
      'kdbx.badSignature': 'This is not a KeePass database (.kdbx).',
      'kdbx.badVersion': 'This KeePass database version is not supported.',
      'kdbx.fileCorrupt': 'The database file is damaged: {0}',
      'kdbx.verify': 'Saving aborted: the newly written database could not be verified ({0}). The original file was not changed.',
      'kdbx.noCredentials': 'Please enter a password or choose a key file.',
    },
    de: {
      'kdbx.invalidKey': 'Falsches Passwort oder falsche Schlüsseldatei.',
      'kdbx.badSignature': 'Dies ist keine KeePass-Datenbank (.kdbx).',
      'kdbx.badVersion': 'Diese Version der KeePass-Datenbank wird nicht unterstützt.',
      'kdbx.fileCorrupt': 'Die Datenbankdatei ist beschädigt: {0}',
      'kdbx.verify': 'Speichern abgebrochen: Die neu geschriebene Datenbank konnte nicht überprüft werden ({0}). Die ursprüngliche Datei wurde nicht verändert.',
      'kdbx.noCredentials': 'Bitte geben Sie ein Passwort ein oder wählen Sie eine Schlüsseldatei.',
    },
  });

  /** Translate kdbxweb errors into localized errors. */
  function describeError(e) {
    if (e instanceof Suite.LocalizedError) return e;
    if (e instanceof KdbxError) {
      switch (e.code) {
        case Consts.ErrorCodes.InvalidKey: return new Suite.LocalizedError('kdbx.invalidKey');
        case Consts.ErrorCodes.BadSignature: return new Suite.LocalizedError('kdbx.badSignature');
        case Consts.ErrorCodes.InvalidVersion: return new Suite.LocalizedError('kdbx.badVersion');
        case Consts.ErrorCodes.FileCorrupt: return new Suite.LocalizedError('kdbx.fileCorrupt', e.message);
        default: break;
      }
    }
    return new Suite.LocalizedError('err.unknown', (e && e.message) || String(e));
  }

  /**
   * KeePass key file semantics: 32 bytes = raw key, 64 hex characters = hex key, KeePass XML key file,
   * anything else = SHA-256 of the file content (kdbxweb would misinterpret arbitrary files).
   */
  async function normalizeKeyFile(data) {
    if (!data) return null;
    const bytes = new Uint8Array(data);
    if (bytes.byteLength === 32) return bytes;
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes).trim();
    if (/^[a-f\d]{64}$/i.test(text) || /^(<\?xml[^>]*>\s*)?<KeyFile[\s>]/.test(text)) return bytes;
    return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  }

  async function makeCredentials(password, keyFile) {
    if (!password && !keyFile) throw new Suite.LocalizedError('kdbx.noCredentials');
    const credentials = new Credentials(password ? ProtectedValue.fromString(password) : null, await normalizeKeyFile(keyFile));
    await credentials.ready;
    return credentials;
  }

  const text = (value) => (value === undefined || value === null ? '' : value instanceof ProtectedValue ? value.getText() : String(value));

  class Database {
    constructor(db) { this.db = db; }

    get name() { return this.db.meta.name || this.db.getDefaultGroup().name || ''; }

    get version() { return `${this.db.versionMajor}.${this.db.versionMinor}`; }

    get root() { return this.db.getDefaultGroup(); }

    isInRecycleBin(group) {
      const bin = this.db.meta.recycleBinUuid;
      if (!bin || bin.empty) return false;
      for (let g = group; g; g = g.parentGroup) if (g.uuid.equals(bin)) return true;
      return false;
    }

    /** Path of a group below the root, e.g. "Portable Web App Suite/Text editor". */
    groupPath(group) {
      const names = [];
      for (let g = group; g && g.parentGroup; g = g.parentGroup) names.unshift(g.name || '');
      return names.join('/');
    }

    /** Group by path below the root ("A/B"); with create: true, missing groups are created. */
    group(path, { create = false } = {}) {
      let group = this.root;
      for (const name of path.split('/').filter(Boolean)) {
        let next = group.groups.find((g) => g.name === name && !this.isInRecycleBin(g));
        if (!next) {
          if (!create) return null;
          next = this.db.createGroup(group, name);
        }
        group = next;
      }
      return group;
    }

    /** All groups outside the recycle bin: [{ id, group, path }]. */
    groups() {
      const result = [];
      for (const g of this.root.allGroups()) if (!this.isInRecycleBin(g)) result.push({ id: g.uuid.id, group: g, path: this.groupPath(g) });
      return result;
    }

    /** Entries outside the recycle bin, of one group (recursive: true includes subgroups) or of the whole database. */
    entries(group = null, { recursive = true } = {}) {
      const source = group ? (recursive ? [...group.allEntries()] : group.entries) : [...this.root.allEntries()];
      return source.filter((e) => !this.isInRecycleBin(e.parentGroup));
    }

    findEntry(id) {
      for (const e of this.root.allEntries()) if (e.uuid.id === id) return e;
      return null;
    }

    field(entry, key) { return text(entry.fields.get(key)); }

    /** All fields as plain strings: { Title, UserName, Password, URL, Notes, ...custom }. */
    fields(entry) {
      const out = {};
      for (const [key, value] of entry.fields) out[key] = text(value);
      return out;
    }

    /**
     * Set fields; values are strings. Password and the keys listed in protect are stored protected
     * (encrypted in memory and marked as protected in the file). The previous state goes to the history.
     */
    setFields(entry, values, { protect = [], history = true } = {}) {
      if (history && entry.fields.size) entry.pushHistory();
      for (const [key, value] of Object.entries(values)) {
        if (value === null || value === undefined) { entry.fields.delete(key); continue; }
        entry.fields.set(key, PROTECTED_FIELDS.has(key) || protect.includes(key) ? ProtectedValue.fromString(String(value)) : String(value));
      }
      entry.times.update();
      return entry;
    }

    addEntry(group, values = {}, options = {}) {
      const entry = this.db.createEntry(group || this.root);
      return this.setFields(entry, values, { ...options, history: false });
    }

    /** Delete an entry (moved to the recycle bin if it is enabled, as KeePass does). */
    deleteEntry(entry) { this.db.remove(entry); }

    attachment(entry, name) {
      const binary = entry.binaries.get(name);
      if (!binary) return null;
      const value = binary.value !== undefined ? binary.value : binary;
      return new Uint8Array(value instanceof ProtectedValue ? value.getBinary() : value);
    }

    async setAttachment(entry, name, data) {
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
      entry.binaries.set(name, await this.db.createBinary(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)));
      entry.times.update();
    }

    removeAttachment(entry, name) { entry.binaries.delete(name); }

    createGroup(parent, name) { return this.db.createGroup(parent || this.root, name); }

    /** Move an entry or group to another group. */
    move(item, group) { this.db.move(item, group); }

    /** Delete a group (moved to the recycle bin if it is enabled). */
    deleteGroup(group) { this.db.remove(group); }

    get recycleBin() {
      const id = this.db.meta.recycleBinUuid;
      return id && !id.empty ? this.db.getGroup(id) : null;
    }

    /** Delete everything in the recycle bin permanently. */
    emptyRecycleBin() {
      const bin = this.recycleBin;
      if (!bin) return;
      for (const item of [...bin.groups, ...bin.entries]) this.db.move(item, null);
    }

    /** Older versions of an entry (newest last). */
    history(entry) { return entry.history || []; }

    /** Restore an older version (the current state goes to the history). */
    restoreHistory(entry, index) {
      const old = entry.history[index];
      if (!old) return;
      entry.pushHistory();
      entry.fields = new Map(old.fields);
      entry.binaries = new Map(old.binaries);
      entry.times.update();
    }

    /**
     * Deep copy of the group tree, deleted objects and the relevant metadata for undo (protected values stay
     * encrypted in memory). restore() puts a snapshot back; the snapshot must not be used afterwards.
     */
    snapshot() {
      const copyRest = (to, from, keys) => { for (const k of keys) if (from[k] !== undefined) to[k] = from[k]; };
      const cloneEntry = (e, parent) => {
        const c = new kdbxweb.KdbxEntry();
        c.copyFrom(e);
        copyRest(c, e, ['customData', 'qualityCheck', 'previousParentGroup']);
        c.parentGroup = parent;
        c.history = (e.history || []).map((h) => cloneEntry(h, undefined));
        return c;
      };
      const cloneGroup = (g, parent) => {
        const c = new kdbxweb.KdbxGroup();
        c.copyFrom(g);
        copyRest(c, g, ['customData', 'tags', 'previousParentGroup']);
        c.parentGroup = parent;
        c.groups = g.groups.map((x) => cloneGroup(x, c));
        c.entries = g.entries.map((x) => cloneEntry(x, c));
        return c;
      };
      const m = this.db.meta;
      const meta = {};
      copyRest(meta, m, ['name', 'nameChanged', 'desc', 'descChanged', 'recycleBinEnabled', 'recycleBinUuid', 'recycleBinChanged', 'keyChanged']);
      return { groups: this.db.groups.map((g) => cloneGroup(g, undefined)), deleted: this.db.deletedObjects.slice(), meta };
    }

    restore(snap) {
      this.db.groups = snap.groups;
      this.db.deletedObjects = snap.deleted;
      Object.assign(this.db.meta, snap.meta);
    }

    /**
     * Merge another database. A copy of the same database (same root group) is synchronized (kdbxweb merge: newer
     * entries win, history and deletions are combined); entries of a different database are imported into a new group
     * named after it. Returns { mode: 'sync' } or { mode: 'import', count, group }.
     */
    merge(other) {
      const remote = other.db;
      if (remote.getDefaultGroup().uuid.equals(this.root.uuid)) {
        this.db.merge(remote);
        return { mode: 'sync' };
      }
      const target = this.db.createGroup(this.root, other.name || 'Import');
      let count = 0;
      const copy = (src, dst) => {
        for (const e of src.entries) { this.db.importEntry(e, dst, remote); count++; }
        for (const g of src.groups) {
          if (other.isInRecycleBin(g)) continue;
          const ng = this.db.createGroup(dst, g.name);
          ng.icon = g.icon;
          copy(g, ng);
        }
      };
      copy(remote.getDefaultGroup(), target);
      return { mode: 'import', count, group: target };
    }

    /** Change the master key: password (string or null to keep, '' to remove) and/or key file (bytes, null to keep, false to remove). */
    async changeMasterKey({ password = null, keyFile = null } = {}) {
      const credentials = this.db.credentials;
      if (password !== null) await credentials.setPassword(password ? ProtectedValue.fromString(password) : null);
      if (keyFile === false) await credentials.setKeyFile(null);
      else if (keyFile) await credentials.setKeyFile(await normalizeKeyFile(keyFile));
      this.db.meta.keyChanged = new Date();
    }

    /** Serialize the database and check that the result can be decrypted again before returning it. */
    async save() {
      const data = await this.db.save();
      try {
        await Kdbx.load(data.slice(0), this.db.credentials);
      } catch (e) {
        throw new Suite.LocalizedError('kdbx.verify', describeError(e).localized());
      }
      return new Uint8Array(data);
    }
  }

  async function open(data, { password = '', keyFile = null } = {}) {
    try {
      const bytes = new Uint8Array(data);
      if (!isKdbx(bytes)) throw new Suite.LocalizedError('kdbx.badSignature');
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      return new Database(await Kdbx.load(buffer, await makeCredentials(password, keyFile)));
    } catch (e) {
      throw describeError(e);
    }
  }

  /** Create a KDBX 4 database (AES-256, Argon2id). Resolves to { db, keyFile } (keyFile: Uint8Array or null). */
  async function create({ name = 'Database', password = '', withKeyFile = false, generator = 'Portable Web App Suite' } = {}) {
    const keyFile = withKeyFile ? new Uint8Array(await Credentials.createRandomKeyFile(2)) : null;
    const db = Kdbx.create(await makeCredentials(password, keyFile), name);
    db.setKdf(Consts.KdfId.Argon2id);
    const kdf = db.header.kdfParameters;
    kdf.set('M', VarDictionary.ValueType.UInt64, new Int64(NEW_DB_KDF.memory));
    kdf.set('I', VarDictionary.ValueType.UInt64, new Int64(NEW_DB_KDF.iterations));
    kdf.set('P', VarDictionary.ValueType.UInt32, NEW_DB_KDF.parallelism);
    db.meta.generator = generator;
    return { db: new Database(db), keyFile };
  }

  /** True if the data starts with the KDBX file signature. */
  function isKdbx(data) {
    const b = new Uint8Array(data.slice ? data.slice(0, 4) : data);
    return b[0] === 0x03 && b[1] === 0xd9 && b[2] === 0xa2 && b[3] === 0x9a;
  }

  Suite.kdbx = { open, create, isKdbx, describeError, Database, NEW_DB_KDF, STANDARD_FIELDS };
})(window.Suite = window.Suite || {});
