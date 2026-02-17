# Client API Reference

Complete API reference for the `EventsClient` class.

## Constructor

### `new EventsClient(config)`

Create a new MCPE client:

```typescript
import { EventsClient } from '@mcpe/core';

const client = new EventsClient({
  name: 'my-client',
  version: '1.0.0',
});
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `config` | `{ name: string, version: string }` | Client configuration |

### `new EventsClient(mcpClient)`

Wrap an existing MCP client:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { EventsClient } from '@mcpe/core';

const mcpClient = new Client({ name: 'my-client', version: '1.0.0' });
const client = new EventsClient(mcpClient);
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `mcpClient` | `Client` | Existing MCP client instance |

## Connection Methods

### `connect(transport)`

Connect to an MCPE server via a transport.

```typescript
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['server.js'],
});
await client.connect(transport);
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `transport` | `Transport` | MCP-compatible transport |

**Returns:** `Promise<void>`

### `close()`

Close the connection and clean up resources.

```typescript
await client.close();
```

**Returns:** `Promise<void>`

### `supportsEvents()`

Check if the connected server supports MCPE events.

```typescript
if (client.supportsEvents()) {
  // Safe to use event APIs
}
```

**Returns:** `boolean`

## Subscription Methods

### `subscribe(request)`

Create a new event subscription.

```typescript
const subscription = await client.subscribe({
  filter: {
    eventTypes: ['github.*'],
    tags: ['production'],
    priority: ['high', 'critical'],
  },
  delivery: {
    channels: ['realtime'],
  },
  expiresAt: '2025-02-01T00:00:00Z',
});
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `request` | `SubscribeRequest` | Subscription configuration |

**SubscribeRequest:**

| Field | Type | Required | Description |
|---|---|---|---|
| `filter` | `EventFilter` | Yes | Event matching criteria |
| `delivery` | `DeliveryPreferences` | Yes | Delivery configuration |
| `handler` | `EventHandler` | No | Server-side event handler |
| `expiresAt` | `string` | No | ISO 8601 expiration time |

**Returns:** `Promise<Subscription>`

### `unsubscribe(subscriptionId)`

Remove a subscription.

```typescript
await client.unsubscribe('550e8400-e29b-41d4-a716-446655440000');
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `subscriptionId` | `string` | Subscription UUID |

**Returns:** `Promise<void>`

### `listSubscriptions(status?)`

List subscriptions, optionally filtered by status.

```typescript
// All subscriptions
const all = await client.listSubscriptions();

// Only active
const active = await client.listSubscriptions('active');

// Only paused
const paused = await client.listSubscriptions('paused');
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `status` | `'active' \| 'paused' \| 'expired'` | Optional status filter |

**Returns:** `Promise<Subscription[]>`

### `pause(subscriptionId)`

Pause a subscription. Events will not be delivered until resumed.

```typescript
await client.pause('550e8400-e29b-41d4-a716-446655440000');
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `subscriptionId` | `string` | Subscription UUID |

**Returns:** `Promise<void>`

### `resume(subscriptionId)`

Resume a paused subscription.

```typescript
await client.resume('550e8400-e29b-41d4-a716-446655440000');
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `subscriptionId` | `string` | Subscription UUID |

**Returns:** `Promise<void>`

### `update(subscriptionId, updates)`

Update a subscription's filter, delivery, or expiration.

```typescript
await client.update('550e8400-...', {
  filter: {
    eventTypes: ['github.push'],
  },
  delivery: {
    channels: ['cron'],
    cronSchedule: { expression: '@daily' },
  },
  expiresAt: '2025-06-01T00:00:00Z',
});
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `subscriptionId` | `string` | Subscription UUID |
| `updates` | `Partial<SubscribeRequest>` | Fields to update |

**Returns:** `Promise<Subscription>`

## Event Handler Methods

### `onEvent(pattern, handler)`

Register a handler for events matching a pattern.

```typescript
client.onEvent('github.*', (event) => {
  console.log(event.type, event.data);
});

client.onEvent('github.push', (event) => {
  console.log('Push:', event.data.repository);
});

client.onEvent('*', (event) => {
  console.log('Any event:', event.type);
});
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `pattern` | `string` | Event type pattern (supports `*` wildcards) |
| `handler` | `(event: MCPEvent) => void` | Handler function |

**Returns:** `void`

### `onBatch(handler)`

Register a handler for batch deliveries (cron and scheduled).

```typescript
client.onBatch((events, subscriptionId) => {
  console.log(`Batch: ${events.length} events for ${subscriptionId}`);
});
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `handler` | `(events: MCPEvent[], subscriptionId: string) => void` | Batch handler |

**Returns:** `void`

### `onSubscriptionExpired(handler)`

Register a handler for subscription expiration notifications.

```typescript
client.onSubscriptionExpired((subscriptionId) => {
  console.log('Expired:', subscriptionId);
});
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `handler` | `(subscriptionId: string) => void` | Expiration handler |

**Returns:** `void`

### `clearHandlers()`

Remove all registered event handlers.

```typescript
client.clearHandlers();
```

**Returns:** `void`

## Scheduling Methods

### `subscribeWithLocalCron(filter, cronConfig, handler)`

Create a subscription with a local cron-based handler.

```typescript
const subId = await client.subscribeWithLocalCron(
  { eventTypes: ['github.*'] },
  { expression: '0 9 * * *', timezone: 'America/New_York' },
  async (events) => {
    console.log(`Daily: ${events.length} events`);
  }
);
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `filter` | `EventFilter` | Event matching criteria |
| `cronConfig` | `{ expression: string, timezone?: string }` | Cron configuration |
| `handler` | `(events: MCPEvent[]) => Promise<void>` | Handler function |

**Returns:** `Promise<string>` (subscription ID)

### `subscribeWithLocalTimer(filter, timerConfig, handler)`

Create a subscription with a local interval-based handler.

```typescript
const subId = await client.subscribeWithLocalTimer(
  { eventTypes: ['slack.*'] },
  { intervalMs: 60000 },
  async (events) => {
    console.log(`Last minute: ${events.length} events`);
  }
);
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `filter` | `EventFilter` | Event matching criteria |
| `timerConfig` | `{ intervalMs: number }` | Timer configuration |
| `handler` | `(events: MCPEvent[]) => Promise<void>` | Handler function |

**Returns:** `Promise<string>` (subscription ID)

### `scheduleDelayedTask(task, delayMs, handler)`

Schedule a one-time delayed task.

```typescript
const taskId = await client.scheduleDelayedTask(
  { type: 'reminder', data: { message: 'Check PRs' } },
  4 * 60 * 60 * 1000,
  async (task) => {
    console.log('Reminder:', task.data.message);
  }
);
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `task` | `{ type: string, data: Record<string, unknown> }` | Task descriptor |
| `delayMs` | `number` | Delay in milliseconds |
| `handler` | `(task: object) => Promise<void>` | Handler function |

**Returns:** `Promise<string>` (task ID)

### `getSchedulerInfo()`

Get information about active local schedulers.

```typescript
const info = client.getSchedulerInfo();
```

**Returns:** Scheduler info object

### `stopLocalScheduler(subscriptionId)`

Stop a specific local scheduler.

```typescript
client.stopLocalScheduler('sub-id');
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `subscriptionId` | `string` | Subscription or task ID |

**Returns:** `void`

### `stopAllLocalSchedulers()`

Stop all local schedulers.

```typescript
client.stopAllLocalSchedulers();
```

**Returns:** `void`
