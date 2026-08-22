const CACHE_NAME = 'moethr-v11.2.4-2026.08.22.4';
const SCOPE = self.registration.scope;
const url = path => new URL(path, SCOPE).toString();

// Only cache files required for the app to start offline.
// Optional assets are cached opportunistically so one missing icon can never
// block installation of a new service worker.
const CORE_SHELL = [
  url('./index.html'),
  url('./manifest.webmanifest')
];
const OPTIONAL_ASSETS = [
  url('./icon-192.png'),
  url('./icon-512.png'),
  url('./icon-maskable-512.png')
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Core files must be fresh when this worker installs.
    for (const asset of CORE_SHELL) {
      const response = await fetch(asset, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Failed to cache core asset: ${asset}`);
      await cache.put(asset, response);
    }
    // Optional assets must never prevent an update from activating.
    await Promise.all(OPTIONAL_ASSETS.map(async asset => {
      try {
        const response = await fetch(asset, { cache: 'no-store' });
        if (response.ok) await cache.put(asset, response);
      } catch (_) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('moethr-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const reqURL = new URL(event.request.url);
  if (reqURL.origin !== self.location.origin) return;

  // HTML/navigation is ALWAYS network-first while online. This is the key
  // protection against an installed Moethr PWA remaining pinned to an old UI.
  if (event.request.mode === 'navigate' || reqURL.pathname.endsWith('/index.html')) {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request, { cache: 'no-store' });
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(url('./index.html'), response.clone());
        }
        return response;
      } catch (_) {
        return (await caches.match(url('./index.html'))) || Response.error();
      }
    })());
    return;
  }

  // Manifest is network-first as well so installed metadata can refresh.
  if (reqURL.pathname.endsWith('/manifest.webmanifest')) {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request, { cache: 'no-store' });
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, response.clone());
        }
        return response;
      } catch (_) {
        return (await caches.match(event.request)) || Response.error();
      }
    })());
    return;
  }

  // Static assets: cache-first for fast/offline startup, refresh in background.
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    const network = fetch(event.request, { cache: 'no-cache' }).then(async response => {
      if (response && response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
      }
      return response;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});
