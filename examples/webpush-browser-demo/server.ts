#!/usr/bin/env npx tsx
/**
 * ESMCP Web Push Server Demo
 *
 * This server demonstrates:
 * 1. ASP WebSocket server for MCP clients
 * 2. HTTP API for publishing events
 * 3. Web Push integration for browser notifications
 * 4. Static file serving for the browser demo
 *
 * Usage:
 *   1. Generate VAPID keys: npx tsx generate-vapid-keys.ts
 *   2. Start server: npx tsx server.ts
 *   3. Open http://localhost:3000 in browser
 *   4. Publish events: npx tsx publish-event.ts
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventHub } from '@esmcp/server';
import { createEvent } from '@esmcp/core';
import type { ESMCPEvent } from '@esmcp/core';
import { WebPushClient } from '@esmcp/webpush';
import webpush from 'web-push';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const WS_PORT = 8080;     // WebSocket port for MCP clients
const HTTP_PORT = 3000;   // HTTP port for web server and API

// Load VAPID keys
let vapidKeys: { publicKey: string; privateKey: string; subject: string } | null = null;

async function loadVapidKeys(): Promise<void> {
  try {
    const keysData = await fs.readFile(path.join(__dirname, 'vapid-keys.json'), 'utf-8');
    vapidKeys = JSON.parse(keysData);
    console.log('✅ Loaded VAPID keys');
  } catch {
    console.error('❌ vapid-keys.json not found. Run: npx tsx generate-vapid-keys.ts');
    process.exit(1);
  }
}

// Store push subscriptions (in production, use a database)
const pushSubscriptions = new Map<string, webpush.PushSubscription>();

// Create the Event Hub
const hub = new EventHub({
  port: WS_PORT,
  serverInfo: {
    name: 'ESMCP WebPush Demo Hub',
    version: '1.0.0',
  },
  maxSubscriptionsPerClient: 100,
  supportedProviders: ['github', 'gmail', 'slack', 'custom', 'browser'],
  webPushEnabled: true,
});

// Create Express app
const app = express();

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Serve static files (the browser demo)
app.use(express.static(path.join(__dirname, 'public')));

// API: Get VAPID public key (needed by browser to subscribe)
app.get('/api/vapid-public-key', (_req, res) => {
  if (!vapidKeys) {
    return res.status(500).json({ error: 'VAPID keys not loaded' });
  }
  res.json({ publicKey: vapidKeys.publicKey });
});

// API: Register browser push subscription
app.post('/api/register-push', async (req, res) => {
  try {
    const { subscription, clientId } = req.body;
    
    if (!subscription || !clientId) {
      return res.status(400).json({ error: 'Missing subscription or clientId' });
    }

    // Store the subscription
    pushSubscriptions.set(clientId, subscription);
    console.log(`🔔 Browser registered for push: ${clientId}`);
    
    // Send a welcome notification
    const webPushClient = new WebPushClient({
      vapidPublicKey: vapidKeys!.publicKey,
      vapidPrivateKey: vapidKeys!.privateKey,
      vapidSubject: vapidKeys!.subject,
    });

    await webPushClient.sendNotification(subscription, {
      title: '✅ Subscribed!',
      body: 'You will now receive browser push notifications from the MCP server.',
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      tag: 'welcome',
    });

    res.json({ success: true, message: 'Subscription registered' });
  } catch (error) {
    console.error('Error registering push:', error);
    res.status(500).json({ error: 'Failed to register subscription' });
  }
});

// API: Unregister browser push subscription
app.post('/api/unregister-push', (req, res) => {
  const { clientId } = req.body;
  
  if (clientId && pushSubscriptions.has(clientId)) {
    pushSubscriptions.delete(clientId);
    console.log(`🔕 Browser unregistered: ${clientId}`);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Subscription not found' });
  }
});

// API: Publish an event (this triggers push notifications to matching subscriptions)
app.post('/api/publish', async (req, res) => {
  try {
    const { type, data, source = 'custom', priority = 'normal', tags = [] } = req.body;

    if (!type) {
      return res.status(400).json({ error: 'Missing required field: type' });
    }

    const event: ESMCPEvent = createEvent(
      type,
      data || {},
      {
        source: source as 'github' | 'gmail' | 'slack' | 'custom' | 'browser',
        priority: priority as 'low' | 'normal' | 'high' | 'critical',
        tags,
      }
    );

    console.log(`📤 Publishing event: ${event.type} (${event.id.substring(0, 8)}...)`);
    
    // Publish to MCP subscribers
    await hub.publishEvent(event);

    // Also send to browser push subscribers that match
    await sendPushNotifications(event);

    res.json({
      success: true,
      eventId: event.id,
      type: event.type,
      timestamp: event.metadata.timestamp,
    });
  } catch (error) {
    console.error('Error publishing event:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Send push notifications to all registered browsers
async function sendPushNotifications(event: ESMCPEvent): Promise<void> {
  if (pushSubscriptions.size === 0 || !vapidKeys) return;

  const webPushClient = new WebPushClient({
    vapidPublicKey: vapidKeys.publicKey,
    vapidPrivateKey: vapidKeys.privateKey,
    vapidSubject: vapidKeys.subject,
  });

  // Build notification based on event type
  const notification = buildNotification(event);

  // Send to all registered browsers
  const sendPromises: Promise<void>[] = [];
  
  for (const [clientId, subscription] of pushSubscriptions) {
    const promise = webPushClient.sendNotification(subscription, notification)
      .then(() => {
        console.log(`  📱 Push sent to ${clientId.substring(0, 8)}...`);
      })
      .catch((error) => {
        console.error(`  ❌ Push failed for ${clientId.substring(0, 8)}...:`, error.message);
        // Remove invalid subscriptions
        if (error.statusCode === 410) { // Gone
          pushSubscriptions.delete(clientId);
          console.log(`  🗑️  Removed expired subscription: ${clientId.substring(0, 8)}...`);
        }
      });
    
    sendPromises.push(promise);
  }

  await Promise.allSettled(sendPromises);
}

// Build a notification from an event
function buildNotification(event: ESMCPEvent): {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
} {
  let title = 'New Event';
  let body = `Type: ${event.type}`;

  // Customize based on event source and type
  switch (event.metadata.source) {
    case 'github':
      title = '🔔 GitHub';
      if (event.type.includes('push')) {
        title = '📤 GitHub Push';
        body = `New commits to ${event.data.repo || 'unknown repo'}`;
      } else if (event.type.includes('issue')) {
        title = '📝 GitHub Issue';
        body = event.data.title || 'New issue activity';
      } else if (event.type.includes('pull_request')) {
        title = '🔀 Pull Request';
        body = event.data.title || 'New PR activity';
      }
      break;

    case 'slack':
      title = '💬 Slack';
      body = event.data.message || 'New Slack message';
      break;

    case 'gmail':
      title = '📧 Gmail';
      body = `New email: ${event.data.subject || 'No subject'}`;
      break;

    case 'browser':
      title = '🌐 Browser';
      body = event.data.message || 'New browser notification';
      break;

    default:
      title = `📢 ${event.type}`;
      body = JSON.stringify(event.data).slice(0, 100);
  }

  // Add priority indicator
  if (event.metadata.priority === 'critical') {
    title = '🔴 ' + title;
  } else if (event.metadata.priority === 'high') {
    title = '🟡 ' + title;
  }

  return {
    title,
    body,
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    tag: event.id,
    data: {
      eventId: event.id,
      eventType: event.type,
      source: event.metadata.source,
      priority: event.metadata.priority,
    },
  };
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    wsPort: WS_PORT,
    httpPort: HTTP_PORT,
    pushSubscribers: pushSubscriptions.size,
  });
});

// Convenience endpoint for quick tests
app.post('/api/test', async (_req, res) => {
  const event = createEvent(
    'browser.test',
    {
      message: 'Test notification from MCP server!',
      timestamp: new Date().toISOString(),
    },
    {
      source: 'browser',
      priority: 'normal',
      tags: ['test'],
    }
  );

  console.log(`📤 Publishing test event: ${event.type}`);
  await hub.publishEvent(event);
  await sendPushNotifications(event);

  res.json({
    success: true,
    eventId: event.id,
    message: 'Test event published and push notifications sent',
    pushSubscribers: pushSubscriptions.size,
  });
});

// Start servers
async function main() {
  await loadVapidKeys();

  // Start WebSocket server
  await hub.start();

  // Start HTTP server
  app.listen(HTTP_PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║  🚀 ESMCP Web Push Demo Server Running                        ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  WebSocket (MCP):  ws://localhost:${WS_PORT}                       ║
║  HTTP Server:      http://localhost:${HTTP_PORT}                      ║
║  Browser Demo:     http://localhost:${HTTP_PORT}                        ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Quick Start:                                                ║
║                                                              ║
║  1. Open http://localhost:${HTTP_PORT} in your browser                  ║
║  2. Click "Enable Push Notifications"                          ║
║  3. Test with: curl -X POST http://localhost:${HTTP_PORT}/api/test    ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);
  });

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down...');
    await hub.stop();
    process.exit(0);
  });
}

main().catch(console.error);
