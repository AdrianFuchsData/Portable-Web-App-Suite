"""A tiny GraphQL endpoint for the tests: POST /graphql answers introspection queries with a fixed schema (Query.book(id),
Book.title/author, Author.name; Mutation.addBook) and echoes every other request as {"data": {"echo": {query, variables,
operationName}}}."""
import http.server
import json
import threading


def T(kind, name=None, of=None):
    return {"kind": kind, "name": name, "ofType": of}


SCHEMA = {"__schema": {
    "queryType": {"name": "Query"}, "mutationType": {"name": "Mutation"}, "subscriptionType": None,
    "types": [
        {"kind": "OBJECT", "name": "Query", "description": None, "fields": [
            {"name": "book", "description": "A book by id", "args": [{"name": "id", "type": T("NON_NULL", of=T("SCALAR", "ID")), "defaultValue": None}], "type": T("OBJECT", "Book")},
            {"name": "books", "description": None, "args": [], "type": T("NON_NULL", of=T("LIST", of=T("OBJECT", "Book")))}],
         "inputFields": None, "enumValues": None},
        {"kind": "OBJECT", "name": "Mutation", "description": None, "fields": [
            {"name": "addBook", "description": None, "args": [{"name": "title", "type": T("SCALAR", "String"), "defaultValue": None}], "type": T("OBJECT", "Book")}],
         "inputFields": None, "enumValues": None},
        {"kind": "OBJECT", "name": "Book", "description": None, "fields": [
            {"name": "title", "description": None, "args": [], "type": T("SCALAR", "String")},
            {"name": "author", "description": None, "args": [], "type": T("OBJECT", "Author")}], "inputFields": None, "enumValues": None},
        {"kind": "OBJECT", "name": "Author", "description": None, "fields": [
            {"name": "name", "description": None, "args": [], "type": T("SCALAR", "String")}], "inputFields": None, "enumValues": None},
        {"kind": "SCALAR", "name": "String", "description": None, "fields": None, "inputFields": None, "enumValues": None},
        {"kind": "SCALAR", "name": "ID", "description": None, "fields": None, "inputFields": None, "enumValues": None},
    ]}}


def graphql_server():
    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))) or b"{}")
            data = SCHEMA if "__schema" in body.get("query", "") else {"echo": {"query": body.get("query"), "variables": body.get("variables"),
                                                                              "operationName": body.get("operationName"), "contentType": self.headers.get("Content-Type")}}
            out = json.dumps({"data": data}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(out)))
            self.end_headers()
            self.wfile.write(out)

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server
