import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseMCPEConfig, type MCPEConfig, type SubscriptionConfig } from '@mcpe/core';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let loadedConfig: MCPEConfig | null = null;
let configPath: string | null = null;

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
    const filters = sub.filter.eventTypes?.join(', ') || sub.filter.sources?.join(', ') || 'all';

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
      sources?: string[];
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
        sources: s.filter.sources,
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
export function setSubscriptionEnabled(name: string, enabled: boolean): boolean {
  const config = getMCPEConfig();
  const sub = config.subscriptions.find((s) => s.name === name);
  if (!sub) return false;

  sub.enabled = enabled;

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
      const { writeFileSync } = require('fs');
      writeFileSync(configPath, content);
      console.log(`[MCPE Config] Updated ${name} to enabled=${enabled}`);
    } catch (error) {
      console.error(`[MCPE Config] Failed to save config:`, error);
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

// Auto-load on import
loadMCPEConfig();
