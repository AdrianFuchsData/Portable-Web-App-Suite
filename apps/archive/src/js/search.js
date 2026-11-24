/*
 * Search in an archive: by name (with * and ? wildcards, or a part of the name) through all folders, and in the contents of the
 * files (text or regular expression). Binary files (a NUL byte at the start), encrypted files and files above the size limit
 * are skipped and counted.
 */

/** A test for a file or folder name: wildcards (* any, ? one character) or a part of the name, case ignored. */
export function nameMatcher(pattern) {
  const p = (pattern || '').trim();
  if (!p) return () => true;
  if (/[*?]/.test(p)) {
    const re = new RegExp(`^${p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
    return (name) => re.test(name);
  }
  const low = p.toLowerCase();
  return (name) => name.toLowerCase().includes(low);
}

/** The entries whose name (the last part of the path) matches, folders included. */
export function searchNames(entries, pattern) {
  const test = nameMatcher(pattern);
  const seen = new Set(), out = [];
  for (const e of entries) {
    // folders that are only implied by paths count as entries too
    const parts = e.path.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const path = parts.slice(0, i).join('/');
      if (seen.has(path)) continue;
      const isDir = i < parts.length || e.dir;
      seen.add(path);
      if (test(parts[i - 1])) out.push({ path, dir: isDir, entry: i === parts.length ? e : null, size: i === parts.length && !e.dir ? e.size || 0 : null });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export class SearchError extends Error {}

/** The regular expression for a content search. */
export function contentPattern(text, { regex = false, caseSensitive = false } = {}) {
  if (!text) throw new SearchError('empty');
  try { return new RegExp(regex ? text : text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), `g${caseSensitive ? '' : 'i'}u`); } catch (e) { throw new SearchError(e.message); }
}

/** Matches of re in text: [{ line, column, before, match, after }] (at most `limit`). */
export function matchesIn(text, re, limit = 20) {
  const out = [];
  re.lastIndex = 0;
  let m, line = 1, lineStart = 0, scanned = 0;
  while ((m = re.exec(text)) && out.length < limit) {
    if (!m[0].length) { re.lastIndex++; continue; }
    for (; scanned < m.index; scanned++) if (text.charCodeAt(scanned) === 10) { line++; lineStart = scanned + 1; }
    const lineEnd = text.indexOf('\n', m.index);
    const end = lineEnd < 0 ? text.length : lineEnd;
    out.push({ line, column: m.index - lineStart + 1, before: text.slice(Math.max(lineStart, m.index - 60), m.index), match: m[0].slice(0, 200), after: text.slice(m.index + m[0].length, Math.min(end, m.index + m[0].length + 60)) });
  }
  return out;
}

/**
 * Search the contents of the files: onResult({ path, entry, matches }) for every file with matches; returns
 * { files, searched, skipped: { binary, encrypted, large } }. isCancelled() stops it between files.
 */
export async function searchContents(entries, re, { limit = 32 * 1024 * 1024, perFile = 20, onResult, onProgress = () => {}, isCancelled = () => false } = {}) {
  const decoder = new TextDecoder('utf-8');
  const skipped = { binary: 0, encrypted: 0, large: 0 };
  let searched = 0, files = 0;
  const list = entries.filter((e) => !e.dir && !e.link);
  for (let i = 0; i < list.length; i++) {
    if (isCancelled()) break;
    const e = list[i];
    onProgress(i, list.length);
    if ((e.size || 0) > limit) { skipped.large++; continue; }
    let data;
    try { data = await e.load(); } catch (err) { if (e.encrypted) { skipped.encrypted++; continue; } throw err; }
    const head = data.subarray(0, 8000);
    if (head.includes(0)) { skipped.binary++; continue; }
    searched++;
    const found = matchesIn(decoder.decode(data), re, perFile);
    if (found.length) { files++; onResult({ path: e.path, entry: e, matches: found }); }
    if (i % 20 === 19) await new Promise((r) => setTimeout(r)); // (the page stays responsive)
  }
  onProgress(list.length, list.length);
  return { files, searched, skipped };
}

// ---- comparing two archives ---------------------------------------------------------------------------------------------

const sameBytes = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };

/**
 * The differences of two entry lists (files only): [{ path, status: 'onlyA' | 'onlyB' | 'changed' | 'same' | 'unknown', a, b }]
 * sorted by path. Files in both are compared by stored CRC and size when both have them (ZIP), otherwise by content;
 * encrypted files that cannot be read are 'unknown'.
 */
export async function compareEntries(listA, listB, { onProgress = () => {} } = {}) {
  const files = (list) => new Map(list.filter((e) => !e.dir && !e.link).map((e) => [e.path, e]));
  const A = files(listA), B = files(listB);
  const paths = [...new Set([...A.keys(), ...B.keys()])].sort((x, y) => x.localeCompare(y));
  const out = [];
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i], a = A.get(path), b = B.get(path);
    onProgress(i, paths.length);
    if (!b) { out.push({ path, status: 'onlyA', a }); continue; }
    if (!a) { out.push({ path, status: 'onlyB', b }); continue; }
    let status;
    if (a.zip && b.zip && !a.modified && !b.modified && a.size != null && b.size != null) status = a.zip.crc === b.zip.crc && a.size === b.size ? 'same' : 'changed';
    else if (a.size != null && b.size != null && a.size !== b.size) status = 'changed';
    else {
      try { status = sameBytes(await a.load(), await b.load()) ? 'same' : 'changed'; } catch (e) { status = 'unknown'; }
    }
    out.push({ path, status, a, b });
    if (i % 50 === 49) await new Promise((r) => setTimeout(r));
  }
  return out;
}
