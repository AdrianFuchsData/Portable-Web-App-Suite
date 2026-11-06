"""Files in archives from every app (shared/js/archive-link.js and the archive manager's links): Open and Save as offer the
file system or an archive; the archive manager opens, creates and changes the archive; files saved into or opened from it
are saved back into it; a closed archive refuses further saving, and closing it with open files asks first."""
import io
import zipfile

from playwright.sync_api import expect

from helpers.paths import dist_url

ARCHIVES_ON = "localStorage.setItem('suite.files.archives', '1'); window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"


def track(page):
    """Record the errors of a window opened by an app (like the app_page fixture)."""
    page.errors = []
    page.on("pageerror", lambda e: page.errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and page.errors.append(m.text))
    page.wait_for_selector("body[data-ready]")
    return page


def entry_text(archive, path):
    return archive.evaluate("""async (path) => { const e = AR.app.state.entries.find((x) => x.path === path);
      return e ? new TextDecoder().decode(await e.load()) : null; }""", path)


def test_save_into_and_open_from_an_archive(app_page):
    editor = app_page("texteditor", init_script=ARCHIVES_ON)
    editor.locator(".cm-content").click()
    editor.keyboard.type("first version")
    # Save as: the choice, then another archive – a new archive manager window, a new archive there
    editor.click("[data-testid=save-as]")
    dialog = editor.locator("[data-testid=storage-dialog]")
    expect(dialog).to_be_visible()
    expect(dialog.locator("[data-testid=storage-fs]")).to_be_focused()
    with editor.expect_popup() as popup:
        dialog.locator("[data-testid=storage-other]").click()
    archive = track(popup.value)
    link = archive.locator("[data-testid=link-dialog]")
    expect(link).to_contain_text("Open an archive or create a new one first")
    archive.click("[data-testid=link-new-archive]")
    expect(archive.locator("[data-testid=link-name]")).to_have_value("Untitled-1.txt")
    archive.fill("[data-testid=link-name]", "notes.txt")
    archive.click("[data-testid=link-ok]")
    expect(link).to_have_count(0)
    expect(editor.locator("[data-testid=toast]").last).to_contain_text("Saved as “notes.txt” in the archive “archive.zip”")
    assert entry_text(archive, "notes.txt") == "first version"
    # Save writes into the archive again
    editor.locator(".cm-content").click()
    editor.keyboard.press("End")
    editor.keyboard.type(", changed")
    editor.keyboard.press("Control+s")
    expect(archive.locator("[data-testid=row]")).to_have_count(1)
    archive.wait_for_function("() => true")
    editor.wait_for_timeout(500)
    assert entry_text(archive, "notes.txt") == "first version, changed"

    # Open: the open archive is offered; the archive manager asks for the file
    archive.evaluate("AR.app.addFiles([{ file: new File(['second file'], 'other.md'), path: 'docs/other.md' }])")
    editor.click("[data-testid=open]")
    choice = editor.locator("[data-testid=storage-archive]")
    expect(choice).to_have_text("📦 archive.zip (ZIP)")
    choice.click()
    expect(link).to_contain_text("Open from the archive")
    archive.locator("[data-testid=link-file][value='docs/other.md']").check()
    archive.click("[data-testid=link-ok]")
    expect(editor.locator(".cm-content")).to_have_text("second file")

    # closing the archive with files open in other apps asks first; afterwards saving there fails with a message
    archive.click("[data-testid=close-archive]")
    expect(archive.locator("[data-testid=confirm]")).to_contain_text("notes.txt")
    expect(archive.locator("[data-testid=confirm]")).to_contain_text("docs/other.md")
    archive.click("[data-testid=confirm-ok]")  # open files
    archive.click("[data-testid=confirm-ok]")  # unsaved changes
    expect(archive.locator("[data-testid=welcome]")).to_be_visible()
    editor.locator(".cm-content").click()
    editor.keyboard.type("!")
    editor.keyboard.press("Control+s")
    expect(editor.locator("[data-testid=toast]").last).to_contain_text("was closed or replaced")
    assert editor.errors == [] and archive.errors == []


def test_archive_with_a_file_handle_saves_itself(app_page, tmp_path):
    """"Save the archive after every change" writes the archive after each save of the file (here: as a download)."""
    src = tmp_path / "data.zip"
    with zipfile.ZipFile(src, "w") as z:
        z.writestr("readme.txt", "hello")
    editor = app_page("texteditor", init_script=ARCHIVES_ON)
    with editor.expect_popup() as popup:
        editor.click("[data-testid=save-as]")
        editor.locator("[data-testid=storage-other]").click()
    archive = track(popup.value)
    with archive.expect_file_chooser() as chooser:
        archive.click("[data-testid=link-open-archive]")
    chooser.value.set_files(str(src))
    expect(archive.locator("[data-testid=link-name]")).to_be_visible()
    archive.select_option("[data-testid=link-folder]", "")
    archive.fill("[data-testid=link-name]", "new.txt")
    archive.check("[data-testid=link-autosave]")
    with archive.expect_download() as d:
        archive.click("[data-testid=link-ok]")
    with zipfile.ZipFile(io.BytesIO(open(d.value.path(), "rb").read())) as z:
        assert sorted(z.namelist()) == ["new.txt", "readme.txt"] and z.read("readme.txt") == b"hello"
    assert editor.errors == [] and archive.errors == []


def test_cancel_and_setting(app_page):
    editor = app_page("texteditor", init_script=ARCHIVES_ON)
    editor.click("[data-testid=save-as]")
    editor.click("[data-testid=storage-cancel]")
    expect(editor.locator("[data-testid=storage-dialog]")).to_have_count(0)
    # the file system: a download (no save dialog in this browser setup)
    editor.click("[data-testid=save-as]")
    with editor.expect_download() as d:
        editor.click("[data-testid=storage-fs]")
    assert d.value.suggested_filename == "Untitled-1.txt"
    # switched off in the settings: straight to the file system
    editor.keyboard.press("F1")
    editor.locator("[data-testid=prefs] summary").click()
    editor.locator("[data-testid=pref-archives]").uncheck()
    editor.keyboard.press("Escape")
    with editor.expect_download():
        editor.click("[data-testid=save-as]")
    assert editor.evaluate("localStorage.getItem('suite.files.archives')") == "0"
    assert editor.errors == []


def test_overview_routes_to_archive_tabs(app_page):
    """In the overview, the archive manager tabs are offered and shown for their dialog."""
    hub = app_page("overview", init_script="localStorage.setItem('suite.files.archives', '1');")
    hub.locator("[data-testid=app-card][data-app=archive] [data-testid=open-app]").click()
    archive = hub.frame_locator("[data-testid=app-frame][data-app=archive]")
    archive.locator("[data-testid=welcome-new]").click()
    frame = hub.locator("iframe[data-app=archive]").element_handle().content_frame()
    frame.evaluate("AR.app.addFiles([{ file: new File(['from the archive'], 'a.txt'), path: 'a.txt' }])")
    hub.locator("[data-testid=tab-home]").click()
    hub.locator("[data-testid=app-card][data-app=texteditor] [data-testid=open-app]").click()
    editor = hub.frame_locator("[data-testid=app-frame][data-app=texteditor]")
    editor.locator("[data-testid=open]").click()
    editor.locator("[data-testid=storage-archive]").click()
    archive.locator("[data-testid=link-file][value='a.txt']").check()
    archive.locator("[data-testid=link-ok]").click()
    expect(editor.locator(".cm-content")).to_have_text("from the archive")
    assert hub.errors == []


def run_cell(nb, source):
    """Load one code cell and run it; its outputs (to wait for)."""
    nb.evaluate("cells => NB.setCells(NB.fromNotebook({ cells }), 'test.ipynb', null)", [{"cell_type": "code", "source": source, "metadata": {}, "outputs": []}])
    nb.locator("[data-testid=run-all]").click()
    return nb.locator("[data-testid=cell]").first.locator("[data-testid=outputs]")


def test_notebook_mounts_an_archive(app_page, tmp_path):
    src = tmp_path / "data.zip"
    with zipfile.ZipFile(src, "w") as z:
        z.writestr("data.csv", "a,b\n1,2\n")
        z.writestr("sub/x.txt", "remove me")
    nb = app_page("notebook", init_script=ARCHIVES_ON)
    nb.wait_for_selector("body[data-kernel=ready]", timeout=90000)
    # Files panel: Mount archive… -> another archive -> the archive manager opens the file, asks to allow it
    nb.click("[data-testid=mount-archive]")
    expect(nb.locator("[data-testid=storage-fs]")).to_have_count(0)  # (no file system for mounting)
    with nb.expect_popup() as popup:
        nb.click("[data-testid=storage-other]")
    archive = track(popup.value)
    with archive.expect_file_chooser() as chooser:
        archive.click("[data-testid=link-open-archive]")
    chooser.value.set_files(str(src))
    expect(archive.locator("[data-testid=link-dialog]")).to_contain_text("wants to mount “data.zip”")
    archive.click("[data-testid=link-ok]")
    expect(nb.locator("[data-testid=mount]")).to_contain_text("/mnt/data.zip", timeout=60000)  # (after the background loading of packages)
    # plain Python file operations; the changes go back into the archive after the cell
    out = run_cell(nb, "import os, pandas as pd\n"
                       "df = pd.read_csv('/mnt/data.zip/data.csv')\n"
                       "open('/mnt/data.zip/new.txt', 'w').write('created')\n"
                       "os.remove('/mnt/data.zip/sub/x.txt')\n"
                       "with open('/mnt/data.zip/data.csv', 'a') as f:\n    f.write('3,4\\n')\n"
                       "print(int(df.b.sum()), sorted(os.listdir('/mnt/data.zip')))")
    expect(out).to_contain_text("2 ['data.csv', 'new.txt', 'sub']", timeout=60000)
    expect(archive.locator("[data-testid=row]")).to_have_count(3)
    archive.wait_for_timeout(300)
    assert entry_text(archive, "new.txt") == "created"
    assert entry_text(archive, "data.csv") == "a,b\n1,2\n3,4\n"
    assert entry_text(archive, "sub/x.txt") is None
    # the Python API: unmount, mount again (the archive manager asks), list
    out = run_cell(nb, "import suite, os\nawait suite.archives.unmount('data.zip')\nprint(os.path.exists('/mnt/data.zip'))")
    expect(out).to_contain_text("False", timeout=60000)
    out = run_cell(nb, "path = await suite.archives.mount()\nprint(path, sorted(os.listdir(path)), await suite.archives.mounted())")
    expect(archive.locator("[data-testid=link-dialog]")).to_contain_text("wants to mount")
    archive.click("[data-testid=link-ok]")
    expect(out).to_contain_text("/mnt/data.zip ['data.csv', 'new.txt', 'sub']", timeout=60000)
    expect(out).to_contain_text("'closed': False")
    # closed in the archive manager: the notebook says that changes are no longer saved
    archive.click("[data-testid=close-archive]")
    expect(archive.locator("[data-testid=confirm]")).to_contain_text("mounted")
    archive.click("[data-testid=confirm-ok]")
    archive.click("[data-testid=confirm-ok]")
    run_cell(nb, "open('/mnt/data.zip/late.txt', 'w').write('x')")
    expect(nb.locator("[data-testid=toast]").last).to_contain_text("was closed in the archive manager", timeout=60000)
    expect(nb.locator("[data-testid=mount]")).to_contain_text("closed")
    out = run_cell(nb, "await suite.archives.mount()")
    expect(out).to_contain_text("No archive is open", timeout=60000)
    assert nb.errors == [] and archive.errors == []


def test_python_file_system_as_storage(app_page):
    """The notebook's Pyodide file system is offered like an archive (with the warning that it lives only in memory):
    files are saved into it and opened from it; after a restart of Python, saving there fails with a message."""
    nb = app_page("notebook", init_script=ARCHIVES_ON)
    nb.wait_for_selector("body[data-kernel=ready]", timeout=120000)
    nb.evaluate("NB.kernel.writeFile('/home/pyodide/data/input.txt', new TextEncoder().encode('from Python'))")
    nb.evaluate("NB.kernel.writeFile('/home/pyodide/start.txt', new TextEncoder().encode('start'))")
    nb.locator("[data-testid=files] button[title=Refresh]").click()
    nb.locator("[data-testid=file-name]", has_text="start.txt").wait_for()
    # the text editor, started from the notebook ("Open with…"), knows it
    with nb.expect_popup() as popup:
        nb.locator("[data-testid=file]", has_text="start.txt").locator("[data-testid=file-open-with]").click()
        nb.locator("[data-testid=open-with-dialog] button[data-app=texteditor]").click()
    editor = track(popup.value)
    editor.evaluate("localStorage.setItem('suite.files.archives', '1')")
    expect(editor.locator(".cm-content")).to_have_text("start")
    editor.click("[data-testid=new]")
    editor.locator(".cm-content").click()
    editor.keyboard.type("written by the text editor")
    editor.click("[data-testid=save-as]")
    dialog = editor.locator("[data-testid=storage-dialog]")
    expect(dialog.locator("[data-testid=storage-python]")).to_contain_text("Python notebook")
    expect(dialog.locator("[data-testid=storage-python-warning]")).to_contain_text("only in memory")
    dialog.locator("[data-testid=storage-python]").click()
    fs = nb.locator("[data-testid=fs-dialog]")
    expect(fs.locator("[data-testid=fs-warning]")).to_contain_text("only in memory", timeout=30000)
    nb.fill("[data-testid=fs-folder]", "data")
    nb.fill("[data-testid=fs-name]", "note.txt")
    nb.click("[data-testid=fs-ok]")
    expect(editor.locator("[data-testid=toast]").last).to_contain_text("in the Python file system", timeout=20000)
    read = "async (p) => new TextDecoder().decode(await NB.kernel.readFile(p))"
    assert nb.evaluate(read, "/home/pyodide/data/note.txt") == "written by the text editor"
    editor.locator(".cm-content").click()
    editor.keyboard.press("Control+End")
    editor.keyboard.type("!")
    editor.keyboard.press("Control+s")
    nb.wait_for_timeout(1000)
    assert nb.evaluate(read, "/home/pyodide/data/note.txt") == "written by the text editor!"
    # open from it
    editor.click("[data-testid=open]")
    editor.locator("[data-testid=storage-python]").click()
    expect(fs).to_contain_text("Open from the Python file system", timeout=30000)  # (after the background loading of packages)
    nb.locator("[data-testid=fs-file][value='data/input.txt']").check()
    nb.click("[data-testid=fs-ok]")
    expect(editor.locator(".cm-content")).to_have_text("from Python", timeout=20000)
    # a restart: other apps lose their files there (asked first)
    nb.click("[data-testid=restart]")
    nb.click("[data-testid=confirm-ok]")
    expect(nb.locator("[data-testid=confirm]")).to_contain_text("open in other applications")
    nb.click("[data-testid=confirm-ok]")
    expect(nb.locator("[data-testid=status]")).to_contain_text("ready", timeout=120000)
    editor.locator(".cm-content").click()
    editor.keyboard.type("?")
    editor.keyboard.press("Control+s")
    expect(editor.locator("[data-testid=toast]").last).to_contain_text("was restarted")
    assert nb.errors == [] and editor.errors == []
