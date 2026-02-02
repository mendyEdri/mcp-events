/**
 * Generate VAPID keys for Web Push
 *
 * Run this once and save the keys securely.
 * The public key goes to the browser, private key stays on server.
 */

import { WebPushClient } from '@esmcp/webpush';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const keys = WebPushClient.generateVAPIDKeys();

console.log('\n🔑 Generated VAPID Keys for Web Push\n');
console.log('Public Key (share with browsers):');
console.log(keys.publicKey);
console.log('\nPrivate Key (keep secret on server):');
console.log(keys.privateKey);

// Save to file
const keysPath = path.join(__dirname, 'vapid-keys.json');
fs.writeFileSync(keysPath, JSON.stringify(keys, null, 2));
console.log(`\n✅ Keys saved to: ${keysPath}`);
console.log('\n⚠️  Keep vapid-keys.json secret! Add it to .gitignore');
