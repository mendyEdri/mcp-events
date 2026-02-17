# Server: Getting Started

This guide walks you through setting up an MCPE server that can accept subscriptions and publish events to connected clients.

## Installation

```bash
npm install @mcpe/core
```

## Basic Server Setup

The simplest way to create an MCPE server is with the `EventsServer` constructor:

```typescript
import { EventsServer } from '@mcpe/core';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new EventsServer({
  name: 'my-event-server',
  version: '1.0.0',
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

This creates a server that:

- Registers all six MCPE tools (`events_subscribe`, `events_unsubscribe`, `events_list`, `events_pause`, `events_resume`, `events_update`)
- Accepts subscriptions from clients
- Delivers events through MCP notifications
- Uses default configuration (100 max subscriptions, all features enabled)

## Wrapping an Existing MCP Server

If you already have an `McpServer` instance, you can add MCPE support to it:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { EventsServer } from '@mcpe/core';

const mcpServer = new McpServer({
  name: 'my-mcp-server',
  version: '1.0.0',
});

// Add your existing MCP tools
mcpServer.tool('greet', { name: 'string' }, async ({ name }) => ({
  content: [{ type: 'text', text: `Hello, ${name}!` }],
}));

// Wrap with EventsServer to add event support
const eventsServer = new EventsServer(mcpServer, {
  maxSubscriptions: 50,
});

const transport = new StdioServerTransport();
await eventsServer.connect(transport);
```

The existing MCP tools continue to work normally alongside the new MCPE subscription tools.

## Configuration

The `EventsServerConfig` object provides full control over server behavior:

```typescript
const server = new EventsServer({
  name: 'production-server',
  version: '2.0.0',
  events: {
    maxSubscriptions: 200,
    deliveryChannels: ['realtime', 'cron', 'scheduled'],
    features: {
      pause: true,
      wildcards: true,
      cronSchedule: true,
      scheduledDelivery: true,
    },
  },
});
```

See [Configuration](./configuration.md) for a complete reference of all options.

## Publishing Events

Once the server is running, publish events that will be matched against active subscriptions:

```typescript
import { createEvent } from '@mcpe/core';

// Using the publish method with a pre-built event
const event = createEvent('github.push', {
  repository: 'owner/repo',
  branch: 'main',
}, {
  priority: 'normal',
});
server.publish(event);

// Or use the shorthand form
server.publish('github.push', {
  repository: 'owner/repo',
  branch: 'main',
}, {
  priority: 'normal',
});
```

See [Publishing Events](./publishing-events.md) for detailed information.

## Server Properties

The `EventsServer` instance exposes several useful properties:

```typescript
// Access the underlying MCP server
server.mcpServer;

// Access the subscription manager
server.subscriptionManager;

// Access the handler executor
server.handlerExecutor;

// Access the scheduler (for cron/scheduled delivery)
server.scheduler;

// Get the server capability object
server.capability;

// Check if the server is connected
server.isConnected();
```

## Connection Lifecycle

```typescript
const server = new EventsServer({
  name: 'my-server',
  version: '1.0.0',
});

// Connect to a transport
const transport = new StdioServerTransport();
await server.connect(transport);

// Server is now accepting connections and subscriptions
console.log('Connected:', server.isConnected());

// ... run your server logic ...

// Gracefully shut down
await server.close();
```

## Complete Example

Here is a complete server that publishes GitHub-like events:

```typescript
import { EventsServer } from '@mcpe/core';
import { createEvent } from '@mcpe/core';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new EventsServer({
  name: 'github-events',
  version: '1.0.0',
  events: {
    maxSubscriptions: 100,
  },
});

const transport = new StdioServerTransport();
await server.connect(transport);

// Simulate GitHub events
const eventTypes = [
  { type: 'github.push', data: { repository: 'test/repo', branch: 'main' } },
  { type: 'github.pull_request', data: { repository: 'test/repo', action: 'opened' } },
  { type: 'github.issue', data: { repository: 'test/repo', title: 'Bug report' } },
];

setInterval(() => {
  const random = eventTypes[Math.floor(Math.random() * eventTypes.length)];
  server.publish(random.type, random.data, {
    priority: 'normal',
  });
}, 5000);

// Graceful shutdown
process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});
```

## Next Steps

- Learn about [Publishing Events](./publishing-events.md)
- Configure [Delivery Modes](./delivery.md) for cron and scheduled delivery
- See the full [Configuration](./configuration.md) reference
- Explore the [Server API](../api/server-api.md) reference
