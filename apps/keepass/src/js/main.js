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
      'kp.tagsShort': 'Tags', 'kp.historyChanged': '{0} changed afterwards', 'kp.historyNoChange': 'no difference to the next version', 'kp.historyDiffers': 'Highlighted: different from the current entry.',
      'kp.historyDelete': 'Delete this version', 'kp.historyClear': 'Delete the whole history', 'kp.historyClearConfirm': 'Delete all {0} older versions of this entry?',
      'kp.historyMax': 'Older versions kept per entry', 'kp.historyMaxHint': 'When saving, older versions beyond this number are removed (−1: keep all).',
      'kp.otpSetup': 'Set up one-time password…', 'kp.otpEdit': 'One-time password', 'kp.otpUri': 'Paste an otpauth:// link', 'kp.otpSecret': 'Secret key (Base32)', 'kp.otpRandom': 'New random secret',
      'kp.otpType': 'Type', 'kp.otpIssuer': 'Service', 'kp.otpAccount': 'Account', 'kp.otpAlgorithm': 'Algorithm', 'kp.otpDigits': 'Digits', 'kp.otpPeriod': 'Period (s)', 'kp.otpCounter': 'Counter',
      'kp.otpHint': 'Stored like KeePassXC (field “otp”) and KeePass 2 (TimeOtp-/HmacOtp- fields), so other KeePass apps show the same codes.', 'kp.otpSave': 'Save',
      'kp.otpSaved': 'One-time password saved. Save the database to keep it.', 'kp.otpInvalid': 'The one-time password data cannot be read: {0}', 'kp.otpNext': 'Next code',
      'kp.otpNextHint': 'Copies the code and moves the counter on (HOTP)', 'kp.otpRemove': 'Remove the one-time password', 'kp.otpRemoveConfirm': 'Remove the one-time password of this entry?',
      'kp.qrScan': 'Scan QR code', 'kp.qrStop': 'Stop camera', 'kp.qrFromImage': 'QR code from a picture…', 'kp.qrImage': 'Pictures', 'kp.qrNone': 'No QR code was found in the picture.',
      'kp.qrNotOtp': 'The QR code is not a one-time password (otpauth://).', 'kp.qrCamera': 'The camera cannot be used: {0}', 'kp.qrMore': 'The code contains {0} more accounts.',
      'kp.qrMoreAdd': 'Add them as new entries', 'kp.qrMoreAdded': '{0} entries with one-time passwords were added.', 'kp.qrShowTitle': 'Transfer to another device',
      'kp.qrWarning': 'Whoever sees or photographs this QR code can create your codes. Show it only to scan it into your own authenticator app, and not while someone is watching or the screen is shared.',
      'kp.qrReveal': 'Show QR code',
      'kp.csv': 'CSV', 'kp.csvImport': 'Import CSV…', 'kp.csvExport': 'Export CSV…', 'kp.csvImportTitle': 'Import a CSV file', 'kp.csvEntries': '{0} entries found in “{1}”.',
      'kp.csvColumns': 'Columns', 'kp.csvIgnored': 'ignored', 'kp.csvCustom': 'additional field', 'kp.csvGroupField': 'group', 'kp.csvTags': 'tags', 'kp.csvTarget': 'Import into the new group',
      'kp.csvImportOk': 'Import', 'kp.csvDeleteHint': 'The CSV file contains your passwords unencrypted. Delete it (and empty the trash) after the import.',
      'kp.csvImported': '{0} entries were imported into the group “{1}”. Save to keep them. Then delete the CSV file.', 'kp.csvEmpty': 'The file contains no entries.',
      'kp.csvExportTitle': 'Export as CSV', 'kp.csvWarning': 'A CSV file is NOT encrypted: everyone who gets the file can read all passwords. Only export when you need it (for example to move to another program), keep the file on your own device and delete it afterwards.',
      'kp.csvScopeAll': 'The whole database ({0} entries)', 'kp.csvScopeGroup': 'Only the group “{0}” with its subgroups ({1} entries)', 'kp.csvExportOk': 'Export unencrypted',
      'kp.csvExported': '{0} entries exported. Delete the CSV file as soon as you no longer need it.',
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
      'kp.tagsShort': 'Tags', 'kp.historyChanged': 'danach geändert: {0}', 'kp.historyNoChange': 'kein Unterschied zur nächsten Version', 'kp.historyDiffers': 'Hervorgehoben: anders als im aktuellen Eintrag.',
      'kp.historyDelete': 'Diese Version löschen', 'kp.historyClear': 'Ganzen Verlauf löschen', 'kp.historyClearConfirm': 'Alle {0} älteren Versionen dieses Eintrags löschen?',
      'kp.historyMax': 'Ältere Versionen je Eintrag', 'kp.historyMaxHint': 'Beim Speichern werden ältere Versionen über diese Anzahl hinaus entfernt (−1: alle behalten).',
      'kp.otpSetup': 'Einmalpasswort einrichten…', 'kp.otpEdit': 'Einmalpasswort', 'kp.otpUri': 'Einen otpauth://-Link einfügen', 'kp.otpSecret': 'Geheimer Schlüssel (Base32)', 'kp.otpRandom': 'Neuer zufälliger Schlüssel',
      'kp.otpType': 'Art', 'kp.otpIssuer': 'Dienst', 'kp.otpAccount': 'Konto', 'kp.otpAlgorithm': 'Algorithmus', 'kp.otpDigits': 'Stellen', 'kp.otpPeriod': 'Intervall (s)', 'kp.otpCounter': 'Zähler',
      'kp.otpHint': 'Gespeichert wie in KeePassXC (Feld „otp“) und KeePass 2 (TimeOtp-/HmacOtp-Felder), damit andere KeePass-Apps dieselben Codes zeigen.', 'kp.otpSave': 'Speichern',
      'kp.otpSaved': 'Einmalpasswort gespeichert. Speichern Sie die Datenbank, um es zu behalten.', 'kp.otpInvalid': 'Die Daten des Einmalpassworts sind nicht lesbar: {0}', 'kp.otpNext': 'Nächster Code',
      'kp.otpNextHint': 'Kopiert den Code und zählt weiter (HOTP)', 'kp.otpRemove': 'Einmalpasswort entfernen', 'kp.otpRemoveConfirm': 'Das Einmalpasswort dieses Eintrags entfernen?',
      'kp.qrScan': 'QR-Code scannen', 'kp.qrStop': 'Kamera beenden', 'kp.qrFromImage': 'QR-Code aus einem Bild…', 'kp.qrImage': 'Bilder', 'kp.qrNone': 'Im Bild wurde kein QR-Code gefunden.',
      'kp.qrNotOtp': 'Der QR-Code ist kein Einmalpasswort (otpauth://).', 'kp.qrCamera': 'Die Kamera kann nicht verwendet werden: {0}', 'kp.qrMore': 'Der Code enthält {0} weitere Konten.',
      'kp.qrMoreAdd': 'Als neue Einträge hinzufügen', 'kp.qrMoreAdded': '{0} Einträge mit Einmalpasswörtern wurden hinzugefügt.', 'kp.qrShowTitle': 'Auf ein anderes Gerät übertragen',
      'kp.qrWarning': 'Wer diesen QR-Code sieht oder fotografiert, kann Ihre Codes erzeugen. Zeigen Sie ihn nur, um ihn in Ihre eigene Authenticator-App zu scannen, und nicht, während jemand zusieht oder der Bildschirm geteilt wird.',
      'kp.qrReveal': 'QR-Code anzeigen',
      'kp.csv': 'CSV', 'kp.csvImport': 'CSV importieren…', 'kp.csvExport': 'CSV exportieren…', 'kp.csvImportTitle': 'Eine CSV-Datei importieren', 'kp.csvEntries': '{0} Einträge in „{1}“ gefunden.',
      'kp.csvColumns': 'Spalten', 'kp.csvIgnored': 'ignoriert', 'kp.csvCustom': 'weiteres Feld', 'kp.csvGroupField': 'Gruppe', 'kp.csvTags': 'Tags', 'kp.csvTarget': 'In die neue Gruppe importieren',
      'kp.csvImportOk': 'Importieren', 'kp.csvDeleteHint': 'Die CSV-Datei enthält Ihre Passwörter unverschlüsselt. Löschen Sie sie nach dem Import (und leeren Sie den Papierkorb).',
      'kp.csvImported': '{0} Einträge wurden in die Gruppe „{1}“ importiert. Speichern Sie, um sie zu behalten. Löschen Sie danach die CSV-Datei.', 'kp.csvEmpty': 'Die Datei enthält keine Einträge.',
      'kp.csvExportTitle': 'Als CSV exportieren', 'kp.csvWarning': 'Eine CSV-Datei ist NICHT verschlüsselt: Wer die Datei bekommt, kann alle Passwörter lesen. Exportieren Sie nur, wenn Sie es brauchen (etwa für den Umzug in ein anderes Programm), behalten Sie die Datei auf Ihrem eigenen Gerät und löschen Sie sie danach.',
      'kp.csvScopeAll': 'Die ganze Datenbank ({0} Einträge)', 'kp.csvScopeGroup': 'Nur die Gruppe „{0}“ mit ihren Untergruppen ({1} Einträge)', 'kp.csvExportOk': 'Unverschlüsselt exportieren',
      'kp.csvExported': '{0} Einträge exportiert. Löschen Sie die CSV-Datei, sobald Sie sie nicht mehr brauchen.',
      'kp.reportSummary': '{0} Einträge geprüft · {1} mit Problemen', 'kp.reportHint': 'Schwach: weniger als 60 Bit geschätzte Stärke. Alt: seit mehr als einem Jahr unverändert. Einträge im Papierkorb werden nicht geprüft.',
    },
  });

  const state = {
    db: null, name: '', handle: null, dirty: false,
    file: null, keyFile: null, busy: false, error: '', creating: false, recent: [],
    groupId: null, entryId: null, search: '', pane: 'entries', // pane: groups | entries | entry (phones)
    reveal: new Set(), historyPushed: null, generatorFor: null, gen: { length: 20, lower: true, upper: true, digits: true, symbols: true, excludeAmbiguous: false }, genValue: '',
    settingsOpen: false, renamingGroup: null, merge: null, report: false, csv: null, historyOpen: null, otpEdit: null, otpQr: null,
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
    closeCamera();
    Object.assign(state, { otpEdit: null, otpQr: null, csv: null });
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
    state.historyOpen = null;
    state.historyExpanded = false;
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

  // ---- one-time passwords (Suite.otp: TOTP, HOTP, Steam; KeePassXC "otp" field and KeePass TimeOtp-*/HmacOtp-* fields) ---------

  /** { token } or { error } or null (no OTP data). */
  function otpOf(entry) {
    if (!Suite.otp.hasOtpData(entry)) return null;
    try { const token = Suite.otp.readToken(entry); return token ? { token } : null; } catch (e) { return { error: Suite.i18n.describe(e) }; }
  }

  /** Change the OTP fields of an entry (the previous version goes to the history once per editing session). */
  function changeOtp(entry, token) {
    if (state.historyPushed !== entry.uuid.id) { entry.pushHistory(); state.historyPushed = entry.uuid.id; }
    if (token) Suite.otp.writeToken(entry, token); else Suite.otp.removeTokenFields(entry);
    entry.times.update();
    setDirty();
  }

  /** HOTP: use the current code and move on to the next one (the counter is saved in the entry). */
  function nextHotp(entry, token) {
    copy(Suite.otp.generate(token).code, t('kp.otp'));
    changeOtp(entry, { ...token, counter: token.counter + 1 });
  }

  function editOtp(entry) {
    const found = otpOf(entry);
    const f = db().fields(entry);
    const token = found && found.token;
    state.otpEdit = {
      entryId: entry.uuid.id, error: '', isNew: !token,
      form: token ? { ...token, counter: String(token.counter), digits: String(token.digits), period: String(token.period) }
        : { type: 'totp', secret: '', algorithm: 'SHA1', digits: '6', period: '30', counter: '0', issuer: f.Title || '', account: f.UserName || '' },
    };
    render();
  }

  function saveOtp() {
    const d = state.otpEdit;
    const entry = d && db().findEntry(d.entryId);
    if (!entry) { state.otpEdit = null; render(); return; }
    try {
      const token = Suite.otp.createToken(d.form);
      closeCamera();
      state.otpEdit = null;
      changeOtp(entry, token);
      Suite.shell.toast(t('kp.otpSaved'));
    } catch (e) { d.error = Suite.i18n.describe(e); render(); }
  }

  function OtpDialog() {
    const d = state.otpEdit;
    if (!d) return null;
    const f = d.form;
    const set = (key) => (e) => { f[key] = e.target.value; d.error = ''; render(); };
    const fromUri = (text) => {
      try { const tk = Suite.otp.parseUri(text); Object.assign(f, { ...tk, counter: String(tk.counter), digits: String(tk.digits), period: String(tk.period) }); d.error = ''; } catch (e) { d.error = Suite.i18n.describe(e); }
      render();
    };
    const close = () => { closeCamera(); state.otpEdit = null; render(); };
    return html`<dialog open data-testid="otp-dialog"><article class="kp-otp-dialog">
      <header><strong>${t(d.isNew ? 'kp.otpSetup' : 'kp.otpEdit')}</strong></header>
      <label>${t('kp.otpUri')}<input data-testid="otp-uri" placeholder="otpauth://totp/…?secret=…" autocomplete="off" spellcheck="false"
        onChange=${(e) => { if (e.target.value.trim()) fromUri(e.target.value); e.target.value = ''; }} /></label>
      <div class="kp-buttons kp-scan">
        ${Suite.qr.cameraAvailable ? html`<button type="button" class="secondary outline" data-testid="qr-camera" onClick=${() => { if (d.scanning) { closeCamera(); d.scanning = false; } else { d.scanning = true; d.error = ''; } render(); }}>${Suite.icon('camera')} ${t(d.scanning ? 'kp.qrStop' : 'kp.qrScan')}</button>` : null}
        <button type="button" class="secondary outline" data-testid="qr-image" onClick=${scanImage}>${Suite.icon('image')} ${t('kp.qrFromImage')}</button>
      </div>
      ${d.scanning ? html`<video class="kp-camera" data-testid="qr-video" ref=${(el) => { if (el && !el.dataset.started) { el.dataset.started = '1'; scanCamera(el); } }}></video>` : null}
      ${d.more && d.more.length ? html`<p class="kp-more" data-testid="qr-more">${t('kp.qrMore', d.more.length)} <button type="button" class="secondary outline" data-testid="qr-more-add" onClick=${importMore}>${t('kp.qrMoreAdd')}</button></p>` : null}
      <hr />
      <label>${t('kp.otpSecret')}<div class="kp-secret"><input data-testid="otp-secret" value=${f.secret} autocomplete="off" spellcheck="false" data-no-symbols onInput=${set('secret')} />
        <button type="button" class="secondary outline" title=${t('kp.otpRandom')} data-testid="otp-random" onClick=${() => { f.secret = Suite.otp.randomSecret(); render(); }}>${Suite.icon('dices')}</button></div></label>
      <div class="kp-grid">
        <label>${t('kp.otpType')}<select data-testid="otp-type" onChange=${set('type')}>${[['totp', 'TOTP'], ['hotp', 'HOTP'], ['steam', 'Steam']].map(([v, l]) => html`<option value=${v} selected=${f.type === v}>${l}</option>`)}</select></label>
        <label>${t('kp.otpIssuer')}<input data-testid="otp-issuer" value=${f.issuer} onInput=${set('issuer')} /></label>
        <label>${t('kp.otpAccount')}<input data-testid="otp-account" value=${f.account} onInput=${set('account')} /></label>
        ${f.type !== 'steam' ? html`<label>${t('kp.otpAlgorithm')}<select data-testid="otp-algorithm" onChange=${set('algorithm')}>${Suite.otp.ALGORITHMS.map((a) => html`<option value=${a} selected=${f.algorithm === a}>${a}</option>`)}</select></label>
          <label>${t('kp.otpDigits')}<input type="number" min="4" max="10" data-testid="otp-digits" value=${f.digits} onInput=${set('digits')} /></label>` : null}
        ${f.type === 'hotp' ? html`<label>${t('kp.otpCounter')}<input type="number" min="0" data-testid="otp-counter" value=${f.counter} onInput=${set('counter')} /></label>`
          : html`<label>${t('kp.otpPeriod')}<input type="number" min="1" data-testid="otp-period" value=${f.period} onInput=${set('period')} /></label>`}
      </div>
      <p><small>${t('kp.otpHint')}</small></p>
      ${d.error ? html`<p class="kp-error" data-testid="otp-error">${d.error}</p>` : null}
      <footer><button type="button" class="secondary" onClick=${close}>${t('kp.close')}</button>
        <button type="button" data-testid="otp-save" onClick=${saveOtp}>${t('kp.otpSave')}</button></footer>
    </article></dialog>`;
  }

  // ---- QR codes: scan an otpauth:// code into an entry, show an entry's secret as a QR code -----------------------------------

  let stopCamera = null;
  function closeCamera() { if (stopCamera) { stopCamera(); stopCamera = null; } }

  /** A scanned text: otpauth:// fills the dialog; a Google Authenticator export with several accounts can become new entries. */
  async function useScanned(text) {
    const d = state.otpEdit;
    if (!d) return;
    closeCamera();
    d.scanning = false;
    let tokens = [];
    try {
      if (/^otpauth-migration:/i.test(text)) tokens = Suite.otp.parseMigrationUri(text);
      else if (/^otpauth:/i.test(text)) tokens = [Suite.otp.parseUri(text)];
      else throw new Suite.LocalizedError('kp.qrNotOtp');
    } catch (e) { d.error = Suite.i18n.describe(e); render(); return; }
    const [first, ...more] = tokens;
    if (!first) { d.error = t('kp.qrNotOtp'); render(); return; }
    Object.assign(d.form, { ...first, counter: String(first.counter), digits: String(first.digits), period: String(first.period) });
    d.error = '';
    d.more = more;
    render();
  }

  /** The other accounts of a Google Authenticator export as new entries next to the edited one. */
  function importMore() {
    const d = state.otpEdit;
    const entry = d && db().findEntry(d.entryId);
    if (!entry || !d.more || !d.more.length) return;
    for (const token of d.more) {
      const e = db().addEntry(entry.parentGroup, { Title: token.issuer || token.account || t('kp.untitled'), UserName: token.account, Password: '', URL: '', Notes: '' });
      Suite.otp.writeToken(e, token);
    }
    Suite.shell.toast(t('kp.qrMoreAdded', d.more.length));
    d.more = [];
    setDirty();
  }

  async function scanImage() {
    const d = state.otpEdit;
    try {
      const picked = await Suite.files.open({ types: [{ description: t('kp.qrImage'), accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'] } }] });
      if (!picked) return;
      const text = await Suite.qr.decodeImage(picked[0].file);
      if (!text) { d.error = t('kp.qrNone'); render(); return; }
      await useScanned(text);
    } catch (e) { d.error = Suite.i18n.describe(e); render(); }
  }

  async function scanCamera(video) {
    const d = state.otpEdit;
    try { stopCamera = await Suite.qr.startCamera(video, (text) => useScanned(text)); } catch (e) { d.scanning = false; d.error = t('kp.qrCamera', Suite.i18n.describe(e)); render(); }
  }

  function QrDialog() {
    const q = state.otpQr;
    if (!q) return null;
    const entry = db().findEntry(q.entryId);
    const found = entry && otpOf(entry);
    if (!found || !found.token) return null;
    const uri = Suite.otp.toUri(found.token);
    const close = () => { state.otpQr = null; render(); };
    return html`<dialog open data-testid="qr-dialog"><article class="kp-qr-dialog">
      <header><strong>${t('kp.qrShowTitle')}</strong></header>
      <p class="kp-warning"><small>${Suite.icon('triangle-alert')} ${t('kp.qrWarning')}</small></p>
      ${q.shown ? html`<div class="kp-qr" data-testid="qr-code" dangerouslySetInnerHTML=${{ __html: Suite.qr.toSvg(uri) }}></div>
          <p class="kp-qr-secret"><small>${found.token.issuer || ''} ${found.token.account ? `(${found.token.account})` : ''}</small><br /><code data-testid="qr-secret">${found.token.secret.replace(/(.{4})/g, '$1 ').trim()}</code></p>`
        : html`<button type="button" data-testid="qr-reveal" onClick=${() => { q.shown = true; render(); }}>${t('kp.qrReveal')}</button>`}
      <footer><button type="button" class="secondary" data-testid="qr-close" onClick=${close}>${t('kp.close')}</button></footer>
    </article></dialog>`;
  }

  function OtpSection({ entry }) {
    const found = otpOf(entry);
    if (!found) return html`<div class="kp-row kp-otp" data-testid="otp"><button type="button" class="secondary outline" data-testid="otp-setup" onClick=${() => editOtp(entry)}>${Suite.icon('key-round')} ${t('kp.otpSetup')}</button></div>`;
    if (found.error) return html`<div class="kp-otp" data-testid="otp"><span class="kp-error" data-testid="otp-invalid">${t('kp.otpInvalid', found.error)}</span>
      <button type="button" class="secondary outline" data-testid="otp-edit" title=${Suite.t('common.edit')} onClick=${() => editOtp(entry)}>${t('kp.otpEdit')}</button></div>`;
    const token = found.token;
    const g = Suite.otp.generate(token);
    return html`<div class="kp-otp" data-testid="otp"><span>${t('kp.otp')}${token.type === 'hotp' ? ' (HOTP)' : token.type === 'steam' ? ' (Steam)' : ''}:</span>
      <code data-testid="otp-code">${Suite.otp.formatCode(g.code)}</code>
      ${g.remaining != null ? html`<progress max=${token.period} value=${token.period - g.remaining} title=${`${g.remaining} s`}></progress><small data-testid="otp-remaining">${g.remaining} s</small>` : null}
      <button type="button" class="secondary outline" title=${t('kp.copy')} data-testid="otp-copy" onClick=${() => copy(g.code, t('kp.otp'))}>${Suite.icon('copy')}</button>
      ${token.type === 'hotp' ? html`<button type="button" class="secondary outline" data-testid="otp-next" title=${t('kp.otpNextHint')} onClick=${() => nextHotp(entry, token)}>${t('kp.otpNext')}</button>` : null}
      <button type="button" class="secondary outline" data-testid="otp-qr" title=${t('kp.qrShowTitle')} onClick=${() => { state.otpQr = { entryId: entry.uuid.id, shown: false }; render(); }}>${Suite.icon('qr-code')} QR</button>
      <button type="button" class="secondary outline" data-testid="otp-edit" onClick=${() => editOtp(entry)}>${Suite.icon('pencil')}</button>
      <button type="button" class="secondary outline" data-testid="otp-remove" title=${t('kp.otpRemove')} onClick=${async () => { if (await Suite.shell.confirm(t('kp.otpRemoveConfirm'))) changeOtp(entry, null); }}>×</button>
    </div>`;
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
              onDblClick=${() => { if (group !== db().root && !bin) { state.renamingGroup = group.uuid.id; render(); } }}>${bin ? Suite.icon('trash-2') : Suite.icon('folder')}${group.name || '—'}</a>`}
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
      <input type=${shown ? 'text' : 'password'} data-testid=${testid} value=${value} autocomplete="off" spellcheck="false" data-no-symbols
             onInput=${(e) => updateEntry(entry, { [field]: e.target.value }, { protect: field === 'Password' ? [] : [field] })} />
      <button type="button" class="secondary outline" title=${shown ? t('kp.hide') : t('kp.show')} data-testid=${`${testid}-reveal`}
              onClick=${() => { if (shown) state.reveal.delete(field); else state.reveal.add(field); render(); }}>${shown ? Suite.icon('eye-off') : Suite.icon('eye')}</button>
      <button type="button" class="secondary outline" title=${t('kp.copy')} data-testid=${`${testid}-copy`} onClick=${() => copy(db().field(entry, field), field === 'Password' ? t('kp.password') : field)}>${Suite.icon('copy')}</button>
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
        <button type="button" class="secondary" title=${Suite.t('common.regenerate')} onClick=${regenerate}>${Suite.icon('rotate-cw')}</button>
        <button type="button" class="secondary outline" onClick=${() => { state.generatorFor = null; render(); }}>${t('kp.close')}</button>
        <button type="button" data-testid="gen-use" onClick=${() => { updateEntry(entry, { Password: state.genValue }); state.generatorFor = null; render(); }}>${t('kp.use')}</button>
      </div>
    </div>`;
  }

  function EntryEditor() {
    const entry = currentEntry();
    if (!entry) return html`<section class="kp-editor kp-placeholder"></section>`;
    const f = db().fields(entry);
    const custom = Object.keys(f).filter((k) => !STANDARD.includes(k) && !Suite.otp.isOtpField(k));
    const field = (key, label, extra = {}) => html`<label>${t(label)}<input data-testid=${`field-${key}`} value=${f[key] || ''} ...${extra}
      onInput=${(e) => updateEntry(entry, { [key]: e.target.value })} /></label>`;
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
        <button type="button" class="secondary outline" data-testid="field-UserName-copy" title=${Suite.t('common.copy')} onClick=${() => copy(db().field(entry, 'UserName'), t('kp.userName'))}>${Suite.icon('copy')}</button></div></label>
      <label>${t('kp.password')}<${SecretInput} entry=${entry} field="Password" testid="field-Password" /></label>
      <div class="kp-row">
        <button type="button" class="secondary outline" data-testid="generate" onClick=${() => { state.generatorFor = entry.uuid.id; state.genValue = ''; render(); }}>${Suite.icon('dices')} ${t('kp.generate')}</button>
        <small>${t('kp.strength', KP.entropy(f.Password || ''))}</small>
      </div>
      ${state.generatorFor === entry.uuid.id ? html`<${Generator} entry=${entry} />` : null}
      <label>${t('kp.url')}<div class="kp-secret"><input data-testid="field-URL" value=${f.URL || ''} inputmode="url" onInput=${(e) => updateEntry(entry, { URL: e.target.value })} />
        <a role="button" class="secondary outline" href=${/^https?:\/\//i.test(f.URL || '') ? f.URL : '#'} target="_blank" rel="noopener noreferrer">${t('kp.openUrl')}</a></div></label>
      <${OtpSection} entry=${entry} />
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
              onChange=${(e) => updateEntry(entry, { [key]: db().field(entry, key) }, { protect: e.target.checked ? [key] : [] })} /> ${Suite.icon('lock')}</label>
            <button type="button" class="secondary outline" data-testid=${`custom-${key}-delete`} onClick=${() => updateEntry(entry, { [key]: null })}>×</button>
          </div>`;
        })}
        <form class="kp-custom-row" onSubmit=${(e) => { e.preventDefault(); const name = e.target.elements.name.value.trim(); if (!name || STANDARD.includes(name)) return; updateEntry(entry, { [name]: e.target.elements.value.value }, { protect: e.target.elements.protect.checked ? [name] : [] }); e.target.reset(); }}>
          <input name="name" data-testid="new-field-name" placeholder=${t('kp.fieldName')} />
          <input name="value" data-testid="new-field-value" placeholder=${t('kp.fieldValue')} />
          <label><input type="checkbox" name="protect" data-testid="new-field-protected" /> ${Suite.icon('lock')}</label>
          <button type="submit" class="secondary" data-testid="add-field">${t('kp.addField')}</button>
        </form>
      </fieldset>
      <fieldset class="kp-attachments" data-testid="attachments">
        <legend>${t('kp.attachments')}</legend>
        <ul>${[...entry.binaries.keys()].map((name) => html`<li data-testid="attachment">
          <a href="#" onClick=${(e) => { e.preventDefault(); Suite.files.download(db().attachment(entry, name), name); }}>${name}</a>
          <button type="button" class="secondary outline" title=${t('bridge.openWith')} aria-label=${t('bridge.openWith')} data-testid="attachment-open-with" onClick=${() => openAttachmentWith(entry, name)}>${Suite.icon('external-link')}</button>
          <button type="button" class="secondary outline" data-testid="remove-attachment" onClick=${() => { db().removeAttachment(entry, name); setDirty(); }}>×</button></li>`)}</ul>
        <label class="kp-file-button" role="button">${t('kp.addAttachment')}<input type="file" multiple hidden data-testid="add-attachment" onChange=${(e) => { addAttachments(entry, [...e.target.files]); e.target.value = ''; }} /></label>
      </fieldset>
      <label>${t('kp.group')}<select data-testid="entry-group" onChange=${(e) => { const g = db().groups().find((x) => x.id === e.target.value); if (g) { db().move(entry, g.group); state.groupId = g.id; setDirty(); } }}>
        ${db().groups().map((g) => html`<option value=${g.id} selected=${g.id === entry.parentGroup.uuid.id}>${g.path || db().name}</option>`)}</select></label>
      ${history.length ? html`<${HistoryPanel} entry=${entry} />` : null}
      <button type="button" class="secondary kp-delete" data-testid="delete-entry" onClick=${() => deleteEntry(entry)}>${t('kp.deleteEntry')}</button>
    </section>`;
  }

  // ---- CSV import and export ---------------------------------------------------------------------

  const CSV_TYPES = [{ description: 'CSV', accept: { 'text/csv': ['.csv', '.txt'] } }];
  const today = () => new Date().toISOString().slice(0, 10);
  const isoTime = (d) => (d ? new Date(d).toISOString().replace(/\.\d{3}Z$/, 'Z') : '');

  function decodeText(bytes) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { return new TextDecoder('windows-1252').decode(bytes); }
  }

  async function chooseCsv() {
    try {
      const picked = await Suite.files.open({ types: CSV_TYPES });
      if (!picked) return;
      const file = picked[0].file;
      const parsed = KP.csv.records(KP.csv.parse(decodeText(new Uint8Array(await file.arrayBuffer()))));
      if (!parsed.records.length) { Suite.shell.toast(t('kp.csvEmpty'), 'warning'); return; }
      state.csv = { kind: 'import', name: file.name, ...parsed, group: `CSV ${file.name.replace(/\.[^.]+$/, '')} ${today()}` };
      render();
    } catch (e) { Suite.shell.toast(Suite.i18n.describe(e), 'error'); }
  }

  /** Put the records into a new group below the root; groups of the CSV become subgroups. */
  function importCsv(c) {
    const target = db().createGroup(db().root, c.group || `CSV ${today()}`);
    // a path prefix shared by all records that names the exported root ("Root/…", KeePassXC) is dropped
    const firsts = new Set(c.records.map((r) => r.group.split('/')[0]));
    const prefix = firsts.size === 1 && [...firsts][0] && c.records.every((r) => r.group) && (c.records.some((r) => !r.group.includes('/')) || /^(root|passwords|database)$/i.test([...firsts][0]) || [...firsts][0] === db().root.name)
      ? [...firsts][0] : null;
    for (const r of c.records) {
      let path = r.group;
      if (prefix) path = path.split('/').slice(1).join('/');
      let group = target;
      for (const name of path.split('/').map((x) => x.trim()).filter(Boolean)) group = group.groups.find((g) => g.name === name) || db().createGroup(group, name);
      const values = { ...r.fields };
      if (r.otp) values.otp = r.otp;
      const entry = db().addEntry(group, values, { protect: r.otp ? ['otp'] : [] });
      if (r.tags.length) entry.tags = r.tags;
    }
    state.csv = null;
    state.groupId = target.uuid.id;
    state.search = '';
    selectEntry(null);
    setDirty();
    Suite.shell.toast(t('kp.csvImported', c.records.length, target.name));
  }

  async function exportCsv(scope) {
    const group = scope === 'group' ? currentGroup() : db().root;
    const entries = db().entries(group);
    const rootName = db().root.name || 'Root';
    const rows = [KP.csv.EXPORT_HEADER];
    for (const e of entries) {
      const f = db().fields(e);
      const path = db().groupPath(e.parentGroup);
      rows.push([path ? `${rootName}/${path}` : rootName, f.Title, f.UserName, f.Password, f.URL, f.Notes, f.otp || '', (e.tags || []).join(','), isoTime(e.times.lastModTime), isoTime(e.times.creationTime)]);
    }
    state.csv = null;
    render();
    try {
      const bytes = new TextEncoder().encode(KP.csv.stringify(rows));
      const result = await Suite.files.saveAs(bytes, { suggestedName: `${state.name.replace(/\.kdbx$/i, '') || 'passwords'}.csv`, types: CSV_TYPES, type: 'text/csv' });
      if (!result) return;
      report(result);
      Suite.shell.toast(t('kp.csvExported', entries.length), 'warning');
    } catch (e) { Suite.shell.toast(Suite.i18n.describe(e), 'error'); }
  }

  function CsvDialog() {
    const c = state.csv;
    if (!c) return null;
    const close = () => { state.csv = null; render(); };
    if (c.kind === 'export') {
      const group = currentGroup();
      return html`<dialog open data-testid="csv-export-dialog"><article>
        <header><strong>${t('kp.csvExportTitle')}</strong></header>
        <p class="kp-warning" data-testid="csv-warning">${Suite.icon('triangle-alert')} ${t('kp.csvWarning')}</p>
        <label><input type="radio" name="scope" checked=${c.scope === 'all'} data-testid="csv-scope-all" onChange=${() => { c.scope = 'all'; render(); }} /> ${t('kp.csvScopeAll', db().entries().length)}</label>
        ${group !== db().root && !inBin(group) ? html`<label><input type="radio" name="scope" checked=${c.scope === 'group'} data-testid="csv-scope-group" onChange=${() => { c.scope = 'group'; render(); }} /> ${t('kp.csvScopeGroup', group.name, db().entries(group).length)}</label>` : null}
        <footer><button type="button" class="secondary" onClick=${close}>${t('kp.close')}</button>
          <button type="button" class="kp-danger" data-testid="csv-export-ok" onClick=${() => exportCsv(c.scope)}>${t('kp.csvExportOk')}</button></footer>
      </article></dialog>`;
    }
    const label = (col) => (!col.field ? t('kp.csvIgnored') : col.field.startsWith('custom:') ? `${t('kp.csvCustom')} „${col.field.slice(7)}“`
      : col.field === 'group' ? t('kp.csvGroupField') : col.field === 'tags' ? t('kp.csvTags') : col.field === 'otp' ? t('kp.otp')
      : t({ Title: 'kp.title', UserName: 'kp.userName', Password: 'kp.password', URL: 'kp.url', Notes: 'kp.notes' }[col.field]));
    return html`<dialog open data-testid="csv-import-dialog"><article>
      <header><strong>${t('kp.csvImportTitle')}</strong></header>
      <p data-testid="csv-count">${t('kp.csvEntries', c.records.length, c.name)}</p>
      <details open=${c.columns.length <= 8}><summary>${t('kp.csvColumns')}</summary>
        <table class="kp-csv-columns" data-testid="csv-columns"><tbody>${c.columns.map((col) => html`<tr><td>${col.name}</td><td>${Suite.icon('arrow-right')} ${label(col)}</td></tr>`)}</tbody></table></details>
      <form onSubmit=${(e) => { e.preventDefault(); c.group = e.target.elements.group.value.trim() || c.group; importCsv(c); }}>
        <label>${t('kp.csvTarget')}<input name="group" data-testid="csv-group" defaultValue=${c.group} /></label>
        <p class="kp-warning"><small>${Suite.icon('triangle-alert')} ${t('kp.csvDeleteHint')}</small></p>
        <footer><button type="button" class="secondary" onClick=${close}>${t('kp.close')}</button>
          <button type="submit" data-testid="csv-import-ok">${t('kp.csvImportOk')}</button></footer>
      </form>
    </article></dialog>`;
  }

  // ---- entry history ----------------------------------------------------------------------------

  const FIELD_LABELS = { Title: 'kp.title', UserName: 'kp.userName', Password: 'kp.password', URL: 'kp.url', Notes: 'kp.notes' };
  const fieldLabel = (key) => (FIELD_LABELS[key] ? t(FIELD_LABELS[key]) : key === 'otp' ? t('kp.otp') : key);

  /** What differs between two versions: field names (standard ones first), "attachments", "tags". */
  function versionChanges(a, b) {
    const fa = db().fields(a), fb = db().fields(b);
    const keys = [...new Set([...STANDARD, ...Object.keys(fa), ...Object.keys(fb)])];
    const out = keys.filter((k) => (fa[k] || '') !== (fb[k] || '')).map(fieldLabel);
    const names = (e) => [...e.binaries.keys()].sort().join('\n');
    if (names(a) !== names(b)) out.push(t('kp.attachments'));
    if ((a.tags || []).join() !== (b.tags || []).join()) out.push(t('kp.tagsShort'));
    return out;
  }

  function HistoryVersion({ entry, version, index }) {
    const f = db().fields(version);
    const current = db().fields(entry);
    const keys = [...new Set([...STANDARD, ...Object.keys(f)])].filter((k) => f[k] || current[k]);
    const secret = (k) => k === 'Password' || version.fields.get(k) instanceof kdbxweb.ProtectedValue;
    const revealKey = `history:${index}`;
    const shown = state.reveal.has(revealKey);
    return html`<div class="kp-history-version" data-testid="history-version">
      <table><tbody>${keys.map((k) => html`<tr class=${(f[k] || '') !== (current[k] || '') ? 'kp-differs' : ''} data-testid="history-field">
        <th>${fieldLabel(k)}</th><td>${secret(k) && !shown && f[k] ? '••••••••' : (f[k] || '—')}</td></tr>`)}
        ${version.tags && version.tags.length ? html`<tr><th>${t('kp.tagsShort')}</th><td>${version.tags.join(', ')}</td></tr>` : null}
        ${version.binaries.size ? html`<tr><th>${t('kp.attachments')}</th><td>${[...version.binaries.keys()].join(', ')}</td></tr>` : null}
      </tbody></table>
      <small>${t('kp.historyDiffers')}</small>
      <div class="kp-buttons">
        <button type="button" class="secondary outline" data-testid="history-reveal" onClick=${() => { if (shown) state.reveal.delete(revealKey); else state.reveal.add(revealKey); render(); }}>${shown ? Suite.icon('eye-off') : Suite.icon('eye')}</button>
        ${f.Password ? html`<button type="button" class="secondary outline" data-testid="history-copy" onClick=${() => copy(f.Password, t('kp.password'))}>${Suite.icon('copy')} ${t('kp.password')}</button>` : null}
        <button type="button" class="secondary" data-testid="restore" onClick=${() => { db().restoreHistory(entry, index); state.historyPushed = entry.uuid.id; state.historyOpen = null; setDirty(); }}>${t('kp.restore')}</button>
        <button type="button" class="secondary outline" data-testid="history-delete" onClick=${() => { db().deleteHistory(entry, index); state.historyOpen = null; setDirty(); }}>${t('kp.historyDelete')}</button>
      </div>
    </div>`;
  }

  function HistoryPanel({ entry }) {
    const versions = db().history(entry);
    const rows = versions.map((h, i) => ({ h, i, changes: versionChanges(h, versions[i + 1] || entry) })).reverse();
    return html`<details class="kp-history" data-testid="history" open=${state.historyExpanded} onToggle=${(e) => { state.historyExpanded = e.target.open; }}><summary>${t('kp.history')} (${versions.length})</summary>
      <ul>${rows.map(({ h, i, changes }) => html`<li data-testid="history-item" class=${state.historyOpen === i ? 'open' : ''}>
        <a href="#" data-testid="history-open" onClick=${(e) => { e.preventDefault(); state.historyOpen = state.historyOpen === i ? null : i; render(); }}>${fmtDate(h.times.lastModTime)} – ${db().field(h, 'Title') || '—'}</a>
        <small data-testid="history-changes"> ${changes.length ? t('kp.historyChanged', changes.join(', ')) : t('kp.historyNoChange')}</small>
        ${state.historyOpen === i ? html`<${HistoryVersion} entry=${entry} version=${h} index=${i} />` : null}
      </li>`)}</ul>
      <button type="button" class="secondary outline" data-testid="history-clear" onClick=${async () => { if (await Suite.shell.confirm(t('kp.historyClearConfirm', versions.length))) { db().deleteHistory(entry); state.historyOpen = null; setDirty(); } }}>${t('kp.historyClear')}</button>
    </details>`;
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
        : html`<p data-testid="report-ok">${Suite.icon('check')} ${t('kp.reportOk')}</p>`}
      <p><small>${t('kp.reportHint')}</small></p>
      <footer><button data-testid="report-close" onClick=${() => { state.report = false; render(); }}>${t('kp.close')}</button></footer>
    </article></dialog>`;
  }

  function SettingsDialog() {
    if (!state.settingsOpen) return null;
    return html`<dialog open data-testid="settings"><article>
      <header><strong>${t('kp.settingsTitle')}</strong></header>
      <label>${t('kp.name')}<input data-testid="db-title" defaultValue=${db().db.meta.name || ''} onChange=${(e) => { db().db.meta.name = e.target.value; setDirty(); }} /></label>
      <label>${t('kp.historyMax')}<input type="number" min="-1" max="1000" data-testid="history-max" defaultValue=${db().db.meta.historyMaxItems ?? 10}
        onChange=${(e) => { const v = Math.round(+e.target.value); if (Number.isFinite(v)) { db().db.meta.historyMaxItems = Math.max(-1, v); setDirty(); } }} /><small>${t('kp.historyMaxHint')}</small></label>
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
      <button class="secondary outline" title="${t('kp.undo')} (Ctrl+Z)" data-testid="undo" disabled=${!history.canUndo} onClick=${() => step(false)}>${Suite.icon('undo-2')}</button>
      <button class="secondary outline" title="${t('kp.redo')} (Ctrl+Y)" data-testid="redo" disabled=${!history.canRedo} onClick=${() => step(true)}>${Suite.icon('redo-2')}</button>
      <button class="secondary" data-testid="new-entry" onClick=${newEntry}>+ ${t('kp.newEntry')}</button>
      <button class="secondary outline" data-testid="db-settings" onClick=${() => { state.settingsOpen = true; render(); }}>${Suite.icon('settings')} ${t('kp.settings')}</button>
      <button class="secondary outline" data-testid="merge" onClick=${chooseMerge}>${Suite.icon('arrow-left-right')} ${t('kp.merge')}</button>
      <select class="kp-csv-menu" data-testid="csv-menu" aria-label=${t('kp.csv')} onChange=${(e) => { const v = e.target.value; e.target.value = ''; if (v === 'import') chooseCsv(); else if (v === 'export') { state.csv = { kind: 'export', scope: 'all' }; render(); } }}>
        <option value="">${t('kp.csv')}</option><option value="import">${t('kp.csvImport')}</option><option value="export">${t('kp.csvExport')}</option></select>
      <button class="secondary outline" data-testid="report" onClick=${() => { state.report = true; render(); }}>${Suite.icon('stethoscope')} ${t('kp.report')}</button>
      <button class="secondary outline" data-testid="lock" onClick=${() => lock(false)}>${Suite.icon('lock')} ${t('kp.lock')}</button>
    </nav>`;
  }

  function Main() {
    if (!state.db) return html`<div class="kp-center"><${LockScreen} /></div>`;
    return html`<div class=${`kp-layout pane-${state.pane}`} data-testid="workspace"><${Groups} /><${Entries} /><${EntryEditor} /><${SettingsDialog} /><${MergeDialog} /><${ReportDialog} /><${CsvDialog} /><${OtpDialog} /><${QrDialog} /></div>`;
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

  // the open file(s) for "Create an archive from the open files" (about dialog)
  Suite.openFiles.register(async () => (state.db ? [{ name: state.name || 'database.kdbx', bytes: new Uint8Array(await state.db.save()), dirty: state.dirty }] : []));

  // for tests
  KP.app = { state, otpOf, importCsv, exportCsv, history, step, showDatabase, save, lock, resetAutoLock, AUTO_LOCK_MINUTES };
  document.body.dataset.ready = 'true';
})();
