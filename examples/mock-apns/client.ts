/**
 * Client that connects to the Event Hub and registers for APNS
 */

import { ESMCPClient } from '@esmcp/client';

const SERVER_URL = 'ws://localhost:8080';

async function main() {
  console.log('🔌 Connecting to Event Hub...');

  const client = new ESMCPClient({
    serverUrl: SERVER_URL,
    clientInfo: {
      name: 'APNS Test Client',
      version: '1.0.0',
    },
    capabilities: {
      websocket: true,
      apns: true,
    },
  });

  // Set up event handlers
  client.onEvent('*', (event, subscriptionId) => {
    console.log(`\n📥 Received event via WebSocket:`);
    console.log(`   Type: ${event.type}`);
    console.log(`   ID: ${event.id.substring(0, 8)}...`);
    console.log(`   Data: ${JSON.stringify(event.data)}`);
  });

  await client.connect();
  console.log('✅ Connected!');
  console.log(`   Server: ${client.serverInfo?.name} v${client.serverInfo?.version}`);

  // Create subscriptions
  const githubSub = await client.subscribe({
    filter: {
      sources: ['github'],
    },
    delivery: {
      channels: ['websocket', 'apns'],
      priority: 'realtime',
      apnsAlert: true,
    },
  });
  console.log(`\n📋 Subscribed to GitHub events: ${githubSub.id.substring(0, 8)}...`);

  const gmailSub = await client.subscribe({
    filter: {
      sources: ['gmail'],
    },
    delivery: {
      channels: ['websocket', 'apns'],
      priority: 'normal',
      apnsAlert: true,
    },
  });
  console.log(`📋 Subscribed to Gmail events: ${gmailSub.id.substring(0, 8)}...`);

  // Register device token for APNS
  const testToken = 'a'.repeat(64);
  const deviceId = await client.registerDeviceToken(testToken, 'ios', 'com.example.app');
  console.log(`\n📱 Registered device for APNS: ${deviceId.substring(0, 8)}...`);

  console.log('\n⏳ Listening for events... (Press Ctrl+C to stop)\n');

  process.on('SIGINT', async () => {
    console.log('\n\nCleaning up...');
    await client.unsubscribe(githubSub.id);
    await client.unsubscribe(gmailSub.id);
    await client.invalidateDevice(deviceId);
    await client.disconnect();
    console.log('Disconnected.');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
