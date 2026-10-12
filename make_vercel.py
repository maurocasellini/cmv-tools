#!/usr/bin/env python3
"""Generates vercel.json: security headers and host-based routing <subdomain>.cmventures.xyz → dist/<folder>/.
Add a new tool to TOOLS (and ISOLATED if it needs multi-threaded WebAssembly), then run:  python3 make_vercel.py"""
import json
import os

DOMAIN = "cmventures.xyz"
# subdomain → folder in dist/
TOOLS = {
    "tools": "hub", "pdf": "pdf", "scan": "scan", "voice": "voice", "blockchaindemo": "blockchaindemo",
    "image": "image", "video": "video", "translate": "translate", "qr": "qr", "safe": "safe", "time": "time",
}
# cross-origin isolated (COOP + COEP) → SharedArrayBuffer for multi-threaded WebAssembly
ISOLATED = ["voice", "image", "video", "translate"]

CSP = ("default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; "
       "font-src 'self'; connect-src 'self'; worker-src 'self' blob:; media-src 'self' blob:; object-src 'none'; base-uri 'self'; "
       "form-action 'none'; frame-ancestors 'none'")
# OpenCV.js (scanner worker) needs eval for its bindings – only that worker gets it
CSP_EVAL = CSP.replace("script-src 'self' 'wasm-unsafe-eval'", "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'")


def config():
    coep = [{"key": "Cross-Origin-Embedder-Policy", "value": "require-corp"}]
    headers = [
        {"source": "/(.*)", "headers": [
            {"key": "Content-Security-Policy", "value": CSP},
            {"key": "X-Robots-Tag", "value": "noindex, nofollow, noarchive"},
            {"key": "Referrer-Policy", "value": "no-referrer"},
            {"key": "X-Content-Type-Options", "value": "nosniff"},
            {"key": "Permissions-Policy", "value": "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()"},
            {"key": "Cross-Origin-Opener-Policy", "value": "same-origin"}]},
        {"source": "/(.*)cv-worker.js", "headers": [{"key": "Content-Security-Policy", "value": CSP_EVAL}]},
        # pages, styles and scripts: always revalidate (they also carry ?v=<build>); big engine files below are cached
        {"source": "/(.*).(html|css|js|mjs|json|webmanifest)", "headers": [{"key": "Cache-Control", "value": "no-cache"}]},
        {"source": "/", "headers": [{"key": "Cache-Control", "value": "no-cache"}]},
        {"source": "/(.*)vendor/(.*)", "headers": [{"key": "Cache-Control", "value": "public, max-age=2592000"}]},
    ]
    for folder in ISOLATED:
        sub = next(s for s, f in TOOLS.items() if f == folder)
        headers.append({"source": f"/{folder}/(.*)", "headers": coep})
        headers.append({"source": "/(.*)", "has": [{"type": "host", "value": f"{sub}.{DOMAIN}"}], "headers": coep})
    rewrites = []
    for sub, folder in TOOLS.items():
        host = [{"type": "host", "value": f"{sub}.{DOMAIN}"}]
        rewrites.append({"source": "/", "has": host, "destination": f"/{folder}/index.html"})
        rewrites.append({"source": "/:path*", "has": host, "destination": f"/{folder}/:path*"})
    return {
        "$schema": "https://openapi.vercel.sh/vercel.json",
        "framework": None,
        "installCommand": "echo no dependencies",
        "buildCommand": "python3 build.py",
        "outputDirectory": "dist",
        "cleanUrls": False,
        "trailingSlash": False,
        "headers": headers,
        # any other host (preview deployments): the hub, tools below /<folder>/
        "redirects": [{"source": "/", "missing": [{"type": "host", "value": "(" + "|".join(TOOLS) + r")\." + DOMAIN.replace(".", r"\.")}],
                       "destination": "/hub/", "permanent": False}],
        "rewrites": rewrites,
    }


if __name__ == "__main__":
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vercel.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(config(), fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    print("vercel.json written:", ", ".join(f"{s}.{DOMAIN}" for s in TOOLS))
