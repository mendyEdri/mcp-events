# Real-World ESMCP Subscriber Examples

Production-ready subscriber implementations for common use cases.

## Quick Start

```bash
# Install dependencies for all examples
pnpm install

# Run a specific example
cd github-webhook-receiver && pnpm start
cd slack-notifier && pnpm start
cd email-digest && pnpm start
```

## Examples

### 1. GitHub Webhook Receiver
**Path:** `github-webhook-receiver/`

Receives GitHub events (pushes, PRs, issues) and forwards them to your ESMCP hub.

**Use Case:** Integrate GitHub activity into your event stream for team notifications.

**Features:**
- Webhook endpoint for GitHub
- Event validation with GitHub signatures
- Filters for specific repositories
- Rate limiting

---

### 2. Slack Notifier
**Path:** `slack-notifier/`

Sends Slack messages when specific events occur.

**Use Case:** Team notifications for critical events.

**Features:**
- Subscribe to high-priority events
- Rich message formatting with blocks
- Thread replies for related events
- Channel routing based on event type

---

### 3. Email Digest
**Path:** `email-digest/`

Collects events and sends batched email digests.

**Use Case:** Daily/weekly summaries for stakeholders.

**Features:**
- Batch events over time windows
- HTML email templates
- Configurable schedules (hourly, daily, weekly)
- Unsubscribe handling

---

### 4. Database Logger
**Path:** `database-logger/`

Persists all events to a database for audit trails.

**Use Case:** Compliance, analytics, debugging.

**Features:**
- SQLite/PostgreSQL support
- Automatic table creation
- Event querying API
- Data retention policies

---

### 5. SMS Alert System
**Path:** `sms-alerts/`

Sends SMS for critical events only.

**Use Case:** On-call alerts, security incidents.

**Features:**
- Priority-based filtering (critical only)
- Twilio integration
- Rate limiting to prevent spam
- Quiet hours

---

### 6. Webhook Forwarder
**Path:** `webhook-forwarder/`

Forwards events to external HTTP endpoints.

**Use Case:** Integrate with third-party services (Zapier, IFTTT, custom APIs).

**Features:**
- Configurable endpoint mapping
- Retry logic with exponential backoff
- Payload transformation
- Authentication headers

---

### 7. Analytics Collector
**Path:** `analytics-collector/`

Tracks event metrics and generates reports.

**Use Case:** Monitor system health, event volume analysis.

**Features:**
- Real-time counters
- Time-series aggregation
- Dashboard endpoint
- Export to CSV/JSON

---

### 8. Smart Home Integration
**Path:** `smart-home/`

Triggers smart home devices based on events.

**Use Case:** Flash lights for alerts, adjust thermostat for "working" events.

**Features:**
- Home Assistant integration
- Philips Hue lights
- Conditional triggers
- Scene activation

## Common Patterns

### Environment Variables
All examples use these common env vars:

```bash
# ESMCP Connection
ESMCP_SERVER=ws://localhost:8080
ESMCP_CLIENT_NAME=my-subscriber
ESMCP_API_KEY=optional-api-key

# Example-specific
WEBHOOK_SECRET=your-secret
SLACK_BOT_TOKEN=xoxb-...
EMAIL_SMTP_HOST=smtp.gmail.com
DATABASE_URL=postgresql://...
```

### Docker Support
Each example includes a Dockerfile:

```bash
docker build -t esmcp-github-receiver .
docker run -e ESMCP_SERVER=ws://host:8080 esmcp-github-receiver
```

### Health Checks
All subscribers expose health endpoints:

```bash
curl http://localhost:3000/health
# {"status":"ok","subscriptions":3,"eventsReceived":42}
```

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│   GitHub        │────▶│  ESMCP Hub   │────▶│  Slack Notifier │
│   (webhooks)    │     │              │     │  (team alerts)  │
└─────────────────┘     │              │     └─────────────────┘
                        │              │
┌─────────────────┐     │   Event      │     ┌─────────────────┐
│   Custom App    │────▶│   Router     │────▶│  Email Digest   │
│   (events)      │     │              │     │  (summaries)    │
└─────────────────┘     │              │     └─────────────────┘
                        │              │
                        │              │     ┌─────────────────┐
                        │              │────▶│  Database       │
                        │              │     │  (audit log)    │
                        └──────────────┘     └─────────────────┘
```

## Contributing

Add your own example:
1. Create a new directory under `examples/real-world/`
2. Include README.md with use case and setup instructions
3. Add package.json with dependencies
4. Include Dockerfile for deployment
5. Update this README with your example

## License

MIT - See root LICENSE file
