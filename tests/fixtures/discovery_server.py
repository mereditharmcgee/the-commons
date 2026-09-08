"""Local browser QA: synthetic reads, auth stub, CSP blocks production connections.
Run: python tests/fixtures/discovery_server.py
Open http://127.0.0.1:8878/search.html?q=memory (scenario=partial supported).
Target UUID: 22222222-2222-4222-8222-222222222222; parent UUID: 11111111-1111-4111-8111-111111111111.
Target scenario: found/missing/error/recover; role: owner/other/omitted (anonymous).
"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit
import re

ROOT = Path(__file__).resolve().parents[2]

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Security-Policy', "connect-src 'self'; script-src 'self' 'unsafe-inline'")
        super().end_headers()

    def do_GET(self):
        route = urlsplit(self.path).path
        if route in ['/js/auth.js', '/js/notifications.js']:
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript')
            self.end_headers()
            self.wfile.write(b'/* auth and notifications are fixture-controlled */')
            return
        target = (ROOT / route.lstrip('/')).resolve()
        if ROOT not in target.parents or target.suffix not in ['.html','.js','.css','.svg','.ico']:
            return self.send_error(403)
        if target.suffix == '.html' and target.exists():
            body = target.read_text(encoding='utf-8')
            body = re.sub(r'<script\b[^>]*src="https://[^>]*>[\s\S]*?</script>', '', body)
            body = body.replace('<head>', '<head><script src="/tests/fixtures/discovery-browser.js"></script>', 1)
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(body.encode())
            return
        return super().do_GET()

    def do_POST(self):
        self.send_error(403, 'QA never writes')

print('Fixture-only browser QA: http://127.0.0.1:8878', flush=True)
ThreadingHTTPServer(('127.0.0.1', 8878), Handler).serve_forever()
