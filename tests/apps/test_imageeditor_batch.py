"""Image editor: batch processing (batch.js) – many images through the same steps into one ZIP."""
import io
import zipfile

from PIL import Image
from playwright.sync_api import expect

from test_imageeditor import menu, NO_PICKERS


def test_batch_to_zip(app_page, tmp_path):
    files = []
    for i, (size, color) in enumerate([((400, 200), (200, 50, 50)), ((100, 300), (50, 200, 50)), ((50, 50), (50, 50, 200))]):
        p = tmp_path / f"photo{i}.png"
        Image.new("RGB", size, color).save(p)
        files.append(p)
    (tmp_path / "broken.png").write_bytes(b"not an image")
    page = app_page("imageeditor", init_script=NO_PICKERS)
    menu(page, "file", "batch")
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=batch-files]")
    chooser.value.set_files([str(p) for p in files] + [str(tmp_path / "broken.png")])
    expect(page.locator("[data-testid=batch-count]")).to_contain_text("4")
    page.check("[data-testid=batch-resize]")
    page.fill("[data-testid=batch-resize-width]", "200")
    page.fill("[data-testid=batch-resize-height]", "200")
    page.check("[data-testid=batch-grayscale]")
    page.check("[data-testid=batch-watermark]")
    page.fill("[data-testid=batch-watermark-text]", "© Test")
    page.select_option("[data-testid=batch-format]", "jpeg")
    page.fill("[data-testid=batch-pattern]", "{n}-{name}-{w}x{h}")
    with page.expect_download(timeout=60000) as d:
        page.click("[data-testid=dlg-ok]")
    assert d.value.suggested_filename == "images.zip"
    d.value.save_as(tmp_path / "out.zip")
    z = zipfile.ZipFile(tmp_path / "out.zip")
    names = sorted(z.namelist())
    assert names == ["001-photo0-200x100.jpg", "002-photo1-67x200.jpg", "003-photo2-50x50.jpg", "errors.txt"]
    assert "broken.png" in z.read("errors.txt").decode()
    img = Image.open(io.BytesIO(z.read("001-photo0-200x100.jpg")))
    assert img.format == "JPEG" and img.size == (200, 100)
    r, g, b = img.convert("RGB").getpixel((20, 20))
    assert abs(r - g) < 6 and abs(g - b) < 6  # grayscale
    corner = img.convert("RGB").crop((120, 80, 200, 100))
    assert max(p[0] for p in corner.getdata()) > 150  # the watermark (light text) at the bottom right
    # the steps are remembered
    menu(page, "file", "batch")
    expect(page.locator("[data-testid=batch-grayscale]")).to_be_checked()
    expect(page.locator("[data-testid=batch-pattern]")).to_have_value("{n}-{name}-{w}x{h}")
    # nothing chosen: a message, the dialog stays
    page.click("[data-testid=dlg-ok]")
    expect(page.locator("[data-testid=batch-files]")).to_be_visible()
    assert page.errors == []
