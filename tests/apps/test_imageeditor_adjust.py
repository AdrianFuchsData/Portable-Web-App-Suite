"""Image editor: pixel adjustments (filters.js PIXEL_ADJUSTMENTS) with live preview, through the selection, undoable."""
from PIL import Image
from playwright.sync_api import expect

from test_imageeditor import expect_pixel, open_image, pixel, NO_PICKERS


def ready(app_page, tmp_path, img):
    img.save(tmp_path / "in.png")
    page = app_page("imageeditor", init_script=NO_PICKERS)
    open_image(page, tmp_path / "in.png")
    expect(page.locator("[data-testid=image-size]")).to_have_text(f"{img.width} × {img.height}")
    return page


def adjust(page, kind, **values):
    page.click("[data-testid=menu-filters] summary")
    page.click(f'[data-testid="cmd-adj.{kind}"]')
    expect(page.locator("[data-testid=dialog]")).to_be_visible()
    for key, value in values.items():
        el = page.locator(f"[data-testid=padj-{key}]")
        if isinstance(value, bool):
            el.set_checked(value)
        elif isinstance(value, str):
            el.select_option(value)
        else:
            el.fill(str(value))
    page.wait_for_function("() => IE.ed.preview !== null")


def ok(page):
    page.click("[data-testid=dlg-ok]")
    expect(page.locator("[data-testid=dialog]")).to_have_count(0)


def gradient(w=64, h=16):
    img = Image.new("RGB", (w, h))
    for x in range(w):
        for y in range(h):
            img.putpixel((x, y), (x * 4, x * 4, x * 4))
    return img


def test_threshold_posterize_preview_and_selection(app_page, tmp_path):
    page = ready(app_page, tmp_path, gradient())
    adjust(page, "threshold", level=128)
    assert pixel(page, 10, 5) == (40, 40, 40, 255)  # (the preview does not change the layer)
    ok(page)
    assert pixel(page, 10, 5)[:3] == (0, 0, 0) and pixel(page, 40, 5)[:3] == (255, 255, 255)
    page.keyboard.press("Control+z")
    expect_pixel(page, 10, 5, (40, 40, 40, 255), 0)
    # Escape cancels
    adjust(page, "posterize", levels=2)
    page.keyboard.press("Escape")
    assert page.evaluate("IE.ed.preview") is None and pixel(page, 10, 5) == (40, 40, 40, 255)
    # only inside the selection; a feathered one partly
    page.evaluate("IE.ed.doc.selection = { type: 'rect', x: 0, y: 0, w: 32, h: 16 }")
    adjust(page, "posterize", levels=2)
    ok(page)
    assert pixel(page, 10, 5)[:3] == (0, 0, 0) and pixel(page, 50, 5)[:3] == (200, 200, 200)
    assert page.errors == []


def test_colour_balance_vibrance_vignette(app_page, tmp_path):
    page = ready(app_page, tmp_path, Image.new("RGB", (60, 40), (120, 120, 120)))
    adjust(page, "colorBalance", cyanRed=60, preserve=False)
    ok(page)
    r, g, b, _ = pixel(page, 30, 20)
    assert r > 150 and g == 120 and b == 120
    page.keyboard.press("Control+z")
    # per tone range: highlights do not change a mid-grey much; luminosity preserved
    adjust(page, "colorBalance", range="highlights", yellowBlue=100)
    ok(page)
    r, g, b, _ = pixel(page, 30, 20)
    assert b - r < 30
    page.keyboard.press("Control+z")
    adjust(page, "colorBalance", yellowBlue=80, preserve=True)
    ok(page)
    r, g, b, _ = pixel(page, 30, 20)
    assert b > r and abs((0.299 * r + 0.587 * g + 0.114 * b) - 120) < 3
    page.keyboard.press("Control+z")
    # vignette: corners darker, centre unchanged
    adjust(page, "vignette", amount=100, size=40, softness=50)
    ok(page)
    assert pixel(page, 30, 20)[:3] == (120, 120, 120) and pixel(page, 0, 0)[0] < 40
    assert page.errors == []


def test_vibrance_unsharp_median(app_page, tmp_path):
    img = Image.new("RGB", (60, 40), (140, 120, 110))  # a dull colour
    img.paste((255, 0, 0), (40, 0, 60, 40))  # a saturated one
    page = ready(app_page, tmp_path, img)
    adjust(page, "vibrance", vibrance=100)
    ok(page)
    r, g, b, _ = pixel(page, 10, 10)
    assert r - b > 30 + 5  # duller colour got more saturated
    assert pixel(page, 50, 10)[:3] == (255, 0, 0)
    # median removes a single bright dot (salt noise)
    page.keyboard.press("Control+z")
    page.evaluate("""() => { const ctx = IE.ed.doc.layer.canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(10, 10, 1, 1); IE.ed.render(); }""")
    assert pixel(page, 10, 10)[:3] == (255, 255, 255)
    adjust(page, "median", radius=1)
    ok(page)
    assert pixel(page, 10, 10)[:3] == (140, 120, 110)
    # unsharp mask raises the contrast at the edge
    page.keyboard.press("Control+z")
    before = pixel(page, 38, 20)
    adjust(page, "unsharpMask", radius=3, amount=200)
    ok(page)
    after = pixel(page, 38, 20)
    assert after[1] > before[1] + 10  # (beside red: green goes up, away from the red neighbour)
    assert page.errors == []
