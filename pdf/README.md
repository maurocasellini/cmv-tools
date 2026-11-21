# PDF Toolkit

A privacy-first PDF toolkit for the browser. All processing happens **inside the browser tab** – files are read into
your device’s memory and are never uploaded to any server.

The interface is available in **English and German** (auto-detected, switchable in the header) and adapts to light
and dark mode.

## How it works

- The PDF engine ([PyMuPDF](https://pymupdf.readthedocs.io)) runs as WebAssembly via [Pyodide](https://pyodide.org) in a web worker.
- A service worker intercepts every `api/…` request of the interface and answers it locally through that engine –
  the requests never reach the network.
- A Content Security Policy (`connect-src 'self'`) additionally forbids the page from connecting to any other server.
- Everything (engine, fonts, icons) is self-hosted – no third-party requests, no tracking, no cookies.
- After the first visit (~38 MB engine download, then cached) the site also works offline and can be installed as an app (PWA).
- Search engines are excluded (`noindex`, `robots.txt`).

## Features

| Area | Tools |
|---|---|
| Edit & sign | **Edit PDF** (text, date, images, check marks/crosses, white-out, highlight, shapes, redaction), **Sign PDF** (draw, type or upload a signature – saved in the browser for next time), **Fill in forms** (type straight into the PDF’s fields, optionally flatten), **Make it look scanned**, watermark, page numbers, crop, flatten, metadata |
| Organize | Merge (PDFs and images), split, remove pages, extract pages, organize (drag to reorder, rotate, duplicate, insert blank pages – across several PDFs), rotate |
| Optimize | **Compress to a target size** (e.g. 50 MB → 5 MB) or in three fixed levels, repair, grayscale |
| Convert | Images (JPG, PNG, WebP …) → PDF, PDF → JPG/PNG, extract text, extract images |
| Security & review | Password protection (AES-256), unlock, redact (terms, email addresses, IBANs, phone numbers), compare two PDFs |

Every result can be passed straight on to another tool without downloading it first
(e.g. sign → export as scan → compress).

### “Make it look scanned”

Makes a PDF look as if it had been printed and scanned again: slightly skewed and offset, paper tone, uneven lighting,
noise and dust specks – in grayscale, colour or black & white, with three strength levels. In the editor the same effect
is available as **“Export as scan”** when saving, so signing and “scanning” happen in one step.

### Editor tips

- Pick a tool in the toolbar and click on the page. Drag elements to move them, drag the corner to resize, press `⌫` to delete.
- Double-click text to edit it. `⌘Z` / `Ctrl+Z` undoes, `⌘D` / `Ctrl+D` duplicates.
- **“On all pages”** copies an element to every page – handy for initials.
- **Redact** permanently removes the content underneath. **White-out** only covers it with a white box.

### Limits

- Very large files (several hundred MB) are limited by the browser’s memory; files of 50–100 MB work fine.
- OCR and Office conversions (Word/Excel/PowerPoint) are not available, as they require external programs.
- Supported browsers: current versions of Safari, Chrome, Edge and Firefox (desktop and mobile).

## Development

Part of [CMV Tools](../README.md), served at `pdf.cmventures.xyz`.

```
python3 pdf/web/build.py     # build only the PDF Toolkit → pdf/web/dist/
python3 build.py pdf         # same, copied to dist/pdf/ (from the repository root)
python3 serve.py             # local test server → http://127.0.0.1:8817/
```

- `build.py` downloads the pinned engine files (Pyodide from npm, wheels from PyPI/Pyodide) and verifies them via SHA-256.
  Only the Python standard library is required.
- The root `serve.py` mimics the Vercel configuration and logs every request that does not hit a file – `/api` requests must never show up there.
- Deployment: the root `vercel.json` (one Vercel project for all CMV Tools).

```
pdftools.py       all PDF operations
scan.py           “make it look scanned” effect
static/           user interface (home, tools, editor, signature, DE/EN translation)
web/              web runtime: service worker, Pyodide worker, browser API, build & test server
```

## License

The PDF engine MuPDF/PyMuPDF is licensed under the [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html), so this
project is published under the AGPL-3.0 as well (see `../LICENSE`). Fonts: SIL Open Font License 1.1
(see `static/fonts` and `web/pdf-fonts`).
