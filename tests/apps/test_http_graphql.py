"""HTTP analyzer: GraphQL – query and variables as JSON body, the schema explorer (introspection), Postman round trip."""
import json

import pytest
from playwright.sync_api import expect

from helpers.graphql_server import graphql_server
from test_http import NO_PICKERS, response_json, set_url, setup


@pytest.fixture
def gql():
    s = graphql_server()
    yield f"http://127.0.0.1:{s.server_address[1]}/graphql"
    s.shutdown()


def test_graphql(app_page, relay, gql, tmp_path):
    page = app_page("http", init_script=NO_PICKERS)
    setup(page, relay)
    set_url(page, gql, "POST")
    page.click("[data-testid=tab-body]")
    page.click("[data-testid=body-graphql]")
    # the schema: roots, arguments, nested types; a click inserts the field at the cursor
    page.click("[data-testid=gql-load-schema]")
    schema = page.locator("[data-testid=gql-schema]")
    expect(schema).to_contain_text("Query")
    expect(schema).to_contain_text("book(id: ID!): Book")
    expect(schema).to_contain_text("books: [Book]!")
    expect(schema).to_contain_text("addBook")
    schema.locator("[data-testid=gql-field]", has_text="book(id").locator("button").first.click()
    expect(schema).to_contain_text("author: Author")
    page.fill("[data-testid=gql-query]", "query GetBook($id: ID!) {\n  ")
    page.locator("[data-testid=gql-query]").press("End")
    schema.locator("[data-testid=gql-field] a", has_text="book").first.click()
    expect(page.locator("[data-testid=gql-query]")).to_have_value("query GetBook($id: ID!) {\n  book(id: )")
    page.fill("[data-testid=gql-query]", "query GetBook($id: ID!) { book(id: $id) { title author { name } } }")
    page.fill("[data-testid=gql-variables]", '{"id": "{{bookId}}"}')
    page.evaluate("() => { HTTP.state.collection.variables.push({ key: 'bookId', value: '42', enabled: true }); }")
    page.click("[data-testid=send]")
    echo = response_json(page)["data"]["echo"]
    assert echo["query"].startswith("query GetBook") and echo["variables"] == {"id": "42"} and echo["operationName"] == "GetBook"
    assert echo["contentType"] == "application/json"
    # invalid variables: a clear error
    page.click("[data-testid=tab-body]")
    page.fill("[data-testid=gql-variables]", "{nope")
    page.click("[data-testid=send]")
    expect(page.locator("[data-testid=response-error]")).to_contain_text("GraphQL variables")
    page.fill("[data-testid=gql-variables]", "")
    # Postman: saved as mode "graphql" and read back
    with page.expect_download() as d:
        page.click("[data-testid=save]")
    saved = json.loads(open(d.value.path(), encoding="utf-8").read())
    body = saved["item"][0]["request"]["body"]
    assert body["mode"] == "graphql" and body["graphql"]["query"].startswith("query GetBook")
    path = tmp_path / "again.json"
    path.write_text(json.dumps(saved))
    page.evaluate("HTTP.state.dirty = false")
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=open]")
    chooser.value.set_files(str(path))
    page.locator("[data-testid=tree-request] a").first.click()
    page.click("[data-testid=tab-body]")
    expect(page.locator("[data-testid=body-graphql]")).to_be_checked()
    expect(page.locator("[data-testid=gql-query]")).to_have_value("query GetBook($id: ID!) { book(id: $id) { title author { name } } }")
    assert page.errors == []
