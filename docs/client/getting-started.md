# Client: Getting Started

This guide walks you through setting up an MCPE client that connects to a server, discovers event capabilities, and subscribes to events.

## Installation

```bash
npm install @mcpe/core
```

## Basic Client Setup

```typescript
import { EventsClient } from '@mcpe/core';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new EventsClient({
  name: 'my-event-client',
  version: '1.0.0',
});

const transport = new StdioClientTransport({
  command: 'node',
  args: ['server.js'],
});

await client.connect(transport);
```

## Wrapping an Existing MCP Client

If you already have an MCP `Client` instance, you can add MCPE support to it:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { EventsClient } from '@mcpe/core';

const mcpClient = new Client({
  name: 'my-mcp-client',
  version: '1.0.0',
});

// Wrap with EventsClient
const eventsClient = new EventsClient(mcpClient);

const transport = new StdioClientTransport({
  command: 'node',
  args: ['server.js'],
});
await eventsClient.connect(transport);
```

The existing MCP client capabilities (tool calling, resource reading, etc.) continue to work alongside MCPE event subscriptions.

## Checking Event Support

After connecting, check whether the server supports MCPE:

```typescript
if (client.supportsEvents()) {
  console.log('Server supports events!');

  // Safe to subscribe
  const sub = await client.subscribe({
    filter: { sources: ['github'] },
    delivery: { channels: ['realtime'] },
  });
} else {
  console.log('Server does not support events');
  // Fall back to polling or skip event functionality
}
```

The `supportsEvents()` method checks the server's capabilities returned during the MCP `initialize` handshake.

## Subscribing to Events

```typescript
const subscription = await client.subscribe({
  filter: {
    sources: ['github'],
    eventTypes: ['github.push', 'github.pull_request.*'],
    priority: ['normal', 'high', 'critical'],
  },
  delivery: {
    channels: ['realtime'],
  },
});

console.log('Subscription ID:', subscription.id);
console.log('Status:', subscription.status);
```

See [Subscribing](./subscribing.md) for full details on filter options and delivery configuration.

## Handling Events

Register handlers that fire when matching events arrive:

```typescript
// Handle all GitHub events
client.onEvent('github.*', (event) => {
  console.log('GitHub event:', event.type, event.data);
});

// Handle specific event types
client.onEvent('github.push', (event) => {
  console.log('Push to', event.data.repository);
});

// Handle all events (catch-all)
client.onEvent('*', (event) => {
  console.log('Any event:', event.type);
});
```

### Batch Handler

For cron and scheduled delivery, events arrive as batches:

```typescript
client.onBatch((events, subscriptionId) => {
  console.log(`Received ${events.length} events for subscription ${subscriptionId}`);
  for (const event of events) {
    console.log('-', event.type, event.data);
  }
});
```

### Expiration Handler

Get notified when a subscription expires:

```typescript
client.onSubscriptionExpired((subscriptionId) => {
  console.log('Subscription expired:', subscriptionId);
  // Optionally create a new subscription
});
```

## Managing Subscriptions

```typescript
// List all active subscriptions
const subs = await client.listSubscriptions('active');

// Pause a subscription
await client.pause(subscription.id);

// Resume a subscription
await client.resume(subscription.id);

// Update a subscription
await client.update(subscription.id, {
  filter: { sources: ['github'], eventTypes: ['github.push'] },
});

// Unsubscribe
await client.unsubscribe(subscription.id);
```

## Cleanup

Always clean up handlers and close the connection when done:

```typescript
// Remove all event handlers
client.clearHandlers();

// Close the connection
await client.close();
```

## Complete Example

```typescript
import { EventsClient } from '@mcpe/core';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function main() {
  const client = new EventsClient({
    name: 'github-monitor',
    version: '1.0.0',
  });

  const transport = new StdioClientTransport({
    command: 'node',
    args: ['server.js'],
  });
  await client.connect(transport);

  if (!client.supportsEvents()) {
    console.error('Server does not support events');
    await client.close();
    return;
  }

  // Subscribe to GitHub events
  const sub = await client.subscribe({
    filter: {
      sources: ['github'],
      eventTypes: ['github.*'],
    },
    delivery: {
      channels: ['realtime'],
    },
  });
  console.log('Subscribed:', sub.id);

  // Handle events
  client.onEvent('github.push', (event) => {
    console.log('Push:', event.data.repository, event.data.branch);
  });

  client.onEvent('github.pull_request.*', (event) => {
    console.log('PR:', event.data.action, event.data.title);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await client.unsubscribe(sub.id);
    client.clearHandlers();
    await client.close();
    process.exit(0);
  });

  console.log('Listening for events... (Ctrl+C to exit)');
}

main().catch(console.error);
```

## Next Steps

- Learn about [Subscribing](./subscribing.md) in detail
- Set up [Event Handlers](./event-handlers.md) for bash, webhook, or agent processing
- Configure [Scheduling](./scheduling.md) for cron and delayed tasks
- See the full [Client API](../api/client-api.md) reference
