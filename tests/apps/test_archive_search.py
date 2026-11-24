"""Archive manager: search by name (wildcards, all folders) and in the contents of the files (search.js)."""
import zipfile

from playwright.sync_api import expect

from test_archive import NO_PICKERS, open_archive


def demo(path):
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("readme.txt", "Hello archive\nSee TODO below\n")
        z.writestr("src/main.py", "def main():\n    # TODO: fix the bug\n    return 1\n")
        z.writestr("src/util/helpers.py", "def helper():\n    pass  # todo later\n")
        z.writestr("img/logo.bin", b"\x00\x01TODO\x00\x02")
        z.writestr("docs/notes.md", "# Notes\nnothing here\n")
    return path


def hits(page, expected=None):
    """The paths of the shown results; with expected, waits until they are these (results arrive asynchronously)."""
    get = lambda: page.locator("[data-testid=hit]").evaluate_all("(els) => els.map((e) => e.dataset.path)")
    for _ in range(100):
        got = get()
        if expected is None or (got == expected and not page.evaluate("AR.app.state.search && AR.app.state.search.running")):
            return got
        page.wait_for_timeout(50)
    return got


def test_search_names_and_contents(app_page, tmp_path):
    page = app_page("archive", init_script=NO_PICKERS)
    open_archive(page, demo(tmp_path / "demo.zip"))
    page.keyboard.press("Control+f")
    expect(page.locator("[data-testid=search-bar]")).to_be_visible()
    page.fill("[data-testid=search-name]", "*.py")
    assert hits(page, ["src/main.py", "src/util/helpers.py"]) == ["src/main.py", "src/util/helpers.py"]
    page.fill("[data-testid=search-name]", "util")
    assert hits(page, ["src/util"]) == ["src/util"]
    page.fill("[data-testid=search-name]", "nothing-like-this")
    expect(page.locator("[data-testid=search-none]")).to_be_visible()
    # a click shows the file in its folder, selected
    page.fill("[data-testid=search-name]", "helpers")
    page.locator("[data-testid=hit] a").first.click()
    expect(page.locator("[data-testid=search-bar]")).to_have_count(0)
    assert page.evaluate("[AR.app.state.cwd, [...AR.app.state.selected]]") == ["src/util", ["src/util/helpers.py"]]
    # contents: case-insensitive by default; binary files are skipped
    page.click("[data-testid=search]")
    page.fill("[data-testid=search-name]", "")
    page.check("[data-testid=search-contents]")
    page.fill("[data-testid=search-text]", "todo")
    page.click("[data-testid=search-go]")
    expect(page.locator("[data-testid=search-summary]")).to_be_visible()
    assert hits(page, ["readme.txt", "src/main.py", "src/util/helpers.py"]) == ["readme.txt", "src/main.py", "src/util/helpers.py"]
    expect(page.locator("[data-testid=search-summary]")).to_contain_text("1 binary")
    line = page.locator("[data-testid=hit][data-path='src/main.py'] [data-testid=hit-line]")
    expect(line).to_contain_text("line 2, column 7")
    expect(line.locator("mark")).to_have_text("TODO")
    # match case, a regular expression, limited to *.py
    page.check("[data-testid=search-case]")
    page.click("[data-testid=search-go]")
    expect(page.locator("[data-testid=search-summary]")).to_be_visible()
    assert hits(page, ["src/util/helpers.py"]) == ["src/util/helpers.py"]  # (only the lower-case "todo")
    page.uncheck("[data-testid=search-case]")
    page.check("[data-testid=search-regex]")
    page.fill("[data-testid=search-text]", r"def \w+\(\)")
    page.fill("[data-testid=search-name]", "*.py")
    page.click("[data-testid=search-go]")
    expect(page.locator("[data-testid=search-summary]")).to_contain_text("2 of 2")
    page.fill("[data-testid=search-text]", "(")
    page.click("[data-testid=search-go]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("not valid")
    page.click("[data-testid=search-close]")
    expect(page.locator("[data-testid=list]")).to_be_visible()
    assert page.errors == []
