/**
 * Agent Subscription Protocol (ASP) Client
 *
 * A unified client for the Agent Subscription Protocol that works with
 * any transport implementation. Similar to MCP's client design, this
 * gives agents control over their event subscriptions.
 *
 * Design Principles:
 * 1. Transport-Agnostic: Works with WebSocket, SSE, or any Transport implementation
 * 2. Agent-Centric: Exposes capabilities and schemas for LLM reasoning
 * 3. Protocol-Compliant: Full JSON-RPC 2.0 implementation
 */

import type {
  Transport,
  ClientInfo,
  ClientCapabilities,
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
  ASPCapabilities,
  ASPSchemaResponse,
} from '@esmcp/core';
import {
  PROTOCOL_VERSION,
  createJsonRpcRequest,
  getASPOperations,
  ASPMethods,
  defaultASPCapabilities,
} from '@esmcp/core';
import { NotificationHandler, EventHandler } from '../handlers/notification.js';

/**
 * ASP Client Options
 *
 * Unlike the old ESMCPClient which hardcoded WebSocket transport,
 * ASPClient accepts any Transport implementation via dependency injection.
 */
export interface ASPClientOptions {
  /**
   * Transport implementation (WebSocket, SSE, etc.)
   * This is the key difference from the old design - transport is injected.
   */
  transport: Transport;

  /**
   * Client identification
   */
  clientInfo: ClientInfo;

  /**
   * Client capabilities to advertise to the server
   */
  capabilities?: ClientCapabilities;

  /**
   * Request timeout in milliseconds (default: 30000)
   */
  requestTimeout?: number;
}

export type ASPClientState = 'disconnected' | 'connecting' | 'connected' | 'initialized';

/**
 * Event emitted when a subscription expires
 */
export interface SubscriptionExpiredEvent {
  subscriptionId: string;
  expiredAt: string;
}

/**
 * Unified ASP Client
 *
 * This client implements the Agent Subscription Protocol, giving AI agents
 * the ability to:
 * - Discover what subscriptions are available (capabilities)
 * - Understand how to subscribe (schemas)
 * - Subscribe/unsubscribe to events
 * - Receive and handle events
 *
 * Usage:
 * ```typescript
 * // With WebSocket transport
 * const transport = new WebSocketTransport({ url: 'ws://localhost:3000' });
 * const client = new ASPClient({ transport, clientInfo: { name: 'MyAgent', version: '1.0.0' } });
 *
 * // With SSE transport
 * const sseTransport = new SSEClientTransport({ serverUrl: 'http://localhost:3000' });
 * const client = new ASPClient({ transport: sseTransport, clientInfo: { name: 'MyAgent', version: '1.0.0' } });
 * ```
 */
export class ASPClient {
  private transport: Transport;
  private notificationHandler: NotificationHandler;
  private pendingRequests: Map<
    string | number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  > = new Map();
  private requestId = 0;
  private _state: ASPClientState = 'disconnected';
  private _capabilities: ASPCapabilities | null = null;
  private _initializeResult: InitializeResult | null = null;
  private subscriptionExpiredHandlers: Set<(event: SubscriptionExpiredEvent) => void> = new Set();
  private requestTimeout: number;

  constructor(private options: ASPClientOptions) {
    this.transport = options.transport;
    this.notificationHandler = new NotificationHandler();
    this.requestTimeout = options.requestTimeout ?? 30000;
    this.setupTransportHandlers();
  }

  /**
   * Current client state
   */
  get state(): ASPClientState {
    return this._state;
  }

  /**
   * Server capabilities after initialization
   */
  get capabilities(): ASPCapabilities | null {
    return this._capabilities;
  }

  /**
   * Server info after initialization
   */
  get serverInfo() {
    return this._initializeResult?.serverInfo ?? null;
  }

  // ============================================================
  // Connection Lifecycle
  // ============================================================

  /**
   * Connect to the server and initialize the protocol
   */
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

  /**
   * Disconnect from the server
   */
  async disconnect(): Promise<void> {
    await this.transport.disconnect();
    this._state = 'disconnected';
    this._capabilities = null;
    this._initializeResult = null;

    // Reject all pending requests
    this.pendingRequests.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
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

    this._initializeResult = await this.request<InitializeResult>(
      ASPMethods.Initialize,
      params
    );
    this._state = 'initialized';

    // Fetch full capabilities
    try {
      this._capabilities = await this.getCapabilities();
    } catch {
      // Server may not support capabilities endpoint yet
      // Use defaults based on initialize result
      this._capabilities = {
        ...defaultASPCapabilities,
        serverInfo: this._initializeResult.serverInfo,
        subscriptions: {
          ...defaultASPCapabilities.subscriptions,
          maxActive: this._initializeResult.capabilities.maxSubscriptions,
        },
        filters: {
          ...defaultASPCapabilities.filters,
          supportedSources: this._initializeResult.capabilities.supportedProviders,
        },
      };
    }
  }

  // ============================================================
  // ASP Protocol: Capability & Schema Discovery
  // ============================================================

  /**
   * Get server capabilities
   *
   * Returns what subscription features are available on this server.
   * Use this to understand what filters, delivery channels, and options
   * are supported before creating subscriptions.
   *
   * @example
   * ```typescript
   * const caps = await client.getCapabilities();
   * console.log('Supported sources:', caps.filters.supportedSources);
   * console.log('Max subscriptions:', caps.subscriptions.maxActive);
   * ```
   */
  async getCapabilities(): Promise<ASPCapabilities> {
    this.ensureInitialized();
    return this.request<ASPCapabilities>(ASPMethods.GetCapabilities);
  }

  /**
   * Get operation schemas for LLM reasoning
   *
   * Returns JSON Schema definitions for all subscription operations.
   * This allows LLMs to understand how to construct valid subscription
   * requests, similar to MCP's tool schemas.
   *
   * @param operationNames - Optional filter for specific operations
   *
   * @example
   * ```typescript
   * // Get all operation schemas
   * const schemas = await client.getSchema();
   *
   * // Get specific operation schemas
   * const subscribeSchema = await client.getSchema(['subscribe', 'unsubscribe']);
   * ```
   */
  async getSchema(operationNames?: string[]): Promise<ASPSchemaResponse> {
    this.ensureInitialized();
    try {
      return await this.request<ASPSchemaResponse>(ASPMethods.GetSchema, {
        operations: operationNames,
      });
    } catch {
      // Server may not support schema endpoint yet
      // Return local operation definitions
      return getASPOperations(operationNames);
    }
  }

  // ============================================================
  // Subscription Management
  // ============================================================

  /**
   * Subscribe to events matching the specified criteria
   *
   * @param request - Subscription configuration including filter and delivery preferences
   * @returns The created subscription
   *
   * @example
   * ```typescript
   * const sub = await client.subscribe({
   *   filter: {
   *     sources: ['github'],
   *     eventTypes: ['github.push', 'github.pull_request.*'],
   *     priority: ['high', 'critical']
   *   },
   *   delivery: {
   *     channels: ['websocket'],
   *     priority: 'realtime'
   *   }
   * });
   * ```
   */
  async subscribe(request: CreateSubscriptionRequest): Promise<Subscription> {
    this.ensureInitialized();
    return this.request<SubscriptionCreateResult>(
      ASPMethods.SubscriptionCreate,
      request
    );
  }

  /**
   * Remove a subscription
   *
   * @param subscriptionId - ID of the subscription to remove
   * @returns true if successful
   */
  async unsubscribe(subscriptionId: string): Promise<boolean> {
    this.ensureInitialized();
    const result = await this.request<SubscriptionRemoveResult>(
      ASPMethods.SubscriptionRemove,
      { subscriptionId }
    );
    return result.success;
  }

  /**
   * List all subscriptions
   *
   * @param status - Optional filter by subscription status
   * @returns Array of subscriptions
   */
  async listSubscriptions(status?: 'active' | 'paused' | 'expired'): Promise<Subscription[]> {
    this.ensureInitialized();
    const result = await this.request<SubscriptionListResult>(
      ASPMethods.SubscriptionList,
      { status }
    );
    return result.subscriptions;
  }

  /**
   * Update a subscription
   *
   * @param subscriptionId - ID of the subscription to update
   * @param updates - Fields to update
   * @returns The updated subscription
   */
  async updateSubscription(
    subscriptionId: string,
    updates: UpdateSubscriptionRequest
  ): Promise<Subscription> {
    this.ensureInitialized();
    return this.request<SubscriptionUpdateResult>(ASPMethods.SubscriptionUpdate, {
      subscriptionId,
      updates,
    });
  }

  /**
   * Pause a subscription
   *
   * Events will not be delivered while paused, but the subscription
   * remains active and can be resumed.
   *
   * @param subscriptionId - ID of the subscription to pause
   */
  async pauseSubscription(subscriptionId: string): Promise<void> {
    this.ensureInitialized();
    await this.request(ASPMethods.SubscriptionPause, { subscriptionId });
  }

  /**
   * Resume a paused subscription
   *
   * @param subscriptionId - ID of the subscription to resume
   */
  async resumeSubscription(subscriptionId: string): Promise<void> {
    this.ensureInitialized();
    await this.request(ASPMethods.SubscriptionResume, { subscriptionId });
  }

  // ============================================================
  // Event Handling
  // ============================================================

  /**
   * Register an event handler
   *
   * Patterns support wildcards:
   * - '*' matches all events
   * - 'github.*' matches github.push, github.issue, etc.
   * - 'github.**' matches all github events including nested
   *
   * @param pattern - Event type pattern to match
   * @param handler - Function to call when matching events arrive
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * // Handle all GitHub events
   * const unsubscribe = client.onEvent('github.*', (event, subId) => {
   *   console.log('GitHub event:', event.type, event.data);
   * });
   *
   * // Later: stop handling
   * unsubscribe();
   * ```
   */
  onEvent(pattern: string, handler: EventHandler): () => void {
    return this.notificationHandler.onEvent(pattern, handler);
  }

  /**
   * Register a handler for subscription expiration events
   *
   * @param handler - Function to call when a subscription expires
   * @returns Unsubscribe function
   */
  onSubscriptionExpired(handler: (event: SubscriptionExpiredEvent) => void): () => void {
    this.subscriptionExpiredHandlers.add(handler);
    return () => {
      this.subscriptionExpiredHandlers.delete(handler);
    };
  }

  /**
   * Acknowledge receipt of an event
   *
   * Some delivery modes require acknowledgment to prevent redelivery.
   *
   * @param eventId - ID of the event to acknowledge
   * @param subscriptionId - ID of the subscription that received the event
   */
  async acknowledgeEvent(eventId: string, subscriptionId: string): Promise<void> {
    this.ensureInitialized();
    await this.request(ASPMethods.EventAcknowledge, { eventId, subscriptionId });
  }

  // ============================================================
  // Device Registration (for push notifications)
  // ============================================================

  /**
   * Register a device for push notifications
   *
   * This is used to enable APNS (Apple Push Notification Service)
   * delivery when the client is offline or in the background.
   *
   * @param token - Device token from APNS
   * @param platform - Platform type
   * @param bundleId - App bundle identifier
   * @returns Device ID for future reference
   */
  async registerDeviceToken(
    token: string,
    platform: 'ios' | 'macos',
    bundleId: string
  ): Promise<string> {
    this.ensureInitialized();
    const result = await this.request<DeviceRegisterResult>(
      ASPMethods.DeviceRegister,
      { token, platform, bundleId }
    );
    return result.deviceId;
  }

  /**
   * Invalidate a registered device
   *
   * Call this when the device should no longer receive push notifications.
   *
   * @param deviceId - Device ID to invalidate
   */
  async invalidateDevice(deviceId: string): Promise<boolean> {
    this.ensureInitialized();
    const result = await this.request<DeviceInvalidateResult>(
      ASPMethods.DeviceInvalidate,
      { deviceId }
    );
    return result.success;
  }

  // ============================================================
  // Internal Methods
  // ============================================================

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
        // This is a request from server (not expected in most cases)
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

    clearTimeout(pending.timeout);
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
    switch (notification.method) {
      case ASPMethods.NotificationEvent: {
        const params = notification.params as {
          event: ESMCPEvent;
          subscriptionId: string;
        };
        this.notificationHandler.handleEvent(params.event, params.subscriptionId);
        break;
      }

      case ASPMethods.NotificationSubscriptionExpired: {
        const params = notification.params as unknown as SubscriptionExpiredEvent;
        this.subscriptionExpiredHandlers.forEach((handler) => {
          try {
            handler(params);
          } catch (error) {
            console.error('Error in subscription expired handler:', error);
          }
        });
        break;
      }

      default:
        console.warn('Unknown notification method:', notification.method);
    }
  }

  private async request<T>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    const id = ++this.requestId;
    const request = createJsonRpcRequest(id, method, params);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, this.requestTimeout);

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });

      this.transport.send(request).catch((error) => {
        clearTimeout(timeout);
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

/**
 * Convenience function to create an ASP client
 *
 * @example
 * ```typescript
 * import { createASPClient } from '@esmcp/client';
 * import { WebSocketTransport } from '@esmcp/client/transport';
 *
 * const client = createASPClient({
 *   transport: new WebSocketTransport({ url: 'ws://localhost:3000' }),
 *   clientInfo: { name: 'MyAgent', version: '1.0.0' }
 * });
 *
 * await client.connect();
 * ```
 */
export function createASPClient(options: ASPClientOptions): ASPClient {
  return new ASPClient(options);
}
