/*
 * Univer document data as Markdown (CommonMark with GitHub's tables, strikethrough and task lists). ES module without dependencies.
 *
 *   toMarkdown(data) -> Markdown text
 *
 * Headings (# … #####; the title as #, the subtitle in italics), bold, italic, strikethrough, links, bullet, numbered and check lists
 * (nested by two or three spaces), tables (pipe tables: the first row is the header; spans are not possible, merged cells stay empty,
 * cell paragraphs are joined by <br>), images (as data: URLs), page fields and other fields (their text). Underline, colours, fonts,
 * alignment, page breaks, headers and footers have no Markdown form and are left out.
 */

const C = { PARAGRAPH: "\r", TABLE_START: "\x1a", ROW_START: "\x1b", CELL_START: "\x1c", CELL_END: "\x1d", ROW_END: "\x0e", TABLE_END: "\x0f", PAGE_BREAK: "\f", CUSTOM_BLOCK: "\b" };
const SKIP = /[\x00-\x08\x0b\x0c\x0e-\x1f\n]/g;
const HEADING = { 2: 1, 4: 1, 5: 2, 6: 3, 7: 4, 8: 5 }; // namedStyleType -> level (2 = title)

/** Text with the characters that would start Markdown syntax escaped. */
function escapeInline(text) {
  return text.replace(/([\\`*_[\]<>|~])/g, "\\$1");
}
/** Escapes what would make a paragraph a heading, quote, list or rule at the start of a line. */
function escapeLineStart(line) {
  return line.replace(/^(\s*)(#{1,6}(?=\s|$)|>|[-+](?=\s)|(\d+)([.)])(?=\s)|={3,}|-{3,})/, (m, space, mark, digits, dot) => (digits ? `${space}${digits}\\${dot}` : `${space}\\${mark}`));
}

function bodyMarkdown(body, data) {
  const stream = body.dataStream || "";
  const runs = body.textRuns || [];
  const paragraphsByEnd = new Map((body.paragraphs || []).map((p) => [p.startIndex, p]));
  const blocksAt = new Map((body.customBlocks || []).map((b) => [b.startIndex, b.blockId]));
  const links = (body.customRanges || []).filter((r) => r.rangeType === 0 && r.properties && r.properties.url);
  const fields = new Map((body.customRanges || []).filter((r) => r.rangeType === 1).map((r) => [r.startIndex, r]));
  const tables = data.tableSource || {};
  const drawings = data.drawings || {};
  const tsAt = (i) => { const r = runs.find((x) => i >= x.st && i < x.ed); return (r && r.ts) || {}; };
  const linkAt = (i) => links.find((l) => i >= l.startIndex && i <= l.endIndex);
  const marks = (ts) => `${ts.bl ? "**" : ""}${ts.it ? "*" : ""}${ts.st && ts.st.s ? "~~" : ""}`;

  /** Inline content of [start, end): formatted stretches; markers are put around the text without its surrounding spaces. */
  function inline(start, end, plain = false) {
    let out = "";
    let i = start;
    while (i < end) {
      const ch = stream[i];
      if (ch === C.PAGE_BREAK) { i += 1; continue; }
      if (ch === C.CUSTOM_BLOCK) {
        const d = drawings[blocksAt.get(i)];
        if (d && d.source && /^data:image\//.test(d.source)) out += `![${escapeInline(d.title || "")}](${d.source})`;
        i += 1;
        continue;
      }
      const field = fields.get(i);
      const ts = tsAt(field ? i + 1 : i), link = linkAt(i), key = plain ? "" : marks(ts);
      let j = i, text = "";
      while (j < end && stream[j] !== C.PAGE_BREAK && stream[j] !== C.CUSTOM_BLOCK && (plain ? "" : marks(tsAt(j))) === key && linkAt(j) === link) {
        const f = fields.get(j);
        if (f) { text += stream.slice(j + 1, f.endIndex); j = f.endIndex + 1; } else { text += stream[j]; j += 1; }
      }
      if (j === i) j = i + 1; // (a character whose style differs inside a field)
      text = escapeInline(text.replace(SKIP, "").replace(/\t/g, " "));
      const lead = /^\s*/.exec(text)[0], trail = /\s*$/.exec(text)[0], core = text.trim();
      let piece = core && key ? `${key}${core}${[...key].reverse().join("")}` : core; // ("***~~" closes as "~~***")
      if (link && core && !String(link.properties.url).startsWith("#toc-")) piece = `[${piece}](${String(link.properties.url).replace(/[()\s]/g, encodeURIComponent)})`;
      out += lead + piece + trail;
      i = j;
    }
    return out;
  }

  const table = (start, end) => {
    const meta = (body.tables || []).find((t) => t.startIndex === start) || {};
    const specs = ((tables[meta.tableId] || {}).tableRows) || [];
    const rows = [];
    let r = -1, c = 0, cellStart = -1;
    for (let i = start + 1; i < end; i++) {
      const ch = stream[i];
      if (ch === C.ROW_START) { rows.push([]); r += 1; c = 0; } else if (ch === C.CELL_START) cellStart = i + 1;
      else if (ch === C.CELL_END) {
        const spec = ((specs[r] || {}).tableCells || [])[c] || {};
        c += 1;
        // cell paragraphs on one line, separated by <br>; a merged (covered) cell stays empty
        const text = spec.rowSpan === 0 ? "" : blocks(cellStart, i, true).join("<br>").replace(/\n/g, " ");
        rows[r].push(text);
        for (let k = 1; k < (spec.columnSpan || 1); k++) rows[r].push("");
      }
    }
    const width = Math.max(1, ...rows.map((row) => row.length));
    const line = (cells) => `| ${Array.from({ length: width }, (_, k) => (cells[k] || "").trim() || " ").join(" | ")} |`;
    return [line(rows[0] || []), `| ${Array.from({ length: width }, () => "---").join(" | ")} |`, ...rows.slice(1).map(line)].join("\n");
  };

  /** The blocks of [start, end): Markdown paragraphs (in a table cell: their inline text only). */
  function blocks(start, end, inCell = false) {
    const parts = [];
    const counters = [];
    let listId = null; // numbering starts again in another list
    let paraStart = start;
    for (let i = start; i < end; i++) {
      const ch = stream[i];
      if (ch === C.TABLE_START) {
        const tableEnd = stream.indexOf(C.TABLE_END, i);
        parts.push({ text: table(i, tableEnd), list: false });
        i = tableEnd;
        paraStart = i + 1;
      } else if (ch === C.PARAGRAPH) {
        const p = paragraphsByEnd.get(i) || {};
        const named = (p.paragraphStyle || {}).namedStyleType;
        let text = inline(paraStart, i, !!(HEADING[named] || named === 3)).trim(); // (headings without the bold of their style)
        paraStart = i + 1;
        if (inCell) { parts.push({ text, list: false }); continue; }
        if (p.bullet) {
          const level = p.bullet.nestingLevel || 0;
          const type = p.bullet.listType || "";
          if (p.bullet.listId !== listId) { counters.length = 0; listId = p.bullet.listId; }
          counters.length = level + 1;
          counters[level] = (counters[level] || 0) + 1;
          const marker = /^CHECK_LIST_CHECKED/.test(type) ? "- [x]" : /^CHECK_LIST/.test(type) ? "- [ ]" : /ORDER|NUMBER/.test(type) ? `${counters[level]}.` : "-";
          parts.push({ text: `${"   ".repeat(level)}${marker} ${text}`, list: true });
          continue;
        }
        counters.length = 0;
        listId = null;
        if (!text) continue;
        if (HEADING[named]) text = `${"#".repeat(HEADING[named])} ${text}`;
        else if (named === 3) text = `*${text}*`; // subtitle
        else text = escapeLineStart(text);
        parts.push({ text, list: false });
      }
    }
    if (inCell) return parts.map((p) => p.text);
    // list items follow each other; everything else is separated by an empty line
    return parts.reduce((out, p, k) => (k && !(p.list && parts[k - 1].list) ? `${out}\n\n${p.text}` : k ? `${out}\n${p.text}` : p.text), "");
  }

  return blocks(0, stream.length);
}

export function toMarkdown(data) {
  const text = bodyMarkdown(data.body || { dataStream: "" }, data);
  return text ? `${text}\n` : "";
}
