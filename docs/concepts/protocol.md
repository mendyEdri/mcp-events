# Protocol

MCPE builds on the Model Context Protocol (MCP) by adding event subscription capabilities. This page explains the protocol architecture, message flow, and how MCPE extends MCP without breaking compatibility.

## Protocol Overview

MCPE uses **JSON-RPC 2.0** as its wire format, the same as MCP. It introduces:

- **Six MCP tools** for subscription management (`events_subscribe`, `events_unsubscribe`, `events_list`, `events_pause`, `events_resume`, `events_update`)
- **Three MCP notifications** for event delivery (`events/event`, `events/batch`, `events/subscription_expired`)
- **Capability negotiation** during the MCP `initialize` handshake

Because subscriptions are registered as standard MCP tools, any MCP-compatible client can discover and use them. The notification channel leverages MCP's existing notification infrastructure.

## Protocol Version

```
2025-01-01
```

The protocol version follows a date-based format. It is exchanged during the initialize handshake.

## Message Flow

### Connection and Capability Discovery

```
Client                              Server
  |                                    |
  |--- initialize ------------------>  |
  |    { protocolVersion, clientInfo } |
  |                                    |
  |<-- initialize result ------------ |
  |    { protocolVersion, serverInfo,  |
  |      capabilities }               |
  |                                    |
  |--- initialized notification ---->  |
  |                                    |
```

During initialization, the server advertises its MCPE capabilities including:

- Maximum number of active subscriptions
- Supported delivery channels
- Available features (pause, wildcards, cron, scheduled delivery)

### Subscription Lifecycle

```
Client                              Server
  |                                    |
  |--- events_subscribe ----------->  |
  |    { filter, delivery }           |
  |                                    |
  |<-- subscription object ---------- |
  |    { id, status: "active" }       |
  |                                    |
  |              ... time passes ...   |
  |                                    |
  |<-- events/event notification ---- |
  |    { event, subscriptionId }      |
  |                                    |
  |--- events_pause --------------->  |
  |    { subscriptionId }             |
  |                                    |
  |<-- { success: true } ------------ |
  |                                    |
  |--- events_resume -------------->  |
  |    { subscriptionId }             |
  |                                    |
  |<-- { success: true } ------------ |
  |                                    |
  |--- events_unsubscribe --------->  |
  |    { subscriptionId }             |
  |                                    |
  |<-- { success: true } ------------ |
  |                                    |
```

### Batch Delivery (Cron/Scheduled)

```
Client                              Server
  |                                    |
  |--- events_subscribe ----------->  |
  |    { filter, delivery: {          |
  |        channels: ["cron"],        |
  |        cronSchedule: {            |
  |          expression: "@hourly"    |
  |        }                          |
  |      }                            |
  |    }                              |
  |                                    |
  |<-- subscription object ---------- |
  |                                    |
  |        ... cron fires ...          |
  |                                    |
  |<-- events/batch notification ---- |
  |    { events: [...],               |
  |      subscriptionId }             |
  |                                    |
```

## JSON-RPC 2.0 Message Types

### Request

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "events_subscribe",
    "arguments": {
      "filter": { "eventTypes": ["github.*"] },
      "delivery": { "channels": ["realtime"] }
    }
  }
}
```

### Response

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"id\":\"550e8400-...\",\"status\":\"active\"}"
    }]
  }
}
```

### Notification (no `id` field)

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/message",
  "params": {
    "method": "events/event",
    "params": {
      "subscriptionId": "550e8400-...",
      "event": {
        "id": "event-uuid",
        "type": "github.push",
        "data": { "repository": "owner/repo" },
        "metadata": {
          "timestamp": "2025-01-15T10:30:00Z",
          "priority": "normal"
        }
      }
    }
  }
}
```

## Tool Registration

MCPE registers the following tools on the MCP server:

| Tool Name | Description |
|---|---|
| `events_subscribe` | Create a new event subscription |
| `events_unsubscribe` | Remove an existing subscription |
| `events_list` | List subscriptions (optionally filtered by status) |
| `events_pause` | Pause event delivery for a subscription |
| `events_resume` | Resume a paused subscription |
| `events_update` | Modify filter, delivery, or expiration of a subscription |

Each tool has a JSON Schema describing its input and output, making it discoverable by LLMs.

## Notification Methods

| Method | Direction | Description |
|---|---|---|
| `events/event` | Server to Client | Single event delivery |
| `events/batch` | Server to Client | Batch of aggregated events |
| `events/subscription_expired` | Server to Client | Subscription has expired |

## Error Codes

MCPE uses standard JSON-RPC 2.0 error codes plus custom codes:

| Code | Name | Description |
|---|---|---|
| -32700 | ParseError | Invalid JSON |
| -32600 | InvalidRequest | Invalid JSON-RPC request |
| -32601 | MethodNotFound | Method does not exist |
| -32602 | InvalidParams | Invalid method parameters |
| -32603 | InternalError | Server internal error |
| -32000 | NotInitialized | Client has not initialized |
| -32001 | SubscriptionNotFound | Subscription ID not found |
| -32002 | SubscriptionLimitReached | Maximum subscriptions exceeded |
| -32003 | DeviceNotFound | Device ID not found |
| -32004 | Unauthorized | Authentication failure |

## Compatibility

MCPE is fully backward-compatible with MCP. A standard MCP client that does not use events will work normally with an MCPE server -- the event tools simply appear in the tool list alongside any other tools. An MCPE client connecting to a standard MCP server can detect the absence of event capabilities and fall back gracefully.
