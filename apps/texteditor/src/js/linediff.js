/*
 * Line diff for comparing texts (@codemirror/merge, diffConfig.override).
 *
 * The character diff of @codemirror/merge gives up after a scan limit and then reports one big change from the first
 * difference to the end. Here the changed lines are found first (Myers' O(ND) algorithm on whole lines, as diff and git
 * do); only inside each block of changed lines the character diff marks the changed words.
 *
 *   import { lineDiff } from 'app/linediff';
 *   new MergeView({ …, diffConfig: { override: lineDiff } })
 *   lineDiff(a, b) -> [Change { fromA, toA, fromB, toB }]   (character offsets)
 */
import { diff, Change } from '@codemirror/merge';

// a block of changed lines up to this size (characters on both sides) is refined to words and characters
const REFINE_LIMIT = 20000;
// more work than this (lines × edits) means the texts have little in common: the rest is one change
const MAX_WORK = 4e7;

/** Lines of a text with their line breaks (offsets of a line = sum of the lengths before). */
function splitLines(text) {
  const lines = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) { lines.push(text.slice(start, i + 1)); start = i + 1; }
  }
  if (start < text.length) lines.push(text.slice(start));
  return lines;
}

/**
 * Myers' diff of two number arrays: the matching pairs [[i, j], …] of a shortest edit script, or null when it would
 * take more than MAX_WORK steps.
 */
function myers(a, b) {
  const n = a.length, m = b.length, max = n + m;
  if (!max) return [];
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace = [];
  let work = 0;
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice(offset - d - 1, offset + d + 2)); // the frontier before this step (k = -d-1 … d+1)
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[offset + k] = x;
      if (x >= n && y >= m) return backtrack(trace, d, n, m);
    }
    work += n + m;
    if (work > MAX_WORK) return null;
  }
  return null;
}

function backtrack(trace, dEnd, n, m) {
  const pairs = [];
  let x = n, y = m;
  for (let d = dEnd; d > 0; d--) {
    const v = trace[d]; // index of k in this frontier: k + d + 1
    const k = x - y;
    const at = (kk) => v[kk + d + 1];
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = at(prevK), prevY = prevX - prevK;
    while (x > prevX && y > prevY) { x--; y--; pairs.push([x, y]); }
    x = prevX; y = prevY;
  }
  while (x > 0 && y > 0) { x--; y--; pairs.push([x, y]); }
  return pairs.reverse();
}

export function lineDiff(a, b) {
  const la = splitLines(a), lb = splitLines(b);
  // the same line gets the same number
  const ids = new Map();
  const id = (line) => { let v = ids.get(line); if (v === undefined) { v = ids.size; ids.set(line, v); } return v; };
  const na = la.map(id), nb = lb.map(id);
  // common lines at the start and end need no search
  let start = 0;
  while (start < na.length && start < nb.length && na[start] === nb[start]) start++;
  let endA = na.length, endB = nb.length;
  while (endA > start && endB > start && na[endA - 1] === nb[endB - 1]) { endA--; endB--; }
  const inner = myers(na.slice(start, endA), nb.slice(start, endB));
  const pairs = [];
  for (let i = 0; i < start; i++) pairs.push([i, i]);
  if (inner) for (const [i, j] of inner) pairs.push([i + start, j + start]);
  for (let i = endA, j = endB; i < na.length; i++, j++) pairs.push([i, j]);
  pairs.push([la.length, lb.length]); // sentinel

  // character offset of each line
  const offsets = (lines) => { const o = [0]; for (const l of lines) o.push(o[o.length - 1] + l.length); return o; };
  const oa = offsets(la), ob = offsets(lb);
  const changes = [];
  let i = 0, j = 0;
  for (const [pi, pj] of pairs) {
    if (pi > i || pj > j) block(oa[i], oa[pi], ob[j], ob[pj]);
    i = pi + 1; j = pj + 1;
  }
  return changes;

  /** A block of changed lines: refined to the changed characters when it is small enough. */
  function block(fromA, toA, fromB, toB) {
    if (fromA < toA && fromB < toB && toA - fromA + toB - fromB <= REFINE_LIMIT) {
      for (const c of diff(a.slice(fromA, toA), b.slice(fromB, toB), { scanLimit: 1e6, timeout: 500 })) {
        changes.push(new Change(c.fromA + fromA, c.toA + fromA, c.fromB + fromB, c.toB + fromB));
      }
    } else changes.push(new Change(fromA, toA, fromB, toB));
  }
}
