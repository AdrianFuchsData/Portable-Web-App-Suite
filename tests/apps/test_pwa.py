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
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(out))
    handler.log_message = lambda *args: None
    handler.extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".webmanifest": "application/manifest+json", ".js": "text/javascript"}
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
