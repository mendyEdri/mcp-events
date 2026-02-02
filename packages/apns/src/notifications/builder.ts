import type { ESMCPEvent } from '@esmcp/core';

export interface APNSAlert {
  title?: string;
  subtitle?: string;
  body?: string;
  'title-loc-key'?: string;
  'title-loc-args'?: string[];
  'subtitle-loc-key'?: string;
  'subtitle-loc-args'?: string[];
  'loc-key'?: string;
  'loc-args'?: string[];
  'action-loc-key'?: string;
  'launch-image'?: string;
}

export interface APNSPayload {
  aps: {
    alert?: APNSAlert | string;
    badge?: number;
    sound?: string | { critical?: boolean; name?: string; volume?: number };
    'thread-id'?: string;
    category?: string;
    'content-available'?: 1;
    'mutable-content'?: 1;
    'target-content-id'?: string;
    'interruption-level'?: 'passive' | 'active' | 'time-sensitive' | 'critical';
    'relevance-score'?: number;
    'filter-criteria'?: string;
  };
  [key: string]: unknown;
}

export interface APNSNotification {
  payload: APNSPayload;
  topic?: string;
  pushType?: 'alert' | 'background' | 'voip' | 'complication' | 'fileprovider' | 'mdm';
  expiration?: number;
  priority?: 5 | 10;
  collapseId?: string;
  apnsId?: string;
}

export class NotificationBuilder {
  private payload: APNSPayload = { aps: {} };
  private _topic?: string;
  private _pushType: APNSNotification['pushType'] = 'alert';
  private _expiration?: number;
  private _priority?: 5 | 10;
  private _collapseId?: string;
  private _apnsId?: string;

  static create(): NotificationBuilder {
    return new NotificationBuilder();
  }

  static fromEvent(event: ESMCPEvent, options?: {
    silent?: boolean;
    titlePrefix?: string;
  }): NotificationBuilder {
    const builder = new NotificationBuilder();

    if (options?.silent) {
      builder.contentAvailable();
    } else {
      const title = options?.titlePrefix
        ? `${options.titlePrefix}: ${event.type}`
        : event.type;
      builder.alert({ title, body: JSON.stringify(event.data).slice(0, 100) });
    }

    // Add event data as custom payload
    builder.customData('esmcp', {
      eventId: event.id,
      eventType: event.type,
      source: event.metadata.source,
    });

    return builder;
  }

  alert(alert: APNSAlert | string): this {
    this.payload.aps.alert = alert;
    return this;
  }

  title(title: string): this {
    if (typeof this.payload.aps.alert === 'string') {
      this.payload.aps.alert = { title, body: this.payload.aps.alert };
    } else {
      this.payload.aps.alert = { ...this.payload.aps.alert, title };
    }
    return this;
  }

  body(body: string): this {
    if (typeof this.payload.aps.alert === 'string') {
      this.payload.aps.alert = { body };
    } else {
      this.payload.aps.alert = { ...this.payload.aps.alert, body };
    }
    return this;
  }

  badge(count: number): this {
    this.payload.aps.badge = count;
    return this;
  }

  sound(sound: string | { critical?: boolean; name?: string; volume?: number }): this {
    this.payload.aps.sound = sound;
    return this;
  }

  threadId(id: string): this {
    this.payload.aps['thread-id'] = id;
    return this;
  }

  category(category: string): this {
    this.payload.aps.category = category;
    return this;
  }

  contentAvailable(): this {
    this.payload.aps['content-available'] = 1;
    this._pushType = 'background';
    this._priority = 5;
    return this;
  }

  mutableContent(): this {
    this.payload.aps['mutable-content'] = 1;
    return this;
  }

  interruptionLevel(level: APNSPayload['aps']['interruption-level']): this {
    this.payload.aps['interruption-level'] = level;
    return this;
  }

  relevanceScore(score: number): this {
    this.payload.aps['relevance-score'] = Math.max(0, Math.min(1, score));
    return this;
  }

  customData(key: string, value: unknown): this {
    this.payload[key] = value;
    return this;
  }

  topic(topic: string): this {
    this._topic = topic;
    return this;
  }

  pushType(type: APNSNotification['pushType']): this {
    this._pushType = type;
    return this;
  }

  expiration(timestamp: number): this {
    this._expiration = timestamp;
    return this;
  }

  expiresIn(seconds: number): this {
    this._expiration = Math.floor(Date.now() / 1000) + seconds;
    return this;
  }

  priority(priority: 5 | 10): this {
    this._priority = priority;
    return this;
  }

  collapseId(id: string): this {
    this._collapseId = id;
    return this;
  }

  apnsId(id: string): this {
    this._apnsId = id;
    return this;
  }

  build(): APNSNotification {
    return {
      payload: this.payload,
      topic: this._topic,
      pushType: this._pushType,
      expiration: this._expiration,
      priority: this._priority,
      collapseId: this._collapseId,
      apnsId: this._apnsId,
    };
  }
}
