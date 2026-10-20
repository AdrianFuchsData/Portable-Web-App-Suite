/*
 * Reads title, artist, album and cover art from media files: ID3v2 (MP3, also in WAV/AIFF "id3 " chunks), ID3v1,
 * FLAC and Ogg Vorbis/Opus comments, RIFF INFO (WAV) and MP4/M4A ("ilst" atoms).
 *
 *   const tags = await MP.readTags(file);   // -> { title, artist, album, cover: Blob|null } (missing values undefined)
 */
(function (MP) {
  'use strict';

  const HEAD = 512 * 1024; // tags live at the start (ID3v2, FLAC, Ogg, MP4 moov is often there too)

  const latin1 = new TextDecoder('latin1');
  const utf8 = new TextDecoder('utf-8');

  function synchsafe(b, o) { return (b[o] << 21) | (b[o + 1] << 14) | (b[o + 2] << 7) | b[o + 3]; }
  function be32(b, o) { return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0; }
  function le32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  const ascii = (b, o, n) => latin1.decode(b.subarray(o, o + n));

  function id3Text(data) {
    const enc = data[0];
    const body = data.subarray(1);
    let text;
    if (enc === 1 || enc === 2) {
      let le = enc === 1 ? true : false;
      let start = 0;
      if (enc === 1 && body[0] === 0xfe && body[1] === 0xff) { le = false; start = 2; } else if (enc === 1 && body[0] === 0xff && body[1] === 0xfe) start = 2;
      text = new TextDecoder(le ? 'utf-16le' : 'utf-16be').decode(body.subarray(start));
    } else text = (enc === 3 ? utf8 : latin1).decode(body);
    return text.replace(/\0+$/, '').split('\0')[0].trim();
  }

  function id3Picture(data, v22) {
    const enc = data[0];
    let p = 1;
    let mime;
    if (v22) { mime = { JPG: 'image/jpeg', PNG: 'image/png' }[ascii(data, 1, 3)] || 'image/jpeg'; p = 4; } else {
      const end = data.indexOf(0, p);
      mime = ascii(data, p, end - p) || 'image/jpeg';
      if (!mime.includes('/')) mime = `image/${mime.toLowerCase()}`;
      p = end + 1;
    }
    p += 1; // picture type
    if (enc === 1 || enc === 2) { while (p + 1 < data.length && !(data[p] === 0 && data[p + 1] === 0)) p += 2; p += 2; } else { while (p < data.length && data[p] !== 0) p++; p += 1; }
    return new Blob([data.subarray(p)], { type: mime });
  }

  function readId3v2(b, offset = 0) {
    if (ascii(b, offset, 3) !== 'ID3') return null;
    const version = b[offset + 3];
    const flags = b[offset + 5];
    const size = synchsafe(b, offset + 6);
    const tags = {};
    let p = offset + 10;
    const end = Math.min(b.length, p + size);
    if (flags & 0x40 && version >= 3) p += version === 4 ? synchsafe(b, p) : be32(b, p) + 4; // extended header
    const v22 = version === 2;
    const map = v22 ? { TT2: 'title', TP1: 'artist', TAL: 'album' } : { TIT2: 'title', TPE1: 'artist', TALB: 'album' };
    while (p + (v22 ? 6 : 10) <= end) {
      const id = ascii(b, p, v22 ? 3 : 4);
      if (!/^[A-Z0-9]{3,4}$/.test(id)) break;
      const len = v22 ? (b[p + 3] << 16) | (b[p + 4] << 8) | b[p + 5] : version === 4 ? synchsafe(b, p + 4) : be32(b, p + 4);
      const start = p + (v22 ? 6 : 10);
      const data = b.subarray(start, Math.min(end, start + len));
      if (map[id]) tags[map[id]] = id3Text(data);
      else if ((id === 'APIC' || id === 'PIC') && !tags.cover) { try { tags.cover = id3Picture(data, v22); } catch (e) { /* ignore broken pictures */ } }
      p = start + len;
    }
    return tags;
  }

  function vorbisComments(b, p) {
    const tags = {};
    const vendorLen = le32(b, p);
    p += 4 + vendorLen;
    const count = le32(b, p);
    p += 4;
    for (let i = 0; i < count && p + 4 <= b.length; i++) {
      const len = le32(b, p);
      const text = utf8.decode(b.subarray(p + 4, p + 4 + len));
      p += 4 + len;
      const eq = text.indexOf('=');
      const key = text.slice(0, eq).toUpperCase();
      const value = text.slice(eq + 1);
      if (key === 'TITLE') tags.title = value;
      else if (key === 'ARTIST') tags.artist = value;
      else if (key === 'ALBUM') tags.album = value;
    }
    return tags;
  }

  function readFlac(b) {
    if (ascii(b, 0, 4) !== 'fLaC') return null;
    let p = 4;
    const tags = {};
    for (;;) {
      if (p + 4 > b.length) break;
      const last = b[p] & 0x80;
      const type = b[p] & 0x7f;
      const len = (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3];
      const start = p + 4;
      if (type === 4) Object.assign(tags, vorbisComments(b, start));
      if (type === 6 && !tags.cover && start + len <= b.length) {
        let q = start + 4;
        const mimeLen = be32(b, q); q += 4;
        const mime = ascii(b, q, mimeLen); q += mimeLen;
        const descLen = be32(b, q); q += 4 + descLen + 16;
        const dataLen = be32(b, q); q += 4;
        tags.cover = new Blob([b.subarray(q, q + dataLen)], { type: mime || 'image/jpeg' });
      }
      p = start + len;
      if (last) break;
    }
    return tags;
  }

  function readOgg(b) {
    if (ascii(b, 0, 4) !== 'OggS') return null;
    // the comment header is the second packet; it normally starts within the first pages
    for (const magic of ['\x03vorbis', 'OpusTags']) {
      const needle = Array.from(magic, (c) => c.charCodeAt(0));
      for (let i = 0; i < b.length - needle.length; i++) {
        if (needle.every((c, k) => b[i + k] === c)) return vorbisComments(b, i + needle.length);
      }
    }
    return {};
  }

  function readRiff(b) {
    if (ascii(b, 0, 4) !== 'RIFF') return null;
    const tags = {};
    let p = 12;
    while (p + 8 <= b.length) {
      const id = ascii(b, p, 4);
      const len = le32(b, p + 4);
      if (id === 'LIST' && ascii(b, p + 8, 4) === 'INFO') {
        let q = p + 12;
        while (q + 8 <= p + 8 + len && q + 8 <= b.length) {
          const sub = ascii(b, q, 4);
          const n = le32(b, q + 4);
          const value = utf8.decode(b.subarray(q + 8, q + 8 + n)).replace(/\0+$/, '').trim();
          if (sub === 'INAM') tags.title = value;
          else if (sub === 'IART') tags.artist = value;
          else if (sub === 'IPRD') tags.album = value;
          q += 8 + n + (n & 1);
        }
      } else if (id === 'id3 ' || id === 'ID3 ') Object.assign(tags, readId3v2(b, p + 8) || {});
      p += 8 + len + (len & 1);
    }
    return tags;
  }

  function readMp4(b) {
    if (ascii(b, 4, 4) !== 'ftyp') return null;
    const tags = {};
    const walk = (start, end, depth) => {
      let p = start;
      while (p + 8 <= end) {
        let size = be32(b, p);
        const type = ascii(b, p + 4, 4);
        if (size < 8) size = end - p;
        const body = p + 8;
        if (['moov', 'udta', 'ilst'].includes(type) && depth < 6) walk(body, Math.min(end, p + size), depth + 1);
        else if (type === 'meta') walk(body + 4, Math.min(end, p + size), depth + 1);
        else if (['\xa9nam', '\xa9ART', '\xa9alb', 'covr'].includes(type)) {
          const dataAtom = body;
          if (ascii(b, dataAtom + 4, 4) === 'data') {
            const kind = be32(b, dataAtom + 8) & 0xffffff;
            const value = b.subarray(dataAtom + 16, Math.min(end, p + size));
            if (type === 'covr') tags.cover = new Blob([value], { type: kind === 14 ? 'image/png' : 'image/jpeg' });
            else tags[{ '\xa9nam': 'title', '\xa9ART': 'artist', '\xa9alb': 'album' }[type]] = utf8.decode(value);
          }
        }
        p += size;
      }
    };
    walk(0, b.length, 0);
    return tags;
  }

  async function readId3v1(file) {
    if (file.size < 128) return null;
    const b = new Uint8Array(await file.slice(file.size - 128).arrayBuffer());
    if (ascii(b, 0, 3) !== 'TAG') return null;
    const field = (o, n) => latin1.decode(b.subarray(o, o + n)).replace(/\0.*$/, '').trim() || undefined;
    return { title: field(3, 30), artist: field(33, 30), album: field(63, 30) };
  }

  async function readTags(file) {
    try {
      const b = new Uint8Array(await file.slice(0, HEAD).arrayBuffer());
      let tags = readId3v2(b) || readFlac(b) || readOgg(b) || readRiff(b) || readMp4(b);
      if (!tags || (!tags.title && !tags.artist)) {
        const v1 = await readId3v1(file);
        if (v1) tags = { ...v1, ...(tags || {}), title: (tags && tags.title) || v1.title, artist: (tags && tags.artist) || v1.artist };
      }
      tags = tags || {};
      for (const k of ['title', 'artist', 'album']) if (!tags[k]) delete tags[k];
      return tags;
    } catch (e) {
      return {};
    }
  }

  MP.readTags = readTags;
})(window.MP = window.MP || {});
