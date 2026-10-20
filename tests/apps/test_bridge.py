"""App bridge (shared/js/bridge.js): "Open with…" between apps, saving back to the source app."""
import io
import zipfile

from playwright.sync_api import expect

from helpers.bridge import edit_and_save_text, open_row, open_with, pick_row

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"


def make_zip(path, files):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in files.items():
            z.writestr(name, data)
    path.write_bytes(buf.getvalue())
    return path


def open_archive(page, path):
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=open]")
    chooser.value.set_files(str(path))
    expect(page.locator("[data-testid=list]")).to_be_visible()


def test_archive_entry_in_text_editor_and_back(app_page, tmp_path):
    page = app_page("archive", init_script=NO_PICKERS)
    open_archive(page, make_zip(tmp_path / "demo.zip", {"docs/readme.txt": "Hello archive\n", "data.bin": b"\x00\x01"}))
    open_row(page, page, "docs")
    pick_row(page, page, "readme.txt")
    editor = open_with(page, "texteditor", lambda: page.click("[data-testid=open-with]"))
    expect(editor.locator(".cm-content")).to_have_text("Hello archive")
    expect(editor.locator("[data-testid=toast]").last).to_contain_text("Opened from demo.zip")
    edit_and_save_text(editor, "Edited in the text editor")
    expect(editor.locator("[data-testid=toast]").last).to_contain_text("Saved to “readme.txt”")

    # the archive got the new content (undoable) and is dirty
    expect(page.locator("[data-testid=toast]").last).to_contain_text("“readme.txt” was updated in the archive")
    expect(page.locator("[data-testid=save]")).not_to_have_class("secondary")
    with page.expect_download() as d:
        page.click("[data-testid=save]")
    with zipfile.ZipFile(d.value.path()) as z:
        assert z.read("docs/readme.txt") == b"Hello archive\nEdited in the text editor"
        assert z.read("data.bin") == b"\x00\x01"
    assert page.errors == [] and editor.errors == []


def test_choose_dialog_lists_matching_apps(app_page, tmp_path):
    page = app_page("archive", init_script=NO_PICKERS)
    open_archive(page, make_zip(tmp_path / "demo.zip", {"photo.png": b"\x89PNG", "table.csv": "a,b\n"}))
    pick_row(page, page, "table.csv")
    page.click("[data-testid=open-with]")
    buttons = page.locator("[data-testid=open-with-dialog] .suite-open-with-list").first.locator("button")
    expect(buttons).to_have_text(["📝 Text editor", "📊 Spreadsheet", "🔢 Hex editor"])
    page.click("[data-testid=open-with-dialog] footer button")
    expect(page.locator("[data-testid=open-with-dialog]")).to_have_count(0)


def test_keepass_attachment(app_page, tmp_path):
    from pykeepass import PyKeePass, create_database
    path = tmp_path / "att.kdbx"
    kp = create_database(str(path), password="secret")
    entry = kp.add_entry(kp.root_group, "Server", "root", "pw")
    entry.add_attachment(kp.add_binary(b"key=1\n"), "config.ini")
    kp.save()
    page = app_page("keepass", init_script=NO_PICKERS)
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=choose-db]")
    chooser.value.set_files(str(path))
    page.fill("[data-testid=password]", "secret")
    page.click("[data-testid=unlock]")
    page.locator("[data-testid=entry]", has_text="Server").click(timeout=30000)
    editor = open_with(page, "texteditor", lambda: page.click("[data-testid=attachment-open-with]"))
    expect(editor.locator(".cm-content")).to_have_text("key=1")
    edit_and_save_text(editor, "key=2")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("The attachment “config.ini” was updated")
    with page.expect_download() as d:
        page.click("[data-testid=save]")
    saved = PyKeePass(d.value.path(), password="secret")
    assert saved.find_entries(title="Server", first=True).attachments[0].data == b"key=1\nkey=2"


def test_mail_attachment_is_a_copy(app_page, tmp_path):
    eml = tmp_path / "m.eml"
    eml.write_bytes(b"From: a@example.org\r\nTo: b@example.org\r\nSubject: Report\r\nMIME-Version: 1.0\r\n"
                    b"Content-Type: multipart/mixed; boundary=X\r\n\r\n--X\r\nContent-Type: text/plain\r\n\r\nSee attachment\r\n"
                    b"--X\r\nContent-Type: text/csv\r\nContent-Disposition: attachment; filename=data.csv\r\n\r\na,b\r\n1,2\r\n--X--\r\n")
    page = app_page("mail", init_script=NO_PICKERS)
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=open-file]")
    chooser.value.set_files(str(eml))
    expect(page.locator("[data-testid=subject]")).to_have_text("Report")
    editor = open_with(page, "texteditor", lambda: page.click("[data-testid=attachment-open-with]"))
    expect(editor.locator(".cm-content")).to_contain_text("a,b")
    expect(editor.locator("[data-testid=toast]").last).to_contain_text("Opened from Report as a copy")
    with editor.expect_download() as d:  # no way back: saving downloads
        editor.keyboard.press("Control+s")
    assert d.value.suggested_filename == "data.csv"
