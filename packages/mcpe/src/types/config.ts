import { z } from 'zod';
import { EventFilterSchema } from './events.js';
import { EventHandlerSchema, DeliveryPreferencesSchema } from './subscriptions.js';

/**
 * Subscription definition in mcpe.json
 */
export const SubscriptionConfigSchema = z.object({
  /** Unique name for this subscription */
  name: z.string().describe('Unique subscription name'),
  /** Optional description */
  description: z.string().optional(),
  /** Event filter */
  filter: EventFilterSchema,
  /** Delivery preferences */
  delivery: DeliveryPreferencesSchema.optional(),
  /** Event handler */
  handler: EventHandlerSchema,
  /** Whether this subscription is enabled */
  enabled: z.boolean().default(true),
});

export type SubscriptionConfig = z.infer<typeof SubscriptionConfigSchema>;

/**
 * MCPE configuration file schema (mcpe.json)
 *
 * @example
 * ```json
 * {
 *   "subscriptions": [
 *     {
 *       "name": "github-ci-failures",
 *       "description": "Alert on CI failures",
 *       "filter": {
 *         "sources": ["github"],
 *         "eventTypes": ["github.workflow_run.failed"]
 *       },
 *       "handler": {
 *         "type": "bash",
 *         "command": "notify-send",
 *         "args": ["CI Failed", "$MCPE_EVENT_DATA"]
 *       }
 *     },
 *     {
 *       "name": "slack-mentions",
 *       "description": "Have AI summarize Slack mentions",
 *       "filter": {
 *         "sources": ["slack"],
 *         "eventTypes": ["slack.message.mention"]
 *       },
 *       "handler": {
 *         "type": "agent",
 *         "systemPrompt": "Summarize this Slack mention and suggest a response",
 *         "model": "gpt-4"
 *       }
 *     }
 *   ]
 * }
 * ```
 */
export const MCPEConfigSchema = z.object({
  /** Config file version */
  version: z.string().default('1.0').describe('Config file version'),
  /** Default delivery preferences for all subscriptions */
  defaults: z.object({
    delivery: DeliveryPreferencesSchema.optional(),
    handler: EventHandlerSchema.optional(),
  }).optional(),
  /** Subscription definitions */
  subscriptions: z.array(SubscriptionConfigSchema).default([]),
});

export type MCPEConfig = z.infer<typeof MCPEConfigSchema>;

/**
 * Load and validate an MCPE config object
 */
export function parseMCPEConfig(config: unknown): MCPEConfig {
  return MCPEConfigSchema.parse(config);
}

/**
 * Validate an MCPE config without throwing
 */
export function validateMCPEConfig(config: unknown): { success: true; data: MCPEConfig } | { success: false; error: z.ZodError } {
  const result = MCPEConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
