"""Presentation editor: a right click opens the app's context menu (elements, empty slide, slide thumbnails) instead of the browser's."""
from playwright.sync_api import expect

from test_presentation import elements, open_deck, ready, sample, stage_el


def menu_items(page):
    return page.locator("[data-testid=context-menu] [role=menuitem]")


def test_element_and_slide_menus(app_page, tmp_path):
    page = ready(app_page)
    open_deck(page, sample(tmp_path))
    count = len(elements(page))
    # an element: it is selected and the menu has the element actions
    stage_el(page, 1).click(button="right")
    menu = page.locator("[data-testid=context-menu]")
    expect(menu).to_be_visible()
    expect(page.locator("[data-testid=context-menu] [role=menuitem]").first).to_be_focused()
    assert page.evaluate("PR.selectionIds().length") == 1
    page.click("[data-testid=cm-duplicate]")
    expect(menu).to_have_count(0)
    assert len(elements(page)) == count + 1
    # copy, then paste on the empty slide (keyboard: arrows and Enter)
    stage_el(page, 0).click(button="right")
    page.click("[data-testid=cm-copy]")
    box = page.locator("[data-testid=stage]").bounding_box()
    page.mouse.click(box["x"] + 5, box["y"] + box["height"] - 5, button="right")
    expect(page.locator("[data-testid=cm-paste]")).to_be_enabled()
    expect(page.locator("[data-testid=cm-paste]")).to_be_focused()
    page.keyboard.press("Enter")
    assert len(elements(page)) == count + 2
    # Escape and a click elsewhere close the menu
    page.mouse.click(box["x"] + 5, box["y"] + box["height"] - 5, button="right")
    page.keyboard.press("ArrowDown")
    expect(page.locator("[data-testid=cm-select-all]")).to_be_focused()
    page.keyboard.press("Escape")
    expect(menu).to_have_count(0)
    # the slide thumbnails: new, duplicate, hide, move, delete
    page.locator("[data-testid=thumb]").nth(1).click(button="right")
    assert page.evaluate("PR.state.current") == 1
    page.click("[data-testid=cm-hide-slide]")
    assert page.evaluate("PR.state.deck.slides[1].hidden") is True
    page.locator("[data-testid=thumb]").nth(1).click(button="right")
    expect(page.locator("[data-testid=cm-hide-slide]")).to_contain_text("again")
    page.click("[data-testid=cm-duplicate-slide]")
    expect(page.locator("[data-testid=thumb]")).to_have_count(4)
    page.locator("[data-testid=thumb]").nth(0).click(button="right")
    expect(page.locator("[data-testid=cm-slide-up]")).to_be_disabled()
    page.keyboard.press("Escape")
    assert page.errors == []
