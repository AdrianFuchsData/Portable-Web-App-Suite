"""The shell's title bar can be hidden (and shown again), and on phones the app's toolbar row can be collapsed; both are remembered."""
import pytest
from playwright.sync_api import expect


def test_hide_and_show_the_title_bar(app_page):
    page = app_page("texteditor")
    header = page.locator(".suite-header")
    top = page.locator(".cm-editor").bounding_box()["y"]
    page.click("[data-testid=hide-header]")
    expect(header).to_have_count(0)
    show = page.locator("[data-testid=show-header]")
    expect(show).to_be_visible()
    expect(show).to_have_attribute("aria-label", "Show the title bar")
    assert page.locator(".cm-editor").bounding_box()["y"] < top - 20  # the editor gets the room
    # remembered (also for the other apps of this browser)
    page.reload()
    page.wait_for_selector("body[data-ready]")
    expect(page.locator("[data-testid=show-header]")).to_be_visible()
    # the command palette (Ctrl+Shift+P) still works and offers to show it
    page.keyboard.press("Control+Shift+P")
    page.keyboard.type("title bar")
    expect(page.locator("[data-testid=palette-item]").first).to_contain_text("Show the title bar")
    page.keyboard.press("Enter")
    expect(header).to_be_visible()
    page.click("[data-testid=hide-header]")
    page.click("[data-testid=show-header]")
    expect(header).to_be_visible()
    expect(page.locator("[data-testid=hide-header]")).to_be_focused()
    assert page.errors == []


def test_collapse_the_toolbar_on_a_phone(app_page):
    page = app_page("texteditor", mobile=True)
    toggle = page.locator("[data-testid=toggle-toolbar]")
    nav = page.locator(".suite-header > nav")
    expect(toggle).to_be_visible()
    expect(nav).to_be_visible()
    height = page.locator(".suite-header").bounding_box()["height"]
    toggle.tap()
    expect(nav).to_be_hidden()
    expect(toggle).to_have_attribute("aria-expanded", "false")
    assert page.locator(".suite-header").bounding_box()["height"] < height - 20
    page.reload()
    page.wait_for_selector("body[data-ready]")
    expect(page.locator(".suite-header > nav")).to_be_hidden()
    page.locator("[data-testid=toggle-toolbar]").tap()
    expect(page.locator(".suite-header > nav")).to_be_visible()
    assert page.errors == []


def test_toolbar_toggle_only_on_narrow_screens(app_page):
    page = app_page("texteditor")
    if page.viewport_size["width"] <= 760:
        pytest.skip("a wide window only (the phone layout always has the toggle)")
    expect(page.locator("[data-testid=toggle-toolbar]")).to_be_hidden()
