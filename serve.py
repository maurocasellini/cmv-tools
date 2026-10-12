#!/usr/bin/env python3
"""Local test server for dist/ – mimics vercel.json (headers + host routing).
Subdomains are simulated via ports:  python3 serve.py
  http://127.0.0.1:8810/  → /hub/, /scan/ … (like preview deployments)
  http://127.0.0.1:8811/ … 8821/  → scan, voice, image, video, translate, qr, pdf, hub, blockchaindemo, safe, time (like <app>.cmventures.xyz)
Every request is logged; a POST or any non-file request would show up here."""
import http.server
import json
import os
import re
import socketserver
import threading

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(HERE, "dist")
CFG = json.load(open(os.path.join(HERE, "vercel.json")))
PORTS = {8810: None, 8811: "scan", 8812: "voice", 8813: "image", 8814: "video", 8815: "translate", 8816: "qr", 8817: "pdf", 8818: "hub", 8819: "blockchaindemo", 8820: "safe", 8821: "time"}


def headers_for(path, app):
    host = f"{ {'hub': 'tools'}.get(app, app)}.cmventures.xyz" if app else "localhost"
    out = {}
    for rule in CFG["headers"]:
        rx = "^" + re.sub(r"\(\.\*\)", "(.*)", rule["source"]) + "$"
        if any(h["type"] == "host" and not re.fullmatch(h["value"], host) for h in rule.get("has", [])):
            continue
        if re.match(rx, path):
            for h in rule["headers"]:
                out[h["key"]] = h["value"]
    return out


def make_handler(app):
    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=DIST, **kw)

        def translate_path(self, path):
            p = path.split("?")[0]
            if app:
                p = f"/{app}/index.html" if p == "/" else f"/{app}{p}"
            return super().translate_path(p)

        def do_GET(self):
            if not app and self.path.split("?")[0] == "/":   # like the redirect in vercel.json
                self.send_response(302); self.send_header("Location", "/hub/"); self.end_headers(); return
            super().do_GET()

        def end_headers(self):
            for k, v in headers_for(self.path.split("?")[0], app).items():
                self.send_header(k, v)
            super().end_headers()

        def do_POST(self):
            print("!!! POST REACHED THE SERVER:", self.path, flush=True)
            self.send_error(405)

        def log_message(self, fmt, *args):
            if os.environ.get("QUIET") != "1" or not str(args[1]).startswith(("200", "304")):
                print(f"[{app or 'hub'}]", fmt % args, flush=True)
    return H


socketserver.TCPServer.allow_reuse_address = True
http.server.SimpleHTTPRequestHandler.extensions_map.update({".wasm": "application/wasm", ".webmanifest": "application/manifest+json", ".mjs": "text/javascript"})
servers = []
for port, app in PORTS.items():
    s = socketserver.ThreadingTCPServer(("127.0.0.1", port), make_handler(app))
    servers.append(s)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    print(f"http://127.0.0.1:{port}/ → {app or 'hub'}")
threading.Event().wait()
