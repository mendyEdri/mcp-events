import { EventsServer, createEvent, type MCPEvent, type AgentEventHandler } from '@mcpe/core';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { notifySSEClients, loadMCPTools } from './agent.js';
import { getEnabledSubscriptions } from './mcpe-config.js';

// Default ntfy.sh topic for demos (optional fallback)
const NTFY_TOPIC = process.env.NTFY_TOPIC || 'mcpe-demo';
const NTFY_URL = `https://ntfy.sh/${NTFY_TOPIC}`;

// OpenAI client for agent handlers
const openai = createOpenAI({
  baseURL: process.env.OPENAI_BASE_URL ?? 'https://www.wixapis.com/openai/v1',
  apiKey: process.env.OPENAI_API_KEY,
});

// In-memory events server for demo
let eventsServer: EventsServer | null = null;

// Event history for debugging (stores last 50 events)
interface EventHistoryEntry {
  id: string;
  type: string;
  receivedAt: string;
  matchedSubscriptions: number;
  processed: boolean;
  error?: string;
}
const eventHistory: EventHistoryEntry[] = [];
const MAX_HISTORY = 50;

/**
 * Add an event to the history
 */
function addToHistory(event: MCPEvent, matchedSubscriptions: number, processed: boolean, error?: string): void {
  eventHistory.unshift({
    id: event.id,
    type: event.type,
    receivedAt: new Date().toISOString(),
    matchedSubscriptions,
    processed,
    error,
  });
  // Keep only the last MAX_HISTORY entries
  if (eventHistory.length > MAX_HISTORY) {
    eventHistory.pop();
  }
}

/**
 * Get recent event history for debugging
 */
export function getEventHistory(): EventHistoryEntry[] {
  return [...eventHistory];
}

/**
 * Agent handler callback - invokes OpenAI and sends result to chat via SSE
 */
async function handleAgentEvent(
  event: MCPEvent,
  handler: AgentEventHandler,
  subscriptionId: string
): Promise<void> {
  const model = handler.model || 'gpt-4o-mini';

  // Build the prompt from handler config
  const systemPrompt = handler.systemPrompt || 'You are a helpful assistant that processes events.';
  const instructions = handler.instructions || '';

  const userPrompt = `${instructions ? instructions + '\n\n' : ''}Process this event:\n\`\`\`json\n${JSON.stringify(event, null, 2)}\n\`\`\``;

  console.log(`[Agent Handler] Processing event ${event.id} with subscription "${subscriptionId}" using model ${model}`);
  console.log(`[Agent Handler] System prompt: ${systemPrompt.substring(0, 100)}...`);

  try {
    // Load MCP tools so event agent has same capabilities as chat agent
    const mcpTools = await loadMCPTools();
    console.log(`[Agent Handler] Loaded ${Object.keys(mcpTools).length} MCP tools`);

    const result = await generateText({
      model: openai(model),
      system: systemPrompt,
      prompt: userPrompt,
      tools: mcpTools,
      maxSteps: 5,
      maxTokens: handler.maxTokens || 500,
    });

    const agentResponse = result.text;
    console.log(`[Agent Handler] Response: ${agentResponse.substring(0, 100)}...`);

    // Send to chat via SSE (main delivery channel)
    notifySSEClients({
      taskId: `${subscriptionId}-${event.id}`,
      task: `Event processed: ${event.type}`,
      response: agentResponse,
      scheduledAt: new Date(),
      deliveredAt: new Date(),
    });

    console.log(`[Agent Handler] Sent response to chat via SSE`);
  } catch (error) {
    console.error(`[Agent Handler] Error:`, error);

    // Send error to chat
    notifySSEClients({
      taskId: `${subscriptionId}-${event.id}-error`,
      task: `Error processing: ${event.type}`,
      response: `Failed to process event: ${error instanceof Error ? error.message : String(error)}`,
      scheduledAt: new Date(),
      deliveredAt: new Date(),
    });
  }
}

/**
 * Get or create the events server instance
 */
export function getEventsServer(): EventsServer {
  if (!eventsServer) {
    eventsServer = new EventsServer({
      name: 'mcpe-demo-server',
      version: '1.0.0',
      events: {
        maxSubscriptions: 100,
        supportedSources: ['github', 'gmail', 'slack', 'custom'],
      },
      handlers: {
        onAgentHandler: handleAgentEvent,
      },
    });

    // Load user subscriptions from mcpe.json
    loadUserSubscriptions();
  }
  return eventsServer;
}

/**
 * Load subscriptions from mcpe.json into the events server
 */
function loadUserSubscriptions(): void {
  if (!eventsServer) return;

  const server = eventsServer;
  const subscriptions = getEnabledSubscriptions();

  console.log(`[Events] Loading ${subscriptions.length} subscriptions from mcpe.json`);

  for (const sub of subscriptions) {
    try {
      const created = server.subscriptionManager.create(sub.name, {
        filter: sub.filter,
        delivery: sub.delivery || { channels: ['realtime'] },
        handler: sub.handler,
      });

      console.log(`[Events] Loaded subscription: ${sub.name} (${sub.filter.eventTypes?.join(', ') || 'all events'})`);

      // Start scheduler for cron subscriptions
      if (sub.delivery?.channels?.includes('cron')) {
        server.scheduler.startSubscription(created);
        console.log(`[Events] Started cron scheduler for: ${sub.name}`);
      }
    } catch (error) {
      console.error(`[Events] Failed to load subscription ${sub.name}:`, error);
    }
  }

  if (subscriptions.length === 0) {
    console.log(`[Events] No subscriptions configured. Create subscriptions via chat or the Subs tab.`);
  }
}

/**
 * Reload subscriptions from mcpe.json (call after changes)
 * Recreates the events server to load fresh subscriptions
 */
export function reloadSubscriptions(): void {
  console.log('[Events] Reloading subscriptions...');
  // Destroy and recreate the events server to load fresh subscriptions
  eventsServer = null;
  getEventsServer(); // This will create new server and load subscriptions
}

/**
 * Publish an event and trigger handlers
 */
export async function publishEvent(event: MCPEvent): Promise<{ success: boolean; matchedSubscriptions: number }> {
  const server = getEventsServer();

  // Find matching subscriptions before publishing (for response)
  const matchingSubscriptions = server.subscriptionManager.findMatchingSubscriptions(event);

  try {
    // Publish the event (this will execute handlers)
    await server.publish(event);

    // Record in history
    addToHistory(event, matchingSubscriptions.length, matchingSubscriptions.length > 0);

    return {
      success: true,
      matchedSubscriptions: matchingSubscriptions.length,
    };
  } catch (error) {
    // Record error in history
    addToHistory(event, matchingSubscriptions.length, false, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/**
 * Create a sample event for testing
 */
export function createSampleEvent(type: 'github' | 'slack' | 'gmail' | 'custom', subtype?: string): MCPEvent {
  const now = new Date().toISOString();

  switch (type) {
    case 'github':
      return createEvent(
        subtype || 'github.push',
        {
          repository: 'demo/example-repo',
          branch: 'main',
          commits: [
            { message: 'feat: Add new feature', sha: 'abc123', author: 'demo-user' },
          ],
          pusher: 'demo-user',
        },
        { source: 'github', priority: 'normal', tags: ['demo'] }
      );

    case 'slack':
      return createEvent(
        subtype || 'slack.message.posted',
        {
          channel: '#general',
          user: 'demo-user',
          text: 'Hello from MCPE demo!',
          timestamp: now,
        },
        { source: 'slack', priority: 'normal', tags: ['demo', 'message'] }
      );

    case 'gmail':
      return createEvent(
        subtype || 'gmail.message.received',
        {
          from: 'sender@example.com',
          to: 'you@example.com',
          subject: 'Demo Email from MCPE',
          snippet: 'This is a test email...',
        },
        { source: 'gmail', priority: 'normal', tags: ['demo', 'inbox'] }
      );

    case 'custom':
    default:
      return createEvent(
        subtype || 'custom.demo.event',
        {
          message: 'This is a custom demo event',
          timestamp: now,
        },
        { source: 'custom', priority: 'normal', tags: ['demo'] }
      );
  }
}

/**
 * Create a high priority alert event
 */
export function createAlertEvent(title: string, message: string, priority: 'high' | 'critical' = 'high'): MCPEvent {
  return createEvent(
    'alert.triggered',
    {
      title,
      message,
      triggeredAt: new Date().toISOString(),
    },
    { source: 'custom', priority, tags: ['alert', 'demo'] }
  );
}

/**
 * Create an error event (triggers agent handler)
 */
export function createErrorEvent(
  errorType: string,
  errorMessage: string,
  context: Record<string, unknown> = {}
): MCPEvent {
  return createEvent(
    `error.${errorType}`,
    {
      error: errorMessage,
      context,
      occurredAt: new Date().toISOString(),
    },
    { source: 'custom', priority: 'high', tags: ['error', 'demo'] }
  );
}

/**
 * Create an analysis request event (triggers agent handler)
 */
export function createAnalyzeEvent(
  subject: string,
  data: Record<string, unknown>
): MCPEvent {
  return createEvent(
    'analyze.request',
    {
      subject,
      data,
      requestedAt: new Date().toISOString(),
    },
    { source: 'custom', priority: 'normal', tags: ['analyze', 'demo'] }
  );
}

/**
 * Get demo info
 */
export function getDemoInfo() {
  const server = getEventsServer();
  const subscriptions = server.subscriptionManager.listByClient('demo');
  const schedulerInfo = server.getSchedulerInfo();

  return {
    ntfyTopic: NTFY_TOPIC,
    ntfyUrl: NTFY_URL,
    subscribeUrl: `https://ntfy.sh/${NTFY_TOPIC}`,
    subscriptions: subscriptions.map(s => {
      const scheduleJob = schedulerInfo.activeJobs.find(j => j.subscriptionId === s.id);
      return {
        id: s.id,
        filter: s.filter,
        delivery: s.delivery.channels,
        handlerType: s.handler?.type,
        handlerConfig: s.handler?.type === 'agent' ? {
          model: (s.handler as AgentEventHandler).model,
          systemPrompt: (s.handler as AgentEventHandler).systemPrompt?.substring(0, 50) + '...',
        } : undefined,
        schedule: scheduleJob ? {
          type: scheduleJob.type,
          nextRun: scheduleJob.nextRun?.toISOString(),
          pendingEvents: scheduleJob.pendingEvents,
        } : undefined,
      };
    }),
  };
}
