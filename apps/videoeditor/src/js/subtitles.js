/*
 * Subtitles: SRT and WebVTT files as cues [{ start, end, text }] (seconds) and back to SRT.
 */

const TIME = /(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/;
const seconds = (m) => (+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3] + +m[4].padEnd(3, '0') / 1000;

/** Cues of an SRT or WebVTT text (tags like <i> are removed, line breaks kept). */
export function parseSubtitles(text) {
  const cues = [];
  const blocks = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const [a, b] = lines[i].split('-->');
    const ma = TIME.exec(a), mb = TIME.exec(b || '');
    if (!ma || !mb) continue;
    const body = lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '').trim();
    if (body) cues.push({ start: seconds(ma), end: Math.max(seconds(ma) + 0.04, seconds(mb)), text: body });
  }
  return cues.sort((x, y) => x.start - y.start);
}

const stamp = (s) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

export function toSrt(cues) {
  return cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n');
}
