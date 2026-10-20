"""A small Postgres protocol server for tests (no Postgres installation needed).

It speaks the frontend/backend protocol version 3: SSLRequest (optional TLS), startup, authentication (trust,
cleartext, md5, SCRAM-SHA-256) and the simple query protocol. Queries run on an in-memory SQLite database; the
information_schema query of the database tool is answered from SQLite's catalogue.
"""
import base64
import hashlib
import hmac
import os
import socketserver
import sqlite3
import ssl
import struct
import threading

TEXT, INT4, FLOAT8 = 25, 23, 701


class Fake:
    def __init__(self, user="anna", password="secret", auth="scram", cert=None, key=None):
        self.user, self.password, self.auth = user, password, auth
        self.tls = None
        if cert:
            self.tls = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
            self.tls.load_cert_chain(cert, key)
        self.db = sqlite3.connect(":memory:", check_same_thread=False, isolation_level=None)
        self.lock = threading.Lock()
        self.queries = []


def _msg(kind, body=b""):
    return kind + struct.pack("!i", len(body) + 4) + body


def _cstr(s):
    return s.encode() + b"\0"


def _recv(sock, n):
    data = b""
    while len(data) < n:
        chunk = sock.recv(n - len(data))
        if not chunk:
            raise ConnectionError("closed")
        data += chunk
    return data


def _read_message(sock):
    kind = _recv(sock, 1)
    (length,) = struct.unpack("!i", _recv(sock, 4))
    return kind, _recv(sock, length - 4)


def _error(message, code="42601"):
    return _msg(b"E", b"SERROR\0" + b"C" + _cstr(code) + b"M" + _cstr(message) + b"\0")


def _scram(sock, fake):
    sock.sendall(_msg(b"R", struct.pack("!i", 10) + b"SCRAM-SHA-256\0\0"))
    kind, body = _read_message(sock)
    mech_end = body.index(b"\0")
    (length,) = struct.unpack("!i", body[mech_end + 1:mech_end + 5])
    client_first = body[mech_end + 5:mech_end + 5 + length].decode()
    client_first_bare = client_first.split(",", 2)[2]
    client_nonce = dict(kv.split("=", 1) for kv in client_first_bare.split(","))["r"]
    salt, iterations = os.urandom(16), 4096
    nonce = client_nonce + base64.b64encode(os.urandom(18)).decode()
    server_first = f"r={nonce},s={base64.b64encode(salt).decode()},i={iterations}"
    sock.sendall(_msg(b"R", struct.pack("!i", 11) + server_first.encode()))
    kind, body = _read_message(sock)
    client_final = body.decode()
    final_no_proof, proof = client_final.rsplit(",p=", 1)
    salted = hashlib.pbkdf2_hmac("sha256", fake.password.encode(), salt, iterations)
    client_key = hmac.new(salted, b"Client Key", "sha256").digest()
    stored_key = hashlib.sha256(client_key).digest()
    auth_message = f"{client_first_bare},{server_first},{final_no_proof}".encode()
    signature = hmac.new(stored_key, auth_message, "sha256").digest()
    expected = bytes(a ^ b for a, b in zip(client_key, signature))
    if base64.b64decode(proof) != expected:
        return False
    server_key = hmac.new(salted, b"Server Key", "sha256").digest()
    server_signature = base64.b64encode(hmac.new(server_key, auth_message, "sha256").digest()).decode()
    sock.sendall(_msg(b"R", struct.pack("!i", 12) + f"v={server_signature}".encode()))
    return True


def _authenticate(sock, fake, user):
    if fake.auth == "trust":
        return True
    if fake.auth == "cleartext":
        sock.sendall(_msg(b"R", struct.pack("!i", 3)))
        _, body = _read_message(sock)
        return body.rstrip(b"\0").decode() == fake.password
    if fake.auth == "md5":
        salt = os.urandom(4)
        sock.sendall(_msg(b"R", struct.pack("!i", 5) + salt))
        _, body = _read_message(sock)
        inner = hashlib.md5((fake.password + user).encode()).hexdigest()
        return body.rstrip(b"\0").decode() == "md5" + hashlib.md5(inner.encode() + salt).hexdigest()
    return _scram(sock, fake)


def _oid(values):
    for v in values:
        if v is None:
            continue
        return INT4 if isinstance(v, int) else FLOAT8 if isinstance(v, float) else TEXT
    return TEXT


def _text(v):
    if v is None:
        return None
    return str(v).encode()


def _schema_rows(db):
    rows = []
    for name, kind in db.execute("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name"):
        for _, column, ctype, notnull, _, pk in db.execute(f'PRAGMA table_info("{name}")'):
            rows.append(("public", name, "VIEW" if kind == "view" else "BASE TABLE", column, (ctype or "text").lower(), "NO" if notnull else "YES", "t" if pk else "f"))
    return ["table_schema", "table_name", "table_type", "column_name", "data_type", "is_nullable", "pk"], rows


def _result(sock, columns, rows):
    oids = [_oid([r[i] for r in rows]) for i in range(len(columns))]
    body = struct.pack("!h", len(columns))
    for name, oid in zip(columns, oids):
        body += _cstr(name) + struct.pack("!ihihih", 0, 0, oid, -1, -1, 0)
    sock.sendall(_msg(b"T", body))
    for row in rows:
        out = struct.pack("!h", len(row))
        for v in row:
            t = _text(v)
            out += struct.pack("!i", -1) if t is None else struct.pack("!i", len(t)) + t
        sock.sendall(_msg(b"D", out))


def _handle(sock, fake):
    kind = None
    (length,) = struct.unpack("!i", _recv(sock, 4))
    body = _recv(sock, length - 4)
    if struct.unpack("!i", body[:4])[0] == 80877103:  # SSLRequest
        if fake.tls:
            sock.sendall(b"S")
            sock = fake.tls.wrap_socket(sock, server_side=True)
        else:
            sock.sendall(b"N")
        (length,) = struct.unpack("!i", _recv(sock, 4))
        body = _recv(sock, length - 4)
    params = body[4:].split(b"\0")
    startup = {params[i].decode(): params[i + 1].decode() for i in range(0, len(params) - 1, 2) if params[i]}
    user = startup.get("user", "")
    if user != fake.user or not _authenticate(sock, fake, user):
        sock.sendall(_error(f'password authentication failed for user "{user}"', "28P01"))
        return
    sock.sendall(_msg(b"R", struct.pack("!i", 0)))
    sock.sendall(_msg(b"S", _cstr("server_version") + _cstr("16.0 (fake)")))
    sock.sendall(_msg(b"K", struct.pack("!ii", 1, 2)))
    sock.sendall(_msg(b"Z", b"I"))
    while True:
        kind, body = _read_message(sock)
        if kind == b"X":
            return
        if kind != b"Q":
            sock.sendall(_error("only the simple query protocol is supported"))
            sock.sendall(_msg(b"Z", b"I"))
            continue
        query = body.rstrip(b"\0").decode()
        fake.queries.append(query)
        query = query.replace('"public".', "")  # SQLite has no schemas
        with fake.lock:
            if "information_schema.columns" in query:
                columns, rows = _schema_rows(fake.db)
                _result(sock, columns, rows)
                sock.sendall(_msg(b"C", _cstr(f"SELECT {len(rows)}")))
            else:
                statements = [s for s in sqlite3_split(query) if s.strip()]
                if not statements:
                    sock.sendall(_msg(b"I"))
                for statement in statements:
                    try:
                        cur = fake.db.execute(statement)
                        verb = statement.split()[0].upper()
                        if cur.description:
                            rows = cur.fetchall()
                            _result(sock, [d[0] for d in cur.description], rows)
                            sock.sendall(_msg(b"C", _cstr(f"SELECT {len(rows)}")))
                        else:
                            tag = f"INSERT 0 {cur.rowcount}" if verb == "INSERT" else f"{verb} {max(cur.rowcount, 0)}" if verb in ("UPDATE", "DELETE") else verb
                            sock.sendall(_msg(b"C", _cstr(tag)))
                    except sqlite3.Error as e:
                        sock.sendall(_error(str(e)))
                        break
        sock.sendall(_msg(b"Z", b"I"))


def sqlite3_split(text):
    """Split SQL at semicolons (statements are complete when sqlite3.complete_statement says so)."""
    out, current = [], ""
    for part in text.split(";"):
        current += part + ";"
        if sqlite3.complete_statement(current):
            out.append(current.strip().rstrip(";"))
            current = ""
    if current.strip(" ;\n"):
        out.append(current.strip().rstrip(";"))
    return out


class _Server(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True


def start(fake):
    class Handler(socketserver.BaseRequestHandler):
        def handle(self):
            try:
                _handle(self.request, fake)
            except (ConnectionError, OSError, ssl.SSLError):
                pass

    server = _Server(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server
