/*
 * Univer document data as a self-contained HTML page: for printing (the browser's "Save as PDF" gives a PDF with the page size and
 * margins of the document) and for saving as HTML. ES module without dependencies.
 *
 *   toHtml(data, { title, print }) -> HTML text
 *
 * Paragraph styles (headings, title, alignment, spacing, line height, indentation), text formatting, links, bullet and numbered
 * lists, tables (column widths, spans, shading), images, page breaks; the default header and footer repeat on every printed page.
 */

const C = { PARAGRAPH: "\r", SECTION: "\n", TABLE_START: "\x1a", ROW_START: "\x1b", CELL_START: "\x1c", CELL_END: "\x1d", ROW_END: "\x0e", TABLE_END: "\x0f", PAGE_BREAK: "\f", CUSTOM_BLOCK: "\b" };
const SKIP = /[\x00-\x08\x0b\x0e-\x1f\n]/g;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const color = (c) => (c && c.rgb ? c.rgb : null);
const ALIGN = { 1: "left", 2: "center", 3: "right", 4: "justify" };
const TAGS = { 2: "h1", 3: "p", 4: "h1", 5: "h2", 6: "h3", 7: "h4", 8: "h5" };

import { sectionConfig } from "app/doc-toc";

function runCss(ts) {
  if (!ts) return "";
  const css = [];
  if (ts.bl) css.push("font-weight:bold");
  if (ts.it) css.push("font-style:italic");
  const deco = [ts.ul && ts.ul.s ? "underline" : "", ts.st && ts.st.s ? "line-through" : ""].filter(Boolean).join(" ");
  if (deco) css.push(`text-decoration:${deco}`);
  if (ts.fs) css.push(`font-size:${ts.fs}pt`);
  if (ts.ff) css.push(`font-family:'${String(ts.ff).replace(/'/g, "")}',sans-serif`);
  if (color(ts.cl)) css.push(`color:${color(ts.cl)}`);
  if (color(ts.bg)) css.push(`background:${color(ts.bg)}`);
  if (ts.va === 3) css.push("vertical-align:super;font-size:smaller");
  if (ts.va === 2) css.push("vertical-align:sub;font-size:smaller");
  return css.join(";");
}

function paragraphCss(p) {
  const s = p.paragraphStyle || {};
  const css = [];
  if (ALIGN[s.horizontalAlign]) css.push(`text-align:${ALIGN[s.horizontalAlign]}`);
  if (s.spaceAbove) css.push(`margin-top:${s.spaceAbove.v}pt`);
  if (s.spaceBelow) css.push(`margin-bottom:${s.spaceBelow.v}pt`);
  if (s.lineSpacing) css.push(!s.spacingRule ? `line-height:${s.lineSpacing * 1.15}` : `line-height:${s.lineSpacing}pt`);
  if (!p.bullet) {
    if (s.indentStart) css.push(`margin-left:${s.indentStart.v}pt`);
    if (s.hanging) css.push(`text-indent:${-s.hanging.v}pt;padding-left:${s.hanging.v}pt`);
    else if (s.indentFirstLine) css.push(`text-indent:${s.indentFirstLine.v}pt`);
  }
  return css.join(";");
}

function bodyHtml(body, data, anchors = false, { fields = "text" } = {}) {
  const stream = body.dataStream || "";
  const runs = body.textRuns || [];
  const paragraphsByEnd = new Map((body.paragraphs || []).map((p) => [p.startIndex, p]));
  const blocksAt = new Map((body.customBlocks || []).map((b) => [b.startIndex, b.blockId]));
  const links = (body.customRanges || []).filter((r) => r.rangeType === 0 && r.properties && r.properties.url);
  const tables = data.tableSource || {};
  const drawings = data.drawings || {};
  const tsAt = (i) => { const r = runs.find((x) => i >= x.st && i < x.ed); return r ? r.ts : null; };
  // fields (Univer FIELD ranges): their current text, or nothing (page numbers of a printed page that cannot count pages)
  const fieldsAt = new Map((body.customRanges || []).filter((r) => r.rangeType === 1).map((r) => [r.startIndex, r]));

  const inline = (start, end) => {
    let out = "";
    let i = start;
    while (i < end) {
      const ch = stream[i];
      if (ch === C.PAGE_BREAK) { i += 1; continue; }
      const field = fieldsAt.get(i);
      if (field) {
        const blank = fields === "blank" && /^(PAGE|NUMPAGES)$/.test((field.properties || {}).fieldType);
        const text = blank ? "" : esc(stream.slice(i + 1, field.endIndex).replace(SKIP, ""));
        const css = runCss(tsAt(i + 1) || tsAt(i));
        out += css && text ? `<span style="${css}">${text}</span>` : text;
        i = field.endIndex + 1;
        continue;
      }
      if (ch === C.CUSTOM_BLOCK) {
        const d = drawings[blocksAt.get(i)];
        if (d && d.source) {
          const size = (d.docTransform && d.docTransform.size) || d.transform || {};
          out += `<img src="${esc(d.source)}" alt="${esc(d.title || "")}" style="width:${size.width || 100}px;height:${size.height || 100}px">`;
        }
        i += 1;
        continue;
      }
      const ts = tsAt(i);
      const link = links.find((l) => i >= l.startIndex && i <= l.endIndex);
      let j = i;
      while (j < end && stream[j] !== C.PAGE_BREAK && stream[j] !== C.CUSTOM_BLOCK && !fieldsAt.has(j) && tsAt(j) === ts && links.find((l) => j >= l.startIndex && j <= l.endIndex) === link) j += 1;
      let text = esc(stream.slice(i, j).replace(SKIP, "")).replace(/\t/g, "&emsp;").replace(/ {2}/g, " &nbsp;");
      const css = runCss(ts);
      if (css && text) text = `<span style="${css}">${text}</span>`;
      // (only harmless link targets: a javascript: link from an opened file must not run in the printed or exported page)
      if (link && text) text = /^\s*(?![a-z][\w+.-]*:)|^\s*(https?|mailto|tel|ftp|sftp|file):/i.test(String(link.properties.url || "")) ? `<a href="${esc(link.properties.url)}">${text}</a>` : text;
      out += text;
      i = j;
    }
    return out;
  };

  let heading = 0; // headings get the anchors of the table of contents links (#toc-<n>, see doc-toc.js)
  const blocks = (start, end) => {
    const parts = [];
    let paraStart = start;
    const lists = []; // open list tags
    const close = (depth) => { while (lists.length > depth) parts.push(`</li></${lists.pop()}>`); };
    for (let i = start; i < end; i++) {
      const ch = stream[i];
      if (ch === C.TABLE_START) {
        close(0);
        const tableEnd = stream.indexOf(C.TABLE_END, i);
        parts.push(table(i, tableEnd));
        i = tableEnd;
        paraStart = i + 1;
      } else if (ch === C.PARAGRAPH) {
        const p = paragraphsByEnd.get(i) || {};
        const named = (p.paragraphStyle || {}).namedStyleType;
        const tag = TAGS[named] || "p";
        const brk = stream.slice(paraStart, i).includes(C.PAGE_BREAK) ? "break-before:page;" : "";
        const css = brk + paragraphCss(p);
        const cls = named === 2 ? ' class="title"' : named === 3 ? ' class="subtitle"' : "";
        const content = inline(paraStart, i) || "<br>";
        const isToc = links.some((l) => String(l.properties.url).startsWith("#toc-") && l.startIndex <= paraStart && l.endIndex >= i - 1);
        const id = anchors && named >= 4 && named <= 8 && !isToc && stream.slice(paraStart, i).replace(/[\x00-\x1f]/g, "").trim() ? ` id="toc-${++heading}"` : "";
        const html = `<${tag}${id}${cls}${css ? ` style="${css}"` : ""}>${content}</${tag}>`;
        if (p.bullet) {
          const level = p.bullet.nestingLevel || 0;
          const kind = /ORDER|NUMBER/.test(p.bullet.listType || "") ? "ol" : "ul";
          close(level + 1);
          if (lists.length === level + 1 && lists[level] !== kind) close(level);
          if (lists.length === level + 1) parts.push("</li><li>");
          while (lists.length <= level) { parts.push(`<${kind}><li>`); lists.push(kind); }
          parts.push(html);
        } else { close(0); parts.push(html); }
        paraStart = i + 1;
      } else if (ch === C.SECTION && paraStart === i) paraStart = i + 1;
    }
    close(0);
    return parts.join("");
  };

  const table = (start, end) => {
    const meta = (body.tables || []).find((t) => t.startIndex === start) || {};
    const source = tables[meta.tableId] || {};
    const specs = source.tableRows || [];
    const cols = (source.tableColumns || []).map((c) => (c.size && c.size.width && c.size.width.v) || 100);
    let out = `<table><colgroup>${cols.map((w) => `<col style="width:${w}px">`).join("")}</colgroup>`;
    let r = -1, c = 0, cellStart = -1;
    for (let i = start + 1; i < end; i++) {
      const ch = stream[i];
      if (ch === C.ROW_START) { out += "<tr>"; r += 1; c = 0; } else if (ch === C.CELL_START) cellStart = i + 1;
      else if (ch === C.CELL_END) {
        const spec = ((specs[r] || {}).tableCells || [])[c] || {};
        c += 1;
        if (spec.rowSpan === 0) continue;
        const bg = color(spec.backgroundColor);
        out += `<td${spec.columnSpan > 1 ? ` colspan="${spec.columnSpan}"` : ""}${spec.rowSpan > 1 ? ` rowspan="${spec.rowSpan}"` : ""}${bg ? ` style="background:${bg}"` : ""}>${blocks(cellStart, i)}</td>`;
      } else if (ch === C.ROW_END) out += "</tr>";
    }
    return `${out}</table>`;
  };

  return blocks(0, stream.length);
}

/**
 * A header or footer as the content of a page margin box ({ position, content }): Chromium prints these on every page (it cuts off
 * fixed elements in the page margins), and counter(page) and counter(pages) give the numbers of the printed page. Only the text is
 * kept: pictures are left out, table cells are separated by spaces. Null for an empty header or footer.
 */
function marginBox(body, top) {
  const stream = body.dataStream || "";
  const fields = (body.customRanges || []).filter((r) => r.rangeType === 1 && /^(PAGE|NUMPAGES)$/.test((r.properties || {}).fieldType));
  const quote = (t) => `"${t.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const inTable = (i) => stream.lastIndexOf(C.TABLE_START, i) > stream.lastIndexOf(C.TABLE_END, i);
  const lines = [];
  let line = [], text = "";
  for (let i = 0; i < stream.length; i++) {
    const field = fields.find((f) => f.startIndex === i);
    if (field) {
      if (text) line.push(quote(text));
      text = "";
      line.push(field.properties.fieldType === "PAGE" ? "counter(page)" : "counter(pages)");
      i = field.endIndex;
    } else if (stream[i] === C.PARAGRAPH || stream[i] === C.ROW_END) {
      if (text) line.push(quote(text));
      text = "";
      if (stream[i] === C.ROW_END || !inTable(i)) { lines.push(line); line = []; } // (the paragraphs of a table row stay on one line)
    } else if (stream[i] === C.CELL_END) text += "   ";
    else if (stream[i] === "\t") text += "    ";
    else if (!/[\x00-\x1f]/.test(stream[i])) text += stream[i];
  }
  while (lines.length && !lines[lines.length - 1].length) lines.pop();
  if (!lines.length) return null;
  const first = (body.paragraphs || [])[0];
  const align = { 2: "center", 3: "right" }[first && first.paragraphStyle && first.paragraphStyle.horizontalAlign] || "left";
  return { position: `${top ? "top" : "bottom"}-${align}`, content: lines.map((l) => (l.length ? l.join(" ") : '""')).join(' "\\A" ') };
}

/**
 * The document as an HTML page. print: for the print dialog (the header and footer repeat on every page); pageCounters: the browser
 * prints page margin boxes (Chromium), so headers and footers are printed there as text, with the numbers of the pages – otherwise
 * they are fixed elements in the page margins (Firefox), whose page fields are left empty, since they cannot know their page.
 */
export function toHtml(data, { title = "Document", print = false, pageCounters = false } = {}) {
  const ds = sectionConfig(data);
  const page = ds.pageSize || { width: 793.7, height: 1122.5 };
  const m = (v, d) => `${((v ?? d) * 0.75).toFixed(1)}pt`; // px -> pt
  const bodyOf = (store, id) => (id && store && store[id] && store[id].body) || null;
  const boxes = [];
  const part = (store, id, top) => {
    const b = bodyOf(store, id);
    if (!b) return "";
    const box = print && pageCounters ? marginBox(b, top) : null;
    if (box) { boxes.push(box); return ""; }
    return bodyHtml(b, data, false, { fields: print ? "blank" : "text" });
  };
  const header = part(data.headers, ds.defaultHeaderId, true), footer = part(data.footers, ds.defaultFooterId, false);
  const marginBoxes = boxes.map((b) => `@${b.position} { content: ${b.content}; white-space: pre; font-family: Calibri, Carlito, "Liberation Sans", Arial, sans-serif; font-size: 9pt; color: #333; }`).join(" ");
  const body = bodyHtml(data.body || { dataStream: "" }, data, true);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page { size: ${m(page.width)} ${m(page.height)}; margin: ${m(ds.marginTop, 75.6)} ${m(ds.marginRight, 75.6)} ${m(ds.marginBottom, 75.6)} ${m(ds.marginLeft, 75.6)}; ${marginBoxes} }
body { font-family: Calibri, Carlito, "Liberation Sans", Arial, sans-serif; font-size: 11pt; line-height: 1.15; color: #000; margin: ${print ? "0" : `2rem auto; max-width: ${m(page.width - (ds.marginLeft ?? 75.6) - (ds.marginRight ?? 75.6))}`}; }
p, h1, h2, h3, h4, h5 { margin: 0 0 6pt; }
h1 { font-size: 16pt; } h2 { font-size: 14pt; } h3 { font-size: 13pt; } h4, h5 { font-size: 12pt; }
h1.title { font-size: 26pt; text-align: center; } p.subtitle { font-size: 15pt; color: #595959; text-align: center; }
ul, ol { margin: 0 0 6pt; padding-left: 24pt; } li > p { margin-bottom: 2pt; }
table { border-collapse: collapse; margin: 0 0 8pt; } td { border: 1px solid #000; padding: 3pt 5pt; vertical-align: top; }
img { max-width: 100%; }
.doc-header, .doc-footer { color: #333; font-size: 9pt; }
${print && (header || footer) ? `@media print { .doc-header { position: fixed; top: -${m(ds.marginTop, 75.6)}; left: 0; right: 0; padding-top: 12pt; } .doc-footer { position: fixed; bottom: -${m(ds.marginBottom, 75.6)}; left: 0; right: 0; padding-bottom: 12pt; } }` : ""}
</style></head><body>${header ? `<header class="doc-header">${header}</header>` : ""}<main>${body}</main>${footer ? `<footer class="doc-footer">${footer}</footer>` : ""}</body></html>`;
}
