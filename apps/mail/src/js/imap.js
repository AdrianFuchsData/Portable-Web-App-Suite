/*
 * IMAP4rev1 client (RFC 3501) over a relay TCP connection: TLS or STARTTLS, LOGIN/AUTHENTICATE PLAIN, folders
 * (LIST with special-use flags, STATUS, CREATE, DELETE, RENAME), SELECT, FETCH, UID SEARCH, STORE, COPY/MOVE (MOVE or
 * COPY + EXPUNGE), APPEND (LITERAL+ when available). Commands are serialized; responses are parsed with literals.
 */
const enc = new TextEncoder();
const dec = new TextDecoder();

export class ImapError extends Error {
  constructor(message, code = '') { super(message); this.name = 'ImapError'; this.code = code; }
}

// ---- modified UTF-7 (RFC 3501 5.1.3) ----------------------------------------------------------------------------------

export function encodeMailbox(name) {
  let out = '', run = [];
  const flush = () => {
    if (!run.length) return;
    const bytes = new Uint8Array(run.length * 2);
    run.forEach((u, i) => { bytes[2 * i] = u >> 8; bytes[2 * i + 1] = u & 255; });
    out += `&${btoa(String.fromCharCode(...bytes)).replace(/=+$/, '').replace(/\//g, ',')}-`;
    run = [];
  };
  for (let i = 0; i < name.length; i++) {
    const u = name.charCodeAt(i);
    if (u >= 0x20 && u <= 0x7e) { flush(); out += u === 0x26 ? '&-' : name[i]; } else run.push(u);
  }
  flush();
  return out;
}

export function decodeMailbox(name) {
  return name.replace(/&([^-]*)-/g, (m, b64) => {
    if (!b64) return '&';
    const bin = atob(b64.replace(/,/g, '/'));
    let s = '';
    for (let i = 0; i + 1 < bin.length; i += 2) s += String.fromCharCode((bin.charCodeAt(i) << 8) | bin.charCodeAt(i + 1));
    return s;
  });
}

// ---- response parsing ----------------------------------------------------------------------------------------------

/** Tokens of a response line: atoms (strings), quoted strings, literals (Uint8Array), NIL (null) and lists (arrays). */
export function parseTokens(s, literals = []) {
  let i = 0;
  const value = () => {
    const c = s[i];
    if (c === '(') { i++; return list(')'); }
    if (c === '"') {
      i++;
      let v = '';
      while (i < s.length && s[i] !== '"') { if (s[i] === '\\') i++; v += s[i++]; }
      i++;
      return v;
    }
    if (c === '\u0000') { const j = s.indexOf('\u0000', i + 1); const v = literals[Number(s.slice(i + 1, j))]; i = j + 1; return v; }
    let v = '', depth = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '[') depth++;
      else if (ch === ']') depth--;
      else if (depth <= 0 && (ch === ' ' || ch === '(' || ch === ')')) break;
      v += ch;
      i++;
    }
    return v === 'NIL' ? null : v;
  };
  const list = (end) => {
    const out = [];
    for (;;) {
      while (s[i] === ' ') i++;
      if (i >= s.length) return out;
      if (s[i] === end) { i++; return out; }
      if (s[i] === ')') { i++; continue; } // stray
      out.push(value());
    }
  };
  return list(null);
}

const str = (v) => (v instanceof Uint8Array ? dec.decode(v) : v == null ? '' : String(v));

/** Pairs of a FETCH attribute list as an object with upper-case keys. */
function fetchAttributes(list) {
  const out = {};
  for (let i = 0; i + 1 < list.length; i += 2) out[String(list[i]).toUpperCase()] = list[i + 1];
  return out;
}

const MONTHS = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };

export function parseInternalDate(s) {
  const m = /(\d{1,2})-(\w{3})-(\d{4}) (\d\d:\d\d:\d\d) ([+-])(\d\d)(\d\d)/.exec(s || '');
  if (!m) return null;
  return Date.parse(`${m[3]}-${MONTHS[m[2].toUpperCase()]}-${m[1].padStart(2, '0')}T${m[4]}${m[5]}${m[6]}:${m[7]}`);
}

function internalDate(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const names = Object.keys(MONTHS);
  return `${p(d.getDate())}-${names[d.getMonth()][0]}${names[d.getMonth()].slice(1).toLowerCase()}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${off >= 0 ? '+' : '-'}${p(Math.floor(Math.abs(off) / 60))}${p(Math.abs(off) % 60)}`;
}

/** Compact UID set: [1, 2, 3, 7] -> "1:3,7". */
export function uidSet(uids) {
  const sorted = [...new Set(uids.map(Number))].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    out.push(j > i ? `${sorted[i]}:${sorted[j]}` : String(sorted[i]));
    i = j;
  }
  return out.join(',');
}

export function quote(s) {
  if (/^[\x20-\x7e]*$/.test(s)) return `"${s.replace(/(["\\])/g, '\\$1')}"`;
  return enc.encode(s); // literal
}

const SPECIAL = ['\\Inbox', '\\Sent', '\\Drafts', '\\Trash', '\\Junk', '\\Archive', '\\All', '\\Flagged'];
const GUESS = [
  ['\\Sent', /^(sent|sent items|sent messages|sent mail|gesendet|gesendete (elemente|objekte|nachrichten)|gesendete)$/i],
  ['\\Drafts', /^(drafts?|entw(ü|u)rfe)$/i],
  ['\\Trash', /^(trash|deleted|deleted items|deleted messages|papierkorb|gel(ö|o)schte (elemente|objekte|nachrichten))$/i],
  ['\\Junk', /^(junk|spam|junk e-?mail|bulk mail|werbung)$/i],
  ['\\Archive', /^(archive|archiv)$/i],
];

// ---- client --------------------------------------------------------------------------------------------------------------

/**
 * Connect and log in. options: { relay, host, port, security: 'tls'|'starttls'|'none', insecure, user, password,
 * onUpdate({ exists, expunged, path }) } (untagged EXISTS/EXPUNGE of the selected folder). Resolves to the client object.
 */
export async function openImap({ relay, host, port, security = 'tls', insecure = false, user, password, onUpdate = () => {} }) {
  const conn = await Suite.relay.connect(relay, { host, port: Number(port) || (security === 'tls' ? 993 : 143), tls: security === 'tls', insecure });
  let buf = new Uint8Array(0);
  let closed = false;
  let current = null; // running command { tag, untagged, resolve, reject, cont }
  let greeting = null;
  let caps = new Set();
  let tagCounter = 0;
  let chain = Promise.resolve();
  const selected = { path: null, exists: 0 };

  const append = (chunk) => { const b = new Uint8Array(buf.length + chunk.length); b.set(buf); b.set(chunk, buf.length); buf = b; };

  function takeResponse() {
    let pos = 0, text = '';
    const literals = [];
    for (;;) {
      let nl = -1;
      for (let k = pos; k + 1 < buf.length; k++) if (buf[k] === 13 && buf[k + 1] === 10) { nl = k; break; }
      if (nl < 0) return null;
      const line = dec.decode(buf.subarray(pos, nl));
      const m = /\{(\d+)\+?\}$/.exec(line);
      if (m) {
        const start = nl + 2, n = Number(m[1]);
        if (buf.length < start + n) return null;
        literals.push(buf.slice(start, start + n));
        text += `${line.slice(0, m.index)}\u0000${literals.length - 1}\u0000`;
        pos = start + n;
        continue;
      }
      text += line;
      buf = buf.slice(nl + 2);
      return { text, literals };
    }
  }

  function handle({ text, literals }) {
    if (text.startsWith('+')) { if (current && current.cont) { const c = current.cont; current.cont = null; c(text.slice(2)); } return; }
    if (text.startsWith('* ')) {
      const m = /^\* (OK|NO|BAD|BYE|PREAUTH)\b ?(.*)$/i.exec(text);
      if (m) {
        const code = /^\[([^\]]*)\]/.exec(m[2]);
        if (code && /^CAPABILITY /i.test(code[1])) caps = new Set(code[1].split(' ').slice(1).map((c) => c.toUpperCase()));
        if (!greeting) { greeting = { status: m[1].toUpperCase(), text: m[2] }; greetingWaiter(); return; }
        if (m[1].toUpperCase() === 'BYE') closed = true;
        if (current) current.untagged.push({ status: m[1].toUpperCase(), text: m[2] });
        return;
      }
      const tokens = parseTokens(text.slice(2), literals);
      const kind = String(tokens[1] || '').toUpperCase();
      if (String(tokens[0]).toUpperCase() === 'CAPABILITY') caps = new Set(tokens.slice(1).map((c) => String(c).toUpperCase()));
      if (kind === 'EXISTS') { selected.exists = Number(tokens[0]); if (selected.path) onUpdate({ exists: selected.exists, path: selected.path }); }
      if (kind === 'EXPUNGE') { selected.exists = Math.max(0, selected.exists - 1); if (selected.path) onUpdate({ expunged: Number(tokens[0]), path: selected.path }); }
      if (current) current.untagged.push(tokens);
      return;
    }
    const m = /^(\S+) (OK|NO|BAD)\b ?(.*)$/i.exec(text);
    if (m && current && m[1] === current.tag) {
      const c = current;
      current = null;
      const code = (/^\[([^\]]*)\]/.exec(m[3]) || [])[1] || '';
      if (/^CAPABILITY /i.test(code)) caps = new Set(code.split(' ').slice(1).map((x) => x.toUpperCase()));
      if (m[2].toUpperCase() === 'OK') c.resolve({ untagged: c.untagged, text: m[3], code });
      else c.reject(new ImapError(`IMAP: ${m[3].replace(/^\[[^\]]*\] ?/, '') || m[2]}`, code));
    }
  }

  let greetingWaiter = () => {};
  const greeted = new Promise((resolve) => { greetingWaiter = resolve; });

  (async () => {
    for (;;) {
      const chunk = await conn.read();
      if (!chunk) break;
      append(chunk);
      let r;
      while ((r = takeResponse())) {
        try { handle(r); } catch (e) { console.warn('IMAP parse error', e, r.text); }
      }
    }
    closed = true;
    if (current) { const c = current; current = null; c.reject(new ImapError('IMAP: the connection was closed')); }
    greetingWaiter();
  })();

  /** Run a command; parts are strings and literals (Uint8Array). */
  function command(...parts) {
    const run = () => new Promise((resolve, reject) => {
      if (closed) { reject(new ImapError('IMAP: the connection is closed')); return; }
      const tag = `A${++tagCounter}`;
      current = { tag, untagged: [], resolve, reject, cont: null };
      const literalPlus = caps.has('LITERAL+');
      (async () => {
        let line = `${tag} `;
        for (const part of parts) {
          if (part instanceof Uint8Array) {
            conn.send(`${line}{${part.length}${literalPlus ? '+' : ''}}\r\n`);
            line = '';
            if (!literalPlus) await new Promise((r) => { current.cont = r; });
            conn.send(part);
          } else line += part;
        }
        conn.send(`${line}\r\n`);
      })().catch(reject);
    });
    const p = chain.then(run, run);
    chain = p.catch(() => {});
    return p;
  }

  /** A command that continues with SASL data (AUTHENTICATE). */
  function authenticate(mechanism, initial) {
    const run = () => new Promise((resolve, reject) => {
      const tag = `A${++tagCounter}`;
      current = { tag, untagged: [], resolve, reject, cont: null };
      if (caps.has('SASL-IR')) conn.send(`${tag} AUTHENTICATE ${mechanism} ${initial}\r\n`);
      else { current.cont = () => conn.send(`${initial}\r\n`); conn.send(`${tag} AUTHENTICATE ${mechanism}\r\n`); }
    });
    const p = chain.then(run, run);
    chain = p.catch(() => {});
    return p;
  }

  await greeted;
  if (!greeting) throw new ImapError('IMAP: the server closed the connection');
  if (greeting.status === 'BYE') throw new ImapError(`IMAP: ${greeting.text}`);
  if (!caps.size) await command('CAPABILITY');
  if (security === 'starttls') {
    if (!caps.has('STARTTLS')) throw new ImapError('IMAP: the server does not offer STARTTLS');
    await command('STARTTLS');
    await conn.startTls(insecure);
    caps = new Set();
    await command('CAPABILITY');
  }
  if (greeting.status !== 'PREAUTH') {
    try {
      if (caps.has('AUTH=PLAIN') || caps.has('LOGINDISABLED')) {
        const bytes = enc.encode(`\0${user}\0${password}`);
        await authenticate('PLAIN', btoa(String.fromCharCode(...bytes)));
      } else {
        await command('LOGIN ', quote(user), ' ', quote(password));
      }
    } catch (e) { conn.close(); throw e; }
    await command('CAPABILITY').catch(() => {}); // capabilities may change after login
  }

  const mailbox = (path) => {
    const e = encodeMailbox(path);
    return /^[A-Za-z0-9_.\-/&,+]+$/.test(e) ? `"${e}"` : quote(e);
  };

  const client = {
    get capabilities() { return caps; },
    get selected() { return selected.path; },
    get exists() { return selected.exists; },
    get closed() { return closed; },

    /** Folders: [{ path, name, delimiter, flags, special, selectable }]. */
    async list() {
      const r = await command('LIST "" "*"');
      const out = [];
      for (const t of r.untagged) {
        if (!Array.isArray(t) || String(t[0]).toUpperCase() !== 'LIST') continue;
        const flags = (t[1] || []).map(String);
        const delimiter = str(t[2]) || '/';
        const path = decodeMailbox(str(t[3]));
        const name = path.split(delimiter).pop();
        let special = flags.find((f) => SPECIAL.some((s) => s.toLowerCase() === f.toLowerCase())) || '';
        if (/^INBOX$/i.test(path)) special = '\\Inbox';
        if (!special && !path.includes(delimiter)) special = (GUESS.find(([, re]) => re.test(name)) || [''])[0];
        if (!special && /^INBOX[./]/i.test(path)) special = (GUESS.find(([, re]) => re.test(name)) || [''])[0];
        out.push({ path: /^INBOX$/i.test(path) ? 'INBOX' : path, name: /^INBOX$/i.test(path) ? 'INBOX' : name, delimiter, flags, special, selectable: !flags.some((f) => /^\\Noselect$|^\\NonExistent$/i.test(f)) });
      }
      return out;
    },

    async status(path) {
      const r = await command('STATUS ', mailbox(path), ' (MESSAGES UNSEEN)');
      const t = r.untagged.find((x) => Array.isArray(x) && String(x[0]).toUpperCase() === 'STATUS');
      const a = t ? fetchAttributes(t[2] || []) : {};
      return { messages: Number(a.MESSAGES || 0), unseen: Number(a.UNSEEN || 0) };
    },

    async select(path) {
      selected.path = null;
      const r = await command('SELECT ', mailbox(path));
      const info = { exists: 0, uidValidity: 0, uidNext: 0, readOnly: /^READ-ONLY/i.test(r.code) };
      for (const u of r.untagged) {
        if (Array.isArray(u)) { if (String(u[1]).toUpperCase() === 'EXISTS') info.exists = Number(u[0]); continue; }
        const code = (/^\[([^\]]*)\]/.exec(u.text) || [])[1] || '';
        const [k, v] = code.split(' ');
        if (/^UIDVALIDITY$/i.test(k)) info.uidValidity = Number(v);
        if (/^UIDNEXT$/i.test(k)) info.uidNext = Number(v);
      }
      selected.path = path;
      selected.exists = info.exists;
      return info;
    },

    /**
     * Message summaries of a sequence range ("1:50") or of UIDs ({ uids }): [{ uid, seq, flags, date, size, header }],
     * header = the raw header fields (bytes) for the list.
     */
    async summaries(range) {
      const items = '(UID FLAGS INTERNALDATE RFC822.SIZE BODY.PEEK[HEADER.FIELDS (FROM TO CC SUBJECT DATE MESSAGE-ID IN-REPLY-TO REFERENCES CONTENT-TYPE)])';
      const r = range.uids ? (range.uids.length ? await command(`UID FETCH ${uidSet(range.uids)} ${items}`) : { untagged: [] }) : await command(`FETCH ${range} ${items}`);
      const out = [];
      for (const t of r.untagged) {
        if (!Array.isArray(t) || String(t[1]).toUpperCase() !== 'FETCH') continue;
        const a = fetchAttributes(t[2] || []);
        const headerKey = Object.keys(a).find((k) => k.startsWith('BODY[HEADER'));
        out.push({ uid: Number(a.UID), seq: Number(t[0]), flags: (a.FLAGS || []).map(String), date: parseInternalDate(str(a.INTERNALDATE)), size: Number(a['RFC822.SIZE'] || 0), header: headerKey ? a[headerKey] : null });
      }
      return out;
    },

    /** UIDs matching a search (criteria as IMAP search keys, strings are quoted by the caller with quote()). */
    async search(...criteria) {
      const parts = criteria.some((c) => c instanceof Uint8Array) ? ['UID SEARCH CHARSET UTF-8 ', ...criteria] : ['UID SEARCH ', ...criteria];
      const r = await command(...parts);
      const out = [];
      for (const t of r.untagged) if (Array.isArray(t) && String(t[0]).toUpperCase() === 'SEARCH') out.push(...t.slice(1).map(Number));
      return out;
    },

    /** The complete message (bytes) without setting \Seen. */
    async fetchRaw(uid) {
      const r = await command(`UID FETCH ${uid} (UID BODY.PEEK[])`);
      for (const t of r.untagged) {
        if (!Array.isArray(t) || String(t[1]).toUpperCase() !== 'FETCH') continue;
        const a = fetchAttributes(t[2] || []);
        if (Number(a.UID) === Number(uid) || !a.UID) {
          const v = a['BODY[]'];
          return v instanceof Uint8Array ? v : enc.encode(str(v));
        }
      }
      throw new ImapError('IMAP: the message no longer exists');
    },

    async setFlags(uids, add, flags) {
      if (!uids.length) return;
      await command(`UID STORE ${uidSet(uids)} ${add ? '+' : '-'}FLAGS.SILENT (${flags.join(' ')})`);
    },

    async copy(uids, dest) { await command(`UID COPY ${uidSet(uids)} `, mailbox(dest)); },

    async move(uids, dest) {
      if (!uids.length) return;
      if (caps.has('MOVE')) { await command(`UID MOVE ${uidSet(uids)} `, mailbox(dest)); return; }
      await client.copy(uids, dest);
      await client.expunge(uids);
    },

    /** Delete messages for good (\Deleted + UID EXPUNGE, or EXPUNGE without UIDPLUS). */
    async expunge(uids) {
      if (!uids.length) return;
      await client.setFlags(uids, true, ['\\Deleted']);
      if (caps.has('UIDPLUS')) await command(`UID EXPUNGE ${uidSet(uids)}`);
      else await command('EXPUNGE');
    },

    async append(path, bytes, flags = [], date = Date.now()) {
      await command('APPEND ', mailbox(path), ` (${flags.join(' ')}) "${internalDate(date)}" `, bytes);
    },

    async create(path) { await command('CREATE ', mailbox(path)); },
    async remove(path) { await command('DELETE ', mailbox(path)); },
    async rename(from, to) { await command('RENAME ', mailbox(from), ' ', mailbox(to)); },
    async noop() { await command('NOOP'); },

    async close() {
      if (!closed) await Promise.race([command('LOGOUT').catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
      closed = true;
      conn.close();
    },
  };
  return client;
}
