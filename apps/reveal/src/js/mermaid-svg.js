/*
 * Mermaid flowcharts as static SVG for the diagram block of the web slides. Parsing, automatic layout and the shape geometry come
 * from the diagram editor (apps/diagram/src/js: mermaid.js, layout.js, model.js), so a diagram looks the same in both apps and the
 * presentation needs no Mermaid library (the SVG is part of the slide HTML).
 *
 *   mermaidSvg(text, { color }) -> { svg, width, height }   (throws MermaidError for unsupported input)
 */
import { parseMermaid, sizeFor } from '@diagram/mermaid.js';
import { layout } from '@diagram/layout.js';
import { makeShape, makeEdge, shapePath, edgeGeometry, edgePathD, edgeMidpoint, arrowPath, arrowFrom, wrapText, textWidth, FONT } from '@diagram/model.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function mermaidSvg(text, { color = 'currentColor', fill = 'none' } = {}) {
  const g = parseMermaid(text);
  const ids = new Map();
  const shapes = g.nodes.map((n) => {
    const { w, h } = sizeFor(n.type, n.text);
    const s = makeShape(n.type, 0, 0, w, h, { text: n.text });
    ids.set(n.id, s.id);
    return s;
  });
  const edges = g.edges.map((e) => makeEdge({ id: ids.get(e.from) }, { id: ids.get(e.to) }, {
    text: e.text, style: { dash: e.dash, strokeWidth: e.thick ? 2.5 : 1.5, startArrow: e.startArrow, endArrow: e.endArrow },
  }));
  const pos = layout({ shapes, edges }, { direction: g.direction, origin: { x: 10, y: 10 } });
  for (const s of shapes) Object.assign(s, pos.get(s.id));
  // edges against the layout direction leave and enter at the side (as in the diagram editor)
  const byId = new Map(shapes.map((s) => [s.id, s]));
  const horizontal = g.direction === 'LR' || g.direction === 'RL';
  const sign = g.direction === 'BT' || g.direction === 'RL' ? -1 : 1;
  for (const e of edges) {
    const a = byId.get(e.from.id), b = byId.get(e.to.id);
    if (a && b && (horizontal ? sign * (b.x - a.x) < 0 : sign * (b.y - a.y) < 0)) {
      const side = horizontal ? { ax: 0.5, ay: 1 } : { ax: 1, ay: 0.5 };
      Object.assign(e.from, side);
      Object.assign(e.to, side);
    }
  }
  const parts = [];
  const textStyle = { fontSize: 14, bold: false, italic: false };
  for (const s of shapes) {
    const lines = wrapText(s.text, textStyle, s.w - 8);
    const lh = 17;
    const top = s.h / 2 - (lines.length * lh) / 2 + 13;
    parts.push(`<g transform="translate(${s.x},${s.y})"><path d="${shapePath(s)}" fill="${fill}" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>`
      + `<text x="${s.w / 2}" text-anchor="middle" font-size="14" font-family="${esc(FONT)}" fill="${color}">${lines.map((l, i) => `<tspan x="${s.w / 2}" y="${top + i * lh}">${esc(l)}</tspan>`).join('')}</text></g>`);
  }
  let maxX = 0, maxY = 0;
  for (const s of shapes) { maxX = Math.max(maxX, s.x + s.w); maxY = Math.max(maxY, s.y + s.h); }
  for (const e of edges) {
    const geom = edgeGeometry(e, byId);
    for (const p of geom.points) { maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
    const st = e.style;
    const dash = st.dash ? ` stroke-dasharray="${st.strokeWidth * 3} ${st.strokeWidth * 3}"` : '';
    parts.push(`<path d="${edgePathD(geom)}" fill="none" stroke="${color}" stroke-width="${st.strokeWidth}"${dash}/>`);
    for (const [kind, tip, from] of [[st.startArrow, geom.points[0], arrowFrom(geom, true)], [st.endArrow, geom.points[geom.points.length - 1], arrowFrom(geom, false)]]) {
      const head = arrowPath(kind, tip, from, st.strokeWidth);
      if (head) parts.push(`<path d="${head.d}" fill="${head.fill ? color : 'none'}" stroke="${color}" stroke-width="${st.strokeWidth}" stroke-linejoin="round"/>`);
    }
    if (e.text) {
      const mid = edgeMidpoint(geom);
      const w = textWidth(e.text, { fontSize: 12 }) + 8;
      parts.push(`<rect x="${mid.x - w / 2}" y="${mid.y - 9}" width="${w}" height="18" rx="3" fill="${fill === 'none' ? 'var(--r-background-color, #fff)' : fill}"/>`
        + `<text x="${mid.x}" y="${mid.y + 4}" text-anchor="middle" font-size="12" font-family="${esc(FONT)}" fill="${color}">${esc(e.text)}</text>`);
    }
  }
  const width = Math.ceil(maxX + 10), height = Math.ceil(maxY + 10);
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="max-width:100%;height:auto">${parts.join('')}</svg>`, width, height };
}
