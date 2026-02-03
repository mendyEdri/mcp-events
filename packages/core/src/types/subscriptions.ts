import { z } from 'zod';
import { EventFilterSchema } from './events.js';

// Base delivery channels (real-time)
export const DeliveryChannelSchema = z.enum(['websocket', 'sse', 'webpush', 'apns', 'cron', 'scheduled']);

export type DeliveryChannel = z.infer<typeof DeliveryChannelSchema>;

export const DeliveryPrioritySchema = z.enum(['realtime', 'normal', 'batch']);

export type DeliveryPriority = z.infer<typeof DeliveryPrioritySchema>;

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
  // Collect events during interval and deliver as batch
  aggregateEvents: z.boolean().default(true).describe('Aggregate matching events and deliver as batch'),
  // Maximum events to include in a single delivery
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
  // Absolute datetime for delivery
  deliverAt: z.string().datetime().describe('ISO 8601 datetime for delivery'),
  timezone: z.string().default('UTC').describe('IANA timezone for interpreting the time'),
  // Human-readable description of the schedule (for display)
  description: z.string().optional().describe('Human-readable description (e.g., "in 4 hours", "next Sunday")'),
  // Collect events until delivery time
  aggregateEvents: z.boolean().default(true).describe('Aggregate matching events until delivery time'),
  // Auto-delete subscription after delivery
  autoExpire: z.boolean().default(true).describe('Automatically expire subscription after delivery'),
});

export type ScheduledDelivery = z.infer<typeof ScheduledDeliverySchema>;

export const DeliveryPreferencesSchema = z.object({
  channels: z.array(DeliveryChannelSchema),
  priority: DeliveryPrioritySchema.default('normal'),
  batchInterval: z.number().optional(),
  apnsAlert: z.boolean().optional(),
  // Time-based delivery configuration
  cronSchedule: CronScheduleSchema.optional().describe('Cron schedule for recurring delivery'),
  scheduledDelivery: ScheduledDeliverySchema.optional().describe('One-time scheduled delivery'),
});

export type DeliveryPreferences = z.infer<typeof DeliveryPreferencesSchema>;

export const SubscriptionStatusSchema = z.enum(['active', 'paused', 'expired']);

export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

export const SubscriptionSchema = z.object({
  id: z.string().uuid(),
  clientId: z.string(),
  filter: EventFilterSchema,
  delivery: DeliveryPreferencesSchema,
  status: SubscriptionStatusSchema.default('active'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
});

export type Subscription = z.infer<typeof SubscriptionSchema>;

export const CreateSubscriptionRequestSchema = z.object({
  filter: EventFilterSchema,
  delivery: DeliveryPreferencesSchema,
  expiresAt: z.string().datetime().optional(),
});

export type CreateSubscriptionRequest = z.infer<typeof CreateSubscriptionRequestSchema>;

export const UpdateSubscriptionRequestSchema = z.object({
  filter: EventFilterSchema.optional(),
  delivery: DeliveryPreferencesSchema.optional(),
  status: SubscriptionStatusSchema.optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

export type UpdateSubscriptionRequest = z.infer<typeof UpdateSubscriptionRequestSchema>;
