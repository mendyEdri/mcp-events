# ESMCP Web Push Browser Demo

A complete demonstration of an MCP client that subscribes to events and receives them via:
1. **WebSocket** (real-time while connected)
2. **Web Push Notifications** (even when tab is closed!)

## 🎯 What This Demo Shows

This demo illustrates how the **Event Subscription MCP (ESMCP)** protocol enables AI agents (or any client) to subscribe to real-time events from external systems and receive them through multiple delivery channels.

### Key Features

- ✅ **MCP WebSocket Client** - Connects to MCP server via JSON-RPC 2.0
- ✅ **Event Subscriptions** - Subscribe to events from GitHub, Slack, Gmail, etc.
- ✅ **Browser Push Notifications** - Receive events even when browser tab is closed
- ✅ **Dual Delivery** - Events arrive via WebSocket AND push notifications
- ✅ **Pretty UI** - Modern, responsive interface showing connection status and event log
- ✅ **CLI Publisher** - Send test events from command line

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd examples/webpush-browser-demo
pnpm install
```

### 2. Generate VAPID Keys (One-time)

```bash
npx tsx generate-vapid-keys.ts
```

This creates `vapid-keys.json` which is required for Web Push. **Keep the private key secret!**

### 3. Start the Server

```bash
npx tsx server.ts
```

This starts:
- WebSocket server on `ws://localhost:8080` (for MCP clients)
- HTTP server on `http://localhost:3000` (for web UI and API)

### 4. Open the Browser Demo

Navigate to http://localhost:3000 in your browser.

### 5. Enable Push Notifications

1. Click **"Connect MCP Client"** - Establishes WebSocket connection
2. Click **"Enable Push Notifications"** - Registers service worker and subscribes to push
3. Grant notification permission when prompted

### 6. Send Test Events

**Option A: Click buttons in the UI**
- "Send Test Event"
- "Simulate GitHub Push"
- "Simulate Slack Message"

**Option B: Use the CLI**

```bash
# Basic test event
npx tsx publish-event.ts browser.test

# GitHub push event
npx tsx publish-event.ts github.push '{"repo":"my-project","commits":3}'

# Slack message with high priority
npx tsx publish-event.ts slack.message \
  --priority high \
  '{"channel":"#alerts","message":"Production deployment started"}'

# Critical alert
npx tsx publish-event.ts system.down \
  --priority critical \
  --tag urgent \
  '{"service":"payment-api","status":"down"}'
```

**Option C: Use curl**

```bash
curl -X POST http://localhost:3000/api/publish \
  -H "Content-Type: application/json" \
  -d '{
    "type": "github.push",
    "source": "github",
    "data": {"repo": "test", "branch": "main"}
  }'
```

## 📸 What You'll See

### Browser (When Tab is Open)

```
┌─────────────────────────────────────────┐
│  🔗 MCP Client Connection               │
│  ● Connected                            │
│                                         │
│  Server: ESMCP WebPush Demo Hub v1.0.0  │
│  Client ID: browser-abc123              │
│  Subscription ID: sub-xyz789            │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  📱 Browser Push Notifications          │
│  ● Push Enabled ✓                       │
│                                         │
│  💡 Even when this tab is closed,       │
│     you'll receive system notifications!│
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  📊 Events Log (WebSocket)             │
│                                         │
│  [10:30:15] sub-xyz789...               │
│  github.push                            │
│  {                                      │
│    "repo": "my-awesome-project",        │
│    "branch": "main",                    │
│    "commits": 3                         │
│  }                                      │
└─────────────────────────────────────────┘
```

### System Notification (When Tab is Closed)

When you close the browser tab and publish an event, you'll see:

```
┌─────────────────────────────────────────┐
│  📤 GitHub Push                    [x]  │
│                                         │
│  New commits to my-awesome-project      │
│                                         │
│  [View Event]  [Dismiss]                │
└─────────────────────────────────────────┘
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      BROWSER                                │
│  ┌──────────────────┐      ┌──────────────────────────┐   │
│  │  WebSocket MCP   │      │  Service Worker          │   │
│  │  Client          │      │  (Push Notifications)    │   │
│  │                  │      │                          │   │
│  │  • Connected     │      │  • Receives push events  │   │
│  │  • Real-time     │      │  • Shows notifications   │   │
│  │  • Event log     │      │  • Works offline         │   │
│  └────────┬─────────┘      └──────────────────────────┘   │
│           │                              ▲                  │
│           │                              │ Push API        │
└───────────┼──────────────────────────────┼────────────────┘
            │                              │
            │ JSON-RPC 2.0         ┌───────┴───────┐
            │ (WebSocket)          │  Browser Push │
            │                      │  Service      │
            ▼                      │               │
┌─────────────────────────────────────────────────────────────┐
│                    MCP SERVER (Hub)                         │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ Subscription │  │   Web Push   │  │ HTTP API     │    │
│  │ Manager      │  │   Client     │  │ (Events)     │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
│         │                 │                 │              │
│         └─────────────────┴─────────────────┘              │
│                       │                                    │
│                       ▼                                    │
│              ┌──────────────┐                              │
│              │ Event Router │                              │
│              └──────┬───────┘                              │
└─────────────────────┼───────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
   ┌─────────┐  ┌─────────┐  ┌─────────┐
   │  CLI    │  │ GitHub  │  │  Slack  │
   │  Tool   │  │Webhook  │  │Webhook  │
   └─────────┘  └─────────┘  └─────────┘
```

## 📡 Protocol Flow

### 1. Initialize Connection

```javascript
// Browser -> Server
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-01-01",
    "clientInfo": { "name": "browser-client", "version": "1.0.0" },
    "capabilities": { "websocket": true }
  }
}

// Server -> Browser
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-01-01",
    "serverInfo": { "name": "ESMCP WebPush Demo Hub", "version": "1.0.0" },
    "capabilities": { "maxSubscriptions": 100, "supportedProviders": [...] }
  }
}
```

### 2. Create Subscription

```javascript
// Browser -> Server
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "subscriptions/create",
  "params": {
    "filter": {
      "sources": ["github", "slack", "gmail", "browser"]
    },
    "delivery": {
      "channels": ["websocket"],
      "priority": "realtime"
    }
  }
}

// Server -> Browser
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "id": "sub-uuid-here",
    "clientId": "browser-abc123",
    "filter": { ... },
    "status": "active",
    "createdAt": "2025-01-15T10:30:00Z"
  }
}
```

### 3. Receive Event Notification

```javascript
// Server -> Browser (notification, no ID)
{
  "jsonrpc": "2.0",
  "method": "notifications/event",
  "params": {
    "subscriptionId": "sub-uuid-here",
    "event": {
      "id": "evt-uuid-here",
      "type": "github.push",
      "data": { "repo": "test", "branch": "main" },
      "metadata": {
        "source": "github",
        "priority": "normal",
        "timestamp": "2025-01-15T10:30:00Z"
      }
    }
  }
}
```

## 🔐 Web Push Flow

When the browser enables push notifications:

1. **Register Service Worker**
   ```javascript
   navigator.serviceWorker.register('/service-worker.js')
   ```

2. **Subscribe to Push**
   ```javascript
   pushManager.subscribe({
     userVisibleOnly: true,
     applicationServerKey: VAPID_PUBLIC_KEY
   })
   ```

3. **Send Subscription to Server**
   ```javascript
   fetch('/api/register-push', {
     method: 'POST',
     body: JSON.stringify({ subscription, clientId })
   })
   ```

4. **Server Sends Push When Event Arrives**
   ```javascript
   webPushClient.sendNotification(subscription, {
     title: '📤 GitHub Push',
     body: 'New commits to my-awesome-project',
     // ...
   })
   ```

## 🛠️ Development

### File Structure

```
webpush-browser-demo/
├── package.json              # Dependencies
├── tsconfig.json             # TypeScript config
├── vapid-keys.json           # Web Push keys (generated)
├── generate-vapid-keys.ts    # Generate VAPID keys
├── server.ts                 # MCP server + HTTP server
├── publish-event.ts          # CLI event publisher
├── README.md                 # This file
└── public/                   # Static web files
    ├── index.html            # Browser demo UI
    ├── service-worker.js     # Push notification handler
    ├── manifest.json         # PWA manifest
    ├── icon-192.png          # App icons (add your own)
    └── icon-512.png
```

### Adding Custom Event Types

Edit `server.ts` to add new event type handlers in the `buildNotification` function:

```typescript
case 'myapp.something':
  title = '🎯 My App';
  body = event.data.message || 'Something happened!';
  break;
```

### Environment Variables

You can customize the demo with environment variables:

```bash
WS_PORT=8080 HTTP_PORT=3000 npx tsx server.ts
```

## 📱 Browser Compatibility

- ✅ Chrome/Edge (desktop & Android)
- ✅ Firefox (desktop & Android)
- ✅ Safari 16.4+ (macOS Ventura, iOS 16.4+)

**Note:** Safari on iOS requires the page to be added to Home Screen for push notifications.

## 🔍 Troubleshooting

### "Push notifications are not supported"

- Check if you're using HTTPS (required for push, except localhost)
- Safari: Use macOS 13+ or iOS 16.4+

### "Service Worker registration failed"

- Make sure the browser supports Service Workers
- Check for JavaScript errors in console
- Verify `service-worker.js` is accessible

### "Failed to subscribe to push"

- Check `vapid-keys.json` exists and is valid
- Verify the public key is being sent correctly
- Check browser notification permission settings

### Events not appearing in browser

- Check WebSocket connection status (should show "Connected")
- Verify subscription was created successfully
- Check browser console for errors
- Try using `curl` to test the HTTP API directly

## 📝 Next Steps

To use this in production:

1. **Replace in-memory storage** with a database (Redis, PostgreSQL)
2. **Add authentication** to the WebSocket and API endpoints
3. **Implement proper error handling** and retry logic
4. **Add metrics and monitoring**
5. **Deploy with HTTPS** (required for Web Push in production)

## 📚 Learn More

- [Web Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- [Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [VAPID Keys](https://web.dev/articles/push-notifications-web-push-protocol)
- [MCP Protocol](https://modelcontextprotocol.io)
