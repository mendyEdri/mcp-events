# Types Reference

Complete reference for all TypeScript types in the MCPE SDK.

## Event Types

### MCPEvent

The core event data structure.

```typescript
interface MCPEvent {
  id: string;                          // UUID v4
  type: string;                        // Dot-notation event type
  data: Record<string, unknown>;       // Arbitrary event payload
  metadata: EventMetadata;             // Structured metadata
}
```

### EventMetadata

Metadata attached to every event.

```typescript
interface EventMetadata {
  sourceEventId?: string;              // Original event ID from source
  timestamp: string;                   // ISO 8601 datetime
  priority: EventPriority;             // Priority level (default: 'normal')
  tags?: string[];                     // Freeform tags for filtering
}
```

### EventPriority

```typescript
type EventPriority = 'low' | 'normal' | 'high' | 'critical';
```

### EventFilter

Criteria for matching events against subscriptions.

```typescript
interface EventFilter {
  eventTypes?: string[];               // Match event types (wildcards supported)
  tags?: string[];                     // Match events with any of these tags
  priority?: EventPriority[];          // Match events with these priorities
}
```

## Subscription Types

### Subscription

A complete subscription record.

```typescript
interface Subscription {
  id: string;                          // UUID v4 (server-assigned)
  clientId: string;                    // Subscribing client ID
  filter: EventFilter;                 // Event matching criteria
  delivery: DeliveryPreferences;       // Delivery configuration
  handler?: EventHandler;              // Optional server-side handler
  status: SubscriptionStatus;          // Current status
  createdAt: string;                   // ISO 8601
  updatedAt: string;                   // ISO 8601
  expiresAt?: string;                  // Optional ISO 8601 expiration
}
```

### SubscriptionStatus

```typescript
type SubscriptionStatus = 'active' | 'paused' | 'expired';
```

### CreateSubscriptionRequest

The request body for creating a subscription.

```typescript
interface CreateSubscriptionRequest {
  filter: EventFilter;
  delivery: DeliveryPreferences;
  expiresAt?: string;                  // ISO 8601
}
```

### UpdateSubscriptionRequest

The request body for updating a subscription.

```typescript
interface UpdateSubscriptionRequest {
  filter?: EventFilter;
  delivery?: DeliveryPreferences;
  status?: SubscriptionStatus;
  expiresAt?: string | null;           // null to remove expiration
}
```

## Delivery Types

### DeliveryChannel

```typescript
type DeliveryChannel = 'realtime' | 'cron' | 'scheduled';
```

### DeliveryPreferences

How events should be delivered for a subscription.

```typescript
interface DeliveryPreferences {
  channels: DeliveryChannel[];         // Delivery channels
  cronSchedule?: CronSchedule;        // Required if 'cron' channel used
  scheduledDelivery?: ScheduledDelivery; // Required if 'scheduled' channel used
}
```

### CronSchedule

Configuration for recurring cron-based delivery.

```typescript
interface CronSchedule {
  expression: string;                  // Cron expression or preset
  timezone: string;                    // IANA timezone (default: 'UTC')
  aggregateEvents: boolean;            // Batch events together (default: true)
  maxEventsPerDelivery: number;        // Max per batch (default: 100)
}
```

**Supported cron presets:** `@hourly`, `@daily`, `@weekly`, `@monthly`

### ScheduledDelivery

Configuration for one-time scheduled delivery.

```typescript
interface ScheduledDelivery {
  deliverAt: string;                   // ISO 8601 datetime
  timezone: string;                    // IANA timezone (default: 'UTC')
  description?: string;               // Human-readable (e.g., "in 4 hours")
  aggregateEvents: boolean;            // Batch events (default: true)
  autoExpire: boolean;                 // Expire after delivery (default: true)
}
```

## Handler Types

### EventHandler

Union type for all handler types.

```typescript
type EventHandler = BashEventHandler | AgentEventHandler | WebhookEventHandler;
```

### BashEventHandler

Execute a shell command when an event arrives.

```typescript
interface BashEventHandler {
  type: 'bash';
  command: string;                     // Shell command
  args?: string[];                     // Command arguments
  cwd?: string;                       // Working directory
  env?: Record<string, string>;        // Environment variables
  input: 'stdin' | 'env' | 'args';    // How event data is passed
  timeout: number;                     // Max execution time (ms)
}
```

### AgentEventHandler

Delegate event processing to an LLM agent.

```typescript
interface AgentEventHandler {
  type: 'agent';
  systemPrompt?: string;              // System prompt
  model?: string;                      // LLM model identifier
  instructions?: string;              // Processing instructions
  tools?: string[];                    // Available MCP tool names
  maxTokens?: number;                  // Max tokens for response
}
```

### WebhookEventHandler

POST event data to an HTTP endpoint.

```typescript
interface WebhookEventHandler {
  type: 'webhook';
  url: string;                         // Target URL
  headers?: Record<string, string>;    // Custom HTTP headers
  timeout: number;                     // Request timeout (ms)
}
```

## Server Configuration Types

### EventsServerConfig

```typescript
interface EventsServerConfig {
  name: string;                        // Server name
  version: string;                     // Server version
  events?: EventsServerOptions;        // Event options
  handlers?: HandlerExecutorConfig;    // Handler config
}
```

### EventsServerOptions

```typescript
interface EventsServerOptions {
  maxSubscriptions?: number;           // Default: 100
  deliveryChannels?: string[];         // Default: all
  features?: Partial<EventsFeatures>;  // Feature toggles
}
```

### EventsFeatures

```typescript
interface EventsFeatures {
  pause: boolean;                      // Default: true
  wildcards: boolean;                  // Default: true
  cronSchedule: boolean;               // Default: true
  scheduledDelivery: boolean;          // Default: true
}
```

## Transport Types

### TransportState

```typescript
type TransportState = 'disconnected' | 'connecting' | 'connected' | 'error';
```

### Transport

The base transport interface.

```typescript
interface Transport {
  readonly state: TransportState;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: JsonRpcRequest | JsonRpcResponse | JsonRpcNotification): Promise<void>;
  on(event: keyof TransportEvents, listener: Function): void;
  off(event: keyof TransportEvents, listener: Function): void;
}
```

### TransportEvents

```typescript
interface TransportEvents {
  connect: () => void;
  disconnect: (reason?: string) => void;
  error: (error: Error) => void;
  message: (message: JsonRpcRequest | JsonRpcResponse | JsonRpcNotification) => void;
}
```

### ClientTransportOptions

```typescript
interface ClientTransportOptions {
  url: string;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}
```

### ServerTransportOptions

```typescript
interface ServerTransportOptions {
  port: number;
  host?: string;
  path?: string;
}
```

## Protocol Types

### JSON-RPC 2.0

```typescript
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}
```

## Helper Functions

### `createEvent(type, data, metadata)`

Create a well-formed MCPEvent.

```typescript
import { createEvent } from '@mcpe/core';

const event = createEvent(
  'github.push',
  { repository: 'owner/repo' },
  { priority: 'normal' }
);
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `type` | `string` | Event type |
| `data` | `Record<string, unknown>` | Event payload |
| `metadata` | `Omit<EventMetadata, 'timestamp'> & { timestamp?: string }` | Metadata (timestamp auto-generated if omitted) |

**Returns:** `MCPEvent`

### `matchesFilter(event, filter)`

Check if an event matches a filter.

```typescript
import { matchesFilter } from '@mcpe/core';

const matches = matchesFilter(event, {
  eventTypes: ['github.*'],
});
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `event` | `MCPEvent` | Event to test |
| `filter` | `EventFilter` | Filter criteria |

**Returns:** `boolean`

## Error Codes

```typescript
const ErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  NotInitialized: -32000,
  SubscriptionNotFound: -32001,
  SubscriptionLimitReached: -32002,
  DeviceNotFound: -32003,
  Unauthorized: -32004,
} as const;
```
