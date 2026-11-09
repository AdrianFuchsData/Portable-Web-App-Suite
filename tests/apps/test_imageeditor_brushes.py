"""Image editor: brush tips (apps/imageeditor/src/js/brushes.js) – generated shapes, hardness, spacing, angle, pen pressure, own
tips from GIMP .gbr / .vbr files and images."""
import struct

from playwright.sync_api import expect

from test_imageeditor import drag, click_at, close_drawer, expect_pixel, pixel
from test_imageeditor_selection import ready


def gbr(path, w, h, pixels, name="Cross", spacing=20):
    data = name.encode() + b"\0"
    path.write_bytes(struct.pack(">IIIII", 28 + len(data), 2, w, h, 1) + b"GIMP" + struct.pack(">I", spacing) + data + bytes(pixels))
    return path


def brush(page, size=20, **opts):
    close_drawer(page)
    page.click("[data-testid=tool-brush]")
    page.evaluate("([size, opts]) => { IE.ed.opts.size = size; Object.assign(IE.ed.opts.brush, opts); }", [size, opts])


def load_tips(page, *paths):
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=tip-load]")
    chooser.value.set_files([str(p) for p in paths])


def test_generated_tips_hardness_spacing(app_page, tmp_path):
    page = ready(app_page, tmp_path, size=(120, 80))
    page.fill("[data-testid=color-primary]", "#000000")
    expect(page.locator("[data-testid=brush-options]")).to_be_visible()
    # default: the hard round tip – a clean dot of the size
    brush(page, 20)
    click_at(page, 20, 20)
    expect_pixel(page, 20, 20, (0, 0, 0, 255))
    assert pixel(page, 20, 28)[0] < 10 and pixel(page, 20, 32)[0] == 255 and pixel(page, 28, 28)[0] == 255  # (round: no corner)
    # square: the corner is painted
    page.click("[data-testid=tip-square]")
    click_at(page, 60, 20)
    assert pixel(page, 68, 28)[0] < 10
    # soft: full in the middle, partly towards the edge
    page.click("[data-testid=tip-soft]")
    assert page.evaluate("IE.ed.opts.brush.hardness") == 30
    click_at(page, 100, 20)
    assert pixel(page, 100, 20)[0] < 30 and 60 < pixel(page, 100, 27)[0] < 250
    # spacing 200 %: separate dabs with gaps between them
    page.click("[data-testid=tip-round]")
    brush(page, 6, spacing=200)
    drag(page, (10, 60), (110, 60), steps=20)
    row = [pixel(page, x, 60)[0] for x in range(10, 60)]
    assert min(row) < 10 and max(row) == 255
    page.keyboard.press("Control+z")
    brush(page, 6, spacing=10)
    drag(page, (10, 60), (110, 60), steps=20)
    assert max(pixel(page, x, 60)[0] for x in range(12, 100)) < 10  # a continuous line
    assert page.errors == []


def test_angle_aspect_and_pressure(app_page, tmp_path):
    page = ready(app_page, tmp_path, size=(120, 80))
    # calligraphy: a flat tip turned by 45° (+ angle), seen in the mask directly
    m = page.evaluate("""() => { const b = IE.brushes; const tip = b.tipById('calligraphy');
      const at = (mask, x, y) => mask.alpha[y * mask.width + x];
      const a = b.tipMask(tip, 31), c = b.tipMask(tip, 31, { angle: 90 });
      return [at(a, 22, 22), at(a, 22, 9), at(c, 22, 9), at(c, 22, 22)]; }""")
    assert (m[0] > 0.5 and m[1] < 0.1 and m[2] > 0.5 and m[3] < 0.1) or (m[1] > 0.5 and m[0] < 0.1 and m[3] > 0.5 and m[2] < 0.1), m
    # a star: five spikes
    star = page.evaluate("""() => { const t = IE.brushes.tipMask(IE.brushes.tipById('star'), 41); return Array.from(t.alpha).filter((v) => v > 0.5).length; }""")
    count = lambda tip: page.evaluate(f"() => Array.from(IE.brushes.tipMask(IE.brushes.tipById('{tip}'), 41).alpha).filter((v) => v > 0.5).length")
    assert count("diamond") < star < 0.85 * count("round")
    # pen pressure: half the pressure, half the size (and with opacity: half the paint)
    r = page.evaluate("""() => { const b = IE.brushes; const c = document.createElement('canvas'); c.width = 60; c.height = 30;
      const s = new b.Stroke(c, { tip: b.tipById('round'), size: 20, spacing: 10, pressureSize: true, pressureOpacity: true, color: '#000000' });
      s.dab({ x: 15, y: 15 }, 1); s.dab({ x: 45, y: 15 }, 0.5); s.flush();
      const a = (x, y) => c.getContext('2d').getImageData(x, y, 1, 1).data[3];
      return [a(15, 15), a(15, 23), a(45, 15), a(45, 23), a(45, 19)]; }""")
    assert r[0] == 255 and r[1] > 200 and 110 < r[2] < 145 and r[3] == 0 and r[4] > 100
    assert page.errors == []


def test_own_tips_gbr_vbr_image(app_page, tmp_path):
    page = ready(app_page, tmp_path, size=(120, 80))
    page.fill("[data-testid=color-primary]", "#000000")
    brush(page, 15)
    # a GIMP brush: a diagonal cross (3 pixels wide), 15×15
    px = [255 if abs(x - y) <= 1 or abs(x - (14 - y)) <= 1 else 0 for y in range(15) for x in range(15)]
    load_tips(page, gbr(tmp_path / "cross.gbr", 15, 15, px))
    expect(page.locator("[data-testid=tip-own]")).to_have_count(1)
    assert page.evaluate("IE.ed.opts.brush.spacing") == 20 and page.locator("[data-testid=opt-brush-hardness]").count() == 0
    click_at(page, 30, 30)
    assert pixel(page, 30, 30)[0] < 60 and pixel(page, 25, 25)[0] < 60 and pixel(page, 30, 25)[0] > 200  # on the cross, not beside it
    # stored in the browser (and in exported settings): there after a reload
    assert "cross" in page.evaluate("localStorage.getItem('suite.imageeditor.brushes')").lower()
    # a parametric brush and an image (dark square on white)
    (tmp_path / "flat.vbr").write_text("GIMP-VBR\n1.5\nFlat\nsquare\n30\n10\n2\n1\n1\n0\n")
    from PIL import Image
    img = Image.new("RGB", (40, 40), "white")
    img.paste((0, 0, 0), (10, 10, 30, 30))
    img.save(tmp_path / "square.png")
    load_tips(page, tmp_path / "flat.vbr", tmp_path / "square.png")
    expect(page.locator("[data-testid=tip-own]")).to_have_count(3)
    own = page.evaluate("JSON.parse(localStorage.getItem('suite.imageeditor.brushes')).map((t) => [t.name, !!t.vbr, !!t.gbr])")
    assert own == [["Cross", False, True], ["Flat", True, False], ["square", False, True]]
    assert page.evaluate("IE.ed.opts.brush.tip") == page.evaluate("JSON.parse(localStorage.getItem('suite.imageeditor.brushes'))[2].id")
    brush(page, 20)
    click_at(page, 80, 40)
    assert pixel(page, 80, 40)[0] < 20 and pixel(page, 80, 46)[0] > 200  # the picture's square (half of the tip), not the whole tip
    page.locator("[data-testid=tip-remove]").first.click()
    expect(page.locator("[data-testid=tip-own]")).to_have_count(2)
    # a broken file: a message, nothing added
    (tmp_path / "bad.gbr").write_bytes(b"nonsense")
    load_tips(page, tmp_path / "bad.gbr")
    expect(page.locator("[data-testid=tip-own]")).to_have_count(2)
    page.reload()
    expect(page.locator("[data-testid=tool-brush]")).to_be_visible()
    page.click("[data-testid=tool-brush]")
    expect(page.locator("[data-testid=tip-own]")).to_have_count(2)
    assert page.errors == []
