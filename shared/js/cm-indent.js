/*
 * The Tab key in the CodeMirror editors of the suite (text editor, notebook, database tool, HTTP tool): Tab indents the
 * selected lines, or inserts indentation up to the next stop at the cursor (a tab character if the editor indents with
 * tabs); Shift+Tab unindents; Ctrl+Alt+I always inserts a tab character. Esc, then Tab (or Ctrl+M, CodeMirror's tab focus
 * mode) moves the focus on. In plain text fields, Ctrl+Alt+I is handled by the shell (shared/js/shell.js).
 *
 *   import { indentKeys, indentOrInsert, insertTabCharacter } from 'app/cm-indent';
 *   extensions: [basicSetup, indentKeys(), indentUnit.of('    ')]
 */
import { EditorSelection } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { indentUnit } from '@codemirror/language';
import { indentMore, indentLess } from '@codemirror/commands';

/** Tab: indent the selected lines, or insert indentation up to the next stop at the cursor (a tab with "Tabs"). */
export function indentOrInsert(target) {
  const { state } = target;
  if (state.readOnly) return false;
  if (state.selection.ranges.some((r) => !r.empty)) return indentMore(target);
  const unit = state.facet(indentUnit);
  target.dispatch(state.changeByRange((range) => {
    let insert = unit;
    if (unit !== '\t') {
      const line = state.doc.lineAt(range.head);
      const column = range.head - line.from;
      insert = ' '.repeat(unit.length - (column % unit.length));
    }
    return { changes: { from: range.head, insert }, range: EditorSelection.cursor(range.head + insert.length) };
  }), { userEvent: 'input.indent', scrollIntoView: true });
  return true;
}

/** Ctrl+Alt+I: a tab character, whatever the indentation setting. */
export function insertTabCharacter(target) {
  if (target.state.readOnly) return false;
  target.dispatch(target.state.replaceSelection('\t'), { userEvent: 'input', scrollIntoView: true });
  return true;
}

export const indentKeys = () => keymap.of([
  { key: 'Tab', run: indentOrInsert, shift: indentLess },
  { key: 'Ctrl-Alt-i', run: insertTabCharacter, preventDefault: true },
]);
