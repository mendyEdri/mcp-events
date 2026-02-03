import { ESMCPClient, type ESMCPClientOptions } from '@esmcp/client';
import type {
  EventFilter,
  Subscription,
  CreateSubscriptionRequest,
  ESMCPEvent,
  ServerCapabilities,
  CronSchedule,
  ScheduledDelivery,
  DeliveryChannel,
} from '@esmcp/core';

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
  private client: ESMCPClient | null = null;
  private subscriptions: Map<string, SubscriptionInfo> = new Map();
  private eventHandlers: Map<string, (event: ESMCPEvent) => void> = new Map();
  private connectionUrl: string | null = null;

  async connect(options: MCPEConnectionOptions): Promise<void> {
    if (this.client) {
      await this.disconnect();
    }

    const clientOptions: ESMCPClientOptions = {
      serverUrl: options.url,
      clientInfo: {
        name: options.clientName ?? 'mcpe-agent-server',
        version: options.clientVersion ?? '1.0.0',
      },
      capabilities: {
        websocket: true,
      },
      reconnect: true,
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
    };

    this.client = new ESMCPClient(clientOptions);
    this.connectionUrl = options.url;
    await this.client.connect();
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
      await this.client.disconnect();
      this.client = null;
      this.subscriptions.clear();
      this.eventHandlers.clear();
      this.connectionUrl = null;
    }
  }

  isConnected(): boolean {
    return this.client !== null && this.client.state === 'initialized';
  }

  getConnectionUrl(): string | null {
    return this.connectionUrl;
  }

  getServerCapabilities(): ServerCapabilities | null {
    return this.client?.serverCapabilities ?? null;
  }

  /**
   * Subscribe with real-time WebSocket delivery
   */
  async subscribe(
    filter: EventFilter,
    onEvent?: (event: ESMCPEvent) => void
  ): Promise<SubscriptionInfo> {
    if (!this.client) {
      throw new Error('Not connected to MCPE EventHub');
    }

    const request: CreateSubscriptionRequest = {
      filter,
      delivery: {
        channels: ['websocket'],
        priority: 'realtime',
      },
    };

    const subscription: Subscription = await this.client.subscribe(request);

    const info: SubscriptionInfo = {
      id: subscription.id,
      filter,
      createdAt: new Date(),
      eventCount: 0,
      deliveryChannel: 'websocket',
    };

    this.subscriptions.set(subscription.id, info);

    // Set up event handler
    if (onEvent) {
      this.eventHandlers.set(subscription.id, onEvent);
    }

    // Register event listener for this subscription
    this.client.onEvent('*', (event, subscriptionId) => {
      if (subscriptionId === subscription.id) {
        const subInfo = this.subscriptions.get(subscription.id);
        if (subInfo) {
          subInfo.eventCount++;
        }
        const handler = this.eventHandlers.get(subscription.id);
        if (handler) {
          handler(event);
        }
      }
    });

    return info;
  }

  /**
   * Subscribe with cron-based recurring delivery
   * Events are collected and delivered on a schedule (e.g., daily digest, hourly summary)
   */
  async subscribeWithCron(
    filter: EventFilter,
    cronSchedule: CronSchedule,
    onEvent?: (event: ESMCPEvent) => void
  ): Promise<SubscriptionInfo> {
    if (!this.client) {
      throw new Error('Not connected to MCPE EventHub');
    }

    const request: CreateSubscriptionRequest = {
      filter,
      delivery: {
        channels: ['cron'],
        priority: 'batch',
        cronSchedule,
      },
    };

    const subscription: Subscription = await this.client.subscribe(request);

    const info: SubscriptionInfo = {
      id: subscription.id,
      filter,
      createdAt: new Date(),
      eventCount: 0,
      deliveryChannel: 'cron',
      cronSchedule,
    };

    this.subscriptions.set(subscription.id, info);

    // Set up event handler for when cron triggers delivery
    if (onEvent) {
      this.eventHandlers.set(subscription.id, onEvent);
    }

    // Register event listener
    this.client.onEvent('*', (event, subscriptionId) => {
      if (subscriptionId === subscription.id) {
        const subInfo = this.subscriptions.get(subscription.id);
        if (subInfo) {
          subInfo.eventCount++;
        }
        const handler = this.eventHandlers.get(subscription.id);
        if (handler) {
          handler(event);
        }
      }
    });

    return info;
  }

  /**
   * Subscribe with one-time scheduled delivery
   * Events are collected and delivered at a specific time (e.g., "remind me in 4 hours")
   */
  async subscribeScheduled(
    filter: EventFilter,
    scheduledDelivery: ScheduledDelivery,
    onEvent?: (event: ESMCPEvent) => void
  ): Promise<SubscriptionInfo> {
    if (!this.client) {
      throw new Error('Not connected to MCPE EventHub');
    }

    const request: CreateSubscriptionRequest = {
      filter,
      delivery: {
        channels: ['scheduled'],
        priority: 'normal',
        scheduledDelivery,
      },
      // Auto-expire after delivery if configured
      expiresAt: scheduledDelivery.autoExpire ? scheduledDelivery.deliverAt : undefined,
    };

    const subscription: Subscription = await this.client.subscribe(request);

    const info: SubscriptionInfo = {
      id: subscription.id,
      filter,
      createdAt: new Date(),
      eventCount: 0,
      deliveryChannel: 'scheduled',
      scheduledDelivery,
    };

    this.subscriptions.set(subscription.id, info);

    // Set up event handler for when scheduled delivery triggers
    if (onEvent) {
      this.eventHandlers.set(subscription.id, onEvent);
    }

    // Register event listener
    this.client.onEvent('*', (event, subscriptionId) => {
      if (subscriptionId === subscription.id) {
        const subInfo = this.subscriptions.get(subscription.id);
        if (subInfo) {
          subInfo.eventCount++;
        }
        const handler = this.eventHandlers.get(subscription.id);
        if (handler) {
          handler(event);
        }
      }
    });

    return info;
  }

  async unsubscribe(subscriptionId: string): Promise<boolean> {
    if (!this.client) {
      throw new Error('Not connected to MCPE EventHub');
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
