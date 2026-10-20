"""Accessibility of every app (axe-core, WCAG 2.1 A/AA rules): the start screen in light and dark mode, and the shell's own dialogs.

Third-party editing surfaces are left out: the Univer UI of the document editor and the spreadsheet, and the syntax colours of
CodeMirror themes (the editors themselves are checked: their content areas have a name)."""
import pathlib

import pytest
from axe_playwright_python.sync_playwright import Axe

ROOT = pathlib.Path(__file__).resolve().parents[2]
APPS = sorted(p.parent.parent.name for p in (ROOT / "apps").glob("*/src/index.html"))
AXE = Axe()
OPTIONS = {"runOnly": {"type": "tag", "values": ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]}}
EXCLUDE = [[".doc-univer"], [".ss-univer"], [".cm-line"]]


def violations(page):
    result = AXE.run(page, context={"exclude": EXCLUDE}, options=OPTIONS)
    return [f"{v['id']} ({v['impact']}): {', '.join(str(n['target']) for n in v['nodes'][:5])}" for v in result.response["violations"]]


@pytest.mark.parametrize("scheme", ["light", "dark"])
@pytest.mark.parametrize("app", APPS)
def test_start_screen(app, scheme, app_page, browser):
    if browser.browser_type.name != "chromium":
        pytest.skip("the rules do not depend on the browser")
    page = app_page(app, color_scheme=scheme, bypass_csp=True)  # (axe is injected as a script)
    page.wait_for_timeout(1500)
    assert violations(page) == []


def test_shell_dialogs(app_page, browser):
    if browser.browser_type.name != "chromium":
        pytest.skip("the rules do not depend on the browser")
    page = app_page("hexeditor", bypass_csp=True)
    page.keyboard.press("F1")
    page.wait_for_selector("dialog[open]")
    assert violations(page) == []
    page.keyboard.press("Escape")
    page.keyboard.press("Control+Shift+P")
    page.wait_for_selector(".suite-palette")
    page.keyboard.type("op")
    assert violations(page) == []


def test_icon_buttons_are_named(app_page):
    """Icon-only buttons get their title as accessible name (shared/js/shell.js), buttons with words keep their text."""
    page = app_page("document")
    page.wait_for_selector("[data-testid=print]")
    assert page.get_attribute("[data-testid=print]", "aria-label").startswith("Print / PDF")
    assert page.get_attribute("[data-testid=toc]", "aria-label") is None
    page.click("[data-testid=language]")
    page.wait_for_function("() => document.documentElement.lang === 'de'")
    page.wait_for_function("() => document.querySelector('[data-testid=print]').getAttribute('aria-label').startsWith('Drucken')")
