// ═══════════════════════════════════════════════════════════════
// SERVICE WORKER — FinanzTracker PWA
// Cache-first for static assets, network-first for API calls.
// ═══════════════════════════════════════════════════════════════
const CACHE_VERSION = 'ft-v1';
const STATIC_ASSETS = [
  '/finanztracker1/',
  '/finanztracker1/index.html',
  '/finanztracker1/style.css',
  '/finanztracker1/manifest.json',
  '/finanztracker1/js/core.js',
  '/finanztracker1/js/data.js',
  '/finanztracker1/js/io.js',
  '/finanztracker1/js/groups.js',
  '/finanztracker1/js/charts.js',
  '/finanztracker1/js/render.js',
  '/finanztracker1/js/gas-src.js',
  '/finanztracker1/js/ui.js',
  '/finanztracker1/js/ui-auth.js',
  '/finanztracker1/js/ui-groups.js',
  '/finanztracker1/js/ui-settings.js',
  '/finanztracker1/js/portfolio.js',
  '/finanztracker1/js/design.js',
  '/finanztracker1/js/device.js',
  '/finanztracker1/js/init.js',
];

// Install: pre-cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Network-first for Google Apps Script API calls
  if (url.hostname === 'script.google.com' || url.hostname.endsWith('.script.google.com')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache successful GET responses for offline fallback
          if (event.request.method === 'GET' && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Network-first for external CDN resources (SheetJS, Google Fonts)
  if (url.hostname !== location.hostname) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for local static assets
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
