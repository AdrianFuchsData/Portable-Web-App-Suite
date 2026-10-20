/*
 * Mermaid flowcharts (`flowchart TD` / `graph LR` …) as diagram shapes and edges. Supported: node shapes [ ], ( ), ([ ]),
 * [[ ]], [( )], (( )), ((( ))), { }, {{ }}, [/ /], [\ \], > ], quoted labels, <br>; links --> --- -.-> -.- ==> === with
 * o/x ends and arrows at both ends (<-->), labels as -->|text| or -- text -->, chains (A --> B --> C) and A & B --> C.
 * subgraph/end, class, classDef, style, linkStyle, click, direction and %% comments are skipped.
 *
 *   parseMermaid(text) -> { direction, nodes: [{ id, text, type }], edges: [{ from, to, text, dash, thick, startArrow, endArrow }] }
 */

const SHAPES = [
  ['(((', ')))', 'ellipse'], ['([', '])', 'terminator'], ['[[', ']]', 'rect'], ['[(', ')]', 'cylinder'], ['((', '))', 'ellipse'],
  ['{{', '}}', 'hexagon'], ['[/', '/]', 'parallelogram'], ['[\\', '\\]', 'parallelogram'], ['[/', '\\]', 'parallelogram'],
  ['[\\', '/]', 'parallelogram'], ['[', ']', 'rect'], ['(', ')', 'rounded'], ['{', '}', 'diamond'], ['>', ']', 'rect'],
];
const SKIP = /^(subgraph|end|classDef|class|style|linkStyle|click|direction)\b/;
const ID_RE = /^[\p{L}\p{N}_]+/u;
const LABELLED_RE = /^\s*([<ox])?(--|==|-\.)(?![->.=])\s*([^|\n]+?)\s*(-{2,}>|-{3,}|={2,}>|={3,}|\.->|\.-|--[ox]|==[ox])/;
const LINK_RE = /^\s*([<ox])?(-{2,}|={2,}|-\.+-)(>|o(?=[\s|])|x(?=[\s|]))?/;
const PIPE_RE = /^\s*\|([^|]*)\|/;

export class MermaidError extends Error {}

const labelText = (s) => s.trim().replace(/^"([\s\S]*)"$/, '$1').replace(/<br\s*\/?>/gi, '\n').replace(/&quot;/g, '"').replace(/#quot;/g, '"').replace(/`/g, '').trim();
const arrowOf = (c) => (c === '>' || c === '<' ? 'classic' : c === 'o' ? 'oval' : c === 'x' ? 'open' : 'none');

export function parseMermaid(text) {
  const lines = String(text).replace(/\r/g, '').split('\n').map((l) => l.replace(/%%.*$/, '').trim()).filter(Boolean);
  const head = lines.length ? /^(flowchart|graph)\s*(TB|TD|BT|LR|RL)?\s*;?$/i.exec(lines[0]) : null;
  if (!head) throw new MermaidError('only Mermaid flowcharts ("flowchart TD", "graph LR", …) can be imported');
  const direction = ({ TD: 'TB' })[(head[2] || 'TB').toUpperCase()] || (head[2] || 'TB').toUpperCase();
  const nodes = new Map();
  const edges = [];

  const node = (src) => {
    const m = ID_RE.exec(src);
    if (!m) return null;
    const id = m[0];
    let rest = src.slice(id.length);
    let label = null, type = null;
    for (const [open, close, kind] of SHAPES) {
      if (!rest.startsWith(open)) continue;
      let body = rest.slice(open.length);
      let end;
      if (body.trimStart().startsWith('"')) {
        const q1 = body.indexOf('"'), q2 = body.indexOf('"', q1 + 1);
        end = q2 < 0 ? -1 : body.indexOf(close, q2);
      } else end = body.indexOf(close);
      if (end < 0) continue;
      label = labelText(body.slice(0, end));
      type = kind;
      rest = body.slice(end + close.length);
      break;
    }
    const known = nodes.get(id);
    if (!known) nodes.set(id, { id, text: label ?? id, type: type || 'rect' });
    else if (label != null) Object.assign(known, { text: label, type });
    return { id, rest };
  };

  const group = (src) => {
    const ids = [];
    let rest = src;
    for (;;) {
      const n = node(rest.trimStart());
      if (!n) break;
      ids.push(n.id);
      rest = n.rest;
      const amp = /^\s*&\s*/.exec(rest);
      if (!amp) break;
      rest = rest.slice(amp[0].length);
    }
    return { ids, rest };
  };

  for (const raw of lines.slice(1)) {
    for (const statement of raw.split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((s) => s.trim()).filter(Boolean)) {
      if (SKIP.test(statement)) continue;
      let { ids: from, rest } = group(statement);
      if (!from.length) continue;
      for (;;) {
        let m = LABELLED_RE.exec(rest);
        let link;
        if (m) {
          const close = m[4];
          link = { start: m[1] || '', line: m[2] + close, end: /[>ox]$/.test(close) ? close.slice(-1) : '', text: labelText(m[3]) };
        } else {
          m = LINK_RE.exec(rest);
          if (!m) break;
          link = { start: m[1] || '', line: m[2], end: m[3] || '', text: '' };
        }
        rest = rest.slice(m[0].length);
        const pipe = PIPE_RE.exec(rest);
        if (pipe) { link.text = labelText(pipe[1]); rest = rest.slice(pipe[0].length); }
        const next = group(rest);
        if (!next.ids.length) break;
        for (const a of from) {
          for (const b of next.ids) {
            edges.push({ from: a, to: b, text: link.text, dash: link.line.includes('.'), thick: link.line.includes('='),
              startArrow: arrowOf(link.start), endArrow: arrowOf(link.end) });
          }
        }
        from = next.ids;
        rest = next.rest;
      }
    }
  }
  return { direction, nodes: [...nodes.values()], edges };
}

/** Size of a shape for a label. */
export function sizeFor(type, text) {
  const lines = String(text).split('\n');
  const chars = Math.max(...lines.map((l) => l.length));
  let w = Math.min(240, Math.max(80, chars * 7.5 + 30));
  let h = Math.max(46, lines.length * 16 + 26);
  if (type === 'diamond') { w = Math.max(100, w * 1.35); h = Math.max(70, h * 1.4); }
  if (type === 'hexagon') w += 30;
  if (type === 'ellipse') { w = Math.max(w, h + 20); h = Math.max(h, 60); }
  if (type === 'cylinder') h += 16;
  return { w: Math.round(w), h: Math.round(h) };
}
