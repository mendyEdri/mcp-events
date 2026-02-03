import { Cron } from 'croner';
import type { MCPEvent, AgentEventHandler } from '../types/index.js';

/**
 * Handler function for processing batched events
 */
export type LocalBatchHandler = (events: MCPEvent[]) => void | Promise<void>;

/**
 * Agent handler function - user provides implementation (e.g., calls OpenAI)
 */
export type AgentExecutor = (
  task: string,
  config: AgentEventHandler
) => Promise<string>;

/**
 * Result from a scheduled task
 */
export interface ScheduledTaskResult {
  taskId: string;
  task: string;
  response: string;
  scheduledAt: Date;
  deliveredAt: Date;
}

/**
 * Callback when a scheduled task completes
 */
export type TaskCompleteCallback = (result: ScheduledTaskResult) => void | Promise<void>;

/**
 * Configuration for a local cron job
 */
export interface LocalCronConfig {
  /** Cron expression (e.g., "0 9 * * *" for daily at 9am) */
  expression: string;
  /** IANA timezone (default: UTC) */
  timezone?: string;
  /** Maximum events to buffer (default: 1000) */
  maxEvents?: number;
}

/**
 * Configuration for a local timer (one-time delayed execution)
 */
export interface LocalTimerConfig {
  /** Delay in milliseconds */
  delayMs: number;
  /** Maximum events to buffer (default: 1000) */
  maxEvents?: number;
}

/**
 * Scheduled job info
 */
interface ScheduledJob {
  type: 'cron' | 'timer';
  subscriptionId: string;
  handler: LocalBatchHandler;
  cronJob?: Cron;
  timer?: NodeJS.Timeout;
  nextRun?: Date;
  config: LocalCronConfig | LocalTimerConfig;
}

/**
 * ClientScheduler - Client-side cron and timer scheduling for events
 *
 * Buffers incoming events and processes them on a schedule locally.
 * Handlers run in the client process, not on the server.
 *
 * @example
 * ```typescript
 * const scheduler = new ClientScheduler();
 *
 * // Start a cron job
 * scheduler.startCron('sub-123', {
 *   expression: '0 9 * * *',
 *   timezone: 'America/New_York',
 * }, (events) => {
 *   console.log('Daily digest:', events);
 * });
 *
 * // Queue events as they arrive
 * scheduler.queueEvent('sub-123', event);
 *
 * // Start a timer (one-time delayed execution)
 * scheduler.startTimer('sub-456', {
 *   delayMs: 60000,
 * }, (events) => {
 *   console.log('Delayed processing:', events);
 * });
 * ```
 */
export class ClientScheduler {
  private jobs: Map<string, ScheduledJob> = new Map();
  private pendingEvents: Map<string, MCPEvent[]> = new Map();
  private maxEventsDefault: number;
  private agentExecutor: AgentExecutor | null = null;
  private taskCounter: number = 0;

  constructor(options: { maxEventsDefault?: number } = {}) {
    this.maxEventsDefault = options.maxEventsDefault ?? 1000;
  }

  /**
   * Register an agent executor function
   * This is called when a scheduled task with handler type 'agent' fires
   */
  registerAgentExecutor(executor: AgentExecutor): void {
    this.agentExecutor = executor;
  }

  /**
   * Schedule a task with an agent handler
   * When the timer fires, the agent executor is called with the task
   */
  scheduleAgentTask(options: {
    task: string;
    delayMs: number;
    handler: AgentEventHandler;
    onComplete: TaskCompleteCallback;
  }): { taskId: string; scheduledFor: Date } {
    if (!this.agentExecutor) {
      throw new Error('No agent executor registered. Call registerAgentExecutor first.');
    }

    const taskId = `agent-task-${++this.taskCounter}`;
    const scheduledAt = new Date();
    const deliverAt = new Date(Date.now() + options.delayMs);
    const executor = this.agentExecutor;

    const timer = setTimeout(async () => {
      const deliveredAt = new Date();
      console.log(`[ClientScheduler] Executing agent task: ${options.task}`);

      try {
        const response = await executor(options.task, options.handler);

        await options.onComplete({
          taskId,
          task: options.task,
          response,
          scheduledAt,
          deliveredAt,
        });
      } catch (error) {
        console.error(`[ClientScheduler] Agent task error:`, error);
        await options.onComplete({
          taskId,
          task: options.task,
          response: `Error: ${error instanceof Error ? error.message : String(error)}`,
          scheduledAt,
          deliveredAt,
        });
      }

      // Clean up
      this.jobs.delete(taskId);
    }, options.delayMs);

    const job: ScheduledJob = {
      type: 'timer',
      subscriptionId: taskId,
      handler: async () => {}, // Not used for agent tasks
      timer,
      nextRun: deliverAt,
      config: { delayMs: options.delayMs },
    };

    this.jobs.set(taskId, job);

    console.log(
      `[ClientScheduler] Scheduled agent task "${options.task}" for ${deliverAt.toISOString()}`
    );

    return { taskId, scheduledFor: deliverAt };
  }

  /**
   * Schedule a recurring cron-based agent task
   * The agent executor is called fresh at each cron interval
   */
  scheduleCronAgentTask(options: {
    task: string;
    cronConfig: LocalCronConfig;
    handler: AgentEventHandler;
    onComplete: TaskCompleteCallback;
  }): { taskId: string; nextRun: Date | undefined } {
    if (!this.agentExecutor) {
      throw new Error('No agent executor registered. Call registerAgentExecutor first.');
    }

    const taskId = `agent-cron-${++this.taskCounter}`;
    const executor = this.agentExecutor;
    const { expression, timezone } = options.cronConfig;

    const cronJob = new Cron(expression, { timezone: timezone || 'UTC' }, async () => {
      const scheduledAt = new Date();
      console.log(`[ClientScheduler] Cron firing - executing agent task: ${options.task}`);

      try {
        const response = await executor(options.task, options.handler);
        const deliveredAt = new Date();

        await options.onComplete({
          taskId,
          task: options.task,
          response,
          scheduledAt,
          deliveredAt,
        });
      } catch (error) {
        console.error(`[ClientScheduler] Cron agent task error:`, error);
        await options.onComplete({
          taskId,
          task: options.task,
          response: `Error: ${error instanceof Error ? error.message : String(error)}`,
          scheduledAt,
          deliveredAt: new Date(),
        });
      }
    });

    const nextRun = cronJob.nextRun() || undefined;

    const job: ScheduledJob = {
      type: 'cron',
      subscriptionId: taskId,
      handler: async () => {}, // Not used for agent tasks
      cronJob,
      nextRun,
      config: options.cronConfig,
    };

    this.jobs.set(taskId, job);

    console.log(
      `[ClientScheduler] Scheduled cron agent task "${options.task}" with expression "${expression}" (${timezone || 'UTC'})`
    );
    console.log(`[ClientScheduler] Next run: ${nextRun?.toISOString()}`);

    return { taskId, nextRun };
  }

  /**
   * Start a cron job for recurring event processing
   */
  startCron(
    subscriptionId: string,
    config: LocalCronConfig,
    handler: LocalBatchHandler
  ): void {
    // Stop existing job if any
    this.stop(subscriptionId);

    const { expression, timezone } = config;

    try {
      const cronJob = new Cron(expression, { timezone: timezone || 'UTC' }, async () => {
        await this.deliverEvents(subscriptionId);
      });

      const job: ScheduledJob = {
        type: 'cron',
        subscriptionId,
        handler,
        cronJob,
        nextRun: cronJob.nextRun() || undefined,
        config,
      };

      this.jobs.set(subscriptionId, job);
      this.pendingEvents.set(subscriptionId, []);

      console.log(
        `[ClientScheduler] Started cron for ${subscriptionId}: "${expression}" (${timezone || 'UTC'})`
      );
      console.log(`[ClientScheduler] Next run: ${job.nextRun?.toISOString()}`);
    } catch (error) {
      console.error(`[ClientScheduler] Failed to start cron for ${subscriptionId}:`, error);
      throw error;
    }
  }

  /**
   * Start a timer for one-time delayed event processing
   */
  startTimer(
    subscriptionId: string,
    config: LocalTimerConfig,
    handler: LocalBatchHandler
  ): void {
    // Stop existing job if any
    this.stop(subscriptionId);

    const { delayMs } = config;
    const deliverAt = new Date(Date.now() + delayMs);

    const timer = setTimeout(async () => {
      await this.deliverEvents(subscriptionId);
      // Clean up after one-time execution
      this.jobs.delete(subscriptionId);
      this.pendingEvents.delete(subscriptionId);
    }, delayMs);

    const job: ScheduledJob = {
      type: 'timer',
      subscriptionId,
      handler,
      timer,
      nextRun: deliverAt,
      config,
    };

    this.jobs.set(subscriptionId, job);
    this.pendingEvents.set(subscriptionId, []);

    console.log(
      `[ClientScheduler] Started timer for ${subscriptionId}: ${delayMs}ms (delivers at ${deliverAt.toISOString()})`
    );
  }

  /**
   * Queue an event for later processing
   */
  queueEvent(subscriptionId: string, event: MCPEvent): void {
    const job = this.jobs.get(subscriptionId);
    if (!job) {
      console.warn(`[ClientScheduler] No active job for subscription ${subscriptionId}`);
      return;
    }

    const events = this.pendingEvents.get(subscriptionId) || [];
    const maxEvents = (job.config as LocalCronConfig).maxEvents ?? this.maxEventsDefault;

    if (events.length >= maxEvents) {
      console.warn(
        `[ClientScheduler] Max events (${maxEvents}) reached for ${subscriptionId}, dropping oldest`
      );
      events.shift();
    }

    events.push(event);
    this.pendingEvents.set(subscriptionId, events);

    console.log(
      `[ClientScheduler] Queued event for ${subscriptionId}, total pending: ${events.length}`
    );
  }

  /**
   * Deliver all pending events to the handler
   */
  private async deliverEvents(subscriptionId: string): Promise<void> {
    const job = this.jobs.get(subscriptionId);
    if (!job) return;

    const events = this.pendingEvents.get(subscriptionId) || [];

    if (events.length === 0) {
      console.log(`[ClientScheduler] No pending events for ${subscriptionId}`);
      return;
    }

    console.log(
      `[ClientScheduler] Delivering ${events.length} events for ${subscriptionId}`
    );

    try {
      await job.handler([...events]);
      // Clear delivered events
      this.pendingEvents.set(subscriptionId, []);
    } catch (error) {
      console.error(`[ClientScheduler] Handler error for ${subscriptionId}:`, error);
    }
  }

  /**
   * Stop a scheduled job
   */
  stop(subscriptionId: string): void {
    const job = this.jobs.get(subscriptionId);
    if (!job) return;

    if (job.cronJob) {
      job.cronJob.stop();
    }

    if (job.timer) {
      clearTimeout(job.timer);
    }

    this.jobs.delete(subscriptionId);
    this.pendingEvents.delete(subscriptionId);
    console.log(`[ClientScheduler] Stopped job for ${subscriptionId}`);
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

    if (job.cronJob) {
      return job.cronJob.nextRun() || undefined;
    }

    return job.nextRun;
  }

  /**
   * Get all active jobs
   */
  getActiveJobs(): Array<{
    subscriptionId: string;
    type: 'cron' | 'timer';
    nextRun?: Date;
    pendingEvents: number;
  }> {
    const result: Array<{
      subscriptionId: string;
      type: 'cron' | 'timer';
      nextRun?: Date;
      pendingEvents: number;
    }> = [];

    for (const [id, job] of this.jobs) {
      result.push({
        subscriptionId: id,
        type: job.type,
        nextRun: this.getNextRun(id),
        pendingEvents: this.getPendingCount(id),
      });
    }

    return result;
  }

  /**
   * Check if a job exists
   */
  hasJob(subscriptionId: string): boolean {
    return this.jobs.has(subscriptionId);
  }

  /**
   * Force deliver pending events immediately (useful for testing or shutdown)
   */
  async flush(subscriptionId: string): Promise<void> {
    await this.deliverEvents(subscriptionId);
  }

  /**
   * Flush all pending events
   */
  async flushAll(): Promise<void> {
    for (const id of this.jobs.keys()) {
      await this.deliverEvents(id);
    }
  }

  /**
   * Stop all jobs
   */
  stopAll(): void {
    for (const id of this.jobs.keys()) {
      this.stop(id);
    }
  }
}
