# CMV Tools

Everyday tools by CM Ventures that run **entirely in the browser**. Files are processed in the device’s memory and
are never uploaded. Each tool is a static site on its own subdomain; proven open-source engines do the work as
WebAssembly.

| Tool | Domain | Folder | Engines |
|---|---|---|---|
| Hub (overview) | `tools.cmventures.xyz` | [`hub/`](hub) | – |
| PDF Toolkit | `pdf.cmventures.xyz` | [`pdf/`](pdf) | MuPDF / PyMuPDF on Pyodide |
| Doc Scanner | `scan.cmventures.xyz` | [`scan/`](scan) | OpenCV.js, Tesseract.js (OCR), pdf-lib |
| Voice to Text | `voice.cmventures.xyz` | [`voice/`](voice) | Whisper via Transformers.js / ONNX Runtime, FFmpeg.wasm |
| Image Toolkit | `image.cmventures.xyz` | [`image/`](image) | Squoosh codecs (MozJPEG, WebP, AVIF, OxiPNG), libheif, exifr, IS-Net and YuNet via ONNX Runtime |
| Video Toolkit | `video.cmventures.xyz` | [`video/`](video) | FFmpeg.wasm (x264, LAME, libass for subtitles) |
| Translator | `translate.cmventures.xyz` | [`translate/`](translate) | Mozilla Bergamot + Firefox Translations models (de, en, fr, it, es) |
| File Safe | `safe.cmventures.xyz` | [`safe/`](safe) | Web Crypto API (AES-256-GCM, PBKDF2) – no third-party code |
| Time Zones | `time.cmventures.xyz` | [`time/`](time) | the browser’s IANA time zone database (Intl API) – no third-party code |
| QR Codes | `qr.cmventures.xyz` | [`qr/`](qr) | qrcode-generator, own SVG renderer |
| CM Ventures Blockchain Demo | `blockchaindemo.cmventures.xyz` | [`blockchaindemo/`](blockchaindemo) | none – own SHA-256, WebCrypto ECDSA |

## Privacy by design

- Content Security Policy `connect-src 'self'`: the pages cannot talk to any other server.
- All engines, models, fonts and icons are self-hosted – no third-party requests, no tracking, no cookies.
- OpenCV’s JavaScript bindings need `eval`, so the scanner’s image-processing worker (`scan/cv-worker.js`) – and
  only that worker – additionally allows `'unsafe-eval'`. It still cannot connect anywhere.
- Voice to Text is cross-origin isolated (COOP/COEP) for multi-threaded WebAssembly.
- A service worker caches each tool so it also works offline. Search engines are excluded (`noindex`, `robots.txt`).

## Structure

```
hub/ pdf/ scan/ voice/ image/ video/ translate/ qr/ safe/ time/   one folder per tool
blockchaindemo/           blockchain simulation for teaching, plus compliance mode Chain-Check (no engines, no vendor files)
shared/                   design (base.css, fonts), DE/EN translation (i18n.js), helpers, service worker
build.py                  builds dist/<tool>/ – downloads pinned npm packages, verifies SHA-256, self-hosts them;
                          runs pdf/web/build.py for the PDF Toolkit
serve.py                  local test server that mimics vercel.json (one port per subdomain)
make_icons.py             renders logo.svg → PNG icons (needs Playwright)
make_vercel.py            generates vercel.json (headers + host-based routing: <subdomain>.cmventures.xyz → dist/<tool>/)
make_licenses.py          generates THIRD_PARTY_LICENSES.md from hub/licenses.json
```

```
python3 build.py          # → dist/
python3 serve.py          # → http://127.0.0.1:8810/ (all tools as /<tool>/) and :8811 … :8819 (one per subdomain)
```

## Deployment (Vercel)

One Vercel project (`cmv-tools`, root directory = repository root) serves every tool. `vercel.json` maps each
subdomain to its folder in `dist/`.

Adding a tool: create its folder, add it to `VENDOR` and `APPS` in `build.py` and to `TOOLS` in `make_vercel.py`
(then run it), add its components to `hub/licenses.json` (then run `make_licenses.py`), and finally add the domain
in Vercel and a CNAME record in DNS.

Large model files (> 45 MB) are stored in parts (`vendor/split.json`) and stitched together in the browser.

## Licenses

This repository is licensed under the **AGPL-3.0** (see `LICENSE`), as required by MuPDF/PyMuPDF and the IS-Net model.
All third-party components with version, license and source are listed in
[`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md) and on the hub’s licenses page (tools.cmventures.xyz/#licenses).
Every tool links to its source code and to that page in its footer.
