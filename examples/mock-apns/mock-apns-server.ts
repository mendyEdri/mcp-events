/**
 * Mock APNS Server for local testing
 *
 * This simulates Apple's APNS HTTP/2 server behavior.
 * In production, you'd connect to api.push.apple.com or api.sandbox.push.apple.com
 */

import * as http2 from 'node:http2';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = 2197; // APNS uses 443, we use 2197 for local testing

// Store received notifications for inspection
const receivedNotifications: Array<{
  deviceToken: string;
  payload: unknown;
  headers: Record<string, string>;
  timestamp: string;
}> = [];

// Simulated invalid tokens (for testing error handling)
const invalidTokens = new Set(['invalid-token-123', 'expired-token-456']);

async function ensureCertificates() {
  const certPath = path.join(__dirname, 'certs');
  const keyFile = path.join(certPath, 'server.key');
  const certFile = path.join(certPath, 'server.crt');

  if (!fs.existsSync(certPath)) {
    fs.mkdirSync(certPath, { recursive: true });
  }

  if (!fs.existsSync(keyFile) || !fs.existsSync(certFile)) {
    console.log('Generating self-signed certificates for mock APNS...');
    const { execSync } = await import('node:child_process');

    // Generate self-signed certificate
    execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${keyFile}" -out "${certFile}" -days 365 -nodes -subj "/CN=localhost"`, {
      stdio: 'inherit'
    });

    console.log('Certificates generated.');
  }

  return {
    key: fs.readFileSync(keyFile),
    cert: fs.readFileSync(certFile),
  };
}

async function startServer() {
  const { key, cert } = await ensureCertificates();

  const server = http2.createSecureServer({
    key,
    cert,
    allowHTTP1: false,
  });

  server.on('stream', (stream, headers) => {
    const method = headers[':method'];
    const path = headers[':path'] || '';

    // APNS endpoint: POST /3/device/{deviceToken}
    const deviceMatch = path.match(/^\/3\/device\/([a-fA-F0-9]+)$/);

    if (method === 'POST' && deviceMatch) {
      const deviceToken = deviceMatch[1];
      handlePushNotification(stream, headers, deviceToken);
    } else if (method === 'GET' && path === '/notifications') {
      // Debug endpoint to view received notifications
      handleGetNotifications(stream);
    } else {
      stream.respond({ ':status': 404 });
      stream.end(JSON.stringify({ reason: 'NotFound' }));
    }
  });

  server.on('error', (err) => {
    console.error('Server error:', err);
  });

  server.listen(PORT, () => {
    console.log(`\n🍎 Mock APNS Server running on https://localhost:${PORT}`);
    console.log('\nEndpoints:');
    console.log(`  POST /3/device/{token} - Send push notification`);
    console.log(`  GET  /notifications    - View received notifications\n`);
    console.log('Valid test tokens: any 64-char hex string');
    console.log('Invalid tokens (for testing): invalid-token-123, expired-token-456\n');
  });
}

function handlePushNotification(
  stream: http2.ServerHttp2Stream,
  headers: http2.IncomingHttpHeaders,
  deviceToken: string
) {
  let body = '';

  stream.on('data', (chunk) => {
    body += chunk;
  });

  stream.on('end', () => {
    try {
      const payload = JSON.parse(body);
      const apnsId = headers['apns-id'] as string || generateApnsId();
      const topic = headers['apns-topic'] as string;
      const pushType = headers['apns-push-type'] as string;
      const priority = headers['apns-priority'] as string;

      // Validate authorization header
      const auth = headers['authorization'] as string;
      if (!auth || !auth.startsWith('bearer ')) {
        stream.respond({
          ':status': 403,
          'apns-id': apnsId,
        });
        stream.end(JSON.stringify({ reason: 'MissingProviderToken' }));
        return;
      }

      // Check for invalid tokens
      if (invalidTokens.has(deviceToken)) {
        stream.respond({
          ':status': 410,
          'apns-id': apnsId,
        });
        stream.end(JSON.stringify({
          reason: 'Unregistered',
          timestamp: Date.now()
        }));
        return;
      }

      // Validate token format (should be 64 hex characters for real tokens)
      if (!/^[a-fA-F0-9]{64}$/.test(deviceToken) && deviceToken.length < 10) {
        stream.respond({
          ':status': 400,
          'apns-id': apnsId,
        });
        stream.end(JSON.stringify({ reason: 'BadDeviceToken' }));
        return;
      }

      // Store notification
      const notification = {
        deviceToken,
        payload,
        headers: {
          topic: topic || 'unknown',
          pushType: pushType || 'alert',
          priority: priority || '10',
          apnsId,
        },
        timestamp: new Date().toISOString(),
      };
      receivedNotifications.push(notification);

      // Log received notification
      console.log('\n📱 Received Push Notification:');
      console.log(`   Token: ${deviceToken.substring(0, 20)}...`);
      console.log(`   Topic: ${topic}`);
      console.log(`   Type:  ${pushType}`);
      console.log(`   Alert: ${JSON.stringify(payload.aps?.alert || 'silent')}`);

      // Success response
      stream.respond({
        ':status': 200,
        'apns-id': apnsId,
      });
      stream.end();

    } catch (error) {
      stream.respond({ ':status': 400 });
      stream.end(JSON.stringify({ reason: 'BadRequest' }));
    }
  });
}

function handleGetNotifications(stream: http2.ServerHttp2Stream) {
  stream.respond({
    ':status': 200,
    'content-type': 'application/json',
  });
  stream.end(JSON.stringify({
    count: receivedNotifications.length,
    notifications: receivedNotifications.slice(-50), // Last 50
  }, null, 2));
}

function generateApnsId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

startServer().catch(console.error);
