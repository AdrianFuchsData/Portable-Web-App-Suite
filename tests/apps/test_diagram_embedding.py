"""Diagrams in other applications (shared/js/diagram-embed.js): insert an empty diagram, draw it in the diagram editor
(a window opened through the app bridge), save back, edit again; the image keeps the diagram through the file formats."""
import base64
import io
import urllib.parse
import zipfile

from PIL import Image
from playwright.sync_api import expect

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"


def diagram_window(page, click):
    """Click something that opens the diagram editor; returns its page once it shows the diagram."""
    with page.context.expect_page() as new_page:
        click()
    editor = new_page.value
    editor.errors = []
    editor.on("pageerror", lambda e: editor.errors.append(str(e)))
    editor.wait_for_selector("body[data-ready]", timeout=30000)
    editor.wait_for_function("() => window.DG && DG.app.name.endsWith('.png')", timeout=30000)
    return editor


def add_shapes(editor, *texts):
    for text in texts:
        editor.evaluate("""(text) => { document.querySelector('[data-testid=shape-rect]').click(); const s = DG.page().shapes[DG.page().shapes.length - 1];
          s.text = text; s.x = 40 + (DG.page().shapes.length - 1) * 160; s.y = 40; DG.app.dirty = true; DG.render(); }""", text)


def diagram_texts(src):
    """The shape texts of the diagram inside a PNG data URL."""
    img = Image.open(io.BytesIO(base64.b64decode(src.split(",", 1)[1])))
    return urllib.parse.unquote(img.text.get("mxfile", ""))


def test_presentation_insert_and_edit_a_diagram(app_page, tmp_path):
    page = app_page("presentation", init_script=NO_PICKERS)
    editor = diagram_window(page, lambda: page.click("[data-testid=add-diagram]"))
    add_shapes(editor, "Alpha")
    editor.keyboard.press("Control+s")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("The diagram was updated.")
    images = lambda: page.evaluate("PR.state.deck.slides[0].elements.filter((e) => e.type === 'image').map((e) => ({ id: e.id, src: e.image.src, w: e.w, h: e.h }))")
    [img] = images()
    assert "Alpha" in diagram_texts(img["src"])
    # a second save in the same window updates the same image
    add_shapes(editor, "Beta")
    editor.keyboard.press("Control+s")
    page.wait_for_function("() => PR.state.deck.slides[0].elements.filter((e) => e.type === 'image').length === 1 && PR.state.undo.length >= 2")
    [img2] = images()
    assert img2["id"] == img["id"] and "Beta" in diagram_texts(img2["src"]) and img2["w"] > img["w"]  # same scale: a wider diagram, a wider picture
    editor.close()
    # edit: the button of a selected diagram image, or a double-click
    page.evaluate("(id) => PR.select(id)", img["id"])
    editor = diagram_window(page, lambda: page.click("[data-testid=edit-diagram]"))
    assert sorted(editor.evaluate("DG.page().shapes.map((s) => s.text)")) == ["Alpha", "Beta"]
    add_shapes(editor, "Gamma")
    editor.keyboard.press("Control+s")
    page.wait_for_function("() => atob(PR.state.deck.slides[0].elements.find((e) => e.type === 'image').image.src.split(',')[1]).includes('Gamma')")
    page.keyboard.press("Control+z")  # one undo step: the image before
    assert "Gamma" not in diagram_texts(images()[0]["src"])
    page.keyboard.press("Control+y")
    # PPTX keeps it; opened again, it is still a diagram that can be edited
    with page.expect_download() as d:
        page.click("[data-testid=save]")
    pptx = tmp_path / "with-diagram.pptx"
    d.value.save_as(pptx)
    with zipfile.ZipFile(pptx) as z:
        assert any("Gamma" in urllib.parse.unquote(Image.open(io.BytesIO(z.read(n))).text.get("mxfile", "")) for n in z.namelist() if n.startswith("ppt/media/") and n.endswith(".png"))
    page.evaluate("(b) => PR.openBase64(b, 'with-diagram.pptx')", base64.b64encode(pptx.read_bytes()).decode())
    page.wait_for_function("() => PR.state.name === 'with-diagram.pptx'")
    image_id = page.evaluate("PR.state.deck.slides[0].elements.find((e) => e.type === 'image').id")
    page.evaluate("(id) => PR.select(id)", image_id)
    expect(page.locator("[data-testid=edit-diagram]")).to_be_visible()
    assert page.errors == [] and editor.errors == []


def test_ordinary_images_are_not_diagrams(app_page):
    page = app_page("presentation", init_script=NO_PICKERS)
    buf = io.BytesIO()
    Image.new("RGB", (20, 10), "red").save(buf, "PNG")
    src = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    page.evaluate("""(src) => { PR.state.deck.slides[0].elements.push({ id: 'pic', type: 'image', name: 'red', x: 10, y: 10, w: 200, h: 100, rot: 0,
      geometry: 'rect', fill: null, line: null, text: null, image: { src } }); PR.render(); PR.select('pic'); }""", src)
    expect(page.locator("[data-testid=panel]")).to_contain_text("red")
    expect(page.locator("[data-testid=edit-diagram]")).to_have_count(0)
    assert page.errors == []


def test_web_slides_diagram_block(app_page):
    page = app_page("reveal", init_script=NO_PICKERS)
    page.click("[data-testid=add-block] summary")
    editor = diagram_window(page, lambda: page.click("[data-testid=add-block-drawio]"))
    add_shapes(editor, "Delta")
    editor.keyboard.press("Control+s")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("The diagram was updated.")
    block = lambda: page.evaluate("RV.state.deck.slides.flatMap((s) => [s, ...s.children]).flatMap((s) => s.blocks || []).find((b) => b.type === 'image')")
    assert "Delta" in diagram_texts(block()["src"])
    # the presentation (HTML) carries the picture with the diagram inside
    assert block()["src"][:60] in page.evaluate("RV.presentationHtml()")
    editor.close()
    expect(page.locator("[data-testid=edit-diagram]")).to_be_visible()
    editor = diagram_window(page, lambda: page.click("[data-testid=edit-diagram]"))
    assert editor.evaluate("DG.page().shapes.map((s) => s.text)") == ["Delta"]
    add_shapes(editor, "Epsilon")
    editor.keyboard.press("Control+s")
    page.wait_for_function("() => atob(RV.state.deck.slides.flatMap((s) => [s, ...s.children]).flatMap((s) => s.blocks || []).find((b) => b.type === 'image').src.split(',')[1]).includes('Epsilon')")
    assert page.errors == [] and editor.errors == []


def test_document_insert_and_edit_a_diagram(app_page, tmp_path):
    page = app_page("document", init_script=NO_PICKERS)
    page.evaluate("DOC.load(DOC.fromText('Before the diagram.'), 'doc.docx')")
    editor = diagram_window(page, lambda: page.click("[data-testid=add-diagram]"))
    add_shapes(editor, "Zeta")
    editor.keyboard.press("Control+s")
    page.wait_for_function("() => Object.keys(DOC.doc.save().drawings || {}).length === 1", timeout=15000)
    drawing = lambda: list(page.evaluate("DOC.doc.save().drawings").values())[0]
    first = drawing()
    assert "Zeta" in diagram_texts(first["source"])
    # a second save updates the same picture (one undo step), the width stays
    add_shapes(editor, "Eta")
    editor.keyboard.press("Control+s")
    page.wait_for_function("() => atob(Object.values(DOC.doc.save().drawings)[0].source.split(',')[1]).includes('Eta')", timeout=15000)
    assert drawing()["drawingId"] == first["drawingId"] and drawing()["docTransform"]["size"]["width"] > first["docTransform"]["size"]["width"]
    editor.close()
    # select the picture: "Edit diagram"
    page.evaluate("(id) => DOC.drawingManager().focusDrawing([{ unitId: DOC.doc.getId(), subUnitId: DOC.doc.getId(), drawingId: id }])", first["drawingId"])
    expect(page.locator("[data-testid=edit-diagram]")).to_be_visible()
    editor = diagram_window(page, lambda: page.click("[data-testid=edit-diagram]"))
    assert sorted(editor.evaluate("DG.page().shapes.map((s) => s.text)")) == ["Eta", "Zeta"]
    add_shapes(editor, "Theta")
    editor.keyboard.press("Control+s")
    page.wait_for_function("() => atob(Object.values(DOC.doc.save().drawings)[0].source.split(',')[1]).includes('Theta')", timeout=15000)
    # DOCX keeps it
    with page.expect_download() as d:
        page.click("[data-testid=save]")
    out = tmp_path / "doc.docx"
    d.value.save_as(out)
    with zipfile.ZipFile(out) as z:
        assert any("Theta" in urllib.parse.unquote(Image.open(io.BytesIO(z.read(n))).text.get("mxfile", "")) for n in z.namelist() if n.startswith("word/media/") and n.endswith(".png"))
    assert page.errors == [] and editor.errors == []


# is the text in the diagram of the workbook's (first) picture?
SHEET_HAS = """((text) => { const r = (SS.workbook.save().resources || []).find((x) => x.name === 'SHEET_DRAWING_PLUGIN');
  return !!r && Object.values(JSON.parse(r.data)).flatMap((s) => Object.values(s.data || {})).some((d) => atob(d.source.split(',')[1]).includes(text)); })"""


def sheet_drawings(page):
    """The pictures of the workbook (Univer's drawing resource): [{ source, column, row, width, height }]."""
    return page.evaluate("""(() => { const r = (SS.workbook.save().resources || []).find((x) => x.name === 'SHEET_DRAWING_PLUGIN');
      if (!r || !r.data) return []; return Object.values(JSON.parse(r.data)).flatMap((s) => Object.values(s.data || {})); })()""")


def test_spreadsheet_pictures_from_and_to_xlsx(app_page, tmp_path):
    """Ordinary pictures in XLSX files (ExcelJS anchors): read with their cell and size, written again with the bytes unchanged."""
    import openpyxl
    from openpyxl.drawing.image import Image as XlImage
    buf = io.BytesIO()
    Image.new("RGB", (120, 60), "blue").save(buf, "PNG")
    png = buf.getvalue()
    wb = openpyxl.Workbook()
    ws = wb.active
    ws["A1"] = "With a picture"
    pic = XlImage(io.BytesIO(png))
    ws.add_image(pic, "C4")
    src = tmp_path / "pic.xlsx"
    wb.save(src)
    page = app_page("spreadsheet", init_script=NO_PICKERS)
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=open]")
    chooser.value.set_files(str(src))
    page.wait_for_function("() => { const r = (SS.workbook.save().resources || []).find((x) => x.name === 'SHEET_DRAWING_PLUGIN'); return r && r.data && r.data.includes('BASE64'); }", timeout=20000)
    [d] = sheet_drawings(page)
    assert (d["column"], d["row"], d["width"], d["height"]) == (2, 3, 120, 60)
    assert base64.b64decode(d["source"].split(",", 1)[1]) == png
    # opening is no change: nothing to undo, not dirty
    expect(page.locator("[data-testid=file-name]")).not_to_contain_text("•")
    page.evaluate("SS.state.dirty = true")
    with page.expect_download() as dl:
        page.click("[data-testid=save]")
    out = tmp_path / "out.xlsx"
    dl.value.save_as(out)
    with zipfile.ZipFile(out) as z:
        assert any(z.read(n) == png for n in z.namelist() if n.startswith("xl/media/"))
    with zipfile.ZipFile(out) as z:  # anchored at C4 again
        drawing = next(z.read(n).decode() for n in z.namelist() if n.startswith("xl/drawings/drawing") and n.endswith(".xml"))
    assert "<xdr:col>2</xdr:col>" in drawing and "<xdr:row>3</xdr:row>" in drawing
    assert page.errors == []


def test_spreadsheet_insert_and_edit_a_diagram(app_page, tmp_path):
    page = app_page("spreadsheet", init_script=NO_PICKERS)
    editor = diagram_window(page, lambda: page.click("[data-testid=add-diagram]"))
    add_shapes(editor, "Iota")
    editor.keyboard.press("Control+s")
    page.wait_for_function("() => (SS.workbook.save().resources || []).some((x) => x.name === 'SHEET_DRAWING_PLUGIN' && x.data.includes('BASE64'))", timeout=15000)
    [first] = sheet_drawings(page)
    assert "Iota" in diagram_texts(first["source"])
    add_shapes(editor, "Kappa")
    editor.keyboard.press("Control+s")
    page.wait_for_function(SHEET_HAS, arg='Kappa', timeout=15000)
    [second] = sheet_drawings(page)
    assert second["drawingId"] == first["drawingId"] and "Kappa" in diagram_texts(second["source"]) and second["width"] > first["width"]
    editor.close()
    # a click on the picture selects it: "Edit diagram"
    boxes = [c.bounding_box() for c in page.locator("[data-testid=sheet] canvas").all()]
    canvas = max((b for b in boxes if b), key=lambda b: b["width"] * b["height"])
    tr = sheet_drawings(page)[0]["transform"]
    page.mouse.click(canvas["x"] + tr["left"] + tr["width"] / 2, canvas["y"] + tr["top"] + tr["height"] / 2)

    expect(page.locator("[data-testid=edit-diagram]")).to_be_visible()
    editor = diagram_window(page, lambda: page.click("[data-testid=edit-diagram]"))
    assert sorted(editor.evaluate("DG.page().shapes.map((s) => s.text)")) == ["Iota", "Kappa"]
    add_shapes(editor, "Lambda")
    editor.keyboard.press("Control+s")
    page.wait_for_function(SHEET_HAS, arg='Lambda', timeout=15000)
    # XLSX keeps it
    with page.expect_download() as dl:
        page.click("[data-testid=save]")
    out = tmp_path / "diagram.xlsx"
    dl.value.save_as(out)
    with zipfile.ZipFile(out) as z:
        assert any("Lambda" in urllib.parse.unquote(Image.open(io.BytesIO(z.read(n))).text.get("mxfile", "")) for n in z.namelist() if n.startswith("xl/media/") and n.endswith(".png"))
    assert page.errors == [] and editor.errors == []
