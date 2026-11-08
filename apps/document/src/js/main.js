/*
 * Document editor: Univer Docs (paginated text editing, styles, lists, tables, images, headers/footers) with DOCX
 * import (own direct reader, shared/js/docx-import.js) and export (shared/js/univer-docx.js), plain text files.
 */
import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets';
import { UniverDocsCorePreset } from '@univerjs/preset-docs-core';
import { UniverDocsDrawingPreset } from '@univerjs/preset-docs-drawing';
import drawingEnUS from '@univerjs/preset-docs-drawing/locales/en-US';
import drawingDeDE from '@univerjs/preset-docs-drawing/locales/de-DE';
import { UniverDocsHyperLinkPreset } from '@univerjs/preset-docs-hyper-link';
import linkEnUS from '@univerjs/preset-docs-hyper-link/locales/en-US';
import linkDeDE from '@univerjs/preset-docs-hyper-link/locales/de-DE';
import { UniverDocsThreadCommentPreset } from '@univerjs/preset-docs-thread-comment';
import commentEnUS from '@univerjs/preset-docs-thread-comment/locales/en-US';
import commentDeDE from '@univerjs/preset-docs-thread-comment/locales/de-DE';
import enUS from '@univerjs/preset-docs-core/locales/en-US';
import deDE from '@univerjs/preset-docs-core/locales/de-DE';
import { importDocx, exportDocx } from 'app/univer-docx';
import { readOdt, writeOdt } from 'app/odt';
import { insertToc, tocRange } from 'app/doc-toc';
import { toHtml } from 'app/doc-html';
import { toMarkdown } from 'app/doc-markdown';
import { createSpelling } from 'app/spelling';
import 'app/spell-dom'; // spelling selector in the header (shared with the other apps)
import { DocSelectionManagerService, RichTextEditingMutation, DocHistoryAction } from '@univerjs/docs';
import { JSONX, UserManagerService } from '@univerjs/core';
import { IDrawingManagerService } from '@univerjs/drawing';
import { CalendarIcon, HeaderFooterIcon } from '@univerjs/icons';
import '@univerjs/ui/facade'; // (createSubmenu, createMenu, registerComponent)
import { IFontService } from '@univerjs/ui';

const { html } = Suite.shell;
const t = Suite.t;
const APP = 'document';
const OPEN_TYPES = [{ description: 'Documents', accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx', '.dotx', '.docm', '.txt', '.md'], 'application/vnd.oasis.opendocument.text': ['.odt', '.ott'] } }];
const FORMATS = {
  docx: { label: 'Word (.docx)', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  odt: { label: 'OpenDocument (.odt)', mime: 'application/vnd.oasis.opendocument.text' },
  html: { label: 'Web page (.html)', mime: 'text/html' },
  md: { label: 'Markdown (.md)', mime: 'text/markdown' },
  txt: { label: 'Text (.txt)', mime: 'text/plain' },
};

Suite.i18n.register({
  en: {
    'doc.print': 'Print / PDF (Ctrl+P)', 'doc.htmlNote': 'A web page keeps texts, formatting, lists, tables and images, not the page layout.',
    'doc.diagram': 'Diagram', 'doc.diagramFailed': 'The diagram could not be inserted.', 'doc.diagramGone': 'The diagram is no longer in the document.',
    'doc.longWords': 'Very long words were given invisible break points so that they can be shown.',
    'doc.toc': 'Contents', 'doc.tocHint': 'Insert a table of contents at the cursor, or update it (from the headings)', 'doc.tocTitle': 'Contents',
    'doc.tocInserted': 'Table of contents with {0} headings inserted.', 'doc.tocUpdated': 'Table of contents updated ({0} headings).', 'doc.tocEmpty': 'The document has no headings (use the paragraph styles Heading 1–5).',
    'app.title': 'Document', 'doc.new': 'New', 'doc.open': 'Open', 'doc.save': 'Save', 'doc.saveAs': 'Save as', 'doc.fileName': 'File name', 'doc.format': 'Format',
    'doc.pageSetup': 'Page setup', 'doc.psLayout': 'Layout', 'doc.psPages': 'Pages', 'doc.psPageless': 'No pages (continuous text)', 'doc.psPaper': 'Paper size',
    'doc.psCustom': 'Custom', 'doc.psWidth': 'Width (cm)', 'doc.psHeight': 'Height (cm)', 'doc.psOrientation': 'Orientation', 'doc.psPortrait': 'Portrait',
    'doc.psLandscape': 'Landscape', 'doc.psMargins': 'Margins (cm)', 'doc.psTop': 'Top', 'doc.psBottom': 'Bottom', 'doc.psLeft': 'Left', 'doc.psRight': 'Right', 'doc.psOk': 'Apply',
    'doc.mdNote': 'Markdown keeps headings, bold, italic, strikethrough, links, lists, tables and images – not colours, fonts, alignment and the page layout.',
    'doc.dateNoCursor': 'Click into the text first (in a header or footer: Header & Footer → Date & time).',
    'doc.cancel': 'Cancel', 'doc.untitled': 'Document', 'doc.discard': 'Discard the unsaved changes?', 'doc.cannotOpen': '“{0}” cannot be opened: {1}',
    'doc.txtNote': 'A text file keeps only the text: formatting, tables and images are lost.', 'doc.importNotes': 'Some content was converted: {0}',
    'doc.docmNote': 'Macros cannot be kept: the document is saved as .docx.',
    'doc.comments': 'Comments', 'doc.commentsHint': 'Show or hide the comments (add one: select text, then Ctrl+Alt+M)', 'doc.authorTitle': 'Your name for comments',
    'doc.authorHint': 'Comments show who wrote them. The name is kept in this browser and can be changed in the settings (F1).', 'doc.authorOk': 'OK', 'doc.anonymous': 'Anonymous',
  },
  de: {
    'doc.print': 'Drucken / PDF (Strg+P)', 'doc.htmlNote': 'Eine Webseite behält Texte, Formatierung, Listen, Tabellen und Bilder, nicht das Seitenlayout.',
    'doc.diagram': 'Diagramm', 'doc.diagramFailed': 'Das Diagramm konnte nicht eingefügt werden.', 'doc.diagramGone': 'Das Diagramm ist nicht mehr im Dokument.',
    'doc.longWords': 'Sehr lange Wörter haben unsichtbare Umbruchstellen erhalten, damit sie angezeigt werden können.',
    'doc.toc': 'Inhalt', 'doc.tocHint': 'Inhaltsverzeichnis an der Schreibmarke einfügen oder aktualisieren (aus den Überschriften)', 'doc.tocTitle': 'Inhalt',
    'doc.tocInserted': 'Inhaltsverzeichnis mit {0} Überschriften eingefügt.', 'doc.tocUpdated': 'Inhaltsverzeichnis aktualisiert ({0} Überschriften).', 'doc.tocEmpty': 'Das Dokument hat keine Überschriften (Absatzformate Überschrift 1–5 verwenden).',
    'app.title': 'Textverarbeitung', 'doc.new': 'Neu', 'doc.open': 'Öffnen', 'doc.save': 'Speichern', 'doc.saveAs': 'Speichern unter', 'doc.fileName': 'Dateiname', 'doc.format': 'Format',
    'doc.pageSetup': 'Seite einrichten', 'doc.psLayout': 'Darstellung', 'doc.psPages': 'Seiten', 'doc.psPageless': 'Keine Seiten (fortlaufender Text)', 'doc.psPaper': 'Papierformat',
    'doc.psCustom': 'Benutzerdefiniert', 'doc.psWidth': 'Breite (cm)', 'doc.psHeight': 'Höhe (cm)', 'doc.psOrientation': 'Ausrichtung', 'doc.psPortrait': 'Hochformat',
    'doc.psLandscape': 'Querformat', 'doc.psMargins': 'Ränder (cm)', 'doc.psTop': 'Oben', 'doc.psBottom': 'Unten', 'doc.psLeft': 'Links', 'doc.psRight': 'Rechts', 'doc.psOk': 'Übernehmen',
    'doc.mdNote': 'Markdown behält Überschriften, fett, kursiv, durchgestrichen, Links, Listen, Tabellen und Bilder – nicht Farben, Schriften, Ausrichtung und das Seitenlayout.',
    'doc.comments': 'Kommentare', 'doc.commentsHint': 'Kommentare ein- oder ausblenden (neuer Kommentar: Text markieren, dann Strg+Alt+M)', 'doc.authorTitle': 'Ihr Name für Kommentare',
    'doc.authorHint': 'Kommentare zeigen, wer sie geschrieben hat. Der Name bleibt in diesem Browser und lässt sich in den Einstellungen (F1) ändern.', 'doc.authorOk': 'OK', 'doc.anonymous': 'Anonym',
    'doc.dateNoCursor': 'Klicken Sie zuerst in den Text (in einer Kopf- oder Fußzeile: Kopf- und Fußzeile → Datum und Uhrzeit).',
    'doc.cancel': 'Abbrechen', 'doc.untitled': 'Dokument', 'doc.discard': 'Die ungespeicherten Änderungen verwerfen?', 'doc.cannotOpen': '„{0}“ kann nicht geöffnet werden: {1}',
    'doc.txtNote': 'Eine Textdatei behält nur den Text: Formatierung, Tabellen und Bilder gehen verloren.', 'doc.importNotes': 'Einige Inhalte wurden umgewandelt: {0}',
    'doc.docmNote': 'Makros können nicht erhalten werden: Das Dokument wird als .docx gespeichert.',
  },
});

const state = { name: '', handle: null, format: 'docx', dirty: false, dialog: null, busy: false, pageSetup: null, author: null };
state.name = `${t('doc.untitled')}.docx`;

let queued = false;
function render() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; Suite.shell.refresh(); });
}
const fail = (e) => { console.warn(e); Suite.shell.toast(Suite.i18n.describe(e), 'error'); };

// ---- Univer --------------------------------------------------------------------------------------------------

const host = document.createElement('div');
host.className = 'doc-univer';
host.dataset.testid = 'document';
document.body.appendChild(host);
const dark = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
const locale = () => (Suite.i18n.language === 'de' ? LocaleType.DE_DE : LocaleType.EN_US);

// texts of the app's own ribbon menus (Univer's locales)
const HF_LOCALES = {
  en: { 'doc-hf': { menu: 'Header & footer', header: 'Edit header', footer: 'Edit footer' },
    'doc-date': { menu: 'Date & time', short: 'Date', long: 'Date (long)', iso: 'Date (ISO, 2026-01-31)', time: 'Time', both: 'Date and time' } },
  de: { 'doc-hf': { menu: 'Kopf- & Fußzeile', header: 'Kopfzeile bearbeiten', footer: 'Fußzeile bearbeiten' },
    'doc-date': { menu: 'Datum & Uhrzeit', short: 'Datum', long: 'Datum (lang)', iso: 'Datum (ISO, 2026-01-31)', time: 'Uhrzeit', both: 'Datum und Uhrzeit' } },
};

const { univerAPI } = createUniver({
  locale: locale(),
  locales: { [LocaleType.EN_US]: mergeLocales(enUS, drawingEnUS, linkEnUS, commentEnUS, HF_LOCALES.en), [LocaleType.DE_DE]: mergeLocales(deDE, drawingDeDE, linkDeDE, commentDeDE, HF_LOCALES.de) },
  darkMode: dark(),
  presets: [UniverDocsCorePreset({ container: host }), UniverDocsDrawingPreset(), UniverDocsHyperLinkPreset(), UniverDocsThreadCommentPreset()],
});
const blank = () => ({ documentStyle: { autoHyphenation: 0 } });

// ---- fonts (shared/js/fonts.js): the bundled and imported fonts in Univer's font menus ------------------------------------------
function syncFonts() {
  const service = univerAPI._injector.get(IFontService);
  for (const f of Suite.fonts ? Suite.fonts.families() : []) if (!service.getFontByValue(f.name)) service.addFont({ value: f.name, label: f.name });
}
syncFonts();
if (Suite.fonts) { Suite.fonts.onChange(syncFonts); Suite.fonts.ready.then(syncFonts); }
/** The font families of Univer data (text runs, styles) – for the fonts of a print frame. */
function fontsOf(data) {
  const names = new Set();
  JSON.stringify(data, (k, v) => { if (k === 'ff' && typeof v === 'string') names.add(v); return v; });
  return [...names];
}

/**
 * A ribbon dropdown of the app's own functions. The facade's submenus put their items into group nodes, which the ribbon's dropdown
 * does not show, and a dropdown runs the command with the item's id: the schema is merged in the shape of Univer's own menus (see
 * the spreadsheet's menu.js). Titles are keys of Univer's locales.
 */
function ribbonSubmenu({ id, title, icon, order, position, items }) {
  const menu = univerAPI.createSubmenu({ id, title, tooltip: title, icon });
  const schema = menu.__getSchema()[id];
  for (const key of Object.keys(schema)) if (key !== 'menuItemFactory') delete schema[key];
  schema.order = order;
  items.forEach(([itemId, itemTitle, action], index) => {
    const item = univerAPI.createMenu({ id: itemId, title: itemTitle, tooltip: itemTitle, action: itemId, order: index });
    if (!item._commandService.hasCommand(itemId)) item._commandService.registerCommand({ id: itemId, type: 0, handler: () => { action(); return true; } });
    Object.assign(schema, item.__getSchema());
  });
  menu._menuManagerService.mergeMenu({ [position]: { [id]: schema } });
}

// Insert → Header & footer (Univer's own entry is a double-click into the page margin)
univerAPI.registerComponent('DocHeaderFooterMenuIcon', HeaderFooterIcon);
ribbonSubmenu({
  id: 'doc-hf-menu', title: 'doc-hf.menu', icon: 'DocHeaderFooterMenuIcon', order: 10, position: 'ribbon.insert.others',
  items: [['header', 'HEADER'], ['footer', 'FOOTER']].map(([key, editArea]) => ['doc-hf-' + key, 'doc-hf.' + key, () => univerAPI.executeCommand('doc.command.open-header-footer-panel', { editArea })]),
});

// Insert → Date & time: today's date or the current time as text at the cursor, in the format of the browser's region (when its
// language is the app's language) or of the app's language
const dateLocale = () => {
  const lang = Suite.i18n.language === 'de' ? 'de' : 'en';
  return (navigator.language || '').toLowerCase().startsWith(lang) ? navigator.language : lang === 'de' ? 'de-DE' : 'en-US';
};
const pad = (n) => String(n).padStart(2, '0');
const DATE_FORMATS = {
  short: (d) => d.toLocaleDateString(dateLocale()),
  long: (d) => d.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' }),
  iso: (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
  time: (d) => d.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' }),
  both: (d) => `${d.toLocaleDateString(dateLocale())} ${d.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })}`,
};
function insertAtCursor(text) {
  const range = univerAPI._injector.get(DocSelectionManagerService).getActiveTextRange();
  if (!range || (range.segmentId && range.segmentId !== '')) { Suite.shell.toast(t('doc.dateNoCursor'), 'warning'); return; }
  const d = univerAPI.getActiveDocument();
  d.getTextRange(range.startOffset, range.endOffset).setText(text);
  d.setSelection(range.startOffset + text.length, range.startOffset + text.length);
}
univerAPI.registerComponent('DocDateMenuIcon', CalendarIcon);
ribbonSubmenu({
  id: 'doc-date-menu', title: 'doc-date.menu', icon: 'DocDateMenuIcon', order: 11, position: 'ribbon.insert.others',
  items: Object.keys(DATE_FORMATS).map((k) => ['doc-date-' + k, 'doc-date.' + k, () => insertAtCursor(DATE_FORMATS[k](new Date()))]),
});
let doc = univerAPI.createDocument(blank());
let loadedAt = performance.now(); // mutations count as edits only after user input that follows the latest load

// ---- comments (Univer's thread comments; files: shared/js/doc-comments.js) ------------------------------------------------
// The author of new comments is the name of the suite's setting "suite.author" (asked before the first comment); it is also the
// user id, so the comments of a file with the same author name can be edited and deleted.

const authorName = () => { try { return (localStorage.getItem('suite.author') || '').trim(); } catch (e) { return ''; } };
function avatar(name) {
  const initials = name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  let hue = 0;
  for (const ch of name) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="16" fill="hsl(${hue},45%,45%)"/><text x="16" y="21" font-family="Arial" font-size="13" fill="#fff" text-anchor="middle">${initials.replace(/[<&>]/g, '')}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
function applyAuthor() {
  const name = authorName() || t('doc.anonymous');
  univerAPI._injector.get(UserManagerService).setCurrentUser({ userID: name, name, avatar: avatar(name) });
}
applyAuthor();
window.addEventListener('suite-author', applyAuthor);
/** The authors of the comments of a document as Univer users (their names and avatars in the comments). */
function addAuthors(data) {
  const users = univerAPI._injector.get(UserManagerService);
  const res = (data.resources || []).find((r) => r.name === 'DOC_UNIVER_THREAD_COMMENT_PLUGIN');
  let threads = [];
  try { threads = Object.values(JSON.parse((res && res.data) || '{}')).flat(); } catch (e) { return; }
  for (const c of threads.flatMap((x) => [x, ...(x.children || [])])) {
    const name = c.authorName || c.personId;
    if (c.personId && !users.getUser(c.personId)) users.addUser({ userID: c.personId, name, avatar: avatar(name) });
  }
}
window.addEventListener('storage', (e) => { if (e.key === 'suite.author') applyAuthor(); });

const ADD_COMMENT = 'docs.operation.start-add-comment';
univerAPI.addEvent(univerAPI.Event.BeforeCommandExecute, (event) => {
  if (event.id !== ADD_COMMENT || authorName()) return;
  event.cancel = true; // asked once, then the comment is started
  state.author = { value: '' };
  render();
});
function AuthorDialog() {
  const a = state.author;
  if (!a) return null;
  const done = (e) => {
    e.preventDefault();
    const name = a.value.trim();
    if (!name) return;
    try { localStorage.setItem('suite.author', name); } catch (err) { /* storage blocked: this session only */ }
    state.author = null;
    applyAuthor();
    render();
    setTimeout(() => univerAPI.executeCommand(ADD_COMMENT), 0);
  };
  return html`<dialog open class="pico" data-testid="author-dialog"><article><form onSubmit=${done}>
    <header><strong>${t('doc.authorTitle')}</strong></header>
    <input data-testid="author-name" autofocus autocomplete="name" value=${a.value} onInput=${(e) => { a.value = e.target.value; }} />
    <small>${t('doc.authorHint')}</small>
    <footer><button type="button" class="secondary" onClick=${() => { state.author = null; render(); }}>${t('doc.cancel')}</button>
      <button type="submit" data-testid="author-ok">${t('doc.authorOk')}</button></footer>
  </form></article></dialog>`;
}

// a mutation shortly after user input makes the document dirty (Univer's own set-up mutations have no input before them)
const MUTATION = 2;
let lastInput = -Infinity;
for (const type of ['pointerdown', 'keydown', 'paste', 'cut', 'drop', 'beforeinput', 'compositionend']) host.addEventListener(type, () => { lastInput = performance.now(); }, true);
univerAPI.addEvent(univerAPI.Event.CommandExecuted, (event) => {
  if (event.type !== MUTATION || state.dirty || lastInput < loadedAt || performance.now() - lastInput > 3000) return;
  state.dirty = true;
  Suite.shell.setDirty(true);
  render();
});

new MutationObserver(() => univerAPI.toggleDarkMode(dark())).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => univerAPI.toggleDarkMode(dark()));
Suite.i18n.onChange(() => univerAPI.setLocale(locale()));

const LONG_WORD = 20000; // longer words get a break opportunity every BREAK_EVERY characters
const BREAK_EVERY = 1000;

/**
 * Univer's layout overflows the stack on a word of about 100 000 characters without a break opportunity (e.g. pasted
 * base64 data), and Firefox hangs on long ones. Words of more than LONG_WORD characters get an invisible break opportunity
 * (U+200B) every BREAK_EVERY characters; all positions of the
 * body (paragraphs, runs, tables, ranges: startIndex/endIndex/st/ed) are moved accordingly. The number of inserted marks.
 */
export function breakLongWords(data) {
  let added = 0;
  const fix = (body) => {
    if (!body || typeof body.dataStream !== 'string') return;
    const at = [];
    const re = new RegExp(`[^\\s\u200b\u0000-\u001f]{${LONG_WORD + 1},}`, 'g');
    for (let m; (m = re.exec(body.dataStream));) for (let i = BREAK_EVERY; i < m[0].length; i += BREAK_EVERY) at.push(m.index + i);
    if (!at.length) return;
    let stream = '';
    let from = 0;
    for (const p of at) { stream += `${body.dataStream.slice(from, p)}\u200b`; from = p; }
    body.dataStream = stream + body.dataStream.slice(from);
    const shift = (i) => { let n = 0; while (n < at.length && at[n] < i) n += 1; return i + n; };
    const walk = (v) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) {
          if ((k === 'startIndex' || k === 'endIndex' || k === 'st' || k === 'ed') && Number.isInteger(x)) v[k] = shift(x);
          else if (k !== 'dataStream') walk(x);
        }
      }
    };
    for (const [k, x] of Object.entries(body)) if (k !== 'dataStream') walk(x);
    added += at.length;
  };
  fix(data.body);
  for (const part of [data.headers, data.footers]) for (const h of Object.values(part || {})) fix(h.body);
  return added;
}

function load(data, name, handle = null, format = 'docx') {
  const previous = doc;
  if (breakLongWords(data)) Suite.shell.toast(t('doc.longWords'), 'warning');
  addAuthors(data);
  doc = univerAPI.createDocument(data);
  if (previous) univerAPI.disposeUnit(previous.getId());
  Object.assign(state, { name, handle, format, dirty: false });
  Suite.shell.setDirty(false);
  loadedAt = performance.now(); // Univer emits set-up mutations for a while after creating a unit: they are not edits
  render();
}

// ---- plain text ------------------------------------------------------------------------------------------------

/** Univer document data of plain text (one paragraph per line). */
export function fromText(text) {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  let stream = '';
  const paragraphs = [];
  for (const line of lines) {
    stream += line.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
    paragraphs.push({ startIndex: stream.length });
    stream += '\r';
  }
  return { ...blank(), body: { dataStream: `${stream}\n`, paragraphs, sectionBreaks: [{ startIndex: stream.length }], textRuns: [] } };
}

/** Plain text of a document (paragraph marks become line breaks, embedded objects and table markers are dropped). */
export function toText(data) {
  const s = (data.body && data.body.dataStream) || '';
  return s.replace(/\n$/, '').replace(/\r\n?$/, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/\r/g, '\n').replace(/\n?$/, '\n');
}

// recovery copies of unsaved work (shared/js/autosave.js): the Univer snapshot
Suite.autosave.register({
  app: APP,
  save: () => (state.dirty ? { name: state.name, handle: state.handle, format: state.format, data: JSON.parse(JSON.stringify(doc.save())) } : null),
  restore: (s) => { load(s.data, s.name, s.handle || null, s.format || 'docx'); state.dirty = true; Suite.shell.setDirty(true); render(); },
});

// ---- files ----------------------------------------------------------------------------------------------------

async function confirmDiscard() { return !state.dirty || Suite.shell.confirm(t('doc.discard')); }

async function openPicked({ file, handle }) {
  state.busy = true;
  render();
  try {
    if (/\.(txt|md|text)$/i.test(file.name)) {
      load(fromText(await file.text()), file.name, handle, 'txt');
    } else if (/\.(odt|ott)$/i.test(file.name)) {
      const { data, warnings } = readOdt(await file.arrayBuffer());
      const template = /\.ott$/i.test(file.name);
      load(data, template ? file.name.replace(/\.ott$/i, '.odt') : file.name, template ? null : handle, 'odt');
      if (warnings.length) console.info(t('doc.importNotes', warnings.join('; ')));
    } else {
      const { data, messages } = await importDocx(await file.arrayBuffer());
      const macro = /\.docm$/i.test(file.name);
      const template = /\.dotx$/i.test(file.name);
      load(data, macro || template ? file.name.replace(/\.\w+$/, '.docx') : file.name, macro || template ? null : handle, 'docx');
      if (macro) Suite.shell.toast(t('doc.docmNote'), 'warning');
      if (messages && messages.length) console.info(t('doc.importNotes', messages.join('; ')));
    }
    if (handle) Suite.files.remember(APP, handle);
  } catch (e) { console.warn(e); Suite.shell.toast(t('doc.cannotOpen', file.name, e.message), 'error'); } finally { state.busy = false; render(); }
}

async function open() {
  if (!(await confirmDiscard())) return;
  const picked = await Suite.files.open({ types: OPEN_TYPES }).catch(fail);
  if (picked) await openPicked(picked[0]);
}

async function newDocument() {
  if (!(await confirmDiscard())) return;
  load(blank(), `${t('doc.untitled')}.docx`);
}

/** The document as the bytes of a file in a format (docx, odt, md, txt, html). */
async function fileBytes(data, name, format) {
  return format === 'txt' ? new TextEncoder().encode(toText(data)) : format === 'md' ? new TextEncoder().encode(toMarkdown(data)) : format === 'odt' ? writeOdt(data)
    : format === 'html' ? new TextEncoder().encode(toHtml(data, { title: name.replace(/\.[^.]+$/, '') })) : exportDocx(data);
}

// the open file for "Create an archive from the open files" (about dialog): the document in its format (an empty new one is left out)
Suite.openFiles.register(async () => {
  const data = doc.save();
  if (!state.dirty && !toText(data).trim()) return [];
  return [{ name: state.name, bytes: await fileBytes(data, state.name, state.format), dirty: state.dirty }];
});

async function save({ as = false, name = state.name, format = state.format } = {}) {
  try {
    const data = doc.save();
    const bytes = await fileBytes(data, name, format);
    const info = FORMATS[format];
    const types = [{ description: info.label, accept: { [info.mime]: [`.${format}`] } }];
    const result = as || !state.handle ? await Suite.files.saveAs(bytes, { suggestedName: name, types, type: info.mime })
      : await Suite.files.save({ name, handle: state.handle }, bytes, { type: info.mime });
    if (!result) return;
    if (result.mode === 'downloaded') Suite.shell.banner(result.message); else Suite.shell.toast(result.message);
    if (format === 'txt') Suite.shell.toast(t('doc.txtNote'), 'warning');
    Object.assign(state, { name: result.name || name, handle: result.handle || state.handle, format, dirty: false });
    Suite.shell.setDirty(false);
    render();
  } catch (e) { fail(e); }
}

// ---- printing ------------------------------------------------------------------------------------------------

/** Print the document from an HTML rendering in a hidden frame; "Save as PDF" in the print dialog gives a PDF. */
function printDocument() {
  document.querySelectorAll('iframe.doc-print-frame').forEach((f) => f.remove());
  const frame = document.createElement('iframe');
  frame.className = 'doc-print-frame';
  frame.dataset.testid = 'print-frame';
  // (page margin boxes with page counters: Chromium; Firefox prints the page fields of headers and footers empty)
  const data = doc.save();
  const fonts = Suite.fonts ? Suite.fonts.cssFor(['Arial', ...fontsOf(data)]) : ''; // (a frame of its own: the fonts the document uses)
  frame.srcdoc = toHtml(data, { title: state.name.replace(/\.[^.]+$/, ''), print: true, pageCounters: !/firefox/i.test(navigator.userAgent) }).replace('</head>', `<style>${fonts}</style></head>`);
  frame.onload = () => {
    frame.contentWindow.addEventListener('afterprint', () => setTimeout(() => frame.remove(), 2000));
    setTimeout(() => frame.remove(), 120000);
    frame.contentWindow.print();
  };
  document.body.append(frame);
}

// ---- table of contents ---------------------------------------------------------------------------------------

/** Insert a table of contents at the cursor's paragraph, or update the existing one (from the headings). */
function tableOfContents() {
  let offset = 0;
  try { const range = univerAPI._injector.get(DocSelectionManagerService).getActiveTextRange(); if (range) offset = range.startOffset; } catch (e) { /* no cursor: at the start */ }
  const before = doc.save();
  const update = !!tocRange(before.body || {});
  const { data, count } = insertToc(before, offset, t('doc.tocTitle'));
  // the changed document is loaded as a new unit (a unit id cannot be used twice); its images belong to it
  data.id = `doc-${Math.random().toString(36).slice(2, 10)}`;
  for (const d of Object.values(data.drawings || {})) Object.assign(d, { unitId: data.id, subUnitId: data.id });
  data.resources = (data.resources || []).map((r) => (r.name === 'DOC_DRAWING_PLUGIN' ? { ...r, data: JSON.stringify({ data: data.drawings || {}, order: data.drawingsOrder || [] }) } : r));
  load(data, state.name, state.handle, state.format);
  state.dirty = true;
  Suite.shell.setDirty(true);
  render();
  Suite.shell.toast(count ? t(update ? 'doc.tocUpdated' : 'doc.tocInserted', count) : t('doc.tocEmpty'), count ? undefined : 'warning');
}

// ---- spelling ------------------------------------------------------------------------------------------------

const spelling = createSpelling({
  getBody: () => doc.save().body || { dataStream: '' },
  select(start, end) { try { univerAPI.getActiveDocument().setSelection(start, end); } catch (e) { console.warn(e); } },
  replace(ranges, text) { // from the end, so the earlier offsets stay valid
    const d = univerAPI.getActiveDocument();
    for (const [start, end] of [...ranges].sort((a, b) => b[0] - a[0])) d.getTextRange(start, end).setText(text);
  },
  changed() { state.dirty = true; Suite.shell.setDirty(true); render(); },
  render,
});

// ---- diagrams (shared/js/diagram-embed.js: a PNG with the draw.io diagram inside, edited in the diagram editor) ------

const drawingManager = () => univerAPI._injector.get(IDrawingManagerService);
drawingManager().focus$.subscribe(() => render()); // "Edit diagram" follows the selected image

function markChanged() { state.dirty = true; Suite.shell.setDirty(true); render(); }

/** The selected image if it carries a diagram: { id, src } or null. */
function focusedDiagram() {
  try {
    const [f] = drawingManager().getFocusDrawings() || [];
    const img = f && univerAPI.getActiveDocument().getImage(f.drawingId);
    const src = img && img.getSource();
    return src && Suite.diagrams.isDiagram(src) ? { id: f.drawingId, src } : null;
  } catch (e) { return null; }
}

/** Width of the text area of a page (an inserted diagram is not wider). */
function contentWidth() {
  const st = (doc.save().documentStyle) || {};
  const w = st.pageSize && st.pageSize.width ? st.pageSize.width - (st.marginLeft || 0) - (st.marginRight || 0) : 600;
  return Math.max(100, w);
}

/** A new picture for an image: the source and the size (same scale as before, at most the text width) as one undo step. */
function replaceImage(id, res) {
  const d = univerAPI.getActiveDocument();
  const drawing = (d.getDocumentDataModel().getSnapshot().drawings || {})[id];
  if (!drawing) return false;
  const path = ['drawings', id];
  const old = drawing.docTransform.size;
  const size = Suite.diagrams.newSize(drawing.source, old.width, res, contentWidth());
  const json = JSONX.getInstance();
  let actions = json.replaceOp([...path, 'source'], drawing.source, res.src);
  actions = JSONX.compose(actions, json.replaceOp([...path, 'docTransform', 'size'], old, size));
  if (drawing.transform) actions = JSONX.compose(actions, json.replaceOp([...path, 'transform'], drawing.transform, { ...drawing.transform, width: size.width, height: size.height }));
  univerAPI.syncExecuteCommand(RichTextEditingMutation.id, { unitId: d.getId(), actions, textRanges: null, historyAction: DocHistoryAction.UpdateImage });
  markChanged();
  return true;
}

function insertDiagram() {
  // where the cursor is now (the diagram editor takes the focus)
  let range = null;
  try { const r = univerAPI._injector.get(DocSelectionManagerService).getActiveTextRange(); if (r) range = { startOffset: r.startOffset, endOffset: r.startOffset, collapsed: true }; } catch (e) { /* no cursor */ }
  let id = null;
  Suite.diagrams.insert({
    onSave: async (res) => {
      if (id && replaceImage(id, res)) return;
      const k = Math.min(1, contentWidth() / res.width);
      const img = await univerAPI.getActiveDocument().insertImage({ source: res.src, imageSourceType: 'BASE64', width: Math.round(res.width * k), height: Math.round(res.height * k), ...(range ? { textRange: range } : {}) });
      if (!img) throw new Error(t('doc.diagramFailed'));
      id = img.getId();
      markChanged();
    },
  });
}

function editDiagram() {
  const f = focusedDiagram();
  if (f) Suite.diagrams.edit({ src: f.src, onSave: (res) => { if (!replaceImage(f.id, res)) throw new Error(t('doc.diagramGone')); } });
}

// ---- UI --------------------------------------------------------------------------------------------------------

const openSaveAs = () => { state.dialog = { stem: state.name.replace(/\.[^.]+$/, ''), format: state.format }; render(); };

// ---- page setup (replaces Univer's dialog: centimetres, orientation, pages or no pages) ----------------------------------------

const CM = 96 / 2.54; // px per cm (Univer measures in px at 96 dpi)
const PAPERS = { A3: [29.7, 42], A4: [21, 29.7], A5: [14.8, 21], Letter: [21.59, 27.94], Legal: [21.59, 35.56] }; // cm, portrait
const round2 = (v) => Math.round(v * 100) / 100;

function openPageSetup() {
  const ds = doc.save().documentStyle || {};
  const pages = ds.documentFlavor === 1 && !!(ds.pageSize && ds.pageSize.width);
  const w = pages ? ds.pageSize.width / CM : 21, h = pages ? ds.pageSize.height / CM : 29.7;
  const landscape = w > h;
  const [pw, ph] = landscape ? [h, w] : [w, h];
  const paper = Object.keys(PAPERS).find((k) => Math.abs(PAPERS[k][0] - pw) < 0.1 && Math.abs(PAPERS[k][1] - ph) < 0.1) || 'custom';
  const margin = (v, d) => String(round2((v ?? d * CM) / CM));
  state.pageSetup = {
    pages: pages || ds.documentFlavor !== 2, paper, width: String(round2(pw)), height: String(round2(ph)), landscape,
    top: margin(pages ? ds.marginTop : null, 2.5), bottom: margin(pages ? ds.marginBottom : null, 2), left: margin(pages ? ds.marginLeft : null, 2.5), right: margin(pages ? ds.marginRight : null, 2.5),
  };
  render();
}

async function applyPageSetup() {
  const d = state.pageSetup;
  const num = (v) => Math.max(0, Number(String(v).replace(',', '.')) || 0);
  let [w, h] = d.paper === 'custom' ? [num(d.width), num(d.height)] : PAPERS[d.paper];
  if (!(w > 0 && h > 0)) return;
  if (d.landscape !== w > h) [w, h] = [h, w];
  state.pageSetup = null;
  render();
  await univerAPI.executeCommand('docs.command.page-setup', {
    documentFlavor: d.pages ? 1 : 2, pageOrient: d.landscape ? 1 : 0, pageSize: { width: w * CM, height: h * CM },
    marginTop: num(d.top) * CM, marginBottom: num(d.bottom) * CM, marginLeft: num(d.left) * CM, marginRight: num(d.right) * CM,
  });
}

// Univer's page setup button (Start tab) opens this dialog
univerAPI.addEvent(univerAPI.Event.BeforeCommandExecute, (event) => {
  if (event.id === 'docs.operation.open-page-setting') { event.cancel = true; openPageSetup(); }
});

function PageSetupDialog() {
  const d = state.pageSetup;
  if (!d) return null;
  const set = (k) => (e) => { d[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; render(); };
  const field = (k, label) => html`<label>${t(label)}<input type="number" min="0" step="0.1" data-testid=${`ps-${k}`} value=${d[k]} onInput=${(e) => { d[k] = e.target.value; }} /></label>`;
  return html`<dialog open class="pico" data-testid="page-setup-dialog"><article class="doc-page-setup">
    <header><strong>${t('doc.pageSetup')}</strong></header>
    <form onSubmit=${(e) => { e.preventDefault(); applyPageSetup(); }}>
      <label>${t('doc.psLayout')}<select data-testid="ps-pages" onChange=${(e) => { d.pages = e.target.value === 'pages'; render(); }}>
        <option value="pages" selected=${d.pages}>${t('doc.psPages')}</option><option value="pageless" selected=${!d.pages}>${t('doc.psPageless')}</option></select></label>
      ${d.pages ? html`
        <div class="doc-ps-grid">
          <label>${t('doc.psPaper')}<select data-testid="ps-paper" onChange=${set('paper')}>
            ${Object.keys(PAPERS).map((k) => html`<option value=${k} selected=${d.paper === k}>${k}</option>`)}
            <option value="custom" selected=${d.paper === 'custom'}>${t('doc.psCustom')}</option></select></label>
          <label>${t('doc.psOrientation')}<select data-testid="ps-orientation" onChange=${(e) => { d.landscape = e.target.value === 'landscape'; render(); }}>
            <option value="portrait" selected=${!d.landscape}>${t('doc.psPortrait')}</option><option value="landscape" selected=${d.landscape}>${t('doc.psLandscape')}</option></select></label>
          ${d.paper === 'custom' ? html`${field('width', 'doc.psWidth')}${field('height', 'doc.psHeight')}` : null}
        </div>
        <fieldset><legend>${t('doc.psMargins')}</legend><div class="doc-ps-grid">
          ${field('top', 'doc.psTop')}${field('bottom', 'doc.psBottom')}${field('left', 'doc.psLeft')}${field('right', 'doc.psRight')}</div></fieldset>` : null}
      <footer><button type="button" class="secondary" onClick=${() => { state.pageSetup = null; render(); }}>${t('doc.cancel')}</button>
        <button type="submit" data-testid="ps-ok">${t('doc.psOk')}</button></footer>
    </form>
  </article></dialog>`;
}

function SaveAsDialog() {
  const d = state.dialog;
  if (!d) return null;
  return html`<dialog open class="pico" data-testid="save-as-dialog"><article>
    <form onSubmit=${(e) => { e.preventDefault(); state.dialog = null; render(); save({ as: true, name: `${d.stem}.${d.format}`, format: d.format }); }}>
      <label>${t('doc.fileName')}<input data-testid="save-as-name" defaultValue=${d.stem} onInput=${(e) => { d.stem = e.target.value; }} /></label>
      <label>${t('doc.format')}<select data-testid="save-as-format" onChange=${(e) => { d.format = e.target.value; render(); }}>
        ${Object.entries(FORMATS).map(([k, f]) => html`<option value=${k} selected=${d.format === k}>${f.label}</option>`)}</select></label>
      ${d.format === 'txt' ? html`<small>${t('doc.txtNote')}</small>` : null}
      ${d.format === 'html' ? html`<small>${t('doc.htmlNote')}</small>` : null}
      ${d.format === 'md' ? html`<small>${t('doc.mdNote')}</small>` : null}
      <footer><button type="button" class="secondary" onClick=${() => { state.dialog = null; render(); }}>${t('doc.cancel')}</button>
        <button type="submit" data-testid="save-as-ok">${t('doc.saveAs')}</button></footer>
    </form>
  </article></dialog>`;
}

function Toolbar() {
  return html`<nav class="doc-toolbar" role="toolbar">
    <button class="secondary" data-testid="new" onClick=${newDocument}>${t('doc.new')}</button>
    <button class="secondary" data-testid="open" onClick=${open} aria-busy=${state.busy}>${t('doc.open')}</button>
    <${Suite.shell.Recent} app=${APP} before=${confirmDiscard} onOpen=${(p) => openPicked(p)} />
    <button class=${state.dirty ? '' : 'secondary outline'} data-testid="save" onClick=${() => save()}>${t('doc.save')}</button>
    <button class="secondary outline" data-testid="save-as" onClick=${openSaveAs}>${t('doc.saveAs')}</button>
    <button class="secondary outline" data-testid="toc" title=${t('doc.tocHint')} onClick=${tableOfContents}>📑 ${t('doc.toc')}</button>
    <button class="secondary outline" data-testid="add-diagram" title=${t('dia.insert')} onClick=${insertDiagram}>📐 ${t('doc.diagram')}</button>
    ${focusedDiagram() ? html`<button class="secondary" data-testid="edit-diagram" onClick=${editDiagram}>📐 ${t('dia.edit')}</button>` : null}
    <button class=${spelling.open ? 'secondary' : 'secondary outline'} data-testid="spell" title=${`${t('spell.button')} (F7)`} aria-pressed=${spelling.open ? 'true' : 'false'} onClick=${spelling.toggle}>ABC✓</button>
    <button class="secondary outline" data-testid="comments" title=${t('doc.commentsHint')} onClick=${() => univerAPI.executeCommand('docs.operation.toggle-comment-panel')}>💬 ${t('doc.comments')}</button>
    <button class="secondary outline" data-testid="print" title=${t('doc.print')} aria-label=${t('doc.print')} onClick=${printDocument}>🖨</button>
    <span class="doc-name" data-testid="file-name">${state.name}${state.dirty ? ' •' : ''}</span>
  </nav>`;
}

function Main() {
  return html`<div class=${spelling.open ? 'doc-layout spell-open' : 'doc-layout'} ref=${(el) => { if (el && host.parentElement !== el) el.prepend(host); }}><${spelling.Panel} /><${SaveAsDialog} /><${PageSetupDialog} /><${AuthorDialog} /></div>`;
}

Suite.shell.mount({ id: APP, title: 'app.title', version: '%%BUILD_VERSION%%', toolbar: () => html`<${Toolbar} />`, main: () => html`<${Main} />` });
Suite.files.dropZone(document.body, async (picked) => { if (picked.length && await confirmDiscard()) await openPicked(picked[0]); });
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) openSaveAs(); else save(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); e.stopPropagation(); open(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); e.stopPropagation(); printDocument(); }
  if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'm') { e.preventDefault(); e.stopPropagation(); univerAPI.executeCommand(ADD_COMMENT); }
  if (e.key === 'F7' && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); spelling.toggle(); }
}, true);

Suite.bridge.receive((picked) => openPicked(picked), { app: 'document' }); // files opened from other apps ("Open with…")

// for tests
window.DOC = { fonts: () => univerAPI._injector.get(IFontService).getFonts(), univerAPI, state, openPageSetup, get doc() { return doc; }, insertDiagram, editDiagram, focusedDiagram, drawingManager, fromText, toText, load, tableOfContents, spelling, selection: DocSelectionManagerService };
document.body.dataset.ready = 'true';
