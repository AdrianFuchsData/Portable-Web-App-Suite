/*
 * Presentation editor: own deck model (shared/js/pptx-import.js), DOM/SVG rendering (shared/js/slide-render.js), Moveable for
 * moving, resizing and rotating, PPTX import and export (pptx-export.js, PptxGenJS), presenting, printing.
 */
import Moveable from 'moveable';
import { importPptx } from 'app/pptx-import';
import { exportPptx } from 'app/pptx-export';
import { renderSlide, renderElement, readText, SLIDE_CSS } from 'app/slide-render';
import { webSlidesToPptx } from 'app/deck-convert';
import { fromHtml, fromMarkdown } from 'app/reveal-deck';
import 'app/spell-dom'; // spelling selector in the header, marks in text fields (shared/js/spell-dom.js)

const { html } = Suite.shell;
const t = Suite.t;
const APP = 'presentation';
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const PPTX = { description: 'PowerPoint', accept: { [PPTX_MIME]: ['.pptx'] } };
const OPEN_TYPES = [{ description: 'PowerPoint', accept: { 'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx', '.potx', '.ppsx'] } },
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
    'pr.notes': 'Speaker notes', 'pr.notesHint': 'Notes for this slide (shown in the presenter view, saved in the PPTX file)', 'pr.presenterView': 'Presenter view (Alt+F5): notes, timer and next slide here, the slides in a second window',
    'pr.audience': 'audience', 'pr.popupBlocked': 'The audience window was blocked: allow pop-ups for this page.', 'pr.slideOf': 'Slide {0} of {1}', 'pr.endShow': 'End', 'pr.pauseTimer': 'Pause / continue the timer',
    'pr.lastSlide': 'End of the presentation',
    'app.title': 'Presentation', 'pr.new': 'New', 'pr.open': 'Open', 'pr.save': 'Save', 'pr.saveAs': 'Save as', 'pr.print': 'Print / PDF', 'pr.present': '▶ Present',
    'pr.undo': 'Undo', 'pr.redo': 'Redo', 'pr.text': 'Text box', 'pr.shape': 'Shape', 'pr.image': 'Image', 'pr.table': 'Table', 'pr.newSlide': 'New slide',
    'pr.duplicateSlide': 'Duplicate slide', 'pr.deleteSlide': 'Delete slide', 'pr.slide': 'Slide', 'pr.background': 'Background', 'pr.size': 'Slide size',
    'pr.position': 'Position and size', 'pr.rotation': 'Rotation', 'pr.fill': 'Fill', 'pr.line': 'Line', 'pr.none': 'none', 'pr.width': 'Width',
    'pr.font': 'Font', 'pr.fontSize': 'Size', 'pr.color': 'Colour', 'pr.bold': 'Bold', 'pr.italic': 'Italic', 'pr.underline': 'Underline',
    'pr.align': 'Alignment', 'pr.anchor': 'Vertical', 'pr.arrange': 'Arrange', 'pr.toFront': 'To front', 'pr.toBack': 'To back', 'pr.duplicate': 'Duplicate',
    'pr.delete': 'Delete', 'pr.untitled': 'Presentation', 'pr.discard': 'Discard the unsaved changes?', 'pr.newText': 'New text', 'pr.title': 'Click to edit the title',
    'pr.cannotOpen': '“{0}” cannot be opened: {1}', 'pr.slides': '{0} slides', 'pr.panels': 'Format', 'pr.editHint': 'Double-click a text to edit it.',
    'pr.cancel': 'Cancel', 'pr.fileName': 'File name', 'pr.templateNote': 'Templates and slide shows are saved as a new .pptx file.',
  },
  de: {
    'pr.convertedWeb': 'Die Web-Folien wurden auf PowerPoint-Folien angeordnet; Speichern erzeugt eine .pptx-Datei.',
    'pr.transition': 'Übergang', 'pr.trType': 'Effekt', 'pr.trDir': 'Richtung', 'pr.trDuration': 'Dauer (s)', 'pr.trAdvance': 'Nächste Folie nach (s)', 'pr.onClick': 'bei Klick',
    'pr.trAll': 'Auf alle Folien anwenden', 'pr.trApplied': 'Der Übergang wurde auf alle Folien angewendet.', 'pr.tr.none': 'keiner', 'pr.tr.fade': 'Verblassen', 'pr.tr.push': 'Schieben',
    'pr.tr.wipe': 'Wischen', 'pr.tr.cover': 'Aufdecken', 'pr.tr.zoom': 'Zoom', 'pr.dir.l': 'von rechts', 'pr.dir.r': 'von links', 'pr.dir.u': 'von unten', 'pr.dir.d': 'von oben',
    'pr.animations': 'Animationen', 'pr.animation': 'Animation', 'pr.effect': 'Eingang', 'pr.start': 'Start', 'pr.fx.none': 'keine', 'pr.fx.appear': 'Erscheinen', 'pr.fx.fade': 'Einblenden',
    'pr.fx.fly': 'Hineinfliegen', 'pr.fx.zoom': 'Zoom', 'pr.start.click': 'bei Klick', 'pr.start.with': 'mit vorheriger', 'pr.start.after': 'nach vorheriger',
    'pr.notes': 'Notizen', 'pr.notesHint': 'Notizen zu dieser Folie (in der Referentenansicht, in der PPTX-Datei gespeichert)', 'pr.presenterView': 'Referentenansicht (Alt+F5): Notizen, Zeit und nächste Folie hier, die Folien in einem zweiten Fenster',
    'pr.audience': 'Publikum', 'pr.popupBlocked': 'Das Publikumsfenster wurde blockiert: Erlauben Sie Pop-ups für diese Seite.', 'pr.slideOf': 'Folie {0} von {1}', 'pr.endShow': 'Beenden', 'pr.pauseTimer': 'Zeit anhalten / fortsetzen',
    'pr.lastSlide': 'Ende der Präsentation',
    'app.title': 'Präsentation', 'pr.new': 'Neu', 'pr.open': 'Öffnen', 'pr.save': 'Speichern', 'pr.saveAs': 'Speichern unter', 'pr.print': 'Drucken / PDF', 'pr.present': '▶ Vorführen',
    'pr.undo': 'Rückgängig', 'pr.redo': 'Wiederholen', 'pr.text': 'Textfeld', 'pr.shape': 'Form', 'pr.image': 'Bild', 'pr.table': 'Tabelle', 'pr.newSlide': 'Neue Folie',
    'pr.duplicateSlide': 'Folie duplizieren', 'pr.deleteSlide': 'Folie löschen', 'pr.slide': 'Folie', 'pr.background': 'Hintergrund', 'pr.size': 'Foliengröße',
    'pr.position': 'Position und Größe', 'pr.rotation': 'Drehung', 'pr.fill': 'Füllung', 'pr.line': 'Linie', 'pr.none': 'keine', 'pr.width': 'Breite',
    'pr.font': 'Schrift', 'pr.fontSize': 'Größe', 'pr.color': 'Farbe', 'pr.bold': 'Fett', 'pr.italic': 'Kursiv', 'pr.underline': 'Unterstrichen',
    'pr.align': 'Ausrichtung', 'pr.anchor': 'Vertikal', 'pr.arrange': 'Anordnen', 'pr.toFront': 'Nach vorne', 'pr.toBack': 'Nach hinten', 'pr.duplicate': 'Duplizieren',
    'pr.delete': 'Löschen', 'pr.untitled': 'Präsentation', 'pr.discard': 'Die ungespeicherten Änderungen verwerfen?', 'pr.newText': 'Neuer Text', 'pr.title': 'Titel durch Klicken bearbeiten',
    'pr.cannotOpen': '„{0}“ kann nicht geöffnet werden: {1}', 'pr.slides': '{0} Folien', 'pr.panels': 'Format', 'pr.editHint': 'Doppelklick auf einen Text bearbeitet ihn.',
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
  deck: newDeck(), current: 0, selected: null, name: '', handle: null, dirty: false, undo: [], redo: [],
  presenting: false, presentIndex: 0, panels: false, dialog: null, clipboard: null,
};
state.name = `${t('pr.untitled')}.pptx`;
const slide = () => state.deck.slides[state.current];
const findElement = (id) => slide().elements.find((e) => e.id === id);

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
  const view = renderSlide(slide(), state.deck);
  stage.replaceChildren(view);
  Object.assign(stage.style, { width: `${width}px`, height: `${height}px`, transform: `scale(${scale})` });
  // the scaled stage still occupies its unscaled size: compensate so that it stays centred
  stage.style.margin = `${(height * (scale - 1)) / 2}px ${(width * (scale - 1)) / 2}px`;
  if (state.selected && findElement(state.selected)) attachMoveable(state.selected); else if (moveable) { moveable.destroy(); moveable = null; }
}

function renderThumbs() {
  if (!thumbs.isConnected) return;
  const horizontal = thumbs.clientHeight < thumbs.clientWidth;
  const width = horizontal ? 120 : thumbs.clientWidth - 24;
  const s = width / state.deck.width;
  thumbs.replaceChildren(...state.deck.slides.map((sl, i) => {
    const th = document.createElement('div');
    th.className = `pr-thumb${i === state.current ? ' active' : ''}`;
    th.dataset.testid = 'thumb';
    th.draggable = true;
    Object.assign(th.style, { width: `${width}px`, height: `${state.deck.height * s}px` });
    const no = document.createElement('span');
    no.className = 'pr-no';
    no.textContent = i + 1;
    const view = renderSlide(sl, state.deck);
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
  select(target ? target.dataset.id : null);
});
stage.addEventListener('dblclick', (e) => {
  const target = e.target.closest('.el:not(.locked)');
  if (target) editText(target.dataset.id, e.target.closest('td'));
});
new ResizeObserver(() => { if (!editing) { renderStage(); renderThumbs(); } }).observe(stageWrap);

function select(id) {
  state.selected = id;
  if (moveable) { moveable.destroy(); moveable = null; }
  if (id) attachMoveable(id);
  Suite.shell.refresh();
}

function attachMoveable(id) {
  if (moveable) { moveable.destroy(); moveable = null; }
  const node = stage.querySelector(`.el[data-id="${CSS.escape(id)}"]`);
  const el = findElement(id);
  if (!node || !el) return;
  moveable = new Moveable(document.body, {
    target: node, draggable: true, resizable: true, rotatable: true, keepRatio: el.type === 'image',
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
  box.addEventListener('blur', () => {
    box.contentEditable = 'false';
    el.text = readText(box, el.text);
    editing = null;
    changed();
  }, { once: true });
  Suite.shell.refresh();
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

function deleteSelection() {
  if (state.selected) {
    record();
    slide().elements = slide().elements.filter((e) => e.id !== state.selected);
    if (slide().animations) slide().animations = slide().animations.filter((a) => a.id !== state.selected);
    select(null);
    changed();
  }
}

function duplicateElement() {
  const el = state.selected && findElement(state.selected);
  if (!el) return;
  addElement({ ...structuredClone(el), id: newId(el.type), x: el.x + 20, y: el.y + 20 });
}

function reorder(front) {
  const el = state.selected && findElement(state.selected);
  if (!el) return;
  record();
  const list = slide().elements.filter((e) => e !== el);
  slide().elements = front ? [...list, el] : [el, ...list];
  changed();
}

function addSlide(copy = false) {
  record();
  const sl = copy ? { ...structuredClone(slide()), id: newId('slide') } : { id: newId('slide'), background: slide().background || '#FFFFFF', elements: [] };
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
  const el = state.selected && findElement(state.selected);
  if (!el) return;
  const texts = el.type === 'table' ? el.table.rows.flatMap((r) => r.cells.map((c) => c.text).filter(Boolean)) : el.text ? [el.text] : [];
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

// ---- files --------------------------------------------------------------------------------------------------------

async function confirmDiscard() { return !state.dirty || Suite.shell.confirm(t('pr.discard')); }

// recovery copies of unsaved work (shared/js/autosave.js)
Suite.autosave.register({
  app: APP,
  save: () => (state.dirty ? { name: state.name, handle: state.handle, deck: structuredClone(state.deck) } : null),
  restore: (s) => { load(s.deck, s.name, s.handle || null); changed(); },
});

function load(deck, name, handle) {
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
    const deck = importPptx(await file.arrayBuffer());
    const copy = /\.(potx|ppsx)$/i.test(file.name);
    load(deck, copy ? file.name.replace(/\.\w+$/, '.pptx') : file.name, copy ? null : handle);
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
    const bytes = await exportPptx(state.deck, name.replace(/\.pptx$/i, ''));
    const result = as || !state.handle ? await Suite.files.saveAs(bytes, { suggestedName: name, types: [PPTX], type: PPTX_MIME })
      : await Suite.files.save({ name, handle: state.handle }, bytes, { type: PPTX_MIME });
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
  for (const sl of state.deck.slides) {
    const pg = document.createElement('div');
    pg.className = 'pr-print-page';
    pg.append(renderSlide(sl, state.deck));
    box.append(pg);
  }
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
  const view = renderSlide(sl, state.deck);
  const s = Math.min(window.innerWidth / width, window.innerHeight / height);
  Object.assign(view.style, { transform: `scale(${s})`, flex: 'none' });
  const auto = enter ? startStep(sl) : 0;
  applyReveal(view, sl, state.presentStep - auto);
  const old = presenter.querySelector('.slide');
  presenter.replaceChildren(...(enter && sl.transition && old ? [old, view] : [view]));
  presenter.dataset.index = state.presentIndex;
  presenter.dataset.step = state.presentStep;
  const wait = enter && sl.transition && old && view.animate ? playTransition(old, view, sl.transition, s) : 0;
  if (auto) playGroup(view, animationGroups(sl)[0], wait);
  if (enter) scheduleAuto();
}

function present(fromStart = false) {
  if (editing) document.activeElement.blur();
  state.presentIndex = fromStart ? 0 : state.current;
  state.presentStep = startStep(state.deck.slides[state.presentIndex]);
  state.presenting = true;
  select(null);
  presenter.hidden = false;
  showPresented();
  if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
}

function endPresentation() {
  clearTimeout(autoTimer);
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
  const next = state.presentIndex + delta;
  if (next >= state.deck.slides.length) { if (!state.console) endPresentation(); return; }
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
  const view = renderSlide(sl, state.deck);
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
  if (i + 1 < n) renderInto(next, i + 1); else next.replaceChildren(Object.assign(document.createElement('p'), { textContent: t('pr.lastSlide') }));
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
  if (Math.abs(dx) > 40) advance(dx < 0 ? 1 : -1); else advance(1);
});
presenter.addEventListener('click', (e) => { if (e.pointerType !== 'touch') advance(1); });
window.addEventListener('resize', () => { if (state.presenting) showPresented(); });
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && state.presenting) endPresentation(); });

// ---- UI ------------------------------------------------------------------------------------------------------------

function Toolbar() {
  return html`<nav class="pr-toolbar pico" role="toolbar">
    <button class="secondary outline pr-only-phone" data-testid="toggle-panels" onClick=${() => { state.panels = !state.panels; Suite.shell.refresh(); }}>${t('pr.panels')}</button>
    <button class="secondary" data-testid="new" onClick=${async () => { if (await confirmDiscard()) load(newDeck(), `${t('pr.untitled')}.pptx`, null); }}>${t('pr.new')}</button>
    <button class="secondary" data-testid="open" onClick=${open}>${t('pr.open')}</button>
    <${Suite.shell.Recent} app=${APP} before=${confirmDiscard} onOpen=${(p) => openPicked(p)} />
    <button class=${state.dirty ? '' : 'secondary outline'} data-testid="save" onClick=${() => save()}>${t('pr.save')}</button>
    <button class="secondary outline" data-testid="save-as" onClick=${() => { state.dialog = { stem: state.name.replace(/\.pptx$/i, '') }; Suite.shell.refresh(); }}>${t('pr.saveAs')}</button>
    <button class="secondary outline" data-testid="print" onClick=${print}>${t('pr.print')}</button>
    <span class="pr-sep"></span>
    <button class="secondary outline" title=${t('pr.undo')} data-testid="undo" disabled=${!state.undo.length} onClick=${undo}>↶</button>
    <button class="secondary outline" title=${t('pr.redo')} data-testid="redo" disabled=${!state.redo.length} onClick=${redo}>↷</button>
    <button class="secondary outline" data-testid="add-text" onClick=${addText}>T ${t('pr.text')}</button>
    <details class="dropdown pr-shapes" data-testid="shape-menu"><summary>◼ ${t('pr.shape')}</summary>
      <ul>${SHAPES.map((g) => html`<li><a href="#" data-testid=${`add-${g}`} onClick=${(e) => { e.preventDefault(); e.target.closest('details').open = false; addShape(g); }}>${g}</a></li>`)}</ul></details>
    <button class="secondary outline" data-testid="add-image" onClick=${pickImage}>🖼 ${t('pr.image')}</button>
    <button class="secondary outline" data-testid="add-table" onClick=${() => addTable()}>▦ ${t('pr.table')}</button>
    <span class="pr-sep"></span>
    <button class="secondary outline" data-testid="add-slide" onClick=${() => addSlide(false)}>+ ${t('pr.newSlide')}</button>
    <button data-testid="present" onClick=${() => present(false)}>${t('pr.present')}</button>
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
  return html`<aside class=${`pr-panel pico suite-drawer ${state.panels ? 'open' : ''}`} data-testid="panel">
    <strong>${el.name || el.type}</strong>
    <div class="pr-grid">${num('x', 'X', 'el-x')}${num('y', 'Y', 'el-y')}${num('w', t('pr.width'), 'el-w')}${num('h', 'H', 'el-h')}${num('rot', t('pr.rotation'), 'el-rot')}</div>
    ${el.type === 'shape' || el.type === 'text' ? html`
      <${ColorField} label="pr.fill" value=${el.fill} allowNone=${true} testid="el-fill" onChange=${(v) => setProp((x) => { x.fill = v; }, 'fill')} />
      <${ColorField} label="pr.line" value=${el.line && el.line.color} allowNone=${true} testid="el-line" onChange=${(v) => setProp((x) => { x.line = v ? { color: v, width: (x.line && x.line.width) || 1.33 } : null; }, 'line')} />` : null}
    ${runs.length || el.type === 'shape' ? html`
      <label>${t('pr.font')}<select data-testid="font" onChange=${(e) => formatRuns('font', e.target.value, 'fontName')}>
        ${[...new Set([r0.font, ...FONTS])].map((f) => html`<option value=${f} selected=${r0.font === f}>${f}</option>`)}</select></label>
      <div class="pr-grid">
        <label>${t('pr.fontSize')}<input type="number" min="6" max="200" key=${`${el.id}-size-${r0.size}`} defaultValue=${r0.size} data-testid="font-size" onChange=${(e) => formatRuns('size', Number(e.target.value) || 18)} /></label>
        <${ColorField} label="pr.color" value=${r0.color || '#000000'} testid="font-color" onChange=${(v) => formatRuns('color', v, 'foreColor')} />
      </div>
      <div class="pr-buttons">
        ${[['bold', 'B', 'bold'], ['italic', 'I', 'italic'], ['underline', 'U', 'underline']].map(([p, label, cmd]) => html`<button class=${runs.length && runs.every((r) => r[p]) ? '' : 'secondary outline'}
          title=${t(`pr.${p}`)} data-testid=${`fmt-${p}`} onMouseDown=${(e) => e.preventDefault()} onClick=${() => formatRuns(p, (rs) => !rs.every((r) => r[p]), cmd)}>${label}</button>`)}
        ${[['l', '⇤'], ['ctr', '↔'], ['r', '⇥']].map(([a, icon]) => html`<button class="secondary outline" title=${t('pr.align')} data-testid=${`align-${a}`}
          onClick=${() => setProp((x) => { for (const tx of x.type === 'table' ? x.table.rows.flatMap((r) => r.cells.map((c) => c.text).filter(Boolean)) : [x.text].filter(Boolean)) for (const p of tx.paragraphs) p.align = a; })}>${icon}</button>`)}
        ${el.text ? [['t', '⤒'], ['ctr', '↕'], ['b', '⤓']].map(([a, icon]) => html`<button class=${el.text.anchor === a ? '' : 'secondary outline'} title=${t('pr.anchor')} data-testid=${`anchor-${a}`}
          onClick=${() => setProp((x) => { x.text.anchor = a; })}>${icon}</button>`) : null}
      </div>` : null}
    <${ElementAnimation} el=${el} sl=${sl} />
    <strong>${t('pr.arrange')}</strong>
    <div class="pr-buttons">
      <button class="secondary outline" data-testid="to-front" onClick=${() => reorder(true)}>${t('pr.toFront')}</button>
      <button class="secondary outline" data-testid="to-back" onClick=${() => reorder(false)}>${t('pr.toBack')}</button>
      <button class="secondary outline" data-testid="duplicate" onClick=${duplicateElement}>${t('pr.duplicate')}</button>
      <button class="secondary outline" data-testid="delete" onClick=${deleteSelection}>${t('pr.delete')}</button>
    </div>
  </aside>`;
}

function SaveAsDialog() {
  const d = state.dialog;
  if (!d) return null;
  return html`<dialog open class="pico" data-testid="save-as-dialog"><article>
    <form onSubmit=${(e) => { e.preventDefault(); state.dialog = null; Suite.shell.refresh(); save(true, `${d.stem}.pptx`); }}>
      <label>${t('pr.fileName')}<input data-testid="save-as-name" defaultValue=${d.stem} onInput=${(e) => { d.stem = e.target.value; }} /></label>
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
    <${SaveAsDialog} />
  </div>`;
}

Suite.shell.mount({ id: APP, title: 'app.title', version: '%%BUILD_VERSION%%', toolbar: () => html`<${Toolbar} />`, main: () => html`<${Main} />` });
Suite.files.dropZone(document.body, async (picked) => {
  const file = picked[0];
  if (!file) return;
  if (/\.(pptx|potx|ppsx|html?)$/i.test(file.file.name)) { if (await confirmDiscard()) await openPicked(file); }
});

function onPresentKey(e) {
  const show = () => (state.console ? showConsole() : showPresented());
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n'].includes(e.key)) { e.preventDefault(); advance(1); } else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p'].includes(e.key)) { e.preventDefault(); advance(-1); } else if (e.key === 'Escape') endPresentation();
  else if (e.key === 'Home') { state.presentIndex = 0; state.presentStep = startStep(state.deck.slides[0]); show(); } else if (e.key === 'End') { state.presentIndex = state.deck.slides.length - 1; state.presentStep = animationGroups(state.deck.slides[state.presentIndex]).length; show(); }
}

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (state.presenting) { onPresentKey(e); return; }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(e.shiftKey); return; }
  if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); open(); return; }
  if (e.key === 'F5') { e.preventDefault(); if (e.altKey) startConsole(); else present(!e.shiftKey); return; }
  if (editing || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) return;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (mod && e.key.toLowerCase() === 'c' && state.selected) { state.clipboard = structuredClone(findElement(state.selected)); return; }
  if (mod && e.key.toLowerCase() === 'x' && state.selected) { state.clipboard = structuredClone(findElement(state.selected)); deleteSelection(); return; }
  if (mod && e.key.toLowerCase() === 'v' && state.clipboard) { e.preventDefault(); addElement({ ...structuredClone(state.clipboard), id: newId(state.clipboard.type), x: state.clipboard.x + 20, y: state.clipboard.y + 20 }); return; }
  if (mod && e.key.toLowerCase() === 'd' && state.selected) { e.preventDefault(); duplicateElement(); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected) { e.preventDefault(); deleteSelection(); return; }
  if (e.key === 'Escape' && state.selected) { select(null); return; }
  if ((e.key === 'Enter' || e.key === 'F2') && state.selected) { e.preventDefault(); editText(state.selected); return; }
  if (e.key.startsWith('Arrow') && state.selected) {
    e.preventDefault();
    const d = e.shiftKey ? 10 : 1;
    setProp((x) => { if (e.key === 'ArrowLeft') x.x -= d; if (e.key === 'ArrowRight') x.x += d; if (e.key === 'ArrowUp') x.y -= d; if (e.key === 'ArrowDown') x.y += d; }, 'nudge');
    return;
  }
  if (!state.selected && (e.key === 'PageDown' || e.key === 'PageUp')) { e.preventDefault(); state.current = Math.max(0, Math.min(state.deck.slides.length - 1, state.current + (e.key === 'PageDown' ? 1 : -1))); render(); }
});

Suite.bridge.receive((picked) => openPicked(picked), { app: 'presentation' }); // files opened from other apps ("Open with…")

// for tests
window.PR = { state, select, editText, render, async openBase64(b64, name) { load(importPptx(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer), name, null); } };
render();
document.body.dataset.ready = 'true';
