/* Probes which platform features are available to a single HTML file opened via file://. */
(async function () {
  'use strict';
  const result = {};
  const probe = async (name, fn) => {
    try { result[name] = await fn(); } catch (e) { result[name] = `error: ${e.name}: ${e.message}`; }
  };

  await probe('wasmAdd', async () => (await Suite.embed.wasm('add-wasm')).instance.exports.add(2, 3));
  await probe('workerSquare', () => new Promise((resolve, reject) => {
    const w = Suite.embed.worker('square-worker');
    w.onmessage = (e) => { resolve(e.data); w.terminate(); };
    w.onerror = (e) => reject(new Error(e.message || 'worker error'));
    w.postMessage(7);
  }));
  await probe('origin', () => location.origin);
  await probe('isSecureContext', () => window.isSecureContext);
  await probe('crossOriginIsolated', () => window.crossOriginIsolated);
  await probe('sharedArrayBuffer', () => typeof SharedArrayBuffer !== 'undefined');
  await probe('showOpenFilePicker', () => typeof window.showOpenFilePicker === 'function');
  await probe('decompressionStream', () => typeof DecompressionStream === 'function');
  await probe('webCodecsVideoEncoder', () => typeof VideoEncoder === 'function');
  await probe('webCrypto', () => !!(crypto && crypto.subtle));
  await probe('serviceWorker', () => 'serviceWorker' in navigator && !!navigator.serviceWorker);
  await probe('localStorage', () => { localStorage.setItem('s5-probe', location.pathname); return localStorage.getItem('s5-probe') === location.pathname; });
  await probe('indexedDB', () => new Promise((resolve) => {
    const req = indexedDB.open('s5-probe');
    req.onsuccess = () => { req.result.close(); resolve(true); };
    req.onerror = () => resolve(`error: ${req.error && req.error.name}`);
  }));

  window.S5 = result;
  document.getElementById('out').textContent = JSON.stringify(result, null, 2);
  document.body.dataset.ready = 'true';
})();
