#!/usr/bin/env npx tsx
/**
 * CLI Notification Receiver
 *
 * Connects to an ESMCP/ASP server via WebSocket and receives notifications
 * in real-time. This demonstrates the "reverse flow" - someone sends a notification
 * and this CLI receives it.
 *
 * Usage:
 *   npx tsx cli-receive.ts                    # Connect to default server
 *   npx tsx cli-receive.ts --server ws://localhost:8080
 *   npx tsx cli-receive.ts --filter github    # Only receive github events
 *   npx tsx cli-receive.ts --filter "github.push,slack.*"
 */

import { ASPClient, WebSocketTransport } from '@esmcp/client';
import type { ESMCPEvent } from '@esmcp/core';

// Parse command line arguments
const args = process.argv.slice(2);
let serverUrl = 'ws://localhost:8080';
let filterSources: string[] = [];
let filterTypes: string[] = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--server' && args[i + 1]) {
    serverUrl = args[i + 1];
    i++;
  } else if (args[i] === '--filter' && args[i + 1]) {
    const filters = args[i + 1].split(',');
    for (const f of filters) {
      if (['github', 'gmail', 'slack', 'custom'].includes(f)) {
        filterSources.push(f as 'github' | 'gmail' | 'slack' | 'custom');
      } else {
        filterTypes.push(f);
      }
    }
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
CLI Notification Receiver

Usage:
  npx tsx cli-receive.ts [options]

Options:
  --server <url>    WebSocket server URL (default: ws://localhost:8080)
  --filter <types>  Comma-separated list of sources or event types
                    Sources: github, gmail, slack, custom
                    Event types: github.push, github.*, etc.
  --help, -h        Show this help message

Examples:
  npx tsx cli-receive.ts
  npx tsx cli-receive.ts --server ws://localhost:8080
  npx tsx cli-receive.ts --filter github
  npx tsx cli-receive.ts --filter "github.push,slack.*"
`);
    process.exit(0);
  }
}

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function formatPriority(priority: string): string {
  switch (priority) {
    case 'critical':
      return `${colors.red}${colors.bright}CRITICAL${colors.reset}`;
    case 'high':
      return `${colors.yellow}HIGH${colors.reset}`;
    case 'normal':
      return `${colors.blue}NORMAL${colors.reset}`;
    case 'low':
      return `${colors.dim}LOW${colors.reset}`;
    default:
      return priority;
  }
}

function formatEvent(event: ESMCPEvent, subscriptionId: string): void {
  const timestamp = new Date(event.metadata.timestamp).toLocaleTimeString();

  console.log(`
${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}
${colors.bright}📬 NEW EVENT${colors.reset}
${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}
  ${colors.bright}Type:${colors.reset}         ${event.type}
  ${colors.bright}Source:${colors.reset}       ${event.metadata.source}
  ${colors.bright}Priority:${colors.reset}     ${formatPriority(event.metadata.priority)}
  ${colors.bright}Time:${colors.reset}         ${timestamp}
  ${colors.bright}Event ID:${colors.reset}     ${colors.dim}${event.id}${colors.reset}
  ${colors.bright}Subscription:${colors.reset} ${colors.dim}${subscriptionId}${colors.reset}
  ${colors.bright}Tags:${colors.reset}         ${event.metadata.tags?.join(', ') || '(none)'}

  ${colors.bright}Data:${colors.reset}
  ${colors.magenta}${JSON.stringify(event.data, null, 2).split('\n').join('\n  ')}${colors.reset}
`);
}

async function main() {
  console.log(`
${colors.cyan}╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║  ${colors.bright}🔔 ESMCP CLI Notification Receiver${colors.reset}${colors.cyan}                         ║
║                                                               ║
║  Connecting to ASP server via WebSocket...                    ║
║  Press Ctrl+C to disconnect                                   ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝${colors.reset}
`);

  console.log(`${colors.dim}Server:${colors.reset} ${serverUrl}`);
  if (filterSources.length > 0) {
    console.log(`${colors.dim}Filter sources:${colors.reset} ${filterSources.join(', ')}`);
  }
  if (filterTypes.length > 0) {
    console.log(`${colors.dim}Filter types:${colors.reset} ${filterTypes.join(', ')}`);
  }
  console.log('');

  // Create transport and client
  const transport = new WebSocketTransport({
    url: serverUrl,
    reconnect: true,
    reconnectInterval: 2000,
    maxReconnectAttempts: 10,
  });

  const client = new ASPClient({
    transport,
    clientInfo: {
      name: 'cli-receiver',
      version: '1.0.0',
    },
  });

  // Handle transport events for logging
  transport.on('connect', () => {
    console.log(`${colors.green}✓ WebSocket connected${colors.reset}`);
  });

  transport.on('disconnect', (reason) => {
    console.log(`${colors.yellow}⚠ WebSocket disconnected: ${reason || 'unknown'}${colors.reset}`);
  });

  transport.on('error', (error) => {
    console.log(`${colors.red}✗ Transport error: ${error.message}${colors.reset}`);
  });

  try {
    // Connect to server
    console.log(`${colors.dim}Connecting to ${serverUrl}...${colors.reset}`);
    await client.connect();
    console.log(`${colors.green}✓ Connected and initialized${colors.reset}`);

    // Get server capabilities
    const capabilities = client.capabilities;
    if (capabilities) {
      console.log(`${colors.dim}Server: ${capabilities.serverInfo.name} v${capabilities.serverInfo.version}${colors.reset}`);
      console.log(`${colors.dim}Supported sources: ${capabilities.filters.supportedSources.join(', ')}${colors.reset}`);
    }

    // Register event handler (catch all events)
    client.onEvent('*', (event: ESMCPEvent, subscriptionId: string) => {
      formatEvent(event, subscriptionId);
    });

    // Handle subscription expiration
    client.onSubscriptionExpired((event) => {
      console.log(`${colors.yellow}⚠ Subscription expired: ${event.subscriptionId} at ${event.expiredAt}${colors.reset}`);
    });

    // Create subscription
    console.log(`${colors.dim}Creating subscription...${colors.reset}`);

    const subscription = await client.subscribe({
      filter: {
        sources: filterSources.length > 0 ? filterSources as ('github' | 'gmail' | 'slack' | 'custom')[] : undefined,
        eventTypes: filterTypes.length > 0 ? filterTypes : undefined,
      },
      delivery: {
        channels: ['websocket'],
        priority: 'realtime',
      },
    });

    console.log(`${colors.green}✓ Subscribed!${colors.reset} ID: ${colors.dim}${subscription.id}${colors.reset}`);
    console.log(`${colors.green}✓ Status: ${subscription.status}${colors.reset}`);
    console.log('');
    console.log(`${colors.bright}Waiting for events... (Press Ctrl+C to exit)${colors.reset}`);
    console.log('');

    // Keep the process running
    process.on('SIGINT', async () => {
      console.log(`\n${colors.yellow}Disconnecting...${colors.reset}`);
      try {
        await client.unsubscribe(subscription.id);
        console.log(`${colors.dim}Unsubscribed${colors.reset}`);
      } catch {
        // Ignore errors during cleanup
      }
      await client.disconnect();
      console.log(`${colors.green}Goodbye!${colors.reset}`);
      process.exit(0);
    });

    // Keep alive
    await new Promise(() => {});

  } catch (error) {
    console.error(`${colors.red}✗ Error: ${error instanceof Error ? error.message : error}${colors.reset}`);
    console.log(`
${colors.yellow}Troubleshooting:${colors.reset}
  1. Make sure the ASP server is running:
     ${colors.dim}cd examples/webpush-demo && npx tsx server-ws.ts${colors.reset}

  2. Check the server URL is correct:
     ${colors.dim}--server ws://localhost:8080${colors.reset}
`);
    process.exit(1);
  }
}

main();
