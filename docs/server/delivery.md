# Delivery Modes

MCPE supports three delivery modes that control when and how events are sent to clients. This page covers realtime delivery, cron-based schedules, and one-time scheduled delivery.

## Overview

| Mode | Channel | Notification | Use Case |
|---|---|---|---|
| Realtime | `realtime` | `events/event` | Immediate notification on every event |
| Cron | `cron` | `events/batch` | Recurring aggregated delivery on a schedule |
| Scheduled | `scheduled` | `events/batch` | One-time delivery at a specific time |

## Realtime Delivery

Realtime is the default and simplest delivery mode. Each matching event is sent immediately as an `events/event` notification.

```typescript
const sub = await client.subscribe({
  filter: { eventTypes: ['github.*'] },
  delivery: {
    channels: ['realtime'],
  },
});
```

**How it works:**

1. Server publishes an event
2. Subscription manager checks filters
3. If the event matches, an `events/event` notification is sent immediately
4. The client's `onEvent` handler fires

**Notification format:**

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/message",
  "params": {
    "method": "events/event",
    "params": {
      "subscriptionId": "550e8400-...",
      "event": {
        "id": "event-uuid",
        "type": "github.push",
        "data": { "repository": "owner/repo" },
        "metadata": {
          "timestamp": "2025-01-15T10:30:00Z",
          "priority": "normal"
        }
      }
    }
  }
}
```

**Best for:** Real-time monitoring, alerting, CI/CD notifications, chat messages.

## Cron Delivery

Cron delivery aggregates events over a time interval and delivers them as a batch on a recurring schedule.

```typescript
const sub = await client.subscribe({
  filter: { eventTypes: ['github.*'] },
  delivery: {
    channels: ['cron'],
    cronSchedule: {
      expression: '0 9 * * *',          // Daily at 9:00 AM
      timezone: 'America/New_York',
      aggregateEvents: true,
      maxEventsPerDelivery: 100,
    },
  },
});
```

### Cron Expressions

Standard five-field cron syntax:

```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12)
│ │ │ │ ┌───────────── day of week (0-7, 0 and 7 are Sunday)
│ │ │ │ │
* * * * *
```

**Common patterns:**

| Expression | Description |
|---|---|
| `0 * * * *` | Every hour at minute 0 |
| `0 9 * * *` | Daily at 9:00 AM |
| `0 9 * * 1` | Every Monday at 9:00 AM |
| `0 0 1 * *` | First day of each month at midnight |
| `*/15 * * * *` | Every 15 minutes |
| `0 9,17 * * *` | At 9:00 AM and 5:00 PM daily |

**Presets:**

| Preset | Equivalent | Description |
|---|---|---|
| `@hourly` | `0 * * * *` | Every hour |
| `@daily` | `0 0 * * *` | Every day at midnight |
| `@weekly` | `0 0 * * 0` | Every Sunday at midnight |
| `@monthly` | `0 0 1 * *` | First of each month |

### CronSchedule Configuration

```typescript
interface CronSchedule {
  expression: string;         // Cron expression or preset
  timezone: string;           // IANA timezone (default: 'UTC')
  aggregateEvents: boolean;   // Batch events together (default: true)
  maxEventsPerDelivery: number; // Max events per batch (default: 100)
}
```

### How Cron Delivery Works

1. Events matching the subscription filter are buffered in memory
2. On each cron tick, all buffered events are collected
3. Events are sent as a single `events/batch` notification
4. The buffer is cleared for the next interval
5. If `maxEventsPerDelivery` is exceeded, only the most recent events are included

**Notification format:**

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/message",
  "params": {
    "method": "events/batch",
    "params": {
      "subscriptionId": "550e8400-...",
      "events": [
        { "id": "...", "type": "github.push", "data": {...}, "metadata": {...} },
        { "id": "...", "type": "github.issue", "data": {...}, "metadata": {...} }
      ]
    }
  }
}
```

**Best for:** Daily digests, weekly reports, hourly summaries, periodic monitoring.

### Examples

**Daily GitHub digest at 9 AM Eastern:**

```typescript
await client.subscribe({
  filter: { eventTypes: ['github.*'] },
  delivery: {
    channels: ['cron'],
    cronSchedule: {
      expression: '0 9 * * *',
      timezone: 'America/New_York',
      aggregateEvents: true,
    },
  },
});
```

**Hourly email summary:**

```typescript
await client.subscribe({
  filter: { eventTypes: ['gmail.*'] },
  delivery: {
    channels: ['cron'],
    cronSchedule: {
      expression: '@hourly',
      aggregateEvents: true,
      maxEventsPerDelivery: 50,
    },
  },
});
```

**Weekly report on Monday mornings (London time):**

```typescript
await client.subscribe({
  filter: { eventTypes: ['github.*'] },
  delivery: {
    channels: ['cron'],
    cronSchedule: {
      expression: '0 9 * * 1',
      timezone: 'Europe/London',
      aggregateEvents: true,
    },
  },
});
```

## Scheduled Delivery

Scheduled delivery sends events at a specific one-time date and time. After delivery, the subscription can optionally auto-expire.

```typescript
const sub = await client.subscribe({
  filter: { eventTypes: ['slack.*'] },
  delivery: {
    channels: ['scheduled'],
    scheduledDelivery: {
      deliverAt: '2025-01-15T14:30:00Z',
      timezone: 'UTC',
      description: 'in 4 hours',
      aggregateEvents: true,
      autoExpire: true,
    },
  },
});
```

### ScheduledDelivery Configuration

```typescript
interface ScheduledDelivery {
  deliverAt: string;           // ISO 8601 datetime
  timezone: string;            // IANA timezone (default: 'UTC')
  description?: string;        // Human-readable description
  aggregateEvents: boolean;    // Batch events (default: true)
  autoExpire: boolean;         // Expire after delivery (default: true)
}
```

### How Scheduled Delivery Works

1. Events matching the filter are buffered until `deliverAt`
2. At the scheduled time, all buffered events are delivered as a batch
3. If `autoExpire` is true, the subscription status changes to `expired`
4. An `events/subscription_expired` notification is sent

**Best for:** Reminders, delayed processing, "tell me later" workflows, end-of-day summaries.

### Examples

**Remind me about Slack messages in 4 hours:**

```typescript
const fourHoursLater = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

await client.subscribe({
  filter: { eventTypes: ['slack.*'] },
  delivery: {
    channels: ['scheduled'],
    scheduledDelivery: {
      deliverAt: fourHoursLater,
      description: 'in 4 hours',
      aggregateEvents: true,
      autoExpire: true,
    },
  },
});
```

**Deliver critical events next Monday at 10 AM:**

```typescript
await client.subscribe({
  filter: { priority: ['critical'] },
  delivery: {
    channels: ['scheduled'],
    scheduledDelivery: {
      deliverAt: '2025-01-20T10:00:00Z',
      timezone: 'America/Los_Angeles',
      description: 'next Monday at 10am',
      aggregateEvents: true,
      autoExpire: true,
    },
  },
});
```

## Server-Side Configuration

Enable or disable delivery modes in the server configuration:

```typescript
const server = new EventsServer({
  name: 'my-server',
  version: '1.0.0',
  events: {
    deliveryChannels: ['realtime', 'cron', 'scheduled'],
    features: {
      cronSchedule: true,
      scheduledDelivery: true,
    },
  },
});
```

## Scheduler Info

Both server and client can inspect the scheduler state:

```typescript
// Server side
const info = server.getSchedulerInfo();
console.log(info);

// Client side
const info = client.getSchedulerInfo();
console.log(info);
```
