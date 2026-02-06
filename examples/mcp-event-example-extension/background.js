// Background Service Worker
// Handles push notifications and runs the MCP server

// Import MCP server
importScripts('mcp-server.js');

// ==================== Push Notification Handling ====================

// Handle push events from web push
self.addEventListener('push', function(event) {
  console.log('[SW] Push received:', event);

  let payload = {
    title: 'Push Notification',
    body: 'You have a new notification',
    source: 'webpush',
    data: {}
  };

  if (event.data) {
    try {
      const data = event.data.json();
      payload = {
        title: data.title || payload.title,
        body: data.body || data.message || payload.body,
        source: data.source || 'webpush',
        icon: data.icon,
        data: data.data || data
      };
    } catch (e) {
      payload.body = event.data.text();
    }
  }

  // Add to MCP server
  if (typeof mcpServer !== 'undefined') {
    mcpServer.addNotification(payload);
  }

  // Show browser notification
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || 'icon128.png',
      badge: 'icon48.png',
      data: payload.data,
      tag: `push-${Date.now()}`,
      requireInteraction: false
    })
  );
});

// Handle notification click
self.addEventListener('notificationclick', function(event) {
  console.log('[SW] Notification clicked:', event);

  event.notification.close();

  // Add click event to MCP server
  if (typeof mcpServer !== 'undefined') {
    mcpServer.addNotification({
      title: 'Notification Clicked',
      body: `User clicked: ${event.notification.title}`,
      source: 'user_interaction',
      data: {
        action: event.action || 'click',
        notificationTitle: event.notification.title,
        notificationBody: event.notification.body
      }
    });
  }

  // Open extension popup or URL
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.includes(chrome.runtime.id) && 'focus' in client) {
          return client.focus();
        }
      }
      if (event.notification.data?.url) {
        return clients.openWindow(event.notification.data.url);
      }
    })
  );
});

// ==================== Chrome Runtime Messages ====================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle showNotification from popup
  if (message.type === 'showNotification') {
    showChromeNotification(message.title, message.body, message.data);
    sendResponse({ success: true });
    return true;
  }

  // Handle MCP requests (forwarded to mcpServer)
  if (message.type === 'mcp-request' && typeof mcpServer !== 'undefined') {
    mcpServer.handleRequest(message.request).then(sendResponse);
    return true;
  }

  // Handle getNotifications request
  if (message.type === 'getNotifications') {
    if (typeof mcpServer !== 'undefined') {
      sendResponse({ notifications: mcpServer.notifications });
    } else {
      sendResponse({ notifications: [] });
    }
    return true;
  }

  // Handle addNotification (for testing)
  if (message.type === 'addNotification') {
    if (typeof mcpServer !== 'undefined') {
      const notification = mcpServer.addNotification(message.notification);
      sendResponse({ success: true, notification });
    } else {
      sendResponse({ success: false, error: 'MCP server not initialized' });
    }
    return true;
  }
});

// ==================== Chrome Notifications ====================

function showChromeNotification(title, body, data = {}) {
  const notificationId = `chrome-${Date.now()}`;

  chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: 'icon128.png',
    title: title || 'Notification',
    message: body || '',
    priority: 2
  });

  // Add to MCP server
  if (typeof mcpServer !== 'undefined') {
    mcpServer.addNotification({
      title,
      body,
      source: 'chrome_extension',
      data
    });
  }
}

// Handle Chrome notification clicks
chrome.notifications.onClicked.addListener((notificationId) => {
  console.log('[BG] Chrome notification clicked:', notificationId);

  if (typeof mcpServer !== 'undefined') {
    mcpServer.addNotification({
      title: 'Chrome Notification Clicked',
      body: `Notification ID: ${notificationId}`,
      source: 'user_interaction',
      data: { notificationId, action: 'click' }
    });
  }

  // Try to open popup
  chrome.action.openPopup().catch(() => {
    // Popup might already be open or not available
  });
});

// ==================== MCP Server Connection Handler ====================

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'mcp') {
    console.log('[BG] MCP client connected via port');

    // The MCP server handles this in mcp-server.js
    // This is just for logging
  }
});

// ==================== Startup ====================

console.log('[BG] Background service worker started');
console.log('[BG] MCP Server available:', typeof mcpServer !== 'undefined');
