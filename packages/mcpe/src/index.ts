// Types
export {
  // Event types
  EventSourceSchema,
  EventPrioritySchema,
  EventMetadataSchema,
  MCPEventSchema,
  EventFilterSchema,
  matchesFilter,
  createEvent,
  type EventSource,
  type EventPriority,
  type EventMetadata,
  type MCPEvent,
  type EventFilter,
  // Subscription types
  DeliveryChannelSchema,
  CronScheduleSchema,
  ScheduledDeliverySchema,
  DeliveryPreferencesSchema,
  SubscriptionStatusSchema,
  SubscriptionSchema,
  CreateSubscriptionRequestSchema,
  UpdateSubscriptionRequestSchema,
  type DeliveryChannel,
  type CronSchedule,
  type ScheduledDelivery,
  type DeliveryPreferences,
  type SubscriptionStatus,
  type Subscription,
  type CreateSubscriptionRequest,
  type UpdateSubscriptionRequest,
  // Capability types
  EventsFeaturesSchema,
  EventsCapabilitySchema,
  MCPE_NOTIFICATIONS,
  MCPE_TOOLS,
  DEFAULT_EVENTS_CAPABILITY,
  type EventsFeatures,
  type EventsCapability,
  type EventsServerOptions,
} from './types/index.js';

// Server
export {
  EventsServer,
  type EventsServerConfig,
} from './server/index.js';
export { SubscriptionManager } from './server/index.js';

// Client
export {
  EventsClient,
  type EventsClientConfig,
  type EventHandler,
  type BatchEventHandler,
  type SubscriptionExpiredHandler,
  type SubscribeResult,
  type ListSubscriptionsResult,
} from './client/index.js';

// Utils
export { matchesPattern, matchesAnyPattern } from './utils/index.js';
