const CACHE_VERSION = "self-wallet-v1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const PRECACHE_ROUTES = [
  "/offline",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_ROUTES)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key !== SHELL_CACHE && key !== STATIC_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API responses in the Service Worker; IndexedDB handles offline data
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Static Next.js build assets & icons: Stale-While-Revalidate / Cache-First
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response && response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          return cached || Response.error();
        }
      }),
    );
    return;
  }

  // Navigation requests: Network-First with cached route & offline fallbacks
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const shellCache = await caches.open(SHELL_CACHE);
        try {
          const networkResponse = await fetch(request);
          if (
            networkResponse &&
            networkResponse.ok &&
            !networkResponse.redirected &&
            !url.pathname.startsWith("/login") &&
            !url.pathname.startsWith("/register")
          ) {
            shellCache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          const cachedExact = await shellCache.match(request);
          if (cachedExact) return cachedExact;

          if (url.pathname.startsWith("/accounts/")) {
            const offlineAccountShell =
              await shellCache.match("/accounts/offline");
            if (offlineAccountShell) return offlineAccountShell;
          }

          const cachedDashboard = await shellCache.match("/dashboard");
          if (cachedDashboard && url.pathname === "/") {
            return cachedDashboard;
          }

          const offlineFallback = await shellCache.match("/offline");
          return (
            offlineFallback ||
            new Response("Offline — please reconnect to load Self Wallet.", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            })
          );
        }
      })(),
    );
    return;
  }

  // Other GET requests (RSC payloads, fonts, CSS, JS chunks)
  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok && !networkResponse.redirected) {
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch {
        const cached = await cache.match(request);
        return cached || Response.error();
      }
    }),
  );
});
