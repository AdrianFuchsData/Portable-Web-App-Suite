#!/usr/bin/env python3
"""Example files for every application of the suite, in English and German.

Writes examples/<lang>/<app>/<file> and examples/examples.json (the manifest: per app the files with their language, title
and whether build.py embeds them into the app, where Help (F1) offers them under "Examples"), and with --zip also
dist/examples.zip (all examples and a README, a file of the release). Most files are made with other software (python-docx,
openpyxl, python-pptx, pykeepass, Pillow, sqlite3, ffmpeg), so they also show that the formats are interoperable. ZIP-based
files get fixed timestamps, so that a new run only changes files whose content changed (KeePass files are encrypted with
random values and change every time).

Needs the packages of requirements.txt (the project's venv) and, for the video example, ffmpeg.

Usage:
    .venv/bin/python tools/make_examples.py [--zip]
"""
import base64
import datetime
import io
import json
import math
import pathlib
import shutil
import sqlite3
import struct
import subprocess
import sys
import tempfile
import wave
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "examples"
FIXED = (2026, 1, 1, 12, 0, 0)
EMBED_LIMIT = 300 * 1024  # bytes: larger examples are only in examples.zip
PASSWORD = "example"


def normalized_zip(data, stored=("mimetype",)):
    """The ZIP again with fixed timestamps (reproducible files)."""
    src = zipfile.ZipFile(io.BytesIO(data))
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        for info in src.infolist():
            new = zipfile.ZipInfo(info.filename, date_time=FIXED)
            new.compress_type = zipfile.ZIP_STORED if info.filename in stored else zipfile.ZIP_DEFLATED
            new.external_attr = info.external_attr
            z.writestr(new, src.read(info))
    return out.getvalue()


def T(lang, en, de):
    return en if lang == "en" else de


# ---- generators: each returns [(file name, bytes, title, embed)] -------------------------------------------------------

def texteditor(lang):
    py = T(lang, '''"""A small Python program: syntax highlighting, folding (the arrows in the margin) and code completion (Ctrl+Space)."""
from dataclasses import dataclass


@dataclass
class Item:
    name: str
    price: float
    count: int = 1

    def total(self) -> float:
        return self.price * self.count


def report(items):
    # Tab indents, Shift+Tab unindents; Ctrl+Alt+I inserts a tab character
    for item in sorted(items, key=lambda i: i.total(), reverse=True):
        print(f"{item.name:<10} {item.total():8.2f}")


if __name__ == "__main__":
    report([Item("Apples", 0.4, 12), Item("Bread", 2.9), Item("Coffee", 7.5, 2)])
''', '''"""Ein kleines Python-Programm: Syntaxhervorhebung, Einklappen (die Pfeile am Rand) und Code-Vervollständigung (Strg+Leertaste)."""
from dataclasses import dataclass


@dataclass
class Artikel:
    name: str
    preis: float
    anzahl: int = 1

    def summe(self) -> float:
        return self.preis * self.anzahl


def bericht(artikel):
    # Tab rückt ein, Umschalt+Tab rückt aus; Strg+Alt+I fügt ein Tabulatorzeichen ein
    for a in sorted(artikel, key=lambda a: a.summe(), reverse=True):
        print(f"{a.name:<10} {a.summe():8.2f}")


if __name__ == "__main__":
    bericht([Artikel("Äpfel", 0.4, 12), Artikel("Brot", 2.9), Artikel("Kaffee", 7.5, 2)])
''')
    sql = T(lang, "-- Tools → Format SQL turns this into readable SQL\nselect c.name, count(o.id) as orders, sum(o.total) as revenue from customers c left join orders o on o.customer_id = c.id where o.created >= '2026-01-01' group by c.name having count(o.id) > 2 order by revenue desc;\n",
                "-- Werkzeuge → SQL formatieren macht daraus lesbares SQL\nselect k.name, count(b.id) as bestellungen, sum(b.summe) as umsatz from kunden k left join bestellungen b on b.kunde_id = k.id where b.datum >= '2026-01-01' group by k.name having count(b.id) > 2 order by umsatz desc;\n")
    md = T(lang, "# Notes\n\nThe text editor highlights **Markdown** and shows a preview.\n\n- Find and replace: `Ctrl+F`\n- Find in all open files: `Ctrl+Shift+F`\n- Compare two documents: *Compare…*\n\n| Colour | Value |\n|---|---|\n| Teal | #008080 |\n| Orange | #ff8c00 |\n",
               "# Notizen\n\nDer Texteditor hebt **Markdown** hervor und zeigt eine Vorschau.\n\n- Suchen und Ersetzen: `Strg+F`\n- In allen offenen Dateien suchen: `Strg+Umschalt+F`\n- Zwei Dokumente vergleichen: *Vergleichen…*\n\n| Farbe | Wert |\n|---|---|\n| Petrol | #008080 |\n| Orange | #ff8c00 |\n")
    data = {"name": T(lang, "Example", "Beispiel"), "version": 2, "tags": ["json", "tree", T(lang, "format", "formatieren")], "nested": {"ok": True, "values": [1, 2.5, None]}}
    return [(T(lang, "program.py", "programm.py"), py.encode(), T(lang, "Python program", "Python-Programm"), True),
            ("query.sql" if lang == "en" else "abfrage.sql", sql.encode(), T(lang, "SQL to format", "SQL zum Formatieren"), True),
            (T(lang, "notes.md", "notizen.md"), md.encode(), T(lang, "Markdown with a table", "Markdown mit Tabelle"), True),
            ("data.json" if lang == "en" else "daten.json", json.dumps(data).encode(), T(lang, "JSON on one line (Tools → Format JSON)", "JSON in einer Zeile (Werkzeuge → JSON formatieren)"), True)]


def png_image(lang, size=(320, 200)):
    from PIL import Image, ImageDraw
    img = Image.new("RGBA", size, (255, 255, 255, 0))
    d = ImageDraw.Draw(img)
    for i in range(size[0]):
        d.line([(i, 0), (i, size[1])], fill=(0, 128 - i // 4, 128 + i // 3, 255))
    d.ellipse([20, 20, 140, 140], fill=(255, 140, 0, 230))
    d.rectangle([170, 60, 300, 180], fill=(255, 255, 255, 180), outline=(0, 0, 0, 255), width=3)
    d.text((182, 110), T(lang, "Example", "Beispiel"), fill=(0, 0, 0, 255))
    out = io.BytesIO()
    img.save(out, "PNG")
    return out.getvalue()


def hexeditor(lang):
    return [(T(lang, "image.png", "bild.png"), png_image(lang, (64, 40)), T(lang, "A small PNG image (signature, chunks)", "Ein kleines PNG-Bild (Signatur, Chunks)"), True)]


def archive(lang):
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(zipfile.ZipInfo(T(lang, "readme.txt", "liesmich.txt"), FIXED), T(lang, "An archive with folders. Open files with a double click or “Open with…”.\n", "Ein Archiv mit Ordnern. Dateien öffnen sich mit Doppelklick oder „Öffnen mit…“.\n"))
        z.writestr(zipfile.ZipInfo(T(lang, "data/prices.csv", "daten/preise.csv"), FIXED), T(lang, "item,price\napples,0.40\nbread,2.90\n", "Artikel;Preis\nÄpfel;0,40\nBrot;2,90\n"))
        z.writestr(zipfile.ZipInfo(T(lang, "images/logo.png", "bilder/logo.png"), FIXED), png_image(lang, (48, 30)))
        z.writestr(zipfile.ZipInfo(T(lang, "docs/notes.md", "dokumente/notizen.md"), FIXED), T(lang, "# Notes\n\nTry *Test* and *Extract all*.\n", "# Notizen\n\nProbieren Sie *Testen* und *Alles entpacken*.\n"))
    encrypted = None
    try:  # (pyzipper writes AES; without it only the plain archive)
        import pyzipper
        buf = io.BytesIO()
        with pyzipper.AESZipFile(buf, "w", compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES) as z:
            z.setpassword(PASSWORD.encode())
            z.writestr(T(lang, "secret.txt", "geheim.txt"), T(lang, "Opened with the password “example”.\n", "Mit dem Passwort „example“ geöffnet.\n"))
        encrypted = buf.getvalue()
    except ImportError:
        pass
    files = [(T(lang, "folders.zip", "ordner.zip"), out.getvalue(), T(lang, "ZIP archive with folders", "ZIP-Archiv mit Ordnern"), True)]
    tgz = io.BytesIO()
    import tarfile
    with tarfile.open(fileobj=tgz, mode="w:xz") as t:
        data = T(lang, "Inside a TAR.XZ archive.\n", "In einem TAR.XZ-Archiv.\n").encode()
        info = tarfile.TarInfo(T(lang, "folder/inside.txt", "ordner/darin.txt"))
        info.size, info.mtime = len(data), datetime.datetime(*FIXED).timestamp()
        t.addfile(info, io.BytesIO(data))
    files.append((T(lang, "packed.tar.xz", "gepackt.tar.xz"), tgz.getvalue(), "TAR.XZ", True))
    if encrypted:
        files.append((T(lang, "encrypted.zip", "verschluesselt.zip"), encrypted, T(lang, "AES-encrypted ZIP (password: example)", "AES-verschlüsseltes ZIP (Passwort: example)"), True))
    return files


def tone_wav(seconds=2.0, rate=16000, freqs=(440, 554, 659)):
    frames = bytearray()
    n = int(seconds * rate)
    for i in range(n):
        t = i / rate
        f = freqs[min(len(freqs) - 1, int(t / seconds * len(freqs)))]
        env = min(1, i / 800, (n - i) / 800)
        frames += struct.pack("<h", int(12000 * env * math.sin(2 * math.pi * f * t)))
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(bytes(frames))
    return out.getvalue()


def mediaplayer(lang):
    a, b = T(lang, "chord.wav", "akkord.wav"), T(lang, "scale.wav", "tonleiter.wav")
    playlist = f"#EXTM3U\n#EXTINF:2,{T(lang, 'Chord', 'Akkord')}\n{a}\n#EXTINF:3,{T(lang, 'Scale', 'Tonleiter')}\n{b}\n"
    return [(a, tone_wav(2.0), T(lang, "Sound: a chord in three steps", "Klang: ein Akkord in drei Schritten"), True),
            (b, tone_wav(3.0, freqs=(262, 294, 330, 349, 392, 440, 494, 523)), T(lang, "Sound: a scale", "Klang: eine Tonleiter"), True),
            (T(lang, "playlist.m3u8", "wiedergabeliste.m3u8"), playlist.encode(), T(lang, "Playlist (open the sounds together with it)", "Wiedergabeliste (die Klänge mit öffnen)"), False)]


def audioeditor(lang):
    return [(T(lang, "scale.wav", "tonleiter.wav"), tone_wav(3.0, freqs=(262, 294, 330, 349, 392, 440, 494, 523)), T(lang, "A scale to cut and add effects to", "Eine Tonleiter zum Schneiden und für Effekte"), True)]


def videoeditor(lang):
    if not shutil.which("ffmpeg"):
        return []
    with tempfile.TemporaryDirectory() as d:
        out = pathlib.Path(d) / "clip.webm"
        subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc=duration=4:size=320x180:rate=15", "-f", "lavfi", "-i", "sine=frequency=440:duration=4",
                        "-c:v", "libvpx", "-b:v", "200k", "-c:a", "libopus", "-shortest", "-y", str(out)], check=True)
        data = out.read_bytes()
    return [(T(lang, "test-pattern.webm", "testbild.webm"), data, T(lang, "A 4-second clip with sound", "Ein Clip von 4 Sekunden mit Ton"), len(data) < EMBED_LIMIT)]


def imageeditor(lang):
    from PIL import Image
    png = png_image(lang)
    # OpenRaster: two layers
    base = Image.new("RGBA", (320, 200), (240, 248, 255, 255))
    top = Image.open(io.BytesIO(png))
    layers = []
    for img in (base, top):
        b = io.BytesIO()
        img.save(b, "PNG")
        layers.append(b.getvalue())
    stack = (f'<?xml version="1.0" encoding="UTF-8"?><image version="0.0.3" w="320" h="200"><stack>'
             f'<layer name="{T(lang, "Drawing", "Zeichnung")}" src="data/top.png" opacity="1.0" visibility="visible"/>'
             f'<layer name="{T(lang, "Background", "Hintergrund")}" src="data/base.png" opacity="1.0" visibility="visible"/></stack></image>')
    ora = io.BytesIO()
    with zipfile.ZipFile(ora, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype", FIXED), "image/openraster", compress_type=zipfile.ZIP_STORED)
        z.writestr(zipfile.ZipInfo("stack.xml", FIXED), stack, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr(zipfile.ZipInfo("data/top.png", FIXED), layers[1], compress_type=zipfile.ZIP_DEFLATED)
        z.writestr(zipfile.ZipInfo("data/base.png", FIXED), layers[0], compress_type=zipfile.ZIP_DEFLATED)
    return [(T(lang, "picture.png", "bild.png"), png, T(lang, "PNG with transparency", "PNG mit Transparenz"), True),
            (T(lang, "layers.ora", "ebenen.ora"), ora.getvalue(), T(lang, "Image with two layers (OpenRaster)", "Bild mit zwei Ebenen (OpenRaster)"), True)]


def diagram(lang):
    l = lambda en, de: T(lang, en, de)
    xml = f'''<mxfile host="Portable Web App Suite"><diagram id="example" name="{l("Process", "Ablauf")}"><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="2" value="{l("Notes", "Notizen")}" style="locked=0;" parent="0"/>
<mxCell id="g1" value="{l("Office", "Büro")}" style="group;" vertex="1" connectable="0" parent="1"><mxGeometry x="20" y="20" width="420" height="120" as="geometry"/></mxCell>
<mxCell id="a" value="{l("Order arrives", "Bestellung kommt")}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="g1"><mxGeometry x="10" y="30" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="b" value="{l("In stock?", "Auf Lager?")}" style="rhombus;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="g1"><mxGeometry x="180" y="20" width="100" height="80" as="geometry"/></mxCell>
<mxCell id="c" value="{l("Ship", "Versenden")}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1"><mxGeometry x="500" y="50" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="d" value="{l("Reorder", "Nachbestellen")}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;rotation=-5;" vertex="1" parent="1"><mxGeometry x="210" y="220" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="e1" style="edgeStyle=orthogonalEdgeStyle;html=1;" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>
<mxCell id="e2" value="{l("yes", "ja")}" style="edgeStyle=orthogonalEdgeStyle;html=1;" edge="1" parent="1" source="b" target="c"><mxGeometry relative="1" as="geometry"/></mxCell>
<mxCell id="e3" value="{l("no", "nein")}" style="edgeStyle=orthogonalEdgeStyle;html=1;" edge="1" parent="1" source="b" target="d"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="250" y="180"/></Array></mxGeometry></mxCell>
<mxCell id="n" value="{l("Layers, groups, rotation and routing points", "Ebenen, Gruppen, Drehung und Wegpunkte")}" style="text;html=1;" vertex="1" parent="2"><mxGeometry x="400" y="230" width="260" height="30" as="geometry"/></mxCell>
</root></mxGraphModel></diagram></mxfile>'''
    excalidraw = {"type": "excalidraw", "version": 2, "source": "portable-web-app-suite", "elements": [
        {"id": "r1", "type": "rectangle", "x": 40, "y": 40, "width": 160, "height": 80, "angle": 0, "strokeColor": "#1e1e1e", "backgroundColor": "#a5d8ff", "fillStyle": "hachure", "strokeWidth": 2, "roughness": 1, "opacity": 100, "seed": 1, "version": 1, "versionNonce": 1, "isDeleted": False, "groupIds": [], "boundElements": None, "updated": 1, "link": None, "locked": False},
        {"id": "t1", "type": "text", "x": 60, "y": 70, "width": 120, "height": 25, "angle": 0, "strokeColor": "#1e1e1e", "backgroundColor": "transparent", "fillStyle": "solid", "strokeWidth": 1, "roughness": 1, "opacity": 100, "seed": 2, "version": 1, "versionNonce": 2, "isDeleted": False, "groupIds": [], "boundElements": None, "updated": 1, "link": None, "locked": False, "text": T(lang, "Sketch", "Skizze"), "fontSize": 20, "fontFamily": 1, "textAlign": "center", "verticalAlign": "middle", "originalText": T(lang, "Sketch", "Skizze"), "lineHeight": 1.25, "containerId": None}],
        "appState": {"viewBackgroundColor": "#ffffff"}, "files": {}}
    return [(T(lang, "process.drawio", "ablauf.drawio"), xml.encode(), T(lang, "Process with groups, layers and connectors (draw.io)", "Ablauf mit Gruppen, Ebenen und Verbindern (draw.io)"), True),
            (T(lang, "sketch.excalidraw", "skizze.excalidraw"), json.dumps(excalidraw).encode(), T(lang, "Hand-drawn sketch (Excalidraw)", "Handskizze (Excalidraw)"), True)]


def keepass(lang):
    from pykeepass import create_database
    with tempfile.TemporaryDirectory() as d:
        path = pathlib.Path(d) / "example.kdbx"
        kp = create_database(str(path), password=PASSWORD)
        web = kp.add_group(kp.root_group, T(lang, "Web", "Web"))
        mail = kp.add_group(kp.root_group, T(lang, "Mail", "E-Mail"))
        e = kp.add_entry(web, T(lang, "Example shop", "Beispiel-Shop"), "anna", "correct horse battery staple", url="https://shop.example.org",
                         notes=T(lang, "A note with the entry.", "Eine Notiz zum Eintrag."))
        e.otp = "otpauth://totp/Example:anna?secret=JBSWY3DPEHPK3PXP&issuer=Example"
        kp.add_entry(mail, T(lang, "Mail account", "Mailkonto"), "anna@example.org", "M41l-P4ssw0rd!", url="imaps://mail.example.org")
        kp.save()
        data = path.read_bytes()
    return [(T(lang, "passwords.kdbx", "passwoerter.kdbx"), data, T(lang, "KeePass database (password: example; with a TOTP code)", "KeePass-Datenbank (Passwort: example; mit TOTP-Code)"), True)]


def spreadsheet(lang):
    from openpyxl import Workbook
    from openpyxl.chart import BarChart, Reference
    from openpyxl.formatting.rule import CellIsRule, ColorScaleRule
    from openpyxl.styles import Font, PatternFill
    from openpyxl.worksheet.datavalidation import DataValidation
    wb = Workbook()
    ws = wb.active
    ws.title = T(lang, "Sales", "Umsatz")
    head = [T(lang, "Region", "Region"), T(lang, "Product", "Produkt"), T(lang, "Units", "Stück"), T(lang, "Price", "Preis"), T(lang, "Revenue", "Umsatz"), T(lang, "Status", "Status")]
    ws.append(head)
    rows = [("North", "Tea", 120, 3.5), ("South", "Coffee", 80, 7.2), ("North", "Coffee", 45, 7.2), ("West", "Tea", 200, 3.5), ("South", "Cocoa", 30, 4.9), ("West", "Coffee", 95, 7.2)]
    names = {"North": T(lang, "North", "Nord"), "South": T(lang, "South", "Süd"), "West": T(lang, "West", "West"), "Tea": T(lang, "Tea", "Tee"), "Coffee": T(lang, "Coffee", "Kaffee"), "Cocoa": T(lang, "Cocoa", "Kakao")}
    for i, (r, p, u, pr) in enumerate(rows, start=2):
        ws.append([names[r], names[p], u, pr, f"=C{i}*D{i}", T(lang, "open", "offen")])
    n = len(rows) + 1
    ws.append([T(lang, "Total", "Summe"), None, f"=SUM(C2:C{n})", None, f"=SUM(E2:E{n})"])
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="2F5597")
    ws.freeze_panes = "A2"
    for col, w in zip("ABCDEF", (12, 12, 8, 8, 10, 10)):
        ws.column_dimensions[col].width = w
    ws.conditional_formatting.add(f"C2:C{n}", ColorScaleRule(start_type="min", start_color="FFF8696B", end_type="max", end_color="FF63BE7B"))
    ws.conditional_formatting.add(f"E2:E{n}", CellIsRule(operator="greaterThan", formula=["500"], font=Font(bold=True), fill=PatternFill(bgColor="FFC6EFCE", fill_type="solid")))
    dv = DataValidation(type="list", formula1='"' + ",".join([T(lang, "open", "offen"), T(lang, "done", "erledigt")]) + '"', allow_blank=True)
    ws.add_data_validation(dv)
    dv.add(f"F2:F{n}")
    ws.auto_filter.ref = f"A1:F{n}"
    chart = BarChart()
    chart.title = T(lang, "Revenue per row", "Umsatz je Zeile")
    chart.add_data(Reference(ws, min_col=5, min_row=1, max_row=n), titles_from_data=True)
    ws.add_chart(chart, "H2")
    out = io.BytesIO()
    wb.save(out)
    csv = T(lang, "date,amount,note\n2026-01-05,12.50,lunch\n2026-01-06,3.20,coffee\n", "Datum;Betrag;Notiz\n05.01.2026;12,50;Mittagessen\n06.01.2026;3,20;Kaffee\n")
    return [(T(lang, "sales.xlsx", "umsatz.xlsx"), normalized_zip(out.getvalue()), T(lang, "Formulas, filter, conditional formatting, validation", "Formeln, Filter, bedingte Formatierung, Überprüfung"), True),
            (T(lang, "expenses.csv", "ausgaben.csv"), csv.encode(), T(lang, "CSV (the import dialog detects the format)", "CSV (der Importdialog erkennt das Format)"), True)]


def document(lang):
    import docx
    from docx.shared import Pt
    d = docx.Document()
    d.core_properties.created = d.core_properties.modified = datetime.datetime(*FIXED)
    d.add_heading(T(lang, "Example report", "Beispielbericht"), 0)
    d.add_heading(T(lang, "Introduction", "Einleitung"), 1)
    p = d.add_paragraph(T(lang, "This document shows ", "Dieses Dokument zeigt "))
    p.add_run(T(lang, "bold", "fett")).bold = True
    p.add_run(", ")
    p.add_run(T(lang, "italic", "kursiv")).italic = True
    p.add_run(T(lang, " and headings for the table of contents (Insert → Table of contents).", " und Überschriften für das Inhaltsverzeichnis (Einfügen → Inhaltsverzeichnis)."))
    d.add_heading(T(lang, "Figures", "Zahlen"), 1)
    table = d.add_table(rows=1, cols=3)
    table.style = "Light Grid Accent 1"
    for c, text in zip(table.rows[0].cells, (T(lang, "Quarter", "Quartal"), T(lang, "Revenue", "Umsatz"), T(lang, "Change", "Änderung"))):
        c.text = text
    for q, r, ch in (("Q1", "12,400", "+4 %"), ("Q2", "13,100", "+6 %"), ("Q3", "12,900", "−2 %")):
        row = table.add_row().cells
        row[0].text, row[1].text, row[2].text = q, r, ch
    d.add_heading(T(lang, "A picture", "Ein Bild"), 1)
    d.add_picture(io.BytesIO(png_image(lang)), width=docx.shared.Cm(8))
    d.add_paragraph(T(lang, "Lists:", "Listen:"))
    for item in (T(lang, "first point", "erster Punkt"), T(lang, "second point", "zweiter Punkt")):
        d.add_paragraph(item, style="List Bullet")
    out = io.BytesIO()
    d.save(out)
    return [(T(lang, "report.docx", "bericht.docx"), normalized_zip(out.getvalue()), T(lang, "Headings, table, picture, lists (Word)", "Überschriften, Tabelle, Bild, Listen (Word)"), True)]


def presentation(lang):
    from pptx import Presentation
    from pptx.util import Inches
    prs = Presentation()
    s = prs.slides.add_slide(prs.slide_layouts[0])
    s.shapes.title.text = T(lang, "Example presentation", "Beispielpräsentation")
    s.placeholders[1].text = T(lang, "Made with python-pptx", "Mit python-pptx erstellt")
    s = prs.slides.add_slide(prs.slide_layouts[1])
    s.shapes.title.text = T(lang, "Agenda", "Agenda")
    body = s.placeholders[1].text_frame
    body.text = T(lang, "Text, pictures and speaker notes", "Text, Bilder und Sprechernotizen")
    body.add_paragraph().text = T(lang, "Presenter view: P", "Referentenansicht: P")
    s.notes_slide.notes_text_frame.text = T(lang, "These are the speaker notes.", "Das sind die Sprechernotizen.")
    s = prs.slides.add_slide(prs.slide_layouts[5])
    s.shapes.title.text = T(lang, "A picture", "Ein Bild")
    s.shapes.add_picture(io.BytesIO(png_image(lang)), Inches(2), Inches(2), width=Inches(5))
    out = io.BytesIO()
    prs.save(out)
    return [(T(lang, "slides.pptx", "folien.pptx"), normalized_zip(out.getvalue()), T(lang, "Three slides with notes and a picture (PowerPoint)", "Drei Folien mit Notizen und Bild (PowerPoint)"), True)]


def reveal(lang):
    md = T(lang, """# Web slides

Markdown becomes reveal.js slides

---

## Fragments

- appear
- one
- after the other

---

## Code and maths

```python
def area(r):
    return 3.14159 * r ** 2
```

$$ A = \\pi r^2 $$

Note: speaker notes start with "Note:"

---

## Vertical slides

Press ↓

--

### Below

Back with ↑
""", """# Web-Folien

Aus Markdown werden reveal.js-Folien

---

## Fragmente

- erscheinen
- eines
- nach dem anderen

---

## Code und Mathematik

```python
def flaeche(r):
    return 3.14159 * r ** 2
```

$$ A = \\pi r^2 $$

Note: Sprechernotizen beginnen mit „Note:“

---

## Vertikale Folien

Drücken Sie ↓

--

### Darunter

Zurück mit ↑
""")
    return [(T(lang, "slides.md", "folien.md"), md.encode(), T(lang, "Markdown slides with fragments, code and maths", "Markdown-Folien mit Fragmenten, Code und Mathematik"), True)]


def pdfviewer(lang, workdir):
    docx_name, data, _, _ = document(lang)[0]
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        return []
    src = pathlib.Path(workdir) / f"{lang}-{docx_name}"
    src.write_bytes(data)
    subprocess.run([soffice, f"-env:UserInstallation=file://{workdir}/lo", "--headless", "--convert-to", "pdf", "--outdir", str(workdir), str(src)], capture_output=True, timeout=180)
    pdf = src.with_suffix(".pdf")
    if not pdf.exists():
        return []
    return [(T(lang, "report.pdf", "bericht.pdf"), pdf.read_bytes(), T(lang, "The example report as PDF (search, outline, print)", "Der Beispielbericht als PDF (Suche, Gliederung, Drucken)"), True)]


def calendar(lang):
    ev = lambda uid, start, end, summary, extra="": f"BEGIN:VEVENT\r\nUID:{uid}@example.org\r\nDTSTAMP:20260101T120000Z\r\nDTSTART:{start}\r\nDTEND:{end}\r\nSUMMARY:{summary}\r\n{extra}END:VEVENT\r\n"
    ics = ("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Portable Web App Suite//Examples//EN\r\n"
           + ev(1, "20260302T090000", "20260302T093000", T(lang, "Team meeting", "Teambesprechung"), "RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=10\r\nLOCATION:" + T(lang, "Room 1", "Raum 1") + "\r\n")
           + ev(2, "20260305T120000", "20260305T130000", T(lang, "Lunch with Bernd", "Mittagessen mit Bernd"), "DESCRIPTION:" + T(lang, "A description", "Eine Beschreibung") + "\r\n")
           + "BEGIN:VEVENT\r\nUID:3@example.org\r\nDTSTAMP:20260101T120000Z\r\nDTSTART;VALUE=DATE:20260310\r\nDTEND;VALUE=DATE:20260313\r\nSUMMARY:" + T(lang, "Conference", "Konferenz") + "\r\nEND:VEVENT\r\n"
           + "END:VCALENDAR\r\n")
    return [(T(lang, "events.ics", "termine.ics"), ics.encode(), T(lang, "Events: weekly series, all-day event", "Termine: wöchentliche Serie, ganztägiger Termin"), True)]


def mail(lang):
    import email.message
    import email.policy
    msg = email.message.EmailMessage(policy=email.policy.SMTP)
    msg["From"] = "Bernd Beispiel <bernd@example.org>"
    msg["To"] = "Anna Muster <anna@example.org>"
    msg["Subject"] = T(lang, "Example message with an attachment", "Beispielnachricht mit Anhang")
    msg["Date"] = "Thu, 01 Jan 2026 12:00:00 +0100"
    msg["Message-ID"] = "<example-1@example.org>"
    msg.set_content(T(lang, "Hello Anna,\n\nhere is the picture.\n\nBernd\n", "Hallo Anna,\n\nhier ist das Bild.\n\nBernd\n"))
    msg.add_alternative(T(lang, "<p>Hello Anna,</p><p>here is the <b>picture</b>.</p><p>Bernd</p>", "<p>Hallo Anna,</p><p>hier ist das <b>Bild</b>.</p><p>Bernd</p>"), subtype="html")
    msg.add_attachment(png_image(lang, (80, 50)), maintype="image", subtype="png", filename=T(lang, "picture.png", "bild.png"))
    vcf = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Bernd Beispiel\r\nN:Beispiel;Bernd;;;\r\nEMAIL;TYPE=work:bernd@example.org\r\nTEL;TYPE=cell:+43 660 1234567\r\nORG:Example Ltd.\r\nEND:VCARD\r\n"
    return [(T(lang, "message.eml", "nachricht.eml"), msg.as_bytes(), T(lang, "E-mail with HTML and an attachment", "E-Mail mit HTML und Anhang"), True),
            (T(lang, "contact.vcf", "kontakt.vcf"), vcf.encode(), T(lang, "Contact (vCard)", "Kontakt (vCard)"), True)]


def dbtool(lang):
    with tempfile.TemporaryDirectory() as d:
        path = pathlib.Path(d) / "db.sqlite"
        con = sqlite3.connect(path)
        cust, orders = T(lang, "customers", "kunden"), T(lang, "orders", "bestellungen")
        con.executescript(f"""
            CREATE TABLE {cust} (id INTEGER PRIMARY KEY, name TEXT NOT NULL, city TEXT);
            CREATE TABLE {orders} (id INTEGER PRIMARY KEY, {cust[:-1]}_id INTEGER REFERENCES {cust}(id), total REAL, created TEXT);
            CREATE VIEW revenue AS SELECT c.name, SUM(o.total) AS total FROM {cust} c JOIN {orders} o ON o.{cust[:-1]}_id = c.id GROUP BY c.name;
        """)
        con.executemany(f"INSERT INTO {cust} VALUES (?, ?, ?)", [(1, "Anna", "Wien"), (2, "Bernd", "Graz"), (3, "Clara", "Linz")])
        con.executemany(f"INSERT INTO {orders} VALUES (?, ?, ?, ?)", [(1, 1, 19.9, "2026-01-03"), (2, 1, 5.5, "2026-01-07"), (3, 2, 120.0, "2026-01-08"), (4, 3, 42.0, "2026-01-09")])
        con.commit()
        con.close()
        data = path.read_bytes()
    return [(T(lang, "shop.sqlite", "laden.sqlite"), data, T(lang, "SQLite database with a foreign key and a view (ER diagram)", "SQLite-Datenbank mit Fremdschlüssel und Sicht (ER-Diagramm)"), True)]


def http(lang):
    coll = {"info": {"name": T(lang, "Example requests", "Beispielanfragen"), "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"},
            "variable": [{"key": "base", "value": "https://httpbin.org"}],
            "item": [
                {"name": T(lang, "Get with a query", "Get mit Abfrage"), "request": {"method": "GET", "url": "{{base}}/get?lang=" + lang, "header": [{"key": "Accept", "value": "application/json"}]},
                 "event": [{"listen": "test", "script": {"exec": ["pm.test('status 200', () => pm.response.to.have.status(200));"]}}]},
                {"name": T(lang, "Post JSON", "JSON senden"), "request": {"method": "POST", "url": "{{base}}/post", "header": [{"key": "Content-Type", "value": "application/json"}],
                                                                             "body": {"mode": "raw", "raw": json.dumps({"name": T(lang, "Example", "Beispiel")})}}},
                {"name": T(lang, "Basic authentication", "Basic-Anmeldung"), "request": {"method": "GET", "url": "{{base}}/basic-auth/anna/secret", "auth": {"type": "basic", "basic": [{"key": "username", "value": "anna"}, {"key": "password", "value": "secret"}]}}},
            ]}
    return [(T(lang, "requests.postman_collection.json", "anfragen.postman_collection.json"), json.dumps(coll, indent=2).encode(), T(lang, "Postman collection against httpbin.org (needs the relay)", "Postman-Sammlung für httpbin.org (braucht das Relay)"), True)]


def webinspector(lang):
    har = {"log": {"version": "1.2", "creator": {"name": "Portable Web App Suite", "version": "1"}, "entries": [
        {"startedDateTime": "2026-01-01T12:00:00.000Z", "time": 85, "request": {"method": "GET", "url": "https://example.org/", "httpVersion": "HTTP/1.1", "headers": [{"name": "Accept", "value": "text/html"}], "queryString": [], "cookies": [], "headersSize": -1, "bodySize": 0},
         "response": {"status": 200, "statusText": "OK", "httpVersion": "HTTP/1.1", "headers": [{"name": "Content-Type", "value": "text/html"}], "cookies": [], "content": {"size": 52, "mimeType": "text/html", "text": "<!doctype html><title>Example</title><h1>Example</h1>"}, "redirectURL": "", "headersSize": -1, "bodySize": 52},
         "cache": {}, "timings": {"send": 1, "wait": 70, "receive": 14}},
        {"startedDateTime": "2026-01-01T12:00:00.200Z", "time": 40, "request": {"method": "GET", "url": "https://example.org/style.css", "httpVersion": "HTTP/1.1", "headers": [], "queryString": [], "cookies": [], "headersSize": -1, "bodySize": 0},
         "response": {"status": 404, "statusText": "Not Found", "httpVersion": "HTTP/1.1", "headers": [], "cookies": [], "content": {"size": 0, "mimeType": "text/plain"}, "redirectURL": "", "headersSize": -1, "bodySize": 0},
         "cache": {}, "timings": {"send": 1, "wait": 35, "receive": 4}}]}}
    return [(T(lang, "recording.har", "aufzeichnung.har"), json.dumps(har, indent=1).encode(), T(lang, "Network recording (HAR) with an error", "Netzwerkaufzeichnung (HAR) mit einem Fehler"), True)]


def ean13_png(lang, digits="400638133393"):
    """An EAN-13 barcode image (drawn here, no barcode library needed)."""
    from PIL import Image, ImageDraw
    L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"]
    G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"]
    R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"]
    PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"]
    check = (10 - sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(digits)) % 10) % 10
    code = digits + str(check)
    bits = "101" + "".join((L if p == "L" else G)[int(d)] for d, p in zip(code[1:7], PARITY[int(code[0])])) + "01010" + "".join(R[int(d)] for d in code[7:]) + "101"
    scale, quiet = 3, 11
    img = Image.new("L", ((len(bits) + 2 * quiet) * scale, 90), 255)
    draw = ImageDraw.Draw(img)
    for i, b in enumerate(bits):
        if b == "1":
            draw.rectangle([(quiet + i) * scale, 5, (quiet + i + 1) * scale - 1, 80], fill=0)
    out = io.BytesIO()
    img.save(out, "PNG")
    return out.getvalue(), code


def barcode(lang):
    png, code = ean13_png(lang)
    return [(T(lang, "ean13.png", "ean13.png"), png, T(lang, f"EAN-13 barcode ({code}) to read", f"EAN-13-Strichcode ({code}) zum Lesen"), True)]


# ---- notebooks -------------------------------------------------------------------------------------------------------------

def nb(cells):
    out = []
    for kind, source in cells:
        cell = {"cell_type": kind, "metadata": {}, "source": source.strip("\n")}
        if kind == "code":
            cell.update(outputs=[], execution_count=None)
        out.append(cell)
    return json.dumps({"cells": out, "metadata": {"kernelspec": {"name": "python3", "display_name": "Python 3", "language": "python"},
                                                  "language_info": {"name": "python"}}, "nbformat": 4, "nbformat_minor": 5}, indent=1, ensure_ascii=False).encode()


def notebook(lang):
    l = lambda en, de: T(lang, en, de)
    analysis = nb([
        ("markdown", l("# Data analysis\n\nRuns **offline** – in the suite (opened as a file) and in any Jupyter installation with pandas, matplotlib, seaborn, SciPy and scikit-learn.",
                       "# Datenanalyse\n\nLäuft **offline** – in der Suite (als Datei geöffnet) und in jeder Jupyter-Installation mit pandas, matplotlib, seaborn, SciPy und scikit-learn.")),
        ("code", "import numpy as np\nimport pandas as pd\n\nrng = np.random.default_rng(42)\ndf = pd.DataFrame({\n    'region': rng.choice(['" + l("North', 'South', 'West", "Nord', 'Süd', 'West") + "'], 200),\n    'units': rng.integers(1, 50, 200),\n})\ndf['price'] = rng.normal(10, 2, 200).round(2)\ndf['revenue'] = df.units * df.price\ndf.head()"),
        ("code", "df.groupby('region')[['units', 'revenue']].agg(['sum', 'mean']).round(1)"),
        ("markdown", l("## Plots", "## Diagramme")),
        ("code", "import matplotlib.pyplot as plt\nimport seaborn as sns\n\nfig, axes = plt.subplots(1, 2, figsize=(10, 3.5))\nsns.histplot(df.revenue, kde=True, ax=axes[0])\nsns.boxplot(data=df, x='region', y='revenue', ax=axes[1])\nplt.tight_layout()"),
        ("markdown", l("## Statistics and a model", "## Statistik und ein Modell")),
        ("code", "from scipy import stats\n\nnorth, south = (df[df.region == r].revenue for r in df.region.unique()[:2])\nt, p = stats.ttest_ind(north, south)\nprint(f't = {t:.2f}, p = {p:.3f}')"),
        ("code", "from sklearn.linear_model import LinearRegression\nfrom sklearn.model_selection import train_test_split\n\nX, y = df[['units', 'price']], df.revenue\nX_train, X_test, y_train, y_test = train_test_split(X, y, random_state=0)\nmodel = LinearRegression().fit(X_train, y_train)\nprint('R² =', round(model.score(X_test, y_test), 3))"),
    ])
    widgets = nb([
        ("markdown", l("# Interactive widgets\n\nMove the sliders – the plot follows.", "# Interaktive Widgets\n\nBewegen Sie die Schieberegler – das Diagramm folgt.")),
        ("code", "import numpy as np\nimport matplotlib.pyplot as plt\nfrom ipywidgets import interact\n\n@interact(frequency=(1, 10), amplitude=(0.1, 2.0))\ndef wave(frequency=3, amplitude=1.0):\n    x = np.linspace(0, 2 * np.pi, 400)\n    plt.plot(x, amplitude * np.sin(frequency * x))\n    plt.ylim(-2, 2)\n    plt.show()"),
    ])
    archives = nb([
        ("markdown", l("# Files in an archive\n\nOpen **example-data.zip** (from examples.zip) in the archive manager first. In the suite the archive is mounted below `/mnt`; in a regular Jupyter installation it is unpacked next to the notebook. After every cell, changes go back into the archive (save it in the archive manager).",
                       "# Dateien in einem Archiv\n\nÖffnen Sie zuerst **example-data.zip** (aus examples.zip) im Archivmanager. In der Suite wird das Archiv unter `/mnt` eingebunden; in einer gewöhnlichen Jupyter-Installation wird es neben dem Notebook entpackt. Nach jeder Zelle gehen Änderungen zurück ins Archiv (speichern Sie es im Archivmanager).")),
        ("code", "import os\n\ntry:\n    import suite                                  # in the suite\n    folder = await suite.archives.mount('example-data.zip')\nexcept ModuleNotFoundError:                       # regular Jupyter\n    import zipfile\n    zipfile.ZipFile('example-data.zip').extractall('example-data')\n    folder = 'example-data'\n\nsorted(os.listdir(folder))"),
        ("code", "import pandas as pd\n\ndf = pd.read_csv(os.path.join(folder, 'measurements.csv'))\ndf.describe()"),
        ("code", "summary = df.groupby('station').temperature.mean().round(1)\nsummary.to_csv(os.path.join(folder, 'summary.csv'))   # " + l("written into the archive after this cell", "wird nach dieser Zelle ins Archiv geschrieben") + "\nsummary"),
    ])
    requests_nb = nb([
        ("markdown", l("# Web requests\n\nIn the suite, `requests` goes through the **relay** (set it in the Files panel: Network). This works also when the notebook is opened as a file. In Jupyter, requests connects directly.",
                       "# Webanfragen\n\nIn der Suite läuft `requests` über das **Relay** (im Dateibereich unter Netzwerk einstellen). Das funktioniert auch, wenn das Notebook als Datei geöffnet ist. In Jupyter verbindet sich requests direkt.")),
        ("code", "try:\n    import suite.net\n    print(suite.net.status())\nexcept ModuleNotFoundError:\n    print('regular Python: direct connections')"),
        ("code", "import requests\n\nr = requests.get('https://httpbin.org/get', params={'lang': '" + lang + "'}, timeout=20)\nr.raise_for_status()\nr.json()['args']"),
        ("code", "r = requests.post('https://httpbin.org/post', json={'name': '" + l("Example", "Beispiel") + "'}, timeout=20)\nr.json()['json']"),
    ])
    sockets = nb([
        ("markdown", l("# Mail and FTP with the standard library\n\nSockets need the notebook **served by the relay** (`relay.py --serve`, the header shows 🔓). The code is plain Python – the same cells run in a regular Jupyter installation. The FTP server is the public read-only demo of Rebex (test.rebex.net); for mail, enter your own server.",
                       "# E-Mail und FTP mit der Standardbibliothek\n\nSockets brauchen das **vom Relay bereitgestellte** Notebook (`relay.py --serve`, die Kopfzeile zeigt 🔓). Der Code ist gewöhnliches Python – dieselben Zellen laufen in einer gewöhnlichen Jupyter-Installation. Der FTP-Server ist das öffentliche, schreibgeschützte Demo von Rebex (test.rebex.net); für E-Mail tragen Sie Ihren eigenen Server ein.")),
        ("code", "from ftplib import FTP\n\nwith FTP('test.rebex.net', timeout=20) as ftp:\n    ftp.login('demo', 'password')\n    print(ftp.nlst())\n    lines = []\n    ftp.retrlines('RETR readme.txt', lines.append)\nprint('\\n'.join(lines[:5]))"),
        ("code", "import smtplib\nfrom email.message import EmailMessage\n\nSERVER, PORT, USER = 'mail.example.org', 587, 'anna@example.org'   # " + l("your server", "Ihr Server") + "\nPASSWORD = ''   # " + l("fill in to send", "zum Senden ausfüllen") + "\n\nmsg = EmailMessage()\nmsg['From'], msg['To'], msg['Subject'] = USER, USER, '" + l("Sent from a notebook", "Aus einem Notebook gesendet") + "'\nmsg.set_content('" + l("Hello from Python!", "Hallo aus Python!") + "')\n\nif PASSWORD:\n    with smtplib.SMTP(SERVER, PORT, timeout=30) as s:\n        s.starttls()\n        s.login(USER, PASSWORD)\n        s.send_message(msg)\n    print('sent')\nelse:\n    print(msg)"),
    ])
    ssh = nb([
        ("markdown", l("# SSH and SFTP\n\nIn the suite (served by the relay) `suite.ssh.Connection` uses the suite's SSH engine; in a regular Jupyter installation the same code runs with **Fabric**. test.rebex.net offers SFTP only (no commands); for `run`, use your own server.",
                       "# SSH und SFTP\n\nIn der Suite (vom Relay bereitgestellt) verwendet `suite.ssh.Connection` die SSH-Engine der Suite; in einer gewöhnlichen Jupyter-Installation läuft derselbe Code mit **Fabric**. test.rebex.net bietet nur SFTP (keine Befehle); für `run` verwenden Sie Ihren eigenen Server.")),
        ("code", "try:\n    from suite.ssh import Connection      # in the suite\nexcept ModuleNotFoundError:\n    from fabric import Connection         # pip install fabric"),
        ("code", "with Connection('test.rebex.net', user='demo', connect_kwargs={'password': 'password'}) as c:\n    sftp = c.sftp()\n    print(sftp.listdir('.'))\n    c.get('readme.txt', 'readme.txt')\nprint(open('readme.txt').read()[:200])"),
        ("code", "# " + l("your own server: commands, upload, download", "Ihr eigener Server: Befehle, Hochladen, Herunterladen") + "\nHOST, USER, KEY = 'server.example.org', 'anna', 'id_ed25519'\nif False:   # " + l("set to True", "auf True setzen") + "\n    with Connection(HOST, user=USER, connect_kwargs={'key_filename': KEY}) as c:\n        c.run('uname -a')\n        c.put('summary.csv', '/tmp/summary.csv')"),
    ])
    interrupt = nb([
        ("markdown", l("# Stopping a running cell\n\nRun the next cell, then press **⏹** (or `I`, `I` in command mode). Served by the relay, the cell ends with a `KeyboardInterrupt` and `counter` keeps its value; opened as a file, stopping restarts Python.",
                       "# Eine laufende Zelle anhalten\n\nFühren Sie die nächste Zelle aus und drücken Sie dann **⏹** (oder `I`, `I` im Befehlsmodus). Vom Relay bereitgestellt, endet die Zelle mit einem `KeyboardInterrupt`, und `counter` behält seinen Wert; als Datei geöffnet, startet das Anhalten Python neu.")),
        ("code", "import time\n\ncounter = 0\nwhile True:\n    counter += 1\n    time.sleep(0.1)"),
        ("code", "counter"),
    ])
    reports = nb([
        ("markdown", l("# Reports: Word, Excel, PDF\n\nRuns **offline** with the bundled python-docx, XlsxWriter, pypdf, Jinja2 and tabulate (in Jupyter: `pip install python-docx xlsxwriter pypdf jinja2 tabulate`). The files appear in the Files panel – open them with ↗ in the document editor, the spreadsheet or the PDF viewer.",
                       "# Berichte: Word, Excel, PDF\n\nLäuft **offline** mit den mitgelieferten python-docx, XlsxWriter, pypdf, Jinja2 und tabulate (in Jupyter: `pip install python-docx xlsxwriter pypdf jinja2 tabulate`). Die Dateien erscheinen im Dateibereich – öffnen Sie sie mit ↗ in der Textverarbeitung, der Tabellenkalkulation oder dem PDF-Betrachter.")),
        ("code", "import pandas as pd\nfrom tabulate import tabulate\n\nsales = pd.DataFrame({'" + l("month", "monat") + "': ['Jan', 'Feb', 'Mar'], '" + l("revenue", "umsatz") + "': [1200, 1350, 1100]})\nprint(tabulate(sales, headers='keys', tablefmt='github', showindex=False))"),
        ("code", "import docx\nfrom jinja2 import Template\n\ntext = Template('" + l("Revenue in {{ months }} months: {{ total }} EUR.", "Umsatz in {{ months }} Monaten: {{ total }} EUR.") + "').render(months=len(sales), total=sales.iloc[:, 1].sum())\ndoc = docx.Document()\ndoc.add_heading('" + l("Quarterly report", "Quartalsbericht") + "', 0)\ndoc.add_paragraph(text)\ntable = doc.add_table(rows=1, cols=2)\ntable.rows[0].cells[0].text, table.rows[0].cells[1].text = sales.columns\nfor m, r in sales.itertuples(index=False):\n    row = table.add_row().cells\n    row[0].text, row[1].text = m, str(r)\ndoc.save('" + l("report.docx", "bericht.docx") + "')\ntext"),
        ("code", "with pd.ExcelWriter('" + l("report.xlsx", "bericht.xlsx") + "', engine='xlsxwriter') as writer:\n    sales.to_excel(writer, sheet_name='" + l("Sales", "Umsatz") + "', index=False)\n    sheet = writer.sheets['" + l("Sales", "Umsatz") + "']\n    chart = writer.book.add_chart({'type': 'column'})\n    chart.add_series({'categories': ['" + l("Sales", "Umsatz") + "', 1, 0, 3, 0], 'values': ['" + l("Sales", "Umsatz") + "', 1, 1, 3, 1]})\n    sheet.insert_chart('D2', chart)\nprint('" + l("written", "geschrieben") + "')"),
        ("code", "import io\nimport matplotlib.pyplot as plt\nfrom pypdf import PdfReader, PdfWriter\n\n# " + l("two one-page PDFs (from matplotlib), merged into one", "zwei einseitige PDFs (aus matplotlib), zu einem zusammengefügt") + "\nwriter = PdfWriter()\nfor kind in ('bar', 'line'):\n    buf = io.BytesIO()\n    sales.plot(x=sales.columns[0], kind=kind, legend=False).figure.savefig(buf, format='pdf')\n    plt.close('all')\n    writer.append(PdfReader(buf))\nwriter.write('" + l("charts.pdf", "diagramme.pdf") + "')\nlen(PdfReader('" + l("charts.pdf", "diagramme.pdf") + "').pages)"),
    ])
    shell_nb = nb([
        ("markdown", l("# The shell\n\nThe notebook's **Terminal** tab has a bash-like shell on the Python file system (`help` lists the commands; `less` and `nano` are interactive). In cells, `suite.shell.run` does the same; in a regular Jupyter installation the same cells use the system's shell.",
                       "# Die Shell\n\nDer Reiter **Terminal** des Notebooks hat eine bash-ähnliche Shell auf dem Python-Dateisystem (`help` listet die Befehle; `less` und `nano` sind interaktiv). In Zellen macht `suite.shell.run` dasselbe; in einer gewöhnlichen Jupyter-Installation verwenden dieselben Zellen die Shell des Systems.")),
        ("code", "try:\n    import suite.shell\n    async def sh(command):\n        return await suite.shell.run(command)\nexcept ModuleNotFoundError:      # regular Jupyter\n    import subprocess\n    async def sh(command):\n        return subprocess.run(command, shell=True).returncode"),
        ("code", "await sh(\"mkdir -p demo && cd demo && printf 'anna,wien,31\\nbernd,graz,45\\nclara,wien,28\\n' > people.csv && cd ..\")\nawait sh('cat demo/people.csv | sort -t, -k3 -n | cut -d, -f1')"),
        ("code", "await sh('grep -c wien demo/people.csv; tar -czf demo.tgz demo && tar -tzf demo.tgz')"),
        ("markdown", l("The scripts **report.sh** and **backup.sh** of the examples run with `sh report.sh` in the Terminal (opened as an example, they are put into the Python file system). Scripts in a mounted archive run from `/mnt/<archive>/`.",
                       "Die Skripte **bericht.sh** und **sicherung.sh** der Beispiele laufen mit `sh bericht.sh` im Terminal (als Beispiel geöffnet, werden sie in das Python-Dateisystem gelegt). Skripte in einem eingebundenen Archiv laufen aus `/mnt/<Archiv>/`.")),
    ])
    report_sh = l("""#!/bin/sh
# A small report from CSV data: run it in the notebook's Terminal with  sh report.sh
mkdir -p report
echo "city,product,units" > report/sales.csv
echo "Wien,tea,12" >> report/sales.csv
echo "Graz,coffee,7" >> report/sales.csv
echo "Wien,coffee,20" >> report/sales.csv
echo "Linz,tea,5" >> report/sales.csv
echo "== units per row, largest first =="
tail -n +2 report/sales.csv | sort -t, -k3 -rn
echo "== rows of Wien =="
grep -c Wien report/sales.csv
echo "== products =="
tail -n +2 report/sales.csv | cut -d, -f2 | sort | uniq -c
sed -n '2,3p' report/sales.csv | tr a-z A-Z
""", """#!/bin/sh
# Ein kleiner Bericht aus CSV-Daten: im Terminal des Notebooks mit  sh bericht.sh  ausführen
mkdir -p bericht
echo "stadt,produkt,stueck" > bericht/umsatz.csv
echo "Wien,Tee,12" >> bericht/umsatz.csv
echo "Graz,Kaffee,7" >> bericht/umsatz.csv
echo "Wien,Kaffee,20" >> bericht/umsatz.csv
echo "Linz,Tee,5" >> bericht/umsatz.csv
echo "== Stück je Zeile, größte zuerst =="
tail -n +2 bericht/umsatz.csv | sort -t, -k3 -rn
echo "== Zeilen von Wien =="
grep -c Wien bericht/umsatz.csv
echo "== Produkte =="
tail -n +2 bericht/umsatz.csv | cut -d, -f2 | sort | uniq -c
sed -n '2,3p' bericht/umsatz.csv | tr a-z A-Z
""")
    backup_sh = l("""#!/bin/sh
# Back up a folder as TAR.GZ and ZIP:  sh backup.sh FOLDER
set -e
FOLDER=${1}
echo "Backing up $FOLDER"
tar -czf $FOLDER-backup.tgz $FOLDER
zip -r -q $FOLDER-backup.zip $FOLDER
ls -l $FOLDER-backup.*
""", """#!/bin/sh
# Einen Ordner als TAR.GZ und ZIP sichern:  sh sicherung.sh ORDNER
set -e
ORDNER=${1}
echo "Sichere $ORDNER"
tar -czf $ORDNER-sicherung.tgz $ORDNER
zip -r -q $ORDNER-sicherung.zip $ORDNER
ls -l $ORDNER-sicherung.*
""")
    return [(T(lang, "01-data-analysis.ipynb", "01-datenanalyse.ipynb"), analysis, l("Data analysis: pandas, seaborn, SciPy, scikit-learn (offline)", "Datenanalyse: pandas, seaborn, SciPy, scikit-learn (offline)"), True),
            (T(lang, "02-widgets.ipynb", "02-widgets.ipynb"), widgets, l("Interactive widgets (offline)", "Interaktive Widgets (offline)"), True),
            (T(lang, "03-archive.ipynb", "03-archiv.ipynb"), archives, l("Files in a mounted archive", "Dateien in einem eingebundenen Archiv"), True),
            (T(lang, "04-web-requests.ipynb", "04-webanfragen.ipynb"), requests_nb, l("requests through the relay", "requests über das Relay"), True),
            (T(lang, "05-mail-and-ftp.ipynb", "05-mail-und-ftp.ipynb"), sockets, l("smtplib and ftplib (served by the relay)", "smtplib und ftplib (vom Relay bereitgestellt)"), True),
            (T(lang, "06-ssh.ipynb", "06-ssh.ipynb"), ssh, l("SSH and SFTP, Fabric-compatible (served by the relay)", "SSH und SFTP, Fabric-kompatibel (vom Relay bereitgestellt)"), True),
            (T(lang, "07-interrupt.ipynb", "07-unterbrechen.ipynb"), interrupt, l("Stopping a running cell", "Eine laufende Zelle anhalten"), True),
            (T(lang, "08-reports.ipynb", "08-berichte.ipynb"), reports, l("Reports: Word, Excel and PDF files (offline)", "Berichte: Word-, Excel- und PDF-Dateien (offline)"), True),
            (T(lang, "09-shell.ipynb", "09-shell.ipynb"), shell_nb, l("The shell in cells and the Terminal (offline)", "Die Shell in Zellen und im Terminal (offline)"), True),
            (T(lang, "report.sh", "bericht.sh"), report_sh.encode(), l("Shell script: a report from CSV data (Terminal: sh report.sh)", "Shell-Skript: ein Bericht aus CSV-Daten (Terminal: sh bericht.sh)"), True),
            (T(lang, "backup.sh", "sicherung.sh"), backup_sh.encode(), l("Shell script: back up a folder (sh backup.sh FOLDER)", "Shell-Skript: einen Ordner sichern (sh sicherung.sh ORDNER)"), True),
            ("example-data.zip", example_data(lang), l("Data for the archive notebook (open it in the archive manager)", "Daten für das Archiv-Notebook (im Archivmanager öffnen)"), False)]


def example_data(lang):
    import random
    rnd = random.Random(1)
    rows = ["station,day,temperature"] + [f"{s},2026-01-{d:02d},{rnd.gauss(2 if s == 'Wien' else 0, 3):.1f}" for s in ("Wien", "Graz", "Linz") for d in range(1, 15)]
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(zipfile.ZipInfo("measurements.csv", FIXED), "\n".join(rows) + "\n")
        z.writestr(zipfile.ZipInfo("README.txt", FIXED), T(lang, "Temperatures of three stations (random example data).\n", "Temperaturen dreier Stationen (zufällige Beispieldaten).\n"))
    return out.getvalue()


def network_connections(lang, app):
    """Connection files for the apps with saved connections (Connections: Open…)."""
    conns = {
        "ftp": [{"id": "rebex-sftp", "name": T(lang, "Rebex demo (SFTP, read-only)", "Rebex-Demo (SFTP, schreibgeschützt)"), "protocol": "sftp", "host": "test.rebex.net", "port": 22, "username": "demo", "password": "password"},
                {"id": "rebex-ftp", "name": T(lang, "Rebex demo (FTP, read-only)", "Rebex-Demo (FTP, schreibgeschützt)"), "protocol": "ftp", "host": "test.rebex.net", "port": 21, "username": "demo", "password": "password"}],
        "ssh": [{"id": "own", "name": T(lang, "My server (edit)", "Mein Server (bearbeiten)"), "host": "server.example.org", "port": 22, "username": "anna"}],
    }[app]
    data = {"format": "portable-web-app-suite", "version": 1, "apps": {app: {"settings": {}, "connections": conns}}}
    return [(T(lang, f"{app}-connections.json", f"{app}-verbindungen.json"), json.dumps(data, indent=2, ensure_ascii=False).encode(),
             T(lang, "Connections file (Connections: Open…)", "Verbindungsdatei (Verbindungen: Öffnen…)"), False)]


def workspace(lang):
    """A workspace of the overview (*.suite.zip, shared/js/shell.js: Suite.workspace): some of the other examples in tabs."""
    tabs = [("texteditor", texteditor(lang)[2:4]), ("document", document(lang)[:1]), ("spreadsheet", spreadsheet(lang)[:1]), ("diagram", diagram(lang)[:1])]
    files = [{"path": f"{app}/{name}", "app": app, "name": name, "tab": i, "data": data} for i, (app, made) in enumerate(tabs) for name, data, _, _ in made]
    manifest = {"format": "portable-web-app-suite-workspace", "version": 1, "created": "2026-01-01T00:00:00.000Z", "app": "overview",
                "files": [{k: f[k] for k in ("path", "app", "name", "tab")} for f in files], "activeTab": 1, "settings": None}
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(zipfile.ZipInfo("workspace.json", FIXED), json.dumps(manifest, indent=2, ensure_ascii=False), compress_type=zipfile.ZIP_DEFLATED)
        for f in files:
            z.writestr(zipfile.ZipInfo(f["path"], FIXED), f["data"], compress_type=zipfile.ZIP_DEFLATED)
    return [(T(lang, "office.suite.zip", "buero.suite.zip"), out.getvalue(),
             T(lang, "Workspace with a text, a document, a spreadsheet and a diagram (F1 → Workspace → Open workspace…, in the overview)",
               "Arbeitsbereich mit Text, Dokument, Tabelle und Diagramm (F1 → Arbeitsbereich → Arbeitsbereich öffnen…, in der Übersicht)"), False)]


APPS = {
    "texteditor": texteditor, "hexeditor": hexeditor, "archive": archive, "mediaplayer": mediaplayer, "audioeditor": audioeditor,
    "videoeditor": videoeditor, "imageeditor": imageeditor, "diagram": diagram, "keepass": keepass, "spreadsheet": spreadsheet,
    "document": document, "presentation": presentation, "reveal": reveal, "pdfviewer": None, "calendar": calendar, "mail": mail,
    "dbtool": dbtool, "ftp": lambda lang: network_connections(lang, "ftp"), "ssh": lambda lang: network_connections(lang, "ssh"),
    "http": http, "webinspector": webinspector, "barcode": barcode, "notebook": notebook, "overview": workspace,
}


README = {"en": """# Examples

Example files for every application of the Portable Web App Suite. Open a file with the application named by its folder
(drag it onto the window or use Open). Many of them are also built into the applications: press F1 and choose one under
**Examples**. Passwords of the examples: **example**.

The notebooks run in the suite and in a regular Jupyter installation; those that use the network need the relay, sockets and
SSH the notebook served by the relay (`relay.py --serve`).
""", "de": """# Beispiele

Beispieldateien für jede Anwendung der Portable Web App Suite. Öffnen Sie eine Datei mit der Anwendung, nach der ihr Ordner
benannt ist (auf das Fenster ziehen oder Öffnen). Viele davon sind auch in die Anwendungen eingebaut: Drücken Sie F1 und wählen Sie
eines unter **Beispiele**. Passwörter der Beispiele: **example**.

Die Notebooks laufen in der Suite und in einer gewöhnlichen Jupyter-Installation; die mit Netzwerkzugriff brauchen das Relay, Sockets
und SSH das vom Relay bereitgestellte Notebook (`relay.py --serve`).
"""}


def main():
    make_zip = "--zip" in sys.argv
    if OUT.exists():
        shutil.rmtree(OUT)
    manifest = {"apps": {}}
    with tempfile.TemporaryDirectory() as work:
        for lang in ("en", "de"):
            for app, make in APPS.items():
                files = pdfviewer(lang, work) if app == "pdfviewer" else make(lang)
                for name, data, title, embed in files:
                    path = OUT / lang / app / name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(data)
                    manifest["apps"].setdefault(app, []).append({"file": f"{lang}/{app}/{name}", "lang": lang, "title": title,
                                                                  "embed": bool(embed) and len(data) <= EMBED_LIMIT, "size": len(data)})
            lines = [README[lang]] + [f"\n## {app}\n" + "".join(f"\n- `{e['file'].split('/', 2)[2]}` – {e['title']}" for e in entries if e["lang"] == lang) + "\n"
                                      for app, entries in manifest["apps"].items()]
            (OUT / lang / "README.md").write_text("".join(lines), encoding="utf-8")
    (OUT / "examples.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    total = sum(e["size"] for entries in manifest["apps"].values() for e in entries)
    print(f"wrote {OUT.relative_to(ROOT)}: {sum(len(v) for v in manifest['apps'].values())} files, {total // 1024} KiB")
    if make_zip:
        target = ROOT / "dist" / "examples.zip"
        target.parent.mkdir(exist_ok=True)
        with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as z:
            for path in sorted(OUT.rglob("*")):
                if path.is_file() and path.name != "examples.json":
                    z.writestr(zipfile.ZipInfo(f"examples/{path.relative_to(OUT)}", FIXED), path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED)
        print(f"wrote {target.relative_to(ROOT)} ({target.stat().st_size // 1024} KiB)")


if __name__ == "__main__":
    main()
