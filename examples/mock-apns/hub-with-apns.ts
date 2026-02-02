/**
 * Event Hub with APNS delivery enabled (using mock APNS server)
 */

import * as http2 from 'node:http2';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventHub, MemoryDeviceStore, APNSDelivery } from '@esmcp/server';
import { createEvent } from '@esmcp/core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HUB_PORT = 8080;
const MOCK_APNS_PORT = 2197;

// Fake APNS credentials (mock server accepts anything)
const FAKE_PRIVATE_KEY = `-----BEGIN EC PRIVATE KEY-----
MHQCAQEEIFqNzgllrWkLl7YPxHU3HVq1mHVQKE8GqLgVS0H8sOAHoAcGBSuBBAAK
oUQDQgAEQwYQgLVGxtDp0jAq2hCyQ7xsQiVHJTH3pOd11OyP5k4RIUjBwYBHlHKc
9QQAH1H0GH0H0H0H0H0H0H0H0H0H0A==
-----END EC PRIVATE KEY-----`;

// Create a mock APNS client that connects to our local mock server
class MockAPNSClient {
  private session: http2.ClientHttp2Session | null = null;

  async connect(): Promise<void> {
    if (this.session && !this.session.closed) return;

    // Read the self-signed cert to trust it
    const certPath = path.join(__dirname, 'certs', 'server.crt');
    let ca: Buffer | undefined;
    if (fs.existsSync(certPath)) {
      ca = fs.readFileSync(certPath);
    }

    return new Promise((resolve, reject) => {
      this.session = http2.connect(`https://localhost:${MOCK_APNS_PORT}`, {
        ca,
        rejectUnauthorized: false, // Accept self-signed cert
      });

      this.session.on('connect', () => {
        console.log('✅ Connected to Mock APNS server');
        resolve();
      });

      this.session.on('error', (err) => {
        console.error('APNS connection error:', err.message);
        reject(err);
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.session) {
      this.session.close();
      this.session = null;
    }
  }

  async send(deviceToken: string, notification: any): Promise<{ status: number; apnsId?: string; reason?: string }> {
    await this.connect();

    if (!this.session) throw new Error('Not connected');

    return new Promise((resolve, reject) => {
      const headers: http2.OutgoingHttpHeaders = {
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        'authorization': 'bearer fake-jwt-token',
        'apns-topic': notification.topic || 'com.example.app',
        'apns-push-type': notification.pushType || 'alert',
        'apns-priority': String(notification.priority || 10),
      };

      const req = this.session!.request(headers);
      let responseHeaders: http2.IncomingHttpHeaders;
      let data = '';

      req.on('response', (headers) => {
        responseHeaders = headers;
      });

      req.on('data', (chunk) => {
        data += chunk;
      });

      req.on('end', () => {
        const status = Number(responseHeaders[':status']);
        const apnsId = responseHeaders['apns-id'] as string;
        let reason: string | undefined;

        if (data) {
          try {
            const body = JSON.parse(data);
            reason = body.reason;
          } catch {}
        }

        resolve({ status, apnsId, reason });
      });

      req.on('error', reject);
      req.write(JSON.stringify(notification.payload));
      req.end();
    });
  }
}

async function main() {
  // Create the Event Hub
  const hub = new EventHub({
    port: HUB_PORT,
    serverInfo: {
      name: 'ESMCP Hub with APNS',
      version: '1.0.0',
    },
    supportedProviders: ['github', 'gmail', 'slack'],
  });

  // Create device store and APNS delivery
  const deviceStore = new MemoryDeviceStore();
  const apnsDelivery = new APNSDelivery({
    deviceStore,
    apnsOptions: {
      teamId: 'FAKE_TEAM',
      keyId: 'FAKE_KEY',
      privateKey: FAKE_PRIVATE_KEY,
      bundleId: 'com.example.app',
      sandbox: true,
    },
  });

  // Set the mock APNS client
  const mockClient = new MockAPNSClient();
  apnsDelivery.setClient(mockClient);

  // Pre-register a test device
  const testDeviceToken = 'a'.repeat(64); // Valid 64-char hex token
  await deviceStore.create({
    id: 'test-device-1',
    clientId: 'test-client', // This should match connected client
    token: testDeviceToken,
    platform: 'ios',
    bundleId: 'com.example.app',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  console.log(`\n📱 Pre-registered test device token: ${testDeviceToken.substring(0, 20)}...`);

  await hub.start();
  console.log(`\n🚀 Event Hub started on port ${HUB_PORT}`);

  // Simulate publishing events
  let eventCount = 0;
  setInterval(async () => {
    eventCount++;
    const eventTypes = [
      { type: 'github.push', source: 'github' as const, data: { repository: 'test/repo', branch: 'main', commit: `abc${eventCount}` } },
      { type: 'gmail.message', source: 'gmail' as const, data: { from: 'sender@example.com', subject: `Message #${eventCount}` } },
    ];

    const randomEvent = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    const event = createEvent(randomEvent.type, randomEvent.data, {
      source: randomEvent.source,
      priority: eventCount % 3 === 0 ? 'high' : 'normal',
    });

    console.log(`\n📤 Publishing event: ${event.type} (${event.id.substring(0, 8)}...)`);

    // The hub will try WebSocket first, then APNS
    await hub.publishEvent(event);

    // Also send directly via APNS for testing
    if (eventCount % 2 === 0) {
      console.log('   Also sending via APNS directly...');
      try {
        const response = await mockClient.send(testDeviceToken, {
          payload: {
            aps: {
              alert: { title: event.type, body: JSON.stringify(event.data).slice(0, 50) },
              sound: 'default',
            },
            esmcp: { eventId: event.id, eventType: event.type },
          },
          topic: 'com.example.app',
          pushType: 'alert',
          priority: 10,
        });
        console.log(`   APNS Response: ${response.status} (${response.apnsId?.substring(0, 8) || 'no-id'})`);
      } catch (err) {
        console.log(`   APNS Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  }, 5000);

  console.log('\n⏳ Publishing events every 5 seconds...');
  console.log('   Press Ctrl+C to stop\n');

  process.on('SIGINT', async () => {
    console.log('\n\nShutting down...');
    await mockClient.disconnect();
    await hub.stop();
    process.exit(0);
  });
}

main().catch(console.error);
