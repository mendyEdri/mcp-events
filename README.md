# Agent Subscription Protocol (ASP)

> **A proposed extension to the Model Context Protocol (MCP) for real-time event subscriptions**

[![Protocol Version](https://img.shields.io/badge/protocol-2025--01--01-blue.svg)](./packages/core/src/types/protocol.ts)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

## The Problem

MCP gives AI agents access to **tools** and **resources**, but agents currently lack a standardized way to **subscribe to and receive real-time events** from external systems.

Consider these scenarios:
- An agent monitoring a GitHub repository for new issues
- An agent waiting for Slack messages in a specific channel
- An agent tracking deployment status updates
- An agent receiving email notifications

Today, agents must either:
1. **Poll repeatedly** - Wasteful and slow
2. **Use proprietary webhooks** - No standard, each integration is custom
3. **Stay connected indefinitely** - Not practical for most agent architectures

## The Proposal: Agent Subscription Protocol

ASP extends MCP's design philosophy to event subscriptions:

| MCP | ASP |
|-----|-----|
| `tools/list` | `asp/capabilities` |
| `tools/call` | `subscriptions/create` |
| Tool schemas for LLM reasoning | Operation schemas for subscription reasoning |
| Request/Response | Subscribe/Notify |

### Design Principles

1. **Agent-Centric** - Agents decide what to subscribe to, when to pause, and when to unsubscribe
2. **Transport-Agnostic** - Works over WebSocket, SSE, or stdio (like MCP)
3. **Schema-Driven** - LLM-friendly schemas enable agents to reason about subscriptions
4. **Open Standards** - Built on JSON-RPC 2.0, Web Push (RFC 8030), and SSE

## Protocol Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              AI AGENT                                    │
│                                                                         │
│  "Subscribe to high-priority GitHub issues in repo X"                   │
│                                                                         │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                    ASP Protocol (JSON-RPC 2.0)
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           ASP SERVER (Hub)                               │
│                                                                         │
│  ┌──────────────┐   ┌──────────────────┐   ┌──────────────────────┐    │
│  │ Capability   │   │  Subscription    │   │  Delivery            │    │
│  │ Discovery    │   │  Manager         │   │  Coordinator         │    │
│  │              │   │                  │   │                      │    │
│  │ asp/caps     │   │ create/remove    │   │ WebSocket│SSE│Push   │    │
│  │ asp/schema   │   │ pause/resume     │   │                      │    │
│  └──────────────┘   └──────────────────┘   └──────────────────────┘    │
│                                                                         │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                    Provider Adapters
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
        ┌──────────┐     ┌──────────┐     ┌──────────┐
        │  GitHub  │     │  Slack   │     │  Gmail   │
        └──────────┘     └──────────┘     └──────────┘
```

## Protocol Methods

### Capability Discovery

```typescript
// Agent asks: "What can I subscribe to?"
{ "method": "asp/capabilities" }

// Server responds with full capability description
{
  "subscriptions": {
    "maxActive": 100,
    "supportsPause": true,
    "supportsExpiration": true
  },
  "filters": {
    "supportedSources": ["github", "slack", "gmail"],
    "supportsWildcardTypes": true,    // e.g., "github.*"
    "supportsTagFiltering": true,
    "supportsPriorityFiltering": true
  },
  "delivery": {
    "supportedChannels": ["websocket", "sse", "webpush"],
    "supportedPriorities": ["realtime", "normal", "batch"]
  }
}
```

### Schema Discovery (for LLM Reasoning)

```typescript
// Agent asks: "How do I create a subscription?"
{ "method": "asp/schema", "params": { "operations": ["subscribe"] } }

// Server returns JSON Schema that LLMs can reason about
{
  "operations": [{
    "name": "subscribe",
    "description": "Subscribe to events matching specified criteria...",
    "inputSchema": {
      "type": "object",
      "properties": {
        "filter": {
          "sources": { "enum": ["github", "slack", "gmail"] },
          "eventTypes": { "description": "Supports wildcards like github.*" },
          "priority": { "enum": ["low", "normal", "high", "critical"] }
        },
        "delivery": {
          "channels": { "enum": ["websocket", "sse", "webpush"] },
          "priority": { "enum": ["realtime", "normal", "batch"] }
        }
      }
    }
  }]
}
```

### Subscription Management

```typescript
// Create subscription
{ "method": "subscriptions/create", "params": {
    "filter": { "sources": ["github"], "eventTypes": ["github.issue.*"] },
    "delivery": { "channels": ["websocket"], "priority": "realtime" }
}}

// Pause (stop receiving without losing subscription)
{ "method": "subscriptions/pause", "params": { "subscriptionId": "..." } }

// Resume
{ "method": "subscriptions/resume", "params": { "subscriptionId": "..." } }

// Remove
{ "method": "subscriptions/remove", "params": { "subscriptionId": "..." } }
```

### Event Delivery

```typescript
// Server pushes event to agent
{ "method": "notifications/event", "params": {
    "subscriptionId": "sub_123",
    "event": {
      "id": "evt_456",
      "type": "github.issue.opened",
      "data": { "title": "Bug report", "repo": "org/repo" },
      "metadata": {
        "source": "github",
        "priority": "high",
        "timestamp": "2025-01-15T10:30:00Z"
      }
    }
}}
```

## Client SDK

```typescript
import { ASPClient, WebSocketTransport } from '@anthropic/asp-client';

// Create client with any transport (like MCP)
const client = new ASPClient({
  transport: new WebSocketTransport({ url: 'ws://localhost:8080' }),
  clientInfo: { name: 'MyAgent', version: '1.0.0' }
});

await client.connect();

// Discover capabilities (agent introspection)
const caps = await client.getCapabilities();
console.log('Available sources:', caps.filters.supportedSources);

// Get schemas for LLM reasoning
const schemas = await client.getSchema(['subscribe', 'unsubscribe']);

// Subscribe to events
const subscription = await client.subscribe({
  filter: {
    sources: ['github'],
    eventTypes: ['github.push', 'github.pull_request.*'],
    priority: ['high', 'critical']
  },
  delivery: {
    channels: ['websocket'],
    priority: 'realtime'
  }
});

// Handle events (pattern matching like MCP tool handlers)
client.onEvent('github.*', (event, subscriptionId) => {
  console.log('GitHub event:', event.type, event.data);
});

// Lifecycle management
await client.pauseSubscription(subscription.id);   // Temporary pause
await client.resumeSubscription(subscription.id);  // Resume
await client.unsubscribe(subscription.id);         // Remove
```

## Transport Options

ASP supports multiple transports, enabling different deployment scenarios:

| Transport | Use Case | Pros | Cons |
|-----------|----------|------|------|
| **WebSocket** | Real-time bidirectional | Low latency, full duplex | Requires persistent connection |
| **SSE** | Firewall-friendly | Works through proxies, HTTP-based | Server→Client only |
| **Web Push** | Offline/background | Works when app closed | Browser-only, async |
| **stdio** | Local MCP integration | Same as MCP tools | Local only |

## Reference Implementation

This repository contains a working reference implementation:

```
packages/
├── core/      # @esmcp/core - Protocol types and schemas
├── client/    # @esmcp/client - ASPClient SDK
├── server/    # @esmcp/server - EventHub reference server
├── sse/       # @esmcp/sse - SSE transport
└── webpush/   # @esmcp/webpush - Web Push transport
```

### Quick Start

```bash
# Install
pnpm install
pnpm build

# Start the server
cd examples/webpush-demo
npx tsx server-ws.ts

# In another terminal: receive events
npx tsx cli-receive.ts

# In another terminal: publish events
npx tsx cli-publish.ts github.push '{"repo":"test","commits":3}'
```

## Why Not Just Use Webhooks?

| Feature | Webhooks | ASP |
|---------|----------|-----|
| Agent controls subscription | No (server configured) | Yes |
| Pause/Resume | No | Yes |
| Filter by priority | No | Yes |
| Multiple delivery channels | No | Yes |
| LLM-readable schemas | No | Yes |
| Transport agnostic | No | Yes |
| Standardized protocol | No | Yes |

## Relationship to MCP

ASP is designed to **complement MCP**, not replace it:

- **MCP Tools** = Agent performs actions (imperative)
- **ASP Subscriptions** = Agent receives events (reactive)

Together, they enable fully autonomous agents that can both **act** and **react**.

```typescript
// MCP: Agent acts
await mcp.callTool('github_create_issue', { title: 'Bug', body: '...' });

// ASP: Agent reacts
asp.onEvent('github.issue.commented', async (event) => {
  // Respond to comments on issues the agent created
  await mcp.callTool('github_add_comment', {
    issue: event.data.issue_number,
    body: 'Thanks for the feedback!'
  });
});
```

## Status

This is a **proposal and reference implementation**. We welcome feedback from the MCP community on:

1. Protocol design decisions
2. Additional transport requirements
3. Security considerations
4. Integration patterns with existing MCP servers

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT License - See [LICENSE](./LICENSE)

---

*Inspired by the [Model Context Protocol](https://modelcontextprotocol.io) by Anthropic*
