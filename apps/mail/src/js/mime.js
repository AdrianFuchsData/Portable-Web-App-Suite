/*
 * Mail formats: building RFC 5322/MIME messages (7-bit transfer encodings, RFC 2047 headers, RFC 2231 file names),
 * address lists, parsing (postal-mime), mbox files and vCards (address book).
 */
import PostalMime from 'postal-mime';

const enc = new TextEncoder();
const CRLF = '\r\n';

// ---- encodings ----------------------------------------------------------------------------------------------------

export function base64(bytes, wrap = 76) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const b = btoa(s);
  if (!wrap) return b;
  const lines = [];
  for (let i = 0; i < b.length; i += wrap) lines.push(b.slice(i, i + wrap));
  return lines.join(CRLF);
}

/** Quoted-printable (RFC 2045) of a text in UTF-8; line breaks become CRLF. */
export function quotedPrintable(text) {
  const out = [];
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const bytes = enc.encode(line);
    let cur = '';
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      const last = i === bytes.length - 1;
      let piece;
      if ((b === 0x20 || b === 0x09) && !last) piece = String.fromCharCode(b);
      else if (b >= 0x21 && b <= 0x7e && b !== 0x3d && !(b === 0x2e && cur === '' && i === 0)) piece = String.fromCharCode(b);
      else piece = `=${b.toString(16).toUpperCase().padStart(2, '0')}`;
      if (cur === '' && i === 0 && line.startsWith('From ')) piece = '=46'; // keeps mbox readers from splitting the message
      if (cur.length + piece.length > 75) { out.push(`${cur}=`); cur = ''; }
      cur += piece;
    }
    out.push(cur);
  }
  return out.join(CRLF);
}

/** RFC 2047 encoded words for a header text with non-ASCII characters (otherwise the text itself). */
export function encodeWord(text) {
  if (!/[^\x20-\x7e]/.test(text) && !/=\?/.test(text)) return text;
  const words = [];
  let chunk = '';
  for (const ch of text) {
    if (enc.encode(chunk + ch).length > 45) { words.push(chunk); chunk = ''; }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${base64(enc.encode(w), 0)}?=`).join(' ');
}

/** Fold a header line at spaces (after commas preferably) to at most 78 characters per line. */
export function foldHeader(line) {
  if (line.length <= 78) return line;
  const out = [];
  let rest = line;
  while (rest.length > 78) {
    let cut = rest.lastIndexOf(', ', 77);
    cut = cut > 20 ? cut + 1 : rest.lastIndexOf(' ', 77);
    if (cut <= 20) { cut = rest.indexOf(' ', 78); if (cut < 0) break; }
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^ /, ' ');
  }
  out.push(rest);
  return out.join(`${CRLF} `).replace(/\r\n {2}/g, `${CRLF} `);
}

// ---- addresses ----------------------------------------------------------------------------------------------------

/** Parse "Anna <anna@example.com>, b@example.com; \"Last, First\" <c@d>" into [{ name, address }]. */
export function parseAddresses(text) {
  const parts = [];
  let cur = '', quote = false, angle = false, comment = 0;
  for (const ch of String(text || '')) {
    if (quote) { cur += ch; if (ch === '"') quote = false; continue; }
    if (ch === '"') quote = true;
    else if (ch === '(') comment++;
    else if (ch === ')' && comment) comment--;
    else if (ch === '<') angle = true;
    else if (ch === '>') angle = false;
    else if ((ch === ',' || ch === ';') && !angle && !comment) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  const out = [];
  for (const raw of parts) {
    const p = raw.trim();
    if (!p) continue;
    const m = p.match(/^(.*?)<([^>]*)>/);
    if (m) {
      const name = m[1].trim().replace(/^"(.*)"$/, '$1').replace(/\\(.)/g, '$1');
      out.push({ name, address: m[2].trim() });
    } else out.push({ name: '', address: p.replace(/\(.*?\)/g, '').trim() });
  }
  return out;
}

export const validAddress = (a) => /^[^\s@<>()",;]+@[^\s@<>()",;]+$/.test(a);

/** Header form of one address. */
export function formatAddress({ name = '', address }) {
  if (!name) return address;
  if (/[^\x20-\x7e]/.test(name)) return `${encodeWord(name)} <${address}>`;
  return /[()<>\[\]:;@\\,."]/.test(name) ? `"${name.replace(/(["\\])/g, '\\$1')}" <${address}>` : `${name} <${address}>`;
}

/** Display form of one address. */
export const showAddress = (a) => (a ? (a.name ? `${a.name} <${a.address}>` : a.address || '') : '');

// ---- building messages -----------------------------------------------------------------------------------------------

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function rfc5322Date(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const zone = `${off >= 0 ? '+' : '-'}${p(Math.floor(Math.abs(off) / 60))}${p(Math.abs(off) % 60)}`;
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${zone}`;
}

const randomId = (n = 12) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');

export function messageId(fromAddress = '') {
  const domain = ((fromAddress || '').split('@')[1] || 'localhost').replace(/[^\w.-]/g, '');
  return `<${randomId()}@${domain}>`;
}

function headerBlock(headers) {
  return headers.filter(([, v]) => v != null && v !== '').map(([k, v]) => foldHeader(`${k}: ${v}`)).join(CRLF);
}

function fileNameParams(name) {
  if (!/[^\x20-\x7e]/.test(name) && !/["\\]/.test(name)) return { plain: `"${name}"`, star: '' };
  const pct = [...enc.encode(name)].map((b) => (/[A-Za-z0-9!#$&+.^_`|~-]/.test(String.fromCharCode(b)) ? String.fromCharCode(b) : `%${b.toString(16).toUpperCase().padStart(2, '0')}`)).join('');
  return { plain: `"${encodeWord(name).replace(/"/g, '')}"`, star: `UTF-8''${pct}` };
}

function textPart(type, text) {
  return { headers: [['Content-Type', `${type}; charset=utf-8`], ['Content-Transfer-Encoding', 'quoted-printable']], body: quotedPrintable(text) };
}

function binaryPart({ name, type = 'application/octet-stream', bytes, cid, inline }) {
  const f = fileNameParams(name || 'attachment');
  const headers = [
    ['Content-Type', `${type}; name=${f.plain}`],
    ['Content-Transfer-Encoding', 'base64'],
    ['Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename=${f.plain}${f.star ? `; filename*=${f.star}` : ''}`],
  ];
  if (cid) headers.push(['Content-ID', `<${cid}>`]);
  return { headers, body: base64(bytes) };
}

function multipart(subtype, parts, params = '') {
  const boundary = `=_${randomId(9)}`;
  const body = parts.map((p) => `--${boundary}${CRLF}${headerBlock(p.headers)}${CRLF}${CRLF}${p.body}`).join(CRLF) + `${CRLF}--${boundary}--`;
  return { headers: [['Content-Type', `multipart/${subtype}; boundary="${boundary}"${params}`]], body };
}

/** HTML with data: images moved into related parts (cid: references). */
function extractImages(html) {
  const images = [];
  const out = html.replace(/(<img\b[^>]*?\bsrc=")data:([\w/+.-]+);base64,([^"]+)"/gi, (m, pre, type, data) => {
    const cid = `${randomId(8)}@inline`;
    const bin = atob(data);
    images.push({ name: `image${images.length + 1}.${type.split('/')[1] || 'bin'}`, type, bytes: Uint8Array.from(bin, (c) => c.charCodeAt(0)), cid, inline: true });
    return `${pre}cid:${cid}"`;
  });
  return { html: out, images };
}

/**
 * Build a message. m: { from: {name,address}, to, cc, bcc: [{name,address}], replyTo, subject, text, html,
 * attachments: [{ name, type, bytes }], alternatives: [{ type: 'text/calendar; method=REPLY', text }],
 * inReplyTo, references, date, messageId, headers: [[k, v]] }. Returns the message text (ASCII only).
 * Bcc is not written (unless keepBcc, for drafts).
 */
export function buildMessage(m, { keepBcc = false } = {}) {
  const list = (a) => (a && a.length ? a.map(formatAddress).join(', ') : '');
  const headers = [
    ['Date', rfc5322Date(m.date || new Date())],
    ['From', m.from ? formatAddress(m.from) : ''],
    ['To', list(m.to)],
    ['Cc', list(m.cc)],
    ['Bcc', keepBcc ? list(m.bcc) : ''],
    ['Reply-To', list(m.replyTo)],
    ['Subject', encodeWord(m.subject || '')],
    ['Message-ID', m.messageId || messageId(m.from && m.from.address)],
    ['In-Reply-To', m.inReplyTo || ''],
    ['References', m.references || ''],
    ...(m.headers || []),
    ['MIME-Version', '1.0'],
  ];
  let body = textPart('text/plain', m.text || '');
  const alternatives = [];
  if (m.html) {
    const { html, images } = extractImages(m.html);
    const htmlPart = textPart('text/html', html);
    alternatives.push(images.length ? multipart('related', [htmlPart, ...images.map(binaryPart)]) : htmlPart);
  }
  for (const a of m.alternatives || []) {
    alternatives.push({ headers: [['Content-Type', `${a.type}; charset=utf-8`], ['Content-Transfer-Encoding', 'quoted-printable']], body: quotedPrintable(a.text) });
  }
  if (alternatives.length) body = multipart('alternative', [body, ...alternatives]);
  if (m.attachments && m.attachments.length) body = multipart('mixed', [body, ...m.attachments.map(binaryPart)]);
  return `${headerBlock([...headers, ...body.headers])}${CRLF}${CRLF}${body.body}${CRLF}`;
}

export const toBytes = (text) => (typeof text === 'string' ? enc.encode(text) : text);

// ---- parsing ------------------------------------------------------------------------------------------------------

/** Parse a message (bytes or text) with postal-mime. */
export async function parseMessage(raw) {
  return PostalMime.parse(typeof raw === 'string' ? enc.encode(raw) : raw, { attachmentEncoding: 'arraybuffer' });
}

/** Split an mbox file into messages (bytes), "From " lines removed and ">From " unescaped. */
export function splitMbox(bytes) {
  const text = new TextDecoder('latin1').decode(bytes); // byte-preserving
  const starts = [];
  const re = /(^|\n)From [^\n]*\n/g;
  let m;
  while ((m = re.exec(text))) starts.push({ at: m.index + m[1].length, body: m.index + m[0].length });
  const out = [];
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].at : text.length;
    const msg = text.slice(starts[i].body, end).replace(/\n$/, '').replace(/^>(>*From )/gm, '$1');
    out.push(Uint8Array.from(msg, (c) => c.charCodeAt(0)));
  }
  return out;
}

/** An mbox file of raw messages. */
export function joinMbox(messages) {
  const parts = messages.map((raw) => {
    const text = new TextDecoder('latin1').decode(raw).replace(/\r\n/g, '\n').replace(/^(>*From )/gm, '>$1');
    return `From MAILER-DAEMON ${new Date().toUTCString().replace(/^(\w+), (\d+) (\w+) (\d+) (\S+) GMT$/, '$1 $3 $2 $5 $4')}\n${text.replace(/\n?$/, '\n')}\n`;
  });
  const s = parts.join('');
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

// ---- vCard (address book) ----------------------------------------------------------------------------------------------

const vEscape = (s) => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const vUnescape = (s) => s.replace(/\\([\\,;nN])/g, (m, c) => (c === 'n' || c === 'N' ? '\n' : c));

function qpDecode(s) {
  const bytes = [];
  const t = s.replace(/=\r?\n/g, '');
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '=' && /^[0-9A-F]{2}$/i.test(t.slice(i + 1, i + 3))) { bytes.push(parseInt(t.slice(i + 1, i + 3), 16)); i += 2; } else bytes.push(t.charCodeAt(i));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

const KNOWN = new Set(['BEGIN', 'END', 'VERSION', 'FN', 'N', 'EMAIL', 'TEL', 'ORG', 'NOTE', 'PRODID']);

/** Parse vCards (2.1, 3.0, 4.0) into contacts { id, name, n, emails: [], phones: [], org, note, extra: [lines] }. */
export function parseVcards(text) {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const out = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (!line.trim()) continue;
    // vCard 2.1 quoted-printable values continue with "=" at the line end
    while (/ENCODING=QUOTED-PRINTABLE/i.test(line.split(':')[0]) && line.endsWith('=') && i + 1 < lines.length) line = `${line.slice(0, -1)}${lines[++i]}`;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    let value = line.slice(colon + 1);
    const [nameWithGroup, ...params] = head.split(';');
    const name = nameWithGroup.replace(/^.*\./, '').toUpperCase();
    if (params.some((p) => /^ENCODING=QUOTED-PRINTABLE$/i.test(p))) value = qpDecode(value);
    if (name === 'BEGIN' && /^VCARD$/i.test(value)) { cur = { id: randomId(8), name: '', n: '', emails: [], phones: [], org: '', note: '', extra: [] }; continue; }
    if (!cur) continue;
    if (name === 'END') { if (!cur.name) cur.name = cur.n.split(';').filter(Boolean).reverse().join(' ') || cur.emails[0] || ''; cur.nameAtImport = cur.name; out.push(cur); cur = null; continue; }
    if (name === 'FN') cur.name = vUnescape(value);
    else if (name === 'N') cur.n = value;
    else if (name === 'EMAIL') cur.emails.push(vUnescape(value).trim());
    else if (name === 'TEL') cur.phones.push(vUnescape(value).replace(/^tel:/i, '').trim());
    else if (name === 'ORG') cur.org = vUnescape(value.split(';').filter(Boolean).join(', '));
    else if (name === 'NOTE') cur.note = vUnescape(value);
    else if (!KNOWN.has(name)) cur.extra.push(line);
  }
  return out;
}

/** vCard 3.0 text of contacts. */
export function buildVcards(contacts) {
  return contacts.map((c) => {
    const words = c.name.trim().split(/\s+/);
    const n = c.n && c.nameAtImport === c.name ? c.n : `${vEscape(words.length > 1 ? words[words.length - 1] : c.name)};${vEscape(words.length > 1 ? words.slice(0, -1).join(' ') : '')};;;`;
    return [
      'BEGIN:VCARD', 'VERSION:3.0', `FN:${vEscape(c.name)}`, `N:${n}`,
      ...c.emails.filter(Boolean).map((e) => `EMAIL;TYPE=INTERNET:${vEscape(e)}`),
      ...c.phones.filter(Boolean).map((p) => `TEL:${vEscape(p)}`),
      c.org ? `ORG:${vEscape(c.org)}` : null, c.note ? `NOTE:${vEscape(c.note)}` : null,
      ...(c.extra || []), 'END:VCARD',
    ].filter(Boolean).map(foldVcardLine).join(CRLF);
  }).join(CRLF) + CRLF;
}

function foldVcardLine(line) {
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ''; }
    cur += ch;
  }
  out.push(cur);
  return out.join(`${CRLF} `);
}
