/*
 * Authenticator: one-time passwords (TOTP, HOTP, Steam) from a KeePass database – the codes of all entries with OTP data,
 * previous/current/next code, an adjustable clock, adding and editing tokens, importing (otpauth:// and Google Authenticator
 * export links, Aegis JSON, QR codes from pictures, the camera or the clipboard) and exporting (QR codes, a list of links).
 * The tokens are stored as KeePassXC/KeePass 2 do (shared/js/otp.js), so the database also works in other KeePass programs.
 * Ported from the Web Authenticator (EUPL-1.2) onto the suite's shell, kdbx.js, otp.js and qr.js.
 */
(function (AUTH) {
  'use strict';

  const { html } = Suite.shell;
  const t = Suite.t;
  const APP = 'authenticator';
  const AUTO_LOCK_MINUTES = 10;
  const KDBX_TYPES = [{ description: 'KeePass', accept: { 'application/octet-stream': ['.kdbx'] } }];
  const IMAGE_TYPES = [{ description: 'Images', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'] } }];
  const IMPORT_TYPES = [{ description: 'Text, JSON', accept: { 'text/plain': ['.txt'], 'application/json': ['.json'] } }];
  const clock = AUTH.clock;

  Suite.i18n.register({
    en: {
      'app.title': 'Authenticator',
      'au.tagline': 'One-time passwords from your KeePass database – offline, in your browser.',
      'au.open': 'Open database', 'au.drop': 'Choose a KeePass database (.kdbx) or drop it here – together with its key file, if it has one.',
      'au.chooseFile': 'Choose database…', 'au.noFile': 'No database selected', 'au.database': 'Database', 'au.recent': 'Recently opened',
      'au.password': 'Password', 'au.showPassword': 'Show password', 'au.keyFile': 'Key file (optional)', 'au.chooseKeyFile': 'Choose key file…', 'au.removeKeyFile': 'Remove key file',
      'au.unlock': 'Unlock', 'au.unlocking': 'Unlocking…', 'au.create': 'Create a new database', 'au.createTitle': 'New database', 'au.name': 'Name',
      'au.defaultName': 'Authenticator', 'au.repeat': 'Repeat password', 'au.weak': 'Short passwords are easy to guess; a longer passphrase is safer.',
      'au.withKeyFile': 'Also create a key file', 'au.keyFileHint': 'The key file is downloaded now. Keep it safe – without it the database cannot be opened.',
      'au.createButton': 'Create database', 'au.back': 'Back', 'au.mismatch': 'The passwords do not match.', 'au.needCredentials': 'Please enter a password or create a key file.',
      'au.save': 'Save', 'au.saveAs': 'Save as', 'au.lock': 'Lock', 'au.add': 'Add', 'au.import': 'Import', 'au.exportAll': 'Export all',
      'au.search': 'Search', 'au.empty': 'No tokens yet. Add one, or import it from a QR code or an otpauth:// link.', 'au.noMatch': 'No tokens match the search.',
      'au.tokens': '{0} tokens', 'au.copied': 'Code copied.', 'au.copyFailed': 'The code could not be copied.', 'au.copyHint': 'Click to copy',
      'au.nextCounter': 'Next code (counter +1)', 'au.edit': 'Edit', 'au.delete': 'Delete', 'au.share': 'Export / QR code', 'au.invalid': 'Invalid OTP data: {0}',
      'au.current': 'Current code', 'au.previous': 'Previous code', 'au.next': 'Next code', 'au.prevShort': 'prev', 'au.nextShort': 'next',
      'au.unsavedLock': 'There are unsaved changes. Lock anyway (the changes are lost)?', 'au.locked': 'The database was locked after {0} minutes without activity.',
      'au.addTitle': 'Add token', 'au.editTitle': 'Edit token', 'au.uri': 'Fill in from an otpauth:// link', 'au.issuer': 'Issuer', 'au.account': 'Account',
      'au.tokenName': 'Name (title of the entry)', 'au.secret': 'Secret key (Base32)', 'au.random': 'Generate a random secret', 'au.advanced': 'Advanced settings',
      'au.type': 'Type', 'au.totp': 'TOTP (time-based)', 'au.hotp': 'HOTP (counter-based)', 'au.steam': 'Steam', 'au.algorithm': 'Algorithm', 'au.digits': 'Digits',
      'au.period': 'Period (seconds)', 'au.counter': 'Counter', 'au.group': 'Group', 'au.preview': 'Current code', 'au.required': 'Please enter a name and a secret key.',
      'au.cancel': 'Cancel', 'au.close': 'Close', 'au.ok': 'Save',
      'au.deleteTitle': 'Delete token', 'au.deleteQuestion': 'Delete “{0}”?',
      'au.lockout': 'Make sure two-factor authentication is switched off for this account, or that you have another way to sign in – otherwise you may lock yourself out.',
      'au.entryHasMore': 'This KeePass entry also holds other data (e.g. a password).', 'au.removeOtp': 'Remove only the token', 'au.removeEntry': 'Delete the whole entry',
      'au.recycle': 'The entry is moved to the recycle bin of the database.', 'au.deleteOk': 'Delete',
      'au.shareTitle': 'Export token: {0}', 'au.shareWarning': 'Anyone who sees this QR code or link can create your codes. Do not pass it on.',
      'au.reveal': 'Show QR code and link', 'au.copyLink': 'Copy link', 'au.linkCopied': 'Link copied.',
      'au.exportTitle': 'Export all tokens', 'au.exportWarning': 'The export is NOT encrypted: anyone who has it can create your codes. Delete it after use.',
      'au.exportCount': '{0} tokens are exported.', 'au.exportText': 'Download the otpauth:// links (text file)', 'au.exportQr': 'Show QR codes',
      'au.importTitle': 'Import tokens', 'au.importText': 'otpauth:// or otpauth-migration:// links (one per line), Aegis JSON (unencrypted)',
      'au.scanImage': 'QR code from a picture…', 'au.camera': 'Scan with the camera', 'au.stopCamera': 'Stop camera', 'au.fromFile': 'From a file…',
      'au.pasteHint': 'You can also paste a screenshot of a QR code (Ctrl+V) or drop pictures and files onto the window.', 'au.noQr': 'No QR code found in “{0}”.',
      'au.cameraError': 'The camera cannot be used: {0}', 'au.cameraHint': 'Hold the QR code in front of the camera.', 'au.found': 'Found tokens',
      'au.none': 'No tokens found yet.', 'au.duplicate': 'already there', 'au.importOk': 'Import {0} tokens', 'au.imported': '{0} tokens imported. Save the database to keep them.',
      'au.clockLocal': 'Local clock', 'au.clockOffset': 'Offset {0}', 'au.clockStopped': 'Stopped', 'au.clockStart': 'Start the clock', 'au.clockStop': 'Stop the clock',
      'au.clockBack': 'Clock 30 seconds back', 'au.clockForward': 'Clock 30 seconds forward', 'au.clockReset': 'Back to the local clock', 'au.clockSettings': 'Set the clock',
      'au.clockHint': 'Codes are rejected when the clock of this device differs from the server’s. Set an offset to the local clock, or a fixed date and time (this stops the clock; ▶ lets it run from there).',
      'au.offsetLabel': 'Offset to the local clock (seconds)', 'au.timeLabel': 'Date and time', 'au.apply': 'Apply', 'au.set': 'Set', 'au.invalidValue': 'Invalid value.',
    },
    de: {
      'app.title': 'Authenticator',
      'au.tagline': 'Einmalpasswörter aus Ihrer KeePass-Datenbank – offline, im Browser.',
      'au.open': 'Datenbank öffnen', 'au.drop': 'Wählen Sie eine KeePass-Datenbank (.kdbx) oder ziehen Sie sie hierher – zusammen mit ihrer Schlüsseldatei, falls sie eine hat.',
      'au.chooseFile': 'Datenbank wählen…', 'au.noFile': 'Keine Datenbank gewählt', 'au.database': 'Datenbank', 'au.recent': 'Zuletzt geöffnet',
      'au.password': 'Passwort', 'au.showPassword': 'Passwort anzeigen', 'au.keyFile': 'Schlüsseldatei (optional)', 'au.chooseKeyFile': 'Schlüsseldatei wählen…', 'au.removeKeyFile': 'Schlüsseldatei entfernen',
      'au.unlock': 'Entsperren', 'au.unlocking': 'Entsperren…', 'au.create': 'Eine neue Datenbank anlegen', 'au.createTitle': 'Neue Datenbank', 'au.name': 'Name',
      'au.defaultName': 'Authenticator', 'au.repeat': 'Passwort wiederholen', 'au.weak': 'Kurze Passwörter sind leicht zu erraten; eine längere Passphrase ist sicherer.',
      'au.withKeyFile': 'Zusätzlich eine Schlüsseldatei anlegen', 'au.keyFileHint': 'Die Schlüsseldatei wird jetzt heruntergeladen. Bewahren Sie sie sicher auf – ohne sie lässt sich die Datenbank nicht öffnen.',
      'au.createButton': 'Datenbank anlegen', 'au.back': 'Zurück', 'au.mismatch': 'Die Passwörter stimmen nicht überein.', 'au.needCredentials': 'Bitte geben Sie ein Passwort ein oder legen Sie eine Schlüsseldatei an.',
      'au.save': 'Speichern', 'au.saveAs': 'Speichern unter', 'au.lock': 'Sperren', 'au.add': 'Hinzufügen', 'au.import': 'Importieren', 'au.exportAll': 'Alle exportieren',
      'au.search': 'Suchen', 'au.empty': 'Noch keine Tokens. Fügen Sie eines hinzu oder importieren Sie es aus einem QR-Code oder einem otpauth://-Link.', 'au.noMatch': 'Keine Tokens passen zur Suche.',
      'au.tokens': '{0} Tokens', 'au.copied': 'Code kopiert.', 'au.copyFailed': 'Der Code konnte nicht kopiert werden.', 'au.copyHint': 'Zum Kopieren klicken',
      'au.nextCounter': 'Nächster Code (Zähler +1)', 'au.edit': 'Bearbeiten', 'au.delete': 'Löschen', 'au.share': 'Exportieren / QR-Code', 'au.invalid': 'Ungültige OTP-Daten: {0}',
      'au.current': 'Aktueller Code', 'au.previous': 'Vorheriger Code', 'au.next': 'Nächster Code', 'au.prevShort': 'vorher', 'au.nextShort': 'nächster',
      'au.unsavedLock': 'Es gibt ungespeicherte Änderungen. Trotzdem sperren (die Änderungen gehen verloren)?', 'au.locked': 'Die Datenbank wurde nach {0} Minuten ohne Aktivität gesperrt.',
      'au.addTitle': 'Token hinzufügen', 'au.editTitle': 'Token bearbeiten', 'au.uri': 'Aus einem otpauth://-Link übernehmen', 'au.issuer': 'Aussteller', 'au.account': 'Konto',
      'au.tokenName': 'Name (Titel des Eintrags)', 'au.secret': 'Geheimer Schlüssel (Base32)', 'au.random': 'Einen zufälligen Schlüssel erzeugen', 'au.advanced': 'Erweiterte Einstellungen',
      'au.type': 'Typ', 'au.totp': 'TOTP (zeitbasiert)', 'au.hotp': 'HOTP (zählerbasiert)', 'au.steam': 'Steam', 'au.algorithm': 'Algorithmus', 'au.digits': 'Stellen',
      'au.period': 'Intervall (Sekunden)', 'au.counter': 'Zähler', 'au.group': 'Gruppe', 'au.preview': 'Aktueller Code', 'au.required': 'Bitte geben Sie einen Namen und einen geheimen Schlüssel ein.',
      'au.cancel': 'Abbrechen', 'au.close': 'Schließen', 'au.ok': 'Speichern',
      'au.deleteTitle': 'Token löschen', 'au.deleteQuestion': '„{0}“ löschen?',
      'au.lockout': 'Stellen Sie sicher, dass die Zwei-Faktor-Anmeldung für dieses Konto abgeschaltet ist oder Sie sich anders anmelden können – sonst sperren Sie sich womöglich aus.',
      'au.entryHasMore': 'Dieser KeePass-Eintrag enthält auch andere Daten (z. B. ein Passwort).', 'au.removeOtp': 'Nur das Token entfernen', 'au.removeEntry': 'Den ganzen Eintrag löschen',
      'au.recycle': 'Der Eintrag wird in den Papierkorb der Datenbank verschoben.', 'au.deleteOk': 'Löschen',
      'au.shareTitle': 'Token exportieren: {0}', 'au.shareWarning': 'Wer diesen QR-Code oder Link sieht, kann Ihre Codes erzeugen. Geben Sie ihn nicht weiter.',
      'au.reveal': 'QR-Code und Link anzeigen', 'au.copyLink': 'Link kopieren', 'au.linkCopied': 'Link kopiert.',
      'au.exportTitle': 'Alle Tokens exportieren', 'au.exportWarning': 'Der Export ist NICHT verschlüsselt: Wer ihn hat, kann Ihre Codes erzeugen. Löschen Sie ihn nach Gebrauch.',
      'au.exportCount': '{0} Tokens werden exportiert.', 'au.exportText': 'Die otpauth://-Links herunterladen (Textdatei)', 'au.exportQr': 'QR-Codes anzeigen',
      'au.importTitle': 'Tokens importieren', 'au.importText': 'otpauth://- oder otpauth-migration://-Links (einer je Zeile), Aegis-JSON (unverschlüsselt)',
      'au.scanImage': 'QR-Code aus einem Bild…', 'au.camera': 'Mit der Kamera scannen', 'au.stopCamera': 'Kamera beenden', 'au.fromFile': 'Aus einer Datei…',
      'au.pasteHint': 'Sie können auch ein Bildschirmfoto eines QR-Codes einfügen (Strg+V) oder Bilder und Dateien auf das Fenster ziehen.', 'au.noQr': 'In „{0}“ wurde kein QR-Code gefunden.',
      'au.cameraError': 'Die Kamera kann nicht verwendet werden: {0}', 'au.cameraHint': 'Halten Sie den QR-Code vor die Kamera.', 'au.found': 'Gefundene Tokens',
      'au.none': 'Noch keine Tokens gefunden.', 'au.duplicate': 'schon vorhanden', 'au.importOk': '{0} Tokens importieren', 'au.imported': '{0} Tokens importiert. Speichern Sie die Datenbank, um sie zu behalten.',
      'au.clockLocal': 'Lokale Uhr', 'au.clockOffset': 'Versatz {0}', 'au.clockStopped': 'Angehalten', 'au.clockStart': 'Die Uhr starten', 'au.clockStop': 'Die Uhr anhalten',
      'au.clockBack': 'Uhr 30 Sekunden zurück', 'au.clockForward': 'Uhr 30 Sekunden vor', 'au.clockReset': 'Zurück zur lokalen Uhr', 'au.clockSettings': 'Die Uhr stellen',
      'au.clockHint': 'Codes werden abgelehnt, wenn die Uhr dieses Geräts von der des Servers abweicht. Stellen Sie einen Versatz zur lokalen Uhr ein oder ein festes Datum mit Uhrzeit (die Uhr hält dabei an; ▶ lässt sie von dort weiterlaufen).',
      'au.offsetLabel': 'Versatz zur lokalen Uhr (Sekunden)', 'au.timeLabel': 'Datum und Uhrzeit', 'au.apply': 'Übernehmen', 'au.set': 'Setzen', 'au.invalidValue': 'Ungültiger Wert.',
    },
  });

  const state = {
    db: null, name: '', handle: null, dirty: false, isNew: false,
    file: null, keyFile: null, keyFileName: '', showPassword: false, busy: false, error: '', creating: false, recent: [],
    search: '', dialog: null, lastGroupId: null, clockPanel: null, // clockPanel: { offset, time, error }
  };

  let renderQueued = false;
  function render() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; Suite.shell.refresh(); });
  }
  const describe = (e) => Suite.i18n.describe(e);
  const db = () => state.db;

  function setDirty() {
    state.dirty = true;
    Suite.shell.setDirty(true);
    render();
  }

  // ---- tokens in the database --------------------------------------------------------------------

  const tokenSignature = (tk) => `${tk.type}|${tk.secret}`;

  /** All entries with OTP data outside the recycle bin, sorted by name: [{ id, entry, name, title, account, groupId, groupPath, token, error }]. */
  function items() {
    const out = [];
    for (const entry of db().entries()) {
      if (!Suite.otp.hasOtpData(entry)) continue;
      const title = db().field(entry, 'Title'), username = db().field(entry, 'UserName');
      const item = { id: entry.uuid.id, entry, title, username, groupId: entry.parentGroup.uuid.id, groupPath: db().groupPath(entry.parentGroup), token: null, error: null };
      try { item.token = Suite.otp.readToken(entry); } catch (e) { item.error = describe(e); }
      if (!item.token && !item.error) continue; // only settings, no secret
      item.account = (item.token && item.token.account) || username;
      item.name = title || (item.token && item.token.issuer) || item.account || '?';
      out.push(item);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  /** The token with issuer and account taken from the entry where the token has none (for exports). */
  const exportToken = (item) => ({ ...item.token, issuer: item.token.issuer || item.title, account: item.token.account || item.username });

  const findGroup = (id) => (db().groups().find((g) => g.id === id) || {}).group || db().root;
  const groupLabel = (g) => g.path || db().name || '/';

  function addToken(token, { name, groupId } = {}) {
    const entry = db().addEntry(findGroup(groupId), { Title: name || token.issuer || token.account, UserName: token.account || '' });
    Suite.otp.writeToken(entry, token);
    return entry;
  }

  function updateToken(entry, token, { name, groupId }) {
    entry.pushHistory();
    if (name !== undefined) entry.fields.set('Title', name);
    Suite.otp.writeToken(entry, token);
    entry.times.update();
    if (groupId && groupId !== entry.parentGroup.uuid.id) db().move(entry, findGroup(groupId));
  }

  function nextCounter(entry) {
    const token = Suite.otp.readToken(entry);
    if (!token || token.type !== 'hotp') return;
    token.counter += 1;
    entry.pushHistory();
    Suite.otp.writeToken(entry, token);
    entry.times.update();
    setDirty();
  }

  /** True if the entry holds more than the token (a password, URL, notes, attachments, other fields): deleting it would lose data. */
  function entryHasOtherData(entry) {
    if (['Password', 'URL', 'Notes'].some((k) => db().field(entry, k))) return true;
    if (entry.binaries.size > 0) return true;
    return [...entry.fields.keys()].some((k) => !['Title', 'UserName', 'Password', 'URL', 'Notes'].includes(k) && !Suite.otp.isOtpField(k));
  }

  function removeToken(entry) {
    entry.pushHistory();
    Suite.otp.removeTokenFields(entry);
    entry.times.update();
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea'); // (browsers that refuse the asynchronous clipboard)
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (ignored) { /* nothing */ }
      ta.remove();
      return ok;
    }
  }
  async function copyCode(code) {
    if (!code) return;
    if (await copyText(code)) Suite.shell.toast(t('au.copied'));
    else Suite.shell.toast(t('au.copyFailed'), 'error');
  }

  // ---- opening, creating, locking ----------------------------------------------------------------

  async function chooseDatabase() {
    try {
      const picked = await Suite.files.open({ types: KDBX_TYPES });
      if (picked) { state.file = picked[0]; state.error = ''; render(); }
    } catch (e) { state.error = describe(e); render(); }
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
      const opened = await Suite.kdbx.open(new Uint8Array(await state.file.file.arrayBuffer()), { password, keyFile: state.keyFile });
      showDatabase(opened, state.file.file.name, state.file.handle);
      if (state.file && state.file.handle) Suite.files.remember(APP, state.file.handle);
    } catch (e) {
      state.error = describe(e);
      requestAnimationFrame(() => { const el = document.querySelector('[data-testid=password]'); if (el) el.select(); });
    } finally {
      state.busy = false;
      render();
    }
  }

  function showDatabase(opened, name, handle) {
    Object.assign(state, { db: opened, name, handle, dirty: false, isNew: false, search: '', dialog: null, file: null, keyFile: null, keyFileName: '', creating: false, error: '', showPassword: false });
    Suite.shell.setDirty(false);
    Suite.shell.setFileName(name);
    resetAutoLock();
    render();
  }

  async function createDatabase({ name, password, repeat, withKeyFile }) {
    if (password !== repeat) { state.error = t('au.mismatch'); render(); return; }
    if (!password && !withKeyFile) { state.error = t('au.needCredentials'); render(); return; }
    state.busy = true;
    render();
    try {
      const dbName = name.trim() || t('au.defaultName');
      const created = await Suite.kdbx.create({ name: dbName, password, withKeyFile, generator: 'Portable Web App Suite' });
      const fileName = `${dbName.replace(/[\\/:*?"<>|]+/g, '_')}.kdbx`;
      if (created.keyFile) Suite.files.download(created.keyFile, fileName.replace(/\.kdbx$/, '.keyx'), 'application/xml');
      showDatabase(created.db, fileName, null);
      state.isNew = true;
      setDirty();
    } catch (e) { state.error = describe(e); } finally { state.busy = false; render(); }
  }

  async function lock(force = false) {
    if (!state.db) return;
    if (state.dirty && !force && !(await Suite.shell.confirm(t('au.unsavedLock')))) return;
    closeCamera();
    const file = state.handle ? { file: await state.handle.getFile().catch(() => null), handle: state.handle } : null;
    Object.assign(state, { db: null, dirty: false, dialog: null, clockPanel: null, search: '', file: file && file.file ? file : null });
    Suite.shell.setDirty(false);
    Suite.shell.setFileName('');
    render();
  }

  let lockTimer = null;
  function resetAutoLock() {
    clearTimeout(lockTimer);
    if (!state.db) return;
    lockTimer = setTimeout(async () => {
      if (!state.db || state.dirty) return; // never lose unsaved changes
      await lock(true);
      Suite.shell.toast(t('au.locked', AUTO_LOCK_MINUTES), 'warning');
    }, AUTO_LOCK_MINUTES * 60000);
  }
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) document.addEventListener(ev, resetAutoLock, { passive: true });

  async function save(as = false) {
    if (!state.db) return;
    try {
      const bytes = await state.db.save();
      const result = as || (state.isNew && !state.handle) ? await Suite.files.saveAs(bytes, { suggestedName: state.name, types: KDBX_TYPES })
        : await Suite.files.save({ name: state.name, handle: state.handle }, bytes);
      if (!result) return;
      if (result.mode === 'downloaded') Suite.shell.banner(result.message); else Suite.shell.toast(result.message);
      if (result.handle) { state.handle = result.handle; Suite.files.remember(APP, result.handle); }
      state.name = result.name;
      state.isNew = false;
      state.dirty = false;
      Suite.shell.setDirty(false);
      Suite.shell.setFileName(state.name);
      render();
    } catch (e) { Suite.shell.toast(describe(e), 'error'); }
  }

  // ---- the codes tick with the (adjustable) clock ----------------------------------------------------

  let tickTimer = null;
  function tick() {
    clearTimeout(tickTimer);
    if (state.db) render();
    tickTimer = setTimeout(tick, 1000 - (clock.now() % 1000) + 5);
  }
  clock.subscribe(tick);
  tick();

  // ---- dialogs ---------------------------------------------------------------------------------------

  function openEdit(item) {
    const src = (item && item.token) || {};
    state.dialog = {
      type: 'edit', id: item ? item.id : null, nameTouched: !!item, uri: '', uriError: '', error: '',
      form: {
        name: item ? item.name : '', issuer: src.issuer || '', account: item ? item.account || '' : '', secret: src.secret || '',
        type: src.type || 'totp', algorithm: src.algorithm || 'SHA1', digits: String(src.digits || 6), period: String(src.period || 30),
        counter: String(src.counter || 0), groupId: item ? item.groupId : state.lastGroupId || db().root.uuid.id,
      },
    };
    render();
  }

  function editPreview(f) {
    try {
      const token = Suite.otp.createToken(f);
      return { token, code: Suite.otp.formatCode(Suite.otp.generate(token, clock.now()).code), error: '' };
    } catch (e) { return { token: null, code: '', error: describe(e) }; }
  }

  function saveEdit() {
    const d = state.dialog;
    const f = d.form;
    if (!f.name.trim() || !f.secret.trim()) { d.error = t('au.required'); render(); return; }
    const { token, error } = editPreview(f);
    if (!token) { d.error = error; render(); return; }
    const entry = d.id && db().findEntry(d.id);
    if (entry) updateToken(entry, token, { name: f.name.trim(), groupId: f.groupId });
    else { addToken(token, { name: f.name.trim(), groupId: f.groupId }); state.lastGroupId = f.groupId; }
    state.dialog = null;
    setDirty();
  }

  function GroupSelect({ value, onChange }) {
    return html`<label>${t('au.group')}
      <select data-testid="group" onChange=${(e) => onChange(e.target.value)}>
        ${db().groups().map((g) => html`<option value=${g.id} selected=${g.id === value}>${groupLabel(g)}</option>`)}
      </select></label>`;
  }

  function EditDialog() {
    const d = state.dialog;
    const f = d.form;
    const set = (key) => (e) => {
      f[key] = e.target.value;
      if (key === 'issuer' && !d.nameTouched) f.name = e.target.value;
      if (key === 'name') d.nameTouched = true;
      d.error = '';
      render();
    };
    const fromUri = (e) => {
      d.uri = e.target.value;
      if (!d.uri.trim()) { d.uriError = ''; render(); return; }
      try {
        const tk = Suite.otp.parseUri(d.uri);
        Object.assign(f, { issuer: tk.issuer, account: tk.account, secret: tk.secret, type: tk.type, algorithm: tk.algorithm, digits: String(tk.digits), period: String(tk.period), counter: String(tk.counter) });
        if (!d.nameTouched) f.name = tk.issuer || tk.account;
        d.uriError = '';
      } catch (ex) { d.uriError = describe(ex); }
      render();
    };
    const preview = editPreview(f);
    return html`<dialog open data-testid="edit-dialog"><article class="au-dialog">
      <header><strong>${t(d.id ? 'au.editTitle' : 'au.addTitle')}</strong></header>
      <form id="au-edit" onSubmit=${(e) => { e.preventDefault(); saveEdit(); }}>
        ${d.id ? null : html`<label>${t('au.uri')}
          <input value=${d.uri} onInput=${fromUri} placeholder="otpauth://totp/…" autocomplete="off" spellcheck="false" data-no-symbols data-testid="edit-uri" aria-invalid=${d.uriError ? 'true' : null} />
          ${d.uriError ? html`<small>${d.uriError}</small>` : null}</label>`}
        <div class="au-grid">
          <label>${t('au.issuer')}<input value=${f.issuer} onInput=${set('issuer')} data-testid="edit-issuer" /></label>
          <label>${t('au.account')}<input value=${f.account} onInput=${set('account')} data-testid="edit-account" /></label>
        </div>
        <label>${t('au.tokenName')}<input value=${f.name} onInput=${set('name')} required data-testid="edit-name" /></label>
        <label>${t('au.secret')}
          <div class="au-secret">
            <input value=${f.secret} onInput=${set('secret')} required spellcheck="false" autocomplete="off" data-no-symbols class="au-mono" data-testid="edit-secret" aria-invalid=${f.secret && preview.error ? 'true' : null} />
            <button type="button" class="secondary outline" title=${t('au.random')} aria-label=${t('au.random')} data-testid="edit-random" onClick=${() => { f.secret = Suite.otp.randomSecret(); render(); }}>${Suite.icon('dices')}</button>
          </div>
          ${f.secret && preview.error ? html`<small>${preview.error}</small>` : null}
        </label>
        <details open=${!!d.id && (f.type !== 'totp' || f.algorithm !== 'SHA1' || f.digits !== '6' || f.period !== '30')}>
          <summary>${t('au.advanced')}</summary>
          <div class="au-grid">
            <label>${t('au.type')}<select onChange=${set('type')} data-testid="edit-type">
              ${[['totp', 'au.totp'], ['hotp', 'au.hotp'], ['steam', 'au.steam']].map(([v, k]) => html`<option value=${v} selected=${f.type === v}>${t(k)}</option>`)}</select></label>
            <label>${t('au.algorithm')}<select onChange=${set('algorithm')} disabled=${f.type === 'steam'} data-testid="edit-algorithm">
              ${Suite.otp.ALGORITHMS.map((a) => html`<option value=${a} selected=${f.algorithm === a}>${a}</option>`)}</select></label>
            <label>${t('au.digits')}<input type="number" min="4" max="10" value=${f.type === 'steam' ? 5 : f.digits} onInput=${set('digits')} disabled=${f.type === 'steam'} data-testid="edit-digits" /></label>
            ${f.type === 'hotp'
              ? html`<label>${t('au.counter')}<input type="number" min="0" value=${f.counter} onInput=${set('counter')} data-testid="edit-counter" /></label>`
              : html`<label>${t('au.period')}<input type="number" min="1" value=${f.period} onInput=${set('period')} data-testid="edit-period" /></label>`}
          </div>
          <${GroupSelect} value=${f.groupId} onChange=${(v) => { f.groupId = v; render(); }} />
        </details>
        <p>${t('au.preview')}: <strong class="au-mono" data-testid="edit-preview">${preview.code || '—'}</strong></p>
        ${d.error ? html`<p class="au-error" role="alert" data-testid="edit-error">${d.error}</p>` : null}
      </form>
      <footer>
        <button type="button" class="secondary" onClick=${closeDialog}>${t('au.cancel')}</button>
        <button type="submit" form="au-edit" data-testid="edit-save">${t('au.ok')}</button>
      </footer>
    </article></dialog>`;
  }

  function DeleteDialog() {
    const d = state.dialog;
    const entry = db().findEntry(d.id);
    if (!entry) return null;
    const name = db().field(entry, 'Title') || '?';
    const hasMore = entryHasOtherData(entry);
    const done = (fn) => { fn(); state.dialog = null; setDirty(); };
    return html`<dialog open data-testid="delete-dialog"><article class="au-dialog">
      <header><strong>${t('au.deleteTitle')}</strong></header>
      <p>${t('au.deleteQuestion', name)}</p>
      <p class="au-warning">${Suite.icon('triangle-alert')} ${t('au.lockout')}</p>
      ${hasMore ? html`<p>${t('au.entryHasMore')}</p>` : null}
      ${db().db.meta.recycleBinEnabled ? html`<p><small>${t('au.recycle')}</small></p>` : null}
      <footer>
        <button type="button" class="secondary" onClick=${closeDialog}>${t('au.cancel')}</button>
        ${hasMore
          ? html`<button type="button" class="secondary" data-testid="delete-entry" onClick=${() => done(() => db().deleteEntry(entry))}>${t('au.removeEntry')}</button>
            <button type="button" class="au-danger" data-testid="delete-token" onClick=${() => done(() => removeToken(entry))}>${t('au.removeOtp')}</button>`
          : html`<button type="button" class="au-danger" data-testid="delete-confirm" onClick=${() => done(() => db().deleteEntry(entry))}>${t('au.deleteOk')}</button>`}
      </footer>
    </article></dialog>`;
  }

  const qrCache = new Map();
  function QrCode({ text }) {
    if (!qrCache.has(text)) { if (qrCache.size > 200) qrCache.clear(); qrCache.set(text, Suite.qr.toSvg(text)); }
    return html`<div class="au-qr" data-testid="qr" dangerouslySetInnerHTML=${{ __html: qrCache.get(text) }}></div>`;
  }

  function ShareDialog() {
    const d = state.dialog;
    const item = items().find((i) => i.id === d.id);
    if (!item || !item.token) return null;
    const uri = Suite.otp.toUri(exportToken(item));
    return html`<dialog open data-testid="share-dialog"><article class="au-dialog">
      <header><strong>${t('au.shareTitle', item.name)}</strong></header>
      <p class="au-warning">${Suite.icon('triangle-alert')} ${t('au.shareWarning')}</p>
      ${d.revealed
        ? html`<${QrCode} text=${uri} /><textarea readonly rows="3" class="au-mono" data-testid="share-uri" onFocus=${(e) => e.target.select()}>${uri}</textarea>`
        : html`<button type="button" class="secondary" data-testid="share-reveal" onClick=${() => { d.revealed = true; render(); }}>${t('au.reveal')}</button>`}
      <footer>
        ${d.revealed ? html`<button type="button" class="secondary" data-testid="share-copy" onClick=${async () => { if (await copyText(uri)) Suite.shell.toast(t('au.linkCopied')); }}>${t('au.copyLink')}</button>` : null}
        <button type="button" onClick=${closeDialog}>${t('au.close')}</button>
      </footer>
    </article></dialog>`;
  }

  function exportList() {
    return items().filter((i) => i.token).map((i) => ({ name: i.name, account: i.account, uri: Suite.otp.toUri(exportToken(i)) }));
  }

  function ExportDialog() {
    const d = state.dialog;
    const uris = exportList();
    const download = () => Suite.files.download(`${uris.map((u) => u.uri).join('\n')}\n`, `${(db().name || 'authenticator').replace(/[\\/:*?"<>|]+/g, '_')}-otpauth-export.txt`, 'text/plain');
    return html`<dialog open data-testid="export-dialog"><article class="au-dialog wide">
      <header><strong>${t('au.exportTitle')}</strong></header>
      <p class="au-warning">${Suite.icon('triangle-alert')} ${t('au.exportWarning')}</p>
      <p>${t('au.exportCount', uris.length)}</p>
      <div class="au-actions">
        <button type="button" class="secondary" data-testid="export-text" disabled=${!uris.length} onClick=${download}>${Suite.icon('download')} ${t('au.exportText')}</button>
        <button type="button" class="secondary outline" data-testid="export-qr" aria-pressed=${!!d.showQr} disabled=${!uris.length} onClick=${() => { d.showQr = !d.showQr; render(); }}>${Suite.icon('qr-code')} ${t('au.exportQr')}</button>
      </div>
      ${d.showQr ? html`<div class="au-qr-grid">${uris.map((u) => html`<figure><${QrCode} text=${u.uri} /><figcaption><strong>${u.name}</strong><br /><small>${u.account}</small></figcaption></figure>`)}</div>` : null}
      <footer><button type="button" onClick=${closeDialog}>${t('au.close')}</button></footer>
    </article></dialog>`;
  }

  // ---- import ------------------------------------------------------------------------------------------

  function openImport({ text = '', images = [], files = [] } = {}) {
    state.dialog = { type: 'import', text, fileTokens: [], messages: [], toggled: new Set(), groupId: state.lastGroupId || db().root.uuid.id, camera: false, cameraError: '' };
    render();
    if (images.length) scanImages(images);
    if (files.length) readImportFiles(files);
  }

  const importDialog = () => (state.dialog && state.dialog.type === 'import' ? state.dialog : null);

  function appendText(s) {
    const d = importDialog();
    if (!d) return;
    d.text = (d.text.trim() ? d.text.replace(/\s*$/, '\n') : '') + s;
    render();
  }

  async function scanImages(files) {
    const notes = [];
    for (const file of files) {
      let text = null;
      try { text = await Suite.qr.decodeImage(file); } catch (e) { text = null; }
      if (text) appendText(text); else notes.push(t('au.noQr', file.name || 'image'));
    }
    const d = importDialog();
    if (d) { d.messages = notes; render(); }
  }

  async function readImportFiles(files) {
    const notes = [], tokens = [], images = [];
    for (const file of files) {
      if (/^image\//.test(file.type) || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name)) { images.push(file); continue; }
      const result = Suite.otp.parseImportText(await file.text());
      tokens.push(...result.tokens);
      notes.push(...result.errors.map((m) => `${file.name}: ${m}`));
    }
    const d = importDialog();
    if (!d) return;
    d.fileTokens.push(...tokens);
    d.messages = notes;
    render();
    if (images.length) await scanImages(images);
  }

  /** The tokens found in the text and the files, each once; tokens that are already in the database are marked. */
  function importCandidates(d) {
    const parsed = Suite.otp.parseImportText(d.text);
    const existing = new Set(items().filter((i) => i.token).map((i) => tokenSignature(i.token)));
    const seen = new Set(), list = [];
    for (const tk of [...parsed.tokens, ...d.fileTokens]) {
      const sig = tokenSignature(tk);
      if (seen.has(sig)) continue;
      seen.add(sig);
      list.push({ token: tk, sig, duplicate: existing.has(sig) });
    }
    return { list, errors: parsed.errors };
  }
  // new tokens are ticked, duplicates are not; a click turns the default round
  const isChecked = (d, c) => c.duplicate === d.toggled.has(c.sig);

  function doImport() {
    const d = importDialog();
    const chosen = importCandidates(d).list.filter((c) => isChecked(d, c));
    for (const c of chosen) addToken(c.token, { groupId: d.groupId });
    state.lastGroupId = d.groupId;
    closeDialog();
    setDirty();
    Suite.shell.toast(t('au.imported', chosen.length));
  }

  let stopCamera = null;
  function closeCamera() { if (stopCamera) { stopCamera(); stopCamera = null; } }

  async function startCamera(video) {
    const d = importDialog();
    try {
      stopCamera = await Suite.qr.startCamera(video, (text) => appendText(text));
    } catch (e) {
      if (d) { d.camera = false; d.cameraError = t('au.cameraError', e.message || e.name); render(); }
    }
  }

  async function pickImages() {
    const picked = await Suite.files.open({ types: IMAGE_TYPES, multiple: true });
    if (picked) scanImages(picked.map((p) => p.file));
  }

  async function pickImportFiles() {
    const picked = await Suite.files.open({ types: IMPORT_TYPES, multiple: true });
    if (picked) readImportFiles(picked.map((p) => p.file));
  }

  function ImportDialog() {
    const d = state.dialog;
    const { list, errors } = importCandidates(d);
    const chosen = list.filter((c) => isChecked(d, c));
    const allErrors = [...errors, ...d.messages];
    const toggle = (sig) => { if (d.toggled.has(sig)) d.toggled.delete(sig); else d.toggled.add(sig); render(); };
    return html`<dialog open data-testid="import-dialog"><article class="au-dialog wide">
      <header><strong>${t('au.importTitle')}</strong></header>
      <label>${t('au.importText')}
        <textarea rows="4" class="au-mono" value=${d.text} spellcheck="false" data-no-symbols data-testid="import-text"
          placeholder="otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example" onInput=${(e) => { d.text = e.target.value; render(); }}></textarea></label>
      <div class="au-actions">
        <button type="button" class="secondary outline" data-testid="import-image" onClick=${pickImages}>${Suite.icon('image')} ${t('au.scanImage')}</button>
        ${Suite.qr.cameraAvailable ? html`<button type="button" class="secondary outline" data-testid="import-camera" onClick=${() => { if (d.camera) { closeCamera(); d.camera = false; } else { d.camera = true; d.cameraError = ''; } render(); }}>${Suite.icon('camera')} ${t(d.camera ? 'au.stopCamera' : 'au.camera')}</button>` : null}
        <button type="button" class="secondary outline" data-testid="import-file" onClick=${pickImportFiles}>${Suite.icon('file')} ${t('au.fromFile')}</button>
      </div>
      <p><small>${t('au.pasteHint')}</small></p>
      ${d.camera ? html`<div class="au-camera"><video muted playsinline data-testid="camera-video" ref=${(el) => { if (el && !el.dataset.started) { el.dataset.started = '1'; startCamera(el); } }}></video><small>${t('au.cameraHint')}</small></div>` : null}
      ${d.cameraError ? html`<p class="au-error">${d.cameraError}</p>` : null}
      ${allErrors.length ? html`<ul class="au-error" data-testid="import-errors">${allErrors.map((m) => html`<li>${m}</li>`)}</ul>` : null}
      <h4>${t('au.found')}</h4>
      ${list.length
        ? html`<table class="au-candidates" data-testid="import-candidates"><tbody>${list.map((c) => html`<tr>
            <td><input type="checkbox" checked=${isChecked(d, c)} onChange=${() => toggle(c.sig)} data-testid="import-check" aria-label=${c.token.issuer || c.token.account} /></td>
            <td><strong>${c.token.issuer || c.token.account}</strong>${c.token.issuer && c.token.account ? html`<br /><small>${c.token.account}</small>` : null}</td>
            <td><small>${c.token.type.toUpperCase()}${c.duplicate ? html` · <mark>${t('au.duplicate')}</mark>` : null}</small></td>
          </tr>`)}</tbody></table>`
        : html`<p class="au-muted">${t('au.none')}</p>`}
      <${GroupSelect} value=${d.groupId} onChange=${(v) => { d.groupId = v; render(); }} />
      <footer>
        <button type="button" class="secondary" onClick=${closeDialog}>${t('au.cancel')}</button>
        <button type="button" data-testid="import-submit" disabled=${!chosen.length} onClick=${doImport}>${t('au.importOk', chosen.length)}</button>
      </footer>
    </article></dialog>`;
  }

  function closeDialog() { closeCamera(); state.dialog = null; render(); }

  function Dialog() {
    const d = state.dialog;
    if (!d || !state.db) return null;
    if (d.type === 'edit') return html`<${EditDialog} />`;
    if (d.type === 'delete') return html`<${DeleteDialog} />`;
    if (d.type === 'share') return html`<${ShareDialog} />`;
    if (d.type === 'export') return html`<${ExportDialog} />`;
    if (d.type === 'import') return html`<${ImportDialog} />`;
    return null;
  }

  // ---- UI: lock screen ------------------------------------------------------------------------------

  function LockScreen() {
    if (state.creating) {
      return html`<article class="au-card" data-testid="create-form">
        <h2>${t('au.createTitle')}</h2>
        <form onSubmit=${(e) => { e.preventDefault(); const f = e.target.elements; createDatabase({ name: f.name.value, password: f.password.value, repeat: f.repeat.value, withKeyFile: f.keyfile.checked }); }}>
          <label>${t('au.name')}<input name="name" data-testid="create-name" defaultValue=${t('au.defaultName')} /></label>
          <label>${t('au.password')}<input name="password" type="password" data-testid="create-password" autocomplete="new-password"
            onInput=${(e) => { const hint = e.target.parentElement.querySelector('small'); if (hint) hint.hidden = !e.target.value || e.target.value.length >= 10; }} />
            <small hidden>${t('au.weak')}</small></label>
          <label>${t('au.repeat')}<input name="repeat" type="password" data-testid="create-repeat" autocomplete="new-password" /></label>
          <label><input type="checkbox" role="switch" name="keyfile" data-testid="create-keyfile" /> ${t('au.withKeyFile')}</label>
          <p><small>${t('au.keyFileHint')}</small></p>
          ${state.error ? html`<p class="au-error" role="alert" data-testid="error">${state.error}</p>` : null}
          <div class="au-buttons">
            <button type="button" class="secondary" onClick=${() => { state.creating = false; state.error = ''; render(); }}>${t('au.back')}</button>
            <button type="submit" data-testid="create-submit" aria-busy=${state.busy}>${t('au.createButton')}</button>
          </div>
        </form>
      </article>`;
    }
    return html`<article class="au-card" data-testid="unlock-form">
      <hgroup><h2>${Suite.icon('shield')} ${t('au.open')}</h2><p>${t('au.tagline')}</p></hgroup>
      <form onSubmit=${(e) => { e.preventDefault(); unlock(e.target.elements.password.value); }}>
        <p><small>${t('au.drop')}</small></p>
        <div class="au-file">
          <button type="button" class="secondary" data-testid="choose-db" onClick=${chooseDatabase}>${t('au.chooseFile')}</button>
          <span data-testid="db-name">${state.file ? state.file.file.name : t('au.noFile')}</span>
        </div>
        ${state.recent.length ? html`<label>${t('au.recent')}<select data-testid="recent" onChange=${async (e) => { const r = state.recent[+e.target.value]; e.target.value = ''; const picked = r && await Suite.files.reopen(r.handle); if (picked) { state.file = picked; render(); } }}>
          <option value=""></option>${state.recent.map((r, i) => html`<option value=${i}>${r.name}</option>`)}</select></label>` : null}
        <label>${t('au.password')}
          <div class="au-secret">
            <input name="password" type=${state.showPassword ? 'text' : 'password'} data-testid="password" autocomplete="current-password" />
            <button type="button" class="secondary outline" aria-pressed=${state.showPassword} title=${t('au.showPassword')} aria-label=${t('au.showPassword')} onClick=${() => { state.showPassword = !state.showPassword; render(); }}>${Suite.icon('eye')}</button>
          </div></label>
        <label>${t('au.keyFile')}</label>
        <div class="au-file">
          <button type="button" class="secondary outline" data-testid="choose-keyfile" onClick=${chooseKeyFile}>${t('au.chooseKeyFile')}</button>
          <span data-testid="keyfile-name">${state.keyFile ? state.keyFileName : ''}</span>
          ${state.keyFile ? html`<button type="button" class="secondary outline" title=${t('au.removeKeyFile')} aria-label=${t('au.removeKeyFile')} onClick=${() => { state.keyFile = null; render(); }}>×</button>` : null}
        </div>
        ${state.error ? html`<p class="au-error" role="alert" data-testid="error">${state.error}</p>` : null}
        <button type="submit" data-testid="unlock" disabled=${!state.file || state.busy} aria-busy=${state.busy}>${state.busy ? t('au.unlocking') : t('au.unlock')}</button>
      </form>
      <p><a href="#" data-testid="create" onClick=${(e) => { e.preventDefault(); state.creating = true; state.error = ''; render(); }}>${t('au.create')}</a></p>
    </article>`;
  }

  // ---- UI: clock -------------------------------------------------------------------------------------

  const pad2 = (n) => String(n).padStart(2, '0');
  const toLocalInput = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; };
  function formatOffset(ms) {
    const total = Math.round(Math.abs(ms) / 1000);
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    const parts = [];
    if (h) parts.push(`${h} h`);
    if (m) parts.push(`${m} min`);
    if (s || !parts.length) parts.push(`${s} s`);
    return (ms < 0 ? '−' : '+') + parts.join(' ');
  }

  function ClockBar() {
    const now = clock.now();
    const offsetMs = Math.round(clock.offset / 1000) * 1000;
    const status = !clock.running ? t('au.clockStopped') : offsetMs ? t('au.clockOffset', formatOffset(offsetMs)) : t('au.clockLocal');
    const p = state.clockPanel;
    const toggle = () => { state.clockPanel = p ? null : { offset: String(offsetMs / 1000), time: toLocalInput(now), error: '' }; render(); };
    const applyOffset = (e) => {
      e.preventDefault();
      const seconds = Number(p.offset);
      if (p.offset.trim() === '' || !Number.isFinite(seconds)) { p.error = t('au.invalidValue'); render(); return; }
      p.error = '';
      clock.setOffset(Math.round(seconds * 1000));
    };
    const applyTime = (e) => {
      e.preventDefault();
      const ms = new Date(p.time).getTime(); // (datetime-local: local time)
      if (!Number.isFinite(ms)) { p.error = t('au.invalidValue'); render(); return; }
      p.error = '';
      clock.setTime(ms);
    };
    const time = new Date(now).toLocaleString(Suite.i18n.language === 'de' ? 'de-AT' : 'en-GB', { dateStyle: 'medium', timeStyle: 'medium' });
    return html`<section class=${`au-clock${clock.isDefault ? '' : ' adjusted'}`} data-testid="clock">
      <div class="au-clock-main">
        <span class="au-clock-time">${Suite.icon('clock')} <time data-testid="clock-time" datetime=${new Date(now).toISOString()}>${time}</time></span>
        <span class="au-clock-status" data-testid="clock-status">${status}</span>
        <span class="au-clock-buttons">
          <button type="button" class="au-icon" data-testid="clock-back" title=${t('au.clockBack')} aria-label=${t('au.clockBack')} onClick=${() => clock.shift(-30000)}>−30 s</button>
          <button type="button" class="au-icon" data-testid="clock-toggle" title=${t(clock.running ? 'au.clockStop' : 'au.clockStart')} aria-label=${t(clock.running ? 'au.clockStop' : 'au.clockStart')} onClick=${() => (clock.running ? clock.stop() : clock.start())}>${clock.running ? Suite.icon('pause') : Suite.icon('play')}</button>
          <button type="button" class="au-icon" data-testid="clock-forward" title=${t('au.clockForward')} aria-label=${t('au.clockForward')} onClick=${() => clock.shift(30000)}>+30 s</button>
          <button type="button" class="au-icon" data-testid="clock-reset" title=${t('au.clockReset')} aria-label=${t('au.clockReset')} disabled=${clock.isDefault} onClick=${() => clock.reset()}>${Suite.icon('rotate-ccw')}</button>
          <button type="button" class="au-icon" data-testid="clock-settings" title=${t('au.clockSettings')} aria-label=${t('au.clockSettings')} aria-expanded=${!!p} onClick=${toggle}>${Suite.icon('settings')}</button>
        </span>
      </div>
      ${p ? html`<div class="au-clock-panel">
        <p><small>${t('au.clockHint')}</small></p>
        <div class="au-clock-forms">
          <form onSubmit=${applyOffset}><label>${t('au.offsetLabel')}
            <div class="au-secret"><input type="number" step="1" value=${p.offset} data-testid="clock-offset" onInput=${(e) => { p.offset = e.target.value; }} />
              <button type="submit" class="secondary" data-testid="clock-offset-apply">${t('au.apply')}</button></div></label></form>
          <form onSubmit=${applyTime}><label>${t('au.timeLabel')}
            <div class="au-secret"><input type="datetime-local" step="1" value=${p.time} data-testid="clock-datetime" onInput=${(e) => { p.time = e.target.value; }} />
              <button type="submit" class="secondary" data-testid="clock-datetime-set">${t('au.set')}</button></div></label></form>
        </div>
        ${p.error ? html`<p class="au-error">${p.error}</p>` : null}
      </div>` : null}
    </section>`;
  }

  // ---- UI: tokens ---------------------------------------------------------------------------------------

  function TokenCard({ item, now }) {
    const tk = item.token;
    let gen = null, error = item.error;
    if (tk && !error) { try { gen = Suite.otp.generate(tk, now); } catch (e) { error = describe(e); } }
    const step = tk && tk.type !== 'hotp' ? Math.floor(now / 1000 / tk.period) : 0;
    const urgent = gen && gen.remaining !== null && gen.remaining <= 5;
    const fmt = Suite.otp.formatCode;
    return html`<article class="au-token" data-testid="token" data-id=${item.id}>
      <div class="au-token-head">
        <div class="au-token-title">
          <strong data-testid="token-name">${item.name}</strong>
          ${item.account ? html`<small data-testid="token-account">${item.account}</small>` : null}
        </div>
        <div class="au-token-actions">
          ${tk ? html`<button type="button" class="au-icon" data-testid="share" title=${t('au.share')} aria-label=${t('au.share')} onClick=${() => { state.dialog = { type: 'share', id: item.id, revealed: false }; render(); }}>${Suite.icon('qr-code')}</button>` : null}
          <button type="button" class="au-icon" data-testid="edit" title=${t('au.edit')} aria-label=${t('au.edit')} onClick=${() => openEdit(item)}>${Suite.icon('pencil')}</button>
          <button type="button" class="au-icon" data-testid="delete" title=${t('au.delete')} aria-label=${t('au.delete')} onClick=${() => { state.dialog = { type: 'delete', id: item.id }; render(); }}>${Suite.icon('trash-2')}</button>
        </div>
      </div>
      ${error ? html`<p class="au-error" data-testid="token-error">${t('au.invalid', error)}</p>`
        : tk.type === 'hotp' ? html`<div class="au-hotp">
            <button type="button" class="au-code" data-testid="code" data-code=${gen.code} title=${t('au.copyHint')} onClick=${() => copyCode(gen.code)}>${fmt(gen.code)}</button>
            <button type="button" class="secondary outline" data-testid="next-counter" title=${t('au.nextCounter')} aria-label=${t('au.nextCounter')} onClick=${() => nextCounter(item.entry)}>${Suite.icon('rotate-cw')} ${tk.counter}</button>
          </div>`
        : html`<div class=${`au-codes${gen.code.length > 6 ? ' long' : ''}`}>
            <button type="button" class="au-side" data-testid="code-prev" data-code=${gen.previous || ''} disabled=${!gen.previous} title=${`${t('au.previous')} – ${t('au.copyHint')}`} onClick=${() => copyCode(gen.previous)}>
              <small>${t('au.prevShort')}</small>${gen.previous ? fmt(gen.previous) : '—'}</button>
            <button type="button" class=${`au-code${urgent ? ' urgent' : ''}`} data-testid="code" data-code=${gen.code} aria-current="true" title=${`${t('au.current')} – ${t('au.copyHint')}`} onClick=${() => copyCode(gen.code)}>${fmt(gen.code)}</button>
            <button type="button" class="au-side" data-testid="code-next" data-code=${gen.next} title=${`${t('au.next')} – ${t('au.copyHint')}`} onClick=${() => copyCode(gen.next)}>
              <small>${t('au.nextShort')}</small>${fmt(gen.next)}</button>
          </div>
          <div class="au-timer-row">
            <div class="au-timer"><div key=${step} class="au-timer-bar" style=${{ width: `${Math.max(0, 100 - gen.progress * 100)}%`, transitionDuration: clock.running ? '1s' : '0s' }}></div></div>
            <span class="au-remaining" data-testid="remaining">${gen.remaining} s</span>
          </div>`}
      ${item.groupPath ? html`<small class="au-group">${item.groupPath}</small>` : null}
    </article>`;
  }

  function Tokens() {
    const now = clock.now();
    const all = items();
    const q = state.search.trim().toLowerCase();
    const visible = q ? all.filter((i) => [i.name, i.account, i.groupPath, i.token && i.token.issuer].some((s) => s && s.toLowerCase().includes(q))) : all;
    return html`<div class="au-main" data-testid="workspace">
      <${ClockBar} />
      <div class="au-search">
        <input type="search" placeholder=${t('au.search')} aria-label=${t('au.search')} value=${state.search} data-testid="search" onInput=${(e) => { state.search = e.target.value; render(); }} />
      </div>
      ${!all.length ? html`<p class="au-empty" data-testid="empty">${t('au.empty')}</p>`
        : !visible.length ? html`<p class="au-empty">${t('au.noMatch')}</p>`
        : html`<section class="au-tokens">${visible.map((item) => html`<${TokenCard} key=${item.id} item=${item} now=${now} />`)}</section>`}
      <p class="au-count"><small>${t('au.tokens', all.length)} · KDBX ${db().version}</small></p>
      <${Dialog} />
    </div>`;
  }

  function Toolbar() {
    if (!state.db) return null;
    return html`<nav class="au-toolbar" role="toolbar">
      <button type="button" class=${state.dirty ? '' : 'secondary'} data-testid="save" title="${t('au.save')} (Ctrl+S)" onClick=${() => save(false)}>${Suite.icon('save')} ${t('au.save')}</button>
      <button type="button" class="secondary outline" data-testid="save-as" title="${t('au.saveAs')} (Ctrl+Shift+S)" onClick=${() => save(true)}>${t('au.saveAs')}</button>
      <button type="button" class="secondary" data-testid="add" onClick=${() => openEdit(null)}>+ ${t('au.add')}</button>
      <button type="button" class="secondary outline" data-testid="import" onClick=${() => openImport()}>${Suite.icon('download')} ${t('au.import')}</button>
      <button type="button" class="secondary outline" data-testid="export-all" onClick=${() => { state.dialog = { type: 'export', showQr: false }; render(); }}>${Suite.icon('upload')} ${t('au.exportAll')}</button>
      <button type="button" class="secondary outline" data-testid="lock" title="${t('au.lock')} (Ctrl+L)" onClick=${() => lock(false)}>${Suite.icon('lock')} ${t('au.lock')}</button>
    </nav>`;
  }

  function Main() {
    if (!state.db) return html`<div class="au-center"><${LockScreen} /></div>`;
    return html`<${Tokens} />`;
  }

  Suite.shell.mount({ id: APP, title: 'app.title', version: '%%BUILD_VERSION%%', toolbar: () => html`<${Toolbar} />`, main: () => html`<${Main} />` });

  // ---- files, clipboard, keys ------------------------------------------------------------------------------

  Suite.files.dropZone(document.body, (picked) => {
    if (!picked.length) return;
    if (!state.db) {
      const kdbx = picked.find((p) => /\.kdbx$/i.test(p.file.name)) || picked[0];
      state.file = kdbx;
      state.error = '';
      const key = picked.find((p) => p !== kdbx);
      if (key) key.file.arrayBuffer().then((b) => { state.keyFile = new Uint8Array(b); state.keyFileName = key.file.name; render(); });
      render();
      return;
    }
    const files = picked.map((p) => p.file);
    if (importDialog()) readImportFiles(files);
    else if (!state.dialog) openImport({ files });
  });

  // paste an otpauth:// link or a screenshot of a QR code to import it
  document.addEventListener('paste', (e) => {
    if (!state.db || !e.clipboardData) return;
    const images = [...e.clipboardData.items].filter((i) => i.kind === 'file' && /^image\//.test(i.type)).map((i) => i.getAsFile());
    if (importDialog()) {
      if (images.length) { e.preventDefault(); scanImages(images); }
      return; // (text goes into the text field)
    }
    if (state.dialog || /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName)) return;
    const text = e.clipboardData.getData('text/plain');
    if (images.length) openImport({ images });
    else if (/otpauth(-migration)?:\/\//i.test(text)) openImport({ text: text.trim() });
    else return;
    e.preventDefault();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.dialog) { e.preventDefault(); closeDialog(); return; }
    if (!(e.ctrlKey || e.metaKey) || !state.db) return;
    const k = e.key.toLowerCase();
    if (k === 's') { e.preventDefault(); save(e.shiftKey); }
    if (k === 'f' && !state.dialog) { e.preventDefault(); const el = document.querySelector('[data-testid=search]'); if (el) el.focus(); }
    if (k === 'l') { e.preventDefault(); lock(false); }
  });

  window.addEventListener('beforeunload', (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });

  Suite.files.recent(APP).then((r) => { state.recent = r; render(); });
  Suite.bridge.receive((picked) => { if (!state.db) { state.file = picked; state.error = ''; render(); } }, { app: APP }); // "Open with…" from other apps
  Suite.openFiles.register(async () => (state.db ? [{ name: state.name || 'authenticator.kdbx', bytes: new Uint8Array(await state.db.save()), dirty: state.dirty }] : []));

  // for tests
  AUTH.app = { state, items, clock, save, lock, resetAutoLock, AUTO_LOCK_MINUTES };
  document.body.dataset.ready = 'true';
})(window.AUTH = window.AUTH || {});
