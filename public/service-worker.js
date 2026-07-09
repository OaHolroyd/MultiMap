const APP_SHELL_CACHE = 'multimap-app-shell-v1';
const APP_SHELL_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './appicons/icon-180.png',
    './appicons/icon-192.png',
    './appicons/icon-512.png',
    './appicons/icon.ico'
];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        // Pre-cache the shell and install assets so the app can be reopened
        // even before any runtime requests have been cached.
        const cache = await caches.open(APP_SHELL_CACHE);
        await cache.addAll(APP_SHELL_ASSETS);
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();
        await Promise.all(
            cacheNames
                .filter((cacheName) => cacheName !== APP_SHELL_CACHE)
                .map((cacheName) => caches.delete(cacheName))
        );

        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const { request } = event;

    if (request.method !== 'GET') {
        return;
    }

    const requestUrl = new URL(request.url);

    if (request.mode === 'navigate') {
        event.respondWith(handleNavigationRequest(request));
        return;
    }

    if (requestUrl.origin === self.location.origin) {
        event.respondWith(handleStaticRequest(request));
    }
});

async function handleNavigationRequest(request) {
    try {
        const networkResponse = await fetch(request);
        const cache = await caches.open(APP_SHELL_CACHE);
        cache.put('./index.html', networkResponse.clone());
        return networkResponse;
    } catch {
        const cachedResponse = await caches.match('./index.html');
        return cachedResponse || Response.error();
    }
}

async function handleStaticRequest(request) {
    const cachedResponse = await caches.match(request);
    const fetchPromise = fetch(request)
        .then(async (networkResponse) => {
            const cache = await caches.open(APP_SHELL_CACHE);
            cache.put(request, networkResponse.clone());
            return networkResponse;
        })
        .catch(() => undefined);

    return cachedResponse || fetchPromise || Response.error();
}
