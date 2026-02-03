import { Cron } from 'croner';
import type { MCPEvent, Subscription, CronSchedule, ScheduledDelivery } from '../types/index.js';

/**
 * Callback to deliver a batch of events
 */
export type BatchDeliveryCallback = (
  subscriptionId: string,
  events: MCPEvent[],
  subscription: Subscription
) => Promise<void>;

/**
 * Callback when a scheduled delivery completes (for auto-expire)
 */
export type ScheduleCompleteCallback = (subscriptionId: string) => void;

/**
 * Configuration for the EventScheduler
 */
export interface EventSchedulerConfig {
  /** Callback to deliver batched events */
  onDeliverBatch: BatchDeliveryCallback;
  /** Callback when scheduled delivery completes */
  onScheduleComplete?: ScheduleCompleteCallback;
  /** Maximum events to keep in memory per subscription (default: 1000) */
  maxEventsPerSubscription?: number;
}

/**
 * Scheduled job info
 */
interface ScheduledJob {
  subscription: Subscription;
  cronJob?: Cron;
  timer?: NodeJS.Timeout;
  nextRun?: Date;
}

/**
 * EventScheduler - Manages cron and scheduled event delivery
 *
 * Handles two delivery modes:
 * - **cron**: Recurring delivery based on cron expression (e.g., "0 9 * * *" = daily at 9am)
 * - **scheduled**: One-time delivery at a specific date/time
 *
 * Events are queued in memory and delivered as batches when the schedule triggers.
 *
 * @example
 * ```typescript
 * const scheduler = new EventScheduler({
 *   onDeliverBatch: async (subscriptionId, events, subscription) => {
 *     // Send batch notification or execute handler
 *     await server.sendBatch(events, subscriptionId);
 *   },
 *   onScheduleComplete: (subscriptionId) => {
 *     // Mark subscription as expired if autoExpire
 *   },
 * });
 *
 * // Start scheduling for a subscription
 * scheduler.startSubscription(subscription);
 *
 * // Queue events as they come in
 * scheduler.queueEvent(subscription.id, event);
 * ```
 */
export class EventScheduler {
  private jobs: Map<string, ScheduledJob> = new Map();
  private pendingEvents: Map<string, MCPEvent[]> = new Map();
  private config: Required<EventSchedulerConfig>;

  constructor(config: EventSchedulerConfig) {
    this.config = {
      maxEventsPerSubscription: 1000,
      onScheduleComplete: () => {},
      ...config,
    };
  }

  /**
   * Start scheduling for a subscription
   */
  startSubscription(subscription: Subscription): void {
    // Stop existing job if any
    this.stopSubscription(subscription.id);

    const { delivery } = subscription;

    // Handle cron delivery
    if (delivery.channels.includes('cron') && delivery.cronSchedule) {
      this.startCronJob(subscription, delivery.cronSchedule);
    }

    // Handle scheduled delivery
    if (delivery.channels.includes('scheduled') && delivery.scheduledDelivery) {
      this.startScheduledDelivery(subscription, delivery.scheduledDelivery);
    }
  }

  /**
   * Start a cron job for recurring delivery
   */
  private startCronJob(subscription: Subscription, schedule: CronSchedule): void {
    const { expression, timezone } = schedule;

    try {
      const cronJob = new Cron(expression, { timezone: timezone || 'UTC' }, async () => {
        await this.deliverPendingEvents(subscription);
      });

      const job: ScheduledJob = {
        subscription,
        cronJob,
        nextRun: cronJob.nextRun() || undefined,
      };

      this.jobs.set(subscription.id, job);

      console.log(
        `[EventScheduler] Started cron job for subscription ${subscription.id}: "${expression}" (${timezone || 'UTC'})`
      );
      console.log(`[EventScheduler] Next run: ${job.nextRun?.toISOString()}`);
    } catch (error) {
      console.error(`[EventScheduler] Failed to start cron job for ${subscription.id}:`, error);
    }
  }

  /**
   * Start a one-time scheduled delivery
   */
  private startScheduledDelivery(subscription: Subscription, schedule: ScheduledDelivery): void {
    const deliverAt = new Date(schedule.deliverAt);
    const now = new Date();
    const delay = deliverAt.getTime() - now.getTime();

    if (delay <= 0) {
      console.log(`[EventScheduler] Scheduled time already passed for ${subscription.id}, delivering now`);
      this.deliverPendingEvents(subscription).then(() => {
        if (schedule.autoExpire !== false) {
          this.config.onScheduleComplete(subscription.id);
        }
      });
      return;
    }

    const timer = setTimeout(async () => {
      await this.deliverPendingEvents(subscription);

      // Clean up
      this.jobs.delete(subscription.id);
      this.pendingEvents.delete(subscription.id);

      // Notify completion for auto-expire
      if (schedule.autoExpire !== false) {
        this.config.onScheduleComplete(subscription.id);
      }
    }, delay);

    const job: ScheduledJob = {
      subscription,
      timer,
      nextRun: deliverAt,
    };

    this.jobs.set(subscription.id, job);

    console.log(
      `[EventScheduler] Scheduled one-time delivery for subscription ${subscription.id}: ${deliverAt.toISOString()}`
    );
  }

  /**
   * Queue an event for later delivery
   */
  queueEvent(subscriptionId: string, event: MCPEvent): void {
    const job = this.jobs.get(subscriptionId);
    if (!job) {
      console.warn(`[EventScheduler] No active job for subscription ${subscriptionId}`);
      return;
    }

    const events = this.pendingEvents.get(subscriptionId) || [];
    const maxEvents =
      job.subscription.delivery.cronSchedule?.maxEventsPerDelivery ||
      this.config.maxEventsPerSubscription;

    if (events.length >= maxEvents) {
      console.warn(
        `[EventScheduler] Max events (${maxEvents}) reached for subscription ${subscriptionId}, dropping oldest`
      );
      events.shift(); // Remove oldest event
    }

    events.push(event);
    this.pendingEvents.set(subscriptionId, events);

    console.log(
      `[EventScheduler] Queued event for ${subscriptionId}, total pending: ${events.length}`
    );
  }

  /**
   * Deliver all pending events for a subscription
   */
  private async deliverPendingEvents(subscription: Subscription): Promise<void> {
    const events = this.pendingEvents.get(subscription.id) || [];

    if (events.length === 0) {
      console.log(`[EventScheduler] No pending events for ${subscription.id}`);
      return;
    }

    console.log(
      `[EventScheduler] Delivering ${events.length} events for subscription ${subscription.id}`
    );

    try {
      await this.config.onDeliverBatch(subscription.id, [...events], subscription);

      // Clear delivered events
      this.pendingEvents.set(subscription.id, []);
    } catch (error) {
      console.error(`[EventScheduler] Failed to deliver batch for ${subscription.id}:`, error);
    }
  }

  /**
   * Stop scheduling for a subscription
   */
  stopSubscription(subscriptionId: string): void {
    const job = this.jobs.get(subscriptionId);
    if (!job) return;

    if (job.cronJob) {
      job.cronJob.stop();
    }

    if (job.timer) {
      clearTimeout(job.timer);
    }

    this.jobs.delete(subscriptionId);
    console.log(`[EventScheduler] Stopped job for subscription ${subscriptionId}`);
  }

  /**
   * Get pending event count for a subscription
   */
  getPendingCount(subscriptionId: string): number {
    return this.pendingEvents.get(subscriptionId)?.length || 0;
  }

  /**
   * Get next scheduled run time for a subscription
   */
  getNextRun(subscriptionId: string): Date | undefined {
    const job = this.jobs.get(subscriptionId);
    if (!job) return undefined;

    // Update next run for cron jobs
    if (job.cronJob) {
      return job.cronJob.nextRun() || undefined;
    }

    return job.nextRun;
  }

  /**
   * Get all active job info
   */
  getActiveJobs(): Array<{
    subscriptionId: string;
    type: 'cron' | 'scheduled';
    nextRun?: Date;
    pendingEvents: number;
  }> {
    const result: Array<{
      subscriptionId: string;
      type: 'cron' | 'scheduled';
      nextRun?: Date;
      pendingEvents: number;
    }> = [];

    for (const [id, job] of this.jobs) {
      result.push({
        subscriptionId: id,
        type: job.cronJob ? 'cron' : 'scheduled',
        nextRun: this.getNextRun(id),
        pendingEvents: this.getPendingCount(id),
      });
    }

    return result;
  }

  /**
   * Force deliver pending events (useful for testing or shutdown)
   */
  async flushAll(): Promise<void> {
    for (const [_id, job] of this.jobs) {
      await this.deliverPendingEvents(job.subscription);
    }
  }

  /**
   * Stop all jobs
   */
  stopAll(): void {
    for (const id of this.jobs.keys()) {
      this.stopSubscription(id);
    }
    this.pendingEvents.clear();
  }
}
