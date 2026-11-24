"""Text editor: Markdown preview (js/preview.js) – rendered beside the text, updated while typing, no scripts, saved as HTML."""
from playwright.sync_api import expect

from test_texteditor import open_bytes

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"
MD = b"""# Report

Some *emphasis* and a [link](https://example.org).

| A | B |
|---|---|
| 1 | 2 |

- [x] done
- [ ] open

<script>parent.document.title = 'HACKED'</script>
<img src=x onerror="parent.document.title = 'HACKED'">
"""


def frame_text(page, selector="body"):
    return page.frame_locator("[data-testid=preview-frame]").locator(selector)


def test_markdown_preview(app_page, tmp_path):
    page = app_page("texteditor", init_script=NO_PICKERS)
    open_bytes(page, "notes.md", MD)
    expect(page.locator("[data-testid=preview-toggle]")).to_be_visible()
    page.click("[data-testid=preview-toggle]")
    expect(page.locator("[data-testid=preview]")).to_be_visible()
    expect(frame_text(page, "h1")).to_have_text("Report")
    expect(frame_text(page, "table td").first).to_have_text("1")
    expect(frame_text(page, "input[type=checkbox]")).to_have_count(2)
    page.wait_for_timeout(300)
    assert page.title() != "HACKED"  # nothing in the Markdown runs
    # typing updates it
    page.locator(".cm-content").first.click()
    page.keyboard.press("Control+Home")
    page.keyboard.type("## Added\n\n")
    expect(frame_text(page, "h2")).to_have_text("Added")
    # save as HTML
    with page.expect_download() as d:
        page.click("[data-testid=save-html]")
    assert d.value.suggested_filename == "notes.html"
    html = open(d.value.path(), encoding="utf-8").read()
    assert "<h2>Added</h2>" in html and "<table>" in html
    # Ctrl+Shift+M closes it; plain text files have no preview button
    page.locator(".cm-content").first.click()
    page.keyboard.press("Control+Shift+M")
    expect(page.locator("[data-testid=preview]")).to_have_count(0)
    open_bytes(page, "plain.txt", b"text")
    expect(page.locator("[data-testid=preview-toggle]")).to_have_count(0)
    assert page.errors == []
