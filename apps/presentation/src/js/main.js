/*
 * Presentation editor: own deck model (shared/js/pptx-import.js), DOM/SVG rendering (shared/js/slide-render.js), Moveable for
 * moving, resizing and rotating, PPTX import and export (pptx-export.js, PptxGenJS), presenting, printing.
 */
import Moveable from 'moveable';
import { importPptx } from 'app/pptx-import';
import { exportPptx } from 'app/pptx-export';
import { readOdp, writeOdp } from 'app/odp';
import { renderSlide, renderElement, readText, refreshLists, paragraphProps, setParagraphProps, SLIDE_CSS } from 'app/slide-render';
import { webSlidesToPptx } from 'app/deck-convert';
import { fromHtml, fromMarkdown } from 'app/reveal-deck';
import { createSpelling } from 'app/spelling'; // (the document editor's spelling panel)
import 'app/spell-dom'; // spelling selector in the header, marks in text fields (shared/js/spell-dom.js)

const { html } = Suite.shell;
const t = Suite.t;
const APP = 'presentation';
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const PPTX = { description: 'PowerPoint', accept: { [PPTX_MIME]: ['.pptx'] } };
const ODP_MIME = 'application/vnd.oasis.opendocument.presentation';
const ODP = { description: 'OpenDocument', accept: { [ODP_MIME]: ['.odp'] } };
const isOdp = (name) => /\.odp$/i.test(name || '');
/** The file of the deck in the format of its name (.odp or .pptx). */
const deckBytes = async (name) => (isOdp(name) ? writeOdp(await bakeCrops(state.deck)) : exportPptx(state.deck, name.replace(/\.(pptx|odp)$/i, '')));
const OPEN_TYPES = [{ description: 'PowerPoint', accept: { 'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx', '.potx', '.ppsx'] } },
  { description: 'OpenDocument', accept: { [ODP_MIME]: ['.odp', '.otp'] } },
  { description: 'Web slides (reveal.js)', accept: { 'text/html': ['.html', '.htm'], 'text/markdown': ['.md'] } }];
const FONTS = ['Calibri', 'Arial', 'Times New Roman', 'Georgia', 'Verdana', 'Courier New', 'Segoe UI'];
const SHAPES = ['rect', 'roundRect', 'ellipse', 'triangle', 'diamond', 'hexagon', 'rightArrow', 'star5', 'line'];

Suite.i18n.register({
  en: {
    'pr.convertedWeb': 'The web slides were laid out on PowerPoint slides; saving creates a .pptx file.',
    'pr.transition': 'Transition', 'pr.trType': 'Effect', 'pr.trDir': 'Direction', 'pr.trDuration': 'Duration (s)', 'pr.trAdvance': 'Next slide after (s)', 'pr.onClick': 'on click',
    'pr.trAll': 'Apply to all slides', 'pr.trApplied': 'The transition was applied to all slides.', 'pr.tr.none': 'none', 'pr.tr.fade': 'Fade', 'pr.tr.push': 'Push',
    'pr.tr.wipe': 'Wipe', 'pr.tr.cover': 'Cover', 'pr.tr.zoom': 'Zoom', 'pr.dir.l': 'from the right', 'pr.dir.r': 'from the left', 'pr.dir.u': 'from below', 'pr.dir.d': 'from above',
    'pr.animations': 'Animations', 'pr.animation': 'Animation', 'pr.effect': 'Entrance', 'pr.start': 'Start', 'pr.fx.none': 'none', 'pr.fx.appear': 'Appear', 'pr.fx.fade': 'Fade in',
    'pr.fx.fly': 'Fly in', 'pr.fx.zoom': 'Zoom', 'pr.start.click': 'on click', 'pr.start.with': 'with previous', 'pr.start.after': 'after previous',
    'pr.notes': 'Speaker notes', 'pr.notesHint': 'Notes for this slide (shown in the presenter view, saved in the file)', 'pr.presenterView': 'Presenter view (Alt+F5): notes, timer and next slide here, the slides in a second window',
    'pr.audience': 'audience', 'pr.popupBlocked': 'The audience window was blocked: allow pop-ups for this page.', 'pr.slideOf': 'Slide {0} of {1}', 'pr.endShow': 'End', 'pr.pauseTimer': 'Pause / continue the timer',
    'pr.lastSlide': 'End of the presentation',
    'app.title': 'Presentation', 'pr.new': 'New', 'pr.open': 'Open', 'pr.save': 'Save', 'pr.saveAs': 'Save as', 'pr.format': 'Format', 'pr.odpNote': 'OpenDocument keeps slides, texts, lists, shapes, pictures, tables, groups and notes; transitions and animations are left out.', 'pr.print': 'Print / PDF', 'pr.present': '▶ Present',
    'pr.layout': 'New slide with a layout', 'pr.layout.title': 'Title slide', 'pr.layout.content': 'Title and content', 'pr.layout.two': 'Two contents',
    'pr.layout.section': 'Section header', 'pr.layout.titleOnly': 'Title only', 'pr.layout.blank': 'Blank', 'pr.ph.title': 'Title', 'pr.ph.subtitle': 'Subtitle', 'pr.ph.text': 'Text',
    'pr.media': 'Video/audio', 'pr.mediaHint': 'Insert a video or a sound (played in the show)', 'pr.crop': 'Crop (%)', 'pr.cropReset': 'No cropping', 'pr.cropL': 'Left', 'pr.cropT': 'Top', 'pr.cropR': 'Right', 'pr.cropB': 'Bottom',
    'pr.mediaUnplayable': 'This browser cannot play “{0}” – it is kept in the file.',
    'pr.undo': 'Undo', 'pr.redo': 'Redo', 'pr.text': 'Text box', 'pr.shape': 'Shape', 'pr.image': 'Image', 'pr.diagram': 'Diagram', 'pr.table': 'Table', 'pr.newSlide': 'New slide',
    'pr.duplicateSlide': 'Duplicate slide', 'pr.deleteSlide': 'Delete slide', 'pr.slide': 'Slide', 'pr.background': 'Background', 'pr.size': 'Slide size',
    'pr.position': 'Position and size', 'pr.rotation': 'Rotation', 'pr.fill': 'Fill', 'pr.line': 'Line', 'pr.none': 'none', 'pr.width': 'Width',
    'pr.listBullet': 'Bulleted list', 'pr.listNumber': 'Numbered list', 'pr.indent': 'List level down (Tab)', 'pr.outdent': 'List level up (Shift+Tab)',
    'pr.font': 'Font', 'pr.fontSize': 'Size', 'pr.color': 'Colour', 'pr.bold': 'Bold', 'pr.italic': 'Italic', 'pr.underline': 'Underline',
    'pr.align': 'Alignment', 'pr.anchor': 'Vertical', 'pr.arrange': 'Arrange', 'pr.toFront': 'To front', 'pr.toBack': 'To back', 'pr.duplicate': 'Duplicate',
    'pr.selectedN': '{0} elements selected', 'pr.alignLeft': 'Align left', 'pr.alignCenter': 'Align centres', 'pr.alignRight': 'Align right', 'pr.alignTop': 'Align top',
    'pr.alignMiddle': 'Align middles', 'pr.alignBottom': 'Align bottom', 'pr.distributeH': 'Distribute horizontally', 'pr.distributeV': 'Distribute vertically',
    'pr.alignTo': 'Align: to the slide when one element or group is selected, else to each other', 'pr.group': 'Group (Ctrl+G)', 'pr.ungroup': 'Ungroup (Ctrl+Shift+G)',
    'pr.delete': 'Delete', 'pr.untitled': 'Presentation', 'pr.discard': 'Discard the unsaved changes?', 'pr.newText': 'New text', 'pr.title': 'Click to edit the title',
    'pr.cannotOpen': '“{0}” cannot be opened: {1}', 'pr.noSlides': 'it contains no readable slide', 'pr.slides': '{0} slides', 'pr.panels': 'Format', 'pr.editHint': 'Double-click a text to edit it.',
    'pr.hf': 'Header & footer', 'pr.hfDate': 'Date', 'pr.hfAuto': 'Update automatically', 'pr.hfFixed': 'Fixed', 'pr.hfNumber': 'Slide number', 'pr.hfFooter': 'Footer',
    'pr.hfSkipTitle': 'Not on the title slide (the first slide)', 'pr.hfApply': 'Apply to this slide', 'pr.hfApplyAll': 'Apply to all slides',
    'pr.hideSlide': 'Hide in the show', 'pr.hiddenSlide': 'Hidden in the show', 'pr.toolPen': 'Pen (Ctrl+P)', 'pr.toolLaser': 'Laser pointer (Ctrl+L)',
    'pr.toolErase': 'Erase the ink (E)', 'pr.toolBlack': 'Black screen (B)', 'pr.toolPrev': 'Previous', 'pr.toolNext': 'Next', 'pr.toolEnd': 'End the show (Esc)',
    'pr.cancel': 'Cancel', 'pr.fileName': 'File name', 'pr.templateNote': 'Templates and slide shows are saved as a new .pptx file.',
  },
  de: {
    'pr.convertedWeb': 'Die Web-Folien wurden auf PowerPoint-Folien angeordnet; Speichern erzeugt eine .pptx-Datei.',
    'pr.transition': 'Übergang', 'pr.trType': 'Effekt', 'pr.trDir': 'Richtung', 'pr.trDuration': 'Dauer (s)', 'pr.trAdvance': 'Nächste Folie nach (s)', 'pr.onClick': 'bei Klick',
    'pr.trAll': 'Auf alle Folien anwenden', 'pr.trApplied': 'Der Übergang wurde auf alle Folien angewendet.', 'pr.tr.none': 'keiner', 'pr.tr.fade': 'Verblassen', 'pr.tr.push': 'Schieben',
    'pr.tr.wipe': 'Wischen', 'pr.tr.cover': 'Aufdecken', 'pr.tr.zoom': 'Zoom', 'pr.dir.l': 'von rechts', 'pr.dir.r': 'von links', 'pr.dir.u': 'von unten', 'pr.dir.d': 'von oben',
    'pr.animations': 'Animationen', 'pr.animation': 'Animation', 'pr.effect': 'Eingang', 'pr.start': 'Start', 'pr.fx.none': 'keine', 'pr.fx.appear': 'Erscheinen', 'pr.fx.fade': 'Einblenden',
    'pr.fx.fly': 'Hineinfliegen', 'pr.fx.zoom': 'Zoom', 'pr.start.click': 'bei Klick', 'pr.start.with': 'mit vorheriger', 'pr.start.after': 'nach vorheriger',
    'pr.notes': 'Notizen', 'pr.notesHint': 'Notizen zu dieser Folie (in der Referentenansicht, in der Datei gespeichert)', 'pr.presenterView': 'Referentenansicht (Alt+F5): Notizen, Zeit und nächste Folie hier, die Folien in einem zweiten Fenster',
    'pr.audience': 'Publikum', 'pr.popupBlocked': 'Das Publikumsfenster wurde blockiert: Erlauben Sie Pop-ups für diese Seite.', 'pr.slideOf': 'Folie {0} von {1}', 'pr.endShow': 'Beenden', 'pr.pauseTimer': 'Zeit anhalten / fortsetzen',
    'pr.lastSlide': 'Ende der Präsentation',
    'app.title': 'Präsentation', 'pr.new': 'Neu', 'pr.open': 'Öffnen', 'pr.save': 'Speichern', 'pr.saveAs': 'Speichern unter', 'pr.format': 'Format', 'pr.odpNote': 'OpenDocument behält Folien, Texte, Listen, Formen, Bilder, Tabellen, Gruppen und Notizen; Übergänge und Animationen entfallen.', 'pr.print': 'Drucken / PDF', 'pr.present': '▶ Vorführen',
    'pr.layout': 'Neue Folie mit Layout', 'pr.layout.title': 'Titelfolie', 'pr.layout.content': 'Titel und Inhalt', 'pr.layout.two': 'Zwei Inhalte',
    'pr.layout.section': 'Abschnittsüberschrift', 'pr.layout.titleOnly': 'Nur Titel', 'pr.layout.blank': 'Leer', 'pr.ph.title': 'Titel', 'pr.ph.subtitle': 'Untertitel', 'pr.ph.text': 'Text',
    'pr.media': 'Video/Audio', 'pr.mediaHint': 'Ein Video oder einen Klang einfügen (in der Vorführung abgespielt)', 'pr.crop': 'Zuschneiden (%)', 'pr.cropReset': 'Nicht zuschneiden', 'pr.cropL': 'Links', 'pr.cropT': 'Oben', 'pr.cropR': 'Rechts', 'pr.cropB': 'Unten',
    'pr.mediaUnplayable': 'Dieser Browser kann „{0}“ nicht abspielen – es bleibt in der Datei.',
    'pr.undo': 'Rückgängig', 'pr.redo': 'Wiederholen', 'pr.text': 'Textfeld', 'pr.shape': 'Form', 'pr.image': 'Bild', 'pr.diagram': 'Diagramm', 'pr.table': 'Tabelle', 'pr.newSlide': 'Neue Folie',
    'pr.duplicateSlide': 'Folie duplizieren', 'pr.deleteSlide': 'Folie löschen', 'pr.slide': 'Folie', 'pr.background': 'Hintergrund', 'pr.size': 'Foliengröße',
    'pr.position': 'Position und Größe', 'pr.rotation': 'Drehung', 'pr.fill': 'Füllung', 'pr.line': 'Linie', 'pr.none': 'keine', 'pr.width': 'Breite',
    'pr.listBullet': 'Aufzählung', 'pr.listNumber': 'Nummerierung', 'pr.indent': 'Listenebene tiefer (Tab)', 'pr.outdent': 'Listenebene höher (Umschalt+Tab)',
    'pr.font': 'Schrift', 'pr.fontSize': 'Größe', 'pr.color': 'Farbe', 'pr.bold': 'Fett', 'pr.italic': 'Kursiv', 'pr.underline': 'Unterstrichen',
    'pr.align': 'Ausrichtung', 'pr.anchor': 'Vertikal', 'pr.arrange': 'Anordnen', 'pr.toFront': 'Nach vorne', 'pr.toBack': 'Nach hinten', 'pr.duplicate': 'Duplizieren',
    'pr.selectedN': '{0} Elemente markiert', 'pr.alignLeft': 'Links ausrichten', 'pr.alignCenter': 'Horizontal zentrieren', 'pr.alignRight': 'Rechts ausrichten', 'pr.alignTop': 'Oben ausrichten',
    'pr.alignMiddle': 'Vertikal zentrieren', 'pr.alignBottom': 'Unten ausrichten', 'pr.distributeH': 'Horizontal verteilen', 'pr.distributeV': 'Vertikal verteilen',
    'pr.alignTo': 'Ausrichten: an der Folie, wenn ein Element oder eine Gruppe markiert ist, sonst aneinander', 'pr.group': 'Gruppieren (Strg+G)', 'pr.ungroup': 'Gruppierung aufheben (Strg+Umschalt+G)',
    'pr.delete': 'Löschen', 'pr.untitled': 'Präsentation', 'pr.discard': 'Die ungespeicherten Änderungen verwerfen?', 'pr.newText': 'Neuer Text', 'pr.title': 'Titel durch Klicken bearbeiten',
    'pr.cannotOpen': '„{0}“ kann nicht geöffnet werden: {1}', 'pr.noSlides': 'sie enthält keine lesbare Folie', 'pr.slides': '{0} Folien', 'pr.panels': 'Format', 'pr.editHint': 'Doppelklick auf einen Text bearbeitet ihn.',
    'pr.hf': 'Kopf- & Fußzeile', 'pr.hfDate': 'Datum', 'pr.hfAuto': 'Automatisch aktualisieren', 'pr.hfFixed': 'Fest', 'pr.hfNumber': 'Foliennummer', 'pr.hfFooter': 'Fußzeile',
    'pr.hfSkipTitle': 'Nicht auf der Titelfolie (der ersten Folie)', 'pr.hfApply': 'Für diese Folie übernehmen', 'pr.hfApplyAll': 'Für alle Folien übernehmen',
    'pr.hideSlide': 'In der Vorführung ausblenden', 'pr.hiddenSlide': 'In der Vorführung ausgeblendet', 'pr.toolPen': 'Stift (Strg+P)', 'pr.toolLaser': 'Laserpointer (Strg+L)',
    'pr.toolErase': 'Freihand löschen (E)', 'pr.toolBlack': 'Schwarzer Bildschirm (B)', 'pr.toolPrev': 'Zurück', 'pr.toolNext': 'Weiter', 'pr.toolEnd': 'Vorführung beenden (Esc)',
    'pr.cancel': 'Abbrechen', 'pr.fileName': 'Dateiname', 'pr.templateNote': 'Vorlagen und Bildschirmpräsentationen werden als neue .pptx-Datei gespeichert.',
  },
});

const style = document.createElement('style');
style.textContent = SLIDE_CSS;
document.head.append(style);

// ---- model ----------------------------------------------------------------------------------------------

const run = (text, size = 18, extra = {}) => ({ text, size, bold: false, italic: false, underline: false, strike: false, color: '#000000', font: 'Calibri', ...extra });
const para = (runs, align = 'l') => ({ align, level: 0, bullet: null, runs });
let nextId = 1;
const newId = (prefix) => `${prefix}-n${Date.now().toString(36)}${nextId++}`;
const textElement = (x, y, w, h, paragraphs, extra = {}) => ({
  id: newId('text'), type: 'text', name: 'Text', x, y, w, h, rot: 0, geometry: 'rect', fill: null, line: null,
  text: { anchor: 't', insets: [9.6, 4.8, 9.6, 4.8], paragraphs }, ...extra,
});
const newDeck = () => ({
  width: 960, height: 540,
  slides: [{ id: newId('slide'), background: '#FFFFFF', elements: [textElement(60, 180, 840, 100, [para([run(t('pr.title'), 40, { bold: true })], 'ctr')], { text: { anchor: 'ctr', insets: [9.6, 4.8, 9.6, 4.8], paragraphs: [para([run(t('pr.title'), 40, { bold: true })], 'ctr')] } })] }],
});

const state = {
  deck: newDeck(), current: 0, selected: null, multi: [], name: '', handle: null, dirty: false, undo: [], redo: [],
  presenting: false, presentIndex: 0, panels: false, dialog: null, clipboard: null, hf: null,
};
state.name = `${t('pr.untitled')}.pptx`;
const slide = () => state.deck.slides[state.current];
/** What fields need to render a slide: its number and the language of dates. */
const fieldCtx = (index) => ({ number: index + 1, locale: Suite.i18n.language === 'de' ? 'de-DE' : 'en-US' });
const findElement = (id) => slide().elements.find((e) => e.id === id);
/**
 * The selection: state.selected is the element the panel shows; state.multi the elements chosen with Shift/Ctrl+click, the marquee or
 * Ctrl+A (empty when only one is). An element of a group (el.group) selects its whole group.
 */
function selectionIds() {
  const base = state.multi.length ? state.multi : state.selected ? [state.selected] : [];
  const els = slide().elements;
  const groups = new Set(base.map((id) => (els.find((e) => e.id === id) || {}).group).filter(Boolean));
  return els.filter((e) => base.includes(e.id) || (e.group && groups.has(e.group))).map((e) => e.id);
}
const selectedElements = () => selectionIds().map(findElement).filter(Boolean);

let queued = false;
function render() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; Suite.shell.refresh(); renderStage(); renderThumbs(); });
}
const fail = (e) => { console.warn(e); Suite.shell.toast(Suite.i18n.describe(e), 'error'); };

/** Remember the deck before a change (coalesce: merge quick successive changes of the same kind). */
function record(coalesce = null) {
  const top = state.undo[state.undo.length - 1];
  if (coalesce && top && top.coalesce === coalesce && Date.now() - top.time < 1000) { top.time = Date.now(); return; }
  state.undo.push({ deck: structuredClone(state.deck), current: state.current, coalesce, time: Date.now() });
  if (state.undo.length > 60) state.undo.shift();
  state.redo = [];
}
function changed() { if (!state.dirty) { state.dirty = true; Suite.shell.setDirty(true); } render(); }
function step(from, to) {
  const item = from.pop();
  if (!item) return;
  to.push({ deck: structuredClone(state.deck), current: state.current, time: 0 });
  state.deck = item.deck;
  state.current = Math.min(item.current, state.deck.slides.length - 1);
  select(null);
  changed();
}
const undo = () => step(state.undo, state.redo);
const redo = () => step(state.redo, state.undo);

// ---- stage and thumbnails (rendered imperatively; Preact renders the rest) -----------------------------------

const stageWrap = document.createElement('div');
stageWrap.className = 'pr-stage-wrap';
stageWrap.dataset.testid = 'stage';
const stage = document.createElement('div');
stage.className = 'pr-stage';
stageWrap.append(stage);
const thumbs = document.createElement('div');
thumbs.className = 'pr-thumbs';
thumbs.dataset.testid = 'thumbs';
let moveable = null;
let scale = 1;
let editing = null; // id of the element whose text is being edited

function renderStage() {
  if (editing || !stageWrap.isConnected) return;
  const { width, height } = state.deck;
  scale = Math.max(0.05, Math.min((stageWrap.clientWidth - 32) / width, (stageWrap.clientHeight - 32) / height));
  const view = renderSlide(slide(), state.deck, fieldCtx(state.current));
  stage.replaceChildren(view);
  Object.assign(stage.style, { width: `${width}px`, height: `${height}px`, transform: `scale(${scale})` });
  // the scaled stage still occupies its unscaled size: compensate so that it stays centred
  stage.style.margin = `${(height * (scale - 1)) / 2}px ${(width * (scale - 1)) / 2}px`;
  if (selectionIds().length) attachMoveable(); else if (moveable) { moveable.destroy(); moveable = null; }
}

function renderThumbs() {
  if (!thumbs.isConnected) return;
  const horizontal = thumbs.clientHeight < thumbs.clientWidth;
  const width = horizontal ? 120 : thumbs.clientWidth - 24;
  const s = width / state.deck.width;
  thumbs.replaceChildren(...state.deck.slides.map((sl, i) => {
    const th = document.createElement('div');
    th.className = `pr-thumb${i === state.current ? ' active' : ''}${sl.hidden ? ' hidden-slide' : ''}`;
    if (sl.hidden) th.title = t('pr.hiddenSlide');
    th.dataset.testid = 'thumb';
    th.draggable = true;
    Object.assign(th.style, { width: `${width}px`, height: `${state.deck.height * s}px` });
    const no = document.createElement('span');
    no.className = 'pr-no';
    no.textContent = i + 1;
    const view = renderSlide(sl, state.deck, fieldCtx(i));
    view.style.transform = `scale(${s})`;
    th.append(no, view);
    th.onclick = () => { state.current = i; select(null); render(); };
    th.ondragstart = (e) => { e.dataTransfer.setData('text/x-slide', String(i)); e.dataTransfer.effectAllowed = 'move'; };
    th.ondragover = (e) => { if (e.dataTransfer.types.includes('text/x-slide')) e.preventDefault(); };
    th.ondrop = (e) => { const from = Number(e.dataTransfer.getData('text/x-slide')); if (!Number.isNaN(from)) moveSlide(from, i); };
    return th;
  }));
}

stage.addEventListener('pointerdown', (e) => {
  if (editing) return;
  const target = e.target.closest('.el:not(.locked)');
  const add = e.shiftKey || e.ctrlKey || e.metaKey;
  if (target) { select(target.dataset.id, add); return; }
  if (!add) select(null);
  marquee(e, add);
});

/** Drag on the empty slide: select the elements inside the rectangle (with Shift/Ctrl: add them). */
function marquee(down, add) {
  const origin = stage.getBoundingClientRect();
  const at = (ev) => ({ x: (ev.clientX - origin.left) / scale, y: (ev.clientY - origin.top) / scale });
  const p0 = at(down);
  const box = document.createElement('div');
  box.className = 'pr-marquee';
  box.dataset.testid = 'marquee';
  let rect = null;
  const move = (ev) => {
    const p = at(ev);
    if (!rect && Math.hypot(p.x - p0.x, p.y - p0.y) * scale < 5) return;
    if (!rect) stage.append(box);
    rect = { x: Math.min(p.x, p0.x), y: Math.min(p.y, p0.y), w: Math.abs(p.x - p0.x), h: Math.abs(p.y - p0.y) };
    Object.assign(box.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px`, borderWidth: `${1 / scale}px` });
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    box.remove();
    if (!rect) return;
    const inside = slide().elements.filter((el) => !el.locked && el.x >= rect.x && el.y >= rect.y && el.x + el.w <= rect.x + rect.w && el.y + el.h <= rect.y + rect.h).map((el) => el.id);
    selectMany(add ? [...new Set([...selectionIds(), ...inside])] : inside);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}
stage.addEventListener('dblclick', (e) => {
  const target = e.target.closest('.el:not(.locked)');
  if (target && isDiagramImage(findElement(target.dataset.id))) { editDiagram(target.dataset.id); return; } // a diagram: in the diagram editor
  if (target && isChartImage(findElement(target.dataset.id))) { editChart(target.dataset.id); return; } // a chart: in the chart dialog
  if (target) editText(target.dataset.id, e.target.closest('td'));
});
new ResizeObserver(() => { if (!editing) { renderStage(); renderThumbs(); } }).observe(stageWrap);

/** Select an element (add: toggle it in the selection of several elements); null clears the selection. */
function select(id, add = false) {
  if (add && id) {
    const current = state.multi.length ? state.multi : selectionIds();
    const removing = current.includes(id);
    const group = (findElement(id) || {}).group;
    const members = group ? slide().elements.filter((e) => e.group === group).map((e) => e.id) : [id];
    const next = removing ? current.filter((x) => !members.includes(x)) : [...current, ...members.filter((x) => !current.includes(x))];
    state.multi = next.length > 1 ? next : [];
    state.selected = removing ? next[next.length - 1] || null : id;
  } else {
    state.selected = id;
    state.multi = [];
  }
  if (moveable) { moveable.destroy(); moveable = null; }
  if (state.selected) attachMoveable();
  Suite.shell.refresh();
}
function selectMany(ids) {
  state.multi = ids.length > 1 ? ids : [];
  state.selected = ids[ids.length - 1] || null;
  if (moveable) { moveable.destroy(); moveable = null; }
  if (state.selected) attachMoveable();
  Suite.shell.refresh();
}

function attachMoveable() {
  if (moveable) { moveable.destroy(); moveable = null; }
  const ids = selectionIds();
  if (ids.length > 1) { attachGroupMoveable(ids); return; }
  const id = ids[0];
  if (!id) return;
  const node = stage.querySelector(`.el[data-id="${CSS.escape(id)}"]`);
  const el = findElement(id);
  if (!node || !el) return;
  moveable = new Moveable(stageWrap, {
    // (drag events on the stage only: on the window, Moveable's touch handling swallowed later taps on the panel's buttons)
    target: node, dragContainer: stageWrap, draggable: true, resizable: true, rotatable: true, keepRatio: el.type === 'image',
    throttleDrag: 0, throttleResize: 0, throttleRotate: 0, origin: false, snappable: true, snapCenter: true,
    elementGuidelines: [...stage.querySelectorAll('.el')].filter((n) => n !== node),
    verticalGuidelines: [0, state.deck.width / 2, state.deck.width], horizontalGuidelines: [0, state.deck.height / 2, state.deck.height],
  });
  const start = () => record();
  moveable.on('dragStart', start).on('resizeStart', start).on('rotateStart', start);
  moveable.on('drag', (e) => { el.x = e.left; el.y = e.top; node.style.left = `${e.left}px`; node.style.top = `${e.top}px`; });
  moveable.on('resize', (e) => {
    el.w = e.width; el.h = e.height; el.x = e.drag.left; el.y = e.drag.top;
    Object.assign(node.style, { width: `${e.width}px`, height: `${e.height}px`, left: `${e.drag.left}px`, top: `${e.drag.top}px` });
  });
  moveable.on('rotate', (e) => { el.rot = Math.round(e.rotation * 10) / 10; node.style.transform = e.transform; });
  for (const end of ['dragEnd', 'resizeEnd', 'rotateEnd']) moveable.on(end, (e) => { if (e.isDrag !== false) changed(); else state.undo.pop(); });
}

/** Several elements (or a group): moved and resized together (rotated one by one). */
function attachGroupMoveable(ids) {
  const nodes = ids.map((id) => stage.querySelector(`.el[data-id="${CSS.escape(id)}"]`)).filter(Boolean);
  if (!nodes.length) return;
  moveable = new Moveable(stageWrap, {
    target: nodes, dragContainer: stageWrap, draggable: true, resizable: true, rotatable: false, throttleDrag: 0, throttleResize: 0, origin: false, snappable: true, snapCenter: true,
    elementGuidelines: [...stage.querySelectorAll('.el')].filter((n) => !nodes.includes(n)),
    verticalGuidelines: [0, state.deck.width / 2, state.deck.width], horizontalGuidelines: [0, state.deck.height / 2, state.deck.height],
  });
  const start = () => record();
  moveable.on('dragGroupStart', start).on('resizeGroupStart', start);
  moveable.on('dragGroup', (e) => {
    for (const ev of e.events) {
      const el = findElement(ev.target.dataset.id);
      if (!el) continue;
      el.x = ev.left; el.y = ev.top;
      Object.assign(ev.target.style, { left: `${ev.left}px`, top: `${ev.top}px` });
    }
  });
  moveable.on('resizeGroup', (e) => {
    for (const ev of e.events) {
      const el = findElement(ev.target.dataset.id);
      if (!el) continue;
      el.w = ev.width; el.h = ev.height; el.x = ev.drag.left; el.y = ev.drag.top;
      Object.assign(ev.target.style, { width: `${ev.width}px`, height: `${ev.height}px`, left: `${ev.drag.left}px`, top: `${ev.drag.top}px` });
    }
  });
  for (const end of ['dragGroupEnd', 'resizeGroupEnd']) moveable.on(end, (e) => { if (e.isDrag !== false) changed(); else state.undo.pop(); });
  // the group's frame covers the slide between its elements (dragging anywhere in it moves them): a click there acts on the element
  // under the pointer – only that one (unless the selection is one group), with Shift/Ctrl added or removed, a double click edits it
  moveable.on('clickGroup', (e) => {
    const input = e.inputEvent || {};
    const hit = document.elementsFromPoint(input.clientX, input.clientY).map((n) => n.closest && n.closest('.pr-stage .el:not(.locked)')).find(Boolean);
    if (!hit) { select(null); return; }
    const id = hit.dataset.id;
    if (input.shiftKey || input.ctrlKey || input.metaKey) { select(id, true); return; }
    if (e.isDouble) { editText(id); return; }
    const group = (findElement(id) || {}).group;
    if (!(group && selectionIds().every((x) => (findElement(x) || {}).group === group))) select(id);
  });
}

// ---- text editing ------------------------------------------------------------------------------------------------

function editText(id, cellNode = null) {
  const el = findElement(id);
  if (!el) return;
  if (el.type === 'table') { if (cellNode) editCell(el, cellNode); return; }
  if (el.type === 'image') return;
  record();
  if (!el.text) { el.text = { anchor: 'ctr', insets: [9.6, 4.8, 9.6, 4.8], paragraphs: [para([run('', 18, { color: '#FFFFFF' })], 'ctr')] }; renderStage(); }
  if (moveable) { moveable.destroy(); moveable = null; }
  const box = stage.querySelector(`.el[data-id="${CSS.escape(id)}"] .text`);
  editing = id;
  box.contentEditable = 'true';
  box.dataset.testid = 'text-editor';
  box.focus();
  const range = document.createRange();
  range.selectNodeContents(box);
  range.collapse(false);
  getSelection().removeAllRanges();
  getSelection().addRange(range);
  listKeys(box);
  box.addEventListener('blur', () => {
    box.contentEditable = 'false';
    el.text = readText(box, el.text);
    editing = null;
    changed();
  }, { once: true });
  Suite.shell.refresh();
}

// ---- lists: bullets, numbers and levels of paragraphs (while editing on the paragraph elements, see slide-render.js) ----------

const editBox = () => { const n = document.activeElement; return n && n.closest && n.closest('[contenteditable="true"]'); };
/**
 * Text typed outside the paragraphs (Firefox after "select all" and typing) goes into paragraphs of its own, so that list commands
 * reach it; a selection of all the text stays selected, otherwise the caret goes to the end.
 */
function wrapLoose(box) {
  if (![...box.childNodes].some((n) => n.nodeName !== 'P' && n.nodeName !== 'DIV' && !(n.nodeName === 'BR' && !n.nextSibling))) return;
  const sel = getSelection();
  const all = sel.rangeCount && sel.toString().trim() && sel.toString().trim() === box.textContent.trim();
  let p = null;
  for (const n of [...box.childNodes]) {
    if (n.nodeName === 'P' || n.nodeName === 'DIV') { p = null; continue; }
    if (!p) { p = document.createElement('p'); setParagraphProps(p, { level: 0, bullet: null }); box.insertBefore(p, n); }
    p.append(n);
  }
  const range = document.createRange();
  range.selectNodeContents(all ? box : box.lastElementChild || box);
  if (!all) range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** The paragraph elements of an edited text the selection touches (the caret's paragraph when nothing is selected). */
function selectedParagraphs(box) {
  wrapLoose(box);
  const ps = [...box.children].filter((p) => p.nodeName === 'P' || p.nodeName === 'DIV');
  const sel = getSelection();
  if (!sel.rangeCount) return ps.slice(-1);
  const range = sel.getRangeAt(0);
  const hit = ps.filter((p) => range.intersectsNode(p));
  return hit.length ? hit : ps.slice(-1);
}
const BULLETS = { bullet: { char: '•' }, number: { auto: 'arabicPeriod' } };
const isKind = (bullet, kind) => !!bullet && (kind === 'number' ? !!bullet.auto : !bullet.auto);

/**
 * A list command on the selected paragraphs while editing, or on all paragraphs of the selected elements: 'bullet' and 'number' switch
 * the list on (or off when all are already that kind), 'indent' and 'outdent' change the level (0–8).
 */
function listCommand(kind) {
  const change = (props) => {
    if (kind === 'indent' || kind === 'outdent') return { level: Math.max(0, Math.min(8, (props.level || 0) + (kind === 'indent' ? 1 : -1))) };
    return null;
  };
  const box = editing && editBox();
  if (box) {
    const ps = selectedParagraphs(box);
    const off = ps.every((p) => isKind((paragraphProps(p) || {}).bullet, kind));
    for (const p of ps) {
      if (!paragraphProps(p)) setParagraphProps(p, { level: 0, bullet: null });
      setParagraphProps(p, change(paragraphProps(p)) || { bullet: off ? null : BULLETS[kind] });
    }
    refreshLists(box);
    return;
  }
  const paras = selectedElements().flatMap((el) => (el.type === 'table' ? el.table.rows.flatMap((r) => r.cells.map((c) => c.text).filter(Boolean)) : el.text ? [el.text] : []))
    .flatMap((tx) => tx.paragraphs);
  if (!paras.length) return;
  record();
  const off = paras.every((p) => isKind(p.bullet, kind));
  for (const p of paras) Object.assign(p, change(p) || { bullet: off ? null : { ...BULLETS[kind] } });
  changed();
}

/** Keys of an edited text: Tab / Shift+Tab change the list level, Enter on an empty list paragraph ends the list. */
function listKeys(box) {
  box.addEventListener('input', () => refreshLists(box));
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); listCommand(e.shiftKey ? 'outdent' : 'indent'); return; }
    if (e.key === 'Enter' && !e.shiftKey) {
      const [p] = selectedParagraphs(box);
      const props = paragraphProps(p);
      const empty = p && ![...p.childNodes].some((n) => !(n.classList && n.classList.contains('bullet')) && n.textContent);
      if (props && props.bullet && empty) { e.preventDefault(); setParagraphProps(p, props.level ? { level: props.level - 1 } : { bullet: null }); refreshLists(box); }
    }
  });
}

/** The table cell (model) of a rendered <td> (merged cells are not rendered, as in slide-render.js). */
function cellOf(el, td) {
  const tr = td.parentElement;
  const rowIndex = [...tr.parentElement.children].filter((n) => n.tagName === 'TR').indexOf(tr);
  const row = el.table.rows[rowIndex];
  const visible = row.cells.filter((c) => !c.hMerge && !c.vMerge);
  return visible[[...tr.children].indexOf(td)];
}

function editCell(el, td) {
  const cell = cellOf(el, td);
  if (!cell) return;
  record();
  if (moveable) { moveable.destroy(); moveable = null; }
  editing = el.id;
  td.contentEditable = 'true';
  td.dataset.testid = 'cell-editor';
  td.focus();
  listKeys(td);
  td.addEventListener('blur', () => {
    td.contentEditable = 'false';
    cell.text = readText(td, cell.text || { anchor: 't', insets: [4.8, 2.4, 4.8, 2.4], paragraphs: [para([run('', 14)])] });
    editing = null;
    changed();
  }, { once: true });
}

// ---- commands ---------------------------------------------------------------------------------------------------

function center(w, h) { return { x: Math.round((state.deck.width - w) / 2), y: Math.round((state.deck.height - h) / 2) }; }

function addElement(el) {
  record();
  slide().elements.push(el);
  state.selected = el.id;
  state.multi = [];
  changed();
}

function addText() {
  const { x, y } = center(400, 60);
  const el = textElement(x, y, 400, 60, [para([run(t('pr.newText'), 24)])]);
  addElement(el);
  requestAnimationFrame(() => requestAnimationFrame(() => editText(el.id)));
}

function addShape(geometry) {
  const line = geometry === 'line';
  const w = line ? 300 : 200, h = line ? 0 : 120;
  addElement({ id: newId(geometry), type: 'shape', name: geometry, ...center(w, h), w, h, rot: 0, geometry, fill: line ? null : '#4472C4', line: { color: line ? '#000000' : '#2F528F', width: line ? 2 : 1.33 }, text: null });
}

function addTable(rows = 3, cols = 3) {
  const w = 120 * cols, h = 40 * rows;
  addElement({
    id: newId('table'), type: 'table', name: 'Table', ...center(w, h), w, h, rot: 0, geometry: 'rect', fill: null, line: null, text: null,
    table: { columns: Array(cols).fill(120), rows: Array.from({ length: rows }, (_, r) => ({ height: 40, cells: Array.from({ length: cols }, () => ({ fill: r === 0 ? '#4472C4' : '#E9EBF5', text: { anchor: 't', insets: [4.8, 2.4, 4.8, 2.4], paragraphs: [para([run('', 14, { color: r === 0 ? '#FFFFFF' : '#000000', bold: r === 0 })])] } })) })) },
  });
}

// ---- video and audio (element type media: played in the show) --------------------------------------------------------------

const readDataUrl = (file) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
async function insertMedia() {
  const picked = await Suite.files.open({ types: [{ description: 'Video, audio', accept: { 'video/*': ['.mp4', '.m4v', '.webm', '.ogv', '.mov'], 'audio/*': ['.mp3', '.m4a', '.wav', '.ogg', '.oga', '.opus', '.flac'] } }] }).catch(fail);
  if (!picked) return;
  const file = picked[0].file;
  let src = await readDataUrl(file);
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const mime = { 'audio/wave': 'audio/wav', 'audio/x-wav': 'audio/wav', 'audio/vnd.wave': 'audio/wav', 'audio/x-m4a': 'audio/mp4', 'audio/mp3': 'audio/mpeg' }[file.type] || file.type || { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac' }[ext] || 'video/mp4';
  src = src.replace(/^data:[^;,]*/, `data:${mime}`);
  const kind = mime.startsWith('audio') ? 'audio' : 'video';
  let w = 120, h = 120, poster = null;
  if (kind === 'video') {
    // its size and first frame (the picture PowerPoint shows): from a video element
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.src = src;
    const ok = await new Promise((resolve) => { v.onloadeddata = () => resolve(true); v.onerror = () => resolve(false); setTimeout(() => resolve(false), 8000); });
    if (ok && v.videoWidth) {
      const k = Math.min(1, (state.deck.width * 0.6) / v.videoWidth, (state.deck.height * 0.6) / v.videoHeight);
      w = Math.round(v.videoWidth * k); h = Math.round(v.videoHeight * k);
      try { const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0); poster = c.toDataURL('image/png'); } catch (e) { /* no frame */ }
    } else { w = 480; h = 270; Suite.shell.toast(t('pr.mediaUnplayable', file.name), 'warning'); }
  }
  addElement({ id: newId('media'), type: 'media', name: file.name, ...center(w, h), w, h, rot: 0, geometry: 'rect', fill: null, line: null, text: null, media: { src, kind, ...(poster ? { poster } : {}) } });
}

// ---- cropping pictures (image.crop: the parts cut off, fractions): the visible part keeps its size and place --------------------

function setCrop(side, percent) {
  const el = state.selected && findElement(state.selected);
  if (!el || el.type !== 'image') return;
  const c = { l: 0, t: 0, r: 0, b: 0, ...(el.image.crop || {}) };
  const next = { ...c, [side]: Math.max(0, Math.min(0.95, (Number(percent) || 0) / 100)) };
  if (next.l + next.r > 0.95 || next.t + next.b > 0.95) return;
  record('crop');
  const fw = el.w / (1 - c.l - c.r), fh = el.h / (1 - c.t - c.b); // the whole picture
  el.x += fw * (next.l - c.l); el.y += fh * (next.t - c.t);
  el.w = fw * (1 - next.l - next.r); el.h = fh * (1 - next.t - next.b);
  el.image = { ...el.image };
  if (next.l || next.t || next.r || next.b) el.image.crop = next; else delete el.image.crop;
  changed();
}

/** For formats without cropping (OpenDocument here): a copy of the deck with the cropped part of each picture as the picture. */
async function bakeCrops(deck) {
  const copy = structuredClone(deck);
  for (const el of copy.slides.flatMap((sl) => sl.elements)) {
    const c = el.type === 'image' && el.image && el.image.crop;
    if (!c) continue;
    const img = new Image();
    img.src = el.image.src;
    try { await img.decode(); } catch (e) { continue; }
    const sx = img.naturalWidth * c.l, sy = img.naturalHeight * c.t, sw = img.naturalWidth * (1 - c.l - c.r), sh = img.naturalHeight * (1 - c.t - c.b);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sw)); canvas.height = Math.max(1, Math.round(sh));
    canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    el.image = { src: canvas.toDataURL(/^data:image\/jpe?g/.test(el.image.src) ? 'image/jpeg' : 'image/png', 0.92) };
  }
  return copy;
}

function pickImage() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    const src = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
    const img = new Image();
    img.src = src;
    await img.decode().catch(() => {});
    const k = Math.min(1, (state.deck.width * 0.6) / (img.naturalWidth || 400), (state.deck.height * 0.6) / (img.naturalHeight || 300));
    const w = Math.round((img.naturalWidth || 400) * k), h = Math.round((img.naturalHeight || 300) * k);
    addElement({ id: newId('image'), type: 'image', name: file.name, ...center(w, h), w, h, rot: 0, geometry: 'rect', fill: null, line: null, text: null, image: { src } });
  };
  input.click();
}

// ---- diagrams (shared/js/diagram-embed.js: a PNG with the draw.io diagram inside, edited in the diagram editor) ------

const elementAnywhere = (id) => { for (const sl of state.deck.slides) { const el = sl.elements.find((e) => e.id === id); if (el) return el; } return null; };
const isChartImage = (el) => !!(el && el.type === 'image' && el.image && Suite.charts && Suite.charts.modelOf(el.image.src));

/** A new chart (the dialog first), in the middle of the slide. */
function insertChart() {
  Suite.charts.edit({
    model: Suite.charts.sample(),
    onSave: (model) => {
      const w = 560, h = 336;
      addElement({ id: newId('image'), type: 'image', name: t('ch.chart'), ...center(w, h), w, h, rot: 0, geometry: 'rect', fill: null, line: null, text: null,
        image: { src: Suite.charts.toPng(model, w, h) } });
    },
  });
}
/** Edit a chart picture: drawn again at its size. */
function editChart(id) {
  const el = findElement(id);
  const model = el && isChartImage(el) && Suite.charts.modelOf(el.image.src);
  if (!model) return;
  Suite.charts.edit({
    model,
    onSave: (m) => {
      const now = elementAnywhere(id);
      if (!now) return;
      record();
      now.image = { src: Suite.charts.toPng(m, now.w, now.h) };
      changed();
    },
  });
}

const isDiagramImage = (el) => !!(el && el.type === 'image' && el.image && Suite.diagrams && Suite.diagrams.isDiagram(el.image.src));

/** A new image from the diagram editor: same position and scale (at most the slide's width; one undo step). */
function updateDiagram(id, res) {
  const el = elementAnywhere(id);
  if (!el) return false;
  record();
  const size = Suite.diagrams.newSize(el.image.src, el.w, res, state.deck.width - el.x);
  el.image = { src: res.src };
  el.w = size.width;
  el.h = size.height;
  changed();
  if (state.selected === id) select(id);
  return true;
}

function insertDiagram() {
  let id = null;
  Suite.diagrams.insert({
    onSave: (res) => {
      if (id && updateDiagram(id, res)) return;
      const k = Math.min(1, (state.deck.width * 0.8) / res.width, (state.deck.height * 0.8) / res.height);
      const w = Math.round(res.width * k), h = Math.round(res.height * k);
      id = newId('image');
      addElement({ id, type: 'image', name: t('pr.diagram'), ...center(w, h), w, h, rot: 0, geometry: 'rect', fill: null, line: null, text: null, image: { src: res.src } });
    },
  });
}

function editDiagram(id) {
  const el = elementAnywhere(id);
  if (!isDiagramImage(el)) return;
  Suite.diagrams.edit({ src: el.image.src, onSave: (res) => { updateDiagram(id, res); } });
}

function deleteSelection() {
  const ids = selectionIds();
  if (!ids.length) return;
  record();
  slide().elements = slide().elements.filter((e) => !ids.includes(e.id));
  if (slide().animations) slide().animations = slide().animations.filter((a) => !ids.includes(a.id));
  select(null);
  changed();
}

/** Copies of elements with new ids (and new group ids), moved by offset; added to the slide and selected. */
function addCopies(list, offset = 20) {
  if (!list.length) return;
  record();
  const groups = new Map();
  const copies = list.map((el) => {
    const copy = { ...structuredClone(el), id: newId(el.type), x: el.x + offset, y: el.y + offset };
    if (el.group) { if (!groups.has(el.group)) groups.set(el.group, newId('group')); copy.group = groups.get(el.group); }
    return copy;
  });
  slide().elements.push(...copies);
  changed();
  selectMany(copies.map((c) => c.id));
}
const duplicateElement = () => addCopies(selectedElements());

function reorder(front) {
  const ids = selectionIds();
  if (!ids.length) return;
  record();
  const chosen = slide().elements.filter((e) => ids.includes(e.id));
  const rest = slide().elements.filter((e) => !ids.includes(e.id));
  slide().elements = front ? [...rest, ...chosen] : [...chosen, ...rest];
  changed();
}

// ---- align, distribute, group ----------------------------------------------------------------------------------------

const boundsOf = (els) => {
  const x = Math.min(...els.map((e) => e.x)), y = Math.min(...els.map((e) => e.y));
  return { x, y, w: Math.max(...els.map((e) => e.x + e.w)) - x, h: Math.max(...els.map((e) => e.y + e.h)) - y };
};
/** The selected elements as units that move together: a group is one unit. */
function unitsOf(els) {
  const units = new Map();
  for (const el of els) { const key = el.group || el.id; if (!units.has(key)) units.set(key, []); units.get(key).push(el); }
  return [...units.values()].map((list) => ({ els: list, box: boundsOf(list) }));
}
const moveUnit = (u, dx, dy) => { for (const el of u.els) { el.x = Math.round(el.x + dx); el.y = Math.round(el.y + dy); } };

/** Align the selected units to each other – or, when there is one, to the slide. how: left, center, right, top, middle, bottom. */
function alignSelection(how) {
  const units = unitsOf(selectedElements());
  if (!units.length) return;
  record();
  const box = units.length > 1 ? boundsOf(units.flatMap((u) => u.els)) : { x: 0, y: 0, w: state.deck.width, h: state.deck.height };
  for (const u of units) {
    const b = u.box;
    const dx = { left: box.x - b.x, center: box.x + box.w / 2 - (b.x + b.w / 2), right: box.x + box.w - (b.x + b.w) }[how] || 0;
    const dy = { top: box.y - b.y, middle: box.y + box.h / 2 - (b.y + b.h / 2), bottom: box.y + box.h - (b.y + b.h) }[how] || 0;
    moveUnit(u, dx, dy);
  }
  changed();
}

/** Equal gaps between three or more units, the outer ones staying where they are (horizontal: axis 'x'). */
function distributeSelection(axis) {
  const units = unitsOf(selectedElements());
  if (units.length < 3) return;
  record();
  const [pos, size] = axis === 'x' ? ['x', 'w'] : ['y', 'h'];
  units.sort((a, b) => a.box[pos] - b.box[pos]);
  const first = units[0].box, last = units[units.length - 1].box;
  const gap = (last[pos] + last[size] - first[pos] - units.reduce((n, u) => n + u.box[size], 0)) / (units.length - 1);
  let at = first[pos];
  for (const u of units) {
    const d = at - u.box[pos];
    moveUnit(u, axis === 'x' ? d : 0, axis === 'x' ? 0 : d);
    at += u.box[size] + gap;
  }
  changed();
}

/** Group the selected elements: one group id; the members become neighbours in the stacking order (at the topmost one). */
function groupSelection() {
  const els = selectedElements();
  if (unitsOf(els).length < 2) return;
  record();
  const id = newId('group');
  for (const el of els) el.group = id;
  const list = slide().elements;
  const top = Math.max(...els.map((e) => list.indexOf(e)));
  const before = list.filter((e, i) => i <= top && !els.includes(e));
  slide().elements = [...before, ...list.filter((e) => els.includes(e)), ...list.filter((e, i) => i > top && !els.includes(e))];
  changed();
  selectMany(els.map((e) => e.id));
}
function ungroupSelection() {
  const els = selectedElements().filter((e) => e.group);
  if (!els.length) return;
  record();
  for (const el of els) delete el.group;
  changed();
  selectMany(els.map((e) => e.id));
}

// ---- layouts of new slides: title and text boxes in the places of PowerPoint's built-in layouts -------------------------------

const LAYOUTS = ['title', 'content', 'two', 'section', 'titleOnly', 'blank'];
function layoutElements(kind) {
  const W = state.deck.width, H = state.deck.height, m = Math.round(W * 0.0625);
  const box = (x, y, w, h, paragraphs, anchor, type, name) => textElement(Math.round(x), Math.round(y), Math.round(w), Math.round(h), paragraphs,
    { name, placeholder: { type }, text: { anchor, insets: [9.6, 4.8, 9.6, 4.8], paragraphs } });
  const title = (y, h, size, align = 'l', anchor = 'ctr') => box(m, y, W - 2 * m, h, [para([run(t('pr.ph.title'), size)], align)], anchor, 'title', t('pr.ph.title'));
  const sub = (y, h, size, align) => box(m, y, W - 2 * m, h, [para([run(t('pr.ph.subtitle'), size, { color: '#595959' })], align)], 't', 'subTitle', t('pr.ph.subtitle'));
  const body = (x, w) => box(x, H * 0.26, w, H * 0.66, [{ ...para([run(t('pr.ph.text'), 24)]), bullet: { char: '•' } }], 't', 'body', t('pr.ph.text'));
  switch (kind) {
    case 'title': return [title(H * 0.27, H * 0.26, 44, 'ctr', 'b'), sub(H * 0.56, H * 0.18, 24, 'ctr')];
    case 'content': return [title(H * 0.05, H * 0.17, 36), body(m, W - 2 * m)];
    case 'two': return [title(H * 0.05, H * 0.17, 36), body(m, (W - 2 * m - 24) / 2), body(m + (W - 2 * m + 24) / 2, (W - 2 * m - 24) / 2)];
    case 'section': return [title(H * 0.34, H * 0.22, 40, 'l', 'b'), sub(H * 0.58, H * 0.14, 20, 'l')];
    case 'titleOnly': return [title(H * 0.05, H * 0.17, 36)];
    default: return [];
  }
}

function addSlide(copy = false, layout = null) {
  record();
  const sl = copy ? { ...structuredClone(slide()), id: newId('slide') } : { id: newId('slide'), background: slide().background || '#FFFFFF', elements: layout ? layoutElements(layout) : [] };
  if (copy) {
    const ids = new Map();
    for (const e of sl.elements) { const id = newId(e.type); ids.set(e.id, id); e.id = id; }
    if (sl.animations) sl.animations = sl.animations.filter((a) => ids.has(a.id)).map((a) => ({ ...a, id: ids.get(a.id) }));
  }
  state.deck.slides.splice(state.current + 1, 0, sl);
  state.current += 1;
  select(null);
  changed();
}

function deleteSlide() {
  if (state.deck.slides.length < 2) return;
  record();
  state.deck.slides.splice(state.current, 1);
  state.current = Math.min(state.current, state.deck.slides.length - 1);
  select(null);
  changed();
}

function moveSlide(from, to) {
  if (from === to || to < 0 || to >= state.deck.slides.length) return;
  record();
  const [sl] = state.deck.slides.splice(from, 1);
  state.deck.slides.splice(to, 0, sl);
  state.current = to;
  changed();
}

/** Apply fn to every run of the selected element (or, while editing, format the selected text). */
function formatRuns(prop, value, command) {
  if (editing && command) { document.execCommand(command, false, value); return; }
  const els = selectedElements(); // (all selected elements)
  if (!els.length) return;
  const texts = els.flatMap((el) => (el.type === 'table' ? el.table.rows.flatMap((r) => r.cells.map((c) => c.text).filter(Boolean)) : el.text ? [el.text] : []));
  if (!texts.length) return;
  record(`run-${prop}`);
  const runs = texts.flatMap((tx) => tx.paragraphs.flatMap((p) => p.runs));
  const v = typeof value === 'function' ? value(runs) : value;
  for (const r of runs) r[prop] = v;
  changed();
}

function setProp(fn, coalesce) {
  const el = state.selected && findElement(state.selected);
  if (!el) return;
  record(coalesce);
  fn(el);
  changed();
}
/** fn for each selected element (fill, line, nudging). */
function setPropAll(fn, coalesce) {
  const els = selectedElements();
  if (!els.length) return;
  record(coalesce);
  els.forEach(fn);
  changed();
}

// ---- files --------------------------------------------------------------------------------------------------------

async function confirmDiscard() { return !state.dirty || Suite.shell.confirm(t('pr.discard')); }

// recovery copies of unsaved work (shared/js/autosave.js)
Suite.autosave.register({
  app: APP,
  save: () => (state.dirty ? { name: state.name, handle: state.handle, deck: structuredClone(state.deck) } : null),
  restore: (s) => { load(s.deck, s.name, s.handle || null); changed(); },
});

function load(deck, name, handle) {
  if (!deck || !Array.isArray(deck.slides) || !deck.slides.length) throw new Error(t('pr.noSlides')); // (a damaged file)
  Object.assign(state, { deck, current: 0, name, handle, dirty: false, undo: [], redo: [] });
  select(null);
  Suite.shell.setDirty(false);
  render();
}

async function openPicked({ file, handle }) {
  try {
    if (/\.(html?|md)$/i.test(file.name)) { // web slides: laid out on PowerPoint slides; saving creates a .pptx next to it
      const text = await file.text();
      const stem = file.name.replace(/\.[^.]+$/, '');
      load(webSlidesToPptx(/\.md$/i.test(file.name) ? fromMarkdown(text, stem) : fromHtml(text)), `${stem}.pptx`, null);
      Suite.shell.toast(t('pr.convertedWeb'), 'warning');
      return;
    }
    const odf = /\.(odp|otp)$/i.test(file.name);
    const deck = odf ? readOdp(await file.arrayBuffer()) : importPptx(await file.arrayBuffer());
    const copy = /\.(potx|ppsx|otp)$/i.test(file.name);
    load(deck, copy ? file.name.replace(/\.\w+$/, odf ? '.odp' : '.pptx') : file.name, copy ? null : handle);
    if (copy) Suite.shell.toast(t('pr.templateNote'), 'warning');
    if (handle && !copy) Suite.files.remember(APP, handle);
  } catch (e) { console.warn(e); Suite.shell.toast(t('pr.cannotOpen', file.name, e.message), 'error'); }
}

async function open() {
  if (!(await confirmDiscard())) return;
  const picked = await Suite.files.open({ types: OPEN_TYPES }).catch(fail);
  if (picked) await openPicked(picked[0]);
}

async function save(as = false, name = state.name) {
  if (editing) document.activeElement.blur();
  try {
    const bytes = await deckBytes(name);
    const [types, type] = isOdp(name) ? [[ODP], ODP_MIME] : [[PPTX], PPTX_MIME];
    const result = as || !state.handle ? await Suite.files.saveAs(bytes, { suggestedName: name, types, type })
      : await Suite.files.save({ name, handle: state.handle }, bytes, { type });
    if (!result) return;
    if (result.mode === 'downloaded') Suite.shell.banner(result.message); else Suite.shell.toast(result.message);
    Object.assign(state, { name: result.name || name, handle: result.handle || state.handle, dirty: false });
    Suite.shell.setDirty(false);
    render();
  } catch (e) { fail(e); }
}

/** Print every slide on its own landscape page (the browser's "Save as PDF" gives a PDF). */
function print() {
  const box = document.createElement('div');
  box.id = 'pr-print';
  const pageStyle = document.createElement('style');
  pageStyle.textContent = `@page { size: ${state.deck.width}px ${state.deck.height}px; margin: 0; }`;
  state.deck.slides.forEach((sl, i) => {
    const pg = document.createElement('div');
    pg.className = 'pr-print-page';
    pg.append(renderSlide(sl, state.deck, fieldCtx(i)));
    box.append(pg);
  });
  document.body.append(pageStyle, box);
  const done = () => { box.remove(); pageStyle.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(() => { if (box.isConnected && !window.matchMedia('print').matches) done(); }, 1000);
}

// ---- presenting ---------------------------------------------------------------------------------------------------

const presenter = document.createElement('div');
presenter.className = 'pr-presenter';
presenter.dataset.testid = 'presenter';
presenter.hidden = true;
document.body.append(presenter);

// ---- transitions and animations in the show ----------------------------------------------------------

const EFFECT_MS = 500;

/** Click groups of a slide's entrance animations: a "click" starts a group, "with"/"after" join the group before. */
function animationGroups(sl) {
  const ids = new Set(sl.elements.map((e) => e.id));
  const groups = [];
  for (const a of sl.animations || []) {
    if (!ids.has(a.id)) continue;
    if (!groups.length || a.start === 'click') groups.push([]);
    groups[groups.length - 1].push(a);
  }
  return groups;
}
/** Groups shown when a slide starts: a first group without "on click" plays by itself. */
const startStep = (sl) => { const g = animationGroups(sl); return g.length && g[0][0].start !== 'click' ? 1 : 0; };

/** Hide the elements of the groups that have not been played yet (shown = number of played groups). */
function applyReveal(view, sl, shown) {
  animationGroups(sl).slice(shown).flat().forEach((a) => { const d = view.querySelector(`[data-id="${CSS.escape(a.id)}"]`); if (d) d.style.visibility = 'hidden'; });
}

function playGroup(view, group, delay0 = 0) {
  let delay = delay0;
  group.forEach((a, i) => {
    if (a.start === 'after' && i > 0) delay += EFFECT_MS;
    const d = view.querySelector(`[data-id="${CSS.escape(a.id)}"]`);
    if (!d) return;
    const frames = { fade: [{ opacity: 0 }, { opacity: 1 }], fly: [{ translate: `0 ${state.deck.height}px`, opacity: 0 }, { translate: '0 0', opacity: 1 }], zoom: [{ scale: '0.2', opacity: 0 }, { scale: '1', opacity: 1 }] }[a.effect];
    if (!frames || !d.animate) { setTimeout(() => { d.style.visibility = 'visible'; }, delay); return; }
    d.animate(frames, { duration: EFFECT_MS, delay, fill: 'backwards', easing: 'ease-out' });
    d.style.visibility = 'visible';
  });
}

/** Slide transition between two rendered (scaled) views; dir l/r/u/d: the direction the new slide moves in. */
function playTransition(oldView, view, tr, s) {
  const ms = Math.max(100, (tr.duration || 0.75) * 1000);
  const w = state.deck.width * s, h = state.deck.height * s;
  const off = { l: [w, 0], r: [-w, 0], u: [0, h], d: [0, -h] }[tr.dir] || [w, 0];
  const at = ([x, y]) => `${x}px ${y}px`;
  const opts = { duration: ms, easing: 'ease-in-out', fill: 'forwards' };
  let anim;
  if (tr.type === 'push') {
    anim = view.animate([{ translate: at(off) }, { translate: '0 0' }], opts);
    oldView.animate([{ translate: '0 0' }, { translate: at([-off[0], -off[1]]) }], opts);
  } else if (tr.type === 'cover') anim = view.animate([{ translate: at(off) }, { translate: '0 0' }], opts);
  else if (tr.type === 'wipe') {
    const from = { l: 'inset(0 0 0 100%)', r: 'inset(0 100% 0 0)', u: 'inset(100% 0 0 0)', d: 'inset(0 0 100% 0)' }[tr.dir] || 'inset(0 0 0 100%)';
    anim = view.animate([{ clipPath: from }, { clipPath: 'inset(0 0 0 0)' }], opts);
  } else if (tr.type === 'zoom') anim = view.animate([{ scale: '0.3', opacity: 0 }, { scale: '1', opacity: 1 }], opts);
  else anim = view.animate([{ opacity: 0 }, { opacity: 1 }], opts);
  anim.finished.then(() => oldView.remove(), () => oldView.remove());
  return ms;
}

let autoTimer = null;
/** The slide's automatic advance ("advance after n seconds"). */
function scheduleAuto() {
  clearTimeout(autoTimer);
  const tr = state.deck.slides[state.presentIndex].transition;
  if (tr && tr.advanceAfter > 0 && state.presenting) autoTimer = setTimeout(() => advance(1), tr.advanceAfter * 1000);
}

/** Show the current slide; `enter`: it was just entered forwards (transition, first automatic group). */
function showPresented({ enter = false } = {}) {
  const { width, height } = state.deck;
  const sl = state.deck.slides[state.presentIndex];
  const view = renderSlide(sl, state.deck, { ...fieldCtx(state.presentIndex), play: true }); // (videos and sounds with controls)
  const s = Math.min(window.innerWidth / width, window.innerHeight / height);
  Object.assign(view.style, { transform: `scale(${s})`, flex: 'none' });
  const auto = enter ? startStep(sl) : 0;
  applyReveal(view, sl, state.presentStep - auto);
  const old = presenter.querySelector('.slide');
  // (the tools' overlays first: they are fixed, and the current slide view stays the last child)
  presenter.replaceChildren(...showOverlays(), ...(enter && sl.transition && old ? [old, view] : [view]));
  presenter.dataset.index = state.presentIndex;
  presenter.dataset.step = state.presentStep;
  const wait = enter && sl.transition && old && view.animate ? playTransition(old, view, sl.transition, s) : 0;
  if (auto) playGroup(view, animationGroups(sl)[0], wait);
  if (enter) scheduleAuto();
  requestAnimationFrame(redrawInk);
}

/** The next slide in the show from index in direction delta (hidden slides are skipped), or -1. */
function visibleFrom(index, delta) {
  for (let i = index; i >= 0 && i < state.deck.slides.length; i += delta) if (!state.deck.slides[i].hidden) return i;
  return -1;
}

function present(fromStart = false) {
  if (editing) document.activeElement.blur();
  // from the start: the first slide that is not hidden; from the current slide: that one, even if hidden (as in PowerPoint)
  state.presentIndex = fromStart ? Math.max(0, visibleFrom(0, 1)) : state.current;
  state.presentStep = startStep(state.deck.slides[state.presentIndex]);
  state.presenting = true;
  select(null);
  presenter.hidden = false;
  resetShowTools();
  showPresented();
  if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
}

function endPresentation() {
  clearTimeout(autoTimer);
  resetShowTools();
  state.presenting = false;
  presenter.hidden = true;
  if (state.console) endConsole();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

function advance(delta) {
  clearTimeout(autoTimer);
  const sl = state.deck.slides[state.presentIndex];
  const groups = animationGroups(sl);
  // animations of the slide first: the next click group, or back to the one before
  if (delta > 0 && state.presentStep < groups.length) {
    state.presentStep += 1;
    if (state.console) showConsole();
    else { const view = presenter.querySelector('.slide:last-child'); presenter.dataset.step = state.presentStep; if (view) playGroup(view, groups[state.presentStep - 1]); else showPresented(); }
    scheduleAuto();
    return;
  }
  if (delta < 0 && state.presentStep > startStep(sl)) {
    state.presentStep -= 1;
    if (state.console) showConsole(); else showPresented();
    return;
  }
  const next = visibleFrom(state.presentIndex + delta, delta);
  if (next < 0 && delta > 0) { if (!state.console) endPresentation(); return; }
  if (next < 0) return;
  state.presentIndex = next;
  const target = state.deck.slides[next];
  state.presentStep = delta < 0 ? animationGroups(target).length : startStep(target); // going back shows the slide complete
  if (state.console) { showConsole(); scheduleAuto(); } else showPresented({ enter: delta > 0 });
}

// ---- presenter view: a console with notes, timer and the next slide; the audience sees the slide in a second window

/** A slide rendered into a box, scaled to fit. */
function renderInto(box, index, shown = null) {
  const { width, height } = state.deck;
  const sl = state.deck.slides[index];
  if (!box || !sl) { if (box) box.replaceChildren(); return; }
  const view = renderSlide(sl, state.deck, fieldCtx(index));
  if (shown !== null) applyReveal(view, sl, shown);
  const s = Math.min(box.clientWidth / width, box.clientHeight / height) || 0.1;
  Object.assign(view.style, { transform: `scale(${s})`, transformOrigin: '0 0', position: 'absolute', left: `${(box.clientWidth - width * s) / 2}px`, top: `${(box.clientHeight - height * s) / 2}px` });
  box.replaceChildren(view);
}

let audience = null;
function writeAudience() {
  const doc = audience.document;
  doc.open();
  doc.write('<!doctype html><html><head><meta charset="utf-8"><title></title></head><body></body></html>');
  doc.close();
  doc.title = `${state.name} – ${t('pr.audience')}`;
  for (const style of document.querySelectorAll('style')) doc.head.append(doc.importNode(style, true));
  const base = doc.createElement('style');
  base.textContent = 'html,body{margin:0;height:100%;background:#000;overflow:hidden;cursor:none}#stage{position:absolute;inset:0}';
  doc.head.append(base);
  const stage = doc.createElement('div');
  stage.id = 'stage';
  doc.body.append(stage);
  doc.addEventListener('keydown', onPresentKey);
  doc.addEventListener('click', () => advance(1));
  audience.addEventListener('resize', () => renderAudience());
}

function renderAudience() {
  if (!audience || audience.closed) return;
  const stage = audience.document.getElementById('stage');
  if (stage) renderInto(stage, state.presentIndex, state.presentStep);
}

function startConsole() {
  if (editing) document.activeElement.blur();
  select(null);
  state.presentIndex = state.current;
  state.presentStep = startStep(state.deck.slides[state.presentIndex]);
  state.presenting = true;
  state.console = { started: Date.now(), paused: null };
  audience = window.open('', 'suite-audience', 'popup,width=1024,height=600');
  if (audience) writeAudience(); else Suite.shell.toast(t('pr.popupBlocked'), 'warning');
  consoleEl.hidden = false;
  showConsole();
  clearInterval(state.console.timer);
  state.console.timer = setInterval(updateClock, 500);
}

function endConsole() {
  clearInterval(state.console.timer);
  state.console = null;
  state.presenting = false;
  consoleEl.hidden = true;
  if (audience && !audience.closed) audience.close();
  audience = null;
  Suite.shell.refresh();
}

const consoleEl = document.createElement('div');
consoleEl.className = 'pr-console';
consoleEl.dataset.testid = 'console';
consoleEl.hidden = true;
consoleEl.innerHTML = `<header><span data-testid="console-timer" class="pr-timer">00:00</span><span data-testid="console-clock" class="pr-clock"></span>
  <span data-testid="console-count"></span><span class="pr-console-buttons"><button type="button" data-act="prev">◀</button><button type="button" data-act="next">▶</button>
  <button type="button" data-act="pause" data-testid="console-pause">⏸</button><button type="button" data-act="reset">⟲</button><button type="button" data-act="end" data-testid="console-end"></button></span></header>
  <div class="pr-console-current" data-testid="console-current"></div>
  <div class="pr-console-side"><div class="pr-console-next" data-testid="console-next"></div><div class="pr-console-notes" data-testid="console-notes"></div></div>`;
document.body.append(consoleEl);
consoleEl.addEventListener('click', (e) => {
  const act = e.target.closest('button') && e.target.closest('button').dataset.act;
  if (act === 'prev') advance(-1);
  if (act === 'next') advance(1);
  if (act === 'end') endPresentation();
  if (act === 'reset' && state.console) { state.console.started = Date.now(); if (state.console.paused) state.console.paused = Date.now(); updateClock(); }
  if (act === 'pause' && state.console) {
    const c = state.console;
    if (c.paused) { c.started += Date.now() - c.paused; c.paused = null; } else c.paused = Date.now();
    updateClock();
  }
});

function updateClock() {
  const c = state.console;
  if (!c) return;
  const elapsed = Math.floor(((c.paused || Date.now()) - c.started) / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  consoleEl.querySelector('[data-testid=console-timer]').textContent = `${elapsed >= 3600 ? `${Math.floor(elapsed / 3600)}:` : ''}${pad(Math.floor(elapsed / 60) % 60)}:${pad(elapsed % 60)}`;
  consoleEl.querySelector('[data-testid=console-timer]').classList.toggle('paused', !!c.paused);
  consoleEl.querySelector('[data-testid=console-clock]').textContent = new Date().toLocaleTimeString(Suite.i18n.language === 'de' ? 'de-AT' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
}

function showConsole() {
  const i = state.presentIndex, n = state.deck.slides.length;
  consoleEl.querySelector('[data-testid=console-count]').textContent = t('pr.slideOf', i + 1, n);
  consoleEl.querySelector('[data-testid=console-end]').textContent = t('pr.endShow');
  consoleEl.querySelector('[data-testid=console-pause]').title = t('pr.pauseTimer');
  renderInto(consoleEl.querySelector('[data-testid=console-current]'), i, state.presentStep);
  const next = consoleEl.querySelector('[data-testid=console-next]');
  const following = visibleFrom(i + 1, 1);
  if (following >= 0) renderInto(next, following); else next.replaceChildren(Object.assign(document.createElement('p'), { textContent: t('pr.lastSlide') }));
  consoleEl.querySelector('[data-testid=console-notes]').textContent = state.deck.slides[i].notes || '';
  consoleEl.dataset.index = i;
  updateClock();
  renderAudience();
}
window.addEventListener('resize', () => { if (state.console) showConsole(); });

let touchX = null;
presenter.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
presenter.addEventListener('touchend', (e) => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  touchX = null;
  if (show.tool || show.blank || e.target.closest('.pr-show-tools')) return; // (drawing, pointing, the tools; a tap on black is a click)
  if (Math.abs(dx) > 40) advance(dx < 0 ? 1 : -1); else advance(1);
});
presenter.addEventListener('click', (e) => {
  if (e.target.closest('.pr-show-tools')) return;
  if (show.blank) { setBlank(null); return; } // a click returns from the black screen
  if (show.tool) return; // drawing or pointing
  if (e.pointerType !== 'touch') advance(1);
});

// ---- tools of the show: pen, laser pointer, black and white screen -----------------------------------------------
// The ink belongs to the show (kept per slide until it ends, not saved); strokes are kept in slide coordinates, so they follow
// resizing.

const show = { tool: null, blank: null, stroke: null, hideTimer: 0 };
const ink = new Map(); // slide index -> [[ [x, y], … ] stroke, …]
const inkCanvas = Object.assign(document.createElement('canvas'), { className: 'pr-ink' });
inkCanvas.dataset.testid = 'show-ink';
const laserDot = Object.assign(document.createElement('div'), { className: 'pr-laser', hidden: true });
laserDot.dataset.testid = 'show-laser-dot';
const blankEl = Object.assign(document.createElement('div'), { className: 'pr-blank', hidden: true });
blankEl.dataset.testid = 'show-blank';
const showTools = Object.assign(document.createElement('div'), { className: 'pr-show-tools' });
showTools.dataset.testid = 'show-tools';
const TOOL_BUTTONS = [['prev', '◀\uFE0E', 'pr.toolPrev'], ['next', '▶\uFE0E', 'pr.toolNext'], ['pen', '✎', 'pr.toolPen'], ['laser', '●', 'pr.toolLaser'], ['erase', '⌫', 'pr.toolErase'], ['black', '■', 'pr.toolBlack'], ['end', '✕', 'pr.toolEnd']];
function renderShowTools() {
  showTools.replaceChildren(...TOOL_BUTTONS.map(([act, icon, title]) => {
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: icon, title: t(title) });
    b.dataset.act = act;
    b.dataset.testid = `show-${act}`;
    if (act === show.tool || (act === 'black' && show.blank)) b.setAttribute('aria-pressed', 'true');
    return b;
  }));
}
showTools.addEventListener('click', (e) => {
  const act = e.target.closest('button') && e.target.closest('button').dataset.act;
  if (act === 'prev') advance(-1);
  if (act === 'next') advance(1);
  if (act === 'pen' || act === 'laser') setTool(act);
  if (act === 'erase') eraseInk();
  if (act === 'black') setBlank(show.blank ? null : '#000');
  if (act === 'end') endPresentation();
});
const showOverlays = () => [inkCanvas, laserDot, blankEl, showTools];

/** The presented slide's place on the screen and its scale. */
function slideBox() {
  const view = presenter.querySelector('.slide:last-child');
  const r = view ? view.getBoundingClientRect() : { left: 0, top: 0, width: state.deck.width };
  return { left: r.left, top: r.top, scale: r.width / state.deck.width };
}

function redrawInk() {
  const dpr = window.devicePixelRatio || 1;
  inkCanvas.width = Math.round(window.innerWidth * dpr);
  inkCanvas.height = Math.round(window.innerHeight * dpr);
  const ctx = inkCanvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  const { left, top, scale } = slideBox();
  ctx.strokeStyle = '#E8112D';
  ctx.lineWidth = Math.max(2, 3 * scale);
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const stroke of ink.get(state.presentIndex) || []) {
    ctx.beginPath();
    stroke.forEach(([x, y], i) => (i ? ctx.lineTo(left + x * scale, top + y * scale) : ctx.moveTo(left + x * scale, top + y * scale)));
    if (stroke.length === 1) ctx.lineTo(left + stroke[0][0] * scale + 0.1, top + stroke[0][1] * scale);
    ctx.stroke();
  }
}

function setTool(tool) {
  show.tool = show.tool === tool ? null : tool;
  presenter.dataset.tool = show.tool || '';
  laserDot.hidden = show.tool !== 'laser';
  renderShowTools();
}

function eraseInk() { ink.delete(state.presentIndex); redrawInk(); }

function setBlank(color) {
  show.blank = color;
  blankEl.hidden = !color;
  if (color) blankEl.style.background = color;
  presenter.dataset.blank = color ? (color === '#000' ? 'black' : 'white') : '';
  if (audience && !audience.closed) { const st = audience.document.getElementById('stage'); if (st) st.style.visibility = color ? 'hidden' : ''; audience.document.body.style.background = color || '#000'; }
  renderShowTools();
}

function toSlide(e) {
  const { left, top, scale } = slideBox();
  return [Math.round(((e.clientX - left) / scale) * 10) / 10, Math.round(((e.clientY - top) / scale) * 10) / 10];
}

presenter.addEventListener('pointerdown', (e) => {
  if (show.tool !== 'pen' || e.target.closest('.pr-show-tools')) return;
  e.preventDefault();
  presenter.setPointerCapture(e.pointerId);
  show.stroke = [toSlide(e)];
  if (!ink.has(state.presentIndex)) ink.set(state.presentIndex, []);
  ink.get(state.presentIndex).push(show.stroke);
  redrawInk();
});
presenter.addEventListener('pointermove', (e) => {
  // the tools appear while the pointer moves (and hide again after a while)
  showTools.classList.add('visible');
  clearTimeout(show.hideTimer);
  show.hideTimer = setTimeout(() => showTools.classList.remove('visible'), 2500);
  if (show.tool === 'laser') Object.assign(laserDot.style, { left: `${e.clientX}px`, top: `${e.clientY}px` });
  if (show.tool === 'pen' && show.stroke) { for (const ev of e.getCoalescedEvents ? e.getCoalescedEvents() : [e]) show.stroke.push(toSlide(ev)); redrawInk(); }
});
for (const type of ['pointerup', 'pointercancel']) presenter.addEventListener(type, () => { show.stroke = null; });

/** Reset the tools when a show starts or ends. */
function resetShowTools() {
  ink.clear();
  show.stroke = null;
  if (show.tool) setTool(show.tool);
  if (show.blank) setBlank(null);
  renderShowTools();
}
window.addEventListener('resize', () => { if (state.presenting) showPresented(); });
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && state.presenting) endPresentation(); });

// ---- spelling panel (F7) -----------------------------------------------------------------------------------------
// The document editor's panel checks one text: here the texts of all slides (text boxes, shapes, tables) and the speaker notes,
// joined into one stream. The runs of a paragraph follow each other directly (a word may be formatted in parts), paragraphs and
// texts end with a paragraph mark; fields (slide numbers, dates) are left out.

function spellIndex() {
  const segments = [];
  let stream = '';
  const piece = (text, where) => { segments.push({ start: stream.length, end: stream.length + text.length, ...where }); stream += text; };
  state.deck.slides.forEach((sl, si) => {
    for (const el of sl.elements) {
      if (el.locked) continue;
      const texts = el.type === 'table' ? el.table.rows.flatMap((r) => r.cells.map((c) => c.text).filter(Boolean)) : el.text ? [el.text] : [];
      for (const tx of texts) {
        for (const p of tx.paragraphs) {
          for (const r of p.runs) if (!r.field && r.text && r.text !== '\n') piece(r.text, { si, id: el.id, run: r });
          stream += '\r';
        }
      }
    }
    if (sl.notes) { piece(sl.notes, { si, notes: sl }); stream += '\r'; }
  });
  return { stream, segments };
}

const spelling = createSpelling({
  getBody: () => ({ dataStream: spellIndex().stream }),
  select(start) { // the slide and the element (or the notes) of the word
    const seg = spellIndex().segments.find((x) => start >= x.start && start < x.end);
    if (!seg) return;
    if (editing) document.activeElement.blur();
    state.current = seg.si;
    select(seg.notes ? null : seg.id);
    render();
  },
  replace(ranges, text) { // from the end, so that the earlier offsets stay valid
    record();
    const { segments } = spellIndex();
    for (const [a, b] of [...ranges].sort((x, y) => y[0] - x[0])) {
      let first = true;
      for (const seg of segments.filter((x) => x.start < b && x.end > a)) {
        const from = Math.max(a, seg.start) - seg.start, to = Math.min(b, seg.end) - seg.start;
        const value = seg.notes ? seg.notes.notes : seg.run.text;
        const next = value.slice(0, from) + (first ? text : '') + value.slice(to);
        if (seg.notes) seg.notes.notes = next; else seg.run.text = next;
        first = false;
      }
    }
  },
  changed,
  render,
});

// ---- UI ------------------------------------------------------------------------------------------------------------

function Toolbar() {
  return html`<nav class="pr-toolbar pico" role="toolbar">
    <button class="secondary outline pr-only-phone" data-testid="toggle-panels" onMouseDown=${(e) => e.preventDefault()} onClick=${() => { state.panels = !state.panels; Suite.shell.refresh(); }}>${t('pr.panels')}</button>
    <button class="secondary" data-testid="new" onClick=${async () => { if (await confirmDiscard()) load(newDeck(), `${t('pr.untitled')}.pptx`, null); }}>${t('pr.new')}</button>
    <button class="secondary" data-testid="open" onClick=${open}>${t('pr.open')}</button>
    <${Suite.shell.Recent} app=${APP} before=${confirmDiscard} onOpen=${(p) => openPicked(p)} />
    <button class=${state.dirty ? '' : 'secondary outline'} data-testid="save" onClick=${() => save()}>${t('pr.save')}</button>
    <button class="secondary outline" data-testid="save-as" onClick=${() => { state.dialog = { stem: state.name.replace(/\.(pptx|odp)$/i, ''), format: isOdp(state.name) ? 'odp' : 'pptx' }; Suite.shell.refresh(); }}>${t('pr.saveAs')}</button>
    <button class="secondary outline" data-testid="print" onClick=${print}>${t('pr.print')}</button>
    <span class="pr-sep"></span>
    <button class="secondary outline" title=${t('pr.undo')} data-testid="undo" disabled=${!state.undo.length} onClick=${undo}>↶</button>
    <button class="secondary outline" title=${t('pr.redo')} data-testid="redo" disabled=${!state.redo.length} onClick=${redo}>↷</button>
    <button class="secondary outline" data-testid="add-text" onClick=${addText}>T ${t('pr.text')}</button>
    <details class="dropdown pr-shapes" data-testid="shape-menu"><summary>◼ ${t('pr.shape')}</summary>
      <ul>${SHAPES.map((g) => html`<li><a href="#" data-testid=${`add-${g}`} onClick=${(e) => { e.preventDefault(); e.target.closest('details').open = false; addShape(g); }}>${g}</a></li>`)}</ul></details>
    <button class="secondary outline" data-testid="add-image" onClick=${pickImage}>🖼 ${t('pr.image')}</button>
    <button class="secondary outline" data-testid="add-diagram" title=${t('dia.insert')} onClick=${insertDiagram}>📐 ${t('pr.diagram')}</button>
    <button class="secondary outline" data-testid="add-chart" title=${t('ch.insert')} onClick=${insertChart}>📊 ${t('ch.chart')}</button>
    <button class="secondary outline" data-testid="add-media" title=${t('pr.mediaHint')} onClick=${() => insertMedia().catch(fail)}>🎬 ${t('pr.media')}</button>
    <button class="secondary outline" data-testid="add-table" onClick=${() => addTable()}>▦ ${t('pr.table')}</button>
    <button class="secondary outline" data-testid="header-footer" title=${t('pr.hf')} onClick=${openHeaderFooter}># ${t('pr.hf')}</button>
    <span class="pr-sep"></span>
    <button class="secondary outline" data-testid="add-slide" onClick=${() => addSlide(false)}>+ ${t('pr.newSlide')}</button>
    <details class="dropdown pr-shapes" data-testid="layout-menu"><summary title=${t('pr.layout')} aria-label=${t('pr.layout')}>▤</summary>
      <ul>${LAYOUTS.map((k) => html`<li><a href="#" data-testid=${`layout-${k}`} onClick=${(e) => { e.preventDefault(); e.target.closest('details').open = false; addSlide(false, k); }}>${t(`pr.layout.${k}`)}</a></li>`)}</ul></details>
    <button data-testid="present" onClick=${() => present(false)}>${t('pr.present')}</button>
    <button class=${spelling.open ? 'secondary' : 'secondary outline'} data-testid="spell" title=${`${t('spell.button')} (F7)`} aria-pressed=${spelling.open ? 'true' : 'false'} onClick=${spelling.toggle}>ABC✓</button>
    <button class="secondary outline" data-testid="present-console" title=${t('pr.presenterView')} onClick=${startConsole}>🎤</button>
  </nav>`;
}

function ColorField({ label, value, onChange, allowNone, testid }) {
  const none = !value;
  return html`<div class="pr-color"><span>${t(label)}</span>
    <input type="color" value=${value || '#ffffff'} aria-label=${t(label)} disabled=${none} data-testid=${testid} onInput=${(e) => onChange(e.target.value)} />
    ${allowNone ? html`<label><input type="checkbox" checked=${none} data-testid=${`${testid}-none`} onChange=${(e) => onChange(e.target.checked ? null : '#4472C4')} /> ${t('pr.none')}</label>` : null}</div>`;
}

const TRANSITION_TYPES = ['none', 'fade', 'push', 'wipe', 'cover', 'zoom'];
const EFFECTS = ['appear', 'fade', 'fly', 'zoom'];

function TransitionFields({ sl }) {
  const tr = sl.transition;
  const set = (props) => { record(`tr-${sl.id}`); sl.transition = { type: 'fade', dir: 'l', duration: 0.75, ...(sl.transition || {}), ...props }; changed(); };
  return html`<details class="pr-motion" open=${!!tr}><summary data-testid="transition-section">${t('pr.transition')}</summary>
    <label>${t('pr.trType')}<select data-testid="transition-type" onChange=${(e) => { if (e.target.value === 'none') { record(); delete sl.transition; changed(); } else set({ type: e.target.value }); }}>
      ${TRANSITION_TYPES.map((x) => html`<option value=${x} selected=${(tr ? tr.type : 'none') === x}>${t(`pr.tr.${x}`)}</option>`)}</select></label>
    ${tr ? html`
      ${['push', 'wipe', 'cover'].includes(tr.type) ? html`<label>${t('pr.trDir')}<select data-testid="transition-dir" onChange=${(e) => set({ dir: e.target.value })}>
        ${['l', 'r', 'u', 'd'].map((d) => html`<option value=${d} selected=${tr.dir === d}>${t(`pr.dir.${d}`)}</option>`)}</select></label>` : null}
      <div class="pr-grid">
        <label>${t('pr.trDuration')}<input type="number" min="0.1" max="10" step="0.05" data-testid="transition-duration" key=${`trd-${sl.id}-${tr.duration}`} defaultValue=${tr.duration} onChange=${(e) => set({ duration: Math.max(0.1, Number(e.target.value) || 0.75) })} /></label>
        <label>${t('pr.trAdvance')}<input type="number" min="0" step="0.5" placeholder=${t('pr.onClick')} data-testid="transition-advance" key=${`tra-${sl.id}-${tr.advanceAfter}`} defaultValue=${tr.advanceAfter || ''}
          onChange=${(e) => { const v = Number(e.target.value); set({ advanceAfter: v > 0 ? v : undefined }); }} /></label>
      </div>
      <button class="secondary outline" data-testid="transition-all" onClick=${() => { record(); for (const x of state.deck.slides) x.transition = { ...tr }; changed(); Suite.shell.toast(t('pr.trApplied')); }}>${t('pr.trAll')}</button>` : null}
  </details>`;
}

const elementLabel = (sl, id) => { const e = sl.elements.find((x) => x.id === id); if (!e) return id; const txt = e.text ? e.text.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' ').trim() : ''; return txt ? txt.slice(0, 30) : e.name || e.type; };

function AnimationList({ sl }) {
  const list = (sl.animations || []).filter((a) => sl.elements.some((e) => e.id === a.id));
  if (!list.length) return null;
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; record(); [list[i], list[j]] = [list[j], list[i]]; sl.animations = list; changed(); };
  return html`<details class="pr-motion" open><summary>${t('pr.animations')} (${list.length})</summary>
    <ol class="pr-anim-list" data-testid="animation-list">${list.map((a, i) => html`<li data-testid="animation-item">
      <span>${elementLabel(sl, a.id)}</span> <small>${t(`pr.fx.${a.effect}`)}, ${t(`pr.start.${a.start}`)}</small>
      <button class="secondary outline" title="↑" data-testid="animation-up" disabled=${i === 0} onClick=${() => move(i, -1)}>↑</button>
      <button class="secondary outline" title="↓" data-testid="animation-down" disabled=${i === list.length - 1} onClick=${() => move(i, 1)}>↓</button>
      <button class="secondary outline" title=${t('pr.delete')} data-testid="animation-remove" onClick=${() => { record(); sl.animations = list.filter((x) => x !== a); changed(); }}>×</button></li>`)}</ol>
  </details>`;
}

function ElementAnimation({ el, sl }) {
  const a = (sl.animations || []).find((x) => x.id === el.id);
  const set = (props) => {
    record();
    const list = (sl.animations || []).filter((x) => x.id !== el.id);
    if (props) sl.animations = a ? (sl.animations || []).map((x) => (x.id === el.id ? { ...x, ...props } : x)) : [...list, { id: el.id, effect: 'fade', start: 'click', ...props }];
    else sl.animations = list;
    changed();
  };
  return html`<strong>${t('pr.animation')}</strong><div class="pr-grid">
    <label>${t('pr.effect')}<select data-testid="el-animation" onChange=${(e) => set(e.target.value === 'none' ? null : { effect: e.target.value })}>
      ${['none', ...EFFECTS].map((x) => html`<option value=${x} selected=${(a ? a.effect : 'none') === x}>${t(`pr.fx.${x}`)}</option>`)}</select></label>
    ${a ? html`<label>${t('pr.start')}<select data-testid="el-animation-start" onChange=${(e) => set({ start: e.target.value })}>
      ${['click', 'with', 'after'].map((x) => html`<option value=${x} selected=${a.start === x}>${t(`pr.start.${x}`)}</option>`)}</select></label>` : null}
  </div>`;
}

function Panel() {
  const el = state.selected && findElement(state.selected);
  const sl = slide();
  if (!el) {
    return html`<aside class=${`pr-panel pico suite-drawer ${state.panels ? 'open' : ''}`} data-testid="panel">
      <strong>${t('pr.slide')} ${state.current + 1} / ${state.deck.slides.length}</strong>
      <${ColorField} label="pr.background" value=${sl.background || '#FFFFFF'} testid="slide-background" onChange=${(v) => { record('bg'); sl.background = v; changed(); }} />
      <label>${t('pr.size')}<select data-testid="slide-size" onChange=${(e) => { record(); const [w, h] = e.target.value.split('x').map(Number); state.deck.width = w; state.deck.height = h; changed(); }}>
        <option value="960x540" selected=${state.deck.width / state.deck.height > 1.6}>16:9</option><option value="960x720" selected=${state.deck.width / state.deck.height < 1.4}>4:3</option></select></label>
      <label><input type="checkbox" data-testid="slide-hidden" checked=${!!sl.hidden} onChange=${(e) => { record(); if (e.target.checked) sl.hidden = true; else delete sl.hidden; changed(); }} />${t('pr.hideSlide')}</label>
      <div class="pr-buttons">
        <button class="secondary outline" data-testid="duplicate-slide" onClick=${() => addSlide(true)}>${t('pr.duplicateSlide')}</button>
        <button class="secondary outline" data-testid="delete-slide" disabled=${state.deck.slides.length < 2} onClick=${deleteSlide}>${t('pr.deleteSlide')}</button>
        <button class="secondary outline" title="↑" data-testid="slide-up" onClick=${() => moveSlide(state.current, state.current - 1)}>↑</button>
        <button class="secondary outline" title="↓" data-testid="slide-down" onClick=${() => moveSlide(state.current, state.current + 1)}>↓</button>
      </div>
      <${TransitionFields} sl=${sl} />
      <${AnimationList} sl=${sl} />
      <label class="pr-notes">${t('pr.notes')}<textarea rows="6" data-testid="slide-notes" key=${`notes-${sl.id}`} placeholder=${t('pr.notesHint')}
        onInput=${(e) => { record(`notes-${sl.id}`); sl.notes = e.target.value; changed(); }}>${sl.notes || ''}</textarea></label>
      <small>${t('pr.editHint')}</small>
    </aside>`;
  }
  const runs = (el.type === 'table' ? el.table.rows.flatMap((r) => r.cells.map((c) => c.text).filter(Boolean)) : el.text ? [el.text] : []).flatMap((tx) => tx.paragraphs.flatMap((p) => p.runs));
  const r0 = runs[0] || run('');
  const num = (key, label, testid) => html`<label>${label}<input type="number" key=${`${el.id}-${key}-${Math.round(el[key])}`} defaultValue=${Math.round(el[key] || 0)} data-testid=${testid}
    onChange=${(e) => setProp((x) => { x[key] = Number(e.target.value) || 0; })} /></label>`;
  const chosen = selectedElements();
  const units = unitsOf(chosen).length;
  const tool = (testid, label, icon, fn, disabled = false) => html`<button class="secondary outline" data-testid=${testid} title=${label} aria-label=${label} disabled=${disabled} onClick=${fn}>${icon}</button>`;
  return html`<aside class=${`pr-panel pico suite-drawer ${state.panels ? 'open' : ''}`} data-testid="panel">
    <strong data-testid="panel-title">${chosen.length > 1 ? t('pr.selectedN', chosen.length) : el.name || el.type}</strong>
    <div class="pr-buttons pr-arrange" title=${t('pr.alignTo')}>
      ${tool('arrange-left', t('pr.alignLeft'), '⫷', () => alignSelection('left'))}${tool('arrange-center', t('pr.alignCenter'), '⇹', () => alignSelection('center'))}
      ${tool('arrange-right', t('pr.alignRight'), '⫸', () => alignSelection('right'))}${tool('arrange-top', t('pr.alignTop'), '⊤', () => alignSelection('top'))}
      ${tool('arrange-middle', t('pr.alignMiddle'), '⇳', () => alignSelection('middle'))}${tool('arrange-bottom', t('pr.alignBottom'), '⊥', () => alignSelection('bottom'))}
      ${tool('distribute-h', t('pr.distributeH'), '⋯', () => distributeSelection('x'), units < 3)}${tool('distribute-v', t('pr.distributeV'), '⋮', () => distributeSelection('y'), units < 3)}
      ${tool('group', t('pr.group'), '▣', groupSelection, units < 2)}${tool('ungroup', t('pr.ungroup'), '▢', ungroupSelection, !chosen.some((e) => e.group))}
    </div>
    ${chosen.length > 1 ? null : html`<div class="pr-grid">${num('x', 'X', 'el-x')}${num('y', 'Y', 'el-y')}${num('w', t('pr.width'), 'el-w')}${num('h', 'H', 'el-h')}${num('rot', t('pr.rotation'), 'el-rot')}</div>`}
    ${isDiagramImage(el) ? html`<button class="secondary" data-testid="edit-diagram" onClick=${() => editDiagram(el.id)}>📐 ${t('dia.edit')}</button>` : null}
    ${chosen.length === 1 && isChartImage(el) ? html`<button class="secondary" data-testid="edit-chart" onClick=${() => editChart(el.id)}>📊 ${t('ch.edit')}</button>` : null}
    ${chosen.length === 1 && el.type === 'image' && !isChartImage(el) && !isDiagramImage(el) ? html`<fieldset class="pr-crop" data-testid="crop"><legend>${t('pr.crop')}</legend><div class="pr-grid">
      ${[['l', 'pr.cropL'], ['t', 'pr.cropT'], ['r', 'pr.cropR'], ['b', 'pr.cropB']].map(([k, label]) => html`<label>${t(label)}<input type="number" min="0" max="90" step="1"
        key=${`${el.id}-crop-${k}-${Math.round(((el.image.crop || {})[k] || 0) * 1000)}`} defaultValue=${Math.round(((el.image.crop || {})[k] || 0) * 100)} data-testid=${`crop-${k}`}
        onChange=${(e) => setCrop(k, e.target.value)} /></label>`)}</div>
      ${el.image.crop ? html`<button class="secondary outline" data-testid="crop-reset" onClick=${() => ['l', 't', 'r', 'b'].forEach((k) => setCrop(k, 0))}>${t('pr.cropReset')}</button>` : null}</fieldset>` : null}
    ${el.type === 'shape' || el.type === 'text' ? html`
      <${ColorField} label="pr.fill" value=${el.fill} allowNone=${true} testid="el-fill" onChange=${(v) => setPropAll((x) => { if (x.type === 'shape' || x.type === 'text') x.fill = v; }, 'fill')} />
      <${ColorField} label="pr.line" value=${el.line && el.line.color} allowNone=${true} testid="el-line" onChange=${(v) => setPropAll((x) => { if (x.type === 'shape' || x.type === 'text') x.line = v ? { color: v, width: (x.line && x.line.width) || 1.33 } : null; }, 'line')} />` : null}
    ${runs.length || el.type === 'shape' ? html`
      <label>${t('pr.font')}<select data-testid="font" onChange=${(e) => formatRuns('font', e.target.value, 'fontName')}>
        ${[...new Set([r0.font, ...FONTS, ...(Suite.fonts ? Suite.fonts.families().map((f) => f.name) : [])])].map((f) => html`<option value=${f} selected=${r0.font === f}>${f}</option>`)}</select></label>
      <div class="pr-grid">
        <label>${t('pr.fontSize')}<input type="number" min="6" max="200" key=${`${el.id}-size-${r0.size}`} defaultValue=${r0.size} data-testid="font-size" onChange=${(e) => formatRuns('size', Number(e.target.value) || 18)} /></label>
        <${ColorField} label="pr.color" value=${r0.color || '#000000'} testid="font-color" onChange=${(v) => formatRuns('color', v, 'foreColor')} />
      </div>
      <div class="pr-buttons">
        ${[['bold', 'B', 'bold'], ['italic', 'I', 'italic'], ['underline', 'U', 'underline']].map(([p, label, cmd]) => html`<button class=${runs.length && runs.every((r) => r[p]) ? '' : 'secondary outline'}
          title=${t(`pr.${p}`)} data-testid=${`fmt-${p}`} onMouseDown=${(e) => e.preventDefault()} onClick=${() => formatRuns(p, (rs) => !rs.every((r) => r[p]), cmd)}>${label}</button>`)}
        ${[['l', '⇤'], ['ctr', '↔'], ['r', '⇥']].map(([a, icon]) => html`<button class="secondary outline" title=${t('pr.align')} data-testid=${`align-${a}`}
          onMouseDown=${(e) => e.preventDefault()}
          onClick=${() => setProp((x) => {
            const box = editing && editBox(); // (while editing: the paragraphs being edited too, read back when the editing ends)
            if (box) for (const p of box.children) { p.dataset.align = a; p.style.textAlign = { l: 'left', ctr: 'center', r: 'right' }[a]; } for (const tx of x.type === 'table' ? x.table.rows.flatMap((r) => r.cells.map((c) => c.text).filter(Boolean)) : [x.text].filter(Boolean)) for (const p of tx.paragraphs) p.align = a; })}>${icon}</button>`)}
        ${el.text ? [['t', '⤒'], ['ctr', '↕'], ['b', '⤓']].map(([a, icon]) => html`<button class=${el.text.anchor === a ? '' : 'secondary outline'} title=${t('pr.anchor')} data-testid=${`anchor-${a}`}
          onClick=${() => setProp((x) => { x.text.anchor = a; })}>${icon}</button>`) : null}
      </div>
      <div class="pr-buttons">
        ${[['bullet', '•≡', 'pr.listBullet'], ['number', '1.≡', 'pr.listNumber'], ['outdent', '⇠', 'pr.outdent'], ['indent', '⇢', 'pr.indent']].map(([k, icon, key]) => html`<button
          class="secondary outline" title=${t(key)} aria-label=${t(key)} data-testid=${`list-${k}`} onMouseDown=${(e) => e.preventDefault()} onClick=${() => listCommand(k)}>${icon}</button>`)}
      </div>` : null}
    ${chosen.length > 1 ? null : html`<${ElementAnimation} el=${el} sl=${sl} />`}
    <strong>${t('pr.arrange')}</strong>
    <div class="pr-buttons">
      <button class="secondary outline" data-testid="to-front" onClick=${() => reorder(true)}>${t('pr.toFront')}</button>
      <button class="secondary outline" data-testid="to-back" onClick=${() => reorder(false)}>${t('pr.toBack')}</button>
      <button class="secondary outline" data-testid="duplicate" onClick=${duplicateElement}>${t('pr.duplicate')}</button>
      <button class="secondary outline" data-testid="delete" onClick=${deleteSelection}>${t('pr.delete')}</button>
    </div>
  </aside>`;
}

// ---- header & footer: date, footer text and slide number on the slides ------------------------------------------------
// As in PowerPoint, they are text elements on each slide (placeholders dt, ftr and sldNum); the date can be a field that shows
// the current date, the slide number is a field that shows the number of its slide.

const HF_KINDS = ['dt', 'ftr', 'sldNum'];
const hfElement = (sl, kind) => sl.elements.find((e) => e.placeholder && e.placeholder.type === kind && e.text);
const hfRun = (el) => (el && el.text.paragraphs.flatMap((p) => p.runs).find((r) => r.text || r.field)) || null;
const hfText = (el) => (el ? el.text.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' ') : '');

function openHeaderFooter() {
  const sl = slide();
  const dt = hfElement(sl, 'dt'), ftr = hfElement(sl, 'ftr'), num = hfElement(sl, 'sldNum');
  const dateRun = hfRun(dt);
  const first = state.deck.slides[0];
  state.hf = {
    date: !!dt, dateAuto: dt ? !!(dateRun && dateRun.field === 'datetime') : true, dateText: dt && !(dateRun && dateRun.field) ? hfText(dt) : new Date().toLocaleDateString(fieldCtx(0).locale),
    number: !!num, footer: !!ftr, footerText: hfText(ftr),
    skipTitle: state.deck.slides.length > 1 && state.current > 0 && !HF_KINDS.some((k) => hfElement(first, k)) && HF_KINDS.some((k) => hfElement(sl, k)),
  };
  Suite.shell.refresh();
}

/** The box of a new date, footer or slide number at the bottom of the slide (PowerPoint's default places). */
function hfBox(kind) {
  const { width: W, height: H } = state.deck;
  const box = { dt: [0.05, 0.225, 'l'], ftr: [0.3375, 0.325, 'ctr'], sldNum: [0.725, 0.225, 'r'] }[kind];
  return { x: Math.round(W * box[0]), y: Math.round(H * 0.925), w: Math.round(W * box[1]), h: Math.round(H * 0.055), align: box[2] };
}

function applyHeaderFooter(all) {
  const d = state.hf;
  state.hf = null;
  record();
  const slides = all ? state.deck.slides : [slide()];
  for (const sl of slides) {
    const index = state.deck.slides.indexOf(sl);
    const off = d.skipTitle && index === 0;
    const content = {
      dt: d.date && !off ? (d.dateAuto ? { text: new Date().toLocaleDateString(fieldCtx(index).locale), field: 'datetime', fieldType: 'datetime1' } : { text: d.dateText }) : null,
      ftr: d.footer && !off && d.footerText ? { text: d.footerText } : null,
      sldNum: d.number && !off ? { text: String(index + 1), field: 'slidenum' } : null,
    };
    for (const kind of HF_KINDS) {
      const el = hfElement(sl, kind);
      if (!content[kind]) { if (el) sl.elements = sl.elements.filter((e) => e !== el); continue; }
      const value = { field: undefined, fieldType: undefined, ...content[kind] };
      if (el) { // keep its place and look; its text becomes the new one
        const base = hfRun(el) || run('', 12, { color: '#7F7F7F' });
        el.text.paragraphs = [{ ...el.text.paragraphs[0], runs: [{ ...base, ...value }] }];
      } else {
        const b = hfBox(kind);
        sl.elements.push(textElement(b.x, b.y, b.w, b.h, [para([{ ...run('', 12, { color: '#7F7F7F' }), ...value }], b.align)],
          { name: t(kind === 'dt' ? 'pr.hfDate' : kind === 'ftr' ? 'pr.hfFooter' : 'pr.hfNumber'), placeholder: { type: kind, idx: null },
            text: { anchor: 'ctr', insets: [9.6, 4.8, 9.6, 4.8], paragraphs: [para([{ ...run('', 12, { color: '#7F7F7F' }), ...value }], b.align)] } }));
      }
    }
  }
  changed();
}

function HeaderFooterDialog() {
  const d = state.hf;
  if (!d) return null;
  const set = (k) => (e) => { d[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; Suite.shell.refresh(); };
  const check = (k, label) => html`<label><input type="checkbox" data-testid=${`hf-${k}`} checked=${d[k]} onChange=${set(k)} />${t(label)}</label>`;
  return html`<dialog open class="pico" data-testid="hf-dialog"><article class="pr-hf">
    <header><strong>${t('pr.hf')}</strong></header>
    ${check('date', 'pr.hfDate')}
    ${d.date ? html`<div class="pr-hf-sub">
      <label><input type="radio" name="hf-date" data-testid="hf-date-auto" checked=${d.dateAuto} onChange=${() => { d.dateAuto = true; Suite.shell.refresh(); }} />${t('pr.hfAuto')}</label>
      <label><input type="radio" name="hf-date" data-testid="hf-date-fixed" checked=${!d.dateAuto} onChange=${() => { d.dateAuto = false; Suite.shell.refresh(); }} />${t('pr.hfFixed')}</label>
      ${d.dateAuto ? null : html`<input data-testid="hf-date-text" value=${d.dateText} onInput=${(e) => { d.dateText = e.target.value; }} />`}</div>` : null}
    ${check('number', 'pr.hfNumber')}
    ${check('footer', 'pr.hfFooter')}
    ${d.footer ? html`<div class="pr-hf-sub"><input data-testid="hf-footer-text" value=${d.footerText} onInput=${(e) => { d.footerText = e.target.value; }} /></div>` : null}
    ${check('skipTitle', 'pr.hfSkipTitle')}
    <footer>
      <button type="button" class="secondary" onClick=${() => { state.hf = null; Suite.shell.refresh(); }}>${t('pr.cancel')}</button>
      <button type="button" class="secondary" data-testid="hf-apply" onClick=${() => applyHeaderFooter(false)}>${t('pr.hfApply')}</button>
      <button type="button" data-testid="hf-apply-all" onClick=${() => applyHeaderFooter(true)}>${t('pr.hfApplyAll')}</button>
    </footer>
  </article></dialog>`;
}

function SaveAsDialog() {
  const d = state.dialog;
  if (!d) return null;
  return html`<dialog open class="pico" data-testid="save-as-dialog"><article>
    <form onSubmit=${(e) => { e.preventDefault(); state.dialog = null; Suite.shell.refresh(); save(true, `${d.stem}.${d.format || 'pptx'}`); }}>
      <label>${t('pr.fileName')}<input data-testid="save-as-name" defaultValue=${d.stem} onInput=${(e) => { d.stem = e.target.value; }} /></label>
      <label>${t('pr.format')}<select data-testid="save-as-format" onChange=${(e) => { d.format = e.target.value; Suite.shell.refresh(); }}>
        <option value="pptx" selected=${d.format !== 'odp'}>PowerPoint (.pptx)</option><option value="odp" selected=${d.format === 'odp'}>OpenDocument (.odp)</option></select></label>
      ${d.format === 'odp' ? html`<small>${t('pr.odpNote')}</small>` : null}
      <footer><button type="button" class="secondary" onClick=${() => { state.dialog = null; Suite.shell.refresh(); }}>${t('pr.cancel')}</button>
        <button type="submit" data-testid="save-as-ok">${t('pr.saveAs')}</button></footer>
    </form>
  </article></dialog>`;
}

function Main() {
  return html`<div class="pr-layout">
    <div class="pr-thumbs-box" ref=${(el) => { if (el && thumbs.parentElement !== el) { el.appendChild(thumbs); requestAnimationFrame(renderThumbs); } }}></div>
    <div class="pr-stage-box" ref=${(el) => { if (el && stageWrap.parentElement !== el) { el.appendChild(stageWrap); requestAnimationFrame(renderStage); } }}></div>
    <${Panel} />${state.panels ? Suite.shell.backdrop(() => { state.panels = false; Suite.shell.refresh(); }) : null}
    <footer class="pr-status pico" data-testid="status"><span data-testid="file-name">${state.name}${state.dirty ? ' •' : ''}</span><span>${t('pr.slides', state.deck.slides.length)}</span></footer>
    <${SaveAsDialog} /><${HeaderFooterDialog} /><${spelling.Panel} />
  </div>`;
}

Suite.shell.mount({ id: APP, title: 'app.title', version: '%%BUILD_VERSION%%', toolbar: () => html`<${Toolbar} />`, main: () => html`<${Main} />` });
Suite.files.dropZone(document.body, async (picked) => {
  const file = picked[0];
  if (!file) return;
  if (/\.(pptx|potx|ppsx|html?)$/i.test(file.file.name)) { if (await confirmDiscard()) await openPicked(file); }
});

function onPresentKey(e) {
  const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
  // tools: Ctrl+P pen, Ctrl+L laser pointer, Ctrl+A arrow (no tool), E erase, B/. black, W/, white screen (again: back)
  if (mod && ['p', 'l', 'a'].includes(key)) { e.preventDefault(); if (!state.console) { if (key === 'a') { if (show.tool) setTool(show.tool); } else setTool(key === 'p' ? 'pen' : 'laser'); } return; }
  if (!mod && key === 'e' && !state.console) { eraseInk(); return; }
  if (!mod && ['b', '.', 'w', ','].includes(key)) { const color = ['b', '.'].includes(key) ? '#000' : '#FFF'; setBlank(show.blank === color ? null : color); return; }
  if (show.blank) setBlank(null); // any other key returns from the black or white screen (and acts)
  if (e.key === 'Escape' && show.tool) { setTool(show.tool); return; }
  const display = () => (state.console ? showConsole() : showPresented());
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n'].includes(e.key)) { e.preventDefault(); advance(1); } else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p'].includes(e.key)) { e.preventDefault(); advance(-1); } else if (e.key === 'Escape') endPresentation();
  else if (e.key === 'Home') { state.presentIndex = Math.max(0, visibleFrom(0, 1)); state.presentStep = startStep(state.deck.slides[state.presentIndex]); display(); } else if (e.key === 'End') { state.presentIndex = Math.max(0, visibleFrom(state.deck.slides.length - 1, -1)); state.presentStep = animationGroups(state.deck.slides[state.presentIndex]).length; display(); }
}

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (state.presenting) { onPresentKey(e); return; }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(e.shiftKey); return; }
  if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); open(); return; }
  if (e.key === 'F7' && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); spelling.toggle(); return; }
  if (e.key === 'F5') { e.preventDefault(); if (e.altKey) startConsole(); else present(!e.shiftKey); return; }
  if (editing || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) return;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (mod && e.key.toLowerCase() === 'c' && state.selected) { state.clipboard = structuredClone(selectedElements()); return; }
  if (mod && e.key.toLowerCase() === 'x' && state.selected) { state.clipboard = structuredClone(selectedElements()); deleteSelection(); return; }
  if (mod && e.key.toLowerCase() === 'v' && state.clipboard) { e.preventDefault(); addCopies(state.clipboard); return; }
  if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); selectMany(slide().elements.filter((x) => !x.locked).map((x) => x.id)); return; }
  if (mod && e.key.toLowerCase() === 'g') { e.preventDefault(); if (e.shiftKey) ungroupSelection(); else groupSelection(); return; }
  if (mod && e.key.toLowerCase() === 'd' && state.selected) { e.preventDefault(); duplicateElement(); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected) { e.preventDefault(); deleteSelection(); return; }
  if (e.key === 'Escape' && state.selected) { select(null); return; }
  if ((e.key === 'Enter' || e.key === 'F2') && state.selected) { e.preventDefault(); editText(state.selected); return; }
  if (e.key.startsWith('Arrow') && state.selected) {
    e.preventDefault();
    const d = e.shiftKey ? 10 : 1;
    setPropAll((x) => { if (e.key === 'ArrowLeft') x.x -= d; if (e.key === 'ArrowRight') x.x += d; if (e.key === 'ArrowUp') x.y -= d; if (e.key === 'ArrowDown') x.y += d; }, 'nudge');
    return;
  }
  if (!state.selected && (e.key === 'PageDown' || e.key === 'PageUp')) { e.preventDefault(); state.current = Math.max(0, Math.min(state.deck.slides.length - 1, state.current + (e.key === 'PageDown' ? 1 : -1))); render(); }
});

Suite.bridge.receive((picked) => openPicked(picked), { app: 'presentation' }); // files opened from other apps ("Open with…")

// the open file for "Create an archive from the open files" (about dialog): the presentation as PPTX (an untouched new one is left out)
Suite.openFiles.register(async () => (state.dirty || state.name !== `${t('pr.untitled')}.pptx`
  ? [{ name: state.name, bytes: await deckBytes(state.name), dirty: state.dirty }] : []));

// for tests
if (Suite.fonts) Suite.fonts.onChange(render); // (imported fonts in the font menu)
window.PR = { setCrop, insertMedia, layoutElements, insertChart, editChart, state, listCommand, select, selectMany, selectionIds, alignSelection, distributeSelection, groupSelection, ungroupSelection, editText, render, show, ink, spelling, insertDiagram, editDiagram, async openBase64(b64, name) { load(importPptx(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer), name, null); } };
render();
document.body.dataset.ready = 'true';
