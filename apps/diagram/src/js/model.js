/*
 * Diagram model: pages with shapes (vertices) and edges, geometry (outlines, connection points, routing, arrow heads),
 * text layout and an undo history of document snapshots.
 *
 * shape: { id, type, x, y, w, h, text, style: { fill, stroke, strokeWidth, dash, opacity, fontSize, fontColor, bold, italic,
 *          align, valign, rounded, image }, extra: unknown draw.io style keys (kept for round trips) }
 * edge:  { id, from: { id?, x?, y?, ax?, ay? }, to: {...}, waypoints?: [{ x, y }] (draw.io routing points), text, route: 'straight'|'orthogonal'|'curved',
 *          style: { stroke, strokeWidth, dash, startArrow, endArrow, fontSize, fontColor, opacity }, extra }
 * Shapes and edges may also have layer (id of a page layer; missing = the first one), group (the id of the group they belong to
 * directly) and locked (not selectable); shapes may have rotation (degrees, clockwise around the centre).
 * page.layers: [{ id, name, visible, locked }], bottom first. page.groups: [{ id, name, parent }] – groups can contain groups
 * (parent: the enclosing group); a group id without an entry is an unnamed top-level group (older documents).
 */

export const SHAPES = ['rect', 'rounded', 'ellipse', 'diamond', 'terminator', 'parallelogram', 'hexagon', 'triangle', 'cylinder', 'document', 'note', 'cloud', 'actor', 'text', 'image'];
/** Further shape libraries (the general one is SHAPES). */
export const LIBRARIES = {
  uml: ['class', 'package', 'component', 'actor', 'ellipse', 'note'],
  bpmn: ['rounded', 'event-start', 'event-intermediate', 'event-end', 'gateway', 'pool', 'document', 'cylinder'],
  network: ['server', 'computer', 'firewall', 'router', 'cloud', 'cylinder'],
  er: ['entity', 'diamond', 'ellipse'],
};
export const ALL_TYPES = [...new Set([...SHAPES, ...Object.values(LIBRARIES).flat()])];
/** Shapes whose label is drawn below them (icons). */
export const LABEL_BELOW = new Set(['actor', 'image', 'server', 'computer', 'firewall', 'router']);
/** Shapes with a title compartment: the first text line is the title, a line "--" draws a separator. */
export const COMPARTMENTS = new Set(['class', 'entity']);
export const ARROWS = ['none', 'classic', 'open', 'block-open', 'diamond', 'diamond-open', 'oval', 'er-one', 'er-mand-one', 'er-many', 'er-one-many', 'er-zero-one', 'er-zero-many'];
/** Default size and text of the library shapes. */
export const PRESETS = {
  class: { w: 160, h: 90, text: 'Class\n+ field: Type\n--\n+ method(): Type' }, entity: { w: 140, h: 90, text: 'Entity\nid\nname' },
  package: { w: 120, h: 80, text: 'Package' }, component: { w: 140, h: 60, text: 'Component' },
  'event-start': { w: 40, h: 40 }, 'event-intermediate': { w: 40, h: 40 }, 'event-end': { w: 40, h: 40, style: { strokeWidth: 3 } },
  gateway: { w: 50, h: 50 }, pool: { w: 480, h: 160, text: 'Pool' },
  server: { w: 40, h: 60 }, computer: { w: 60, h: 50 }, firewall: { w: 60, h: 50 }, router: { w: 60, h: 36 },
};
export const DEFAULT_STYLE = { fill: '#ffffff', stroke: '#000000', strokeWidth: 1, dash: false, opacity: 1, fontSize: 12, fontColor: '#000000', bold: false, italic: false, align: 'center', valign: 'middle' };
export const DEFAULT_EDGE_STYLE = { stroke: '#000000', strokeWidth: 1, dash: false, startArrow: 'none', endArrow: 'classic', fontSize: 11, fontColor: '#000000', opacity: 1 };
export const FONT = 'Helvetica, Arial, sans-serif';

let counter = 0;
export const newId = () => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function newPage(name = 'Page-1') { return { id: newId(), name, shapes: [], edges: [], layers: [newLayer('Background')] }; }
export const newLayer = (name) => ({ id: newId(), name, visible: true, locked: false });

/** The layers of a page (a default layer is added to pages without one). */
export function layersOf(page) {
  if (!page.layers || !page.layers.length) page.layers = [newLayer('Background')];
  return page.layers;
}
/** The layer of a shape or edge (objects without a known layer belong to the first one). */
export const layerOf = (page, o) => { const ls = layersOf(page); return ls.find((l) => l.id === o.layer) || ls[0]; };
export const isShown = (page, o) => layerOf(page, o).visible !== false;
/** Can the user select it? Hidden layers, locked layers and locked objects cannot be selected. */
export const isSelectable = (page, o) => isShown(page, o) && !o.locked && !layerOf(page, o).locked;
/** Shown objects of a list, in layer order (bottom layer first), keeping the order within a layer. */
export function inLayerOrder(page, list) {
  const index = new Map(layersOf(page).map((l, i) => [l.id, i]));
  return list.filter((o) => isShown(page, o)).map((o, i) => [o, i, index.get(layerOf(page, o).id)]).sort((a, b) => a[2] - b[2] || a[1] - b[1]).map(([o]) => o);
}
export function newDoc() { return { pages: [newPage()], page: 0 }; }

// ---- groups ------------------------------------------------------------------------------------------------

/** The groups of a page: an entry for every group that has members (entries of empty groups are removed). */
export function groupsOf(page) {
  if (!page.groups) page.groups = [];
  const byId = new Map(page.groups.map((g) => [g.id, g]));
  for (const o of [...page.shapes, ...page.edges]) if (o.group && !byId.has(o.group)) { const g = { id: o.group, name: '' }; page.groups.push(g); byId.set(g.id, g); }
  for (const g of page.groups) if (g.parent && (!byId.has(g.parent) || g.parent === g.id)) delete g.parent;
  // a group is used if an object or a used group is in it
  const used = new Set();
  const mark = (id) => { for (let cur = id, n = 0; cur && !used.has(cur) && n < 1000; n++) { used.add(cur); cur = byId.get(cur) && byId.get(cur).parent; } };
  for (const o of [...page.shapes, ...page.edges]) if (o.group) mark(o.group);
  if (used.size !== page.groups.length) page.groups = page.groups.filter((g) => used.has(g.id));
  return page.groups;
}
export const groupById = (page, id) => groupsOf(page).find((g) => g.id === id) || null;

/** The groups an object (or a group, by id) is in, innermost first. */
export function ancestors(page, o) {
  const byId = new Map(groupsOf(page).map((g) => [g.id, g]));
  const out = [];
  for (let cur = typeof o === 'string' ? (byId.get(o) || {}).parent : o.group, n = 0; cur && byId.has(cur) && n < 1000; n++) { out.push(cur); cur = byId.get(cur).parent; }
  return out;
}

/** All objects (shapes and edges) in a group, also in its sub-groups. */
export function groupMembers(page, id) {
  return [...page.shapes, ...page.edges].filter((o) => o.group && (o.group === id || ancestors(page, o).includes(id)));
}

// ---- rotation ------------------------------------------------------------------------------------------------

/** Rotate p around c by deg (clockwise in screen coordinates). */
export function rotatePoint(p, c, deg) {
  if (!deg) return { x: p.x, y: p.y };
  const r = (deg * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
  const dx = p.x - c.x, dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}
export const normalizeAngle = (deg) => { const a = ((Math.round(deg * 100) / 100) % 360 + 360) % 360; return a > 180 ? a - 360 : a; };
/** A point of the shape given relative to its box (0..1), with the rotation applied. */
export const shapePoint = (s, ax, ay) => rotatePoint({ x: s.x + ax * s.w, y: s.y + ay * s.h }, { x: s.x + s.w / 2, y: s.y + s.h / 2 }, s.rotation);
/** Is p inside the (rotated) box of s? */
export function containsPoint(s, p) {
  const q = rotatePoint(p, { x: s.x + s.w / 2, y: s.y + s.h / 2 }, -(s.rotation || 0));
  return q.x >= s.x && q.x <= s.x + s.w && q.y >= s.y && q.y <= s.y + s.h;
}
/** Axis-aligned bounding box of a (rotated) shape. */
export function shapeBounds(s) {
  if (!s.rotation) return { x: s.x, y: s.y, w: s.w, h: s.h };
  const pts = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([ax, ay]) => shapePoint(s, ax, ay));
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

export function makeShape(type, x, y, w = 120, h = 60, props = {}) {
  const style = { ...DEFAULT_STYLE, ...((PRESETS[type] && PRESETS[type].style) || {}) };
  if (type === 'text') Object.assign(style, { fill: 'none', stroke: 'none' });
  if (type === 'note') Object.assign(style, { fill: '#fff2cc', stroke: '#d6b656' });
  if (type === 'image') Object.assign(style, { fill: 'none', stroke: 'none' });
  if (type === 'actor') { w = Math.min(w, 30); h = Math.max(h, 60); }
  return { id: newId(), type, x, y, w, h, text: '', style: { ...style, ...(props.style || {}) }, extra: {}, ...props, ...(props.style ? { style: { ...style, ...props.style } } : {}) };
}

export function makeEdge(from, to, props = {}) {
  return { id: newId(), from, to, text: '', route: 'orthogonal', style: { ...DEFAULT_EDGE_STYLE, ...(props.style || {}) }, extra: {}, ...props, style: { ...DEFAULT_EDGE_STYLE, ...(props.style || {}) } };
}

// ---- outlines ----------------------------------------------------------------------------------------

/** SVG path of a shape in local coordinates (0..w, 0..h). */
export function shapePath(s) {
  const { w, h } = s;
  switch (s.type) {
    case 'ellipse': case 'cloud-base':
      return `M0,${h / 2}A${w / 2},${h / 2} 0 1,0 ${w},${h / 2}A${w / 2},${h / 2} 0 1,0 0,${h / 2}Z`;
    case 'diamond': return `M${w / 2},0L${w},${h / 2}L${w / 2},${h}L0,${h / 2}Z`;
    case 'parallelogram': { const d = Math.min(w * 0.2, 20); return `M${d},0L${w},0L${w - d},${h}L0,${h}Z`; }
    case 'hexagon': { const d = Math.min(w * 0.25, 20); return `M${d},0L${w - d},0L${w},${h / 2}L${w - d},${h}L${d},${h}L0,${h / 2}Z`; }
    case 'triangle': return `M0,0L${w},${h / 2}L0,${h}Z`;
    case 'rounded': case 'terminator': {
      const r = s.type === 'terminator' ? Math.min(w, h) / 2 : Math.min(w, h) * 0.15;
      return `M${r},0H${w - r}A${r},${r} 0 0,1 ${w},${r}V${h - r}A${r},${r} 0 0,1 ${w - r},${h}H${r}A${r},${r} 0 0,1 0,${h - r}V${r}A${r},${r} 0 0,1 ${r},0Z`;
    }
    case 'cylinder': { const e = Math.min(h * 0.15, 15); return `M0,${e}A${w / 2},${e} 0 0,1 ${w},${e}V${h - e}A${w / 2},${e} 0 0,1 0,${h - e}ZM0,${e}A${w / 2},${e} 0 0,0 ${w},${e}`; }
    case 'document': { const e = h * 0.12; return `M0,0H${w}V${h - e}C${w * 0.75},${h - e * 3} ${w * 0.25},${h + e} 0,${h - e}Z`; }
    case 'note': { const f = Math.min(w, h, 20) * 0.75; return `M0,0H${w - f}L${w},${f}V${h}H0ZM${w - f},0V${f}H${w}`; }
    case 'cloud': return `M${w * 0.25},${h * 0.8}C${w * 0.02},${h * 0.8} 0,${h * 0.45} ${w * 0.2},${h * 0.4}C${w * 0.15},${h * 0.1} ${w * 0.45},0 ${w * 0.55},${h * 0.2}C${w * 0.65},${h * 0.02} ${w * 0.9},${h * 0.1} ${w * 0.85},${h * 0.35}C${w * 1.02},${h * 0.4} ${w * 1.02},${h * 0.8} ${w * 0.78},${h * 0.8}Z`;
    case 'actor': {
      const r = Math.min(w, h) * 0.25;
      return `M${w / 2 - r},${r}A${r},${r} 0 1,1 ${w / 2 + r},${r}A${r},${r} 0 1,1 ${w / 2 - r},${r}ZM${w / 2},${r * 2}V${h * 0.7}M0,${h * 0.4}H${w}M${w / 2},${h * 0.7}L0,${h}M${w / 2},${h * 0.7}L${w},${h}`;
    }
    case 'class': case 'entity': { const hd = Math.min(26, h); return `M0,0H${w}V${h}H0ZM0,${hd}H${w}`; }
    case 'package': { const tw = Math.min(w * 0.4, 60), t = Math.min(14, h / 3); return `M0,${t}H${w}V${h}H0ZM0,${t}V0H${tw}L${tw + 6},${t}`; }
    case 'component': { const y1 = h * 0.22, y2 = h * 0.58, b = Math.min(10, h * 0.2); return `M10,0H${w}V${h}H10ZM0,${y1}H20V${y1 + b}H0ZM0,${y2}H20V${y2 + b}H0Z`; }
    case 'event-start': case 'event-end': return `M0,${h / 2}A${w / 2},${h / 2} 0 1,0 ${w},${h / 2}A${w / 2},${h / 2} 0 1,0 0,${h / 2}Z`;
    case 'event-intermediate': {
      const i = Math.min(w, h) * 0.1;
      return `M0,${h / 2}A${w / 2},${h / 2} 0 1,0 ${w},${h / 2}A${w / 2},${h / 2} 0 1,0 0,${h / 2}ZM${i},${h / 2}A${w / 2 - i},${h / 2 - i} 0 1,0 ${w - i},${h / 2}A${w / 2 - i},${h / 2 - i} 0 1,0 ${i},${h / 2}Z`;
    }
    case 'gateway': return `M${w / 2},0L${w},${h / 2}L${w / 2},${h}L0,${h / 2}ZM${w * 0.35},${h * 0.35}L${w * 0.65},${h * 0.65}M${w * 0.65},${h * 0.35}L${w * 0.35},${h * 0.65}`;
    case 'pool': return `M0,0H${w}V${h}H0ZM30,0V${h}`;
    case 'server': return `M${w * 0.15},0H${w * 0.85}V${h}H${w * 0.15}ZM${w * 0.3},${h * 0.15}H${w * 0.7}M${w * 0.3},${h * 0.27}H${w * 0.7}M${w * 0.3},${h * 0.39}H${w * 0.7}M${w * 0.45},${h * 0.8}H${w * 0.55}`;
    case 'computer': return `M0,0H${w}V${h * 0.68}H0ZM${w * 0.08},${h * 0.08}H${w * 0.92}V${h * 0.6}H${w * 0.08}ZM${w * 0.42},${h * 0.68}V${h * 0.85}M${w * 0.58},${h * 0.68}V${h * 0.85}M${w * 0.22},${h * 0.85}H${w * 0.78}V${h}H${w * 0.22}Z`;
    case 'firewall': {
      const rows = [0.25, 0.5, 0.75].map((f) => `M0,${h * f}H${w}`).join('');
      const joints = [[0, 0.25, 0.5], [0.25, 0.5, 0.25], [0.5, 0.75, 0.5], [0.75, 1, 0.25]].map(([a, b, x]) => `M${w * x},${h * a}V${h * b}M${w * (x + 0.5 > 1 ? x - 0.5 : x + 0.5)},${h * a}V${h * b}`).join('');
      return `M0,0H${w}V${h}H0Z${rows}${joints}`;
    }
    case 'router': {
      const e = h * 0.3;
      return `M0,${e}A${w / 2},${e} 0 0,1 ${w},${e}V${h - e}A${w / 2},${e} 0 0,1 0,${h - e}ZM0,${e}A${w / 2},${e} 0 0,0 ${w},${e}M${w * 0.3},${e}L${w * 0.7},${e}M${w * 0.62},${e - e * 0.35}L${w * 0.7},${e}L${w * 0.62},${e + e * 0.35}`;
    }
    default: return `M0,0H${w}V${h}H0Z`;
  }
}

/** Outline polygon (absolute coordinates) used to find where edges meet the shape. */
function outline(s) {
  const pts = outlineUnrotated(s);
  return s.rotation ? pts.map((p) => rotatePoint(p, center(s), s.rotation)) : pts;
}

function outlineUnrotated(s) {
  const { x, y, w, h } = s;
  const poly = (pts) => pts.map(([px, py]) => ({ x: x + px * w, y: y + py * h }));
  if (s.type === 'ellipse' || s.type === 'cloud' || s.type.startsWith('event-')) return Array.from({ length: 48 }, (_, i) => ({ x: x + w / 2 + (w / 2) * Math.cos((i / 48) * Math.PI * 2), y: y + h / 2 + (h / 2) * Math.sin((i / 48) * Math.PI * 2) }));
  if (s.type === 'diamond' || s.type === 'gateway') return poly([[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]);
  if (s.type === 'triangle') return poly([[0, 0], [1, 0.5], [0, 1]]);
  if (s.type === 'hexagon') { const d = Math.min(w * 0.25, 20) / w; return poly([[d, 0], [1 - d, 0], [1, 0.5], [1 - d, 1], [d, 1], [0, 0.5]]); }
  if (s.type === 'parallelogram') { const d = Math.min(w * 0.2, 20) / w; return poly([[d, 0], [1, 0], [1 - d, 1], [0, 1]]); }
  return poly([[0, 0], [1, 0], [1, 1], [0, 1]]);
}

const center = (s) => ({ x: s.x + s.w / 2, y: s.y + s.h / 2 });

/** Point where the line from the shape's centre towards p leaves the outline. */
export function boundaryPoint(s, p) {
  const c = center(s);
  if (Math.abs(p.x - c.x) < 1e-6 && Math.abs(p.y - c.y) < 1e-6) return c;
  const pts = outline(s);
  let best = null;
  const far = { x: c.x + (p.x - c.x) * 1e4, y: c.y + (p.y - c.y) * 1e4 };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const hit = intersect(c, far, a, b);
    if (hit && (!best || hit.t < best.t)) best = hit;
  }
  return best ? { x: best.x, y: best.y } : c;
}

function intersect(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  if (t < 0 || u < 0 || u > 1) return null;
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y), t };
}

/** Fixed connection points (relative): the side midpoints. */
export const PORTS = [{ ax: 0.5, ay: 0 }, { ax: 1, ay: 0.5 }, { ax: 0.5, ay: 1 }, { ax: 0, ay: 0.5 }];

// ---- edges ---------------------------------------------------------------------------------------------

/** Direction leaving a shape at a fixed anchor (unit vector; rotated shapes: the nearest axis), or null for floating ends. */
function anchorDir(end, s) {
  if (end.ax == null) return null;
  let d = null;
  if (end.ax <= 0) d = { x: -1, y: 0 };
  else if (end.ax >= 1) d = { x: 1, y: 0 };
  else if (end.ay <= 0) d = { x: 0, y: -1 };
  else if (end.ay >= 1) d = { x: 0, y: 1 };
  if (!d || !s || !s.rotation) return d;
  const r = rotatePoint(d, { x: 0, y: 0 }, s.rotation);
  return Math.abs(r.x) >= Math.abs(r.y) ? { x: Math.sign(r.x), y: 0 } : { x: 0, y: Math.sign(r.y) };
}

/** Resolve both ends of an edge to points (and exit directions). */
export function edgeEnds(edge, shapeById) {
  const fromShape = edge.from.id ? shapeById.get(edge.from.id) : null;
  const toShape = edge.to.id ? shapeById.get(edge.to.id) : null;
  const fixed = (end, s) => (s && end.ax != null ? shapePoint(s, end.ax, end.ay) : null);
  const fromFixed = fixed(edge.from, fromShape);
  const toFixed = fixed(edge.to, toShape);
  const aim = (s, end) => (s ? fixed(end, s) || center(s) : { x: end.x, y: end.y });
  const fromTarget = aim(toShape, edge.to);
  const toTarget = aim(fromShape, edge.from);
  let a = fromFixed || (fromShape ? boundaryPoint(fromShape, edge.route === 'orthogonal' ? orthoAim(fromShape, fromTarget) : fromTarget) : { x: edge.from.x, y: edge.from.y });
  let b = toFixed || (toShape ? boundaryPoint(toShape, edge.route === 'orthogonal' ? orthoAim(toShape, toTarget) : toTarget) : { x: edge.to.x, y: edge.to.y });
  return { a, b, da: fromShape ? anchorDir(edge.from, fromShape) : null, db: toShape ? anchorDir(edge.to, toShape) : null, fromShape, toShape };
}

/** For orthogonal edges, floating ends leave the shape at the side facing the other end. */
function orthoAim(s, target) {
  const c = center(s);
  const dx = target.x - c.x, dy = target.y - c.y;
  if (Math.abs(dx) * s.h >= Math.abs(dy) * s.w) return { x: c.x + Math.sign(dx || 1), y: c.y };
  return { x: c.x, y: c.y + Math.sign(dy || 1) };
}

/** Polyline (or bezier control points) of an edge. Returns { points, curve } in absolute coordinates. */
export function edgeGeometry(edge, shapeById) {
  const { a, b, da, db } = edgeEnds(edge, shapeById);
  if (edge.route === 'curved') {
    const dist = Math.hypot(b.x - a.x, b.y - a.y) * 0.4;
    const dirA = da || unit(b.x - a.x, b.y - a.y);
    const dirB = db || unit(a.x - b.x, a.y - b.y);
    return { points: [a, { x: a.x + dirA.x * dist, y: a.y + dirA.y * dist }, { x: b.x + dirB.x * dist, y: b.y + dirB.y * dist }, b], curve: true };
  }
  if (edge.waypoints && edge.waypoints.length) {
    // through the routing points (orthogonal: with an elbow between points that are not in line)
    const via = [a, ...edge.waypoints, b];
    if (edge.route !== 'orthogonal') return { points: via, curve: false };
    const pts = [a];
    for (let i = 1; i < via.length; i++) {
      const p = pts[pts.length - 1], q = via[i];
      if (Math.abs(p.x - q.x) >= 0.5 && Math.abs(p.y - q.y) >= 0.5) pts.push(i === 1 && da && da.x === 0 ? { x: p.x, y: q.y } : { x: q.x, y: p.y });
      pts.push(q);
    }
    return { points: pts, curve: false };
  }
  if (edge.route !== 'orthogonal') return { points: [a, b], curve: false };
  const horizontalA = da ? da.x !== 0 : Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const horizontalB = db ? db.x !== 0 : horizontalA;
  let pts;
  if (Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5) pts = [a, b];
  else if (horizontalA && horizontalB) { const mx = (a.x + b.x) / 2; pts = [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b]; }
  else if (!horizontalA && !horizontalB) { const my = (a.y + b.y) / 2; pts = [a, { x: a.x, y: my }, { x: b.x, y: my }, b]; }
  else if (horizontalA) pts = [a, { x: b.x, y: a.y }, b];
  else pts = [a, { x: a.x, y: b.y }, b];
  return { points: pts, curve: false };
}

function unit(x, y) { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; }

export function edgePathD({ points, curve }) {
  if (curve) { const [a, c1, c2, b] = points; return `M${a.x},${a.y}C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}`; }
  return points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join('');
}

/** Midpoint along the edge (for labels). */
export function edgeMidpoint({ points, curve }) {
  if (curve) {
    const [a, c1, c2, b] = points;
    const t = 0.5, m = 1 - t;
    return { x: m * m * m * a.x + 3 * m * m * t * c1.x + 3 * m * t * t * c2.x + t * t * t * b.x, y: m * m * m * a.y + 3 * m * m * t * c1.y + 3 * m * t * t * c2.y + t * t * t * b.y };
  }
  const lens = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  let half = lens.reduce((x, y) => x + y, 0) / 2;
  for (let i = 0; i < lens.length; i++) {
    if (half <= lens[i]) { const k = lens[i] ? half / lens[i] : 0; return { x: points[i].x + (points[i + 1].x - points[i].x) * k, y: points[i].y + (points[i + 1].y - points[i].y) * k }; }
    half -= lens[i];
  }
  return points[0];
}

/** Arrow head path at tip, pointing in direction (from -> tip). */
export function arrowPath(kind, tip, from, size) {
  if (!kind || kind === 'none') return null;
  const d = unit(tip.x - from.x, tip.y - from.y);
  const n = { x: -d.y, y: d.x };
  const len = size * 1.5 + 6, wid = size * 0.6 + 3;
  const back = { x: tip.x - d.x * len, y: tip.y - d.y * len };
  const l = { x: back.x + n.x * wid, y: back.y + n.y * wid };
  const r = { x: back.x - n.x * wid, y: back.y - n.y * wid };
  if (kind === 'open') return { d: `M${l.x},${l.y}L${tip.x},${tip.y}L${r.x},${r.y}`, fill: false };
  if (kind === 'diamond') {
    const mid = { x: tip.x - d.x * len * 1.6, y: tip.y - d.y * len * 1.6 };
    return { d: `M${tip.x},${tip.y}L${l.x - d.x * len * 0.3},${l.y - d.y * len * 0.3}L${mid.x},${mid.y}L${r.x - d.x * len * 0.3},${r.y - d.y * len * 0.3}Z`, fill: true };
  }
  if (kind === 'oval') { const c = { x: tip.x - d.x * wid, y: tip.y - d.y * wid }; return { d: `M${c.x - wid},${c.y}A${wid},${wid} 0 1,0 ${c.x + wid},${c.y}A${wid},${wid} 0 1,0 ${c.x - wid},${c.y}Z`, fill: true }; }
  // hollow heads are filled with white, so the line does not show through (UML generalisation and aggregation)
  if (kind === 'block-open') return { d: `M${tip.x},${tip.y}L${l.x},${l.y}L${r.x},${r.y}Z`, fill: 'bg' };
  if (kind === 'diamond-open') {
    const mid = { x: tip.x - d.x * len * 1.6, y: tip.y - d.y * len * 1.6 };
    return { d: `M${tip.x},${tip.y}L${l.x - d.x * len * 0.3},${l.y - d.y * len * 0.3}L${mid.x},${mid.y}L${r.x - d.x * len * 0.3},${r.y - d.y * len * 0.3}Z`, fill: 'bg' };
  }
  if (kind.startsWith('er-')) {
    // crow's foot notation: bars (one), the foot (many) and circles (zero) along the line, from the tip back
    const at = (k) => ({ x: tip.x - d.x * k, y: tip.y - d.y * k });
    const bar = (k) => { const c = at(k); return `M${c.x + n.x * 7},${c.y + n.y * 7}L${c.x - n.x * 7},${c.y - n.y * 7}`; };
    const foot = () => { const b = at(12); return `M${tip.x + n.x * 7},${tip.y + n.y * 7}L${b.x},${b.y}L${tip.x - n.x * 7},${tip.y - n.y * 7}`; };
    const circle = (k) => { const c = at(k); return `M${c.x - 4},${c.y}A4,4 0 1,0 ${c.x + 4},${c.y}A4,4 0 1,0 ${c.x - 4},${c.y}Z`; };
    const parts = { 'er-one': [bar(8)], 'er-mand-one': [bar(6), bar(11)], 'er-many': [foot()], 'er-one-many': [foot(), bar(15)], 'er-zero-one': [bar(6), circle(15)], 'er-zero-many': [foot(), circle(17)] }[kind];
    return parts ? { d: parts.join(''), fill: kind.includes('zero') ? 'bg' : false } : null;
  }
  return { d: `M${tip.x},${tip.y}L${l.x},${l.y}L${back.x + d.x * len * 0.25},${back.y + d.y * len * 0.25}L${r.x},${r.y}Z`, fill: true };
}

/** Where an arrow at an end should point from (the previous point of the path). */
export function arrowFrom(geom, atStart) {
  const p = geom.points;
  return atStart ? p[1] : p[p.length - 2];
}

// ---- text layout --------------------------------------------------------------------------------------------

const measureCtx = document.createElement('canvas').getContext('2d');

/** Wrap text into lines that fit maxWidth. */
export function wrapText(text, style, maxWidth) {
  measureCtx.font = `${style.italic ? 'italic ' : ''}${style.bold ? 'bold ' : ''}${style.fontSize}px ${FONT}`;
  const lines = [];
  for (const para of String(text || '').split('\n')) {
    const words = para.split(/(\s+)/);
    let line = '';
    for (const word of words) {
      const next = line + word;
      if (line && measureCtx.measureText(next.trimEnd()).width > maxWidth) { lines.push(line.trimEnd()); line = word.trimStart(); } else line = next;
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

export function textWidth(text, style) {
  measureCtx.font = `${style.italic ? 'italic ' : ''}${style.bold ? 'bold ' : ''}${style.fontSize}px ${FONT}`;
  return Math.max(0, ...String(text || '').split('\n').map((l) => measureCtx.measureText(l).width));
}

// ---- bounds ---------------------------------------------------------------------------------------------------

export function pageBounds(page) {
  const map = new Map(page.shapes.map((s) => [s.id, s]));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (x, y) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
  for (const s of page.shapes) { const b = shapeBounds(s); add(b.x, b.y); add(b.x + b.w, b.y + b.h); }
  for (const e of page.edges) for (const p of edgeGeometry(e, map).points) add(p.x, p.y);
  if (minX === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// ---- history ---------------------------------------------------------------------------------------------------

export class History {
  constructor(limit = 100) { this.undoStack = []; this.redoStack = []; this.limit = limit; }

  push(doc, coalesce = null) {
    const top = this.undoStack[this.undoStack.length - 1];
    if (coalesce && top && top.coalesce === coalesce && Date.now() - top.time < 1000) { top.time = Date.now(); return; }
    this.undoStack.push({ snap: structuredClone(doc), coalesce, time: Date.now() });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(doc) { return this.move(this.undoStack, this.redoStack, doc); }
  redo(doc) { return this.move(this.redoStack, this.undoStack, doc); }

  move(from, to, doc) {
    const item = from.pop();
    if (!item) return null;
    to.push({ snap: structuredClone(doc), time: 0 });
    return item.snap;
  }
}
