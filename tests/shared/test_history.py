"""shared/js/history.js: snapshot undo/redo history and the common shortcut check."""
from helpers.paths import dist_url


def open_testbed(page):
    page.goto(dist_url("shared"))
    page.wait_for_selector("body[data-ready]")


def test_undo_redo_coalesce_and_limit(page):
    open_testbed(page)
    result = page.evaluate("""() => {
      const h = new Suite.UndoHistory({ limit: 3 });
      let doc = { n: 0 };
      const change = (key) => { h.record(doc, key); doc.n++; };
      change(); change('typing'); change('typing'); change();  // typing twice within a second: one step
      const steps = h.undoStack.length;
      doc = h.undo(doc); const a = doc.n;
      doc = h.undo(doc); const b = doc.n;
      doc = h.redo(doc); const c = doc.n;
      change();  // a new change clears redo
      const redoAfter = h.canRedo;
      for (let i = 0; i < 5; i++) change();
      const limited = h.undoStack.length;
      h.clear();
      return [steps, a, b, c, redoAfter, limited, h.canUndo, h.undo(doc)];
    }""")
    assert result == [3, 3, 1, 3, False, 3, False, None]


def test_shortcut_keys(page):
    open_testbed(page)
    keys = page.evaluate("""() => {
      const k = (init, target = document.body) => { const e = new KeyboardEvent('keydown', init); Object.defineProperty(e, 'target', { value: target }); return Suite.UndoHistory.key(e); };
      const input = document.createElement('input'), box = document.createElement('input'); box.type = 'checkbox';
      return [k({ key: 'z', ctrlKey: true }), k({ key: 'Z', ctrlKey: true, shiftKey: true }), k({ key: 'y', metaKey: true }),
              k({ key: 'z' }), k({ key: 'z', ctrlKey: true, altKey: true }), k({ key: 'z', ctrlKey: true }, input), k({ key: 'z', ctrlKey: true }, box)];
    }""")
    assert keys == ["undo", "redo", "redo", None, None, None, "undo"]
