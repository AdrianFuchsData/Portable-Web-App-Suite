/*
 * Mail client: IMAP folders and messages, SMTP sending (both through the relay), composing in plain text or HTML with
 * attachments, drafts and sent copies, address book (vCard), calendar invitations (iCalendar replies), and offline
 * .eml/.mbox files without a relay.
 */
import DOMPurify from 'dompurify';
import { openImap, quote } from '@app/imap.js';
import { sendMail } from '@app/smtp.js';
import * as mime from '@app/mime.js';
import { threads } from '@app/threads.js';
import 'app/spell-dom'; // spelling selector in the header, marks in text fields (shared/js/spell-dom.js)

const { html } = Suite.shell;
const t = Suite.t;
const APP = 'mail';
const PAGE = 50;
const OPEN_TYPES = [{ description: 'E-mail', accept: { 'message/rfc822': ['.eml', '.mbox', '.mbx'] } }];

Suite.i18n.register({
  en: {
    'app.title': 'Mail',
    'mail.accounts': 'Accounts', 'mail.addAccount': '+ Account', 'mail.allInboxes': 'All inboxes', 'mail.disconnect': 'Disconnect', 'mail.account': 'Account', 'mail.folders': 'Folders', 'mail.files': 'Opened files', 'mail.new': 'New message',
    'mail.reply': 'Reply', 'mail.replyAll': 'Reply all', 'mail.forward': 'Forward', 'mail.delete': 'Delete', 'mail.unread': 'Unread', 'mail.read': 'Read',
    'mail.flag': 'Flag', 'mail.move': 'Move…', 'mail.saveEml': 'Save as .eml', 'mail.openFile': 'Open .eml/.mbox', 'mail.contacts': 'Contacts',
    'mail.rules': 'Rules', 'mail.rulesHint': 'Applied to new messages in the inbox while the mail client is open (the first matching rule counts).',
    'mail.addRule': 'Add rule', 'mail.ruleFrom': 'From', 'mail.ruleTo': 'To', 'mail.ruleSubject': 'Subject', 'mail.contains': 'contains', 'mail.ruleMove': 'move to',
    'mail.ruleFlag': 'flag', 'mail.ruleRead': 'mark as read', 'mail.ruleDelete': 'delete', 'mail.applyRules': 'Apply the rules to this folder', 'mail.rulesApplied': 'Rules: {0} message(s) processed.',
    'mail.templates': 'Templates', 'mail.saveTemplate': 'Save as template', 'mail.templateSaved': 'Template “{0}” saved.', 'mail.newFromTemplate': 'New from template',
    'mail.refresh': 'Refresh', 'mail.threads': 'Group by conversation', 'mail.threadCount': '{0} messages in this conversation', 'mail.search': 'Search', 'mail.loadMore': 'Load older messages', 'mail.noMessages': 'No messages.',
    'mail.noSelection': 'Select a message.', 'mail.notConnected': 'Not connected. Choose an account or open an .eml/.mbox file.', 'mail.connecting': 'Connecting…',
    'mail.from': 'From', 'mail.to': 'To', 'mail.cc': 'Cc', 'mail.bcc': 'Bcc', 'mail.subject': 'Subject', 'mail.date': 'Date', 'mail.attachments': 'Attachments',
    'mail.remoteBlocked': 'Remote images and content were not loaded (privacy).', 'mail.noSubject': '(no subject)', 'mail.wrote': 'On {0}, {1} wrote:',
    'mail.forwarded': '-------- Forwarded message --------', 'mail.send': 'Send', 'mail.saveDraft': 'Save draft', 'mail.discard': 'Discard', 'mail.attach': 'Attach…',
    'mail.html': 'Formatted (HTML)', 'mail.discardConfirm': 'Discard this message?', 'mail.sent': 'The message was sent.', 'mail.draftSaved': 'The draft was saved in “{0}”.',
    'mail.noRecipients': 'Enter at least one valid recipient.', 'mail.badAddress': 'Invalid address: {0}', 'mail.noAccount': 'Sending needs a mail account and the relay. Save the message as .eml instead.',
    'mail.refused': 'Some recipients were refused: {0}', 'mail.deleteConfirm': 'Delete {0} message(s) for good?', 'mail.moveTo': 'Move to folder', 'mail.copyTo': 'Copy to folder',
    'mail.cancel': 'Cancel', 'mail.ok': 'OK', 'mail.save': 'Save', 'mail.saveConnect': 'Save and connect', 'mail.accountName': 'Account name', 'mail.displayName': 'Your name',
    'mail.email': 'E-mail address', 'mail.user': 'User name', 'mail.password': 'Password', 'mail.savePassword': 'Save the password with the account',
    'mail.imap': 'Incoming mail (IMAP)', 'mail.smtp': 'Outgoing mail (SMTP)', 'mail.host': 'Server', 'mail.port': 'Port', 'mail.security': 'Security',
    'mail.secTls': 'SSL/TLS', 'mail.secStarttls': 'STARTTLS', 'mail.secNone': 'none (not encrypted)', 'mail.smtpSame': 'Same user name and password as IMAP',
    'mail.insecure': 'Accept untrusted certificates', 'mail.signature': 'Signature', 'mail.deleteAccount': 'Delete the account “{0}”?',
    'mail.relayMissing': 'Configure the relay first (address and token).', 'mail.passwordFor': 'Password for {0}', 'mail.newFolder': 'New folder', 'mail.renameFolder': 'Rename folder',
    'mail.deleteFolder': 'Delete folder', 'mail.deleteFolderConfirm': 'Delete the folder “{0}” with all its messages?', 'mail.folderName': 'Folder name',
    'mail.contactsHint': 'Contacts are saved with the connections file (Save).', 'mail.newContact': '+ Contact', 'mail.importVcf': 'Import .vcf', 'mail.exportVcf': 'Export .vcf',
    'mail.name': 'Name', 'mail.emails': 'E-mail addresses (one per line)', 'mail.phones': 'Phone numbers (one per line)', 'mail.org': 'Organization', 'mail.note': 'Note',
    'mail.write': 'Write', 'mail.deleteContact': 'Delete the contact “{0}”?', 'mail.addContact': 'Add to contacts', 'mail.contactAdded': '“{0}” was added to the contacts.',
    'mail.imported': '{0} contact(s) imported.', 'mail.invitation': 'Invitation', 'mail.accept': 'Accept', 'mail.tentative': 'Maybe', 'mail.decline': 'Decline',
    'mail.downloadIcs': 'Save .ics (for the calendar)', 'mail.replySent': 'The answer was sent to {0}.', 'mail.organizer': 'Organizer', 'mail.where': 'Where', 'mail.when': 'When',
    'mail.cancelled': 'Cancelled', 'mail.editDraft': 'Edit draft', 'mail.back': 'Back', 'mail.copied': '{0} message(s) copied to “{1}”.', 'mail.cannotOpen': '“{0}” cannot be opened: {1}',
    'mail.unsavedCompose': 'A message is being written.', 'mail.close': 'Close', 'mail.showText': 'Plain text', 'mail.showHtml': 'Formatted', 'mail.link': 'Link address',
    'mail.textOnly': 'Switching to plain text removes the formatting. Continue?', 'mail.me': 'me', 'mail.allFiles': 'All messages',
    'folder.\\Inbox': 'Inbox', 'folder.\\Sent': 'Sent', 'folder.\\Drafts': 'Drafts', 'folder.\\Trash': 'Trash', 'folder.\\Junk': 'Junk', 'folder.\\Archive': 'Archive',
  },
  de: {
    'app.title': 'E-Mail',
    'mail.accounts': 'Konten', 'mail.addAccount': '+ Konto', 'mail.allInboxes': 'Alle Posteingänge', 'mail.disconnect': 'Trennen', 'mail.account': 'Konto', 'mail.folders': 'Ordner', 'mail.files': 'Geöffnete Dateien', 'mail.new': 'Neue Nachricht',
    'mail.reply': 'Antworten', 'mail.replyAll': 'Allen antworten', 'mail.forward': 'Weiterleiten', 'mail.delete': 'Löschen', 'mail.unread': 'Ungelesen', 'mail.read': 'Gelesen',
    'mail.flag': 'Markieren', 'mail.move': 'Verschieben…', 'mail.saveEml': 'Als .eml speichern', 'mail.openFile': '.eml/.mbox öffnen', 'mail.contacts': 'Kontakte',
    'mail.rules': 'Regeln', 'mail.rulesHint': 'Gelten für neue Nachrichten im Posteingang, solange der Mail-Client geöffnet ist (die erste passende Regel zählt).',
    'mail.addRule': 'Regel hinzufügen', 'mail.ruleFrom': 'Von', 'mail.ruleTo': 'An', 'mail.ruleSubject': 'Betreff', 'mail.contains': 'enthält', 'mail.ruleMove': 'verschieben nach',
    'mail.ruleFlag': 'markieren', 'mail.ruleRead': 'als gelesen markieren', 'mail.ruleDelete': 'löschen', 'mail.applyRules': 'Regeln auf diesen Ordner anwenden', 'mail.rulesApplied': 'Regeln: {0} Nachricht(en) bearbeitet.',
    'mail.templates': 'Vorlagen', 'mail.saveTemplate': 'Als Vorlage speichern', 'mail.templateSaved': 'Vorlage „{0}“ gespeichert.', 'mail.newFromTemplate': 'Neu aus Vorlage',
    'mail.refresh': 'Aktualisieren', 'mail.threads': 'Nach Unterhaltung gruppieren', 'mail.threadCount': '{0} Nachrichten in dieser Unterhaltung', 'mail.search': 'Suchen', 'mail.loadMore': 'Ältere Nachrichten laden', 'mail.noMessages': 'Keine Nachrichten.',
    'mail.noSelection': 'Wählen Sie eine Nachricht.', 'mail.notConnected': 'Nicht verbunden. Wählen Sie ein Konto oder öffnen Sie eine .eml/.mbox-Datei.', 'mail.connecting': 'Verbinde…',
    'mail.from': 'Von', 'mail.to': 'An', 'mail.cc': 'Cc', 'mail.bcc': 'Bcc', 'mail.subject': 'Betreff', 'mail.date': 'Datum', 'mail.attachments': 'Anhänge',
    'mail.remoteBlocked': 'Externe Bilder und Inhalte wurden nicht geladen (Datenschutz).', 'mail.noSubject': '(kein Betreff)', 'mail.wrote': 'Am {0} schrieb {1}:',
    'mail.forwarded': '-------- Weitergeleitete Nachricht --------', 'mail.send': 'Senden', 'mail.saveDraft': 'Entwurf speichern', 'mail.discard': 'Verwerfen', 'mail.attach': 'Anhängen…',
    'mail.html': 'Formatiert (HTML)', 'mail.discardConfirm': 'Diese Nachricht verwerfen?', 'mail.sent': 'Die Nachricht wurde gesendet.', 'mail.draftSaved': 'Der Entwurf wurde in „{0}“ gespeichert.',
    'mail.noRecipients': 'Geben Sie mindestens einen gültigen Empfänger ein.', 'mail.badAddress': 'Ungültige Adresse: {0}', 'mail.noAccount': 'Zum Senden braucht es ein E-Mail-Konto und das Relay. Speichern Sie die Nachricht stattdessen als .eml.',
    'mail.refused': 'Einige Empfänger wurden abgelehnt: {0}', 'mail.deleteConfirm': '{0} Nachricht(en) endgültig löschen?', 'mail.moveTo': 'In Ordner verschieben', 'mail.copyTo': 'In Ordner kopieren',
    'mail.cancel': 'Abbrechen', 'mail.ok': 'OK', 'mail.save': 'Speichern', 'mail.saveConnect': 'Speichern und verbinden', 'mail.accountName': 'Kontoname', 'mail.displayName': 'Ihr Name',
    'mail.email': 'E-Mail-Adresse', 'mail.user': 'Benutzername', 'mail.password': 'Passwort', 'mail.savePassword': 'Passwort mit dem Konto speichern',
    'mail.imap': 'Posteingang (IMAP)', 'mail.smtp': 'Postausgang (SMTP)', 'mail.host': 'Server', 'mail.port': 'Port', 'mail.security': 'Sicherheit',
    'mail.secTls': 'SSL/TLS', 'mail.secStarttls': 'STARTTLS', 'mail.secNone': 'keine (unverschlüsselt)', 'mail.smtpSame': 'Gleicher Benutzername und gleiches Passwort wie IMAP',
    'mail.insecure': 'Nicht vertrauenswürdige Zertifikate akzeptieren', 'mail.signature': 'Signatur', 'mail.deleteAccount': 'Das Konto „{0}“ löschen?',
    'mail.relayMissing': 'Richten Sie zuerst das Relay ein (Adresse und Token).', 'mail.passwordFor': 'Passwort für {0}', 'mail.newFolder': 'Neuer Ordner', 'mail.renameFolder': 'Ordner umbenennen',
    'mail.deleteFolder': 'Ordner löschen', 'mail.deleteFolderConfirm': 'Den Ordner „{0}“ mit allen Nachrichten löschen?', 'mail.folderName': 'Ordnername',
    'mail.contactsHint': 'Kontakte werden mit der Verbindungsdatei gespeichert (Speichern).', 'mail.newContact': '+ Kontakt', 'mail.importVcf': '.vcf importieren', 'mail.exportVcf': '.vcf exportieren',
    'mail.name': 'Name', 'mail.emails': 'E-Mail-Adressen (eine pro Zeile)', 'mail.phones': 'Telefonnummern (eine pro Zeile)', 'mail.org': 'Organisation', 'mail.note': 'Notiz',
    'mail.write': 'Schreiben', 'mail.deleteContact': 'Den Kontakt „{0}“ löschen?', 'mail.addContact': 'Zu Kontakten hinzufügen', 'mail.contactAdded': '„{0}“ wurde zu den Kontakten hinzugefügt.',
    'mail.imported': '{0} Kontakt(e) importiert.', 'mail.invitation': 'Einladung', 'mail.accept': 'Zusagen', 'mail.tentative': 'Vielleicht', 'mail.decline': 'Absagen',
    'mail.downloadIcs': '.ics speichern (für den Kalender)', 'mail.replySent': 'Die Antwort wurde an {0} gesendet.', 'mail.organizer': 'Organisator', 'mail.where': 'Ort', 'mail.when': 'Wann',
    'mail.cancelled': 'Abgesagt', 'mail.editDraft': 'Entwurf bearbeiten', 'mail.back': 'Zurück', 'mail.copied': '{0} Nachricht(en) nach „{1}“ kopiert.', 'mail.cannotOpen': '„{0}“ kann nicht geöffnet werden: {1}',
    'mail.unsavedCompose': 'Eine Nachricht wird gerade geschrieben.', 'mail.close': 'Schließen', 'mail.showText': 'Nur Text', 'mail.showHtml': 'Formatiert', 'mail.link': 'Link-Adresse',
    'mail.textOnly': 'Beim Wechsel zu reinem Text geht die Formatierung verloren. Fortfahren?', 'mail.me': 'ich', 'mail.allFiles': 'Alle Nachrichten',
    'folder.\\Inbox': 'Posteingang', 'folder.\\Sent': 'Gesendet', 'folder.\\Drafts': 'Entwürfe', 'folder.\\Trash': 'Papierkorb', 'folder.\\Junk': 'Spam', 'folder.\\Archive': 'Archiv',
  },
});

const state = {
  account: null, imap: null, connecting: false, passwords: {},
  folders: [], folder: null, unread: {}, total: 0, loadedFrom: 0,
  messages: [], sel: new Set(), current: null, message: null, showText: false,
  search: '', searching: false, expanded: new Set(),
  threaded: (() => { try { return localStorage.getItem('suite.mail.threads') !== '0'; } catch (e) { return true; } })(),
  source: 'imap', local: null, // local: { name, items: [summary + raw] }
  view: 'list', // phone: 'folders' | 'list' | 'message'
  compose: null, dialog: null, book: null,
};
const cache = new Map(); // `${account}\n${folder}\n${uid}` -> { raw, parsed }
// Several accounts stay connected at the same time; state.account/imap/folders/unread are those of the active one.
// session: { account, imap, folders, unread, folder (last opened), selected (folder selected on the connection) }
const sessions = new Map(); // account id -> session
const activeSession = () => (state.account ? sessions.get(state.account.id) : null);
const inboxOf = (s) => (s.folders.find((f) => f.special === '\\Inbox') || { path: 'INBOX' }).path;
async function selectIn(s, path) {
  if (s.selected === path) return null;
  const info = await s.imap.select(path);
  s.selected = path;
  return info;
}
const data = Suite.appdata.create(APP, { onChange: () => render() });

let queued = false;
function render() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; Suite.shell.refresh(); });
}
const fail = (e) => { console.warn(e); Suite.shell.toast(Suite.i18n.describe(e), 'error'); };
const locale = () => (Suite.i18n.language === 'de' ? 'de-AT' : 'en-GB');
const fmtSize = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KiB` : `${(n / 1048576).toFixed(1)} MiB`);
function fmtDate(ms, long = false) {
  if (!ms) return '';
  const d = new Date(ms);
  if (long) return d.toLocaleString(locale(), { dateStyle: 'full', timeStyle: 'short' });
  const today = new Date();
  return d.toDateString() === today.toDateString() ? d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(locale(), { dateStyle: 'short' });
}
const folderLabel = (f) => { const key = `folder.${f.special}`; return f.special && t(key) !== key ? t(key) : f.name; };
const special = (kind) => state.folders.find((f) => f.special === kind);
const contacts = () => (data.settings.contacts || []);
const setContacts = (list) => { data.settings = { ...data.settings, contacts: list }; };
const myAddress = () => (state.account ? state.account.email : '');
const isPhone = () => matchMedia('(max-width: 760px)').matches;

// ---- accounts and connection ------------------------------------------------------------------------------------------

const newAccount = () => ({
  name: '', displayName: '', email: '', username: '', password: '', savePassword: false,
  imapHost: '', imapPort: 993, imapSecurity: 'tls', smtpHost: '', smtpPort: 587, smtpSecurity: 'starttls',
  smtpSame: true, smtpUsername: '', smtpPassword: '', insecure: false, signature: '', rules: [], templates: [],
});

function storedAccount(a) {
  const out = { ...a, url: `imap://${a.imapHost}:${a.imapPort}` };
  delete out.savePassword;
  if (!a.savePassword) { out.password = ''; out.smtpPassword = ''; }
  return out;
}

/** Make a connected account the active one (its folders in the side bar, its folder in the list). */
function activate(s) {
  const prev = activeSession();
  if (prev && state.source === 'imap') prev.folder = state.folder;
  Object.assign(state, { account: s.account, imap: s.imap, folders: s.folders, unread: s.unread });
}

async function connect(account) {
  const live = sessions.get(account.id);
  if (live && !live.imap.closed) { // already connected: switch to it
    activate(live);
    await openFolder(live.folder || inboxOf(live));
    refreshUnread();
    return;
  }
  if (!data.relayConfigured()) { Suite.shell.toast(t('mail.relayMissing'), 'error'); return; }
  const password = account.password || state.passwords[account.id];
  if (!password) { state.dialog = { kind: 'password', account }; render(); return; }
  if (live) sessions.delete(account.id);
  const s = { account, imap: null, folders: [], unread: {}, folder: null, selected: null };
  state.connecting = account.id;
  render();
  try {
    s.imap = await openImap({
      relay: data.relayConfig(), host: account.imapHost, port: account.imapPort, security: account.imapSecurity, insecure: !!account.insecure,
      user: account.username || account.email, password, onUpdate: (u) => onImapUpdate(u, s),
    });
    const folders = await s.imap.list();
    const order = ['\\Inbox', '\\Drafts', '\\Sent', '\\Archive', '\\Junk', '\\Trash'];
    s.folders = folders.sort((a, b) => ((order.indexOf(a.special) + 1 || 99) - (order.indexOf(b.special) + 1 || 99)) || a.path.localeCompare(b.path));
    sessions.set(account.id, s);
    activate(s);
    state.source = 'imap';
    await openFolder((s.folders.find((f) => f.special === '\\Inbox') || s.folders.find((f) => f.selectable) || {}).path);
    refreshUnread();
  } catch (e) {
    if (s.imap) s.imap.close().catch(() => {});
    fail(e);
  } finally { state.connecting = false; render(); }
}

/** Close the connection of an account (the active one by default). */
async function disconnect(id = state.account && state.account.id) {
  const s = sessions.get(id);
  if (s) { sessions.delete(id); await s.imap.close().catch(() => {}); }
  for (const k of [...cache.keys()]) if (k.startsWith(`${id}\n`)) cache.delete(k);
  const wasActive = state.account && state.account.id === id;
  if (wasActive || state.source === 'unified') {
    Object.assign(state, { account: null, imap: null, folders: [], folder: null, messages: [], sel: new Set(), current: null, message: null, unread: {} });
    const next = sessions.values().next().value;
    if (state.source === 'unified' && sessions.size) { if (next) activate(next); await openUnified(); return; }
    if (next) { activate(next); state.source = 'imap'; await openFolder(next.folder || inboxOf(next)); return; }
    if (state.source === 'unified') state.source = 'imap';
  }
  render();
}

async function refreshUnread() {
  for (const f of state.folders) {
    if (!f.selectable || !state.imap) continue;
    try { state.unread[f.path] = (await state.imap.status(f.path)).unseen; } catch (e) { /* folder may be gone */ }
  }
  render();
}

let updating = false;
function onImapUpdate({ exists, path }, s) {
  if (exists == null) return;
  if (state.source === 'unified') { // new mail in one of the inboxes: reload the combined list
    if (path === inboxOf(s) && !updating) { updating = true; setTimeout(() => openUnified({ keep: true }).finally(() => { updating = false; })); }
    return;
  }
  if (s && s !== activeSession()) { // another connected account: only its unread count
    if (path === inboxOf(s)) setTimeout(() => s.imap.status(path).then((st) => { s.unread[path] = st.unseen; render(); }).catch(() => {}));
    return;
  }
  if (path !== state.folder || updating || state.source !== 'imap' || state.search) return;
  if (exists > state.total) {
    updating = true;
    const from = state.total + 1;
    state.total = exists;
    // fetched after the running command has finished (commands are serialized)
    setTimeout(async () => {
      try {
        const list = await summaries(`${from}:${exists}`);
        state.messages = [...list, ...state.messages];
        refreshUnread();
        updating = false;
        await applyRules(list);
      } catch (e) { console.warn(e); } finally { updating = false; render(); }
    });
  }
}

// NOOP keeps the connections alive and lets the servers report new messages
setInterval(() => { for (const s of sessions.values()) if (!s.imap.closed) s.imap.noop().catch(() => {}); }, 60000);

// ---- folders and lists --------------------------------------------------------------------------------------------------

async function summary(item) {
  const header = item.header ? mime.toBytes(`${new TextDecoder().decode(item.header).replace(/\s+$/, '')}\r\n\r\n`) : new Uint8Array(0);
  const p = await mime.parseMessage(header);
  const ctype = (p.headers.find((h) => h.key === 'content-type') || {}).value || '';
  return {
    uid: item.uid, seq: item.seq, flags: item.flags, size: item.size,
    date: (p.date && Date.parse(p.date)) || item.date, from: p.from || null, to: p.to || [], subject: p.subject || '',
    attachment: /multipart\/mixed/i.test(ctype), messageId: p.messageId || '', inReplyTo: p.inReplyTo || '', references: p.references || '',
  };
}

async function summaries(range) {
  const list = await state.imap.summaries(range);
  const out = await Promise.all(list.map(summary));
  return out.sort((a, b) => b.seq - a.seq);
}

async function openFolder(path) {
  if (!path) return;
  state.source = 'imap';
  state.folder = path;
  state.search = '';
  Object.assign(state, { messages: [], sel: new Set(), current: null, message: null });
  state.view = 'list';
  render();
  try {
    const info = await state.imap.select(path);
    const s = activeSession();
    if (s) s.selected = path;
    state.total = info.exists;
    state.loadedFrom = Math.max(1, info.exists - PAGE + 1);
    state.messages = info.exists ? await summaries(`${state.loadedFrom}:${info.exists}`) : [];
  } catch (e) { fail(e); }
  render();
  applyRules(state.messages).catch(fail);
}

async function loadMore() {
  if (state.loadedFrom <= 1) return;
  const to = state.loadedFrom - 1;
  const from = Math.max(1, to - PAGE + 1);
  try {
    const older = await summaries(`${from}:${to}`);
    state.messages = [...state.messages, ...older];
    state.loadedFrom = from;
  } catch (e) { fail(e); }
  render();
}

/**
 * The combined inbox of all connected accounts: the newest PAGE messages of every inbox, newest first. Messages get the
 * uid "<account id>:<uid>" and remember their account (acc) and IMAP uid (realUid).
 */
async function openUnified({ keep = false } = {}) {
  if (!keep) Object.assign(state, { messages: [], sel: new Set(), current: null, message: null, search: '' });
  const prev = activeSession();
  if (prev && state.source === 'imap') prev.folder = state.folder;
  state.source = 'unified';
  state.folder = null;
  state.view = 'list';
  render();
  const all = [];
  for (const s of sessions.values()) {
    try {
      const inbox = inboxOf(s);
      s.selected = null; // select again: the count must be fresh
      const info = await selectIn(s, inbox);
      s.unread[inbox] = (await s.imap.status(inbox)).unseen;
      if (!info.exists) continue;
      const list = await s.imap.summaries(`${Math.max(1, info.exists - PAGE + 1)}:${info.exists}`);
      for (const m of await Promise.all(list.map(summary))) all.push({ ...m, uid: `${s.account.id}:${m.uid}`, realUid: m.uid, acc: s.account.id });
    } catch (e) { fail(e); }
  }
  if (state.source !== 'unified') return;
  state.messages = all.sort((a, b) => b.date - a.date || b.realUid - a.realUid);
  render();
}

/** For a message of the combined inbox: its session and IMAP uid (the inbox is selected on that connection). */
async function unifiedTarget(uid) {
  const m = state.messages.find((x) => x.uid === uid);
  const s = m && sessions.get(m.acc);
  if (!s) throw new Error(t('mail.notConnected'));
  await selectIn(s, inboxOf(s));
  return { s, m, uid: m.realUid };
}

/** Group uids of the combined inbox by account: [[session, [imap uids], [list uids]]]. */
async function byAccount(uids) {
  const groups = new Map();
  for (const uid of uids) {
    const { s, uid: real } = await unifiedTarget(uid);
    if (!groups.has(s)) groups.set(s, [[], []]);
    groups.get(s)[0].push(real);
    groups.get(s)[1].push(uid);
  }
  return [...groups].map(([s, [real, list]]) => [s, real, list]);
}

async function search(q) {
  state.search = q;
  if (state.source === 'local' || state.source === 'unified') { render(); return; }
  if (!q) { await openFolder(state.folder); return; }
  state.searching = true;
  render();
  try {
    const uids = (await state.imap.search('TEXT ', quote(q))).sort((a, b) => b - a).slice(0, 200);
    state.messages = (await summaries({ uids })).sort((a, b) => b.date - a.date);
    Object.assign(state, { sel: new Set(), current: null, message: null });
  } catch (e) { fail(e); } finally { state.searching = false; render(); }
}

/** Threads of a list (computed once per list and flags state). */
let threadCache = { list: null, key: '', value: [] };
function threadsOf(list) {
  const key = `${list.length}|${list.map((m) => m.uid + m.flags.join('')).join(',')}`;
  if (threadCache.list !== list || threadCache.key !== key) threadCache = { list, key, value: threads(list) };
  return threadCache.value;
}

/** The listed messages (search applied), flat. */
function listedMessages() {
  if (state.source === 'unified') {
    const q = state.search.toLowerCase();
    return q ? state.messages.filter((m) => `${m.subject} ${mime.showAddress(m.from)}`.toLowerCase().includes(q)) : state.messages;
  }
  if (state.source !== 'local') return state.messages;
  const q = state.search.toLowerCase();
  const items = state.local ? state.local.items : [];
  if (!q) return items;
  return items.filter((m) => `${m.subject} ${mime.showAddress(m.from)} ${(m.parsed.text || '')}`.toLowerCase().includes(q));
}

/** Rows of the list in display order: [{ m, depth, thread }] (threads collapsed to their first row unless expanded). */
function listRows() {
  const list = listedMessages();
  if (!state.threaded) return list.map((m) => ({ m, depth: 0, thread: null }));
  const rows = [];
  for (const th of threadsOf(list)) {
    const open = th.count > 1 && (state.expanded.has(th.id) || th.rows.some((r) => r.m.uid === state.current));
    for (const r of open ? th.rows : th.rows.slice(0, 1)) rows.push({ m: r.m, depth: r.depth, thread: th, open });
  }
  return rows;
}

/** The messages in display order (keyboard navigation, range selection). */
function visibleMessages() { return listRows().map((r) => r.m); }

// ---- messages ---------------------------------------------------------------------------------------------------------------

async function loadMessage(uid) {
  if (state.source === 'local') { const m = state.local.items.find((x) => x.uid === uid); return { raw: m.raw, parsed: m.parsed }; }
  let imap = state.imap, real = uid, key = `${state.account && state.account.id}\n${state.folder}\n${uid}`;
  if (state.source === 'unified') {
    const target = await unifiedTarget(uid);
    imap = target.s.imap; real = target.uid; key = `${target.s.account.id}\n${inboxOf(target.s)}\n${real}`;
  }
  if (cache.has(key)) return cache.get(key);
  const raw = await imap.fetchRaw(real);
  const entry = { raw, parsed: await mime.parseMessage(raw) };
  cache.set(key, entry);
  if (cache.size > 40) cache.delete(cache.keys().next().value);
  return entry;
}

async function openMessage(uid) {
  state.current = uid;
  state.showText = false;
  state.view = 'message';
  render();
  try {
    const m = await loadMessage(uid);
    if (state.current !== uid) return;
    state.message = { uid, ...m };
    const s = state.messages.find((x) => x.uid === uid);
    if (state.source === 'imap' && s && !s.flags.includes('\\Seen')) {
      await state.imap.setFlags([uid], true, ['\\Seen']);
      s.flags = [...s.flags, '\\Seen'];
      state.unread[state.folder] = Math.max(0, (state.unread[state.folder] || 1) - 1);
    } else if (state.source === 'unified' && s && !s.flags.includes('\\Seen')) {
      const target = await unifiedTarget(uid);
      await target.s.imap.setFlags([target.uid], true, ['\\Seen']);
      s.flags = [...s.flags, '\\Seen'];
      const inbox = inboxOf(target.s);
      target.s.unread[inbox] = Math.max(0, (target.s.unread[inbox] || 1) - 1);
    }
  } catch (e) { fail(e); }
  render();
}

const selectedUids = () => (state.sel.size ? [...state.sel] : state.current != null ? [state.current] : []);

async function toggleFlag(flag, uids = selectedUids()) {
  if (!uids.length || (state.source !== 'imap' && state.source !== 'unified')) return;
  const msgs = state.messages.filter((m) => uids.includes(m.uid));
  const add = !msgs.every((m) => m.flags.includes(flag));
  try {
    if (state.source === 'unified') {
      for (const [s, real] of await byAccount(uids)) {
        await s.imap.setFlags(real, add, [flag]);
        if (flag === '\\Seen') s.unread[inboxOf(s)] = (await s.imap.status(inboxOf(s))).unseen;
      }
    } else await state.imap.setFlags(uids, add, [flag]);
    for (const m of msgs) m.flags = add ? [...new Set([...m.flags, flag])] : m.flags.filter((f) => f !== flag);
    if (flag === '\\Seen') refreshUnread();
  } catch (e) { fail(e); }
  render();
}

function removeFromList(uids) {
  const list = visibleMessages();
  const idx = list.findIndex((m) => uids.includes(m.uid));
  state.messages = state.messages.filter((m) => !uids.includes(m.uid));
  state.total = Math.max(0, state.total - uids.length);
  state.sel = new Set();
  const rest = visibleMessages();
  const next = rest[Math.min(idx, rest.length - 1)];
  if (next && !isPhone()) openMessage(next.uid); else { state.current = null; state.message = null; if (isPhone()) state.view = 'list'; }
}

async function deleteMessages(uids = selectedUids(), { confirm = true } = {}) {
  if (!uids.length) return;
  if (state.source === 'local') {
    state.local.items = state.local.items.filter((m) => !uids.includes(m.uid));
    state.sel = new Set(); state.current = null; state.message = null; render();
    return;
  }
  if (state.source === 'unified') { // each account moves its messages into its own trash
    try {
      for (const [s, real] of await byAccount(uids)) {
        const bin = s.folders.find((f) => f.special === '\\Trash');
        if (bin) await s.imap.move(real, bin.path);
        else {
          if (confirm && !(await Suite.shell.confirm(t('mail.deleteConfirm', real.length)))) continue;
          await s.imap.expunge(real);
        }
        s.unread[inboxOf(s)] = (await s.imap.status(inboxOf(s))).unseen;
      }
      removeFromList(uids);
    } catch (e) { fail(e); }
    render();
    return;
  }
  const trash = special('\\Trash');
  try {
    if (trash && trash.path !== state.folder) await state.imap.move(uids, trash.path);
    else {
      if (confirm && !(await Suite.shell.confirm(t('mail.deleteConfirm', uids.length)))) return;
      await state.imap.expunge(uids);
    }
    removeFromList(uids);
    refreshUnread();
  } catch (e) { fail(e); }
  render();
}

// ---- rules (per account: { field: from|to|subject, contains, action: move|flag|read|delete, folder }) -------------------------

const ruled = new Set(); // folder/uid of messages the rules were applied to in this session

function ruleMatches(rule, m) {
  const needle = String(rule.contains || '').trim().toLowerCase();
  if (!needle) return false;
  const text = rule.field === 'from' ? mime.showAddress(m.from) : rule.field === 'to' ? (m.to || []).map((x) => mime.showAddress(x)).join(', ') : m.subject;
  return String(text || '').toLowerCase().includes(needle);
}

/** Apply the account's rules to messages of the current folder (new unread ones in the inbox, or all with force). */
async function applyRules(messages, { force = false } = {}) {
  const rules = (state.account && state.account.rules || []).filter((r) => r.contains && r.action);
  if (!rules.length || state.source !== 'imap' || !state.imap) return 0;
  const inbox = special('\\Inbox');
  if (!force && (!inbox || inbox.path !== state.folder)) return 0;
  const groups = new Map(); // action key -> uids
  for (const m of messages) {
    const key = `${state.folder}/${m.uid}`;
    if (!force && (ruled.has(key) || m.flags.includes('\\Seen'))) continue;
    ruled.add(key);
    const rule = rules.find((r) => ruleMatches(r, m));
    if (!rule || (rule.action === 'move' && (!rule.folder || rule.folder === state.folder))) continue;
    const k = rule.action === 'move' ? `move:${rule.folder}` : rule.action;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(m.uid);
  }
  let count = 0;
  for (const [k, uids] of groups) {
    try {
      if (k === 'flag') await toggleFlagTo(uids, '\\Flagged');
      else if (k === 'read') await toggleFlagTo(uids, '\\Seen');
      else if (k === 'delete') await deleteMessages(uids, { confirm: false });
      else await moveMessages(uids, k.slice(5));
      count += uids.length;
    } catch (e) { fail(e); }
  }
  if (count) Suite.shell.toast(t('mail.rulesApplied', count));
  render();
  return count;
}

async function toggleFlagTo(uids, flag) {
  await state.imap.setFlags(uids, true, [flag]);
  for (const m of state.messages.filter((x) => uids.includes(x.uid))) m.flags = [...new Set([...m.flags, flag])];
  if (flag === '\\Seen') refreshUnread();
}

// ---- templates (per account: { name, subject, text, html, mode }) ---------------------------------------------------------

function accountRecord(account) { return account && data.connections().find((a) => a.id === account.id); }

function saveTemplate() {
  const c = state.compose;
  const record = accountRecord(c.account);
  if (!record) { Suite.shell.toast(t('mail.noAccount'), 'error'); return; }
  const html = c.mode === 'html' && editorRef.el ? editorRef.el.innerHTML : '';
  const tpl = { name: c.subject || t('mail.noSubject'), subject: c.subject, text: c.mode === 'text' ? c.text : '', html, mode: c.mode };
  const templates = [...(record.templates || []).filter((x) => x.name !== tpl.name), tpl];
  data.saveConnection({ ...record, templates });
  if (state.account && state.account.id === record.id) state.account.templates = templates;
  Suite.shell.toast(t('mail.templateSaved', tpl.name));
}

function templatesOf() {
  const record = accountRecord(state.account || data.connections()[0]);
  return (record && record.templates) || [];
}

function newFromTemplate(tpl) {
  openCompose();
  const c = state.compose;
  Object.assign(c, { subject: tpl.subject || '', mode: tpl.mode || 'text', text: tpl.text || c.text, html: tpl.html || '' });
  editorRef.el = null;
  render();
}

async function moveMessages(uids, dest) {
  if (!uids.length || !dest) return;
  try {
    if (state.source === 'local') {
      for (const uid of uids) { const m = state.local.items.find((x) => x.uid === uid); await state.imap.append(dest, m.raw, ['\\Seen']); }
      Suite.shell.toast(t('mail.copied', uids.length, dest));
      refreshUnread();
      return;
    }
    if (dest === state.folder) return;
    await state.imap.move(uids, dest);
    removeFromList(uids);
    refreshUnread();
  } catch (e) { fail(e); }
  render();
}

function saveEml() {
  const m = state.message;
  if (!m) return;
  const name = `${(m.parsed.subject || 'message').replace(/[\\/:*?"<>|\r\n]+/g, '_').slice(0, 80)}.eml`;
  Suite.files.download(m.raw, name, 'message/rfc822');
}

// ---- local files (.eml, .mbox) ---------------------------------------------------------------------------------------------

async function openFiles(picked) {
  const items = [];
  let uid = 1;
  for (const { file } of picked) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const raws = /\.(mbox|mbx)$/i.test(file.name) || /^From /.test(new TextDecoder().decode(bytes.subarray(0, 5))) ? mime.splitMbox(bytes) : [bytes];
      for (const raw of raws) {
        const parsed = await mime.parseMessage(raw);
        items.push({ uid: uid++, seq: 0, flags: ['\\Seen'], size: raw.length, date: Date.parse(parsed.date) || file.lastModified, from: parsed.from || null, to: parsed.to || [], subject: parsed.subject || '', attachment: parsed.attachments.some((a) => a.disposition !== 'inline'), messageId: parsed.messageId || '', inReplyTo: parsed.inReplyTo || '', references: parsed.references || '', raw, parsed });
      }
    } catch (e) { Suite.shell.toast(t('mail.cannotOpen', file.name, e.message), 'error'); }
  }
  if (!items.length) return;
  items.sort((a, b) => b.date - a.date);
  state.local = { name: picked.length === 1 ? picked[0].file.name : t('mail.allFiles'), items };
  Object.assign(state, { source: 'local', search: '', sel: new Set(), current: null, message: null, view: 'list' });
  render();
  if (items.length === 1) openMessage(items[0].uid); // a single message is shown right away (on phones too; ← returns to the list)
}

async function pickFiles() {
  const picked = await Suite.files.open({ types: OPEN_TYPES, multiple: true }).catch(fail);
  if (picked) await openFiles(picked);
}

// ---- reading -------------------------------------------------------------------------------------------------------------------

const toDataUrl = (a) => `data:${a.mimeType};base64,${mime.base64(new Uint8Array(a.content), 0)}`;

/** Sanitized HTML document of a message: no scripts, forms or remote content; cid: images inline. */
function safeHtml(parsed) {
  let blocked = 0;
  const byCid = new Map(parsed.attachments.filter((a) => a.contentId).map((a) => [a.contentId.replace(/^<|>$/g, ''), a]));
  DOMPurify.removeAllHooks();
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    for (const attr of ['src', 'background', 'poster', 'srcset']) {
      const v = node.getAttribute && node.getAttribute(attr);
      if (!v) continue;
      if (/^cid:/i.test(v)) { const a = byCid.get(v.slice(4)); if (a) node.setAttribute(attr, toDataUrl(a)); else node.removeAttribute(attr); } else if (!/^data:/i.test(v)) { node.removeAttribute(attr); blocked++; }
    }
    if (node.tagName === 'A' && node.getAttribute('href')) { node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer'); }
    if (node.getAttribute && node.getAttribute('style') && /url\(/i.test(node.getAttribute('style'))) {
      node.setAttribute('style', node.getAttribute('style').replace(/url\(\s*['"]?(?!data:)[^)]*\)/gi, () => { blocked++; return 'none'; }));
    }
  });
  const body = DOMPurify.sanitize(parsed.html, { WHOLE_DOCUMENT: true, FORBID_TAGS: ['form', 'input', 'button', 'textarea', 'select', 'base', 'meta', 'link', 'iframe', 'object', 'embed'], ADD_ATTR: ['target'] });
  DOMPurify.removeAllHooks();
  const doc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:12px;font:14px/1.45 system-ui,sans-serif;color:#222;background:#fff;overflow-wrap:anywhere}img{max-width:100%;height:auto}pre{white-space:pre-wrap}</style></head>${body.replace(/^<html[^>]*>|<\/html>$/gi, '')}</html>`;
  return { doc, blocked };
}

function linkify(text) {
  const parts = [];
  const re = /\bhttps?:\/\/[^\s<>"')\]]+/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    parts.push(text.slice(last, m.index));
    parts.push(html`<a href=${m[0]} target="_blank" rel="noopener noreferrer">${m[0]}</a>`);
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

function TextBody({ text }) {
  const lines = (text || '').replace(/\r\n/g, '\n').split('\n');
  return html`<div class="mail-text" data-testid="body-text">${lines.map((l) => html`<div class=${/^\s*>/.test(l) ? 'quoted' : ''}>${l ? linkify(l) : ' '}</div>`)}</div>`;
}

/** Calendar invitation of a message (text/calendar part or .ics attachment). */
function invitationOf(parsed) {
  const part = parsed.attachments.find((a) => /^text\/calendar/i.test(a.mimeType) || /\.ics$/i.test(a.filename || ''));
  if (!part) return null;
  try {
    const text = new TextDecoder().decode(part.content);
    const cal = Suite.ical.parse(text);
    const ev = Suite.ical.events(cal)[0];
    if (!ev) return null;
    const method = ((Suite.ical.prop(cal, 'METHOD') || {}).value || part.method || '').toUpperCase();
    const organizer = Suite.ical.prop(ev.comp, 'ORGANIZER');
    return { cal, ev, text, method, organizer: organizer ? { name: organizer.params.CN || '', address: organizer.value.replace(/^mailto:/i, '') } : null };
  } catch (e) { return null; }
}

function eventTime(ev) {
  const s = Suite.ical.toInstant(ev.start), e = ev.end ? Suite.ical.toInstant(ev.end) : null;
  if (ev.start.date) return new Date(s).toLocaleDateString(locale(), { dateStyle: 'full' });
  const end = e ? new Date(e).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) : '';
  return `${new Date(s).toLocaleString(locale(), { dateStyle: 'full', timeStyle: 'short' })}${end ? ` – ${end}` : ''}`;
}

/** iCalendar REPLY to an invitation (RFC 5546) with the participation status of the account. */
export function invitationReply(cal, me, partstat) {
  const ev = cal.comps.find((c) => c.name === 'VEVENT');
  const keep = ['UID', 'SEQUENCE', 'DTSTART', 'DTEND', 'DURATION', 'SUMMARY', 'ORGANIZER', 'RECURRENCE-ID'];
  const props = ev.props.filter((p) => keep.includes(p.name));
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  props.push({ name: 'DTSTAMP', params: {}, value: now });
  const mine = ev.props.find((p) => p.name === 'ATTENDEE' && p.value.replace(/^mailto:/i, '').toLowerCase() === me.toLowerCase());
  const params = { ...(mine ? mine.params : {}), PARTSTAT: partstat };
  delete params.RSVP;
  props.push({ name: 'ATTENDEE', params, value: `mailto:${me}` });
  const zones = cal.comps.filter((c) => c.name === 'VTIMEZONE');
  return Suite.ical.serialize({
    name: 'VCALENDAR',
    props: [{ name: 'PRODID', params: {}, value: '-//Portable Web App Suite//Mail//EN' }, { name: 'VERSION', params: {}, value: '2.0' }, { name: 'METHOD', params: {}, value: 'REPLY' }],
    comps: [...zones, { name: 'VEVENT', props, comps: [] }],
  });
}

async function answerInvitation(inv, partstat) {
  try {
    const me = myAddress();
    if (!me || !inv.organizer) throw new Error(t('mail.noAccount'));
    const words = { ACCEPTED: t('mail.accept'), TENTATIVE: t('mail.tentative'), DECLINED: t('mail.decline') };
    const ics = invitationReply(inv.cal, me, partstat);
    const raw = mime.buildMessage({
      from: { name: state.account.displayName || '', address: me }, to: [inv.organizer], subject: `${words[partstat]}: ${inv.ev.summary}`,
      text: `${words[partstat]}: ${inv.ev.summary}\n${eventTime(inv.ev)}\n`, alternatives: [{ type: 'text/calendar; method=REPLY', text: ics }],
    });
    await smtpSend(raw, [inv.organizer.address]);
    Suite.shell.toast(t('mail.replySent', inv.organizer.address));
  } catch (e) { fail(e); }
}

function Invitation({ inv }) {
  const cancelled = inv.method === 'CANCEL' || /CANCELLED/i.test(inv.ev.status || '');
  return html`<section class="mail-invite" data-testid="invitation">
    <strong>📅 ${cancelled ? t('mail.cancelled') : t('mail.invitation')}: ${inv.ev.summary}</strong>
    <div><small>${t('mail.when')}:</small> <span data-testid="invite-when">${eventTime(inv.ev)}</span></div>
    ${inv.ev.location ? html`<div><small>${t('mail.where')}:</small> ${inv.ev.location}</div>` : null}
    ${inv.organizer ? html`<div><small>${t('mail.organizer')}:</small> ${mime.showAddress(inv.organizer)}</div>` : null}
    <div class="mail-buttons">
      ${inv.method === 'REQUEST' && state.account ? html`
        <button data-testid="invite-accept" onClick=${() => answerInvitation(inv, 'ACCEPTED')}>${t('mail.accept')}</button>
        <button class="secondary" data-testid="invite-tentative" onClick=${() => answerInvitation(inv, 'TENTATIVE')}>${t('mail.tentative')}</button>
        <button class="secondary outline" data-testid="invite-decline" onClick=${() => answerInvitation(inv, 'DECLINED')}>${t('mail.decline')}</button>` : null}
      <button class="secondary outline" data-testid="invite-ics" onClick=${() => Suite.files.download(new TextEncoder().encode(inv.text), `${(inv.ev.summary || 'event').replace(/[\\/:*?"<>|]+/g, '_')}.ics`, 'text/calendar')}>${t('mail.downloadIcs')}</button>
    </div>
  </section>`;
}

function Reader() {
  const m = state.message;
  if (!m || m.uid !== state.current) {
    return html`<section class="mail-reader empty" data-testid="reader"><p>${state.current != null ? html`<span aria-busy="true"></span>` : t('mail.noSelection')}</p></section>`;
  }
  const p = m.parsed;
  const shown = p.html && !state.showText ? safeHtml(p) : null;
  const files = p.attachments.filter((a) => !(a.contentId && a.disposition === 'inline' && p.html && /^image\//.test(a.mimeType)) && !/^text\/calendar/i.test(a.mimeType));
  const inv = invitationOf(p);
  const isDraft = state.source === 'imap' && special('\\Drafts') && special('\\Drafts').path === state.folder;
  const known = p.from && contacts().some((c) => c.emails.some((e) => e.toLowerCase() === p.from.address.toLowerCase()));
  return html`<section class="mail-reader" data-testid="reader">
    <header class="mail-head">
      <h2 data-testid="subject">${p.subject || t('mail.noSubject')}</h2>
      <div><small>${t('mail.from')}:</small> <span data-testid="from">${mime.showAddress(p.from)}</span>
        ${p.from && !known ? html` <button class="mail-link" title=${t('mail.addContact')} data-testid="add-contact" onClick=${() => addContact(p.from)}>＋👤</button>` : null}</div>
      ${p.to && p.to.length ? html`<div><small>${t('mail.to')}:</small> <span data-testid="to">${p.to.map(mime.showAddress).join(', ')}</span></div>` : null}
      ${p.cc && p.cc.length ? html`<div><small>${t('mail.cc')}:</small> ${p.cc.map(mime.showAddress).join(', ')}</div>` : null}
      <div><small>${t('mail.date')}:</small> ${fmtDate(Date.parse(p.date), true)}</div>
      ${state.source === 'unified' && messageAccount() ? html`<div><small>${t('mail.account')}:</small> <span data-testid="reader-account">${messageAccount().name || messageAccount().email}</span></div>` : null}
      <div class="mail-buttons">
        ${isDraft ? html`<button data-testid="edit-draft" onClick=${() => editDraft()}>${t('mail.editDraft')}</button>` : null}
        ${p.html ? html`<button class="secondary outline" data-testid="toggle-text" onClick=${() => { state.showText = !state.showText; render(); }}>${state.showText ? t('mail.showHtml') : t('mail.showText')}</button>` : null}
        <button class="secondary outline" data-testid="save-eml" onClick=${saveEml}>${t('mail.saveEml')}</button>
      </div>
    </header>
    ${inv ? html`<${Invitation} inv=${inv} />` : null}
    ${files.length ? html`<ul class="mail-files" data-testid="attachments">${files.map((a) => html`<li>
      <button class="secondary outline" data-testid="attachment" onClick=${() => Suite.files.download(new Uint8Array(a.content), a.filename || 'attachment', a.mimeType)}>📎 ${a.filename || 'attachment'} <small>${fmtSize(a.content.byteLength)}</small></button>
      <button class="secondary outline" title=${t('bridge.openWith')} aria-label=${t('bridge.openWith')} data-testid="attachment-open-with"
        onClick=${() => Suite.bridge.openWith(a.filename || 'attachment', { exclude: 'mail', type: a.mimeType, source: p.subject || t('app.title'), data: () => new Uint8Array(a.content) })}>↗</button></li>`)}</ul>` : null}
    ${shown ? html`
      ${shown.blocked ? html`<p class="mail-note" data-testid="remote-blocked">${t('mail.remoteBlocked')}</p>` : null}
      <iframe class="mail-html" data-testid="body-html" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" srcdoc=${shown.doc} title=${p.subject || ''}></iframe>`
      : html`<${TextBody} text=${p.text || (p.html ? htmlToText(p.html) : '')} />`}
  </section>`;
}

function htmlToText(source) {
  const doc = new DOMParser().parseFromString(DOMPurify.sanitize(source), 'text/html');
  doc.querySelectorAll('br').forEach((b) => b.replaceWith('\n'));
  doc.querySelectorAll('p, div, li, tr, h1, h2, h3, h4, blockquote').forEach((b) => b.append('\n'));
  return doc.body.textContent.replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

// ---- contacts ----------------------------------------------------------------------------------------------------------------------

function addContact(addr) {
  const name = addr.name || addr.address;
  setContacts([...contacts(), { id: crypto.randomUUID(), name, emails: [addr.address], phones: [], org: '', note: '', extra: [] }]);
  Suite.shell.toast(t('mail.contactAdded', name));
}

function suggestions(token) {
  const q = token.trim().toLowerCase();
  if (q.length < 1) return [];
  const out = [];
  for (const c of contacts()) for (const e of c.emails) if (c.name.toLowerCase().includes(q) || e.toLowerCase().includes(q)) out.push({ name: c.name, address: e });
  return out.slice(0, 8);
}

function ContactsDialog() {
  const b = state.book;
  if (!b) return null;
  const list = contacts().filter((c) => !b.filter || `${c.name} ${c.emails.join(' ')} ${c.org}`.toLowerCase().includes(b.filter.toLowerCase())).sort((x, y) => x.name.localeCompare(y.name));
  const close = () => { state.book = null; render(); };
  const e = b.editing;
  return html`<dialog open class="mail-book" data-testid="contacts"><article>
    <header><strong>${t('mail.contacts')}</strong><button class="secondary outline mail-close" data-testid="contacts-close" onClick=${close}>×</button></header>
    <small>${t('mail.contactsHint')}</small>
    <div class="mail-buttons">
      <input type="search" placeholder=${t('mail.search')} data-testid="contacts-filter" defaultValue=${b.filter} onInput=${(ev) => { b.filter = ev.target.value; render(); }} />
      <button class="secondary" data-testid="new-contact" onClick=${() => { b.editing = { id: null, name: '', emails: [], phones: [], org: '', note: '', extra: [] }; render(); }}>${t('mail.newContact')}</button>
      <button class="secondary outline" data-testid="import-vcf" onClick=${importVcf}>${t('mail.importVcf')}</button>
      <button class="secondary outline" data-testid="export-vcf" onClick=${() => Suite.files.download(new TextEncoder().encode(mime.buildVcards(list)), 'contacts.vcf', 'text/vcard')}>${t('mail.exportVcf')}</button>
    </div>
    ${e ? html`<form class="mail-contact-form" data-testid="contact-form" key=${e.id || 'new'} onSubmit=${(ev) => {
      ev.preventDefault();
      const f = ev.target.elements;
      const c = { ...e, name: f.name.value.trim(), emails: f.emails.value.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean), phones: f.phones.value.split('\n').map((x) => x.trim()).filter(Boolean), org: f.org.value.trim(), note: f.note.value };
      if (!c.name) c.name = c.emails[0] || '';
      if (c.id) setContacts(contacts().map((x) => (x.id === c.id ? c : x))); else setContacts([...contacts(), { ...c, id: crypto.randomUUID() }]);
      b.editing = null;
      render();
    }}>
      <label>${t('mail.name')}<input name="name" data-testid="contact-name" defaultValue=${e.name} /></label>
      <label>${t('mail.emails')}<textarea name="emails" rows="2" data-testid="contact-emails">${e.emails.join('\n')}</textarea></label>
      <label>${t('mail.phones')}<textarea name="phones" rows="2" data-testid="contact-phones">${e.phones.join('\n')}</textarea></label>
      <label>${t('mail.org')}<input name="org" defaultValue=${e.org} /></label>
      <label>${t('mail.note')}<textarea name="note" rows="2">${e.note}</textarea></label>
      <footer><button type="button" class="secondary" onClick=${() => { b.editing = null; render(); }}>${t('mail.cancel')}</button><button type="submit" data-testid="contact-save">${t('mail.save')}</button></footer>
    </form>` : null}
    <table class="mail-contacts"><tbody>${list.map((c) => html`<tr data-testid="contact">
      <td><a href="#" onClick=${(ev) => { ev.preventDefault(); b.editing = { ...c }; render(); }}>${c.name}</a><br /><small>${c.emails.join(', ')}</small></td>
      <td class="mail-actions">
        <button class="secondary outline" data-testid="contact-write" disabled=${!c.emails.length} onClick=${() => { state.book = null; openCompose({ to: [{ name: c.name, address: c.emails[0] }] }); }}>✉</button>
        <button class="secondary outline" data-testid="contact-delete" onClick=${async () => { if (await Suite.shell.confirm(t('mail.deleteContact', c.name))) { setContacts(contacts().filter((x) => x.id !== c.id)); } }}>×</button></td>
    </tr>`)}</tbody></table>
  </article></dialog>`;
}

async function importVcf() {
  const picked = await Suite.files.open({ types: [{ description: 'vCard', accept: { 'text/vcard': ['.vcf', '.vcard'] } }], multiple: true }).catch(fail);
  if (!picked) return;
  let n = 0;
  const list = contacts();
  for (const { file } of picked) {
    for (const c of mime.parseVcards(await file.text())) { list.push(c); n++; }
  }
  setContacts(list);
  Suite.shell.toast(t('mail.imported', n));
}

// ---- composing ----------------------------------------------------------------------------------------------------------------------

function quoteText(text) { return text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n').map((l) => `> ${l}`).join('\n'); }
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const textToHtml = (s) => escapeHtml(s).replace(/\n/g, '<br>');
const signatureOf = (account) => (account && account.signature ? `\n\n-- \n${account.signature}` : '');

function openCompose(init = {}) {
  const account = init.account || state.account || data.connections()[0] || null;
  state.compose = {
    account, to: '', cc: '', bcc: '', subject: '', text: signatureOf(account), html: '', mode: 'text', attachments: [], showBcc: false,
    inReplyTo: '', references: '', answered: null, draft: null, sending: false, suggest: null,
    ...init,
    to: init.to ? init.to.map(mime.showAddress).join(', ') : '',
    cc: init.cc ? init.cc.map(mime.showAddress).join(', ') : '',
  };
  Suite.shell.setDirty(true);
  render();
}

/** The account a message belongs to: its account in the combined inbox, else the active one. */
function messageAccount() {
  if (state.source === 'unified' && state.message) {
    const m = state.messages.find((x) => x.uid === state.message.uid);
    const s = m && sessions.get(m.acc);
    if (s) return s.account;
  }
  return state.account;
}

function replyTo(all) {
  const m = state.message;
  if (!m) return;
  const p = m.parsed;
  const account = messageAccount();
  const me = (account ? account.email : '').toLowerCase();
  const target = p.replyTo && p.replyTo.length ? p.replyTo : p.from ? [p.from] : [];
  let to = [...target], cc = [];
  if (all) {
    to = [...to, ...(p.to || [])];
    cc = [...(p.cc || [])];
  }
  const seen = new Set();
  const unique = (list) => list.filter((a) => a && a.address && a.address.toLowerCase() !== me && !seen.has(a.address.toLowerCase()) && seen.add(a.address.toLowerCase()));
  to = unique(to);
  cc = unique(cc);
  if (!to.length && target.length) to = target;
  const body = p.text || (p.html ? htmlToText(p.html) : '');
  const head = t('mail.wrote', fmtDate(Date.parse(p.date), true), mime.showAddress(p.from));
  openCompose({
    to, cc, subject: /^(re|aw):/i.test(p.subject || '') ? p.subject : `Re: ${p.subject || ''}`,
    account, text: `\n\n${head}\n${quoteText(body)}\n${signatureOf(account)}`,
    inReplyTo: p.messageId || '', references: [p.references, p.messageId].filter(Boolean).join(' '),
    answered: state.source === 'imap' ? { folder: state.folder, uid: m.uid } : state.source === 'unified' ? { unified: m.uid } : null,
  });
}

function forward() {
  const m = state.message;
  if (!m) return;
  const p = m.parsed;
  const lines = [t('mail.forwarded'), `${t('mail.subject')}: ${p.subject || ''}`, `${t('mail.date')}: ${fmtDate(Date.parse(p.date), true)}`, `${t('mail.from')}: ${mime.showAddress(p.from)}`, `${t('mail.to')}: ${(p.to || []).map(mime.showAddress).join(', ')}`];
  const account = messageAccount();
  openCompose({
    account, subject: /^(fwd?|wg):/i.test(p.subject || '') ? p.subject : `Fwd: ${p.subject || ''}`,
    text: `\n\n${lines.join('\n')}\n\n${p.text || (p.html ? htmlToText(p.html) : '')}${signatureOf(account)}`,
    attachments: p.attachments.filter((a) => a.disposition !== 'inline' || !a.contentId).map((a) => ({ name: a.filename || 'attachment', type: a.mimeType, bytes: new Uint8Array(a.content) })),
  });
}

async function editDraft() {
  const m = state.message;
  if (!m) return;
  const p = m.parsed;
  openCompose({
    to: p.to || [], cc: p.cc || [], subject: p.subject || '', draft: { folder: state.folder, uid: m.uid },
    attachments: p.attachments.filter((a) => a.disposition !== 'inline' || !a.contentId).map((a) => ({ name: a.filename || 'attachment', type: a.mimeType, bytes: new Uint8Array(a.content) })),
    inReplyTo: p.inReplyTo || '', references: p.references || '',
  });
  const c = state.compose;
  if (p.bcc && p.bcc.length) { c.bcc = p.bcc.map(mime.showAddress).join(', '); c.showBcc = true; }
  if (p.html) { c.mode = 'html'; c.html = DOMPurify.sanitize(p.html); } else c.text = p.text || '';
}

const editorRef = { el: null };

function composeBody(c) {
  if (c.mode === 'html') {
    const htmlBody = editorRef.el ? editorRef.el.innerHTML : c.html;
    return { html: `<!doctype html><html><body>${htmlBody}</body></html>`, text: htmlToText(htmlBody) };
  }
  return { text: c.text };
}

function buildFromCompose(c, { keepBcc = false } = {}) {
  const fields = {};
  for (const k of ['to', 'cc', 'bcc']) {
    fields[k] = mime.parseAddresses(c[k]);
    const bad = fields[k].find((a) => !mime.validAddress(a.address));
    if (bad) throw new Error(t('mail.badAddress', bad.address || mime.showAddress(bad)));
  }
  const from = c.account ? { name: c.account.displayName || '', address: c.account.email } : null;
  const raw = mime.buildMessage({ from, ...fields, subject: c.subject, ...composeBody(c), attachments: c.attachments, inReplyTo: c.inReplyTo, references: c.references, headers: [['User-Agent', 'Portable Web App Suite Mail']] }, { keepBcc });
  return { raw, recipients: [...fields.to, ...fields.cc, ...fields.bcc].map((a) => a.address) };
}

async function smtpSend(raw, recipients, account = state.account) {
  if (!account || !data.relayConfigured()) throw new Error(t('mail.noAccount'));
  const password = account.password || state.passwords[account.id] || '';
  const smtpUser = account.smtpSame !== false ? account.username || account.email : account.smtpUsername;
  const smtpPassword = account.smtpSame !== false ? password : account.smtpPassword || state.passwords[`${account.id}:smtp`] || password;
  return sendMail({
    relay: data.relayConfig(), host: account.smtpHost, port: account.smtpPort, security: account.smtpSecurity, insecure: !!account.insecure,
    user: smtpUser, password: smtpPassword, from: account.email, recipients, message: raw, helo: 'suite.local',
  });
}

async function send() {
  const c = state.compose;
  try {
    const { raw, recipients } = buildFromCompose(c);
    if (!recipients.length) throw new Error(t('mail.noRecipients'));
    c.sending = true;
    render();
    const result = await smtpSend(raw, recipients, c.account);
    if (result.refused.length) Suite.shell.toast(t('mail.refused', result.refused.join('; ')), 'warning');
    const own = c.account && sessions.get(c.account.id);
    if (own && (!state.account || own.account.id !== state.account.id || state.source === 'unified')) {
      // sent from another connected account (e.g. a reply in the combined inbox): its own Sent folder
      const sent = own.folders.find((f) => f.special === '\\Sent');
      if (sent) await own.imap.append(sent.path, mime.toBytes(raw), ['\\Seen']).catch(fail);
      if (c.answered && c.answered.unified) {
        const target = await unifiedTarget(c.answered.unified).catch(() => null);
        if (target) { await target.s.imap.setFlags([target.uid], true, ['\\Answered']).catch(() => {}); target.m.flags = [...target.m.flags, '\\Answered']; }
      }
    } else if (state.imap && c.account && state.account && c.account.id === state.account.id) {
      const sent = special('\\Sent');
      if (sent) await state.imap.append(sent.path, mime.toBytes(raw), ['\\Seen']).catch(fail);
      if (c.answered && c.answered.folder === state.folder) {
        await state.imap.setFlags([c.answered.uid], true, ['\\Answered']).catch(() => {});
        const s = state.messages.find((x) => x.uid === c.answered.uid);
        if (s) s.flags = [...s.flags, '\\Answered'];
      }
      await removeDraft(c);
    }
    closeCompose();
    Suite.shell.toast(t('mail.sent'));
  } catch (e) { c.sending = false; fail(e); render(); }
}

async function removeDraft(c) {
  if (!c.draft || !state.imap) return;
  try {
    if (state.folder === c.draft.folder) { await state.imap.expunge([c.draft.uid]); removeFromList([c.draft.uid]); }
  } catch (e) { console.warn(e); }
}

async function saveDraft() {
  const c = state.compose;
  try {
    const { raw } = buildFromCompose(c, { keepBcc: true });
    const drafts = state.imap && special('\\Drafts');
    if (!drafts) { saveComposeEml(); return; }
    await state.imap.append(drafts.path, mime.toBytes(raw), ['\\Draft', '\\Seen']);
    await removeDraft(c);
    closeCompose();
    Suite.shell.toast(t('mail.draftSaved', folderLabel(drafts)));
    if (state.folder === drafts.path) await openFolder(drafts.path);
  } catch (e) { fail(e); }
}

function saveComposeEml() {
  const c = state.compose;
  try {
    const { raw } = buildFromCompose(c, { keepBcc: true });
    Suite.files.download(mime.toBytes(raw), `${(c.subject || 'message').replace(/[\\/:*?"<>|]+/g, '_')}.eml`, 'message/rfc822');
  } catch (e) { fail(e); }
}

function closeCompose() { state.compose = null; editorRef.el = null; Suite.shell.setDirty(false); render(); }

async function discardCompose() {
  const c = state.compose;
  const empty = !c.to && !c.subject && !c.attachments.length && (c.mode === 'text' ? c.text === signatureOf(c.account) : !(editorRef.el && editorRef.el.textContent.trim()));
  if (!empty && !(await Suite.shell.confirm(t('mail.discardConfirm')))) return;
  closeCompose();
}

function addAttachments(files) {
  const c = state.compose;
  Promise.all([...files].map(async (f) => ({ name: f.name, type: f.type || 'application/octet-stream', bytes: new Uint8Array(await f.arrayBuffer()) })))
    .then((list) => { c.attachments.push(...list); render(); }).catch(fail);
}

function pickAttachments() {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.style.display = 'none';
  input.onchange = () => { const files = [...input.files]; input.remove(); if (files.length) addAttachments(files); };
  document.body.appendChild(input);
  input.click();
}

function AddressField({ field, label }) {
  const c = state.compose;
  const sug = c.suggest && c.suggest.field === field ? c.suggest.items : [];
  const lastToken = (v) => v.split(/[,;]/).pop();
  const choose = (a) => {
    const parts = c[field].split(/([,;])/);
    parts[parts.length - 1] = ` ${mime.showAddress(a)}`;
    c[field] = `${parts.join('').replace(/^\s+/, '')}, `;
    c.suggest = null;
    const input = document.querySelector(`[data-testid=compose-${field}]`);
    if (input) { input.value = c[field]; input.focus(); }
    render();
  };
  return html`<label class="mail-field"><span>${label}</span>
    <span class="mail-suggest-wrap">
      <input data-testid=${`compose-${field}`} defaultValue=${c[field]} autocomplete="off"
        onInput=${(e) => { c[field] = e.target.value; const items = suggestions(lastToken(e.target.value)); c.suggest = items.length ? { field, items, active: 0 } : null; render(); }}
        onKeyDown=${(e) => {
          if (!sug.length) return;
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); c.suggest.active = (c.suggest.active + (e.key === 'ArrowDown' ? 1 : sug.length - 1)) % sug.length; render(); }
          if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(sug[c.suggest.active]); }
          if (e.key === 'Escape') { c.suggest = null; render(); }
        }}
        onBlur=${() => setTimeout(() => { if (c.suggest && c.suggest.field === field) { c.suggest = null; render(); } }, 200)} />
      ${sug.length ? html`<ul class="mail-suggest" data-testid="suggestions">${sug.map((a, i) => html`<li class=${i === c.suggest.active ? 'active' : ''} data-testid="suggestion" onMouseDown=${(e) => { e.preventDefault(); choose(a); }}>${mime.showAddress(a)}</li>`)}</ul>` : null}
    </span></label>`;
}

function HtmlEditor() {
  const c = state.compose;
  const exec = (cmd, value = null) => { document.execCommand(cmd, false, value); if (editorRef.el) editorRef.el.focus(); };
  return html`<div class="mail-editor-wrap">
    <div class="mail-format" role="toolbar">
      <button type="button" class="secondary outline" title="Bold" data-testid="fmt-bold" onMouseDown=${(e) => { e.preventDefault(); exec('bold'); }}><b>B</b></button>
      <button type="button" class="secondary outline" title="Italic" onMouseDown=${(e) => { e.preventDefault(); exec('italic'); }}><i>I</i></button>
      <button type="button" class="secondary outline" title="Underline" onMouseDown=${(e) => { e.preventDefault(); exec('underline'); }}><u>U</u></button>
      <button type="button" class="secondary outline" title="List" onMouseDown=${(e) => { e.preventDefault(); exec('insertUnorderedList'); }}>••</button>
      <button type="button" class="secondary outline" title="Numbered list" onMouseDown=${(e) => { e.preventDefault(); exec('insertOrderedList'); }}>1.</button>
      <button type="button" class="secondary outline" title="Quote" onMouseDown=${(e) => { e.preventDefault(); exec('formatBlock', 'blockquote'); }}>❝</button>
      <button type="button" class="secondary outline" title=${t('mail.link')} onMouseDown=${(e) => { e.preventDefault(); const url = prompt(t('mail.link'), 'https://'); if (url) exec('createLink', url); }}>🔗</button>
      <button type="button" class="secondary outline" title="Clear formatting" onMouseDown=${(e) => { e.preventDefault(); exec('removeFormat'); }}>⌫</button>
    </div>
    <div class="mail-editor" contenteditable="true" data-testid="compose-html"
      ref=${(el) => { if (el && editorRef.el !== el) { editorRef.el = el; el.innerHTML = c.html; } }}
      onPaste=${(e) => {
        const files = [...(e.clipboardData && e.clipboardData.files) || []].filter((f) => f.type.startsWith('image/'));
        if (!files.length) return;
        e.preventDefault();
        for (const f of files) { const r = new FileReader(); r.onload = () => exec('insertImage', r.result); r.readAsDataURL(f); }
      }}></div>
  </div>`;
}

function setMode(html) {
  const c = state.compose;
  if (html && c.mode === 'text') { c.html = textToHtml(c.text); c.mode = 'html'; editorRef.el = null; render(); return; }
  if (!html && c.mode === 'html') {
    Suite.shell.confirm(t('mail.textOnly')).then((ok) => {
      if (!ok) { render(); return; }
      c.text = htmlToText(editorRef.el ? editorRef.el.innerHTML : c.html);
      c.mode = 'text';
      editorRef.el = null;
      render();
    });
  }
}

function Compose() {
  const c = state.compose;
  if (!c) return null;
  const accounts = data.connections();
  return html`<section class="mail-compose pico" data-testid="compose"
      onDragOver=${(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
      onDrop=${(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); e.stopPropagation(); addAttachments(e.dataTransfer.files); } }}>
    <header class="mail-compose-head"><strong>${c.subject || t('mail.new')}</strong>
      <button class="secondary outline mail-close" title=${t('mail.close')} data-testid="compose-close" onClick=${discardCompose}>×</button></header>
    <div class="mail-compose-fields">
      <label class="mail-field"><span>${t('mail.from')}</span>
        ${accounts.length ? html`<select data-testid="compose-from" onChange=${(e) => { c.account = accounts.find((a) => a.id === e.target.value) || null; render(); }}>
          ${accounts.map((a) => html`<option value=${a.id} selected=${c.account && c.account.id === a.id}>${mime.showAddress({ name: a.displayName, address: a.email })}</option>`)}</select>`
          : html`<input disabled value=${t('mail.noAccount')} />`}</label>
      <${AddressField} field="to" label=${t('mail.to')} />
      <${AddressField} field="cc" label=${t('mail.cc')} />
      ${c.showBcc ? html`<${AddressField} field="bcc" label=${t('mail.bcc')} />` : html`<button type="button" class="mail-link" data-testid="show-bcc" onClick=${() => { c.showBcc = true; render(); }}>${t('mail.bcc')}</button>`}
      <label class="mail-field"><span>${t('mail.subject')}</span><input data-testid="compose-subject" data-spell defaultValue=${c.subject} onInput=${(e) => { c.subject = e.target.value; }} /></label>
    </div>
    <div class="mail-buttons mail-compose-opts">
      <label><input type="checkbox" role="switch" data-testid="compose-mode" checked=${c.mode === 'html'} onChange=${(e) => setMode(e.target.checked)} /> ${t('mail.html')}</label>
      <button type="button" class="secondary outline" data-testid="compose-attach" onClick=${pickAttachments}>📎 ${t('mail.attach')}</button>
    </div>
    ${c.attachments.length ? html`<ul class="mail-files" data-testid="compose-attachments">${c.attachments.map((a, i) => html`<li><span>📎 ${a.name} <small>${fmtSize(a.bytes.length)}</small></span>
      <button class="secondary outline" title=${t('bridge.openWith')} aria-label=${t('bridge.openWith')} data-testid="compose-attachment-open-with"
        onClick=${() => Suite.bridge.openWith(a.name, { exclude: 'mail', type: a.type, source: c.subject || t('app.title'), data: () => a.bytes, save: async (bytes) => { a.bytes = bytes; render(); } })}>↗</button>
      <button class="secondary outline" title=${t('mail.delete')} onClick=${() => { c.attachments.splice(i, 1); render(); }}>×</button></li>`)}</ul>` : null}
    ${c.mode === 'html' ? html`<${HtmlEditor} />` : html`<textarea class="mail-textarea" data-testid="compose-text" key="text" onInput=${(e) => { c.text = e.target.value; }} ref=${(el) => { if (el && !el.dataset.init) { el.dataset.init = '1'; el.value = c.text; } }}></textarea>`}
    <footer class="mail-buttons">
      <button data-testid="compose-send" aria-busy=${c.sending} disabled=${c.sending} onClick=${send}>${t('mail.send')}</button>
      <button class="secondary" data-testid="compose-draft" onClick=${saveDraft}>${t('mail.saveDraft')}</button>
      <button class="secondary outline" data-testid="compose-eml" onClick=${saveComposeEml}>${t('mail.saveEml')}</button>
      <button class="secondary outline" data-testid="compose-template" disabled=${!c.account} onClick=${saveTemplate}>${t('mail.saveTemplate')}</button>
      <button class="secondary outline" data-testid="compose-discard" onClick=${discardCompose}>${t('mail.discard')}</button>
    </footer>
  </section>`;
}

// ---- dialogs -----------------------------------------------------------------------------------------------------------------------------

const PORTS = { imap: { tls: 993, starttls: 143, none: 143 }, smtp: { tls: 465, starttls: 587, none: 25 } };

function RulesEditor({ a }) {
  a.rules = a.rules || [];
  const folders = state.account && state.account.id === a.id ? state.folders.filter((f) => f.selectable).map((f) => f.path) : [];
  const upd = (i, k) => (e) => { a.rules[i] = { ...a.rules[i], [k]: e.target.value }; render(); };
  return html`<fieldset class="mail-rules" data-testid="rules"><legend>${t('mail.rules')}</legend>
    <small>${t('mail.rulesHint')}</small>
    ${a.rules.map((r, i) => html`<div class="mail-rule" data-testid="rule">
      <select data-testid="rule-field" onChange=${upd(i, 'field')}>${['from', 'to', 'subject'].map((f) => html`<option value=${f} selected=${r.field === f}>${t(`mail.rule${f[0].toUpperCase()}${f.slice(1)}`)}</option>`)}</select>
      <span>${t('mail.contains')}</span>
      <input data-testid="rule-contains" value=${r.contains || ''} onInput=${upd(i, 'contains')} />
      <select data-testid="rule-action" onChange=${upd(i, 'action')}>${['move', 'flag', 'read', 'delete'].map((x) => html`<option value=${x} selected=${r.action === x}>${t(`mail.rule${x[0].toUpperCase()}${x.slice(1)}`)}</option>`)}</select>
      ${r.action === 'move' ? (folders.length ? html`<select data-testid="rule-folder" onChange=${upd(i, 'folder')}><option value=""></option>${folders.map((f) => html`<option value=${f} selected=${r.folder === f}>${f}</option>`)}</select>`
        : html`<input data-testid="rule-folder" placeholder="Archive" value=${r.folder || ''} onInput=${upd(i, 'folder')} />`) : null}
      <button type="button" class="secondary outline" data-testid="rule-remove" onClick=${() => { a.rules.splice(i, 1); render(); }}>×</button>
    </div>`)}
    <button type="button" class="secondary outline" data-testid="add-rule" onClick=${() => { a.rules.push({ field: 'from', contains: '', action: 'move', folder: '' }); render(); }}>+ ${t('mail.addRule')}</button>
  </fieldset>`;
}

function AccountDialog() {
  const a = state.dialog.account;
  const set = (k) => (e) => {
    a[k] = e.target.type === 'number' ? Number(e.target.value) : e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    const form = e.target.form;
    if (k === 'imapSecurity') form.elements.imapPort.value = a.imapPort = PORTS.imap[a.imapSecurity];
    if (k === 'smtpSecurity') form.elements.smtpPort.value = a.smtpPort = PORTS.smtp[a.smtpSecurity];
    render();
  };
  // suggestions from the e-mail address for empty fields (written into the inputs directly: they are uncontrolled)
  const fillFromEmail = (e) => {
    const domain = a.email.split('@')[1];
    if (!domain) return;
    const f = e.target.form.elements;
    const fill = (k, v) => { if (!a[k]) f[k].value = a[k] = v; };
    fill('imapHost', `imap.${domain}`);
    fill('smtpHost', `smtp.${domain}`);
    fill('username', a.email);
    fill('name', a.email);
  };
  const save = (andConnect) => {
    const id = data.saveConnection(storedAccount(a));
    a.id = id;
    if (state.account && state.account.id === id) Object.assign(state.account, { rules: a.rules, templates: a.templates, signature: a.signature });
    if (!a.savePassword && a.password) state.passwords[id] = a.password;
    if (!a.savePassword && a.smtpPassword) state.passwords[`${id}:smtp`] = a.smtpPassword;
    state.dialog = null;
    render();
    if (andConnect) connect({ ...storedAccount(a), id, password: a.savePassword ? a.password : '' });
  };
  const sec = (k) => html`<select data-testid=${`acc-${k}-security`} onChange=${set(`${k}Security`)}>
    ${['tls', 'starttls', 'none'].map((s) => html`<option value=${s} selected=${a[`${k}Security`] === s}>${t(`mail.sec${s[0].toUpperCase()}${s.slice(1)}`)}</option>`)}</select>`;
  return html`<dialog open data-testid="account-dialog"><article class="mail-account">
    <form onSubmit=${(e) => { e.preventDefault(); save(e.submitter && e.submitter.dataset.connect === '1'); }}>
      <div class="grid">
        <label>${t('mail.email')}<input type="email" required data-testid="acc-email" defaultValue=${a.email} onInput=${set('email')} onBlur=${fillFromEmail} /></label>
        <label>${t('mail.displayName')}<input data-testid="acc-display" defaultValue=${a.displayName} onInput=${set('displayName')} /></label>
      </div>
      <div class="grid">
        <label>${t('mail.accountName')}<input data-testid="acc-name" name="name" defaultValue=${a.name} onInput=${set('name')} /></label>
        <label>${t('mail.user')}<input data-testid="acc-user" name="username" defaultValue=${a.username} autocomplete="username" onInput=${set('username')} /></label>
      </div>
      <label>${t('mail.password')}<input type="password" data-testid="acc-password" defaultValue=${a.password} autocomplete="current-password" onInput=${set('password')} /></label>
      <label><input type="checkbox" data-testid="acc-save-password" checked=${a.savePassword} onChange=${set('savePassword')} /> ${t('mail.savePassword')}</label>
      <fieldset><legend>${t('mail.imap')}</legend><div class="grid mail-server">
        <label>${t('mail.host')}<input required data-testid="acc-imap-host" name="imapHost" defaultValue=${a.imapHost} onInput=${set('imapHost')} /></label>
        <label>${t('mail.port')}<input type="number" data-testid="acc-imap-port" name="imapPort" defaultValue=${a.imapPort} onInput=${set('imapPort')} /></label>
        <label>${t('mail.security')}${sec('imap')}</label></div></fieldset>
      <fieldset><legend>${t('mail.smtp')}</legend><div class="grid mail-server">
        <label>${t('mail.host')}<input required data-testid="acc-smtp-host" name="smtpHost" defaultValue=${a.smtpHost} onInput=${set('smtpHost')} /></label>
        <label>${t('mail.port')}<input type="number" data-testid="acc-smtp-port" name="smtpPort" defaultValue=${a.smtpPort} onInput=${set('smtpPort')} /></label>
        <label>${t('mail.security')}${sec('smtp')}</label></div>
        <label><input type="checkbox" data-testid="acc-smtp-same" checked=${a.smtpSame} onChange=${set('smtpSame')} /> ${t('mail.smtpSame')}</label>
        ${a.smtpSame ? null : html`<div class="grid">
          <label>${t('mail.user')}<input data-testid="acc-smtp-user" defaultValue=${a.smtpUsername} onInput=${set('smtpUsername')} /></label>
          <label>${t('mail.password')}<input type="password" data-testid="acc-smtp-password" defaultValue=${a.smtpPassword} onInput=${set('smtpPassword')} /></label></div>`}
      </fieldset>
      <label><input type="checkbox" data-testid="acc-insecure" checked=${a.insecure} onChange=${set('insecure')} /> ${t('mail.insecure')}</label>
      <label>${t('mail.signature')}<textarea rows="2" data-testid="acc-signature" onInput=${set('signature')}>${a.signature}</textarea></label>
      <${RulesEditor} a=${a} />
      ${(a.templates || []).length ? html`<fieldset><legend>${t('mail.templates')}</legend><ul class="mail-templates">${a.templates.map((tpl, i) => html`<li>${tpl.name}
        <button type="button" class="secondary outline" data-testid="template-remove" onClick=${() => { a.templates = a.templates.filter((_, j) => j !== i); render(); }}>×</button></li>`)}</ul></fieldset>` : null}
      <footer>
        <button type="button" class="secondary" onClick=${() => { state.dialog = null; render(); }}>${t('mail.cancel')}</button>
        <button type="submit" class="secondary" data-testid="acc-save">${t('mail.save')}</button>
        <button type="submit" data-connect="1" data-testid="acc-connect">${t('mail.saveConnect')}</button>
      </footer>
    </form>
  </article></dialog>`;
}

function Dialogs() {
  const d = state.dialog;
  if (!d) return null;
  const close = () => { state.dialog = null; render(); };
  if (d.kind === 'account') return html`<${AccountDialog} />`;
  if (d.kind === 'password') {
    return html`<dialog open data-testid="password-dialog"><article><form onSubmit=${(e) => {
      e.preventDefault();
      state.passwords[d.account.id] = e.target.elements.password.value;
      state.dialog = null;
      connect(d.account);
    }}>
      <label>${t('mail.passwordFor', d.account.email || d.account.name)}<input type="password" name="password" data-testid="password-input" autofocus autocomplete="current-password" /></label>
      <footer><button type="button" class="secondary" onClick=${close}>${t('mail.cancel')}</button><button type="submit" data-testid="password-ok">${t('mail.ok')}</button></footer>
    </form></article></dialog>`;
  }
  if (d.kind === 'move') {
    return html`<dialog open data-testid="move-dialog"><article>
      <header><strong>${state.source === 'local' ? t('mail.copyTo') : t('mail.moveTo')}</strong></header>
      <ul class="mail-folder-pick">${state.folders.filter((f) => f.selectable && (state.source === 'local' || f.path !== state.folder)).map((f) => html`<li>
        <a href="#" data-testid="move-target" onClick=${(e) => { e.preventDefault(); state.dialog = null; moveMessages(d.uids, f.path); }}>${folderLabel(f)}</a></li>`)}</ul>
      <footer><button class="secondary" onClick=${close}>${t('mail.cancel')}</button></footer>
    </article></dialog>`;
  }
  if (d.kind === 'name') {
    return html`<dialog open data-testid="name-dialog"><article><form onSubmit=${async (e) => {
      e.preventDefault();
      const v = e.target.elements.name.value.trim();
      state.dialog = null;
      render();
      if (v) await d.run(v).catch(fail);
    }}>
      <label>${d.title}<input name="name" data-testid="name-input" defaultValue=${d.value || ''} autofocus /></label>
      <footer><button type="button" class="secondary" onClick=${close}>${t('mail.cancel')}</button><button type="submit" data-testid="name-ok">${t('mail.ok')}</button></footer>
    </form></article></dialog>`;
  }
  return null;
}

async function reloadFolders(select = state.folder) {
  const folders = await state.imap.list();
  const order = ['\\Inbox', '\\Drafts', '\\Sent', '\\Archive', '\\Junk', '\\Trash'];
  state.folders = folders.sort((a, b) => ((order.indexOf(a.special) + 1 || 99) - (order.indexOf(b.special) + 1 || 99)) || a.path.localeCompare(b.path));
  if (select !== state.folder) await openFolder(select);
  refreshUnread();
}

function folderAction(kind) {
  const f = state.folders.find((x) => x.path === state.folder);
  if (kind === 'new') { state.dialog = { kind: 'name', title: t('mail.folderName'), run: async (name) => { await state.imap.create(name); await reloadFolders(); } }; render(); return; }
  if (!f || f.special) return;
  if (kind === 'rename') { state.dialog = { kind: 'name', title: t('mail.renameFolder'), value: f.path, run: async (name) => { await state.imap.rename(f.path, name); await reloadFolders(name); } }; render(); return; }
  if (kind === 'delete') {
    Suite.shell.confirm(t('mail.deleteFolderConfirm', folderLabel(f))).then(async (ok) => {
      if (!ok) return;
      try { await state.imap.select('INBOX'); await state.imap.remove(f.path); await reloadFolders('INBOX'); } catch (e) { fail(e); }
    });
  }
}

// ---- layout ---------------------------------------------------------------------------------------------------------------------------------

function Sidebar() {
  const current = state.folders.find((x) => x.path === state.folder);
  return html`<aside class="mail-side" data-testid="sidebar">
    <div class="mail-side-head"><strong>${t('mail.accounts')}</strong>
      <button class="secondary outline" data-testid="add-account" onClick=${() => { state.dialog = { kind: 'account', account: newAccount() }; render(); }}>${t('mail.addAccount')}</button></div>
    ${sessions.size > 1 ? html`<ul class="mail-folders mail-unified"><li data-testid="all-inboxes" class=${state.source === 'unified' ? 'active' : ''}>
      <a href="#" onClick=${(e) => { e.preventDefault(); openUnified(); }}>📥 ${t('mail.allInboxes')}</a>
      ${[...sessions.values()].reduce((n, s) => n + (s.unread[inboxOf(s)] || 0), 0) ? html`<span class="mail-badge" data-testid="unread">${[...sessions.values()].reduce((n, s) => n + (s.unread[inboxOf(s)] || 0), 0)}</span>` : null}</li></ul>` : null}
    <ul class="mail-accounts">${data.connections().map((a) => html`<li data-testid="account" data-connected=${sessions.has(a.id) ? 'true' : 'false'} class=${`${state.account && state.account.id === a.id && state.source !== 'unified' ? 'active' : ''} ${sessions.has(a.id) ? 'connected' : ''}`}>
      <a href="#" onClick=${(e) => { e.preventDefault(); connect(a); }}>${state.connecting === a.id ? html`<span aria-busy="true"></span>` : sessions.has(a.id) ? '●' : '✉'} ${a.name || a.email}
        ${sessions.has(a.id) && sessions.get(a.id).unread[inboxOf(sessions.get(a.id))] ? html` <span class="mail-badge" data-testid="account-unread">${sessions.get(a.id).unread[inboxOf(sessions.get(a.id))]}</span>` : null}</a>
      ${sessions.has(a.id) ? html`<button class="secondary outline" title=${t('mail.disconnect')} data-testid="disconnect-account" onClick=${() => disconnect(a.id)}>⏏</button>` : null}
      <button class="secondary outline" title="✎" data-testid="edit-account" onClick=${() => { state.dialog = { kind: 'account', account: { ...newAccount(), ...a, rules: (a.rules || []).map((r) => ({ ...r })), templates: [...(a.templates || [])], savePassword: !!a.password } }; render(); }}>✎</button>
      <button class="secondary outline" data-testid="delete-account" onClick=${async () => { if (await Suite.shell.confirm(t('mail.deleteAccount', a.name || a.email))) { if (sessions.has(a.id)) await disconnect(a.id); data.deleteConnection(a.id); } }}>×</button></li>`)}</ul>
    ${state.imap ? html`
      <div class="mail-side-head"><strong>${t('mail.folders')}${sessions.size > 1 ? html` <small data-testid="folders-account">${state.account.name || state.account.email}</small>` : null}</strong>
        <span>
          <button class="secondary outline" title=${t('mail.newFolder')} data-testid="folder-new" onClick=${() => folderAction('new')}>＋</button>
          ${current && !current.special ? html`<button class="secondary outline" title=${t('mail.renameFolder')} data-testid="folder-rename" onClick=${() => folderAction('rename')}>✎</button>
            <button class="secondary outline" title=${t('mail.deleteFolder')} data-testid="folder-delete" onClick=${() => folderAction('delete')}>×</button>` : null}
        </span></div>
      <ul class="mail-folders">${state.folders.map((f) => html`<li data-testid="folder" data-path=${f.path}
          class=${`${state.source === 'imap' && state.folder === f.path ? 'active' : ''} ${f.selectable ? '' : 'noselect'}`}
          style=${`padding-left:${0.5 + (f.path.split(f.delimiter).length - 1) * 0.8}rem`}
          onDragOver=${(e) => { if (f.selectable && e.dataTransfer.types.includes('application/x-mail-uids')) { e.preventDefault(); e.currentTarget.classList.add('drop'); } }}
          onDragLeave=${(e) => e.currentTarget.classList.remove('drop')}
          onDrop=${(e) => { e.preventDefault(); e.currentTarget.classList.remove('drop'); const uids = JSON.parse(e.dataTransfer.getData('application/x-mail-uids') || '[]'); moveMessages(uids, f.path); }}>
        <a href="#" onClick=${(e) => { e.preventDefault(); if (f.selectable) openFolder(f.path); }}>${folderLabel(f)}</a>
        ${state.unread[f.path] ? html`<span class="mail-badge" data-testid="unread">${state.unread[f.path]}</span>` : null}</li>`)}</ul>` : null}
    ${state.local ? html`<div class="mail-side-head"><strong>${t('mail.files')}</strong></div>
      <ul class="mail-folders"><li class=${state.source === 'local' ? 'active' : ''} data-testid="local-folder"><a href="#" onClick=${(e) => { e.preventDefault(); Object.assign(state, { source: 'local', sel: new Set(), current: null, message: null, view: 'list' }); render(); }}>📄 ${state.local.name}</a>
        <span class="mail-badge">${state.local.items.length}</span></li></ul>` : null}
    <${data.Bar} />
    <details><summary>${t('appdata.relay')}</summary><${data.RelayFields} /></details>
  </aside>`;
}

function MessageList() {
  const rows = listRows();
  const list = rows.map((r) => r.m);
  const sentLike = state.source === 'imap' && ['\\Sent', '\\Drafts'].includes((state.folders.find((f) => f.path === state.folder) || {}).special);
  const click = (e, m) => {
    if (e.ctrlKey || e.metaKey) { if (state.sel.has(m.uid)) state.sel.delete(m.uid); else state.sel.add(m.uid); if (state.current != null && !state.sel.size) state.sel.add(state.current); render(); return; }
    if (e.shiftKey && state.current != null) {
      const a = list.findIndex((x) => x.uid === state.current), b = list.findIndex((x) => x.uid === m.uid);
      state.sel = new Set(list.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.uid));
      render();
      return;
    }
    state.sel = new Set();
    openMessage(m.uid);
  };
  const connectedOrLocal = state.imap || state.source === 'local' || state.source === 'unified';
  return html`<section class="mail-list" data-testid="message-list">
    <form class="mail-search" role="search" onSubmit=${(e) => { e.preventDefault(); search(e.target.elements.q.value.trim()); }}>
      <button type="button" class=${`secondary ${state.threaded ? '' : 'outline'}`} data-testid="threads" aria-pressed=${state.threaded} title=${t('mail.threads')}
        onClick=${() => { state.threaded = !state.threaded; try { localStorage.setItem('suite.mail.threads', state.threaded ? '1' : '0'); } catch (e) { /* blocked */ } render(); }}>🧵</button>
      ${state.source === 'imap' && state.account && (state.account.rules || []).some((r) => r.contains) ? html`<button type="button" class="secondary outline" data-testid="apply-rules" title=${t('mail.applyRules')}
        onClick=${() => applyRules(listedMessages(), { force: true })}>⚙</button>` : null}
      <input type="search" name="q" placeholder=${t('mail.search')} data-testid="search" key=${`${state.source}${state.folder}`} defaultValue=${state.search}
        onInput=${(e) => { if (state.source === 'local') search(e.target.value); else if (!e.target.value && state.search) search(''); }} />
    </form>
    ${!connectedOrLocal ? html`<p class="mail-hint" data-testid="not-connected">${state.connecting ? t('mail.connecting') : t('mail.notConnected')}</p>`
      : state.searching ? html`<p aria-busy="true"></p>`
      : !list.length ? html`<p class="mail-hint">${t('mail.noMessages')}</p>` : null}
    <ul class="mail-rows">${rows.map(({ m, depth, thread, open }) => {
      const unread = !m.flags.includes('\\Seen');
      const head = thread && thread.count > 1 && depth === 0;
      const who = sentLike ? (m.to[0] ? (m.to[0].name || m.to[0].address) : '') : (m.from ? (m.from.name || m.from.address) : '');
      const acc = state.source === 'unified' ? sessions.get(m.acc) : null;
      return html`<li data-testid="message" data-uid=${m.uid} draggable=${state.source === 'imap' || (state.source === 'local' && !!state.imap)} data-depth=${depth}
          style=${depth ? `padding-left: ${0.6 + Math.min(depth, 5) * 1.1}rem` : ''}
          class=${`${unread || (head && !open && thread.unread) ? 'unread' : ''} ${state.current === m.uid ? 'current' : ''} ${state.sel.has(m.uid) ? 'selected' : ''} ${depth ? 'mail-reply' : ''}`}
          onClick=${(e) => click(e, m)}
          onDragStart=${(e) => { const uids = state.sel.has(m.uid) ? [...state.sel] : [m.uid]; e.dataTransfer.setData('application/x-mail-uids', JSON.stringify(uids)); }}>
        <span class="mail-who" data-testid="message-from">${acc ? html`<span class="mail-acc" data-testid="message-account" title=${acc.account.email}>${acc.account.name || acc.account.email}</span> ` : null}${who}</span>
        <span class="mail-date">${m.flags.includes('\\Flagged') ? html`<span class="mail-flag" data-testid="flagged">★</span>` : null}${m.flags.includes('\\Answered') ? '↩ ' : ''}${m.attachment ? '📎 ' : ''}${fmtDate(m.date)}</span>
        <span class="mail-subj" data-testid="message-subject">${head ? html`<button class="mail-thread-toggle" data-testid="thread-toggle" aria-expanded=${open}
            title=${t('mail.threadCount', thread.count)} onClick=${(e) => { e.stopPropagation(); if (state.expanded.has(thread.id)) state.expanded.delete(thread.id); else state.expanded.add(thread.id); if (open && thread.rows.some((r) => r.m.uid === state.current)) { state.current = null; state.message = null; } render(); }}>${open ? '▾' : '▸'} ${thread.count}</button> ` : null}${m.subject || t('mail.noSubject')}</span>
      </li>`;
    })}</ul>
    ${state.source === 'imap' && !state.search && state.loadedFrom > 1 ? html`<button class="secondary outline mail-more" data-testid="load-more" onClick=${loadMore}>${t('mail.loadMore')}</button>` : null}
  </section>`;
}

function Toolbar() {
  const has = state.current != null || state.sel.size > 0;
  const imap = (state.source === 'imap' && state.imap) || (state.source === 'unified' && sessions.size > 0);
  const canMove = state.imap && has && state.source !== 'unified';
  const cur = state.messages.find((m) => m.uid === state.current);
  return html`<nav class="mail-toolbar" role="toolbar">
    ${state.view !== 'folders' ? html`<button class="secondary outline mail-phone" data-testid="back" title=${t('mail.back')} onClick=${() => { state.view = state.view === 'message' ? 'list' : 'folders'; render(); }}>←</button>` : null}
    <button data-testid="new-message" onClick=${() => openCompose()}>✉ <span class="mail-label">${t('mail.new')}</span></button>
    ${templatesOf().length ? html`<select class="mail-templates-pick" data-testid="templates" title=${t('mail.newFromTemplate')}
      onChange=${(e) => { const tpl = templatesOf()[Number(e.target.value)]; e.target.value = ''; if (tpl) newFromTemplate(tpl); }}>
      <option value="">📋 ${t('mail.templates')}</option>${templatesOf().map((tpl, i) => html`<option value=${i}>${tpl.name}</option>`)}</select>` : null}
    <button class="secondary outline" data-testid="reply" disabled=${!state.message} onClick=${() => replyTo(false)} title=${t('mail.reply')}>↩ <span class="mail-label">${t('mail.reply')}</span></button>
    <button class="secondary outline" data-testid="reply-all" disabled=${!state.message} onClick=${() => replyTo(true)} title=${t('mail.replyAll')}>⇇ <span class="mail-label">${t('mail.replyAll')}</span></button>
    <button class="secondary outline" data-testid="forward" disabled=${!state.message} onClick=${forward} title=${t('mail.forward')}>↪ <span class="mail-label">${t('mail.forward')}</span></button>
    <button class="secondary outline" data-testid="delete" disabled=${!has} onClick=${() => deleteMessages()} title=${t('mail.delete')}>🗑 <span class="mail-label">${t('mail.delete')}</span></button>
    <button class="secondary outline" data-testid="toggle-read" disabled=${!has || !imap} onClick=${() => toggleFlag('\\Seen')} title=${cur && cur.flags.includes('\\Seen') ? t('mail.unread') : t('mail.read')}>✉̸</button>
    <button class="secondary outline" data-testid="toggle-flag" disabled=${!has || !imap} onClick=${() => toggleFlag('\\Flagged')} title=${t('mail.flag')}>★</button>
    <button class="secondary outline" data-testid="move" disabled=${!canMove} onClick=${() => { state.dialog = { kind: 'move', uids: selectedUids() }; render(); }} title=${t('mail.move')}>📁</button>
    <button class="secondary outline" data-testid="refresh" disabled=${!imap} onClick=${() => { if (state.source === 'unified') openUnified({ keep: true }); else { openFolder(state.folder); refreshUnread(); } }} title=${t('mail.refresh')}>⟳</button>
    <span class="mail-spacer"></span>
    <button class="secondary outline" data-testid="open-file" onClick=${pickFiles} title=${t('mail.openFile')}>📂 <span class="mail-label">${t('mail.openFile')}</span></button>
    <button class="secondary outline" data-testid="open-contacts" onClick=${() => { state.book = { filter: '', editing: null }; render(); }} title=${t('mail.contacts')}>👤 <span class="mail-label">${t('mail.contacts')}</span></button>
    <button class="secondary outline mail-phone" data-testid="toggle-panels" onClick=${() => { state.view = state.view === 'folders' ? 'list' : 'folders'; render(); }}>☰</button>
  </nav>`;
}

function Main() {
  return html`<div class=${`mail-layout view-${state.view} ${state.compose ? 'composing' : ''}`}>
    <${Sidebar} /><${MessageList} /><${Reader} /><${Compose} />
    <${Dialogs} /><${ContactsDialog} /><${data.Dialog} />
  </div>`;
}

Suite.shell.mount({ id: APP, title: 'app.title', version: '%%BUILD_VERSION%%', toolbar: () => html`<${Toolbar} />`, main: () => html`<${Main} />` });

Suite.files.dropZone(document.body, (picked) => {
  if (state.compose) { addAttachments(picked.map((p) => p.file)); return; }
  openFiles(picked);
});

document.addEventListener('keydown', (e) => {
  if (state.compose || state.dialog || state.book) return;
  if (e.target.closest('input, textarea, select, [contenteditable]')) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const list = visibleMessages();
  const idx = list.findIndex((m) => m.uid === state.current);
  const keys = {
    n: () => openCompose(), r: () => replyTo(false), a: () => replyTo(true), f: () => forward(), Delete: () => deleteMessages(),
    u: () => toggleFlag('\\Seen'), s: () => toggleFlag('\\Flagged'),
    ArrowDown: () => { const m = list[idx + 1]; if (m) openMessage(m.uid); }, j: () => keys.ArrowDown(),
    ArrowUp: () => { const m = list[idx - 1]; if (m) openMessage(m.uid); }, k: () => keys.ArrowUp(),
  };
  if (keys[e.key]) { e.preventDefault(); keys[e.key](); }
});

Suite.bridge.receive((picked) => openFiles([picked]), { app: 'mail' }); // files opened from other apps ("Open with…")

// for tests
window.MAIL = { state, data, mime, invitationReply, connect, disconnect, openUnified, sessions, get imap() { return state.imap; } };
document.body.dataset.ready = 'true';
