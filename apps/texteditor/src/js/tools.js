/*
 * Text tools of the editor ("TextFX"): line operations, case conversion, encoding and formatting.
 *
 *   TOOLS: [{ id, group, kind: 'lines' | 'text', options }]   (options: the tool asks for options first, e.g. 'sql')
 *   apply(id, text, options) -> new text (throws ToolError for input that cannot be converted)
 *
 * 'lines' tools work on whole lines (the lines touched by the selection, or the whole document); 'text' tools on the
 * selected text (or the whole document).
 */

import { format as sqlFormatter } from "sql-formatter";
import { load as yamlLoad, loadAll as yamlLoadAll, dump as yamlDump } from "js-yaml";

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
  shuffle: (lines) => { const a = [...lines]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
  numberLines: (lines, o = {}) => {
    const start = Number.isFinite(+o.start) ? +o.start : 1;
    const width = String(start + lines.length - 1).length;
    return lines.map((l, i) => `${o.pad ? String(start + i).padStart(width, "0") : start + i}${o.separator ?? ". "}${l}`);
  },
  affix: (lines, o = {}) => lines.map((l) => (o.skipEmpty && !l.trim() ? l : `${o.prefix || ""}${l}${o.suffix || ""}`)),
  keepMatching: (lines, o) => lines.filter((l) => matcher(o)(l)),
  removeMatching: (lines, o) => lines.filter((l) => !matcher(o)(l)),
  hardWrap: (lines, o = {}) => lines.flatMap((l) => wrapLine(l, Math.max(10, Number(o.width) || 80))),
};

/** A test for a line: text or regular expression (options: pattern, regex, caseSensitive). */
function matcher({ pattern = "", regex = false, caseSensitive = false } = {}) {
  if (!pattern) throw new ToolError("te.toolNoPattern");
  if (regex) {
    let re;
    try { re = new RegExp(pattern, caseSensitive ? "u" : "iu"); } catch (e) { throw new ToolError("te.toolBadRegex", e.message); }
    return (l) => re.test(l);
  }
  const p = caseSensitive ? pattern : pattern.toLowerCase();
  return (l) => (caseSensitive ? l : l.toLowerCase()).includes(p);
}

/** A line broken at spaces so that no part is longer than width (longer words stay whole); the indentation is kept. */
function wrapLine(line, width) {
  if (line.length <= width) return [line];
  const indent = /^\s*/.exec(line)[0];
  const words = line.trim().split(/\s+/);
  const out = [];
  let cur = indent;
  for (const w of words) {
    if (cur.trim() && cur.length + 1 + w.length > width) { out.push(cur); cur = indent + w; } else cur = cur.trim() ? `${cur} ${w}` : indent + w;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** Tools that ask for options first, and the dialog they use. */
export const LINE_OPTIONS = { numberLines: "number", affix: "affix", keepMatching: "pattern", removeMatching: "pattern", hardWrap: "width" };

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

// ---- SQL (sql-formatter, in the manner of PoorSQL) ----------------------------------------------

/** SQL dialects of sql-formatter: [id, label]. */
export const SQL_DIALECTS = [
  ["sql", "Standard SQL"], ["transactsql", "T-SQL (SQL Server)"], ["postgresql", "PostgreSQL"], ["mysql", "MySQL"], ["mariadb", "MariaDB"],
  ["sqlite", "SQLite"], ["plsql", "Oracle PL/SQL"], ["db2", "IBM Db2"], ["duckdb", "DuckDB"], ["bigquery", "BigQuery"], ["snowflake", "Snowflake"],
  ["redshift", "Amazon Redshift"], ["spark", "Spark SQL"], ["hive", "Hive"], ["trino", "Trino / Presto"],
];

export const SQL_DEFAULTS = { language: "sql", keywordCase: "upper", indent: "2", indentStyle: "standard", logicalOperatorNewline: "before", expressionWidth: 50, linesBetweenQueries: 1 };

/**
 * Format SQL: one clause per line, indented sub-queries and lists, keywords (and function names and data types) in the
 * chosen case. options: SQL_DEFAULTS (indent: "2", "4" or "tab").
 */
export function formatSql(text, options = {}) {
  const o = { ...SQL_DEFAULTS, ...options };
  const caseOf = o.keywordCase === "preserve" ? "preserve" : o.keywordCase;
  try {
    return sqlFormatter(text, {
      language: o.language, keywordCase: caseOf, dataTypeCase: caseOf, functionCase: caseOf,
      tabWidth: o.indent === "tab" ? 4 : Number(o.indent) || 2, useTabs: o.indent === "tab", indentStyle: o.indentStyle,
      logicalOperatorNewline: o.logicalOperatorNewline, expressionWidth: Number(o.expressionWidth) || 50, linesBetweenQueries: Number(o.linesBetweenQueries) || 1,
    });
  } catch (e) {
    throw new ToolError("te.toolBadSql", String(e.message || e).split("\n")[0]);
  }
}

/**
 * SQL on one line: comments removed (except optimizer hints /*+ … *\/), whitespace collapsed to single spaces;
 * strings, quoted names and PostgreSQL dollar quotes stay as they are. Statements stay separated by their semicolons.
 */
export function minifySql(text) {
  let out = "";
  let space = false;
  const word = (c) => /[\p{L}\p{N}_@#$]/u.test(c || "");
  // whitespace becomes one space, except after "(" and "." and before ")", ",", "." and ";"
  const emit = (piece) => {
    if (space && out && !/[(.]$/.test(out) && !/^[),.;]/.test(piece)) out += " ";
    out += piece;
    space = false;
  };
  for (let i = 0; i < text.length;) {
    const c = text[i], rest = text.slice(i, i + 2);
    if (/\s/.test(c)) { space = true; i++; continue; }
    if (rest === "--") { const end = text.indexOf("\n", i); i = end < 0 ? text.length : end; space = true; continue; }
    if (rest === "/*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end < 0 ? text.length : end + 2;
      if (text[i + 2] === "+") emit(text.slice(i, stop)); else space = true;
      i = stop; continue;
    }
    const dollar = c === "$" && /^\$[A-Za-z_]*\$/.exec(text.slice(i));
    if (dollar) {
      const end = text.indexOf(dollar[0], i + dollar[0].length);
      const stop = end < 0 ? text.length : end + dollar[0].length;
      emit(text.slice(i, stop)); i = stop; continue;
    }
    const close = { "'": "'", '"': '"', "`": "`", "[": "]" }[c];
    if (close) {
      let j = i + 1;
      for (; j < text.length; j++) {
        if (text[j] === close) { if (close !== "]" && text[j + 1] === close) { j++; continue; } break; } // '' and "" escape
      }
      emit(text.slice(i, j + 1)); i = j + 1; continue;
    }
    let j = i + 1;
    if (word(c)) while (j < text.length && word(text[j])) j++;
    emit(text.slice(i, j)); i = j;
  }
  return out.trim();
}

// ---- syntax checks (JSON, XML, YAML): [{ from, to, message }] (offsets into the text) ---------------------------------------

/** The offset of line `line` (1-based), column `col` (1-based). */
function offsetOf(text, line, col) {
  let pos = 0;
  for (let l = 1; l < line; l++) { const nl = text.indexOf("\n", pos); if (nl < 0) return text.length; pos = nl + 1; }
  return Math.min(text.length, pos + Math.max(0, col - 1));
}

/** Where JSON text first goes wrong (a small recursive-descent scanner), or -1 when it is valid. */
export function jsonErrorAt(text) {
  let i = 0;
  const ws = () => { while (i < text.length && " \t\n\r".includes(text[i])) i++; };
  const fail = () => { throw i; };
  const lit = (w) => { if (text.startsWith(w, i)) i += w.length; else fail(); };
  const str = () => {
    i++;
    while (i < text.length) {
      const c = text[i];
      if (c === '"') { i++; return; }
      if (c === "\\") { i++; if (text[i] === "u") { if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 1, i + 5))) fail(); i += 5; } else if ('"\\/bfnrt'.includes(text[i])) i++; else fail(); continue; }
      if (c < " ") fail();
      i++;
    }
    fail();
  };
  const num = () => { const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i)); if (!m) fail(); i += m[0].length; };
  const value = (depth) => {
    if (depth > 2000) fail();
    ws();
    const c = text[i];
    if (c === "{") {
      i++; ws();
      if (text[i] === "}") { i++; return; }
      for (;;) { ws(); if (text[i] !== '"') fail(); str(); ws(); if (text[i] !== ":") fail(); i++; value(depth + 1); ws(); if (text[i] === ",") { i++; continue; } if (text[i] === "}") { i++; return; } fail(); }
    }
    if (c === "[") {
      i++; ws();
      if (text[i] === "]") { i++; return; }
      for (;;) { value(depth + 1); ws(); if (text[i] === ",") { i++; continue; } if (text[i] === "]") { i++; return; } fail(); }
    }
    if (c === '"') return str();
    if (c === "t") return lit("true");
    if (c === "f") return lit("false");
    if (c === "n") return lit("null");
    if (c === "-" || (c >= "0" && c <= "9")) return num();
    fail();
  };
  try { value(0); ws(); return i < text.length ? i : -1; } catch (pos) { return typeof pos === "number" ? pos : 0; }
}

function checkJson(text) {
  if (!text.trim()) return [];
  try { JSON.parse(text); return []; } catch (e) {
    const at = jsonErrorAt(text);
    const pos = at < 0 ? text.length : at;
    const message = String(e.message || e).replace(/^JSON\.parse: /, "").replace(/, "[\s\S]*" is not valid JSON$/, "");
    return [{ from: Math.min(pos, Math.max(0, text.length - 1)), to: Math.min(text.length, pos + 1), message }];
  }
}

function checkXml(text) {
  if (!text.trim()) return [];
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const err = doc.querySelector("parsererror");
  if (!err) return [];
  const msg = (err.textContent || "").trim();
  // Chromium: "error on line 3 at column 5: …", Firefox: "XML Parsing Error: … Location: … Line Number 3, Column 5:"
  const m = /line (\d+) at column (\d+)/i.exec(msg) || /Line Number (\d+), Column (\d+)/i.exec(msg);
  const pos = m ? offsetOf(text, Number(m[1]), Number(m[2])) : 0;
  const line = msg.split("\n").find((l) => /error|fehler/i.test(l)) || msg.split("\n")[0];
  return [{ from: Math.max(0, pos - 1), to: Math.min(text.length, pos), message: line.replace(/^This page contains the following errors:/, "").trim() }];
}

function checkYaml(text) {
  if (!text.trim()) return [];
  try { yamlLoadAll(text, () => {}); return []; } catch (e) {
    const m = e.mark;
    const pos = m && Number.isFinite(m.position) ? m.position : 0;
    return [{ from: Math.min(pos, text.length), to: Math.min(text.length, pos + 1), message: e.reason || String(e.message || e) }];
  }
}

/** Languages whose syntax can be checked, and the checks. */
export const CHECKS = { json: checkJson, xml: checkXml, yaml: checkYaml };

/** Syntax errors of a text in a language (empty when fine or when the language has no check). */
export function checkSyntax(language, text) {
  const check = CHECKS[language];
  return check ? check(text) : [];
}

function yamlFormat(s) {
  let docs = [];
  try { yamlLoadAll(s, (d) => docs.push(d)); } catch (e) { throw new ToolError("te.toolBadYaml", e.reason || e.message); }
  return docs.map((d) => yamlDump(d, { indent: 2, lineWidth: 120, noRefs: true })).join("---\n");
}

function jsonToYaml(s) {
  let value;
  try { value = JSON.parse(s); } catch (e) { throw new ToolError("te.toolBadJson", e.message); }
  return yamlDump(value, { indent: 2, lineWidth: 120, noRefs: true });
}

function yamlToJson(s) {
  let value;
  try { value = yamlLoad(s); } catch (e) { throw new ToolError("te.toolBadYaml", e.reason || e.message); }
  return JSON.stringify(value, null, 2);
}

/** XML on as few lines as possible: whitespace between elements removed (text and CDATA kept). */
function xmlMinify(s) {
  const doc = new DOMParser().parseFromString(s, "application/xml");
  const err = doc.querySelector("parsererror");
  if (err) throw new ToolError("te.toolBadXml", (err.textContent || "").split("\n")[0]);
  const strip = (n) => { for (const c of [...n.childNodes]) { if (c.nodeType === 3 && !c.nodeValue.trim()) c.remove(); else if (c.nodeType === 1) strip(c); } };
  strip(doc);
  const decl = /^\s*<\?xml[^>]*\?>/.exec(s);
  return (decl ? decl[0].trim() : "") + new XMLSerializer().serializeToString(doc).replace(/^<\?xml[^>]*\?>\s*/, "");
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
  xmlMinify,
  yamlFormat,
  jsonToYaml,
  yamlToJson,
  sqlFormat: (s, options) => formatSql(s, options),
  sqlMinify: (s) => minifySql(s),
};

export const TOOLS = [
  ...Object.keys(lineTools).map((id) => ({ id, group: "lines", kind: "lines", options: LINE_OPTIONS[id] })),
  ...["upper", "lower", "title", "invert"].map((id) => ({ id, group: "case", kind: "text" })),
  ...["base64Encode", "base64Decode", "urlEncode", "urlDecode", "htmlEscape", "htmlUnescape"].map((id) => ({ id, group: "encode", kind: "text" })),
  ...["jsonFormat", "jsonMinify", "xmlFormat", "xmlMinify", "yamlFormat", "jsonToYaml", "yamlToJson", "sqlFormat", "sqlMinify"].map((id) => ({ id, group: "format", kind: "text", options: id === "sqlFormat" ? "sql" : undefined })),
];

export function apply(id, text, options = {}) {
  if (lineTools[id]) return lineTools[id](text.split("\n"), options).join("\n");
  if (textTools[id]) return textTools[id](text, options);
  throw new Error(`unknown tool ${id}`);
}

export const kindOf = (id) => (lineTools[id] ? "lines" : "text");
