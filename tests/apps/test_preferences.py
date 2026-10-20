"""Preferences of the suite as a file (about dialog, shared/js/shell.js) and in the connection files (shared/js/appdata.js)."""
import json

from playwright.sync_api import expect

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"


def test_export_and_import(app_page, tmp_path):
    page = app_page("hexeditor", init_script=NO_PICKERS)
    page.evaluate("localStorage.setItem('texteditor.prefs', '{\"fontSize\":18}'); localStorage.setItem('suite.mediaplayer.resume', '{}')")
    page.click("[data-testid=theme]")  # auto -> light
    page.keyboard.press("F1")
    page.click("[data-testid=prefs] summary")
    with page.expect_download() as d:
        page.click("[data-testid=prefs-export]")
    assert d.value.suggested_filename == "suite-settings.json"
    data = json.load(open(d.value.path(), encoding="utf-8"))
    assert data["format"] == "portable-web-app-suite" and data["version"] == 1
    prefs = data["apps"]["suite"]["settings"]["preferences"]
    assert prefs["suite.theme"] == "light" and prefs["texteditor.prefs"] == '{"fontSize":18}' and prefs["suite.lang"] == "en"
    assert "suite.mediaplayer.resume" not in prefs  # device-specific

    # imported elsewhere (here: after clearing), with a reload
    path = tmp_path / "suite-settings.json"
    d.value.save_as(path)
    page.evaluate("localStorage.clear()")
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=prefs-import]")
    chooser.value.set_files(str(path))
    expect(page.locator("[data-testid=confirm]")).to_contain_text("settings imported")
    with page.expect_navigation():
        page.click("[data-testid=confirm-ok]")
    page.wait_for_selector("body[data-ready]")
    assert page.evaluate("localStorage.getItem('texteditor.prefs')") == '{"fontSize":18}'
    assert page.get_attribute("html", "data-theme") == "light"

    # a file without preferences
    other = tmp_path / "other.json"
    other.write_text('{"format": "portable-web-app-suite", "version": 1, "apps": {}}')
    page.keyboard.press("F1")
    page.click("[data-testid=prefs] summary")
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=prefs-import]")
    chooser.value.set_files(str(other))
    expect(page.locator("[data-testid=toast]").last).to_contain_text("no settings")
    assert page.errors == []


def test_preferences_in_the_connection_file(app_page, tmp_path):
    page = app_page("dbtool", init_script=NO_PICKERS)
    page.evaluate("localStorage.setItem('suite.diagram.libraries', '[\"uml\"]')")
    page.click("[data-testid=appdata-save]")
    page.check("[data-testid=appdata-json]")
    with page.expect_download() as d:
        page.click("[data-testid=appdata-create-ok]")
    data = json.load(open(d.value.path(), encoding="utf-8"))
    assert data["apps"]["suite"]["settings"]["preferences"]["suite.diagram.libraries"] == '["uml"]'
    path = tmp_path / "connections.json"
    d.value.save_as(path)

    # opening the file offers to take the preferences over when they differ
    page.evaluate("localStorage.setItem('suite.diagram.libraries', '[]')")
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=appdata-open]")
    chooser.value.set_files(str(path))
    expect(page.locator("[data-testid=banner]")).to_contain_text("also contains settings")
    page.click("[data-testid=appdata-apply-prefs]")
    with page.expect_navigation():
        page.click("[data-testid=confirm-ok]")
    page.wait_for_selector("body[data-ready]")
    assert page.evaluate("localStorage.getItem('suite.diagram.libraries')") == '["uml"]'
    assert page.errors == []
