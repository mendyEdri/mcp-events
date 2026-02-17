import { describe, it, expect } from 'vitest';
import { NotificationBuilder } from '../notifications/builder.js';
import type { ESMCPEvent } from '@esmcp/core';

describe('NotificationBuilder', () => {
  describe('basic building', () => {
    it('should build a simple alert notification', () => {
      const notification = NotificationBuilder.create()
        .title('Test Title')
        .body('Test Body')
        .build();

      expect(notification.payload.aps.alert).toEqual({
        title: 'Test Title',
        body: 'Test Body',
      });
      expect(notification.pushType).toBe('alert');
    });

    it('should build a background notification', () => {
      const notification = NotificationBuilder.create()
        .contentAvailable()
        .build();

      expect(notification.payload.aps['content-available']).toBe(1);
      expect(notification.pushType).toBe('background');
      expect(notification.priority).toBe(5);
    });

    it('should set badge count', () => {
      const notification = NotificationBuilder.create()
        .badge(5)
        .build();

      expect(notification.payload.aps.badge).toBe(5);
    });

    it('should set sound', () => {
      const notification = NotificationBuilder.create()
        .sound('chime.aiff')
        .build();

      expect(notification.payload.aps.sound).toBe('chime.aiff');
    });

    it('should set category', () => {
      const notification = NotificationBuilder.create()
        .category('MESSAGE')
        .build();

      expect(notification.payload.aps.category).toBe('MESSAGE');
    });

    it('should set thread ID', () => {
      const notification = NotificationBuilder.create()
        .threadId('conversation-123')
        .build();

      expect(notification.payload.aps['thread-id']).toBe('conversation-123');
    });
  });

  describe('advanced options', () => {
    it('should set interruption level', () => {
      const notification = NotificationBuilder.create()
        .interruptionLevel('time-sensitive')
        .build();

      expect(notification.payload.aps['interruption-level']).toBe('time-sensitive');
    });

    it('should set relevance score', () => {
      const notification = NotificationBuilder.create()
        .relevanceScore(0.8)
        .build();

      expect(notification.payload.aps['relevance-score']).toBe(0.8);
    });

    it('should clamp relevance score to valid range', () => {
      const notification = NotificationBuilder.create()
        .relevanceScore(1.5)
        .build();

      expect(notification.payload.aps['relevance-score']).toBe(1);
    });

    it('should set mutable content', () => {
      const notification = NotificationBuilder.create()
        .mutableContent()
        .build();

      expect(notification.payload.aps['mutable-content']).toBe(1);
    });
  });

  describe('custom data', () => {
    it('should add custom data to payload', () => {
      const notification = NotificationBuilder.create()
        .customData('userId', '12345')
        .customData('metadata', { foo: 'bar' })
        .build();

      expect(notification.payload.userId).toBe('12345');
      expect(notification.payload.metadata).toEqual({ foo: 'bar' });
    });
  });

  describe('APNS headers', () => {
    it('should set topic', () => {
      const notification = NotificationBuilder.create()
        .topic('com.example.app')
        .build();

      expect(notification.topic).toBe('com.example.app');
    });

    it('should set expiration', () => {
      const notification = NotificationBuilder.create()
        .expiration(1704067200)
        .build();

      expect(notification.expiration).toBe(1704067200);
    });

    it('should set expires in seconds', () => {
      const before = Math.floor(Date.now() / 1000);
      const notification = NotificationBuilder.create()
        .expiresIn(3600)
        .build();
      const after = Math.floor(Date.now() / 1000);

      expect(notification.expiration).toBeGreaterThanOrEqual(before + 3600);
      expect(notification.expiration).toBeLessThanOrEqual(after + 3600);
    });

    it('should set priority', () => {
      const notification = NotificationBuilder.create()
        .priority(10)
        .build();

      expect(notification.priority).toBe(10);
    });

    it('should set collapse ID', () => {
      const notification = NotificationBuilder.create()
        .collapseId('update-123')
        .build();

      expect(notification.collapseId).toBe('update-123');
    });

    it('should set apns ID', () => {
      const notification = NotificationBuilder.create()
        .apnsId('custom-id')
        .build();

      expect(notification.apnsId).toBe('custom-id');
    });
  });

  describe('fromEvent', () => {
    const event: ESMCPEvent = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      type: 'github.push',
      data: { repository: 'test/repo', branch: 'main' },
      metadata: {
        timestamp: new Date().toISOString(),
        priority: 'normal',
      },
    };

    it('should create alert notification from event', () => {
      const notification = NotificationBuilder.fromEvent(event).build();

      expect(notification.payload.aps.alert).toBeDefined();
      expect(notification.payload.esmcp).toEqual({
        eventId: event.id,
        eventType: event.type,
      });
    });

    it('should create silent notification from event', () => {
      const notification = NotificationBuilder.fromEvent(event, {
        silent: true,
      }).build();

      expect(notification.payload.aps['content-available']).toBe(1);
      expect(notification.payload.aps.alert).toBeUndefined();
    });

    it('should add title prefix', () => {
      const notification = NotificationBuilder.fromEvent(event, {
        titlePrefix: 'New Event',
      }).build();

      const alert = notification.payload.aps.alert as { title: string };
      expect(alert.title).toContain('New Event');
    });
  });
});
