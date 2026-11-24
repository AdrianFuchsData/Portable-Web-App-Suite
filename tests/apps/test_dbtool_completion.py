"""Database tool: SQL completion – columns of the tables in the statement without a qualifier, aliases, functions of the dialect."""
from playwright.sync_api import expect

from test_dbtool import NO_PICKERS, make_db, open_db


def complete(page, text, pos=None):
    page.evaluate("t => DB.setEditorText(t)", text)
    page.evaluate("([p]) => { const v = DB.editor; v.focus(); v.dispatch({ selection: { anchor: p ?? v.state.doc.length } }); }", [pos])
    page.keyboard.press("Control+Space")
    items = page.locator(".cm-tooltip-autocomplete li")
    expect(items.first).to_be_visible()
    return items


def labels(items):
    return [x.strip() for x in items.locator(".cm-completionLabel").all_text_contents()]


def test_completion(app_page, tmp_path):
    page = app_page("dbtool", init_script=NO_PICKERS)
    open_db(page, make_db(tmp_path / "c.sqlite"))
    # columns of the table in FROM, without a qualifier, first
    items = complete(page, "SELECT  FROM people", 7)
    assert labels(items)[:3] == ["age", "id", "name"]
    expect(items.first.locator(".cm-completionDetail")).to_have_text("people")
    # in WHERE, while typing
    items = complete(page, "SELECT * FROM people WHERE a")
    assert labels(items)[0] == "age" and "abs" in labels(items)
    # two tables with aliases; the alias still gives its columns
    items = complete(page, "SELECT n.b FROM people p JOIN notes n ON 1", 9)
    assert labels(items)[0] == "body"
    items = complete(page, "SELECT * FROM people p, notes n WHERE bo")
    assert labels(items)[0] == "body"
    # a function: inserted with parentheses, the cursor inside
    complete(page, "SELECT uppe")
    page.wait_for_timeout(200)  # (CodeMirror ignores Enter for a moment after the list opens)
    page.keyboard.press("Enter")
    page.keyboard.type("name")
    assert page.evaluate("DB.editor.state.doc.toString()") == "SELECT upper(name)"
    # the other statements do not count
    items = complete(page, "SELECT * FROM notes; SELECT  FROM people", 28)
    assert "body" not in labels(items) and labels(items)[0] == "age"
    assert page.errors == []
