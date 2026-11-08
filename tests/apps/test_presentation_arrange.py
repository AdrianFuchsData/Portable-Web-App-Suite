"""Presentation: several elements selected (Shift/Ctrl+click, marquee, Ctrl+A), align and distribute, group (p:grpSp in PPTX)."""
import io

from playwright.sync_api import expect
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE

from test_presentation import open_deck, ready

SHAPES = """() => { const sl = PR.state.deck.slides[PR.state.current];
  const box = (id, x, y, w, h, fill) => ({ id, type: 'shape', name: id, x, y, w, h, rot: 0, geometry: 'rect', fill, line: null, text: null });
  sl.elements = [box('a', 100, 60, 80, 50, '#FF0000'), box('b', 300, 150, 120, 70, '#00FF00'), box('c', 620, 260, 60, 90, '#0000FF')];
  PR.select(null); PR.render(); }"""
EMU = 9525


def boxes(page):
    return page.evaluate("Object.fromEntries(PR.state.deck.slides[PR.state.current].elements.map((e) => [e.id, [e.x, e.y, e.w, e.h, e.group || null]]))")


def el(page, id_):
    return page.locator(f"[data-testid=stage] .el[data-id={id_}]")


def click(page, id_, modifier=None):
    """A click on an element where a user clicks (with several selected, the selection's frame lies over the elements)."""
    box = el(page, id_).bounding_box()
    if modifier:
        page.keyboard.down(modifier)
    page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    if modifier:
        page.keyboard.up(modifier)


def test_select_align_distribute_group(app_page, tmp_path):
    page = ready(app_page)
    page.evaluate(SHAPES)
    expect(el(page, "c")).to_be_visible()
    # Shift+click: two elements
    click(page, "a")
    click(page, "b", "Shift")
    expect(page.locator("[data-testid=panel-title]")).to_have_text("2 elements selected")
    page.click("[data-testid=arrange-left]")
    b = boxes(page)
    assert b["a"][0] == b["b"][0] == 100 and b["c"][0] == 620
    page.click("[data-testid=undo]")
    assert boxes(page)["b"][0] == 300
    # Ctrl+click toggles one off again
    click(page, "a")
    click(page, "b", "Control")
    click(page, "b", "Control")
    assert page.evaluate("PR.selectionIds()") == ["a"]
    # one element: aligned to the slide
    page.click("[data-testid=arrange-right]")
    assert boxes(page)["a"][0] == 960 - 80
    page.click("[data-testid=undo]")

    # the marquee around all three (from the empty top left corner of the slide to below the last shape)
    stage = page.locator("[data-testid=stage] .pr-stage")
    sb = stage.bounding_box()
    k = sb["width"] / 960
    page.mouse.move(sb["x"] + 20 * k, sb["y"] + 20 * k)
    page.mouse.down()
    page.mouse.move(sb["x"] + 800 * k, sb["y"] + 400 * k, steps=6)
    page.mouse.up()
    assert sorted(page.evaluate("PR.selectionIds()")) == ["a", "b", "c"]
    expect(page.locator("[data-testid=marquee]")).to_have_count(0)
    page.click("[data-testid=distribute-h]")
    b = boxes(page)
    gaps = [b["b"][0] - (b["a"][0] + b["a"][2]), b["c"][0] - (b["b"][0] + b["b"][2])]
    assert b["a"][0] == 100 and b["c"][0] == 620 and abs(gaps[0] - gaps[1]) <= 1
    page.click("[data-testid=arrange-middle]")
    b = boxes(page)
    assert {round(v[1] + v[3] / 2) for v in b.values()} == {round(min(v[1] for v in b.values()) + (max(v[1] + v[3] for v in b.values()) - min(v[1] for v in b.values())) / 2)}

    # group: one click selects all members, they move together
    page.click("[data-testid=group]")
    b = boxes(page)
    assert b["a"][4] and b["a"][4] == b["b"][4] == b["c"][4]
    page.keyboard.press("Escape")
    click(page, "b")
    assert sorted(page.evaluate("PR.selectionIds()")) == ["a", "b", "c"]
    page.keyboard.press("ArrowRight")
    after = boxes(page)
    assert all(after[i][0] == b[i][0] + 1 for i in "abc")
    # a group alone aligns to the slide as one unit
    page.click("[data-testid=arrange-left]")
    after = boxes(page)
    assert min(v[0] for v in after.values()) == 0 and after["b"][0] - after["a"][0] == b["b"][0] - b["a"][0]

    # PPTX: a group shape with the three shapes; read again: still a group
    with page.expect_download() as d:
        page.click("[data-testid=save]")
    path = tmp_path / "grouped.pptx"
    d.value.save_as(path)
    prs = Presentation(str(path))
    groups = [s for s in prs.slides[0].shapes if s.shape_type == MSO_SHAPE_TYPE.GROUP]
    assert len(groups) == 1 and len(groups[0].shapes) == 3
    assert sorted(round(s.left / EMU) for s in groups[0].shapes) == sorted(round(v[0]) for v in after.values())
    page2 = ready(app_page)
    open_deck(page2, path)
    reopened = boxes(page2)
    assert len({v[4] for v in reopened.values()}) == 1 and None not in {v[4] for v in reopened.values()}
    assert sorted(round(v[0]) for v in reopened.values()) == sorted(round(v[0]) for v in after.values())

    # ungroup (Ctrl+Shift+G), Ctrl+A, delete
    page.keyboard.press("Control+Shift+g")
    assert {v[4] for v in boxes(page).values()} == {None}
    page.keyboard.press("Escape")
    page.keyboard.press("Control+a")
    assert len(page.evaluate("PR.selectionIds()")) == 3
    page.keyboard.press("Control+d")
    expect(page.locator("[data-testid=stage] .el")).to_have_count(6)
    page.keyboard.press("Delete")
    expect(page.locator("[data-testid=stage] .el")).to_have_count(3)
    assert page.errors == [] and page2.errors == []


def test_drag_several(app_page):
    page = ready(app_page)
    page.evaluate(SHAPES)
    click(page, "a")
    click(page, "c", "Shift")
    before = boxes(page)
    box = el(page, "a").bounding_box()
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.mouse.down()
    page.mouse.move(box["x"] + box["width"] / 2 + 50, box["y"] + box["height"] / 2 + 30, steps=8)
    page.mouse.up()
    after = boxes(page)
    da, dc = after["a"][0] - before["a"][0], after["c"][0] - before["c"][0]
    assert da > 10 and abs(da - dc) < 1 and after["b"] == before["b"]
    # a click (without moving) in the frame of the selection: only the element under the pointer – here b, not selected before
    click(page, "b")
    assert page.evaluate("PR.selectionIds()") == ["b"]
    assert page.errors == []


def test_phone(app_page):
    page = ready(app_page, mobile=True)
    page.evaluate(SHAPES)
    page.evaluate("PR.selectMany(['a', 'b'])")
    page.click("[data-testid=toggle-panels]")
    expect(page.locator("[data-testid=panel-title]")).to_have_text("2 elements selected")
    page.locator("[data-testid=arrange-top]").tap()
    b = boxes(page)
    assert b["a"][1] == b["b"][1] == 60
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert page.errors == []
