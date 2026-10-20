"""Relay conformance tests: every relay implementation (relay/<impl>/) must pass them (protocol version 1 features; version 2 is tested in test_auth.py)."""
import base64
import json
import os
import socket
import ssl

import pytest

from helpers.wsclient import WebSocketClient


def http_request(port, method, path, headers=None, body=b""):
    """Raw HTTP/1.1 request to the relay. Returns (status, headers dict, body bytes)."""
    headers = {"Host": f"127.0.0.1:{port}", "Origin": "null", **(headers or {})}
    headers = {k: v for k, v in headers.items() if v is not None}
    lines = [f"{method} {path} HTTP/1.1"] + [f"{k}: {v}" for k, v in headers.items()]
    lines += [f"Content-Length: {len(body)}", "Connection: close", "", ""]
    with socket.create_connection(("127.0.0.1", port), timeout=30) as s:
        s.sendall("\r\n".join(lines).encode() + body)
        data = b""
        while True:
            chunk = s.recv(65536)
            if not chunk:
                break
            data += chunk
    head, _, body = data.partition(b"\r\n\r\n")
    status_line, *header_lines = head.decode("latin-1").split("\r\n")
    parsed = {k.strip().lower(): v.strip() for k, v in (line.split(":", 1) for line in header_lines)}
    return int(status_line.split(" ")[1]), parsed, body


def proxy(relay, spec, token=None):
    status, headers, body = http_request(relay["port"], "POST", "/http",
                                         {"X-Relay-Token": token or relay["token"], "Content-Type": "application/json"},
                                         json.dumps(spec).encode())
    return status, headers, json.loads(body)


def tunnel(relay, **spec):
    ws = WebSocketClient(relay["port"])
    assert ws.status == 101
    ws.send_json({"token": relay["token"], **spec})
    return ws, ws.recv_json()


# ---- general ---------------------------------------------------------------------------------------

def test_info(relay):
    status, headers, body = http_request(relay["port"], "GET", "/info")
    assert status == 200
    info = json.loads(body)
    assert info["relay"] == "portable-web-app-suite" and info["version"] == 2 and info["auth"] == ["token"]
    assert headers["access-control-allow-origin"] == "null"


def test_cors_preflight(relay):
    status, headers, _ = http_request(relay["port"], "OPTIONS", "/http", {
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type, x-relay-token",
        "Access-Control-Request-Private-Network": "true",
    })
    assert status == 204
    assert headers["access-control-allow-origin"] == "null"
    assert "x-relay-token" in headers["access-control-allow-headers"].lower()
    assert headers["access-control-allow-private-network"] == "true"


def test_foreign_origin_rejected(relay):
    status, headers, _ = http_request(relay["port"], "GET", "/info", {"Origin": "https://evil.example"})
    assert status == 403
    assert "access-control-allow-origin" not in headers


def test_dns_rebinding_rejected(relay):
    status, _, _ = http_request(relay["port"], "GET", "/info", {"Host": "evil.example"})
    assert status == 403


def test_unknown_path(relay):
    status, _, _ = http_request(relay["port"], "GET", "/nope")
    assert status == 404


# ---- TCP tunnel ------------------------------------------------------------------------------------

def test_tunnel_echo(relay, echo):
    ws, answer = tunnel(relay, host="127.0.0.1", port=echo)
    assert answer == {"ok": True}
    ws.send_binary(b"hello relay")
    assert ws.recv_binary_until(b"hello relay") == b"hello relay"
    ws.close()


def test_tunnel_large_transfer(relay, echo):
    ws, answer = tunnel(relay, host="127.0.0.1", port=echo)
    assert answer["ok"]
    data = os.urandom(3 * 1024 * 1024)
    for i in range(0, len(data), 1024 * 1024):
        ws.send_binary(data[i:i + 1024 * 1024])
    assert ws.recv_binary_until(data) == data
    ws.close()


def test_tunnel_wrong_token(relay, echo):
    ws = WebSocketClient(relay["port"])
    ws.send_json({"token": "wrong", "host": "127.0.0.1", "port": echo})
    answer = ws.recv_json()
    assert answer["ok"] is False and "token" in answer["error"]
    ws.close()


def test_tunnel_foreign_origin_rejected(relay):
    ws = WebSocketClient(relay["port"], origin="https://evil.example")
    assert ws.status == 403
    ws.close()


def test_tunnel_connection_refused(relay):
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        free_port = s.getsockname()[1]
    ws, answer = tunnel(relay, host="127.0.0.1", port=free_port)
    assert answer["ok"] is False and answer["error"]
    ws.close()


def test_tunnel_tls(relay, tls_echo):
    ws, answer = tunnel(relay, host="localhost", port=tls_echo, tls=True)
    assert answer == {"ok": True}
    ws.send_binary(b"secret")
    assert ws.recv_binary_until(b"secret") == b"secret"
    ws.close()


def test_tunnel_tls_hostname_mismatch(relay, tls_echo):
    # the test certificate is valid for "localhost" only
    ws, answer = tunnel(relay, host="127.0.0.1", port=tls_echo, tls=True)
    assert answer["ok"] is False
    ws.close()


def test_tunnel_tls_insecure(relay, tls_echo):
    ws, answer = tunnel(relay, host="127.0.0.1", port=tls_echo, tls=True, insecure=True)
    assert answer == {"ok": True}
    ws.close()


def test_tunnel_starttls(relay, starttls_echo):
    ws, answer = tunnel(relay, host="localhost", port=starttls_echo)
    assert answer == {"ok": True}
    assert ws.recv_binary_until(b"READY\r\n") == b"READY\r\n"
    ws.send_binary(b"STARTTLS\r\n")
    assert ws.recv_binary_until(b"OK\r\n") == b"OK\r\n"
    ws.send_json({"op": "starttls"})
    assert ws.recv_json() == {"ok": True, "op": "starttls"}
    assert ws.recv_binary_until(b"SECURE\r\n") == b"SECURE\r\n"
    ws.send_binary(b"over tls")
    assert ws.recv_binary_until(b"over tls") == b"over tls"
    ws.close()


# ---- HTTP proxy ------------------------------------------------------------------------------------

def test_http_get(relay, http_target):
    status, headers, result = proxy(relay, {"method": "GET", "url": http_target + "/hello",
                                            "headers": [["Cookie", "a=1"], ["X-Custom", "yes"]]})
    assert status == 200 and headers["access-control-allow-origin"] == "null"
    assert result["status"] == 200
    names = {k.lower(): v for k, v in result["headers"]}
    assert names["set-cookie"] == "session=abc; HttpOnly"  # not readable with fetch() in a browser
    echoed = json.loads(base64.b64decode(result["body"]))
    assert echoed["path"] == "/hello"
    assert echoed["headers"]["Cookie"] == "a=1"  # a forbidden header for fetch()
    assert echoed["headers"]["X-Custom"] == "yes"
    assert result["timeMs"] >= 0


def test_http_post_body(relay, http_target):
    _, _, result = proxy(relay, {"method": "POST", "url": http_target + "/post",
                                 "headers": [["Content-Type", "text/plain"]],
                                 "body": base64.b64encode("Grüße".encode()).decode()})
    echoed = json.loads(base64.b64decode(result["body"]))
    assert echoed["method"] == "POST" and echoed["body"] == "Grüße"


def test_http_error_status_is_returned(relay, http_target):
    _, _, result = proxy(relay, {"method": "GET", "url": http_target + "/missing"})
    assert result["status"] == 404


def test_http_redirect_not_followed_by_default(relay, http_target):
    _, _, result = proxy(relay, {"method": "GET", "url": http_target + "/redirect"})
    assert result["status"] == 302
    assert dict((k.lower(), v) for k, v in result["headers"])["location"] == "/target"


def test_http_redirect_followed(relay, http_target):
    _, _, result = proxy(relay, {"method": "GET", "url": http_target + "/redirect", "followRedirects": True})
    assert result["status"] == 200 and result["url"].endswith("/target")


def test_http_wrong_token(relay, http_target):
    status, _, result = proxy(relay, {"method": "GET", "url": http_target}, token="wrong")
    assert status == 401 and "error" in result


def test_http_unreachable_target(relay):
    status, _, result = proxy(relay, {"method": "GET", "url": "http://127.0.0.1:1/", "timeout": 5})
    assert status == 502 and "error" in result


@pytest.mark.parametrize("url", ["file:///etc/passwd", "ftp://example.org/"])
def test_http_only_http_schemes(relay, url):
    status, _, result = proxy(relay, {"method": "GET", "url": url})
    assert status == 400 and "error" in result
