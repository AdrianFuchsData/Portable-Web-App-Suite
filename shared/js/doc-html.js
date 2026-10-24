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

function bodyHtml(body, data, anchors = false) {
  const stream = body.dataStream || "";
  const runs = body.textRuns || [];
  const paragraphsByEnd = new Map((body.paragraphs || []).map((p) => [p.startIndex, p]));
  const blocksAt = new Map((body.customBlocks || []).map((b) => [b.startIndex, b.blockId]));
  const links = (body.customRanges || []).filter((r) => r.rangeType === 0 && r.properties && r.properties.url);
  const tables = data.tableSource || {};
  const drawings = data.drawings || {};
  const tsAt = (i) => { const r = runs.find((x) => i >= x.st && i < x.ed); return r ? r.ts : null; };

  const inline = (start, end) => {
    let out = "";
    let i = start;
    while (i < end) {
      const ch = stream[i];
      if (ch === C.PAGE_BREAK) { i += 1; continue; }
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
      while (j < end && stream[j] !== C.PAGE_BREAK && stream[j] !== C.CUSTOM_BLOCK && tsAt(j) === ts && links.find((l) => j >= l.startIndex && j <= l.endIndex) === link) j += 1;
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

export function toHtml(data, { title = "Document", print = false } = {}) {
  const ds = data.documentStyle || {};
  const page = ds.pageSize || { width: 793.7, height: 1122.5 };
  const m = (v, d) => `${((v ?? d) * 0.75).toFixed(1)}pt`; // px -> pt
  const part = (store, id) => (id && store && store[id] && store[id].body ? bodyHtml(store[id].body, data) : "");
  const header = part(data.headers, ds.defaultHeaderId), footer = part(data.footers, ds.defaultFooterId);
  const body = bodyHtml(data.body || { dataStream: "" }, data, true);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page { size: ${m(page.width)} ${m(page.height)}; margin: ${m(ds.marginTop, 75.6)} ${m(ds.marginRight, 75.6)} ${m(ds.marginBottom, 75.6)} ${m(ds.marginLeft, 75.6)}; }
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
