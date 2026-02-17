import { z } from 'zod';
import { DeliveryChannelSchema } from './subscriptions.js';

/**
 * Events capability features
 */
export const EventsFeaturesSchema = z.object({
  pause: z.boolean().default(true).describe('Supports pausing subscriptions'),
  wildcards: z.boolean().default(true).describe('Supports wildcard patterns in event types'),
  cronSchedule: z.boolean().default(true).describe('Supports cron-based scheduled delivery'),
  scheduledDelivery: z.boolean().default(true).describe('Supports one-time scheduled delivery'),
});

export type EventsFeatures = z.infer<typeof EventsFeaturesSchema>;

/**
 * Events capability - advertised by servers that support MCPE
 */
export const EventsCapabilitySchema = z.object({
  maxSubscriptions: z.number().default(100).describe('Maximum subscriptions per client'),
  deliveryChannels: z.array(DeliveryChannelSchema).default(['realtime']).describe('Supported delivery channels'),
  features: EventsFeaturesSchema.default({}).describe('Optional feature flags'),
});

export type EventsCapability = z.infer<typeof EventsCapabilitySchema>;

/**
 * Configuration options for EventsServer
 */
export interface EventsServerOptions {
  maxSubscriptions?: number;
  deliveryChannels?: string[];
  features?: Partial<EventsFeatures>;
}

/**
 * MCP notification names used by MCPE
 */
export const MCPE_NOTIFICATIONS = {
  /** Single event delivery */
  EVENT: 'events/event',
  /** Batch event delivery (for cron/scheduled) */
  BATCH: 'events/batch',
  /** Subscription expired notification */
  SUBSCRIPTION_EXPIRED: 'events/subscription_expired',
} as const;

/**
 * MCP tool names registered by MCPE
 */
export const MCPE_TOOLS = {
  SUBSCRIBE: 'events_subscribe',
  UNSUBSCRIBE: 'events_unsubscribe',
  LIST: 'events_list',
  PAUSE: 'events_pause',
  RESUME: 'events_resume',
  UPDATE: 'events_update',
} as const;

/**
 * Default events capability configuration
 */
export const DEFAULT_EVENTS_CAPABILITY: EventsCapability = {
  maxSubscriptions: 100,
  deliveryChannels: ['realtime', 'cron', 'scheduled'],
  features: {
    pause: true,
    wildcards: true,
    cronSchedule: true,
    scheduledDelivery: true,
  },
};
