"""Audio editor: tags (title, artist, …) read from opened files and written into WAV, MP3, FLAC and project files; export split
into one file per label or per clip (ZIP)."""
import io
import struct
import wave
import zipfile

from playwright.sync_api import expect

from test_audioeditor import make_wav, open_files, ready


def add_info(path, tags):
    """Append a LIST/INFO chunk to a WAV file (like other programs write it)."""
    data = bytearray(path.read_bytes())
    body = b"INFO"
    for key, value in tags.items():
        v = value.encode() + b"\0"
        body += key.encode() + struct.pack("<I", len(v)) + v + (b"\0" if len(v) % 2 else b"")
    data += b"LIST" + struct.pack("<I", len(body)) + body
    struct.pack_into("<I", data, 4, len(data) - 8)
    path.write_bytes(bytes(data))
    return path


def info_of(data):
    """The LIST/INFO tags of WAV bytes."""
    out, p = {}, 12
    while p + 8 <= len(data):
        cid, size = data[p:p + 4], struct.unpack("<I", data[p + 4:p + 8])[0]
        if cid == b"LIST" and data[p + 8:p + 12] == b"INFO":
            q = p + 12
            while q + 8 <= p + 8 + size:
                k, s = data[q:q + 4].decode(), struct.unpack("<I", data[q + 4:q + 8])[0]
                out[k] = data[q + 8:q + 8 + s].rstrip(b"\0").decode()
                q += 8 + s + (s & 1)
        p += 8 + size + (size & 1)
    return out


def export(page, fmt, split="none", timeout=60000):
    page.click("[data-testid=export]")
    if fmt in ("mp3", "flac"):
        page.wait_for_selector(f"[data-testid=export-format] option[value={fmt}]:not([disabled])", state="attached", timeout=30000)
    page.select_option("[data-testid=export-format]", fmt)
    if fmt != "project":
        page.select_option("[data-testid=export-split]", split)
    with page.expect_download(timeout=timeout) as d:
        page.click("[data-testid=export-ok]")
    return open(d.value.path(), "rb").read(), d.value.suggested_filename


def test_tags_read_and_written(app_page, tmp_path):
    page = ready(app_page)
    src = add_info(make_wav(tmp_path / "song.wav", seconds=1.0, rate=22050), {"INAM": "Morning", "IART": "The Testers", "ICRD": "2024"})
    open_files(page, src)
    assert page.evaluate("AE.state.tags") == {"title": "Morning", "artist": "The Testers", "year": "2024"}
    page.click("[data-testid=export]")
    page.click("[data-testid=export-tags] summary")
    expect(page.locator("[data-testid=tag-title]")).to_have_value("Morning")
    page.fill("[data-testid=tag-album]", "Tests Vol. 1")
    page.fill("[data-testid=tag-track]", "3")
    page.click("text=Cancel")
    data, name = export(page, "wav16")
    assert info_of(data) == {"INAM": "Morning", "IART": "The Testers", "IPRD": "Tests Vol. 1", "ICRD": "2024", "ITRK": "3"}
    with wave.open(io.BytesIO(data)) as w:  # still a valid WAV
        assert w.getnframes() == 22050
    mp3, _ = export(page, "mp3")
    assert mp3[:3] == b"ID3" and b"TIT2" in mp3[:4000] and b"Morning" in mp3[:4000] and b"The Testers" in mp3[:4000]
    flac, _ = export(page, "flac")
    assert b"TITLE=Morning" in flac[:8000] and b"ARTIST=The Testers" in flac[:8000]
    # the project file keeps them
    proj, pname = export(page, "project")
    import json
    assert pname.endswith(".audioproj") and json.loads(zipfile.ZipFile(io.BytesIO(proj)).read("project.json"))["tags"]["album"] == "Tests Vol. 1"
    assert page.errors == []


def test_split_by_labels_and_clips(app_page, tmp_path):
    page = ready(app_page)
    open_files(page, make_wav(tmp_path / "talk.wav", seconds=3.0, rate=8000, channels=1))
    page.evaluate("""() => { AE.state.labels = [{ id: 901, start: 0, end: 1, text: 'Intro' }, { id: 902, start: 1, end: 2.5, text: 'Main: part/1' }]; AE.state.tags = { artist: 'Me', album: 'Show' }; }""")
    data, name = export(page, "wav16", "labels")
    assert name == "talk.zip"
    z = zipfile.ZipFile(io.BytesIO(data))
    assert z.namelist() == ["01 Intro.wav", "02 Main_ part_1.wav"]
    with wave.open(io.BytesIO(z.read("02 Main_ part_1.wav"))) as w:
        assert w.getnframes() == 12000
    tags = info_of(z.read("02 Main_ part_1.wav"))
    assert tags["INAM"] == "Main: part/1" and tags["ITRK"] == "2" and tags["IART"] == "Me" and tags["IPRD"] == "Show"
    # point labels: from each to the next and to the end
    page.evaluate("() => { AE.state.labels = [{ id: 903, start: 0.5, end: 0.5, text: 'A' }, { id: 904, start: 2, end: 2, text: 'B' }]; }")
    data, _ = export(page, "wav16", "labels")
    z = zipfile.ZipFile(io.BytesIO(data))
    lengths = [wave.open(io.BytesIO(z.read(n))).getnframes() for n in z.namelist()]
    assert z.namelist() == ["01 A.wav", "02 B.wav"] and lengths == [12000, 8000]
    # one file per clip (two tracks)
    open_files(page, make_wav(tmp_path / "music.wav", seconds=1.0, rate=8000, channels=1), button="import")
    data, _ = export(page, "wav16", "clips")
    z = zipfile.ZipFile(io.BytesIO(data))
    assert sorted(z.namelist()) == ["01 talk.wav", "02 music.wav"] or sorted(z.namelist()) == ["01 music.wav", "02 talk.wav"]
    assert sorted(wave.open(io.BytesIO(z.read(n))).getnframes() for n in z.namelist()) == [8000, 24000]
    assert page.errors == []
