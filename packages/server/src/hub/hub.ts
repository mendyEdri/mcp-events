import { v4 as uuidv4 } from 'uuid';
import type {
  JsonRpcRequest,
  ServerInfo,
  ServerCapabilities,
  InitializeResult,
  ESMCPEvent,
  ASPCapabilities,
  ASPSchemaResponse,
} from '@esmcp/core';
import {
  PROTOCOL_VERSION,
  createJsonRpcResponse,
  createJsonRpcError,
  createJsonRpcNotification,
  ErrorCodes,
  InitializeParamsSchema,
  SubscriptionCreateParamsSchema,
  SubscriptionRemoveParamsSchema,
  SubscriptionListParamsSchema,
  SubscriptionUpdateParamsSchema,
  EventAcknowledgeParamsSchema,
  DeviceRegisterParamsSchema,
  DeviceInvalidateParamsSchema,
  SubscriptionPauseParamsSchema,
  SubscriptionResumeParamsSchema,
  SchemaRequestParamsSchema,
  ASPMethods,
  ASP_PROTOCOL_VERSION,
  ASPOperationDefinitions,
} from '@esmcp/core';
import {
  WebSocketServerTransport,
  ClientConnection,
} from '../transport/websocket-server.js';
import { SubscriptionManager } from '../subscription/manager.js';
import { DeviceStore, MemoryDeviceStore, Device } from '../device/store.js';

export interface EventHubOptions {
  port: number;
  host?: string;
  path?: string;
  serverInfo?: ServerInfo;
  maxSubscriptionsPerClient?: number;
  supportedProviders?: string[];
  /** Enable APNS push notifications */
  apnsEnabled?: boolean;
  /** Enable WebPush notifications */
  webPushEnabled?: boolean;
}

export class EventHub {
  private transport: WebSocketServerTransport;
  private subscriptionManager: SubscriptionManager;
  private deviceStore: DeviceStore;
  private serverInfo: ServerInfo;
  private serverCapabilities: ServerCapabilities;
  private aspCapabilities: ASPCapabilities;

  constructor(options: EventHubOptions) {
    this.transport = new WebSocketServerTransport({
      port: options.port,
      host: options.host,
      path: options.path,
    });

    this.subscriptionManager = new SubscriptionManager({
      maxSubscriptionsPerClient: options.maxSubscriptionsPerClient ?? 100,
    });

    this.deviceStore = new MemoryDeviceStore();

    this.serverInfo = options.serverInfo ?? {
      name: 'ASP Hub',
      version: '1.0.0',
    };

    this.serverCapabilities = {
      maxSubscriptions: options.maxSubscriptionsPerClient ?? 100,
      supportedProviders: options.supportedProviders ?? ['github', 'gmail', 'slack', 'custom'],
    };

    // Build full ASP capabilities
    this.aspCapabilities = {
      protocolVersion: ASP_PROTOCOL_VERSION,
      protocolName: 'asp',
      serverInfo: this.serverInfo,
      subscriptions: {
        maxActive: options.maxSubscriptionsPerClient ?? 100,
        maxFiltersPerSubscription: 10,
        supportsPause: true,
        supportsExpiration: true,
        supportsBatching: true,
      },
      filters: {
        supportedSources: options.supportedProviders ?? ['github', 'gmail', 'slack', 'custom'],
        supportsWildcardTypes: true,
        supportsTagFiltering: true,
        supportsPriorityFiltering: true,
      },
      delivery: {
        supportedChannels: ['websocket', 'sse', 'webpush', 'apns'],
        supportedPriorities: ['realtime', 'normal', 'batch'],
        supportsMultiChannel: true,
      },
      push: {
        apnsEnabled: options.apnsEnabled ?? false,
        webPushEnabled: options.webPushEnabled ?? false,
      },
    };

    this.setupTransportHandlers();
  }

  async start(): Promise<void> {
    await this.transport.start();
  }

  async stop(): Promise<void> {
    await this.transport.stop();
  }

  async publishEvent(event: ESMCPEvent): Promise<void> {
    const matchingSubscriptions =
      await this.subscriptionManager.findMatchingSubscriptions(event);

    for (const subscription of matchingSubscriptions) {
      const notification = createJsonRpcNotification('notifications/event', {
        event,
        subscriptionId: subscription.id,
      });

      // Try WebSocket first
      if (
        subscription.delivery.channels.includes('websocket') &&
        this.transport.isClientConnected(subscription.clientId)
      ) {
        await this.transport.send(subscription.clientId, notification);
      } else if (subscription.delivery.channels.includes('apns')) {
        // APNS delivery will be handled by the delivery coordinator
        // This is a placeholder for Phase 2
      }
    }
  }

  private setupTransportHandlers(): void {
    this.transport.on('message', (client, request) => {
      this.handleRequest(client, request);
    });

    this.transport.on('disconnect', (_client) => {
      // Optionally clean up subscriptions for disconnected clients
      // or keep them for APNS delivery
    });

    this.transport.on('error', (error) => {
      console.error('Transport error:', error);
    });
  }

  private async handleRequest(
    client: ClientConnection,
    request: JsonRpcRequest
  ): Promise<void> {
    try {
      let result: unknown;

      switch (request.method) {
        // Core protocol
        case ASPMethods.Initialize:
          result = await this.handleInitialize(client, request.params);
          break;

        // ASP Capability & Schema Discovery
        case ASPMethods.GetCapabilities:
          result = await this.handleGetCapabilities(client);
          break;
        case ASPMethods.GetSchema:
          result = await this.handleGetSchema(client, request.params);
          break;

        // Subscription Management
        case ASPMethods.SubscriptionCreate:
          result = await this.handleSubscriptionCreate(client, request.params);
          break;
        case ASPMethods.SubscriptionRemove:
          result = await this.handleSubscriptionRemove(client, request.params);
          break;
        case ASPMethods.SubscriptionList:
          result = await this.handleSubscriptionList(client, request.params);
          break;
        case ASPMethods.SubscriptionUpdate:
          result = await this.handleSubscriptionUpdate(client, request.params);
          break;
        case ASPMethods.SubscriptionPause:
          result = await this.handleSubscriptionPause(client, request.params);
          break;
        case ASPMethods.SubscriptionResume:
          result = await this.handleSubscriptionResume(client, request.params);
          break;

        // Event Operations
        case ASPMethods.EventAcknowledge:
          result = await this.handleEventAcknowledge(client, request.params);
          break;

        // Device Management
        case ASPMethods.DeviceRegister:
          result = await this.handleDeviceRegister(client, request.params);
          break;
        case ASPMethods.DeviceInvalidate:
          result = await this.handleDeviceInvalidate(client, request.params);
          break;

        default:
          throw { code: ErrorCodes.MethodNotFound, message: 'Method not found' };
      }

      const response = createJsonRpcResponse(request.id, result);
      await this.transport.send(client.id, response);
    } catch (error: unknown) {
      const errorObj = error as { code?: number; message?: string };
      const code = errorObj.code ?? ErrorCodes.InternalError;
      const message = errorObj.message ?? 'Internal error';
      const response = createJsonRpcError(request.id, code, message);
      await this.transport.send(client.id, response);
    }
  }

  private async handleInitialize(
    client: ClientConnection,
    params: unknown
  ): Promise<InitializeResult> {
    const parsed = InitializeParamsSchema.parse(params);

    // Check protocol version compatibility
    if (parsed.protocolVersion !== PROTOCOL_VERSION) {
      throw {
        code: ErrorCodes.InvalidParams,
        message: `Unsupported protocol version: ${parsed.protocolVersion}`,
      };
    }

    this.transport.markInitialized(client.id);

    return {
      protocolVersion: PROTOCOL_VERSION,
      serverInfo: this.serverInfo,
      capabilities: this.serverCapabilities,
    };
  }

  /**
   * Handle ASP capability discovery request
   * Returns full server capabilities for agent introspection
   */
  private async handleGetCapabilities(
    client: ClientConnection
  ): Promise<ASPCapabilities> {
    this.ensureInitialized(client);
    return this.aspCapabilities;
  }

  /**
   * Handle ASP schema discovery request
   * Returns operation schemas for LLM reasoning
   */
  private async handleGetSchema(
    client: ClientConnection,
    params: unknown
  ): Promise<ASPSchemaResponse> {
    this.ensureInitialized(client);
    const parsed = SchemaRequestParamsSchema.parse(params || {});

    // Filter operations if specific ones requested
    if (parsed.operations && parsed.operations.length > 0) {
      return {
        operations: ASPOperationDefinitions.filter((op) =>
          parsed.operations!.includes(op.name)
        ),
      };
    }

    return { operations: ASPOperationDefinitions };
  }

  private async handleSubscriptionCreate(
    client: ClientConnection,
    params: unknown
  ) {
    this.ensureInitialized(client);
    const parsed = SubscriptionCreateParamsSchema.parse(params);
    return this.subscriptionManager.create(client.id, parsed);
  }

  private async handleSubscriptionRemove(
    client: ClientConnection,
    params: unknown
  ) {
    this.ensureInitialized(client);
    const parsed = SubscriptionRemoveParamsSchema.parse(params);
    const success = await this.subscriptionManager.remove(
      parsed.subscriptionId,
      client.id
    );
    if (!success) {
      throw {
        code: ErrorCodes.SubscriptionNotFound,
        message: 'Subscription not found',
      };
    }
    return { success: true };
  }

  private async handleSubscriptionList(
    client: ClientConnection,
    params: unknown
  ) {
    this.ensureInitialized(client);
    const parsed = SubscriptionListParamsSchema.parse(params || {});
    const subscriptions = await this.subscriptionManager.listByClient(
      client.id,
      parsed.status
    );
    return { subscriptions };
  }

  private async handleSubscriptionUpdate(
    client: ClientConnection,
    params: unknown
  ) {
    this.ensureInitialized(client);
    const parsed = SubscriptionUpdateParamsSchema.parse(params);
    const updated = await this.subscriptionManager.update(
      parsed.subscriptionId,
      client.id,
      parsed.updates
    );
    if (!updated) {
      throw {
        code: ErrorCodes.SubscriptionNotFound,
        message: 'Subscription not found',
      };
    }
    return updated;
  }

  /**
   * Handle subscription pause request
   */
  private async handleSubscriptionPause(
    client: ClientConnection,
    params: unknown
  ) {
    this.ensureInitialized(client);
    const parsed = SubscriptionPauseParamsSchema.parse(params);
    const updated = await this.subscriptionManager.update(
      parsed.subscriptionId,
      client.id,
      { status: 'paused' }
    );
    if (!updated) {
      throw {
        code: ErrorCodes.SubscriptionNotFound,
        message: 'Subscription not found',
      };
    }
    return { success: true, status: 'paused' as const };
  }

  /**
   * Handle subscription resume request
   */
  private async handleSubscriptionResume(
    client: ClientConnection,
    params: unknown
  ) {
    this.ensureInitialized(client);
    const parsed = SubscriptionResumeParamsSchema.parse(params);
    const updated = await this.subscriptionManager.update(
      parsed.subscriptionId,
      client.id,
      { status: 'active' }
    );
    if (!updated) {
      throw {
        code: ErrorCodes.SubscriptionNotFound,
        message: 'Subscription not found',
      };
    }
    return { success: true, status: 'active' as const };
  }

  private async handleEventAcknowledge(
    client: ClientConnection,
    params: unknown
  ) {
    this.ensureInitialized(client);
    EventAcknowledgeParamsSchema.parse(params);
    // Event acknowledgment logic - could be used for delivery tracking
    return { success: true };
  }

  private async handleDeviceRegister(
    client: ClientConnection,
    params: unknown
  ) {
    this.ensureInitialized(client);
    const parsed = DeviceRegisterParamsSchema.parse(params);

    // Check if device with this token already exists
    const existing = await this.deviceStore.getByToken(parsed.token);
    if (existing) {
      // Update existing device
      await this.deviceStore.update(existing.id, {
        clientId: client.id,
        platform: parsed.platform,
        bundleId: parsed.bundleId,
      });
      return { deviceId: existing.id };
    }

    const now = new Date().toISOString();
    const device: Device = {
      id: uuidv4(),
      clientId: client.id,
      token: parsed.token,
      platform: parsed.platform,
      bundleId: parsed.bundleId,
      createdAt: now,
      updatedAt: now,
    };

    await this.deviceStore.create(device);
    return { deviceId: device.id };
  }

  private async handleDeviceInvalidate(
    client: ClientConnection,
    params: unknown
  ) {
    this.ensureInitialized(client);
    const parsed = DeviceInvalidateParamsSchema.parse(params);
    const success = await this.deviceStore.delete(parsed.deviceId);
    if (!success) {
      throw { code: ErrorCodes.DeviceNotFound, message: 'Device not found' };
    }
    return { success: true };
  }

  private ensureInitialized(client: ClientConnection): void {
    if (!client.initialized) {
      throw { code: ErrorCodes.NotInitialized, message: 'Client not initialized' };
    }
  }
}
