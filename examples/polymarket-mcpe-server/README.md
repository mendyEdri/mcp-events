# Polymarket MCPE Server

An MCPE (MCP Events) server that streams real-time prediction market events from [Polymarket](https://polymarket.com). Get notified when market odds shift significantly, filtered by topics you care about.

## Features

- **Real-time WebSocket streaming** from Polymarket
- **Topic filtering** - only get events about AI, elections, crypto, etc.
- **Price change threshold** - configure minimum % change to trigger events
- **MCPE event format** - standard event structure for AI agent consumption
- **SSE endpoint** - easy integration with any client
- **Built-in demo UI** - test and monitor from your browser

## Quick Start

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Or build and run
npm run build
npm start
```

Open http://localhost:3001 to see the demo UI.

## Usage

### 1. Subscribe to Markets

```bash
curl -X POST http://localhost:3001/api/subscribe \
  -H "Content-Type: application/json" \
  -d '{
    "topics": ["AI", "Trump", "Bitcoin"],
    "threshold": 0.05
  }'
```

Parameters:
- `topics` - Keywords to filter markets (matches title, question, category)
- `threshold` - Minimum price change to trigger event (0.05 = 5%)
- `limit` - Max number of markets to subscribe to (default: 100)

### 2. Listen for Events (SSE)

```javascript
const eventSource = new EventSource('http://localhost:3001/events');

eventSource.onmessage = (e) => {
  const event = JSON.parse(e.data);
  console.log(event.data.summary);
  // "Will GPT-5 be released in 2024?" - Yes 📈 45% → 62% (+17%)
};
```

### 3. Poll Recent Events

```bash
curl http://localhost:3001/api/events?limit=10
```

## MCPE Event Format

```json
{
  "id": "poly-1234567890-abc123",
  "type": "polymarket.price.up",
  "source": "polymarket",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    "market": {
      "id": "0x1234...",
      "eventTitle": "2024 US Presidential Election",
      "question": "Will Trump win the 2024 election?",
      "category": "Politics"
    },
    "outcome": "Yes",
    "oldPrice": 0.45,
    "newPrice": 0.52,
    "priceChange": 0.07,
    "priceChangePercent": 0.156,
    "direction": "up",
    "summary": "\"Will Trump win?\" - Yes 📈 45% → 52% (+15.6%)"
  },
  "metadata": {
    "priority": "high",
    "tags": ["polymarket", "prediction-market", "politics"]
  }
}
```

## Event Types

| Event Type | Description |
|------------|-------------|
| `polymarket.price.up` | Price increased above threshold |
| `polymarket.price.down` | Price decreased below threshold |

## Priority Levels

Based on price change magnitude:
- `critical` - ≥20% change
- `high` - ≥15% change
- `normal` - ≥10% change
- `low` - <10% change

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check and stats |
| GET | `/api/tags` | List available categories |
| GET | `/api/search?q=` | Search markets by query |
| GET | `/api/markets` | List active markets |
| GET | `/api/subscribed` | List currently subscribed markets |
| POST | `/api/subscribe` | Subscribe to markets |
| POST | `/api/threshold` | Update price change threshold |
| POST | `/api/disconnect` | Disconnect from Polymarket |
| GET | `/api/events` | Get recent events |
| GET | `/events` | SSE event stream |

## Integration with MCPE Agent

This server emits standard MCPE events that can be consumed by an AI agent. Example use cases:

1. **Market Analysis**: When odds shift significantly, AI analyzes why by checking recent news
2. **Alert Summarization**: AI summarizes multiple market movements into a daily digest
3. **Trading Signals**: AI correlates market movements with other data sources
4. **Trend Detection**: AI identifies emerging patterns across related markets

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |

## Dependencies

- [`@nevuamarkets/poly-websockets`](https://github.com/nevuamarkets/poly-websockets) - Polymarket WebSocket client
- [`hono`](https://hono.dev) - Fast web framework

## License

MIT
