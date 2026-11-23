const CACHE_NAME = 'lefrio-cache-v4';
const ASSETS_TO_CACHE = [
  '/manifest.json'
];

// Install Event - Pre-cache critical skeleton files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline skeleton');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Network first, fallback to cache for static assets.
// EXCLUDE firestore, auth, API routes and sw.js
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip Firebase/Firestore/Google API calls, Vite dev modules, API routes, sw.js, chrome-extensions and dev socket
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('identitytoolkit') ||
    url.pathname === '/sw.js' ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/api/') ||
    (url.hostname.includes('localhost') && url.port === '3000' && event.request.url.includes('socket')) || // ignore dev server websocket
    event.request.url.startsWith('chrome-extension:') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  const isNavigation = event.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html');

  event.respondWith(
    fetch(isNavigation ? new Request(event.request, { cache: 'no-store' }) : event.request)
      .then((response) => {
        // Cacheia apenas assets estáticos com hash/versão (evita prender index.html antigo)
        if (!isNavigation && response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Offline: Fallback to cache
        console.log('[Service Worker] Offline fallback for:', event.request.url);
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (isNavigation) {
            return caches.match('/');
          }
        });
      })
  );
});
