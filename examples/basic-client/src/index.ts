import { EventsClient } from '@mcpe/core';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

/**
 * Basic MCPE Client Example
 *
 * This example demonstrates how to connect to an MCPE-enabled server,
 * subscribe to events, and receive notifications.
 */

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001/sse';

async function main() {
  console.log('MCPE Client Example');
  console.log('==================');
  console.log('');

  // Create the events client
  const client = new EventsClient({
    name: 'basic-events-client',
    version: '1.0.0',
  });

  // Create transport and connect
  console.log(`Connecting to ${SERVER_URL}...`);
  const transport = new SSEClientTransport(new URL(SERVER_URL));

  try {
    await client.connect(transport);
    console.log('Connected!');
    console.log('');

    // Check if server supports events
    if (!client.supportsEvents()) {
      console.log('Server does not support events');
      return;
    }

    console.log('Server supports events!');
    console.log('');

    // Set up event handlers
    client.onEvent('*', (event, subscriptionId) => {
      console.log(`\n[Event Received]`);
      console.log(`  Type: ${event.type}`);
      console.log(`  ID: ${event.id}`);
      console.log(`  Source: ${event.metadata.source}`);
      console.log(`  Data:`, JSON.stringify(event.data, null, 2));
      console.log(`  Subscription: ${subscriptionId}`);
    });

    client.onSubscriptionExpired((subscriptionId) => {
      console.log(`\n[Subscription Expired] ${subscriptionId}`);
    });

    // Subscribe to GitHub events
    console.log('Creating subscription for GitHub events...');
    const subscription = await client.subscribe({
      filter: {
        sources: ['github'],
        eventTypes: ['github.*'],
      },
      delivery: {
        channels: ['realtime'],
      },
    });

    console.log(`Subscription created: ${subscription.subscriptionId}`);
    console.log(`Status: ${subscription.status}`);
    console.log('');

    // List subscriptions
    const { subscriptions } = await client.listSubscriptions();
    console.log(`Active subscriptions: ${subscriptions.length}`);
    for (const sub of subscriptions) {
      console.log(`  - ${sub.id} (${sub.status})`);
    }
    console.log('');

    console.log('Listening for events... (Press Ctrl+C to stop)');

    // Keep the process running
    await new Promise((_, reject) => {
      process.on('SIGINT', () => reject(new Error('Interrupted')));
    });
  } catch (error) {
    if ((error as Error).message === 'Interrupted') {
      console.log('\n\nShutting down...');
    } else {
      console.error('Error:', error);
    }
  } finally {
    await client.close();
    console.log('Disconnected');
  }
}

main().catch(console.error);
