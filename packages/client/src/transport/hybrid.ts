import type {
  Transport,
  TransportState,
  TransportEvents,
  ClientTransportOptions,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
} from '@esmcp/core';
import { WebSocketTransport } from './websocket.js';

export interface APNSNotificationData {
  eventId: string;
  eventType: string;
  subscriptionId: string;
  source: string;
}

export type APNSNotificationHandler = (data: APNSNotificationData) => void;

export interface HybridTransportOptions extends ClientTransportOptions {
  apnsHandler?: APNSNotificationHandler;
  preferWebSocket?: boolean;
}

export class HybridTransport implements Transport {
  private wsTransport: WebSocketTransport;
  private apnsHandler?: APNSNotificationHandler;
  private _state: TransportState = 'disconnected';
  private listeners: Map<keyof TransportEvents, Set<Function>> = new Map();

  constructor(options: HybridTransportOptions) {
    this.wsTransport = new WebSocketTransport({
      url: options.url,
      reconnect: options.reconnect ?? true,
      reconnectInterval: options.reconnectInterval,
      maxReconnectAttempts: options.maxReconnectAttempts,
    });

    this.apnsHandler = options.apnsHandler;

    this.setupWebSocketHandlers();
  }

  get state(): TransportState {
    return this._state;
  }

  async connect(): Promise<void> {
    if (this._state === 'connected' || this._state === 'connecting') {
      return;
    }

    this._state = 'connecting';

    try {
      await this.wsTransport.connect();
      this._state = 'connected';
      this.emit('connect');
    } catch (error) {
      // WebSocket connection failed, but we might still receive APNS
      if (this.apnsHandler) {
        this._state = 'connected';
        this.emit('connect');
      } else {
        this._state = 'error';
        throw error;
      }
    }
  }

  async disconnect(): Promise<void> {
    await this.wsTransport.disconnect();
    this._state = 'disconnected';
  }

  async send(
    message: JsonRpcRequest | JsonRpcResponse | JsonRpcNotification
  ): Promise<void> {
    // Always try to send via WebSocket
    if (this.wsTransport.state === 'connected') {
      return this.wsTransport.send(message);
    }

    throw new Error('WebSocket not connected and APNS is receive-only');
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

  // Call this from your app when receiving an APNS notification
  handleAPNSNotification(data: APNSNotificationData): void {
    if (this.apnsHandler) {
      this.apnsHandler(data);
    }

    // Convert APNS data to a JSON-RPC notification
    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method: 'notifications/event',
      params: {
        event: {
          id: data.eventId,
          type: data.eventType,
          data: {}, // APNS notifications have limited data, fetch full event separately
          metadata: {
            source: data.source,
            timestamp: new Date().toISOString(),
            priority: 'normal',
          },
        },
        subscriptionId: data.subscriptionId,
      },
    };

    this.emit('message', notification);
  }

  isWebSocketConnected(): boolean {
    return this.wsTransport.state === 'connected';
  }

  private setupWebSocketHandlers(): void {
    this.wsTransport.on('connect', () => {
      if (this._state !== 'connected') {
        this._state = 'connected';
        this.emit('connect');
      }
    });

    this.wsTransport.on('disconnect', (reason) => {
      // Don't change state to disconnected if we can receive APNS
      if (!this.apnsHandler) {
        this._state = 'disconnected';
      }
      this.emit('disconnect', reason);
    });

    this.wsTransport.on('error', (error) => {
      this.emit('error', error);
    });

    this.wsTransport.on('message', (message) => {
      this.emit('message', message);
    });
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
}
