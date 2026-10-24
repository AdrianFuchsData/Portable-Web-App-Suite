"""FTP/SFTP client (apps/ftp): FTP and FTPS against pyftpdlib, SFTP against OpenSSH, through the relays."""
import os
import shutil
import re
import subprocess
import sys
import threading

import pytest
from playwright.sync_api import expect

from helpers.paths import ROOT, dist_url

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined; window.showDirectoryPicker = undefined;"


@pytest.fixture
def ftp_server(tmp_path, certs, request):
    """pyftpdlib server; request.param: 'plain', 'explicit' or 'implicit'. Yields (port, root)."""
    from pyftpdlib.authorizers import DummyAuthorizer
    from pyftpdlib.handlers import FTPHandler, TLS_FTPHandler
    from pyftpdlib.ioloop import IOLoop
    from pyftpdlib.servers import ThreadedFTPServer
    mode = getattr(request, "param", "plain")
    root = tmp_path / "ftproot"
    (root / "docs").mkdir(parents=True)
    (root / "hello.txt").write_text("hello ftp")
    (root / "docs" / "a.txt").write_text("A")
    authorizer = DummyAuthorizer()
    authorizer.add_user("anna", "secret", str(root), perm="elradfmwMT")
    if mode == "plain":
        handler = type("Handler", (FTPHandler,), {"abstracted_fs": FlakyFS, "use_sendfile": False})
    else:
        _, cert, key = certs
        handler = type("Handler", (TLS_FTPHandler,), {"certfile": str(cert), "keyfile": str(key), "tls_control_required": True, "tls_data_required": True})
        if mode == "implicit":
            handler = implicit_handler(handler)
    handler.authorizer = authorizer
    # own loop, lock and stop event: pyftpdlib shares them between all servers (class attributes), so the
    # close_all() of one test would stop the connections of the next one
    server_class = type("Server", (ThreadedFTPServer,), {"_lock": threading.Lock(), "_exit": threading.Event()})
    server = server_class(("127.0.0.1", 0), handler, ioloop=IOLoop())
    threading.Thread(target=server.serve_forever, kwargs={"blocking": True}, daemon=True).start()
    yield server.socket.getsockname()[1], root
    server.close_all()


FLAKY = {"name": "big.bin", "fail_after": 1024 * 1024, "failures": 1, "seeks": []}


class FlakyFile:
    """A file whose first reads fail after FLAKY["fail_after"] bytes (an interrupted download); seeks are recorded."""

    def __init__(self, f, fail):
        self._f, self._fail, self._sent = f, fail, 0

    def read(self, n=-1):
        if self._fail and self._sent >= FLAKY["fail_after"]:
            raise OSError("connection lost (test)")
        data = self._f.read(n)
        self._sent += len(data)
        return data

    def seek(self, pos, *args):
        FLAKY["seeks"].append(pos)
        return self._f.seek(pos, *args)

    def __getattr__(self, name):
        return getattr(self._f, name)


def _flaky_fs():
    from pyftpdlib.filesystems import AbstractedFS

    class Flaky(AbstractedFS):
        def open(self, filename, mode):
            f = super().open(filename, mode)
            if "r" in mode and os.path.basename(filename) == FLAKY["name"]:
                fail = FLAKY["failures"] > 0
                FLAKY["failures"] -= 1
                return FlakyFile(f, fail)
            return f
    return Flaky


try:
    FlakyFS = _flaky_fs()
except ImportError:  # pragma: no cover - pyftpdlib missing: the FTP tests are skipped anyway
    FlakyFS = None


def implicit_handler(base):
    """Implicit FTPS: TLS starts with the connection (pyftpdlib only has explicit AUTH TLS)."""
    class Implicit(base):
        def __init__(self, conn, server, ioloop=None):
            super().__init__(conn, server, ioloop)
            self._ssl_requested = True

        def handle(self):
            self.secure_connection(self.ssl_context)

        def handle_ssl_established(self):
            base.handle(self)
    return Implicit


def relay_setup(page, relay):
    page.evaluate("r => { FTP.data.relay = r; }", {"url": relay["url"], "token": relay["token"]})


def quick_connect(page, protocol, port, user="anna", password="secret", host="127.0.0.1", key=None):
    page.select_option("[data-testid=q-protocol]", protocol)
    page.fill("[data-testid=q-host]", host)
    page.fill("[data-testid=q-port]", str(port))
    page.fill("[data-testid=q-user]", user)
    page.fill("[data-testid=q-password]", password)
    if key:
        page.fill("[data-testid=q-key]", key)
    page.click("[data-testid=q-connect]")


def names(page, testid="remote-list"):
    return page.locator(f"[data-testid={testid}] [data-testid=entry-name]")


def test_ftp_browse_download_upload_and_manage(app_page, relay, ftp_server, tmp_path):
    port, root = ftp_server
    page = app_page("ftp", init_script=NO_PICKERS)
    assert page.title() == "FTP/SFTP client"
    relay_setup(page, relay)
    quick_connect(page, "ftp", port)
    expect(names(page)).to_have_text(["📁 docs", "📄 hello.txt"], timeout=20000)
    expect(page.locator("[data-testid=remote-path]")).to_have_value("/")

    page.locator("[data-testid=entry]", has_text="hello.txt").click()
    with page.expect_download() as d:
        page.click("[data-testid=download-selected]")
    assert open(d.value.path()).read() == "hello ftp"
    expect(page.locator("[data-testid=job]")).to_have_attribute("data-status", "done")

    big = tmp_path / "big.bin"
    big.write_bytes(os.urandom(300_000))
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=upload-files]")
    chooser.value.set_files(str(big))
    expect(names(page)).to_have_text(["📁 docs", "📄 big.bin", "📄 hello.txt"], timeout=20000)
    assert (root / "big.bin").read_bytes() == big.read_bytes()

    page.click("[data-testid=remote-mkdir]")
    page.fill("[data-testid=name-input]", "new")
    page.click("[data-testid=name-ok]")
    expect(page.locator("[data-testid=entry]", has_text="new")).to_be_visible()
    page.locator("[data-testid=entry]", has_text="hello.txt").click()
    page.click("[data-testid=remote-rename]")
    page.fill("[data-testid=name-input]", "hi.txt")
    page.click("[data-testid=name-ok]")
    expect(page.locator("[data-testid=entry]", has_text="hi.txt")).to_be_visible()

    page.locator("[data-testid=entry]", has_text="docs").click()
    page.click("[data-testid=remote-delete]")
    page.click("[data-testid=confirm-ok]")
    expect(names(page)).to_have_text(["📁 new", "📄 big.bin", "📄 hi.txt"])
    assert sorted(os.listdir(root)) == ["big.bin", "hi.txt", "new"]  # the folder was deleted recursively

    page.locator("[data-testid=entry]", has_text="new").dblclick()
    expect(page.locator("[data-testid=remote-path]")).to_have_value("/new")
    page.click("[data-testid=remote-up]")
    expect(page.locator("[data-testid=remote-path]")).to_have_value("/")
    assert page.errors == []


def test_open_remote_file_with_text_editor(app_page, relay, ftp_server):
    from helpers.bridge import open_with, edit_and_save_text
    port, root = ftp_server
    page = app_page("ftp", init_script=NO_PICKERS)
    relay_setup(page, relay)
    quick_connect(page, "ftp", port)
    page.locator("[data-testid=entry]", has_text="hello.txt").click(timeout=20000)
    editor = open_with(page, "texteditor", lambda: page.click("[data-testid=remote-open-with]"))
    expect(editor.locator(".cm-content")).to_have_text("hello ftp")
    edit_and_save_text(editor, " – edited")
    expect(editor.locator("[data-testid=toast]").last).to_contain_text("Saved to “hello.txt”")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("“hello.txt” was uploaded to the server")
    assert (root / "hello.txt").read_text(encoding="utf-8") == "hello ftp – edited"


def test_open_several_remote_files_in_editor_tabs(app_page, relay, ftp_server):
    from helpers.bridge import open_with, edit_and_save_text
    port, root = ftp_server
    (root / "notes.md").write_text("# notes")
    page = app_page("ftp", init_script=NO_PICKERS)
    relay_setup(page, relay)
    quick_connect(page, "ftp", port)
    page.locator("[data-testid=entry]", has_text="hello.txt").click(timeout=20000)
    page.locator("[data-testid=entry]", has_text="notes.md").click(modifiers=["Control"])
    editor = open_with(page, "texteditor", lambda: page.click("[data-testid=remote-open-with]"))
    expect(editor.locator("[data-testid=tab-name]")).to_have_text(["hello.txt", "notes.md"], timeout=20000)
    expect(editor.locator(".cm-content")).to_have_text("# notes")
    edit_and_save_text(editor, " – edited")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("“notes.md” was uploaded to the server")
    assert (root / "notes.md").read_text(encoding="utf-8") == "# notes – edited"
    assert (root / "hello.txt").read_text(encoding="utf-8") == "hello ftp"
    # a folder in the selection: not possible
    page.locator("[data-testid=entry]", has_text="docs").click(modifiers=["Control"])
    expect(page.locator("[data-testid=remote-open-with]")).to_be_disabled()


@pytest.mark.parametrize("ftp_server, protocol", [("explicit", "ftps"), ("implicit", "ftpsi")], indirect=["ftp_server"])
def test_ftps(app_page, relay, ftp_server, protocol):
    port, root = ftp_server
    page = app_page("ftp", init_script=NO_PICKERS)
    relay_setup(page, relay)
    quick_connect(page, protocol, port, host="localhost")  # the test certificate is for "localhost"
    expect(names(page)).to_have_text(["📁 docs", "📄 hello.txt"], timeout=20000)
    page.locator("[data-testid=entry]", has_text="hello.txt").click()
    with page.expect_download() as d:
        page.click("[data-testid=download-selected]")
    assert open(d.value.path()).read() == "hello ftp"


def test_wrong_password(app_page, relay, ftp_server):
    port, _ = ftp_server
    page = app_page("ftp", init_script=NO_PICKERS)
    relay_setup(page, relay)
    quick_connect(page, "ftp", port, password="nope")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("530", timeout=20000)
    expect(page.locator("[data-testid=not-connected]")).to_be_visible()


def test_sftp(app_page, relay, sshd, tmp_path, request):
    folder = os.path.join(sshd["files"], "ftp-" + os.path.basename(str(tmp_path)))
    os.mkdir(folder)
    request.addfinalizer(lambda: shutil.rmtree(folder, ignore_errors=True))  # other tests list the shared folder
    with open(os.path.join(folder, "x.txt"), "w") as f:
        f.write("sftp file")
    page = app_page("ftp", init_script=NO_PICKERS)
    relay_setup(page, relay)
    quick_connect(page, "sftp", sshd["port"], user=sshd["user"], password="", host="localhost", key=sshd["key"])
    page.click("[data-testid=confirm-ok]")  # host key
    expect(page.locator("[data-testid=remote-path]")).not_to_have_value("", timeout=30000)
    page.fill("[data-testid=remote-path]", folder)
    page.press("[data-testid=remote-path]", "Enter")
    expect(names(page)).to_have_text(["📄 x.txt"])
    page.locator("[data-testid=entry]").dblclick()  # double-click downloads a file
    page.wait_for_event("download")
    # chunked upload that resumes after the part the server has (writeAt), and a chunked download (readAt)
    data = os.urandom(2 * 1024 * 1024 + 77)
    local = tmp_path / "part.bin"
    local.write_bytes(data)
    with open(os.path.join(folder, "part.bin"), "wb") as f:
        f.write(data[:700000])
    page.click("[data-testid=remote-refresh]")
    expect(names(page)).to_have_count(2)
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=upload-files]")
    chooser.value.set_files(str(local))
    page.click("[data-testid=confirm-ok]")  # resume
    expect(page.locator("[data-testid=job]")).to_have_count(2)
    expect(page.locator("[data-testid=job]").last).to_have_attribute("data-status", "done", timeout=30000)
    with open(os.path.join(folder, "part.bin"), "rb") as f:
        assert f.read() == data
    with page.expect_download(timeout=30000) as d:
        page.locator("[data-testid=remote-list] [data-testid=entry]", has_text="part.bin").dblclick()
    assert open(d.value.path(), "rb").read() == data


def test_listing_parsers(app_page):
    page = app_page("ftp", init_script=NO_PICKERS)
    r = page.evaluate("""() => [
      FTP.parseListLine('drwxr-xr-x    2 user  group     4096 Jan  5  2024 My Folder'),
      FTP.parseListLine('-rw-r--r--    1 user  group   123456 Mar 12 09:30 report.pdf'),
      FTP.parseListLine('lrwxrwxrwx    1 user  group        7 Mar 12 09:30 latest -> v1.2'),
      FTP.parseListLine('10-16-26  02:15PM       <DIR>          Windows Dir'),
      FTP.parseListLine('10-16-26  09:00AM                 2048 file.txt'),
      FTP.parseMlsdLine('type=file;size=42;modify=20260101120000; name with spaces.txt'),
      FTP.parseMlsdLine('type=cdir;modify=20260101120000; .'),
    ]""")
    assert r[0]["name"] == "My Folder" and r[0]["isDir"]
    assert r[1]["name"] == "report.pdf" and r[1]["size"] == 123456 and not r[1]["isDir"]
    assert r[2]["name"] == "latest"
    assert r[3]["name"] == "Windows Dir" and r[3]["isDir"]
    assert r[4]["size"] == 2048
    assert r[5]["name"] == "name with spaces.txt" and r[5]["size"] == 42
    assert r[6] is None


STUB_FOLDER = """window.showDirectoryPicker = async () => { const root = await navigator.storage.getDirectory(); return root.getDirectoryHandle('local', { create: true }); };"""


@pytest.fixture
def http_relay(dist_server):
    """A Python relay that accepts the page origin of the test HTTP server (the shared relays accept only file://)."""
    process = subprocess.Popen([sys.executable, str(ROOT / "relay" / "python" / "relay.py"), "--port", "0", "--token", "t",
                                "--origin", dist_server], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for line in process.stdout:
        match = re.search(r"listening on 127\.0\.0\.1:(\d+)", line)
        if match:
            break
    yield {"url": f"http://127.0.0.1:{match.group(1)}", "token": "t"}
    process.terminate()
    process.wait(10)


def test_local_folder_transfers(browser, dist_server, http_relay, ftp_server):
    if browser.browser_type.name != "chromium":
        pytest.skip("File System Access API only in Chromium")
    relay = http_relay
    port, root = ftp_server
    context = browser.new_context()
    context.add_init_script("localStorage.setItem('suite.lang', 'en');" + STUB_FOLDER)
    page = context.new_page()
    page.goto(f"{dist_server}/ftp.html")
    page.wait_for_selector("body[data-ready]")
    page.evaluate("""async () => { const local = await (await navigator.storage.getDirectory()).getDirectoryHandle('local', { create: true });
      const w = await (await local.getFileHandle('mine.txt', { create: true })).createWritable(); await w.write('local content'); await w.close(); }""")
    relay_setup(page, relay)
    quick_connect(page, "ftp", port)
    expect(names(page)).to_have_text(["📁 docs", "📄 hello.txt"], timeout=20000)
    page.click("[data-testid=choose-folder]")
    expect(names(page, "local-list")).to_have_text(["📄 mine.txt"])

    page.locator("[data-testid=local-list] [data-testid=entry]").click()
    page.click("[data-testid=upload-selected]")
    expect(names(page)).to_have_text(["📁 docs", "📄 hello.txt", "📄 mine.txt"], timeout=20000)
    assert (root / "mine.txt").read_text() == "local content"

    page.locator("[data-testid=remote-list] [data-testid=entry]", has_text="docs").click()
    page.click("[data-testid=download-selected]")  # folders are downloaded recursively
    expect(names(page, "local-list")).to_have_text(["📁 docs", "📄 mine.txt"], timeout=20000)
    text = page.evaluate("""async () => { const local = await (await navigator.storage.getDirectory()).getDirectoryHandle('local');
      return (await (await (await local.getDirectoryHandle('docs')).getFileHandle('a.txt')).getFile()).text(); }""")
    assert text == "A"
    context.close()


def test_saved_site(app_page, relay, ftp_server):
    port, _ = ftp_server
    page = app_page("ftp", init_script=NO_PICKERS)
    relay_setup(page, relay)
    page.select_option("[data-testid=q-protocol]", "ftp")
    page.fill("[data-testid=q-host]", "127.0.0.1")
    page.fill("[data-testid=q-port]", str(port))
    page.fill("[data-testid=q-user]", "anna")
    page.fill("[data-testid=q-password]", "secret")
    page.click("[data-testid=save-site]")
    page.fill("[data-testid=name-input]", "My FTP")
    page.click("[data-testid=name-ok]")
    expect(page.locator("[data-testid=site]")).to_contain_text("My FTP")
    page.reload()  # unsaved connections are kept only in memory: simulate with a direct connect from the list
    page.wait_for_selector("body[data-ready]")
    relay_setup(page, relay)
    page.evaluate("([port]) => FTP.data.saveConnection({ name: 'My FTP', protocol: 'ftp', host: '127.0.0.1', port, username: 'anna', password: 'secret' })", [port])
    page.locator("[data-testid=site] a").click()
    expect(names(page)).to_have_text(["📁 docs", "📄 hello.txt"], timeout=20000)


def test_german_interface(app_page):
    page = app_page("ftp", init_script="localStorage.setItem('suite.lang', 'de');")
    expect(page.locator("[data-testid=q-connect]")).to_have_text("Verbinden")


def test_mobile_layout(app_page, relay, ftp_server):
    port, _ = ftp_server
    page = app_page("ftp", mobile=True, init_script=NO_PICKERS)
    relay_setup(page, relay)
    quick_connect(page, "ftp", port)
    expect(names(page)).to_have_text(["📁 docs", "📄 hello.txt"], timeout=20000)
    expect(page.locator("[data-testid=sidebar]")).to_be_hidden()
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert page.errors == []


def test_resume_interrupted_download_and_upload(app_page, relay, ftp_server, tmp_path):
    port, root = ftp_server
    big = os.urandom(3 * 1024 * 1024 + 123)
    (root / "big.bin").write_bytes(big)
    FLAKY.update(failures=1, seeks=[])
    page = app_page("ftp", init_script=NO_PICKERS)
    relay_setup(page, relay)
    quick_connect(page, "ftp", port)
    expect(names(page)).to_have_text(["📁 docs", "📄 big.bin", "📄 hello.txt"], timeout=20000)
    page.locator("[data-testid=remote-list] [data-testid=entry]", has_text="big.bin").dblclick()
    job = page.locator("[data-testid=job]").last
    expect(job).to_have_attribute("data-status", "failed", timeout=20000)
    partial = page.evaluate("FTP.state.queue.at(-1).partial.length")
    assert 0 < partial < len(big)
    with page.expect_download(timeout=30000) as d:
        job.locator("[data-testid=job-resume]").click()
    assert open(d.value.path(), "rb").read() == big
    assert FLAKY["seeks"] == [partial]  # REST: only the rest was transferred

    # upload: the server has the first part of the file
    local = tmp_path / "upload.bin"
    local.write_bytes(big)
    (root / "upload.bin").write_bytes(big[:1000000])
    page.click("[data-testid=remote-refresh]")
    expect(names(page)).to_have_count(4)
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=upload-files]")
    chooser.value.set_files(str(local))
    expect(page.locator("[data-testid=confirm]")).to_contain_text("partly uploaded")
    page.click("[data-testid=confirm-ok]")
    expect(page.locator("[data-testid=job]")).to_have_count(2)
    expect(page.locator("[data-testid=job]").last).to_have_attribute("data-status", "done", timeout=30000)
    assert (root / "upload.bin").read_bytes() == big
    assert page.errors == []


def test_compare_and_synchronize(browser, dist_server, http_relay, ftp_server):
    if browser.browser_type.name != "chromium":
        pytest.skip("File System Access API only in Chromium")
    import time
    port, root = ftp_server
    (root / "same.txt").write_text("same content")
    (root / "changed.txt").write_text("old")
    old = time.time() - 86400
    os.utime(root / "changed.txt", (old, old))
    (root / "docs" / "remote-only.txt").write_text("from the server")
    context = browser.new_context()
    context.add_init_script("localStorage.setItem('suite.lang', 'en');" + STUB_FOLDER)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{dist_server}/ftp.html")
    page.wait_for_selector("body[data-ready]")
    page.evaluate("""async () => { const local = await (await navigator.storage.getDirectory()).getDirectoryHandle('local', { create: true });
      for (const [name, text] of [['same.txt', 'same content'], ['changed.txt', 'new and longer'], ['new-local.txt', 'only here'], ['hello.txt', 'hello ftp']]) {
        const w = await (await local.getFileHandle(name, { create: true })).createWritable(); await w.write(text); await w.close(); } }""")
    relay_setup(page, http_relay)
    quick_connect(page, "ftp", port)
    expect(names(page)).to_have_count(4, timeout=20000)
    page.click("[data-testid=choose-folder]")
    expect(names(page, "local-list")).to_have_count(4)
    page.click("[data-testid=compare]")
    rows = page.locator("[data-testid=sync-row]")
    expect(rows).to_have_count(4)  # same.txt and hello.txt are hidden
    status = dict(zip(rows.locator("[data-testid=sync-name]").all_inner_texts(), [r.get_attribute("data-status") + ":" + r.get_attribute("data-action") for r in rows.all()]))
    assert status == {"changed.txt": "localNewer:up", "docs/a.txt": "onlyRemote:down", "docs/remote-only.txt": "onlyRemote:down", "new-local.txt": "onlyLocal:up"}, status
    page.check("[data-testid=sync-same]")
    expect(rows).to_have_count(6)
    # upload only: nothing is downloaded
    page.select_option("[data-testid=sync-mode]", "up")
    expect(page.locator("[data-testid=sync-row][data-action=down]")).to_have_count(0)
    page.select_option("[data-testid=sync-mode]", "both")
    expect(page.locator("[data-testid=sync-run]")).to_have_text("Synchronize (4)")
    page.locator("[data-testid=sync-row]", has_text="docs/a.txt").locator("[data-testid=sync-action]").select_option("skip")
    expect(page.locator("[data-testid=sync-run]")).to_have_text("Synchronize (3)")
    page.click("[data-testid=sync-run]")
    expect(page.locator("[data-testid=job][data-status=done]")).to_have_count(3, timeout=20000)
    assert (root / "changed.txt").read_text() == "new and longer" and (root / "new-local.txt").read_text() == "only here"
    local_text = page.evaluate("""async () => { const local = await (await navigator.storage.getDirectory()).getDirectoryHandle('local');
      const f = await (await (await local.getDirectoryHandle('docs')).getFileHandle('remote-only.txt')).getFile(); return [await f.text(), (await (await local.getFileHandle('new-local.txt')).getFile()).lastModified]; }""")
    assert local_text[0] == "from the server"
    assert abs((root / "new-local.txt").stat().st_mtime - local_text[1] / 1000) < 2  # MFMT kept the local time
    # compared again: only the skipped file is left
    page.click("[data-testid=compare]")
    expect(page.locator("[data-testid=sync-row]")).to_have_count(1)
    expect(page.locator("[data-testid=sync-row]")).to_have_attribute("data-status", "onlyRemote")
    assert errors == []
    context.close()
