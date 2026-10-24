"""Overview app (apps/overview): embedded apps in tabs and windows, saving apps, "Open with…" through the overview."""
import io
import re
import zipfile

import pytest
from playwright.sync_api import expect

from helpers.bridge import pick_row
from helpers.paths import DIST, ROOT

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined; window.showDirectoryPicker = undefined;"
APPS = sorted(p.parent.parent.name for p in (ROOT / "apps").glob("*/src/index.html") if p.parent.parent.name != "overview")


def csp(path):
    content = re.search(r'Content-Security-Policy"\s+content="([^"]+)"', path.read_text(encoding="utf-8"), re.S).group(1)
    return {parts[0]: set(parts[1:]) for parts in (d.split() for d in content.split(";")) if parts}


def test_policy_covers_all_apps():
    # apps started by the overview inherit its policy, so it must allow everything any app allows
    hub = csp(ROOT / "apps/overview/src/index.html")
    for app in APPS:
        for directive, sources in csp(ROOT / f"apps/{app}/src/index.html").items():
            assert sources <= hub.get(directive, set()), (app, directive, sources - hub.get(directive, set()))


def test_all_apps_are_embedded():
    import json
    bundle = json.loads((ROOT / "apps/overview/src/bundle.json").read_text())
    assert sorted(bundle["files"]) == APPS


def frame(page, app, index=0):
    return page.frame_locator(f"iframe[data-app={app}]").nth(index)


def start_tab(page, app):
    page.click("[data-testid=tab-home]")
    page.click(f"[data-testid=app-card][data-app={app}] [data-testid=open-app]")
    f = frame(page, app)
    f.locator("body[data-ready]").wait_for(timeout=30000)
    return f


def test_home_tabs_and_unsaved_changes(app_page):
    page = app_page("overview", init_script=NO_PICKERS)
    assert page.title() == "Portable Web App Suite"
    expect(page.locator("[data-testid=app-card]")).to_have_count(len(APPS))
    editor = start_tab(page, "texteditor")
    expect(page.locator("[data-testid=tab]")).to_have_count(1)
    editor.locator(".cm-content").click()
    page.keyboard.type("draft")
    expect(page.locator("[data-testid=tab][data-app=texteditor]")).to_contain_text("•")  # unsaved changes
    start_tab(page, "hexeditor")
    page.click("[data-testid=tab-home]")
    expect(page.locator("[data-testid=home]")).to_be_visible()
    page.locator("[data-testid=tab][data-app=texteditor] button").first.click()
    expect(editor.locator(".cm-content")).to_have_text("draft")  # the app kept its state
    page.locator("[data-testid=tab][data-app=texteditor] [data-testid=tab-close]").click()
    expect(page.locator("[data-testid=confirm]")).to_contain_text("unsaved changes")
    page.click("[data-testid=confirm-ok]")
    expect(page.locator("[data-testid=tab]")).to_have_count(1)
    assert page.errors == [] and page.requests == []


def test_open_with_inside_the_overview(app_page, tmp_path):
    page = app_page("overview", init_script=NO_PICKERS)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("notes.txt", "from the archive")
    (tmp_path / "demo.zip").write_bytes(buf.getvalue())
    archive = start_tab(page, "archive")
    with page.expect_file_chooser() as chooser:
        archive.locator("[data-testid=open]").click()
    chooser.value.set_files(str(tmp_path / "demo.zip"))
    pick_row(page, archive, "notes.txt")
    archive.locator("[data-testid=open-with]").click()
    archive.locator("[data-testid=open-with-dialog] button[data-app=texteditor]").click()

    editor = frame(page, "texteditor")  # a new tab, no pop-up window
    expect(page.locator("[data-testid=tab][data-app=texteditor]")).to_be_visible()
    expect(editor.locator(".cm-content")).to_have_text("from the archive", timeout=30000)
    editor.locator(".cm-content").click()
    page.keyboard.press("Control+End")
    page.keyboard.type("!")
    page.keyboard.press("Control+s")
    expect(editor.locator("[data-testid=toast]").last).to_contain_text("Saved to “notes.txt”")
    page.locator("[data-testid=tab][data-app=archive] button").first.click()
    expect(archive.locator("[data-testid=toast]").last).to_contain_text("was updated in the archive")
    expect(page.locator("[data-testid=tab][data-app=archive]")).to_contain_text("•")
    with page.expect_download() as d:
        archive.locator("[data-testid=save]").click()
    with zipfile.ZipFile(d.value.path()) as z:
        assert z.read("notes.txt") == b"from the archive!"
    assert page.errors == []


def test_open_several_files_with_one_app_inside_the_overview(app_page, tmp_path):
    page = app_page("overview", init_script=NO_PICKERS)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("one.bin", b"\x01")
        z.writestr("two.bin", b"\x02\x02")
    (tmp_path / "demo.zip").write_bytes(buf.getvalue())
    archive = start_tab(page, "archive")
    with page.expect_file_chooser() as chooser:
        archive.locator("[data-testid=open]").click()
    chooser.value.set_files(str(tmp_path / "demo.zip"))
    for name in ("one.bin", "two.bin"):
        archive.locator("[data-testid=row]", has_text=name).locator("[data-testid=select]").check()
    archive.locator("[data-testid=open-with]").click()
    archive.locator("[data-testid=open-with-dialog] button[data-app=hexeditor]").click()
    hexed = frame(page, "hexeditor")  # one tab of the overview with both files
    expect(page.locator("[data-testid=tab][data-app=hexeditor]")).to_have_count(1)
    expect(hexed.locator("[data-testid=tab-name]")).to_have_text(["one.bin", "two.bin"], timeout=30000)
    hexed.locator("[data-testid=view]").focus()
    page.keyboard.type("ee")
    page.keyboard.press("Control+s")
    page.locator("[data-testid=tab][data-app=archive] button").first.click()
    expect(archive.locator("[data-testid=toast]").last).to_contain_text("“two.bin” was updated in the archive")
    assert page.errors == []


def test_open_local_file_with_an_app(app_page, tmp_path):
    page = app_page("overview", init_script=NO_PICKERS)
    (tmp_path / "data.csv").write_text("a,b\n1,2\n")
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=open-file]")
    chooser.value.set_files(str(tmp_path / "data.csv"))
    page.click("[data-testid=open-with-dialog] button[data-app=texteditor]")
    editor = frame(page, "texteditor")
    expect(editor.locator(".cm-content")).to_have_text("a,b1,2", timeout=30000)


def test_save_apps(app_page):
    page = app_page("overview", init_script=NO_PICKERS)
    with page.expect_download() as d:
        page.click("[data-testid=app-card][data-app=hexeditor] [data-testid=save-app]")
    assert d.value.suggested_filename == "hexeditor.html"
    assert open(d.value.path(), "rb").read() == (DIST / "hexeditor.html").read_bytes()
    with page.expect_download(timeout=120000) as d:
        page.click("[data-testid=save-all]")
    assert d.value.suggested_filename == "portable-web-app-suite.zip"
    with zipfile.ZipFile(d.value.path()) as z:
        assert z.testzip() is None
        assert sorted(z.namelist()) == [f"portable-web-app-suite/{a}.html" for a in APPS]
        assert z.read("portable-web-app-suite/calendar.html") == (DIST / "calendar.html").read_bytes()


def test_open_in_window(app_page):
    page = app_page("overview", init_script=NO_PICKERS)
    with page.context.expect_page() as new_page:
        page.click("[data-testid=app-card][data-app=calendar] [data-testid=open-window]")
    win = new_page.value
    win.wait_for_selector("body[data-ready]", timeout=30000)
    assert win.title() == "Calendar"
    assert win.evaluate("[window.isSecureContext, !!Suite.bridge.hub()]") == [True, True]


def test_mobile_layout(app_page):
    page = app_page("overview", mobile=True, init_script=NO_PICKERS)
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    start_tab(page, "texteditor")
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    box = page.locator("iframe[data-app=texteditor]").bounding_box()
    assert box["width"] >= 380 and box["height"] > 500
