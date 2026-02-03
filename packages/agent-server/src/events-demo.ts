import { EventsServer, createEvent, type MCPEvent } from '@mcpe/core';

// Default ntfy.sh topic for demos
const NTFY_TOPIC = process.env.NTFY_TOPIC || 'mcpe-demo';
const NTFY_URL = `https://ntfy.sh/${NTFY_TOPIC}`;

// In-memory events server for demo
let eventsServer: EventsServer | null = null;

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

  console.log(`Demo subscriptions created. Events will be sent to: ${NTFY_URL}`);
  console.log(`Subscribe to notifications: https://ntfy.sh/${NTFY_TOPIC}`);
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
 * Get demo info
 */
export function getDemoInfo() {
  const server = getEventsServer();
  const subscriptions = server.subscriptionManager.listByClient('demo');

  return {
    ntfyTopic: NTFY_TOPIC,
    ntfyUrl: NTFY_URL,
    subscribeUrl: `https://ntfy.sh/${NTFY_TOPIC}`,
    subscriptions: subscriptions.map(s => ({
      id: s.id,
      filter: s.filter,
      handlerType: s.handler?.type,
    })),
  };
}
