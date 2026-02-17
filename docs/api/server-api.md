# Server API Reference

Complete API reference for the `EventsServer` class.

## Constructor

### `new EventsServer(config)`

Create a new MCPE server with full configuration:

```typescript
import { EventsServer } from '@mcpe/core';

const server = new EventsServer({
  name: 'my-server',
  version: '1.0.0',
  events: {
    maxSubscriptions: 100,
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

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `config` | `EventsServerConfig` | Server configuration object |

**EventsServerConfig:**

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | Yes | Server name |
| `version` | `string` | Yes | Server version |
| `events` | `EventsServerOptions` | No | Event-specific options |
| `handlers` | `HandlerExecutorConfig` | No | Handler execution config |

### `new EventsServer(mcpServer, options?)`

Wrap an existing MCP server:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { EventsServer } from '@mcpe/core';

const mcpServer = new McpServer({ name: 'my-server', version: '1.0.0' });
const server = new EventsServer(mcpServer, {
  maxSubscriptions: 50,
});
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `mcpServer` | `McpServer` | Existing MCP server instance |
| `options` | `EventsServerOptions` | Optional event configuration |

## Methods

### `connect(transport)`

Connect the server to a transport and start accepting connections.

```typescript
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const transport = new StdioServerTransport();
await server.connect(transport);
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `transport` | `Transport` | MCP-compatible transport |

**Returns:** `Promise<void>`

### `close()`

Gracefully shut down the server, closing all connections and cleaning up resources.

```typescript
await server.close();
```

**Returns:** `Promise<void>`

### `isConnected()`

Check if the server is currently connected to a transport.

```typescript
if (server.isConnected()) {
  console.log('Server is running');
}
```

**Returns:** `boolean`

### `publish(event)`

Publish a pre-built event. The event is matched against all active subscriptions and delivered accordingly.

```typescript
import { createEvent } from '@mcpe/core';

const event = createEvent('github.push', {
  repository: 'owner/repo',
}, {
  priority: 'normal',
});

server.publish(event);
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `event` | `MCPEvent` | A complete event object |

**Returns:** `void`

### `publish(type, data, metadata)`

Publish an event using inline parameters. A `MCPEvent` is created internally.

```typescript
server.publish('github.push', {
  repository: 'owner/repo',
  branch: 'main',
}, {
  priority: 'normal',
  tags: ['ci'],
});
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `type` | `string` | Event type (dot-notation) |
| `data` | `Record<string, unknown>` | Event payload |
| `metadata` | `Partial<EventMetadata>` | Event metadata (priority, tags) |

**Returns:** `void`

### `sendBatch(events, subscriptionId)`

Send a batch of events to a specific subscription. Used internally by cron and scheduled delivery, but can be called manually.

```typescript
server.sendBatch([event1, event2, event3], 'subscription-uuid');
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `events` | `MCPEvent[]` | Array of events |
| `subscriptionId` | `string` | Target subscription UUID |

**Returns:** `void`

### `notifySubscriptionExpired(subscriptionId)`

Send a subscription expiration notification to the client.

```typescript
server.notifySubscriptionExpired('subscription-uuid');
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `subscriptionId` | `string` | Expired subscription UUID |

**Returns:** `void`

### `getSchedulerInfo()`

Get information about the server's scheduler state.

```typescript
const info = server.getSchedulerInfo();
console.log(info);
```

**Returns:** Scheduler state object

## Properties

### `mcpServer`

Access the underlying MCP server instance.

```typescript
const mcp = server.mcpServer;
```

**Type:** `McpServer`

### `subscriptionManager`

Access the subscription manager for direct subscription manipulation.

```typescript
const manager = server.subscriptionManager;
```

**Type:** `SubscriptionManager`

### `handlerExecutor`

Access the handler executor for managing event handler execution.

```typescript
const executor = server.handlerExecutor;
```

**Type:** `HandlerExecutor`

### `scheduler`

Access the scheduler for cron and scheduled delivery management.

```typescript
const scheduler = server.scheduler;
```

**Type:** `Scheduler`

### `capability`

Get the server's capability object, which reflects the current configuration.

```typescript
const caps = server.capability;
console.log(caps.subscriptions.maxActive);
```

**Type:** `MCPECapabilities`

## Registered Tools

The `EventsServer` automatically registers these MCP tools:

### `events_subscribe`

Create a new event subscription.

**Input:**

```typescript
{
  filter: {
    eventTypes?: string[];
    tags?: string[];
    priority?: string[];
  };
  delivery: {
    channels: string[];
    cronSchedule?: CronSchedule;
    scheduledDelivery?: ScheduledDelivery;
  };
  handler?: EventHandler;
  expiresAt?: string;
}
```

**Output:** `Subscription` object

### `events_unsubscribe`

Remove a subscription.

**Input:** `{ subscriptionId: string }`

**Output:** `{ success: boolean }`

### `events_list`

List subscriptions.

**Input:** `{ status?: 'active' | 'paused' | 'expired' }`

**Output:** `{ subscriptions: Subscription[] }`

### `events_pause`

Pause a subscription.

**Input:** `{ subscriptionId: string }`

**Output:** `{ success: boolean, status: 'paused' }`

### `events_resume`

Resume a paused subscription.

**Input:** `{ subscriptionId: string }`

**Output:** `{ success: boolean, status: 'active' }`

### `events_update`

Update a subscription.

**Input:** `{ subscriptionId: string, updates: Partial<Subscription> }`

**Output:** Updated `Subscription` object
