/*
 * Languages of the text editor: syntax highlighting and indentation by file name. ES module ("app/languages").
 */
import { StreamLanguage } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { python } from "@codemirror/lang-python";
import { markdown } from "@codemirror/lang-markdown";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { sql } from "@codemirror/lang-sql";
import { yaml } from "@codemirror/lang-yaml";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { php } from "@codemirror/lang-php";
import { rust } from "@codemirror/lang-rust";
import { go } from "@codemirror/lang-go";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { powerShell } from "@codemirror/legacy-modes/mode/powershell";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import { perl } from "@codemirror/legacy-modes/mode/perl";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import { diff } from "@codemirror/legacy-modes/mode/diff";
import { nginx } from "@codemirror/legacy-modes/mode/nginx";
import { csharp, kotlin, scala } from "@codemirror/legacy-modes/mode/clike";
import { swift } from "@codemirror/legacy-modes/mode/swift";
import { r } from "@codemirror/legacy-modes/mode/r";
import { cmake } from "@codemirror/legacy-modes/mode/cmake";
import { vb } from "@codemirror/legacy-modes/mode/vb";
import { vbScript } from "@codemirror/legacy-modes/mode/vbscript";
import { groovy } from "@codemirror/legacy-modes/mode/groovy";
import { haskell } from "@codemirror/legacy-modes/mode/haskell";
import { http } from "@codemirror/legacy-modes/mode/http";
import { protobuf } from "@codemirror/legacy-modes/mode/protobuf";
import { tcl } from "@codemirror/legacy-modes/mode/tcl";
import { pascal } from "@codemirror/legacy-modes/mode/pascal";
import { fortran } from "@codemirror/legacy-modes/mode/fortran";
import { erlang } from "@codemirror/legacy-modes/mode/erlang";
import { clojure } from "@codemirror/legacy-modes/mode/clojure";
import { julia } from "@codemirror/legacy-modes/mode/julia";
import { octave } from "@codemirror/legacy-modes/mode/octave";
import { sas } from "app/sas";

const legacy = (mode) => () => StreamLanguage.define(mode);

/** id -> { label, extensions (lower case, without dot), names (exact file names), load() } */
export const LANGUAGES = {
  text: { label: "Plain text", extensions: ["txt", "log"], load: () => [] },
  javascript: { label: "JavaScript", extensions: ["js", "mjs", "cjs", "jsx"], load: () => javascript({ jsx: true }) },
  typescript: { label: "TypeScript", extensions: ["ts", "tsx", "mts", "cts"], load: () => javascript({ typescript: true, jsx: true }) },
  json: { label: "JSON", extensions: ["json", "ipynb", "jsonc", "webmanifest"], load: json },
  html: { label: "HTML", extensions: ["html", "htm", "xhtml", "vue", "svelte"], load: html },
  css: { label: "CSS", extensions: ["css", "scss", "less"], load: css },
  xml: { label: "XML", extensions: ["xml", "svg", "xsd", "xsl", "xslt", "plist", "csproj", "props", "targets", "config", "kdbx.xml"], load: xml },
  markdown: { label: "Markdown", extensions: ["md", "markdown", "mdown"], load: markdown },
  python: { label: "Python", extensions: ["py", "pyw", "pyi"], load: python },
  sql: { label: "SQL", extensions: ["sql", "ddl"], load: sql },
  yaml: { label: "YAML", extensions: ["yaml", "yml"], load: yaml },
  java: { label: "Java", extensions: ["java"], load: java },
  cpp: { label: "C / C++", extensions: ["c", "h", "cpp", "cc", "cxx", "hpp", "hh", "hxx", "ino"], load: cpp },
  csharp: { label: "C#", extensions: ["cs", "csx"], load: legacy(csharp) },
  php: { label: "PHP", extensions: ["php", "phtml"], load: php },
  rust: { label: "Rust", extensions: ["rs"], load: rust },
  go: { label: "Go", extensions: ["go"], load: go },
  kotlin: { label: "Kotlin", extensions: ["kt", "kts"], load: legacy(kotlin) },
  scala: { label: "Scala", extensions: ["scala", "sc"], load: legacy(scala) },
  swift: { label: "Swift", extensions: ["swift"], load: legacy(swift) },
  shell: { label: "Shell", extensions: ["sh", "bash", "zsh", "ksh"], names: [".bashrc", ".profile", ".zshrc"], load: legacy(shell) },
  powershell: { label: "PowerShell", extensions: ["ps1", "psm1", "psd1"], load: legacy(powerShell) },
  batch: { label: "Batch", extensions: ["bat", "cmd"], load: () => [] },
  properties: { label: "INI / Properties", extensions: ["ini", "properties", "cfg", "conf", "env", "editorconfig", "gitconfig"], names: [".gitignore", ".gitattributes", ".env"], load: legacy(properties) },
  toml: { label: "TOML", extensions: ["toml"], load: legacy(toml) },
  dockerfile: { label: "Dockerfile", extensions: ["dockerfile"], names: ["Dockerfile", "Containerfile"], load: legacy(dockerFile) },
  lua: { label: "Lua", extensions: ["lua"], load: legacy(lua) },
  perl: { label: "Perl", extensions: ["pl", "pm"], load: legacy(perl) },
  ruby: { label: "Ruby", extensions: ["rb", "gemspec"], names: ["Gemfile", "Rakefile"], load: legacy(ruby) },
  diff: { label: "Diff / Patch", extensions: ["diff", "patch"], load: legacy(diff) },
  nginx: { label: "nginx", extensions: [], names: ["nginx.conf"], load: legacy(nginx) },
  r: { label: "R", extensions: ["r"], load: legacy(r) },
  cmake: { label: "CMake", extensions: ["cmake"], names: ["CMakeLists.txt"], load: legacy(cmake) },
  vb: { label: "Visual Basic", extensions: ["vb", "bas", "cls", "frm"], load: legacy(vb) },
  vbscript: { label: "VBScript", extensions: ["vbs"], load: legacy(vbScript) },
  groovy: { label: "Groovy", extensions: ["groovy", "gradle", "jenkinsfile"], names: ["Jenkinsfile"], load: legacy(groovy) },
  haskell: { label: "Haskell", extensions: ["hs"], load: legacy(haskell) },
  http: { label: "HTTP", extensions: ["http"], load: legacy(http) },
  protobuf: { label: "Protocol Buffers", extensions: ["proto"], load: legacy(protobuf) },
  tcl: { label: "Tcl", extensions: ["tcl"], load: legacy(tcl) },
  pascal: { label: "Pascal", extensions: ["pas", "pp", "dpr"], load: legacy(pascal) },
  fortran: { label: "Fortran", extensions: ["f", "for", "f90", "f95", "f03"], load: legacy(fortran) },
  erlang: { label: "Erlang", extensions: ["erl", "hrl"], load: legacy(erlang) },
  clojure: { label: "Clojure", extensions: ["clj", "cljs", "cljc", "edn"], load: legacy(clojure) },
  julia: { label: "Julia", extensions: ["jl"], load: legacy(julia) },
  octave: { label: "MATLAB / Octave", extensions: ["m", "oct"], load: legacy(octave) },
  sas: { label: "SAS", extensions: ["sas"], load: sas },
};

/** Language id for a file name. */
export function languageFor(fileName) {
  const name = fileName.split(/[\\/]/).pop();
  for (const [id, lang] of Object.entries(LANGUAGES)) if ((lang.names || []).includes(name)) return id;
  const lower = name.toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : lower;
  for (const [id, lang] of Object.entries(LANGUAGES)) if (lang.extensions.includes(ext)) return id;
  return "text";
}

/** CodeMirror extension for a language id. */
export function languageExtension(id) {
  return (LANGUAGES[id] || LANGUAGES.text).load();
}
