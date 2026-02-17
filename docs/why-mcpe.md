# Why MCPE?

## The Problem

The Model Context Protocol (MCP) gives AI agents access to **tools** and **resources**, enabling them to read data and take actions. But MCP is fundamentally request-response: the agent asks, the server answers.

This leaves a critical gap. Agents have no standardized way to:

- **React to external events** in real time (new GitHub issues, Slack messages, emails)
- **Monitor systems** without constant polling
- **Schedule tasks** based on time or incoming data
- **Aggregate notifications** from multiple sources into a unified stream

Without event subscriptions, agents must either poll repeatedly (wasteful and slow) or rely on ad-hoc integrations outside the MCP ecosystem.

## The Solution

MCPE extends MCP with a subscription-based event system where the LLM itself manages subscriptions through tool calls:

| MCP Capability | MCPE Equivalent |
|---|---|
| Tools (agent performs actions) | Subscriptions (agent receives events) |
| `tools/list` for discovery | Capability negotiation via `initialize` |
| `tools/call` for execution | `events_subscribe` tool for subscribing |
| Tool schemas for LLM reasoning | Operation schemas for subscription reasoning |
| Request / Response | Subscribe / Notify |

**MCP Tools** let agents act (imperative). **MCPE Subscriptions** let agents react (reactive). Together, they enable agents that can both **act on** and **respond to** the world.

## Design Principles

### LLM-Native

MCPE's core innovation is that the **LLM itself is the subscriber**. Subscription management is exposed as MCP tools that the LLM calls naturally during conversation. The LLM discovers available event types through capability negotiation, reasons about what the user needs, and autonomously creates subscriptions — no developer configuration required.

This is fundamentally different from traditional pub/sub or webhook systems where a human configures integrations. With MCPE, subscriptions emerge from the LLM's understanding of context:

```
User: "Let me know if anyone comments on my PR #42"

LLM thinks: I should subscribe to github.pull_request.commented events
LLM calls:  events_subscribe({ filter: { eventTypes: ['github.pull_request.commented'] } })
```

### Self-Managing

The LLM controls the full subscription lifecycle. It decides:

- **What** to subscribe to (filters by event type, tags, priority)
- **When** to receive events (realtime, cron schedule, one-time delivery)
- **How** to process events (bash commands, webhooks, LLM agents)
- **When to stop** (pause, resume, unsubscribe, expiration)

The server never pushes unsolicited events. Every event delivery corresponds to an active subscription created by the LLM. As context evolves, the LLM can dynamically adjust its subscriptions — adding new ones, pausing others, or changing filters.

### Schema-Driven

All subscription operations have JSON Schema definitions that LLMs can read and reason about. This enables:

- Discovering what event types are available and what filters are supported
- Understanding the structure of subscribe and unsubscribe calls
- Reasoning about delivery preferences and scheduling options
- Generating valid subscription requests without human guidance

### Transport-Agnostic

MCPE works over the same transports as MCP:

- **stdio** for local integrations
- **WebSocket** for persistent bidirectional connections
- **SSE** (Server-Sent Events) for firewall-friendly streaming

The protocol layer is pure JSON-RPC 2.0. Transport details are abstracted away.

### Built on Open Standards

- **JSON-RPC 2.0** for the wire protocol
- **MCP conventions** for tool registration and notifications
- **Cron expressions** for scheduling
- **ISO 8601** for timestamps and timezones
- **UUID v4** for identifiers

## When to Use MCPE

MCPE is a good fit when your agent needs to:

- **Monitor repositories** for new issues, PRs, or deployments
- **Watch email** for important messages matching certain criteria
- **Track Slack channels** for mentions or keywords
- **Aggregate events** from multiple sources into daily or weekly digests
- **Schedule reminders** or delayed processing
- **React to webhooks** by routing them through agent logic

## Comparison with Alternatives

### Polling with MCP Tools

You could use standard MCP tools to periodically check for new data. But this approach:

- Wastes compute on empty polls
- Introduces latency between event occurrence and detection
- Requires the agent to maintain polling state
- Does not scale well across many sources

MCPE solves all of these with push-based delivery.

### Custom Webhook Integrations

You could wire up webhooks directly. But this approach:

- Requires per-service configuration outside MCP
- Has no standardized subscription management
- Cannot be introspected or controlled by the agent
- Does not support pause, resume, or expiration

MCPE provides a unified subscription model the agent can manage.

### MCP Resource Subscriptions

MCP has a basic `resources/subscribe` mechanism for watching resource changes. MCPE goes much further:

- Rich filtering by type, tags, and priority
- Multiple delivery modes (realtime, cron, scheduled)
- Event handlers (bash, webhook, agent)
- Batch delivery and aggregation
- Pause and resume
- Expiration management

MCPE is designed for event-driven agent workflows, not simple resource change notifications.
