/*
 * Text tools of the editor ("TextFX"): line operations, case conversion, encoding and formatting.
 *
 *   TOOLS: [{ id, group, kind: 'lines' | 'text' }]
 *   apply(id, text) -> new text (throws ToolError for input that cannot be converted)
 *
 * 'lines' tools work on whole lines (the lines touched by the selection, or the whole document); 'text' tools on the
 * selected text (or the whole document).
 */

export class ToolError extends Error {
  constructor(key, detail = "") { super(key); this.key = key; this.detail = detail; }
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

const lineTools = {
  sortAsc: (lines) => [...lines].sort((a, b) => collator.compare(a, b)),
  sortDesc: (lines) => [...lines].sort((a, b) => collator.compare(b, a)),
  sortLength: (lines) => [...lines].sort((a, b) => a.length - b.length),
  reverse: (lines) => [...lines].reverse(),
  unique: (lines) => { const seen = new Set(); return lines.filter((l) => !seen.has(l) && seen.add(l)); },
  removeEmpty: (lines) => lines.filter((l) => l.trim() !== ""),
  trimTrailing: (lines) => lines.map((l) => l.replace(/[ \t]+$/, "")),
  trimBoth: (lines) => lines.map((l) => l.trim()),
  joinLines: (lines) => [lines.map((l) => l.trim()).filter(Boolean).join(" ")],
};

const titleCase = (s) => s.toLowerCase().replace(/(^|[^\p{L}\p{N}'’])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

function base64Encode(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64Decode(s) {
  const clean = s.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  let bin;
  try { bin = atob(clean + "=".repeat((4 - (clean.length % 4)) % 4)); } catch (e) { throw new ToolError("te.toolBadBase64"); }
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch (e) { return new TextDecoder("windows-1252").decode(bytes); }
}

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function htmlUnescape(s) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n <= 0x10ffff ? String.fromCodePoint(n) : m; }
    return named[e.toLowerCase()] ?? m;
  });
}

function json(s, indent) {
  let value;
  try { value = JSON.parse(s); } catch (e) { throw new ToolError("te.toolBadJson", e.message); }
  return JSON.stringify(value, null, indent);
}

/** Indent XML/HTML-like markup: one element per line, text kept as is. */
function formatXml(s, indentUnit = "  ") {
  const doc = new DOMParser().parseFromString(s, "application/xml");
  const err = doc.querySelector("parsererror");
  if (err) throw new ToolError("te.toolBadXml", (err.textContent || "").split("\n")[0]);
  const out = [];
  const decl = /^\s*<\?xml[^>]*\?>/.exec(s);
  if (decl) out.push(decl[0].trim());
  const esc = (v) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const attr = (v) => esc(v).replace(/"/g, "&quot;");
  const walk = (node, depth) => {
    const pad = indentUnit.repeat(depth);
    switch (node.nodeType) {
      case 1: {
        const attrs = [...node.attributes].map((a) => ` ${a.name}="${attr(a.value)}"`).join("");
        const kids = [...node.childNodes].filter((c) => !(c.nodeType === 3 && !c.nodeValue.trim()));
        if (!kids.length) { out.push(`${pad}<${node.nodeName}${attrs}/>`); break; }
        if (kids.length === 1 && kids[0].nodeType === 3) { out.push(`${pad}<${node.nodeName}${attrs}>${esc(kids[0].nodeValue.trim())}</${node.nodeName}>`); break; }
        out.push(`${pad}<${node.nodeName}${attrs}>`);
        for (const c of kids) walk(c, depth + 1);
        out.push(`${pad}</${node.nodeName}>`);
        break;
      }
      case 3: out.push(pad + esc(node.nodeValue.trim())); break;
      case 4: out.push(`${pad}<![CDATA[${node.nodeValue}]]>`); break;
      case 7: out.push(`${pad}<?${node.target} ${node.data}?>`); break;
      case 8: out.push(`${pad}<!--${node.nodeValue}-->`); break;
      case 10: out.push(`<!DOCTYPE ${node.name}>`); break;
      default: break;
    }
  };
  for (const c of doc.childNodes) walk(c, 0);
  return out.join("\n");
}

const textTools = {
  upper: (s) => s.toUpperCase(),
  lower: (s) => s.toLowerCase(),
  title: titleCase,
  invert: (s) => [...s].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join(""),
  base64Encode,
  base64Decode,
  urlEncode: (s) => encodeURIComponent(s),
  urlDecode: (s) => { try { return decodeURIComponent(s.replace(/\+/g, " ")); } catch (e) { throw new ToolError("te.toolBadUrl"); } },
  htmlEscape: (s) => s.replace(/[&<>"']/g, (c) => ENTITIES[c]),
  htmlUnescape,
  jsonFormat: (s) => json(s, 2),
  jsonMinify: (s) => json(s, 0),
  xmlFormat: (s) => formatXml(s),
};

export const TOOLS = [
  ...Object.keys(lineTools).map((id) => ({ id, group: "lines", kind: "lines" })),
  ...["upper", "lower", "title", "invert"].map((id) => ({ id, group: "case", kind: "text" })),
  ...["base64Encode", "base64Decode", "urlEncode", "urlDecode", "htmlEscape", "htmlUnescape"].map((id) => ({ id, group: "encode", kind: "text" })),
  ...["jsonFormat", "jsonMinify", "xmlFormat"].map((id) => ({ id, group: "format", kind: "text" })),
];

export function apply(id, text) {
  if (lineTools[id]) return lineTools[id](text.split("\n")).join("\n");
  if (textTools[id]) return textTools[id](text);
  throw new Error(`unknown tool ${id}`);
}

export const kindOf = (id) => (lineTools[id] ? "lines" : "text");
