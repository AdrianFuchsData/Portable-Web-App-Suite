"""PDF viewer: redaction – marked areas and text are really removed (the pages are rebuilt as pictures)."""
import io

from playwright.sync_api import expect
from pypdf import PdfReader

from test_pdfviewer import pdfs, viewer  # noqa: F401 (fixture)


def test_redaction(app_page, pdfs, tmp_path):  # noqa: F811
    page = viewer(app_page, pdfs)
    page.select_option("[data-testid=tools-menu]", "redact")
    expect(page.locator("[data-testid=redact-bar]")).to_be_visible()
    page.fill("[data-testid=redact-text]", "Suchwort")
    page.click("[data-testid=redact-find]")
    expect(page.locator("[data-testid=redact-count]")).to_have_text("3 boxes")
    # a box drawn by hand on page 1 (over the title), and one removed again by a click
    box = page.locator(".page[data-page-number='1'] .canvasWrapper").bounding_box()
    page.mouse.move(box["x"] + box["width"] * 0.1, box["y"] + box["height"] * 0.07)
    page.mouse.down()
    page.mouse.move(box["x"] + box["width"] * 0.7, box["y"] + box["height"] * 0.12, steps=5)
    page.mouse.up()
    expect(page.locator("[data-testid=redact-count]")).to_have_text("4 boxes")
    expect(page.locator(".page[data-page-number='1'] [data-testid=redaction]")).to_have_count(2)
    page.locator(".page[data-page-number='1'] [data-testid=redaction]").last.dispatch_event("pointerdown")
    expect(page.locator("[data-testid=redact-count]")).to_have_text("3 boxes")
    page.click("[data-testid=redact-apply]")
    page.click("[data-testid=confirm-ok]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("3 pages redacted", timeout=30000)
    with page.expect_download() as d:
        page.keyboard.press("Control+s")
    data = open(d.value.path(), "rb").read()
    assert b"Suchwort" not in data and b"Testtext" not in data  # (no trace of the text in the file)
    reader = PdfReader(io.BytesIO(data))
    assert len(reader.pages) == 3
    for p in reader.pages:
        assert "Suchwort" not in (p.extract_text() or "")
        assert len(p.images) == 1
    # undo brings the text back (until saved elsewhere)
    page.select_option("[data-testid=pages-menu]", "undo")
    page.wait_for_selector(".page[data-page-number='1'] .textLayer span")
    assert "Suchwort" in page.evaluate("PV.pageText(1)")
    assert page.errors == []
