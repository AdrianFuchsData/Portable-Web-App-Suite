"""Small IMAP and SMTP servers for tests of the mail client (no mail server installation needed).

IMAP: the commands the client uses (CAPABILITY, LOGIN, AUTHENTICATE PLAIN, STARTTLS, LIST, STATUS, SELECT/EXAMINE, FETCH,
SEARCH, STORE, COPY, MOVE, EXPUNGE, APPEND, CREATE, DELETE, RENAME, NOOP, LOGOUT, also with UID), literals with and
without LITERAL+, implicit TLS or STARTTLS. Folder names are stored in modified UTF-7, as on the wire.
SMTP: EHLO, STARTTLS, AUTH PLAIN/LOGIN, MAIL, RCPT, DATA, RSET, QUIT; received messages are kept in `messages`.
"""
import base64
import email
import email.policy
import email.utils
import re
import socketserver
import ssl
import threading
import time


def _ssl_context(cert, key):
    if not cert:
        return None
    ctx = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
    ctx.load_cert_chain(cert, key)
    return ctx


class _Server(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True


class _Stream:
    """Buffered line/byte reader on a socket that can be upgraded to TLS."""

    def __init__(self, sock):
        self.sock, self.buf = sock, b""

    def _more(self):
        data = self.sock.recv(65536)
        if not data:
            raise ConnectionError("closed")
        self.buf += data

    def line(self):
        while b"\r\n" not in self.buf:
            self._more()
        line, self.buf = self.buf.split(b"\r\n", 1)
        return line

    def read(self, n):
        while len(self.buf) < n:
            self._more()
        data, self.buf = self.buf[:n], self.buf[n:]
        return data

    def send(self, data):
        self.sock.sendall(data if isinstance(data, bytes) else data.encode())

    def upgrade(self, ctx):
        self.sock = ctx.wrap_socket(self.sock, server_side=True)
        self.buf = b""


# ---- IMAP --------------------------------------------------------------------------------------------------------------

class Message:
    def __init__(self, uid, raw, flags=(), date=None):
        self.uid, self.raw, self.flags = uid, raw, set(flags)
        self.date = date or time.time()

    def parsed(self):
        return email.message_from_bytes(self.raw, policy=email.policy.default)


class Folder:
    def __init__(self, name, special=""):
        self.name, self.special = name, special
        self.messages, self.uidnext, self.uidvalidity = [], 1, 1

    def add(self, raw, flags=(), date=None):
        m = Message(self.uidnext, raw, flags, date)
        self.uidnext += 1
        self.messages.append(m)
        return m


class ImapFake:
    def __init__(self, user="anna", password="secret", cert=None, key=None, implicit_tls=False, literal_plus=True,
                 move=True, auth_plain=True):
        self.user, self.password = user, password
        self.ctx = _ssl_context(cert, key)
        self.implicit_tls, self.literal_plus, self.move, self.auth_plain = implicit_tls, literal_plus, move, auth_plain
        self.lock = threading.RLock()
        self.folders = {}
        self.commands = []
        for name, special in (("INBOX", ""), ("Drafts", "\\Drafts"), ("Sent", "\\Sent"), ("Trash", "\\Trash"), ("Archiv", "\\Archive")):
            self.folders[name] = Folder(name, special)

    def deliver(self, raw, folder="INBOX", flags=()):
        with self.lock:
            return self.folders[folder].add(raw if isinstance(raw, bytes) else raw.encode(), flags)

    def capabilities(self, tls_active):
        caps = ["IMAP4rev1", "UIDPLUS", "SPECIAL-USE", "ID", "ENABLE"]
        if self.literal_plus:
            caps.append("LITERAL+")
        if self.move:
            caps.append("MOVE")
        if self.auth_plain:
            caps.append("AUTH=PLAIN")
        if self.ctx and not tls_active and not self.implicit_tls:
            caps.append("STARTTLS")
        return " ".join(caps)


def _tokens(data, literals):
    """Tokens of a command line (bytes with literal placeholders \\0n\\0)."""
    s = data.decode("utf-8", "replace")
    i, out, stack = 0, [], []
    cur = out
    while i < len(s):
        c = s[i]
        if c == " ":
            i += 1
        elif c == "(":
            stack.append(cur)
            new = []
            cur.append(new)
            cur = new
            i += 1
        elif c == ")":
            cur = stack.pop() if stack else out
            i += 1
        elif c == '"':
            i += 1
            v = ""
            while s[i] != '"':
                if s[i] == "\\":
                    i += 1
                v += s[i]
                i += 1
            i += 1
            cur.append(v)
        elif c == "\0":
            j = s.index("\0", i + 1)
            cur.append(literals[int(s[i + 1:j])])
            i = j + 1
        else:
            v, depth = "", 0
            while i < len(s) and (depth or s[i] not in " ()"):
                if s[i] == "[":
                    depth += 1
                elif s[i] == "]":
                    depth -= 1
                v += s[i]
                i += 1
            cur.append(v)
    return out


def _seqset(spec, maximum):
    out = set()
    for part in str(spec).split(","):
        a, _, b = part.partition(":")
        a = maximum if a == "*" else int(a)
        b = a if not b else (maximum if b == "*" else int(b))
        lo, hi = min(a, b), max(a, b)
        out.update(range(lo, hi + 1))
    return out


def _quote(s):
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _internaldate(ts):
    return time.strftime("%d-%b-%Y %H:%M:%S +0000", time.gmtime(ts))


def _header_fields(raw, names, negate=False):
    head = raw.split(b"\r\n\r\n", 1)[0] if b"\r\n\r\n" in raw else raw.split(b"\n\n", 1)[0]
    lines = re.split(rb"\r?\n(?![ \t])", head)
    wanted = {n.upper() for n in names}
    keep = [l for l in lines if (l.split(b":", 1)[0].decode("latin1").strip().upper() in wanted) != negate]
    return b"\r\n".join(keep) + b"\r\n\r\n"


class _ImapHandler(socketserver.BaseRequestHandler):
    def handle(self):
        fake = self.server.fake
        st = _Stream(self.request)
        tls = False
        if fake.implicit_tls:
            st.upgrade(fake.ctx)
            tls = True
        authed, folder, readonly, seen_exists = False, None, False, 0
        st.send(f"* OK [CAPABILITY {fake.capabilities(tls)}] fake IMAP ready\r\n")
        try:
            while True:
                line, literals = st.line(), []
                while True:
                    m = re.search(rb"\{(\d+)(\+?)\}$", line)
                    if not m:
                        break
                    if not m.group(2):
                        st.send("+ go ahead\r\n")
                    literals.append(st.read(int(m.group(1))))
                    line = line[:m.start()] + b"\0" + str(len(literals) - 1).encode() + b"\0" + st.line()
                t = _tokens(line, literals)
                if len(t) < 2:
                    continue
                tag, cmd, args = t[0], t[1].upper(), t[2:]
                uid = False
                if cmd == "UID":
                    uid, cmd, args = True, args[0].upper(), args[1:]
                with fake.lock:
                    fake.commands.append(("UID " if uid else "") + cmd)
                out = []

                def flush(last):
                    st.send(b"".join(o if isinstance(o, bytes) else o.encode() for o in out) + last.encode())

                def ok(text="completed"):
                    flush(f"{tag} OK {text}\r\n")

                def no(text):
                    flush(f"{tag} NO {text}\r\n")

                if cmd == "CAPABILITY":
                    out.append(f"* CAPABILITY {fake.capabilities(tls)}\r\n")
                    ok()
                elif cmd == "STARTTLS":
                    ok("begin TLS")
                    st.upgrade(fake.ctx)
                    tls = True
                elif cmd == "LOGIN":
                    u, p = (a.decode() if isinstance(a, bytes) else a for a in args[:2])
                    if u == fake.user and p == fake.password:
                        authed = True
                        ok("logged in")
                    else:
                        no("[AUTHENTICATIONFAILED] invalid credentials")
                elif cmd == "AUTHENTICATE":
                    data = args[1] if len(args) > 1 else None
                    if data is None:
                        st.send("+ \r\n")
                        data = st.line().decode()
                    parts = base64.b64decode(data).decode().split("\0")
                    if parts[1:] == [fake.user, fake.password]:
                        authed = True
                        ok("authenticated")
                    else:
                        no("[AUTHENTICATIONFAILED] invalid credentials")
                elif cmd == "LOGOUT":
                    st.send(f"* BYE bye\r\n{tag} OK logout\r\n")
                    return
                elif cmd in ("NOOP", "ENABLE", "ID", "CHECK"):
                    if folder and folder in fake.folders:
                        n = len(fake.folders[folder].messages)
                        if n != seen_exists:
                            out.append(f"* {n} EXISTS\r\n")
                            seen_exists = n
                    ok()
                elif not authed:
                    st.send(f"{tag} BAD not authenticated\r\n")
                elif cmd == "LIST" or cmd == "LSUB":
                    with fake.lock:
                        for f in fake.folders.values():
                            flags = ["\\HasNoChildren"] + ([f.special] if f.special else [])
                            out.append(f"* LIST ({' '.join(flags)}) \"/\" {_quote(f.name)}\r\n")
                    ok()
                elif cmd == "STATUS":
                    f = fake.folders.get(args[0])
                    if not f:
                        no("no such mailbox")
                        continue
                    unseen = sum(1 for m in f.messages if "\\Seen" not in m.flags)
                    out.append(f"* STATUS {_quote(f.name)} (MESSAGES {len(f.messages)} UNSEEN {unseen})\r\n")
                    ok()
                elif cmd in ("SELECT", "EXAMINE"):
                    f = fake.folders.get(args[0])
                    if not f:
                        folder = None
                        no("no such mailbox")
                        continue
                    folder, readonly, seen_exists = f.name, cmd == "EXAMINE", len(f.messages)
                    out += [f"* {len(f.messages)} EXISTS\r\n", "* 0 RECENT\r\n", "* FLAGS (\\Seen \\Answered \\Flagged \\Deleted \\Draft)\r\n",
                            f"* OK [UIDVALIDITY {f.uidvalidity}] ok\r\n", f"* OK [UIDNEXT {f.uidnext}] ok\r\n"]
                    ok(f"[{'READ-ONLY' if readonly else 'READ-WRITE'}] {cmd} completed")
                elif cmd == "CREATE":
                    fake.folders[args[0]] = Folder(args[0])
                    ok()
                elif cmd == "DELETE":
                    fake.folders.pop(args[0], None)
                    ok()
                elif cmd == "RENAME":
                    f = fake.folders.pop(args[0])
                    f.name = args[1]
                    fake.folders[args[1]] = f
                    ok()
                elif cmd == "APPEND":
                    f = fake.folders.get(args[0])
                    if not f:
                        no("[TRYCREATE] no such mailbox")
                        continue
                    flags = next((a for a in args[1:] if isinstance(a, list)), [])
                    raw = args[-1]
                    with fake.lock:
                        m = f.add(raw, flags)
                    ok(f"[APPENDUID {f.uidvalidity} {m.uid}] append completed")
                elif folder is None or folder not in fake.folders:
                    st.send(f"{tag} BAD no mailbox selected\r\n")
                else:
                    f = fake.folders[folder]
                    with fake.lock:
                        msgs = list(f.messages)

                    def select_set(spec):
                        if uid:
                            uids = _seqset(spec, max((m.uid for m in msgs), default=0))
                            return [(i + 1, m) for i, m in enumerate(msgs) if m.uid in uids]
                        seqs = _seqset(spec, len(msgs))
                        return [(i + 1, m) for i, m in enumerate(msgs) if i + 1 in seqs]

                    if cmd == "FETCH":
                        items = args[1] if isinstance(args[1], list) else args[1:]
                        for seq, m in select_set(args[0]):
                            parts = [f"UID {m.uid}"] if uid else []
                            literal_parts = []
                            for item in items:
                                it = item.upper()
                                if it == "UID":
                                    if not uid:
                                        parts.append(f"UID {m.uid}")
                                elif it == "FLAGS":
                                    pass
                                elif it == "INTERNALDATE":
                                    parts.append(f'INTERNALDATE "{_internaldate(m.date)}"')
                                elif it == "RFC822.SIZE":
                                    parts.append(f"RFC822.SIZE {len(m.raw)}")
                                elif it.startswith("BODY"):
                                    section = item[item.index("["):]
                                    sec = section[1:section.index("]")].upper()
                                    if sec == "":
                                        data = m.raw
                                    elif sec.startswith("HEADER.FIELDS"):
                                        names = re.findall(r"[\w-]+", sec[sec.index("(") + 1:])
                                        data = _header_fields(m.raw, names, negate=sec.startswith("HEADER.FIELDS.NOT"))
                                    elif sec == "HEADER":
                                        data = _header_fields(m.raw, [], negate=True)
                                    else:
                                        data = b""
                                    if not it.startswith("BODY.PEEK") and not readonly:
                                        m.flags.add("\\Seen")
                                    literal_parts.append((f"BODY{section}", data))
                            if any(i.upper() == "FLAGS" for i in items):
                                parts.append(f"FLAGS ({' '.join(sorted(m.flags))})")
                            data = f"* {seq} FETCH ({' '.join(parts)}".encode()
                            for name, body in literal_parts:
                                data += f"{' ' if parts else ''}{name} {{{len(body)}}}\r\n".encode() + body
                                parts = parts or ["x"]
                            out.append(data + b")\r\n")
                        ok("fetch completed")
                    elif cmd == "SEARCH":
                        crit = [a for a in args]
                        if crit and str(crit[0]).upper() == "CHARSET":
                            crit = crit[2:]
                        res = [m for m in msgs if _matches(m, crit)]
                        nums = [str(m.uid if uid else msgs.index(m) + 1) for m in res]
                        out.append("* SEARCH" + "".join(" " + n for n in nums) + "\r\n")
                        ok()
                    elif cmd == "STORE":
                        mode, flags = args[1].upper(), args[2] if isinstance(args[2], list) else args[2:]
                        for seq, m in select_set(args[0]):
                            if mode.startswith("+"):
                                m.flags |= set(flags)
                            elif mode.startswith("-"):
                                m.flags -= set(flags)
                            else:
                                m.flags = set(flags)
                            if not mode.endswith(".SILENT"):
                                out.append(f"* {seq} FETCH ({'UID %d ' % m.uid if uid else ''}FLAGS ({' '.join(sorted(m.flags))}))\r\n")
                        ok()
                    elif cmd in ("COPY", "MOVE"):
                        dest = fake.folders.get(args[1] if not isinstance(args[1], bytes) else args[1].decode())
                        if not dest:
                            no("[TRYCREATE] no such mailbox")
                            continue
                        chosen = select_set(args[0])
                        with fake.lock:
                            for _, m in chosen:
                                dest.add(m.raw, m.flags - {"\\Deleted"}, m.date)
                            if cmd == "MOVE":
                                for seq, m in sorted(chosen, key=lambda x: -x[0]):
                                    f.messages.remove(m)
                                    out.append(f"* {seq} EXPUNGE\r\n")
                                seen_exists = len(f.messages)
                        ok()
                    elif cmd == "EXPUNGE":
                        with fake.lock:
                            limit = {m.uid for _, m in select_set(args[0])} if uid else None
                            for seq in range(len(f.messages), 0, -1):
                                m = f.messages[seq - 1]
                                if "\\Deleted" in m.flags and (limit is None or m.uid in limit):
                                    f.messages.remove(m)
                                    out.append(f"* {seq} EXPUNGE\r\n")
                            seen_exists = len(f.messages)
                        ok()
                    elif cmd == "CLOSE":
                        folder = None
                        ok()
                    else:
                        st.send(f"{tag} BAD unknown command {cmd}\r\n")
        except (ConnectionError, OSError, ssl.SSLError):
            pass


def _matches(m, crit):
    i = 0
    msg = None
    while i < len(crit):
        c = str(crit[i]).upper()
        if c == "ALL":
            i += 1
            continue
        if c in ("SEEN", "UNSEEN", "FLAGGED", "UNFLAGGED", "DELETED", "UNDELETED", "ANSWERED"):
            flag = "\\" + c.replace("UN", "", 1).capitalize() if c.startswith("UN") else "\\" + c.capitalize()
            has = flag in m.flags
            if has == c.startswith("UN"):
                return False
            i += 1
            continue
        if c in ("TEXT", "SUBJECT", "FROM", "TO", "BODY"):
            needle = crit[i + 1]
            needle = (needle.decode() if isinstance(needle, bytes) else needle).lower()
            msg = msg or m.parsed()
            if c == "SUBJECT":
                hay = str(msg["subject"] or "")
            elif c in ("FROM", "TO"):
                hay = str(msg[c] or "")
            else:
                body = msg.get_body(("plain", "html"))
                hay = (body.get_content() if body else "") + ("" if c == "BODY" else " " + str(msg["subject"] or "") + " " + str(msg["from"] or ""))
            if needle not in hay.lower():
                return False
            i += 2
            continue
        i += 1
    return True


def start_imap(fake):
    server = _Server(("127.0.0.1", 0), _ImapHandler)
    server.fake = fake
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


# ---- SMTP --------------------------------------------------------------------------------------------------------------

class SmtpFake:
    def __init__(self, user="anna", password="secret", cert=None, key=None, implicit_tls=False, login_only=False):
        self.user, self.password = user, password
        self.ctx = _ssl_context(cert, key)
        self.implicit_tls, self.login_only = implicit_tls, login_only
        self.messages = []  # {"from", "to", "data", "user", "tls"}
        self.lock = threading.Lock()


class _SmtpHandler(socketserver.BaseRequestHandler):
    def handle(self):
        fake = self.server.fake
        st = _Stream(self.request)
        tls = False
        if fake.implicit_tls:
            st.upgrade(fake.ctx)
            tls = True
        user, sender, rcpts = None, None, []
        st.send("220 fake.smtp ESMTP ready\r\n")
        try:
            while True:
                line = st.line().decode("utf-8", "replace")
                verb = line.split(" ", 1)[0].upper()
                arg = line[len(verb) + 1:]
                if verb in ("EHLO", "HELO"):
                    ext = ["fake.smtp", "8BITMIME", "SMTPUTF8", "SIZE 10000000", "AUTH LOGIN" if fake.login_only else "AUTH PLAIN LOGIN"]
                    if fake.ctx and not tls:
                        ext.append("STARTTLS")
                    st.send("".join(f"250{'-' if i < len(ext) - 1 else ' '}{e}\r\n" for i, e in enumerate(ext)))
                elif verb == "STARTTLS":
                    st.send("220 go ahead\r\n")
                    st.upgrade(fake.ctx)
                    tls = True
                elif verb == "AUTH":
                    mech, _, initial = arg.partition(" ")
                    if mech.upper() == "PLAIN" and not fake.login_only:
                        parts = base64.b64decode(initial).decode().split("\0")
                        u, p = parts[1], parts[2]
                    else:
                        st.send("334 VXNlcm5hbWU6\r\n")
                        u = base64.b64decode(st.line()).decode()
                        st.send("334 UGFzc3dvcmQ6\r\n")
                        p = base64.b64decode(st.line()).decode()
                    if (u, p) == (fake.user, fake.password):
                        user = u
                        st.send("235 authenticated\r\n")
                    else:
                        st.send("535 5.7.8 authentication failed\r\n")
                elif verb == "MAIL":
                    if fake.user and not user:
                        st.send("530 5.7.0 authentication required\r\n")
                        continue
                    sender = re.search(r"<([^>]*)>", arg).group(1)
                    rcpts = []
                    st.send("250 ok\r\n")
                elif verb == "RCPT":
                    addr = re.search(r"<([^>]*)>", arg).group(1)
                    if addr.endswith("@invalid.example"):
                        st.send("550 5.1.1 no such user\r\n")
                        continue
                    rcpts.append(addr)
                    st.send("250 ok\r\n")
                elif verb == "DATA":
                    st.send("354 end with .\r\n")
                    lines = []
                    while True:
                        l = st.line()
                        if l == b".":
                            break
                        lines.append(l[1:] if l.startswith(b"..") else l)
                    with fake.lock:
                        fake.messages.append({"from": sender, "to": rcpts, "data": b"\r\n".join(lines) + b"\r\n", "user": user, "tls": tls})
                    st.send("250 2.0.0 queued\r\n")
                elif verb == "RSET":
                    sender, rcpts = None, []
                    st.send("250 ok\r\n")
                elif verb == "QUIT":
                    st.send("221 bye\r\n")
                    return
                else:
                    st.send("502 command not implemented\r\n")
        except (ConnectionError, OSError, ssl.SSLError):
            pass


def start_smtp(fake):
    server = _Server(("127.0.0.1", 0), _SmtpHandler)
    server.fake = fake
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def sample_message(subject="Hallo Anna", sender="Bernd Beispiel <bernd@example.com>", to="anna@example.com", text="Hallo,\nwie geht's? äöü\n",
                   html=None, attachments=(), date=None, message_id=None, calendar=None):
    """A MIME message (bytes) built with Python's email package."""
    msg = email.message.EmailMessage(policy=email.policy.SMTP)
    msg["From"], msg["To"], msg["Subject"] = sender, to, subject
    msg["Date"] = email.utils.format_datetime(date) if date else email.utils.formatdate(localtime=True)
    msg["Message-ID"] = message_id or email.utils.make_msgid(domain="example.com")
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    if calendar:
        msg.add_alternative(calendar, subtype="calendar", params={"method": "REQUEST"})
    for name, ctype, data in attachments:
        maintype, subtype = ctype.split("/")
        msg.add_attachment(data, maintype=maintype, subtype=subtype, filename=name)
    return msg.as_bytes()
