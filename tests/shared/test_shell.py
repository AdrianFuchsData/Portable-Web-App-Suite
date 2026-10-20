"""shared/js/shell.js: header, language and theme switching, toasts, banner, confirm dialog, unsaved changes."""
from helpers.paths import dist_url


def open_testbed(page, language="en"):
    page.goto(dist_url("shared"))
    page.wait_for_selector("body[data-ready]")
    page.evaluate(f"Suite.i18n.setLanguage('{language}')")


def test_header_language_and_theme(page):
    open_testbed(page)
    assert page.text_content("[data-testid=app-title]") == "Testbed" and page.title() == "Testbed"
    page.click("[data-testid=language]")
    assert page.text_content("[data-testid=app-title]") == "Testumgebung"
    assert page.text_content("[data-testid=demo-text]") == "Hallo" and page.title() == "Testumgebung"
    page.click("[data-testid=language]")
    assert page.text_content("[data-testid=demo-text]") == "Hello"
    themes = []
    for _ in range(3):
        page.click("[data-testid=theme]")
        themes.append(page.evaluate("document.documentElement.getAttribute('data-theme')"))
    assert themes == ["light", "dark", None]  # auto -> light -> dark -> auto


def test_toast_banner_about(page):
    open_testbed(page)
    page.click("[data-testid=demo-action]")
    assert page.text_content("[data-testid=toast]") == "Hello"
    page.evaluate("Suite.shell.banner('Replace the file')")
    assert page.text_content("[data-testid=banner] span") == "Replace the file"
    page.click("[data-testid=banner] button")
    assert page.locator("[data-testid=banner]").count() == 0
    page.click("[data-testid=about]")
    assert "Runs completely offline" in page.text_content("[data-testid=about-dialog]")


def test_confirm(page):
    open_testbed(page)
    page.evaluate("void (window.__answer = Suite.shell.confirm('Delete?'))")
    page.click("[data-testid=confirm-ok]")
    assert page.evaluate("window.__answer") is True
    page.evaluate("void (window.__answer = Suite.shell.confirm('Delete?'))")
    page.click("[data-testid=confirm-cancel]")
    assert page.evaluate("window.__answer") is False
    assert page.locator("[data-testid=confirm]").count() == 0


def test_unsaved_changes_warning(page):
    open_testbed(page)
    page.evaluate("Suite.shell.setDirty(true)")
    page.click("[data-testid=demo-text]")  # user activation is required for beforeunload dialogs
    dialogs = []
    page.on("dialog", lambda d: (dialogs.append(d.type), d.dismiss()))
    page.close(run_before_unload=True)
    page.wait_for_timeout(500)
    assert dialogs == ["beforeunload"]
