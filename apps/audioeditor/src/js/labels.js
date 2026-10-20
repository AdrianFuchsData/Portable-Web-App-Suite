/*
 * Labels of the audio editor in Audacity's label format: one label per line, "start<TAB>end<TAB>text" with times in
 * seconds (start = end for point labels). Lines starting with "\" (Audacity's frequency ranges) are ignored on import.
 */

/** Labels [{ start, end, text }] as Audacity label text. */
export function toText(labels) {
  return [...labels].sort((a, b) => a.start - b.start || a.end - b.end)
    .map((l) => `${l.start.toFixed(6)}\t${l.end.toFixed(6)}\t${String(l.text || '').replace(/[\t\r\n]+/g, ' ')}`).join('\n') + '\n';
}

/** Parse Audacity label text (also with comma decimals or only a start time). */
export function parse(text) {
  const out = [];
  for (const line of String(text).replace(/^﻿/, '').split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('\\')) continue;
    const parts = line.split('\t');
    const num = (s) => Number(String(s ?? '').trim().replace(',', '.'));
    const start = num(parts[0]);
    if (!Number.isFinite(start)) continue;
    let end = num(parts[1]);
    let label = parts.slice(2).join(' ');
    if (!Number.isFinite(end) || parts.length < 2) { end = start; label = parts.slice(1).join(' '); }
    out.push({ start: Math.max(0, start), end: Math.max(start, end), text: label.trim() });
  }
  return out;
}
