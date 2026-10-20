/*
 * Undo/redo history of document snapshots for the apps with an own document model (CodeMirror and Univer
 * have their own histories).
 *
 *   const history = new Suite.UndoHistory({ clone: (doc) => structuredClone(doc) });
 *   history.record(doc);              // before every change: remembers the current state
 *   history.record(doc, 'typing');    // changes with the same key within a second are merged into one step
 *   const previous = history.undo(doc); if (previous) doc = previous;   // null if there is nothing to undo
 *   const next = history.redo(doc);
 *   history.canUndo, history.canRedo, history.clear(), history.drop() (forget the last record, e.g. cancelled)
 *
 *   Suite.UndoHistory.key(event)  // 'undo' | 'redo' | null for Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y,
 *                                 // null while a text field has the focus (it has its own undo)
 */
(function (Suite) {
  'use strict';

  const COALESCE_MS = 1000;

  class UndoHistory {
    constructor({ limit = 100, clone = (state) => structuredClone(state), onChange = null } = {}) {
      this.limit = limit;
      this.clone = clone;
      this.onChange = onChange;
      this.undoStack = [];
      this.redoStack = [];
    }

    get canUndo() { return this.undoStack.length > 0; }
    get canRedo() { return this.redoStack.length > 0; }

    record(state, coalesce = null) {
      const top = this.undoStack[this.undoStack.length - 1];
      const now = Date.now();
      if (coalesce && top && top.coalesce === coalesce && now - top.time < COALESCE_MS) { top.time = now; return; }
      this.undoStack.push({ snap: this.clone(state), coalesce, time: now });
      if (this.undoStack.length > this.limit) this.undoStack.shift();
      this.redoStack = [];
      this.changed();
    }

    drop() { this.undoStack.pop(); this.changed(); }

    undo(current) { return this.move(this.undoStack, this.redoStack, current); }

    redo(current) { return this.move(this.redoStack, this.undoStack, current); }

    move(from, to, current) {
      const entry = from.pop();
      if (!entry) return null;
      to.push({ snap: this.clone(current), coalesce: null, time: 0 });
      this.changed();
      return entry.snap;
    }

    clear() { this.undoStack = []; this.redoStack = []; this.changed(); }

    changed() { if (this.onChange) this.onChange(this); }

    static key(event) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
      const el = event.target;
      if (el && (el.isContentEditable || (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !/^(checkbox|radio|button|range|color|file)$/.test(el.type)))) return null;
      const k = event.key.toLowerCase();
      if (k === 'z') return event.shiftKey ? 'redo' : 'undo';
      if (k === 'y' && !event.shiftKey) return 'redo';
      return null;
    }
  }

  Suite.UndoHistory = UndoHistory;
})(window.Suite = window.Suite || {});
