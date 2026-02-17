# Protocol Methods

This page documents all JSON-RPC methods in the MCPE protocol, including request and response schemas.

## Overview

MCPE uses MCP tools for subscription management (Client to Server) and MCP notifications for event delivery (Server to Client).

| Category | Method | Direction |
|---|---|---|
| Subscription | `events_subscribe` | Client to Server |
| Subscription | `events_unsubscribe` | Client to Server |
| Subscription | `events_list` | Client to Server |
| Subscription | `events_pause` | Client to Server |
| Subscription | `events_resume` | Client to Server |
| Subscription | `events_update` | Client to Server |
| Notification | `events/event` | Server to Client |
| Notification | `events/batch` | Server to Client |
| Notification | `events/subscription_expired` | Server to Client |

## Subscription Tools

All subscription operations are registered as MCP tools. Clients invoke them via `tools/call`.

### events_subscribe

Create a new event subscription.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "events_subscribe",
    "arguments": {
      "filter": {
        "eventTypes": ["github.push", "github.pull_request.*"],
        "tags": ["production"],
        "priority": ["high", "critical"]
      },
      "delivery": {
        "channels": ["realtime"]
      },
      "expiresAt": "2025-02-01T00:00:00Z"
    }
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"id\":\"550e8400-e29b-41d4-a716-446655440000\",\"clientId\":\"client-1\",\"filter\":{\"eventTypes\":[\"github.push\",\"github.pull_request.*\"],\"tags\":[\"production\"],\"priority\":[\"high\",\"critical\"]},\"delivery\":{\"channels\":[\"realtime\"]},\"status\":\"active\",\"createdAt\":\"2025-01-15T10:30:00Z\",\"updatedAt\":\"2025-01-15T10:30:00Z\",\"expiresAt\":\"2025-02-01T00:00:00Z\"}"
    }]
  }
}
```

**Error Codes:**

| Code | Condition |
|---|---|
| -32602 | Invalid filter or delivery parameters |
| -32002 | Subscription limit reached |

### events_unsubscribe

Remove an existing subscription.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "events_unsubscribe",
    "arguments": {
      "subscriptionId": "550e8400-e29b-41d4-a716-446655440000"
    }
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"success\":true}"
    }]
  }
}
```

**Error Codes:**

| Code | Condition |
|---|---|
| -32001 | Subscription not found |

### events_list

List subscriptions, optionally filtered by status.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "events_list",
    "arguments": {
      "status": "active"
    }
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"subscriptions\":[{\"id\":\"550e8400-...\",\"clientId\":\"client-1\",\"filter\":{\"eventTypes\":[\"github.*\"]},\"delivery\":{\"channels\":[\"realtime\"]},\"status\":\"active\",\"createdAt\":\"2025-01-15T10:30:00Z\",\"updatedAt\":\"2025-01-15T10:30:00Z\"}]}"
    }]
  }
}
```

### events_pause

Pause an active subscription. Event delivery stops but the subscription is preserved.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "events_pause",
    "arguments": {
      "subscriptionId": "550e8400-e29b-41d4-a716-446655440000"
    }
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"success\":true,\"status\":\"paused\"}"
    }]
  }
}
```

**Error Codes:**

| Code | Condition |
|---|---|
| -32001 | Subscription not found |

### events_resume

Resume a paused subscription. Event delivery restarts.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "events_resume",
    "arguments": {
      "subscriptionId": "550e8400-e29b-41d4-a716-446655440000"
    }
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"success\":true,\"status\":\"active\"}"
    }]
  }
}
```

**Error Codes:**

| Code | Condition |
|---|---|
| -32001 | Subscription not found |

### events_update

Update a subscription's filter, delivery preferences, or expiration.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "tools/call",
  "params": {
    "name": "events_update",
    "arguments": {
      "subscriptionId": "550e8400-e29b-41d4-a716-446655440000",
      "updates": {
        "filter": {
          "eventTypes": ["github.push"]
        },
        "delivery": {
          "channels": ["cron"],
          "cronSchedule": {
            "expression": "@daily",
            "timezone": "UTC"
          }
        },
        "expiresAt": "2025-06-01T00:00:00Z"
      }
    }
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"id\":\"550e8400-...\",\"clientId\":\"client-1\",\"filter\":{\"eventTypes\":[\"github.push\"]},\"delivery\":{\"channels\":[\"cron\"],\"cronSchedule\":{\"expression\":\"@daily\",\"timezone\":\"UTC\"}},\"status\":\"active\",\"createdAt\":\"2025-01-15T10:30:00Z\",\"updatedAt\":\"2025-01-15T11:00:00Z\",\"expiresAt\":\"2025-06-01T00:00:00Z\"}"
    }]
  }
}
```

**Error Codes:**

| Code | Condition |
|---|---|
| -32001 | Subscription not found |
| -32602 | Invalid update parameters |

## Notification Methods

Notifications are sent from server to client. They have no `id` field and do not expect a response.

### events/event

Deliver a single event to a subscriber.

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/message",
  "params": {
    "method": "events/event",
    "params": {
      "subscriptionId": "550e8400-e29b-41d4-a716-446655440000",
      "event": {
        "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        "type": "github.push",
        "data": {
          "repository": "owner/repo",
          "branch": "main",
          "commits": 3
        },
        "metadata": {
          "timestamp": "2025-01-15T10:30:00Z",
          "priority": "normal",
          "tags": ["ci"]
        }
      }
    }
  }
}
```

Used by: Realtime delivery channel.

### events/batch

Deliver a batch of events to a subscriber.

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/message",
  "params": {
    "method": "events/batch",
    "params": {
      "subscriptionId": "550e8400-e29b-41d4-a716-446655440000",
      "events": [
        {
          "id": "event-1-uuid",
          "type": "github.push",
          "data": { "repository": "owner/repo", "branch": "main" },
          "metadata": {
            "timestamp": "2025-01-15T09:00:00Z",
            "priority": "normal"
          }
        },
        {
          "id": "event-2-uuid",
          "type": "github.issue",
          "data": { "repository": "owner/repo", "title": "Bug report" },
          "metadata": {
            "timestamp": "2025-01-15T09:15:00Z",
            "priority": "high"
          }
        }
      ]
    }
  }
}
```

Used by: Cron and scheduled delivery channels.

### events/subscription_expired

Notify a client that one of its subscriptions has expired.

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/message",
  "params": {
    "method": "events/subscription_expired",
    "params": {
      "subscriptionId": "550e8400-e29b-41d4-a716-446655440000",
      "expiredAt": "2025-02-01T00:00:00Z"
    }
  }
}
```

This is sent when:
- A subscription's `expiresAt` time passes
- A scheduled delivery with `autoExpire: true` completes
- The server explicitly expires a subscription

## Protocol Constants

### Method Names

```typescript
const MCPEMethods = {
  Initialize: 'initialize',
  GetCapabilities: 'mcpe/capabilities',
  GetSchema: 'mcpe/schema',
  SubscriptionCreate: 'subscriptions/create',
  SubscriptionRemove: 'subscriptions/remove',
  SubscriptionList: 'subscriptions/list',
  SubscriptionUpdate: 'subscriptions/update',
  SubscriptionPause: 'subscriptions/pause',
  SubscriptionResume: 'subscriptions/resume',
  EventAcknowledge: 'events/acknowledge',
  NotificationEvent: 'notifications/event',
  NotificationSubscriptionExpired: 'notifications/subscription_expired',
  DeviceRegister: 'devices/register',
  DeviceInvalidate: 'devices/invalidate',
};
```

### Protocol Version

```typescript
const MCPE_PROTOCOL_VERSION = '2025-01-01';
```
