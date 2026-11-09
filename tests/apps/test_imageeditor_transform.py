"""Image editor: rotate by any angle (expand, keep, crop), straighten, the crop tool with aspect ratios."""
import math

from playwright.sync_api import expect

from test_imageeditor import close_drawer, drag, expect_pixel, menu, pixel
from test_imageeditor_selection import ready


def size(page):
    return tuple(page.evaluate("[IE.ed.doc.width, IE.ed.doc.height]"))


def rotate(page, angle, mode):
    menu(page, "image", "rotateAngle")
    page.fill("[data-testid=dlg-rotate-angle]", str(angle))
    page.check(f"[data-testid=dlg-rotate-{mode}]")
    page.click("[data-testid=dlg-ok]")
    expect(page.locator("[data-testid=dialog]")).to_have_count(0)


def test_rotate_by_angle(app_page, tmp_path):
    page = ready(app_page, tmp_path, size=(200, 100), color=(0, 0, 255))
    rotate(page, 30, "expand")
    w, h = size(page)
    assert (w, h) == (math.ceil(200 * math.cos(math.pi / 6) + 100 * 0.5), math.ceil(200 * 0.5 + 100 * math.cos(math.pi / 6)))
    assert pixel(page, 0, 0)[3] == 0 and pixel(page, w // 2, h // 2) == (0, 0, 255, 255)
    page.keyboard.press("Control+z")
    rotate(page, -30, "keep")
    assert size(page) == (200, 100) and pixel(page, 0, 0)[3] == 0
    page.keyboard.press("Control+z")
    rotate(page, 10, "crop")
    w, h = size(page)
    s = min(200 / (200 * math.cos(math.radians(10)) + 100 * math.sin(math.radians(10))), 100 / (200 * math.sin(math.radians(10)) + 100 * math.cos(math.radians(10))))
    assert (w, h) == (math.floor(200 * s), math.floor(100 * s)) and abs(w / h - 2) < 0.05
    for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:  # no empty corners
        assert pixel(page, x, y)[3] > 200, (x, y)
    assert page.errors == []


def test_straighten(app_page, tmp_path):
    page = ready(app_page, tmp_path, size=(200, 120))
    close_drawer(page)
    page.click("[data-testid=tool-brush]")
    menu(page, "image", "straighten")
    expect(page.locator("[data-testid=tool-brush]")).to_have_attribute("aria-pressed", "false")
    # a line rising 10 pixels over 100: turn by about +5.7° (clockwise) to make it level
    drag(page, (40, 70), (140, 60))
    expect(page.locator("[data-testid=dlg-rotate-angle]")).to_be_visible()
    angle = float(page.input_value("[data-testid=dlg-rotate-angle]"))
    assert abs(angle - math.degrees(math.atan2(10, 100))) < 1.2
    assert page.is_checked("[data-testid=dlg-rotate-crop]")
    page.click("[data-testid=dlg-ok]")
    assert size(page)[0] < 200
    expect(page.locator("[data-testid=tool-brush]")).to_have_attribute("aria-pressed", "true")  # (back to the tool before)
    # almost vertical: upright
    assert page.evaluate("IE.ed.tool.id") == "brush"
    assert page.errors == []


def test_crop_tool_with_ratios(app_page, tmp_path):
    page = ready(app_page, tmp_path, size=(200, 120), color=(255, 0, 0))
    close_drawer(page)
    page.keyboard.press("c")
    expect(page.locator("[data-testid=tool-crop]")).to_have_attribute("aria-pressed", "true")
    page.select_option("[data-testid=opt-crop-ratio]", "1:1")
    drag(page, (20, 20), (100, 50))
    r = page.evaluate("IE.ed.cropRect")
    assert r["w"] == r["h"] and r["w"] >= 79
    expect(page.locator("[data-testid=crop-info]")).to_have_text(f"{r['w']} × {r['h']}")
    page.keyboard.press("Escape")
    assert page.evaluate("IE.ed.cropRect") is None
    page.select_option("[data-testid=opt-crop-ratio]", "16:9")
    drag(page, (10, 10), (170, 20))
    r = page.evaluate("IE.ed.cropRect")
    assert abs(r["w"] / r["h"] - 16 / 9) < 0.05
    page.keyboard.press("Enter")
    assert size(page) == (r["w"], r["h"])
    expect_pixel(page, 5, 5, (255, 0, 0, 255))
    page.keyboard.press("Control+z")
    assert size(page) == (200, 120)
    # portrait when dragged taller than wide; the button crops
    page.select_option("[data-testid=opt-crop-ratio]", "3:2")
    drag(page, (10, 10), (30, 100))
    r = page.evaluate("IE.ed.cropRect")
    assert abs(r["h"] / r["w"] - 1.5) < 0.05
    page.click("[data-testid=crop-apply]")
    assert size(page) == (r["w"], r["h"])
    assert page.errors == []
