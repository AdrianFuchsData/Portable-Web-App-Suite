/*
 * More SQL completion for the editor of the database tool, next to the schema completion of @codemirror/lang-sql (tables,
 * keywords, "table." and "alias." columns): the columns of the tables named in the current statement without a qualifier
 * (SELECT ▮ FROM people, WHERE a▮) and the common functions of the dialect (with parentheses).
 *
 *   sqlExtras(dialect, kind, getSchema) -> extension    kind: 'sqlite' | 'postgres' | 'mysql'; getSchema() -> [{ schema, name, columns }]
 */
import { snippetCompletion } from '@codemirror/autocomplete';

const COMMON = ['abs', 'avg', 'coalesce', 'count', 'lower', 'max', 'min', 'nullif', 'replace', 'round', 'substr', 'sum', 'trim', 'upper', 'length', 'cast'];
export const FUNCTIONS = {
  sqlite: [...COMMON, 'changes', 'char', 'date', 'datetime', 'glob', 'group_concat', 'hex', 'ifnull', 'iif', 'instr', 'julianday', 'json', 'json_array', 'json_extract',
    'json_group_array', 'json_object', 'last_insert_rowid', 'like', 'ltrim', 'printf', 'format', 'quote', 'random', 'randomblob', 'rtrim', 'strftime', 'time', 'total',
    'typeof', 'unicode', 'unixepoch', 'zeroblob'],
  postgres: [...COMMON, 'age', 'array_agg', 'array_length', 'bool_and', 'bool_or', 'ceil', 'concat', 'concat_ws', 'current_date', 'current_timestamp', 'date_part',
    'date_trunc', 'extract', 'floor', 'format', 'generate_series', 'greatest', 'initcap', 'json_agg', 'jsonb_agg', 'jsonb_build_object', 'jsonb_extract_path', 'least',
    'left', 'lpad', 'md5', 'now', 'position', 'regexp_match', 'regexp_replace', 'right', 'row_number', 'rank', 'dense_rank', 'lag', 'lead', 'split_part', 'string_agg',
    'substring', 'to_char', 'to_date', 'to_number', 'to_timestamp', 'unnest'],
  mysql: [...COMMON, 'ceil', 'char_length', 'concat', 'concat_ws', 'curdate', 'current_timestamp', 'date', 'date_add', 'date_format', 'date_sub', 'datediff', 'day',
    'floor', 'format', 'from_unixtime', 'greatest', 'group_concat', 'if', 'ifnull', 'instr', 'json_extract', 'json_object', 'last_insert_id', 'least', 'left', 'locate',
    'lpad', 'month', 'now', 'rand', 'regexp_replace', 'right', 'row_number', 'str_to_date', 'substring', 'substring_index', 'timestampdiff', 'unix_timestamp', 'uuid', 'year'],
};

const IDENT = String.raw`(?:"[^"]+"|\x60[^\x60]+\x60|\[[^\]]+\]|[\p{L}_][\p{L}\p{N}_$]*)`;
const NAME = new RegExp(String.raw`(${IDENT})(?:\s*\.\s*(${IDENT}))?`, 'gu');
const unquote = (s) => s.replace(/^["`[]|["`\]]$/g, '');

/** The statement around a position (statements separated by ; outside quotes). */
function statementAt(text, pos) {
  let start = 0, quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === ';') { if (i >= pos) return text.slice(start, i); start = i + 1; }
  }
  return text.slice(start);
}

/** Tables named after FROM (also comma lists), JOIN, UPDATE, INTO and TABLE in a statement: [{ schema, name }]. */
export function referencedTables(statement) {
  const out = [];
  const re = new RegExp(String.raw`\b(?:FROM|JOIN|UPDATE|INTO|TABLE)\s+(${IDENT}(?:\s*\.\s*${IDENT})?(?:\s+(?:AS\s+)?${IDENT})?(?:\s*,\s*${IDENT}(?:\s*\.\s*${IDENT})?(?:\s+(?:AS\s+)?${IDENT})?)*)`, 'giu');
  for (const m of statement.matchAll(re)) {
    for (const part of m[1].split(/\s*,\s*/)) {
      NAME.lastIndex = 0;
      const n = NAME.exec(part);
      if (!n) continue;
      const [a, b] = [unquote(n[1]), n[2] ? unquote(n[2]) : null];
      if (/^(select|where|on|set|values|join|left|right|inner|outer|cross|natural|lateral)$/i.test(a)) continue;
      out.push(b ? { schema: a, name: b } : { schema: null, name: a });
    }
  }
  return out;
}

export function sqlExtras(dialect, kind, getSchema) {
  const functions = (FUNCTIONS[kind] || FUNCTIONS.sqlite).map((f) => snippetCompletion(`${f}(\${})`, { label: f, type: 'function', boost: -1 }));
  const source = (context) => {
    const word = context.matchBefore(/[\p{L}\p{N}_$]+/u);
    const before = context.state.sliceDoc(Math.max(0, (word ? word.from : context.pos) - 1), word ? word.from : context.pos);
    if (before === '.' || before === '"' || before === '`' || before === "'") return null; // (qualified names, quoted text: lang-sql or nothing)
    if (!word && !context.explicit) return null;
    const statement = statementAt(context.state.doc.toString(), context.pos);
    const schema = getSchema() || [];
    const seen = new Set();
    const columns = [];
    for (const ref of referencedTables(statement)) {
      const tbl = schema.find((x) => x.name.toLowerCase() === ref.name.toLowerCase() && (!ref.schema || (x.schema || '').toLowerCase() === ref.schema.toLowerCase()));
      if (!tbl) continue;
      for (const c of tbl.columns) {
        if (seen.has(c.name)) continue;
        seen.add(c.name);
        columns.push({ label: c.name, type: 'property', detail: tbl.name, info: `${c.type || ''}${c.pk ? ' · PRIMARY KEY' : ''}${c.notnull ? ' · NOT NULL' : ''}`.trim() || undefined, boost: 3 });
      }
    }
    return { from: word ? word.from : context.pos, options: [...columns, ...functions], validFor: /^[\p{L}\p{N}_$]*$/u };
  };
  return dialect.language.data.of({ autocomplete: source });
}
