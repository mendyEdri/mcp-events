#!/usr/bin/env npx tsx
/**
 * Integration Test Server
 * Publishes events every 3 seconds for testing CLI and browser clients
 */

import { EventHub } from '@esmcp/server';
import { createEvent } from '@esmcp/core';

const PORT = 8080;

async function main() {
  const hub = new EventHub({
    port: PORT,
    serverInfo: {
      name: 'ESMCP Test Hub',
      version: '1.0.0',
    },
    supportedProviders: ['github', 'gmail', 'slack'],
    maxSubscriptionsPerClient: 100,
  });

  await hub.start();
  console.log(`🚀 Event Hub started on ws://localhost:${PORT}`);
  console.log('');
  console.log('Publishing events every 3 seconds...');
  console.log('Press Ctrl+C to stop');
  console.log('');

  let eventCount = 0;

  // Publish events every 3 seconds
  const interval = setInterval(() => {
    eventCount++;
    const sources = ['github', 'gmail', 'slack'] as const;
    const source = sources[eventCount % 3];

    const eventTypes = [
      { type: `${source}.push`, data: { repository: 'test/repo', branch: 'main', commits: 3 } },
      { type: `${source}.message`, data: { from: 'user@example.com', subject: `Test message #${eventCount}` } },
      { type: `${source}.notification`, data: { channel: '#general', text: `Hello from ${source}!` } },
    ];

    const eventType = eventTypes[eventCount % 3];
    const priorities = ['low', 'normal', 'high'] as const;
    const priority = priorities[eventCount % 3];

    const event = createEvent(eventType.type, eventType.data, {
      source,
      priority,
      tags: ['test', 'integration', source],
    });

    console.log(`📤 [${new Date().toLocaleTimeString()}] Publishing: ${event.type} (${priority})`);

    hub.publishEvent(event).catch((err) => {
      console.error('Failed to publish:', err);
    });
  }, 3000);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down...');
    clearInterval(interval);
    await hub.stop();
    console.log('✅ Server stopped');
    process.exit(0);
  });
}

main().catch(console.error);
