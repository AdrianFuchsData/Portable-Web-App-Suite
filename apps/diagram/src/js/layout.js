/*
 * Automatic layout of a diagram page (layered, like dagre/Graphviz "dot", in a small version):
 *   1. cycles are broken by reversing back edges (depth-first search),
 *   2. ranks by longest path from the sources,
 *   3. order within a rank by repeated barycenter sweeps (fewer crossings),
 *   4. coordinates: ranks as rows (TB/BT) or columns (LR/RL), nodes centred in their rank.
 * Unconnected shapes are placed in a row below (or next to) the graph.
 *
 *   layout({ shapes, edges }, { direction: 'TB' | 'LR' | 'BT' | 'RL', rankGap, nodeGap }) -> Map(id -> { x, y })
 */

export function layout({ shapes, edges }, { direction = 'TB', rankGap = 70, nodeGap = 40, origin = { x: 40, y: 40 } } = {}) {
  const ids = shapes.map((s) => s.id);
  const byId = new Map(shapes.map((s) => [s.id, s]));
  const out = new Map(ids.map((id) => [id, []]));
  const links = [];
  for (const e of edges) {
    const a = e.from && e.from.id, b = e.to && e.to.id;
    if (!byId.has(a) || !byId.has(b) || a === b) continue;
    links.push([a, b]);
  }
  // 1. break cycles
  const state = new Map();
  const reversed = new Set();
  for (const [a, b] of links) out.get(a).push(b);
  const visit = (v) => {
    state.set(v, 1);
    for (const w of out.get(v)) {
      if (state.get(w) === 1) reversed.add(`${v}>${w}`);
      else if (!state.get(w)) visit(w);
    }
    state.set(v, 2);
  };
  for (const id of ids) if (!state.get(id)) visit(id);
  const dag = links.map(([a, b]) => (reversed.has(`${a}>${b}`) ? [b, a] : [a, b]));
  const succ = new Map(ids.map((id) => [id, []]));
  const pred = new Map(ids.map((id) => [id, []]));
  for (const [a, b] of dag) { succ.get(a).push(b); pred.get(b).push(a); }
  // 2. ranks (longest path), in topological order
  const indeg = new Map(ids.map((id) => [id, pred.get(id).length]));
  const queue = ids.filter((id) => !indeg.get(id));
  const rank = new Map(ids.map((id) => [id, 0]));
  for (let i = 0; i < queue.length; i++) {
    const v = queue[i];
    for (const w of succ.get(v)) {
      rank.set(w, Math.max(rank.get(w), rank.get(v) + 1));
      indeg.set(w, indeg.get(w) - 1);
      if (!indeg.get(w)) queue.push(w);
    }
  }
  const connected = new Set(dag.flat());
  const graphIds = ids.filter((id) => connected.has(id));
  const loose = ids.filter((id) => !connected.has(id));
  const layers = [];
  for (const id of graphIds) (layers[rank.get(id)] = layers[rank.get(id)] || []).push(id);
  for (let r = 0; r < layers.length; r++) layers[r] = layers[r] || [];
  // 3. ordering: barycenter sweeps down and up
  const pos = new Map();
  const index = () => layers.forEach((layer) => layer.forEach((id, i) => pos.set(id, i)));
  index();
  const bary = (id, neighbours) => {
    const list = neighbours.get(id).filter((n) => pos.has(n));
    return list.length ? list.reduce((s, n) => s + pos.get(n), 0) / list.length : pos.get(id);
  };
  for (let iter = 0; iter < 8; iter++) {
    const down = iter % 2 === 0;
    const range = down ? layers.map((_, i) => i).slice(1) : layers.map((_, i) => i).reverse().slice(1);
    for (const r of range) {
      const nb = down ? pred : succ;
      layers[r] = layers[r].map((id) => [id, bary(id, nb)]).sort((x, y) => x[1] - y[1]).map(([id]) => id);
      layers[r].forEach((id, i) => pos.set(id, i));
    }
  }
  // 4. coordinates
  const horizontal = direction === 'LR' || direction === 'RL';
  const along = (s) => (horizontal ? s.h : s.w); // size within a rank
  const across = (s) => (horizontal ? s.w : s.h); // size along the rank direction
  const rankSize = layers.map((layer) => Math.max(0, ...layer.map((id) => across(byId.get(id)))));
  const widths = layers.map((layer) => layer.reduce((sum, id) => sum + along(byId.get(id)), 0) + nodeGap * Math.max(0, layer.length - 1));
  const widest = Math.max(0, ...widths);
  const result = new Map();
  let offset = 0;
  layers.forEach((layer, r) => {
    let p = (widest - widths[r]) / 2;
    for (const id of layer) {
      const s = byId.get(id);
      const cross = offset + (rankSize[r] - across(s)) / 2;
      result.set(id, horizontal ? { x: cross, y: p } : { x: p, y: cross });
      p += along(s) + nodeGap;
    }
    offset += rankSize[r] + rankGap;
  });
  const total = Math.max(0, offset - rankGap);
  if (direction === 'BT' || direction === 'RL') {
    for (const [id, q] of result) {
      const s = byId.get(id);
      if (direction === 'BT') q.y = total - q.y - s.h; else q.x = total - q.x - s.w;
    }
  }
  // unconnected shapes after the graph
  let p = 0;
  const after = graphIds.length ? total + rankGap : 0;
  for (const id of loose) {
    const s = byId.get(id);
    result.set(id, horizontal ? { x: after, y: p } : { x: p, y: after });
    p += along(s) + nodeGap;
  }
  for (const q of result.values()) { q.x = Math.round(q.x + origin.x); q.y = Math.round(q.y + origin.y); }
  return result;
}
