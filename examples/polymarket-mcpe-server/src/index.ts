import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { PolymarketClient, PriceUpdate, ParsedMarket } from './polymarket-client.js';

const app = new Hono();
app.use('*', cors());

// Initialize Polymarket client
const polymarket = new PolymarketClient({
  priceChangeThreshold: 0.05, // 5% default
});

// Store for SSE clients
const sseClients: Set<(event: MCPEEvent) => void> = new Set();

// Store recent events for new subscribers
const recentEvents: MCPEEvent[] = [];
const MAX_RECENT_EVENTS = 100;

// MCPE Event structure
interface MCPEEvent {
  id: string;
  type: string;
  timestamp: string;
  data: {
    market: {
      id: string;
      eventTitle: string;
      question: string;
      category: string;
    };
    outcome: string;
    oldPrice: number;
    newPrice: number;
    priceChange: number;
    priceChangePercent: number;
    direction: 'up' | 'down';
    summary: string;
  };
  metadata: {
    priority: 'low' | 'normal' | 'high' | 'critical';
    tags: string[];
  };
}

// Convert price update to MCPE event
function toMCPEEvent(update: PriceUpdate): MCPEEvent {
  const direction = update.priceChange > 0 ? 'up' : 'down';
  const percentStr = (update.priceChangePercent * 100).toFixed(1);
  const oldPriceStr = (update.oldPrice * 100).toFixed(0);
  const newPriceStr = (update.newPrice * 100).toFixed(0);

  // Determine priority based on price change magnitude
  let priority: 'low' | 'normal' | 'high' | 'critical' = 'normal';
  if (update.priceChangePercent >= 0.20) priority = 'critical';
  else if (update.priceChangePercent >= 0.15) priority = 'high';
  else if (update.priceChangePercent >= 0.10) priority = 'normal';
  else priority = 'low';

  return {
    id: `poly-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: `polymarket.price.${direction}`,
    timestamp: update.timestamp.toISOString(),
    data: {
      market: {
        id: update.market.id,
        eventTitle: update.market.eventTitle,
        question: update.market.question,
        category: update.market.category,
      },
      outcome: update.outcomeName,
      oldPrice: update.oldPrice,
      newPrice: update.newPrice,
      priceChange: update.priceChange,
      priceChangePercent: update.priceChangePercent,
      direction,
      summary: `"${update.market.question}" - ${update.outcomeName} ${direction === 'up' ? '📈' : '📉'} ${oldPriceStr}% → ${newPriceStr}% (${direction === 'up' ? '+' : ''}${percentStr}%)`,
    },
    metadata: {
      priority,
      tags: ['polymarket', 'prediction-market', update.market.category.toLowerCase()],
    },
  };
}

// Register price update handler
polymarket.onPriceUpdate((update) => {
  const event = toMCPEEvent(update);

  // Store recent event
  recentEvents.unshift(event);
  if (recentEvents.length > MAX_RECENT_EVENTS) {
    recentEvents.pop();
  }

  // Notify all SSE clients
  for (const client of sseClients) {
    client(event);
  }

  console.log(`[MCPE] Event emitted: ${event.data.summary}`);
});

// ============ API Routes ============

// Health check
app.get('/health', (c) => {
  const stats = polymarket.getStats();
  return c.json({
    status: 'ok',
    polymarket: {
      connected: stats.wsStats !== null,
      markets: stats.markets,
      tokens: stats.tokens,
    },
  });
});

// Get available tags/categories
app.get('/api/tags', async (c) => {
  try {
    const tags = await polymarket.getTags();
    return c.json({ tags });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// Search events
app.get('/api/search', async (c) => {
  const query = c.req.query('q');
  if (!query) {
    return c.json({ error: 'Query parameter "q" required' }, 400);
  }
  try {
    const events = await polymarket.searchEvents(query);
    return c.json({
      count: events.length,
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        category: e.category,
        volume: e.volume,
        markets: e.markets.length,
      })),
    });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// Get active markets
app.get('/api/markets', async (c) => {
  try {
    const events = await polymarket.getActiveEvents(50);
    const markets: any[] = [];
    for (const event of events) {
      const parsed = polymarket.parseEvent(event);
      markets.push(...parsed);
    }
    return c.json({
      count: markets.length,
      markets: markets.map((m) => ({
        id: m.id,
        eventTitle: m.eventTitle,
        question: m.question,
        category: m.category,
        outcomes: m.outcomes.map((o: any) => ({
          name: o.name,
          price: o.price,
          pricePercent: `${(o.price * 100).toFixed(0)}%`,
        })),
        volume: m.volume,
      })),
    });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// Get subscribed markets
app.get('/api/subscribed', (c) => {
  const markets = polymarket.getSubscribedMarkets();
  return c.json({
    count: markets.length,
    markets: markets.map((m) => ({
      id: m.id,
      eventTitle: m.eventTitle,
      question: m.question,
      category: m.category,
      outcomes: m.outcomes.map((o) => ({
        name: o.name,
        price: `${(o.price * 100).toFixed(0)}%`,
      })),
    })),
  });
});

// Configure subscription
app.post('/api/subscribe', async (c) => {
  try {
    const body = await c.req.json();
    const { topics, threshold, limit } = body as {
      topics?: string[];
      threshold?: number;
      limit?: number;
    };

    // Set threshold if provided
    if (threshold !== undefined) {
      polymarket.setPriceChangeThreshold(threshold);
    }

    // Set topic filters if provided
    if (topics && topics.length > 0) {
      polymarket.setTopicFilters(topics);
    }

    // Fetch and subscribe to markets
    const events = await polymarket.getActiveEvents(limit || 100);
    await polymarket.subscribeToMarkets(events);

    const stats = polymarket.getStats();
    return c.json({
      success: true,
      subscribed: {
        markets: stats.markets,
        tokens: stats.tokens,
      },
      config: {
        topics: topics || [],
        threshold: polymarket['priceChangeThreshold'],
      },
    });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// Update threshold
app.post('/api/threshold', async (c) => {
  try {
    const body = await c.req.json();
    const { threshold } = body as { threshold: number };

    if (typeof threshold !== 'number' || threshold < 0 || threshold > 1) {
      return c.json({ error: 'Threshold must be a number between 0 and 1' }, 400);
    }

    polymarket.setPriceChangeThreshold(threshold);
    return c.json({
      success: true,
      threshold,
      thresholdPercent: `${(threshold * 100).toFixed(1)}%`,
    });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// Disconnect
app.post('/api/disconnect', async (c) => {
  await polymarket.disconnect();
  return c.json({ success: true, message: 'Disconnected from Polymarket' });
});

// Get recent events
app.get('/api/events', (c) => {
  const limit = parseInt(c.req.query('limit') || '20');
  return c.json({
    count: recentEvents.length,
    events: recentEvents.slice(0, limit),
  });
});

// ============ SSE Endpoint for MCPE Events ============

app.get('/events', (c) => {
  return c.newResponse(
    new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();

        // Send initial connection message
        controller.enqueue(encoder.encode('data: {"type":"connected"}\n\n'));

        // Send recent events
        for (const event of recentEvents.slice(0, 10)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }

        // Register client
        const handler = (event: MCPEEvent) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            sseClients.delete(handler);
          }
        };
        sseClients.add(handler);

        console.log(`[SSE] Client connected, total: ${sseClients.size}`);
      },
      cancel() {
        console.log(`[SSE] Client disconnected, total: ${sseClients.size}`);
      },
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    }
  );
});

// ============ Static Demo Page ============

app.get('/', (c) => {
  return c.html(`
<!DOCTYPE html>
<html>
<head>
  <title>Polymarket MCPE Server</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, sans-serif; background: #0d1117; color: #c9d1d9; padding: 20px; }
    h1 { color: #58a6ff; margin-bottom: 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .card h2 { color: #8b949e; font-size: 14px; text-transform: uppercase; margin-bottom: 12px; }
    .form-group { margin-bottom: 12px; }
    .form-group label { display: block; margin-bottom: 4px; color: #8b949e; }
    .form-group input { width: 100%; padding: 8px; background: #0d1117; border: 1px solid #30363d; border-radius: 4px; color: #c9d1d9; }
    button { background: #238636; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; margin-right: 8px; }
    button:hover { background: #2ea043; }
    button.danger { background: #da3633; }
    .events { max-height: 500px; overflow-y: auto; }
    .event { padding: 12px; border-bottom: 1px solid #30363d; }
    .event:last-child { border-bottom: none; }
    .event-type { color: #58a6ff; font-weight: 600; }
    .event-summary { margin-top: 4px; }
    .event-time { color: #8b949e; font-size: 12px; }
    .up { color: #3fb950; }
    .down { color: #f85149; }
    .stats { display: flex; gap: 20px; margin-bottom: 16px; }
    .stat { text-align: center; }
    .stat-value { font-size: 24px; font-weight: bold; color: #58a6ff; }
    .stat-label { color: #8b949e; font-size: 12px; }
    .status { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; }
    .status.connected { background: #3fb950; }
    .status.disconnected { background: #f85149; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔮 Polymarket MCPE Server</h1>

    <div class="stats">
      <div class="stat">
        <div class="stat-value" id="market-count">0</div>
        <div class="stat-label">Markets</div>
      </div>
      <div class="stat">
        <div class="stat-value" id="event-count">0</div>
        <div class="stat-label">Events</div>
      </div>
      <div class="stat">
        <div class="stat-value" id="connection-status">
          <span class="status disconnected"></span>Disconnected
        </div>
        <div class="stat-label">Status</div>
      </div>
    </div>

    <div class="card">
      <h2>Configuration</h2>
      <div class="form-group">
        <label>Topics (comma-separated keywords)</label>
        <input type="text" id="topics" placeholder="AI, Trump, Bitcoin, election" value="AI, Trump">
      </div>
      <div class="form-group">
        <label>Price Change Threshold (%)</label>
        <input type="number" id="threshold" value="5" min="1" max="50">
      </div>
      <button onclick="subscribe()">Subscribe</button>
      <button class="danger" onclick="disconnect()">Disconnect</button>
    </div>

    <div class="card">
      <h2>Live Events</h2>
      <div class="events" id="events">
        <div class="event" style="color: #8b949e;">Waiting for events...</div>
      </div>
    </div>
  </div>

  <script>
    let eventSource = null;
    let eventCount = 0;

    function subscribe() {
      const topics = document.getElementById('topics').value.split(',').map(t => t.trim()).filter(Boolean);
      const threshold = parseInt(document.getElementById('threshold').value) / 100;

      fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics, threshold, limit: 100 })
      })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          document.getElementById('market-count').textContent = data.subscribed.markets;
          connectSSE();
        } else {
          alert('Error: ' + data.error);
        }
      });
    }

    function disconnect() {
      fetch('/api/disconnect', { method: 'POST' });
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      updateStatus(false);
    }

    function connectSSE() {
      if (eventSource) eventSource.close();

      eventSource = new EventSource('/events');

      eventSource.onopen = () => updateStatus(true);
      eventSource.onerror = () => updateStatus(false);

      eventSource.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === 'connected') return;

        eventCount++;
        document.getElementById('event-count').textContent = eventCount;

        const eventsEl = document.getElementById('events');
        if (eventsEl.querySelector('[style]')) eventsEl.innerHTML = '';

        const div = document.createElement('div');
        div.className = 'event';
        const direction = data.data.direction;
        div.innerHTML = \`
          <div class="event-type \${direction}">\${data.type}</div>
          <div class="event-summary">\${data.data.summary}</div>
          <div class="event-time">\${new Date(data.timestamp).toLocaleTimeString()}</div>
        \`;
        eventsEl.insertBefore(div, eventsEl.firstChild);
      };
    }

    function updateStatus(connected) {
      const el = document.getElementById('connection-status');
      el.innerHTML = connected
        ? '<span class="status connected"></span>Connected'
        : '<span class="status disconnected"></span>Disconnected';
    }

    // Load initial stats
    fetch('/health').then(r => r.json()).then(data => {
      document.getElementById('market-count').textContent = data.polymarket.markets;
      if (data.polymarket.connected) {
        connectSSE();
      }
    });
  </script>
</body>
</html>
  `);
});

// ============ Start Server ============

const port = parseInt(process.env.PORT || '3001');

console.log(`
🔮 Polymarket MCPE Server
========================
Server running at http://localhost:${port}

API Endpoints:
  GET  /health          - Health check
  GET  /api/tags        - List available categories
  GET  /api/search?q=   - Search markets
  GET  /api/markets     - List active markets
  GET  /api/subscribed  - List subscribed markets
  POST /api/subscribe   - Subscribe to markets (body: {topics, threshold, limit})
  POST /api/threshold   - Update threshold (body: {threshold})
  POST /api/disconnect  - Disconnect from Polymarket
  GET  /api/events      - Get recent events
  GET  /events          - SSE stream of MCPE events

Example:
  curl -X POST http://localhost:${port}/api/subscribe \\
    -H "Content-Type: application/json" \\
    -d '{"topics": ["AI", "Trump"], "threshold": 0.05}'
`);

serve({ fetch: app.fetch, port });
