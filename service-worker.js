
const CACHE_NAME = 'fight-cards-v90';

const APP_FILES = [
  './',
  './index.html',
  './fighter.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/theme.js',
  './js/cube.js',
  './js/fight-cards.js',
  './js/fighter-profile.js',
  './data/events.json',
  './data/fighters-cache.json',
  './data/fighter-images.json',
  './images/fighter-placeholder.png'
];

// Install the new service worker and cache the app shell.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
  );

  self.skipWaiting();
});

// Remove old caches and take control of open pages.
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(key => key.startsWith('fight-cards-') && key !== CACHE_NAME)
            .map(key => caches.delete(key))
        )
      ),
      self.clients.claim()
    ])
  );
});

// Network-first strategy: get the latest version whenever online.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Only handle requests from this website.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();

          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, copy);
          });
        }

        return response;
      })
      .catch(() =>
        caches.match(event.request).then(cached => {
          if (cached) return cached;
          return caches.match('./index.html');
        })
      )
  );
});
