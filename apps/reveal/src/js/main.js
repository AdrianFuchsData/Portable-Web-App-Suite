/*
 * Web slides: visual editor for reveal.js presentations. Slides are made of blocks (heading, text, list, image, code,
 * quote, table, HTML) or written in Markdown or HTML; slide backgrounds, transitions, auto-animate, fragments, speaker
 * notes and the deck settings of reveal.js are edited in inspectors. The preview is a real reveal.js deck in a frame
 * (srcdoc) in which texts are edited directly. Files: self-contained reveal.js HTML (with the editor model embedded),
 * Markdown and Jupyter notebooks (slideshow metadata). Deck model and HTML generation in deck.js.
 */
import {
  THEMES, TRANSITIONS, SPEEDS, FRAGMENTS, BLOCK_TYPES, CODE_LANGUAGES, newDeck, newSlide, newBlock, normalizeDeck, flatten, slideAt,
  slideTitle, renderPage, renderBlock, hasActiveContent, fromHtml, fromMarkdown, fromNotebook, toMarkdown, newId,
} from '@app/deck.js';
import { mermaidSvg } from '@app/mermaid-svg.js';
import { importPptx } from 'app/pptx-import';
import { exportPptx } from 'app/pptx-export';
import { pptxToWebSlides, webSlidesToPptx } from 'app/deck-convert';
import 'app/spell-dom'; // spelling selector in the header, marks in text fields (shared/js/spell-dom.js)

const { html } = Suite.shell;
const t = Suite.t;
const APP = 'reveal';
const OPEN_TYPES = [{ description: 'Presentations', accept: { 'text/html': ['.html', '.htm'], 'text/markdown': ['.md', '.markdown'], 'application/x-ipynb+json': ['.ipynb'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'] } }];
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

Suite.i18n.register({
  en: {
    'app.title': 'Web slides',
    'rv.new': 'New', 'rv.open': 'Open', 'rv.save': 'Save', 'rv.saveAs': 'Save as', 'rv.undo': 'Undo', 'rv.redo': 'Redo', 'rv.present': 'Present',
    'rv.presentWindow': 'Present in a new window', 'rv.print': 'PDF / print', 'rv.addSlide': 'Slide', 'rv.addSub': 'Sub-slide', 'rv.addBlock': 'Element',
    'rv.slides': 'Slides', 'rv.element': 'Element', 'rv.slide': 'Slide', 'rv.deck': 'Presentation', 'rv.panels': 'Panels',
    'rv.tpl.title': 'Title', 'rv.tpl.content': 'Title and list', 'rv.tpl.section': 'Section', 'rv.tpl.image': 'Image', 'rv.tpl.code': 'Code',
    'rv.tpl.quote': 'Quote', 'rv.tpl.blank': 'Blank', 'rv.tpl.markdown': 'Markdown', 'rv.tpl.html': 'HTML',
    'rv.type.drawio': 'Diagram (draw.io)', 'rv.drawDiagram': 'Draw a diagram', 'rv.drawnDiagram': 'Diagram', 'rv.type.heading': 'Heading', 'rv.type.text': 'Text', 'rv.type.list': 'List', 'rv.type.image': 'Image', 'rv.type.code': 'Code',
    'rv.type.quote': 'Quote', 'rv.type.table': 'Table', 'rv.type.html': 'HTML', 'rv.type.diagram': 'Diagram (Mermaid)',
    'rv.mermaid': 'Mermaid flowchart', 'rv.mermaidHint': 'flowchart TD / LR with nodes A[box], B(rounded), C{decision}, D([terminal]) and links A --> B, A -->|label| C; laid out automatically.',
    'rv.printNotes': 'Print / PDF with speaker notes', 'rv.dropHint': 'Drag slides to reorder them; drop on the right half of a slide to make it a sub-slide.',
    'rv.duplicate': 'Duplicate', 'rv.delete': 'Delete', 'rv.up': 'Move up', 'rv.down': 'Move down', 'rv.indent': 'Make sub-slide of the previous slide',
    'rv.outdent': 'Make main slide', 'rv.noElement': 'Click an element in the slide to edit its properties. Double-click a text to edit it.',
    'rv.level': 'Level', 'rv.fit': 'Fit text to the slide', 'rv.ordered': 'Numbered', 'rv.itemFragment': 'Show items one by one', 'rv.chooseImage': 'Choose image…',
    'rv.alt': 'Alternative text', 'rv.width': 'Width (%)', 'rv.stretch': 'Fill the remaining height', 'rv.language': 'Language', 'rv.code': 'Code',
    'rv.lineNumbers': 'Line numbers / highlighted steps', 'rv.lineNumbersHint': 'empty, “all” or steps like 1|2-3|5', 'rv.trim': 'Trim whitespace',
    'rv.cite': 'Source', 'rv.header': 'Header row', 'rv.addRow': '+ Row', 'rv.addCol': '+ Column', 'rv.delRow': '− Row', 'rv.delCol': '− Column',
    'rv.html': 'HTML', 'rv.fragment': 'Appearance (fragment)', 'rv.none': 'none', 'rv.fragmentIndex': 'Order', 'rv.animateId': 'Auto-animate ID',
    'rv.align': 'Alignment', 'rv.left': 'left', 'rv.center': 'centre', 'rv.right': 'right', 'rv.size': 'Size (em)', 'rv.color': 'Colour',
    'rv.kind': 'Content', 'rv.kind.blocks': 'Elements', 'rv.kind.markdown': 'Markdown', 'rv.kind.html': 'HTML', 'rv.markdown': 'Markdown',
    'rv.background': 'Background', 'rv.bgColor': 'Colour', 'rv.bgGradient': 'Gradient (CSS)', 'rv.bgImage': 'Image', 'rv.removeImage': 'Remove image',
    'rv.bgSize': 'Image size', 'rv.bgOpacity': 'Image opacity', 'rv.transition': 'Transition', 'rv.speed': 'Speed', 'rv.default': 'default',
    'rv.autoAnimate': 'Auto-animate (from the previous slide)', 'rv.visibility': 'Visibility', 'rv.visible': 'visible', 'rv.hidden': 'hidden',
    'rv.uncounted': 'not counted', 'rv.layout': 'Vertical position', 'rv.layoutCenter': 'centred', 'rv.layoutTop': 'top', 'rv.autoSlide': 'Advance after (s)',
    'rv.notes': 'Speaker notes', 'rv.className': 'CSS class', 'rv.title': 'Title', 'rv.lang': 'Language (e.g. en, de)', 'rv.theme': 'Theme',
    'rv.highlightTheme': 'Code colours', 'rv.bgTransition': 'Background transition', 'rv.controls': 'Arrow controls', 'rv.progress': 'Progress bar',
    'rv.slideNumber': 'Slide numbers', 'rv.centerAll': 'Centre slides vertically', 'rv.loop': 'Loop', 'rv.hash': 'Slide number in the address',
    'rv.navigation': 'Navigation', 'rv.navDefault': 'default', 'rv.navLinear': 'linear', 'rv.navGrid': 'grid', 'rv.deckAutoSlide': 'Advance automatically after (s, 0 = off)',
    'rv.format': 'Slide size', 'rv.view': 'View', 'rv.viewSlides': 'slides', 'rv.viewScroll': 'scrolling page', 'rv.css': 'Custom CSS',
    'rv.fileName': 'File name', 'rv.saveFormat': 'Format', 'rv.fmtHtml': 'reveal.js presentation (HTML)', 'rv.fmtMd': 'Markdown (text only)', 'rv.fmtPptx': 'PowerPoint (.pptx)',
    'rv.pptxLossy': 'The blocks are laid out from top to bottom on PowerPoint slides; texts, lists, images, tables, notes, transitions and fragments are taken over, themes and custom HTML only roughly.',
    'rv.convertedPptx': 'The PowerPoint file was converted into web slides; saving creates an HTML presentation.',
    'rv.trustAsk': 'This presentation contains scripts or other active content (such as <script> elements, event handlers or javascript: links). They are blocked: the slides are shown without running them. Allow them only if you trust the file and where it comes from – the scripts then run unprotected with the rights of this app and could read or change your data in the suite (settings, saved connections, opened files) or send it elsewhere.',
    'rv.trustAllow': 'Allow scripts (unprotected)', 'rv.trustKeep': 'Keep blocked',
    'rv.scriptsOff': 'Scripts blocked', 'rv.scriptsOn': 'Scripts allowed',
    'rv.scriptsOffTitle': 'Scripts in this presentation are blocked. Click to decide whether to allow them.', 'rv.scriptsOnTitle': 'Scripts in this presentation run unprotected. Click to block them again.',
    'rv.savedBlocked': 'The scripts in this presentation stay blocked in the saved file. Allow scripts if the presentation needs them.',
    'rv.cancel': 'Cancel', 'rv.ok': 'OK', 'rv.discard': 'Discard the unsaved changes?', 'rv.untitled': 'presentation', 'rv.cannotOpen': '“{0}” cannot be opened: {1}',
    'rv.blocked': 'The browser blocked the new window. Allow pop-ups for this page.', 'rv.exitPresent': 'End presentation', 'rv.linkUrl': 'Link address',
    'rv.bold': 'Bold', 'rv.italic': 'Italic', 'rv.underline': 'Underline', 'rv.strike': 'Strikethrough', 'rv.inlineCode': 'Code', 'rv.link': 'Link',
    'rv.clearFormat': 'Remove formatting', 'rv.textColor': 'Text colour', 'rv.done': 'Done', 'rv.mdLossy': 'Markdown keeps the texts, not the layout and design.',
    'rv.presentHint': 'Keys: → ← ↑ ↓ or Space to move, O overview, S speaker notes, F full screen, Esc overview.',
  },
  de: {
    'app.title': 'Web-Folien',
    'rv.new': 'Neu', 'rv.open': 'Öffnen', 'rv.save': 'Speichern', 'rv.saveAs': 'Speichern unter', 'rv.undo': 'Rückgängig', 'rv.redo': 'Wiederholen', 'rv.present': 'Präsentieren',
    'rv.presentWindow': 'In neuem Fenster präsentieren', 'rv.print': 'PDF / Drucken', 'rv.addSlide': 'Folie', 'rv.addSub': 'Unterfolie', 'rv.addBlock': 'Element',
    'rv.slides': 'Folien', 'rv.element': 'Element', 'rv.slide': 'Folie', 'rv.deck': 'Präsentation', 'rv.panels': 'Bereiche',
    'rv.tpl.title': 'Titel', 'rv.tpl.content': 'Titel und Liste', 'rv.tpl.section': 'Abschnitt', 'rv.tpl.image': 'Bild', 'rv.tpl.code': 'Code',
    'rv.tpl.quote': 'Zitat', 'rv.tpl.blank': 'Leer', 'rv.tpl.markdown': 'Markdown', 'rv.tpl.html': 'HTML',
    'rv.type.drawio': 'Diagramm (draw.io)', 'rv.drawDiagram': 'Diagramm zeichnen', 'rv.drawnDiagram': 'Diagramm', 'rv.type.heading': 'Überschrift', 'rv.type.text': 'Text', 'rv.type.list': 'Liste', 'rv.type.image': 'Bild', 'rv.type.code': 'Code',
    'rv.type.quote': 'Zitat', 'rv.type.table': 'Tabelle', 'rv.type.html': 'HTML', 'rv.type.diagram': 'Diagramm (Mermaid)',
    'rv.mermaid': 'Mermaid-Flussdiagramm', 'rv.mermaidHint': 'flowchart TD / LR mit Knoten A[Kasten], B(abgerundet), C{Entscheidung}, D([Start/Ende]) und Verbindungen A --> B, A -->|Text| C; wird automatisch angeordnet.',
    'rv.printNotes': 'Drucken / PDF mit Sprechernotizen', 'rv.dropHint': 'Folien zum Umordnen ziehen; auf die rechte Hälfte einer Folie ablegen, um sie zur Unterfolie zu machen.',
    'rv.duplicate': 'Duplizieren', 'rv.delete': 'Löschen', 'rv.up': 'Nach oben', 'rv.down': 'Nach unten', 'rv.indent': 'Zur Unterfolie der vorigen Folie machen',
    'rv.outdent': 'Zur Hauptfolie machen', 'rv.noElement': 'Klicken Sie ein Element der Folie an, um seine Eigenschaften zu bearbeiten. Doppelklicken Sie einen Text, um ihn zu bearbeiten.',
    'rv.level': 'Ebene', 'rv.fit': 'Text an die Folie anpassen', 'rv.ordered': 'Nummeriert', 'rv.itemFragment': 'Punkte einzeln einblenden', 'rv.chooseImage': 'Bild wählen…',
    'rv.alt': 'Alternativtext', 'rv.width': 'Breite (%)', 'rv.stretch': 'Restliche Höhe füllen', 'rv.language': 'Sprache', 'rv.code': 'Code',
    'rv.lineNumbers': 'Zeilennummern / hervorgehobene Schritte', 'rv.lineNumbersHint': 'leer, „all“ oder Schritte wie 1|2-3|5', 'rv.trim': 'Leerraum entfernen',
    'rv.cite': 'Quelle', 'rv.header': 'Kopfzeile', 'rv.addRow': '+ Zeile', 'rv.addCol': '+ Spalte', 'rv.delRow': '− Zeile', 'rv.delCol': '− Spalte',
    'rv.html': 'HTML', 'rv.fragment': 'Einblenden (Fragment)', 'rv.none': 'keine', 'rv.fragmentIndex': 'Reihenfolge', 'rv.animateId': 'Auto-Animate-ID',
    'rv.align': 'Ausrichtung', 'rv.left': 'links', 'rv.center': 'mittig', 'rv.right': 'rechts', 'rv.size': 'Größe (em)', 'rv.color': 'Farbe',
    'rv.kind': 'Inhalt', 'rv.kind.blocks': 'Elemente', 'rv.kind.markdown': 'Markdown', 'rv.kind.html': 'HTML', 'rv.markdown': 'Markdown',
    'rv.background': 'Hintergrund', 'rv.bgColor': 'Farbe', 'rv.bgGradient': 'Verlauf (CSS)', 'rv.bgImage': 'Bild', 'rv.removeImage': 'Bild entfernen',
    'rv.bgSize': 'Bildgröße', 'rv.bgOpacity': 'Deckkraft des Bildes', 'rv.transition': 'Übergang', 'rv.speed': 'Geschwindigkeit', 'rv.default': 'Standard',
    'rv.autoAnimate': 'Auto-Animate (von der vorigen Folie)', 'rv.visibility': 'Sichtbarkeit', 'rv.visible': 'sichtbar', 'rv.hidden': 'versteckt',
    'rv.uncounted': 'nicht gezählt', 'rv.layout': 'Senkrechte Position', 'rv.layoutCenter': 'mittig', 'rv.layoutTop': 'oben', 'rv.autoSlide': 'Weiter nach (s)',
    'rv.notes': 'Sprechernotizen', 'rv.className': 'CSS-Klasse', 'rv.title': 'Titel', 'rv.lang': 'Sprache (z. B. de, en)', 'rv.theme': 'Design',
    'rv.highlightTheme': 'Code-Farben', 'rv.bgTransition': 'Hintergrundübergang', 'rv.controls': 'Pfeil-Steuerung', 'rv.progress': 'Fortschrittsbalken',
    'rv.slideNumber': 'Foliennummern', 'rv.centerAll': 'Folien senkrecht zentrieren', 'rv.loop': 'Endlos', 'rv.hash': 'Foliennummer in der Adresse',
    'rv.navigation': 'Navigation', 'rv.navDefault': 'Standard', 'rv.navLinear': 'linear', 'rv.navGrid': 'Raster', 'rv.deckAutoSlide': 'Automatisch weiter nach (s, 0 = aus)',
    'rv.format': 'Foliengröße', 'rv.view': 'Ansicht', 'rv.viewSlides': 'Folien', 'rv.viewScroll': 'scrollende Seite', 'rv.css': 'Eigenes CSS',
    'rv.fileName': 'Dateiname', 'rv.saveFormat': 'Format', 'rv.fmtHtml': 'reveal.js-Präsentation (HTML)', 'rv.fmtMd': 'Markdown (nur Text)', 'rv.fmtPptx': 'PowerPoint (.pptx)',
    'rv.pptxLossy': 'Die Blöcke werden von oben nach unten auf PowerPoint-Folien angeordnet; Texte, Listen, Bilder, Tabellen, Notizen, Übergänge und Fragmente werden übernommen, Designs und eigenes HTML nur ungefähr.',
    'rv.convertedPptx': 'Die PowerPoint-Datei wurde in Web-Folien umgewandelt; Speichern erzeugt eine HTML-Präsentation.',
    'rv.trustAsk': 'Diese Präsentation enthält Skripte oder andere aktive Inhalte (etwa <script>-Elemente, Ereignis-Handler oder javascript:-Links). Sie sind gesperrt: Die Folien werden angezeigt, ohne sie auszuführen. Erlauben Sie sie nur, wenn Sie der Datei und ihrer Herkunft vertrauen – die Skripte laufen dann ungeschützt mit den Rechten dieser App und könnten Ihre Daten in der Suite (Einstellungen, gespeicherte Verbindungen, geöffnete Dateien) lesen, ändern oder weitergeben.',
    'rv.trustAllow': 'Skripte erlauben (ungeschützt)', 'rv.trustKeep': 'Gesperrt lassen',
    'rv.scriptsOff': 'Skripte gesperrt', 'rv.scriptsOn': 'Skripte erlaubt',
    'rv.scriptsOffTitle': 'Die Skripte dieser Präsentation sind gesperrt. Klicken, um zu entscheiden, ob sie laufen dürfen.', 'rv.scriptsOnTitle': 'Die Skripte dieser Präsentation laufen ungeschützt. Klicken, um sie wieder zu sperren.',
    'rv.savedBlocked': 'Die Skripte dieser Präsentation bleiben in der gespeicherten Datei gesperrt. Erlauben Sie Skripte, wenn die Präsentation sie braucht.',
    'rv.cancel': 'Abbrechen', 'rv.ok': 'OK', 'rv.discard': 'Die ungespeicherten Änderungen verwerfen?', 'rv.untitled': 'praesentation', 'rv.cannotOpen': '„{0}“ kann nicht geöffnet werden: {1}',
    'rv.blocked': 'Der Browser hat das neue Fenster blockiert. Erlauben Sie Pop-ups für diese Seite.', 'rv.exitPresent': 'Präsentation beenden', 'rv.linkUrl': 'Linkadresse',
    'rv.bold': 'Fett', 'rv.italic': 'Kursiv', 'rv.underline': 'Unterstrichen', 'rv.strike': 'Durchgestrichen', 'rv.inlineCode': 'Code', 'rv.link': 'Link',
    'rv.clearFormat': 'Formatierung entfernen', 'rv.textColor': 'Textfarbe', 'rv.done': 'Fertig', 'rv.mdLossy': 'Markdown behält die Texte, nicht Layout und Design.',
    'rv.presentHint': 'Tasten: → ← ↑ ↓ oder Leertaste zum Blättern, O Übersicht, S Sprechernotizen, F Vollbild, Esc Übersicht.',
  },
});

// ---- embedded reveal.js assets ------------------------------------------------------------------------------------

const embedded = (id) => { const el = document.getElementById(id); return el ? el.textContent : ''; };
const FONTS = JSON.parse(embedded('themes-json') || '{}');
function assets(deck) {
  return {
    reveal: embedded('asset-reveal'),
    plugins: Object.fromEntries(['RevealHighlight', 'RevealMarkdown', 'RevealNotes', 'RevealZoom', 'RevealSearch'].map((p) => [p, embedded(`asset-${p}`)])),
    css: {
      reveal: embedded('css-reveal'), theme: embedded(`css-theme-${deck.theme}`) || embedded('css-theme-black'),
      fonts: (FONTS[deck.theme] || []).map((f) => embedded(`css-font-${f.replace(/\.css$/, '')}`)).join('\n'),
      highlight: embedded(`css-hl-${deck.highlightTheme}`) || embedded('css-hl-monokai'),
    },
    math: { katex: embedded('asset-katex'), autoRender: embedded('asset-katex-auto-render'), css: embedded('css-katex') },
  };
}

// ---- state ----------------------------------------------------------------------------------------------------------

const state = {
  deck: newDeck(), name: '', handle: null, dirty: false, trusted: false,
  h: 0, v: 0, block: null, editing: null, tab: 'slide', panels: null, dialog: null, presenting: false,
};
const history = new Suite.UndoHistory({ onChange: () => render() });

let queued = false;
function render() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; Suite.shell.refresh(); });
}
const fail = (e) => { console.warn(e); Suite.shell.toast(Suite.i18n.describe(e), 'error'); };
const deck = () => state.deck;
const current = () => slideAt(deck(), state.h, state.v) || deck().slides[0];
const currentBlock = () => (state.block ? current().blocks.find((b) => b.id === state.block) || null : null);

/** Record the state before a change (coalesce: key for typing in one field). */
const record = (coalesce = null) => history.record(state.deck, coalesce);

/** After a change: mark dirty and refresh the preview (not for texts edited inside the preview). */
function changed({ preview = true } = {}) {
  state.dirty = true;
  Suite.shell.setDirty(true);
  if (preview) schedulePreview();
  render();
}

/** Change something with undo: edit(fn, coalesce) runs fn on the deck. */
function edit(fn, coalesce = null, options = {}) {
  record(coalesce);
  fn(state.deck);
  changed(options);
}

function undoStep(redo) {
  stopEditing(false);
  const snap = redo ? history.redo(state.deck) : history.undo(state.deck);
  if (!snap) return;
  state.deck = snap;
  const count = deck().slides.length;
  if (state.h >= count) state.h = count - 1;
  if (state.v > deck().slides[state.h].children.length) state.v = deck().slides[state.h].children.length;
  if (state.block && !currentBlock()) state.block = null;
  changed();
}

// ---- preview (reveal.js in a frame) -----------------------------------------------------------------------------------

// a new frame for every rebuild: changing srcdoc would add history entries (and confuses automation in Firefox)
function makeFrame() {
  const f = document.createElement('iframe');
  f.className = 'rv-preview';
  f.dataset.testid = 'preview';
  f.title = 'Preview';
  return f;
}
let frame = makeFrame();
let previewTimer = null;
let previewVersion = 0;

const EDITOR_CSS = `<style>
.reveal [data-block] { cursor: pointer; outline-offset: 4px; }
.reveal [data-block]:hover { outline: 2px dashed rgba(66,139,202,.6); }
.reveal [data-block].suite-selected { outline: 3px solid rgba(66,139,202,.95); }
.reveal [data-block][contenteditable=true] { outline: 3px solid rgba(255,140,0,.95); cursor: text; }
.reveal .suite-placeholder { border: 3px dashed rgba(128,128,128,.6); padding: 1em 2em; font-size: 2em; display: inline-block; }
</style>`;

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(updatePreview, 120);
}

/** Rebuild the preview deck and go to the current slide. */
function updatePreview() {
  clearTimeout(previewTimer);
  const version = ++previewVersion;
  const page = renderPage(deck(), assets(deck()), {
    editable: true, trusted: state.trusted,
    config: { hash: false, history: false, transition: 'none', backgroundTransition: 'none', fragments: false, autoSlide: 0, loop: false,
      keyboardCondition: 'focused', view: null, autoAnimate: false, scrollActivationWidth: null }, // no automatic scroll view in a narrow preview
    extraHead: EDITOR_CSS,
  });
  const next = makeFrame();
  next.onload = () => { if (version === previewVersion && next === frame) attachPreview(); };
  next.srcdoc = page;
  if (frame.parentElement) frame.replaceWith(next);
  frame = next;
}

function previewWindow() { return frame.contentWindow && frame.contentWindow.Reveal ? frame.contentWindow : null; }

function attachPreview() {
  const win = previewWindow();
  if (!win) return;
  const reveal = win.Reveal;
  const go = () => {
    reveal.slide(state.h, state.v, 0);
    markSelected();
    document.body.dataset.preview = String(previewVersion); // for tests
  };
  if (reveal.isReady()) go(); else reveal.on('ready', go);
  reveal.on('slidechanged', (e) => {
    if (e.indexh === state.h && e.indexv === state.v) return;
    stopEditing();
    state.h = e.indexh;
    state.v = e.indexv;
    state.block = null;
    render();
  });
  const doc = win.document;
  doc.addEventListener('click', (e) => {
    const el = e.target.closest('[data-block]');
    if (state.editing && el && el.dataset.block === state.editing) return;
    stopEditing();
    state.block = el ? el.dataset.block : null;
    if (el) state.tab = 'element';
    markSelected();
    render();
  });
  doc.addEventListener('dblclick', (e) => {
    const el = e.target.closest('[data-block]');
    if (el) startEditing(el.dataset.block);
  });
  doc.addEventListener('keydown', (e) => {
    if (state.editing) {
      if (e.key === 'Escape') { e.preventDefault(); stopEditing(); }
      return;
    }
    shortcuts(e);
  });
}

function blockElement(id) {
  const win = previewWindow();
  return win ? win.document.querySelector(`[data-block="${id}"]`) : null;
}

function markSelected() {
  const win = previewWindow();
  if (!win) return;
  for (const el of win.document.querySelectorAll('.suite-selected')) el.classList.remove('suite-selected');
  if (state.block) { const el = blockElement(state.block); if (el) el.classList.add('suite-selected'); }
}

const TEXT_TYPES = ['heading', 'text', 'list', 'quote', 'table', 'html'];

/** Edit the texts of a block directly in the preview (contentEditable). */
function startEditing(id) {
  const b = current().blocks.find((x) => x.id === id);
  const el = blockElement(id);
  if (!b || !el || !TEXT_TYPES.includes(b.type)) return;
  stopEditing();
  state.block = id;
  state.editing = id;
  state.tab = 'element';
  const cite = el.querySelector(':scope > cite, :scope > br + cite');
  if (el.suiteSource != null && el.querySelector('.katex')) el.innerHTML = el.suiteSource; // edit the TeX, not the typeset formula
  if (b.type === 'quote' && cite) { cite.previousElementSibling && cite.previousElementSibling.tagName === 'BR' && cite.previousElementSibling.remove(); cite.remove(); }
  el.contentEditable = 'true';
  el.focus();
  const win = previewWindow();
  win.Reveal.configure({ keyboard: false });
  const sel = win.getSelection();
  sel.selectAllChildren(el);
  sel.collapseToEnd();
  el.addEventListener('input', () => readBack(b, el, true));
  markSelected();
  render();
}

/** Copy the edited contents of a preview element into the block. */
function readBack(b, el, typing) {
  const apply = (target) => {
    if (b.type === 'list') target.items = [...el.querySelectorAll(':scope > li')].map((li) => li.innerHTML);
    else if (b.type === 'table') target.rows = [...el.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => c.innerHTML));
    else target.html = el.innerHTML;
  };
  edit(() => { const target = current().blocks.find((x) => x.id === b.id); if (target) apply(target); }, typing ? `text:${b.id}` : null, { preview: false });
}

function stopEditing(refresh = true) {
  if (!state.editing) return;
  const id = state.editing;
  state.editing = null;
  const el = blockElement(id);
  const win = previewWindow();
  if (el) { el.contentEditable = 'false'; el.blur(); }
  if (win) win.Reveal.configure({ keyboard: true });
  if (refresh) schedulePreview(); // re-render (e.g. quote source, empty items)
  render();
}

/** Formatting commands for the text being edited (document.execCommand in the preview). */
function format(command, value = null) {
  const win = previewWindow();
  if (!win || !state.editing) return;
  if (command === 'code') {
    const text = win.getSelection().toString();
    win.document.execCommand('insertHTML', false, `<code>${text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</code>`);
  } else win.document.execCommand(command, false, value);
  const b = current().blocks.find((x) => x.id === state.editing);
  if (b) readBack(b, blockElement(b.id), false);
}

// ---- slides -------------------------------------------------------------------------------------------------------

function select(h, v) {
  stopEditing();
  state.h = h;
  state.v = v;
  state.block = null;
  const win = previewWindow();
  if (win && typeof win.Reveal.slide === 'function') win.Reveal.slide(h, v, 0); // a new preview moves there itself when ready
  render();
}

function addSlide(template, sub = false) {
  const slide = newSlide(template);
  edit((d) => {
    if (sub) {
      const stack = d.slides[state.h];
      stack.children.splice(state.v, 0, slide);
      state.v += 1;
    } else {
      d.slides.splice(state.h + 1, 0, { ...slide, children: [] });
      state.h += 1;
      state.v = 0;
    }
  });
  state.block = null;
}

function removeSlide() {
  edit((d) => {
    const stack = d.slides[state.h];
    if (state.v) { stack.children.splice(state.v - 1, 1); state.v -= 1; return; }
    if (stack.children.length) {
      // the first sub-slide takes the place of the stack
      const [first, ...rest] = stack.children;
      d.slides[state.h] = { ...first, children: rest };
      return;
    }
    d.slides.splice(state.h, 1);
    if (!d.slides.length) d.slides.push({ ...newSlide('title'), children: [] });
    state.h = Math.min(state.h, d.slides.length - 1);
  });
  state.block = null;
}

function cloneSlide(s) {
  const copy = structuredClone(s);
  copy.id = newId('s');
  copy.blocks = copy.blocks.map((b) => ({ ...b, id: newId('b') }));
  return copy;
}

function duplicateSlide() {
  edit((d) => {
    const stack = d.slides[state.h];
    if (state.v) { stack.children.splice(state.v, 0, cloneSlide(stack.children[state.v - 1])); state.v += 1; return; }
    const copy = cloneSlide(stack);
    copy.children = stack.children.map(cloneSlide);
    d.slides.splice(state.h + 1, 0, copy);
    state.h += 1;
  });
}

function moveSlide(dir) {
  edit((d) => {
    if (state.v) {
      const list = d.slides[state.h].children;
      const i = state.v - 1, j = i + dir;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      state.v = j + 1;
    } else {
      const j = state.h + dir;
      if (j < 0 || j >= d.slides.length) return;
      [d.slides[state.h], d.slides[j]] = [d.slides[j], d.slides[state.h]];
      state.h = j;
    }
  });
}

/**
 * Move a slide by drag and drop: before the target slide (at the target's level), or into the target main slide as its last
 * sub-slides. A moved main slide takes its sub-slides along.
 */
function dropSlide(fromId, toId, into) {
  if (fromId === toId) return;
  edit((d) => {
    const at = (id) => { for (let h = 0; h < d.slides.length; h++) { if (d.slides[h].id === id) return { h, v: 0 }; const v = d.slides[h].children.findIndex((c) => c.id === id); if (v >= 0) return { h, v: v + 1 }; } return null; };
    const src = at(fromId);
    if (!src) return;
    if (!src.v && into && d.slides[src.h].children.some((c) => c.id === toId)) return; // not into its own sub-slides
    // take the slide out (a main slide with its sub-slides; its first sub-slide becomes the main slide when only the head moves)
    let moving;
    if (src.v) moving = [d.slides[src.h].children.splice(src.v - 1, 1)[0]];
    else { const { children, ...head } = d.slides.splice(src.h, 1)[0]; moving = [head, ...children]; }
    const dst = at(toId);
    if (!dst) return;
    if (into && !dst.v) {
      d.slides[dst.h].children.push(...moving.map(({ children, ...s }) => s));
      state.h = dst.h; state.v = d.slides[dst.h].children.length - moving.length + 1;
    } else if (dst.v) {
      d.slides[dst.h].children.splice(dst.v - 1, 0, ...moving.map(({ children, ...s }) => s));
      state.h = dst.h; state.v = dst.v;
    } else {
      const [head, ...rest] = moving;
      d.slides.splice(dst.h, 0, { ...head, children: src.v ? [] : rest });
      state.h = dst.h; state.v = 0;
    }
  });
}

/** Make the current main slide (with its sub-slides) sub-slides of the previous one, or a sub-slide a main slide. */
function indent(make) {
  edit((d) => {
    if (make && !state.v && state.h > 0) {
      const { children, ...slide } = d.slides[state.h];
      const target = d.slides[state.h - 1];
      target.children.push(slide, ...children);
      d.slides.splice(state.h, 1);
      state.h -= 1;
      state.v = target.children.length - children.length;
    } else if (!make && state.v) {
      const stack = d.slides[state.h];
      const [slide, ...after] = stack.children.splice(state.v - 1);
      d.slides.splice(state.h + 1, 0, { ...slide, children: after });
      state.h += 1;
      state.v = 0;
    }
  });
}

// ---- blocks ---------------------------------------------------------------------------------------------------------

/** Render the SVG of a diagram block from its Mermaid source (errors are shown in the inspector). */
function diagramSvg(source) {
  try { return { svg: mermaidSvg(source).svg, error: '' }; } catch (e) { return { svg: '', error: e.message }; }
}

function addBlock(type) {
  const block = newBlock(type);
  if (type === 'diagram') Object.assign(block, diagramSvg(block.source));
  edit(() => {
    const s = current();
    if (s.kind !== 'blocks') return;
    const i = state.block ? s.blocks.findIndex((b) => b.id === state.block) : s.blocks.length - 1;
    s.blocks.splice(i + 1, 0, block);
  });
  state.block = block.id;
  state.tab = 'element';
  if (type === 'image') chooseImage((src) => updateBlock({ src }));
}

function updateBlock(values, coalesce = null) {
  const id = state.block;
  edit(() => { const b = current().blocks.find((x) => x.id === id); if (b) Object.assign(b, values); }, coalesce);
}

function blockOp(op) {
  const id = state.block;
  edit(() => {
    const list = current().blocks;
    const i = list.findIndex((b) => b.id === id);
    if (i < 0) return;
    if (op === 'delete') { list.splice(i, 1); state.block = null; } else if (op === 'duplicate') {
      const copy = { ...structuredClone(list[i]), id: newId('b') };
      list.splice(i + 1, 0, copy);
      state.block = copy.id;
    } else {
      const j = i + (op === 'up' ? -1 : 1);
      if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]];
    }
  });
}

// ---- draw.io diagrams in image blocks (shared/js/diagram-embed.js) --------------------------------------------------

const isDiagramBlock = (b) => !!(b && b.type === 'image' && b.src && Suite.diagrams && Suite.diagrams.isDiagram(b.src));

/** Set the picture of an image block (wherever it is now; one undo step). */
function setBlockImage(id, src) {
  edit(() => { for (const { slide } of flatten(state.deck)) { const b = (slide.blocks || []).find((x) => x.id === id); if (b) b.src = src; } });
}

/** Draw a new diagram into the selected image block, or into a new one (blockId: null). */
function drawDiagram(blockId = state.block) {
  let id = blockId;
  if (!id) {
    const block = newBlock('image', { alt: t('rv.drawnDiagram') });
    edit(() => {
      const s = current();
      if (s.kind !== 'blocks') return;
      const i = state.block ? s.blocks.findIndex((b) => b.id === state.block) : s.blocks.length - 1;
      s.blocks.splice(i + 1, 0, block);
    });
    id = block.id;
    state.block = id;
    state.tab = 'element';
  }
  Suite.diagrams.insert({ onSave: (res) => setBlockImage(id, res.src) });
}

function editDiagramBlock(id = state.block) {
  const b = flatten(state.deck).flatMap(({ slide }) => slide.blocks || []).find((x) => x.id === id);
  if (isDiagramBlock(b)) Suite.diagrams.edit({ src: b.src, onSave: (res) => setBlockImage(id, res.src) });
}

function chooseImage(onDone) {
  Suite.files.open({ types: [{ description: 'Images', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif'] } }] }).then(async (picked) => {
    if (!picked) return;
    const file = picked[0].file;
    const url = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(file); });
    onDone(url, file);
  }).catch(fail);
}

function updateSlide(values, coalesce = null) {
  edit(() => Object.assign(current(), values), coalesce);
}

/** Switch the content kind of the slide; element slides become HTML or Markdown with their rendered HTML. */
function setKind(kind) {
  const s = current();
  if (s.kind === kind) return;
  edit(() => {
    const htmlNow = s.kind === 'markdown' ? '' : s.kind === 'html' ? s.html : s.blocks.map((b) => renderBlock(b)).join('\n');
    if (kind === 'html') s.html = s.html || htmlNow;
    if (kind === 'markdown') s.markdown = s.markdown || htmlNow;
    if (kind === 'blocks' && !s.blocks.length && s.html) s.blocks = [newBlock('html', { html: s.html })];
    s.kind = kind;
  });
  state.block = null;
}

// ---- files ----------------------------------------------------------------------------------------------------------

// recovery copies of unsaved work (shared/js/autosave.js)
Suite.autosave.register({
  app: APP,
  save: () => (state.dirty ? { name: state.name, handle: state.handle, deck: structuredClone(state.deck) } : null),
  restore: (s) => { setDeck(s.deck, s.name, s.handle || null); changed(); },
});

function setDeck(d, name, handle = null) {
  stopEditing(false);
  Object.assign(state, { deck: d, name, handle, dirty: false, trusted: false, h: 0, v: 0, block: null });
  history.clear();
  Suite.shell.setDirty(false);
  updatePreview();
  render();
}

async function confirmDiscard() { return !state.dirty || Suite.shell.confirm(t('rv.discard')); }

async function openPicked({ file, handle }) {
  try {
    const stem = file.name.replace(/\.[^.]+$/, '');
    if (/\.pptx$/i.test(file.name)) { // PowerPoint: converted into blocks (saving creates a web presentation next to it)
      setDeck(normalizeDeck(pptxToWebSlides(importPptx(await file.arrayBuffer()), { title: stem })), `${stem}.html`, null);
      Suite.shell.toast(t('rv.convertedPptx'), 'warning');
      return;
    }
    const text = await file.text();
    let d;
    let keepHandle = handle;
    if (/\.ipynb$/i.test(file.name)) { d = fromNotebook(text, stem); keepHandle = null; } else if (/\.(md|markdown)$/i.test(file.name)) { d = fromMarkdown(text, stem); keepHandle = null; } else d = fromHtml(text);
    // Markdown and notebooks are converted; saving creates a presentation next to them
    setDeck(d, keepHandle ? file.name : `${stem}.html`, keepHandle);
    if (handle && keepHandle) Suite.files.remember(APP, handle);
    if (hasActiveContent(d)) await askTrust();
  } catch (e) {
    Suite.shell.toast(t('rv.cannotOpen', file.name, e.message), 'error');
  }
}

/**
 * Scripts in slides are blocked (renderPage's Content Security Policy). A presentation that brings its own scripts can be
 * trusted – then they run unprotected, with the rights of this app – after the user was told what that means.
 */
async function askTrust() {
  const ok = await Suite.shell.confirm(t('rv.trustAsk'), { ok: t('rv.trustAllow'), cancel: t('rv.trustKeep') });
  if (!ok || state.trusted) return;
  state.trusted = true;
  updatePreview();
  render();
}

function untrust() {
  state.trusted = false;
  updatePreview();
  render();
}

async function openFile() {
  if (!(await confirmDiscard())) return;
  try {
    const picked = await Suite.files.open({ types: OPEN_TYPES });
    if (picked) await openPicked(picked[0]);
  } catch (e) { fail(e); }
}

function report(result) { if (result.mode === 'downloaded') Suite.shell.banner(result.message); else Suite.shell.toast(result.message); }

const presentationHtml = (d = deck(), config = {}) => renderPage(d, assets(d), { config, trusted: state.trusted });

async function save({ as = false, format = 'html', name = state.name || `${t('rv.untitled')}.html` } = {}) {
  stopEditing(false);
  try {
    if (format === 'pptx') {
      const bytes = await exportPptx(webSlidesToPptx(deck()), deck().title || 'Presentation');
      const result = await Suite.files.saveAs(bytes, { suggestedName: name, types: [{ description: 'PowerPoint', accept: { [PPTX_MIME]: ['.pptx'] } }], type: PPTX_MIME });
      if (result) report(result);
      return;
    }
    if (format === 'md') {
      const result = await Suite.files.saveAs(new TextEncoder().encode(toMarkdown(deck())), { suggestedName: name, types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }], type: 'text/markdown' });
      if (result) report(result);
      return;
    }
    const bytes = new TextEncoder().encode(presentationHtml());
    if (!state.trusted && hasActiveContent(deck())) Suite.shell.toast(t('rv.savedBlocked'), 'warning');
    const types = [{ description: 'HTML', accept: { 'text/html': ['.html'] } }];
    const result = as || !state.handle ? await Suite.files.saveAs(bytes, { suggestedName: name, types, type: 'text/html' })
      : await Suite.files.save({ name, handle: state.handle }, bytes, { type: 'text/html' });
    if (!result) return;
    report(result);
    state.name = result.name || name;
    if (result.handle) state.handle = result.handle;
    state.dirty = false;
    Suite.shell.setDirty(false);
    render();
  } catch (e) { fail(e); }
}

// ---- presenting -------------------------------------------------------------------------------------------------

const presenter = document.createElement('div');
presenter.className = 'rv-presenter';
presenter.dataset.testid = 'presenter';
const presenterFrame = document.createElement('iframe');
presenterFrame.title = 'Presentation';
presenterFrame.dataset.testid = 'presenter-frame';
const presenterClose = document.createElement('button');
presenterClose.className = 'rv-presenter-close';
presenterClose.dataset.testid = 'present-close';
presenterClose.textContent = '×';
presenterClose.addEventListener('click', () => stopPresenting());
presenter.append(presenterFrame, presenterClose);
presenter.hidden = true;
document.body.append(presenter);

const startAt = (h, v) => `<script>Reveal.on('ready', function () { Reveal.slide(${h}, ${v}); });</script>`;

function present() {
  stopEditing(false);
  presenterClose.title = t('rv.exitPresent');
  presenter.hidden = false;
  state.presenting = true;
  presenterFrame.srcdoc = renderPage(deck(), assets(deck()), { config: { hash: false, history: false }, extraBody: startAt(state.h, state.v), trusted: state.trusted });
  presenterFrame.onload = () => presenterFrame.focus();
  if (presenter.requestFullscreen) presenter.requestFullscreen().catch(() => {});
  Suite.shell.toast(t('rv.presentHint'));
}

function stopPresenting() {
  if (!state.presenting) return;
  state.presenting = false;
  presenter.hidden = true;
  presenterFrame.srcdoc = '';
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && state.presenting) stopPresenting(); });

/** Present in a new window (written into about:blank, so that it keeps working offline and speaker notes can open). */
function presentWindow({ print = false, notes = false } = {}) {
  stopEditing(false);
  const win = window.open('about:blank', '_blank');
  if (!win) { Suite.shell.toast(t('rv.blocked'), 'error'); return; }
  const extra = print ? `<script>Reveal.on('ready', function () { setTimeout(function () { window.print(); }, 800); });</script>` : startAt(state.h, state.v);
  win.document.open();
  win.document.write(renderPage(deck(), assets(deck()), { config: print ? { view: 'print', hash: false, ...(notes ? { showNotes: 'separate-page' } : {}) } : { hash: false }, extraBody: extra, trusted: state.trusted }));
  win.document.close();
}

// ---- UI: toolbar and slide list -------------------------------------------------------------------------------------

const TEMPLATES = ['title', 'content', 'section', 'image', 'code', 'quote', 'blank', 'markdown', 'html'];

function Dropdown({ label, testid, items }) {
  return html`<details class="dropdown rv-dropdown" data-testid=${testid}>
    <summary>${label}</summary>
    <ul>${items.map(([key, text, fn]) => html`<li><a href="#" data-testid=${`${testid}-${key}`} onClick=${(e) => { e.preventDefault(); e.target.closest('details').open = false; fn(); }}>${text}</a></li>`)}</ul>
  </details>`;
}

function Toolbar() {
  return html`<nav class="rv-toolbar" role="toolbar">
    <button class="secondary" data-testid="new" onClick=${async () => { if (await confirmDiscard()) setDeck(newDeck(), ''); }}>${t('rv.new')}</button>
    <button class="secondary" data-testid="open" onClick=${openFile}>${t('rv.open')}</button>
    <${Suite.shell.Recent} app=${APP} before=${confirmDiscard} onOpen=${(p) => openPicked(p).catch(fail)} />
    <button class=${state.dirty ? '' : 'secondary outline'} data-testid="save" onClick=${() => save()}>${t('rv.save')}</button>
    <button class="secondary outline" data-testid="save-as" onClick=${() => { state.dialog = { kind: 'saveAs', stem: (state.name || t('rv.untitled')).replace(/\.[^.]+$/, ''), format: 'html' }; render(); }}>${t('rv.saveAs')}</button>
    <span class="rv-sep"></span>
    <button class="secondary outline" title="${t('rv.undo')} (Ctrl+Z)" data-testid="undo" disabled=${!history.canUndo} onClick=${() => undoStep(false)}>↶</button>
    <button class="secondary outline" title="${t('rv.redo')} (Ctrl+Y)" data-testid="redo" disabled=${!history.canRedo} onClick=${() => undoStep(true)}>↷</button>
    <span class="rv-sep"></span>
    <${Dropdown} label=${`+ ${t('rv.addSlide')}`} testid="add-slide" items=${TEMPLATES.map((k) => [k, t(`rv.tpl.${k}`), () => addSlide(k)])} />
    <${Dropdown} label=${`+ ${t('rv.addSub')}`} testid="add-sub" items=${TEMPLATES.map((k) => [k, t(`rv.tpl.${k}`), () => addSlide(k, true)])} />
    ${current().kind === 'blocks' ? html`<${Dropdown} label=${`+ ${t('rv.addBlock')}`} testid="add-block" items=${[...BLOCK_TYPES.map((k) => [k, t(`rv.type.${k}`), () => addBlock(k)]), ['drawio', `📐 ${t('rv.type.drawio')}`, () => drawDiagram(null)]]} />` : null}
    <span class="rv-sep"></span>
    <button data-testid="present" title="F5" onClick=${present}>▶ ${t('rv.present')}</button>
    <button class="secondary outline" title=${t('rv.presentWindow')} aria-label=${t('rv.presentWindow')} data-testid="present-window" onClick=${() => presentWindow()}>↗</button>
    <${Dropdown} label="🖨" testid="print" items=${[['slides', t('rv.print'), () => presentWindow({ print: true })], ['notes', t('rv.printNotes'), () => presentWindow({ print: true, notes: true })]]} />
    ${state.trusted || hasActiveContent(deck()) ? html`<span class="rv-sep"></span>
      <button class=${state.trusted ? 'rv-trusted' : 'secondary outline'} data-testid="scripts" title=${t(state.trusted ? 'rv.scriptsOnTitle' : 'rv.scriptsOffTitle')}
        onClick=${() => (state.trusted ? untrust() : askTrust())}>${state.trusted ? `⚠ ${t('rv.scriptsOn')}` : `🛡 ${t('rv.scriptsOff')}`}</button>` : null}
    <button class="secondary outline rv-only-phone" data-testid="toggle-panels" onClick=${() => { state.panels = state.panels ? null : 'inspector'; render(); }}>☰ ${t('rv.panels')}</button>
  </nav>`;
}

function SlideList() {
  const items = flatten(deck());
  return html`<aside class=${`rv-slides suite-drawer ${state.panels === 'slides' ? 'open' : ''}`} data-testid="slide-list">
    <div class="rv-list-head"><strong>${t('rv.slides')}</strong>
      <span class="rv-list-buttons">
        <button class="secondary outline" title=${t('rv.up')} data-testid="slide-up" onClick=${() => moveSlide(-1)}>↑</button>
        <button class="secondary outline" title=${t('rv.down')} data-testid="slide-down" onClick=${() => moveSlide(1)}>↓</button>
        <button class="secondary outline" title=${t('rv.indent')} data-testid="slide-indent" disabled=${state.v > 0 || state.h === 0} onClick=${() => indent(true)}>⇥</button>
        <button class="secondary outline" title=${t('rv.outdent')} data-testid="slide-outdent" disabled=${state.v === 0} onClick=${() => indent(false)}>⇤</button>
        <button class="secondary outline" title=${t('rv.duplicate')} data-testid="slide-duplicate" onClick=${duplicateSlide}>⧉</button>
        <button class="secondary outline" title=${t('rv.delete')} data-testid="slide-delete" onClick=${removeSlide}>🗑</button>
      </span></div>
    <ol title=${t('rv.dropHint')}>${items.map(({ slide, h, v }) => html`<li key=${slide.id} class=${`${v ? 'sub' : ''} ${h === state.h && v === state.v ? 'active' : ''}`} data-testid="slide-item"
        draggable="true" data-slide=${slide.id}
        onDragStart=${(e) => { e.dataTransfer.setData('application/x-rv-slide', slide.id); e.dataTransfer.effectAllowed = 'move'; }}
        onDragOver=${(e) => {
          if (!e.dataTransfer.types.includes('application/x-rv-slide')) return;
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          e.currentTarget.dataset.drop = !v && e.clientX > r.left + r.width * 0.6 ? 'into' : 'before';
        }}
        onDragLeave=${(e) => { delete e.currentTarget.dataset.drop; }}
        onDrop=${(e) => {
          const from = e.dataTransfer.getData('application/x-rv-slide');
          const into = e.currentTarget.dataset.drop === 'into';
          delete e.currentTarget.dataset.drop;
          if (!from) return;
          e.preventDefault();
          dropSlide(from, slide.id, into);
        }}
        onClick=${() => { if (state.panels === 'slides') state.panels = null; select(h, v); }}>
      <span class="rv-num">${v ? `${h + 1}.${v + 1}` : h + 1}</span>
      <span class="rv-swatch" style=${`background:${(slide.background && (slide.background.color || slide.background.gradient)) || 'transparent'}`}></span>
      <span class="rv-title">${slide.kind === 'markdown' ? 'Ⓜ ' : slide.kind === 'html' ? '‹›' : ''}${slideTitle(slide) || '—'}</span>
    </li>`)}</ol>
  </aside>`;
}

// ---- UI: inspectors -------------------------------------------------------------------------------------------------

/** An input that keeps what is typed (uncontrolled; the value is set again when the target changes via key). */
function Field({ label, value, onInput, type = 'text', testid, area = false, keyed, ...rest }) {
  const input = area
    ? html`<textarea data-testid=${testid} key=${keyed} rows=${rest.rows || 4} spellcheck="false" onInput=${(e) => onInput(e.target.value)}>${value ?? ''}</textarea>`
    : html`<input type=${type} data-testid=${testid} key=${keyed} defaultValue=${value ?? ''} ...${rest} onInput=${(e) => onInput(type === 'number' ? (e.target.value === '' ? '' : +e.target.value) : e.target.value)} />`;
  return html`<label>${label}${input}</label>`;
}

function Select({ label, value, options, onChange, testid }) {
  return html`<label>${label}<select data-testid=${testid} onChange=${(e) => onChange(e.target.value)}>
    ${options.map(([v, text]) => html`<option value=${v} selected=${String(value ?? '') === String(v)}>${text}</option>`)}</select></label>`;
}

function Check({ label, checked, onChange, testid }) {
  return html`<label><input type="checkbox" data-testid=${testid} checked=${!!checked} onChange=${(e) => onChange(e.target.checked)} /> ${label}</label>`;
}

const fragmentOptions = () => FRAGMENTS.map((f) => [f, f || t('rv.none')]);

function ElementInspector() {
  const s = current();
  const b = currentBlock();
  if (s.kind !== 'blocks') return html`<p class="rv-hint">${t('rv.kind')}: ${t(`rv.kind.${s.kind}`)}</p>`;
  if (!b) return html`<p class="rv-hint" data-testid="no-element">${t('rv.noElement')}</p>`;
  const k = (name) => `${b.id}:${name}`;
  const up = (key) => (value) => updateBlock({ [key]: value }, k(key));
  let specific = null;
  if (b.type === 'heading') {
    specific = html`<${Select} label=${t('rv.level')} testid="el-level" value=${b.level} options=${[1, 2, 3, 4].map((n) => [n, `H${n}`])} onChange=${(v) => updateBlock({ level: +v })} />
      <${Check} label=${t('rv.fit')} testid="el-fit" checked=${b.fit} onChange=${(v) => updateBlock({ fit: v })} />`;
  } else if (b.type === 'list') {
    specific = html`<${Check} label=${t('rv.ordered')} testid="el-ordered" checked=${b.ordered} onChange=${(v) => updateBlock({ ordered: v })} />
      <${Select} label=${t('rv.itemFragment')} testid="el-item-fragment" value=${b.itemFragment} options=${fragmentOptions()} onChange=${(v) => updateBlock({ itemFragment: v })} />`;
  } else if (b.type === 'image') {
    specific = html`<div class="rv-buttons"><button type="button" class="secondary outline" data-testid="el-choose-image" onClick=${() => chooseImage((src) => updateBlock({ src }))}>${t('rv.chooseImage')}</button>
      ${isDiagramBlock(b) ? html`<button type="button" class="secondary" data-testid="edit-diagram" onClick=${() => editDiagramBlock(b.id)}>📐 ${t('dia.edit')}</button>`
        : html`<button type="button" class="secondary outline" data-testid="draw-diagram" onClick=${() => drawDiagram(b.id)}>📐 ${t('rv.drawDiagram')}</button>`}</div>
      <${Field} label=${t('rv.alt')} testid="el-alt" keyed=${k('alt')} value=${b.alt} onInput=${up('alt')} />
      <${Field} label=${t('rv.width')} testid="el-width" type="number" min="0" max="100" keyed=${k('width')} value=${b.width || ''} onInput=${(v) => updateBlock({ width: +v || 0 }, k('width'))} />
      <${Check} label=${t('rv.stretch')} testid="el-stretch" checked=${b.stretch} onChange=${(v) => updateBlock({ stretch: v })} />`;
  } else if (b.type === 'code') {
    specific = html`<${Select} label=${t('rv.language')} testid="el-language" value=${b.language} options=${CODE_LANGUAGES.map((l) => [l, l || t('rv.none')])} onChange=${(v) => updateBlock({ language: v })} />
      <${Field} label=${t('rv.code')} testid="el-code" area rows="8" keyed=${k('code')} value=${b.code} onInput=${up('code')} />
      <${Field} label=${t('rv.lineNumbers')} testid="el-lines" keyed=${k('lines')} value=${b.lineNumbers} placeholder=${t('rv.lineNumbersHint')} onInput=${up('lineNumbers')} />
      <${Check} label=${t('rv.trim')} testid="el-trim" checked=${b.trim} onChange=${(v) => updateBlock({ trim: v })} />`;
  } else if (b.type === 'quote') {
    specific = html`<${Field} label=${t('rv.cite')} testid="el-cite" keyed=${k('cite')} value=${b.cite} onInput=${up('cite')} />`;
  } else if (b.type === 'table') {
    const cols = b.rows[0] ? b.rows[0].length : 0;
    specific = html`<${Check} label=${t('rv.header')} testid="el-header" checked=${b.header} onChange=${(v) => updateBlock({ header: v })} />
      <div class="rv-buttons">
        <button type="button" class="secondary outline" data-testid="el-add-row" onClick=${() => updateBlock({ rows: [...b.rows, Array(cols || 1).fill('')] })}>${t('rv.addRow')}</button>
        <button type="button" class="secondary outline" data-testid="el-add-col" onClick=${() => updateBlock({ rows: b.rows.map((r) => [...r, '']) })}>${t('rv.addCol')}</button>
        <button type="button" class="secondary outline" disabled=${b.rows.length < 2} onClick=${() => updateBlock({ rows: b.rows.slice(0, -1) })}>${t('rv.delRow')}</button>
        <button type="button" class="secondary outline" disabled=${cols < 2} onClick=${() => updateBlock({ rows: b.rows.map((r) => r.slice(0, -1)) })}>${t('rv.delCol')}</button>
      </div>`;
  } else if (b.type === 'html') {
    specific = html`<${Field} label=${t('rv.html')} testid="el-html" area rows="8" keyed=${k('html')} value=${b.html} onInput=${up('html')} />`;
  } else if (b.type === 'diagram') {
    specific = html`<${Field} label=${t('rv.mermaid')} testid="el-mermaid" area rows="8" keyed=${k('mermaid')} value=${b.source}
        onInput=${(v) => updateBlock({ source: v, ...diagramSvg(v) }, k('mermaid'))} />
      ${b.error ? html`<p class="rv-error" data-testid="el-mermaid-error">${b.error}</p>` : html`<small>${t('rv.mermaidHint')}</small>`}`;
  }
  return html`<div class="rv-inspector-body" data-testid="element-inspector">
    <div class="rv-row"><strong>${t(`rv.type.${b.type}`)}</strong>
      <span class="rv-buttons">
        <button type="button" class="secondary outline" title=${t('rv.up')} data-testid="el-up" onClick=${() => blockOp('up')}>↑</button>
        <button type="button" class="secondary outline" title=${t('rv.down')} data-testid="el-down" onClick=${() => blockOp('down')}>↓</button>
        <button type="button" class="secondary outline" title=${t('rv.duplicate')} data-testid="el-duplicate" onClick=${() => blockOp('duplicate')}>⧉</button>
        <button type="button" class="secondary outline" title=${t('rv.delete')} data-testid="el-delete" onClick=${() => blockOp('delete')}>🗑</button>
      </span></div>
    ${specific}
    <${Select} label=${t('rv.fragment')} testid="el-fragment" value=${b.fragment} options=${fragmentOptions()} onChange=${(v) => updateBlock({ fragment: v })} />
    ${b.fragment ? html`<${Field} label=${t('rv.fragmentIndex')} testid="el-fragment-index" type="number" min="0" keyed=${k('fi')} value=${b.fragmentIndex ?? ''}
      onInput=${(v) => updateBlock({ fragmentIndex: v === '' ? null : Math.round(v) }, k('fi'))} />` : null}
    <${Field} label=${t('rv.animateId')} testid="el-animate-id" keyed=${k('aid')} value=${b.animateId} onInput=${up('animateId')} />
    <div class="rv-row">
      <${Select} label=${t('rv.align')} testid="el-align" value=${b.align} options=${[['', t('rv.default')], ['left', t('rv.left')], ['center', t('rv.center')], ['right', t('rv.right')]]} onChange=${(v) => updateBlock({ align: v })} />
      <${Field} label=${t('rv.size')} testid="el-size" type="number" step="0.1" min="0" keyed=${k('size')} value=${b.size || ''} onInput=${(v) => updateBlock({ size: +v || 0 }, k('size'))} />
    </div>
    <div class="rv-row">
      <label>${t('rv.color')}<input type="color" data-testid="el-color" value=${b.color || '#000000'} onInput=${(e) => updateBlock({ color: e.target.value }, k('color'))} /></label>
      ${b.color ? html`<button type="button" class="secondary outline" onClick=${() => updateBlock({ color: '' })}>×</button>` : null}
    </div>
  </div>`;
}

function SlideInspector() {
  const s = current();
  const bg = s.background || {};
  const k = (name) => `${s.id}:${name}`;
  const setBg = (values, coalesce = null) => updateSlide({ background: { ...bg, ...values } }, coalesce);
  return html`<div class="rv-inspector-body" data-testid="slide-inspector">
    <${Select} label=${t('rv.kind')} testid="slide-kind" value=${s.kind} options=${['blocks', 'markdown', 'html'].map((x) => [x, t(`rv.kind.${x}`)])} onChange=${setKind} />
    ${s.kind === 'markdown' ? html`<${Field} label=${t('rv.markdown')} testid="slide-markdown" area rows="10" keyed=${k('md')} value=${s.markdown} onInput=${(v) => updateSlide({ markdown: v }, k('md'))} />` : null}
    ${s.kind === 'html' ? html`<${Field} label=${t('rv.html')} testid="slide-html" area rows="10" keyed=${k('html')} value=${s.html} onInput=${(v) => updateSlide({ html: v }, k('html'))} />` : null}
    <fieldset><legend>${t('rv.background')}</legend>
      <div class="rv-row">
        <label>${t('rv.bgColor')}<input type="color" data-testid="slide-bg-color" value=${bg.color || '#ffffff'} onInput=${(e) => setBg({ color: e.target.value }, k('bg'))} /></label>
        ${bg.color ? html`<button type="button" class="secondary outline" data-testid="slide-bg-color-clear" onClick=${() => setBg({ color: '' })}>×</button>` : null}
      </div>
      <${Field} label=${t('rv.bgGradient')} testid="slide-bg-gradient" keyed=${k('grad')} value=${bg.gradient} placeholder="linear-gradient(to bottom, #283b95, #17b2c3)" onInput=${(v) => setBg({ gradient: v }, k('grad'))} />
      <div class="rv-buttons">
        <button type="button" class="secondary outline" data-testid="slide-bg-image" onClick=${() => chooseImage((src) => setBg({ image: src, size: bg.size || 'cover' }))}>${t('rv.bgImage')}…</button>
        ${bg.image ? html`<button type="button" class="secondary outline" data-testid="slide-bg-image-clear" onClick=${() => setBg({ image: '' })}>${t('rv.removeImage')}</button>` : null}
      </div>
      ${bg.image ? html`<${Select} label=${t('rv.bgSize')} testid="slide-bg-size" value=${bg.size || 'cover'} options=${[['cover', 'cover'], ['contain', 'contain'], ['auto', 'auto']]} onChange=${(v) => setBg({ size: v })} />
        <label>${t('rv.bgOpacity')}: ${Math.round((bg.opacity === '' || bg.opacity === undefined ? 1 : bg.opacity) * 100)} %<input type="range" min="0" max="100" data-testid="slide-bg-opacity"
          value=${Math.round((bg.opacity === '' || bg.opacity === undefined ? 1 : bg.opacity) * 100)} onInput=${(e) => setBg({ opacity: +e.target.value / 100 }, k('op'))} /></label>` : null}
    </fieldset>
    <div class="rv-row">
      <${Select} label=${t('rv.transition')} testid="slide-transition" value=${s.transition} options=${[['', t('rv.default')], ...TRANSITIONS.map((x) => [x, x])]} onChange=${(v) => updateSlide({ transition: v })} />
      <${Select} label=${t('rv.speed')} testid="slide-speed" value=${s.transitionSpeed} options=${[['', t('rv.default')], ...SPEEDS.slice(1).map((x) => [x, x])]} onChange=${(v) => updateSlide({ transitionSpeed: v })} />
    </div>
    <${Check} label=${t('rv.autoAnimate')} testid="slide-auto-animate" checked=${s.autoAnimate} onChange=${(v) => updateSlide({ autoAnimate: v })} />
    <div class="rv-row">
      <${Select} label=${t('rv.visibility')} testid="slide-visibility" value=${s.visibility} options=${[['', t('rv.visible')], ['hidden', t('rv.hidden')], ['uncounted', t('rv.uncounted')]]} onChange=${(v) => updateSlide({ visibility: v })} />
      <${Select} label=${t('rv.layout')} testid="slide-layout" value=${s.layout} options=${[['', t('rv.layoutCenter')], ['top', t('rv.layoutTop')]]} onChange=${(v) => updateSlide({ layout: v })} />
    </div>
    <${Field} label=${t('rv.autoSlide')} testid="slide-autoslide" type="number" min="0" keyed=${k('as')} value=${s.autoSlide || ''} onInput=${(v) => updateSlide({ autoSlide: +v || 0 }, k('as'))} />
    <${Field} label=${t('rv.notes')} testid="slide-notes" area rows="4" keyed=${k('notes')} value=${s.notes} onInput=${(v) => updateSlide({ notes: v }, k('notes'))} />
    <${Field} label=${t('rv.className')} testid="slide-class" keyed=${k('cls')} value=${s.className} onInput=${(v) => updateSlide({ className: v }, k('cls'))} />
  </div>`;
}

const FORMATS = [['960x700', '960 × 700 (reveal.js)'], ['1280x720', '1280 × 720 (16:9)'], ['1920x1080', '1920 × 1080 (16:9)'], ['1024x768', '1024 × 768 (4:3)']];

function DeckInspector() {
  const d = deck();
  const c = d.config;
  const setConfig = (values, coalesce = null) => edit(() => Object.assign(d.config, values), coalesce);
  const size = `${c.width}x${c.height}`;
  return html`<div class="rv-inspector-body" data-testid="deck-inspector">
    <${Field} label=${t('rv.title')} testid="deck-title" keyed="title" value=${d.title} onInput=${(v) => edit(() => { d.title = v; }, 'deck:title')} />
    <div class="rv-row">
      <${Select} label=${t('rv.theme')} testid="deck-theme" value=${d.theme} options=${THEMES.map((x) => [x, x])} onChange=${(v) => edit(() => { d.theme = v; })} />
      <${Select} label=${t('rv.highlightTheme')} testid="deck-highlight" value=${d.highlightTheme} options=${[['monokai', 'Monokai'], ['zenburn', 'Zenburn']]} onChange=${(v) => edit(() => { d.highlightTheme = v; })} />
    </div>
    <div class="rv-row">
      <${Select} label=${t('rv.transition')} testid="deck-transition" value=${c.transition} options=${TRANSITIONS.map((x) => [x, x])} onChange=${(v) => setConfig({ transition: v })} />
      <${Select} label=${t('rv.speed')} testid="deck-speed" value=${c.transitionSpeed} options=${SPEEDS.map((x) => [x, x === 'default' ? t('rv.default') : x])} onChange=${(v) => setConfig({ transitionSpeed: v })} />
    </div>
    <${Select} label=${t('rv.bgTransition')} testid="deck-bg-transition" value=${c.backgroundTransition} options=${TRANSITIONS.map((x) => [x, x])} onChange=${(v) => setConfig({ backgroundTransition: v })} />
    <${Select} label=${t('rv.format')} testid="deck-format" value=${FORMATS.some(([v]) => v === size) ? size : ''} options=${[...(FORMATS.some(([v]) => v === size) ? [] : [['', `${c.width} × ${c.height}`]]), ...FORMATS]}
      onChange=${(v) => { if (v) { const [w, h] = v.split('x').map(Number); setConfig({ width: w, height: h }); } }} />
    <${Check} label=${t('rv.controls')} testid="deck-controls" checked=${c.controls} onChange=${(v) => setConfig({ controls: v })} />
    <${Check} label=${t('rv.progress')} testid="deck-progress" checked=${c.progress} onChange=${(v) => setConfig({ progress: v })} />
    <${Check} label=${t('rv.slideNumber')} testid="deck-slide-number" checked=${c.slideNumber} onChange=${(v) => setConfig({ slideNumber: v })} />
    <${Check} label=${t('rv.centerAll')} testid="deck-center" checked=${c.center} onChange=${(v) => setConfig({ center: v })} />
    <${Check} label=${t('rv.loop')} testid="deck-loop" checked=${c.loop} onChange=${(v) => setConfig({ loop: v })} />
    <${Check} label=${t('rv.hash')} testid="deck-hash" checked=${c.hash} onChange=${(v) => setConfig({ hash: v })} />
    <${Select} label=${t('rv.navigation')} testid="deck-navigation" value=${c.navigationMode} options=${[['default', t('rv.navDefault')], ['linear', t('rv.navLinear')], ['grid', t('rv.navGrid')]]} onChange=${(v) => setConfig({ navigationMode: v })} />
    <${Select} label=${t('rv.view')} testid="deck-view" value=${c.view} options=${[['', t('rv.viewSlides')], ['scroll', t('rv.viewScroll')]]} onChange=${(v) => setConfig({ view: v })} />
    <${Field} label=${t('rv.deckAutoSlide')} testid="deck-autoslide" type="number" min="0" keyed="as" value=${c.autoSlide || 0} onInput=${(v) => setConfig({ autoSlide: +v || 0 }, 'deck:as')} />
    <${Field} label=${t('rv.lang')} testid="deck-lang" keyed="lang" value=${d.lang} onInput=${(v) => edit(() => { d.lang = v; }, 'deck:lang')} />
    <${Field} label=${t('rv.css')} testid="deck-css" area rows="5" keyed="css" value=${d.css} onInput=${(v) => edit(() => { d.css = v; }, 'deck:css')} />
  </div>`;
}

function Inspector() {
  const tabs = [['element', t('rv.element')], ['slide', t('rv.slide')], ['deck', t('rv.deck')]];
  return html`<aside class=${`rv-inspector suite-drawer ${state.panels === 'inspector' ? 'open' : ''}`} data-testid="inspector">
    <div class="rv-tabs" role="tablist">${tabs.map(([id, label]) => html`<button role="tab" class=${state.tab === id ? '' : 'secondary outline'} aria-selected=${state.tab === id}
      data-testid=${`tab-${id}`} onClick=${() => { state.tab = id; render(); }}>${label}</button>`)}</div>
    ${state.tab === 'element' ? html`<${ElementInspector} />` : state.tab === 'slide' ? html`<${SlideInspector} />` : html`<${DeckInspector} />`}
  </aside>`;
}

function FormatBar() {
  if (!state.editing) return null;
  const btn = (cmd, label, title, value = null) => html`<button type="button" class="secondary outline" title=${title} data-testid=${`fmt-${cmd}`}
    onMouseDown=${(e) => e.preventDefault()} onClick=${() => format(cmd, value)}>${label}</button>`;
  return html`<div class="rv-formatbar" data-testid="format-bar">
    ${btn('bold', html`<b>B</b>`, t('rv.bold'))}${btn('italic', html`<i>I</i>`, t('rv.italic'))}${btn('underline', html`<u>U</u>`, t('rv.underline'))}
    ${btn('strikeThrough', html`<s>S</s>`, t('rv.strike'))}${btn('code', '‹›', t('rv.inlineCode'))}
    <button type="button" class="secondary outline" title=${t('rv.link')} data-testid="fmt-link" onMouseDown=${(e) => e.preventDefault()}
      onClick=${() => { const url = window.prompt(t('rv.linkUrl'), 'https://'); if (url) format('createLink', url); }}>🔗</button>
    <label class="rv-color" title=${t('rv.textColor')}><input type="color" data-testid="fmt-color" onMouseDown=${(e) => e.stopPropagation()} onInput=${(e) => format('foreColor', e.target.value)} /></label>
    ${btn('removeFormat', '⌫', t('rv.clearFormat'))}
    <button type="button" data-testid="fmt-done" onClick=${() => stopEditing()}>${t('rv.done')}</button>
  </div>`;
}

function Dialog() {
  const d = state.dialog;
  if (!d || d.kind !== 'saveAs') return null;
  return html`<dialog open data-testid="save-dialog"><article>
    <form onSubmit=${(e) => { e.preventDefault(); state.dialog = null; render(); save({ as: true, format: d.format, name: `${d.stem}.${d.format === 'md' ? 'md' : d.format === 'pptx' ? 'pptx' : 'html'}` }); }}>
      <label>${t('rv.fileName')}<input data-testid="save-name" defaultValue=${d.stem} onInput=${(e) => { d.stem = e.target.value; }} /></label>
      <label>${t('rv.saveFormat')}<select data-testid="save-format" onChange=${(e) => { d.format = e.target.value; render(); }}>
        <option value="html" selected=${d.format === 'html'}>${t('rv.fmtHtml')}</option><option value="md" selected=${d.format === 'md'}>${t('rv.fmtMd')}</option>
        <option value="pptx" selected=${d.format === 'pptx'}>${t('rv.fmtPptx')}</option></select></label>
      ${d.format === 'md' ? html`<small>${t('rv.mdLossy')}</small>` : null}
      ${d.format === 'pptx' ? html`<small data-testid="pptx-hint">${t('rv.pptxLossy')}</small>` : null}
      <footer>
        <button type="button" class="secondary" onClick=${() => { state.dialog = null; render(); }}>${t('rv.cancel')}</button>
        <button type="submit" data-testid="save-ok">${t('rv.ok')}</button>
      </footer>
    </form>
  </article></dialog>`;
}

function Main() {
  Suite.shell.setFileName(`${state.name}${state.dirty ? ' •' : ''}`);
  return html`<div class=${`rv-layout ${state.panels ? `panel-${state.panels}` : ''}`}>
    <${SlideList} />
    <div class="rv-center">
      <${FormatBar} />
      <div class="rv-stage" ref=${(el) => { if (el && frame.parentElement !== el) { el.appendChild(frame); updatePreview(); } }}></div>
      <div class="rv-phone-bar rv-only-phone">
        <button class="secondary outline" data-testid="phone-slides" onClick=${() => { state.panels = state.panels === 'slides' ? null : 'slides'; render(); }}>${t('rv.slides')}</button>
        <button class="secondary outline" data-testid="phone-prev" onClick=${() => { const list = flatten(deck()); const i = list.findIndex((x) => x.h === state.h && x.v === state.v); if (i > 0) select(list[i - 1].h, list[i - 1].v); }}>‹</button>
        <span>${flatten(deck()).findIndex((x) => x.h === state.h && x.v === state.v) + 1} / ${flatten(deck()).length}</span>
        <button class="secondary outline" data-testid="phone-next" onClick=${() => { const list = flatten(deck()); const i = list.findIndex((x) => x.h === state.h && x.v === state.v); if (i < list.length - 1) select(list[i + 1].h, list[i + 1].v); }}>›</button>
      </div>
    </div>
    <${Inspector} />${state.panels ? Suite.shell.backdrop(() => { state.panels = null; render(); }) : null}
    <${Dialog} />
  </div>`;
}

// ---- keyboard -------------------------------------------------------------------------------------------------------

function shortcuts(e) {
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (mod && k === 's') { e.preventDefault(); save({ as: e.shiftKey }); return true; }
  if (mod && k === 'o') { e.preventDefault(); openFile(); return true; }
  if (e.key === 'F5') { e.preventDefault(); present(); return true; }
  const undoKey = Suite.UndoHistory.key(e);
  if (undoKey && !state.editing) { e.preventDefault(); undoStep(undoKey === 'redo'); return true; }
  const field = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (!field && !mod && (e.key === 'Delete' || e.key === 'Backspace') && state.block && !state.editing) { e.preventDefault(); blockOp('delete'); return true; }
  if (!field && !mod && e.key === 'Enter' && state.block && !state.editing) { e.preventDefault(); startEditing(state.block); return true; }
  return false;
}

Suite.shell.mount({ id: APP, title: 'app.title', version: '%%BUILD_VERSION%%', toolbar: () => html`<${Toolbar} />`, main: () => html`<${Main} />` });
document.addEventListener('keydown', (e) => { if (state.presenting) { if (e.key === 'Escape' && !document.fullscreenElement) stopPresenting(); return; } shortcuts(e); });
Suite.files.dropZone(document.body, async (picked) => { if (picked.length && await confirmDiscard()) await openPicked(picked[0]); });
Suite.bridge.receive((picked) => openPicked(picked), { app: 'reveal' }); // files opened from other apps ("Open with…")

// for tests
window.RV = { state, history, drawDiagram, editDiagramBlock, presentationHtml, setDeck, normalizeDeck, fromHtml, fromMarkdown, fromNotebook, toMarkdown, previewWindow, updatePreview };
document.body.dataset.ready = 'true';
