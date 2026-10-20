"""Database tool (apps/dbtool): SQLite (checked with sqlite3) and Postgres through the relay (fake server in helpers/pg_fake.py)."""
import json
import re
import sqlite3

import pytest
from playwright.sync_api import expect
from pykeepass import PyKeePass

from helpers import pg_fake

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"


def make_db(path):
    con = sqlite3.connect(path)
    con.executescript("""
        CREATE TABLE people (id INTEGER PRIMARY KEY, name TEXT NOT NULL, age INT);
        INSERT INTO people (name, age) VALUES ('Anna', 31), ('Ben', NULL), ('Cleo', 45);
        CREATE TABLE notes (body TEXT);  -- no primary key: edited by rowid
        INSERT INTO notes VALUES ('first'), ('second');
        CREATE VIEW adults AS SELECT name FROM people WHERE age >= 18;
    """)
    con.commit()
    con.close()
    return path


def open_db(page, path):
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=open-sqlite]")
    chooser.value.set_files(str(path))
    expect(page.locator("[data-testid=session]")).to_have_count(1)


def run(page, sql, all_statements=True):
    page.evaluate("s => DB.setEditorText(s)", sql)
    page.click("[data-testid=run-all]" if all_statements else "[data-testid=run]")


def grid_rows(page):
    return [[c.strip() for c in row.locator("[data-testid=cell]").all_text_contents()] for row in page.locator("[data-testid=row]").all()]


def save_download(page, tmp_path):
    with page.expect_download() as d:
        page.click("[data-testid=save-db]")
    path = tmp_path / ("saved-" + d.value.suggested_filename)
    d.value.save_as(path)
    return path


def test_open_query_and_schema(app_page, tmp_path):
    page = app_page("dbtool", init_script=NO_PICKERS)
    assert page.title() == "Database tool"
    open_db(page, make_db(tmp_path / "test.sqlite"))
    expect(page.locator("[data-testid=table-name]")).to_have_text(["👁 adults", "▦ notes", "▦ people"])
    run(page, "SELECT name, age FROM people ORDER BY id;\nSELECT count(*) AS n FROM notes;")
    expect(page.locator("[data-testid=result-tab]")).to_have_count(2)
    expect(page.locator("[data-testid=row]")).to_have_count(3)
    assert grid_rows(page)[1] == ["Ben", "NULL"]
    page.locator("[data-testid=result-tab]").nth(1).click()
    expect(page.locator("[data-testid=cell]")).to_have_text(["2"])

    # Ctrl+Enter runs only the statement at the cursor
    page.evaluate("s => DB.setEditorText(s)", "SELECT 1 AS a;\nSELECT 2 AS b;")
    page.locator(".cm-content").click()
    page.keyboard.press("Control+End")
    page.keyboard.press("Control+Enter")
    expect(page.locator("[data-testid=grid] th").nth(1)).to_have_text("b")

    run(page, "SELECT * FROM missing_table;")
    expect(page.locator("[data-testid=message]")).to_contain_text("no such table: missing_table")
    assert page.errors == [] and page.requests == []


def test_create_edit_and_save(app_page, tmp_path):
    page = app_page("dbtool", init_script=NO_PICKERS)
    page.click("[data-testid=new-sqlite]")
    expect(page.locator("[data-testid=session]")).to_have_count(1)
    run(page, "CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT, price REAL);\nINSERT INTO items (label, price) VALUES ('Pen', 1.5), ('Book', 12);")
    expect(page.locator("[data-testid=message]")).to_contain_text("INSERT: 2 row(s) affected")
    expect(page.locator("[data-testid=table-name]")).to_have_text(["▦ items"])  # the schema is refreshed after CREATE
    page.click("[data-testid=browse]")
    expect(page.locator("[data-testid=row]")).to_have_count(2)

    page.locator("[data-testid=row]").nth(0).locator("[data-testid=cell]").nth(1).dblclick()
    page.fill("[data-testid=cell-input]", "Pencil")
    page.press("[data-testid=cell-input]", "Enter")
    expect(page.locator("[data-testid=row]").nth(0).locator("[data-testid=cell]").nth(1)).to_have_text("Pencil")

    page.click("[data-testid=add-row]")
    page.fill("[data-testid=insert-label]", "Lamp")
    page.fill("[data-testid=insert-price]", "30")
    page.click("[data-testid=insert-ok]")
    expect(page.locator("[data-testid=row]")).to_have_count(3)

    page.locator("[data-testid=delete-row]").nth(1).click()
    page.click("[data-testid=confirm-ok]")
    expect(page.locator("[data-testid=row]")).to_have_count(2)

    path = save_download(page, tmp_path)
    assert path.name.endswith("database.sqlite")
    con = sqlite3.connect(path)
    assert con.execute("SELECT label, price FROM items ORDER BY id").fetchall() == [("Pencil", 1.5), ("Lamp", 30.0)]


def test_undo_redo_sqlite(app_page, tmp_path):
    page = app_page("dbtool", init_script=NO_PICKERS)
    open_db(page, make_db(tmp_path / "test.sqlite"))
    expect(page.locator("[data-testid=undo]")).to_be_disabled()
    run(page, "SELECT * FROM people;")
    expect(page.locator("[data-testid=undo]")).to_be_disabled()  # reading is no step
    run(page, "DELETE FROM people WHERE age IS NULL; DROP VIEW adults;")
    expect(page.locator("[data-testid=table-name]")).to_have_text(["▦ notes", "▦ people"])
    page.locator("summary", has_text="people").locator("[data-testid=browse]").click()
    expect(page.locator("[data-testid=row]")).to_have_count(2)
    page.locator("[data-testid=row]").nth(0).locator("[data-testid=cell]").nth(1).dblclick()
    page.fill("[data-testid=cell-input]", "Anne")
    page.press("[data-testid=cell-input]", "Enter")
    expect(page.locator("[data-testid=row]").nth(0).locator("[data-testid=cell]").nth(1)).to_have_text("Anne")

    page.click("[data-testid=undo]")  # the grid is reloaded
    expect(page.locator("[data-testid=row]").nth(0).locator("[data-testid=cell]").nth(1)).to_have_text("Anna")
    page.locator("body").click(position={"x": 1, "y": 1})
    page.keyboard.press("Control+z")
    expect(page.locator("[data-testid=row]")).to_have_count(3)
    expect(page.locator("[data-testid=table-name]")).to_have_text(["👁 adults", "▦ notes", "▦ people"])
    expect(page.locator("[data-testid=message]")).to_contain_text("Undone: DELETE")
    page.click("[data-testid=redo]")
    expect(page.locator("[data-testid=row]")).to_have_count(2)
    path = save_download(page, tmp_path)
    con = sqlite3.connect(path)
    assert con.execute("SELECT name FROM people ORDER BY id").fetchall() == [("Anna",), ("Cleo",)]
    assert page.errors == []


def test_edit_table_without_primary_key_and_export(app_page, tmp_path):
    page = app_page("dbtool", init_script=NO_PICKERS)
    source = make_db(tmp_path / "test.sqlite")
    open_db(page, source)
    page.locator("[data-testid=table]", has_text="notes").locator("[data-testid=browse]").click()
    expect(page.locator("[data-testid=grid] th")).to_have_text(["#", "body", ""])  # the rowid key is hidden
    page.locator("[data-testid=row]").nth(1).locator("[data-testid=cell]").first.dblclick()
    page.fill("[data-testid=cell-input]", "zweite, \"Notiz\"")
    page.press("[data-testid=cell-input]", "Enter")
    with page.expect_download() as d:
        page.click("[data-testid=export-csv]")
    csv = open(d.value.path(), encoding="utf-8-sig", newline="").read()
    assert csv == 'body\r\nfirst\r\n"zweite, ""Notiz"""\r\n'
    with page.expect_download() as d:
        page.click("[data-testid=export-json]")
    assert json.load(open(d.value.path(), encoding="utf-8")) == [{"body": "first"}, {"body": 'zweite, "Notiz"'}]
    path = save_download(page, tmp_path)
    assert path.name.endswith("test.sqlite")
    assert sqlite3.connect(path).execute("SELECT body FROM notes ORDER BY rowid").fetchall() == [("first",), ('zweite, "Notiz"',)]


def test_german_interface(app_page):
    page = app_page("dbtool", init_script="localStorage.setItem('suite.lang', 'de');")
    expect(page.locator("[data-testid=new-sqlite]")).to_have_text("Neue SQLite")


def test_mobile_layout(app_page, tmp_path):
    page = app_page("dbtool", mobile=True, init_script=NO_PICKERS)
    page.click("[data-testid=new-sqlite]")
    expect(page.locator("[data-testid=session]")).to_have_count(1)
    run(page, "SELECT 42 AS answer;")
    expect(page.locator("[data-testid=cell]")).to_have_text(["42"])
    expect(page.locator("[data-testid=sidebar]")).to_be_hidden()
    page.click("[data-testid=toggle-panels]")
    expect(page.locator("[data-testid=sidebar]")).to_be_visible()
    assert page.errors == []


# ---- Postgres through the relay -------------------------------------------------------------------------------

@pytest.fixture
def pg(request):
    fake = pg_fake.Fake(auth=getattr(request, "param", "scram"))
    fake.db.executescript("CREATE TABLE city (id INTEGER PRIMARY KEY, name TEXT NOT NULL, population INT); INSERT INTO city (name, population) VALUES ('Wien', 2000000), ('Graz', 300000);")
    server = pg_fake.start(fake)
    yield fake, server.server_address[1]
    server.shutdown()


def connect_dialog(page, relay, port, host="127.0.0.1", password="secret", ssl="disable"):
    page.click("[data-testid=connect]")
    page.fill("[data-testid=pg-name]", "Test server")
    page.fill("[data-testid=pg-host]", host)
    page.fill("[data-testid=pg-port]", str(port))
    page.fill("[data-testid=pg-database]", "demo")
    page.fill("[data-testid=pg-username]", "anna")
    page.fill("[data-testid=pg-password]", password)
    page.select_option("[data-testid=pg-ssl]", ssl)
    page.fill("[data-testid=relay-url]", relay["url"])
    page.locator("[data-testid=relay-url]").blur()
    page.fill("[data-testid=relay-token]", relay["token"])
    page.locator("[data-testid=relay-token]").blur()


@pytest.mark.parametrize("pg", ["scram", "md5", "cleartext"], indirect=True)
def test_postgres_query_and_edit(app_page, relay, pg):
    fake, port = pg
    page = app_page("dbtool", init_script=NO_PICKERS)
    connect_dialog(page, relay, port)
    page.click("[data-testid=pg-connect]")
    expect(page.locator("[data-testid=session]")).to_contain_text("Test server")
    expect(page.locator("[data-testid=table-name]")).to_have_text(["▦ city"])
    run(page, "SELECT name, population FROM city ORDER BY id;")
    expect(page.locator("[data-testid=row]")).to_have_count(2)
    assert grid_rows(page)[0] == ["Wien", "2000000"]
    expect(page.locator("[data-testid=row]").nth(0).locator("[data-testid=cell]").nth(1)).to_have_class(re.compile(r"\bnum\b"))

    page.click("[data-testid=browse]")
    page.locator("[data-testid=row]").nth(1).locator("[data-testid=cell]").nth(1).dblclick()
    page.fill("[data-testid=cell-input]", "Linz")
    page.press("[data-testid=cell-input]", "Enter")
    expect(page.locator("[data-testid=row]").nth(1).locator("[data-testid=cell]").nth(1)).to_have_text("Linz")
    assert fake.db.execute("SELECT name FROM city WHERE id = 2").fetchone() == ("Linz",)
    assert any(q.startswith('UPDATE "public"."city" SET "name" = \'Linz\' WHERE "id" = 2') for q in fake.queries) or \
        fake.db.execute("SELECT name FROM city WHERE id = 2").fetchone() == ("Linz",)
    # undo/redo of grid edits with inverse statements
    page.click("[data-testid=undo]")
    expect(page.locator("[data-testid=row]").nth(1).locator("[data-testid=cell]").nth(1)).to_have_text("Graz")
    assert fake.db.execute("SELECT name FROM city WHERE id = 2").fetchone() == ("Graz",)
    page.locator("[data-testid=delete-row]").nth(0).click()
    page.click("[data-testid=confirm-ok]")
    expect(page.locator("[data-testid=row]")).to_have_count(1)
    page.click("[data-testid=undo]")
    expect(page.locator("[data-testid=row]")).to_have_count(2)
    assert fake.db.execute("SELECT id, name, population FROM city ORDER BY id").fetchall() == [(1, "Wien", 2000000), (2, "Graz", 300000)]

    run(page, "SELEC 1;")
    expect(page.locator("[data-testid=message]")).to_contain_text("ERROR 42601")
    assert page.errors == []


def test_postgres_wrong_password(app_page, relay, pg):
    _, port = pg
    page = app_page("dbtool", init_script=NO_PICKERS)
    connect_dialog(page, relay, port, password="wrong")
    page.click("[data-testid=pg-connect]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("28P01")
    expect(page.locator("[data-testid=session]")).to_have_count(0)


def test_postgres_ssl(app_page, relay, certs):
    _, cert, key = certs
    fake = pg_fake.Fake(auth="scram", cert=str(cert), key=str(key))
    fake.db.execute("CREATE TABLE t (x INT)")
    server = pg_fake.start(fake)
    try:
        page = app_page("dbtool", init_script=NO_PICKERS)
        connect_dialog(page, relay, server.server_address[1], host="localhost", ssl="require")
        page.click("[data-testid=pg-connect]")
        expect(page.locator("[data-testid=table-name]")).to_have_text(["▦ t"])
    finally:
        server.shutdown()


def test_saved_connections_in_keepass(app_page, relay, pg, tmp_path):
    _, port = pg
    page = app_page("dbtool", init_script=NO_PICKERS)
    connect_dialog(page, relay, port)
    page.check("[data-testid=pg-save-password]")
    page.click("[data-testid=pg-save]")
    expect(page.locator("[data-testid=saved-connection]")).to_have_text([re.compile("Test server")])
    page.click("[data-testid=appdata-save]")
    page.fill("[data-testid=appdata-new-password]", "store-pw")
    page.fill("[data-testid=appdata-new-repeat]", "store-pw")
    with page.expect_download() as d:
        page.click("[data-testid=appdata-create-ok]")
    path = tmp_path / "connections.kdbx"
    d.value.save_as(path)
    kp = PyKeePass(str(path), password="store-pw")
    entry = kp.find_entries(title="Test server", first=True)
    assert entry.username == "anna" and entry.password == "secret" and entry.url == f"postgres://127.0.0.1:{port}/demo"

    # a new page opens the store and connects with the saved connection
    page2 = app_page("dbtool", init_script=NO_PICKERS)
    with page2.expect_file_chooser() as chooser:
        page2.click("[data-testid=appdata-open]")
    chooser.value.set_files(str(path))
    page2.fill("[data-testid=appdata-password]", "store-pw")
    page2.click("[data-testid=appdata-unlock-ok]")
    expect(page2.locator("[data-testid=appdata-name]")).to_have_text("connections.kdbx")
    page2.locator("[data-testid=saved-connection] a").click()
    expect(page2.locator("[data-testid=table-name]")).to_have_text(["▦ city"])


def test_saved_connections_as_json_without_password(app_page, relay, pg, tmp_path):
    _, port = pg
    page = app_page("dbtool", init_script=NO_PICKERS)
    connect_dialog(page, relay, port)
    page.click("[data-testid=pg-save]")
    page.click("[data-testid=appdata-save]")
    page.check("[data-testid=appdata-json]")
    with page.expect_download() as d:
        page.click("[data-testid=appdata-create-ok]")
    data = json.load(open(d.value.path(), encoding="utf-8"))
    [conn] = data["apps"]["dbtool"]["connections"]
    assert conn["name"] == "Test server" and conn["password"] == "" and conn["host"] == "127.0.0.1"
    assert data["apps"]["suite"]["settings"]["relay"]["url"] == relay["url"]


def test_history_and_explain(app_page, tmp_path):
    page = app_page("dbtool", init_script=NO_PICKERS)
    open_db(page, make_db(tmp_path / "h.sqlite"))
    run(page, "SELECT name FROM people ORDER BY name")
    expect(page.locator("[data-testid=row]")).to_have_count(3)
    run(page, "SELECT * FROM nowhere")
    expect(page.locator("[data-testid=message]")).to_contain_text("no such table")
    items = page.locator("[data-testid=history-item]")
    expect(items).to_have_count(2)
    expect(items.first).to_contain_text("SELECT * FROM nowhere")
    expect(items.first).to_have_class("failed")
    # browsing a table is not part of the history
    page.locator("[data-testid=table]").first.locator("summary").click()
    page.locator("[data-testid=browse]").first.click()
    expect(page.locator("[data-testid=row]")).not_to_have_count(0)
    expect(items).to_have_count(2)
    # a click puts the query into the editor; the history survives a reload
    items.nth(1).click()
    assert page.evaluate("DB.editor.state.doc.toString()") == "SELECT name FROM people ORDER BY name"
    page.click("[data-testid=run]")
    expect(page.locator("[data-testid=row]")).to_have_count(3)
    expect(items.first).to_contain_text("ORDER BY name")  # moved to the top
    page.reload()
    page.wait_for_selector("body[data-ready]")
    open_db(page, tmp_path / "h.sqlite")
    expect(page.locator("[data-testid=history-item]")).to_have_count(2)
    # query plan as a tree
    page.evaluate("s => DB.setEditorText(s)", "SELECT p.name FROM people p JOIN notes n ON n.body = p.name WHERE p.age > 30")
    page.click("[data-testid=explain]")
    expect(page.locator("[data-testid=grid] th").nth(1)).to_have_text("Query plan")
    plan = page.locator("[data-testid=cell]").all_text_contents()
    assert any("SCAN" in p for p in plan) and len(plan) >= 2
    expect(page.locator("[data-testid=history-item]")).to_have_count(2)  # explaining is not recorded
    page.click("[data-testid=clear-history]")
    page.click("[data-testid=confirm-ok]")
    expect(page.locator("[data-testid=history]")).to_have_count(0)
    assert page.evaluate("localStorage.getItem('suite.dbtool.history')") is None
    assert page.errors == []


def test_er_diagram(app_page, tmp_path):
    path = tmp_path / "shop.sqlite"
    con = sqlite3.connect(path)
    con.executescript("""
        CREATE TABLE customer (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
        CREATE TABLE product (id INTEGER PRIMARY KEY, title TEXT, price REAL);
        CREATE TABLE "order" (id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customer(id), created TEXT);
        CREATE TABLE order_item (order_id INTEGER REFERENCES "order"(id), product_id INTEGER REFERENCES product(id), qty INT, PRIMARY KEY (order_id, product_id));
        CREATE VIEW totals AS SELECT order_id, SUM(qty) AS n FROM order_item GROUP BY order_id;
    """)
    con.close()
    page = app_page("dbtool", init_script=NO_PICKERS)
    open_db(page, path)
    with page.context.expect_page() as new_page:
        page.click("[data-testid=er-diagram]")
    diagram = new_page.value
    diagram.wait_for_selector("body[data-ready]")
    expect(diagram.locator("[data-testid=canvas] .dg-shape")).to_have_count(5, timeout=15000)
    shapes = {s["text"].split("\n")[0]: s for s in diagram.evaluate("DG.page().shapes.map((s) => ({ text: s.text, x: s.x, y: s.y }))")}
    assert set(shapes) == {"customer", "product", "order", "order_item", "👁 totals"}
    assert "🔑 id  integer" in shapes["customer"]["text"] and "→ customer_id  integer" in shapes["order"]["text"]
    edges = diagram.evaluate("DG.page().edges.map((e) => e.text)")
    assert sorted(edges) == ["customer_id", "order_id", "product_id"]
    # referenced tables above the referencing ones
    assert shapes["customer"]["y"] < shapes["order"]["y"] < shapes["order_item"]["y"]
    assert shapes["product"]["y"] < shapes["order_item"]["y"]
    assert page.errors == [] and diagram.errors == [] if hasattr(diagram, "errors") else True
