import { v4 as uuidv4 } from 'uuid';
import {
  type Subscription,
  type CreateSubscriptionRequest,
  type UpdateSubscriptionRequest,
  type MCPEvent,
  matchesFilter,
} from '../types/index.js';

/**
 * In-memory subscription manager
 *
 * Handles CRUD operations for subscriptions and event matching.
 * Can be extended or replaced with a persistent store implementation.
 */
export class SubscriptionManager {
  private subscriptions: Map<string, Subscription> = new Map();
  private maxSubscriptionsPerClient: number;

  constructor(options: { maxSubscriptionsPerClient?: number } = {}) {
    this.maxSubscriptionsPerClient = options.maxSubscriptionsPerClient ?? 100;
  }

  /**
   * Create a new subscription
   */
  create(clientId: string, request: CreateSubscriptionRequest): Subscription {
    // Check subscription limit
    const clientSubscriptions = this.listByClient(clientId);
    if (clientSubscriptions.length >= this.maxSubscriptionsPerClient) {
      throw new Error(`Maximum subscriptions (${this.maxSubscriptionsPerClient}) reached for client`);
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

    this.subscriptions.set(subscription.id, subscription);
    return subscription;
  }

  /**
   * Get a subscription by ID
   */
  get(subscriptionId: string): Subscription | undefined {
    return this.subscriptions.get(subscriptionId);
  }

  /**
   * Get a subscription by ID, verifying it belongs to the client
   */
  getForClient(subscriptionId: string, clientId: string): Subscription | undefined {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription && subscription.clientId === clientId) {
      return subscription;
    }
    return undefined;
  }

  /**
   * Update an existing subscription
   */
  update(subscriptionId: string, clientId: string, request: UpdateSubscriptionRequest): Subscription {
    const subscription = this.getForClient(subscriptionId, clientId);
    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }

    const updated: Subscription = {
      ...subscription,
      filter: request.filter ?? subscription.filter,
      delivery: request.delivery ?? subscription.delivery,
      status: request.status ?? subscription.status,
      expiresAt: request.expiresAt === null ? undefined : (request.expiresAt ?? subscription.expiresAt),
      updatedAt: new Date().toISOString(),
    };

    this.subscriptions.set(subscriptionId, updated);
    return updated;
  }

  /**
   * Delete a subscription
   */
  delete(subscriptionId: string, clientId: string): boolean {
    const subscription = this.getForClient(subscriptionId, clientId);
    if (!subscription) {
      return false;
    }
    return this.subscriptions.delete(subscriptionId);
  }

  /**
   * Pause a subscription
   */
  pause(subscriptionId: string, clientId: string): Subscription {
    return this.update(subscriptionId, clientId, { status: 'paused' });
  }

  /**
   * Resume a subscription
   */
  resume(subscriptionId: string, clientId: string): Subscription {
    return this.update(subscriptionId, clientId, { status: 'active' });
  }

  /**
   * List all subscriptions for a client
   */
  listByClient(clientId: string, status?: string): Subscription[] {
    const subscriptions: Subscription[] = [];
    for (const sub of this.subscriptions.values()) {
      if (sub.clientId === clientId) {
        if (!status || sub.status === status) {
          subscriptions.push(sub);
        }
      }
    }
    return subscriptions;
  }

  /**
   * Find all active subscriptions that match an event
   */
  findMatchingSubscriptions(event: MCPEvent): Subscription[] {
    const matching: Subscription[] = [];
    const now = new Date();

    for (const subscription of this.subscriptions.values()) {
      // Skip non-active subscriptions
      if (subscription.status !== 'active') {
        continue;
      }

      // Check expiration
      if (subscription.expiresAt && new Date(subscription.expiresAt) <= now) {
        subscription.status = 'expired';
        continue;
      }

      // Check filter match
      if (matchesFilter(event, subscription.filter)) {
        matching.push(subscription);
      }
    }

    return matching;
  }

  /**
   * Clean up expired subscriptions
   */
  cleanupExpired(): number {
    const now = new Date();
    let count = 0;

    for (const [id, subscription] of this.subscriptions.entries()) {
      if (subscription.expiresAt && new Date(subscription.expiresAt) <= now) {
        this.subscriptions.delete(id);
        count++;
      }
    }

    return count;
  }

  /**
   * Get total subscription count
   */
  get size(): number {
    return this.subscriptions.size;
  }

  /**
   * Clear all subscriptions (for testing)
   */
  clear(): void {
    this.subscriptions.clear();
  }
}
