import { z } from 'zod';
import { EventFilterSchema } from './events.js';

/**
 * Bash command event handler
 * Executes a shell command when events are received.
 * Event data is passed via stdin as JSON or as environment variables.
 */
export const BashEventHandlerSchema = z.object({
  type: z.literal('bash'),
  command: z.string().describe('Shell command to execute'),
  args: z.array(z.string()).optional().describe('Command arguments'),
  cwd: z.string().optional().describe('Working directory'),
  env: z.record(z.string()).optional().describe('Additional environment variables'),
  /** How to pass event data to the command */
  input: z.enum(['stdin', 'env', 'args']).default('stdin').describe(
    'stdin: JSON via stdin, env: as MCPE_EVENT_* vars, args: as command arguments'
  ),
  /** Timeout in milliseconds */
  timeout: z.number().default(30000).describe('Command timeout in ms'),
});

export type BashEventHandler = z.infer<typeof BashEventHandlerSchema>;

/**
 * Agent event handler
 * Signals that an LLM agent should process the event.
 * The MCP client implementor is responsible for invoking the LLM.
 */
export const AgentEventHandlerSchema = z.object({
  type: z.literal('agent'),
  /** System prompt for the agent */
  systemPrompt: z.string().optional().describe('System prompt for the LLM agent'),
  /** Model to use (implementation-specific) */
  model: z.string().optional().describe('Model identifier (e.g., "gpt-4", "claude-3")'),
  /** Additional context or instructions */
  instructions: z.string().optional().describe('Additional instructions for handling this event'),
  /** Tools the agent should have access to */
  tools: z.array(z.string()).optional().describe('Tool names the agent can use'),
  /** Max tokens for response */
  maxTokens: z.number().optional().describe('Maximum tokens for agent response'),
});

export type AgentEventHandler = z.infer<typeof AgentEventHandlerSchema>;

/**
 * Webhook event handler
 * Posts event data to an HTTP endpoint
 */
export const WebhookEventHandlerSchema = z.object({
  type: z.literal('webhook'),
  url: z.string().url().describe('Webhook URL to POST events to'),
  headers: z.record(z.string()).optional().describe('Additional HTTP headers'),
  /** Timeout in milliseconds */
  timeout: z.number().default(10000).describe('Request timeout in ms'),
});

export type WebhookEventHandler = z.infer<typeof WebhookEventHandlerSchema>;

/**
 * Event handler - defines how to process received events
 */
export const EventHandlerSchema = z.discriminatedUnion('type', [
  BashEventHandlerSchema,
  AgentEventHandlerSchema,
  WebhookEventHandlerSchema,
]);

export type EventHandler = z.infer<typeof EventHandlerSchema>;

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
