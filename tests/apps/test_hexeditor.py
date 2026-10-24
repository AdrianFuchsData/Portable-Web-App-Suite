"""Hex editor (apps/hexeditor)."""
import struct
import time

import pytest
from playwright.sync_api import expect

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"


def load(page, data, name="data.bin"):
    page.evaluate("([n, b]) => HE.app.load(n, new Uint8Array(b))", [name, list(data)])
    page.focus("[data-testid=view]")  # a click would move the cursor to the clicked byte


def content(page):
    return bytes(page.evaluate("Array.from(HE.app.state.buffer.bytes())"))


def save_download(page, tmp_path):
    with page.expect_download() as download:
        page.click("[data-testid=save]")
    path = tmp_path / download.value.suggested_filename
    download.value.save_as(path)
    return path


def test_view_and_overwrite(app_page):
    page = app_page("hexeditor", init_script=NO_PICKERS)
    assert page.title() == "Hex editor"
    load(page, b"Hello")
    assert page.locator(".he-row").first.text_content().startswith("00000000")
    page.keyboard.type("4a")  # overwrite "H" with "J"
    assert content(page) == b"Jello"
    page.keyboard.press("Tab")  # ASCII pane
    page.keyboard.type("ELLO")
    assert content(page) == b"JELLO"
    page.keyboard.type("!")  # at the end: appended
    assert content(page) == b"JELLO!"
    expect(page.locator("[data-testid=size]")).to_have_text("6 bytes")
    assert page.errors == [] and page.requests == []


def test_insert_delete_undo_redo(app_page):
    page = app_page("hexeditor", init_script=NO_PICKERS)
    load(page, bytes([1, 2, 3, 4]))
    page.keyboard.press("Insert")
    page.keyboard.type("ff")
    assert content(page) == bytes([0xFF, 1, 2, 3, 4])
    page.keyboard.press("Insert")
    page.keyboard.press("Delete")  # removes the byte under the cursor (1)
    assert content(page) == bytes([0xFF, 2, 3, 4])
    page.keyboard.press("Shift+ArrowRight")
    page.keyboard.press("Backspace")  # removes the selection (2, 3)
    assert content(page) == bytes([0xFF, 4])
    for expected in (bytes([0xFF, 2, 3, 4]), bytes([0xFF, 1, 2, 3, 4]), bytes([1, 2, 3, 4])):
        page.keyboard.press("Control+z")
        assert content(page) == expected
    page.keyboard.press("Control+y")
    assert content(page) == bytes([0xFF, 1, 2, 3, 4])
    page.click("[data-testid=undo]")
    assert content(page) == bytes([1, 2, 3, 4])
    expect(page.locator("[data-testid=save]")).to_have_class("secondary")  # not dirty again (updated with the next render)


def test_find_and_goto(app_page):
    page = app_page("hexeditor", init_script=NO_PICKERS)
    load(page, b"abc DEADBEEF xyz \xde\xad\xbe\xef end \xde\xad")
    page.keyboard.press("Control+f")
    page.fill("[data-testid=find-input]", "de ad be ef")
    page.click("[data-testid=find-next]")
    assert page.evaluate("[HE.app.state.anchor, HE.app.state.cursor]") == [17, 20]
    expect(page.locator("[data-testid=selection]")).to_have_text("4")
    page.select_option("[data-testid=find-type]", "text")
    page.fill("[data-testid=find-input]", "xyz")
    page.click("[data-testid=find-next]")
    assert page.evaluate("HE.app.state.anchor") == 13
    page.fill("[data-testid=find-input]", "nope")
    page.click("[data-testid=find-next]")
    expect(page.locator("[data-testid=toast]")).to_have_text("Not found.")
    page.click("[data-testid=goto]")
    page.fill("[data-testid=goto-input]", "0x18")
    page.keyboard.press("Enter")
    expect(page.locator("[data-testid=offset]")).to_have_text("24 (0x18)")


def test_inspector(app_page):
    page = app_page("hexeditor", init_script=NO_PICKERS)
    data = struct.pack("<I", 0x01020304) + struct.pack("<d", 3.5)
    load(page, data)
    value = lambda k: page.locator(f"[data-testid=v-{k}]")
    expect(value("uint8")).to_have_text("4")
    expect(value("binary")).to_have_text("00000100")
    expect(value("uint32")).to_have_text(str(0x01020304))
    expect(value("uint16")).to_have_text(str(0x0304))
    page.uncheck("[data-testid=little-endian]")
    expect(value("uint32")).to_have_text(str(0x04030201))
    page.check("[data-testid=little-endian]")
    page.evaluate("HE.app.moveTo(4)")
    expect(value("float64")).to_have_text("3.5")


def test_save_download_and_new_file(app_page, tmp_path):
    page = app_page("hexeditor", init_script=NO_PICKERS)
    load(page, bytes(range(256)), "all.bin")
    page.keyboard.type("00")
    path = save_download(page, tmp_path)
    assert path.name == "all.bin" and path.read_bytes() == bytes([0]) + bytes(range(1, 256))
    assert "Replace the original file" in page.text_content("[data-testid=banner]")
    page.click("[data-testid=new]")
    page.focus("[data-testid=view]")
    page.keyboard.type("cafe")
    assert save_download(page, tmp_path).read_bytes() == b"\xca\xfe"


def test_large_file(app_page):
    page = app_page("hexeditor", init_script=NO_PICKERS)
    start = time.time()
    page.evaluate("HE.app.load('big.bin', new Uint8Array(16 * 1024 * 1024).map((_, i) => i & 255))")
    page.focus("[data-testid=view]")
    page.keyboard.press("Control+End")
    page.wait_for_timeout(200)
    elapsed = time.time() - start
    print(f"16 MiB loaded and scrolled to the end in {elapsed:.1f} s")
    assert elapsed < 15
    assert page.locator(".he-row").count() < 200  # virtualized: only visible rows are rendered
    expect(page.locator("[data-testid=offset]")).to_have_text(f"{16 * 1024 * 1024} (0x1000000)")


def test_mouse_selection_and_copy(app_page):
    page = app_page("hexeditor", init_script=NO_PICKERS)
    load(page, bytes(range(32)))
    first = page.locator("[data-offset='2'][data-pane=hex]")
    last = page.locator("[data-offset='5'][data-pane=hex]")
    a, b = first.bounding_box(), last.bounding_box()
    page.mouse.move(a["x"] + 3, a["y"] + 3)
    page.mouse.down()
    page.mouse.move(b["x"] + 3, b["y"] + 3, steps=4)
    page.mouse.up()
    expect(page.locator("[data-testid=selection]")).to_have_text("4")
    page.keyboard.press("Control+c")
    assert page.evaluate("HE.app.state.lastCopied") == "02 03 04 05"


def test_german_interface(app_page):
    page = app_page("hexeditor", init_script="localStorage.setItem('suite.lang', 'de');")
    expect(page.locator("[data-testid=app-title]")).to_have_text("Hex-Editor")
    expect(page.locator("[data-testid=mode]")).to_have_text("Überschreiben")


def test_mobile_edit_with_inspector(app_page):
    page = app_page("hexeditor", mobile=True, init_script=NO_PICKERS)
    load(page, bytes([0x10, 0x20, 0x30]))
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert page.evaluate("HE.app.bytesPerRow()") == 8
    page.locator("[data-offset='1'][data-pane=hex]").tap()
    page.locator("[data-testid=set-value]").fill("ab cd")
    page.locator("[data-testid=set-button]").tap()
    assert content(page) == bytes([0x10, 0xAB, 0xCD])
    assert page.locator("[data-testid=inspector]").is_visible()
    assert page.errors == []


STUB_PICKERS = """
window.showOpenFilePicker = async () => { const root = await navigator.storage.getDirectory(); return [await root.getFileHandle('fw.bin')]; };
"""


def test_write_back(browser, dist_server):
    if browser.browser_type.name != "chromium":
        pytest.skip("File System Access API only in Chromium")
    context = browser.new_context()
    context.add_init_script("localStorage.setItem('suite.lang', 'en');" + STUB_PICKERS)
    page = context.new_page()
    page.goto(f"{dist_server}/hexeditor.html")
    page.wait_for_selector("body[data-ready]")
    page.evaluate("""async () => { const root = await navigator.storage.getDirectory();
      const w = await (await root.getFileHandle('fw.bin', { create: true })).createWritable(); await w.write(new Uint8Array([0, 1, 2])); await w.close(); }""")
    page.click("[data-testid=open]")
    page.wait_for_selector("[data-testid=file-name]:has-text('fw.bin')")
    page.focus("[data-testid=view]")
    page.keyboard.type("ff")
    page.keyboard.press("Control+s")
    page.wait_for_selector("[data-testid=toast]:has-text('Saved to')")
    data = page.evaluate("async () => Array.from(new Uint8Array(await (await (await (await navigator.storage.getDirectory()).getFileHandle('fw.bin')).getFile()).arrayBuffer()))")
    assert data == [0xFF, 1, 2]
    context.close()


def test_checksums(app_page):
    import hashlib
    import zlib
    page = app_page("hexeditor", init_script=NO_PICKERS)
    data = bytes(range(256)) * 300 + b"tail"
    load(page, data)
    page.click("[data-testid=checksums]")
    dialog = page.locator("[data-testid=checksum-dialog]")
    expect(dialog.locator("[data-testid='sum-SHA-256']")).to_have_text(hashlib.sha256(data).hexdigest())
    expect(dialog.locator("[data-testid=sum-MD5]")).to_have_text(hashlib.md5(data).hexdigest())
    expect(dialog.locator("[data-testid='sum-CRC-32']")).to_have_text(f"{zlib.crc32(data):08x}")
    expect(dialog.locator("[data-testid='sum-Adler-32']")).to_have_text(f"{zlib.adler32(data):08x}")
    expect(dialog.locator("[data-testid='sum-SHA-1']")).to_have_text(hashlib.sha1(data).hexdigest())
    expect(dialog.locator("[data-testid='sum-SHA-512']")).to_have_text(hashlib.sha512(data).hexdigest())
    page.click("[data-testid=checksum-close]")
    expect(dialog).to_have_count(0)
    # of the selection; MD5 edge cases (padding at 55/56/64 bytes)
    page.evaluate("() => { HE.app.state.anchor = 1; HE.app.moveTo(3, true); }")
    page.click("[data-testid=checksums]")
    expect(dialog).to_contain_text("3 bytes")
    expect(dialog.locator("[data-testid=sum-MD5]")).to_have_text(hashlib.md5(bytes([1, 2, 3])).hexdigest())
    md5s = page.evaluate("[0, 55, 56, 63, 64, 65].map((n) => HE.md5(new Uint8Array(n).fill(97)))")
    assert md5s == [hashlib.md5(b"a" * n).hexdigest() for n in (0, 55, 56, 63, 64, 65)]
    assert page.errors == []


def test_compare(app_page, tmp_path):
    page = app_page("hexeditor", init_script=NO_PICKERS)
    a = bytearray(range(64))
    b = bytearray(a)
    b[5] = 0xFF
    b[6] = 0xFE
    b[40] = 0
    b += b"XY"  # longer
    load(page, bytes(a))
    other = tmp_path / "other.bin"
    other.write_bytes(bytes(b))
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=compare]")
    chooser.value.set_files(str(other))
    bar = page.locator("[data-testid=compare-bar]")
    expect(bar).to_contain_text("other.bin")
    expect(page.locator("[data-testid=diff-count]")).to_have_text("5 differences")
    expect(page.locator("[data-testid=offset]")).to_contain_text("5 (0x5)")  # moved to the first difference
    expect(page.locator(".he-hex:not(.he-other) .diff")).to_have_count(5)  # two bytes + one + two past the end
    expect(page.locator("[data-testid=other-row]").first.locator("span").nth(5)).to_have_text("FF")
    page.click("[data-testid=diff-next]")
    expect(page.locator("[data-testid=offset]")).to_contain_text("40 (0x28)")
    page.click("[data-testid=diff-next]")
    expect(page.locator("[data-testid=offset]")).to_contain_text("64 (0x40)")
    page.click("[data-testid=diff-prev]")
    expect(page.locator("[data-testid=offset]")).to_contain_text("40 (0x28)")
    page.click("[data-testid=diff-prev]")
    expect(page.locator("[data-testid=offset]")).to_contain_text("5 (0x5)")
    # editing updates the count
    page.evaluate("() => { HE.app.moveTo(40); HE.app.setByteValue('00'); }")
    expect(page.locator("[data-testid=diff-count]")).to_have_text("4 differences")
    page.click("[data-testid=compare-close]")
    expect(bar).to_have_count(0)
    expect(page.locator(".he-ascii").first).to_be_visible()
    assert page.errors == []


def test_tabs(app_page, tmp_path):
    page = app_page("hexeditor", init_script=NO_PICKERS)
    expect(page.locator("[data-testid=tab-name]")).to_have_text(["untitled.bin"])
    (tmp_path / "a.bin").write_bytes(b"\x0a\x0a")
    (tmp_path / "b.bin").write_bytes(b"\x0b\x0b\x0b")
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=open]")
    assert chooser.value.is_multiple()
    chooser.value.set_files([str(tmp_path / "a.bin"), str(tmp_path / "b.bin")])
    # the untouched empty file is replaced; each file gets a tab, the last one is shown
    expect(page.locator("[data-testid=tab-name]")).to_have_text(["a.bin", "b.bin"])
    expect(page.locator("[data-testid=size]")).to_have_text("3 bytes")
    page.focus("[data-testid=view]")
    page.keyboard.press("ArrowRight")
    page.keyboard.type("ff")
    expect(page.locator("[data-testid=tab]", has_text="b.bin").locator("[data-testid=dirty]")).to_be_visible()
    # each tab keeps its content, cursor and undo history
    page.locator("[data-testid=tab]", has_text="a.bin").click()
    assert content(page) == b"\x0a\x0a"
    expect(page.locator("[data-testid=offset]")).to_contain_text("0 (0x0)")
    page.locator("[data-testid=tab]", has_text="b.bin").click()
    assert content(page) == b"\x0b\xff\x0b"
    expect(page.locator("[data-testid=offset]")).to_contain_text("2 (0x2)")
    page.keyboard.press("Control+z")
    page.keyboard.press("Control+y")
    assert content(page) == b"\x0b\xff\x0b"
    # opening a file that is open already shows its tab
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=open]")
    chooser.value.set_files(str(tmp_path / "a.bin"))
    expect(page.locator("[data-testid=tab]")).to_have_count(2)
    expect(page.locator("[data-testid=tab].active [data-testid=tab-name]")).to_have_text("a.bin")
    # New adds a tab; Alt+W closes the active one, a changed one only after asking
    page.click("[data-testid=new]")
    expect(page.locator("[data-testid=tab-name]")).to_have_text(["a.bin", "b.bin", "untitled.bin"])
    page.focus("[data-testid=view]")
    page.keyboard.press("Alt+w")
    expect(page.locator("[data-testid=tab-name]")).to_have_text(["a.bin", "b.bin"])
    page.locator("[data-testid=tab]", has_text="b.bin").locator("[data-testid=close-tab]").click()
    expect(page.locator("[data-testid=confirm]")).to_contain_text("“b.bin” has unsaved changes")
    page.click("[data-testid=confirm-cancel]")
    expect(page.locator("[data-testid=tab]")).to_have_count(2)
    page.locator("[data-testid=tab]", has_text="b.bin").locator("[data-testid=close-tab]").click()
    page.click("[data-testid=confirm-ok]")
    expect(page.locator("[data-testid=tab-name]")).to_have_text(["a.bin"])
    assert content(page) == b"\x0a\x0a"
    # closing the last tab leaves an empty file
    page.locator("[data-testid=close-tab]").click()
    expect(page.locator("[data-testid=tab-name]")).to_have_text(["untitled.bin"])
    expect(page.locator("[data-testid=size]")).to_have_text("0 bytes")
    assert page.errors == []



def test_newer_version_of_an_open_file(app_page):
    """A dropped file with the name of an unchanged tab (no file handle): a newer version replaces the tab's bytes."""
    from helpers.hostile import drop_file
    page = app_page("hexeditor", init_script=NO_PICKERS)
    drop_file(page, "a.bin", b"\x01\x02")
    expect(page.locator("[data-testid=tab-name]")).to_have_text(["a.bin"])
    drop_file(page, "a.bin", b"\x03\x04\x05")
    page.wait_for_function("() => HE.app.state.buffer.length === 3")
    expect(page.locator("[data-testid=tab-name]")).to_have_text(["a.bin"])
    assert content(page) == b"\x03\x04\x05"
    assert page.errors == []
