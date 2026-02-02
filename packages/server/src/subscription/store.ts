import type { Subscription } from '@esmcp/core';

export interface SubscriptionStore {
  create(subscription: Subscription): Promise<Subscription>;
  get(id: string): Promise<Subscription | null>;
  update(id: string, updates: Partial<Subscription>): Promise<Subscription | null>;
  delete(id: string): Promise<boolean>;
  listByClient(clientId: string): Promise<Subscription[]>;
  listAll(): Promise<Subscription[]>;
  countByClient(clientId: string): Promise<number>;
}
