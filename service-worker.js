const CACHE_NAME = 'moethr-v10.7.1-2026.08.20.1';
const SCOPE = self.registration.scope;
const url = path => new URL(path, SCOPE).toString();
const APP_SHELL = [
  url('./'),
  url('./index.html'),
  url('./manifest.webmanifest'),
  url('./icon-192.png'),
  url('./icon-512.png'),
  url('./icon-maskable-512.png')
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const reqURL = new URL(event.request.url);
  if (reqURL.origin !== self.location.origin) return;

  // Pages/navigation: network first so a newly deployed build is picked up,
  // with the cached app shell as the offline fallback.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, {cache: 'no-store'})
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(url('./index.html'), copy));
          }
          return response;
        })
        .catch(async () =>
          (await caches.match(event.request)) ||
          (await caches.match(url('./index.html'))) ||
          (await caches.match(url('./')))
        )
    );
    return;
  }

  // Static app assets: serve cached immediately, refresh in background.
  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request).then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
