import { WSSubscriptionManager } from '@nevuamarkets/poly-websockets';

const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';

// Types for Polymarket API responses
export interface PolymarketEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  subcategory: string;
  startDate: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  volume: number;
  liquidity: number;
  markets: PolymarketMarket[];
}

export interface PolymarketMarket {
  id: string;
  conditionId: string;
  slug: string;
  question: string;
  outcomes: string; // comma-separated
  outcomePrices: string; // comma-separated
  clobTokenIds: string; // comma-separated
  lastTradePrice: number;
  bestBid: number;
  bestAsk: number;
  volume: number;
  liquidity: number;
  oneDayPriceChange: number;
  oneHourPriceChange: number;
}

export interface Tag {
  id: string;
  slug: string;
  label: string;
}

export interface ParsedMarket {
  id: string;
  eventId: string;
  eventTitle: string;
  question: string;
  category: string;
  outcomes: Array<{
    name: string;
    tokenId: string;
    price: number;
  }>;
  volume: number;
  liquidity: number;
  lastTradePrice: number;
}

export interface PriceUpdate {
  tokenId: string;
  market: ParsedMarket;
  outcomeName: string;
  oldPrice: number;
  newPrice: number;
  priceChange: number;
  priceChangePercent: number;
  timestamp: Date;
}

type PriceUpdateHandler = (update: PriceUpdate) => void | Promise<void>;

export class PolymarketClient {
  private wsManager: WSSubscriptionManager | null = null;
  private subscribedMarkets: Map<string, ParsedMarket> = new Map();
  private tokenToMarket: Map<string, { market: ParsedMarket; outcomeIndex: number }> = new Map();
  private lastPrices: Map<string, number> = new Map();
  private priceChangeThreshold: number = 0.05; // 5% default
  private priceUpdateHandler: PriceUpdateHandler | null = null;
  private topicFilters: string[] = [];

  constructor(options?: { priceChangeThreshold?: number }) {
    if (options?.priceChangeThreshold) {
      this.priceChangeThreshold = options.priceChangeThreshold;
    }
  }

  /**
   * Fetch available tags/categories from Polymarket
   */
  async getTags(): Promise<Tag[]> {
    const response = await fetch(`${GAMMA_API_BASE}/tags`);
    if (!response.ok) {
      throw new Error(`Failed to fetch tags: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Search for events/markets by query
   */
  async searchEvents(query: string, limit = 20): Promise<PolymarketEvent[]> {
    const params = new URLSearchParams({
      _q: query,
      closed: 'false',
      limit: String(limit),
    });
    const response = await fetch(`${GAMMA_API_BASE}/events?${params}`);
    if (!response.ok) {
      throw new Error(`Failed to search events: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Fetch events by tag/category
   */
  async getEventsByTag(tagId: string, limit = 50): Promise<PolymarketEvent[]> {
    const params = new URLSearchParams({
      tag_id: tagId,
      closed: 'false',
      active: 'true',
      limit: String(limit),
    });
    const response = await fetch(`${GAMMA_API_BASE}/events?${params}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch events by tag: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Fetch all active events
   */
  async getActiveEvents(limit = 100): Promise<PolymarketEvent[]> {
    const params = new URLSearchParams({
      closed: 'false',
      active: 'true',
      limit: String(limit),
      order: 'volume',
      ascending: 'false',
    });
    const response = await fetch(`${GAMMA_API_BASE}/events?${params}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch active events: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Parse a Polymarket event into a more usable format
   */
  parseEvent(event: PolymarketEvent): ParsedMarket[] {
    return event.markets.map((market) => {
      const outcomes = market.outcomes?.split(',') || [];
      const prices = market.outcomePrices?.split(',').map(Number) || [];
      const tokenIds = market.clobTokenIds?.split(',') || [];

      return {
        id: market.id,
        eventId: event.id,
        eventTitle: event.title,
        question: market.question,
        category: event.category,
        outcomes: outcomes.map((name, i) => ({
          name: name.trim(),
          tokenId: tokenIds[i]?.trim() || '',
          price: prices[i] || 0,
        })),
        volume: market.volume,
        liquidity: market.liquidity,
        lastTradePrice: market.lastTradePrice,
      };
    });
  }

  /**
   * Set the price change threshold for notifications
   */
  setPriceChangeThreshold(threshold: number): void {
    this.priceChangeThreshold = threshold;
    console.log(`[Polymarket] Price change threshold set to ${(threshold * 100).toFixed(1)}%`);
  }

  /**
   * Set topic filters (keywords to match in event titles/questions)
   */
  setTopicFilters(topics: string[]): void {
    this.topicFilters = topics.map((t) => t.toLowerCase());
    console.log(`[Polymarket] Topic filters set: ${topics.join(', ')}`);
  }

  /**
   * Check if a market matches the topic filters
   */
  private matchesTopicFilters(market: ParsedMarket): boolean {
    if (this.topicFilters.length === 0) return true;

    const searchText = `${market.eventTitle} ${market.question} ${market.category}`.toLowerCase();
    return this.topicFilters.some((topic) => searchText.includes(topic));
  }

  /**
   * Register handler for price updates
   */
  onPriceUpdate(handler: PriceUpdateHandler): void {
    this.priceUpdateHandler = handler;
  }

  /**
   * Subscribe to markets and start receiving updates
   */
  async subscribeToMarkets(events: PolymarketEvent[]): Promise<void> {
    const tokenIds: string[] = [];

    for (const event of events) {
      const parsedMarkets = this.parseEvent(event);

      for (const market of parsedMarkets) {
        // Check topic filter
        if (!this.matchesTopicFilters(market)) continue;

        this.subscribedMarkets.set(market.id, market);

        for (let i = 0; i < market.outcomes.length; i++) {
          const outcome = market.outcomes[i];
          if (outcome.tokenId) {
            tokenIds.push(outcome.tokenId);
            this.tokenToMarket.set(outcome.tokenId, { market, outcomeIndex: i });
            this.lastPrices.set(outcome.tokenId, outcome.price);
          }
        }
      }
    }

    if (tokenIds.length === 0) {
      console.log('[Polymarket] No markets match the current filters');
      return;
    }

    console.log(`[Polymarket] Subscribing to ${tokenIds.length} tokens from ${this.subscribedMarkets.size} markets`);

    // Initialize WebSocket manager
    this.wsManager = new WSSubscriptionManager({
      onPriceChange: async (events) => {
        for (const event of events) {
          this.handlePriceChange(event);
        }
      },
      onPolymarketPriceUpdate: async (events) => {
        for (const event of events) {
          this.handlePriceChange(event);
        }
      },
      onError: async (error) => {
        console.error('[Polymarket] WebSocket error:', error.message);
      },
      onWSOpen: async () => {
        console.log('[Polymarket] WebSocket connected');
      },
      onWSClose: async () => {
        console.log('[Polymarket] WebSocket disconnected');
      },
    });

    await this.wsManager.addSubscriptions(tokenIds);
  }

  /**
   * Handle incoming price change events
   */
  private handlePriceChange(event: any): void {
    const tokenId = event.asset_id || event.tokenId;
    if (!tokenId) return;

    const marketInfo = this.tokenToMarket.get(tokenId);
    if (!marketInfo) return;

    const { market, outcomeIndex } = marketInfo;
    const outcome = market.outcomes[outcomeIndex];
    const oldPrice = this.lastPrices.get(tokenId) || outcome.price;
    const newPrice = event.price ?? event.changes?.[0]?.price ?? oldPrice;

    if (newPrice === oldPrice) return;

    const priceChange = newPrice - oldPrice;
    const priceChangePercent = oldPrice > 0 ? Math.abs(priceChange) / oldPrice : 0;

    // Update stored price
    this.lastPrices.set(tokenId, newPrice);
    outcome.price = newPrice;

    // Check threshold
    if (priceChangePercent >= this.priceChangeThreshold) {
      const update: PriceUpdate = {
        tokenId,
        market,
        outcomeName: outcome.name,
        oldPrice,
        newPrice,
        priceChange,
        priceChangePercent,
        timestamp: new Date(),
      };

      console.log(
        `[Polymarket] Price alert: "${market.question}" - ${outcome.name}: ` +
          `${(oldPrice * 100).toFixed(1)}% → ${(newPrice * 100).toFixed(1)}% ` +
          `(${priceChange > 0 ? '+' : ''}${(priceChangePercent * 100).toFixed(1)}%)`
      );

      if (this.priceUpdateHandler) {
        this.priceUpdateHandler(update);
      }
    }
  }

  /**
   * Get currently subscribed markets
   */
  getSubscribedMarkets(): ParsedMarket[] {
    return Array.from(this.subscribedMarkets.values());
  }

  /**
   * Get statistics
   */
  getStats(): { markets: number; tokens: number; wsStats: any } {
    return {
      markets: this.subscribedMarkets.size,
      tokens: this.tokenToMarket.size,
      wsStats: this.wsManager?.getStatistics() || null,
    };
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    if (this.wsManager) {
      await this.wsManager.clearState();
      this.wsManager = null;
    }
    this.subscribedMarkets.clear();
    this.tokenToMarket.clear();
    this.lastPrices.clear();
    console.log('[Polymarket] Disconnected');
  }
}
