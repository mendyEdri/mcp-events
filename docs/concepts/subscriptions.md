# Subscriptions

Subscriptions are the primary mechanism by which agents declare their interest in events. A subscription combines a filter (what events to match), delivery preferences (how and when to receive them), and lifecycle controls (pause, resume, expire).

## Subscription Structure

```typescript
interface Subscription {
  id: string;                       // UUID v4, server-assigned
  clientId: string;                 // ID of the subscribing client
  filter: EventFilter;              // What events to match
  delivery: DeliveryPreferences;    // How to deliver events
  handler?: EventHandler;           // Optional processing handler
  status: SubscriptionStatus;       // 'active' | 'paused' | 'expired'
  createdAt: string;                // ISO 8601 creation time
  updatedAt: string;                // ISO 8601 last update time
  expiresAt?: string;               // Optional ISO 8601 expiration time
}
```

## Creating a Subscription

Agents create subscriptions by calling the `events_subscribe` tool:

```typescript
const subscription = await client.subscribe({
  filter: {
    eventTypes: ['github.push', 'github.pull_request.*'],
    priority: ['normal', 'high', 'critical'],
  },
  delivery: {
    channels: ['realtime'],
  },
  expiresAt: '2025-02-01T00:00:00Z',  // optional
});

console.log(subscription.id);     // "550e8400-..."
console.log(subscription.status); // "active"
```

### Filter

The `filter` object determines which events match this subscription. See the [Events](./events.md) page for full details on filter syntax and matching rules.

### Delivery Preferences

The `delivery` object controls how matched events are delivered:

```typescript
interface DeliveryPreferences {
  channels: DeliveryChannel[];        // 'realtime' | 'cron' | 'scheduled'
  cronSchedule?: CronSchedule;       // Required if channel is 'cron'
  scheduledDelivery?: ScheduledDelivery; // Required if channel is 'scheduled'
}
```

See [Delivery Modes](../server/delivery.md) for detailed information on each delivery channel.

## Subscription Lifecycle

A subscription moves through these states:

```
  subscribe()
      |
      v
  +--------+     pause()     +--------+
  | active | ------------->  | paused |
  +--------+                 +--------+
      |       <-------------
      |        resume()          |
      |                          |
      v                          v
  +---------+              +---------+
  | expired |              | expired |
  +---------+              +---------+
```

### Status Values

| Status | Description |
|---|---|
| `active` | Subscription is live, events are being delivered |
| `paused` | Subscription exists but events are not delivered |
| `expired` | Subscription has expired and is no longer active |

## Managing Subscriptions

### List Subscriptions

```typescript
// List all subscriptions
const all = await client.listSubscriptions();

// List only active subscriptions
const active = await client.listSubscriptions('active');

// List paused subscriptions
const paused = await client.listSubscriptions('paused');
```

### Pause and Resume

Pausing a subscription stops event delivery without deleting it. This is useful for temporarily reducing noise or processing backlogs.

```typescript
// Pause
await client.pause(subscription.id);

// Resume
await client.resume(subscription.id);
```

When a subscription is paused:

- Events that match the filter are **not delivered**
- The subscription retains its position and configuration
- Resuming restores normal delivery immediately

### Update a Subscription

Modify a subscription's filter, delivery preferences, or expiration without creating a new one:

```typescript
await client.update(subscription.id, {
  filter: {
    eventTypes: ['github.push'],  // narrowed from wildcard
  },
  expiresAt: '2025-03-01T00:00:00Z',
});
```

### Unsubscribe

Remove a subscription entirely:

```typescript
await client.unsubscribe(subscription.id);
```

## Expiration

Subscriptions can have an optional `expiresAt` timestamp. When the expiration time passes:

1. The server changes the subscription status to `expired`
2. The server sends an `events/subscription_expired` notification to the client
3. No further events are delivered for that subscription

```typescript
// Subscribe with expiration
const sub = await client.subscribe({
  filter: { eventTypes: ['github.*'] },
  delivery: { channels: ['realtime'] },
  expiresAt: '2025-01-16T00:00:00Z',
});

// Handle expiration notifications
client.onSubscriptionExpired((subscriptionId) => {
  console.log('Subscription expired:', subscriptionId);
});
```

Scheduled delivery subscriptions with `autoExpire: true` automatically expire after their one-time delivery completes.

## Subscription Limits

Servers enforce a maximum number of active subscriptions per client. The default is 100, configurable in the server options. When the limit is reached, new subscribe calls return a `SubscriptionLimitReached` error (code -32002).

```typescript
const server = new EventsServer({
  name: 'my-server',
  version: '1.0.0',
  events: {
    maxSubscriptions: 50,  // lower limit
  },
});
```

## Handler Attachment

Subscriptions can optionally include an event handler that processes events server-side:

```typescript
const sub = await client.subscribe({
  filter: { eventTypes: ['github.*'] },
  delivery: { channels: ['realtime'] },
  handler: {
    type: 'webhook',
    url: 'https://example.com/webhook',
    headers: { 'Authorization': 'Bearer token' },
  },
});
```

See [Event Handlers](../client/event-handlers.md) for details on bash, webhook, and agent handlers.
