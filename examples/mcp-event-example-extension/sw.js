// Service Worker for Web Push Notifications

// Handle push events from MCPE server
self.addEventListener('push', function(event) {
  console.log('[SW] Push received:', event);

  let payload = {
    title: 'MCPE Event',
    body: 'You have a new event',
    icon: 'icon128.png',
    badge: 'icon48.png',
    data: {}
  };

  let eventData = null;

  if (event.data) {
    try {
      const data = event.data.json();
      eventData = data;
      payload = {
        title: data.title || payload.title,
        body: data.body || data.message || payload.body,
        icon: data.icon || payload.icon,
        badge: data.badge || payload.badge,
        data: data.data || data
      };
    } catch (e) {
      // If not JSON, use text
      payload.body = event.data.text();
    }
  }

  // Store event in chrome.storage for the popup to read
  event.waitUntil(
    Promise.all([
      // Show notification
      self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: payload.icon,
        badge: payload.badge,
        data: payload.data,
        vibrate: [100, 50, 100],
        actions: [
          { action: 'open', title: 'Open' },
          { action: 'dismiss', title: 'Dismiss' }
        ]
      }),
      // Notify clients about the event
      self.clients.matchAll().then(clients => {
        const mcpeEvent = {
          type: eventData?.type || 'push.notification',
          source: eventData?.source || 'mcpe',
          data: eventData,
          timestamp: new Date().toISOString()
        };
        clients.forEach(client => {
          client.postMessage({
            type: 'pushEvent',
            event: mcpeEvent
          });
        });
      })
    ])
  );
});

// Handle notification click
self.addEventListener('notificationclick', function(event) {
  console.log('[SW] Notification clicked:', event.action);

  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  // Open or focus the extension popup or a URL from the notification data
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // If there's already a window open, focus it
      for (const client of clientList) {
        if (client.url.includes(chrome.runtime.id) && 'focus' in client) {
          return client.focus();
        }
      }

      // If notification has a URL, open it
      if (event.notification.data && event.notification.data.url) {
        return clients.openWindow(event.notification.data.url);
      }

      // Otherwise open the extension popup
      return clients.openWindow(chrome.runtime.getURL('popup.html'));
    })
  );
});

// Handle subscription change (e.g., browser refresh of push subscription)
self.addEventListener('pushsubscriptionchange', function(event) {
  console.log('[SW] Push subscription changed');

  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: self.vapidPublicKey
    }).then(function(subscription) {
      // Send new subscription to the extension
      return self.clients.matchAll().then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({
            type: 'pushSubscriptionChanged',
            subscription: subscription.toJSON()
          });
        });
      });
    })
  );
});

// Listen for messages from the extension
self.addEventListener('message', function(event) {
  console.log('[SW] Message received:', event.data);

  if (event.data.type === 'setVapidKey') {
    self.vapidPublicKey = event.data.vapidPublicKey;
  }
});
