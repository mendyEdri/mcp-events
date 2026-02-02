import { z } from 'zod';
import { DeliveryChannelSchema, DeliveryPrioritySchema } from './subscriptions.js';

/**
 * Agent Subscription Protocol (ASP) Specification
 *
 * ASP is an open protocol that enables AI agents to subscribe to and receive
 * events from external systems. Inspired by MCP (Model Context Protocol),
 * ASP gives agents control over their event subscriptions.
 *
 * Design Principles:
 * 1. Agent-Centric: Agents decide when to subscribe/unsubscribe
 * 2. Transport-Agnostic: Single protocol, multiple transport options
 * 3. Capability Discovery: Agents can introspect available features
 * 4. Schema-Driven: LLM-friendly schemas for reasoning about subscriptions
 */

// Protocol version following semver-like date format
export const ASP_PROTOCOL_VERSION = '2025-01-01';

// Protocol name for identification
export const ASP_PROTOCOL_NAME = 'asp';

/**
 * Protocol Methods
 *
 * All methods follow the pattern: category/action
 * - initialize: Connection handshake
 * - subscriptions/*: Subscription management
 * - events/*: Event handling
 * - devices/*: Push notification device management
 */
export const ASPMethods = {
  // Core protocol
  Initialize: 'initialize',

  // Capability & Schema Discovery (agent-facing)
  GetCapabilities: 'asp/capabilities',
  GetSchema: 'asp/schema',

  // Subscription Management
  SubscriptionCreate: 'subscriptions/create',
  SubscriptionRemove: 'subscriptions/remove',
  SubscriptionList: 'subscriptions/list',
  SubscriptionUpdate: 'subscriptions/update',
  SubscriptionPause: 'subscriptions/pause',
  SubscriptionResume: 'subscriptions/resume',

  // Event Operations
  EventAcknowledge: 'events/acknowledge',

  // Notifications (server -> client)
  NotificationEvent: 'notifications/event',
  NotificationSubscriptionExpired: 'notifications/subscription_expired',

  // Device Management (for push notifications)
  DeviceRegister: 'devices/register',
  DeviceInvalidate: 'devices/invalidate',
} as const;

export type ASPMethod = (typeof ASPMethods)[keyof typeof ASPMethods];

/**
 * Capability Discovery Schema
 *
 * Allows agents to discover what subscription features are available.
 * Similar to MCP's tool listing, this enables LLMs to reason about
 * what they can subscribe to.
 */
export const ASPCapabilitiesSchema = z.object({
  // Protocol info
  protocolVersion: z.string(),
  protocolName: z.literal('asp'),

  // Server info
  serverInfo: z.object({
    name: z.string(),
    version: z.string(),
  }),

  // Subscription capabilities
  subscriptions: z.object({
    maxActive: z.number().describe('Maximum number of active subscriptions per client'),
    maxFiltersPerSubscription: z.number().describe('Maximum filter rules per subscription'),
    supportsPause: z.boolean().describe('Whether subscriptions can be paused/resumed'),
    supportsExpiration: z.boolean().describe('Whether subscriptions can have expiration times'),
    supportsBatching: z.boolean().describe('Whether events can be batched'),
  }),

  // Filter capabilities
  filters: z.object({
    supportedSources: z.array(z.string()).describe('Available event sources (e.g., github, slack)'),
    supportsWildcardTypes: z.boolean().describe('Whether event type wildcards (e.g., github.*) are supported'),
    supportsTagFiltering: z.boolean().describe('Whether filtering by tags is supported'),
    supportsPriorityFiltering: z.boolean().describe('Whether filtering by priority is supported'),
  }),

  // Delivery capabilities
  delivery: z.object({
    supportedChannels: z.array(DeliveryChannelSchema).describe('Available delivery channels'),
    supportedPriorities: z.array(DeliveryPrioritySchema).describe('Available delivery priorities'),
    supportsMultiChannel: z.boolean().describe('Whether multiple channels per subscription are supported'),
  }),

  // Push notification support
  push: z.object({
    apnsEnabled: z.boolean().describe('Whether Apple Push Notifications are available'),
    webPushEnabled: z.boolean().describe('Whether Web Push notifications are available'),
  }).optional(),
});

export type ASPCapabilities = z.infer<typeof ASPCapabilitiesSchema>;

/**
 * Schema Discovery
 *
 * Provides JSON Schema definitions for subscription operations.
 * This enables LLMs to understand the structure of subscribe/unsubscribe calls.
 */
export const ASPOperationSchema = z.object({
  name: z.string().describe('Operation name'),
  description: z.string().describe('Human-readable description for LLM reasoning'),
  method: z.string().describe('JSON-RPC method name'),
  inputSchema: z.record(z.unknown()).describe('JSON Schema for input parameters'),
  outputSchema: z.record(z.unknown()).describe('JSON Schema for response'),
  examples: z.array(z.object({
    description: z.string(),
    input: z.record(z.unknown()),
    output: z.record(z.unknown()),
  })).optional().describe('Example inputs and outputs'),
});

export type ASPOperation = z.infer<typeof ASPOperationSchema>;

export const ASPSchemaResponseSchema = z.object({
  operations: z.array(ASPOperationSchema),
});

export type ASPSchemaResponse = z.infer<typeof ASPSchemaResponseSchema>;

/**
 * Pre-defined operation schemas for agent consumption
 * These are the "tools" that agents can use to manage their subscriptions
 */
export const ASPOperationDefinitions: ASPOperation[] = [
  {
    name: 'subscribe',
    description: 'Subscribe to events matching specified criteria. Use this when you want to be notified about specific events from external systems like GitHub, Slack, or email.',
    method: ASPMethods.SubscriptionCreate,
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'object',
          description: 'Criteria for which events to receive',
          properties: {
            sources: {
              type: 'array',
              items: { type: 'string', enum: ['github', 'gmail', 'slack', 'custom'] },
              description: 'Event sources to subscribe to',
            },
            eventTypes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Event types to match. Supports wildcards like "github.*"',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by event tags',
            },
            priority: {
              type: 'array',
              items: { type: 'string', enum: ['low', 'normal', 'high', 'critical'] },
              description: 'Filter by event priority',
            },
          },
        },
        delivery: {
          type: 'object',
          description: 'How events should be delivered',
          properties: {
            channels: {
              type: 'array',
              items: { type: 'string', enum: ['websocket', 'sse', 'webpush', 'apns'] },
              description: 'Delivery channels in order of preference',
            },
            priority: {
              type: 'string',
              enum: ['realtime', 'normal', 'batch'],
              description: 'Delivery priority',
            },
            batchInterval: {
              type: 'number',
              description: 'Batch interval in milliseconds (for batch priority)',
            },
          },
          required: ['channels'],
        },
        expiresAt: {
          type: 'string',
          format: 'date-time',
          description: 'Optional expiration time for the subscription',
        },
      },
      required: ['filter', 'delivery'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Subscription ID' },
        status: { type: 'string', enum: ['active', 'paused', 'expired'] },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
    examples: [
      {
        description: 'Subscribe to all GitHub push events',
        input: {
          filter: { sources: ['github'], eventTypes: ['github.push'] },
          delivery: { channels: ['websocket'], priority: 'realtime' },
        },
        output: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          status: 'active',
          createdAt: '2025-01-15T10:30:00Z',
        },
      },
      {
        description: 'Subscribe to high-priority Slack messages with batching',
        input: {
          filter: { sources: ['slack'], priority: ['high', 'critical'] },
          delivery: { channels: ['websocket'], priority: 'batch', batchInterval: 60000 },
        },
        output: {
          id: '550e8400-e29b-41d4-a716-446655440001',
          status: 'active',
          createdAt: '2025-01-15T10:31:00Z',
        },
      },
    ],
  },
  {
    name: 'unsubscribe',
    description: 'Remove an active subscription. Use this when you no longer need to receive events for a particular subscription.',
    method: ASPMethods.SubscriptionRemove,
    inputSchema: {
      type: 'object',
      properties: {
        subscriptionId: {
          type: 'string',
          format: 'uuid',
          description: 'ID of the subscription to remove',
        },
      },
      required: ['subscriptionId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
    examples: [
      {
        description: 'Unsubscribe from a subscription',
        input: { subscriptionId: '550e8400-e29b-41d4-a716-446655440000' },
        output: { success: true },
      },
    ],
  },
  {
    name: 'listSubscriptions',
    description: 'List all active subscriptions. Use this to see what events you are currently subscribed to.',
    method: ASPMethods.SubscriptionList,
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['active', 'paused', 'expired'],
          description: 'Filter by subscription status',
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        subscriptions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              filter: { type: 'object' },
              delivery: { type: 'object' },
              status: { type: 'string' },
              createdAt: { type: 'string' },
            },
          },
        },
      },
    },
  },
  {
    name: 'updateSubscription',
    description: 'Modify an existing subscription. Use this to change filter criteria or delivery preferences without creating a new subscription.',
    method: ASPMethods.SubscriptionUpdate,
    inputSchema: {
      type: 'object',
      properties: {
        subscriptionId: {
          type: 'string',
          format: 'uuid',
          description: 'ID of the subscription to update',
        },
        updates: {
          type: 'object',
          properties: {
            filter: { type: 'object', description: 'New filter criteria' },
            delivery: { type: 'object', description: 'New delivery preferences' },
            status: { type: 'string', enum: ['active', 'paused'] },
            expiresAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
      },
      required: ['subscriptionId', 'updates'],
    },
    outputSchema: {
      type: 'object',
      description: 'The updated subscription object',
    },
  },
  {
    name: 'pauseSubscription',
    description: 'Temporarily pause a subscription. Events will not be delivered until resumed.',
    method: ASPMethods.SubscriptionPause,
    inputSchema: {
      type: 'object',
      properties: {
        subscriptionId: {
          type: 'string',
          format: 'uuid',
          description: 'ID of the subscription to pause',
        },
      },
      required: ['subscriptionId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        status: { type: 'string', enum: ['paused'] },
      },
    },
  },
  {
    name: 'resumeSubscription',
    description: 'Resume a paused subscription. Events will start being delivered again.',
    method: ASPMethods.SubscriptionResume,
    inputSchema: {
      type: 'object',
      properties: {
        subscriptionId: {
          type: 'string',
          format: 'uuid',
          description: 'ID of the subscription to resume',
        },
      },
      required: ['subscriptionId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        status: { type: 'string', enum: ['active'] },
      },
    },
  },
  {
    name: 'acknowledgeEvent',
    description: 'Acknowledge receipt of an event. Some delivery modes require acknowledgment to prevent redelivery.',
    method: ASPMethods.EventAcknowledge,
    inputSchema: {
      type: 'object',
      properties: {
        eventId: {
          type: 'string',
          format: 'uuid',
          description: 'ID of the event to acknowledge',
        },
        subscriptionId: {
          type: 'string',
          format: 'uuid',
          description: 'ID of the subscription that received the event',
        },
      },
      required: ['eventId', 'subscriptionId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  },
];

/**
 * Default server capabilities
 */
export const defaultASPCapabilities: ASPCapabilities = {
  protocolVersion: ASP_PROTOCOL_VERSION,
  protocolName: 'asp',
  serverInfo: {
    name: 'ASP Server',
    version: '1.0.0',
  },
  subscriptions: {
    maxActive: 100,
    maxFiltersPerSubscription: 10,
    supportsPause: true,
    supportsExpiration: true,
    supportsBatching: true,
  },
  filters: {
    supportedSources: ['github', 'gmail', 'slack', 'custom'],
    supportsWildcardTypes: true,
    supportsTagFiltering: true,
    supportsPriorityFiltering: true,
  },
  delivery: {
    supportedChannels: ['websocket', 'sse', 'webpush', 'apns'],
    supportedPriorities: ['realtime', 'normal', 'batch'],
    supportsMultiChannel: true,
  },
  push: {
    apnsEnabled: false,
    webPushEnabled: false,
  },
};

/**
 * Transport types supported by ASP
 * Unlike MCP which primarily uses stdio, ASP supports multiple transports
 * for different use cases (real-time, firewall-friendly, offline)
 */
export const ASPTransportTypes = {
  WebSocket: 'websocket',
  SSE: 'sse',
  Stdio: 'stdio',
} as const;

export type ASPTransportType = (typeof ASPTransportTypes)[keyof typeof ASPTransportTypes];

/**
 * Event handler registration
 * Allows agents to register handlers for specific event patterns
 */
export const EventHandlerPatternSchema = z.object({
  pattern: z.string().describe('Event type pattern (supports wildcards like "github.*")'),
  handler: z.string().describe('Handler identifier'),
});

export type EventHandlerPattern = z.infer<typeof EventHandlerPatternSchema>;
