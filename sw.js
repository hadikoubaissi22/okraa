// اقرأ — service worker: offline app shell, Quran text, fonts and tafsir caching.
// Bump VERSION when shipping changes so installed apps pick them up cleanly.
const VERSION = 'okraa-v2.0.0';
const SHELL = `${VERSION}-shell`;
const RUNTIME = 'okraa-runtime';
const FONTS = 'okraa-fonts';

const PRECACHE = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js', 'js/store.js', 'js/ui.js', 'js/meta.js', 'js/quran.js', 'js/player.js', 'js/playerui.js',
  'js/reader.js', 'js/home.js', 'js/indexview.js', 'js/calendar.js', 'js/pages.js', 'js/hijri.js',
  'js/prayer.js', 'js/times.js', 'js/khatma.js',
  'data/quran.json',
  'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/icon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.endsWith('-shell') && k !== SHELL).map((k) => caches.delete(k)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

// Serve from cache immediately, refresh the cache in the background
async function staleWhileRevalidate(req, cacheName, event) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req, { ignoreSearch: cacheName === SHELL });
  const network = fetch(req).then((res) => {
    if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  if (cached) { event.waitUntil(network); return cached; }
  return (await network) || new Response('', { status: 504 });
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Recitation audio streams straight from the CDN (range requests)
  if (url.hostname === 'cdn.islamic.network' || req.destination === 'audio') return;

  // Pages: network first so new deployments show up, cached shell offline
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = (await e.preloadResponse) || await fetch(req);
        const cache = await caches.open(SHELL);
        cache.put('index.html', res.clone());
        return res;
      } catch {
        return (await caches.match('index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  if (url.origin === location.origin) {
    e.respondWith(staleWhileRevalidate(req, url.pathname.endsWith('search.json') ? RUNTIME : SHELL, e));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(req, FONTS));
    return;
  }
  if (url.hostname === 'api.alquran.cloud') {
    e.respondWith(staleWhileRevalidate(req, RUNTIME, e));
  }
});
