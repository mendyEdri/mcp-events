import WebSocket from 'ws';
import type {
  Transport,
  TransportState,
  TransportEvents,
  ClientTransportOptions,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
} from '@esmcp/core';

export class WebSocketTransport implements Transport {
  private ws: WebSocket | null = null;
  private _state: TransportState = 'disconnected';
  private listeners: Map<keyof TransportEvents, Set<Function>> = new Map();
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(private options: ClientTransportOptions) {}

  get state(): TransportState {
    return this._state;
  }

  async connect(): Promise<void> {
    if (this._state === 'connected' || this._state === 'connecting') {
      return;
    }

    this._state = 'connecting';

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.options.url);

        this.ws.on('open', () => {
          this._state = 'connected';
          this.reconnectAttempts = 0;
          this.emit('connect');
          resolve();
        });

        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            this.emit('message', message);
          } catch (error) {
            this.emit('error', new Error('Failed to parse message'));
          }
        });

        this.ws.on('close', (_code, reason) => {
          this._state = 'disconnected';
          this.emit('disconnect', reason?.toString());
          this.handleReconnect();
        });

        this.ws.on('error', (error) => {
          this._state = 'error';
          this.emit('error', error);
          reject(error);
        });
      } catch (error) {
        this._state = 'error';
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this._state = 'disconnected';
  }

  async send(
    message: JsonRpcRequest | JsonRpcResponse | JsonRpcNotification
  ): Promise<void> {
    if (this._state !== 'connected' || !this.ws) {
      throw new Error('Transport not connected');
    }

    return new Promise((resolve, reject) => {
      this.ws!.send(JSON.stringify(message), (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  on<K extends keyof TransportEvents>(
    event: K,
    listener: TransportEvents[K]
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  off<K extends keyof TransportEvents>(
    event: K,
    listener: TransportEvents[K]
  ): void {
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
