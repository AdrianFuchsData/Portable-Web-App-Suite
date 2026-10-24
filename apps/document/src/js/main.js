/*
 * Document editor: Univer Docs (paginated text editing, styles, lists, tables, images, headers/footers) with DOCX
 * import (own direct reader, shared/js/docx-import.js) and export (shared/js/univer-docx.js), plain text files.
 */
import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets';
import { UniverDocsCorePreset } from '@univerjs/preset-docs-core';
import { UniverDocsDrawingPreset } from '@univerjs/preset-docs-drawing';
import drawingEnUS from '@univerjs/preset-docs-drawing/locales/en-US';
import drawingDeDE from '@univerjs/preset-docs-drawing/locales/de-DE';
import enUS from '@univerjs/preset-docs-core/locales/en-US';
import deDE from '@univerjs/preset-docs-core/locales/de-DE';
import { importDocx, exportDocx } from 'app/univer-docx';
import { readOdt, writeOdt } from 'app/odt';
import { insertToc, tocRange } from 'app/doc-toc';
import { toHtml } from 'app/doc-html';
import { createSpelling } from 'app/spelling';
import 'app/spell-dom'; // spelling selector in the header (shared with the other apps)
import { DocSelectionManagerService, RichTextEditingMutation, DocHistoryAction } from '@univerjs/docs';
import { JSONX } from '@univerjs/core';
import { IDrawingManagerService } from '@univerjs/drawing';

const { html } = Suite.shell;
const t = Suite.t;
const APP = 'document';
const OPEN_TYPES = [{ description: 'Documents', accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx', '.dotx', '.docm', '.txt', '.md'], 'application/vnd.oasis.opendocument.text': ['.odt', '.ott'] } }];
const FORMATS = {
  docx: { label: 'Word (.docx)', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  odt: { label: 'OpenDocument (.odt)', mime: 'application/vnd.oasis.opendocument.text' },
  html: { label: 'Web page (.html)', mime: 'text/html' },
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
    'doc.cancel': 'Cancel', 'doc.untitled': 'Document', 'doc.discard': 'Discard the unsaved changes?', 'doc.cannotOpen': '“{0}” cannot be opened: {1}',
    'doc.txtNote': 'A text file keeps only the text: formatting, tables and images are lost.', 'doc.importNotes': 'Some content was converted: {0}',
    'doc.docmNote': 'Macros cannot be kept: the document is saved as .docx.',
  },
  de: {
    'doc.print': 'Drucken / PDF (Strg+P)', 'doc.htmlNote': 'Eine Webseite behält Texte, Formatierung, Listen, Tabellen und Bilder, nicht das Seitenlayout.',
    'doc.diagram': 'Diagramm', 'doc.diagramFailed': 'Das Diagramm konnte nicht eingefügt werden.', 'doc.diagramGone': 'Das Diagramm ist nicht mehr im Dokument.',
    'doc.longWords': 'Sehr lange Wörter haben unsichtbare Umbruchstellen erhalten, damit sie angezeigt werden können.',
    'doc.toc': 'Inhalt', 'doc.tocHint': 'Inhaltsverzeichnis an der Schreibmarke einfügen oder aktualisieren (aus den Überschriften)', 'doc.tocTitle': 'Inhalt',
    'doc.tocInserted': 'Inhaltsverzeichnis mit {0} Überschriften eingefügt.', 'doc.tocUpdated': 'Inhaltsverzeichnis aktualisiert ({0} Überschriften).', 'doc.tocEmpty': 'Das Dokument hat keine Überschriften (Absatzformate Überschrift 1–5 verwenden).',
    'app.title': 'Textverarbeitung', 'doc.new': 'Neu', 'doc.open': 'Öffnen', 'doc.save': 'Speichern', 'doc.saveAs': 'Speichern unter', 'doc.fileName': 'Dateiname', 'doc.format': 'Format',
    'doc.cancel': 'Abbrechen', 'doc.untitled': 'Dokument', 'doc.discard': 'Die ungespeicherten Änderungen verwerfen?', 'doc.cannotOpen': '„{0}“ kann nicht geöffnet werden: {1}',
    'doc.txtNote': 'Eine Textdatei behält nur den Text: Formatierung, Tabellen und Bilder gehen verloren.', 'doc.importNotes': 'Einige Inhalte wurden umgewandelt: {0}',
    'doc.docmNote': 'Makros können nicht erhalten werden: Das Dokument wird als .docx gespeichert.',
  },
});

const state = { name: '', handle: null, format: 'docx', dirty: false, dialog: null, busy: false };
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

const { univerAPI } = createUniver({
  locale: locale(),
  locales: { [LocaleType.EN_US]: mergeLocales(enUS, drawingEnUS), [LocaleType.DE_DE]: mergeLocales(deDE, drawingDeDE) },
  darkMode: dark(),
  presets: [UniverDocsCorePreset({ container: host }), UniverDocsDrawingPreset()],
});
const blank = () => ({ documentStyle: { autoHyphenation: 0 } });
let doc = univerAPI.createDocument(blank());
let loadedAt = performance.now(); // mutations count as edits only after user input that follows the latest load

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

async function save({ as = false, name = state.name, format = state.format } = {}) {
  try {
    const data = doc.save();
    const bytes = format === 'txt' ? new TextEncoder().encode(toText(data)) : format === 'odt' ? writeOdt(data)
      : format === 'html' ? new TextEncoder().encode(toHtml(data, { title: name.replace(/\.[^.]+$/, '') })) : await exportDocx(data);
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
  frame.srcdoc = toHtml(doc.save(), { title: state.name.replace(/\.[^.]+$/, ''), print: true });
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
    <button class="secondary outline" data-testid="print" title=${t('doc.print')} aria-label=${t('doc.print')} onClick=${printDocument}>🖨</button>
    <span class="doc-name" data-testid="file-name">${state.name}${state.dirty ? ' •' : ''}</span>
  </nav>`;
}

function Main() {
  return html`<div class=${spelling.open ? 'doc-layout spell-open' : 'doc-layout'} ref=${(el) => { if (el && host.parentElement !== el) el.prepend(host); }}><${spelling.Panel} /><${SaveAsDialog} /></div>`;
}

Suite.shell.mount({ id: APP, title: 'app.title', version: '%%BUILD_VERSION%%', toolbar: () => html`<${Toolbar} />`, main: () => html`<${Main} />` });
Suite.files.dropZone(document.body, async (picked) => { if (picked.length && await confirmDiscard()) await openPicked(picked[0]); });
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) openSaveAs(); else save(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); e.stopPropagation(); open(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); e.stopPropagation(); printDocument(); }
  if (e.key === 'F7' && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); spelling.toggle(); }
}, true);

Suite.bridge.receive((picked) => openPicked(picked), { app: 'document' }); // files opened from other apps ("Open with…")

// for tests
window.DOC = { univerAPI, state, get doc() { return doc; }, insertDiagram, editDiagram, focusedDiagram, drawingManager, fromText, toText, load, tableOfContents, spelling, selection: DocSelectionManagerService };
document.body.dataset.ready = 'true';
