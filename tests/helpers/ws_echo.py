"""WebSocket echo server for the HTTP analyzer tests (standard library, one thread per connection).

On connect it sends "hello" (and accepts the first requested subprotocol); text and binary messages are echoed back,
the text "close" makes the server close the connection with code 4000.
"""
import base64
import hashlib
import socket
import struct
import threading

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


def _recv_exact(conn, n):
    data = b""
    while len(data) < n:
        chunk = conn.recv(n - len(data))
        if not chunk:
            raise ConnectionError("closed")
        data += chunk
    return data


def _send(conn, opcode, payload):
    head = bytes([0x80 | opcode])
    n = len(payload)
    if n < 126:
        head += bytes([n])
    elif n < 65536:
        head += bytes([126]) + struct.pack(">H", n)
    else:
        head += bytes([127]) + struct.pack(">Q", n)
    conn.sendall(head + payload)


def _serve(conn):
    try:
        request = b""
        while b"\r\n\r\n" not in request:
            chunk = conn.recv(4096)
            if not chunk:
                return
            request += chunk
        headers = {}
        for line in request.decode("latin-1").split("\r\n")[1:]:
            if ":" in line:
                k, v = line.split(":", 1)
                headers[k.strip().lower()] = v.strip()
        accept = base64.b64encode(hashlib.sha1((headers["sec-websocket-key"] + GUID).encode()).digest()).decode()
        lines = ["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", f"Sec-WebSocket-Accept: {accept}"]
        protocols = [p.strip() for p in headers.get("sec-websocket-protocol", "").split(",") if p.strip()]
        if protocols:
            lines.append(f"Sec-WebSocket-Protocol: {protocols[0]}")
        conn.sendall(("\r\n".join(lines) + "\r\n\r\n").encode())
        _send(conn, 1, b"hello" + (f" ({protocols[0]})".encode() if protocols else b""))
        while True:
            b1, b2 = _recv_exact(conn, 2)
            opcode, n = b1 & 0x0F, b2 & 0x7F
            if n == 126:
                n = struct.unpack(">H", _recv_exact(conn, 2))[0]
            elif n == 127:
                n = struct.unpack(">Q", _recv_exact(conn, 8))[0]
            mask = _recv_exact(conn, 4) if b2 & 0x80 else b"\0\0\0\0"
            payload = bytes(c ^ mask[i % 4] for i, c in enumerate(_recv_exact(conn, n)))
            if opcode == 8:
                _send(conn, 8, payload[:2] or struct.pack(">H", 1000))
                return
            if opcode == 9:
                _send(conn, 10, payload)
            elif opcode == 1 and payload == b"close":
                _send(conn, 8, struct.pack(">H", 4000) + b"bye")
                return
            elif opcode in (1, 2):
                _send(conn, opcode, payload)
    except (ConnectionError, OSError, KeyError):
        pass
    finally:
        conn.close()


def start():
    """Start the server on a free port; returns (port, stop)."""
    server = socket.socket()
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(("127.0.0.1", 0))
    server.listen()
    running = True

    def loop():
        while running:
            try:
                conn, _ = server.accept()
            except OSError:
                return
            threading.Thread(target=_serve, args=(conn,), daemon=True).start()

    threading.Thread(target=loop, daemon=True).start()

    def stop():
        nonlocal running
        running = False
        server.close()
    return server.getsockname()[1], stop
