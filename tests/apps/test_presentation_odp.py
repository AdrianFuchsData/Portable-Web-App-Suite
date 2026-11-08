"""Presentation: OpenDocument presentations (shared/js/odp.js) – saved and opened again, and with LibreOffice in both directions."""
import shutil
import subprocess
import zipfile

import pytest
from playwright.sync_api import expect

from test_presentation import PNG, open_deck, ready

DECK = """() => {
  const hex = 'PNGHEX';
  const png = 'data:image/png;base64,' + btoa(String.fromCharCode(...hex.match(/../g).map((h) => parseInt(h, 16))));
  const run = (text, extra = {}) => ({ text, size: 20, bold: false, italic: false, underline: false, strike: false, color: '#000000', font: 'Arial', ...extra });
  const para = (runs, extra = {}) => ({ align: 'l', level: 0, bullet: null, runs, ...extra });
  PR.state.deck = { width: 960, height: 540, slides: [
    { id: 's1', background: '#FFF2CC', notes: 'Say hello\\nand smile', elements: [
      { id: 't1', type: 'text', name: 'Title', x: 60, y: 40, w: 840, h: 80, rot: 0, geometry: 'rect', fill: null, line: null,
        text: { anchor: 'ctr', insets: [9.6, 4.8, 9.6, 4.8], paragraphs: [para([run('Quarterly ', { size: 36 }), run('report', { size: 36, bold: true, color: '#C00000' })], { align: 'ctr' })] } },
      { id: 't2', type: 'text', name: 'Body', x: 60, y: 140, w: 400, h: 200, rot: 0, geometry: 'rect', fill: null, line: null,
        text: { anchor: 't', insets: [9.6, 4.8, 9.6, 4.8], paragraphs: [
          para([run('First')], { bullet: { auto: 'arabicPeriod' } }), para([run('Detail')], { bullet: { char: '•' }, level: 1 }), para([run('Second')], { bullet: { auto: 'arabicPeriod' } }),
          para([run('Plain, slide '), run('1', { field: 'slidenum', fieldType: 'slidenum' })])] } },
      { id: 'b1', type: 'shape', name: 'Box', x: 520, y: 150, w: 200, h: 100, rot: 30, geometry: 'roundRect', fill: '#4472C4', line: { color: '#203864', width: 2 },
        text: { anchor: 'ctr', insets: [9.6, 4.8, 9.6, 4.8], paragraphs: [para([run('In a box', { color: '#FFFFFF' })], { align: 'ctr' })] } },
      { id: 'e1', type: 'shape', name: 'Dot', x: 760, y: 300, w: 80, h: 80, rot: 0, geometry: 'ellipse', fill: '#70AD47', line: null, text: null, group: 'g1' },
      { id: 'e2', type: 'shape', name: 'Dot 2', x: 850, y: 300, w: 80, h: 80, rot: 0, geometry: 'ellipse', fill: '#ED7D31', line: null, text: null, group: 'g1' },
      { id: 'i1', type: 'image', name: 'Pic', x: 60, y: 380, w: 100, h: 100, rot: 0, geometry: 'rect', fill: null, line: null, text: null, image: { src: png } },
      { id: 'tb', type: 'table', name: 'Table', x: 520, y: 380, w: 300, h: 60, rot: 0, geometry: 'rect', fill: null, line: null, text: null,
        table: { columns: [150, 150], rows: [{ height: 30, cells: [{ text: { anchor: 't', insets: [4.8, 2.4, 4.8, 2.4], paragraphs: [para([run('A1')])] }, fill: '#DDEBF7' }, { text: { anchor: 't', insets: [4.8, 2.4, 4.8, 2.4], paragraphs: [para([run('B1')])] }, fill: null }] },
          { height: 30, cells: [{ text: { anchor: 't', insets: [4.8, 2.4, 4.8, 2.4], paragraphs: [para([run('A2')])] }, fill: null }, { text: { anchor: 't', insets: [4.8, 2.4, 4.8, 2.4], paragraphs: [para([run('B2')])] }, fill: null }] }] } },
    ] },
    { id: 's2', background: '#FFFFFF', hidden: true, elements: [] },
  ] };
  PR.select(null); PR.render();
}"""


def build(page):
    page.evaluate(DECK.replace("PNGHEX", PNG.hex()))


def save_odp(page, tmp_path, name="deck"):
    page.click("[data-testid=save-as]")
    page.fill("[data-testid=save-as-name]", name)
    page.select_option("[data-testid=save-as-format]", "odp")
    with page.expect_download() as d:
        page.click("[data-testid=save-as-ok]")
    assert d.value.suggested_filename == f"{name}.odp"
    path = tmp_path / f"{name}.odp"
    d.value.save_as(path)
    return path


def deck(page):
    return page.evaluate("PR.state.deck")


def test_odp_round_trip(app_page, tmp_path):
    page = ready(app_page)
    build(page)
    path = save_odp(page, tmp_path)
    with zipfile.ZipFile(path) as z:
        assert z.namelist()[0] == "mimetype" and z.read("mimetype") == b"application/vnd.oasis.opendocument.presentation"
        assert any(n.startswith("Pictures/") for n in z.namelist())
    expect(page.locator("[data-testid=file-name]")).to_have_text("deck.odp")

    page2 = ready(app_page)
    open_deck(page2, path)
    d = deck(page2)
    assert (d["width"], d["height"]) == (960, 540) and len(d["slides"]) == 2 and d["slides"][1].get("hidden") is True
    s = d["slides"][0]
    assert s["background"] == "#FFF2CC" and s["notes"] == "Say hello\nand smile"
    by = {e["name"]: e for e in s["elements"]}
    title = by["Title"]["text"]
    assert [(r["text"], r["bold"], r["color"], r["size"]) for r in title["paragraphs"][0]["runs"]] == [("Quarterly ", False, "#000000", 36), ("report", True, "#C00000", 36)]
    assert title["paragraphs"][0]["align"] == "ctr" and title["anchor"] == "ctr"
    body = by["Body"]["text"]["paragraphs"]
    assert [(p["runs"][0]["text"], p["level"], p["bullet"]) for p in body[:3]] == [("First", 0, {"auto": "arabicPeriod"}), ("Detail", 1, {"char": "•"}), ("Second", 0, {"auto": "arabicPeriod"})]
    assert body[3]["bullet"] is None and body[3]["runs"][-1].get("field") == "slidenum"
    box = by["Box"]
    assert box["geometry"] == "roundRect" and box["fill"] == "#4472C4" and box["line"]["color"] == "#203864" and round(box["rot"]) == 30
    assert all(abs(box[k] - v) < 1 for k, v in {"x": 520, "y": 150, "w": 200, "h": 100}.items())
    assert box["text"]["paragraphs"][0]["runs"][0]["text"] == "In a box"
    assert by["Dot"]["group"] and by["Dot"]["group"] == by["Dot 2"]["group"] and by["Dot"]["geometry"] == "ellipse"
    assert by["Pic"]["image"]["src"].startswith("data:image/png;base64,")
    cells = [[c["text"]["paragraphs"][0]["runs"][0]["text"] for c in r["cells"]] for r in by["Table"]["table"]["rows"]]
    assert cells == [["A1", "B1"], ["A2", "B2"]] and by["Table"]["table"]["rows"][0]["cells"][0]["fill"] == "#DDEBF7"
    # saved again in its format
    with page2.expect_download() as d2:
        page2.click("[data-testid=save]")
    assert d2.value.suggested_filename == "deck.odp"
    assert page.errors == [] and page2.errors == []


@pytest.mark.skipif(not shutil.which("soffice"), reason="LibreOffice is not installed")
def test_odp_with_libreoffice(app_page, tmp_path):
    from pptx import Presentation
    from pptx.util import Inches, Pt
    page = ready(app_page)
    build(page)
    ours = save_odp(page, tmp_path, "ours")
    out = tmp_path / "lo"
    subprocess.run(["soffice", "--headless", "--convert-to", "pptx", "--outdir", str(out), str(ours)], check=True, capture_output=True, timeout=180)
    prs = Presentation(str(out / "ours.pptx"))
    texts = {s.text_frame.text for s in prs.slides[0].shapes if s.has_text_frame}
    assert "Quarterly report" in texts and "In a box" in texts
    assert any(s.has_table and s.table.cell(1, 1).text == "B2" for s in prs.slides[0].shapes)
    assert prs.slides[0].notes_slide.notes_text_frame.text.startswith("Say hello")

    # LibreOffice's own ODP (from a PowerPoint file): text, shapes and picture where they were
    src = Presentation()
    src.slide_width, src.slide_height = Inches(10), Inches(5.625)
    sl = src.slides.add_slide(src.slide_layouts[6])
    tb = sl.shapes.add_textbox(Inches(1), Inches(1), Inches(4), Inches(1))
    tb.text_frame.text = "From LibreOffice"
    tb.text_frame.paragraphs[0].runs[0].font.size = Pt(28)
    tb.text_frame.paragraphs[0].runs[0].font.bold = True
    shape = sl.shapes.add_shape(9, Inches(6), Inches(1), Inches(2), Inches(2))  # oval
    shape.fill.solid()
    from pptx.dml.color import RGBColor
    shape.fill.fore_color.rgb = RGBColor(0x70, 0xAD, 0x47)
    (tmp_path / "dot.png").write_bytes(PNG)
    sl.shapes.add_picture(str(tmp_path / "dot.png"), Inches(1), Inches(3), Inches(1), Inches(1))
    src.save(tmp_path / "lo-source.pptx")
    subprocess.run(["soffice", "--headless", "--convert-to", "odp", "--outdir", str(out), str(tmp_path / "lo-source.pptx")], check=True, capture_output=True, timeout=180)
    page2 = ready(app_page)
    open_deck(page2, out / "lo-source.odp")
    d = deck(page2)
    assert (d["width"], d["height"]) == (960, 540)
    els = d["slides"][0]["elements"]
    text = next(e for e in els if e["type"] == "text" and e["text"] and "From LibreOffice" in "".join(r["text"] for p in e["text"]["paragraphs"] for r in p["runs"]))
    run = next(r for p in text["text"]["paragraphs"] for r in p["runs"] if r["text"].strip())
    assert run["bold"] and run["size"] == 28 and abs(text["y"] - 96) < 2 and 90 < text["x"] < 130  # (LibreOffice moves the auto-sized text box a bit)
    oval = next(e for e in els if e["type"] == "shape")
    assert oval["geometry"] == "ellipse" and oval["fill"] == "#70AD47" and abs(oval["x"] - 576) < 2
    assert any(e["type"] == "image" and abs(e["y"] - 288) < 2 for e in els)
    assert page.errors == [] and page2.errors == []
