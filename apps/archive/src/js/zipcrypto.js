/*
 * Encryption of ZIP entries, synchronous so that entries keep their simple load() interface:
 *  - WinZip AES (AE-1/AE-2, 128/192/256 bit): PBKDF2-HMAC-SHA1 (1000 iterations) derives the AES key, the HMAC key and
 *    a 2-byte password verifier from the password and a salt; the data is encrypted with AES in counter mode with a
 *    little-endian counter starting at 1 (Gladman), and authenticated with the first 10 bytes of HMAC-SHA1 over the
 *    encrypted data.
 *  - Traditional PKWARE encryption ("ZipCrypto"): three CRC-based keys, a 12-byte header whose last byte checks the
 *    password. Weak, but understood by every ZIP tool including the Windows Explorer.
 * SHA-1, HMAC, PBKDF2 and the AES block cipher are implemented here (WebCrypto is asynchronous and its AES-CTR counts
 * big-endian).
 */

// ---- SHA-1, HMAC-SHA1, PBKDF2 ----------------------------------------------------------------------

function sha1(data) {
  const ml = data.length;
  const withPad = ((ml + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(withPad);
  m.set(data);
  m[ml] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(withPad - 4, (ml * 8) >>> 0);
  dv.setUint32(withPad - 8, Math.floor(ml / 0x20000000));
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let o = 0; o < withPad; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 80; i++) { const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]; w[i] = (x << 1) | (x >>> 31); }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f, k;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; } else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; } else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; } else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = temp;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const ov = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => ov.setUint32(i * 4, h));
  return out;
}

const concat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

/** HMAC-SHA1 with a prepared key: returns fn(message) -> 20 bytes. */
function hmacSha1(key) {
  let k = key.length > 64 ? sha1(key) : key;
  const kp = new Uint8Array(64); kp.set(k);
  const ipad = kp.map((b) => b ^ 0x36), opad = kp.map((b) => b ^ 0x5c);
  return (msg) => sha1(concat(opad, sha1(concat(ipad, msg))));
}

export function pbkdf2Sha1(password, salt, iterations, length) {
  const mac = hmacSha1(password);
  const out = new Uint8Array(length);
  for (let block = 1, pos = 0; pos < length; block++) {
    let u = mac(concat(salt, new Uint8Array([block >>> 24, (block >>> 16) & 255, (block >>> 8) & 255, block & 255])));
    const t = u.slice();
    for (let i = 1; i < iterations; i++) { u = mac(u); for (let j = 0; j < 20; j++) t[j] ^= u[j]; }
    out.set(t.subarray(0, Math.min(20, length - pos)), pos);
    pos += 20;
  }
  return out;
}

// ---- AES (encryption of single blocks, for counter mode) ------------------------------------------

const SBOX = new Uint8Array(256);
const T0 = new Uint32Array(256), T1 = new Uint32Array(256), T2 = new Uint32Array(256), T3 = new Uint32Array(256);
(() => {
  // S-box from the multiplicative inverse in GF(2^8) and the affine transformation
  let p = 1, q = 1;
  do {
    p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0);
    q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xff; if (q & 0x80) q ^= 0x09;
    const x = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4));
    SBOX[p] = (x ^ 0x63) & 0xff;
  } while (p !== 1);
  SBOX[0] = 0x63;
  const xt = (a) => ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff;
  for (let i = 0; i < 256; i++) {
    const s = SBOX[i], s2 = xt(s), s3 = s2 ^ s;
    T0[i] = ((s2 << 24) | (s << 16) | (s << 8) | s3) >>> 0;
    T1[i] = ((s3 << 24) | (s2 << 16) | (s << 8) | s) >>> 0;
    T2[i] = ((s << 24) | (s3 << 16) | (s2 << 8) | s) >>> 0;
    T3[i] = ((s << 24) | (s << 16) | (s3 << 8) | s2) >>> 0;
  }
})();

export function aesKey(key) {
  const nk = key.length / 4, rounds = nk + 6;
  const w = new Uint32Array(4 * (rounds + 1));
  for (let i = 0; i < nk; i++) w[i] = ((key[4 * i] << 24) | (key[4 * i + 1] << 16) | (key[4 * i + 2] << 8) | key[4 * i + 3]) >>> 0;
  let rcon = 1;
  for (let i = nk; i < w.length; i++) {
    let t = w[i - 1];
    if (i % nk === 0) {
      t = ((SBOX[(t >>> 16) & 255] << 24) | (SBOX[(t >>> 8) & 255] << 16) | (SBOX[t & 255] << 8) | SBOX[t >>> 24]) ^ (rcon << 24);
      rcon = ((rcon << 1) ^ (rcon & 0x80 ? 0x1b : 0)) & 0xff;
    } else if (nk > 6 && i % nk === 4) {
      t = (SBOX[t >>> 24] << 24) | (SBOX[(t >>> 16) & 255] << 16) | (SBOX[(t >>> 8) & 255] << 8) | SBOX[t & 255];
    }
    w[i] = (w[i - nk] ^ t) >>> 0;
  }
  return { w, rounds };
}

/** Encrypt one 16-byte block (in -> out). */
export function aesEncryptBlock({ w, rounds }, input, out) {
  let s0 = (((input[0] << 24) | (input[1] << 16) | (input[2] << 8) | input[3]) ^ w[0]) >>> 0;
  let s1 = (((input[4] << 24) | (input[5] << 16) | (input[6] << 8) | input[7]) ^ w[1]) >>> 0;
  let s2 = (((input[8] << 24) | (input[9] << 16) | (input[10] << 8) | input[11]) ^ w[2]) >>> 0;
  let s3 = (((input[12] << 24) | (input[13] << 16) | (input[14] << 8) | input[15]) ^ w[3]) >>> 0;
  let k = 4;
  for (let r = 1; r < rounds; r++) {
    const t0 = T0[s0 >>> 24] ^ T1[(s1 >>> 16) & 255] ^ T2[(s2 >>> 8) & 255] ^ T3[s3 & 255] ^ w[k];
    const t1 = T0[s1 >>> 24] ^ T1[(s2 >>> 16) & 255] ^ T2[(s3 >>> 8) & 255] ^ T3[s0 & 255] ^ w[k + 1];
    const t2 = T0[s2 >>> 24] ^ T1[(s3 >>> 16) & 255] ^ T2[(s0 >>> 8) & 255] ^ T3[s1 & 255] ^ w[k + 2];
    const t3 = T0[s3 >>> 24] ^ T1[(s0 >>> 16) & 255] ^ T2[(s1 >>> 8) & 255] ^ T3[s2 & 255] ^ w[k + 3];
    s0 = t0 >>> 0; s1 = t1 >>> 0; s2 = t2 >>> 0; s3 = t3 >>> 0; k += 4;
  }
  const last = (a, b, c, d, kw, o) => {
    const v = ((SBOX[a >>> 24] << 24) | (SBOX[(b >>> 16) & 255] << 16) | (SBOX[(c >>> 8) & 255] << 8) | SBOX[d & 255]) ^ kw;
    out[o] = v >>> 24; out[o + 1] = (v >>> 16) & 255; out[o + 2] = (v >>> 8) & 255; out[o + 3] = v & 255;
  };
  last(s0, s1, s2, s3, w[k], 0); last(s1, s2, s3, s0, w[k + 1], 4); last(s2, s3, s0, s1, w[k + 2], 8); last(s3, s0, s1, s2, w[k + 3], 12);
  return out;
}

/** AES-CTR with a little-endian counter in the first 8 bytes, starting at 1 (encryption = decryption). */
function ctrGladman(key, data) {
  const ks = aesKey(key);
  const out = new Uint8Array(data.length);
  const nonce = new Uint8Array(16), stream = new Uint8Array(16);
  for (let pos = 0; pos < data.length; pos += 16) {
    for (let j = 0; j < 8 && !++nonce[j]; j++);
    aesEncryptBlock(ks, nonce, stream);
    const n = Math.min(16, data.length - pos);
    for (let i = 0; i < n; i++) out[pos + i] = data[pos + i] ^ stream[i];
  }
  return out;
}

// ---- WinZip AES ------------------------------------------------------------------------------------

const enc = new TextEncoder();
export const AES_SALT = { 1: 8, 2: 12, 3: 16 };
const AES_KEY = { 1: 16, 2: 24, 3: 32 };

function aesKeys(password, salt, strength) {
  const n = AES_KEY[strength];
  const derived = pbkdf2Sha1(enc.encode(password), salt, 1000, 2 * n + 2);
  return { key: derived.subarray(0, n), macKey: derived.subarray(n, 2 * n), verifier: derived.subarray(2 * n) };
}

export class PasswordError extends Error {}

/** Check a password against the stored verifier of an AES entry (data = salt + verifier + ...). */
export function aesCheck(data, strength, password) {
  const sl = AES_SALT[strength];
  const { verifier } = aesKeys(password, data.subarray(0, sl), strength);
  return verifier[0] === data[sl] && verifier[1] === data[sl + 1];
}

/** Decrypt the data of an AES entry; throws PasswordError for a wrong password, Error on an authentication failure. */
export function aesDecrypt(data, strength, password) {
  const sl = AES_SALT[strength];
  const { key, macKey, verifier } = aesKeys(password, data.subarray(0, sl), strength);
  if (verifier[0] !== data[sl] || verifier[1] !== data[sl + 1]) throw new PasswordError('wrong password');
  const cipher = data.subarray(sl + 2, data.length - 10);
  const mac = hmacSha1(macKey)(cipher);
  const stored = data.subarray(data.length - 10);
  for (let i = 0; i < 10; i++) if (mac[i] !== stored[i]) throw new Error('authentication failed (damaged data)');
  return ctrGladman(key, cipher);
}

export function aesEncrypt(plain, password, strength = 3) {
  const salt = crypto.getRandomValues(new Uint8Array(AES_SALT[strength]));
  const { key, macKey, verifier } = aesKeys(password, salt, strength);
  const cipher = ctrGladman(key, plain);
  return concat(salt, verifier, cipher, hmacSha1(macKey)(cipher).subarray(0, 10));
}

/** Extra field 0x9901 of an AES entry (AE-2, the given strength and actual compression method). */
export function aesExtra(method, strength = 3) {
  const x = new Uint8Array(11);
  const v = new DataView(x.buffer);
  v.setUint16(0, 0x9901, true); v.setUint16(2, 7, true); v.setUint16(4, 2, true); x[6] = 0x41; x[7] = 0x45; x[8] = strength; v.setUint16(9, method, true);
  return x;
}

// ---- ZipCrypto -------------------------------------------------------------------------------------

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

function zipKeys(password) {
  const k = new Uint32Array([0x12345678, 0x23456789, 0x34567890]);
  const update = (b) => {
    k[0] = CRC[(k[0] ^ b) & 0xff] ^ (k[0] >>> 8);
    k[1] = (Math.imul((k[1] + (k[0] & 0xff)) >>> 0, 134775813) + 1) >>> 0;
    k[2] = CRC[(k[2] ^ (k[1] >>> 24)) & 0xff] ^ (k[2] >>> 8);
  };
  for (const b of enc.encode(password)) update(b);
  const stream = () => { const t = (k[2] | 2) & 0xffff; return (Math.imul(t, t ^ 1) >>> 8) & 0xff; };
  return { update, stream };
}

/** Decrypt ZipCrypto data (12-byte header + data); check is the expected last header byte (CRC or time high byte). */
export function zipCryptoDecrypt(data, password, check) {
  const { update, stream } = zipKeys(password);
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) { const c = data[i] ^ stream(); update(c); out[i] = c; }
  if (out[11] !== check) throw new PasswordError('wrong password');
  return out.subarray(12);
}

export function zipCryptoCheck(data, password, check) {
  const { update, stream } = zipKeys(password);
  let c = 0;
  for (let i = 0; i < 12; i++) { c = data[i] ^ stream(); update(c); }
  return c === check;
}

export function zipCryptoEncrypt(plain, password, check) {
  const { update, stream } = zipKeys(password);
  const header = crypto.getRandomValues(new Uint8Array(12));
  header[11] = check;
  const input = concat(header, plain);
  const out = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i++) { const p = input[i]; out[i] = p ^ stream(); update(p); }
  return out;
}
