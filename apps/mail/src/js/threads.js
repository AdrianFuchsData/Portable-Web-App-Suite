/*
 * Conversation threads of a message list. A message's parent is the last message of its References/In-Reply-To chain
 * that is in the list; replies without references (some clients drop them) are attached by their subject
 * ("Re: …", "AW: …") to the earliest message with the same base subject.
 *
 *   threads(messages) -> [{ id, root, rows: [{ m, depth }], latest, count, unread }]   (newest activity first)
 */

/** Message IDs (<…>) in a header value. */
export const ids = (value) => String(value || '').match(/<[^<>\s]+>/g) || [];

const PREFIX = /^\s*(?:(?:re|aw|antw|fw|fwd|wg|sv|vs|tr|rif)(?:\[\d+\])?\s*:\s*)+/i;
/** The subject without reply and forward prefixes, lower case. */
export const baseSubject = (s) => String(s || '').replace(PREFIX, '').trim().toLowerCase();
const isReply = (s) => PREFIX.test(String(s || ''));

export function threads(messages, { unread = (m) => !m.flags.includes('\\Seen') } = {}) {
  const byId = new Map();
  for (const m of messages) for (const id of ids(m.messageId)) if (!byId.has(id)) byId.set(id, m);
  const firstBySubject = new Map();
  for (const m of [...messages].sort((a, b) => (a.date || 0) - (b.date || 0))) {
    const key = baseSubject(m.subject);
    if (key && !firstBySubject.has(key)) firstBySubject.set(key, m);
  }
  const parent = new Map();
  for (const m of messages) {
    const refs = [...ids(m.references), ...ids(m.inReplyTo)];
    let p = null;
    for (let i = refs.length - 1; i >= 0 && !p; i--) { const c = byId.get(refs[i]); if (c && c !== m) p = c; }
    if (!p && !refs.length && isReply(m.subject)) { const c = firstBySubject.get(baseSubject(m.subject)); if (c && c !== m) p = c; }
    if (p) parent.set(m, p);
  }
  // break cycles (malformed references): a message whose ancestors lead back to itself becomes a root
  for (const m of messages) {
    const seen = new Set([m]);
    for (let p = parent.get(m); p; p = parent.get(p)) { if (seen.has(p)) { parent.delete(m); break; } seen.add(p); }
  }
  const children = new Map();
  for (const m of messages) { const p = parent.get(m); if (p) { if (!children.has(p)) children.set(p, []); children.get(p).push(m); } }
  const out = [];
  for (const root of messages.filter((m) => !parent.has(m))) {
    const rows = [];
    const walk = (m, depth) => {
      rows.push({ m, depth });
      for (const c of (children.get(m) || []).sort((a, b) => (a.date || 0) - (b.date || 0))) walk(c, depth + 1);
    };
    walk(root, 0);
    out.push({ id: root.uid, root, rows, latest: Math.max(...rows.map((r) => r.m.date || 0)), count: rows.length, unread: rows.filter((r) => unread(r.m)).length });
  }
  return out.sort((a, b) => b.latest - a.latest);
}
