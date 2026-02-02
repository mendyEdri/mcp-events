import { describe, it, expect, beforeEach } from 'vitest';
import { SubscriptionManager } from '../subscription/manager.js';
import type { ESMCPEvent, CreateSubscriptionRequest } from '@esmcp/core';

describe('SubscriptionManager', () => {
  let manager: SubscriptionManager;

  beforeEach(() => {
    manager = new SubscriptionManager({ maxSubscriptionsPerClient: 5 });
  });

  describe('create', () => {
    it('should create a subscription', async () => {
      const request: CreateSubscriptionRequest = {
        filter: { sources: ['github'] },
        delivery: { channels: ['websocket'], priority: 'normal' },
      };

      const subscription = await manager.create('client-1', request);

      expect(subscription.id).toBeDefined();
      expect(subscription.clientId).toBe('client-1');
      expect(subscription.filter).toEqual({ sources: ['github'] });
      expect(subscription.status).toBe('active');
    });

    it('should enforce subscription limit', async () => {
      const request: CreateSubscriptionRequest = {
        filter: {},
        delivery: { channels: ['websocket'], priority: 'normal' },
      };

      // Create 5 subscriptions
      for (let i = 0; i < 5; i++) {
        await manager.create('client-1', request);
      }

      // 6th should fail
      await expect(manager.create('client-1', request)).rejects.toThrow(
        'Subscription limit reached'
      );
    });
  });

  describe('update', () => {
    it('should update a subscription', async () => {
      const request: CreateSubscriptionRequest = {
        filter: { sources: ['github'] },
        delivery: { channels: ['websocket'], priority: 'normal' },
      };

      const subscription = await manager.create('client-1', request);
      const updated = await manager.update(subscription.id, 'client-1', {
        status: 'paused',
      });

      expect(updated?.status).toBe('paused');
    });

    it('should not update subscription for different client', async () => {
      const request: CreateSubscriptionRequest = {
        filter: {},
        delivery: { channels: ['websocket'], priority: 'normal' },
      };

      const subscription = await manager.create('client-1', request);
      const updated = await manager.update(subscription.id, 'client-2', {
        status: 'paused',
      });

      expect(updated).toBeNull();
    });
  });

  describe('remove', () => {
    it('should remove a subscription', async () => {
      const request: CreateSubscriptionRequest = {
        filter: {},
        delivery: { channels: ['websocket'], priority: 'normal' },
      };

      const subscription = await manager.create('client-1', request);
      const result = await manager.remove(subscription.id, 'client-1');

      expect(result).toBe(true);

      const found = await manager.get(subscription.id);
      expect(found).toBeNull();
    });
  });

  describe('findMatchingSubscriptions', () => {
    it('should find subscriptions matching an event', async () => {
      await manager.create('client-1', {
        filter: { sources: ['github'] },
        delivery: { channels: ['websocket'], priority: 'normal' },
      });

      await manager.create('client-2', {
        filter: { sources: ['gmail'] },
        delivery: { channels: ['websocket'], priority: 'normal' },
      });

      const event: ESMCPEvent = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        type: 'github.push',
        data: {},
        metadata: {
          source: 'github',
          timestamp: new Date().toISOString(),
          priority: 'normal',
        },
      };

      const matching = await manager.findMatchingSubscriptions(event);

      expect(matching).toHaveLength(1);
      expect(matching[0].clientId).toBe('client-1');
    });

    it('should not match paused subscriptions', async () => {
      const sub = await manager.create('client-1', {
        filter: { sources: ['github'] },
        delivery: { channels: ['websocket'], priority: 'normal' },
      });

      await manager.update(sub.id, 'client-1', { status: 'paused' });

      const event: ESMCPEvent = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        type: 'github.push',
        data: {},
        metadata: {
          source: 'github',
          timestamp: new Date().toISOString(),
          priority: 'normal',
        },
      };

      const matching = await manager.findMatchingSubscriptions(event);
      expect(matching).toHaveLength(0);
    });
  });
});
