"""HTTP analyzer (apps/http) against the echo test server (helpers/relay_servers.http_server), through the relays and directly."""
import json
import re

from playwright.sync_api import expect

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"


def setup(page, relay=None):
    if relay:
        page.evaluate("r => { HTTP.data.relay = r; }", {"url": relay["url"], "token": relay["token"]})
    page.select_option("[data-testid=via]", "relay" if relay else "direct")


def set_url(page, url, method="GET"):
    page.select_option("[data-testid=method]", method)
    page.fill("[data-testid=url]", url)


def response_json(page):
    expect(page.locator("[data-testid=status]")).to_be_visible(timeout=20000)
    page.click("[data-testid=view-raw]")
    return json.loads(page.evaluate("document.querySelector('[data-testid=response-body] .cm-content').innerText"))


def test_get_with_params_headers_and_auth(app_page, relay, http_target):
    page = app_page("http", init_script=NO_PICKERS)
    assert page.title() == "HTTP analyzer"
    setup(page, relay)
    set_url(page, f"{http_target}/items?page=1")
    page.click("[data-testid=tab-params]")
    expect(page.locator("[data-testid=params] [data-testid=row-key]").first).to_have_value("page")
    page.locator("[data-testid=params] [data-testid=row-key]").last.fill("q")
    page.locator("[data-testid=params] [data-testid=row-value]").nth(1).fill("a b")  # the row just created
    expect(page.locator("[data-testid=url]")).to_have_value(f"{http_target}/items?page=1&q=a%20b")
    page.click("[data-testid=tab-headers]")
    page.locator("[data-testid=headers] [data-testid=row-key]").last.fill("X-Test")
    page.locator("[data-testid=headers] [data-testid=row-value]").nth(0).fill("yes")
    page.click("[data-testid=tab-auth]")
    page.select_option("[data-testid=auth-type]", "basic")
    page.fill("[data-testid=auth-user]", "anna")
    page.fill("[data-testid=auth-password]", "pw")
    page.click("[data-testid=send]")
    body = response_json(page)
    expect(page.locator("[data-testid=status]")).to_have_text("200 OK")
    assert body["method"] == "GET" and body["path"] == "/items?page=1&q=a%20b"
    assert body["headers"]["X-Test"] == "yes" and body["headers"]["Authorization"] == "Basic YW5uYTpwdw=="
    page.click("[data-testid=rtab-headers]")
    expect(page.locator("[data-testid=response-headers]")).to_contain_text("session=abc; HttpOnly")  # all headers through the relay
    assert page.errors == []


def test_post_bodies_and_variables(app_page, relay, http_target):
    page = app_page("http", init_script=NO_PICKERS)
    setup(page, relay)
    page.click("[data-testid=manage-environments]")
    page.click("[data-testid=add-env]")
    page.locator("[data-testid=env-vars] [data-testid=row-key]").last.fill("base")
    page.locator("[data-testid=env-vars] [data-testid=row-value]").nth(0).fill(http_target)
    page.click("[data-testid=env-close]")
    page.select_option("[data-testid=environment]", index=1)

    set_url(page, "{{base}}/create", "POST")
    page.click("[data-testid=tab-body]")
    page.check("[data-testid=body-raw]")
    page.locator("[data-testid=body-editor] .cm-content").click()
    page.keyboard.type('{"name": "Anna"')
    page.click("[data-testid=send]")
    body = response_json(page)
    assert body["path"] == "/create" and body["method"] == "POST"
    assert body["body"].startswith('{"name": "Anna"') and body["headers"]["Content-Type"] == "application/json"

    page.check("[data-testid=body-urlencoded]")
    page.locator("[data-testid=fields] [data-testid=row-key]").last.fill("city")
    page.locator("[data-testid=fields] [data-testid=row-value]").nth(0).fill("Wien Mitte")
    page.click("[data-testid=send]")
    page.wait_for_timeout(300)
    body = response_json(page)
    assert body["body"] == "city=Wien+Mitte" and body["headers"]["Content-Type"] == "application/x-www-form-urlencoded"

    page.check("[data-testid=body-formdata]")
    page.click("[data-testid=send]")
    page.wait_for_timeout(300)
    body = response_json(page)
    assert body["headers"]["Content-Type"].startswith("multipart/form-data; boundary=")
    assert 'name="city"' in body["body"] and "Wien Mitte" in body["body"]


def test_status_redirect_and_history(app_page, relay, http_target):
    page = app_page("http", init_script=NO_PICKERS)
    setup(page, relay)
    set_url(page, f"{http_target}/missing")
    page.click("[data-testid=send]")
    expect(page.locator("[data-testid=status]")).to_have_text(re.compile("^404"), timeout=20000)
    expect(page.locator("[data-testid=status]")).to_have_class(re.compile(r"\bwarn\b"))
    set_url(page, f"{http_target}/redirect")
    page.click("[data-testid=send]")
    body = response_json(page)
    assert body["path"] == "/target"  # redirects are followed
    expect(page.locator("[data-testid=history-item]")).to_have_count(2)


def test_direct_mode_and_cors_error(app_page, http_target):
    page = app_page("http", init_script=NO_PICKERS)
    setup(page, None)
    set_url(page, f"{http_target}/cors/data")
    page.click("[data-testid=send]")
    body = response_json(page)
    assert body["path"] == "/cors/data"
    set_url(page, f"{http_target}/no-cors")
    page.click("[data-testid=send]")
    expect(page.locator("[data-testid=response-error]")).to_contain_text("CORS", timeout=20000)


def test_curl_import_and_export(app_page, relay, http_target):
    page = app_page("http", init_script=NO_PICKERS)
    setup(page, relay)
    page.click("[data-testid=import-curl]")
    page.fill("[data-testid=curl-input]", f"curl '{http_target}/api' -X PUT \\\n  -H 'Content-Type: application/json' \\\n  --data-raw '{{\"a\": 1}}' -u bob:secret")
    page.click("[data-testid=curl-import]")
    expect(page.locator("[data-testid=method]")).to_have_value("PUT")
    expect(page.locator("[data-testid=tree-request].active")).to_contain_text("PUT /api")
    page.click("[data-testid=send]")
    body = response_json(page)
    assert body["method"] == "PUT" and body["body"] == '{"a": 1}' and body["headers"]["Authorization"] == "Basic Ym9iOnNlY3JldA=="
    page.click("[data-testid=show-curl]")
    out = page.locator("[data-testid=curl-output]").text_content()
    assert out.startswith(f"curl -X PUT '{http_target}/api' \\\n  -H 'Content-Type: application/json'")
    assert "--data-binary '{\"a\": 1}'" in out and "Authorization: Basic Ym9iOnNlY3JldA==" in out


def test_collections_postman_round_trip(app_page, tmp_path):
    collection = {
        "info": {"name": "Demo API", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"},
        "item": [
            {"name": "Users", "item": [
                {"name": "List users", "request": {"method": "GET", "header": [{"key": "Accept", "value": "application/json"}], "url": {"raw": "{{base}}/users?limit=10"}}},
                {"name": "Create user", "request": {"method": "POST", "header": [], "url": "{{base}}/users",
                                                    "body": {"mode": "raw", "raw": "{\"name\":\"x\"}", "options": {"raw": {"language": "json"}}},
                                                    "auth": {"type": "bearer", "bearer": [{"key": "token", "value": "{{token}}"}]}}},
            ]},
            {"name": "Login", "event": [{"listen": "test", "script": {"type": "text/javascript", "exec": ["pm.test('ok', () => pm.response.to.be.ok);", "pm.environment.set('t', pm.response.json().token);"]}},
                                         {"listen": "prerequest", "script": {"exec": "console.log(1)"}}],
             "request": {"method": "POST", "url": "{{base}}/login", "body": {"mode": "urlencoded", "urlencoded": [{"key": "user", "value": "anna"}]}}},
        ],
        "variable": [{"key": "base", "value": "http://localhost:9999"}],
    }
    path = tmp_path / "demo.postman_collection.json"
    path.write_text(json.dumps(collection))
    page = app_page("http", init_script=NO_PICKERS)
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=open]")
    chooser.value.set_files(str(path))
    expect(page.locator("[data-testid=collection-name]")).to_have_text("Demo API")
    expect(page.locator("[data-testid=tree-request]")).to_have_count(3)
    page.locator("[data-testid=tree-request]", has_text="Create user").locator("a").click()
    expect(page.locator("[data-testid=method]")).to_have_value("POST")
    page.click("[data-testid=tab-auth]")
    expect(page.locator("[data-testid=auth-token]")).to_have_value("{{token}}")
    login = page.locator("[data-testid=tree-request]", has_text="Login")
    login.hover()  # the actions appear on hover (or keyboard focus)
    login.locator("[data-testid=rename-request]").click()
    page.fill("[data-testid=name-input]", "Sign in")
    page.click("[data-testid=name-ok]")
    with page.expect_download() as d:
        page.click("[data-testid=save]")
    saved = json.load(open(d.value.path()))
    assert d.value.suggested_filename == "demo.postman_collection.json"
    assert saved["info"]["name"] == "Demo API" and saved["variable"] == [{"key": "base", "value": "http://localhost:9999"}]
    users = saved["item"][0]
    assert users["name"] == "Users" and users["item"][0]["request"]["url"]["raw"] == "{{base}}/users?limit=10"
    assert users["item"][1]["request"]["auth"] == {"type": "bearer", "bearer": [{"key": "token", "value": "{{token}}", "type": "string"}]}
    assert saved["item"][1]["name"] == "Sign in" and saved["item"][1]["request"]["body"]["urlencoded"][0]["value"] == "anna"
    events = {e["listen"]: e["script"]["exec"] for e in saved["item"][1]["event"]}
    assert events == {"prerequest": ["console.log(1)"], "test": ["pm.test('ok', () => pm.response.to.be.ok);", "pm.environment.set('t', pm.response.json().token);"]}
    assert "event" not in users["item"][0]


def test_undo_redo_collection(app_page):
    page = app_page("http")
    expect(page.locator("[data-testid=undo]")).to_be_disabled()
    page.fill("[data-testid=url]", "https://api.example.org/a")  # one step
    page.select_option("[data-testid=method]", "PUT")
    expect(page.locator("[data-testid=undo]")).to_be_enabled()
    assert page.evaluate("HTTP.history.undoStack.length") == 2
    page.locator("body").click(position={"x": 1, "y": 1})
    page.keyboard.press("Control+z")
    expect(page.locator("[data-testid=method]")).to_have_value("GET")
    expect(page.locator("[data-testid=url]")).to_have_value("https://api.example.org/a")
    page.click("[data-testid=undo]")
    expect(page.locator("[data-testid=url]")).to_have_value("https://example.org/")
    expect(page.locator("[data-testid=undo]")).to_be_disabled()
    page.click("[data-testid=redo]")
    page.click("[data-testid=redo]")
    expect(page.locator("[data-testid=method]")).to_have_value("PUT")
    expect(page.locator("[data-testid=redo]")).to_be_disabled()
    assert page.errors == []


def test_german_interface(app_page):
    page = app_page("http", init_script="localStorage.setItem('suite.lang', 'de');")
    expect(page.locator("[data-testid=send]")).to_have_text("Senden")


def test_mobile_layout(app_page, relay, http_target):
    page = app_page("http", mobile=True, init_script=NO_PICKERS)
    setup(page, relay)
    set_url(page, f"{http_target}/m")
    page.click("[data-testid=send]")
    expect(page.locator("[data-testid=status]")).to_have_text("200 OK", timeout=20000)
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert page.errors == []


PRE = """pm.environment.set('token', 'abc' + 1);
pm.variables.set('page', 7);
pm.request.headers.add({ key: 'X-Pre', value: 'from-script' });
console.log('pre', pm.request.method);"""

TESTS = """const body = pm.response.json();
pm.test('status is 200', () => pm.response.to.have.status(200));
pm.test('the header arrived', () => pm.expect(body.headers['X-Pre']).to.equal('from-script'));
pm.test('variables resolved', () => { pm.expect(body.path).to.include('page=7'); pm.expect(body.headers['X-Token']).to.eql('abc1'); });
pm.test('fails on purpose', () => pm.expect(body.method).to.be.oneOf(['PUT']));
pm.collectionVariables.set('seen', body.method);
console.warn('done');"""


def test_scripts_and_tests(app_page, http_target):
    page = app_page("http", init_script=NO_PICKERS)
    setup(page, None)
    page.click("[data-testid=manage-environments]")
    page.click("[data-testid=add-env]")
    page.click("[data-testid=env-close]")
    page.select_option("[data-testid=environment]", index=1)
    set_url(page, f"{http_target}/cors/data?page={{{{page}}}}")
    page.click("[data-testid=tab-headers]")
    page.locator("[data-testid=headers] [data-testid=row-key]").last.fill("X-Token")
    page.locator("[data-testid=headers] [data-testid=row-value]").nth(0).fill("{{token}}")
    page.click("[data-testid=tab-scripts]")
    page.locator("[data-testid=prerequest-editor] .cm-content").fill(PRE)
    page.locator("[data-testid=tests-editor] .cm-content").fill(TESTS)
    expect(page.locator("[data-testid=tab-scripts]")).to_contain_text("(2)")
    page.click("[data-testid=send]")
    expect(page.locator("[data-testid=tests-summary]")).to_have_text("3 of 4 tests passed", timeout=20000)
    results = page.locator("[data-testid=test-result]")
    expect(results).to_have_count(4)
    expect(results.nth(3)).to_contain_text("fails on purpose")
    expect(results.nth(3)).to_contain_text("to be one of")
    expect(page.locator("[data-testid=script-console]")).to_have_text("pre GET\n[warn] done")
    # variables written by the scripts
    env = page.evaluate("HTTP.data.settings.environments[0].variables")
    assert {"key": "token", "value": "abc1", "enabled": True} in env
    assert page.evaluate("HTTP.state.collection.variables.find((v) => v.key === 'seen').value") == "GET"
    # errors, endless loops and the sandbox
    page.locator("[data-testid=tests-editor] .cm-content").fill("pm.test('no storage', () => pm.expect(typeof indexedDB === 'undefined' || typeof localStorage === 'undefined').to.be.true); while (true) {}")
    page.locator("[data-testid=prerequest-editor] .cm-content").fill("")
    page.click("[data-testid=send]")
    expect(page.locator("[data-testid=script-error]")).to_contain_text("did not finish", timeout=20000)
    page.locator("[data-testid=tests-editor] .cm-content").fill("pm.test('x', () => {}); syntax error here")
    page.click("[data-testid=send]")
    expect(page.locator("[data-testid=script-error]")).to_be_visible(timeout=20000)
    page.locator("[data-testid=tests-editor] .cm-content").fill("pm.test('sandboxed', () => { pm.expect(typeof localStorage).to.equal('undefined'); pm.expect(typeof document).to.equal('undefined'); pm.expect(typeof Suite).to.equal('undefined'); });")
    page.click("[data-testid=send]")
    expect(page.locator("[data-testid=tests-summary]")).to_have_text("1 of 1 tests passed", timeout=20000)
    assert not [e for e in page.errors if "SyntaxError" not in e]



OPENAPI = """openapi: 3.0.3
info: {title: Pet Store, version: '1.0'}
servers:
  - url: https://{env}.example.org/v1
    variables: {env: {default: api}}
security: [{bearer: []}]
components:
  securitySchemes:
    bearer: {type: http, scheme: bearer}
    key: {type: apiKey, in: header, name: X-Api-Key}
  schemas:
    Pet:
      type: object
      required: [name]
      properties:
        id: {type: integer, format: int64}
        name: {type: string, example: Rex}
        tags: {type: array, items: {type: string}}
        owner: {$ref: '#/components/schemas/Owner'}
    Owner:
      type: object
      properties:
        email: {type: string, format: email}
        pets: {type: array, items: {$ref: '#/components/schemas/Pet'}}
paths:
  /pets:
    get:
      tags: [pets]
      summary: List pets
      parameters:
        - {name: limit, in: query, required: true, schema: {type: integer, default: 20}}
        - {name: sort, in: query, schema: {type: string}}
    post:
      tags: [pets]
      summary: Create a pet
      requestBody:
        content:
          application/json:
            schema: {$ref: '#/components/schemas/Pet'}
  /pets/{petId}:
    parameters:
      - {name: petId, in: path, required: true, schema: {type: string}}
    delete:
      tags: [pets]
      operationId: deletePet
      security: [{key: []}]
  /health:
    get:
      summary: Health
      security: []
"""


def test_openapi_import(app_page, tmp_path):
    path = tmp_path / "petstore.yaml"
    path.write_text(OPENAPI)
    page = app_page("http", init_script=NO_PICKERS)
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=open]")
    chooser.value.set_files(str(path))
    expect(page.locator("[data-testid=collection-name]")).to_have_text("Pet Store")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("4 requests created")
    c = page.evaluate("HTTP.state.collection")
    assert [i["name"] for i in c["items"]] == ["pets", "Health"]
    pets = {r["name"]: r for r in c["items"][0]["items"]}
    assert pets["List pets"]["url"] == "{{baseUrl}}/pets?limit=20" and pets["List pets"]["method"] == "GET"
    assert pets["List pets"]["auth"]["type"] == "bearer" and pets["List pets"]["auth"]["token"] == "{{token}}"
    body = json.loads(pets["Create a pet"]["body"]["raw"])
    assert body["name"] == "Rex" and body["id"] == 0 and body["tags"] == ["string"] and body["owner"]["email"] == "user@example.org"
    assert body["owner"]["pets"] == [{}]  # recursion stops
    assert pets["deletePet"]["url"] == "{{baseUrl}}/pets/{{petId}}" and pets["deletePet"]["method"] == "DELETE"
    assert {"key": "X-Api-Key", "value": "{{X-Api-Key}}", "enabled": True} in pets["deletePet"]["headers"]
    assert c["items"][1]["auth"]["type"] == "none"
    assert c["variables"][:2] == [{"key": "baseUrl", "value": "https://api.example.org/v1", "enabled": True}, {"key": "petId", "value": "", "enabled": True}]
    # saving writes a Postman collection
    with page.expect_download() as d:
        page.click("[data-testid=save]")
    assert d.value.suggested_filename == "Pet Store.postman_collection.json"
    assert json.load(open(d.value.path()))["item"][0]["name"] == "pets"
    assert page.errors == []


def test_websocket(app_page):
    from helpers import ws_echo
    port, stop = ws_echo.start()
    try:
        page = app_page("http", init_script=NO_PICKERS)
        page.fill("[data-testid=url]", f"ws://127.0.0.1:{port}/chat")
        expect(page.locator("[data-testid=send]")).to_have_text("Connect")
        page.click("[data-testid=tab-headers]")
        page.locator("[data-testid=headers] [data-testid=row-key]").last.fill("Sec-WebSocket-Protocol")
        page.locator("[data-testid=headers] [data-testid=row-value]").nth(0).fill("chat.v1")
        page.click("[data-testid=send]")
        messages = page.locator("[data-testid=ws-message]")
        expect(page.locator("[data-testid=ws-message][data-dir=in]").first).to_contain_text("hello (chat.v1)")
        expect(messages.filter(has_text="Connected (chat.v1)")).to_have_count(1)
        expect(page.locator("[data-testid=send]")).to_have_text("Disconnect")
        page.fill("[data-testid=ws-input]", '{"msg": "hi"}')
        page.press("[data-testid=ws-input]", "Control+Enter")
        expect(page.locator("[data-testid=ws-message][data-dir=out]")).to_have_text([re.compile(r'\{"msg": "hi"\}')])
        expect(page.locator("[data-testid=ws-message][data-dir=in]")).to_have_count(2)
        expect(page.locator("[data-testid=ws-message][data-dir=in]").last).to_contain_text('{"msg": "hi"}')
        # the server closes with a code and a reason
        page.fill("[data-testid=ws-input]", "close")
        page.click("[data-testid=ws-send]")
        expect(messages.last).to_contain_text("Disconnected (code 4000: bye)")
        expect(page.locator("[data-testid=send]")).to_have_text("Connect")
        expect(page.locator("[data-testid=ws-input]")).to_be_disabled()
        # reconnect and disconnect from the client side
        page.click("[data-testid=send]")
        expect(page.locator("[data-testid=send]")).to_have_text("Disconnect")
        page.click("[data-testid=send]")
        expect(messages.last).to_contain_text("Disconnected (code 1000")
        page.click("[data-testid=ws-clear]")
        expect(messages).to_have_count(0)
        assert page.errors == []
    finally:
        stop()
