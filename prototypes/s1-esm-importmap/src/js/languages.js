// Own module, imported by bare specifier ("app/languages") because relative imports from inline
// modules would resolve to file:// URLs, which browsers block for module scripts.
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { markdown } from "@codemirror/lang-markdown";
import { json } from "@codemirror/lang-json";

export const languages = { javascript, python, html, css, markdown, json };
