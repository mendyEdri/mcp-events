import { generateText, tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { getMCPEInstance, type SubscriptionInfo } from './mcpe-integration.js';
import type { EventFilter, EventSource, ScheduledTaskResult } from '@mcpe/core';
import { getSubscriptionsJSON, formatSubscriptionsForDisplay, setSubscriptionEnabled } from './mcpe-config.js';

// Create OpenAI-compatible provider with custom base URL (Wix API)
const openai = createOpenAI({
  baseURL: process.env.OPENAI_BASE_URL ?? 'https://www.wixapis.com/openai/v1',
  apiKey: process.env.OPENAI_API_KEY,
});

// SSE clients waiting for delayed responses
type SSEClient = (data: ScheduledTaskResult) => void;
const sseClients: Set<SSEClient> = new Set();

export function addSSEClient(client: SSEClient): () => void {
  sseClients.add(client);
  return () => sseClients.delete(client);
}

function notifySSEClients(result: ScheduledTaskResult): void {
  console.log(`[SSE] Notifying ${sseClients.size} clients`);
  for (const client of sseClients) {
    client(result);
  }
}

// Register agent executor with the MCPE client
const mcpe = getMCPEInstance();
mcpe.registerAgentExecutor(async (task, config) => {
  console.log(`[AgentExecutor] Processing: ${task}`);

  const result = await generateText({
    model: openai(config.model || 'gpt-4o-mini'),
    system: config.systemPrompt || 'You are a helpful assistant.',
    prompt: config.instructions ? `${config.instructions}\n\n${task}` : task,
    maxTokens: config.maxTokens || 500,
  });

  return result.text;
});

const SYSTEM_PROMPT = `You are an intelligent event subscription agent for the MCPE (MCP Events) protocol.
Your role is to help users subscribe to events from various sources like GitHub, Gmail, Slack, etc.

You can answer questions about MCPE, explain how subscriptions work, and help users understand the protocol even without being connected to an EventHub.

When a user requests event subscriptions, you should:
1. Analyze their request to understand what events they want to receive
2. If not already connected, connect to the MCPE EventHub (requires MCPE_URL to be configured)
3. Create appropriate subscriptions based on their requirements
4. Provide clear feedback about what subscriptions were created

If subscription tools return an error about missing MCPE URL, explain to the user that they need to configure the MCPE_URL environment variable or provide an EventHub URL.

Available event sources: github, gmail, slack, custom

Example event types:
- GitHub: github.push, github.pull_request.opened, github.pull_request.merged, github.issue.opened, github.issue.closed
- Gmail: gmail.message.received, gmail.message.sent
- Slack: slack.message.posted, slack.reaction.added, slack.channel.created
- Custom: any custom event type

You can use wildcard patterns like "github.*" or "github.pull_request.*" to match multiple event types.

DELIVERY CHANNELS:
1. Real-time (websocket): Events delivered immediately as they occur
2. Cron (recurring schedule): Events collected and delivered on a schedule
   - Use for: "daily digest", "hourly summary", "weekly report", "every Monday at 9am"
   - Cron presets: @hourly, @daily, @weekly, @monthly
   - Custom cron: "0 9 * * *" (daily at 9am), "0 * * * *" (every hour), "0 9 * * 1" (Monday 9am)
3. Scheduled (one-time): Events collected and delivered at a specific time
   - Use for: "remind me in 4 hours", "next Sunday", "on January 15th"
   - Requires a specific datetime

When users ask for reminders, digests, summaries, or time-based delivery, use the appropriate channel:
- "daily digest" → use subscribeCron with @daily
- "remind me in X hours" → use subscribeScheduled with calculated datetime
- "every Monday" → use subscribeCron with "0 9 * * 1"
- Real-time notifications → use regular subscribe

DELAYED RESPONSES:
When users ask you to answer something "in X minutes", "after a delay", "later", etc., use the scheduleDelayedResponse tool:
- "answer this in 1 minute" → scheduleDelayedResponse with delayMinutes: 1
- "remind me in 5 minutes about X" → scheduleDelayedResponse with delayMinutes: 5
- "respond after 2 minutes with Y" → scheduleDelayedResponse with delayMinutes: 2

The delayed response will be processed by an AI agent at the scheduled time and the response will appear in the chat.

CONFIGURED SUBSCRIPTIONS (mcpe.json):
The server has pre-configured subscriptions defined in mcpe.json. These persist across server restarts.

Tools for managing configured subscriptions:
- getConfiguredSubscriptions: See all subscriptions in mcpe.json (name, handler type, filter, enabled status)
- toggleSubscription: Enable or disable a specific subscription by name
- disableAllSubscriptions: Disable all subscriptions at once

When a user asks:
- "what subscriptions do I have?" → use getConfiguredSubscriptions
- "disable error-analyzer" → use toggleSubscription with enabled=false
- "enable daily-briefing" → use toggleSubscription with enabled=true
- "unsubscribe from all" or "disable all" → use disableAllSubscriptions

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

        subscribe: tool({
          description: 'Subscribe to events with real-time delivery (immediate notifications)',
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
            if (!mcpeUrl) {
              return { error: 'No MCPE EventHub URL configured. Please set MCPE_URL environment variable or provide mcpeUrl in the request.' };
            }
            if (!mcpe.isConnected()) {
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
              deliveryChannel: 'websocket',
              message: `Created real-time subscription for ${formatFilter(filter)}`,
            };
          },
        }),

        subscribeCron: tool({
          description: 'Subscribe to events with recurring scheduled delivery (daily digest, weekly report, hourly summary, etc.)',
          parameters: z.object({
            sources: z.array(z.enum(['github', 'gmail', 'slack', 'custom'])).optional()
              .describe('Event sources to subscribe to'),
            eventTypes: z.array(z.string()).optional()
              .describe('Specific event types or patterns'),
            tags: z.array(z.string()).optional()
              .describe('Tags to filter events by'),
            priority: z.array(z.enum(['low', 'normal', 'high', 'critical'])).optional()
              .describe('Priority levels to filter by'),
            cronExpression: z.string()
              .describe('Cron expression or preset. Presets: @hourly, @daily, @weekly, @monthly. Custom: "0 9 * * *" (9am daily), "0 9 * * 1" (Monday 9am)'),
            timezone: z.string().default('UTC')
              .describe('IANA timezone (e.g., "America/New_York", "Europe/London")'),
            maxEventsPerDelivery: z.number().default(100).optional()
              .describe('Maximum events per delivery batch'),
          }),
          execute: async ({ sources, eventTypes, tags, priority, cronExpression, timezone, maxEventsPerDelivery }) => {
            if (!mcpeUrl) {
              return { error: 'No MCPE EventHub URL configured. Please set MCPE_URL environment variable or provide mcpeUrl in the request.' };
            }
            if (!mcpe.isConnected()) {
              await mcpe.connect({ url: mcpeUrl });
            }

            const filter: EventFilter = {};
            if (sources) filter.sources = sources as EventSource[];
            if (eventTypes) filter.eventTypes = eventTypes;
            if (tags) filter.tags = tags;
            if (priority) filter.priority = priority;

            const subscription = await mcpe.subscribeWithCron(filter, {
              expression: cronExpression,
              timezone: timezone || 'UTC',
              aggregateEvents: true,
              maxEventsPerDelivery: maxEventsPerDelivery || 100,
            });

            return {
              success: true,
              subscriptionId: subscription.id,
              filter: subscription.filter,
              deliveryChannel: 'cron',
              cronSchedule: {
                expression: cronExpression,
                timezone,
                humanReadable: formatCronExpression(cronExpression),
              },
              message: `Created recurring subscription for ${formatFilter(filter)}, delivering ${formatCronExpression(cronExpression)}`,
            };
          },
        }),

        subscribeScheduled: tool({
          description: 'Subscribe to events with one-time scheduled delivery (remind me in X hours, next Sunday, specific date)',
          parameters: z.object({
            sources: z.array(z.enum(['github', 'gmail', 'slack', 'custom'])).optional()
              .describe('Event sources to subscribe to'),
            eventTypes: z.array(z.string()).optional()
              .describe('Specific event types or patterns'),
            tags: z.array(z.string()).optional()
              .describe('Tags to filter events by'),
            priority: z.array(z.enum(['low', 'normal', 'high', 'critical'])).optional()
              .describe('Priority levels to filter by'),
            deliverAt: z.string()
              .describe('ISO 8601 datetime for delivery (e.g., "2025-01-15T14:00:00Z")'),
            timezone: z.string().default('UTC')
              .describe('IANA timezone'),
            description: z.string().optional()
              .describe('Human-readable description (e.g., "in 4 hours", "next Sunday")'),
            autoExpire: z.boolean().default(true).optional()
              .describe('Automatically expire subscription after delivery'),
          }),
          execute: async ({ sources, eventTypes, tags, priority, deliverAt, timezone, description, autoExpire }) => {
            if (!mcpeUrl) {
              return { error: 'No MCPE EventHub URL configured. Please set MCPE_URL environment variable or provide mcpeUrl in the request.' };
            }
            if (!mcpe.isConnected()) {
              await mcpe.connect({ url: mcpeUrl });
            }

            const filter: EventFilter = {};
            if (sources) filter.sources = sources as EventSource[];
            if (eventTypes) filter.eventTypes = eventTypes;
            if (tags) filter.tags = tags;
            if (priority) filter.priority = priority;

            const subscription = await mcpe.subscribeScheduled(filter, {
              deliverAt,
              timezone: timezone || 'UTC',
              description,
              aggregateEvents: true,
              autoExpire: autoExpire !== false,
            });

            return {
              success: true,
              subscriptionId: subscription.id,
              filter: subscription.filter,
              deliveryChannel: 'scheduled',
              scheduledDelivery: {
                deliverAt,
                timezone,
                description,
              },
              message: `Created scheduled subscription for ${formatFilter(filter)}, delivering at ${description || deliverAt}`,
            };
          },
        }),

        scheduleDelayedResponse: tool({
          description: 'Schedule a delayed AI response. Use when user asks you to answer something "in X minutes", "after Y minutes", or wants a delayed response. The AI will process the task at the scheduled time and send the response to ntfy.sh.',
          parameters: z.object({
            task: z.string()
              .describe('The task or question the AI should answer when the delay expires'),
            delayMinutes: z.number().min(0.1).max(60)
              .describe('Delay in minutes before the AI responds (0.1 to 60 minutes, i.e., 6 seconds to 60 minutes)'),
            instructions: z.string().optional()
              .describe('Additional instructions for how to answer (optional)'),
          }),
          execute: async ({ task, delayMinutes, instructions }) => {
            const delayMs = delayMinutes * 60 * 1000;

            // Schedule agent task - the registered agent executor will process it
            const result = mcpe.scheduleAgentTask({
              task,
              delayMs,
              handler: {
                type: 'agent',
                model: 'gpt-4o-mini',
                systemPrompt: 'You are a helpful AI assistant. The user asked you to respond after a delay. Now it is time to answer their question. Be helpful, concise, and provide a complete answer.',
                instructions,
                maxTokens: 500,
              },
              onComplete: (taskResult) => {
                console.log(`[Delayed Response] Completed: ${taskResult.response.substring(0, 100)}...`);
                // Notify all SSE clients
                notifySSEClients(taskResult);
              },
            });

            return {
              success: true,
              taskId: result.taskId,
              scheduledFor: result.scheduledFor.toISOString(),
              delayMinutes,
              message: `Scheduled AI response for "${task}" in ${delayMinutes} minute(s). The response will appear in the chat.`,
            };
          },
        }),

        listSubscriptions: tool({
          description: 'List all current active runtime subscriptions (created during this session)',
          parameters: z.object({}),
          execute: async () => {
            const subscriptions = await mcpe.listSubscriptions();
            return {
              count: subscriptions.length,
              subscriptions: subscriptions.map(s => ({
                id: s.id,
                filter: s.filter,
                deliveryChannel: s.deliveryChannel,
                eventCount: s.eventCount,
                createdAt: s.createdAt.toISOString(),
              })),
            };
          },
        }),

        getConfiguredSubscriptions: tool({
          description: 'Get all subscriptions configured in mcpe.json. Use this to see what event handlers are set up (agent, bash, webhook handlers). These are the persistent subscriptions that survive server restarts.',
          parameters: z.object({}),
          execute: async () => {
            const data = getSubscriptionsJSON();
            return {
              configPath: data.configPath,
              count: data.subscriptions.length,
              enabledCount: data.subscriptions.filter(s => s.enabled).length,
              subscriptions: data.subscriptions,
              summary: formatSubscriptionsForDisplay(),
            };
          },
        }),

        toggleSubscription: tool({
          description: 'Enable or disable a configured subscription from mcpe.json. Use this when user wants to turn on/off a subscription.',
          parameters: z.object({
            name: z.string().describe('The name of the subscription to toggle (e.g., "delayed-response", "error-analyzer")'),
            enabled: z.boolean().describe('True to enable, false to disable'),
          }),
          execute: async ({ name, enabled }) => {
            const success = setSubscriptionEnabled(name, enabled);
            if (success) {
              const data = getSubscriptionsJSON();
              return {
                success: true,
                message: `Subscription "${name}" is now ${enabled ? 'enabled' : 'disabled'}`,
                subscriptions: data.subscriptions,
              };
            } else {
              return {
                success: false,
                message: `Subscription "${name}" not found in mcpe.json`,
              };
            }
          },
        }),

        disableAllSubscriptions: tool({
          description: 'Disable all configured subscriptions. Use when user says "unsubscribe from all" or "disable all subscriptions".',
          parameters: z.object({}),
          execute: async () => {
            const data = getSubscriptionsJSON();
            let disabledCount = 0;
            for (const sub of data.subscriptions) {
              if (sub.enabled) {
                setSubscriptionEnabled(sub.name, false);
                disabledCount++;
              }
            }
            return {
              success: true,
              disabledCount,
              message: `Disabled ${disabledCount} subscription(s)`,
              subscriptions: getSubscriptionsJSON().subscriptions,
            };
          },
        }),

        unsubscribe: tool({
          description: 'Remove a runtime subscription by its ID (for subscriptions created during this session, not mcpe.json ones)',
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
        const toolName = toolResult.toolName;
        if ((toolName === 'subscribe' || toolName === 'subscribeCron' || toolName === 'subscribeScheduled') &&
            typeof toolResult.result === 'object' && toolResult.result !== null) {
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

function formatCronExpression(expression: string): string {
  const presets: Record<string, string> = {
    '@hourly': 'every hour',
    '@daily': 'daily at midnight',
    '@weekly': 'weekly on Sunday',
    '@monthly': 'monthly on the 1st',
  };

  if (presets[expression]) {
    return presets[expression];
  }

  // Try to parse common patterns
  const parts = expression.split(' ');
  if (parts.length === 5) {
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    // Every hour
    if (minute !== '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return `every hour at :${minute.padStart(2, '0')}`;
    }

    // Daily at specific time
    if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return `daily at ${hour}:${minute.padStart(2, '0')}`;
    }

    // Weekly on specific day
    if (dayOfWeek !== '*' && dayOfMonth === '*' && month === '*') {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = days[parseInt(dayOfWeek)] || dayOfWeek;
      if (hour !== '*') {
        return `every ${dayName} at ${hour}:${minute.padStart(2, '0')}`;
      }
      return `every ${dayName}`;
    }
  }

  return `on schedule: ${expression}`;
}
