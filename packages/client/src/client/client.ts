import type {
  Transport,
  ClientInfo,
  ClientCapabilities,
  ServerInfo,
  ServerCapabilities,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  InitializeParams,
  InitializeResult,
  Subscription,
  CreateSubscriptionRequest,
  UpdateSubscriptionRequest,
  SubscriptionCreateResult,
  SubscriptionRemoveResult,
  SubscriptionListResult,
  SubscriptionUpdateResult,
  DeviceRegisterResult,
  DeviceInvalidateResult,
  ESMCPEvent,
} from '@esmcp/core';
import {
  PROTOCOL_VERSION,
  createJsonRpcRequest,
} from '@esmcp/core';
import { WebSocketTransport } from '../transport/websocket.js';
import { NotificationHandler, EventHandler } from '../handlers/notification.js';

export interface ESMCPClientOptions {
  serverUrl: string;
  clientInfo: ClientInfo;
  capabilities?: ClientCapabilities;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export type ClientState = 'disconnected' | 'connecting' | 'connected' | 'initialized';

export class ESMCPClient {
  private transport: Transport;
  private notificationHandler: NotificationHandler;
  private pendingRequests: Map<
    string | number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  > = new Map();
  private requestId = 0;
  private _state: ClientState = 'disconnected';
  private _serverInfo: ServerInfo | null = null;
  private _serverCapabilities: ServerCapabilities | null = null;

  constructor(private options: ESMCPClientOptions) {
    this.transport = new WebSocketTransport({
      url: options.serverUrl,
      reconnect: options.reconnect ?? true,
      reconnectInterval: options.reconnectInterval,
      maxReconnectAttempts: options.maxReconnectAttempts,
    });

    this.notificationHandler = new NotificationHandler();
    this.setupTransportHandlers();
  }

  get state(): ClientState {
    return this._state;
  }

  get serverInfo(): ServerInfo | null {
    return this._serverInfo;
  }

  get serverCapabilities(): ServerCapabilities | null {
    return this._serverCapabilities;
  }

  async connect(): Promise<void> {
    if (this._state === 'connected' || this._state === 'initialized') {
      return;
    }

    this._state = 'connecting';
    await this.transport.connect();
    this._state = 'connected';

    // Initialize the connection
    await this.initialize();
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect();
    this._state = 'disconnected';
    this._serverInfo = null;
    this._serverCapabilities = null;
    this.pendingRequests.forEach(({ reject }) => {
      reject(new Error('Client disconnected'));
    });
    this.pendingRequests.clear();
  }

  private async initialize(): Promise<void> {
    const params: InitializeParams = {
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: this.options.clientInfo,
      capabilities: this.options.capabilities,
    };

    const result = await this.request<InitializeResult>('initialize', params);
    this._serverInfo = result.serverInfo;
    this._serverCapabilities = result.capabilities;
    this._state = 'initialized';
  }

  // Subscription methods
  async subscribe(request: CreateSubscriptionRequest): Promise<Subscription> {
    this.ensureInitialized();
    return this.request<SubscriptionCreateResult>('subscriptions/create', request);
  }

  async unsubscribe(subscriptionId: string): Promise<boolean> {
    this.ensureInitialized();
    const result = await this.request<SubscriptionRemoveResult>(
      'subscriptions/remove',
      { subscriptionId }
    );
    return result.success;
  }

  async listSubscriptions(status?: string): Promise<Subscription[]> {
    this.ensureInitialized();
    const result = await this.request<SubscriptionListResult>(
      'subscriptions/list',
      { status }
    );
    return result.subscriptions;
  }

  async updateSubscription(
    subscriptionId: string,
    updates: UpdateSubscriptionRequest
  ): Promise<Subscription> {
    this.ensureInitialized();
    return this.request<SubscriptionUpdateResult>('subscriptions/update', {
      subscriptionId,
      updates,
    });
  }

  // Device registration (APNS)
  async registerDeviceToken(
    token: string,
    platform: 'ios' | 'macos',
    bundleId: string
  ): Promise<string> {
    this.ensureInitialized();
    const result = await this.request<DeviceRegisterResult>('devices/register', {
      token,
      platform,
      bundleId,
    });
    return result.deviceId;
  }

  async invalidateDevice(deviceId: string): Promise<boolean> {
    this.ensureInitialized();
    const result = await this.request<DeviceInvalidateResult>(
      'devices/invalidate',
      { deviceId }
    );
    return result.success;
  }

  // Event handling
  onEvent(pattern: string, handler: EventHandler): () => void {
    return this.notificationHandler.onEvent(pattern, handler);
  }

  // Acknowledge event receipt
  async acknowledgeEvent(eventId: string, subscriptionId: string): Promise<void> {
    this.ensureInitialized();
    await this.request('events/acknowledge', { eventId, subscriptionId });
  }

  private setupTransportHandlers(): void {
    this.transport.on('message', (message) => {
      this.handleMessage(message);
    });

    this.transport.on('disconnect', () => {
      if (this._state === 'initialized') {
        this._state = 'connected';
      }
    });

    this.transport.on('error', (error) => {
      console.error('Transport error:', error);
    });
  }

  private handleMessage(
    message: JsonRpcRequest | JsonRpcResponse | JsonRpcNotification
  ): void {
    if ('id' in message && message.id !== undefined) {
      if ('method' in message) {
        // This is a request (not expected from server in most cases)
        console.warn('Received unexpected request from server:', message);
      } else {
        // This is a response
        this.handleResponse(message as JsonRpcResponse);
      }
    } else if ('method' in message) {
      // This is a notification
      this.handleNotification(message as JsonRpcNotification);
    }
  }

  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      console.warn('Received response for unknown request:', response.id);
      return;
    }

    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(
        new Error(`${response.error.message} (code: ${response.error.code})`)
      );
    } else {
      pending.resolve(response.result);
    }
  }

  private handleNotification(notification: JsonRpcNotification): void {
    if (notification.method === 'notifications/event') {
      const params = notification.params as {
        event: ESMCPEvent;
        subscriptionId: string;
      };
      this.notificationHandler.handleEvent(params.event, params.subscriptionId);
    }
  }

  private async request<T>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    const id = ++this.requestId;
    const request = createJsonRpcRequest(id, method, params);

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });

      this.transport.send(request).catch((error) => {
        this.pendingRequests.delete(id);
        reject(error);
      });
    });
  }

  private ensureInitialized(): void {
    if (this._state !== 'initialized') {
      throw new Error('Client not initialized. Call connect() first.');
    }
  }
}
