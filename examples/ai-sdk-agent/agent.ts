#!/usr/bin/env npx tsx
/**
 * AI SDK Agent with ASP Subscription Tools
 *
 * This example demonstrates how to use the Vercel AI SDK with ASP tools,
 * allowing an AI agent to subscribe and unsubscribe to events using
 * natural language.
 *
 * The agent can:
 * - Discover available event sources
 * - Subscribe to events based on user requests
 * - Pause/resume subscriptions
 * - Check received events
 * - Clean up subscriptions when done
 *
 * Usage:
 *   ANTHROPIC_API_KEY=xxx npx tsx agent.ts
 *
 * Or with OpenAI:
 *   OPENAI_API_KEY=xxx npx tsx agent.ts --provider openai
 */

import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { ASPClient, WebSocketTransport } from '@esmcp/client';
import { createASPTools, createEventCheckTool, EventBuffer } from './tools.js';

const ASP_SERVER = process.env.ASP_SERVER || 'ws://localhost:8080';
const PROVIDER = process.argv.includes('--provider')
  ? process.argv[process.argv.indexOf('--provider') + 1]
  : 'anthropic';

// Choose model based on provider
function getModel() {
  if (PROVIDER === 'openai') {
    return openai('gpt-4o');
  }
  return anthropic('claude-sonnet-4-20250514');
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       🤖 AI SDK Agent with ASP Subscription Tools            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`Provider: ${PROVIDER}`);
  console.log(`ASP Server: ${ASP_SERVER}`);
  console.log();

  // Create ASP client with WebSocket transport
  const transport = new WebSocketTransport({
    url: ASP_SERVER,
    reconnect: true,
  });

  const client = new ASPClient({
    transport,
    clientInfo: {
      name: 'AI-SDK-Agent',
      version: '1.0.0',
    },
  });

  // Event buffer to collect received events
  const eventBuffer = new EventBuffer(100);

  // Register event handler
  client.onEvent('*', (event, subscriptionId) => {
    console.log(`\n📨 Event received: ${event.type} (sub: ${subscriptionId.slice(0, 8)}...)`);
    eventBuffer.add(event, subscriptionId);
  });

  // Connect to ASP server
  console.log('Connecting to ASP server...');
  await client.connect();
  console.log('✅ Connected!\n');

  // Create ASP tools for the AI agent
  const aspTools = createASPTools(client);
  const eventTools = createEventCheckTool(eventBuffer);
  const tools = { ...aspTools, ...eventTools };

  // Example conversations to run
  const conversations = [
    // Conversation 1: Discovery and subscription
    {
      name: 'Discover and Subscribe',
      prompt: `You are an AI assistant helping monitor development activity.

First, discover what event sources are available.
Then, subscribe to all GitHub events (use a wildcard pattern like "github.*") because the user wants to monitor repository activity.
Explain what you did.`,
    },
    // Conversation 2: Check events and manage subscriptions
    {
      name: 'Check Events',
      prompt: `Check what subscriptions we currently have.
Then check if any events have been received.
Summarize the current state.`,
    },
    // Conversation 3: Pause and resume
    {
      name: 'Pause During Meeting',
      prompt: `The user is going into a meeting and doesn't want to be distracted.
Pause all active subscriptions temporarily.
Explain what you did.`,
    },
    // Conversation 4: Resume and cleanup
    {
      name: 'Resume and Cleanup',
      prompt: `The meeting is over. Resume any paused subscriptions.
Then, since we're done with monitoring, unsubscribe from everything and clean up.
List final subscription state to confirm cleanup.`,
    },
  ];

  // Run each conversation
  for (const conversation of conversations) {
    console.log('─'.repeat(60));
    console.log(`\n🎯 ${conversation.name}\n`);
    console.log(`User: ${conversation.prompt.slice(0, 100)}...`);
    console.log();

    try {
      const result = await generateText({
        model: getModel(),
        tools,
        maxSteps: 10, // Allow multiple tool calls
        prompt: conversation.prompt,
      });

      console.log('\n🤖 Assistant:', result.text);
      console.log();

      // Show tool calls made
      if (result.steps && result.steps.length > 0) {
        console.log('📋 Tool calls made:');
        for (const step of result.steps) {
          if (step.toolCalls) {
            for (const call of step.toolCalls) {
              console.log(`   - ${call.toolName}(${JSON.stringify(call.args).slice(0, 60)}...)`);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
    }

    // Wait a bit between conversations to see events
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Cleanup
  console.log('\n─'.repeat(60));
  console.log('\n🛑 Agent session complete. Disconnecting...');
  await client.disconnect();
  console.log('✅ Disconnected');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
