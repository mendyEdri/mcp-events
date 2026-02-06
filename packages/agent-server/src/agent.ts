import { generateText, tool, type Tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
import { Experimental_StdioMCPTransport as StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';
import { z } from 'zod';
import { getMCPEInstance, type SubscriptionInfo } from './mcpe-integration.js';
import type { EventFilter, EventSource, ScheduledTaskResult } from '@mcpe/core';
import { getSubscriptionsJSON, formatSubscriptionsForDisplay, setSubscriptionEnabled, addSubscription, deleteSubscription, stopAllSchedulers } from './mcpe-config.js';
import { listMCPServers } from './mcp-config.js';
import { getAllIntegrationStatuses, getExampleById } from './examples.js';
import { reloadSubscriptions } from './events-demo.js';

// Cache for MCP clients to avoid reconnecting on every request
const mcpClientCache: Map<string, Awaited<ReturnType<typeof createMCPClient>>> = new Map();

/**
 * Load tools from configured MCP servers
 */
async function loadMCPTools(): Promise<Record<string, Tool>> {
  const mcpTools: Record<string, Tool> = {};
  const servers = listMCPServers();

  for (const { name, config } of servers) {
    if (!config.enabled) {
      console.log(`[MCP] Skipping disabled server: ${name}`);
      continue;
    }

    try {
      // Check if we have a cached client
      let client = mcpClientCache.get(name);

      if (!client) {
        console.log(`[MCP] Connecting to server: ${name} (${config.command} ${config.args?.join(' ') || ''})`);

        // Create stdio transport for command-based MCP servers
        client = await createMCPClient({
          transport: new StdioMCPTransport({
            command: config.command,
            args: config.args || [],
            env: config.env,
          }),
        });

        mcpClientCache.set(name, client);
        console.log(`[MCP] Connected to server: ${name}`);
      }

      // Get tools from this MCP server
      const tools = await client.tools();

      // Merge tools, prefixing with server name to avoid conflicts
      for (const [toolName, toolDef] of Object.entries(tools)) {
        const prefixedName = `${name}_${toolName}`;
        mcpTools[prefixedName] = toolDef as unknown as Tool;
        console.log(`[MCP] Loaded tool: ${prefixedName}`);
      }
    } catch (error) {
      console.error(`[MCP] Failed to load tools from ${name}:`, error);
      // Remove from cache if connection failed
      mcpClientCache.delete(name);
    }
  }

  return mcpTools;
}

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

export function notifySSEClients(result: ScheduledTaskResult): void {
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

const SYSTEM_PROMPT = `You are an intelligent assistant for the MCPE (MCP Events) demo server.

IMPORTANT: This is a demo/prototype server. Supported event sources: GitHub (webhooks) and Google Workspace (Pub/Sub).

YOUR KEY CAPABILITY - CREATING SMART SUBSCRIPTIONS:
You can create subscriptions where an AI agent automatically processes incoming events. When users say things like:
- "Subscribe to issues and translate them to Hebrew"
- "Notify me about PRs and summarize the changes"
- "Watch for new emails and summarize them"
- "Alert me when important emails arrive"

Use the createAgentSubscription tool with:
- name: A unique identifier (e.g., "issue-translator", "email-summarizer")
- eventTypes: What to listen for (e.g., ["github.issues.opened"], ["gmail.message.received"])
- agentInstructions: What the AI should do when events arrive

The flow is:
1. You create the subscription with instructions
2. When a matching event arrives via webhook
3. An AI agent processes it using YOUR instructions
4. The result is sent to the user via notifications

GITHUB EVENTS:
- github.push - Code pushed to a branch
- github.pull_request.opened / .closed / .merged - PR lifecycle events
- github.pull_request_review.submitted - PR review submitted (approved/changes requested/commented)
- github.pull_request_review_comment.created - Comments on PR code (inline code review comments)
- github.issues.opened / .closed - Issue lifecycle events
- github.issue_comment.created - Comments on issues (NOT PR review comments!)

GOOGLE WORKSPACE EVENTS:
- gmail.message.received - New email received
- gmail.message.important - Email marked as important
- gmail.message.mention - Mentioned in email thread
- calendar.event.created / .updated - Calendar event changes
- calendar.event.reminder - Upcoming event reminder
- drive.file.created / .shared - Drive file events

IMPORTANT EVENT TYPE DISTINCTIONS:
- "PR comments" or "code review comments" = github.pull_request_review_comment.created
- "Issue comments" = github.issue_comment.created
- "PR reviews" (approve/reject) = github.pull_request_review.submitted
- "New emails" = gmail.message.received

Use wildcards like "github.*", "gmail.*", or "calendar.*"

SETUP REQUIREMENTS:
- GitHub: Configure a webhook pointing to this server (see Examples tab)
- Google: Configure Google Cloud Pub/Sub push notifications (see Examples tab)

SUBSCRIPTION MANAGEMENT:
- createAgentSubscription: Create new subscription with AI processing instructions
- deleteAgentSubscription: Remove a subscription
- getConfiguredSubscriptions: View all subscriptions
- toggleSubscription: Enable/disable a subscription

REMINDERS AND DELAYED RESPONSES:
- For ONE-TIME delayed responses ("in X minutes", "after Y minutes"): Use scheduleDelayedResponse
- For RECURRING reminders ("every minute", "every hour", "every day"): Use scheduleRecurringResponse
  - Common cron patterns:
    - "* * * * *" = every minute
    - "*/5 * * * *" = every 5 minutes
    - "0 * * * *" = every hour
    - "0 9 * * *" = every day at 9am
    - "0 9 * * 1" = every Monday at 9am

STOPPING REMINDERS:
- To stop all reminders: Use stopAllReminders or disableAllSubscriptions
- To list all subscriptions including reminders: Use getConfiguredSubscriptions
- To stop a specific reminder: Use deleteAgentSubscription with the subscription name
- "unsubscribe from all", "stop reminders", "cancel reminders" → use stopAllReminders

All subscriptions and reminders are stored in mcpe.json - this is the single source of truth.

Be proactive - when users describe what they want to happen with events, create the subscription for them!`;

/**
 * Generate dynamic context about enabled integrations
 */
function getIntegrationContext(): string {
  const statuses = getAllIntegrationStatuses();
  const enabledIntegrations = Object.values(statuses).filter(s => s.enabled);

  if (enabledIntegrations.length === 0) {
    return '\n\nENABLED INTEGRATIONS: None. User can enable integrations in the Examples tab.';
  }

  let context = '\n\nENABLED INTEGRATIONS:';
  for (const integration of enabledIntegrations) {
    const example = getExampleById(integration.id);
    if (!example) continue;

    context += `\n\n${example.icon} ${example.name} (enabled since ${new Date(integration.enabledAt || '').toLocaleDateString()})`;

    if (integration.enabledSubscriptions.length > 0) {
      context += '\n  Active event subscriptions:';
      for (const subId of integration.enabledSubscriptions) {
        const sub = example.availableSubscriptions?.find(s => s.id === subId);
        if (sub) {
          context += `\n  - ${sub.name}: ${sub.eventTypes.join(', ')}`;
        }
      }
    }

    if (integration.config.defaultRepo) {
      context += `\n  Default repository: ${integration.config.defaultRepo}`;
    }
  }

  context += '\n\nWhen user asks about their events or subscriptions, refer to these enabled integrations.';
  return context;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentRequest {
  userMessage: string;
  messages?: ChatMessage[];
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
    // Build dynamic system prompt with integration context
    const dynamicSystemPrompt = SYSTEM_PROMPT + getIntegrationContext();

    // Build messages array from conversation history
    const conversationMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    // Add previous messages from history (excluding the current message which is already in the array)
    if (request.messages && request.messages.length > 0) {
      // The last message in the array is the current user message, so we include all of them
      for (const msg of request.messages) {
        conversationMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    } else {
      // Fallback: just use the current message
      conversationMessages.push({
        role: 'user',
        content: request.userMessage,
      });
    }

    // Load MCP tools from configured servers
    const mcpTools = await loadMCPTools();
    console.log(`[Agent] Loaded ${Object.keys(mcpTools).length} MCP tools`);

    // Define built-in tools
    const builtinTools = {
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
          description: 'Schedule a one-time delayed reminder or response. Use when user asks for a one-time reminder "in X minutes", "in X seconds", "after Y minutes".',
          parameters: z.object({
            reminderTopic: z.string()
              .describe('What to remind the user about (e.g., "drink water", "check the oven", "call mom")'),
            delayMinutes: z.number().min(0.1).max(60)
              .describe('Delay in minutes before the reminder (0.1 to 60 minutes, i.e., 6 seconds to 60 minutes)'),
          }),
          execute: async ({ reminderTopic, delayMinutes }) => {
            const delayMs = delayMinutes * 60 * 1000;
            const name = `reminder-${Date.now()}`;

            // Add to mcpe.json with schedule - this persists and starts the scheduler
            const result = addSubscription({
              name,
              description: reminderTopic,
              eventTypes: ['scheduled.reminder.once'],
              systemPrompt: 'You are a friendly reminder assistant. Your job is to generate a short reminder message. Do NOT ask questions - just deliver the reminder directly. Be concise and positive.',
              maxTokens: 100,
              schedule: {
                type: 'once',
                delayMs,
              },
            }, (taskResult) => {
              console.log(`[Reminder] ${taskResult.response.substring(0, 100)}...`);
              notifySSEClients(taskResult);
            });

            if (!result.success) {
              return { success: false, error: result.error };
            }

            return {
              success: true,
              subscriptionName: name,
              taskId: result.taskId,
              delayMinutes,
              message: `Scheduled reminder about "${reminderTopic}" in ${delayMinutes} minute(s). The reminder will appear in the chat.`,
            };
          },
        }),

        scheduleRecurringResponse: tool({
          description: 'Schedule a recurring AI response. Use when user asks for recurring reminders like "every minute", "every hour", "every day at 9am". This works locally without needing an external EventHub connection.',
          parameters: z.object({
            reminderTopic: z.string()
              .describe('What to remind the user about (e.g., "drink water", "take a break", "check emails")'),
            cronExpression: z.string()
              .describe('Cron expression for the schedule. Use: "* * * * *" for every minute, "0 * * * *" for every hour, "0 9 * * *" for 9am daily, "*/5 * * * *" for every 5 minutes'),
          }),
          execute: async ({ reminderTopic, cronExpression }) => {
            const name = `recurring-${Date.now()}`;

            // Add to mcpe.json with cron schedule - this persists and starts the scheduler
            const result = addSubscription({
              name,
              description: reminderTopic,
              eventTypes: ['scheduled.reminder.cron'],
              systemPrompt: 'You are a friendly reminder assistant. Your job is to generate short, encouraging reminder messages. Do NOT ask questions - just deliver the reminder directly. Be concise and positive.',
              maxTokens: 100,
              schedule: {
                type: 'cron',
                cronExpression,
              },
            }, (taskResult) => {
              console.log(`[Recurring Reminder] ${taskResult.response.substring(0, 100)}...`);
              notifySSEClients(taskResult);
            });

            if (!result.success) {
              return { success: false, error: result.error };
            }

            return {
              success: true,
              subscriptionName: name,
              taskId: result.taskId,
              cronExpression,
              humanReadable: formatCronExpression(cronExpression),
              message: `Created recurring reminder about "${reminderTopic}" - ${formatCronExpression(cronExpression)}. Reminders will appear in the chat.`,
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

        listScheduledTasks: tool({
          description: 'List all active scheduled tasks including recurring reminders (cron) and one-time delayed reminders (timer). Use this to see what reminders are currently active.',
          parameters: z.object({}),
          execute: async () => {
            const info = mcpe.getLocalSchedulerInfo();
            return {
              count: info.activeJobs.length,
              tasks: info.activeJobs.map(job => ({
                taskId: job.subscriptionId,
                type: job.type,
                nextRun: job.nextRun?.toISOString(),
                pendingEvents: job.pendingEvents,
              })),
            };
          },
        }),

        stopScheduledTask: tool({
          description: 'Stop a specific scheduled task (reminder) by its task ID. Use listScheduledTasks first to get the task IDs.',
          parameters: z.object({
            taskId: z.string().describe('The ID of the task to stop'),
          }),
          execute: async ({ taskId }) => {
            try {
              mcpe.stopScheduledTask(taskId);
              return {
                success: true,
                message: `Stopped scheduled task: ${taskId}`,
              };
            } catch (error) {
              return {
                success: false,
                error: `Failed to stop task: ${error}`,
              };
            }
          },
        }),

        stopAllReminders: tool({
          description: 'Stop ALL reminders (both recurring and one-time). Also removes them from mcpe.json. Use when user says "stop all reminders", "unsubscribe from all", "cancel all reminders".',
          parameters: z.object({}),
          execute: async () => {
            // Stop all active schedulers
            const stoppedCount = stopAllSchedulers();

            // Also delete scheduled subscriptions from config
            const data = getSubscriptionsJSON();
            let deletedCount = 0;
            for (const sub of data.subscriptions) {
              if (sub.delivery?.channels?.includes('cron') || sub.delivery?.channels?.includes('scheduled')) {
                deleteSubscription(sub.name);
                deletedCount++;
              }
            }

            // Reload subscriptions in events server
            reloadSubscriptions();

            return {
              success: true,
              stoppedCount,
              deletedCount,
              message: stoppedCount > 0 || deletedCount > 0
                ? `Stopped ${stoppedCount} active reminder(s) and removed ${deletedCount} from config.`
                : 'No active reminders to stop.',
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
          description: 'Disable all configured subscriptions and stop all reminders. Use when user says "unsubscribe from all", "stop everything", or "disable all".',
          parameters: z.object({}),
          execute: async () => {
            // First stop all schedulers
            const stoppedCount = stopAllSchedulers();

            // Then disable all subscriptions in config
            const data = getSubscriptionsJSON();
            let disabledCount = 0;
            for (const sub of data.subscriptions) {
              if (sub.enabled) {
                setSubscriptionEnabled(sub.name, false);
                disabledCount++;
              }
            }

            // Reload subscriptions in events server
            reloadSubscriptions();

            return {
              success: true,
              disabledCount,
              stoppedSchedulers: stoppedCount,
              message: `Disabled ${disabledCount} subscription(s) and stopped ${stoppedCount} reminder(s).`,
              subscriptions: getSubscriptionsJSON().subscriptions,
            };
          },
        }),

        createAgentSubscription: tool({
          description: 'Create a new subscription with an AI agent handler. Use this when users want to subscribe to events AND specify what should happen when events arrive (e.g., "subscribe to issues and translate them to Hebrew", "notify me about PRs and summarize changes"). The agent will process incoming events using the instructions you provide.',
          parameters: z.object({
            name: z.string().describe('A unique name for this subscription (e.g., "issue-translator", "pr-summarizer")'),
            eventTypes: z.array(z.string()).describe('Event types to subscribe to (e.g., ["github.issues.opened", "github.pull_request.opened"])'),
            agentInstructions: z.string().describe('Instructions for the AI agent that will process events. Be specific about what it should do (e.g., "Translate the issue title and body to Hebrew", "Summarize the PR changes in 2-3 sentences")'),
            description: z.string().optional().describe('Optional description of what this subscription does'),
          }),
          execute: async ({ name, eventTypes, agentInstructions, description }) => {
            const result = addSubscription({
              name,
              eventTypes,
              description: description || `AI processes: ${agentInstructions.substring(0, 50)}...`,
              systemPrompt: agentInstructions,
            });

            if (result.success) {
              // Reload subscriptions in events server
              reloadSubscriptions();
              return {
                success: true,
                message: `Created subscription "${name}" for events [${eventTypes.join(', ')}]. When these events arrive, an AI agent will: ${agentInstructions}`,
                subscription: { name, eventTypes, agentInstructions },
              };
            } else {
              return {
                success: false,
                error: result.error,
              };
            }
          },
        }),

        deleteAgentSubscription: tool({
          description: 'Delete a subscription by name. Use when user wants to remove a subscription completely.',
          parameters: z.object({
            name: z.string().describe('The name of the subscription to delete'),
          }),
          execute: async ({ name }) => {
            const success = deleteSubscription(name);
            if (success) {
              // Reload subscriptions in events server
              reloadSubscriptions();
              return {
                success: true,
                message: `Deleted subscription "${name}"`,
              };
            } else {
              return {
                success: false,
                error: `Subscription "${name}" not found`,
              };
            }
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
    };

    // Merge built-in tools with MCP tools
    const allTools = { ...builtinTools, ...mcpTools };

    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: dynamicSystemPrompt,
      messages: conversationMessages,
      tools: allTools,
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
