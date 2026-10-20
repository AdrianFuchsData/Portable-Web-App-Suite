/*
 * Remote file systems of the FTP/SFTP client, all with the same interface:
 *   await fs.home()                      -> start directory
 *   await fs.list(path)                  -> [{ name, size, isDir, mtime }]
 *   await fs.read(path, onProgress, { offset })  -> Uint8Array from offset; onProgress(done, total) counts from the file start.
 *       A failed read has `error.partial` (the bytes received before the failure), so it can be resumed.
 *   await fs.write(path, bytes, onProgress, { offset })   bytes go to the file from offset (resume: offset = remote size)
 *   await fs.size(path)                  -> size or null (missing)
 *   await fs.setTime(path, mtimeMs)      -> modification time (best effort)
 *   await fs.mkdir(path) / rmdir(path) / remove(path) / rename(from, to)
 *   await fs.close()
 * FTP (RFC 959, passive mode, MLSD or LIST, explicit and implicit FTPS) is implemented here over relay connections;
 * SFTP uses the SSH engine (shared/js/ssh.js).
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export class FtpError extends Error {
  constructor(code, text) { super(`${code} ${text}`); this.code = code; }
}

/** Line reader on a relay connection. */
class Lines {
  constructor(conn) { this.conn = conn; this.buf = ''; }
  async line() {
    for (;;) {
      const i = this.buf.indexOf('\n');
      if (i >= 0) { const l = this.buf.slice(0, i).replace(/\r$/, ''); this.buf = this.buf.slice(i + 1); return l; }
      const chunk = await this.conn.read();
      if (!chunk) throw new Error('the server closed the connection');
      this.buf += dec.decode(chunk, { stream: true });
    }
  }
  /** One reply (multi-line replies: "123-..." up to "123 ..."). */
  async reply() {
    const first = await this.line();
    const code = Number(first.slice(0, 3));
    const lines = [first.slice(4)];
    if (first[3] === '-') {
      for (;;) {
        const l = await this.line();
        if (l.startsWith(`${first.slice(0, 3)} `)) { lines.push(l.slice(4)); break; }
        lines.push(l.replace(/^ /, ''));
      }
    }
    return { code, text: lines.join('\n') };
  }
}

export function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Read a data connection to its end; `parts` collects the chunks (kept by the caller when the transfer fails). */
async function readAll(conn, onChunk, parts = []) {
  let total = 0;
  for (;;) {
    const chunk = await conn.read();
    if (!chunk) break;
    parts.push(chunk);
    total += chunk.length;
    if (onChunk) onChunk(total);
  }
  return concat(parts);
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** Parse a LIST line (Unix "ls -l" or Windows/IIS "MM-DD-YY  HH:MMAM <DIR> name" format). */
export function parseListLine(line) {
  const unix = /^([bcdlps-])[rwxsStT-]{9}[+@.]?\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\w{3})\s+(\d{1,2})\s+(\d{1,2}:\d{2}|\d{4})\s+(.+)$/.exec(line);
  if (unix) {
    let name = unix[6];
    if (unix[1] === 'l') name = name.replace(/ -> .*$/, '');
    const now = new Date();
    let year = now.getFullYear(), hh = 0, mm = 0;
    if (unix[5].includes(':')) { [hh, mm] = unix[5].split(':').map(Number); } else year = Number(unix[5]);
    const d = new Date(year, MONTHS[unix[3].toLowerCase()] ?? 0, Number(unix[4]), hh, mm);
    if (unix[5].includes(':') && d > now) d.setFullYear(year - 1);
    return { name, size: Number(unix[2]), isDir: unix[1] === 'd', link: unix[1] === 'l', mtime: d.getTime() };
  }
  const win = /^(\d{2})-(\d{2})-(\d{2,4})\s+(\d{1,2}):(\d{2})([AP]M)\s+(<DIR>|\d+)\s+(.+)$/i.exec(line);
  if (win) {
    let year = Number(win[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    let hh = Number(win[4]) % 12;
    if (/PM/i.test(win[6])) hh += 12;
    return { name: win[8], size: win[7] === '<DIR>' ? 0 : Number(win[7]), isDir: win[7] === '<DIR>', mtime: new Date(year, Number(win[1]) - 1, Number(win[2]), hh, Number(win[5])).getTime() };
  }
  return null;
}

/** Parse an MLSD line ("type=file;size=12;modify=20260101120000; name"). */
export function parseMlsdLine(line) {
  const space = line.indexOf(' ');
  if (space < 0) return null;
  const facts = Object.fromEntries(line.slice(0, space).split(';').filter(Boolean).map((f) => { const i = f.indexOf('='); return [f.slice(0, i).toLowerCase(), f.slice(i + 1)]; }));
  const name = line.slice(space + 1);
  const type = (facts.type || '').toLowerCase();
  if (type === 'cdir' || type === 'pdir' || name === '.' || name === '..') return null;
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(facts.modify || '');
  return { name, size: Number(facts.size || facts.sizd || 0), isDir: type === 'dir', mtime: m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null };
}

/**
 * Connect to an FTP server through the relay.
 * options: { relay, host, port = 21, user = 'anonymous', password = '', tls: 'none'|'explicit'|'implicit', insecure }
 */
export async function openFtp({ relay, host, port, user, password, tls = 'none', insecure = false }) {
  const implicit = tls === 'implicit';
  port = Number(port) || (implicit ? 990 : 21);
  const conn = await Suite.relay.connect(relay, { host, port, tls: implicit, insecure });
  const lines = new Lines(conn);
  let queue = Promise.resolve();
  const serial = (fn) => { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; };
  const send = async (command, expect = null) => {
    conn.send(enc.encode(`${command}\r\n`));
    const r = await lines.reply();
    if (expect && !expect.includes(Math.floor(r.code / 100))) throw new FtpError(r.code, r.text);
    return r;
  };
  try {
    const hello = await lines.reply();
    if (hello.code !== 220) throw new FtpError(hello.code, hello.text);
    if (tls === 'explicit') {
      await send('AUTH TLS', [2]);
      await conn.startTls(insecure);
    }
    if (tls !== 'none') { await send('PBSZ 0', [2]); await send('PROT P', [2]); }
    const u = await send(`USER ${user || 'anonymous'}`, [2, 3]);
    if (u.code === 331 || u.code === 332) await send(`PASS ${password || ''}`, [2]);
    await send('TYPE I', [2]);
    await send('OPTS UTF8 ON').catch(() => {});
  } catch (e) { conn.close(); throw e; }
  const feat = await send('FEAT').catch(() => ({ code: 500, text: '' }));
  const hasMlsd = feat.code === 211 && /\bMLST\b/i.test(feat.text);
  let epsv = true;

  /** Open a passive data connection, send the command, collect or send data. */
  async function data(command, { upload = null, onProgress = null, rest = 0 } = {}) {
    let dataPort;
    if (epsv) {
      const r = await send('EPSV');
      const m = /\(\|\|\|(\d+)\|\)/.exec(r.text);
      if (r.code === 229 && m) dataPort = Number(m[1]); else epsv = false;
    }
    if (!dataPort) {
      const r = await send('PASV', [2]);
      const m = /(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)/.exec(r.text);
      if (!m) throw new FtpError(r.code, r.text);
      dataPort = Number(m[5]) * 256 + Number(m[6]);
    }
    // the data connection goes to the same host as the control connection (addresses in PASV replies are often private)
    const dc = await Suite.relay.connect(relay, { host, port: dataPort, tls: tls !== 'none', insecure });
    if (rest) await send(`REST ${rest}`, [3]).catch((e) => { dc.close(); throw e; });
    const start = await send(command);
    if (Math.floor(start.code / 100) !== 1) { dc.close(); throw new FtpError(start.code, start.text); }
    let result = null;
    const parts = [];
    try {
      if (upload) {
        const CHUNK = 64 * 1024;
        for (let o = 0; o < upload.length; o += CHUNK) {
          dc.send(upload.subarray(o, o + CHUNK));
          if (onProgress) onProgress(Math.min(upload.length, o + CHUNK), upload.length);
          if (o % (CHUNK * 16) === 0) await new Promise((r) => setTimeout(r, 0));
        }
        dc.close(); // end of file for the server
      } else result = await readAll(dc, onProgress, parts);
      const done = await lines.reply();
      if (Math.floor(done.code / 100) !== 2) throw new FtpError(done.code, done.text);
    } catch (e) {
      if (!upload) e.partial = concat(parts); // what arrived before the failure (426 "transfer aborted", lost connection)
      throw e;
    }
    return result;
  }

  const fs = {
    kind: 'ftp',
    home: () => serial(async () => { const r = await send('PWD', [2]); const m = /"((?:[^"]|"")*)"/.exec(r.text); return m ? m[1].replace(/""/g, '"') : '/'; }),
    list: (path) => serial(async () => {
      const bytes = await data(hasMlsd ? `MLSD ${path}` : `LIST -a ${path}`).catch(async (e) => {
        if (!hasMlsd && e.code >= 500) return data(`LIST ${path}`); // servers that do not like "-a"
        throw e;
      });
      return dec.decode(bytes).split(/\r?\n/).filter(Boolean).map(hasMlsd ? parseMlsdLine : parseListLine)
        .filter((e) => e && e.name !== '.' && e.name !== '..');
    }),
    read: (path, onProgress, { offset = 0 } = {}) => serial(async () => {
      let total = 0;
      const size = await send(`SIZE ${path}`).catch(() => null);
      if (size && size.code === 213) total = Number(size.text);
      // REST before RETR: the server starts at the offset
      return data(`RETR ${path}`, { rest: offset, onProgress: onProgress ? (n) => onProgress(offset + n, total) : null });
    }),
    // resuming appends the rest (APPE): the remote file must have exactly `offset` bytes
    write: (path, bytes, onProgress, { offset = 0 } = {}) => serial(() => data(`${offset ? 'APPE' : 'STOR'} ${path}`, {
      upload: offset ? bytes.subarray(offset) : bytes, onProgress: onProgress ? (n) => onProgress(offset + n, bytes.length) : null,
    })),
    size: (path) => serial(async () => { const r = await send(`SIZE ${path}`); return r.code === 213 ? Number(r.text) : null; }),
    setTime: (path, ms) => serial(async () => {
      const d = new Date(ms);
      const stamp = `${d.getUTCFullYear()}${[d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()].map((n) => String(n).padStart(2, '0')).join('')}`;
      await send(`MFMT ${stamp} ${path}`).catch(() => {}); // not every server has MFMT
    }),
    mkdir: (path) => serial(() => send(`MKD ${path}`, [2])),
    rmdir: (path) => serial(() => send(`RMD ${path}`, [2])),
    remove: (path) => serial(() => send(`DELE ${path}`, [2])),
    rename: (from, to) => serial(async () => { await send(`RNFR ${from}`, [3]); await send(`RNTO ${to}`, [2]); }),
    close: () => serial(async () => { try { await send('QUIT'); } catch (e) { /* closed */ } conn.close(); }),
  };
  return fs;
}

/** SFTP through the SSH engine. options: { relay, host, port, user, password, privateKey, passphrase, hostKey(info) } */
export async function openSftp({ relay, host, port, user, password, privateKey, passphrase, hostKey }) {
  const client = await Suite.ssh.connect(relay, { host, port: Number(port) || 22, user, password: password || '', privateKey: privateKey || '', passphrase: passphrase || '', hostKey });
  const sftp = await client.sftp();
  const CHUNK = 1024 * 1024; // transfers in chunks: progress, and a failure keeps what was transferred
  return {
    kind: 'sftp',
    home: () => sftp.realpath('.'),
    list: async (path) => (await sftp.list(path)).map((e) => ({ name: e.name, size: e.size, isDir: e.isDir, mtime: e.mtime })),
    read: async (path, onProgress, { offset = 0 } = {}) => {
      const total = (await sftp.stat(path)).size;
      const parts = [];
      try {
        for (let o = offset; o < total;) {
          const b = await sftp.readAt(path, o, Math.min(CHUNK, total - o));
          if (!b.length) break;
          parts.push(b);
          o += b.length;
          if (onProgress) onProgress(o, total);
        }
      } catch (e) { e.partial = concat(parts); throw e; }
      if (onProgress && !parts.length) onProgress(total, total);
      return concat(parts);
    },
    write: async (path, bytes, onProgress, { offset = 0 } = {}) => {
      if (offset >= bytes.length && offset) return;
      for (let o = offset; o < bytes.length || o === 0; o += CHUNK) {
        await sftp.writeAt(path, o, bytes.subarray(o, o + CHUNK), o === 0);
        if (onProgress) onProgress(Math.min(bytes.length, o + CHUNK), bytes.length);
        if (!bytes.length) break;
      }
    },
    size: async (path) => { try { return (await sftp.stat(path)).size; } catch (e) { return null; } },
    setTime: (path, ms) => sftp.chtimes(path, ms).catch(() => {}),
    mkdir: (path) => sftp.mkdir(path),
    rmdir: (path) => sftp.rmdir(path),
    remove: (path) => sftp.remove(path),
    rename: (from, to) => sftp.rename(from, to),
    close: async () => { try { sftp.close(); } catch (e) { /* closed */ } client.close(); },
  };
}
