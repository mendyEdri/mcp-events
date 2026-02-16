# Client-Side Scheduling

The MCPE client includes a local scheduler for running cron jobs, timers, and delayed tasks directly in the client process. This is useful when you want time-based behavior without relying on server-side cron delivery.

## Local Cron Subscriptions

Create a subscription that triggers a local handler on a cron schedule:

```typescript
const subId = await client.subscribeWithLocalCron(
  // Event filter
  {
    sources: ['github'],
    eventTypes: ['github.*'],
  },
  // Cron configuration
  {
    expression: '0 9 * * *',    // Daily at 9 AM
    timezone: 'America/New_York',
  },
  // Handler function
  async (events) => {
    console.log(`Daily digest: ${events.length} GitHub events`);
    for (const event of events) {
      console.log(`  - ${event.type}: ${JSON.stringify(event.data)}`);
    }
  }
);
```

### How It Works

1. A realtime subscription is created on the server for the specified filter
2. Events are collected locally in the client as they arrive
3. On each cron tick, the handler is called with the accumulated events
4. The buffer is cleared after each handler invocation

### Cron Configuration

```typescript
interface CronConfig {
  expression: string;    // Cron expression or preset
  timezone?: string;     // IANA timezone (default: 'UTC')
}
```

**Common expressions:**

| Expression | Description |
|---|---|
| `0 * * * *` | Every hour |
| `0 9 * * *` | Daily at 9 AM |
| `0 9 * * 1` | Every Monday at 9 AM |
| `@hourly` | Every hour (preset) |
| `@daily` | Every day at midnight (preset) |
| `@weekly` | Every Sunday at midnight (preset) |

## Local Timer Subscriptions

Create a subscription that triggers a handler at a fixed interval:

```typescript
const subId = await client.subscribeWithLocalTimer(
  // Event filter
  {
    sources: ['slack'],
  },
  // Timer configuration
  {
    intervalMs: 60000,    // Every 60 seconds
  },
  // Handler function
  async (events) => {
    if (events.length > 0) {
      console.log(`${events.length} Slack messages in the last minute`);
    }
  }
);
```

### Timer Configuration

```typescript
interface TimerConfig {
  intervalMs: number;    // Interval in milliseconds
}
```

## Delayed Tasks

Schedule a one-time task to run after a delay:

```typescript
const taskId = await client.scheduleDelayedTask(
  // Task description
  {
    type: 'reminder',
    data: { message: 'Check deployment status' },
  },
  // Delay in milliseconds
  4 * 60 * 60 * 1000,   // 4 hours
  // Handler function
  async (task) => {
    console.log('Reminder:', task.data.message);
  }
);
```

The handler fires once after the specified delay, then the task is automatically cleaned up.

## Managing Schedulers

### Stop a Specific Scheduler

```typescript
// Stop by subscription/task ID
client.stopLocalScheduler(subId);
```

### Stop All Schedulers

```typescript
client.stopAllLocalSchedulers();
```

### Get Scheduler Info

```typescript
const info = client.getSchedulerInfo();
console.log(info);
// {
//   activeSchedulers: 3,
//   schedulers: [
//     { id: 'sub-1', type: 'cron', expression: '0 9 * * *' },
//     { id: 'sub-2', type: 'timer', intervalMs: 60000 },
//     { id: 'task-1', type: 'delayed', remainingMs: 7200000 },
//   ]
// }
```

## Local vs Server Scheduling

MCPE offers both client-side and server-side scheduling. Here is when to use each:

| Scenario | Recommendation |
|---|---|
| Client process runs continuously | Local scheduling |
| Client process is short-lived | Server-side cron |
| Need guaranteed delivery even if client disconnects | Server-side cron |
| Want to process events locally before delivery | Local scheduling |
| Need complex local logic (file I/O, DB queries) | Local scheduling |
| Simple aggregation and batch delivery | Server-side cron |

### Server-Side Cron (for comparison)

```typescript
// Server handles the scheduling
const sub = await client.subscribe({
  filter: { sources: ['github'] },
  delivery: {
    channels: ['cron'],
    cronSchedule: {
      expression: '@daily',
      timezone: 'America/New_York',
      aggregateEvents: true,
    },
  },
});

// Client just handles the batch when it arrives
client.onBatch((events, subscriptionId) => {
  console.log('Daily batch arrived:', events.length, 'events');
});
```

### Client-Side Cron

```typescript
// Client handles the scheduling locally
await client.subscribeWithLocalCron(
  { sources: ['github'] },
  { expression: '@daily', timezone: 'America/New_York' },
  async (events) => {
    // Full control over processing
    const summary = events.map(e => `${e.type}: ${e.data.repository}`).join('\n');
    await fs.writeFile('daily-report.txt', summary);
    console.log('Daily report written');
  }
);
```

## Complete Example

```typescript
import { EventsClient } from '@mcpe/client';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function main() {
  const client = new EventsClient({
    name: 'scheduler-demo',
    version: '1.0.0',
  });

  const transport = new StdioClientTransport({
    command: 'node',
    args: ['server.js'],
  });
  await client.connect(transport);

  // Daily GitHub digest
  await client.subscribeWithLocalCron(
    { sources: ['github'] },
    { expression: '0 9 * * *', timezone: 'America/New_York' },
    async (events) => {
      console.log(`\n=== Daily GitHub Digest (${events.length} events) ===`);
      events.forEach(e => console.log(`  ${e.type}: ${JSON.stringify(e.data)}`));
    }
  );

  // Slack summary every 30 minutes
  await client.subscribeWithLocalTimer(
    { sources: ['slack'] },
    { intervalMs: 30 * 60 * 1000 },
    async (events) => {
      if (events.length > 0) {
        console.log(`\n--- ${events.length} Slack messages in last 30 min ---`);
      }
    }
  );

  // Reminder in 2 hours
  await client.scheduleDelayedTask(
    { type: 'reminder', data: { message: 'Review open PRs' } },
    2 * 60 * 60 * 1000,
    async (task) => {
      console.log('\nReminder:', task.data.message);
    }
  );

  console.log('Scheduler info:', client.getSchedulerInfo());
  console.log('Running... (Ctrl+C to exit)');

  process.on('SIGINT', async () => {
    client.stopAllLocalSchedulers();
    await client.close();
    process.exit(0);
  });
}

main().catch(console.error);
```
