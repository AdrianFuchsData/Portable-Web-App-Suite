/*
 * Image editor: layers, painting and selection tools, adjustments, transformations, clipboard, zoom/pan, PNG/JPEG/WebP/BMP
 * and OpenRaster (layered) files. Document model in doc.js, tools in tools.js, filters in filters.js.
 */
import { ImageDoc, BLEND_MODES, SAVE_FORMATS, formatOfName, openFile, encode, decodeImage, canvas, selectionPath, selectionOutline, maskSelection } from '@app/doc.js';
import { TOOLS, drawText, clampSelection } from '@app/tools.js';
import { snapPoint, snapRect, drawRuler } from '@app/guides.js';
import { ADJUSTMENTS, cssFilter, applyCssFilter, convolve, KERNELS, autoLevels, histogram, levelsLut, curveLut, channelLuts, lutCanvas, applyLuts } from '@app/filters.js';
import 'app/spell-dom'; // spelling selector in the header, marks in text fields (shared/js/spell-dom.js)

const { html } = Suite.shell;
const t = Suite.t;
const APP = 'imageeditor';
const OPEN_TYPES = [{ description: 'Images', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.ico', '.svg', '.avif', '.ora', '.psd'], 'image/vnd.adobe.photoshop': ['.psd'] } }];

Suite.i18n.register({
  en: {
    'app.title': 'Image editor',
    'ie.file': 'File', 'ie.edit': 'Edit', 'ie.image': 'Image', 'ie.layer': 'Layer', 'ie.filters': 'Filters', 'ie.view': 'View',
    'ie.new': 'New…', 'ie.open': 'Open…', 'ie.openLayer': 'Open as layer…', 'ie.save': 'Save', 'ie.saveAs': 'Save as…',
    'ie.undo': 'Undo', 'ie.redo': 'Redo', 'ie.cut': 'Cut', 'ie.copy': 'Copy', 'ie.paste': 'Paste as new layer', 'ie.selectAll': 'Select all',
    'ie.deselect': 'Deselect', 'ie.clear': 'Clear selection', 'ie.fillSel': 'Fill with foreground colour',
    'ie.resize': 'Image size…', 'ie.canvasSize': 'Canvas size…', 'ie.crop': 'Crop to selection', 'ie.rotateCw': 'Rotate 90° clockwise',
    'ie.rotateCcw': 'Rotate 90° counter-clockwise', 'ie.rotate180': 'Rotate 180°', 'ie.flipH': 'Flip horizontally', 'ie.flipV': 'Flip vertically', 'ie.flatten': 'Flatten image',
    'ie.newLayer': 'New layer', 'ie.duplicate': 'Duplicate layer', 'ie.deleteLayer': 'Delete layer', 'ie.mergeDown': 'Merge down',
    'ie.flipLayerH': 'Flip layer horizontally', 'ie.flipLayerV': 'Flip layer vertically',
    'ie.brightnessContrast': 'Brightness/contrast…', 'ie.hueSaturation': 'Hue/saturation…', 'ie.blur': 'Blur…', 'ie.sharpen': 'Sharpen',
    'ie.levels': 'Levels…', 'ie.curves': 'Curves…', 'ie.channel': 'Channel', 'ie.chRgb': 'RGB', 'ie.chR': 'Red', 'ie.chG': 'Green', 'ie.chB': 'Blue',
    'ie.inputLevels': 'Input levels (black, mid-tones, white)', 'ie.outputLevels': 'Output levels', 'ie.reset': 'Reset',
    'ie.curvesHint': 'Drag the points; click on the line adds a point, a double-click removes it.',
    'ie.grayscale': 'Grayscale', 'ie.sepia': 'Sepia', 'ie.invert': 'Invert colours', 'ie.autoLevels': 'Auto levels', 'ie.emboss': 'Emboss', 'ie.edges': 'Find edges',
    'ie.zoomIn': 'Zoom in', 'ie.zoomOut': 'Zoom out', 'ie.fit': 'Fit to window', 'ie.actual': 'Actual size (100 %)',
    'ie.brightness': 'Brightness', 'ie.contrast': 'Contrast', 'ie.hue': 'Hue', 'ie.saturation': 'Saturation', 'ie.lightness': 'Lightness', 'ie.radius': 'Radius',
    'ie.apply': 'Apply', 'ie.cancel': 'Cancel', 'ie.ok': 'OK', 'ie.width': 'Width', 'ie.height': 'Height', 'ie.keepRatio': 'Keep aspect ratio',
    'ie.smooth': 'Smooth (otherwise pixelated)', 'ie.anchor': 'Anchor', 'ie.background': 'Background', 'ie.white': 'White', 'ie.transparent': 'Transparent',
    'ie.foreground': 'Foreground colour', 'ie.bgColor': 'Background colour', 'ie.swap': 'Swap colours (X)', 'ie.size': 'Size', 'ie.opacity': 'Opacity',
    'ie.fillShape': 'Fill with background colour', 'ie.tolerance': 'Tolerance', 'ie.contiguous': 'Contiguous', 'ie.layers': 'Layers', 'ie.blend': 'Blend mode',
    'ie.text': 'Text', 'ie.font': 'Font', 'ie.fontSize': 'Font size', 'ie.bold': 'Bold', 'ie.italic': 'Italic', 'ie.fileName': 'File name', 'ie.format': 'Format',
    'ie.quality': 'Quality', 'ie.panels': 'Panels', 'ie.merged': 'The layers were merged into one image. Save as OpenRaster (.ora) or Photoshop (.psd) to keep them.',
    'ie.noClipboard': 'The clipboard contains no image.', 'ie.discard': 'Discard the unsaved changes?', 'ie.untitled': 'image',
    'ie.cannotOpen': '“{0}” cannot be opened as an image.', 'ie.colors': 'Colours', 'ie.toolOptions': 'Tool options',
    'tool.clone': 'Clone stamp (S)', 'tool.heal': 'Healing brush (J)', 'tool.smudge': 'Smudge (U)', 'tool.blur': 'Blur / sharpen (K)',
    'ie.sourceHint': 'Alt+click (or ⊕ and a tap) sets the source, then paint.', 'ie.sourceSet': 'Source set: paint to copy from it (Alt+click sets a new one).',
    'ie.pickSource': 'Set source', 'ie.aligned': 'Aligned (the source moves with every stroke)', 'ie.blurMode': 'Mode', 'ie.blurMode.blur': 'Blur', 'ie.blurMode.sharpen': 'Sharpen',
    'ie.strengthHint': 'The opacity sets the strength.',
    'tool.select-lasso': 'Lasso (F)', 'tool.select-polygon': 'Polygon lasso (P)', 'tool.select-wand': 'Magic wand (W)', 'ie.invertSel': 'Invert selection',
    'ie.selOp': 'Selection', 'ie.selOp.new': 'New', 'ie.selOp.add': 'Add (Shift)', 'ie.selOp.subtract': 'Subtract (Alt)', 'ie.selOp.intersect': 'Intersect',
    'ie.selOpHint': 'Shift adds to the selection, Alt subtracts from it.', 'ie.polygonHint': 'Click the corners; double-click, Enter or a click on the first point closes, Backspace removes the last corner.',
    'tool.move': 'Move (V)', 'tool.select-rect': 'Rectangle selection (M)', 'tool.select-ellipse': 'Ellipse selection (Q)', 'tool.brush': 'Brush (B)',
    'tool.pencil': 'Pencil (N)', 'tool.eraser': 'Eraser (E)', 'tool.fill': 'Fill (G)', 'tool.gradient': 'Gradient (D)', 'tool.picker': 'Colour picker (I)',
    'tool.line': 'Line (L)', 'tool.rect': 'Rectangle (R)', 'tool.ellipse': 'Ellipse (O)', 'tool.text': 'Text (T)', 'tool.hand': 'Hand (H, or hold Space)',
    'ie.selectCoords': 'Selection by coordinates…', 'ie.rulers': 'Rulers', 'ie.guides': 'Guides', 'ie.snapGuides': 'Snap to guides', 'ie.grid': 'Grid',
    'ie.snapGrid': 'Snap to grid', 'ie.snapEdges': 'Snap to image edges', 'ie.guideSettings': 'Guides and grid…', 'ie.newGuide': 'New guide…', 'ie.clearGuides': 'Remove all guides',
    'ie.gridSize': 'Grid spacing (px)', 'ie.snapDistance': 'Snap distance (screen px)', 'ie.orientation': 'Orientation', 'ie.horizontal': 'Horizontal', 'ie.vertical': 'Vertical',
    'ie.position': 'Position (px)', 'ie.selMode': 'Mode', 'ie.selFree': 'Free', 'ie.selRatio': 'Fixed aspect ratio', 'ie.selSize': 'Fixed size', 'ie.shape': 'Shape',
    'ie.rectangle': 'Rectangle', 'ie.ellipseShape': 'Ellipse', 'ie.select': 'Select', 'ie.guideHint': 'Drag from a ruler to add a guide; drag it back to remove it (with the move or hand tool).',
  },
  de: {
    'app.title': 'Bildbearbeitung',
    'ie.file': 'Datei', 'ie.edit': 'Bearbeiten', 'ie.image': 'Bild', 'ie.layer': 'Ebene', 'ie.filters': 'Filter', 'ie.view': 'Ansicht',
    'ie.new': 'Neu…', 'ie.open': 'Öffnen…', 'ie.openLayer': 'Als Ebene öffnen…', 'ie.save': 'Speichern', 'ie.saveAs': 'Speichern unter…',
    'ie.undo': 'Rückgängig', 'ie.redo': 'Wiederholen', 'ie.cut': 'Ausschneiden', 'ie.copy': 'Kopieren', 'ie.paste': 'Als neue Ebene einfügen', 'ie.selectAll': 'Alles auswählen',
    'ie.deselect': 'Auswahl aufheben', 'ie.clear': 'Auswahl löschen', 'ie.fillSel': 'Mit Vordergrundfarbe füllen',
    'ie.resize': 'Bildgröße…', 'ie.canvasSize': 'Leinwandgröße…', 'ie.crop': 'Auf Auswahl zuschneiden', 'ie.rotateCw': '90° im Uhrzeigersinn drehen',
    'ie.rotateCcw': '90° gegen den Uhrzeigersinn drehen', 'ie.rotate180': '180° drehen', 'ie.flipH': 'Horizontal spiegeln', 'ie.flipV': 'Vertikal spiegeln', 'ie.flatten': 'Auf eine Ebene reduzieren',
    'ie.newLayer': 'Neue Ebene', 'ie.duplicate': 'Ebene duplizieren', 'ie.deleteLayer': 'Ebene löschen', 'ie.mergeDown': 'Nach unten vereinen',
    'ie.flipLayerH': 'Ebene horizontal spiegeln', 'ie.flipLayerV': 'Ebene vertikal spiegeln',
    'ie.brightnessContrast': 'Helligkeit/Kontrast…', 'ie.hueSaturation': 'Farbton/Sättigung…', 'ie.blur': 'Weichzeichnen…', 'ie.sharpen': 'Schärfen',
    'ie.levels': 'Tonwerte…', 'ie.curves': 'Gradationskurven…', 'ie.channel': 'Kanal', 'ie.chRgb': 'RGB', 'ie.chR': 'Rot', 'ie.chG': 'Grün', 'ie.chB': 'Blau',
    'ie.inputLevels': 'Eingabe (Schwarz, Mitteltöne, Weiß)', 'ie.outputLevels': 'Ausgabe', 'ie.reset': 'Zurücksetzen',
    'ie.curvesHint': 'Ziehen Sie die Punkte; ein Klick auf die Linie fügt einen Punkt hinzu, ein Doppelklick entfernt ihn.',
    'ie.grayscale': 'Graustufen', 'ie.sepia': 'Sepia', 'ie.invert': 'Farben umkehren', 'ie.autoLevels': 'Tonwerte automatisch', 'ie.emboss': 'Relief', 'ie.edges': 'Kanten finden',
    'ie.zoomIn': 'Vergrößern', 'ie.zoomOut': 'Verkleinern', 'ie.fit': 'An Fenster anpassen', 'ie.actual': 'Originalgröße (100 %)',
    'ie.brightness': 'Helligkeit', 'ie.contrast': 'Kontrast', 'ie.hue': 'Farbton', 'ie.saturation': 'Sättigung', 'ie.lightness': 'Helligkeit', 'ie.radius': 'Radius',
    'ie.apply': 'Anwenden', 'ie.cancel': 'Abbrechen', 'ie.ok': 'OK', 'ie.width': 'Breite', 'ie.height': 'Höhe', 'ie.keepRatio': 'Seitenverhältnis beibehalten',
    'ie.smooth': 'Glätten (sonst pixelig)', 'ie.anchor': 'Anker', 'ie.background': 'Hintergrund', 'ie.white': 'Weiß', 'ie.transparent': 'Transparent',
    'ie.foreground': 'Vordergrundfarbe', 'ie.bgColor': 'Hintergrundfarbe', 'ie.swap': 'Farben tauschen (X)', 'ie.size': 'Größe', 'ie.opacity': 'Deckkraft',
    'ie.fillShape': 'Mit Hintergrundfarbe füllen', 'ie.tolerance': 'Toleranz', 'ie.contiguous': 'Zusammenhängend', 'ie.layers': 'Ebenen', 'ie.blend': 'Modus',
    'ie.text': 'Text', 'ie.font': 'Schrift', 'ie.fontSize': 'Schriftgröße', 'ie.bold': 'Fett', 'ie.italic': 'Kursiv', 'ie.fileName': 'Dateiname', 'ie.format': 'Format',
    'ie.quality': 'Qualität', 'ie.panels': 'Bereiche', 'ie.merged': 'Die Ebenen wurden zu einem Bild vereint. Speichern Sie als OpenRaster (.ora) oder Photoshop (.psd), um sie zu behalten.',
    'ie.noClipboard': 'Die Zwischenablage enthält kein Bild.', 'ie.discard': 'Die ungespeicherten Änderungen verwerfen?', 'ie.untitled': 'bild',
    'ie.cannotOpen': '„{0}“ kann nicht als Bild geöffnet werden.', 'ie.colors': 'Farben', 'ie.toolOptions': 'Werkzeugoptionen',
    'tool.clone': 'Kopierstempel (S)', 'tool.heal': 'Reparaturpinsel (J)', 'tool.smudge': 'Wischfinger (U)', 'tool.blur': 'Weichzeichnen / Schärfen (K)',
    'ie.sourceHint': 'Alt+Klick (oder ⊕ und Tippen) legt die Quelle fest, dann malen.', 'ie.sourceSet': 'Quelle gesetzt: malen kopiert von dort (Alt+Klick setzt eine neue).',
    'ie.pickSource': 'Quelle setzen', 'ie.aligned': 'Ausgerichtet (die Quelle wandert mit jedem Strich mit)', 'ie.blurMode': 'Modus', 'ie.blurMode.blur': 'Weichzeichnen', 'ie.blurMode.sharpen': 'Schärfen',
    'ie.strengthHint': 'Die Deckkraft bestimmt die Stärke.',
    'tool.select-lasso': 'Lasso (F)', 'tool.select-polygon': 'Polygon-Lasso (P)', 'tool.select-wand': 'Zauberstab (W)', 'ie.invertSel': 'Auswahl umkehren',
    'ie.selOp': 'Auswahl', 'ie.selOp.new': 'Neu', 'ie.selOp.add': 'Hinzufügen (Umschalt)', 'ie.selOp.subtract': 'Abziehen (Alt)', 'ie.selOp.intersect': 'Schnittmenge',
    'ie.selOpHint': 'Umschalt fügt der Auswahl hinzu, Alt zieht davon ab.', 'ie.polygonHint': 'Klicken Sie die Ecken an; Doppelklick, Eingabe oder ein Klick auf den ersten Punkt schließt, Rücktaste entfernt die letzte Ecke.',
    'tool.move': 'Verschieben (V)', 'tool.select-rect': 'Rechteckauswahl (M)', 'tool.select-ellipse': 'Ellipsenauswahl (Q)', 'tool.brush': 'Pinsel (B)',
    'tool.pencil': 'Stift (N)', 'tool.eraser': 'Radierer (E)', 'tool.fill': 'Füllen (G)', 'tool.gradient': 'Verlauf (D)', 'tool.picker': 'Farbpipette (I)',
    'tool.line': 'Linie (L)', 'tool.rect': 'Rechteck (R)', 'tool.ellipse': 'Ellipse (O)', 'tool.text': 'Text (T)', 'tool.hand': 'Hand (H oder Leertaste halten)',
    'ie.selectCoords': 'Auswahl nach Koordinaten…', 'ie.rulers': 'Lineale', 'ie.guides': 'Hilfslinien', 'ie.snapGuides': 'An Hilfslinien einrasten', 'ie.grid': 'Raster',
    'ie.snapGrid': 'Am Raster einrasten', 'ie.snapEdges': 'An Bildrändern einrasten', 'ie.guideSettings': 'Hilfslinien und Raster…', 'ie.newGuide': 'Neue Hilfslinie…', 'ie.clearGuides': 'Alle Hilfslinien entfernen',
    'ie.gridSize': 'Rasterabstand (px)', 'ie.snapDistance': 'Einrastabstand (Bildschirm-px)', 'ie.orientation': 'Ausrichtung', 'ie.horizontal': 'Waagrecht', 'ie.vertical': 'Senkrecht',
    'ie.position': 'Position (px)', 'ie.selMode': 'Modus', 'ie.selFree': 'Frei', 'ie.selRatio': 'Festes Seitenverhältnis', 'ie.selSize': 'Feste Größe', 'ie.shape': 'Form',
    'ie.rectangle': 'Rechteck', 'ie.ellipseShape': 'Ellipse', 'ie.select': 'Auswählen', 'ie.guideHint': 'Ziehen Sie aus einem Lineal, um eine Hilfslinie anzulegen; ziehen Sie sie zurück, um sie zu entfernen (mit dem Verschiebe- oder Handwerkzeug).',
  },
});

// ---- editor state --------------------------------------------------------------------------------------

const ed = {
  doc: new ImageDoc(800, 600, { background: '#ffffff' }),
  name: '', handle: null, format: 'png',
  tool: TOOLS.find((x) => x.id === 'brush'),
  opts: { size: 8, opacity: 1, fillShape: false, tolerance: 32, contiguous: true, selMode: 'free', selRatioW: 16, selRatioH: 9, selW: 100, selH: 100, aligned: true, pickSource: false, blurMode: 'blur' },
  colors: { primary: '#000000', secondary: '#ffffff' },
  view: { zoom: 1, x: 0, y: 0 },
  preview: null, adjust: null, dialog: null, panels: false, cursor: null, renamingLayer: null, clip: null,
  render: () => draw(), refresh: () => refresh(), changed, toImage, textAt,
  guides: [], selecting: false,
};

// ---- view preferences: rulers, guides, grid, snapping (remembered in the browser) -----------------------------------

const PREFS_KEY = 'suite.imageeditor.view';
const prefs = Object.assign(
  { rulers: !window.matchMedia('(max-width: 760px)').matches, guides: true, snapGuides: true, snapEdges: false, grid: false, snapGrid: false, gridSize: 16, snapDistance: 8 },
  (() => { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch (e) { return {}; } })(),
);
ed.prefs = prefs;
function setPref(key, value) {
  prefs[key] = value;
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* storage blocked */ }
  stage.classList.toggle('with-rulers', !!prefs.rulers);
  draw();
  refresh();
}
const snapContext = () => ({ guides: prefs.guides ? ed.guides : [], width: ed.doc.width, height: ed.doc.height, prefs, zoom: ed.view.zoom });
ed.snap = (p) => snapPoint(p, snapContext());
ed.snapRect = (r) => snapRect(r, snapContext());
let nextGuide = 1;
function addGuide(axis, pos) { const g = { id: nextGuide++, axis, pos: Math.round(pos) }; ed.guides.push(g); if (!prefs.guides) setPref('guides', true); draw(); return g; }
ed.name = `${t('ie.untitled')}.png`;

let uiQueued = false;
function refresh() {
  if (uiQueued) return;
  uiQueued = true;
  requestAnimationFrame(() => { uiQueued = false; Suite.shell.refresh(); });
}

function changed() {
  ed.doc.dirty = true;
  Suite.shell.setDirty(true);
  thumbsVersion++;
  draw();
  refresh();
}

const fail = (e) => { console.warn(e); Suite.shell.toast(Suite.i18n.describe(e), 'error'); };

// ---- view canvas -----------------------------------------------------------------------------------------

const view = document.createElement('canvas');
view.className = 'ie-view';
view.dataset.testid = 'canvas';
view.setAttribute('touch-action', 'none');
// stage: corner, rulers and the canvas box (built once, outside of Preact)
const stage = document.createElement('div');
stage.className = 'ie-stage-grid';
const corner = document.createElement('div');
corner.className = 'ie-ruler-corner';
const rulerH = document.createElement('canvas');
rulerH.className = 'ie-ruler ie-ruler-h';
rulerH.dataset.testid = 'ruler-h';
const rulerV = document.createElement('canvas');
rulerV.className = 'ie-ruler ie-ruler-v';
rulerV.dataset.testid = 'ruler-v';
const canvasBox = document.createElement('div');
canvasBox.className = 'ie-canvas-box';
canvasBox.append(view);
stage.append(corner, rulerH, rulerV, canvasBox);
stage.classList.toggle('with-rulers', !!prefs.rulers);
const vctx = view.getContext('2d');
let viewW = 0, viewH = 0;
const dpr = () => window.devicePixelRatio || 1;

const checker = (() => {
  const c = canvas(16, 16);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#ccc'; ctx.fillRect(0, 0, 8, 8); ctx.fillRect(8, 8, 8, 8);
  return vctx.createPattern(c, 'repeat');
})();

let drawQueued = false;
function draw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; paint(); });
}

function paint() {
  const { zoom, x, y } = ed.view;
  const doc = ed.doc;
  const ratio = dpr();
  vctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  vctx.clearRect(0, 0, viewW, viewH);
  // checkerboard (screen space) behind the image
  vctx.save();
  vctx.beginPath();
  vctx.rect(x, y, doc.width * zoom, doc.height * zoom);
  vctx.clip();
  vctx.fillStyle = checker;
  vctx.fillRect(x, y, doc.width * zoom, doc.height * zoom);
  vctx.translate(x, y);
  vctx.scale(zoom, zoom);
  vctx.imageSmoothingEnabled = zoom < 2;
  doc.drawLayers(vctx, { override: ed.preview, filterLayer: ed.adjust ? doc.layer : null, filter: ed.adjust ? ed.adjust.filter : 'none' });
  vctx.restore();
  vctx.save();
  vctx.translate(x, y);
  vctx.scale(zoom, zoom);
  if (ed.tool.overlay) ed.tool.overlay(vctx, zoom, ed);
  // selection outline (black/white dashes) and brush cursor
  if (doc.selection) {
    vctx.lineWidth = 1 / zoom;
    vctx.beginPath();
    selectionOutline(vctx, doc.selection);
    vctx.setLineDash([]);
    vctx.strokeStyle = '#000';
    vctx.stroke();
    vctx.setLineDash([4 / zoom, 4 / zoom]);
    vctx.strokeStyle = '#fff';
    vctx.stroke();
  }
  if (ed.cursor && ['brush', 'pencil', 'eraser', 'clone', 'heal', 'smudge', 'blur'].includes(ed.tool.id)) {
    vctx.setLineDash([]);
    vctx.lineWidth = 1 / zoom;
    vctx.strokeStyle = 'rgba(128,128,128,.9)';
    vctx.beginPath();
    vctx.arc(ed.cursor.x, ed.cursor.y, Math.max(0.5, ed.opts.size / 2), 0, Math.PI * 2);
    vctx.stroke();
  }
  vctx.restore();
  vctx.strokeStyle = 'rgba(0,0,0,.4)';
  vctx.lineWidth = 1;
  vctx.strokeRect(x - 0.5, y - 0.5, doc.width * zoom + 1, doc.height * zoom + 1);
  paintGuides();
  paintRulers();
  syncSelectionInfo();
}

/** Grid (over the image), guides (across the view) and the size of a selection being drawn. */
function paintGuides() {
  const { zoom, x, y } = ed.view;
  const doc = ed.doc;
  if (prefs.grid && prefs.gridSize * zoom >= 4) {
    vctx.save();
    vctx.beginPath();
    for (let gx = prefs.gridSize; gx < doc.width; gx += prefs.gridSize) { const sx = Math.round(x + gx * zoom) + 0.5; vctx.moveTo(sx, y); vctx.lineTo(sx, y + doc.height * zoom); }
    for (let gy = prefs.gridSize; gy < doc.height; gy += prefs.gridSize) { const sy = Math.round(y + gy * zoom) + 0.5; vctx.moveTo(x, sy); vctx.lineTo(x + doc.width * zoom, sy); }
    vctx.strokeStyle = 'rgba(0,0,0,.28)';
    vctx.lineWidth = 1;
    vctx.stroke();
    vctx.restore();
  }
  if (prefs.guides) {
    for (const g of ed.guides) {
      const s = Math.round((g.axis === 'v' ? x : y) + g.pos * zoom) + 0.5;
      vctx.beginPath();
      if (g.axis === 'v') { vctx.moveTo(s, 0); vctx.lineTo(s, viewH); } else { vctx.moveTo(0, s); vctx.lineTo(viewW, s); }
      vctx.lineWidth = 1;
      vctx.setLineDash([]);
      vctx.strokeStyle = guideDrag && guideDrag.guide === g ? 'rgba(255,90,0,.95)' : 'rgba(0,150,255,.95)';
      vctx.stroke();
    }
  }
  const sel = doc.selection;
  if (ed.selecting && sel) {
    const label = `${sel.w} × ${sel.h}`;
    vctx.font = '12px system-ui, sans-serif';
    const tw = vctx.measureText(label).width + 8;
    const lx = Math.min(viewW - tw - 2, x + (sel.x + sel.w) * zoom + 6), ly = Math.min(viewH - 20, y + (sel.y + sel.h) * zoom + 6);
    vctx.fillStyle = 'rgba(0,0,0,.7)';
    vctx.fillRect(lx, ly, tw, 18);
    vctx.fillStyle = '#fff';
    vctx.textBaseline = 'middle';
    vctx.fillText(label, lx + 4, ly + 9);
  }
}

function paintRulers() {
  if (!prefs.rulers) return;
  const style = getComputedStyle(document.documentElement);
  const color = (name, fallback) => (style.getPropertyValue(name) || '').trim() || fallback;
  const colors = {
    bg: color('--pico-card-sectioning-background-color', '#f4f4f4'), image: color('--pico-card-background-color', '#fff'),
    fg: color('--pico-muted-color', '#666'), tick: color('--pico-muted-border-color', '#bbb'), mark: 'rgba(255,90,0,.95)', guide: 'rgba(0,150,255,.95)',
  };
  const c = ed.cursor;
  const guides = prefs.guides ? ed.guides : [];
  drawRuler(rulerH, { horizontal: true, offset: ed.view.x, zoom: ed.view.zoom, cursor: c ? c.x : null, guides: guides.filter((g) => g.axis === 'v').map((g) => g.pos), size: ed.doc.width, colors });
  drawRuler(rulerV, { horizontal: false, offset: ed.view.y, zoom: ed.view.zoom, cursor: c ? c.y : null, guides: guides.filter((g) => g.axis === 'h').map((g) => g.pos), size: ed.doc.height, colors });
}

/** Selection position and size in the status bar and in the selection fields of the tool options (unless edited). */
function syncSelectionInfo() {
  const sel = ed.doc.selection;
  const info = document.querySelector('[data-testid=selection-info]');
  if (info) info.textContent = sel ? `⬚ ${sel.x}, ${sel.y} · ${sel.w} × ${sel.h}` : '';
  for (const key of ['x', 'y', 'w', 'h']) {
    const el = document.querySelector(`[data-testid=sel-${key}]`);
    if (el && el !== document.activeElement) el.value = sel ? sel[key] : '';
  }
}

function resizeView() {
  const box = view.parentElement;
  if (!box) return;
  const r = box.getBoundingClientRect();
  viewW = r.width; viewH = r.height;
  view.width = Math.round(r.width * dpr());
  view.height = Math.round(r.height * dpr());
  view.style.width = `${r.width}px`;
  view.style.height = `${r.height}px`;
  if (!ed.fitted && viewW > 0) { fit(); ed.fitted = true; }
  draw();
}
const resizeObserver = new ResizeObserver(resizeView);

function fit() {
  const pad = 24;
  const zoom = Math.min(1, (viewW - pad * 2) / ed.doc.width, (viewH - pad * 2) / ed.doc.height);
  setZoom(Math.max(0.01, zoom), null, true);
}

function setZoom(zoom, at = null, center = false) {
  zoom = Math.min(64, Math.max(0.01, zoom));
  const v = ed.view;
  if (center) {
    v.x = Math.round((viewW - ed.doc.width * zoom) / 2);
    v.y = Math.round((viewH - ed.doc.height * zoom) / 2);
  } else {
    const p = at || { x: viewW / 2, y: viewH / 2 };
    v.x = p.x - ((p.x - v.x) * zoom) / v.zoom;
    v.y = p.y - ((p.y - v.y) * zoom) / v.zoom;
  }
  v.zoom = zoom;
  draw();
  refresh();
}
const zoomStep = (dir, at) => setZoom(ed.view.zoom * (dir > 0 ? 1.25 : 0.8), at);

function toImage(e) {
  const r = view.getBoundingClientRect();
  return { x: (e.clientX - r.left - ed.view.x) / ed.view.zoom, y: (e.clientY - r.top - ed.view.y) / ed.view.zoom };
}

// pointer input: tools, panning (hand, Space, middle button), two-finger pinch/pan and guides
const pointers = new Map();
let pan = null, pinch = null, toolActive = false, spaceDown = false, guideDrag = null;

/** Tool coordinates: snapped to guides, grid and image edges for the tools that use it. */
const toolPoint = (e) => (ed.tool.snaps ? ed.snap(toImage(e)) : toImage(e));

/** The guide within 4 screen pixels of the pointer (move and hand tools), or null. */
function guideAt(e) {
  if (!prefs.guides || !['move', 'hand'].includes(ed.tool.id)) return null;
  const r = view.getBoundingClientRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  return ed.guides.find((g) => Math.abs((g.axis === 'v' ? ed.view.x + g.pos * ed.view.zoom - sx : ed.view.y + g.pos * ed.view.zoom - sy)) <= 4) || null;
}
function moveGuide(e) {
  const p = toImage(e);
  const g = guideDrag.guide;
  g.pos = Math.round(g.axis === 'v' ? p.x : p.y);
  ed.cursor = p;
  draw();
}
/** Dropping a guide outside of the canvas or outside of the image removes it. */
function endGuide(e) {
  const r = view.getBoundingClientRect();
  const g = guideDrag.guide;
  const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  if (!inside || g.pos < 0 || g.pos > (g.axis === 'v' ? ed.doc.width : ed.doc.height)) ed.guides = ed.guides.filter((x) => x !== g);
  guideDrag = null;
  draw();
  refresh();
}
for (const [ruler, axis] of [[rulerH, 'h'], [rulerV, 'v']]) {
  ruler.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    ruler.setPointerCapture(e.pointerId);
    guideDrag = { guide: addGuide(axis, -1) };
    moveGuide(e);
  });
  ruler.addEventListener('pointermove', (e) => { if (guideDrag) moveGuide(e); });
  ruler.addEventListener('pointerup', (e) => { if (guideDrag) endGuide(e); });
  ruler.addEventListener('pointercancel', () => { if (guideDrag) { ed.guides = ed.guides.filter((x) => x !== guideDrag.guide); guideDrag = null; draw(); } });
}

view.addEventListener('pointerdown', (e) => {
  view.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  closeMenus();
  if (pointers.size === 2) {
    if (toolActive && ed.tool.cancel) { ed.tool.cancel(ed); if (ed.doc.undoStack.length) ed.doc.undo(); ed.doc.redoStack.pop(); }
    toolActive = false;
    const [a, b] = [...pointers.values()];
    pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, zoom: ed.view.zoom, vx: ed.view.x, vy: ed.view.y };
    draw();
    return;
  }
  const guide = e.button === 0 && !spaceDown ? guideAt(e) : null;
  if (guide) { guideDrag = { guide }; draw(); return; }
  if (e.button === 1 || ed.tool.id === 'hand' || spaceDown) {
    pan = { x: e.clientX, y: e.clientY, vx: ed.view.x, vy: ed.view.y };
    return;
  }
  if (e.button !== 0 && !(e.button === 2 && ['fill', 'picker'].includes(ed.tool.id))) return;
  if (ed.tool.down) { toolActive = true; ed.tool.down(toolPoint(e), e, ed); draw(); }
});

view.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const r = view.getBoundingClientRect();
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const zoom = Math.min(64, Math.max(0.01, pinch.zoom * (dist / pinch.dist)));
    const px = pinch.mid.x - r.left, py = pinch.mid.y - r.top;
    ed.view.zoom = zoom;
    ed.view.x = px - ((px - pinch.vx) * zoom) / pinch.zoom + (mid.x - pinch.mid.x);
    ed.view.y = py - ((py - pinch.vy) * zoom) / pinch.zoom + (mid.y - pinch.mid.y);
    draw();
    refresh();
    return;
  }
  if (guideDrag) { moveGuide(e); return; }
  if (pan) {
    ed.view.x = pan.vx + e.clientX - pan.x;
    ed.view.y = pan.vy + e.clientY - pan.y;
    draw();
    return;
  }
  const p = toImage(e);
  ed.cursor = e.pointerType === 'touch' ? null : p;
  if ((toolActive || ed.tool.id === 'select-polygon') && ed.tool.move) ed.tool.move(toolPoint(e), e, ed); // the polygon lasso follows the pointer between clicks
  else if (!toolActive) { const g = guideAt(e); view.style.cursor = g ? (g.axis === 'v' ? 'col-resize' : 'row-resize') : toolCursor(); }
  draw();
  setStatusPos(p);
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pinch) { if (pointers.size < 2) pinch = null; return; }
  if (guideDrag) { endGuide(e); return; }
  if (pan) { pan = null; refresh(); return; }
  if (toolActive) {
    toolActive = false;
    if (ed.tool.up) ed.tool.up(toolPoint(e), e, ed);
    draw();
    refresh();
  }
}
view.addEventListener('pointerup', endPointer);
view.addEventListener('pointercancel', (e) => {
  pointers.delete(e.pointerId);
  if (toolActive && ed.tool.cancel) ed.tool.cancel(ed);
  toolActive = false; pan = null; pinch = null;
  draw();
});
view.addEventListener('pointerleave', () => { if (!guideDrag) { ed.cursor = null; draw(); } });
view.addEventListener('contextmenu', (e) => e.preventDefault());
view.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = view.getBoundingClientRect();
  if (e.ctrlKey || e.metaKey) setZoom(ed.view.zoom * Math.exp(-e.deltaY * 0.0025), { x: e.clientX - r.left, y: e.clientY - r.top });
  else { ed.view.x -= e.shiftKey ? e.deltaY : e.deltaX; ed.view.y -= e.shiftKey ? 0 : e.deltaY; draw(); }
}, { passive: false });

let statusEl = null;
function setStatusPos(p) {
  if (!statusEl) statusEl = document.querySelector('[data-testid=position]');
  if (statusEl) statusEl.textContent = p && p.x >= 0 && p.y >= 0 && p.x < ed.doc.width && p.y < ed.doc.height ? `${Math.floor(p.x)}, ${Math.floor(p.y)}` : '';
}

// ---- documents and files --------------------------------------------------------------------------------

// recovery copies of unsaved work (shared/js/autosave.js): the layers as OpenRaster
Suite.autosave.register({
  app: APP,
  save: async () => (ed.doc.dirty ? { name: ed.name, handle: ed.handle, ora: await encode(ed.doc, 'ora') } : null),
  restore: async (s) => { setDoc(await openFile(s.ora, 'recovered.ora'), s.name, s.handle || null); changed(); },
});

function setDoc(doc, name, handle = null) {
  if (ed.tool.cancel) ed.tool.cancel(ed);
  ed.doc = doc;
  ed.name = name;
  ed.handle = handle;
  ed.format = formatOfName(name);
  ed.preview = null;
  ed.adjust = null;
  ed.guides = [];
  doc.dirty = false;
  Suite.shell.setDirty(false);
  thumbsVersion++;
  fit();
  refresh();
}

async function confirmDiscard() { return !ed.doc.dirty || Suite.shell.confirm(t('ie.discard')); }

async function openPicked({ file, handle }) {
  try {
    setDoc(await openFile(new Uint8Array(await file.arrayBuffer()), file.name), file.name, handle);
    if (handle) Suite.files.remember(APP, handle);
  } catch (e) { console.warn(e); Suite.shell.toast(t('ie.cannotOpen', file.name), 'error'); }
}

async function openImage() {
  if (!(await confirmDiscard())) return;
  const picked = await Suite.files.open({ types: OPEN_TYPES }).catch(fail);
  if (picked) await openPicked(picked[0]);
}

async function addImageLayer(blob, name) {
  try {
    const img = await decodeImage(blob);
    ed.doc.addLayer(name.replace(/\.[^.]+$/, ''), { source: img, index: ed.doc.active + 1 });
    selectTool('move');
    changed();
  } catch (e) { Suite.shell.toast(t('ie.cannotOpen', name), 'error'); }
}

async function openAsLayer() {
  const picked = await Suite.files.open({ types: OPEN_TYPES, multiple: true }).catch(fail);
  if (picked) for (const p of picked) await addImageLayer(p.file, p.file.name);
}

function report(result) { if (result.mode === 'downloaded') Suite.shell.banner(result.message); else Suite.shell.toast(result.message); }

async function save({ as = false, name = ed.name, format = ed.format, quality = 0.92 } = {}) {
  try {
    if (ed.preview && ed.tool.cancel) ed.tool.cancel(ed);
    const bytes = await encode(ed.doc, format, { quality });
    const info = SAVE_FORMATS[format];
    const types = [{ description: info.label, accept: { [info.mime]: [info.ext] } }];
    const result = as || !ed.handle ? await Suite.files.saveAs(bytes, { suggestedName: name, types, type: info.mime }) : await Suite.files.save({ name, handle: ed.handle }, bytes, { type: info.mime });
    if (!result) return;
    report(result);
    if (result.handle) ed.handle = result.handle;
    ed.name = result.name || name;
    ed.format = format;
    ed.doc.dirty = false;
    Suite.shell.setDirty(false);
    if (format !== 'ora' && format !== 'psd' && ed.doc.layers.length > 1) Suite.shell.toast(t('ie.merged'), 'warning');
    refresh();
  } catch (e) { fail(e); }
}

function openSaveAs() {
  ed.dialog = { kind: 'saveAs', stem: ed.name.replace(/\.[^.]+$/, '') || t('ie.untitled'), format: ed.format, quality: 92 };
  refresh();
}

// ---- edit operations ----------------------------------------------------------------------------------------

/** Pixels of the selection (or the whole layer) of the active layer as a canvas of the selection's bounds. */
function selectionCanvas() {
  const doc = ed.doc;
  const b = doc.selectionBounds();
  if (b.w < 1 || b.h < 1) return null;
  const c = canvas(b.w, b.h);
  const ctx = c.getContext('2d');
  ctx.translate(-b.x, -b.y);
  doc.clip(ctx);
  ctx.drawImage(doc.layer.canvas, 0, 0);
  return { canvas: c, x: b.x, y: b.y };
}

async function copy() {
  const sel = selectionCanvas();
  if (!sel) return;
  ed.clip = sel;
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      const blob = await new Promise((r) => sel.canvas.toBlob(r, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    }
  } catch (e) { /* the internal clipboard still works */ }
}

function clearSelection() {
  const doc = ed.doc;
  doc.record('layer');
  const ctx = doc.layer.canvas.getContext('2d');
  ctx.save();
  if (doc.selection) { doc.clip(ctx); }
  ctx.clearRect(0, 0, doc.width, doc.height);
  ctx.restore();
  changed();
}

async function cut() { await copy(); clearSelection(); }

function pasteCanvas(source, x = 0, y = 0) {
  const doc = ed.doc;
  const layer = doc.addLayer(t('ie.paste').replace(/ .*/, ''), { index: doc.active + 1 });
  layer.canvas.getContext('2d').drawImage(source, x, y);
  doc.selection = { type: 'rect', x, y, w: source.width, h: source.height };
  selectTool('move');
  changed();
}

async function paste() {
  try {
    if (navigator.clipboard && navigator.clipboard.read) {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((ty) => ty.startsWith('image/'));
        if (type) { const img = await decodeImage(await item.getType(type)); pasteCanvas(img, ed.clip && ed.clip.canvas.width === img.width && ed.clip.canvas.height === img.height ? ed.clip.x : 0, ed.clip && ed.clip.canvas.width === img.width ? ed.clip.y : 0); return; }
      }
    }
  } catch (e) { /* permission denied or not supported: fall back to the internal clipboard */ }
  if (ed.clip) pasteCanvas(ed.clip.canvas, ed.clip.x, ed.clip.y);
  else Suite.shell.toast(t('ie.noClipboard'), 'warning');
}

document.addEventListener('paste', async (e) => {
  if (/^(INPUT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName)) return;
  const file = [...(e.clipboardData ? e.clipboardData.files : [])].find((f) => f.type.startsWith('image/'));
  if (!file) return;
  e.preventDefault();
  try { pasteCanvas(await decodeImage(file)); } catch (err) { fail(err); }
});

function fillSelection() {
  const doc = ed.doc;
  doc.record('layer');
  const ctx = doc.layer.canvas.getContext('2d');
  ctx.save();
  doc.clip(ctx);
  ctx.globalAlpha = ed.opts.opacity;
  ctx.fillStyle = ed.colors.primary;
  ctx.fillRect(0, 0, doc.width, doc.height);
  ctx.restore();
  changed();
}

function undo() { if (ed.tool.cancel) ed.tool.cancel(ed); if (ed.doc.undo()) { thumbsVersion++; changed(); } }
function redo() { if (ed.doc.redo()) { thumbsVersion++; changed(); } }

function docOp(fn) { return () => { fn(ed.doc); thumbsVersion++; changed(); if (ed.view.zoom) fit(); }; }

const toolCursor = () => ({ hand: 'grab', move: 'move', text: 'text', picker: 'copy' }[ed.tool.id] || 'crosshair');

/** Select everything that is not selected (nothing selected: nothing changes). */
function invertSelection() {
  const doc = ed.doc;
  const mask = doc.selectionMask();
  if (!mask) return;
  for (let i = 0; i < mask.length; i++) mask[i] = mask[i] >= 128 ? 0 : 1;
  doc.selection = maskSelection(mask, doc.width, doc.height);
  draw();
}

function selectTool(id) {
  if (ed.tool.cancel) ed.tool.cancel(ed);
  ed.tool = TOOLS.find((x) => x.id === id) || ed.tool;
  view.style.cursor = toolCursor();
  draw();
  refresh();
}

function textAt(p) {
  ed.dialog = { kind: 'text', point: p, text: '', font: ed.opts.font || 'sans-serif', fontSize: ed.opts.fontSize || 32, bold: false, italic: false };
  refresh();
}

function startAdjust(kind) {
  if (ADJUSTMENTS[kind]) {
    const values = Object.fromEntries(ADJUSTMENTS[kind].params.map(([k, , , def]) => [k, def]));
    ed.adjust = { kind, values, filter: cssFilter(kind, values) };
    ed.dialog = { kind: 'adjust' };
    draw();
    refresh();
  } else {
    applyCssFilter(ed.doc, cssFilter(kind, {}));
    changed();
  }
}

// ---- menus ------------------------------------------------------------------------------------------------------

function closeMenus() { for (const d of document.querySelectorAll('details.ie-menu[open]')) d.open = false; }

const MENUS = () => [
  ['ie.file', [
    ['ie.new', () => confirmDiscard().then((ok) => { if (ok) { ed.dialog = { kind: 'new', width: 800, height: 600, background: 'white' }; refresh(); } }), 'Ctrl+N'],
    ['ie.open', openImage, 'Ctrl+O'], ['ie.openLayer', openAsLayer], ['ie.save', () => save(), 'Ctrl+S'], ['ie.saveAs', openSaveAs, 'Ctrl+Shift+S'],
  ]],
  ['ie.edit', [
    ['ie.undo', undo, 'Ctrl+Z'], ['ie.redo', redo, 'Ctrl+Y'], null, ['ie.cut', cut, 'Ctrl+X'], ['ie.copy', copy, 'Ctrl+C'], ['ie.paste', paste, 'Ctrl+V'], null,
    ['ie.selectAll', () => { ed.doc.selection = { type: 'rect', x: 0, y: 0, w: ed.doc.width, h: ed.doc.height }; draw(); }, 'Ctrl+A'],
    ['ie.deselect', () => { ed.doc.selection = null; draw(); }, 'Ctrl+D'], ['ie.invertSel', invertSelection, 'Ctrl+Shift+I'], ['ie.clear', clearSelection, 'Del'], ['ie.fillSel', fillSelection], null,
    ['ie.selectCoords', openSelectionDialog],
  ]],
  ['ie.image', [
    ['ie.resize', () => { ed.dialog = { kind: 'resize', width: ed.doc.width, height: ed.doc.height, keep: true, smooth: true }; refresh(); }],
    ['ie.canvasSize', () => { ed.dialog = { kind: 'canvasSize', width: ed.doc.width, height: ed.doc.height, ax: 0.5, ay: 0.5 }; refresh(); }],
    ['ie.crop', () => { if (ed.doc.selection) docOp((d) => d.crop(d.selectionBounds()))(); }], null,
    ['ie.rotateCw', docOp((d) => d.rotate(90))], ['ie.rotateCcw', docOp((d) => d.rotate(270))], ['ie.rotate180', docOp((d) => d.rotate(180))],
    ['ie.flipH', docOp((d) => d.flip(true))], ['ie.flipV', docOp((d) => d.flip(false))], null, ['ie.flatten', docOp((d) => d.flatten())],
  ]],
  ['ie.layer', [
    ['ie.newLayer', () => { ed.doc.addLayer(null, { index: ed.doc.active + 1 }); changed(); }, 'Ctrl+Shift+N'],
    ['ie.duplicate', () => { ed.doc.duplicateLayer(); changed(); }], ['ie.deleteLayer', () => { ed.doc.deleteLayer(); changed(); }],
    ['ie.mergeDown', () => { ed.doc.mergeDown(); changed(); }, 'Ctrl+E'], null,
    ['ie.flipLayerH', () => { ed.doc.flip(true, true); changed(); }], ['ie.flipLayerV', () => { ed.doc.flip(false, true); changed(); }],
  ]],
  ['ie.filters', [
    ['ie.brightnessContrast', () => startAdjust('brightnessContrast')], ['ie.hueSaturation', () => startAdjust('hueSaturation')],
    ['ie.levels', () => startTones('levels')], ['ie.curves', () => startTones('curves')],
    ['ie.autoLevels', () => { autoLevels(ed.doc); changed(); }], null,
    ['ie.blur', () => startAdjust('blur')], ['ie.sharpen', () => { convolve(ed.doc, KERNELS.sharpen); changed(); }], null,
    ['ie.grayscale', () => startAdjust('grayscale')], ['ie.sepia', () => startAdjust('sepia')], ['ie.invert', () => startAdjust('invert')], null,
    ['ie.emboss', () => { convolve(ed.doc, KERNELS.emboss); changed(); }], ['ie.edges', () => { convolve(ed.doc, KERNELS.edges); changed(); }],
  ]],
  ['ie.view', [
    ['ie.zoomIn', () => zoomStep(1), '+'], ['ie.zoomOut', () => zoomStep(-1), '−'], ['ie.fit', fit, '0'], ['ie.actual', () => setZoom(1, null, true), '1'], null,
    ['ie.rulers', () => setPref('rulers', !prefs.rulers), '', prefs.rulers], ['ie.guides', () => setPref('guides', !prefs.guides), '', prefs.guides],
    ['ie.snapGuides', () => setPref('snapGuides', !prefs.snapGuides), '', prefs.snapGuides], ['ie.grid', () => setPref('grid', !prefs.grid), '', prefs.grid],
    ['ie.snapGrid', () => setPref('snapGrid', !prefs.snapGrid), '', prefs.snapGrid], ['ie.snapEdges', () => setPref('snapEdges', !prefs.snapEdges), '', prefs.snapEdges], null,
    ['ie.newGuide', () => { ed.dialog = { kind: 'guide', axis: 'h', pos: Math.round(ed.doc.height / 2) }; refresh(); }],
    ['ie.clearGuides', () => { ed.guides = []; draw(); }],
    ['ie.guideSettings', () => { ed.dialog = { kind: 'guideSettings', gridSize: prefs.gridSize, snapDistance: prefs.snapDistance }; refresh(); }],
  ]],
];

function Menus() {
  return html`<nav class="ie-menus">${MENUS().map(([title, items]) => html`<details class="ie-menu dropdown" data-testid=${`menu-${title.slice(3)}`}
      onToggle=${(e) => { if (e.target.open) for (const d of document.querySelectorAll('details.ie-menu[open]')) if (d !== e.target) d.open = false; }}>
    <summary>${t(title)}</summary>
    <ul role="menu">${items.map((item) => (item ? html`<li role="none"><a href="#" data-testid=${`cmd-${item[0].slice(3)}`} role=${item[3] === undefined ? 'menuitem' : 'menuitemcheckbox'} aria-checked=${item[3] === undefined ? undefined : String(!!item[3])}
      onClick=${(e) => { e.preventDefault(); closeMenus(); Promise.resolve(item[1]()).catch(fail); }}>
      <span>${item[3] === undefined ? '' : item[3] ? '✓ ' : html`<span class="ie-check-space">✓ </span>`}${t(item[0])}</span>${item[2] ? html`<kbd>${item[2]}</kbd>` : null}</a></li>` : html`<li role="separator"><hr /></li>`))}</ul>
  </details>`)}
    <${Suite.shell.Recent} app=${APP} before=${confirmDiscard} onOpen=${(p) => openPicked(p)} />
    <button class="secondary outline ie-panels-toggle" data-testid="toggle-panels" onClick=${() => { ed.panels = !ed.panels; refresh(); }}>☰ ${t('ie.panels')}</button>
  </nav>`;
}

// ---- side panels --------------------------------------------------------------------------------------------------

function ToolPalette() {
  return html`<div class="ie-tools" role="toolbar" data-testid="tools">${TOOLS.map((tool) => html`<button class=${ed.tool === tool ? 'active' : 'secondary outline'}
    title=${t(`tool.${tool.id}`)} aria-label=${t(`tool.${tool.id}`)} aria-pressed=${ed.tool === tool} data-testid=${`tool-${tool.id}`} onClick=${() => selectTool(tool.id)}>${tool.icon}</button>`)}
    <div class="ie-swatches" title=${t('ie.colors')}>
      <input type="color" value=${ed.colors.primary} data-testid="color-primary" title=${t('ie.foreground')} onInput=${(e) => { ed.colors.primary = e.target.value; refresh(); }} />
      <input type="color" value=${ed.colors.secondary} data-testid="color-secondary" title=${t('ie.bgColor')} onInput=${(e) => { ed.colors.secondary = e.target.value; refresh(); }} />
      <button class="secondary outline" title=${t('ie.swap')} data-testid="swap-colors" onClick=${swapColors}>⇄</button>
    </div>
  </div>`;
}

function swapColors() { [ed.colors.primary, ed.colors.secondary] = [ed.colors.secondary, ed.colors.primary]; refresh(); }

function ToolOptions() {
  const id = ed.tool.id;
  const o = ed.opts;
  const sized = ['brush', 'pencil', 'eraser', 'line', 'rect', 'ellipse', 'clone', 'heal', 'smudge', 'blur'].includes(id);
  const opaque = !['move', 'select-rect', 'select-ellipse', 'select-lasso', 'select-polygon', 'select-wand', 'picker', 'hand'].includes(id);
  const selecting = id === 'select-rect' || id === 'select-ellipse';
  const anySelect = id.startsWith('select-');
  return html`<section class="ie-options" data-testid="tool-options">
    <strong>${t(`tool.${id}`).replace(/ \(.*/, '')}</strong>
    ${anySelect ? html`<label>${t('ie.selOp')}<select data-testid="opt-sel-op" onChange=${(e) => { o.selOp = e.target.value; refresh(); }}>
      ${['new', 'add', 'subtract', 'intersect'].map((v) => html`<option value=${v} selected=${(o.selOp || 'new') === v}>${t(`ie.selOp.${v}`)}</option>`)}</select></label>
      <small class="ie-hint">${t(id === 'select-polygon' ? 'ie.polygonHint' : 'ie.selOpHint')}</small>` : null}
    ${selecting ? html`<${SelectionOptions} />` : null}
    ${id === 'move' || id === 'hand' ? html`<small class="ie-hint">${t('ie.guideHint')}</small>` : null}
    ${sized ? html`<label>${t('ie.size')}: ${o.size} px<input type="range" min="1" max="200" value=${o.size} data-testid="opt-size" onInput=${(e) => { o.size = +e.target.value; refresh(); }} /></label>` : null}
    ${opaque ? html`<label>${t('ie.opacity')}: ${Math.round(o.opacity * 100)} %<input type="range" min="1" max="100" value=${Math.round(o.opacity * 100)} data-testid="opt-opacity" onInput=${(e) => { o.opacity = +e.target.value / 100; refresh(); }} /></label>` : null}
    ${id === 'clone' || id === 'heal' ? html`<small class="ie-hint" data-testid="source-hint">${t(ed.tool.source ? 'ie.sourceSet' : 'ie.sourceHint')}</small>
      <button type="button" class=${o.pickSource ? '' : 'secondary outline'} data-testid="opt-pick-source" aria-pressed=${o.pickSource} onClick=${() => { o.pickSource = !o.pickSource; refresh(); }}>⊕ ${t('ie.pickSource')}</button>
      <label><input type="checkbox" checked=${o.aligned} data-testid="opt-aligned" onChange=${(e) => { o.aligned = e.target.checked; refresh(); }} /> ${t('ie.aligned')}</label>` : null}
    ${id === 'blur' ? html`<label>${t('ie.blurMode')}<select data-testid="opt-blur-mode" onChange=${(e) => { o.blurMode = e.target.value; refresh(); }}>
      ${['blur', 'sharpen'].map((v) => html`<option value=${v} selected=${o.blurMode === v}>${t(`ie.blurMode.${v}`)}</option>`)}</select></label>` : null}
    ${id === 'smudge' || id === 'blur' ? html`<small class="ie-hint">${t('ie.strengthHint')}</small>` : null}
    ${id === 'rect' || id === 'ellipse' ? html`<label><input type="checkbox" checked=${o.fillShape} data-testid="opt-fill" onChange=${(e) => { o.fillShape = e.target.checked; refresh(); }} /> ${t('ie.fillShape')}</label>` : null}
    ${id === 'fill' || id === 'select-wand' ? html`<label>${t('ie.tolerance')}: ${o.tolerance}<input type="range" min="0" max="100" value=${o.tolerance} data-testid="opt-tolerance" onInput=${(e) => { o.tolerance = +e.target.value; refresh(); }} /></label>
      <label><input type="checkbox" checked=${o.contiguous} data-testid="opt-contiguous" onChange=${(e) => { o.contiguous = e.target.checked; refresh(); }} /> ${t('ie.contiguous')}</label>` : null}
  </section>`;
}

/** Selection mode and coordinates of the selection tools (the fields are kept up to date by syncSelectionInfo). */
function SelectionOptions() {
  const o = ed.opts;
  const num = (testid, key, label) => html`<label>${label}<input type="number" min="1" step="1" data-testid=${testid} value=${o[key]}
    onInput=${(e) => { const v = Math.max(1, Math.round(+e.target.value || 1)); o[key] = v; }} /></label>`;
  const field = (key, label) => html`<label>${label}<input type="number" step="1" inputmode="numeric" data-testid=${`sel-${key}`}
    onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); applySelectionFields(); } }} onChange=${applySelectionFields} /></label>`;
  return html`<div class="ie-sel-options">
    <label>${t('ie.selMode')}<select data-testid="opt-sel-mode" onChange=${(e) => { o.selMode = e.target.value; refresh(); }}>
      ${[['free', 'ie.selFree'], ['ratio', 'ie.selRatio'], ['size', 'ie.selSize']].map(([v, l]) => html`<option value=${v} selected=${o.selMode === v}>${t(l)}</option>`)}</select></label>
    ${o.selMode === 'ratio' ? html`<div class="ie-row">${num('opt-ratio-w', 'selRatioW', '↔')}${num('opt-ratio-h', 'selRatioH', '↕')}</div>` : null}
    ${o.selMode === 'size' ? html`<div class="ie-row">${num('opt-sel-w', 'selW', t('ie.width'))}${num('opt-sel-h', 'selH', t('ie.height'))}</div>` : null}
    <div class="ie-row ie-sel-fields">${field('x', 'X')}${field('y', 'Y')}</div>
    <div class="ie-row ie-sel-fields">${field('w', t('ie.width'))}${field('h', t('ie.height'))}</div>
    <button type="button" class="secondary outline" data-testid="sel-apply" onClick=${applySelectionFields}>${t('ie.select')}</button>
  </div>`;
}

/** Select the rectangle typed into the selection fields (shape of the current tool). */
function applySelectionFields() {
  const v = (key) => Math.round(+(document.querySelector(`[data-testid=sel-${key}]`) || {}).value);
  const [x, y, w, h] = ['x', 'y', 'w', 'h'].map(v);
  if (![x, y, w, h].every(Number.isFinite) || w < 1 || h < 1) return;
  const type = ed.tool.type || (ed.doc.selection ? ed.doc.selection.type : 'rect');
  ed.doc.selection = clampSelection(ed.doc, type, x, y, x + w, y + h);
  draw();
}

function openSelectionDialog() {
  const s = ed.doc.selection || { type: 'rect', x: 0, y: 0, w: ed.doc.width, h: ed.doc.height };
  ed.dialog = { kind: 'selection', type: s.type, x: s.x, y: s.y, w: s.w, h: s.h };
  refresh();
}

let thumbsVersion = 0;
function Thumb({ layer }) {
  return html`<canvas class="ie-thumb" width="40" height="30" ref=${(c) => {
    if (!c || (c._v === thumbsVersion && c._layer === layer.canvas)) return;
    c._v = thumbsVersion; c._layer = layer.canvas;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 40, 30);
    const s = Math.min(40 / ed.doc.width, 30 / ed.doc.height);
    ctx.drawImage(layer.canvas, (40 - ed.doc.width * s) / 2, (30 - ed.doc.height * s) / 2, ed.doc.width * s, ed.doc.height * s);
  }}></canvas>`;
}

function Layers() {
  const doc = ed.doc;
  const active = doc.layer;
  return html`<section class="ie-layers" data-testid="layers">
    <strong>${t('ie.layers')}</strong>
    <ul>${doc.layers.map((layer, i) => ({ layer, i })).reverse().map(({ layer, i }) => html`<li key=${layer.id} class=${i === doc.active ? 'active' : ''} data-testid="layer"
        onClick=${() => { doc.active = i; refresh(); }}>
      <input type="checkbox" checked=${layer.visible} title="👁" data-testid="layer-visible" onClick=${(e) => e.stopPropagation()}
        onChange=${(e) => { doc.setLayerProps(i, { visible: e.target.checked }); changed(); }} />
      <${Thumb} layer=${layer} />
      ${ed.renamingLayer === layer.id
        ? html`<input class="ie-layer-name" defaultValue=${layer.name} data-testid="layer-name-input" autofocus onClick=${(e) => e.stopPropagation()}
            onKeyDown=${(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { ed.renamingLayer = null; refresh(); } }}
            onBlur=${(e) => { if (ed.renamingLayer !== layer.id) return; ed.renamingLayer = null; if (e.target.value && e.target.value !== layer.name) { doc.setLayerProps(i, { name: e.target.value }); changed(); } else refresh(); }} />`
        : html`<span class="ie-layer-name" data-testid="layer-name" onDblClick=${() => { ed.renamingLayer = layer.id; refresh(); }}>${layer.name}</span>`}
    </li>`)}</ul>
    <label>${t('ie.opacity')}: ${Math.round(active.opacity * 100)} %<input type="range" min="0" max="100" value=${Math.round(active.opacity * 100)} data-testid="layer-opacity"
      onInput=${(e) => { doc.setLayerProps(doc.active, { opacity: +e.target.value / 100 }); changed(); }} /></label>
    <label>${t('ie.blend')}<select data-testid="layer-blend" onChange=${(e) => { doc.setLayerProps(doc.active, { blend: e.target.value }); changed(); }}>
      ${BLEND_MODES.map((m) => html`<option value=${m} selected=${active.blend === m}>${m}</option>`)}</select></label>
    <div class="ie-layer-buttons">
      <button class="secondary outline" title=${t('ie.newLayer')} data-testid="layer-add" onClick=${() => { doc.addLayer(null, { index: doc.active + 1 }); changed(); }}>＋</button>
      <button class="secondary outline" title=${t('ie.duplicate')} data-testid="layer-duplicate" onClick=${() => { doc.duplicateLayer(); changed(); }}>⧉</button>
      <button class="secondary outline" title="↑" data-testid="layer-up" onClick=${() => { doc.moveLayer(doc.active, doc.active + 1); changed(); }}>↑</button>
      <button class="secondary outline" title="↓" data-testid="layer-down" onClick=${() => { doc.moveLayer(doc.active, doc.active - 1); changed(); }}>↓</button>
      <button class="secondary outline" title=${t('ie.mergeDown')} data-testid="layer-merge" disabled=${doc.active === 0} onClick=${() => { doc.mergeDown(); changed(); }}>⤓</button>
      <button class="secondary outline" title=${t('ie.deleteLayer')} data-testid="layer-delete" disabled=${doc.layers.length < 2} onClick=${() => { doc.deleteLayer(); changed(); }}>🗑</button>
    </div>
  </section>`;
}

// ---- dialogs -----------------------------------------------------------------------------------------------------

// ---- levels and curves -------------------------------------------------------------------------------------------

const CHANNELS = ['rgb', 'r', 'g', 'b'];
const LEVELS = { black: 0, gamma: 1, white: 255, outBlack: 0, outWhite: 255 };

function startTones(kind) {
  const per = (make) => Object.fromEntries(CHANNELS.map((c) => [c, make()]));
  ed.dialog = { kind, channel: 'rgb', hist: histogram(ed.doc),
    levels: per(() => ({ ...LEVELS })), points: per(() => [[0, 0], [255, 255]]) };
  refresh();
  updateTones();
}

function tonesLuts(d) {
  if (d.kind === 'levels') return channelLuts(levelsLut(d.levels.rgb), { r: levelsLut(d.levels.r), g: levelsLut(d.levels.g), b: levelsLut(d.levels.b) });
  return channelLuts(curveLut(d.points.rgb), { r: curveLut(d.points.r), g: curveLut(d.points.g), b: curveLut(d.points.b) });
}

let tonesQueued = false;
/** Show the result on the canvas (throttled to animation frames). */
function updateTones() {
  if (tonesQueued) return;
  tonesQueued = true;
  requestAnimationFrame(() => {
    tonesQueued = false;
    const d = ed.dialog;
    if (!d || (d.kind !== 'levels' && d.kind !== 'curves')) return;
    ed.preview = { layer: ed.doc.layer, canvas: lutCanvas(ed.doc, tonesLuts(d)) };
    draw();
  });
}

function drawHistogram(el, hist, lut = null) {
  if (!el) return;
  const g = el.getContext('2d');
  const w = el.width, h = el.height;
  g.clearRect(0, 0, w, h);
  const sorted = [...hist].sort((a, b) => a - b);
  const top = Math.max(1, sorted[Math.floor(sorted.length * 0.995)]);
  g.fillStyle = 'rgba(128,128,128,.55)';
  for (let v = 0; v < 256; v++) { const bh = Math.min(1, hist[v] / top) * h; g.fillRect((v / 256) * w, h - bh, w / 256 + 0.5, bh); }
  if (lut) {
    g.strokeStyle = getComputedStyle(document.body).getPropertyValue('--pico-primary').trim() || '#1e88e5';
    g.lineWidth = 2;
    g.beginPath();
    for (let v = 0; v < 256; v++) { const x = (v / 255) * w, y = h - (lut[v] / 255) * h; if (v) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
  }
}

function CurveEditor({ d }) {
  const pts = d.points[d.channel];
  const lut = curveLut(pts);
  const toValue = (e, el) => {
    const r = el.getBoundingClientRect();
    return [Math.round(Math.max(0, Math.min(255, ((e.clientX - r.left) / r.width) * 255))), Math.round(Math.max(0, Math.min(255, (1 - (e.clientY - r.top) / r.height) * 255)))];
  };
  const down = (e) => {
    const el = e.currentTarget;
    const [x, y] = toValue(e, el);
    let i = pts.findIndex(([px, py]) => Math.abs(px - x) <= 8 && Math.abs(py - y) <= 12);
    if (i < 0) { pts.push([x, y]); pts.sort((a, b) => a[0] - b[0]); i = pts.findIndex((p) => p[0] === x && p[1] === y); }
    el.setPointerCapture(e.pointerId);
    const end = i === 0 || i === pts.length - 1;
    const move = (ev) => {
      const [nx, ny] = toValue(ev, el);
      const lo = i > 0 ? pts[i - 1][0] + 1 : 0, hi = i < pts.length - 1 ? pts[i + 1][0] - 1 : 255;
      pts[i] = [end && (i === 0 || i === pts.length - 1) ? Math.max(lo, Math.min(hi, nx)) : Math.max(lo, Math.min(hi, nx)), ny];
      refresh(); updateTones();
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    refresh(); updateTones();
  };
  const dbl = (e) => {
    const [x, y] = toValue(e, e.currentTarget);
    const i = pts.findIndex(([px, py]) => Math.abs(px - x) <= 8 && Math.abs(py - y) <= 12);
    if (i > 0 && i < pts.length - 1) { pts.splice(i, 1); refresh(); updateTones(); }
  };
  return html`<div class="ie-curve">
    <canvas width="256" height="256" ref=${(el) => drawHistogram(el, d.hist[d.channel], lut)}></canvas>
    <svg viewBox="0 0 255 255" data-testid="curve" onPointerDown=${down} onDblClick=${dbl}>
      ${pts.map(([x, y]) => html`<circle cx=${x} cy=${255 - y} r="5" data-testid="curve-point" />`)}
    </svg>
  </div>`;
}

function tonesBody(d) {
  const channel = html`<label>${t('ie.channel')}<select data-testid="dlg-channel" onChange=${(e) => { d.channel = e.target.value; refresh(); }}>
    ${CHANNELS.map((c) => html`<option value=${c} selected=${d.channel === c}>${t(`ie.ch${c === 'rgb' ? 'Rgb' : c.toUpperCase()}`)}</option>`)}</select></label>`;
  const reset = html`<button type="button" class="secondary outline" data-testid="dlg-reset" onClick=${() => {
    if (d.kind === 'levels') d.levels[d.channel] = { ...LEVELS }; else d.points[d.channel] = [[0, 0], [255, 255]];
    refresh(); updateTones(); }}>${t('ie.reset')}</button>`;
  if (d.kind === 'curves') return html`${channel}<small>${t('ie.curvesHint')}</small><${CurveEditor} d=${d} />${reset}`;
  const lv = d.levels[d.channel];
  const field = (key, min, max, step = 1) => html`<input type="number" min=${min} max=${max} step=${step} value=${lv[key]} data-testid=${`lv-${key}`}
    onInput=${(e) => { const v = +e.target.value; if (!Number.isFinite(v)) return; lv[key] = Math.max(min, Math.min(max, v)); refresh(); updateTones(); }} />`;
  return html`${channel}
    <canvas class="ie-histogram" width="256" height="90" data-testid="histogram" data-channel=${d.channel} ref=${(el) => drawHistogram(el, d.hist[d.channel])}></canvas>
    <label>${t('ie.inputLevels')}</label><div class="ie-row ie-levels">${field('black', 0, 254)}${field('gamma', 0.1, 9.99, 0.05)}${field('white', 1, 255)}</div>
    <label>${t('ie.outputLevels')}</label><div class="ie-row ie-levels">${field('outBlack', 0, 255)}${field('outWhite', 0, 255)}</div>${reset}`;
}

function closeDialog() {
  if (ed.adjust) { ed.adjust = null; draw(); }
  if (ed.dialog && (ed.dialog.kind === 'levels' || ed.dialog.kind === 'curves')) { ed.preview = null; draw(); }
  ed.dialog = null;
  refresh();
}

function Dialog() {
  const d = ed.dialog;
  if (!d) return null;
  const num = (key, label, extra = {}) => html`<label>${t(label)}<input type="number" min="1" max="20000" value=${d[key]} data-testid=${`dlg-${key}`} ...${extra}
    onInput=${(e) => { const v = Math.max(1, Math.round(+e.target.value || 1)); if (d.keep && (key === 'width' || key === 'height')) { const r = ed.doc.width / ed.doc.height; if (key === 'width') { d.width = v; d.height = Math.max(1, Math.round(v / r)); } else { d.height = v; d.width = Math.max(1, Math.round(v * r)); } } else d[key] = v; refresh(); }} /></label>`;
  let body, onOk;
  if (d.kind === 'new') {
    body = html`${num('width', 'ie.width')}${num('height', 'ie.height')}
      <label>${t('ie.background')}<select data-testid="dlg-background" onChange=${(e) => { d.background = e.target.value; }}>
        <option value="white">${t('ie.white')}</option><option value="transparent">${t('ie.transparent')}</option><option value="secondary">${t('ie.bgColor')}</option></select></label>`;
    onOk = () => {
      const bg = d.background === 'white' ? '#ffffff' : d.background === 'secondary' ? ed.colors.secondary : 'transparent';
      setDoc(new ImageDoc(d.width, d.height, { background: bg }), `${t('ie.untitled')}.png`);
    };
  } else if (d.kind === 'resize') {
    body = html`${num('width', 'ie.width')}${num('height', 'ie.height')}
      <label><input type="checkbox" checked=${d.keep} onChange=${(e) => { d.keep = e.target.checked; refresh(); }} /> ${t('ie.keepRatio')}</label>
      <label><input type="checkbox" checked=${d.smooth} onChange=${(e) => { d.smooth = e.target.checked; }} /> ${t('ie.smooth')}</label>`;
    onOk = docOp((doc) => doc.resize(d.width, d.height, d.smooth));
  } else if (d.kind === 'canvasSize') {
    body = html`${num('width', 'ie.width')}${num('height', 'ie.height')}
      <label>${t('ie.anchor')}</label><div class="ie-anchor">${[0, 0.5, 1].map((ay) => [0, 0.5, 1].map((ax) => html`<button type="button" class=${d.ax === ax && d.ay === ay ? '' : 'secondary outline'}
        onClick=${() => { d.ax = ax; d.ay = ay; refresh(); }}>${d.ax === ax && d.ay === ay ? '●' : '·'}</button>`))}</div>`;
    onOk = docOp((doc) => doc.resizeCanvas(d.width, d.height, d.ax, d.ay));
  } else if (d.kind === 'adjust') {
    const a = ed.adjust;
    body = html`${ADJUSTMENTS[a.kind].params.map(([k, min, max]) => html`<label>${t(`ie.${k}`)}: ${a.values[k]}
      <input type="range" min=${min} max=${max} value=${a.values[k]} data-testid=${`adj-${k}`} onInput=${(e) => { a.values[k] = +e.target.value; a.filter = cssFilter(a.kind, a.values); draw(); refresh(); }} /></label>`)}`;
    onOk = () => { const f = a.filter; ed.adjust = null; applyCssFilter(ed.doc, f); changed(); };
  } else if (d.kind === 'levels' || d.kind === 'curves') {
    body = tonesBody(d);
    onOk = () => { ed.preview = null; applyLuts(ed.doc, tonesLuts(d)); changed(); };
  } else if (d.kind === 'text') {
    body = html`<label>${t('ie.text')}<textarea rows="3" data-testid="dlg-text" autofocus onInput=${(e) => { d.text = e.target.value; }}>${d.text}</textarea></label>
      <div class="ie-row">
        <label>${t('ie.font')}<select onChange=${(e) => { d.font = e.target.value; }}>${['sans-serif', 'serif', 'monospace', 'cursive', 'system-ui'].map((f) => html`<option value=${f} selected=${d.font === f}>${f}</option>`)}</select></label>
        ${num('fontSize', 'ie.fontSize')}
      </div>
      <label><input type="checkbox" onChange=${(e) => { d.bold = e.target.checked; }} /> ${t('ie.bold')}</label>
      <label><input type="checkbox" onChange=${(e) => { d.italic = e.target.checked; }} /> ${t('ie.italic')}</label>`;
    onOk = () => {
      ed.opts.font = d.font; ed.opts.fontSize = d.fontSize;
      drawText(ed.doc, d.point, d.text, { color: ed.colors.primary, font: d.font, fontSize: d.fontSize, bold: d.bold, italic: d.italic, opacity: ed.opts.opacity });
      changed();
    };
  } else if (d.kind === 'selection') {
    const coord = (key, label) => html`<label>${label}<input type="number" step="1" value=${d[key]} data-testid=${`dlg-sel-${key}`} onInput=${(e) => { d[key] = Math.round(+e.target.value || 0); }} /></label>`;
    body = html`<label>${t('ie.shape')}<select data-testid="dlg-sel-type" onChange=${(e) => { d.type = e.target.value; }}>
        <option value="rect" selected=${d.type === 'rect'}>${t('ie.rectangle')}</option><option value="ellipse" selected=${d.type === 'ellipse'}>${t('ie.ellipseShape')}</option></select></label>
      <div class="ie-row">${coord('x', 'X')}${coord('y', 'Y')}</div><div class="ie-row">${coord('w', t('ie.width'))}${coord('h', t('ie.height'))}</div>`;
    onOk = () => { ed.doc.selection = clampSelection(ed.doc, d.type, d.x, d.y, d.x + Math.max(1, d.w), d.y + Math.max(1, d.h)); draw(); };
  } else if (d.kind === 'guide') {
    body = html`<label>${t('ie.orientation')}<select data-testid="dlg-guide-axis" onChange=${(e) => { d.axis = e.target.value; }}>
        <option value="h" selected=${d.axis === 'h'}>${t('ie.horizontal')}</option><option value="v" selected=${d.axis === 'v'}>${t('ie.vertical')}</option></select></label>
      <label>${t('ie.position')}<input type="number" step="1" value=${d.pos} data-testid="dlg-guide-pos" onInput=${(e) => { d.pos = Math.round(+e.target.value || 0); }} /></label>`;
    onOk = () => { addGuide(d.axis, d.pos); refresh(); };
  } else if (d.kind === 'guideSettings') {
    const check = (key) => html`<label><input type="checkbox" checked=${prefs[key]} data-testid=${`dlg-${key}`} onChange=${(e) => setPref(key, e.target.checked)} /> ${t(`ie.${key}`)}</label>`;
    body = html`${check('rulers')}${check('guides')}${check('snapGuides')}${check('grid')}${check('snapGrid')}${check('snapEdges')}
      <div class="ie-row">
        <label>${t('ie.gridSize')}<input type="number" min="1" max="10000" value=${d.gridSize} data-testid="dlg-gridSize" onInput=${(e) => { d.gridSize = Math.max(1, Math.round(+e.target.value || 1)); }} /></label>
        <label>${t('ie.snapDistance')}<input type="number" min="1" max="50" value=${d.snapDistance} data-testid="dlg-snapDistance" onInput=${(e) => { d.snapDistance = Math.max(1, Math.round(+e.target.value || 1)); }} /></label>
      </div>`;
    onOk = () => { setPref('gridSize', d.gridSize); setPref('snapDistance', d.snapDistance); };
  } else if (d.kind === 'saveAs') {
    const fmt = SAVE_FORMATS[d.format];
    body = html`<label>${t('ie.fileName')}<input value=${d.stem} data-testid="dlg-name" onInput=${(e) => { d.stem = e.target.value; }} /></label>
      <label>${t('ie.format')}<select data-testid="dlg-format" onChange=${(e) => { d.format = e.target.value; refresh(); }}>
        ${Object.entries(SAVE_FORMATS).map(([k, f]) => html`<option value=${k} selected=${d.format === k}>${f.label} (${f.ext})</option>`)}</select></label>
      ${fmt.quality ? html`<label>${t('ie.quality')}: ${d.quality} %<input type="range" min="10" max="100" value=${d.quality} onInput=${(e) => { d.quality = +e.target.value; refresh(); }} /></label>` : null}`;
    onOk = () => save({ as: true, name: `${d.stem}${fmt.ext}`, format: d.format, quality: d.quality / 100 });
  }
  const live = ['adjust', 'levels', 'curves'].includes(d.kind); // the image stays visible for the live preview
  return html`<dialog open data-testid="dialog" class=${live ? 'ie-live' : ''}><article>
    <form onSubmit=${(e) => { e.preventDefault(); ed.dialog = null; Promise.resolve(onOk()).catch(fail); refresh(); }}>
      ${body}
      <footer>
        <button type="button" class="secondary" data-testid="dlg-cancel" onClick=${closeDialog}>${t('ie.cancel')}</button>
        <button type="submit" data-testid="dlg-ok">${['adjust', 'levels', 'curves'].includes(d.kind) ? t('ie.apply') : t('ie.ok')}</button>
      </footer>
    </form>
  </article></dialog>`;
}

// ---- layout ------------------------------------------------------------------------------------------------------

function Main() {
  const doc = ed.doc;
  Suite.shell.setFileName(`${ed.name}${doc.dirty ? ' •' : ''}`);
  return html`<div class=${`ie-layout ${ed.panels ? 'panels-open' : ''}`}>
    <${ToolPalette} />
    <div class="ie-stage" ref=${(el) => { if (el && stage.parentElement !== el) { el.appendChild(stage); resizeObserver.observe(canvasBox); } }}></div>
    <aside class="ie-side suite-drawer" data-testid="side"><${ToolOptions} /><${Layers} /></aside>${ed.panels ? Suite.shell.backdrop(() => { ed.panels = false; refresh(); }) : null}
    <footer class="ie-status" data-testid="status">
      <span data-testid="image-size">${doc.width} × ${doc.height}</span>
      <span data-testid="position"></span>
      <span data-testid="selection-info"></span>
      <span class="ie-zoom">
        <button class="secondary outline" data-testid="zoom-out" onClick=${() => zoomStep(-1)}>−</button>
        <span data-testid="zoom">${Math.round(ed.view.zoom * 100)} %</span>
        <button class="secondary outline" data-testid="zoom-in" onClick=${() => zoomStep(1)}>+</button>
        <button class="secondary outline" data-testid="zoom-fit" onClick=${fit}>⤢</button>
      </span>
    </footer>
    <${Dialog} />
  </div>`;
}

Suite.shell.mount({ id: APP, title: 'app.title', version: '%%BUILD_VERSION%%', toolbar: () => html`<${Menus} />`, main: () => html`<${Main} />` });

Suite.files.dropZone(document.body, async (picked) => {
  if (!picked.length) return;
  const images = picked.filter((p) => /^image\//.test(p.file.type) || /\.(ora|psd|png|jpe?g|webp|gif|bmp|ico|svg|avif)$/i.test(p.file.name));
  if (!images.length) return;
  if (!ed.doc.dirty && ed.doc.undoStack.length === 0) {
    await openPicked(images[0]);
    for (const p of images.slice(1)) await addImageLayer(p.file, p.file.name);
  } else for (const p of images) await addImageLayer(p.file, p.file.name);
});

document.addEventListener('keydown', (e) => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) && !['range', 'checkbox', 'color'].includes(document.activeElement.type)) return;
  if (ed.dialog) { if (e.key === 'Escape') closeDialog(); return; }
  if (ed.tool.onKey && ed.tool.onKey(e, ed)) { e.preventDefault(); draw(); return; }
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  const run = (fn) => { e.preventDefault(); Promise.resolve(fn()).catch(fail); };
  if (mod) {
    const map = {
      z: e.shiftKey ? redo : undo, y: redo, s: e.shiftKey ? openSaveAs : () => save(), o: openImage, c: copy, x: cut, v: paste, e: () => { ed.doc.mergeDown(); changed(); },
      a: () => { ed.doc.selection = { type: 'rect', x: 0, y: 0, w: ed.doc.width, h: ed.doc.height }; draw(); },
      d: () => { ed.doc.selection = null; draw(); },
      ...(e.shiftKey ? { i: invertSelection } : {}),
      n: e.shiftKey ? () => { ed.doc.addLayer(null, { index: ed.doc.active + 1 }); changed(); } : () => MENUS()[0][1][0][1](),
      '0': fit, '+': () => zoomStep(1), '=': () => zoomStep(1), '-': () => zoomStep(-1),
    };
    if (map[k]) run(map[k]);
    return;
  }
  if (e.key === ' ' && !spaceDown) { spaceDown = true; view.style.cursor = 'grab'; e.preventDefault(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { run(clearSelection); return; }
  if (e.key === 'Escape') { if (toolActive && ed.tool.cancel) { ed.tool.cancel(ed); toolActive = false; } ed.doc.selection = null; draw(); return; }
  if (e.key === '+' || e.key === '=') { run(() => zoomStep(1)); return; }
  if (e.key === '-') { run(() => zoomStep(-1)); return; }
  if (e.key === '0') { run(fit); return; }
  if (e.key === '1') { run(() => setZoom(1, null, true)); return; }
  if (e.key === '[') { ed.opts.size = Math.max(1, Math.round(ed.opts.size / 1.25)); draw(); refresh(); return; }
  if (e.key === ']') { ed.opts.size = Math.min(200, Math.round(ed.opts.size * 1.25) || 2); draw(); refresh(); return; }
  if (k === 'x') { swapColors(); return; }
  const tool = TOOLS.find((x) => x.key === k);
  if (tool) selectTool(tool.id);
});
document.addEventListener('keyup', (e) => { if (e.key === ' ') { spaceDown = false; selectTool(ed.tool.id); } });

Suite.files.recent(APP);
selectTool('brush');

Suite.bridge.receive((picked) => openPicked(picked), { app: 'imageeditor' }); // files opened from other apps ("Open with…")

// for tests
window.IE = { prefs, setPref, addGuide, ed, setDoc, openFile, encode, ImageDoc, save };
document.body.dataset.ready = 'true';
