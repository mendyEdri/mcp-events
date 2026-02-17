# Publishing Events

This page covers how to publish events from your MCPE server. Published events are automatically matched against all active subscriptions and delivered to the appropriate clients.

## Publishing Methods

### Publish a Single Event

The `publish` method has two overloads:

**With a pre-built event:**

```typescript
import { createEvent } from '@mcpe/core';

const event = createEvent('github.push', {
  repository: 'owner/repo',
  branch: 'main',
  commits: 3,
}, {
  source: 'github',
  priority: 'normal',
  tags: ['ci'],
});

server.publish(event);
```

**With inline parameters:**

```typescript
server.publish('github.push', {
  repository: 'owner/repo',
  branch: 'main',
  commits: 3,
}, {
  source: 'github',
  priority: 'normal',
  tags: ['ci'],
});
```

The inline form creates the event internally using `createEvent()`, so both approaches are equivalent.

### Send a Batch

For cron and scheduled delivery, the server sends batches of events:

```typescript
const events = [event1, event2, event3];
server.sendBatch(events, subscriptionId);
```

This sends an `events/batch` notification to the client associated with the subscription.

### Notify Subscription Expired

When a subscription expires, notify the client:

```typescript
server.notifySubscriptionExpired(subscriptionId);
```

This sends an `events/subscription_expired` notification. The server handles this automatically for time-based expirations, but you can call it manually when needed.

## The createEvent Helper

The `createEvent` function from `@mcpe/core` builds well-formed events:

```typescript
import { createEvent } from '@mcpe/core';

const event = createEvent(
  'slack.message',                    // type
  {                                   // data
    channel: '#general',
    text: 'Hello from MCPE',
    user: 'bot',
  },
  {                                   // metadata
    source: 'slack',
    priority: 'normal',
    tags: ['notifications'],
    sourceEventId: 'slack-msg-12345', // optional: original event ID
  }
);
```

The function:

- Generates a UUID v4 for the `id` field
- Sets `timestamp` to the current ISO 8601 time (or uses a provided one)
- Validates the metadata against the schema

### Custom Timestamp

```typescript
const event = createEvent('custom.backfill', { data: 'historical' }, {
  source: 'custom',
  priority: 'low',
  timestamp: '2025-01-01T00:00:00Z',  // override automatic timestamp
});
```

## Event Matching

When an event is published, the server's subscription manager runs `matchesFilter()` against every active subscription. The matching rules are:

1. **sources**: Event source must be in the filter's source list
2. **eventTypes**: Event type must match at least one pattern (exact or wildcard)
3. **tags**: Event must have at least one tag in the filter's tag list
4. **priority**: Event priority must be in the filter's priority list
5. **Omitted fields**: No constraint (always matches)

All specified fields must match (AND logic). Within each field, values are combined with OR logic.

### Example: Matching Process

```typescript
// Subscription filter
const filter = {
  sources: ['github'],
  eventTypes: ['github.push', 'github.pull_request.*'],
  priority: ['high', 'critical'],
};

// This event MATCHES (source=github, type matches wildcard, priority=high)
server.publish('github.pull_request.opened', {
  repo: 'test',
}, {
  source: 'github',
  priority: 'high',
});

// This event does NOT match (priority=normal is not in the filter)
server.publish('github.push', {
  repo: 'test',
}, {
  source: 'github',
  priority: 'normal',
});
```

## Delivery Flow

After matching, events are delivered based on the subscription's delivery channel:

| Channel | Behavior |
|---|---|
| `realtime` | Immediate delivery via `events/event` notification |
| `cron` | Event is buffered; delivered as batch on the next cron tick |
| `scheduled` | Event is buffered; delivered at the scheduled time |

### Realtime Delivery

```typescript
// Server publishes
server.publish('github.push', { repo: 'test' }, {
  source: 'github',
  priority: 'normal',
});

// Client receives immediately via notification
// { method: "events/event", params: { event: {...}, subscriptionId: "..." } }
```

### Buffered Delivery

For cron and scheduled channels, the event is stored in a buffer. When the delivery time arrives, all buffered events for that subscription are sent as a single batch:

```typescript
// Events accumulate over time
server.publish('github.push', data1, metadata);
server.publish('github.push', data2, metadata);
server.publish('github.push', data3, metadata);

// At the cron tick, all three are delivered together:
// { method: "events/batch", params: { events: [e1, e2, e3], subscriptionId: "..." } }
```

## Publishing from External Sources

A common pattern is to receive webhooks from external systems and publish them as MCPE events:

```typescript
import express from 'express';
import { EventsServer } from '@mcpe/core';

const app = express();
const server = new EventsServer({ name: 'webhook-bridge', version: '1.0.0' });

app.post('/webhook/github', express.json(), (req, res) => {
  const githubEvent = req.headers['x-github-event'];
  const payload = req.body;

  server.publish(`github.${githubEvent}`, payload, {
    source: 'github',
    priority: 'normal',
    sourceEventId: req.headers['x-github-delivery'],
    tags: [payload.repository?.full_name].filter(Boolean),
  });

  res.status(200).send('OK');
});

app.listen(3000);
```

## Error Handling

If no subscriptions match a published event, the event is silently discarded. This is by design -- events are ephemeral and only matter if someone has subscribed to them.

If a delivery fails (e.g., the client transport is disconnected), the behavior depends on the delivery channel:

- **Realtime**: Event is dropped. Realtime delivery is best-effort.
- **Cron/Scheduled**: Events remain in the buffer and will be included in the next delivery attempt.

## Best Practices

- **Use specific event types**: Prefer `github.pull_request.opened` over `github.event`. Specific types enable fine-grained filtering.
- **Include source event IDs**: Set `sourceEventId` when available. This enables deduplication and tracing.
- **Set appropriate priorities**: Use `critical` sparingly. Most events should be `normal`.
- **Tag events generously**: Tags enable flexible cross-cutting filters without modifying the type hierarchy.
- **Keep data payloads focused**: Include the data the client needs, not the entire raw webhook payload.
