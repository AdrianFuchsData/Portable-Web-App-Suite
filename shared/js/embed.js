/* Access to files embedded by build.py: binaries (gzip + base64) and worker code (text). */
(function (Suite) {
  'use strict';

  function element(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error(`embedded file not found: ${id}`);
    return el;
  }

  /** Decode an embedded binary (gzip + base64) to an ArrayBuffer. */
  async function bytes(id) {
    const binary = atob(element(id).textContent.trim());
    const packed = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) packed[i] = binary.charCodeAt(i);
    const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).arrayBuffer();
  }

  /** Compile and instantiate an embedded WASM module. */
  async function wasm(id, imports = {}) {
    return WebAssembly.instantiate(await bytes(id), imports);
  }

  /** Blob URL for embedded text (e.g. worker code). Revoke it when no longer needed. */
  function textUrl(id, type = 'text/javascript') {
    return URL.createObjectURL(new Blob([element(id).textContent], { type }));
  }

  /**
   * Start a classic worker from embedded code. Workers cannot be loaded from file:// URLs and do not
   * see the document's import map, so worker code must be self-contained (or load libraries with
   * importScripts() from further Blob URLs).
   */
  function worker(id) {
    const url = textUrl(id);
    const w = new Worker(url);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return w;
  }

  let bundlePromise = null;

  /**
   * Files embedded with build.py's data-bundle: resolves to { files: { name: Blob }, meta } (decoded once; the base64
   * text is freed afterwards).
   */
  function bundle() {
    if (!bundlePromise) {
      bundlePromise = (async () => {
        const files = {};
        await Promise.all([...document.querySelectorAll('script[data-bundle-file]')].map(async (el) => {
          const binary = atob(el.textContent.trim());
          const packed = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) packed[i] = binary.charCodeAt(i);
          files[el.dataset.bundleFile] = await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).blob();
          el.textContent = '';
        }));
        const metaEl = document.getElementById('bundle-meta');
        return { files, meta: metaEl ? JSON.parse(metaEl.textContent) : {} };
      })();
    }
    return bundlePromise;
  }

  Suite.embed = { bytes, wasm, textUrl, worker, bundle };
})(window.Suite = window.Suite || {});
