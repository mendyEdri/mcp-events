/**
 * SSE (Server-Sent Events) Demo
 *
 * This demonstrates the W3C standard SSE for push notifications.
 * Works in ALL browsers without any special APIs or permissions!
 */

import { SSEServer, getBrowserSSEClientCode } from '@esmcp/sse';
import {
  createJsonRpcResponse,
  createJsonRpcNotification,
  createEvent,
  PROTOCOL_VERSION,
} from '@esmcp/core';
import { createServer } from 'node:http';

const PORT = 3001;

// Simple in-memory subscription store
const subscriptions = new Map<string, { clientId: string; filter: { sources?: string[] } }>();

async function main() {
  // Create SSE server
  const sseServer = new SSEServer({
    port: PORT,
    cors: true,
    heartbeatInterval: 15000,
  });

  // Handle new connections
  sseServer.on('connection', (client) => {
    console.log(`\n🔌 Client connected: ${client.id}`);
  });

  // Handle RPC messages from clients
  sseServer.on('message', async (client, request) => {
    console.log(`📨 Request from ${client.id}: ${request.method}`);

    let result: unknown;

    try {
      switch (request.method) {
        case 'initialize':
          sseServer.markInitialized(client.id);
          result = {
            protocolVersion: PROTOCOL_VERSION,
            serverInfo: { name: 'SSE Demo Server', version: '1.0.0' },
            capabilities: { maxSubscriptions: 100, supportedProviders: ['github', 'gmail'] },
          };
          break;

        case 'subscriptions/create':
          const subId = `sub-${Date.now()}`;
          subscriptions.set(subId, {
            clientId: client.id,
            filter: request.params?.filter || {},
          });
          result = {
            id: subId,
            clientId: client.id,
            filter: request.params?.filter || {},
            delivery: request.params?.delivery || { channels: ['sse'] },
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          console.log(`   ✅ Created subscription: ${subId}`);
          break;

        case 'subscriptions/list':
          const clientSubs = Array.from(subscriptions.entries())
            .filter(([_, sub]) => sub.clientId === client.id)
            .map(([id, sub]) => ({ id, ...sub }));
          result = { subscriptions: clientSubs };
          break;

        default:
          result = { error: 'Unknown method' };
      }

      // Send response via SSE
      sseServer.sendResponse(client.id, createJsonRpcResponse(request.id, result));
    } catch (error) {
      console.error('Error handling request:', error);
    }
  });

  // Handle disconnections
  sseServer.on('disconnect', (client) => {
    console.log(`\n🔌 Client disconnected: ${client.id}`);
    // Clean up subscriptions for this client
    subscriptions.forEach((sub, id) => {
      if (sub.clientId === client.id) {
        subscriptions.delete(id);
      }
    });
  });

  await sseServer.start();
  console.log(`\n🚀 SSE Server running on http://localhost:${PORT}`);

  // Create a simple HTTP server for the demo page
  const webServer = createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(getIndexHTML());
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  webServer.listen(PORT + 1, () => {
    console.log(`📄 Demo page at http://localhost:${PORT + 1}`);
  });

  // Publish events periodically
  let eventCount = 0;
  setInterval(() => {
    eventCount++;
    const sources = ['github', 'gmail'];
    const source = sources[eventCount % 2] as 'github' | 'gmail';

    const event = createEvent(
      `${source}.event`,
      {
        message: `Event #${eventCount}`,
        timestamp: new Date().toISOString(),
      },
      { source, priority: 'normal' }
    );

    console.log(`\n📤 Publishing: ${event.type}`);

    // Send to matching subscriptions
    subscriptions.forEach((sub, subId) => {
      if (!sub.filter.sources || sub.filter.sources.includes(source)) {
        const notification = createJsonRpcNotification('notifications/event', {
          event,
          subscriptionId: subId,
        });
        const sent = sseServer.sendNotification(sub.clientId, notification);
        if (sent) {
          console.log(`   → Sent to ${sub.clientId.substring(0, 8)}...`);
        }
      }
    });
  }, 5000);

  console.log('\n⏳ Publishing events every 5 seconds...');
  console.log('   Press Ctrl+C to stop\n');
}

function getIndexHTML(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>ESMCP SSE Demo</title>
  <style>
    body { font-family: system-ui; max-width: 900px; margin: 40px auto; padding: 20px; }
    button { padding: 10px 20px; font-size: 16px; cursor: pointer; margin: 5px; }
    .success { color: green; }
    .error { color: red; }
    #events { background: #f4f4f4; padding: 15px; height: 300px; overflow-y: auto; font-family: monospace; font-size: 14px; }
    .event { margin: 5px 0; padding: 5px; background: white; border-left: 3px solid #007bff; }
    .event.github { border-color: #28a745; }
    .event.gmail { border-color: #dc3545; }
    pre { background: #f4f4f4; padding: 10px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>📡 ESMCP Server-Sent Events Demo</h1>
  <p>This uses the <strong>W3C SSE standard</strong> - works in ALL browsers, no special APIs needed!</p>

  <h2>Connection</h2>
  <button onclick="connect()">Connect</button>
  <button onclick="disconnect()">Disconnect</button>
  <span id="status">Disconnected</span>

  <h2>Subscriptions</h2>
  <button onclick="subscribeGithub()">Subscribe to GitHub</button>
  <button onclick="subscribeGmail()">Subscribe to Gmail</button>
  <button onclick="subscribeAll()">Subscribe to All</button>

  <h2>Events</h2>
  <div id="events"></div>

  <h2>How SSE Works</h2>
  <pre>
Browser                           Server
   │                                │
   │  GET /events (long-lived)      │
   │───────────────────────────────►│
   │                                │
   │  event: connected              │
   │◄───────────────────────────────│
   │                                │
   │  POST /rpc/:clientId           │
   │───────────────────────────────►│
   │                                │
   │  event: notification           │
   │◄───────────────────────────────│
   │  event: notification           │
   │◄───────────────────────────────│
   │         ...                    │
  </pre>

  <script>
${getBrowserSSEClientCode(`http://localhost:${PORT}`, '')}

let client = null;

async function connect() {
  try {
    setStatus('Connecting...');
    client = new ESMCPSSEClient('http://localhost:${PORT}', '');
    await client.connect();

    // Initialize
    await client.request('initialize', {
      protocolVersion: '2025-01-01',
      clientInfo: { name: 'SSE Demo', version: '1.0.0' }
    });

    // Set up event handler
    client.onEvent('*', (event, subId) => {
      addEvent(event);
    });

    setStatus('Connected ✅', 'success');
  } catch (error) {
    setStatus('Error: ' + error.message, 'error');
  }
}

function disconnect() {
  if (client) {
    client.disconnect();
    client = null;
  }
  setStatus('Disconnected');
}

async function subscribeGithub() {
  await subscribe({ sources: ['github'] }, 'GitHub');
}

async function subscribeGmail() {
  await subscribe({ sources: ['gmail'] }, 'Gmail');
}

async function subscribeAll() {
  await subscribe({}, 'All');
}

async function subscribe(filter, name) {
  if (!client) {
    alert('Connect first!');
    return;
  }
  try {
    const result = await client.request('subscriptions/create', {
      filter,
      delivery: { channels: ['sse'], priority: 'realtime' }
    });
    addEvent({ type: 'subscription.created', data: { name, id: result.id } });
  } catch (error) {
    addEvent({ type: 'error', data: { message: error.message } });
  }
}

function setStatus(text, className = '') {
  const el = document.getElementById('status');
  el.textContent = text;
  el.className = className;
}

function addEvent(event) {
  const el = document.getElementById('events');
  const source = event.metadata?.source || event.type.split('.')[0];
  const div = document.createElement('div');
  div.className = 'event ' + source;
  div.innerHTML = '<strong>' + event.type + '</strong>: ' + JSON.stringify(event.data || {});
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}
  </script>
</body>
</html>`;
}

main().catch(console.error);
