"""PDF viewer: the text of a page or the document – selecting, copying and saving it as .txt."""
from playwright.sync_api import expect

from test_pdfviewer import pdfs, viewer  # noqa: F401 (fixture)


def test_text(app_page, pdfs, tmp_path):  # noqa: F811
    page = viewer(app_page, pdfs)
    text = page.evaluate("PV.pageText(1)")
    assert text.split("\n")[:2] == ["Seite 1 - Kapitel 1", "Suchwort Testtext auf Seite 1"]
    whole = page.evaluate("PV.documentText()")
    assert whole.count("\f") == 2 and "Seite 3 - Kapitel 3" in whole
    # selecting in the text layer gives the text too (what Ctrl+C copies)
    selected = page.evaluate("""() => { const layer = document.querySelector(".page[data-page-number='1'] .textLayer");
      const r = document.createRange(); r.selectNodeContents(layer); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return s.toString(); }""")
    assert "Suchwort Testtext auf Seite 1" in selected
    with page.expect_download() as d:
        page.select_option("[data-testid=tools-menu]", "saveText")
    assert d.value.suggested_filename == "test.txt"
    saved = open(d.value.path(), encoding="utf-8").read()
    assert saved.startswith("Seite 1 - Kapitel 1\nSuchwort") and "Seite 2 - Kapitel 2" in saved and "\f" not in saved
    page.context.grant_permissions(["clipboard-read", "clipboard-write"]) if page.context.browser.browser_type.name == "chromium" else None
    page.select_option("[data-testid=tools-menu]", "copyPageText")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("characters copied")
    assert page.errors == []
