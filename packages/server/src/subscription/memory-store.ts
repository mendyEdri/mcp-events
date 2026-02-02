import type { Subscription } from '@esmcp/core';
import type { SubscriptionStore } from './store.js';

export class MemorySubscriptionStore implements SubscriptionStore {
  private subscriptions: Map<string, Subscription> = new Map();

  async create(subscription: Subscription): Promise<Subscription> {
    this.subscriptions.set(subscription.id, subscription);
    return subscription;
  }

  async get(id: string): Promise<Subscription | null> {
    return this.subscriptions.get(id) || null;
  }

  async update(
    id: string,
    updates: Partial<Subscription>
  ): Promise<Subscription | null> {
    const existing = this.subscriptions.get(id);
    if (!existing) {
      return null;
    }

    const updated: Subscription = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.subscriptions.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.subscriptions.delete(id);
  }

  async listByClient(clientId: string): Promise<Subscription[]> {
    const result: Subscription[] = [];
    this.subscriptions.forEach((sub) => {
      if (sub.clientId === clientId) {
        result.push(sub);
      }
    });
    return result;
  }

  async listAll(): Promise<Subscription[]> {
    return Array.from(this.subscriptions.values());
  }

  async countByClient(clientId: string): Promise<number> {
    let count = 0;
    this.subscriptions.forEach((sub) => {
      if (sub.clientId === clientId) {
        count++;
      }
    });
    return count;
  }
}
