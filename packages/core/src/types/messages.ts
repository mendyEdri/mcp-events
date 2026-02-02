import { z } from 'zod';
import { ESMCPEventSchema } from './events.js';
import {
  SubscriptionSchema,
  CreateSubscriptionRequestSchema,
  UpdateSubscriptionRequestSchema,
} from './subscriptions.js';

export const PROTOCOL_VERSION = '2025-01-01';

export const ClientInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
});

export type ClientInfo = z.infer<typeof ClientInfoSchema>;

export const ServerInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
});

export type ServerInfo = z.infer<typeof ServerInfoSchema>;

export const ClientCapabilitiesSchema = z.object({
  websocket: z.boolean().optional(),
  apns: z.boolean().optional(),
});

export type ClientCapabilities = z.infer<typeof ClientCapabilitiesSchema>;

export const ServerCapabilitiesSchema = z.object({
  maxSubscriptions: z.number(),
  supportedProviders: z.array(z.string()),
});

export type ServerCapabilities = z.infer<typeof ServerCapabilitiesSchema>;

// Base JSON-RPC 2.0 types
export const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
});

export type JsonRpcRequest = z.infer<typeof JsonRpcRequestSchema>;

export const JsonRpcResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.number(),
      message: z.string(),
      data: z.unknown().optional(),
    })
    .optional(),
});

export type JsonRpcResponse = z.infer<typeof JsonRpcResponseSchema>;

export const JsonRpcNotificationSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
});

export type JsonRpcNotification = z.infer<typeof JsonRpcNotificationSchema>;

// Initialize
export const InitializeParamsSchema = z.object({
  protocolVersion: z.string(),
  clientInfo: ClientInfoSchema,
  capabilities: ClientCapabilitiesSchema.optional(),
});

export type InitializeParams = z.infer<typeof InitializeParamsSchema>;

export const InitializeResultSchema = z.object({
  protocolVersion: z.string(),
  serverInfo: ServerInfoSchema,
  capabilities: ServerCapabilitiesSchema,
});

export type InitializeResult = z.infer<typeof InitializeResultSchema>;

// Subscription methods
export const SubscriptionCreateParamsSchema = CreateSubscriptionRequestSchema;
export type SubscriptionCreateParams = z.infer<typeof SubscriptionCreateParamsSchema>;

export const SubscriptionCreateResultSchema = SubscriptionSchema;
export type SubscriptionCreateResult = z.infer<typeof SubscriptionCreateResultSchema>;

export const SubscriptionRemoveParamsSchema = z.object({
  subscriptionId: z.string().uuid(),
});
export type SubscriptionRemoveParams = z.infer<typeof SubscriptionRemoveParamsSchema>;

export const SubscriptionRemoveResultSchema = z.object({
  success: z.boolean(),
});
export type SubscriptionRemoveResult = z.infer<typeof SubscriptionRemoveResultSchema>;

export const SubscriptionListParamsSchema = z.object({
  status: z.string().optional(),
});
export type SubscriptionListParams = z.infer<typeof SubscriptionListParamsSchema>;

export const SubscriptionListResultSchema = z.object({
  subscriptions: z.array(SubscriptionSchema),
});
export type SubscriptionListResult = z.infer<typeof SubscriptionListResultSchema>;

export const SubscriptionUpdateParamsSchema = z.object({
  subscriptionId: z.string().uuid(),
  updates: UpdateSubscriptionRequestSchema,
});
export type SubscriptionUpdateParams = z.infer<typeof SubscriptionUpdateParamsSchema>;

export const SubscriptionUpdateResultSchema = SubscriptionSchema;
export type SubscriptionUpdateResult = z.infer<typeof SubscriptionUpdateResultSchema>;

// Event notifications
export const EventNotificationParamsSchema = z.object({
  event: ESMCPEventSchema,
  subscriptionId: z.string().uuid(),
});
export type EventNotificationParams = z.infer<typeof EventNotificationParamsSchema>;

export const EventAcknowledgeParamsSchema = z.object({
  eventId: z.string().uuid(),
  subscriptionId: z.string().uuid(),
});
export type EventAcknowledgeParams = z.infer<typeof EventAcknowledgeParamsSchema>;

export const EventAcknowledgeResultSchema = z.object({
  success: z.boolean(),
});
export type EventAcknowledgeResult = z.infer<typeof EventAcknowledgeResultSchema>;

// Device registration (APNS)
export const DeviceRegisterParamsSchema = z.object({
  token: z.string(),
  platform: z.enum(['ios', 'macos']),
  bundleId: z.string(),
});
export type DeviceRegisterParams = z.infer<typeof DeviceRegisterParamsSchema>;

export const DeviceRegisterResultSchema = z.object({
  deviceId: z.string().uuid(),
});
export type DeviceRegisterResult = z.infer<typeof DeviceRegisterResultSchema>;

export const DeviceInvalidateParamsSchema = z.object({
  deviceId: z.string().uuid(),
});
export type DeviceInvalidateParams = z.infer<typeof DeviceInvalidateParamsSchema>;

export const DeviceInvalidateResultSchema = z.object({
  success: z.boolean(),
});
export type DeviceInvalidateResult = z.infer<typeof DeviceInvalidateResultSchema>;

// Error codes
export const ErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  // Custom error codes
  NotInitialized: -32000,
  SubscriptionNotFound: -32001,
  SubscriptionLimitReached: -32002,
  DeviceNotFound: -32003,
  Unauthorized: -32004,
} as const;

export function createJsonRpcRequest(
  id: string | number,
  method: string,
  params?: Record<string, unknown>
): JsonRpcRequest {
  return {
    jsonrpc: '2.0',
    id,
    method,
    ...(params && { params }),
  };
}

export function createJsonRpcResponse(
  id: string | number,
  result: unknown
): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

export function createJsonRpcError(
  id: string | number,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data !== undefined && { data }),
    },
  };
}

export function createJsonRpcNotification(
  method: string,
  params?: Record<string, unknown>
): JsonRpcNotification {
  return {
    jsonrpc: '2.0',
    method,
    ...(params && { params }),
  };
}
