import type { ESMCPEvent, Subscription, APNSTransportOptions } from '@esmcp/core';
import type { DeviceStore, Device } from '../device/store.js';

export interface APNSDeliveryOptions {
  apnsOptions: APNSTransportOptions;
  deviceStore: DeviceStore;
}

export interface APNSClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(
    deviceToken: string,
    notification: APNSNotification
  ): Promise<APNSResponse>;
}

export interface APNSNotification {
  payload: {
    aps: {
      alert?: { title?: string; body?: string } | string;
      badge?: number;
      sound?: string;
      'content-available'?: 1;
      'mutable-content'?: 1;
    };
    [key: string]: unknown;
  };
  topic?: string;
  pushType?: string;
  priority?: number;
  collapseId?: string;
}

export interface APNSResponse {
  status: number;
  apnsId?: string;
  reason?: string;
}

export class APNSDelivery {
  private client: APNSClient | null = null;
  private deviceStore: DeviceStore;
  private apnsOptions: APNSTransportOptions;

  constructor(options: APNSDeliveryOptions) {
    this.deviceStore = options.deviceStore;
    this.apnsOptions = options.apnsOptions;
  }

  setClient(client: APNSClient): void {
    this.client = client;
  }

  async deliver(event: ESMCPEvent, subscription: Subscription): Promise<void> {
    if (!this.client) {
      throw new Error('APNS client not configured');
    }

    // Get devices for this client
    const devices = await this.deviceStore.listByClient(subscription.clientId);

    if (devices.length === 0) {
      throw new Error('No devices registered for client');
    }

    // Build notification
    const notification = this.buildNotification(event, subscription);

    // Send to all devices
    const results = await Promise.allSettled(
      devices.map((device) =>
        this.sendToDevice(device, notification)
      )
    );

    // Check if at least one delivery succeeded
    const anySuccess = results.some(
      (result) => result.status === 'fulfilled'
    );

    if (!anySuccess) {
      throw new Error('Failed to deliver to any device');
    }
  }

  private async sendToDevice(
    device: Device,
    notification: APNSNotification
  ): Promise<void> {
    if (!this.client) {
      throw new Error('APNS client not configured');
    }

    const response = await this.client.send(device.token, notification);

    if (response.status !== 200) {
      // Handle specific APNS error codes
      if (response.reason === 'BadDeviceToken' || response.reason === 'Unregistered') {
        // Device token is invalid, remove it
        await this.deviceStore.delete(device.id);
      }

      throw new Error(`APNS error: ${response.reason || response.status}`);
    }
  }

  private buildNotification(
    event: ESMCPEvent,
    subscription: Subscription
  ): APNSNotification {
    const useAlert = subscription.delivery.apnsAlert !== false;
    const priority = subscription.delivery.priority;

    const notification: APNSNotification = {
      payload: {
        aps: {},
        esmcp: {
          eventId: event.id,
          eventType: event.type,
          subscriptionId: subscription.id,
        },
      },
      topic: this.apnsOptions.bundleId,
      pushType: useAlert ? 'alert' : 'background',
      priority: priority === 'realtime' ? 10 : 5,
    };

    if (useAlert) {
      notification.payload.aps.alert = {
        title: this.formatAlertTitle(event),
        body: this.formatAlertBody(event),
      };
      notification.payload.aps.sound = 'default';
    } else {
      notification.payload.aps['content-available'] = 1;
    }

    // Use event ID as collapse ID for deduplication
    notification.collapseId = event.id;

    return notification;
  }

  private formatAlertTitle(event: ESMCPEvent): string {
    const parts = event.type.split('.');
    const prefix = parts[0] || event.type;
    const action = parts.pop() || event.type;
    return `${prefix}: ${action}`;
  }

  private formatAlertBody(event: ESMCPEvent): string {
    // Create a summary of the event data
    const data = event.data;
    if (typeof data === 'object' && data !== null) {
      const entries = Object.entries(data).slice(0, 3);
      return entries.map(([k, v]) => `${k}: ${String(v).slice(0, 30)}`).join(', ');
    }
    return JSON.stringify(data).slice(0, 100);
  }
}
