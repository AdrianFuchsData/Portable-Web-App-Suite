"""Hex editor: marks – bookmarks and coloured ranges, moved by inserts and deletions (also undo), jump, rename, remove."""
from playwright.sync_api import expect

from test_hexeditor import NO_PICKERS, load

MARKS = "HE.app.state.buffer.marks.map((m) => [m.kind, m.from, m.to, m.label]).sort((a, b) => a[1] - b[1])"


def test_marks(app_page):
    page = app_page("hexeditor", init_script=NO_PICKERS)
    load(page, bytes(range(64)))
    page.click("[data-testid=side-marks]")
    # bookmarks at 4 and 40 (Ctrl+F2), a coloured range 10..19
    page.evaluate("HE.app.moveTo(4)")
    page.focus("[data-testid=view]")
    page.keyboard.press("Control+F2")
    page.evaluate("HE.app.moveTo(40)")
    page.focus("[data-testid=view]")
    page.keyboard.press("Control+F2")
    page.evaluate("() => { HE.app.moveTo(10); HE.app.moveTo(19, true); }")
    page.click("[data-testid=mark-colour-2]")
    page.fill("[data-testid=mark-label]", "header")
    page.click("[data-testid=mark-range]")
    assert page.evaluate(MARKS) == [["bookmark", 4, 5, ""], ["range", 10, 20, "header"], ["bookmark", 40, 41, ""]]
    expect(page.locator("[data-testid=mark]")).to_have_count(3)
    expect(page.locator(".he-hex .mk2")).to_have_count(10)
    expect(page.locator(".he-hex .bm")).to_have_count(2)
    # F2 / Shift+F2 jump between marks
    page.evaluate("HE.app.moveTo(0)")
    page.focus("[data-testid=view]")
    page.keyboard.press("F2")
    assert page.evaluate("HE.app.state.cursor") == 4
    page.keyboard.press("F2")
    assert page.evaluate("HE.app.state.cursor") == 10
    page.keyboard.press("Shift+F2")
    assert page.evaluate("HE.app.state.cursor") == 4
    # inserting 3 bytes at 6 moves the later marks; deleting 12..14 shrinks the range; undo puts everything back
    page.evaluate("() => { HE.app.state.buffer.insert(6, [1, 2, 3]); HE.app.state.buffer.remove(14, 3); }")
    assert page.evaluate(MARKS) == [["bookmark", 4, 5, ""], ["range", 13, 20, "header"], ["bookmark", 40, 41, ""]]
    page.evaluate("() => { HE.app.undo(); HE.app.undo(); }")
    assert page.evaluate(MARKS) == [["bookmark", 4, 5, ""], ["range", 10, 20, "header"], ["bookmark", 40, 41, ""]]
    # deleting a bookmarked byte removes the bookmark
    page.evaluate("() => HE.app.state.buffer.remove(3, 3)")
    assert [m[0] for m in page.evaluate(MARKS)] == ["range", "bookmark"]
    page.evaluate("() => HE.app.undo()")
    # clicking a range selects it; rename and remove
    page.locator("[data-testid=mark]").nth(0).locator("a").click()
    assert page.evaluate("[HE.app.state.anchor, HE.app.state.cursor]") == [10, 19]
    page.locator("[data-testid=mark]").nth(0).locator("[data-testid=mark-rename]").click()
    page.fill("[data-testid=mark-rename-input]", "magic")
    page.press("[data-testid=mark-rename-input]", "Enter")
    assert page.evaluate(MARKS)[0][3] == "magic"
    page.locator("[data-testid=mark]").nth(0).locator("[data-testid=mark-delete]").click()
    expect(page.locator("[data-testid=mark]")).to_have_count(1)
    # marks belong to their file
    load(page, b"other", "b.bin")
    expect(page.locator("[data-testid=mark]")).to_have_count(0)
    assert page.errors == []
