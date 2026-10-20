/*
 * OpenDocument text (ODT, LibreOffice Writer) for Univer Docs. ES module; needs fflate and @univerjs/docs.
 *
 * readOdt(buffer) -> { data: IDocumentData, warnings }: page size and margins, default header/footer; paragraph and text styles
 * (automatic and common styles with their parent chains: bold, italic, underline, strike, size, font, colour, background,
 * super/subscript; alignment, spacing, line height, indentation, page breaks); headings (outline level), Title/Subtitle; bullet
 * and numbered lists with levels; tables (column widths, spans, cell background); images; links; tabs, spaces, line breaks;
 * footnotes and endnotes are appended at the end of the document (Univer has no notes).
 *
 * writeOdt(data) -> Uint8Array: the same features from Univer document data (as the DOCX export in univer-docx.js).
 */
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { buildDocTransform } from "@univerjs/docs";
import { Body } from "app/docx-import";
import { headings, TOC_PREFIX } from "app/doc-toc";

const NS = {
  office: "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
  style: "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
  text: "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
  table: "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
  draw: "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0",
  fo: "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0",
  xlink: "http://www.w3.org/1999/xlink",
  svg: "urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0",
};
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp", svg: "image/svg+xml", webp: "image/webp" };
const randomId = (prefix) => `${prefix}${Math.random().toString(36).slice(2, 10)}`;

// ---- reading -----------------------------------------------------------------------------------------

const parse = (text) => new DOMParser().parseFromString(text, "application/xml");
const a = (el, ns, name) => (el ? el.getAttributeNS(NS[ns], name) : null);
const kids = (el, ns, name) => (el ? [...el.children].filter((c) => c.namespaceURI === NS[ns] && (!name || c.localName === name)) : []);
const kid = (el, ns, name) => kids(el, ns, name)[0] || null;

/** "2.5cm", "12pt", "0.5in", "10mm", "96px" -> px (96 dpi). */
function px(length) {
  const m = /^(-?[\d.]+)\s*(cm|mm|in|pt|pc|px)?$/.exec(String(length || "").trim());
  if (!m) return null;
  const v = Number(m[1]);
  return { cm: (v * 96) / 2.54, mm: (v * 96) / 25.4, in: v * 96, pt: (v * 96) / 72, pc: v * 16, px: v }[m[2] || "px"];
}
const pt = (length) => { const v = px(length); return v === null ? null : (v * 72) / 96; };
const ALIGN = { start: 1, left: 1, center: 2, end: 3, right: 3, justify: 4 };

class OdtReader {
  constructor(buffer) {
    this.files = unzipSync(new Uint8Array(buffer));
    if (!this.files["content.xml"]) throw new Error("not an OpenDocument text (ODT) file");
    this.content = parse(strFromU8(this.files["content.xml"]));
    this.styles = this.files["styles.xml"] ? parse(strFromU8(this.files["styles.xml"])) : null;
    this.id = randomId("doc-");
    this.styleMap = new Map(); // "family:name" -> style element
    this.listStyles = new Map(); // name -> text:list-style
    for (const doc of [this.styles, this.content]) {
      if (!doc) continue;
      for (const s of doc.getElementsByTagNameNS(NS.style, "style")) this.styleMap.set(`${a(s, "style", "family")}:${a(s, "style", "name")}`, s);
      for (const s of doc.getElementsByTagNameNS(NS.style, "default-style")) this.styleMap.set(`${a(s, "style", "family")}:`, s);
      for (const l of doc.getElementsByTagNameNS(NS.text, "list-style")) this.listStyles.set(a(l, "style", "name"), l);
    }
    this.tableSource = {};
    this.drawings = {};
    this.drawingsOrder = [];
    this.notes = [];
    this.warnings = new Set();
  }

  /** The style and its parents, outermost first (with the family default first of all, unless withDefault is false). */
  chain(family, name, withDefault = true) {
    const out = [];
    const seen = new Set();
    for (let s = name && this.styleMap.get(`${family}:${name}`); s && !seen.has(s); s = this.styleMap.get(`${family}:${a(s, "style", "parent-style-name")}`)) { seen.add(s); out.unshift(s); }
    const def = withDefault && this.styleMap.get(`${family}:`);
    if (def) out.unshift(def);
    return out;
  }

  textStyle(chain, into = {}) {
    for (const s of chain) {
      const p = kid(s, "style", "text-properties");
      if (!p) continue;
      const w = a(p, "fo", "font-weight");
      if (w) into.bl = w === "bold" || Number(w) >= 600 ? 1 : 0;
      const it = a(p, "fo", "font-style");
      if (it) into.it = it === "italic" || it === "oblique" ? 1 : 0;
      const ul = a(p, "style", "text-underline-style");
      if (ul) into.ul = { s: ul !== "none" ? 1 : 0 };
      const st = a(p, "style", "text-line-through-style");
      if (st) into.st = { s: st !== "none" ? 1 : 0 };
      const size = a(p, "fo", "font-size");
      if (size && !/%$/.test(size)) into.fs = pt(size);
      else if (size && into.fs) into.fs = (into.fs * parseFloat(size)) / 100;
      const font = a(p, "style", "font-name") || a(p, "fo", "font-family");
      if (font) into.ff = font.replace(/^'|'$/g, "");
      const color = a(p, "fo", "color");
      if (color && color !== "transparent") into.cl = { rgb: color.toUpperCase() };
      const bg = a(p, "fo", "background-color");
      if (bg) { if (bg === "transparent") delete into.bg; else into.bg = { rgb: bg.toUpperCase() }; }
      const pos = a(p, "style", "text-position");
      if (pos) into.va = /^super|^\d/.test(pos) && !/^0%?\b/.test(pos) ? 3 : /^sub|^-/.test(pos) ? 2 : 1;
    }
    return into;
  }

  paragraphStyle(chain) {
    const style = {};
    let pageBreak = false;
    for (const s of chain) {
      const name = a(s, "style", "name") || "";
      const display = a(s, "style", "display-name") || name;
      if (/^Title$/i.test(display)) style.namedStyleType = 2;
      if (/^Subtitle$/i.test(display)) style.namedStyleType = 3;
      const level = a(s, "style", "default-outline-level");
      if (level && /^Heading/i.test(display)) style.namedStyleType = Math.min(8, 3 + Number(level));
      const p = kid(s, "style", "paragraph-properties");
      if (!p) continue;
      const al = a(p, "fo", "text-align");
      if (al && ALIGN[al]) style.horizontalAlign = ALIGN[al];
      const top = pt(a(p, "fo", "margin-top")), bottom = pt(a(p, "fo", "margin-bottom"));
      if (top !== null) style.spaceAbove = { v: top };
      if (bottom !== null) style.spaceBelow = { v: bottom };
      const lh = a(p, "fo", "line-height");
      if (lh && /%$/.test(lh)) { style.lineSpacing = parseFloat(lh) / 100; style.spacingRule = 0; } else if (lh && pt(lh) !== null) { style.lineSpacing = pt(lh); style.spacingRule = 2; }
      const left = pt(a(p, "fo", "margin-left")), indent = pt(a(p, "fo", "text-indent"));
      if (left !== null) style.indentStart = { v: left };
      if (indent !== null) { if (indent < 0) style.hanging = { v: -indent }; else style.indentFirstLine = { v: indent }; }
      if (a(p, "fo", "break-before") === "page") pageBreak = s === chain[chain.length - 1]; // only the paragraph's own style breaks
    }
    return { style, pageBreak };
  }

  /** Is level (0-based) of a list style numbered? */
  ordered(listStyleName, level) {
    const ls = this.listStyles.get(listStyleName);
    if (!ls) return false;
    const lvl = [...ls.children].find((c) => Number(a(c, "text", "level")) === level + 1);
    return !!lvl && lvl.localName === "list-level-style-number" && (a(lvl, "style", "num-format") || "1") !== "";
  }

  blocks(container, out, list = null) {
    for (const el of container.children) {
      if (el.namespaceURI === NS.text && (el.localName === "p" || el.localName === "h")) this.paragraph(el, out, list);
      else if (el.namespaceURI === NS.text && el.localName === "list") this.list(el, out, list);
      else if (el.namespaceURI === NS.table && el.localName === "table") this.table(el, out);
      else if (el.namespaceURI === NS.text && el.localName === "section") this.blocks(el, out, list);
      else if (el.namespaceURI === NS.text && el.localName === "table-of-content") { const body = kid(el, "text", "index-body"); if (body) this.blocks(body, out, list); }
    }
  }

  list(el, out, parent) {
    const styleName = a(el, "text", "style-name") || (parent && parent.styleName);
    const level = parent ? parent.level + 1 : 0;
    const id = parent ? parent.id : `list-${randomId("")}`;
    for (const item of kids(el, "text", "list-item")) this.blocks(item, out, { styleName, level, id });
  }

  paragraph(p, out, list) {
    const styleName = a(p, "text", "style-name");
    const chain = this.chain("paragraph", styleName);
    const { style, pageBreak } = this.paragraphStyle(chain);
    if (p.localName === "h" && !style.namedStyleType) style.namedStyleType = Math.min(8, 3 + Number(a(p, "text", "outline-level") || 1));
    let bullet = null;
    if (list) {
      bullet = { listType: this.ordered(list.styleName, list.level) ? "ORDER_LIST" : "BULLET_LIST", listId: list.id, nestingLevel: list.level };
      delete style.indentStart;
      delete style.hanging;
    }
    if (pageBreak && out.length) out.text("\f");
    const ts = this.textStyle(chain.map((s) => s));
    this.inlines(p, out, ts, { style, bullet });
    out.paragraph(style, bullet);
  }

  inlines(el, out, ts, para) {
    const clean = (t) => { const c = { ...t }; for (const k of ["bl", "it"]) if (!c[k]) delete c[k]; for (const k of ["ul", "st"]) if (c[k] && !c[k].s) delete c[k]; if (c.va === 1) delete c.va; return c; };
    for (const node of el.childNodes) {
      if (node.nodeType === 3) { out.text(node.textContent.replace(/\s+/g, " "), clean(ts)); continue; }
      if (node.nodeType !== 1) continue;
      const ns = node.namespaceURI, name = node.localName;
      if (ns === NS.text && name === "span") this.inlines(node, out, this.textStyle(this.chain("text", a(node, "text", "style-name"), false), { ...ts }), para);
      else if (ns === NS.text && name === "s") out.text(" ".repeat(Number(a(node, "text", "c") || 1)), clean(ts));
      else if (ns === NS.text && name === "tab") out.text("\t", clean(ts));
      else if (ns === NS.text && name === "line-break") { out.paragraph(para.style, para.bullet); this.warnings.add("line breaks are imported as paragraph breaks"); }
      else if (ns === NS.text && name === "a") {
        const start = out.length;
        this.inlines(node, out, ts, para);
        const url = a(node, "xlink", "href");
        if (url && out.length > start) out.body.customRanges.push({ startIndex: start, endIndex: out.length - 1, rangeId: randomId("link"), rangeType: 0, properties: { url } });
      } else if (ns === NS.text && name === "note") {
        const citation = kid(node, "text", "note-citation");
        const label = citation ? citation.textContent : String(this.notes.length + 1);
        out.text(label, clean({ ...ts, va: 3 }));
        this.notes.push({ label, body: kid(node, "text", "note-body") });
      } else if (ns === NS.draw && name === "frame") this.frame(node, out);
      else if (ns === NS.text && ["soft-page-break", "bookmark", "bookmark-start", "bookmark-end", "reference-mark", "change-start", "change-end"].includes(name)) continue;
      else if (ns === NS.text && name === "tracked-changes") continue;
      else this.inlines(node, out, ts, para); // fields (page numbers, dates, …): their current text
    }
  }

  frame(frame, out) {
    const image = kid(frame, "draw", "image");
    const href = image && a(image, "xlink", "href");
    const bytes = href && this.files[href.replace(/^\.\//, "")];
    if (!bytes) return;
    const ext = (href.split(".").pop() || "png").toLowerCase();
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    const width = px(a(frame, "svg", "width")) || 100, height = px(a(frame, "svg", "height")) || 100;
    const id = randomId("img");
    out.body.customBlocks.push({ startIndex: out.length, blockId: id });
    out.body.dataStream += "\b";
    this.drawings[id] = {
      drawingId: id, title: a(frame, "draw", "name") || "", description: "", imageSourceType: "BASE64", source: `data:${MIME[ext] || "image/png"};base64,${btoa(binary)}`,
      transform: { width, height, left: 0 }, docTransform: buildDocTransform(width, height), layoutType: 0, drawingType: 0, unitId: this.id, subUnitId: this.id,
    };
    this.drawingsOrder.push(id);
  }

  table(tbl, out) {
    const columns = [];
    for (const col of tbl.getElementsByTagNameNS(NS.table, "table-column")) {
      const s = this.styleMap.get(`table-column:${a(col, "table", "style-name")}`);
      const width = px(a(kid(s, "style", "table-column-properties"), "style", "column-width")) || 120;
      for (let i = 0; i < Number(a(col, "table", "number-columns-repeated") || 1); i++) columns.push(width);
    }
    // rows of this table (also inside table:table-header-rows / table:table-rows), not of nested tables
    const rows = [...tbl.getElementsByTagNameNS(NS.table, "table-row")]
      .filter((r) => { let p = r.parentElement; while (p && !(p.namespaceURI === NS.table && p.localName === "table")) p = p.parentElement; return p === tbl; });
    const tableId = randomId("t");
    const start = out.length;
    out.body.dataStream += "\x1a";
    const tableRows = [];
    const below = new Map(); // column -> rows still covered by a vertical span from above
    for (const row of rows) {
      out.body.dataStream += "\x1b";
      const tableCells = [];
      let col = 0;
      for (const cell of kids(row, "table")) {
        if (cell.localName !== "table-cell" && cell.localName !== "covered-table-cell") continue;
        const covered = cell.localName === "covered-table-cell";
        if (covered && !(below.get(col) > 0)) { col += 1; continue; } // covered by a horizontal span: no cell of its own
        out.body.dataStream += "\x1c";
        if (!covered) this.blocks(cell, out);
        if (out.body.dataStream.endsWith("\x1c")) out.paragraph({}, null);
        out.section();
        out.body.dataStream += "\x1d";
        const spec = { margin: { start: { v: 10 }, end: { v: 10 }, top: { v: 5 }, bottom: { v: 5 } } };
        const colSpan = Number(a(cell, "table", "number-columns-spanned") || 1), rowSpan = Number(a(cell, "table", "number-rows-spanned") || 1);
        if (colSpan > 1) spec.columnSpan = colSpan;
        if (covered) { spec.rowSpan = 0; below.set(col, below.get(col) - 1); } else if (rowSpan > 1) { spec.rowSpan = rowSpan; below.set(col, rowSpan - 1); }
        const cs = this.styleMap.get(`table-cell:${a(cell, "table", "style-name")}`);
        const bg = a(kid(cs, "style", "table-cell-properties"), "fo", "background-color");
        if (bg && bg !== "transparent") spec.backgroundColor = { rgb: bg.toUpperCase() };
        tableCells.push(spec);
        col += covered ? 1 : colSpan;
      }
      out.body.dataStream += "\x0e";
      tableRows.push({ tableCells, trHeight: { val: { v: 20 }, hRule: 0 } });
    }
    out.body.dataStream += "\x0f";
    out.body.tables.push({ startIndex: start, endIndex: out.length, tableId });
    const cols = columns.length ? columns : [600];
    this.tableSource[tableId] = {
      tableId, tableRows, tableColumns: cols.map((w) => ({ size: { type: 1, width: { v: w } } })), align: 0, indent: { v: 0 }, textWrap: 0,
      position: { positionH: { relativeFrom: 0, posOffset: 0 }, positionV: { relativeFrom: 0, posOffset: 0 } }, dist: { distB: 0, distL: 0, distR: 0, distT: 0 },
      cellMargin: { start: { v: 10 }, end: { v: 10 }, top: { v: 5 }, bottom: { v: 5 } }, size: { type: 1, width: { v: cols.reduce((x, y) => x + y, 0) } },
    };
  }

  read() {
    const text = this.content.getElementsByTagNameNS(NS.office, "text")[0];
    const out = new Body();
    if (text) this.blocks(text, out);
    if (this.notes.length) { // notes at the end, after a separator line
      out.text("—————");
      out.paragraph({}, null);
      for (const n of this.notes) {
        const start = out.length;
        out.text(`${n.label} `, { va: 3 });
        if (n.body) this.blocks(n.body, out);
        if (out.length === start + n.label.length + 1) out.paragraph({}, null);
      }
      this.warnings.add("footnotes and endnotes are placed at the end of the document");
    }
    out.section();
    // page layout and header/footer of the first master page
    const master = this.styles && this.styles.getElementsByTagNameNS(NS.style, "master-page")[0];
    const layoutName = master && a(master, "style", "page-layout-name");
    const layout = layoutName && [...this.styles.getElementsByTagNameNS(NS.style, "page-layout")].find((l) => a(l, "style", "name") === layoutName);
    const props = kid(layout, "style", "page-layout-properties");
    const dim = (name, d) => px(a(props, "fo", name)) ?? d;
    const documentStyle = {
      documentFlavor: 1, pageSize: { width: dim("page-width", 793.7), height: dim("page-height", 1122.5) },
      marginTop: dim("margin-top", 75.6), marginBottom: dim("margin-bottom", 75.6), marginLeft: dim("margin-left", 75.6), marginRight: dim("margin-right", 75.6),
      marginHeader: 30, marginFooter: 30, autoHyphenation: 0,
    };
    const headers = {}, footers = {};
    for (const [tag, store, prefix] of [["header", headers, "Header"], ["footer", footers, "Footer"]]) {
      const part = kid(master, "style", tag);
      if (!part || !part.children.length) continue;
      const body = new Body();
      this.blocks(part, body);
      body.section();
      const id = randomId(prefix.toLowerCase());
      store[id] = { [`${prefix.toLowerCase()}Id`]: id, body: body.body };
      documentStyle[`default${prefix}Id`] = id;
    }
    return {
      data: {
        id: this.id, title: "", body: out.body, documentStyle, tableSource: this.tableSource, drawings: this.drawings, drawingsOrder: this.drawingsOrder, headers, footers,
        resources: [{ name: "DOC_DRAWING_PLUGIN", data: JSON.stringify({ data: this.drawings, order: this.drawingsOrder }) }],
      },
      warnings: [...this.warnings],
    };
  }
}

export function readOdt(buffer) {
  return new OdtReader(buffer).read();
}

// ---- writing -----------------------------------------------------------------------------------------

const C = { PARAGRAPH: "\r", SECTION: "\n", TABLE_START: "\x1a", ROW_START: "\x1b", CELL_START: "\x1c", CELL_END: "\x1d", ROW_END: "\x0e", TABLE_END: "\x0f", PAGE_BREAK: "\f", CUSTOM_BLOCK: "\b" };
const SKIP = /[\x1a\x1b\x1c\x1d\x0e\x0f\x1f\x1e\v\n]/g;
const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cm = (pxValue) => `${((pxValue * 2.54) / 96).toFixed(3)}cm`;
const color = (c) => { if (!c || !c.rgb) return null; const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c.rgb); return m ? `#${m.slice(1, 4).map((v) => Number(v).toString(16).padStart(2, "0")).join("")}` : c.rgb.toLowerCase(); };
const ALIGN_OUT = { 1: "start", 2: "center", 3: "end", 4: "justify" };

class OdtWriter {
  constructor(data) {
    this.data = data;
    this.autoStyles = new Map(); // properties key -> name
    this.pictures = {};
  }

  /** An automatic style of a family for the given properties XML (shared by equal properties). */
  auto(family, props, extra = "") {
    const key = `${family}|${extra}|${props}`;
    if (!this.autoStyles.has(key)) this.autoStyles.set(key, { name: `${family[0].toUpperCase()}${this.autoStyles.size + 1}`, family, props, extra });
    return this.autoStyles.get(key).name;
  }

  textStyle(ts) {
    if (!ts) return null;
    const p = [];
    if (ts.bl) p.push('fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"');
    if (ts.it) p.push('fo:font-style="italic" style:font-style-asian="italic"');
    if (ts.ul && ts.ul.s) p.push('style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"');
    if (ts.st && ts.st.s) p.push('style:text-line-through-style="solid"');
    if (ts.fs) p.push(`fo:font-size="${ts.fs}pt"`);
    if (ts.ff) p.push(`style:font-name="${xml(ts.ff)}" fo:font-family="${xml(ts.ff)}"`);
    const cl = color(ts.cl), bg = color(ts.bg);
    if (cl) p.push(`fo:color="${cl}"`);
    if (bg) p.push(`fo:background-color="${bg}"`);
    if (ts.va === 3) p.push('style:text-position="super 58%"');
    if (ts.va === 2) p.push('style:text-position="sub 58%"');
    return p.length ? this.auto("text", `<style:text-properties ${p.join(" ")}/>`) : null;
  }

  paragraphStyle(p, pageBreak) {
    const s = p.paragraphStyle || {};
    const props = [];
    if (ALIGN_OUT[s.horizontalAlign]) props.push(`fo:text-align="${ALIGN_OUT[s.horizontalAlign]}"`);
    if (s.spaceAbove) props.push(`fo:margin-top="${s.spaceAbove.v}pt"`);
    if (s.spaceBelow) props.push(`fo:margin-bottom="${s.spaceBelow.v}pt"`);
    if (s.lineSpacing) props.push(!s.spacingRule ? `fo:line-height="${Math.round(s.lineSpacing * 100)}%"` : `fo:line-height="${s.lineSpacing}pt"`);
    if (s.indentStart && !p.bullet) props.push(`fo:margin-left="${s.indentStart.v}pt"`);
    if (s.hanging && !p.bullet) props.push(`fo:text-indent="${-s.hanging.v}pt"`);
    else if (s.indentFirstLine && !p.bullet) props.push(`fo:text-indent="${s.indentFirstLine.v}pt"`);
    if (pageBreak) props.push('fo:break-before="page"');
    const parent = { 2: "Title", 3: "Subtitle", 4: "Heading_20_1", 5: "Heading_20_2", 6: "Heading_20_3", 7: "Heading_20_4", 8: "Heading_20_5" }[s.namedStyleType] || "Standard";
    return props.length ? this.auto("paragraph", `<style:paragraph-properties ${props.join(" ")}/>`, ` style:parent-style-name="${parent}"`) : parent;
  }

  body(body) {
    const stream = body.dataStream || "";
    const runs = body.textRuns || [];
    const paragraphsByEnd = new Map((body.paragraphs || []).map((p) => [p.startIndex, p]));
    const blocksAt = new Map((body.customBlocks || []).map((b) => [b.startIndex, b.blockId]));
    const links = (body.customRanges || []).filter((r) => r.rangeType === 0 && r.properties && r.properties.url);
    const bodyTables = body.tables || [];
    const tables = this.data.tableSource || {};
    const drawings = this.data.drawings || {};
    const tsAt = (i) => { const r = runs.find((x) => i >= x.st && i < x.ed); return r ? r.ts : null; };
    const anchors = new Map(headings(body).map((h) => [h.end, h.anchor])); // table of contents targets

    const inline = (start, end) => {
      let out = "";
      let i = start;
      while (i < end) {
        const ch = stream[i];
        if (ch === C.PAGE_BREAK) { i += 1; continue; } // handled as break-before of the paragraph
        if (ch === C.CUSTOM_BLOCK) {
          const d = drawings[blocksAt.get(i)];
          const m = d && /^data:([^;,]+);base64,(.*)$/s.exec(d.source || "");
          if (m) {
            const ext = m[1].split("/")[1].replace("jpeg", "jpg").replace("svg+xml", "svg");
            const name = `Pictures/image${Object.keys(this.pictures).length + 1}.${ext}`;
            this.pictures[name] = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
            const size = (d.docTransform && d.docTransform.size) || d.transform || {};
            out += `<draw:frame draw:name="${xml(d.title || name)}" text:anchor-type="as-char" svg:width="${cm(size.width || 100)}" svg:height="${cm(size.height || 100)}"><draw:image xlink:href="${name}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`;
          }
          i += 1;
          continue;
        }
        // a stretch of text with the same style and link
        const ts = tsAt(i);
        const link = links.find((l) => i >= l.startIndex && i <= l.endIndex);
        let j = i;
        while (j < end && ![C.PAGE_BREAK, C.CUSTOM_BLOCK].includes(stream[j]) && tsAt(j) === ts && links.find((l) => j >= l.startIndex && j <= l.endIndex) === link) j += 1;
        let text = xml(stream.slice(i, j).replace(SKIP, "")).replace(/\t/g, "<text:tab/>").replace(/ {2,}/g, (m) => ` <text:s text:c="${m.length - 1}"/>`);
        const style = this.textStyle(ts);
        if (style && text) text = `<text:span text:style-name="${style}">${text}</text:span>`;
        if (link && text && link.properties.url !== `${TOC_PREFIX}title`) text = `<text:a xlink:type="simple" xlink:href="${xml(link.properties.url)}">${text}</text:a>`;
        out += text;
        i = j;
      }
      return out;
    };

    const blocks = (start, end) => {
      const parts = [];
      let paraStart = start;
      const listStack = []; // open lists: { id, ordered }
      const closeLists = (depth) => { while (listStack.length > depth) { parts.push("</text:list-item></text:list>"); listStack.pop(); } };
      for (let i = start; i < end; i++) {
        const ch = stream[i];
        if (ch === C.TABLE_START) {
          closeLists(0);
          const tableEnd = stream.indexOf(C.TABLE_END, i);
          parts.push(table(i, tableEnd));
          i = tableEnd;
          paraStart = i + 1;
        } else if (ch === C.PARAGRAPH) {
          const p = paragraphsByEnd.get(i) || {};
          const pageBreak = stream.slice(paraStart, i).includes(C.PAGE_BREAK);
          const style = this.paragraphStyle(p, pageBreak);
          const content = (anchors.has(i) ? `<text:bookmark text:name="${anchors.get(i)}"/>` : "") + inline(paraStart, i);
          const heading = (p.paragraphStyle || {}).namedStyleType;
          const tag = heading >= 4 && heading <= 8 ? `text:h text:outline-level="${heading - 3}"` : "text:p";
          const para = `<${tag} text:style-name="${style}">${content}</${tag.split(" ")[0]}>`;
          if (p.bullet) {
            const level = p.bullet.nestingLevel || 0;
            const ordered = /ORDER|NUMBER/.test(p.bullet.listType || "");
            closeLists(level + 1);
            if (listStack.length === level + 1 && (listStack[level].id !== p.bullet.listId || listStack[level].ordered !== ordered)) closeLists(level);
            if (listStack.length === level + 1) parts.push("</text:list-item><text:list-item>");
            while (listStack.length <= level) {
              const depth = listStack.length;
              parts.push(depth === 0 ? `<text:list text:style-name="${ordered ? "LNumber" : "LBullet"}"><text:list-item>` : "<text:list><text:list-item>");
              listStack.push({ id: p.bullet.listId, ordered });
            }
            parts.push(para);
          } else {
            closeLists(0);
            parts.push(para);
          }
          paraStart = i + 1;
        } else if (ch === C.SECTION && paraStart === i) paraStart = i + 1;
      }
      closeLists(0);
      return parts.join("");
    };

    const table = (start, end) => {
      const meta = bodyTables.find((t) => t.startIndex === start) || {};
      const source = tables[meta.tableId] || {};
      const specs = source.tableRows || [];
      const cols = (source.tableColumns || []).map((c) => (c.size && c.size.width && c.size.width.v) || 100);
      let out = `<table:table table:name="Table${start}">${cols.map((w) => `<table:table-column table:style-name="${this.auto("table-column", `<style:table-column-properties style:column-width="${cm(w)}"/>`)}"/>`).join("")}`;
      let r = -1, c = 0, cellStart = -1;
      for (let i = start + 1; i < end; i++) {
        const ch = stream[i];
        if (ch === C.ROW_START) { out += "<table:table-row>"; r += 1; c = 0; } else if (ch === C.CELL_START) cellStart = i + 1;
        else if (ch === C.CELL_END) {
          const spec = ((specs[r] || {}).tableCells || [])[c] || {};
          c += 1;
          if (spec.rowSpan === 0) { out += "<table:covered-table-cell/>"; continue; }
          const bg = color(spec.backgroundColor);
          const style = this.auto("table-cell", `<style:table-cell-properties fo:border="0.5pt solid #000000" fo:padding="0.1cm"${bg ? ` fo:background-color="${bg}"` : ""}/>`);
          const attrs = `${spec.columnSpan > 1 ? ` table:number-columns-spanned="${spec.columnSpan}"` : ""}${spec.rowSpan > 1 ? ` table:number-rows-spanned="${spec.rowSpan}"` : ""}`;
          out += `<table:table-cell table:style-name="${style}" office:value-type="string"${attrs}>${blocks(cellStart, i) || "<text:p/>"}</table:table-cell>`;
          for (let k = 1; k < (spec.columnSpan || 1); k++) out += "<table:covered-table-cell/>";
        } else if (ch === C.ROW_END) out += "</table:table-row>";
      }
      return `${out}</table:table>`;
    };

    return blocks(0, stream.length);
  }

  write() {
    const d = this.data;
    const ds = d.documentStyle || {};
    const text = this.body(d.body || { dataStream: "" });
    const part = (store, id) => (id && store && store[id] && store[id].body ? this.body(store[id].body) : "");
    const header = part(d.headers, ds.defaultHeaderId), footer = part(d.footers, ds.defaultFooterId);
    const autos = [...this.autoStyles.values()].map((s) => `<style:style style:name="${s.name}" style:family="${s.family}"${s.extra}>${s.props}</style:style>`).join("");
    const ns = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.3"';
    const lists = ["LBullet", "LNumber"].map((name, n) => `<text:list-style style:name="${name}">${Array.from({ length: 9 }, (_, i) => (n
      ? `<text:list-level-style-number text:level="${i + 1}" style:num-suffix="." style:num-format="1"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" fo:text-indent="-0.635cm" fo:margin-left="${(0.635 * (i + 2)).toFixed(3)}cm"/></style:list-level-properties></text:list-level-style-number>`
      : `<text:list-level-style-bullet text:level="${i + 1}" text:bullet-char="${["•", "◦", "▪"][i % 3]}"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" fo:text-indent="-0.635cm" fo:margin-left="${(0.635 * (i + 2)).toFixed(3)}cm"/></style:list-level-properties></text:list-level-style-bullet>`)).join("")}</text:list-style>`).join("");
    const content = `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-content ${ns}><office:automatic-styles>${autos}${lists}</office:automatic-styles><office:body><office:text>${text}</office:text></office:body></office:document-content>`;
    const heading = (n, size) => `<style:style style:name="Heading_20_${n}" style:display-name="Heading ${n}" style:family="paragraph" style:parent-style-name="Heading" style:next-style-name="Standard" style:default-outline-level="${n}"><style:text-properties fo:font-size="${size}pt" fo:font-weight="bold"/></style:style>`;
    const page = ds.pageSize || { width: 793.7, height: 1122.5 };
    const styles = `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-styles ${ns}><office:styles>`
      + '<style:default-style style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.212cm"/><style:text-properties style:font-name="Liberation Sans" fo:font-family="\'Liberation Sans\'" fo:font-size="11pt"/></style:default-style>'
      + '<style:style style:name="Standard" style:family="paragraph" style:class="text"/>'
      + '<style:style style:name="Heading" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-top="0.423cm" fo:margin-bottom="0.212cm" fo:keep-with-next="always"/></style:style>'
      + '<style:style style:name="Title" style:family="paragraph" style:parent-style-name="Heading"><style:paragraph-properties fo:text-align="center"/><style:text-properties fo:font-size="26pt" fo:font-weight="bold"/></style:style>'
      + '<style:style style:name="Subtitle" style:family="paragraph" style:parent-style-name="Heading"><style:paragraph-properties fo:text-align="center"/><style:text-properties fo:font-size="16pt" fo:color="#595959"/></style:style>'
      + [[1, 18], [2, 16], [3, 14], [4, 13], [5, 12]].map(([n, s]) => heading(n, s)).join("")
      + `</office:styles><office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="${cm(page.width)}" fo:page-height="${cm(page.height)}" fo:margin-top="${cm(ds.marginTop ?? 75.6)}" fo:margin-bottom="${cm(ds.marginBottom ?? 75.6)}" fo:margin-left="${cm(ds.marginLeft ?? 75.6)}" fo:margin-right="${cm(ds.marginRight ?? 75.6)}"/></style:page-layout></office:automatic-styles>`
      + `<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1">${header ? `<style:header>${header}</style:header>` : ""}${footer ? `<style:footer>${footer}</style:footer>` : ""}</style:master-page></office:master-styles></office:document-styles>`;
    // the header/footer styles were collected while writing them: content.xml has all automatic styles; styles.xml needs those of the header/footer too
    const stylesWithAutos = styles.replace("<office:automatic-styles>", `<office:automatic-styles>${[...this.autoStyles.values()].map((s) => `<style:style style:name="${s.name}" style:family="${s.family}"${s.extra}>${s.props}</style:style>`).join("")}${lists}`);
    const manifest = `<?xml version="1.0" encoding="UTF-8"?>\n<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>${Object.keys(this.pictures).map((p) => `<manifest:file-entry manifest:full-path="${p}" manifest:media-type="${MIME[p.split(".").pop()] || "image/png"}"/>`).join("")}</manifest:manifest>`;
    const meta = `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" office:version="1.3"><office:meta><meta:generator>Portable Web App Suite</meta:generator></office:meta></office:document-meta>`;
    return zipSync({
      mimetype: [strToU8("application/vnd.oasis.opendocument.text"), { level: 0 }], // stored and first, as the format requires
      "content.xml": strToU8(content), "styles.xml": strToU8(stylesWithAutos), "meta.xml": strToU8(meta), "META-INF/manifest.xml": strToU8(manifest),
      ...Object.fromEntries(Object.entries(this.pictures).map(([k, v]) => [k, [v, { level: 0 }]])),
    });
  }
}

export function writeOdt(data) {
  return new OdtWriter(data).write();
}
