import { generateText, tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { getMCPEInstance, type SubscriptionInfo } from './mcpe-integration.js';
import type { EventFilter, EventSource } from '@esmcp/core';

// Create OpenAI-compatible provider with custom base URL (Wix API)
const openai = createOpenAI({
  baseURL: process.env.OPENAI_BASE_URL ?? 'https://www.wixapis.com/openai/v1',
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are an intelligent event subscription agent for the MCPE (MCP Events) protocol.
Your role is to help users subscribe to events from various sources like GitHub, Gmail, Slack, etc.

When a user requests event subscriptions, you should:
1. Analyze their request to understand what events they want to receive
2. If not already connected, connect to the MCPE EventHub
3. Create appropriate subscriptions based on their requirements
4. Provide clear feedback about what subscriptions were created

Available event sources: github, gmail, slack, custom

Example event types:
- GitHub: github.push, github.pull_request.opened, github.pull_request.merged, github.issue.opened, github.issue.closed
- Gmail: gmail.message.received, gmail.message.sent
- Slack: slack.message.posted, slack.reaction.added, slack.channel.created
- Custom: any custom event type

You can use wildcard patterns like "github.*" or "github.pull_request.*" to match multiple event types.

Be helpful and provide clear explanations of what you're subscribing to.`;

export interface AgentRequest {
  userMessage: string;
  mcpeUrl?: string;
}

export interface AgentResponse {
  success: boolean;
  message: string;
  subscriptionId?: string;
  subscriptionInfo?: SubscriptionInfo;
  error?: string;
}

export async function runAgent(request: AgentRequest): Promise<AgentResponse> {
  const mcpe = getMCPEInstance();
  const mcpeUrl = request.mcpeUrl ?? process.env.MCPE_URL;

  if (!mcpeUrl) {
    return {
      success: false,
      message: 'No MCPE EventHub URL provided',
      error: 'MCPE_URL environment variable not set and no mcpeUrl provided in request',
    };
  }

  try {
    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: SYSTEM_PROMPT,
      prompt: request.userMessage,
      tools: {
        connectToEventHub: tool({
          description: 'Connect to an MCPE EventHub server to enable event subscriptions',
          parameters: z.object({
            url: z.string().describe('The WebSocket URL of the MCPE EventHub'),
          }),
          execute: async ({ url }) => {
            if (mcpe.isConnected()) {
              return { success: true, message: 'Already connected to EventHub', url: mcpe.getConnectionUrl() };
            }
            await mcpe.connect({ url });
            return { success: true, message: 'Connected to EventHub', url };
          },
        }),

        getServerCapabilities: tool({
          description: 'Get the capabilities of the connected MCPE EventHub server',
          parameters: z.object({}),
          execute: async () => {
            if (!mcpe.isConnected()) {
              return { error: 'Not connected to EventHub. Use connectToEventHub first.' };
            }
            const capabilities = mcpe.getServerCapabilities();
            return { capabilities };
          },
        }),

        subscribe: tool({
          description: 'Subscribe to events matching the specified filter criteria',
          parameters: z.object({
            sources: z.array(z.enum(['github', 'gmail', 'slack', 'custom'])).optional()
              .describe('Event sources to subscribe to'),
            eventTypes: z.array(z.string()).optional()
              .describe('Specific event types or patterns (e.g., "github.push", "github.pull_request.*")'),
            tags: z.array(z.string()).optional()
              .describe('Tags to filter events by'),
            priority: z.array(z.enum(['low', 'normal', 'high', 'critical'])).optional()
              .describe('Priority levels to filter by'),
          }),
          execute: async ({ sources, eventTypes, tags, priority }) => {
            if (!mcpe.isConnected()) {
              // Try to connect first
              await mcpe.connect({ url: mcpeUrl });
            }

            const filter: EventFilter = {};
            if (sources) filter.sources = sources as EventSource[];
            if (eventTypes) filter.eventTypes = eventTypes;
            if (tags) filter.tags = tags;
            if (priority) filter.priority = priority;

            const subscription = await mcpe.subscribe(filter, (event) => {
              console.log(`[Event Received] ${event.type}:`, event.data);
            });

            return {
              success: true,
              subscriptionId: subscription.id,
              filter: subscription.filter,
              message: `Created subscription for ${formatFilter(filter)}`,
            };
          },
        }),

        listSubscriptions: tool({
          description: 'List all current active subscriptions',
          parameters: z.object({}),
          execute: async () => {
            const subscriptions = await mcpe.listSubscriptions();
            return {
              count: subscriptions.length,
              subscriptions: subscriptions.map(s => ({
                id: s.id,
                filter: s.filter,
                eventCount: s.eventCount,
                createdAt: s.createdAt.toISOString(),
              })),
            };
          },
        }),

        unsubscribe: tool({
          description: 'Remove a subscription by its ID',
          parameters: z.object({
            subscriptionId: z.string().describe('The ID of the subscription to remove'),
          }),
          execute: async ({ subscriptionId }) => {
            const success = await mcpe.unsubscribe(subscriptionId);
            return { success, subscriptionId };
          },
        }),
      },
      maxSteps: 5,
    });

    // Extract subscription info from tool results if available
    let subscriptionId: string | undefined;
    let subscriptionInfo: SubscriptionInfo | undefined;

    for (const step of result.steps) {
      for (const toolResult of step.toolResults) {
        if (toolResult.toolName === 'subscribe' && typeof toolResult.result === 'object' && toolResult.result !== null) {
          const res = toolResult.result as { subscriptionId?: string };
          if (res.subscriptionId) {
            subscriptionId = res.subscriptionId;
            subscriptionInfo = await mcpe.getSubscription(subscriptionId);
          }
        }
      }
    }

    return {
      success: true,
      message: result.text,
      subscriptionId,
      subscriptionInfo,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: 'Failed to process request',
      error: errorMessage,
    };
  }
}

function formatFilter(filter: EventFilter): string {
  const parts: string[] = [];

  if (filter.sources?.length) {
    parts.push(`sources: [${filter.sources.join(', ')}]`);
  }
  if (filter.eventTypes?.length) {
    parts.push(`types: [${filter.eventTypes.join(', ')}]`);
  }
  if (filter.tags?.length) {
    parts.push(`tags: [${filter.tags.join(', ')}]`);
  }
  if (filter.priority?.length) {
    parts.push(`priority: [${filter.priority.join(', ')}]`);
  }

  return parts.length > 0 ? parts.join(', ') : 'all events';
}
