"""Minimal WebSocket client (standard library) for the relay conformance tests."""
import base64
import json
import os
import socket
import struct


class WebSocketClient:
    def __init__(self, port, path="/tcp", origin="null", host="127.0.0.1", ssl_context=None, headers=None):
        self.sock = socket.create_connection(("127.0.0.1", port), timeout=10)
        if ssl_context:
            self.sock = ssl_context.wrap_socket(self.sock, server_hostname=host)
        key = base64.b64encode(os.urandom(16)).decode()
        lines = [f"GET {path} HTTP/1.1", f"Host: {host}:{port}", "Upgrade: websocket", "Connection: Upgrade",
                 f"Sec-WebSocket-Key: {key}", "Sec-WebSocket-Version: 13"]
        lines += [f"{k}: {v}" for k, v in (headers or {}).items()]
        if origin is not None:
            lines.append(f"Origin: {origin}")
        self.sock.sendall(("\r\n".join(lines) + "\r\n\r\n").encode())
        head = b""
        while b"\r\n\r\n" not in head:
            chunk = self.sock.recv(1)
            if not chunk:
                break
            head += chunk
        self.status = int(head.split(b" ", 2)[1]) if head else 0
        self.buffer = bytearray()
        self.offset = 0

    def _recv_exact(self, n):
        while len(self.buffer) - self.offset < n:
            chunk = self.sock.recv(1 << 20)
            if not chunk:
                raise ConnectionError("closed")
            if self.offset:
                del self.buffer[:self.offset]
                self.offset = 0
            self.buffer += chunk
        data = bytes(self.buffer[self.offset:self.offset + n])
        self.offset += n
        return data

    def send(self, opcode, payload):
        mask = os.urandom(4)
        n = len(payload)
        header = struct.pack(">B", 0x80 | opcode)
        if n < 126:
            header += struct.pack(">B", 0x80 | n)
        elif n < 65536:
            header += struct.pack(">BH", 0x80 | 126, n)
        else:
            header += struct.pack(">BQ", 0x80 | 127, n)
        key = (mask * (n // 4 + 1))[:n]
        masked = (int.from_bytes(payload, "big") ^ int.from_bytes(key, "big")).to_bytes(n, "big") if n else b""
        self.sock.sendall(header + mask + masked)

    def send_json(self, obj):
        self.send(1, json.dumps(obj).encode())

    def send_binary(self, data):
        self.send(2, data)

    def recv(self):
        """Return (opcode, payload); opcode 8 means close."""
        b1, b2 = self._recv_exact(2)
        n = b2 & 0x7F
        if n == 126:
            n = struct.unpack(">H", self._recv_exact(2))[0]
        elif n == 127:
            n = struct.unpack(">Q", self._recv_exact(8))[0]
        return b1 & 0x0F, self._recv_exact(n)

    def recv_json(self):
        opcode, payload = self.recv()
        assert opcode == 1, (opcode, payload)
        return json.loads(payload)

    def recv_binary_until(self, expected):
        parts, size = [], 0
        while size < len(expected):
            opcode, payload = self.recv()
            assert opcode == 2, (opcode, payload)
            parts.append(payload)
            size += len(payload)
        return b"".join(parts)

    def close(self):
        self.sock.close()
