/*
 * Colour swatches in CodeMirror editors: a small square in the colour in front of every hex colour (#6cf, #6cff, #66ccff,
 * #66ccffff); a click opens the colour picker of the suite (shared/js/colorpicker.js) and changes the colour in the text –
 * live while picking, one undo step at the end, the original again when cancelled. The text keeps its form where possible
 * (short or long, upper or lower case; an opacity part is added or dropped as needed).
 *
 *   import { colorSwatches } from 'app/cm-colors';
 *   extensions: [colorSwatches(() => languageId)]   // in "text" and "markdown" all-digit forms (#123, issue numbers) are left out
 */
import { ViewPlugin, Decoration, WidgetType, MatchDecorator, EditorView } from '@codemirror/view';
import { Transaction } from '@codemirror/state';

const COLOR = /(?<![\w&#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
const PROSE = new Set(['text', 'markdown']);

class Swatch extends WidgetType {
  constructor(color) { super(); this.color = color; }
  eq(other) { return other.color === this.color; }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-color-swatch';
    span.style.setProperty('--c', this.color);
    span.title = `${this.color} – ${window.Suite && Suite.t ? Suite.t('col.title') : 'Colour'}…`;
    span.setAttribute('aria-hidden', 'true');
    span.dataset.testid = 'color-swatch-inline';
    return span;
  }
  ignoreEvent() { return false; }
}

/** The new colour in the form of the original text. */
function styled(hex, original) {
  const c = Suite.colors.parse(hex);
  const upper = /[A-F]/.test(original) && !/[a-f]/.test(original);
  const short = original.length <= 5 && [c.r, c.g, c.b, c.a].every((v) => v % 17 === 0);
  let text = short ? `#${[c.r, c.g, c.b].map((v) => (v / 17).toString(16)).join('')}${c.a < 255 ? (c.a / 17).toString(16) : ''}`
    : `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}${c.a < 255 ? c.a.toString(16).padStart(2, '0') : ''}`;
  return upper ? text.toUpperCase() : text;
}

function edit(view, pos, dom) {
  const m = /^#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})/.exec(view.state.sliceDoc(pos, pos + 9));
  if (!m || !window.Suite || !Suite.colors) return;
  const original = m[0];
  const from = pos;
  let to = pos + original.length;
  const replace = (text, history) => {
    view.dispatch({ changes: { from, to, insert: text }, annotations: history ? [] : [Transaction.addToHistory.of(false)], userEvent: history ? 'input.color' : undefined });
    to = from + text.length;
  };
  Suite.colors.pick({ value: original, alpha: true, anchor: dom, onInput: (hex) => replace(styled(hex, original), false) }).then((hex) => {
    replace(original, false); // back to the original, then the result as one undo step
    if (hex) replace(styled(hex, original), true);
    view.focus();
  });
}

export function colorSwatches(languageOf = () => 'text') {
  const decorator = new MatchDecorator({
    regexp: COLOR,
    decorate: (add, from, to, match, view) => {
      if (PROSE.has(languageOf(view)) && /^#\d{3,4}$/.test(match[0])) return; // "#123": rather an issue number
      add(from, from, Decoration.widget({ widget: new Swatch(match[0]), side: -1 }));
    },
  });
  return [
    ViewPlugin.fromClass(class {
      constructor(view) { this.decorations = decorator.createDeco(view); }
      update(u) { this.decorations = decorator.updateDeco(u, this.decorations); }
    }, {
      decorations: (p) => p.decorations,
      eventHandlers: {
        mousedown(e, view) {
          const swatch = e.target.closest && e.target.closest('.cm-color-swatch');
          if (!swatch) return false;
          e.preventDefault();
          edit(view, view.posAtDOM(swatch), swatch);
          return true;
        },
      },
    }),
    EditorView.baseTheme({
      '.cm-color-swatch': {
        display: 'inline-block', width: '0.75em', height: '0.75em', margin: '0 0.2em 0 0.05em', verticalAlign: 'middle', cursor: 'pointer',
        border: '1px solid rgba(128, 128, 128, 0.8)', borderRadius: '2px',
        background: 'linear-gradient(var(--c), var(--c)), repeating-conic-gradient(#c8c8c8 0 25%, #fff 0 50%) 0 0 / 6px 6px',
      },
    }),
  ];
}
