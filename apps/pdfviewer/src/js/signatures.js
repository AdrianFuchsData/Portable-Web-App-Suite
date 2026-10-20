/*
 * Digital signatures of PDF files: every signature dictionary (/ByteRange + /Contents) is found in the raw bytes, its CMS
 * SignedData (PKCS #7, DER) is parsed and checked with WebCrypto:
 *   - integrity: the digest of the signed byte ranges equals the signed messageDigest attribute,
 *   - signature: the signer's certificate key verifies the signature over the signed attributes (RSA PKCS #1 v1.5, RSA-PSS, ECDSA),
 *   - coverage: whether the signed ranges reach the end of the file (later bytes are changes after signing),
 *   - certificate: subject, issuer, validity, self-signed; the chain inside the signature is checked link by link, but there is no
 *     store of trusted root certificates offline, so trust is not decided.
 *
 *   await verifySignatures(bytes) -> [{ name, reason, location, date, subFilter, integrity, signature, coversAll, appended,
 *                                       certificate: { subject, issuer, notBefore, notAfter, selfSigned, expired, serial }, chain, error }]
 */

// ---- DER --------------------------------------------------------------------------------------------------

/** One DER element at offset: { tag, cls, constructed, start (of the header), offset (of the content), length, end }. */
function element(bytes, offset) {
  const start = offset;
  const tag = bytes[offset++];
  let length = bytes[offset++];
  if (length & 0x80) {
    const n = length & 0x7f;
    if (n === 0 || n > 4) throw new Error('unsupported DER length');
    length = 0;
    for (let i = 0; i < n; i++) length = length * 256 + bytes[offset++];
  }
  if (offset + length > bytes.length) throw new Error('truncated DER');
  return { tag, cls: tag >> 6, constructed: !!(tag & 0x20), number: tag & 0x1f, start, offset, length, end: offset + length, bytes };
}

const children = (el) => { const out = []; for (let o = el.offset; o < el.end;) { const c = element(el.bytes, o); out.push(c); o = c.end; } return out; };
const raw = (el) => el.bytes.subarray(el.start, el.end);
const content = (el) => el.bytes.subarray(el.offset, el.end);

function oid(el) {
  const b = content(el);
  const parts = [Math.floor(b[0] / 40), b[0] % 40];
  let v = 0;
  for (let i = 1; i < b.length; i++) { v = v * 128 + (b[i] & 0x7f); if (!(b[i] & 0x80)) { parts.push(v); v = 0; } }
  return parts.join('.');
}

function time(el) {
  const s = new TextDecoder().decode(content(el));
  const m = (el.tag === 0x17 ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?/ : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?/).exec(s);
  if (!m) return null;
  let y = Number(m[1]);
  if (el.tag === 0x17) y += y < 50 ? 2000 : 1900; // UTCTime has two-digit years
  return new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0)));
}

const NAMES = { '2.5.4.3': 'CN', '2.5.4.10': 'O', '2.5.4.11': 'OU', '2.5.4.6': 'C', '2.5.4.7': 'L', '2.5.4.8': 'ST', '1.2.840.113549.1.9.1': 'E' };
/** A Name (sequence of RDN sets) as "CN=…, O=…" and its parts. */
function name(el) {
  const parts = [];
  for (const rdn of children(el)) for (const atv of children(rdn)) {
    const [type, value] = children(atv);
    const key = NAMES[oid(type)] || oid(type);
    const v = value.tag === 0x1e ? String.fromCharCode(...Array.from({ length: value.length / 2 }, (_, i) => (content(value)[i * 2] << 8) | content(value)[i * 2 + 1])) : new TextDecoder().decode(content(value));
    parts.push([key, v]);
  }
  return { text: parts.map(([k, v]) => `${k}=${v}`).join(', '), cn: (parts.find(([k]) => k === 'CN') || [])[1] || '', parts };
}

const equal = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

// ---- certificates ------------------------------------------------------------------------------------------

function certificate(el) {
  const [tbs, sigAlg, sigValue] = children(el);
  const f = children(tbs);
  let i = 0;
  if (f[0].tag === 0xa0) i++; // version
  const serial = f[i++], tbsSigAlg = f[i++], issuer = f[i++], validity = f[i++], subject = f[i++], spki = f[i++];
  const [nb, na] = children(validity);
  return {
    el, tbs, sigAlg, sigBits: content(sigValue).subarray(1), serial: content(serial), issuerRaw: raw(issuer), subjectRaw: raw(subject),
    issuer: name(issuer), subject: name(subject), notBefore: time(nb), notAfter: time(na), spki: raw(spki), spkiEl: spki, tbsSigAlg,
  };
}

const HASHES = { '1.3.14.3.2.26': 'SHA-1', '2.16.840.1.101.3.4.2.1': 'SHA-256', '2.16.840.1.101.3.4.2.2': 'SHA-384', '2.16.840.1.101.3.4.2.3': 'SHA-512' };
const RSA_WITH = { '1.2.840.113549.1.1.5': 'SHA-1', '1.2.840.113549.1.1.11': 'SHA-256', '1.2.840.113549.1.1.12': 'SHA-384', '1.2.840.113549.1.1.13': 'SHA-512' };
const ECDSA_WITH = { '1.2.840.10045.4.1': 'SHA-1', '1.2.840.10045.4.3.2': 'SHA-256', '1.2.840.10045.4.3.3': 'SHA-384', '1.2.840.10045.4.3.4': 'SHA-512' };
const CURVES = { '1.2.840.10045.3.1.7': ['P-256', 32], '1.3.132.0.34': ['P-384', 48], '1.3.132.0.35': ['P-521', 66] };

/** ECDSA signature DER (SEQUENCE { r, s }) to the fixed-length form WebCrypto expects. */
function ecdsaRaw(sig, size) {
  const [r, s] = children(element(sig, 0));
  const fix = (v) => { let b = content(v); while (b.length > size && b[0] === 0) b = b.subarray(1); const out = new Uint8Array(size); out.set(b, size - b.length); return out; };
  const out = new Uint8Array(size * 2);
  out.set(fix(r), 0);
  out.set(fix(s), size);
  return out;
}

/** Verify `signature` over `data` with a certificate's key; `algEl` is the AlgorithmIdentifier, `hash` the digest algorithm. */
async function verifyWith(cert, algEl, hash, signature, data) {
  const [algOid, params] = children(algEl);
  const alg = oid(algOid);
  const keyAlg = oid(children(children(cert.spkiEl)[0])[0]);
  if (keyAlg === '1.2.840.10045.2.1') { // EC key
    const curve = CURVES[oid(children(children(cert.spkiEl)[0])[1])];
    if (!curve) throw new Error('unsupported curve');
    const key = await crypto.subtle.importKey('spki', cert.spki, { name: 'ECDSA', namedCurve: curve[0] }, false, ['verify']);
    return crypto.subtle.verify({ name: 'ECDSA', hash: ECDSA_WITH[alg] || hash }, key, ecdsaRaw(signature, curve[1]), data);
  }
  if (alg === '1.2.840.113549.1.1.10') { // RSA-PSS: hash and salt length from the parameters (defaults: SHA-1, 20)
    let pssHash = 'SHA-1', salt = 20;
    for (const p of params ? children(params) : []) {
      if (p.tag === 0xa0) pssHash = HASHES[oid(children(children(p)[0])[0])] || pssHash;
      if (p.tag === 0xa2) salt = content(children(p)[0]).reduce((v, b) => v * 256 + b, 0);
    }
    // WebCrypto does not import keys whose SPKI says RSA-PSS: rebuild the SPKI as rsaEncryption
    const key = await crypto.subtle.importKey('spki', rsaSpki(cert), { name: 'RSA-PSS', hash: pssHash }, false, ['verify']);
    return crypto.subtle.verify({ name: 'RSA-PSS', saltLength: salt }, key, signature, data);
  }
  const key = await crypto.subtle.importKey('spki', rsaSpki(cert), { name: 'RSASSA-PKCS1-v1_5', hash: RSA_WITH[alg] || hash }, false, ['verify']);
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data);
}

/** The certificate's RSA key as SPKI with the rsaEncryption algorithm identifier. */
function rsaSpki(cert) {
  const keyBits = raw(children(cert.spkiEl)[1]);
  const algId = Uint8Array.from([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
  return der(0x30, concat([algId, keyBits]));
}

function der(tag, body) {
  const n = body.length;
  const len = n < 128 ? [n] : n < 256 ? [0x81, n] : n < 65536 ? [0x82, n >> 8, n & 255] : [0x83, n >> 16, (n >> 8) & 255, n & 255];
  return concat([Uint8Array.from([tag, ...len]), body]);
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Does `issuer` sign `cert`? */
async function signedBy(cert, issuer) {
  if (!equal(cert.issuerRaw, issuer.subjectRaw)) return false;
  try { return await verifyWith(issuer, cert.sigAlg, 'SHA-256', cert.sigBits, raw(cert.tbs)); } catch (e) { return false; }
}

// ---- PDF -------------------------------------------------------------------------------------------------------

const latin1 = new TextDecoder('latin1');

/** A PDF literal string at the start of s (escapes, octal codes, UTF-16BE with BOM). */
function pdfString(s) {
  if (s[0] === '<') { // hex string
    const h = s.slice(1, s.indexOf('>')).replace(/\s/g, '');
    return decodeText(Array.from({ length: Math.ceil(h.length / 2) }, (_, i) => parseInt(h.substr(i * 2, 2).padEnd(2, '0'), 16)));
  }
  const out = [];
  let depth = 0;
  for (let i = 1; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      const n = s[++i];
      const map = { n: 10, r: 13, t: 9, b: 8, f: 12 };
      if (n in map) out.push(map[n]);
      else if (/[0-7]/.test(n)) { let o = n; while (o.length < 3 && /[0-7]/.test(s[i + 1])) o += s[++i]; out.push(parseInt(o, 8)); } else if (n !== '\n' && n !== '\r') out.push(n.charCodeAt(0));
      continue;
    }
    if (c === '(') depth++;
    if (c === ')') { if (!depth) break; depth--; }
    out.push(c.charCodeAt(0));
  }
  return decodeText(out);
}

function decodeText(codes) {
  if (codes[0] === 0xfe && codes[1] === 0xff) return String.fromCharCode(...Array.from({ length: (codes.length - 2) >> 1 }, (_, i) => (codes[2 + i * 2] << 8) | codes[3 + i * 2]));
  return String.fromCharCode(...codes);
}

/** "D:20261019103000+02'00'" -> Date. */
function pdfDate(s) {
  const m = /D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Zz+-])?(\d{2})?'?(\d{2})?/.exec(s || '');
  if (!m) return null;
  const utc = Date.UTC(+m[1], (+m[2] || 1) - 1, +m[3] || 1, +m[4] || 0, +m[5] || 0, +m[6] || 0);
  const off = m[7] === '+' || m[7] === '-' ? (m[7] === '+' ? 1 : -1) * ((+m[8] || 0) * 60 + (+m[9] || 0)) : 0;
  return new Date(utc - off * 60000);
}

/** The value of a key in a dictionary text (strings, names). */
function dictValue(dict, key) {
  const i = dict.search(new RegExp(`/${key}(?=[\\s(<\\/])`));
  if (i < 0) return null;
  const rest = dict.slice(i + key.length + 1).replace(/^\s+/, '');
  if (rest[0] === '(' || (rest[0] === '<' && rest[1] !== '<')) return pdfString(rest);
  if (rest[0] === '/') return rest.slice(1).split(/[\s/<>[\]()]/)[0];
  return null;
}

/** Signature dictionaries in the file: { byteRange, contents (DER), dict (text around it) }. */
export function findSignatures(bytes) {
  const text = latin1.decode(bytes);
  const out = [];
  const re = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
  for (let m; (m = re.exec(text));) {
    const range = m.slice(1, 5).map(Number);
    if (range[0] !== 0 || range[2] + range[3] > bytes.length || range[1] >= range[2]) continue;
    // /Contents is the hex string in the gap between the two ranges
    const gap = text.slice(range[1], range[2]).trim();
    if (!gap.startsWith('<')) continue;
    const h = gap.slice(1, gap.lastIndexOf('>')).replace(/\s/g, '');
    let der = Uint8Array.from({ length: h.length >> 1 }, (_, i) => parseInt(h.substr(i * 2, 2), 16));
    try { der = der.subarray(0, element(der, 0).end); } catch (e) { /* reported when parsing */ }
    // the dictionary: from the last "<<" before the gap to the next ">>" after ByteRange (good enough for the plain keys)
    const from = Math.max(text.lastIndexOf('<<', Math.min(range[1], m.index)), 0);
    const dict = text.slice(from, range[1]) + text.slice(range[2], Math.max(range[2], m.index) + 400);
    out.push({ byteRange: range, contents: der, dict });
  }
  return out;
}

async function verifyOne(bytes, sig) {
  const r = sig.byteRange;
  const end = r[2] + r[3];
  const result = {
    name: dictValue(sig.dict, 'Name') || '', reason: dictValue(sig.dict, 'Reason') || '', location: dictValue(sig.dict, 'Location') || '',
    date: pdfDate(dictValue(sig.dict, 'M')), subFilter: dictValue(sig.dict, 'SubFilter') || '',
    coversAll: end === bytes.length || /^[\s\0]*$/.test(latin1.decode(bytes.subarray(end))), appended: bytes.length - end,
    integrity: null, signature: null, certificate: null, chain: [], error: null,
  };
  try {
    const signed = concat([bytes.subarray(r[0], r[0] + r[1]), bytes.subarray(r[2], r[2] + r[3])]);
    const contentInfo = element(sig.contents, 0);
    const [type, wrapped] = children(contentInfo);
    if (oid(type) !== '1.2.840.113549.1.7.2') throw new Error('not CMS SignedData');
    const sd = children(children(wrapped)[0]);
    const certs = sd.filter((x) => x.tag === 0xa0).flatMap((x) => children(x)).filter((x) => x.tag === 0x30).map(certificate);
    const signerInfos = children(sd[sd.length - 1]);
    const si = children(signerInfos[0]);
    let i = 1;
    const sid = si[i++];
    const digestAlg = HASHES[oid(children(si[i++])[0])];
    const attrs = si[i].tag === 0xa0 ? si[i++] : null;
    const sigAlg = si[i++];
    const signature = content(si[i++]);
    if (!digestAlg) throw new Error('unsupported digest algorithm');
    // the signer's certificate: issuer and serial number, or the subject key identifier
    let signer = null;
    if (sid.tag === 0x30) {
      const [iss, ser] = children(sid);
      signer = certs.find((c) => equal(c.issuerRaw, raw(iss)) && equal(c.serial, content(ser)));
    } else signer = certs[0];
    if (!signer) throw new Error('signer certificate missing');
    let digestOk;
    let data;
    if (attrs) {
      const attrList = children(attrs).map((a) => { const [t, v] = children(a); return [oid(t), children(v)[0]]; });
      const md = attrList.find(([t]) => t === '1.2.840.113549.1.9.4');
      const st = attrList.find(([t]) => t === '1.2.840.113549.1.9.5');
      if (st) result.date = time(st[1]) || result.date;
      const digest = new Uint8Array(await crypto.subtle.digest(digestAlg, signed));
      digestOk = !!md && equal(digest, content(md[1]));
      data = raw(attrs).slice();
      data[0] = 0x31; // the signature covers the attributes as a SET
    } else { // no signed attributes: the signature covers the document directly
      data = signed;
      digestOk = null;
    }
    const sigOk = await verifyWith(signer, sigAlg, digestAlg, signature, data);
    result.integrity = digestOk == null ? sigOk : digestOk;
    result.signature = sigOk;
    const now = new Date();
    result.certificate = {
      subject: signer.subject.text, cn: signer.subject.cn, issuer: signer.issuer.text, notBefore: signer.notBefore, notAfter: signer.notAfter,
      selfSigned: equal(signer.subjectRaw, signer.issuerRaw), expired: !!signer.notAfter && signer.notAfter < now, serial: hex(signer.serial),
    };
    if (!result.name) result.name = signer.subject.cn || signer.subject.text;
    // the chain inside the signature, link by link
    let cur = signer;
    for (let n = 0; n < 8; n++) {
      const issuer = certs.find((c) => c !== cur && equal(c.subjectRaw, cur.issuerRaw));
      const self = equal(cur.subjectRaw, cur.issuerRaw);
      result.chain.push({ subject: cur.subject.text, verified: self ? await signedBy(cur, cur) : issuer ? await signedBy(cur, issuer) : null, root: self });
      if (self || !issuer) break;
      cur = issuer;
    }
  } catch (e) { result.error = e.message || String(e); }
  return result;
}

export async function verifySignatures(bytes) {
  const found = findSignatures(bytes);
  const out = [];
  for (const sig of found) out.push(await verifyOne(bytes, sig));
  return out;
}
