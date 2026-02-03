/**
 * Agent Subscription Protocol (ASP) - Agent Client Example
 *
 * This example demonstrates how an AI agent can use the ASP protocol
 * to manage event subscriptions. The design follows MCP's philosophy
 * of giving agents control over their interactions.
 *
 * Key Concepts:
 * 1. Transport Injection: Client works with any transport (WebSocket, SSE, etc.)
 * 2. Capability Discovery: Agent can introspect what's available
 * 3. Schema Discovery: LLM-friendly schemas for reasoning about subscriptions
 * 4. Agent-Controlled Subscriptions: Agent decides what to subscribe to
 */

import { ASPClient, WebSocketTransport } from '@esmcp/client';
import type { ASPCapabilities, ASPSchemaResponse, Subscription } from '@esmcp/core';

// Simulates an AI agent that manages subscriptions
class AIAgent {
  private client: ASPClient;
  private activeSubscriptions: Map<string, Subscription> = new Map();

  constructor(serverUrl: string) {
    // Transport injection - the key to a unified client design
    // This follows MCP's pattern where transport is separate from client logic
    const transport = new WebSocketTransport({
      url: serverUrl,
      reconnect: true,
      maxReconnectAttempts: 5,
    });

    this.client = new ASPClient({
      transport,
      clientInfo: {
        name: 'AI-Agent-Demo',
        version: '1.0.0',
      },
      capabilities: {
        websocket: true,
      },
    });
  }

  async connect(): Promise<void> {
    console.log('Agent: Connecting to ASP server...');
    await this.client.connect();
    console.log('Agent: Connected and initialized');
    console.log('Agent: Server info:', this.client.serverInfo);
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
    console.log('Agent: Disconnected');
  }

  /**
   * Discover server capabilities
   *
   * This is similar to MCP's tool listing - agents can introspect
   * what subscription features are available before using them.
   */
  async discoverCapabilities(): Promise<ASPCapabilities> {
    console.log('\nAgent: Discovering server capabilities...');
    const caps = await this.client.getCapabilities();

    console.log('Agent: Capabilities discovered:');
    console.log('  - Protocol:', caps.protocolName, caps.protocolVersion);
    console.log('  - Max subscriptions:', caps.subscriptions.maxActive);
    console.log('  - Supported sources:', caps.filters.supportedSources.join(', '));
    console.log('  - Delivery channels:', caps.delivery.supportedChannels.join(', '));
    console.log('  - Supports wildcards:', caps.filters.supportsWildcardTypes);
    console.log('  - Supports pause/resume:', caps.subscriptions.supportsPause);

    return caps;
  }

  /**
   * Get operation schemas for LLM reasoning
   *
   * This is the key innovation for agent control - schemas that describe
   * how to subscribe/unsubscribe, enabling LLMs to construct valid requests.
   */
  async getOperationSchemas(): Promise<ASPSchemaResponse> {
    console.log('\nAgent: Fetching operation schemas for LLM reasoning...');
    const schemas = await this.client.getSchema();

    console.log('Agent: Available operations:');
    for (const op of schemas.operations) {
      console.log(`  - ${op.name}: ${op.description}`);
    }

    return schemas;
  }

  /**
   * Subscribe to events based on agent's decision
   *
   * In a real AI agent, this would be called when the LLM decides
   * it needs to monitor certain events based on the conversation context.
   */
  async subscribeToEvents(config: {
    sources: string[];
    eventTypes: string[];
    priority?: string[];
    reason: string;
  }): Promise<Subscription> {
    console.log(`\nAgent: Subscribing to events - Reason: ${config.reason}`);
    console.log(`  Sources: ${config.sources.join(', ')}`);
    console.log(`  Event types: ${config.eventTypes.join(', ')}`);

    const subscription = await this.client.subscribe({
      filter: {
        sources: config.sources as ('github' | 'gmail' | 'slack' | 'custom')[],
        eventTypes: config.eventTypes,
        priority: config.priority as ('low' | 'normal' | 'high' | 'critical')[] | undefined,
      },
      delivery: {
        channels: ['websocket'],
        priority: 'realtime',
      },
    });

    this.activeSubscriptions.set(subscription.id, subscription);
    console.log(`Agent: Subscription created: ${subscription.id}`);

    return subscription;
  }

  /**
   * Unsubscribe when the agent no longer needs events
   */
  async unsubscribe(subscriptionId: string, reason: string): Promise<void> {
    console.log(`\nAgent: Unsubscribing - Reason: ${reason}`);
    await this.client.unsubscribe(subscriptionId);
    this.activeSubscriptions.delete(subscriptionId);
    console.log(`Agent: Unsubscribed from ${subscriptionId}`);
  }

  /**
   * Pause subscription temporarily
   */
  async pauseSubscription(subscriptionId: string, reason: string): Promise<void> {
    console.log(`\nAgent: Pausing subscription - Reason: ${reason}`);
    await this.client.pauseSubscription(subscriptionId);
    console.log(`Agent: Subscription ${subscriptionId} paused`);
  }

  /**
   * Resume a paused subscription
   */
  async resumeSubscription(subscriptionId: string, reason: string): Promise<void> {
    console.log(`\nAgent: Resuming subscription - Reason: ${reason}`);
    await this.client.resumeSubscription(subscriptionId);
    console.log(`Agent: Subscription ${subscriptionId} resumed`);
  }

  /**
   * Register event handler
   *
   * This is where the agent defines what to do when events arrive.
   * In a real AI agent, this might trigger additional LLM reasoning.
   */
  registerEventHandler(pattern: string, handler: (event: unknown, subId: string) => void): void {
    this.client.onEvent(pattern, (event, subscriptionId) => {
      console.log(`\nAgent: Event received for subscription ${subscriptionId}`);
      console.log(`  Type: ${event.type}`);
      console.log(`  Source: ${event.metadata.source}`);
      console.log(`  Priority: ${event.metadata.priority}`);
      handler(event, subscriptionId);
    });
  }

  /**
   * List all active subscriptions
   */
  async listSubscriptions(): Promise<Subscription[]> {
    const subs = await this.client.listSubscriptions();
    console.log(`\nAgent: Current subscriptions (${subs.length}):`);
    for (const sub of subs) {
      console.log(`  - ${sub.id} [${sub.status}]`);
      console.log(`    Filter: ${JSON.stringify(sub.filter)}`);
    }
    return subs;
  }
}

/**
 * Simulates an LLM making decisions about subscriptions
 *
 * In a real system, this would be the LLM's tool-use interface,
 * similar to how MCP tools work.
 */
async function simulateLLMDecisions(agent: AIAgent): Promise<void> {
  // Step 1: Discover what's possible
  await agent.discoverCapabilities();

  // Step 2: Get schemas for reasoning
  const schemas = await agent.getOperationSchemas();

  // Step 3: LLM decides to subscribe (based on user request)
  console.log('\n--- LLM Decision: User asked to monitor GitHub activity ---');

  const githubSub = await agent.subscribeToEvents({
    sources: ['github'],
    eventTypes: ['github.push', 'github.pull_request.*'],
    reason: 'User requested GitHub activity monitoring',
  });

  // Step 4: LLM decides to also monitor high-priority Slack messages
  console.log('\n--- LLM Decision: Also monitor critical Slack messages ---');

  const slackSub = await agent.subscribeToEvents({
    sources: ['slack'],
    eventTypes: ['slack.message'],
    priority: ['high', 'critical'],
    reason: 'Monitor critical team communications',
  });

  // Step 5: Register handlers for when events arrive
  agent.registerEventHandler('github.*', (event, subId) => {
    console.log('  -> Agent would process GitHub event and potentially respond');
  });

  agent.registerEventHandler('slack.*', (event, subId) => {
    console.log('  -> Agent would process Slack event and potentially respond');
  });

  // Step 6: List current subscriptions
  await agent.listSubscriptions();

  // Step 7: LLM decides to pause GitHub monitoring temporarily
  console.log('\n--- LLM Decision: Pause GitHub monitoring during meeting ---');
  await agent.pauseSubscription(githubSub.id, 'User is in a meeting');

  // Step 8: Resume after meeting
  console.log('\n--- LLM Decision: Resume GitHub monitoring after meeting ---');
  await agent.resumeSubscription(githubSub.id, 'Meeting ended');

  // Step 9: Clean up when done
  console.log('\n--- LLM Decision: Task complete, cleaning up subscriptions ---');
  await agent.unsubscribe(githubSub.id, 'Task completed');
  await agent.unsubscribe(slackSub.id, 'Task completed');

  await agent.listSubscriptions();
}

// Main entry point
async function main(): Promise<void> {
  const serverUrl = process.env.ASP_SERVER_URL || 'ws://localhost:3000';

  console.log('='.repeat(60));
  console.log('Agent Subscription Protocol (ASP) - Agent Demo');
  console.log('='.repeat(60));
  console.log(`\nConnecting to: ${serverUrl}`);

  const agent = new AIAgent(serverUrl);

  try {
    await agent.connect();
    await simulateLLMDecisions(agent);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await agent.disconnect();
  }
}

main().catch(console.error);
