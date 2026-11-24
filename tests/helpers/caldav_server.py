"""A small CalDAV server for the calendar tests: Basic auth, /.well-known/caldav redirect, principal and calendar home discovery,
PROPFIND, REPORT calendar-query, PUT/DELETE with ETags (If-Match / If-None-Match). Calendars live in memory:
server.calendars = {"work": {"name": ..., "color": ..., "objects": {"name.ics": (etag, text)}}}."""
import base64
import hashlib
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote
from xml.sax.saxutils import escape

USER, PASSWORD = "anna", "geheim"
HOME = "/dav/calendars/anna/"
PRINCIPAL = "/dav/principals/anna/"


def etag_of(text):
    return '"%s"' % hashlib.sha1(text.encode()).hexdigest()[:16]


def multistatus(responses):
    body = "".join(f"<d:response><d:href>{escape(href)}</d:href><d:propstat><d:prop>{props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>"
                   for href, props in responses)
    return ('<?xml version="1.0" encoding="utf-8"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" '
            f'xmlns:cs="http://calendarserver.org/ns/" xmlns:a="http://apple.com/ns/ical/">{body}</d:multistatus>')


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def send(self, status, body=b"", headers=()):
        if isinstance(body, str):
            body = body.encode()
        self.send_response(status)
        for k, v in headers:
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def authorized(self):
        auth = self.headers.get("Authorization", "")
        ok = auth == "Basic " + base64.b64encode(f"{USER}:{PASSWORD}".encode()).decode()
        if not ok:
            self.send(401, "unauthorized", [("WWW-Authenticate", 'Basic realm="dav"')])
        return ok

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n).decode("utf-8") if n else ""

    def calendar_props(self, key):
        cal = self.server.calendars[key]
        comps = "".join(f'<c:comp name="{c}"/>' for c in cal.get("components", ["VEVENT", "VTODO"]))
        return (f"<d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:displayname>{escape(cal['name'])}</d:displayname>"
                f"<a:calendar-color>{cal.get('color', '#3a87adff')}</a:calendar-color><c:supported-calendar-component-set>{comps}</c:supported-calendar-component-set>"
                f"<cs:getctag>{len(cal['objects'])}-{sum(len(t) for _, t in cal['objects'].values())}</cs:getctag>")

    def do_PROPFIND(self):
        self.body()
        path = unquote(self.path)
        self.server.log.append(("PROPFIND", path, self.headers.get("Depth")))
        if path.startswith("/.well-known/caldav"):
            return self.send(301, "", [("Location", "/dav/")])
        if not self.authorized():
            return
        depth = self.headers.get("Depth", "0")
        if path in ("/dav/", "/dav"):
            return self.send(207, multistatus([("/dav/", f"<d:resourcetype><d:collection/></d:resourcetype><d:current-user-principal><d:href>{PRINCIPAL}</d:href></d:current-user-principal>")]),
                             [("Content-Type", "application/xml; charset=utf-8")])
        if path == PRINCIPAL:
            return self.send(207, multistatus([(PRINCIPAL, f"<d:resourcetype><d:principal/></d:resourcetype><c:calendar-home-set><d:href>{HOME}</d:href></c:calendar-home-set>")]),
                             [("Content-Type", "application/xml; charset=utf-8")])
        if path == HOME:
            items = [(HOME, "<d:resourcetype><d:collection/></d:resourcetype>")]
            if depth != "0":
                items += [(f"{HOME}{key}/", self.calendar_props(key)) for key in self.server.calendars]
                items.append((f"{HOME}contacts/", "<d:resourcetype><d:collection/></d:resourcetype><d:displayname>Contacts</d:displayname>"))
            return self.send(207, multistatus(items), [("Content-Type", "application/xml; charset=utf-8")])
        key = path[len(HOME):].strip("/")
        if path.startswith(HOME) and key in self.server.calendars:
            return self.send(207, multistatus([(f"{HOME}{key}/", self.calendar_props(key))]), [("Content-Type", "application/xml; charset=utf-8")])
        self.send(404, "not found")

    def do_REPORT(self):
        self.body()
        path = unquote(self.path)
        self.server.log.append(("REPORT", path, self.headers.get("Depth")))
        if not self.authorized():
            return
        key = path[len(HOME):].strip("/")
        cal = self.server.calendars.get(key)
        if not cal:
            return self.send(404, "not found")
        items = [(f"{HOME}{key}/{name}", f"<d:getetag>{escape(etag)}</d:getetag><c:calendar-data>{escape(text)}</c:calendar-data>")
                 for name, (etag, text) in cal["objects"].items()]
        self.send(207, multistatus(items), [("Content-Type", "application/xml; charset=utf-8")])

    def object(self):
        path = unquote(self.path)
        rest = path[len(HOME):]
        key, _, name = rest.partition("/")
        return self.server.calendars.get(key), name

    def do_PUT(self):
        text = self.body()
        self.server.log.append(("PUT", unquote(self.path), self.headers.get("If-Match"), self.headers.get("If-None-Match")))
        if not self.authorized():
            return
        cal, name = self.object()
        if cal is None or not name:
            return self.send(409, "conflict")
        existing = cal["objects"].get(name)
        if self.headers.get("If-None-Match") == "*" and existing:
            return self.send(412, "exists")
        match = self.headers.get("If-Match")
        if match and (not existing or existing[0] != match):
            return self.send(412, "changed")
        etag = etag_of(text)
        cal["objects"][name] = (etag, text)
        self.send(204 if existing else 201, "", [("ETag", etag)])

    def do_DELETE(self):
        self.server.log.append(("DELETE", unquote(self.path), self.headers.get("If-Match")))
        if not self.authorized():
            return
        cal, name = self.object()
        existing = cal and cal["objects"].get(name)
        if not existing:
            return self.send(404, "not found")
        match = self.headers.get("If-Match")
        if match and existing[0] != match:
            return self.send(412, "changed")
        del cal["objects"][name]
        self.send(204)


def start(calendars):
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.calendars = calendars
    server.log = []
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def put_object(server, key, name, text):
    server.calendars[key]["objects"][name] = (etag_of(text), text)
