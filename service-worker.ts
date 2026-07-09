const CACHE_NAME = 'trailmap-core-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './src/main.ts',
  './src/app/AppShell.ts'
];

self.addEventListener('install', (event: any) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Staging application core assets...');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => (self as any).skipWaiting())
  );
});

self.addEventListener('activate', (event: any) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Cleaning depreciated cache layer:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => (self as any).clients.claim())
  );
});

self.addEventListener('fetch', (event: any) => {
  if (event.request.method !== 'GET' || event.request.url.includes('@vite') || event.request.url.includes('node_modules')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch(() => {});
    })
  );
});
