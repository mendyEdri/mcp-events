#!/usr/bin/env npx tsx
/**
 * Interactive AI Agent with ASP Subscription Tools
 *
 * Chat with an AI agent that can manage your event subscriptions.
 * The agent uses natural language to understand your intent and
 * calls the appropriate ASP tools.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=xxx npx tsx interactive.ts
 *
 * Example commands:
 *   "What event sources are available?"
 *   "Subscribe to GitHub push events"
 *   "Show me my current subscriptions"
 *   "Pause the GitHub subscription"
 *   "Check if any events have arrived"
 *   "Unsubscribe from everything"
 */

import * as readline from 'readline';
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { ASPClient, WebSocketTransport } from '@esmcp/client';
import { createASPTools, createEventCheckTool, EventBuffer } from './tools.js';

const ASP_SERVER = process.env.ASP_SERVER || 'ws://localhost:8080';
const PROVIDER = process.argv.includes('--provider')
  ? process.argv[process.argv.indexOf('--provider') + 1]
  : 'anthropic';

function getModel() {
  if (PROVIDER === 'openai') {
    return openai('gpt-4o');
  }
  return anthropic('claude-sonnet-4-20250514');
}

const SYSTEM_PROMPT = `You are an AI assistant that helps users manage event subscriptions using the Agent Subscription Protocol (ASP).

You have access to tools that let you:
- Discover available event sources and capabilities (asp_get_capabilities)
- Subscribe to events from GitHub, Gmail, Slack, etc. (asp_subscribe)
- Unsubscribe from events (asp_unsubscribe)
- List current subscriptions (asp_list_subscriptions)
- Pause subscriptions temporarily (asp_pause_subscription)
- Resume paused subscriptions (asp_resume_subscription)
- Check recent events that have been received (asp_check_events)

When the user asks about events or monitoring, use these tools to help them.
Always explain what you're doing and the results in a clear, friendly way.

Tips:
- Use wildcards like "github.*" to subscribe to all events of a type
- You can filter by priority (low, normal, high, critical)
- Subscriptions can be paused when the user doesn't want notifications`;

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║    🤖 Interactive AI Agent with ASP Subscription Tools       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();
  console.log('Chat with the AI agent to manage your event subscriptions.');
  console.log('Type "exit" or "quit" to end the session.');
  console.log();

  // Create ASP client
  const transport = new WebSocketTransport({
    url: ASP_SERVER,
    reconnect: true,
  });

  const client = new ASPClient({
    transport,
    clientInfo: {
      name: 'AI-SDK-Interactive-Agent',
      version: '1.0.0',
    },
  });

  const eventBuffer = new EventBuffer(100);

  client.onEvent('*', (event, subscriptionId) => {
    console.log(`\n📨 [Event] ${event.type} from ${event.metadata.source}`);
  });

  console.log(`Connecting to ${ASP_SERVER}...`);
  await client.connect();
  console.log('✅ Connected to ASP server!\n');

  // Create tools
  const aspTools = createASPTools(client);
  const eventTools = createEventCheckTool(eventBuffer);
  const tools = { ...aspTools, ...eventTools };

  // Conversation history
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question('\n👤 You: ', async (input) => {
      const trimmed = input.trim();

      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
        console.log('\n🛑 Cleaning up subscriptions...');

        // Cleanup: unsubscribe from everything
        try {
          const subs = await client.listSubscriptions();
          for (const sub of subs) {
            await client.unsubscribe(sub.id);
          }
        } catch (e) {
          // Ignore errors during cleanup
        }

        await client.disconnect();
        console.log('✅ Disconnected. Goodbye!');
        rl.close();
        process.exit(0);
        return;
      }

      if (!trimmed) {
        prompt();
        return;
      }

      // Add user message to history
      messages.push({ role: 'user', content: trimmed });

      try {
        console.log('\n🤖 Agent: Thinking...');

        const result = await generateText({
          model: getModel(),
          tools,
          maxSteps: 5,
          system: SYSTEM_PROMPT,
          messages,
        });

        // Add assistant response to history
        messages.push({ role: 'assistant', content: result.text });

        console.log(`\n🤖 Agent: ${result.text}`);

        // Show tool usage
        if (result.steps && result.steps.length > 0) {
          const toolCalls = result.steps.flatMap((s) => s.toolCalls || []);
          if (toolCalls.length > 0) {
            console.log(`\n   📋 Used ${toolCalls.length} tool(s): ${toolCalls.map((t) => t.toolName).join(', ')}`);
          }
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`\n❌ Error: ${errorMessage}`);
      }

      prompt();
    });
  };

  console.log('─'.repeat(60));
  console.log('Try asking:');
  console.log('  "What event sources are available?"');
  console.log('  "Subscribe to all GitHub events"');
  console.log('  "What subscriptions do I have?"');
  console.log('─'.repeat(60));

  prompt();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
