# Agent Subscription Protocol (ASP) - Example

This example demonstrates the Agent Subscription Protocol (ASP), an open protocol
that enables AI agents to subscribe to and receive events from external systems.

## Design Philosophy

ASP is inspired by the Model Context Protocol (MCP) and follows similar design principles:

### 1. Agent-Centric Control
Just as MCP lets agents decide which tools to call, ASP gives agents control over:
- **What** to subscribe to (filter criteria)
- **When** to subscribe/unsubscribe
- **How** to handle received events

### 2. Transport-Agnostic
Like MCP's unified client that works with different transports (stdio, HTTP),
ASP provides a single `ASPClient` that works with any transport:

```typescript
// WebSocket transport
const client = new ASPClient({
  transport: new WebSocketTransport({ url: 'ws://localhost:3000' }),
  clientInfo: { name: 'MyAgent', version: '1.0.0' }
});

// SSE transport (same client API)
const client = new ASPClient({
  transport: new SSEClientTransport({ serverUrl: 'http://localhost:3000' }),
  clientInfo: { name: 'MyAgent', version: '1.0.0' }
});
```

### 3. Capability Discovery
Agents can introspect what's available before subscribing:

```typescript
const capabilities = await client.getCapabilities();
// {
//   protocolName: 'asp',
//   protocolVersion: '2025-01-01',
//   subscriptions: { maxActive: 100, supportsPause: true, ... },
//   filters: { supportedSources: ['github', 'slack', ...], ... },
//   delivery: { supportedChannels: ['websocket', 'sse', ...], ... }
// }
```

### 4. Schema Discovery for LLM Reasoning
ASP provides JSON Schema definitions that LLMs can use to construct valid requests:

```typescript
const schemas = await client.getSchema();
// Returns operation schemas with:
// - name: 'subscribe'
// - description: 'Subscribe to events matching specified criteria...'
// - inputSchema: { type: 'object', properties: { filter: {...}, delivery: {...} } }
// - examples: [{ input: {...}, output: {...} }]
```

## Protocol Overview

### JSON-RPC 2.0 Foundation
ASP uses JSON-RPC 2.0 (same as MCP) for all communication:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "subscriptions/create",
  "params": {
    "filter": { "sources": ["github"], "eventTypes": ["github.*"] },
    "delivery": { "channels": ["websocket"], "priority": "realtime" }
  }
}
```

### Protocol Methods

| Method | Description |
|--------|-------------|
| `initialize` | Connection handshake |
| `asp/capabilities` | Get server capabilities |
| `asp/schema` | Get operation schemas |
| `subscriptions/create` | Create a new subscription |
| `subscriptions/remove` | Remove a subscription |
| `subscriptions/list` | List all subscriptions |
| `subscriptions/update` | Update a subscription |
| `subscriptions/pause` | Pause event delivery |
| `subscriptions/resume` | Resume event delivery |
| `events/acknowledge` | Acknowledge event receipt |
| `notifications/event` | Event delivery (server→client) |

## Running the Example

### 1. Start the Server
```bash
npx tsx examples/agent-subscription/server.ts
```

### 2. Run the Agent Client
```bash
npx tsx examples/agent-subscription/agent-client.ts
```

## Comparison with MCP

| Aspect | MCP | ASP |
|--------|-----|-----|
| **Purpose** | Tool/resource access | Event subscriptions |
| **Direction** | Client→Server requests | Bidirectional (events pushed) |
| **Protocol** | JSON-RPC 2.0 | JSON-RPC 2.0 |
| **Transport** | stdio, HTTP+SSE | WebSocket, SSE |
| **Discovery** | `tools/list` | `asp/capabilities`, `asp/schema` |
| **Agent Control** | Agent calls tools | Agent manages subscriptions |

## Integration with MCP

ASP is designed to complement MCP. An AI agent might:

1. Use **MCP** to access tools and resources
2. Use **ASP** to subscribe to events that trigger tool usage

```typescript
// MCP: Get available tools
const tools = await mcpClient.listTools();

// ASP: Subscribe to events that should trigger tool usage
await aspClient.subscribe({
  filter: { sources: ['github'], eventTypes: ['github.issue.opened'] },
  delivery: { channels: ['websocket'] }
});

// When event arrives, use MCP tools to respond
aspClient.onEvent('github.issue.*', async (event) => {
  // Use MCP tool to respond to the issue
  await mcpClient.callTool('github_comment', {
    issue: event.data.number,
    body: 'Thanks for reporting this!'
  });
});
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      AI Agent                                │
│  ┌──────────────────┐    ┌──────────────────┐              │
│  │   MCP Client     │    │   ASP Client     │              │
│  │  (tool access)   │    │  (subscriptions) │              │
│  └────────┬─────────┘    └────────┬─────────┘              │
└───────────┼───────────────────────┼─────────────────────────┘
            │                       │
            │                       │
┌───────────▼───────────┐ ┌────────▼────────────────────────┐
│     MCP Server        │ │        ASP Hub                   │
│  (tools, resources)   │ │  (event routing, subscriptions)  │
└───────────────────────┘ └──────────────────────────────────┘
```

## License

MIT
