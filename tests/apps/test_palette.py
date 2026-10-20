"""Command palette of the shell (shared/js/shell.js): actions collected from every app's buttons, tabs and menus."""
import pathlib

import pytest
from playwright.sync_api import expect

from helpers.paths import ROOT

APPS = sorted(p.parent.parent.name for p in (ROOT / "apps").glob("*/src/index.html"))
NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"


def palette(page, query):
    page.keyboard.press("Control+Shift+P")
    expect(page.locator("[data-testid=palette]")).to_be_visible()
    page.keyboard.type(query)


@pytest.mark.parametrize("app", APPS)
def test_every_app_has_commands(app, app_page):
    page = app_page(app, init_script=NO_PICKERS)
    page.click("[data-testid=palette-button]")  # also the ⌘ button in the header
    expect(page.locator("[data-testid=palette-input]")).to_be_focused()
    labels = page.locator("[data-testid=palette-item]").all_text_contents()
    assert len(labels) >= 1 and len(labels) == len(set(l.lower() for l in labels))
    assert not any(l in ("◐", "DE", "?", "⌘") for l in labels)  # not the shell's own buttons
    page.keyboard.press("Escape")
    expect(page.locator("[data-testid=palette]")).to_have_count(0)
    assert not [e for e in page.errors if "ResizeObserver" not in e]


def test_run_commands(app_page):
    page = app_page("texteditor", init_script=NO_PICKERS)
    page.click(".cm-content")
    page.keyboard.type("hello")
    page.wait_for_function("() => TE.app.view.state.doc.toString() === 'hello'")
    # a menu entry (Tools menu): search with several words, any order, Enter runs it
    palette(page, "case upper")
    expect(page.locator("[data-testid=palette-item]").first).to_contain_text("UPPER CASE")
    page.keyboard.press("Enter")
    expect(page.locator("[data-testid=palette]")).to_have_count(0)
    page.wait_for_function("() => TE.app.view.state.doc.toString() === 'HELLO'")
    # a button by its title; arrow keys choose
    palette(page, "wrap")
    page.keyboard.press("Enter")
    expect(page.locator("[data-testid=wrap]")).to_have_attribute("aria-pressed", "true")
    palette(page, "zzzz nothing")
    expect(page.locator("[data-testid=palette-none]")).to_be_visible()
    page.keyboard.press("Control+Shift+P")  # toggles
    expect(page.locator("[data-testid=palette]")).to_have_count(0)
    # German labels follow the language; apps can register more entries
    page.evaluate("Suite.palette.register(() => [{ label: 'Extra command', run: () => { window.extra = 1; } }])")
    palette(page, "extra")
    page.locator("[data-testid=palette-item]", has_text="Extra command").click()
    page.wait_for_function("() => window.extra === 1")
    assert page.errors == []


def test_calendar_and_hex(app_page):
    page = app_page("calendar", init_script=NO_PICKERS)
    palette(page, "week")
    page.keyboard.press("Enter")
    expect(page.locator("[data-testid=view-week]")).to_have_attribute("aria-pressed", "true")
    page = app_page("hexeditor", init_script=NO_PICKERS)
    page.evaluate("HE.app.load('a.bin', new Uint8Array([1, 2, 3]))")
    palette(page, "checksum")
    page.keyboard.press("Enter")
    expect(page.locator("[data-testid=checksum-dialog]")).to_be_visible()
    assert page.errors == []
