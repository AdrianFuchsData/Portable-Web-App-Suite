/*
 * Database drivers of the database tool. Both offer the same interface:
 *   driver.kind                       'sqlite' | 'postgres'
 *   await driver.query(sql)           -> [{ columns: [{ name, type, numeric }], rows: [[value|null]], command, rowCount }]
 *   await driver.schema()             -> [{ schema, name, type: 'table'|'view', columns: [{ name, type, pk, notnull }] }]
 *   await driver.foreignKeys()        -> [{ schema, table, column, refSchema, refTable, refColumn }]
 *   driver.quote(identifier), driver.literal(value)
 *   await driver.close()
 * SQLite runs in memory with sql.js (driver.export() gives the database file); Postgres speaks the frontend/backend
 * protocol (version 3) and MySQL/MariaDB the client/server protocol (4.1, text queries) over a TCP connection of the relay
 * (shared/js/relay.js).
 */

// ---- SQLite (sql.js) --------------------------------------------------------------------------------

let sqlJs = null;
async function loadSqlJs() {
  if (!sqlJs) sqlJs = await initSqlJs({ wasmBinary: await Suite.embed.bytes('sql-wasm') });
  return sqlJs;
}

export async function openSqlite(bytes = null) {
  const SQL = await loadSqlJs();
  let db = bytes && bytes.length ? new SQL.Database(bytes) : new SQL.Database();
  db.exec('PRAGMA foreign_keys = ON');
  const quote = (id) => `"${String(id).replace(/"/g, '""')}"`;
  return {
    kind: 'sqlite',
    async query(sql) {
      const results = [];
      // run statement by statement so that every statement reports its own result or change count
      for (const stmt of db.iterateStatements(sql)) {
        try {
          const columns = stmt.getColumnNames();
          const rows = [];
          while (stmt.step()) rows.push(stmt.get().map((v) => (v instanceof Uint8Array ? `x'${[...v].map((b) => b.toString(16).padStart(2, '0')).join('')}'` : v)));
          const numeric = columns.map((_, i) => rows.length > 0 && rows.every((r) => r[i] === null || typeof r[i] === 'number'));
          const text = stmt.getSQL().trim();
          if (columns.length) results.push({ columns: columns.map((name, i) => ({ name, type: '', numeric: numeric[i] })), rows, command: text.split(/\s+/)[0].toUpperCase(), rowCount: rows.length });
          else results.push({ columns: [], rows: [], command: text.split(/\s+/)[0].toUpperCase(), rowCount: db.getRowsModified() });
        } finally { stmt.free(); }
      }
      return results;
    },
    async schema() {
      const out = [];
      const objects = db.exec("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name")[0];
      for (const [name, type] of objects ? objects.values : []) {
        const info = db.exec(`PRAGMA table_info(${quote(name)})`)[0];
        out.push({ schema: 'main', name, type, columns: (info ? info.values : []).map(([, cname, ctype, notnull, , pk]) => ({ name: cname, type: ctype, pk: pk > 0, notnull: !!notnull })) });
      }
      return out;
    },
    async foreignKeys() {
      const out = [];
      const tables = db.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")[0];
      for (const [name] of tables ? tables.values : []) {
        const fks = db.exec(`PRAGMA foreign_key_list(${quote(name)})`)[0];
        for (const row of fks ? fks.values : []) out.push({ schema: 'main', table: name, column: row[3], refSchema: 'main', refTable: row[2], refColumn: row[4] });
      }
      return out;
    },
    /** Columns that identify a row (rowid for tables without primary key). */
    rowKey(table) { return table.columns.some((c) => c.pk) ? table.columns.filter((c) => c.pk).map((c) => c.name) : ['rowid']; },
    quote,
    literal: (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`),
    export: () => db.export(),
    /** Size of the database file in bytes. */
    size: () => db.exec('PRAGMA page_count')[0].values[0][0] * db.exec('PRAGMA page_size')[0].values[0][0],
    /** Replace the database by an exported file (undo). */
    restore(data) {
      db.close();
      db = new SQL.Database(data);
      db.exec('PRAGMA foreign_keys = ON');
    },
    async close() { db.close(); },
  };
}

// ---- Postgres -------------------------------------------------------------------------------------------

const enc = new TextEncoder();
const dec = new TextDecoder();
const NUMERIC_OIDS = new Set([20, 21, 23, 26, 700, 701, 1700, 790]);
const TYPE_NAMES = { 16: 'bool', 17: 'bytea', 18: 'char', 19: 'name', 20: 'int8', 21: 'int2', 23: 'int4', 25: 'text', 26: 'oid', 114: 'json', 700: 'float4', 701: 'float8', 1042: 'bpchar', 1043: 'varchar', 1082: 'date', 1083: 'time', 1114: 'timestamp', 1184: 'timestamptz', 1700: 'numeric', 2950: 'uuid', 3802: 'jsonb' };

export class PgError extends Error {
  constructor(fields) {
    super(fields.M || 'Postgres error');
    this.fields = fields;
    this.code = fields.C;
  }
}

function md5hex(input) {
  // compact MD5 (needed for Postgres md5 authentication; WebCrypto has no MD5)
  const bytes = typeof input === 'string' ? enc.encode(input) : input;
  const n = (((bytes.length + 8) >> 6) + 1) * 16;
  const w = new Uint32Array(n);
  for (let i = 0; i < bytes.length; i++) w[i >> 2] |= bytes[i] << ((i % 4) * 8);
  w[bytes.length >> 2] |= 0x80 << ((bytes.length % 4) * 8);
  w[n - 2] = bytes.length * 8;
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
  let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let o = 0; o < n; o += 16) {
    let [a, b, c, d] = [a0, b0, c0, d0];
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (b & c) | (~b & d); g = i; } else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; } else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; } else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const tmp = d;
      d = c; c = b;
      const x = (a + f + K[i] + w[o + g]) >>> 0;
      const s = S[(i >> 4) * 4 + (i % 4)];
      b = (b + ((x << s) | (x >>> (32 - s)))) >>> 0;
      a = tmp;
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
  }
  return [a0, b0, c0, d0].map((v) => [0, 8, 16, 24].map((s) => ((v >>> s) & 255).toString(16).padStart(2, '0')).join('')).join('');
}

const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, typeof data === 'string' ? enc.encode(data) : data));
}

/** Messages to the server: type byte + length + body. */
function message(type, ...parts) {
  const body = parts.map((p) => (typeof p === 'string' ? enc.encode(p) : p));
  const len = 4 + body.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array((type ? 1 : 0) + len);
  let o = 0;
  if (type) out[o++] = type.charCodeAt(0);
  new DataView(out.buffer).setInt32(o, len);
  o += 4;
  for (const p of body) { out.set(p, o); o += p.length; }
  return out;
}
const int32 = (v) => { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v); return b; };
const cstr = (s) => enc.encode(`${s}\0`);

/** Buffered reader of server messages. */
class Reader {
  constructor(conn) { this.conn = conn; this.buf = new Uint8Array(0); }
  async fill(n) {
    while (this.buf.length < n) {
      const chunk = await this.conn.read();
      if (!chunk) throw new Error('the server closed the connection');
      const next = new Uint8Array(this.buf.length + chunk.length);
      next.set(this.buf);
      next.set(chunk, this.buf.length);
      this.buf = next;
    }
  }
  async byte() { await this.fill(1); const b = this.buf[0]; this.buf = this.buf.subarray(1); return b; }
  async message() {
    await this.fill(5);
    const type = String.fromCharCode(this.buf[0]);
    const len = new DataView(this.buf.buffer, this.buf.byteOffset).getInt32(1);
    await this.fill(1 + len);
    const body = this.buf.slice(5, 1 + len);
    this.buf = this.buf.subarray(1 + len);
    return { type, body, view: new DataView(body.buffer) };
  }
}

function fields(body) {
  const out = {};
  let p = 0;
  while (p < body.length && body[p]) {
    const code = String.fromCharCode(body[p]);
    const end = body.indexOf(0, p + 1);
    out[code] = dec.decode(body.subarray(p + 1, end));
    p = end + 1;
  }
  return out;
}

/**
 * Connect to Postgres through the relay.
 * options: { relay, host, port = 5432, database, user, password, ssl: 'disable'|'prefer'|'require', insecure }
 */
export async function openPostgres({ relay, host, port = 5432, database, user, password = '', ssl = 'prefer', insecure = false }) {
  const conn = await Suite.relay.connect(relay, { host, port: Number(port) || 5432 });
  const reader = new Reader(conn);
  try {
    if (ssl !== 'disable') {
      conn.send(message(null, int32(80877103)));
      const answer = String.fromCharCode(await reader.byte());
      if (answer === 'S') await conn.startTls(insecure);
      else if (ssl === 'require') throw new Error('the server does not support SSL');
    }
    conn.send(message(null, int32(196608), cstr('user'), cstr(user), cstr('database'), cstr(database || user), cstr('application_name'), cstr('Portable Web App Suite'), cstr('client_encoding'), cstr('UTF8'), new Uint8Array([0])));
    let scram = null;
    for (;;) {
      const m = await reader.message();
      if (m.type === 'E') throw new PgError(fields(m.body));
      if (m.type === 'R') {
        const code = m.view.getInt32(0);
        if (code === 0) continue;
        if (code === 3) conn.send(message('p', cstr(password)));
        else if (code === 5) {
          // md5(md5(password + user) as hex + salt bytes)
          const inner = enc.encode(md5hex(password + user));
          const salted = new Uint8Array(inner.length + 4);
          salted.set(inner);
          salted.set(m.body.subarray(4, 8), inner.length);
          conn.send(message('p', cstr(`md5${md5hex(salted)}`)));
        }
        else if (code === 10) {
          const mechs = dec.decode(m.body.subarray(4)).split('\0').filter(Boolean);
          if (!mechs.includes('SCRAM-SHA-256')) throw new Error(`unsupported authentication: ${mechs.join(', ')}`);
          const nonce = b64(crypto.getRandomValues(new Uint8Array(18)));
          scram = { nonce, clientFirstBare: `n=,r=${nonce}` };
          const first = enc.encode(`n,,${scram.clientFirstBare}`);
          conn.send(message('p', cstr('SCRAM-SHA-256'), int32(first.length), first));
        } else if (code === 11) {
          const serverFirst = dec.decode(m.body.subarray(4));
          const attrs = Object.fromEntries(serverFirst.split(',').map((kv) => [kv[0], kv.slice(2)]));
          if (!attrs.r.startsWith(scram.nonce)) throw new Error('SCRAM: invalid server nonce');
          const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
          const salted = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(attrs.s), iterations: Number(attrs.i) }, keyMaterial, 256));
          const clientKey = await hmac(salted, 'Client Key');
          const storedKey = new Uint8Array(await crypto.subtle.digest('SHA-256', clientKey));
          const finalNoProof = `c=biws,r=${attrs.r}`;
          const authMessage = `${scram.clientFirstBare},${serverFirst},${finalNoProof}`;
          const signature = await hmac(storedKey, authMessage);
          const proof = clientKey.map((b, i) => b ^ signature[i]);
          scram.serverSignature = b64(await hmac(await hmac(salted, 'Server Key'), authMessage));
          conn.send(message('p', `${finalNoProof},p=${b64(proof)}`));
        } else if (code === 12) {
          const v = dec.decode(m.body.subarray(4)).split(',').find((x) => x.startsWith('v='));
          if (!v || v.slice(2) !== scram.serverSignature) throw new Error('SCRAM: the server signature does not match');
        } else throw new Error(`unsupported authentication method ${code}`);
        continue;
      }
      if (m.type === 'Z') break;
      // S (parameter status), K (backend key), N (notice): nothing to do
    }
  } catch (e) { conn.close(); throw e; }

  let busy = Promise.resolve();
  const quote = (id) => `"${String(id).replace(/"/g, '""')}"`;
  const driver = {
    kind: 'postgres',
    notices: [],
    /** Simple query protocol: every statement of sql gives a result. Calls are serialised. */
    query(sql) {
      const run = async () => {
        conn.send(message('Q', cstr(sql)));
        const results = [];
        let current = null;
        let error = null;
        for (;;) {
          const m = await reader.message();
          if (m.type === 'T') {
            const n = m.view.getInt16(0);
            let p = 2;
            const columns = [];
            for (let i = 0; i < n; i++) {
              const end = m.body.indexOf(0, p);
              const name = dec.decode(m.body.subarray(p, end));
              p = end + 1;
              const oid = m.view.getInt32(p + 6);
              columns.push({ name, type: TYPE_NAMES[oid] || String(oid), numeric: NUMERIC_OIDS.has(oid), oid });
              p += 18;
            }
            current = { columns, rows: [], command: '', rowCount: 0 };
          } else if (m.type === 'D') {
            const n = m.view.getInt16(0);
            let p = 2;
            const row = [];
            for (let i = 0; i < n; i++) {
              const len = m.view.getInt32(p);
              p += 4;
              if (len < 0) { row.push(null); continue; }
              const text = dec.decode(m.body.subarray(p, p + len));
              p += len;
              const col = current.columns[i];
              row.push(col && col.numeric && col.oid !== 20 && col.oid !== 1700 && text !== 'NaN' ? Number(text) : col && col.oid === 16 ? text === 't' : text);
            }
            current.rows.push(row);
          } else if (m.type === 'C') {
            const tag = dec.decode(m.body.subarray(0, m.body.length - 1));
            const parts = tag.split(' ');
            const count = Number(parts[parts.length - 1]);
            const result = current || { columns: [], rows: [], command: '', rowCount: 0 };
            result.command = parts[0];
            result.rowCount = Number.isFinite(count) ? count : result.rows.length;
            results.push(result);
            current = null;
          } else if (m.type === 'I') results.push({ columns: [], rows: [], command: '', rowCount: 0 });
          else if (m.type === 'E') error = new PgError(fields(m.body));
          else if (m.type === 'N') driver.notices.push(fields(m.body).M);
          else if (m.type === 'Z') break;
        }
        if (error) { error.results = results; throw error; }
        return results;
      };
      const p = busy.then(run, run);
      busy = p.catch(() => {});
      return p;
    },
    async schema() {
      const [rows] = await driver.query(`SELECT c.table_schema, c.table_name, t.table_type, c.column_name, c.data_type, c.is_nullable,
          EXISTS (SELECT 1 FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage k
            ON tc.constraint_name = k.constraint_name AND tc.table_schema = k.table_schema AND tc.table_name = k.table_name
            WHERE tc.constraint_type = 'PRIMARY KEY' AND k.table_schema = c.table_schema AND k.table_name = c.table_name AND k.column_name = c.column_name) AS pk
        FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY c.table_schema, c.table_name, c.ordinal_position`);
      const map = new Map();
      for (const [schema, name, type, column, dataType, nullable, pk] of rows.rows) {
        const key = `${schema}.${name}`;
        if (!map.has(key)) map.set(key, { schema, name, type: type === 'VIEW' ? 'view' : 'table', columns: [] });
        map.get(key).columns.push({ name: column, type: dataType, pk: pk === true || pk === 't', notnull: nullable === 'NO' });
      }
      return [...map.values()];
    },
    async foreignKeys() {
      try {
        const [rows] = await driver.query(`SELECT kcu.table_schema, kcu.table_name, kcu.column_name, ccu.table_schema, ccu.table_name, ccu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'`);
        return rows.rows.map(([schema, table, column, refSchema, refTable, refColumn]) => ({ schema, table, column, refSchema, refTable, refColumn }));
      } catch (e) { return []; } // a server without these views (or without permission): tables only
    },
    rowKey(table) { return table.columns.filter((c) => c.pk).map((c) => c.name); },
    quote,
    literal: (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`),
    async close() { try { conn.send(message('X')); } catch (e) { /* closed */ } conn.close(); },
  };
  return driver;
}

// ---- MySQL / MariaDB (client/server protocol 4.1) --------------------------------------------------------------

export class MysqlError extends Error {
  constructor(code, state, text) { super(text); this.code = state || String(code); this.errno = code; this.fields = { C: state, M: text }; }
}

const CLIENT = {
  LONG_PASSWORD: 0x1, FOUND_ROWS: 0x2, LONG_FLAG: 0x4, CONNECT_WITH_DB: 0x8, PROTOCOL_41: 0x200, SSL: 0x800, TRANSACTIONS: 0x2000,
  SECURE_CONNECTION: 0x8000, MULTI_STATEMENTS: 0x10000, MULTI_RESULTS: 0x20000, PLUGIN_AUTH: 0x80000, PLUGIN_AUTH_LENENC: 0x200000,
};
const MYSQL_NUMERIC = new Set([0, 1, 2, 3, 4, 5, 8, 9, 13, 246]); // DECIMAL TINY SHORT LONG FLOAT DOUBLE LONGLONG INT24 YEAR NEWDECIMAL
const MYSQL_TYPES = { 0: 'decimal', 1: 'tinyint', 2: 'smallint', 3: 'int', 4: 'float', 5: 'double', 7: 'timestamp', 8: 'bigint', 9: 'mediumint', 10: 'date', 11: 'time', 12: 'datetime',
  13: 'year', 15: 'varchar', 16: 'bit', 245: 'json', 246: 'decimal', 247: 'enum', 248: 'set', 249: 'tinyblob', 250: 'mediumblob', 251: 'longblob', 252: 'blob', 253: 'varchar', 254: 'char', 255: 'geometry' };
const SERVER_MORE_RESULTS = 0x8;

async function sha(alg, ...parts) {
  const bytes = parts.map((p) => (typeof p === 'string' ? enc.encode(p) : p));
  const all = new Uint8Array(bytes.reduce((n, b) => n + b.length, 0));
  let o = 0;
  for (const b of bytes) { all.set(b, o); o += b.length; }
  return new Uint8Array(await crypto.subtle.digest(alg, all));
}
const xor = (a, b) => a.map((x, i) => x ^ b[i % b.length]);

/** The scrambled password for an authentication plugin. */
async function mysqlScramble(plugin, password, nonce) {
  if (!password) return new Uint8Array(0);
  if (plugin === 'mysql_native_password') { // SHA1(pw) XOR SHA1(nonce + SHA1(SHA1(pw)))
    const h1 = await sha('SHA-1', password);
    return xor(h1, await sha('SHA-1', nonce, await sha('SHA-1', h1)));
  }
  if (plugin === 'caching_sha2_password') { // SHA256(pw) XOR SHA256(SHA256(SHA256(pw)) + nonce)
    const h1 = await sha('SHA-256', password);
    return xor(h1, await sha('SHA-256', await sha('SHA-256', h1), nonce));
  }
  if (plugin === 'mysql_clear_password') return enc.encode(`${password}\0`);
  throw new Error(`unsupported authentication method ${plugin}`);
}

/** Packets of the MySQL protocol: 3 bytes length (little endian), 1 byte sequence number, payload. */
class MysqlPackets {
  constructor(conn) { this.conn = conn; this.reader = new Reader(conn); this.seq = 0; }
  async read() {
    let out = new Uint8Array(0);
    for (;;) { // payloads of 16 MiB - 1 continue in the next packet
      await this.reader.fill(4);
      const b = this.reader.buf;
      const len = b[0] | (b[1] << 8) | (b[2] << 16);
      this.seq = (b[3] + 1) & 255;
      await this.reader.fill(4 + len);
      const part = this.reader.buf.slice(4, 4 + len);
      this.reader.buf = this.reader.buf.subarray(4 + len);
      const next = new Uint8Array(out.length + part.length);
      next.set(out); next.set(part, out.length);
      out = next;
      if (len < 0xffffff) return out;
    }
  }
  send(payload, seq = this.seq) {
    const p = typeof payload === 'string' ? enc.encode(payload) : payload;
    const out = new Uint8Array(4 + p.length);
    out[0] = p.length & 255; out[1] = (p.length >> 8) & 255; out[2] = (p.length >> 16) & 255; out[3] = seq & 255;
    out.set(p, 4);
    this.conn.send(out);
    this.seq = (seq + 1) & 255;
  }
}

/** A cursor over a packet: little-endian integers, length-encoded integers and strings, NUL-terminated strings. */
class Cursor {
  constructor(bytes) { this.b = bytes; this.p = 0; }
  u8() { return this.b[this.p++]; }
  u16() { const v = this.b[this.p] | (this.b[this.p + 1] << 8); this.p += 2; return v; }
  u32() { const v = (this.b[this.p] | (this.b[this.p + 1] << 8) | (this.b[this.p + 2] << 16)) + this.b[this.p + 3] * 0x1000000; this.p += 4; return v; }
  lenenc() {
    const f = this.u8();
    if (f < 0xfb) return f;
    if (f === 0xfb) return null;
    if (f === 0xfc) return this.u16();
    if (f === 0xfd) { const v = this.b[this.p] | (this.b[this.p + 1] << 8) | (this.b[this.p + 2] << 16); this.p += 3; return v; }
    const lo = this.u32(), hi = this.u32();
    return hi * 0x100000000 + lo;
  }
  bytes(n) { const v = this.b.subarray(this.p, this.p + n); this.p += n; return v; }
  str(n) { return dec.decode(this.bytes(n)); }
  lenencBytes() { const n = this.lenenc(); return n === null ? null : this.bytes(n); }
  lenencStr() { const b = this.lenencBytes(); return b === null ? null : dec.decode(b); }
  cstr() { const end = this.b.indexOf(0, this.p); const e = end < 0 ? this.b.length : end; const v = dec.decode(this.b.subarray(this.p, e)); this.p = e + 1; return v; }
  rest() { return this.b.subarray(this.p); }
  get done() { return this.p >= this.b.length; }
}

const le32 = (v) => new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]);
const concat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const mysqlError = (packet) => {
  const c = new Cursor(packet); c.u8();
  const code = c.u16();
  let state = '';
  if (c.b[c.p] === 0x23) { c.u8(); state = c.str(5); }
  return new MysqlError(code, state, dec.decode(c.rest()));
};

async function rsaEncrypt(pem, data) {
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s+/g, '')), (ch) => ch.charCodeAt(0));
  const key = await crypto.subtle.importKey('spki', der, { name: 'RSA-OAEP', hash: 'SHA-1' }, false, ['encrypt']);
  return new Uint8Array(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, key, data));
}

/**
 * Connect to MySQL or MariaDB through the relay.
 * options: { relay, host, port = 3306, database, user, password, ssl: 'disable'|'prefer'|'require', insecure }
 */
export async function openMysql({ relay, host, port = 3306, database, user, password = '', ssl = 'prefer', insecure = false }) {
  const conn = await Suite.relay.connect(relay, { host, port: Number(port) || 3306 });
  const io = new MysqlPackets(conn);
  let tls = false;
  let server = '';
  try {
    const hello = new Cursor(await io.read());
    if (hello.b[0] === 0xff) throw mysqlError(hello.b);
    const protocol = hello.u8();
    if (protocol !== 10) throw new Error(`unsupported MySQL protocol ${protocol}`);
    server = hello.cstr();
    hello.u32(); // connection id
    let nonce = hello.bytes(8);
    hello.u8();
    let caps = hello.u16();
    let plugin = 'mysql_native_password';
    if (!hello.done) {
      hello.u8(); hello.u16(); // charset, status
      caps |= hello.u16() << 16;
      const dataLen = hello.u8();
      hello.bytes(10);
      if (caps & CLIENT.SECURE_CONNECTION) { nonce = concat(nonce, hello.bytes(Math.max(13, dataLen - 8) - 1)); hello.u8(); } // (the last byte is a NUL)
      if (caps & CLIENT.PLUGIN_AUTH) plugin = hello.cstr() || plugin;
    }
    let flags = CLIENT.LONG_PASSWORD | CLIENT.FOUND_ROWS | CLIENT.LONG_FLAG | CLIENT.PROTOCOL_41 | CLIENT.TRANSACTIONS | CLIENT.SECURE_CONNECTION
      | CLIENT.MULTI_STATEMENTS | CLIENT.MULTI_RESULTS | CLIENT.PLUGIN_AUTH | (database ? CLIENT.CONNECT_WITH_DB : 0);
    flags &= caps | CLIENT.MULTI_STATEMENTS | CLIENT.MULTI_RESULTS;
    const head = (f) => concat(le32(f), le32(16 * 1024 * 1024), new Uint8Array([45]), new Uint8Array(23)); // utf8mb4
    if (ssl !== 'disable') {
      if (caps & CLIENT.SSL) {
        flags |= CLIENT.SSL;
        io.send(head(flags));
        await conn.startTls(insecure);
        tls = true;
      } else if (ssl === 'require') throw new Error('the server does not support SSL');
    }
    const auth = await mysqlScramble(plugin, password, nonce);
    io.send(concat(head(flags), enc.encode(`${user}\0`), new Uint8Array([auth.length]), auth, database ? enc.encode(`${database}\0`) : new Uint8Array(0), enc.encode(`${plugin}\0`)));
    for (;;) {
      const packet = await io.read();
      if (packet[0] === 0x00) break; // OK
      if (packet[0] === 0xff) throw mysqlError(packet);
      if (packet[0] === 0xfe) { // switch to another authentication method
        const c = new Cursor(packet); c.u8();
        plugin = c.cstr();
        nonce = c.rest();
        if (nonce.length && nonce[nonce.length - 1] === 0) nonce = nonce.subarray(0, nonce.length - 1);
        io.send(await mysqlScramble(plugin, password, nonce));
        continue;
      }
      if (packet[0] === 0x01) { // caching_sha2_password: more data
        if (packet[1] === 0x03) continue; // fast authentication worked; the OK follows
        if (packet[1] === 0x04) { // full authentication: the password in clear over TLS, otherwise RSA-encrypted
          if (tls) io.send(enc.encode(`${password}\0`));
          else {
            io.send(new Uint8Array([0x02])); // ask for the public key
            const key = await io.read();
            const pem = dec.decode(key[0] === 0x01 ? key.subarray(1) : key);
            io.send(await rsaEncrypt(pem, xor(enc.encode(`${password}\0`), nonce)));
          }
          continue;
        }
        if (/^-----BEGIN/.test(dec.decode(packet.subarray(1, 12)))) continue;
      }
      throw new Error('unexpected answer of the server during authentication');
    }
  } catch (e) { conn.close(); throw e; }

  let busy = Promise.resolve();
  const quote = (id) => `\`${String(id).replace(/`/g, '``')}\``;
  const driver = {
    kind: 'mysql',
    server,
    notices: [],
    /** COM_QUERY with several statements: every statement gives a result. Calls are serialised. */
    query(sql) {
      const run = async () => {
        io.send(concat(new Uint8Array([0x03]), enc.encode(sql)), 0);
        const results = [];
        for (;;) {
          const first = await io.read();
          let more = false;
          if (first[0] === 0xff) { const e = mysqlError(first); e.results = results; throw e; }
          if (first[0] === 0x00) {
            const c = new Cursor(first); c.u8();
            const affected = c.lenenc(); c.lenenc();
            const status = c.u16();
            const command = (sql.trim().split(/\s+/)[0] || '').toUpperCase();
            results.push({ columns: [], rows: [], command, rowCount: affected });
            more = !!(status & SERVER_MORE_RESULTS);
          } else {
            const count = new Cursor(first).lenenc();
            const columns = [];
            for (let i = 0; i < count; i++) {
              const c = new Cursor(await io.read());
              c.lenencStr(); c.lenencStr(); c.lenencStr(); c.lenencStr();
              const name = c.lenencStr();
              c.lenencStr(); c.lenenc();
              const charset = c.u16(); c.u32();
              const type = c.u8();
              columns.push({ name, type: MYSQL_TYPES[type] || String(type), numeric: MYSQL_NUMERIC.has(type), mysqlType: type, binary: charset === 63 && type >= 249 && type <= 252 });
            }
            await io.read(); // EOF after the column definitions
            const rows = [];
            for (;;) {
              const packet = await io.read();
              if (packet[0] === 0xfe && packet.length < 9) { more = !!(new Cursor(packet.subarray(3)).u16() & SERVER_MORE_RESULTS); break; }
              if (packet[0] === 0xff) { const e = mysqlError(packet); e.results = results; throw e; }
              const c = new Cursor(packet);
              rows.push(columns.map((col) => {
                const b = c.lenencBytes();
                if (b === null) return null;
                if (col.binary) return `x'${[...b].map((x) => x.toString(16).padStart(2, '0')).join('')}'`;
                const text = dec.decode(b);
                if (col.numeric && col.mysqlType !== 0 && col.mysqlType !== 246 && !(col.mysqlType === 8 && !Number.isSafeInteger(Number(text)))) return Number(text);
                return text;
              }));
            }
            results.push({ columns, rows, command: 'SELECT', rowCount: rows.length });
          }
          if (!more) break;
        }
        return results;
      };
      const p = busy.then(run, run);
      busy = p.catch(() => {});
      return p;
    },
    async schema() {
      const [rows] = await driver.query(`SELECT c.TABLE_SCHEMA, c.TABLE_NAME, t.TABLE_TYPE, c.COLUMN_NAME, c.COLUMN_TYPE, c.IS_NULLABLE, c.COLUMN_KEY
        FROM information_schema.COLUMNS c JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
        WHERE c.TABLE_SCHEMA = DATABASE() ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION`);
      const map = new Map();
      for (const [, name, type, column, dataType, nullable, key] of rows.rows) {
        if (!map.has(name)) map.set(name, { schema: '', name, type: /VIEW/i.test(type) ? 'view' : 'table', columns: [] }); // (the connection's database: no prefix)
        map.get(name).columns.push({ name: column, type: dataType, pk: key === 'PRI', notnull: nullable === 'NO' });
      }
      return [...map.values()];
    },
    async foreignKeys() {
      try {
        const [rows] = await driver.query(`SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_SCHEMA, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
          FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL`);
        return rows.rows.map(([schema, table, column, refSchema, refTable, refColumn]) => ({ schema, table, column, refSchema, refTable, refColumn }));
      } catch (e) { return []; }
    },
    rowKey(table) { return table.columns.filter((c) => c.pk).map((c) => c.name); },
    quote,
    literal: (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' || typeof v === 'boolean' ? String(v)
      : `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/\0/g, '\\0')}'`),
    async close() { try { io.send(new Uint8Array([0x01]), 0); } catch (e) { /* closed */ } conn.close(); },
  };
  return driver;
}

export { md5hex };
