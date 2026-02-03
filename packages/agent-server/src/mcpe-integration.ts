import { ESMCPClient, type ESMCPClientOptions } from '@esmcp/client';
import type {
  EventFilter,
  Subscription,
  CreateSubscriptionRequest,
  ESMCPEvent,
  ServerCapabilities,
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
