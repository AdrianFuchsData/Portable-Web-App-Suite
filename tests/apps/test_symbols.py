"""Emoji and symbols in text fields (shared/js/symbols.js): the picker (search by name, :code:, emoticon and code point,
recently used, groups, skin tones, keyboard), codes typed into the text (":name:", suggestions, "U+1F60A "), Alt+X,
emoticons (setting, off by default), the ☺ button (setting, on by default), code editors and opted-out fields."""
from playwright.sync_api import expect

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"


def compose(page):
    page.click("[data-testid=new-message]")
    text = page.locator("[data-testid=compose-text]")
    text.click()
    return text


def open_picker(page):
    page.keyboard.press("Control+.")
    expect(page.locator("[data-testid=symbols-search]")).to_be_focused()
    return page.locator("[data-testid=symbols-picker]")


def test_picker_search_and_insert(app_page):
    page = app_page("mail", init_script=NO_PICKERS)
    text = compose(page)
    # the ☺ button of the focused field opens the picker
    expect(page.locator("[data-testid=symbols-button]")).to_be_visible()
    page.click("[data-testid=symbols-button]")
    picker = page.locator("[data-testid=symbols-picker]")
    expect(picker).to_be_visible()
    expect(page.locator("[data-testid=symbols-empty]")).to_have_count(0)  # nothing used yet: the first group
    expect(page.locator("[data-testid=symbols-tab][aria-selected=true]")).to_have_attribute("data-group", "smileys-emotion")
    search = page.locator("[data-testid=symbols-search]")
    symbols = page.locator("[data-testid=symbol]")
    # by name and keyword, emoticon, shortcode, code point
    search.fill("happy")
    expect(symbols.first).to_have_text("😀")
    search.fill(":)")
    expect(symbols.first).to_have_text("🙂")
    search.fill(":wave:")
    expect(symbols.first).to_have_text("👋")
    search.fill("U+1F60A")
    expect(symbols.first).to_have_text("😊")
    expect(page.locator("[data-testid=symbols-info]")).to_contain_text("U+1F60A")
    search.fill("euro")
    expect(symbols.first).to_have_text("€")
    search.press("Enter")  # the first result
    expect(picker).to_have_count(0)
    expect(text).to_have_value("€")
    expect(text).to_be_focused()
    # keyboard: into the grid, move, insert; Shift+Enter keeps the picker open
    open_picker(page)
    page.locator("[data-testid=symbols-tab][data-group=arrows]").click()
    first = symbols.first
    first.focus()
    page.keyboard.press("ArrowRight")
    expect(symbols.nth(1)).to_be_focused()
    page.keyboard.press("Shift+Enter")
    expect(picker).to_be_visible()
    expect(text).to_have_value("€↑")
    page.keyboard.press("Escape")
    expect(picker).to_have_count(0)
    expect(text).to_be_focused()
    # recently used come first, newest first
    open_picker(page)
    expect(page.locator("[data-testid=symbols-tab][aria-selected=true]")).to_have_attribute("data-group", "recent")
    expect(symbols).to_have_text(["↑", "€"])
    # skin tones
    page.locator("[data-testid=symbols-skin]").select_option("3")
    search.fill(":wave:")
    expect(symbols.first).to_have_text("👋🏽")
    search.press("Enter")
    expect(text).to_have_value("€↑👋🏽")
    assert page.evaluate("JSON.parse(localStorage.getItem('suite.symbols.recent'))")[:1] == ["👋🏽"]
    assert page.errors == []


def test_german_search(app_page):
    page = app_page("mail", init_script=NO_PICKERS + "localStorage.setItem('suite.lang', 'de');")
    compose(page)
    open_picker(page)
    page.fill("[data-testid=symbols-search]", "Pfeil rechts")
    expect(page.locator("[data-testid=symbol]").first).to_have_text("➡️")  # "Pfeil nach rechts"
    expect(page.locator("[data-testid=symbols-info]")).to_contain_text("Pfeil nach rechts")
    assert "→" in page.locator("[data-testid=symbol]").all_inner_texts()[:10]  # the symbol "nach rechts weisender Pfeil"
    page.fill("[data-testid=symbols-search]", "glücklich")
    expect(page.locator("[data-testid=symbol]")).not_to_have_count(0)
    assert page.errors == []


def test_codes_while_typing(app_page):
    page = app_page("mail", init_script=NO_PICKERS)
    text = compose(page)
    page.keyboard.type("Hi :smile: and U1F60A x")
    expect(text).to_have_value("Hi 😄 and 😊 x")
    # suggestions while typing ":na"
    page.keyboard.type(" :wav")
    suggestions = page.locator("[data-testid=symbols-suggestion]")
    expect(suggestions.first).to_contain_text("👋 :wave:")
    page.keyboard.press("ArrowDown")
    page.keyboard.press("ArrowUp")
    page.keyboard.press("Enter")
    expect(suggestions).to_have_count(0)
    expect(text).to_have_value("Hi 😄 and 😊 x 👋")
    # not converted: times, URLs, unknown names, emoticons (off by default)
    page.keyboard.type(" at 10:30: http://x.org:8080: :nosuchname: :) ")
    expect(text).to_have_value("Hi 😄 and 😊 x 👋 at 10:30: http://x.org:8080: :nosuchname: :) ")
    # Alt+X: code point -> character -> code point
    text.fill("")
    page.keyboard.type("arrow 2192")
    page.keyboard.press("Alt+x")
    expect(text).to_have_value("arrow →")
    page.keyboard.press("Alt+x")
    expect(text).to_have_value("arrow U+2192")
    # one-line fields too
    page.click("[data-testid=compose-subject]")
    page.keyboard.type("Party :tada:")
    expect(page.locator("[data-testid=compose-subject]")).to_have_value("Party 🎉")
    assert page.errors == []


def test_rich_text(app_page):
    page = app_page("mail", init_script=NO_PICKERS)
    compose(page)
    page.check("[data-testid=compose-mode]")
    editor = page.locator("[data-testid=compose-html]")
    editor.click()
    page.keyboard.press("Control+End")
    page.keyboard.type(" Thanks :thumbsup:")
    expect(editor).to_contain_text("Thanks 👍")
    open_picker(page)
    page.fill("[data-testid=symbols-search]", "check mark button")
    page.locator("[data-testid=symbols-search]").press("Enter")
    expect(editor).to_contain_text("✅")
    assert editor.inner_text().strip().replace("\ufe0f", "") == "Thanks 👍✅"
    assert page.errors == []


def test_settings(app_page):
    page = app_page("mail", init_script=NO_PICKERS)
    page.keyboard.press("F1")
    page.click("[data-testid=prefs] > summary")
    button_setting = page.locator("[data-testid=pref-symbols-button]")
    emoticons = page.locator("[data-testid=pref-symbols-emoticons]")
    expect(button_setting).to_be_checked()
    expect(emoticons).not_to_be_checked()
    button_setting.uncheck()
    emoticons.check()
    page.keyboard.press("Escape")
    assert page.evaluate("[localStorage.getItem('suite.symbols.button'), localStorage.getItem('suite.symbols.emoticons')]") == ["0", "1"]
    text = compose(page)
    expect(page.locator("[data-testid=symbols-button]")).to_have_count(0)  # no button, the shortcut still works
    page.keyboard.type("ok :) ")
    expect(text).to_have_value("ok 🙂 ")
    open_picker(page)
    page.keyboard.press("Escape")
    # the settings are kept (browser storage)
    page.reload()
    page.wait_for_selector("body[data-ready]")
    compose(page)
    page.keyboard.type(";-) xo ")  # (letters only: not converted)
    expect(page.locator("[data-testid=compose-text]")).to_have_value("😉 xo ")
    assert page.errors == []


def test_code_editor(app_page):
    page = app_page("texteditor", init_script=NO_PICKERS)
    page.click(".cm-content")
    page.keyboard.type("x = ':smile:' ")  # codes are not converted in code
    open_picker(page)
    page.fill("[data-testid=symbols-search]", "U+2603")
    page.locator("[data-testid=symbols-search]").press("Enter")
    expect(page.locator("[data-testid=symbols-picker]")).to_have_count(0)
    assert page.evaluate("TE.app.view.state.doc.toString()") == "x = ':smile:' ☃"
    page.keyboard.type(" 00e9")
    page.keyboard.press("Alt+x")
    assert page.evaluate("TE.app.view.state.doc.toString()") == "x = ':smile:' ☃ é"
    page.keyboard.press("Control+z")  # one undo step
    assert page.evaluate("TE.app.view.state.doc.toString()") == "x = ':smile:' ☃ 00e9"
    assert page.errors == []


def test_opted_out_fields(app_page):
    page = app_page("keepass", init_script=NO_PICKERS)
    page.click("[data-testid=create]")
    page.fill("[data-testid=create-name]", "Test")
    page.fill("[data-testid=create-password]", "pw")
    page.fill("[data-testid=create-repeat]", "pw")
    page.click("[data-testid=create-submit]")
    page.click("[data-testid=new-entry]")
    page.locator("[data-testid=field-Title]").click()
    expect(page.locator("[data-testid=symbols-button]")).to_be_visible()
    page.click("[data-testid=field-Password-reveal]")
    page.locator("[data-testid=field-Password]").click()  # a revealed password: no emoji
    expect(page.locator("[data-testid=symbols-button]")).to_be_hidden()
    page.locator("[data-testid=field-Password]").fill("")
    page.keyboard.type("pw:smile:")
    expect(page.locator("[data-testid=field-Password]")).to_have_value("pw:smile:")
    assert page.errors == []


def test_phone_sheet(app_page):
    page = app_page("mail", mobile=True, init_script=NO_PICKERS)
    compose(page)
    page.click("[data-testid=symbols-button]")
    picker = page.locator("[data-testid=symbols-picker]")
    expect(picker).to_be_visible()
    box = picker.bounding_box()
    vw, vh = page.viewport_size["width"], page.viewport_size["height"]
    assert box["x"] >= 0 and box["x"] + box["width"] <= vw + 1 and box["y"] + box["height"] <= vh + 1
    page.locator("[data-testid=symbol]").first.click()
    expect(page.locator("[data-testid=compose-text]")).to_have_value("😀")
    assert page.errors == []
