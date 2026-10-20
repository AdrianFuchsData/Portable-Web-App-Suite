"""Relay protocol version 2: user accounts, sessions, rate limiting, TLS, remote use and reverse proxies. Every relay
implementation must pass these tests (like test_conformance.py)."""
import json
import re
import shutil
import socket
import ssl
import subprocess
import time

import pytest

from helpers.relay_fixtures import RELAYS_V2, start_relay
from helpers.wsclient import WebSocketClient

PASSWORD = "correct horse battery"


def call(port, method, path, headers=None, body=None, tls=None, host="127.0.0.1"):
    """Raw HTTP/1.1 request; returns (status, headers, parsed JSON or raw body)."""
    data = json.dumps(body).encode() if body is not None else b""
    headers = {"Host": f"{host}:{port}", "Origin": "null", **(headers or {})}
    headers = {k: v for k, v in headers.items() if v is not None}
    lines = [f"{method} {path} HTTP/1.1"] + [f"{k}: {v}" for k, v in headers.items()]
    lines += [f"Content-Length: {len(data)}", "Content-Type: application/json", "Connection: close", "", ""]
    sock = socket.create_connection(("127.0.0.1", port), timeout=30)
    if tls:
        sock = tls.wrap_socket(sock, server_hostname=host)
    with sock:
        sock.sendall("\r\n".join(lines).encode() + data)
        raw = b""
        while True:
            chunk = sock.recv(65536)
            if not chunk:
                break
            raw += chunk
    head, _, content = raw.partition(b"\r\n\r\n")
    status_line, *header_lines = head.decode("latin-1").split("\r\n")
    parsed = {k.strip().lower(): v.strip() for k, v in (line.split(":", 1) for line in header_lines)}
    try:
        content = json.loads(content) if content else None
    except ValueError:
        pass
    return int(status_line.split(" ")[1]), parsed, content


def login(port, user="anna", password=PASSWORD, **kw):
    return call(port, "POST", "/auth", body={"user": user, "password": password}, **kw)


def tunnel(port, token, target_port, **kw):
    ws = WebSocketClient(port, **kw)
    assert ws.status == 101
    ws.send_json({"token": token, "host": "127.0.0.1", "port": target_port})
    return ws, ws.recv_json()


@pytest.fixture(scope="module")
def users_file(tmp_path_factory):
    """Accounts created with the Python relay's --add-user (the format is shared by all implementations)."""
    path = tmp_path_factory.mktemp("users") / "users.json"
    for name, allow in (("anna", []), ("bob", ["example.org:*"])):
        args = ["--users", str(path), "--add-user", name, "--password-stdin"] + sum((["--allow-user", a] for a in allow), [])
        result = subprocess.run(RELAYS_V2["python"][0] + args, input=PASSWORD + "\n", capture_output=True, text=True, timeout=60)
        assert result.returncode == 0, result.stderr
    return path


@pytest.fixture(scope="module", params=sorted(RELAYS_V2))
def impl(request):
    command = RELAYS_V2[request.param][0]
    if not shutil.which(command[0]):
        pytest.skip(f"{command[0]} not available")
    return request.param


@pytest.fixture(scope="module")
def accounts(impl, users_file, request):
    """Relay with user accounts only (no token)."""
    relay = start_relay(impl, users=users_file, base_path="/relay", hosts=["relay.example.org"])
    request.addfinalizer(relay["stop"])
    return relay


def test_info_lists_password_login(accounts):
    status, _, info = call(accounts["port"], "GET", "/info")
    assert status == 200 and info["version"] == 2 and info["auth"] == ["password"] and info["tls"] is False
    assert "Token:" not in accounts["output"]


def test_login_session_and_logout(accounts, echo, http_target):
    port = accounts["port"]
    status, _, body = login(port, password="wrong password")
    assert status == 401 and body["error"] == "invalid user or password"
    status, _, body = login(port)
    assert status == 200 and body["user"] == "anna" and body["expires"] > time.time()
    session = body["token"]
    # the session token works like the relay token, for the HTTP proxy and tunnels
    status, _, result = call(port, "POST", "/http", {"X-Relay-Token": session}, {"method": "GET", "url": http_target + "/hello"})
    assert status == 200 and result["status"] == 200
    ws, answer = tunnel(port, session, echo)
    assert answer == {"ok": True}
    ws.send_binary(b"ping")
    assert ws.recv_binary_until(b"ping") == b"ping"
    ws.close()
    status, _, _ = call(port, "POST", "/http", {"X-Relay-Token": "made-up"}, {"method": "GET", "url": http_target})
    assert status == 401
    status, _, _ = call(port, "POST", "/auth/logout", {"X-Relay-Token": session})
    assert status == 204
    _, answer = tunnel(port, session, echo)
    assert answer["ok"] is False and "invalid token" in answer["error"]


def test_account_allow_list(accounts, echo):
    _, _, body = login(accounts["port"], user="bob")
    _, answer = tunnel(accounts["port"], body["token"], echo)
    assert answer["ok"] is False and "not allowed" in answer["error"]


def test_base_path_and_host_names(accounts):
    port = accounts["port"]
    assert call(port, "GET", "/relay/info")[0] == 200  # behind a proxy that keeps the prefix
    assert call(port, "GET", "/info", host="relay.example.org")[0] == 200
    assert call(port, "GET", "/info", host="evil.example")[0] == 403


def test_failed_logins_are_rate_limited(impl, users_file, request):
    relay = start_relay(impl, users=users_file)
    request.addfinalizer(relay["stop"])
    for _ in range(5):
        assert login(relay["port"], password="wrong password")[0] == 401
    status, _, body = login(relay["port"])  # even the right password, until the delay is over
    assert status == 429 and re.search(r"try again in \d+ s", body["error"])


def test_session_expires(impl, users_file, echo, request):
    relay = start_relay(impl, users=users_file, session_hours=0.0005)  # 1.8 s
    request.addfinalizer(relay["stop"])
    token = login(relay["port"])[2]["token"]
    time.sleep(2.5)
    _, answer = tunnel(relay["port"], token, echo)
    assert answer["ok"] is False and "expired" in answer["error"]


def test_token_and_accounts_together(impl, users_file, echo, request):
    relay = start_relay(impl, users=users_file, token="shared-token")
    request.addfinalizer(relay["stop"])
    assert call(relay["port"], "GET", "/info")[2]["auth"] == ["token", "password"]
    assert tunnel(relay["port"], "shared-token", echo)[1] == {"ok": True}


def test_forwarded_headers_need_a_trusted_proxy(impl, users_file, request):
    relay = start_relay(impl, users=users_file)
    request.addfinalizer(relay["stop"])
    status, _, body = login(relay["port"], headers={"X-Forwarded-For": "203.0.113.7"})
    assert status == 403 and "untrusted proxy" in body["error"]


def test_trusted_proxy_requires_https_for_credentials(impl, users_file, echo, request):
    relay = start_relay(impl, users=users_file, trusted_proxy=["127.0.0.1"], proxy_user_header="X-Remote-User")
    request.addfinalizer(relay["stop"])
    port = relay["port"]
    plain = {"X-Forwarded-For": "203.0.113.7", "X-Forwarded-Proto": "http", "X-Forwarded-Host": "relay.example.org"}
    status, _, body = login(port, headers=plain, host="internal")
    assert status == 403
    status, _, body = login(port, headers={**plain, "X-Forwarded-Host": "localhost"})
    assert status == 403 and "TLS" in body["error"]
    status, _, body = login(port, headers={**plain, "X-Forwarded-Proto": "https", "X-Forwarded-Host": "localhost"})
    assert status == 200
    # a user authenticated by the proxy (e.g. client certificate) needs no relay credentials
    ws, answer = tunnel(port, None, echo, headers={"X-Forwarded-For": "203.0.113.7", "X-Forwarded-Proto": "https", "X-Remote-User": "anna"})
    assert answer == {"ok": True}
    ws.close()
    assert call(port, "GET", "/info")[2]["auth"] == ["password", "proxy"]


def test_remote_listening_needs_tls(impl, users_file):
    relay = start_relay(impl, users=users_file, bind="0.0.0.0", expect_failure=True)
    assert relay["returncode"] != 0
    assert "tls" in relay["output"].lower()


def test_tls_listener(impl, users_file, certs, echo, request):
    ca, cert, key = certs
    relay = start_relay(impl, users=users_file, bind="0.0.0.0", tls=(cert, key), hosts=["localhost"])
    request.addfinalizer(relay["stop"])
    ctx = ssl.create_default_context(cafile=str(ca))
    status, _, info = call(relay["port"], "GET", "/info", tls=ctx, host="localhost")
    assert status == 200 and info["tls"] is True
    token = login(relay["port"], tls=ctx, host="localhost")[2]["token"]
    ws, answer = tunnel(relay["port"], token, echo, ssl_context=ctx, host="localhost")
    assert answer == {"ok": True}
    payload = bytes(range(256)) * 400
    ws.send_binary(payload)
    assert ws.recv_binary_until(payload) == payload
    ws.close()
