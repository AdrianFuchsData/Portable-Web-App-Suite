/*
 * Python kernel for the notebook: runs Pyodide in a worker (python-worker.js) with the files that build.py
 * embedded from vendor/pyodide/bundle.json (gzip + base64, decoded here once).
 *
 *   const kernel = Suite.python.start({ onStatus, onComm, onCall });   // onComm({ op, id, model, state }): widget models
 *                                                         // onCall(name, args) -> promise: calls of the Python module "suite"
 *                                                         // onSyncCall(name, args, bytes) -> promise of an object or Uint8Array:
 *                                                         //   synchronous calls (sockets, SSH; cross-origin isolated pages only)
 *   kernel.setRelay({ url, token } | null);               // requests through the relay without isolation (synchronous XHR)
 *   await kernel.widget(modelId, data, (output) => ...);  // a change in a widget (outputs of its callbacks)
 *   await kernel.ready;                                   // {python, pyodide}
 *   await kernel.run(code, count, (output) => ...);       // "ok" | "error"; outputs in nbformat 4
 *   kernel.canInterrupt / kernel.interrupt();             // KeyboardInterrupt in the running code (cross-origin isolated pages only)
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
  function start({ onStatus = () => {}, onComm = () => {}, onCall = null, onSyncCall = null, preloadImports = [] } = {}) {
    let worker = null;
    let nextId = 1;
    const pending = new Map();
    const kernel = {};
    // Pyodide checks this buffer while Python runs and raises KeyboardInterrupt when it holds 2 (SIGINT); a SharedArrayBuffer
    // is only available on cross-origin isolated pages (served with COOP/COEP headers, e.g. by the relay: relay.py --serve)
    const interruptBuffer = self.crossOriginIsolated && typeof SharedArrayBuffer === 'function' ? new Uint8Array(new SharedArrayBuffer(1)) : null;
    kernel.canInterrupt = !!interruptBuffer;
    // synchronous calls from Python (sockets, SSH): the worker waits on control[0]; answers up to 8 MiB
    const syncBuffers = interruptBuffer ? { control: new Int32Array(new SharedArrayBuffer(16)), data: new Uint8Array(new SharedArrayBuffer(8 * 1024 * 1024)) } : null;
    const cancelled = new Set();
    kernel.isolated = !!syncBuffers;
    let relayConfig = null;
    kernel.setRelay = (config) => { relayConfig = config; if (worker) worker.postMessage({ type: 'relay', ...(config || {}) }); };
    function answerSync(call, kind, bytes) {
      if (cancelled.delete(call)) return; // (the worker gave up waiting: interrupted)
      const { control, data } = syncBuffers;
      if (bytes.length > data.length) { kind = 2; bytes = new TextEncoder().encode('the answer is larger than 8 MiB'); }
      data.set(bytes);
      control[1] = kind;
      control[2] = bytes.length;
      control[3] = call;
      Atomics.store(control, 0, 1);
      Atomics.notify(control, 0);
    }
    // the buffer is written only while a cell's code runs (not while packages load); an interrupt before that waits for it
    let running = null; // id of the run request whose code is running
    let interruptPending = false;
    kernel.interrupt = () => {
      if (!interruptBuffer || ![...pending.values()].some((job) => job.type === 'run')) return false;
      if (running) interruptBuffer[0] = 2; else interruptPending = true;
      return true;
    };

    function request(type, payload = {}, onOutput = null, transfer = []) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { type, resolve, reject, onOutput });
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
        if (msg.type === 'sync-cancel') { cancelled.add(msg.call); return; }
        if (msg.type === 'sync-call') {
          Promise.resolve().then(() => (onSyncCall ? onSyncCall(msg.name, JSON.parse(msg.args), msg.bytes) : Promise.reject(new Error(`no call ${msg.name}`))))
            .then((result) => (result instanceof Uint8Array ? answerSync(msg.call, 1, result) : answerSync(msg.call, 0, new TextEncoder().encode(JSON.stringify(result ?? null)))),
              (err) => answerSync(msg.call, 2, new TextEncoder().encode(Suite.i18n ? Suite.i18n.describe(err) : String(err.message || err))));
          return;
        }
        if (msg.type === 'call') { // (from Python: the module "suite", shared/js/python-suite.py)
          const answer = (m) => worker.postMessage({ type: 'call-result', call: msg.call, ...m });
          Promise.resolve().then(() => (onCall ? onCall(msg.name, JSON.parse(msg.args)) : Promise.reject(new Error(`no page call ${msg.name}`))))
            .then((result) => answer({ ok: true, result }), (err) => answer({ ok: false, error: Suite.i18n ? Suite.i18n.describe(err) : String(err.message || err) }));
          return;
        }
        const job = pending.get(msg.id);
        if (!job) return;
        if (msg.type === 'output') { if (job.onOutput) job.onOutput(msg.output); return; }
        if (msg.type === 'running') {
          running = msg.id;
          if (interruptPending) { interruptPending = false; interruptBuffer[0] = 2; }
          return;
        }
        if (running === msg.id) running = null;
        pending.delete(msg.id);
        if (msg.type === 'done') job.resolve(msg.result);
        else job.reject(new Error(msg.error));
      };
      worker.onerror = (e) => onStatus(`worker error: ${e.message || e}`);
      const widgets = document.getElementById('python-widgets');
      // the package "suite": <script type="text/plain" id="python-suite"> (__init__.py) and id="python-suite-<module>" (<module>.py)
      const suite = Object.fromEntries([...document.querySelectorAll('script[id^="python-suite"]')].map((el) => [el.id === 'python-suite' ? '__init__.py' : `${el.id.slice('python-suite-'.length)}.py`, el.textContent]));
      const info = await request('init', { files, packages: meta.packages, wheels: meta.wheels || [], widgets: widgets ? widgets.textContent : '', suite, interruptBuffer, syncBuffers });
      if (relayConfig) worker.postMessage({ type: 'relay', ...relayConfig });
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
    kernel.mkdirs = (path) => request('mkdirs', { path });
    kernel.walk = (path) => request('walk', { path });
    kernel.removeTree = (path) => request('rmtree', { path });
    /** Stop a running cell or reset the state: terminates the worker and starts a new one. */
    kernel.restart = () => {
      worker.terminate();
      for (const job of pending.values()) job.reject(new Error('kernel restarted'));
      pending.clear();
      running = null;
      interruptPending = false;
      kernel.ready = boot();
      return kernel.ready;
    };
    kernel.ready = boot();
    return kernel;
  }

  Suite.python = { start };
})(window.Suite = window.Suite || {});
