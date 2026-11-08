"""Charts (shared/js/charts.js): from cells in the spreadsheet, in the presentation editor, from Excel and PowerPoint files; a PNG
picture that carries its data."""
import base64
import io
import json
import struct

from playwright.sync_api import expect

from test_presentation import open_deck, ready
from test_diagram_embedding import sheet_drawings

INIT = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined; try { localStorage.setItem('suite.files.archives', '0'); } catch (e) {}"


def png_bytes(src):
    return base64.b64decode(src.split(",", 1)[1]) if isinstance(src, str) else src


def model_of(src):
    """The chart model in the tEXt chunk "suite-chart" of a PNG (data URL or bytes)."""
    b = png_bytes(src)
    p = 8
    while p + 12 <= len(b):
        n, kind = struct.unpack(">I4s", b[p:p + 8])
        if kind == b"tEXt" and b[p + 8:p + 20] == b"suite-chart\0":
            return json.loads(base64.b64decode(b[p + 20:p + 8 + n]).decode("utf-8"))
        p += 12 + n
    return None


def colored(src, rgb=(0x44, 0x72, 0xC4)):
    """Pixels close to a colour (the first series' blue): the chart was drawn."""
    from PIL import Image
    img = Image.open(io.BytesIO(png_bytes(src))).convert("RGB")
    return sum(1 for p in img.getdata() if all(abs(a - b) < 12 for a, b in zip(p, rgb)))


def open_sheet(page, path):
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=open]")
    chooser.value.set_files(str(path))
    expect(page.locator("[data-testid=file-name]")).to_have_text(path.name, timeout=30000)


def click_picture(page, drawing):
    boxes = [c.bounding_box() for c in page.locator("[data-testid=sheet] canvas").all()]
    canvas = max((b for b in boxes if b), key=lambda b: b["width"] * b["height"])
    tr = drawing["transform"]
    page.mouse.click(canvas["x"] + tr["left"] + tr["width"] / 2, canvas["y"] + tr["top"] + tr["height"] / 2)


def test_spreadsheet_chart_from_cells(app_page, tmp_path):
    page = app_page("spreadsheet", init_script=INIT)
    page.evaluate("""() => { const ws = SS.workbook.getActiveSheet();
      ws.getRange('A1:C4').setValues([['', 'North', 'South'], ['Q1', 10, 4], ['Q2', 12, 6], ['Q3', 9, 8]]); ws.getRange('B2').activate(); }""")
    page.click("[data-testid=add-chart]")  # (a single cell: the table around it)
    page.wait_for_function("() => (SS.workbook.save().resources.find((x) => x.name === 'SHEET_DRAWING_PLUGIN') || {}).data?.includes('image/png')")
    [d] = sheet_drawings(page)
    m = model_of(d["source"])
    assert m["categories"] == ["Q1", "Q2", "Q3"] and [s["name"] for s in m["series"]] == ["North", "South"]
    assert m["series"][0]["values"] == [10, 12, 9] and m["source"]["range"] == "A1:C4" and m["type"] == "column"
    assert colored(d["source"]) > 200
    expect(page.locator("[data-testid=file-name]")).to_contain_text("•")

    # selected: "Edit chart"; the dialog changes type, title and data
    click_picture(page, d)
    page.click("[data-testid=edit-chart]")
    expect(page.locator("[data-testid=chart-dialog]")).to_be_visible()
    page.select_option("[data-testid=chart-type]", "line")
    page.fill("[data-testid=chart-title]", "Sales")
    page.locator("[data-testid=chart-cell]").nth(1).fill("20")  # (row Q1, South)
    page.locator("[data-testid=chart-cell]").nth(1).press("Tab")
    page.click("[data-testid=chart-ok]")
    page.wait_for_function("() => JSON.stringify(SS.workbook.save().resources).length && true")
    page.wait_for_timeout(500)
    [d2] = sheet_drawings(page)
    m = model_of(d2["source"])
    assert m["type"] == "line" and m["title"] == "Sales" and m["series"][1]["values"][0] == 20
    assert round(d2["width"]) == round(d["width"]) and round(d2["height"]) == round(d["height"])
    # changed cells: "Update from cells" takes them (keeping type and title)
    page.evaluate("SS.workbook.getActiveSheet().getRange('B4').setValue(99)")
    click_picture(page, d2)
    page.click("[data-testid=edit-chart]")
    page.click("[data-testid=chart-refresh]")
    page.click("[data-testid=chart-ok]")
    page.wait_for_timeout(500)
    m = model_of(sheet_drawings(page)[0]["source"])
    assert m["series"][0]["values"] == [10, 12, 99] and m["series"][1]["values"][0] == 4 and m["type"] == "line" and m["title"] == "Sales"

    # XLSX: the picture with its data; read again
    with page.expect_download() as dl:
        page.click("[data-testid=save]")
    path = tmp_path / "chart.xlsx"
    dl.value.save_as(path)
    page2 = app_page("spreadsheet", init_script=INIT)
    open_sheet(page2, path)
    page2.wait_for_function("() => (SS.workbook.save().resources.find((x) => x.name === 'SHEET_DRAWING_PLUGIN') || {}).data?.includes('image/png')", timeout=30000)
    assert model_of(sheet_drawings(page2)[0]["source"])["series"][0]["values"] == [10, 12, 99]
    assert page.errors == [] and page2.errors == []


def test_charts_of_excel_files(app_page, tmp_path):
    """openpyxl's charts (references without cached values: read from the cells) become chart pictures at their place."""
    import openpyxl
    from openpyxl.chart import BarChart, PieChart, Reference
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Data sheet"
    for row in [["Month", "Apples", "Pears"], ["Jan", 3, 5], ["Feb", 7, 2], ["Mar", 4, 6]]:
        ws.append(row)
    bar = BarChart()
    bar.type = "bar"
    bar.grouping = "stacked"
    bar.overlap = 100
    bar.title = "Fruit"
    bar.add_data(Reference(ws, min_col=2, min_row=1, max_col=3, max_row=4), titles_from_data=True)
    bar.set_categories(Reference(ws, min_col=1, min_row=2, max_row=4))
    ws.add_chart(bar, "E2")
    pie = PieChart()
    pie.add_data(Reference(ws, min_col=2, min_row=1, max_row=4), titles_from_data=True)
    pie.set_categories(Reference(ws, min_col=1, min_row=2, max_row=4))
    ws.add_chart(pie, "E20")
    path = tmp_path / "fruit.xlsx"
    wb.save(path)
    page = app_page("spreadsheet", init_script=INIT)
    open_sheet(page, path)
    page.wait_for_function("() => (SS.workbook.save().resources.find((x) => x.name === 'SHEET_DRAWING_PLUGIN') || {}).data?.split('image/png').length > 2", timeout=30000)
    drawings = sorted(sheet_drawings(page), key=lambda d: d["sheetTransform"]["from"]["row"])
    bar_m, pie_m = (model_of(d["source"]) for d in drawings)
    assert bar_m["type"] == "bar" and bar_m["stacked"] and bar_m["title"] == "Fruit" and bar_m["categories"] == ["Jan", "Feb", "Mar"]
    assert [(s["name"], s["values"]) for s in bar_m["series"]] == [("Apples", [3, 7, 4]), ("Pears", [5, 2, 6])]
    assert pie_m["type"] == "pie" and pie_m["series"][0]["values"] == [3, 7, 4]
    assert drawings[0]["sheetTransform"]["from"]["column"] == 4 and drawings[0]["sheetTransform"]["from"]["row"] == 1
    assert page.errors == []


def test_presentation_charts(app_page, tmp_path):
    from pptx import Presentation
    from pptx.chart.data import CategoryChartData
    from pptx.enum.chart import XL_CHART_TYPE
    from pptx.util import Inches
    page = ready(app_page)
    page.click("[data-testid=add-chart]")
    expect(page.locator("[data-testid=chart-dialog]")).to_be_visible()
    page.fill("[data-testid=chart-title]", "Plan")
    page.click("[data-testid=chart-add-series]")
    page.click("[data-testid=chart-ok]")
    expect(page.locator("[data-testid=stage] .el")).to_have_count(2)
    src = page.evaluate("PR.state.deck.slides[0].elements.at(-1).image.src")
    m = model_of(src)
    assert m["title"] == "Plan" and len(m["series"]) == 3 and m["categories"] == ["Q1", "Q2", "Q3", "Q4"]
    # a double click opens it again
    page.locator("[data-testid=stage] .el").last.dblclick()
    page.select_option("[data-testid=chart-type]", "pie")
    page.click("[data-testid=chart-ok]")
    assert model_of(page.evaluate("PR.state.deck.slides[0].elements.at(-1).image.src"))["type"] == "pie"
    expect(page.locator("[data-testid=edit-chart]")).to_be_visible()
    with page.expect_download() as dl:
        page.click("[data-testid=save]")
    pics = [s for s in Presentation(io.BytesIO(open(dl.value.path(), "rb").read())).slides[0].shapes if s.shape_type == 13]
    assert len(pics) == 1 and model_of(pics[0].image.blob)["type"] == "pie"

    # a PowerPoint chart (cached values) becomes a chart picture
    prs = Presentation()
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    data = CategoryChartData()
    data.categories = ["East", "West", "North"]
    data.add_series("2025", (19.2, 21.4, 16.7))
    data.add_series("2026", (22.3, 28.6, 15.2))
    slide.shapes.add_chart(XL_CHART_TYPE.LINE_MARKERS, Inches(1), Inches(1), Inches(6), Inches(4), data)
    path = tmp_path / "chart.pptx"
    prs.save(path)
    page2 = ready(app_page)
    open_deck(page2, path)
    el = page2.evaluate("PR.state.deck.slides[0].elements.at(-1)")
    m = model_of(el["image"]["src"])
    assert m["type"] == "line" and m["categories"] == ["East", "West", "North"] and m["series"][1]["values"] == [22.3, 28.6, 15.2]
    assert round(el["w"]) == 576 and colored(el["image"]["src"]) > 100
    assert page.errors == [] and page2.errors == []


def test_chart_dialog_on_a_phone(app_page):
    page = ready(app_page, mobile=True)
    page.locator("[data-testid=add-chart]").tap()
    dialog = page.locator("[data-testid=chart-dialog] article")
    expect(dialog).to_be_visible()
    box = dialog.bounding_box()
    assert box["x"] >= 0 and box["x"] + box["width"] <= page.viewport_size["width"] + 1
    page.locator("[data-testid=chart-ok]").tap()
    expect(page.locator("[data-testid=stage] .el")).to_have_count(2)
    assert page.errors == []
