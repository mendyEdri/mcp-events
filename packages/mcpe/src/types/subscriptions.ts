import { z } from 'zod';
import { EventFilterSchema } from './events.js';

/**
 * Event Handler - Open schema following MCP's tool pattern
 *
 * Handlers define how to process received events. Following the MCP pattern
 * of `tools/call` which uses `name` + `arguments`, handlers use `type` + `args`.
 *
 * This open schema allows:
 * - Built-in types: "bash", "agent", "webhook"
 * - Custom types: Any string, validated by the handler implementation
 * - Extensibility: New handler types without protocol changes
 *
 * Well-known handler types and their args:
 *
 * @example bash handler
 * ```json
 * {
 *   "type": "bash",
 *   "args": {
 *     "command": "notify-send",
 *     "args": ["Alert", "$MCPE_EVENT_TYPE"],
 *     "cwd": "/tmp",
 *     "env": { "DEBUG": "1" },
 *     "input": "stdin",
 *     "timeout": 30000
 *   }
 * }
 * ```
 *
 * @example agent handler
 * ```json
 * {
 *   "type": "agent",
 *   "args": {
 *     "systemPrompt": "Summarize this event...",
 *     "model": "claude-3",
 *     "tools": ["slack_reply", "create_task"],
 *     "maxTokens": 1000
 *   }
 * }
 * ```
 *
 * @example webhook handler
 * ```json
 * {
 *   "type": "webhook",
 *   "args": {
 *     "url": "https://api.example.com/events",
 *     "headers": { "Authorization": "Bearer token" },
 *     "timeout": 10000
 *   }
 * }
 * ```
 *
 * @example custom handler
 * ```json
 * {
 *   "type": "my-custom-handler",
 *   "args": { "whatever": "you-need" }
 * }
 * ```
 */
export const EventHandlerSchema = z.object({
  /** Handler type - built-in types: "bash", "agent", "webhook", or any custom type */
  type: z.string().describe('Handler type (e.g., "bash", "agent", "webhook", or custom)'),
  /** Handler-specific arguments - schema depends on handler type */
  args: z.record(z.unknown()).optional().describe('Handler-specific arguments'),
});

export type EventHandler = z.infer<typeof EventHandlerSchema>;

/**
 * Type guard and args extractors for well-known handler types
 */

/** Args for bash handler */
export interface BashHandlerArgs {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  input?: 'stdin' | 'env' | 'args';
  timeout?: number;
}

/** Args for agent handler */
export interface AgentHandlerArgs {
  systemPrompt?: string;
  model?: string;
  instructions?: string;
  tools?: string[];
  maxTokens?: number;
}

/** Args for webhook handler */
export interface WebhookHandlerArgs {
  url: string;
  headers?: Record<string, string>;
  timeout?: number;
}

/** Check if handler is a bash handler */
export function isBashHandler(handler: EventHandler): handler is EventHandler & { args: BashHandlerArgs } {
  return handler.type === 'bash';
}

/** Check if handler is an agent handler */
export function isAgentHandler(handler: EventHandler): handler is EventHandler & { args: AgentHandlerArgs } {
  return handler.type === 'agent';
}

/** Check if handler is a webhook handler */
export function isWebhookHandler(handler: EventHandler): handler is EventHandler & { args: WebhookHandlerArgs } {
  return handler.type === 'webhook';
}

// Legacy type aliases for backward compatibility
/** @deprecated Use EventHandler with type: "bash" */
export type BashEventHandler = EventHandler & { type: 'bash'; args: BashHandlerArgs };
/** @deprecated Use EventHandler with type: "agent" */
export type AgentEventHandler = EventHandler & { type: 'agent'; args: AgentHandlerArgs };
/** @deprecated Use EventHandler with type: "webhook" */
export type WebhookEventHandler = EventHandler & { type: 'webhook'; args: WebhookHandlerArgs };

// Legacy schema aliases (these now just re-export the main schema)
/** @deprecated Use EventHandlerSchema */
export const BashEventHandlerSchema = EventHandlerSchema;
/** @deprecated Use EventHandlerSchema */
export const AgentEventHandlerSchema = EventHandlerSchema;
/** @deprecated Use EventHandlerSchema */
export const WebhookEventHandlerSchema = EventHandlerSchema;

/**
 * Delivery channels for event notifications
 * - realtime: Immediate delivery via MCP notification
 * - cron: Recurring scheduled delivery (aggregated batch)
 * - scheduled: One-time scheduled delivery at specific time
 */
export const DeliveryChannelSchema = z.enum(['realtime', 'cron', 'scheduled']);

export type DeliveryChannel = z.infer<typeof DeliveryChannelSchema>;

/**
 * Cron Schedule Configuration
 * Used for recurring time-based delivery (e.g., "every hour", "daily at 9am")
 *
 * Supports standard cron expressions:
 * - "0 * * * *" = every hour
 * - "0 9 * * *" = daily at 9am
 * - "0 9 * * 1" = every Monday at 9am
 * - "0 0 1 * *" = first day of each month
 *
 * Also supports human-readable presets:
 * - "@hourly", "@daily", "@weekly", "@monthly"
 */
export const CronScheduleSchema = z.object({
  expression: z.string().describe('Cron expression or preset (@hourly, @daily, @weekly, @monthly)'),
  timezone: z.string().default('UTC').describe('IANA timezone (e.g., "America/New_York", "Europe/London")'),
  aggregateEvents: z.boolean().default(true).describe('Aggregate matching events and deliver as batch'),
  maxEventsPerDelivery: z.number().default(100).describe('Maximum events per delivery batch'),
});

export type CronSchedule = z.infer<typeof CronScheduleSchema>;

/**
 * Scheduled Delivery Configuration
 * Used for one-time delivery at a specific date/time
 *
 * Use cases:
 * - "Remind me in 4 hours"
 * - "Next Sunday at 10am"
 * - "On January 15, 2025 at 3pm"
 */
export const ScheduledDeliverySchema = z.object({
  deliverAt: z.string().datetime().describe('ISO 8601 datetime for delivery'),
  timezone: z.string().default('UTC').describe('IANA timezone for interpreting the time'),
  description: z.string().optional().describe('Human-readable description (e.g., "in 4 hours", "next Sunday")'),
  aggregateEvents: z.boolean().default(true).describe('Aggregate matching events until delivery time'),
  autoExpire: z.boolean().default(true).describe('Automatically expire subscription after delivery'),
});

export type ScheduledDelivery = z.infer<typeof ScheduledDeliverySchema>;

/**
 * Delivery preferences for a subscription
 */
export const DeliveryPreferencesSchema = z.object({
  channels: z.array(DeliveryChannelSchema),
  cronSchedule: CronScheduleSchema.optional().describe('Cron schedule for recurring delivery'),
  scheduledDelivery: ScheduledDeliverySchema.optional().describe('One-time scheduled delivery'),
});

export type DeliveryPreferences = z.infer<typeof DeliveryPreferencesSchema>;

/**
 * Subscription status
 */
export const SubscriptionStatusSchema = z.enum(['active', 'paused', 'expired']);

export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

/**
 * A subscription to events
 */
export const SubscriptionSchema = z.object({
  id: z.string().uuid(),
  clientId: z.string(),
  filter: EventFilterSchema,
  delivery: DeliveryPreferencesSchema,
  handler: EventHandlerSchema.optional().describe('How to process received events'),
  status: SubscriptionStatusSchema.default('active'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
});

export type Subscription = z.infer<typeof SubscriptionSchema>;

/**
 * Request to create a new subscription
 */
export const CreateSubscriptionRequestSchema = z.object({
  filter: EventFilterSchema,
  delivery: DeliveryPreferencesSchema,
  handler: EventHandlerSchema.optional().describe('How to process received events'),
  expiresAt: z.string().datetime().optional(),
});

export type CreateSubscriptionRequest = z.infer<typeof CreateSubscriptionRequestSchema>;

/**
 * Request to update an existing subscription
 */
export const UpdateSubscriptionRequestSchema = z.object({
  filter: EventFilterSchema.optional(),
  delivery: DeliveryPreferencesSchema.optional(),
  handler: EventHandlerSchema.optional().nullable().describe('Update or remove event handler'),
  status: SubscriptionStatusSchema.optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

export type UpdateSubscriptionRequest = z.infer<typeof UpdateSubscriptionRequestSchema>;
