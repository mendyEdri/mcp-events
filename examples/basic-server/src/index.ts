import { EventsServer, createEvent } from '@mcpe/core';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createServer } from 'http';

/**
 * Basic MCPE Server Example
 *
 * This example demonstrates how to create an MCP server with event capabilities.
 * It uses SSE (Server-Sent Events) transport for communication.
 */

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

// Create the events server
const server = new EventsServer({
  name: 'basic-events-server',
  version: '1.0.0',
  events: {
    maxSubscriptions: 100,
  },
});

// Track active transports (in a real app, you'd use a proper session manager)
const transports = new Map<string, SSEServerTransport>();

// Create HTTP server for SSE connections
const httpServer = createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  // SSE endpoint for clients to connect
  if (url.pathname === '/sse' && req.method === 'GET') {
    console.log('New SSE connection request');

    const transport = new SSEServerTransport('/messages', res);
    const sessionId = Date.now().toString();
    transports.set(sessionId, transport);

    // Connect the MCP server to this transport
    await server.connect(transport);

    req.on('close', () => {
      console.log(`SSE connection ${sessionId} closed`);
      transports.delete(sessionId);
    });

    return;
  }

  // Message endpoint for POST requests from SSE clients
  if (url.pathname === '/messages' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', async () => {
      try {
        // Forward the message to all connected transports
        // In a real app, you'd route to the correct transport based on session
        for (const transport of transports.values()) {
          await transport.handlePostMessage(req, res, body);
          return;
        }
        res.writeHead(404);
        res.end('No active session');
      } catch (error) {
        console.error('Error handling message:', error);
        res.writeHead(500);
        res.end('Internal server error');
      }
    });
    return;
  }

  // Health check endpoint
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', subscriptions: server.subscriptionManager.size }));
    return;
  }

  // 404 for other routes
  res.writeHead(404);
  res.end('Not Found');
});

// Start the server
httpServer.listen(PORT, () => {
  console.log(`MCPE Server running on http://localhost:${PORT}`);
  console.log('');
  console.log('Endpoints:');
  console.log(`  GET  /sse      - SSE connection for MCP clients`);
  console.log(`  POST /messages - Message endpoint for MCP requests`);
  console.log(`  GET  /health   - Health check`);
  console.log('');
  console.log('Press Ctrl+C to stop');
});

// Simulate publishing events periodically
setInterval(() => {
  const event = createEvent(
    'github.push',
    {
      repository: 'user/repo',
      branch: 'main',
      commits: [{ message: 'Update README', sha: 'abc123' }],
    },
    {
      priority: 'normal',
    }
  );

  server.publish(event).catch(console.error);
  console.log(`Published event: ${event.type} (${event.id})`);
}, 10000); // Every 10 seconds

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await server.close();
  httpServer.close();
  process.exit(0);
});
