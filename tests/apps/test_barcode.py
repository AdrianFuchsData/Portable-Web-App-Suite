"""Barcodes (apps/barcode): test images are written with zxing-cpp and segno, created codes are read back with zxing-cpp."""
import io

import segno
import zxingcpp
from PIL import Image
from playwright.sync_api import expect

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"
WIFI = "WIFI:T:WPA;S:Gäste;P:geheim;;"


def zx_image(text, fmt, scale=3):
    mv = memoryview(zxingcpp.create_barcode(text, fmt).to_image(scale=scale))
    return Image.frombuffer("L", (mv.shape[1], mv.shape[0]), bytes(mv), "raw", "L", 0, 1).convert("RGB")


def two_codes(path):
    """An image with a QR code (Wi-Fi) and an EAN-13 bar code next to each other."""
    buf = io.BytesIO()
    segno.make_qr(WIFI, error="m").save(buf, kind="png", scale=6)
    qr = Image.open(io.BytesIO(buf.getvalue())).convert("RGB")
    ean = zx_image("4006381333931", zxingcpp.BarcodeFormat.EAN13)
    img = Image.new("RGB", (qr.width + ean.width + 60, max(qr.height, ean.height) + 40), "white")
    img.paste(qr, (20, 20))
    img.paste(ean, (qr.width + 40, 20))
    img.save(path)
    return path


def read_png(data):
    return [(str(r.format), r.text) for r in zxingcpp.read_barcodes(Image.open(io.BytesIO(data)).convert("RGB"))]


def open_image(page, path):
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=open-image]")
    chooser.value.set_files(str(path))


def test_read_two_codes_from_an_image(app_page, tmp_path):
    page = app_page("barcode", init_script=NO_PICKERS)
    assert page.title() == "Barcodes"
    open_image(page, two_codes(tmp_path / "codes.png"))
    results = page.locator("[data-testid=result]")
    expect(results).to_have_count(2)
    texts = {results.nth(i).locator("[data-testid=result-format]").inner_text(): results.nth(i) for i in range(2)}
    wifi, ean = texts["QRCode"], texts["EAN13"]
    expect(wifi.locator("[data-testid=result-type]")).to_have_text("Wi-Fi")
    expect(wifi.locator("[data-testid=result-text]")).to_have_text(WIFI)
    expect(wifi.locator("dl")).to_contain_text("Gäste")
    expect(ean.locator("[data-testid=result-text]")).to_have_text("4006381333931")
    expect(page.locator("[data-testid=image]")).to_be_visible()
    # the same image again adds nothing; another code is added on top
    open_image(page, tmp_path / "codes.png")
    expect(results).to_have_count(2)
    url = tmp_path / "url.png"
    segno.make_qr("https://example.org/pfad?x=1").save(str(url), scale=8)
    open_image(page, url)
    expect(results).to_have_count(3)
    expect(results.first.locator("[data-testid=result-type]")).to_have_text("Link")
    expect(results.first.locator("[data-testid=open-link]")).to_have_attribute("href", "https://example.org/pfad?x=1")
    expect(results.first.locator("[data-testid=open-link]")).to_have_attribute("rel", "noopener noreferrer")
    # an image without a code
    Image.new("RGB", (100, 100), "white").save(tmp_path / "empty.png")
    open_image(page, tmp_path / "empty.png")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("No barcode found")
    assert page.errors == [] and page.requests == []


def test_contents_contact_and_generator_round_trip(app_page, tmp_path):
    page = app_page("barcode", init_script=NO_PICKERS)
    vcard = "BEGIN:VCARD\nVERSION:3.0\nN:Muster;Anna;;;\nFN:Anna Muster\nTEL:+43 1 234\nEMAIL:anna@example.org\nEND:VCARD"
    path = tmp_path / "vcard.png"
    segno.make_qr(vcard).save(str(path), scale=6)
    open_image(page, path)
    result = page.locator("[data-testid=result]").first
    expect(result.locator("[data-testid=result-type]")).to_have_text("Contact")
    with page.expect_download() as d:
        result.locator("[data-testid=save-contact]").click()
    assert d.value.suggested_filename == "Anna_Muster.vcf"
    # take it to the generator, change it, create a PNG and an SVG and read them back
    result.locator("[data-testid=use-it]").click()
    expect(page.locator("[data-testid=field-first]")).to_have_value("Anna")
    page.fill("[data-testid=field-org]", "Beispiel GmbH")
    expect(page.locator("[data-testid=verified]")).to_contain_text("readable")
    with page.expect_download() as d:
        page.click("[data-testid=download-png]")
    [(fmt, text)] = read_png(open(d.value.path(), "rb").read())
    assert fmt == "QR Code" and "ORG:Beispiel GmbH" in text and "N:Muster;Anna" in text
    with page.expect_download() as d:
        page.click("[data-testid=download-svg]")
    assert open(d.value.path(), encoding="utf-8").read().startswith("<svg")
    assert page.errors == []


def test_create_formats_options_and_errors(app_page, tmp_path):
    page = app_page("barcode", init_script=NO_PICKERS)
    page.click("[data-testid=tab-create]")
    page.select_option("[data-testid=content-type]", "wifi")
    page.fill("[data-testid=field-ssid]", "Büro")
    page.fill("[data-testid=field-password]", "pa;ss")
    page.select_option("[data-testid=ec-level]", "H")
    page.fill("[data-testid=scale]", "8")
    expect(page.locator("[data-testid=gen-text]")).to_have_text("WIFI:T:WPA;S:Büro;P:pa\;ss;;")
    expect(page.locator("[data-testid=verified]")).to_contain_text("readable")
    with page.expect_download() as d:
        page.click("[data-testid=download-png]")
    assert read_png(open(d.value.path(), "rb").read()) == [("QR Code", "WIFI:T:WPA;S:Büro;P:pa\;ss;;")]
    # a 1D code with an example, then invalid content
    page.select_option("[data-testid=format]", "EAN13")
    expect(page.locator("[data-testid=field-text]")).to_have_value("400638133393")
    expect(page.locator("[data-testid=verified]")).to_contain_text("EAN13")
    with page.expect_download() as d:
        page.click("[data-testid=download-png]")
    assert read_png(open(d.value.path(), "rb").read()) == [("EAN-13", "4006381333931")]
    page.fill("[data-testid=field-text]", "abc")
    expect(page.locator("[data-testid=gen-error]")).to_contain_text("cannot be encoded as EAN13")
    for fmt, text in (("DataMatrix", "Data Matrix ä"), ("Aztec", "Aztec 123"), ("PDF417", "PDF 417"), ("Code128", "Code-128 x")):
        page.select_option("[data-testid=format]", fmt)
        page.fill("[data-testid=field-text]", text)
        expect(page.locator("[data-testid=verified]")).to_contain_text("readable")
    # light code on a dark background is still readable (read back inverted)
    page.locator("[data-testid=fg]").evaluate("(el) => { el.value = '#ffffff'; el.dispatchEvent(new Event('input', { bubbles: true })); }")
    page.locator("[data-testid=bg]").evaluate("(el) => { el.value = '#202020'; el.dispatchEvent(new Event('input', { bubbles: true })); }")
    expect(page.locator("[data-testid=preview] svg path")).to_have_attribute("fill", "#ffffff")
    assert page.errors == []


CAMERA = """
navigator.mediaDevices.getUserMedia = async () => {
  const c = document.createElement('canvas'); c.width = 640; c.height = 480;
  const g = c.getContext('2d'); const img = new Image(); img.src = window.CAMERA_IMAGE;
  await img.decode();
  const draw = () => { g.fillStyle = '#fff'; g.fillRect(0, 0, 640, 480); g.drawImage(img, 170, 90, 300, 300); requestAnimationFrame(draw); };
  draw();
  return c.captureStream(15);
};
"""


def test_camera(app_page):
    uri = segno.make_qr("Hallo Kamera").png_data_uri(scale=8)
    page = app_page("barcode", init_script=f"window.CAMERA_IMAGE = {uri!r};" + CAMERA)
    page.click("[data-testid=camera]")
    expect(page.locator("[data-testid=result-text]").first).to_have_text("Hallo Kamera", timeout=15000)
    expect(page.locator("[data-testid=camera]")).to_contain_text("Stop camera")
    page.click("[data-testid=camera]")
    expect(page.locator("[data-testid=video]")).to_have_count(0)
    assert page.errors == []


def test_german_and_mobile(app_page, tmp_path):
    page = app_page("barcode", mobile=True, init_script="localStorage.setItem('suite.lang', 'de');" + NO_PICKERS)
    expect(page.locator("[data-testid=tab-read]")).to_contain_text("Lesen")
    page.click("[data-testid=tab-create]")
    expect(page.locator("[data-testid=verified]")).to_contain_text("lesbar")
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    # the code is shown above the form
    assert page.locator("[data-testid=output]").bounding_box()["y"] < page.locator("[data-testid=content-type]").bounding_box()["y"]
