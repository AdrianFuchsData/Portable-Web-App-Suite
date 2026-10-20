/*
 * PPTX reader for the presentation app. ES module; needs fflate (vendor/esm/slides).
 *
 * Produces the deck model (units: px at 96 dpi, font sizes in pt):
 *   deck    = { width, height, slides: [slide] }
 *   slide   = { id, background: '#RRGGBB' | null, elements: [element], notes?, transition?, animations? }
 *   transition = { type: 'fade'|'push'|'wipe'|'cover'|'zoom', dir: 'l'|'r'|'u'|'d', duration (s), advanceAfter (s, optional) }
 *   animations = [{ id (element), effect: 'appear'|'fade'|'fly'|'zoom', start: 'click'|'with'|'after' }] in playing order
 *   element = { id, type: 'text'|'shape'|'image'|'table', name, x, y, w, h, rot, flipH, flipV,
 *               geometry, fill, line: {color, width} | null, text, image: {src}, table, placeholder }
 *   text    = { anchor: 't'|'ctr'|'b', insets: [l, t, r, b], paragraphs: [paragraph] }
 *   paragraph = { align: 'l'|'ctr'|'r'|'just', level, bullet: null | {char} | {auto}, runs: [run] }
 *   run     = { text, bold, italic, underline, strike, size, color, font }
 *   table   = { columns: [width], rows: [{ height, cells: [{ text, fill }] }] }
 *
 * Placeholder positions and text styles are inherited along slide -> layout -> master (and the
 * master's title/body/other text styles); theme colors (incl. lumMod/lumOff/tint/shade) and theme
 * fonts are resolved.
 */
import { unzipSync, strFromU8 } from "fflate";

const EMU_PER_PX = 9525;
const NS = {
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
};
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", bmp: "image/bmp", webp: "image/webp", emf: "image/emf", wmf: "image/wmf" };

// ---- small XML helpers ----------------------------------------------------------------------------

const parse = (text) => new DOMParser().parseFromString(text, "application/xml");
/** Direct child elements with the given prefixed name ("a:p"). */
function kids(el, name) {
  if (!el) return [];
  const [prefix, local] = name.split(":");
  return [...el.children].filter((c) => c.localName === local && c.namespaceURI === NS[prefix]);
}
const kid = (el, name) => kids(el, name)[0] || null;
/** Follow a path of child names: path(el, "p:spPr", "a:xfrm"). */
function path(el, ...names) {
  for (const n of names) { el = kid(el, n); if (!el) return null; }
  return el;
}
const num = (v, d = 0) => (v === null || v === undefined || v === "" ? d : Number(v));
const attr = (el, name) => (el ? el.getAttribute(name) : null);
const rId = (el) => el && (el.getAttributeNS(NS.r, "embed") || el.getAttributeNS(NS.r, "id") || el.getAttribute("r:embed") || el.getAttribute("r:id"));

function resolvePath(base, target) {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

// ---- colors ---------------------------------------------------------------------------------------

function hexToHsl(hex) {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.substr(i, 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6;
  }
  return [h, s, l];
}

function hslToHex(h, s, l) {
  const f = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r; let g; let b;
  if (s === 0) { r = g = b = l; } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    [r, g, b] = [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)];
  }
  return [r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

const PRESET_COLORS = { black: "000000", white: "FFFFFF", red: "FF0000", green: "008000", blue: "0000FF", yellow: "FFFF00", gray: "808080" };

/** Color of a color container (solidFill, fontRef, ...) -> '#RRGGBB' or null. */
function color(container, ctx) {
  if (!container) return null;
  const c = [...container.children].find((e) => ["srgbClr", "schemeClr", "sysClr", "prstClr", "scrgbClr", "hslClr"].includes(e.localName));
  if (!c) return null;
  let hex;
  if (c.localName === "srgbClr") hex = attr(c, "val");
  else if (c.localName === "sysClr") hex = attr(c, "lastClr") || (attr(c, "val") === "window" ? "FFFFFF" : "000000");
  else if (c.localName === "prstClr") hex = PRESET_COLORS[attr(c, "val")] || "000000";
  else if (c.localName === "schemeClr") {
    let name = attr(c, "val");
    if (name === "phClr" && ctx.phColor) return applyMods(ctx.phColor.slice(1), c);
    name = ctx.clrMap[name] || name;
    hex = ctx.theme.colors[name];
  }
  if (!hex) return null;
  return applyMods(hex, c);
}

function applyMods(hex, el) {
  let [h, s, l] = hexToHsl(hex.toUpperCase());
  let changed = false;
  for (const m of el.children) {
    const v = num(attr(m, "val")) / 100000;
    if (m.localName === "lumMod") { l *= v; changed = true; } else if (m.localName === "lumOff") { l += v; changed = true; } else if (m.localName === "tint") { l = l * v + (1 - v); changed = true; } else if (m.localName === "shade") { l *= v; changed = true; }
  }
  return "#" + (changed ? hslToHex(h, s, Math.min(1, Math.max(0, l))) : hex.toUpperCase());
}

// ---- theme and package ----------------------------------------------------------------------------

function readTheme(doc) {
  const colors = {};
  const scheme = doc && doc.getElementsByTagNameNS(NS.a, "clrScheme")[0];
  if (scheme) {
    for (const el of scheme.children) {
      const c = el.firstElementChild;
      if (c) colors[el.localName] = c.localName === "sysClr" ? attr(c, "lastClr") || "000000" : attr(c, "val");
    }
  }
  const font = (kind) => {
    const f = doc && doc.getElementsByTagNameNS(NS.a, kind)[0];
    const latin = f && kid(f, "a:latin");
    return latin ? attr(latin, "typeface") : "Calibri";
  };
  return { colors, major: font("majorFont"), minor: font("minorFont") };
}

class Package {
  constructor(buffer) {
    this.files = unzipSync(new Uint8Array(buffer));
    this.cache = new Map();
  }

  xml(name) {
    if (!this.cache.has(name)) this.cache.set(name, this.files[name] ? parse(strFromU8(this.files[name])) : null);
    return this.cache.get(name);
  }

  rels(name) {
    const parts = name.split("/");
    const relsName = [...parts.slice(0, -1), "_rels", parts[parts.length - 1] + ".rels"].join("/");
    const doc = this.xml(relsName);
    const map = {};
    if (doc) for (const r of doc.documentElement.children) map[attr(r, "Id")] = { type: attr(r, "Type"), target: resolvePath(name, attr(r, "Target")), external: attr(r, "TargetMode") === "External" };
    return map;
  }

  relOfType(name, type) {
    return Object.values(this.rels(name)).find((r) => r.type.endsWith("/" + type));
  }

  dataUrl(name) {
    const bytes = this.files[name];
    if (!bytes) return null;
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return `data:${MIME[name.split(".").pop().toLowerCase()] || "application/octet-stream"};base64,${btoa(s)}`;
  }
}

// ---- placeholders and inherited styles ------------------------------------------------------------

function placeholderOf(sp) {
  const ph = path(sp, "p:nvSpPr", "p:nvPr", "p:ph") || path(sp, "p:nvPicPr", "p:nvPr", "p:ph") || path(sp, "p:nvGraphicFramePr", "p:nvPr", "p:ph");
  return ph ? { type: attr(ph, "type") || "body", idx: attr(ph, "idx") } : null;
}

const TITLE_TYPES = new Set(["title", "ctrTitle"]);
/** title/ctrTitle -> "title"; body/obj/subTitle -> "body"; others (dt, ftr, sldNum, pic, ...) unchanged. */
const kind = (type) => (TITLE_TYPES.has(type) ? "title" : ["body", "obj", "subTitle"].includes(type) ? "body" : type);

/** Find the matching placeholder shape in a layout or master tree. */
function findPlaceholder(tree, ph, byTypeOnly = false) {
  if (!tree || !ph) return null;
  const shapes = [...tree.getElementsByTagNameNS(NS.p, "sp")];
  const withPh = shapes.map((s) => [s, placeholderOf(s)]).filter(([, p]) => p);
  if (!byTypeOnly && ph.idx !== null) {
    const byIdx = withPh.find(([, p]) => p.idx === ph.idx);
    if (byIdx) return byIdx[0];
  }
  const byType = withPh.find(([, p]) => p.type === ph.type) || withPh.find(([, p]) => kind(p.type) === kind(ph.type));
  return byType ? byType[0] : null;
}

function xfrmOf(sp) {
  const x = path(sp, "p:spPr", "a:xfrm") || path(sp, "p:xfrm") || path(sp, "p:grpSpPr", "a:xfrm");
  if (!x) return null;
  const off = kid(x, "a:off");
  const ext = kid(x, "a:ext");
  if (!off || !ext) return null;
  return {
    x: num(attr(off, "x")), y: num(attr(off, "y")), cx: num(attr(ext, "cx")), cy: num(attr(ext, "cy")),
    rot: num(attr(x, "rot")) / 60000, flipH: attr(x, "flipH") === "1", flipV: attr(x, "flipV") === "1",
    chOff: kid(x, "a:chOff"), chExt: kid(x, "a:chExt"),
  };
}

/** Paragraph properties at a list level from a list style container (lstStyle, titleStyle, ...). */
function levelProps(container, level) {
  return container ? kid(container, `a:lvl${level + 1}pPr`) : null;
}

// ---- text -----------------------------------------------------------------------------------------

function runProps(rPr, ctx, into) {
  if (!rPr) return into;
  if (attr(rPr, "sz")) into.size = num(attr(rPr, "sz")) / 100;
  if (attr(rPr, "b") !== null) into.bold = attr(rPr, "b") === "1" || attr(rPr, "b") === "true";
  if (attr(rPr, "i") !== null) into.italic = attr(rPr, "i") === "1" || attr(rPr, "i") === "true";
  if (attr(rPr, "u") !== null) into.underline = attr(rPr, "u") !== "none";
  if (attr(rPr, "strike") !== null) into.strike = attr(rPr, "strike") !== "noStrike";
  const fill = kid(rPr, "a:solidFill");
  if (fill) into.color = color(fill, ctx);
  const latin = kid(rPr, "a:latin");
  if (latin) {
    const face = attr(latin, "typeface");
    into.font = face === "+mj-lt" ? ctx.theme.major : face === "+mn-lt" ? ctx.theme.minor : face;
  }
  return into;
}

function paragraphProps(pPr, into) {
  if (!pPr) return into;
  if (attr(pPr, "algn")) into.align = attr(pPr, "algn");
  if (kid(pPr, "a:buNone")) into.bullet = null;
  else if (kid(pPr, "a:buChar")) into.bullet = { char: attr(kid(pPr, "a:buChar"), "char") };
  else if (kid(pPr, "a:buAutoNum")) into.bullet = { auto: attr(kid(pPr, "a:buAutoNum"), "type") || "arabicPeriod" };
  return into;
}

/**
 * Text of a txBody. `chain` lists the list style containers to inherit from, most specific first
 * (shape lstStyle, layout placeholder lstStyle, master placeholder lstStyle, master text style).
 */
function readText(txBody, chain, ctx) {
  if (!txBody) return null;
  const bodyPr = kid(txBody, "a:bodyPr");
  const autofit = path(txBody, "a:bodyPr", "a:normAutofit");
  const scale = autofit && attr(autofit, "fontScale") ? num(attr(autofit, "fontScale")) / 100000 : 1;
  const inset = (name, d) => num(attr(bodyPr, name), d) / EMU_PER_PX;
  const paragraphs = kids(txBody, "a:p").map((p) => {
    const pPr = kid(p, "a:pPr");
    const level = num(attr(pPr, "lvl"));
    const para = { align: "l", level, bullet: null, runs: [] };
    const base = { size: 18, bold: false, italic: false, underline: false, strike: false, color: ctx.defaultColor, font: ctx.theme.minor };
    // inherit from the least specific to the most specific
    for (const container of [...chain].reverse()) {
      const lp = levelProps(container, level);
      paragraphProps(lp, para);
      runProps(lp && kid(lp, "a:defRPr"), ctx, base);
    }
    // the shape style's font color (p:style/a:fontRef) wins over the master's text styles
    if (ctx.styleColor) base.color = ctx.styleColor;
    paragraphProps(pPr, para);
    runProps(pPr && kid(pPr, "a:defRPr"), ctx, base);
    for (const r of p.children) {
      if (r.localName === "r" || r.localName === "fld") {
        const run = runProps(kid(r, "a:rPr"), ctx, { ...base });
        run.text = (kid(r, "a:t") || {}).textContent || "";
        run.size = Math.round(run.size * scale * 10) / 10;
        para.runs.push(run);
      } else if (r.localName === "br") {
        para.runs.push({ ...base, size: Math.round(base.size * scale * 10) / 10, text: "\n" });
      }
    }
    if (!para.runs.length) {
      const end = runProps(kid(p, "a:endParaRPr"), ctx, { ...base });
      para.runs.push({ ...end, size: Math.round(end.size * scale * 10) / 10, text: "" });
    }
    return para;
  });
  const anchor = attr(bodyPr, "anchor") || ctx.inheritedAnchor || "t";
  return { anchor, insets: [inset("lIns", 91440), inset("tIns", 45720), inset("rIns", 91440), inset("bIns", 45720)], paragraphs };
}

// ---- shapes ---------------------------------------------------------------------------------------

let counter = 0;
const newId = () => `el${++counter}`;

function lineOf(spPr, style, ctx) {
  const ln = kid(spPr, "a:ln");
  if (ln && kid(ln, "a:noFill")) return null;
  const width = ln && attr(ln, "w") ? num(attr(ln, "w")) / EMU_PER_PX : 1;
  const fill = ln && kid(ln, "a:solidFill");
  if (fill) return { color: color(fill, ctx), width };
  const ref = style && kid(style, "a:lnRef");
  if (ref && num(attr(ref, "idx")) > 0) return { color: color(ref, ctx), width };
  return null;
}

function fillOf(spPr, style, ctx) {
  if (!spPr) return null;
  if (kid(spPr, "a:noFill")) return null;
  const solid = kid(spPr, "a:solidFill");
  if (solid) return color(solid, ctx);
  const grad = kid(spPr, "a:gradFill");
  if (grad) { // first gradient stop as a solid approximation
    const gs = grad.getElementsByTagNameNS(NS.a, "gs")[0];
    return gs ? color(gs, ctx) : null;
  }
  const ref = style && kid(style, "a:fillRef");
  if (ref && num(attr(ref, "idx")) > 0) return color(ref, ctx);
  return null;
}

/** Map a transform from a group's child coordinate space to the slide. */
function mapTransform(t, groups) {
  let { x, y, cx, cy } = t;
  for (const g of groups) {
    const sx = g.chExt && num(attr(g.chExt, "cx")) ? g.cx / num(attr(g.chExt, "cx")) : 1;
    const sy = g.chExt && num(attr(g.chExt, "cy")) ? g.cy / num(attr(g.chExt, "cy")) : 1;
    x = g.x + (x - num(attr(g.chOff, "x"))) * sx;
    y = g.y + (y - num(attr(g.chOff, "y"))) * sy;
    cx *= sx;
    cy *= sy;
  }
  return { ...t, x, y, cx, cy };
}

function readShapes(tree, ctx, groups = []) {
  const out = [];
  for (const node of tree.children) {
    const name = node.localName;
    if (name === "grpSp") {
      const g = xfrmOf(node);
      if (g) out.push(...readShapes(node, ctx, [g, ...groups]));
    } else if (name === "sp" || name === "cxnSp") {
      const el = readShape(node, ctx, groups);
      if (el) out.push(withSpid(el, node, ctx));
    } else if (name === "pic") {
      const el = readPicture(node, ctx, groups);
      if (el) out.push(withSpid(el, node, ctx));
    } else if (name === "graphicFrame") {
      const el = readTable(node, ctx, groups);
      if (el) out.push(withSpid(el, node, ctx));
    } else if (name === "AlternateContent") {
      const fallback = [...node.children].find((c) => c.localName === "Fallback");
      if (fallback) out.push(...readShapes(fallback, ctx, groups));
    }
  }
  return out;
}

/** Remember the shape id of a slide element (animations refer to it); removed again after reading the slide. */
function withSpid(el, node, ctx) {
  if (!ctx.isSlide) return el;
  const nv = [...node.children].find((c) => /^nv/.test(c.localName));
  const c = nv && kid(nv, "p:cNvPr");
  if (c) el.spid = attr(c, "id");
  return el;
}

// ---- transitions and animations ---------------------------------------------------------------------

const TRANSITIONS = { fade: "fade", push: "push", wipe: "wipe", cover: "cover", pull: "cover", zoom: "zoom", split: "wipe", dissolve: "fade", cut: "fade" };
const SPEED = { fast: 0.5, med: 0.75, slow: 1 };

/** The slide transition (PowerPoint 2010+ writes it twice, in mc:AlternateContent; the first one is the richer one). */
function transitionOf(slideDoc) {
  const tr = slideDoc.getElementsByTagNameNS(NS.p, "transition")[0];
  if (!tr) return null;
  const effect = [...tr.children].find((c) => c.localName !== "sndAc" && c.localName !== "extLst");
  const dur = [...tr.attributes].find((a) => a.localName === "dur");
  const result = {
    type: TRANSITIONS[effect ? effect.localName : "fade"] || "fade",
    dir: (effect && attr(effect, "dir")) || "l",
    duration: dur ? num(dur.value, 750) / 1000 : SPEED[attr(tr, "spd") || "med"] || 0.75,
  };
  if (attr(tr, "advTm")) result.advanceAfter = num(attr(tr, "advTm"), 0) / 1000;
  return result;
}

const EFFECTS = { 1: "appear", 10: "fade", 2: "fly", 53: "zoom", 21: "fade", 22: "fade", 42: "fly", 47: "fade", 23: "zoom", 31: "zoom" };
const STARTS = { clickEffect: "click", withEffect: "with", afterEffect: "after" };

/** Entrance animations of the slide's main sequence, in order: [{ spid, effect, start }]. */
function animationsOf(slideDoc) {
  const timing = slideDoc.getElementsByTagNameNS(NS.p, "timing")[0];
  if (!timing) return [];
  const out = [];
  for (const ctn of timing.getElementsByTagNameNS(NS.p, "cTn")) {
    if (attr(ctn, "presetClass") !== "entr" || !STARTS[attr(ctn, "nodeType")]) continue;
    const target = ctn.getElementsByTagNameNS(NS.p, "spTgt")[0];
    if (!target) continue;
    const spid = attr(target, "spid");
    if (out.some((a) => a.spid === spid)) continue;
    out.push({ spid, effect: EFFECTS[attr(ctn, "presetID")] || "fade", start: STARTS[attr(ctn, "nodeType")] });
  }
  return out;
}

function geometryOf(spPr) {
  const prst = path(spPr, "a:prstGeom");
  return prst ? attr(prst, "prst") : "rect";
}

function readShape(sp, ctx, groups) {
  const ph = ctx.isSlide ? placeholderOf(sp) : null;
  const layoutPh = ph ? findPlaceholder(ctx.layoutTree, ph) : null;
  const masterPh = ph ? findPlaceholder(ctx.masterTree, ph, true) || (layoutPh && findPlaceholder(ctx.masterTree, placeholderOf(layoutPh), true)) : null;
  let t = xfrmOf(sp) || (layoutPh && xfrmOf(layoutPh)) || (masterPh && xfrmOf(masterPh));
  if (!t) return null;
  t = mapTransform(t, groups);
  const spPr = kid(sp, "p:spPr");
  const style = kid(sp, "p:style");
  const fontRef = style && path(style, "a:fontRef");
  const phKind = ph ? kind(ph.type) : null;
  const masterStyle = ph ? (phKind === "title" ? ctx.txStyles.title : phKind === "body" ? ctx.txStyles.body : ctx.txStyles.other) : ctx.txStyles.other;
  const chain = [
    path(sp, "p:txBody", "a:lstStyle"),
    layoutPh && path(layoutPh, "p:txBody", "a:lstStyle"),
    masterPh && path(masterPh, "p:txBody", "a:lstStyle"),
    masterStyle,
  ].filter(Boolean);
  const anchorOf = (shape) => attr(path(shape, "p:txBody", "a:bodyPr"), "anchor");
  const textCtx = {
    ...ctx,
    styleColor: fontRef ? color(fontRef, ctx) : null,
    inheritedAnchor: (layoutPh && anchorOf(layoutPh)) || (masterPh && anchorOf(masterPh)) || null,
  };
  const text = readText(kid(sp, "p:txBody"), chain, textCtx);
  const hasText = text && text.paragraphs.some((p) => p.runs.some((r) => r.text));
  const fill = fillOf(spPr, style, ctx) || (layoutPh && fillOf(kid(layoutPh, "p:spPr"), null, ctx)) || null;
  const line = lineOf(spPr, style, ctx);
  const geometry = geometryOf(spPr);
  if (!hasText && !fill && !line && ph) return null; // empty placeholder: shown only while editing in PowerPoint
  return {
    id: newId(), type: hasText && !fill && !line && geometry === "rect" ? "text" : "shape",
    name: attr(path(sp, "p:nvSpPr", "p:cNvPr") || path(sp, "p:nvCxnSpPr", "p:cNvPr"), "name") || "",
    x: t.x / EMU_PER_PX, y: t.y / EMU_PER_PX, w: t.cx / EMU_PER_PX, h: t.cy / EMU_PER_PX,
    rot: t.rot, flipH: t.flipH, flipV: t.flipV, geometry, fill, line, text: hasText ? text : null,
    placeholder: ph,
  };
}

function readPicture(pic, ctx, groups) {
  let t = xfrmOf(pic);
  if (!t) return null;
  t = mapTransform(t, groups);
  const blip = path(pic, "p:blipFill", "a:blip");
  const rel = blip && ctx.rels[rId(blip)];
  const src = rel && !rel.external ? ctx.pkg.dataUrl(rel.target) : null;
  if (!src) return null;
  return {
    id: newId(), type: "image", name: attr(path(pic, "p:nvPicPr", "p:cNvPr"), "name") || "",
    x: t.x / EMU_PER_PX, y: t.y / EMU_PER_PX, w: t.cx / EMU_PER_PX, h: t.cy / EMU_PER_PX,
    rot: t.rot, flipH: t.flipH, flipV: t.flipV, image: { src }, line: lineOf(kid(pic, "p:spPr"), null, ctx),
  };
}

function readTable(frame, ctx, groups) {
  const tbl = frame.getElementsByTagNameNS(NS.a, "tbl")[0];
  let t = xfrmOf(frame);
  if (!tbl || !t) return null;
  t = mapTransform(t, groups);
  const columns = kids(kid(tbl, "a:tblGrid"), "a:gridCol").map((c) => num(attr(c, "w")) / EMU_PER_PX);
  const rows = kids(tbl, "a:tr").map((tr) => ({
    height: num(attr(tr, "h")) / EMU_PER_PX,
    cells: kids(tr, "a:tc").map((tc) => ({
      text: readText(kid(tc, "a:txBody"), [ctx.txStyles.other].filter(Boolean), { ...ctx, inheritedAnchor: null }),
      fill: fillOf(kid(tc, "a:tcPr"), null, ctx),
      span: num(attr(tc, "gridSpan"), 1), hMerge: attr(tc, "hMerge") === "1", vMerge: attr(tc, "vMerge") === "1",
    })),
  }));
  return {
    id: newId(), type: "table", name: attr(path(frame, "p:nvGraphicFramePr", "p:cNvPr"), "name") || "",
    x: t.x / EMU_PER_PX, y: t.y / EMU_PER_PX, w: t.cx / EMU_PER_PX, h: t.cy / EMU_PER_PX, rot: 0, table: { columns, rows },
  };
}

function backgroundOf(cSld, ctx) {
  const bg = kid(cSld, "p:bg");
  if (!bg) return undefined;
  const bgPr = kid(bg, "p:bgPr");
  if (bgPr) return fillOf(bgPr, null, ctx);
  const ref = kid(bg, "p:bgRef");
  return ref ? color(ref, ctx) : undefined;
}

/** Speaker notes of a slide: the text of the body placeholder of its notes slide (paragraphs as lines). */
function notesOf(pkg, slideName) {
  const rel = pkg.relOfType(slideName, "notesSlide");
  const doc = rel && pkg.xml(rel.target);
  if (!doc) return "";
  for (const sp of doc.getElementsByTagNameNS(NS.p, "sp")) {
    const ph = placeholderOf(sp);
    if (!ph || ph.type !== "body") continue;
    return [...sp.getElementsByTagNameNS(NS.a, "p")].map((p) => [...p.getElementsByTagNameNS(NS.a, "t")].map((t) => t.textContent).join("")).join("\n").trim();
  }
  return "";
}

// ---- main -----------------------------------------------------------------------------------------

/** Read a PPTX file (ArrayBuffer) into the deck model. */
export function importPptx(buffer) {
  counter = 0;
  const pkg = new Package(buffer);
  const presName = "ppt/presentation.xml";
  const pres = pkg.xml(presName);
  if (!pres) throw new Error("not a PowerPoint (PPTX) file");
  const sldSz = pres.getElementsByTagNameNS(NS.p, "sldSz")[0];
  const deck = { width: num(attr(sldSz, "cx"), 12192000) / EMU_PER_PX, height: num(attr(sldSz, "cy"), 6858000) / EMU_PER_PX, slides: [] };
  const presRels = pkg.rels(presName);
  for (const sldId of pres.getElementsByTagNameNS(NS.p, "sldId")) {
    const slideName = presRels[rId(sldId)].target;
    const slideDoc = pkg.xml(slideName);
    const layoutName = pkg.relOfType(slideName, "slideLayout").target;
    const masterName = pkg.relOfType(layoutName, "slideMaster").target;
    const themeRel = pkg.relOfType(masterName, "theme");
    const master = pkg.xml(masterName).documentElement;
    const layout = pkg.xml(layoutName).documentElement;
    const clrMapEl = kid(master, "p:clrMap");
    const clrMap = {};
    if (clrMapEl) for (const a of clrMapEl.attributes) clrMap[a.name] = a.value;
    const overrideMap = path(layout, "p:clrMapOvr", "a:overrideClrMapping");
    if (overrideMap) for (const a of overrideMap.attributes) clrMap[a.name] = a.value;
    const txStyles = kid(master, "p:txStyles");
    const ctx = {
      pkg, theme: readTheme(themeRel && pkg.xml(themeRel.target)), clrMap,
      txStyles: { title: kid(txStyles, "p:titleStyle"), body: kid(txStyles, "p:bodyStyle"), other: kid(txStyles, "p:otherStyle") },
      layoutTree: path(layout, "p:cSld", "p:spTree"), masterTree: path(master, "p:cSld", "p:spTree"),
    };
    ctx.defaultColor = "#" + (ctx.theme.colors[clrMap.tx1 || "dk1"] || "000000").toUpperCase();
    // background: slide -> layout -> master
    let background;
    for (const doc of [slideDoc.documentElement, layout, master]) {
      background = backgroundOf(kid(doc, "p:cSld"), ctx);
      if (background !== undefined) break;
    }
    // shapes of the layout and master that are not placeholders are drawn behind the slide's own shapes
    const decorations = [];
    for (const [doc, name] of [[master, masterName], [layout, layoutName]]) {
      if (doc === master && attr(layout, "showMasterSp") === "0") continue;
      const tree = path(doc, "p:cSld", "p:spTree");
      const nonPh = { localName: "spTree", children: [...tree.children].filter((c) => !placeholderOf(c) && c.localName !== "nvGrpSpPr" && c.localName !== "grpSpPr") };
      decorations.push(...readShapes(nonPh, { ...ctx, rels: pkg.rels(name), isSlide: false }));
    }
    const elements = readShapes(path(slideDoc.documentElement, "p:cSld", "p:spTree"), { ...ctx, rels: pkg.rels(slideName), isSlide: true });
    const notes = notesOf(pkg, slideName);
    const transition = transitionOf(slideDoc);
    const bySpid = new Map(elements.filter((e) => e.spid).map((e) => [e.spid, e.id]));
    const animations = animationsOf(slideDoc).filter((a) => bySpid.has(a.spid)).map((a) => ({ id: bySpid.get(a.spid), effect: a.effect, start: a.start }));
    for (const e of elements) delete e.spid;
    deck.slides.push({
      id: `slide${deck.slides.length + 1}`, background: background || null, elements: [...decorations.map((d) => ({ ...d, locked: true })), ...elements],
      ...(notes ? { notes } : {}), ...(transition ? { transition } : {}), ...(animations.length ? { animations } : {}),
    });
  }
  return deck;
}
