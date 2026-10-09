#!/usr/bin/env python3
"""Static dev server for caninec.cz — like `python3 -m http.server`, but sends
Cache-Control: no-store so the browser never serves a stale index.html after an edit."""
import functools
import http.server
import sys

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8140
root = sys.argv[2] if len(sys.argv) > 2 else "."


class NoStoreHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


handler = functools.partial(NoStoreHandler, directory=root)
http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
