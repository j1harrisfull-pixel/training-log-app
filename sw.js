/* Training Log — service worker
   - Precaches the app shell for instant, offline-first loads
   - Navigations are served from the cached shell first (app-shell model)
   - Same-origin assets: cache-first with background fill
   - Google Fonts (CSS + font files): runtime cache, cache-first
   Bump CACHE_VERSION to ship a new shell. */

const CACHE_VERSION = "v2";
const SHELL_CACHE = `training-log-shell-${CACHE_VERSION}`;
const FONT_CACHE = `training-log-fonts-${CACHE_VERSION}`;

// Relative URLs so this works under any base path (e.g. GitHub Pages project page).
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
];

const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== FONT_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Cache-first helper that fills the given cache on a miss.
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && (response.ok || response.type === "opaque")) {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Google Fonts — runtime cache, cache-first.
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  // App navigations — offline-first: serve the cached shell, fall back to network.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const shell = (await cache.match("./index.html")) || (await cache.match("./"));
        if (shell) return shell;
        try {
          return await fetch(request);
        } catch (err) {
          return new Response("Offline", { status: 503, statusText: "Offline" });
        }
      })()
    );
    return;
  }

  // Same-origin assets — cache-first.
  if (url.origin === self.location.origin) {
    event.respondWith(
      cacheFirst(request, SHELL_CACHE).catch(() => fetch(request))
    );
    return;
  }

  // Everything else — network with cache fallback.
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
