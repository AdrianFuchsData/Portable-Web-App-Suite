"""Hosted PWA variant (tools/build_pwa.py): manifests, service worker (offline after the first visit), file handlers."""
import functools
import http.server
import json
import subprocess
import sys
import threading

import pytest

from helpers.paths import DIST, ROOT


@pytest.fixture(scope="module")
def pwa(tmp_path_factory):
    out = tmp_path_factory.mktemp("pwa")
    subprocess.run([sys.executable, str(ROOT / "tools/build_pwa.py"), str(out)], check=True, capture_output=True, env={"SUITE_DIST": str(DIST), "PATH": ""})
    class Handler(http.server.SimpleHTTPRequestHandler):
        """Answers with the headers of the nginx template in the technical documentation (public online service)."""
        extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".webmanifest": "application/manifest+json", ".js": "text/javascript"}

        def log_message(self, *args):
            pass

        def end_headers(self):
            for name, value in (("Cache-Control", "no-cache"), ("Cross-Origin-Opener-Policy", "same-origin"),
                                ("Cross-Origin-Embedder-Policy", "require-corp"), ("Cross-Origin-Resource-Policy", "same-origin"),
                                ("X-Content-Type-Options", "nosniff"), ("Referrer-Policy", "no-referrer")):
                self.send_header(name, value)
            super().end_headers()

    handler = functools.partial(Handler, directory=str(out))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield out, f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


def test_output(pwa):
    out, _ = pwa
    manifest = json.loads((out / "document.webmanifest").read_text())
    assert manifest["start_url"] == "./document.html" and manifest["display"] == "standalone"
    assert ".odt" in manifest["file_handlers"][0]["accept"]["application/octet-stream"]
    assert (out / "icons/document.svg").read_text().startswith("<svg")
    assert "file_handlers" not in json.loads((out / "ssh.webmanifest").read_text())  # opens no files
    html = (out / "document.html").read_text()
    assert '<link rel="manifest" href="document.webmanifest">' in html and "manifest-src 'self'" in html and "worker-src 'self' blob:" in html
    assert '"overview.html"' in (out / "sw.js").read_text()


def test_tags_at_the_top_of_head(pwa):
    """The manifest link and the registration come right after the CSP meta tag of every app, before any inlined code (which may
    contain "</head>" in strings, e.g. the text editor's Markdown preview)."""
    out, _ = pwa
    for page in sorted(out.glob("*.html")):
        if page.name == "index.html":
            continue
        html = page.read_text(encoding="utf-8")
        assert html.count('rel="manifest"') == 1, page.name
        at = html.index('<link rel="manifest"')
        assert at < html.index("<script") or html.index("<script") > html.index("navigator.serviceWorker.register") - 20, page.name
        assert "<style" not in html[:at] and "<script" not in html[:at], page.name


def test_every_app_loads(pwa, browser):
    """Every app of the hosted variant starts (not only the overview)."""
    _, url = pwa
    context = browser.new_context()
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    for app in ("texteditor", "document", "notebook", "keepass"):
        page.goto(f"{url}/{app}.html")
        page.wait_for_selector("body[data-ready]", timeout=60000)
        assert page.locator("[data-testid=app-title]").is_visible(), app
    assert errors == [], errors
    context.close()


def test_installable(pwa, browser):
    """Chromium finds no installability errors (manifest, icons incl. 192/512 px PNG, service worker) for the overview and an app."""
    if browser.browser_type.name != "chromium":
        pytest.skip("installability is checked in Chromium (DevTools protocol)")
    out, url = pwa
    assert (out / "icons/suite-192.png").read_bytes().startswith(b"\x89PNG") and (out / "icons/suite-512.png").exists()
    context = browser.new_context()
    page = context.new_page()
    cdp = context.new_cdp_session(page)
    for app in ("overview", "texteditor"):
        page.goto(f"{url}/{app}.html")
        page.wait_for_selector("body[data-ready]", timeout=60000)
        page.evaluate("navigator.serviceWorker.ready.then(() => true)")
        errors = cdp.send("Page.getInstallabilityErrors")["installabilityErrors"]
        assert errors == [], (app, errors)
        manifest = cdp.send("Page.getAppManifest")
        assert not manifest.get("errors"), (app, manifest.get("errors"))
    context.close()


def test_offline_after_first_visit(pwa, browser):
    if browser.browser_type.name != "chromium":
        pytest.skip("service workers are checked in Chromium")
    _, url = pwa
    context = browser.new_context()
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{url}/hexeditor.html")
    page.wait_for_selector("body[data-ready]")
    page.evaluate("navigator.serviceWorker.ready.then(() => true)")
    page.reload()  # now controlled by the service worker, which stores the page
    page.wait_for_selector("body[data-ready]")
    page.wait_for_function("() => navigator.serviceWorker.controller !== null")
    page.wait_for_timeout(500)
    context.set_offline(True)
    page.reload()
    page.wait_for_selector("body[data-ready]")
    assert page.locator("link[rel=manifest]").get_attribute("href") == "hexeditor.webmanifest"
    page.goto(f"{url}/")  # index (precached) forwards to the overview (precached)
    page.wait_for_url("**/overview.html")
    page.wait_for_selector("body[data-ready]")
    assert errors == []
    context.close()


def test_file_handler_launch(app_page):
    """Files opened from the operating system arrive through window.launchQueue (shared/js/bridge.js)."""
    # (Chromium has a read-only window.launchQueue of its own)
    stub = "Object.defineProperty(window, 'launchQueue', { configurable: true, value: { setConsumer: (fn) => { window.launchConsumer = fn; } } });"
    page = app_page("texteditor", init_script=stub)
    page.wait_for_function("() => typeof window.launchConsumer === 'function'")
    page.evaluate("""window.launchConsumer({ files: [{ name: 'launched.txt', kind: 'file',
      getFile: async () => new File(['opened by the system'], 'launched.txt', { type: 'text/plain' }) }] })""")
    page.wait_for_function("() => TE.app.view.state.doc.toString() === 'opened by the system'")
    assert page.errors == []
