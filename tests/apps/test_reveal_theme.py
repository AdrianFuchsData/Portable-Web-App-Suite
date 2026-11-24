"""Web slides: theme editor – reveal.js variables over the theme (colours, fonts with embedded @font-face, sizes, background),
saved in the deck and the HTML file, saved and loaded as CSS, reset."""
import re

from playwright.sync_api import expect

from test_reveal import open_file, ready, save_html, wait_preview


def open_theme(page):
    if page.locator("[data-testid=toggle-panels]").is_visible() and not page.locator("[data-testid=tab-deck]").is_visible():
        page.click("[data-testid=toggle-panels]")
    page.click("[data-testid=tab-deck]")
    page.click("[data-testid=theme-edit]")
    expect(page.locator("[data-testid=theme-dialog]")).to_be_visible()


def computed(page, selector, prop):
    return page.frame_locator("[data-testid=preview]").locator(selector).first.evaluate(f"(el) => getComputedStyle(el).{prop}")


def test_theme_editor(app_page, tmp_path):
    page = ready(app_page)
    open_theme(page)
    before = page.evaluate("document.body.dataset.preview || ''")
    page.locator("[data-testid=theme-headingColor]").fill("#ff8800")
    page.locator("[data-testid=theme-background]").fill("#103050")
    page.select_option("[data-testid=theme-headingFont]", "Montserrat")
    page.select_option("[data-testid=theme-headingTransform]", "none")
    page.fill("[data-testid=theme-mainSize]", "30px")
    wait_preview(page, before)
    page.wait_for_timeout(500)
    assert computed(page, ".reveal h1, .reveal h2", "color") == "rgb(255, 136, 0)"
    assert computed(page, ".reveal h1, .reveal h2", "textTransform") == "none"
    assert "Montserrat" in computed(page, ".reveal h1, .reveal h2", "fontFamily")
    assert computed(page, ".reveal", "fontSize") == "30px"
    deck = page.evaluate("RV.state.deck")
    assert deck["themeVars"]["headingColor"] == "#ff8800" and deck["themeVars"]["headingFont"] == "Montserrat"
    assert "@font-face" in deck["themeFonts"] and "Montserrat" in deck["themeFonts"]
    # saved as CSS
    with page.expect_download() as d:
        page.click("[data-testid=theme-save]")
    css = open(d.value.path(), encoding="utf-8").read()
    assert "--r-heading-color: #ff8800;" in css and '--r-heading-font: "Montserrat", sans-serif;' in css and "@font-face" in css
    # the HTML file carries the theme (and works without the app)
    page.click("[data-testid=theme-close]")
    html = save_html(page, tmp_path).read_text(encoding="utf-8")
    assert 'id="suite-theme"' in html and "--r-heading-color: #ff8800;" in html and "background: #103050;" in html
    # undo, reset, load the saved CSS again
    page.keyboard.press("Control+z")
    open_theme(page)
    page.click("[data-testid=theme-reset]")
    assert page.evaluate("RV.state.deck.themeVars") == {}
    css_file = tmp_path / "mine.css"
    css_file.write_text(css, encoding="utf-8")
    page.locator("[data-testid=theme-load]").set_input_files(str(css_file))
    expect(page.locator("[data-testid=toast]").last).to_contain_text("settings taken from the file")
    assert page.evaluate("RV.state.deck.themeVars.headingColor") == "#ff8800"
    assert page.evaluate("RV.state.deck.themeFonts").count("@font-face") >= 1
    assert page.errors == []
