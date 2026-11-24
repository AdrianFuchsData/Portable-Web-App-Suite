"""A small MySQL protocol server for tests (no MySQL installation needed).

Client/server protocol 4.1: handshake v10, optional TLS (SSLRequest), authentication with mysql_native_password or
caching_sha2_password (fast path, or full authentication: cleartext over TLS, otherwise RSA-OAEP with the server's public key),
an authentication switch, COM_QUERY with several statements (results with SERVER_MORE_RESULTS_EXISTS), COM_PING, COM_QUIT.
Queries run on an in-memory SQLite database (backquotes work there too); the information_schema queries of the database tool
are answered from SQLite's catalogue.
"""
import hashlib
import os
import socketserver
import sqlite3
import ssl
import struct
import threading

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from helpers.pg_fake import sqlite3_split

CLIENT_SSL, CLIENT_CONNECT_WITH_DB, CLIENT_PLUGIN_AUTH, CLIENT_PLUGIN_AUTH_LENENC = 0x800, 0x8, 0x80000, 0x200000
CAPS = 0x1 | 0x2 | 0x4 | 0x8 | 0x200 | 0x2000 | 0x8000 | 0x10000 | 0x20000 | 0x80000
LONGLONG, DOUBLE, VAR_STRING, BLOB = 8, 5, 253, 252
MORE_RESULTS, AUTOCOMMIT = 0x8, 0x2


class Fake:
    def __init__(self, user="anna", password="secret", auth="sha2-fast", cert=None, key=None, database="demo"):
        self.user, self.password, self.auth, self.database = user, password, auth, database
        self.tls = None
        if cert:
            self.tls = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
            self.tls.load_cert_chain(cert, key)
        self.rsa = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.db = sqlite3.connect(":memory:", check_same_thread=False, isolation_level=None)
        self.lock = threading.Lock()
        self.queries = []
        self.log = []  # authentication steps


def lenenc(n):
    if n < 251:
        return bytes([n])
    if n < 1 << 16:
        return b"\xfc" + struct.pack("<H", n)
    if n < 1 << 24:
        return b"\xfd" + struct.pack("<I", n)[:3]
    return b"\xfe" + struct.pack("<Q", n)


def lenenc_str(b):
    b = b if isinstance(b, bytes) else str(b).encode()
    return lenenc(len(b)) + b


class Conn:
    def __init__(self, sock):
        self.sock, self.seq = sock, 0

    def recv_exact(self, n):
        out = b""
        while len(out) < n:
            chunk = self.sock.recv(n - len(out))
            if not chunk:
                raise ConnectionError("closed")
            out += chunk
        return out

    def read(self):
        head = self.recv_exact(4)
        length = head[0] | head[1] << 8 | head[2] << 16
        self.seq = (head[3] + 1) & 255
        return self.recv_exact(length)

    def send(self, payload):
        self.sock.sendall(struct.pack("<I", len(payload))[:3] + bytes([self.seq]) + payload)
        self.seq = (self.seq + 1) & 255

    def ok(self, affected=0, insert_id=0, status=AUTOCOMMIT):
        self.send(b"\x00" + lenenc(affected) + lenenc(insert_id) + struct.pack("<HH", status, 0))

    def err(self, code, state, message):
        self.send(b"\xff" + struct.pack("<H", code) + b"#" + state.encode() + message.encode())

    def eof(self, status=AUTOCOMMIT):
        self.send(b"\xfe" + struct.pack("<HH", 0, status))


def native(password, nonce):
    h1 = hashlib.sha1(password.encode()).digest()
    return bytes(a ^ b for a, b in zip(h1, hashlib.sha1(nonce + hashlib.sha1(h1).digest()).digest()))


def sha2(password, nonce):
    h1 = hashlib.sha256(password.encode()).digest()
    return bytes(a ^ b for a, b in zip(h1, hashlib.sha256(hashlib.sha256(h1).digest() + nonce).digest()))


def _authenticate(conn, fake, sock_holder):
    nonce = os.urandom(20).replace(b"\0", b"\1")
    plugin = "mysql_native_password" if fake.auth in ("native", "switch") else "caching_sha2_password"
    caps = CAPS | (CLIENT_SSL if fake.tls else 0)
    hello = (b"\x0a" + b"8.0.36-fake\0" + struct.pack("<I", 7) + nonce[:8] + b"\0" + struct.pack("<H", caps & 0xffff)
             + bytes([45]) + struct.pack("<H", AUTOCOMMIT) + struct.pack("<H", caps >> 16) + bytes([21]) + b"\0" * 10
             + nonce[8:] + b"\0" + plugin.encode() + b"\0")
    conn.seq = 0
    conn.send(hello)
    packet = conn.read()
    client_caps = struct.unpack("<I", packet[:4])[0]
    if len(packet) == 32 and client_caps & CLIENT_SSL:
        fake.log.append("tls")
        conn.sock = fake.tls.wrap_socket(conn.sock, server_side=True)
        sock_holder[0] = conn.sock
        packet = conn.read()
        client_caps = struct.unpack("<I", packet[:4])[0]
    tls = "tls" in fake.log
    p = 32
    end = packet.index(b"\0", p)
    user = packet[p:end].decode()
    p = end + 1
    if client_caps & CLIENT_PLUGIN_AUTH_LENENC:
        n = packet[p]
        p += 1
    else:
        n = packet[p]
        p += 1
    auth = packet[p:p + n]
    p += n
    if client_caps & CLIENT_CONNECT_WITH_DB and p < len(packet):
        end = packet.index(b"\0", p)
        p = end + 1
    client_plugin = packet[p:packet.index(b"\0", p)].decode() if client_caps & CLIENT_PLUGIN_AUTH and p < len(packet) else plugin
    fake.log.append(f"plugin:{client_plugin}")
    denied = lambda: conn.err(1045, "28000", f"Access denied for user '{user}'@'localhost' (using password: YES)")
    if user != fake.user:
        denied()
        return False
    if fake.auth == "native":
        if auth != native(fake.password, nonce):
            denied()
            return False
        conn.ok()
        return True
    if fake.auth == "switch":  # the client starts with mysql_native_password, the account wants caching_sha2_password
        nonce = os.urandom(20).replace(b"\0", b"\1")
        conn.send(b"\xfe" + b"caching_sha2_password\0" + nonce + b"\0")
        fake.log.append("switch")
        auth = conn.read()
        if auth != sha2(fake.password, nonce):
            denied()
            return False
        conn.send(b"\x01\x03")
        conn.ok()
        return True
    if fake.auth == "sha2-fast":
        if auth != sha2(fake.password, nonce):
            denied()
            return False
        conn.send(b"\x01\x03")
        conn.ok()
        return True
    # sha2-full: the scramble is not checked (cache empty), the password comes in full
    conn.send(b"\x01\x04")
    answer = conn.read()
    if tls:
        fake.log.append("cleartext")
        password = answer.rstrip(b"\0").decode()
    else:
        if answer != b"\x02":
            denied()
            return False
        pem = fake.rsa.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
        conn.send(b"\x01" + pem)
        encrypted = conn.read()
        fake.log.append("rsa")
        plain = fake.rsa.decrypt(encrypted, padding.OAEP(mgf=padding.MGF1(hashes.SHA1()), algorithm=hashes.SHA1(), label=None))
        password = bytes(a ^ nonce[i % len(nonce)] for i, a in enumerate(plain)).rstrip(b"\0").decode()
    if password != fake.password:
        denied()
        return False
    conn.ok()
    return True


def _schema(db, database):
    rows = []
    for name, kind in db.execute("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name"):
        for _, col, ctype, notnull, _, pk in db.execute(f'PRAGMA table_info("{name}")'):
            rows.append((database, name, "VIEW" if kind == "view" else "BASE TABLE", col, (ctype or "text").lower(), "NO" if notnull or pk else "YES", "PRI" if pk else ""))
    return ["TABLE_SCHEMA", "TABLE_NAME", "TABLE_TYPE", "COLUMN_NAME", "COLUMN_TYPE", "IS_NULLABLE", "COLUMN_KEY"], rows


def _foreign(db, database):
    rows = []
    for (name,) in db.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"):
        for row in db.execute(f'PRAGMA foreign_key_list("{name}")'):
            rows.append((database, name, row[3], database, row[2], row[4]))
    return ["TABLE_SCHEMA", "TABLE_NAME", "COLUMN_NAME", "REFERENCED_TABLE_SCHEMA", "REFERENCED_TABLE_NAME", "REFERENCED_COLUMN_NAME"], rows


def _result(conn, columns, rows, more):
    conn.send(lenenc(len(columns)))
    for i, name in enumerate(columns):
        values = [r[i] for r in rows if r[i] is not None]
        kind = LONGLONG if values and all(isinstance(v, int) for v in values) else DOUBLE if values and all(isinstance(v, (int, float)) for v in values) else BLOB if values and all(isinstance(v, bytes) for v in values) else VAR_STRING
        charset = 63 if kind in (LONGLONG, DOUBLE, BLOB) else 45
        conn.send(lenenc_str(b"def") + lenenc_str(b"demo") + lenenc_str(b"t") + lenenc_str(b"t") + lenenc_str(name) + lenenc_str(name)
                  + b"\x0c" + struct.pack("<HIBHB", charset, 255, kind, 0, 0) + b"\0\0")
    conn.eof()
    for r in rows:
        conn.send(b"".join(b"\xfb" if v is None else lenenc_str(v if isinstance(v, bytes) else str(v)) for v in r))
    conn.eof(AUTOCOMMIT | (MORE_RESULTS if more else 0))


def _handle(sock, fake):
    holder = [sock]
    conn = Conn(sock)
    if not _authenticate(conn, fake, holder):
        return
    while True:
        try:
            packet = conn.read()
        except (ConnectionError, OSError):
            return
        cmd = packet[0]
        if cmd == 0x01:  # COM_QUIT
            return
        if cmd in (0x0e, 0x02):  # COM_PING, COM_INIT_DB
            conn.ok()
            continue
        if cmd != 0x03:
            conn.err(1047, "08S01", "Unknown command")
            continue
        sql = packet[1:].decode()
        fake.queries.append(sql)
        if "information_schema.COLUMNS" in sql:
            _result(conn, *_schema(fake.db, fake.database), False)
            continue
        if "information_schema.KEY_COLUMN_USAGE" in sql:
            _result(conn, *_foreign(fake.db, fake.database), False)
            continue
        statements = [s for s in sqlite3_split(sql) if s.strip()]
        if not statements:
            conn.ok()
            continue
        with fake.lock:
            for i, stmt in enumerate(statements):
                more = i < len(statements) - 1
                try:
                    cur = fake.db.execute(stmt)
                    if cur.description:
                        _result(conn, [d[0] for d in cur.description], cur.fetchall(), more)
                    else:
                        conn.ok(max(cur.rowcount, 0), cur.lastrowid or 0, AUTOCOMMIT | (MORE_RESULTS if more else 0))
                except sqlite3.Error as e:
                    code, state = (1146, "42S02") if "no such table" in str(e) else (1064, "42000")
                    conn.err(code, state, str(e))
                    break


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
