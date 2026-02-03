#!/usr/bin/env npx tsx
/**
 * Combined ASP WebSocket + HTTP Server
 *
 * This server demonstrates:
 * 1. ASP WebSocket server for clients to connect and subscribe
 * 2. HTTP API to publish events (from CLI, webhooks, etc.)
 * 3. Web Push integration for offline delivery
 *
 * Usage:
 *   npx tsx server-ws.ts
 *
 * Then use:
 *   - CLI receiver: npx tsx cli-receive.ts
 *   - CLI sender:   npx tsx cli-publish.ts "github.push" '{"repo":"test"}'
 *   - HTTP API:     curl -X POST http://localhost:3001/publish -d '...'
 */

import express from 'express';
import { EventHub } from '@esmcp/server';
import { createEvent } from '@esmcp/core';
import type { ESMCPEvent } from '@esmcp/core';

// Configuration
const WS_PORT = 8080;    // WebSocket server for ASP clients
const HTTP_PORT = 3001;  // HTTP API for publishing events

// Create the Event Hub (ASP WebSocket server)
const hub = new EventHub({
  port: WS_PORT,
  serverInfo: {
    name: 'ESMCP Demo Hub',
    version: '1.0.0',
  },
  maxSubscriptionsPerClient: 100,
  supportedProviders: ['github', 'gmail', 'slack', 'custom'],
  webPushEnabled: true,
});

// Create HTTP server for publishing events
const app = express();

// Simple CORS middleware
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', wsPort: WS_PORT, httpPort: HTTP_PORT });
});

// Publish an event (this will be delivered to all matching subscriptions)
app.post('/publish', async (req, res) => {
  try {
    const { type, data, source = 'custom', priority = 'normal', tags = [] } = req.body;

    if (!type) {
      return res.status(400).json({ error: 'Missing required field: type' });
    }

    const event: ESMCPEvent = createEvent(
      type,
      data || {},
      {
        source: source as 'github' | 'gmail' | 'slack' | 'custom',
        priority: priority as 'low' | 'normal' | 'high' | 'critical',
        tags,
      }
    );

    console.log(`📤 Publishing event: ${event.type} (${event.id.substring(0, 8)}...)`);
    await hub.publishEvent(event);

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

// Convenience endpoint for quick tests
app.post('/test', async (_req, res) => {
  const event = createEvent(
    'test.ping',
    {
      message: 'Hello from the server!',
      timestamp: new Date().toISOString(),
    },
    {
      source: 'custom',
      priority: 'normal',
      tags: ['test'],
    }
  );

  console.log(`📤 Publishing test event: ${event.type}`);
  await hub.publishEvent(event);

  res.json({
    success: true,
    eventId: event.id,
    message: 'Test event published',
  });
});

// GitHub-like webhook endpoint
app.post('/webhook/github', async (req, res) => {
  const githubEvent = req.headers['x-github-event'] as string || 'push';
  const payload = req.body;

  const event = createEvent(
    `github.${githubEvent}`,
    payload,
    {
      source: 'github',
      priority: githubEvent === 'push' ? 'normal' : 'low',
      tags: ['webhook'],
    }
  );

  console.log(`📤 GitHub webhook: ${event.type}`);
  await hub.publishEvent(event);

  res.json({ success: true, eventId: event.id });
});

// Start both servers
async function main() {
  // Start WebSocket server
  await hub.start();

  // Start HTTP server
  app.listen(HTTP_PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║  🚀 ESMCP Demo Server Running                                  ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  WebSocket (ASP):  ws://localhost:${WS_PORT}                       ║
║  HTTP API:         http://localhost:${HTTP_PORT}                      ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Quick Test:                                                  ║
║                                                               ║
║  1. Start CLI receiver in another terminal:                   ║
║     npx tsx cli-receive.ts                                    ║
║                                                               ║
║  2. Publish a test event:                                     ║
║     curl -X POST http://localhost:${HTTP_PORT}/test                   ║
║                                                               ║
║  Or use cli-publish.ts:                                       ║
║     npx tsx cli-publish.ts "github.push" '{"repo":"test"}'    ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`);
  });

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await hub.stop();
    process.exit(0);
  });
}

main().catch(console.error);
