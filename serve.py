# Локальный сервер для разработки: без кэша, чтобы браузер всегда брал свежие модули
# python serve.py  →  http://localhost:5180
import http.server
import os
import socketserver

PORT = 5180


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


os.chdir(os.path.dirname(os.path.abspath(__file__)))
socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), NoCache) as httpd:
    print(f"http://localhost:{PORT}")
    httpd.serve_forever()
