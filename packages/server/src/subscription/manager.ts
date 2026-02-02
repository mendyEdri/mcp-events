import { v4 as uuidv4 } from 'uuid';
import type {
  Subscription,
  CreateSubscriptionRequest,
  UpdateSubscriptionRequest,
  ESMCPEvent,
} from '@esmcp/core';
import { matchesFilter } from '@esmcp/core';
import type { SubscriptionStore } from './store.js';
import { MemorySubscriptionStore } from './memory-store.js';

export interface SubscriptionManagerOptions {
  store?: SubscriptionStore;
  maxSubscriptionsPerClient?: number;
}

export class SubscriptionManager {
  private store: SubscriptionStore;
  private maxSubscriptionsPerClient: number;

  constructor(options: SubscriptionManagerOptions = {}) {
    this.store = options.store || new MemorySubscriptionStore();
    this.maxSubscriptionsPerClient = options.maxSubscriptionsPerClient ?? 100;
  }

  async create(
    clientId: string,
    request: CreateSubscriptionRequest
  ): Promise<Subscription> {
    const count = await this.store.countByClient(clientId);
    if (count >= this.maxSubscriptionsPerClient) {
      throw new Error(
        `Subscription limit reached (max: ${this.maxSubscriptionsPerClient})`
      );
    }

    const now = new Date().toISOString();
    const subscription: Subscription = {
      id: uuidv4(),
      clientId,
      filter: request.filter,
      delivery: request.delivery,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      expiresAt: request.expiresAt,
    };

    return this.store.create(subscription);
  }

  async get(id: string): Promise<Subscription | null> {
    return this.store.get(id);
  }

  async update(
    id: string,
    clientId: string,
    updates: UpdateSubscriptionRequest
  ): Promise<Subscription | null> {
    const existing = await this.store.get(id);
    if (!existing || existing.clientId !== clientId) {
      return null;
    }

    const updateData: Partial<Subscription> = {};
    if (updates.filter !== undefined) {
      updateData.filter = updates.filter;
    }
    if (updates.delivery !== undefined) {
      updateData.delivery = updates.delivery;
    }
    if (updates.status !== undefined) {
      updateData.status = updates.status;
    }
    if (updates.expiresAt !== undefined) {
      updateData.expiresAt = updates.expiresAt ?? undefined;
    }

    return this.store.update(id, updateData);
  }

  async remove(id: string, clientId: string): Promise<boolean> {
    const existing = await this.store.get(id);
    if (!existing || existing.clientId !== clientId) {
      return false;
    }
    return this.store.delete(id);
  }

  async listByClient(
    clientId: string,
    status?: string
  ): Promise<Subscription[]> {
    const subscriptions = await this.store.listByClient(clientId);
    if (status) {
      return subscriptions.filter((sub) => sub.status === status);
    }
    return subscriptions;
  }

  async findMatchingSubscriptions(event: ESMCPEvent): Promise<Subscription[]> {
    const allSubscriptions = await this.store.listAll();
    const now = new Date();

    return allSubscriptions.filter((sub) => {
      // Check if subscription is active
      if (sub.status !== 'active') {
        return false;
      }

      // Check if subscription has expired
      if (sub.expiresAt && new Date(sub.expiresAt) < now) {
        return false;
      }

      // Check if event matches filter
      return matchesFilter(event, sub.filter);
    });
  }

  async cleanupExpired(): Promise<number> {
    const allSubscriptions = await this.store.listAll();
    const now = new Date();
    let cleaned = 0;

    for (const sub of allSubscriptions) {
      if (sub.expiresAt && new Date(sub.expiresAt) < now) {
        await this.store.delete(sub.id);
        cleaned++;
      }
    }

    return cleaned;
  }
}
