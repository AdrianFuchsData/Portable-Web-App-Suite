#!/usr/bin/env python3
"""Portable Web App Suite relay (Python reference implementation).

Browser pages cannot open TCP connections. This relay lets the apps reach TCP services (IMAP, SMTP, SSH, SFTP,
FTP, Postgres, ...) through WebSockets, and HTTP services without CORS restrictions. It only uses the Python
standard library (3.8+) and needs no installation and no admin rights. By default it listens on 127.0.0.1 with a
random token; it can also run on another machine (--bind, --tls-cert) or behind a reverse proxy (--trusted-proxy,
--base-path), with user accounts (--users) instead of or in addition to the token.

Protocol (version 2; version 1 clients keep working), see relay/README.md:

* GET /info -> {"relay": "portable-web-app-suite", "version": 2, "implementation": "python",
                "auth": ["token", "password", "proxy"], "tls": false}
* POST /auth {"user", "password"} -> {"token": "<session>", "user", "expires": <unix time>}  (password accounts)
  POST /auth/logout (header X-Relay-Token) -> 204
* WebSocket /tcp -> TCP tunnel. First message (text, JSON):
      {"token": "...", "host": "imap.example.org", "port": 993, "tls": true, "insecure": false}
  "token" is the relay token or a session token. Answer {"ok": true} or {"ok": false, "error": "..."}. Then binary
  messages carry the TCP data; text messages are control messages ({"op": "starttls", "insecure": false}).
* POST /http (header X-Relay-Token) -> HTTP proxy, body {"method", "url", "headers": [[n, v]], "body": "<base64>",
  "insecure", "followRedirects", "timeout"}; answer {"status", "reason", "headers", "body", "url", "httpVersion",
  "timeMs"} or {"error"} with status 502.

Security: credentials are only accepted over TLS (own certificate, or a trusted reverse proxy that reports
https) or from the local machine, unless --insecure-transport is given. The Origin must be allowed (default "null",
i.e. file:// pages), the Host header must be a loopback name or one given with --host (DNS rebinding), and
forwarded headers are only accepted from --trusted-proxy addresses. Failed logins are rate limited.

Usage:
    python3 relay.py [--port 8765] [--bind 127.0.0.1] [--token TOKEN] [--users users.json] [--origin ORIGIN ...]
                     [--allow PATTERN ...] [--cafile FILE] [--tls-cert cert.pem --tls-key key.pem] [--host NAME ...]
                     [--base-path /relay] [--trusted-proxy ADDR/CIDR ...] [--proxy-user-header X-Remote-User]
                     [--session-hours 12] [--insecure-transport]
    python3 relay.py --users users.json --add-user anna [--allow-user PATTERN ...]    # create/change an account
"""
import argparse
import asyncio
import base64
import fnmatch
import getpass
import hashlib
import hmac
import ipaddress
import json
import os
import secrets
import ssl
import struct
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

VERSION = 2
PBKDF2_ITERATIONS = 600000
MAX_FAILURES = 5            # failed logins (per user and per client address) before a delay applies
FAILURE_WINDOW = 15 * 60    # seconds
MAX_BLOCK = 15 * 60         # longest delay in seconds
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
MAX_HEADER = 64 * 1024
MAX_HTTP_BODY = 64 * 1024 * 1024
MAX_FRAME = 16 * 1024 * 1024
LOOPBACK_HOSTS = ("127.0.0.1", "localhost", "[::1]")


class HttpError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def hash_password(password, iterations=PBKDF2_ITERATIONS, salt=None):
    """PBKDF2-SHA256 hash in the format pbkdf2-sha256$<iterations>$<salt base64>$<hash base64>."""
    salt = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2-sha256${iterations}${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password, stored):
    try:
        scheme, iterations, salt, digest = stored.split("$")
        if scheme != "pbkdf2-sha256":
            return False
        check = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), base64.b64decode(salt), int(iterations))
        return hmac.compare_digest(check, base64.b64decode(digest))
    except (ValueError, TypeError):
        return False


def load_users(path):
    """users.json: {"users": {"name": {"hash": "pbkdf2-sha256$...", "allow": ["host:port pattern", ...]}}}"""
    if not path:
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f).get("users", {})


def is_loopback(address):
    try:
        return ipaddress.ip_address(address.split("%")[0]).is_loopback
    except ValueError:
        return False


class Relay:
    def __init__(self, token, origins, allow, cafile, port, users=None, users_file=None, hosts=(), base_path="",
                 trusted_proxies=(), proxy_user_header=None, session_hours=12, tls=False, insecure_transport=False):
        self.token = token
        self.origins = set(origins)
        self.allow = allow
        self.cafile = cafile
        self.port = port
        self.users = users or {}
        self.users_file = users_file
        self.hosts = {h.lower() for h in hosts}
        self.base_path = "/" + base_path.strip("/") if base_path.strip("/") else ""
        self.trusted = [ipaddress.ip_network(p, strict=False) for p in trusted_proxies]
        self.proxy_user_header = proxy_user_header.lower() if proxy_user_header else None
        self.session_seconds = session_hours * 3600
        self.tls = tls
        self.insecure_transport = insecure_transport
        self.sessions = {}   # session token -> {"user", "expires"}
        self.failures = {}   # key ("user:x" / "addr:y") -> [timestamps]

    def auth_methods(self):
        methods = []
        if self.token:
            methods.append("token")
        if self.users:
            methods.append("password")
        if self.proxy_user_header:
            methods.append("proxy")
        return methods

    # ---- clients, transport security and authentication ----------------------------------------

    def is_trusted_proxy(self, peer):
        try:
            address = ipaddress.ip_address(peer.split("%")[0])
        except ValueError:
            return False
        return any(address in net for net in self.trusted)

    def client(self, peer, headers):
        """Who is asking: {"addr", "secure", "proxied", "user"} (user from a trusted proxy's header)."""
        forwarded = headers.get("x-forwarded-for") or headers.get("forwarded")
        if self.is_trusted_proxy(peer):
            addr = headers.get("x-forwarded-for", "").split(",")[-1].strip() or peer
            proto = headers.get("x-forwarded-proto", "").split(",")[0].strip().lower()
            secure = self.tls or proto == "https" or (not forwarded and is_loopback(peer))
            user = headers.get(self.proxy_user_header) if self.proxy_user_header else None
            return {"addr": addr, "secure": secure or self.insecure_transport, "proxied": True, "user": user or None}
        if forwarded:
            raise HttpError(403, "request through an untrusted proxy (start the relay with --trusted-proxy)")
        return {"addr": peer, "secure": self.tls or is_loopback(peer) or self.insecure_transport, "proxied": False, "user": None}

    def authenticate(self, token, client):
        """Check a relay or session token (or the proxy user). Returns the user name ("" for the relay token)."""
        if client["user"]:
            return client["user"]
        if not client["secure"]:
            raise HttpError(403, "credentials are only accepted over TLS")
        token = str(token or "")
        if self.token and token and hmac.compare_digest(token, self.token):
            return ""
        session = self.sessions.get(token)
        if session and session["expires"] > time.time():
            session["expires"] = time.time() + self.session_seconds  # sliding expiry
            return session["user"]
        self.sessions.pop(token, None)
        raise HttpError(401, "invalid token" if not session else "session expired")

    def blocked_for(self, keys):
        now = time.time()
        wait = 0
        for key in keys:
            recent = [t for t in self.failures.get(key, []) if now - t < FAILURE_WINDOW]
            self.failures[key] = recent
            if len(recent) >= MAX_FAILURES:
                delay = min(MAX_BLOCK, 30 * 2 ** (len(recent) - MAX_FAILURES))
                wait = max(wait, recent[-1] + delay - now)
        return int(wait + 0.999)

    def login(self, spec, client):
        if not self.users:
            raise HttpError(404, "no user accounts configured")
        if not client["secure"]:
            raise HttpError(403, "credentials are only accepted over TLS")
        user, password = str(spec.get("user", "")), str(spec.get("password", ""))
        keys = [f"user:{user.lower()}", f"addr:{client['addr']}"]
        wait = self.blocked_for(keys)
        if wait > 0:
            raise HttpError(429, f"too many failed logins, try again in {wait} s")
        account = self.users.get(user)
        if not account or not verify_password(password, account.get("hash", "")):
            if not account:
                verify_password(password, hash_password("x", salt=b"0" * 16))  # same time for unknown users
            for key in keys:
                self.failures.setdefault(key, []).append(time.time())
            raise HttpError(401, "invalid user or password")
        for key in keys:
            self.failures.pop(key, None)
        token = secrets.token_urlsafe(32)
        expires = time.time() + self.session_seconds
        self.sessions[token] = {"user": user, "expires": expires}
        return {"token": token, "user": user, "expires": int(expires)}

    # ---- helpers -------------------------------------------------------------------------------

    def tls_context(self, insecure):
        ctx = ssl.create_default_context(cafile=self.cafile) if not insecure else ssl._create_unverified_context()
        if self.cafile and not insecure:
            ctx.load_default_certs()
        return ctx

    def target_allowed(self, host, port, user=""):
        target = f"{host}:{port}"
        if self.allow and not any(fnmatch.fnmatch(target, p) for p in self.allow):
            return False
        account_allow = self.users.get(user, {}).get("allow") if user else None
        return not account_allow or any(fnmatch.fnmatch(target, p) for p in account_allow)

    def cors_headers(self, origin):
        if origin and origin in self.origins:
            return {"Access-Control-Allow-Origin": origin, "Vary": "Origin"}
        return {}

    def check_request(self, headers, client):
        raw = headers.get("x-forwarded-host", "").split(",")[0].strip() if client["proxied"] and headers.get("x-forwarded-host") else headers.get("host", "")
        host = (raw.rsplit(":", 1)[0] if not raw.startswith("[") else raw.split("]")[0] + "]").lower()
        if host not in LOOPBACK_HOSTS and host not in self.hosts and "*" not in self.hosts:  # protects against DNS rebinding
            raise HttpError(403, "invalid Host header")
        origin = headers.get("origin")
        if origin is not None and origin not in self.origins:
            raise HttpError(403, f"origin not allowed: {origin}")

    @staticmethod
    async def write_response(writer, status, reason, headers, body=b""):
        lines = [f"HTTP/1.1 {status} {reason}"] + [f"{k}: {v}" for k, v in headers.items()]
        lines += [f"Content-Length: {len(body)}", "Connection: close", "", ""]
        writer.write("\r\n".join(lines).encode("latin-1") + body)
        await writer.drain()

    # ---- connection handling ---------------------------------------------------------------------

    async def handle(self, reader, writer):
        origin = None
        try:
            head = await reader.readuntil(b"\r\n\r\n")
            if len(head) > MAX_HEADER:
                raise HttpError(431, "headers too large")
            request_line, *header_lines = head.decode("latin-1").split("\r\n")
            method, target, _ = request_line.split(" ", 2)
            headers = {}
            for line in header_lines:
                if ":" in line:
                    k, v = line.split(":", 1)
                    headers[k.strip().lower()] = v.strip()
            origin = headers.get("origin")
            path = urllib.parse.urlsplit(target).path
            if self.base_path and (path == self.base_path or path.startswith(self.base_path + "/")):
                path = path[len(self.base_path):] or "/"
            peer = writer.get_extra_info("peername")[0]
            client = self.client(peer, headers)
            self.check_request(headers, client)
            if method == "OPTIONS":
                await self.write_response(writer, 204, "No Content", {
                    **self.cors_headers(origin),
                    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type, X-Relay-Token",
                    "Access-Control-Max-Age": "600",
                    # Chromium Private/Local Network Access preflight
                    "Access-Control-Allow-Private-Network": "true",
                })
            elif method == "GET" and path == "/info":
                body = json.dumps({"relay": "portable-web-app-suite", "version": VERSION, "implementation": "python",
                                   "auth": self.auth_methods(), "tls": self.tls or (client["proxied"] and client["secure"])})
                await self.write_response(writer, 200, "OK", {**self.cors_headers(origin), "Content-Type": "application/json"}, body.encode())
            elif method == "GET" and path == "/tcp" and headers.get("upgrade", "").lower() == "websocket":
                await self.websocket(reader, writer, headers, client)
            elif method == "POST" and path == "/http":
                await self.http_proxy(reader, writer, headers, client)
            elif method == "POST" and path == "/auth":
                spec = await self.read_json(reader, headers)
                result = self.login(spec, client)
                await self.write_response(writer, 200, "OK", {**self.cors_headers(origin), "Content-Type": "application/json"}, json.dumps(result).encode())
            elif method == "POST" and path == "/auth/logout":
                self.sessions.pop(headers.get("x-relay-token", ""), None)
                await self.write_response(writer, 204, "No Content", self.cors_headers(origin))
            else:
                raise HttpError(404, "not found")
        except HttpError as e:
            try:
                await self.write_response(writer, e.status, "Error", {**self.cors_headers(origin), "Content-Type": "application/json"},
                                          json.dumps({"error": str(e)}).encode())
            except ConnectionError:
                pass
        except (asyncio.IncompleteReadError, asyncio.LimitOverrunError, ConnectionError, ValueError):
            pass
        finally:
            writer.close()

    # ---- HTTP proxy ------------------------------------------------------------------------------

    @staticmethod
    async def read_json(reader, headers):
        length = int(headers.get("content-length", "0"))
        if length > MAX_HTTP_BODY:
            raise HttpError(413, "request too large")
        try:
            return json.loads(await reader.readexactly(length)) if length else {}
        except json.JSONDecodeError:
            raise HttpError(400, "invalid JSON")

    async def http_proxy(self, reader, writer, headers, client):
        user = self.authenticate(headers.get("x-relay-token", ""), client)
        spec = await self.read_json(reader, headers)
        url = spec["url"]
        parts = urllib.parse.urlsplit(url)
        if parts.scheme not in ("http", "https"):
            raise HttpError(400, "only http and https URLs are supported")
        port = parts.port or (443 if parts.scheme == "https" else 80)
        if not self.target_allowed(parts.hostname, port, user):
            raise HttpError(403, f"target not allowed: {parts.hostname}:{port}")
        result = await asyncio.get_running_loop().run_in_executor(None, self.do_http, spec)
        status = 502 if "error" in result else 200
        await self.write_response(writer, status, "OK" if status == 200 else "Bad Gateway",
                                  {**self.cors_headers(headers.get("origin")), "Content-Type": "application/json"},
                                  json.dumps(result).encode())

    def do_http(self, spec):
        body = base64.b64decode(spec["body"]) if spec.get("body") else None
        request = urllib.request.Request(spec["url"], data=body, method=spec.get("method", "GET"))
        for name, value in spec.get("headers", []):
            request.add_header(name, value)
        handlers = [urllib.request.HTTPSHandler(context=self.tls_context(spec.get("insecure", False)))]
        if not spec.get("followRedirects", False):
            class NoRedirect(urllib.request.HTTPRedirectHandler):
                def redirect_request(self, *args, **kwargs):
                    return None
            handlers.append(NoRedirect())
        opener = urllib.request.build_opener(*handlers)
        start = time.perf_counter()
        try:
            try:
                response = opener.open(request, timeout=spec.get("timeout", 30))
            except urllib.error.HTTPError as e:
                response = e  # 4xx/5xx and unfollowed redirects still carry a full response
            with response:
                data = response.read()
                return {
                    "status": response.status, "reason": response.reason, "url": response.url,
                    "httpVersion": "HTTP/1.1" if getattr(response, "version", 11) == 11 else "HTTP/1.0",
                    "headers": [[k, v] for k, v in response.headers.items()],
                    "body": base64.b64encode(data).decode("ascii"),
                    "timeMs": round((time.perf_counter() - start) * 1000, 1),
                }
        except Exception as e:  # report network/TLS errors to the app
            return {"error": f"{type(e).__name__}: {e}"}

    # ---- WebSocket TCP tunnel --------------------------------------------------------------------

    async def websocket(self, reader, writer, headers, client):
        key = headers.get("sec-websocket-key")
        if not key or headers.get("sec-websocket-version") != "13":
            raise HttpError(400, "invalid WebSocket handshake")
        accept = base64.b64encode(hashlib.sha1((key + WS_GUID).encode()).digest()).decode()
        writer.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                      f"Sec-WebSocket-Accept: {accept}\r\n\r\n").encode())
        await writer.drain()
        ws = WebSocket(reader, writer)

        opcode, payload = await ws.receive()
        try:
            spec = json.loads(payload) if opcode == 1 else None
            if not spec:
                raise ValueError("invalid token")
            try:
                user = self.authenticate(spec.get("token"), client)
            except HttpError as e:
                raise ValueError(str(e))
            host, port = str(spec["host"]), int(spec["port"])
            if not self.target_allowed(host, port, user):
                raise ValueError(f"target not allowed: {host}:{port}")
            ssl_ctx = self.tls_context(spec.get("insecure", False)) if spec.get("tls") else None
            tcp_reader, tcp_writer = await asyncio.wait_for(
                asyncio.open_connection(host, port, ssl=ssl_ctx, server_hostname=host if ssl_ctx else None), 20)
        except Exception as e:
            await ws.send_text(json.dumps({"ok": False, "error": f"{type(e).__name__}: {e}" if not isinstance(e, ValueError) else str(e)}))
            await ws.close()
            return
        await ws.send_text(json.dumps({"ok": True}))
        await Tunnel(ws, tcp_reader, tcp_writer, host, self).run()


class Tunnel:
    def __init__(self, ws, tcp_reader, tcp_writer, host, relay):
        self.ws, self.tcp_reader, self.tcp_writer, self.host, self.relay = ws, tcp_reader, tcp_writer, host, relay

    async def run(self):
        upstream = asyncio.ensure_future(self.ws_to_tcp())
        downstream = asyncio.ensure_future(self.tcp_to_ws())
        await asyncio.wait([upstream, downstream], return_when=asyncio.FIRST_COMPLETED)
        for task in (upstream, downstream):
            task.cancel()
        self.tcp_writer.close()
        await self.ws.close()

    async def ws_to_tcp(self):
        while True:
            opcode, payload = await self.ws.receive()
            if opcode is None:
                return
            if opcode == 2:
                self.tcp_writer.write(payload)
                await self.tcp_writer.drain()
            elif opcode == 1:
                control = json.loads(payload)
                if control.get("op") == "starttls":
                    await self.starttls(control.get("insecure", False))
                else:
                    await self.ws.send_text(json.dumps({"ok": False, "error": f"unknown op: {control.get('op')}"}))

    async def starttls(self, insecure):
        """Upgrade the TCP connection to TLS. The client sends nothing until it receives the answer."""
        ctx = self.relay.tls_context(insecure)
        try:
            if hasattr(self.tcp_writer, "start_tls"):  # Python 3.11+
                await self.tcp_writer.start_tls(ctx, server_hostname=self.host)
            else:
                loop = asyncio.get_running_loop()
                transport = self.tcp_writer.transport
                new_transport = await loop.start_tls(transport, transport.get_protocol(), ctx, server_hostname=self.host)
                self.tcp_writer._transport = new_transport  # no public API before Python 3.11
            await self.ws.send_text(json.dumps({"ok": True, "op": "starttls"}))
        except Exception as e:
            await self.ws.send_text(json.dumps({"ok": False, "op": "starttls", "error": f"{type(e).__name__}: {e}"}))
            raise

    async def tcp_to_ws(self):
        while True:
            data = await self.tcp_reader.read(65536)
            if not data:
                return
            await self.ws.send_binary(data)


def unmask(data, mask):
    """XOR the payload with the 4-byte mask (as one big integer operation, which is fast in CPython)."""
    n = len(data)
    if not n:
        return b""
    key = (mask * (n // 4 + 1))[:n]
    return (int.from_bytes(data, "big") ^ int.from_bytes(key, "big")).to_bytes(n, "big")


class WebSocket:
    """Minimal RFC 6455 server side: binary/text messages, fragmentation, ping/pong, close."""

    def __init__(self, reader, writer):
        self.reader, self.writer = reader, writer
        self.lock = asyncio.Lock()
        self.closed = False

    async def receive(self):
        """Return (opcode, payload) of the next data message, or (None, b"") when the connection closes."""
        message, message_opcode = bytearray(), None
        while True:
            try:
                b1, b2 = await self.reader.readexactly(2)
            except (asyncio.IncompleteReadError, ConnectionError):
                return None, b""
            fin, opcode, masked, length = b1 & 0x80, b1 & 0x0F, b2 & 0x80, b2 & 0x7F
            if length == 126:
                length = struct.unpack(">H", await self.reader.readexactly(2))[0]
            elif length == 127:
                length = struct.unpack(">Q", await self.reader.readexactly(8))[0]
            if length > MAX_FRAME or not masked:
                await self.close(1009 if masked else 1002)
                return None, b""
            mask = await self.reader.readexactly(4)
            payload = unmask(await self.reader.readexactly(length), mask)
            if opcode == 8:
                await self.close()
                return None, b""
            if opcode == 9:
                await self.send_frame(10, bytes(payload))
                continue
            if opcode == 10:
                continue
            if opcode in (1, 2):
                message_opcode = opcode
            message += payload
            if len(message) > MAX_FRAME:
                await self.close(1009)
                return None, b""
            if fin:
                return message_opcode, bytes(message)

    async def send_frame(self, opcode, payload):
        if self.closed and opcode != 8:
            return
        length = len(payload)
        if length < 126:
            header = struct.pack(">BB", 0x80 | opcode, length)
        elif length < 65536:
            header = struct.pack(">BBH", 0x80 | opcode, 126, length)
        else:
            header = struct.pack(">BBQ", 0x80 | opcode, 127, length)
        async with self.lock:
            self.writer.write(header + payload)
            await self.writer.drain()

    async def send_text(self, text):
        await self.send_frame(1, text.encode("utf-8"))

    async def send_binary(self, data):
        await self.send_frame(2, data)

    async def close(self, code=1000):
        if self.closed:
            return
        self.closed = True
        try:
            await self.send_frame(8, struct.pack(">H", code))
        except ConnectionError:
            pass


def add_user(path, name, allow, password=None):
    """Create or change an account in a users file (asks for the password)."""
    data = {"users": {}}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    if password is None:
        password = getpass.getpass(f"Password for {name}: ")
        if password != getpass.getpass("Repeat the password: "):
            print("The passwords do not match.", file=sys.stderr)
            return 1
    if len(password) < 8:
        print("Use at least 8 characters.", file=sys.stderr)
        return 1
    account = data.setdefault("users", {}).get(name, {})
    account["hash"] = hash_password(password)
    if allow:
        account["allow"] = allow
    data["users"][name] = account
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    print(f"Account {name} saved in {path}.")
    return 0


def main():
    parser = argparse.ArgumentParser(description="Portable Web App Suite relay (WebSocket-to-TCP and HTTP proxy)")
    parser.add_argument("--port", type=int, default=8765, help="port (default 8765; 0 = any free port)")
    parser.add_argument("--bind", default="127.0.0.1", help="address to listen on (default 127.0.0.1; 0.0.0.0 or :: for all)")
    parser.add_argument("--token", help="access token (default: random and printed at start, unless --users or --proxy-user-header is given)")
    parser.add_argument("--users", help="file with user accounts (create accounts with --add-user)")
    parser.add_argument("--add-user", metavar="NAME", help="create or change an account in the --users file and exit")
    parser.add_argument("--allow-user", action="append", default=[], help="with --add-user: allowed targets of the account (host:port glob); repeatable")
    parser.add_argument("--password-stdin", action="store_true", help="with --add-user: read the password from standard input")
    parser.add_argument("--origin", action="append", default=[],
                        help='allowed page origin (default: "null" = pages opened from file://); repeatable')
    parser.add_argument("--allow", action="append", default=[], help="allowed target host:port glob, e.g. '*.example.org:993'; repeatable")
    parser.add_argument("--cafile", help="additional trusted CA certificates (PEM) for TLS to the targets")
    parser.add_argument("--tls-cert", help="certificate (PEM, with chain) to serve HTTPS/WSS")
    parser.add_argument("--tls-key", help="private key (PEM) of --tls-cert")
    parser.add_argument("--host", action="append", default=[], help="allowed host name in requests besides loopback names (or *); repeatable")
    parser.add_argument("--base-path", default="", help="path prefix, e.g. /relay behind a reverse proxy")
    parser.add_argument("--trusted-proxy", action="append", default=[], help="address or network of a reverse proxy whose X-Forwarded-* headers are trusted; repeatable")
    parser.add_argument("--proxy-user-header", help="header with the user name authenticated by a trusted reverse proxy, e.g. X-Remote-User")
    parser.add_argument("--session-hours", type=float, default=12, help="idle time after which a login expires (default 12)")
    parser.add_argument("--insecure-transport", action="store_true", help="accept credentials without TLS from other machines (trusted networks only)")
    args = parser.parse_args()

    if args.add_user:
        if not args.users:
            parser.error("--add-user needs --users FILE")
        password = sys.stdin.readline().rstrip("\r\n") if args.password_stdin else None
        return add_user(args.users, args.add_user, args.allow_user, password)
    if bool(args.tls_cert) != bool(args.tls_key):
        parser.error("--tls-cert and --tls-key belong together")
    local = is_loopback(args.bind) or args.bind == "localhost"
    if not local and not args.tls_cert and not args.trusted_proxy and not args.insecure_transport:
        parser.error("listening on other addresses than loopback needs --tls-cert/--tls-key, a --trusted-proxy that "
                     "terminates TLS, or --insecure-transport (trusted networks only)")
    users = load_users(args.users)
    token = args.token or (None if users or args.proxy_user_header else secrets.token_urlsafe(24))
    ssl_ctx = None
    if args.tls_cert:
        ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ssl_ctx.minimum_version = ssl.TLSVersion.TLSv1_2
        ssl_ctx.load_cert_chain(args.tls_cert, args.tls_key)
    relay = Relay(token, args.origin or ["null"], args.allow, args.cafile, args.port, users=users, users_file=args.users,
                  hosts=args.host, base_path=args.base_path, trusted_proxies=args.trusted_proxy,
                  proxy_user_header=args.proxy_user_header, session_hours=args.session_hours, tls=bool(ssl_ctx),
                  insecure_transport=args.insecure_transport)

    async def serve():
        server = await asyncio.start_server(relay.handle, args.bind, args.port, limit=MAX_HEADER, ssl=ssl_ctx)
        address = server.sockets[0].getsockname()
        shown = f"[{address[0]}]" if ":" in address[0] else address[0]
        print(f"Relay listening on {shown}:{address[1]}{' (TLS)' if ssl_ctx else ''}", flush=True)
        if token:
            print(f"Token: {token}", flush=True)
        if users:
            print(f"User accounts: {len(users)} ({args.users})", flush=True)
        if args.proxy_user_header:
            print(f"Users authenticated by the reverse proxy (header {args.proxy_user_header})", flush=True)
        async with server:
            await server.serve_forever()

    try:
        asyncio.run(serve())
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
