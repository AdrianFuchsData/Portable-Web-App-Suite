import { EditorView, basicSetup } from "codemirror";
import { keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { python } from "@codemirror/lang-python";
import { markdown } from "@codemirror/lang-markdown";
import { marked } from "marked";
import DOMPurify from "dompurify";

const $ = (id) => document.getElementById(id);
const status = (text) => { $("status").textContent = text; };
const kernel = Suite.python.start({ onStatus: status, preloadImports: ["numpy", "pandas", "matplotlib.pyplot"] });
let executionCount = 0;
let fileName = "Untitled";
const cells = []; // {type, view, el, outputs, count, rendered}

// ---- outputs (nbformat 4) -------------------------------------------------------------------------

// HTML from outputs and Markdown may come from other people's notebooks: no scripts, no event handlers,
// and only embedded (data:/blob:) images and in-page links
const clean = (html) => DOMPurify.sanitize(html, { FORBID_TAGS: ["style"], FORBID_ATTR: ["srcset"], ALLOWED_URI_REGEXP: /^(?:data:image\/|blob:|#)/i });
const text = (v) => (Array.isArray(v) ? v.join("") : v || "");
const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, "");

function renderOutput(output) {
  const pre = (content, cls) => { const p = document.createElement("pre"); p.textContent = content; if (cls) p.className = cls; return p; };
  if (output.output_type === "stream") return pre(text(output.text), output.name === "stderr" ? "stderr" : "");
  if (output.output_type === "error") return pre(stripAnsi(text(output.traceback) || `${output.ename}: ${output.evalue}`), "error");
  const data = output.data || {};
  if (data["image/png"]) { const img = document.createElement("img"); img.src = `data:image/png;base64,${text(data["image/png"]).replace(/\s/g, "")}`; return img; }
  if (data["image/svg+xml"]) { const div = document.createElement("div"); div.innerHTML = clean(text(data["image/svg+xml"])); return div; }
  if (data["text/html"]) { const div = document.createElement("div"); div.innerHTML = clean(text(data["text/html"])); return div; }
  if (data["text/markdown"]) { const div = document.createElement("div"); div.innerHTML = clean(marked.parse(text(data["text/markdown"]))); return div; }
  return pre(text(data["text/plain"]));
}

function appendOutput(cell, output) {
  // merge consecutive stream outputs of the same kind (like Jupyter)
  const last = cell.outputs[cell.outputs.length - 1];
  if (output.output_type === "stream" && last && last.output_type === "stream" && last.name === output.name) {
    last.text = text(last.text) + output.text;
    cell.outputEl.lastChild.textContent = last.text;
    return;
  }
  cell.outputs.push(output);
  cell.outputEl.append(renderOutput(output));
}

// ---- cells ----------------------------------------------------------------------------------------

function select(cell) {
  for (const c of cells) c.el.classList.toggle("selected", c === cell);
}

function setPrompt(cell) {
  cell.promptEl.textContent = cell.type === "code" ? `[${cell.count ?? " "}]:` : "";
}

function renderMarkdown(cell) {
  cell.renderedEl.innerHTML = clean(marked.parse(cell.view.state.doc.toString()));
  cell.renderedEl.hidden = false;
  cell.editorEl.hidden = true;
  cell.rendered = true;
}

function editMarkdown(cell) {
  cell.renderedEl.hidden = true;
  cell.editorEl.hidden = false;
  cell.rendered = false;
  cell.view.focus();
}

function addCell(type = "code", source = "", after = null, { outputs = [], count = null } = {}) {
  const el = document.createElement("div");
  el.className = `cell ${type}`;
  el.innerHTML = '<div class="prompt"></div><div class="body"><div class="editor"></div><div class="rendered" hidden></div><div class="outputs"></div></div><div class="tools"><button data-a="up">↑</button><button data-a="down">↓</button><button data-a="delete">✕</button></div>';
  const cell = { type, el, outputs: [], count, rendered: false, promptEl: el.querySelector(".prompt"), editorEl: el.querySelector(".editor"), renderedEl: el.querySelector(".rendered"), outputEl: el.querySelector(".outputs") };
  const run = (advance) => () => { runCell(cell, advance); return true; };
  cell.view = new EditorView({
    parent: cell.editorEl,
    doc: source,
    extensions: [
      Prec.highest(keymap.of([{ key: "Shift-Enter", run: run(true) }, { key: "Mod-Enter", run: run(false) }])),
      basicSetup,
      type === "code" ? python() : markdown(),
      EditorView.lineWrapping,
      EditorView.updateListener.of((u) => { if (u.focusChanged && u.view.hasFocus) select(cell); }),
    ],
  });
  el.querySelector(".tools").onclick = (e) => {
    const action = e.target.dataset.a;
    const i = cells.indexOf(cell);
    if (action === "delete") { cells.splice(i, 1); el.remove(); }
    if (action === "up" && i > 0) { cells.splice(i, 1); cells.splice(i - 1, 0, cell); el.previousElementSibling.before(el); }
    if (action === "down" && i < cells.length - 1) { cells.splice(i, 1); cells.splice(i + 1, 0, cell); el.nextElementSibling.after(el); }
  };
  if (type === "markdown") cell.renderedEl.ondblclick = () => editMarkdown(cell);
  const index = after ? cells.indexOf(after) + 1 : cells.length;
  cells.splice(index, 0, cell);
  if (after) after.el.after(el); else $("cells").append(el);
  for (const o of outputs) appendOutput(cell, o);
  setPrompt(cell);
  if (type === "markdown" && source) renderMarkdown(cell);
  return cell;
}

async function runCell(cell, advance) {
  if (cell.type === "markdown") {
    renderMarkdown(cell);
  } else {
    cell.outputs = [];
    cell.outputEl.replaceChildren();
    cell.el.classList.add("running");
    const count = ++executionCount;
    try {
      await kernel.ready;
      status("busy");
      const code = cell.view.state.doc.toString();
      cell.count = count;
      await kernel.run(code, count, (output) => appendOutput(cell, output));
    } catch (e) {
      appendOutput(cell, { output_type: "error", ename: "KernelError", evalue: e.message, traceback: [e.message] });
    } finally {
      cell.el.classList.remove("running");
      setPrompt(cell);
      status("ready");
      refreshFiles();
    }
  }
  if (advance) {
    const next = cells[cells.indexOf(cell) + 1] || addCell("code", "", cell);
    select(next);
    if (next.type === "code" || !next.rendered) next.view.focus();
  }
}

// ---- notebook files (.ipynb, nbformat 4) ----------------------------------------------------------

function toNotebook() {
  const lines = (s) => s.split(/(?<=\n)/);
  return {
    cells: cells.map((c) => (c.type === "code"
      ? { cell_type: "code", execution_count: c.count, metadata: {}, outputs: c.outputs, source: lines(c.view.state.doc.toString()) }
      : { cell_type: "markdown", metadata: {}, source: lines(c.view.state.doc.toString()) })),
    metadata: {
      kernelspec: { name: "python3", display_name: "Python 3 (Pyodide)", language: "python" },
      language_info: { name: "python", file_extension: ".py", mimetype: "text/x-python" },
    },
    nbformat: 4,
    nbformat_minor: 5,
  };
}

function loadNotebook(nb) {
  for (const c of cells) c.el.remove();
  cells.length = 0;
  for (const c of nb.cells || []) {
    if (c.cell_type === "raw") continue;
    addCell(c.cell_type === "markdown" ? "markdown" : "code", text(c.source), null, { outputs: c.outputs || [], count: c.execution_count ?? null });
  }
  if (!cells.length) addCell();
}

$("open").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    loadNotebook(JSON.parse(await file.text()));
    fileName = file.name.replace(/\.ipynb$/i, "");
    status(file.name);
  } catch (err) { status(`error: ${err.message}`); }
  e.target.value = "";
};
function download(bytes, name, type = "application/octet-stream") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
$("save").onclick = () => download(JSON.stringify(toNotebook(), null, 1), `${fileName}.ipynb`, "application/x-ipynb+json");

// ---- toolbar, files -------------------------------------------------------------------------------

const selected = () => cells.find((c) => c.el.classList.contains("selected")) || cells[cells.length - 1];
$("add-code").onclick = () => addCell("code", "", selected()).view.focus();
$("add-markdown").onclick = () => editMarkdown(addCell("markdown", "", selected()));
$("run-all").onclick = async () => { for (const c of [...cells]) await runCell(c, false); };
const wheels = new Map(); // name -> bytes, re-installed after a restart (lost when the page is closed)
async function installWheel(name, bytes) {
  status(`installing ${name}…`);
  await kernel.ready;
  await kernel.installWheel(name, bytes.slice());
  wheels.set(name, bytes);
  status(`installed ${name}`);
}
$("wheel").onchange = async (e) => {
  for (const file of e.target.files) {
    try { await installWheel(file.name, new Uint8Array(await file.arrayBuffer())); } catch (err) { status(`error: ${err.message}`); }
  }
  e.target.value = "";
};
$("restart").onclick = async () => {
  executionCount = 0;
  status("restarting…");
  await kernel.restart();
  for (const [name, bytes] of wheels) await installWheel(name, bytes);
  status("ready");
  refreshFiles();
};
$("upload").onchange = async (e) => {
  for (const file of e.target.files) await kernel.writeFile(`/home/pyodide/${file.name}`, new Uint8Array(await file.arrayBuffer()));
  e.target.value = "";
  refreshFiles();
};
async function refreshFiles() {
  try {
    const files = await kernel.listFiles("/home/pyodide");
    $("file-list").replaceChildren(...files.filter((f) => !f.dir).map((f) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.textContent = f.name;
      a.title = `${f.size} bytes – click to download`;
      a.onclick = async () => download(await kernel.readFile(`/home/pyodide/${f.name}`), f.name);
      li.append(a);
      return li;
    }));
  } catch (e) { /* kernel not ready */ }
}

// ---- start ----------------------------------------------------------------------------------------

addCell("markdown", "# Python notebook\nRuns **completely in the browser** (Pyodide). `Shift+Enter` runs a cell.");
addCell("code", "import numpy as np\nimport pandas as pd\nimport matplotlib.pyplot as plt\n\ndf = pd.DataFrame({'x': np.arange(10), 'y': np.arange(10) ** 2})\ndf.head()");
const started = performance.now();
kernel.ready.then((info) => {
  status(`Python ${info.python}, Pyodide ${info.pyodide} started (${((performance.now() - started) / 1000).toFixed(1)} s), loading packages…`);
  refreshFiles();
  document.body.dataset.kernel = "ready";
}).catch((e) => status(`error: ${e.message}`));

window.S9 = { kernel, cells, addCell, runCell, toNotebook, loadNotebook, installWheel };
document.body.dataset.ready = "true";
