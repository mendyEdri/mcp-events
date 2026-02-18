/**
 * ASP Subscription Tools for AI SDK
 *
 * These tools expose the Agent Subscription Protocol to AI agents,
 * allowing them to subscribe/unsubscribe to events based on natural language.
 *
 * Inspired by MCP's tool design - each tool has:
 * - name: Tool identifier
 * - description: LLM-readable description
 * - parameters: Zod schema for inputs
 * - execute: Function to run
 */

import { z } from 'zod';
import { tool } from 'ai';
import type { ASPClient } from '@esmcp/client';
import type { Subscription } from '@esmcp/core';

/**
 * Create ASP tools for use with AI SDK
 *
 * These tools give AI agents the ability to:
 * - Discover available event sources and capabilities
 * - Subscribe to events based on filters
 * - Unsubscribe when no longer needed
 * - Pause/resume subscriptions
 * - List current subscriptions
 */
export function createASPTools(client: ASPClient) {
  return {
    /**
     * Get available capabilities and event sources
     */
    asp_get_capabilities: tool({
      description:
        'Get the available event sources and subscription capabilities. Use this to understand what events you can subscribe to before creating a subscription.',
      parameters: z.object({}),
      execute: async () => {
        const capabilities = await client.getCapabilities();
        return {
          supportedSources: capabilities.filters.supportedSources,
          maxSubscriptions: capabilities.subscriptions.maxActive,
          supportsWildcards: capabilities.filters.supportsWildcardTypes,
          supportsPause: capabilities.subscriptions.supportsPause,
          deliveryChannels: capabilities.delivery.supportedChannels,
        };
      },
    }),

    /**
     * Subscribe to events
     */
    asp_subscribe: tool({
      description:
        'Subscribe to events from external systems like GitHub, Gmail, or Slack. You can filter by source, event type, priority, and tags. Use wildcards like "github.*" to match multiple event types.',
      parameters: z.object({
        sources: z
          .array(z.enum(['github', 'gmail', 'slack', 'custom']))
          .optional()
          .describe('Event sources to subscribe to (e.g., ["github", "slack"])'),
        eventTypes: z
          .array(z.string())
          .optional()
          .describe('Event types to match. Supports wildcards like "github.*" or "github.push"'),
        priority: z
          .array(z.enum(['low', 'normal', 'high', 'critical']))
          .optional()
          .describe('Only receive events with these priority levels'),
        tags: z.array(z.string()).optional().describe('Filter by event tags'),
        reason: z.string().describe('Why you are creating this subscription'),
      }),
      execute: async ({ sources, eventTypes, priority, tags, reason }) => {
        console.log(`[ASP Tool] Creating subscription: ${reason}`);

        const subscription = await client.subscribe({
          filter: {
            sources,
            eventTypes,
            priority,
            tags,
          },
          delivery: {
            channels: ['websocket'],
            priority: 'realtime',
          },
        });

        return {
          subscriptionId: subscription.id,
          status: subscription.status,
          filter: subscription.filter,
          message: `Successfully subscribed. You will now receive matching events.`,
        };
      },
    }),

    /**
     * Unsubscribe from events
     */
    asp_unsubscribe: tool({
      description:
        'Remove an active subscription. Use this when you no longer need to receive events for a particular subscription.',
      parameters: z.object({
        subscriptionId: z.string().describe('The ID of the subscription to remove'),
        reason: z.string().describe('Why you are unsubscribing'),
      }),
      execute: async ({ subscriptionId, reason }) => {
        console.log(`[ASP Tool] Unsubscribing: ${reason}`);

        const success = await client.unsubscribe(subscriptionId);

        return {
          success,
          message: success
            ? `Successfully unsubscribed from ${subscriptionId}`
            : `Failed to unsubscribe - subscription may not exist`,
        };
      },
    }),

    /**
     * List current subscriptions
     */
    asp_list_subscriptions: tool({
      description:
        'List all your current event subscriptions. Use this to see what events you are subscribed to.',
      parameters: z.object({
        status: z
          .enum(['active', 'paused', 'expired'])
          .optional()
          .describe('Filter by subscription status'),
      }),
      execute: async ({ status }) => {
        const subscriptions = await client.listSubscriptions(status);

        return {
          count: subscriptions.length,
          subscriptions: subscriptions.map((sub) => ({
            id: sub.id,
            status: sub.status,
            filter: sub.filter,
            createdAt: sub.createdAt,
          })),
        };
      },
    }),

    /**
     * Pause a subscription
     */
    asp_pause_subscription: tool({
      description:
        'Temporarily pause a subscription. Events will not be delivered while paused, but the subscription remains active and can be resumed later.',
      parameters: z.object({
        subscriptionId: z.string().describe('The ID of the subscription to pause'),
        reason: z.string().describe('Why you are pausing this subscription'),
      }),
      execute: async ({ subscriptionId, reason }) => {
        console.log(`[ASP Tool] Pausing subscription: ${reason}`);

        await client.pauseSubscription(subscriptionId);

        return {
          success: true,
          message: `Subscription ${subscriptionId} has been paused. No events will be delivered until resumed.`,
        };
      },
    }),

    /**
     * Resume a paused subscription
     */
    asp_resume_subscription: tool({
      description: 'Resume a paused subscription. Events will start being delivered again.',
      parameters: z.object({
        subscriptionId: z.string().describe('The ID of the subscription to resume'),
        reason: z.string().describe('Why you are resuming this subscription'),
      }),
      execute: async ({ subscriptionId, reason }) => {
        console.log(`[ASP Tool] Resuming subscription: ${reason}`);

        await client.resumeSubscription(subscriptionId);

        return {
          success: true,
          message: `Subscription ${subscriptionId} has been resumed. Events will be delivered again.`,
        };
      },
    }),
  };
}

/**
 * Event buffer for storing received events
 */
export class EventBuffer {
  private events: Array<{
    event: unknown;
    subscriptionId: string;
    receivedAt: Date;
  }> = [];
  private maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  add(event: unknown, subscriptionId: string): void {
    this.events.push({
      event,
      subscriptionId,
      receivedAt: new Date(),
    });

    // Keep only the most recent events
    if (this.events.length > this.maxSize) {
      this.events.shift();
    }
  }

  getRecent(count = 10): typeof this.events {
    return this.events.slice(-count);
  }

  clear(): void {
    this.events = [];
  }

  get length(): number {
    return this.events.length;
  }
}

/**
 * Create a tool to check received events
 */
export function createEventCheckTool(eventBuffer: EventBuffer) {
  return {
    asp_check_events: tool({
      description:
        'Check recent events that have been received. Use this to see what events have arrived since subscribing.',
      parameters: z.object({
        count: z.number().optional().default(10).describe('Number of recent events to retrieve'),
      }),
      execute: async ({ count }) => {
        const recent = eventBuffer.getRecent(count);

        return {
          totalBuffered: eventBuffer.length,
          events: recent.map((e) => ({
            ...e,
            receivedAt: e.receivedAt.toISOString(),
          })),
        };
      },
    }),
  };
}
