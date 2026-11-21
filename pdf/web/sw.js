/* Service worker of PDF Toolkit (web).
   1) Intercepts all “api/…” requests BEFORE they reach the network and answers them
      via the PDF engine in the browser tab. Nothing is ever sent to a server.
   2) Caches the app so it also works offline. */
const VERSION = '__BUILD__';
const CACHE = 'pdfw-' + VERSION;
const SCOPE = new URL(self.registration.scope).pathname.replace(/\/?$/, '/'); // e.g. /pdf/
const API = SCOPE + 'api/';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('pdfw-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

let seq = 0;
async function askClient(client, msg) {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 10 * 60 * 1000);
    ch.port1.onmessage = (e) => { clearTimeout(timer); resolve(e.data); };
    client.postMessage(msg, [ch.port2]);
  });
}

async function apiResponse(event) {
  const req = event.request;
  const url = new URL(req.url);
  const msg = { type: 'api', id: ++seq, method: req.method, path: url.pathname.slice(SCOPE.length), search: url.search };
  if (req.method === 'POST') {
    if ((req.headers.get('Content-Type') || '').startsWith('multipart/form-data')) {
      const fd = await req.formData();
      msg.files = fd.getAll('files');
    } else {
      msg.body = new Uint8Array(await req.arrayBuffer());
    }
  }
  // The tab that made the request – for downloads/new tabs: ask all open tabs
  const own = event.clientId ? await self.clients.get(event.clientId) : null;
  const candidates = own ? [own] : await self.clients.matchAll({ type: 'window' });
  for (const client of candidates) {
    const res = await askClient(client, msg);
    if (res && (res.status !== 404 || client === candidates[candidates.length - 1])) {
      return new Response(res.body, { status: res.status, headers: res.headers });
    }
  }
  return new Response(JSON.stringify({ error: 'PDF Toolkit ist in keinem Tab geöffnet.' }),
    { status: 404, headers: { 'Content-Type': 'application/json' } });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // other origins are blocked by CSP anyway
  if (url.pathname.startsWith(API)) { event.respondWith(apiResponse(event)); return; }
  if (event.request.method !== 'GET' || !url.pathname.startsWith(SCOPE.replace(/\/$/, ''))) return;
  // Engine files (large, versioned): cache first. Everything else: network first, cache when offline.
  const vendor = url.pathname.includes('/vendor/') || url.pathname.includes('/pdf-fonts/') || url.pathname.includes('/fonts/');
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (vendor) {
      const hit = await cache.match(event.request);
      if (hit) return hit;
    }
    try {
      const res = await fetch(event.request);
      if (res.ok) cache.put(event.request, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(event.request, { ignoreSearch: true });
      if (hit) return hit;
      throw err;
    }
  })());
});
