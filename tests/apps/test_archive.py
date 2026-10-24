"""Archive manager (apps/archive); archives are created and checked with zipfile/tarfile/gzip."""
import gzip
import io
import os
import struct
import tarfile
import time
import zipfile
import zlib

import pytest
from playwright.sync_api import expect

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined; window.showDirectoryPicker = undefined;"
README = b"Hello archive\n" * 50


def make_zip(path):
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("readme.txt", README)
        z.writestr("docs/a.md", "# A\n")
        z.writestr("docs/sub/b.txt", "b")
        z.writestr("Ümlaut.txt", "umlaut")
        z.writestr("empty/", "")
        z.writestr("image.png", bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000"
                                              "1f15c4890000000d49444154789c6360f8cf000003010100c9fe92ef0000000049454e44ae426082"))
    return path


def make_tgz(path):
    with tarfile.open(path, "w:gz", format=tarfile.PAX_FORMAT) as t:
        for name, data in (("project/one.txt", b"one"), ("project/" + "long-" * 30 + ".txt", b"long name"), ("project/größe.txt", b"unicode")):
            info = tarfile.TarInfo(name)
            info.size, info.mtime, info.mode = len(data), 1700000000, 0o640
            t.addfile(info, io.BytesIO(data))
        link = tarfile.TarInfo("project/link")
        link.type, link.linkname = tarfile.SYMTYPE, "one.txt"
        t.addfile(link)
    return path


def zipcrypto_zip(path, name, data, password):
    """A ZIP with one stored, ZipCrypto-encrypted entry and one plain entry (zipfile cannot write encrypted entries)."""
    keys = [0x12345678, 0x23456789, 0x34567890]
    crc_byte = lambda k, c: zlib.crc32(bytes([c]), k ^ 0xFFFFFFFF) ^ 0xFFFFFFFF

    def update(c):
        keys[0] = crc_byte(keys[0], c)
        keys[1] = ((keys[1] + (keys[0] & 0xFF)) * 134775813 + 1) & 0xFFFFFFFF
        keys[2] = crc_byte(keys[2], keys[1] >> 24)

    def encrypt(plain):
        out = bytearray()
        for p in plain:
            t = (keys[2] | 2) & 0xFFFF
            out.append(p ^ (((t * (t ^ 1)) >> 8) & 0xFF))
            update(p)
        return bytes(out)

    for c in password:
        update(c)
    crc = zlib.crc32(data)
    body = encrypt(os.urandom(11) + bytes([crc >> 24])) + encrypt(data)
    files = [(name.encode(), 1, crc, body, len(data)), (b"plain.txt", 0, zlib.crc32(b"plain"), b"plain", 5)]
    out, central = io.BytesIO(), io.BytesIO()
    for fname, flags, fcrc, fbody, size in files:
        offset = out.tell()
        out.write(struct.pack("<IHHHHHIIIHH", 0x04034B50, 20, flags, 0, 0, 0x5821, fcrc, len(fbody), size, len(fname), 0) + fname + fbody)
        central.write(struct.pack("<IHHHHHHIIIHHHHHII", 0x02014B50, 20, 20, flags, 0, 0, 0x5821, fcrc, len(fbody), size, len(fname), 0, 0, 0, 0, 0, offset) + fname)
    cd = central.getvalue()
    start = out.tell()
    out.write(cd + struct.pack("<IHHHHIIH", 0x06054B50, 0, 0, len(files), len(files), len(cd), start, 0))
    path.write_bytes(out.getvalue())
    return path


def open_archive(page, path):
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=open]")
    chooser.value.set_files(str(path))
    expect(page.locator("[data-testid=list]")).to_be_visible()


def expect_names(page, expected):
    expect(page.locator("[data-testid=name]")).to_have_text(expected)


def row(page, name):
    return page.locator("[data-testid=row]").filter(has=page.locator("[data-testid=name]", has_text=name))


def touch(page):
    return page.evaluate("matchMedia('(pointer: coarse)').matches")


def pick(page, name, toggle=False):
    """Select a row like a user: a click (Ctrl+click toggles) with a mouse, the checkboxes on touch screens (a tap opens)."""
    if not touch(page):
        row(page, name).click(modifiers=["Control"] if toggle else [])
        return
    if not toggle:
        page.evaluate("document.querySelectorAll('[data-testid=select]:checked').forEach((box) => box.click())")
    row(page, name).locator("[data-testid=select]").click()


def open_row(page, name):
    """Open a folder or preview a file: double-click with a mouse, tap on touch screens."""
    if touch(page):
        row(page, name).click()
    else:
        row(page, name).dblclick()


def download(page, action):
    with page.expect_download() as d:
        action()
    return d.value


def save_download(page, tmp_path):
    d = download(page, lambda: page.click("[data-testid=save]"))
    path = tmp_path / ("saved-" + d.suggested_filename)
    d.save_as(path)
    return path


def test_browse_zip_and_preview(app_page, tmp_path):
    page = app_page("archive", init_script=NO_PICKERS)
    assert page.title() == "Archive manager"
    expect(page.locator("[data-testid=welcome]")).to_be_visible()
    open_archive(page, make_zip(tmp_path / "demo.zip"))
    expect_names(page, ["docs", "empty", "image.png", "readme.txt", "Ümlaut.txt"])
    expect(page.locator("[data-testid=status]")).to_contain_text("ZIP · 5 files, 3 folders")
    open_row(page, "docs")
    expect_names(page, ["sub", "a.md"])
    expect(page.locator("[data-testid=crumb]")).to_have_text(["📦 demo.zip", "docs"])
    page.keyboard.press("Backspace")
    expect_names(page, ["docs", "empty", "image.png", "readme.txt", "Ümlaut.txt"])

    open_row(page, "readme.txt")
    expect(page.locator("[data-testid=preview-text]")).to_contain_text("Hello archive")
    page.click("[data-testid=preview-close]")
    open_row(page, "image.png")
    expect(page.locator("[data-testid=preview-image]")).to_be_visible()
    d = download(page, lambda: page.click("[data-testid=preview-download]"))
    assert d.suggested_filename == "image.png"
    page.click("[data-testid=preview-close]")

    # sorting by size (folders stay first)
    page.click("th:has-text('Size')")
    expect_names(page, ["empty", "docs", "Ümlaut.txt", "image.png", "readme.txt"])  # folders by total size
    assert page.errors == [] and page.requests == []


def test_edit_zip_round_trip(app_page, tmp_path):
    source = make_zip(tmp_path / "demo.zip")
    page = app_page("archive", init_script=NO_PICKERS)
    open_archive(page, source)

    # add a file into docs/
    open_row(page, "docs")
    new_file = tmp_path / "added.txt"
    new_file.write_text("added content")
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=add-files]")
    chooser.value.set_files(str(new_file))
    expect(row(page, "added.txt")).to_be_visible()
    page.click("[data-testid=up]")

    # new folder (renamed inline), rename a file, delete a folder
    page.click("[data-testid=new-folder]")
    page.fill("[data-testid=rename-input]", "fresh")
    page.press("[data-testid=rename-input]", "Enter")
    expect(row(page, "fresh")).to_be_visible()
    pick(page, "Ümlaut.txt")
    page.keyboard.press("F2")
    page.fill("[data-testid=rename-input]", "umlaut.txt")
    page.press("[data-testid=rename-input]", "Enter")
    expect(row(page, "umlaut.txt")).to_be_visible()
    pick(page, "empty")
    page.keyboard.press("Delete")
    page.click("[data-testid=confirm-ok]")
    expect(row(page, "empty")).to_have_count(0)

    saved = save_download(page, tmp_path)
    with zipfile.ZipFile(saved) as z, zipfile.ZipFile(source) as original:
        assert z.testzip() is None
        assert sorted(z.namelist()) == ["docs/", "docs/a.md", "docs/added.txt", "docs/sub/b.txt", "fresh/", "image.png", "readme.txt", "umlaut.txt"]  # folder entries are added for new content
        assert z.read("docs/added.txt") == b"added content" and z.read("umlaut.txt") == b"umlaut"
        assert z.read("readme.txt") == README
        # unchanged entries are copied without recompression
        assert z.getinfo("readme.txt").compress_size == original.getinfo("readme.txt").compress_size
        assert z.getinfo("docs/added.txt").flag_bits & 0x800  # UTF-8 names
    # the app continues with the saved archive
    expect(page.locator("[data-testid=save]")).not_to_have_class("")
    assert page.errors == []


def test_undo_redo(app_page, tmp_path):
    page = app_page("archive", init_script=NO_PICKERS)
    open_archive(page, make_zip(tmp_path / "demo.zip"))
    expect(page.locator("[data-testid=undo]")).to_be_disabled()
    pick(page, "empty")
    page.keyboard.press("Delete")
    page.click("[data-testid=confirm-ok]")
    expect(row(page, "empty")).to_have_count(0)
    pick(page, "readme.txt")
    page.keyboard.press("F2")
    page.fill("[data-testid=rename-input]", "renamed.txt")
    page.press("[data-testid=rename-input]", "Enter")
    expect_names(page, ["docs", "image.png", "renamed.txt", "Ümlaut.txt"])

    page.keyboard.press("Control+z")
    expect_names(page, ["docs", "image.png", "readme.txt", "Ümlaut.txt"])
    page.click("[data-testid=undo]")
    expect_names(page, ["docs", "empty", "image.png", "readme.txt", "Ümlaut.txt"])
    expect(page.locator("[data-testid=undo]")).to_be_disabled()
    page.click("[data-testid=redo]")
    expect_names(page, ["docs", "image.png", "readme.txt", "Ümlaut.txt"])
    page.keyboard.press("Control+y")
    expect_names(page, ["docs", "image.png", "renamed.txt", "Ümlaut.txt"])
    expect(page.locator("[data-testid=redo]")).to_be_disabled()

    # undo restores content and survives saving; the restored entry is written correctly
    page.keyboard.press("Control+z")
    saved = save_download(page, tmp_path)
    with zipfile.ZipFile(saved) as z:
        assert z.read("readme.txt") == README and "empty/" not in z.namelist()
    page.keyboard.press("Control+z")
    expect_names(page, ["docs", "empty", "image.png", "readme.txt", "Ümlaut.txt"])
    assert page.errors == []


def test_compression_level_store(app_page, tmp_path):
    page = app_page("archive", init_script=NO_PICKERS)
    page.click("[data-testid=new]")
    page.evaluate("AR.app.addFiles([{ file: new File(['x'.repeat(5000)], 'x.txt'), path: 'x.txt' }])")
    expect(row(page, "x.txt")).to_be_visible()
    page.select_option("[data-testid=level]", "0")
    d = download(page, lambda: page.click("[data-testid=save]"))  # a new archive is saved with "save as" (here a download)
    path = tmp_path / d.suggested_filename
    d.save_as(path)
    assert path.name == "archive.zip"
    with zipfile.ZipFile(path) as z:
        assert z.getinfo("x.txt").compress_type == zipfile.ZIP_STORED and z.read("x.txt") == b"x" * 5000


def test_tar_gz_long_names_links_and_convert(app_page, tmp_path):
    page = app_page("archive", init_script=NO_PICKERS)
    open_archive(page, make_tgz(tmp_path / "src.tar.gz"))
    expect(page.locator("[data-testid=status]")).to_contain_text("TAR.GZ")
    open_row(page, "project")
    expect_names(page, ["größe.txt", "link", "long-" * 30 + ".txt", "one.txt"])
    open_row(page, "link")
    expect(page.locator("[data-testid=preview-text]")).to_have_text("Link → one.txt")
    page.click("[data-testid=preview-close]")

    # save as TAR (format conversion)
    page.click("[data-testid=save-as]")
    page.select_option("[data-testid=save-as-format]", "tar")
    d = download(page, lambda: page.click("[data-testid=save-as-ok]"))
    assert d.suggested_filename == "src.tar"
    path = tmp_path / "out.tar"
    d.save_as(path)
    with tarfile.open(path) as t:
        members = {m.name: m for m in t.getmembers()}
        assert t.extractfile("project/" + "long-" * 30 + ".txt").read() == b"long name"
        assert t.extractfile("project/größe.txt").read() == b"unicode"
        assert members["project/link"].issym() and members["project/link"].linkname == "one.txt"
        assert members["project/one.txt"].mode == 0o640 and members["project/one.txt"].mtime == 1700000000
    expect(page.locator("[data-testid=status]")).to_contain_text("TAR ·")

    # and as ZIP
    page.click("[data-testid=save-as]")
    page.select_option("[data-testid=save-as-format]", "zip")
    d = download(page, lambda: page.click("[data-testid=save-as-ok]"))
    zpath = tmp_path / d.suggested_filename
    d.save_as(zpath)
    with zipfile.ZipFile(zpath) as z:
        assert z.read("project/one.txt") == b"one"


def test_gz_single_file(app_page, tmp_path):
    path = tmp_path / "notes.txt.gz"
    with gzip.GzipFile(path, "wb", mtime=0) as f:
        f.write(b"gzip text")
    page = app_page("archive", init_script=NO_PICKERS)
    open_archive(page, path)
    expect_names(page, ["notes.txt"])
    page.evaluate("AR.app.addFiles([{ file: new File(['second'], 'two.txt'), path: 'two.txt' }])")
    expect(row(page, "two.txt")).to_be_visible()
    page.click("[data-testid=save]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("exactly one file")
    pick(page, "two.txt")
    page.keyboard.press("Delete")
    page.click("[data-testid=confirm-ok]")
    saved = save_download(page, tmp_path)
    assert gzip.decompress(saved.read_bytes()) == b"gzip text"


def test_zipcrypto_password_and_kept_entries(app_page, tmp_path):
    source = zipcrypto_zip(tmp_path / "secret.zip", "secret.txt", b"top secret", b"pw")
    with zipfile.ZipFile(source) as z:
        assert z.read("secret.txt", pwd=b"pw") == b"top secret"  # the helper writes valid ZipCrypto
    page = app_page("archive", init_script=NO_PICKERS)
    open_archive(page, source)
    expect(row(page, "secret.txt")).to_contain_text("🔒")
    expect(row(page, "secret.txt").locator("[data-testid=lock]")).to_have_attribute("title", "encrypted: ZipCrypto")
    # cancelling the password prompt, a wrong password, the right one
    open_row(page, "secret.txt")
    page.click("[data-testid=password-cancel]")
    expect(page.locator("[data-testid=preview]")).to_have_count(0)
    open_row(page, "secret.txt")
    page.fill("[data-testid=password]", "wrong")
    page.click("[data-testid=password-ok]")
    expect(page.locator("[data-testid=password-dialog]")).to_contain_text("The password is wrong")
    page.fill("[data-testid=password]", "pw")
    page.click("[data-testid=password-ok]")
    expect(page.locator("[data-testid=preview]")).to_contain_text("top secret")
    page.keyboard.press("Escape")
    # files added after unlocking are encrypted the same way; unchanged entries stay as they are
    expect(page.locator("[data-testid=encryption]")).to_have_text("🔒 ZipCrypto")
    page.evaluate("AR.app.addFiles([{ file: new File(['new'], 'new.txt'), path: 'new.txt' }])")
    saved = save_download(page, tmp_path)
    with zipfile.ZipFile(saved) as z:
        info = {i.filename: i for i in z.infolist()}
        assert info["new.txt"].flag_bits & 1 and not info["plain.txt"].flag_bits & 1
        assert z.read("secret.txt", pwd=b"pw") == b"top secret" and z.read("new.txt", pwd=b"pw") == b"new"
        assert z.read("plain.txt") == b"plain"
    assert page.errors == []


def test_aes_zip_read_and_write(app_page, tmp_path):
    import pyzipper
    source = tmp_path / "aes.zip"
    with pyzipper.AESZipFile(source, "w", compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES) as z:
        z.setpassword("geheim ä".encode())  # passwords are UTF-8
        z.writestr("docs/aes.txt", "AES protected " * 50)
    page = app_page("archive", init_script=NO_PICKERS)
    open_archive(page, source)
    open_row(page, "docs")
    expect(row(page, "aes.txt").locator("[data-testid=lock]")).to_have_attribute("title", "encrypted: AES-256")
    open_row(page, "aes.txt")
    page.fill("[data-testid=password]", "geheim ä")
    page.click("[data-testid=password-ok]")
    expect(page.locator("[data-testid=preview]")).to_contain_text("AES protected")
    page.keyboard.press("Escape")
    page.click("[data-testid=up]")
    # save as a new AES-256 archive (everything encrypted) and as ZipCrypto
    page.evaluate("AR.app.addFiles([{ file: new File(['plain text'], 'plain.txt'), path: 'plain.txt' }])")
    for method in ("aes", "zipcrypto"):
        page.click("[data-testid=save-as]")
        page.fill("[data-testid=save-as-name]", f"out-{method}")
        page.select_option("[data-testid=save-as-encryption]", method)
        page.fill("[data-testid=save-as-password]", "neu")
        page.fill("[data-testid=save-as-password2]", "falsch")
        page.click("[data-testid=save-as-ok]")
        expect(page.locator("[data-testid=save-as-error]")).to_have_text("The passwords do not match.")
        page.fill("[data-testid=save-as-password2]", "neu")
        with page.expect_download() as d:
            page.click("[data-testid=save-as-ok]")
        out = tmp_path / d.value.suggested_filename
        d.value.save_as(out)
        with pyzipper.AESZipFile(out) as z:
            infos = {i.filename: i for i in z.infolist()}
            assert all(i.flag_bits & 1 for n, i in infos.items() if not n.endswith("/"))
            z.setpassword(b"neu")
            assert z.read("plain.txt") == b"plain text"
            # the entry that was AES-encrypted keeps its password
            z.setpassword("geheim ä".encode())
            assert z.read("docs/aes.txt") == ("AES protected " * 50).encode()
        if method == "aes":  # the app continues with the saved file: its encrypted entries are kept as they are
            page.evaluate("AR.app.addFiles([{ file: new File(['zip crypto'], 'zc.txt'), path: 'zc.txt' }])")
        else:
            with zipfile.ZipFile(out) as z:  # Python's zipfile reads ZipCrypto (not AES)
                assert z.read("zc.txt", pwd=b"neu") == b"zip crypto"
    assert page.errors == []


def legacy_aes_zip(path, files, password):
    """An AES-256 ZIP as suite versions up to 1.0.0 wrote it: AE-2, made by 0x031e, extra fields 0x5455 + 0x9901 and the
    faulty counter (only its first byte counted, so the key stream repeated after 256 blocks)."""
    import hashlib
    import hmac
    from Cryptodome.Cipher import AES
    out, central = io.BytesIO(), io.BytesIO()
    for name, data, method in files:
        body = zlib.compress(data, 6)[2:-4] if method == 8 else data
        salt = os.urandom(16)
        derived = hashlib.pbkdf2_hmac("sha1", password, salt, 1000, 66)
        key, mac_key, verifier = derived[:32], derived[32:64], derived[64:]
        ecb = AES.new(key, AES.MODE_ECB)
        cipher = bytearray()
        for block in range(0, len(body), 16):
            stream = ecb.encrypt(bytes([((block // 16) + 1) & 0xFF]) + bytes(15))
            cipher += bytes(a ^ b for a, b in zip(body[block:block + 16], stream))
        cipher = bytes(cipher)
        payload = salt + verifier + cipher + hmac.new(mac_key, cipher, hashlib.sha1).digest()[:10]
        extra = struct.pack("<HHBI", 0x5455, 5, 1, 1700000000) + struct.pack("<HHH2sBH", 0x9901, 7, 2, b"AE", 3, method)
        fname = name.encode()
        offset = out.tell()
        out.write(struct.pack("<IHHHHHIIIHH", 0x04034B50, 20, 0x801, 99, 0, 0x5821, 0, len(payload), len(data), len(fname), len(extra)) + fname + extra + payload)
        central.write(struct.pack("<IHHHHHHIIIHHHHHII", 0x02014B50, 0x031E, 20, 0x801, 99, 0, 0x5821, 0, len(payload), len(data), len(fname),
                                  len(extra), 0, 0, 0, 0o100644 << 16, offset) + fname + extra)
    cd = central.getvalue()
    start = out.tell()
    out.write(cd + struct.pack("<IHHHHIIH", 0x06054B50, 0, 0, len(files), len(files), len(cd), start, 0))
    path.write_bytes(out.getvalue())
    return path


B64 = "(s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))"
TO_B64 = "(u) => { let b = ''; for (let i = 0; i < u.length; i += 0x8000) b += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(b); }"


def app_read(page, data, password):
    """{path: bytes} of a ZIP read by the app (archive.js) with a password."""
    import base64
    got = page.evaluate(f"""([s, pw]) => {{ const b64 = {B64}, toB64 = {TO_B64}; AR.app.addPassword(pw);
      return Object.fromEntries(AR.app.read(b64(s), 'x.zip').entries.filter((e) => !e.dir).map((e) => [e.path, toB64(e.load())])); }}""",
                        [base64.b64encode(data).decode(), password])
    return {k: base64.b64decode(v) for k, v in got.items()}


def large_files():
    import random
    rng = random.Random(7)
    words = ["".join(rng.choice("abcdefghijklmnop") for _ in range(rng.randint(2, 9))) for _ in range(2000)]
    return {"text.txt": " ".join(rng.choice(words) for _ in range(40000)).encode(), "random.bin": os.urandom(30000)}


def test_aes_zip_with_large_entries_works_with_other_tools(app_page, tmp_path):
    """Entries larger than 4 KiB (256 AES blocks), stored and deflated, written and read by other ZIP tools."""
    import base64
    import shutil
    import subprocess
    import pyzipper
    files = large_files()
    page = app_page("archive", init_script=NO_PICKERS)
    # written by pyzipper (and 7-Zip, if installed), read by the app
    source = tmp_path / "other.zip"
    with pyzipper.AESZipFile(source, "w", encryption=pyzipper.WZ_AES) as z:
        z.setpassword(b"geheim")
        z.writestr("text.txt", files["text.txt"], compress_type=pyzipper.ZIP_DEFLATED)
        z.writestr("random.bin", files["random.bin"], compress_type=pyzipper.ZIP_STORED)
    assert app_read(page, source.read_bytes(), "geheim") == files
    seven = shutil.which("7z") or shutil.which("7za")
    if seven:
        (tmp_path / "src").mkdir()
        for name, data in files.items():
            (tmp_path / "src" / name).write_bytes(data)
        subprocess.run([seven, "a", "-tzip", "-pgeheim", "-mem=AES256", str(tmp_path / "7z.zip"), "text.txt", "random.bin"],
                       cwd=tmp_path / "src", check=True, capture_output=True)
        assert app_read(page, (tmp_path / "7z.zip").read_bytes(), "geheim") == files
    # written by the app (AES and ZipCrypto), read by pyzipper / zipfile (and tested by 7-Zip)
    for method in ("aes", "zipcrypto"):
        out = tmp_path / f"app-{method}.zip"
        out.write_bytes(base64.b64decode(page.evaluate(f"""([files, method]) => {{ const b64 = {B64}, toB64 = {TO_B64};
          const entries = Object.entries(files).map(([path, s]) => {{ const d = b64(s); return {{ path, size: d.length, mtime: new Date(), load: () => d }}; }});
          return toB64(AR.app.write(entries, 'zip', {{ level: 6, encryption: {{ password: 'geheim', method, all: true }} }})); }}""",
                                                       [{k: base64.b64encode(v).decode() for k, v in files.items()}, method])))
        with pyzipper.AESZipFile(out) as z:
            z.setpassword(b"geheim")
            assert {n: z.read(n) for n in z.namelist()} == files
        if seven:
            result = subprocess.run([seven, "t", "-pgeheim", str(out)], capture_output=True, text=True)
            assert "Everything is Ok" in result.stdout, result.stdout
    assert page.errors == []


def test_aes_zip_of_older_versions_is_read_and_repaired(app_page, tmp_path):
    """Suite versions up to 1.0.0 wrote AES entries with a faulty key stream: still readable, encrypted correctly on saving."""
    import pyzipper
    files = large_files()
    source = legacy_aes_zip(tmp_path / "old.zip", [("text.txt", files["text.txt"], 8), ("random.bin", files["random.bin"], 0)], b"alt")
    with pyzipper.AESZipFile(source) as z:  # other tools cannot read it (the HMAC is right, the content is not)
        z.setpassword(b"alt")
        with pytest.raises(Exception):
            assert z.read("text.txt") == files["text.txt"]
    page = app_page("archive", init_script=NO_PICKERS)
    assert app_read(page, source.read_bytes(), "alt") == files
    # saved without the password: the entries stay as they are (and readable by the app)
    page.evaluate("b => AR.app.load('old.zip', b)", list(source.read_bytes()))
    expect(page.locator("[data-testid=list]")).to_be_visible()
    page.evaluate("AR.app.addFiles([{ file: new File(['new'], 'new.txt'), path: 'new.txt' }])")
    kept = save_download(page, tmp_path)
    with zipfile.ZipFile(kept) as z:
        assert {i.filename: i.create_version | (i.create_system << 8) for i in z.infolist()}["text.txt"] == 0x031E
    # with the password (unlocked by opening the file), saving encrypts them correctly
    open_row(page, "text.txt")
    page.fill("[data-testid=password]", "alt")
    page.click("[data-testid=password-ok]")
    expect(page.locator("[data-testid=preview]")).to_be_visible()
    page.keyboard.press("Escape")
    repaired = save_download(page, tmp_path)
    with pyzipper.AESZipFile(repaired) as z:
        z.setpassword(b"alt")
        assert z.read("text.txt") == files["text.txt"] and z.read("random.bin") == files["random.bin"]
        assert z.read("new.txt") == b"new"
    assert page.errors == []


def test_extract(app_page, tmp_path):
    page = app_page("archive", init_script=NO_PICKERS)
    open_archive(page, make_zip(tmp_path / "demo.zip"))
    pick(page, "readme.txt")
    d = download(page, lambda: page.click("[data-testid=extract]"))
    assert d.suggested_filename == "readme.txt"
    d.save_as(tmp_path / "readme.txt")
    assert (tmp_path / "readme.txt").read_bytes() == README

    # several items without a folder picker: one ZIP with the selection
    pick(page, "readme.txt", toggle=True)  # deselect
    pick(page, "docs")
    pick(page, "image.png", toggle=True)
    expect(page.locator("[data-testid=selection]")).to_have_text("2 selected")
    d = download(page, lambda: page.click("[data-testid=extract]"))
    d.save_as(tmp_path / "part.zip")
    with zipfile.ZipFile(tmp_path / "part.zip") as z:
        assert sorted(n for n in z.namelist() if not n.endswith("/")) == ["docs/a.md", "docs/sub/b.txt", "image.png"]


def test_extract_into_folder(browser, dist_server, tmp_path):
    if browser.browser_type.name != "chromium":
        pytest.skip("File System Access API only in Chromium")
    context = browser.new_context()
    context.add_init_script("localStorage.setItem('suite.lang', 'en'); window.showDirectoryPicker = async () => { const root = await navigator.storage.getDirectory(); return root.getDirectoryHandle('out', { create: true }); };")
    page = context.new_page()
    page.goto(f"{dist_server}/archive.html")
    page.wait_for_selector("body[data-ready]")
    page.evaluate("b => AR.app.load('demo.zip', b)", list(make_zip(tmp_path / "demo.zip").read_bytes()))
    page.click("[data-testid=extract-all]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("5 file(s) extracted to “out”")
    text = page.evaluate("""async () => { const out = await (await navigator.storage.getDirectory()).getDirectoryHandle('out');
      const sub = await (await out.getDirectoryHandle('docs')).getDirectoryHandle('sub');
      await out.getDirectoryHandle('empty');
      return (await (await sub.getFileHandle('b.txt')).getFile()).text(); }""")
    assert text == "b"
    context.close()


def test_errors_and_drop(app_page, tmp_path):
    page = app_page("archive", init_script=NO_PICKERS)
    seven = tmp_path / "x.7z"
    seven.write_bytes(bytes.fromhex("377abcaf271c") + b"\0" * 30)
    open_archive_attempt = page.expect_file_chooser
    with open_archive_attempt() as chooser:
        page.click("[data-testid=open]")
    chooser.value.set_files(str(seven))
    expect(page.locator("[data-testid=toast]").last).to_contain_text("damaged")  # a damaged 7z

    # dropping an archive while nothing is open opens it; dropping files afterwards adds them
    zip_bytes = list(make_zip(tmp_path / "demo.zip").read_bytes())
    drop = """([name, bytes]) => { const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(bytes)], name));
      document.querySelector('[data-testid=main]').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }"""
    page.evaluate(drop, ["demo.zip", zip_bytes])
    expect(row(page, "readme.txt")).to_be_visible()
    page.evaluate(drop, ["dropped.txt", list(b"dropped")])
    expect(row(page, "dropped.txt")).to_be_visible()
    expect(page.locator("[data-testid=save]")).to_be_visible()


def test_german_interface(app_page, tmp_path):
    page = app_page("archive", init_script=NO_PICKERS + "localStorage.setItem('suite.lang', 'de');")
    expect(page.locator("[data-testid=welcome-open]")).to_have_text("Archiv öffnen…")
    open_archive(page, make_zip(tmp_path / "demo.zip"))
    expect(page.locator("[data-testid=extract-all]")).to_have_text("Alles entpacken")


def test_mobile_layout(app_page, tmp_path):
    page = app_page("archive", mobile=True, init_script=NO_PICKERS)
    open_archive(page, make_zip(tmp_path / "demo.zip"))
    row(page, "docs").locator("[data-testid=name]").tap()  # a tap opens folders on touch screens
    expect_names(page, ["sub", "a.md"])
    page.locator("[data-testid=up]").tap()
    row(page, "readme.txt").locator("[data-testid=select]").tap()  # checkboxes select
    expect(page.locator("[data-testid=selection]")).to_have_text("1 selected")
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert page.errors == []


def test_integrity_test(app_page, tmp_path):
    page = app_page("archive", init_script=NO_PICKERS)
    open_archive(page, make_zip(tmp_path / "good.zip"))
    page.click("[data-testid=test]")
    expect(page.locator("[data-testid=test-summary]")).to_have_text("✓ All 5 file(s) are intact.")
    page.click("[data-testid=test-close]")
    expect(page.locator("[data-testid=test-dialog]")).to_have_count(0)
    # a stored entry with a changed byte fails the CRC check
    bad = tmp_path / "bad.zip"
    with zipfile.ZipFile(bad, "w", zipfile.ZIP_STORED) as z:
        z.writestr("ok.txt", "fine")
        z.writestr("broken.txt", b"0123456789" * 10)
    data = bytearray(bad.read_bytes())
    data[data.index(b"0123456789") + 5] ^= 0xFF
    bad.write_bytes(bytes(data))
    open_archive(page, bad)
    page.click("[data-testid=test]")
    expect(page.locator("[data-testid=test-summary]")).to_contain_text("1 of 2 file(s) are damaged")
    expect(page.locator("[data-testid=test-error]")).to_have_count(1)
    expect(page.locator("[data-testid=test-error]")).to_contain_text("broken.txt")
    assert page.errors == []



FIXTURES = os.path.join(os.path.dirname(__file__), "..", "fixtures", "archives")


def test_seven_zip_read_write_and_password(app_page, tmp_path):
    import py7zr
    src = tmp_path / "src"
    (src / "docs").mkdir(parents=True)
    (src / "readme.txt").write_text("hello 7z")
    (src / "docs" / "a.txt").write_text("A" * 5000)
    with py7zr.SevenZipFile(tmp_path / "plain.7z", "w") as z:
        z.writeall(src, arcname="")
    page = app_page("archive", init_script=NO_PICKERS)
    open_archive(page, tmp_path / "plain.7z")
    expect(row(page, "readme.txt")).to_be_visible()
    expect(page.locator("[data-testid=status]")).to_contain_text("7Z")
    open_row(page, "readme.txt")
    expect(page.locator("[data-testid=preview]")).to_contain_text("hello 7z")
    page.keyboard.press("Escape")
    # edit and save as 7z: py7zr reads it
    page.evaluate("AR.app.addFiles([{ file: new File(['neu'], 'neu.txt'), path: 'neu.txt' }])")
    saved = save_download(page, tmp_path)
    assert saved.name.endswith(".7z")
    out = tmp_path / "out"
    with py7zr.SevenZipFile(saved) as z:
        z.extractall(path=out)
    assert (out / "readme.txt").read_bytes() == b"hello 7z" and (out / "neu.txt").read_bytes() == b"neu"
    assert (out / "docs" / "a.txt").read_bytes() == b"A" * 5000

    # encrypted 7z archives cannot be decrypted by libarchive: a clear message (with and without encrypted headers)
    page2 = app_page("archive", init_script=NO_PICKERS)
    for header in (True, False):
        with py7zr.SevenZipFile(tmp_path / f"secret{header}.7z", "w", password="geheim") as z:
            z.set_encrypted_header(header)
            z.writeall(src, arcname="")
        with page2.expect_file_chooser() as chooser:
            page2.click("[data-testid=open]")
        chooser.value.set_files(str(tmp_path / f"secret{header}.7z"))
        expect(page2.locator("[data-testid=toast]").last).to_contain_text("Encrypted 7Z archives cannot be opened")
    assert page.errors == [] and page2.errors == []


def test_rar_xz_and_bz2(app_page, tmp_path):
    page = app_page("archive", init_script=NO_PICKERS)
    open_archive(page, os.path.join(FIXTURES, "rar5_stored.rar"))
    expect(row(page, "helloworld.txt")).to_be_visible()
    expect(page.locator("[data-testid=status]")).to_contain_text("RAR 5")
    open_row(page, "helloworld.txt")
    expect(page.locator("[data-testid=preview]")).to_contain_text("hello libarchive test suite!")
    page.keyboard.press("Escape")
    # RAR can only be read: Save offers another format (7z by default)
    page.click("[data-testid=save]")
    expect(page.locator("[data-testid=save-as-format]")).to_have_value("7z")
    page.select_option("[data-testid=save-as-format]", "zip")
    with page.expect_download() as d:
        page.click("[data-testid=save-as-ok]")
    with zipfile.ZipFile(d.value.path()) as z:
        assert z.read("helloworld.txt").startswith(b"hello libarchive test suite!")

    # RAR 4 with a folder, and RAR 5 with several compressed files
    page2 = app_page("archive", init_script=NO_PICKERS)
    open_archive(page2, os.path.join(FIXTURES, "rar.rar"))
    expect(row(page2, "testdir")).to_be_visible()
    expect(page2.locator("[data-testid=status]")).to_contain_text("RAR")
    page3 = app_page("archive", init_script=NO_PICKERS)
    open_archive(page3, os.path.join(FIXTURES, "rar5_multiple_files.rar"))
    expect(page3.locator("[data-testid=name]")).to_have_text(["test1.bin", "test2.bin", "test3.bin", "test4.bin"])

    # tar.xz and tar.bz2 (Python's tarfile), a single .xz file
    for mode, ext, label in (("w:xz", "tar.xz", "TAR.XZ"), ("w:bz2", "tar.bz2", "TAR.BZ2")):
        path = tmp_path / f"pack.{ext}"
        with tarfile.open(path, mode) as tf:
            data = b"inside " + ext.encode()
            info = tarfile.TarInfo("folder/inner.txt")
            info.size = len(data)
            tf.addfile(info, io.BytesIO(data))
        p = app_page("archive", init_script=NO_PICKERS)
        open_archive(p, path)
        expect(p.locator("[data-testid=status]")).to_contain_text(label)
        open_row(p, "folder")
        open_row(p, "inner.txt")
        expect(p.locator("[data-testid=preview]")).to_contain_text(f"inside {ext}")
        assert p.errors == []
    import lzma
    (tmp_path / "notes.txt.xz").write_bytes(lzma.compress(b"just one file"))
    p = app_page("archive", init_script=NO_PICKERS)
    with p.expect_file_chooser() as chooser:
        p.click("[data-testid=open]")
    chooser.value.set_files(str(tmp_path / "notes.txt.xz"))
    expect(p.locator("[data-testid=toast]").last).to_contain_text("single compressed files cannot be opened")
    assert page.errors == [] and page2.errors == [] and page3.errors == [] and p.errors == []
