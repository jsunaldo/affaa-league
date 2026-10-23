// AFFAA hub service worker — offline support.
// site.bin, news.bin and lineups.bin are URL-versioned (?v=<salt prefix>) so cache-first is always safe:
// a new publish mints a new URL, and superseded versions are pruned on fetch.
// Everything else is network-first with cache fallback, so the app opens
// offline with the last payload this device saw (unlock still requires the
// remembered key in localStorage; nothing is stored decrypted).
const CACHE = 'affaa-v2';   // v2 (2026-09-11): all three payloads cache-first + versioned
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(clients.claim()); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const path = u.pathname;
  if (/\.bin$/.test(path)) {
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
// Phone notifications (affaa-sync worker, standard Web Push). Always show one: iPhones drop a subscription
// that stays silent. The text is the worker's generic line; a tap opens the hub at the matching view
// (?open=<view>#enter unlocks with the saved passphrase, then src/template.html's afOpenTarget routes).
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'AFFAA', { body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag,
    icon: new URL('icon-192.png', self.registration.scope).href, data: { open: String(d.open || '') } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const open = String((e.notification.data && e.notification.data.open) || '').replace(/[^a-z0-9-]/g, '').slice(0, 24);
  const url = new URL((open ? '?open=' + open : '') + '#enter', self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) if (c.url.startsWith(self.registration.scope) && 'focus' in c) { c.postMessage({ type: 'af-open', open, url }); return c.focus(); }
    return clients.openWindow(url);
  }));
});
