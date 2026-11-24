"""A small SOCKS5 proxy for the tests (RFC 1928, CONNECT only; user/password authentication RFC 1929 optional).
It records the targets it was asked for in .log."""
import socket
import socketserver
import struct
import threading

from helpers.upstream_proxy import _pipe


def socks_proxy(user=None, password=None):
    log = []

    class Handler(socketserver.BaseRequestHandler):
        def recv(self, n):
            data = b""
            while len(data) < n:
                chunk = self.request.recv(n - len(data))
                if not chunk:
                    raise ConnectionError("closed")
                data += chunk
            return data

        def handle(self):
            try:
                ver, n = self.recv(2)
                methods = self.recv(n)
                if user:
                    if 2 not in methods:
                        self.request.sendall(b"\x05\xff")
                        return
                    self.request.sendall(b"\x05\x02")
                    _, ulen = self.recv(2)
                    u = self.recv(ulen).decode()
                    plen = self.recv(1)[0]
                    p = self.recv(plen).decode()
                    ok = u == user and p == password
                    self.request.sendall(b"\x01" + (b"\x00" if ok else b"\x01"))
                    if not ok:
                        return
                else:
                    self.request.sendall(b"\x05\x00")
                _, cmd, _, atyp = self.recv(4)
                if atyp == 1:
                    host = socket.inet_ntoa(self.recv(4))
                elif atyp == 3:
                    host = self.recv(self.recv(1)[0]).decode()
                else:
                    host = socket.inet_ntop(socket.AF_INET6, self.recv(16))
                port = struct.unpack("!H", self.recv(2))[0]
                log.append((host, port))
                try:
                    upstream = socket.create_connection((host, port), timeout=10)
                except OSError:
                    self.request.sendall(b"\x05\x05\x00\x01" + b"\0" * 6)
                    return
                self.request.sendall(b"\x05\x00\x00\x01" + socket.inet_aton("127.0.0.1") + struct.pack("!H", 0))
                upstream.settimeout(None)
                t = threading.Thread(target=_pipe, args=(upstream, self.request), daemon=True)
                t.start()
                _pipe(self.request, upstream)
                t.join(30)
            except (ConnectionError, OSError):
                pass

    class Server(socketserver.ThreadingTCPServer):
        daemon_threads = True
        allow_reuse_address = True

    server = Server(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    server.log = log
    return server
