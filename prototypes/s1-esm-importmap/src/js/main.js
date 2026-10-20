import { EditorView, basicSetup } from "codemirror";
import { EditorState, Compartment } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { languages } from "app/languages";

const language = new Compartment();
const theme = new Compartment();
const view = new EditorView({
  parent: document.getElementById("editor"),
  state: EditorState.create({
    doc: "// Hello from CodeMirror 6, loaded from a single HTML file\nfunction add(a, b) {\n  return a + b;\n}\n",
    extensions: [basicSetup, language.of(languages.javascript()), theme.of([])],
  }),
});

document.getElementById("lang").addEventListener("change", (e) => {
  view.dispatch({ effects: language.reconfigure(languages[e.target.value]()) });
});
document.getElementById("dark").addEventListener("change", (e) => {
  view.dispatch({ effects: theme.reconfigure(e.target.checked ? oneDark : []) });
});

// bridge for classic scripts and tests
window.S1.view = view;
window.S1.resolveReady();
