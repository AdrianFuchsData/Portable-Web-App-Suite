/*
 * Text editor: several documents in tabs, syntax highlighting, search/replace, multiple cursors,
 * encodings and line endings. CodeMirror 6 (ES modules) inside the shared app shell (Suite.shell).
 */
import { EditorView, basicSetup } from "codemirror";
import { keymap, highlightWhitespace } from "@codemirror/view";
import { EditorState, EditorSelection, Compartment, Prec, Annotation, Transaction } from "@codemirror/state";
import { undo, redo, undoDepth, redoDepth, indentMore, indentLess } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { openSearchPanel, gotoLine, selectNextOccurrence } from "@codemirror/search";
import { oneDark } from "@codemirror/theme-one-dark";
import { LANGUAGES, languageFor, languageExtension } from "app/languages";
import { TOOLS, apply as applyTool, kindOf, ToolError, SQL_DIALECTS, SQL_DEFAULTS } from "app/tools";
import { MergeView, unifiedMergeView, getChunks, goToNextChunk, goToPreviousChunk } from "@codemirror/merge";
import { lineDiff } from "app/linediff";
import "app/spell-dom"; // spelling selector in the header, marks in text fields (shared/js/spell-dom.js)
import { spellChecking } from "app/cm-spell";
import "app/cm-symbols"; // emoji and symbols insert through the editor (shared/js/cm-symbols.js)
import { colorSwatches } from "app/cm-colors";

const { html } = Suite.shell;
const t = Suite.t;
const APP = "texteditor";
const PREFS_KEY = "texteditor.prefs";
const ENC = TE.encoding;

Suite.i18n.register({
  en: {
    "te.editorLabel": "Text content",
    "app.title": "Text editor",
    "te.new": "New", "te.open": "Open", "te.save": "Save", "te.saveAs": "Save as", "te.recent": "Recent",
    "te.undo": "Undo", "te.redo": "Redo", "te.find": "Find / replace", "te.goto": "Go to line", "te.wrap": "Word wrap", "te.whitespace": "Show whitespace",
    "te.zoomIn": "Larger font", "te.zoomOut": "Smaller font", "te.close": "Close", "te.untitled": "Untitled-{0}",
    "te.closeUnsaved": "“{0}” has unsaved changes. Close it anyway?", "te.closeAnyway": "Close without saving",
    "te.line": "Ln {0}, Col {1}", "te.selected": "{0} selected", "te.cursors": "{0} cursors",
    "te.language": "Language", "te.encoding": "Encoding", "te.eol": "Line endings", "te.bom": "with BOM",
    "te.indent": "Indentation", "te.indentSpaces": "{0} spaces", "te.indentTab": "Tabs (width {0})",
    "te.unencodable": "Some characters cannot be stored in {0} and are replaced by “?”: {1}. Save anyway?",
    "te.reopenFailed": "The file could not be opened again.", "te.noRecent": "No recently used files",
    "te.reloadEncoding": "Reload with encoding",
    "te.compare": "Compare…", "te.compareWith": "Compare “{0}” with", "te.aFile": "a file…", "te.differences": "{0} difference(s)", "te.noDifferences": "The texts are identical.",
    "te.nextDiff": "Next difference", "te.prevDiff": "Previous difference", "te.endCompare": "Done", "te.compareHint": "Left: {0} (read-only) · right: {1} (editable; arrows copy a change over)",
    "te.findAll": "Find in files", "te.findAllPlaceholder": "Search in all open files", "te.inOpen": "Open files", "te.inFolder": "Folder…",
    "te.matchCase": "Match case", "te.regex": "Regular expression", "te.matches": "{0} match(es) in {1} file(s)", "te.noMatches": "No matches.",
    "te.badRegex": "Invalid regular expression: {0}", "te.searching": "Searching… {0} files", "te.tooMany": "Only the first {0} matches are shown.",
    "te.split": "Split view (the same document twice)",
    "te.tools": "Tools", "te.group.lines": "Lines", "te.group.case": "Case", "te.group.encode": "Encode / decode", "te.group.format": "Format",
    "te.tool.sortAsc": "Sort lines A→Z", "te.tool.sortDesc": "Sort lines Z→A", "te.tool.sortLength": "Sort lines by length", "te.tool.reverse": "Reverse line order",
    "te.tool.unique": "Remove duplicate lines", "te.tool.removeEmpty": "Remove empty lines", "te.tool.trimTrailing": "Trim trailing whitespace",
    "te.tool.trimBoth": "Trim leading and trailing whitespace", "te.tool.joinLines": "Join lines",
    "te.tool.upper": "UPPER CASE", "te.tool.lower": "lower case", "te.tool.title": "Title Case", "te.tool.invert": "iNVERT cASE",
    "te.tool.base64Encode": "Base64 encode", "te.tool.base64Decode": "Base64 decode", "te.tool.urlEncode": "URL encode", "te.tool.urlDecode": "URL decode",
    "te.tool.htmlEscape": "HTML escape", "te.tool.htmlUnescape": "HTML unescape",
    "te.tool.jsonFormat": "Format JSON", "te.tool.jsonMinify": "Minify JSON", "te.tool.xmlFormat": "Format XML", "te.tool.sqlFormat": "Format SQL…", "te.tool.sqlMinify": "SQL on one line",
    "te.toolBadSql": "The SQL could not be formatted: {0}",
    "te.sql.title": "Format SQL", "te.sql.dialect": "Dialect", "te.sql.keywords": "Keywords, functions and data types", "te.sql.upper": "UPPER CASE", "te.sql.lower": "lower case",
    "te.sql.preserve": "as written", "te.sql.indent": "Indentation", "te.sql.spaces": "{0} spaces", "te.sql.tab": "Tab", "te.sql.style": "Layout", "te.sql.standard": "Standard",
    "te.sql.tabularLeft": "Columns, keywords left-aligned", "te.sql.tabularRight": "Columns, keywords right-aligned", "te.sql.logical": "AND / OR",
    "te.sql.before": "at the start of the line", "te.sql.after": "at the end of the line", "te.sql.width": "Parentheses on one line up to (characters)",
    "te.sql.blank": "Blank lines between statements", "te.sql.preview": "Preview", "te.sql.scopeSelection": "Formats the selection.", "te.sql.scopeDocument": "Formats the whole document.",
    "te.sql.format": "Format", "te.sql.cancel": "Cancel",
    "te.toolBadBase64": "The text is not valid Base64.", "te.toolBadUrl": "The text is not valid URL encoding.",
    "te.toolBadJson": "The text is not valid JSON: {0}", "te.toolBadXml": "The text is not well-formed XML: {0}",
  },
  de: {
    "te.editorLabel": "Textinhalt",
    "app.title": "Texteditor",
    "te.new": "Neu", "te.open": "Öffnen", "te.save": "Speichern", "te.saveAs": "Speichern unter", "te.recent": "Zuletzt",
    "te.undo": "Rückgängig", "te.redo": "Wiederholen", "te.find": "Suchen / Ersetzen", "te.goto": "Gehe zu Zeile", "te.wrap": "Zeilenumbruch", "te.whitespace": "Leerzeichen anzeigen",
    "te.zoomIn": "Größere Schrift", "te.zoomOut": "Kleinere Schrift", "te.close": "Schließen", "te.untitled": "Unbenannt-{0}",
    "te.closeUnsaved": "„{0}“ hat ungespeicherte Änderungen. Trotzdem schließen?", "te.closeAnyway": "Schließen ohne Speichern",
    "te.line": "Z {0}, Sp {1}", "te.selected": "{0} ausgewählt", "te.cursors": "{0} Cursor",
    "te.language": "Sprache", "te.encoding": "Kodierung", "te.eol": "Zeilenenden", "te.bom": "mit BOM",
    "te.indent": "Einrückung", "te.indentSpaces": "{0} Leerzeichen", "te.indentTab": "Tabulatoren (Breite {0})",
    "te.unencodable": "Einige Zeichen können nicht in {0} gespeichert werden und werden durch „?“ ersetzt: {1}. Trotzdem speichern?",
    "te.reopenFailed": "Die Datei konnte nicht erneut geöffnet werden.", "te.noRecent": "Keine zuletzt verwendeten Dateien",
    "te.reloadEncoding": "Neu laden mit Kodierung",
    "te.compare": "Vergleichen…", "te.compareWith": "„{0}“ vergleichen mit", "te.aFile": "einer Datei…", "te.differences": "{0} Unterschied(e)", "te.noDifferences": "Die Texte sind gleich.",
    "te.nextDiff": "Nächster Unterschied", "te.prevDiff": "Vorheriger Unterschied", "te.endCompare": "Fertig", "te.compareHint": "Links: {0} (schreibgeschützt) · rechts: {1} (bearbeitbar; Pfeile übernehmen eine Änderung)",
    "te.findAll": "In Dateien suchen", "te.findAllPlaceholder": "In allen geöffneten Dateien suchen", "te.inOpen": "Geöffnete Dateien", "te.inFolder": "Ordner…",
    "te.matchCase": "Groß-/Kleinschreibung", "te.regex": "Regulärer Ausdruck", "te.matches": "{0} Treffer in {1} Datei(en)", "te.noMatches": "Keine Treffer.",
    "te.badRegex": "Ungültiger regulärer Ausdruck: {0}", "te.searching": "Suche… {0} Dateien", "te.tooMany": "Nur die ersten {0} Treffer werden angezeigt.",
    "te.split": "Geteilte Ansicht (dasselbe Dokument zweimal)",
    "te.tools": "Werkzeuge", "te.group.lines": "Zeilen", "te.group.case": "Groß/klein", "te.group.encode": "Kodieren / dekodieren", "te.group.format": "Formatieren",
    "te.tool.sortAsc": "Zeilen sortieren A→Z", "te.tool.sortDesc": "Zeilen sortieren Z→A", "te.tool.sortLength": "Zeilen nach Länge sortieren", "te.tool.reverse": "Zeilenfolge umkehren",
    "te.tool.unique": "Doppelte Zeilen entfernen", "te.tool.removeEmpty": "Leere Zeilen entfernen", "te.tool.trimTrailing": "Leerzeichen am Zeilenende entfernen",
    "te.tool.trimBoth": "Leerzeichen am Anfang und Ende entfernen", "te.tool.joinLines": "Zeilen verbinden",
    "te.tool.upper": "GROSSBUCHSTABEN", "te.tool.lower": "kleinbuchstaben", "te.tool.title": "Wörter Groß Beginnen", "te.tool.invert": "gROSS/kLEIN uMKEHREN",
    "te.tool.base64Encode": "Base64 kodieren", "te.tool.base64Decode": "Base64 dekodieren", "te.tool.urlEncode": "URL kodieren", "te.tool.urlDecode": "URL dekodieren",
    "te.tool.htmlEscape": "HTML maskieren", "te.tool.htmlUnescape": "HTML-Maskierung aufheben",
    "te.tool.jsonFormat": "JSON formatieren", "te.tool.jsonMinify": "JSON verkleinern", "te.tool.xmlFormat": "XML formatieren", "te.tool.sqlFormat": "SQL formatieren…", "te.tool.sqlMinify": "SQL in eine Zeile",
    "te.toolBadSql": "Das SQL konnte nicht formatiert werden: {0}",
    "te.sql.title": "SQL formatieren", "te.sql.dialect": "Dialekt", "te.sql.keywords": "Schlüsselwörter, Funktionen und Datentypen", "te.sql.upper": "GROSS", "te.sql.lower": "klein",
    "te.sql.preserve": "wie geschrieben", "te.sql.indent": "Einrückung", "te.sql.spaces": "{0} Leerzeichen", "te.sql.tab": "Tabulator", "te.sql.style": "Anordnung", "te.sql.standard": "Standard",
    "te.sql.tabularLeft": "Spalten, Schlüsselwörter linksbündig", "te.sql.tabularRight": "Spalten, Schlüsselwörter rechtsbündig", "te.sql.logical": "AND / OR",
    "te.sql.before": "am Zeilenanfang", "te.sql.after": "am Zeilenende", "te.sql.width": "Klammern in einer Zeile bis (Zeichen)",
    "te.sql.blank": "Leerzeilen zwischen Anweisungen", "te.sql.preview": "Vorschau", "te.sql.scopeSelection": "Formatiert die Auswahl.", "te.sql.scopeDocument": "Formatiert das ganze Dokument.",
    "te.sql.format": "Formatieren", "te.sql.cancel": "Abbrechen",
    "te.toolBadBase64": "Der Text ist kein gültiges Base64.", "te.toolBadUrl": "Der Text ist keine gültige URL-Kodierung.",
    "te.toolBadJson": "Der Text ist kein gültiges JSON: {0}", "te.toolBadXml": "Der Text ist kein wohlgeformtes XML: {0}",
  },
});

// ---- preferences (UI only, no file content) ----------------------------------------------------

const prefs = Object.assign({ wrap: false, whitespace: false, fontSize: 14, indent: "s4" }, (() => {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch (e) { return {}; }
})());

/** Accessible name of the editing area (screen readers announce it). */
const editorLabel = () => EditorView.contentAttributes.of({ "aria-label": t("te.editorLabel") });
/** Colour swatches in front of hex colours (a click opens the colour picker). */
const swatches = () => colorSwatches(() => (currentDoc() || {}).language || "text");
/** Spell checking (when switched on in the header): whole text in text and Markdown files, only comments and strings in code. */
const spelling = () => spellChecking(() => (["text", "markdown"].includes((currentDoc() || {}).language || "text") ? "prose" : "code"));

function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* storage blocked */ }
}

const darkMode = () => {
  const theme = document.documentElement.getAttribute("data-theme");
  return theme ? theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
};

// ---- documents ----------------------------------------------------------------------------------

const compartments = { language: new Compartment(), wrap: new Compartment(), theme: new Compartment(), whitespace: new Compartment(), font: new Compartment(), indent: new Compartment() };

// ---- indentation ----------------------------------------------------------------------------------
// "s2", "s4", "s8": spaces; "t2", "t4", "t8": tab characters shown that wide

const INDENTS = ["s2", "s4", "s8", "t2", "t4", "t8"];
const indentWidth = (indent) => Number(indent.slice(1)) || 4;
const indentExtension = (indent) => [indentUnit.of(indent[0] === "t" ? "\t" : " ".repeat(indentWidth(indent))), EditorState.tabSize.of(indentWidth(indent))];

/** The indentation of a text: tabs if most indented lines start with one, else the most common step between lines. */
function detectIndent(text, fallback) {
  let tabs = 0, spaces = 0, prev = 0;
  const steps = { 2: 0, 4: 0, 8: 0 };
  for (const line of text.split("\n", 5000)) {
    if (!line.trim()) continue;
    if (line[0] === "\t") { tabs++; continue; }
    const n = /^ */.exec(line)[0].length;
    if (n) spaces++;
    const step = Math.abs(n - prev);
    if (steps[step] !== undefined) steps[step]++;
    prev = n;
  }
  if (tabs > spaces && tabs > 0) return fallback[0] === "t" ? fallback : "t4";
  if (!spaces) return fallback;
  const best = Object.entries(steps).sort((a, b) => b[1] - a[1])[0];
  return best[1] ? `s${best[0]}` : fallback;
}

/** Tab: indent the selected lines, or insert indentation up to the next stop at the cursor (a tab with "Tabs"). */
function indentOrInsert(target) {
  const { state } = target;
  if (state.selection.ranges.some((r) => !r.empty)) return indentMore(target);
  const unit = state.facet(indentUnit);
  target.dispatch(state.changeByRange((range) => {
    let insert = unit;
    if (unit !== "\t") {
      const line = state.doc.lineAt(range.head);
      const column = range.head - line.from;
      insert = " ".repeat(unit.length - (column % unit.length));
    }
    return { changes: { from: range.head, insert }, range: EditorSelection.cursor(range.head + insert.length) };
  }), { userEvent: "input.indent", scrollIntoView: true });
  return true;
}

/** Ctrl+Alt+I: a tab character, whatever the indentation setting. */
function insertTabCharacter(target) {
  target.dispatch(target.state.replaceSelection("\t"), { userEvent: "input", scrollIntoView: true });
  return true;
}

const indentKeys = () => keymap.of([
  { key: "Tab", run: indentOrInsert, shift: indentLess },
  { key: "Ctrl-Alt-i", run: insertTabCharacter, preventDefault: true },
]);

function setIndent(indent) {
  const doc = currentDoc();
  if (!doc || !INDENTS.includes(indent)) return;
  doc.indent = indent;
  prefs.indent = indent; // also for new documents
  savePrefs();
  view.dispatch({ effects: compartments.indent.reconfigure(indentExtension(indent)) });
  if (split && split.view) split.view.dispatch({ effects: compartments.indent.reconfigure(indentExtension(indent)) });
  Suite.shell.refresh();
}
const docs = [];
let active = -1;
let untitledCounter = 0;
let view = null;
let recentFiles = [];

const settingExtensions = () => ({
  wrap: prefs.wrap ? EditorView.lineWrapping : [],
  theme: darkMode() ? oneDark : [],
  whitespace: prefs.whitespace ? highlightWhitespace() : [],
  font: EditorView.theme({ "&": { fontSize: `${prefs.fontSize}px` }, ".cm-content, .cm-gutters": { fontFamily: "ui-monospace, 'Cascadia Mono', Consolas, 'DejaVu Sans Mono', monospace" } }),
});

function createState(text, languageId, indent = prefs.indent) {
  const s = settingExtensions();
  return EditorState.create({
    doc: text,
    extensions: [
      Prec.highest(keymap.of([
        { key: "Mod-s", run: () => { save(); return true; }, preventDefault: true },
        { key: "Mod-Shift-f", run: () => { openFinder(); return true; }, preventDefault: true },
        { key: "Mod-Shift-s", run: () => { saveAs(); return true; }, preventDefault: true },
        { key: "Mod-o", run: () => { openFiles(); return true; }, preventDefault: true },
        { key: "Alt-n", run: () => { newDocument(); return true; } },
        { key: "Alt-w", run: () => { closeDocument(active); return true; } },
        { key: "Mod-g", run: gotoLine, preventDefault: true },
        { key: "Mod-d", run: selectNextOccurrence, preventDefault: true },
      ])),
      basicSetup, editorLabel(), spelling(), swatches(), // includes multiple selections (Ctrl+click), rectangular selection (Alt+drag), search, undo, ...
      indentKeys(), // Tab indents (Esc, then Tab, or Ctrl+M moves the focus on)
      EditorState.allowMultipleSelections.of(true),
      compartments.indent.of(indentExtension(INDENTS.includes(indent) ? indent : "s4")),
      compartments.language.of(languageExtension(languageId)),
      compartments.wrap.of(s.wrap),
      compartments.theme.of(s.theme),
      compartments.whitespace.of(s.whitespace),
      compartments.font.of(s.font),
      EditorView.updateListener.of((update) => onUpdate(update)),
    ],
  });
}

function currentDoc() { return docs[active] || null; }

function isDirty(doc) { return !doc.state.doc.eq(doc.savedDoc); }

function updateDirtyFlag() { Suite.shell.setDirty(docs.some(isDirty)); }

let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; Suite.shell.refresh(); });
}

function onUpdate(update) {
  const doc = currentDoc();
  if (!doc || update.view !== view) return;
  doc.state = update.state;
  if (update.docChanged) updateDirtyFlag();
  if (update.docChanged || update.selectionSet) scheduleRender();
}

/** Bring the settings (wrap, theme, font, whitespace) of the shown state up to date. */
function applySettings() {
  if (!view) return;
  const s = settingExtensions();
  view.dispatch({ effects: Object.keys(s).map((k) => compartments[k].reconfigure(s[k])) });
  if (split) buildSplit();
}

// ---- split view: a second view of the current document --------------------------------------------
// The main view keeps the undo history; the second view forwards its changes to the main view and receives the main
// view's changes (marked with an annotation so that they are not sent back).

const synced = Annotation.define();
let split = null; // { view, host }

function forward(tr, target) {
  if (tr.changes.empty || tr.annotation(synced)) return;
  const annotations = [synced.of(true)];
  const userEvent = tr.annotation(Transaction.userEvent);
  if (userEvent) annotations.push(Transaction.userEvent.of(userEvent));
  target.dispatch({ changes: tr.changes, annotations });
}

function buildSplit() {
  const doc = currentDoc();
  const s = settingExtensions();
  const state = EditorState.create({
    doc: view.state.doc,
    extensions: [
      Prec.highest(keymap.of([
        { key: "Mod-z", run: () => undo(view), preventDefault: true },
        { key: "Mod-y", run: () => redo(view), preventDefault: true },
        { key: "Mod-Shift-z", run: () => redo(view), preventDefault: true },
        { key: "Mod-s", run: () => { save(); return true; }, preventDefault: true },
      ])),
      basicSetup, editorLabel(), spelling(), swatches(), indentKeys(), EditorState.allowMultipleSelections.of(true), compartments.indent.of(indentExtension((doc && doc.indent) || prefs.indent)),
      languageExtension(doc ? doc.language : "text"), s.wrap, s.theme, s.whitespace, s.font,
    ],
  });
  if (!split) {
    const host = document.createElement("div");
    host.className = "te-split-pane";
    host.dataset.testid = "split";
    split = { host, view: null };
  }
  if (split.view) split.view.destroy();
  split.view = new EditorView({ state, parent: split.host, dispatch: (tr) => { split.view.update([tr]); forward(tr, view); } });
  scheduleRender();
}

function toggleSplit() {
  if (split) { split.view.destroy(); split = null; scheduleRender(); view.focus(); return; }
  buildSplit();
}

function activate(index) {
  if (index < 0 || index >= docs.length) return;
  const old = currentDoc();
  if (old && view) old.state = view.state;
  active = index;
  view.setState(docs[index].state);
  applySettings(); // also rebuilds the split view for the new document
  view.focus();
  Suite.shell.refresh();
}

function addDocument({ name, text = "", handle = null, encoding = "utf-8", bom = false, eol = "lf", language, indent }) {
  const languageId = language || languageFor(name);
  const docIndent = INDENTS.includes(indent) ? indent : detectIndent(text, INDENTS.includes(prefs.indent) ? prefs.indent : "s4");
  const state = createState(text, languageId, docIndent);
  docs.push({ id: crypto.randomUUID(), name, handle, encoding, bom, eol, language: languageId, indent: docIndent, state, savedDoc: state.doc, isNew: !handle && !text });
  activate(docs.length - 1);
  return docs[docs.length - 1];
}

function newDocument() {
  untitledCounter += 1;
  return addDocument({ name: t("te.untitled", untitledCounter) + ".txt" });
}

async function openPicked(picked) {
  for (const { file, handle } of picked || []) {
    // already open? switch to it
    let existing = -1;
    let sameName = -1;
    for (let i = 0; i < docs.length; i++) {
      if (handle && docs[i].handle && (await docs[i].handle.isSameEntry(handle))) existing = i;
      if (!handle && !docs[i].handle && docs[i].name === file.name && !isDirty(docs[i])) sameName = i;
    }
    if (existing >= 0) { activate(existing); continue; }
    const decoded = ENC.decode(await file.arrayBuffer());
    if (sameName >= 0) {
      // a file of the same name without a handle (dropped, or opened in Firefox): the same text switches to its tab, a
      // newer version replaces the unchanged tab
      if (docs[sameName].state.doc.toString() === decoded.text) { activate(sameName); continue; }
      docs.splice(sameName, 1);
      if (active === sameName) active = -1;
      else if (active > sameName) active -= 1;
    }
    // replace an untouched empty document
    const cur = currentDoc();
    if (cur && cur.isNew && !cur.handle && cur.state.doc.length === 0 && docs.length === 1) { docs.splice(active, 1); active = -1; }
    addDocument({ name: file.name, handle, text: decoded.text, encoding: decoded.encoding, bom: decoded.bom, eol: decoded.eol });
    if (handle) Suite.files.remember(APP, handle).then(loadRecent);
  }
}

async function openFiles() {
  try { await openPicked(await Suite.files.open({ multiple: true })); } catch (e) { Suite.shell.toast(Suite.i18n.describe(e), "error"); }
}

async function encodeForSave(doc) {
  const text = doc.state.doc.toString();
  const bad = ENC.unencodable(text, doc.encoding);
  if (bad.length && !(await Suite.shell.confirm(t("te.unencodable", ENC.LABELS[doc.encoding], bad.slice(0, 10).join(" "))))) return null;
  return ENC.encode(text, { encoding: doc.encoding, bom: doc.bom, eol: doc.eol });
}

function markSaved(doc) {
  doc.savedDoc = doc.state.doc;
  doc.isNew = false;
  updateDirtyFlag();
  Suite.shell.refresh();
}

function report(result) {
  if (result.mode === "downloaded") Suite.shell.banner(result.message);
  else Suite.shell.toast(result.message);
}

async function save() {
  const doc = currentDoc();
  if (!doc) return;
  if (doc.isNew && !doc.handle) { await saveAs(); return; }
  try {
    const bytes = await encodeForSave(doc);
    if (!bytes) return;
    report(await Suite.files.save(doc, bytes, { type: "text/plain" }));
    markSaved(doc);
  } catch (e) { Suite.shell.toast(Suite.i18n.describe(e), "error"); }
}

async function saveAs() {
  const doc = currentDoc();
  if (!doc) return;
  try {
    const bytes = await encodeForSave(doc);
    if (!bytes) return;
    const result = await Suite.files.saveAs(bytes, { suggestedName: doc.name, type: "text/plain" });
    if (!result) return;
    report(result);
    doc.name = result.name;
    if (result.handle) { doc.handle = result.handle; Suite.files.remember(APP, result.handle).then(loadRecent); }
    markSaved(doc);
  } catch (e) { Suite.shell.toast(Suite.i18n.describe(e), "error"); }
}

async function closeDocument(index) {
  const doc = docs[index];
  if (!doc) return;
  if (index === active) doc.state = view.state;
  if (isDirty(doc) && !(await Suite.shell.confirm(t("te.closeUnsaved", doc.name), { ok: t("te.closeAnyway") }))) return;
  docs.splice(index, 1);
  if (!docs.length) { active = -1; newDocument(); } else { active = -1; activate(Math.min(index, docs.length - 1)); }
  updateDirtyFlag();
}

function setLanguage(id) {
  const doc = currentDoc();
  doc.language = id;
  view.dispatch({ effects: compartments.language.reconfigure(languageExtension(id)) });
  Suite.shell.refresh();
}

function setPref(key, value) {
  prefs[key] = value;
  savePrefs();
  applySettings();
  Suite.shell.refresh();
}

async function reloadWithEncoding(encoding) {
  const doc = currentDoc();
  if (!doc.handle) return;
  const decoded = ENC.decode(await (await doc.handle.getFile()).arrayBuffer(), encoding);
  doc.encoding = decoded.encoding;
  doc.bom = decoded.bom;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: decoded.text } });
  markSaved(doc);
}

async function loadRecent() {
  recentFiles = await Suite.files.recent(APP);
  Suite.shell.refresh();
}

async function openRecent(index) {
  const item = recentFiles[index];
  try {
    const picked = item && (await Suite.files.reopen(item.handle));
    if (picked) await openPicked([picked]); else Suite.shell.toast(t("te.reopenFailed"), "error");
  } catch (e) { Suite.shell.toast(t("te.reopenFailed"), "error"); }
}

// ---- UI -----------------------------------------------------------------------------------------

let sqlDialog = null; // { id, options } while the SQL formatting options are shown
document.addEventListener("keydown", (e) => { if (sqlDialog && e.key === "Escape" && sqlDialog.close) { e.preventDefault(); sqlDialog.close(); } });

/** The range a tool works on: the selection (whole lines for line tools) or the whole document. */
function toolRange(id) {
  const state = view.state;
  const sel = state.selection.main;
  let from = 0, to = state.doc.length;
  if (!sel.empty) {
    from = sel.from; to = sel.to;
    if (kindOf(id) === "lines") {
      const last = state.doc.lineAt(to);
      if (last.from === to && to > from) to -= 1; // a selection ending at the start of a line does not include it
      from = state.doc.lineAt(from).from; to = state.doc.lineAt(to).to;
    }
  }
  return { from, to };
}

/** Run a text tool on the selection (whole lines for line tools) or on the whole document; options: of tools that ask. */
function runTool(id, options = null) {
  if (!view) return;
  const tool = TOOLS.find((x) => x.id === id);
  if (tool && tool.options === "sql" && !options) {
    sqlDialog = { id, options: { ...SQL_DEFAULTS, ...(prefs.sql || {}) } };
    scheduleRender();
    return;
  }
  const state = view.state;
  const sel = state.selection.main;
  const { from, to } = toolRange(id);
  let result;
  try { result = applyTool(id, state.sliceDoc(from, to), options || {}); } catch (e) {
    Suite.shell.toast(e instanceof ToolError ? t(e.key, e.detail) : Suite.i18n.describe(e), "error");
    return;
  }
  view.dispatch({ changes: { from, to, insert: result }, selection: sel.empty ? undefined : { anchor: from, head: from + result.length }, userEvent: "input.tool", scrollIntoView: true });
  view.focus();
}

function Toolbar() {
  const doc = currentDoc();
  const dirty = doc && isDirty(doc);
  return html`<nav class="te-toolbar" role="toolbar">
    <button class="secondary" data-testid="new" title="${t("te.new")} (Alt+N)" onClick=${newDocument}>${t("te.new")}</button>
    <button class="secondary" data-testid="open" title="${t("te.open")} (Ctrl+O)" onClick=${openFiles}>${t("te.open")}</button>
    ${Suite.files.canWriteBack ? html`<select data-testid="recent" aria-label=${t("te.recent")} onChange=${(e) => { const i = +e.target.value; e.target.value = ""; if (i >= 0) openRecent(i); }}>
      <option value="">${t("te.recent")}</option>
      ${recentFiles.length ? recentFiles.map((r, i) => html`<option value=${i}>${r.name}</option>`) : html`<option disabled>${t("te.noRecent")}</option>`}
    </select>` : null}
    <button data-testid="save" class=${dirty ? "" : "secondary"} title="${t("te.save")} (Ctrl+S)" onClick=${save}>${t("te.save")}</button>
    <button class="secondary" data-testid="save-as" title="${t("te.saveAs")} (Ctrl+Shift+S)" onClick=${saveAs}>${t("te.saveAs")}</button>
    <button class="secondary outline" data-testid="undo" title="${t("te.undo")} (Ctrl+Z)" disabled=${!view || !undoDepth(view.state)} onClick=${() => { undo(view); view.focus(); }}>↶</button>
    <button class="secondary outline" data-testid="redo" title="${t("te.redo")} (Ctrl+Y)" disabled=${!view || !redoDepth(view.state)} onClick=${() => { redo(view); view.focus(); }}>↷</button>
    <button class="secondary outline" data-testid="find" title="${t("te.find")} (Ctrl+F)" onClick=${() => { openSearchPanel(view); }}>🔍</button>
    <button class=${finder ? "" : "secondary outline"} data-testid="find-all-open" title="${t("te.findAll")} (Ctrl+Shift+F)" onClick=${() => { if (finder) { finder = null; scheduleRender(); } else openFinder(); }}>🔍🗂</button>
    <button class="secondary outline" data-testid="goto" title="${t("te.goto")} (Ctrl+G)" onClick=${() => { gotoLine(view); }}>↧</button>
    <button class=${split ? "" : "secondary outline"} data-testid="split-view" title=${t("te.split")} aria-pressed=${!!split} onClick=${toggleSplit}>◫</button>
    <button class=${compare || comparePick ? "" : "secondary outline"} data-testid="compare-start" title=${t("te.compare")} onClick=${() => { if (compare) endCompare(); else { comparePick = !comparePick; scheduleRender(); } }}>⇔</button>
    <select data-testid="tools" aria-label=${t("te.tools")} onChange=${(e) => { const id = e.target.value; e.target.value = ""; if (id) runTool(id); }}>
      <option value="">🛠 ${t("te.tools")}</option>
      ${["lines", "case", "encode", "format"].map((g) => html`<optgroup label=${t(`te.group.${g}`)}>${TOOLS.filter((x) => x.group === g).map((x) => html`<option value=${x.id}>${t(`te.tool.${x.id}`)}</option>`)}</optgroup>`)}
    </select>
    <button class=${prefs.wrap ? "" : "secondary outline"} data-testid="wrap" title=${t("te.wrap")} aria-pressed=${prefs.wrap} onClick=${() => setPref("wrap", !prefs.wrap)}>↩</button>
    <button class=${prefs.whitespace ? "" : "secondary outline"} data-testid="whitespace" title=${t("te.whitespace")} aria-pressed=${prefs.whitespace} onClick=${() => setPref("whitespace", !prefs.whitespace)}>·</button>
    <button class="secondary outline" data-testid="zoom-out" title=${t("te.zoomOut")} onClick=${() => setPref("fontSize", Math.max(8, prefs.fontSize - 1))}>A−</button>
    <button class="secondary outline" data-testid="zoom-in" title=${t("te.zoomIn")} onClick=${() => setPref("fontSize", Math.min(40, prefs.fontSize + 1))}>A+</button>
  </nav>`;
}

function Tabs() {
  return html`<div class="te-tabs" role="tablist">${docs.map((doc, i) => html`
    <div role="tab" class=${`te-tab${i === active ? " active" : ""}`} aria-selected=${i === active ? "true" : "false"} tabindex="0" data-testid="tab" title=${doc.name}
         onClick=${() => activate(i)} onKeyDown=${(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(i); } else if (e.key === "Delete") closeDocument(i); }} onAuxClick=${(e) => { if (e.button === 1) closeDocument(i); }}>
      <span class="te-tab-name" data-testid="tab-name">${doc.name}</span>${isDirty(doc) ? html`<span class="te-dirty" data-testid="dirty">●</span>` : null}
      <span class="te-tab-close" data-testid="close-tab" aria-hidden="true" title="${t("te.close")} (Alt+W, Delete)" onClick=${(e) => { e.stopPropagation(); closeDocument(i); }}>×</span>
    </div>`)}</div>`;
}

function StatusBar() {
  const doc = currentDoc();
  if (!doc || !view) return null;
  const sel = view.state.selection;
  const head = sel.main.head;
  const line = view.state.doc.lineAt(head);
  const selected = sel.ranges.reduce((n, r) => n + (r.to - r.from), 0);
  return html`<footer class="te-status" data-testid="status">
    <span data-testid="position">${t("te.line", line.number, head - line.from + 1)}</span>
    ${selected ? html`<span data-testid="selected">${t("te.selected", selected)}</span>` : null}
    ${sel.ranges.length > 1 ? html`<span data-testid="cursors">${t("te.cursors", sel.ranges.length)}</span>` : null}
    <span class="suite-spacer"></span>
    <select data-testid="lang-select" aria-label=${t("te.language")} value=${doc.language} onChange=${(e) => setLanguage(e.target.value)}>
      ${Object.entries(LANGUAGES).map(([id, l]) => html`<option value=${id} selected=${id === doc.language}>${l.label}</option>`)}
    </select>
    <select data-testid="encoding" aria-label=${t("te.encoding")} onChange=${(e) => { doc.encoding = e.target.value; Suite.shell.refresh(); }}>
      ${ENC.ENCODINGS.map((enc) => html`<option value=${enc} selected=${enc === doc.encoding}>${ENC.LABELS[enc]}</option>`)}
    </select>
    ${doc.encoding !== "windows-1252" ? html`<label class="te-bom"><input type="checkbox" data-testid="bom" checked=${doc.bom} onChange=${(e) => { doc.bom = e.target.checked; Suite.shell.refresh(); }} /> ${t("te.bom")}</label>` : null}
    <select data-testid="indent" aria-label=${t("te.indent")} title=${t("te.indent")} onChange=${(e) => setIndent(e.target.value)}>
      ${INDENTS.map((v) => html`<option value=${v} selected=${v === doc.indent}>${t(v[0] === "t" ? "te.indentTab" : "te.indentSpaces", indentWidth(v))}</option>`)}
    </select>
    <select data-testid="eol" aria-label=${t("te.eol")} onChange=${(e) => { doc.eol = e.target.value; Suite.shell.refresh(); }}>
      ${Object.keys(ENC.EOLS).map((eol) => html`<option value=${eol} selected=${eol === doc.eol}>${eol.toUpperCase()}</option>`)}
    </select>
    ${doc.handle ? html`<select data-testid="reload-encoding" aria-label=${t("te.reloadEncoding")} onChange=${(e) => { const v = e.target.value; e.target.value = ""; if (v) reloadWithEncoding(v); }}>
      <option value="">${t("te.reloadEncoding")}…</option>${ENC.ENCODINGS.map((enc) => html`<option value=${enc}>${ENC.LABELS[enc]}</option>`)}
    </select>` : null}
  </footer>`;
}

// ---- find in files -------------------------------------------------------------------------------

const MAX_MATCHES = 2000;
let finder = null; // { query, matchCase, regex, folder: { name, handle } | null, results: [{ name, doc, handle, path, matches: [{ line, col, from, to, text }] }], count, error, busy }

function openFinder() {
  finder = finder || { query: "", matchCase: false, regex: false, folder: null, results: [], count: 0, error: "", busy: 0 };
  scheduleRender();
  requestAnimationFrame(() => { const el = document.querySelector("[data-testid=find-all-input]"); if (el) { el.focus(); el.select(); } });
}

function pattern() {
  const flags = finder.matchCase ? "g" : "gi";
  const source = finder.regex ? finder.query : finder.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(source, `${flags}u`);
}

/** Matches of the pattern in a text, line by line. */
function matchesIn(text, re, limit) {
  const out = [];
  const lines = text.split("\n");
  let offset = 0;
  for (let n = 0; n < lines.length && out.length < limit; n++) {
    const line = lines[n];
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line)) && out.length < limit) {
      if (!m[0].length) { re.lastIndex++; continue; }
      out.push({ line: n + 1, col: m.index + 1, from: offset + m.index, to: offset + m.index + m[0].length, text: line.length > 200 ? line.slice(Math.max(0, m.index - 60), m.index + 140) : line });
    }
    offset += line.length + 1;
  }
  return out;
}

/** Text files of a folder (recursively; not .git/node_modules, not binary, at most 5 MB each). */
async function* folderFiles(dir, path = "") {
  for await (const entry of dir.values()) {
    if (entry.kind === "directory") {
      if (/^(\.git|node_modules|\.venv|__pycache__)$/.test(entry.name)) continue;
      yield* folderFiles(entry, `${path}${entry.name}/`);
    } else {
      const file = await entry.getFile();
      if (file.size > 5 * 1024 * 1024) continue;
      yield { file, handle: entry, path: `${path}${entry.name}` };
    }
  }
}

let searchRun = 0;
async function runFind() {
  const f = finder;
  const run = ++searchRun;
  f.results = []; f.count = 0; f.error = "";
  if (!f.query) { scheduleRender(); return; }
  let re;
  try { re = pattern(); } catch (e) { f.error = t("te.badRegex", e.message); scheduleRender(); return; }
  const cur = currentDoc();
  if (cur && view) cur.state = view.state;
  if (!f.folder) {
    for (const doc of docs) {
      const matches = matchesIn(doc.state.doc.toString(), re, MAX_MATCHES - f.count);
      if (matches.length) { f.results.push({ name: doc.name, doc, matches }); f.count += matches.length; }
    }
    scheduleRender();
    return;
  }
  f.busy = 0;
  for await (const item of folderFiles(f.folder.handle)) {
    if (run !== searchRun || f.count >= MAX_MATCHES) break;
    f.busy++;
    const bytes = new Uint8Array(await item.file.arrayBuffer());
    if (bytes.subarray(0, 4096).includes(0)) continue; // binary
    const matches = matchesIn(ENC.decode(bytes).text, re, MAX_MATCHES - f.count);
    if (matches.length) { f.results.push({ name: item.path, handle: item.handle, file: item.file, matches }); f.count += matches.length; }
    if (f.busy % 50 === 0) scheduleRender();
  }
  if (run === searchRun) { f.busy = 0; scheduleRender(); }
}

let findTimer = null;
const scheduleFind = () => { clearTimeout(findTimer); findTimer = setTimeout(runFind, 200); };

async function pickFolder() {
  try {
    const handle = await window.showDirectoryPicker({ mode: "read" });
    finder.folder = { name: handle.name, handle };
    runFind();
  } catch (e) { if (e.name !== "AbortError") Suite.shell.toast(Suite.i18n.describe(e), "error"); }
}

async function goToMatch(result, m) {
  if (result.doc) {
    const i = docs.indexOf(result.doc);
    if (i < 0) return;
    activate(i);
  } else {
    await openPicked([{ file: await result.handle.getFile(), handle: result.handle }]);
  }
  const len = view.state.doc.length;
  view.dispatch({ selection: { anchor: Math.min(m.from, len), head: Math.min(m.to, len) }, scrollIntoView: true });
  view.focus();
}

function FindAll() {
  const f = finder;
  if (!f) return null;
  const chip = (key, label, testid) => html`<button type="button" class=${f[key] ? "" : "secondary outline"} aria-pressed=${f[key]} title=${t(label)} data-testid=${testid}
    onClick=${() => { f[key] = !f[key]; runFind(); }}>${key === "matchCase" ? "Aa" : ".*"}</button>`;
  return html`<section class="te-find-all" data-testid="find-all">
    <div class="te-find-all-bar">
      <input type="search" data-testid="find-all-input" placeholder=${t("te.findAllPlaceholder")} value=${f.query}
        onInput=${(e) => { f.query = e.target.value; scheduleFind(); }} onKeyDown=${(e) => { if (e.key === "Escape") { finder = null; scheduleRender(); view.focus(); } }} />
      ${chip("matchCase", "te.matchCase", "find-all-case")}${chip("regex", "te.regex", "find-all-regex")}
      <button type="button" class=${f.folder ? "secondary outline" : ""} data-testid="find-in-open" onClick=${() => { f.folder = null; runFind(); }}>${t("te.inOpen")}</button>
      ${typeof window.showDirectoryPicker === "function" ? html`<button type="button" class=${f.folder ? "" : "secondary outline"} data-testid="find-in-folder" onClick=${pickFolder}>📁 ${f.folder ? f.folder.name : t("te.inFolder")}</button>` : null}
      <button type="button" class="secondary outline" data-testid="find-all-close" onClick=${() => { finder = null; scheduleRender(); }}>×</button>
    </div>
    <p class="te-find-all-summary" data-testid="find-all-summary">${f.error || (f.busy ? t("te.searching", f.busy) : f.query ? (f.count ? t("te.matches", f.count, f.results.length) : t("te.noMatches")) : "")}${f.count >= MAX_MATCHES ? ` ${t("te.tooMany", MAX_MATCHES)}` : ""}</p>
    <ul class="te-find-all-results">${f.results.map((r) => html`<li><strong>${r.name}</strong>
      <ul>${r.matches.slice(0, 200).map((m) => html`<li data-testid="find-all-match" onClick=${() => goToMatch(r, m)}><span class="te-match-pos">${m.line}:${m.col}</span> <code>${m.text}</code></li>`)}</ul></li>`)}</ul>
  </section>`;
}

// ---- comparing (diff) ---------------------------------------------------------------------------

let compare = null; // { name, text, merge (MergeView) | unified (EditorView), host }
let comparePick = false;

const narrow = () => window.innerWidth < 760;

/** Compare the current document with another text: side by side (MergeView), on narrow screens as one view with changes. */
function startCompare(name, text) {
  const doc = currentDoc();
  if (!doc || !view) return;
  doc.state = view.state;
  const s = settingExtensions();
  const common = [basicSetup, editorLabel(), languageExtension(doc.language), s.wrap, s.theme, s.font];
  const host = document.createElement("div");
  host.className = "te-compare-host";
  if (narrow()) {
    const unified = new EditorView({ parent: host, state: EditorState.create({ doc: doc.state.doc, extensions: [...common, unifiedMergeView({ original: text, mergeControls: true, diffConfig: { override: lineDiff } }), EditorView.updateListener.of(() => scheduleRender())] }) });
    compare = { name, text, unified, host };
  } else {
    const merge = new MergeView({
      parent: host,
      a: { doc: text, extensions: [...common, EditorState.readOnly.of(true), EditorView.editable.of(false)] },
      b: { doc: doc.state.doc, extensions: [...common, EditorView.updateListener.of(() => scheduleRender())] },
      revertControls: "a-to-b", highlightChanges: true, gutter: true,
      diffConfig: { override: lineDiff }, // changed lines first, then the changed characters in them (js/linediff.js)
    });
    compare = { name, text, merge, host };
  }
  comparePick = false;
  scheduleRender();
}

const compareView = () => (compare ? compare.unified || compare.merge.b : null);
const chunkCount = () => { const v = compareView(); const c = v && getChunks(v.state); return c ? c.chunks.length : 0; };

/** End the comparison; changes made on the right side go into the document (one undo step). */
function endCompare() {
  if (!compare) return;
  const text = compareView().state.doc.toString();
  (compare.merge || compare.unified).destroy();
  compare = null;
  if (text !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, userEvent: "input.compare" });
  scheduleRender();
  requestAnimationFrame(() => view.focus());
}

async function compareWithFile() {
  try {
    const picked = await Suite.files.open();
    if (!picked || !picked.length) return;
    const bytes = new Uint8Array(await picked[0].file.arrayBuffer());
    startCompare(picked[0].file.name, ENC.decode(bytes).text);
  } catch (e) { Suite.shell.toast(Suite.i18n.describe(e), "error"); }
}

function CompareBar() {
  const doc = currentDoc();
  if (comparePick && doc) {
    return html`<div class="te-compare-bar" data-testid="compare-pick">
      <span>${t("te.compareWith", doc.name)}</span>
      ${docs.filter((d) => d !== doc).map((d) => html`<button class="secondary outline" data-testid="compare-doc" onClick=${() => startCompare(d.name, (d === currentDoc() ? view.state : d.state).doc.toString())}>${d.name}</button>`)}
      <button class="secondary outline" data-testid="compare-file" onClick=${compareWithFile}>${t("te.aFile")}</button>
      <button class="secondary outline" onClick=${() => { comparePick = false; scheduleRender(); }}>×</button>
    </div>`;
  }
  if (!compare) return null;
  const n = chunkCount();
  const go = (fn) => { const v = compareView(); fn(v); v.focus(); };
  return html`<div class="te-compare-bar" data-testid="compare-bar">
    <strong data-testid="diff-count">${n ? t("te.differences", n) : t("te.noDifferences")}</strong>
    <button class="secondary outline" data-testid="diff-prev" title=${t("te.prevDiff")} disabled=${!n} onClick=${() => go(goToPreviousChunk)}>↑</button>
    <button class="secondary outline" data-testid="diff-next" title=${t("te.nextDiff")} disabled=${!n} onClick=${() => go(goToNextChunk)}>↓</button>
    <small>${compare.merge ? t("te.compareHint", compare.name, doc ? doc.name : "") : ""}</small>
    <button data-testid="compare-done" onClick=${endCompare}>${t("te.endCompare")}</button>
  </div>`;
}

function EditorHost() {
  if (compare) {
    const ref = (el) => { if (el && compare && compare.host.parentNode !== el) el.replaceChildren(compare.host); };
    return html`<div class="te-editor te-comparing" data-testid="compare" ref=${ref}></div>`;
  }
  const ref = (el) => {
    if (!el || !view) return;
    const want = split ? [view.dom, split.host] : [view.dom];
    if (el.children.length !== want.length || want.some((c, i) => el.children[i] !== c)) { el.replaceChildren(...want); view.requestMeasure(); }
  };
  return html`<div class=${`te-editor ${split ? "te-split" : ""}`} ref=${ref}></div>`;
}

/** Options of "Format SQL" with a preview of the result (sql-formatter, see js/tools.js). */
function SqlDialog() {
  if (!sqlDialog || !view) return null;
  const o = sqlDialog.options;
  const set = (key) => (e) => { o[key] = e.target.value; scheduleRender(); };
  const close = () => { sqlDialog = null; scheduleRender(); view.focus(); };
  const run = () => { prefs.sql = { ...o }; savePrefs(); const { id } = sqlDialog; sqlDialog = null; runTool(id, o); scheduleRender(); };
  const { from, to } = toolRange(sqlDialog.id);
  let preview;
  try { preview = applyTool(sqlDialog.id, view.state.sliceDoc(from, Math.min(to, from + 4000)), o); } catch (e) { preview = e instanceof ToolError ? t(e.key, e.detail) : String(e); }
  const select = (key, testid, label, options) => html`<label>${label}<select data-testid=${testid} onChange=${set(key)}>
    ${options.map(([v, text]) => html`<option value=${v} selected=${String(o[key]) === String(v)}>${text}</option>`)}</select></label>`;
  sqlDialog.close = close;
  const focusFirst = (el) => { if (el && !sqlDialog.focused) { sqlDialog.focused = true; requestAnimationFrame(() => { const f = el.querySelector("select"); if (f) f.focus(); }); } };
  return html`<dialog open data-testid="sql-dialog" class="te-sql-dialog" aria-label=${t("te.sql.title")} ref=${focusFirst}><article>
    <header><strong>${t("te.sql.title")}</strong> <small>${t(view.state.selection.main.empty ? "te.sql.scopeDocument" : "te.sql.scopeSelection")}</small></header>
    <div class="te-sql-options">
      ${select("language", "sql-dialect", t("te.sql.dialect"), SQL_DIALECTS)}
      ${select("keywordCase", "sql-keyword-case", t("te.sql.keywords"), [["upper", t("te.sql.upper")], ["lower", t("te.sql.lower")], ["preserve", t("te.sql.preserve")]])}
      ${select("indent", "sql-indent", t("te.sql.indent"), [["2", t("te.sql.spaces", 2)], ["4", t("te.sql.spaces", 4)], ["tab", t("te.sql.tab")]])}
      ${select("indentStyle", "sql-indent-style", t("te.sql.style"), [["standard", t("te.sql.standard")], ["tabularLeft", t("te.sql.tabularLeft")], ["tabularRight", t("te.sql.tabularRight")]])}
      ${select("logicalOperatorNewline", "sql-logical", t("te.sql.logical"), [["before", t("te.sql.before")], ["after", t("te.sql.after")]])}
      <label>${t("te.sql.width")}<input type="number" min="10" max="400" data-testid="sql-width" value=${o.expressionWidth} onInput=${set("expressionWidth")} /></label>
      ${select("linesBetweenQueries", "sql-blank-lines", t("te.sql.blank"), [[1, "1"], [2, "2"], [3, "3"]])}
    </div>
    <p class="te-sql-preview-label">${t("te.sql.preview")}</p>
    <pre class="te-sql-preview" data-testid="sql-preview">${preview}</pre>
    <footer>
      <button class="secondary" data-testid="sql-cancel" onClick=${close}>${t("te.sql.cancel")}</button>
      <button data-testid="sql-format" onClick=${run}>${t("te.sql.format")}</button>
    </footer>
  </article></dialog>`;
}

function Main() {
  return html`<div class=${`te-layout ${finder ? "finding" : ""}`}><${Tabs} /><${CompareBar} /><div class="te-work"><${EditorHost} /><${FindAll} /></div><${StatusBar} /><${SqlDialog} /></div>`;
}

// ---- start --------------------------------------------------------------------------------------

view = new EditorView({ state: createState("", "text"), dispatch: (tr) => { view.update([tr]); if (split && split.view) forward(tr, split.view); } });
Suite.shell.mount({ id: APP, title: "app.title", version: "%%BUILD_VERSION%%", toolbar: () => html`<${Toolbar} />`, main: () => html`<${Main} />` });
newDocument();
Suite.files.dropZone(document.body, (picked) => openPicked(picked));
new MutationObserver(applySettings).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applySettings);
loadRecent();

Suite.bridge.receive((picked) => openPicked([picked]), { app: 'texteditor' }); // files opened from other apps ("Open with…")

// for tests
// recovery copies of unsaved documents (shared/js/autosave.js); file handles are kept, so saving goes to the file again
Suite.autosave.register({
  app: APP,
  save: () => {
    const cur = currentDoc();
    if (cur && view) cur.state = view.state;
    const list = docs.filter(isDirty).map((d) => ({ name: d.name, handle: d.handle, encoding: d.encoding, bom: d.bom, eol: d.eol, language: d.language, indent: d.indent, text: d.state.doc.toString(), saved: d.savedDoc.toString() }));
    return list.length ? { name: list.map((d) => d.name).join(', '), docs: list } : null;
  },
  restore: async (snap) => {
    for (const d of snap.docs) {
      const cur = currentDoc();
      if (cur && cur.isNew && !cur.handle && cur.state.doc.length === 0 && docs.length === 1) { docs.splice(active, 1); active = -1; }
      const doc = addDocument({ name: d.name, handle: d.handle, text: d.text, encoding: d.encoding, bom: d.bom, eol: d.eol, language: d.language, indent: d.indent });
      doc.savedDoc = createState(d.saved, doc.language).doc; // still marked as changed
      doc.isNew = false;
    }
    updateDirtyFlag();
    scheduleRender();
  },
});

window.TE.app = { toggleSplit, get split() { return split; }, openFinder, get finder() { return finder; }, startCompare, endCompare, get compare() { return compare; }, docs, get active() { return active; }, get view() { return view; }, openPicked, save, saveAs, closeDocument, activate, newDocument, isDirty, prefs, runTool };
document.body.dataset.ready = "true";
