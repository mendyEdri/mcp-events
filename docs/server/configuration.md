# Server Configuration

This page provides a complete reference for all MCPE server configuration options.

## Configuration Interfaces

### EventsServerConfig

The primary configuration object passed to the `EventsServer` constructor:

```typescript
interface EventsServerConfig {
  name: string;                          // Server name
  version: string;                       // Server version
  events?: EventsServerOptions;          // Event-specific options
  handlers?: HandlerExecutorConfig;      // Handler execution config
}
```

### EventsServerOptions

Controls event subscription behavior:

```typescript
interface EventsServerOptions {
  maxSubscriptions?: number;             // Default: 100
  supportedSources?: string[];           // Default: all sources
  deliveryChannels?: string[];           // Default: all channels
  features?: Partial<EventsFeatures>;    // Feature toggles
}
```

### EventsFeatures

Toggle individual features on or off:

```typescript
interface EventsFeatures {
  pause: boolean;              // Enable pause/resume (default: true)
  wildcards: boolean;          // Enable wildcard event types (default: true)
  cronSchedule: boolean;       // Enable cron delivery (default: true)
  scheduledDelivery: boolean;  // Enable scheduled delivery (default: true)
}
```

## Configuration Options

### maxSubscriptions

The maximum number of active subscriptions per client. When this limit is reached, `events_subscribe` calls return error code -32002 (`SubscriptionLimitReached`).

```typescript
const server = new EventsServer({
  name: 'my-server',
  version: '1.0.0',
  events: {
    maxSubscriptions: 50,
  },
});
```

**Default:** 100

### supportedSources

An array of event source identifiers this server supports. This is advertised to clients during capability negotiation so they know what they can subscribe to.

```typescript
const server = new EventsServer({
  name: 'my-server',
  version: '1.0.0',
  events: {
    supportedSources: ['github', 'gmail', 'slack', 'custom'],
  },
});
```

**Default:** All built-in sources (`github`, `gmail`, `slack`, `custom`)

### deliveryChannels

The delivery channels this server supports:

```typescript
const server = new EventsServer({
  name: 'my-server',
  version: '1.0.0',
  events: {
    deliveryChannels: ['realtime', 'cron'],  // no scheduled delivery
  },
});
```

**Available channels:**

| Channel | Description |
|---|---|
| `realtime` | Immediate event-by-event delivery |
| `cron` | Recurring batch delivery on a schedule |
| `scheduled` | One-time batch delivery at a specific time |

**Default:** All channels enabled

### features.pause

Enable or disable the pause/resume capability. When disabled, the `events_pause` and `events_resume` tools are not registered.

```typescript
events: {
  features: {
    pause: false,  // disable pause/resume
  },
}
```

**Default:** `true`

### features.wildcards

Enable or disable wildcard matching in event type filters. When disabled, clients must use exact event type strings.

```typescript
events: {
  features: {
    wildcards: false,  // require exact event types
  },
}
```

**Default:** `true`

### features.cronSchedule

Enable or disable cron-based delivery. When disabled, subscriptions with `cronSchedule` in their delivery preferences are rejected.

```typescript
events: {
  features: {
    cronSchedule: false,
  },
}
```

**Default:** `true`

### features.scheduledDelivery

Enable or disable one-time scheduled delivery. When disabled, subscriptions with `scheduledDelivery` in their delivery preferences are rejected.

```typescript
events: {
  features: {
    scheduledDelivery: false,
  },
}
```

**Default:** `true`

## Complete Configuration Example

```typescript
import { EventsServer } from '@mcpe/server';

const server = new EventsServer({
  name: 'production-event-server',
  version: '2.1.0',
  events: {
    maxSubscriptions: 200,
    supportedSources: ['github', 'gmail', 'slack', 'custom'],
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

## Minimal Configuration

Only `name` and `version` are required. Everything else uses sensible defaults:

```typescript
const server = new EventsServer({
  name: 'simple-server',
  version: '1.0.0',
});
```

This gives you:

- 100 max subscriptions
- All sources supported
- All delivery channels enabled
- All features enabled

## Capability Advertisement

The server configuration directly affects what is advertised to clients during the MCP `initialize` handshake. Clients use this information to know what subscription features are available before creating subscriptions.

For example, if cron delivery is disabled, clients will see that the `cron` channel is not in the supported delivery channels list. Well-behaved clients will not attempt to create cron subscriptions against such a server.

## Runtime Access

After construction, you can access configuration through the server's properties:

```typescript
const server = new EventsServer({ name: 'test', version: '1.0.0' });

// Get the capability object (reflects configuration)
const caps = server.capability;

// Access the subscription manager
const manager = server.subscriptionManager;

// Access the scheduler
const scheduler = server.scheduler;

// Check connection status
const connected = server.isConnected();
```
