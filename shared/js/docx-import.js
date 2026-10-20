/*
 * Direct DOCX reader for Univer Docs: WordprocessingML -> Univer document data (IDocumentData).
 * ES module; needs fflate and @univerjs/docs (buildDocTransform).
 *
 * Supported: page size and margins; style inheritance (document defaults -> paragraph style chain ->
 * character style chain -> direct formatting); headings/title/subtitle; alignment, spacing, line spacing,
 * indentation; bold, italic, underline, strike, size, font (incl. theme fonts), color, highlight/shading,
 * super/subscript; bullet and numbered lists (numbering.xml, also via styles) with levels; tables
 * (column widths, cell shading, horizontal and vertical merges); inline and floating images (as inline);
 * hyperlinks; tabs, page breaks, line breaks; fields (their current result); content controls;
 * default and first-page header/footer; automatic hyphenation setting; footnotes and endnotes (the reference as a superscript
 * number, the notes at the end of the document, as Univer has no notes).
 */
import { unzipSync, strFromU8 } from "fflate";
import { buildDocTransform } from "@univerjs/docs";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const TWIP_PER_PX = 15; // 1440 twips per inch, 96 px per inch
const EMU_PER_PX = 9525;
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp", svg: "image/svg+xml", webp: "image/webp" };
const HIGHLIGHT = {
  yellow: "#FFFF00", green: "#00FF00", cyan: "#00FFFF", magenta: "#FF00FF", blue: "#0000FF", red: "#FF0000",
  darkBlue: "#000080", darkCyan: "#008080", darkGreen: "#008000", darkMagenta: "#800080", darkRed: "#800000",
  darkYellow: "#808000", darkGray: "#808080", lightGray: "#C0C0C0", black: "#000000", white: "#FFFFFF",
};
const ALIGN = { left: 1, start: 1, center: 2, right: 3, end: 3, both: 4, distribute: 4, justify: 4 };
const ORDERED = new Set(["decimal", "decimalZero", "lowerLetter", "upperLetter", "lowerRoman", "upperRoman", "ordinal", "cardinalText", "ordinalText"]);

// ---- XML helpers ----------------------------------------------------------------------------------

const parse = (text) => new DOMParser().parseFromString(text, "application/xml");
const children = (el, local, ns = W) => (el ? [...el.children].filter((c) => c.localName === local && c.namespaceURI === ns) : []);
const child = (el, local, ns = W) => children(el, local, ns)[0] || null;
const val = (el, name = "val") => (el ? el.getAttributeNS(W, name) ?? el.getAttribute(`w:${name}`) : null);
const on = (el) => !!el && !["0", "false", "off", "none"].includes(val(el));
const num = (v, d = 0) => (v === null || v === undefined || v === "" ? d : Number(v));
const rid = (el, name) => el && (el.getAttributeNS(R, name) || el.getAttribute(`r:${name}`));
const randomId = (prefix) => `${prefix}${Math.random().toString(36).slice(2, 10)}`;

function resolvePath(base, target) {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

// ---- package --------------------------------------------------------------------------------------

class Package {
  constructor(buffer) { this.files = unzipSync(new Uint8Array(buffer)); }

  xml(name) { return this.files[name] ? parse(strFromU8(this.files[name])) : null; }

  rels(name) {
    const parts = name.split("/");
    const doc = this.xml([...parts.slice(0, -1), "_rels", parts[parts.length - 1] + ".rels"].join("/"));
    const map = {};
    if (doc) for (const r of doc.documentElement.children) map[r.getAttribute("Id")] = { type: r.getAttribute("Type"), target: r.getAttribute("TargetMode") === "External" ? r.getAttribute("Target") : resolvePath(name, r.getAttribute("Target")), external: r.getAttribute("TargetMode") === "External" };
    return map;
  }

  part(type) {
    const rels = this.rels("word/document.xml");
    const rel = Object.values(rels).find((r) => r.type.endsWith("/" + type));
    return rel ? rel.target : null;
  }

  dataUrl(name) {
    const bytes = this.files[name];
    if (!bytes) return null;
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return `data:${MIME[name.split(".").pop().toLowerCase()] || "application/octet-stream"};base64,${btoa(s)}`;
  }
}

// ---- styles, numbering, theme ---------------------------------------------------------------------

function readTheme(doc) {
  const font = (kind) => {
    const f = doc && doc.getElementsByTagNameNS(A, kind)[0];
    const latin = f && child(f, "latin", A);
    return latin ? latin.getAttribute("typeface") : null;
  };
  return { major: font("majorFont") || "Calibri Light", minor: font("minorFont") || "Calibri" };
}

function readStyles(doc) {
  const styles = {};
  let defaultParagraph = null;
  let defaultCharacter = null;
  const root = doc && doc.documentElement;
  for (const s of children(root, "style")) {
    const id = val(s, "styleId");
    styles[id] = {
      id, type: val(s, "type"), name: (val(child(s, "name")) || "").toLowerCase(), basedOn: val(child(s, "basedOn")),
      pPr: child(s, "pPr"), rPr: child(s, "rPr"),
    };
    if (val(s, "default") === "1" && val(s, "type") === "paragraph") defaultParagraph = id;
    if (val(s, "default") === "1" && val(s, "type") === "character") defaultCharacter = id;
  }
  const defaults = child(root, "docDefaults");
  return {
    styles, defaultParagraph, defaultCharacter,
    rPrDefault: defaults && child(child(defaults, "rPrDefault"), "rPr"),
    pPrDefault: defaults && child(child(defaults, "pPrDefault"), "pPr"),
  };
}

/** Style chain from the most general (root of basedOn) to the given style. */
function styleChain(styles, id) {
  const chain = [];
  const seen = new Set();
  while (id && styles.styles[id] && !seen.has(id)) {
    seen.add(id);
    chain.unshift(styles.styles[id]);
    id = styles.styles[id].basedOn;
  }
  return chain;
}

function readNumbering(doc) {
  const abstract = {};
  const nums = {};
  if (!doc) return { abstract, nums };
  for (const a of children(doc.documentElement, "abstractNum")) {
    const levels = {};
    for (const lvl of children(a, "lvl")) levels[val(lvl, "ilvl")] = { format: val(child(lvl, "numFmt")) || "bullet", text: val(child(lvl, "lvlText")) || "" };
    abstract[val(a, "abstractNumId")] = levels;
  }
  for (const n of children(doc.documentElement, "num")) nums[val(n, "numId")] = val(child(n, "abstractNumId"));
  return { abstract, nums };
}

// ---- property resolution --------------------------------------------------------------------------

function applyRunProps(rPr, into, ctx) {
  if (!rPr) return into;
  const b = child(rPr, "b");
  if (b) into.bl = on(b) ? 1 : 0;
  const i = child(rPr, "i");
  if (i) into.it = on(i) ? 1 : 0;
  const u = child(rPr, "u");
  if (u) into.ul = { s: val(u) && val(u) !== "none" ? 1 : 0 };
  const strike = child(rPr, "strike") || child(rPr, "dstrike");
  if (strike) into.st = { s: on(strike) ? 1 : 0 };
  const sz = child(rPr, "sz");
  if (sz) into.fs = num(val(sz)) / 2;
  const color = child(rPr, "color");
  if (color && val(color) && val(color) !== "auto") into.cl = { rgb: "#" + val(color).toUpperCase() };
  const fonts = child(rPr, "rFonts");
  if (fonts) {
    const theme = val(fonts, "asciiTheme") || val(fonts, "hAnsiTheme");
    const face = val(fonts, "ascii") || val(fonts, "hAnsi");
    if (theme) into.ff = /major/.test(theme) ? ctx.theme.major : ctx.theme.minor;
    else if (face) into.ff = face;
  }
  const highlight = child(rPr, "highlight");
  if (highlight && HIGHLIGHT[val(highlight)]) into.bg = { rgb: HIGHLIGHT[val(highlight)] };
  const shd = child(rPr, "shd");
  if (shd && val(shd, "fill") && val(shd, "fill") !== "auto") into.bg = { rgb: "#" + val(shd, "fill").toUpperCase() };
  const va = child(rPr, "vertAlign");
  if (va) into.va = val(va) === "superscript" ? 3 : val(va) === "subscript" ? 2 : 1;
  return into;
}

function applyParagraphProps(pPr, into) {
  if (!pPr) return into;
  const jc = child(pPr, "jc");
  if (jc && ALIGN[val(jc)]) into.align = ALIGN[val(jc)];
  const spacing = child(pPr, "spacing");
  if (spacing) {
    if (val(spacing, "before") !== null) into.before = num(val(spacing, "before")) / 20;
    if (val(spacing, "after") !== null) into.after = num(val(spacing, "after")) / 20;
    if (val(spacing, "line") !== null) {
      const rule = val(spacing, "lineRule") || "auto";
      into.line = rule === "auto" ? { v: num(val(spacing, "line")) / 240, rule: 0 } : { v: num(val(spacing, "line")) / 20, rule: rule === "exact" ? 2 : 1 };
    }
  }
  const ind = child(pPr, "ind");
  if (ind) {
    const left = val(ind, "left") ?? val(ind, "start");
    if (left !== null) into.indentStart = num(left) / 20;
    if (val(ind, "hanging") !== null) into.hanging = num(val(ind, "hanging")) / 20;
    if (val(ind, "firstLine") !== null) into.firstLine = num(val(ind, "firstLine")) / 20;
  }
  const numPr = child(pPr, "numPr");
  if (numPr) {
    if (child(numPr, "numId")) into.numId = val(child(numPr, "numId"));
    if (child(numPr, "ilvl")) into.ilvl = num(val(child(numPr, "ilvl")));
  }
  const outline = child(pPr, "outlineLvl");
  if (outline) into.outline = num(val(outline));
  if (on(child(pPr, "pageBreakBefore"))) into.pageBreakBefore = true;
  return into;
}

function headingOf(chain, props) {
  for (const s of [...chain].reverse()) {
    if (s.name === "title") return 2;
    if (s.name === "subtitle") return 3;
    const m = /^heading (\d)$/.exec(s.name);
    if (m) return Math.min(8, 3 + Number(m[1]));
  }
  return props.outline !== undefined && props.outline < 5 ? 4 + props.outline : undefined;
}

// ---- document builder -----------------------------------------------------------------------------

export class Body {
  constructor() {
    this.body = { dataStream: "", textRuns: [], paragraphs: [], sectionBreaks: [], tables: [], customBlocks: [], customRanges: [] };
  }

  get length() { return this.body.dataStream.length; }

  text(text, ts) {
    if (!text) return;
    const st = this.length;
    this.body.dataStream += text;
    if (ts && Object.keys(ts).length) {
      const last = this.body.textRuns[this.body.textRuns.length - 1];
      if (last && last.ed === st && JSON.stringify(last.ts) === JSON.stringify(ts)) last.ed = this.length;
      else this.body.textRuns.push({ st, ed: this.length, ts: { ...ts } });
    }
  }

  paragraph(paragraphStyle, bullet) {
    const p = { startIndex: this.length, paragraphId: randomId("p") };
    if (paragraphStyle && Object.keys(paragraphStyle).length) p.paragraphStyle = paragraphStyle;
    if (bullet) p.bullet = bullet;
    this.body.dataStream += "\r";
    this.body.paragraphs.push(p);
  }

  section() {
    this.body.sectionBreaks.push({ startIndex: this.length, sectionId: randomId("s") });
    this.body.dataStream += "\n";
  }
}

class DocxReader {
  constructor(buffer) {
    this.pkg = new Package(buffer);
    const docName = "word/document.xml";
    this.doc = this.pkg.xml(docName);
    if (!this.doc) throw new Error("not a Word (DOCX) file");
    const stylesName = this.pkg.part("styles");
    const numberingName = this.pkg.part("numbering");
    const themeName = this.pkg.part("theme");
    const settingsName = this.pkg.part("settings");
    this.styles = readStyles(stylesName && this.pkg.xml(stylesName));
    this.numbering = readNumbering(numberingName && this.pkg.xml(numberingName));
    this.theme = readTheme(themeName && this.pkg.xml(themeName));
    this.settings = settingsName && this.pkg.xml(settingsName);
    this.id = randomId("doc-");
    this.tableSource = {};
    this.drawings = {};
    this.drawingsOrder = [];
    this.warnings = new Set();
    this.notes = []; // { label, kind, id } in the order of their references
  }

  /** Effective run style for a run in a paragraph with the given style. */
  runStyle(pStyleId, rPr) {
    const ts = { fs: 11, ff: this.theme.minor };
    applyRunProps(this.styles.rPrDefault, ts, this);
    for (const s of styleChain(this.styles, pStyleId || this.styles.defaultParagraph)) applyRunProps(s.rPr, ts, this);
    const rStyle = rPr && child(rPr, "rStyle");
    if (rStyle) for (const s of styleChain(this.styles, val(rStyle))) applyRunProps(s.rPr, ts, this);
    applyRunProps(rPr, ts, this);
    // drop "off" values to keep the runs small
    for (const k of ["bl", "it"]) if (!ts[k]) delete ts[k];
    for (const k of ["ul", "st"]) if (ts[k] && !ts[k].s) delete ts[k];
    if (ts.va === 1) delete ts.va;
    return ts;
  }

  paragraphStyle(pPr) {
    const pStyleId = val(child(pPr, "pStyle")) || this.styles.defaultParagraph;
    const chain = styleChain(this.styles, pStyleId);
    const props = {};
    applyParagraphProps(this.styles.pPrDefault, props);
    for (const s of chain) applyParagraphProps(s.pPr, props);
    applyParagraphProps(pPr, props);
    const style = {};
    const heading = headingOf(chain, props);
    if (heading) style.namedStyleType = heading;
    if (props.align) style.horizontalAlign = props.align;
    if (props.before !== undefined) style.spaceAbove = { v: props.before };
    if (props.after !== undefined) style.spaceBelow = { v: props.after };
    if (props.line) { style.lineSpacing = props.line.v; style.spacingRule = props.line.rule; }
    if (props.indentStart !== undefined) style.indentStart = { v: props.indentStart };
    if (props.hanging !== undefined) style.hanging = { v: props.hanging };
    if (props.firstLine !== undefined) style.indentFirstLine = { v: props.firstLine };
    let bullet = null;
    if (props.numId && props.numId !== "0" && this.numbering.nums[props.numId] !== undefined) {
      const level = (this.numbering.abstract[this.numbering.nums[props.numId]] || {})[props.ilvl || 0] || { format: "bullet" };
      bullet = { listType: ORDERED.has(level.format) ? "ORDER_LIST" : "BULLET_LIST", listId: `list-${props.numId}`, nestingLevel: props.ilvl || 0 };
      // Univer lays out list indentation itself
      delete style.indentStart;
      delete style.hanging;
    }
    return { pStyleId, style, bullet, pageBreakBefore: props.pageBreakBefore };
  }

  // ---- block level ----

  blocks(container, out, rels) {
    for (const el of container.children) {
      if (el.namespaceURI !== W) continue;
      if (el.localName === "p") this.paragraph(el, out, rels);
      else if (el.localName === "tbl") this.table(el, out, rels);
      else if (el.localName === "sdt") { const content = child(el, "sdtContent"); if (content) this.blocks(content, out, rels); }
      else if (el.localName === "customXml") this.blocks(el, out, rels);
    }
  }

  paragraph(p, out, rels) {
    const pPr = child(p, "pPr");
    const { pStyleId, style, bullet, pageBreakBefore } = this.paragraphStyle(pPr);
    const ctx = { out, rels, pStyleId, style, bullet, field: null };
    if (pageBreakBefore && out.length) out.text("\f");
    this.inlines(p, ctx);
    out.paragraph(style, bullet);
  }

  inlines(container, ctx) {
    for (const el of container.children) {
      if (el.namespaceURI !== W) continue;
      switch (el.localName) {
        case "r": this.run(el, ctx); break;
        case "hyperlink": {
          const rel = ctx.rels[rid(el, "id")];
          const start = ctx.out.length;
          this.inlines(el, ctx);
          const url = rel ? rel.target : (val(el, "anchor") ? `#${val(el, "anchor")}` : null);
          if (url && ctx.out.length > start) ctx.out.body.customRanges.push({ startIndex: start, endIndex: ctx.out.length - 1, rangeId: randomId("link"), rangeType: 0, properties: { url } });
          break;
        }
        case "sdt": { const content = child(el, "sdtContent"); if (content) this.inlines(content, ctx); break; }
        case "smartTag": case "customXml": case "ins": case "fldSimple": this.inlines(el, ctx); break;
        default: break; // bookmarks, proofErr, del (deleted text), ...
      }
    }
  }

  run(r, ctx) {
    const rPr = child(r, "rPr");
    const ts = this.runStyle(ctx.pStyleId, rPr);
    for (const el of r.children) {
      if (el.namespaceURI !== W && el.localName !== "AlternateContent") continue;
      switch (el.localName) {
        case "fldChar": {
          const type = val(el, "fldCharType");
          if (type === "begin") ctx.field = "instr";
          else if (type === "separate") ctx.field = "result";
          else if (type === "end") ctx.field = null;
          break;
        }
        case "instrText": break;
        case "t": if (ctx.field !== "instr") ctx.out.text(el.textContent, ts); break;
        case "tab": ctx.out.text("\t", ts); break;
        case "noBreakHyphen": ctx.out.text("‑", ts); break;
        case "softHyphen": ctx.out.text("­", ts); break;
        case "sym": ctx.out.text(String.fromCharCode(parseInt(val(el, "char"), 16) & 0xFFFF), ts); break;
        case "br": case "cr":
          if (val(el, "type") === "page") ctx.out.text("\f", ts);
          else { ctx.out.paragraph(ctx.style, ctx.bullet); this.warnings.add("line breaks are imported as paragraph breaks"); }
          break;
        case "drawing": this.drawing(el, ctx); break;
        case "footnoteReference": case "endnoteReference": {
          const kind = el.localName === "footnoteReference" ? "footnotes" : "endnotes";
          const label = String(this.notes.filter((n) => n.kind === kind).length + 1) + (kind === "endnotes" ? "*" : "");
          this.notes.push({ label, kind, id: val(el, "id") });
          ctx.out.text(label, { ...ts, va: 3 });
          break;
        }
        case "AlternateContent": {
          const choice = [...el.children].find((c) => c.localName === "Choice") || [...el.children].find((c) => c.localName === "Fallback");
          if (choice) for (const d of choice.getElementsByTagNameNS(W, "drawing")) this.drawing(d, ctx);
          break;
        }
        default: break;
      }
    }
  }

  drawing(el, ctx) {
    const holder = el.firstElementChild; // wp:inline or wp:anchor
    if (!holder) return;
    if (holder.localName === "anchor") this.warnings.add("floating images are imported as inline images");
    const extent = [...holder.children].find((c) => c.localName === "extent");
    const blip = holder.getElementsByTagNameNS(A, "blip")[0];
    const rel = blip && ctx.rels[rid(blip, "embed")];
    const source = rel && !rel.external ? this.pkg.dataUrl(rel.target) : null;
    if (!source || !extent) return;
    const width = num(extent.getAttribute("cx")) / EMU_PER_PX;
    const height = num(extent.getAttribute("cy")) / EMU_PER_PX;
    const id = randomId("img");
    ctx.out.body.customBlocks.push({ startIndex: ctx.out.length, blockId: id });
    ctx.out.body.dataStream += "\b";
    const docPr = [...holder.children].find((c) => c.localName === "docPr");
    this.drawings[id] = {
      drawingId: id, title: (docPr && docPr.getAttribute("name")) || "", description: (docPr && docPr.getAttribute("descr")) || "",
      imageSourceType: "BASE64", source, transform: { width, height, left: 0 }, docTransform: buildDocTransform(width, height),
      layoutType: 0, drawingType: 0, unitId: this.id, subUnitId: this.id,
    };
    this.drawingsOrder.push(id);
  }

  table(tbl, out, rels) {
    const grid = children(child(tbl, "tblGrid"), "gridCol").map((c) => num(val(c, "w")) / TWIP_PER_PX);
    const rows = children(tbl, "tr");
    // vertical merges: count the rows each "restart" cell spans
    const matrix = rows.map((tr) => {
      let col = 0;
      return children(tr, "tc").map((tc) => {
        const tcPr = child(tc, "tcPr");
        const span = num(val(child(tcPr, "gridSpan")), 1);
        const vMerge = child(tcPr, "vMerge");
        const cell = { tc, col, span, vMerge: vMerge ? (val(vMerge) === "restart" ? "restart" : "continue") : null, rowSpan: 1 };
        col += span;
        return cell;
      });
    });
    matrix.forEach((row, r) => row.forEach((cell) => {
      if (cell.vMerge !== "restart") return;
      for (let rr = r + 1; rr < matrix.length; rr++) {
        const below = matrix[rr].find((c) => c.col === cell.col);
        if (!below || below.vMerge !== "continue") break;
        cell.rowSpan++;
      }
    }));
    const tableId = randomId("t");
    const start = out.length;
    out.body.dataStream += "\x1a";
    const tableRows = [];
    matrix.forEach((row, r) => {
      out.body.dataStream += "\x1b";
      const trPr = child(rows[r], "trPr");
      const height = num(val(child(trPr, "trHeight")), 0) / TWIP_PER_PX;
      const tableCells = [];
      for (const cell of row) {
        out.body.dataStream += "\x1c";
        if (cell.vMerge !== "continue") this.blocks(cell.tc, out, rels);
        if (out.body.dataStream.endsWith("\x1c")) out.paragraph({}, null); // a cell needs at least one paragraph
        out.section();
        out.body.dataStream += "\x1d";
        const tcPr = child(cell.tc, "tcPr");
        const shd = child(tcPr, "shd");
        const spec = { margin: { start: { v: 10 }, end: { v: 10 }, top: { v: 5 }, bottom: { v: 5 } } };
        if (cell.span > 1) spec.columnSpan = cell.span;
        if (cell.rowSpan > 1) spec.rowSpan = cell.rowSpan;
        if (cell.vMerge === "continue") spec.rowSpan = 0;
        if (shd && val(shd, "fill") && val(shd, "fill") !== "auto") spec.backgroundColor = { rgb: "#" + val(shd, "fill").toUpperCase() };
        tableCells.push(spec);
      }
      out.body.dataStream += "\x0e";
      tableRows.push({ tableCells, trHeight: { val: { v: Math.max(height, 20) }, hRule: 0 } });
    });
    out.body.dataStream += "\x0f";
    out.body.tables.push({ startIndex: start, endIndex: out.length, tableId });
    const columns = grid.length ? grid : [600];
    this.tableSource[tableId] = {
      tableId, tableRows,
      tableColumns: columns.map((w) => ({ size: { type: 1, width: { v: w } } })),
      align: 0, indent: { v: 0 }, textWrap: 0,
      position: { positionH: { relativeFrom: 0, posOffset: 0 }, positionV: { relativeFrom: 0, posOffset: 0 } },
      dist: { distB: 0, distL: 0, distR: 0, distT: 0 },
      cellMargin: { start: { v: 10 }, end: { v: 10 }, top: { v: 5 }, bottom: { v: 5 } },
      size: { type: 1, width: { v: columns.reduce((a, b) => a + b, 0) } },
    };
  }

  /** Footnotes and endnotes after a separator line at the end of the document. */
  appendNotes(out) {
    if (!this.notes.length) return;
    const parts = {};
    for (const kind of ["footnotes", "endnotes"]) {
      const name = this.pkg.part(kind);
      const doc = name && this.pkg.xml(name);
      if (doc) parts[kind] = { doc, rels: this.pkg.rels(name) };
    }
    out.text("—————");
    out.paragraph({}, null);
    for (const n of this.notes) {
      const part = parts[n.kind];
      const note = part && [...part.doc.documentElement.children].find((c) => c.localName === n.kind.slice(0, -1) && val(c, "id") === n.id);
      const start = out.length;
      out.text(`${n.label} `, { va: 3 });
      if (note) this.blocks(note, out, part.rels);
      if (out.length === start + n.label.length + 1) out.paragraph({}, null);
    }
    this.warnings.add("footnotes and endnotes are placed at the end of the document");
  }

  /** Header or footer part -> Univer body. */
  headerFooter(name) {
    const doc = this.pkg.xml(name);
    if (!doc) return null;
    const out = new Body();
    this.blocks(doc.documentElement, out, this.pkg.rels(name));
    out.section();
    return out.body;
  }

  read() {
    const docName = "word/document.xml";
    const bodyEl = child(this.doc.documentElement, "body");
    const out = new Body();
    this.blocks(bodyEl, out, this.pkg.rels(docName));
    this.appendNotes(out);
    out.section();

    const sectPr = child(bodyEl, "sectPr");
    const pgSz = child(sectPr, "pgSz");
    const pgMar = child(sectPr, "pgMar");
    const px = (el, name, d) => num(el ? val(el, name) : null, d) / TWIP_PER_PX;
    const documentStyle = {
      documentFlavor: 1,
      pageSize: { width: px(pgSz, "w", 11906), height: px(pgSz, "h", 16838) },
      marginTop: px(pgMar, "top", 1440), marginBottom: px(pgMar, "bottom", 1440),
      marginLeft: px(pgMar, "left", 1440), marginRight: px(pgMar, "right", 1440),
      marginHeader: px(pgMar, "header", 708), marginFooter: px(pgMar, "footer", 708),
      autoHyphenation: this.settings && on(this.settings.documentElement.getElementsByTagNameNS(W, "autoHyphenation")[0]) ? 1 : 0,
    };
    const headers = {};
    const footers = {};
    const rels = this.pkg.rels(docName);
    for (const [tag, store, prefix] of [["headerReference", headers, "Header"], ["footerReference", footers, "Footer"]]) {
      for (const ref of children(sectPr, tag)) {
        const type = val(ref, "type") || "default";
        const rel = rels[rid(ref, "id")];
        if (!rel || (type !== "default" && type !== "first")) continue;
        const body = this.headerFooter(rel.target);
        if (!body) continue;
        const id = randomId(prefix.toLowerCase());
        store[id] = { [`${prefix.toLowerCase()}Id`]: id, body };
        documentStyle[type === "first" ? `firstPage${prefix}Id` : `default${prefix}Id`] = id;
      }
    }
    if (child(sectPr, "titlePg")) documentStyle.useFirstPageHeaderFooter = 1;
    return {
      data: {
        id: this.id, title: "", body: out.body, documentStyle, tableSource: this.tableSource,
        drawings: this.drawings, drawingsOrder: this.drawingsOrder, headers, footers,
        // Univer's drawing plugin (@univerjs/docs-drawing) loads the images from this resource
        resources: [{ name: "DOC_DRAWING_PLUGIN", data: JSON.stringify({ data: this.drawings, order: this.drawingsOrder }) }],
      },
      warnings: [...this.warnings],
    };
  }
}

/** DOCX (ArrayBuffer) -> { data: IDocumentData, warnings: [string] } */
export function readDocx(buffer) {
  return new DocxReader(buffer).read();
}
