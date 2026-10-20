/*
 * Table of contents for Univer documents. Univer Docs has no fields, so the table is ordinary text: one paragraph per heading,
 * indented by level, whose text is a link to "#toc-<n>" (the n-th heading of the document). These links mark the table, so it can be
 * found and updated, and the DOCX/ODT exports turn them into internal links to bookmarks on the headings.
 *
 *   headings(body)                 -> [{ start, end, level, text, anchor }]   (Title/Subtitle are not listed)
 *   tocRange(body)                 -> { start, end } of the table's paragraphs, or null
 *   insertToc(data, offset, title) -> new document data with a (new or updated) table at the paragraph of offset
 */

const CONTROL = /[\x00-\x1f]/g;
export const TOC_PREFIX = "#toc-";

/** Paragraph boundaries: [{ start, end (index of the \r), paragraph }]. */
export function paragraphs(body) {
  const out = [];
  let start = 0;
  for (const p of [...(body.paragraphs || [])].sort((a, b) => a.startIndex - b.startIndex)) {
    out.push({ start, end: p.startIndex, paragraph: p });
    start = p.startIndex + 1;
  }
  return out;
}

const textOf = (body, start, end) => (body.dataStream || "").slice(start, end).replace(CONTROL, "").trim();
const linkOf = (body, start, end) => (body.customRanges || []).find((r) => r.rangeType === 0 && r.properties && String(r.properties.url || "").startsWith(TOC_PREFIX) && r.startIndex <= start && r.endIndex >= end - 1);

/** Is this paragraph part of a table of contents? */
export const isTocParagraph = (body, p) => p.end > p.start && !!linkOf(body, p.start, p.end);

export function headings(body) {
  const out = [];
  for (const p of paragraphs(body)) {
    const type = (p.paragraph.paragraphStyle || {}).namedStyleType;
    if (!(type >= 4 && type <= 8) || isTocParagraph(body, p)) continue;
    const text = textOf(body, p.start, p.end);
    if (!text) continue;
    out.push({ start: p.start, end: p.end, level: type - 3, text, anchor: `toc-${out.length + 1}` });
  }
  return out;
}

export function tocRange(body) {
  const list = paragraphs(body);
  const i = list.findIndex((p) => isTocParagraph(body, p));
  if (i < 0) return null;
  let j = i;
  while (j + 1 < list.length && isTocParagraph(body, list[j + 1])) j += 1;
  return { start: list[i].start, end: list[j].end + 1 };
}

/** Remove [start, end) of a body and shift everything behind it. */
function cut(body, start, end) {
  const n = end - start;
  const shift = (i) => (i >= end ? i - n : i);
  body.dataStream = body.dataStream.slice(0, start) + body.dataStream.slice(end);
  body.paragraphs = (body.paragraphs || []).filter((p) => p.startIndex < start || p.startIndex >= end).map((p) => ({ ...p, startIndex: shift(p.startIndex) }));
  body.textRuns = (body.textRuns || []).filter((r) => r.ed <= start || r.st >= end).map((r) => ({ ...r, st: shift(r.st), ed: shift(r.ed) }));
  body.customRanges = (body.customRanges || []).filter((r) => r.endIndex < start || r.startIndex >= end).map((r) => ({ ...r, startIndex: shift(r.startIndex), endIndex: shift(r.endIndex) }));
  for (const key of ["sectionBreaks", "customBlocks", "tables"]) {
    body[key] = (body[key] || []).map((x) => ({ ...x, startIndex: shift(x.startIndex), ...(x.endIndex !== undefined ? { endIndex: shift(x.endIndex) } : {}) }));
  }
}

/** Insert a piece (dataStream, paragraphs, textRuns, customRanges relative to 0) at index at. */
function paste(body, at, piece) {
  const n = piece.dataStream.length;
  const shift = (i) => (i >= at ? i + n : i);
  body.dataStream = body.dataStream.slice(0, at) + piece.dataStream + body.dataStream.slice(at);
  body.paragraphs = [...(body.paragraphs || []).map((p) => ({ ...p, startIndex: shift(p.startIndex) })), ...piece.paragraphs.map((p) => ({ ...p, startIndex: p.startIndex + at }))].sort((a, b) => a.startIndex - b.startIndex);
  body.textRuns = [...(body.textRuns || []).map((r) => (r.st >= at ? { ...r, st: r.st + n, ed: r.ed + n } : r.ed > at ? { ...r, ed: r.ed + n } : r)), ...piece.textRuns.map((r) => ({ ...r, st: r.st + at, ed: r.ed + at }))].sort((a, b) => a.st - b.st);
  body.customRanges = [...(body.customRanges || []).map((r) => ({ ...r, startIndex: shift(r.startIndex), endIndex: shift(r.endIndex) })), ...piece.customRanges.map((r) => ({ ...r, startIndex: r.startIndex + at, endIndex: r.endIndex + at }))];
  for (const key of ["sectionBreaks", "customBlocks", "tables"]) {
    body[key] = (body[key] || []).map((x) => ({ ...x, startIndex: shift(x.startIndex), ...(x.endIndex !== undefined ? { endIndex: shift(x.endIndex) } : {}) }));
  }
}

const rid = (p) => `${p}${Math.random().toString(36).slice(2, 10)}`;

/** The paragraphs of a table of contents for these headings (the first one is the title). */
function tocPiece(list, title) {
  const piece = { dataStream: "", paragraphs: [], textRuns: [], customRanges: [] };
  const add = (text, url, style, ts) => {
    const st = piece.dataStream.length;
    piece.dataStream += text;
    if (ts) piece.textRuns.push({ st, ed: st + text.length, ts });
    piece.customRanges.push({ startIndex: st, endIndex: st + text.length - 1, rangeId: rid("toc"), rangeType: 0, properties: { url } });
    piece.paragraphs.push({ startIndex: piece.dataStream.length, paragraphId: rid("p"), paragraphStyle: style });
    piece.dataStream += "\r";
  };
  add(title, `${TOC_PREFIX}title`, { spaceBelow: { v: 6 } }, { bl: 1, fs: 14 });
  for (const h of list) add(h.text, `${TOC_PREFIX}${h.anchor.slice(4)}`, { indentStart: { v: 18 * (h.level - 1) }, spaceBelow: { v: 2 } }, null);
  return piece;
}

export function insertToc(data, offset, title = "Contents") {
  const next = structuredClone(data);
  const body = next.body;
  const old = tocRange(body);
  let at;
  if (old) { // update in place
    cut(body, old.start, old.end);
    at = old.start;
  } else {
    // at the start of the paragraph that contains the cursor
    const p = paragraphs(body).find((x) => offset >= x.start && offset <= x.end);
    at = p ? p.start : 0;
  }
  const list = headings(body);
  paste(body, at, tocPiece(list, title));
  return { data: next, count: list.length };
}
