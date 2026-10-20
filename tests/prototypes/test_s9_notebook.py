"""S-9: Python notebook with Pyodide in a worker, from a single HTML file opened via file://.

The tests share one notebook page per browser (starting Python takes seconds) and run in order.
"""
import base64
import json
import time

import nbformat
import pytest

from helpers import office_samples
from helpers.paths import DIST, dist_url

pytestmark = pytest.mark.skipif(not (DIST / "s9-notebook.html").exists(), reason="build with vendored Pyodide missing")


@pytest.fixture(scope="module")
def nb(browser):
    """A notebook page with a ready kernel: {"page", "errors", "requests", "start_seconds"}."""
    context = browser.new_context(accept_downloads=True)
    page = context.new_page()
    state = {"page": page, "errors": [], "requests": []}
    page.on("pageerror", lambda e: state["errors"].append(str(e)))
    page.on("console", lambda m: m.type == "error" and state["errors"].append(m.text))
    page.on("request", lambda r: not r.url.startswith(("file:", "data:", "blob:")) and state["requests"].append(r.url))
    start = time.time()
    state["started_at"] = start
    page.goto(dist_url("s9-notebook"))
    page.wait_for_selector("body[data-kernel=ready]", timeout=90000)
    state["start_seconds"] = time.time() - start
    yield state
    context.close()


def run(nb, code, count=1):
    """Run code in the kernel; returns (result, outputs)."""
    return nb["page"].evaluate("""async ([code, count]) => {
      const outputs = [];
      const result = await S9.kernel.run(code, count, (o) => outputs.push(o));
      return [result, outputs];
    }""", [code, count])


def test_start(nb):
    print(f"\n{nb['page'].context.browser.browser_type.name}: kernel ready after {nb['start_seconds']:.1f} s")
    assert nb["start_seconds"] < 30
    assert nb["page"].evaluate("S9.kernel.ready")["python"].startswith("3.14")
    nb["page"].wait_for_selector("#status:text-is('ready')", timeout=90000)  # packages preloaded
    print(f"packages preloaded after {time.time() - nb['started_at']:.1f} s")
    assert nb["errors"] == [] and nb["requests"] == []


def test_numpy_pandas(nb):
    t = time.time()
    result, outputs = run(nb, "import numpy as np, pandas as pd\ndf = pd.DataFrame({'a': np.arange(3), 'b': ['x', 'ä', 'z']})\ndf")
    print(f"first import of numpy + pandas (preloaded): {time.time() - t:.1f} s")
    assert result == "ok"
    data = outputs[-1]["data"]
    assert outputs[-1]["output_type"] == "execute_result" and "<table" in data["text/html"] and "ä" in data["text/html"]
    _, outputs = run(nb, "float(np.linalg.det(np.array([[2.0, 1.0], [1.0, 3.0]])))")
    assert outputs[0]["data"]["text/plain"] == "5.000000000000001" or outputs[0]["data"]["text/plain"].startswith("5.0")


def test_matplotlib(nb):
    t = time.time()
    _, outputs = run(nb, "import matplotlib.pyplot as plt\nplt.plot([1, 3, 2])\nplt.title('Test')\nplt.show()\nprint('after show')")
    print(f"first matplotlib figure: {time.time() - t:.1f} s")
    png = [o for o in outputs if o["output_type"] == "display_data" and "image/png" in o["data"]]
    assert len(png) == 1 and base64.b64decode(png[0]["data"]["image/png"])[:8] == b"\x89PNG\r\n\x1a\n"
    assert any(o.get("text") == "after show\n" for o in outputs)
    # a figure that is not shown explicitly is sent at the end of the cell (like Jupyter's inline backend)
    _, outputs = run(nb, "fig, ax = plt.subplots(); ax.bar(['a', 'b'], [1, 2]);")
    assert [o["output_type"] for o in outputs] == ["display_data"]


def test_streams_errors_await_display(nb):
    _, outputs = run(nb, "import sys\nprint('out')\nprint('err', file=sys.stderr)")
    assert [(o["name"], o["text"]) for o in outputs] == [("stdout", "out\n"), ("stderr", "err\n")]
    result, outputs = run(nb, "def f():\n    return 1 / 0\nf()", count=7)
    assert result == "error" and outputs[0]["ename"] == "ZeroDivisionError"
    tb = "".join(outputs[0]["traceback"])
    assert "<cell 7>" in tb and "_pyodide" not in tb  # only the user's frames
    _, outputs = run(nb, "import asyncio\nawait asyncio.sleep(0.01)\n'awaited'")
    assert outputs[0]["data"]["text/plain"] == "'awaited'"
    _, outputs = run(nb, "class H:\n    def _repr_html_(self):\n        return '<b>bold</b>'\ndisplay(H())")
    assert outputs[0]["output_type"] == "display_data" and outputs[0]["data"]["text/html"] == "<b>bold</b>"


def test_files(nb):
    page = nb["page"]
    page.evaluate("S9.kernel.writeFile('/home/pyodide/in.csv', new TextEncoder().encode('x,y\\n1,2\\n3,4\\n'))")
    _, outputs = run(nb, "import pandas as pd\nd = pd.read_csv('in.csv')\nd.assign(z=d.x + d.y).to_csv('out.csv', index=False)\nint(d.y.sum())")
    assert outputs[0]["data"]["text/plain"] == "6"
    out = page.evaluate("async () => new TextDecoder().decode(await S9.kernel.readFile('/home/pyodide/out.csv'))")
    assert out.splitlines() == ["x,y,z", "1,2,3", "3,4,7"]
    names = [f["name"] for f in page.evaluate("S9.kernel.listFiles('/home/pyodide')")]
    assert {"in.csv", "out.csv"} <= set(names)


def test_install_wheel(nb, tmp_path):
    wheel = office_samples.make_wheel(tmp_path)
    nb["page"].set_input_files("#wheel", str(wheel))
    nb["page"].wait_for_selector("#status:has-text('installed suite_hello')", timeout=30000)
    _, outputs = run(nb, "import suite_hello\nsuite_hello.greet('Welt')")
    assert outputs[0]["data"]["text/plain"] == "'Hallo Welt aus dem Wheel'"


def test_ipynb_round_trip(nb):
    page = nb["page"]
    notebook = nbformat.v4.new_notebook(cells=[
        nbformat.v4.new_markdown_cell("# Titel\n\nText mit **fett**"),
        nbformat.v4.new_code_cell("x = 21\nx * 2", execution_count=3,
                                  outputs=[nbformat.v4.new_output("execute_result", data={"text/plain": "42"}, execution_count=3)]),
    ])
    page.evaluate("nb => S9.loadNotebook(nb)", json.loads(nbformat.writes(notebook)))
    assert page.locator(".cell.markdown .rendered h1").text_content() == "Titel"
    assert page.locator(".cell.code .outputs pre").text_content() == "42"
    saved = page.evaluate("S9.toNotebook()")
    nbformat.validate(nbformat.reads(json.dumps(saved), as_version=4))
    assert "".join(saved["cells"][1]["source"]) == "x = 21\nx * 2" and saved["cells"][1]["execution_count"] == 3


def test_ui_run_and_sanitize(nb):
    page = nb["page"]
    page.evaluate("S9.loadNotebook({cells: [{cell_type: 'code', source: '', outputs: [], metadata: {}}]})")
    page.click(".cell.code .cm-content")
    page.keyboard.type("y = 6 * 7\nprint('y =', y)")
    page.keyboard.press("Shift+Enter")
    page.wait_for_selector(".cell.code .outputs pre:has-text('y = 42')", timeout=30000)
    assert page.locator(".cell").count() == 2  # Shift+Enter added a new cell
    # HTML from outputs and Markdown is sanitized (no scripts, no event handlers)
    page.evaluate("""S9.loadNotebook({cells: [
      {cell_type: 'markdown', source: 'safe <img src=x onerror="window.pwned=1"><script>window.pwned=2</script>', metadata: {}},
      {cell_type: 'code', source: '', metadata: {}, outputs: [{output_type: 'display_data', metadata: {}, data: {'text/html': '<i onmouseover="window.pwned=3">x</i><script>window.pwned=4</script>'}}]}]})""")
    html = page.evaluate("[...document.querySelectorAll('.rendered, .outputs')].map((e) => e.innerHTML).join('')")
    assert "onerror" not in html and "onmouseover" not in html and "<script" not in html and 'src="x"' not in html
    assert page.evaluate("window.pwned") is None


def test_pypi_wheels_seaborn_excel(nb):
    """Pure-Python wheels from PyPI in the bundle (seaborn, openpyxl): plots and Excel files."""
    _, outputs = run(nb, "import seaborn as sns, pandas as pd\nd = pd.DataFrame({'g': list('aabb'), 'v': [1, 2, 3, 4]})\nsns.barplot(data=d, x='g', y='v');")
    assert [o["output_type"] for o in outputs if o["output_type"] != "stream"] == ["display_data"]
    _, outputs = run(nb, "d.to_excel('t.xlsx', index=False)\nint(pd.read_excel('t.xlsx').v.sum())")
    assert outputs[-1]["data"]["text/plain"] == "10"


def test_pykeepass(nb, tmp_path):
    """pykeepass in the browser (pycryptodome under the name Cryptodome, argon2-cffi, lxml)."""
    from pykeepass import create_database, PyKeePass
    path = tmp_path / "test.kdbx"
    kp = create_database(str(path), password="geheim")
    kp.add_entry(kp.root_group, "Mail", "anna", "pw-äöü", url="https://mail.example")
    kp.save()
    page = nb["page"]
    page.evaluate("b => S9.kernel.writeFile('/home/pyodide/test.kdbx', Uint8Array.from(atob(b), (c) => c.charCodeAt(0)))",
                  base64.b64encode(path.read_bytes()).decode())
    result, outputs = run(nb, "from pykeepass import PyKeePass\nkp = PyKeePass('test.kdbx', password='geheim')\n"
                              "e = kp.find_entries(title='Mail', first=True)\nkp.add_entry(kp.root_group, 'Neu', 'bob', 'pw2')\nkp.save()\n(e.username, e.password)")
    assert result == "ok", outputs
    assert outputs[-1]["data"]["text/plain"] == "('anna', 'pw-äöü')"
    saved = tmp_path / "saved.kdbx"
    saved.write_bytes(bytes(page.evaluate("async () => Array.from(await S9.kernel.readFile('/home/pyodide/test.kdbx'))")))
    assert PyKeePass(str(saved), password="geheim").find_entries(title="Neu", first=True).username == "bob"


def test_sqlite_nzpy_requests(nb, http_target):
    _, outputs = run(nb, "import sqlite3\ndb = sqlite3.connect('t.db')\ndb.execute('create table t (a)')\n"
                         "db.executemany('insert into t values (?)', [(1,), (2,)])\ndb.commit()\ndb.execute('select sum(a) from t').fetchone()[0]")
    assert outputs[-1]["data"]["text/plain"] == "3"
    result, outputs = run(nb, "import nzpy\nnzpy.__name__")  # installs; connecting needs TCP sockets (not in the browser)
    assert result == "ok", outputs
    result, outputs = run(nb, f"import requests\nr = requests.get('{http_target}/cors/hello')\n(r.status_code, r.json()['path'])")
    assert result == "ok", outputs
    assert outputs[-1]["data"]["text/plain"] == "(200, '/cors/hello')"
    _, outputs = run(nb, "import sqlalchemy as sa\nengine = sa.create_engine('sqlite:///t.db')\n"
                         "with engine.connect() as c:\n    total = c.execute(sa.text('select sum(a) from t')).scalar()\ntotal")
    assert outputs[-1]["data"]["text/plain"] == "3"


def test_restart(nb):
    page = nb["page"]
    run(nb, "kept = 1")
    page.click("#restart")
    page.wait_for_selector("#status:text-is('ready')", timeout=90000)
    result, outputs = run(nb, "kept")
    assert result == "error" and outputs[0]["ename"] == "NameError"  # state is gone
    _, outputs = run(nb, "import suite_hello\nsuite_hello.greet('wieder')")  # the wheel is re-installed
    assert outputs[0]["data"]["text/plain"] == "'Hallo wieder aus dem Wheel'"
    assert nb["errors"] == []
