/**
 * Direct test of APNS client against the mock APNS server
 *
 * Usage:
 *   1. Start mock APNS: pnpm start:mock-apns
 *   2. Run this test: npx tsx test-apns-direct.ts
 */

import * as http2 from 'node:http2';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NotificationBuilder } from '@esmcp/apns';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOCK_APNS_PORT = 2197;

async function testAPNS() {
  console.log('🧪 Testing APNS Client against Mock Server\n');

  // Read mock server's self-signed cert
  const certPath = path.join(__dirname, 'certs', 'server.crt');
  if (!fs.existsSync(certPath)) {
    console.error('❌ Mock APNS server certificates not found.');
    console.error('   Start the mock server first: pnpm start:mock-apns');
    process.exit(1);
  }
  const ca = fs.readFileSync(certPath);

  // Connect to mock APNS
  const session = http2.connect(`https://localhost:${MOCK_APNS_PORT}`, {
    ca,
    rejectUnauthorized: false,
  });

  await new Promise<void>((resolve, reject) => {
    session.on('connect', resolve);
    session.on('error', reject);
  });

  console.log('✅ Connected to Mock APNS server\n');

  // Test 1: Send a valid push notification
  console.log('Test 1: Valid push notification');
  const validToken = 'a'.repeat(64);
  const notification1 = NotificationBuilder.create()
    .title('New GitHub Push')
    .body('User pushed 3 commits to main branch')
    .sound('default')
    .badge(1)
    .customData('eventId', 'evt-123')
    .topic('com.example.app')
    .build();

  let response = await sendNotification(session, validToken, notification1);
  console.log(`   Token: ${validToken.substring(0, 20)}...`);
  console.log(`   Status: ${response.status} ${response.status === 200 ? '✅' : '❌'}`);
  console.log(`   APNS-ID: ${response.apnsId || 'none'}\n`);

  // Test 2: Send a silent/background notification
  console.log('Test 2: Silent background notification');
  const notification2 = NotificationBuilder.create()
    .contentAvailable()
    .customData('eventId', 'evt-456')
    .customData('eventType', 'github.sync')
    .topic('com.example.app')
    .build();

  response = await sendNotification(session, validToken, notification2);
  console.log(`   Push Type: background`);
  console.log(`   Status: ${response.status} ${response.status === 200 ? '✅' : '❌'}\n`);

  // Test 3: Send to invalid token
  console.log('Test 3: Invalid device token');
  response = await sendNotification(session, 'invalid-token-123', notification1);
  console.log(`   Token: invalid-token-123`);
  console.log(`   Status: ${response.status} ${response.status === 410 ? '✅ (expected)' : '❌'}`);
  console.log(`   Reason: ${response.reason || 'none'}\n`);

  // Test 4: Create notification from event
  console.log('Test 4: Notification from ESMCP event');
  const mockEvent = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    type: 'gmail.message',
    data: { from: 'boss@company.com', subject: 'Urgent: Review needed' },
    metadata: {
      source: 'gmail' as const,
      timestamp: new Date().toISOString(),
      priority: 'high' as const,
    },
  };

  const notification4 = NotificationBuilder.fromEvent(mockEvent, {
    titlePrefix: '📧 Email',
  }).build();

  response = await sendNotification(session, validToken, notification4);
  console.log(`   Event Type: ${mockEvent.type}`);
  console.log(`   Status: ${response.status} ${response.status === 200 ? '✅' : '❌'}\n`);

  // Test 5: High priority time-sensitive notification
  console.log('Test 5: Time-sensitive notification');
  const notification5 = NotificationBuilder.create()
    .title('Critical Alert')
    .body('Production server is down!')
    .interruptionLevel('time-sensitive')
    .relevanceScore(1.0)
    .priority(10)
    .topic('com.example.app')
    .build();

  response = await sendNotification(session, validToken, notification5);
  console.log(`   Interruption: time-sensitive`);
  console.log(`   Status: ${response.status} ${response.status === 200 ? '✅' : '❌'}\n`);

  // Check all received notifications
  console.log('Fetching all received notifications from mock server...');
  const allNotifications = await fetchNotifications(session);
  console.log(`\n📋 Total notifications received by mock server: ${allNotifications.count}\n`);

  session.close();
  console.log('✅ All tests completed!\n');
}

async function sendNotification(
  session: http2.ClientHttp2Session,
  deviceToken: string,
  notification: ReturnType<typeof NotificationBuilder.prototype.build>
): Promise<{ status: number; apnsId?: string; reason?: string }> {
  return new Promise((resolve, reject) => {
    const headers: http2.OutgoingHttpHeaders = {
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      'authorization': 'bearer fake-jwt-token-for-testing',
      'apns-topic': notification.topic || 'com.example.app',
      'apns-push-type': notification.pushType || 'alert',
    };

    if (notification.priority) {
      headers['apns-priority'] = String(notification.priority);
    }

    const req = session.request(headers);
    let responseHeaders: http2.IncomingHttpHeaders;
    let data = '';

    req.on('response', (h) => { responseHeaders = h; });
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      const status = Number(responseHeaders[':status']);
      const apnsId = responseHeaders['apns-id'] as string;
      let reason: string | undefined;
      if (data) {
        try { reason = JSON.parse(data).reason; } catch {}
      }
      resolve({ status, apnsId, reason });
    });
    req.on('error', reject);

    req.write(JSON.stringify(notification.payload));
    req.end();
  });
}

async function fetchNotifications(
  session: http2.ClientHttp2Session
): Promise<{ count: number; notifications: unknown[] }> {
  return new Promise((resolve, reject) => {
    const req = session.request({
      ':method': 'GET',
      ':path': '/notifications',
    });

    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({ count: 0, notifications: [] });
      }
    });
    req.on('error', reject);
    req.end();
  });
}

testAPNS().catch((err) => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
