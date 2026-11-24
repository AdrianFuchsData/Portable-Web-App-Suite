"""Database tool: MySQL / MariaDB through the relay (fake server in helpers/mysql_fake.py) – authentication variants, TLS,
schema, queries with several results, editing, import, errors."""
import re

import pytest
from playwright.sync_api import expect

from helpers import mysql_fake
from test_dbtool import NO_PICKERS, grid_rows, run


@pytest.fixture
def my(request):
    fake = mysql_fake.Fake(auth=getattr(request, "param", "sha2-fast"))
    fake.db.executescript("CREATE TABLE city (id INTEGER PRIMARY KEY, name TEXT NOT NULL, population INT, area REAL);"
                          "INSERT INTO city (name, population, area) VALUES ('Wien', 2000000, 414.9), ('Graz', 300000, 127.6);"
                          "CREATE TABLE visit (id INTEGER PRIMARY KEY, city_id INTEGER REFERENCES city(id), note TEXT);")
    server = mysql_fake.start(fake)
    yield fake, server.server_address[1]
    server.shutdown()


def connect(page, relay, port, password="secret", ssl="disable", host="127.0.0.1"):
    page.click("[data-testid=connect]")
    page.select_option("[data-testid=pg-kind]", "mysql")
    expect(page.locator("[data-testid=pg-port]")).to_have_value("3306")
    page.fill("[data-testid=pg-name]", "Shop")
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
    page.click("[data-testid=pg-connect]")


@pytest.mark.parametrize("my", ["sha2-fast", "sha2-full", "native", "switch"], indirect=True)
def test_mysql_auth_query_edit(app_page, relay, my):
    fake, port = my
    page = app_page("dbtool", init_script=NO_PICKERS)
    connect(page, relay, port)
    expect(page.locator("[data-testid=session]")).to_contain_text("Shop")
    if fake.auth == "sha2-full":
        assert "rsa" in fake.log  # (no TLS: the password goes RSA-encrypted)
    if fake.auth == "switch":
        assert "switch" in fake.log
    expect(page.locator("[data-testid=table-name]")).to_have_text(["city", "visit"])
    # several statements, numbers as numbers
    run(page, "SELECT name, population, area FROM city ORDER BY id; SELECT COUNT(*) AS n FROM city; UPDATE city SET population = population + 1 WHERE id = 2;")
    expect(page.locator("[data-testid=result-tab]")).to_have_count(2)
    expect(page.locator("[data-testid=row]")).to_have_count(2)
    assert grid_rows(page)[0] == ["Wien", "2000000", "414.9"]
    expect(page.locator("[data-testid=row]").nth(0).locator("[data-testid=cell]").nth(1)).to_have_class(re.compile(r"\bnum\b"))
    assert fake.db.execute("SELECT population FROM city WHERE id = 2").fetchone() == (300001,)
    # browse and edit by primary key (backquoted names), undo
    page.locator("[data-testid=table]").first.locator("[data-testid=table-name]").click()
    page.locator("[data-testid=table]").first.locator("[data-testid=browse]").click()
    expect(page.locator("[data-testid=row]")).to_have_count(2)
    expect(page.locator("[data-testid=row]").nth(1).locator("[data-testid=cell]").nth(1)).to_have_text("Graz")
    assert any("SELECT * FROM `city` ORDER BY `id` LIMIT 200 OFFSET 0;" in q for q in fake.queries)
    page.locator("[data-testid=row]").nth(1).locator("[data-testid=cell]").nth(1).dblclick()
    page.fill("[data-testid=cell-input]", "Linz")
    page.press("[data-testid=cell-input]", "Enter")
    expect(page.locator("[data-testid=row]").nth(1).locator("[data-testid=cell]").nth(1)).to_have_text("Linz")
    assert fake.db.execute("SELECT name FROM city WHERE id = 2").fetchone() == ("Linz",)
    page.click("[data-testid=undo]")
    expect(page.locator("[data-testid=row]").nth(1).locator("[data-testid=cell]").nth(1)).to_have_text("Graz")
    # errors with their code and SQL state
    run(page, "SELECT * FROM nowhere;")
    expect(page.locator("[data-testid=message]")).to_contain_text("42S02")
    # the MySQL dialect: backquotes, the completion knows MySQL functions
    page.evaluate("t => DB.setEditorText(t)", "SELECT date_fo")
    page.evaluate("() => { const v = DB.editor; v.focus(); v.dispatch({ selection: { anchor: v.state.doc.length } }); }")
    page.keyboard.press("Control+Space")
    expect(page.locator(".cm-tooltip-autocomplete li").first).to_contain_text("date_format")
    assert page.errors == []


@pytest.mark.parametrize("my", ["sha2-fast"], indirect=True)
def test_mysql_wrong_password_and_import(app_page, relay, my, tmp_path):
    fake, port = my
    page = app_page("dbtool", init_script=NO_PICKERS)
    connect(page, relay, port, password="wrong")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("1045 (28000): Access denied for user 'anna'")
    page.fill("[data-testid=pg-password]", "secret")
    page.click("[data-testid=pg-connect]")
    expect(page.locator("[data-testid=session]")).to_contain_text("Shop")
    src = tmp_path / "shops.csv"
    src.write_text("shop,turnover\nNord,1200.5\nSüd,980\n", encoding="utf-8")
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=import-data]")
    chooser.value.set_files(str(src))
    expect(page.locator("[data-testid=import-preview] th")).to_have_text(["shopTEXT", "turnoverDOUBLE"])
    page.click("[data-testid=import-ok]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("2 rows imported into “shops”")
    assert any(q.startswith("CREATE TABLE `shops` (`shop` TEXT, `turnover` DOUBLE)") for q in fake.queries)
    assert fake.db.execute("SELECT shop, turnover FROM shops ORDER BY shop").fetchall() == [("Nord", 1200.5), ("Süd", 980.0)]
    assert page.errors == []


def test_mysql_tls(app_page, relay, certs):
    ca, cert, key = certs
    fake = mysql_fake.Fake(auth="sha2-full", cert=str(cert), key=str(key))
    fake.db.executescript("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT); INSERT INTO t (v) VALUES ('secret data');")
    server = mysql_fake.start(fake)
    try:
        page = app_page("dbtool", init_script=NO_PICKERS)
        connect(page, relay, server.server_address[1], ssl="require", host="localhost")
        expect(page.locator("[data-testid=session]")).to_contain_text("Shop")
        assert fake.log[0] == "tls" and "cleartext" in fake.log  # (full authentication over TLS: the password in clear)
        run(page, "SELECT v FROM t;")
        expect(page.locator("[data-testid=row]")).to_have_count(1)
        assert grid_rows(page) == [["secret data"]]
        assert page.errors == []
    finally:
        server.shutdown()
