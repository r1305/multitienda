/* global importScripts, URLSearchParams, self, clients */
(function () {
  try {
    const params = new URLSearchParams(self.location.search || '');
    const config = {
      apiKey: params.get('apiKey') || '',
      authDomain: params.get('authDomain') || '',
      projectId: params.get('projectId') || '',
      storageBucket: params.get('storageBucket') || '',
      messagingSenderId: params.get('messagingSenderId') || '',
      appId: params.get('appId') || '',
      measurementId: params.get('measurementId') || '',
    };

    if (!config.apiKey || !config.projectId || !config.messagingSenderId || !config.appId) {
      return;
    }

    importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
    importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

    firebase.initializeApp(config);
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage(function (payload) {
      const data = payload?.data || {};
      const notif = payload?.notification || {};
      const title = notif.title || data.title || 'Notificación';
      const body = notif.body || data.message || '';
      const icon = notif.icon || data.icon || '/assets/img/favicons/favicon-96x96.png';
      const image = notif.image || data.image || undefined;
      const link = data.url || data.web_url || data.link || '/';

      const options = {
        body,
        icon,
        badge: icon,
        image,
        data: { link },
        vibrate: [200, 100, 200],
      };

      self.registration.showNotification(title, options);
    });

    self.addEventListener('notificationclick', function (event) {
      const target = event.notification?.data?.link || '/';
      event.notification.close();
      event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
          for (const client of windowClients) {
            if ('focus' in client) {
              client.navigate(target);
              return client.focus();
            }
          }
          return clients.openWindow(target);
        })
      );
    });
  } catch (_) {
    // Keep service worker silent to avoid blocking app load.
  }
})();
