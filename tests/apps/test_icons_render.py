"""The bundled icons render as inline SVG in the apps (shared/js/icons.js)."""
from playwright.sync_api import expect


def test_icons_render(app_page):
    page = app_page("texteditor")
    icon = page.locator("[data-testid=undo] svg.suite-icon")
    expect(icon).to_have_count(1)
    assert icon.get_attribute("aria-hidden") == "true" and icon.locator("path").count() >= 1
    box = icon.bounding_box()
    assert 12 <= box["width"] <= 24 and abs(box["width"] - box["height"]) < 1
    assert page.evaluate("Suite.icons.has('save') && Suite.icons.svg('save', { label: 'Save' }).includes('aria-label=\"Save\"')")
    assert page.errors == []
