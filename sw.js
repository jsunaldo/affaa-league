// AFFAA hub service worker — offline support.
// site.bin is URL-versioned (?v=<salt prefix>) so cache-first is always safe:
// a new publish mints a new URL, and superseded versions are pruned on fetch.
// Everything else is network-first with cache fallback, so the app opens
// offline with the last payload this device saw (unlock still requires the
// remembered key in localStorage; nothing is stored decrypted).
const CACHE = 'affaa-v1';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(clients.claim()); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const path = u.pathname;
  if (/site\.bin$/.test(path)) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(e.request); if (hit) return hit;
      const resp = await fetch(e.request);
      if (resp.ok) {
        for (const k of await c.keys()) { const ku = new URL(k.url); if (ku.pathname === path && ku.search !== u.search) await c.delete(k); }
        c.put(e.request, resp.clone());
      }
      return resp;
    })());
  } else if (/\.(png|webmanifest)$/.test(path)) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(e.request); if (hit) return hit;
      const r = await fetch(e.request); if (r.ok) c.put(e.request, r.clone());
      return r;
    })());
  } else {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try { const r = await fetch(e.request); if (r.ok) c.put(e.request, r.clone()); return r; }
      catch (err) {
        const hit = await c.match(e.request, { ignoreSearch: path.endsWith('.bin') });
        if (hit) return hit;
        throw err;
      }
    })());
  }
});
