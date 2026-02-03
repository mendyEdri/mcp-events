#!/usr/bin/env npx tsx
/**
 * Webhook Forwarder - Real-World ASP Subscriber
 *
 * Forwards events to external HTTP endpoints.
 *
 * Use Case: Integrate with Zapier, IFTTT, custom APIs
 *
 * Configuration via WEBHOOK_URLS env var:
 * WEBHOOK_URLS=[{"url":"https://hooks.zapier.com/...","events":["github.*"]},{"url":"https://discord.com/api/webhooks/...","events":["*"]}]
 */

import { ASPClient, WebSocketTransport } from '@esmcp/client';
import type { ESMCPEvent } from '@esmcp/core';

const ASP_SERVER = process.env.ASP_SERVER || process.env.ESMCP_SERVER || 'ws://localhost:8080';
const SUBSCRIBER_NAME = process.env.SUBSCRIBER_NAME || 'webhook-forwarder';

interface WebhookConfig {
  url: string;
  events?: string[]; // Event patterns to forward
  headers?: Record<string, string>;
  retryAttempts?: number;
}

const stats = {
  eventsReceived: 0,
  webhooksSent: 0,
  errors: 0,
};

// Parse webhook configurations
function getWebhooks(): WebhookConfig[] {
  const urlsEnv = process.env.WEBHOOK_URLS;
  if (urlsEnv) {
    try {
      return JSON.parse(urlsEnv);
    } catch {
      console.error('Invalid WEBHOOK_URLS JSON');
    }
  }
  // Default: echo to webhook.site for testing
  return [
    {
      url: 'https://webhook.site/your-unique-url',
      events: ['*'],
    },
  ];
}

async function forwardToWebhook(event: ESMCPEvent, config: WebhookConfig): Promise<boolean> {
  const maxRetries = config.retryAttempts || 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Event-Source': event.metadata.source,
          'X-Event-Type': event.type,
          'X-Event-ID': event.id,
          ...config.headers,
        },
        body: JSON.stringify({
          event,
          forwardedAt: new Date().toISOString(),
        }),
      });

      if (response.ok) {
        stats.webhooksSent++;
        return true;
      }

      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries) {
        stats.errors++;
        console.error(`❌ Webhook failed after ${maxRetries} attempts:`, config.url);
        return false;
      }
      // Exponential backoff
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
  return false;
}

function shouldForward(event: ESMCPEvent, patterns?: string[]): boolean {
  if (!patterns || patterns.includes('*')) return true;

  return patterns.some((pattern) => {
    if (pattern === event.type) return true;
    if (pattern.endsWith('.*')) {
      return event.type.startsWith(pattern.slice(0, -1));
    }
    return false;
  });
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║           🔄 Webhook Forwarder Subscriber                ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  const webhooks = getWebhooks();
  console.log(`🔗 Configured webhooks: ${webhooks.length}`);
  webhooks.forEach((wh, i) => {
    console.log(`   ${i + 1}. ${wh.url.substring(0, 50)}... (${wh.events?.join(', ') || '*'})`);
  });
  console.log();

  const transport = new WebSocketTransport({
    url: ASP_SERVER,
    reconnect: true,
  });

  const client = new ASPClient({
    transport,
    clientInfo: { name: SUBSCRIBER_NAME, version: '1.0.0' },
  });

  client.onEvent('*', async (event: ESMCPEvent) => {
    stats.eventsReceived++;

    for (const webhook of webhooks) {
      if (shouldForward(event, webhook.events)) {
        const success = await forwardToWebhook(event, webhook);
        if (success) {
          console.log(`✅ Forwarded ${event.type} → ${webhook.url.substring(0, 30)}...`);
        }
      }
    }
  });

  await client.connect();
  console.log('✅ Connected to ASP server');

  const subscription = await client.subscribe({
    filter: {},
    delivery: { channels: ['websocket'], priority: 'realtime' },
  });

  console.log(`📋 Subscribed: ${subscription.id}`);
  console.log('Forwarding events... (Press Ctrl+C to exit)');

  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down...');
    await client.unsubscribe(subscription.id);
    await client.disconnect();
    console.log(`📊 Stats: ${stats.eventsReceived} received, ${stats.webhooksSent} forwarded, ${stats.errors} errors`);
    process.exit(0);
  });
}

main().catch(console.error);
