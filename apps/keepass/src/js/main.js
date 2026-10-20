/*
 * KeePass editor: unlock/create KDBX databases, groups, entries (fields, custom fields, tags, expiry, attachments,
 * history, TOTP), search, password generator, master key change, recycle bin, auto-lock. Shared shell + kdbx.js.
 */
(function () {
  'use strict';

  const { html } = Suite.shell;
  const t = Suite.t;
  const APP = 'keepass';
  const AUTO_LOCK_MINUTES = 15;
  const CLIPBOARD_CLEAR_SECONDS = 30;
  const STANDARD = ['Title', 'UserName', 'Password', 'URL', 'Notes'];

  Suite.i18n.register({
    en: {
      'app.title': 'KeePass', 'kp.undo': 'Undo', 'kp.redo': 'Redo', 'kp.attachmentUpdated': 'The attachment “{0}” was updated. Save the database to keep the change.', 'kp.attachmentGone': 'The entry no longer exists (or the database is locked).',
      'kp.open': 'Open database', 'kp.chooseFile': 'Choose database…', 'kp.database': 'Database', 'kp.noFile': 'No database selected',
      'kp.password': 'Password', 'kp.keyFile': 'Key file (optional)', 'kp.chooseKeyFile': 'Choose key file…', 'kp.unlock': 'Unlock', 'kp.unlocking': 'Unlocking…',
      'kp.create': 'Create a new database', 'kp.createTitle': 'New database', 'kp.name': 'Name', 'kp.repeat': 'Repeat password',
      'kp.withKeyFile': 'Also create a key file (it is downloaded; keep it safe)', 'kp.createButton': 'Create database', 'kp.back': 'Back',
      'kp.mismatch': 'The passwords do not match.', 'kp.needCredentials': 'Please enter a password or create a key file.',
      'kp.save': 'Save', 'kp.saveAs': 'Save as', 'kp.lock': 'Lock', 'kp.newEntry': 'New entry', 'kp.newGroup': 'New group', 'kp.settings': 'Database',
      'kp.search': 'Search', 'kp.groups': 'Groups', 'kp.entries': 'Entries', 'kp.noEntries': 'No entries.', 'kp.noMatch': 'No entries match the search.',
      'kp.title': 'Title', 'kp.userName': 'User name', 'kp.url': 'URL', 'kp.notes': 'Notes', 'kp.tags': 'Tags (separated by commas)',
      'kp.expires': 'Expires', 'kp.expired': 'Expired', 'kp.show': 'Show', 'kp.hide': 'Hide', 'kp.copy': 'Copy', 'kp.copied': '{0} copied; the clipboard is cleared in {1} seconds.',
      'kp.generate': 'Generate', 'kp.openUrl': 'Open', 'kp.customFields': 'Additional fields', 'kp.addField': 'Add field', 'kp.fieldName': 'Name',
      'kp.fieldValue': 'Value', 'kp.protected': 'Protected', 'kp.attachments': 'Attachments', 'kp.addAttachment': 'Add attachment', 'kp.history': 'History',
      'kp.restore': 'Restore', 'kp.deleteEntry': 'Delete entry', 'kp.deleteEntryConfirm': 'Delete “{0}”?', 'kp.group': 'Group', 'kp.untitled': 'New entry',
      'kp.groupName': 'Group name', 'kp.rename': 'Rename', 'kp.deleteGroup': 'Delete group', 'kp.deleteGroupConfirm': 'Delete the group “{0}” with all its entries?',
      'kp.recycleBin': 'Recycle bin', 'kp.emptyBin': 'Empty recycle bin', 'kp.emptyBinConfirm': 'Delete everything in the recycle bin permanently?',
      'kp.generator': 'Password generator', 'kp.length': 'Length', 'kp.lower': 'a–z', 'kp.upper': 'A–Z', 'kp.digits': '0–9', 'kp.symbols': 'Symbols', 'kp.ambiguous': 'Avoid similar characters (l, 1, O, 0)',
      'kp.use': 'Use', 'kp.strength': '{0} bits', 'kp.settingsTitle': 'Database settings', 'kp.newPassword': 'New master password', 'kp.changeKey': 'Change master key',
      'kp.keyChanged': 'The master key was changed. Save the database to keep the change.', 'kp.newKeyFile': 'New key file', 'kp.removeKeyFile': 'Remove the key file',
      'kp.locked': 'The database was locked after {0} minutes of inactivity.', 'kp.unsavedLock': 'You have unsaved changes. Lock anyway (the changes are lost)?',
      'kp.modified': 'Modified {0}', 'kp.otp': 'One-time password', 'kp.entryCount': '{0} entries', 'kp.close': 'Close',
      'kp.merge': 'Merge…', 'kp.mergeTitle': 'Merge a database', 'kp.mergeHint': 'A copy of this database is synchronized (newer changes win, history and deletions are combined). The entries of another database are imported into a new group.',
      'kp.mergeOk': 'Merge', 'kp.synced': 'The databases were synchronized. Save to keep the result.', 'kp.imported': '{0} entries were imported into the group “{1}”. Save to keep them.',
      'kp.report': 'Report', 'kp.reportTitle': 'Password report', 'kp.reportOk': 'No problems found: all passwords are strong, unique and current.',
      'kp.issueEmpty': 'Empty password', 'kp.issueWeak': 'Weak password ({0} bits)', 'kp.issueReused': 'Used in {0} entries', 'kp.issueExpired': 'Expired {0}', 'kp.issueOld': 'Unchanged for {0} days',
      'kp.reportSummary': '{0} entries checked · {1} with problems', 'kp.reportHint': 'Weak: less than 60 bits of estimated strength. Old: unchanged for more than a year. Entries in the recycle bin are ignored.', 'kp.recent': 'Recently used',
    },
    de: {
      'app.title': 'KeePass', 'kp.undo': 'Rückgängig', 'kp.redo': 'Wiederholen', 'kp.attachmentUpdated': 'Der Anhang „{0}“ wurde aktualisiert. Speichern Sie die Datenbank, um die Änderung zu behalten.', 'kp.attachmentGone': 'Der Eintrag existiert nicht mehr (oder die Datenbank ist gesperrt).',
      'kp.open': 'Datenbank öffnen', 'kp.chooseFile': 'Datenbank wählen…', 'kp.database': 'Datenbank', 'kp.noFile': 'Keine Datenbank gewählt',
      'kp.password': 'Passwort', 'kp.keyFile': 'Schlüsseldatei (optional)', 'kp.chooseKeyFile': 'Schlüsseldatei wählen…', 'kp.unlock': 'Entsperren', 'kp.unlocking': 'Entsperren…',
      'kp.create': 'Neue Datenbank anlegen', 'kp.createTitle': 'Neue Datenbank', 'kp.name': 'Name', 'kp.repeat': 'Passwort wiederholen',
      'kp.withKeyFile': 'Zusätzlich eine Schlüsseldatei erzeugen (wird heruntergeladen; gut aufbewahren)', 'kp.createButton': 'Datenbank anlegen', 'kp.back': 'Zurück',
      'kp.mismatch': 'Die Passwörter stimmen nicht überein.', 'kp.needCredentials': 'Bitte geben Sie ein Passwort ein oder erzeugen Sie eine Schlüsseldatei.',
      'kp.save': 'Speichern', 'kp.saveAs': 'Speichern unter', 'kp.lock': 'Sperren', 'kp.newEntry': 'Neuer Eintrag', 'kp.newGroup': 'Neue Gruppe', 'kp.settings': 'Datenbank',
      'kp.search': 'Suchen', 'kp.groups': 'Gruppen', 'kp.entries': 'Einträge', 'kp.noEntries': 'Keine Einträge.', 'kp.noMatch': 'Keine Einträge passen zur Suche.',
      'kp.title': 'Titel', 'kp.userName': 'Benutzername', 'kp.url': 'URL', 'kp.notes': 'Notizen', 'kp.tags': 'Tags (durch Kommas getrennt)',
      'kp.expires': 'Läuft ab', 'kp.expired': 'Abgelaufen', 'kp.show': 'Anzeigen', 'kp.hide': 'Verbergen', 'kp.copy': 'Kopieren', 'kp.copied': '{0} kopiert; die Zwischenablage wird in {1} Sekunden geleert.',
      'kp.generate': 'Erzeugen', 'kp.openUrl': 'Öffnen', 'kp.customFields': 'Weitere Felder', 'kp.addField': 'Feld hinzufügen', 'kp.fieldName': 'Name',
      'kp.fieldValue': 'Wert', 'kp.protected': 'Geschützt', 'kp.attachments': 'Anhänge', 'kp.addAttachment': 'Anhang hinzufügen', 'kp.history': 'Verlauf',
      'kp.restore': 'Wiederherstellen', 'kp.deleteEntry': 'Eintrag löschen', 'kp.deleteEntryConfirm': '„{0}“ löschen?', 'kp.group': 'Gruppe', 'kp.untitled': 'Neuer Eintrag',
      'kp.groupName': 'Gruppenname', 'kp.rename': 'Umbenennen', 'kp.deleteGroup': 'Gruppe löschen', 'kp.deleteGroupConfirm': 'Die Gruppe „{0}“ mit allen Einträgen löschen?',
      'kp.recycleBin': 'Papierkorb', 'kp.emptyBin': 'Papierkorb leeren', 'kp.emptyBinConfirm': 'Alles im Papierkorb endgültig löschen?',
      'kp.generator': 'Passwortgenerator', 'kp.length': 'Länge', 'kp.lower': 'a–z', 'kp.upper': 'A–Z', 'kp.digits': '0–9', 'kp.symbols': 'Sonderzeichen', 'kp.ambiguous': 'Ähnliche Zeichen vermeiden (l, 1, O, 0)',
      'kp.use': 'Übernehmen', 'kp.strength': '{0} Bit', 'kp.settingsTitle': 'Datenbankeinstellungen', 'kp.newPassword': 'Neues Master-Passwort', 'kp.changeKey': 'Hauptschlüssel ändern',
      'kp.keyChanged': 'Der Hauptschlüssel wurde geändert. Speichern Sie die Datenbank, um die Änderung zu behalten.', 'kp.newKeyFile': 'Neue Schlüsseldatei', 'kp.removeKeyFile': 'Schlüsseldatei entfernen',
      'kp.locked': 'Die Datenbank wurde nach {0} Minuten ohne Aktivität gesperrt.', 'kp.unsavedLock': 'Sie haben ungespeicherte Änderungen. Trotzdem sperren (die Änderungen gehen verloren)?',
      'kp.modified': 'Geändert {0}', 'kp.otp': 'Einmalpasswort', 'kp.entryCount': '{0} Einträge', 'kp.close': 'Schließen', 'kp.recent': 'Zuletzt verwendet',
      'kp.merge': 'Zusammenführen…', 'kp.mergeTitle': 'Datenbank zusammenführen', 'kp.mergeHint': 'Eine Kopie dieser Datenbank wird abgeglichen (neuere Änderungen gewinnen, Verlauf und Löschungen werden zusammengeführt). Die Einträge einer anderen Datenbank werden in eine neue Gruppe übernommen.',
      'kp.mergeOk': 'Zusammenführen', 'kp.synced': 'Die Datenbanken wurden abgeglichen. Speichern Sie, um das Ergebnis zu behalten.', 'kp.imported': '{0} Einträge wurden in die Gruppe „{1}“ übernommen. Speichern Sie, um sie zu behalten.',
      'kp.report': 'Bericht', 'kp.reportTitle': 'Passwortbericht', 'kp.reportOk': 'Keine Probleme gefunden: alle Passwörter sind stark, einmalig und aktuell.',
      'kp.issueEmpty': 'Leeres Passwort', 'kp.issueWeak': 'Schwaches Passwort ({0} Bit)', 'kp.issueReused': 'In {0} Einträgen verwendet', 'kp.issueExpired': 'Abgelaufen {0}', 'kp.issueOld': 'Seit {0} Tagen unverändert',
      'kp.reportSummary': '{0} Einträge geprüft · {1} mit Problemen', 'kp.reportHint': 'Schwach: weniger als 60 Bit geschätzte Stärke. Alt: seit mehr als einem Jahr unverändert. Einträge im Papierkorb werden nicht geprüft.',
    },
  });

  const state = {
    db: null, name: '', handle: null, dirty: false,
    file: null, keyFile: null, busy: false, error: '', creating: false, recent: [],
    groupId: null, entryId: null, search: '', pane: 'entries', // pane: groups | entries | entry (phones)
    reveal: new Set(), historyPushed: null, generatorFor: null, gen: { length: 20, lower: true, upper: true, digits: true, symbols: true, excludeAmbiguous: false }, genValue: '',
    settingsOpen: false, renamingGroup: null, merge: null, report: false,
  };

  let renderQueued = false;
  function render() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; Suite.shell.refresh(); });
  }

  // Undo: after every change (setDirty) the snapshot taken after the previous change goes to the history.
  const history = new Suite.UndoHistory({ clone: (snap) => snap, onChange: () => render() });
  let baseline = null;

  function setDirty(coalesce = null) {
    if (state.db) {
      if (baseline) history.record(baseline, coalesce);
      baseline = state.db.snapshot();
    }
    state.dirty = true;
    Suite.shell.setDirty(true);
    render();
  }

  const fmtDate = (d) => (d ? new Date(d).toLocaleString(Suite.i18n.language === 'de' ? 'de-AT' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '');

  // ---- opening and creating ---------------------------------------------------------------------

  async function chooseDatabase() {
    try {
      const picked = await Suite.files.open({ types: [{ description: 'KeePass', accept: { 'application/octet-stream': ['.kdbx'] } }] });
      if (picked) { state.file = picked[0]; state.error = ''; render(); }
    } catch (e) { state.error = Suite.i18n.describe(e); render(); }
  }

  async function chooseKeyFile() {
    const picked = await Suite.files.open();
    if (picked) { state.keyFile = new Uint8Array(await picked[0].file.arrayBuffer()); state.keyFileName = picked[0].file.name; render(); }
  }

  async function unlock(password) {
    if (!state.file) return;
    state.busy = true;
    state.error = '';
    render();
    try {
      const db = await Suite.kdbx.open(new Uint8Array(await state.file.file.arrayBuffer()), { password, keyFile: state.keyFile });
      showDatabase(db, state.file.file.name, state.file.handle);
      if (state.file.handle) Suite.files.remember(APP, state.file.handle);
    } catch (e) {
      state.error = Suite.i18n.describe(e);
    } finally {
      state.busy = false;
      render();
    }
  }

  function showDatabase(db, name, handle) {
    history.clear();
    baseline = db.snapshot();
    Object.assign(state, { db, name, handle, dirty: false, groupId: db.root.uuid.id, entryId: null, search: '', pane: 'entries', reveal: new Set(), file: null, keyFile: null, creating: false, error: '' });
    Suite.shell.setDirty(false);
    resetAutoLock();
    render();
  }

  async function createDatabase({ name, password, repeat, withKeyFile }) {
    if (password !== repeat) { state.error = t('kp.mismatch'); render(); return; }
    if (!password && !withKeyFile) { state.error = t('kp.needCredentials'); render(); return; }
    state.busy = true;
    render();
    try {
      const { db, keyFile } = await Suite.kdbx.create({ name, password, withKeyFile, generator: 'Portable Web App Suite' });
      if (keyFile) Suite.files.download(keyFile, `${name}.keyx`, 'application/xml');
      showDatabase(db, `${name}.kdbx`, null);
      state.isNew = true;
      setDirty();
    } catch (e) { state.error = Suite.i18n.describe(e); } finally { state.busy = false; render(); }
  }

  async function lock(force = false) {
    if (!state.db) return;
    if (state.dirty && !force && !(await Suite.shell.confirm(t('kp.unsavedLock')))) return;
    history.clear();
    baseline = null;
    Object.assign(state, { db: null, dirty: false, entryId: null, groupId: null, reveal: new Set(), file: state.handle ? { file: await state.handle.getFile(), handle: state.handle } : null });
    Suite.shell.setDirty(false);
    render();
  }

  // ---- auto-lock ---------------------------------------------------------------------------------

  let lockTimer = null;
  function resetAutoLock() {
    clearTimeout(lockTimer);
    if (!state.db) return;
    lockTimer = setTimeout(async () => {
      if (!state.db || state.dirty) return; // never lose unsaved changes
      await lock(true);
      Suite.shell.toast(t('kp.locked', AUTO_LOCK_MINUTES), 'warning');
    }, AUTO_LOCK_MINUTES * 60000);
  }
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) document.addEventListener(ev, resetAutoLock, { passive: true });

  // ---- saving ------------------------------------------------------------------------------------

  function report(result) { if (result.mode === 'downloaded') Suite.shell.banner(result.message); else Suite.shell.toast(result.message); }

  async function save(as = false) {
    if (!state.db) return;
    try {
      const bytes = await state.db.save();
      const result = as || (state.isNew && !state.handle) ? await Suite.files.saveAs(bytes, { suggestedName: state.name, types: [{ description: 'KeePass', accept: { 'application/octet-stream': ['.kdbx'] } }] })
        : await Suite.files.save({ name: state.name, handle: state.handle }, bytes);
      if (!result) return;
      report(result);
      if (result.handle) state.handle = result.handle;
      state.name = result.name;
      state.isNew = false;
      state.dirty = false;
      Suite.shell.setDirty(false);
      render();
    } catch (e) { Suite.shell.toast(Suite.i18n.describe(e), 'error'); }
  }

  // ---- entries and groups -----------------------------------------------------------------------

  const db = () => state.db;
  const findGroup = (id) => [...db().root.allGroups()].find((g) => g.uuid.id === id); // includes the recycle bin
  const currentGroup = () => (state.groupId && findGroup(state.groupId)) || db().root;
  const currentEntry = () => (state.entryId ? db().findEntry(state.entryId) : null);
  const inBin = (group) => db().isInRecycleBin(group);

  function visibleEntries() {
    const q = state.search.trim().toLowerCase();
    if (q) {
      return db().entries().filter((e) => {
        const f = db().fields(e);
        return [f.Title, f.UserName, f.URL, f.Notes, (e.tags || []).join(' ')].some((v) => (v || '').toLowerCase().includes(q));
      });
    }
    const group = currentGroup();
    return inBin(group) ? group.entries : db().entries(group, { recursive: false });
  }

  function selectEntry(entry) {
    state.entryId = entry ? entry.uuid.id : null;
    state.historyPushed = null;
    state.reveal = new Set();
    state.generatorFor = null;
    state.pane = entry ? 'entry' : 'entries';
    render();
  }

  /** Apply edited fields; the first change of an editing session saves the previous version in the history. */
  function updateEntry(entry, values, options = {}) {
    const first = state.historyPushed !== entry.uuid.id;
    db().setFields(entry, values, { ...options, history: first });
    state.historyPushed = entry.uuid.id;
    setDirty(`${entry.uuid.id}:${Object.keys(values).join()}`);
  }

  function step(redo) {
    if (!state.db) return;
    const snap = redo ? history.redo(state.db.snapshot()) : history.undo(state.db.snapshot());
    if (!snap) return;
    state.db.restore(snap);
    baseline = state.db.snapshot();
    if (state.entryId && !db().findEntry(state.entryId)) selectEntry(null);
    if (state.groupId && !findGroup(state.groupId)) state.groupId = db().root.uuid.id;
    state.historyPushed = null; // the restored entry history no longer contains the version pushed for editing
    state.renamingGroup = null;
    state.dirty = true;
    Suite.shell.setDirty(true);
    render();
  }

  function newEntry() {
    const group = inBin(currentGroup()) ? db().root : currentGroup();
    const entry = db().addEntry(group, { Title: t('kp.untitled'), UserName: '', Password: KP.generatePassword(state.gen), URL: '', Notes: '' });
    state.search = '';
    state.groupId = group.uuid.id;
    selectEntry(entry);
    state.historyPushed = entry.uuid.id; // a new entry needs no history
    setDirty();
    requestAnimationFrame(() => { const el = document.querySelector('[data-testid=field-Title]'); if (el) { el.focus(); el.select(); } });
  }

  async function deleteEntry(entry) {
    if (!(await Suite.shell.confirm(t('kp.deleteEntryConfirm', db().field(entry, 'Title'))))) return;
    db().deleteEntry(entry);
    selectEntry(null);
    setDirty();
  }

  function newGroup() {
    const parent = inBin(currentGroup()) ? db().root : currentGroup();
    const group = db().createGroup(parent, t('kp.newGroup'));
    state.groupId = group.uuid.id;
    state.renamingGroup = group.uuid.id;
    state.pane = 'groups';
    setDirty();
  }

  async function deleteGroup(group) {
    if (group === db().root || !(await Suite.shell.confirm(t('kp.deleteGroupConfirm', group.name)))) return;
    const parent = group.parentGroup;
    db().deleteGroup(group);
    state.groupId = parent ? parent.uuid.id : db().root.uuid.id;
    setDirty();
  }

  async function emptyBin() {
    if (!(await Suite.shell.confirm(t('kp.emptyBinConfirm')))) return;
    db().emptyRecycleBin();
    state.groupId = db().root.uuid.id;
    selectEntry(null);
    setDirty();
  }

  let clipboardTimer = null;
  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      Suite.shell.toast(t('kp.copied', label, CLIPBOARD_CLEAR_SECONDS));
      clearTimeout(clipboardTimer);
      clipboardTimer = setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), CLIPBOARD_CLEAR_SECONDS * 1000);
    } catch (e) { Suite.shell.toast(Suite.i18n.describe(e), 'error'); }
  }

  async function addAttachments(entry, files) {
    for (const file of files) await db().setAttachment(entry, file.name, new Uint8Array(await file.arrayBuffer()));
    if (state.historyPushed !== entry.uuid.id) state.historyPushed = entry.uuid.id;
    setDirty();
  }

  /** "Open with…": edit an attachment in another app; saving there replaces the attachment (save the database then). */
  function openAttachmentWith(entry, name) {
    const id = entry.uuid.id;
    Suite.bridge.openWith(name, {
      exclude: 'keepass',
      source: `${state.name}: ${db().field(entry, 'Title') || name}`,
      data: () => db().attachment(entry, name),
      save: async (bytes) => {
        const current = state.db && db().findEntry(id);
        if (!current) throw new Error(t('kp.attachmentGone'));
        await db().setAttachment(current, name, bytes);
        setDirty();
        Suite.shell.toast(t('kp.attachmentUpdated', name));
      },
    });
  }

  // ---- TOTP ----------------------------------------------------------------------------------------

  function totpOf(entry) {
    const uri = db().field(entry, 'otp');
    if (!uri || typeof OTPAuth === 'undefined') return null;
    try {
      const otp = OTPAuth.URI.parse(uri.trim());
      if (otp instanceof OTPAuth.TOTP) return { code: otp.generate(), remaining: otp.period - (Math.floor(Date.now() / 1000) % otp.period) };
      return null;
    } catch (e) { return null; }
  }
  setInterval(() => { if (state.db && state.entryId) render(); }, 1000);

  // ---- UI: lock screen -------------------------------------------------------------------------------

  function LockScreen() {
    if (state.creating) {
      return html`<article class="kp-card" data-testid="create-form">
        <h2>${t('kp.createTitle')}</h2>
        <form onSubmit=${(e) => { e.preventDefault(); const f = e.target.elements; createDatabase({ name: f.name.value || 'Passwords', password: f.password.value, repeat: f.repeat.value, withKeyFile: f.keyfile.checked }); }}>
          <label>${t('kp.name')}<input name="name" data-testid="create-name" defaultValue="Passwords" /></label>
          <label>${t('kp.password')}<input name="password" type="password" data-testid="create-password" autocomplete="new-password" /></label>
          <label>${t('kp.repeat')}<input name="repeat" type="password" data-testid="create-repeat" autocomplete="new-password" /></label>
          <label><input type="checkbox" name="keyfile" data-testid="create-keyfile" /> ${t('kp.withKeyFile')}</label>
          ${state.error ? html`<p class="kp-error" data-testid="error">${state.error}</p>` : null}
          <div class="kp-buttons">
            <button type="button" class="secondary" onClick=${() => { state.creating = false; state.error = ''; render(); }}>${t('kp.back')}</button>
            <button type="submit" data-testid="create-submit" aria-busy=${state.busy}>${t('kp.createButton')}</button>
          </div>
        </form>
      </article>`;
    }
    return html`<article class="kp-card" data-testid="unlock-form">
      <h2>${t('kp.open')}</h2>
      <form onSubmit=${(e) => { e.preventDefault(); unlock(e.target.elements.password.value); }}>
        <label>${t('kp.database')}</label>
        <div class="kp-file">
          <button type="button" class="secondary" data-testid="choose-db" onClick=${chooseDatabase}>${t('kp.chooseFile')}</button>
          <span data-testid="db-name">${state.file ? state.file.file.name : t('kp.noFile')}</span>
        </div>
        ${state.recent.length ? html`<label>${t('kp.recent')}<select data-testid="recent" onChange=${async (e) => { const r = state.recent[+e.target.value]; e.target.value = ''; const picked = r && await Suite.files.reopen(r.handle); if (picked) { state.file = picked; render(); } }}>
          <option value=""></option>${state.recent.map((r, i) => html`<option value=${i}>${r.name}</option>`)}</select></label>` : null}
        <label>${t('kp.password')}<input name="password" type="password" data-testid="password" autocomplete="current-password" /></label>
        <label>${t('kp.keyFile')}</label>
        <div class="kp-file">
          <button type="button" class="secondary outline" data-testid="choose-keyfile" onClick=${chooseKeyFile}>${t('kp.chooseKeyFile')}</button>
          <span>${state.keyFileName && state.keyFile ? state.keyFileName : ''}</span>
          ${state.keyFile ? html`<button type="button" class="secondary outline" onClick=${() => { state.keyFile = null; render(); }}>×</button>` : null}
        </div>
        ${state.error ? html`<p class="kp-error" data-testid="error">${state.error}</p>` : null}
        <button type="submit" data-testid="unlock" disabled=${!state.file} aria-busy=${state.busy}>${state.busy ? t('kp.unlocking') : t('kp.unlock')}</button>
      </form>
      <p><a href="#" data-testid="create" onClick=${(e) => { e.preventDefault(); state.creating = true; state.error = ''; render(); }}>${t('kp.create')}</a></p>
    </article>`;
  }

  // ---- UI: database ---------------------------------------------------------------------------------

  function GroupTree({ group, depth }) {
    const bin = inBin(group);
    const active = state.groupId === group.uuid.id && !state.search;
    return html`<li>
      ${state.renamingGroup === group.uuid.id
        ? html`<form class="kp-rename" onSubmit=${(e) => { e.preventDefault(); group.name = e.target.elements.name.value || group.name; group.times.update(); state.renamingGroup = null; setDirty(); }}>
            <input name="name" data-testid="group-name-input" defaultValue=${group.name} autofocus onBlur=${(e) => { group.name = e.target.value || group.name; state.renamingGroup = null; setDirty(); }} /></form>`
        : html`<a href="#" class=${active ? 'active' : ''} data-testid="group" style=${`padding-left:${depth * 0.9 + 0.4}rem`}
              onClick=${(e) => { e.preventDefault(); state.groupId = group.uuid.id; state.search = ''; state.entryId = null; state.pane = 'entries'; render(); }}
              onDblClick=${() => { if (group !== db().root && !bin) { state.renamingGroup = group.uuid.id; render(); } }}>${bin ? '🗑 ' : '📁 '}${group.name || '—'}</a>`}
      ${group.groups.length ? html`<ul>${group.groups.map((g) => html`<${GroupTree} group=${g} depth=${depth + 1} key=${g.uuid.id} />`)}</ul>` : null}
    </li>`;
  }

  function Groups() {
    const group = currentGroup();
    const bin = db().recycleBin;
    return html`<div class="kp-groups" data-testid="groups">
      <div class="kp-pane-head"><strong>${t('kp.groups')}</strong></div>
      <ul class="kp-tree"><${GroupTree} group=${db().root} depth=${0} /></ul>
      <div class="kp-group-actions">
        <button class="secondary outline" data-testid="new-group" onClick=${newGroup}>+ ${t('kp.newGroup')}</button>
        ${group !== db().root && !inBin(group) ? html`<button class="secondary outline" data-testid="rename-group" onClick=${() => { state.renamingGroup = group.uuid.id; render(); }}>${t('kp.rename')}</button>
          <button class="secondary outline" data-testid="delete-group" onClick=${() => deleteGroup(group)}>${t('kp.deleteGroup')}</button>` : null}
        ${bin && group === bin && (bin.entries.length || bin.groups.length) ? html`<button class="secondary outline" data-testid="empty-bin" onClick=${emptyBin}>${t('kp.emptyBin')}</button>` : null}
      </div>
    </div>`;
  }

  function Entries() {
    const list = visibleEntries().slice().sort((a, b) => db().field(a, 'Title').localeCompare(db().field(b, 'Title'), undefined, { sensitivity: 'base' }));
    return html`<section class="kp-entries" data-testid="entries">
      <div class="kp-pane-head">
        <button class="secondary outline kp-only-phone" data-testid="show-groups" onClick=${() => { state.pane = 'groups'; render(); }}>‹ ${t('kp.groups')}</button>
        <input type="search" data-testid="search" placeholder=${t('kp.search')} value=${state.search} onInput=${(e) => { state.search = e.target.value; render(); }} />
      </div>
      ${list.length ? html`<ul class="kp-list">${list.map((e) => {
        const f = db().fields(e);
        return html`<li class=${state.entryId === e.uuid.id ? 'active' : ''} data-testid="entry" onClick=${() => selectEntry(e)} key=${e.uuid.id}>
          <strong>${f.Title || '—'}</strong><small>${f.UserName}${state.search ? ` · ${db().groupPath(e.parentGroup) || db().name}` : ''}</small></li>`;
      })}</ul>` : html`<p class="kp-empty" data-testid="no-entries">${state.search ? t('kp.noMatch') : t('kp.noEntries')}</p>`}
      <p class="kp-count">${t('kp.entryCount', list.length)}</p>
    </section>`;
  }

  function SecretInput({ entry, field, testid }) {
    const shown = state.reveal.has(field);
    const value = db().field(entry, field);
    return html`<div class="kp-secret">
      <input type=${shown ? 'text' : 'password'} data-testid=${testid} value=${value} autocomplete="off" spellcheck="false"
             onInput=${(e) => updateEntry(entry, { [field]: e.target.value }, { protect: field === 'Password' ? [] : [field] })} />
      <button type="button" class="secondary outline" title=${shown ? t('kp.hide') : t('kp.show')} data-testid=${`${testid}-reveal`}
              onClick=${() => { if (shown) state.reveal.delete(field); else state.reveal.add(field); render(); }}>${shown ? '🙈' : '👁'}</button>
      <button type="button" class="secondary outline" title=${t('kp.copy')} data-testid=${`${testid}-copy`} onClick=${() => copy(db().field(entry, field), field === 'Password' ? t('kp.password') : field)}>⧉</button>
    </div>`;
  }

  function Generator({ entry }) {
    const g = state.gen;
    const regenerate = () => { state.genValue = KP.generatePassword(g); render(); };
    if (!state.genValue) state.genValue = KP.generatePassword(g);
    const opt = (key, label) => html`<label><input type="checkbox" checked=${g[key]} data-testid=${`gen-${key}`} onChange=${(e) => { g[key] = e.target.checked; regenerate(); }} /> ${t(label)}</label>`;
    return html`<div class="kp-generator" data-testid="generator">
      <strong>${t('kp.generator')}</strong>
      <code data-testid="gen-value">${state.genValue}</code> <small>${t('kp.strength', KP.entropy(state.genValue))}</small>
      <label>${t('kp.length')}: ${g.length}<input type="range" min="4" max="64" value=${g.length} data-testid="gen-length" onInput=${(e) => { g.length = +e.target.value; regenerate(); }} /></label>
      <div class="kp-gen-options">${opt('lower', 'kp.lower')}${opt('upper', 'kp.upper')}${opt('digits', 'kp.digits')}${opt('symbols', 'kp.symbols')}${opt('excludeAmbiguous', 'kp.ambiguous')}</div>
      <div class="kp-buttons">
        <button type="button" class="secondary" onClick=${regenerate}>⟳</button>
        <button type="button" class="secondary outline" onClick=${() => { state.generatorFor = null; render(); }}>${t('kp.close')}</button>
        <button type="button" data-testid="gen-use" onClick=${() => { updateEntry(entry, { Password: state.genValue }); state.generatorFor = null; render(); }}>${t('kp.use')}</button>
      </div>
    </div>`;
  }

  function EntryEditor() {
    const entry = currentEntry();
    if (!entry) return html`<section class="kp-editor kp-placeholder"></section>`;
    const f = db().fields(entry);
    const custom = Object.keys(f).filter((k) => !STANDARD.includes(k));
    const field = (key, label, extra = {}) => html`<label>${t(label)}<input data-testid=${`field-${key}`} value=${f[key] || ''} ...${extra}
      onInput=${(e) => updateEntry(entry, { [key]: e.target.value })} /></label>`;
    const otp = totpOf(entry);
    const history = db().history(entry);
    const expires = entry.times.expires && entry.times.expiryTime;
    const expired = expires && new Date(entry.times.expiryTime) < new Date();
    return html`<section class="kp-editor" data-testid="editor">
      <div class="kp-pane-head">
        <button class="secondary outline kp-only-phone" data-testid="back-to-entries" onClick=${() => { state.pane = 'entries'; render(); }}>‹ ${t('kp.entries')}</button>
        <small>${t('kp.modified', fmtDate(entry.times.lastModTime))}</small>
      </div>
      ${field('Title', 'kp.title')}
      <label>${t('kp.userName')}<div class="kp-secret"><input data-testid="field-UserName" value=${f.UserName || ''} autocomplete="off" onInput=${(e) => updateEntry(entry, { UserName: e.target.value })} />
        <button type="button" class="secondary outline" data-testid="field-UserName-copy" onClick=${() => copy(db().field(entry, 'UserName'), t('kp.userName'))}>⧉</button></div></label>
      <label>${t('kp.password')}<${SecretInput} entry=${entry} field="Password" testid="field-Password" /></label>
      <div class="kp-row">
        <button type="button" class="secondary outline" data-testid="generate" onClick=${() => { state.generatorFor = entry.uuid.id; state.genValue = ''; render(); }}>🎲 ${t('kp.generate')}</button>
        <small>${t('kp.strength', KP.entropy(f.Password || ''))}</small>
      </div>
      ${state.generatorFor === entry.uuid.id ? html`<${Generator} entry=${entry} />` : null}
      <label>${t('kp.url')}<div class="kp-secret"><input data-testid="field-URL" value=${f.URL || ''} inputmode="url" onInput=${(e) => updateEntry(entry, { URL: e.target.value })} />
        <a role="button" class="secondary outline" href=${/^https?:\/\//i.test(f.URL || '') ? f.URL : '#'} target="_blank" rel="noopener noreferrer">${t('kp.openUrl')}</a></div></label>
      ${otp ? html`<p class="kp-otp">${t('kp.otp')}: <code data-testid="otp-code">${otp.code}</code> <small>(${otp.remaining} s)</small>
        <button type="button" class="secondary outline" onClick=${() => copy(otp.code, t('kp.otp'))}>⧉</button></p>` : null}
      <label>${t('kp.notes')}<textarea data-testid="field-Notes" rows="4" onInput=${(e) => updateEntry(entry, { Notes: e.target.value })}>${f.Notes || ''}</textarea></label>
      <label>${t('kp.tags')}<input data-testid="field-tags" key=${`tags-${entry.uuid.id}-${(entry.tags || []).join()}`} defaultValue=${(entry.tags || []).join(', ')}
        onChange=${(e) => { if (state.historyPushed !== entry.uuid.id) { entry.pushHistory(); state.historyPushed = entry.uuid.id; } entry.tags = e.target.value.split(',').map((s) => s.trim()).filter(Boolean); entry.times.update(); setDirty(); }} /></label>
      <div class="kp-row">
        <label><input type="checkbox" data-testid="expires" checked=${!!entry.times.expires} onChange=${(e) => { entry.times.expires = e.target.checked; if (e.target.checked && !entry.times.expiryTime) entry.times.expiryTime = new Date(Date.now() + 365 * 86400000); setDirty(); }} /> ${t('kp.expires')}</label>
        ${entry.times.expires ? html`<input type="date" data-testid="expiry-date" value=${entry.times.expiryTime ? new Date(entry.times.expiryTime).toISOString().slice(0, 10) : ''}
          onChange=${(e) => { entry.times.expiryTime = e.target.value ? new Date(`${e.target.value}T00:00:00`) : null; setDirty(); }} />` : null}
        ${expired ? html`<span class="kp-error">${t('kp.expired')}</span>` : null}
      </div>
      <fieldset class="kp-custom" data-testid="custom-fields">
        <legend>${t('kp.customFields')}</legend>
        ${custom.map((key) => {
          const isProtected = entry.fields.get(key) instanceof kdbxweb.ProtectedValue;
          return html`<div class="kp-custom-row" data-testid="custom-field">
            <span class="kp-custom-name">${key}</span>
            ${isProtected ? html`<${SecretInput} entry=${entry} field=${key} testid=${`custom-${key}`} />`
              : html`<input data-testid=${`custom-${key}`} value=${f[key]} onInput=${(e) => updateEntry(entry, { [key]: e.target.value })} />`}
            <label title=${t('kp.protected')}><input type="checkbox" checked=${isProtected} data-testid=${`custom-${key}-protected`}
              onChange=${(e) => updateEntry(entry, { [key]: db().field(entry, key) }, { protect: e.target.checked ? [key] : [] })} /> 🔒</label>
            <button type="button" class="secondary outline" data-testid=${`custom-${key}-delete`} onClick=${() => updateEntry(entry, { [key]: null })}>×</button>
          </div>`;
        })}
        <form class="kp-custom-row" onSubmit=${(e) => { e.preventDefault(); const name = e.target.elements.name.value.trim(); if (!name || STANDARD.includes(name)) return; updateEntry(entry, { [name]: e.target.elements.value.value }, { protect: e.target.elements.protect.checked ? [name] : [] }); e.target.reset(); }}>
          <input name="name" data-testid="new-field-name" placeholder=${t('kp.fieldName')} />
          <input name="value" data-testid="new-field-value" placeholder=${t('kp.fieldValue')} />
          <label><input type="checkbox" name="protect" data-testid="new-field-protected" /> 🔒</label>
          <button type="submit" class="secondary" data-testid="add-field">${t('kp.addField')}</button>
        </form>
      </fieldset>
      <fieldset class="kp-attachments" data-testid="attachments">
        <legend>${t('kp.attachments')}</legend>
        <ul>${[...entry.binaries.keys()].map((name) => html`<li data-testid="attachment">
          <a href="#" onClick=${(e) => { e.preventDefault(); Suite.files.download(db().attachment(entry, name), name); }}>${name}</a>
          <button type="button" class="secondary outline" title=${t('bridge.openWith')} aria-label=${t('bridge.openWith')} data-testid="attachment-open-with" onClick=${() => openAttachmentWith(entry, name)}>↗</button>
          <button type="button" class="secondary outline" data-testid="remove-attachment" onClick=${() => { db().removeAttachment(entry, name); setDirty(); }}>×</button></li>`)}</ul>
        <label class="kp-file-button" role="button">${t('kp.addAttachment')}<input type="file" multiple hidden data-testid="add-attachment" onChange=${(e) => { addAttachments(entry, [...e.target.files]); e.target.value = ''; }} /></label>
      </fieldset>
      <label>${t('kp.group')}<select data-testid="entry-group" onChange=${(e) => { const g = db().groups().find((x) => x.id === e.target.value); if (g) { db().move(entry, g.group); state.groupId = g.id; setDirty(); } }}>
        ${db().groups().map((g) => html`<option value=${g.id} selected=${g.id === entry.parentGroup.uuid.id}>${g.path || db().name}</option>`)}</select></label>
      ${history.length ? html`<details class="kp-history" data-testid="history"><summary>${t('kp.history')} (${history.length})</summary><ul>
        ${history.map((h, i) => html`<li data-testid="history-item">${fmtDate(h.times.lastModTime)} – ${db().field(h, 'Title')} / ${db().field(h, 'UserName')}
          <button type="button" class="secondary outline" data-testid="restore" onClick=${() => { db().restoreHistory(entry, i); state.historyPushed = entry.uuid.id; setDirty(); }}>${t('kp.restore')}</button></li>`).reverse()}
      </ul></details>` : null}
      <button type="button" class="secondary kp-delete" data-testid="delete-entry" onClick=${() => deleteEntry(entry)}>${t('kp.deleteEntry')}</button>
    </section>`;
  }

  // ---- merging ----------------------------------------------------------------------------------

  async function chooseMerge() {
    try {
      const picked = await Suite.files.open({ types: [{ description: 'KeePass', accept: { 'application/octet-stream': ['.kdbx'] } }] });
      if (picked) { state.merge = { file: picked[0], keyFile: null, error: '', busy: false }; render(); }
    } catch (e) { Suite.shell.toast(Suite.i18n.describe(e), 'error'); }
  }

  async function runMerge(password) {
    const m = state.merge;
    m.busy = true; m.error = ''; render();
    try {
      const other = await Suite.kdbx.open(new Uint8Array(await m.file.file.arrayBuffer()), { password, keyFile: m.keyFile });
      const result = db().merge(other);
      state.merge = null;
      if (result.mode === 'import') { state.groupId = result.group.uuid.id; state.entryId = null; state.pane = 'entries'; Suite.shell.toast(t('kp.imported', result.count, result.group.name)); } else Suite.shell.toast(t('kp.synced'));
      setDirty();
    } catch (e) { m.error = Suite.i18n.describe(e); m.busy = false; render(); }
  }

  function MergeDialog() {
    const m = state.merge;
    if (!m) return null;
    return html`<dialog open data-testid="merge-dialog"><article>
      <header><strong>${t('kp.mergeTitle')}</strong></header>
      <p><small>${t('kp.mergeHint')}</small></p>
      <form onSubmit=${(e) => { e.preventDefault(); runMerge(e.target.elements.password.value); }}>
        <p data-testid="merge-file">${m.file.file.name}</p>
        <label>${t('kp.password')}<input type="password" name="password" data-testid="merge-password" autocomplete="off" autofocus /></label>
        <button type="button" class="secondary outline" onClick=${async () => { const p = await Suite.files.open(); if (p) { m.keyFile = new Uint8Array(await p[0].file.arrayBuffer()); m.keyFileName = p[0].file.name; render(); } }}>${m.keyFileName || t('kp.chooseKeyFile')}</button>
        ${m.error ? html`<p class="kp-error" data-testid="merge-error">${m.error}</p>` : null}
        <footer><button type="button" class="secondary" onClick=${() => { state.merge = null; render(); }}>${t('kp.close')}</button>
          <button type="submit" data-testid="merge-ok" aria-busy=${m.busy}>${t('kp.mergeOk')}</button></footer>
      </form>
    </article></dialog>`;
  }

  // ---- password report --------------------------------------------------------------------------

  const DAY = 86400000;

  /** When the password of an entry was last changed (from its history). */
  function passwordChanged(entry) {
    const versions = [...db().history(entry), entry];
    const current = db().field(entry, 'Password');
    let changed = entry.times.lastModTime;
    for (let i = versions.length - 1; i >= 0; i--) {
      if (db().field(versions[i], 'Password') !== current) break;
      changed = versions[i].times.lastModTime || changed;
    }
    return changed;
  }

  /** Entries with problems: [{ entry, issues: [text] }] (recycle bin excluded). */
  function passwordReport() {
    const entries = db().entries().filter((e) => !db().isInRecycleBin(e.parentGroup));
    const uses = new Map();
    for (const e of entries) { const pw = db().field(e, 'Password'); if (pw) uses.set(pw, (uses.get(pw) || 0) + 1); }
    const now = Date.now();
    const rows = [];
    for (const e of entries) {
      const pw = db().field(e, 'Password');
      const issues = [];
      if (!pw) issues.push(t('kp.issueEmpty'));
      else {
        const bits = KP.entropy(pw);
        if (bits < 60) issues.push(t('kp.issueWeak', bits));
        if (uses.get(pw) > 1) issues.push(t('kp.issueReused', uses.get(pw)));
        const changed = passwordChanged(e);
        if (changed && now - changed > 365 * DAY) issues.push(t('kp.issueOld', Math.floor((now - changed) / DAY)));
      }
      if (e.times.expires && e.times.expiryTime && e.times.expiryTime < now) issues.push(t('kp.issueExpired', fmtDate(e.times.expiryTime)));
      if (issues.length) rows.push({ entry: e, issues });
    }
    return { checked: entries.length, rows };
  }

  function ReportDialog() {
    if (!state.report) return null;
    const { checked, rows } = passwordReport();
    return html`<dialog open data-testid="report-dialog"><article class="kp-report">
      <header><strong>${t('kp.reportTitle')}</strong></header>
      <p data-testid="report-summary">${t('kp.reportSummary', checked, rows.length)}</p>
      ${rows.length ? html`<ul class="kp-report-list">${rows.map(({ entry, issues }) => html`<li data-testid="report-row">
          <a href="#" onClick=${(e) => { e.preventDefault(); state.report = false; state.groupId = entry.parentGroup.uuid.id; state.search = ''; selectEntry(entry); }}>${db().field(entry, 'Title') || '–'}</a>
          <small> ${db().groupPath(entry.parentGroup)}</small><br /><span class="kp-issues">${issues.join(' · ')}</span></li>`)}</ul>`
        : html`<p data-testid="report-ok">✓ ${t('kp.reportOk')}</p>`}
      <p><small>${t('kp.reportHint')}</small></p>
      <footer><button data-testid="report-close" onClick=${() => { state.report = false; render(); }}>${t('kp.close')}</button></footer>
    </article></dialog>`;
  }

  function SettingsDialog() {
    if (!state.settingsOpen) return null;
    return html`<dialog open data-testid="settings"><article>
      <header><strong>${t('kp.settingsTitle')}</strong></header>
      <label>${t('kp.name')}<input data-testid="db-title" defaultValue=${db().db.meta.name || ''} onChange=${(e) => { db().db.meta.name = e.target.value; setDirty(); }} /></label>
      <form onSubmit=${async (e) => {
        e.preventDefault();
        const f = e.target.elements;
        if (f.password.value !== f.repeat.value) { Suite.shell.toast(t('kp.mismatch'), 'error'); return; }
        let keyFile = null;
        if (f.newkey.checked) { keyFile = new Uint8Array(await kdbxweb.Credentials.createRandomKeyFile(2)); Suite.files.download(keyFile, `${state.name.replace(/\.kdbx$/i, '')}.keyx`, 'application/xml'); }
        if (f.removekey && f.removekey.checked) keyFile = false;
        await db().changeMasterKey({ password: f.password.value || null, keyFile });
        state.settingsOpen = false;
        Suite.shell.toast(t('kp.keyChanged'));
        setDirty();
      }}>
        <h3>${t('kp.changeKey')}</h3>
        <label>${t('kp.newPassword')}<input type="password" name="password" data-testid="new-master" autocomplete="new-password" /></label>
        <label>${t('kp.repeat')}<input type="password" name="repeat" data-testid="new-master-repeat" autocomplete="new-password" /></label>
        <label><input type="checkbox" name="newkey" /> ${t('kp.newKeyFile')}</label>
        ${db().db.credentials.keyFileHash ? html`<label><input type="checkbox" name="removekey" /> ${t('kp.removeKeyFile')}</label>` : null}
        <footer>
          <button type="button" class="secondary" onClick=${() => { state.settingsOpen = false; render(); }}>${t('kp.close')}</button>
          <button type="submit" data-testid="change-key">${t('kp.changeKey')}</button>
        </footer>
      </form>
    </article></dialog>`;
  }

  function Toolbar() {
    if (!state.db) return null;
    return html`<nav class="kp-toolbar" role="toolbar">
      <button class=${state.dirty ? '' : 'secondary'} data-testid="save" title="${t('kp.save')} (Ctrl+S)" onClick=${() => save(false)}>${t('kp.save')}</button>
      <button class="secondary outline" title="${t('kp.undo')} (Ctrl+Z)" data-testid="undo" disabled=${!history.canUndo} onClick=${() => step(false)}>↶</button>
      <button class="secondary outline" title="${t('kp.redo')} (Ctrl+Y)" data-testid="redo" disabled=${!history.canRedo} onClick=${() => step(true)}>↷</button>
      <button class="secondary" data-testid="new-entry" onClick=${newEntry}>+ ${t('kp.newEntry')}</button>
      <button class="secondary outline" data-testid="db-settings" onClick=${() => { state.settingsOpen = true; render(); }}>⚙ ${t('kp.settings')}</button>
      <button class="secondary outline" data-testid="merge" onClick=${chooseMerge}>⇄ ${t('kp.merge')}</button>
      <button class="secondary outline" data-testid="report" onClick=${() => { state.report = true; render(); }}>🩺 ${t('kp.report')}</button>
      <button class="secondary outline" data-testid="lock" onClick=${() => lock(false)}>🔒 ${t('kp.lock')}</button>
    </nav>`;
  }

  function Main() {
    if (!state.db) return html`<div class="kp-center"><${LockScreen} /></div>`;
    return html`<div class=${`kp-layout pane-${state.pane}`} data-testid="workspace"><${Groups} /><${Entries} /><${EntryEditor} /><${SettingsDialog} /><${MergeDialog} /><${ReportDialog} /></div>`;
  }

  Suite.shell.mount({ id: APP, title: 'app.title', version: '%%BUILD_VERSION%%', toolbar: () => html`<${Toolbar} />`, main: () => html`<${Main} />` });
  Suite.files.dropZone(document.body, (picked) => {
    if (!picked.length || state.db) return;
    const db = picked.find((p) => /\.kdbx$/i.test(p.file.name)) || picked[0];
    state.file = db;
    const key = picked.find((p) => p !== db);
    if (key) key.file.arrayBuffer().then((b) => { state.keyFile = new Uint8Array(b); state.keyFileName = key.file.name; render(); });
    render();
  });
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || !state.db) return;
    const undoKey = Suite.UndoHistory.key(e);
    if (undoKey && !state.settingsOpen) { e.preventDefault(); step(undoKey === 'redo'); return; }
    const k = e.key.toLowerCase();
    if (k === 's') { e.preventDefault(); save(e.shiftKey); }
    if (k === 'f') { e.preventDefault(); const el = document.querySelector('[data-testid=search]'); if (el) el.focus(); }
    if (k === 'l') { e.preventDefault(); lock(false); }
  });
  Suite.files.recent(APP).then((r) => { state.recent = r; render(); });

  Suite.bridge.receive((picked) => { state.file = picked; state.error = ''; render(); }, { app: 'keepass' }); // files opened from other apps ("Open with…")

  // for tests
  KP.app = { state, history, step, showDatabase, save, lock, resetAutoLock, AUTO_LOCK_MINUTES };
  document.body.dataset.ready = 'true';
})();
