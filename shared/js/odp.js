/*
 * OpenDocument presentations (ODP, LibreOffice Impress) for the presentation editor. ES module; needs fflate.
 *
 *   readOdp(buffer) -> deck (the model of pptx-import.js)
 *   writeOdp(deck) -> Uint8Array
 *
 * Read: page size (the first master's page layout), pages in order with their background (drawing-page style, else the master's),
 * hidden pages (presentation:visibility), the master's own shapes as locked decorations; text frames, custom shapes (enhanced
 * geometry type), rectangles, ellipses and lines, pictures (also the replacement picture of an embedded object such as a chart),
 * tables, groups (members share a group id); position, size and rotation (draw:transform); fill and line of the graphic style chain;
 * text: paragraphs, lists with levels (bullets and numbers), alignment, spans with bold, italic, underline, strike, size, colour and
 * font from the style chain (presentation styles of LibreOffice's placeholders included), line breaks, tabs, slide number and date
 * fields; vertical alignment and padding; speaker notes. Not read: transitions, animations, gradients, custom shape paths.
 * Write: the same features (shapes as draw:custom-shape with draw:enhanced-geometry draw:type, text boxes as draw:frame/draw:text-box).
 */
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";

const NS = {
  office: "urn:oasis:names:tc:opendocument:xmlns:office:1.0", style: "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
  text: "urn:oasis:names:tc:opendocument:xmlns:text:1.0", table: "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
  draw: "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0", fo: "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0",
  xlink: "http://www.w3.org/1999/xlink", svg: "urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0",
  presentation: "urn:oasis:names:tc:opendocument:xmlns:presentation:1.0", loext: "urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0",
};
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp", svg: "image/svg+xml", webp: "image/webp" };
const MEDIA = { mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", ogv: "video/ogg", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", flac: "audio/flac" };
const MEDIA_EXT = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/ogg": "ogv", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "ogg", "audio/flac": "flac" };
// draw:type of the enhanced geometry <-> the deck's preset geometry
const GEOMETRY = {
  rectangle: "rect", "round-rectangle": "roundRect", ellipse: "ellipse", "isosceles-triangle": "triangle", "right-triangle": "rtTriangle",
  diamond: "diamond", parallelogram: "parallelogram", trapezoid: "trapezoid", pentagon: "pentagon", hexagon: "hexagon",
  "right-arrow": "rightArrow", "left-arrow": "leftArrow", star5: "star5", "mso-spt100": "rect",
};
const PRESETS = new Set(["rect", "roundRect", "ellipse", "triangle", "rtTriangle", "diamond", "parallelogram", "trapezoid", "pentagon", "hexagon", "rightArrow", "leftArrow", "star5", "line"]);
const DRAW_TYPE = Object.fromEntries(Object.entries(GEOMETRY).filter(([k]) => k !== "mso-spt100").map(([k, v]) => [v, k]));
const ALIGN_IN = { start: "l", left: "l", center: "ctr", end: "r", right: "r", justify: "just" };
const ALIGN_OUT = { l: "start", ctr: "center", r: "end", just: "justify", dist: "justify" };
const AUTONUM = { 1: "arabicPeriod", a: "alphaLcPeriod", A: "alphaUcPeriod", i: "romanLcPeriod", I: "romanUcPeriod" };
const NUMFORMAT = { arabicPeriod: "1", arabicParenR: "1", alphaLcPeriod: "a", alphaUcPeriod: "A", romanLcPeriod: "i", romanUcPeriod: "I" };
let counter = 0;
const newId = (kind) => `${kind}-odp${(++counter).toString(36)}`;

// ---- reading -------------------------------------------------------------------------------------------------------

const parse = (text) => new DOMParser().parseFromString(text, "application/xml");
const a = (el, ns, name) => (el ? el.getAttributeNS(NS[ns], name) : null);
const kids = (el, ns, name) => (el ? [...el.children].filter((c) => c.namespaceURI === NS[ns] && (!name || c.localName === name)) : []);
const kid = (el, ns, name) => kids(el, ns, name)[0] || null;

/** "2.5cm", "12pt", "0.5in", "10mm", "96px" -> px (96 dpi). */
function px(length) {
  const m = /^(-?[\d.]+)(cm|mm|in|pt|pc|px)?$/.exec(String(length || "").trim());
  if (!m) return null;
  const v = Number(m[1]);
  return { cm: v * 96 / 2.54, mm: v * 96 / 25.4, in: v * 96, pt: v * 96 / 72, pc: v * 16, px: v }[m[2] || "px"];
}
const pt = (length) => { const v = px(length); return v === null ? null : Math.round((v * 72 / 96) * 10) / 10; };

class OdpReader {
  constructor(buffer) {
    this.files = unzipSync(new Uint8Array(buffer));
    if (!this.files["content.xml"]) throw new Error("not an OpenDocument presentation (ODP) file");
    this.content = parse(strFromU8(this.files["content.xml"]));
    this.styles = this.files["styles.xml"] ? parse(strFromU8(this.files["styles.xml"])) : null;
    this.map = new Map(); // "family:name" -> style element
    this.defaults = new Map(); // family -> default style
    this.lists = new Map();
    for (const doc of [this.styles, this.content]) {
      if (!doc) continue;
      for (const s of doc.getElementsByTagNameNS(NS.style, "style")) this.map.set(`${a(s, "style", "family")}:${a(s, "style", "name")}`, s);
      for (const s of doc.getElementsByTagNameNS(NS.style, "default-style")) this.defaults.set(a(s, "style", "family"), s);
      for (const l of doc.getElementsByTagNameNS(NS.text, "list-style")) this.lists.set(a(l, "style", "name"), l);
    }
  }

  /** The style chain of a style (the style first, then its parents, then the family's default). */
  chain(family, name) {
    const out = [];
    let s = name && this.map.get(`${family}:${name}`);
    const seen = new Set();
    while (s && !seen.has(s)) { seen.add(s); out.push(s); const parent = a(s, "style", "parent-style-name"); s = parent && this.map.get(`${family}:${parent}`); }
    if (this.defaults.has(family)) out.push(this.defaults.get(family));
    return out;
  }
  /** The first value of a property along a chain of styles: (chain, "graphic-properties", "draw", "fill"). */
  prop(chain, kind, ns, name) {
    for (const s of chain) { const v = a(kid(s, "style", kind), ns, name); if (v !== null && v !== "") return v; }
    return null;
  }

  fillOf(chain) {
    const fill = this.prop(chain, "graphic-properties", "draw", "fill");
    if (fill === "none") return null;
    const color = this.prop(chain, "graphic-properties", "draw", "fill-color");
    return fill === "solid" || (fill === null && color && chain.length && a(kid(chain[0], "style", "graphic-properties"), "draw", "fill-color")) ? (color || "#729FCF").toUpperCase() : null;
  }
  lineOf(chain) {
    const stroke = this.prop(chain, "graphic-properties", "draw", "stroke");
    if (!stroke || stroke === "none") return null;
    return { color: (this.prop(chain, "graphic-properties", "svg", "stroke-color") || "#3465A4").toUpperCase(), width: px(this.prop(chain, "graphic-properties", "svg", "stroke-width")) || 1 };
  }

  /** Run properties from text-properties along chains (first wins). */
  runProps(chains) {
    const get = (ns, name) => { for (const c of chains) { const v = this.prop(c, "text-properties", ns, name); if (v !== null) return v; } return null; };
    const weight = get("fo", "font-weight"), style = get("fo", "font-style"), underline = get("style", "text-underline-style"), strike = get("style", "text-line-through-style");
    const size = get("fo", "font-size");
    const font = get("style", "font-name") || get("fo", "font-family");
    return {
      bold: weight === "bold" || Number(weight) >= 600, italic: style === "italic" || style === "oblique",
      underline: !!underline && underline !== "none", strike: !!strike && strike !== "none",
      size: size && /pt$/.test(size) ? Number(size.replace("pt", "")) : size ? pt(size) || 18 : 18,
      color: (get("fo", "color") || "#000000").toUpperCase(), font: font ? font.replace(/^['"]|['"]$/g, "") : "Liberation Sans",
    };
  }

  /** Text of a text box, custom shape or table cell: { anchor, insets, paragraphs }. */
  text(container, graphicChain, presChain = []) {
    const paragraphs = [];
    const anchorRaw = this.prop(graphicChain, "graphic-properties", "draw", "textarea-vertical-align") || this.prop(presChain, "graphic-properties", "draw", "textarea-vertical-align");
    const pad = (side) => px(this.prop(graphicChain, "graphic-properties", "fo", `padding-${side}`) || this.prop(presChain, "graphic-properties", "fo", `padding-${side}`)) ?? (side === "left" || side === "right" ? 9.6 : 4.8);
    const walk = (el, level, list) => {
      for (const node of kids(el, "text")) {
        if (node.localName === "p" || node.localName === "h") paragraphs.push(this.paragraph(node, level, list, graphicChain, presChain));
        else if (node.localName === "list") {
          const styleName = a(node, "text", "style-name") || (list && list.styleName);
          for (const item of kids(node, "text", "list-item")) walk(item, list ? level + 1 : level, { styleName, depth: list ? list.depth + 1 : 0 });
          for (const item of kids(node, "text", "list-header")) walk(item, list ? level + 1 : level, null);
        }
      }
    };
    walk(container, 0, null);
    if (!paragraphs.length) return null;
    return { anchor: anchorRaw === "middle" ? "ctr" : anchorRaw === "bottom" ? "b" : "t", insets: [pad("left"), pad("top"), pad("right"), pad("bottom")], paragraphs };
  }

  paragraph(p, level, list, graphicChain, presChain) {
    const pChain = this.chain("paragraph", a(p, "text", "style-name"));
    const area = this.prop(graphicChain, "graphic-properties", "draw", "textarea-horizontal-align"); // (LibreOffice centres shape text with it)
    const align = ALIGN_IN[this.prop(pChain, "paragraph-properties", "fo", "text-align") || this.prop(graphicChain, "paragraph-properties", "fo", "text-align") || this.prop(presChain, "paragraph-properties", "fo", "text-align")]
      || (area === "center" ? "ctr" : area === "right" ? "r" : "l");
    let bullet = null;
    if (list) {
      const ls = this.lists.get(list.styleName) || (presChain.length ? [...presChain].map((s) => kid(kid(s, "style", "graphic-properties"), "text", "list-style")).find(Boolean) : null);
      const levelStyle = ls && kids(ls, "text").find((x) => Number(a(x, "text", "level")) === list.depth + 1);
      if (levelStyle && levelStyle.localName === "list-level-style-number") bullet = { auto: AUTONUM[a(levelStyle, "style", "num-format")] || "arabicPeriod" };
      else if (!levelStyle || levelStyle.localName === "list-level-style-bullet") bullet = { char: (levelStyle && a(levelStyle, "text", "bullet-char")) || "•" };
    }
    const base = this.runProps([pChain, graphicChain, presChain]);
    const runs = [];
    const add = (text, chains, extra = {}) => { if (!text && !extra.field) return; const props = chains === null ? { ...base } : this.runProps([...chains, pChain, graphicChain, presChain]); runs.push({ text, ...props, ...extra }); };
    const inline = (el, chains) => {
      for (const node of el.childNodes) {
        if (node.nodeType === 3) { add(node.textContent.replace(/\s+/g, " "), chains); continue; }
        if (node.nodeType !== 1 || node.namespaceURI !== NS.text) continue;
        const name = node.localName;
        if (name === "span") inline(node, [this.chain("text", a(node, "text", "style-name")), ...chains]);
        else if (name === "s") add(" ".repeat(Number(a(node, "text", "c") || 1)), chains);
        else if (name === "tab") add("\t", chains);
        else if (name === "line-break") add("\n", chains);
        else if (name === "page-number") add(node.textContent || "1", chains, { field: "slidenum", fieldType: "slidenum" });
        else if (name === "date" || name === "time") add(node.textContent || "", chains, { field: "datetime", fieldType: "datetime" });
        else if (name === "a") inline(node, chains);
        else inline(node, chains);
      }
    };
    inline(p, []);
    // merge neighbouring runs of the same look
    const merged = [];
    for (const r of runs) {
      const last = merged[merged.length - 1];
      const same = last && !last.field && !r.field && r.text !== "\n" && last.text !== "\n" && ["bold", "italic", "underline", "strike", "size", "color", "font"].every((k) => last[k] === r[k]);
      if (same) last.text += r.text; else merged.push({ ...r });
    }
    return { align, level, bullet, runs: merged.length ? merged : [{ ...base, text: "" }] };
  }

  /** Position, size and rotation of a drawing element. */
  box(el) {
    let x = px(a(el, "svg", "x")) || 0, y = px(a(el, "svg", "y")) || 0;
    const w = px(a(el, "svg", "width")) || 0, h = px(a(el, "svg", "height")) || 0;
    let rot = 0;
    const tr = a(el, "draw", "transform");
    if (tr) {
      const r = /rotate\s*\(\s*(-?[\d.e-]+)\s*\)/.exec(tr), t = /translate\s*\(\s*(-?[\d.]+\w*)[\s,]+(-?[\d.]+\w*)\s*\)/.exec(tr);
      const angle = r ? Number(r[1]) : 0; // radians, counter-clockwise, about the top left corner
      if (t) {
        const tx = px(t[1]), ty = px(t[2]);
        rot = Math.round((-angle * 180 / Math.PI) * 10) / 10; // clockwise degrees about the centre
        const th = rot * Math.PI / 180;
        // the translated top left corner is the rotated corner: the centre is there plus the rotated half size
        const cx = tx + (w / 2) * Math.cos(th) - (h / 2) * Math.sin(th), cy = ty + (w / 2) * Math.sin(th) + (h / 2) * Math.cos(th);
        x = cx - w / 2; y = cy - h / 2;
      }
    }
    return { x, y, w, h, rot: ((rot % 360) + 360) % 360 };
  }

  image(href, types = MIME) {
    const name = String(href || "").replace(/^\.\//, "");
    const bytes = this.files[name];
    if (!bytes) return null;
    const ext = (name.split(".").pop() || "png").toLowerCase();
    if (!types[ext]) return null;
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return `data:${types[ext]};base64,${btoa(s)}`;
  }

  /** The elements of a page or master (groups: the members get one group id). */
  shapes(container, group = null) {
    const out = [];
    for (const el of kids(container, "draw")) {
      const gChain = this.chain("graphic", a(el, "draw", "style-name"));
      // (draw:text-style-name: the paragraph defaults of the element's text, as LibreOffice writes them)
      const presChain = [...this.chain("paragraph", a(el, "draw", "text-style-name")), ...this.chain("presentation", a(el, "presentation", "style-name"))];
      const graphic = presChain.length && !a(el, "draw", "style-name") ? presChain : [...gChain, ...presChain];
      const name = a(el, "draw", "name") || "";
      const common = () => ({ id: newId(el.localName), name, ...this.box(el), ...(group ? { group } : {}) });
      if (el.localName === "g") { out.push(...this.shapes(el, group || newId("group"))); continue; }
      if (el.localName === "frame") {
        const img = kid(el, "draw", "image");
        const textBox = kid(el, "draw", "text-box");
        const tbl = kid(el, "table", "table");
        const plugin = kid(el, "draw", "plugin");
        const media = plugin && this.image(a(plugin, "xlink", "href"), MEDIA);
        if (media) { // video or sound (LibreOffice: draw:plugin with the file in Media/)
          const poster = img && this.image(a(img, "xlink", "href"));
          out.push({ ...common(), type: "media", media: { src: media, kind: media.startsWith("data:video") ? "video" : "audio", ...(poster ? { poster } : {}) }, line: null });
          continue;
        }
        if (tbl) { const t = this.table(tbl, common()); if (t) out.push(t); continue; }
        if (textBox) {
          const pc = a(el, "presentation", "class");
          if (a(el, "presentation", "placeholder") === "true" && !textBox.textContent.trim()) continue; // (an empty placeholder: not shown in the show)
          const text = this.text(textBox, graphic, presChain);
          out.push({ ...common(), type: "text", geometry: "rect", fill: this.fillOf(graphic), line: this.lineOf(graphic), text, ...(pc ? { placeholder: { type: pc === "outline" ? "body" : pc } } : {}) });
          continue;
        }
        if (img) {
          const src = this.image(a(img, "xlink", "href"));
          if (src) out.push({ ...common(), type: "image", geometry: "rect", fill: null, line: this.lineOf(gChain), text: null, image: { src } });
          continue;
        }
        continue;
      }
      if (el.localName === "custom-shape" || el.localName === "rect" || el.localName === "ellipse" || el.localName === "line") {
        const geo = kid(el, "draw", "enhanced-geometry");
        let geometry = el.localName === "ellipse" ? "ellipse" : el.localName === "line" ? "line" : "rect";
        if (geo) {
          const type = a(geo, "draw", "type") || "";
          // LibreOffice keeps PowerPoint's presets as "ooxml-<preset>"
          geometry = GEOMETRY[type] || (type.startsWith("ooxml-") && PRESETS.has(type.slice(6)) ? type.slice(6) : "rect");
        }
        const shape = { ...common(), type: "shape", geometry, fill: geometry === "line" ? null : this.fillOf(graphic), line: this.lineOf(graphic) || (geometry === "line" ? { color: "#000000", width: 1 } : null), text: null };
        if (el.localName === "line") {
          const [x1, y1, x2, y2] = ["x1", "y1", "x2", "y2"].map((k) => px(a(el, "svg", k)) || 0);
          Object.assign(shape, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), flipV: (x2 < x1) !== (y2 < y1) });
        }
        const text = this.text(el, graphic, presChain);
        if (text && text.paragraphs.some((p) => p.runs.some((r) => r.text.trim()))) shape.text = text;
        // a rectangle with text and neither fill nor line is a text box (PowerPoint's text boxes come so from LibreOffice)
        if (shape.text && geometry === "rect" && !shape.fill && !shape.line) shape.type = "text";
        out.push(shape);
      }
    }
    return out;
  }

  table(tbl, box) {
    const columns = [];
    for (const col of kids(tbl, "table", "table-column")) {
      const s = this.map.get(`table-column:${a(col, "table", "style-name")}`);
      const width = px(a(kid(s, "style", "table-column-properties"), "style", "column-width")) || 100;
      for (let i = 0; i < Number(a(col, "table", "number-columns-repeated") || 1); i++) columns.push(width);
    }
    const rows = [...tbl.getElementsByTagNameNS(NS.table, "table-row")].map((row) => {
      const rs = this.map.get(`table-row:${a(row, "table", "style-name")}`);
      const height = px(a(kid(rs, "style", "table-row-properties"), "style", "row-height")) || 30;
      const cells = [];
      for (const cell of kids(row, "table")) {
        if (cell.localName !== "table-cell" && cell.localName !== "covered-table-cell") continue;
        const cChain = this.chain("graphic", a(cell, "table", "style-name"));
        const fill = this.prop(this.chain("table-cell", a(cell, "table", "style-name")), "table-cell-properties", "fo", "background-color") || this.fillOf(cChain);
        const text = cell.localName === "table-cell" ? this.text(cell, cChain) : null;
        const span = Number(a(cell, "table", "number-columns-spanned") || 1);
        cells.push({ text, fill: fill && fill !== "transparent" ? fill.toUpperCase() : null, ...(span > 1 ? { span } : {}), ...(cell.localName === "covered-table-cell" ? { hMerge: true } : {}) });
      }
      return { height, cells };
    });
    if (!rows.length) return null;
    const n = Math.max(...rows.map((r) => r.cells.length));
    const cols = columns.length >= n ? columns.slice(0, n) : Array.from({ length: n }, () => box.w / n);
    return { ...box, type: "table", geometry: "rect", fill: null, line: null, text: null, h: rows.reduce((s, r) => s + r.height, 0) || box.h, table: { columns: cols, rows } };
  }

  background(pageStyleName) {
    const chain = this.chain("drawing-page", pageStyleName);
    const fill = this.prop(chain, "drawing-page-properties", "draw", "fill");
    const color = this.prop(chain, "drawing-page-properties", "draw", "fill-color");
    return fill === "solid" && color ? color.toUpperCase() : null;
  }

  read() {
    const masters = new Map(this.styles ? [...this.styles.getElementsByTagNameNS(NS.style, "master-page")].map((m) => [a(m, "style", "name"), m]) : []);
    const first = masters.values().next().value;
    const layoutName = first && a(first, "style", "page-layout-name");
    const layout = layoutName && this.styles && [...this.styles.getElementsByTagNameNS(NS.style, "page-layout")].find((l) => a(l, "style", "name") === layoutName);
    const props = kid(layout, "style", "page-layout-properties");
    const width = Math.round(px(a(props, "fo", "page-width")) || 960), height = Math.round(px(a(props, "fo", "page-height")) || 540);
    const pres = this.content.getElementsByTagNameNS(NS.office, "presentation")[0];
    const slides = kids(pres, "draw", "page").map((page, i) => {
      const master = masters.get(a(page, "draw", "master-page-name")) || first;
      const decorations = master ? this.shapes(master).filter((e) => !e.placeholder).map((e) => ({ ...e, locked: true })) : [];
      const pageStyle = this.chain("drawing-page", a(page, "draw", "style-name"));
      const visibility = this.prop(pageStyle, "drawing-page-properties", "presentation", "visibility");
      const notes = kid(page, "presentation", "notes");
      const notesFrame = notes && kids(notes, "draw", "frame").find((f) => a(f, "presentation", "class") === "notes");
      const notesText = notesFrame ? kids(kid(notesFrame, "draw", "text-box"), "text").map((p) => p.textContent).join("\n").trim() : "";
      return {
        id: `slide${i + 1}`, background: this.background(a(page, "draw", "style-name")) || (master ? this.background(a(master, "draw", "style-name")) : null) || "#FFFFFF",
        elements: [...decorations, ...this.shapes(page)], ...(notesText ? { notes: notesText } : {}), ...(visibility === "hidden" ? { hidden: true } : {}),
      };
    });
    return { width, height, slides: slides.length ? slides : [{ id: "slide1", background: "#FFFFFF", elements: [] }] };
  }
}

export function readOdp(buffer) {
  return new OdpReader(buffer).read();
}

// ---- writing -------------------------------------------------------------------------------------------------------

const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cm = (v) => `${((v * 2.54) / 96).toFixed(3)}cm`;

class OdpWriter {
  constructor(deck) {
    this.deck = deck;
    this.autos = new Map(); // key -> { name, family, xml }
    this.pictures = {};
    this.types = {}; // file -> media type (media files)
  }

  auto(family, props, prefix) {
    const key = `${family}|${props}`;
    if (!this.autos.has(key)) this.autos.set(key, { name: `${prefix}${this.autos.size + 1}`, family, props });
    return this.autos.get(key).name;
  }

  textStyle(r) {
    const p = [`fo:font-size="${r.size || 18}pt"`];
    if (r.bold) p.push('fo:font-weight="bold"');
    if (r.italic) p.push('fo:font-style="italic"');
    if (r.underline) p.push('style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"');
    if (r.strike) p.push('style:text-line-through-style="solid"');
    if (r.color) p.push(`fo:color="${r.color}"`);
    if (r.font) p.push(`fo:font-family="${xml(r.font)}"`);
    return this.auto("text", `<style:text-properties ${p.join(" ")}/>`, "T");
  }

  paragraphXml(p) {
    const style = this.auto("paragraph", `<style:paragraph-properties fo:text-align="${ALIGN_OUT[p.align] || "start"}"/>`, "P");
    const runs = (p.runs || []).map((r) => {
      if (r.text === "\n") return "<text:line-break/>";
      const s = this.textStyle(r);
      let body;
      if (r.field === "slidenum") body = `<text:page-number text:select-page="current">${xml(r.text || "1")}</text:page-number>`;
      else if (r.field === "datetime") body = `<text:date>${xml(r.text || "")}</text:date>`;
      else body = xml(r.text || "").replace(/\t/g, "<text:tab/>").replace(/\n/g, "<text:line-break/>").replace(/ {2,}/g, (m) => ` <text:s text:c="${m.length - 1}"/>`);
      return body ? `<text:span text:style-name="${s}">${body}</text:span>` : "";
    }).join("");
    return `<text:p text:style-name="${style}">${runs}</text:p>`;
  }

  /** Paragraphs with lists: consecutive list paragraphs in one text:list, levels as nested lists. */
  textXml(text) {
    if (!text) return "";
    const parts = [];
    const stack = []; // open lists: kind
    const close = (depth) => { while (stack.length > depth) { parts.push("</text:list-item></text:list>"); stack.pop(); } };
    for (const p of text.paragraphs || []) {
      if (!p.bullet) { close(0); parts.push(this.paragraphXml(p)); continue; }
      const level = p.level || 0, kind = p.bullet.auto ? `N:${p.bullet.auto}` : `B:${p.bullet.char || "•"}`;
      close(level + 1);
      if (stack.length === level + 1 && stack[level] !== kind) close(level);
      if (stack.length === level + 1) parts.push("</text:list-item><text:list-item>");
      while (stack.length <= level) {
        parts.push(`<text:list text:style-name="${this.listStyle(kind)}"><text:list-item>`); // (each level its own kind: bullets under numbers)
        stack.push(kind);
      }
      parts.push(this.paragraphXml(p));
    }
    close(0);
    return parts.join("");
  }

  listStyle(kind) {
    const levels = Array.from({ length: 9 }, (_, i) => {
      const indent = `<style:list-level-properties text:space-before="${(0.6 * i).toFixed(2)}cm" text:min-label-width="0.6cm"/>`;
      return kind.startsWith("N:") ? `<text:list-level-style-number text:level="${i + 1}" style:num-suffix="${kind.endsWith("ParenR") ? ")" : "."}" style:num-format="${NUMFORMAT[kind.slice(2)] || "1"}">${indent}</text:list-level-style-number>`
        : `<text:list-level-style-bullet text:level="${i + 1}" text:bullet-char="${xml(kind.slice(2))}">${indent}</text:list-level-style-bullet>`;
    }).join("");
    return this.auto("list", levels, "L");
  }

  graphicStyle(el) {
    const p = [];
    if (el.fill) p.push(`draw:fill="solid" draw:fill-color="${el.fill}"`); else p.push('draw:fill="none"');
    if (el.line && el.line.color) p.push(`draw:stroke="solid" svg:stroke-color="${el.line.color}" svg:stroke-width="${cm(el.line.width || 1)}"`); else p.push('draw:stroke="none"');
    if (el.text) {
      const [l, t, r, b] = el.text.insets || [9.6, 4.8, 9.6, 4.8];
      p.push(`draw:textarea-vertical-align="${el.text.anchor === "ctr" ? "middle" : el.text.anchor === "b" ? "bottom" : "top"}" fo:padding-left="${cm(l)}" fo:padding-top="${cm(t)}" fo:padding-right="${cm(r)}" fo:padding-bottom="${cm(b)}" draw:auto-grow-height="false"`);
    }
    return this.auto("graphic", `<style:graphic-properties ${p.join(" ")}/>`, "gr");
  }

  /** Position attributes: svg:x/y, or draw:transform for a rotated element. */
  place(el) {
    const size = `svg:width="${cm(el.w)}" svg:height="${cm(el.h)}"`;
    const rot = el.rot || 0;
    if (!rot) return `svg:x="${cm(el.x)}" svg:y="${cm(el.y)}" ${size}`;
    const th = rot * Math.PI / 180, cx = el.x + el.w / 2, cy = el.y + el.h / 2;
    const tx = cx - (el.w / 2) * Math.cos(th) + (el.h / 2) * Math.sin(th), ty = cy - (el.w / 2) * Math.sin(th) - (el.h / 2) * Math.cos(th);
    return `${size} draw:transform="rotate (${(-th).toFixed(6)}) translate (${cm(tx)} ${cm(ty)})"`;
  }

  elementXml(el) {
    const name = el.name ? ` draw:name="${xml(el.name)}"` : "";
    if (el.type === "media" && el.media) {
      const m = /^data:([^;,]+);base64,(.*)$/s.exec(el.media.src || "");
      if (!m) return "";
      const file = `Media/media${Object.keys(this.pictures).length + 1}.${MEDIA_EXT[m[1]] || m[1].split("/")[1]}`;
      this.pictures[file] = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
      this.types[file] = m[1];
      const params = [["Loop", "false"], ["Mute", "false"], ["VolumeDB", "0"], ["Zoom", "fit"]].map(([k, v]) => `<draw:param draw:name="${k}" draw:value="${v}"/>`).join("");
      return `<draw:frame${name} ${this.place(el)}><draw:plugin xlink:href="${file}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad" draw:mime-type="application/vnd.sun.star.media">${params}</draw:plugin></draw:frame>`;
    }
    if (el.type === "image" && el.image && el.image.src) {
      const m = /^data:([^;,]+);base64,(.*)$/s.exec(el.image.src);
      if (!m) return "";
      const ext = (m[1].split("/")[1] || "png").replace("jpeg", "jpg").replace("svg+xml", "svg");
      const file = `Pictures/image${Object.keys(this.pictures).length + 1}.${ext}`;
      this.pictures[file] = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
      return `<draw:frame${name} draw:style-name="${this.graphicStyle({ ...el, fill: null })}" ${this.place(el)}><draw:image xlink:href="${file}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`;
    }
    if (el.type === "table" && el.table) {
      const cols = el.table.columns.map((w) => `<table:table-column table:style-name="${this.auto("table-column", `<style:table-column-properties style:column-width="${cm(w)}"/>`, "co")}"/>`).join("");
      const rows = el.table.rows.map((row) => `<table:table-row table:style-name="${this.auto("table-row", `<style:table-row-properties style:row-height="${cm(row.height || 30)}"/>`, "ro")}">${row.cells.map((cell) => {
        if (cell.hMerge || cell.vMerge) return "<table:covered-table-cell/>";
        const style = this.auto("graphic", `<style:graphic-properties ${cell.fill ? `draw:fill="solid" draw:fill-color="${cell.fill}"` : 'draw:fill="none"'}/>`, "ce");
        return `<table:table-cell table:style-name="${style}"${cell.span > 1 ? ` table:number-columns-spanned="${cell.span}"` : ""}>${this.textXml(cell.text) || "<text:p/>"}</table:table-cell>`;
      }).join("")}</table:table-row>`).join("");
      return `<draw:frame${name} ${this.place(el)}><table:table>${cols}${rows}</table:table></draw:frame>`;
    }
    const style = this.graphicStyle(el);
    if (el.type === "shape") {
      const type = DRAW_TYPE[el.geometry];
      if (el.geometry === "line" || el.geometry === "straightConnector1") {
        const [x1, y1, x2, y2] = el.flipV ? [el.x, el.y + el.h, el.x + el.w, el.y] : [el.x, el.y, el.x + el.w, el.y + el.h];
        return `<draw:line${name} draw:style-name="${style}" svg:x1="${cm(x1)}" svg:y1="${cm(y1)}" svg:x2="${cm(x2)}" svg:y2="${cm(y2)}"/>`;
      }
      return `<draw:custom-shape${name} draw:style-name="${style}" ${this.place(el)}>${this.textXml(el.text)}<draw:enhanced-geometry svg:viewBox="0 0 21600 21600" draw:type="${type || "rectangle"}"/></draw:custom-shape>`;
    }
    const pc = el.placeholder && el.placeholder.type;
    const cls = pc === "title" || pc === "ctrTitle" ? ' presentation:class="title"' : pc === "body" ? ' presentation:class="outline"' : pc === "subTitle" ? ' presentation:class="subtitle"' : "";
    return `<draw:frame${name}${cls} draw:style-name="${style}" ${this.place(el)}><draw:text-box>${this.textXml(el.text) || "<text:p/>"}</draw:text-box></draw:frame>`;
  }

  write() {
    const d = this.deck;
    // groups: neighbouring members of one group in a draw:g
    const elements = (list) => {
      const out = [];
      for (let i = 0; i < list.length;) {
        const g = list[i].group;
        let j = i;
        while (g && j + 1 < list.length && list[j + 1].group === g) j += 1;
        const chunk = list.slice(i, j + 1).map((el) => this.elementXml(el)).join("");
        out.push(j > i ? `<draw:g>${chunk}</draw:g>` : chunk);
        i = j + 1;
      }
      return out.join("");
    };
    const pages = d.slides.map((sl, i) => {
      const page = this.auto("drawing-page", `<style:drawing-page-properties draw:fill="solid" draw:fill-color="${sl.background || "#FFFFFF"}" presentation:visibility="${sl.hidden ? "hidden" : "visible"}" draw:background-size="full"/>`, "dp");
      // (as LibreOffice writes them: the page's picture, then the notes on the layout layer)
      const notes = sl.notes ? `<presentation:notes><draw:page-thumbnail draw:layer="layout" svg:width="12.7cm" svg:height="9.5cm" svg:x="3.2cm" svg:y="1.9cm" draw:page-number="${i + 1}" presentation:class="page"/><draw:frame presentation:style-name="${this.auto("presentation", '<style:graphic-properties draw:fill="none" draw:stroke="none"/>', "pr")}" draw:layer="layout" presentation:class="notes" presentation:user-transformed="true" svg:x="1.9cm" svg:y="12cm" svg:width="15.2cm" svg:height="11.4cm"><draw:text-box>${sl.notes.split("\n").map((l) => `<text:p>${xml(l)}</text:p>`).join("")}</draw:text-box></draw:frame></presentation:notes>` : "";
      return `<draw:page draw:name="page${i + 1}" draw:style-name="${page}" draw:master-page-name="Default">${elements(sl.elements)}${notes}</draw:page>`;
    }).join("");
    const ns = Object.entries(NS).map(([k, v]) => `xmlns:${k}="${v}"`).join(" ");
    const autos = [...this.autos.values()].map((s) => (s.family === "list" ? `<text:list-style style:name="${s.name}">${s.props}</text:list-style>`
      : `<style:style style:name="${s.name}" style:family="${s.family}">${s.props}</style:style>`)).join("");
    const content = `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-content ${ns} office:version="1.3"><office:automatic-styles>${autos}</office:automatic-styles><office:body><office:presentation>${pages}</office:presentation></office:body></office:document-content>`;
    const styles = `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-styles ${ns} office:version="1.3"><office:styles>`
      + '<style:default-style style:family="graphic"><style:graphic-properties draw:fill="none" draw:stroke="none"/><style:paragraph-properties fo:text-align="start"/><style:text-properties fo:font-size="18pt" fo:font-family="\'Liberation Sans\'"/></style:default-style>'
      + `</office:styles><office:automatic-styles><style:page-layout style:name="PM1"><style:page-layout-properties fo:margin-top="0cm" fo:margin-bottom="0cm" fo:margin-left="0cm" fo:margin-right="0cm" fo:page-width="${cm(d.width)}" fo:page-height="${cm(d.height)}" style:print-orientation="${d.width >= d.height ? "landscape" : "portrait"}"/></style:page-layout>`
      + '<style:style style:name="dp0" style:family="drawing-page"><style:drawing-page-properties draw:fill="none"/></style:style></office:automatic-styles>'
      + '<office:master-styles><style:master-page style:name="Default" style:page-layout-name="PM1" draw:style-name="dp0"/></office:master-styles></office:document-styles>';
    const manifest = `<?xml version="1.0" encoding="UTF-8"?>\n<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.presentation"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>${Object.keys(this.pictures).map((p) => `<manifest:file-entry manifest:full-path="${p}" manifest:media-type="${this.types[p] || MIME[p.split(".").pop()] || "image/png"}"/>`).join("")}</manifest:manifest>`;
    const meta = `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-meta xmlns:office="${NS.office}" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" office:version="1.3"><office:meta><meta:generator>Portable Web App Suite</meta:generator></office:meta></office:document-meta>`;
    return zipSync({
      mimetype: [strToU8("application/vnd.oasis.opendocument.presentation"), { level: 0 }],
      "content.xml": strToU8(content), "styles.xml": strToU8(styles), "meta.xml": strToU8(meta), "META-INF/manifest.xml": strToU8(manifest),
      ...Object.fromEntries(Object.entries(this.pictures).map(([k, v]) => [k, [v, { level: 0 }]])),
    });
  }
}

export function writeOdp(deck) {
  return new OdpWriter(deck).write();
}
