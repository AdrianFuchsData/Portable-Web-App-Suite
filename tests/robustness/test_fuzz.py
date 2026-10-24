"""Fuzzing the file readers: every app opens mutated copies of seed files (tests/helpers/corpus.py, made with other
software) one after another, like a user dropping broken files on it. Expected: no uncaught exception or unhandled promise
rejection (a broken file is reported to the user, not thrown), the page stays responsive, and afterwards the app still
opens the intact file.

FUZZ_COUNT (default 12) sets the number of mutants per seed, FUZZ_SEED another set of mutants. A failing mutant is
written to the test's tmp_path, so that it can be opened by hand."""
import os

import pytest
from playwright.sync_api import expect

from helpers.corpus import seeds
from helpers.fuzz import mutants
from helpers.hostile import drop_file

COUNT = int(os.environ.get("FUZZ_COUNT", "12"))
SEED = os.environ.get("FUZZ_SEED", "0")
NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined; window.print = () => {};"

# how files reach the app (drop on the page or the Open button) and how long a file may take to open
OPEN = {"document": "dialog", "spreadsheet": "dialog", "http": "dialog"}
SETTLE = {"document": 1500, "spreadsheet": 1500, "presentation": 1200, "keepass": 400, "pdfviewer": 800, "notebook": 800}
# what shows that the intact file was opened at the end: ("text", …) visible, ("js", …) true, ("title",) / ("file-name",) the file name
CHECKS = {
    ("texteditor", "seed.js"): ("js", "TE.app.view.state.doc.toString().startsWith('// seed')"),
    ("texteditor", "seed.md"): ("js", "TE.app.view.state.doc.toString().startsWith('# Title')"),
    ("hexeditor", "seed.bin"): ("js", "HE.app.state.buffer.bytes().length === 2048"),
    ("archive", "seed.txt.gz"): ("text", "seed.txt"),
    "archive": ("text", "readme.txt"),
    "diagram": ("title",), "imageeditor": ("title",), "reveal": ("title",),
    "document": ("file-name",), "spreadsheet": ("file-name",),
    "presentation": ("js", "PR.state.name === {name!r}"),
    "notebook": ("text", "Some"),
    "pdfviewer": ("js", "!!document.querySelector(\".page[data-page-number='1'] .textLayer span\")"),
    "calendar": ("text", "Seed calendar"),
    ("mail", "seed.eml"): ("text", "Seed message"),
    "keepass": ("text", "Web"),
    "dbtool": ("text", "people"),
    ("mediaplayer", "seed.m3u8"): ("text", "Seed track"),
    "audioeditor": ("js", "document.querySelectorAll('[data-testid=track]').length > 0"),
    ("webinspector", "seed.har"): ("text", "example.org"),
    ("http", "seed.postman_collection.json"): ("text", "Get thing"),
    ("http", "seed.yaml"): ("text", "Get item"),
}
_CORPUS = {}


def corpus(tmp_path_factory):
    if not _CORPUS:
        _CORPUS.update(seeds(tmp_path_factory.mktemp("corpus")))
    return _CORPUS


def open_file(page, app, name, data, tmp_path):
    if app == "archive":  # (dropped on an open archive, a file is added to it)
        page.evaluate("AR.app.state.entries = null")
    if OPEN.get(app) == "dialog":
        path = tmp_path / "in" / name
        path.parent.mkdir(exist_ok=True)
        path.write_bytes(data)
        with page.expect_file_chooser() as chooser:
            page.click("[data-testid=open]")
        chooser.value.set_files(str(path))
    else:
        drop_file(page, name, data)


def answer_dialogs(page, app):
    """Questions that opening a file can bring up: the password of a database, discarding changes, allowing scripts."""
    if app == "keepass":
        password = page.locator("[data-testid=password]")
        try:
            password.wait_for(state="visible", timeout=1500)
        except Exception:
            password = None
        if password:
            password.fill("pw")
            page.keyboard.press("Enter")
            page.wait_for_timeout(600)
    csv = page.locator("[data-testid=csv-import]")
    if csv.count() and csv.is_visible():
        csv.click()
        page.wait_for_timeout(800)
    confirm = page.locator("[data-testid=confirm]")
    if confirm.count() and confirm.is_visible():
        discard = any(w in confirm.inner_text().lower() for w in ("discard", "unsaved", "replace"))
        page.click("[data-testid=confirm-ok]" if discard else "[data-testid=confirm-cancel]")


def responsive(page):
    """The page still runs scripts (a hanging reader blocks the main thread)."""
    page.wait_for_function("() => true", timeout=15000)


def poll(page, expression, timeout=20000):
    """Wait until the expression is true (page.wait_for_function evaluates strings, which the apps' policy forbids)."""
    for _ in range(timeout // 250):
        if page.evaluate(expression):
            return
        page.wait_for_timeout(250)
    raise AssertionError(f"not true after {timeout} ms: {expression}")


def opened(page, app, name):
    check = CHECKS.get((app, name)) or CHECKS.get(app)
    if not check:
        return
    if check[0] == "text":
        expect(page.get_by_text(check[1]).first).to_be_visible(timeout=20000)
    elif check[0] == "js":
        poll(page, check[1].format(name=name))
    elif check[0] == "title":  # (converted files keep the name without the extension)
        poll(page, f"document.title.startsWith({name.split('.')[0]!r})")
    else:
        expect(page.locator("[data-testid=file-name]")).to_contain_text(name, timeout=20000)


APPS = ["texteditor", "hexeditor", "archive", "diagram", "document", "spreadsheet", "presentation", "reveal", "notebook", "pdfviewer",
        "calendar", "mail", "keepass", "dbtool", "imageeditor", "mediaplayer", "audioeditor", "webinspector", "http"]


@pytest.mark.parametrize("app", APPS)
def test_mutated_files(app, app_page, tmp_path, tmp_path_factory, request):
    if request.config.getoption("--mobile"):
        pytest.skip("the file readers do not depend on the display")
    files = corpus(tmp_path_factory).get(app, [])
    if not files:
        pytest.skip("no seed files (a program to make them is missing)")
    page = app_page(app, init_script=NO_PICKERS)
    uncaught = []
    page.on("pageerror", lambda e: uncaught.append(str(e)))
    problems = []
    for name, data in files:
        for i, (desc, mutant) in enumerate(mutants(data, name, COUNT, SEED)):
            before = len(uncaught)
            open_file(page, app, name, mutant, tmp_path)
            page.wait_for_timeout(SETTLE.get(app, 350))
            answer_dialogs(page, app)
            try:
                responsive(page)
            except Exception:
                problems.append((name, i, desc, "page does not respond"))
                (tmp_path / f"{i}-{name}").write_bytes(mutant)
                break
            page.keyboard.press("Escape")
            if len(uncaught) > before:
                problems.append((name, i, desc, uncaught[before:]))
                (tmp_path / f"{i}-{name}").write_bytes(mutant)
        # still usable: the intact file opens
        open_file(page, app, name, data, tmp_path)
        page.wait_for_timeout(SETTLE.get(app, 350))
        answer_dialogs(page, app)
        try:
            opened(page, app, name)
        except Exception as e:
            problems.append((name, "intact", "", f"the intact file was not opened afterwards: {str(e).splitlines()[0]}"))
    assert not problems, f"mutants in {tmp_path}:\n" + "\n".join(map(str, problems))
