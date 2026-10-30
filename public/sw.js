// Camp Daniel service worker: phone notifications only.
// No fetch handler, so it never caches or changes how the app loads.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { title: 'Camp Daniel', body: e.data ? e.data.text() : '' };
  }
  e.waitUntil(
    self.registration.showNotification(d.title || 'Camp Daniel', {
      body: d.body || '',
      tag: d.tag,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      data: { url: d.url || './' },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  const hash = url.includes('#') ? url.slice(url.indexOf('#')) : '';
  e.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of wins) {
        await w.focus();
        if (hash) w.postMessage({ type: 'camp-daniel:navigate', hash });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
