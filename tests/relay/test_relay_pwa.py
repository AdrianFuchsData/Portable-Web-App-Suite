"""Installing the served apps as a web app (PWA), both relays: the served pages link a generated manifest, carry the service
worker marker and CSP directives for both, and the relay serves the manifest (per page), the service worker and the icons."""
import json
import shutil

import pytest

from helpers.relay_fixtures import RELAYS_V2, start_relay
from relay.test_conformance import http_request

PAGE = ('<!doctype html><html><head><meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy"\n'
        '      content="default-src \'none\'; script-src \'unsafe-inline\' blob:; worker-src blob:; connect-src data:">\n'
        '<title>Notebook</title>\n<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\'%3E%3Crect width=\'24\' height=\'24\' fill=\'%23263238\'/%3E%3C/svg%3E">'
        '</head><body>x</body></html>')


@pytest.fixture(params=sorted(RELAYS_V2))
def impl(request):
    if not shutil.which(RELAYS_V2[request.param][0][0]):
        pytest.skip(f"{request.param} relay not available")
    return request.param


def serve(impl, tmp_path):
    site = tmp_path / "site"
    site.mkdir(parents=True)
    (site / "notebook.html").write_text(PAGE)
    (site / "overview.html").write_text(PAGE.replace("Notebook", "Overview"))
    (site / ".hidden.html").write_text(PAGE)
    return start_relay(impl, token="pwa-token", serve=str(site))


def get(port, path):
    status, headers, body = http_request(port, "GET", path, {"Origin": None})
    return status, headers, body


def test_pwa_files(impl, tmp_path):
    relay = serve(impl, tmp_path)
    try:
        port = relay["port"]
        status, headers, body = get(port, "/notebook.html")
        html = body.decode()
        assert status == 200
        assert '<link rel="manifest" href="notebook.webmanifest">' in html and '<meta name="suite-pwa" content="suite-sw.js">' in html
        policy = [p for p in html.split('"') if p.startswith("default-src")][0]
        directives = {d.split()[0]: d.split()[1:] for d in policy.split("; ")}
        assert directives["manifest-src"] == ["'self'"] and directives["worker-src"] == ["blob:", "'self'"]
        assert directives["script-src"] == ["'unsafe-inline'", "blob:"]  # (the rest stays)
        assert html.index("<head>") < html.index("<link rel=\"manifest\"") < html.index("<title>")

        status, headers, body = get(port, "/notebook.webmanifest")
        assert status == 200 and headers["content-type"].startswith("application/manifest+json")
        manifest = json.loads(body)
        assert manifest["name"] == "Notebook" and manifest["start_url"] == "notebook.html" and manifest["display"] == "standalone"
        assert [i["src"] for i in manifest["icons"]] == ["notebook.icon.svg", "suite-icon.svg", "suite-icon-192.png"]
        status, headers, icon = get(port, "/notebook.icon.svg")
        assert status == 200 and headers["content-type"] == "image/svg+xml" and icon.startswith(b"<svg xmlns='http://www.w3.org/2000/svg'") and b"#263238" in icon
        assert get(port, "/missing.icon.svg")[0] == 404
        assert json.loads(get(port, "/overview.webmanifest")[2])["name"] == "Portable Web App Suite"
        assert get(port, "/missing.webmanifest")[0] == 404
        assert get(port, "/.hidden.webmanifest")[0] == 404

        status, headers, sw = get(port, "/suite-sw.js")
        assert status == 200 and headers["content-type"].startswith("text/javascript") and b"addEventListener('fetch'" in sw
        assert headers["cross-origin-resource-policy"] == "same-origin"
        status, headers, png = get(port, "/suite-icon-192.png")
        assert status == 200 and png.startswith(b"\x89PNG") and headers["content-type"] == "image/png"
        status, headers, svg = get(port, "/suite-icon.svg")
        assert status == 200 and svg.startswith(b"<svg")
    finally:
        relay["stop"]()


def test_both_relays_serve_the_same_service_worker(tmp_path):
    bodies = {}
    for name in sorted(RELAYS_V2):
        if not shutil.which(RELAYS_V2[name][0][0]):
            pytest.skip(f"{name} relay not available")
        relay = serve(name, tmp_path / name)
        try:
            bodies[name] = (get(relay["port"], "/suite-sw.js")[2], get(relay["port"], "/suite-icon.svg")[2], get(relay["port"], "/suite-icon-192.png")[2])
        finally:
            relay["stop"]()
    assert len(set(bodies.values())) == 1
