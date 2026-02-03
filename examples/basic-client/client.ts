import { ASPClient, WebSocketTransport } from '@esmcp/client';

const SERVER_URL = 'ws://localhost:8080';

async function main() {
  console.log('Creating ASP client with WebSocket transport...');

  // ASP uses transport injection - create transport separately
  const transport = new WebSocketTransport({
    url: SERVER_URL,
    reconnect: true,
    reconnectInterval: 1000,
    maxReconnectAttempts: 5,
  });

  const client = new ASPClient({
    transport,
    clientInfo: {
      name: 'Example Client',
      version: '1.0.0',
    },
    capabilities: {
      websocket: true,
      apns: false,
    },
  });

  // Set up event handlers before connecting
  client.onEvent('github.*', (event, subscriptionId) => {
    console.log(`[GitHub Event] ${event.type}:`, event.data);
  });

  client.onEvent('gmail.*', (event, subscriptionId) => {
    console.log(`[Gmail Event] ${event.type}:`, event.data);
  });

  client.onEvent('*', (event, subscriptionId) => {
    console.log(`[Any Event] Received: ${event.type} (sub: ${subscriptionId})`);
  });

  // Connect to server
  console.log('Connecting to server...');
  await client.connect();
  console.log('Connected!');
  console.log('Server info:', client.serverInfo);

  // Discover capabilities (ASP feature)
  const capabilities = await client.getCapabilities();
  console.log('Server capabilities:', {
    maxSubscriptions: capabilities.subscriptions.maxActive,
    supportedSources: capabilities.filters.supportedSources,
  });

  // Create subscriptions
  console.log('\nCreating subscriptions...');

  const githubSub = await client.subscribe({
    filter: {
      sources: ['github'],
      eventTypes: ['github.*'],
    },
    delivery: {
      channels: ['websocket'],
      priority: 'realtime',
    },
  });
  console.log('Created GitHub subscription:', githubSub.id);

  const gmailSub = await client.subscribe({
    filter: {
      sources: ['gmail'],
    },
    delivery: {
      channels: ['websocket'],
      priority: 'normal',
    },
  });
  console.log('Created Gmail subscription:', gmailSub.id);

  // List subscriptions
  const subscriptions = await client.listSubscriptions();
  console.log('\nActive subscriptions:', subscriptions.length);

  // Keep the client running
  console.log('\nListening for events... (Press Ctrl+C to exit)');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nDisconnecting...');

    // Clean up subscriptions
    await client.unsubscribe(githubSub.id);
    await client.unsubscribe(gmailSub.id);

    await client.disconnect();
    console.log('Disconnected.');
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
