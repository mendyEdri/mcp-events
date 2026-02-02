/**
 * Web Push Demo Server
 */

import express from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WebPushClient,
  WebPushNotificationBuilder,
  getServiceWorkerCode,
  type WebPushSubscription,
} from '@esmcp/webpush';
import { createEvent } from '@esmcp/core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;

// Load or generate VAPID keys
const keysPath = path.join(__dirname, 'vapid-keys.json');
let vapidKeys: { publicKey: string; privateKey: string };

if (fs.existsSync(keysPath)) {
  vapidKeys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
  console.log('✅ Loaded VAPID keys from file');
} else {
  vapidKeys = WebPushClient.generateVAPIDKeys();
  fs.writeFileSync(keysPath, JSON.stringify(vapidKeys, null, 2));
  console.log('🔑 Generated new VAPID keys');
}

// Create Web Push client
const pushClient = new WebPushClient({
  vapidKeys,
  subject: 'mailto:admin@example.com',
});

// Store subscriptions
const subscriptions: Map<string, WebPushSubscription> = new Map();

const app = express();
app.use(express.json());

// Serve the main page with debug info
app.get('/', (_req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>ESMCP Web Push Demo</title>
  <style>
    body { font-family: system-ui; max-width: 800px; margin: 40px auto; padding: 20px; }
    button { padding: 12px 24px; font-size: 16px; cursor: pointer; margin: 5px; }
    .success { color: green; font-weight: bold; }
    .error { color: red; font-weight: bold; }
    .warning { color: orange; }
    pre { background: #f4f4f4; padding: 10px; overflow-x: auto; font-size: 12px; }
    #status { margin: 20px 0; padding: 15px; border-radius: 4px; background: #e8f4fd; }
    #log { background: #1e1e1e; color: #0f0; padding: 15px; height: 200px; overflow-y: auto; font-family: monospace; font-size: 13px; }
    .log-error { color: #f44; }
    .log-success { color: #4f4; }
    .log-info { color: #4af; }
  </style>
</head>
<body>
  <h1>🔔 ESMCP Web Push Demo</h1>
  <p>Open standard Web Push (RFC 8030) - <strong>No fees, works in all browsers!</strong></p>

  <div id="status">Click Subscribe to start...</div>

  <h2>Controls</h2>
  <button onclick="doSubscribe()">1. Subscribe</button>
  <button onclick="doSendTest()">2. Send Test Push</button>
  <button onclick="doUnsubscribe()">Unsubscribe</button>

  <h2>Debug Log</h2>
  <div id="log"></div>

  <h2>Subscription Data</h2>
  <pre id="subscription">None</pre>

  <script>
    let subscription = null;

    function log(msg, type = '') {
      const el = document.getElementById('log');
      const line = document.createElement('div');
      line.className = type ? 'log-' + type : '';
      line.textContent = new Date().toLocaleTimeString() + ' ' + msg;
      el.appendChild(line);
      el.scrollTop = el.scrollHeight;
      console.log(msg);
    }

    function setStatus(msg, type = '') {
      document.getElementById('status').textContent = msg;
      document.getElementById('status').className = type;
    }

    async function doSubscribe() {
      log('=== Starting subscription flow ===', 'info');

      // Step 1: Check browser support
      log('Checking browser support...');
      if (!('serviceWorker' in navigator)) {
        log('ERROR: Service Workers not supported!', 'error');
        setStatus('Your browser does not support Service Workers', 'error');
        return;
      }
      if (!('PushManager' in window)) {
        log('ERROR: Push API not supported!', 'error');
        setStatus('Your browser does not support Push notifications', 'error');
        return;
      }
      if (!('Notification' in window)) {
        log('ERROR: Notifications not supported!', 'error');
        setStatus('Your browser does not support Notifications', 'error');
        return;
      }
      log('✓ Browser supports all required APIs', 'success');

      // Step 2: Check/request permission
      log('Current notification permission: ' + Notification.permission);
      if (Notification.permission === 'denied') {
        log('ERROR: Notifications are blocked! Check browser settings.', 'error');
        setStatus('Notifications are BLOCKED. Click the lock icon in the address bar to allow.', 'error');
        return;
      }

      if (Notification.permission !== 'granted') {
        log('Requesting notification permission...');
        setStatus('Please click ALLOW on the permission popup...', 'warning');
        const permission = await Notification.requestPermission();
        log('Permission result: ' + permission);
        if (permission !== 'granted') {
          log('ERROR: Permission denied or dismissed', 'error');
          setStatus('You need to ALLOW notifications. Try again and click Allow.', 'error');
          return;
        }
      }
      log('✓ Notification permission granted', 'success');

      // Step 3: Register service worker
      log('Registering service worker...');
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        log('✓ Service worker registered: ' + registration.scope, 'success');
        await navigator.serviceWorker.ready;
        log('✓ Service worker is ready', 'success');
      } catch (err) {
        log('ERROR registering service worker: ' + err.message, 'error');
        setStatus('Failed to register service worker: ' + err.message, 'error');
        return;
      }

      // Step 4: Subscribe to push
      log('Subscribing to push notifications...');
      try {
        const registration = await navigator.serviceWorker.ready;

        // Convert VAPID key
        const vapidKey = '${vapidKeys.publicKey}';
        log('Using VAPID key: ' + vapidKey.substring(0, 20) + '...');

        const applicationServerKey = urlBase64ToUint8Array(vapidKey);

        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey
        });

        log('✓ Push subscription created!', 'success');
        log('Endpoint: ' + subscription.endpoint.substring(0, 50) + '...');

        // Show subscription
        document.getElementById('subscription').textContent =
          JSON.stringify(subscription.toJSON(), null, 2);
      } catch (err) {
        log('ERROR subscribing: ' + err.message, 'error');
        setStatus('Failed to subscribe: ' + err.message, 'error');
        return;
      }

      // Step 5: Send to server
      log('Sending subscription to server...');
      try {
        const response = await fetch('/api/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription.toJSON())
        });
        if (response.ok) {
          log('✓ Server accepted subscription!', 'success');
          setStatus('✅ Subscribed! Now click "Send Test Push"', 'success');
        } else {
          throw new Error('Server returned ' + response.status);
        }
      } catch (err) {
        log('ERROR sending to server: ' + err.message, 'error');
        setStatus('Server error: ' + err.message, 'error');
      }
    }

    async function doSendTest() {
      if (!subscription) {
        setStatus('Subscribe first!', 'error');
        return;
      }
      log('Sending test notification...', 'info');
      try {
        const response = await fetch('/api/send-test', { method: 'POST' });
        const data = await response.json();
        log('Server response: ' + JSON.stringify(data), data.sent > 0 ? 'success' : 'error');
        if (data.sent > 0) {
          setStatus('✅ Notification sent! Check your notifications.', 'success');
        } else {
          setStatus('No subscriptions to send to', 'warning');
        }
      } catch (err) {
        log('ERROR: ' + err.message, 'error');
        setStatus('Error: ' + err.message, 'error');
      }
    }

    async function doUnsubscribe() {
      log('Unsubscribing...', 'info');
      try {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await fetch('/api/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint })
          });
        }
        subscription = null;
        document.getElementById('subscription').textContent = 'None';
        log('✓ Unsubscribed', 'success');
        setStatus('Unsubscribed', '');
      } catch (err) {
        log('ERROR: ' + err.message, 'error');
      }
    }

    function urlBase64ToUint8Array(base64String) {
      const padding = '='.repeat((4 - base64String.length % 4) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray;
    }

    // Check on load
    log('Page loaded. Checking existing state...', 'info');
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          subscription = sub;
          document.getElementById('subscription').textContent = JSON.stringify(sub.toJSON(), null, 2);
          log('Found existing subscription', 'success');
          setStatus('Already subscribed! Click "Send Test Push"', 'success');
        }
      }).catch(() => {});
    }
  </script>
</body>
</html>
  `);
});

// Serve the service worker
app.get('/sw.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(getServiceWorkerCode({ notificationClickUrl: '/' }));
});

// API: Subscribe
app.post('/api/subscribe', (req, res) => {
  const subscription = req.body as WebPushSubscription;
  subscriptions.set(subscription.endpoint, subscription);
  console.log(`📱 New subscription: ${subscription.endpoint.substring(0, 50)}...`);
  res.json({ success: true });
});

// API: Unsubscribe
app.post('/api/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  subscriptions.delete(endpoint);
  console.log(`📱 Removed subscription`);
  res.json({ success: true });
});

// API: Send test notification
app.post('/api/send-test', async (_req, res) => {
  const payload = WebPushNotificationBuilder.create()
    .title('🎉 It Works!')
    .body('Web Push notification via open standards (RFC 8030)')
    .build();

  let sent = 0;
  let errors: string[] = [];

  for (const [endpoint, subscription] of subscriptions) {
    const result = await pushClient.send(subscription, payload);
    console.log(`📤 Push to ${endpoint.substring(0, 40)}... : ${result.success ? '✅' : '❌ ' + result.error}`);
    if (result.success) {
      sent++;
    } else {
      errors.push(result.error || 'Unknown error');
      // Remove invalid subscriptions
      if (result.statusCode === 410 || result.statusCode === 404) {
        subscriptions.delete(endpoint);
      }
    }
  }

  res.json({ success: sent > 0, sent, total: subscriptions.size, errors });
});

// API: Send ESMCP event
app.post('/api/send-event', async (_req, res) => {
  const event = createEvent('github.push', { repo: 'esmcp/esmcp', commits: 3 }, { source: 'github', priority: 'normal' });
  const payload = WebPushNotificationBuilder.fromEvent(event, { titlePrefix: '📦 GitHub' }).build();

  let sent = 0;
  for (const subscription of subscriptions.values()) {
    const result = await pushClient.send(subscription, payload);
    if (result.success) sent++;
  }

  res.json({ success: sent > 0, sent, eventId: event.id });
});

app.listen(PORT, () => {
  console.log(`
🚀 Web Push Demo running at http://localhost:${PORT}

Open in browser and check the Debug Log for details!
  `);
});
