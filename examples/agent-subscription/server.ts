/**
 * ASP Protocol Server Example
 *
 * This server demonstrates the Agent Subscription Protocol hub
 * that agents connect to for event subscriptions.
 */

import { EventHub } from '@esmcp/server';
import { createEvent } from '@esmcp/core';

async function main(): Promise<void> {
  const port = parseInt(process.env.PORT || '3000', 10);

  console.log('='.repeat(60));
  console.log('Agent Subscription Protocol (ASP) - Server');
  console.log('='.repeat(60));

  const hub = new EventHub({
    port,
    serverInfo: {
      name: 'ASP Demo Server',
      version: '1.0.0',
    },
    supportedProviders: ['github', 'gmail', 'slack', 'custom'],
    maxSubscriptionsPerClient: 100,
  });

  await hub.start();
  console.log(`\nASP Server listening on ws://localhost:${port}`);
  console.log('Waiting for agent connections...\n');

  // Simulate events being published periodically
  setInterval(async () => {
    const events = [
      createEvent('github.push', {
        repository: 'demo/repo',
        branch: 'main',
        commits: 3,
        pusher: 'developer',
      }, {
        source: 'github',
        priority: 'normal',
        tags: ['production'],
      }),
      createEvent('github.pull_request.opened', {
        repository: 'demo/repo',
        number: 42,
        title: 'Add new feature',
        author: 'contributor',
      }, {
        source: 'github',
        priority: 'normal',
      }),
      createEvent('slack.message', {
        channel: '#alerts',
        text: 'Production deployment completed',
        user: 'deploy-bot',
      }, {
        source: 'slack',
        priority: 'high',
        tags: ['deployment'],
      }),
    ];

    // Pick a random event to publish
    const event = events[Math.floor(Math.random() * events.length)];
    console.log(`Publishing event: ${event.type}`);
    await hub.publishEvent(event);
  }, 5000);

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await hub.stop();
    process.exit(0);
  });
}

main().catch(console.error);
