/*
 * Python kernel worker. python-kernel.js starts it as a classic worker from a Blob URL that contains
 * pyodide.classic.js + pyodide.asm.classic.js + this file: on file:// pages, workers cannot load ES modules
 * (no module workers from Blob URLs in Chromium, no import()/importScripts() of Blob URLs in workers).
 *
 * Messages from the page:  {id, type: "init", files: {name: Blob}, packages, wheels, widgets: source of ipywidgets}
 *                          {id, type: "run", code, count} | {id, type: "widget", model, data} (a change in a widget)
 *                          {id, type: "write", path, data: Uint8Array} | {id, type: "read", path} | {id, type: "list", path}
 *                          {id, type: "installWheel", name, data: Uint8Array}
 * Messages to the page:    {id, type: "status", text} | {id, type: "output", output} | {id, type: "done", result} |
 *                          {id, type: "fail", error} | {type: "comm", msg: {op, id, model, state}} (widget models)
 * Outputs use the Jupyter notebook format (nbformat 4): stream, execute_result, display_data, error.
 */

const BASE = "https://pyodide.invalid/"; // never contacted: fetch() is answered from the embedded files
let pyodide = null;
let current = null; // id of the running request (for streamed outputs)

const post = (msg) => self.postMessage(msg);
const log = [];
const callbacks = {
  messageCallback: (m) => { log.push(m); if (/^Loading /.test(m)) post({ type: "status", text: m }); },
  errorCallback: (m) => { log.push(m); post({ type: "status", text: m }); },
};

const KERNEL = String.raw`
import ast, base64, io, json, os, sys, traceback, types, warnings
os.environ["MPLBACKEND"] = "module://_suite_inline"
from pyodide.code import eval_code_async

_ns = {"__name__": "__main__", "__builtins__": __builtins__}

def _emit(output):
    # while an ipywidgets Output captures ("with out:"), outputs go into it
    widgets = sys.modules.get("ipywidgets")
    if widgets is not None and getattr(widgets, "_route", None) and widgets._route(output):
        return
    _post(json.dumps(output))

def _mime(obj):
    bundle = getattr(obj, "_repr_mimebundle_", None)
    if callable(bundle) and not isinstance(obj, type):
        try:
            data = bundle()
            if isinstance(data, tuple):
                data = data[0]
            if data:
                return {"text/plain": repr(obj), **data}
        except Exception:
            pass
    data = {"text/plain": repr(obj)}
    for meth, mime in (("_repr_html_", "text/html"), ("_repr_markdown_", "text/markdown"),
                       ("_repr_svg_", "image/svg+xml"), ("_repr_png_", "image/png"), ("_repr_latex_", "text/latex")):
        f = getattr(obj, meth, None)
        if callable(f):
            try:
                r = f()
            except Exception:
                r = None
            if r is not None:
                if mime == "image/png" and isinstance(r, (bytes, bytearray)):
                    r = base64.b64encode(r).decode()
                data[mime] = r
    return data

def display(*objs, **kwargs):
    for obj in objs:
        _emit({"output_type": "display_data", "data": _mime(obj), "metadata": {}})

def clear_output(wait=False):
    widgets = sys.modules.get("ipywidgets")
    if widgets is not None and widgets._capture:
        widgets._capture[-1][0].clear_output()
    else:
        _post(json.dumps({"output_type": "clear_output", "wait": bool(wait)}))

def flush_figures():
    plt = sys.modules.get("matplotlib.pyplot")
    if plt is None:
        return
    for num in plt.get_fignums():
        buf = io.BytesIO()
        with warnings.catch_warnings():  # internal deprecation warnings of the Agg renderer
            warnings.simplefilter("ignore", DeprecationWarning)
            plt.figure(num).savefig(buf, format="png", bbox_inches="tight", dpi=100)
        _emit({"output_type": "display_data", "data": {"image/png": base64.b64encode(buf.getvalue()).decode(),
               "text/plain": f"<Figure {num}>"}, "metadata": {}})
    plt.close("all")

# inline matplotlib backend: plt.show() and the end of a cell send the figures as PNG. It is a real module
# file, so that matplotlib is only imported when it is used.
_kernel = types.ModuleType("_suite_kernel")
_kernel.flush_figures = flush_figures
_kernel.display = display
_kernel.mime = _mime
_kernel.post_comm = lambda text: _post_comm(text)
sys.modules["_suite_kernel"] = _kernel
os.makedirs("/tmp/suite", exist_ok=True)
with open("/tmp/suite/_suite_inline.py", "w") as _f:
    _f.write("from matplotlib.backends.backend_agg import FigureCanvasAgg as FigureCanvas\n"
             "def show(*args, **kwargs):\n"
             "    import _suite_kernel\n"
             "    _suite_kernel.flush_figures()\n")
sys.path.insert(0, "/tmp/suite")

# pykeepass imports pycryptodomex ("Cryptodome"), which has no Pyodide build; pycryptodome ("Crypto") is the
# same library under another name
import importlib, importlib.abc, importlib.util
class _CryptodomeAlias(importlib.abc.MetaPathFinder, importlib.abc.Loader):
    def find_spec(self, name, path=None, target=None):
        if name == "Cryptodome" or name.startswith("Cryptodome."):
            return importlib.util.spec_from_loader(name, self, is_package=True)
        return None
    def create_module(self, spec):
        return importlib.import_module("Crypto" + spec.name[len("Cryptodome"):])
    def exec_module(self, module):
        pass
sys.meta_path.append(_CryptodomeAlias())

# argon2-cffi computes parallel lanes in threads, which this WebAssembly build cannot start ("Threading
# failure"). After argon2.low_level is imported, hash_secret_raw is replaced by hash-wasm's single-threaded
# Argon2 (same results), called synchronously through JSPI (pyodide.ffi.run_sync).
def _patch_argon2(module):
    def hash_secret_raw(secret, salt, time_cost, memory_cost, parallelism, hash_len, type, version=19):
        import js
        from pyodide.ffi import run_sync, to_js
        name = {0: "argon2d", 1: "argon2i", 2: "argon2id"}[getattr(type, "value", type)]
        options = to_js({"password": to_js(bytes(secret)), "salt": to_js(bytes(salt)), "iterations": time_cost,
                         "memorySize": memory_cost, "parallelism": parallelism, "hashLength": hash_len,
                         "outputType": "binary"}, dict_converter=js.Object.fromEntries)
        return bytes(run_sync(getattr(js.hashwasm, name)(options)).to_py())
    module.hash_secret_raw = hash_secret_raw

class _PatchAfterImport(importlib.abc.MetaPathFinder):
    def find_spec(self, name, path=None, target=None):
        if name != "argon2.low_level":
            return None
        import importlib.machinery
        spec = importlib.machinery.PathFinder.find_spec(name, path)
        if spec is None:
            return None
        original = spec.loader.exec_module
        def exec_module(module):
            original(module)
            _patch_argon2(module)
        spec.loader.exec_module = exec_module
        return spec
sys.meta_path.insert(0, _PatchAfterImport())

# Packages are loaded on first import. Pyodide only sees the imports written in a cell; this hook also
# covers indirect imports (e.g. pandas importing openpyxl): a missing module of a bundled package loads the
# package synchronously (JSPI) and the import continues.
class _LoadOnImport(importlib.abc.MetaPathFinder):
    def find_spec(self, name, path=None, target=None):
        package = _import_map.get(name.split(".")[0])
        if package is None or package in _loaded:
            return None
        from pyodide.ffi import run_sync, can_run_sync
        if not can_run_sync():
            return None
        _loaded.add(package)
        run_sync(_load_package(package))
        importlib.invalidate_caches()
        return importlib.machinery.PathFinder.find_spec(name, path)
import importlib.machinery
_loaded = set()
sys.meta_path.append(_LoadOnImport())

_ns["display"] = display

# a small IPython.display for notebooks written for Jupyter (display, clear_output, HTML, Markdown, …)
class _Rich:
    def __init__(self, data=None, url=None, filename=None, **kwargs):
        if filename is not None:
            with open(filename, "rb" if self._binary else "r") as f:
                data = f.read()
        self.data = data
    _binary = False
class HTML(_Rich):
    def _repr_html_(self): return self.data
class Markdown(_Rich):
    def _repr_markdown_(self): return self.data
class Latex(_Rich):
    def _repr_latex_(self): return self.data
class SVG(_Rich):
    def _repr_svg_(self): return self.data.decode() if isinstance(self.data, bytes) else self.data
class Image(_Rich):
    _binary = True
    def _repr_png_(self): return self.data
class JSON(_Rich):
    def _repr_mimebundle_(self): return {"application/json": self.data, "text/plain": json.dumps(self.data, indent=1)}
_ipython = types.ModuleType("IPython")
_ipython_display = types.ModuleType("IPython.display")
for _name, _value in {"display": display, "clear_output": clear_output, "HTML": HTML, "Markdown": Markdown, "Latex": Latex,
                      "SVG": SVG, "Image": Image, "JSON": JSON}.items():
    setattr(_ipython_display, _name, _value)
_ipython.display = _ipython_display
_ipython.get_ipython = lambda: None
_ipython.version_info = (8, 0, 0)
_ipython.__version__ = "8.0.0"
_ipython.__path__ = []
# only importable (not in sys.modules from the start: libraries such as matplotlib change their behaviour when IPython is loaded)
class _IPythonStub(importlib.abc.MetaPathFinder, importlib.abc.Loader):
    _modules = {"IPython": _ipython, "IPython.display": _ipython_display}
    def find_spec(self, name, path=None, target=None):
        return importlib.util.spec_from_loader(name, self, is_package=name == "IPython") if name in self._modules else None
    def create_module(self, spec):
        return self._modules[spec.name]
    def exec_module(self, module):
        pass
sys.meta_path.append(_IPythonStub())

def _widget_event(model_id, data):
    import ipywidgets
    try:
        ipywidgets._handle(model_id, json.loads(data))
    except BaseException as e:
        frames = [f for f in traceback.extract_tb(e.__traceback__) if f.filename.startswith("<cell")]
        lines = (["Traceback (most recent call last):\n"] + traceback.format_list(frames) if frames else []) + traceback.format_exception_only(type(e), e)
        _emit({"output_type": "error", "ename": type(e).__name__, "evalue": str(e), "traceback": lines})
    flush_figures()

async def _run(code, count):
    try:
        result = await eval_code_async(code, _ns, return_mode="last_expr", filename=f"<cell {count}>")
        flush_figures()
        if result is not None:
            _ns["_"] = result
            _emit({"output_type": "execute_result", "execution_count": count, "data": _mime(result), "metadata": {}})
        return "ok"
    except BaseException as e:
        flush_figures()
        frames = [f for f in traceback.extract_tb(e.__traceback__) if f.filename.startswith("<cell")]
        lines = ["Traceback (most recent call last):\n"] + traceback.format_list(frames) if frames else []
        lines += traceback.format_exception_only(type(e), e)
        _emit({"output_type": "error", "ename": type(e).__name__, "evalue": str(e), "traceback": lines})
        return "error"

def _shape(v):
    shape = getattr(v, "shape", None)
    if isinstance(shape, tuple):
        return " × ".join(str(n) for n in shape)
    try:
        return str(len(v)) if not isinstance(v, (str, bytes)) else ""
    except Exception:
        return ""

def _variables():
    out = []
    for name, v in list(_ns.items()):
        if name.startswith("_") or isinstance(v, (types.ModuleType, types.FunctionType, types.BuiltinFunctionType, type)):
            continue
        t = type(v)
        kind = t.__name__ if t.__module__ == "builtins" else f"{t.__module__.split('.')[0]}.{t.__name__}"
        dtype = getattr(v, "dtype", None)
        try:
            if hasattr(v, "columns") and hasattr(v, "shape"):
                text = ", ".join(str(c) for c in list(v.columns)[:20])
            else:
                text = repr(v)
        except Exception as e:
            text = f"<{type(e).__name__}>"
        out.append({"name": name, "type": kind, "shape": _shape(v), "dtype": str(dtype) if dtype is not None else "",
                    "value": text if len(text) <= 200 else text[:200] + "…", "table": hasattr(v, "to_html") or (hasattr(v, "ndim") and getattr(v, "ndim", 0) in (1, 2))})
    return json.dumps(sorted(out, key=lambda x: x["name"].lower()))

def _table(name, rows=500):
    v = _ns[name]
    if not hasattr(v, "to_html"):
        import pandas
        v = pandas.DataFrame(v)
    return v.to_html(max_rows=rows, max_cols=50, border=0)
`;

function stream(name) {
  const decoder = new TextDecoder();
  return {
    write(buffer) {
      post({ id: current, type: "output", output: { output_type: "stream", name, text: decoder.decode(buffer, { stream: true }) } });
      return buffer.length;
    },
  };
}

async function init({ files, packages, wheels, widgets }) {
  const networkFetch = self.fetch.bind(self);
  self.fetch = async (input, options) => {
    const url = input instanceof Request ? input.url : String(input); // string or URL object
    // Pyodide's own files come from the embedded bundle; other URLs (e.g. requests in user code) go to the network
    if (!url.startsWith(BASE)) return networkFetch(input, options);
    const name = decodeURIComponent(url.split("?")[0].split("/").pop());
    const blob = files[name];
    if (!blob) throw new TypeError(`not in the bundle: ${url}`);
    return new Response(blob, { status: 200, headers: { "Content-Type": name.endsWith(".wasm") ? "application/wasm" : "application/octet-stream" } });
  };
  post({ type: "status", text: "starting Python" });
  // loadPyodide and _createPyodideModule are defined by the classic versions of Pyodide's modules,
  // which python-kernel.js puts in front of this script
  pyodide = await self.loadPyodide({
    indexURL: BASE,
    packageBaseUrl: BASE,
    createPyodideModule: self._createPyodideModule,
    lockFileContents: JSON.parse(await files["pyodide-lock.json"].text()),
    stdout: undefined,
  });
  pyodide.setStdout(stream("stdout"));
  pyodide.setStderr(stream("stderr"));
  post({ type: "status", text: `loading ${packages.join(", ")}` });
  // packages are loaded when a cell imports them (loadPackagesFromImports in "run"); extra PyPI wheels
  // of the bundle are installed at start because Pyodide cannot map their imports
  for (const wheel of wheels || []) await pyodide.loadPackage(BASE + wheel, callbacks);
  pyodide.globals.set("_post", (json) => post({ id: current, type: "output", output: JSON.parse(json) }));
  pyodide.globals.set("_post_comm", (json) => post({ type: "comm", msg: JSON.parse(json) }));
  const lock = JSON.parse(await files["pyodide-lock.json"].text());
  const importMap = {};
  for (const [name, entry] of Object.entries(lock.packages)) for (const imp of entry.imports || []) importMap[imp] = name;
  pyodide.globals.set("_import_map", pyodide.toPy(importMap));
  pyodide.globals.set("_load_package", (name) => pyodide.loadPackage(name, callbacks));
  pyodide.runPython(KERNEL);
  if (widgets) pyodide.FS.writeFile("/tmp/suite/ipywidgets.py", widgets); // imported when a cell uses it
  pyodide.FS.mkdirTree("/home/pyodide");
  pyodide.FS.chdir("/home/pyodide");
  return { python: pyodide.runPython("import sys; sys.version.split()[0]"), pyodide: pyodide.version, log };
}

const handlers = {
  init,
  async run({ code, count }) {
    await pyodide.loadPackagesFromImports(code, callbacks);
    const run = pyodide.globals.get("_run");
    try { return await run(code, count); } finally { run.destroy(); }
  },
  /** A change in a widget on the page (value, index, click …); outputs of the callbacks go to this request. */
  widget({ model, data }) {
    const f = pyodide.globals.get("_widget_event");
    try { f(model, JSON.stringify(data)); } finally { f.destroy(); }
    return true;
  },
  /** Load packages ahead of time (in the background after start-up). */
  async preload({ packages, imports }) {
    await pyodide.loadPackage(packages, callbacks);
    // importing initializes the compiled extension modules, which takes most of the time
    for (const name of imports || []) {
      post({ type: "status", text: `importing ${name}` });
      await pyodide.runPythonAsync(`import ${name}`);
    }
    return packages;
  },
  write({ path, data }) { pyodide.FS.writeFile(path, data); return true; },
  /** Delete a file or an empty folder. */
  remove({ path }) {
    const FS = pyodide.FS;
    if (FS.isDir(FS.stat(path).mode)) FS.rmdir(path); else FS.unlink(path);
    return true;
  },
  /** Install a wheel file (pure Python, or built for Pyodide's Emscripten platform) without network access. */
  async installWheel({ name, data }) {
    pyodide.FS.mkdirTree("/tmp/wheels");
    const path = `/tmp/wheels/${name}`;
    pyodide.FS.writeFile(path, data);
    await pyodide.loadPackage("micropip", callbacks);
    const micropip = pyodide.pyimport("micropip");
    try {
      await micropip.install(`emfs:${path}`, { deps: false });
    } finally {
      micropip.destroy();
    }
    return name;
  },
  read({ path }) { return pyodide.FS.readFile(path); },
  /** The user's variables: [{ name, type, shape, dtype, value, table }] (no modules, functions or classes). */
  variables() { const f = pyodide.globals.get("_variables"); try { return JSON.parse(f()); } finally { f.destroy(); } },
  /** A DataFrame, Series or array as an HTML table (at most 500 rows). */
  async table({ name }) { await pyodide.loadPackage("pandas", callbacks); const f = pyodide.globals.get("_table"); try { return f(name); } finally { f.destroy(); } },
  list({ path }) {
    return pyodide.FS.readdir(path).filter((n) => n !== "." && n !== "..").map((name) => {
      const stat = pyodide.FS.stat(`${path}/${name}`);
      return { name, size: stat.size, dir: pyodide.FS.isDir(stat.mode) };
    });
  },
};

// requests are processed one after another (like a Jupyter kernel)
let queue = Promise.resolve();
self.onmessage = (event) => {
  const msg = event.data;
  queue = queue.then(async () => {
    current = msg.id;
    try {
      post({ id: msg.id, type: "done", result: await handlers[msg.type](msg) });
    } catch (e) {
      post({ id: msg.id, type: "fail", error: String(e && e.message ? e.message : e) });
    }
  });
};
