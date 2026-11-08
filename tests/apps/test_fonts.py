"""Fonts (shared/js/fonts.js, vendor/fonts): bundled families, office names on metric-compatible fonts, imported fonts in all apps,
in the settings export and in workspaces; the overview's single copy for its apps."""
import base64
import json
import pathlib
import re
import shutil
import zipfile

import pytest
from playwright.sync_api import expect

ROOT = pathlib.Path(__file__).resolve().parents[2]
INIT = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined; try { localStorage.setItem('suite.files.archives', '0'); } catch (e) {}"
DEJAVU = pathlib.Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")


def woff2(tmp_path, name="MyFont-Bold.woff2"):
    """A WOFF2 file of the bundled fonts (Lato), saved under another name: its family comes from the file name."""
    css = (ROOT / "vendor" / "fonts" / "fonts.css").read_text(encoding="utf-8")
    data = re.search(r'font-family:"Lato";font-style:normal;font-weight:400;[^}]*url\(data:font/woff2;base64,([^)]+)\)', css).group(1)
    path = tmp_path / name
    path.write_bytes(base64.b64decode(data))
    return path


def loaded(page, font):
    return page.evaluate(f"document.fonts.load('16px {font}').then((faces) => faces.length)")


def import_fonts(page, *paths):
    page.keyboard.press("F1")
    page.click("[data-testid=prefs] summary")
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=fonts-import]")
    chooser.value.set_files([str(p) for p in paths])
    expect(page.locator("[data-testid=toast]").last).to_contain_text("Imported")


def test_bundled_fonts_and_office_names(app_page):
    page = app_page("document", init_script=INIT)
    page.wait_for_selector("[data-testid=document] canvas", timeout=60000)
    names = page.evaluate("Suite.fonts.families().map((f) => f.name)")
    for name in ["Arimo", "Liberation Sans", "Liberation Serif", "Liberation Mono", "Carlito", "Caladea", "Gelasio", "Inter", "Open Sans", "Roboto",
                 "Lato", "Montserrat", "Source Serif 4", "Merriweather", "JetBrains Mono", "Fira Code", "Source Code Pro", "Tinos", "Cousine"]:
        assert name in names, name
    assert loaded(page, '"Inter"') > 0 and loaded(page, '"Liberation Serif"') > 0
    # Calibri falls back to Carlito where it is not installed (metric-compatible; nothing is downloaded)
    assert page.evaluate("[...document.fonts].some((f) => f.family.replace(/\"/g, '') === 'Calibri' && f.status !== 'error')")
    # Univer's font menu offers them
    assert {"Inter", "Liberation Sans", "Fira Code"} <= set(page.evaluate("DOC.fonts().map((f) => f.value)"))
    page.keyboard.press("F1")
    page.click("[data-testid=prefs] summary")
    expect(page.locator("[data-testid=fonts-bundled]")).to_contain_text("16 fonts are included")
    assert page.errors == [] and page.requests == []


def test_import_fonts_and_use_them_everywhere(app_page, tmp_path):
    page = app_page("hexeditor", init_script=INIT)  # (an application without bundled fonts can import them, too)
    files = [woff2(tmp_path)] + ([DEJAVU] if DEJAVU.exists() else [])
    import_fonts(page, *files)
    imported = page.evaluate("Suite.fonts.imported().map((f) => [f.family, f.faces.map((x) => [x.weight, x.style])])")
    assert ["MyFont", [[700, "normal"]]] in imported
    if DEJAVU.exists():
        assert ["DejaVu Sans", [[400, "normal"]]] in imported  # (from the font's name table)
    expect(page.locator("[data-testid=font-item]")).to_have_count(len(files))

    # another application of the same browser: loaded and in its menus
    other = page.context.new_page()
    other.on("pageerror", lambda e: page.errors.append(str(e)))
    from helpers.paths import dist_url
    other.goto(dist_url("presentation"))
    other.wait_for_selector("body[data-ready]")
    other.evaluate("Suite.fonts.ready")
    assert loaded(other, '"MyFont"') > 0
    other.evaluate("PR.select(PR.state.deck.slides[0].elements[0].id)")
    assert "MyFont" in other.locator("[data-testid=font] option").all_text_contents()
    editor = page.context.new_page()
    editor.goto(dist_url("texteditor"))
    editor.wait_for_selector("body[data-ready]")
    editor.evaluate("Suite.fonts.ready")
    opts = editor.locator("[data-testid=font] option").all_text_contents()
    assert "JetBrains Mono" in opts and "MyFont" in opts and "Inter" not in opts  # (the text editor has the monospaced fonts)
    editor.select_option("[data-testid=font]", "JetBrains Mono")
    assert "JetBrains Mono" in editor.evaluate("getComputedStyle(document.querySelector('.cm-content')).fontFamily")

    # removed: gone in the other applications too (after their next start)
    page.locator("[data-testid=font-remove]").first.click()
    page.click("[data-testid=confirm-ok]")
    expect(page.locator("[data-testid=font-item]")).to_have_count(len(files) - 1)
    assert page.errors == []


def test_fonts_in_settings_and_workspace(app_page, tmp_path):
    page = app_page("texteditor", init_script=INIT)
    import_fonts(page, woff2(tmp_path))
    page.keyboard.press("Escape")
    # settings export: the imported fonts are offered (and chosen) as a source
    page.keyboard.press("F1")
    page.click("[data-testid=prefs] summary")
    page.click("[data-testid=prefs-export]")
    expect(page.locator("[data-testid=prefs-item-fonts]")).to_be_checked()
    page.select_option("[data-testid=prefs-format]", "json")
    with page.expect_download() as d:
        page.click("[data-testid=prefs-ok]")
    data = json.load(open(d.value.path(), encoding="utf-8"))
    [font] = data["apps"]["suite"]["settings"]["fonts"]
    assert font["family"] == "MyFont" and font["weight"] == 700 and len(base64.b64decode(font["data"])) > 1000
    settings = tmp_path / "suite-settings.json"
    d.value.save_as(settings)

    # a fresh browser profile takes them over
    page2 = app_page("spreadsheet", init_script=INIT)
    page2.keyboard.press("F1")
    page2.click("[data-testid=prefs] summary")
    with page2.expect_file_chooser() as chooser:
        page2.click("[data-testid=prefs-import]")
    chooser.value.set_files(str(settings))
    expect(page2.locator("[data-testid=prefs-item-fonts]")).to_be_checked()
    page2.click("[data-testid=prefs-ok]")
    expect(page2.locator("[data-testid=toast]").last).to_contain_text("1 entries imported")
    assert loaded(page2, '"MyFont"') > 0
    assert "MyFont" in page2.evaluate("SS.fonts().map((f) => f.value)")

    # a workspace carries them (fonts are chosen by default, credentials are not)
    page.keyboard.press("Escape")
    page.click("[data-testid=about]")
    page.click("[data-testid=workspace] summary")
    page.click("[data-testid=workspace-save]")
    expect(page.locator("[data-testid=workspace-source-fonts]")).to_be_checked()
    with page.expect_download() as d:
        page.click("[data-testid=workspace-ok]")
    z = zipfile.ZipFile(d.value.path())
    assert json.loads(z.read("settings.json"))["apps"]["suite"]["settings"]["fonts"][0]["family"] == "MyFont"
    assert page.errors == [] and page2.errors == []


def test_print_frames_have_the_fonts(app_page):
    page = app_page("spreadsheet", init_script=INIT)
    page.evaluate("""() => { const ws = SS.workbook.getActiveSheet(); ws.getRange('A1').setValue('Inter text'); ws.getRange('A1').setFontFamily('Inter'); }""")
    page.evaluate("""() => { window.printed = []; new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
      if (n.tagName === 'IFRAME' && n.dataset.testid === 'print-frame') { window.printed.push(n.srcdoc); n.onload = null; } }))).observe(document.body, { childList: true }); }""")
    page.click("[data-testid=print]")
    page.click("[data-testid=print-ok]")
    page.wait_for_function("() => window.printed.length === 1")
    html = page.evaluate("window.printed[0]")
    assert '@font-face { font-family: "Inter"' in html and '@font-face { font-family: "Arial"' in html and "Merriweather" not in html
    assert page.errors == []


def test_overview_keeps_one_copy(app_page):
    page = app_page("overview", init_script=INIT)
    doc = page.evaluate("OV.appHtml('document')")
    editor = page.evaluate("OV.appHtml('texteditor')")
    assert '"Merriweather"' in doc and '"JetBrains Mono"' in editor and '"Merriweather"' not in editor
    page.evaluate("OV.openTab('texteditor')")
    frame = page.frame_locator("[data-testid=app-frame][data-app=texteditor]")
    expect(frame.locator("[data-testid=font]")).to_be_visible(timeout=30000)
    # the overview file holds the fonts once (about 4.5 MB of them)
    size = (ROOT / "dist" / "overview.html").stat().st_size
    assert (ROOT / "dist" / "overview.html").read_text(encoding="utf-8").count("/* suite-fonts */\n@font-face") == 1 and size < 140 * 2 ** 20
    assert page.errors == []


def test_phone(app_page, tmp_path):
    page = app_page("document", mobile=True, init_script=INIT)
    page.locator("[data-testid=about]").tap()
    page.locator("[data-testid=prefs] summary").tap()
    box = page.locator("[data-testid=fonts]").bounding_box()
    assert box["x"] >= 0 and box["x"] + box["width"] <= page.viewport_size["width"] + 1
    assert page.errors == []
