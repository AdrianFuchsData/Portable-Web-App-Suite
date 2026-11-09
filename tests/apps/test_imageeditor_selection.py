"""Image editor: the selection as an amount per pixel (feather, grow, shrink, border); painting, filters, copy and move through
partly selected pixels."""
from playwright.sync_api import expect

from test_imageeditor import NO_PICKERS, drag, expect_pixel, make_png, menu, open_image, pixel


def ready(app_page, tmp_path, size=(100, 60), color=(255, 255, 255)):
    page = app_page("imageeditor", init_script=NO_PICKERS)
    open_image(page, make_png(tmp_path / "in.png", size=size, color=color))
    expect(page.locator("[data-testid=image-size]")).to_have_text(f"{size[0]} × {size[1]}")
    return page


def select_rect(page, x, y, w, h):
    page.evaluate("([x, y, w, h]) => { IE.ed.doc.selection = { type: 'rect', x, y, w, h }; }", [x, y, w, h])


def modify(page, op, radius):
    menu(page, "edit", op)
    page.fill("[data-testid=dlg-sel-radius]", str(radius))
    page.click("[data-testid=dlg-ok]")
    expect(page.locator("[data-testid=dialog]")).to_have_count(0)


def amount(page, x, y):
    """How much the pixel is selected (0–255)."""
    return page.evaluate("([x, y]) => { const m = IE.ed.doc.selectionMask(); return m ? m[y * IE.ed.doc.width + x] : null; }", [x, y])


def test_feather_and_fill(app_page, tmp_path):
    page = ready(app_page, tmp_path)
    select_rect(page, 20, 20, 60, 20)
    modify(page, "feather", 10)
    s = page.evaluate("IE.ed.doc.selection")
    assert s["type"] == "alpha" and s["x"] < 20 and s["x"] + s["w"] > 80
    assert amount(page, 50, 30) > 200 and 60 < amount(page, 20, 30) < 200 and amount(page, 5, 30) == 0
    page.fill("[data-testid=color-primary]", "#ff0000")
    menu(page, "edit", "fillSel")
    expect_pixel(page, 50, 30, (255, 255 - amount(page, 50, 30), 255 - amount(page, 50, 30), 255), tolerance=3)
    edge = pixel(page, 20, 30)
    assert edge[0] == 255 and 60 < edge[1] < 200 and abs(edge[1] - (255 - amount(page, 20, 30))) <= 3  # partly red
    expect_pixel(page, 5, 30, (255, 255, 255, 255))
    # the marching ants follow the half-selected pixels; undo keeps the pixels and the selection together
    page.keyboard.press("Control+z")
    expect_pixel(page, 20, 30, (255, 255, 255, 255))
    assert page.evaluate("IE.ed.doc.selection.type") == "alpha"
    assert page.errors == []


def test_grow_shrink_border_invert(app_page, tmp_path):
    page = ready(app_page, tmp_path)
    select_rect(page, 20, 20, 60, 20)  # pixels 20..79 × 20..39
    modify(page, "grow", 5)
    assert amount(page, 15, 30) == 255 and amount(page, 14, 30) == 0 and amount(page, 50, 15) == 255
    assert 0 < amount(page, 16, 16) < 255  # a round corner, smooth
    assert amount(page, 15, 15) == 0
    modify(page, "shrink", 5)  # back to the rectangle (with the corners round only on the outside)
    assert amount(page, 20, 30) == 255 and amount(page, 19, 30) == 0
    modify(page, "shrink", 5)
    assert amount(page, 25, 30) == 255 and amount(page, 24, 30) == 0 and amount(page, 50, 25) == 255 and amount(page, 50, 24) == 0
    # border: a band on both sides of the edge
    select_rect(page, 20, 20, 60, 20)
    modify(page, "border", 3)
    assert amount(page, 20, 30) == 255 and amount(page, 18, 30) == 255 and amount(page, 50, 30) == 0 and amount(page, 10, 30) == 0
    # inverting keeps the partly selected rest
    select_rect(page, 20, 20, 60, 20)
    modify(page, "feather", 10)
    before = amount(page, 20, 30)
    menu(page, "edit", "invertSel")
    assert amount(page, 20, 30) == 255 - before and amount(page, 5, 5) == 255 and amount(page, 50, 30) < 60
    # nothing left: a message, no selection
    select_rect(page, 20, 20, 4, 4)
    modify(page, "shrink", 3)
    assert page.evaluate("IE.ed.doc.selection") is None
    assert page.errors == []


def test_tools_through_a_feathered_selection(app_page, tmp_path):
    page = ready(app_page, tmp_path, color=(0, 0, 255))
    select_rect(page, 20, 20, 60, 20)
    modify(page, "feather", 10)
    k = amount(page, 20, 30) / 255
    # a filter (invert: blue -> yellow) changes partly selected pixels partly
    menu(page, "filters", "invert")
    expect_pixel(page, 50, 30, (255, 255, 0, 255))
    r, g, b, a = pixel(page, 20, 30)
    assert abs(r - 255 * k) <= 4 and abs(b - 255 * (1 - k)) <= 4 and a == 255
    expect_pixel(page, 5, 30, (0, 0, 255, 255))
    # a convolution filter also stays outside
    menu(page, "filters", "emboss")
    expect_pixel(page, 5, 30, (0, 0, 255, 255))
    page.keyboard.press("Control+z")
    page.keyboard.press("Control+z")
    expect_pixel(page, 20, 30, (0, 0, 255, 255))
    # the brush paints partly where the selection is partly
    page.fill("[data-testid=color-primary]", "#ff0000")
    page.click("[data-testid=tool-brush]")
    page.evaluate("IE.ed.opts.size = 30")
    drag(page, (2, 30), (50, 30))
    r, g, b, a = pixel(page, 20, 30)
    assert abs(r - 255 * k) <= 6 and abs(b - 255 * (1 - k)) <= 6
    expect_pixel(page, 5, 30, (0, 0, 255, 255))
    page.keyboard.press("Control+z")
    # copy: partly selected pixels are copied with that much alpha
    page.keyboard.press("Control+c")
    page.wait_for_function("() => !!IE.ed.clip")
    copied = page.evaluate("""() => { const c = IE.ed.clip; const s = IE.ed.doc.selection;
      return Array.from(c.canvas.getContext('2d').getImageData(20 - c.x, 30 - c.y, 1, 1).data); }""")
    assert copied[:3] == [0, 0, 255] and abs(copied[3] - round(255 * k)) <= 2
    # moving lifts that much: what stays behind is the rest (on a layer of its own over transparency)
    page.click("[data-testid=tool-move]")
    drag(page, (50, 30), (50, 55))  # (nothing selected lands on the checked pixel)
    assert page.evaluate("IE.ed.doc.selection.y") > 20
    left = page.evaluate("Array.from(IE.ed.doc.layer.canvas.getContext('2d').getImageData(20, 30, 1, 1).data)")
    assert abs(left[3] - round(255 * (1 - k))) <= 3
    assert page.errors == []


def test_quick_mask(app_page, tmp_path):
    page = ready(app_page, tmp_path)
    select_rect(page, 20, 20, 20, 20)
    page.keyboard.press("Shift+Q")
    expect(page.locator("[data-testid=quick-mask]")).to_have_attribute("aria-pressed", "true")
    assert page.evaluate("IE.ed.doc.selection") is None and page.evaluate("!!IE.ed.doc.quickMask")
    # shown red where nothing is selected, the image itself is unchanged
    assert pixel(page, 5, 5) == (255, 255, 255, 255)
    shown = page.evaluate("""() => { const c = document.querySelector('[data-testid=canvas]'); const v = IE.ed.view; const r = devicePixelRatio || 1;
      const at = (x, y) => Array.from(c.getContext('2d').getImageData(Math.floor((v.x + (x + 0.5) * v.zoom) * r), Math.floor((v.y + (y + 0.5) * v.zoom) * r), 1, 1).data);
      return [at(5, 5), at(30, 30)]; }""")
    assert shown[0][0] > 240 and shown[0][1] < 160 and shown[1][:3] == [255, 255, 255]
    # paint white (select) with the brush, grey partly, then black removes
    page.fill("[data-testid=color-primary]", "#ffffff")
    page.click("[data-testid=tool-brush]")
    page.evaluate("IE.ed.opts.size = 8")
    drag(page, (70, 10), (90, 10))
    page.fill("[data-testid=color-primary]", "#808080")
    drag(page, (70, 50), (90, 50))
    page.fill("[data-testid=color-primary]", "#000000")
    drag(page, (30, 22), (30, 38))
    assert pixel(page, 80, 10) == (255, 255, 255, 255)  # (the layer is untouched)
    page.click("[data-testid=quick-mask]")
    expect(page.locator("[data-testid=quick-mask]")).to_have_attribute("aria-pressed", "false")
    assert page.evaluate("IE.ed.doc.selection.type") == "alpha"
    assert amount(page, 80, 10) == 255 and 120 < amount(page, 80, 50) < 136 and amount(page, 25, 30) == 255 and amount(page, 30, 30) == 0
    assert amount(page, 5, 30) == 0
    # the quick mask's painting is not in the history of the image
    assert page.evaluate("IE.ed.doc.undoStack.length") == 0
    # the menu entry, and an image operation ends the quick mask
    menu(page, "edit", "quickMask")
    assert page.evaluate("!!IE.ed.doc.quickMask")
    menu(page, "image", "flipH")
    assert not page.evaluate("!!IE.ed.doc.quickMask")  # (flipping the image drops the selection, as before)
    expect(page.locator("[data-testid=quick-mask]")).to_have_attribute("aria-pressed", "false")
    assert page.errors == []
