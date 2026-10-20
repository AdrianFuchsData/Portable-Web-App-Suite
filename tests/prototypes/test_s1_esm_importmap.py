"""S-1: ES-module libraries (CodeMirror 6) from a single HTML file opened via file://."""
from helpers.paths import dist_url


def test_codemirror_loads_and_edits(page):
    page.goto(dist_url("s1-esm-importmap"))
    page.wait_for_selector("body[data-ready]")
    assert page.text_content("#status") == "ready"
    # syntax highlighting produced styled tokens
    assert page.locator(".cm-content span").count() > 3
    page.click(".cm-content")
    page.keyboard.press("Control+End")
    page.keyboard.type("const x = 1;")
    assert "const x = 1;" in page.evaluate("S1.view.state.doc.toString()")
    # autocomplete/undo come from basicSetup
    page.keyboard.press("Control+z")
    assert "const x = 1;" not in page.evaluate("S1.view.state.doc.toString()")
    assert page.errors == []
    assert page.requests == []


def test_language_switch_and_theme(page):
    page.goto(dist_url("s1-esm-importmap"))
    page.wait_for_selector("body[data-ready]")
    for lang in ["python", "html", "css", "markdown", "json", "javascript"]:
        page.select_option("#lang", lang)
    page.check("#dark")
    bg = page.evaluate("getComputedStyle(document.querySelector('.cm-editor')).backgroundColor")
    assert bg == "rgb(40, 44, 52)"  # one-dark background
    assert page.errors == []
