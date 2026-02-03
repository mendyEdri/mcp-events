#!/usr/bin/env npx tsx
/**
 * Generate VAPID Keys for Web Push
 *
 * VAPID (Voluntary Application Server Identification) keys are required
 * for Web Push notifications. This script generates a public/private key pair.
 *
 * Run this once and save the keys to vapid-keys.json
 */

import webpush from 'web-push';
import fs from 'fs/promises';
import path from 'path';

async function generateKeys() {
  console.log('🔐 Generating VAPID keys for Web Push...\n');

  const vapidKeys = webpush.generateVAPIDKeys();

  const keysData = {
    publicKey: vapidKeys.publicKey,
    privateKey: vapidKeys.privateKey,
    // This should match your server endpoint
    subject: 'mailto:admin@example.com',
  };

  const keysPath = path.join(process.cwd(), 'vapid-keys.json');
  await fs.writeFile(keysPath, JSON.stringify(keysData, null, 2));

  console.log('✅ VAPID keys generated and saved to vapid-keys.json\n');
  console.log('Public Key:');
  console.log(vapidKeys.publicKey);
  console.log('\nPrivate Key:');
  console.log(vapidKeys.privateKey);
  console.log('\n⚠️  Keep the private key secret! Never commit it to git.');
  console.log('\nNext steps:');
  console.log('  1. Update the "subject" field in vapid-keys.json to your email');
  console.log('  2. Start the server: npm run server');
  console.log('  3. Open http://localhost:3000 in your browser');
}

generateKeys().catch(console.error);
