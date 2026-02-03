#!/usr/bin/env npx tsx
/**
 * CLI Event Publisher
 *
 * Publishes events to the MCP server which will:
 * 1. Deliver via WebSocket to connected clients
 * 2. Send push notifications to subscribed browsers
 *
 * Usage:
 *   npx tsx publish-event.ts github.push '{"repo":"test","commits":3}'
 *   npx tsx publish-event.ts slack.message '{"channel":"#general","message":"Hello"}'
 *   npx tsx publish-event.ts --priority critical --tag alert system.down '{"service":"api"}'
 */

import chalk from 'chalk';

const HTTP_API = 'http://localhost:3000/api/publish';

// Parse arguments
const args = process.argv.slice(2);

function showHelp() {
  console.log(`
${chalk.cyan('╔══════════════════════════════════════════════════════════╗')}
${chalk.cyan('║')}  ${chalk.bold('ESMCP Event Publisher')}                                    ${chalk.cyan('║')}
${chalk.cyan('╠══════════════════════════════════════════════════════════╣')}
${chalk.cyan('║')}                                                          ${chalk.cyan('║')}
${chalk.cyan('║')}  Publishes events to MCP server with push notifications  ${chalk.cyan('║')}
${chalk.cyan('║')}                                                          ${chalk.cyan('║')}
${chalk.cyan('╠══════════════════════════════════════════════════════════╣')}
${chalk.cyan('║')}  ${chalk.bold('Usage:')}                                                    ${chalk.cyan('║')}
${chalk.cyan('║')}    npx tsx publish-event.ts <event-type> [data-json]       ${chalk.cyan('║')}
${chalk.cyan('║')}                                                          ${chalk.cyan('║')}
${chalk.cyan('╠══════════════════════════════════════════════════════════╣')}
${chalk.cyan('║')}  ${chalk.bold('Options:')}                                                  ${chalk.cyan('║')}
${chalk.cyan('║')}    --source <source>    Event source (github, slack,     ${chalk.cyan('║')}
${chalk.cyan('║')}                         gmail, browser, custom)           ${chalk.cyan('║')}
${chalk.cyan('║')}    --priority <level>   Priority: low, normal, high,      ${chalk.cyan('║')}
${chalk.cyan('║')}                         critical (default: normal)        ${chalk.cyan('║')}
${chalk.cyan('║')}    --tag <tag>          Add a tag (can use multiple)      ${chalk.cyan('║')}
${chalk.cyan('║')}    --server <url>       API server URL                    ${chalk.cyan('║')}
${chalk.cyan('║')}    -h, --help           Show this help                    ${chalk.cyan('║')}
${chalk.cyan('║')}                                                          ${chalk.cyan('║')}
${chalk.cyan('╠══════════════════════════════════════════════════════════╣')}
${chalk.cyan('║')}  ${chalk.bold('Examples:')}                                                 ${chalk.cyan('║')}
${chalk.cyan('║')}                                                          ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.dim('# GitHub push event')}                                      ${chalk.cyan('║')}
${chalk.cyan('║')}  npx tsx publish-event.ts github.push                     ${chalk.cyan('║')}
${chalk.cyan('║')}    '{"repo":"my-project","branch":"main","commits":5}'      ${chalk.cyan('║')}
${chalk.cyan('║')}                                                          ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.dim('# Slack message with high priority')}                      ${chalk.cyan('║')}
${chalk.cyan('║')}  npx tsx publish-event.ts slack.message                   ${chalk.cyan('║')}
${chalk.cyan('║')}    --priority high                                        ${chalk.cyan('║')}
${chalk.cyan('║')}    '{"channel":"#alerts","message":"Server down!"}'         ${chalk.cyan('║')}
${chalk.cyan('║')}                                                          ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.dim('# Critical system alert')}                                   ${chalk.cyan('║')}
${chalk.cyan('║')}  npx tsx publish-event.ts system.alert                    ${chalk.cyan('║')}
${chalk.cyan('║')}    --source custom --priority critical                    ${chalk.cyan('║')}
${chalk.cyan('║')}    --tag urgent --tag production                          ${chalk.cyan('║')}
${chalk.cyan('║')}    '{"alert":"Database connection lost"}'                  ${chalk.cyan('║')}
${chalk.cyan('║')}                                                          ${chalk.cyan('║')}
${chalk.cyan('╚══════════════════════════════════════════════════════════╝')}
`);
}

// Parse command line
let eventType: string | null = null;
let eventData: Record<string, unknown> = {};
let source = 'custom';
let priority: 'low' | 'normal' | 'high' | 'critical' = 'normal';
const tags: string[] = [];
let serverUrl = HTTP_API;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === '-h' || arg === '--help') {
    showHelp();
    process.exit(0);
  }

  if (arg === '--source' && args[i + 1]) {
    source = args[i + 1];
    i++;
    continue;
  }

  if (arg === '--priority' && args[i + 1]) {
    priority = args[i + 1] as 'low' | 'normal' | 'high' | 'critical';
    i++;
    continue;
  }

  if (arg === '--tag' && args[i + 1]) {
    tags.push(args[i + 1]);
    i++;
    continue;
  }

  if (arg === '--server' && args[i + 1]) {
    serverUrl = args[i + 1];
    i++;
    continue;
  }

  // First positional arg is event type
  if (!eventType && !arg.startsWith('--')) {
    eventType = arg;
    continue;
  }

  // Second positional arg is data JSON
  if (eventType && !arg.startsWith('--')) {
    try {
      eventData = JSON.parse(arg);
    } catch (e) {
      console.error(chalk.red('Error: Invalid JSON data'));
      console.error(chalk.dim(arg));
      process.exit(1);
    }
    continue;
  }
}

// Infer source from event type if not explicitly set
if (!args.includes('--source') && eventType) {
  if (eventType.startsWith('github.')) source = 'github';
  else if (eventType.startsWith('slack.')) source = 'slack';
  else if (eventType.startsWith('gmail.')) source = 'gmail';
  else if (eventType.startsWith('browser.')) source = 'browser';
}

// Validate
if (!eventType) {
  console.error(chalk.red('Error: Event type is required'));
  console.log(chalk.dim('\nRun with --help for usage information'));
  process.exit(1);
}

// Default data based on event type
if (Object.keys(eventData).length === 0) {
  switch (true) {
    case eventType.startsWith('github.'):
      eventData = {
        repo: 'example-repo',
        branch: 'main',
        actor: 'developer',
      };
      break;
    case eventType.startsWith('slack.'):
      eventData = {
        channel: '#general',
        user: 'user',
        message: 'Hello from Slack!',
      };
      break;
    case eventType.startsWith('gmail.'):
      eventData = {
        subject: 'New email',
        from: 'sender@example.com',
      };
      break;
    default:
      eventData = {
        message: 'Test event',
        timestamp: new Date().toISOString(),
      };
  }
}

// Publish event
async function publishEvent() {
  console.log(chalk.cyan('\n📤 Publishing Event...\n'));

  console.log(chalk.dim('Type:    ') + chalk.white(eventType));
  console.log(chalk.dim('Source:  ') + chalk.white(source));
  console.log(chalk.dim('Priority: ') + formatPriority(priority));
  if (tags.length > 0) {
    console.log(chalk.dim('Tags:    ') + chalk.white(tags.join(', ')));
  }
  console.log(chalk.dim('Data:'));
  console.log(chalk.gray(JSON.stringify(eventData, null, 2)));
  console.log();

  try {
    const response = await fetch(serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: eventType,
        source,
        priority,
        tags,
        data: eventData,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.success) {
      console.log(chalk.green('✅ Event published successfully!'));
      console.log(chalk.dim(`   Event ID: ${result.eventId}`));
      console.log(chalk.dim(`   Time: ${result.timestamp}`));
      
      if (result.pushSubscribers !== undefined) {
        console.log(chalk.dim(`   Push subscribers notified: ${result.pushSubscribers}`));
      }
    } else {
      console.error(chalk.red('❌ Failed to publish event'));
      console.error(chalk.dim(result.error || 'Unknown error'));
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : error);
    console.log(chalk.yellow('\nTroubleshooting:'));
    console.log(chalk.dim('  1. Is the server running? npm run server'));
    console.log(chalk.dim('  2. Check the server URL:'), serverUrl);
    process.exit(1);
  }

  console.log();
}

function formatPriority(p: string): string {
  switch (p) {
    case 'critical':
      return chalk.red.bold('CRITICAL');
    case 'high':
      return chalk.yellow('HIGH');
    case 'normal':
      return chalk.blue('NORMAL');
    case 'low':
      return chalk.gray('LOW');
    default:
      return p;
  }
}

publishEvent();
