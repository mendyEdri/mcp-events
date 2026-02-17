/**
 * Polymarket Integration
 *
 * Connects to the Polymarket MCPE server and forwards events to the agent.
 */

const POLYMARKET_SERVER_URL = 'https://polymarket-mcpe-server.fly.dev';

interface PolymarketEvent {
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

type EventHandler = (event: PolymarketEvent) => void;

let eventSource: EventSource | null = null;
let isConnected = false;
let eventHandler: EventHandler | null = null;
let currentConfig: { topics: string[]; threshold: number } | null = null;

/**
 * Connect to Polymarket server and subscribe to markets
 */
export async function connectPolymarket(config: {
  topics?: string[];
  threshold?: number;
  onEvent: EventHandler;
}): Promise<{ success: boolean; markets?: number; error?: string }> {
  const topics = config.topics || [];
  const threshold = config.threshold || 0.05;

  try {
    // Subscribe to markets on the Polymarket server
    const response = await fetch(`${POLYMARKET_SERVER_URL}/api/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topics, threshold, limit: 100 }),
    });

    if (!response.ok) {
      throw new Error(`Failed to subscribe: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      success: boolean;
      error?: string;
      subscribed: { markets: number; tokens: number };
    };
    if (!data.success) {
      throw new Error(data.error || 'Unknown error');
    }

    // Store handler and config
    eventHandler = config.onEvent;
    currentConfig = { topics, threshold };

    // Connect to SSE stream
    connectSSE();

    console.log(`[Polymarket] Connected - ${data.subscribed.markets} markets, ${data.subscribed.tokens} tokens`);
    return { success: true, markets: data.subscribed.markets };
  } catch (error) {
    console.error('[Polymarket] Connection failed:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Connect to SSE stream for real-time events
 */
function connectSSE(): void {
  if (eventSource) {
    eventSource.close();
  }

  // Note: EventSource is not available in Node.js by default
  // We'll use a simple polling approach or fetch-based SSE
  startPolling();
}

/**
 * Poll for events (fallback for environments without EventSource)
 */
let pollInterval: ReturnType<typeof setInterval> | null = null;
let lastEventId: string | null = null;

function startPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
  }

  isConnected = true;
  console.log('[Polymarket] Started polling for events');

  // Poll every 5 seconds
  pollInterval = setInterval(async () => {
    try {
      const response = await fetch(`${POLYMARKET_SERVER_URL}/api/events?limit=10`);
      if (!response.ok) return;

      const data = (await response.json()) as { events: PolymarketEvent[] };
      if (!data.events || data.events.length === 0) return;

      // Process new events
      for (const event of data.events) {
        if (lastEventId && event.id === lastEventId) break;
        if (eventHandler) {
          eventHandler(event);
        }
      }

      // Update last event ID
      if (data.events.length > 0) {
        lastEventId = data.events[0].id;
      }
    } catch (error) {
      console.error('[Polymarket] Polling error:', error);
    }
  }, 5000);
}

/**
 * Disconnect from Polymarket server
 */
export async function disconnectPolymarket(): Promise<void> {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  isConnected = false;
  eventHandler = null;
  currentConfig = null;
  lastEventId = null;

  // Disconnect from server
  try {
    await fetch(`${POLYMARKET_SERVER_URL}/api/disconnect`, { method: 'POST' });
  } catch {
    // Ignore disconnect errors
  }

  console.log('[Polymarket] Disconnected');
}

/**
 * Update subscription configuration
 */
export async function updatePolymarketConfig(config: {
  topics?: string[];
  threshold?: number;
}): Promise<{ success: boolean; error?: string }> {
  if (!isConnected || !eventHandler) {
    return { success: false, error: 'Not connected' };
  }

  return connectPolymarket({
    topics: config.topics || currentConfig?.topics,
    threshold: config.threshold || currentConfig?.threshold,
    onEvent: eventHandler,
  });
}

/**
 * Get connection status
 */
export function getPolymarketStatus(): {
  connected: boolean;
  config: { topics: string[]; threshold: number } | null;
} {
  return {
    connected: isConnected,
    config: currentConfig,
  };
}

/**
 * Get Polymarket server URL
 */
export function getPolymarketServerUrl(): string {
  return POLYMARKET_SERVER_URL;
}
