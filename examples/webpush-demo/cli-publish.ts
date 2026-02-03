#!/usr/bin/env npx tsx
/**
 * CLI Event Publisher
 *
 * Publishes events to the ESMCP server via HTTP API.
 * Connected clients will receive these events via their subscriptions.
 *
 * Usage:
 *   npx tsx cli-publish.ts <type> [data] [options]
 *
 * Examples:
 *   npx tsx cli-publish.ts github.push '{"repo":"test","commits":3}'
 *   npx tsx cli-publish.ts slack.message '{"channel":"general","text":"Hello"}'
 *   npx tsx cli-publish.ts custom.alert '{"message":"Alert!"}' --priority high
 *   npx tsx cli-publish.ts --test
 */

// Parse command line arguments
const args = process.argv.slice(2);

let serverUrl = 'http://localhost:3001';
let eventType = '';
let eventData: Record<string, unknown> = {};
let source = 'custom';
let priority = 'normal';
let tags: string[] = [];
let isTest = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === '--server' && args[i + 1]) {
    serverUrl = args[i + 1];
    i++;
  } else if (arg === '--source' && args[i + 1]) {
    source = args[i + 1];
    i++;
  } else if (arg === '--priority' && args[i + 1]) {
    priority = args[i + 1];
    i++;
  } else if (arg === '--tags' && args[i + 1]) {
    tags = args[i + 1].split(',');
    i++;
  } else if (arg === '--test') {
    isTest = true;
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
CLI Event Publisher

Publishes events to the ESMCP server. Connected clients will receive
these events via their WebSocket subscriptions.

Usage:
  npx tsx cli-publish.ts <type> [data] [options]
  npx tsx cli-publish.ts --test

Arguments:
  type        Event type (e.g., github.push, slack.message, custom.alert)
  data        JSON data for the event (default: {})

Options:
  --server <url>       HTTP server URL (default: http://localhost:3001)
  --source <source>    Event source: github, gmail, slack, custom (default: custom)
  --priority <level>   Priority: low, normal, high, critical (default: normal)
  --tags <tags>        Comma-separated tags
  --test               Send a quick test event
  --help, -h           Show this help message

Examples:
  # Send a GitHub push event
  npx tsx cli-publish.ts github.push '{"repo":"myrepo","commits":5}'

  # Send a high-priority Slack message
  npx tsx cli-publish.ts slack.message '{"channel":"alerts","text":"Alert!"}' --source slack --priority high

  # Send a custom event with tags
  npx tsx cli-publish.ts custom.deployment '{"env":"prod"}' --tags "deploy,prod"

  # Quick test
  npx tsx cli-publish.ts --test
`);
    process.exit(0);
  } else if (!arg.startsWith('--')) {
    if (!eventType) {
      eventType = arg;
    } else {
      try {
        eventData = JSON.parse(arg);
      } catch {
        console.error(`Error: Invalid JSON data: ${arg}`);
        process.exit(1);
      }
    }
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
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

async function main() {
  if (isTest) {
    // Quick test endpoint
    console.log(`${colors.cyan}📤 Sending test event to ${serverUrl}/test${colors.reset}`);

    const response = await fetch(`${serverUrl}/test`, { method: 'POST' });
    const result = await response.json();

    if (result.success) {
      console.log(`${colors.green}✓ Test event published!${colors.reset}`);
      console.log(`  Event ID: ${colors.dim}${result.eventId}${colors.reset}`);
    } else {
      console.log(`${colors.red}✗ Failed: ${result.error}${colors.reset}`);
    }
    return;
  }

  if (!eventType) {
    console.error(`${colors.red}Error: Event type is required${colors.reset}`);
    console.log(`Use --help for usage information`);
    process.exit(1);
  }

  // Auto-detect source from event type prefix
  if (eventType.startsWith('github.')) source = 'github';
  else if (eventType.startsWith('gmail.')) source = 'gmail';
  else if (eventType.startsWith('slack.')) source = 'slack';

  console.log(`
${colors.cyan}╔════════════════════════════════════════════════════════════════╗
║  📤 ESMCP Event Publisher                                       ║
╚════════════════════════════════════════════════════════════════╝${colors.reset}
`);

  console.log(`  ${colors.bright}Type:${colors.reset}     ${eventType}`);
  console.log(`  ${colors.bright}Source:${colors.reset}   ${source}`);
  console.log(`  ${colors.bright}Priority:${colors.reset} ${priority}`);
  if (tags.length > 0) {
    console.log(`  ${colors.bright}Tags:${colors.reset}     ${tags.join(', ')}`);
  }
  console.log(`  ${colors.bright}Data:${colors.reset}     ${JSON.stringify(eventData)}`);
  console.log('');

  const body = {
    type: eventType,
    data: eventData,
    source,
    priority,
    tags,
  };

  try {
    const response = await fetch(`${serverUrl}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const result = await response.json() as { success?: boolean; eventId?: string; error?: string };

    if (result.success) {
      console.log(`${colors.green}✓ Event published successfully!${colors.reset}`);
      console.log(`  Event ID: ${colors.dim}${result.eventId}${colors.reset}`);
      console.log('');
      console.log(`${colors.dim}Connected clients with matching subscriptions will receive this event.${colors.reset}`);
    } else {
      console.log(`${colors.red}✗ Failed to publish event: ${result.error}${colors.reset}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`${colors.red}✗ Error: ${error instanceof Error ? error.message : error}${colors.reset}`);
    console.log(`
${colors.yellow}Troubleshooting:${colors.reset}
  Make sure the server is running:
  ${colors.dim}npx tsx server-ws.ts${colors.reset}
`);
    process.exit(1);
  }
}

main();
