/*
 * Diagram editor: pages, shapes, connectors, text, styles, arrangement, clipboard (draw.io XML), zoom/pan, draw.io files,
 * Excalidraw import, SVG/PNG export with the diagram embedded. Model in model.js, file formats in drawio.js.
 */
import {
  SHAPES, LIBRARIES, ALL_TYPES, LABEL_BELOW, COMPARTMENTS, PRESETS, ARROWS, PORTS, FONT, newDoc, newPage, makeShape, makeEdge, shapePath, edgeGeometry, edgePathD, edgeMidpoint, arrowPath, arrowFrom,
  wrapText, textWidth, pageBounds, History, newId, newLayer, layersOf, layerOf, isShown, isSelectable, inLayerOrder,
  groupsOf, groupById, ancestors, groupMembers, rotatePoint, normalizeAngle, shapePoint, containsPoint, shapeBounds,
} from '@app/model.js';
import { readDrawio, writeDrawio, writeModel, readModel, drawioFromSvg, drawioFromPng, pngWithDrawio, readExcalidraw } from '@app/drawio.js';
import { layout } from '@app/layout.js';
import { parseMermaid, sizeFor } from '@app/mermaid.js';
import 'app/spell-dom'; // spelling selector in the header, marks in text fields (shared/js/spell-dom.js)

const { html } = Suite.shell;
const t = Suite.t;
const APP = 'diagram';
const OPEN_TYPES = [{ description: 'Diagrams', accept: { 'application/octet-stream': ['.drawio', '.xml', '.svg', '.png', '.excalidraw', '.json', '.mmd', '.mermaid'] } }];
const GRID = 10;

Suite.i18n.register({
  en: {
    'app.title': 'Diagram editor',
    'dg.new': 'New', 'dg.open': 'Open', 'dg.save': 'Save', 'dg.saveAs': 'Save as', 'dg.exportSvg': 'Export SVG', 'dg.exportPng': 'Export PNG', 'dg.print': 'Print / PDF (all pages)', 'dg.emptyPrint': 'The diagram is empty.',
    'dg.autoLayout': 'Automatic layout', 'dg.layoutTB': 'top to bottom', 'dg.layoutLR': 'left to right', 'dg.layoutBT': 'bottom to top', 'dg.layoutRL': 'right to left',
    'dg.mermaid': 'Insert Mermaid…', 'dg.mermaidHint': 'A Mermaid flowchart (flowchart TD / graph LR …); it is laid out automatically.', 'dg.insert': 'Insert',
    'dg.mermaidError': 'The text cannot be read: {0}', 'dg.cancel': 'Cancel', 'dg.laidOut': '{0} shapes arranged.',
    'dg.undo': 'Undo', 'dg.redo': 'Redo', 'dg.delete': 'Delete', 'dg.duplicate': 'Duplicate', 'dg.toFront': 'To front', 'dg.toBack': 'To back',
    'dg.select': 'Select (V)', 'dg.hand': 'Pan (H, or hold Space)', 'dg.connector': 'Connector (A)', 'dg.textTool': 'Text (T)', 'dg.shapes': 'Shapes',
    'shape.rect': 'Rectangle', 'shape.rounded': 'Rounded rectangle', 'shape.ellipse': 'Ellipse', 'shape.diamond': 'Decision', 'shape.terminator': 'Start/end',
    'shape.parallelogram': 'Data', 'shape.hexagon': 'Preparation', 'shape.triangle': 'Triangle', 'shape.cylinder': 'Database', 'shape.document': 'Document',
    'shape.note': 'Note', 'shape.cloud': 'Cloud', 'shape.actor': 'Actor', 'shape.text': 'Text', 'shape.image': 'Image',
    'shape.class': 'Class (UML)', 'shape.package': 'Package', 'shape.component': 'Component', 'shape.event-start': 'Start event', 'shape.event-intermediate': 'Intermediate event',
    'shape.event-end': 'End event', 'shape.gateway': 'Gateway (exclusive)', 'shape.pool': 'Pool / lane', 'shape.server': 'Server', 'shape.computer': 'Computer',
    'shape.firewall': 'Firewall', 'shape.router': 'Router', 'shape.entity': 'Entity (table)',
    'dg.lib.uml': 'UML', 'dg.lib.bpmn': 'BPMN', 'dg.lib.network': 'Network', 'dg.lib.er': 'Entity relationship',
    'dg.style': 'Style', 'dg.fill': 'Fill', 'dg.stroke': 'Line', 'dg.none': 'none', 'dg.width': 'Width', 'dg.dashed': 'Dashed', 'dg.opacity': 'Opacity',
    'dg.text': 'Text', 'dg.fontSize': 'Font size', 'dg.fontColor': 'Font colour', 'dg.bold': 'Bold', 'dg.italic': 'Italic', 'dg.align': 'Alignment',
    'dg.arrange': 'Arrange', 'dg.alignLeft': 'Align left', 'dg.alignCenter': 'Align centres', 'dg.alignRight': 'Align right', 'dg.alignTop': 'Align top',
    'dg.alignMiddle': 'Align middles', 'dg.alignBottom': 'Align bottom', 'dg.distH': 'Distribute horizontally', 'dg.distV': 'Distribute vertically',
    'dg.geometry': 'Position and size', 'dg.route': 'Routing', 'dg.straight': 'Straight', 'dg.orthogonal': 'Elbow', 'dg.curved': 'Curved',
    'dg.startArrow': 'Start', 'dg.endArrow': 'End', 'dg.type': 'Shape', 'dg.diagram': 'Diagram', 'dg.grid': 'Grid', 'dg.snap': 'Snap to grid',
    'dg.page': 'Page', 'dg.addPage': 'Add page', 'dg.deletePage': 'Delete page', 'dg.deletePageConfirm': 'Delete the page “{0}”?',
    'dg.discard': 'Discard the unsaved changes?', 'dg.cannotOpen': '“{0}” cannot be opened: {1}', 'dg.fit': 'Fit', 'dg.panels': 'Format',
    'dg.insertImage': 'Insert image', 'dg.untitled': 'diagram', 'dg.empty': 'Drag a shape from the left, or double-click to add text.',
    'dg.selected': '{0} selected', 'dg.copy': 'Copy', 'dg.paste': 'Paste', 'dg.cut': 'Cut',
    'dg.group': 'Group (Ctrl+G)', 'dg.ungroup': 'Ungroup (Ctrl+Shift+G)', 'dg.groupName': 'Group {0}', 'dg.groupUnnamed': 'Group', 'dg.renameGroup': 'Name of the group', 'dg.renameLayer': 'Name of the layer', 'dg.editLabel': 'Label',
    'dg.shapesTab': 'Shapes', 'dg.elements': 'Elements', 'dg.noElements': 'The page is empty.', 'dg.elementsHint': 'Click selects (Ctrl: add or remove); double-click or F2 edits the label of a layer, group or element.',
    'dg.rotate': 'Rotate (Shift: steps of 15°)', 'dg.rotation': 'Rotation (°)', 'dg.rotateLeft': 'Rotate 90° to the left', 'dg.rotateRight': 'Rotate 90° to the right', 'dg.lock': 'Lock (Ctrl+L)', 'dg.unlockAll': 'Unlock all ({0})',
    'dg.layers': 'Layers', 'dg.addLayer': 'Add layer', 'dg.layerName': 'Layer {0}', 'dg.layerVisible': 'Show / hide', 'dg.layerLocked': 'Lock / unlock',
    'dg.layerActive': 'New shapes go to this layer', 'dg.layerUp': 'Move up', 'dg.layerDown': 'Move down', 'dg.deleteLayer': 'Delete the layer (its content moves to the layer below)',
    'dg.moveToLayer': 'Move to layer', 'dg.locked': 'Locked objects cannot be selected; unlock them in the Diagram panel.',
  },
  de: {
    'app.title': 'Diagrammeditor',
    'dg.new': 'Neu', 'dg.open': 'Öffnen', 'dg.save': 'Speichern', 'dg.saveAs': 'Speichern unter', 'dg.exportSvg': 'SVG exportieren', 'dg.exportPng': 'PNG exportieren', 'dg.print': 'Drucken / PDF (alle Seiten)', 'dg.emptyPrint': 'Das Diagramm ist leer.',
    'dg.autoLayout': 'Automatisch anordnen', 'dg.layoutTB': 'von oben nach unten', 'dg.layoutLR': 'von links nach rechts', 'dg.layoutBT': 'von unten nach oben', 'dg.layoutRL': 'von rechts nach links',
    'dg.mermaid': 'Mermaid einfügen…', 'dg.mermaidHint': 'Ein Mermaid-Flussdiagramm (flowchart TD / graph LR …); es wird automatisch angeordnet.', 'dg.insert': 'Einfügen',
    'dg.mermaidError': 'Der Text kann nicht gelesen werden: {0}', 'dg.cancel': 'Abbrechen', 'dg.laidOut': '{0} Formen angeordnet.',
    'dg.undo': 'Rückgängig', 'dg.redo': 'Wiederholen', 'dg.delete': 'Löschen', 'dg.duplicate': 'Duplizieren', 'dg.toFront': 'Nach vorne', 'dg.toBack': 'Nach hinten',
    'dg.select': 'Auswählen (V)', 'dg.hand': 'Verschieben (H oder Leertaste halten)', 'dg.connector': 'Verbinder (A)', 'dg.textTool': 'Text (T)', 'dg.shapes': 'Formen',
    'shape.rect': 'Rechteck', 'shape.rounded': 'Abgerundetes Rechteck', 'shape.ellipse': 'Ellipse', 'shape.diamond': 'Entscheidung', 'shape.terminator': 'Start/Ende',
    'shape.parallelogram': 'Daten', 'shape.hexagon': 'Vorbereitung', 'shape.triangle': 'Dreieck', 'shape.cylinder': 'Datenbank', 'shape.document': 'Dokument',
    'shape.note': 'Notiz', 'shape.cloud': 'Wolke', 'shape.actor': 'Akteur', 'shape.text': 'Text', 'shape.image': 'Bild',
    'shape.class': 'Klasse (UML)', 'shape.package': 'Paket', 'shape.component': 'Komponente', 'shape.event-start': 'Startereignis', 'shape.event-intermediate': 'Zwischenereignis',
    'shape.event-end': 'Endereignis', 'shape.gateway': 'Gateway (exklusiv)', 'shape.pool': 'Pool / Bahn', 'shape.server': 'Server', 'shape.computer': 'Computer',
    'shape.firewall': 'Firewall', 'shape.router': 'Router', 'shape.entity': 'Entität (Tabelle)',
    'dg.lib.uml': 'UML', 'dg.lib.bpmn': 'BPMN', 'dg.lib.network': 'Netzwerk', 'dg.lib.er': 'Entity-Relationship',
    'dg.style': 'Stil', 'dg.fill': 'Füllung', 'dg.stroke': 'Linie', 'dg.none': 'keine', 'dg.width': 'Breite', 'dg.dashed': 'Gestrichelt', 'dg.opacity': 'Deckkraft',
    'dg.text': 'Text', 'dg.fontSize': 'Schriftgröße', 'dg.fontColor': 'Schriftfarbe', 'dg.bold': 'Fett', 'dg.italic': 'Kursiv', 'dg.align': 'Ausrichtung',
    'dg.arrange': 'Anordnen', 'dg.alignLeft': 'Links ausrichten', 'dg.alignCenter': 'Mittig ausrichten', 'dg.alignRight': 'Rechts ausrichten', 'dg.alignTop': 'Oben ausrichten',
    'dg.alignMiddle': 'Mitte ausrichten', 'dg.alignBottom': 'Unten ausrichten', 'dg.distH': 'Horizontal verteilen', 'dg.distV': 'Vertikal verteilen',
    'dg.geometry': 'Position und Größe', 'dg.route': 'Linienführung', 'dg.straight': 'Gerade', 'dg.orthogonal': 'Gewinkelt', 'dg.curved': 'Gebogen',
    'dg.startArrow': 'Anfang', 'dg.endArrow': 'Ende', 'dg.type': 'Form', 'dg.diagram': 'Diagramm', 'dg.grid': 'Raster', 'dg.snap': 'Am Raster ausrichten',
    'dg.page': 'Seite', 'dg.addPage': 'Seite hinzufügen', 'dg.deletePage': 'Seite löschen', 'dg.deletePageConfirm': 'Die Seite „{0}“ löschen?',
    'dg.discard': 'Die ungespeicherten Änderungen verwerfen?', 'dg.cannotOpen': '„{0}“ kann nicht geöffnet werden: {1}', 'dg.fit': 'Einpassen', 'dg.panels': 'Format',
    'dg.insertImage': 'Bild einfügen', 'dg.untitled': 'diagramm', 'dg.empty': 'Ziehen Sie eine Form von links herein oder doppelklicken Sie für Text.',
    'dg.selected': '{0} ausgewählt', 'dg.copy': 'Kopieren', 'dg.paste': 'Einfügen', 'dg.cut': 'Ausschneiden',
    'dg.group': 'Gruppieren (Strg+G)', 'dg.ungroup': 'Gruppierung aufheben (Strg+Umschalt+G)', 'dg.groupName': 'Gruppe {0}', 'dg.groupUnnamed': 'Gruppe', 'dg.renameGroup': 'Name der Gruppe', 'dg.renameLayer': 'Name der Ebene', 'dg.editLabel': 'Beschriftung',
    'dg.shapesTab': 'Formen', 'dg.elements': 'Elemente', 'dg.noElements': 'Die Seite ist leer.', 'dg.elementsHint': 'Klick wählt aus (Strg: hinzu oder weg); Doppelklick oder F2 ändert die Beschriftung einer Ebene, Gruppe oder eines Elements.',
    'dg.rotate': 'Drehen (Umschalt: in 15°-Schritten)', 'dg.rotation': 'Drehung (°)', 'dg.rotateLeft': 'Um 90° nach links drehen', 'dg.rotateRight': 'Um 90° nach rechts drehen', 'dg.lock': 'Sperren (Strg+L)', 'dg.unlockAll': 'Alle entsperren ({0})',
    'dg.layers': 'Ebenen', 'dg.addLayer': 'Ebene hinzufügen', 'dg.layerName': 'Ebene {0}', 'dg.layerVisible': 'Zeigen / ausblenden', 'dg.layerLocked': 'Sperren / entsperren',
    'dg.layerActive': 'Neue Formen kommen auf diese Ebene', 'dg.layerUp': 'Nach oben', 'dg.layerDown': 'Nach unten', 'dg.deleteLayer': 'Ebene löschen (ihr Inhalt kommt auf die Ebene darunter)',
    'dg.moveToLayer': 'Auf Ebene verschieben', 'dg.locked': 'Gesperrte Objekte lassen sich nicht auswählen; entsperren Sie sie im Bereich Diagramm.',
  },
});

// ---- state ------------------------------------------------------------------------------------------------

const app = {
  doc: newDoc(), name: '', handle: null, dirty: false, history: new History(),
  selection: new Set(), tool: 'select', view: { zoom: 1, x: 40, y: 40 }, grid: true, snap: true,
  drag: null, editing: null, hover: null, clipboard: null, panels: false, renamingPage: null, pasteCount: 0,
  sidebar: 'shapes', collapsed: new Set(), treeFocus: null, treeEdit: null, // the left sidebar: shapes or the element tree (treeEdit: id of the row being edited)
  libraries: new Set((() => { try { return JSON.parse(localStorage.getItem('suite.diagram.libraries')) || []; } catch (e) { return []; } })()),
};
app.name = `${t('dg.untitled')}.drawio`;

const page = () => app.doc.pages[app.doc.page];
const shapeMap = () => new Map(page().shapes.map((s) => [s.id, s]));
const find = (id) => page().shapes.find((s) => s.id === id) || page().edges.find((e) => e.id === id);
const isEdge = (o) => o && o.from !== undefined;
const selectedShapes = () => page().shapes.filter((s) => app.selection.has(s.id));
const selectedEdges = () => page().edges.filter((e) => app.selection.has(e.id));

let queued = false;
function render() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; Suite.shell.refresh(); });
}

/** Record the state before a change (coalesce: merge quick successive changes of the same kind). */
function record(coalesce = null) { app.history.push(app.doc, coalesce); }

/** The layer new objects go to: the chosen one if it still exists, else the top layer. */
function activeLayer(p = page()) {
  const layers = layersOf(p);
  return layers.find((l) => l.id === p.activeLayer) || layers[layers.length - 1];
}

function changed() {
  // objects added since the last change (no layer yet) go to the active layer
  const p = page();
  const target = activeLayer(p).id;
  for (const o of [...p.shapes, ...p.edges]) if (o.layer === undefined) o.layer = target;
  groupsOf(p); // drops groups that became empty
  app.dirty = true;
  Suite.shell.setDirty(true);
  render();
}

const fail = (e) => { console.warn(e); Suite.shell.toast(Suite.i18n.describe(e), 'error'); };
const snapV = (v, force) => (app.snap && !force ? Math.round(v / GRID) * GRID : v);

// ---- view ---------------------------------------------------------------------------------------------------

let svgEl = null;
function toDiagram(e) {
  const r = svgEl.getBoundingClientRect();
  return { x: (e.clientX - r.left - app.view.x) / app.view.zoom, y: (e.clientY - r.top - app.view.y) / app.view.zoom };
}

function setZoom(zoom, at) {
  zoom = Math.min(8, Math.max(0.1, zoom));
  const r = svgEl ? svgEl.getBoundingClientRect() : { width: 800, height: 600 };
  const p = at || { x: r.width / 2, y: r.height / 2 };
  const v = app.view;
  v.x = p.x - ((p.x - v.x) * zoom) / v.zoom;
  v.y = p.y - ((p.y - v.y) * zoom) / v.zoom;
  v.zoom = zoom;
  render();
}

function fit() {
  if (!svgEl) return;
  const r = svgEl.getBoundingClientRect();
  const b = pageBounds(page());
  if (!b.w && !b.h) { Object.assign(app.view, { zoom: 1, x: 40, y: 40 }); render(); return; }
  const zoom = Math.min(2, Math.max(0.1, Math.min((r.width - 80) / (b.w || 1), (r.height - 80) / (b.h || 1))));
  Object.assign(app.view, { zoom, x: (r.width - b.w * zoom) / 2 - b.x * zoom, y: (r.height - b.h * zoom) / 2 - b.y * zoom });
  render();
}

function viewCenter() {
  const r = svgEl.getBoundingClientRect();
  return { x: (r.width / 2 - app.view.x) / app.view.zoom, y: (r.height / 2 - app.view.y) / app.view.zoom };
}

// ---- editing operations ------------------------------------------------------------------------------------------

function addShape(type, at = viewCenter(), props = {}) {
  record();
  const preset = PRESETS[type] || {};
  const w = props.w || preset.w || (type === 'text' ? 60 : type === 'diamond' ? 80 : type === 'ellipse' ? 80 : 120);
  const h = props.h || preset.h || (type === 'text' ? 30 : type === 'diamond' || type === 'ellipse' ? 80 : 60);
  const s = makeShape(type, snapV(at.x - w / 2), snapV(at.y - h / 2), w, h, props);
  if (preset.text && props.text === undefined) s.text = preset.text;
  if (type === 'text' && !props.text) s.text = t('shape.text');
  page().shapes.push(s);
  app.selection = new Set([s.id]);
  changed();
  return s;
}

function deleteSelection() {
  if (!app.selection.size) return;
  record();
  const p = page();
  const removed = new Set(app.selection);
  p.shapes = p.shapes.filter((s) => !removed.has(s.id));
  // edges of deleted shapes go too
  p.edges = p.edges.filter((e) => !removed.has(e.id) && !removed.has(e.from.id) && !removed.has(e.to.id));
  app.selection = new Set();
  changed();
}

function selectAll() { app.selection = new Set([...page().shapes, ...page().edges].filter((o) => isSelectable(page(), o)).map((o) => o.id)); render(); }

/** Ids plus the other members of their outermost groups. */
function withGroups(ids) {
  const p = page();
  const tops = new Set([...ids].map((id) => { const o = find(id); const chain = o ? ancestors(p, o) : []; return chain[chain.length - 1]; }).filter(Boolean));
  if (!tops.size) return new Set(ids);
  return new Set([...ids, ...[...tops].flatMap((g) => groupMembers(p, g)).map((o) => o.id)]);
}

/**
 * Group the selection. The new group takes the place of the selected parts in their common enclosing group: selected
 * sub-groups (or the sub-groups of selected members) and single objects become its children, so groups of groups arise.
 */
function group() {
  const p = page();
  const objs = [...selectedShapes(), ...selectedEdges()];
  if (objs.length < 2) return;
  const chains = objs.map((o) => ancestors(p, o).reverse()); // outermost first
  let common = 0;
  while (chains.every((c) => c.length > common && c[common] === chains[0][common])) common++;
  const parent = common ? chains[0][common - 1] : null;
  const subGroups = new Set(), singles = [];
  objs.forEach((o, i) => { if (chains[i][common]) subGroups.add(chains[i][common]); else singles.push(o); });
  if (subGroups.size + singles.length < 2) return; // already one group
  record();
  const id = newId();
  const list = groupsOf(p);
  // (memberships first: the group list drops groups without members)
  for (const gid of subGroups) list.find((g) => g.id === gid).parent = id;
  for (const o of singles) o.group = id;
  list.push({ id, name: t('dg.groupName', list.length + 1), ...(parent ? { parent } : {}) });
  changed();
  return id;
}

/** Dissolve the outermost groups that are completely selected; selected members of other groups leave their group. */
function ungroup() {
  const p = page();
  const objs = [...selectedShapes(), ...selectedEdges()].filter((o) => o.group);
  if (!objs.length) return;
  record();
  const full = (gid) => groupMembers(p, gid).every((o) => app.selection.has(o.id));
  const dissolve = new Set();
  for (const o of objs) {
    const g = ancestors(p, o).reverse().find(full);
    if (g) dissolve.add(g);
  }
  for (const gid of dissolve) {
    const g = groupById(p, gid);
    for (const child of p.groups) if (child.parent === gid) { if (g.parent) child.parent = g.parent; else delete child.parent; }
    for (const o of [...p.shapes, ...p.edges]) if (o.group === gid) { if (g.parent) o.group = g.parent; else delete o.group; }
    p.groups = p.groups.filter((x) => x.id !== gid);
  }
  if (!dissolve.size) {
    // members selected alone: out of their group (into the enclosing one)
    for (const o of objs) { const g = groupById(p, o.group); if (g && g.parent) o.group = g.parent; else delete o.group; }
  }
  changed();
}

function renameGroup(gid, name) {
  const g = groupById(page(), gid);
  if (!g || g.name === name) return;
  record();
  g.name = name;
  changed();
}

/** Select objects (from the element tree): a group stands for all its members. */
function selectItems(items, mode = 'replace') {
  const p = page();
  const membersOf = (it) => (it.kind === 'group' ? groupMembers(p, it.id) : it.kind === 'layer' ? [...p.shapes, ...p.edges].filter((o) => layerOf(p, o).id === it.id) : [find(it.id)]);
  const ids = items.flatMap(membersOf).filter((o) => o && isSelectable(p, o)).map((o) => o.id);
  if (mode === 'replace') app.selection = new Set(ids);
  else if (mode === 'toggle' && ids.every((id) => app.selection.has(id))) for (const id of ids) app.selection.delete(id);
  else for (const id of ids) app.selection.add(id);
  render();
}

// ---- rotation ------------------------------------------------------------------------------------------------

/** Bounding box of the selected shapes (rotated shapes: their outer box). */
function selectionBounds() {
  const boxes = selectedShapes().map(shapeBounds);
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

/** Rotate the selection by delta degrees: one shape around its centre, several around the centre of the selection. */
function rotateSelection(delta, { orig = null, recordIt = true } = {}) {
  const shapes = selectedShapes();
  if (!shapes.length || !delta) return;
  if (recordIt) record();
  const start = orig || snapshotRotation();
  const c = start.center;
  for (const sh of shapes) {
    const o = start.shapes.get(sh.id);
    if (!o) continue;
    const mid = rotatePoint({ x: o.x + o.w / 2, y: o.y + o.h / 2 }, c, delta);
    sh.x = mid.x - o.w / 2; sh.y = mid.y - o.h / 2;
    const r = normalizeAngle((o.rotation || 0) + delta);
    if (r) sh.rotation = r; else delete sh.rotation;
  }
  for (const ed of selectedEdges()) for (const end of ['from', 'to']) {
    const o = start.ends.get(`${ed.id}:${end}`);
    if (o) Object.assign(ed[end], rotatePoint(o, c, delta));
  }
  changed();
}

function snapshotRotation() {
  const shapes = selectedShapes();
  const b = selectionBounds();
  const center = shapes.length === 1 ? { x: shapes[0].x + shapes[0].w / 2, y: shapes[0].y + shapes[0].h / 2 } : { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const ends = new Map();
  for (const ed of selectedEdges()) for (const end of ['from', 'to']) if (!ed[end].id) ends.set(`${ed.id}:${end}`, { x: ed[end].x, y: ed[end].y });
  return { center, shapes: new Map(shapes.map((x) => [x.id, { x: x.x, y: x.y, w: x.w, h: x.h, rotation: x.rotation || 0 }])), ends };
}

/** Set the rotation of every selected shape (each around its own centre). */
function setRotation(deg) {
  const shapes = selectedShapes();
  if (!shapes.length) return;
  record();
  const r = normalizeAngle(deg);
  for (const sh of shapes) { if (r) sh.rotation = r; else delete sh.rotation; }
  changed();
}

function lockSelection() {
  if (!app.selection.size) return;
  record();
  for (const o of [...selectedShapes(), ...selectedEdges()]) o.locked = true;
  app.selection = new Set();
  changed();
  Suite.shell.toast(t('dg.locked'));
}

function unlockAll() {
  const locked = [...page().shapes, ...page().edges].filter((o) => o.locked);
  if (!locked.length) return;
  record();
  for (const o of locked) delete o.locked;
  app.selection = new Set(locked.filter((o) => isSelectable(page(), o)).map((o) => o.id));
  changed();
}

// ---- layers ---------------------------------------------------------------------------------------------------

function addLayer() {
  record();
  const p = page();
  const layer = newLayer(t('dg.layerName', layersOf(p).length + 1));
  p.layers.push(layer);
  p.activeLayer = layer.id;
  changed();
}

function setLayer(layer, props) {
  record();
  Object.assign(layer, props);
  // hidden or locked content cannot stay selected
  app.selection = new Set([...app.selection].filter((id) => find(id) && isSelectable(page(), find(id))));
  changed();
}

function moveLayer(layer, dir) {
  const ls = layersOf(page());
  const i = ls.indexOf(layer), j = i + dir;
  if (j < 0 || j >= ls.length) return;
  record();
  [ls[i], ls[j]] = [ls[j], ls[i]];
  changed();
}

function deleteLayer(layer) {
  const p = page();
  const ls = layersOf(p);
  if (ls.length < 2) return;
  record();
  const i = ls.indexOf(layer);
  const into = ls[i > 0 ? i - 1 : 1];
  for (const o of [...p.shapes, ...p.edges]) if (layerOf(p, o) === layer) o.layer = into.id;
  p.layers = ls.filter((l) => l !== layer);
  if (p.activeLayer === layer.id) p.activeLayer = into.id;
  changed();
}

function moveToLayer(id) {
  record();
  for (const o of [...selectedShapes(), ...selectedEdges()]) o.layer = id;
  changed();
}

/** Selected shapes plus edges whose attached ends are all selected. */
function copyable() {
  const shapes = selectedShapes();
  const ids = new Set(shapes.map((s) => s.id));
  const edges = page().edges.filter((e) => app.selection.has(e.id) || ((!e.from.id || ids.has(e.from.id)) && (!e.to.id || ids.has(e.to.id)) && (e.from.id || e.to.id) && ids.size));
  return { shapes, edges: edges.filter((e) => (!e.from.id || ids.has(e.from.id)) && (!e.to.id || ids.has(e.to.id))) };
}

async function copy() {
  const { shapes, edges } = copyable();
  if (!shapes.length && !edges.length) return;
  const xml = writeModel(shapes, edges, { groups: page().groups || [] });
  app.clipboard = xml;
  app.pasteCount = 0;
  try { await navigator.clipboard.writeText(xml); } catch (e) { /* internal clipboard only */ }
}

async function cut() { await copy(); deleteSelection(); }

function pasteXml(xml, offset) {
  const model = new DOMParser().parseFromString(xml, 'application/xml');
  const root = model.documentElement.tagName === 'mxfile' ? model.getElementsByTagName('mxGraphModel')[0] : model.documentElement;
  if (!root || root.tagName !== 'mxGraphModel') return false;
  record();
  const tmp = newPage();
  readModel(root, tmp, { withLayers: false });
  // pasted objects go to the active layer and form new groups (not the groups of the originals), nested as they were
  const regroup = new Map((tmp.groups || []).map((g) => [g.id, newId()]));
  const fresh = (gid) => { if (!regroup.has(gid)) regroup.set(gid, newId()); return regroup.get(gid); };
  for (const o of [...tmp.shapes, ...tmp.edges]) {
    delete o.layer;
    if (o.group) o.group = fresh(o.group);
  }
  groupsOf(page());
  for (const g of tmp.groups || []) page().groups.push({ id: fresh(g.id), name: g.name || '', ...(g.parent ? { parent: fresh(g.parent) } : {}) });
  for (const s of tmp.shapes) { s.x += offset; s.y += offset; }
  for (const e of tmp.edges) for (const end of [e.from, e.to, ...(e.waypoints || [])]) if (!end.id) { end.x += offset; end.y += offset; }
  page().shapes.push(...tmp.shapes);
  page().edges.push(...tmp.edges);
  app.selection = new Set([...tmp.shapes, ...tmp.edges].map((o) => o.id));
  changed();
  return true;
}

function pasteText(text) {
  if (/^\s*<(mxGraphModel|mxfile)/.test(text)) {
    app.pasteCount = text === app.clipboard ? app.pasteCount + 1 : 0;
    return pasteXml(text, text === app.clipboard ? app.pasteCount * GRID * 2 : 0);
  }
  if (!text.trim()) return false;
  const s = addShape('text', viewCenter(), { text });
  fitText(s);
  return true;
}

async function paste() {
  try {
    const text = await navigator.clipboard.readText();
    if (text && pasteText(text)) return;
  } catch (e) { /* no permission: internal clipboard */ }
  if (app.clipboard) pasteText(app.clipboard);
}

document.addEventListener('paste', async (e) => {
  if (app.editing || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) return;
  const file = [...(e.clipboardData ? e.clipboardData.files : [])].find((f) => f.type.startsWith('image/'));
  e.preventDefault();
  if (file) { await insertImage(file); return; }
  const text = e.clipboardData && e.clipboardData.getData('text/plain');
  if (text) pasteText(text); else if (app.clipboard) pasteText(app.clipboard);
});
document.addEventListener('copy', (e) => {
  if (app.editing || /^(INPUT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName) || !app.selection.size) return;
  const { shapes, edges } = copyable();
  app.clipboard = writeModel(shapes, edges, { groups: page().groups || [] });
  app.pasteCount = 0;
  e.clipboardData.setData('text/plain', app.clipboard);
  e.preventDefault();
});
document.addEventListener('cut', (e) => {
  if (app.editing || /^(INPUT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName) || !app.selection.size) return;
  const { shapes, edges } = copyable();
  app.clipboard = writeModel(shapes, edges, { groups: page().groups || [] });
  e.clipboardData.setData('text/plain', app.clipboard);
  e.preventDefault();
  deleteSelection();
});

function duplicate() {
  const { shapes, edges } = copyable();
  if (shapes.length || edges.length) pasteXml(writeModel(shapes, edges, { groups: page().groups || [] }), GRID * 2);
}

function reorder(front) {
  if (!app.selection.size) return;
  record();
  const p = page();
  const sel = (o) => app.selection.has(o.id);
  p.shapes = front ? [...p.shapes.filter((s) => !sel(s)), ...p.shapes.filter(sel)] : [...p.shapes.filter(sel), ...p.shapes.filter((s) => !sel(s))];
  p.edges = front ? [...p.edges.filter((e) => !sel(e)), ...p.edges.filter(sel)] : [...p.edges.filter(sel), ...p.edges.filter((e) => !sel(e))];
  changed();
}

function align(kind) {
  const shapes = selectedShapes();
  if (shapes.length < 2) return;
  record();
  const minX = Math.min(...shapes.map((s) => s.x)), maxX = Math.max(...shapes.map((s) => s.x + s.w));
  const minY = Math.min(...shapes.map((s) => s.y)), maxY = Math.max(...shapes.map((s) => s.y + s.h));
  for (const s of shapes) {
    if (kind === 'left') s.x = minX;
    if (kind === 'right') s.x = maxX - s.w;
    if (kind === 'center') s.x = (minX + maxX) / 2 - s.w / 2;
    if (kind === 'top') s.y = minY;
    if (kind === 'bottom') s.y = maxY - s.h;
    if (kind === 'middle') s.y = (minY + maxY) / 2 - s.h / 2;
  }
  changed();
}

function distribute(horizontal) {
  const shapes = selectedShapes().sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
  if (shapes.length < 3) return;
  record();
  const key = horizontal ? 'x' : 'y', size = horizontal ? 'w' : 'h';
  const first = shapes[0], last = shapes[shapes.length - 1];
  const total = shapes.reduce((n, s) => n + s[size], 0);
  const gap = (last[key] + last[size] - first[key] - total) / (shapes.length - 1);
  let pos = first[key];
  for (const s of shapes) { s[key] = pos; pos += s[size] + gap; }
  changed();
}

function setStyle(key, value) {
  const items = [...selectedShapes(), ...selectedEdges()];
  if (!items.length) return;
  record(`style-${key}`);
  for (const o of items) if (key in o.style || !isEdge(o)) o.style[key] = value;
  changed();
}

function setProp(key, value) {
  const items = [...selectedShapes(), ...selectedEdges()].filter((o) => (key === 'route' ? isEdge(o) : !isEdge(o)));
  if (!items.length) return;
  record(`prop-${key}`);
  for (const o of items) o[key] = value;
  changed();
}

function fitText(s) {
  if (s.type !== 'text') return;
  const lines = String(s.text || '').split('\n').length;
  s.w = Math.max(20, Math.ceil(textWidth(s.text, s.style) + 10));
  s.h = Math.max(20, Math.ceil(lines * s.style.fontSize * 1.2 + 8));
}

async function insertImage(file) {
  const url = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
  const img = new Image();
  img.src = url;
  await img.decode().catch(() => {});
  const scale = Math.min(1, 300 / Math.max(img.naturalWidth || 100, img.naturalHeight || 100));
  addShape('image', viewCenter(), { w: Math.round((img.naturalWidth || 100) * scale), h: Math.round((img.naturalHeight || 100) * scale), style: { image: url } });
}

function pickImage() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = () => { if (input.files[0]) insertImage(input.files[0]).catch(fail); };
  input.click();
}

// ---- pages ---------------------------------------------------------------------------------------------------------

function goPage(i) { app.doc.page = i; app.selection = new Set(); app.editing = null; render(); requestAnimationFrame(fit); }

function addPage() {
  record();
  app.doc.pages.push(newPage(`Page-${app.doc.pages.length + 1}`));
  changed();
  goPage(app.doc.pages.length - 1);
}

async function deletePage(i) {
  if (app.doc.pages.length < 2 || !(await Suite.shell.confirm(t('dg.deletePageConfirm', app.doc.pages[i].name)))) return;
  record();
  app.doc.pages.splice(i, 1);
  app.doc.page = Math.min(app.doc.page, app.doc.pages.length - 1);
  changed();
}

// ---- files -------------------------------------------------------------------------------------------------------------

// recovery copies of unsaved work (shared/js/autosave.js)
Suite.autosave.register({
  app: APP,
  save: () => (app.dirty ? { name: app.name, handle: app.handle, xml: writeDrawio(app.doc) } : null),
  restore: (s) => { setDoc(readDrawio(s.xml), s.name, s.handle || null); changed(); },
});

// ---- automatic layout and Mermaid ------------------------------------------------------------------------

/** Arrange the shapes of the page (or the selected ones) in layers along their connections. */
function autoLayout(direction = 'TB') {
  const p = page();
  const sel = selectedShapes();
  const shapes = sel.length > 1 ? sel : p.shapes;
  if (!shapes.length) return;
  const ids = new Set(shapes.map((s) => s.id));
  const b = pageBounds({ shapes, edges: [] });
  const pos = layout({ shapes, edges: p.edges.filter((e) => ids.has(e.from.id) && ids.has(e.to.id)) }, { direction, origin: { x: Math.round(b.x / GRID) * GRID, y: Math.round(b.y / GRID) * GRID } });
  record();
  for (const s of shapes) { const q = pos.get(s.id); if (q) { s.x = q.x; s.y = q.y; } }
  // connectors follow the shapes; fixed anchors of the old arrangement would cross
  const inner = p.edges.filter((e) => ids.has(e.from.id) && ids.has(e.to.id));
  for (const e of inner) { delete e.from.ax; delete e.from.ay; delete e.to.ax; delete e.to.ay; }
  routeBackEdges(shapes, inner, direction);
  changed();
  Suite.shell.toast(t('dg.laidOut', shapes.length));
  requestAnimationFrame(fit);
}

/** Edges that point against the layout direction leave and enter their shapes at the side, so they run around the others. */
function routeBackEdges(shapes, edges, direction) {
  const byId = new Map(shapes.map((s) => [s.id, s]));
  const horizontal = direction === 'LR' || direction === 'RL';
  const sign = direction === 'BT' || direction === 'RL' ? -1 : 1;
  for (const e of edges) {
    const a = byId.get(e.from.id), b = byId.get(e.to.id);
    if (!a || !b) continue;
    const back = horizontal ? sign * (b.x - a.x) < 0 : sign * (b.y - a.y) < 0;
    if (!back) continue;
    const side = horizontal ? { ax: 0.5, ay: 1 } : { ax: 1, ay: 0.5 };
    Object.assign(e.from, side);
    Object.assign(e.to, side);
  }
}

/** Shapes and edges of a Mermaid flowchart, laid out at (x, y). */
function fromMermaid(text, origin = { x: 40, y: 40 }) {
  const g = parseMermaid(text);
  const ids = new Map();
  const shapes = g.nodes.map((n) => {
    const { w, h } = sizeFor(n.type, n.text);
    const s = makeShape(n.type, 0, 0, w, h, { text: n.text });
    ids.set(n.id, s.id);
    return s;
  });
  const edges = g.edges.map((e) => makeEdge({ id: ids.get(e.from) }, { id: ids.get(e.to) }, {
    text: e.text, style: { dash: e.dash, strokeWidth: e.thick ? 2 : 1, startArrow: e.startArrow, endArrow: e.endArrow },
  }));
  const pos = layout({ shapes, edges }, { direction: g.direction, origin });
  for (const s of shapes) Object.assign(s, pos.get(s.id));
  routeBackEdges(shapes, edges, g.direction);
  return { shapes, edges, direction: g.direction };
}

function insertMermaid(text) {
  let part;
  try {
    const p = page();
    const b = p.shapes.length ? pageBounds(p) : null;
    part = fromMermaid(text, b ? { x: Math.round(b.x / GRID) * GRID, y: Math.round((b.y + b.h + 60) / GRID) * GRID } : { x: 40, y: 40 });
  } catch (e) { Suite.shell.toast(t('dg.mermaidError', e.message), 'error'); return false; }
  record();
  page().shapes.push(...part.shapes);
  page().edges.push(...part.edges);
  app.selection = new Set(part.shapes.map((s) => s.id));
  changed();
  requestAnimationFrame(fit);
  return true;
}

function MermaidDialog() {
  const d = app.mermaid;
  if (!d) return null;
  const close = () => { app.mermaid = null; render(); };
  return html`<dialog open class="pico" data-testid="mermaid-dialog"><article class="dg-mermaid">
    <header><strong>${t('dg.mermaid').replace('…', '')}</strong></header>
    <small>${t('dg.mermaidHint')}</small>
    <textarea rows="12" data-testid="mermaid-text" spellcheck="false" onInput=${(e) => { d.text = e.target.value; }}>${d.text}</textarea>
    <footer><button class="secondary" onClick=${close}>${t('dg.cancel')}</button>
      <button data-testid="mermaid-insert" onClick=${() => { if (insertMermaid(d.text)) close(); }}>${t('dg.insert')}</button></footer>
  </article></dialog>`;
}

function setDoc(doc, name, handle = null) {
  Object.assign(app, { doc, name, handle, dirty: false, history: new History(), selection: new Set(), editing: null });
  Suite.shell.setDirty(false);
  render();
  requestAnimationFrame(fit);
}

async function parseFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  if (name.endsWith('.png')) {
    const xml = drawioFromPng(bytes);
    if (!xml) throw new Error('the PNG contains no diagram');
    return readDrawio(xml);
  }
  const text = new TextDecoder().decode(bytes);
  if (name.endsWith('.svg')) {
    const xml = drawioFromSvg(text);
    if (!xml) throw new Error('the SVG contains no diagram');
    return readDrawio(xml);
  }
  if (/^\s*\{/.test(text)) return readExcalidraw(text);
  if (/\.(mmd|mermaid)$/.test(name) || /^\s*(%%[^\n]*\n\s*)*(flowchart|graph)\b/.test(text)) {
    const part = fromMermaid(text);
    const doc = newDoc();
    doc.pages[0].shapes = part.shapes;
    doc.pages[0].edges = part.edges;
    return doc;
  }
  return readDrawio(text);
}

async function openPicked({ file, handle }) {
  try {
    const doc = await parseFile(file);
    // draw.io files, and PNG/SVG images with a diagram inside (saved as such images again)
    const editable = /\.(drawio|xml|png|svg)$/i.test(file.name);
    setDoc(doc, editable ? file.name : `${file.name.replace(/(\.drawio)?\.[^.]+$/i, '')}.drawio`, editable ? handle : null);
    if (handle && editable) Suite.files.remember(APP, handle);
  } catch (e) { console.warn(e); Suite.shell.toast(t('dg.cannotOpen', file.name, e.message), 'error'); }
}

async function openDiagram() {
  if (app.dirty && !(await Suite.shell.confirm(t('dg.discard')))) return;
  const picked = await Suite.files.open({ types: OPEN_TYPES }).catch(fail);
  if (picked) await openPicked(picked[0]);
}

async function newDiagram() {
  if (app.dirty && !(await Suite.shell.confirm(t('dg.discard')))) return;
  setDoc(newDoc(), `${t('dg.untitled')}.drawio`);
}

function report(result) { if (result.mode === 'downloaded') Suite.shell.banner(result.message); else Suite.shell.toast(result.message); }

/** The format a diagram is saved in: an image with the diagram inside when it was opened from one (e.g. from a presentation). */
/** Pictures of image shapes: embedded (data:image/…, blob:) or from the web – no javascript: or other schemes from opened files. */
const safeImage = (src) => typeof src === 'string' && /^\s*(data:image\/|blob:|https?:)/i.test(src);
const imageFormat = () => (/\.png$/i.test(app.name) ? 'png' : /\.svg$/i.test(app.name) ? 'svg' : null);

async function save(as = false) {
  commitEditing();
  try {
    const format = imageFormat();
    const bytes = format === 'png' ? await pngBytes(app.doc.pages[0]) : format === 'svg' ? new TextEncoder().encode(exportSvgText(app.doc.pages[0]).svg)
      : new TextEncoder().encode(writeDrawio(app.doc, { version: '%%BUILD_VERSION%%' }));
    const types = format === 'png' ? [{ description: 'PNG', accept: { 'image/png': ['.png'] } }] : format === 'svg' ? [{ description: 'SVG', accept: { 'image/svg+xml': ['.svg'] } }]
      : [{ description: 'draw.io', accept: { 'application/vnd.jgraph.mxfile': ['.drawio'] } }];
    const type = format === 'png' ? 'image/png' : format === 'svg' ? 'image/svg+xml' : 'application/xml';
    const result = as || !app.handle ? await Suite.files.saveAs(bytes, { suggestedName: app.name, types, type }) : await Suite.files.save({ name: app.name, handle: app.handle }, bytes, { type });
    if (!result) return;
    report(result);
    if (result.handle) app.handle = result.handle;
    app.name = result.name || app.name;
    app.dirty = false;
    Suite.shell.setDirty(false);
    render();
  } catch (e) { fail(e); }
}

/** SVG markup of the current page (with the whole diagram embedded as draw.io XML). */
function exportSvgText(p = page()) {
  const b = pageBounds({ shapes: p.shapes.filter((x) => isShown(p, x)), edges: p.edges.filter((x) => isShown(p, x)) });
  const pad = 10;
  const box = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  htmPreact.render(html`<${PageContent} page=${p} exporting=${true} />`, box);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="${Math.ceil(b.w + pad * 2)}" height="${Math.ceil(b.h + pad * 2)}" ` +
    `viewBox="${b.x - pad} ${b.y - pad} ${Math.ceil(b.w + pad * 2)} ${Math.ceil(b.h + pad * 2)}" content="${writeDrawio(app.doc).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/\n/g, '&#10;')}">` +
    `<g font-family="${FONT}">${box.innerHTML}</g></svg>`;
  htmPreact.render(null, box);
  return { svg, width: Math.ceil(b.w + pad * 2), height: Math.ceil(b.h + pad * 2) };
}

/** Print every page of the diagram on its own sheet, scaled to fit (the browser's "Save as PDF" gives a PDF). */
function printDiagram() {
  const box = document.createElement('div');
  box.id = 'dg-print';
  box.dataset.testid = 'print';
  for (const p of app.doc.pages) {
    if (!p.shapes.length && !p.edges.length) continue;
    const sheet = document.createElement('div');
    sheet.className = 'dg-print-page';
    const title = document.createElement('div');
    title.className = 'dg-print-title';
    title.textContent = app.doc.pages.length > 1 ? `${stem()} – ${p.name}` : stem();
    sheet.append(title);
    sheet.insertAdjacentHTML('beforeend', exportSvgText(p).svg);
    box.append(sheet);
  }
  if (!box.children.length) { Suite.shell.toast(t('dg.emptyPrint'), 'warning'); return; }
  document.body.append(box);
  const done = () => { box.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(() => { if (box.isConnected && !window.matchMedia('print').matches) done(); }, 1000);
}

const stem = () => app.name.replace(/(\.drawio)?\.[^.]+$/i, '').replace(/\.drawio$/i, '');

async function exportSvg() {
  const { svg } = exportSvgText();
  const result = await Suite.files.saveAs(new TextEncoder().encode(svg), { suggestedName: `${stem()}.drawio.svg`, types: [{ description: 'SVG', accept: { 'image/svg+xml': ['.svg'] } }], type: 'image/svg+xml' }).catch(fail);
  if (result) report(result);
}

/** A page as PNG (scale 2 = sharp on high-resolution screens) with the whole diagram inside (tEXt chunk "mxfile", like draw.io). */
async function pngBytes(p = page(), scale = 2) {
  const { svg, width, height } = exportSvgText(p);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = Math.ceil(width * scale);
    c.height = Math.ceil(height * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    return pngWithDrawio(new Uint8Array(await blob.arrayBuffer()), writeDrawio(app.doc));
  } finally { URL.revokeObjectURL(url); }
}

async function exportPng(scale = 2) {
  try {
    const png = await pngBytes(page(), scale);
    const result = await Suite.files.saveAs(png, { suggestedName: `${stem()}.drawio.png`, types: [{ description: 'PNG', accept: { 'image/png': ['.png'] } }], type: 'image/png' });
    if (result) report(result);
  } catch (e) { fail(e); }
}

function undo() { commitEditing(); const snap = app.history.undo(app.doc); if (snap) { app.doc = snap; app.selection = new Set([...app.selection].filter((id) => find(id))); changed(); } }
function redo() { const snap = app.history.redo(app.doc); if (snap) { app.doc = snap; app.selection = new Set([...app.selection].filter((id) => find(id))); changed(); } }

// ---- text editing --------------------------------------------------------------------------------------------------------

function startEditing(id) {
  const o = find(id);
  if (!o) return;
  app.editing = { id, text: o.text || '' };
  app.selection = new Set([id]);
  render();
  requestAnimationFrame(() => { const ta = document.querySelector('[data-testid=text-editor]'); if (ta) { ta.focus(); ta.select(); } });
}

function commitEditing() {
  const ed = app.editing;
  if (!ed) return;
  app.editing = null;
  const o = find(ed.id);
  if (o && o.text !== ed.text) {
    record();
    o.text = ed.text;
    if (!isEdge(o)) fitText(o);
    changed();
  } else render();
}

// ---- pointer interaction ------------------------------------------------------------------------------------------------

const pointers = new Map();
let spaceDown = false;

function shapeAt(p, exclude = null) {
  const shapes = inLayerOrder(page(), page().shapes);
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (s.id !== exclude && containsPoint(s, p)) return s;
  }
  return null;
}

/** Nearest port of a shape within reach (in screen pixels), else null. */
function portAt(s, p) {
  const reach = 12 / app.view.zoom;
  let best = null;
  for (const port of PORTS) {
    const pt = shapePoint(s, port.ax, port.ay);
    const d = Math.hypot(pt.x - p.x, pt.y - p.y);
    if (d <= reach && (!best || d < best.d)) best = { ...port, d };
  }
  return best && { ax: best.ax, ay: best.ay };
}

function onPointerDown(e) {
  if (app.editing) commitEditing();
  svgEl.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    app.drag = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view: { ...app.view } };
    return;
  }
  const p = toDiagram(e);
  if (e.button === 1 || app.tool === 'hand' || spaceDown) { app.drag = { kind: 'pan', x: e.clientX, y: e.clientY, view: { ...app.view } }; return; }
  if (e.button !== 0) return;
  const target = e.target.closest('[data-handle], [data-id]');
  const handle = target && target.dataset.handle;
  if (handle === 'port') {
    const s = find(target.dataset.shape);
    app.drag = { kind: 'connect', from: { id: s.id, ax: +target.dataset.ax, ay: +target.dataset.ay }, cur: p };
    return;
  }
  if (handle === 'from' || handle === 'to') { record(); app.drag = { kind: 'edge-end', id: target.dataset.edge, end: handle, cur: p }; return; }
  if (handle === 'rotate') {
    record();
    const orig = snapshotRotation();
    app.drag = { kind: 'rotate', orig, startAngle: Math.atan2(p.y - orig.center.y, p.x - orig.center.x), delta: 0 };
    return;
  }
  if (handle) { const s = find(target.dataset.shape); record(); app.drag = { kind: 'resize', handle, id: s.id, start: p, orig: { x: s.x, y: s.y, w: s.w, h: s.h, rotation: s.rotation || 0 } }; return; }
  if (app.tool.startsWith('shape:')) { app.drag = { kind: 'create', type: app.tool.slice(6), start: p, cur: p }; return; }
  if (app.tool === 'edge') {
    const s = shapeAt(p);
    app.drag = { kind: 'connect', from: s ? { id: s.id, ...(portAt(s, p) || {}) } : { x: snapV(p.x), y: snapV(p.y) }, cur: p };
    return;
  }
  if (app.tool === 'text') { const s = addShape('text', p); app.tool = 'select'; startEditing(s.id); return; }
  // locked objects and objects on locked layers behave like empty space
  const id = target && target.dataset.id && isSelectable(page(), find(target.dataset.id)) ? target.dataset.id : null;
  if (id) {
    // a click selects the whole group; Alt+click selects one member
    const ids = e.altKey ? new Set([id]) : withGroups([id]);
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      const remove = app.selection.has(id);
      for (const x of ids) if (remove) app.selection.delete(x); else app.selection.add(x);
    } else if (!app.selection.has(id) || e.altKey) app.selection = ids; // (Alt: this member alone, also inside a selected group)
    const orig = new Map();
    for (const s of selectedShapes()) orig.set(s.id, { x: s.x, y: s.y });
    for (const ed of selectedEdges()) for (const end of ['from', 'to']) if (!ed[end].id) orig.set(`${ed.id}:${end}`, { x: ed[end].x, y: ed[end].y });
    for (const ed of selectedEdges()) if (ed.waypoints) orig.set(`${ed.id}:waypoints`, ed.waypoints.map((p) => ({ ...p })));
    app.drag = { kind: 'move', start: p, orig, moved: false };
  } else {
    if (!e.shiftKey) app.selection = new Set();
    app.drag = { kind: 'band', start: p, cur: p };
  }
  render();
}

function onPointerMove(e) {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const d = app.drag;
  const p = toDiagram(e);
  if (!d) {
    // hovering a shape shows its connection ports
    const target = e.target.closest('[data-id], [data-handle=port]');
    const id = target ? target.dataset.shape || target.dataset.id : null;
    const hover = id && !isEdge(find(id)) && (app.tool === 'select' || app.tool === 'edge') ? id : null;
    if (hover !== app.hover) { app.hover = hover; render(); }
    return;
  }
  if (d.kind === 'pinch' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const r = svgEl.getBoundingClientRect();
    const zoom = Math.min(8, Math.max(0.1, d.view.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / d.dist)));
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const px = d.mid.x - r.left, py = d.mid.y - r.top;
    Object.assign(app.view, { zoom, x: px - ((px - d.view.x) * zoom) / d.view.zoom + mid.x - d.mid.x, y: py - ((py - d.view.y) * zoom) / d.view.zoom + mid.y - d.mid.y });
    render();
    return;
  }
  if (d.kind === 'pan') { app.view.x = d.view.x + e.clientX - d.x; app.view.y = d.view.y + e.clientY - d.y; render(); return; }
  if (d.kind === 'move') {
    let dx = p.x - d.start.x, dy = p.y - d.start.y;
    if (!d.moved && Math.hypot(dx, dy) * app.view.zoom < 3) return;
    if (!d.moved) { record(); d.moved = true; }
    // snap the first selected shape to the grid and move the others by the same amount
    const first = selectedShapes()[0];
    if (first && !e.altKey) { const o = d.orig.get(first.id); dx = snapV(o.x + dx) - o.x; dy = snapV(o.y + dy) - o.y; }
    for (const s of selectedShapes()) { const o = d.orig.get(s.id); if (o) { s.x = o.x + dx; s.y = o.y + dy; } }
    for (const ed of selectedEdges()) for (const end of ['from', 'to']) { const o = d.orig.get(`${ed.id}:${end}`); if (o) { ed[end].x = o.x + dx; ed[end].y = o.y + dy; } }
    for (const ed of selectedEdges()) { const o = d.orig.get(`${ed.id}:waypoints`); if (o) ed.waypoints = o.map((p) => ({ x: p.x + dx, y: p.y + dy })); }
    changed();
    return;
  }
  if (d.kind === 'rotate') {
    const angle = ((Math.atan2(p.y - d.orig.center.y, p.x - d.orig.center.x) - d.startAngle) * 180) / Math.PI;
    let delta = e.shiftKey ? Math.round(angle / 15) * 15 : Math.round(angle); // Shift: steps of 15°
    if (!e.shiftKey && !e.altKey) { // 0/90/180/270 attract (a single shape: its angle; several: the turn)
      const base = d.orig.shapes.size === 1 ? (d.orig.shapes.values().next().value.rotation || 0) : 0;
      const near = Math.round((base + delta) / 90) * 90;
      if (Math.abs(base + delta - near) < 4) delta = near - base;
    }
    d.delta = delta;
    rotateSelection(delta, { orig: d.orig, recordIt: false });
    return;
  }
  if (d.kind === 'resize' && d.orig.rotation) {
    // in the shape's own (rotated) frame; the opposite side stays where it is
    const s = find(d.id);
    const o = d.orig;
    const local = rotatePoint({ x: p.x - d.start.x, y: p.y - d.start.y }, { x: 0, y: 0 }, -o.rotation);
    let x0 = 0, y0 = 0, x1 = o.w, y1 = o.h;
    if (d.handle.includes('e')) x1 = Math.max(10, o.w + local.x);
    if (d.handle.includes('s')) y1 = Math.max(10, o.h + local.y);
    if (d.handle.includes('w')) x0 = Math.min(o.w - 10, local.x);
    if (d.handle.includes('n')) y0 = Math.min(o.h - 10, local.y);
    const w = x1 - x0, h = y1 - y0;
    const c = rotatePoint({ x: o.x + (x0 + x1) / 2, y: o.y + (y0 + y1) / 2 }, { x: o.x + o.w / 2, y: o.y + o.h / 2 }, o.rotation);
    Object.assign(s, { x: c.x - w / 2, y: c.y - h / 2, w, h });
    changed();
    return;
  }
  if (d.kind === 'resize') {
    const s = find(d.id);
    const o = d.orig;
    let { x, y, w, h } = o;
    const dx = p.x - d.start.x, dy = p.y - d.start.y;
    if (d.handle.includes('e')) w = Math.max(10, snapV(o.x + o.w + dx, e.altKey) - o.x);
    if (d.handle.includes('s')) h = Math.max(10, snapV(o.y + o.h + dy, e.altKey) - o.y);
    if (d.handle.includes('w')) { x = Math.min(o.x + o.w - 10, snapV(o.x + dx, e.altKey)); w = o.x + o.w - x; }
    if (d.handle.includes('n')) { y = Math.min(o.y + o.h - 10, snapV(o.y + dy, e.altKey)); h = o.y + o.h - y; }
    if (e.shiftKey) { const k = Math.max(w / o.w, h / o.h); w = o.w * k; h = o.h * k; }
    Object.assign(s, { x, y, w, h });
    changed();
    return;
  }
  if (d.kind === 'edge-end') {
    const ed = find(d.id);
    const s = shapeAt(p);
    ed[d.end] = s ? { id: s.id, ...(portAt(s, p) || {}) } : { x: snapV(p.x, e.altKey), y: snapV(p.y, e.altKey) };
    d.cur = p;
    changed();
    return;
  }
  d.cur = p;
  if (d.kind === 'connect') app.hover = (shapeAt(p, null) || {}).id || null;
  render();
}

function onPointerUp(e) {
  pointers.delete(e.pointerId);
  const d = app.drag;
  if (!d) return;
  if (d.kind === 'pinch') { if (pointers.size < 2) app.drag = null; return; }
  app.drag = null;
  const p = toDiagram(e);
  if (d.kind === 'create') {
    const w = Math.abs(p.x - d.start.x), h = Math.abs(p.y - d.start.y);
    if (w * app.view.zoom < 5 && h * app.view.zoom < 5) addShape(d.type, d.start);
    else {
      record();
      const x = snapV(Math.min(p.x, d.start.x)), y = snapV(Math.min(p.y, d.start.y));
      const s = makeShape(d.type, x, y, Math.max(10, snapV(Math.max(p.x, d.start.x)) - x), Math.max(10, snapV(Math.max(p.y, d.start.y)) - y));
      page().shapes.push(s);
      app.selection = new Set([s.id]);
      changed();
    }
    app.tool = 'select';
  } else if (d.kind === 'connect') {
    const s = shapeAt(p);
    const fromShape = d.from.id ? find(d.from.id) : null;
    const start = fromShape ? shapePoint(fromShape, d.from.ax ?? 0.5, d.from.ay ?? 0.5) : d.from;
    // a click (no drag) or a release on the start shape creates nothing
    if (!s && Math.hypot(p.x - start.x, p.y - start.y) * app.view.zoom < 8) { render(); return; }
    if (s && fromShape && s.id === fromShape.id && !portAt(s, p)) { render(); return; }
    record();
    const to = s ? { id: s.id, ...(portAt(s, p) || {}) } : { x: snapV(p.x, e.altKey), y: snapV(p.y, e.altKey) };
    const edge = makeEdge(d.from, to);
    page().edges.push(edge);
    app.selection = new Set([edge.id]);
    app.tool = 'select';
    changed();
  } else if (d.kind === 'band') {
    const x0 = Math.min(d.start.x, p.x), x1 = Math.max(d.start.x, p.x), y0 = Math.min(d.start.y, p.y), y1 = Math.max(d.start.y, p.y);
    if ((x1 - x0) * app.view.zoom > 3 || (y1 - y0) * app.view.zoom > 3) {
      const inside = (q) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1;
      const pg = page();
      for (const s of pg.shapes) { const b = shapeBounds(s); if (isSelectable(pg, s) && b.x >= x0 && b.y >= y0 && b.x + b.w <= x1 && b.y + b.h <= y1) app.selection.add(s.id); }
      const map = shapeMap();
      for (const ed of pg.edges) if (isSelectable(pg, ed) && edgeGeometry(ed, map).points.every(inside)) app.selection.add(ed.id);
      app.selection = new Set([...withGroups(app.selection)].filter((x) => isSelectable(pg, find(x))));
    }
  }
  render();
}

function onWheel(e) {
  e.preventDefault();
  const r = svgEl.getBoundingClientRect();
  if (e.ctrlKey || e.metaKey) setZoom(app.view.zoom * Math.exp(-e.deltaY * 0.0025), { x: e.clientX - r.left, y: e.clientY - r.top });
  else { app.view.x -= e.shiftKey ? e.deltaY : e.deltaX; app.view.y -= e.shiftKey ? 0 : e.deltaY; render(); }
}

function onDoubleClick(e) {
  // pointer capture makes the svg the event target: hit-test the point instead
  const target = document.elementsFromPoint(e.clientX, e.clientY).map((el) => el.closest('[data-id]')).find(Boolean);
  if (target && isSelectable(page(), find(target.dataset.id))) { startEditing(target.dataset.id); return; }
  if (target) return; // locked
  const s = addShape('text', toDiagram(e));
  startEditing(s.id);
}

// ---- rendering ------------------------------------------------------------------------------------------------------------

/** Class/entity text: the title in the header, the other lines left-aligned below, "--" as separator line. */
function CompartmentText({ s }) {
  const st = s.style;
  const [title, ...rest] = String(s.text || '').split('\n');
  const lh = st.fontSize * 1.25, hd = Math.min(26, s.h);
  let y = hd + 4;
  const body = [];
  for (const line of rest) {
    if (line.trim() === '--') { body.push(html`<path d=${`M0,${y + 2}H${s.w}`} stroke=${st.stroke} stroke-width=${st.strokeWidth} />`); y += 6; continue; }
    body.push(html`<text x="6" y=${y + st.fontSize * 0.9} fill=${st.fontColor} font-size=${st.fontSize} font-family=${FONT}>${line || ' '}</text>`);
    y += lh;
  }
  return html`<g><text x=${s.w / 2} y=${hd / 2 + st.fontSize * 0.35} text-anchor="middle" fill=${st.fontColor} font-size=${st.fontSize} font-weight="bold" font-family=${FONT}>${title}</text>${body}</g>`;
}

function ShapeText({ s }) {
  if (!s.text) return null;
  const st = s.style;
  if (COMPARTMENTS.has(s.type)) return html`<${CompartmentText} s=${s} />`;
  if (s.type === 'pool') { // the name runs upwards in the header strip
    return html`<text transform=${`translate(${15 + st.fontSize * 0.35},${s.h / 2}) rotate(-90)`} text-anchor="middle" fill=${st.fontColor} font-size=${st.fontSize}
      font-weight=${st.bold ? 'bold' : null} font-family=${FONT}>${String(s.text).replace(/\n/g, ' ')}</text>`;
  }
  const below = LABEL_BELOW.has(s.type);
  const width = below ? Math.max(s.w, 160) : Math.max(10, s.w - 8);
  const lines = wrapText(s.text, st, width);
  const lh = st.fontSize * 1.2;
  const total = lines.length * lh;
  const top = below ? s.h + 4 : st.valign === 'top' ? 4 : st.valign === 'bottom' ? s.h - 4 - total : (s.h - total) / 2;
  const x = below ? s.w / 2 : st.align === 'left' ? 4 : st.align === 'right' ? s.w - 4 : s.w / 2;
  const anchor = below ? 'middle' : st.align === 'left' ? 'start' : st.align === 'right' ? 'end' : 'middle';
  return html`<text x=${x} y=${top} fill=${st.fontColor} font-size=${st.fontSize} font-weight=${st.bold ? 'bold' : null} font-style=${st.italic ? 'italic' : null}
      text-anchor=${anchor} font-family=${FONT}>${lines.map((line, i) => html`<tspan x=${x} y=${top + i * lh + st.fontSize * 0.9}>${line || ' '}</tspan>`)}</text>`;
}

function Shape({ s, exporting }) {
  const st = s.style;
  const editingThis = app.editing && app.editing.id === s.id;
  return html`<g data-id=${exporting ? null : s.id} transform=${`translate(${s.x},${s.y})${s.rotation ? ` rotate(${s.rotation} ${s.w / 2} ${s.h / 2})` : ''}`} opacity=${st.opacity < 1 ? st.opacity : null} class=${exporting ? null : 'dg-shape'}>
    ${s.type === 'image'
      ? html`${safeImage(st.image) ? html`<image href=${st.image} width=${s.w} height=${s.h} preserveAspectRatio="none" />` : null}<rect width=${s.w} height=${s.h} fill=${exporting ? 'none' : 'transparent'} stroke=${st.stroke === 'none' ? 'none' : st.stroke} />`
      : html`<path d=${shapePath(s)} fill=${s.type === 'actor' ? (st.fill === 'none' ? 'transparent' : st.fill) : st.fill === 'none' ? (exporting ? 'none' : 'transparent') : st.fill}
          stroke=${st.stroke} stroke-width=${st.strokeWidth} stroke-dasharray=${st.dash ? `${st.strokeWidth * 3} ${st.strokeWidth * 3}` : null} stroke-linejoin="round" />`}
    ${editingThis ? null : html`<${ShapeText} s=${s} />`}
  </g>`;
}

function Edge({ e, map, exporting }) {
  const geom = edgeGeometry(e, map);
  const d = edgePathD(geom);
  const st = e.style;
  const heads = [[st.startArrow, geom.points[0], arrowFrom(geom, true)], [st.endArrow, geom.points[geom.points.length - 1], arrowFrom(geom, false)]]
    .map(([kind, tip, from]) => arrowPath(kind, tip, from, st.strokeWidth)).filter(Boolean);
  const mid = edgeMidpoint(geom);
  const lines = e.text && !(app.editing && app.editing.id === e.id) ? String(e.text).split('\n') : [];
  const lw = lines.length ? textWidth(e.text, st) + 6 : 0;
  const lh = st.fontSize * 1.2;
  return html`<g data-id=${exporting ? null : e.id} class=${exporting ? null : 'dg-edge'} opacity=${st.opacity < 1 ? st.opacity : null}>
    ${exporting ? null : html`<path d=${d} fill="none" stroke="transparent" stroke-width=${12 / app.view.zoom} />`}
    <path d=${d} fill="none" stroke=${st.stroke} stroke-width=${st.strokeWidth} stroke-dasharray=${st.dash ? `${st.strokeWidth * 3} ${st.strokeWidth * 3}` : null} />
    ${heads.map((h) => html`<path d=${h.d} fill=${h.fill === 'bg' ? '#ffffff' : h.fill ? st.stroke : 'none'} stroke=${st.stroke} stroke-width=${st.strokeWidth} stroke-linejoin="round" />`)}
    ${lines.length ? html`<rect x=${mid.x - lw / 2} y=${mid.y - (lines.length * lh) / 2} width=${lw} height=${lines.length * lh} fill="#ffffff" />
      <text text-anchor="middle" font-size=${st.fontSize} fill=${st.fontColor} font-family=${FONT}>${lines.map((l, i) => html`<tspan x=${mid.x} y=${mid.y - (lines.length * lh) / 2 + i * lh + st.fontSize * 0.9}>${l}</tspan>`)}</text>` : null}
  </g>`;
}

function PageContent({ page: p, exporting = false }) {
  const map = new Map(p.shapes.map((s) => [s.id, s]));
  // layers bottom to top; hidden layers are neither shown nor exported
  return html`<g>${inLayerOrder(p, p.shapes).map((s) => html`<${Shape} key=${s.id} s=${s} exporting=${exporting} />`)}${inLayerOrder(p, p.edges).map((e) => html`<${Edge} key=${e.id} e=${e} map=${map} exporting=${exporting} />`)}</g>`;
}

function Overlay() {
  const z = app.view.zoom;
  const hs = 8 / z;
  const parts = [];
  const map = shapeMap();
  const single = app.selection.size === 1 ? find([...app.selection][0]) : null;
  // connection ports of the hovered (or the only selected) shape, below the handles
  const portShape = (app.hover && find(app.hover)) || (single && !isEdge(single) ? single : null);
  if (portShape && !isEdge(portShape) && (!app.drag || app.drag.kind === 'connect') && (app.tool === 'select' || app.tool === 'edge')) {
    for (const port of PORTS) {
      parts.push(html`<circle class="dg-port" data-handle="port" data-shape=${portShape.id} data-ax=${port.ax} data-ay=${port.ay} data-testid="port"
        cx=${shapePoint(portShape, port.ax, port.ay).x} cy=${shapePoint(portShape, port.ax, port.ay).y} r=${5 / z} stroke-width=${1 / z} />`);
    }
  }
  const frame = (s) => `rotate(${s.rotation || 0} ${s.x + s.w / 2} ${s.y + s.h / 2})`;
  for (const s of selectedShapes()) {
    parts.push(html`<rect class="dg-sel" x=${s.x} y=${s.y} width=${s.w} height=${s.h} transform=${frame(s)} stroke-width=${1 / z} />`);
  }
  const rotating = app.drag && app.drag.kind === 'rotate';
  if (single && !isEdge(single)) {
    const s = single;
    const handles = { nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5] };
    const items = rotating ? [] : Object.entries(handles).map(([name, [hx, hy]]) => html`<rect class=${`dg-handle h-${name}`} data-handle=${name} data-shape=${s.id} data-testid=${`handle-${name}`}
      x=${s.x + hx * s.w - hs / 2} y=${s.y + hy * s.h - hs / 2} width=${hs} height=${hs} stroke-width=${1 / z} />`);
    // the rotation handle above the top edge
    const ry = s.y - 24 / z;
    items.push(html`<path class="dg-rotate-line" d=${`M${s.x + s.w / 2},${s.y}V${ry}`} stroke-width=${1 / z} />`);
    items.push(html`<circle class="dg-handle dg-rotate" data-handle="rotate" data-shape=${s.id} data-testid="handle-rotate" cx=${s.x + s.w / 2} cy=${ry} r=${hs / 1.6} stroke-width=${1 / z}><title>${t('dg.rotate')}</title></circle>`);
    parts.push(html`<g transform=${frame(s)}>${items}</g>`);
  } else if (selectedShapes().length > 1) {
    // several shapes (e.g. a group): one rotation handle above the selection
    const b = rotating ? null : selectionBounds();
    if (b) {
      parts.push(html`<rect class="dg-sel dg-sel-group" x=${b.x} y=${b.y} width=${b.w} height=${b.h} stroke-width=${1 / z} />`);
      parts.push(html`<path class="dg-rotate-line" d=${`M${b.x + b.w / 2},${b.y}V${b.y - 24 / z}`} stroke-width=${1 / z} />`);
      parts.push(html`<circle class="dg-handle dg-rotate" data-handle="rotate" data-testid="handle-rotate" cx=${b.x + b.w / 2} cy=${b.y - 24 / z} r=${hs / 1.6} stroke-width=${1 / z}><title>${t('dg.rotate')}</title></circle>`);
    }
  }
  for (const ed of selectedEdges()) {
    const g = edgeGeometry(ed, map);
    parts.push(html`<path class="dg-sel-edge" d=${edgePathD(g)} stroke-width=${1 / z} />`);
    for (const [end, pt] of [['from', g.points[0]], ['to', g.points[g.points.length - 1]]]) {
      parts.push(html`<circle class=${`dg-end ${ed[end].id ? 'attached' : ''}`} data-handle=${end} data-edge=${ed.id} data-testid=${`edge-${end}`} cx=${pt.x} cy=${pt.y} r=${5 / z} stroke-width=${1 / z} />`);
    }
  }
  const d = app.drag;
  if (d && d.kind === 'band') {
    parts.push(html`<rect class="dg-band" x=${Math.min(d.start.x, d.cur.x)} y=${Math.min(d.start.y, d.cur.y)} width=${Math.abs(d.cur.x - d.start.x)} height=${Math.abs(d.cur.y - d.start.y)} stroke-width=${1 / z} />`);
  }
  if (d && d.kind === 'create') {
    const preview = makeShape(d.type, Math.min(d.start.x, d.cur.x), Math.min(d.start.y, d.cur.y), Math.max(1, Math.abs(d.cur.x - d.start.x)), Math.max(1, Math.abs(d.cur.y - d.start.y)));
    parts.push(html`<path class="dg-preview" transform=${`translate(${preview.x},${preview.y})`} d=${shapePath(preview)} stroke-width=${1 / z} />`);
  }
  if (d && d.kind === 'connect') {
    const tmp = makeEdge(d.from, { x: d.cur.x, y: d.cur.y }, { route: 'straight' });
    parts.push(html`<path class="dg-preview" d=${edgePathD(edgeGeometry(tmp, map))} stroke-width=${1 / z} />`);
  }
  return html`<g class="dg-overlay">${parts}</g>`;
}

function TextEditor() {
  const ed = app.editing;
  if (!ed) return null;
  const o = find(ed.id);
  if (!o) return null;
  const z = app.view.zoom, v = app.view;
  let box;
  if (isEdge(o)) {
    const m = edgeMidpoint(edgeGeometry(o, shapeMap()));
    box = { x: m.x - 80, y: m.y - 20, w: 160, h: 40 };
  } else box = o.type === 'actor' || o.type === 'image' ? { x: o.x - 40, y: o.y + o.h + 2, w: o.w + 80, h: 40 } : { x: o.x, y: o.y, w: Math.max(o.w, 60), h: Math.max(o.h, 24) };
  const st = o.style;
  return html`<textarea class="dg-text-editor" data-testid="text-editor" value=${ed.text}
    style=${`left:${v.x + box.x * z}px;top:${v.y + box.y * z}px;width:${box.w * z}px;height:${box.h * z}px;font-size:${(st.fontSize || 12) * z}px;text-align:${st.align || 'center'};color:${st.fontColor || '#000'};font-weight:${st.bold ? 'bold' : 'normal'};font-style:${st.italic ? 'italic' : 'normal'}`}
    onInput=${(e) => { ed.text = e.target.value; }} onBlur=${commitEditing}
    onKeyDown=${(e) => { if (e.key === 'Escape') { app.editing = null; render(); } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commitEditing(); } e.stopPropagation(); }}></textarea>`;
}

function Canvas() {
  const v = app.view;
  const gs = GRID * v.zoom;
  const cursor = app.tool === 'hand' || spaceDown ? 'grab' : app.tool.startsWith('shape:') || app.tool === 'edge' ? 'crosshair' : app.tool === 'text' ? 'text' : 'default';
  return html`<div class="dg-stage">
    <svg class="dg-canvas" data-testid="canvas" ref=${(el) => { svgEl = el; }} style=${`cursor:${cursor}`}
      onPointerDown=${onPointerDown} onPointerMove=${onPointerMove} onPointerUp=${onPointerUp} onPointerCancel=${() => { pointers.clear(); app.drag = null; render(); }}
      onWheel=${onWheel} onDblClick=${onDoubleClick} onContextMenu=${(e) => e.preventDefault()}
      onDragOver=${(e) => { if ([...e.dataTransfer.types].includes('application/x-diagram-shape')) e.preventDefault(); }}
      onDrop=${(e) => { const type = e.dataTransfer.getData('application/x-diagram-shape'); if (type) { e.preventDefault(); e.stopPropagation(); if (type === 'image') pickImage(); else addShape(type, toDiagram(e)); } }}>
      <defs>
        <pattern id="dg-grid" width=${gs} height=${gs} patternUnits="userSpaceOnUse" x=${v.x % gs} y=${v.y % gs}>
          <path d=${`M${gs},0L0,0L0,${gs}`} fill="none" class="dg-grid-line" />
        </pattern>
      </defs>
      ${app.grid && gs >= 4 ? html`<rect width="100%" height="100%" fill="url(#dg-grid)" />` : null}
      <g transform=${`translate(${v.x},${v.y}) scale(${v.zoom})`}>
        <${PageContent} page=${page()} />
        <${Overlay} />
      </g>
    </svg>
    ${!page().shapes.length && !page().edges.length ? html`<p class="dg-hint">${t('dg.empty')}</p>` : null}
    <${TextEditor} />
  </div>`;
}

const ICON = (type) => {
  const tall = type === 'actor' || type === 'server';
  const round = type.startsWith('event-') || type === 'gateway';
  const s = makeShape(type, 0, 0, tall ? 14 : round ? 20 : 28, tall ? 26 : type === 'text' ? 16 : 20);
  if (round) return html`<svg viewBox="-5 -1 30 22" width="30" height="22"><path d=${shapePath(s)} fill="none" stroke="currentColor" stroke-width=${type === 'event-end' ? 2.2 : 1.2} /></svg>`;
  if (type === 'text') return html`<svg viewBox="0 0 30 22" width="30" height="22"><text x="15" y="16" text-anchor="middle" font-size="13" fill="currentColor" font-family=${FONT}>Aa</text></svg>`;
  if (type === 'image') return html`<svg viewBox="0 0 30 22" width="30" height="22"><path d="M2,2H28V20H2ZM4,18L11,10L16,15L20,11L26,18Z" fill="none" stroke="currentColor" /></svg>`;
  return html`<svg viewBox=${`-1 -1 ${(tall ? 14 : 28) + 2} ${(tall ? 26 : 20) + 2}`} width="30" height="22"><path d=${shapePath(s)} fill="none" stroke="currentColor" stroke-width="1.2" /></svg>`;
};

function shapeButton(type, testid) {
  return html`<button class="secondary outline" title=${t(`shape.${type}`)} aria-label=${t(`shape.${type}`)} data-testid=${testid} draggable="true"
    onDragStart=${(e) => { e.dataTransfer.setData('application/x-diagram-shape', type); e.dataTransfer.effectAllowed = 'copy'; }}
    onClick=${() => (type === 'image' ? pickImage() : addShape(type))}>${ICON(type)}</button>`;
}

// the open libraries are remembered in this browser
function saveLibraries() { try { localStorage.setItem('suite.diagram.libraries', JSON.stringify([...app.libraries])); } catch (e) { /* storage blocked */ } }

// ---- element tree (sidebar) -------------------------------------------------------------------------------------------

/** The page as a tree for the sidebar: per layer (top first) groups and objects, the top-most first. */
function elementTree(p = page()) {
  const groups = groupsOf(p);
  const objects = [...p.shapes, ...p.edges]; // drawing order: shapes, then edges
  const z = new Map(objects.map((o, i) => [o.id, i]));
  const label = (o) => {
    if (!isEdge(o)) return (String(o.text || '').split('\n')[0].trim()) || t(`shape.${o.type}`);
    const end = (e) => (e.id && find(e.id) ? (String(find(e.id).text || '').split('\n')[0].trim() || t(`shape.${find(e.id).type}`)) : '·');
    return o.text ? String(o.text).split('\n')[0] : `${end(o.from)} → ${end(o.to)}`;
  };
  return layersOf(p).slice().reverse().map((layer) => {
    const inLayer = objects.filter((o) => layerOf(p, o).id === layer.id);
    const node = (o) => ({ kind: isEdge(o) ? 'edge' : 'shape', id: o.id, label: label(o), z: z.get(o.id), type: o.type, locked: !!o.locked });
    const build = (gid) => {
      const kids = [
        ...groups.filter((g) => (g.parent || null) === gid).map((g) => { const n = build(g.id); return n.children.length ? { kind: 'group', id: g.id, label: g.name || t('dg.groupUnnamed'), children: n.children, z: Math.max(...n.children.map((c) => c.z)) } : null; }).filter(Boolean),
        ...inLayer.filter((o) => (o.group || null) === gid || (gid === null && o.group && !groups.some((g) => g.id === o.group))).map(node),
      ];
      return { children: kids.sort((a, b) => b.z - a.z) };
    };
    const children = build(null).children;
    return { kind: 'layer', id: layer.id, label: layer.name, layer, children, z: Infinity, hidden: layer.visible === false, locked: !!layer.locked };
  });
}

/** Change the label of a tree row: the text of a shape or connector, the name of a group or layer (one undo step). */
function setLabel(it, value) {
  const p = page();
  if (it.kind === 'layer') { const l = layersOf(p).find((x) => x.id === it.id); if (l && value.trim() && value.trim() !== l.name) setLayer(l, { name: value.trim() }); return; }
  if (it.kind === 'group') { renameGroup(it.id, value.trim()); return; }
  const o = find(it.id);
  if (!o || o.text === value) return;
  record();
  o.text = value;
  changed();
}

/** Rows of the tree that are shown (collapsed layers and groups hide their children). */
function treeRows() {
  const rows = [];
  const walk = (items, depth) => { for (const it of items) { rows.push({ ...it, depth }); if (it.children && !app.collapsed.has(it.id)) walk(it.children, depth + 1); } };
  walk(elementTree(), 0);
  return rows;
}

const rowSelected = (it) => {
  if (it.kind === 'shape' || it.kind === 'edge') return app.selection.has(it.id);
  const p = page();
  const m = it.kind === 'group' ? groupMembers(p, it.id) : [...p.shapes, ...p.edges].filter((o) => layerOf(p, o).id === it.id && isSelectable(p, o));
  return m.length > 0 && m.every((o) => app.selection.has(o.id));
};

function onTreeKey(e) {
  if (e.target.closest('input, textarea')) return;
  const rows = treeRows();
  const focused = e.target.closest('[data-testid=tree-item]');
  if (focused) app.treeFocus = focused.dataset.id; // the row that has the focus (also after a click)
  const i = rows.findIndex((r) => r.id === app.treeFocus);
  const cur = rows[i];
  const focus = (r) => {
    if (!r) return;
    app.treeFocus = r.id;
    const el = document.querySelector(`[data-testid=tree-item][data-id="${r.id}"]`);
    if (el) el.focus();
    render();
  };
  const handled = () => { e.preventDefault(); e.stopPropagation(); };
  if (e.key === 'ArrowDown') { handled(); focus(rows[Math.min(rows.length - 1, i + 1)] || rows[0]); }
  else if (e.key === 'ArrowUp') { handled(); focus(rows[Math.max(0, i - 1)] || rows[0]); }
  else if (e.key === 'Home') { handled(); focus(rows[0]); }
  else if (e.key === 'End') { handled(); focus(rows[rows.length - 1]); }
  else if (e.key === 'ArrowRight' && cur && cur.children) { handled(); if (app.collapsed.has(cur.id)) { app.collapsed.delete(cur.id); render(); } else focus(rows[i + 1]); }
  else if (e.key === 'ArrowLeft' && cur) {
    handled();
    if (cur.children && !app.collapsed.has(cur.id)) { app.collapsed.add(cur.id); render(); }
    else focus(rows.slice(0, i).reverse().find((r) => r.depth === cur.depth - 1));
  } else if ((e.key === 'Enter' || e.key === ' ') && cur) { handled(); selectItems([cur], e.ctrlKey || e.metaKey ? 'toggle' : e.shiftKey ? 'add' : 'replace'); }
  else if (e.key === 'F2' && cur) { handled(); app.treeEdit = cur.id; render(); }
  else if (e.key === 'Delete' && app.selection.size) { handled(); deleteSelection(); }
}

/** The label of a row being edited: one line in an input, several lines in a text area (Enter keeps, Shift+Enter: new line). */
function TreeLabelEditor({ it }) {
  const p = page();
  const value = it.kind === 'layer' ? (layersOf(p).find((l) => l.id === it.id) || {}).name || ''
    : it.kind === 'group' ? (groupById(p, it.id) || {}).name || '' : (find(it.id) || {}).text || '';
  const multi = (it.kind === 'shape' || it.kind === 'edge') && value.includes('\n');
  let done = false;
  const finish = (el, keep) => {
    if (done) return;
    done = true;
    app.treeEdit = null;
    if (keep) setLabel(it, el.value); else render();
    requestAnimationFrame(() => { const row = document.querySelector(`[data-testid=tree-item][data-id="${it.id}"]`); if (row) row.focus(); });
  };
  const keys = (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Escape') { ev.preventDefault(); finish(ev.target, false); }
    else if (ev.key === 'Enter' && !(multi && ev.shiftKey)) { ev.preventDefault(); finish(ev.target, true); }
  };
  const props = { class: 'dg-tree-edit', 'data-testid': 'tree-edit', 'aria-label': t(it.kind === 'layer' ? 'dg.renameLayer' : it.kind === 'group' ? 'dg.renameGroup' : 'dg.editLabel'),
    defaultValue: value, autofocus: true, onClick: (ev) => ev.stopPropagation(), onDblClick: (ev) => ev.stopPropagation(), onKeyDown: keys, onBlur: (ev) => finish(ev.target, true),
    ref: (el) => { if (el && !el.dataset.focused) { el.dataset.focused = '1'; requestAnimationFrame(() => { el.focus(); el.select(); }); } } };
  return multi ? html`<textarea rows=${Math.min(6, value.split('\n').length)} ...${props}></textarea>` : html`<input ...${props} />`;
}

function Elements() {
  const tree = elementTree();
  const empty = tree.every((l) => !l.children.length) && tree.length === 1;
  const rows = treeRows();
  if (!rows.some((r) => r.id === app.treeFocus) && rows.length) app.treeFocus = rows[0].id;
  const row = (it, depth) => {
    const parent = !!it.children;
    const open = parent && !app.collapsed.has(it.id);
    const sel = rowSelected(it);
    const click = (e) => { app.treeFocus = it.id; selectItems([it], e.ctrlKey || e.metaKey ? 'toggle' : e.shiftKey ? 'add' : 'replace'); };
    const icon = it.kind === 'layer' ? '◫' : it.kind === 'group' ? '▣' : it.kind === 'edge' ? '⟶' : '▭';
    const count = it.kind === 'group' ? groupMembers(page(), it.id).length : it.kind === 'layer' ? it.children.length : null;
    const li = html`<li role="treeitem" aria-level=${depth + 1} aria-selected=${sel ? 'true' : 'false'} aria-expanded=${parent ? String(open) : null}
        tabindex=${app.treeFocus === it.id ? 0 : -1} class=${`dg-tree-row dg-tree-${it.kind}${sel ? ' selected' : ''}${it.locked ? ' locked' : ''}${it.hidden ? ' hidden' : ''}`}
        data-testid="tree-item" data-kind=${it.kind} data-id=${it.id}
        style=${`padding-left:${0.3 + depth * 0.9}rem`} onClick=${click} onDblClick=${() => { app.treeEdit = it.id; render(); }}>
      ${parent ? html`<span class="dg-tree-toggle" data-testid="tree-toggle" aria-hidden="true" onClick=${(ev) => { ev.stopPropagation(); if (open) app.collapsed.add(it.id); else app.collapsed.delete(it.id); render(); }}>${open ? '▾' : '▸'}</span>` : html`<span class="dg-tree-toggle"></span>`}
      <span class="dg-tree-icon" aria-hidden="true">${icon}</span>
      ${app.treeEdit === it.id ? html`<${TreeLabelEditor} it=${it} />` : html`<span class="dg-tree-name" data-testid="tree-name">${it.label}</span>`}
      ${count != null ? html`<small class="dg-tree-count">${count}</small>` : null}
      ${it.locked ? html`<span aria-label=${t('dg.lock')}>🔒</span>` : null}
    </li>`;
    return [li, ...(open ? it.children.flatMap((c) => row(c, depth + 1)) : [])];
  };
  return html`<div class="dg-elements" data-testid="elements">
    ${empty ? html`<p class="dg-tree-empty">${t('dg.noElements')}</p>` : html`<ul role="tree" class="dg-tree" aria-label=${t('dg.elements')} aria-multiselectable="true" onKeyDown=${onTreeKey}>
      ${tree.flatMap((l) => row(l, 0))}
    </ul>`}
    <p class="dg-tree-hint"><small>${t('dg.elementsHint')}</small></p>
  </div>`;
}

function Library() {
  const tools = [['select', '↖', 'dg.select'], ['hand', '✋', 'dg.hand'], ['edge', '⟶', 'dg.connector']];
  const tab = app.sidebar || 'shapes';
  return html`<aside class=${`dg-library${tab === 'elements' ? ' elements' : ''}`} data-testid="library">
    <div class="dg-tools">${tools.map(([id, icon, label]) => html`<button class=${app.tool === id ? '' : 'secondary outline'} title=${t(label)} aria-pressed=${app.tool === id}
      data-testid=${`tool-${id}`} onClick=${() => { app.tool = id; render(); }}>${icon}</button>`)}</div>
    <div class="dg-side-tabs" role="tablist">
      ${[['shapes', 'dg.shapesTab', '◇'], ['elements', 'dg.elements', '☰']].map(([id, label, icon]) => html`<button role="tab" aria-selected=${tab === id ? 'true' : 'false'} class=${tab === id ? '' : 'secondary outline'}
        title=${t(label)} aria-label=${t(label)} data-testid=${`sidebar-${id}`} onClick=${() => { app.sidebar = id; render(); }}>${icon}${tab === 'elements' ? html` <span>${t(label)}</span>` : null}</button>`)}
    </div>
    ${tab === 'elements' ? html`<${Elements} />` : html`<${ShapePalette} />`}
  </aside>`;
}

function ShapePalette() {
  return html`<div class="dg-palette">
    <div class="dg-shapes">${SHAPES.map((type) => shapeButton(type, `shape-${type}`))}</div>
    ${Object.entries(LIBRARIES).map(([lib, types]) => html`<details class="dg-lib" data-testid=${`library-${lib}`} open=${app.libraries.has(lib)}
        onToggle=${(e) => { if (e.target.open) app.libraries.add(lib); else app.libraries.delete(lib); saveLibraries(); }}>
      <summary>${t(`dg.lib.${lib}`)}</summary>
      <div class="dg-shapes">${types.map((type) => shapeButton(type, `shape-${lib}-${type}`))}</div></details>`)}
  </div>`;
}

function ColorField({ label, value, onChange, allowNone, testid }) {
  const none = value === 'none';
  return html`<div class="dg-color"><span>${t(label)}</span>
    <input type="color" value=${none ? '#ffffff' : value} disabled=${none} data-testid=${testid} onInput=${(e) => onChange(e.target.value)} />
    ${allowNone ? html`<label><input type="checkbox" checked=${none} data-testid=${`${testid}-none`} onChange=${(e) => onChange(e.target.checked ? 'none' : '#ffffff')} /> ${t('dg.none')}</label>` : null}</div>`;
}

function Format() {
  const shapes = selectedShapes();
  const edges = selectedEdges();
  const first = shapes[0] || edges[0];
  if (!first) {
    return html`<aside class="dg-format suite-drawer" data-testid="format"><strong>${t('dg.diagram')}</strong>
      <label><input type="checkbox" checked=${app.grid} data-testid="opt-grid" onChange=${(e) => { app.grid = e.target.checked; render(); }} /> ${t('dg.grid')}</label>
      <label><input type="checkbox" checked=${app.snap} data-testid="opt-snap" onChange=${(e) => { app.snap = e.target.checked; render(); }} /> ${t('dg.snap')}</label>
      <strong>${t('dg.autoLayout')}</strong>
      <select data-testid="auto-layout" aria-label=${t('dg.autoLayout')} onChange=${(e) => { const v = e.target.value; e.target.value = ''; if (v) autoLayout(v); }}>
        <option value="">${t('dg.autoLayout')}…</option>${['TB', 'LR', 'BT', 'RL'].map((d) => html`<option value=${d}>${t(`dg.layout${d}`)}</option>`)}</select>
      <button class="secondary outline" data-testid="mermaid" onClick=${() => { app.mermaid = { text: 'flowchart TD\n  A[Start] --> B{OK?}\n  B -->|yes| C([Done])\n  B -->|no| A' }; render(); }}>${t('dg.mermaid')}</button>
      ${lockedCount() ? html`<button class="secondary outline" data-testid="unlock-all" onClick=${unlockAll}>🔓 ${t('dg.unlockAll', lockedCount())}</button>` : null}
      <${Layers} />
    </aside>`;
  }
  const st = first.style;
  const s = shapes.length === 1 && !edges.length ? shapes[0] : null;
  const num = (label, key, obj, testid) => html`<label>${t(label)}<input type="number" key=${`${obj.id}-${key}-${Math.round(obj[key])}`} defaultValue=${Math.round(obj[key])} data-testid=${testid}
    onChange=${(e) => { record(); obj[key] = Math.max(key === 'w' || key === 'h' ? 1 : -1e6, +e.target.value || 0); changed(); }} /></label>`;
  return html`<aside class="dg-format suite-drawer" data-testid="format">
    <strong>${shapes.length + edges.length > 1 ? t('dg.selected', shapes.length + edges.length) : t('dg.style')}</strong>
    ${shapes.length ? html`
      <label>${t('dg.type')}<select data-testid="fmt-type" onChange=${(e) => setProp('type', e.target.value)}>
        ${ALL_TYPES.filter((x) => x !== 'image').map((x) => html`<option value=${x} selected=${first.type === x}>${t(`shape.${x}`)}</option>`)}</select></label>
      <${ColorField} label="dg.fill" value=${st.fill} allowNone=${true} testid="fmt-fill" onChange=${(v) => setStyle('fill', v)} />` : null}
    <${ColorField} label="dg.stroke" value=${st.stroke} allowNone=${!!shapes.length} testid="fmt-stroke" onChange=${(v) => setStyle('stroke', v)} />
    <div class="dg-row">
      <label>${t('dg.width')}<input type="number" min="0" max="20" step="0.5" value=${st.strokeWidth} data-testid="fmt-stroke-width" onInput=${(e) => setStyle('strokeWidth', +e.target.value)} /></label>
      <label class="dg-check"><input type="checkbox" checked=${st.dash} data-testid="fmt-dash" onChange=${(e) => setStyle('dash', e.target.checked)} /> ${t('dg.dashed')}</label>
    </div>
    <label>${t('dg.opacity')}: ${Math.round(st.opacity * 100)} %<input type="range" min="10" max="100" value=${Math.round(st.opacity * 100)} data-testid="fmt-opacity" onInput=${(e) => setStyle('opacity', +e.target.value / 100)} /></label>
    ${edges.length ? html`
      <label>${t('dg.route')}<select data-testid="fmt-route" onChange=${(e) => setProp('route', e.target.value)}>
        ${['straight', 'orthogonal', 'curved'].map((r) => html`<option value=${r} selected=${(edges[0].route) === r}>${t(`dg.${r}`)}</option>`)}</select></label>
      <div class="dg-row">
        <label>${t('dg.startArrow')}<select data-testid="fmt-start-arrow" onChange=${(e) => setStyle('startArrow', e.target.value)}>${ARROWS.map((a) => html`<option value=${a} selected=${edges[0].style.startArrow === a}>${a}</option>`)}</select></label>
        <label>${t('dg.endArrow')}<select data-testid="fmt-end-arrow" onChange=${(e) => setStyle('endArrow', e.target.value)}>${ARROWS.map((a) => html`<option value=${a} selected=${edges[0].style.endArrow === a}>${a}</option>`)}</select></label>
      </div>` : null}
    <strong>${t('dg.text')}</strong>
    <div class="dg-row">
      <label>${t('dg.fontSize')}<input type="number" min="4" max="200" value=${st.fontSize} data-testid="fmt-font-size" onInput=${(e) => setStyle('fontSize', Math.max(4, +e.target.value || 12))} /></label>
      <${ColorField} label="dg.fontColor" value=${st.fontColor} testid="fmt-font-color" onChange=${(v) => setStyle('fontColor', v)} />
    </div>
    ${shapes.length ? html`<div class="dg-buttons">
      <button class=${st.bold ? '' : 'secondary outline'} title=${t('dg.bold')} data-testid="fmt-bold" onClick=${() => setStyle('bold', !st.bold)}><b>B</b></button>
      <button class=${st.italic ? '' : 'secondary outline'} title=${t('dg.italic')} data-testid="fmt-italic" onClick=${() => setStyle('italic', !st.italic)}><i>I</i></button>
      ${['left', 'center', 'right'].map((a) => html`<button class=${st.align === a ? '' : 'secondary outline'} title=${t('dg.align')} data-testid=${`fmt-align-${a}`} onClick=${() => setStyle('align', a)}>${{ left: '⇤', center: '↔', right: '⇥' }[a]}</button>`)}
      ${['top', 'middle', 'bottom'].map((a) => html`<button class=${st.valign === a ? '' : 'secondary outline'} title=${t('dg.align')} data-testid=${`fmt-valign-${a}`} onClick=${() => setStyle('valign', a)}>${{ top: '⤒', middle: '↕', bottom: '⤓' }[a]}</button>`)}
    </div>` : null}
    ${s ? html`<strong>${t('dg.geometry')}</strong><div class="dg-row dg-geom">${num('X', 'x', s, 'fmt-x')}${num('Y', 'y', s, 'fmt-y')}</div><div class="dg-row dg-geom">${num('dg.width', 'w', s, 'fmt-w')}${num('H', 'h', s, 'fmt-h')}</div>` : null}
    ${shapes.length ? html`<div class="dg-row dg-rotation">
      <label>${t('dg.rotation')}<input type="number" min="-360" max="360" step="1" key=${`rot-${shapes.map((x) => x.id).join()}-${shapes[0].rotation || 0}`} defaultValue=${Math.round((shapes[0].rotation || 0) * 10) / 10}
        data-testid="fmt-rotation" onChange=${(e) => setRotation(+e.target.value || 0)} /></label>
      <button class="secondary outline" title=${t('dg.rotateLeft')} aria-label=${t('dg.rotateLeft')} data-testid="rotate-left" onClick=${() => rotateSelection(-90)}>⟲</button>
      <button class="secondary outline" title=${t('dg.rotateRight')} aria-label=${t('dg.rotateRight')} data-testid="rotate-right" onClick=${() => rotateSelection(90)}>⟳</button>
    </div>` : null}
    <strong>${t('dg.arrange')}</strong>
    <div class="dg-buttons">
      <button class="secondary outline" data-testid="to-front" onClick=${() => reorder(true)}>${t('dg.toFront')}</button>
      <button class="secondary outline" data-testid="to-back" onClick=${() => reorder(false)}>${t('dg.toBack')}</button>
      <button class="secondary outline" data-testid="duplicate" onClick=${duplicate}>${t('dg.duplicate')}</button>
      <button class="secondary outline" data-testid="delete" onClick=${deleteSelection}>${t('dg.delete')}</button>
      ${shapes.length + edges.length > 1 ? html`<button class="secondary outline" data-testid="group" onClick=${group}>${t('dg.group').replace(/ \(.*/, '')}</button>` : null}
      ${[...shapes, ...edges].some((o) => o.group) ? html`<button class="secondary outline" data-testid="ungroup" onClick=${ungroup}>${t('dg.ungroup').replace(/ \(.*/, '')}</button>` : null}
      <button class="secondary outline" data-testid="lock" onClick=${lockSelection}>🔒 ${t('dg.lock').replace(/ \(.*/, '')}</button>
    </div>
    ${layersOf(page()).length > 1 ? html`<label>${t('dg.moveToLayer')}<select data-testid="move-to-layer" onChange=${(e) => moveToLayer(e.target.value)}>
      ${layersOf(page()).map((l) => html`<option value=${l.id} selected=${layerOf(page(), first).id === l.id}>${l.name}</option>`)}</select></label>` : null}
    ${shapes.length > 1 ? html`<select data-testid="auto-layout" aria-label=${t('dg.autoLayout')} onChange=${(e) => { const v = e.target.value; e.target.value = ''; if (v) autoLayout(v); }}>
      <option value="">${t('dg.autoLayout')}…</option>${['TB', 'LR', 'BT', 'RL'].map((d) => html`<option value=${d}>${t(`dg.layout${d}`)}</option>`)}</select>` : null}
    ${shapes.length > 1 ? html`<div class="dg-buttons">
      ${[['left', '⇤'], ['center', '↔'], ['right', '⇥'], ['top', '⤒'], ['middle', '↕'], ['bottom', '⤓']].map(([k, icon]) => html`<button class="secondary outline" title=${t(`dg.align${k[0].toUpperCase()}${k.slice(1)}`)} data-testid=${`align-${k}`} onClick=${() => align(k)}>${icon}</button>`)}
      ${shapes.length > 2 ? html`<button class="secondary outline" title=${t('dg.distH')} data-testid="dist-h" onClick=${() => distribute(true)}>⟷</button>
        <button class="secondary outline" title=${t('dg.distV')} data-testid="dist-v" onClick=${() => distribute(false)}>↕︎</button>` : null}
    </div>` : null}
  </aside>`;
}

const lockedCount = () => [...page().shapes, ...page().edges].filter((o) => o.locked).length;

/** Layers of the page, top layer first (as in draw.io). */
function Layers() {
  const p = page();
  const ls = layersOf(p);
  const active = activeLayer(p);
  return html`<details class="dg-layers" open data-testid="layers"><summary><strong>${t('dg.layers')}</strong></summary>
    <ul>${ls.slice().reverse().map((l) => html`<li data-testid="layer" class=${l === active ? 'active' : ''}>
      <input type="radio" name="dg-active-layer" title=${t('dg.layerActive')} data-testid="layer-active" checked=${l === active} onChange=${() => { p.activeLayer = l.id; render(); }} />
      ${app.renamingLayer === l.id
        ? html`<input class="dg-layer-name" defaultValue=${l.name} data-testid="layer-name-input" autofocus
            onKeyDown=${(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { app.renamingLayer = null; render(); } }}
            onBlur=${(e) => { if (app.renamingLayer !== l.id) return; app.renamingLayer = null; if (e.target.value && e.target.value !== l.name) setLayer(l, { name: e.target.value }); else render(); }} />`
        : html`<span class="dg-layer-name" data-testid="layer-name" onDblClick=${() => { app.renamingLayer = l.id; render(); }}>${l.name}</span>`}
      <button class=${l.visible === false ? 'secondary outline' : 'secondary'} title=${t('dg.layerVisible')} aria-pressed=${l.visible !== false} data-testid="layer-visible" onClick=${() => setLayer(l, { visible: l.visible === false })}>👁</button>
      <button class=${l.locked ? 'secondary' : 'secondary outline'} title=${t('dg.layerLocked')} aria-pressed=${!!l.locked} data-testid="layer-locked" onClick=${() => setLayer(l, { locked: !l.locked })}>🔒</button>
      <button class="secondary outline" title=${t('dg.layerUp')} data-testid="layer-up" disabled=${l === ls[ls.length - 1]} onClick=${() => moveLayer(l, 1)}>▲</button>
      <button class="secondary outline" title=${t('dg.layerDown')} data-testid="layer-down" disabled=${l === ls[0]} onClick=${() => moveLayer(l, -1)}>▼</button>
      ${ls.length > 1 ? html`<button class="secondary outline" title=${t('dg.deleteLayer')} data-testid="layer-delete" onClick=${() => deleteLayer(l)}>×</button>` : null}
    </li>`)}</ul>
    <button class="secondary outline" data-testid="add-layer" onClick=${addLayer}>+ ${t('dg.addLayer')}</button>
  </details>`;
}

function Pages() {
  return html`<nav class="dg-pages" data-testid="pages">
    ${app.doc.pages.map((p, i) => (app.renamingPage === i
      ? html`<input class="dg-page-name" defaultValue=${p.name} data-testid="page-name-input" autofocus
          onKeyDown=${(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { app.renamingPage = null; render(); } }}
          onBlur=${(e) => { if (app.renamingPage !== i) return; app.renamingPage = null; if (e.target.value && e.target.value !== p.name) { record(); p.name = e.target.value; changed(); } else render(); }} />`
      : html`<button class=${i === app.doc.page ? '' : 'secondary outline'} data-testid="page" onClick=${() => goPage(i)} onDblClick=${() => { app.renamingPage = i; render(); }}>
          <span data-testid="page-name">${p.name}</span>${app.doc.pages.length > 1 && i === app.doc.page ? html`<span class="dg-page-x" title=${t('dg.deletePage')} data-testid="delete-page" onClick=${(e) => { e.stopPropagation(); deletePage(i); }}>×</span>` : null}</button>`))}
    <button class="secondary outline" title=${t('dg.addPage')} data-testid="add-page" onClick=${addPage}>+</button>
    <span class="dg-zoom">
      <button class="secondary outline" data-testid="zoom-out" onClick=${() => setZoom(app.view.zoom / 1.2)}>−</button>
      <span data-testid="zoom">${Math.round(app.view.zoom * 100)} %</span>
      <button class="secondary outline" data-testid="zoom-in" onClick=${() => setZoom(app.view.zoom * 1.2)}>+</button>
      <button class="secondary outline" data-testid="zoom-fit" onClick=${fit}>${t('dg.fit')}</button>
    </span>
  </nav>`;
}

function Toolbar() {
  return html`<nav class="dg-toolbar" role="toolbar">
    <button class="secondary" data-testid="new" onClick=${newDiagram}>${t('dg.new')}</button>
    <button class="secondary" data-testid="open" onClick=${openDiagram}>${t('dg.open')}</button>
    <${Suite.shell.Recent} app=${APP} before=${() => !app.dirty || Suite.shell.confirm(t('dg.discard'))} onOpen=${(p) => openPicked(p)} />
    <button class=${app.dirty ? '' : 'secondary'} data-testid="save" onClick=${() => save()}>${t('dg.save')}</button>
    <button class="secondary outline" data-testid="save-as" onClick=${() => save(true)}>${t('dg.saveAs')}</button>
    <button class="secondary outline" data-testid="export-svg" onClick=${exportSvg}>SVG</button>
    <button class="secondary outline" data-testid="export-png" onClick=${() => exportPng()}>PNG</button>
    <button class="secondary outline" data-testid="print" title=${t('dg.print')} onClick=${printDiagram}>🖨</button>
    <span class="dg-sep"></span>
    <button class="secondary outline" title="${t('dg.undo')} (Ctrl+Z)" data-testid="undo" onClick=${undo}>↶</button>
    <button class="secondary outline" title="${t('dg.redo')} (Ctrl+Y)" data-testid="redo" onClick=${redo}>↷</button>
    <button class="secondary outline dg-panels-toggle" data-testid="toggle-panels" onClick=${() => { app.panels = !app.panels; render(); }}>☰ ${t('dg.panels')}</button>
  </nav>`;
}

function Main() {
  Suite.shell.setFileName(`${app.name}${app.dirty ? ' •' : ''}`);
  return html`<div class=${`dg-layout ${app.panels ? 'panels-open' : ''}`}><${Library} /><${Canvas} /><${Format} /><${Pages} /><${MermaidDialog} />${app.panels ? Suite.shell.backdrop(() => { app.panels = false; render(); }) : null}</div>`;
}

Suite.shell.mount({ id: APP, title: 'app.title', version: '%%BUILD_VERSION%%', toolbar: () => html`<${Toolbar} />`, main: () => html`<${Main} />` });

// dropped diagrams (also PNG/SVG with an embedded diagram) are opened, other images are inserted
Suite.files.dropZone(document.body, async (picked) => {
  for (const p of picked) {
    let doc = null;
    if (/\.(drawio|xml|excalidraw|json|svg|png)$/i.test(p.file.name)) doc = await parseFile(p.file).catch(() => null);
    if (doc) {
      if (app.dirty && !(await Suite.shell.confirm(t('dg.discard')))) return;
      await openPicked(p);
      return;
    }
    if (/^image\//.test(p.file.type)) await insertImage(p.file).catch(fail);
  }
});

document.addEventListener('keydown', (e) => {
  if (app.editing) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) && !['checkbox', 'range', 'color'].includes(document.activeElement.type)) return;
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  const run = (fn) => { e.preventDefault(); Promise.resolve(fn()).catch(fail); };
  if (mod) {
    const map = { z: e.shiftKey ? redo : undo, y: redo, s: () => save(e.shiftKey), o: openDiagram, a: selectAll, d: duplicate,
      g: e.shiftKey ? ungroup : group, l: e.shiftKey ? unlockAll : lockSelection, ']': () => reorder(true), '[': () => reorder(false), '0': fit, '+': () => setZoom(app.view.zoom * 1.2), '=': () => setZoom(app.view.zoom * 1.2), '-': () => setZoom(app.view.zoom / 1.2) };
    if (map[k]) run(map[k]);
    return; // Ctrl+C/X/V go through the copy, cut and paste events
  }
  if (e.key === ' ' && !spaceDown) { spaceDown = true; e.preventDefault(); render(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { run(deleteSelection); return; }
  if (e.key === 'Escape') { app.selection = new Set(); app.drag = null; app.tool = 'select'; render(); return; }
  if ((e.key === 'F2' || e.key === 'Enter') && app.selection.size === 1) { run(() => startEditing([...app.selection][0])); return; }
  if (e.key.startsWith('Arrow') && app.selection.size) {
    const step = e.shiftKey ? GRID : 1;
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    record('nudge');
    for (const s of selectedShapes()) { s.x += dx; s.y += dy; }
    for (const ed of selectedEdges()) for (const end of [ed.from, ed.to, ...(ed.waypoints || [])]) if (!end.id) { end.x += dx; end.y += dy; }
    run(changed);
    return;
  }
  const tools = { v: 'select', h: 'hand', a: 'edge', l: 'edge', t: 'text', r: 'shape:rect', o: 'shape:ellipse', d: 'shape:diamond', n: 'shape:note' };
  if (tools[k]) { app.tool = tools[k]; render(); }
});
document.addEventListener('keyup', (e) => { if (e.key === ' ') { spaceDown = false; render(); } });

Suite.files.recent(APP);

Suite.bridge.receive((picked) => openPicked(picked), { app: 'diagram' }); // files opened from other apps ("Open with…")

// for tests
window.DG = { app, page, setDoc, readDrawio, writeDrawio, exportSvgText, render, parseMermaid, autoLayout, group, ungroup, lockSelection, unlockAll, rotateSelection, setRotation, selectItems, readExcalidraw };
document.body.dataset.ready = 'true';
