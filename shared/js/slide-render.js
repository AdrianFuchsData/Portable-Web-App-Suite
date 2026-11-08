/*
 * Renders slides of the deck model (see pptx-import.js) as DOM: shapes as SVG, text as HTML (so that it
 * can be edited with contenteditable), images as <img>, tables as <table>. ES module, no dependencies.
 */

const SVG = "http://www.w3.org/2000/svg";

/** SVG path data for a preset geometry in a w x h box. */
function geometryPath(geometry, w, h) {
  const r = Math.min(w, h);
  switch (geometry) {
    case "ellipse":
      return `M0,${h / 2}A${w / 2},${h / 2} 0 1,0 ${w},${h / 2}A${w / 2},${h / 2} 0 1,0 0,${h / 2}Z`;
    case "roundRect": {
      const k = r * 0.1667;
      return `M${k},0H${w - k}A${k},${k} 0 0,1 ${w},${k}V${h - k}A${k},${k} 0 0,1 ${w - k},${h}H${k}A${k},${k} 0 0,1 0,${h - k}V${k}A${k},${k} 0 0,1 ${k},0Z`;
    }
    case "triangle": return `M${w / 2},0L${w},${h}L0,${h}Z`;
    case "rtTriangle": return `M0,0L${w},${h}L0,${h}Z`;
    case "diamond": return `M${w / 2},0L${w},${h / 2}L${w / 2},${h}L0,${h / 2}Z`;
    case "parallelogram": return `M${r * 0.25},0H${w}L${w - r * 0.25},${h}H0Z`;
    case "trapezoid": return `M${r * 0.25},0H${w - r * 0.25}L${w},${h}H0Z`;
    case "pentagon": return `M${w / 2},0L${w},${h * 0.38}L${w * 0.81},${h}H${w * 0.19}L0,${h * 0.38}Z`;
    case "hexagon": return `M${r * 0.25},0H${w - r * 0.25}L${w},${h / 2}L${w - r * 0.25},${h}H${r * 0.25}L0,${h / 2}Z`;
    case "rightArrow": return `M0,${h * 0.25}H${w - h / 2}V0L${w},${h / 2}L${w - h / 2},${h}V${h * 0.75}H0Z`;
    case "leftArrow": return `M${w},${h * 0.25}H${h / 2}V0L0,${h / 2}L${h / 2},${h}V${h * 0.75}H${w}Z`;
    case "star5": {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const f = i % 2 ? 0.38 : 1;
        pts.push(`${w / 2 + (w / 2) * f * Math.cos(a)},${h / 2 + (h / 2) * f * Math.sin(a)}`);
      }
      return `M${pts.join("L")}Z`;
    }
    case "line":
    case "straightConnector1":
    case "bentConnector3":
      return `M0,0L${w},${h}`;
    default: return `M0,0H${w}V${h}H0Z`;
  }
}

const ALIGN = { l: "left", ctr: "center", r: "right", just: "justify", dist: "justify" };
const ANCHOR = { t: "flex-start", ctr: "center", b: "flex-end" };

function autoNumber(type, n) {
  const roman = (v) => [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]]
    .reduce((s, [k, c]) => { while (v >= k) { s += c; v -= k; } return s; }, "");
  let label = String(n);
  if (/alpha/i.test(type)) label = String.fromCharCode(96 + ((n - 1) % 26) + 1);
  if (/roman/i.test(type)) label = roman(n);
  if (/Uc/.test(type)) label = label.toUpperCase();
  if (/ParenR/.test(type)) return label + ")";
  if (/ParenBoth/.test(type)) return `(${label})`;
  return label + ".";
}

/** Render the text model into a container element. */
/** The text a field shows: the number of the slide, or today's date (fields keep the text they had for other renderers). */
function fieldText(run, ctx) {
  if (run.field === "slidenum" && ctx.number) return String(ctx.number);
  if (run.field === "datetime") return new Date().toLocaleDateString(ctx.locale || undefined);
  return run.text;
}

/** The marker of a list paragraph (counters: the numbers of the levels so far, updated). */
function listMarker(para, counters) {
  const level = para.level || 0;
  counters[level] = para.bullet.auto ? (counters[level] || 0) + 1 : 0;
  counters.length = level + 1;
  return para.bullet.auto ? autoNumber(para.bullet.auto, counters[level]) : para.bullet.char || "•";
}

/** The properties of a paragraph element while it is edited (data-level, data-bullet, data-align; null: not set). */
export function paragraphProps(p) {
  if (!p || !p.dataset || p.dataset.level === undefined) return null;
  let bullet = null;
  try { bullet = p.dataset.bullet ? JSON.parse(p.dataset.bullet) : null; } catch (e) { bullet = null; }
  return { level: Math.max(0, Math.min(8, Number(p.dataset.level) || 0)), bullet, align: p.dataset.align || "l" };
}
/** Set the list properties of a paragraph element (then refreshLists). */
export function setParagraphProps(p, { level, bullet }) {
  if (level !== undefined) p.dataset.level = String(Math.max(0, Math.min(8, level)));
  if (bullet !== undefined) p.dataset.bullet = bullet ? JSON.stringify(bullet) : "";
  if (p.dataset.align === undefined) p.dataset.align = "l";
}

/**
 * Bring the markers and indents of the list paragraphs of an edited text up to date (after typing, Enter, Tab or a list command):
 * markers are only added, changed or removed where needed, so the caret stays where it is.
 */
export function refreshLists(container) {
  const counters = [];
  for (const p of container.children) {
    if (p.nodeName !== "P" && p.nodeName !== "DIV") continue;
    const props = paragraphProps(p) || { level: 0, bullet: null };
    const markers = [...p.children].filter((n) => n.classList.contains("bullet"));
    p.style.marginLeft = `${props.level * 0.5 + (props.bullet ? 0.3 : 0)}in`;
    if (!props.bullet) { counters.length = props.level; markers.forEach((m) => m.remove()); continue; }
    const text = listMarker(props, counters);
    const [marker, ...extra] = markers; // (a split paragraph may have taken a copy of the marker along)
    extra.forEach((m) => m.remove());
    if (marker && marker !== p.firstChild) p.prepend(marker);
    if (marker) { if (marker.textContent !== text) marker.textContent = text; continue; }
    const m = document.createElement("span");
    m.className = "bullet";
    m.contentEditable = "false";
    m.textContent = text;
    p.prepend(m);
  }
}

/** ctx: { number: the slide's number (1, 2, …), locale } – for slide number and date fields. */
export function renderText(container, text, ctx = {}) {
  container.replaceChildren();
  const counters = [];
  for (const para of text.paragraphs) {
    const p = document.createElement("p");
    p.style.textAlign = ALIGN[para.align] || "left";
    const firstSize = (para.runs.find((r) => r.text) || para.runs[0] || { size: 18 }).size;
    p.style.fontSize = `${firstSize}pt`;
    // the paragraph's properties travel with it while it is edited (the browser copies them to a paragraph split off with Enter)
    p.dataset.level = String(para.level || 0);
    p.dataset.bullet = para.bullet ? JSON.stringify(para.bullet) : "";
    p.dataset.align = para.align || "l";
    p.style.marginLeft = `${(para.level || 0) * 0.5 + (para.bullet ? 0.3 : 0)}in`;
    if (para.bullet) {
      const marker = document.createElement("span");
      marker.className = "bullet";
      marker.contentEditable = "false";
      marker.textContent = listMarker(para, counters);
      const run = para.runs[0] || {};
      if (run.color) marker.style.color = run.color;
      p.append(marker);
    } else {
      counters.length = para.level || 0;
    }
    for (const run of para.runs) {
      if (run.text === "\n") { p.append(document.createElement("br")); continue; }
      const span = document.createElement("span");
      span.textContent = run.field ? fieldText(run, ctx) : run.text;
      if (run.field) { span.dataset.field = run.field; if (run.fieldType) span.dataset.fieldType = run.fieldType; span.contentEditable = "false"; }
      span.style.fontSize = `${run.size}pt`;
      if (run.bold) span.style.fontWeight = "bold";
      if (run.italic) span.style.fontStyle = "italic";
      const deco = [run.underline && "underline", run.strike && "line-through"].filter(Boolean).join(" ");
      if (deco) span.style.textDecoration = deco;
      if (run.color) span.style.color = run.color;
      if (run.font) span.style.fontFamily = `"${run.font}", sans-serif`;
      p.append(span);
    }
    if (!para.runs.some((r) => r.text)) p.append(document.createElement("br"));
    container.append(p);
  }
}

/**
 * Read edited text back from the DOM (after contenteditable editing). Keeps the paragraph properties and
 * the formatting of the spans; new text without a span gets the formatting of its paragraph's first run.
 */
export function readText(container, previous) {
  const paragraphs = [];
  // Browsers may put typed text outside the paragraphs (Firefox after "select all" and typing):
  // consecutive inline nodes form a paragraph of their own.
  const blocks = [];
  let loose = null;
  for (const node of [...container.childNodes]) {
    if (node.nodeName === "P" || node.nodeName === "DIV") { blocks.push(node); loose = null; continue; }
    if (node.nodeName === "BR" && !loose) continue;
    if (!loose) { loose = document.createElement("p"); blocks.push(loose); }
    loose.append(node.cloneNode(true));
  }
  blocks.forEach((p, i) => {
    const old = previous.paragraphs[Math.min(i, previous.paragraphs.length - 1)] || { align: "l", level: 0, bullet: null, runs: [{ size: 18 }] };
    const base = { ...(old.runs[0] || { size: 18 }) };
    const runs = [];
    for (const node of p.childNodes) {
      if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains("bullet")) continue;
      if (node.nodeName === "BR") continue;
      const text = node.textContent;
      if (!text) continue;
      const s = node.nodeType === Node.ELEMENT_NODE ? node.style : null;
      const field = node.nodeType === Node.ELEMENT_NODE && node.dataset.field ? { field: node.dataset.field, ...(node.dataset.fieldType ? { fieldType: node.dataset.fieldType } : {}) } : {};
      runs.push({
        ...base, field: undefined, fieldType: undefined, text, ...field,
        ...(s ? {
          bold: s.fontWeight === "bold" || Number(s.fontWeight) >= 600 || node.closest("b,strong") !== null,
          italic: s.fontStyle === "italic" || node.closest("i,em") !== null,
          underline: /underline/.test(s.textDecoration),
          strike: /line-through/.test(s.textDecoration),
          size: parseFloat(s.fontSize) || base.size,
          color: s.color ? toHex(s.color) : base.color,
        } : {}),
      });
    }
    const props = paragraphProps(p); // (set while editing; otherwise the paragraph at the same place before)
    paragraphs.push({ align: props ? props.align : old.align, level: props ? props.level : old.level, bullet: props ? props.bullet : old.bullet, runs: runs.length ? runs : [{ ...base, text: "" }] });
  });
  return { ...previous, paragraphs };
}

function toHex(cssColor) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(cssColor);
  return m ? "#" + m.slice(1, 4).map((v) => Number(v).toString(16).padStart(2, "0")).join("").toUpperCase() : cssColor;
}

function textBox(el, ctx = {}) {
  const box = document.createElement("div");
  box.className = "text";
  const [l, t, r, b] = el.text.insets || [9.6, 4.8, 9.6, 4.8];
  Object.assign(box.style, { padding: `${t}px ${r}px ${b}px ${l}px`, justifyContent: ANCHOR[el.text.anchor] || "flex-start" });
  renderText(box, el.text, ctx);
  return box;
}

function table(el) {
  const t = document.createElement("table");
  const colgroup = document.createElement("colgroup");
  for (const w of el.table.columns) {
    const col = document.createElement("col");
    col.style.width = `${w}px`;
    colgroup.append(col);
  }
  t.append(colgroup);
  for (const row of el.table.rows) {
    const tr = document.createElement("tr");
    tr.style.height = `${row.height}px`;
    for (const cell of row.cells) {
      if (cell.hMerge || cell.vMerge) continue;
      const td = document.createElement("td");
      if (cell.span > 1) td.colSpan = cell.span;
      if (cell.fill) td.style.background = cell.fill;
      if (cell.text) renderText(td, cell.text);
      tr.append(td);
    }
    t.append(tr);
  }
  return t;
}

/** Render one element as an absolutely positioned div. */
export function renderElement(el, ctx = {}) {
  const div = document.createElement("div");
  div.className = `el el-${el.type}${el.locked ? " locked" : ""}`;
  div.dataset.id = el.id;
  Object.assign(div.style, {
    left: `${el.x}px`, top: `${el.y}px`, width: `${el.w}px`, height: `${el.h}px`,
    transform: `rotate(${el.rot || 0}deg)${el.flipH ? " scaleX(-1)" : ""}${el.flipV ? " scaleY(-1)" : ""}`,
  });
  if (el.type === "shape" || ((el.fill || el.line) && el.type === "text")) {
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("width", el.w);
    svg.setAttribute("height", el.h);
    svg.setAttribute("overflow", "visible");
    const shape = document.createElementNS(SVG, "path");
    shape.setAttribute("d", geometryPath(el.geometry, el.w, el.h));
    shape.setAttribute("fill", el.fill || "none");
    if (el.line) {
      shape.setAttribute("stroke", el.line.color || "#000000");
      shape.setAttribute("stroke-width", el.line.width || 1);
    }
    svg.append(shape);
    div.append(svg);
  }
  if (el.type === "image") {
    const img = document.createElement("img");
    img.src = el.image.src;
    img.alt = el.name || "";
    img.draggable = false;
    const c = el.image.crop; // { l, t, r, b }: the parts cut off (fractions of the picture)
    if (c && (c.l || c.t || c.r || c.b)) {
      const fw = el.w / Math.max(0.05, 1 - c.l - c.r), fh = el.h / Math.max(0.05, 1 - c.t - c.b);
      Object.assign(img.style, { width: `${fw}px`, height: `${fh}px`, left: `${-c.l * fw}px`, top: `${-c.t * fh}px`, right: "auto", bottom: "auto" });
      div.style.overflow = "hidden";
    }
    div.append(img);
  }
  if (el.type === "media" && el.media) {
    // video: its first frame (or poster) on the slide, playable with controls in the show (ctx.play); audio: a speaker symbol
    const video = el.media.kind === "video";
    const player = document.createElement(video ? "video" : "audio");
    player.src = el.media.src;
    player.preload = "metadata";
    if (el.media.poster) player.poster = el.media.poster;
    player.setAttribute("playsinline", "");
    if (ctx.play) player.controls = true;
    if (!video) {
      const icon = document.createElement("span");
      icon.className = "media-icon";
      icon.textContent = "🔊";
      div.append(icon);
    }
    div.append(player);
    div.classList.toggle("playable", !!ctx.play);
  }
  if (el.type === "table") div.append(table(el));
  if (el.text) div.append(textBox(el, ctx));
  return div;
}

/** Render a slide; returns a div of the deck's size (scale it with CSS transforms). ctx: { number, locale } for fields. */
export function renderSlide(slide, deck, ctx = {}) {
  const div = document.createElement("div");
  div.className = "slide";
  Object.assign(div.style, { width: `${deck.width}px`, height: `${deck.height}px`, background: slide.background || "#FFFFFF" });
  for (const el of slide.elements) div.append(renderElement(el, ctx));
  return div;
}

/** CSS the rendered slides need (insert once into the page). */
export const SLIDE_CSS = `
.slide { position: relative; overflow: hidden; color: #000; font-family: Calibri, Carlito, "Liberation Sans", Arial, sans-serif; line-height: 1.15; }
.slide .el { position: absolute; box-sizing: border-box; transform-origin: center center; }
.slide .el.locked { pointer-events: none; }
.slide .el > svg { position: absolute; inset: 0; }
.slide .el > img { position: absolute; inset: 0; width: 100%; height: 100%; }
.slide .el-media { background: #000; }
.slide .el-media > video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
.slide .el-media > audio { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; display: none; }
.slide .el-media.playable > video, .slide .el-media.playable > audio { pointer-events: auto; display: block; }
.slide .el-media .media-icon { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 48px; color: #fff; }
.slide .text { position: absolute; inset: 0; display: flex; flex-direction: column; box-sizing: border-box; overflow: visible; outline: none; word-wrap: break-word; }
.slide .text p { margin: 0; position: relative; }
.slide .text .bullet { position: absolute; margin-left: -0.3in; width: 0.3in; user-select: none; }
.slide table { border-collapse: collapse; width: 100%; height: 100%; table-layout: fixed; }
.slide td { border: 1px solid #FFFFFF; background: #CFD5EA; padding: 4px 8px; vertical-align: top; overflow: hidden; }
.slide tr:first-of-type td { background: #4472C4; color: #FFFFFF; font-weight: bold; }
`;
