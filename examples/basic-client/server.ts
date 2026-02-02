import { EventHub } from '@esmcp/server';
import { createEvent } from '@esmcp/core';

const PORT = 8080;

async function main() {
  const hub = new EventHub({
    port: PORT,
    serverInfo: {
      name: 'Example ESMCP Hub',
      version: '1.0.0',
    },
    supportedProviders: ['github', 'gmail', 'slack'],
  });

  await hub.start();
  console.log(`Event Hub started on port ${PORT}`);

  // Simulate publishing events every 5 seconds
  setInterval(() => {
    const eventTypes = [
      { type: 'github.push', source: 'github' as const, data: { repository: 'test/repo', branch: 'main' } },
      { type: 'github.pull_request', source: 'github' as const, data: { repository: 'test/repo', action: 'opened' } },
      { type: 'gmail.message', source: 'gmail' as const, data: { from: 'test@example.com', subject: 'Hello' } },
      { type: 'slack.message', source: 'slack' as const, data: { channel: '#general', text: 'Hello world' } },
    ];

    const randomEvent = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    const event = createEvent(randomEvent.type, randomEvent.data, {
      source: randomEvent.source,
      priority: 'normal',
    });

    console.log(`Publishing event: ${event.type}`);
    hub.publishEvent(event).catch(console.error);
  }, 5000);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await hub.stop();
    process.exit(0);
  });
}

main().catch(console.error);
