/*
 * DOCX import and export for Univer Docs (Univer's open-source core has no DOCX support). ES module.
 *
 * Import: direct DOCX reader (docx-import.js). Alternative (comparison): DOCX -> HTML with mammoth (global `mammoth`, vendor/mammoth.browser.min.js) -> Univer document
 * data with Univer's clipboard HTML converter. Keeps headings, paragraphs, bold/italic/underline/strike,
 * bullet and numbered lists and tables. Mammoth deliberately drops direct formatting such as colors,
 * font sizes, alignment and page breaks.
 *
 * Export: Univer document data -> DOCX with the `docx` library: page size and margins, headers/footers,
 * headings, alignment, spacing, line spacing, indentation, text runs (bold, italic, underline, strike,
 * size, font, color, highlight, super/subscript), hyperlinks, images, page breaks, bullet/numbered
 * lists, tables (column widths, cell shading, merged cells).
 */
import { convertClipboardHtmlToDocumentData } from "@univerjs/docs-ui";
import { readDocx } from "app/docx-import";
import {
  AlignmentType, Bookmark, Document, ExternalHyperlink, Footer, Header, HeadingLevel, ImageRun, InternalHyperlink, LineRuleType, Packer, PageBreak,
  Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import { headings, isTocParagraph, TOC_PREFIX } from "app/doc-toc";

// control characters of Univer's dataStream
const C = {
  PARAGRAPH: "\r", SECTION: "\n", TABLE_START: "\x1a", ROW_START: "\x1b", CELL_START: "\x1c", CELL_END: "\x1d",
  ROW_END: "\x0e", TABLE_END: "\x0f", PAGE_BREAK: "\f", CUSTOM_BLOCK: "\b",
};
const SKIP = new RegExp(`[${Object.values(C).join("").replace("\f", "")}\\x1f\\x1e\\v]`, "g");
// Univer NamedStyleType -> docx heading
const HEADINGS = { 2: HeadingLevel.TITLE, 4: HeadingLevel.HEADING_1, 5: HeadingLevel.HEADING_2, 6: HeadingLevel.HEADING_3,
  7: HeadingLevel.HEADING_4, 8: HeadingLevel.HEADING_5 };
const ALIGN = { 1: AlignmentType.LEFT, 2: AlignmentType.CENTER, 3: AlignmentType.RIGHT, 4: AlignmentType.JUSTIFIED };
// Word's highlight colors (written as highlight instead of shading)
const HIGHLIGHTS = {
  FFFF00: "yellow", "00FF00": "green", "00FFFF": "cyan", FF00FF: "magenta", "0000FF": "blue", FF0000: "red",
  "000080": "darkBlue", "008080": "darkCyan", "008000": "darkGreen", "800080": "darkMagenta", "800000": "darkRed",
  "808000": "darkYellow", "808080": "darkGray", C0C0C0: "lightGray", "000000": "black",
}; // 1 px = 0.75 pt = 15 twips

// Word-like page view: A4 with 2.5 cm margins (Univer measures in px at 96 dpi)
const CM = 96 / 2.54;
const PAGE_A4 = {
  documentFlavor: 1, // TRADITIONAL (pages); 2 = MODERN (pageless)
  pageSize: { width: 21 * CM, height: 29.7 * CM },
  marginTop: 2.5 * CM, marginBottom: 2 * CM, marginLeft: 2.5 * CM, marginRight: 2.5 * CM,
};

// mammoth maps italic/underline/strike to <em>/(nothing)/<s> by default; Univer's converter reads <em> as bold
const STYLE_MAP = ["i => i", "u => u", "strike => s"];

/** DOCX (ArrayBuffer) -> { data: IDocumentData, messages } with the direct DOCX reader (docx-import.js). */
export async function importDocx(buffer) {
  const { data, warnings } = readDocx(buffer);
  return { data, messages: warnings };
}

/** DOCX -> HTML (mammoth) -> Univer's HTML converter. Loses direct formatting; kept for comparison. */
export async function importDocxViaHtml(buffer) {
  const { value: html, messages } = await mammoth.convertToHtml({ arrayBuffer: buffer }, { styleMap: STYLE_MAP });
  const data = convertClipboardHtmlToDocumentData(html);
  // the clipboard converter returns id "": such a unit is not rendered and a second one collides
  data.id = `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  // Word does not hyphenate by default; Univer does (and would load hyphenation patterns)
  data.documentStyle = { ...(data.documentStyle || {}), ...PAGE_A4, autoHyphenation: 0 };
  return { data, html, messages: messages.map((m) => m.message) };
}

function hex(color) {
  if (!color || !color.rgb) return undefined;
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color.rgb);
  if (m) return m.slice(1, 4).map((v) => Number(v).toString(16).padStart(2, "0")).join("").toUpperCase();
  return color.rgb.replace("#", "").toUpperCase();
}

function runOptions(text, ts = {}) {
  const o = { text };
  if (ts.bl) o.bold = true;
  if (ts.it) o.italics = true;
  if (ts.ul && ts.ul.s) o.underline = {};
  if (ts.st && ts.st.s) o.strike = true;
  if (ts.fs) o.size = Math.round(ts.fs * 2); // half points
  if (ts.ff) o.font = ts.ff;
  if (ts.cl) o.color = hex(ts.cl);
  if (ts.bg) {
    const name = HIGHLIGHTS[hex(ts.bg)];
    if (name) o.highlight = name;
    else o.shading = { type: ShadingType.CLEAR, fill: hex(ts.bg), color: "auto" };
  }
  if (ts.va === 3) o.superScript = true;
  if (ts.va === 2) o.subScript = true;
  return o;
}

const TWIPS_PER_PX = 15;
const TWIPS_PER_PT = 20;

function dataUrlBytes(url) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url || "");
  if (!m) return null;
  const binary = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, type: (m[1] || "image/png").split("/")[1].replace("jpeg", "jpg") };
}

/** Converts one Univer body (main text, header or footer) into docx paragraphs and tables. */
function bodyBlocks(body, data, listInstance) {
  const stream = body.dataStream || "";
  const runs = body.textRuns || [];
  const paragraphsByEnd = new Map((body.paragraphs || []).map((p) => [p.startIndex, p]));
  const blocksAt = new Map((body.customBlocks || []).map((b) => [b.startIndex, b.blockId]));
  const links = (body.customRanges || []).filter((r) => r.rangeType === 0 && r.properties && r.properties.url);
  // table of contents: its entries link to bookmarks on the headings (see doc-toc.js)
  const anchors = new Map(headings(body).map((h) => [h.end, h.anchor]));
  const tables = data.tableSource || {};
  const bodyTables = body.tables || [];
  const drawings = data.drawings || {};

  function runsOf(start, end) {
    const out = [];
    let pos = start;
    for (const r of runs) {
      if (r.ed <= pos || r.st >= end) continue;
      if (r.st > pos) out.push([pos, r.st, {}]);
      out.push([Math.max(r.st, pos), Math.min(r.ed, end), r.ts || {}]);
      pos = Math.min(r.ed, end);
    }
    if (pos < end) out.push([pos, end, {}]);
    // split at hyperlink boundaries so that a link can wrap exactly its runs
    const cuts = links.flatMap((l) => [l.startIndex, l.endIndex + 1]);
    return out.flatMap(([s, e, ts]) => {
      const points = [s, ...cuts.filter((x) => x > s && x < e).sort((x, y) => x - y), e];
      return points.slice(0, -1).map((x, i) => [x, points[i + 1], ts]);
    });
  }

  // inline content of [start, end): text runs, page breaks, images; hyperlinks wrap their runs
  function inline(start, end) {
    const children = [];
    for (const [s, e, ts] of runsOf(start, end)) {
      let text = "";
      const flush = () => { const clean = text.replace(SKIP, ""); if (clean) children.push({ index: s, node: new TextRun(runOptions(clean, ts)) }); text = ""; };
      for (let i = s; i < e; i++) {
        const ch = stream[i];
        if (ch === C.PAGE_BREAK) { flush(); children.push({ index: i, node: new PageBreak() }); } else if (ch === C.CUSTOM_BLOCK && blocksAt.has(i)) {
          flush();
          const d = drawings[blocksAt.get(i)];
          const img = d && dataUrlBytes(d.source);
          if (img) {
            const size = (d.docTransform && d.docTransform.size) || {};
            children.push({ index: i, node: new ImageRun({ type: img.type, data: img.bytes, transformation: { width: size.width || (d.transform && d.transform.width) || 100, height: size.height || (d.transform && d.transform.height) || 100 } }) });
          }
        } else text += ch;
      }
      flush();
    }
    // group runs that lie inside a hyperlink
    const out = [];
    for (const item of children) {
      const link = links.find((l) => item.index >= l.startIndex && item.index <= l.endIndex);
      if (link && item.node instanceof TextRun) {
        const last = out[out.length - 1];
        if (last && last.link === link) last.runs.push(item.node);
        else out.push({ link, runs: [item.node] });
      } else out.push({ node: item.node });
    }
    return out.map((o) => {
      if (!o.link) return o.node;
      const url = o.link.properties.url;
      if (url === `${TOC_PREFIX}title`) return o.runs; // the title of the table of contents: plain text
      if (url.startsWith(TOC_PREFIX)) return new InternalHyperlink({ anchor: url.slice(1), children: o.runs });
      return new ExternalHyperlink({ link: url, children: o.runs });
    }).flat();
  }

  function paragraph(start, end) {
    const p = paragraphsByEnd.get(end) || {};
    const style = p.paragraphStyle || {};
    const children = inline(start, end);
    const anchor = anchors.get(end);
    const options = { children: anchor ? [new Bookmark({ id: anchor, children })] : children };
    if (isTocParagraph(body, { start, end, paragraph: p })) options.style = undefined;
    if (HEADINGS[style.namedStyleType]) options.heading = HEADINGS[style.namedStyleType];
    if (style.namedStyleType === 3) options.style = "Subtitle";
    if (ALIGN[style.horizontalAlign]) options.alignment = ALIGN[style.horizontalAlign];
    const spacing = {};
    if (style.spaceAbove) spacing.before = Math.round(style.spaceAbove.v * TWIPS_PER_PT);
    if (style.spaceBelow) spacing.after = Math.round(style.spaceBelow.v * TWIPS_PER_PT);
    if (style.lineSpacing) {
      if (!style.spacingRule) { spacing.line = Math.round(style.lineSpacing * 240); spacing.lineRule = LineRuleType.AUTO; } else { spacing.line = Math.round(style.lineSpacing * TWIPS_PER_PT); spacing.lineRule = style.spacingRule === 2 ? LineRuleType.EXACT : LineRuleType.AT_LEAST; }
    }
    if (Object.keys(spacing).length) options.spacing = spacing;
    const indent = {};
    if (style.indentStart) indent.left = Math.round(style.indentStart.v * TWIPS_PER_PT);
    if (style.hanging) indent.hanging = Math.round(style.hanging.v * TWIPS_PER_PT);
    if (style.indentFirstLine) indent.firstLine = Math.round(style.indentFirstLine.v * TWIPS_PER_PT);
    if (Object.keys(indent).length && !p.bullet) options.indent = indent;
    if (p.bullet) {
      if (/ORDER|NUMBER/.test(p.bullet.listType || "")) options.numbering = { reference: "ordered", level: p.bullet.nestingLevel || 0, instance: listInstance(p.bullet.listId) };
      else options.bullet = { level: p.bullet.nestingLevel || 0 };
    }
    return new Paragraph(options);
  }

  function blocks(start, end) {
    const out = [];
    let paraStart = start;
    for (let i = start; i < end; i++) {
      const ch = stream[i];
      if (ch === C.TABLE_START) {
        const tableEnd = stream.indexOf(C.TABLE_END, i);
        out.push(table(i, tableEnd));
        i = tableEnd;
        paraStart = i + 1;
      } else if (ch === C.PARAGRAPH) {
        out.push(paragraph(paraStart, i));
        paraStart = i + 1;
      } else if (ch === C.SECTION && paraStart === i) {
        paraStart = i + 1;
      }
    }
    return out;
  }

  function table(start, end) {
    const meta = bodyTables.find((t) => t.startIndex === start) || {};
    const source = tables[meta.tableId] || {};
    const columns = (source.tableColumns || []).map((c) => Math.round(((c.size && c.size.width && c.size.width.v) || 100) * TWIPS_PER_PX));
    const specs = source.tableRows || [];
    const rows = [];
    let row = null;
    let r = -1;
    let c = 0;
    let cellStart = -1;
    for (let i = start + 1; i < end; i++) {
      const ch = stream[i];
      if (ch === C.ROW_START) { row = []; r += 1; c = 0; } else if (ch === C.CELL_START) cellStart = i + 1;
      else if (ch === C.CELL_END) {
        const spec = ((specs[r] || {}).tableCells || [])[c] || {};
        c += 1;
        const children = blocks(cellStart, i);
        const options = { children: children.length ? children : [new Paragraph("")] };
        if (spec.columnSpan > 1) options.columnSpan = spec.columnSpan;
        if (spec.rowSpan > 1) options.rowSpan = spec.rowSpan;
        if (spec.backgroundColor) options.shading = { type: ShadingType.CLEAR, fill: hex(spec.backgroundColor), color: "auto" };
        if (spec.rowSpan === 0) continue; // covered by a vertical merge
        row.push(new TableCell(options));
      } else if (ch === C.ROW_END) rows.push(new TableRow({ children: row }));
    }
    return new Table({
      rows,
      ...(columns.length ? { columnWidths: columns, width: { size: columns.reduce((a, b) => a + b, 0), type: WidthType.DXA } } : {}),
    });
  }

  return blocks(0, stream.length);
}

/** Univer document data -> DOCX (Uint8Array). */
export async function exportDocx(data) {
  const listIds = new Map();
  const listInstance = (id) => {
    if (!listIds.has(id)) listIds.set(id, listIds.size + 1);
    return listIds.get(id);
  };
  const ds = data.documentStyle || {};
  const twips = (v) => Math.round(v * TWIPS_PER_PX);
  const page = {};
  if (ds.pageSize && ds.pageSize.width) page.size = { width: twips(ds.pageSize.width), height: twips(ds.pageSize.height) };
  if (ds.marginTop !== undefined) {
    page.margin = { top: twips(ds.marginTop), bottom: twips(ds.marginBottom || 0), left: twips(ds.marginLeft || 0), right: twips(ds.marginRight || 0), header: twips(ds.marginHeader || 30), footer: twips(ds.marginFooter || 30) };
  }
  const part = (store, id, Kind) => {
    const entry = id && store && store[id];
    return entry && entry.body ? new Kind({ children: bodyBlocks(entry.body, data, listInstance) }) : undefined;
  };
  const headers = {};
  const footers = {};
  if (part(data.headers, ds.defaultHeaderId, Header)) headers.default = part(data.headers, ds.defaultHeaderId, Header);
  if (part(data.headers, ds.firstPageHeaderId, Header)) headers.first = part(data.headers, ds.firstPageHeaderId, Header);
  if (part(data.footers, ds.defaultFooterId, Footer)) footers.default = part(data.footers, ds.defaultFooterId, Footer);
  if (part(data.footers, ds.firstPageFooterId, Footer)) footers.first = part(data.footers, ds.firstPageFooterId, Footer);

  const doc = new Document({
    title: data.title || undefined,
    numbering: {
      config: [{
        reference: "ordered",
        levels: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((level) => ({
          level, format: "decimal", text: `%${level + 1}.`, alignment: AlignmentType.START,
          style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
        })),
      }],
    },
    sections: [{
      properties: { page, titlePage: !!ds.useFirstPageHeaderFooter },
      headers, footers,
      children: bodyBlocks(data.body || { dataStream: "" }, data, listInstance),
    }],
  });
  return new Uint8Array(await (await Packer.toBlob(doc)).arrayBuffer());
}
