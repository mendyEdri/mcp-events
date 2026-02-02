/**
 * Server-Sent Events (SSE) Client Transport
 *
 * Works in both Node.js and browsers.
 * In browsers, uses native EventSource API.
 * In Node.js, uses http/https modules.
 */

import type {
  Transport,
  TransportState,
  TransportEvents,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
} from '@esmcp/core';

export interface SSEClientOptions {
  serverUrl: string; // Base URL (e.g., http://localhost:3000)
  path?: string; // Base path (e.g., /api)
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export class SSEClientTransport implements Transport {
  private eventSource: EventSource | null = null;
  private clientId: string | null = null;
  private _state: TransportState = 'disconnected';
  private listeners: Map<keyof TransportEvents, Set<Function>> = new Map();
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(private options: SSEClientOptions) {}

  get state(): TransportState {
    return this._state;
  }

  async connect(): Promise<void> {
    if (this._state === 'connected' || this._state === 'connecting') {
      return;
    }

    this._state = 'connecting';

    return new Promise((resolve, reject) => {
      const basePath = this.options.path || '';
      const url = `${this.options.serverUrl}${basePath}/events`;

      // Use native EventSource (works in browsers, need polyfill for Node.js)
      if (typeof EventSource === 'undefined') {
        reject(new Error('EventSource not available. Use eventsource polyfill for Node.js'));
        return;
      }

      this.eventSource = new EventSource(url);

      // Custom event handlers (SSE allows custom event types)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const addHandler = (name: string, handler: (data: string) => void) => {
        this.eventSource!.addEventListener(name, ((e: { data: string }) => {
          handler(e.data);
        }) as unknown as (e: Event) => void);
      };

      addHandler('connected', (data) => {
        try {
          const parsed = JSON.parse(data);
          this.clientId = parsed.clientId;
          this._state = 'connected';
          this.reconnectAttempts = 0;
          this.emit('connect');
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      addHandler('response', (data) => {
        try {
          const message = JSON.parse(data) as JsonRpcResponse;
          this.emit('message', message);
        } catch {
          this.emit('error', new Error('Failed to parse response'));
        }
      });

      addHandler('notification', (data) => {
        try {
          const message = JSON.parse(data) as JsonRpcNotification;
          this.emit('message', message);
        } catch {
          this.emit('error', new Error('Failed to parse notification'));
        }
      });

      this.eventSource.onerror = () => {
        if (this._state === 'connecting') {
          this._state = 'error';
          reject(new Error('SSE connection failed'));
        } else {
          this._state = 'disconnected';
          this.emit('disconnect', 'Connection lost');
          this.handleReconnect();
        }
      };
    });
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this._state = 'disconnected';
    this.clientId = null;
  }

  async send(message: JsonRpcRequest | JsonRpcResponse | JsonRpcNotification): Promise<void> {
    if (this._state !== 'connected' || !this.clientId) {
      throw new Error('Transport not connected');
    }

    const basePath = this.options.path || '';
    const url = `${this.options.serverUrl}${basePath}/rpc/${this.clientId}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
  }

  getClientId(): string | null {
    return this.clientId;
  }

  on<K extends keyof TransportEvents>(event: K, listener: TransportEvents[K]): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  off<K extends keyof TransportEvents>(event: K, listener: TransportEvents[K]): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener);
    }
  }

  private emit<K extends keyof TransportEvents>(
    event: K,
    ...args: Parameters<TransportEvents[K]>
  ): void {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach((listener) => {
        (listener as Function)(...args);
      });
    }
  }

  private handleReconnect(): void {
    if (!this.options.reconnect) {
      return;
    }

    const maxAttempts = this.options.maxReconnectAttempts ?? 5;
    if (this.reconnectAttempts >= maxAttempts) {
      this.emit('error', new Error('Max reconnect attempts reached'));
      return;
    }

    const interval = this.options.reconnectInterval ?? 1000;
    const delay = interval * Math.pow(2, this.reconnectAttempts);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect().catch(() => {
        // Error will be emitted through the error handler
      });
    }, delay);
  }
}

/**
 * Browser-side code for SSE client (can be embedded in HTML)
 */
export function getBrowserSSEClientCode(serverUrl: string, path = ''): string {
  return `
// ESMCP SSE Client for Browsers
class ESMCPSSEClient {
  constructor(serverUrl, path = '') {
    this.serverUrl = serverUrl;
    this.path = path;
    this.eventSource = null;
    this.clientId = null;
    this.handlers = new Map();
    this.requestId = 0;
    this.pendingRequests = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.eventSource = new EventSource(this.serverUrl + this.path + '/events');

      this.eventSource.addEventListener('connected', (event) => {
        const data = JSON.parse(event.data);
        this.clientId = data.clientId;
        console.log('SSE Connected, clientId:', this.clientId);
        resolve(this.clientId);
      });

      this.eventSource.addEventListener('response', (event) => {
        const response = JSON.parse(event.data);
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          this.pendingRequests.delete(response.id);
          if (response.error) {
            pending.reject(new Error(response.error.message));
          } else {
            pending.resolve(response.result);
          }
        }
      });

      this.eventSource.addEventListener('notification', (event) => {
        const notification = JSON.parse(event.data);
        if (notification.method === 'notifications/event') {
          const { event: esmcpEvent, subscriptionId } = notification.params;
          this.handlers.forEach((handler, pattern) => {
            if (this.matchPattern(esmcpEvent.type, pattern)) {
              handler(esmcpEvent, subscriptionId);
            }
          });
        }
      });

      this.eventSource.onerror = () => {
        if (!this.clientId) {
          reject(new Error('Connection failed'));
        }
      };
    });
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.clientId = null;
  }

  async request(method, params) {
    const id = ++this.requestId;
    const request = { jsonrpc: '2.0', id, method, params };

    const response = await fetch(
      this.serverUrl + this.path + '/rpc/' + this.clientId,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      }
    );

    // For SSE, responses come via the event stream
    // This returns immediately after the request is accepted
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  onEvent(pattern, handler) {
    this.handlers.set(pattern, handler);
    return () => this.handlers.delete(pattern);
  }

  matchPattern(eventType, pattern) {
    if (pattern === '*') return true;
    if (pattern === eventType) return true;
    if (pattern.endsWith('.*')) {
      return eventType.startsWith(pattern.slice(0, -1));
    }
    return false;
  }
}

// Usage:
// const client = new ESMCPSSEClient('${serverUrl}', '${path}');
// await client.connect();
// client.onEvent('github.*', (event) => console.log(event));
`;
}
