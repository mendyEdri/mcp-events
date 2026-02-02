/**
 * Service Worker Template for Web Push
 *
 * This file provides the service worker code that should run in the browser.
 * You can either:
 * 1. Copy this to your project's service worker
 * 2. Use getServiceWorkerCode() to generate it dynamically
 */

/**
 * Get the service worker code as a string (for dynamic generation)
 */
export function getServiceWorkerCode(options?: {
  notificationClickUrl?: string;
}): string {
  const clickUrl = options?.notificationClickUrl || '/';

  return `
// ESMCP Web Push Service Worker
// This handles push notifications in the background

self.addEventListener('push', function(event) {
  if (!event.data) {
    console.log('Push event with no data');
    return;
  }

  try {
    const payload = event.data.json();

    const options = {
      body: payload.body || '',
      icon: payload.icon || '/icon-192.png',
      badge: payload.badge || '/badge-72.png',
      image: payload.image,
      tag: payload.tag,
      data: payload.data || {},
      actions: payload.actions || [],
      requireInteraction: payload.requireInteraction || false,
      silent: payload.silent || false,
      timestamp: payload.timestamp,
    };

    event.waitUntil(
      self.registration.showNotification(payload.title, options)
    );
  } catch (error) {
    console.error('Error showing notification:', error);
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const data = event.notification.data || {};
  const action = event.action;

  // Handle action buttons
  if (action && data.actions && data.actions[action]) {
    const url = data.actions[action].url || '${clickUrl}';
    event.waitUntil(clients.openWindow(url));
    return;
  }

  // Default click behavior
  const targetUrl = data.url || '${clickUrl}';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        // Try to focus an existing window
        for (const client of clientList) {
          if (client.url === targetUrl && 'focus' in client) {
            return client.focus();
          }
        }
        // Open a new window
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});

self.addEventListener('pushsubscriptionchange', function(event) {
  // Handle subscription changes (e.g., token refresh)
  console.log('Push subscription changed:', event);

  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: self.applicationServerKey
    }).then(function(subscription) {
      // Send new subscription to server
      return fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON())
      });
    })
  );
});
`;
}

/**
 * Get the browser-side subscription code
 */
export function getBrowserSubscriptionCode(vapidPublicKey: string): string {
  return `
// ESMCP Web Push Browser Subscription Helper

async function subscribeToWebPush() {
  // Check for support
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications not supported');
  }

  // Request permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission denied');
  }

  // Register service worker
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  // Convert VAPID key
  const vapidPublicKey = '${vapidPublicKey}';
  const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

  // Subscribe to push
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey
  });

  // Return subscription for sending to server
  return subscription.toJSON();
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Usage:
// const subscription = await subscribeToWebPush();
// Send subscription to your server to store for push notifications
`;
}
