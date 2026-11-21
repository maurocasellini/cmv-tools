/* Starts the web version: connects the service worker and the PDF engine (web worker),
   then loads the same UI as the Mac app. */
(async () => {
  const BASE = document.baseURI; // e.g. https://example.com/pdf/
  const path = new URL(BASE).pathname;
  const scope = path === '/' ? '/' : path.replace(/\/$/, ''); // '/' or e.g. /pdf
  const loader = document.getElementById('engine');
  const loaderText = document.getElementById('engine-text');
  const fail = (text) => {
    loader.classList.add('failed');
    loaderText.textContent = text;
    loader.classList.remove('hidden');
  };

  if (!('serviceWorker' in navigator) || !window.WebAssembly) {
    fail('Dieser Browser wird nicht unterstützt. Bitte eine aktuelle Version von Safari, Chrome, Edge oder Firefox verwenden.');
    return;
  }

  // 1) Start the PDF engine in the background (first visit downloads ~25 MB, then served from cache)
  const worker = new Worker(new URL('worker.js', BASE));
  let engineReady;
  const ready = new Promise((r) => { engineReady = r; });
  const pending = new Map();
  let id = 0;
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'status') loaderText.textContent = m.text;
    else if (m.type === 'ready') { engineReady(); loader.classList.add('hidden'); document.body.classList.add('engine-ready'); }
    else if (m.type === 'failed') fail('Die PDF-Engine konnte nicht geladen werden: ' + m.text);
    else if (m.type === 'res') { const p = pending.get(m.id); pending.delete(m.id); if (p) p(m); }
  };
  const callEngine = (msg) => new Promise((resolve) => {
    const rid = ++id;
    pending.set(rid, resolve);
    const transfer = msg.body ? [msg.body.buffer] : [];
    worker.postMessage({ ...msg, type: 'req', id: rid }, transfer);
  });

  // 2) Forward requests from the service worker to the engine
  navigator.serviceWorker.addEventListener('message', async (e) => {
    if (!e.data || e.data.type !== 'api') return;
    const res = await callEngine(e.data);
    e.ports[0].postMessage({ status: res.status, headers: res.headers, body: res.body }, [res.body]);
  });
  navigator.serviceWorker.startMessages();

  // 3) Register the service worker and wait until it controls this page
  try {
    await navigator.serviceWorker.register(new URL('sw.js', BASE), { scope });
  } catch (err) {
    fail('Start fehlgeschlagen (Service Worker): ' + err.message);
    return;
  }
  if (!navigator.serviceWorker.controller) {
    await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
  }

  // 4) Load the UI (same files as the Mac app)
  window.PDFW_WEB = true;
  window.PDFW_ENGINE = ready;
  for (const src of ['static/tools.js', 'web-tools.js', 'static/app.js', 'static/editor.js']) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL(src, BASE).href;
      s.onload = resolve;
      s.onerror = reject;
      document.body.append(s);
    });
  }
})();
