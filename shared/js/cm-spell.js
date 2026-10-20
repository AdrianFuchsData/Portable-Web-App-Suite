/*
 * Spell checking in CodeMirror editors (shared/js/spell.js): unknown words in the visible part of the document are marked
 * (class cm-spell-error) and a right click on one opens the suggestion menu of shared/js/spell-dom.js.
 *
 *   import { spellChecking } from 'app/cm-spell';
 *   extensions: [spellChecking(() => 'prose' | 'code' | 'off')]
 *
 * "prose" checks all text except code and links (Markdown: code blocks, inline code, URLs, HTML); "code" only comments and
 * strings. The marks follow the suite-wide setting (spell.enabled, language, personal words).
 */
import { ViewPlugin, Decoration, EditorView } from '@codemirror/view';
import { StateEffect, RangeSetBuilder } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { spell, words, wordAt } from 'app/spell';
import { showMenu } from 'app/spell-dom';

const refresh = StateEffect.define();
const mark = Decoration.mark({ class: 'cm-spell-error' });
const CODE_TEXT = /Comment|String|Docstring/;
const PROSE_SKIP = /^(FencedCode|CodeBlock|InlineCode|CodeText|CodeInfo|URL|Autolink|HTMLBlock|HTMLTag|ProcessingInstruction|Comment|CommentBlock|LinkReference|LinkLabel)$/;
const MAX = 200000;

function rangesToCheck(view, mode) {
  const out = [];
  const tree = syntaxTree(view.state);
  for (const { from, to } of view.visibleRanges) {
    if (mode === 'code') {
      tree.iterate({ from, to, enter: (n) => { if (CODE_TEXT.test(n.name)) { out.push([Math.max(from, n.from), Math.min(to, n.to)]); return false; } return undefined; } });
    } else {
      // prose: everything except the skipped nodes
      let pos = from;
      tree.iterate({ from, to, enter: (n) => {
        if (!PROSE_SKIP.test(n.name)) return undefined;
        if (n.from > pos) out.push([pos, Math.min(n.from, to)]);
        pos = Math.max(pos, n.to);
        return false;
      } });
      if (pos < to) out.push([pos, to]);
    }
  }
  return out;
}

function build(view, mode) {
  const builder = new RangeSetBuilder();
  if (mode === 'off' || !spell.enabled || !spell.isReady || view.state.doc.length > MAX) return builder.finish();
  const found = [];
  for (const [from, to] of rangesToCheck(view, mode)) {
    const text = view.state.doc.sliceString(from, to);
    for (const w of words(text)) {
      // words cut at the edges of a range are not checked
      if ((w.start === 0 && from > 0 && /[\p{L}\p{M}]/u.test(view.state.doc.sliceString(from - 1, from)))
        || (w.start + w.word.length === text.length && /[\p{L}\p{M}]/u.test(view.state.doc.sliceString(to, to + 1)))) continue;
      if (spell.isWrong(w.word)) found.push([from + w.start, from + w.start + w.word.length]);
    }
  }
  found.sort((a, b) => a[0] - b[0]);
  for (const [a, b] of found) builder.add(a, b, mark);
  return builder.finish();
}

export function spellChecking(modeOf = () => 'prose') {
  const plugin = ViewPlugin.fromClass(class {
    constructor(view) {
      this.decorations = build(view, modeOf(view));
      this.unsubscribe = spell.onChange(() => setTimeout(() => { if (view.dom.isConnected) view.dispatch({ effects: refresh.of(null) }); }, 0));
    }
    update(u) {
      if (u.docChanged || u.viewportChanged || u.transactions.some((tr) => tr.effects.some((e) => e.is(refresh))) || syntaxTree(u.startState) !== syntaxTree(u.state)) {
        this.decorations = build(u.view, modeOf(u.view));
      }
    }
    destroy() { this.unsubscribe(); }
  }, {
    decorations: (p) => p.decorations,
    eventHandlers: {
      contextmenu(e, view) {
        if (e.shiftKey || !spell.enabled || !spell.isReady) return false;
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
        if (pos == null) return false;
        let marked = null;
        this.decorations.between(pos, pos, (from, to) => { marked = { from, to }; });
        if (!marked) return false;
        const line = view.state.doc.lineAt(marked.from);
        const w = wordAt(line.text, marked.from - line.from);
        if (!w) return false;
        e.preventDefault();
        showMenu(e.clientX, e.clientY, w.word, (text) => {
          view.dispatch({ changes: { from: marked.from, to: marked.to, insert: text }, userEvent: 'input.spell' });
          view.focus();
        });
        return true;
      },
    },
  });
  // the browser's own checking is off while the suite checks (no double marks)
  return [plugin, EditorView.contentAttributes.of({ spellcheck: 'false' })];
}
