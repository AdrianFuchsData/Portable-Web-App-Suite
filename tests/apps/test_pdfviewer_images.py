"""PDF viewer: pages as pictures – one page as PNG or JPEG, several pages in a ZIP, at a chosen resolution."""
import io
import zipfile

from playwright.sync_api import expect

from test_pdfviewer import pdfs, viewer  # noqa: F401 (fixture)


def size(data):
    """Width and height of a PNG or JPEG."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")
    i = 2
    while i < len(data):
        marker, length = data[i + 1], int.from_bytes(data[i + 2:i + 4], "big")
        if 0xC0 <= marker <= 0xC3:
            return int.from_bytes(data[i + 7:i + 9], "big"), int.from_bytes(data[i + 5:i + 7], "big")
        i += 2 + length
    raise ValueError("no frame")


def test_export_images(app_page, pdfs):  # noqa: F811
    page = viewer(app_page, pdfs)
    # one page (the current one) as PNG at 72 dpi: a Letter page is 612 × 792 points
    page.select_option("[data-testid=tools-menu]", "exportImages")
    dialog = page.locator("[data-testid=images-dialog]")
    expect(dialog).to_be_visible()
    page.select_option("[data-testid=images-dpi]", "72")
    with page.expect_download() as d:
        page.click("[data-testid=images-ok]")
    assert d.value.suggested_filename == "test-001.png"
    data = open(d.value.path(), "rb").read()
    w, h = size(data)
    assert abs(w - 612) <= 1 and abs(h - 792) <= 1
    # all pages as JPEG at 150 dpi: a ZIP with one picture per page
    page.select_option("[data-testid=tools-menu]", "exportImages")
    page.select_option("[data-testid=images-which]", "all")
    page.select_option("[data-testid=images-format]", "jpeg")
    with page.expect_download() as d:
        page.click("[data-testid=images-ok]")
    assert d.value.suggested_filename == "test-jpeg.zip"
    z = zipfile.ZipFile(io.BytesIO(open(d.value.path(), "rb").read()))
    assert z.namelist() == ["test-001.jpg", "test-002.jpg", "test-003.jpg"]
    w, h = size(z.read("test-002.jpg"))
    assert abs(w - 1275) <= 2 and abs(h - 1650) <= 2
    expect(dialog).to_have_count(0)
    assert page.errors == []
