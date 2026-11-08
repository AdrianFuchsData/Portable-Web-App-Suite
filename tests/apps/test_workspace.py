"""Workspaces (*.suite.zip: the open files, workspace.json and the settings; about dialog, shared/js/shell.js: Suite.workspace)."""
import json
import zipfile

from playwright.sync_api import expect

# no file pickers (downloads and <input type=file>), and Open goes straight to the file system
INIT = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined; try { localStorage.setItem('suite.files.archives', '0'); } catch (e) {}"


def about_workspace(page):
    page.click("[data-testid=about]")
    page.click("[data-testid=workspace] summary")


def open_workspace(page, path):
    about_workspace(page)
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=workspace-open]")
    chooser.value.set_files(str(path))
    expect(page.locator("[data-testid=workspace-form]")).to_be_visible()


def test_application_workspace(app_page, tmp_path):
    page = app_page("texteditor", init_script=INIT)
    page.evaluate("localStorage.setItem('texteditor.prefs', '{\"fontSize\":19}'); localStorage.setItem('hexeditor.prefs', '{}')")
    page.locator(".cm-content").first.click()
    page.keyboard.type("first text")
    page.evaluate("TE.app.newDocument()")
    page.locator(".cm-content").first.click()
    page.keyboard.type("second text äöü")
    names = page.evaluate("TE.app.docs.map((d) => d.name)")
    about_workspace(page)
    page.click("[data-testid=workspace-save]")
    expect(page.locator("[data-testid=workspace-file]")).to_have_count(2)
    expect(page.locator("[data-testid=workspace-settings]")).to_be_checked()
    with page.expect_download() as d:
        page.click("[data-testid=workspace-ok]")
    assert d.value.suggested_filename == "texteditor-workspace.suite.zip"
    path = tmp_path / "texteditor-workspace.suite.zip"
    d.value.save_as(path)
    z = zipfile.ZipFile(path)
    assert z.testzip() is None
    manifest = json.loads(z.read("workspace.json"))
    assert manifest["format"] == "portable-web-app-suite-workspace" and manifest["version"] == 1 and manifest["settings"] == "settings.json"
    assert [f["path"] for f in manifest["files"]] == [f"texteditor/{n}" for n in names]
    assert {z.read(f"texteditor/{n}").decode() for n in names} == {"first text", "second text äöü"}
    prefs = json.loads(z.read("settings.json"))["apps"]["suite"]["settings"]["preferences"]
    assert prefs["texteditor.prefs"] == '{"fontSize":19}' and "hexeditor.prefs" not in prefs  # (this application's and the general ones)

    # opened in another text editor: the files as copies, the settings applied
    page2 = app_page("texteditor", init_script=INIT)
    open_workspace(page2, path)
    expect(page2.locator("[data-testid=workspace-entry]")).to_have_count(2)
    expect(page2.locator("[data-testid=workspace-files]")).to_be_checked()
    page2.check("[data-testid=workspace-settings]")
    page2.click("[data-testid=workspace-ok]")
    expect(page2.locator("[data-testid=toast]").last).to_contain_text("2 files opened")
    expect(page2.locator("[data-testid=toast]").last).to_contain_text("settings applied")
    texts = page2.evaluate("TE.app.docs.map((d) => d.state.doc.toString())")
    assert "first text" in texts and "second text äöü" in texts
    assert page2.evaluate("localStorage.getItem('texteditor.prefs')") == '{"fontSize":19}'

    # another application opens only its own files (none here) and says so
    page3 = app_page("hexeditor", init_script=INIT)
    open_workspace(page3, path)
    expect(page3.locator("[data-testid=workspace-others]")).to_contain_text("2 files of other applications")
    expect(page3.locator("[data-testid=workspace-files]")).to_be_disabled()
    # not a workspace
    other = tmp_path / "other.zip"
    with zipfile.ZipFile(other, "w") as o:
        o.writestr("a.txt", "x")
    with page3.expect_file_chooser() as chooser:
        page3.click("[data-testid=workspace-open]")
    chooser.value.set_files(str(other))
    expect(page3.locator("[data-testid=toast]").last).to_contain_text("not a workspace")
    assert page.errors == [] and page2.errors == [] and page3.errors == []


def test_credentials_only_encrypted(app_page, tmp_path):
    page = app_page("dbtool", init_script=INIT)
    page.evaluate("""() => DB.data.saveConnection({ name: 'Prod', kind: 'postgres', host: 'db.example.com', username: 'anna', password: 'pw-123' })""")
    about_workspace(page)
    page.click("[data-testid=workspace-save]")
    expect(page.locator("[data-testid=workspace-source-connections-dbtool]")).not_to_be_checked()  # (credentials: only when chosen)
    page.check("[data-testid=workspace-source-connections-dbtool]")
    page.click("[data-testid=workspace-ok]")
    expect(page.locator("[data-testid=workspace-error]")).to_contain_text("only written encrypted")
    page.fill("[data-testid=workspace-password]", "ws-secret")
    page.fill("[data-testid=workspace-repeat]", "ws-secret")
    with page.expect_download() as d:
        page.click("[data-testid=workspace-ok]")
    path = tmp_path / "dbtool-workspace.suite.zip"
    d.value.save_as(path)
    z = zipfile.ZipFile(path)
    assert json.loads(z.read("workspace.json"))["settings"] == "settings.kdbx"
    assert "settings.json" not in z.namelist() and b"pw-123" not in path.read_bytes()
    assert z.read("settings.kdbx")[:4] == bytes([0x03, 0xD9, 0xA2, 0x9A])

    page2 = app_page("dbtool", init_script=INIT)
    open_workspace(page2, path)
    expect(page2.locator("[data-testid=workspace-settings]")).to_be_checked()
    page2.fill("[data-testid=workspace-password]", "wrong")
    page2.click("[data-testid=workspace-ok]")
    expect(page2.locator("[data-testid=workspace-error]")).to_contain_text("password")
    page2.fill("[data-testid=workspace-password]", "ws-secret")
    page2.click("[data-testid=workspace-ok]")
    expect(page2.locator("[data-testid=toast]").last).to_contain_text("1 entries imported")
    assert page2.evaluate("DB.data.connections().map((c) => [c.name, c.password])") == [["Prod", "pw-123"]]
    assert page.errors == [] and page2.errors == []


def test_overview_workspace(app_page, tmp_path):
    page = app_page("overview", init_script=INIT)
    page.evaluate("OV.openTab('texteditor', { name: 'notes.txt', fileType: 'text/plain', bytes: new TextEncoder().encode('from the overview').buffer })")
    expect(page.frame_locator("[data-testid=app-frame][data-app=texteditor]").locator(".cm-content")).to_have_text("from the overview", timeout=30000)
    page.evaluate("OV.openTab('hexeditor', { name: 'data.bin', fileType: '', bytes: new Uint8Array([1, 2, 3, 250]).buffer })")
    expect(page.frame_locator("[data-testid=app-frame][data-app=hexeditor]").locator("body[data-ready]")).to_have_count(1, timeout=30000)
    page.wait_for_function("async () => { const l = await Suite.openFiles.list(); return l.length === 2; }", polling=200, timeout=30000)
    page.locator("[data-testid=tab][data-app=texteditor]").click()  # (the active tab)
    about_workspace(page)
    page.click("[data-testid=workspace-save]")
    expect(page.locator("[data-testid=workspace-file]")).to_have_count(2)
    page.uncheck("[data-testid=workspace-settings]")
    with page.expect_download() as d:
        page.click("[data-testid=workspace-ok]")
    assert d.value.suggested_filename == "suite-workspace.suite.zip"
    path = tmp_path / "suite-workspace.suite.zip"
    d.value.save_as(path)
    z = zipfile.ZipFile(path)
    manifest = json.loads(z.read("workspace.json"))
    assert [(f["path"], f["app"], f["name"], f["tab"]) for f in manifest["files"]] == [
        ("texteditor/notes.txt", "texteditor", "notes.txt", 0), ("hexeditor/data.bin", "hexeditor", "data.bin", 1)]
    assert manifest["activeTab"] == 0 and manifest["settings"] is None
    assert z.read("hexeditor/data.bin") == bytes([1, 2, 3, 250])

    # a new overview opens a tab per saved tab, in order, and shows the active one
    page2 = app_page("overview", init_script=INIT)
    open_workspace(page2, path)
    expect(page2.locator("[data-testid=workspace-entry]")).to_have_count(2)
    page2.click("[data-testid=workspace-ok]")
    expect(page2.locator("[data-testid=toast]").last).to_contain_text("2 files opened", timeout=60000)
    assert page2.evaluate("OV.state.tabs.map((t) => t.app)") == ["texteditor", "hexeditor"]
    assert page2.evaluate("OV.state.tabs.find((t) => t.id === OV.state.active).app") == "texteditor"
    expect(page2.frame_locator("[data-testid=app-frame][data-app=texteditor]").locator(".cm-content")).to_have_text("from the overview", timeout=30000)
    page2.wait_for_function("async () => { const l = await Suite.openFiles.list(); return l.length === 2 && l[1].bytes.length === 4; }", polling=200, timeout=30000)

    # the text editor alone takes its file from the same workspace
    page3 = app_page("texteditor", init_script=INIT)
    open_workspace(page3, path)
    expect(page3.locator("[data-testid=workspace-others]")).to_contain_text("1 files of other applications")
    page3.click("[data-testid=workspace-ok]")
    expect(page3.locator(".cm-content").first).to_have_text("from the overview")
    assert page.errors == [] and page2.errors == [] and page3.errors == []


def test_mobile(app_page, tmp_path):
    page = app_page("texteditor", mobile=True, init_script=INIT)
    page.locator(".cm-content").first.tap()
    page.keyboard.type("on the phone")
    page.locator("[data-testid=about]").tap()
    page.locator("[data-testid=workspace] summary").tap()
    page.locator("[data-testid=workspace-save]").tap()
    form = page.locator("[data-testid=workspace-form]")
    expect(form).to_be_visible()
    box = form.bounding_box()
    assert box["x"] >= 0 and box["x"] + box["width"] <= page.viewport_size["width"] + 1
    with page.expect_download() as d:
        page.locator("[data-testid=workspace-ok]").tap()
    path = tmp_path / "w.suite.zip"
    d.value.save_as(path)
    assert "texteditor/" + page.evaluate("TE.app.docs[0].name") in zipfile.ZipFile(path).namelist()
    assert page.errors == []


def test_example_workspace(app_page):
    """The example workspace of examples.zip (tools/make_examples.py) opens in the overview: four tabs, the document shown."""
    from pathlib import Path
    path = Path(__file__).resolve().parents[2] / "examples" / "en" / "overview" / "office.suite.zip"
    page = app_page("overview", init_script=INIT)
    open_workspace(page, path)
    expect(page.locator("[data-testid=workspace-entry]")).to_have_count(5)
    page.click("[data-testid=workspace-ok]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("5 files opened", timeout=120000)
    assert page.evaluate("OV.state.tabs.map((t) => t.app)") == ["texteditor", "document", "spreadsheet", "diagram"]
    assert page.evaluate("OV.state.tabs.find((t) => t.id === OV.state.active).app") == "document"
    page.wait_for_function("async () => { const l = await Suite.openFiles.list(); return l.length >= 5; }", polling=500, timeout=60000)
    assert page.errors == []
