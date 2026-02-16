# Quickstart

Get up and running with MCPE in under five minutes. This guide walks you through installing the SDK, creating a server that publishes events, and building a client that subscribes to them.

## Prerequisites

- Node.js 18 or later
- npm, yarn, or pnpm

## Installation

```bash
npm install @mcpe/core @mcpe/server @mcpe/client
```

## Step 1: Create an Event Server

Create a file called `server.ts`:

```typescript
import { EventsServer } from '@mcpe/server';

const server = new EventsServer({
  name: 'my-mcpe-server',
  version: '1.0.0',
  events: {
    supportedSources: ['github', 'custom'],
    maxSubscriptions: 100,
  },
});

// Connect using stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);

console.log('MCPE server is running');

// Publish an event every 5 seconds
setInterval(() => {
  server.publish('custom.heartbeat', { status: 'ok' }, {
    source: 'custom',
    priority: 'low',
  });
}, 5000);
```

## Step 2: Create an Event Client

Create a file called `client.ts`:

```typescript
import { EventsClient } from '@mcpe/client';

const client = new EventsClient({
  name: 'my-mcpe-client',
  version: '1.0.0',
});

// Connect to the server
const transport = new StdioClientTransport({
  command: 'node',
  args: ['server.js'],
});
await client.connect(transport);

// Check if the server supports events
if (client.supportsEvents()) {
  console.log('Server supports MCPE events!');
}

// Subscribe to custom events
const subscription = await client.subscribe({
  filter: {
    sources: ['custom'],
    eventTypes: ['custom.*'],
  },
  delivery: {
    channels: ['realtime'],
  },
});

console.log('Subscribed with ID:', subscription.id);

// Handle incoming events
client.onEvent('custom.*', (event) => {
  console.log('Received event:', event.type, event.data);
});
```

## Step 3: Run It

```bash
npx tsx client.ts
```

You should see output like:

```
Server supports MCPE events!
Subscribed with ID: 550e8400-e29b-41d4-a716-446655440000
Received event: custom.heartbeat { status: 'ok' }
Received event: custom.heartbeat { status: 'ok' }
```

## What Just Happened?

1. The **server** started and registered MCPE tools (`events_subscribe`, `events_unsubscribe`, etc.) on top of the standard MCP protocol.
2. The **client** connected, discovered that the server supports events through capability negotiation, and created a subscription.
3. The server began publishing `custom.heartbeat` events. The subscription manager matched them against the client's filter and delivered them in realtime via the `events/event` notification.

## Next Steps

- Learn about the core **[Protocol](./concepts/protocol.md)** concepts
- Explore **[Delivery Modes](./server/delivery.md)** like cron and scheduled delivery
- Set up **[Event Handlers](./client/event-handlers.md)** for bash, webhook, or agent processing
- See complete **[Examples](./guides/examples.md)** for real-world use cases
