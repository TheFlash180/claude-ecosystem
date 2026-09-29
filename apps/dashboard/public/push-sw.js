// Pushed into the hub's service worker via workbox importScripts. Only the
// morning summary uses it: every other app has its own worker and its own
// VAPID keypair, and never sends through this one.
self.addEventListener('push', function (event) {
  var data = { title: 'Today', body: '' };
  try {
    data = event.data.json();
  } catch (e) {
    /* use defaults */
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'pwa-192.png',
      // Solid white silhouette on transparency — Android keeps only the
      // badge's alpha channel, so an opaque icon renders as a white square.
      badge: 'badge-96.png',
      // One summary per morning: a new one replaces yesterday's if it is
      // still sitting in the tray.
      tag: 'morning-summary',
      data: data,
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        if (clientList[i].visibilityState === 'visible') {
          return clientList[i].focus();
        }
      }
      return clients.openWindow('./');
    })
  );
});
