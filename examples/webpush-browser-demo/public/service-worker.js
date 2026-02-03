/**
 * Service Worker for ESMCP Web Push Demo
 * 
 * This service worker handles:
 * 1. Push notification events from the server
 * 2. Notification click events
 * 3. Background message handling
 */

// Cache name for offline support
const CACHE_NAME = 'esmcp-webpush-v1';

// Install event - set up cache
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  self.skipWaiting();
});

// Activate event - claim clients
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(self.clients.claim());
});

// Push event - handle incoming push notifications
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push received:', event);

  let data;
  try {
    data = event.data.json();
  } catch (e) {
    // Fallback if data is not JSON
    data = {
      title: 'New Notification',
      body: event.data.text(),
    };
  }

  const title = data.title || 'ESMCP Event';
  const options = {
    body: data.body || 'You have a new event',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/badge-72.png',
    tag: data.tag || 'default',
    data: data.data || {},
    requireInteraction: data.data?.priority === 'critical' || data.data?.priority === 'high',
    actions: [
      {
        action: 'view',
        title: 'View Event',
        icon: '/icon-192.png',
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
      },
    ],
  };

  // Show notification
  event.waitUntil(
    self.registration.showNotification(title, options)
  );

  // Notify all clients about the push (for pages that are open)
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      clients.forEach((client) => {
        client.postMessage({
          type: 'PUSH_RECEIVED',
          data: data,
        });
      });
    })
  );
});

// Notification click event - handle user interactions
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification clicked:', event);

  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};

  notification.close();

  if (action === 'dismiss') {
    // User dismissed the notification
    return;
  }

  // Default action or 'view' - open the app
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // If a window is already open, focus it
      for (const client of clients) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise, open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});

// Message event - handle messages from the main page
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received:', event.data);

  if (event.data.type === 'GET_SUBSCRIPTION') {
    // Return the current push subscription
    self.registration.pushManager.getSubscription().then((subscription) => {
      event.ports[0].postMessage({
        type: 'SUBSCRIPTION',
        subscription: subscription,
      });
    });
  }
});
