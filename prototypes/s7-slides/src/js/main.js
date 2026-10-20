import Moveable from "moveable";
import { importPptx } from "app/pptx-import";
import { exportPptx } from "app/pptx-export";
import { renderSlide, renderElement, readText, SLIDE_CSS } from "app/slide-render";

const $ = (id) => document.getElementById(id);
const style = document.createElement("style");
style.textContent = SLIDE_CSS;
document.head.append(style);

const run = (text, size = 18, extra = {}) => ({ text, size, bold: false, italic: false, underline: false, strike: false, color: "#000000", font: "Calibri", ...extra });
const textElement = (id, x, y, w, h, paragraphs, extra = {}) => ({
  id, type: "text", name: id, x, y, w, h, rot: 0, geometry: "rect", fill: null, line: null,
  text: { anchor: "t", insets: [9.6, 4.8, 9.6, 4.8], paragraphs }, ...extra,
});
const NEW_DECK = () => ({
  width: 960, height: 540,
  slides: [{ id: "slide1", background: "#FFFFFF", elements: [
    textElement("title", 60, 180, 840, 100, [{ align: "ctr", level: 0, bullet: null, runs: [run("Click to edit the title", 40, { bold: true })] }]),
  ] }],
});

const state = { deck: NEW_DECK(), current: 0, selected: null, fileName: "Presentation", nextId: 1 };
let moveable = null;
let scale = 1;
const slide = () => state.deck.slides[state.current];
const findElement = (id) => slide().elements.find((e) => e.id === id);
const status = (text) => { $("status").textContent = text; };

// ---- rendering ------------------------------------------------------------------------------------

function renderThumbs() {
  const width = $("thumbs").clientWidth - 20;
  const s = width / state.deck.width;
  $("thumbs").replaceChildren(...state.deck.slides.map((sl, i) => {
    const t = document.createElement("div");
    t.className = `thumb${i === state.current ? " active" : ""}`;
    t.style.width = `${width}px`;
    t.style.height = `${state.deck.height * s}px`;
    const no = document.createElement("span");
    no.className = "no";
    no.textContent = i + 1;
    const view = renderSlide(sl, state.deck);
    view.style.transform = `scale(${s})`;
    t.append(no, view);
    t.onclick = () => { state.current = i; select(null); render(); };
    return t;
  }));
}

function renderStage() {
  const wrap = $("stage-wrap");
  scale = Math.min((wrap.clientWidth - 40) / state.deck.width, (wrap.clientHeight - 40) / state.deck.height);
  const view = renderSlide(slide(), state.deck);
  const stage = $("stage");
  stage.replaceChildren(view);
  stage.style.width = `${state.deck.width}px`;
  stage.style.height = `${state.deck.height}px`;
  stage.style.transform = `scale(${scale})`;
  // the scaled stage still occupies its unscaled size: compensate so that it stays centered
  stage.style.margin = `${(state.deck.height * (scale - 1)) / 2}px ${(state.deck.width * (scale - 1)) / 2}px`;
  view.addEventListener("pointerdown", (e) => {
    const target = e.target.closest(".el:not(.locked)");
    if (target && target.querySelector('[contenteditable="true"]')) return; // editing text
    select(target ? target.dataset.id : null);
  });
  view.addEventListener("dblclick", (e) => {
    const target = e.target.closest(".el:not(.locked)");
    if (target) editText(target.dataset.id);
  });
}

function render() {
  renderStage();
  renderThumbs();
  if (state.selected) select(state.selected);
}

function elementNode(id) {
  return $("stage").querySelector(`.el[data-id="${CSS.escape(id)}"]`);
}

function refreshElement(id) {
  const node = elementNode(id);
  const fresh = renderElement(findElement(id));
  node.replaceWith(fresh);
  renderThumbs();
  return fresh;
}

// ---- selection, moving, resizing, rotating --------------------------------------------------------

function select(id) {
  state.selected = id;
  if (moveable) { moveable.destroy(); moveable = null; }
  if (!id) return;
  const node = elementNode(id);
  if (!node) { state.selected = null; return; }
  const el = findElement(id);
  moveable = new Moveable(document.body, {
    target: node, draggable: true, resizable: true, rotatable: true, keepRatio: el.type === "image",
    throttleDrag: 0, throttleResize: 0, throttleRotate: 0, origin: false,
  });
  moveable.on("drag", (e) => { el.x = e.left; el.y = e.top; node.style.left = `${e.left}px`; node.style.top = `${e.top}px`; });
  moveable.on("resize", (e) => {
    el.w = e.width; el.h = e.height;
    el.x = e.drag.left; el.y = e.drag.top;
    Object.assign(node.style, { width: `${e.width}px`, height: `${e.height}px`, left: `${e.drag.left}px`, top: `${e.drag.top}px` });
  });
  moveable.on("resizeEnd", () => select(refreshElement(id).dataset.id));
  moveable.on("rotate", (e) => { el.rot = e.rotation; node.style.transform = e.transform; });
  for (const end of ["dragEnd", "rotateEnd"]) moveable.on(end, () => renderThumbs());
}

// ---- text editing ---------------------------------------------------------------------------------

function editText(id) {
  const el = findElement(id);
  if (!el.text) {
    el.text = { anchor: "ctr", insets: [9.6, 4.8, 9.6, 4.8], paragraphs: [{ align: "ctr", level: 0, bullet: null, runs: [run("", 18, { color: "#FFFFFF" })] }] };
    refreshElement(id);
  }
  if (moveable) { moveable.destroy(); moveable = null; }
  const box = elementNode(id).querySelector(".text");
  box.contentEditable = "true";
  box.focus();
  const range = document.createRange();
  range.selectNodeContents(box);
  range.collapse(false);
  getSelection().removeAllRanges();
  getSelection().addRange(range);
  box.addEventListener("blur", () => {
    box.contentEditable = "false";
    el.text = readText(box, el.text);
    refreshElement(id);
    select(id);
  }, { once: true });
}

// ---- commands -------------------------------------------------------------------------------------

function newId(prefix) { return `${prefix}-new${state.nextId++}`; }

function addElement(el) {
  slide().elements.push(el);
  renderStage();
  renderThumbs();
  select(el.id);
}

$("add-text").onclick = () => {
  const el = textElement(newId("text"), 100, 100, 400, 60, [{ align: "l", level: 0, bullet: null, runs: [run("New text", 24)] }]);
  addElement(el);
  editText(el.id);
};
for (const [button, geometry] of [["add-rect", "rect"], ["add-ellipse", "ellipse"]]) {
  $(button).onclick = () => addElement({ id: newId(geometry), type: "shape", name: geometry, x: 200, y: 150, w: 200, h: 120, rot: 0, geometry, fill: "#4472C4", line: { color: "#2F528F", width: 1.33 }, text: null });
}
$("add-slide").onclick = () => {
  state.deck.slides.splice(state.current + 1, 0, { id: newId("slide"), background: "#FFFFFF", elements: [] });
  state.current += 1;
  select(null);
  render();
};
$("delete").onclick = () => deleteSelection();
function deleteSelection() {
  if (state.selected) {
    slide().elements = slide().elements.filter((e) => e.id !== state.selected);
    select(null);
  } else if (state.deck.slides.length > 1) {
    state.deck.slides.splice(state.current, 1);
    state.current = Math.min(state.current, state.deck.slides.length - 1);
  }
  render();
}
function toggle(property, command) {
  const editing = document.activeElement && document.activeElement.isContentEditable;
  if (editing) { document.execCommand(command); return; }
  const el = state.selected && findElement(state.selected);
  if (!el || !el.text) return;
  const runs = el.text.paragraphs.flatMap((p) => p.runs);
  const value = !runs.every((r) => r[property]);
  runs.forEach((r) => { r[property] = value; });
  refreshElement(el.id);
  select(el.id);
}
$("bold").onmousedown = (e) => e.preventDefault(); // keep the text selection while editing
$("italic").onmousedown = (e) => e.preventDefault();
$("bold").onclick = () => toggle("bold", "bold");
$("italic").onclick = () => toggle("italic", "italic");

document.addEventListener("keydown", (e) => {
  if (!$("presenter").hidden) return;
  if (document.activeElement && document.activeElement.isContentEditable) return;
  if ((e.key === "Delete" || e.key === "Backspace") && state.selected) { e.preventDefault(); deleteSelection(); }
});

// ---- presenting -----------------------------------------------------------------------------------

const presenter = { index: 0 };
function showPresented() {
  const p = $("presenter");
  const view = renderSlide(state.deck.slides[presenter.index], state.deck);
  const s = Math.min(window.innerWidth / state.deck.width, window.innerHeight / state.deck.height);
  view.style.transform = `scale(${s})`;
  view.style.flex = "none";
  p.replaceChildren(view);
  p.dataset.index = presenter.index;
}
function present() {
  presenter.index = state.current;
  select(null);
  $("presenter").hidden = false;
  showPresented();
  if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
}
function endPresentation() {
  $("presenter").hidden = true;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
$("present").onclick = present;
$("presenter").onclick = () => step(1);
document.addEventListener("keydown", (e) => {
  if ($("presenter").hidden) return;
  if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) step(1);
  else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) step(-1);
  else if (e.key === "Escape") endPresentation();
});
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) $("presenter").hidden = true; });
function step(delta) {
  const next = presenter.index + delta;
  if (next >= state.deck.slides.length) { endPresentation(); return; }
  presenter.index = Math.max(0, next);
  showPresented();
}

// ---- files ----------------------------------------------------------------------------------------

async function openBuffer(buffer, name) {
  state.deck = importPptx(buffer);
  state.current = 0;
  state.fileName = name.replace(/\.[^.]+$/, "");
  select(null);
  render();
  status(`${name}: ${state.deck.slides.length} slides`);
}
$("open").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try { await openBuffer(await file.arrayBuffer(), file.name); } catch (err) { status(`error: ${err.message}`); }
  e.target.value = "";
};
$("save").onclick = async () => {
  const bytes = await exportPptx(state.deck, state.fileName);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes]));
  a.download = `${state.fileName}.pptx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
};
window.addEventListener("resize", () => render());

// for tests
window.S7 = {
  state, render, select, editText,
  async openBase64(b64, name) { await openBuffer(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer, name); },
  async exportBase64() {
    const bytes = await exportPptx(state.deck, state.fileName);
    let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  },
};
render();
document.body.dataset.ready = "true";
