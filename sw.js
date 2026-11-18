/* Gestión del Dinero · service worker
   Primero intenta la red (para recibir cambios al momento) y, sin conexión,
   usa la copia guardada. Tus datos no pasan por aquí: están en IndexedDB. */
const VERSION = 'v3';
const CACHE = 'gestion-dinero-' + VERSION;
const SHELL = ['./', './index.html', './local-db.js', './mini-xlsx.js', './pwa.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('gestion-dinero-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const propio = url.origin === self.location.origin;
  const externo = /fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/.test(url.host);
  if (!propio && !externo) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (externo) {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req); if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res;
    }
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      return (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? cache.match('./index.html') : Response.error());
    }
  })());
});
