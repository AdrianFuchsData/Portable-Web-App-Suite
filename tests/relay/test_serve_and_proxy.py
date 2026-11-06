"""Relay options of both implementations: serving the apps with the headers of cross-origin isolated pages (--serve /
-Serve), and routing the outgoing connections through an upstream HTTP proxy (--upstream-proxy / -UpstreamProxy,
--no-proxy / -NoProxy)."""
import base64
import json
import shutil

import pytest

from helpers.relay_fixtures import RELAYS_V2, start_relay
from helpers.upstream_proxy import upstream_proxy
from helpers.wsclient import WebSocketClient
from relay.test_conformance import http_request

TOKEN = "serve-token"


@pytest.fixture(params=sorted(RELAYS_V2))
def impl(request):
    if not shutil.which(RELAYS_V2[request.param][0][0]):
        pytest.skip(f"{request.param} relay not available")
    return request.param


def test_serve_apps(impl, tmp_path):
    site = tmp_path / "site"
    (site / "sub").mkdir(parents=True)
    (site / "overview.html").write_text("<!doctype html><title>Overview</title>")
    (site / "notebook.html").write_text("<!doctype html><title>Notebook</title>")
    (site / "sub" / "app.js").write_text("console.log(1)")
    (site / ".secret").write_text("hidden")
    (tmp_path / "outside.txt").write_text("not served")
    relay = start_relay(impl, token=TOKEN, serve=str(site))
    try:
        port = relay["port"]
        assert f"Serving the apps of" in relay["output"]
        status, headers, _ = http_request(port, "GET", "/", {"Origin": None})
        assert status == 302 and headers["location"] == "/overview.html"
        status, headers, body = http_request(port, "GET", "/notebook.html", {"Origin": None})
        assert status == 200 and body == b"<!doctype html><title>Notebook</title>"
        assert headers["content-type"].startswith("text/html")
        assert headers["cross-origin-opener-policy"] == "same-origin" and headers["cross-origin-embedder-policy"] == "require-corp"
        assert headers["cross-origin-resource-policy"] == "same-origin"
        status, headers, body = http_request(port, "GET", "/sub/app.js", {"Origin": None})
        assert status == 200 and headers["content-type"].startswith("text/javascript") and body == b"console.log(1)"
        status, headers, body = http_request(port, "HEAD", "/notebook.html", {"Origin": None})
        assert status == 200 and int(headers["content-length"]) == 38
        for path in ("/../outside.txt", "/%2e%2e/outside.txt", "/.secret", "/missing.html", "/sub"):
            assert http_request(port, "GET", path, {"Origin": None})[0] == 404, path
        # the relay's own origin is allowed (pages served from it), others are not; the relay functions still need the token
        own = f"http://127.0.0.1:{port}"
        status, headers, _ = http_request(port, "GET", "/info", {"Origin": own})
        assert status == 200 and headers["access-control-allow-origin"] == own
        assert http_request(port, "GET", "/info", {"Origin": "http://127.0.0.1:1"})[0] == 403
        assert http_request(port, "GET", "/info")[0] == 200  # file:// pages ("null") still work
        status, _, body = http_request(port, "POST", "/http", {"Origin": own, "X-Relay-Token": "wrong", "Content-Type": "application/json"},
                                       json.dumps({"url": "http://127.0.0.1:1/"}).encode())
        assert status in (401, 403)
    finally:
        relay["stop"]()


def tunnel_echo(port, host, echo_port, token=TOKEN):
    ws = WebSocketClient(port)
    ws.send_json({"token": token, "host": host, "port": echo_port})
    answer = ws.recv_json()
    if answer.get("ok"):
        ws.send_binary(b"through the relay")
        assert ws.recv_binary_until(b"through the relay") == b"through the relay"
    ws.close()
    return answer


def http_via_relay(port, url):
    status, _, body = http_request(port, "POST", "/http", {"X-Relay-Token": TOKEN, "Content-Type": "application/json"},
                                   json.dumps({"method": "GET", "url": url}).encode())
    return status, json.loads(body)


def test_upstream_proxy(impl, echo, http_target):
    proxy = upstream_proxy("anna:sec ret")
    relay = start_relay(impl, token=TOKEN, upstream_proxy=proxy.url.replace("sec ret", "sec%20ret"), no_proxy=["localhost", "*.lan"])
    try:
        port = relay["port"]
        assert "Upstream proxy: 127.0.0.1" in relay["output"] and "(with credentials)" in relay["output"]
        # TCP tunnels through CONNECT
        assert tunnel_echo(port, "127.0.0.1", echo) == {"ok": True}
        assert ("CONNECT", f"127.0.0.1:{echo}") in proxy.log
        # /http through the proxy
        status, result = http_via_relay(port, http_target + "/hello")
        assert status == 200 and result["status"] == 200
        assert json.loads(base64.b64decode(result["body"]))["path"] == "/hello"
        target = http_target.split("//")[1]
        assert any(t in (f"http://{target}/hello", target) for _, t in proxy.log), proxy.log
        # hosts in --no-proxy are reached directly
        before = len(proxy.log)
        assert tunnel_echo(port, "localhost", echo) == {"ok": True}
        assert len(proxy.log) == before
    finally:
        relay["stop"]()
        proxy.shutdown()


def test_upstream_proxy_wrong_credentials(impl, echo):
    proxy = upstream_proxy("anna:right")
    relay = start_relay(impl, token=TOKEN, upstream_proxy=proxy.url.replace("right", "wrong"))
    try:
        answer = tunnel_echo(relay["port"], "127.0.0.1", echo)
        assert answer["ok"] is False and "407" in answer["error"]
    finally:
        relay["stop"]()
        proxy.shutdown()
