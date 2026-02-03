import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  type MCPEvent,
  type EventFilter,
  type CreateSubscriptionRequest,
  type UpdateSubscriptionRequest,
  type DeliveryPreferences,
  MCPE_NOTIFICATIONS,
  MCPE_TOOLS,
} from '../types/index.js';
import { matchesPattern } from '../utils/matching.js';

/**
 * Event handler function type
 */
export type EventCallback = (event: MCPEvent, subscriptionId: string) => void | Promise<void>;

/**
 * Batch event handler function type
 */
export type BatchEventCallback = (events: MCPEvent[], subscriptionId: string) => void | Promise<void>;

/**
 * Subscription expired handler function type
 */
export type SubscriptionExpiredCallback = (subscriptionId: string) => void | Promise<void>;

/**
 * Configuration for EventsClient
 */
export interface EventsClientConfig {
  name: string;
  version: string;
}

/**
 * Result from subscribing
 */
export interface SubscribeResult {
  subscriptionId: string;
  status: string;
  filter: EventFilter;
  delivery: DeliveryPreferences;
  createdAt: string;
  expiresAt?: string;
}

/**
 * Result from listing subscriptions
 */
export interface ListSubscriptionsResult {
  subscriptions: Array<{
    id: string;
    status: string;
    filter: EventFilter;
    delivery: DeliveryPreferences;
    createdAt: string;
    expiresAt?: string;
  }>;
}

/**
 * EventsClient - MCP Client wrapper with event subscription capabilities
 *
 * Provides a convenient API for subscribing to events from an MCPE-enabled server.
 *
 * @example
 * ```typescript
 * const client = new EventsClient({
 *   name: 'my-client',
 *   version: '1.0.0',
 * });
 *
 * await client.connect(transport);
 *
 * // Check if server supports events
 * if (client.supportsEvents()) {
 *   // Subscribe to events
 *   const sub = await client.subscribe({
 *     filter: { sources: ['github'], eventTypes: ['github.*'] },
 *     delivery: { channels: ['realtime'] },
 *   });
 *
 *   // Handle events
 *   client.onEvent('github.*', (event) => {
 *     console.log('Event:', event);
 *   });
 * }
 * ```
 */
export class EventsClient {
  readonly mcpClient: Client;
  private eventHandlers: Map<string, EventCallback[]> = new Map();
  private batchHandlers: BatchEventCallback[] = [];
  private subscriptionExpiredHandlers: SubscriptionExpiredCallback[] = [];
  private _supportsEvents: boolean = false;

  constructor(config: EventsClientConfig);
  constructor(mcpClient: Client);
  constructor(configOrClient: EventsClientConfig | Client) {
    if (configOrClient instanceof Client) {
      this.mcpClient = configOrClient;
    } else {
      this.mcpClient = new Client(
        { name: configOrClient.name, version: configOrClient.version },
        { capabilities: {} }
      );
    }

    this.setupNotificationHandlers();
  }

  /**
   * Set up notification handlers for event delivery
   */
  private setupNotificationHandlers(): void {
    // Handle single event notifications
    this.mcpClient.setNotificationHandler(
      { method: MCPE_NOTIFICATIONS.EVENT } as any,
      async (notification: any) => {
        const { event, subscriptionId } = notification.params;
        await this.dispatchEvent(event, subscriptionId);
      }
    );

    // Handle batch event notifications
    this.mcpClient.setNotificationHandler(
      { method: MCPE_NOTIFICATIONS.BATCH } as any,
      async (notification: any) => {
        const { events, subscriptionId } = notification.params;
        for (const handler of this.batchHandlers) {
          try {
            await handler(events, subscriptionId);
          } catch (error) {
            console.error('Error in batch event handler:', error);
          }
        }
      }
    );

    // Handle subscription expired notifications
    this.mcpClient.setNotificationHandler(
      { method: MCPE_NOTIFICATIONS.SUBSCRIPTION_EXPIRED } as any,
      async (notification: any) => {
        const { subscriptionId } = notification.params;
        for (const handler of this.subscriptionExpiredHandlers) {
          try {
            await handler(subscriptionId);
          } catch (error) {
            console.error('Error in subscription expired handler:', error);
          }
        }
      }
    );
  }

  /**
   * Dispatch an event to matching handlers
   */
  private async dispatchEvent(event: MCPEvent, subscriptionId: string): Promise<void> {
    for (const [pattern, handlers] of this.eventHandlers) {
      if (matchesPattern(event.type, pattern)) {
        for (const handler of handlers) {
          try {
            await handler(event, subscriptionId);
          } catch (error) {
            console.error(`Error in event handler for pattern "${pattern}":`, error);
          }
        }
      }
    }
  }

  /**
   * Connect to a transport and check for events support
   */
  async connect(transport: import('@modelcontextprotocol/sdk/shared/transport.js').Transport): Promise<void> {
    await this.mcpClient.connect(transport);

    // Check if server has events tools by listing tools
    try {
      const { tools } = await this.mcpClient.listTools();
      this._supportsEvents = tools.some((t) => t.name === MCPE_TOOLS.SUBSCRIBE);
    } catch {
      this._supportsEvents = false;
    }
  }

  /**
   * Close the connection
   */
  async close(): Promise<void> {
    await this.mcpClient.close();
  }

  /**
   * Check if the server supports events
   */
  supportsEvents(): boolean {
    return this._supportsEvents;
  }

  /**
   * Subscribe to events
   */
  async subscribe(request: CreateSubscriptionRequest): Promise<SubscribeResult> {
    const result = await this.mcpClient.callTool({
      name: MCPE_TOOLS.SUBSCRIBE,
      arguments: {
        filter: request.filter,
        delivery: request.delivery,
        expiresAt: request.expiresAt,
      },
    });

    const content = (result as { content: Array<{ type: string; text?: string }> }).content[0];
    if (content.type !== 'text' || !content.text) {
      throw new Error('Unexpected response type from subscribe');
    }

    return JSON.parse(content.text) as SubscribeResult;
  }

  /**
   * Unsubscribe from events
   */
  async unsubscribe(subscriptionId: string): Promise<boolean> {
    const result = await this.mcpClient.callTool({
      name: MCPE_TOOLS.UNSUBSCRIBE,
      arguments: { subscriptionId },
    });

    const content = (result as { content: Array<{ type: string; text?: string }> }).content[0];
    if (content.type !== 'text' || !content.text) {
      throw new Error('Unexpected response type from unsubscribe');
    }

    const response = JSON.parse(content.text);
    return response.success;
  }

  /**
   * List active subscriptions
   */
  async listSubscriptions(status?: 'active' | 'paused' | 'expired'): Promise<ListSubscriptionsResult> {
    const result = await this.mcpClient.callTool({
      name: MCPE_TOOLS.LIST,
      arguments: status ? { status } : {},
    });

    const content = (result as { content: Array<{ type: string; text?: string }> }).content[0];
    if (content.type !== 'text' || !content.text) {
      throw new Error('Unexpected response type from list');
    }

    return JSON.parse(content.text) as ListSubscriptionsResult;
  }

  /**
   * Pause a subscription
   */
  async pause(subscriptionId: string): Promise<{ subscriptionId: string; status: string }> {
    const result = await this.mcpClient.callTool({
      name: MCPE_TOOLS.PAUSE,
      arguments: { subscriptionId },
    });

    const content = (result as { content: Array<{ type: string; text?: string }> }).content[0];
    if (content.type !== 'text' || !content.text) {
      throw new Error('Unexpected response type from pause');
    }

    return JSON.parse(content.text);
  }

  /**
   * Resume a paused subscription
   */
  async resume(subscriptionId: string): Promise<{ subscriptionId: string; status: string }> {
    const result = await this.mcpClient.callTool({
      name: MCPE_TOOLS.RESUME,
      arguments: { subscriptionId },
    });

    const content = (result as { content: Array<{ type: string; text?: string }> }).content[0];
    if (content.type !== 'text' || !content.text) {
      throw new Error('Unexpected response type from resume');
    }

    return JSON.parse(content.text);
  }

  /**
   * Update a subscription
   */
  async update(
    subscriptionId: string,
    updates: Omit<UpdateSubscriptionRequest, 'status'>
  ): Promise<SubscribeResult> {
    const result = await this.mcpClient.callTool({
      name: MCPE_TOOLS.UPDATE,
      arguments: {
        subscriptionId,
        ...updates,
      },
    });

    const content = (result as { content: Array<{ type: string; text?: string }> }).content[0];
    if (content.type !== 'text' || !content.text) {
      throw new Error('Unexpected response type from update');
    }

    return JSON.parse(content.text);
  }

  /**
   * Register an event handler for a specific event type pattern
   *
   * @param pattern - Event type pattern (e.g., "github.*", "slack.message")
   * @param handler - Function to call when matching events are received
   * @returns A function to remove the handler
   */
  onEvent(pattern: string, handler: EventCallback): () => void {
    const handlers = this.eventHandlers.get(pattern) || [];
    handlers.push(handler);
    this.eventHandlers.set(pattern, handlers);

    return () => {
      const currentHandlers = this.eventHandlers.get(pattern);
      if (currentHandlers) {
        const index = currentHandlers.indexOf(handler);
        if (index !== -1) {
          currentHandlers.splice(index, 1);
          if (currentHandlers.length === 0) {
            this.eventHandlers.delete(pattern);
          }
        }
      }
    };
  }

  /**
   * Register a handler for batch event delivery
   */
  onBatch(handler: BatchEventCallback): () => void {
    this.batchHandlers.push(handler);

    return () => {
      const index = this.batchHandlers.indexOf(handler);
      if (index !== -1) {
        this.batchHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Register a handler for subscription expiration
   */
  onSubscriptionExpired(handler: SubscriptionExpiredCallback): () => void {
    this.subscriptionExpiredHandlers.push(handler);

    return () => {
      const index = this.subscriptionExpiredHandlers.indexOf(handler);
      if (index !== -1) {
        this.subscriptionExpiredHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Remove all event handlers
   */
  clearHandlers(): void {
    this.eventHandlers.clear();
    this.batchHandlers = [];
    this.subscriptionExpiredHandlers = [];
  }
}
