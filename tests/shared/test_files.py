"""shared/js/files.js: open, save (write back or download), save as, drop, recent files."""
import pytest

from helpers.paths import dist_url

# Native pickers cannot be automated: in Chromium they are replaced by stubs that return real
# FileSystemFileHandle objects from the origin private file system (OPFS needs an http origin).
STUB_PICKERS = """
window.showOpenFilePicker = async (opts) => {
  const root = await navigator.storage.getDirectory();
  return [await root.getFileHandle('picked.txt')];
};
window.showSaveFilePicker = async (opts) => {
  window.__saveAsName = opts.suggestedName;
  const root = await navigator.storage.getDirectory();
  return await root.getFileHandle('saved-as.txt', { create: true });
};
"""
READ_OPFS = """async (name) => {
  const root = await navigator.storage.getDirectory();
  return await (await (await root.getFileHandle(name)).getFile()).text();
}"""


@pytest.fixture
def fsa_page(browser, dist_server):
    if browser.browser_type.name != "chromium":
        pytest.skip("File System Access API only in Chromium")
    context = browser.new_context()
    context.add_init_script(STUB_PICKERS)
    page = context.new_page()
    page.goto(f"{dist_server}/shared.html")
    page.wait_for_selector("body[data-ready]")
    page.evaluate("""async () => {
      const root = await navigator.storage.getDirectory();
      const w = await (await root.getFileHandle('picked.txt', { create: true })).createWritable();
      await w.write('original'); await w.close();
    }""")
    yield page
    context.close()


def test_write_back_with_file_system_access(fsa_page):
    page = fsa_page
    assert page.evaluate("Suite.files.canWriteBack")
    result = page.evaluate("""async () => {
      const [picked] = await Suite.files.open({ types: [{ description: 'Text', accept: { 'text/plain': ['.txt'] } }] });
      const text = await picked.file.text();
      Suite.i18n.setLanguage('en');
      const saved = await Suite.files.save({ name: picked.file.name, handle: picked.handle }, 'changed ä');
      return [text, saved.mode, saved.message];
    }""")
    assert result == ["original", "written", "Saved to “picked.txt”."]
    assert page.evaluate(READ_OPFS, "picked.txt") == "changed ä"


def test_save_as_and_recent_files(fsa_page):
    page = fsa_page
    result = page.evaluate("""async () => {
      const r = await Suite.files.saveAs('copy', { suggestedName: 'copy.txt' });
      await Suite.files.remember('testapp', r.handle);
      const [picked] = await Suite.files.open();
      await Suite.files.remember('testapp', picked.handle);
      await Suite.files.remember('testapp', r.handle);   // again: moves to the top, no duplicate
      const recent = await Suite.files.recent('testapp');
      const reopened = await Suite.files.reopen(recent[1].handle);
      return [r.mode, window.__saveAsName, recent.map((x) => x.name), await reopened.file.text()];
    }""")
    assert result == ["written", "copy.txt", ["saved-as.txt", "picked.txt"], "original"]
    assert page.evaluate(READ_OPFS, "saved-as.txt") == "copy"


@pytest.fixture
def fallback_page(browser):
    """A page without File System Access API (as in Firefox or on Android), also in Chromium."""
    context = browser.new_context(accept_downloads=True)
    context.add_init_script("delete window.showOpenFilePicker; delete window.showSaveFilePicker;"
                            "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;")
    page = context.new_page()
    page.goto(dist_url("shared"))
    page.wait_for_selector("body[data-ready]")
    yield page
    context.close()


def test_fallback_input(fallback_page, tmp_path):
    page = fallback_page
    assert page.evaluate("Suite.files.canWriteBack") is False
    src = tmp_path / "notes.txt"
    src.write_text("hallo", encoding="utf-8")
    with page.expect_file_chooser() as chooser:
        page.evaluate("void (window.__opened = Suite.files.open({ types: [{ description: 'Text', accept: { 'text/plain': ['.txt'] } }] }))")
    assert chooser.value.element.get_attribute("accept") == "text/plain,.txt"
    chooser.value.set_files(str(src))
    assert page.evaluate("window.__opened.then(async (p) => [p[0].file.name, await p[0].file.text(), p[0].handle])") == ["notes.txt", "hallo", None]


def test_fallback_save_as_downloads(fallback_page, tmp_path):
    page = fallback_page
    with page.expect_download() as download:
        result = page.evaluate("Suite.files.saveAs('neu', { suggestedName: 'neu.txt' })")
    assert result["mode"] == "downloaded" and result["handle"] is None
    assert download.value.suggested_filename == "neu.txt"


def test_download_when_no_handle(page, tmp_path):
    page.goto(dist_url("shared"))
    page.wait_for_selector("body[data-ready]")
    page.evaluate("Suite.i18n.setLanguage('de')")
    with page.expect_download() as download:
        result = page.evaluate("Suite.files.save({ name: 'daten.txt', handle: null }, 'Inhalt ü')")
    assert result["mode"] == "downloaded" and "Ersetzen Sie die ursprüngliche Datei" in result["message"]
    path = tmp_path / "d.txt"
    download.value.save_as(path)
    assert download.value.suggested_filename == "daten.txt" and path.read_text(encoding="utf-8") == "Inhalt ü"
    page.evaluate("Suite.i18n.setLanguage('en')")


def test_drop_zone(page):
    page.goto(dist_url("shared"))
    page.wait_for_selector("body[data-ready]")
    result = page.evaluate("""() => new Promise((resolve) => {
      const zone = document.createElement('div'); document.body.append(zone);
      Suite.files.dropZone(zone, async (picked) => resolve([picked.length, picked[0].file.name, await picked[0].file.text()]));
      const dt = new DataTransfer(); dt.items.add(new File(['dropped'], 'drop.txt', { type: 'text/plain' }));
      zone.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
      const active = zone.classList.contains('suite-drop-active');
      zone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      if (!active) resolve(['not highlighted']);
    })""")
    assert result == [1, "drop.txt", "dropped"]
