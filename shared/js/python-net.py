"""Network functions of the Python notebook through the relay (shared/js/python-worker.js installs this file as suite.net and
calls install() at start).

* requests: with a relay set in the notebook (Files panel, "Relay"), every request of the module "requests" goes through the
  relay's /http – also when the notebook is opened as a file. Without a relay, requests behaves as usual in Pyodide (only servers
  that allow access from web pages, CORS).
* Sockets – only when the notebook is cross-origin isolated (served by the relay: relay.py --serve): socket.socket,
  socket.create_connection, socket.getaddrinfo and socket.gethostbyname open TCP connections through the relay, and
  ssl.SSLContext.wrap_socket switches such a connection to TLS in the relay (which checks the certificate unless the context
  does not verify). smtplib, ftplib (passive mode), imaplib, poplib, http.client, urllib.request and pure-Python database
  drivers work with them. Listening sockets, UDP and raw sockets are not possible; names are resolved by the relay.

    import suite.net
    suite.net.status()   # {"isolated": True, "relay": True, "sockets": True}
"""
import base64
import datetime
import errno
import importlib.abc
import json
import socket as _socket
import ssl as _ssl
import sys

import __main__

__all__ = ["status", "RelaySocket", "create_connection", "getaddrinfo"]

NOT_ISOLATED = ("Network connections from Python (sockets) need the notebook served by the relay (relay.py --serve, then open "
                "the address it prints): browsers only allow them on such pages. requests works without it through the relay.")
NO_RELAY = "No relay is set in the notebook (Files panel: Relay) or the relay at {0} does not answer."

_original = {"socket": _socket.socket, "create_connection": _socket.create_connection, "getaddrinfo": _socket.getaddrinfo,
             "gethostbyname": _socket.gethostbyname, "wrap_socket": getattr(_ssl.SSLContext, "wrap_socket", None)}
_SERVICES = {"http": 80, "https": 443, "ftp": 21, "smtp": 25, "submission": 587, "smtps": 465, "imap": 143, "imaps": 993,
             "pop3": 110, "pop3s": 995, "ssh": 22, "postgresql": 5432, "mysql": 3306}


def _message(e):
    return str(getattr(e, "message", e)).replace("Error: ", "", 1)


def _call(name, args=None, data=None):
    """A synchronous call of the page (shared/js/python-worker.js: _sync_call): a dict/list or bytes."""
    try:
        result = __main__._sync_call(name, json.dumps(args or {}), data)
    except Exception as e:  # (JavaScript errors: the page's localized message)
        text = _message(e)
        if "KeyboardInterrupt" in text:
            raise KeyboardInterrupt from None
        if "NOT_ISOLATED" in text:
            raise OSError(errno.ENETUNREACH, NOT_ISOLATED) from None
        raise OSError(errno.EIO, text) from None
    if isinstance(result, str):
        return json.loads(result)
    return result.to_bytes()


def isolated():
    return bool(__main__._sync_available)


def relay_configured():
    try:
        return bool(_call("relay.status")["configured"]) if isolated() else bool(__main__._relay_configured())
    except OSError:
        return False


def status():
    """{"isolated": the page is cross-origin isolated, "relay": a relay is set, "sockets": sockets work}"""
    relay = relay_configured()
    return {"isolated": isolated(), "relay": relay, "sockets": isolated() and relay}


# ---- sockets -----------------------------------------------------------------------------------------------------------

class RelaySocket:
    """A TCP connection through the relay with the interface of socket.socket (and, after wrap_socket, of ssl.SSLSocket)."""

    def __init__(self, family=_socket.AF_INET, type=_socket.SOCK_STREAM, proto=0, fileno=None):
        if fileno is not None or (int(type) & 0xF) != _socket.SOCK_STREAM:
            raise OSError(errno.EPROTONOSUPPORT, "only TCP connections are possible through the relay")
        self.family, self.type, self.proto = family, _socket.SOCK_STREAM, proto
        self._id = None
        self._timeout = _socket.getdefaulttimeout()
        self._peer = None
        self._closed = False
        self._io_refs = 0
        self.server_hostname = None
        self.session = None
        self.session_reused = False

    def __repr__(self):
        return f"<RelaySocket {self._peer[0]}:{self._peer[1]}>" if self._peer else "<RelaySocket (not connected)>"

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    # options and timeouts
    def settimeout(self, value):
        self._timeout = None if value is None else float(value)

    def gettimeout(self):
        return self._timeout

    def setblocking(self, flag):
        self._timeout = None if flag else 0.0

    def getblocking(self):
        return self._timeout != 0.0

    def setsockopt(self, *args):
        pass

    def getsockopt(self, *args):
        return 0

    def fileno(self):
        return -1

    def getpeername(self):
        return self._peer

    def getsockname(self):
        return ("0.0.0.0", 0)

    # connecting
    def connect(self, address):
        if self._id is not None:
            raise OSError(errno.EISCONN, "already connected")
        host, port = str(address[0]), int(address[1])
        self._id = _call("tcp.open", {"host": host, "port": port, "timeout": self._timeout})["id"]
        self._peer = (host, port)

    def connect_ex(self, address):
        try:
            self.connect(address)
            return 0
        except OSError as e:
            return e.errno or errno.ECONNREFUSED

    def bind(self, address):
        pass  # (source addresses are chosen by the relay)

    def listen(self, *args):
        raise OSError(errno.EOPNOTSUPP, "listening sockets are not possible through the relay (use passive mode, e.g. ftplib's default)")

    def _check(self):
        if self._closed:
            raise OSError(errno.EBADF, "the connection is closed")
        if self._id is None:
            raise OSError(errno.ENOTCONN, "not connected")

    # data
    def send(self, data, flags=0):
        self._check()
        data = bytes(data)
        if data:
            _call("tcp.send", {"id": self._id}, data)
        return len(data)

    def sendall(self, data, flags=0):
        self.send(data)

    def recv(self, bufsize, flags=0):
        self._check()
        result = _call("tcp.recv", {"id": self._id, "max": max(1, int(bufsize)), "timeout": self._timeout})
        if isinstance(result, dict):
            raise _socket.timeout("timed out")
        return result

    def read(self, length=1024, buffer=None):  # (ssl.SSLSocket)
        data = self.recv(length)
        if buffer is not None:
            buffer[:len(data)] = data
            return len(data)
        return data

    def write(self, data):  # (ssl.SSLSocket)
        return self.send(data)

    def recv_into(self, buffer, nbytes=0, flags=0):
        data = self.recv(nbytes or len(buffer))
        buffer[:len(data)] = data
        return len(data)

    def makefile(self, mode="r", buffering=None, *, encoding=None, errors=None, newline=None):
        # the standard library's implementation (SocketIO on recv_into/send)
        return _original["socket"].makefile(self, mode, buffering, encoding=encoding, errors=errors, newline=newline)

    def _decref_socketios(self):
        if self._io_refs > 0:
            self._io_refs -= 1

    def shutdown(self, how):
        pass

    def close(self):
        if not self._closed and self._id is not None:
            try:
                _call("tcp.close", {"id": self._id})
            except OSError:
                pass
        self._closed = True

    def detach(self):
        raise OSError(errno.EOPNOTSUPP, "a relay connection has no file descriptor")

    # TLS (in the relay)
    def _start_tls(self, server_hostname, insecure):
        self._check()
        _call("tcp.starttls", {"id": self._id, "insecure": bool(insecure)})
        self.server_hostname = server_hostname

    def do_handshake(self, block=False):
        pass

    def getpeercert(self, binary_form=False):
        return b"" if binary_form else {}

    def cipher(self):
        return ("TLS (relay)", "TLS", 0)

    def version(self):
        return "TLS (relay)"

    def selected_alpn_protocol(self):
        return None

    def pending(self):
        return 0

    def unwrap(self):
        return self


def create_connection(address, timeout=_socket._GLOBAL_DEFAULT_TIMEOUT, source_address=None, **kwargs):
    sock = RelaySocket()
    if timeout is not _socket._GLOBAL_DEFAULT_TIMEOUT:
        sock.settimeout(timeout)
    sock.connect(address)
    return sock


def getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    """The relay resolves names: the address is the name itself."""
    if isinstance(port, str):
        port = int(port) if port.isdigit() else _SERVICES.get(port.lower(), 0)
    host = "localhost" if host is None else (host.decode() if isinstance(host, bytes) else host)
    return [(_socket.AF_INET, _socket.SOCK_STREAM, _socket.IPPROTO_TCP, "", (host, port or 0))]


def gethostbyname(host):
    return host


def _wrap_socket(self, sock, server_side=False, do_handshake_on_connect=True, suppress_ragged_eofs=True, server_hostname=None, session=None):
    if isinstance(sock, RelaySocket):
        insecure = getattr(self, "verify_mode", _ssl.CERT_REQUIRED) == _ssl.CERT_NONE or not getattr(self, "check_hostname", True)
        sock._start_tls(server_hostname, insecure)
        return sock
    if _original["wrap_socket"] is None:
        raise OSError(errno.EOPNOTSUPP, "TLS is not available here")
    return _original["wrap_socket"](self, sock, server_side, do_handshake_on_connect, suppress_ragged_eofs, server_hostname, session)


# ---- requests through the relay's /http ----------------------------------------------------------------------------------

def _relay_send(adapter, request, timeout=None, verify=True):
    import requests
    body = request.body or b""
    if isinstance(body, str):
        body = body.encode("utf-8")
    elif not isinstance(body, (bytes, bytearray)):
        body = b"".join(part if isinstance(part, bytes) else str(part).encode() for part in body)
    if isinstance(timeout, tuple):
        timeout = sum(t for t in timeout if t)
    spec = {"method": request.method, "url": request.url, "headers": [[k, v] for k, v in request.headers.items()],
            "body": base64.b64encode(bytes(body)).decode("ascii") if body else None, "insecure": verify is False,
            "followRedirects": False, "timeout": timeout or 30}
    try:
        answer = json.loads(str(__main__._relay_http(json.dumps(spec))))
    except Exception as e:
        text = _message(e)
        if "NO_RELAY" in text:
            text = NO_RELAY.format(text.replace("NO_RELAY", "").strip() or "?")
        raise requests.exceptions.ConnectionError(text, request=request) from None
    if "error" in answer:
        raise requests.exceptions.ConnectionError(answer["error"], request=request)
    response = requests.models.Response()
    response.status_code = int(answer["status"])
    response.reason = answer.get("reason", "")
    response.headers = requests.structures.CaseInsensitiveDict()
    for name, value in answer.get("headers", []):
        response.headers[name] = f"{response.headers[name]}, {value}" if name in response.headers else value
    response._content = base64.b64decode(answer.get("body") or "")
    response._content_consumed = True
    response.url = answer.get("url") or request.url
    response.request = request
    response.connection = adapter
    response.encoding = requests.utils.get_encoding_from_headers(response.headers)
    response.elapsed = datetime.timedelta(milliseconds=answer.get("timeMs") or 0)
    return response


def _patch_requests(adapters):
    original = adapters.HTTPAdapter.send
    if getattr(original, "_suite_relay", False):
        return

    def send(self, request, stream=False, timeout=None, verify=True, cert=None, proxies=None):
        if relay_configured():
            return _relay_send(self, request, timeout=timeout, verify=verify)
        return original(self, request, stream=stream, timeout=timeout, verify=verify, cert=cert, proxies=proxies)

    send._suite_relay = True
    adapters.HTTPAdapter.send = send


class _RequestsHook(importlib.abc.MetaPathFinder):
    """Patches requests.adapters as soon as it is imported."""

    def find_spec(self, name, path, target=None):
        if name != "requests.adapters":
            return None
        for finder in sys.meta_path:
            if finder is self or not hasattr(finder, "find_spec"):
                continue
            spec = finder.find_spec(name, path, target)
            if spec and spec.loader:
                exec_module = spec.loader.exec_module

                def run(module, exec_module=exec_module):
                    exec_module(module)
                    _patch_requests(module)

                spec.loader.exec_module = run
                return spec
        return None


def install():
    if isolated():
        _socket.socket = _socket.SocketType = RelaySocket
        _socket.create_connection = create_connection
        _socket.getaddrinfo = getaddrinfo
        _socket.gethostbyname = gethostbyname
        _ssl.SSLContext.wrap_socket = _wrap_socket
    if "requests.adapters" in sys.modules:
        _patch_requests(sys.modules["requests.adapters"])
    sys.meta_path.insert(0, _RequestsHook())
