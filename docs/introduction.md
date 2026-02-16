# MCP Events (MCPE)

> A proposed extension to the Model Context Protocol for real-time event subscriptions.

MCP gives AI agents access to **tools** and **resources**, but agents currently lack a standardized way to **subscribe to and receive real-time events** from external systems. MCPE fills that gap.

## What is MCPE?

MCPE extends MCP's design philosophy to event subscriptions:

| MCP | MCPE |
|-----|------|
| `tools/list` | Capability discovery via `initialize` |
| `tools/call` | `events_subscribe` tool |
| Tool schemas for LLM reasoning | Operation schemas for subscription reasoning |
| Request/Response | Subscribe/Notify |

**MCP Tools** let agents perform actions (imperative). **MCPE Subscriptions** let agents receive events (reactive). Together, they enable agents that can both **act** and **react**.

```typescript
// MCP: Agent acts
await mcp.callTool('github_create_issue', { title: 'Bug', body: '...' });

// MCPE: Agent reacts
client.onEvent('github.issue.commented', async (event) => {
  await mcp.callTool('github_add_comment', {
    issue: event.data.issue_number,
    body: 'Thanks for the feedback!'
  });
});
```

## Design Principles

- **Agent-Centric** - Agents decide what to subscribe to, when to pause, and when to unsubscribe.
- **Transport-Agnostic** - Works over WebSocket, SSE, or stdio - just like MCP.
- **Schema-Driven** - LLM-friendly schemas enable agents to reason about subscriptions.
- **Open Standards** - Built on JSON-RPC 2.0, following MCP conventions.

## Architecture

```
+-----------------------------------------------------------------+
|                          AI AGENT                               |
|  "Subscribe to high-priority GitHub issues in repo X"           |
+-----------------------------+-----------------------------------+
                              |
                  MCP Protocol (JSON-RPC 2.0)
                              |
                              v
+-----------------------------------------------------------------+
|                      MCPE SERVER                                |
|  +--------------+  +------------------+  +-------------------+  |
|  | Capability   |  |  Subscription    |  |  Delivery         |  |
|  | Discovery    |  |  Manager         |  |  Coordinator      |  |
|  +--------------+  +------------------+  +-------------------+  |
+-----------------------------+-----------------------------------+
                              |
                +-------------+-------------+
                v             v             v
          +----------+  +----------+  +----------+
          |  GitHub  |  |  Slack   |  |  Gmail   |
          +----------+  +----------+  +----------+
```

## Reference Implementation

This repository contains a working reference implementation using the `@mcpe/core` package:

```
packages/
└── mcpe/
    └── src/
        ├── server/    # EventsServer - wraps McpServer with events
        ├── client/    # EventsClient - wraps MCP Client with events
        └── types/     # Core types, schemas, capabilities
```

## Status

MCPE is a **proposal and reference implementation**. We welcome feedback on protocol design, transport requirements, security considerations, and integration patterns with existing MCP servers.
