import type { ESMCPEvent, Subscription } from '@esmcp/core';
import { createJsonRpcNotification } from '@esmcp/core';
import type { WebSocketServerTransport } from '../transport/websocket-server.js';
import type { APNSDelivery } from './apns.js';

export interface DeliveryResult {
  subscriptionId: string;
  channel: 'websocket' | 'apns';
  success: boolean;
  error?: string;
}

export interface DeliveryCoordinatorOptions {
  transport: WebSocketServerTransport;
  apnsDelivery?: APNSDelivery;
}

export class DeliveryCoordinator {
  private transport: WebSocketServerTransport;
  private apnsDelivery?: APNSDelivery;

  constructor(options: DeliveryCoordinatorOptions) {
    this.transport = options.transport;
    this.apnsDelivery = options.apnsDelivery;
  }

  async deliver(
    event: ESMCPEvent,
    subscriptions: Subscription[]
  ): Promise<DeliveryResult[]> {
    const results: DeliveryResult[] = [];

    for (const subscription of subscriptions) {
      const result = await this.deliverToSubscription(event, subscription);
      results.push(result);
    }

    return results;
  }

  private async deliverToSubscription(
    event: ESMCPEvent,
    subscription: Subscription
  ): Promise<DeliveryResult> {
    const { channels } = subscription.delivery;

    // Try WebSocket first if available
    if (channels.includes('websocket')) {
      const wsResult = await this.deliverViaWebSocket(event, subscription);
      if (wsResult.success) {
        return wsResult;
      }
    }

    // Fall back to APNS if WebSocket failed or unavailable
    if (channels.includes('apns') && this.apnsDelivery) {
      return this.deliverViaAPNS(event, subscription);
    }

    // No delivery channel available
    return {
      subscriptionId: subscription.id,
      channel: 'websocket',
      success: false,
      error: 'No delivery channel available',
    };
  }

  private async deliverViaWebSocket(
    event: ESMCPEvent,
    subscription: Subscription
  ): Promise<DeliveryResult> {
    const { clientId, id: subscriptionId } = subscription;

    if (!this.transport.isClientConnected(clientId)) {
      return {
        subscriptionId,
        channel: 'websocket',
        success: false,
        error: 'Client not connected',
      };
    }

    try {
      const notification = createJsonRpcNotification('notifications/event', {
        event,
        subscriptionId,
      });

      await this.transport.send(clientId, notification);

      return {
        subscriptionId,
        channel: 'websocket',
        success: true,
      };
    } catch (error) {
      return {
        subscriptionId,
        channel: 'websocket',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async deliverViaAPNS(
    event: ESMCPEvent,
    subscription: Subscription
  ): Promise<DeliveryResult> {
    if (!this.apnsDelivery) {
      return {
        subscriptionId: subscription.id,
        channel: 'apns',
        success: false,
        error: 'APNS not configured',
      };
    }

    try {
      await this.apnsDelivery.deliver(event, subscription);

      return {
        subscriptionId: subscription.id,
        channel: 'apns',
        success: true,
      };
    } catch (error) {
      return {
        subscriptionId: subscription.id,
        channel: 'apns',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
