const CACHE_NAME = 'retro-pet-cache-test'; // Update this to invalidate old caches
const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './manifest.json',
  './icon/icon-512.png',
  './icon/favicon.ico',
  './icon/ball1.png',
  './icon/ball2.png',
  './icon/ball3.png',
  './icon/cake1.png',
  './icon/cake2.png',
  './icon/cake3.png',
  './icon/cake4.png',
  './icon/pig-left.png',
  './icon/pig-right.png',
  './icon/pig-sleep.png',
  './icon/pig-sleepR.png',
  './icon/pig-right-eat.png',
  './icon/pig-left-eat.png',
  './icon/pill-blue.png',
  './icon/pill-red.png',
  './icon/pill-yellow.png',
  './icon/pill-green.png',
  './icon/pill-purple.png',
  './icon/therm-L1.png',
  './icon/therm-L2.png',
  './icon/therm-L3.png',
  './icon/therm-L4.png',
  './icon/therm-R1.png',
  './icon/therm-R2.png',
  './icon/therm-R3.png',
  './icon/therm-R4.png',
  
];

// Install: cache all required assets and activate immediately
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

// Activate: delete old caches and take control of clients immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') {
    // Just do network fetch, no caching
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, networkResponse.clone());
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
