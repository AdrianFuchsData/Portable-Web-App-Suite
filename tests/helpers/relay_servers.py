"""Local test servers for the relay tests: TCP echo, TLS echo, STARTTLS echo, HTTP (without CORS)."""
import http.server
import json
import socketserver
import ssl
import subprocess
import threading


def make_certs(directory):
    """Create a test CA and a certificate for "localhost" (not for 127.0.0.1) with openssl. Returns (ca, cert, key)."""
    ca_key, ca, key, csr, cert = (directory / n for n in ("ca.key", "ca.pem", "server.key", "server.csr", "server.pem"))
    ext = directory / "ext.cnf"
    ext.write_text("subjectAltName=DNS:localhost\n")
    run = lambda *args: subprocess.run(["openssl", *args], check=True, capture_output=True)
    run("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", ca_key, "-out", ca, "-days", "2", "-subj", "/CN=Relay Test CA")
    run("req", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", csr, "-subj", "/CN=localhost")
    run("x509", "-req", "-in", csr, "-CA", ca, "-CAkey", ca_key, "-CAcreateserial", "-out", cert, "-days", "2", "-extfile", ext)
    return ca, cert, key


class _Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def _echo(sock):
    while True:
        data = sock.recv(65536)
        if not data:
            return
        sock.sendall(data)


def start(server):
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def echo_server():
    class Handler(socketserver.BaseRequestHandler):
        def handle(self):
            _echo(self.request)
    return start(_Server(("127.0.0.1", 0), Handler))


def tls_echo_server(cert, key):
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(cert, key)

    class Handler(socketserver.BaseRequestHandler):
        def handle(self):
            try:
                with ctx.wrap_socket(self.request, server_side=True) as s:
                    _echo(s)
            except (ssl.SSLError, OSError):
                pass
    return start(_Server(("127.0.0.1", 0), Handler))


def starttls_echo_server(cert, key):
    """Plain text greeting; after 'STARTTLS\\r\\n' it answers 'OK\\r\\n' and switches to TLS, then echoes."""
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(cert, key)

    class Handler(socketserver.BaseRequestHandler):
        def handle(self):
            self.request.sendall(b"READY\r\n")
            line = b""
            while not line.endswith(b"\r\n"):
                chunk = self.request.recv(1)
                if not chunk:
                    return
                line += chunk
            if line != b"STARTTLS\r\n":
                self.request.sendall(b"ERR\r\n")
                return
            self.request.sendall(b"OK\r\n")
            try:
                with ctx.wrap_socket(self.request, server_side=True) as s:
                    s.sendall(b"SECURE\r\n")
                    _echo(s)
            except (ssl.SSLError, OSError):
                pass
    return start(_Server(("127.0.0.1", 0), Handler))


def http_server():
    """Answers with a JSON description of the request, a Set-Cookie header and no CORS headers."""
    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def respond(self):
            if self.path == "/redirect":
                self.send_response(302)
                self.send_header("Location", "/target")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            length = int(self.headers.get("Content-Length", "0"))
            body = json.dumps({
                "method": self.command, "path": self.path,
                "headers": dict(self.headers.items()),
                "body": self.rfile.read(length).decode("utf-8", "replace"),
            }).encode()
            self.send_response(404 if self.path == "/missing" else 200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Set-Cookie", "session=abc; HttpOnly")
            if self.path.startswith("/cors/"):  # like a credential-aware API: echo the origin
                self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin") or "*")
                self.send_header("Access-Control-Allow-Credentials", "true")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self):  # CORS preflight for /cors/*
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin") or "*")
            self.send_header("Access-Control-Allow-Credentials", "true")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE")
            self.send_header("Access-Control-Allow-Headers", self.headers.get("Access-Control-Request-Headers") or "*")
            self.send_header("Content-Length", "0")
            self.end_headers()

        do_GET = do_POST = do_PUT = do_DELETE = respond

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    return start(server)
