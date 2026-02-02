/**
 * Server-Sent Events (SSE) Server Transport
 *
 * W3C Standard: https://html.spec.whatwg.org/multipage/server-sent-events.html
 *
 * SSE is unidirectional (server → client), so we use:
 * - GET /events/:clientId - SSE stream for receiving events
 * - POST /rpc/:clientId - HTTP endpoint for sending commands
 *
 * Advantages over WebSocket:
 * - Works through HTTP proxies and firewalls
 * - Automatic reconnection built into browsers
 * - Simpler protocol (just HTTP)
 * - Works with HTTP/2 multiplexing
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { v4 as uuidv4 } from 'uuid';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
} from '@esmcp/core';

export interface SSEClient {
  id: string;
  response: ServerResponse;
  initialized: boolean;
  lastEventId: number;
}

export interface SSEServerOptions {
  port: number;
  host?: string;
  path?: string;
  heartbeatInterval?: number; // Keep-alive interval in ms
  cors?: boolean | string; // CORS origin
}

export interface SSEServerEvents {
  connection: (client: SSEClient) => void;
  message: (client: SSEClient, message: JsonRpcRequest) => void;
  disconnect: (client: SSEClient) => void;
  error: (error: Error) => void;
}

export class SSEServer {
  private server: ReturnType<typeof createServer> | null = null;
  private clients: Map<string, SSEClient> = new Map();
  private listeners: Map<keyof SSEServerEvents, Set<Function>> = new Map();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private eventId = 0;

  constructor(private options: SSEServerOptions) {}

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (error) => {
        this.emit('error', error);
        reject(error);
      });

      this.server.listen(this.options.port, this.options.host, () => {
        // Start heartbeat to keep connections alive
        const interval = this.options.heartbeatInterval ?? 30000;
        this.heartbeatTimer = setInterval(() => {
          this.sendHeartbeat();
        }, interval);

        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Close all client connections
    this.clients.forEach((client) => {
      client.response.end();
    });
    this.clients.clear();

    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((error) => {
        if (error) reject(error);
        else resolve();
        this.server = null;
      });
    });
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    // Set CORS headers
    if (this.options.cors) {
      const origin = this.options.cors === true ? '*' : this.options.cors;
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Last-Event-ID');
    }

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const basePath = this.options.path || '';

    // GET /events - New SSE connection (client ID assigned)
    // GET /events/:clientId - Reconnect with existing client ID
    if (req.method === 'GET' && url.pathname.startsWith(`${basePath}/events`)) {
      this.handleSSEConnection(req, res, url);
      return;
    }

    // POST /rpc/:clientId - RPC request from client
    if (req.method === 'POST' && url.pathname.startsWith(`${basePath}/rpc/`)) {
      this.handleRPCRequest(req, res, url);
      return;
    }

    // 404 for unknown routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  private handleSSEConnection(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL
  ): void {
    const basePath = this.options.path || '';
    const pathParts = url.pathname.replace(`${basePath}/events`, '').split('/').filter(Boolean);
    const clientId = pathParts[0] || uuidv4();

    // Check for reconnection
    const lastEventId = req.headers['last-event-id'];

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Client-ID': clientId,
    });

    // Send initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\nid: ${++this.eventId}\n\n`);

    const client: SSEClient = {
      id: clientId,
      response: res,
      initialized: false,
      lastEventId: lastEventId ? parseInt(lastEventId as string, 10) : 0,
    };

    this.clients.set(clientId, client);
    this.emit('connection', client);

    // Handle client disconnect
    req.on('close', () => {
      this.clients.delete(clientId);
      this.emit('disconnect', client);
    });
  }

  private handleRPCRequest(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL
  ): void {
    const basePath = this.options.path || '';
    const clientId = url.pathname.replace(`${basePath}/rpc/`, '');
    const client = this.clients.get(clientId);

    if (!client) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Client not found. Connect to /events first.' }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', () => {
      try {
        const message = JSON.parse(body) as JsonRpcRequest;

        // Emit message for processing
        this.emit('message', client, message);

        // Response will be sent via sendResponse()
        // For now, acknowledge receipt
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: true, id: message.id }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  }

  /**
   * Send a JSON-RPC response to a client via SSE
   */
  sendResponse(clientId: string, response: JsonRpcResponse): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    const eventId = ++this.eventId;
    const data = JSON.stringify(response);
    client.response.write(`event: response\ndata: ${data}\nid: ${eventId}\n\n`);
    return true;
  }

  /**
   * Send a notification to a client via SSE
   */
  sendNotification(clientId: string, notification: JsonRpcNotification): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    const eventId = ++this.eventId;
    const data = JSON.stringify(notification);
    client.response.write(`event: notification\ndata: ${data}\nid: ${eventId}\n\n`);
    return true;
  }

  /**
   * Broadcast a notification to all connected clients
   */
  broadcast(notification: JsonRpcNotification): void {
    const eventId = ++this.eventId;
    const data = JSON.stringify(notification);
    const message = `event: notification\ndata: ${data}\nid: ${eventId}\n\n`;

    this.clients.forEach((client) => {
      if (client.initialized) {
        client.response.write(message);
      }
    });
  }

  /**
   * Send custom event to a client
   */
  sendEvent(clientId: string, eventName: string, data: unknown): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    const eventId = ++this.eventId;
    const payload = JSON.stringify(data);
    client.response.write(`event: ${eventName}\ndata: ${payload}\nid: ${eventId}\n\n`);
    return true;
  }

  private sendHeartbeat(): void {
    const comment = `: heartbeat ${Date.now()}\n\n`;
    this.clients.forEach((client) => {
      client.response.write(comment);
    });
  }

  getClient(clientId: string): SSEClient | undefined {
    return this.clients.get(clientId);
  }

  getConnectedClients(): string[] {
    return Array.from(this.clients.keys());
  }

  isClientConnected(clientId: string): boolean {
    return this.clients.has(clientId);
  }

  markInitialized(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.initialized = true;
    }
  }

  on<K extends keyof SSEServerEvents>(event: K, listener: SSEServerEvents[K]): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  off<K extends keyof SSEServerEvents>(event: K, listener: SSEServerEvents[K]): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener);
    }
  }

  private emit<K extends keyof SSEServerEvents>(
    event: K,
    ...args: Parameters<SSEServerEvents[K]>
  ): void {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach((listener) => {
        (listener as Function)(...args);
      });
    }
  }
}
