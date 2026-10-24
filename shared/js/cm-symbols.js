/*
 * Emoji and symbols (shared/js/symbols.js) in CodeMirror editors: inserts through the editor (one undo step, the
 * editor's selection) instead of the browser's editing commands.
 *
 *   import 'app/cm-symbols';
 */
import { EditorView } from '@codemirror/view';
import { isolateHistory } from '@codemirror/commands';

if (window.Suite && window.Suite.symbols) {
  window.Suite.symbols.registerAdapter((el) => {
    const root = el.closest && el.closest('.cm-editor');
    const view = root && EditorView.findFromDOM(root);
    if (!view) return null;
    const range = () => view.state.selection.main;
    return {
      el: view.contentDOM, kind: 'cm',
      save() {},
      before: (n) => view.state.sliceDoc(Math.max(0, range().head - n), range().head),
      selected: () => view.state.sliceDoc(range().from, range().to),
      collapsed: () => range().empty,
      replace(text, old = '') {
        const r = range();
        const from = r.empty ? r.head - old.length : r.from;
        view.dispatch({ changes: { from, to: r.to, insert: text }, selection: { anchor: from + text.length }, userEvent: 'input.symbol', annotations: isolateHistory.of('full'), scrollIntoView: true }); // its own undo step
        view.focus();
      },
      rect: () => view.coordsAtPos(range().head) || view.dom.getBoundingClientRect(),
    };
  });
}
