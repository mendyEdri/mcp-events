# MCP Integration Guide

This guide explains how MCPE integrates with the Model Context Protocol (MCP) and how to add event subscriptions to existing MCP servers and clients.

## How MCPE Extends MCP

MCPE does not replace MCP or require a separate protocol. It adds event subscription capabilities on top of MCP by using:

1. **MCP Tools** for subscription management (subscribe, unsubscribe, list, pause, resume, update)
2. **MCP Notifications** for event delivery (events/event, events/batch, events/subscription_expired)
3. **MCP Capability Negotiation** to advertise event support during initialization

This means any MCP-compatible infrastructure (transports, authentication, tool discovery) works with MCPE out of the box.

## Adding Events to an Existing MCP Server

### Before (MCP only)

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({
  name: 'my-server',
  version: '1.0.0',
});

// Existing MCP tools
server.tool('search_issues', {
  query: { type: 'string' },
  repo: { type: 'string' },
}, async ({ query, repo }) => ({
  content: [{ type: 'text', text: JSON.stringify(results) }],
}));

server.tool('create_issue', {
  title: { type: 'string' },
  body: { type: 'string' },
}, async ({ title, body }) => ({
  content: [{ type: 'text', text: JSON.stringify(issue) }],
}));

const transport = new StdioServerTransport();
await server.connect(transport);
```

### After (MCP + MCPE)

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { EventsServer } from '@mcpe/core';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const mcpServer = new McpServer({
  name: 'my-server',
  version: '1.0.0',
});

// Existing MCP tools (unchanged)
mcpServer.tool('search_issues', {
  query: { type: 'string' },
  repo: { type: 'string' },
}, async ({ query, repo }) => ({
  content: [{ type: 'text', text: JSON.stringify(results) }],
}));

mcpServer.tool('create_issue', {
  title: { type: 'string' },
  body: { type: 'string' },
}, async ({ title, body }) => ({
  content: [{ type: 'text', text: JSON.stringify(issue) }],
}));

// Wrap with EventsServer to add MCPE support
const eventsServer = new EventsServer(mcpServer, {
  supportedSources: ['github'],
  maxSubscriptions: 100,
});

const transport = new StdioServerTransport();
await eventsServer.connect(transport);

// Now you can publish events
eventsServer.publish('github.issue.created', {
  number: 42,
  title: 'New issue',
}, {
  source: 'github',
  priority: 'normal',
});
```

The key change is wrapping `McpServer` with `EventsServer`. All existing tools continue to work. Six new tools are registered for event subscriptions.

## Adding Events to an Existing MCP Client

### Before (MCP only)

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({
  name: 'my-client',
  version: '1.0.0',
});

const transport = new StdioClientTransport({
  command: 'node',
  args: ['server.js'],
});
await client.connect(transport);

// Use MCP tools
const result = await client.callTool('search_issues', {
  query: 'bug',
  repo: 'owner/repo',
});
```

### After (MCP + MCPE)

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { EventsClient } from '@mcpe/core';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const mcpClient = new Client({
  name: 'my-client',
  version: '1.0.0',
});

// Wrap with EventsClient
const eventsClient = new EventsClient(mcpClient);

const transport = new StdioClientTransport({
  command: 'node',
  args: ['server.js'],
});
await eventsClient.connect(transport);

// Existing MCP tool calls still work through the underlying client
// (access via eventsClient's MCP client if needed)

// Now you can also subscribe to events
if (eventsClient.supportsEvents()) {
  const sub = await eventsClient.subscribe({
    filter: { sources: ['github'], eventTypes: ['github.issue.*'] },
    delivery: { channels: ['realtime'] },
  });

  eventsClient.onEvent('github.issue.created', (event) => {
    console.log('New issue:', event.data.title);
  });
}
```

## Tool Discovery

When an LLM lists available tools from an MCPE-enabled server, it will see both the original MCP tools and the MCPE subscription tools:

```
Available tools:
1. search_issues - Search GitHub issues
2. create_issue - Create a new GitHub issue
3. events_subscribe - Subscribe to events
4. events_unsubscribe - Unsubscribe from events
5. events_list - List active subscriptions
6. events_pause - Pause a subscription
7. events_resume - Resume a subscription
8. events_update - Update a subscription
```

The MCPE tools have JSON Schema descriptions that help LLMs understand how to use them. An agent can reason about available event sources, filter criteria, and delivery options.

## Agent Workflow Example

Here is how an agent might combine MCP tools and MCPE subscriptions:

```
Agent: I'll help you monitor the project.

1. First, let me check current open issues.
   [calls search_issues with query="is:open"]

2. I found 15 open issues. Now let me subscribe to new issues
   so I can notify you.
   [calls events_subscribe with filter for github.issue.created]

3. I've subscribed to new issue notifications.
   Subscription ID: 550e8400-...

   ... later, when a new issue is created ...

4. A new issue was just created: "Login page crashes on Safari"
   Priority: high
   [calls create_issue to add a "needs-triage" label via MCP]
```

The agent seamlessly switches between **acting** (MCP tools) and **reacting** (MCPE events).

## Capability Negotiation

During the MCP `initialize` handshake, an MCPE server advertises its event capabilities. The client can check this to determine what features are available:

```typescript
// After connect, the server capabilities include event info
if (eventsClient.supportsEvents()) {
  // The server capability object contains:
  // - maxSubscriptions
  // - supportedSources
  // - deliveryChannels
  // - features (pause, wildcards, cron, scheduled)
}
```

Servers that do not support MCPE simply do not include event capabilities. The `supportsEvents()` check returns false, and the client can fall back gracefully.

## Mixed Environments

MCPE is fully backward compatible:

| Server | Client | Result |
|---|---|---|
| MCP + MCPE | MCP + MCPE | Full event support |
| MCP + MCPE | MCP only | MCP works normally, event tools appear but are unused |
| MCP only | MCP + MCPE | MCP works normally, `supportsEvents()` returns false |
| MCP only | MCP only | Standard MCP, no change |

## Migrating Polling to Subscriptions

If your agent currently polls for changes using MCP tools, you can migrate to event subscriptions:

### Before: Polling

```typescript
// Agent polls every 60 seconds
setInterval(async () => {
  const result = await client.callTool('list_recent_issues', {
    since: lastCheck,
    repo: 'owner/repo',
  });
  const issues = JSON.parse(result.content[0].text);
  if (issues.length > 0) {
    // Process new issues
  }
  lastCheck = new Date().toISOString();
}, 60000);
```

### After: Subscription

```typescript
// Agent subscribes once, receives events as they happen
await eventsClient.subscribe({
  filter: {
    sources: ['github'],
    eventTypes: ['github.issue.created'],
  },
  delivery: { channels: ['realtime'] },
});

eventsClient.onEvent('github.issue.created', (event) => {
  // Process immediately, no polling delay
  console.log('New issue:', event.data.title);
});
```

Benefits:
- No wasted compute on empty polls
- Instant notification (no 60-second delay)
- No need to track `lastCheck` state
- Server handles the matching and delivery
