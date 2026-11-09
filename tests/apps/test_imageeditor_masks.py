"""Image editor: layer masks – paint on the mask (white shows, black hides), from the selection, disable, apply, delete, undo;
kept in PSD (as layer masks) and OpenRaster files."""
from playwright.sync_api import expect

from test_imageeditor import close_drawer, drag, menu, open_image, pixel, save_download
from test_imageeditor_selection import ready


def red_layer(page):
    page.evaluate("""() => { const l = IE.ed.doc.addLayer('Red'); const ctx = l.canvas.getContext('2d'); ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, IE.ed.doc.width, IE.ed.doc.height); IE.ed.changed(); }""")


def layer_px(page, x, y):
    return tuple(page.evaluate("([x, y]) => Array.from(IE.ed.doc.layers[IE.ed.doc.active].canvas.getContext('2d').getImageData(x, y, 1, 1).data)", [x, y]))


def test_paint_on_mask(app_page, tmp_path):
    page = ready(app_page, tmp_path, size=(100, 60), color=(255, 255, 255))
    red_layer(page)
    menu(page, "layer", "addMask")
    expect(page.locator("[data-testid=layer-mask]")).to_have_count(1)
    expect(page.locator("[data-testid=layer-mask]")).to_have_attribute("aria-pressed", "true")
    assert pixel(page, 50, 30)[:3] == (255, 0, 0)  # (a white mask shows everything)
    # black on the mask hides the layer there; the layer's own pixels stay
    page.fill("[data-testid=color-primary]", "#000000")
    close_drawer(page)
    page.click("[data-testid=tool-brush]")
    page.evaluate("IE.ed.opts.size = 20")
    drag(page, (10, 30), (60, 30))
    assert pixel(page, 30, 30)[:3] == (255, 255, 255) and pixel(page, 90, 30)[:3] == (255, 0, 0)
    assert layer_px(page, 30, 30) == (255, 0, 0, 255)
    # undo the stroke on the mask
    page.keyboard.press("Control+z")
    assert pixel(page, 30, 30)[:3] == (255, 0, 0)
    page.keyboard.press("Control+y")
    # back to the layer: painting changes the pixels, not the mask
    page.click("[data-testid=layer-name] >> nth=0")
    assert page.evaluate("!!IE.ed.doc.editMask") is False
    # disable / enable
    menu(page, "layer", "disableMask")
    assert pixel(page, 30, 30)[:3] == (255, 0, 0)
    page.keyboard.press("Control+z")
    assert pixel(page, 30, 30)[:3] == (255, 255, 255)
    # merge down applies the mask
    page.keyboard.press("Control+e")
    assert page.evaluate("IE.ed.doc.layers.length") == 1 and pixel(page, 30, 30)[:3] == (255, 255, 255) and pixel(page, 90, 30)[:3] == (255, 0, 0)
    page.keyboard.press("Control+z")
    # apply and delete
    page.evaluate("IE.ed.doc.active = 1")
    menu(page, "layer", "applyMask")
    assert page.evaluate("IE.ed.doc.layers[1].mask") is None and layer_px(page, 30, 30)[3] == 0 and pixel(page, 30, 30)[:3] == (255, 255, 255)
    page.keyboard.press("Control+z")
    menu(page, "layer", "deleteMask")
    assert page.evaluate("IE.ed.doc.layers[1].mask") is None and pixel(page, 30, 30)[:3] == (255, 0, 0)
    assert page.errors == []


def test_mask_from_selection_and_files(app_page, tmp_path):
    page = ready(app_page, tmp_path, size=(100, 60), color=(255, 255, 255))
    red_layer(page)
    page.evaluate("IE.ed.doc.selection = { type: 'rect', x: 0, y: 0, w: 50, h: 60 }")
    menu(page, "layer", "addMaskSel")
    assert pixel(page, 25, 30)[:3] == (255, 0, 0) and pixel(page, 75, 30)[:3] == (255, 255, 255)
    psd = save_download(page, tmp_path, "psd", name="masked")
    from psd_tools import PSDImage
    p = PSDImage.open(psd)
    red = [l for l in p if l.name == "Red"][0]
    assert red.has_mask()
    page2 = ready(app_page, tmp_path, size=(100, 60))
    open_image(page2, psd)
    expect(page2.locator("[data-testid=layer-mask]")).to_have_count(1)
    assert pixel(page2, 25, 30)[:3] == (255, 0, 0) and pixel(page2, 75, 30)[:3] == (255, 255, 255)
    assert page2.evaluate("Array.from(IE.ed.doc.layers[1].canvas.getContext('2d').getImageData(75, 30, 1, 1).data)") == [255, 0, 0, 255]  # (editable: the pixels are there)
    ora = save_download(page, tmp_path, "ora", name="masked")
    import zipfile
    from PIL import Image
    import io
    z = zipfile.ZipFile(ora)
    shown = Image.open(io.BytesIO(z.read("data/layer1.png"))).convert("RGBA")
    assert shown.getpixel((75, 30))[3] == 0 and shown.getpixel((25, 30)) == (255, 0, 0, 255)  # (other programs see the result)
    page3 = ready(app_page, tmp_path, size=(100, 60))
    open_image(page3, ora)
    expect(page3.locator("[data-testid=layer-mask]")).to_have_count(1)
    assert pixel(page3, 75, 30)[:3] == (255, 255, 255)
    assert page3.evaluate("Array.from(IE.ed.doc.layers[1].canvas.getContext('2d').getImageData(75, 30, 1, 1).data)") == [255, 0, 0, 255]
    assert page.errors == [] and page2.errors == [] and page3.errors == []
