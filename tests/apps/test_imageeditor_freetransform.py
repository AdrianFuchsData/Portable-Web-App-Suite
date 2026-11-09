"""Image editor: free transform (transform.js) – scale, rotate, move, flip, typed values; selection or whole layer; apply, cancel,
undo."""
from playwright.sync_api import expect

from test_imageeditor import close_drawer, drag, pixel
from test_imageeditor_selection import ready


def square(page):
    """A transparent layer with a red 20×20 square at (10, 10), blue in its left half."""
    page.evaluate("""() => { const l = IE.ed.doc.addLayer('Sq'); const ctx = l.canvas.getContext('2d');
      ctx.fillStyle = '#ff0000'; ctx.fillRect(10, 10, 20, 20); ctx.fillStyle = '#0000ff'; ctx.fillRect(10, 10, 10, 20); IE.ed.render(); }""")


def tr(page):
    return page.evaluate("IE.ed.transform && { ...IE.ed.transform }")


def layer_px(page, x, y):
    return tuple(page.evaluate("([x, y]) => Array.from(IE.ed.doc.layer.canvas.getContext('2d').getImageData(x, y, 1, 1).data)", [x, y]))


def test_scale_move_apply_undo(app_page, tmp_path):
    page = ready(app_page, tmp_path, size=(120, 80))
    square(page)
    close_drawer(page)
    page.keyboard.press("Control+t")
    t = tr(page)
    assert (t["cx"], t["cy"], t["w"], t["h"]) == (20, 20, 20, 20)
    # bottom-right handle: scale to 40×40 (top-left stays)
    drag(page, (30, 30), (50, 50))
    t = tr(page)
    assert abs(t["w"] - 40) <= 1.5 and abs(t["h"] - 40) <= 1.5 and abs(t["cx"] - 30) <= 1
    assert layer_px(page, 45, 45)[3] == 0  # (only the preview: the layer is unchanged until applied)
    # move by dragging inside
    drag(page, (30, 30), (60, 40))
    t = tr(page)
    assert abs(t["cx"] - 60) <= 1.5 and abs(t["cy"] - 40) <= 1.5
    page.keyboard.press("Enter")
    assert tr(page) is None
    assert layer_px(page, 75, 50)[:3] == (255, 0, 0) and layer_px(page, 45, 50)[:3] == (0, 0, 255) and layer_px(page, 15, 15)[3] == 0
    page.keyboard.press("Control+z")
    assert layer_px(page, 15, 15)[:3] == (0, 0, 255) and layer_px(page, 75, 50)[3] == 0
    assert page.errors == []


def test_typed_rotate_flip_cancel(app_page, tmp_path):
    page = ready(app_page, tmp_path, size=(120, 80))
    square(page)
    close_drawer(page)
    page.click("[data-testid=tool-transform]")
    expect(page.locator("[data-testid=transform-options]")).to_be_visible()
    page.fill("[data-testid=tr-angle]", "180")
    page.locator("[data-testid=tr-angle]").press("Tab")
    page.fill("[data-testid=tr-x]", "50")
    page.locator("[data-testid=tr-x]").press("Tab")
    t = tr(page)
    assert abs(t["angle"] - 3.14159) < 0.01 and t["cx"] == 60
    page.click("[data-testid=tr-apply]")
    # turned by 180°: blue is on the right now
    assert layer_px(page, 65, 20)[:3] == (0, 0, 255) and layer_px(page, 55, 20)[:3] == (255, 0, 0)
    # flip and cancel: nothing changes
    page.click("[data-testid=tool-transform]")
    page.click("[data-testid=tr-flip-x]")
    page.click("[data-testid=tr-cancel]")
    assert layer_px(page, 65, 20)[:3] == (0, 0, 255)
    # flip and apply (by choosing another tool)
    page.click("[data-testid=tool-transform]")
    page.click("[data-testid=tr-flip-x]")
    close_drawer(page)
    page.click("[data-testid=tool-brush]")
    assert tr(page) is None and layer_px(page, 65, 20)[:3] == (255, 0, 0)
    assert page.errors == []


def test_selection_and_rotate_handle(app_page, tmp_path):
    page = ready(app_page, tmp_path, size=(120, 80), color=(0, 128, 0))
    page.evaluate("IE.ed.doc.selection = { type: 'rect', x: 10, y: 10, w: 20, h: 10 }")
    close_drawer(page)
    page.keyboard.press("Control+t")
    t = tr(page)
    assert (t["w"], t["h"]) == (20, 10)
    # the round handle above the box turns it: drag it to the right of the centre → 90°
    z = page.evaluate("IE.ed.view.zoom")
    handle_y = 10 - 24 / z
    page.keyboard.down("Shift")
    drag(page, (20, handle_y), (60, 15))
    page.keyboard.up("Shift")
    assert abs(tr(page)["angle"] - 1.5708) < 0.02
    page.keyboard.press("Enter")
    # the lifted pixels left a hole; the selection follows the turned shape (10 wide, 20 high)
    assert layer_px(page, 12, 12)[3] == 0
    s = page.evaluate("IE.ed.doc.selection")
    assert abs(s["w"] - 10) <= 1 and abs(s["h"] - 20) <= 1
    # nothing to transform on an empty layer: a message
    page.evaluate("IE.ed.doc.selection = null; IE.ed.doc.addLayer('Empty')")
    page.keyboard.press("Control+t")
    assert tr(page) is None
    assert page.errors == []
