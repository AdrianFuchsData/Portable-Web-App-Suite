"""Pytest fixture: dist/ served over http://127.0.0.1 (for browser features that need an http origin, e.g. OPFS)."""
import functools
import http.server
import threading

import pytest

from helpers.paths import DIST


@pytest.fixture(scope="session")
def dist_server():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST))
    handler.log_message = lambda *args: None
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()
