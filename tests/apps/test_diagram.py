"""Diagram editor (apps/diagram); draw.io files are written and checked with ElementTree/zlib."""
import base64
import json
import re
import struct
import urllib.parse
import xml.etree.ElementTree as ET
import zlib

from PIL import Image
from playwright.sync_api import expect

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"

MODEL = """<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="a" value="&lt;b&gt;Start&lt;/b&gt;&lt;br&gt;here" style="rounded=1;whiteSpace=wrap;html=1;arcSize=50;fillColor=#dae8fc;strokeColor=#6c8ebf;glass=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="g" value="" style="group" vertex="1" connectable="0" parent="1"><mxGeometry x="300" y="100" width="100" height="100" as="geometry"/></mxCell>
<mxCell id="b" value="Check?" style="rhombus;whiteSpace=wrap;html=1;" vertex="1" parent="g"><mxGeometry x="10" y="20" width="80" height="80" as="geometry"/></mxCell>
<mxCell id="e" value="yes" style="edgeStyle=orthogonalEdgeStyle;html=1;exitX=1;exitY=0.5;exitDx=0;exitDy=0;" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>
</root></mxGraphModel>"""


def compressed(xml):
    raw = zlib.compressobj(9, zlib.DEFLATED, -15)
    data = raw.compress(urllib.parse.quote(xml, safe="~()*!.'").encode()) + raw.flush()
    return base64.b64encode(data).decode()


def make_drawio(path):
    path.write_text(f'<mxfile host="test"><diagram id="p1" name="Flow">{compressed(MODEL)}</diagram>'
                    f'<diagram id="p2" name="Second"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>'
                    f'<mxCell id="x" value="Only" style="ellipse;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="80" height="80" as="geometry"/></mxCell>'
                    f'</root></mxGraphModel></diagram></mxfile>', encoding="utf-8")
    return path


def open_file(page, path):
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=open]")
    chooser.value.set_files(str(path))


def shapes(page):
    return page.evaluate("DG.page().shapes.map(s => ({ type: s.type, x: s.x, y: s.y, w: s.w, h: s.h, text: s.text, style: s.style, extra: s.extra }))")


def edges(page):
    return page.evaluate("DG.page().edges.map(e => ({ from: e.from, to: e.to, text: e.text, route: e.route, style: e.style }))")


def screen(page, x, y):
    box = page.locator("[data-testid=canvas]").bounding_box()
    v = page.evaluate("({ ...DG.app.view })")
    return box["x"] + v["x"] + x * v["zoom"], box["y"] + v["y"] + y * v["zoom"]


def drag(page, a, b, steps=8):
    page.mouse.move(*screen(page, *a))
    page.mouse.down()
    page.mouse.move(*screen(page, *b), steps=steps)
    page.mouse.up()


def save_download(page, tmp_path, selector="[data-testid=save]"):
    with page.expect_download() as d:
        page.click(selector)
    path = tmp_path / ("out-" + d.value.suggested_filename)
    d.value.save_as(path)
    return path


def cells(path):
    root = ET.parse(path).getroot()
    model = root.find("diagram/mxGraphModel")
    return [c for c in model.iter("mxCell") if (c.get("vertex") or c.get("edge")) and c.get("style") != "group"]


def test_create_connect_edit_and_save(app_page, tmp_path):
    page = app_page("diagram", init_script=NO_PICKERS)
    assert page.title().endswith("Diagram editor")
    page.click("[data-testid=shape-rect]")  # added at the centre of the view
    page.keyboard.press("Escape")
    rect = shapes(page)[0]
    page.keyboard.press("d")  # diamond tool: drag to create
    narrow = page.evaluate("matchMedia('(max-width: 760px)').matches")
    start = (rect["x"] + 40, rect["y"] + 140) if narrow else (rect["x"] + 200, rect["y"])  # below it on a phone (on screen)
    drag(page, start, (start[0] + 80, start[1] + 80))
    expect(page.locator("[data-testid=canvas] .dg-shape")).to_have_count(2)
    diamond = shapes(page)[1]
    assert diamond["type"] == "diamond" and (diamond["w"], diamond["h"]) == (80, 80)

    # drag from the right port of the rectangle onto the diamond
    page.keyboard.press("Escape")
    page.mouse.move(*screen(page, rect["x"] + 60, rect["y"] + 30))
    drag(page, (rect["x"] + rect["w"], rect["y"] + rect["h"] / 2), (diamond["x"] + 40, diamond["y"] + 40))
    [edge] = edges(page)
    assert edge["from"]["ax"] == 1 and edge["from"]["ay"] == 0.5 and "id" in edge["to"]

    # label the rectangle and the edge
    page.mouse.dblclick(*screen(page, rect["x"] + 60, rect["y"] + 30))
    page.fill("[data-testid=text-editor]", "Process\nstep")
    page.keyboard.press("Control+Enter")
    assert shapes(page)[0]["text"] == "Process\nstep"
    expect(page.locator("[data-testid=canvas] tspan").first).to_have_text("Process")

    path = save_download(page, tmp_path)
    assert path.name.endswith("diagram.drawio")
    cs = cells(path)
    vertices = [c for c in cs if c.get("vertex")]
    [e] = [c for c in cs if c.get("edge")]
    assert len(vertices) == 2
    assert vertices[0].get("value") == "Process&lt;br&gt;step" or vertices[0].get("value") == "Process<br>step"
    assert "rhombus" in vertices[1].get("style")
    assert e.get("source") == vertices[0].get("id") and e.get("target") == vertices[1].get("id")
    assert "exitX=1" in e.get("style") and "edgeStyle=orthogonalEdgeStyle" in e.get("style")
    assert page.errors == [] and page.requests == []


def test_open_compressed_drawio_with_pages_and_groups(app_page, tmp_path):
    page = app_page("diagram", init_script=NO_PICKERS)
    open_file(page, make_drawio(tmp_path / "flow.drawio"))
    expect(page.locator("[data-testid=page-name]")).to_have_text(["Flow", "Second"])
    s = shapes(page)
    assert [x["type"] for x in s] == ["terminator", "diamond"]
    assert s[0]["text"] == "Start\nhere" and s[0]["style"]["fill"] == "#dae8fc"
    assert (s[1]["x"], s[1]["y"]) == (310, 120)  # group offset applied
    [e] = edges(page)
    assert e["text"] == "yes" and e["route"] == "orthogonal" and e["from"]["ax"] == 1
    page.locator("[data-testid=page]", has_text="Second").click()
    expect(page.locator("[data-testid=canvas] .dg-shape")).to_have_count(1)

    # unknown style keys survive a round trip
    page.locator("[data-testid=page]", has_text="Flow").click()
    path = save_download(page, tmp_path)
    assert path.name.endswith("flow.drawio")
    root = ET.parse(path).getroot()
    assert [d.get("name") for d in root.iter("diagram")] == ["Flow", "Second"]
    first = [c for c in root.find("diagram/mxGraphModel").iter("mxCell") if c.get("vertex") and c.get("style") != "group"][0]
    assert "glass=1" in first.get("style") and "arcSize=50" in first.get("style")


def test_styles_arrange_undo(app_page, tmp_path):
    page = app_page("diagram", init_script=NO_PICKERS)
    for _ in range(3):
        page.click("[data-testid=shape-rect]")
    page.evaluate("DG.page().shapes.forEach((s, i) => { s.x = 40 + i * 150; s.y = 40 + i * 30; }); DG.app.selection = new Set([DG.page().shapes[0].id]);")
    page.click("[data-testid=zoom-fit]")
    page.fill("[data-testid=fmt-fill]", "#ff0000")
    page.check("[data-testid=fmt-stroke-none]")
    page.fill("[data-testid=fmt-font-size]", "20")
    page.click("[data-testid=fmt-bold]")
    st = shapes(page)[0]["style"]
    assert st["fill"] == "#ff0000" and st["stroke"] == "none" and st["fontSize"] == 20 and st["bold"]
    page.keyboard.press("Control+z")  # font size … one step per kind of change
    page.keyboard.press("Control+z")
    assert shapes(page)[0]["style"]["fontSize"] == 12
    page.keyboard.press("Control+y")
    assert shapes(page)[0]["style"]["fontSize"] == 20

    page.keyboard.press("Control+a")
    page.click("[data-testid=align-top]")
    assert {s["y"] for s in shapes(page)} == {40}
    page.evaluate("DG.page().shapes[1].x = 200")
    page.click("[data-testid=dist-h]")
    xs = [s["x"] for s in shapes(page)]
    assert xs[1] - (xs[0] + 120) == xs[2] - (xs[1] + 120)
    first_id = page.evaluate("DG.page().shapes[0].id")
    page.evaluate("id => { DG.app.selection = new Set([id]); DG.render(); }", first_id)
    page.select_option("[data-testid=fmt-type]", "ellipse")
    page.click("[data-testid=to-front]")
    assert page.evaluate("DG.page().shapes.at(-1).type") == "ellipse"


def test_move_resize_nudge_delete(app_page, tmp_path):
    page = app_page("diagram", init_script=NO_PICKERS)
    page.click("[data-testid=shape-rect]")
    page.click("[data-testid=shape-ellipse]")
    page.evaluate("const [a, b] = DG.page().shapes; Object.assign(a, { x: 40, y: 40 }); Object.assign(b, { x: 300, y: 40 });"
                  "DG.page().edges.push({ id: 'e1', from: { id: a.id }, to: { id: b.id }, text: '', route: 'straight', style: { stroke: '#000000', strokeWidth: 1, dash: false, startArrow: 'none', endArrow: 'classic', fontSize: 11, fontColor: '#000000', opacity: 1 }, extra: {} });"
                  "DG.app.selection = new Set();")
    page.click("[data-testid=zoom-fit]")
    page.click("[data-testid=zoom-out]")
    drag(page, (100, 70), (143, 117))  # moved by (43, 47) -> snapped to the grid
    a = shapes(page)[0]
    assert (a["x"], a["y"]) == (80, 90)
    drag(page, (a["x"] + a["w"], a["y"] + a["h"]), (a["x"] + 160, a["y"] + 100))  # south-east handle
    a = shapes(page)[0]
    assert (a["w"], a["h"]) == (160, 100)
    page.keyboard.press("ArrowRight")
    page.keyboard.press("Shift+ArrowDown")
    a = shapes(page)[0]
    assert (a["x"], a["y"]) == (81, 100)
    page.keyboard.press("Delete")  # removes the shape and its edge
    assert len(shapes(page)) == 1 and edges(page) == []


def test_copy_paste_duplicate(app_page):
    page = app_page("diagram", init_script=NO_PICKERS)
    page.click("[data-testid=shape-rect]")
    page.click("[data-testid=shape-diamond]")
    page.keyboard.press("Control+a")
    page.keyboard.press("Control+c")
    page.keyboard.press("Control+v")
    expect(page.locator("[data-testid=canvas] .dg-shape")).to_have_count(4)
    s = shapes(page)
    assert (s[2]["x"] - s[0]["x"], s[2]["y"] - s[0]["y"]) == (20, 20)
    page.keyboard.press("Control+d")
    expect(page.locator("[data-testid=canvas] .dg-shape")).to_have_count(6)
    assert len({page.evaluate("DG.page().shapes.map(s => s.id).join()")}) == 1
    assert len(set(page.evaluate("DG.page().shapes.map(s => s.id)"))) == 6


def test_edges_routing_and_arrows(app_page):
    page = app_page("diagram", init_script=NO_PICKERS)
    page.click("[data-testid=shape-rect]")
    page.click("[data-testid=shape-rect]")
    page.evaluate("const [a, b] = DG.page().shapes; Object.assign(a, { x: 0, y: 0 }); Object.assign(b, { x: 300, y: 200 });"
                  "DG.app.tool = 'edge';")
    page.click("[data-testid=zoom-fit]")
    page.evaluate("DG.app.tool = 'edge'")
    drag(page, (60, 30), (360, 230))
    [e] = edges(page)
    assert e["route"] == "orthogonal"
    expect(page.locator("[data-testid=canvas] .dg-edge path").nth(1)).to_have_attribute("d", re.compile(r"^M[^L]*(L[^L]*){3}$"))  # elbow with two bends
    page.select_option("[data-testid=fmt-route]", "curved")
    expect(page.locator("[data-testid=canvas] .dg-edge path").nth(1)).to_have_attribute("d", re.compile("C"))
    page.select_option("[data-testid=fmt-start-arrow]", "diamond")
    page.select_option("[data-testid=fmt-end-arrow]", "none")
    assert edges(page)[0]["style"]["startArrow"] == "diamond" and edges(page)[0]["style"]["endArrow"] == "none"
    # detach the end: drag the end handle into empty space
    end = page.locator("[data-testid=edge-to]").bounding_box()
    page.mouse.move(end["x"] + end["width"] / 2, end["y"] + end["height"] / 2)
    page.mouse.down()
    page.mouse.move(*screen(page, 600, 450), steps=5)  # empty space
    page.mouse.up()
    assert "x" in edges(page)[0]["to"] and "id" not in edges(page)[0]["to"]


def test_export_svg_png_and_reopen(app_page, tmp_path):
    page = app_page("diagram", init_script=NO_PICKERS)
    open_file(page, make_drawio(tmp_path / "flow.drawio"))
    expect(page.locator("[data-testid=page]")).to_have_count(2)
    svg = save_download(page, tmp_path, "[data-testid=export-svg]")
    assert svg.name.endswith("flow.drawio.svg")
    root = ET.parse(svg).getroot()
    assert root.tag.endswith("svg") and "<mxfile" in root.get("content")
    assert "Check?" in svg.read_text(encoding="utf-8")
    png = save_download(page, tmp_path, "[data-testid=export-png]")
    img = Image.open(png)
    assert img.format == "PNG" and img.width > 300
    assert "<mxfile" in urllib.parse.unquote(img.text["mxfile"])

    for path in (svg, png):
        other = app_page("diagram", init_script=NO_PICKERS)
        open_file(other, path)
        expect(other.locator("[data-testid=page-name]")).to_have_text(["Flow", "Second"])
        assert [x["type"] for x in shapes(other)] == ["terminator", "diamond"]


def test_excalidraw_import(app_page, tmp_path):
    data = {"type": "excalidraw", "version": 2, "elements": [
        {"id": "r", "type": "rectangle", "x": 10, "y": 20, "width": 100, "height": 50, "strokeColor": "#1e1e1e", "backgroundColor": "#a5d8ff", "strokeWidth": 2, "strokeStyle": "solid", "roundness": None, "opacity": 100},
        {"id": "t", "type": "text", "x": 20, "y": 30, "width": 50, "height": 20, "text": "Box", "fontSize": 16, "containerId": "r", "strokeColor": "#1e1e1e"},
        {"id": "o", "type": "ellipse", "x": 300, "y": 20, "width": 80, "height": 80, "strokeColor": "#e03131", "backgroundColor": "transparent", "strokeStyle": "dashed"},
        {"id": "a", "type": "arrow", "x": 110, "y": 45, "width": 190, "height": 0, "points": [[0, 0], [190, 0]], "startBinding": {"elementId": "r"}, "endBinding": {"elementId": "o"}, "endArrowhead": "arrow", "strokeColor": "#1e1e1e"},
        {"id": "gone", "type": "rectangle", "x": 0, "y": 0, "width": 1, "height": 1, "isDeleted": True},
    ]}
    path = tmp_path / "sketch.excalidraw"
    path.write_text(json.dumps(data))
    page = app_page("diagram", init_script=NO_PICKERS)
    open_file(page, path)
    expect(page.locator("[data-testid=canvas] .dg-shape")).to_have_count(2)
    s = shapes(page)
    assert s[0]["text"] == "Box" and s[0]["style"]["fill"] == "#a5d8ff" and s[1]["style"]["dash"] and s[1]["style"]["fill"] == "none"
    [e] = edges(page)
    assert e["from"]["id"] and e["to"]["id"] and e["style"]["endArrow"] == "classic"
    with page.expect_download() as d:
        page.click("[data-testid=save]")
    assert d.value.suggested_filename == "sketch.drawio"


def test_pages(app_page):
    page = app_page("diagram", init_script=NO_PICKERS)
    page.click("[data-testid=add-page]")
    expect(page.locator("[data-testid=page-name]")).to_have_text(["Page-1", "Page-2"])
    page.click("[data-testid=shape-ellipse]")
    page.locator("[data-testid=page]").nth(1).dblclick()
    page.fill("[data-testid=page-name-input]", "Details")
    page.press("[data-testid=page-name-input]", "Enter")
    expect(page.locator("[data-testid=page]").nth(1)).to_contain_text("Details")
    page.locator("[data-testid=page]").first.click()
    expect(page.locator("[data-testid=canvas] .dg-shape")).to_have_count(0)
    page.locator("[data-testid=page]").nth(1).click()
    expect(page.locator("[data-testid=canvas] .dg-shape")).to_have_count(1)
    page.click("[data-testid=delete-page]")
    page.click("[data-testid=confirm-ok]")
    expect(page.locator("[data-testid=page-name]")).to_have_text(["Page-1"])


def test_german_interface(app_page):
    page = app_page("diagram", init_script="localStorage.setItem('suite.lang', 'de');")
    expect(page.locator("[data-testid=save]")).to_have_text("Speichern")
    expect(page.locator("[data-testid=shape-diamond]")).to_have_attribute("title", "Entscheidung")


def test_mobile_layout(app_page):
    page = app_page("diagram", mobile=True, init_script=NO_PICKERS)
    page.locator("[data-testid=shape-rect]").tap()
    expect(page.locator("[data-testid=canvas] .dg-shape")).to_have_count(1)
    expect(page.locator("[data-testid=format]")).to_be_hidden()
    page.locator("[data-testid=toggle-panels]").tap()
    expect(page.locator("[data-testid=format]")).to_be_visible()
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert page.errors == []


def test_print(app_page, tmp_path):
    page = app_page("diagram", init_script=NO_PICKERS + "window.print = () => { window.printed = document.getElementById('dg-print').innerHTML; };")
    page.click("[data-testid=print]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("empty")
    open_file(page, make_drawio(tmp_path / "flow.drawio"))
    expect(page.locator("[data-testid=page-name]")).to_have_text(["Flow", "Second"])
    page.click("[data-testid=print]")
    printed = page.evaluate("window.printed")
    assert printed.count('class="dg-print-page"') == 2  # every page on its own sheet
    assert "flow – Flow" in printed and "flow – Second" in printed and printed.count("<svg") == 2
    # only the sheets are shown in print, and the container is removed afterwards
    page.evaluate("document.body.append(Object.assign(document.createElement('div'), { id: 'dg-print', innerHTML: window.printed }))")
    page.emulate_media(media="print")
    expect(page.locator("#dg-print svg").first).to_be_visible()
    expect(page.locator("[data-testid=canvas]")).to_be_hidden()
    page.emulate_media(media="screen")
    page.wait_for_function("() => document.querySelectorAll('#dg-print').length === 1")  # the app removed its own copy
    assert page.errors == []


MERMAID = """flowchart LR
  %% a comment
  A[Start] --> B{Is it ok?}
  B -->|yes| C([Done])
  B -- no --> D[(Database)]
  D -.-> A
  C & D ==> E((End))
  E --- F[/Input/]
  click A callback
  classDef red fill:#f00
"""


def test_mermaid_import_and_layout(app_page, tmp_path):
    page = app_page("diagram", init_script=NO_PICKERS)
    r = page.evaluate("(t) => DG.parseMermaid(t)", MERMAID)
    assert r["direction"] == "LR"
    assert {n["id"]: (n["type"], n["text"]) for n in r["nodes"]} == {
        "A": ("rect", "Start"), "B": ("diamond", "Is it ok?"), "C": ("terminator", "Done"), "D": ("cylinder", "Database"),
        "E": ("ellipse", "End"), "F": ("parallelogram", "Input")}
    links = [(e["from"], e["to"], e["text"], e["dash"], e["thick"], e["endArrow"]) for e in r["edges"]]
    assert links == [("A", "B", "", False, False, "classic"), ("B", "C", "yes", False, False, "classic"), ("B", "D", "no", False, False, "classic"),
                     ("D", "A", "", True, False, "classic"), ("C", "E", "", False, True, "classic"), ("D", "E", "", False, True, "classic"),
                     ("E", "F", "", False, False, "none")]
    # insert through the dialog: laid out left to right, without overlaps
    page.click("[data-testid=mermaid]")
    page.fill("[data-testid=mermaid-text]", MERMAID)
    page.click("[data-testid=mermaid-insert]")
    expect(page.locator("[data-testid=mermaid-dialog]")).to_have_count(0)
    s = {x["text"]: x for x in shapes(page)}
    assert len(s) == 6 and len(edges(page)) == 7
    assert s["Start"]["x"] < s["Is it ok?"]["x"] < s["Done"]["x"] < s["End"]["x"] < s["Input"]["x"]
    boxes = list(s.values())
    for i, a in enumerate(boxes):
        for b in boxes[i + 1:]:
            assert a["x"] + a["w"] <= b["x"] or b["x"] + b["w"] <= a["x"] or a["y"] + a["h"] <= b["y"] or b["y"] + b["h"] <= a["y"]
    # automatic layout top to bottom, undo
    page.locator("[data-testid=canvas]").click(position={"x": 5, "y": 5})
    page.select_option("[data-testid=auto-layout]", "TB")
    s2 = {x["text"]: x for x in shapes(page)}
    assert s2["Start"]["y"] < s2["Is it ok?"]["y"] < s2["Done"]["y"] < s2["End"]["y"] < s2["Input"]["y"]
    page.keyboard.press("Control+z")
    assert shapes(page)[0]["x"] == s["Start"]["x"]
    # a .mmd file opens as a diagram; invalid text gives a message
    mmd = tmp_path / "flow.mmd"
    mmd.write_text("graph TD\n  X --> Y\n", encoding="utf-8")
    page.evaluate("DG.app.dirty = false")
    open_file(page, mmd)
    expect(page.locator("[data-testid=canvas] .dg-shape")).to_have_count(2)
    assert [x["text"] for x in shapes(page)] == ["X", "Y"]
    page.locator("[data-testid=canvas]").click(position={"x": 5, "y": 5})
    page.click("[data-testid=mermaid]")
    page.fill("[data-testid=mermaid-text]", "sequenceDiagram\n A->>B: hi")
    page.click("[data-testid=mermaid-insert]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("only Mermaid flowcharts")
    assert page.errors == []



LAYERED = """<mxGraphModel><root><mxCell id="0"/><mxCell id="1" value="Hintergrund" parent="0"/>
<mxCell id="L2" value="Notizen" style="locked=1;" parent="0"/><mxCell id="L3" value="Versteckt" parent="0" visible="0"/>
<mxCell id="a" value="A" style="rounded=0;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="80" height="40" as="geometry"/></mxCell>
<mxCell id="g" value="" style="group" vertex="1" connectable="0" parent="1"><mxGeometry x="200" y="40" width="200" height="60" as="geometry"/></mxCell>
<mxCell id="b" value="B" style="rounded=0;" vertex="1" parent="g"><mxGeometry x="0" y="0" width="80" height="40" as="geometry"/></mxCell>
<mxCell id="c" value="C" style="rounded=0;" vertex="1" parent="g"><mxGeometry x="120" y="20" width="80" height="40" as="geometry"/></mxCell>
<mxCell id="n" value="Note" style="shape=note;" vertex="1" parent="L2"><mxGeometry x="40" y="200" width="80" height="40" as="geometry"/></mxCell>
<mxCell id="h" value="Hidden" style="ellipse;" vertex="1" parent="L3"><mxGeometry x="200" y="200" width="80" height="40" as="geometry"/></mxCell>
<mxCell id="k" value="Fixed" style="rounded=0;locked=1;" vertex="1" parent="1"><mxGeometry x="400" y="200" width="80" height="40" as="geometry"/></mxCell>
</root></mxGraphModel>"""


def test_layers_groups_and_locking(app_page, tmp_path):
    path = tmp_path / "layers.drawio"
    path.write_text(f'<mxfile host="test"><diagram id="p1" name="Layers">{LAYERED}</diagram></mxfile>', encoding="utf-8")
    page = app_page("diagram", init_script=NO_PICKERS)
    open_file(page, path)
    expect(page.locator("[data-testid=layer-name]")).to_have_text(["Versteckt", "Notizen", "Hintergrund"])  # top layer first
    expect(page.locator("[data-testid=canvas] .dg-shape")).to_have_count(5)  # the hidden layer is not drawn
    by_text = lambda t: page.evaluate("(t) => DG.page().shapes.find((s) => s.text === t)", t)
    assert (by_text("C")["x"], by_text("C")["y"]) == (320, 60) and by_text("B")["group"] == by_text("C")["group"]
    # a click on a group member selects the group; moving moves both
    page.mouse.click(*screen(page, 240, 60))
    assert page.evaluate("DG.app.selection.size") == 2
    drag(page, (240, 60), (240, 100))
    assert by_text("C")["y"] == 100 and by_text("A")["y"] == 40
    # Alt+click selects one member
    page.keyboard.press("Escape")
    page.keyboard.down("Alt")
    page.mouse.click(*screen(page, 240, 100))
    page.keyboard.up("Alt")
    assert page.evaluate("DG.app.selection.size") == 1
    # locked shapes and shapes on locked layers cannot be selected (not even with Ctrl+A)
    page.mouse.click(*screen(page, 440, 220))
    assert page.evaluate("DG.app.selection.size") == 0
    page.mouse.click(*screen(page, 80, 220))
    assert page.evaluate("DG.app.selection.size") == 0
    page.keyboard.press("Control+a")
    assert page.evaluate("DG.app.selection.size") == 3
    # ungroup, group again with Ctrl+G
    page.keyboard.press("Control+Shift+g")
    assert by_text("B").get("group") is None
    page.keyboard.press("Escape")
    page.mouse.click(*screen(page, 80, 60))
    page.keyboard.down("Shift")
    page.mouse.click(*screen(page, 240, 100))
    page.keyboard.up("Shift")
    page.keyboard.press("Control+g")
    assert by_text("A")["group"] and by_text("A")["group"] == by_text("B")["group"]
    # lock with Ctrl+L, unlock all in the diagram panel
    page.keyboard.press("Control+l")
    assert by_text("A")["locked"] and page.evaluate("DG.app.selection.size") == 0
    page.click("[data-testid=unlock-all]")
    assert not by_text("A").get("locked") and not by_text("Fixed").get("locked")
    # layers: unlock and show, a new layer becomes the active one for new shapes, delete it again
    page.keyboard.press("Escape")
    layer = lambda name: page.locator("[data-testid=layer]").filter(has=page.locator("[data-testid=layer-name]", has_text=name))
    layer("Notizen").locator("[data-testid=layer-locked]").click()
    layer("Versteckt").locator("[data-testid=layer-visible]").click()
    expect(page.locator("[data-testid=canvas] .dg-shape")).to_have_count(6)
    page.click("[data-testid=add-layer]")
    expect(page.locator("[data-testid=layer]")).to_have_count(4)
    page.click("[data-testid=shape-rect]")
    new_layer = page.evaluate("DG.page().layers.at(-1).id")
    assert page.evaluate("DG.page().shapes.at(-1).layer") == new_layer
    page.keyboard.press("Escape")
    layer("Hintergrund").locator("[data-testid=layer-up]").click()
    assert page.evaluate("DG.page().layers.map((l) => l.name)")[1] == "Hintergrund"
    # save: layers, groups (relative geometry) and locks are draw.io cells
    # (on phones the layers drawer covers the canvas now: select through the test hook)
    page.evaluate("DG.app.selection = new Set([DG.page().shapes.find((s) => s.text === 'Fixed').id]); DG.lockSelection()")
    out = save_download(page, tmp_path)
    model = ET.parse(out).getroot().find("diagram/mxGraphModel")
    all_cells = list(model.iter("mxCell"))
    layers = [c for c in all_cells if c.get("parent") == "0"]
    assert [c.get("value") for c in layers][:3] == ["Notizen", "Hintergrund", "Versteckt"] and len(layers) == 4  # bottom first
    group_cells = [c for c in all_cells if c.get("style") == "group"]
    assert len(group_cells) == 1
    members = [c for c in all_cells if c.get("parent") == group_cells[0].get("id")]
    assert sorted(c.get("value") for c in members) == ["A", "B"]
    gx = float(group_cells[0].find("mxGeometry").get("x"))
    assert gx == 40 and float([c for c in members if c.get("value") == "B"][0].find("mxGeometry").get("x")) == 160  # relative to the group
    fixed = [c for c in all_cells if c.get("value") == "Fixed"][0]
    assert "locked=1" in fixed.get("style")
    # and opened again
    page2 = app_page("diagram", init_script=NO_PICKERS)
    open_file(page2, out)
    expect(page2.locator("[data-testid=layer]")).to_have_count(4)
    assert page2.evaluate("(() => { const s = DG.page().shapes; const a = s.find((x) => x.text === 'A'), b = s.find((x) => x.text === 'B'); return [a.group === b.group, b.x, s.find((x) => x.text === 'Fixed').locked]; })()") == [True, 200, True]
    assert page.errors == [] and page2.errors == []


def test_shape_libraries_and_er_arrows(app_page, tmp_path):
    page = app_page("diagram", init_script=NO_PICKERS)
    for lib, types in (("uml", ["class", "package", "component"]), ("bpmn", ["event-start", "event-intermediate", "event-end", "gateway", "pool"]),
                       ("network", ["server", "computer", "firewall", "router"]), ("er", ["entity"])):
        page.locator(f"[data-testid=library-{lib}] summary").click()
        for t in types:
            page.click(f"[data-testid=shape-{lib}-{t}]")
    kinds = page.evaluate("DG.page().shapes.map((s) => s.type)")
    assert kinds == ["class", "package", "component", "event-start", "event-intermediate", "event-end", "gateway", "pool", "server", "computer", "firewall", "router", "entity"]
    cls = page.evaluate("DG.page().shapes[0]")
    assert cls["text"].startswith("Class\n") and "--" in cls["text"] and (cls["w"], cls["h"]) == (160, 90)
    assert page.evaluate("DG.page().shapes[5].style.strokeWidth") == 3  # the end event has a thick line
    # an ER relation with crow's foot ends, a UML generalisation
    page.evaluate("""() => { const p = DG.page(); const [c, , , , , , , , , , , , e] = p.shapes;
      p.edges.push({ id: 'r1', from: { id: e.id }, to: { id: c.id }, text: '', route: 'straight', extra: {}, style: { stroke: '#000000', strokeWidth: 1, dash: false, startArrow: 'er-mand-one', endArrow: 'er-zero-many', fontSize: 11, fontColor: '#000000', opacity: 1 } });
      p.edges.push({ id: 'r2', from: { id: p.shapes[1].id }, to: { id: c.id }, text: '', route: 'straight', extra: {}, style: { stroke: '#000000', strokeWidth: 1, dash: false, startArrow: 'none', endArrow: 'block-open', fontSize: 11, fontColor: '#000000', opacity: 1 } });
      DG.render(); }""")
    expect(page.locator("[data-testid=canvas] .dg-edge")).to_have_count(2)
    expect(page.locator("[data-testid=canvas] .dg-shape").first.locator("text").first).to_have_text("Class")
    # draw.io round trip: types, compartment labels and arrow names
    path = save_download(page, tmp_path)
    model = ET.parse(path).getroot().find("diagram/mxGraphModel")
    cells_ = {c.get("id"): c for c in model.iter("mxCell")}
    styles = [c.get("style") or "" for c in model.iter("mxCell") if c.get("vertex")]
    assert any("shape=mxgraph.networks.server" in s for s in styles) and any("shape=folder" in s for s in styles) and any("swimlane" in s for s in styles)
    cls_cell = [c for c in model.iter("mxCell") if "dgType=class" in (c.get("style") or "")][0]
    assert "<b>Class</b>" in cls_cell.get("value") and cls_cell.get("value").count("<hr") == 2
    r1, r2 = cells_["r1"].get("style"), cells_["r2"].get("style")
    assert "startArrow=ERmandOne" in r1 and "endArrow=ERzeroToMany" in r1
    assert "endArrow=block" in r2 and "endFill=0" in r2
    page2 = app_page("diagram", init_script=NO_PICKERS)
    open_file(page2, path)
    expect(page2.locator("[data-testid=canvas] .dg-shape")).to_have_count(13)
    assert page2.evaluate("DG.page().shapes.map((s) => s.type)") == kinds
    assert page2.evaluate("DG.page().shapes[0].text") == cls["text"]
    assert page2.evaluate("DG.page().edges.map((e) => [e.style.startArrow, e.style.endArrow])") == [["er-mand-one", "er-zero-many"], ["none", "block-open"]]
    assert page.errors == [] and page2.errors == []
