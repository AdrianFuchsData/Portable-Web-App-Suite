"""The notebook's Terminal tab (apps/notebook/src/js/terminal.js with the shell of shared/js/python-shell.py): typing commands,
history, Tab completion, less and nano on the Pyodide file system, scripts, and the shell in cells. The commands themselves
are tested with CPython in tests/shared/test_python_shell.py."""
import re

import pytest
from playwright.sync_api import expect

from helpers.paths import DIST

pytestmark = pytest.mark.skipif(not (DIST / "notebook.html").exists(), reason="build with vendored Pyodide missing")
NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"
SCREEN = "() => { const b = NB.terminal.term.buffer.active; const out = []; for (let i = 0; i < b.length; i++) out.push(b.getLine(i).translateToString(true)); return out.join('\\n'); }"


def screen(page):
    return page.evaluate(SCREEN)


def wait_for(page, pattern, timeout=60000):
    """Wait until the terminal screen matches a regular expression."""
    rx = re.compile(pattern, re.S)
    for _ in range(timeout // 200):
        text = screen(page)
        if rx.search(text):
            return text
        page.wait_for_timeout(200)
    raise AssertionError(f"not on the screen: {pattern!r}\n---\n{screen(page)}")


def idle(page):
    page.wait_for_function("() => NB.terminal && !NB.terminal.busy", timeout=60000)


def command(page, line):
    page.evaluate("line => NB.terminal.input(line + '\\r')", line)
    page.wait_for_timeout(100)
    idle(page)


def test_terminal(app_page):
    page = app_page("notebook", init_script=NO_PICKERS)
    page.wait_for_selector("body[data-kernel=ready]", timeout=120000)
    page.click("[data-testid=tab-terminal]")
    expect(page.locator("[data-testid=terminal] .xterm")).to_be_visible()
    wait_for(page, r"pyodide:~\$")
    # typed on the keyboard
    page.locator("[data-testid=terminal]").click()
    page.keyboard.type("mkdir -p demo && cd demo && echo 'hello shell' > a.txt && cat a.txt | tr a-z A-Z")
    page.keyboard.press("Enter")
    wait_for(page, r"HELLO SHELL\s*\n.*pyodide:~/demo\$")
    idle(page)
    # history (↑) and Tab completion
    page.keyboard.type("echo again")
    page.keyboard.press("Enter")
    idle(page)
    page.keyboard.press("ArrowUp")
    wait_for(page, r"pyodide:~/demo\$ echo again\s*$")
    page.keyboard.press("Control+u")
    page.keyboard.type("cat a.")
    page.keyboard.press("Tab")
    wait_for(page, r"\$ cat a\.txt\s*$")
    page.keyboard.press("Enter")
    wait_for(page, r"cat a\.txt\s*\nhello shell")
    idle(page)
    # pipes, redirections, globs, a script; the files panel follows
    page.evaluate("NB.kernel.writeFile('/home/pyodide/demo/count.sh', new TextEncoder().encode('echo \"files: $(1)\"\\nls *.txt | wc -l\\n'))")
    command(page, "printf 'b\\na\\nb\\n' > list.txt; sort list.txt | uniq -c > counts.txt; cat counts.txt")
    wait_for(page, r"1 a\s*\n\s*2 b")
    command(page, "sh count.sh")
    wait_for(page, r"files: .*\n\s*3\s*\n")
    # less: a pager on the alternate screen; q quits
    command(page, "seq 2>/dev/null; python -c \"print('\\n'.join(f'line {i}' for i in range(200)))\" > long.txt")
    page.evaluate("NB.terminal.input('less long.txt\\r')")
    page.wait_for_function("() => NB.terminal.mode === 'interactive'", timeout=60000)
    wait_for(page, r"line 0.*long\.txt")
    page.evaluate("NB.terminal.input(' ')")  # next page
    wait_for(page, r"line \d\d")
    page.evaluate("NB.terminal.input('/line 150\\r')")
    wait_for(page, r"line 150")
    page.evaluate("NB.terminal.input('q')")
    page.wait_for_function("() => NB.terminal.mode === null")
    idle(page)
    # nano: edit, save (Ctrl+O, Enter), exit (Ctrl+X)
    page.evaluate("NB.terminal.input('nano note.txt\\r')")
    page.wait_for_function("() => NB.terminal.mode === 'interactive'", timeout=60000)
    wait_for(page, r"nano\s+note\.txt")
    page.evaluate("NB.terminal.input('first line\\rsecond line')")
    page.evaluate("NB.terminal.input('\\x0f')")  # Ctrl+O
    wait_for(page, r"File name to write")  # (the path is cut on phones)
    page.evaluate("NB.terminal.input('\\r')")
    wait_for(page, r"Wrote 2 lines")
    page.evaluate("NB.terminal.input('\\x18')")  # Ctrl+X
    page.wait_for_function("() => NB.terminal.mode === null")
    assert page.evaluate("async () => new TextDecoder().decode(await NB.kernel.readFile('/home/pyodide/demo/note.txt'))") == "first line\nsecond line\n"
    # nano asks before leaving changes unsaved
    page.evaluate("NB.terminal.input('nano note.txt\\r')")
    page.wait_for_function("() => NB.terminal.mode === 'interactive'", timeout=60000)
    page.evaluate("NB.terminal.input('x')")
    page.evaluate("NB.terminal.input('\\x18')")
    wait_for(page, r"Save the changes")
    page.evaluate("NB.terminal.input('n\\r')")
    page.wait_for_function("() => NB.terminal.mode === null")
    assert page.evaluate("async () => new TextDecoder().decode(await NB.kernel.readFile('/home/pyodide/demo/note.txt'))") == "first line\nsecond line\n"
    # errors
    command(page, "nosuch")
    wait_for(page, r"nosuch: command not found")
    # the shell in a cell (same working directory and history of files)
    page.click("[data-testid=tab-notebook]")
    page.evaluate("cells => NB.setCells(NB.fromNotebook({ cells }), 'test.ipynb', null)",
                  [{"cell_type": "code", "metadata": {}, "outputs": [], "source": "import suite\nawait suite.shell.run('ls /home/pyodide/demo | wc -l')"}])
    page.click("[data-testid=run-all]")
    expect(page.locator("[data-testid=cell]").first.locator("[data-testid=output]").first).to_contain_text("6", timeout=60000)
    assert page.errors == []
