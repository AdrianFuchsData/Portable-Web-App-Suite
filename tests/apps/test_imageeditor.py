"""Image editor (apps/imageeditor); images are created and checked with Pillow."""
import io
import math
import zipfile

from PIL import Image
from playwright.sync_api import expect

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"


def make_png(path, size=(60, 40), color=(255, 255, 255), square=None):
    img = Image.new("RGBA", size, color + (255,))
    if square:
        (x0, y0, x1, y1), fill = square
        img.paste(Image.new("RGBA", (x1 - x0, y1 - y0), fill + (255,)), (x0, y0))
    img.save(path)
    return path


def open_image(page, path, item="cmd-open"):
    page.click("[data-testid=menu-file] summary")
    with page.expect_file_chooser() as chooser:
        page.click(f"[data-testid={item}]")
    chooser.value.set_files(str(path))


def close_drawer(page):
    """On phones a drawer (opened to reach the tool options) covers the canvas: tap its shade first, like a user."""
    from helpers.devices import FREE_SPOT
    shade = page.locator(".suite-backdrop")
    if shade.count() and shade.first.is_visible():
        spot, box = shade.first.evaluate(FREE_SPOT), shade.first.bounding_box()
        if spot:
            page.mouse.click(box["x"] + spot["x"], box["y"] + spot["y"])
        else:
            shade.first.dispatch_event("click")
        expect(shade).to_have_count(0)


def at(page, x, y):
    """Page coordinates inside an image pixel; integers where possible (Firefox truncates mouse coordinates)."""
    close_drawer(page)
    box = page.locator("[data-testid=canvas]").bounding_box()
    v = page.evaluate("({ ...IE.ed.view })")

    def coord(origin, i):
        left = origin + i * v["zoom"]
        whole = math.ceil(left + 0.01)
        return whole if whole < left + v["zoom"] - 0.01 else left + v["zoom"] / 2
    return coord(box["x"] + v["x"], x), coord(box["y"] + v["y"], y)


def drag(page, a, b, steps=8):
    page.mouse.move(*at(page, *a))
    page.mouse.down()
    page.mouse.move(*at(page, *b), steps=steps)
    page.mouse.up()


def click_at(page, x, y):
    page.mouse.click(*at(page, x, y))


def pixel(page, x, y):
    return tuple(page.evaluate("([x, y]) => Array.from(IE.ed.doc.composite().getContext('2d').getImageData(x, y, 1, 1).data)", [x, y]))


def expect_pixel(page, x, y, rgba, tolerance=8):
    for _ in range(40):
        actual = pixel(page, x, y)
        if all(abs(a - b) <= tolerance for a, b in zip(actual, rgba)):
            return
        page.wait_for_timeout(50)
    assert actual == rgba


def menu(page, name, command):
    page.click(f"[data-testid=menu-{name}] summary")
    page.click(f"[data-testid=cmd-{command}]")


def save_download(page, tmp_path, format=None, name=None):
    if format:
        menu(page, "file", "saveAs")
        if name:
            page.fill("[data-testid=dlg-name]", name)
        page.select_option("[data-testid=dlg-format]", format)
        with page.expect_download() as d:
            page.click("[data-testid=dlg-ok]")
    else:
        with page.expect_download() as d:
            page.keyboard.press("Control+s")
    path = tmp_path / ("out-" + d.value.suggested_filename)
    d.value.save_as(path)
    return path


def ready_image(app_page, tmp_path, **kwargs):
    page = app_page("imageeditor", init_script=NO_PICKERS)
    open_image(page, make_png(tmp_path / "in.png", **kwargs))
    expect(page.locator("[data-testid=image-size]")).to_have_text(f"{kwargs.get('size', (60, 40))[0]} × {kwargs.get('size', (60, 40))[1]}")
    return page


def test_open_paint_save_png(app_page, tmp_path):
    page = ready_image(app_page, tmp_path, size=(60, 40))
    assert page.title().endswith("Image editor")  # "Untitled.png – Image editor"
    page.fill("[data-testid=color-primary]", "#ff0000")
    page.click("[data-testid=tool-brush]")
    drag(page, (10, 20), (50, 20))
    expect_pixel(page, 30, 20, (255, 0, 0, 255))
    expect_pixel(page, 30, 5, (255, 255, 255, 255))
    path = save_download(page, tmp_path)
    assert path.name.endswith("in.png")
    img = Image.open(path).convert("RGBA")
    assert img.size == (60, 40) and img.getpixel((30, 20)) == (255, 0, 0, 255)
    assert page.errors == [] and page.requests == []


def test_undo_redo_and_pencil(app_page, tmp_path):
    page = ready_image(app_page, tmp_path)
    page.keyboard.press("n")  # pencil
    expect(page.locator("[data-testid=tool-pencil]")).to_have_attribute("aria-pressed", "true")
    page.evaluate("IE.ed.opts.size = 1")  # (on phones the options are in a drawer that would have to be closed first)
    click_at(page, 5, 5)
    expect_pixel(page, 5, 5, (0, 0, 0, 255), 0)
    expect_pixel(page, 6, 5, (255, 255, 255, 255), 0)  # hard pixels, no antialiasing
    page.keyboard.press("Control+z")
    expect_pixel(page, 5, 5, (255, 255, 255, 255), 0)
    page.keyboard.press("Control+y")
    expect_pixel(page, 5, 5, (0, 0, 0, 255), 0)


def test_fill_picker_and_shapes(app_page, tmp_path):
    page = ready_image(app_page, tmp_path, square=((20, 10, 40, 30), (0, 0, 255)))
    page.click("[data-testid=tool-picker]")
    click_at(page, 25, 15)
    expect(page.locator("[data-testid=color-primary]")).to_have_value("#0000ff")
    page.fill("[data-testid=color-primary]", "#00ff00")
    page.click("[data-testid=tool-fill]")
    click_at(page, 25, 15)  # contiguous: only the square
    expect_pixel(page, 30, 20, (0, 255, 0, 255))
    expect_pixel(page, 5, 5, (255, 255, 255, 255))

    page.fill("[data-testid=color-primary]", "#000000")
    page.fill("[data-testid=color-secondary]", "#ff0000")
    page.click("[data-testid=tool-rect]")
    page.check("[data-testid=opt-fill]")
    page.fill("[data-testid=opt-size]", "2")
    drag(page, (2, 2), (12, 12))
    expect_pixel(page, 7, 7, (255, 0, 0, 255))  # filled with the background colour
    expect_pixel(page, 2, 7, (0, 0, 0, 255), 40)  # stroked with the foreground colour


def test_selection_crop_copy_paste_and_clear(app_page, tmp_path):
    page = ready_image(app_page, tmp_path, square=((20, 10, 40, 30), (0, 0, 255)))
    page.click("[data-testid=tool-select-rect]")
    drag(page, (20, 10), (39, 29))  # both corner pixels are included
    assert page.evaluate("IE.ed.doc.selection") == {"type": "rect", "x": 20, "y": 10, "w": 20, "h": 20}
    page.keyboard.press("Control+c")
    page.keyboard.press("Control+v")
    expect(page.locator("[data-testid=layer]")).to_have_count(2)
    expect(page.locator("[data-testid=tool-move]")).to_have_attribute("aria-pressed", "true")
    drag(page, (25, 15), (5, 25))  # move the pasted pixels by (-20, +10)
    expect_pixel(page, 5, 25, (0, 0, 255, 255))
    page.keyboard.press("Delete")  # clears the moved selection on the pasted layer
    expect_pixel(page, 5, 25, (255, 255, 255, 255))

    page.click("[data-testid=tool-select-rect]")
    drag(page, (20, 10), (39, 29))
    menu(page, "image", "crop")
    expect(page.locator("[data-testid=image-size]")).to_have_text("20 × 20")
    expect_pixel(page, 10, 10, (0, 0, 255, 255))


def selection(page):
    return page.evaluate("IE.ed.doc.selection")


def test_selection_coordinates_and_modes(app_page, tmp_path):
    page = ready_image(app_page, tmp_path)
    page.click("[data-testid=tool-select-rect]")
    drag(page, (10, 5), (29, 14))
    expect(page.locator("[data-testid=selection-info]")).to_have_text("⬚ 10, 5 · 20 × 10")
    expect(page.locator("[data-testid=sel-x]")).to_have_value("10")
    expect(page.locator("[data-testid=sel-w]")).to_have_value("20")
    # typed coordinates
    page.fill("[data-testid=sel-x]", "2")
    page.fill("[data-testid=sel-w]", "30")
    page.press("[data-testid=sel-w]", "Enter")
    assert selection(page) == {"type": "rect", "x": 2, "y": 5, "w": 30, "h": 10}
    page.fill("[data-testid=sel-h]", "100")  # clamped to the image
    page.click("[data-testid=sel-apply]")
    assert selection(page) == {"type": "rect", "x": 2, "y": 5, "w": 30, "h": 35}
    # fixed size: a click places it
    page.select_option("[data-testid=opt-sel-mode]", "size")
    page.fill("[data-testid=opt-sel-w]", "16")
    page.fill("[data-testid=opt-sel-h]", "8")
    click_at(page, 3, 3)
    assert selection(page) == {"type": "rect", "x": 3, "y": 3, "w": 16, "h": 8}
    # fixed aspect ratio 2:1
    page.select_option("[data-testid=opt-sel-mode]", "ratio")
    page.fill("[data-testid=opt-ratio-w]", "2")
    page.fill("[data-testid=opt-ratio-h]", "1")
    drag(page, (0, 0), (19, 3))
    s = selection(page)
    assert (s["x"], s["y"], s["w"]) == (0, 0, 20) and abs(s["h"] - 10) <= 1
    # dialog (also for phones)
    menu(page, "edit", "selectCoords")
    page.select_option("[data-testid=dlg-sel-type]", "ellipse")
    for key, value in (("x", 5), ("y", 6), ("w", 12), ("h", 9)):
        page.fill(f"[data-testid=dlg-sel-{key}]", str(value))
    page.click("[data-testid=dlg-ok]")
    assert selection(page) == {"type": "ellipse", "x": 5, "y": 6, "w": 12, "h": 9}
    assert page.errors == []


def screen_of(page, x=None, y=None):
    """Page coordinates of an image coordinate (pixel boundary)."""
    box = page.locator("[data-testid=canvas]").bounding_box()
    v = page.evaluate("({ ...IE.ed.view })")
    return (box["x"] + v["x"] + x * v["zoom"]) if x is not None else None, (box["y"] + v["y"] + y * v["zoom"]) if y is not None else None


def test_rulers_guides_grid_and_snapping(app_page, tmp_path):
    page = ready_image(app_page, tmp_path)
    if page.evaluate("matchMedia('(max-width: 760px)').matches"):
        menu(page, "view", "rulers")  # phones start without rulers
    expect(page.locator("[data-testid=ruler-h]")).to_be_visible()
    # drag guides out of the rulers
    ruler_h = page.locator("[data-testid=ruler-h]").bounding_box()
    ruler_v = page.locator("[data-testid=ruler-v]").bounding_box()
    bx, by = screen_of(page, x=30, y=20)  # pixel boundaries
    page.mouse.move(ruler_h["x"] + 200, ruler_h["y"] + 10)
    page.mouse.down()
    page.mouse.move(bx + 5, by, steps=5)
    page.mouse.up()
    page.mouse.move(ruler_v["x"] + 10, ruler_v["y"] + 200)
    page.mouse.down()
    page.mouse.move(bx, by + 5, steps=5)
    page.mouse.up()
    guides = page.evaluate("IE.ed.guides.map((g) => [g.axis, g.pos])")
    if page.evaluate("matchMedia('(max-width: 760px)').matches") and guides != [["h", 20], ["v", 30]]:
        # Firefox rounds pointer positions to whole CSS pixels; at a phone's small zoom that is about 2 image pixels.
        # Exact positions are typed in on phones ("New guide…").
        assert [g[0] for g in guides] == ["h", "v"] and abs(guides[0][1] - 20) <= 2 and abs(guides[1][1] - 30) <= 2
        menu(page, "view", "clearGuides")
        for axis, pos in (("h", 20), ("v", 30)):
            menu(page, "view", "newGuide")
            page.select_option("[data-testid=dlg-guide-axis]", axis)
            page.fill("[data-testid=dlg-guide-pos]", str(pos))
            page.click("[data-testid=dlg-ok]")
    assert page.evaluate("IE.ed.guides.map((g) => [g.axis, g.pos])") == [["h", 20], ["v", 30]]

    # selections snap to the guides (pixel boundaries)
    page.click("[data-testid=tool-select-rect]")
    drag(page, (1, 1), (30, 20))
    assert selection(page) == {"type": "rect", "x": 1, "y": 1, "w": 29, "h": 19}
    menu(page, "view", "snapGuides")
    drag(page, (1, 1), (30, 20))
    assert selection(page) == {"type": "rect", "x": 1, "y": 1, "w": 30, "h": 20}
    menu(page, "view", "snapGuides")

    # move a guide with the move tool, drag one back onto the ruler to remove it
    page.click("[data-testid=tool-move]")
    sx, _ = screen_of(page, x=30)
    _, sy = at(page, 10, 10)
    page.mouse.move(sx, sy)
    page.mouse.down()
    page.mouse.move(screen_of(page, x=40)[0], sy, steps=5)
    page.mouse.up()
    assert page.evaluate("IE.ed.guides.map((g) => [g.axis, g.pos])") == [["h", 20], ["v", 40]]
    _, gy = screen_of(page, y=20)
    gx, _ = at(page, 10, 10)
    page.mouse.move(gx, gy)
    page.mouse.down()
    page.mouse.move(ruler_h["x"] + 100, ruler_h["y"] + 10, steps=5)
    page.mouse.up()
    assert page.evaluate("IE.ed.guides.map((g) => [g.axis, g.pos])") == [["v", 40]]

    # grid with snapping, configured in the dialog
    menu(page, "view", "guideSettings")
    page.check("[data-testid=dlg-grid]")
    page.check("[data-testid=dlg-snapGrid]")
    page.fill("[data-testid=dlg-gridSize]", "10")
    page.fill("[data-testid=dlg-snapDistance]", "40")
    page.click("[data-testid=dlg-ok]")
    page.click("[data-testid=tool-select-rect]")
    drag(page, (11, 11), (19, 21))
    assert selection(page) == {"type": "rect", "x": 10, "y": 10, "w": 10, "h": 10}

    # new guide by number; the settings are remembered
    menu(page, "view", "newGuide")
    page.select_option("[data-testid=dlg-guide-axis]", "v")
    page.fill("[data-testid=dlg-guide-pos]", "7")
    page.click("[data-testid=dlg-ok]")
    assert page.evaluate("IE.ed.guides.map((g) => [g.axis, g.pos])") == [["v", 40], ["v", 7]]
    menu(page, "view", "clearGuides")
    assert page.evaluate("IE.ed.guides.length") == 0
    menu(page, "view", "rulers")
    expect(page.locator("[data-testid=ruler-h]")).to_be_hidden()
    page.reload()
    page.wait_for_selector("body[data-ready]")
    assert page.evaluate("[IE.prefs.rulers, IE.prefs.grid, IE.prefs.snapGrid, IE.prefs.gridSize]") == [False, True, True, 10]
    assert page.errors == []


def test_layers_and_openraster(app_page, tmp_path):
    page = ready_image(app_page, tmp_path)
    page.click("[data-testid=layer-add]")
    expect(page.locator("[data-testid=layer]")).to_have_count(2)
    page.fill("[data-testid=color-primary]", "#ff0000")
    menu(page, "edit", "selectAll")
    menu(page, "edit", "fillSel")
    page.fill("[data-testid=layer-opacity]", "50")
    page.select_option("[data-testid=layer-blend]", "multiply")
    page.locator("[data-testid=layer-name]").first.dblclick()
    page.fill("[data-testid=layer-name-input]", "Red")
    page.press("[data-testid=layer-name-input]", "Enter")
    expect(page.locator("[data-testid=layer-name]")).to_have_text(["Red", "Background"])
    expect_pixel(page, 5, 5, (255, 128, 128, 255), 3)  # 50 % multiply over white

    path = save_download(page, tmp_path, "ora", "layers")
    assert path.name.endswith("layers.ora")
    with zipfile.ZipFile(path) as z:
        assert z.namelist()[0] == "mimetype" and z.read("mimetype") == b"image/openraster"
        assert z.getinfo("mimetype").compress_type == zipfile.ZIP_STORED
        stack = z.read("stack.xml").decode()
        assert 'name="Red"' in stack and 'opacity="0.5"' in stack and 'composite-op="svg:multiply"' in stack
        assert stack.index('name="Red"') < stack.index('name="Background"')  # top layer first
        assert Image.open(io.BytesIO(z.read("mergedimage.png"))).size == (60, 40)

    # open the ORA again: layers, names and properties come back
    page2 = app_page("imageeditor", init_script=NO_PICKERS)
    open_image(page2, path)
    expect(page2.locator("[data-testid=layer-name]")).to_have_text(["Red", "Background"])
    assert page2.evaluate("IE.ed.doc.layers.map(l => [l.opacity, l.blend])") == [[1, "normal"], [0.5, "multiply"]]
    expect_pixel(page2, 5, 5, (255, 128, 128, 255), 3)

    # visibility, merge down, delete
    page.locator("[data-testid=layer-visible]").first.uncheck()
    expect_pixel(page, 5, 5, (255, 255, 255, 255))
    page.locator("[data-testid=layer-visible]").first.check()
    page.click("[data-testid=layer-merge]")
    expect(page.locator("[data-testid=layer]")).to_have_count(1)
    expect_pixel(page, 5, 5, (255, 128, 128, 255), 3)


def test_image_operations(app_page, tmp_path):
    page = ready_image(app_page, tmp_path, square=((0, 0, 10, 10), (0, 0, 255)))
    menu(page, "image", "flipH")
    expect_pixel(page, 55, 5, (0, 0, 255, 255))
    menu(page, "image", "rotateCw")
    expect(page.locator("[data-testid=image-size]")).to_have_text("40 × 60")
    page.keyboard.press("Control+z")
    page.keyboard.press("Control+z")
    expect(page.locator("[data-testid=image-size]")).to_have_text("60 × 40")
    expect_pixel(page, 5, 5, (0, 0, 255, 255))

    menu(page, "image", "resize")
    page.fill("[data-testid=dlg-width]", "30")
    expect(page.locator("[data-testid=dlg-height]")).to_have_value("20")  # aspect ratio kept
    page.click("[data-testid=dlg-ok]")
    expect(page.locator("[data-testid=image-size]")).to_have_text("30 × 20")

    menu(page, "image", "canvasSize")
    page.fill("[data-testid=dlg-width]", "50")
    page.fill("[data-testid=dlg-height]", "40")
    page.click("[data-testid=dlg-ok]")  # centred
    expect(page.locator("[data-testid=image-size]")).to_have_text("50 × 40")
    assert pixel(page, 2, 2)[3] == 0  # new area is transparent
    expect_pixel(page, 12, 12, (0, 0, 255, 255))


def test_adjustments(app_page, tmp_path):
    page = ready_image(app_page, tmp_path, square=((20, 10, 40, 30), (200, 100, 50)))
    menu(page, "filters", "invert")
    expect_pixel(page, 5, 5, (0, 0, 0, 255))
    expect_pixel(page, 25, 15, (55, 155, 205, 255), 2)
    page.keyboard.press("Control+z")
    menu(page, "filters", "brightnessContrast")
    page.fill("[data-testid=adj-brightness]", "-50")
    page.click("[data-testid=dlg-cancel]")  # the preview is discarded
    expect_pixel(page, 5, 5, (255, 255, 255, 255))
    menu(page, "filters", "brightnessContrast")
    page.fill("[data-testid=adj-brightness]", "-50")
    page.click("[data-testid=dlg-ok]")
    expect_pixel(page, 5, 5, (128, 128, 128, 255), 2)
    menu(page, "filters", "grayscale")
    r, g, b, _ = pixel(page, 25, 15)
    assert abs(r - g) <= 2 and abs(g - b) <= 2
    menu(page, "filters", "sharpen")
    assert page.errors == []


def test_save_formats(app_page, tmp_path):
    page = ready_image(app_page, tmp_path, square=((20, 10, 40, 30), (0, 0, 255)))
    for fmt, ext, mode in (("jpeg", ".jpg", "JPEG"), ("webp", ".webp", "WEBP"), ("bmp", ".bmp", "BMP"), ("png", ".png", "PNG")):
        path = save_download(page, tmp_path, fmt, f"pic-{fmt}")
        assert path.name.endswith(f"pic-{fmt}{ext}")
        img = Image.open(path)
        assert img.format == mode and img.size == (60, 40)
        r, g, b = img.convert("RGB").getpixel((30, 20))
        assert r < 30 and g < 30 and b > 220
    # images in other formats open too
    Image.new("RGB", (16, 12), (0, 200, 0)).save(tmp_path / "x.gif")
    open_image(page, tmp_path / "x.gif")
    expect(page.locator("[data-testid=image-size]")).to_have_text("16 × 12")
    expect_pixel(page, 8, 6, (0, 200, 0, 255), 3)


def test_text_and_gradient(app_page, tmp_path):
    page = ready_image(app_page, tmp_path, size=(120, 60))
    page.click("[data-testid=tool-text]")
    click_at(page, 5, 5)
    page.fill("[data-testid=dlg-text]", "Hi")
    page.fill("[data-testid=dlg-fontSize]", "40")
    page.click("[data-testid=dlg-ok]")
    dark = page.evaluate("""() => { const d = IE.ed.doc.composite().getContext('2d').getImageData(0, 0, 60, 50).data;
      let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 100) n++; return n; }""")
    assert dark > 50

    page.fill("[data-testid=color-primary]", "#000000")
    page.fill("[data-testid=color-secondary]", "#ffffff")
    page.click("[data-testid=tool-select-rect]")
    drag(page, (0, 50), (119, 59))
    page.click("[data-testid=tool-gradient]")
    drag(page, (0, 55), (119, 55))
    left, right = pixel(page, 2, 55)[0], pixel(page, 117, 55)[0]
    assert left < 20 and right > 235
    expect_pixel(page, 100, 30, (255, 255, 255, 255))  # outside the selection: unchanged


def test_zoom(app_page, tmp_path):
    page = ready_image(app_page, tmp_path)
    expect(page.locator("[data-testid=zoom]")).to_have_text("100 %")
    page.click("[data-testid=zoom-in]")
    expect(page.locator("[data-testid=zoom]")).to_have_text("125 %")
    page.keyboard.press("1")
    expect(page.locator("[data-testid=zoom]")).to_have_text("100 %")
    box = page.locator("[data-testid=canvas]").bounding_box()
    page.mouse.move(box["x"] + 100, box["y"] + 100)
    page.keyboard.down("Control")
    page.mouse.wheel(0, -300)
    page.keyboard.up("Control")
    assert page.evaluate("IE.ed.view.zoom") > 1.25  # zoomed in (the step depends on the wheel delta the browser reports)


def test_german_interface(app_page):
    page = app_page("imageeditor", init_script="localStorage.setItem('suite.lang', 'de');")
    expect(page.locator("[data-testid=menu-file] summary")).to_have_text("Datei")
    expect(page.locator("[data-testid=tool-brush]")).to_have_attribute("title", "Pinsel (B)")


def test_mobile_layout(app_page, tmp_path):
    page = app_page("imageeditor", mobile=True, init_script=NO_PICKERS)
    open_image(page, make_png(tmp_path / "in.png"))
    expect(page.locator("[data-testid=tools]")).to_be_visible()
    expect(page.locator("[data-testid=side]")).to_be_hidden()
    page.click("[data-testid=toggle-panels]")
    expect(page.locator("[data-testid=side]")).to_be_visible()
    page.click("[data-testid=toggle-panels]")
    page.touchscreen.tap(*at(page, 30, 20))  # one finger paints
    expect_pixel(page, 30, 20, (0, 0, 0, 255), 30)
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert page.errors == []


def test_levels_and_curves(app_page, tmp_path):
    page = ready_image(app_page, tmp_path, color=(100, 100, 100), square=((20, 10, 40, 30), (200, 50, 20)))
    # levels: preview, cancel, apply
    menu(page, "filters", "levels")
    expect(page.locator("[data-testid=histogram]")).to_be_visible()
    page.fill("[data-testid=lv-black]", "50")
    page.fill("[data-testid=lv-white]", "200")
    page.wait_for_timeout(200)
    assert page.evaluate("!!IE.ed.preview")
    page.click("[data-testid=dlg-cancel]")
    expect_pixel(page, 5, 5, (100, 100, 100, 255), 0)
    menu(page, "filters", "levels")
    page.fill("[data-testid=lv-black]", "50")
    page.fill("[data-testid=lv-white]", "200")
    page.select_option("[data-testid=dlg-channel]", "r")
    expect(page.locator("[data-testid=histogram]")).to_have_attribute("data-channel", "r")
    page.fill("[data-testid=lv-outWhite]", "128")  # red only: at most 128
    page.click("[data-testid=dlg-ok]")
    expect_pixel(page, 5, 5, (43, 85, 85, 255), 1)  # (100-50)/150*255 = 85, red then *128/255
    expect_pixel(page, 25, 15, (128, 0, 0, 255), 1)
    page.keyboard.press("Control+z")
    expect_pixel(page, 5, 5, (100, 100, 100, 255), 0)
    # curves: a point in the middle of the line, dragged up, brightens the mid-tones
    menu(page, "filters", "curves")
    curve = page.locator("[data-testid=curve]")
    box = curve.bounding_box()
    pt = lambda x, y: (box["x"] + x / 255 * box["width"], box["y"] + (1 - y / 255) * box["height"])
    page.mouse.move(*pt(100, 100))
    page.mouse.down()
    page.mouse.move(*pt(100, 180), steps=5)
    page.mouse.up()
    expect(page.locator("[data-testid=curve-point]")).to_have_count(3)
    page.click("[data-testid=dlg-ok]")
    r, g, b, _ = pixel(page, 5, 5)
    assert abs(r - 180) <= 3 and r == g == b
    r2 = pixel(page, 25, 15)[0]
    assert 200 < r2 < 256  # monotone above the point
    assert page.errors == []


def selected_pixels(page):
    return page.evaluate("(() => { const m = IE.ed.doc.selectionMask(); return m ? m.reduce((n, v) => n + (v >= 128 ? 1 : 0), 0) : 0; })()")


def test_wand_lasso_and_selection_modes(app_page, tmp_path):
    page = ready_image(app_page, tmp_path, square=((20, 10, 40, 30), (200, 0, 0)))
    # magic wand: the red square; Shift adds the white rest
    page.click("[data-testid=tool-select-wand]")
    click_at(page, 25, 15)
    assert selected_pixels(page) == 400
    assert page.evaluate("IE.ed.doc.selection.type") == "mask"
    page.keyboard.down("Shift")
    click_at(page, 5, 5)
    page.keyboard.up("Shift")
    assert selected_pixels(page) == 60 * 40
    # Alt subtracts the square again; invert gives the square back
    page.keyboard.down("Alt")
    click_at(page, 25, 15)
    page.keyboard.up("Alt")
    assert selected_pixels(page) == 60 * 40 - 400
    page.keyboard.press("Control+Shift+I")
    assert selected_pixels(page) == 400
    # Delete clears only the selection
    page.keyboard.press("Delete")
    expect_pixel(page, 25, 15, (0, 0, 0, 0), 0)
    expect_pixel(page, 5, 5, (255, 255, 255, 255), 0)
    page.keyboard.press("Control+z")
    expect_pixel(page, 25, 15, (200, 0, 0, 255), 0)
    # the option "Intersect"
    page.select_option("[data-testid=opt-sel-op]", "intersect")
    click_at(page, 5, 5)  # white ∩ square = nothing
    assert page.evaluate("IE.ed.doc.selection") is None
    page.select_option("[data-testid=opt-sel-op]", "new")
    # lasso: a freehand triangle
    page.click("[data-testid=tool-select-lasso]")
    page.mouse.move(*at(page, 10, 5))
    page.mouse.down()
    for x, y in ((50, 5), (50, 35), (10, 5)):
        page.mouse.move(*at(page, x, y), steps=6)
    page.mouse.up()
    assert page.evaluate("IE.ed.doc.selection.type") == "poly"
    assert 500 < selected_pixels(page) < 700  # half of 40 × 30
    # polygon lasso: corners by clicks, closed on the first point
    page.click("[data-testid=tool-select-polygon]")
    for x, y in ((10, 10), (30, 10), (30, 30), (10, 30), (10, 10)):
        click_at(page, x, y)
    assert page.evaluate("IE.ed.doc.selection.type") == "poly"
    assert 350 < selected_pixels(page) < 500
    # Escape while drawing keeps the previous selection
    click_at(page, 40, 5)
    click_at(page, 50, 5)
    page.keyboard.press("Escape")
    assert 350 < selected_pixels(page) < 500
    assert page.errors == []


def test_clone_heal_smudge_blur(app_page, tmp_path):
    page = ready_image(app_page, tmp_path, size=(80, 60), square=((10, 10, 30, 30), (255, 0, 0)))
    page.keyboard.press("s")
    expect(page.locator("[data-testid=tool-clone]")).to_have_attribute("aria-pressed", "true")
    page.evaluate("IE.ed.opts.size = 12; IE.ed.opts.opacity = 1")
    # Alt+click sets the source, painting copies from it
    page.keyboard.down("Alt")
    click_at(page, 20, 20)
    page.keyboard.up("Alt")
    drag(page, (55, 20), (60, 20))
    expect_pixel(page, 58, 20, (255, 0, 0, 255), 10)
    expect_pixel(page, 45, 20, (255, 255, 255, 255), 0)
    # aligned: the next stroke keeps the offset (source 35 px to the left: white)
    drag(page, (55, 45), (58, 45))
    expect_pixel(page, 56, 45, (255, 255, 255, 255), 0)
    # not aligned, source set with the option button (touch screens): every stroke starts at the source
    page.evaluate("IE.ed.opts.aligned = false; IE.ed.opts.pickSource = true")
    click_at(page, 20, 20)
    drag(page, (60, 48), (62, 48))
    expect_pixel(page, 61, 48, (255, 0, 0, 255), 10)
    page.keyboard.press("Control+z")
    expect_pixel(page, 61, 48, (255, 255, 255, 255), 0)

    # smudge drags the red out of the square
    page.keyboard.press("u")
    page.evaluate("IE.ed.opts.size = 8; IE.ed.opts.opacity = 0.9")
    drag(page, (24, 20), (40, 20), steps=16)
    r, g, b, _ = pixel(page, 33, 20)
    assert r > 200 and g < 200, (r, g, b)

    # blur softens the edge of the square
    page.keyboard.press("k")
    page.evaluate("IE.ed.opts.size = 10; IE.ed.opts.opacity = 1; IE.ed.opts.blurMode = 'blur'")
    drag(page, (14, 30), (26, 30))  # along the lower edge (the smudge changed the right one)
    r, g, b, _ = pixel(page, 20, 30)
    assert r > 200 and 40 < g < 230, (r, g, b)
    assert page.errors == []


def test_healing_matches_the_surroundings(app_page, tmp_path):
    # left: dark grey with a dot texture, right: light grey; healing takes the texture but keeps the brightness
    img = Image.new("RGBA", (80, 40), (200, 200, 200, 255))
    for x in range(0, 40):
        for y in range(40):
            img.putpixel((x, y), (60, 60, 60, 255) if (x + y) % 4 == 0 else (100, 100, 100, 255))
    img.save(tmp_path / "heal.png")
    page = app_page("imageeditor", init_script=NO_PICKERS)
    open_image(page, tmp_path / "heal.png")
    expect(page.locator("[data-testid=image-size]")).to_have_text("80 × 40")
    page.keyboard.press("j")
    page.evaluate("IE.ed.opts.size = 14; IE.ed.opts.opacity = 1")
    page.keyboard.down("Alt")
    click_at(page, 15, 20)
    page.keyboard.up("Alt")
    drag(page, (62, 20), (64, 20))
    values = page.evaluate("""() => Array.from(IE.ed.doc.composite().getContext('2d').getImageData(60, 18, 6, 5).data).filter((v, i) => i % 4 === 0)""")
    mean = sum(values) / len(values)
    assert 165 < mean < 235, values  # the brightness of the right side, not the dark source (~90)
    assert max(values) - min(values) > 15, values  # with the texture of the source
    assert page.errors == []


def test_photoshop_psd(app_page, tmp_path):
    from psd_tools import PSDImage
    from psd_tools.api.layers import PixelLayer
    psd = PSDImage.new(mode="RGB", size=(60, 40))
    psd.append(PixelLayer.frompil(Image.new("RGBA", (60, 40), (255, 0, 0, 255)), psd, "Hintergrund", 0, 0))
    blue = PixelLayer.frompil(Image.new("RGBA", (20, 20), (0, 0, 255, 255)), psd, "Blau", 10, 10)
    blue.opacity = 128
    psd.append(blue)
    hidden = PixelLayer.frompil(Image.new("RGBA", (10, 10), (0, 255, 0, 255)), psd, "Versteckt", 0, 40)
    hidden.visible = False
    psd.append(hidden)
    psd.save(tmp_path / "ebenen.psd")

    page = app_page("imageeditor", init_script=NO_PICKERS)
    open_image(page, tmp_path / "ebenen.psd")
    expect(page.locator("[data-testid=image-size]")).to_have_text("60 × 40")
    assert page.evaluate("IE.ed.doc.layers.map((l) => [l.name, l.visible, Math.round(l.opacity * 100)])") == [["Hintergrund", True, 100], ["Blau", True, 50], ["Versteckt", False, 100]]
    expect_pixel(page, 15, 15, (127, 0, 128, 255), 3)  # blue at 50 % over red, at its position
    expect_pixel(page, 45, 5, (255, 0, 0, 255), 0)  # the hidden layer is not shown
    # paint on the blue layer and save as PSD again: layers, opacity and visibility are kept
    page.evaluate("IE.ed.doc.active = 1")
    page.click("[data-testid=tool-pencil]")
    page.evaluate("IE.ed.opts.size = 2; IE.ed.colors.primary = '#ffffff'")
    click_at(page, 20, 20)
    path = save_download(page, tmp_path, "psd")
    assert path.name.endswith(".psd")
    saved = PSDImage.open(path)
    assert [(l.name, l.visible) for l in saved] == [("Hintergrund", True), ("Blau", True), ("Versteckt", False)]
    assert abs(saved[1].opacity - 128) <= 1
    assert saved.composite().getpixel((15, 15))[:3] == (127, 0, 128) or max(abs(a - b) for a, b in zip(saved.composite().getpixel((15, 15))[:3], (127, 0, 128))) <= 3
    assert saved[1].composite().getpixel((20, 20))[:3] == (255, 255, 255)
    # and opened again
    open_image(page, path)
    expect(page.locator("[data-testid=layer]")).to_have_count(3)
    assert page.errors == []
