"""Preferences of the suite as a file (about dialog, shared/js/shell.js) and in the connection files (shared/js/appdata.js)."""
import json

from playwright.sync_api import expect

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"


def test_export_and_import(app_page, tmp_path):
    page = app_page("hexeditor", init_script=NO_PICKERS)
    page.evaluate("localStorage.setItem('hexeditor.prefs', '{\"columns\":32}'); localStorage.setItem('texteditor.prefs', '{\"fontSize\":18}'); localStorage.setItem('suite.mediaplayer.resume', '{}')")
    page.click("[data-testid=theme]")  # auto -> light
    page.keyboard.press("F1")
    page.click("[data-testid=prefs] summary")
    page.click("[data-testid=prefs-export]")
    # an application offers its own settings and the general ones
    expect(page.locator("[data-testid=prefs-items] label")).to_have_count(2)
    expect(page.locator("[data-testid=prefs-item-general]")).to_be_checked()
    expect(page.locator("[data-testid=prefs-item-hexeditor]")).to_be_checked()
    page.select_option("[data-testid=prefs-format]", "json")  # (KeePass is preselected)
    expect(page.locator("[data-testid=prefs-password]")).to_have_count(0)
    with page.expect_download() as d:
        page.click("[data-testid=prefs-ok]")
    assert d.value.suggested_filename == "suite-settings.json"
    data = json.load(open(d.value.path(), encoding="utf-8"))
    assert data["format"] == "portable-web-app-suite" and data["version"] == 1
    prefs = data["apps"]["suite"]["settings"]["preferences"]
    assert prefs["suite.theme"] == "light" and prefs["hexeditor.prefs"] == '{"columns":32}' and prefs["suite.lang"] == "en"
    assert "texteditor.prefs" not in prefs  # (another application's)
    assert "suite.mediaplayer.resume" not in prefs  # device-specific

    # imported elsewhere (here: after clearing), with a reload
    path = tmp_path / "suite-settings.json"
    d.value.save_as(path)
    page.evaluate("localStorage.clear(); localStorage.setItem('suite.files.archives', '0')")  # (no choice "File system or archive")
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=prefs-import]")
    chooser.value.set_files(str(path))
    page.click("[data-testid=prefs-ok]")  # (take everything)
    expect(page.locator("[data-testid=confirm]")).to_contain_text("settings imported")
    with page.expect_navigation():
        page.click("[data-testid=confirm-ok]")
    page.wait_for_selector("body[data-ready]")
    assert page.evaluate("localStorage.getItem('hexeditor.prefs')") == '{"columns":32}'
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


def test_encrypted_export_and_import(app_page, tmp_path):
    """Settings as a KeePass database (with a password), read back in another application; also a connection file."""
    from pykeepass import PyKeePass
    page = app_page("texteditor", init_script=NO_PICKERS)
    page.evaluate("localStorage.setItem('texteditor.prefs', '{\"fontSize\":17}')")
    page.keyboard.press("F1")
    page.click("[data-testid=prefs] summary")
    page.click("[data-testid=prefs-export]")
    expect(page.locator("[data-testid=prefs-format]")).to_have_value("kdbx")
    page.fill("[data-testid=prefs-password]", "geheim")
    page.fill("[data-testid=prefs-repeat]", "anders")
    page.click("[data-testid=prefs-ok]")
    expect(page.locator("[data-testid=prefs-error]")).to_have_text("The passwords do not match.")
    page.fill("[data-testid=prefs-repeat]", "geheim")
    with page.expect_download() as d:
        page.click("[data-testid=prefs-ok]")
    assert d.value.suggested_filename == "suite-settings.kdbx"
    path = tmp_path / "suite-settings.kdbx"
    d.value.save_as(path)
    # a real KeePass database: the settings are the attachment of the entry "Settings" in the group of the suite
    kp = PyKeePass(str(path), password="geheim")
    [entry] = [e for e in kp.entries if e.title == "Settings"]
    prefs = json.loads(entry.attachments[0].binary)["preferences"]
    assert prefs["texteditor.prefs"] == '{"fontSize":17}'

    # another application, another browser profile: the password is asked for
    page2 = app_page("texteditor", init_script=NO_PICKERS)
    page2.keyboard.press("F1")
    page2.click("[data-testid=prefs] summary")
    with page2.expect_file_chooser() as chooser:
        page2.click("[data-testid=prefs-import]")
    chooser.value.set_files(str(path))
    page2.fill("[data-testid=prefs-password]", "falsch")
    page2.click("[data-testid=prefs-ok]")
    expect(page2.locator("[data-testid=prefs-error]")).to_contain_text("password is wrong", timeout=20000)
    page2.fill("[data-testid=prefs-password]", "geheim")
    page2.click("[data-testid=prefs-ok]")
    expect(page2.locator("[data-testid=prefs-item-texteditor]")).to_be_checked(timeout=20000)  # what the file contains
    page2.click("[data-testid=prefs-ok]")
    expect(page2.locator("[data-testid=confirm]")).to_contain_text("settings imported", timeout=20000)
    page2.click("[data-testid=confirm-cancel]")
    assert page2.evaluate("localStorage.getItem('texteditor.prefs')") == '{"fontSize":17}'

    # the KeePass connection file of an application with connections carries the settings as well
    page3 = app_page("dbtool", init_script=NO_PICKERS)
    page3.evaluate("localStorage.setItem('suite.diagram.libraries', '[\"uml\"]')")
    page3.click("[data-testid=appdata-save]")
    page3.fill("[data-testid=appdata-new-password]", "verbindungen")
    page3.fill("[data-testid=appdata-new-repeat]", "verbindungen")
    with page3.expect_download() as d:
        page3.click("[data-testid=appdata-create-ok]")
    connections = tmp_path / "connections.kdbx"
    d.value.save_as(connections)
    page4 = app_page("diagram", init_script=NO_PICKERS)
    page4.keyboard.press("F1")
    page4.click("[data-testid=prefs] summary")
    with page4.expect_file_chooser() as chooser:
        page4.click("[data-testid=prefs-import]")
    chooser.value.set_files(str(connections))
    page4.fill("[data-testid=prefs-password]", "verbindungen")
    page4.click("[data-testid=prefs-ok]")
    expect(page4.locator("[data-testid=prefs-item-diagram]")).to_be_visible(timeout=20000)
    page4.click("[data-testid=prefs-ok]")
    expect(page4.locator("[data-testid=confirm]")).to_contain_text("settings imported", timeout=20000)
    page4.click("[data-testid=confirm-cancel]")
    assert page4.evaluate("localStorage.getItem('suite.diagram.libraries')") == '["uml"]'
    assert page.errors == [] and page2.errors == [] and page3.errors == [] and page4.errors == []


def test_export_choice_with_connections(app_page, tmp_path):
    """The export of an application with connections: the connections and the relay sign-in can be included – unencrypted only after
    a warning; another instance of the application takes them over."""
    page = app_page("dbtool", init_script=NO_PICKERS)
    page.evaluate("""() => { DB.data.saveConnection({ name: 'Prod', kind: 'postgres', host: 'db.example.com', username: 'anna', password: 'pw-123' });
      DB.data.relay = { url: 'http://127.0.0.1:8765', token: 'tok-9' }; }""")
    page.keyboard.press("F1")
    page.click("[data-testid=prefs] summary")
    page.click("[data-testid=prefs-export]")
    expect(page.locator("[data-testid=prefs-item-connections-dbtool]")).to_be_checked()
    expect(page.locator("[data-testid=prefs-item-relay]")).to_be_checked()
    page.select_option("[data-testid=prefs-format]", "json")
    expect(page.locator("[data-testid=prefs-warning]")).to_contain_text("readable form")
    page.click("[data-testid=prefs-ok]")
    expect(page.locator("[data-testid=prefs-error]")).to_contain_text("Confirm")
    # leaving the credentials out removes the warning
    page.uncheck("[data-testid=prefs-item-connections-dbtool]")
    page.uncheck("[data-testid=prefs-item-relay]")
    expect(page.locator("[data-testid=prefs-warning]")).to_have_count(0)
    page.check("[data-testid=prefs-item-connections-dbtool]")
    page.check("[data-testid=prefs-ack]")
    with page.expect_download() as d:
        page.click("[data-testid=prefs-ok]")
    data = json.load(open(d.value.path(), encoding="utf-8"))
    [conn] = data["apps"]["dbtool"]["connections"]
    assert conn["name"] == "Prod" and conn["password"] == "pw-123"
    assert "relay" not in data["apps"]["suite"]["settings"]
    path = tmp_path / "suite-settings.json"
    d.value.save_as(path)

    page2 = app_page("dbtool", init_script=NO_PICKERS)
    page2.keyboard.press("F1")
    page2.click("[data-testid=prefs] summary")
    with page2.expect_file_chooser() as chooser:
        page2.click("[data-testid=prefs-import]")
    chooser.value.set_files(str(path))
    expect(page2.locator("[data-testid=prefs-item-connections-dbtool]")).to_be_checked()
    page2.click("[data-testid=prefs-ok]")
    expect(page2.locator("[data-testid=toast]").last).to_contain_text("1 entries imported")
    assert page2.evaluate("DB.data.connections().map((c) => [c.name, c.password])") == [["Prod", "pw-123"]]
    assert page.errors == [] and page2.errors == []


def test_overview_offers_all_applications(app_page):
    page = app_page("overview", init_script=NO_PICKERS)
    page.evaluate("localStorage.setItem('texteditor.prefs', '{}'); localStorage.setItem('suite.diagram.libraries', '[]'); localStorage.setItem('hexeditor.prefs', '{}')")
    page.keyboard.press("F1")
    page.click("[data-testid=prefs] summary")
    page.click("[data-testid=prefs-export]")
    for group in ("general", "texteditor", "diagram", "hexeditor"):
        expect(page.locator(f"[data-testid=prefs-item-{group}]")).to_be_checked()
    assert page.errors == []
