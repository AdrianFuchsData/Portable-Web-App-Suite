"""A small HTTP proxy for the tests of the relay's --upstream-proxy: CONNECT tunnels and absolute-form requests
("GET http://host/path"), optionally with Basic authentication (407 otherwise). It records what it was asked for."""
import base64
import socket
import socketserver
import threading
import urllib.parse


def _pipe(src, dst):
    try:
        while True:
            data = src.recv(65536)
            if not data:
                break
            dst.sendall(data)
    except OSError:
        pass
    finally:
        for s in (src, dst):
            try:
                s.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass


def _read_head(conn):
    data = b""
    while b"\r\n\r\n" not in data:
        chunk = conn.recv(4096)
        if not chunk:
            return None, b""
        data += chunk
    head, _, rest = data.partition(b"\r\n\r\n")
    return head.decode("latin-1"), rest


def upstream_proxy(credentials=None):
    """Start the proxy; returns the server with .log ([(method, target)]) and .url. credentials: "user:password" or None."""
    log = []
    expected = "Basic " + base64.b64encode(credentials.encode()).decode() if credentials else None

    class Handler(socketserver.BaseRequestHandler):
        def handle(self):
            head, rest = _read_head(self.request)
            if not head:
                return
            request_line, *lines = head.split("\r\n")
            method, target, version = request_line.split(" ", 2)
            headers = {k.strip().lower(): v.strip() for k, v in (line.split(":", 1) for line in lines if ":" in line)}
            log.append((method, target))
            if expected and headers.get("proxy-authorization") != expected:
                self.request.sendall(b"HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm=\"test\"\r\nContent-Length: 0\r\n\r\n")
                return
            if method == "CONNECT":
                host, _, port = target.rpartition(":")
                try:
                    upstream = socket.create_connection((host.strip("[]"), int(port)), timeout=10)
                except OSError:
                    self.request.sendall(b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n")
                    return
                self.request.sendall(b"HTTP/1.1 200 Connection established\r\n\r\n")
                if rest:
                    upstream.sendall(rest)
            else:
                url = urllib.parse.urlsplit(target)
                upstream = socket.create_connection((url.hostname, url.port or 80), timeout=10)
                kept = [line for line in lines if not line.lower().startswith(("proxy-authorization:", "proxy-connection:"))]
                path = urllib.parse.urlunsplit(("", "", url.path or "/", url.query, ""))
                upstream.sendall(("\r\n".join([f"{method} {path} {version}"] + kept) + "\r\n\r\n").encode("latin-1") + rest)
            upstream.settimeout(None)
            self.request.settimeout(None)
            t = threading.Thread(target=_pipe, args=(upstream, self.request), daemon=True)
            t.start()
            _pipe(self.request, upstream)
            t.join(30)

    class Server(socketserver.ThreadingTCPServer):
        daemon_threads = True
        allow_reuse_address = True

    server = Server(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    server.log = log
    auth = f"{credentials}@" if credentials else ""
    server.url = f"http://{auth}127.0.0.1:{server.server_address[1]}"
    return server
