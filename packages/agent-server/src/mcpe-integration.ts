import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import {
  EventsClient,
  type EventFilter,
  type MCPEvent,
  type CronSchedule,
  type ScheduledDelivery,
  type DeliveryChannel,
} from '@anthropic/mcpe';

export interface MCPEConnectionOptions {
  url: string;
  clientName?: string;
  clientVersion?: string;
}

export interface SubscriptionInfo {
  id: string;
  filter: EventFilter;
  createdAt: Date;
  eventCount: number;
  deliveryChannel: DeliveryChannel;
  cronSchedule?: CronSchedule;
  scheduledDelivery?: ScheduledDelivery;
}

export class MCPEIntegration {
  private client: EventsClient | null = null;
  private subscriptions: Map<string, SubscriptionInfo> = new Map();
  private eventHandlers: Map<string, (event: MCPEvent) => void> = new Map();
  private connectionUrl: string | null = null;
  private unsubscribeHandlers: (() => void)[] = [];

  async connect(options: MCPEConnectionOptions): Promise<void> {
    if (this.client) {
      await this.disconnect();
    }

    this.client = new EventsClient({
      name: options.clientName ?? 'mcpe-agent-server',
      version: options.clientVersion ?? '1.0.0',
    });

    this.connectionUrl = options.url;

    // Create SSE transport for the MCP connection
    const transport = new SSEClientTransport(new URL(options.url));
    await this.client.connect(transport);
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      // Unsubscribe from all active subscriptions
      for (const [id] of this.subscriptions) {
        try {
          await this.client.unsubscribe(id);
        } catch {
          // Ignore errors during cleanup
        }
      }

      // Clean up event handlers
      for (const unsubscribe of this.unsubscribeHandlers) {
        unsubscribe();
      }

      await this.client.close();
      this.client = null;
      this.subscriptions.clear();
      this.eventHandlers.clear();
      this.unsubscribeHandlers = [];
      this.connectionUrl = null;
    }
  }

  isConnected(): boolean {
    return this.client !== null && this.client.supportsEvents();
  }

  getConnectionUrl(): string | null {
    return this.connectionUrl;
  }

  /**
   * Subscribe with real-time delivery
   */
  async subscribe(
    filter: EventFilter,
    onEvent?: (event: MCPEvent) => void
  ): Promise<SubscriptionInfo> {
    if (!this.client) {
      throw new Error('Not connected to MCPE server');
    }

    const result = await this.client.subscribe({
      filter,
      delivery: {
        channels: ['realtime'],
      },
    });

    const info: SubscriptionInfo = {
      id: result.subscriptionId,
      filter,
      createdAt: new Date(),
      eventCount: 0,
      deliveryChannel: 'realtime',
    };

    this.subscriptions.set(result.subscriptionId, info);

    // Set up event handler
    if (onEvent) {
      this.eventHandlers.set(result.subscriptionId, onEvent);

      // Register event listener with the client
      const unsubscribe = this.client.onEvent('*', (event, subscriptionId) => {
        if (subscriptionId === result.subscriptionId) {
          const subInfo = this.subscriptions.get(result.subscriptionId);
          if (subInfo) {
            subInfo.eventCount++;
          }
          const handler = this.eventHandlers.get(result.subscriptionId);
          if (handler) {
            handler(event);
          }
        }
      });
      this.unsubscribeHandlers.push(unsubscribe);
    }

    return info;
  }

  /**
   * Subscribe with cron-based recurring delivery
   */
  async subscribeWithCron(
    filter: EventFilter,
    cronSchedule: CronSchedule,
    onEvent?: (event: MCPEvent) => void
  ): Promise<SubscriptionInfo> {
    if (!this.client) {
      throw new Error('Not connected to MCPE server');
    }

    const result = await this.client.subscribe({
      filter,
      delivery: {
        channels: ['cron'],
        cronSchedule,
      },
    });

    const info: SubscriptionInfo = {
      id: result.subscriptionId,
      filter,
      createdAt: new Date(),
      eventCount: 0,
      deliveryChannel: 'cron',
      cronSchedule,
    };

    this.subscriptions.set(result.subscriptionId, info);

    // Set up batch handler for cron deliveries
    if (onEvent) {
      this.eventHandlers.set(result.subscriptionId, onEvent);

      const unsubscribe = this.client.onBatch((events, subscriptionId) => {
        if (subscriptionId === result.subscriptionId) {
          const subInfo = this.subscriptions.get(result.subscriptionId);
          if (subInfo) {
            subInfo.eventCount += events.length;
          }
          const handler = this.eventHandlers.get(result.subscriptionId);
          if (handler) {
            for (const event of events) {
              handler(event);
            }
          }
        }
      });
      this.unsubscribeHandlers.push(unsubscribe);
    }

    return info;
  }

  /**
   * Subscribe with one-time scheduled delivery
   */
  async subscribeScheduled(
    filter: EventFilter,
    scheduledDelivery: ScheduledDelivery,
    onEvent?: (event: MCPEvent) => void
  ): Promise<SubscriptionInfo> {
    if (!this.client) {
      throw new Error('Not connected to MCPE server');
    }

    const result = await this.client.subscribe({
      filter,
      delivery: {
        channels: ['scheduled'],
        scheduledDelivery,
      },
      expiresAt: scheduledDelivery.autoExpire ? scheduledDelivery.deliverAt : undefined,
    });

    const info: SubscriptionInfo = {
      id: result.subscriptionId,
      filter,
      createdAt: new Date(),
      eventCount: 0,
      deliveryChannel: 'scheduled',
      scheduledDelivery,
    };

    this.subscriptions.set(result.subscriptionId, info);

    // Set up batch handler for scheduled deliveries
    if (onEvent) {
      this.eventHandlers.set(result.subscriptionId, onEvent);

      const unsubscribe = this.client.onBatch((events, subscriptionId) => {
        if (subscriptionId === result.subscriptionId) {
          const subInfo = this.subscriptions.get(result.subscriptionId);
          if (subInfo) {
            subInfo.eventCount += events.length;
          }
          const handler = this.eventHandlers.get(result.subscriptionId);
          if (handler) {
            for (const event of events) {
              handler(event);
            }
          }
        }
      });
      this.unsubscribeHandlers.push(unsubscribe);
    }

    return info;
  }

  async unsubscribe(subscriptionId: string): Promise<boolean> {
    if (!this.client) {
      throw new Error('Not connected to MCPE server');
    }

    const success = await this.client.unsubscribe(subscriptionId);
    if (success) {
      this.subscriptions.delete(subscriptionId);
      this.eventHandlers.delete(subscriptionId);
    }
    return success;
  }

  async listSubscriptions(): Promise<SubscriptionInfo[]> {
    return Array.from(this.subscriptions.values());
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionInfo | undefined> {
    return this.subscriptions.get(subscriptionId);
  }
}

// Singleton instance for the agent server
let mcpeInstance: MCPEIntegration | null = null;

export function getMCPEInstance(): MCPEIntegration {
  if (!mcpeInstance) {
    mcpeInstance = new MCPEIntegration();
  }
  return mcpeInstance;
}
