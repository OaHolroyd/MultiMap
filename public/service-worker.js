import { createOfflineTileResponse } from "./sw/offlineTileRouter.js";

const APP_SHELL_CACHE = "multimap-app-shell-v1";
const APP_SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./appicons/icon-180.png",
  "./appicons/icon-192.png",
  "./appicons/icon-512.png",
  "./appicons/icon.ico",
];
let offlineModeEnabled = false;
let tintOfflineTilesEnabled = false;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      // Pre-cache the shell and install assets so the app can be reopened
      // even before any runtime requests have been cached.
      const cache = await caches.open(APP_SHELL_CACHE);
      await cache.addAll(APP_SHELL_ASSETS);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "offline-config-updated") {
    offlineModeEnabled = event.data.offlineMode === true;
    tintOfflineTilesEnabled = event.data.tintOfflineTiles === true;
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== APP_SHELL_CACHE)
          .map((cacheName) => caches.delete(cacheName)),
      );

      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  console.log(`EVENT: fetch`);
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  event.respondWith(handleRequest(request));
});

async function handleRequest(request) {
  console.log(`handleRequest(${request})`);
  const requestUrl = new URL(request.url);
  console.log(`  URL: ${requestUrl}`);
  const offlineTileResponse = await createOfflineTileResponse(request, {
    tintOfflineTiles: tintOfflineTilesEnabled,
  });
  if (offlineTileResponse) {
    console.log(`  OFFLINE`);
    return offlineTileResponse;
  }

  if (requestUrl.origin === self.location.origin) {
    console.log(`  STATIC`);
    return handleStaticRequest(request);
  }

  if (offlineModeEnabled) {
    return new Response("Offline mode blocks external network requests.", {
      status: 503,
      statusText: "Offline Mode Enabled",
    });
  }

  console.log(`  ONLINE`);
  return fetch(request);
}

async function handleNavigationRequest(request) {
  try {
    const networkResponse = await fetch(request);
    const cache = await caches.open(APP_SHELL_CACHE);
    cache.put("./index.html", networkResponse.clone());
    return networkResponse;
  } catch {
    const cachedResponse = await caches.match("./index.html");
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
