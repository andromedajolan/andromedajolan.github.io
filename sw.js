// Ianua service worker. Serves ONLY Ianua's own listed files; every other request is left alone.
// Never touches another app's worker or cache, and never wipes site data.
const VERSION = '1.3.0'; // keep in sync with APP_VERSION in app.js
const PREFIX = 'ianua-cache-';
const CACHE = PREFIX + VERSION;
const ASSETS = [
  '/', '/index.html', '/app.css', '/app.js', '/registry.json', '/manifest.webmanifest',
  '/img/splash.webp',
  '/icons/ianua-96.png', '/icons/ianua-192.png', '/icons/ianua-512.png', '/icons/ianua-maskable-512.png',
  '/icons/stilus-96.png', '/icons/stilus-192.png',
  '/icons/sonorum-96.png', '/icons/sonorum-192.png',
  '/icons/effigies-96.png', '/icons/effigies-192.png',
  '/icons/annales-96.png', '/icons/annales-192.png',
  '/icons/notula-96.png', '/icons/notula-192.png'
];
const OWN = new Set(ASSETS);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  let path = url.pathname;
  if (!OWN.has(path)) return; // not ours: pass through untouched
  if (path === '/index.html') path = '/';
  event.respondWith(
    caches.open(CACHE).then((c) => c.match(path)).then((hit) => hit || fetch(req))
  );
});
