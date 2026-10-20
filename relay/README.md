# Relay

Browser pages cannot open TCP connections. The relay is a small program that lets the apps of the suite reach TCP
services (IMAP, SMTP, SSH, SFTP, FTP, Postgres, …) through WebSockets, and HTTP services without CORS restrictions.
It is **optional**: every app works without it, only the network features need it.

It usually runs on the user's own machine. It can also run on another machine in the network or on a server, also
behind a reverse proxy (nginx, Apache, HAProxy), with user accounts.

There are several implementations of the same protocol, so the user can run whatever their system allows. None of
them needs admin rights, an installation or additional packages.

| Implementation | Start | Requirements |
|---|---|---|
| [`python/relay.py`](python/relay.py) | `python3 relay.py` (Windows: `py relay.py`) | Python 3.8+ (standard library only) |
| [`powershell/relay.ps1`](powershell/relay.ps1) | `powershell -ExecutionPolicy Bypass -File relay.ps1` or `pwsh -File relay.ps1` | Windows PowerShell 5.1 or PowerShell 7 (Windows, Linux, macOS); not in Constrained Language Mode |

## On the user's machine (default)

At start, the relay prints its address (default `127.0.0.1:8765`) and a random **token**. Enter both in the app's
relay settings (sign-in “Token”). Only programs on the same machine can connect.

## Shared relay with user accounts

1. Create accounts (asks for the password; at least 8 characters). The file holds PBKDF2-SHA256 hashes only and is
   used by both implementations:

   ```sh
   python3 relay.py --users users.json --add-user anna
   python3 relay.py --users users.json --add-user bob --allow-user 'mail.example.org:*'   # only these targets
   pwsh -File relay.ps1 -Users users.json -AddUser anna
   ```

2. Start the relay, either **with its own certificate**:

   ```sh
   python3 relay.py --bind 0.0.0.0 --users users.json --tls-cert cert.pem --tls-key key.pem --host relay.example.org
   pwsh -File relay.ps1 -Bind 0.0.0.0 -Users users.json -TlsCert relay.pfx -TlsPassword '…' -HostName relay.example.org
   ```

   or **behind a reverse proxy** that terminates TLS (see below):

   ```sh
   python3 relay.py --users users.json --base-path /relay --trusted-proxy 127.0.0.1 --host relay.example.org
   ```

3. Users enter `https://relay.example.org` (or `…/relay`), choose the sign-in “User name and password” and enter their
   account. The app logs in once (`POST /auth`) and then uses a session token; sessions end after 12 hours without use
   (`--session-hours`).

With `--users` and without `--token`, the token sign-in is switched off. Both can be combined.

## Options

| Python | PowerShell | Meaning |
|---|---|---|
| `--port N` | `-Port N` | Port (default 8765; 0 = any free port) |
| `--bind ADDR` | `-Bind ADDR` | Listening address (default `127.0.0.1`; `0.0.0.0` or `::` for all). Other addresses than loopback need TLS (own certificate or trusted proxy) or `--insecure-transport`. |
| `--token T` | `-Token T` | Fixed token instead of a random one (no token by default when accounts or proxy sign-in are used) |
| `--users F` | `-Users F` | User accounts (JSON: `{"users": {"name": {"hash": "pbkdf2-sha256$…", "allow": ["host:port", …]}}}`) |
| `--add-user NAME` | `-AddUser NAME` | Create or change an account in the `--users` file and exit; `--allow-user P` / `-AllowUser P` restricts its targets, `--password-stdin` / `-PasswordStdin` reads the password from standard input |
| `--tls-cert F --tls-key F` | `-TlsCert F [-TlsKey F] [-TlsPassword P]` | Serve HTTPS/WSS. Python: PEM files; PowerShell: `.pfx` (PowerShell 5.1 and 7) or PEM (PowerShell 7) |
| `--host NAME` | `-HostName NAME` | Allowed host names in requests besides `localhost`/`127.0.0.1` (protection against DNS rebinding); `*` allows any. Repeatable. |
| `--base-path P` | `-BasePath P` | Path prefix, e.g. `/relay` when the reverse proxy keeps it |
| `--trusted-proxy A` | `-TrustedProxy A` | Address or network (CIDR) of a reverse proxy; only its `X-Forwarded-For/-Proto/-Host` headers are used. Requests with forwarded headers from other addresses are refused. Repeatable. |
| `--proxy-user-header H` | `-ProxyUserHeader H` | Header with the user name that a trusted proxy has authenticated (client certificates, SSO); such requests need no relay credentials |
| `--session-hours N` | `-SessionHours N` | Idle time after which a login expires (default 12) |
| `--insecure-transport` | `-InsecureTransport` | Accept credentials without TLS from other machines (trusted networks only) |
| `--origin O` | `-Origin O` | Allowed page origin (default `null`, i.e. pages opened from `file://`). Add the origin of the hosted PWA variant if used. Repeatable. |
| `--allow P` | `-Allow P` | Allowed targets as `host:port` patterns (e.g. `*.example.org:993`) for everybody. Default: all. Repeatable. |
| `--cafile F` | `-CaFile F` | Additional trusted CA certificates (PEM) for TLS to the targets, e.g. a company CA |
| | `-Log` | Write errors to stderr |

PowerShell takes several values as `-Allow a,b` or as an array.

## Reverse proxy examples

The proxy must pass WebSocket upgrades on, allow long-lived connections and large requests (HTTP proxy bodies up to
64 MiB), and set `X-Forwarded-For`, `X-Forwarded-Proto` and `X-Forwarded-Host`. Start the relay on the proxy machine
with `--trusted-proxy 127.0.0.1 --base-path /relay --host relay.example.org` (and `--users users.json`).

**nginx**

```nginx
location /relay/ {
    proxy_pass http://127.0.0.1:8765;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_read_timeout 1d;
    proxy_send_timeout 1d;
    client_max_body_size 100m;
    proxy_buffering off;
}
```

**Apache** (`mod_proxy`, `mod_proxy_http`, `mod_proxy_wstunnel`, `mod_headers`; Apache 2.4.47+)

```apache
<Location "/relay/">
    ProxyPass "http://127.0.0.1:8765/relay/" upgrade=websocket timeout=86400
    ProxyPassReverse "http://127.0.0.1:8765/relay/"
    RequestHeader set X-Forwarded-Proto "https"
</Location>
ProxyPreserveHost On
LimitRequestBody 104857600
```

(`mod_proxy` adds `X-Forwarded-For` and `X-Forwarded-Host` itself.)

**HAProxy**

```haproxy
frontend https
    bind :443 ssl crt /etc/haproxy/relay.pem
    option forwardfor
    http-request set-header X-Forwarded-Proto https
    http-request set-header X-Forwarded-Host %[req.hdr(host)]
    use_backend relay if { path_beg /relay/ }

backend relay
    timeout tunnel 1d
    server relay 127.0.0.1:8765
```

**Sign-in by the proxy.** If the proxy authenticates users itself (client certificates, company SSO), let it pass the
user name in a header and start the relay with `--proxy-user-header X-Remote-User` (nginx:
`proxy_set_header X-Remote-User $ssl_client_s_dn_cn;`). Users then choose “Reverse proxy / client certificate”. Make sure
the proxy removes this header from client requests. Basic authentication by the proxy cannot be used: the apps cannot
send it with WebSocket connections.

## Protocol (version 2)

* `GET /info` → `{"relay": "portable-web-app-suite", "version": 2, "implementation": "…", "auth": ["token", "password", "proxy"], "tls": true|false}`
* `POST /auth` with `{"user", "password"}` → `{"token", "user", "expires"}` (unix time); `401` for wrong credentials,
  `429` after 5 failed attempts within 15 minutes (per user and per client address; the delay doubles up to 15 minutes).
  `POST /auth/logout` with header `X-Relay-Token` ends a session.
* **TCP tunnel:** WebSocket to `/tcp`. First message (text):
  `{"token", "host", "port", "tls": false, "insecure": false}` (`token`: relay token or session token; not needed with
  proxy sign-in); answer `{"ok": true}` or `{"ok": false, "error": "…"}`. Then binary messages carry the raw TCP data
  in both directions. Text messages are control messages: `{"op": "starttls", "insecure": false}` upgrades the
  connection to TLS (SMTP/IMAP STARTTLS, Postgres SSLRequest); answer `{"ok": true, "op": "starttls"}`.
* **HTTP proxy:** `POST /http` with header `X-Relay-Token` and body
  `{"method", "url", "headers": [[name, value]], "body": "<base64>", "insecure", "followRedirects", "timeout"}`;
  answer `{"status", "reason", "url", "httpVersion", "headers": [[name, value]], "body": "<base64>", "timeMs"}`
  or `{"error"}` with HTTP status 502. `401` with `invalid token` or `session expired` lets the client log in again.

Version 1 clients (token only) keep working. With a base path, all paths are below it (`/relay/info`, …).

TLS to the targets (`"tls": true`, `starttls`, `https://`) is handled by the relay, so the browser needs no TLS
implementation. SSH stays encrypted end to end by the SSH client in the browser.

## Security

* Listens on `127.0.0.1` by default. Other addresses need TLS (own certificate or a trusted reverse proxy that reports
  `https`) unless `--insecure-transport` is given; the relay refuses to start otherwise.
* Credentials (token, password, session) are only accepted over TLS or from the local machine.
* Every tunnel and proxy request needs the token, a session from a login, or a user authenticated by a trusted proxy.
* Passwords are stored as PBKDF2-SHA256 hashes (600,000 iterations); failed logins are rate limited; unknown users
  take as long as known ones.
* Requests from other web pages are rejected (the `Origin` header must be allowed), and so are requests with an
  unknown `Host` header (DNS rebinding). Forwarded headers are only trusted from `--trusted-proxy` addresses.
* Allow-lists of targets for everybody (`--allow`) and per account.

## Tests

`tests/relay/test_conformance.py` and `tests/relay/test_auth.py` run the same protocol tests against every
implementation (accounts, sessions, rate limiting, TLS listener, trusted proxies, base path), and
`tests/relay/test_browser.py` uses the browser client (`shared/js/relay.js`) from a `file://` page in Chromium and
Firefox, also with password sign-in through a TLS reverse proxy (`tests/helpers/reverse_proxy.py`). PowerShell tests
run if `pwsh` is on the `PATH` or in `.tools/pwsh/`.
