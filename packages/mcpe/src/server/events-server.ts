import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  type MCPEvent,
  type EventsCapability,
  type EventsServerOptions,
  type Subscription,
  type CreateSubscriptionRequest,
  EventFilterSchema,
  DeliveryPreferencesSchema,
  EventHandlerSchema,
  DEFAULT_EVENTS_CAPABILITY,
  MCPE_NOTIFICATIONS,
  MCPE_TOOLS,
  createEvent,
  type EventMetadata,
} from '../types/index.js';
import { SubscriptionManager } from './subscription-manager.js';
import { HandlerExecutor, type HandlerExecutorConfig } from './handler-executor.js';

/**
 * Options for creating an EventsServer
 */
export interface EventsServerConfig {
  name: string;
  version: string;
  events?: EventsServerOptions;
  /** Handler executor configuration for executing event handlers */
  handlers?: HandlerExecutorConfig;
}

/**
 * EventsServer - MCP Server wrapper with event subscription capabilities
 *
 * Provides a simple way to add event subscription functionality to an MCP server.
 * Events are delivered via MCP notifications.
 *
 * @example
 * ```typescript
 * // Create directly
 * const server = new EventsServer({
 *   name: 'my-server',
 *   version: '1.0.0',
 *   events: {
 *     maxSubscriptions: 100,
 *     supportedSources: ['github', 'slack'],
 *   },
 * });
 *
 * // Publish events
 * server.publish({
 *   type: 'github.push',
 *   data: { repo: 'user/repo', branch: 'main' },
 *   metadata: { source: 'github', priority: 'normal' },
 * });
 *
 * // Connect to transport
 * await server.connect(transport);
 * ```
 */
export class EventsServer {
  readonly mcpServer: McpServer;
  readonly subscriptionManager: SubscriptionManager;
  readonly handlerExecutor: HandlerExecutor;
  private readonly eventsCapability: EventsCapability;
  private clientId: string = 'default';

  constructor(config: EventsServerConfig);
  constructor(mcpServer: McpServer, options?: EventsServerOptions);
  constructor(
    configOrServer: EventsServerConfig | McpServer,
    options?: EventsServerOptions
  ) {
    if (configOrServer instanceof McpServer) {
      this.mcpServer = configOrServer;
      this.eventsCapability = this.buildCapability(options);
      this.handlerExecutor = new HandlerExecutor();
    } else {
      this.mcpServer = new McpServer(
        { name: configOrServer.name, version: configOrServer.version },
        { capabilities: {} }
      );
      this.eventsCapability = this.buildCapability(configOrServer.events);
      this.handlerExecutor = new HandlerExecutor(configOrServer.handlers);
    }

    this.subscriptionManager = new SubscriptionManager({
      maxSubscriptionsPerClient: this.eventsCapability.maxSubscriptions,
    });

    this.registerTools();
  }

  private buildCapability(options?: EventsServerOptions): EventsCapability {
    return {
      maxSubscriptions: options?.maxSubscriptions ?? DEFAULT_EVENTS_CAPABILITY.maxSubscriptions,
      supportedSources: (options?.supportedSources ?? DEFAULT_EVENTS_CAPABILITY.supportedSources) as EventsCapability['supportedSources'],
      deliveryChannels: (options?.deliveryChannels ?? DEFAULT_EVENTS_CAPABILITY.deliveryChannels) as EventsCapability['deliveryChannels'],
      features: {
        ...DEFAULT_EVENTS_CAPABILITY.features,
        ...options?.features,
      },
    };
  }

  /**
   * Get the events capability configuration
   */
  get capability(): EventsCapability {
    return this.eventsCapability;
  }

  /**
   * Register event management tools with the MCP server
   */
  private registerTools(): void {
    // events_subscribe - Create a new subscription
    this.mcpServer.registerTool(
      MCPE_TOOLS.SUBSCRIBE,
      {
        description: 'Subscribe to events matching a filter with optional handler',
        inputSchema: {
          filter: EventFilterSchema.optional(),
          delivery: DeliveryPreferencesSchema.optional(),
          handler: EventHandlerSchema.optional(),
          expiresAt: z.string().datetime().optional(),
        },
      },
      async (args) => {
        const request: CreateSubscriptionRequest = {
          filter: args.filter ?? {},
          delivery: args.delivery ?? { channels: ['realtime'] },
          handler: args.handler,
          expiresAt: args.expiresAt,
        };

        const subscription = this.subscriptionManager.create(this.clientId, request);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                subscriptionId: subscription.id,
                status: subscription.status,
                filter: subscription.filter,
                delivery: subscription.delivery,
                handler: subscription.handler ? { type: subscription.handler.type } : undefined,
                createdAt: subscription.createdAt,
                expiresAt: subscription.expiresAt,
              }),
            },
          ],
        };
      }
    );

    // events_unsubscribe - Remove a subscription
    this.mcpServer.registerTool(
      MCPE_TOOLS.UNSUBSCRIBE,
      {
        description: 'Unsubscribe from events',
        inputSchema: {
          subscriptionId: z.string().uuid(),
        },
      },
      async (args) => {
        const deleted = this.subscriptionManager.delete(args.subscriptionId, this.clientId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: deleted }),
            },
          ],
        };
      }
    );

    // events_list - List active subscriptions
    this.mcpServer.registerTool(
      MCPE_TOOLS.LIST,
      {
        description: 'List active subscriptions',
        inputSchema: {
          status: z.enum(['active', 'paused', 'expired']).optional(),
        },
      },
      async (args) => {
        const subscriptions = this.subscriptionManager.listByClient(this.clientId, args.status);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                subscriptions: subscriptions.map((s) => ({
                  id: s.id,
                  status: s.status,
                  filter: s.filter,
                  delivery: s.delivery,
                  createdAt: s.createdAt,
                  expiresAt: s.expiresAt,
                })),
              }),
            },
          ],
        };
      }
    );

    // events_pause - Pause a subscription
    if (this.eventsCapability.features.pause) {
      this.mcpServer.registerTool(
        MCPE_TOOLS.PAUSE,
        {
          description: 'Pause a subscription',
          inputSchema: {
            subscriptionId: z.string().uuid(),
          },
        },
        async (args) => {
          const subscription = this.subscriptionManager.pause(args.subscriptionId, this.clientId);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  subscriptionId: subscription.id,
                  status: subscription.status,
                }),
              },
            ],
          };
        }
      );

      // events_resume - Resume a subscription
      this.mcpServer.registerTool(
        MCPE_TOOLS.RESUME,
        {
          description: 'Resume a paused subscription',
          inputSchema: {
            subscriptionId: z.string().uuid(),
          },
        },
        async (args) => {
          const subscription = this.subscriptionManager.resume(args.subscriptionId, this.clientId);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  subscriptionId: subscription.id,
                  status: subscription.status,
                }),
              },
            ],
          };
        }
      );
    }

    // events_update - Update a subscription
    this.mcpServer.registerTool(
      MCPE_TOOLS.UPDATE,
      {
        description: 'Update a subscription',
        inputSchema: {
          subscriptionId: z.string().uuid(),
          filter: EventFilterSchema.optional(),
          delivery: DeliveryPreferencesSchema.optional(),
          expiresAt: z.string().datetime().optional().nullable(),
        },
      },
      async (args) => {
        const subscription = this.subscriptionManager.update(args.subscriptionId, this.clientId, {
          filter: args.filter,
          delivery: args.delivery,
          expiresAt: args.expiresAt,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                subscriptionId: subscription.id,
                status: subscription.status,
                filter: subscription.filter,
                delivery: subscription.delivery,
                updatedAt: subscription.updatedAt,
              }),
            },
          ],
        };
      }
    );
  }

  /**
   * Publish an event to all matching subscriptions
   *
   * @param event - The event to publish, or event creation parameters
   */
  async publish(event: MCPEvent): Promise<void>;
  async publish(
    type: string,
    data: Record<string, unknown>,
    metadata: Omit<EventMetadata, 'timestamp'> & { timestamp?: string }
  ): Promise<void>;
  async publish(
    eventOrType: MCPEvent | string,
    data?: Record<string, unknown>,
    metadata?: Omit<EventMetadata, 'timestamp'> & { timestamp?: string }
  ): Promise<void> {
    let event: MCPEvent;

    if (typeof eventOrType === 'string') {
      if (!data || !metadata) {
        throw new Error('data and metadata are required when publishing with type string');
      }
      event = createEvent(eventOrType, data, metadata);
    } else {
      event = eventOrType;
    }

    // Find matching subscriptions
    const matchingSubscriptions = this.subscriptionManager.findMatchingSubscriptions(event);

    // Send notifications to matching subscriptions
    for (const subscription of matchingSubscriptions) {
      await this.sendEventNotification(event, subscription);
    }
  }

  /**
   * Send an event notification for a specific subscription
   */
  private async sendEventNotification(event: MCPEvent, subscription: Subscription): Promise<void> {
    // For realtime delivery, send immediately
    if (subscription.delivery.channels.includes('realtime')) {
      try {
        // Use the underlying server to send a notification
        await this.mcpServer.server.notification({
          method: MCPE_NOTIFICATIONS.EVENT,
          params: {
            event,
            subscriptionId: subscription.id,
          },
        } as any);
      } catch (error) {
        // Log error but don't throw - other subscriptions should still receive
        console.error(`Failed to send event notification to subscription ${subscription.id}:`, error);
      }
    }

    // Execute handler if configured
    if (subscription.handler) {
      try {
        const result = await this.handlerExecutor.execute(event, subscription.handler, subscription.id);
        if (!result.success) {
          console.error(`Handler failed for subscription ${subscription.id}:`, result.error);
        }
      } catch (error) {
        console.error(`Handler execution error for subscription ${subscription.id}:`, error);
      }
    }

    // TODO: Handle cron and scheduled delivery
    // For now, these would need to be handled by an external scheduler
  }

  /**
   * Send a batch of events for a subscription (for cron/scheduled delivery)
   */
  async sendBatch(events: MCPEvent[], subscriptionId: string): Promise<void> {
    try {
      await this.mcpServer.server.notification({
        method: MCPE_NOTIFICATIONS.BATCH,
        params: {
          events,
          subscriptionId,
        },
      } as any);
    } catch (error) {
      console.error(`Failed to send batch notification to subscription ${subscriptionId}:`, error);
    }
  }

  /**
   * Notify client that a subscription has expired
   */
  async notifySubscriptionExpired(subscriptionId: string): Promise<void> {
    try {
      await this.mcpServer.server.notification({
        method: MCPE_NOTIFICATIONS.SUBSCRIPTION_EXPIRED,
        params: {
          subscriptionId,
        },
      } as any);
    } catch (error) {
      console.error(`Failed to send subscription expired notification:`, error);
    }
  }

  /**
   * Connect to a transport
   */
  async connect(transport: import('@modelcontextprotocol/sdk/shared/transport.js').Transport): Promise<void> {
    await this.mcpServer.connect(transport);
  }

  /**
   * Close the connection
   */
  async close(): Promise<void> {
    await this.mcpServer.close();
  }

  /**
   * Check if the server is connected
   */
  isConnected(): boolean {
    return this.mcpServer.isConnected();
  }
}
