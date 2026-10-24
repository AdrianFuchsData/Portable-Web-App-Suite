/*
 * SAS language for the text editor: syntax highlighting (CodeMirror stream parser), indentation and code completion.
 *
 *   import { sas } from 'app/sas';   // LANGUAGES.sas.load
 *
 * Highlighted: comments (/* … *\/, statement comments "* …;" and "%* …;"), strings with their suffixes ('01jan2024'd,
 * 'name'n, '0A'x), numbers, statement keywords, PROC names, functions and CALL routines, macro statements and
 * functions (%let, %sysfunc …), macro variables (&name, &&name.), formats (date9., dollar12.) and the lines of
 * DATALINES/CARDS blocks.
 * Indentation: inside DATA and PROC steps (up to RUN/QUIT), DO/SELECT/CASE … END and %MACRO … %MEND, %DO … %END.
 * Completion: after PROC the procedures, after % the macro statements and functions, after & the macro variables
 * (automatic ones and those of %LET, %GLOBAL, %LOCAL, CALL SYMPUT(X) in the program), else statements, functions, CALL
 * routines and the names used in the program (data sets, variables). Upper or lower case follows what is typed.
 */
import { StreamLanguage, syntaxTree } from "@codemirror/language";

const words = (s) => s.trim().split(/\s+/);

// statements of DATA steps, global statements and PROC steps: keywords at the start of a statement (or after THEN/ELSE)
const STATEMENTS = words(`
  data set merge update modify by where if output run quit keep drop rename retain length format informat label array input
  infile file put cards datalines datalines4 cards4 lines lines4 delete return stop abort call select when otherwise leave
  continue goto link libname filename options title footnote ods proc class var model tables freq weight id means attrib
  missing endsas dm x systask sysecho note list error remove replace window display skip page dropover create insert alter
  describe validate reset connect disconnect execute
  `);
// keywords anywhere in a statement
const ANYWHERE_WORDS = words("then else do to by while until end");
// PROC SQL: keywords anywhere in its statements
const SQL_WORDS = words(`
  select from where group order by having as create table view insert into values update set delete join left right inner
  outer full cross on case when then else end distinct union except intersect all calculated alter add describe validate
  reset connect disconnect execute index drop
  `);
const OPERATORS = words("and or not eq ne gt lt ge le in eqt net gtt ltt get let like between is null contains");
const PROCS = words(`
  append anova arima boxplot calis catalog chart cimport cluster compare contents copy corr cport datasets delete document
  ds2 expand export factor fastclus fcmp forecast format freq fslist genmod glimmix glm glmselect gplot hpforest http iml
  import json lifetest logistic mcmc means mi mianalyze mixed nlin nlmixed npar1way odstext optmodel options phreg plot
  power princomp print printto probit pwencode quantreg rank reg report robustreg rsreg score sgpanel sgplot sgrender
  sgscatter sort sql standard stdize stepdisc summary surveyfreq surveylogistic surveymeans surveyreg surveyselect tabulate
  template timeseries transpose ttest univariate varclus
  `);
const FUNCTIONS = words(`
  abs addr anyalnum anyalpha anydigit anypunct anyspace arcos arsin atan atan2 band beta blshift bnot bor brshift bxor
  byte cat cats catq catt catx cdf ceil ceilz choosec choosen cmiss coalesce coalescec collate compare compbl compged
  compress constant convx cos cosh count countc countw css cv daccdb datdif date datejul datepart datetime day dequote
  deviance dhms dif digamma dim divide dur erf erfc exist exp fact fcopy fdelete fexist fileexist filename fileref find
  findc findw finfo floor floorz fnonct fopen fput fread fwrite gamma geomean harmean hbound hms hour htmldecode
  htmlencode ibessel ifc ifn index indexc indexw input inputc inputn int intck intcindex intfit intget intindex intnx
  intrr intseas intshift inttest intz iorcmi juldate juldate7 kurtosis lag largest lbound left length lengthc lengthm
  lengthn lgamma libname libref log log10 log1p log2 logbeta logcdf logpdf logsdf lowcase mad max md5 mdy mean median
  min minute missing mod modz month mopen n netpv nliteral nmiss normal notalnum notalpha notdigit notspace nvalid
  nwkdom open ordinal pctl pdf perm pmt poisson probbeta probbnml probchi probf probgam probit probnorm probt propcase
  prxchange prxmatch prxparen prxparse prxposn ptrlongadd put putc putn pvp qtr quantile quote rand ranbin rancau range
  rank ranexp rangam rannor ranpoi rantbl rantri ranuni repeat resolve reverse rewind right rms round rounde roundz
  saving scan sdf second sha256 sign sin sinh skewness sleep smallest soundex spedis sqrt std stderr stfips stname strip
  subpad substr substrn sum sumabs symexist symget symglobl symlocal sysget sysmsg sysparm sysprocessid sysprod sysrc
  system tan tanh time timepart timevalue tinv today translate transtrn tranwrd trigamma trim trimn trunc tso uniform
  upcase urldecode urlencode uss uuidgen var varfmt varinfmt varlabel varlen varname varnum vartype verify weekday whichc
  whichn year yrdif yyq zipcity zipfips zipname zipstate
  `);
const CALL_ROUTINES = words(`
  catx cats execute label missing poke prxchange prxdebug prxfree prxnext prxposn prxsubstr ranbin rancau ranexp rangam
  rannor ranperk ranperm ranpoi rantbl rantri ranuni scan set sleep sortc sortn streaminit symdel symput symputx system
  vname vnext
  `);
const MACRO = words(`
  let macro mend if then else do end to by while until put global local include sysfunc qsysfunc sysevalf eval str nrstr
  quote nrquote bquote nrbquote superq unquote upcase lowcase qupcase substr qsubstr scan qscan index length symexist
  symglobl symlocal abort return goto syscall sysexec sysget sysrput syslput window display input copy cmpres left trim
  verify datatyp
  `);
const AUTOMATIC = words(`
  sysdate sysdate9 sysday systime sysuserid sysjobid sysscp sysscpl sysver sysvlong syserr syserrortext syswarningtext
  syscc sysrc syslast sysdsn sysmacroname sysparm sysprocessid sysprocessname sysencoding syshostname sysnobs sysfilrc
  syslibrc sysmsg sysindex sysinfo sysenv sysncpu
  `);

const setOf = (list) => new Set(list);
const STATEMENT = setOf(STATEMENTS), ANYWHERE = setOf(ANYWHERE_WORDS), SQL = setOf(SQL_WORDS), OPERATOR = setOf(OPERATORS), PROC = setOf(PROCS), FUNCTION = setOf(FUNCTIONS), MACROS = setOf(MACRO);
const BLOCK_OPEN = setOf(["do", "select", "case"]);

const parser = {
  name: "sas",
  startState: () => ({
    comment: false, // inside /* … */
    statementComment: false, // inside "* …;" or "%* …;"
    start: true, // at the start of a statement
    afterProc: false, afterCall: false,
    proc: null, // the running procedure ("sql", "print", …) or "data"
    datalines: null, // null, ";" or ";;;;" while reading DATALINES/CARDS lines
    pendingDatalines: null,
    depth: 0, // indentation level
  }),
  copyState: (s) => ({ ...s }),
  token(stream, state) {
    // DATALINES / CARDS: data lines up to a line with only ";" (";;;;" for the "4" variants)
    if (state.datalines) {
      if (stream.sol() && stream.match(state.datalines === ";;;;" ? /^\s*;;;;\s*$/ : /^\s*;\s*$/)) { state.datalines = null; state.start = true; return "keyword"; }
      stream.skipToEnd();
      return "string";
    }
    if (state.comment) {
      if (stream.skipTo("*/")) { stream.pos += 2; state.comment = false; } else stream.skipToEnd();
      return "comment";
    }
    if (state.statementComment) {
      if (stream.skipTo(";")) { stream.next(); state.statementComment = false; state.start = true; } else stream.skipToEnd();
      return "comment";
    }
    if (stream.eatSpace()) return null;
    if (stream.match("/*")) { state.comment = true; return "comment"; }
    if (state.start && (stream.match(/^\*/) || stream.match(/^%\*/))) { state.statementComment = true; return "comment"; }
    const ch = stream.peek();
    if (ch === ";") {
      stream.next();
      state.start = true; state.afterProc = false; state.afterCall = false;
      if (state.pendingDatalines) { state.datalines = state.pendingDatalines; state.pendingDatalines = null; }
      return null;
    }
    const wasStart = state.start;
    state.start = false;
    if (ch === "'" || ch === '"') {
      stream.next();
      for (let c; (c = stream.next()) != null;) {
        if (c === ch) { if (stream.peek() === ch) { stream.next(); continue; } break; }
      }
      stream.match(/^(dt|[dtnxb])\b/i); // date, time, datetime, name, hex and bit literals
      return "string";
    }
    if (ch === "&") {
      if (stream.match(/^&+[A-Za-z_]\w*\.?/)) return "variable-2";
      stream.next();
      return "operator";
    }
    if (ch === "%") {
      const m = stream.match(/^%([A-Za-z_]\w*)/);
      if (m) {
        const w = m[1].toLowerCase();
        if (w === "macro" || (w === "do" && !stream.match(/^\s*=/, false))) state.depth++;
        else if (w === "mend" || w === "end") state.depth = Math.max(0, state.depth - 1);
        return MACROS.has(w) ? "meta" : "variable-2"; // %name: a macro call
      }
      stream.next();
      return "operator";
    }
    if (stream.match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i)) return "number";
    const word = stream.match(/^[A-Za-z_]\w*/);
    if (word) {
      const raw = word[0];
      const w = raw.toLowerCase();
      // two-level names (library.member, first.id): one name
      if (stream.match(/^\.[A-Za-z_]\w*/)) { if (state.afterProc) { state.afterProc = false; state.proc = w; } return "variable"; }
      // formats and informats: name followed by a width and a dot (date9., dollar12.2, best.)
      if (stream.match(/^\d*\.\d*/)) return "atom";
      const option = stream.match(/^\s*=/, false); // "end=last", "data=x": options, not statements
      if (state.afterProc) { state.afterProc = false; state.proc = w; return "def"; }
      if (state.afterCall) { state.afterCall = false; return "builtin"; }
      if (OPERATOR.has(w)) return "operator";
      const sql = state.proc === "sql";
      if (!option && ((wasStart && STATEMENT.has(w)) || ANYWHERE.has(w) || (sql && SQL.has(w)))) {
        if (w === "then" || w === "else") state.start = true; // "if x then output;": a statement follows
        if (wasStart && (w === "data" || w === "proc")) {
          if (!state.proc) state.depth++;
          state.proc = w === "data" ? "data" : null;
          if (w === "proc") state.afterProc = true;
        } else if (wasStart && (w === "run" || w === "quit")) {
          if (state.proc) state.depth = Math.max(0, state.depth - 1);
          state.proc = null;
        } else if (BLOCK_OPEN.has(w) && !(w === "select" && sql)) {
          state.depth++;
        } else if (w === "end") {
          state.depth = Math.max(0, state.depth - 1);
        } else if (w === "call") {
          state.afterCall = true;
        } else if (wasStart && /^(datalines|cards|lines)(4)?$/.test(w)) {
          state.pendingDatalines = w.endsWith("4") ? ";;;;" : ";";
        }
        return "keyword";
      }
      if (stream.match(/^\s*\(/, false) && FUNCTION.has(w)) return "builtin";
      return "variable";
    }
    stream.next();
    return /[=<>^~¬+\-*/|!]/.test(ch) ? "operator" : null;
  },
  indent(state, textAfter, cx) {
    const closing = /^\s*(end|run|quit|%end|%mend)\b/i.test(textAfter) ? 1 : 0;
    return Math.max(0, state.depth - closing) * cx.unit;
  },
  languageData: {
    commentTokens: { block: { open: "/*", close: "*/" } },
    indentOnInput: /^\s*(end|run|quit|%end|%mend);$/i,
    autocomplete: complete,
  },
};

// ---- completion -------------------------------------------------------------------------------------------------

const option = (label, type, detail) => ({ label, type, detail });
const STATIC = [
  ...[...new Set([...STATEMENTS, ...ANYWHERE_WORDS, ...SQL_WORDS])].map((w) => option(w, "keyword")),
  ...FUNCTIONS.map((w) => option(w, "function", "function")),
  ...OPERATORS.map((w) => option(w, "keyword", "operator")),
];

/** Names of the program: identifiers (data sets, variables) and macro variables it defines. */
function namesIn(text) {
  const names = new Set(), macroVars = new Set();
  const plain = text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/'[^']*'|"[^"]*"/g, " ");
  for (const m of plain.matchAll(/(?<![%&\w])[A-Za-z_]\w{1,31}\b/g)) names.add(m[0].toLowerCase());
  for (const m of text.matchAll(/%(?:let|global|local)\s+([A-Za-z_][\w ]*)/gi)) for (const v of m[1].split(/\s+/)) if (v) macroVars.add(v.toLowerCase());
  for (const m of text.matchAll(/symputx?\s*\(\s*['"]([A-Za-z_]\w*)['"]/gi)) macroVars.add(m[1].toLowerCase());
  for (const m of text.matchAll(/%do\s+([A-Za-z_]\w*)\s*=/gi)) macroVars.add(m[1].toLowerCase());
  for (const m of text.matchAll(/%macro\s+[A-Za-z_]\w*\s*\(([^)]*)\)/gi)) for (const p of m[1].split(",")) { const v = p.split("=")[0].trim(); if (/^[A-Za-z_]\w*$/.test(v)) macroVars.add(v.toLowerCase()); }
  return { names, macroVars };
}

/** Labels in the case the user types: UPPER when the typed word is upper case, else lower case. */
const inCase = (typed, list) => {
  const upper = /[A-Z]/.test(typed) && typed === typed.toUpperCase();
  return list.map((o) => ({ ...o, label: upper ? o.label.toUpperCase() : o.label }));
};

function complete(context) {
  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  // inside a comment or a string (or data lines): no completion
  const node = syntaxTree(context.state).resolveInner(context.pos, -1);
  if (/comment|string/.test(node.name)) return null;
  const macroVar = /&+(\w*)$/.exec(before);
  const macro = /%(\w*)$/.exec(before);
  const word = /(\w*)$/.exec(before);
  const text = context.state.doc.sliceString(0, Math.min(context.state.doc.length, 200000));
  if (macroVar) {
    const { macroVars } = namesIn(text);
    const options = [...[...macroVars].map((v) => option(v, "variable", "macro variable")), ...AUTOMATIC.map((v) => option(v, "constant", "automatic"))];
    return { from: context.pos - macroVar[1].length, options: inCase(macroVar[1], options), validFor: /^\w*$/ };
  }
  if (macro) {
    return { from: context.pos - macro[1].length, options: inCase(macro[1], MACRO.map((w) => option(w, "keyword", "macro"))), validFor: /^\w*$/ };
  }
  if (/\bproc\s+\w*$/i.test(before)) {
    return { from: context.pos - word[1].length, options: inCase(word[1], PROCS.map((w) => option(w, "class", "procedure"))), validFor: /^\w*$/ };
  }
  if (/\bcall\s+\w*$/i.test(before)) {
    return { from: context.pos - word[1].length, options: inCase(word[1], CALL_ROUTINES.map((w) => option(w, "function", "CALL routine"))), validFor: /^\w*$/ };
  }
  if (!word[1] && !context.explicit) return null;
  const known = new Set(STATIC.map((o) => o.label));
  const { names } = namesIn(text);
  names.delete(word[1].toLowerCase());
  const own = [...names].filter((n) => !known.has(n)).map((n) => option(n, "variable"));
  return { from: context.pos - word[1].length, options: inCase(word[1], [...STATIC, ...own]), validFor: /^\w*$/ };
}

export const SAS_WORDS = { STATEMENTS, SQL_WORDS, PROCS, FUNCTIONS, MACRO, AUTOMATIC };

export function sas() {
  return StreamLanguage.define(parser);
}
