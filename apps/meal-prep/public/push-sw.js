self.addEventListener('push', function (event) {
  var data = { title: 'Meal Prep', body: 'Prep day!' };
  try {
    data = event.data.json();
  } catch (e) {
    /* use defaults */
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'pwa-192.png',
      badge: 'pwa-192.png',
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
