#!/usr/bin/env npx tsx
/**
 * Email Digest - Real-World ASP Subscriber
 *
 * Collects events and sends batched email digests.
 *
 * Use Case: Daily/weekly summaries for stakeholders
 *
 * Configuration:
 * SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 * EMAIL_FROM, EMAIL_TO
 * DIGEST_SCHEDULE=daily|hourly
 */

import { ASPClient, WebSocketTransport } from '@esmcp/client';
import type { ESMCPEvent } from '@esmcp/core';
import nodemailer from 'nodemailer';

const ASP_SERVER = process.env.ASP_SERVER || process.env.ESMCP_SERVER || 'ws://localhost:8080';
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'alerts@example.com';
const EMAIL_TO = process.env.EMAIL_TO || 'team@example.com';
const DIGEST_SCHEDULE = process.env.DIGEST_SCHEDULE || 'daily'; // 'hourly' or 'daily'

const stats = {
  eventsReceived: 0,
  emailsSent: 0,
};

// Event buffer
const eventBuffer: ESMCPEvent[] = [];

// Create email transporter
const transporter = nodemailer.createTransporter({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: SMTP_USER && SMTP_PASS ? {
    user: SMTP_USER,
    pass: SMTP_PASS,
  } : undefined,
});

function generateDigestHtml(events: ESMCPEvent[]): string {
  const eventsBySource = events.reduce((acc, event) => {
    acc[event.metadata.source] = acc[event.metadata.source] || [];
    acc[event.metadata.source].push(event);
    return acc;
  }, {} as Record<string, ESMCPEvent[]>);

  let html = `
    <h1>📊 Event Digest</h1>
    <p>${events.length} events since last digest</p>
    <hr>
  `;

  for (const [source, sourceEvents] of Object.entries(eventsBySource)) {
    html += `<h2>${source.toUpperCase()} (${sourceEvents.length})</h2><ul>`;
    for (const event of sourceEvents.slice(0, 10)) {
      html += `
        <li>
          <strong>${event.type}</strong> 
          <span style="color: ${getPriorityColor(event.metadata.priority)}">●</span>
          ${event.metadata.priority}
          <br>
          <small>${new Date(event.metadata.timestamp).toLocaleString()}</small>
          <pre>${JSON.stringify(event.data, null, 2)}</pre>
        </li>
      `;
    }
    if (sourceEvents.length > 10) {
      html += `<li>... and ${sourceEvents.length - 10} more</li>`;
    }
    html += '</ul>';
  }

  return html;
}

function getPriorityColor(priority: string): string {
  const colors: Record<string, string> = {
    low: '#999',
    normal: '#3498db',
    high: '#e67e22',
    critical: '#e74c3c',
  };
  return colors[priority] || '#999';
}

async function sendDigest(): Promise<void> {
  if (eventBuffer.length === 0) {
    console.log('📭 No events to send in digest');
    return;
  }

  const events = [...eventBuffer];
  eventBuffer.length = 0; // Clear buffer

  const html = generateDigestHtml(events);

  try {
    await transporter.sendMail({
      from: EMAIL_FROM,
      to: EMAIL_TO,
      subject: `📊 Event Digest: ${events.length} events`,
      html,
    });

    stats.emailsSent++;
    console.log(`📧 Digest sent to ${EMAIL_TO} (${events.length} events)`);
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    // Put events back in buffer
    eventBuffer.unshift(...events);
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║           📧 Email Digest Subscriber                     ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`📅 Schedule: ${DIGEST_SCHEDULE}`);
  console.log(`📤 To: ${EMAIL_TO}`);
  console.log();

  if (!SMTP_USER || !SMTP_PASS) {
    console.log('⚠️  Warning: SMTP not configured. Emails will be logged only.');
    console.log();
  }

  const transport = new WebSocketTransport({
    url: ASP_SERVER,
    reconnect: true,
  });

  const client = new ASPClient({
    transport,
    clientInfo: { name: 'email-digest', version: '1.0.0' },
  });

  client.onEvent('*', (event: ESMCPEvent) => {
    stats.eventsReceived++;
    eventBuffer.push(event);
    console.log(`📨 Buffered: ${event.type} (${eventBuffer.length} total)`);
  });

  await client.connect();
  console.log('✅ Connected to ASP server');

  const subscription = await client.subscribe({
    filter: {},
    delivery: { channels: ['websocket'], priority: 'normal' },
  });

  console.log(`📋 Subscribed: ${subscription.id}`);
  console.log(`⏰ Sending ${DIGEST_SCHEDULE} digests...`);
  console.log();

  // Schedule digests
  const intervalMs = DIGEST_SCHEDULE === 'hourly' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const digestInterval = setInterval(sendDigest, intervalMs);

  // Send initial digest after 30 seconds
  setTimeout(sendDigest, 30000);

  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down...');
    clearInterval(digestInterval);
    await sendDigest(); // Send final digest
    await client.unsubscribe(subscription.id);
    await client.disconnect();
    console.log(`📊 Stats: ${stats.eventsReceived} received, ${stats.emailsSent} digests sent`);
    process.exit(0);
  });
}

main().catch(console.error);
