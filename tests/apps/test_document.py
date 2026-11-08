"""Document editor (apps/document) on Univer Docs. DOCX fidelity is tested in tests/prototypes/test_s8_docx_reader.py."""
import io
import shutil
import re

from docx import Document
from playwright.sync_api import expect

from helpers import office_samples

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"


def ready(app_page, **kw):
    page = app_page("document", init_script=NO_PICKERS, **kw)
    page.wait_for_selector("[data-testid=document] canvas", timeout=60000)
    page.wait_for_timeout(1600)
    return page


def open_file(page, path, shown=None):
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=open]")
    chooser.value.set_files(str(path))
    expect(page.locator("[data-testid=file-name]")).to_have_text(shown or path.name, timeout=30000)


def text(page):
    return page.evaluate("DOC.toText(DOC.doc.save())")


def click_text(page):
    """Click into the first lines of the document (inside the canvas also on a phone, where it is 390 px wide)."""
    canvas = page.locator("[data-testid=document] canvas").first
    canvas.click(position={"x": min(400, canvas.bounding_box()["width"] / 2), "y": 120})


def test_open_edit_and_save_docx(app_page, tmp_path):
    source = office_samples.make_docx(tmp_path / "report.docx")
    page = ready(app_page)
    assert page.title() == "Document"
    open_file(page, source)
    assert text(page).startswith("Projektbericht\nNormal text with bold, italic, underlined and red.\n")
    click_text(page)
    page.keyboard.press("Control+Home")
    page.keyboard.type("Neu: ")
    expect(page.locator("[data-testid=file-name]")).to_contain_text("•")
    with page.expect_download() as d:
        page.click("[data-testid=save]")
    assert d.value.suggested_filename == "report.docx"
    saved = Document(io.BytesIO(open(d.value.path(), "rb").read()))
    paragraphs = [p.text for p in saved.paragraphs]
    assert paragraphs[0] == "Neu: Projektbericht"
    assert any(r.bold and r.text == "bold" for p in saved.paragraphs for r in p.runs)
    expect(page.locator("[data-testid=file-name]")).not_to_contain_text("•")
    assert page.errors == [] and page.requests == []


def test_typing_in_new_document_and_text_export(app_page):
    page = ready(app_page)
    click_text(page)
    page.keyboard.type("First line")
    page.keyboard.press("Enter")
    page.keyboard.type("Second line")  # (Firefox duplicates typed umlauts in Univer Docs under Playwright)
    page.click("[data-testid=save-as]")
    page.fill("[data-testid=save-as-name]", "notes")
    page.select_option("[data-testid=save-as-format]", "txt")
    with page.expect_download() as d:
        page.click("[data-testid=save-as-ok]")
    assert d.value.suggested_filename == "notes.txt"
    assert open(d.value.path(), encoding="utf-8").read() == "First line\nSecond line\n"
    expect(page.locator("[data-testid=toast]").last).to_contain_text("only the text")


def test_open_text_file(app_page, tmp_path):
    path = tmp_path / "plain.txt"
    path.write_text("Zeile 1 äöü\r\nZeile 2\r\n\r\nZeile 4", encoding="utf-8")
    page = ready(app_page)
    open_file(page, path)
    assert text(page) == "Zeile 1 äöü\nZeile 2\n\nZeile 4\n"


def test_rich_docx_and_template(app_page, tmp_path):
    rich = office_samples.make_docx_rich(tmp_path / "rich.docx")
    page = ready(app_page)
    open_file(page, rich)
    data = page.evaluate("DOC.doc.save()")
    assert "Dokumenttitel" in data["body"]["dataStream"] and data["headers"] and data["footers"]
    template = tmp_path / "vorlage.dotx"
    template.write_bytes(rich.read_bytes())
    open_file(page, template, shown="vorlage.docx")  # templates are saved as new documents


def test_language_and_theme(app_page):
    page = ready(app_page)
    page.click("[data-testid=language]")
    expect(page.locator("[data-testid=app-title]")).to_have_text("Textverarbeitung")
    expect(page.get_by_text("Einfügen", exact=True).first).to_be_visible()  # Univer's ribbon follows the language
    page.click("[data-testid=theme]")
    assert page.errors == []


def test_mobile_layout(app_page):
    page = ready(app_page, mobile=True)
    expect(page.locator("[data-testid=document] canvas").first).to_be_visible()
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert page.errors == []


ODT_NS = ('xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" '
          'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" '
          'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" '
          'xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.3"')


def make_odt(path):
    """A Writer document written by hand: styles with a parent chain, heading, list, table with spans, image, link, footnote, header."""
    import zipfile
    from PIL import Image
    png = io.BytesIO()
    Image.new("RGB", (40, 20), (200, 0, 0)).save(png, "PNG")
    content = f"""<?xml version="1.0" encoding="UTF-8"?>
<office:document-content {ODT_NS}><office:automatic-styles>
<style:style style:name="P1" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="center"/></style:style>
<style:style style:name="T1" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>
<style:style style:name="T2" style:family="text"><style:text-properties fo:font-style="italic" fo:color="#ff0000" fo:font-size="16pt"/></style:style>
<style:style style:name="Cell" style:family="table-cell"><style:table-cell-properties fo:background-color="#ffff00"/></style:style>
<style:style style:name="Col" style:family="table-column"><style:table-column-properties style:column-width="5cm"/></style:style>
<text:list-style style:name="Num"><text:list-level-style-number text:level="1" style:num-format="1"/><text:list-level-style-number text:level="2" style:num-format="a"/></text:list-style>
</office:automatic-styles><office:body><office:text>
<text:h text:style-name="Heading_20_1" text:outline-level="1">Bericht</text:h>
<text:p text:style-name="P1">Normal <text:span text:style-name="T1">fett</text:span> und <text:span text:style-name="T2">rot</text:span><text:s text:c="2"/>Ende<text:note text:note-class="footnote"><text:note-citation>1</text:note-citation><text:note-body><text:p>Die Fußnote.</text:p></text:note-body></text:note></text:p>
<text:p text:style-name="Quote">Zitat mit <text:a xlink:type="simple" xlink:href="https://example.org/">Link</text:a></text:p>
<text:list text:style-name="Num"><text:list-item><text:p>Eins</text:p><text:list><text:list-item><text:p>Unterpunkt</text:p></text:list-item></text:list></text:list-item><text:list-item><text:p>Zwei</text:p></text:list-item></text:list>
<table:table table:name="T"><table:table-column table:style-name="Col" table:number-columns-repeated="2"/>
<table:table-row><table:table-cell table:number-columns-spanned="2" table:style-name="Cell"><text:p>Kopf</text:p></table:table-cell><table:covered-table-cell/></table:table-row>
<table:table-row><table:table-cell><text:p>A</text:p></table:table-cell><table:table-cell><text:p>B</text:p></table:table-cell></table:table-row></table:table>
<text:p><draw:frame draw:name="Bild" text:anchor-type="as-char" svg:width="2cm" svg:height="1cm"><draw:image xlink:href="Pictures/a.png"/></draw:frame></text:p>
</office:text></office:body></office:document-content>"""
    styles = f"""<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles {ODT_NS}><office:styles>
<style:default-style style:family="paragraph"><style:text-properties fo:font-size="12pt"/></style:default-style>
<style:style style:name="Standard" style:family="paragraph"/>
<style:style style:name="Quote" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-left="1cm"/><style:text-properties fo:font-style="italic"/></style:style>
<style:style style:name="Heading_20_1" style:display-name="Heading 1" style:family="paragraph" style:default-outline-level="1"><style:text-properties fo:font-size="20pt" fo:font-weight="bold"/></style:style>
</office:styles><office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" fo:margin-top="2cm" fo:margin-bottom="2cm" fo:margin-left="2.5cm" fo:margin-right="2.5cm"/></style:page-layout></office:automatic-styles>
<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1"><style:header><text:p>Kopfzeile</text:p></style:header></style:master-page></office:master-styles></office:document-styles>"""
    with zipfile.ZipFile(path, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/vnd.oasis.opendocument.text")
        z.writestr("content.xml", content)
        z.writestr("styles.xml", styles)
        z.writestr("Pictures/a.png", png.getvalue())
        z.writestr("META-INF/manifest.xml", '<?xml version="1.0"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/></manifest:manifest>')
    return path


def test_open_and_save_odt(app_page, tmp_path):
    import xml.etree.ElementTree as ET
    import zipfile
    page = ready(app_page)
    open_file(page, make_odt(tmp_path / "bericht.odt"))
    content = text(page)
    assert content.startswith("Bericht\nNormal fett und rot  Ende1\nZitat mit Link\nEins\nUnterpunkt\nZwei\n")
    assert "Kopf" in content and "Die Fußnote." in content
    data = page.evaluate("DOC.doc.save()")
    body = data["body"]
    stream = body["dataStream"]
    runs = body["textRuns"]
    style_of = lambda word: next(r["ts"] for r in runs if stream[r["st"]:r["ed"]] == word)
    assert style_of("fett").get("bl") == 1 and style_of("rot").get("it") == 1 and style_of("rot")["cl"]["rgb"] == "#FF0000" and style_of("rot")["fs"] == 16
    paragraphs = body["paragraphs"]
    assert paragraphs[0]["paragraphStyle"]["namedStyleType"] == 4  # heading 1
    assert paragraphs[1]["paragraphStyle"]["horizontalAlign"] == 2
    lists = [p["bullet"] for p in paragraphs if p.get("bullet")]
    assert [(b["listType"], b["nestingLevel"]) for b in lists] == [("ORDER_LIST", 0), ("ORDER_LIST", 1), ("ORDER_LIST", 0)]
    assert any(r["properties"]["url"] == "https://example.org/" for r in body["customRanges"])
    [table] = data["tableSource"].values()
    assert table["tableRows"][0]["tableCells"][0]["columnSpan"] == 2 and table["tableRows"][0]["tableCells"][0]["backgroundColor"]["rgb"] == "#FFFF00"
    assert round(table["tableColumns"][0]["size"]["width"]["v"]) == 189
    assert len(data["drawings"]) == 1 and round(data["documentStyle"]["marginLeft"]) == 94
    assert any("Kopfzeile" in h["body"]["dataStream"] for h in data["headers"].values())

    # saved as ODT again
    with page.expect_download() as d:
        page.click("[data-testid=save]")
    assert d.value.suggested_filename == "bericht.odt"
    with zipfile.ZipFile(d.value.path()) as z:
        assert z.namelist()[0] == "mimetype" and z.read("mimetype") == b"application/vnd.oasis.opendocument.text"
        assert z.getinfo("mimetype").compress_type == zipfile.ZIP_STORED
        root = ET.fromstring(z.read("content.xml"))
        styles = ET.fromstring(z.read("styles.xml"))
        assert any(n.startswith("Pictures/") for n in z.namelist())
    ns = {"text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0", "style": "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
          "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0", "fo": "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0",
          "xlink": "http://www.w3.org/1999/xlink"}
    heading = root.find(".//text:h", ns)
    assert heading.get("{%s}outline-level" % ns["text"]) == "1" and "".join(heading.itertext()) == "Bericht"
    spans = {"".join(s.itertext()): s.get("{%s}style-name" % ns["text"]) for s in root.iter("{%s}span" % ns["text"])}
    auto = {s.get("{%s}name" % ns["style"]): s for s in root.iter("{%s}style" % ns["style"])}
    bold = auto[spans["fett"]].find("style:text-properties", ns)
    assert bold.get("{%s}font-weight" % ns["fo"]) == "bold"
    assert root.find(".//text:a", ns).get("{%s}href" % ns["xlink"]) == "https://example.org/"
    items = ["".join(p.itertext()) for p in root.find(".//text:list", ns).iter("{%s}p" % ns["text"])]
    assert items == ["Eins", "Unterpunkt", "Zwei"]
    cells = root.findall(".//table:table-row", ns)[0]
    assert cells[0].get("{%s}number-columns-spanned" % ns["table"]) == "2" and cells[1].tag.endswith("covered-table-cell")
    assert "Kopfzeile" in "".join(styles.find(".//style:header", ns).itertext())
    # and read back
    path = tmp_path / "wieder.odt"
    d.value.save_as(path)
    open_file(page, path)
    assert text(page).startswith("Bericht\nNormal fett und rot  Ende1\n")
    assert page.errors == []


def make_docx_with_headings_and_footnote(path):
    """python-docx has no footnotes: the footnote part is added to the package by hand."""
    import re
    import zipfile
    d = Document()
    d.add_heading("Einleitung", 1)
    p = d.add_paragraph("Ein Satz mit Fußnote")
    d.add_heading("Details", 2)
    d.add_paragraph("Mehr Text.")
    d.add_heading("Schluss", 1)
    d.save(path)
    with zipfile.ZipFile(path) as z:
        files = {n: z.read(n) for n in z.namelist()}
    w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    doc = files["word/document.xml"].decode()
    doc = doc.replace("<w:t>Ein Satz mit Fußnote</w:t></w:r>", '<w:t>Ein Satz mit Fußnote</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="2"/></w:r>', 1)
    files["word/document.xml"] = doc.encode()
    files["word/footnotes.xml"] = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes xmlns:w="{w}">'
                                   '<w:footnote w:type="separator" w:id="0"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>'
                                   '<w:footnote w:id="2"><w:p><w:r><w:t>Die Quelle der Fußnote.</w:t></w:r></w:p></w:footnote></w:footnotes>').encode()
    rels = files["word/_rels/document.xml.rels"].decode()
    files["word/_rels/document.xml.rels"] = rels.replace("</Relationships>", '<Relationship Id="rIdFn" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/></Relationships>').encode()
    types = files["[Content_Types].xml"].decode()
    files["[Content_Types].xml"] = types.replace("</Types>", '<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/></Types>').encode()
    with zipfile.ZipFile(path, "w") as z:
        for n, data in files.items():
            z.writestr(n, data)
    return path


def test_table_of_contents_and_footnotes(app_page, tmp_path):
    import zipfile
    page = ready(app_page)
    open_file(page, make_docx_with_headings_and_footnote(tmp_path / "kapitel.docx"))
    content = text(page)
    assert "Ein Satz mit Fußnote1\n" in content and content.rstrip().endswith("—————\n1 Die Quelle der Fußnote.")
    page.click("[data-testid=toc]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("3 headings inserted")
    assert text(page).startswith("Contents\nEinleitung\nDetails\nSchluss\nEinleitung\n")
    indents = page.evaluate("DOC.doc.save().body.paragraphs.slice(1, 4).map((p) => (p.paragraphStyle.indentStart || { v: 0 }).v)")
    assert indents == [0, 18, 0]
    # a second click updates it in place
    page.click("[data-testid=toc]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("updated (3 headings)")
    assert text(page).count("Contents\n") == 1
    # DOCX: internal links to bookmarks on the headings
    with page.expect_download() as d:
        page.click("[data-testid=save]")
    with zipfile.ZipFile(d.value.path()) as z:
        xml = z.read("word/document.xml").decode()
    assert 'w:anchor="toc-1"' in xml and 'w:anchor="toc-2"' in xml and 'w:name="toc-1"' in xml and 'w:name="toc-3"' in xml
    # ODT: the same with text:bookmark
    page.click("[data-testid=save-as]")
    page.select_option("[data-testid=save-as-format]", "odt")
    with page.expect_download() as d:
        page.click("[data-testid=save-as-ok]")
    with zipfile.ZipFile(d.value.path()) as z:
        content_xml = z.read("content.xml").decode()
    import re
    assert re.search(r'<text:bookmark text:name="toc-2"/>(<text:span[^>]*>)?Details', content_xml) and 'xlink:href="#toc-2"' in content_xml
    assert page.errors == []


def test_print_and_html_export(app_page, tmp_path):
    page = ready(app_page)
    page.evaluate("window.printed = 0")
    open_file(page, make_odt(tmp_path / "bericht.odt"))
    page.click("[data-testid=toc]")
    # printing renders the document into a hidden frame with the page size and margins of the document
    # (Firefox under Playwright blocks the page in print(): there the frame is caught before it loads)
    page.evaluate("""(stop) => { new MutationObserver((list) => { for (const m of list) for (const n of m.addedNodes)
      if (n.tagName === 'IFRAME') { window.printed += 1; window.printedHtml = n.srcdoc; if (stop) n.onload = null; } })
      .observe(document.body, { childList: true }); }""", page.context.browser.browser_type.name == "firefox")
    page.click("[data-testid=print]")
    page.wait_for_function("() => window.printed === 1")
    printed = page.evaluate("window.printedHtml")
    assert "@page { size: " in printed and "margin: " in printed
    assert '<h1 id="toc-1"' in printed and '<a href="#toc-1">Bericht</a>' in printed
    assert 'font-weight:bold;font-size:12pt">fett</span>' in printed and '<a href="https://example.org/">' in printed
    assert "<ol><li>" in printed and 'colspan="2"' in printed and "<img src=\"data:image/" in printed
    if page.context.browser.browser_type.name == "chromium":  # (the header in a page margin box, as text)
        assert re.search(r'@top-\w+ \{ content: "[^"]*Kopfzeile', printed)
    else:
        assert 'class="doc-header"' in printed and "Kopfzeile" in printed
    # saved as a web page
    page.click("[data-testid=save-as]")
    page.select_option("[data-testid=save-as-format]", "html")
    expect(page.locator("[data-testid=save-as-dialog], dialog[open]").first).to_contain_text("not the page layout")
    with page.expect_download() as d:
        page.click("[data-testid=save-as-ok]")
    assert d.value.suggested_filename == "bericht.html"
    saved = open(d.value.path(), encoding="utf-8").read()
    assert saved.startswith("<!doctype html>") and "<title>bericht</title>" in saved and "Zitat mit " in saved
    assert page.errors == []


def test_spelling(app_page, tmp_path):
    import zipfile
    page = ready(app_page)
    page.evaluate("DOC.load(DOC.fromText(\"Hello wrold and more teext here.\\nThe wrold is big, NASA and e.g. https://exmaple.org don't care.\"), 'spell.docx')")
    page.wait_for_timeout(500)
    page.click("[data-testid=spell]")
    expect(page.locator("[data-testid=spell-status]")).to_have_text("2 unknown words", timeout=20000)
    expect(page.locator("[data-testid=spell-word]")).to_have_text(["wrold ×2", "teext"])
    # a word selects its occurrence in the document and shows suggestions; a suggestion replaces all occurrences
    page.click("[data-testid=spell-word] >> nth=0")
    expect(page.locator("[data-testid=spell-suggestion]", has_text="world")).to_be_visible()
    assert page.evaluate("DOC.univerAPI._injector.get(DOC.selection).getActiveTextRange().startOffset") == 6
    page.click("[data-testid=spell-suggestion] >> text=world")
    expect(page.locator("[data-testid=spell-status]")).to_have_text("1 unknown word")
    assert text(page).startswith("Hello world and more teext here.\nThe world is big")
    expect(page.locator("[data-testid=file-name]")).to_contain_text("•")
    # added to the personal dictionary (kept for the next session)
    page.click("[data-testid=spell-word]")
    page.click("[data-testid=spell-add]")
    expect(page.locator("[data-testid=spell-status]")).to_have_text("No spelling errors found.")
    assert page.evaluate("JSON.parse(localStorage.getItem('suite.spell.words'))") == ["teext"]

    # a dictionary from a LibreOffice extension (ISO-8859-1), kept in IndexedDB
    aff = "SET ISO8859-1\nTRY esianrtolcdugmphbyfvkwzESIANRTOLCDUGMPHBYFVKWZ\n".encode("latin-1")
    dic = "3\nHallo\nWelt\nGrüße\n".encode("latin-1")
    oxt = tmp_path / "dict-de.oxt"
    with zipfile.ZipFile(oxt, "w") as z:
        z.writestr("META-INF/manifest.xml", "<manifest/>")
        z.writestr("dictionaries/de_TEST.aff", aff)
        z.writestr("dictionaries/de_TEST.dic", dic)
        z.writestr("dictionaries/hyph_de_TEST.dic", b"ISO8859-1\n")
    page.evaluate("DOC.load(DOC.fromText('Hallo Welt, viele Grüße und Grüsse'), 'de.docx')")
    page.click("[data-testid=spell-recheck]")
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=spell-load]")
    chooser.value.set_files(str(oxt))
    expect(page.locator("[data-testid=spell-language]")).to_have_value("de_TEST")
    expect(page.locator("[data-testid=spell-word]")).to_have_text(["viele", "und", "Grüsse"])
    # ignored for this session
    page.click("[data-testid=spell-word] >> text=und")
    page.click("[data-testid=spell-ignore]")
    expect(page.locator("[data-testid=spell-word]")).to_have_text(["viele", "Grüsse"])
    # still there after a reload; .aff and .dic files work as well
    # (a second page instead of page.reload(): Chromium sometimes starts a new page with the storage of before the latest writes, so it
    # is opened again until the storage has arrived – the test is about the app reading its settings, not about Chromium's timing)
    first = page
    for _ in range(20):
        first.wait_for_timeout(500)
        page = first.context.new_page()
        page.errors = []
        page.on("pageerror", lambda e, p=page: p.errors.append(str(e)))
        page.goto(first.url)
        if page.evaluate("localStorage.getItem('suite.spell.language')") == "de_TEST":
            break
        page.close()
    first.close()
    page.wait_for_selector("[data-testid=document] canvas", timeout=60000)
    page.keyboard.press("F7")
    expect(page.locator("[data-testid=spell-language] option")).to_have_count(3)  # English, German, de_TEST
    expect(page.locator("[data-testid=spell-language]")).to_have_value("de_TEST")
    page.click("[data-testid=spell-remove]")
    expect(page.locator("[data-testid=spell-language] option")).to_have_count(2)
    # built-in German: compounds and umlauts are known (Hunspell)
    page.evaluate("DOC.load(DOC.fromText('Die Rechtschreibprüfung der Kindergartenplätze im Gesundheitsministerium ist schön, aber Fehlerr bleiben.'), 'de2.docx')")
    page.select_option("[data-testid=spell-language]", "de_DE")
    page.click("[data-testid=spell-recheck]")
    expect(page.locator("[data-testid=spell-word]")).to_have_text(["Fehlerr"], timeout=20000)
    page.click("[data-testid=spell-word]")
    expect(page.locator("[data-testid=spell-suggestion]").first).to_have_text("Fehler")
    (tmp_path / "en_X.aff").write_text("SET UTF-8\n")
    (tmp_path / "en_X.dic").write_text("1\nzyx\n")
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=spell-load]")
    chooser.value.set_files([str(tmp_path / "en_X.aff"), str(tmp_path / "en_X.dic")])
    expect(page.locator("[data-testid=spell-language]")).to_have_value("en_X")
    page.click("[data-testid=spell-close]")
    expect(page.locator("[data-testid=spell-panel]")).to_have_count(0)
    assert page.errors == []


def test_very_long_words(app_page, tmp_path):
    """Univer's layout overflows the stack on a word of ~100 000 characters: such words get invisible break points."""
    page = ready(app_page)
    path = tmp_path / "base64.txt"
    path.write_text("start " + "A" * 150000 + " end\nnext line\n")
    page.evaluate("window.__toasts = []; const t = Suite.shell.toast; Suite.shell.toast = (m, k) => { __toasts.push(m); return t(m, k); }")
    open_file(page, path)
    page.wait_for_function("() => __toasts.some((m) => String(m).includes('invisible break points'))", timeout=30000)
    text = page.evaluate("DOC.doc.save().body.dataStream")
    assert text.replace("\u200b", "").startswith("start " + "A" * 150000 + " end\rnext line") and text.count("\u200b") == 149
    assert page.errors == []


LINKS = "() => DOC.doc.save().body.customRanges.filter((r) => r.rangeType === 0).map((r) => [r.startIndex, r.endIndex, r.properties.url])"
SELECT = "([a, b]) => DOC.univerAPI._injector.get(DOC.selection).replaceDocRanges([{ startOffset: a, endOffset: b }])"


def test_hyperlinks(app_page, tmp_path):
    import zipfile
    page = ready(app_page)
    page.evaluate("DOC.load(DOC.fromText('Visit the suite website today.'), 'links.docx')")
    page.wait_for_timeout(500)
    click_text(page)
    # select "suite website", Ctrl+K: the link box asks for the address
    page.evaluate(SELECT, [10, 23])
    page.keyboard.press("Control+k")
    page.keyboard.type("https://suite.example.org/")
    page.get_by_role("button", name="Confirm").click()
    page.wait_for_timeout(300)
    assert page.evaluate(LINKS) == [[10, 22, "https://suite.example.org/"]]
    expect(page.locator("[data-testid=file-name]")).to_contain_text("•")
    # Insert → link works the same way
    page.evaluate(SELECT, [24, 29])
    page.get_by_text("Insert", exact=True).first.click()
    page.locator("[data-u-command='doc.operation.show-hyper-link-edit-popup']:visible").first.click()
    page.keyboard.type("mailto:info@example.com")
    page.get_by_role("button", name="Confirm").click()
    page.wait_for_timeout(300)
    assert page.evaluate(LINKS) == [[10, 22, "https://suite.example.org/"], [24, 28, "mailto:info@example.com"]]

    with page.expect_download() as d:
        page.click("[data-testid=save]")
    saved = tmp_path / "links.docx"
    d.value.save_as(saved)
    with zipfile.ZipFile(saved) as z:
        document = z.read("word/document.xml").decode()
        rels = z.read("word/_rels/document.xml.rels").decode()
    assert "https://suite.example.org/" in rels and "mailto:info@example.com" in rels
    links = [Document(saved).part.rels[h.split('r:id="')[1].split('"')[0]].target_ref for h in document.split("<w:hyperlink")[1:]]
    assert links == ["https://suite.example.org/", "mailto:info@example.com"]
    assert [p.text for p in Document(saved).paragraphs][0] == "Visit the suite website today."

    # opened again, the link can be changed: Ctrl+K on the linked text shows its address
    open_file(page, saved)
    assert page.evaluate(LINKS)[0] == [10, 22, "https://suite.example.org/"]
    click_text(page)
    page.evaluate(SELECT, [10, 23])
    page.keyboard.press("Control+k")
    field = page.locator("input:visible").last
    expect(field).to_have_value("https://suite.example.org/")
    field.fill("https://example.org/new")
    page.get_by_role("button", name="Confirm").click()
    page.wait_for_timeout(300)
    assert page.evaluate(LINKS)[0][2] == "https://example.org/new"
    assert page.errors == []


def ribbon_button(page, command):
    """A ribbon button; on a phone the last buttons of a tab are in its ⋮ menu."""
    button = page.locator(f"[data-u-command='{command}']:visible")
    if not button.count():
        page.locator("[data-u-comp=ribbon-toolbar] .univerjs-icon-more-vertical-icon:visible").first.click()
    return button.first


FIELDS = "(kind) => Object.values(DOC.doc.save()[kind] || {}).flatMap((h) => (h.body.customRanges || []).filter((r) => r.rangeType === 1).map((r) => r.properties.fieldType))"


def test_headers_footers_and_page_numbers(app_page, tmp_path):
    import subprocess
    import zipfile
    page = ready(app_page)
    open_file(page, office_samples.make_paged_docx(tmp_path / "pages.docx"))
    # Word's PAGE (complex field) and NUMPAGES (simple field) become page fields of the footer
    footer = page.evaluate("Object.values(DOC.doc.save().footers)[0].body")
    assert footer["dataStream"] == "Page \x1f1\x1e of \x1f3\x1e\r\n"
    assert page.evaluate(FIELDS, "footers") == ["PAGE", "NUMPAGES"]

    # Insert → Header & footer → Edit header; the Header & Footer tab inserts the current page
    click_text(page)
    page.get_by_text("Insert", exact=True).first.click()
    ribbon_button(page, "doc-hf-menu").click()
    page.locator("[role=menu]").get_by_text("Edit header", exact=True).click()
    page.wait_for_timeout(500)
    page.keyboard.press("End")
    page.keyboard.type(" - page ")
    ribbon_button(page, "doc.command.insert-header-footer-field").click()
    page.locator("[role=menu]").get_by_text("Current page", exact=True).click()
    page.wait_for_timeout(300)
    assert page.evaluate(FIELDS, "headers") == ["PAGE"]
    expect(page.locator("[data-testid=file-name]")).to_contain_text("•")

    # Word: PAGE and NUMPAGES fields
    with page.expect_download() as d:
        page.click("[data-testid=save]")
    saved = tmp_path / "saved.docx"
    d.value.save_as(saved)
    with zipfile.ZipFile(saved) as z:
        parts = {n: z.read(n).decode() for n in z.namelist() if re.match(r"word/(header|footer)\d+\.xml", n)}
    header = next(x for n, x in parts.items() if "header" in n)
    footer_xml = next(x for n, x in parts.items() if "footer" in n)
    assert Document(saved).sections[0].header.paragraphs[0].text == "Report header - page " and ">PAGE<" in header
    assert ">PAGE<" in footer_xml and ">NUMPAGES<" in footer_xml
    # OpenDocument: text:page-number / text:page-count
    page.click("[data-testid=save-as]")
    page.select_option("[data-testid=save-as-format]", "odt")
    with page.expect_download() as d:
        page.click("[data-testid=save-as-ok]")
    with zipfile.ZipFile(d.value.path()) as z:
        styles = z.read("styles.xml").decode()
    assert "<text:page-number" in styles and "<text:page-count" in styles

    # printing: in Chromium the header and footer are page margin boxes that number the pages
    if page.context.browser.browser_type.name == "chromium":
        html = page.evaluate("import('app/doc-html').then((m) => m.toHtml(DOC.doc.save(), { print: true, pageCounters: true }))")
        assert '@bottom-center { content: "Page " counter(page) " of " counter(pages)' in html
        assert re.search(r'@top-left \{ content: "Report header - page " counter\(page\)', html)
        pdf_page = page.context.new_page()
        pdf_page.set_content(html)
        pdf = tmp_path / "printed.pdf"
        pdf_page.pdf(path=str(pdf))
        if shutil.which("pdftotext"):
            text = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True).stdout
            assert "Page 2 of " in text and "Report header - page 2" in text
    assert page.errors == []


STYLE = "() => { const s = DOC.doc.save().documentStyle; return { flavor: s.documentFlavor, orient: s.pageOrient, w: Math.round(s.pageSize.width), h: Math.round(s.pageSize.height), top: Math.round(s.marginTop), left: Math.round(s.marginLeft) }; }"


def test_page_setup(app_page, tmp_path):
    import zipfile
    page = ready(app_page)
    open_file(page, office_samples.make_docx(tmp_path / "report.docx"))
    # Univer's page setup button (Start tab) opens the dialog with the document's settings in centimetres
    page.get_by_text("Start", exact=True).first.click()
    ribbon_button(page, "docs.operation.open-page-setting").click()
    expect(page.locator("[data-testid=page-setup-dialog]")).to_be_visible()
    expect(page.locator("[data-testid=ps-paper]")).to_have_value("Letter")
    expect(page.locator("[data-testid=ps-top]")).to_have_value("2.54")
    page.select_option("[data-testid=ps-paper]", "A4")
    page.select_option("[data-testid=ps-orientation]", "landscape")
    for side in ("top", "bottom", "left", "right"):
        page.fill(f"[data-testid=ps-{side}]", "2")
    page.click("[data-testid=ps-ok]")
    page.wait_for_timeout(500)
    assert page.evaluate(STYLE) == {"flavor": 1, "orient": 1, "w": 1123, "h": 794, "top": 76, "left": 76}
    expect(page.locator("[data-testid=file-name]")).to_contain_text("•")
    # undo, redo
    page.evaluate("DOC.univerAPI.executeCommand('univer.command.undo')")
    page.wait_for_timeout(300)
    assert page.evaluate(STYLE)["w"] == 816
    page.evaluate("DOC.univerAPI.executeCommand('univer.command.redo')")
    page.wait_for_timeout(300)
    assert page.evaluate(STYLE)["w"] == 1123

    with page.expect_download() as d:
        page.click("[data-testid=save]")
    saved = tmp_path / "saved.docx"
    d.value.save_as(saved)
    section = Document(saved).sections[0]
    assert str(section.orientation).startswith("LANDSCAPE") and round(section.page_width.cm, 1) == 29.7 and round(section.page_height.cm, 1) == 21.0
    assert round(section.left_margin.cm, 2) == 2.0 and round(section.top_margin.cm, 2) == 2.0
    page.click("[data-testid=save-as]")
    page.select_option("[data-testid=save-as-format]", "odt")
    with page.expect_download() as d:
        page.click("[data-testid=save-as-ok]")
    with zipfile.ZipFile(d.value.path()) as z:
        styles = z.read("styles.xml").decode()
    assert 'style:print-orientation="landscape"' in styles and 'fo:page-width="29.700cm"' in styles

    # a text without pages gets pages
    page.evaluate("DOC.load(DOC.fromText('Plain text'), 'plain.txt')")
    page.wait_for_timeout(500)
    page.evaluate("DOC.openPageSetup()")
    expect(page.locator("[data-testid=ps-pages]")).to_have_value("pageless")
    page.select_option("[data-testid=ps-pages]", "pages")
    expect(page.locator("[data-testid=ps-paper]")).to_have_value("A4")
    page.click("[data-testid=ps-ok]")
    page.wait_for_timeout(500)
    assert page.evaluate(STYLE) == {"flavor": 1, "orient": 0, "w": 794, "h": 1123, "top": 94, "left": 94}
    assert page.errors == []


def test_date_time_and_symbols(app_page):
    page = ready(app_page)
    page.evaluate("DOC.load(DOC.fromText('Date: .'), 'd.docx')")
    page.wait_for_timeout(500)
    click_text(page)
    page.evaluate(SELECT, [6, 6])
    # Insert → Date & time
    page.get_by_text("Insert", exact=True).first.click()
    ribbon_button(page, "doc-date-menu").click()
    page.locator("[role=menu]").get_by_text("Date (ISO, 2026-01-31)", exact=True).click()
    page.wait_for_timeout(300)
    today = page.evaluate("(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })()")
    assert text(page) == f"Date: {today}.\n"
    expect(page.locator("[data-testid=file-name]")).to_contain_text("•")
    page.keyboard.type(" x")  # the cursor is after the date
    page.wait_for_timeout(300)
    assert text(page) == f"Date: {today} x.\n"
    # Univer's symbol picker (Insert → Ω)
    ribbon_button(page, "doc.menu.insert-symbol").click()
    page.get_by_text("±", exact=True).first.click()
    page.wait_for_timeout(300)
    assert "±" in text(page)
    assert page.errors == []


def test_save_as_markdown(app_page, tmp_path):
    page = ready(app_page)
    open_file(page, office_samples.make_docx(tmp_path / "report.docx"))
    page.click("[data-testid=save-as]")
    page.select_option("[data-testid=save-as-format]", "md")
    expect(page.locator("[data-testid=save-as-dialog]")).to_contain_text("Markdown keeps headings")
    with page.expect_download() as d:
        page.click("[data-testid=save-as-ok]")
    assert d.value.suggested_filename == "report.md"
    md = open(d.value.path(), encoding="utf-8").read()
    assert md.startswith("# Projektbericht\n\nNormal text with **bold**, *italic*, underlined and red.\n\n## Liste\n\n")
    assert "- Erster Punkt\n- Zweiter Punkt\n- Dritter Punkt\n1. Schritt eins\n2. Schritt zwei" in md
    assert "| Name | Menge | Preis |\n| --- | --- | --- |\n| Äpfel | 3 | 1,50 |" in md
    # links and check lists; text that would be Markdown syntax is escaped
    page.evaluate("""() => { const data = DOC.fromText('Visit the site\\n1. not a list *not bold*\\ndone\\nopen');
      data.body.customRanges = [{ startIndex: 10, endIndex: 13, rangeId: 'l1', rangeType: 0, properties: { url: 'https://example.org/a b' } }];
      data.body.paragraphs[2].bullet = { listType: 'CHECK_LIST_CHECKED', listId: 'c', nestingLevel: 0 };
      data.body.paragraphs[3].bullet = { listType: 'CHECK_LIST', listId: 'c', nestingLevel: 0 };
      DOC.load(data, 'links.docx'); }""")
    page.wait_for_timeout(500)
    md = page.evaluate("import('app/doc-markdown').then((m) => m.toMarkdown(DOC.doc.save()))")
    assert md == "Visit the [site](https://example.org/a%20b)\n\n1\\. not a list \\*not bold\\*\n\n- [x] done\n- [ ] open\n", md
    assert page.errors == []
