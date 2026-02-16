# Transports

MCPE is transport-agnostic. The protocol layer (JSON-RPC 2.0) is independent of how messages are carried between client and server. This page describes the supported transports and when to use each one.

## Transport Interface

All transports implement a common interface:

```typescript
interface Transport {
  readonly state: TransportState;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: JsonRpcRequest | JsonRpcResponse | JsonRpcNotification): Promise<void>;

  on(event: 'connect' | 'disconnect' | 'error' | 'message', listener: Function): void;
  off(event: 'connect' | 'disconnect' | 'error' | 'message', listener: Function): void;
}
```

### Transport States

| State | Description |
|---|---|
| `disconnected` | Not connected |
| `connecting` | Connection in progress |
| `connected` | Connected and ready to send/receive messages |
| `error` | Connection error occurred |

## Supported Transports

### stdio

The stdio transport communicates over standard input and output streams. This is the default transport for MCP and works well for local integrations where the client spawns the server as a child process.

**When to use:**

- Local development and testing
- CLI tools and scripts
- Desktop applications spawning MCP servers

**Characteristics:**

- Simplest setup; no network configuration
- Single client per server instance
- No reconnection needed (process lifecycle manages the connection)

```typescript
// Server side
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const transport = new StdioServerTransport();
await server.connect(transport);

// Client side
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['server.js'],
});
await client.connect(transport);
```

### WebSocket

WebSocket provides full-duplex communication over a single TCP connection. This is ideal for real-time event delivery where both client and server need to send messages at any time.

**When to use:**

- Real-time event streaming
- Multiple concurrent clients
- Long-lived connections
- Bidirectional communication

**Characteristics:**

- Full-duplex (both sides can send at any time)
- Supports multiple concurrent clients
- Automatic reconnection support
- Low latency for real-time events

```typescript
// Server side
const hub = new EventHub({
  port: 8080,
  serverInfo: { name: 'My Server', version: '1.0.0' },
  supportedProviders: ['github', 'slack'],
});
await hub.start();

// Client side
const client = new ESMCPClient({
  serverUrl: 'ws://localhost:8080',
  clientInfo: { name: 'My Client', version: '1.0.0' },
  capabilities: { websocket: true },
  reconnect: true,
  reconnectInterval: 1000,
  maxReconnectAttempts: 5,
});
await client.connect();
```

### SSE (Server-Sent Events)

SSE is a unidirectional transport where the server can push events to the client over HTTP. The client sends requests via standard HTTP POST. This is useful in environments where WebSocket connections are blocked by firewalls or proxies.

**When to use:**

- Firewall-restricted environments
- HTTP-only infrastructure
- When you need server push but not full-duplex
- Environments where WebSocket is unavailable

**Characteristics:**

- Server to client push over HTTP
- Client to server via HTTP POST
- Firewall-friendly (standard HTTP)
- Automatic reconnection built into the SSE protocol
- One-directional server push (client uses separate HTTP requests)

```typescript
// Server side
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

const transport = new SSEServerTransport('/events', response);
await server.connect(transport);

// Client side
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const transport = new SSEClientTransport(new URL('http://localhost:8080/sse'));
await client.connect(transport);
```

## Transport Selection Guide

| Requirement | Recommended Transport |
|---|---|
| Local development | stdio |
| Real-time events, low latency | WebSocket |
| Firewall-restricted environments | SSE |
| Multiple concurrent clients | WebSocket or SSE |
| Simplest possible setup | stdio |
| Production event streaming | WebSocket |
| Behind corporate proxy | SSE |

## Reconnection

Both WebSocket and SSE transports support automatic reconnection:

```typescript
const client = new ESMCPClient({
  serverUrl: 'ws://localhost:8080',
  clientInfo: { name: 'My Client', version: '1.0.0' },
  reconnect: true,
  reconnectInterval: 1000,       // 1 second between attempts
  maxReconnectAttempts: 5,       // give up after 5 failures
});
```

When a connection drops:

1. The transport enters the `connecting` state
2. It attempts to reconnect at the configured interval
3. On success, the `connect` event fires and normal operation resumes
4. After `maxReconnectAttempts` failures, the transport enters the `error` state

Subscriptions are maintained server-side, so reconnected clients automatically resume receiving events for their active subscriptions.

## Transport Events

All transports emit the following events:

| Event | Description |
|---|---|
| `connect` | Connection established |
| `disconnect` | Connection closed (with optional reason) |
| `error` | Connection error occurred |
| `message` | JSON-RPC message received |

```typescript
transport.on('connect', () => {
  console.log('Connected');
});

transport.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});

transport.on('error', (error) => {
  console.error('Transport error:', error);
});

transport.on('message', (msg) => {
  console.log('Received:', msg);
});
```
