# MCP Events Extension Proposal (MCPE)

> **Status**: Draft Proposal  
> **Version**: 2025-01-01  
> **Authors**: MCP Events Working Group  
> **Target**: Model Context Protocol Specification

## Abstract

This document proposes **MCP Events (MCPE)**, an extension to the Model Context Protocol that enables AI agents to subscribe to and receive real-time events from external systems. MCPE complements MCP's existing capabilities by adding a standardized, agent-controlled event subscription mechanism.

## Motivation

### The Gap in Current MCP

MCP provides excellent primitives for agents to **act** on the world:

| Primitive | Purpose | Agent Role |
|-----------|---------|------------|
| Tools | Execute actions | Caller |
| Resources | Read data | Reader |
| Prompts | Get templates | Consumer |

However, MCP currently lacks a standardized mechanism for agents to **react** to external events. This creates a significant limitation:

```
┌─────────────────────────────────────────────────────────────────┐
│                        CURRENT MCP                               │
│                                                                  │
│  Agent ──────────────────────────────> External Systems          │
│         Tools: "Create issue", "Send message", "Deploy"          │
│                                                                  │
│  Agent <─────────────── ??? ──────────> External Systems         │
│         No standard way to receive:                              │
│         "Issue commented", "Message received", "Deploy failed"   │
└─────────────────────────────────────────────────────────────────┘
```

### Current Workarounds and Their Limitations

| Approach | Limitation |
|----------|------------|
| **Polling** | Wasteful, slow, doesn't scale |
| **Webhooks** | Server-configured, not agent-controlled |
| **Custom integrations** | Non-standard, each service is different |
| **Long-lived connections** | Complex for serverless/ephemeral agents |

### Use Cases Enabled by MCPE

1. **Autonomous Monitoring**: Agent subscribes to GitHub issues and auto-triages them
2. **Event-Driven Workflows**: Agent reacts to Slack mentions, email arrivals, calendar changes
3. **Observability**: Agent monitors system alerts and takes corrective action
4. **Human-in-the-Loop**: Agent receives approval events before proceeding with sensitive operations

## Design Principles

MCPE follows MCP's design philosophy and adds principles specific to LLM-driven event subscriptions:

| Principle | How MCPE Implements It |
|-----------|----------------------|
| **LLM-Native** | The LLM itself is the subscriber — subscriptions are MCP tools the LLM calls naturally |
| **Self-Managing** | The LLM controls the full lifecycle (create, pause, resume, adjust, remove) |
| **Schema-Driven** | LLM-readable schemas enable autonomous discovery and subscription without human configuration |
| **Transport-Agnostic** | Works over stdio, SSE, WebSocket (same as MCP) |
| **JSON-RPC 2.0** | Same protocol foundation as MCP |
| **Backwards Compatible** | Extends MCP without breaking existing implementations |

## Protocol Specification

### Overview

MCPE adds event subscription capabilities via **MCP Tools** and delivers events via **MCP Notifications**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                            MCPE ARCHITECTURE                            │
│                                                                        │
│  ┌─────────────┐                              ┌──────────────────────┐ │
│  │   Agent     │     MCP Protocol             │    MCPE Server       │ │
│  │             │◄────────────────────────────►│                      │ │
│  │  - Subscribe│     (JSON-RPC 2.0)           │  - Subscription Mgr  │ │
│  │  - Pause    │                              │  - Event Router      │ │
│  │  - Resume   │                              │  - Scheduler         │ │
│  │  - Handle   │                              │                      │ │
│  └─────────────┘                              └──────────────────────┘ │
│                                                        │               │
│                                                        │ Provider      │
│                                                        │ Adapters      │
│                                               ┌────────┴───────────┐   │
│                                               │                    │   │
│                                          ┌────┴───┐  ┌────┴───┐  ┌┴───┴──┐
│                                          │ GitHub │  │ Slack  │  │ Gmail │
│                                          └────────┘  └────────┘  └───────┘
└────────────────────────────────────────────────────────────────────────┘
```

### 1. Capability Declaration

MCPE-enabled servers declare their capabilities in the initialization response:

```typescript
// Server capability declaration (extends existing MCP capabilities)
interface ServerCapabilities {
  // ... existing MCP capabilities ...
  
  events?: {
    maxSubscriptions: number;           // Max subscriptions per client
    deliveryChannels: DeliveryChannel[]; // ["realtime", "cron", "scheduled"]
    features: {
      pause: boolean;          // Supports pause/resume
      wildcards: boolean;      // Supports "github.*" patterns
      cronSchedule: boolean;   // Supports cron-based batching
      scheduledDelivery: boolean; // Supports one-time scheduled delivery
    };
  };
}

type DeliveryChannel = "realtime" | "cron" | "scheduled";
```

### 2. Subscription Management Tools

MCPE registers the following tools with the MCP server:

#### `events_subscribe`

Create a new event subscription.

```typescript
// Tool: events_subscribe
{
  name: "events_subscribe",
  description: "Subscribe to events matching a filter",
  inputSchema: {
    type: "object",
    properties: {
      filter: {
        type: "object",
        properties: {
          eventTypes: {
            type: "array", 
            items: { type: "string" },
            description: "Event types, supports wildcards (e.g., ['github.push', 'github.issue.*'])"
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Filter by tags (OR matching)"
          },
          priority: {
            type: "array",
            items: { enum: ["low", "normal", "high", "critical"] },
            description: "Filter by priority levels"
          }
        }
      },
      delivery: {
        type: "object",
        properties: {
          channels: {
            type: "array",
            items: { enum: ["realtime", "cron", "scheduled"] },
            description: "How events should be delivered"
          },
          cronSchedule: {
            type: "object",
            properties: {
              expression: { type: "string", description: "Cron expression (e.g., '0 9 * * *')" },
              timezone: { type: "string", description: "IANA timezone" },
              aggregateEvents: { type: "boolean", default: true }
            },
            description: "For cron delivery channel"
          },
          scheduledDelivery: {
            type: "object",
            properties: {
              deliverAt: { type: "string", format: "date-time" },
              timezone: { type: "string" },
              autoExpire: { type: "boolean", default: true }
            },
            description: "For scheduled (one-time) delivery"
          }
        },
        required: ["channels"]
      },
      handler: {
        description: "Optional handler to process events",
        oneOf: [
          {
            type: "object",
            properties: {
              type: { const: "bash" },
              command: { type: "string" },
              args: { type: "array", items: { type: "string" } },
              input: { enum: ["stdin", "env", "args"] }
            },
            required: ["type", "command"]
          },
          {
            type: "object",
            properties: {
              type: { const: "agent" },
              systemPrompt: { type: "string" },
              model: { type: "string" },
              tools: { type: "array", items: { type: "string" } }
            },
            required: ["type"]
          },
          {
            type: "object",
            properties: {
              type: { const: "webhook" },
              url: { type: "string", format: "uri" },
              headers: { type: "object" }
            },
            required: ["type", "url"]
          }
        ]
      },
      expiresAt: {
        type: "string",
        format: "date-time",
        description: "When the subscription should expire"
      }
    }
  }
}

// Response
{
  subscriptionId: "uuid",
  status: "active",
  filter: { ... },
  delivery: { ... },
  createdAt: "ISO-8601",
  expiresAt?: "ISO-8601"
}
```

#### `events_unsubscribe`

Remove a subscription.

```typescript
{
  name: "events_unsubscribe",
  inputSchema: {
    type: "object",
    properties: {
      subscriptionId: { type: "string", format: "uuid" }
    },
    required: ["subscriptionId"]
  }
}
```

#### `events_list`

List active subscriptions.

```typescript
{
  name: "events_list",
  inputSchema: {
    type: "object",
    properties: {
      status: { enum: ["active", "paused", "expired"] }
    }
  }
}
```

#### `events_pause` / `events_resume`

Pause and resume subscriptions without losing state.

```typescript
{
  name: "events_pause",
  inputSchema: {
    type: "object",
    properties: {
      subscriptionId: { type: "string", format: "uuid" }
    },
    required: ["subscriptionId"]
  }
}
```

#### `events_update`

Modify an existing subscription.

```typescript
{
  name: "events_update",
  inputSchema: {
    type: "object",
    properties: {
      subscriptionId: { type: "string", format: "uuid" },
      filter: { /* same as subscribe */ },
      delivery: { /* same as subscribe */ },
      expiresAt: { type: "string", format: "date-time", nullable: true }
    },
    required: ["subscriptionId"]
  }
}
```

### 3. Event Delivery Notifications

Events are delivered via MCP notifications:

#### `events/event` - Single Event Delivery

```typescript
// Notification method: events/event
{
  method: "events/event",
  params: {
    subscriptionId: "uuid",
    event: {
      id: "uuid",
      type: "github.issue.opened",
      data: {
        // Event-specific payload
        title: "Bug report",
        repo: "org/repo",
        number: 123
      },
      metadata: {
        sourceEventId: "gh-evt-456",
        timestamp: "2025-01-15T10:30:00Z",
        priority: "high",
        tags: ["bug", "frontend"]
      }
    }
  }
}
```

#### `events/batch` - Batch Event Delivery

For cron and scheduled delivery channels:

```typescript
{
  method: "events/batch",
  params: {
    subscriptionId: "uuid",
    events: [
      { id: "...", type: "...", data: {...}, metadata: {...} },
      { id: "...", type: "...", data: {...}, metadata: {...} }
    ]
  }
}
```

#### `events/subscription_expired`

Notifies when a subscription has expired:

```typescript
{
  method: "events/subscription_expired",
  params: {
    subscriptionId: "uuid"
  }
}
```

### 4. Event Structure

All events follow a standardized structure:

```typescript
interface MCPEvent {
  id: string;            // Unique event ID (UUID)
  type: string;          // Hierarchical type (e.g., "github.issue.opened")
  data: Record<string, unknown>;  // Event payload
  metadata: {
    sourceEventId?: string;  // Original event ID from source
    timestamp: string;   // ISO 8601 timestamp
    priority: "low" | "normal" | "high" | "critical";
    tags?: string[];     // Optional categorization
  };
}
```

### 5. Event Filtering

Event matching uses the following rules:

| Filter | Matching Logic |
|--------|----------------|
| `eventTypes` | Supports exact match and wildcards (`github.*`) |
| `tags` | Any tag matches (OR logic) |
| `priority` | Priority must be in list |
| (combined) | All specified filters must match (AND logic) |

```typescript
// Example: Match high-priority GitHub and Slack events tagged with "ci" or "deploy"
{
  eventTypes: ["github.push", "github.deployment.*", "slack.message"],
  tags: ["ci", "deploy"],
  priority: ["high", "critical"]
}
```

## Client SDK Changes

### MCP Client Extension

```typescript
import { Client } from "@modelcontextprotocol/sdk/client";

// Extended client with events support
class EventsClient {
  private client: Client;
  
  constructor(config: { name: string; version: string }) {
    this.client = new Client(config, { capabilities: {} });
  }
  
  async connect(transport: Transport): Promise<void> {
    await this.client.connect(transport);
  }
  
  // Check if server supports events
  supportsEvents(): boolean {
    return this.client.getServerCapabilities()?.events !== undefined;
  }
  
  // Subscribe to events
  async subscribe(request: CreateSubscriptionRequest): Promise<SubscribeResult> {
    return this.client.callTool({
      name: "events_subscribe",
      arguments: request
    });
  }
  
  // Register event handler (pattern matching)
  onEvent(pattern: string, handler: EventCallback): () => void {
    // Implementation handles notification routing
  }
  
  // Unsubscribe
  async unsubscribe(subscriptionId: string): Promise<boolean>;
  
  // Pause/Resume
  async pause(subscriptionId: string): Promise<void>;
  async resume(subscriptionId: string): Promise<void>;
  
  // List subscriptions
  async listSubscriptions(status?: SubscriptionStatus): Promise<Subscription[]>;
}
```

### Usage Example

```typescript
import { EventsClient } from "@mcpe/core";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new EventsClient({ name: "my-agent", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: "mcpe-server" }));

// Check capabilities
if (client.supportsEvents()) {
  // Subscribe to GitHub push events
  const sub = await client.subscribe({
    filter: {
      eventTypes: ["github.push", "github.pull_request.*"],
      priority: ["high", "critical"]
    },
    delivery: {
      channels: ["realtime"]
    }
  });
  
  // Handle events
  client.onEvent("github.*", async (event, subscriptionId) => {
    console.log(`Received ${event.type}:`, event.data);
    
    // React using MCP tools
    await mcpClient.callTool({
      name: "slack_send_message",
      arguments: {
        channel: "#alerts",
        text: `New GitHub event: ${event.type}`
      }
    });
  });
}
```

## Server SDK Changes

### MCP Server Extension

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

// Wraps MCP server with events capability
class EventsServer {
  private server: McpServer;
  private subscriptionManager: SubscriptionManager;
  
  constructor(config: {
    name: string;
    version: string;
    events?: EventsServerOptions;
  }) {
    this.server = new McpServer(
      { name: config.name, version: config.version },
      { 
        capabilities: {
          events: this.buildCapability(config.events)
        }
      }
    );
    
    this.registerTools();
  }
  
  // Publish event to matching subscriptions
  async publish(event: MCPEvent): Promise<void> {
    const matching = this.subscriptionManager.findMatchingSubscriptions(event);
    for (const sub of matching) {
      await this.deliverEvent(event, sub);
    }
  }
  
  // Convenience method
  async publish(
    type: string,
    data: Record<string, unknown>,
    metadata: EventMetadata
  ): Promise<void>;
  
  // Connect to transport
  async connect(transport: Transport): Promise<void>;
}
```

### Usage Example

```typescript
import { EventsServer } from "@mcpe/core";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new EventsServer({
  name: "my-events-server",
  version: "1.0.0",
  events: {
    maxSubscriptions: 100,
    deliveryChannels: ["realtime", "cron", "scheduled"],
    features: {
      pause: true,
      wildcards: true,
      cronSchedule: true
    }
  }
});

// Connect to a GitHub webhook receiver (example)
githubWebhooks.on("*", (event) => {
  server.publish({
    type: `github.${event.type}`,
    data: event.payload,
    metadata: {
      sourceEventId: event.id,
      timestamp: new Date().toISOString(),
      priority: inferPriority(event),
      tags: extractTags(event)
    }
  });
});

// Start server
await server.connect(new StdioServerTransport());
```

## Delivery Modes

### Realtime Delivery

Events are delivered immediately via MCP notifications.

```typescript
await client.subscribe({
  filter: { eventTypes: ["github.push"] },
  delivery: { channels: ["realtime"] }
});
```

### Cron-Based Batching

Events are aggregated and delivered on a schedule.

```typescript
// Daily digest at 9am Eastern
await client.subscribe({
  filter: { eventTypes: ["github.*"] },
  delivery: {
    channels: ["cron"],
    cronSchedule: {
      expression: "0 9 * * *",
      timezone: "America/New_York",
      aggregateEvents: true,
      maxEventsPerDelivery: 100
    }
  }
});
```

### Scheduled (One-Time) Delivery

Events are batched until a specific time.

```typescript
// Remind me in 4 hours
await client.subscribe({
  filter: { eventTypes: ["reminder.*"] },
  delivery: {
    channels: ["scheduled"],
    scheduledDelivery: {
      deliverAt: "2025-01-15T14:00:00Z",
      autoExpire: true,
      description: "4-hour reminder batch"
    }
  }
});
```

## Event Handlers

Subscriptions can include handlers for automatic event processing:

### Bash Handler

Execute shell commands when events arrive.

```typescript
await client.subscribe({
  filter: { eventTypes: ["alert.*"], priority: ["critical"] },
  delivery: { channels: ["realtime"] },
  handler: {
    type: "bash",
    command: "notify-send",
    args: ["Critical Alert", "$MCPE_EVENT_TYPE"],
    input: "env"  // Pass event data as environment variables
  }
});
```

### Agent Handler

Delegate event processing to an LLM agent.

```typescript
await client.subscribe({
  filter: { eventTypes: ["slack.message"] },
  delivery: { channels: ["realtime"] },
  handler: {
    type: "agent",
    systemPrompt: "Summarize this Slack message and determine if it requires action.",
    model: "claude-sonnet-4-5-20250929",
    tools: ["slack_reply", "create_task"]
  }
});
```

### Webhook Handler

POST events to an HTTP endpoint.

```typescript
await client.subscribe({
  filter: { eventTypes: ["deployment.*"] },
  delivery: { channels: ["realtime"] },
  handler: {
    type: "webhook",
    url: "https://api.example.com/events",
    headers: { "Authorization": "Bearer ${WEBHOOK_TOKEN}" }
  }
});
```

## Comparison: MCP vs MCPE

| Aspect | MCP | MCPE |
|--------|-----|------|
| **Primary Pattern** | Request/Response | Subscribe/Notify |
| **Agent Role** | Caller | Listener |
| **Discovery** | `tools/list` | Capability in init |
| **Interaction** | `tools/call` | `events_subscribe` + notifications |
| **Data Flow** | Agent → Server → External | External → Server → Agent |
| **Protocol** | JSON-RPC 2.0 | JSON-RPC 2.0 |
| **Transport** | stdio/SSE/WS | stdio/SSE/WS |

## Integration with Existing MCP

MCPE is designed to work seamlessly alongside existing MCP capabilities:

```typescript
// Combined MCP + MCPE agent
const mcpClient = new Client({ name: "agent", version: "1.0.0" });
const eventsClient = new EventsClient(mcpClient);

await mcpClient.connect(transport);

// MCP: Use tools to act
await mcpClient.callTool({
  name: "github_create_issue",
  arguments: { title: "New feature request", body: "..." }
});

// MCPE: Subscribe to react
await eventsClient.subscribe({
  filter: { eventTypes: ["github.issue.commented"] },
  delivery: { channels: ["realtime"] }
});

eventsClient.onEvent("github.issue.*", async (event) => {
  // React to events using MCP tools
  await mcpClient.callTool({
    name: "github_add_comment",
    arguments: {
      issue: event.data.issue_number,
      body: "Thanks for the feedback!"
    }
  });
});
```

## Security Considerations

1. **Subscription Authorization**: Servers should validate that clients are authorized to subscribe to specific event types
2. **Rate Limiting**: Servers should implement rate limits on subscriptions and events
3. **Event Filtering**: Sensitive data should be filtered before delivery
4. **Handler Security**: Bash handlers should be sandboxed; webhook handlers should use HTTPS
5. **Expiration**: Subscriptions should have default TTLs to prevent resource exhaustion

## Backwards Compatibility

- Servers without MCPE support simply don't advertise the `events` capability
- Clients can check `supportsEvents()` before using event features
- All MCPE features use standard MCP tools/notifications mechanism
- No changes to existing MCP protocol primitives

## Reference Implementation

A complete reference implementation is available at: [mcp-event repository]

```
packages/
├── @mcpe/core           # Protocol types, schemas, server, and client
│   ├── @mcpe/core/server  # EventsServer wrapper for MCP servers
│   └── @mcpe/core/client  # EventsClient wrapper for MCP clients
└── examples/        # Demo applications
```

## Open Questions

1. **Event Persistence**: Should servers persist events for clients that disconnect?
2. **Acknowledgments**: Should clients acknowledge event receipt?
3. **Ordering Guarantees**: What ordering guarantees should the protocol provide?
4. **Event Replay**: Should clients be able to request historical events?

## Timeline

| Phase | Description |
|-------|-------------|
| **Draft** | Current - gathering feedback |
| **Review** | Community review and iteration |
| **Experimental** | SDK implementations marked experimental |
| **Stable** | Incorporated into official MCP specification |

## Acknowledgments

- Inspired by the [Model Context Protocol](https://modelcontextprotocol.io) by Anthropic
- Built on JSON-RPC 2.0, Web Push (RFC 8030), and SSE standards

---

## Appendix A: Full Type Definitions

```typescript
// Event types
interface MCPEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
  metadata: EventMetadata;
}

interface EventMetadata {
  sourceEventId?: string;
  timestamp: string;
  priority: "low" | "normal" | "high" | "critical";
  tags?: string[];
}

// Filter types
interface EventFilter {
  eventTypes?: string[];
  tags?: string[];
  priority?: Array<"low" | "normal" | "high" | "critical">;
}

// Delivery types
interface DeliveryPreferences {
  channels: Array<"realtime" | "cron" | "scheduled">;
  cronSchedule?: CronSchedule;
  scheduledDelivery?: ScheduledDelivery;
}

interface CronSchedule {
  expression: string;
  timezone?: string;
  aggregateEvents?: boolean;
  maxEventsPerDelivery?: number;
}

interface ScheduledDelivery {
  deliverAt: string;
  timezone?: string;
  description?: string;
  aggregateEvents?: boolean;
  autoExpire?: boolean;
}

// Handler types
type EventHandler = BashHandler | AgentHandler | WebhookHandler;

interface BashHandler {
  type: "bash";
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  input?: "stdin" | "env" | "args";
  timeout?: number;
}

interface AgentHandler {
  type: "agent";
  systemPrompt?: string;
  model?: string;
  instructions?: string;
  tools?: string[];
  maxTokens?: number;
}

interface WebhookHandler {
  type: "webhook";
  url: string;
  headers?: Record<string, string>;
  timeout?: number;
}

// Subscription types
interface Subscription {
  id: string;
  clientId: string;
  filter: EventFilter;
  delivery: DeliveryPreferences;
  handler?: EventHandler;
  status: "active" | "paused" | "expired";
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

// Capability types
interface EventsCapability {
  maxSubscriptions: number;
  deliveryChannels: Array<"realtime" | "cron" | "scheduled">;
  features: {
    pause: boolean;
    wildcards: boolean;
    cronSchedule: boolean;
    scheduledDelivery: boolean;
  };
}
```

## Appendix B: Protocol Methods Summary

| Category | Method/Tool | Direction | Purpose |
|----------|-------------|-----------|---------|
| Discovery | `initialize` (capability) | Client ← Server | Advertise events support |
| Subscribe | `events_subscribe` | Client → Server | Create subscription |
| Manage | `events_unsubscribe` | Client → Server | Remove subscription |
| Manage | `events_list` | Client → Server | List subscriptions |
| Manage | `events_pause` | Client → Server | Pause subscription |
| Manage | `events_resume` | Client → Server | Resume subscription |
| Manage | `events_update` | Client → Server | Modify subscription |
| Deliver | `events/event` | Client ← Server | Single event notification |
| Deliver | `events/batch` | Client ← Server | Batch event notification |
| Lifecycle | `events/subscription_expired` | Client ← Server | Expiration notification |
