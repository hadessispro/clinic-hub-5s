const CACHE_NAME = 'clinic-hub-attendance-gps-v77';
const APP_SHELL = ['/', '/manifest.json', '/images/nha-khoa-5s-wall.jpg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' || request.destination === 'script' || request.destination === 'style') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request.mode === 'navigate' ? '/' : request, copy));
          return response;
        })
        .catch(() => caches.match(request.mode === 'navigate' ? '/' : request)),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
      if (cached) {
        event.waitUntil(network.catch(() => undefined));
        return cached;
      }
      return network;
    }),
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { payload = { body: event.data?.text() || '' }; }
  event.waitUntil(self.registration.showNotification(payload.title || '5S Clinic Hub', {
    body: payload.body || 'Bạn có thông tin mới cần kiểm tra.',
    icon: '/images/nino-clinic-room.jpg',
    badge: '/images/nino-clinic-room.jpg',
    tag: payload.id || `clinic-${Date.now()}`,
    renotify: true,
    data: { url: payload.url || '/', view: payload.view || 'dashboard', id: payload.id || '' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data || {};
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
    const existing = clients[0];
    if (existing) {
      existing.postMessage({ type: 'clinic:open-view', view: target.view });
      return existing.focus();
    }
    return self.clients.openWindow(target.url || '/');
  }));
});
