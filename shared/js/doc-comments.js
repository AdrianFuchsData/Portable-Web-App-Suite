/*
 * Comments of the document editor (Univer's thread comments, @univerjs/docs-thread-comment) in Univer's document data. ES module.
 *
 * Univer keeps a comment in two places: the commented text is a decoration of the body (customDecorations: { id, type: 0,
 * startIndex, endIndex } – endIndex inclusive) and the thread – the comment with its replies – is in the resource
 * DOC_UNIVER_THREAD_COMMENT_PLUGIN ({ default_doc: [{ id, threadId, ref, dT, personId, authorName, text, resolved, children }] },
 * the decoration's id is the thread's id; dT is local time "YYYY/MM/DD HH:mm"; text is a small document body).
 *
 *   threadsOf(data) -> threads with a decoration in the body, in the order of the text: [{ ...root, children, start, end }]
 *   buildThreads(list, { stream, unitId }) -> { threads, decorations } from the comments of a file (docx-import.js, odt.js):
 *       list: [{ key, start, end, author, date, text, parentKey, resolved }] (start/end: positions in the body, end inclusive)
 *   withThreads(data, threads) -> data with the resource set (the decorations must be in data.body)
 *   textOf(body) / bodyOf(text): the text of a comment (paragraphs as "\n")
 *   dateOf(dT) -> Date | null, dT(date) -> "YYYY/MM/DD HH:mm"
 *   authorOf(comment) -> the author's name (authorName, else personId)
 */
export const RESOURCE = "DOC_UNIVER_THREAD_COMMENT_PLUGIN";
export const SUB_UNIT = "default_doc";
export const COMMENT_DECORATION = 0; // CustomDecorationType.COMMENT

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
export function commentId() {
  const bytes = crypto.getRandomValues(new Uint8Array(21));
  return Array.from(bytes, (b) => ALPHABET[b & 63]).join("");
}

const pad = (n) => String(n).padStart(2, "0");
export function dT(date = new Date()) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function dateOf(value) {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(value || "");
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

export function textOf(body) {
  return ((body && body.dataStream) || "").replace(/\r\n$/, "").replace(/\r$/, "").replace(/\r/g, "\n").replace(/[\x00-\x08\x0b-\x1f]/g, "");
}
export function bodyOf(text) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  let dataStream = "";
  const paragraphs = [];
  for (const line of lines) {
    dataStream += line.replace(/[\x00-\x1f]/g, " ");
    paragraphs.push({ startIndex: dataStream.length, paragraphStyle: { horizontalAlign: 1 } });
    dataStream += "\r";
  }
  return { dataStream: `${dataStream}\n`, textRuns: [], customBlocks: [], customDecorations: [], customRanges: [], paragraphs, sectionBreaks: [{ startIndex: dataStream.length }] };
}

export const authorOf = (c) => (c && (c.authorName || c.personId)) || "";

/** The threads of a document that have their text in the body, ordered by the position of that text. */
export function threadsOf(data) {
  const res = ((data && data.resources) || []).find((r) => r.name === RESOURCE);
  let stored = {};
  try { stored = res && res.data ? JSON.parse(res.data) : {}; } catch (e) { stored = {}; }
  const decorations = new Map((((data && data.body) || {}).customDecorations || []).filter((d) => d.type === COMMENT_DECORATION).map((d) => [d.id, d]));
  const out = [];
  for (const list of Object.values(stored || {})) {
    for (const t of Array.isArray(list) ? list : []) {
      const d = decorations.get(t.threadId) || decorations.get(t.id);
      if (d) out.push({ ...t, children: t.children || [], start: d.startIndex, end: d.endIndex });
    }
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

export function withThreads(data, threads) {
  const resources = (data.resources || []).filter((r) => r.name !== RESOURCE);
  if (threads.length) resources.push({ name: RESOURCE, data: JSON.stringify({ [SUB_UNIT]: threads }) });
  return { ...data, resources };
}

/** Threads and body decorations from the comments of a file. */
export function buildThreads(list, { stream = "", unitId = "" } = {}) {
  const byKey = new Map(list.map((c) => [c.key, c]));
  const rootOf = (c) => { const seen = new Set(); let x = c; while (x.parentKey != null && byKey.has(x.parentKey) && !seen.has(x.key)) { seen.add(x.key); x = byKey.get(x.parentKey); } return x; };
  const last = Math.max(0, stream.length - 1);
  const threads = [], decorations = [], ids = new Map();
  for (const c of list) {
    if (rootOf(c) !== c || c.start == null) continue;
    let start = Math.max(0, Math.min(c.start, last));
    let end = c.end == null ? start : Math.min(c.end, last);
    if (end < start) end = start; // a comment at a point: on the next character
    const id = commentId();
    ids.set(c.key, id);
    decorations.push({ id, type: COMMENT_DECORATION, startIndex: start, endIndex: end });
    threads.push({
      id, threadId: id, ref: stream.slice(start, end + 1).replace(/[\x00-\x1f]/g, " ").trim(), dT: dT(c.date), personId: c.author || "", authorName: c.author || "",
      text: bodyOf(c.text), resolved: !!c.resolved, unitId, subUnitId: SUB_UNIT, startOffset: start, endOffset: end + 1, collapsed: false, children: [],
    });
  }
  for (const c of list) {
    const root = rootOf(c);
    if (root === c || !ids.has(root.key)) continue;
    const threadId = ids.get(root.key);
    const thread = threads.find((t) => t.id === threadId);
    thread.children.push({ id: commentId(), threadId, parentId: threadId, dT: dT(c.date), personId: c.author || "", authorName: c.author || "", text: bodyOf(c.text), unitId, subUnitId: SUB_UNIT });
    if (c.resolved) thread.resolved = true;
  }
  return { threads, decorations };
}

/** Initials of a name, for Word ("Anna Muster" -> "AM"). */
export function initialsOf(name) {
  return String(name || "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 4).toUpperCase();
}
