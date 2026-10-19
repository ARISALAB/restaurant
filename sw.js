// TableReserve: ειδοποιήσεις υπενθύμισης κράτησης (web push).
// Δεν κάνει cache: η σελίδα φορτώνει πάντα κανονικά από το δίκτυο.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data && e.data.text() }; }
  const opts = {
    body: d.body || '',
    tag: d.tag || 'tablereserve',
    renotify: true,
    data: { url: d.url || 'https://tablereserve.gr/' },
  };
  if (d.icon) opts.icon = d.icon;
  e.waitUntil(self.registration.showNotification(d.title || 'TableReserve', opts));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || 'https://tablereserve.gr/';
  e.waitUntil(self.clients.openWindow(url));
});
