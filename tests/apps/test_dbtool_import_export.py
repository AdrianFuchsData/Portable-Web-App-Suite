"""Database tool: export results and whole tables (CSV, XLSX, JSON), import CSV and XLSX into new and existing tables."""
import csv
import datetime
import io
import json
import re
import sqlite3

import openpyxl
from playwright.sync_api import expect

from test_dbtool import NO_PICKERS, connect_dialog, grid_rows, make_db, open_db, pg, run, save_download  # noqa: F401 (fixture)


def download(page, selector, tmp_path):
    with page.expect_download() as d:
        page.click(selector)
    path = tmp_path / d.value.suggested_filename
    d.value.save_as(path)
    return path


def choose_import(page, path):
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=import-data]")
    chooser.value.set_files(str(path))
    expect(page.locator("[data-testid=import-dialog]")).to_be_visible()


def test_export(app_page, tmp_path):
    page = app_page("dbtool", init_script=NO_PICKERS)
    open_db(page, make_db(tmp_path / "demo.sqlite"))
    run(page, "SELECT name, age FROM people ORDER BY id;")
    expect(page.locator("[data-testid=row]")).to_have_count(3)
    wb = openpyxl.load_workbook(download(page, "[data-testid=export-xlsx]", tmp_path))
    ws = wb.active
    assert [[c.value for c in r] for r in ws.iter_rows()] == [["name", "age"], ["Anna", 31], ["Ben", None], ["Cleo", 45]]
    assert ws["A1"].font.b and ws.freeze_panes == "A2"
    # a browsed table: all rows, not only the loaded page
    con = sqlite3.connect(tmp_path / "big.sqlite")
    con.executescript("CREATE TABLE n (id INTEGER PRIMARY KEY, v TEXT); " + "".join(f"INSERT INTO n (v) VALUES ('row {i}');" for i in range(450)))
    con.commit()
    con.close()
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=open-sqlite]")
    chooser.value.set_files(str(tmp_path / "big.sqlite"))
    table = page.locator("[data-testid=table]").filter(has=page.locator("[data-testid=table-name]", has_text=re.compile(r"^\s*n$")))
    table.locator("[data-testid=table-name]").click()
    table.locator("[data-testid=browse]").click()
    expect(page.locator("[data-testid=row]")).to_have_count(200)
    path = download(page, "[data-testid=export-csv]", tmp_path)
    rows = list(csv.reader(io.StringIO(path.read_text(encoding="utf-8-sig"), newline="")))
    assert path.name == "n.csv" and len(rows) == 451 and rows[0] == ["id", "v"] and rows[450] == ["450", "row 449"]
    data = json.loads(download(page, "[data-testid=export-json]", tmp_path).read_text())
    assert len(data) == 450 and data[0] == {"id": 1, "v": "row 0"}
    assert page.errors == []


def test_import_csv_and_xlsx(app_page, tmp_path):
    page = app_page("dbtool", init_script=NO_PICKERS)
    open_db(page, make_db(tmp_path / "demo.sqlite"))
    # a CSV (semicolons) into a new table: types from the values, empty cells become NULL
    src = tmp_path / "Produkte 2026.csv"
    src.write_text('sku;name;price;stock\nA-1;"Tee, grün";4.5;10\nB-2;Kaffee;12;\nC-3;"Zucker ""fein""";1.25;200\n', encoding="utf-8")
    choose_import(page, src)
    expect(page.locator("[data-testid=import-name]")).to_have_value("Produkte_2026")
    expect(page.locator("[data-testid=import-preview] th")).to_have_text(["skuTEXT", "nameTEXT", "priceREAL", "stockINTEGER"])
    expect(page.locator("[data-testid=import-preview] tbody tr")).to_have_count(3)
    page.fill("[data-testid=import-name]", "products")
    page.click("[data-testid=import-ok]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("3 rows imported into “products”")
    expect(page.locator("[data-testid=row]")).to_have_count(3)
    # an Excel file into an existing table: columns matched by name, others left out
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Name", "Age", "Hobby"])
    ws.append(["Dora", 28, "Chess"])
    ws.append(["Emil", None, "Golf"])
    ws.append(["Fritz", 52.0, None])
    ws2 = wb.create_sheet("Second")
    ws2.append(["ignored"])
    xlsx = tmp_path / "people.xlsx"
    wb.save(xlsx)
    choose_import(page, xlsx)
    page.click("[data-testid=import-existing]")
    page.select_option("[data-testid=import-table]", "people")
    expect(page.locator("[data-testid=import-unknown]")).to_contain_text("Hobby")
    expect(page.locator("[data-testid=import-preview] th")).to_have_text(["name", "age"])
    page.click("[data-testid=import-ok]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("3 rows imported into “people”")
    # an Excel date cell and no header row into a new table
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["2026-10-16", datetime.date(2026, 10, 17), 3])
    xlsx2 = tmp_path / "dates.xlsx"
    wb.save(xlsx2)
    choose_import(page, xlsx2)
    page.click("[data-testid=import-header]")
    page.click("[data-testid=import-ok]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("1 rows imported into “dates”")
    con = sqlite3.connect(save_download(page, tmp_path))
    assert con.execute("SELECT sku, name, price, stock, typeof(price), typeof(stock) FROM products ORDER BY sku").fetchall() == [
        ("A-1", "Tee, grün", 4.5, 10, "real", "integer"), ("B-2", "Kaffee", 12.0, None, "real", "null"), ("C-3", 'Zucker "fein"', 1.25, 200, "real", "integer")]
    assert con.execute("SELECT name, age FROM people WHERE id > 3 ORDER BY id").fetchall() == [("Dora", 28), ("Emil", None), ("Fritz", 52)]
    assert con.execute("SELECT * FROM dates").fetchall() == [("2026-10-16", "2026-10-17", 3)]
    # undo removes the last import
    page.click("[data-testid=undo]")
    expect(page.locator("[data-testid=table-name]", has_text="dates")).to_have_count(0)
    assert page.errors == []


def test_import_postgres(app_page, relay, pg, tmp_path):  # noqa: F811
    fake, port = pg
    page = app_page("dbtool", init_script=NO_PICKERS)
    connect_dialog(page, relay, port)
    page.click("[data-testid=pg-connect]")
    expect(page.locator("[data-testid=session]")).to_contain_text("Test server")
    src = tmp_path / "towns.csv"
    src.write_text("name,population\nLinz,210000\nSalzburg,155000\n", encoding="utf-8")
    choose_import(page, src)
    expect(page.locator("[data-testid=import-preview] th")).to_have_text(["nametext", "populationbigint"])
    page.click("[data-testid=import-ok]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("2 rows imported into “towns”")
    assert fake.db.execute("SELECT name, population FROM towns ORDER BY name").fetchall() == [("Linz", 210000), ("Salzburg", 155000)]
    assert any(q.startswith('CREATE TABLE "public"."towns" ("name" text, "population" bigint)') for q in fake.queries)
    assert page.errors == []
