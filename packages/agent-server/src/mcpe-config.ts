import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseMCPEConfig, type MCPEConfig, type SubscriptionConfig, type ScheduledTaskResult } from '@mcpe/core';
import { getMCPEInstance } from './mcpe-integration.js';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let loadedConfig: MCPEConfig | null = null;
let configPath: string | null = null;

// Track active scheduler task IDs for each subscription
const activeSchedulerTasks: Map<string, string> = new Map();

/**
 * Load mcpe.json configuration
 */
export function loadMCPEConfig(path?: string): MCPEConfig {
  const searchPaths = path
    ? [path]
    : [
        join(process.cwd(), 'mcpe.json'),
        join(process.cwd(), 'packages/agent-server/mcpe.json'),
        join(__dirname, '..', 'mcpe.json'),
      ];

  for (const p of searchPaths) {
    if (existsSync(p)) {
      try {
        const content = readFileSync(p, 'utf-8');
        const parsed = JSON.parse(content);
        loadedConfig = parseMCPEConfig(parsed);
        configPath = p;
        console.log(`[MCPE Config] Loaded ${loadedConfig.subscriptions.length} subscriptions from ${p}`);
        return loadedConfig;
      } catch (error) {
        console.error(`[MCPE Config] Failed to load ${p}:`, error);
      }
    }
  }

  // Return empty config if no file found
  console.log('[MCPE Config] No mcpe.json found, using empty config');
  loadedConfig = { version: '1.0', subscriptions: [] };
  return loadedConfig;
}

/**
 * Get the loaded config (loads if not already loaded)
 */
export function getMCPEConfig(): MCPEConfig {
  if (!loadedConfig) {
    loadMCPEConfig();
  }
  return loadedConfig!;
}

/**
 * Get config file path
 */
export function getConfigPath(): string | null {
  return configPath;
}

/**
 * Get all subscriptions
 */
export function getSubscriptions(): SubscriptionConfig[] {
  return getMCPEConfig().subscriptions;
}

/**
 * Get enabled subscriptions only
 */
export function getEnabledSubscriptions(): SubscriptionConfig[] {
  return getMCPEConfig().subscriptions.filter((s) => s.enabled !== false);
}

/**
 * Get subscriptions by handler type
 */
export function getSubscriptionsByHandler(
  type: 'agent' | 'bash' | 'webhook'
): SubscriptionConfig[] {
  return getMCPEConfig().subscriptions.filter((s) => s.handler.type === type);
}

/**
 * Get a subscription by name
 */
export function getSubscriptionByName(name: string): SubscriptionConfig | undefined {
  return getMCPEConfig().subscriptions.find((s) => s.name === name);
}

/**
 * Format subscriptions for display (human-readable summary)
 */
export function formatSubscriptionsForDisplay(): string {
  const subs = getMCPEConfig().subscriptions;

  if (subs.length === 0) {
    return 'No subscriptions configured.';
  }

  const lines: string[] = ['Configured Subscriptions:', ''];

  for (const sub of subs) {
    const status = sub.enabled !== false ? 'enabled' : 'disabled';
    const handlerType = sub.handler.type;
    const filters = sub.filter.eventTypes?.join(', ') || 'all';

    lines.push(`- ${sub.name} [${status}]`);
    lines.push(`  Handler: ${handlerType}`);
    lines.push(`  Filter: ${filters}`);
    if (sub.description) {
      lines.push(`  Description: ${sub.description}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Get subscriptions as JSON for API response
 */
export function getSubscriptionsJSON(): {
  configPath: string | null;
  subscriptions: Array<{
    name: string;
    description?: string;
    enabled: boolean;
    handlerType: string;
    filter: {
      eventTypes?: string[];
      priority?: string[];
    };
    delivery?: {
      channels: string[];
      cronExpression?: string;
    };
  }>;
} {
  const config = getMCPEConfig();

  return {
    configPath,
    subscriptions: config.subscriptions.map((s) => ({
      name: s.name,
      description: s.description,
      enabled: s.enabled !== false,
      handlerType: s.handler.type,
      filter: {
        eventTypes: s.filter.eventTypes,
        priority: s.filter.priority,
      },
      delivery: s.delivery
        ? {
            channels: s.delivery.channels,
            cronExpression:
              s.delivery.cronSchedule?.expression,
          }
        : undefined,
    })),
  };
}

/**
 * Enable or disable a subscription by name
 */
export function setSubscriptionEnabled(name: string, enabled: boolean, onComplete?: (result: ScheduledTaskResult) => void): boolean {
  const config = getMCPEConfig();
  const sub = config.subscriptions.find((s) => s.name === name);
  if (!sub) return false;

  sub.enabled = enabled;

  // Start or stop scheduler based on enabled state
  if (enabled && onComplete && (sub.handler as any).schedule) {
    startSchedulerForSubscription(sub, onComplete);
  } else if (!enabled) {
    stopSchedulerForSubscription(name);
  }

  // Persist to file if we have a config path
  if (configPath) {
    try {
      const content = JSON.stringify(
        {
          version: config.version,
          defaults: (config as any).defaults,
          subscriptions: config.subscriptions,
        },
        null,
        2
      );
      writeFileSync(configPath, content);
      console.log(`[MCPE Config] Updated ${name} to enabled=${enabled}`);
    } catch (error) {
      console.error(`[MCPE Config] Failed to save config:`, error);
    }
  }

  return true;
}

/**
 * Delete a subscription by name
 */
export function deleteSubscription(name: string): boolean {
  const config = getMCPEConfig();
  const index = config.subscriptions.findIndex((s) => s.name === name);
  if (index === -1) {
    console.log(`[MCPE Config] Subscription not found: ${name}`);
    return false;
  }

  // Stop any active scheduler for this subscription
  stopSchedulerForSubscription(name);

  config.subscriptions.splice(index, 1);
  console.log(`[MCPE Config] Removed ${name} from memory, ${config.subscriptions.length} remaining`);

  // Persist to file if we have a config path
  if (configPath) {
    try {
      const content = JSON.stringify(
        {
          version: config.version,
          defaults: (config as any).defaults,
          subscriptions: config.subscriptions,
        },
        null,
        2
      );
      writeFileSync(configPath, content);
      console.log(`[MCPE Config] Deleted subscription: ${name}`);
    } catch (error) {
      console.error(`[MCPE Config] Failed to save config:`, error);
      return false;
    }
  }

  return true;
}

/**
 * Get enabled subscriptions only
 */
export function getEnabledSubscriptionsJSON(): typeof getSubscriptionsJSON extends () => infer R ? R : never {
  const data = getSubscriptionsJSON();
  return {
    ...data,
    subscriptions: data.subscriptions.filter((s) => s.enabled),
  };
}

/**
 * Add a new subscription (supports both event-based and scheduled/cron)
 */
export function addSubscription(subscription: {
  name: string;
  description?: string;
  eventTypes?: string[];
  handlerType?: 'agent' | 'bash' | 'webhook';
  systemPrompt?: string;
  maxTokens?: number;
  // For scheduled/cron subscriptions
  schedule?: {
    type: 'cron' | 'once';
    cronExpression?: string;  // For cron type
    delayMs?: number;         // For once type
  };
}, onComplete?: (result: ScheduledTaskResult) => void): { success: boolean; error?: string; taskId?: string } {
  const config = getMCPEConfig();

  // Check for duplicate name
  if (config.subscriptions.some(s => s.name === subscription.name)) {
    return { success: false, error: `Subscription "${subscription.name}" already exists` };
  }

  const newSub: SubscriptionConfig = {
    name: subscription.name,
    description: subscription.description,
    filter: {
      eventTypes: subscription.eventTypes || ['scheduled.reminder'],
    },
    handler: {
      type: 'agent' as const,
      model: 'gpt-4o-mini',
      systemPrompt: subscription.systemPrompt || 'Process this event and provide a helpful response.',
      maxTokens: subscription.maxTokens || 500,
    },
    enabled: true,
  };

  // Add schedule info to delivery if present
  if (subscription.schedule) {
    newSub.delivery = {
      channels: [subscription.schedule.type === 'cron' ? 'cron' : 'scheduled'],
      cronSchedule: subscription.schedule.cronExpression ? {
        expression: subscription.schedule.cronExpression,
        timezone: 'UTC',
        aggregateEvents: false,
        maxEventsPerDelivery: 1,
      } : undefined,
    };
    // Store schedule info in handler for reconstruction
    (newSub.handler as any).schedule = subscription.schedule;
  }

  config.subscriptions.push(newSub);
  console.log(`[MCPE Config] Added subscription: ${subscription.name}`);

  // Persist to file
  if (configPath) {
    try {
      const content = JSON.stringify(
        {
          version: config.version,
          defaults: (config as any).defaults,
          subscriptions: config.subscriptions,
        },
        null,
        2
      );
      writeFileSync(configPath, content);
      console.log(`[MCPE Config] Saved new subscription to file`);
    } catch (error) {
      console.error(`[MCPE Config] Failed to save config:`, error);
      return { success: false, error: 'Failed to save to file' };
    }
  }

  // Start scheduler if this is a scheduled subscription
  let taskId: string | undefined;
  if (subscription.schedule && onComplete) {
    taskId = startSchedulerForSubscription(newSub, onComplete);
  }

  return { success: true, taskId };
}

/**
 * Start a scheduler for a subscription (cron or one-time)
 */
export function startSchedulerForSubscription(
  sub: SubscriptionConfig,
  onComplete: (result: ScheduledTaskResult) => void
): string | undefined {
  const mcpe = getMCPEInstance();
  const handler = sub.handler as any;
  const schedule = handler.schedule;

  if (!schedule) return undefined;

  const task = `Generate a short, friendly reminder message about: ${sub.description || sub.name}. Keep it under 2 sentences.`;

  if (schedule.type === 'cron' && schedule.cronExpression) {
    const result = mcpe.scheduleCronAgentTask({
      task,
      cronConfig: {
        expression: schedule.cronExpression,
        timezone: 'UTC',
      },
      handler: {
        type: 'agent',
        model: handler.model || 'gpt-4o-mini',
        systemPrompt: handler.systemPrompt || 'You are a friendly reminder assistant. Do NOT ask questions - just deliver the reminder directly.',
        maxTokens: handler.maxTokens || 100,
      },
      onComplete,
    });
    activeSchedulerTasks.set(sub.name, result.taskId);
    console.log(`[MCPE Config] Started cron scheduler for ${sub.name}: ${result.taskId}`);
    return result.taskId;
  } else if (schedule.type === 'once' && schedule.delayMs) {
    const result = mcpe.scheduleAgentTask({
      task,
      delayMs: schedule.delayMs,
      handler: {
        type: 'agent',
        model: handler.model || 'gpt-4o-mini',
        systemPrompt: handler.systemPrompt || 'You are a friendly reminder assistant. Do NOT ask questions - just deliver the reminder directly.',
        maxTokens: handler.maxTokens || 100,
      },
      onComplete: (taskResult) => {
        onComplete(taskResult);
        // Remove from active tasks after one-time execution
        activeSchedulerTasks.delete(sub.name);
        // Optionally delete the subscription after one-time execution
        deleteSubscription(sub.name);
      },
    });
    activeSchedulerTasks.set(sub.name, result.taskId);
    console.log(`[MCPE Config] Started one-time scheduler for ${sub.name}: ${result.taskId}`);
    return result.taskId;
  }

  return undefined;
}

/**
 * Stop scheduler for a subscription
 */
export function stopSchedulerForSubscription(name: string): boolean {
  const taskId = activeSchedulerTasks.get(name);
  if (taskId) {
    const mcpe = getMCPEInstance();
    mcpe.stopScheduledTask(taskId);
    activeSchedulerTasks.delete(name);
    console.log(`[MCPE Config] Stopped scheduler for ${name}`);
    return true;
  }
  return false;
}

/**
 * Start all schedulers for enabled subscriptions (call on server start)
 */
export function startAllSchedulers(onComplete: (result: ScheduledTaskResult) => void): number {
  const config = getMCPEConfig();
  let startedCount = 0;

  for (const sub of config.subscriptions) {
    if (sub.enabled !== false && (sub.handler as any).schedule) {
      const taskId = startSchedulerForSubscription(sub, onComplete);
      if (taskId) startedCount++;
    }
  }

  console.log(`[MCPE Config] Started ${startedCount} schedulers from config`);
  return startedCount;
}

/**
 * Stop all active schedulers
 */
export function stopAllSchedulers(): number {
  const mcpe = getMCPEInstance();
  let stoppedCount = 0;

  for (const [name, taskId] of activeSchedulerTasks) {
    try {
      mcpe.stopScheduledTask(taskId);
      stoppedCount++;
      console.log(`[MCPE Config] Stopped scheduler: ${name}`);
    } catch {
      // Ignore errors
    }
  }
  activeSchedulerTasks.clear();

  return stoppedCount;
}

/**
 * Get active scheduler task IDs
 */
export function getActiveSchedulerTasks(): Map<string, string> {
  return new Map(activeSchedulerTasks);
}

/**
 * Get raw config object for editing
 */
export function getRawConfig(): object {
  const config = getMCPEConfig();
  return {
    version: config.version,
    defaults: (config as any).defaults,
    subscriptions: config.subscriptions,
  };
}

/**
 * Set raw config from JSON object
 */
export function setRawConfig(newConfig: any): { success: boolean; error?: string } {
  try {
    // Validate basic structure
    if (!newConfig.subscriptions || !Array.isArray(newConfig.subscriptions)) {
      return { success: false, error: 'Invalid config: subscriptions array required' };
    }

    // Parse and validate
    const parsed = parseMCPEConfig(newConfig);

    // Update in memory
    loadedConfig = parsed;

    // Save to file
    if (configPath) {
      const content = JSON.stringify(newConfig, null, 2);
      writeFileSync(configPath, content);
      console.log(`[MCPE Config] Saved raw config with ${parsed.subscriptions.length} subscriptions`);
    }

    return { success: true };
  } catch (error) {
    console.error(`[MCPE Config] Failed to set raw config:`, error);
    return { success: false, error: String(error) };
  }
}

// Auto-load on import
loadMCPEConfig();
