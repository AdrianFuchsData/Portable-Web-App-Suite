"""Colour picker (shared/js/colorpicker.js) and colour swatches in the text editor (shared/js/cm-colors.js): picking by
hex, channels, swatches, the keyboard; live preview, one undo step, cancel; the form of the colour in the text; every
<input type="color"> of the suite; the setting for the browser's own picker; the phone layout."""
import re

from playwright.sync_api import expect

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"
CSS = "a { color: #6cf; background: #66CCFF; border: #66ccff80; } /* #123 */\n.b { color: #ABCD; }\n"


def editor_text(page):
    return page.evaluate("TE.app.view.state.doc.toString()")


def open_text(page, name, text):
    page.evaluate("([n, s]) => TE.app.openPicked([{ file: new File([s], n) }])", [name, text])


def test_swatches_and_editing_in_the_text_editor(app_page):
    page = app_page("texteditor", init_script=NO_PICKERS)
    open_text(page, "a.css", CSS)
    swatches = page.locator("[data-testid=color-swatch-inline]")
    expect(swatches).to_have_count(5)  # in CSS, #123 is a colour too
    picker = page.locator("[data-testid=color-picker]")
    # live while picking, one undo step, the short form kept where possible
    swatches.nth(0).click()
    expect(picker).to_be_visible()
    expect(page.locator("[data-testid=color-hex]")).to_have_value("#66ccff")
    page.fill("[data-testid=color-hex]", "#ff0000")
    assert editor_text(page).startswith("a { color: #f00;")
    page.click("[data-testid=color-ok]")
    expect(picker).to_have_count(0)
    assert editor_text(page).startswith("a { color: #f00;")
    page.keyboard.press("Control+z")
    assert editor_text(page) == CSS
    # upper case stays upper case; a colour that has no short form gets the long one; opacity adds the alpha part
    swatches.nth(1).click()
    page.fill("[data-testid=color-hex]", "#abcdef")
    page.fill("[data-testid=color-a]", "50")
    page.keyboard.press("Enter")
    assert editor_text(page).startswith("a { color: #6cf; background: #ABCDEF80;")
    # cancel restores the original
    swatches.nth(2).click()
    page.fill("[data-testid=color-hex]", "#000000")
    assert "border: #000000" in editor_text(page)
    page.keyboard.press("Escape")
    assert "border: #66ccff80;" in editor_text(page)
    # an all-digit "colour" in Markdown or plain text is an issue number, not a colour; HTML entities neither
    open_text(page, "notes.md", "Fixed in #123, colour #fa0, &#123;\n")
    expect(swatches).to_have_count(1)
    assert page.errors == []


def test_picker_controls(app_page):
    page = app_page("texteditor", init_script=NO_PICKERS)
    open_text(page, "c.css", "x { color: #808080; }\n")
    page.locator("[data-testid=color-swatch-inline]").click()
    hex_field = page.locator("[data-testid=color-hex]")
    # RGB fields
    page.fill("[data-testid=color-r]", "255")
    expect(hex_field).to_have_value("#ff8080")
    # keyboard on the area and the hue slider
    page.locator("[data-testid=color-area]").focus()
    page.keyboard.press("Shift+ArrowUp")
    page.locator("[data-testid=color-hue]").focus()
    page.keyboard.press("Shift+ArrowRight")
    page.keyboard.press("Shift+ArrowRight")
    assert hex_field.input_value() != "#ff8080"
    # a basic colour, then OK; it appears under the recently used colours next time
    page.click("[data-testid=color-swatch][data-color='#0080ff']")
    expect(hex_field).to_have_value("#0080ff")
    page.click("[data-testid=color-ok]")
    assert editor_text(page) == "x { color: #0080ff; }\n"
    page.locator("[data-testid=color-swatch-inline]").click()
    expect(page.locator("[data-testid=color-recent] [data-testid=color-swatch]").first).to_have_attribute("data-color", "#0080ff")
    page.click("[data-testid=color-cancel]")
    assert page.errors == []


def test_color_inputs_of_the_apps(app_page):
    page = app_page("diagram", init_script=NO_PICKERS)
    page.click("[data-testid=shape-rect]")
    page.evaluate("DG.app.selection = new Set([DG.page().shapes[0].id])")
    page.click("[data-testid=zoom-fit]")
    fill = page.locator("[data-testid=fmt-fill]")
    fill.click()
    picker = page.locator("[data-testid=color-picker]")
    expect(picker).to_be_visible()  # the suite's picker instead of the browser's
    page.fill("[data-testid=color-hex]", "#ff0000")
    assert page.evaluate("DG.page().shapes[0].style.fill") == "#ff0000"  # live
    page.click("[data-testid=color-ok]")
    expect(fill).to_have_value("#ff0000")
    assert page.evaluate("DG.page().shapes[0].style.fill") == "#ff0000"
    # cancelled: the previous colour again
    fill.click()
    page.fill("[data-testid=color-hex]", "#00ff00")
    page.click("[data-testid=color-cancel]")
    expect(fill).to_have_value("#ff0000")
    assert page.evaluate("DG.page().shapes[0].style.fill") == "#ff0000"
    assert page.errors == []


def test_browser_picker_setting(app_page):
    page = app_page("diagram", init_script=NO_PICKERS)
    page.keyboard.press("F1")
    page.click("[data-testid=prefs] > summary")
    setting = page.locator("[data-testid=pref-colors]")
    expect(setting).to_have_value("own")
    setting.select_option("browser")
    page.keyboard.press("Escape")
    assert page.evaluate("localStorage.getItem('suite.colors.native')") == "1"
    page.click("[data-testid=shape-rect]")
    page.evaluate("DG.app.selection = new Set([DG.page().shapes[0].id])")
    page.click("[data-testid=zoom-fit]")
    page.locator("[data-testid=fmt-fill]").click()
    expect(page.locator("[data-testid=color-picker]")).to_have_count(0)  # the browser's picker (not visible to the test)
    page.keyboard.press("Escape")
    assert page.errors == []


def test_phone_sheet(app_page):
    page = app_page("texteditor", mobile=True, init_script=NO_PICKERS)
    open_text(page, "a.css", "a { color: #6cf; }\n")
    page.locator("[data-testid=color-swatch-inline]").click()
    picker = page.locator("[data-testid=color-picker]")
    expect(picker).to_be_visible()
    box = picker.bounding_box()
    assert box["x"] >= 0 and box["x"] + box["width"] <= page.viewport_size["width"] + 1
    assert box["y"] + box["height"] <= page.viewport_size["height"] + 1
    page.click("[data-testid=color-swatch][data-color='#ff0000']")
    page.click("[data-testid=color-ok]")
    assert re.search(r"color: #f00;", editor_text(page))
    assert page.errors == []
