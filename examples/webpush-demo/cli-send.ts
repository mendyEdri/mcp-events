#!/usr/bin/env npx tsx
/**
 * CLI tool to send Web Push notifications
 *
 * Usage:
 *   npx tsx cli-send.ts "Title" "Body message"
 *   npx tsx cli-send.ts --list
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebPushClient, WebPushNotificationBuilder } from '@esmcp/webpush';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load VAPID keys
const keysPath = path.join(__dirname, 'vapid-keys.json');
if (!fs.existsSync(keysPath)) {
  console.error('❌ No VAPID keys found. Run the server first to generate them.');
  process.exit(1);
}
const vapidKeys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));

// Load subscriptions from server's storage (we'll use a file for persistence)
const subsPath = path.join(__dirname, 'subscriptions.json');

interface Subscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

function loadSubscriptions(): Map<string, Subscription> {
  if (fs.existsSync(subsPath)) {
    const data = JSON.parse(fs.readFileSync(subsPath, 'utf8'));
    return new Map(Object.entries(data));
  }
  return new Map();
}

function saveSubscriptions(subs: Map<string, Subscription>) {
  fs.writeFileSync(subsPath, JSON.stringify(Object.fromEntries(subs), null, 2));
}

// Create Web Push client
const pushClient = new WebPushClient({
  vapidKeys,
  subject: 'mailto:admin@example.com',
});

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
📤 ESMCP Web Push CLI

Usage:
  npx tsx cli-send.ts "Title" "Body"     Send notification to all subscribers
  npx tsx cli-send.ts --list              List all subscriptions
  npx tsx cli-send.ts --add <json>        Add subscription from JSON
  npx tsx cli-send.ts --clear             Clear all subscriptions

Examples:
  npx tsx cli-send.ts "Hello!" "This is from CLI"
  npx tsx cli-send.ts --add '{"endpoint":"https://...","keys":{...}}'
`);
    return;
  }

  const subscriptions = loadSubscriptions();

  if (args[0] === '--list') {
    console.log(`\n📋 Subscriptions (${subscriptions.size}):\n`);
    if (subscriptions.size === 0) {
      console.log('  No subscriptions. Subscribe in browser first, then use --add');
    }
    subscriptions.forEach((sub, endpoint) => {
      console.log(`  • ${endpoint.substring(0, 60)}...`);
    });
    return;
  }

  if (args[0] === '--clear') {
    saveSubscriptions(new Map());
    console.log('✅ Cleared all subscriptions');
    return;
  }

  if (args[0] === '--add') {
    if (!args[1]) {
      console.error('❌ Please provide subscription JSON');
      process.exit(1);
    }
    try {
      const sub = JSON.parse(args[1]) as Subscription;
      if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
        throw new Error('Invalid subscription format');
      }
      subscriptions.set(sub.endpoint, sub);
      saveSubscriptions(subscriptions);
      console.log('✅ Added subscription:', sub.endpoint.substring(0, 50) + '...');
    } catch (e) {
      console.error('❌ Invalid JSON:', (e as Error).message);
      process.exit(1);
    }
    return;
  }

  // Send notification
  const title = args[0] || 'CLI Notification';
  const body = args[1] || 'Sent from command line!';

  if (subscriptions.size === 0) {
    console.log(`
❌ No subscriptions found!

To add a subscription from the browser:
1. Open http://localhost:3000 and subscribe
2. Copy the subscription JSON from "Subscription Data"
3. Run: npx tsx cli-send.ts --add '<paste JSON here>'
`);
    process.exit(1);
  }

  console.log(`\n📤 Sending push notification...`);
  console.log(`   Title: ${title}`);
  console.log(`   Body: ${body}`);
  console.log(`   To: ${subscriptions.size} subscriber(s)\n`);

  const payload = WebPushNotificationBuilder.create()
    .title(title)
    .body(body)
    .build();

  let sent = 0;
  let failed = 0;

  for (const [endpoint, subscription] of subscriptions) {
    const result = await pushClient.send(subscription, payload);

    if (result.success) {
      console.log(`   ✅ Sent to ${endpoint.substring(0, 40)}...`);
      sent++;
    } else {
      console.log(`   ❌ Failed: ${result.error} (${result.statusCode})`);
      failed++;

      // Remove invalid subscriptions
      if (result.statusCode === 410 || result.statusCode === 404) {
        subscriptions.delete(endpoint);
        console.log(`      Removed stale subscription`);
      }
    }
  }

  saveSubscriptions(subscriptions);

  console.log(`\n📊 Results: ${sent} sent, ${failed} failed\n`);
}

main().catch(console.error);
