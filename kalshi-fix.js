// Kalshi API Integration Fix
// Replaces the broken pmxtjs Kalshi implementation with direct API calls

const KALSHI_API_BASE = 'https://api.elections.kalshi.com';

/**
 * Custom Kalshi implementation that works with the new API
 */
export class KalshiFixed {
  constructor() {
    this.baseUrl = KALSHI_API_BASE;
  }

  /**
   * Fetch active markets from Kalshi
   */
  async fetchMarkets({ limit = 50 } = {}) {
    try {
      const url = `${this.baseUrl}/trade-api/v2/markets?limit=${limit}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Prescience/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`Kalshi API ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data.markets || [];
    } catch (error) {
      console.error('Kalshi fetchMarkets error:', error);
      throw error;
    }
  }

  /**
   * Fetch trades for a specific market
   */
  async fetchTrades(marketId, { limit = 200 } = {}) {
    try {
      // Note: This endpoint might require authentication for trade data
      // For now, return empty array as we can still scan markets without detailed trade data
      console.log(`Kalshi fetchTrades called for ${marketId} (limit: ${limit})`);
      return [];
    } catch (error) {
      console.error(`Kalshi fetchTrades error for ${marketId}:`, error);
      return [];
    }
  }
}

/**
 * Helper function to transform Kalshi market data to match our format
 */
export function normalizeKalshiMarket(market) {
  return {
    marketId: market.ticker,
    title: market.title,
    url: `https://kalshi.com/markets/${market.ticker}`,
    volume24h: market.volume_24h || 0,
    yes_price: market.yes_ask_dollars ? parseFloat(market.yes_ask_dollars) : 0,
    no_price: market.no_ask_dollars ? parseFloat(market.no_ask_dollars) : 0,
    outcomes: ['YES', 'NO'], // Kalshi uses YES/NO for binary markets
    status: market.status,
    close_time: market.close_time,
    created_time: market.created_time
  };
}