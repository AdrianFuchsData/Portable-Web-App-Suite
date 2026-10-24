"""Spell checking in text fields and editors (shared/js/spell.js, spell-dom.js, cm-spell.js): the header selector, marks in
CodeMirror, textareas (mirror) and contenteditable elements, the suggestion menu, the shared setting, personal words."""
import zipfile

import pytest
from playwright.sync_api import expect

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"
ON = NO_PICKERS + "localStorage.setItem('suite.spell.enabled', '1'); localStorage.setItem('suite.spell.language', '{0}');"


def marks(page):
    return page.evaluate("CSS.highlights.get('suite-spell') ? CSS.highlights.get('suite-spell').size : -1")


def right_click_field(page, selector, offset):
    """Right click in a text field with the caret at offset (as the browser places it there on a right click)."""
    page.evaluate("""([sel, offset]) => { const el = document.querySelector(sel); el.focus(); el.setSelectionRange(offset, offset);
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 10 })); }""", [selector, offset])


def test_text_editor_german(app_page):
    page = app_page("texteditor", init_script=NO_PICKERS)
    select = page.locator("[data-testid=spell-select]")
    expect(select).to_have_value("off")
    expect(select.locator("option")).to_have_text(["ABC Spelling off", "ABC✓ English (US)", "ABC✓ German (Germany)", "Load dictionary…"])
    select.select_option("de_DE")
    page.locator(".cm-content").click()
    page.keyboard.type("Die Rechtschreibprüfung im Gesundheitsministerium ist schön, aber der Weg ist krum. Fehlerr")
    expect(page.locator(".cm-spell-error")).to_have_text(["krum", "Fehlerr"], timeout=20000)
    page.locator(".cm-spell-error").first.click(button="right")
    menu = page.locator("[data-testid=spell-menu]")
    expect(menu.locator("[data-testid=spell-menu-suggestion]").first).to_have_text("krumm")
    menu.locator("[data-testid=spell-menu-suggestion]").first.click()
    expect(page.locator(".cm-spell-error")).to_have_text(["Fehlerr"])
    assert "ist krumm. Fehlerr" in page.evaluate("TE.app.view.state.doc.toString()")
    # ignored for this session; added words stay (all apps, all languages)
    page.locator(".cm-spell-error").click(button="right")
    page.click("[data-testid=spell-menu-add]")
    expect(page.locator(".cm-spell-error")).to_have_count(0)
    assert page.evaluate("JSON.parse(localStorage.getItem('suite.spell.words'))") == ["Fehlerr"]
    # off: no marks
    select.select_option("off")
    expect(page.locator(".cm-spell-error")).to_have_count(0)
    assert page.errors == []


def test_code_only_comments_and_strings(app_page, tmp_path):
    page = app_page("texteditor", init_script=ON.format("en_US"))
    path = tmp_path / "code.py"
    path.write_text("def speling_helper(valu):\n    # this coment is checked\n    return 'a strng' + valu\n")
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=open]")
    chooser.value.set_files(str(path))
    expect(page.locator(".cm-spell-error")).to_have_text(["coment", "strng"], timeout=20000)
    assert page.errors == []


@pytest.mark.parametrize("app", ["mail"])
def test_textarea_and_rich_text(app_page, app):
    page = app_page(app, init_script=ON.format("en_US"))
    page.click("[data-testid=new-message]")
    text = page.locator("[data-testid=compose-text]")
    text.fill("Hello wrold, this is a tset.")
    page.wait_for_function("() => CSS.highlights.get('suite-spell').size === 2", timeout=20000)
    assert text.get_attribute("spellcheck") == "false"  # the browser's own checking is off meanwhile
    right_click_field(page, "[data-testid=compose-text]", 8)
    page.locator("[data-testid=spell-menu-suggestion]", has_text="world").click()
    expect(text).to_have_value("Hello world, this is a tset.")
    page.wait_for_function("() => CSS.highlights.get('suite-spell').size === 1")
    right_click_field(page, "[data-testid=compose-text]", 24)
    page.click("[data-testid=spell-menu-ignore]")
    page.wait_for_function("() => CSS.highlights.get('suite-spell').size === 0")
    # the subject is checked too (data-spell)
    page.fill("[data-testid=compose-subject]", "Meeting tomorow")
    page.wait_for_function("() => CSS.highlights.get('suite-spell').size === 1")
    # formatted (contenteditable) text
    page.check("[data-testid=compose-mode]")
    editor = page.locator("[data-testid=compose-html]")
    editor.click()
    page.keyboard.press("Control+End")
    page.keyboard.type(" Anothr line.")
    page.wait_for_function("() => CSS.highlights.get('suite-spell').size === 2")
    # Shift+right click keeps the browser's menu
    page.evaluate("""() => { const el = document.querySelector('[data-testid=compose-html]'); const r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, shiftKey: true, clientX: r.left + 5, clientY: r.top + 5 })); }""")
    expect(page.locator("[data-testid=spell-menu]")).to_have_count(0)
    # off: marks removed, the browser's checking back
    page.select_option("[data-testid=spell-select]", "off")
    page.wait_for_function("() => CSS.highlights.get('suite-spell').size === 0")
    assert text.count() == 0 or text.get_attribute("spellcheck") is None
    assert page.errors == []


def test_setting_shared_and_dictionary_from_header(app_page, tmp_path):
    from helpers.paths import dist_url
    page = app_page("calendar", init_script=NO_PICKERS)
    page.select_option("[data-testid=spell-select]", "de_DE")
    if page.context.browser.browser_type.name == "chromium":  # (Firefox keeps the storage of file:// pages per file)
        page.wait_for_timeout(1000)  # (Chromium passes storage writes on to other renderer processes with a delay)
        page2 = page.context.new_page()
        page2.goto(dist_url("keepass"))
        expect(page2.locator("[data-testid=spell-select]")).to_have_value("de_DE")
    # a LibreOffice dictionary extension, from the header
    oxt = tmp_path / "dict-test.oxt"
    with zipfile.ZipFile(oxt, "w") as z:
        z.writestr("dictionaries/xx_TEST.aff", "SET ISO8859-1\n".encode("latin-1"))
        z.writestr("dictionaries/xx_TEST.dic", "2\nGrüße\nHallo\n".encode("latin-1"))
    with page.expect_file_chooser() as chooser:
        page.select_option("[data-testid=spell-select]", "load")
    chooser.value.set_files(str(oxt))
    expect(page.locator("[data-testid=spell-select]")).to_have_value("xx_TEST")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("xx_TEST")
    assert page.evaluate("async () => { const { spell } = await import('app/spell'); await spell.ready(); return [spell.isWrong('Grüße'), spell.isWrong('Grüsse')]; }") == [False, True]
    assert page.errors == []


def test_phone_menu_and_header(app_page):
    page = app_page("texteditor", mobile=True, init_script=ON.format("en_US"))
    page.locator(".cm-content").click()
    page.keyboard.type("A smal test")
    expect(page.locator(".cm-spell-error")).to_have_text(["smal"], timeout=20000)
    page.locator(".cm-spell-error").dispatch_event("contextmenu", {"clientX": 30, "clientY": 120, "bubbles": True, "cancelable": True})
    menu = page.locator("[data-testid=spell-menu]")
    expect(menu).to_be_visible()
    box = menu.bounding_box()
    assert box["x"] >= 0 and box["x"] + box["width"] <= page.viewport_size["width"]
    assert page.errors == []
