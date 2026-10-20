/*
 * Python kernel for the notebook: runs Pyodide in a worker (python-worker.js) with the files that build.py
 * embedded from vendor/pyodide/bundle.json (gzip + base64, decoded here once).
 *
 *   const kernel = Suite.python.start({ onStatus, onComm });        // onComm({ op, id, model, state }): widget models
 *   await kernel.widget(modelId, data, (output) => ...);  // a change in a widget (outputs of its callbacks)
 *   await kernel.ready;                                   // {python, pyodide}
 *   await kernel.run(code, count, (output) => ...);       // "ok" | "error"; outputs in nbformat 4
 *   kernel.restart();  kernel.writeFile(path, bytes);  kernel.installWheel(name, bytes);  kernel.readFile(path);  kernel.listFiles(path);  kernel.removeFile(path)
 *   await kernel.variables();                             // [{ name, type, shape, dtype, value, table }] of the user namespace
 *   await kernel.table(name);                             // a DataFrame/Series/array as an HTML table
 */
(function (Suite) {
  'use strict';

  let filesPromise = null;

  async function gunzip(text) {
    const binary = atob(text.trim());
    const packed = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) packed[i] = binary.charCodeAt(i);
    return new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).blob();
  }

  /** Decode the embedded files once (Blobs can be sent to the worker without copying). */
  function embeddedFiles() {
    if (!filesPromise) {
      filesPromise = (async () => {
        const files = {};
        await Promise.all([...document.querySelectorAll('script[data-bundle-file]')].map(async (el) => {
          files[el.dataset.bundleFile] = await gunzip(el.textContent);
          el.textContent = ''; // free the base64 text
        }));
        const meta = JSON.parse(document.getElementById('bundle-meta').textContent);
        return { files, meta };
      })();
    }
    return filesPromise;
  }

  /** preloadImports: modules imported in the background after start-up (e.g. ["numpy", "pandas"]). */
  function start({ onStatus = () => {}, onComm = () => {}, preloadImports = [] } = {}) {
    let worker = null;
    let nextId = 1;
    const pending = new Map();
    const kernel = {};

    function request(type, payload = {}, onOutput = null, transfer = []) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject, onOutput });
        worker.postMessage({ id, type, ...payload }, transfer);
      });
    }

    async function boot() {
      const { files, meta } = await embeddedFiles();
      // one classic script: Pyodide (converted to classic scripts) + the kernel worker code
      // extra classic scripts for the worker: embedded as <script type="text/plain" id="worker-...">
      const extra = [...document.querySelectorAll('script[type="text/plain"][id^="worker-"]')].map((el) => el.textContent);
      const source = [files['pyodide.classic.js'], files['pyodide.asm.classic.js'], ...extra, document.getElementById('python-worker').textContent];
      const url = URL.createObjectURL(new Blob(source.flatMap((part) => [part, '\n']), { type: 'text/javascript' }));
      worker = new Worker(url);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      worker.onmessage = (event) => {
        const msg = event.data;
        if (msg.type === 'status') { onStatus(msg.text); return; }
        if (msg.type === 'comm') { onComm(msg.msg); return; }
        const job = pending.get(msg.id);
        if (!job) return;
        if (msg.type === 'output') { if (job.onOutput) job.onOutput(msg.output); return; }
        pending.delete(msg.id);
        if (msg.type === 'done') job.resolve(msg.result);
        else job.reject(new Error(msg.error));
      };
      worker.onerror = (e) => onStatus(`worker error: ${e.message || e}`);
      const widgets = document.getElementById('python-widgets');
      const info = await request('init', { files, packages: meta.packages, wheels: meta.wheels || [], widgets: widgets ? widgets.textContent : '' });
      // load the bundled packages in the background; a cell that runs meanwhile waits for it (requests are queued)
      request('preload', { packages: meta.preload || meta.packages, imports: preloadImports }).then(() => onStatus('ready'), () => {});
      return info;
    }

    kernel.run = (code, count, onOutput) => request('run', { code, count }, onOutput);
    kernel.widget = (model, data, onOutput) => request('widget', { model, data }, onOutput);
    kernel.writeFile = (path, data) => request('write', { path, data });
    kernel.installWheel = (name, data) => request('installWheel', { name, data });
    kernel.readFile = (path) => request('read', { path });
    kernel.variables = () => request('variables');
    kernel.table = (name) => request('table', { name });
    kernel.listFiles = (path = '/home/pyodide') => request('list', { path });
    kernel.removeFile = (path) => request('remove', { path });
    /** Stop a running cell or reset the state: terminates the worker and starts a new one. */
    kernel.restart = () => {
      worker.terminate();
      for (const job of pending.values()) job.reject(new Error('kernel restarted'));
      pending.clear();
      kernel.ready = boot();
      return kernel.ready;
    };
    kernel.ready = boot();
    return kernel;
  }

  Suite.python = { start };
})(window.Suite = window.Suite || {});
