# ESMCP - Event Subscription MCP

An event subscription system inspired by the Model Context Protocol (MCP), providing real-time event delivery across multiple transport channels.

## Overview

ESMCP is a TypeScript-based event subscription platform that enables clients to subscribe to events from various sources (GitHub, Gmail, Slack, custom) and receive them through multiple delivery channels (WebSocket, SSE, Web Push, APNS).

## Architecture

The project follows a monorepo structure using pnpm workspaces with 6 core packages:

```
esmcp/
├── packages/
│   ├── core/       # Shared types, schemas, and utilities
│   ├── server/     # Event Hub server implementation
│   ├── client/     # Client SDK for connecting to hubs
│   ├── sse/        # Server-Sent Events transport
│   ├── apns/       # Apple Push Notification Service integration
│   └── webpush/    # Web Push (VAPID) notifications
└── examples/       # Demo applications
```

## Core Packages

### @esmcp/core
**Path**: `packages/core/`

Foundation package containing shared types and schemas using Zod for runtime validation.

**Key Types:**
- `ESMCPEvent` - Core event structure with metadata (source, priority, tags, timestamp)
- `EventFilter` - Subscription filtering (sources, event types, tags, priority)
- `Subscription` - Subscription configuration with delivery preferences
- `DeliveryChannel` - Enum: 'websocket' | 'sse' | 'webpush' | 'apns'
- `DeliveryPriority` - Enum: 'realtime' | 'normal' | 'batch'

**JSON-RPC Protocol:**
- Implements JSON-RPC 2.0 for client-server communication
- Methods: `initialize`, `subscription/create`, `subscription/remove`, `subscription/list`, `subscription/update`
- Notifications: `notifications/event`, `device/register` (APNS)
- Error codes for protocol-level and application-level errors

**Key Files:**
- `src/types/events.ts` - Event types and filtering logic
- `src/types/messages.ts` - JSON-RPC message schemas
- `src/types/subscriptions.ts` - Subscription schemas
- `src/types/transport.ts` - Transport interface definitions

### @esmcp/server
**Path**: `packages/server/`

Event Hub server that manages subscriptions and delivers events to clients.

**Components:**

1. **EventHub** (`src/hub/hub.ts`)
   - Main server class managing WebSocket connections
   - Handles JSON-RPC protocol
   - Routes events to matching subscriptions
   - Supports device registration for APNS

2. **SubscriptionManager** (`src/subscription/manager.ts`)
   - CRUD operations for subscriptions
   - Matches events to subscriptions using filters
   - Enforces per-client subscription limits

3. **WebSocketServerTransport** (`src/transport/websocket-server.ts`)
   - WebSocket server implementation
   - Manages client connections
   - Handles message routing

4. **DeviceStore** (`src/device/store.ts`)
   - Stores APNS device tokens
   - Memory-based implementation (extensible)

5. **DeliveryCoordinator** (`src/delivery/coordinator.ts`)
   - Coordinates multi-channel delivery
   - Fallback logic between channels

**Key Files:**
- `src/hub/hub.ts` - Main EventHub implementation
- `src/subscription/manager.ts` - Subscription management
- `src/transport/websocket-server.ts` - WebSocket transport
- `src/delivery/coordinator.ts` - Delivery orchestration

### @esmcp/client
**Path**: `packages/client/`

Client SDK for connecting to ESMCP servers.

**Components:**

1. **ESMCPClient** (`src/client/client.ts`)
   - Main client class
   - Manages connection lifecycle
   - Handles automatic reconnection
   - Provides subscription management methods

2. **WebSocketTransport** (`src/transport/websocket.ts`)
   - WebSocket client implementation
   - Reconnection logic with exponential backoff

3. **HybridTransport** (`src/transport/hybrid.ts`)
   - Combines multiple transports for reliability
   - Automatic fallback between channels

4. **NotificationHandler** (`src/handlers/notification.ts`)
   - Processes incoming event notifications
   - Event acknowledgment handling

**Key Files:**
- `src/client/client.ts` - Main client SDK
- `src/transport/websocket.ts` - WebSocket transport
- `src/transport/hybrid.ts` - Multi-transport fallback
- `src/handlers/notification.ts` - Event handling

### @esmcp/sse
**Path**: `packages/sse/`

Server-Sent Events transport implementation following W3C standard.

**Why SSE:**
- Works through HTTP proxies and firewalls
- Automatic reconnection built into browsers
- Simpler protocol (just HTTP)
- Works with HTTP/2 multiplexing
- Unidirectional (server → client)

**Components:**

1. **SSEServer** (`src/server/sse-server.ts`)
   - HTTP server with SSE endpoints
   - `GET /events/:clientId` - SSE stream for receiving events
   - `POST /rpc/:clientId` - HTTP endpoint for sending commands
   - Heartbeat/keep-alive mechanism

2. **SSEClientTransport** (`src/client/sse-client.ts`)
   - Browser-compatible (uses native EventSource)
   - Works in Node.js with polyfill
   - Automatic reconnection

**Key Files:**
- `src/server/sse-server.ts` - SSE server transport
- `src/client/sse-client.ts` - SSE client transport

### @esmcp/apns
**Path**: `packages/apns/`

Apple Push Notification Service integration for iOS/macOS push notifications.

**Features:**
- HTTP/2 connection to APNS
- JWT-based authentication (no certificates needed)
- Notification builder with rich features
- Supports sandbox and production environments

**Components:**

1. **APNSClient** (`src/client/apns-client.ts`)
   - HTTP/2 session management
   - JWT token generation and caching
   - Send notifications to device tokens

2. **JWTManager** (`src/client/jwt.ts`)
   - Generates signed JWT tokens for APNS authentication
   - Token caching (valid for 1 hour)

3. **NotificationBuilder** (`src/notifications/builder.ts`)
   - Fluent API for building APNS payloads
   - Supports alerts, badges, sounds, custom data
   - Interruption levels (iOS 15+)
   - Relevance scores

**Key Files:**
- `src/client/apns-client.ts` - APNS HTTP/2 client
- `src/client/jwt.ts` - JWT authentication
- `src/notifications/builder.ts` - Notification payload builder

### @esmcp/webpush
**Path**: `packages/webpush/`

Web Push notifications using VAPID (Voluntary Application Server Identification).

**Standards:**
- RFC 8030: Generic Event Delivery Using HTTP Push
- RFC 8291: Message Encryption for Web Push
- RFC 8292: VAPID for server identification

**Why Web Push:**
- OPEN STANDARD - no vendor fees
- Works across all major browsers
- Chrome, Firefox, Edge, Safari (macOS 13+, iOS 16.4+)

**Components:**

1. **WebPushClient** (`src/client/webpush-client.ts`)
   - VAPID key management
   - Send encrypted push notifications
   - Configurable TTL and urgency

2. **NotificationBuilder** (`src/notifications/builder.ts`)
   - Build Web Push payloads
   - Title, body, icons, actions, badges

3. **ServiceWorker** (`src/browser/service-worker.ts`)
   - Browser service worker for receiving pushes
   - Notification display handling
   - Click handlers

**Key Files:**
- `src/client/webpush-client.ts` - Web Push client
- `src/notifications/builder.ts` - Notification builder
- `src/browser/service-worker.ts` - Browser service worker

## Technology Stack

- **Language**: TypeScript 5.3+
- **Runtime**: Node.js 18+
- **Package Manager**: pnpm 8.15+
- **Module System**: ES Modules (type: "module")
- **Validation**: Zod
- **Testing**: Vitest
- **Protocol**: JSON-RPC 2.0 over WebSocket/SSE

## Protocol

### Connection Flow

1. Client connects via WebSocket or SSE
2. Client sends `initialize` request with protocol version and capabilities
3. Server responds with server info and capabilities
4. Connection is ready for subscriptions

### Subscription Flow

1. Client sends `subscription/create` with filter and delivery preferences
2. Server creates subscription and returns subscription ID
3. Server matches incoming events to subscriptions
4. Events are delivered via preferred channel (WebSocket, SSE, APNS, WebPush)
5. Client acknowledges receipt with `event/acknowledge`

### Event Filtering

Events can be filtered by:
- **Sources**: github, gmail, slack, custom
- **Event Types**: Exact match or wildcard (e.g., `github.push.*`)
- **Tags**: Array of string tags
- **Priority**: low, normal, high, critical

## Examples

### Basic Client Usage

```typescript
import { ESMCPClient } from '@esmcp/client';

const client = new ESMCPClient({
  serverUrl: 'ws://localhost:3000',
  clientInfo: { name: 'MyApp', version: '1.0.0' },
});

await client.connect();

const subscription = await client.createSubscription({
  filter: {
    sources: ['github'],
    eventTypes: ['github.push'],
  },
  delivery: {
    channels: ['websocket'],
    priority: 'realtime',
  },
});

client.onEvent((event) => {
  console.log('Received:', event);
});
```

### Server Setup

```typescript
import { EventHub } from '@esmcp/server';

const hub = new EventHub({
  port: 3000,
  maxSubscriptionsPerClient: 100,
  supportedProviders: ['github', 'gmail', 'slack'],
});

await hub.start();

// Publish an event
await hub.publishEvent({
  id: '...',
  type: 'github.push',
  data: { repo: 'myrepo', branch: 'main' },
  metadata: {
    source: 'github',
    timestamp: new Date().toISOString(),
    priority: 'normal',
  },
});
```

## Project Structure

```
.
├── package.json              # Root package with workspace config
├── pnpm-workspace.yaml       # pnpm workspace definition
├── tsconfig.json             # Shared TypeScript configuration
├── vitest.config.ts          # Test configuration
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── events.ts
│   │   │   │   ├── messages.ts
│   │   │   │   ├── subscriptions.ts
│   │   │   │   └── transport.ts
│   │   │   ├── __tests__/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── server/
│   │   ├── src/
│   │   │   ├── hub/
│   │   │   ├── subscription/
│   │   │   ├── transport/
│   │   │   ├── device/
│   │   │   ├── delivery/
│   │   │   └── __tests__/
│   │   └── package.json
│   ├── client/
│   │   ├── src/
│   │   │   ├── client/
│   │   │   ├── transport/
│   │   │   ├── handlers/
│   │   │   └── __tests__/
│   │   └── package.json
│   ├── sse/
│   │   ├── src/
│   │   │   ├── server/
│   │   │   └── client/
│   │   └── package.json
│   ├── apns/
│   │   ├── src/
│   │   │   ├── client/
│   │   │   └── notifications/
│   │   │   └── __tests__/
│   │   └── package.json
│   └── webpush/
│       ├── src/
│       │   ├── client/
│       │   ├── notifications/
│       │   └── browser/
│       └── package.json
└── examples/
    ├── basic-client/
    ├── mock-apns/
    ├── sse-demo/
    └── webpush-demo/
```

## Scripts

```bash
# Build all packages
pnpm build

# Run all tests
pnpm test

# Type check all packages
pnpm typecheck

# Clean build artifacts
pnpm clean

# Lint all packages
pnpm lint
```

## Dependencies

### Production
- `zod` - Schema validation
- `uuid` - UUID generation
- `ws` - WebSocket implementation
- `web-push` - Web Push protocol
- `jsonwebtoken` - JWT for APNS

### Development
- `typescript` - TypeScript compiler
- `vitest` - Testing framework
- `@types/node`, `@types/ws`, `@types/uuid`, `@types/jsonwebtoken`, `@types/web-push` - Type definitions

## Delivery Channels

| Channel | Direction | Use Case | Reliability |
|---------|-----------|----------|-------------|
| WebSocket | Bidirectional | Real-time, active clients | High (when connected) |
| SSE | Server→Client | Browser clients, firewalls | Medium (auto-reconnect) |
| WebPush | Server→Client | Offline browser notifications | High (queued by push service) |
| APNS | Server→Client | iOS/macOS native apps | High (queued by Apple) |

## License

Private - Event Subscription MCP project
