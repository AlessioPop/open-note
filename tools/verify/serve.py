#!/usr/bin/env python3
"""Serve the app under test and collect POSTed assertion reports."""
import sys, os, time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

ROOT = sys.argv[1]
PORT = int(sys.argv[2])
REPORT = os.path.join(ROOT, 'report.txt')


class H(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        p = urlparse(path).path.lstrip('/')
        return os.path.join(ROOT, p)

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == '/slow':                      # holds the load event open
            ms = int(parse_qs(u.query).get('ms', ['20000'])[0])
            time.sleep(ms / 1000.0)
            self.send_response(200)
            self.send_header('Content-Type', 'image/gif')
            self.end_headers()
            self.wfile.write(b'GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff'
                             b'!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00'
                             b'\x01\x00\x01\x00\x00\x02\x02D\x01\x00;')
            return
        return SimpleHTTPRequestHandler.do_GET(self)

    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(n).decode('utf-8', 'replace')
        with open(REPORT, 'a') as f:
            f.write(body + '\n')
        self.send_response(204)
        self.end_headers()

    def log_message(self, *a):
        pass


ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
