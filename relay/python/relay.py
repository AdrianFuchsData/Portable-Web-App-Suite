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
  Listening (port forwarding; only a relay bound to a loopback address and without --no-listen, "listen" in /info features): first message
  {"token", "listen": {"port": N}} -> the relay listens on 127.0.0.1:N (N >= 1024, 0 = any) and answers {"ok": true, "port": N};
  for every incoming connection it sends {"op": "accept", "id": "..."}. Another WebSocket /tcp with {"token", "accept": "<id>"}
  takes that connection (within 30 s) and is a tunnel to it like above. Closing the listening WebSocket stops listening.
* POST /http (header X-Relay-Token) -> HTTP proxy, body {"method", "url", "headers": [[n, v]], "body": "<base64>",
  "insecure", "followRedirects", "timeout"}; answer {"status", "reason", "headers", "body", "url", "httpVersion",
  "timeMs"} or {"error"} with status 502.

Serving the apps (--serve DIR): other GET requests are answered with the files of DIR (the built apps) with the headers that
make the pages cross-origin isolated (Cross-Origin-Opener-Policy: same-origin, Cross-Origin-Embedder-Policy: require-corp), so the
notebook can interrupt Python and open network connections from Python; the relay's own origin is then allowed besides
--origin. The files need no token; the relay functions still do.

Upstream proxy (--upstream-proxy http://[user:password@]host:port, or "env" for HTTPS_PROXY/HTTP_PROXY/NO_PROXY): TCP tunnels are
opened through the proxy with CONNECT (TLS to the target on top), /http requests go through it as well; --no-proxy lists hosts
reached directly. Without the option, /http follows the proxy environment variables (Python's default) and tunnels go direct.

Security: credentials are only accepted over TLS (own certificate, or a trusted reverse proxy that reports
https) or from the local machine, unless --insecure-transport is given. The Origin must be allowed (default "null",
i.e. file:// pages), the Host header must be a loopback name or one given with --host (DNS rebinding), and
forwarded headers are only accepted from --trusted-proxy addresses. Failed logins are rate limited.

Usage:
    python3 relay.py [--port 8765] [--bind 127.0.0.1] [--token TOKEN] [--users users.json] [--origin ORIGIN ...]
                     [--allow PATTERN ...] [--cafile FILE] [--tls-cert cert.pem --tls-key key.pem] [--host NAME ...]
                     [--base-path /relay] [--trusted-proxy ADDR/CIDR ...] [--proxy-user-header X-Remote-User]
                     [--session-hours 12] [--insecure-transport] [--no-listen] [--serve DIR]
                     [--upstream-proxy http://host:port | env] [--no-proxy HOST ...]
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
import pathlib
import re
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


STATIC_TYPES = {".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
                ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json",
                ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
                ".wasm": "application/wasm", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8"}
# ---- installing the served apps as a web app (PWA) ----------------------------------------------------------------------------------
# With --serve, every page gets a web app manifest (NAME.webmanifest for NAME.html, generated) and the pages register a service worker
# (suite-sw.js): the browser can install the suite or a single app, and an installed app opens from its cache when the relay does not
# run. The served HTML gets a link to its manifest, a <meta name="suite-pwa"> for shell.js and the CSP directives for both.
PWA_SW = """// Portable Web App Suite: service worker of the apps served by the relay (network first, the last copy when the relay is not running)
const CACHE = 'suite-pwa-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || !/\\.(html|webmanifest|png|svg)$/.test(url.pathname)) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || Response.error())));
});
"""
PWA_ICON_SVG = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="113" fill="#1565c0"/>'
                '<g fill="#fff"><rect x="138" y="138" width="103" height="103" rx="23"/><rect x="271" y="138" width="103" height="103" rx="23"/>'
                '<rect x="138" y="271" width="103" height="103" rx="23"/><rect x="271" y="271" width="103" height="103" rx="23" fill-opacity=".67"/></g></svg>')
PWA_ICON_PNG = base64.b64decode(
    "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")
PWA_CSP = {"manifest-src": "'self'", "worker-src": "'self'"}


def pwa_manifest(name, start, own_icon):
    """The web app manifest of a served page (start: its file name; own_icon: the page has a favicon, served as NAME.icon.svg)."""
    stem = start.rsplit(".", 1)[0]
    icons = [{"src": f"{stem}.icon.svg", "sizes": "any", "type": "image/svg+xml"}] if own_icon else []
    icons += [{"src": "suite-icon.svg", "sizes": "any", "type": "image/svg+xml"}, {"src": "suite-icon-192.png", "sizes": "192x192", "type": "image/png"}]
    return json.dumps({
        "name": name, "short_name": name, "id": start, "start_url": start, "scope": "./", "display": "standalone",
        "background_color": "#ffffff", "theme_color": "#1565c0", "icons": icons,
    }, ensure_ascii=False).encode("utf-8")


def page_icon(head):
    """The SVG favicon of a page (a data: URL in <link rel="icon">), or None."""
    m = re.search(r'<link rel="icon" href="data:image/svg\+xml,([^"]+)"', head)
    return urllib.parse.unquote(m.group(1)).encode("utf-8") if m else None


def pwa_page(html, file_name):
    """A served page with its manifest link, the marker for shell.js and the CSP directives for the manifest and the service worker."""
    def csp(m):
        directives = [d.strip() for d in m.group(2).split(";") if d.strip()]
        for key, value in PWA_CSP.items():
            for i, d in enumerate(directives):
                if d.split()[0] == key:
                    if value not in d.split():
                        directives[i] = f"{d} {value}"
                    break
            else:
                directives.append(f"{key} {value}")
        return m.group(1) + "; ".join(directives) + m.group(3)
    html = re.sub(r'(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]*)(")', csp, html, count=1)
    stem = file_name.rsplit(".", 1)[0]
    tags = (f'<link rel="manifest" href="{stem}.webmanifest"><meta name="suite-pwa" content="suite-sw.js">'
            f'<meta name="theme-color" content="#1565c0">')
    # (right after <head>: inlined code further down may contain the text "</head>")
    m = re.search(r"<head\b[^>]*>", html, re.I)
    return html[:m.end()] + tags + html[m.end():] if m else html


# headers of served files: cross-origin isolated pages (SharedArrayBuffer for the notebook's interrupt and network functions)
ISOLATION = {"Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp",
             "Cross-Origin-Resource-Policy": "same-origin", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-cache"}


def parse_proxy(spec, no_proxy=()):
    """--upstream-proxy: None, or {"host", "port", "auth" (Proxy-Authorization value or None), "url"}; "env" reads the
    environment. Returns (proxy, no_proxy list)."""
    if not spec:
        return None, list(no_proxy)
    if spec == "env":
        spec = next((os.environ.get(k) for k in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy") if os.environ.get(k)), "")
        no_proxy = list(no_proxy) + [h for h in (os.environ.get("NO_PROXY") or os.environ.get("no_proxy") or "").split(",") if h.strip()]
        if not spec:
            return None, no_proxy
    parts = urllib.parse.urlsplit(spec if "://" in spec else "http://" + spec)
    if parts.scheme != "http" or not parts.hostname:
        raise ValueError(f"unsupported upstream proxy (only http://host:port): {spec}")
    auth = None
    if parts.username:
        creds = f"{urllib.parse.unquote(parts.username)}:{urllib.parse.unquote(parts.password or '')}"
        auth = "Basic " + base64.b64encode(creds.encode()).decode()
    return {"host": parts.hostname, "port": parts.port or 8080, "auth": auth, "url": urllib.parse.urlunsplit(parts._replace(path="", query="", fragment=""))}, \
        [h.strip() for h in no_proxy if h.strip()]


async def upgrade_tls(writer, ctx, host):
    """TLS on an open asyncio stream (STARTTLS, or a tunnel through a proxy)."""
    if hasattr(writer, "start_tls"):  # Python 3.11+
        await writer.start_tls(ctx, server_hostname=host)
    else:
        loop = asyncio.get_running_loop()
        transport = writer.transport
        new_transport = await loop.start_tls(transport, transport.get_protocol(), ctx, server_hostname=host)
        writer._transport = new_transport  # no public API before Python 3.11


class Relay:
    def __init__(self, token, origins, allow, cafile, port, users=None, users_file=None, hosts=(), base_path="",
                 trusted_proxies=(), proxy_user_header=None, session_hours=12, tls=False, insecure_transport=False,
                 serve=None, upstream_proxy=None, no_proxy=(), bind="127.0.0.1", no_listen=False):
        self.token = token
        # (port forwarding: only on the user's own machine, and not when switched off, e.g. for a relay of a public service)
        self.can_listen = is_loopback(bind) and not no_listen
        self.pending = {}  # id of an accepted connection -> (reader, writer, time)
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
        self.serve = pathlib.Path(serve).resolve() if serve else None
        self.proxy = upstream_proxy
        self.no_proxy = list(no_proxy)
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

    def proxy_for(self, host):
        """The upstream proxy for a target host, or None (no proxy, or the host is in --no-proxy)."""
        if not self.proxy:
            return None
        name = host.lower().strip("[]")
        for pattern in self.no_proxy:
            p = pattern.lower().strip()
            if p == "*" or fnmatch.fnmatch(name, p) or name == p.lstrip(".") or name.endswith("." + p.lstrip(".")):
                return None
        return self.proxy

    async def open_target(self, host, port, ssl_ctx):
        """A TCP connection to a target: direct, or through the upstream proxy (CONNECT); TLS on top if ssl_ctx."""
        proxy = self.proxy_for(host)
        if not proxy:
            return await asyncio.wait_for(asyncio.open_connection(host, port, ssl=ssl_ctx, server_hostname=host if ssl_ctx else None), 20)
        reader, writer = await asyncio.wait_for(asyncio.open_connection(proxy["host"], proxy["port"]), 20)
        try:
            target = f"[{host}]:{port}" if ":" in host else f"{host}:{port}"
            request = f"CONNECT {target} HTTP/1.1\r\nHost: {target}\r\n"
            if proxy["auth"]:
                request += f"Proxy-Authorization: {proxy['auth']}\r\n"
            writer.write((request + "\r\n").encode("latin-1"))
            await writer.drain()
            head = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), 20)
            status_line = head.split(b"\r\n", 1)[0].decode("latin-1")
            if len(status_line.split(" ")) < 2 or status_line.split(" ")[1] != "200":
                raise ConnectionError(f"upstream proxy: {status_line}")
            if ssl_ctx:
                await upgrade_tls(writer, ssl_ctx, host)
        except BaseException:
            writer.close()
            raise
        return reader, writer

    async def static(self, writer, path, head_only):
        """A file of --serve (no token needed: the built apps are public)."""
        rel = urllib.parse.unquote(path).lstrip("/")
        if not rel:
            start = next((n for n in ("overview.html", "index.html") if (self.serve / n).is_file()), None)
            if not start:
                raise HttpError(404, "not found")
            await self.write_response(writer, 302, "Found", {"Location": f"{self.base_path}/{start}"})
            return
        file = (self.serve / rel).resolve()
        virtual = self.pwa_file(rel)
        if virtual:
            body, kind = virtual
            headers = {"Content-Type": kind, **ISOLATION}
        else:
            if self.serve not in file.parents or not file.is_file() or any(part.startswith(".") for part in file.relative_to(self.serve).parts):
                raise HttpError(404, "not found")
            body = await asyncio.get_running_loop().run_in_executor(None, file.read_bytes)
            if file.suffix.lower() in (".html", ".htm") and file.parent == self.serve:
                body = pwa_page(body.decode("utf-8", "replace"), file.name).encode("utf-8")
            headers = {"Content-Type": STATIC_TYPES.get(file.suffix.lower(), "application/octet-stream"), **ISOLATION}
        if head_only:
            lines = [f"HTTP/1.1 200 OK"] + [f"{k}: {v}" for k, v in headers.items()] + [f"Content-Length: {len(body)}", "Connection: close", "", ""]
            writer.write("\r\n".join(lines).encode("latin-1"))
            await writer.drain()
        else:
            await self.write_response(writer, 200, "OK", headers, body)

    def pwa_file(self, rel):
        """(body, content type) of the generated PWA files (manifest, service worker, icons), or None."""
        if rel == "suite-sw.js":
            return PWA_SW.encode("utf-8"), "text/javascript; charset=utf-8"
        if rel == "suite-icon.svg":
            return PWA_ICON_SVG.encode("utf-8"), "image/svg+xml"
        if rel == "suite-icon-192.png":
            return PWA_ICON_PNG, "image/png"
        for suffix in (".webmanifest", ".icon.svg"):
            if not rel.endswith(suffix) or any(c in rel for c in "/\\") or rel.startswith("."):
                continue
            page = self.serve / (rel[: -len(suffix)] + ".html")
            if not page.is_file():
                return None
            head = page.read_bytes()[:8192].decode("utf-8", "replace")
            icon = page_icon(head)
            if suffix == ".icon.svg":
                return (icon, "image/svg+xml") if icon else None
            m = re.search(r"<title>([^<]*)</title>", head)
            name = (m.group(1).strip() if m else "") or page.stem
            return pwa_manifest(name if page.stem != "overview" else "Portable Web App Suite", page.name, bool(icon)), "application/manifest+json"
        return None

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
                                   "auth": self.auth_methods(), "tls": self.tls or (client["proxied"] and client["secure"]),
                                   "features": ["listen"] if self.can_listen else []})
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
            elif method in ("GET", "HEAD") and self.serve:
                await self.static(writer, path, method == "HEAD")
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
        if self.proxy:  # (without --upstream-proxy, urllib follows the proxy environment variables)
            proxy = self.proxy_for(urllib.parse.urlsplit(spec["url"]).hostname or "")
            handlers.append(urllib.request.ProxyHandler({"http": proxy["url"], "https": proxy["url"]} if proxy else {}))
            if proxy and proxy["auth"]:  # (urllib sends the credentials of the proxy URL only with CONNECT)
                request.add_header("Proxy-Authorization", proxy["auth"])
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
            if "listen" in spec:
                return await _relay_listen(self, ws, spec["listen"] or {})
            if "accept" in spec:
                taken = self.pending.pop(str(spec["accept"]), None)
                if not taken:
                    raise ValueError("no such connection (or it waited too long)")
                await ws.send_text(json.dumps({"ok": True}))
                await Tunnel(ws, taken[0], taken[1], "127.0.0.1", self).run()
                return
            host, port = str(spec["host"]), int(spec["port"])
            if not self.target_allowed(host, port, user):
                raise ValueError(f"target not allowed: {host}:{port}")
            ssl_ctx = self.tls_context(spec.get("insecure", False)) if spec.get("tls") else None
            tcp_reader, tcp_writer = await self.open_target(host, port, ssl_ctx)
        except Exception as e:
            await ws.send_text(json.dumps({"ok": False, "error": f"{type(e).__name__}: {e}" if not isinstance(e, ValueError) else str(e)}))
            await ws.close()
            return
        await ws.send_text(json.dumps({"ok": True}))
        await Tunnel(ws, tcp_reader, tcp_writer, host, self).run()


async def _relay_listen(relay, ws, spec):
    """Listen on 127.0.0.1 for a page (port forwarding): announce every incoming connection, keep it until a tunnel takes it."""
    if not relay.can_listen:
        raise ValueError("this relay does not listen on ports (only a relay on the local machine does, unless started with --no-listen)")
    port = int(spec.get("port") or 0)
    if port and not 1024 <= port <= 65535:
        raise ValueError("port must be between 1024 and 65535")
    ids = set()

    async def incoming(reader, writer):
        conn_id = secrets.token_hex(12)
        relay.pending[conn_id] = (reader, writer, time.monotonic())
        ids.add(conn_id)
        try:
            await ws.send_text(json.dumps({"op": "accept", "id": conn_id}))
        except Exception:
            writer.close()

    try:
        server = await asyncio.start_server(incoming, "127.0.0.1", port)
    except OSError as e:
        raise ValueError(f"cannot listen on port {port}: {e.strerror or e}")
    await ws.send_text(json.dumps({"ok": True, "port": server.sockets[0].getsockname()[1]}))

    async def expire():
        while True:
            await asyncio.sleep(5)
            for conn_id in list(ids):
                entry = relay.pending.get(conn_id)
                if entry is None:
                    ids.discard(conn_id)
                elif time.monotonic() - entry[2] > 30:
                    relay.pending.pop(conn_id, None)
                    ids.discard(conn_id)
                    entry[1].close()
    expiring = asyncio.ensure_future(expire())
    try:
        while True:
            opcode, _ = await ws.receive()
            if opcode is None or opcode == 8:
                break
    finally:
        expiring.cancel()
        server.close()
        for conn_id in ids:
            entry = relay.pending.pop(conn_id, None)
            if entry:
                entry[1].close()
        await ws.close()


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
            await upgrade_tls(self.tcp_writer, ctx, self.host)
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
    parser.add_argument("--no-listen", action="store_true", help="switch off port forwarding (listening on 127.0.0.1 for the SSH client), e.g. for a relay that serves a public site")
    parser.add_argument("--serve", metavar="DIR", help="also serve the apps in DIR (cross-origin isolated: interrupt and network functions of the notebook)")
    parser.add_argument("--upstream-proxy", metavar="URL", help='route outgoing connections through an HTTP proxy (http://[user:password@]host:port), or "env"')
    parser.add_argument("--no-proxy", action="append", default=[], help="host (or *.domain) reached without the upstream proxy; repeatable, comma-separated")
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
    if args.serve and not pathlib.Path(args.serve).is_dir():
        parser.error(f"--serve: no such folder: {args.serve}")
    try:
        upstream, no_proxy = parse_proxy(args.upstream_proxy, [h for v in args.no_proxy for h in v.split(",")])
    except ValueError as e:
        parser.error(str(e))
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
                  insecure_transport=args.insecure_transport, serve=args.serve, upstream_proxy=upstream, no_proxy=no_proxy,
                  bind=args.bind, no_listen=args.no_listen)

    async def serve():
        server = await asyncio.start_server(relay.handle, args.bind, args.port, limit=MAX_HEADER, ssl=ssl_ctx)
        address = server.sockets[0].getsockname()
        shown = f"[{address[0]}]" if ":" in address[0] else address[0]
        print(f"Relay listening on {shown}:{address[1]}{' (TLS)' if ssl_ctx else ''}", flush=True)
        if token:
            print(f"Token: {token}", flush=True)
        if args.serve:
            # the pages are served from the relay's own origin: allowed besides --origin
            scheme = "https" if ssl_ctx else "http"
            names = ["127.0.0.1", "localhost", "[::1]"] + [h for h in args.host if h != "*"]
            relay.origins |= {f"{scheme}://{n}:{address[1]}" for n in names}
            if address[1] in (80, 443):
                relay.origins |= {f"{scheme}://{n}" for n in names}
            local = "127.0.0.1" if is_loopback(address[0]) or address[0] in ("0.0.0.0", "::") else shown
            print(f"Serving the apps of {relay.serve}: {scheme}://{local}:{address[1]}{relay.base_path}/", flush=True)
        if upstream:
            print(f"Upstream proxy: {upstream['host']}:{upstream['port']}{' (with credentials)' if upstream['auth'] else ''}"
                  f"{'; direct: ' + ', '.join(no_proxy) if no_proxy else ''}", flush=True)
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
