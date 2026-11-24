/*
 * Bookmarks of the text editor (like Notepad++): marked lines that move along with edits, shown in their own margin and as a
 * tinted line. Ctrl+F2 toggles, F2 / Shift+F2 go to the next / previous one, Ctrl+Shift+F2 removes all; a click in the margin
 * toggles too. The positions are line starts kept in a RangeSet of the editor state (one per document).
 */
import { StateField, StateEffect, RangeSet, RangeSetBuilder, MapMode } from "@codemirror/state";
import { EditorView, Decoration, GutterMarker, gutter, keymap } from "@codemirror/view";

export const toggleBookmark = StateEffect.define(); // value: a position on the line
export const clearBookmarks = StateEffect.define();
export const setBookmarks = StateEffect.define(); // value: line starts

class BookmarkMarker extends GutterMarker {
  // (a bookmark at a line start goes away only when the line itself is deleted, not when the text before it is)
  get mapMode() { return MapMode.TrackAfter; }

  // (text inserted at the start of a bookmarked line goes before the bookmark: it stays with its line)
  get startSide() { return 1; }

  get endSide() { return 1; }

  toDOM() { const s = document.createElement("span"); s.className = "te-bookmark-marker"; s.textContent = "◆"; return s; }
}
const marker = new BookmarkMarker();

/** The bookmarked line starts, one per line (sorted). */
export function bookmarkLines(state) {
  const set = state.field(bookmarkField, false);
  if (!set) return [];
  const out = [];
  set.between(0, state.doc.length, (from) => { const start = state.doc.lineAt(from).from; if (out[out.length - 1] !== start) out.push(start); });
  return out;
}

function build(starts) {
  const b = new RangeSetBuilder();
  for (const s of [...new Set(starts)].sort((x, y) => x - y)) b.add(s, s, marker);
  return b.finish();
}

export const bookmarkField = StateField.define({
  create: () => RangeSet.empty,
  update(set, tr) {
    set = set.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(clearBookmarks)) set = RangeSet.empty;
      else if (e.is(setBookmarks)) set = build(e.value);
      else if (e.is(toggleBookmark)) {
        const line = tr.state.doc.lineAt(Math.min(e.value, tr.state.doc.length));
        let has = false;
        set.between(line.from, line.to, () => { has = true; });
        set = has ? set.update({ filter: (from) => from < line.from || from > line.to }) : set.update({ add: [marker.range(line.from)], sort: true });
      }
    }
    // (lines merged by an edit: one bookmark per line)
    if (tr.docChanged) { const starts = []; set.between(0, tr.state.doc.length, (from) => { starts.push(tr.state.doc.lineAt(from).from); }); set = build(starts); }
    return set;
  },
  provide: (f) => EditorView.decorations.from(f, (set) => {
    const b = new RangeSetBuilder();
    set.between(0, 1e12, (from) => { b.add(from, from, Decoration.line({ class: "te-bookmarked" })); });
    return b.finish();
  }),
});

/** Go to the next (direction 1) or previous (−1) bookmark from the cursor, wrapping around. */
export function jumpBookmark(view, direction) {
  const lines = bookmarkLines(view.state);
  if (!lines.length) return false;
  const here = view.state.doc.lineAt(view.state.selection.main.head).from;
  const target = direction > 0 ? (lines.find((l) => l > here) ?? lines[0]) : ([...lines].reverse().find((l) => l < here) ?? lines[lines.length - 1]);
  view.dispatch({ selection: { anchor: target }, scrollIntoView: true });
  return true;
}

/** The editor extension: field, margin and keys. */
export function bookmarks() {
  return [
    bookmarkField,
    gutter({
      class: "te-bookmark-gutter",
      markers: (v) => v.state.field(bookmarkField),
      initialSpacer: () => marker,
      domEventHandlers: { mousedown: (view, line) => { view.dispatch({ effects: toggleBookmark.of(line.from) }); return true; } },
    }),
    keymap.of([
      { key: "Mod-F2", run: (v) => { v.dispatch({ effects: toggleBookmark.of(v.state.selection.main.head) }); return true; }, preventDefault: true },
      { key: "F2", run: (v) => jumpBookmark(v, 1), preventDefault: true },
      { key: "Shift-F2", run: (v) => jumpBookmark(v, -1), preventDefault: true },
      { key: "Mod-Shift-F2", run: (v) => { v.dispatch({ effects: clearBookmarks.of(null) }); return true; }, preventDefault: true },
    ]),
  ];
}

/** The bookmarked lines' text, and the document without them / with only them. */
export function bookmarkedText(state) {
  return bookmarkLines(state).map((s) => state.doc.lineAt(s).text);
}

/**
 * Changes that delete the bookmarked lines (keepBookmarked = false) or all others (true): one deletion per run of neighbouring
 * lines, so that the bookmarks of the lines that stay move along.
 */
export function changesRemovingLines(state, keepBookmarked) {
  const marked = new Set(bookmarkLines(state));
  const doc = state.doc, changes = [];
  let i = 1;
  while (i <= doc.lines) {
    if (marked.has(doc.line(i).from) === keepBookmarked) { i++; continue; }
    let j = i;
    while (j + 1 <= doc.lines && marked.has(doc.line(j + 1).from) !== keepBookmarked) j++;
    if (j < doc.lines) changes.push({ from: doc.line(i).from, to: doc.line(j + 1).from });
    else changes.push({ from: i > 1 ? doc.line(i).from - 1 : 0, to: doc.length });
    i = j + 1;
  }
  return changes;
}
