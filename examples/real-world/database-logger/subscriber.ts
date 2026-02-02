#!/usr/bin/env npx tsx
/**
 * Database Logger - Real-World ESMCP Subscriber
 *
 * Persists all events to SQLite for audit trails and analytics.
 *
 * Features:
 * - SQLite database with automatic schema
 * - Query API for historical events
 * - Data retention policies
 * - Health monitoring
 */

import { ESMCPClient } from '@esmcp/client';
import type { ESMCPEvent } from '@esmcp/core';
import Database from 'better-sqlite3';

// Configuration
const ESMCP_SERVER = process.env.ESMCP_SERVER || 'ws://localhost:8080';
const DB_PATH = process.env.DB_PATH || './events.db';
const RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS || '30', 10);
const SUBSCRIBER_NAME = process.env.SUBSCRIBER_NAME || 'database-logger';

// Stats
const stats = {
  eventsReceived: 0,
  eventsStored: 0,
  errors: 0,
  lastEvent: null as Date | null,
  dbSize: 0,
};

// Initialize database
const db = new Database(DB_PATH);

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    source TEXT NOT NULL,
    priority TEXT NOT NULL,
    data TEXT NOT NULL,
    tags TEXT,
    timestamp TEXT NOT NULL,
    received_at TEXT NOT NULL,
    metadata TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
  CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
  CREATE INDEX IF NOT EXISTS idx_events_priority ON events(priority);
  CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
  CREATE INDEX IF NOT EXISTS idx_events_received ON events(received_at);

  CREATE TABLE IF NOT EXISTS stats (
    key TEXT PRIMARY KEY,
    value INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

/**
 * Store event in database
 */
function storeEvent(event: ESMCPEvent): boolean {
  try {
    const stmt = db.query(`
      INSERT INTO events (id, type, source, priority, data, tags, timestamp, received_at, metadata)
      VALUES ($id, $type, $source, $priority, $data, $tags, $timestamp, $receivedAt, $metadata)
    `);

    stmt.run({
      $id: event.id,
      $type: event.type,
      $source: event.metadata.source,
      $priority: event.metadata.priority,
      $data: JSON.stringify(event.data),
      $tags: event.metadata.tags ? JSON.stringify(event.metadata.tags) : null,
      $timestamp: event.metadata.timestamp,
      $receivedAt: new Date().toISOString(),
      $metadata: JSON.stringify(event.metadata),
    });

    stats.eventsStored++;
    return true;
  } catch (error) {
    stats.errors++;
    console.error('❌ Failed to store event:', error);
    return false;
  }
}

/**
 * Clean up old events
 */
function cleanupOldEvents(): void {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  const stmt = db.query('DELETE FROM events WHERE received_at < $cutoff');
  const result = stmt.run({ $cutoff: cutoff.toISOString() });

  if (result.changes > 0) {
    console.log(`🧹 Cleaned up ${result.changes} old events`);
  }
}

/**
 * Query events with filters
 */
function queryEvents(filters: {
  source?: string;
  type?: string;
  priority?: string;
  since?: string;
  limit?: number;
}): any[] {
  let sql = 'SELECT * FROM events WHERE 1=1';
  const params: Record<string, any> = {};

  if (filters.source) {
    sql += ' AND source = $source';
    params.$source = filters.source;
  }
  if (filters.type) {
    sql += ' AND type = $type';
    params.$type = filters.type;
  }
  if (filters.priority) {
    sql += ' AND priority = $priority';
    params.$priority = filters.priority;
  }
  if (filters.since) {
    sql += ' AND timestamp > $since';
    params.$since = filters.since;
  }

  sql += ' ORDER BY timestamp DESC';

  if (filters.limit) {
    sql += ' LIMIT $limit';
    params.$limit = filters.limit;
  }

  const stmt = db.query(sql);
  return stmt.all(params);
}

/**
 * Get database stats
 */
function getDbStats() {
  const count = db.query('SELECT COUNT(*) as count FROM events').get() as { count: number };
  const sources = db.query('SELECT source, COUNT(*) as count FROM events GROUP BY source').all();
  const types = db.query('SELECT type, COUNT(*) as count FROM events GROUP BY type ORDER BY count DESC LIMIT 10').all();

  return {
    totalEvents: count.count,
    sources,
    topEventTypes: types,
  };
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║           💾 Database Logger Subscriber                  ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`📁 Database: ${DB_PATH}`);
  console.log(`🗓️  Retention: ${RETENTION_DAYS} days`);
  console.log();

  // Cleanup old events on startup
  cleanupOldEvents();

  console.log(`🔌 Connecting to ${ESMCP_SERVER}...`);

  const client = new ESMCPClient({
    serverUrl: ESMCP_SERVER,
    clientInfo: {
      name: SUBSCRIBER_NAME,
      version: '1.0.0',
    },
    capabilities: {
      websocket: true,
    },
    reconnect: true,
    reconnectInterval: 5000,
  });

  // Handle all events
  client.onEvent('*', (event: ESMCPEvent) => {
    stats.eventsReceived++;
    stats.lastEvent = new Date();

    const stored = storeEvent(event);

    if (stats.eventsReceived % 10 === 0) {
      const dbStats = getDbStats();
      console.log(`📊 Stored ${dbStats.totalEvents} events total`);
    }
  });

  // Connect and subscribe
  await client.connect();
  console.log('✅ Connected to ESMCP server');
  console.log();

  // Subscribe to all events
  const subscription = await client.subscribe({
    filter: {},
    delivery: {
      channels: ['websocket'],
      priority: 'realtime',
    },
  });

  console.log(`📋 Subscribed: ${subscription.id}`);
  console.log('💾 Storing all events to database...');
  console.log();

  // HTTP API for querying events
  const server = Bun.serve({
    port: 3002,
    fetch(req) {
      const url = new URL(req.url);

      // Health check
      if (url.pathname === '/health') {
        return Response.json({
          status: 'ok',
          subscriber: SUBSCRIBER_NAME,
          connected: client.state === 'initialized',
          stats,
          db: getDbStats(),
        });
      }

      // Query events
      if (url.pathname === '/events') {
        const filters = {
          source: url.searchParams.get('source') || undefined,
          type: url.searchParams.get('type') || undefined,
          priority: url.searchParams.get('priority') || undefined,
          since: url.searchParams.get('since') || undefined,
          limit: parseInt(url.searchParams.get('limit') || '100', 10),
        };

        const events = queryEvents(filters);
        return Response.json({ events, count: events.length });
      }

      // Stats endpoint
      if (url.pathname === '/stats') {
        return Response.json(getDbStats());
      }

      return new Response('Not found', { status: 404 });
    },
  });

  console.log(`🌐 Query API: http://localhost:3002`);
  console.log(`   GET /health     - Health status`);
  console.log(`   GET /events     - Query events (?source=&type=&priority=&since=&limit=)`);
  console.log(`   GET /stats      - Database statistics`);
  console.log();
  console.log('Listening for events... (Press Ctrl+C to exit)');
  console.log();

  // Periodic cleanup
  const cleanupInterval = setInterval(() => {
    cleanupOldEvents();
  }, 24 * 60 * 60 * 1000); // Daily

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down...');
    clearInterval(cleanupInterval);
    server.stop();
    await client.unsubscribe(subscription.id);
    await client.disconnect();
    db.close();
    console.log('✅ Disconnected and database closed');
    console.log();
    console.log('📊 Final Stats:');
    console.log(`   Events received: ${stats.eventsReceived}`);
    console.log(`   Events stored: ${stats.eventsStored}`);
    console.log(`   Errors: ${stats.errors}`);
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
