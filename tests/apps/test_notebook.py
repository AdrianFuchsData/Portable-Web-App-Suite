"""Python notebook (apps/notebook). The kernel itself is tested in tests/prototypes/test_s9_notebook.py; these tests cover
the app: cells, keyboard, console, files, wheels, .ipynb and .py files, restart. One page per browser (Python starts slowly)."""
import json
import re

import nbformat
import pytest
from playwright.sync_api import expect

from helpers import office_samples
from helpers.paths import DIST, dist_url

pytestmark = pytest.mark.skipif(not (DIST / "notebook.html").exists(), reason="build with vendored Pyodide missing")
NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"


@pytest.fixture(scope="module")
def nb(browser):
    context = browser.new_context(accept_downloads=True)
    # (no print dialog: Firefox's print preview of the PDF export would block the page for the following tests)
    context.add_init_script("localStorage.setItem('suite.lang', 'en'); window.print = () => {};" + NO_PICKERS)
    page = context.new_page()
    page.errors, page.requests = [], []
    page.on("pageerror", lambda e: page.errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and page.errors.append(m.text))
    page.on("request", lambda r: not r.url.startswith(("file:", "data:", "blob:")) and page.requests.append(r.url))
    page.goto(dist_url("notebook"))
    page.wait_for_selector("body[data-kernel=ready]", timeout=90000)
    yield page
    context.close()


def load(page, cells):
    page.evaluate("cells => NB.setCells(NB.fromNotebook({ cells }), 'test.ipynb', null)", cells)


def cell(page, i):
    return page.locator("[data-testid=cell]").nth(i)


def test_start(nb):
    assert nb.title() == "Python notebook"
    expect(nb.locator("[data-testid=status]")).to_contain_text("ready", timeout=90000)
    assert nb.errors == [] and nb.requests == []


def test_run_cells_with_keyboard(nb):
    load(nb, [{"cell_type": "code", "source": "", "metadata": {}, "outputs": []}])
    cell(nb, 0).locator(".cm-content").click()
    nb.keyboard.type("y = 6 * 7\nprint('y =', y)")
    nb.keyboard.press("Shift+Enter")
    expect(cell(nb, 0).locator("[data-testid=output]")).to_have_text("y = 42\n", timeout=30000)
    expect(nb.locator("[data-testid=cell]")).to_have_count(2)  # Shift+Enter added a new cell and moved there
    expect(cell(nb, 0).locator("[data-testid=prompt]")).to_have_text(re.compile(r"\[\d+\]"))
    nb.keyboard.type("y + 1")
    nb.keyboard.press("Control+Enter")  # runs, stays
    expect(cell(nb, 1).locator("[data-testid=output]")).to_have_text("43", timeout=30000)
    expect(nb.locator("[data-testid=cell]")).to_have_count(2)
    nb.keyboard.press("Alt+Enter")  # runs and inserts below
    expect(nb.locator("[data-testid=cell]")).to_have_count(3)

    # command mode
    nb.keyboard.press("Escape")
    nb.keyboard.press("m")
    expect(cell(nb, 2)).to_have_attribute("data-type", "markdown")
    nb.keyboard.press("a")  # a new cell above, in edit mode
    expect(nb.locator("[data-testid=cell]")).to_have_count(4)
    nb.keyboard.press("Escape")
    nb.keyboard.press("Delete")
    expect(nb.locator("[data-testid=cell]")).to_have_count(3)


def test_undo_cell_operations(nb):
    load(nb, [
        {"cell_type": "code", "source": "first", "metadata": {}, "outputs": [{"output_type": "stream", "name": "stdout", "text": "out\n"}], "execution_count": 1},
        {"cell_type": "code", "source": "second", "metadata": {}, "outputs": []},
    ])
    expect(nb.locator("[data-testid=undo]")).to_be_disabled()
    cell(nb, 1).click(position={"x": 2, "y": 2})
    nb.keyboard.press("Delete")
    expect(nb.locator("[data-testid=cell]")).to_have_count(1)
    nb.click("[data-testid=clear-outputs]")
    expect(cell(nb, 0).locator("[data-testid=output]")).to_have_count(0)
    cell(nb, 0).click(position={"x": 2, "y": 2})
    nb.keyboard.press("m")
    expect(cell(nb, 0)).to_have_attribute("data-type", "markdown")

    nb.keyboard.press("z")  # type change undone
    expect(cell(nb, 0)).to_have_attribute("data-type", "code")
    nb.keyboard.press("Control+z")  # outputs back
    expect(cell(nb, 0).locator("[data-testid=output]")).to_have_text("out\n")
    nb.click("[data-testid=undo]")  # deleted cell back, with its text
    expect(nb.locator("[data-testid=cell]")).to_have_count(2)
    expect(cell(nb, 1).locator(".cm-content")).to_have_text("second")
    expect(nb.locator("[data-testid=undo]")).to_be_disabled()
    nb.keyboard.press("Shift+Z")
    expect(nb.locator("[data-testid=cell]")).to_have_count(1)
    nb.click("[data-testid=redo]")
    expect(cell(nb, 0).locator("[data-testid=output]")).to_have_count(0)
    # typing inside a cell keeps the editor's own undo
    cell(nb, 0).locator(".cm-content").click()
    nb.keyboard.press("End")
    nb.keyboard.type("XYZ")
    nb.keyboard.press("Control+z")
    expect(cell(nb, 0).locator(".cm-content")).to_have_text("first")
    expect(nb.locator("[data-testid=cell]")).to_have_count(1)


def test_markdown_and_sanitizing(nb):
    load(nb, [
        {"cell_type": "markdown", "source": "# Title\n\nsafe <img src=x onerror=\"window.pwned=1\"><script>window.pwned=2</script>", "metadata": {}},
        {"cell_type": "code", "source": "", "metadata": {}, "outputs": [{"output_type": "display_data", "metadata": {},
                                                                         "data": {"text/html": "<i onmouseover=\"window.pwned=3\">x</i><script>window.pwned=4</script>"}}]},
    ])
    expect(nb.locator("[data-testid=markdown] h1")).to_have_text("Title")
    content = nb.evaluate("[...document.querySelectorAll('[data-testid=markdown], [data-testid=outputs]')].map((e) => e.innerHTML).join('')")
    assert "onerror" not in content and "onmouseover" not in content and "<script" not in content
    assert nb.evaluate("window.pwned") is None
    nb.locator("[data-testid=markdown]").dblclick()  # edit, then render again with Shift+Enter
    nb.keyboard.press("Control+End")
    nb.keyboard.type("\n\n**bold**")
    nb.keyboard.press("Control+Enter")
    expect(nb.locator("[data-testid=markdown] strong")).to_have_text("bold")


def test_console(nb):
    nb.click("[data-testid=tab-console]")
    nb.locator("[data-testid=console-input] .cm-content").click()
    nb.keyboard.type("z = 5")
    nb.keyboard.press("Enter")
    nb.keyboard.type("z * 2")
    nb.keyboard.press("Enter")
    expect(nb.locator("[data-testid=console-entry]").last.locator("[data-testid=output]")).to_have_text("10", timeout=30000)
    nb.keyboard.press("ArrowUp")  # history
    expect(nb.locator("[data-testid=console-input] .cm-content")).to_have_text("z * 2")
    nb.click("[data-testid=clear-console]")
    expect(nb.locator("[data-testid=console-entry]")).to_have_count(0)
    nb.click("[data-testid=tab-notebook]")


def test_files_panel(nb, tmp_path):
    data = tmp_path / "in.csv"
    data.write_text("x,y\n1,2\n3,4\n")
    with nb.expect_file_chooser() as chooser:
        nb.click("[data-testid=upload]")
    chooser.value.set_files(str(data))
    expect(nb.locator("[data-testid=file-name]", has_text="in.csv")).to_be_visible()
    load(nb, [{"cell_type": "code", "source": "import pandas as pd\nd = pd.read_csv('in.csv')\nd.assign(z=d.x + d.y).to_csv('out.csv', index=False)\nint(d.y.sum())", "metadata": {}, "outputs": []}])
    cell(nb, 0).locator("[data-testid=run-cell]").click()
    expect(cell(nb, 0).locator("[data-testid=output]")).to_have_text("6", timeout=60000)
    out = nb.locator("[data-testid=file]", has_text="out.csv")
    expect(out).to_be_visible()  # the list is refreshed after running
    with nb.expect_download() as d:
        out.locator("[data-testid=file-name]").click()
    assert open(d.value.path()).read().splitlines() == ["x,y,z", "1,2,3", "3,4,7"]
    # open in the text editor and save back into the Python file system
    from helpers.bridge import open_with, edit_and_save_text
    editor = open_with(nb, "texteditor", lambda: out.locator("[data-testid=file-open-with]").click())
    expect(editor.locator(".cm-content")).to_contain_text("x,y,z")
    edit_and_save_text(editor, "5,6,11")
    expect(editor.locator("[data-testid=toast]").last).to_contain_text("Saved to “out.csv”")
    editor.close()
    load(nb, [{"cell_type": "code", "source": "open('out.csv').read().splitlines()[-1]", "metadata": {}, "outputs": []}])
    cell(nb, 0).locator("[data-testid=run-cell]").click()
    expect(cell(nb, 0).locator("[data-testid=output]")).to_have_text("'5,6,11'", timeout=60000)
    out.locator("[data-testid=file-delete]").click()
    nb.click("[data-testid=confirm-ok]")
    expect(nb.locator("[data-testid=file]", has_text="out.csv")).to_have_count(0)


def test_install_wheel(nb, tmp_path):
    wheel = office_samples.make_wheel(tmp_path)
    with nb.expect_file_chooser() as chooser:
        nb.click("[data-testid=install-wheel]")
    chooser.value.set_files(str(wheel))
    expect(nb.locator("[data-testid=toast]").last).to_contain_text("installed", timeout=30000)
    load(nb, [{"cell_type": "code", "source": "import suite_hello\nsuite_hello.greet('Welt')", "metadata": {}, "outputs": []}])
    cell(nb, 0).locator("[data-testid=run-cell]").click()
    expect(cell(nb, 0).locator("[data-testid=output]")).to_have_text("'Hallo Welt aus dem Wheel'", timeout=30000)


def test_open_and_save_ipynb(nb, tmp_path):
    notebook = nbformat.v4.new_notebook(cells=[
        nbformat.v4.new_markdown_cell("# Titel"),
        nbformat.v4.new_code_cell("x = 21\nx * 2", execution_count=3, outputs=[nbformat.v4.new_output("execute_result", data={"text/plain": "42"}, execution_count=3)]),
    ])
    path = tmp_path / "analysis.ipynb"
    path.write_text(nbformat.writes(notebook))
    nb.evaluate("NB.state.dirty = false")
    with nb.expect_file_chooser() as chooser:
        nb.click("[data-testid=open]")
    chooser.value.set_files(str(path))
    expect(nb.locator("[data-testid=tab-notebook]")).to_contain_text("analysis.ipynb")
    expect(cell(nb, 1).locator("[data-testid=output]")).to_have_text("42")
    cell(nb, 1).locator(".cm-content").click()
    nb.keyboard.press("Control+End")
    nb.keyboard.type(" + 1")
    expect(nb.locator("[data-testid=tab-notebook]")).to_contain_text("•")
    with nb.expect_download() as d:
        nb.click("[data-testid=save]")
    assert d.value.suggested_filename == "analysis.ipynb"
    saved = json.load(open(d.value.path()))
    nbformat.validate(nbformat.reads(json.dumps(saved), as_version=4))  # with cell ids (nbformat 4.5)
    assert saved["cells"][0]["id"] == notebook.cells[0]["id"]
    assert "".join(saved["cells"][1]["source"]) == "x = 21\nx * 2 + 1"
    expect(nb.locator("[data-testid=banner]")).to_contain_text("analysis.ipynb")


def test_python_script_cells(nb, tmp_path):
    script = tmp_path / "script.py"
    script.write_text("import math\n\n# %% [markdown]\n# # Heading\n# text\n\n# %%\nmath.sqrt(16)\n")
    with nb.expect_file_chooser() as chooser:
        nb.click("[data-testid=open]")
    chooser.value.set_files(str(script))
    nb.click("[data-testid=confirm-ok]") if nb.locator("[data-testid=confirm-ok]").count() else None
    expect(nb.locator("[data-testid=cell]")).to_have_count(3)
    expect(cell(nb, 1)).to_have_attribute("data-type", "markdown")
    expect(nb.locator("[data-testid=markdown] h1")).to_have_text("Heading")
    with nb.expect_download() as d:
        nb.select_option("[data-testid=export]", "py")
    assert d.value.suggested_filename == "script.py"
    assert open(d.value.path()).read() == "# %%\nimport math\n\n# %% [markdown]\n# # Heading\n# text\n\n# %%\nmath.sqrt(16)\n"


def test_scientific_packages(nb):
    """scipy and scikit-learn are bundled (loaded on import, without network)."""
    load(nb, [{"cell_type": "code", "metadata": {}, "outputs": [], "source":
               "from scipy import optimize, stats\nfrom sklearn.datasets import load_iris\nfrom sklearn.linear_model import LogisticRegression\n"
               "root = optimize.brentq(lambda x: x * x - 2, 0, 2)\nX, y = load_iris(return_X_y=True)\n"
               "score = LogisticRegression(max_iter=500).fit(X, y).score(X, y)\n"
               "print(f'{root:.4f}', stats.norm.cdf(0), score > 0.9)"}])
    run(nb, 0)
    expect(cell(nb, 0).locator("[data-testid=output]")).to_contain_text("1.4142 0.5 True", timeout=60000)
    assert nb.errors == [] and nb.requests == []


def test_office_and_utility_packages(nb):
    """python-docx, python-pptx, XlsxWriter (also through pandas), pypdf, icalendar, Jinja2, Markdown, tabulate, tqdm and the
    database drivers pg8000 and PyMySQL are bundled."""
    load(nb, [{"cell_type": "code", "metadata": {}, "outputs": [], "source":
               "import io, docx, pptx, pypdf, icalendar, jinja2, markdown, tabulate, tqdm, pg8000, pymysql\n"
               "import pandas as pd\n"
               "d = docx.Document(); d.add_heading('Report', 0); d.save('r.docx'); print(docx.Document('r.docx').paragraphs[0].text)\n"
               "p = pptx.Presentation(); p.slides.add_slide(p.slide_layouts[0]).shapes.title.text = 'Deck'; p.save('d.pptx'); print(len(pptx.Presentation('d.pptx').slides))\n"
               "pd.DataFrame({'a': [1, 2]}).to_excel('t.xlsx', engine='xlsxwriter'); print(pd.read_excel('t.xlsx').a.sum())\n"
               "w = pypdf.PdfWriter(); w.add_blank_page(100, 100); w.add_blank_page(100, 100); b = io.BytesIO(); w.write(b); print(len(pypdf.PdfReader(b).pages))\n"
               "cal = icalendar.Calendar(); e = icalendar.Event(); e.add('summary', 'Meeting'); cal.add_component(e); print(icalendar.Calendar.from_ical(cal.to_ical()).walk('VEVENT')[0]['summary'])\n"
               "print(jinja2.Template('Hello {{ name }}').render(name='Anna'), markdown.markdown('*x*'))\n"
               "print(tabulate.tabulate([[1, 2]], headers=['a', 'b'], tablefmt='github').splitlines()[0])\n"
               "print(sum(tqdm.tqdm(range(3), disable=True)), pg8000.__name__, pymysql.__name__)"}])
    run(nb, 0)
    out = cell(nb, 0).locator("[data-testid=outputs]")
    expect(out).to_contain_text("Report", timeout=90000)
    for text in ("1\n", "3\n", "2\n", "Meeting", "Hello Anna <p><em>x</em></p>", "| a | b |", "3 pg8000 pymysql"):
        expect(out).to_contain_text(text)
    expect(out.locator(".nb-error")).to_have_count(0)
    assert nb.errors == [] and nb.requests == []


def test_restart(nb):
    load(nb, [{"cell_type": "code", "source": "kept = 1", "metadata": {}, "outputs": []}, {"cell_type": "code", "source": "kept", "metadata": {}, "outputs": []}])
    cell(nb, 0).locator("[data-testid=run-cell]").click()
    expect(cell(nb, 0).locator("[data-testid=prompt]")).to_have_text(re.compile(r"\[\d+\]"), timeout=30000)
    nb.click("[data-testid=restart]")
    nb.click("[data-testid=confirm-ok]")
    expect(nb.locator("[data-testid=status]")).to_contain_text("ready", timeout=90000)
    cell(nb, 1).click()  # the cell tools are shown on the selected cell
    cell(nb, 1).locator("[data-testid=run-cell]").click()
    expect(cell(nb, 1).locator("[data-testid=output]")).to_contain_text("NameError", timeout=30000)
    assert nb.errors == []


def test_german_interface(app_page):
    page = app_page("notebook", init_script="localStorage.setItem('suite.lang', 'de');")
    expect(page.locator("[data-testid=tab-console]")).to_have_text("Konsole")


def test_mobile_layout(app_page):
    page = app_page("notebook", mobile=True)
    expect(page.locator("[data-testid=files]")).to_be_hidden()
    page.click("[data-testid=toggle-panels]")
    expect(page.locator("[data-testid=files]")).to_be_visible()
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")


def test_variable_inspector(nb):
    load(nb, [{"cell_type": "code", "metadata": {}, "outputs": [], "source":
               "import numpy as np\nimport pandas as pd\ncount = 42\nnames = ['a', 'b']\narr = np.zeros((3, 4))\n"
               "df = pd.DataFrame({'city': ['Wien', 'Graz', 'Linz'], 'pop': [2.0, 0.3, 0.2]})\ndef helper(): pass\n_hidden = 1"}])
    cell(nb, 0).locator("[data-testid=run-cell]").click()
    expect(cell(nb, 0).locator("[data-testid=prompt]")).to_have_text(re.compile(r"\[\d+\]"), timeout=60000)
    nb.click("[data-testid=side-variables]")
    rows = nb.locator("[data-testid=variable]")
    expect(rows.locator("td:first-child")).to_have_text(["arr", "count", "df", "names"], timeout=30000)  # no modules, functions, _names
    expect(rows.nth(0)).to_contain_text("numpy.ndarray")
    expect(rows.nth(0)).to_contain_text("3 × 4")
    expect(rows.nth(0)).to_contain_text("float64")
    expect(rows.nth(1)).to_contain_text("int")
    expect(rows.nth(1)).to_contain_text("42")
    expect(rows.nth(2)).to_contain_text("pandas.DataFrame")
    expect(rows.nth(2)).to_contain_text("city, pop")
    expect(rows.nth(3)).to_contain_text("['a', 'b']")
    # the table viewer
    rows.nth(2).click()
    dialog = nb.locator("[data-testid=table-dialog]")
    expect(dialog.locator("table td")).to_contain_text(["Wien", "2.0", "Graz", "0.3", "Linz", "0.2"])
    nb.click("[data-testid=table-close]")
    expect(dialog).to_have_count(0)
    # the list follows the code
    load(nb, [{"cell_type": "code", "metadata": {}, "outputs": [], "source": "del names\ncount += 1"}])
    cell(nb, 0).locator("[data-testid=run-cell]").click()
    expect(rows.locator("td:first-child")).to_have_text(["arr", "count", "df"], timeout=30000)
    expect(rows.nth(1)).to_contain_text("43")
    nb.click("[data-testid=side-files]")
    assert nb.errors == []


def run(page, i):
    cell(page, i).click(position={"x": 2, "y": 2})  # select (the run button shows on the selected cell)
    cell(page, i).locator("[data-testid=run-cell]").click()
    expect(cell(page, i).locator("[data-testid=prompt]")).to_have_text(re.compile(r"\[\d+\]"), timeout=60000)


def test_widgets(nb):
    code = lambda s: {"cell_type": "code", "metadata": {}, "outputs": [], "source": s}
    load(nb, [
        code("import ipywidgets as widgets\nfrom IPython.display import display\n"
             "s = widgets.IntSlider(value=3, min=0, max=10, description='n')\nout = widgets.Output()\n"
             "def changed(c):\n    with out:\n        print('n is', c['new'])\ns.observe(changed, 'value')\ndisplay(s, out)"),
        code("@widgets.interact(x=(0, 10), word=['a', 'b'])\ndef f(x=2, word='a'):\n    return f'{word}{x * 2}'"),
        code("b = widgets.Button(description='Go')\nb.on_click(lambda b: print('clicked', s.value))\n"
             "bad = widgets.Button(description='Bad')\nbad.on_click(lambda b: 1 / 0)\n"
             "widgets.VBox([widgets.HBox([b, bad]), widgets.Checkbox(True, description='on'), widgets.Tab(children=[widgets.Label('first'), widgets.Label('second')], titles=['A', 'B'])])"),
        code("s.value, f.widget.result"),
        code("import matplotlib.pyplot as plt\n@widgets.interact(k=(1, 3))\ndef plot(k=1):\n    plt.plot([0, 1], [0, k])\n    plt.show()"),
    ])
    run(nb, 0)
    slider = cell(nb, 0).locator("[data-testid=widget-slider]")
    expect(slider).to_have_value("3")
    expect(cell(nb, 0).locator(".nb-w-desc")).to_have_text("n")
    slider.fill("7")
    expect(cell(nb, 0).locator("[data-testid=widget-output]")).to_contain_text("n is 7", timeout=30000)
    expect(cell(nb, 0).locator(".nb-w-readout")).to_have_text("7")

    # interact: controls from abbreviations, result in an Output widget, updated on change
    run(nb, 1)
    expect(cell(nb, 1).locator("[data-testid=widget-output]")).to_have_text("'a4'", timeout=30000)
    cell(nb, 1).locator("[data-testid=widget-dropdown]").select_option("1")
    expect(cell(nb, 1).locator("[data-testid=widget-output]")).to_have_text("'b4'", timeout=30000)

    # buttons: print outside an Output goes to the cell, errors as well; boxes and tabs
    run(nb, 2)
    cell(nb, 2).locator("[data-testid=widget-button]", has_text="Go").click()
    expect(cell(nb, 2).locator("pre[data-testid=output]")).to_contain_text("clicked 7", timeout=30000)
    cell(nb, 2).locator("[data-testid=widget-button]", has_text="Bad").click()
    expect(cell(nb, 2).locator(".nb-error")).to_contain_text("ZeroDivisionError", timeout=30000)
    expect(cell(nb, 2).locator("[data-testid=widget-checkbox]")).to_be_checked()
    tab = cell(nb, 2).locator("[data-testid=widget-tab]")
    expect(tab.locator("[data-testid=widget-label]")).to_have_text("first")
    tab.locator("[role=tab]", has_text="B").click()
    expect(tab.locator("[data-testid=widget-label]")).to_have_text("second")
    run(nb, 3)
    expect(cell(nb, 3).locator("[data-testid=output]")).to_have_text("(7, 'b4')")
    run(nb, 4)  # figures inside interact go into its Output
    expect(cell(nb, 4).locator("[data-testid=widget-output] img")).to_have_count(1, timeout=60000)
    cell(nb, 4).locator("[data-testid=widget-slider]").fill("3")
    expect(cell(nb, 4).locator("[data-testid=widget-output] img")).to_have_count(1, timeout=30000)
    expect(cell(nb, 4).locator(".nb-w-readout")).to_have_text("3")

    # saved with the notebook (widget state metadata) and shown inactive after opening
    saved = nb.evaluate("NB.toNotebook()")
    state = saved["metadata"]["widgets"]["application/vnd.jupyter.widget-state+json"]["state"]
    assert any(w["model_name"] == "IntSliderModel" and w["state"]["value"] == 7 for w in state.values())
    view = saved["cells"][0]["outputs"][0]["data"]["application/vnd.jupyter.widget-view+json"]
    assert view["model_id"] in state and saved["cells"][0]["outputs"][0]["data"]["text/plain"].startswith("IntSlider(")
    nb.evaluate("nb => { NB.restartWidgets(); NB.setCells(NB.fromNotebook(nb), 'w.ipynb', null); }", saved)
    expect(cell(nb, 0).locator("[data-testid=widget-slider]")).to_be_disabled()
    expect(cell(nb, 0).locator("[data-testid=widget-slider]")).to_have_value("7")
    assert nb.errors == []


def test_spelling_in_cells(nb):
    load(nb, [{"cell_type": "markdown", "metadata": {}, "source": "A short notee with `cod_x` and https://exampel.org"},
              {"cell_type": "code", "metadata": {}, "outputs": [], "source": "valu = 1  # a coment\nprint('helo')"}])
    cell(nb, 0).locator("[data-testid=markdown]").dblclick()  # edit the Markdown source
    nb.select_option("[data-testid=spell-select]", "en_US")
    expect(cell(nb, 0).locator(".cm-spell-error")).to_have_text(["notee"], timeout=20000)  # not code or links
    expect(cell(nb, 1).locator(".cm-spell-error")).to_have_text(["coment", "helo"])      # not identifiers
    nb.select_option("[data-testid=spell-select]", "off")
    expect(nb.locator(".cm-spell-error")).to_have_count(0)


# last: printing blocks the page in Firefox under Playwright
def test_export_html_and_pdf(nb):
    load(nb, [{"cell_type": "markdown", "source": "# Report\nSome *text* <script>alert(1)</script>", "metadata": {}},
              {"cell_type": "code", "source": "print('a < b')\n6 * 7", "metadata": {}, "outputs": []}])
    cell(nb, 1).click()  # the cell tools are shown on the selected cell
    cell(nb, 1).locator("[data-testid=run-cell]").click()
    expect(cell(nb, 1).locator("[data-testid=output]").last).to_have_text("42", timeout=60000)
    with nb.expect_download() as d:
        nb.select_option("[data-testid=export]", "html")
    html_text = open(d.value.path(), encoding="utf-8").read()
    assert d.value.suggested_filename == "test.html"
    assert "<h1>Report</h1>" in html_text and "<em>text</em>" in html_text and "<script>" not in html_text
    assert "print(&#39;a &lt; b&#39;)" in html_text or "print('a &lt; b')" in html_text
    assert "a &lt; b" in html_text and ">42<" in html_text and "In [" in html_text
    with nb.expect_download() as d:
        nb.select_option("[data-testid=export]", "html-nocode")
    report = open(d.value.path(), encoding="utf-8").read()
    assert "print(" not in report and ">42<" in report
    # PDF: printed from a frame with the same page
    nb.select_option("[data-testid=export]", "pdf")
    frame = nb.locator("iframe.nb-print-frame")
    expect(frame).to_have_count(1)
    assert "<h1>Report</h1>" in frame.get_attribute("srcdoc")
    assert nb.errors == []


def code_cell(source):
    return {"cell_type": "code", "source": source, "metadata": {}, "outputs": []}


def sources(page):
    return page.evaluate("NB.state.cells.map((c) => c.view.state.doc.toString())")


def test_select_copy_paste_merge_delete(nb):
    """Command mode as in JupyterLab: Shift+↓ selects several cells, C/X/V copy, cut and paste, Shift+M merges, D, D deletes."""
    load(nb, [code_cell(s) for s in ("one", "two", "three", "four")])
    cell(nb, 0).click(position={"x": 2, "y": 2})
    nb.keyboard.press("Shift+ArrowDown")
    nb.keyboard.press("Shift+j")
    expect(nb.locator("[data-testid=cell][data-selected=true]")).to_have_count(3)
    nb.keyboard.press("c")
    expect(nb.locator("[data-testid=toast]").last).to_contain_text("3 cell(s) copied")
    cell(nb, 3).click(position={"x": 2, "y": 2})  # a plain click selects one cell again
    expect(nb.locator("[data-testid=cell][data-selected=true]")).to_have_count(1)
    nb.keyboard.press("v")
    assert sources(nb) == ["one", "two", "three", "four", "one", "two", "three"]
    expect(nb.locator("[data-testid=cell][data-selected=true]")).to_have_count(3)  # the pasted cells are selected
    nb.keyboard.press("d")
    nb.keyboard.press("d")
    assert sources(nb) == ["one", "two", "three", "four"]
    # Shift+click extends, Shift+M merges into one cell
    cell(nb, 1).click(position={"x": 2, "y": 2})
    cell(nb, 2).click(position={"x": 2, "y": 2}, modifiers=["Shift"])
    nb.keyboard.press("Shift+M")
    assert sources(nb) == ["one", "two\n\nthree", "four"]
    nb.keyboard.press("z")  # undone in one step
    assert sources(nb) == ["one", "two", "three", "four"]
    # X cuts, Shift+V pastes above; Ctrl+Shift+↑ moves the selected cells
    cell(nb, 3).click(position={"x": 2, "y": 2})
    nb.keyboard.press("x")
    cell(nb, 0).click(position={"x": 2, "y": 2})
    nb.keyboard.press("Shift+V")
    assert sources(nb) == ["four", "one", "two", "three"]
    cell(nb, 3).click(position={"x": 2, "y": 2})
    nb.keyboard.press("Control+Shift+ArrowUp")
    assert sources(nb) == ["four", "one", "three", "two"]
    # several cells change their type at once, and run with Shift+Enter
    nb.keyboard.press("Control+a")
    nb.keyboard.press("y")
    load(nb, [code_cell("a = 2"), code_cell("a * 21"), code_cell("")])
    cell(nb, 0).click(position={"x": 2, "y": 2})
    nb.keyboard.press("Shift+ArrowDown")
    nb.keyboard.press("Shift+Enter")
    expect(cell(nb, 1).locator("[data-testid=output]")).to_have_text("42", timeout=30000)
    expect(cell(nb, 2)).to_have_attribute("data-selected", "true")  # moved on below the selection
    assert nb.errors == []


def test_queued_cells_stop_on_error(nb):
    load(nb, [code_cell("import time; time.sleep(0.5); 1 / 0"), code_cell("after = 'ran'"), code_cell("after")])
    expect(nb.locator("[data-testid=stop-on-error]")).to_be_checked()
    nb.click("[data-testid=run-all]")
    expect(cell(nb, 1).locator("[data-testid=prompt]")).to_have_text("[*]")  # queued
    expect(cell(nb, 0).locator("[data-testid=output]")).to_contain_text("ZeroDivisionError", timeout=30000)
    expect(nb.locator("[data-testid=toast]").last).to_contain_text("2 queued cell(s) were not run")
    expect(cell(nb, 1).locator("[data-testid=prompt]")).to_have_text("[ ]")
    expect(cell(nb, 2).locator("[data-testid=output]")).to_have_count(0)
    # switched off: the cells after the error run
    nb.click("[data-testid=stop-on-error]")
    nb.click("[data-testid=run-all]")
    expect(cell(nb, 2).locator("[data-testid=output]")).to_have_text("'ran'", timeout=30000)
    nb.click("[data-testid=stop-on-error]")
    assert nb.evaluate("localStorage.getItem('suite.notebook.stopOnError')") == "1"


def test_stop_restarts_without_isolation(nb):
    """From file://, Python cannot be interrupted: Stop (and I, I) restarts the kernel, also while code runs."""
    assert nb.evaluate("NB.kernel.canInterrupt") is False
    load(nb, [code_cell("while True:\n    pass"), code_cell("print('next')")])
    nb.click("[data-testid=run-all]")
    expect(nb.locator("[data-testid=stop]")).to_have_text("⏹ Stop")
    cell(nb, 1).click(position={"x": 2, "y": 2})
    nb.keyboard.press("i")
    nb.keyboard.press("i")
    expect(nb.locator("[data-testid=confirm]")).to_contain_text("relay.py --serve")
    nb.click("[data-testid=confirm-ok]")
    expect(cell(nb, 0).locator("[data-testid=output]")).to_contain_text("kernel restarted", timeout=30000)
    expect(nb.locator("[data-testid=status]")).to_contain_text("ready", timeout=90000)
    expect(cell(nb, 1).locator("[data-testid=output]")).to_have_count(0)  # the queued cell was not run
    expect(nb.locator("[data-testid=stop]")).to_have_count(0)


def test_tab_in_cells(nb):
    load(nb, [code_cell("")])
    cell(nb, 0).locator(".cm-content").click()
    nb.keyboard.type("if True:")
    nb.keyboard.press("Enter")  # (indented by the editor)
    nb.keyboard.press("Shift+Tab")
    nb.keyboard.press("Tab")
    nb.keyboard.type("x = 1")
    nb.keyboard.press("Enter")
    nb.keyboard.press("Control+Alt+i")
    nb.keyboard.type("y")
    assert sources(nb) == ["if True:\n    x = 1\n    \ty"]
    assert nb.evaluate("!!document.activeElement.closest('.cm-editor')")  # Tab did not move the focus away


@pytest.fixture()
def isolated_server():
    """dist/ over http with the headers that make a page cross-origin isolated (as relay.py --serve sends them)."""
    import functools
    import http.server
    import threading

    class Handler(http.server.SimpleHTTPRequestHandler):
        def end_headers(self):
            self.send_header("Cross-Origin-Opener-Policy", "same-origin")
            self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
            super().end_headers()

        def log_message(self, *args):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=str(DIST)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


def test_interrupt_when_isolated(browser, isolated_server):
    context = browser.new_context()
    context.add_init_script("localStorage.setItem('suite.lang', 'en');")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{isolated_server}/notebook.html")
    page.wait_for_selector("body[data-kernel=ready]", timeout=90000)
    assert page.evaluate("crossOriginIsolated && NB.kernel.canInterrupt")
    page.evaluate("cells => NB.setCells(NB.fromNotebook({ cells }), 'test.ipynb', null)",
                  [code_cell("kept = 42"), code_cell("import time\nwhile True:\n    time.sleep(0.01)"), code_cell("kept")])
    page.click("[data-testid=run-all]")
    stop = page.locator("[data-testid=stop]")
    expect(stop).to_have_text("⏹ Interrupt")
    expect(cell(page, 0).locator("[data-testid=prompt]")).to_have_text("[1]", timeout=60000)  # (the loop is running now)
    page.wait_for_timeout(500)
    stop.click()
    expect(cell(page, 1).locator("[data-testid=output]")).to_contain_text("KeyboardInterrupt", timeout=30000)
    expect(cell(page, 2).locator("[data-testid=output]")).to_have_count(0)  # the queue was cleared
    run(page, 2)  # the variables are kept
    expect(cell(page, 2).locator("[data-testid=output]")).to_have_text("42", timeout=30000)
    assert errors == []
    context.close()
