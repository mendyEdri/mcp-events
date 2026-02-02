import type { ESMCPEvent } from '@esmcp/core';
import type { WebPushPayload } from '../client/webpush-client.js';

export class WebPushNotificationBuilder {
  private payload: WebPushPayload = { title: '' };

  static create(): WebPushNotificationBuilder {
    return new WebPushNotificationBuilder();
  }

  static fromEvent(
    event: ESMCPEvent,
    options?: {
      titlePrefix?: string;
      iconUrl?: string;
    }
  ): WebPushNotificationBuilder {
    const builder = new WebPushNotificationBuilder();

    const title = options?.titlePrefix
      ? `${options.titlePrefix}: ${event.type}`
      : event.type;

    builder.title(title);
    builder.body(WebPushNotificationBuilder.formatEventData(event.data));

    if (options?.iconUrl) {
      builder.icon(options.iconUrl);
    }

    builder.data({
      esmcp: {
        eventId: event.id,
        eventType: event.type,
        source: event.metadata.source,
      },
    });

    builder.tag(event.id); // Use event ID for deduplication
    builder.timestamp(new Date(event.metadata.timestamp).getTime());

    return builder;
  }

  private static formatEventData(data: Record<string, unknown>): string {
    const entries = Object.entries(data).slice(0, 3);
    return entries.map(([k, v]) => `${k}: ${String(v).slice(0, 50)}`).join(', ');
  }

  title(title: string): this {
    this.payload.title = title;
    return this;
  }

  body(body: string): this {
    this.payload.body = body;
    return this;
  }

  icon(url: string): this {
    this.payload.icon = url;
    return this;
  }

  badge(url: string): this {
    this.payload.badge = url;
    return this;
  }

  image(url: string): this {
    this.payload.image = url;
    return this;
  }

  tag(tag: string): this {
    this.payload.tag = tag;
    return this;
  }

  data(data: Record<string, unknown>): this {
    this.payload.data = { ...this.payload.data, ...data };
    return this;
  }

  action(action: string, title: string, icon?: string): this {
    if (!this.payload.actions) {
      this.payload.actions = [];
    }
    this.payload.actions.push({ action, title, icon });
    return this;
  }

  requireInteraction(require = true): this {
    this.payload.requireInteraction = require;
    return this;
  }

  silent(silent = true): this {
    this.payload.silent = silent;
    return this;
  }

  timestamp(ts: number): this {
    this.payload.timestamp = ts;
    return this;
  }

  build(): WebPushPayload {
    return { ...this.payload };
  }
}
