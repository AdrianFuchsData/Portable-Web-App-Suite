"""Relay conformance: listening for port forwarding ({"listen"} and {"accept"} on /tcp), on both implementations."""
import json
import socket
import time

from helpers.relay_fixtures import start_relay
from helpers.wsclient import WebSocketClient
from test_conformance import http_request


def ws_open(relay, **spec):
    ws = WebSocketClient(relay["port"])
    assert ws.status == 101
    ws.send_json({"token": relay["token"], **spec})
    return ws, ws.recv_json()


def test_listen_accept_and_pipe(relay):
    status, _, body = http_request(relay["port"], "GET", "/info")
    assert "listen" in json.loads(body)["features"]
    control, answer = ws_open(relay, listen={"port": 0})
    assert answer["ok"] is True and answer["port"] >= 1024
    port = answer["port"]
    # two clients connect to the forwarded port
    a = socket.create_connection(("127.0.0.1", port), timeout=10)
    b = socket.create_connection(("127.0.0.1", port), timeout=10)
    ids = [control.recv_json(), control.recv_json()]
    assert all(x["op"] == "accept" and x["id"] for x in ids) and ids[0]["id"] != ids[1]["id"]
    tunnels = []
    for x in ids:
        t, ok = ws_open(relay, accept=x["id"])
        assert ok == {"ok": True}
        tunnels.append(t)
    # data both ways (which tunnel belongs to which client is not known: echo back what arrives)
    a.sendall(b"from a")
    b.sendall(b"from b")
    got = sorted(t.recv_binary_until(b"from x") for t in tunnels)
    assert got == [b"from a", b"from b"]
    for t, data in zip(tunnels, got):
        t.send_binary(b"back " + data)
    assert a.recv(100) == b"back from a" and b.recv(100) == b"back from b"
    # an id can be taken only once
    again, answer = ws_open(relay, accept=ids[0]["id"])
    assert answer["ok"] is False
    # closing the control socket stops listening
    control.close()
    for t in tunnels:
        t.close()
    a.close()
    b.close()
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        try:
            socket.create_connection(("127.0.0.1", port), timeout=1).close()
            time.sleep(0.2)
        except OSError:
            break
    else:
        raise AssertionError("still listening")


def test_listen_refused(relay):
    _, answer = ws_open(relay, listen={"port": 80})
    assert answer["ok"] is False and "1024" in answer["error"]
    ws = WebSocketClient(relay["port"])
    ws.send_json({"token": "wrong", "listen": {"port": 0}})
    assert ws.recv_json()["ok"] is False


def test_no_listen_on_a_shared_relay():
    import shutil
    from helpers.relay_fixtures import RELAYS_V2
    for impl in RELAYS_V2:
        if not shutil.which(RELAYS_V2[impl][0][0]):
            continue
        r = start_relay(impl, bind="0.0.0.0", token="tok", hosts=["*"], insecure_transport=True)
        try:
            status, _, body = http_request(r["port"], "GET", "/info")
            assert json.loads(body).get("features", []) == []
            ws = WebSocketClient(r["port"])
            ws.send_json({"token": "tok", "listen": {"port": 0}})
            answer = ws.recv_json()
            assert answer["ok"] is False and "local machine" in answer["error"], impl
        finally:
            r["stop"]()


def test_no_listen_option():
    """--no-listen / -NoListen switches port forwarding off on a local relay (e.g. one behind the reverse proxy of a public site)."""
    import shutil
    from helpers.relay_fixtures import RELAYS_V2
    for impl in RELAYS_V2:
        if not shutil.which(RELAYS_V2[impl][0][0]):
            continue
        r = start_relay(impl, token="tok", no_listen=True)
        try:
            status, _, body = http_request(r["port"], "GET", "/info")
            assert status == 200 and json.loads(body).get("features", []) == [], impl
            ws = WebSocketClient(r["port"])
            ws.send_json({"token": "tok", "listen": {"port": 0}})
            answer = ws.recv_json()
            assert answer["ok"] is False and "no-listen" in answer["error"].lower().replace("nolisten", "no-listen"), (impl, answer)
            # tunnels still work as before
            ws = WebSocketClient(r["port"])
            ws.send_json({"token": "tok", "host": "127.0.0.1", "port": 9})
            assert "ok" in ws.recv_json()
        finally:
            r["stop"]()
