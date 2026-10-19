const CACHE_NAME = 'shonen-v17';
const ASSETS = [
  './',
  './index.html',
  './watch.html',
  './style.css',
  './script.js',
  './watch.js',
  './manifest.json',
  './icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // The API and the cross-origin artwork are none of this worker's business,
  // so live data is never answered out of a stale cache.
  if (request.method !== 'GET' || url.origin !== self.location.origin ||
      url.pathname.startsWith('/api/')) {
    return;
  }

  // Network-first, with the cache as the offline fallback. This used to be
  // cache-first, which kept serving style.css and script.js long after a
  // deploy: bumping CACHE_NAME does not save the page you already have open,
  // so a reload could still paint the previous look.
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then(hit => {
        if (hit) return hit;
        if (request.mode === 'navigate') return caches.match('./index.html');
        throw new Error('offline');
      }))
  );
});

