"""SSH client (apps/ssh) against a local OpenSSH server (helpers/ssh_fixtures.py) through the relays."""
import os
import shutil
import re
import time

from playwright.sync_api import expect
from pykeepass import PyKeePass

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"


def screen_text(page):
    return page.evaluate("""() => { const b = SSH.tab().term.buffer.active; const out = [];
      for (let i = 0; i < b.length; i++) out.push(b.getLine(i).translateToString(true)); return out.join('\\n'); }""")


def wait_text(page, pattern, timeout=20):
    deadline = time.monotonic() + timeout
    while True:
        text = screen_text(page)
        if re.search(pattern, text) or re.search(pattern, text.replace("\n", "")):  # lines wrap on narrow screens
            return text
        assert time.monotonic() < deadline, f"{pattern!r} not on screen:\n{text}"
        page.wait_for_timeout(100)


def fill_dialog(page, relay, sshd, key="key", passphrase=""):
    page.click("[data-testid=new-connection]")
    page.fill("[data-testid=conn-name]", "Test host")
    page.fill("[data-testid=conn-host]", "localhost")
    page.fill("[data-testid=conn-port]", str(sshd["port"]))
    page.fill("[data-testid=conn-username]", sshd["user"])
    page.fill("[data-testid=conn-privateKey]", sshd[key])
    if passphrase:
        page.fill("[data-testid=conn-passphrase]", passphrase)
    page.fill("[data-testid=relay-url]", relay["url"])
    page.locator("[data-testid=relay-url]").blur()
    page.fill("[data-testid=relay-token]", relay["token"])
    page.locator("[data-testid=relay-token]").blur()


def type_command(page, command):
    page.locator(".xterm-helper-textarea").focus()
    page.keyboard.type(command)
    page.keyboard.press("Enter")


def test_terminal_session_and_host_key(app_page, relay, sshd):
    page = app_page("ssh", init_script=NO_PICKERS)
    assert page.title() == "SSH client"
    fill_dialog(page, relay, sshd)
    page.click("[data-testid=conn-connect]")
    expect(page.locator("[data-testid=hostkey-fingerprint]")).to_have_text(sshd["fingerprint"], timeout=30000)
    page.click("[data-testid=hostkey-once]")
    expect(page.locator("[data-testid=tab]")).to_have_attribute("data-status", "connected", timeout=30000)
    wait_text(page, r"\$ |# ")
    type_command(page, "echo hello-$((6*7))")
    wait_text(page, r"hello-42")
    type_command(page, "exit")
    expect(page.locator("[data-testid=tab]")).to_have_attribute("data-status", "closed", timeout=20000)
    expect(page.locator("[data-testid=reconnect]")).to_be_visible()
    assert page.errors == []


def test_rejected_host_key_and_protected_key(app_page, relay, sshd):
    page = app_page("ssh", init_script=NO_PICKERS)
    fill_dialog(page, relay, sshd)
    page.click("[data-testid=conn-connect]")
    page.click("[data-testid=hostkey-reject]")
    wait_text(page, r"host key rejected")
    expect(page.locator("[data-testid=tab]")).to_have_attribute("data-status", "closed")

    fill_dialog(page, relay, sshd, key="protected_key", passphrase="secret phrase")
    page.click("[data-testid=conn-connect]")
    page.click("[data-testid=hostkey-once]")
    expect(page.locator("[data-testid=tab]").nth(1)).to_have_attribute("data-status", "connected", timeout=30000)
    type_command(page, "whoami")
    wait_text(page, re.escape(sshd["user"]))


def test_sftp_panel(app_page, relay, sshd, tmp_path, request):
    files = os.path.join(sshd["files"], os.path.basename(str(tmp_path)))  # a fresh folder per run (the server is shared)
    os.mkdir(files)
    request.addfinalizer(lambda: shutil.rmtree(files, ignore_errors=True))  # other tests list the shared folder
    with open(os.path.join(files, "remote.txt"), "w") as f:
        f.write("from the server")
    page = app_page("ssh", init_script=NO_PICKERS)
    fill_dialog(page, relay, sshd)
    page.click("[data-testid=conn-connect]")
    page.click("[data-testid=hostkey-once]")
    expect(page.locator("[data-testid=tab]")).to_have_attribute("data-status", "connected", timeout=30000)
    page.click("[data-testid=toggle-files]")
    expect(page.locator("[data-testid=file-name]").first).to_be_visible()  # the home directory is listed first
    page.fill("[data-testid=path]", files)
    page.press("[data-testid=path]", "Enter")
    expect(page.locator("[data-testid=file-name]")).to_have_text(["📄 remote.txt"])

    with page.expect_download() as d:
        page.click("[data-testid=file-download]")
    assert open(d.value.path()).read() == "from the server"

    # open with the text editor, save back over SFTP
    from helpers.bridge import open_with, edit_and_save_text
    editor = open_with(page, "texteditor", lambda: page.click("[data-testid=file-open-with]"))
    expect(editor.locator(".cm-content")).to_have_text("from the server")
    edit_and_save_text(editor, " and back")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("“remote.txt” was uploaded to the server")
    assert open(os.path.join(files, "remote.txt")).read() == "from the server and back"
    editor.close()

    local = tmp_path / "upload.bin"
    local.write_bytes(bytes(range(256)) * 100)
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=upload]")
    chooser.value.set_files(str(local))
    expect(page.locator("[data-testid=file-name]")).to_have_text(["📄 remote.txt", "📄 upload.bin"])
    assert open(os.path.join(files, "upload.bin"), "rb").read() == local.read_bytes()

    page.click("[data-testid=mkdir]")
    page.fill("[data-testid=name-input]", "folder")
    page.click("[data-testid=name-ok]")
    expect(page.locator("[data-testid=file-name]").first).to_have_text("📁 folder")
    page.locator("[data-testid=file]", has_text="remote.txt").locator("[data-testid=file-rename]").click()
    page.fill("[data-testid=name-input]", "renamed.txt")
    page.click("[data-testid=name-ok]")
    expect(page.locator("[data-testid=file]", has_text="renamed.txt")).to_be_visible()
    page.locator("[data-testid=file]", has_text="upload.bin").locator("[data-testid=file-delete]").click()
    page.click("[data-testid=confirm-ok]")
    expect(page.locator("[data-testid=file-name]")).to_have_text(["📁 folder", "📄 renamed.txt"])
    assert sorted(os.listdir(files)) == ["folder", "renamed.txt"]
    page.locator("[data-testid=file-name]", has_text="folder").click()
    expect(page.locator("[data-testid=path]")).to_have_value(files + "/folder")
    page.click("[data-testid=up]")
    expect(page.locator("[data-testid=path]")).to_have_value(files)


def test_saved_connection_with_host_key_in_keepass(app_page, relay, sshd, tmp_path):
    page = app_page("ssh", init_script=NO_PICKERS)
    fill_dialog(page, relay, sshd)
    page.click("[data-testid=conn-save]")
    expect(page.locator("[data-testid=saved-connection]")).to_have_count(1)
    page.locator("[data-testid=saved-connection] a").click()  # the key is saved: connects directly
    page.click("[data-testid=hostkey-save]")
    expect(page.locator("[data-testid=tab]")).to_have_attribute("data-status", "connected", timeout=30000)

    page.click("[data-testid=appdata-save]")
    page.fill("[data-testid=appdata-new-password]", "pw")
    page.fill("[data-testid=appdata-new-repeat]", "pw")
    with page.expect_download() as d:
        page.click("[data-testid=appdata-create-ok]")
    path = tmp_path / "connections.kdbx"
    d.value.save_as(path)
    entry = PyKeePass(str(path), password="pw").find_entries(title="Test host", first=True)
    assert entry.username == sshd["user"] and entry.url == f"ssh://{sshd['user']}@localhost:{sshd['port']}"
    assert entry.get_custom_property("privateKey").startswith("-----BEGIN OPENSSH PRIVATE KEY-----")
    assert entry.is_custom_property_protected("privateKey")
    assert entry.get_custom_property("hostKey") == sshd["fingerprint"]

    # with the saved fingerprint there is no question the second time
    page.locator("[data-testid=saved-connection] a").click()
    expect(page.locator("[data-testid=tab]").nth(1)).to_have_attribute("data-status", "connected", timeout=30000)
    expect(page.locator("[data-testid=hostkey-dialog]")).to_have_count(0)


def test_changed_host_key_warning(app_page, relay, sshd):
    page = app_page("ssh", init_script=NO_PICKERS)
    page.evaluate("""([relay, port, user, key]) => {
      SSH.data.relay = relay;
      SSH.data.saveConnection({ name: 'Moved', host: 'localhost', port, username: user, privateKey: key, auth: 'key', hostKey: 'SHA256:old-fingerprint' });
    }""", [{"url": relay["url"], "token": relay["token"]}, sshd["port"], sshd["user"], sshd["key"]])
    page.locator("[data-testid=saved-connection] a").click()
    expect(page.locator("[data-testid=hostkey-changed]")).to_contain_text("SHA256:old-fingerprint", timeout=30000)
    page.click("[data-testid=hostkey-reject]")
    expect(page.locator("[data-testid=tab]")).to_have_attribute("data-status", "closed")


def test_german_interface(app_page):
    page = app_page("ssh", init_script="localStorage.setItem('suite.lang', 'de');")
    expect(page.locator("[data-testid=new-connection]")).to_contain_text("Neue Verbindung")


def test_mobile_layout(app_page, relay, sshd):
    page = app_page("ssh", mobile=True, init_script=NO_PICKERS)
    fill_dialog(page, relay, sshd)
    page.click("[data-testid=conn-connect]")
    page.click("[data-testid=hostkey-once]")
    expect(page.locator("[data-testid=tab]")).to_have_attribute("data-status", "connected", timeout=30000)
    expect(page.locator("[data-testid=extra-keys]")).to_be_visible()
    page.click("[data-testid=key-ctrl]")
    expect(page.locator("[data-testid=key-ctrl]")).not_to_have_class(re.compile("outline"))
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert page.errors == []


def test_key_generation_log_and_known_hosts(app_page, relay, sshd, tmp_path):
    import subprocess
    page = app_page("ssh", init_script=NO_PICKERS)
    page.click("[data-testid=keygen]")
    page.fill("[data-testid=keygen-comment]", "anna@laptop")
    page.fill("[data-testid=keygen-passphrase]", "pass phrase")
    page.click("[data-testid=keygen-generate]")
    public = page.locator("[data-testid=keygen-public]")
    expect(public).to_have_value(re.compile(r"^ssh-ed25519 AAAA\S+ anna@laptop\n$"), timeout=20000)
    with page.expect_download() as d:
        page.click("[data-testid=keygen-save-private]")
    assert d.value.suggested_filename == "id_ed25519"
    private = tmp_path / "id_ed25519"
    d.value.save_as(private)
    private.chmod(0o600)
    assert private.read_text().startswith("-----BEGIN OPENSSH PRIVATE KEY-----")
    derived = subprocess.run(["ssh-keygen", "-y", "-P", "pass phrase", "-f", str(private)], check=True, capture_output=True, text=True).stdout
    assert derived.split()[:2] == public.input_value().split()[:2]  # encrypted with the passphrase, matching key pair
    fp = subprocess.run(["ssh-keygen", "-lf", str(private)], check=True, capture_output=True, text=True).stdout.split()[1]
    expect(page.locator("[data-testid=keygen-fingerprint]")).to_have_text(fp)
    # the new key works: authorize it and connect with "Use in a new connection"
    with open(sshd["authorized_keys"], "a") as f:
        f.write(public.input_value())
    page.click("[data-testid=keygen-use]")
    expect(page.locator("[data-testid=conn-privateKey]")).to_have_value(re.compile("BEGIN OPENSSH PRIVATE KEY"))
    page.fill("[data-testid=conn-name]", "Generated")
    page.fill("[data-testid=conn-host]", "localhost")
    page.fill("[data-testid=conn-port]", str(sshd["port"]))
    page.fill("[data-testid=conn-username]", sshd["user"])
    page.fill("[data-testid=relay-url]", relay["url"])
    page.locator("[data-testid=relay-url]").blur()
    page.fill("[data-testid=relay-token]", relay["token"])
    page.locator("[data-testid=relay-token]").blur()
    page.check("[data-testid=conn-save-password]")  # keeps the passphrase of the new key
    page.click("[data-testid=conn-save]")
    page.locator("[data-testid=saved-connection] a").click()
    page.click("[data-testid=hostkey-save]")
    expect(page.locator("[data-testid=tab]")).to_have_attribute("data-status", "connected", timeout=30000)
    wait_text(page, r"\$ |# ")
    # record a part of the session
    page.click("[data-testid=record]")
    type_command(page, "printf '\\033[31mred\\033[0m and %s\\n' logged-$((40+2))")
    wait_text(page, r"logged-42")
    with page.expect_download() as d:
        page.click("[data-testid=record]")
    log = open(d.value.path(), encoding="utf-8").read()
    assert "red and logged-42" in log and "\x1b" not in log
    with page.expect_download() as d:
        page.click("[data-testid=save-output]")
    assert "logged-42" in open(d.value.path(), encoding="utf-8").read()
    # the saved host key is listed and can be forgotten
    hosts = page.locator("[data-testid=known-host]")
    expect(hosts).to_have_count(1)
    expect(hosts).to_contain_text(sshd["fingerprint"])
    page.click("[data-testid=forget-host-key]")
    expect(hosts).to_have_count(0)
    assert page.errors == []
