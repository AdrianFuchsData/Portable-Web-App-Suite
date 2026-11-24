"""PDF viewer: compress – large pictures scaled down and stored as JPEG, uncompressed streams packed, the text kept."""
import base64
import io
import zlib

from PIL import Image
from playwright.sync_api import expect
from pypdf import PdfReader

from test_pdfviewer import pdfs, viewer  # noqa: F401 (fixture)


def picture(w, h):
    """A smooth colour picture (large as raw data, compresses well as JPEG)."""
    img = Image.radial_gradient("L").resize((w, h))
    return Image.merge("RGB", (img, img.transpose(Image.Transpose.FLIP_LEFT_RIGHT), img.transpose(Image.Transpose.FLIP_TOP_BOTTOM)))


def make_pdf(path):
    """Two pages: a Flate RGB picture (PNG predictor) and a high-quality JPEG; uncompressed text content streams."""
    a = picture(2400, 1800)
    raw = a.tobytes()
    flate = zlib.compress(raw, 6)
    buf = io.BytesIO()
    picture(3000, 2000).save(buf, "JPEG", quality=98)
    jpeg = buf.getvalue()
    # a gray picture with PNG predictors: the IDAT data of a PNG is exactly that
    buf = io.BytesIO()
    Image.radial_gradient("L").resize((1600, 1200)).save(buf, "PNG")
    png, idat, i = buf.getvalue(), b"", 8
    while i < len(png):
        n = int.from_bytes(png[i:i + 4], "big")
        if png[i + 4:i + 8] == b"IDAT":
            idat += png[i + 8:i + 8 + n]
        i += 12 + n
    objs = []
    content = lambda n: (f"q 500 0 0 375 50 350 cm /Im Do Q BT /F1 24 Tf 50 750 Td (Compress page {n}) Tj ET " + ("q 200 0 0 150 50 50 cm /Gray Do Q " if n == 2 else "") + "% padding " * 20).encode()
    objs.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objs.append(b"<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>")
    objs.append(b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> /XObject << /Im 6 0 R >> >> /Contents 8 0 R >>")
    objs.append(b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> /XObject << /Im 7 0 R /Gray 10 0 R >> >> /Contents 9 0 R >>")
    objs.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    objs.append(b"<< /Type /XObject /Subtype /Image /Width 2400 /Height 1800 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length %d >>\nstream\n" % len(flate) + flate + b"\nendstream")
    objs.append(b"<< /Type /XObject /Subtype /Image /Width 3000 /Height 2000 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length %d >>\nstream\n" % len(jpeg) + jpeg + b"\nendstream")
    for n in (1, 2):
        c = content(n)
        objs.append(b"<< /Length %d >>\nstream\n" % len(c) + c + b"\nendstream")
    objs.append(b"<< /Type /XObject /Subtype /Image /Width 1600 /Height 1200 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode "
                b"/DecodeParms << /Predictor 15 /Colors 1 /Columns 1600 >> /Length %d >>\nstream\n" % len(idat) + idat + b"\nendstream")
    out = bytearray(b"%PDF-1.7\n")
    offsets = []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1) + b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    path.write_bytes(bytes(out))
    return path


def test_compress(app_page, pdfs, tmp_path):  # noqa: F811
    page = viewer(app_page, pdfs)
    src = make_pdf(tmp_path / "big.pdf")
    page.evaluate("([n, b]) => PV.openBytes(n, Uint8Array.from(atob(b), (c) => c.charCodeAt(0)))", [src.name, base64.b64encode(src.read_bytes()).decode()])
    page.wait_for_function("PV.state.pages === 2")
    page.select_option("[data-testid=tools-menu]", "compress")
    expect(page.locator("[data-testid=compress-dialog]")).to_be_visible()
    page.click("[data-testid=compress-screen]")
    page.click("[data-testid=compress-ok]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("Compressed", timeout=30000)
    assert "3 pictures" in page.locator("[data-testid=toast]").last.inner_text()
    data = page.evaluate(
        "async () => { const b = await PV.documentBytes(); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); }")
    out = base64.b64decode(data)
    assert len(out) < src.stat().st_size / 3
    reader = PdfReader(io.BytesIO(out))
    assert len(reader.pages) == 2
    for n, p in enumerate(reader.pages, 1):
        assert f"Compress page {n}" in p.extract_text()
        im = p["/Resources"]["/XObject"]["/Im"].get_object()
        assert im["/Filter"] == "/DCTDecode" and max(im["/Width"], im["/Height"]) <= round(96 * 11.7)
        assert p["/Contents"].get_object().get("/Filter") == "/FlateDecode"
    gray = reader.pages[1]["/Resources"]["/XObject"]["/Gray"].get_object()
    assert gray["/Filter"] == "/DCTDecode" and gray["/Width"] == round(1600 * 1123 / 1600) and "/DecodeParms" not in gray
    # the picture looks the same: the centre of the radial gradient is dark, the corner light
    pic = Image.open(io.BytesIO(gray._data)).convert("L")
    assert pic.getpixel((pic.width // 2, pic.height // 2)) < 40 and pic.getpixel((2, 2)) > 200
    # undo brings the original back
    page.keyboard.press("Control+z")
    page.wait_for_function("!PV.state.modified")
    assert page.errors == []
