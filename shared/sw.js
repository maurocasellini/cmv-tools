/* Service worker shared by all tools: caches the app so it also works offline.
   It never sends anything anywhere – it only stores this site's own files. */
const VERSION = '__BUILD__';
const APP = '__APP__';
const CACHE = APP + '-' + VERSION;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith(APP + '-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || req.method !== 'GET') return;
  // Large, versioned engine files: cache first. Everything else: network first, cache when offline.
  const vendor = url.pathname.includes('/vendor/') || url.pathname.includes('/fonts/');
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (vendor) {
      const hit = await cache.match(req);
      if (hit) return hit;
    }
    try {
      const res = await fetch(req);
      if (res.ok && res.status === 200) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      throw err;
    }
  })());
});
