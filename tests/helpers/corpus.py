"""Seed files of every format the apps open, made with other software (Python libraries, LibreOffice, ffmpeg) – for the
fuzz tests (mutated copies) and the conformance tests (files the apps must read).

    seeds(workdir) -> {app: [(name, bytes), ...]}

Formats that need a missing program are left out."""
import base64
import io
import json
import shutil
import sqlite3
import struct
import subprocess
import tarfile
import wave
import zipfile
import zlib
from pathlib import Path


def png(size=(24, 16), color=(200, 40, 40)):
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, "PNG")
    return buf.getvalue()


def image(fmt, size=(24, 16)):
    from PIL import Image, ImageDraw
    img = Image.new("RGBA" if fmt in ("PNG", "WEBP", "GIF", "ICO") else "RGB", size, (30, 120, 200))
    ImageDraw.Draw(img).rectangle((4, 4, 12, 10), fill=(250, 200, 0))
    buf = io.BytesIO()
    img.save(buf, fmt)
    return buf.getvalue()


def wav(seconds=0.25, rate=8000):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"".join(struct.pack("<h", (i * 997) % 20000 - 10000) for i in range(int(seconds * rate))))
    return buf.getvalue()


def minimal_pdf(text="Seed PDF"):
    """A PDF with one page of text, an outline and a link (written by hand, with a correct cross-reference table)."""
    content = f"BT /F1 24 Tf 40 200 Td ({text}) Tj ET".encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R /Outlines 6 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> /Annots [8 0 R] >>",
        b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Type /Outlines /First 7 0 R /Last 7 0 R /Count 1 >>",
        b"<< /Title (Start) /Parent 6 0 R /Dest [3 0 R /Fit] >>",
        b"<< /Type /Annot /Subtype /Link /Rect [40 190 200 230] /A << /S /URI /URI (https://example.org/) >> >>",
    ]
    out = io.BytesIO()
    out.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for i, body in enumerate(objects, 1):
        offsets.append(out.tell())
        out.write(b"%d 0 obj\n" % i + body + b"\nendobj\n")
    xref = out.tell()
    out.write(b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1))
    for off in offsets:
        out.write(b"%010d 00000 n \n" % off)
    out.write(b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref))
    return out.getvalue()


def zip_of(files):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in files.items():
            z.writestr(name, data)
    return buf.getvalue()


def png_with_text(png_bytes, key, text):
    """A PNG with a tEXt chunk (draw.io's editable PNG keeps the diagram in "mxfile")."""
    chunk = key.encode("latin1") + b"\0" + text.encode("latin1")
    tEXt = struct.pack(">I", len(chunk)) + b"tEXt" + chunk + struct.pack(">I", zlib.crc32(b"tEXt" + chunk) & 0xffffffff)
    return png_bytes[:33] + tEXt + png_bytes[33:]  # after the signature and IHDR


DRAWIO = ('<mxfile><diagram name="Seite 1" id="p1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>'
          '<mxCell id="a" value="Start &amp; more" style="rounded=1;fillColor=#dae8fc;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>'
          '<mxCell id="b" value="&lt;b&gt;End&lt;/b&gt;" style="ellipse;html=1;rotation=30;" vertex="1" parent="1"><mxGeometry x="240" y="40" width="80" height="80" as="geometry"/></mxCell>'
          '<mxCell id="g" value="" style="group" vertex="1" connectable="0" parent="1"><mxGeometry x="40" y="160" width="200" height="80" as="geometry"/></mxCell>'
          '<mxCell id="c" value="in group" style="rhombus;" vertex="1" parent="g"><mxGeometry width="80" height="60" as="geometry"/></mxCell>'
          '<mxCell id="e" value="goes" style="edgeStyle=orthogonalEdgeStyle;endArrow=classic;" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="200" y="20"/></Array></mxGeometry></mxCell>'
          '</root></mxGraphModel></diagram></mxfile>')

ICS = """BEGIN:VCALENDAR\r
VERSION:2.0\r
PRODID:-//Seed//EN\r
X-WR-CALNAME:Seed calendar\r
BEGIN:VTIMEZONE\r
TZID:Europe/Vienna\r
BEGIN:STANDARD\r
DTSTART:19701025T030000\r
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU\r
TZOFFSETFROM:+0200\r
TZOFFSETTO:+0100\r
END:STANDARD\r
BEGIN:DAYLIGHT\r
DTSTART:19700329T020000\r
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU\r
TZOFFSETFROM:+0100\r
TZOFFSETTO:+0200\r
END:DAYLIGHT\r
END:VTIMEZONE\r
BEGIN:VEVENT\r
UID:seed-1@example.org\r
DTSTAMP:20261001T080000Z\r
DTSTART;TZID=Europe/Vienna:20261014T100000\r
DTEND;TZID=Europe/Vienna:20261014T113000\r
RRULE:FREQ=WEEKLY;COUNT=5;BYDAY=WE\r
EXDATE;TZID=Europe/Vienna:20261021T100000\r
SUMMARY:Weekly meeting\r
DESCRIPTION:Line one\\nLine two\\, with comma\r
LOCATION:Room 1\r
BEGIN:VALARM\r
ACTION:DISPLAY\r
TRIGGER:-PT15M\r
DESCRIPTION:Reminder\r
END:VALARM\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:seed-2@example.org\r
DTSTAMP:20261001T080000Z\r
DTSTART;VALUE=DATE:20261016\r
DTEND;VALUE=DATE:20261017\r
SUMMARY:All day\r
END:VEVENT\r
BEGIN:VTODO\r
UID:seed-3@example.org\r
DTSTAMP:20261001T080000Z\r
SUMMARY:A task\r
DUE:20261020T120000Z\r
END:VTODO\r
END:VCALENDAR\r
"""


def eml():
    from email.message import EmailMessage
    msg = EmailMessage()
    msg["From"] = "Ann Example <ann@example.org>"
    msg["To"] = "bob@example.org, =?utf-8?q?J=C3=B6rg?= <joerg@example.org>"
    msg["Subject"] = "Seed message ✓"
    msg["Date"] = "Wed, 14 Oct 2026 10:00:00 +0200"
    msg["Message-ID"] = "<seed@example.org>"
    msg.set_content("Hello,\nplain text.\n")
    msg.add_alternative("<p>Hello <b>HTML</b> <img src='cid:pic'></p>", subtype="html")
    msg.get_payload()[1].add_related(png(), "image", "png", cid="<pic>")
    msg.add_attachment(b"attachment data", maintype="application", subtype="octet-stream", filename="a.bin")
    return bytes(msg)


VCF = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ann Example\r\nN:Example;Ann;;;\r\nEMAIL;TYPE=work:ann@example.org\r\nTEL;TYPE=cell:+43 1 234\r\nORG:Seed Ltd.\r\nEND:VCARD\r\nBEGIN:VCARD\r\nVERSION:4.0\r\nFN:Bob\r\nEMAIL:bob@example.org\r\nEND:VCARD\r\n"

NOTEBOOK = {"nbformat": 4, "nbformat_minor": 5, "metadata": {"kernelspec": {"name": "python3", "display_name": "Python 3", "language": "python"}, "language_info": {"name": "python"}},
            "cells": [
                {"cell_type": "markdown", "id": "m1", "metadata": {}, "source": ["# Seed\n", "Some *Markdown* and $x^2$."]},
                {"cell_type": "code", "id": "c1", "metadata": {"slideshow": {"slide_type": "slide"}}, "execution_count": 1, "source": ["1 + 1"],
                 "outputs": [{"output_type": "execute_result", "execution_count": 1, "metadata": {}, "data": {"text/plain": ["2"], "text/html": ["<b>2</b>"]}},
                             {"output_type": "stream", "name": "stdout", "text": ["out\n"]},
                             {"output_type": "display_data", "metadata": {}, "data": {"image/png": base64.b64encode(png()).decode(), "text/plain": ["<Figure>"]}}]},
                {"cell_type": "raw", "id": "r1", "metadata": {}, "source": ["raw"]}]}

REVEAL_MD = "# Seed deck\n\nIntro text\n\n---\n\n## Second\n\n- one\n- two\n\nNote:\nspeaker notes\n\n--\n\n### Vertical\n\n$$e^{i\\pi}+1=0$$\n"

REVEAL_HTML = ("<!doctype html><html><head><title>Seed</title></head><body><div class='reveal'><div class='slides'>"
               "<section><h1>Seed deck</h1><p>Intro</p><aside class='notes'>notes</aside></section>"
               "<section><section><h2>Vertical 1</h2></section><section data-background-color='#123456'><h2>Vertical 2</h2>"
               "<pre><code class='language-python'>print(1)</code></pre></section></section>"
               "</div></div></body></html>")

POSTMAN = {"info": {"name": "Seed collection", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"},
           "variable": [{"key": "base", "value": "https://example.org"}],
           "item": [{"name": "Folder", "item": [
               {"name": "Get thing", "request": {"method": "GET", "url": {"raw": "{{base}}/thing?x=1", "host": ["{{base}}"], "path": ["thing"], "query": [{"key": "x", "value": "1"}]},
                                                 "header": [{"key": "Accept", "value": "application/json"}]}},
               {"name": "Post thing", "request": {"method": "POST", "url": "{{base}}/thing", "body": {"mode": "raw", "raw": "{\"a\": 1}"},
                                                  "auth": {"type": "bearer", "bearer": [{"key": "token", "value": "t"}]}}}]}]}

OPENAPI = """openapi: 3.0.0
info: {title: Seed API, version: "1"}
servers: [{url: "https://example.org/{v}", variables: {v: {default: v1}}}]
paths:
  /items/{id}:
    get:
      summary: Get item
      parameters: [{name: id, in: path, required: true, schema: {type: integer}}, {name: q, in: query, schema: {type: string}}]
      responses: {"200": {description: ok, content: {application/json: {schema: {$ref: "#/components/schemas/Item"}}}}}
components:
  schemas:
    Item: {type: object, properties: {id: {type: integer}, child: {$ref: "#/components/schemas/Item"}}}
"""

HAR = {"log": {"version": "1.2", "creator": {"name": "seed", "version": "1"}, "pages": [], "entries": [
    {"startedDateTime": "2026-10-14T10:00:00.000Z", "time": 12,
     "request": {"method": "GET", "url": "https://example.org/a?b=1", "httpVersion": "HTTP/1.1", "headers": [{"name": "Accept", "value": "*/*"}],
                 "queryString": [{"name": "b", "value": "1"}], "cookies": [], "headersSize": -1, "bodySize": 0},
     "response": {"status": 200, "statusText": "OK", "httpVersion": "HTTP/1.1", "headers": [{"name": "Content-Type", "value": "text/html"}], "cookies": [],
                  "content": {"size": 13, "mimeType": "text/html", "text": "<p>Hello</p>"}, "redirectURL": "", "headersSize": -1, "bodySize": 13},
     "cache": {}, "timings": {"send": 1, "wait": 10, "receive": 1}}]}}

EXCALIDRAW = {"type": "excalidraw", "version": 2, "source": "seed", "elements": [
    {"id": "r1", "type": "rectangle", "x": 10, "y": 10, "width": 100, "height": 50, "angle": 0, "strokeColor": "#1e1e1e", "backgroundColor": "#a5d8ff",
     "fillStyle": "solid", "strokeWidth": 2, "roughness": 1, "opacity": 100, "seed": 1, "version": 1, "isDeleted": False, "boundElements": [{"type": "text", "id": "t1"}]},
    {"id": "t1", "type": "text", "x": 20, "y": 25, "width": 80, "height": 20, "angle": 0, "text": "Box", "fontSize": 16, "containerId": "r1",
     "strokeColor": "#1e1e1e", "backgroundColor": "transparent", "opacity": 100, "seed": 2, "version": 1, "isDeleted": False},
    {"id": "a1", "type": "arrow", "x": 110, "y": 35, "width": 80, "height": 0, "angle": 0, "points": [[0, 0], [80, 0]], "strokeColor": "#1e1e1e",
     "backgroundColor": "transparent", "opacity": 100, "seed": 3, "version": 1, "isDeleted": False}], "appState": {"viewBackgroundColor": "#ffffff"}, "files": {}}


def docx():
    from docx import Document
    from docx.shared import Inches
    d = Document()
    d.add_heading("Seed document", 1)
    p = d.add_paragraph("Plain, ")
    p.add_run("bold").bold = True
    p.add_run(" and italic.").italic = True
    d.add_paragraph("Item one", style="List Bullet")
    d.add_paragraph("Item two", style="List Number")
    t = d.add_table(rows=2, cols=2)
    for r in range(2):
        for c in range(2):
            t.cell(r, c).text = f"{r},{c}"
    d.add_picture(io.BytesIO(png()), width=Inches(1))
    d.add_page_break()
    d.add_paragraph("Second page")
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def xlsx():
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    wb = Workbook()
    ws = wb.active
    ws.title = "Data"
    ws.append(["Name", "Value", "Double"])
    for i in range(1, 6):
        ws.append([f"row {i}", i * 1.5, f"=B{i + 1}*2"])
    ws["A1"].font = Font(bold=True)
    ws["B1"].fill = PatternFill("solid", fgColor="FFFF00")
    ws.merge_cells("A8:C8")
    ws["A8"] = "merged"
    ws["E1"] = "=SUM(B2:B6)"
    wb.create_sheet("Second")["A1"] = "x"
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def pptx():
    from pptx import Presentation
    from pptx.util import Inches
    prs = Presentation()
    s = prs.slides.add_slide(prs.slide_layouts[0])
    s.shapes.title.text = "Seed presentation"
    s.placeholders[1].text = "Subtitle"
    s = prs.slides.add_slide(prs.slide_layouts[1])
    s.shapes.title.text = "Bullets"
    body = s.placeholders[1].text_frame
    body.text = "one"
    body.add_paragraph().text = "two"
    s.notes_slide.notes_text_frame.text = "notes"
    s = prs.slides.add_slide(prs.slide_layouts[6])
    s.shapes.add_picture(io.BytesIO(png()), Inches(1), Inches(1))
    tbl = s.shapes.add_table(2, 2, Inches(3), Inches(1), Inches(3), Inches(1)).table
    tbl.cell(0, 0).text = "a"
    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()


def kdbx(workdir):
    from pykeepass import create_database
    path = Path(workdir) / "seed.kdbx"
    kp = create_database(str(path), password="pw")
    g = kp.add_group(kp.root_group, "Web")
    e = kp.add_entry(g, "Example", "ann", "secret", url="https://example.org", notes="line\nline")
    e.set_custom_property("extra", "value")
    kp.add_entry(kp.root_group, "Root entry", "u", "p")
    kp.save()
    return path.read_bytes()


def sqlite_db(workdir):
    path = Path(workdir) / "seed.sqlite"
    path.unlink(missing_ok=True)
    con = sqlite3.connect(path)
    con.executescript("""
        CREATE TABLE people (id INTEGER PRIMARY KEY, name TEXT NOT NULL, born DATE, photo BLOB);
        INSERT INTO people (name, born, photo) VALUES ('Ann', '1990-01-01', x'89504e47'), ('Bob', NULL, NULL);
        CREATE INDEX people_name ON people(name);
        CREATE VIEW adults AS SELECT * FROM people WHERE born < '2000-01-01';
        CREATE TABLE orders (id INTEGER PRIMARY KEY, person INTEGER REFERENCES people(id), amount REAL);
        INSERT INTO orders (person, amount) VALUES (1, 9.5);
        CREATE TRIGGER t AFTER INSERT ON orders BEGIN UPDATE orders SET amount = amount WHERE id = NEW.id; END;
    """)
    con.commit()
    con.close()
    return path.read_bytes()


def archives(workdir):
    files = {"readme.txt": b"hello\n", "dir/data.bin": bytes(range(256)) * 4, "dir/sub/empty.txt": b"", "unicode-äöü.txt": "ü".encode()}
    out = [("seed.zip", zip_of(files))]
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as t:
        for name, data in files.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            t.addfile(info, io.BytesIO(data))
    out.append(("seed.tar.gz", buf.getvalue()))
    try:
        import py7zr
        path = Path(workdir) / "seed.7z"
        with py7zr.SevenZipFile(path, "w") as z:
            for name, data in files.items():
                z.writestr(data, name)
        out.append(("seed.7z", path.read_bytes()))
    except ImportError:
        pass
    import gzip
    out.append(("seed.txt.gz", gzip.compress(b"compressed text\n" * 20)))
    return out


def soffice_convert(data, name, target, workdir):
    """Convert with LibreOffice (None without it)."""
    exe = shutil.which("soffice") or shutil.which("libreoffice")
    if not exe:
        return None
    work = Path(workdir) / f"lo-{target}"
    work.mkdir(exist_ok=True)
    src = work / name
    src.write_bytes(data)
    subprocess.run([exe, f"-env:UserInstallation=file://{work}/profile", "--headless", "--convert-to", target, "--outdir", str(work), str(src)],
                   capture_output=True, timeout=180)
    out = src.with_suffix(f".{target}")
    return out.read_bytes() if out.exists() else None


def seeds(workdir):
    workdir = Path(workdir)
    workdir.mkdir(parents=True, exist_ok=True)
    d, x, p = docx(), xlsx(), pptx()
    office = {}
    for data, name, target in ((d, "seed.docx", "odt"), (x, "seed.xlsx", "ods")):
        office[target] = soffice_convert(data, name, target, workdir)
    drawio_png = png_with_text(png((120, 80)), "mxfile", __import__("urllib.parse").parse.quote(DRAWIO))
    result = {
        "texteditor": [("seed.js", b"// seed\nfunction f(a, b) {\n  return a + b; // sum\n}\nconst s = `x${f(1, 2)}`;\n"),
                       ("seed.md", "# Title\n\n* a\n* b\n\n```python\nprint('ü')\n```\n".encode())],
        "hexeditor": [("seed.bin", bytes(range(256)) * 8)],
        "archive": archives(workdir),
        "diagram": [("seed.drawio", DRAWIO.encode()), ("seed.excalidraw", json.dumps(EXCALIDRAW).encode()), ("seed.drawio.png", drawio_png),
                    ("seed.mmd", b"graph TD\n  A[Start] --> B{Choice}\n  B -->|yes| C[Done]\n  B -->|no| A\n")],
        "document": [("seed.docx", d), ("seed.md", b"# Seed\n\nText with **bold**.\n\n- a\n- b\n")] + ([("seed.odt", office["odt"])] if office["odt"] else []),
        "spreadsheet": [("seed.xlsx", x), ("seed.csv", b"a;b;c\n1;2,5;\"x;y\"\n3;4;=A2+1\n")] + ([("seed.ods", office["ods"])] if office["ods"] else []),
        "presentation": [("seed.pptx", p)],
        "reveal": [("seed.html", REVEAL_HTML.encode()), ("seed.md", REVEAL_MD.encode())],
        "notebook": [("seed.ipynb", json.dumps(NOTEBOOK).encode())],
        "pdfviewer": [("seed.pdf", minimal_pdf())],
        "calendar": [("seed.ics", ICS.encode())],
        "mail": [("seed.eml", eml()), ("seed.vcf", VCF.encode())],
        "keepass": [("seed.kdbx", kdbx(workdir))],
        "dbtool": [("seed.sqlite", sqlite_db(workdir))],
        "imageeditor": [("seed.png", image("PNG")), ("seed.jpg", image("JPEG")), ("seed.gif", image("GIF")), ("seed.bmp", image("BMP")),
                        ("seed.webp", image("WEBP")), ("seed.ico", image("ICO", (16, 16))),
                        ("seed.svg", b'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16"><rect width="10" height="8" fill="red"/></svg>'),
                        ("seed.ora", zip_of({"mimetype": b"image/openraster", "stack.xml": b'<?xml version="1.0"?><image w="24" h="16"><stack><layer name="L" src="data/l.png" x="0" y="0"/></stack></image>',
                                             "data/l.png": png((24, 16)), "mergedimage.png": png((24, 16))}))],
        "mediaplayer": [("seed.wav", wav()), ("seed.m3u8", b"#EXTM3U\n#EXTINF:1,Seed track\nseed.wav\n#EXTINF:-1,Stream\nhttps://example.org/s.mp3\n")],
        "audioeditor": [("seed.wav", wav())],
        "webinspector": [("seed.har", json.dumps(HAR).encode()),
                         ("seed.html", b"<!doctype html><html><head><title>Seed</title><meta name='description' content='d'></head><body><h1>Seed</h1><a href='https://example.org'>l</a><img src='x.png'></body></html>")],
        "http": [("seed.postman_collection.json", json.dumps(POSTMAN).encode()), ("seed.yaml", OPENAPI.encode())],
    }
    return result
