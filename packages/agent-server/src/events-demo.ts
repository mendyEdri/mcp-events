import { EventsServer, createEvent, type MCPEvent, type AgentEventHandler } from '@mcpe/core';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

// Default ntfy.sh topic for demos
const NTFY_TOPIC = process.env.NTFY_TOPIC || 'mcpe-demo';
const NTFY_URL = `https://ntfy.sh/${NTFY_TOPIC}`;

// OpenAI client for agent handlers
const openai = createOpenAI({
  baseURL: process.env.OPENAI_BASE_URL ?? 'https://www.wixapis.com/openai/v1',
  apiKey: process.env.OPENAI_API_KEY,
});

// In-memory events server for demo
let eventsServer: EventsServer | null = null;

/**
 * Agent handler callback - invokes OpenAI and sends result to ntfy.sh
 */
async function handleAgentEvent(
  event: MCPEvent,
  handler: AgentEventHandler,
  _subscriptionId: string
): Promise<void> {
  const model = handler.model || 'gpt-4o-mini';

  // Build the prompt from handler config
  const systemPrompt = handler.systemPrompt || 'You are a helpful assistant that processes events.';
  const instructions = handler.instructions || '';

  const userPrompt = `${instructions ? instructions + '\n\n' : ''}Process this event:\n\`\`\`json\n${JSON.stringify(event, null, 2)}\n\`\`\``;

  console.log(`[Agent Handler] Processing event ${event.id} with model ${model}`);

  try {
    const result = await generateText({
      model: openai(model),
      system: systemPrompt,
      prompt: userPrompt,
      maxTokens: handler.maxTokens || 500,
    });

    const agentResponse = result.text;
    console.log(`[Agent Handler] Response: ${agentResponse.substring(0, 100)}...`);

    // Send the agent's response to ntfy.sh so it's visible
    await fetch(NTFY_URL, {
      method: 'POST',
      headers: {
        'Title': `Agent: ${event.type}`,
        'Tags': 'robot,brain',
        'Priority': 'default',
      },
      body: agentResponse,
    });

    console.log(`[Agent Handler] Sent response to ntfy.sh`);
  } catch (error) {
    console.error(`[Agent Handler] Error:`, error);

    // Send error notification
    await fetch(NTFY_URL, {
      method: 'POST',
      headers: {
        'Title': `Agent Error: ${event.type}`,
        'Tags': 'warning,robot',
        'Priority': 'high',
      },
      body: `Failed to process event: ${error instanceof Error ? error.message : String(error)}`,
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

    // Set up demo subscriptions
    setupDemoSubscriptions();
  }
  return eventsServer;
}

/**
 * Set up demo subscriptions with ntfy.sh webhooks
 */
function setupDemoSubscriptions(): void {
  if (!eventsServer) return;

  const server = eventsServer;

  // Demo subscription 1: All GitHub events -> ntfy
  server.subscriptionManager.create('demo', {
    filter: {
      sources: ['github'],
    },
    delivery: { channels: ['realtime'] },
    handler: {
      type: 'webhook',
      url: NTFY_URL,
      headers: {
        'Title': 'GitHub Event',
        'Tags': 'github,octopus',
      },
      timeout: 5000,
    },
  });

  // Demo subscription 2: High priority events -> ntfy with priority
  server.subscriptionManager.create('demo', {
    filter: {
      priority: ['high', 'critical'],
    },
    delivery: { channels: ['realtime'] },
    handler: {
      type: 'webhook',
      url: NTFY_URL,
      headers: {
        'Title': 'High Priority Alert',
        'Priority': 'high',
        'Tags': 'warning',
      },
      timeout: 5000,
    },
  });

  // Demo subscription 3: Slack mentions -> ntfy
  server.subscriptionManager.create('demo', {
    filter: {
      sources: ['slack'],
      eventTypes: ['slack.message.*'],
    },
    delivery: { channels: ['realtime'] },
    handler: {
      type: 'webhook',
      url: NTFY_URL,
      headers: {
        'Title': 'Slack Message',
        'Tags': 'speech_balloon,slack',
      },
      timeout: 5000,
    },
  });

  // Demo subscription 4: Agent handler for error events
  // The agent analyzes errors and suggests fixes
  server.subscriptionManager.create('demo', {
    filter: {
      eventTypes: ['*.error', '*.failed', 'error.*'],
    },
    delivery: { channels: ['realtime'] },
    handler: {
      type: 'agent',
      systemPrompt: 'You are an incident response assistant. Analyze the error event and provide: 1) A brief summary of what went wrong, 2) Potential root causes, 3) Suggested next steps to resolve the issue. Be concise and actionable.',
      model: 'gpt-4o-mini',
      instructions: 'Focus on practical advice. Keep your response under 200 words.',
      maxTokens: 300,
    },
  });

  // Demo subscription 5: Agent handler for custom analysis requests
  server.subscriptionManager.create('demo', {
    filter: {
      eventTypes: ['analyze.*', 'custom.analyze'],
    },
    delivery: { channels: ['realtime'] },
    handler: {
      type: 'agent',
      systemPrompt: 'You are a data analyst assistant. Analyze the provided event data and extract key insights. Summarize findings in a clear, structured format.',
      model: 'gpt-4o-mini',
      maxTokens: 500,
    },
  });

  // Demo subscription 6: Cron-based daily digest (runs every minute for demo)
  // In production, use "0 9 * * *" for daily at 9am
  const cronSub = server.subscriptionManager.create('demo', {
    filter: {
      sources: ['github', 'slack'],
    },
    delivery: {
      channels: ['cron'],
      cronSchedule: {
        expression: '* * * * *', // Every minute for demo (use "0 9 * * *" for daily)
        timezone: 'UTC',
        aggregateEvents: true,
        maxEventsPerDelivery: 50,
      },
    },
    handler: {
      type: 'agent',
      systemPrompt: 'You are a digest summarizer. Create a brief summary of these events as a daily digest. Group by source, highlight important items.',
      model: 'gpt-4o-mini',
      maxTokens: 500,
    },
  });

  // Start the scheduler for cron subscription
  server.scheduler.startSubscription(cronSub);

  console.log(`Demo subscriptions created. Events will be sent to: ${NTFY_URL}`);
  console.log(`Subscribe to notifications: https://ntfy.sh/${NTFY_TOPIC}`);
  console.log(`Agent handlers configured for error events and analysis requests.`);
  console.log(`Cron subscription active: events aggregated and delivered every minute.`);
}

/**
 * Publish an event and trigger handlers
 */
export async function publishEvent(event: MCPEvent): Promise<{ success: boolean; matchedSubscriptions: number }> {
  const server = getEventsServer();

  // Find matching subscriptions before publishing (for response)
  const matchingSubscriptions = server.subscriptionManager.findMatchingSubscriptions(event);

  // Publish the event (this will execute handlers)
  await server.publish(event);

  return {
    success: true,
    matchedSubscriptions: matchingSubscriptions.length,
  };
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
