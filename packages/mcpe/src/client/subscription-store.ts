import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { EventFilter, DeliveryPreferences, EventHandler } from '../types/index.js';

/**
 * A stored subscription with client-side metadata
 */
export interface StoredSubscription {
  /** Unique subscription ID (from server) */
  id: string;
  /** Human-readable name for the subscription */
  name?: string;
  /** Description of what this subscription does */
  description?: string;
  /** Whether the subscription is enabled (can be toggled by user) */
  enabled: boolean;
  /** Server URL this subscription was created on */
  serverUrl?: string;
  /** Event filter criteria */
  filter: EventFilter;
  /** Delivery preferences (channels, schedule) */
  delivery: DeliveryPreferences;
  /** Event handler configuration */
  handler?: EventHandler;
  /** When the subscription was created */
  createdAt: string;
  /** When the subscription expires (optional) */
  expiresAt?: string;
  /** Last time this subscription received an event */
  lastEventAt?: string;
  /** Total events received by this subscription */
  eventCount?: number;
}

/**
 * subscriptions.json file format
 */
export interface SubscriptionsFile {
  /** File format version */
  version: string;
  /** Default server URL for new subscriptions */
  defaultServerUrl?: string;
  /** List of subscriptions */
  subscriptions: StoredSubscription[];
}

/**
 * Options for SubscriptionStore
 */
export interface SubscriptionStoreOptions {
  /** Path to subscriptions.json file (default: ./subscriptions.json) */
  filePath?: string;
  /** Auto-save after changes (default: true) */
  autoSave?: boolean;
  /** Create file if it doesn't exist (default: true) */
  createIfMissing?: boolean;
}

/**
 * SubscriptionStore - Client-side persistence for subscriptions
 *
 * Stores subscriptions in a local JSON file that users can manually edit.
 * Supports enabling/disabling subscriptions without removing them.
 *
 * @example
 * ```typescript
 * const store = new SubscriptionStore({
 *   filePath: './subscriptions.json',
 * });
 *
 * // Get all enabled subscriptions
 * const active = store.getEnabled();
 *
 * // Disable a subscription (persists to file)
 * store.setEnabled(subscriptionId, false);
 *
 * // Add a new subscription
 * store.add({
 *   id: 'uuid',
 *   name: 'My Subscription',
 *   enabled: true,
 *   filter: { eventTypes: ['github.*'] },
 *   delivery: { channels: ['realtime'] },
 *   createdAt: new Date().toISOString(),
 * });
 * ```
 */
export class SubscriptionStore {
  private filePath: string;
  private subscriptions: Map<string, StoredSubscription> = new Map();
  private defaultServerUrl?: string;
  private autoSave: boolean;

  constructor(options: SubscriptionStoreOptions = {}) {
    this.filePath = options.filePath || './subscriptions.json';
    this.autoSave = options.autoSave !== false;

    if (options.createIfMissing !== false) {
      this.ensureFile();
    }

    this.load();
  }

  /**
   * Ensure the file and directory exist
   */
  private ensureFile(): void {
    const dir = dirname(this.filePath);
    if (dir && dir !== '.' && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    if (!existsSync(this.filePath)) {
      const initial: SubscriptionsFile = {
        version: '1.0',
        subscriptions: [],
      };
      writeFileSync(this.filePath, JSON.stringify(initial, null, 2));
    }
  }

  /**
   * Load subscriptions from file
   */
  load(): void {
    try {
      if (!existsSync(this.filePath)) {
                return;
      }

      const content = readFileSync(this.filePath, 'utf-8');
      const data: SubscriptionsFile = JSON.parse(content);

      this.defaultServerUrl = data.defaultServerUrl;
      this.subscriptions.clear();

      for (const sub of data.subscriptions) {
        this.subscriptions.set(sub.id, sub);
      }

            console.log(`[SubscriptionStore] Loaded ${this.subscriptions.size} subscriptions from ${this.filePath}`);
    } catch (error) {
      console.error(`[SubscriptionStore] Failed to load subscriptions:`, error);
          }
  }

  /**
   * Save subscriptions to file
   */
  save(): void {
    try {
      const data: SubscriptionsFile = {
        version: '1.0',
        defaultServerUrl: this.defaultServerUrl,
        subscriptions: Array.from(this.subscriptions.values()),
      };

      writeFileSync(this.filePath, JSON.stringify(data, null, 2));
      console.log(`[SubscriptionStore] Saved ${this.subscriptions.size} subscriptions to ${this.filePath}`);
    } catch (error) {
      console.error(`[SubscriptionStore] Failed to save subscriptions:`, error);
    }
  }

  /**
   * Get all subscriptions
   */
  getAll(): StoredSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Get only enabled subscriptions
   */
  getEnabled(): StoredSubscription[] {
    return Array.from(this.subscriptions.values()).filter((s) => s.enabled);
  }

  /**
   * Get only disabled subscriptions
   */
  getDisabled(): StoredSubscription[] {
    return Array.from(this.subscriptions.values()).filter((s) => !s.enabled);
  }

  /**
   * Get a subscription by ID
   */
  get(id: string): StoredSubscription | undefined {
    return this.subscriptions.get(id);
  }

  /**
   * Check if a subscription exists
   */
  has(id: string): boolean {
    return this.subscriptions.has(id);
  }

  /**
   * Add a new subscription
   */
  add(subscription: StoredSubscription): void {
    this.subscriptions.set(subscription.id, subscription);
    if (this.autoSave) this.save();
  }

  /**
   * Update an existing subscription
   */
  update(id: string, updates: Partial<Omit<StoredSubscription, 'id'>>): StoredSubscription | undefined {
    const existing = this.subscriptions.get(id);
    if (!existing) return undefined;

    const updated: StoredSubscription = {
      ...existing,
      ...updates,
    };

    this.subscriptions.set(id, updated);
    if (this.autoSave) this.save();

    return updated;
  }

  /**
   * Remove a subscription
   */
  remove(id: string): boolean {
    const deleted = this.subscriptions.delete(id);
    if (deleted && this.autoSave) this.save();
    return deleted;
  }

  /**
   * Enable or disable a subscription
   */
  setEnabled(id: string, enabled: boolean): boolean {
    const sub = this.subscriptions.get(id);
    if (!sub) return false;

    sub.enabled = enabled;
    if (this.autoSave) this.save();
    return true;
  }

  /**
   * Toggle a subscription's enabled state
   */
  toggle(id: string): boolean {
    const sub = this.subscriptions.get(id);
    if (!sub) return false;

    sub.enabled = !sub.enabled;
    if (this.autoSave) this.save();
    return sub.enabled;
  }

  /**
   * Update last event timestamp and increment count
   */
  recordEvent(id: string): void {
    const sub = this.subscriptions.get(id);
    if (!sub) return;

    sub.lastEventAt = new Date().toISOString();
    sub.eventCount = (sub.eventCount || 0) + 1;

    // Don't auto-save on every event (too frequent)
    // User should call save() periodically or on shutdown
  }

  /**
   * Get subscriptions for a specific server
   */
  getByServer(serverUrl: string): StoredSubscription[] {
    return Array.from(this.subscriptions.values()).filter(
      (s) => s.serverUrl === serverUrl
    );
  }

  /**
   * Get subscriptions by delivery channel
   */
  getByChannel(channel: 'realtime' | 'cron' | 'scheduled'): StoredSubscription[] {
    return Array.from(this.subscriptions.values()).filter((s) =>
      s.delivery.channels.includes(channel)
    );
  }

  /**
   * Get subscriptions by handler type
   */
  getByHandlerType(type: 'webhook' | 'bash' | 'agent'): StoredSubscription[] {
    return Array.from(this.subscriptions.values()).filter(
      (s) => s.handler?.type === type
    );
  }

  /**
   * Remove expired subscriptions
   */
  cleanupExpired(): number {
    const now = new Date();
    let count = 0;

    for (const [id, sub] of this.subscriptions) {
      if (sub.expiresAt && new Date(sub.expiresAt) <= now) {
        this.subscriptions.delete(id);
        count++;
      }
    }

    if (count > 0 && this.autoSave) {
      this.save();
    }

    return count;
  }

  /**
   * Get subscription count
   */
  get size(): number {
    return this.subscriptions.size;
  }

  /**
   * Get enabled subscription count
   */
  get enabledCount(): number {
    return this.getEnabled().length;
  }

  /**
   * Set the default server URL
   */
  setDefaultServerUrl(url: string): void {
    this.defaultServerUrl = url;
    if (this.autoSave) this.save();
  }

  /**
   * Get the default server URL
   */
  getDefaultServerUrl(): string | undefined {
    return this.defaultServerUrl;
  }

  /**
   * Clear all subscriptions
   */
  clear(): void {
    this.subscriptions.clear();
    if (this.autoSave) this.save();
  }

  /**
   * Export to JSON string
   */
  toJSON(): string {
    const data: SubscriptionsFile = {
      version: '1.0',
      defaultServerUrl: this.defaultServerUrl,
      subscriptions: Array.from(this.subscriptions.values()),
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * Import from JSON string
   */
  fromJSON(json: string): void {
    const data: SubscriptionsFile = JSON.parse(json);
    this.defaultServerUrl = data.defaultServerUrl;
    this.subscriptions.clear();

    for (const sub of data.subscriptions) {
      this.subscriptions.set(sub.id, sub);
    }

    if (this.autoSave) this.save();
  }

  /**
   * Get file path
   */
  getFilePath(): string {
    return this.filePath;
  }
}
