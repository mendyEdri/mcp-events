/**
 * Web Push Client using VAPID (Voluntary Application Server Identification)
 *
 * This is an OPEN STANDARD - no vendor fees required!
 *
 * Standards:
 * - RFC 8030: Generic Event Delivery Using HTTP Push
 * - RFC 8291: Message Encryption for Web Push
 * - RFC 8292: Voluntary Application Server Identification (VAPID)
 *
 * Works with:
 * - Chrome (desktop & Android)
 * - Firefox (desktop & Android)
 * - Edge
 * - Safari (macOS 13+ and iOS 16.4+)
 * - Any browser supporting Push API
 */

import webpush from 'web-push';
import type { PushSubscription } from 'web-push';

export interface VAPIDKeys {
  publicKey: string;
  privateKey: string;
}

export interface WebPushClientOptions {
  vapidKeys: VAPIDKeys;
  subject: string; // mailto: or https: URL identifying your server
}

export interface WebPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface WebPushPayload {
  title: string;
  body?: string;
  icon?: string;
  badge?: string;
  image?: string;
  tag?: string;
  data?: Record<string, unknown>;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
  requireInteraction?: boolean;
  silent?: boolean;
  timestamp?: number;
}

export interface WebPushResponse {
  success: boolean;
  statusCode?: number;
  body?: string;
  error?: string;
}

export class WebPushClient {
  constructor(private options: WebPushClientOptions) {
    webpush.setVapidDetails(
      options.subject,
      options.vapidKeys.publicKey,
      options.vapidKeys.privateKey
    );
  }

  /**
   * Generate new VAPID keys (do this once and store securely)
   */
  static generateVAPIDKeys(): VAPIDKeys {
    return webpush.generateVAPIDKeys();
  }

  /**
   * Get the public VAPID key to share with clients
   * Clients need this to subscribe to push notifications
   */
  getPublicKey(): string {
    return this.options.vapidKeys.publicKey;
  }

  /**
   * Send a push notification to a subscribed client
   */
  async send(
    subscription: WebPushSubscription,
    payload: WebPushPayload,
    options?: {
      ttl?: number; // Time to live in seconds
      urgency?: 'very-low' | 'low' | 'normal' | 'high';
      topic?: string; // For replacing notifications
    }
  ): Promise<WebPushResponse> {
    try {
      const pushSubscription: PushSubscription = {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      };

      const result = await webpush.sendNotification(
        pushSubscription,
        JSON.stringify(payload),
        {
          TTL: options?.ttl ?? 86400, // Default 24 hours
          urgency: options?.urgency ?? 'normal',
          topic: options?.topic,
        }
      );

      return {
        success: true,
        statusCode: result.statusCode,
        body: result.body,
      };
    } catch (error: unknown) {
      const err = error as { statusCode?: number; body?: string; message?: string };
      return {
        success: false,
        statusCode: err.statusCode,
        body: err.body,
        error: err.message || 'Unknown error',
      };
    }
  }

  /**
   * Send to multiple subscriptions
   */
  async sendBatch(
    subscriptions: WebPushSubscription[],
    payload: WebPushPayload,
    options?: {
      ttl?: number;
      urgency?: 'very-low' | 'low' | 'normal' | 'high';
    }
  ): Promise<Array<{ subscription: WebPushSubscription; response: WebPushResponse }>> {
    const results = await Promise.all(
      subscriptions.map(async (subscription) => {
        const response = await this.send(subscription, payload, options);
        return { subscription, response };
      })
    );
    return results;
  }
}
