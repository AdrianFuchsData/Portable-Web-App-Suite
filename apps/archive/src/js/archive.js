/*
 * Archive formats of the archive manager: ZIP (incl. ZIP64 reading), TAR (ustar, pax, GNU long names), TAR.GZ and GZ.
 * fflate does the (de)compression; the container formats are parsed and written here so that ZIP entries are listed
 * without decompressing them and unchanged entries are copied without recompression when saving.
 *
 *   const archive = read(bytes, 'x.zip');   // -> { format, entries: [{ path, dir, size, csize, mtime, mode, link, encrypted, load() }] }
 *   const bytes = write(entries, 'zip', { level: 6, encryption: { password, method: 'aes' | 'zipcrypto', all } });
 *   (encryption: new and changed files are encrypted; with all, also unchanged unencrypted ones)
 *
 * Encrypted ZIP entries (ZipCrypto, WinZip AES; zipcrypto.js) are decrypted with the passwords given to addPassword();
 * load() throws ArchiveError 'ar.needPassword' / 'ar.wrongPassword' otherwise. locked(entry) tells whether a password
 * is still missing (cheap check without decrypting).
 */
import { inflateSync, deflateSync, gunzipSync, gzipSync, strToU8 } from 'fflate';
import * as zc from '@app/zipcrypto.js';

const passwords = [];
/** Remember a password for encrypted entries (tried in order). */
export function addPassword(password) { if (password && !passwords.includes(password)) passwords.unshift(password); }
export function clearPasswords() { passwords.length = 0; }

/** The password that opens an encrypted entry, or null. */
function passwordOf(entry) {
  if (entry.passwordCache !== undefined && passwords.includes(entry.passwordCache)) return entry.passwordCache;
  const { data } = entry.zip.raw();
  for (const pw of passwords) {
    const ok = entry.aes ? zc.aesCheck(data, entry.aes.strength, pw) : zc.zipCryptoCheck(data, pw, entry.zip.check);
    if (ok) { entry.passwordCache = pw; return pw; }
  }
  return null;
}

/** True if the entry is encrypted and none of the known passwords opens it. */
export function locked(entry) { return !!(entry && entry.encrypted && entry.zip && !entry.modified && !passwordOf(entry)); }

/** Encryption of an entry for display: 'AES-256', 'ZipCrypto' or null. */
export function encryptionOf(entry) {
  if (!entry || !entry.encrypted) return null;
  return entry.aes ? `AES-${{ 1: 128, 2: 192, 3: 256 }[entry.aes.strength]}` : 'ZipCrypto';
}

export class ArchiveError extends Error {
  constructor(key, ...args) { super(key); this.key = key; this.args = args; }
}

// ---- helpers --------------------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

export function crc32(data) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const CP437 = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
const utf8 = new TextDecoder('utf-8', { fatal: true });
const latin1 = new TextDecoder('latin1');

function decodeName(bytes, isUtf8) {
  try { return utf8.decode(bytes); } catch (e) {
    if (isUtf8) return new TextDecoder().decode(bytes);
    return Array.from(bytes, (b) => (b < 128 ? String.fromCharCode(b) : CP437[b - 128])).join('');
  }
}

function dosDate(time, date) {
  return new Date(((date >> 9) & 0x7f) + 1980, ((date >> 5) & 0xf) - 1, date & 0x1f, (time >> 11) & 0x1f, (time >> 5) & 0x3f, (time & 0x1f) * 2);
}

function toDos(d) {
  const y = Math.max(1980, d.getFullYear());
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 4) | d.getDate() };
}

/** Normalise a path: forward slashes, no leading slash or "./", no ".." segments. */
export function cleanPath(path) {
  return path.replace(/\\/g, '/').split('/').filter((s) => s && s !== '.' && s !== '..').join('/');
}

function u64(view, offset) { return view.getUint32(offset, true) + view.getUint32(offset + 4, true) * 0x100000000; }

// ---- detection ------------------------------------------------------------------------------------

export function detect(bytes, name = '') {
  const lower = name.toLowerCase();
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 3 || bytes[2] === 5 || bytes[2] === 7)) return 'zip';
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) return /\.(tgz|tar\.gz)$/.test(lower) ? 'tgz' : 'gz';
  if (bytes.length >= 262 && latin1.decode(bytes.subarray(257, 262)) === 'ustar') return 'tar';
  if (/\.tar$/.test(lower)) return 'tar';
  if (bytes.length >= 6 && bytes[0] === 0x37 && bytes[1] === 0x7a && bytes[2] === 0xbc && bytes[3] === 0xaf) throw new ArchiveError('ar.unsupportedFormat', '7z');
  if (bytes.length >= 4 && latin1.decode(bytes.subarray(0, 4)) === 'Rar!') throw new ArchiveError('ar.unsupportedFormat', 'RAR');
  if (bytes.length >= 3 && latin1.decode(bytes.subarray(0, 3)) === 'BZh') throw new ArchiveError('ar.unsupportedFormat', 'bzip2');
  if (bytes.length >= 6 && bytes[0] === 0xfd && latin1.decode(bytes.subarray(1, 5)) === '7zXZ') throw new ArchiveError('ar.unsupportedFormat', 'xz');
  if (bytes.length === 0 && /\.zip$/.test(lower)) return 'zip';
  throw new ArchiveError('ar.unknownFormat');
}

export function formatOfName(name) {
  const lower = name.toLowerCase();
  if (/\.(tgz|tar\.gz)$/.test(lower)) return 'tgz';
  if (/\.tar$/.test(lower)) return 'tar';
  if (/\.gz$/.test(lower)) return 'gz';
  return 'zip';
}

export function read(bytes, name = '') {
  const format = detect(bytes, name);
  if (format === 'zip') return { format, entries: readZip(bytes) };
  if (format === 'tar') return { format, entries: readTar(bytes) };
  const { data, fileName } = gunzip(bytes);
  // a .gz file that contains a tar archive is treated as .tar.gz
  if (format === 'tgz' || (data.length >= 262 && latin1.decode(data.subarray(257, 262)) === 'ustar')) return { format: 'tgz', entries: readTar(data) };
  const inner = fileName || name.replace(/\.gz$/i, '') || 'file';
  return { format: 'gz', entries: [{ path: cleanPath(inner), dir: false, size: data.length, csize: bytes.length, mtime: null, mode: 0o644, load: () => data }] };
}

// ---- ZIP ------------------------------------------------------------------------------------------

function readZip(bytes) {
  if (!bytes.length) return [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new ArchiveError('ar.corrupt');
  let count = view.getUint16(eocd + 10, true);
  let cdOffset = view.getUint32(eocd + 16, true);
  if ((count === 0xffff || cdOffset === 0xffffffff) && eocd >= 20 && view.getUint32(eocd - 20, true) === 0x07064b50) {
    const z64 = u64(view, eocd - 12);
    if (view.getUint32(z64, true) !== 0x06064b50) throw new ArchiveError('ar.corrupt');
    count = u64(view, z64 + 32);
    cdOffset = u64(view, z64 + 48);
  }
  const entries = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) throw new ArchiveError('ar.corrupt');
    const madeBy = view.getUint16(p + 4, true);
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const crc = view.getUint32(p + 16, true);
    let csize = view.getUint32(p + 20, true);
    let size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const external = view.getUint32(p + 38, true);
    let offset = view.getUint32(p + 42, true);
    const rawName = bytes.subarray(p + 46, p + 46 + nameLen);
    const dosTime = view.getUint16(p + 12, true);
    let mtime = dosDate(dosTime, view.getUint16(p + 14, true));
    let aes = null;
    let name = decodeName(rawName, flags & 0x800);
    for (let e = p + 46 + nameLen; e + 4 <= p + 46 + nameLen + extraLen;) {
      const id = view.getUint16(e, true);
      const len = view.getUint16(e + 2, true);
      let q = e + 4;
      if (id === 0x0001) {
        if (size === 0xffffffff) { size = u64(view, q); q += 8; }
        if (csize === 0xffffffff) { csize = u64(view, q); q += 8; }
        if (offset === 0xffffffff) { offset = u64(view, q); q += 8; }
      } else if (id === 0x5455 && len >= 5 && view.getUint8(q) & 1) {
        mtime = new Date(view.getUint32(q + 1, true) * 1000);
      } else if (id === 0x7075 && len > 5) {
        try { name = utf8.decode(bytes.subarray(q + 5, e + 4 + len)); } catch (err) { /* keep the header name */ }
      } else if (id === 0x9901 && len >= 7) {
        aes = { version: view.getUint16(q, true), strength: view.getUint8(q + 4), method: view.getUint16(q + 5, true) };
      }
      e += 4 + len;
    }
    p += 46 + nameLen + extraLen + commentLen;
    const unix = madeBy >> 8 === 3 ? external >>> 16 : 0;
    const dir = name.endsWith('/') || (external & 0x10) !== 0 || (unix & 0o170000) === 0o040000;
    const path = cleanPath(name);
    if (!path) continue;
    const entry = { path, dir, size: dir ? 0 : size, csize: dir ? 0 : csize, mtime, mode: unix & 0o7777 || (dir ? 0o755 : 0o644), encrypted: !!(flags & 1), method };
    if (aes && method === 99) entry.aes = aes;
    if ((unix & 0o170000) === 0o120000) entry.link = true;
    if (!dir) {
      const local = offset;
      const raw = () => {
        if (view.getUint32(local, true) !== 0x04034b50) throw new ArchiveError('ar.corrupt');
        const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
        return { data: bytes.subarray(start, start + csize), localExtra: bytes.subarray(local + 30 + view.getUint16(local + 26, true), start) };
      };
      // ZipCrypto checks the last header byte against the CRC, or the time when sizes follow in a data descriptor
      entry.zip = { raw, method, crc, flags, csize, size, check: flags & 0x8 ? (dosTime >> 8) & 0xff : crc >>> 24 };
      entry.load = () => {
        let { data } = raw();
        let actual = method;
        if (entry.encrypted) {
          if (!entry.aes && method === 99) throw new ArchiveError('ar.unsupportedMethod', path, method);
          const pw = passwordOf(entry);
          if (pw == null) throw new ArchiveError(passwords.length ? 'ar.wrongPassword' : 'ar.needPassword', path);
          try {
            if (entry.aes) { data = zc.aesDecrypt(data, entry.aes.strength, pw); actual = entry.aes.method; } else data = zc.zipCryptoDecrypt(data, pw, entry.zip.check);
          } catch (e) { throw new ArchiveError(e instanceof zc.PasswordError ? 'ar.wrongPassword' : 'ar.corrupt', path); }
        }
        let out;
        if (actual === 0) out = data;
        else if (actual === 8) out = inflateSync(data, { out: new Uint8Array(size) });
        else throw new ArchiveError('ar.unsupportedMethod', path, actual);
        // AE-2 entries carry no CRC (the HMAC protects them)
        if (!(entry.aes && entry.aes.version === 2) && crc32(out) !== crc) throw new ArchiveError('ar.crc', path);
        return out;
      };
      if (entry.link) entry.linkTarget = () => new TextDecoder().decode(entry.load());
    }
    entries.push(entry);
  }
  return entries;
}

function writeZip(entries, { level = 6, encryption = null } = {}) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const enc = new TextEncoder();
  const push = (chunk) => { chunks.push(chunk); offset += chunk.length; };
  for (const entry of entries) {
    const name = enc.encode(entry.dir ? `${entry.path}/` : entry.path);
    const mtime = entry.mtime || new Date();
    const { time, date } = toDos(mtime);
    let method, crc, csize, size, data, flags = 0x800, localExtra = null;
    if (entry.dir) {
      method = 0; crc = 0; size = 0; data = new Uint8Array(0);
    } else if (entry.zip && !entry.modified && (!encryption || entry.encrypted || !encryption.all)) {
      // unchanged entry of the opened ZIP: copy the compressed data (also keeps encrypted entries and their password)
      const raw = entry.zip.raw();
      ({ method, crc, size } = entry.zip);
      data = raw.data;
      // encrypted entries keep their flags (with bit 3 the ZipCrypto check byte is derived from the time) and extra fields
      if (entry.encrypted) { flags = entry.zip.flags | 0x800; localExtra = raw.localExtra; }
    } else {
      const plain = entry.load();
      size = plain.length;
      crc = crc32(plain);
      const packed = level > 0 && size > 0 ? deflateSync(plain, { level }) : null;
      if (packed && packed.length < size) { method = 8; data = packed; } else { method = 0; data = plain; }
      if (encryption && encryption.method === 'aes') {
        localExtra = zc.aesExtra(method);
        data = zc.aesEncrypt(data, encryption.password);
        method = 99; flags |= 1; crc = 0; // AE-2: no CRC
      } else if (encryption) {
        data = zc.zipCryptoEncrypt(data, encryption.password, crc >>> 24);
        flags |= 1;
      }
    }
    csize = data.length;
    if (offset > 0xfffffffe || csize > 0xfffffffe || size > 0xfffffffe) throw new ArchiveError('ar.tooLarge');
    const seconds = Math.max(0, Math.floor(mtime.getTime() / 1000));
    const timeExtra = new Uint8Array(9);
    const tv = new DataView(timeExtra.buffer);
    tv.setUint16(0, 0x5455, true); tv.setUint16(2, 5, true); tv.setUint8(4, 1); tv.setUint32(5, seconds, true);
    const extra = localExtra && localExtra.length ? concat([timeExtra, stripTimeExtra(localExtra)]) : timeExtra;

    const header = new Uint8Array(30);
    const h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, flags, true); h.setUint16(8, method, true);
    h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true); h.setUint32(18, csize, true); h.setUint32(22, size, true);
    h.setUint16(26, name.length, true); h.setUint16(28, extra.length, true);
    const localOffset = offset;
    push(header); push(name); push(extra); push(data);
    if (flags & 0x8) {
      const descriptor = new Uint8Array(16);
      const d = new DataView(descriptor.buffer);
      d.setUint32(0, 0x08074b50, true); d.setUint32(4, crc, true); d.setUint32(8, csize, true); d.setUint32(12, size, true);
      push(descriptor);
    }

    const mode = (entry.link ? 0o120000 : entry.dir ? 0o040000 : 0o100000) | (entry.mode || (entry.dir ? 0o755 : 0o644));
    const cd = new Uint8Array(46);
    const c = new DataView(cd.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 0x031e, true); c.setUint16(6, 20, true); c.setUint16(8, flags, true); c.setUint16(10, method, true);
    c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true); c.setUint32(20, csize, true); c.setUint32(24, size, true);
    c.setUint16(28, name.length, true); c.setUint16(30, extra.length, true);
    c.setUint32(38, ((mode << 16) | (entry.dir ? 0x10 : 0)) >>> 0, true); c.setUint32(42, localOffset, true);
    central.push(cd, name, extra);
  }
  const cdStart = offset;
  for (const chunk of central) push(chunk);
  if (entries.length > 0xfffe) throw new ArchiveError('ar.tooLarge');
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true);
  e.setUint32(12, offset - cdStart, true); e.setUint32(16, cdStart, true);
  push(end);
  return concat(chunks);
}

function stripTimeExtra(extra) {
  const view = new DataView(extra.buffer, extra.byteOffset, extra.byteLength);
  const keep = [];
  for (let e = 0; e + 4 <= extra.length;) {
    const len = view.getUint16(e + 2, true);
    if (view.getUint16(e, true) !== 0x5455) keep.push(extra.subarray(e, e + 4 + len));
    e += 4 + len;
  }
  return concat(keep);
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// ---- TAR ------------------------------------------------------------------------------------------

function cString(bytes) { const end = bytes.indexOf(0); return new TextDecoder().decode(end < 0 ? bytes : bytes.subarray(0, end)); }

function octal(bytes) {
  if (bytes[0] & 0x80) { // base-256 (GNU) for large values
    let v = bytes[0] & 0x7f;
    for (let i = 1; i < bytes.length; i++) v = v * 256 + bytes[i];
    return v;
  }
  const s = latin1.decode(bytes).replace(/\0.*$/, '').trim();
  return s ? parseInt(s, 8) : 0;
}

function parsePax(data) {
  const out = {};
  const text = new TextDecoder().decode(data);
  let i = 0;
  while (i < text.length) {
    const space = text.indexOf(' ', i);
    if (space < 0) break;
    const len = parseInt(text.slice(i, space), 10);
    if (!len) break;
    // the length counts bytes, not characters
    const recordBytes = new TextEncoder().encode(text.slice(i)).subarray(0, len);
    const record = new TextDecoder().decode(recordBytes);
    const eq = record.indexOf('=');
    if (eq > 0) out[record.slice(record.indexOf(' ') + 1, eq)] = record.slice(eq + 1).replace(/\n$/, '');
    i += record.length;
  }
  return out;
}

function readTar(bytes) {
  const entries = [];
  let p = 0;
  let longName = null, longLink = null, pax = {};
  while (p + 512 <= bytes.length) {
    const header = bytes.subarray(p, p + 512);
    if (header.every((b) => b === 0)) break;
    const size = octal(header.subarray(124, 136));
    const type = String.fromCharCode(header[156] || 48);
    const dataStart = p + 512;
    const data = bytes.subarray(dataStart, dataStart + size);
    p = dataStart + Math.ceil(size / 512) * 512;
    if (type === 'L') { longName = cString(data); continue; }
    if (type === 'K') { longLink = cString(data); continue; }
    if (type === 'x') { pax = parsePax(data); continue; }
    if (type === 'g') continue;
    const magic = latin1.decode(header.subarray(257, 262));
    let name = cString(header.subarray(0, 100));
    const prefix = magic === 'ustar' ? cString(header.subarray(345, 500)) : '';
    if (prefix) name = `${prefix}/${name}`;
    if (longName) name = longName;
    if (pax.path) name = pax.path;
    const link = pax.linkpath || longLink || cString(header.subarray(157, 257));
    const mtime = new Date((pax.mtime ? parseFloat(pax.mtime) : octal(header.subarray(136, 148))) * 1000);
    const mode = octal(header.subarray(100, 108)) & 0o7777;
    longName = longLink = null;
    pax = {};
    const path = cleanPath(name);
    if (!path) continue;
    const dir = type === '5' || name.endsWith('/');
    if (type === '2' || type === '1') {
      const target = new TextEncoder().encode(link);
      entries.push({ path, dir: false, size: target.length, csize: 0, mtime, mode: mode || 0o777, link: true, hardLink: type === '1', load: () => target, linkTarget: () => link });
    } else if (dir || type === '0' || type === '7' || type === '\0') {
      entries.push({ path, dir, size: dir ? 0 : size, csize: dir ? 0 : size, mtime, mode: mode || (dir ? 0o755 : 0o644), load: () => data });
    } // device files, FIFOs etc. are skipped
  }
  return entries;
}

function writeOctal(header, offset, length, value) {
  const s = value.toString(8).padStart(length - 1, '0');
  for (let i = 0; i < length - 1; i++) header[offset + i] = s.charCodeAt(i);
  header[offset + length - 1] = 0;
}

function tarHeader({ name, size, mtime, mode, type, link = '' }) {
  const enc = new TextEncoder();
  const header = new Uint8Array(512);
  let nameBytes = enc.encode(name);
  const blocks = [];
  const linkBytes = enc.encode(link);
  if (nameBytes.length > 100 || linkBytes.length > 100 || /[^\x20-\x7e]/.test(name + link)) {
    // pax extended header for long or non-ASCII names
    const records = [];
    const add = (key, value) => {
      const body = ` ${key}=${value}\n`;
      let len = enc.encode(body).length;
      len += String(len + String(len).length).length;
      records.push(`${len}${body}`);
    };
    if (nameBytes.length > 100 || /[^\x20-\x7e]/.test(name)) add('path', name);
    if (linkBytes.length > 100 || /[^\x20-\x7e]/.test(link)) add('linkpath', link);
    const paxData = enc.encode(records.join(''));
    blocks.push(tarHeader({ name: 'PaxHeader', size: paxData.length, mtime, mode: 0o644, type: 'x' }), pad512(paxData));
    nameBytes = enc.encode(name.replace(/[^\x20-\x7e]/g, '_')).subarray(0, 100);
  }
  header.set(nameBytes.subarray(0, 100), 0);
  writeOctal(header, 100, 8, mode);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, Math.max(0, Math.floor(mtime.getTime() / 1000)));
  header[156] = type.charCodeAt(0);
  header.set(enc.encode(link.replace(/[^\x20-\x7e]/g, '_')).subarray(0, 100), 157);
  header.set(enc.encode('ustar\x0000'), 257);
  for (let i = 148; i < 156; i++) header[i] = 32;
  const sum = header.reduce((a, b) => a + b, 0);
  writeOctal(header, 148, 7, sum);
  header[155] = 32;
  return blocks.length ? concat([...blocks, header]) : header;
}

function pad512(data) {
  const rest = data.length % 512;
  return rest ? concat([data, new Uint8Array(512 - rest)]) : data;
}

function writeTar(entries) {
  const parts = [];
  for (const entry of entries) {
    const mtime = entry.mtime || new Date();
    if (entry.dir) {
      parts.push(tarHeader({ name: `${entry.path}/`, size: 0, mtime, mode: entry.mode || 0o755, type: '5' }));
    } else if (entry.link) {
      parts.push(tarHeader({ name: entry.path, size: 0, mtime, mode: entry.mode || 0o777, type: entry.hardLink ? '1' : '2', link: entry.linkTarget() }));
    } else {
      const data = entry.load();
      parts.push(tarHeader({ name: entry.path, size: data.length, mtime, mode: entry.mode || 0o644, type: '0' }), pad512(data));
    }
  }
  parts.push(new Uint8Array(1024));
  return concat(parts);
}

// ---- GZ -------------------------------------------------------------------------------------------

function gunzip(bytes) {
  let fileName = null;
  const flags = bytes[3];
  if (flags & 8) {
    let p = 10;
    if (flags & 4) p += 2 + (bytes[10] | (bytes[11] << 8));
    const end = bytes.indexOf(0, p);
    if (end > p) fileName = latin1.decode(bytes.subarray(p, end));
  }
  try { return { data: gunzipSync(bytes), fileName }; } catch (e) { throw new ArchiveError('ar.corrupt'); }
}

// ---- writing --------------------------------------------------------------------------------------

/** Serialise entries (files and directories, paths without trailing slash) in the given format. */
export function write(entries, format, { level = 6, name = 'file', encryption = null } = {}) {
  if (format === 'zip') return writeZip(entries, { level, encryption });
  if (format === 'tar') return writeTar(entries);
  if (format === 'tgz') return gzipSync(writeTar(entries), { level: Math.max(1, level) });
  if (format === 'gz') {
    const files = entries.filter((e) => !e.dir);
    if (files.length !== 1) throw new ArchiveError('ar.gzSingle');
    return gzipSync(files[0].load(), { level: Math.max(1, level), filename: files[0].path.split('/').pop(), mtime: files[0].mtime || new Date() });
  }
  throw new ArchiveError('ar.unknownFormat');
}

export { strToU8 };
