# Subscribing to Events

This page covers everything about creating, managing, and configuring event subscriptions from the MCPE client.

## Creating a Subscription

The `subscribe` method creates a new event subscription:

```typescript
const subscription = await client.subscribe({
  filter: {
    eventTypes: ['github.push'],
    tags: ['production'],
    priority: ['high', 'critical'],
  },
  delivery: {
    channels: ['realtime'],
  },
  expiresAt: '2025-02-01T00:00:00Z',
});
```

### Subscribe Request

```typescript
interface SubscribeRequest {
  filter: EventFilter;                    // What events to match
  delivery: DeliveryPreferences;          // How to deliver them
  handler?: EventHandler;                 // Optional server-side handler
  expiresAt?: string;                     // Optional expiration (ISO 8601)
}
```

### Return Value

The `subscribe` method returns a `Subscription` object:

```typescript
interface Subscription {
  id: string;                    // Server-assigned UUID
  clientId: string;              // Your client ID
  filter: EventFilter;           // The filter you specified
  delivery: DeliveryPreferences; // The delivery config you specified
  status: 'active';             // Always 'active' on creation
  createdAt: string;             // ISO 8601 creation time
  updatedAt: string;             // ISO 8601 (same as createdAt initially)
  expiresAt?: string;            // Expiration if specified
}
```

## Filter Options

### By Event Type

Filter by event type, with optional wildcard support:

```typescript
// Exact match
{ eventTypes: ['github.push'] }

// Wildcard (matches github.push, github.issue, github.pull_request, etc.)
{ eventTypes: ['github.*'] }

// Mix of exact and wildcard
{ eventTypes: ['github.push', 'slack.*'] }
```

### By Priority

Filter by event priority level:

```typescript
// Only high and critical events
{ priority: ['high', 'critical'] }

// All priority levels (same as omitting)
{ priority: ['low', 'normal', 'high', 'critical'] }
```

### By Tags

Filter events that have specific tags:

```typescript
// Events tagged with 'production'
{ tags: ['production'] }

// Events tagged with either 'ci' or 'deployment'
{ tags: ['ci', 'deployment'] }
```

### Combined Filters

All filter fields are combined with AND logic. Within each field, values are OR:

```typescript
// GitHub push events with high or critical priority, tagged 'production'
{
  eventTypes: ['github.push'],
  priority: ['high', 'critical'],
  tags: ['production'],
}
```

This matches events that are:
- Of type `github.push` AND
- Priority high OR critical AND
- Tagged with `production`

### Empty Filter

An empty or omitted filter matches all events:

```typescript
// Matches everything
await client.subscribe({
  filter: {},
  delivery: { channels: ['realtime'] },
});
```

## Delivery Configuration

### Realtime

Immediate delivery of each event:

```typescript
delivery: {
  channels: ['realtime'],
}
```

### Cron

Recurring batch delivery:

```typescript
delivery: {
  channels: ['cron'],
  cronSchedule: {
    expression: '0 9 * * *',      // Daily at 9 AM
    timezone: 'America/New_York',
    aggregateEvents: true,
    maxEventsPerDelivery: 100,
  },
}
```

### Scheduled

One-time delivery at a specific time:

```typescript
delivery: {
  channels: ['scheduled'],
  scheduledDelivery: {
    deliverAt: '2025-01-15T14:30:00Z',
    timezone: 'UTC',
    description: 'in 4 hours',
    aggregateEvents: true,
    autoExpire: true,
  },
}
```

See [Delivery Modes](../server/delivery.md) for full details on each channel.

## Listing Subscriptions

```typescript
// List all subscriptions
const all = await client.listSubscriptions();

// Filter by status
const active = await client.listSubscriptions('active');
const paused = await client.listSubscriptions('paused');
const expired = await client.listSubscriptions('expired');
```

The return value is an array of `Subscription` objects.

## Pausing and Resuming

```typescript
// Pause - stops event delivery
await client.pause(subscription.id);

// Resume - restarts event delivery
await client.resume(subscription.id);
```

When paused:
- Matching events are **not delivered** to the client
- The subscription is preserved with all its configuration
- Resuming instantly restarts delivery

## Updating a Subscription

Modify a subscription without unsubscribing and resubscribing:

```typescript
await client.update(subscription.id, {
  // Update the filter
  filter: {
    eventTypes: ['github.push'],  // narrower than before
  },

  // Update delivery
  delivery: {
    channels: ['cron'],
    cronSchedule: {
      expression: '@daily',
      timezone: 'UTC',
    },
  },

  // Change or remove expiration
  expiresAt: '2025-06-01T00:00:00Z',
});
```

All fields in the update are optional. Only specified fields are changed.

## Unsubscribing

Remove a subscription permanently:

```typescript
await client.unsubscribe(subscription.id);
```

After unsubscribing:
- No more events are delivered for this subscription
- The subscription ID becomes invalid
- Any buffered events for cron/scheduled delivery are discarded

## Handling Events

### Pattern-Based Handlers

```typescript
// Wildcard pattern
client.onEvent('github.*', (event) => {
  console.log(event.type, event.data);
});

// Exact type
client.onEvent('github.push', (event) => {
  console.log('Push to', event.data.repository);
});

// Catch-all
client.onEvent('*', (event) => {
  console.log('Event:', event.type);
});
```

Multiple handlers can match the same event. They all fire in registration order.

### Batch Handler

```typescript
client.onBatch((events, subscriptionId) => {
  console.log(`Batch of ${events.length} events`);
  events.forEach(e => console.log('-', e.type));
});
```

### Expiration Handler

```typescript
client.onSubscriptionExpired((subscriptionId) => {
  console.log('Expired:', subscriptionId);
});
```

### Clearing Handlers

Remove all registered handlers:

```typescript
client.clearHandlers();
```

## Error Handling

```typescript
try {
  const sub = await client.subscribe({
    filter: { eventTypes: ['github.*'] },
    delivery: { channels: ['realtime'] },
  });
} catch (error) {
  // Common errors:
  // -32002: SubscriptionLimitReached
  // -32602: InvalidParams (bad filter or delivery config)
  // -32000: NotInitialized (client not connected)
  console.error('Subscribe failed:', error.message);
}
```

## Best Practices

- **Use specific filters**: Narrow subscriptions reduce noise and server load
- **Set expirations**: For temporary monitoring, always set an `expiresAt`
- **Handle expiration**: Register an `onSubscriptionExpired` handler to react when subscriptions end
- **Clean up**: Unsubscribe from subscriptions you no longer need
- **Check capabilities**: Call `supportsEvents()` before attempting to subscribe
- **Use wildcards wisely**: `github.*` is convenient but may deliver more events than needed
