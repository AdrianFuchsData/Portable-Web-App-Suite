/*
 * Checksums and byte comparison for the hex editor.
 *
 *   await HE.checksums(bytes) -> { 'CRC-32': '…', 'Adler-32': '…', MD5: '…', 'SHA-1': '…', 'SHA-256': '…', 'SHA-512': '…' }  (lower-case hex)
 *   HE.differences(a, b, limit) -> { offsets: [...], count, truncated }   (byte by byte at the same offsets; a length
 *                                    difference counts every byte past the shorter end)
 */
(function (HE) {
  'use strict';

  const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const hex32 = (v) => (v >>> 0).toString(16).padStart(8, '0');

  let crcTable = null;
  function crc32(data) {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        crcTable[n] = c >>> 0;
      }
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function adler32(data) {
    let a = 1, b = 0;
    for (let i = 0; i < data.length;) {
      const end = Math.min(data.length, i + 3800); // keep the sums below 2^32 before the modulo
      for (; i < end; i++) { a += data[i]; b += a; }
      a %= 65521; b %= 65521;
    }
    return ((b << 16) | a) >>> 0;
  }

  // MD5 (RFC 1321); WebCrypto has no MD5
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const K = new Uint32Array(64).map((_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32));
  function md5(data) {
    const bitLength = data.length * 8;
    const padded = new Uint8Array(((data.length + 8) >> 6) * 64 + 64);
    padded.set(data);
    padded[data.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, bitLength >>> 0, true);
    view.setUint32(padded.length - 4, Math.floor(bitLength / 2 ** 32), true);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    const M = new Uint32Array(16);
    for (let off = 0; off < padded.length; off += 64) {
      for (let j = 0; j < 16; j++) M[j] = view.getUint32(off + j * 4, true);
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; } else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; } else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        const s = S[(i >> 4) * 4 + (i % 4)];
        const sum = (A + F + K[i] + M[g]) >>> 0;
        A = D; D = C; C = B;
        B = (B + ((sum << s) | (sum >>> (32 - s)))) >>> 0;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    const out = new DataView(new ArrayBuffer(16));
    [a0, b0, c0, d0].forEach((v, i) => out.setUint32(i * 4, v, true));
    return hex(new Uint8Array(out.buffer));
  }

  async function sha(name, data) {
    // crypto.subtle needs a secure context; file:// counts as secure in Chromium and Firefox
    return hex(new Uint8Array(await crypto.subtle.digest(name, data)));
  }

  async function checksums(data) {
    const out = { 'CRC-32': hex32(crc32(data)), 'Adler-32': hex32(adler32(data)), MD5: md5(data) };
    for (const name of ['SHA-1', 'SHA-256', 'SHA-512']) {
      try { out[name] = await sha(name, data); } catch (e) { out[name] = null; }
    }
    return out;
  }

  function differences(a, b, limit = 100000) {
    const offsets = [];
    const common = Math.min(a.length, b.length);
    let count = Math.abs(a.length - b.length);
    for (let i = 0; i < common; i++) {
      if (a[i] !== b[i]) { count++; if (offsets.length < limit) offsets.push(i); }
    }
    for (let i = common; i < Math.max(a.length, b.length) && offsets.length < limit; i++) offsets.push(i);
    return { offsets, count, truncated: count > offsets.length };
  }

  Object.assign(HE, { crc32, adler32, md5, checksums, differences });
})(window.HE = window.HE || {});
