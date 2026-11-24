/*
 * Structure templates of the hex editor: the fields of common file formats (PNG, JPEG, GIF, BMP, WAV, ZIP, ELF, PE), recognised
 * by their signature. HE.structures.parse(bytes) -> { format, fields } or null, a field being
 * { name, offset, size, value?, children? }. Parsers stop at damaged or truncated data and limit the number of entries, so any
 * file is safe to look at.
 */
(function (HE) {
  'use strict';

  const MAX = 2000; // entries per list (chunks, sections, files)
  const hex = (n, w = 0) => `0x${n.toString(16).toUpperCase().padStart(w, '0')}`;

  /** A little reader on top of a byte array: values at offsets, with bounds checks. */
  function reader(b, le = true) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const ok = (o, n) => o >= 0 && o + n <= b.length;
    return {
      le,
      u8: (o) => (ok(o, 1) ? b[o] : null),
      u16: (o, l = le) => (ok(o, 2) ? dv.getUint16(o, l) : null),
      u32: (o, l = le) => (ok(o, 4) ? dv.getUint32(o, l) : null),
      i32: (o, l = le) => (ok(o, 4) ? dv.getInt32(o, l) : null),
      u64: (o, l = le) => (ok(o, 8) ? Number(dv.getBigUint64(o, l)) : null),
      ascii: (o, n) => (ok(o, Math.min(n, b.length - o)) ? String.fromCharCode(...b.subarray(o, Math.min(b.length, o + n))).replace(/\0[\s\S]*$/, '') : ''),
      ok,
    };
  }

  const field = (name, offset, size, value, children) => ({ name, offset, size, ...(value !== undefined && value !== null ? { value: String(value) } : {}), ...(children ? { children } : {}) });
  const num = (name, offset, size, v, extra = '') => field(name, offset, size, v === null ? '–' : `${v}${extra}`);

  // ---- PNG -------------------------------------------------------------------------------------------------------------

  const COLOR_TYPES = { 0: 'greyscale', 2: 'RGB', 3: 'palette', 4: 'greyscale + alpha', 6: 'RGBA' };
  function png(b) {
    const r = reader(b, false);
    const fields = [field('Signature', 0, 8, 'PNG')];
    let o = 8;
    for (let n = 0; n < MAX && r.ok(o, 12); n++) {
      const len = r.u32(o), type = r.ascii(o + 4, 4);
      if (len === null || !r.ok(o + 8, Math.min(len, b.length - o - 8))) break;
      const kids = [num('Length', o, 4, len), field('Type', o + 4, 4, type)];
      const d = o + 8;
      if (type === 'IHDR' && len >= 13) {
        kids.push(num('Width', d, 4, r.u32(d)), num('Height', d + 4, 4, r.u32(d + 4)), num('Bit depth', d + 8, 1, r.u8(d + 8)),
          field('Colour type', d + 9, 1, `${r.u8(d + 9)} (${COLOR_TYPES[r.u8(d + 9)] || '?'})`), num('Compression', d + 10, 1, r.u8(d + 10)),
          num('Filter', d + 11, 1, r.u8(d + 11)), num('Interlace', d + 12, 1, r.u8(d + 12)));
      } else if (type === 'tEXt') {
        const text = r.ascii(d, Math.min(len, 200));
        kids.push(field('Keyword', d, Math.min(len, text.length + 1), text));
      } else if (len) kids.push(field('Data', d, Math.min(len, b.length - d)));
      kids.push(field('CRC', d + len, 4, r.u32(d + len) === null ? '–' : hex(r.u32(d + len), 8)));
      fields.push(field(type, o, Math.min(12 + len, b.length - o), `${len} bytes`, kids));
      o += 12 + len;
      if (type === 'IEND') break;
    }
    return fields;
  }

  // ---- JPEG ------------------------------------------------------------------------------------------------------------

  const JPEG_NAMES = { 0xd8: 'SOI', 0xd9: 'EOI', 0xda: 'SOS (scan)', 0xdb: 'DQT (quantisation)', 0xc4: 'DHT (Huffman)', 0xc0: 'SOF0 (baseline)', 0xc2: 'SOF2 (progressive)', 0xdd: 'DRI', 0xfe: 'COM (comment)' };
  function jpeg(b) {
    const r = reader(b, false);
    const fields = [field('SOI', 0, 2, 'start of image')];
    let o = 2;
    for (let n = 0; n < MAX && r.ok(o, 2); n++) {
      if (b[o] !== 0xff) break;
      const m = b[o + 1];
      if (m === 0xd9) { fields.push(field('EOI', o, 2, 'end of image')); break; }
      const len = r.u16(o + 2);
      if (len === null) break;
      const name = JPEG_NAMES[m] || (m >= 0xe0 && m <= 0xef ? `APP${m - 0xe0}${m === 0xe1 && r.ascii(o + 4, 4) === 'Exif' ? ' (Exif)' : m === 0xe0 ? ` (${r.ascii(o + 4, 5)})` : ''}` : hex(m, 2));
      const kids = [field('Marker', o, 2, `FF ${m.toString(16).toUpperCase()}`), num('Length', o + 2, 2, len)];
      if ((m === 0xc0 || m === 0xc2) && len >= 8) kids.push(num('Precision', o + 4, 1, r.u8(o + 4)), num('Height', o + 5, 2, r.u16(o + 5)), num('Width', o + 7, 2, r.u16(o + 7)), num('Components', o + 9, 1, r.u8(o + 9)));
      if (m === 0xda) {
        // the compressed scan runs until the next marker that is not a restart marker or a stuffed 00
        let e = o + 2 + len;
        while (e + 1 < b.length && !(b[e] === 0xff && b[e + 1] !== 0 && !(b[e + 1] >= 0xd0 && b[e + 1] <= 0xd7))) e++;
        kids.push(field('Image data', o + 2 + len, e - o - 2 - len));
        fields.push(field(name, o, e - o, `${e - o} bytes`, kids));
        o = e;
        continue;
      }
      fields.push(field(name, o, Math.min(2 + len, b.length - o), `${len} bytes`, kids));
      o += 2 + len;
    }
    return fields;
  }

  // ---- GIF -------------------------------------------------------------------------------------------------------------

  function gif(b) {
    const r = reader(b, true);
    const packed = r.u8(10) || 0;
    const gct = packed & 0x80 ? 3 * (2 << (packed & 7)) : 0;
    const fields = [field('Signature', 0, 6, r.ascii(0, 6)),
      field('Logical screen', 6, 7, `${r.u16(6)} × ${r.u16(8)}`, [num('Width', 6, 2, r.u16(6)), num('Height', 8, 2, r.u16(8)), field('Flags', 10, 1, hex(packed, 2)), num('Background colour', 11, 1, r.u8(11))])];
    if (gct) fields.push(field('Global colour table', 13, gct, `${gct / 3} colours`));
    let o = 13 + gct, frames = 0;
    const skipBlocks = (p) => { while (r.ok(p, 1) && b[p] !== 0) p += b[p] + 1; return p + 1; };
    for (let n = 0; n < MAX && r.ok(o, 1); n++) {
      const k = b[o];
      if (k === 0x3b) { fields.push(field('Trailer', o, 1)); break; }
      if (k === 0x21) { const end = skipBlocks(o + 2); fields.push(field(`Extension ${hex(r.u8(o + 1) || 0, 2)}${r.u8(o + 1) === 0xf9 ? ' (graphic control)' : r.u8(o + 1) === 0xff ? ` (${r.ascii(o + 3, 11)})` : ''}`, o, end - o)); o = end; continue; }
      if (k === 0x2c) {
        const f = r.u8(o + 9) || 0, lct = f & 0x80 ? 3 * (2 << (f & 7)) : 0;
        const end = skipBlocks(o + 10 + lct + 1);
        frames++;
        fields.push(field(`Image ${frames}`, o, end - o, `${r.u16(o + 5)} × ${r.u16(o + 7)} at ${r.u16(o + 1)}, ${r.u16(o + 3)}`));
        o = end;
        continue;
      }
      break;
    }
    return fields;
  }

  // ---- BMP -------------------------------------------------------------------------------------------------------------

  function bmp(b) {
    const r = reader(b, true);
    const dib = r.u32(14) || 0;
    const head = [field('Signature', 0, 2, 'BM'), num('File size', 2, 4, r.u32(2)), num('Reserved', 6, 4, r.u32(6)), num('Pixel data offset', 10, 4, r.u32(10))];
    const info = [num('Header size', 14, 4, dib), num('Width', 18, 4, r.i32(18)), num('Height', 22, 4, r.i32(22), (r.i32(22) || 0) < 0 ? ' (top down)' : ''), num('Planes', 26, 2, r.u16(26)),
      num('Bits per pixel', 28, 2, r.u16(28)), num('Compression', 30, 4, r.u32(30)), num('Image size', 34, 4, r.u32(34)), num('X pixels per metre', 38, 4, r.i32(38)),
      num('Y pixels per metre', 42, 4, r.i32(42)), num('Colours used', 46, 4, r.u32(46)), num('Important colours', 50, 4, r.u32(50))].filter((f) => f.offset + f.size <= 14 + dib);
    const fields = [field('File header', 0, 14, undefined, head), field('Info header', 14, dib, `${r.i32(18)} × ${Math.abs(r.i32(22) || 0)}, ${r.u16(28)} bit`, info)];
    const px = r.u32(10) || 0;
    if (px > 14 + dib && px <= b.length) fields.push(field('Colour table', 14 + dib, px - 14 - dib));
    if (px && px < b.length) fields.push(field('Pixel data', px, b.length - px));
    return fields;
  }

  // ---- WAV (RIFF) ------------------------------------------------------------------------------------------------------

  const WAVE_FORMATS = { 1: 'PCM', 3: 'IEEE float', 6: 'A-law', 7: 'µ-law', 0xfffe: 'extensible' };
  function riff(b) {
    const r = reader(b, true);
    const fields = [field('RIFF header', 0, 12, `${r.ascii(8, 4)}, ${r.u32(4)} bytes`, [field('ID', 0, 4, 'RIFF'), num('Size', 4, 4, r.u32(4)), field('Type', 8, 4, r.ascii(8, 4))])];
    let o = 12;
    for (let n = 0; n < MAX && r.ok(o, 8); n++) {
      const id = r.ascii(o, 4), size = r.u32(o + 4);
      const kids = [field('ID', o, 4, id), num('Size', o + 4, 4, size)];
      const d = o + 8;
      if (id === 'fmt ' && size >= 16) {
        kids.push(field('Format', d, 2, `${r.u16(d)} (${WAVE_FORMATS[r.u16(d)] || '?'})`), num('Channels', d + 2, 2, r.u16(d + 2)), num('Sample rate', d + 4, 4, r.u32(d + 4), ' Hz'),
          num('Byte rate', d + 8, 4, r.u32(d + 8)), num('Block align', d + 12, 2, r.u16(d + 12)), num('Bits per sample', d + 14, 2, r.u16(d + 14)));
      } else if (size) kids.push(field('Data', d, Math.min(size, b.length - d)));
      fields.push(field(id.trim() || '?', o, Math.min(8 + size + (size & 1), b.length - o), `${size} bytes`, kids));
      o += 8 + size + (size & 1);
    }
    return fields;
  }

  // ---- ZIP -------------------------------------------------------------------------------------------------------------

  const METHODS = { 0: 'stored', 8: 'deflate', 9: 'deflate64', 12: 'bzip2', 14: 'LZMA', 93: 'Zstandard', 99: 'AES' };
  function zip(b) {
    const r = reader(b, true);
    const fields = [];
    // the end record: the last PK\5\6 within the last 64 KiB + 22 bytes
    let eocd = -1;
    for (let o = b.length - 22; o >= Math.max(0, b.length - 65557); o--) if (r.u32(o) === 0x06054b50) { eocd = o; break; }
    const cdCount = eocd >= 0 ? r.u16(eocd + 10) : 0, cdOffset = eocd >= 0 ? r.u32(eocd + 16) : 0;
    // local entries in file order (from the central directory, or by scanning when there is none)
    const locals = [];
    if (eocd >= 0) {
      let o = cdOffset;
      for (let n = 0; n < Math.min(cdCount, MAX) && r.u32(o) === 0x02014b50; n++) {
        const nameLen = r.u16(o + 28), extra = r.u16(o + 30), comment = r.u16(o + 32);
        locals.push(r.u32(o + 42));
        o += 46 + nameLen + extra + comment;
      }
    } else for (let o = 0; o + 4 <= b.length && locals.length < MAX; o++) if (r.u32(o) === 0x04034b50) locals.push(o);
    for (const o of locals.sort((x, y) => x - y)) {
      if (r.u32(o) !== 0x04034b50) continue;
      const nameLen = r.u16(o + 26), extra = r.u16(o + 28), csize = r.u32(o + 18);
      const name = new TextDecoder().decode(b.subarray(o + 30, Math.min(b.length, o + 30 + nameLen)));
      const data = o + 30 + nameLen + extra;
      fields.push(field(name, o, Math.min(data + csize, b.length) - o, `${METHODS[r.u16(o + 8)] || r.u16(o + 8)}, ${csize} → ${r.u32(o + 22)} bytes`, [
        field('Signature', o, 4, 'PK 03 04'), num('Version needed', o + 4, 2, r.u16(o + 4)), field('Flags', o + 6, 2, hex(r.u16(o + 6) || 0, 4)),
        field('Method', o + 8, 2, METHODS[r.u16(o + 8)] || r.u16(o + 8)), field('Time, date', o + 10, 4, hex(r.u32(o + 10) || 0, 8)), field('CRC-32', o + 14, 4, hex(r.u32(o + 14) || 0, 8)),
        num('Compressed size', o + 18, 4, csize), num('Size', o + 22, 4, r.u32(o + 22)), num('Name length', o + 26, 2, nameLen), num('Extra length', o + 28, 2, extra),
        field('Name', o + 30, nameLen, name), ...(extra ? [field('Extra field', o + 30 + nameLen, extra)] : []), field('Data', data, Math.max(0, Math.min(csize, b.length - data)))]));
    }
    if (eocd >= 0) {
      if (cdOffset < eocd) fields.push(field('Central directory', cdOffset, eocd - cdOffset, `${cdCount} entries`));
      fields.push(field('End of central directory', eocd, b.length - eocd, `${cdCount} entries`, [field('Signature', eocd, 4, 'PK 05 06'), num('Entries', eocd + 10, 2, cdCount),
        num('Directory size', eocd + 12, 4, r.u32(eocd + 12)), num('Directory offset', eocd + 16, 4, cdOffset), num('Comment length', eocd + 20, 2, r.u16(eocd + 20))]));
    }
    return fields;
  }

  // ---- ELF -------------------------------------------------------------------------------------------------------------

  const ELF_TYPES = { 1: 'relocatable', 2: 'executable', 3: 'shared object', 4: 'core' };
  const ELF_MACHINES = { 3: 'x86', 8: 'MIPS', 20: 'PowerPC', 40: 'ARM', 62: 'x86-64', 183: 'AArch64', 243: 'RISC-V' };
  function elf(b) {
    const is64 = b[4] === 2, le = b[5] !== 2;
    const r = reader(b, le);
    const W = is64 ? 8 : 4, word = (o) => (is64 ? r.u64(o) : r.u32(o));
    const at = (o32, o64) => (is64 ? o64 : o32);
    const ident = [field('Magic', 0, 4, '7F ELF'), field('Class', 4, 1, is64 ? '64 bit' : '32 bit'), field('Data', 5, 1, le ? 'little endian' : 'big endian'), num('Version', 6, 1, b[6]), num('OS ABI', 7, 1, b[7])];
    const phoff = word(at(28, 32)), shoff = word(at(32, 40));
    const ehsize = r.u16(at(40, 52)), phentsize = r.u16(at(42, 54)), phnum = r.u16(at(44, 56)), shentsize = r.u16(at(46, 58)), shnum = r.u16(at(48, 60)), shstrndx = r.u16(at(50, 62));
    const header = [field('Identification', 0, 16, undefined, ident), field('Type', 16, 2, `${r.u16(16)} (${ELF_TYPES[r.u16(16)] || '?'})`),
      field('Machine', 18, 2, `${r.u16(18)} (${ELF_MACHINES[r.u16(18)] || '?'})`), num('Version', 20, 4, r.u32(20)), field('Entry point', 24, W, hex(word(24) || 0)),
      num('Program headers at', at(28, 32), W, phoff), num('Section headers at', at(32, 40), W, shoff), field('Flags', at(36, 48), 4, hex(r.u32(at(36, 48)) || 0)),
      num('Header size', at(40, 52), 2, ehsize), num('Program header size', at(42, 54), 2, phentsize), num('Program headers', at(44, 56), 2, phnum),
      num('Section header size', at(46, 58), 2, shentsize), num('Sections', at(48, 60), 2, shnum), num('Section names index', at(50, 62), 2, shstrndx)];
    const fields = [field('ELF header', 0, ehsize || (is64 ? 64 : 52), `${is64 ? '64' : '32'} bit, ${ELF_MACHINES[r.u16(18)] || r.u16(18)}`, header)];
    if (phoff && phnum && phentsize) {
      const kids = [];
      for (let i = 0; i < Math.min(phnum, MAX); i++) { const o = phoff + i * phentsize; if (!r.ok(o, phentsize)) break; kids.push(field(`Segment ${i}`, o, phentsize, `type ${hex(r.u32(o) || 0)}`)); }
      fields.push(field('Program headers', phoff, phnum * phentsize, `${phnum}`, kids));
    }
    if (shoff && shnum && shentsize) {
      const names = shstrndx < shnum ? word(shoff + shstrndx * shentsize + at(16, 24)) : 0;
      const kids = [];
      for (let i = 0; i < Math.min(shnum, MAX); i++) {
        const o = shoff + i * shentsize;
        if (!r.ok(o, shentsize)) break;
        const name = names ? r.ascii(names + (r.u32(o) || 0), 64) : '';
        const off = word(o + at(16, 24)), size = word(o + at(20, 32));
        kids.push(field(name || `Section ${i}`, o, shentsize, `${size} bytes at ${off}`));
        if (name && off && size && r.ok(off, 1) && i) fields.push(field(`Section ${name}`, off, Math.min(size, b.length - off)));
      }
      fields.push(field('Section headers', shoff, shnum * shentsize, `${shnum}`, kids));
    }
    return fields.sort((x, y) => x.offset - y.offset);
  }

  // ---- PE (Windows .exe, .dll) -------------------------------------------------------------------------------------------

  const PE_MACHINES = { 0x14c: 'x86', 0x8664: 'x86-64', 0xaa64: 'ARM64', 0x1c0: 'ARM' };
  const SUBSYSTEMS = { 2: 'Windows GUI', 3: 'Windows console', 10: 'EFI application' };
  function pe(b) {
    const r = reader(b, true);
    const lfanew = r.u32(0x3c);
    const fields = [field('DOS header', 0, 64, 'MZ', [field('Magic', 0, 2, 'MZ'), num('PE header at', 0x3c, 4, lfanew)])];
    if (lfanew > 64 && lfanew <= b.length) fields.push(field('DOS stub', 64, lfanew - 64));
    if (!lfanew || r.u32(lfanew) !== 0x4550) return fields;
    const c = lfanew + 4, sections = r.u16(c + 2), optSize = r.u16(c + 16);
    fields.push(field('PE signature', lfanew, 4, 'PE\\0\\0'));
    fields.push(field('COFF header', c, 20, PE_MACHINES[r.u16(c)] || hex(r.u16(c) || 0), [field('Machine', c, 2, PE_MACHINES[r.u16(c)] || hex(r.u16(c) || 0)), num('Sections', c + 2, 2, sections),
      field('Time stamp', c + 4, 4, r.u32(c + 4) ? new Date(r.u32(c + 4) * 1000).toISOString().replace('.000Z', 'Z') : '0'), num('Optional header size', c + 16, 2, optSize), field('Characteristics', c + 18, 2, hex(r.u16(c + 18) || 0, 4))]));
    const opt = c + 20, plus = r.u16(opt) === 0x20b;
    if (optSize) {
      fields.push(field('Optional header', opt, optSize, plus ? 'PE32+' : 'PE32', [field('Magic', opt, 2, plus ? 'PE32+ (64 bit)' : 'PE32 (32 bit)'), field('Entry point (RVA)', opt + 16, 4, hex(r.u32(opt + 16) || 0)),
        field('Image base', plus ? opt + 24 : opt + 28, plus ? 8 : 4, hex((plus ? r.u64(opt + 24) : r.u32(opt + 28)) || 0)), field('Subsystem', opt + 68, 2, SUBSYSTEMS[r.u16(opt + 68)] || r.u16(opt + 68))]));
    }
    const st = opt + optSize, kids = [];
    for (let i = 0; i < Math.min(sections, 96); i++) {
      const o = st + i * 40;
      if (!r.ok(o, 40)) break;
      const name = r.ascii(o, 8), rawSize = r.u32(o + 16), raw = r.u32(o + 20);
      kids.push(field(name || `Section ${i}`, o, 40, `${rawSize} bytes at ${raw}`, [field('Name', o, 8, name), num('Virtual size', o + 8, 4, r.u32(o + 8)), field('Virtual address', o + 12, 4, hex(r.u32(o + 12) || 0)),
        num('Raw size', o + 16, 4, rawSize), num('Raw data at', o + 20, 4, raw), field('Characteristics', o + 36, 4, hex(r.u32(o + 36) || 0, 8))]));
      if (raw && rawSize && r.ok(raw, 1)) fields.push(field(`Section ${name}`, raw, Math.min(rawSize, b.length - raw)));
    }
    if (kids.length) fields.push(field('Section table', st, kids.length * 40, `${kids.length}`, kids));
    return fields.sort((x, y) => x.offset - y.offset);
  }

  const FORMATS = [
    ['PNG', (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47, png],
    ['JPEG', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff, jpeg],
    ['GIF', (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38, gif],
    ['BMP', (b) => b[0] === 0x42 && b[1] === 0x4d && b.length > 26, bmp],
    ['RIFF (WAV, AVI, WebP)', (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46, riff],
    ['ZIP (also DOCX, XLSX, ODT, JAR, …)', (b) => b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5), zip],
    ['ELF', (b) => b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46, elf],
    ['PE (Windows program)', (b) => b[0] === 0x4d && b[1] === 0x5a && b.length > 64, pe],
  ];

  /** The structure of a file: { format, fields } or null for unknown formats. */
  function parse(bytes) {
    for (const [format, test, fn] of FORMATS) {
      if (bytes.length < 4 || !test(bytes)) continue;
      try { return { format, fields: fn(bytes) }; } catch (e) { return { format, fields: [], error: String(e.message || e) }; }
    }
    return null;
  }

  HE.structures = { parse, FORMATS: FORMATS.map((f) => f[0]) };
})(window.HE = window.HE || {});
