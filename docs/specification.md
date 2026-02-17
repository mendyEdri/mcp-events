# MCPE Specification

**MCP Events (MCPE) Protocol Specification**
**Version:** 2025-01-01
**Status:** Proposal

## 1. Introduction

MCPE (MCP Events) is an open protocol that extends the Model Context Protocol (MCP) with event subscription capabilities. It enables AI agents to subscribe to, receive, and manage real-time events from external systems such as GitHub, Slack, Gmail, and custom sources.

### 1.1 Motivation

MCP provides tools and resources for AI agents, but lacks a standardized mechanism for agents to receive asynchronous events. Agents that need to react to external changes must either poll (inefficient) or use ad-hoc integrations (non-standard). MCPE fills this gap with a subscription-based event system where the LLM itself manages subscriptions through MCP tool calls.

### 1.2 Design Goals

1. **LLM-Native**: The LLM itself is the subscriber — subscriptions are MCP tools the LLM calls naturally
2. **Self-Managing**: The LLM controls the full subscription lifecycle (create, pause, resume, adjust, delete)
3. **Schema-Driven**: LLM-readable schemas enable autonomous discovery and subscription without human configuration
4. **Transport-Agnostic**: Works over any MCP-compatible transport (stdio, WebSocket, SSE)
4. **Backward-Compatible**: MCPE servers work with standard MCP clients; MCPE clients work with standard MCP servers
5. **Open Standards**: Built on JSON-RPC 2.0, cron expressions, ISO 8601, UUID v4

### 1.3 Relationship to MCP

MCPE is a superset of MCP. It does not modify or replace any MCP functionality. Event subscription operations are registered as standard MCP tools. Event delivery uses MCP's notification mechanism. Capability discovery uses MCP's initialization handshake.

## 2. Protocol

### 2.1 Wire Format

All messages use JSON-RPC 2.0:

```json
// Request
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": { ... }
}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { ... }
}

// Notification (no id, no response expected)
{
  "jsonrpc": "2.0",
  "method": "notifications/message",
  "params": { ... }
}
```

### 2.2 Protocol Version

```
2025-01-01
```

The protocol version is exchanged during the MCP `initialize` handshake. Servers and clients MUST agree on a compatible version.

### 2.3 Transports

MCPE supports any transport that MCP supports:

- **stdio**: Standard input/output streams
- **WebSocket**: Full-duplex TCP connection
- **SSE**: Server-Sent Events over HTTP

The choice of transport does not affect the protocol semantics.

## 3. Capability Discovery

### 3.1 Initialization

During the MCP `initialize` handshake, the server advertises MCPE capabilities as part of its response. The presence of event-related capabilities indicates MCPE support.

### 3.2 Capability Object

```typescript
interface MCPECapabilities {
  protocolVersion: string;
  protocolName: 'mcpe';

  serverInfo: {
    name: string;
    version: string;
  };

  subscriptions: {
    maxActive: number;
    maxFiltersPerSubscription: number;
    supportsPause: boolean;
    supportsExpiration: boolean;
    supportsBatching: boolean;
  };

  filters: {
    supportsWildcardTypes: boolean;
    supportsTagFiltering: boolean;
    supportsPriorityFiltering: boolean;
  };

  delivery: {
    supportedChannels: DeliveryChannel[];
    supportedPriorities: DeliveryPriority[];
    supportsMultiChannel: boolean;
  };

  scheduling?: {
    cronEnabled: boolean;
    scheduledEnabled: boolean;
    supportedTimezones?: string[];
    maxScheduledPerClient?: number;
    cronPresets?: string[];
  };
}
```

## 4. Events

### 4.1 Event Structure

```typescript
interface MCPEvent {
  id: string;                    // UUID v4, unique identifier
  type: string;                  // Dot-notation type (e.g., "github.push")
  data: Record<string, unknown>; // Arbitrary JSON payload
  metadata: EventMetadata;       // Structured metadata
}
```

### 4.2 Event Metadata

```typescript
interface EventMetadata {
  sourceEventId?: string;        // Original event ID from source system
  timestamp: string;             // ISO 8601 datetime
  priority: EventPriority;       // 'low' | 'normal' | 'high' | 'critical'
  tags?: string[];               // Freeform tags
}
```

### 4.3 Event Types

Event types use dot-notation to form a hierarchical namespace:

```
source.category
source.category.action
```

Examples: `github.push`, `github.pull_request.opened`, `slack.message`, `gmail.message.received`

### 4.4 Wildcard Matching

Trailing wildcards are supported in event type patterns:

- `github.*` matches any type starting with `github.`
- `*` matches all types
- Exact strings match only that specific type

## 5. Subscriptions

### 5.1 Subscription Structure

```typescript
interface Subscription {
  id: string;                    // UUID v4, server-assigned
  clientId: string;              // Subscribing client identifier
  filter: EventFilter;           // Event matching criteria
  delivery: DeliveryPreferences; // How events are delivered
  handler?: EventHandler;        // Optional server-side handler
  status: SubscriptionStatus;    // 'active' | 'paused' | 'expired'
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
  expiresAt?: string;            // Optional ISO 8601 expiration
}
```

### 5.2 Event Filter

```typescript
interface EventFilter {
  eventTypes?: string[];         // Supports wildcards
  tags?: string[];               // Match any tag
  priority?: EventPriority[];    // Match any priority
}
```

**Matching Rules:**

1. All specified fields MUST match (AND)
2. Within a field, any value MAY match (OR)
3. Omitted fields always match
4. An empty filter matches all events

### 5.3 Delivery Preferences

```typescript
interface DeliveryPreferences {
  channels: DeliveryChannel[];
  cronSchedule?: CronSchedule;
  scheduledDelivery?: ScheduledDelivery;
}
```

### 5.4 Subscription Status

| Status | Description |
|---|---|
| `active` | Subscription is live, events are delivered |
| `paused` | Subscription exists, events are NOT delivered |
| `expired` | Subscription has expired, no further delivery |

### 5.5 Subscription Limits

Servers MUST enforce a maximum number of active subscriptions per client. The default is 100. Exceeding the limit returns error code -32002.

## 6. Operations

All subscription operations are registered as MCP tools.

### 6.1 events_subscribe

Create a new subscription.

**Input:**

| Field | Type | Required | Description |
|---|---|---|---|
| `filter` | EventFilter | Yes | Event matching criteria |
| `delivery` | DeliveryPreferences | Yes | Delivery configuration |
| `handler` | EventHandler | No | Server-side event handler |
| `expiresAt` | string (ISO 8601) | No | Expiration time |

**Output:** Subscription object

**Errors:** -32602 (invalid params), -32002 (limit reached)

### 6.2 events_unsubscribe

Remove a subscription.

**Input:**

| Field | Type | Required | Description |
|---|---|---|---|
| `subscriptionId` | string (UUID) | Yes | Subscription to remove |

**Output:** `{ success: boolean }`

**Errors:** -32001 (not found)

### 6.3 events_list

List subscriptions.

**Input:**

| Field | Type | Required | Description |
|---|---|---|---|
| `status` | SubscriptionStatus | No | Filter by status |

**Output:** `{ subscriptions: Subscription[] }`

### 6.4 events_pause

Pause an active subscription.

**Input:**

| Field | Type | Required | Description |
|---|---|---|---|
| `subscriptionId` | string (UUID) | Yes | Subscription to pause |

**Output:** `{ success: boolean, status: 'paused' }`

**Errors:** -32001 (not found)

### 6.5 events_resume

Resume a paused subscription.

**Input:**

| Field | Type | Required | Description |
|---|---|---|---|
| `subscriptionId` | string (UUID) | Yes | Subscription to resume |

**Output:** `{ success: boolean, status: 'active' }`

**Errors:** -32001 (not found)

### 6.6 events_update

Update a subscription.

**Input:**

| Field | Type | Required | Description |
|---|---|---|---|
| `subscriptionId` | string (UUID) | Yes | Subscription to update |
| `updates` | UpdateSubscriptionRequest | Yes | Fields to change |

**Output:** Updated Subscription object

**Errors:** -32001 (not found), -32602 (invalid params)

## 7. Notifications

Notifications are sent from server to client. They have no `id` field and require no response.

### 7.1 events/event

Deliver a single event.

```json
{
  "method": "events/event",
  "params": {
    "subscriptionId": "uuid",
    "event": { MCPEvent }
  }
}
```

### 7.2 events/batch

Deliver a batch of events.

```json
{
  "method": "events/batch",
  "params": {
    "subscriptionId": "uuid",
    "events": [ MCPEvent, MCPEvent, ... ]
  }
}
```

### 7.3 events/subscription_expired

Notify that a subscription has expired.

```json
{
  "method": "events/subscription_expired",
  "params": {
    "subscriptionId": "uuid",
    "expiredAt": "2025-01-15T10:30:00Z"
  }
}
```

## 8. Delivery Modes

### 8.1 Realtime

Events are delivered immediately via `events/event` notifications. This is best-effort delivery -- if the transport is disconnected, events are dropped.

### 8.2 Cron

Events are aggregated and delivered as batches on a recurring schedule.

```typescript
interface CronSchedule {
  expression: string;         // Cron expression or preset
  timezone: string;           // IANA timezone
  aggregateEvents: boolean;   // Default: true
  maxEventsPerDelivery: number; // Default: 100
}
```

Supported presets: `@hourly`, `@daily`, `@weekly`, `@monthly`

### 8.3 Scheduled

Events are aggregated and delivered once at a specific time.

```typescript
interface ScheduledDelivery {
  deliverAt: string;          // ISO 8601 datetime
  timezone: string;           // IANA timezone
  description?: string;       // Human-readable
  aggregateEvents: boolean;   // Default: true
  autoExpire: boolean;        // Default: true
}
```

## 9. Event Handlers

Subscriptions can optionally include a handler for server-side event processing.

### 9.1 Bash Handler

```typescript
interface BashEventHandler {
  type: 'bash';
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  input: 'stdin' | 'env' | 'args';
  timeout: number;
}
```

### 9.2 Webhook Handler

```typescript
interface WebhookEventHandler {
  type: 'webhook';
  url: string;
  headers?: Record<string, string>;
  timeout: number;
}
```

### 9.3 Agent Handler

```typescript
interface AgentEventHandler {
  type: 'agent';
  systemPrompt?: string;
  model?: string;
  instructions?: string;
  tools?: string[];
  maxTokens?: number;
}
```

## 10. Error Codes

| Code | Name | Description |
|---|---|---|
| -32700 | ParseError | Invalid JSON |
| -32600 | InvalidRequest | Invalid JSON-RPC request |
| -32601 | MethodNotFound | Method does not exist |
| -32602 | InvalidParams | Invalid method parameters |
| -32603 | InternalError | Server internal error |
| -32000 | NotInitialized | Client not initialized |
| -32001 | SubscriptionNotFound | Subscription ID not found |
| -32002 | SubscriptionLimitReached | Max subscriptions exceeded |
| -32003 | DeviceNotFound | Device ID not found |
| -32004 | Unauthorized | Authentication failure |

## 11. Security Considerations

### 11.1 Authentication

MCPE relies on the underlying transport for authentication. Servers SHOULD authenticate clients before accepting subscriptions.

### 11.2 Authorization

Servers SHOULD implement authorization to control which event types each client can subscribe to.

### 11.3 Rate Limiting

Servers SHOULD implement rate limiting on:

- Subscription creation
- Event publication
- Notification delivery

### 11.4 Event Data

Event payloads may contain sensitive information. Servers SHOULD filter event data based on client authorization. Webhook handlers SHOULD use HTTPS. Bash handlers SHOULD sanitize inputs.

## 12. Conformance

### 12.1 Server Requirements

A conformant MCPE server MUST:

1. Register all six subscription tools
2. Support the `events/event` notification
3. Advertise capabilities during initialization
4. Enforce subscription limits
5. Validate filter and delivery parameters

A conformant MCPE server SHOULD:

1. Support the `events/batch` notification
2. Support the `events/subscription_expired` notification
3. Support at least the `realtime` delivery channel
4. Support event type wildcards
5. Support pause and resume

### 12.2 Client Requirements

A conformant MCPE client MUST:

1. Check server capabilities before subscribing
2. Handle `events/event` notifications
3. Clean up subscriptions on disconnect

A conformant MCPE client SHOULD:

1. Handle `events/batch` notifications
2. Handle `events/subscription_expired` notifications
3. Support reconnection and subscription recovery
