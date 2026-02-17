# Event Handlers

Event handlers define how events are processed when they arrive. MCPE supports three handler types: bash (execute shell commands), webhook (POST to an HTTP endpoint), and agent (delegate to an LLM). Handlers can be attached to subscriptions or used client-side.

## Handler Types Overview

| Type | Description | Use Case |
|---|---|---|
| `bash` | Execute a shell command | Scripts, CLI tools, local automation |
| `webhook` | HTTP POST to an endpoint | External services, cloud functions |
| `agent` | Delegate to an LLM agent | Intelligent processing, summarization |

## Bash Handler

Execute a shell command when an event arrives. The event data is passed to the command through one of three input modes.

```typescript
interface BashEventHandler {
  type: 'bash';
  command: string;           // Shell command to execute
  args?: string[];           // Command arguments
  cwd?: string;              // Working directory
  env?: Record<string, string>;  // Environment variables
  input: 'stdin' | 'env' | 'args';  // How event data is passed
  timeout: number;           // Max execution time in milliseconds
}
```

### Input Modes

**stdin** -- Event JSON is piped to the command's standard input:

```typescript
const sub = await client.subscribe({
  filter: { eventTypes: ['github.push'] },
  delivery: { channels: ['realtime'] },
  handler: {
    type: 'bash',
    command: 'python',
    args: ['process_event.py'],
    input: 'stdin',
    timeout: 30000,
  },
});
```

The event JSON is written to stdin:

```bash
# process_event.py reads from stdin
import json, sys
event = json.load(sys.stdin)
print(f"Push to {event['data']['repository']}")
```

**env** -- Event data is set as environment variables:

```typescript
{
  type: 'bash',
  command: 'bash',
  args: ['-c', 'echo "Push to $EVENT_REPOSITORY on $EVENT_BRANCH"'],
  input: 'env',
  timeout: 10000,
}
```

Environment variables are prefixed with `EVENT_` and uppercased:
- `EVENT_TYPE` -- the event type
- `EVENT_ID` -- the event ID
- `EVENT_PRIORITY` -- the event priority
- Nested data fields are flattened: `event.data.repository` becomes `EVENT_REPOSITORY`

**args** -- Event data is passed as command-line arguments:

```typescript
{
  type: 'bash',
  command: 'notify-send',
  args: ['GitHub Push'],
  input: 'args',
  timeout: 5000,
}
```

The full event JSON is appended as the last argument.

### Working Directory and Environment

```typescript
{
  type: 'bash',
  command: './deploy.sh',
  cwd: '/home/user/projects/my-app',
  env: {
    DEPLOY_ENV: 'production',
    NOTIFY_CHANNEL: '#deployments',
  },
  input: 'stdin',
  timeout: 60000,
}
```

### Timeout

The `timeout` field specifies the maximum execution time in milliseconds. If the command exceeds this limit, it is killed.

## Webhook Handler

POST event data to an HTTP endpoint when an event arrives.

```typescript
interface WebhookEventHandler {
  type: 'webhook';
  url: string;                       // Target URL
  headers?: Record<string, string>;  // Custom HTTP headers
  timeout: number;                   // Request timeout in milliseconds
}
```

### Basic Usage

```typescript
const sub = await client.subscribe({
  filter: { eventTypes: ['github.*'] },
  delivery: { channels: ['realtime'] },
  handler: {
    type: 'webhook',
    url: 'https://example.com/api/events',
    headers: {
      'Authorization': 'Bearer my-secret-token',
      'Content-Type': 'application/json',
    },
    timeout: 10000,
  },
});
```

### Request Format

The webhook sends an HTTP POST with the event as the JSON body:

```
POST /api/events HTTP/1.1
Host: example.com
Content-Type: application/json
Authorization: Bearer my-secret-token

{
  "id": "event-uuid",
  "type": "github.push",
  "data": { "repository": "owner/repo", "branch": "main" },
  "metadata": {
    "timestamp": "2025-01-15T10:30:00Z",
    "priority": "normal"
  }
}
```

### Use Cases

- Triggering cloud functions (AWS Lambda, Google Cloud Functions)
- Sending to Zapier or Make webhooks
- Posting to internal APIs
- Integrating with alerting systems (PagerDuty, Opsgenie)

## Agent Handler

Delegate event processing to an LLM agent. The agent receives the event data and can use tools to take actions.

```typescript
interface AgentEventHandler {
  type: 'agent';
  systemPrompt?: string;       // System prompt for the agent
  model?: string;              // LLM model to use
  instructions?: string;       // Processing instructions
  tools?: string[];            // MCP tools available to the agent
  maxTokens?: number;          // Max tokens for the response
}
```

### Basic Usage

```typescript
const sub = await client.subscribe({
  filter: {
    eventTypes: ['github.issue.*'],
  },
  delivery: { channels: ['realtime'] },
  handler: {
    type: 'agent',
    systemPrompt: 'You are a helpful assistant that triages GitHub issues.',
    instructions: 'Analyze the issue and add appropriate labels.',
    tools: ['github_add_label', 'github_add_comment'],
    model: 'claude-sonnet-4-20250514',
    maxTokens: 1024,
  },
});
```

### How It Works

1. An event arrives and matches the subscription filter
2. The agent handler creates a new LLM invocation with:
   - The system prompt
   - The event data as context
   - The processing instructions
   - Access to the specified MCP tools
3. The LLM processes the event and optionally calls tools
4. The result is logged or returned

### Example: Issue Triage

```typescript
{
  type: 'agent',
  systemPrompt: 'You are a GitHub issue triage bot.',
  instructions: `
    When a new issue is created:
    1. Read the issue title and body
    2. Determine the appropriate labels (bug, feature, question, etc.)
    3. Add the labels using the github_add_label tool
    4. If it's a bug, add a comment asking for reproduction steps
  `,
  tools: ['github_add_label', 'github_add_comment', 'github_assign_issue'],
  model: 'claude-sonnet-4-20250514',
  maxTokens: 2048,
}
```

### Example: Email Summarizer

```typescript
{
  type: 'agent',
  systemPrompt: 'You summarize emails concisely.',
  instructions: 'Summarize the email in 2-3 sentences and identify any action items.',
  model: 'claude-sonnet-4-20250514',
  maxTokens: 512,
}
```

## Client-Side Event Handling

In addition to server-side handlers (attached to subscriptions), you can register client-side handlers using the `onEvent` API:

```typescript
// Pattern-based handler
client.onEvent('github.*', (event) => {
  console.log('GitHub:', event.type, event.data);
});

// Batch handler for cron/scheduled deliveries
client.onBatch((events, subscriptionId) => {
  console.log(`Received ${events.length} events`);
});

// Expiration handler
client.onSubscriptionExpired((subscriptionId) => {
  console.log('Expired:', subscriptionId);
});
```

Client-side handlers run in the client process. Server-side handlers (bash, webhook, agent) run on the server when the event is matched.

## Combining Handlers

You can use both server-side and client-side handling together:

```typescript
// Server-side: webhook to Slack
const sub = await client.subscribe({
  filter: { eventTypes: ['github.*'], priority: ['critical'] },
  delivery: { channels: ['realtime'] },
  handler: {
    type: 'webhook',
    url: 'https://hooks.slack.com/services/...',
    timeout: 5000,
  },
});

// Client-side: also log locally
client.onEvent('github.*', (event) => {
  if (event.metadata.priority === 'critical') {
    console.error('CRITICAL:', event.type, event.data);
  }
});
```

## Clearing Handlers

Remove all client-side handlers:

```typescript
client.clearHandlers();
```

This removes all handlers registered via `onEvent`, `onBatch`, and `onSubscriptionExpired`. It does not affect server-side handlers attached to subscriptions.
