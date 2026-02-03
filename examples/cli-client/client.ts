#!/usr/bin/env npx tsx
/**
 * CLI Client for ASP (Agent Subscription Protocol)
 *
 * Subscribe to events from the command line and receive them in real-time.
 * Works alongside browser clients - all clients receive the same events.
 *
 * Usage:
 *   npx tsx client.ts                    # Subscribe to all events
 *   npx tsx client.ts --source github    # Subscribe to GitHub events only
 *   npx tsx client.ts --source gmail     # Subscribe to Gmail events only
 *   npx tsx client.ts --type "github.*"  # Subscribe to GitHub events with wildcard
 *   npx tsx client.ts --interactive      # Interactive mode with menu
 */

import { ASPClient, WebSocketTransport } from '@esmcp/client';
import type { ESMCPEvent, Subscription } from '@esmcp/core';

const SERVER_URL = process.env.ASP_SERVER || process.env.ESMCP_SERVER || 'ws://localhost:8080';

interface CLIOptions {
  sources?: string[];
  eventTypes?: string[];
  tags?: string[];
  priority?: string[];
  interactive?: boolean;
  duration?: number; // Run for N seconds then exit (0 = forever)
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = { duration: 0 };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--source':
        options.sources = options.sources || [];
        options.sources.push(args[++i]);
        break;
      case '--type':
        options.eventTypes = options.eventTypes || [];
        options.eventTypes.push(args[++i]);
        break;
      case '--tag':
        options.tags = options.tags || [];
        options.tags.push(args[++i]);
        break;
      case '--priority':
        options.priority = options.priority || [];
        options.priority.push(args[++i]);
        break;
      case '--interactive':
      case '-i':
        options.interactive = true;
        break;
      case '--duration':
        options.duration = parseInt(args[++i], 10) * 1000;
        break;
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
        break;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
📡 ESMCP CLI Client

Subscribe to events from the command line and receive them in real-time.

USAGE:
  npx tsx client.ts [OPTIONS]

OPTIONS:
  --source <name>      Filter by source (github, gmail, slack, custom)
  --type <pattern>     Filter by event type (supports wildcards like "github.*")
  --tag <tag>          Filter by tag
  --priority <level>   Filter by priority (low, normal, high, critical)
  --interactive, -i    Interactive mode with subscription management
  --duration <secs>    Run for N seconds then exit (default: forever)
  --help, -h           Show this help

EXAMPLES:
  # Subscribe to all events
  npx tsx client.ts

  # Subscribe to GitHub events only
  npx tsx client.ts --source github

  # Subscribe to GitHub push and PR events
  npx tsx client.ts --type "github.push" --type "github.pull_request"

  # Subscribe to high priority events from any source
  npx tsx client.ts --priority high

  # Interactive mode
  npx tsx client.ts --interactive

  # Run for 30 seconds then exit
  npx tsx client.ts --source github --duration 30

ENVIRONMENT:
  ESMCP_SERVER         Server URL (default: ws://localhost:8080)
`);
}

function formatEvent(event: ESMCPEvent): string {
  const timestamp = new Date(event.metadata.timestamp).toLocaleTimeString();
  const source = event.metadata.source;
  const priority = event.metadata.priority;
  const type = event.type;

  // Color codes for terminal
  const colors: Record<string, string> = {
    github: '\x1b[36m', // Cyan
    gmail: '\x1b[31m', // Red
    slack: '\x1b[35m', // Magenta
    custom: '\x1b[33m', // Yellow
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    bold: '\x1b[1m',
  };

  const priorityEmoji: Record<string, string> = {
    low: '⚪',
    normal: '🔵',
    high: '🟠',
    critical: '🔴',
  };

  const color = colors[source] || colors.custom;
  const emoji = priorityEmoji[priority] || '⚪';

  return `
${colors.dim}[${timestamp}]${colors.reset} ${emoji} ${color}${colors.bold}[${source.toUpperCase()}]${colors.reset} ${type}
   ${JSON.stringify(event.data, null, 2).split('\n').join('\n   ')}
   ${colors.dim}ID: ${event.id}${colors.reset}`;
}

async function runClient(options: CLIOptions) {
  console.log('🔌 Connecting to server...');
  console.log(`   URL: ${SERVER_URL}`);

  const transport = new WebSocketTransport({
    url: SERVER_URL,
    reconnect: true,
    reconnectInterval: 1000,
    maxReconnectAttempts: 5,
  });

  const client = new ASPClient({
    transport,
    clientInfo: {
      name: 'ASP CLI Client',
      version: '1.0.0',
    },
    capabilities: {
      websocket: true,
      apns: false,
    },
  });

  // Set up event handler
  client.onEvent('*', (event: ESMCPEvent, subscriptionId: string) => {
    console.log(formatEvent(event));
    console.log(); // Empty line between events
  });

  // Connect to server
  await client.connect();
  console.log('✅ Connected!');
  console.log(`   Server: ${client.serverInfo?.name} v${client.serverInfo?.version}`);

  // Use ASP capability discovery
  const capabilities = await client.getCapabilities();
  console.log(`   Capabilities: ${capabilities.filters.supportedSources.join(', ')}`);
  console.log();

  // Create subscription based on filters
  const filter: any = {};
  if (options.sources?.length) filter.sources = options.sources;
  if (options.eventTypes?.length) filter.eventTypes = options.eventTypes;
  if (options.tags?.length) filter.tags = options.tags;
  if (options.priority?.length) filter.priority = options.priority;

  console.log('📋 Creating subscription...');
  if (Object.keys(filter).length > 0) {
    console.log('   Filters:', JSON.stringify(filter, null, 2).replace(/\n/g, '\n   '));
  } else {
    console.log('   No filters - receiving ALL events');
  }

  const subscription = await client.subscribe({
    filter,
    delivery: {
      channels: ['websocket'],
      priority: 'realtime',
    },
  });

  console.log(`✅ Subscription created: ${subscription.id}`);
  console.log();
  console.log('📡 Listening for events... (Press Ctrl+C to exit)');
  console.log('─'.repeat(60));
  console.log();

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('\n\n🛑 Shutting down...');
    await client.unsubscribe(subscription.id);
    await client.disconnect();
    console.log('✅ Disconnected');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Auto-exit if duration specified
  if (options.duration && options.duration > 0) {
    setTimeout(() => {
      console.log(`\n\n⏱️  Duration reached (${options.duration! / 1000}s)`);
      shutdown();
    }, options.duration);
  }
}

async function runInteractive() {
  console.log('🔌 Connecting to server...');

  const transport = new WebSocketTransport({
    url: SERVER_URL,
    reconnect: true,
  });

  const client = new ASPClient({
    transport,
    clientInfo: {
      name: 'ASP CLI Client (Interactive)',
      version: '1.0.0',
    },
    capabilities: {
      websocket: true,
      apns: false,
    },
  });

  // Buffer events for display
  const eventBuffer: { event: ESMCPEvent; time: Date }[] = [];
  let subscriptions: Subscription[] = [];

  client.onEvent('*', (event: ESMCPEvent) => {
    eventBuffer.push({ event, time: new Date() });
    // Keep only last 50 events
    if (eventBuffer.length > 50) eventBuffer.shift();
    redrawScreen();
  });

  await client.connect();

  function redrawScreen() {
    // Clear screen (works in most terminals)
    console.clear();

    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║           📡 ESMCP CLI Client - Interactive Mode             ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║  Server: ${SERVER_URL.padEnd(52)} ║`);
    console.log(`║  Status: ${'✅ Connected'.padEnd(52)} ║`);
    console.log(`║  Subscriptions: ${subscriptions.length.toString().padEnd(44)} ║`);
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log('║  Commands: [s]ubscribe [u]nsubscribe [l]ist [r]efresh [q]uit ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log();

    // Show recent events
    console.log('─'.repeat(60));
    console.log('📨 RECENT EVENTS (last 10):');
    console.log('─'.repeat(60));

    const recent = eventBuffer.slice(-10);
    if (recent.length === 0) {
      console.log('   (No events yet...)');
    } else {
      recent.forEach(({ event, time }) => {
        const timeStr = time.toLocaleTimeString();
        console.log(`   [${timeStr}] ${event.metadata.source}: ${event.type}`);
      });
    }

    console.log();
    console.log('─'.repeat(60));
    console.log('Press a command key...');
  }

  // Initial draw
  redrawScreen();

  // Handle keyboard input
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', async (key: string) => {
    switch (key.toLowerCase()) {
      case 'q':
      case '\u0003': // Ctrl+C
        console.log('\n\n🛑 Shutting down...');
        for (const sub of subscriptions) {
          await client.unsubscribe(sub.id);
        }
        await client.disconnect();
        console.log('✅ Disconnected');
        process.exit(0);
        break;

      case 's':
        // Quick subscribe to all
        const sub = await client.subscribe({
          filter: {},
          delivery: { channels: ['websocket'], priority: 'realtime' },
        });
        subscriptions.push(sub);
        redrawScreen();
        break;

      case 'l':
        subscriptions = await client.listSubscriptions();
        redrawScreen();
        break;

      case 'r':
        redrawScreen();
        break;

      case 'u':
        if (subscriptions.length > 0) {
          await client.unsubscribe(subscriptions[0].id);
          subscriptions.shift();
          redrawScreen();
        }
        break;
    }
  });
}

async function main() {
  const options = parseArgs();

  console.log();
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    📡 ESMCP CLI Client                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();

  try {
    if (options.interactive) {
      await runInteractive();
    } else {
      await runClient(options);
    }
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
