#!/usr/bin/env npx tsx
/**
 * Slack Notifier - Real-World ASP Subscriber
 *
 * Sends Slack messages for high-priority events.
 *
 * Setup:
 * 1. Create a Slack app at https://api.slack.com/apps
 * 2. Add 'chat:write' bot scope
 * 3. Install app to workspace
 * 4. Copy Bot User OAuth Token (starts with xoxb-)
 * 5. Set SLACK_BOT_TOKEN env var
 *
 * Usage:
 *   SLACK_BOT_TOKEN=xoxb-xxx SLACK_CHANNEL=#alerts pnpm start
 */

import { ASPClient, WebSocketTransport } from '@esmcp/client';
import type { ESMCPEvent } from '@esmcp/core';

// Configuration
const ASP_SERVER = process.env.ASP_SERVER || process.env.ESMCP_SERVER || 'ws://localhost:8080';
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || '';
const SLACK_CHANNEL = process.env.SLACK_CHANNEL || '#general';
const SUBSCRIBER_NAME = process.env.SUBSCRIBER_NAME || 'slack-notifier';

// Stats for health monitoring
const stats = {
  eventsReceived: 0,
  messagesSent: 0,
  errors: 0,
  lastEvent: null as Date | null,
};

/**
 * Send message to Slack
 */
async function sendToSlack(event: ESMCPEvent): Promise<boolean> {
  if (!SLACK_BOT_TOKEN) {
    console.warn('⚠️  SLACK_BOT_TOKEN not set, skipping Slack notification');
    return false;
  }

  const priorityEmoji: Record<string, string> = {
    low: '⚪',
    normal: '🔵',
    high: '🟠',
    critical: '🔴',
  };

  const sourceEmoji: Record<string, string> = {
    github: '🐙',
    gmail: '📧',
    slack: '💬',
    custom: '🔔',
  };

  const emoji = priorityEmoji[event.metadata.priority] || '⚪';
  const sourceIcon = sourceEmoji[event.metadata.source] || '📢';

  // Build rich Slack message
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${emoji} ${sourceIcon} ${event.type}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Source:*\n${event.metadata.source}`,
        },
        {
          type: 'mrkdwn',
          text: `*Priority:*\n${event.metadata.priority}`,
        },
        {
          type: 'mrkdwn',
          text: `*Time:*\n${new Date(event.metadata.timestamp).toLocaleString()}`,
        },
        {
          type: 'mrkdwn',
          text: `*Event ID:*\n\`${event.id.substring(0, 8)}\``,
        },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Data:*\n\`\`\`json\n${JSON.stringify(event.data, null, 2).substring(0, 2900)}\n\`\`\``,
      },
    },
  ];

  // Add tags if present
  if (event.metadata.tags && event.metadata.tags.length > 0) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Tags: ${event.metadata.tags.map((t) => `\`${t}\``).join(' ')}`,
        },
      ],
    });
  }

  try {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify({
        channel: SLACK_CHANNEL,
        blocks,
        text: `${emoji} ${event.type} from ${event.metadata.source}`, // Fallback text
      }),
    });

    const result = await response.json();

    if (!result.ok) {
      throw new Error(result.error);
    }

    stats.messagesSent++;
    return true;
  } catch (error) {
    stats.errors++;
    console.error('❌ Failed to send Slack message:', error);
    return false;
  }
}

/**
 * Format event for console logging
 */
function formatEvent(event: ESMCPEvent): string {
  const time = new Date(event.metadata.timestamp).toLocaleTimeString();
  const priority = event.metadata.priority.toUpperCase().padEnd(8);
  return `[${time}] ${priority} ${event.type}`;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║           📢 Slack Notifier Subscriber                   ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  if (!SLACK_BOT_TOKEN) {
    console.log('⚠️  Warning: SLACK_BOT_TOKEN not set');
    console.log('   Messages will be logged but not sent to Slack');
    console.log();
  }

  console.log(`🔌 Connecting to ${ASP_SERVER}...`);

  const transport = new WebSocketTransport({
    url: ASP_SERVER,
    reconnect: true,
    reconnectInterval: 5000,
  });

  const client = new ASPClient({
    transport,
    clientInfo: {
      name: SUBSCRIBER_NAME,
      version: '1.0.0',
    },
    capabilities: {
      websocket: true,
    },
  });

  // Handle events
  client.onEvent('*', async (event: ESMCPEvent) => {
    stats.eventsReceived++;
    stats.lastEvent = new Date();

    console.log(`📨 ${formatEvent(event)}`);

    // Only send high/critical priority to Slack
    if (event.metadata.priority === 'high' || event.metadata.priority === 'critical') {
      const sent = await sendToSlack(event);
      if (sent) {
        console.log(`   ✅ Sent to Slack ${SLACK_CHANNEL}`);
      }
    } else {
      console.log(`   ℹ️  Logged only (priority: ${event.metadata.priority})`);
    }
  });

  // Connect and subscribe
  await client.connect();
  console.log('✅ Connected to ASP server');
  console.log(`   Server: ${client.serverInfo?.name}`);
  console.log();

  // Subscribe to all events (filter by priority in handler)
  const subscription = await client.subscribe({
    filter: {
      // Subscribe to all - we filter by priority in the handler
      // This allows us to see stats on all events
    },
    delivery: {
      channels: ['websocket'],
      priority: 'realtime',
    },
  });

  console.log(`📋 Subscribed: ${subscription.id}`);
  console.log(`📤 Slack channel: ${SLACK_CHANNEL}`);
  console.log(`🎯 Only high/critical priority events sent to Slack`);
  console.log();
  console.log('Listening for events... (Press Ctrl+C to exit)');
  console.log();

  // Health check endpoint
  const healthServer = Bun.serve({
    port: 3001,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/health') {
        return Response.json({
          status: 'ok',
          subscriber: SUBSCRIBER_NAME,
          connected: client.state === 'initialized',
          stats,
          slack: {
            channel: SLACK_CHANNEL,
            configured: !!SLACK_BOT_TOKEN,
          },
        });
      }
      return new Response('Not found', { status: 404 });
    },
  });

  console.log(`🏥 Health check: http://localhost:3001/health`);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down...');
    healthServer.stop();
    await client.unsubscribe(subscription.id);
    await client.disconnect();
    console.log('✅ Disconnected');
    console.log();
    console.log('📊 Final Stats:');
    console.log(`   Events received: ${stats.eventsReceived}`);
    console.log(`   Messages sent: ${stats.messagesSent}`);
    console.log(`   Errors: ${stats.errors}`);
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
