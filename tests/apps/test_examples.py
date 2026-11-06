"""Example files (tools/make_examples.py, examples/): every app opens each of its built-in examples from Help (F1, "Examples")
without errors, in English and German; the offline notebooks run without errors; the manifest and the files agree."""
import json

import pytest
from playwright.sync_api import expect

from helpers.paths import DIST, ROOT

MANIFEST = json.loads((ROOT / "examples" / "examples.json").read_text(encoding="utf-8"))
NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined; window.print = () => {};"
EMBEDDED = sorted(app for app, entries in MANIFEST["apps"].items() if any(e["embed"] for e in entries))
SETTLE = {"document": 2500, "spreadsheet": 2500, "presentation": 2000, "pdfviewer": 1500, "notebook": 1500, "videoeditor": 2500}


def test_manifest_and_files():
    for app, entries in MANIFEST["apps"].items():
        assert {e["lang"] for e in entries} == {"en", "de"}, app
        assert sum(e["lang"] == "en" for e in entries) == sum(e["lang"] == "de" for e in entries), app
        for e in entries:
            path = ROOT / "examples" / e["file"]
            assert path.is_file() and path.stat().st_size == e["size"], e["file"]
            assert e["title"], e["file"]
    for lang in ("en", "de"):
        assert (ROOT / "examples" / lang / "README.md").is_file()


def answer(page):
    """Questions that opening an example can bring up: the KeePass password, the CSV import."""
    password = page.locator("[data-testid=password]")
    if password.count() and password.first.is_visible():
        password.first.fill("example")
        page.keyboard.press("Enter")
        page.wait_for_timeout(800)
    csv = page.locator("[data-testid=csv-import]")
    if csv.count() and csv.is_visible():
        csv.click()
        page.wait_for_timeout(800)


@pytest.mark.parametrize("app", EMBEDDED)
@pytest.mark.parametrize("lang", ["en", "de"])
def test_built_in_examples_open(app, lang, app_page):
    if not (DIST / f"{app}.html").exists():
        pytest.skip(f"{app} not built")
    page = app_page(app, init_script=NO_PICKERS + f"localStorage.setItem('suite.lang', '{lang}');")
    if app == "notebook":
        page.wait_for_selector("body[data-kernel=ready]", timeout=120000)
    names = [e["file"].rsplit("/", 1)[-1] for e in MANIFEST["apps"][app] if e["lang"] == lang and e["embed"]]
    for name in names:
        page.keyboard.press("F1")
        examples = page.locator("[data-testid=examples]")
        examples.locator("summary").click()
        expect(examples.locator("[data-testid=example]")).to_have_count(len(names))
        examples.locator(f"[data-testid=example][data-name='{name}']").click()
        expect(page.locator("[data-testid=about-dialog]")).to_have_count(0)
        page.wait_for_timeout(SETTLE.get(app, 700))
        answer(page)
        confirm = page.locator("[data-testid=confirm]")
        if confirm.count() and confirm.is_visible():  # (discard the previous example)
            page.click("[data-testid=confirm-ok]")
            page.wait_for_timeout(SETTLE.get(app, 700))
            answer(page)
        expect(page.locator(".suite-toast.error")).to_have_count(0)
    assert page.errors == [], page.errors


@pytest.mark.parametrize("lang", ["en", "de"])
def test_offline_notebooks_run(lang, app_page):
    if not (DIST / "notebook.html").exists():
        pytest.skip("notebook not built")
    page = app_page("notebook", init_script=NO_PICKERS + f"localStorage.setItem('suite.lang', '{lang}');")
    page.wait_for_selector("body[data-kernel=ready]", timeout=120000)
    for prefix in ("01-", "02-", "08-"):
        name = next(e["file"].rsplit("/", 1)[-1] for e in MANIFEST["apps"]["notebook"] if e["lang"] == lang and e["file"].rsplit("/", 1)[-1].startswith(prefix))
        page.keyboard.press("F1")
        page.locator("[data-testid=examples] summary").click()
        page.locator(f"[data-testid=example][data-name='{name}']").click()
        expect(page.locator("[data-testid=tab-notebook]")).to_contain_text(name)
        page.click("[data-testid=run-all]")
        cells = page.locator("[data-testid=cell][data-type=code]")
        page.wait_for_function("() => NB.state.cells.filter((c) => c.type === 'code').every((c) => c.count !== null && !c.running && !c.queued)", timeout=240000)
        errors = page.evaluate("NB.state.cells.flatMap((c) => c.outputs.filter((o) => o.output_type === 'error').map((o) => o.ename + ': ' + o.evalue))")
        assert errors == [], (name, errors)
        if prefix != "08-":
            assert page.locator("img[data-testid=output], [data-testid=output].nb-widget").count() > 0  # plots / widgets
    assert page.errors == [], page.errors
