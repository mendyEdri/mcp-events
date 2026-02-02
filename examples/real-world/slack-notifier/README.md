# Slack Notifier

Send Slack messages for high-priority ESMCP events.

## Quick Start

```bash
# Install dependencies
pnpm install

# Run with environment variables
SLACK_BOT_TOKEN=xoxb-your-token SLACK_CHANNEL=#alerts pnpm start
```

## Setup

1. **Create a Slack App:**
   - Go to https://api.slack.com/apps
   - Click "Create New App" → "From scratch"
   - Name it "ESMCP Notifier" and select your workspace

2. **Add Bot Permissions:**
   - Go to "OAuth & Permissions"
   - Add `chat:write` scope under "Bot Token Scopes"
   - Add `chat:write.public` for public channels (optional)

3. **Install App:**
   - Click "Install to Workspace"
   - Authorize the app
   - Copy the "Bot User OAuth Token" (starts with `xoxb-`)

4. **Invite Bot to Channel:**
   - In Slack, type `/invite @ESMCP Notifier` in your channel
   - Or use the channel ID for private channels

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ESMCP_SERVER` | No | `ws://localhost:8080` | ESMCP server URL |
| `SLACK_BOT_TOKEN` | Yes | - | Bot OAuth token (xoxb-...) |
| `SLACK_CHANNEL` | No | `#general` | Channel to post to |
| `SUBSCRIBER_NAME` | No | `slack-notifier` | Client identifier |

## Features

- ✅ Rich Slack messages with blocks
- ✅ Priority-based filtering (only high/critical sent to Slack)
- ✅ Source emoji icons (🐙 GitHub, 📧 Gmail, 💬 Slack)
- ✅ Priority indicators (⚪ low, 🔵 normal, 🟠 high, 🔴 critical)
- ✅ Health check endpoint (`/health`)
- ✅ Automatic reconnection
- ✅ Event statistics tracking

## Message Format

Slack messages include:
- Header with emoji and event type
- Source, priority, timestamp, event ID
- Formatted JSON data
- Tags (if present)

## Testing

```bash
# Without Slack token (logs only)
pnpm start

# With Slack token
SLACK_BOT_TOKEN=xoxb-xxx SLACK_CHANNEL=#test pnpm start

# Check health
curl http://localhost:3001/health
```

## Docker

```bash
# Build
docker build -t esmcp-slack-notifier .

# Run
docker run -e SLACK_BOT_TOKEN=xoxb-xxx \
           -e SLACK_CHANNEL=#alerts \
           -e ESMCP_SERVER=ws://host:8080 \
           esmcp-slack-notifier
```

## Architecture

```
ESMCP Hub ──▶ Slack Notifier ──▶ Slack API
                (this service)     (#alerts channel)
```

Only high/critical priority events are sent to Slack. All events are logged to console for monitoring.
