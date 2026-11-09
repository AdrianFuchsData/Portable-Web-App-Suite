"""Image editor: EXIF orientation, image information (metadata: camera, location, comments, XMP) and a copy without metadata
(apps/imageeditor/src/js/meta.js) – the image data stays byte for byte."""
import io

from PIL import Image
from playwright.sync_api import expect

from test_imageeditor import menu, open_image, pixel, NO_PICKERS

XMP = b'<?xpacket begin=""?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></x:xmpmeta>'


def photo(path, orientation=6, fmt="JPEG"):
    img = Image.new("RGB", (40, 20), (200, 30, 30))
    img.paste((30, 30, 200), (0, 0, 10, 20))  # blue on the left
    exif = Image.Exif()
    exif[0x010F] = "Canon"
    exif[0x0110] = "EOS Test"
    exif[0x0112] = orientation
    exif[0x013B] = "Jane Doe"
    exif.get_ifd(0x8825).update({1: "N", 2: (48.0, 12.0, 30.0), 3: "E", 4: (16.0, 22.0, 0.0)})
    buf = io.BytesIO()
    if fmt == "JPEG":
        img.save(buf, "JPEG", exif=exif, comment=b"secret note", quality=90)
        data = buf.getvalue()
        seg = b"http://ns.adobe.com/xap/1.0/\0" + XMP
        data = data[:2] + b"\xff\xe1" + (len(seg) + 2).to_bytes(2, "big") + seg + data[2:]
    else:
        img.save(buf, fmt, exif=exif)
        data = buf.getvalue()
    path.write_bytes(data)
    return path


def info(page):
    menu(page, "file", "info")
    expect(page.locator("[data-testid=dialog]")).to_be_visible()


def strip(page, tmp_path):
    with page.expect_download() as d:
        page.click("[data-testid=meta-strip]")
    out = tmp_path / ("out-" + d.value.suggested_filename)
    d.value.save_as(out)
    return out, d.value.suggested_filename


def test_jpeg_orientation_info_and_clean_copy(app_page, tmp_path):
    src = photo(tmp_path / "photo.jpg")
    page = app_page("imageeditor", init_script=NO_PICKERS)
    open_image(page, src)
    expect(page.locator("[data-testid=image-size]")).to_have_text("20 × 40")  # (turned upright by the EXIF orientation 6)
    r, g, b, _ = pixel(page, 10, 3)  # the blue left edge is now at the top (90° clockwise)
    assert b > 150 and r < 80
    r, g, b, _ = pixel(page, 10, 30)
    assert r > 150 and b < 80
    info(page)
    table = page.locator("[data-testid=meta-table]")
    for text in ("Canon", "EOS Test", "Jane Doe", "secret note", "XMP", "48.2083", "16.3666"):
        expect(table).to_contain_text(text)
    expect(page.locator("[data-testid=meta-gps]")).to_be_visible()
    out, name = strip(page, tmp_path)
    assert name == "photo-clean.jpg"
    data, before = out.read_bytes(), src.read_bytes()
    assert b"Canon" not in data and b"secret note" not in data and b"xmpmeta" not in data and b"Jane" not in data
    sos = lambda b: b[b.index(b"\xff\xda"):]
    assert sos(data) == sos(before)  # the compressed image is unchanged
    clean = Image.open(out)
    exif = clean.getexif()
    assert dict(exif) == {0x0112: 6} and not exif.get_ifd(0x8825)
    assert clean.size == (40, 20)
    # opened again: still upright, nothing to show but the orientation
    page.click("[data-testid=dlg-ok]")
    open_image(page, out)
    expect(page.locator("[data-testid=image-size]")).to_have_text("20 × 40")
    info(page)
    expect(page.locator("[data-testid=meta-table]")).to_contain_text("6")
    expect(page.locator("[data-testid=meta-strip]")).to_have_count(0)
    assert page.errors == []


def test_png_and_webp(app_page, tmp_path):
    from PIL import PngImagePlugin
    img = Image.new("RGBA", (16, 8), (10, 200, 10, 255))
    meta = PngImagePlugin.PngInfo()
    meta.add_text("Author", "Max Muster")
    meta.add_text("Comment", "made with care")
    exif = Image.Exif()
    exif[0x0110] = "Phone X"
    img.save(tmp_path / "a.png", pnginfo=meta, exif=exif)
    page = app_page("imageeditor", init_script=NO_PICKERS)
    open_image(page, tmp_path / "a.png")
    expect(page.locator("[data-testid=image-size]")).to_have_text("16 × 8")
    info(page)
    expect(page.locator("[data-testid=meta-table]")).to_contain_text("Max Muster")
    expect(page.locator("[data-testid=meta-table]")).to_contain_text("Phone X")
    out, _ = strip(page, tmp_path)
    clean = Image.open(out)
    assert "Author" not in clean.info and not clean.getexif() and clean.convert("RGBA").getpixel((3, 3)) == (10, 200, 10, 255)
    page.click("[data-testid=dlg-ok]")
    # WebP with EXIF
    photo(tmp_path / "b.webp", orientation=1, fmt="WEBP")
    open_image(page, tmp_path / "b.webp")
    expect(page.locator("[data-testid=image-size]")).to_have_text("40 × 20")
    info(page)
    expect(page.locator("[data-testid=meta-table]")).to_contain_text("Canon")
    out, _ = strip(page, tmp_path)
    data = out.read_bytes()
    assert b"EXIF" not in data and b"Canon" not in data and int.from_bytes(data[4:8], "little") == len(data) - 8
    assert Image.open(out).size == (40, 20)
    # a file without metadata: a message
    page.click("[data-testid=dlg-ok]")
    Image.new("RGB", (5, 5)).save(tmp_path / "plain.png")
    open_image(page, tmp_path / "plain.png")
    info(page)
    expect(page.locator("[data-testid=meta-none]")).to_be_visible()
    assert page.errors == []
