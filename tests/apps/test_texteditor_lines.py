"""Text editor: line tools with options (number, prefix/suffix, keep/remove matching lines, wrap) and shuffle."""
from playwright.sync_api import expect

from test_texteditor import open_bytes

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"


def text(page):
    return page.evaluate("TE.app.view.state.doc.toString()")


def run(page, tool, **fields):
    page.select_option("[data-testid=tools]", tool)
    expect(page.locator("[data-testid=line-dialog]")).to_be_visible()
    for key, value in fields.items():
        el = page.locator(f"[data-testid=lt-{key}]")
        if isinstance(value, bool):
            el.set_checked(value)
        else:
            el.fill(str(value))
    page.click("[data-testid=lt-ok]")
    expect(page.locator("[data-testid=line-dialog]")).to_have_count(0)


def test_line_tools(app_page):
    page = app_page("texteditor", init_script=NO_PICKERS)
    open_bytes(page, "list.txt", b"apple\nBanana\n\ncherry pie\nbanana split")
    run(page, "numberLines", start=9, separator=") ", pad=True)
    assert text(page) == "09) apple\n10) Banana\n11) \n12) cherry pie\n13) banana split"
    page.keyboard.press("Control+z")
    run(page, "affix", prefix="- [ ] ", suffix=";", skipEmpty=True)
    assert text(page) == "- [ ] apple;\n- [ ] Banana;\n\n- [ ] cherry pie;\n- [ ] banana split;"
    page.keyboard.press("Control+z")
    run(page, "keepMatching", pattern="banana", regex=False, caseSensitive=False)
    assert text(page) == "Banana\nbanana split"
    page.keyboard.press("Control+z")
    run(page, "removeMatching", pattern="^(apple|$)", regex=True)
    assert text(page) == "Banana\ncherry pie\nbanana split"
    page.keyboard.press("Control+z")
    # the preview shows the result before applying; a bad expression is reported
    page.select_option("[data-testid=tools]", "keepMatching")
    page.fill("[data-testid=lt-pattern]", "(")
    page.check("[data-testid=lt-regex]")
    expect(page.locator("[data-testid=lt-preview]")).to_contain_text("not valid")
    page.click("[data-testid=lt-cancel]")
    # wrap at a width keeps the indentation
    open_bytes(page, "long.txt", b"  one two three four five six seven eight nine ten")
    run(page, "hardWrap", width=20)
    assert text(page) == "  one two three four\n  five six seven\n  eight nine ten"
    # shuffle keeps the lines
    open_bytes(page, "n.txt", "\n".join(str(i) for i in range(50)).encode())
    page.select_option("[data-testid=tools]", "shuffle")
    lines = text(page).split("\n")
    assert sorted(lines, key=int) == [str(i) for i in range(50)] and lines != [str(i) for i in range(50)]
    assert page.errors == []
