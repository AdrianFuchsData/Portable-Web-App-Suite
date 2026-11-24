"""HTTP analyzer: collection runner – folders, iterations, data files (CSV/JSON), scripts passing values on, results, export."""
import json

from playwright.sync_api import expect

from test_http import NO_PICKERS, setup


def collection(base):
    return {
        "info": {"name": "Shop", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"},
        "item": [
            {"name": "Orders", "item": [
                {"name": "Create order", "event": [{"listen": "test", "script": {"exec": [
                    "pm.test('created', () => pm.response.to.have.status(200));",
                    "pm.test('has the customer', () => pm.expect(pm.response.json().body).to.include(pm.iterationData.get('customer')));",
                    "pm.collectionVariables.set('last', pm.iterationData.get('customer') + '-' + pm.info.iteration);"]}}],
                 "request": {"method": "POST", "url": "{{base}}/orders", "body": {"mode": "raw", "raw": "{\"customer\": \"{{customer}}\"}", "options": {"raw": {"language": "json"}}}}},
                {"name": "Read order", "event": [{"listen": "test", "script": {"exec": [
                    "pm.test('path has the last order', () => pm.expect(pm.response.json().path).to.equal('/orders/' + pm.collectionVariables.get('last')));"]}}],
                 "request": {"method": "GET", "url": "{{base}}/orders/{{last}}"}},
            ]},
            {"name": "Broken", "request": {"method": "GET", "url": "{{base}}/missing"}},
        ],
        "variable": [{"key": "base", "value": base}, {"key": "last", "value": ""}],
    }


def open_collection(page, path):
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=open]")
    chooser.value.set_files(str(path))
    expect(page.locator("[data-testid=collection-name]")).to_have_text("Shop") if page.locator("[data-testid=collection-name]").count() else None


def test_runner(app_page, relay, http_target, tmp_path):
    path = tmp_path / "shop.postman_collection.json"
    path.write_text(json.dumps(collection(http_target)))
    page = app_page("http", init_script=NO_PICKERS)
    setup(page, relay)
    open_collection(page, path)
    # one folder, a CSV data file: two iterations
    data = tmp_path / "customers.csv"
    data.write_text("customer\nanna\nbob\n", encoding="utf-8")
    page.click("[data-testid=runner]")
    page.select_option("[data-testid=run-folder]", label="Orders (2)")
    page.locator("[data-testid=run-data]").set_input_files(str(data))
    expect(page.locator("[data-testid=run-iterations]")).to_have_value("2")
    page.click("[data-testid=run-start]")
    expect(page.locator("[data-testid=run-summary]")).to_contain_text("4 requests in", timeout=30000)
    expect(page.locator("[data-testid=run-summary]")).to_contain_text("6 tests passed, 0 failed")
    rows = page.locator("[data-testid=run-row]")
    expect(rows).to_have_count(4)
    expect(rows.nth(3)).to_contain_text("path has the last order")
    # the variable set by the script stays in the collection
    assert page.evaluate("HTTP.state.collection.variables.find((v) => v.key === 'last').value") == "bob-1"
    with page.expect_download() as d:
        page.click("[data-testid=run-export]")
    report = json.loads(open(d.value.path(), encoding="utf-8").read())
    assert [r["name"] for r in report["results"]] == ["Create order", "Read order"] * 2 and report["results"][2]["url"].endswith("/orders")
    # the whole collection, 1 iteration, a JSON data row; stop at the failure
    page.click("[data-testid=run-again]")
    page.select_option("[data-testid=run-folder]", "")
    json_data = tmp_path / "rows.json"
    json_data.write_text(json.dumps([{"customer": "cleo"}, {"customer": "dora"}]))
    page.locator("[data-testid=run-data]").set_input_files(str(json_data))
    page.check("[data-testid=run-stop]")
    page.click("[data-testid=run-start]")
    expect(page.locator("[data-testid=run-summary]")).to_contain_text("3 requests in", timeout=30000)  # stopped after "Broken"
    expect(page.locator("[data-testid=run-summary]")).to_contain_text("1 requests failed")
    expect(rows.nth(2)).to_contain_text("404")
    assert page.errors == []
