"""FTP/SFTP client: permissions (shown and changed), preview of pictures, text and binary files, editing remote text files."""
import base64
import os
import shutil
import stat

from playwright.sync_api import expect

from test_ftp import NO_PICKERS, ftp_server, names, quick_connect, relay_setup  # noqa: F401 (fixture)

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVQI12P8z8DAwMDAxMDAwMAAAA0AAQ2xGv8AAAAASUVORK5CYII=")


def select(page, name):
    page.locator("[data-testid=remote-list] [data-testid=entry]", has_text=name).click()


def test_ftp_permissions_preview_edit(app_page, relay, ftp_server):  # noqa: F811
    port, root = ftp_server
    (root / "pic.png").write_bytes(PNG)
    (root / "data.bin").write_bytes(bytes(range(256)) * 4)
    os.chmod(root / "hello.txt", 0o640)
    page = app_page("ftp", init_script=NO_PICKERS)
    relay_setup(page, relay)
    quick_connect(page, "ftp", port)
    expect(names(page)).to_have_count(4)
    row = page.locator("[data-testid=remote-list] [data-testid=entry]", has_text="hello.txt")
    expect(row.locator("[data-testid=entry-mode]")).to_have_text("rw-r-----")
    # permissions: checkboxes and octal agree; SITE CHMOD on the server
    select(page, "hello.txt")
    page.click("[data-testid=remote-perms]")
    expect(page.locator("[data-testid=perm-octal]")).to_have_value("640")
    page.check("[data-testid=perm-4]")  # others: read
    expect(page.locator("[data-testid=perm-octal]")).to_have_value("644")
    expect(page.locator("[data-testid=perm-string]")).to_have_text("rw-r--r--")
    page.fill("[data-testid=perm-octal]", "604")
    expect(page.locator("[data-testid=perm-40]")).not_to_be_checked()
    page.click("[data-testid=perms-ok]")
    expect(row.locator("[data-testid=entry-mode]")).to_have_text("rw----r--")
    assert stat.S_IMODE(os.stat(root / "hello.txt").st_mode) == 0o604
    # preview: a picture, a text, a binary file (hex)
    select(page, "pic.png")
    page.click("[data-testid=remote-preview]")
    expect(page.locator("[data-testid=preview-image]")).to_be_visible()
    assert page.evaluate("document.querySelector('[data-testid=preview-image]').naturalWidth") == 2
    page.click("[data-testid=preview-close]")
    select(page, "data.bin")
    page.click("[data-testid=remote-preview]")
    expect(page.locator("[data-testid=preview-hex]")).to_contain_text("00000000  00 01 02 03")
    page.click("[data-testid=preview-close]")
    expect(page.locator("[data-testid=remote-edit]")).to_be_enabled()
    page.click("[data-testid=remote-edit]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("is not a text file")
    # edit a text file (from the preview), save it to the server
    select(page, "hello.txt")
    page.click("[data-testid=remote-preview]")
    expect(page.locator("[data-testid=preview-text]")).to_have_text("hello ftp")
    page.click("[data-testid=preview-edit]")
    expect(page.locator("[data-testid=edit-text]")).to_have_value("hello ftp")
    expect(page.locator("[data-testid=edit-save]")).to_be_disabled()
    page.fill("[data-testid=edit-text]", "hello ftp\nsecond line\n")
    page.keyboard.press("Control+s")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("“hello.txt” was uploaded to the server")
    assert (root / "hello.txt").read_text() == "hello ftp\nsecond line\n"
    # changed on the server meanwhile: asked before overwriting
    (root / "hello.txt").write_text("changed by someone else, longer")
    page.fill("[data-testid=edit-text]", "mine")
    page.click("[data-testid=edit-save]")
    page.click("[data-testid=confirm-cancel]")
    assert (root / "hello.txt").read_text() == "changed by someone else, longer"
    page.click("[data-testid=edit-close]")
    page.click("[data-testid=confirm-ok]")  # discard
    expect(page.locator("[data-testid=edit-dialog]")).to_have_count(0)
    assert page.errors == []


def test_sftp_permissions_and_edit(app_page, relay, sshd, tmp_path, request):
    folder = os.path.join(sshd["files"], "perm-" + os.path.basename(str(tmp_path)))
    os.mkdir(folder)
    request.addfinalizer(lambda: shutil.rmtree(folder, ignore_errors=True))
    script = os.path.join(folder, "run.sh")
    with open(script, "w", newline="") as f:
        f.write("#!/bin/sh\r\necho hi\r\n")
    os.chmod(script, 0o644)
    page = app_page("ftp", init_script=NO_PICKERS)
    relay_setup(page, relay)
    quick_connect(page, "sftp", sshd["port"], user=sshd["user"], password="", host="localhost", key=sshd["key"])
    page.click("[data-testid=confirm-ok]")  # host key
    expect(page.locator("[data-testid=remote-path]")).not_to_have_value("", timeout=30000)
    page.fill("[data-testid=remote-path]", folder)
    page.press("[data-testid=remote-path]", "Enter")
    expect(names(page)).to_have_text(["run.sh"])
    expect(page.locator("[data-testid=entry-mode]")).to_have_text("rw-r--r--")
    select(page, "run.sh")
    page.click("[data-testid=remote-perms]")
    page.check("[data-testid=perm-100]")
    page.check("[data-testid=perm-10]")
    page.check("[data-testid=perm-1]")
    page.click("[data-testid=perms-ok]")
    expect(page.locator("[data-testid=entry-mode]")).to_have_text("rwxr-xr-x")
    assert stat.S_IMODE(os.stat(script).st_mode) == 0o755
    # editing keeps CRLF line ends
    select(page, "run.sh")
    page.click("[data-testid=remote-edit]")
    expect(page.locator("[data-testid=edit-text]")).to_have_value("#!/bin/sh\necho hi\n")
    page.fill("[data-testid=edit-text]", "#!/bin/sh\necho hello\n")
    page.click("[data-testid=edit-save]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("was uploaded")
    with open(script, "rb") as f:
        assert f.read() == b"#!/bin/sh\r\necho hello\r\n"
    assert page.errors == []
