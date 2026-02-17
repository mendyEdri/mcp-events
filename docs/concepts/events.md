# Events

Events are the core data unit in MCPE. They represent something that happened in an external system -- a GitHub push, a Slack message, an incoming email, or any custom occurrence. This page covers the event structure, metadata, filtering, and how events flow through the system.

## Event Structure

Every event in MCPE follows the `MCPEvent` schema:

```typescript
interface MCPEvent {
  id: string;        // UUID v4, unique event identifier
  type: string;      // Dot-notation event type, e.g. "github.push"
  data: Record<string, unknown>;  // Event payload (arbitrary JSON)
  metadata: EventMetadata;        // Structured metadata
}
```

### Example Event

```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "type": "github.push",
  "data": {
    "repository": "owner/my-repo",
    "branch": "main",
    "commits": 3,
    "pusher": "developer"
  },
  "metadata": {
    "sourceEventId": "gh-evt-12345",
    "timestamp": "2025-01-15T10:30:00Z",
    "priority": "normal",
    "tags": ["ci", "deployment"]
  }
}
```

## Event Metadata

The `EventMetadata` object provides structured context about each event:

```typescript
interface EventMetadata {
  sourceEventId?: string;      // Original event ID from the source
  timestamp: string;           // ISO 8601 datetime
  priority: EventPriority;     // Priority level
  tags?: string[];             // Arbitrary tags for filtering
}
```

### Priority

Events have four priority levels:

| Priority | Use Case |
|---|---|
| `low` | Informational events, logs, heartbeats |
| `normal` | Standard events (default) |
| `high` | Important events requiring attention |
| `critical` | Urgent events requiring immediate action |

### Tags

Tags are freeform strings attached to events for additional filtering. Common uses:

- Environment labels: `"production"`, `"staging"`
- Team identifiers: `"frontend"`, `"infra"`
- Workflow markers: `"ci"`, `"deployment"`, `"security"`

## Event Types

Event types use dot-notation to create a hierarchical namespace:

```
source.category
source.category.action
```

Examples:

- `github.push`
- `github.pull_request.opened`
- `github.issue.commented`
- `slack.message`
- `gmail.message.received`
- `custom.heartbeat`

### Wildcards

Filters support trailing wildcards with `.*`:

- `github.*` matches `github.push`, `github.pull_request`, `github.issue.commented`
- `slack.*` matches all Slack events
- An exact type like `github.push` matches only that specific type

## Event Filtering

The `EventFilter` type defines criteria for matching events:

```typescript
interface EventFilter {
  eventTypes?: string[];         // Match these event types (wildcards supported)
  tags?: string[];               // Match events with any of these tags
  priority?: EventPriority[];    // Match events with these priorities
}
```

All filter fields are optional. An empty filter matches all events. When multiple fields are specified, they are combined with AND logic: every specified field must match. Within a field (e.g., multiple event types), the match is OR: the event must match at least one value.

### Filter Examples

Match all GitHub events:

```typescript
{ eventTypes: ['github.*'] }
```

Match high-priority events:

```typescript
{ priority: ['high', 'critical'] }
```

Match GitHub push events tagged with "ci":

```typescript
{
  eventTypes: ['github.push'],
  tags: ['ci']
}
```

## Creating Events

The SDK provides a `createEvent` helper:

```typescript
import { createEvent } from '@mcpe/core';

const event = createEvent(
  'github.push',
  {
    repository: 'owner/repo',
    branch: 'main',
    commits: 3,
  },
  {
    priority: 'normal',
    tags: ['ci'],
  }
);
```

The helper automatically:

- Generates a UUID v4 `id`
- Sets the `timestamp` to the current time (or accepts a custom one)
- Validates the metadata structure

## Filter Matching

The `matchesFilter` function checks if an event matches a filter:

```typescript
import { matchesFilter } from '@mcpe/core';

const event = createEvent('github.push', { repo: 'test' }, {
  priority: 'normal',
  tags: ['ci'],
});

const filter = {
  eventTypes: ['github.*'],
  priority: ['normal', 'high'],
};

matchesFilter(event, filter); // true
```

### Matching Rules

1. **eventTypes**: Event's `type` must match at least one pattern (exact or wildcard)
2. **tags**: Event must have at least one tag in the list
3. **priority**: Event's `metadata.priority` must be in the list
4. **Omitted fields**: Always match (no constraint)

## Event Flow

```
External System        MCPE Server              MCPE Client
     |                      |                        |
     |--- raw webhook --->  |                        |
     |                      |                        |
     |                  createEvent()                |
     |                      |                        |
     |                  matchesFilter()              |
     |                  for each subscription        |
     |                      |                        |
     |                      |--- events/event -----> |
     |                      |    (if filter match)   |
     |                      |                        |
     |                      |                   onEvent handler
     |                      |                   processes event
```

1. An external system sends data to the MCPE server (webhook, polling, etc.)
2. The server wraps it as an `MCPEvent` using `createEvent()`
3. For each active subscription, the server runs `matchesFilter()`
4. Matching events are delivered via the appropriate channel (realtime, cron, scheduled)
5. The client's registered handlers process the event
