"""Text editor: bookmarks (js/bookmarks.js) – toggle, jump, follow edits, margin clicks, copy/remove/keep bookmarked lines."""
from playwright.sync_api import expect

from test_texteditor import open_bytes

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"
LINE = "TE.app.view.state.doc.lineAt(TE.app.view.state.selection.main.head).number"
MARKED = "TE.app.bookmarkLines().map((p) => TE.app.view.state.doc.lineAt(p).number)"


def goto(page, n):
    page.evaluate(f"() => {{ const v = TE.app.view; v.dispatch({{ selection: {{ anchor: v.state.doc.line({n}).from }} }}); v.focus(); }}")


def test_bookmarks(app_page):
    page = app_page("texteditor", init_script=NO_PICKERS)
    open_bytes(page, "log.txt", "\n".join(f"line {i}" for i in range(1, 11)).encode())
    for n in (2, 5, 8):
        goto(page, n)
        page.keyboard.press("Control+F2")
    assert page.evaluate(MARKED) == [2, 5, 8]
    expect(page.locator("[data-testid=bookmark-count]")).to_have_text("3")
    expect(page.locator(".cm-line.te-bookmarked")).to_have_count(3)
    goto(page, 1)
    page.keyboard.press("F2")
    assert page.evaluate(LINE) == 2
    page.keyboard.press("F2")
    page.keyboard.press("F2")
    assert page.evaluate(LINE) == 8
    page.keyboard.press("F2")
    assert page.evaluate(LINE) == 2  # (wraps around)
    page.keyboard.press("Shift+F2")
    assert page.evaluate(LINE) == 8
    # bookmarks move with edits: two lines inserted at the top
    page.evaluate("() => TE.app.view.dispatch({ changes: { from: 0, insert: 'new A\\nnew B\\n' } })")
    assert page.evaluate(MARKED) == [4, 7, 10]
    # a click in the margin toggles
    def click_margin(n):
        line = page.locator(".cm-content .cm-line").nth(n - 1).bounding_box()
        g = page.locator(".te-bookmark-gutter").bounding_box()
        page.mouse.click(g["x"] + g["width"] / 2, line["y"] + line["height"] / 2)
    click_margin(3)
    assert page.evaluate(MARKED) == [3, 4, 7, 10]
    click_margin(3)
    assert page.evaluate(MARKED) == [4, 7, 10]
    # keep only / remove the bookmarked lines
    page.select_option("[data-testid=tools]", "bmKeep")
    assert page.evaluate("TE.app.view.state.doc.toString()") == "line 2\nline 5\nline 8"
    assert page.evaluate(MARKED) == [1, 2, 3]  # (the bookmarks stay on their lines)
    page.keyboard.press("Control+z")
    assert page.evaluate(MARKED) == [4, 7, 10]  # (back on their lines)
    page.select_option("[data-testid=tools]", "bmRemove")
    assert "line 5" not in page.evaluate("TE.app.view.state.doc.toString()") and page.evaluate("TE.app.view.state.doc.lines") == 9
    page.keyboard.press("Control+z")
    # every tab has its own; Ctrl+Shift+F2 removes all
    open_bytes(page, "other.txt", b"a\nb")
    assert page.evaluate(MARKED) == []
    page.select_option("[data-testid=tools]", "bmNext")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("no bookmarks")
    page.locator("[data-testid=tab]").first.click()
    page.locator(".cm-content").first.click()
    page.keyboard.press("Control+Shift+F2")
    assert page.evaluate(MARKED) == []
    assert page.errors == []
