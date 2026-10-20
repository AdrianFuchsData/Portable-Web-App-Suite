"""Recent files ("🕘 Recent", shared/js/shell.js Recent) in the editors: a file opened with the picker is listed and can be
opened again after a reload (Chromium keeps file handles; the list is hidden in Firefox)."""
import json
import sqlite3
import struct
import wave

import pytest
from PIL import Image
from playwright.sync_api import expect

from helpers import office_samples

STUB_PICKERS = """
window.showOpenFilePicker = async () => { const root = await navigator.storage.getDirectory(); return [await root.getFileHandle(window.PICK)]; };
window.showSaveFilePicker = async (o) => { const root = await navigator.storage.getDirectory(); return await root.getFileHandle(o.suggestedName, { create: true }); };
"""


def make_ipynb(path):
    path.write_text(json.dumps({"nbformat": 4, "nbformat_minor": 5, "metadata": {}, "cells": [
        {"cell_type": "markdown", "id": "a", "metadata": {}, "source": "# Recent"}]}))
    return path


def make_sqlite(path):
    con = sqlite3.connect(path)
    con.execute("create table t (x)")
    con.commit()
    con.close()
    return path


def make_png(path):
    Image.new("RGBA", (20, 10), (255, 0, 0, 255)).save(path)
    return path


def make_wav(path):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(8000)
        w.writeframes(b"".join(struct.pack("<h", 0) for _ in range(800)))
    return path


def make_drawio(path):
    path.write_text('<mxfile><diagram name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>'
                    '<mxCell id="2" value="Box" style="rounded=0;" vertex="1" parent="1"><mxGeometry x="10" y="10" width="80" height="40" as="geometry"/>'
                    '</mxCell></root></mxGraphModel></diagram></mxfile>')
    return path


def make_deck(path):
    path.write_text('<!doctype html><html><head><title>Recent</title></head><body><div class="reveal"><div class="slides">'
                    '<section><h1>Recent slides</h1></section><section><h2>Second</h2></section></div></div></body></html>')
    return path


def make_bin(path):
    path.write_bytes(bytes(range(64)))
    return path


# app: (file name, maker, how to open the picker)
CASES = {
    "audioeditor": ("recent.wav", make_wav, "open"),
    "notebook": ("recent.ipynb", make_ipynb, "open"),
    "presentation": ("recent.pptx", office_samples.make_pptx, "open"),
    "reveal": ("recent.html", make_deck, "open"),
    "dbtool": ("recent.sqlite", make_sqlite, "open-sqlite"),
    "diagram": ("recent.drawio", make_drawio, "open"),
    "document": ("recent.docx", office_samples.make_docx, "open"),
    "hexeditor": ("recent.bin", make_bin, "open"),
    "imageeditor": ("recent.png", make_png, "menu"),
    "pdfviewer": ("recent.pdf", office_samples.make_pdf, "open"),
    "spreadsheet": ("recent.xlsx", office_samples.make_xlsx, "open"),
}

SHOWN = """(name) => { const body = document.body.cloneNode(true); body.querySelectorAll('select, option').forEach((e) => e.remove());
  return body.innerText.includes(name) || document.title.includes(name) || [...document.querySelectorAll('input')].some((i) => i.value.includes(name)); }"""


@pytest.mark.parametrize("app", sorted(CASES))
def test_recent_files(app, browser, dist_server, tmp_path):
    if browser.browser_type.name != "chromium":
        pytest.skip("File System Access API only in Chromium")
    name, make, how = CASES[app]
    make(tmp_path / name)
    data = (tmp_path / name).read_bytes()
    context = browser.new_context()
    context.add_init_script("localStorage.setItem('suite.lang', 'en');" + STUB_PICKERS + f"window.PICK = {json.dumps(name)};")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{dist_server}/{app}.html")
    page.wait_for_selector("body[data-ready]", timeout=30000)
    page.evaluate("""async ([name, bytes]) => { const root = await navigator.storage.getDirectory();
      const w = await (await root.getFileHandle(name, { create: true })).createWritable(); await w.write(new Uint8Array(bytes)); await w.close(); }""", [name, list(data)])
    recent = page.locator("[data-testid=recent]")
    expect(recent.locator("option", has_text="No recently used files")).to_have_count(1)
    if how == "menu":
        page.click("[data-testid=menu-file] summary")
        page.click("[data-testid=cmd-open]")
    else:
        page.click(f"[data-testid={how}]")
    expect(recent.locator("option", has_text=name)).to_have_count(1, timeout=30000)
    page.wait_for_function(SHOWN, arg=name, timeout=30000)

    # after a reload the file is opened from the list
    page.reload()
    page.wait_for_selector("body[data-ready]", timeout=30000)
    expect(recent.locator("option", has_text=name)).to_have_count(1)
    assert not page.evaluate(SHOWN, name)
    recent.select_option(label=name)
    page.wait_for_function(SHOWN, arg=name, timeout=30000)

    # "Clear list"
    recent.select_option(value="clear")
    expect(recent.locator("option", has_text="No recently used files")).to_have_count(1)
    assert errors == []
    context.close()
