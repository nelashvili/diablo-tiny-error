/* Diablo Tiny Error service worker. Bump VERSION to invalidate all caches. */
const VERSION = 'v1';
const SHELL = `dte-shell-${VERSION}`;
const ASSETS = `dte-assets-${VERSION}`;
const RUNTIME = `dte-runtime-${VERSION}`;
const KEEP = new Set([SHELL, ASSETS, RUNTIME]);

const SHELL_URLS = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL);
      await Promise.all(SHELL_URLS.map((u) => shell.add(u).catch(() => {})));
      // Best effort: precache the hashed bundles referenced by index.html so the first visit works offline.
      try {
        const html = await (await fetch('/', { cache: 'no-cache' })).text();
        const urls = new Set(html.match(/\/assets\/[^"'\s)>]+/g) || []);
        const assets = await caches.open(ASSETS);
        await Promise.all([...urls].map((u) => assets.add(u).catch(() => {})));
      } catch (_) {
        /* offline during install: runtime caching will fill in */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith('dte-') && !KEEP.has(n)).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request, cacheName, fallbackKey) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(fallbackKey || request, res.clone());
    return res;
  } catch (err) {
    const hit = (await cache.match(fallbackKey || request)) || (await caches.match(request));
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const update = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return hit || (await update) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(networkFirst(request, SHELL, '/'));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }
  event.respondWith(staleWhileRevalidate(request, RUNTIME));
});
