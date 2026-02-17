# Examples

This page provides complete, real-world examples of MCPE usage patterns.

## GitHub Event Monitor

A server that publishes GitHub webhook events and a client that monitors them.

### Server

```typescript
import { EventsServer } from '@mcpe/core';
import { createEvent } from '@mcpe/core';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import express from 'express';

const server = new EventsServer({
  name: 'github-monitor',
  version: '1.0.0',
  events: {
    maxSubscriptions: 100,
  },
});

// Connect MCPE over stdio
const transport = new StdioServerTransport();
await server.connect(transport);

// HTTP endpoint for GitHub webhooks
const app = express();
app.post('/webhook/github', express.json(), (req, res) => {
  const eventType = req.headers['x-github-event'];
  const action = req.body.action;
  const type = action
    ? `github.${eventType}.${action}`
    : `github.${eventType}`;

  server.publish(type, req.body, {
    priority: determinePriority(eventType, req.body),
    sourceEventId: req.headers['x-github-delivery'],
    tags: [req.body.repository?.full_name].filter(Boolean),
  });

  res.status(200).send('OK');
});

function determinePriority(eventType, body) {
  if (eventType === 'security_advisory') return 'critical';
  if (eventType === 'pull_request' && body.action === 'opened') return 'high';
  if (eventType === 'issues' && body.action === 'opened') return 'normal';
  return 'low';
}

app.listen(3000);
```

### Client

```typescript
import { EventsClient } from '@mcpe/core';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new EventsClient({
  name: 'github-watcher',
  version: '1.0.0',
});

const transport = new StdioClientTransport({
  command: 'node',
  args: ['server.js'],
});
await client.connect(transport);

// Subscribe to high-priority GitHub events in realtime
await client.subscribe({
  filter: {
    eventTypes: ['github.*'],
    priority: ['high', 'critical'],
  },
  delivery: { channels: ['realtime'] },
});

// Subscribe to all events as a daily digest
await client.subscribeWithLocalCron(
  { eventTypes: ['github.*'] },
  { expression: '0 9 * * *', timezone: 'America/New_York' },
  async (events) => {
    console.log(`\n=== Daily GitHub Digest (${events.length} events) ===`);
    const byType = {};
    events.forEach(e => {
      byType[e.type] = (byType[e.type] || 0) + 1;
    });
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
  }
);

// Handle high-priority events immediately
client.onEvent('github.*', (event) => {
  if (event.metadata.priority === 'critical') {
    console.error('CRITICAL:', event.type, event.data.title || event.data.action);
  } else if (event.metadata.priority === 'high') {
    console.warn('HIGH:', event.type, event.data.title || event.data.action);
  }
});

console.log('Monitoring GitHub events...');
```

## Multi-Source Event Aggregator

Aggregate events from multiple sources with different delivery modes.

```typescript
import { EventsClient } from '@mcpe/core';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new EventsClient({
  name: 'aggregator',
  version: '1.0.0',
});

const transport = new StdioClientTransport({
  command: 'node',
  args: ['server.js'],
});
await client.connect(transport);

// Critical alerts: realtime from all sources
await client.subscribe({
  filter: { priority: ['critical'] },
  delivery: { channels: ['realtime'] },
});

client.onEvent('*', (event) => {
  if (event.metadata.priority === 'critical') {
    console.error(`[ALERT] ${event.type}`);
    console.error(`  Data: ${JSON.stringify(event.data)}`);
  }
});

// GitHub: hourly summary
await client.subscribeWithLocalCron(
  { eventTypes: ['github.*'] },
  { expression: '@hourly' },
  async (events) => {
    if (events.length === 0) return;
    console.log(`\n--- Hourly GitHub Summary (${events.length} events) ---`);
    events.forEach(e => console.log(`  ${e.type}`));
  }
);

// Slack: every 30 minutes
await client.subscribeWithLocalTimer(
  { eventTypes: ['slack.*'] },
  { intervalMs: 30 * 60 * 1000 },
  async (events) => {
    if (events.length === 0) return;
    console.log(`\n--- Slack (last 30 min): ${events.length} messages ---`);
  }
);

// Gmail: daily digest at 8 AM
await client.subscribeWithLocalCron(
  { eventTypes: ['gmail.*'] },
  { expression: '0 8 * * *', timezone: 'America/New_York' },
  async (events) => {
    if (events.length === 0) return;
    console.log(`\n=== Daily Email Digest (${events.length} emails) ===`);
    events.forEach(e => {
      console.log(`  From: ${e.data.from} - Subject: ${e.data.subject}`);
    });
  }
);

console.log('Aggregator running...');
```

## Webhook Bridge

Forward MCPE events to external HTTP endpoints.

```typescript
import { EventsClient } from '@mcpe/core';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new EventsClient({
  name: 'webhook-bridge',
  version: '1.0.0',
});

const transport = new StdioClientTransport({
  command: 'node',
  args: ['server.js'],
});
await client.connect(transport);

// Forward critical events to PagerDuty
await client.subscribe({
  filter: { priority: ['critical'] },
  delivery: { channels: ['realtime'] },
  handler: {
    type: 'webhook',
    url: 'https://events.pagerduty.com/v2/enqueue',
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: 10000,
  },
});

// Forward all GitHub events to a Slack webhook
await client.subscribe({
  filter: { eventTypes: ['github.*'] },
  delivery: { channels: ['realtime'] },
  handler: {
    type: 'webhook',
    url: 'https://hooks.slack.com/services/T00/B00/xxx',
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: 5000,
  },
});

// Forward events to a custom API with authentication
await client.subscribe({
  filter: { eventTypes: ['custom.*'], tags: ['analytics'] },
  delivery: { channels: ['realtime'] },
  handler: {
    type: 'webhook',
    url: 'https://api.example.com/events/ingest',
    headers: {
      'Authorization': 'Bearer my-api-key',
      'X-Source': 'mcpe',
    },
    timeout: 15000,
  },
});

console.log('Webhook bridge active');
```

## CI/CD Pipeline Monitor

Monitor CI/CD events and react to failures.

```typescript
import { EventsClient } from '@mcpe/core';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new EventsClient({
  name: 'ci-monitor',
  version: '1.0.0',
});

const transport = new StdioClientTransport({
  command: 'node',
  args: ['server.js'],
});
await client.connect(transport);

// Watch for deployment events
await client.subscribe({
  filter: {
    eventTypes: ['github.deployment', 'github.deployment_status'],
    tags: ['production'],
  },
  delivery: { channels: ['realtime'] },
});

// Watch for CI failures
await client.subscribe({
  filter: {
    eventTypes: ['github.check_run.*', 'github.check_suite.*'],
    priority: ['high', 'critical'],
  },
  delivery: { channels: ['realtime'] },
});

client.onEvent('github.deployment_status', (event) => {
  const status = event.data.deployment_status?.state;
  const env = event.data.deployment?.environment;

  if (status === 'failure') {
    console.error(`DEPLOYMENT FAILED on ${env}`);
    console.error(`  Repo: ${event.data.repository?.full_name}`);
    console.error(`  Ref: ${event.data.deployment?.ref}`);
  } else if (status === 'success') {
    console.log(`Deployment succeeded on ${env}`);
  }
});

client.onEvent('github.check_run.*', (event) => {
  if (event.data.check_run?.conclusion === 'failure') {
    console.error(`CI check failed: ${event.data.check_run.name}`);
    console.error(`  Repo: ${event.data.repository?.full_name}`);
  }
});

console.log('CI/CD monitor active');
```

## Agent-Powered Issue Triage

Use an LLM agent handler to automatically triage incoming issues.

```typescript
import { EventsClient } from '@mcpe/core';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new EventsClient({
  name: 'issue-triage-bot',
  version: '1.0.0',
});

const transport = new StdioClientTransport({
  command: 'node',
  args: ['server.js'],
});
await client.connect(transport);

// Subscribe with an agent handler for automatic triage
await client.subscribe({
  filter: {
    eventTypes: ['github.issues.opened'],
  },
  delivery: { channels: ['realtime'] },
  handler: {
    type: 'agent',
    systemPrompt: `You are a GitHub issue triage bot for a software project.
Your job is to analyze new issues and take appropriate actions.`,
    instructions: `When a new issue is created:
1. Read the issue title and body
2. Categorize it: bug, feature request, question, or documentation
3. Assign priority: low, medium, high, critical
4. Add appropriate labels using the github_add_label tool
5. If it's a bug without reproduction steps, add a comment asking for them
6. If it's critical, assign it to the on-call engineer`,
    tools: [
      'github_add_label',
      'github_add_comment',
      'github_assign_issue',
    ],
    model: 'claude-sonnet-4-20250514',
    maxTokens: 2048,
  },
});

console.log('Issue triage bot active');
```

## Bash Script Automation

Execute shell scripts in response to events.

```typescript
import { EventsClient } from '@mcpe/core';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new EventsClient({
  name: 'automation',
  version: '1.0.0',
});

const transport = new StdioClientTransport({
  command: 'node',
  args: ['server.js'],
});
await client.connect(transport);

// Run tests when code is pushed
await client.subscribe({
  filter: {
    eventTypes: ['github.push'],
    tags: ['main-branch'],
  },
  delivery: { channels: ['realtime'] },
  handler: {
    type: 'bash',
    command: 'bash',
    args: ['-c', 'cd /home/user/project && git pull && npm test'],
    input: 'stdin',
    timeout: 300000, // 5 minutes
  },
});

// Send desktop notification for high-priority events
await client.subscribe({
  filter: { priority: ['high', 'critical'] },
  delivery: { channels: ['realtime'] },
  handler: {
    type: 'bash',
    command: 'notify-send',
    args: ['MCPE Alert'],
    input: 'args',
    timeout: 5000,
  },
});

// Log events to a file
await client.subscribe({
  filter: {},  // all events
  delivery: { channels: ['realtime'] },
  handler: {
    type: 'bash',
    command: 'bash',
    args: ['-c', 'cat >> /var/log/mcpe-events.jsonl'],
    input: 'stdin',
    timeout: 5000,
  },
});

console.log('Automation handlers active');
```

## Scheduled Reminders

Set up time-based reminders and delayed processing.

```typescript
import { EventsClient } from '@mcpe/core';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new EventsClient({
  name: 'reminder-system',
  version: '1.0.0',
});

const transport = new StdioClientTransport({
  command: 'node',
  args: ['server.js'],
});
await client.connect(transport);

// Remind about open PRs every day at 10 AM
await client.subscribeWithLocalCron(
  {
    eventTypes: ['github.pull_request.opened'],
  },
  { expression: '0 10 * * *', timezone: 'America/New_York' },
  async (events) => {
    if (events.length === 0) return;
    console.log('\n--- Open PR Reminder ---');
    console.log(`${events.length} PRs opened since last check:`);
    events.forEach(e => {
      console.log(`  #${e.data.number}: ${e.data.title}`);
    });
  }
);

// One-time delayed task: check on a deployment in 30 minutes
await client.scheduleDelayedTask(
  {
    type: 'deployment-check',
    data: {
      environment: 'production',
      deployId: 'deploy-123',
    },
  },
  30 * 60 * 1000,
  async (task) => {
    console.log(`\nChecking deployment ${task.data.deployId}...`);
    // Query deployment status via MCP tools
  }
);

// Scheduled delivery: collect all events and deliver at end of day
await client.subscribe({
  filter: { eventTypes: ['github.*', 'slack.*', 'gmail.*'] },
  delivery: {
    channels: ['scheduled'],
    scheduledDelivery: {
      deliverAt: getEndOfDay(),
      timezone: 'America/New_York',
      description: 'end of day summary',
      aggregateEvents: true,
      autoExpire: true,
    },
  },
});

client.onBatch((events, subscriptionId) => {
  console.log(`\n=== End of Day Summary (${events.length} events) ===`);
  const byType = {};
  events.forEach(e => {
    const prefix = e.type.split('.')[0];
    byType[prefix] = (byType[prefix] || 0) + 1;
  });
  Object.entries(byType).forEach(([type, count]) => {
    console.log(`  ${type}: ${count} events`);
  });
});

function getEndOfDay() {
  const now = new Date();
  now.setHours(17, 0, 0, 0);
  if (now < new Date()) {
    now.setDate(now.getDate() + 1);
  }
  return now.toISOString();
}

console.log('Reminder system active');
```

## Subscription Lifecycle Management

Demonstrating pause, resume, update, and expiration.

```typescript
import { EventsClient } from '@mcpe/core';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new EventsClient({
  name: 'lifecycle-demo',
  version: '1.0.0',
});

const transport = new StdioClientTransport({
  command: 'node',
  args: ['server.js'],
});
await client.connect(transport);

// Create a subscription
const sub = await client.subscribe({
  filter: {
    eventTypes: ['github.*'],
  },
  delivery: { channels: ['realtime'] },
});
console.log('Created subscription:', sub.id, 'Status:', sub.status);

// List all active subscriptions
const active = await client.listSubscriptions('active');
console.log('Active subscriptions:', active.length);

// Pause during maintenance
console.log('Pausing subscription...');
await client.pause(sub.id);

const paused = await client.listSubscriptions('paused');
console.log('Paused subscriptions:', paused.length);

// Resume after maintenance
console.log('Resuming subscription...');
await client.resume(sub.id);

// Update: narrow the filter and add expiration
console.log('Updating subscription...');
const updated = await client.update(sub.id, {
  filter: {
    eventTypes: ['github.push'],
    priority: ['high', 'critical'],
  },
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
});
console.log('Updated. New expiration:', updated.expiresAt);

// Handle expiration
client.onSubscriptionExpired((expiredId) => {
  console.log('Subscription expired:', expiredId);
  if (expiredId === sub.id) {
    console.log('Recreating subscription...');
    // Optionally recreate
  }
});

// Eventually unsubscribe
// await client.unsubscribe(sub.id);
```
