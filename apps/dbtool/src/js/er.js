/*
 * Entity-relationship diagram of a database schema as a draw.io file (opened in the suite's diagram editor): one box per
 * table with its columns (🔑 primary key, → foreign key), connectors for the foreign keys, laid out in layers by the
 * diagram editor's layout (the referenced tables above the referencing ones).
 *
 *   erDiagram(tables, foreignKeys) -> draw.io XML
 *   tables: [{ schema, name, type, columns: [{ name, type, pk, notnull }] }]; foreignKeys: [{ schema, table, column, refSchema, refTable, refColumn }]
 */
import { layout } from '@app/layout.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');

export function erDiagram(tables, foreignKeys) {
  const key = (schema, name) => `${schema || ''}.${name}`;
  const fkColumns = new Set(foreignKeys.map((f) => `${key(f.schema, f.table)}.${f.column}`));
  const showSchema = new Set(tables.map((t) => t.schema)).size > 1;
  const boxes = tables.map((t, i) => {
    const lines = t.columns.map((c) => `${c.pk ? '🔑 ' : fkColumns.has(`${key(t.schema, t.name)}.${c.name}`) ? '→ ' : '   '}${c.name}  ${(c.type || '').toLowerCase()}${c.notnull && !c.pk ? ' not null' : ''}`);
    const title = `${t.type === 'view' ? '👁 ' : ''}${showSchema ? `${t.schema}.` : ''}${t.name}`;
    const w = Math.round(Math.min(360, Math.max(140, ...[title, ...lines].map((l) => l.length * 7.2 + 24))));
    const h = 30 + lines.length * 16 + 10;
    return { id: `t${i}`, key: key(t.schema, t.name), title, lines, w, h, view: t.type === 'view' };
  });
  const byKey = new Map(boxes.map((b) => [b.key, b]));
  const edges = [];
  const seen = new Set();
  for (const f of foreignKeys) {
    const from = byKey.get(key(f.schema, f.table)), to = byKey.get(key(f.refSchema ?? f.schema, f.refTable));
    if (!from || !to) continue;
    const id = `${from.id}-${f.column}-${to.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    edges.push({ id: `e${edges.length}`, from: from.id, to: to.id, label: f.column });
  }
  // referenced tables first: the layout runs from the referenced table (source) to the referencing one
  const pos = layout({ shapes: boxes.map((b) => ({ id: b.id, w: b.w, h: b.h })), edges: edges.map((e) => ({ from: { id: e.to }, to: { id: e.from } })) },
    { direction: 'TB', rankGap: 80, nodeGap: 50 });
  const cells = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];
  for (const b of boxes) {
    const p = pos.get(b.id);
    const label = `${b.title}\n${'─'.repeat(Math.max(4, Math.round(b.w / 9)))}\n${b.lines.join('\n')}`;
    const style = `rounded=1;arcSize=4;whiteSpace=wrap;html=0;align=left;verticalAlign=top;spacingLeft=8;spacingTop=4;fontSize=12;fillColor=${b.view ? '#f5f5f5' : '#dae8fc'};strokeColor=${b.view ? '#999999' : '#6c8ebf'};`;
    cells.push(`<mxCell id="${b.id}" value="${esc(label)}" style="${style}" vertex="1" parent="1"><mxGeometry x="${p.x}" y="${p.y}" width="${b.w}" height="${b.h}" as="geometry"/></mxCell>`);
  }
  for (const e of edges) {
    cells.push(`<mxCell id="${e.id}" value="${esc(e.label)}" style="edgeStyle=orthogonalEdgeStyle;html=1;endArrow=classic;startArrow=oval;fontSize=10;" edge="1" parent="1" source="${e.from}" target="${e.to}"><mxGeometry relative="1" as="geometry"/></mxCell>`);
  }
  return `<mxfile host="Portable Web App Suite"><diagram id="er" name="ER diagram"><mxGraphModel><root>${cells.join('')}</root></mxGraphModel></diagram></mxfile>`;
}
