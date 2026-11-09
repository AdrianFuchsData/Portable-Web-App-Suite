"""Image editor: saving GIF (palette, transparency, dithering) and ICO (several sizes); exporting the selection or a layer."""
from PIL import Image
from playwright.sync_api import expect

from test_imageeditor import menu, save_download
from test_imageeditor_selection import ready


def test_gif_and_ico(app_page, tmp_path):
    page = ready(app_page, tmp_path, size=(64, 40), color=(255, 255, 255))
    page.evaluate("""() => { const ctx = IE.ed.doc.layer.canvas.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, 64, 0); g.addColorStop(0, '#ff0000'); g.addColorStop(1, '#0000ff');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 20); ctx.clearRect(0, 30, 10, 10); IE.ed.render(); }""")
    gif = save_download(page, tmp_path, "gif", name="pic")
    assert gif.name.endswith(".gif")
    img = Image.open(gif)
    assert img.format == "GIF" and img.size == (64, 40) and "transparency" in img.info
    rgba = img.convert("RGBA")
    assert rgba.getpixel((5, 35))[3] == 0  # transparent stays transparent
    r, g, b, a = rgba.getpixel((2, 10))
    assert r > 200 and b < 60 and a == 255
    r, g, b, a = rgba.getpixel((60, 10))
    assert b > 200 and r < 60
    assert rgba.getpixel((40, 25))[:3] == (255, 255, 255)
    # without dithering: flat areas exact
    menu(page, "file", "saveAs")
    page.fill("[data-testid=dlg-name]", "flat")
    page.select_option("[data-testid=dlg-format]", "gif")
    page.uncheck("[data-testid=dlg-dither]")
    with page.expect_download() as d:
        page.click("[data-testid=dlg-ok]")
    d.value.save_as(tmp_path / "flat.gif")
    assert Image.open(tmp_path / "flat.gif").convert("RGB").getpixel((40, 25)) == (255, 255, 255)
    # ICO with chosen sizes
    menu(page, "file", "saveAs")
    page.fill("[data-testid=dlg-name]", "icon")
    page.select_option("[data-testid=dlg-format]", "ico")
    page.uncheck("[data-testid=dlg-ico-256]")
    page.check("[data-testid=dlg-ico-64]")
    with page.expect_download() as d:
        page.click("[data-testid=dlg-ok]")
    assert d.value.suggested_filename == "icon.ico"
    d.value.save_as(tmp_path / "icon.ico")
    ico = Image.open(tmp_path / "icon.ico")
    assert ico.format == "ICO" and sorted(ico.info["sizes"]) == [(16, 16), (32, 32), (48, 48), (64, 64)]
    ico.size = (64, 64)
    big = ico.convert("RGBA")
    assert big.getpixel((32, 2))[3] == 0 and big.getpixel((2, 30))[3] == 255  # (fitted into the square: transparent above)
    assert page.errors == []


def test_export_selection_and_layer(app_page, tmp_path):
    page = ready(app_page, tmp_path, size=(80, 60), color=(0, 128, 0))
    page.evaluate("IE.ed.doc.selection = { type: 'rect', x: 10, y: 5, w: 30, h: 20 }")
    menu(page, "file", "exportSelection")
    expect(page.locator("[data-testid=dlg-name]")).to_have_value("in-selection")
    with page.expect_download() as d:
        page.click("[data-testid=dlg-ok]")
    assert d.value.suggested_filename == "in-selection.png"
    d.value.save_as(tmp_path / "sel.png")
    sel = Image.open(tmp_path / "sel.png")
    assert sel.size == (30, 20) and sel.convert("RGB").getpixel((5, 5)) == (0, 128, 0)
    # the open image is unchanged (name, not dirty)
    assert page.evaluate("[IE.ed.name, IE.ed.doc.dirty]") == ["in.png", False]
    # a layer on its own (with its transparency)
    page.evaluate("""() => { const l = IE.ed.doc.addLayer('Dot'); l.canvas.getContext('2d').fillStyle = '#ff0000'; l.canvas.getContext('2d').fillRect(0, 0, 4, 4); IE.ed.render(); }""")
    menu(page, "file", "exportLayer")
    expect(page.locator("[data-testid=dlg-name]")).to_have_value("in-Dot")
    with page.expect_download() as d:
        page.click("[data-testid=dlg-ok]")
    d.value.save_as(tmp_path / "layer.png")
    layer = Image.open(tmp_path / "layer.png").convert("RGBA")
    assert layer.size == (80, 60) and layer.getpixel((1, 1)) == (255, 0, 0, 255) and layer.getpixel((40, 40))[3] == 0
    # no selection: a message
    page.evaluate("IE.ed.doc.selection = null")
    menu(page, "file", "exportSelection")
    expect(page.locator("[data-testid=dialog]")).to_have_count(0)
    assert page.errors == []
