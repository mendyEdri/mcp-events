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
  // Event handler types
  BashEventHandlerSchema,
  AgentEventHandlerSchema,
  WebhookEventHandlerSchema,
  EventHandlerSchema,
  type BashEventHandler,
  type AgentEventHandler,
  type WebhookEventHandler,
  type EventHandler,
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
  // Config types (mcpe.json)
  SubscriptionConfigSchema,
  MCPEConfigSchema,
  parseMCPEConfig,
  validateMCPEConfig,
  type SubscriptionConfig,
  type MCPEConfig,
} from './types/index.js';

// Server
export {
  EventsServer,
  type EventsServerConfig,
} from './server/index.js';
export { SubscriptionManager } from './server/index.js';
export {
  HandlerExecutor,
  type HandlerResult,
  type AgentHandlerCallback,
  type HandlerExecutorConfig,
} from './server/index.js';

// Client
export {
  EventsClient,
  type EventsClientConfig,
  type EventCallback,
  type BatchEventCallback,
  type SubscriptionExpiredCallback,
  type SubscribeResult,
  type ListSubscriptionsResult,
} from './client/index.js';

// Utils
export { matchesPattern, matchesAnyPattern } from './utils/index.js';
