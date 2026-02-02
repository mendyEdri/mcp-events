import { z } from 'zod';
import { EventFilterSchema } from './events.js';

export const DeliveryChannelSchema = z.enum(['websocket', 'sse', 'webpush', 'apns']);

export type DeliveryChannel = z.infer<typeof DeliveryChannelSchema>;

export const DeliveryPrioritySchema = z.enum(['realtime', 'normal', 'batch']);

export type DeliveryPriority = z.infer<typeof DeliveryPrioritySchema>;

export const DeliveryPreferencesSchema = z.object({
  channels: z.array(DeliveryChannelSchema),
  priority: DeliveryPrioritySchema.default('normal'),
  batchInterval: z.number().optional(),
  apnsAlert: z.boolean().optional(),
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
