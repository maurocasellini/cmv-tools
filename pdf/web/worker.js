/* PDF engine in the browser: Pyodide (Python/WebAssembly) + PyMuPDF.
   Answers the same /api requests as the desktop server – but locally in the tab. */
/* global importScripts, loadPyodide */
const V = self.PDFW_VERSIONS || {};
const base = new URL('./', self.location.href).href;
importScripts(base + 'vendor/pyodide/pyodide.js');

const WHEELS = [
  'vendor/wheels/numpy-2.2.5-cp313-cp313-pyemscripten_2025_0_wasm32.whl',
  'vendor/wheels/pillow-11.3.0-cp313-cp313-pyemscripten_2025_0_wasm32.whl',
  'vendor/wheels/pymupdf-1.28.2-cp313-abi3-pyemscripten_2025_0_wasm32.whl',
];
const PDF_FONTS = ['Sans', 'Serif', 'Mono'].flatMap((f) => ['Regular', 'Bold', 'Italic', 'BoldItalic'].map((s) => `Liberation${f}-${s}.ttf`));
const NEEDS_FONTS = new Set(['edit', 'watermark', 'page_numbers']);

let py, api;
const status = (text) => self.postMessage({ type: 'status', text });

const ready = (async () => {
  status('PDF-Engine wird geladen …');
  py = await loadPyodide({ indexURL: base + 'vendor/pyodide/' });
  status('PDF-Bibliotheken werden geladen …');
  await py.loadPackage(WHEELS.map((w) => base + w));
  py.FS.mkdirTree('/app');
  for (const f of ['pdftools.py', 'scan.py', 'webapi.py']) {
    const r = await fetch(base + 'py/' + f);
    py.FS.writeFile('/app/' + f, new Uint8Array(await r.arrayBuffer()));
  }
  await py.runPythonAsync("import sys; sys.path.insert(0, '/app'); import webapi");
  api = py.pyimport('webapi');
  self.postMessage({ type: 'ready' });
})().catch((err) => {
  self.postMessage({ type: 'failed', text: String(err && err.message || err) });
  throw err;
});

let fontsLoaded = null;
function ensureFonts() {
  if (!fontsLoaded) {
    fontsLoaded = (async () => {
      py.FS.mkdirTree('/fonts');
      await Promise.all(PDF_FONTS.map(async (f) => {
        const r = await fetch(base + 'pdf-fonts/' + f);
        if (r.ok) py.FS.writeFile('/fonts/' + f, new Uint8Array(await r.arrayBuffer()));
      }));
    })();
  }
  return fontsLoaded;
}

// Python is single-threaded: process requests one after another
let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn));

const enc = new TextEncoder();
const json = (status, obj) => ({ status, headers: { 'Content-Type': 'application/json' }, body: enc.encode(typeof obj === 'string' ? obj : JSON.stringify(obj)) });
const MIME = { pdf: 'application/pdf', zip: 'application/zip', txt: 'text/plain; charset=utf-8', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };

function fromPy(proxy) {
  if (proxy == null) return null;
  if (typeof proxy !== 'object' || !proxy.toJs) return proxy;
  const v = proxy.toJs();
  proxy.destroy();
  return v;
}

async function handle(req) {
  await ready;
  const parts = req.path.split('/').filter(Boolean); // ['api', ...]
  const [, a, b, c, d] = parts;
  const q = new URLSearchParams(req.search || '');

  if (a === 'ping') return json(200, { ok: true, app: false, window: false, web: true });
  if (a === 'capabilities') return json(200, { ocr: false, office: false, pdf2docx: false, pptx: false, web: true });
  if (a === 'quit') return json(200, { ok: true });

  if (a === 'upload' && req.method === 'POST') {
    const out = [];
    for (const f of req.files || []) {
      const path = api.new_path(f.name);
      py.FS.writeFile(path, new Uint8Array(await f.arrayBuffer()));
      out.push(JSON.parse(fromPy(py.runPython(`import json, webapi; json.dumps(webapi.register(${JSON.stringify(path)}, ${JSON.stringify(f.name)}))`))));
    }
    return json(200, out);
  }

  if (a === 'run' && req.method === 'POST') {
    if (NEEDS_FONTS.has(b)) await ensureFonts();
    const body = new TextDecoder().decode(req.body || new Uint8Array());
    const [st, text] = fromPy(api.run_tool(b, body));
    return json(st, text);
  }

  if (a === 'file' && b) {
    if (!c) {
      const info = fromPy(api.file_info(b));
      return info ? json(200, info) : json(404, { error: 'Datei nicht gefunden' });
    }
    if (c === 'page') {
      const res = fromPy(api.page_image(b, parseInt(d, 10) || 0, parseInt(q.get('w') || '200', 10)));
      if (!res) return { status: 404, headers: {}, body: new Uint8Array() };
      return { status: 200, headers: { 'Content-Type': res[0], 'Cache-Control': 'max-age=3600' }, body: res[1] };
    }
    if (c === 'download' || c === 'raw') {
      const e = fromPy(api.file_entry(b));
      if (!e) return json(404, { error: 'Datei nicht gefunden' });
      const entry = JSON.parse(e);
      const data = py.FS.readFile(entry.path);
      const ext = entry.name.split('.').pop().toLowerCase();
      const name = encodeURIComponent(entry.name);
      return {
        status: 200,
        headers: {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'Content-Disposition': `${c === 'download' ? 'attachment' : 'inline'}; filename*=UTF-8''${name}`,
        },
        body: data,
      };
    }
  }
  return json(404, { error: 'Unbekannte Anfrage' });
}

self.onmessage = (e) => {
  const req = e.data;
  if (req.type !== 'req') return;
  serial(async () => {
    let res;
    try {
      res = await handle(req);
    } catch (err) {
      res = json(500, { error: 'Fehler in der PDF-Engine: ' + (err && err.message || err) });
    }
    const body = res.body instanceof Uint8Array ? res.body : new Uint8Array(res.body || []);
    const buf = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
    self.postMessage({ type: 'res', id: req.id, status: res.status, headers: res.headers, body: buf }, [buf]);
  });
};
