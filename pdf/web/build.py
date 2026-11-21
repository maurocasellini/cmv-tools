#!/usr/bin/env python3
"""Builds the web version of PDF Toolkit into web/dist/<base>/.

Everything runs in the browser (Pyodide + PyMuPDF as WebAssembly). Engine files are
downloaded from pinned sources and verified via SHA-256, so exactly these versions are
shipped. Only the Python standard library is required (works on Vercel too).

    python3 web/build.py                # app at the domain root, output in web/dist/
    python3 web/build.py --base /pdf/   # app below a sub-path
"""
import hashlib
import io
import json
import os
import shutil
import sys
import tarfile
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)  # pdf/
CACHE = os.path.join(HERE, ".vendor-cache")
BASE = "/"
if "--base" in sys.argv:
    BASE = ("/" + sys.argv[sys.argv.index("--base") + 1].strip("/") + "/").replace("//", "/")
DIST = os.path.join(HERE, "dist")
OUT = os.path.join(DIST, BASE.strip("/")) if BASE != "/" else DIST

PYODIDE = "0.29.5"
PYODIDE_TGZ = (f"https://registry.npmjs.org/pyodide/-/pyodide-{PYODIDE}.tgz",
               "6749b10ee515a1458ecea36d860c8ce2a48366e85b3f92d749ad1840e4aff181")
PYODIDE_FILES = ["pyodide.js", "pyodide.asm.js", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"]
WHEELS = {
    "numpy-2.2.5-cp313-cp313-pyemscripten_2025_0_wasm32.whl":
        "800c98edc0c864dfa49f07005680c699b4b42b84eae1f8cb19d35b3634e7f05c",
    "pillow-11.3.0-cp313-cp313-pyemscripten_2025_0_wasm32.whl":
        "57d88e2ac283c21830b4ee920cb73fbbf5c46df62d967089fce5fec46548bd7b",
    "pymupdf-1.28.2-cp313-abi3-pyemscripten_2025_0_wasm32.whl":
        "2e1b574c0fd2cb238021033fd3c0f9c4388816638df064e4bfb56d9d81736dc8",
}
WHEEL_SOURCES = {
    "pymupdf": ["https://files.pythonhosted.org/packages/58/8c/d897dcd32a25b58186c968b15ce4324ca029e9d96460de12325314e390be/{f}"],
    "default": [f"https://cdn.jsdelivr.net/pyodide/v{PYODIDE}/full/{{f}}"],
}
PYODIDE_FULL = f"https://github.com/pyodide/pyodide/releases/download/{PYODIDE}/pyodide-{PYODIDE}.tar.bz2"


def log(*a):
    print("  ", *a, flush=True)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def fetch(url, timeout=300):
    req = urllib.request.Request(url, headers={"User-Agent": "cmv-tools-build"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def cached(name, digest, urls):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if os.path.exists(path):
        with open(path, "rb") as fh:
            if sha256(fh.read()) == digest:
                return path
    for url in urls:
        try:
            log("downloading", url)
            data = fetch(url)
        except Exception as e:
            log("  unreachable:", e)
            continue
        if sha256(data) != digest:
            raise SystemExit(f"Checksum mismatch for {name} from {url}")
        with open(path, "wb") as fh:
            fh.write(data)
        return path
    return None


def wheels_from_full_release(missing):
    """Fallback: fetch the required wheels from the full Pyodide release (GitHub)."""
    log("downloading", PYODIDE_FULL, "(fallback)")
    req = urllib.request.Request(PYODIDE_FULL, headers={"User-Agent": "cmv-tools-build"})
    with urllib.request.urlopen(req, timeout=900) as r, tarfile.open(fileobj=r, mode="r|bz2") as tar:
        for m in tar:
            name = os.path.basename(m.name)
            if name in missing:
                data = tar.extractfile(m).read()
                if sha256(data) != WHEELS[name]:
                    raise SystemExit(f"Checksum mismatch for {name}")
                with open(os.path.join(CACHE, name), "wb") as fh:
                    fh.write(data)
                missing.discard(name)
                if not missing:
                    break
    if missing:
        raise SystemExit(f"Not found: {missing}")


def copytree(src, dst, ignore=()):
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(*ignore), dirs_exist_ok=True)


def replace_once(text, old, new):
    if old not in text:
        raise SystemExit(f"Build: text snippet not found: {old[:60]!r}")
    return text.replace(old, new, 1)


def build_index(version):
    with open(os.path.join(ROOT, "static", "index.html"), encoding="utf-8") as fh:
        h = fh.read()
    csp = ("default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; "
           "img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; "
           "media-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'")
    h = replace_once(h, '<meta charset="utf-8">', f'''<meta charset="utf-8">
<base href="{BASE}">
<meta http-equiv="Content-Security-Policy" content="{csp}">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="referrer" content="no-referrer">
<meta name="description" content="PDF-Werkzeuge, die komplett im Browser laufen. Keine Datei wird hochgeladen.">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="static/logo.svg" type="image/svg+xml">
<link rel="icon" href="icons/icon-64.png" type="image/png">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<meta name="theme-color" content="#242b41">''')
    h = replace_once(h, '<link rel="stylesheet" href="static/style.css">',
                     '<link rel="stylesheet" href="static/style.css">\n<link rel="stylesheet" href="web.css">')
    h = replace_once(h, '<script src="static/i18n.js"></script>\n<script src="static/tools.js"></script>\n<script src="static/app.js"></script>\n<script src="static/editor.js"></script>',
                     '<script src="static/i18n.js"></script>\n<div id="engine" class="engine"><div class="spinner"></div><span id="engine-text">PDF-Engine wird geladen …</span></div>\n'
                     f'<script src="boot.js?v={version}"></script>')
    # Texts for the website
    h = replace_once(h, '<div class="eyebrow accent">Lokaler PDF-Werkzeugkasten</div>',
                     '<div class="eyebrow accent">PDF-Werkzeugkasten im Browser</div>')
    h = replace_once(h, '<span class="local-badge" title="Alle Dateien bleiben auf diesem Mac. Nichts wird hochgeladen.">100 % lokal</span>',
                     '<span class="local-badge" title="Alle Dateien bleiben auf deinem Gerät. Nichts wird hochgeladen.">Kein Upload</span>')
    h = replace_once(h, '<h1>Alles, was du mit PDFs machen musst, <em>offline</em>.</h1>',
                     '<h1>Alles, was du mit PDFs machen musst – <em>ohne Upload</em>.</h1>')
    h = replace_once(h, 'direkt auf deinem Mac, ohne Upload.</p>',
                     'direkt in deinem Browser.</p>\n      <p class="privacy-note"><strong>So funktioniert’s:</strong> Die PDF-Engine läuft als WebAssembly in diesem Tab. '
                     'Deine Dateien werden nur in den Arbeitsspeicher deines Geräts gelesen – die Seite darf technisch keine Daten an einen Server senden. '
                     'Nach dem ersten Laden funktioniert sie sogar offline.</p>')
    h = replace_once(h, '<li>Dateien verlassen nie diesen Rechner</li>', '<li>Dateien verlassen nie dein Gerät</li>')
    h = replace_once(h, '<li>29 Werkzeuge in einer Oberfläche</li>', '<li>25 Werkzeuge, ohne Konto, ohne Limit</li>')
    h = replace_once(h, '<span>Läuft lokal auf 127.0.0.1 · keine Daten verlassen diesen Mac</span>',
                     '<span>Verarbeitung nur in deinem Browser · AGPL-3.0</span>')
    return h


def main():
    t0 = time.time()
    print("PDF Toolkit – web build →", OUT)
    shutil.rmtree(DIST, ignore_errors=True)
    os.makedirs(OUT)

    # 1) Engine (Pyodide core from npm, wheels from PyPI / Pyodide CDN)
    tgz = cached(f"pyodide-{PYODIDE}.tgz", PYODIDE_TGZ[1], [PYODIDE_TGZ[0]])
    if not tgz:
        raise SystemExit("Could not download Pyodide.")
    vend = os.path.join(OUT, "vendor", "pyodide")
    os.makedirs(vend)
    with tarfile.open(tgz) as tar:
        for f in PYODIDE_FILES:
            with tar.extractfile(f"package/{f}") as src, open(os.path.join(vend, f), "wb") as dst:
                shutil.copyfileobj(src, dst)
    missing = set()
    for name, digest in WHEELS.items():
        key = "pymupdf" if name.startswith("pymupdf") else "default"
        urls = [u.format(f=name) for u in WHEEL_SOURCES[key]]
        if not cached(name, digest, urls):
            missing.add(name)
    if missing:
        wheels_from_full_release(missing)
    wdir = os.path.join(OUT, "vendor", "wheels")
    os.makedirs(wdir)
    for name in WHEELS:
        shutil.copy(os.path.join(CACHE, name), wdir)

    # 2) App: same UI as the Mac app + web parts
    version = sha256("".join(sorted(WHEELS.values())).encode() + str(t0).encode())[:10]
    copytree(os.path.join(ROOT, "static"), os.path.join(OUT, "static"))
    os.makedirs(os.path.join(OUT, "py"))
    for f in ("pdftools.py", "scan.py"):
        shutil.copy(os.path.join(ROOT, f), os.path.join(OUT, "py"))
    shutil.copy(os.path.join(HERE, "webapi.py"), os.path.join(OUT, "py"))
    for f in ("boot.js", "worker.js", "web-tools.js", "web.css", "manifest.webmanifest"):
        shutil.copy(os.path.join(HERE, f), OUT)
    with open(os.path.join(HERE, "sw.js"), encoding="utf-8") as fh:
        sw = fh.read().replace("__BUILD__", version)
    with open(os.path.join(OUT, "sw.js"), "w", encoding="utf-8") as fh:
        fh.write(sw)
    copytree(os.path.join(HERE, "pdf-fonts"), os.path.join(OUT, "pdf-fonts"))
    copytree(os.path.join(HERE, "icons"), os.path.join(OUT, "icons"))
    with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8") as fh:
        fh.write(build_index(version))
    # project root → app
    if BASE != "/":
        with open(os.path.join(DIST, "index.html"), "w", encoding="utf-8") as fh:
            # Fallback only – normally Vercel redirects "/" to the app before this page is served
            fh.write(f'<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex">'
                     f'<meta name="viewport" content="width=device-width, initial-scale=1">'
                     f'<meta http-equiv="refresh" content="0; url={BASE}"><title>PDF Toolkit</title>'
                     f'<style>html,body{{margin:0;height:100%;background:#f1f1ec}}'
                     f'@media (prefers-color-scheme: dark){{html,body{{background:#1d2336}}}}</style>')
    with open(os.path.join(DIST, "robots.txt"), "w") as fh:
        fh.write("User-agent: *\nDisallow: /\n")

    size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(DIST) for f in fs)
    print(f"Done in {time.time() - t0:.1f}s · {size / 1048576:.1f} MB · Version {version}")


if __name__ == "__main__":
    main()
