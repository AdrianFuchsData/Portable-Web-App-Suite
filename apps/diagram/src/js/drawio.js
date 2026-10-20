/*
 * File formats of the diagram editor:
 *   - draw.io (.drawio / mxfile XML; compressed diagrams, groups, layers, HTML labels) read and write; unknown style keys are kept
 *   - draw.io XML embedded in SVG (content attribute) and PNG (tEXt chunk "mxfile"), as draw.io does it
 *   - Excalidraw (.excalidraw JSON) import
 */
import { inflateSync, deflateSync, strToU8, strFromU8 } from 'fflate';
import { makeShape, makeEdge, newPage, newId, layersOf, DEFAULT_STYLE, DEFAULT_EDGE_STYLE } from '@app/model.js';

// ---- style strings ---------------------------------------------------------------------------------

export function parseStyle(str) {
  const map = new Map();
  for (const part of String(str || '').split(';')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq < 0) map.set(part, null); else map.set(part.slice(0, eq), part.slice(eq + 1));
  }
  return map;
}

const serializeStyle = (map) => [...map].map(([k, v]) => (v == null ? k : `${k}=${v}`)).join(';') + ';';

// keys that are derived from our model and written fresh on export
const SHAPE_KEYS = ['shape', 'rounded', 'arcSize', 'ellipse', 'rhombus', 'triangle', 'text', 'perimeter', 'image', 'fillColor', 'strokeColor', 'strokeWidth',
  'dashed', 'opacity', 'fontSize', 'fontColor', 'fontStyle', 'align', 'verticalAlign', 'whiteSpace', 'html', 'fixedSize', 'size', 'boundedLbl', 'backgroundOutline',
  'verticalLabelPosition', 'outlineConnect', 'imageAspect', 'aspect', 'resizable', 'autosize', 'points', 'group', 'locked', 'dgType', 'tabWidth', 'tabHeight',
  'tabPosition', 'spacingLeft', 'horizontal', 'startSize', 'overflow', 'swimlane', 'doubleEllipse'];
const EDGE_KEYS = ['edgeStyle', 'curved', 'rounded', 'orthogonalLoop', 'jettySize', 'html', 'strokeColor', 'strokeWidth', 'dashed', 'opacity', 'startArrow', 'endArrow',
  'startFill', 'endFill', 'fontSize', 'fontColor', 'exitX', 'exitY', 'exitDx', 'exitDy', 'entryX', 'entryY', 'entryDx', 'entryDy', 'locked'];

const TYPE_STYLE = {
  rect: 'rounded=0;whiteSpace=wrap;html=1;',
  rounded: 'rounded=1;whiteSpace=wrap;html=1;',
  ellipse: 'ellipse;whiteSpace=wrap;html=1;',
  diamond: 'rhombus;whiteSpace=wrap;html=1;',
  terminator: 'rounded=1;whiteSpace=wrap;html=1;arcSize=50;',
  parallelogram: 'shape=parallelogram;perimeter=parallelogramPerimeter;whiteSpace=wrap;html=1;fixedSize=1;',
  hexagon: 'shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;html=1;fixedSize=1;',
  triangle: 'triangle;whiteSpace=wrap;html=1;',
  cylinder: 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;',
  document: 'shape=document;whiteSpace=wrap;html=1;boundedLbl=1;',
  note: 'shape=note;whiteSpace=wrap;html=1;backgroundOutline=1;size=15;',
  cloud: 'ellipse;shape=cloud;whiteSpace=wrap;html=1;',
  actor: 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;',
  text: 'text;html=1;whiteSpace=wrap;',
  image: 'shape=image;verticalLabelPosition=bottom;verticalAlign=top;imageAspect=0;aspect=fixed;',
  // UML/ER: one cell with an HTML label (title, <hr>, lines) like draw.io's own class shape; dgType tells it apart again
  class: 'verticalAlign=top;align=left;overflow=fill;html=1;whiteSpace=wrap;dgType=class;',
  entity: 'verticalAlign=top;align=left;overflow=fill;html=1;whiteSpace=wrap;dgType=entity;',
  package: 'shape=folder;tabWidth=50;tabHeight=14;tabPosition=left;html=1;whiteSpace=wrap;',
  component: 'shape=component;align=left;spacingLeft=36;html=1;whiteSpace=wrap;',
  'event-start': 'ellipse;html=1;dgType=event-start;',
  'event-end': 'ellipse;html=1;dgType=event-end;',
  'event-intermediate': 'ellipse;shape=doubleEllipse;html=1;',
  gateway: 'rhombus;html=1;dgType=gateway;',
  pool: 'swimlane;horizontal=0;startSize=30;html=1;',
  server: 'shape=mxgraph.networks.server;html=1;verticalLabelPosition=bottom;verticalAlign=top;',
  computer: 'shape=mxgraph.networks.pc;html=1;verticalLabelPosition=bottom;verticalAlign=top;',
  firewall: 'shape=mxgraph.networks.firewall;html=1;verticalLabelPosition=bottom;verticalAlign=top;',
  router: 'shape=mxgraph.networks.router;html=1;verticalLabelPosition=bottom;verticalAlign=top;',
};
const NETWORK = { 'mxgraph.networks.server': 'server', 'mxgraph.networks.pc': 'computer', 'mxgraph.networks.firewall': 'firewall', 'mxgraph.networks.router': 'router' };
const COMPARTMENT_TYPES = new Set(['class', 'entity']);
// arrow heads: ours <-> draw.io (name, filled)
const ER_ARROWS = { 'er-one': 'ERone', 'er-mand-one': 'ERmandOne', 'er-many': 'ERmany', 'er-one-many': 'ERoneToMany', 'er-zero-one': 'ERzeroToOne', 'er-zero-many': 'ERzeroToMany' };

function typeOf(style) {
  const own = style.get('dgType');
  if (own && TYPE_STYLE[own]) return own;
  const shape = (style.get('shape') || '').toLowerCase();
  if (NETWORK[shape]) return NETWORK[shape];
  if (shape === 'folder') return 'package';
  if (shape === 'component') return 'component';
  if (shape === 'doubleellipse' || style.has('doubleEllipse')) return 'event-intermediate';
  if (style.has('swimlane') || shape === 'swimlane') return 'pool';
  if (shape === 'image' || (!shape && style.has('image'))) return 'image';
  if (shape.startsWith('parallelogram')) return 'parallelogram';
  if (shape.startsWith('hexagon')) return 'hexagon';
  if (shape.startsWith('cylinder') || shape === 'datastore') return 'cylinder';
  if (shape === 'document') return 'document';
  if (shape.startsWith('note')) return 'note';
  if (shape === 'cloud') return 'cloud';
  if (shape === 'umlactor') return 'actor';
  if (shape === 'triangle' || style.has('triangle')) return 'triangle';
  if (shape === 'rhombus' || style.has('rhombus')) return 'diamond';
  if (shape === 'ellipse' || style.has('ellipse') || style.has('doubleEllipse')) return 'ellipse';
  if (style.has('text') || style.has('edgeLabel')) return 'text';
  if (style.get('rounded') === '1') return parseFloat(style.get('arcSize') || '0') >= 40 ? 'terminator' : 'rounded';
  return 'rect';
}

const color = (v, fallback) => (v == null ? fallback : v === 'none' || v === 'default' ? (v === 'none' ? 'none' : fallback) : v);

// ---- HTML labels -------------------------------------------------------------------------------------

export function htmlToText(value) {
  if (!/[<&]/.test(value)) return value;
  const doc = new DOMParser().parseFromString(`<body>${value}</body>`, 'text/html');
  const out = [];
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) out.push(child.textContent);
      else if (child.nodeType === 1) {
        const tag = child.tagName;
        if (tag === 'BR') { out.push('\n'); continue; }
        const block = /^(DIV|P|LI|H[1-6]|TR)$/.test(tag);
        if (block && out.length && !out[out.length - 1].endsWith('\n')) out.push('\n');
        walk(child);
        if (block && !out[out.length - 1]?.endsWith('\n')) out.push('\n');
      }
    }
  };
  walk(doc.body);
  return out.join('').replace(/ /g, ' ').replace(/\n+$/, '');
}

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const xmlAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');

// ---- reading draw.io ---------------------------------------------------------------------------------

export function decompressDiagram(text) {
  const bin = atob(text.trim());
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const xml = strFromU8(inflateSync(bytes), true); // latin1: the content is URI-encoded ASCII
  return decodeURIComponent(xml);
}

export function compressDiagram(xml) {
  const deflated = deflateSync(strToU8(encodeURIComponent(xml)));
  let bin = '';
  for (let i = 0; i < deflated.length; i++) bin += String.fromCharCode(deflated[i]);
  return btoa(bin);
}

/** Parse an mxfile (or a bare mxGraphModel) into a document { pages, page }. */
export function readDrawio(xmlText) {
  const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('not a draw.io file');
  const root = xml.documentElement;
  const pages = [];
  const diagrams = root.tagName === 'mxfile' ? [...root.getElementsByTagName('diagram')] : [root];
  for (const [i, diagram] of diagrams.entries()) {
    let model = diagram.tagName === 'mxGraphModel' ? diagram : diagram.getElementsByTagName('mxGraphModel')[0];
    if (!model && diagram.textContent.trim()) model = new DOMParser().parseFromString(decompressDiagram(diagram.textContent), 'application/xml').documentElement;
    const page = newPage(diagram.getAttribute('name') || `Page-${i + 1}`);
    if (model) readModel(model, page);
    pages.push(page);
  }
  if (!pages.length) pages.push(newPage());
  return { pages, page: 0 };
}

/** Cells of an mxGraphModel into page (shapes and edges); returns the id mapping. */
export function readModel(model, page, { offset = { x: 0, y: 0 }, withLayers = true } = {}) {
  const cells = [...model.getElementsByTagName('mxCell'), ...model.getElementsByTagName('UserObject'), ...model.getElementsByTagName('object')];
  const byId = new Map();
  // UserObject/object wrap an mxCell and carry the label
  for (const el of cells) {
    if (el.tagName === 'mxCell' && (el.parentElement.tagName === 'UserObject' || el.parentElement.tagName === 'object')) continue;
    const inner = el.tagName === 'mxCell' ? el : el.getElementsByTagName('mxCell')[0];
    if (!inner) continue;
    byId.set(el.getAttribute('id'), { el, cell: inner, label: el.getAttribute(el.tagName === 'mxCell' ? 'value' : 'label') || '' });
  }
  const layerIds = new Set([...byId.values()].filter(({ cell }) => !cell.getAttribute('parent') || cell.getAttribute('parent') === '0').map(({ el }) => el.getAttribute('id')));
  const absCache = new Map();
  const absOf = (id) => {
    if (!id || layerIds.has(id) || !byId.has(id)) return { x: 0, y: 0 };
    if (absCache.has(id)) return absCache.get(id);
    const { cell } = byId.get(id);
    const g = cell.getElementsByTagName('mxGeometry')[0];
    const parent = absOf(cell.getAttribute('parent'));
    const r = { x: parent.x + parseFloat(g?.getAttribute('x') || 0), y: parent.y + parseFloat(g?.getAttribute('y') || 0) };
    absCache.set(id, r);
    return r;
  };
  // layers (children of the root cell) become page layers; groups: the outermost "group" cell below the layer
  const layerList = [...byId.entries()].filter(([id]) => layerIds.has(id) && byId.get(id).cell.getAttribute('parent') === '0');
  if (layerList.length && !page.shapes.length && !page.edges.length && withLayers) {
    page.layers = layerList.map(([id, { cell, label }]) => ({ id, name: htmlToText(label) || 'Background', visible: cell.getAttribute('visible') !== '0', locked: parseStyle(cell.getAttribute('style')).get('locked') === '1' }));
  }
  const known = new Set(layersOf(page).map((l) => l.id));
  const placement = (id) => {
    let layer = null, group = null;
    for (let cur = byId.get(id) && byId.get(id).cell.getAttribute('parent'), n = 0; cur && n < 100; n++) {
      if (layerIds.has(cur)) { layer = cur; break; }
      const c = byId.get(cur);
      if (!c) break;
      if (parseStyle(c.cell.getAttribute('style')).has('group')) group = cur;
      cur = c.cell.getAttribute('parent');
    }
    return { layer: layer && known.has(layer) ? layer : undefined, group: group || undefined };
  };
  const place = (obj, id, style) => {
    const { layer, group } = placement(id);
    if (layer) obj.layer = layer;
    if (group) obj.group = group;
    if (style.get('locked') === '1') obj.locked = true;
  };
  const idMap = new Map();
  const edges = [];
  const labels = new Map();
  for (const [id, { cell, label }] of byId) {
    if (layerIds.has(id)) continue;
    const style = parseStyle(cell.getAttribute('style'));
    const html = style.get('html') === '1';
    let text = html ? htmlToText(label) : label;
    if (COMPARTMENT_TYPES.has(style.get('dgType'))) {
      // the title is followed by its separator, further <hr> are "--" lines
      const lines = htmlToText(String(label).replace(/<hr[^>]*>/gi, '<br>--<br>')).split('\n').filter((l, i, all) => !(l.trim() === '' && (all[i - 1] === '--' || all[i + 1] === '--')));
      if (lines[1] === '--') lines.splice(1, 1);
      text = lines.join('\n');
    }
    if (cell.getAttribute('edge') === '1') { edges.push({ id, cell, style, text }); continue; }
    if (cell.getAttribute('vertex') !== '1') continue;
    const parentId = cell.getAttribute('parent');
    if (style.has('edgeLabel') && byId.has(parentId) && byId.get(parentId).cell.getAttribute('edge') === '1') { labels.set(parentId, [labels.get(parentId), text].filter(Boolean).join('\n')); continue; }
    if (style.has('group')) continue; // groups are flattened
    const g = cell.getElementsByTagName('mxGeometry')[0];
    const abs = absOf(parentId);
    const type = typeOf(style);
    const fontStyle = parseInt(style.get('fontStyle') || '0', 10);
    const shape = makeShape(type, offset.x + abs.x + parseFloat(g?.getAttribute('x') || 0), offset.y + abs.y + parseFloat(g?.getAttribute('y') || 0),
      parseFloat(g?.getAttribute('width') || 120), parseFloat(g?.getAttribute('height') || 60));
    shape.text = text;
    const st = shape.style;
    st.fill = color(style.get('fillColor'), type === 'text' || type === 'image' ? 'none' : DEFAULT_STYLE.fill);
    st.stroke = color(style.get('strokeColor'), type === 'text' || type === 'image' ? 'none' : DEFAULT_STYLE.stroke);
    st.strokeWidth = parseFloat(style.get('strokeWidth') || '1');
    st.dash = style.get('dashed') === '1';
    st.opacity = style.has('opacity') ? parseFloat(style.get('opacity')) / 100 : 1;
    st.fontSize = parseFloat(style.get('fontSize') || '12');
    st.fontColor = color(style.get('fontColor'), '#000000');
    st.bold = !!(fontStyle & 1);
    st.italic = !!(fontStyle & 2);
    st.align = style.get('align') || 'center';
    st.valign = style.get('verticalAlign') || 'middle';
    if (type === 'image') {
      let src = style.get('image') || '';
      // draw.io writes "data:image/png,BASE64" (";base64" would clash with the style separator)
      if (/^data:[^,;]+,/.test(src) && !/;base64,/.test(src)) src = src.replace(/^(data:[^,]+),/, '$1;base64,');
      st.image = src;
    }
    shape.extra = Object.fromEntries([...style].filter(([k]) => !SHAPE_KEYS.includes(k)));
    place(shape, id, style);
    page.shapes.push(shape);
    idMap.set(id, shape.id);
  }
  for (const { id, cell, style, text } of edges) {
    const g = cell.getElementsByTagName('mxGeometry')[0];
    const point = (as) => {
      const p = g && [...g.getElementsByTagName('mxPoint')].find((x) => x.getAttribute('as') === as);
      const abs = absOf(cell.getAttribute('parent'));
      return p ? { x: offset.x + abs.x + parseFloat(p.getAttribute('x') || 0), y: offset.y + abs.y + parseFloat(p.getAttribute('y') || 0) } : { x: offset.x, y: offset.y };
    };
    const end = (attr, as, kx, ky) => {
      const target = idMap.get(cell.getAttribute(attr));
      if (!target) return point(as);
      const e = { id: target };
      if (style.has(kx) && style.has(ky)) { e.ax = parseFloat(style.get(kx)); e.ay = parseFloat(style.get(ky)); }
      return e;
    };
    const edgeStyle = style.get('edgeStyle') || '';
    const arrow = (v, fallback, fill) => {
      if (v == null) return fallback;
      if (v === 'none' || v === '') return 'none';
      const er = Object.keys(ER_ARROWS).find((k) => ER_ARROWS[k] === v);
      if (er) return er;
      if (/^open/.test(v)) return 'open';
      if (/^oval|^dash/.test(v)) return 'oval';
      if (/^diamond/.test(v)) return fill === '0' ? 'diamond-open' : 'diamond';
      if (/^block/.test(v) && fill === '0') return 'block-open';
      return 'classic';
    };
    const edge = makeEdge(end('source', 'sourcePoint', 'exitX', 'exitY'), end('target', 'targetPoint', 'entryX', 'entryY'), {
      route: style.get('curved') === '1' ? 'curved' : /orthogonal|elbow|entityRelation|segment/i.test(edgeStyle) ? 'orthogonal' : 'straight',
      style: {
        stroke: color(style.get('strokeColor'), DEFAULT_EDGE_STYLE.stroke), strokeWidth: parseFloat(style.get('strokeWidth') || '1'),
        dash: style.get('dashed') === '1', startArrow: arrow(style.get('startArrow'), 'none', style.get('startFill')), endArrow: arrow(style.get('endArrow'), 'classic', style.get('endFill')),
        fontSize: parseFloat(style.get('fontSize') || '11'), fontColor: color(style.get('fontColor'), '#000000'),
        opacity: style.has('opacity') ? parseFloat(style.get('opacity')) / 100 : 1,
      },
    });
    edge.text = [text, labels.get(id)].filter(Boolean).join('\n');
    edge.extra = Object.fromEntries([...style].filter(([k]) => !EDGE_KEYS.includes(k)));
    place(edge, id, style);
    page.edges.push(edge);
    idMap.set(id, edge.id);
  }
  return idMap;
}

// ---- writing draw.io --------------------------------------------------------------------------------------

function shapeStyle(s) {
  const map = new Map([...parseStyle(TYPE_STYLE[s.type] || TYPE_STYLE.rect), ...Object.entries(s.extra || {})]);
  const st = s.style;
  map.set('fillColor', st.fill || 'none');
  map.set('strokeColor', st.stroke || 'none');
  if (st.strokeWidth !== 1) map.set('strokeWidth', st.strokeWidth);
  if (st.dash) map.set('dashed', '1');
  if (st.opacity < 1) map.set('opacity', Math.round(st.opacity * 100));
  if (st.fontSize !== 12) map.set('fontSize', st.fontSize);
  if (st.fontColor && st.fontColor !== '#000000') map.set('fontColor', st.fontColor);
  if (st.bold || st.italic) map.set('fontStyle', (st.bold ? 1 : 0) | (st.italic ? 2 : 0));
  if (st.align !== 'center') map.set('align', st.align);
  if (st.valign !== 'middle' && s.type !== 'actor' && s.type !== 'image') map.set('verticalAlign', st.valign);
  if (s.type === 'image' && st.image) map.set('image', st.image.replace(/;base64,/, ','));
  if (s.locked) map.set('locked', '1');
  return serializeStyle(map);
}

function edgeStyleString(e) {
  const map = new Map(Object.entries(e.extra || {}));
  if (e.route === 'orthogonal') { map.set('edgeStyle', 'orthogonalEdgeStyle'); map.set('rounded', '0'); }
  if (e.route === 'curved') map.set('curved', '1');
  map.set('html', '1');
  const st = e.style;
  if (st.stroke !== '#000000') map.set('strokeColor', st.stroke);
  if (st.strokeWidth !== 1) map.set('strokeWidth', st.strokeWidth);
  if (st.dash) map.set('dashed', '1');
  if (st.opacity < 1) map.set('opacity', Math.round(st.opacity * 100));
  for (const [key, fill, kind] of [['startArrow', 'startFill', st.startArrow], ['endArrow', 'endFill', st.endArrow]]) {
    map.delete(fill);
    if (ER_ARROWS[kind]) { map.set(key, ER_ARROWS[kind]); map.set(fill, 0); } else if (kind === 'block-open') { map.set(key, 'block'); map.set(fill, 0); } else if (kind === 'diamond-open') { map.set(key, 'diamond'); map.set(fill, 0); } else map.set(key, kind === 'none' ? 'none' : kind);
  }
  if (st.fontSize !== 11) map.set('fontSize', st.fontSize);
  if (st.fontColor !== '#000000') map.set('fontColor', st.fontColor);
  for (const [end, kx, ky] of [[e.from, 'exitX', 'exitY'], [e.to, 'entryX', 'entryY']]) {
    if (end.id && end.ax != null) { map.set(kx, end.ax); map.set(ky, end.ay); map.set(kx.replace('X', 'Dx'), 0); map.set(ky.replace('Y', 'Dy'), 0); }
  }
  if (e.locked) map.set('locked', '1');
  return serializeStyle(map);
}

const labelValue = (text) => xmlAttr(escapeHtml(text || '').replace(/\n/g, '<br>'));

/** HTML label of a class/entity: the bold, centred title, a rule, the lines ("--" = another rule). */
function compartmentLabel(text) {
  const [title, ...rest] = String(text || '').split('\n');
  let body = '', open = false;
  for (const line of rest) {
    if (line.trim() === '--') { if (open) body += '</p>'; body += '<hr size="1">'; open = false; continue; }
    body += open ? `<br>${escapeHtml(line)}` : `<p style="margin:0px;margin-left:4px;">${escapeHtml(line)}`;
    open = true;
  }
  if (open) body += '</p>';
  return xmlAttr(`<p style="margin:0px;margin-top:4px;text-align:center;"><b>${escapeHtml(title)}</b></p><hr size="1">${body}`);
}

/**
 * mxGraphModel XML of shapes and edges (cells reference each other by our ids). With `layers`, every layer becomes a layer cell
 * (visible="0" when hidden, locked=1 in its style); groups become "group" cells around their members, whose geometry is then
 * relative to the group.
 */
export function writeModel(shapes, edges, { layers = null } = {}) {
  const ids = new Set(shapes.map((s) => s.id));
  const cells = ['<mxCell id="0" />'];
  const layerIds = new Set();
  if (layers && layers.length) {
    for (const l of layers) {
      layerIds.add(l.id);
      cells.push(`<mxCell id="${xmlAttr(l.id)}" value="${xmlAttr(escapeHtml(l.name || ''))}"${l.locked ? ' style="locked=1;"' : ''} parent="0"${l.visible === false ? ' visible="0"' : ''} />`);
    }
  } else cells.push('<mxCell id="1" parent="0" />');
  const layerOfObj = (o) => (o.layer && layerIds.has(o.layer) ? o.layer : layers && layers.length ? layers[0].id : '1');
  // group cells: bounding box of the member shapes
  const groups = new Map();
  for (const o of [...shapes, ...edges]) if (o.group && !ids.has(o.group) && !groups.has(o.group)) groups.set(o.group, { layer: layerOfObj(o), shapes: [] });
  for (const s of shapes) if (groups.has(s.group)) groups.get(s.group).shapes.push(s);
  for (const [gid, g] of groups) {
    const xs = g.shapes.flatMap((s) => [s.x, s.x + s.w]), ys = g.shapes.flatMap((s) => [s.y, s.y + s.h]);
    g.x = xs.length ? Math.min(...xs) : 0; g.y = ys.length ? Math.min(...ys) : 0;
    const w = xs.length ? Math.max(...xs) - g.x : 0, h = ys.length ? Math.max(...ys) - g.y : 0;
    cells.push(`<mxCell id="${xmlAttr(gid)}" value="" style="group" vertex="1" connectable="0" parent="${xmlAttr(g.layer)}">` +
      `<mxGeometry x="${round(g.x)}" y="${round(g.y)}" width="${round(w)}" height="${round(h)}" as="geometry" /></mxCell>`);
  }
  const parentOf = (o) => (groups.has(o.group) ? { id: o.group, x: groups.get(o.group).x, y: groups.get(o.group).y } : { id: layerOfObj(o), x: 0, y: 0 });
  for (const s of shapes) {
    const par = parentOf(s);
    cells.push(`<mxCell id="${xmlAttr(s.id)}" value="${COMPARTMENT_TYPES.has(s.type) ? compartmentLabel(s.text) : labelValue(s.text)}" style="${xmlAttr(shapeStyle(s))}" vertex="1" parent="${xmlAttr(par.id)}">` +
      `<mxGeometry x="${round(s.x - par.x)}" y="${round(s.y - par.y)}" width="${round(s.w)}" height="${round(s.h)}" as="geometry" /></mxCell>`);
  }
  for (const e of edges) {
    const par = parentOf(e);
    const src = e.from.id && ids.has(e.from.id) ? ` source="${xmlAttr(e.from.id)}"` : '';
    const tgt = e.to.id && ids.has(e.to.id) ? ` target="${xmlAttr(e.to.id)}"` : '';
    const pts = [!src && e.from.x != null ? `<mxPoint x="${round(e.from.x - par.x)}" y="${round(e.from.y - par.y)}" as="sourcePoint" />` : '', !tgt && e.to.x != null ? `<mxPoint x="${round(e.to.x - par.x)}" y="${round(e.to.y - par.y)}" as="targetPoint" />` : ''].join('');
    cells.push(`<mxCell id="${xmlAttr(e.id)}" value="${labelValue(e.text)}" style="${xmlAttr(edgeStyleString(e))}" edge="1" parent="${xmlAttr(par.id)}"${src}${tgt}>` +
      `<mxGeometry relative="1" as="geometry">${pts}</mxGeometry></mxCell>`);
  }
  return `<mxGraphModel dx="1000" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0"><root>${cells.join('')}</root></mxGraphModel>`;
}

const round = (v) => Math.round(v * 100) / 100;

export function writeDrawio(doc, { version = '' } = {}) {
  const diagrams = doc.pages.map((p) => `  <diagram id="${xmlAttr(p.id)}" name="${xmlAttr(p.name)}">\n    ${writeModel(p.shapes, p.edges, { layers: layersOf(p) })}\n  </diagram>`);
  return `<mxfile host="Portable Web App Suite" version="${xmlAttr(version)}">\n${diagrams.join('\n')}\n</mxfile>\n`;
}

// ---- draw.io inside SVG and PNG -------------------------------------------------------------------------

export function drawioFromSvg(text) {
  const svg = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
  const content = svg && svg.getAttribute('content');
  return content && /<mxfile|<mxGraphModel/.test(content) ? content : null;
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(bytes) { let c = 0xffffffff; for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

/** Insert a tEXt chunk (keyword "mxfile", URI-encoded XML) after IHDR. */
export function pngWithDrawio(png, xml) {
  const data = strToU8(`mxfile\0${encodeURIComponent(xml)}`, true);
  const chunk = new Uint8Array(12 + data.length);
  const v = new DataView(chunk.buffer);
  v.setUint32(0, data.length);
  chunk.set(strToU8('tEXt', true), 4);
  chunk.set(data, 8);
  v.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  const ihdrEnd = 8 + 12 + new DataView(png.buffer, png.byteOffset).getUint32(8);
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, ihdrEnd));
  out.set(chunk, ihdrEnd);
  out.set(png.subarray(ihdrEnd), ihdrEnd + chunk.length);
  return out;
}

export function drawioFromPng(png) {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  for (let p = 8; p + 8 <= png.length;) {
    const len = v.getUint32(p);
    const type = strFromU8(png.subarray(p + 4, p + 8), true);
    if (type === 'tEXt' || type === 'zTXt') {
      const data = png.subarray(p + 8, p + 8 + len);
      const nul = data.indexOf(0);
      const key = strFromU8(data.subarray(0, nul), true);
      if (key === 'mxfile' || key === 'mxGraphModel') {
        const raw = type === 'zTXt' ? strFromU8(inflateSync(data.subarray(nul + 2).subarray(2)), true) : strFromU8(data.subarray(nul + 1), true);
        return decodeURIComponent(raw);
      }
    }
    if (type === 'IEND') break;
    p += 12 + len;
  }
  return null;
}

// ---- Excalidraw --------------------------------------------------------------------------------------------

export function readExcalidraw(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data || !Array.isArray(data.elements)) throw new Error('not an Excalidraw file');
  const page = newPage('Excalidraw');
  const idMap = new Map();
  const elements = data.elements.filter((e) => !e.isDeleted);
  const colorOf = (c, fallback) => (!c || c === 'transparent' ? fallback : c);
  for (const el of elements) {
    const types = { rectangle: el.roundness ? 'rounded' : 'rect', ellipse: 'ellipse', diamond: 'diamond', text: 'text', image: 'image' };
    const type = types[el.type];
    if (!type || (el.type === 'text' && el.containerId)) continue;
    const shape = makeShape(type, el.x, el.y, Math.abs(el.width) || 10, Math.abs(el.height) || 10);
    Object.assign(shape.style, {
      fill: type === 'text' || type === 'image' ? 'none' : colorOf(el.backgroundColor, 'none'),
      stroke: type === 'text' || type === 'image' ? 'none' : colorOf(el.strokeColor, '#000000'),
      strokeWidth: el.strokeWidth || 1, dash: el.strokeStyle === 'dashed' || el.strokeStyle === 'dotted', opacity: (el.opacity ?? 100) / 100,
    });
    if (type === 'text') Object.assign(shape.style, { fontSize: el.fontSize || 20, fontColor: colorOf(el.strokeColor, '#000000'), align: el.textAlign || 'left', valign: 'top' }), shape.text = el.text || '';
    if (type === 'image' && data.files && data.files[el.fileId]) shape.style.image = data.files[el.fileId].dataURL;
    page.shapes.push(shape);
    idMap.set(el.id, shape);
  }
  for (const el of elements) {
    if (el.type === 'text' && el.containerId && idMap.has(el.containerId)) {
      const s = idMap.get(el.containerId);
      s.text = el.text || '';
      s.style.fontSize = el.fontSize || 20;
      s.style.fontColor = colorOf(el.strokeColor, '#000000');
    }
  }
  const head = (h) => (h == null ? 'none' : h === 'dot' || h === 'circle' ? 'oval' : h === 'bar' ? 'open' : h === 'diamond' ? 'diamond' : 'classic');
  for (const el of elements) {
    if (el.type !== 'arrow' && el.type !== 'line') continue;
    const pts = el.points || [[0, 0], [el.width, el.height]];
    const first = { x: el.x + pts[0][0], y: el.y + pts[0][1] };
    const last = { x: el.x + pts[pts.length - 1][0], y: el.y + pts[pts.length - 1][1] };
    const end = (binding, p) => (binding && idMap.has(binding.elementId) ? { id: idMap.get(binding.elementId).id } : p);
    const edge = makeEdge(end(el.startBinding, first), end(el.endBinding, last), {
      route: 'straight',
      style: { stroke: colorOf(el.strokeColor, '#000000'), strokeWidth: el.strokeWidth || 1, dash: el.strokeStyle === 'dashed' || el.strokeStyle === 'dotted',
        startArrow: head(el.startArrowhead), endArrow: el.type === 'line' ? 'none' : head(el.endArrowhead === undefined ? 'arrow' : el.endArrowhead), opacity: (el.opacity ?? 100) / 100 },
    });
    const label = elements.find((t) => t.type === 'text' && t.containerId === el.id);
    if (label) edge.text = label.text || '';
    page.edges.push(edge);
  }
  return { pages: [page], page: 0 };
}

export { newId };
