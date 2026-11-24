"""Barcodes: text with the code (content and a caption) and batch creation (lines or CSV -> ZIP of PNG/SVG or a PDF label sheet)."""
import io
import zipfile

import zxingcpp
from PIL import Image
from playwright.sync_api import expect
from pypdf import PdfReader

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"


def download(page, selector, tmp_path):
    with page.expect_download() as d:
        page.click(selector)
    path = tmp_path / d.value.suggested_filename
    d.value.save_as(path)
    return path


def decode(img):
    found = zxingcpp.read_barcodes(img.convert("RGB"))
    return [f.text for f in found]


def test_code_with_text_and_caption(app_page, tmp_path):
    page = app_page("barcode", init_script=NO_PICKERS)
    page.click("[data-testid=tab-create]")
    expect(page.locator("[data-testid=preview] svg")).to_be_visible()
    plain = Image.open(download(page, "[data-testid=download-png]", tmp_path))
    page.click("[data-testid=show-text]")
    page.fill("[data-testid=caption]", "Our website\nScan me")
    expect(page.locator("[data-testid=preview] svg text")).to_have_count(3)
    expect(page.locator("[data-testid=verified]")).to_contain_text("QR")
    svg = page.inner_html("[data-testid=preview]")
    assert ">https://example.org</text>" in svg and ">Our website</text>" in svg and ">Scan me</text>" in svg
    png = Image.open(download(page, "[data-testid=download-png]", tmp_path))
    assert png.width == plain.width and png.height > plain.height + 40
    assert decode(png) == ["https://example.org"]
    # above the code: the caption's baseline lies above the first module row
    page.select_option("[data-testid=caption-pos]", "above")
    expect(page.locator("[data-testid=preview] svg text").first).to_have_text("Our website")
    y_text = float(page.locator("[data-testid=preview] svg text").first.get_attribute("y"))
    first_row = float(page.evaluate("document.querySelector('[data-testid=preview] svg path').getAttribute('d').match(/^M[\\d.]+ ([\\d.]+)/)[1]"))
    assert y_text < first_row
    # a linear code: the digits below the bars, then the caption
    page.fill("[data-testid=field-text]", "400638133393")
    page.select_option("[data-testid=format]", "EAN13")
    page.select_option("[data-testid=caption-pos]", "below")
    expect(page.locator("[data-testid=verified]")).to_contain_text("EAN")
    texts = page.locator("[data-testid=preview] svg text").all_text_contents()
    assert texts[0].startswith("400638133393") and texts[1:] == ["Our website", "Scan me"]
    assert page.errors == []


def test_batch_lines_to_zip(app_page, tmp_path):
    page = app_page("barcode", init_script=NO_PICKERS)
    page.click("[data-testid=tab-batch]")
    expect(page.locator("[data-testid=batch-run]")).to_be_disabled()
    page.fill("[data-testid=batch-text]", "https://example.org/a\n\nhttps://example.org/b\nThird code")
    expect(page.locator("[data-testid=batch-run]")).to_have_text("Create 3 codes")
    expect(page.locator("[data-testid=batch-first]")).to_have_text("https://example.org/a")
    page.select_option("[data-testid=batch-output]", "zip-png")
    path = download(page, "[data-testid=batch-run]", tmp_path)
    assert path.name == "barcode-QRCode.zip"
    z = zipfile.ZipFile(path)
    assert z.namelist() == ["001-example.org_a.png", "002-example.org_b.png", "003-Third_code.png"]
    assert [decode(Image.open(io.BytesIO(z.read(n))))[0] for n in z.namelist()] == ["https://example.org/a", "https://example.org/b", "Third code"]
    expect(page.locator("[data-testid=batch-result]")).to_have_text("3 codes created")
    # EAN-13: the text lines cannot be encoded – listed and written to errors.txt
    page.fill("[data-testid=batch-text]", "400638133393\nnot a number\n9638507000004")
    page.select_option("[data-testid=batch-format]", "EAN13")
    page.select_option("[data-testid=batch-output]", "zip-svg")
    z = zipfile.ZipFile(download(page, "[data-testid=batch-run]", tmp_path))
    assert sorted(z.namelist()) == ["001-400638133393.svg", "003-9638507000004.svg", "errors.txt"]
    assert z.read("errors.txt").decode().startswith("2: not a number – ")
    expect(page.locator("[data-testid=batch-result]")).to_contain_text("1 could not be encoded")
    expect(page.locator("[data-testid=batch-errors] li")).to_have_count(1)
    assert page.errors == []


def test_batch_csv_to_pdf(app_page, tmp_path):
    page = app_page("barcode", init_script=NO_PICKERS)
    page.click("[data-testid=tab-batch]")
    csv = tmp_path / "articles.csv"
    rows = ["Article;Name;File"] + [f"https://shop.example/{i};Article {i} – € {i},90;art-{i}" for i in range(1, 11)]
    csv.write_text("\n".join(rows) + "\n", encoding="utf-8")
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=batch-open]")
    chooser.value.set_files(str(csv))
    expect(page.locator("[data-testid=batch-file]")).to_contain_text("articles.csv · 11 rows")
    page.select_option("[data-testid=batch-caption-col]", "1")
    expect(page.locator("[data-testid=batch-run]")).to_have_text("Create 10 codes")
    expect(page.locator("[data-testid=batch-first]")).to_have_text("https://shop.example/1\n— Article 1 – € 1,90")
    page.fill("[data-testid=batch-cols]", "2")
    page.fill("[data-testid=batch-rows]", "3")
    path = download(page, "[data-testid=batch-run]", tmp_path)
    assert path.name == "articles-QRCode.pdf"
    pdf = PdfReader(path)
    assert [len(p.images) for p in pdf.pages] == [6, 4]  # 10 codes, 2 × 3 per page
    first = pdf.pages[0].images[0].image
    assert decode(first) == ["https://shop.example/1"]
    # file names from a column (ZIP)
    page.select_option("[data-testid=batch-name-col]", "2")
    page.select_option("[data-testid=batch-output]", "zip-png")
    z = zipfile.ZipFile(download(page, "[data-testid=batch-run]", tmp_path))
    assert sorted(z.namelist())[:3] == ["art-1.png", "art-10.png", "art-2.png"] and len(z.namelist()) == 10
    assert page.errors == []
