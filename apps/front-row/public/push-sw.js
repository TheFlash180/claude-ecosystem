self.addEventListener('push', function (event) {
  var data = { title: 'Front Row', body: 'A new event just landed' };
  try {
    data = event.data.json();
  } catch (e) {
    /* use defaults */
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'pwa-192.png',
      // Android keeps only the badge's alpha channel and paints that
      // silhouette solid white, so the badge must be a transparent PNG with a
      // white glyph. Reusing pwa-192.png here renders a plain white square,
      // because that icon is a fully opaque full-bleed tile.
      badge: 'badge-96.png',
      vibrate: [200, 100, 200],
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
