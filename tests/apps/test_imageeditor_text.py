"""Image editor: text layers – editable until their pixels change, moved and cropped as text, kept in OpenRaster files."""
from playwright.sync_api import expect

from test_imageeditor import click_at, close_drawer, drag, menu, open_image, save_download
from test_imageeditor_selection import ready


def text_of(page, index=None):
    return page.evaluate(f"(IE.ed.doc.layers[{'IE.ed.doc.active' if index is None else index}] || {{}}).text || null")


def dark(page, x0, y0, x1, y1, channel="r"):
    """Pixels in the rectangle whose channel is below 100 (the text)."""
    return page.evaluate("""([x0, y0, x1, y1, c]) => { const d = IE.ed.doc.composite().getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data;
      const k = { r: 0, g: 1, b: 2 }[c]; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + k] < 100) n++; return n; }""", [x0, y0, x1, y1, channel])


def add_text(page, x, y, text, size=30):
    close_drawer(page)
    page.click("[data-testid=tool-text]")
    click_at(page, x, y)
    page.fill("[data-testid=dlg-text]", text)
    page.fill("[data-testid=dlg-fontSize]", str(size))
    page.click("[data-testid=dlg-ok]")
    expect(page.locator("[data-testid=dialog]")).to_have_count(0)


def test_text_layer_edit_move_rasterize(app_page, tmp_path):
    page = ready(app_page, tmp_path, size=(200, 100))
    page.fill("[data-testid=color-primary]", "#000000")
    add_text(page, 10, 10, "Hi")
    expect(page.locator("[data-testid=layer]")).to_have_count(2)
    t = text_of(page)
    assert t["text"] == "Hi" and abs(t["x"] - 10) <= 1 and abs(t["y"] - 10) <= 1 and t["x"] == round(t["x"])
    x0, y0 = t["x"], t["y"]
    assert dark(page, 0, 0, 80, 60) > 50
    expect(page.locator("[data-testid=layer-text]")).to_have_count(1)
    # a click on the text edits it (also on another layer: it becomes the active one)
    page.evaluate("IE.ed.doc.active = 0")
    click_at(page, 15, 20)
    expect(page.locator("[data-testid=dlg-text]")).to_have_value("Hi")
    page.fill("[data-testid=dlg-text]", "Hello")
    page.fill("[data-testid=dlg-text-color]", "#ff0000")
    page.click("[data-testid=dlg-ok]")
    expect(page.locator("[data-testid=layer]")).to_have_count(2)
    assert text_of(page)["text"] == "Hello" and text_of(page)["color"] == "#ff0000" and page.evaluate("IE.ed.doc.active") == 1
    assert dark(page, 0, 0, 120, 60, "g") > 50 and dark(page, 0, 0, 120, 60, "r") == 0  # red now
    page.keyboard.press("Control+z")
    assert text_of(page)["text"] == "Hi"
    page.keyboard.press("Control+y")
    # moving the whole layer keeps it a text layer, at the new place
    close_drawer(page)
    page.click("[data-testid=tool-move]")
    drag(page, (20, 20), (60, 50))
    t = text_of(page)
    assert t and (t["x"] - x0, t["y"] - y0) == (40, 30)
    assert dark(page, 0, 0, 40, 40, "g") == 0 and dark(page, 45, 35, 200, 100, "g") > 50
    # painting on it makes it a normal layer; undo makes it a text layer again
    close_drawer(page)
    page.click("[data-testid=tool-brush]")
    drag(page, (150, 90), (190, 90))
    assert text_of(page) is None
    expect(page.locator("[data-testid=layer-text]")).to_have_count(0)
    page.keyboard.press("Control+z")
    assert text_of(page)["text"] == "Hello"
    # crop: still text, shifted; Layer → Rasterize
    page.evaluate("IE.ed.doc.selection = { type: 'rect', x: 20, y: 20, w: 180, h: 80 }")
    menu(page, "image", "crop")
    assert (text_of(page)["x"], text_of(page)["y"]) == (x0 + 20, y0 + 10)
    menu(page, "layer", "rasterize")
    assert text_of(page) is None
    page.keyboard.press("Control+z")
    assert text_of(page)["text"] == "Hello"
    # rotating the image turns text layers into pixels
    menu(page, "image", "rotateCw")
    assert text_of(page) is None
    assert page.errors == []


def test_text_layers_in_files(app_page, tmp_path):
    page = ready(app_page, tmp_path, size=(200, 100))
    add_text(page, 10, 10, "Two\nlines", size=24)
    page.click("[data-testid=layer-text]")  # (the layer button edits too)
    page.select_option("[data-testid=dlg-text-align]", "center")
    page.check("[data-testid=dlg-text-bold]")
    page.click("[data-testid=dlg-ok]")
    assert text_of(page)["align"] == "center" and text_of(page)["bold"] is True
    ora = save_download(page, tmp_path, "ora", name="text")
    import zipfile
    stack = zipfile.ZipFile(ora).read("stack.xml").decode()
    assert "suite:text=" in stack and "Two\\nlines" in stack
    page2 = ready(app_page, tmp_path, size=(200, 100))
    open_image(page2, ora)
    expect(page2.locator("[data-testid=layer]")).to_have_count(2)
    t = text_of(page2, 1)
    assert t["text"] == "Two\nlines" and t["align"] == "center" and t["bold"] is True
    assert dark(page2, 0, 0, 200, 100) > 50
    # PSD: pixels
    psd = save_download(page, tmp_path, "psd", name="text")
    page3 = ready(app_page, tmp_path, size=(200, 100))
    open_image(page3, psd)
    expect(page3.locator("[data-testid=layer]")).to_have_count(2)
    assert text_of(page3, 1) is None and dark(page3, 0, 0, 200, 100) > 50
    # emptied text: the layer goes away
    page.click("[data-testid=layer-text]")
    page.fill("[data-testid=dlg-text]", "")
    page.click("[data-testid=dlg-ok]")
    expect(page.locator("[data-testid=layer]")).to_have_count(1)
    assert page.errors == [] and page2.errors == [] and page3.errors == []
