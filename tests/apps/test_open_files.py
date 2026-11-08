"""The open files of an app as an archive (about dialog, shared/js/shell.js: Suite.openFiles), in the archive manager."""
import base64
import io
import zipfile

from playwright.sync_api import expect

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"


def zip_of(page, files_js):
    """The ZIP the shell writes for the files of a JS expression, read with Python's zipfile."""
    b64 = page.evaluate(f"""async () => {{ const z = await Suite.openFiles.zip({files_js}); let s = ''; for (const x of z) s += String.fromCharCode(x); return btoa(s); }}""")
    return zipfile.ZipFile(io.BytesIO(base64.b64decode(b64)))


def test_archive_of_the_open_files(app_page):
    page = app_page("texteditor", init_script=NO_PICKERS)
    page.locator(".cm-content").first.click()
    page.keyboard.type("first text")
    page.evaluate("TE.app.newDocument()")
    page.locator(".cm-content").first.click()
    page.keyboard.type("second text äöü")
    page.keyboard.press("F1")
    page.click("[data-testid=open-files] summary")
    page.click("[data-testid=open-files-start]")
    items = page.locator("[data-testid=open-files-item]")
    expect(items).to_have_count(2)
    expect(page.locator("[data-testid=open-files-form]")).to_contain_text("unsaved changes")
    # the archive opens in the archive manager (here: the sibling file in a new window)
    with page.context.expect_page() as new_page:
        page.click("[data-testid=open-files-ok]")
    archive = new_page.value
    archive.wait_for_load_state()
    assert archive.url.endswith("/archive.html")
    expect(archive.locator("[data-testid=row]")).to_have_count(2, timeout=30000)
    names = archive.evaluate("AR.app.state.entries.map((e) => e.path)")
    assert sorted(names) == sorted(page.evaluate("TE.app.docs.map((d) => d.name)"))
    # the shell's ZIP writer: deflated entries with UTF-8 names, read by Python
    z = zip_of(page, "[{ name: 'ü/a.txt', bytes: new TextEncoder().encode('x'.repeat(1000)) }, { name: 'b.bin', bytes: new Uint8Array([1, 2, 3]) }]")
    assert z.testzip() is None and z.read("ü/a.txt") == b"x" * 1000 and z.read("b.bin") == b"\x01\x02\x03"
    assert z.getinfo("ü/a.txt").compress_type == zipfile.ZIP_DEFLATED and z.getinfo("b.bin").compress_type == zipfile.ZIP_STORED
    assert page.errors == []


def test_nothing_open(app_page):
    page = app_page("hexeditor", init_script=NO_PICKERS)
    page.keyboard.press("F1")
    page.click("[data-testid=open-files] summary")
    page.click("[data-testid=open-files-start]")
    expect(page.locator("[data-testid=open-files-none]")).to_be_visible()
    expect(page.locator("[data-testid=open-files-ok]")).to_be_disabled()
    assert page.errors == []


def test_overview_collects_the_files_of_its_apps(app_page):
    page = app_page("overview", init_script=NO_PICKERS)
    page.evaluate("OV.openTab('texteditor', { name: 'notes.txt', fileType: 'text/plain', bytes: new TextEncoder().encode('from the overview').buffer })")
    frame = page.frame_locator("[data-testid=app-frame][data-app=texteditor]")
    expect(frame.locator(".cm-content")).to_have_text("from the overview", timeout=30000)
    files = page.evaluate("Suite.openFiles.list().then((l) => l.map((f) => [f.name, new TextDecoder().decode(f.bytes)]))")
    assert files == [["texteditor/notes.txt", "from the overview"]]
    # the archive opens in a tab of the archive manager
    page.evaluate("Suite.openFiles.createArchive(Suite.openFiles.list)")
    archive = page.frame_locator("[data-testid=app-frame][data-app=archive]")
    expect(archive.locator("[data-testid=row]")).to_have_count(1, timeout=30000)  # (the folder "texteditor")
    expect(archive.locator("[data-testid=row]")).to_contain_text("texteditor")
    assert page.errors == []


PROVIDERS = ["texteditor", "hexeditor", "document", "spreadsheet", "presentation", "diagram", "imageeditor", "notebook", "calendar",
             "pdfviewer", "http", "reveal", "videoeditor", "audioeditor", "keepass", "dbtool"]


def test_every_provider_answers(app_page):
    """Each application's provider runs on its start state and gives files with bytes (or none)."""
    for app in PROVIDERS:
        page = app_page(app, init_script=NO_PICKERS)
        files = page.evaluate("Suite.openFiles.list().then((l) => l.map((f) => [f.name, f.bytes instanceof Uint8Array, f.bytes.length]))")
        assert all(ok and size > 0 for _, ok, size in files), (app, files)
        assert page.errors == [], (app, page.errors)
        page.context.close()


def test_mobile(app_page):
    page = app_page("texteditor", mobile=True, init_script=NO_PICKERS)
    page.locator(".cm-content").first.tap()
    page.keyboard.type("on the phone")
    page.locator("[data-testid=about]").tap()
    page.locator("[data-testid=open-files] summary").tap()
    page.locator("[data-testid=open-files-start]").tap()
    expect(page.locator("[data-testid=open-files-item]")).to_have_count(1)
    box = page.locator("[data-testid=open-files-form]").bounding_box()
    assert box["x"] >= 0 and box["x"] + box["width"] <= page.viewport_size["width"] + 1
    assert page.errors == []
