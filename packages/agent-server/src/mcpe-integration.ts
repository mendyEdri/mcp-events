import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import {
  EventsClient,
  ClientScheduler,
  type EventFilter,
  type MCPEvent,
  type CronSchedule,
  type ScheduledDelivery,
  type DeliveryChannel,
  type LocalCronConfig,
  type LocalTimerConfig,
  type LocalBatchHandler,
  type AgentExecutor,
  type AgentEventHandler,
  type TaskCompleteCallback,
} from '@mcpe/core';

export interface MCPEConnectionOptions {
  url: string;
  clientName?: string;
  clientVersion?: string;
}

export interface SubscriptionInfo {
  id: string;
  filter: EventFilter;
  createdAt: Date;
  eventCount: number;
  deliveryChannel: DeliveryChannel;
  cronSchedule?: CronSchedule;
  scheduledDelivery?: ScheduledDelivery;
}

export class MCPEIntegration {
  private client: EventsClient | null = null;
  private subscriptions: Map<string, SubscriptionInfo> = new Map();
  private eventHandlers: Map<string, (event: MCPEvent) => void> = new Map();
  private connectionUrl: string | null = null;
  private unsubscribeHandlers: (() => void)[] = [];
  private localScheduler: ClientScheduler = new ClientScheduler();
  private localTaskCounter: number = 0;

  async connect(options: MCPEConnectionOptions): Promise<void> {
    if (this.client) {
      await this.disconnect();
    }

    this.client = new EventsClient({
      name: options.clientName ?? 'mcpe-agent-server',
      version: options.clientVersion ?? '1.0.0',
    });

    this.connectionUrl = options.url;

    // Create SSE transport for the MCP connection
    const transport = new SSEClientTransport(new URL(options.url));
    await this.client.connect(transport);
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      // Unsubscribe from all active subscriptions
      for (const [id] of this.subscriptions) {
        try {
          await this.client.unsubscribe(id);
        } catch {
          // Ignore errors during cleanup
        }
      }

      // Clean up event handlers
      for (const unsubscribe of this.unsubscribeHandlers) {
        unsubscribe();
      }

      await this.client.close();
      this.client = null;
      this.subscriptions.clear();
      this.eventHandlers.clear();
      this.unsubscribeHandlers = [];
      this.connectionUrl = null;
    }
  }

  isConnected(): boolean {
    return this.client !== null && this.client.supportsEvents();
  }

  getConnectionUrl(): string | null {
    return this.connectionUrl;
  }

  /**
   * Subscribe with real-time delivery
   */
  async subscribe(
    filter: EventFilter,
    onEvent?: (event: MCPEvent) => void
  ): Promise<SubscriptionInfo> {
    if (!this.client) {
      throw new Error('Not connected to MCPE server');
    }

    const result = await this.client.subscribe({
      filter,
      delivery: {
        channels: ['realtime'],
      },
    });

    const info: SubscriptionInfo = {
      id: result.subscriptionId,
      filter,
      createdAt: new Date(),
      eventCount: 0,
      deliveryChannel: 'realtime',
    };

    this.subscriptions.set(result.subscriptionId, info);

    // Set up event handler
    if (onEvent) {
      this.eventHandlers.set(result.subscriptionId, onEvent);

      // Register event listener with the client
      const unsubscribe = this.client.onEvent('*', (event, subscriptionId) => {
        if (subscriptionId === result.subscriptionId) {
          const subInfo = this.subscriptions.get(result.subscriptionId);
          if (subInfo) {
            subInfo.eventCount++;
          }
          const handler = this.eventHandlers.get(result.subscriptionId);
          if (handler) {
            handler(event);
          }
        }
      });
      this.unsubscribeHandlers.push(unsubscribe);
    }

    return info;
  }

  /**
   * Subscribe with cron-based recurring delivery
   */
  async subscribeWithCron(
    filter: EventFilter,
    cronSchedule: CronSchedule,
    onEvent?: (event: MCPEvent) => void
  ): Promise<SubscriptionInfo> {
    if (!this.client) {
      throw new Error('Not connected to MCPE server');
    }

    const result = await this.client.subscribe({
      filter,
      delivery: {
        channels: ['cron'],
        cronSchedule,
      },
    });

    const info: SubscriptionInfo = {
      id: result.subscriptionId,
      filter,
      createdAt: new Date(),
      eventCount: 0,
      deliveryChannel: 'cron',
      cronSchedule,
    };

    this.subscriptions.set(result.subscriptionId, info);

    // Set up batch handler for cron deliveries
    if (onEvent) {
      this.eventHandlers.set(result.subscriptionId, onEvent);

      const unsubscribe = this.client.onBatch((events, subscriptionId) => {
        if (subscriptionId === result.subscriptionId) {
          const subInfo = this.subscriptions.get(result.subscriptionId);
          if (subInfo) {
            subInfo.eventCount += events.length;
          }
          const handler = this.eventHandlers.get(result.subscriptionId);
          if (handler) {
            for (const event of events) {
              handler(event);
            }
          }
        }
      });
      this.unsubscribeHandlers.push(unsubscribe);
    }

    return info;
  }

  /**
   * Subscribe with one-time scheduled delivery
   */
  async subscribeScheduled(
    filter: EventFilter,
    scheduledDelivery: ScheduledDelivery,
    onEvent?: (event: MCPEvent) => void
  ): Promise<SubscriptionInfo> {
    if (!this.client) {
      throw new Error('Not connected to MCPE server');
    }

    const result = await this.client.subscribe({
      filter,
      delivery: {
        channels: ['scheduled'],
        scheduledDelivery,
      },
      expiresAt: scheduledDelivery.autoExpire ? scheduledDelivery.deliverAt : undefined,
    });

    const info: SubscriptionInfo = {
      id: result.subscriptionId,
      filter,
      createdAt: new Date(),
      eventCount: 0,
      deliveryChannel: 'scheduled',
      scheduledDelivery,
    };

    this.subscriptions.set(result.subscriptionId, info);

    // Set up batch handler for scheduled deliveries
    if (onEvent) {
      this.eventHandlers.set(result.subscriptionId, onEvent);

      const unsubscribe = this.client.onBatch((events, subscriptionId) => {
        if (subscriptionId === result.subscriptionId) {
          const subInfo = this.subscriptions.get(result.subscriptionId);
          if (subInfo) {
            subInfo.eventCount += events.length;
          }
          const handler = this.eventHandlers.get(result.subscriptionId);
          if (handler) {
            for (const event of events) {
              handler(event);
            }
          }
        }
      });
      this.unsubscribeHandlers.push(unsubscribe);
    }

    return info;
  }

  async unsubscribe(subscriptionId: string): Promise<boolean> {
    if (!this.client) {
      throw new Error('Not connected to MCPE server');
    }

    const success = await this.client.unsubscribe(subscriptionId);
    if (success) {
      this.subscriptions.delete(subscriptionId);
      this.eventHandlers.delete(subscriptionId);
    }
    return success;
  }

  async listSubscriptions(): Promise<SubscriptionInfo[]> {
    return Array.from(this.subscriptions.values());
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionInfo | undefined> {
    return this.subscriptions.get(subscriptionId);
  }

  /**
   * Subscribe with local cron scheduling (client-side)
   * Events are buffered locally and handler is called on the cron schedule
   */
  async subscribeWithLocalCron(
    filter: EventFilter,
    cronConfig: LocalCronConfig,
    handler: LocalBatchHandler
  ): Promise<SubscriptionInfo> {
    if (!this.client) {
      throw new Error('Not connected to MCPE server');
    }

    const result = await this.client.subscribeWithLocalCron(filter, cronConfig, handler);

    const info: SubscriptionInfo = {
      id: result.subscriptionId,
      filter,
      createdAt: new Date(),
      eventCount: 0,
      deliveryChannel: 'cron',
      cronSchedule: {
        expression: cronConfig.expression,
        timezone: cronConfig.timezone || 'UTC',
        aggregateEvents: true,
        maxEventsPerDelivery: cronConfig.maxEvents || 1000,
      },
    };

    this.subscriptions.set(result.subscriptionId, info);
    return info;
  }

  /**
   * Subscribe with local timer (client-side one-time delayed execution)
   * Events are buffered locally and handler is called after the delay
   */
  async subscribeWithLocalTimer(
    filter: EventFilter,
    timerConfig: LocalTimerConfig,
    handler: LocalBatchHandler
  ): Promise<SubscriptionInfo> {
    if (!this.client) {
      throw new Error('Not connected to MCPE server');
    }

    const result = await this.client.subscribeWithLocalTimer(filter, timerConfig, handler);

    const deliverAt = new Date(Date.now() + timerConfig.delayMs);

    const info: SubscriptionInfo = {
      id: result.subscriptionId,
      filter,
      createdAt: new Date(),
      eventCount: 0,
      deliveryChannel: 'scheduled',
      scheduledDelivery: {
        deliverAt: deliverAt.toISOString(),
        timezone: 'UTC',
        aggregateEvents: true,
        autoExpire: true,
      },
    };

    this.subscriptions.set(result.subscriptionId, info);
    return info;
  }

  /**
   * Schedule a delayed task (client-side)
   * Convenience method for "remind me in X minutes" type requests
   */
  async scheduleDelayedTask(
    task: string,
    delayMs: number,
    handler: (task: string, metadata: { scheduledAt: Date; deliveredAt: Date }) => void | Promise<void>
  ): Promise<{ subscriptionId: string; scheduledFor: Date }> {
    if (!this.client) {
      throw new Error('Not connected to MCPE server');
    }

    const result = await this.client.scheduleDelayedTask(task, delayMs, handler);

    const info: SubscriptionInfo = {
      id: result.subscriptionId,
      filter: { eventTypes: [`delayed.task.*`] },
      createdAt: new Date(),
      eventCount: 0,
      deliveryChannel: 'scheduled',
      scheduledDelivery: {
        deliverAt: result.scheduledFor.toISOString(),
        timezone: 'UTC',
        aggregateEvents: true,
        autoExpire: true,
      },
    };

    this.subscriptions.set(result.subscriptionId, info);
    return result;
  }

  /**
   * Get local scheduler info
   */
  getLocalSchedulerInfo(): {
    activeJobs: Array<{
      subscriptionId: string;
      type: 'cron' | 'timer';
      nextRun?: Date;
      pendingEvents: number;
    }>;
  } {
    // Combine client scheduler and local scheduler info
    const clientJobs = this.client?.getSchedulerInfo().activeJobs || [];
    const localJobs = this.localScheduler.getActiveJobs();
    return { activeJobs: [...clientJobs, ...localJobs] };
  }

  /**
   * Schedule a local delayed task (NO server connection required)
   * This is purely local - uses setTimeout to call the handler after the delay
   */
  scheduleLocalDelayedTask(
    task: string,
    delayMs: number,
    handler: (task: string, metadata: { scheduledAt: Date; deliveredAt: Date }) => void | Promise<void>
  ): { taskId: string; scheduledFor: Date } {
    const scheduledAt = new Date();
    const deliverAt = new Date(Date.now() + delayMs);
    const taskId = `local-task-${++this.localTaskCounter}`;

    // Use the local scheduler's timer functionality
    this.localScheduler.startTimer(taskId, { delayMs }, async (events) => {
      // The event we queued contains the task
      const event = events[0];
      if (event) {
        await handler(event.data.task as string, {
          scheduledAt,
          deliveredAt: new Date(),
        });
      }
    });

    // Queue a synthetic event with the task
    this.localScheduler.queueEvent(taskId, {
      id: taskId,
      type: 'local.delayed.task',
      data: { task },
      metadata: {
        priority: 'normal',
        timestamp: scheduledAt.toISOString(),
        tags: ['local-timer'],
      },
    });

    console.log(`[MCPEIntegration] Scheduled local task "${task}" for ${deliverAt.toISOString()}`);

    return {
      taskId,
      scheduledFor: deliverAt,
    };
  }

  /**
   * Register an agent executor for handling agent tasks
   * The executor is called when a scheduled agent task fires
   */
  registerAgentExecutor(executor: AgentExecutor): void {
    this.localScheduler.registerAgentExecutor(executor);
  }

  /**
   * Schedule an agent task with a callback (one-time delay)
   * When the timer fires, the registered agent executor processes the task
   * and the callback receives the result
   */
  scheduleAgentTask(options: {
    task: string;
    delayMs: number;
    handler: AgentEventHandler;
    onComplete: TaskCompleteCallback;
  }): { taskId: string; scheduledFor: Date } {
    return this.localScheduler.scheduleAgentTask(options);
  }

  /**
   * Schedule a recurring cron-based agent task
   * The agent executor is invoked fresh at each cron interval
   */
  scheduleCronAgentTask(options: {
    task: string;
    cronConfig: LocalCronConfig;
    handler: AgentEventHandler;
    onComplete: TaskCompleteCallback;
  }): { taskId: string; nextRun: Date | undefined } {
    return this.localScheduler.scheduleCronAgentTask(options);
  }

  /**
   * Stop a scheduled task (timer or cron)
   */
  stopScheduledTask(taskId: string): void {
    this.localScheduler.stop(taskId);
  }

  /**
   * Stop all scheduled tasks (timers and cron jobs)
   */
  stopAllScheduledTasks(): number {
    const jobs = this.localScheduler.getActiveJobs();
    let stoppedCount = 0;
    for (const job of jobs) {
      try {
        this.localScheduler.stop(job.subscriptionId);
        stoppedCount++;
      } catch {
        // Ignore errors during cleanup
      }
    }
    return stoppedCount;
  }
}

// Singleton instance for the agent server
let mcpeInstance: MCPEIntegration | null = null;

export function getMCPEInstance(): MCPEIntegration {
  if (!mcpeInstance) {
    mcpeInstance = new MCPEIntegration();
  }
  return mcpeInstance;
}
