/*
 * PlantUML diagrams (the text between @startuml and @enduml) as diagram shapes and edges, without a PlantUML server:
 *
 *   - class diagrams: class / abstract class / interface / enum / entity / annotation with { members } or "Name : member",
 *     relations <|-- *-- o-- --> ..> ..|> -- .. with multiplicities ("1" -- "*") and labels (: label)
 *   - use case diagrams: actor, :Actor:, usecase, (Use case), "as" aliases, left to right direction
 *   - component / deployment diagrams: component, [Component], interface, () "Interface", node, database, cloud, queue, …
 *   - state diagrams: state, [*] start and end, "S : description", transitions with events
 *   - activity diagrams (new syntax): start, stop, end, :action;, if/elseif/else/endif, while/endwhile, repeat/repeat while,
 *     fork/fork again/end fork, detach/kill
 *   - sequence diagrams: participant/actor/database/…, messages -> --> ->> <- with labels, self messages, autonumber, title,
 *     alt/opt/loop/par/group … end as frames, notes over/left of/right of a participant, == dividers ==, ... and |||
 *
 * Styling (skinparam, colours, !include, hide/show, notes outside sequence diagrams, packages as containers) is skipped.
 *
 *   parsePlantUml(text) -> { kind: 'graph', direction, nodes: [{ id, text, type, w?, h?, style? }], edges: [...] }  (laid out by
 *                           the caller like a Mermaid flowchart)
 *                       |  { kind: 'sequence', shapes, edges }  (placed already)
 */
import { makeShape, makeEdge } from '@app/model.js';
import { sizeFor } from '@app/mermaid.js';

export class PlantUmlError extends Error {}

const unquote = (s) => String(s || '').trim().replace(/^"([\s\S]*)"$/, '$1').replace(/\\n/g, '\n').trim();
const clean = (s) => unquote(s).replace(/<<([^>]*)>>/g, '«$1»').replace(/<\/?[biu]>/g, '');

/** The lines between @startuml and @enduml, without comments and blank lines (block comments /' … '/ too). */
function linesOf(text) {
  let src = String(text).replace(/\r/g, '').replace(/\/'[\s\S]*?'\//g, '');
  const start = /@start\w+[^\n]*\n/.exec(src);
  if (start) src = src.slice(start.index + start[0].length);
  const end = /@end\w+/.exec(src);
  if (end) src = src.slice(0, end.index);
  return src.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith("'"));
}

const SKIP = /^(skinparam|hide|show|!|scale|caption|header|footer|legend|endlegend|center|left header|right footer|allowmixing|set\s|newpage|mainframe|together)\b/i;

/** Which kind of diagram the lines are. */
export function plantUmlKind(lines) {
  const has = (re) => lines.some((l) => re.test(l));
  if (has(/^(start|stop)$/) || has(/^:[^:][\s\S]*;$/) || has(/^(if|while)\s*\(/) || has(/^(repeat|fork)$/)) return 'activity';
  if (has(/^(participant|boundary|control|collections|activate|deactivate|autonumber|alt|loop|opt|par|critical|break|ref over)\b/)) return 'sequence';
  if (has(/^\[[^\]*]+\]/) || has(/^(component|\(\))\s*\S/) && !has(/^(abstract\s+)?class\s/)) return 'component';
  if (has(/^(abstract\s+class|abstract|class|interface|enum|annotation|entity|protocol|struct|exception)\s/)) return 'class';
  if (has(/^state\s/) || has(/\[\*\]/)) return 'state';
  if (has(/^usecase\b/) || has(/(^|\s)\([^)]+\)(\s|$)/) || has(/^:[^:]+:/)) return 'usecase';
  if (has(/(<\|\s*-|-\s*\|>|\.\s*\|>|^\S+\s*"[^"]*"\s*[*o]?--|\*--|--\*|\so--|--o\s)/)) return 'class';
  if (has(/^(component|node|cloud|folder|frame|artifact|storage|rectangle|file|card|agent|stack|port)\b/) || has(/^\[[^\]]+\]/) || has(/^\(\)/)) return 'component';
  if (has(/^(actor|database)\b/) || has(/^\S+\s*(<<?|x|o)?-{1,2}(>>?|x|o|\\\\?|\/\/?)\s*\S/)) return 'sequence';
  throw new PlantUmlError('no PlantUML diagram found (class, use case, component, state, activity or sequence)');
}

// ---- graph-like diagrams: class, use case, component, state ----------------------------------------------------------------

const DECLARE = {
  class: /^(abstract\s+class|abstract|class|interface|enum|annotation|entity|protocol|struct|exception|circle)\s+(.+)$/,
  usecase: /^(actor|usecase|rectangle|package|business\s+actor)\s+(.+)$/,
  component: /^(component|node|database|cloud|folder|frame|artifact|storage|queue|rectangle|file|card|agent|stack|actor|interface|package|collections|boundary|control|entity|usecase|hexagon|label|person|port|portin|portout)\s+(.+)$/,
  state: /^(state)\s+(.+)$/,
};
const COMPONENT_TYPES = {
  component: 'component', node: 'rect', database: 'cylinder', cloud: 'cloud', folder: 'package', frame: 'rect', artifact: 'document', storage: 'rounded',
  queue: 'cylinder', rectangle: 'rect', file: 'document', card: 'rect', agent: 'rect', stack: 'rect', actor: 'actor', interface: 'ellipse', package: 'package',
  collections: 'rect', boundary: 'ellipse', control: 'ellipse', entity: 'ellipse', usecase: 'ellipse', hexagon: 'hexagon', label: 'text', person: 'actor',
  port: 'rect', portin: 'rect', portout: 'rect',
};

// left end, line (with an optional [#colour] or direction inside), right end
const NODE_TOKEN = String.raw`"[^"]+"|\[\*\]|\[[^\]]+\]|\([^)]+\)|:[^:]+:|\(\)\s*(?:"[^"]+"|[^\s"]+)|[^\s"]+?`;
const REL_RE = new RegExp(String.raw`^(${NODE_TOKEN})\s*("[^"]*")?`
  + String.raw`\s*(<\|\||<\||\^|[<*o#x}+])?((?:-+|\.+|=+)(?:\[[^\]]*\]|(?:up|down|left|right|u|d|l|r|le|ri|do)(?=[-.]))?(?:-*|\.*|=*))(\|\|>|\|>|\^|[>*o#x{+])?`
  + String.raw`\s*("[^"]*")?\s*("[^"]+"|\[\*\]|\[[^\]]+\]|\([^)]+\)|:[^:]+:|[^\s:"]+)\s*(?::\s*(.*))?$`);
const HEAD = { '<|': 'block-open', '|>': 'block-open', '<||': 'block-open', '||>': 'block-open', '^': 'block-open', '*': 'diamond', o: 'diamond-open', '<': 'open', '>': 'open', '#': 'classic', x: 'open', '}': 'er-many', '{': 'er-many', '+': 'oval' };

function graph(lines, kind) {
  const nodes = new Map();
  const edges = [];
  let direction = kind === 'usecase' ? 'TB' : 'TB';
  let start = null, end = null;

  const add = (id, text, type, extra = {}) => {
    const known = nodes.get(id);
    if (known) { if (text != null && text !== id) known.text = text; if (type) known.type = type; Object.assign(known, extra); return known; }
    const n = { id, text: text ?? id, type: type || (kind === 'class' ? 'class' : kind === 'usecase' ? 'ellipse' : kind === 'state' ? 'rounded' : 'component'), members: [], ...extra };
    nodes.set(id, n);
    return n;
  };

  /** A node reference in a relation: Name, "Name", [Component], (Use case), :Actor:, () Interface, [*]. */
  const relation = (line) => { const m = REL_RE.exec(line); return m && (m[4].length > 1 || m[3] || m[5] || /\s[-.]\s/.test(line)) ? m : null; };
  const ref = (token, side) => {
    let s = token.trim();
    if (s === '[*]') {
      if (kind !== 'state') return add('[*]', '', 'event-start');
      if (side === 'from') { start = start || add('[*]start', '', 'event-start'); return start; }
      end = end || add('[*]end', '', 'event-end');
      return end;
    }
    let m;
    if ((m = /^\[([^\]]+)\]$/.exec(s))) return add(m[1].trim(), m[1].trim(), 'component');
    if ((m = /^\(([^)]+)\)$/.exec(s))) return add(m[1].trim(), m[1].trim(), 'ellipse');
    if ((m = /^:([^:]+):$/.exec(s))) return add(m[1].trim(), m[1].trim(), 'actor');
    if ((m = /^\(\)\s*(.+)$/.exec(s))) { const name = unquote(m[1]); return add(name, name, 'ellipse', { small: true }); }
    s = unquote(s);
    return nodes.get(s) || [...nodes.values()].find((n) => n.text === s) || add(s, s, null);
  };

  /** "Long name" as Alias, Alias as "Long name", Name <<stereotype>>, Name<T> … */
  const declared = (rest) => {
    rest = rest.replace(/\s*\{\s*$/, '').replace(/\s*#\S+\s*$/, '').trim();
    let m;
    let stereotype = '';
    if ((m = /\s*(<<[^>]*>>)\s*/.exec(rest))) { stereotype = m[1]; rest = rest.replace(m[0], ' ').trim(); }
    let id, text;
    if ((m = /^("[^"]+"|\[[^\]]+\]|\([^)]+\)|:[^:]+:|\S+)\s+as\s+("[^"]+"|\S+)$/.exec(rest))) {
      const a = m[1], b = m[2];
      if (b.startsWith('"')) { id = a.replace(/^[[(:]|[\]):]$/g, ''); text = b; } else { text = a.replace(/^[[(:]|[\]):]$/g, ''); id = unquote(b); }
      text = unquote(text);
    } else {
      id = rest.replace(/^[[(:]|[\]):]$/g, '');
      text = id = unquote(id);
      if ((m = /^(\S+)\s*:\s*(.+)$/.exec(rest)) && kind === 'state') { id = text = unquote(m[1]); return { id, text, stereotype, description: m[2] }; }
    }
    return { id, text: clean(text), stereotype: stereotype ? clean(stereotype) : '' };
  };

  let open = null; // a class whose { members } are being read
  for (const line of lines) {
    if (SKIP.test(line)) continue;
    if (/^left\s+to\s+right\s+direction$/i.test(line)) { direction = 'LR'; continue; }
    if (/^top\s+to\s+bottom\s+direction$/i.test(line)) { direction = 'TB'; continue; }
    if (open) {
      if (line.startsWith('}')) { open = null; continue; }
      open.members.push(line.replace(/^\{(static|abstract|classifier)\}\s*/, ''));
      continue;
    }
    if (/^(note|end note|title)\b/.test(line) || line === '}' || line === '{') continue;
    let m = DECLARE[kind] && DECLARE[kind].exec(line);
    if (kind === 'usecase' && !m) m = DECLARE.component.exec(line);
    if (m && !relation(line)) {
      const word = m[1].replace(/\s+/g, ' ');
      const d = declared(m[2]);
      if (/^(package|rectangle|frame|folder|node|cloud)$/.test(word) && /\{\s*$/.test(line) && kind !== 'component') continue; // (a container: its contents follow)
      let type;
      if (kind === 'class') type = 'class';
      else if (kind === 'state') type = 'rounded';
      else if (word === 'actor' || word === 'business actor') type = 'actor';
      else if (word === 'usecase') type = 'ellipse';
      else type = COMPONENT_TYPES[word] || 'rect';
      const prefix = kind === 'class' && word !== 'class' && word !== 'circle' ? `«${word.replace('abstract class', 'abstract')}» ` : '';
      const n = add(d.id, `${prefix}${d.stereotype ? `${d.stereotype} ` : ''}${d.text}`, type);
      if (d.description) n.members.push(d.description);
      if (kind === 'class' && /\{\s*$/.test(line)) open = n;
      if (kind === 'state' && /\{\s*$/.test(line)) continue; // (nested states are drawn flat)
      continue;
    }
    // relation
    m = relation(line);
    if (m) {
      const [, left, m1, headL, lineTok, headR, m2, right, label] = m;
      const a = ref(left, 'from'), b = ref(right, 'to');
      const text = [label ? clean(label.replace(/\s+[<>]$/, '').replace(/^[<>]\s+/, '')) : '', m1 || m2 ? `${unquote(m1) || ' '} … ${unquote(m2) || ' '}`.trim() : ''].filter(Boolean).join('\n');
      const horizontal = /^(?:-|\.)(?:\[[^\]]*\])?$/.test(lineTok) || /(left|right|le|ri|l|r)(?=[-.])/.test(lineTok);
      edges.push({ from: a.id, to: b.id, text, dash: lineTok.includes('.'), thick: lineTok.includes('='), startArrow: headL ? HEAD[headL] || 'classic' : 'none',
        endArrow: headR ? HEAD[headR] || 'classic' : 'none', horizontal });
      continue;
    }
    // "Name : member" (classes), "State : description" (states)
    if ((m = /^("[^"]+"|[^\s:]+)\s*:\s*(.+)$/.exec(line))) { add(unquote(m[1]), null, null).members.push(m[2].trim()); continue; }
    // a bare reference on its own line: [Component], (Use case), :Actor:, Name
    if (/^(\[[^\]]+\]|\([^)]+\)|:[^:]+:)(\s+as\s+\S+)?$/.test(line)) {
      const d = declared(line);
      add(d.id, d.text, line.startsWith('[') ? 'component' : line.startsWith('(') ? 'ellipse' : 'actor');
    }
  }

  // class members: fields, then a separator, then methods
  for (const n of nodes.values()) {
    if (!n.members.length) continue;
    if (n.type === 'class') {
      const fields = n.members.filter((x) => !x.includes('(') && !/^[-=_.]{2,}/.test(x)), methods = n.members.filter((x) => x.includes('('));
      n.text = [n.text, ...fields, ...(methods.length ? ['--', ...methods] : [])].join('\n');
    } else n.text = [n.text, ...n.members].join('\n');
  }
  // a class without members still gets its title compartment
  const out = [...nodes.values()].map((n) => {
    const node = { id: n.id, text: n.text, type: n.type };
    if (n.type === 'event-start' || n.type === 'event-end') Object.assign(node, { w: 30, h: 30, style: n.type === 'event-end' ? { fill: '#ffffff', strokeWidth: 5 } : { fill: '#000000' } });
    if (n.type === 'actor') Object.assign(node, { w: 30, h: 60 });
    return node;
  });
  if (!out.length) throw new PlantUmlError('the diagram contains no elements');
  return { kind: 'graph', direction, nodes: out, edges };
}

// ---- activity diagrams ------------------------------------------------------------------------------------------------------

function activity(lines) {
  const nodes = [];
  const edges = [];
  let n = 0;
  const node = (type, text = '', extra = {}) => { const x = { id: `a${++n}`, type, text, ...extra }; nodes.push(x); return x; };
  // the open ends that the next element connects to: [{ id, label }]
  let ends = [];
  const connect = (to) => {
    for (const e of ends) edges.push({ from: e.id, to: to.id, text: e.label || '', dash: false, thick: false, startArrow: 'none', endArrow: 'classic', back: e.back });
    ends = [{ id: to.id, label: '' }];
  };
  const stack = []; // open if / while / repeat / fork blocks

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (SKIP.test(line) || /^(title|note|end note|floating note|partition|group|end group|\}|\|[^|]*\||detach$|kill$)/.test(line)) {
      if (/^(detach|kill)$/.test(line)) ends = [];
      continue;
    }
    let m;
    if (line === 'start') { const s = node('event-start', '', { w: 30, h: 30, style: { fill: '#000000' } }); connect(s); continue; }
    if (line === 'stop' || line === 'end') { const s = node('event-end', '', { w: 30, h: 30, style: { fill: '#ffffff', strokeWidth: 5 } }); connect(s); ends = []; continue; }
    if (line.startsWith(':')) {
      // :text; – the text may continue over several lines
      let body = line.slice(1);
      while (!/[;|<>/\]}]$/.test(body) && i + 1 < lines.length) body += `\n${lines[++i]}`;
      const a = node('rounded', clean(body.replace(/[;|<>/\]}]$/, '')));
      connect(a);
      continue;
    }
    if ((m = /^if\s*\((.*?)\)\s*(?:then\s*\((.*)\))?\s*$/.exec(line)) || (m = /^if\s*\((.*)\)\s*is\s*\((.*)\)\s*then$/.exec(line))) {
      const d = node('diamond', clean(m[1]));
      connect(d);
      ends = [{ id: d.id, label: clean(m[2] || '') }];
      stack.push({ kind: 'if', diamond: d, done: [], hasElse: false });
      continue;
    }
    if ((m = /^(?:elseif|else\s*if)\s*\((.*?)\)\s*(?:then\s*\((.*)\))?$/.exec(line))) {
      const b = stack[stack.length - 1];
      if (!b || b.kind !== 'if') continue;
      b.done.push(...ends);
      const d = node('diamond', clean(m[1]));
      edges.push({ from: b.diamond.id, to: d.id, text: '', dash: false, thick: false, startArrow: 'none', endArrow: 'classic' });
      b.diamond = d;
      ends = [{ id: d.id, label: clean(m[2] || '') }];
      continue;
    }
    if ((m = /^else\s*(?:\((.*)\))?$/.exec(line))) {
      const b = stack[stack.length - 1];
      if (!b || b.kind !== 'if') continue;
      b.done.push(...ends);
      b.hasElse = true;
      ends = [{ id: b.diamond.id, label: clean(m[1] || '') }];
      continue;
    }
    if (/^end\s*if$/.test(line)) {
      const b = stack.pop();
      if (!b || b.kind !== 'if') continue;
      ends = [...b.done, ...ends, ...(b.hasElse ? [] : [{ id: b.diamond.id, label: '' }])];
      continue;
    }
    if ((m = /^while\s*\((.*?)\)\s*(?:is\s*\((.*)\))?$/.exec(line))) {
      const d = node('diamond', clean(m[1]));
      connect(d);
      ends = [{ id: d.id, label: clean(m[2] || '') }];
      stack.push({ kind: 'while', diamond: d });
      continue;
    }
    if ((m = /^end\s*while\s*(?:\((.*)\))?$/.exec(line))) {
      const b = stack.pop();
      if (!b || b.kind !== 'while') continue;
      for (const e of ends) edges.push({ from: e.id, to: b.diamond.id, text: e.label || '', dash: false, thick: false, startArrow: 'none', endArrow: 'classic' });
      ends = [{ id: b.diamond.id, label: clean(m[1] || '') }];
      continue;
    }
    if (line === 'repeat' || /^repeat\s*:/.test(line)) {
      const first = { kind: 'repeat', first: null, index: nodes.length };
      stack.push(first);
      if (line !== 'repeat') { const a = node('rounded', clean(line.replace(/^repeat\s*:/, '').replace(/;$/, ''))); connect(a); first.first = a; }
      continue;
    }
    if ((m = /^repeat\s*while\s*\((.*?)\)\s*(?:is\s*\((.*?)\))?\s*(?:not\s*\((.*)\))?$/.exec(line))) {
      const b = stack.pop();
      if (!b || b.kind !== 'repeat') continue;
      const d = node('diamond', clean(m[1]));
      connect(d);
      const target = b.first || nodes[b.index];
      if (target) edges.push({ from: d.id, to: target.id, text: clean(m[2] || ''), dash: false, thick: false, startArrow: 'none', endArrow: 'classic' });
      ends = [{ id: d.id, label: clean(m[3] || '') }];
      continue;
    }
    if (line === 'fork' || line === 'split') {
      const bar = node('rect', '', { w: 140, h: 6, style: { fill: '#000000' } });
      connect(bar);
      stack.push({ kind: 'fork', bar, done: [] });
      continue;
    }
    if (line === 'fork again' || line === 'split again') {
      const b = stack[stack.length - 1];
      if (!b || b.kind !== 'fork') continue;
      b.done.push(...ends);
      ends = [{ id: b.bar.id, label: '' }];
      continue;
    }
    if (/^end\s*(fork|merge|split)/.test(line)) {
      const b = stack.pop();
      if (!b || b.kind !== 'fork') continue;
      ends = [...b.done, ...ends];
      const bar = node('rect', '', { w: 140, h: 6, style: { fill: '#000000' } });
      connect(bar);
      continue;
    }
    if (/^(->|-\[)/.test(line)) { // an arrow label: -> text;
      m = /^-(?:\[[^\]]*\])?>\s*(.*?);?$/.exec(line);
      if (m && m[1]) ends = ends.map((e) => ({ ...e, label: clean(m[1]) }));
      continue;
    }
  }
  // a repeat without its own first action loops back to the element after "repeat"
  if (!nodes.length) throw new PlantUmlError('the activity diagram contains no elements');
  return { kind: 'graph', direction: 'TB', nodes, edges };
}

// ---- sequence diagrams ------------------------------------------------------------------------------------------------------

const PARTICIPANT_RE = /^(participant|actor|boundary|control|entity|database|collections|queue)\s+(.+?)(?:\s+order\s+\d+)?(?:\s+#\S+)?$/;
const PARTICIPANT_TYPES = { participant: 'rect', actor: 'actor', boundary: 'rect', control: 'rect', entity: 'rect', database: 'cylinder', collections: 'rect', queue: 'cylinder' };
const MESSAGE_RE = /^("[^"]+"|[^\s<>\-/\\]+|\[|\])\s*(<<?|\/\/?|\\\\?|x|o)?(-{1,2})(?:\[[^\]]*\])?(-?)(>>?x?|>?x|\\\\?|\/\/?|o)?\s*("[^"]+"|[^\s:]+|\[|\])\s*(?::\s*(.*))?$/;

function sequence(lines) {
  const parts = new Map();
  const rows = []; // { kind: 'msg' | 'note' | 'divider' | 'space' | 'frame-start' | 'frame-else' | 'frame-end', … }
  let title = '';
  let autonumber = 0;
  const participant = (raw, type) => {
    let m = /^("[^"]+")\s+as\s+(\S+)$/.exec(raw) || /^(\S+)\s+as\s+("[^"]+"|\S+)$/.exec(raw);
    let id, text;
    if (m) { if (m[2].startsWith('"')) { id = unquote(m[1]); text = unquote(m[2]); } else { text = unquote(m[1]); id = unquote(m[2]); } } else id = text = unquote(raw);
    const known = parts.get(id);
    if (known) { if (type) known.type = type; if (text !== id) known.text = text; return known; }
    const p = { id, text: clean(text), type: type || 'rect', index: parts.size };
    parts.set(id, p);
    return p;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (SKIP.test(line) || /^(activate|deactivate|destroy|create|return|ref over|end ref|box|end box)\b/.test(line)) continue;
    let m;
    if ((m = /^title\s+(.+)$/.exec(line))) { title = clean(m[1]); continue; }
    if ((m = /^autonumber\b\s*(\d+)?/.exec(line))) { autonumber = m[1] ? +m[1] : 1; continue; }
    if ((m = PARTICIPANT_RE.exec(line))) { participant(m[2], PARTICIPANT_TYPES[m[1]]); continue; }
    if ((m = /^(alt|opt|loop|par|critical|break|group)\b\s*(.*)$/.exec(line))) { rows.push({ kind: 'frame-start', label: `${m[1]}${m[2] ? ` [${clean(m[2])}]` : ''}` }); continue; }
    if ((m = /^else\b\s*(.*)$/.exec(line))) { rows.push({ kind: 'frame-else', label: m[1] ? `[${clean(m[1])}]` : '' }); continue; }
    if (line === 'end') { rows.push({ kind: 'frame-end' }); continue; }
    if ((m = /^==\s*(.*?)\s*==$/.exec(line))) { rows.push({ kind: 'divider', label: clean(m[1]) }); continue; }
    if (/^(\.\.\.|\|\|\|)/.test(line)) { rows.push({ kind: 'space' }); continue; }
    if ((m = /^(?:h|r)?note\s+(left|right|over)\s*(?:of\s+)?([^:]+?)\s*(?::\s*(.*))?$/.exec(line))) {
      let text = m[3];
      if (text == null) { const body = []; while (i + 1 < lines.length && !/^end\s*(h|r)?note$/.test(lines[i + 1])) body.push(lines[++i]); i++; text = body.join('\n'); }
      const who = m[2].split(',').map((s) => participant(s.trim()));
      rows.push({ kind: 'note', side: m[1], who, text: clean(text) });
      continue;
    }
    if ((m = MESSAGE_RE.exec(line)) && (m[2] || m[5])) {
      const [, l, headL, dash1, dash2, headR, r, label] = m;
      const a = l === '[' || l === ']' ? null : participant(l), b = r === '[' || r === ']' ? null : participant(r);
      if (!a || !b) continue;
      const reverse = !!headL && !headR;
      const text = clean(label || '');
      rows.push({ kind: 'msg', from: reverse ? b : a, to: reverse ? a : b, text: autonumber ? `${autonumber++}${text ? ` ${text}` : ''}` : text,
        dash: (dash1 + dash2).length > 1, arrow: /x/.test(headR || headL || '') ? 'open' : (headR || headL || '').length > 1 ? 'open' : 'classic' });
    }
  }
  if (!parts.size) throw new PlantUmlError('the sequence diagram contains no participants');

  // placement: participants in a row, then one row per message
  const shapes = [], edges = [];
  const top = title ? 90 : 40, origin = 40, headH = 40;
  let x = origin;
  const list = [...parts.values()];
  for (const p of list) {
    const size = sizeFor('rect', p.text);
    p.w = p.type === 'actor' ? 30 : Math.max(100, size.w);
    p.h = p.type === 'actor' ? 50 : p.type === 'cylinder' ? 56 : headH;
    p.cx = x + Math.max(p.w, 100) / 2;
    x += Math.max(p.w, 100) + 60;
  }
  // wide labels: more room between neighbours
  for (const r of rows) {
    if (r.kind !== 'msg' || r.from === r.to) continue;
    const [lo, hi] = r.from.index < r.to.index ? [r.from, r.to] : [r.to, r.from];
    const need = Math.max(...r.text.split('\n').map((s) => s.length)) * 6.5 + 40;
    const have = hi.cx - lo.cx;
    if (need > have) for (const p of list) if (p.index >= hi.index) p.cx += need - have;
  }
  for (const p of list) {
    const s = makeShape(p.type, Math.round(p.cx - p.w / 2), top + headH - p.h, p.w, p.h, { text: p.text });
    p.shape = s;
    shapes.push(s);
  }
  let y = top + headH + 40;
  const frames = [];
  const left = Math.min(...list.map((p) => p.cx)) - 70, right = Math.max(...list.map((p) => p.cx)) + 70;
  for (const r of rows) {
    if (r.kind === 'msg') {
      const lines = r.text ? r.text.split('\n').length : 0;
      y += Math.max(0, lines - 1) * 14;
      if (r.from === r.to) {
        edges.push(makeEdge({ x: r.from.cx, y }, { x: r.from.cx, y: y + 24 }, { text: r.text, route: 'straight', waypoints: [{ x: r.from.cx + 50, y }, { x: r.from.cx + 50, y: y + 24 }],
          style: { dash: r.dash, endArrow: r.arrow }, extra: { labelAlign: 'left' } }));
        y += 60;
      } else {
        edges.push(makeEdge({ x: r.from.cx, y }, { x: r.to.cx, y }, { text: r.text, route: 'straight', style: { dash: r.dash, endArrow: r.arrow } }));
        y += 44;
      }
    } else if (r.kind === 'note') {
      const size = sizeFor('note', r.text);
      const xs = r.who.map((p) => p.cx);
      let nx;
      if (r.side === 'over') { const lo = Math.min(...xs), hi = Math.max(...xs); size.w = Math.max(size.w, hi - lo + 60); nx = (lo + hi) / 2 - size.w / 2; } else nx = r.side === 'left' ? xs[0] - 15 - size.w : xs[0] + 15;
      shapes.push(makeShape('note', Math.round(nx), Math.round(y - 14), size.w, size.h, { text: r.text }));
      y += size.h + 10;
    } else if (r.kind === 'divider') {
      shapes.push(makeShape('rect', Math.round((left + right) / 2 - 80), y - 14, 160, 28, { text: r.label, style: { fill: '#eeeeee' } }));
      y += 44;
    } else if (r.kind === 'space') y += 30;
    else if (r.kind === 'frame-start') { frames.push({ y: y - 30, label: r.label, elses: [] }); y += 16; }
    else if (r.kind === 'frame-else' && frames.length) { frames[frames.length - 1].elses.push({ y: y - 22, label: r.label }); y += 16; } else if (r.kind === 'frame-end' && frames.length) {
      const f = frames.pop();
      const depth = frames.length * 8;
      const frame = makeShape('rect', Math.round(left + depth), f.y, Math.round(right - left - 2 * depth), y - f.y - 10,
        { text: f.label, style: { fill: 'none', align: 'left', valign: 'top', fontSize: 11, bold: true } });
      shapes.unshift(frame);
      for (const e of f.elses) {
        edges.push(makeEdge({ x: frame.x, y: e.y }, { x: frame.x + frame.w, y: e.y }, { text: e.label, route: 'straight', style: { dash: true, endArrow: 'none', fontSize: 10 } }));
      }
      y += 10;
    }
  }
  // lifelines from the participants down to below the last row
  for (const p of list) edges.unshift(makeEdge({ id: p.shape.id, ax: 0.5, ay: 1 }, { x: p.cx, y: y + 10 }, { route: 'straight', style: { dash: true, endArrow: 'none', stroke: '#888888' } }));
  if (title) shapes.unshift(makeShape('text', Math.round(left), 40, Math.round(right - left), 30, { text: title, style: { fontSize: 16, bold: true } }));
  return { kind: 'sequence', shapes, edges };
}

/** Parse PlantUML text. */
export function parsePlantUml(text) {
  const lines = linesOf(text);
  const kind = plantUmlKind(lines);
  if (kind === 'activity') return activity(lines);
  if (kind === 'sequence') return sequence(lines);
  return graph(lines, kind);
}

/** Whether a text looks like PlantUML (rather than Mermaid). */
export const isPlantUml = (text) => /@start(uml|mindmap|wbs|json|yaml|salt)\b/.test(text);
