"""Web inspector (apps/webinspector): a small test site, loaded through the relay or directly, HAR files and the bookmarklet."""
import base64
import http.server
import json
import threading
import urllib.parse

import pytest
from playwright.sync_api import expect

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==")
INDEX = """<!doctype html>
<html><head><meta charset="utf-8"><title>Testseite Ä</title>
<meta name="description" content="Eine Seite zum Testen">
<link rel="stylesheet" href="/style.css">
<script>document.title = 'changed by script';</script>
</head><body>
<h1 id="main">Willkommen</h1>
<h3>Übersprungen</h3>
<img src="/logo.png">
<p onclick="alert(1)">Text with <a href="/page2.html">second page</a> and <a href="https://example.com/x">external</a>.</p>
<form action="/send" method="post"><input name="q"></form>
</body></html>"""
PAGE2 = """<!doctype html><html lang="en"><head><title>Second</title><meta name="viewport" content="width=device-width"></head>
<body><h1>Second page</h1><img src="/logo.png" alt="Logo"><a href="/index.html">back</a></body></html>"""
CSS = "h1 { color: rgb(200, 0, 0); } body { background: url('/bg.png') repeat; }"


class Site(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/whoami.html":
            body = f"<!doctype html><h1>{self.headers.get('Cookie') or 'none'}</h1>".encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        routes = {
            "/": ("text/html; charset=utf-8", INDEX.encode(), [("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'"), ("Set-Cookie", "session=abc; Path=/"), ("Server", "TestServer/1.2.3")]),
            "/index.html": ("text/html; charset=utf-8", INDEX.encode(), []),
            "/page2.html": ("text/html; charset=utf-8", PAGE2.encode(), [("X-Frame-Options", "DENY"), ("X-Content-Type-Options", "nosniff")]),
            "/style.css": ("text/css", CSS.encode(), []),
            "/logo.png": ("image/png", PNG, []),
            "/bg.png": ("image/png", PNG, []),
            "/cookies.html": ("text/html", PAGE2.encode(), [("Set-Cookie", "a=1; Path=/; HttpOnly; SameSite=Lax"), ("Set-Cookie", "b=2; Max-Age=3600; Secure"), ("Set-Cookie", "c=3; Domain=other.example")]),
            "/cors.html": ("text/html", PAGE2.encode(), [("Access-Control-Allow-Origin", "*")]),
        }
        if path not in routes:
            self.send_response(404)
            self.end_headers()
            return
        ctype, body, extra = routes[path]
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in extra:
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)


@pytest.fixture
def site():
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Site)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


def ready(app_page, **kw):
    return app_page("webinspector", init_script=NO_PICKERS + kw.pop("init_script", ""), **kw)


def set_relay(page, relay):
    page.locator(".wi-relay summary").click()
    page.fill("[data-testid=relay-url]", relay["url"])
    page.locator("[data-testid=relay-url]").blur()
    page.fill("[data-testid=relay-token]", relay["token"])
    page.locator("[data-testid=relay-token]").blur()
    page.locator(".wi-relay summary").click()


def test_relay_with_account_behind_reverse_proxy(app_page, proxied_relay, site):
    page = ready(app_page, ignore_https_errors=True)  # the test CA is not installed in the browser
    page.locator(".wi-relay summary").click()
    page.fill("[data-testid=relay-url]", proxied_relay["url"])
    page.locator("[data-testid=relay-url]").blur()
    page.select_option("[data-testid=relay-auth]", "password")
    expect(page.locator("[data-testid=relay-token]")).to_have_count(0)
    page.fill("[data-testid=relay-user]", proxied_relay["user"])
    page.locator("[data-testid=relay-user]").blur()
    page.fill("[data-testid=relay-password]", "wrong password")
    page.locator("[data-testid=relay-password]").blur()
    page.click("[data-testid=relay-test]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("Relay login failed: invalid user or password", timeout=20000)  # password hashing takes ~1 s
    page.fill("[data-testid=relay-password]", proxied_relay["password"])
    page.locator("[data-testid=relay-password]").blur()
    page.click("[data-testid=relay-test]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("logged in as anna", timeout=20000)
    page.locator(".wi-relay summary").click()
    load(page, site + "/")
    expect(page.locator("[data-testid=status]")).to_have_text("200 OK", timeout=20000)
    # an unencrypted address of another computer needs an explicit permission
    page.locator(".wi-relay summary").click()
    page.fill("[data-testid=relay-url]", "http://192.0.2.10:8765")
    page.locator("[data-testid=relay-url]").blur()
    expect(page.locator("[data-testid=relay-insecure]")).not_to_be_checked()
    page.locator(".wi-relay summary").click()
    load(page, site + "/")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("is not encrypted (http)")


def load(page, url):
    page.fill("[data-testid=url]", url)
    page.click("[data-testid=go]")


def test_load_through_relay(app_page, relay, site):
    page = ready(app_page)
    assert page.title() == "Web inspector"
    set_relay(page, relay)
    load(page, site + "/")
    expect(page.locator("[data-testid=status]")).to_have_text("200 OK")
    frame = page.frame_locator("[data-testid=preview-frame]")
    expect(frame.locator("h1")).to_have_text("Willkommen")
    expect(frame.locator("h1")).to_have_css("color", "rgb(200, 0, 0)")  # stylesheet inlined
    assert frame.locator("img").get_attribute("src").startswith("data:image/png;base64,")
    assert frame.locator("script").count() == 0 and frame.locator("[onclick]").count() == 0
    expect(page.locator("[data-testid=preview-note]")).to_contain_text("3 resources")
    # headers and security checks
    page.click("[data-testid=sub-headers]")
    checks = page.locator("[data-testid=check]")
    expect(checks.filter(has_text="Strict-Transport-Security")).to_have_attribute("data-status", "bad")  # plain HTTP
    expect(checks.filter(has_text="Content-Security-Policy")).to_have_attribute("data-status", "warn")  # 'unsafe-inline'
    expect(checks.filter(has_text="Set-Cookie: session")).to_contain_text("Secure, HttpOnly, SameSite")
    expect(checks.filter(has_text="Server")).to_contain_text("Reveals software versions")
    # structure and hints
    page.click("[data-testid=sub-structure]")
    expect(page.locator("[data-testid=page-title]")).to_have_text("Testseite Ä")
    hints = page.locator("[data-testid=hint]")
    for text in ("no lang attribute", "1 image(s) without alt", "No viewport", "h1 → h3", "1 form field(s) without a label"):
        expect(hints.filter(has_text=text)).to_have_count(1)
    expect(page.locator("[data-testid=links-summary]")).to_have_text("Links (2, 1 external)")
    # source
    page.click("[data-testid=sub-source]")
    page.fill("[data-testid=source-search]", "stylesheet")
    expect(page.locator("[data-testid=source] > div")).to_have_count(1)
    # requests and HAR
    page.click("[data-testid=sub-network]")
    expect(page.locator("[data-testid=request]")).to_have_count(4)
    with page.expect_download() as d:
        page.click("[data-testid=save-har]")
    har = json.loads(open(d.value.path(), encoding="utf-8").read())
    assert len(har["log"]["entries"]) == 4 and har["log"]["entries"][0]["response"]["status"] == 200
    assert har["log"]["entries"][0]["response"]["content"]["text"].startswith("<!doctype html>")
    page.click("[data-testid=open-in-har]")
    expect(page.locator("[data-testid=har-row]")).to_have_count(4)

    # navigation inside the preview
    page.click("[data-testid=tab-page]")
    page.click("[data-testid=sub-preview]")
    page.frame_locator("[data-testid=preview-frame]").locator("a", has_text="second page").click()
    expect(page.locator("[data-testid=summary]")).to_contain_text("/page2.html")
    expect(page.frame_locator("[data-testid=preview-frame]").locator("h1")).to_have_text("Second page")
    page.click("[data-testid=back]")
    expect(page.frame_locator("[data-testid=preview-frame]").locator("h1")).to_have_text("Willkommen")
    assert page.errors == []


def test_direct_and_paste_without_relay(app_page, site):
    page = ready(app_page)
    expect(page.locator("[data-testid=relay-hint]")).to_be_visible()
    load(page, site + "/cors.html")
    expect(page.locator("[data-testid=summary]")).to_contain_text("loaded directly")
    expect(page.frame_locator("[data-testid=preview-frame]").locator("h1")).to_have_text("Second page")
    expect(page.locator("[data-testid=preview-note]")).to_contain_text("only loaded through the relay")
    page.click("[data-testid=paste]")
    page.fill("[data-testid=paste-source]", "<html lang='de'><head><title>Eingefügt</title><meta name=viewport content=x></head><body><h1>A</h1><h2>B</h2></body></html>")
    page.click("[data-testid=paste-ok]")
    expect(page.locator("[data-testid=summary]")).to_contain_text("pasted")
    page.click("[data-testid=sub-structure]")
    expect(page.locator("[data-testid=page-title]")).to_have_text("Eingefügt")
    expect(page.locator("[data-testid=hints]")).to_have_count(0)  # no problems
    expect(page.locator("[data-testid=heading]")).to_have_count(2)


def test_har_viewer(app_page, tmp_path):
    entries = []
    for i, (url, mime, status, size, text, enc) in enumerate([
        ("https://example.org/", "text/html", 200, 5000, "<html><body>Hallo</body></html>", None),
        ("https://example.org/api/data?id=7&x=y", "application/json", 200, 120, '{"a":1,"b":[1,2]}', None),
        ("https://cdn.example.org/logo.png", "image/png", 200, 68, base64.b64encode(PNG).decode(), "base64"),
        ("https://example.org/missing.js", "application/javascript", 404, 30, "not found", None),
    ]):
        content = {"size": size, "mimeType": mime, "text": text}
        if enc:
            content["encoding"] = enc
        entries.append({
            "startedDateTime": f"2026-10-16T10:00:0{i}.000Z", "time": 100 + i * 50,
            "request": {"method": "POST" if "api" in url else "GET", "url": url, "httpVersion": "HTTP/2", "headers": [{"name": "Accept", "value": "*/*"}],
                        "queryString": [{"name": k, "value": v} for k, v in urllib.parse.parse_qsl(urllib.parse.urlparse(url).query)], "cookies": [],
                        "headersSize": -1, "bodySize": 0, **({"postData": {"mimeType": "application/json", "text": '{"q":"it\'s"}'}} if "api" in url else {})},
            "response": {"status": status, "statusText": "", "httpVersion": "HTTP/2", "headers": [{"name": "Content-Type", "value": mime}], "cookies": [],
                         "content": content, "redirectURL": "", "headersSize": -1, "bodySize": size},
            "cache": {}, "timings": {"blocked": 1, "dns": 5, "connect": 10, "ssl": 8, "send": 1, "wait": 60 + i, "receive": 15},
        })
    path = tmp_path / "trace.har"
    path.write_text(json.dumps({"log": {"version": "1.2", "creator": {"name": "test"}, "entries": entries}}))
    page = ready(app_page)
    page.click("[data-testid=tab-har]")
    expect(page.locator("[data-testid=no-har]")).to_be_visible()
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=open-har]")
    chooser.value.set_files(str(path))
    rows = page.locator("[data-testid=har-row]")
    expect(rows).to_have_count(4)
    expect(page.locator("[data-testid=har-totals]")).to_contain_text("4 requests")
    assert "error" in rows.nth(3).get_attribute("class")
    page.click("[data-testid=har-type-img]")
    expect(rows).to_have_count(1)
    page.click("[data-testid=har-type-all]")
    page.fill("[data-testid=har-filter]", "api")
    expect(rows).to_have_count(1)
    rows.first.click()
    page.click("[data-testid=har-body]")
    expect(page.locator("[data-testid=body-text]")).to_have_text('{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}')
    page.click("[data-testid=har-query]")
    expect(page.locator("[data-testid=har-detail]")).to_contain_text("id")
    expect(page.locator("[data-testid=post-data]")).to_have_text('{"q":"it\'s"}')
    page.click("[data-testid=har-timing]")
    expect(page.locator("[data-testid=timings] tr")).to_have_count(7)
    assert page.evaluate("(e) => WI.an.curl(e)", entries[1]) == "curl 'https://example.org/api/data?id=7&x=y' \\\n  -X POST \\\n  -H 'Accept: */*' \\\n  --data-raw '{\"q\":\"it'\\''s\"}'"
    page.fill("[data-testid=har-filter]", "")
    rows.nth(2).click()
    page.click("[data-testid=har-body]")
    expect(page.locator("[data-testid=body-image]")).to_be_visible()
    # sorting by size
    page.locator(".wi-sort", has_text="Size").click()
    expect(rows.first).to_contain_text("missing.js")
    assert page.errors == []


def test_bookmarklet(app_page, site, browser):
    page = ready(app_page)
    page.click("[data-testid=tab-bookmarklet]")
    href = page.get_attribute("[data-testid=bookmarklet-link]", "href")
    assert href.startswith("javascript:") and len(href) < 60000
    code = urllib.parse.unquote(href[len("javascript:"):])
    # on a web page (served over HTTP, as a bookmarklet would run)
    context = browser.new_context()
    target = context.new_page()
    errors = []
    target.on("pageerror", lambda e: errors.append(str(e)))
    target.goto(site + "/page2.html")
    target.add_script_tag(content=code)
    panel = target.locator("[data-suite-inspector]")
    expect(panel).to_be_visible()
    target.evaluate("console.log('hello', {a: 1, b: [1, 2]})")
    expect(panel.locator(".r.log")).to_have_text("hello {a: 1, b: [1, 2]}")
    panel.locator("input").fill("document.title + '!'")
    panel.locator("input").press("Enter")
    expect(panel.locator(".r.log").last).to_have_text("Second!")
    panel.locator("button[data-t=info]").click()
    expect(panel.locator(".b")).to_contain_text("Second")
    panel.locator("button[data-t=network]").click()
    expect(panel.locator(".b")).to_contain_text("logo.png")
    panel.locator("button[data-t=elements]").click()
    panel.locator("button[data-a=pick]").click()
    target.locator("h1").click()
    expect(panel.locator(".b")).to_contain_text("h1")
    expect(panel.locator(".b")).to_contain_text("Second page")
    target.add_script_tag(content=code)  # running it again toggles the panel
    expect(panel).to_be_hidden()
    assert errors == []
    context.close()
    # "try it" on the app page itself
    page.click("[data-testid=bookmarklet-try]")
    expect(page.locator("[data-suite-inspector]")).to_be_visible()


def test_german_and_mobile(app_page, tmp_path):
    page = app_page("webinspector", mobile=True, init_script="localStorage.setItem('suite.lang', 'de');" + NO_PICKERS)
    expect(page.locator("[data-testid=app-title]")).to_have_text("Web-Inspektor")
    expect(page.locator("[data-testid=go]")).to_have_text("Laden")
    html_file = tmp_path / "seite.html"
    html_file.write_text("<!doctype html><title>Datei</title><h1>Hallo</h1>", encoding="utf-8")
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=open-html]")
    chooser.value.set_files(str(html_file))
    expect(page.locator("[data-testid=summary]")).to_contain_text("aus einer Datei")
    expect(page.frame_locator("[data-testid=preview-frame]").locator("h1")).to_have_text("Hallo")
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert page.errors == []


def test_cookies_blocking_and_preview_sizes(app_page, relay, site):
    page = ready(app_page)
    set_relay(page, relay)
    # cookies set by a page (one for another site is rejected)
    load(page, site + "/cookies.html")
    page.click("[data-testid=sub-cookies]")
    rows = page.locator("[data-testid=page-cookies] [data-testid=cookie]")
    expect(rows).to_have_count(2)
    expect(rows.filter(has_text="HttpOnly")).to_contain_text("SameSite=Lax")
    expect(rows.filter(has_text="Secure")).not_to_contain_text("session")
    # keep them: they are sent with later requests (the Secure one only over HTTPS)
    page.check("[data-testid=keep-cookies]")
    expect(page.locator("[data-testid=jar] [data-testid=cookie]")).to_have_count(2)
    load(page, site + "/whoami.html")
    page.click("[data-testid=sub-preview]")
    expect(page.frame_locator("[data-testid=preview-frame]").locator("h1")).to_have_text("a=1")
    page.click("[data-testid=sub-cookies]")
    page.locator("[data-testid=jar] [data-testid=cookie]").filter(has_text="HttpOnly").locator("[data-testid=cookie-delete]").click()
    load(page, site + "/whoami.html")
    page.click("[data-testid=sub-preview]")
    expect(page.frame_locator("[data-testid=preview-frame]").locator("h1")).to_have_text("none")
    page.click("[data-testid=sub-cookies]")
    page.uncheck("[data-testid=keep-cookies]")
    expect(page.locator("[data-testid=jar]")).to_have_count(0)

    # blocking: images by pattern; the requests list marks them
    load(page, site + "/")
    expect(page.locator("[data-testid=summary]")).to_contain_text(site + "/")
    page.click("[data-testid=sub-network]")
    expect(page.locator("[data-testid=request]")).to_have_count(4)
    page.click("[data-testid=blocking]")
    page.fill("[data-testid=block-rules]", "# no images\n*.png")
    page.click("[data-testid=block-apply]")
    expect(page.locator("[data-testid=request].wi-blocked")).to_have_count(2)
    page.click("[data-testid=sub-preview]")
    expect(page.locator("[data-testid=preview-note]")).to_contain_text("2 blocked")
    assert page.frame_locator("[data-testid=preview-frame]").locator("img").get_attribute("data-original-src") == "/logo.png"
    page.click("[data-testid=sub-network]")
    page.fill("[data-testid=block-rules]", "")
    page.click("[data-testid=block-apply]")
    expect(page.locator("[data-testid=request]")).to_have_count(4)
    expect(page.locator("[data-testid=request].wi-blocked")).to_have_count(0)
    # ⊘ blocks the host of a request
    page.locator("[data-testid=block-host]").first.click()
    expect(page.locator("[data-testid=block-rules]")).to_have_value("127.0.0.1")
    expect(page.locator("[data-testid=request].wi-blocked")).to_have_count(2)  # stylesheet and logo (the CSS image is never asked for)
    expect(page.locator("[data-testid=request]")).to_have_count(3)
    page.fill("[data-testid=block-rules]", "")

    # preview sizes
    page.click("[data-testid=sub-preview]")
    page.select_option("[data-testid=viewport]", "phone")
    frame = page.locator("[data-testid=preview-frame]")
    assert frame.evaluate("(f) => [f.clientWidth, f.clientHeight]") == [390, 844]
    page.click("[data-testid=rotate]")
    assert frame.evaluate("(f) => [f.clientWidth, f.clientHeight]") == [844, 390]
    assert page.frame_locator("[data-testid=preview-frame]").locator("body").evaluate("() => window.innerWidth") == 844
    page.select_option("[data-testid=viewport]", "full")
    assert page.errors == []
