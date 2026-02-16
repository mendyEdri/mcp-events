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

MCPE extends MCP with a subscription-based event system. It follows the same design principles as MCP itself:

| MCP Capability | MCPE Equivalent |
|---|---|
| Tools (agent performs actions) | Subscriptions (agent receives events) |
| `tools/list` for discovery | Capability negotiation via `initialize` |
| `tools/call` for execution | `events_subscribe` tool for subscribing |
| Tool schemas for LLM reasoning | Operation schemas for subscription reasoning |
| Request / Response | Subscribe / Notify |

**MCP Tools** let agents act (imperative). **MCPE Subscriptions** let agents react (reactive). Together, they enable agents that can both **act on** and **respond to** the world.

## Design Principles

### Agent-Centric

The agent is in control. It decides:

- **What** to subscribe to (filters by source, event type, tags, priority)
- **When** to receive events (realtime, cron schedule, one-time delivery)
- **How** to process events (bash commands, webhooks, LLM agents)
- **When to stop** (pause, resume, unsubscribe, expiration)

The server never pushes unsolicited events. Every event delivery corresponds to an active subscription created by the agent.

### Transport-Agnostic

MCPE works over the same transports as MCP:

- **stdio** for local integrations
- **WebSocket** for persistent bidirectional connections
- **SSE** (Server-Sent Events) for firewall-friendly streaming

The protocol layer is pure JSON-RPC 2.0. Transport details are abstracted away.

### Schema-Driven

All subscription operations have JSON Schema definitions. This allows LLMs to:

- Discover available operations through capability negotiation
- Understand the structure of subscribe and unsubscribe calls
- Reason about filter criteria and delivery preferences
- Generate valid subscription requests autonomously

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

- Rich filtering by source, type, tags, and priority
- Multiple delivery modes (realtime, cron, scheduled)
- Event handlers (bash, webhook, agent)
- Batch delivery and aggregation
- Pause and resume
- Expiration management

MCPE is designed for event-driven agent workflows, not simple resource change notifications.
