/*
 * Formats read through libarchive (WebAssembly, vendor/libarchive): 7z, RAR 4/5, XZ, BZip2, LZMA, Zstandard, ISO, CAB,
 * CPIO, AR/DEB, … and writing 7z. libarchive.js runs libarchive in a worker; a page opened from file:// cannot load
 * workers or wasm by URL, so the worker code and the wasm are embedded (build.py); the worker starts from a Blob URL with
 * the wasm patched in as a data: URL (it would otherwise be resolved relative to import.meta.url).
 *
 *   detectMulti(bytes, name) -> { kind, label } | null
 *   await readMulti(bytes, name, askPassword) -> { format: 'multi', label, entries, password }
 *   await write7z(entries) -> Uint8Array
 */
import { Archive } from 'libarchive.js';
import { ArchiveError, cleanPath } from '@app/archive.js';

const latin1 = new TextDecoder('latin1');
const starts = (bytes, ...sig) => sig.every((b, i) => bytes[i] === b);

/** Formats left to libarchive: magic numbers (the ZIP/TAR/GZ formats of archive.js are checked before). */
export function detectMulti(bytes, name = '') {
  const lower = name.toLowerCase();
  const tarInside = /\.tar\.\w+$|\.t(xz|bz2?|zst|lz)$/.test(lower);
  if (starts(bytes, 0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c)) return { kind: '7z', label: '7Z' };
  if (bytes.length >= 7 && latin1.decode(bytes.subarray(0, 7)) === 'Rar!\x1a\x07\x01') return { kind: 'rar', label: 'RAR 5' };
  if (bytes.length >= 4 && latin1.decode(bytes.subarray(0, 4)) === 'Rar!') return { kind: 'rar', label: 'RAR' };
  if (starts(bytes, 0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00)) return { kind: 'xz', label: tarInside ? 'TAR.XZ' : 'XZ' };
  if (starts(bytes, 0x42, 0x5a, 0x68)) return { kind: 'bz2', label: tarInside ? 'TAR.BZ2' : 'BZ2' };
  if (starts(bytes, 0x28, 0xb5, 0x2f, 0xfd)) return { kind: 'zst', label: tarInside ? 'TAR.ZST' : 'ZST' };
  if (starts(bytes, 0x5d, 0x00, 0x00) && /\.(lzma|tlz)$/.test(lower)) return { kind: 'lzma', label: 'LZMA' };
  if (bytes.length > 0x8006 && latin1.decode(bytes.subarray(0x8001, 0x8006)) === 'CD001') return { kind: 'iso', label: 'ISO' };
  if (bytes.length >= 4 && latin1.decode(bytes.subarray(0, 4)) === 'MSCF') return { kind: 'cab', label: 'CAB' };
  if (bytes.length >= 8 && latin1.decode(bytes.subarray(0, 8)) === '!<arch>\n') return { kind: 'ar', label: /\.deb$/.test(lower) ? 'DEB' : 'AR' };
  if (bytes.length >= 6 && /^(070701|070702|070707)$/.test(latin1.decode(bytes.subarray(0, 6)))) return { kind: 'cpio', label: 'CPIO' };
  if (starts(bytes, 0xed, 0xab, 0xee, 0xdb)) return { kind: 'rpm', label: 'RPM' };
  if (bytes.length >= 4 && latin1.decode(bytes.subarray(0, 4)) === 'xar!') return { kind: 'xar', label: 'XAR' };
  return null;
}

let starting = null;
/** Prepare the worker (once): Blob URLs of the wasm and of the patched worker code. */
function start() {
  if (!starting) {
    starting = (async () => {
      // the worker of a file:// page has its own opaque origin and cannot fetch the page's Blob URLs: a data: URL
      const bytes = new Uint8Array(await Suite.embed.bytes('libarchive-wasm'));
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      const wasm = `data:application/wasm;base64,${btoa(binary)}`;
      // module workers from Blob URLs do not start in pages opened from file://; the bundle has no import/export
      // statements, so it runs as a classic worker once import.meta is replaced
      const code = document.getElementById('libarchive-worker').textContent
        .replace('new URL("libarchive.wasm",import.meta.url).href', JSON.stringify(wasm))
        .replace(/import\.meta\.url/g, 'self.location.href')
        // the output buffer is sized as the files + 128 bytes each, too small for tar/7z headers of small files
        .replace('e.reduce(((e,{file:r})=>e+r.size+128),0)+128', 'e.reduce(((e,{file:r})=>e+r.size+1536),0)+65536')
        // libarchive's messages for damaged input are reported to the user as errors already
        .replace('printErr(...e){console.error(e)}', 'printErr(...e){console.warn(e)}');
      const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      Archive.init({ getWorker: () => new Worker(url) });
    })();
  }
  return starting;
}

const WRONG = /passphrase|password|decrypt/i;

/**
 * Read a whole archive (libarchive extracts sequentially, so every file is extracted at once and kept in memory).
 * askPassword(wrong) resolves to a password or null (cancelled) for encrypted archives.
 */
export async function readMulti(bytes, name, askPassword) {
  const info = detectMulti(bytes, name) || { kind: 'other', label: name.split('.').pop().toUpperCase() };
  await start();
  const reader = await Archive.open(new File([bytes], name || 'archive'));
  let password = null;
  try {
    let encrypted = await reader.hasEncryptedData();
    // libarchive decrypts ZIP only (handled by archive.js); encrypted 7z and RAR archives cannot be read
    if (encrypted && (info.kind === '7z' || info.kind === 'rar')) throw new ArchiveError('ar.encryptedUnsupported', info.label);
    let wrong = false;
    for (;;) {
      if (encrypted) {
        password = await askPassword(wrong);
        if (password == null) throw new ArchiveError('ar.cancelled');
        await reader.usePassword(password);
      }
      let list;
      try { list = await reader.client.extractFiles(); } catch (e) {
        if (/encrypted/i.test(e.message || '') && /not supported/i.test(e.message || '')) throw new ArchiveError('ar.encryptedUnsupported', info.label);
        if (WRONG.test(e.message || '')) { encrypted = true; wrong = password != null; continue; }
        throw new ArchiveError('ar.libarchive', e.message || String(e));
      }
      const entries = [];
      const seen = new Set();
      for (const x of list) {
        let path = cleanPath(x.path || '');
        if (!path) continue;
        if (seen.has(path)) continue;
        seen.add(path);
        const mtime = x.lastModified ? new Date(x.lastModified / 1e6) : null;
        if (x.type === 'DIR') entries.push({ path, dir: true, size: 0, csize: 0, mtime, mode: 0o755 });
        else if (x.type === 'FILE') {
          const data = new Uint8Array(x.fileData);
          entries.push({ path, dir: false, size: data.length, csize: null, mtime, mode: 0o644, encrypted: encrypted || undefined, load: () => data });
        }
      }
      // libarchive stops silently at damaged data: nothing readable counts as a damaged archive (an empty 7z has 32 bytes)
      if (!entries.length && ['xz', 'bz2', 'zst', 'lzma'].includes(info.kind)) throw new ArchiveError('ar.singleCompressed', info.label);
      if (!entries.length && bytes.length > 32) throw new ArchiveError('ar.corrupt');
      return { format: 'multi', kind: info.kind, label: info.label, entries, password };
    }
  } catch (e) {
    if (e instanceof ArchiveError) throw e;
    // a compressed single file (no archive inside) can make libarchive fail inside the wasm
    if (['xz', 'bz2', 'zst', 'lzma'].includes(info.kind)) throw new ArchiveError('ar.singleCompressed', info.label);
    throw new ArchiveError('ar.libarchive', e.message || String(e));
  } finally { reader.close(); }
}

/** A 7z archive of the files (folders are implied by the paths; libarchive's 7z writer has no encryption). */
export async function write7z(entries) {
  await start();
  const files = entries.filter((e) => !e.dir && !e.link).map((e) => ({ file: new File([e.load()], e.path.split('/').pop(), { lastModified: e.mtime ? +e.mtime : Date.now() }), pathname: e.path }));
  // libarchive.js has no working "no filter" option: the 7z stream is written through gzip and unpacked here
  const out = await Archive.write({ files, outputFileName: 'archive.7z.gz', compression: 'gzip', format: '7zip', passphrase: null });
  if (!out.size) throw new ArchiveError('ar.libarchive', '7z');
  return new Uint8Array(await new Response(out.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
}
