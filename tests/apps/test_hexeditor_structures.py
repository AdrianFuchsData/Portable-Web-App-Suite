"""Hex editor: structure templates (js/structures.js) for PNG, JPEG, GIF, BMP, WAV, ZIP, ELF and PE, and the structure panel."""
import io
import os
import struct
import wave
import zipfile

from PIL import Image
from playwright.sync_api import expect

from test_hexeditor import NO_PICKERS, load


def parse(page, data):
    return page.evaluate("(b) => HE.structures.parse(new Uint8Array(b))", list(data))


def names(result):
    return [f["name"] for f in result["fields"]]


def child(f, name):
    return next(c for c in f["children"] if c["name"] == name)


def image(fmt, **kw):
    buf = io.BytesIO()
    Image.new("RGB", (20, 10), (200, 0, 0)).save(buf, fmt, **kw)
    return buf.getvalue()


def minimal_pe():
    """A minimal 64-bit PE: DOS header, PE signature, COFF header, optional header (240 bytes), one section."""
    dos = bytearray(64)
    dos[0:2] = b"MZ"
    struct.pack_into("<I", dos, 0x3C, 64)
    coff = struct.pack("<HHIIIHH", 0x8664, 1, 0, 0, 0, 240, 0x22)
    opt = bytearray(240)
    struct.pack_into("<H", opt, 0, 0x20B)
    struct.pack_into("<I", opt, 16, 0x1000)
    struct.pack_into("<Q", opt, 24, 0x140000000)
    struct.pack_into("<H", opt, 68, 3)
    section = b".text\0\0\0" + struct.pack("<IIIIIIHHI", 16, 0x1000, 16, 400, 0, 0, 0, 0, 0x60000020)
    data = bytes(dos) + b"PE\0\0" + coff + bytes(opt) + section
    return data + bytes(400 - len(data)) + b"\x90" * 16


def test_parsers(app_page):
    page = app_page("hexeditor", init_script=NO_PICKERS)
    png = parse(page, image("PNG"))
    assert png["format"] == "PNG" and names(png)[:2] == ["Signature", "IHDR"] and names(png)[-1] == "IEND"
    ihdr = png["fields"][1]
    assert child(ihdr, "Width")["value"] == "20" and child(ihdr, "Height")["value"] == "10" and "RGB" in child(ihdr, "Colour type")["value"]
    jpg = parse(page, image("JPEG"))
    sof = next(f for f in jpg["fields"] if f["name"].startswith("SOF0"))
    assert child(sof, "Width")["value"] == "20" and names(jpg)[-1] == "EOI" and any(n.startswith("SOS") for n in names(jpg))
    gif = parse(page, image("GIF"))
    assert gif["format"] == "GIF" and "Image 1" in names(gif) and names(gif)[-1] == "Trailer"
    bmp = parse(page, image("BMP"))
    info = bmp["fields"][1]
    assert child(info, "Width")["value"] == "20" and child(info, "Bits per pixel")["value"] == "24" and names(bmp)[-1] == "Pixel data"
    wav = io.BytesIO()
    with wave.open(wav, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(44100); w.writeframes(bytes(400))
    riff = parse(page, wav.getvalue())
    fmt = next(f for f in riff["fields"] if f["name"] == "fmt")
    assert child(fmt, "Channels")["value"] == "2" and child(fmt, "Sample rate")["value"] == "44100 Hz" and "data" in names(riff)
    z = io.BytesIO()
    with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED) as f:
        f.writestr("a.txt", "hello " * 50)
        f.writestr("dir/b.bin", bytes(range(256)))
    zr = parse(page, z.getvalue())
    assert names(zr) == ["a.txt", "dir/b.bin", "Central directory", "End of central directory"]
    assert "deflate" in zr["fields"][0]["value"] and child(zr["fields"][-1], "Entries")["value"] == "2"
    elf_path = "/usr/bin/true" if os.path.exists("/usr/bin/true") else "/bin/true"
    elf = parse(page, open(elf_path, "rb").read())
    assert elf["format"] == "ELF" and names(elf)[0] == "ELF header" and "Section headers" in names(elf) and any(n == "Section .text" for n in names(elf))
    pe = parse(page, minimal_pe())
    assert pe["format"].startswith("PE") and "Section .text" in names(pe)
    coff = next(f for f in pe["fields"] if f["name"] == "COFF header")
    assert coff["value"] == "x86-64" and child(next(f for f in pe["fields"] if f["name"] == "Optional header"), "Subsystem")["value"] == "Windows console"
    # damaged and unknown data never throw
    assert parse(page, b"\x89PNG\r\n\x1a\n\xff\xff\xff\xff") is not None and parse(page, b"just text") is None
    assert parse(page, b"PK\x03\x04" + bytes(10)) is not None
    assert page.errors == []


def test_structure_panel(app_page):
    page = app_page("hexeditor", init_script=NO_PICKERS)
    load(page, image("PNG"), "pic.png")
    page.click("[data-testid=side-structure]")
    expect(page.locator("[data-testid=st-format]")).to_have_text("PNG")
    expect(page.locator(".he-hex .st1").first).to_be_visible()  # the fields tint the hex view
    page.locator("[data-testid=st-field][data-name=IHDR]").first.click()
    sel = page.evaluate("[HE.app.state.anchor, HE.app.state.cursor]")
    assert sel == [8, 8 + 25 - 1]  # the whole chunk: 12 + 13 bytes
    expect(page.locator("[data-testid=selection]")).to_have_count(0)  # (the inspector tab is hidden)
    page.locator("[data-testid=st-field][data-name=Width]").click()
    assert page.evaluate("[HE.app.state.anchor, HE.app.state.cursor]") == [16, 19]
    load(page, b"plain text", "a.txt")
    expect(page.locator("[data-testid=st-none]")).to_be_visible()
    page.click("[data-testid=side-inspector]")
    expect(page.locator("[data-testid=inspector]")).to_be_visible()
    assert page.errors == []
