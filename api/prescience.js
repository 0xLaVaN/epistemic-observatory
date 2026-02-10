/**
 * PRESCIENCE — Prediction Market Insider Tracking Engine
 * "See who sees first."
 * 
 * Uses Polymarket's public APIs to index trades, score wallets for
 * insider-like behavior, and surface suspicious activity.
 */

// ============================================
// CONFIG
// ============================================

const GAMMA_API = 'https://gamma-api.polymarket.com';
const DATA_API = 'https://data-api.polymarket.com';

// Cache TTLs (ms)
const CACHE_TTL = 5 * 60 * 1000;  // 5 min for most queries
const MARKET_CACHE_TTL = 15 * 60 * 1000; // 15 min for market lists

// In-memory cache
const cache = new Map();

function cached(key, ttl, fn) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < ttl) return Promise.resolve(entry.data);
  return fn().then(data => {
    cache.set(key, { data, ts: Date.now() });
    return data;
  });
}

// ============================================
// DATA FETCHING
// ============================================

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}: ${url}`);
  return res.json();
}

/** Get recently resolved markets from Gamma API */
async function getResolvedMarkets(limit = 50) {
  return cached(`resolved_markets_${limit}`, MARKET_CACHE_TTL, async () => {
    const markets = await fetchJSON(
      `${GAMMA_API}/markets?closed=true&limit=${limit}&order=closedTime&ascending=false`
    );
    // Filter to actually resolved (has outcomePrices with 0/1)
    return markets.filter(m => {
      try {
        const prices = JSON.parse(m.outcomePrices || '[]');
        return prices.some(p => parseFloat(p) === 1 || parseFloat(p) === 0);
      } catch { return false; }
    });
  });
}

/** Get active high-volume markets */
async function getActiveMarkets(limit = 30) {
  return cached(`active_markets_${limit}`, MARKET_CACHE_TTL, async () => {
    return fetchJSON(
      `${GAMMA_API}/markets?closed=false&limit=${limit}&order=volume24hr&ascending=false`
    );
  });
}

/** Get trades for a specific market (by conditionId) */
async function getMarketTrades(conditionId, limit = 500) {
  return cached(`trades_${conditionId}_${limit}`, CACHE_TTL, async () => {
    return fetchJSON(
      `${DATA_API}/trades?market=${conditionId}&limit=${limit}`
    );
  });
}

/** Get trades for a specific wallet */
async function getWalletTrades(address, limit = 500) {
  return cached(`wallet_trades_${address}_${limit}`, CACHE_TTL, async () => {
    return fetchJSON(
      `${DATA_API}/trades?user=${address}&limit=${limit}`
    );
  });
}

/** Get wallet activity/positions */
async function getWalletPositions(address) {
  return cached(`positions_${address}`, CACHE_TTL, async () => {
    return fetchJSON(
      `${DATA_API}/positions?user=${address}`
    );
  });
}

// ============================================
// PRESCIENCE SCORING ENGINE
// ============================================

/**
 * Compute Prescience Score for a wallet.
 * 0-100 scale. Higher = more suspicious (insider-like behavior).
 * 
 * Signals:
 * - wallet_age: Fresh wallets score higher
 * - avg_bet_size: Bigger bets score higher
 * - timing_score: Bets close to resolution score higher
 * - win_rate: Higher win rate scores higher (especially on binary)
 * - market_concentration: Only trading a few markets scores higher
 * - withdrawal_speed: Fast profit-taking scores higher
 */
function computePrescienceScore(trades, markets = []) {
  if (!trades || trades.length === 0) {
    return { score: 0, breakdown: {}, confidence: 'none', tradeCount: 0 };
  }

  const now = Date.now() / 1000;

  // --- wallet_age ---
  const timestamps = trades.map(t => t.timestamp).sort();
  const firstTrade = timestamps[0];
  const walletAgeDays = (now - firstTrade) / 86400;
  // Fresh wallet = high score. <7 days = 100, >180 days = 0
  const walletAgeScore = Math.max(0, Math.min(100, 100 - (walletAgeDays / 180) * 100));

  // --- avg_bet_size ---
  const betSizes = trades.map(t => t.size * t.price);
  const avgBetSize = betSizes.reduce((a, b) => a + b, 0) / betSizes.length;
  // >$10K avg = 100, <$10 = 0
  const avgBetScore = Math.min(100, (Math.log10(Math.max(1, avgBetSize)) / 4) * 100);

  // --- timing_score ---
  // How close to market resolution do they trade?
  // Build market close times lookup
  const marketCloseTimes = {};
  for (const m of markets) {
    if (m.conditionId && m.closedTime) {
      marketCloseTimes[m.conditionId] = new Date(m.closedTime).getTime() / 1000;
    }
  }

  let timingScores = [];
  for (const t of trades) {
    const closeTime = marketCloseTimes[t.conditionId];
    if (closeTime && t.timestamp < closeTime) {
      const hoursBeforeClose = (closeTime - t.timestamp) / 3600;
      // <1 hour = 100, >168 hours (1 week) = 0
      timingScores.push(Math.max(0, Math.min(100, 100 - (hoursBeforeClose / 168) * 100)));
    }
  }
  const timingScore = timingScores.length > 0
    ? timingScores.reduce((a, b) => a + b, 0) / timingScores.length
    : 50; // neutral if no data

  // --- win_rate ---
  // Group trades by conditionId, determine if they won
  const tradesByMarket = {};
  for (const t of trades) {
    if (!tradesByMarket[t.conditionId]) tradesByMarket[t.conditionId] = [];
    tradesByMarket[t.conditionId].push(t);
  }

  let wins = 0, losses = 0;
  for (const [cid, mTrades] of Object.entries(tradesByMarket)) {
    const market = markets.find(m => m.conditionId === cid);
    if (!market || !market.outcomePrices) continue;
    
    try {
      const prices = JSON.parse(market.outcomePrices);
      const outcomes = JSON.parse(market.outcomes || '[]');
      const winningIdx = prices.findIndex(p => parseFloat(p) === 1);
      if (winningIdx === -1) continue;
      const winningOutcome = outcomes[winningIdx];

      // Did they buy the winning outcome?
      const buys = mTrades.filter(t => t.side === 'BUY');
      for (const buy of buys) {
        if (buy.outcome === winningOutcome) wins++;
        else losses++;
      }
    } catch {}
  }

  const totalBets = wins + losses;
  const winRate = totalBets > 0 ? wins / totalBets : 0.5;
  // Win rate > 80% = 100, 50% = 0
  const winRateScore = Math.max(0, Math.min(100, (winRate - 0.5) * 200));

  // --- market_concentration ---
  const uniqueMarkets = new Set(trades.map(t => t.conditionId)).size;
  // Trading only 1-2 markets = high concentration = suspicious
  const concentrationScore = Math.max(0, Math.min(100, 100 - (uniqueMarkets / 20) * 100));

  // --- total_profit ---
  const totalVolume = betSizes.reduce((a, b) => a + b, 0);
  const profitScore = Math.min(100, (Math.log10(Math.max(1, totalVolume)) / 5) * 100);

  // --- COMPOSITE SCORE ---
  // Weights based on @thenarrator thesis:
  // Fresh wallet + big bets + short timing + high win rate = insider
  const weights = {
    wallet_age: 0.15,    // fresh wallet
    avg_bet_size: 0.15,  // big bets
    timing: 0.25,        // close to resolution (strongest signal)
    win_rate: 0.25,      // high win rate (strongest signal)
    concentration: 0.10, // few markets
    volume: 0.10,        // total volume
  };

  const rawScore = 
    walletAgeScore * weights.wallet_age +
    avgBetScore * weights.avg_bet_size +
    timingScore * weights.timing +
    winRateScore * weights.win_rate +
    concentrationScore * weights.concentration +
    profitScore * weights.volume;

  const score = Math.round(Math.max(0, Math.min(100, rawScore)));

  // Confidence based on data quality
  const confidence = totalBets >= 10 ? 'high' 
    : totalBets >= 5 ? 'medium' 
    : totalBets >= 2 ? 'low' 
    : 'insufficient';

  return {
    score,
    confidence,
    tradeCount: trades.length,
    breakdown: {
      wallet_age: { score: Math.round(walletAgeScore), days: Math.round(walletAgeDays), weight: weights.wallet_age },
      avg_bet_size: { score: Math.round(avgBetScore), usd: Math.round(avgBetSize * 100) / 100, weight: weights.avg_bet_size },
      timing: { score: Math.round(timingScore), samples: timingScores.length, weight: weights.timing },
      win_rate: { score: Math.round(winRateScore), rate: Math.round(winRate * 100) / 100, wins, losses, weight: weights.win_rate },
      concentration: { score: Math.round(concentrationScore), unique_markets: uniqueMarkets, weight: weights.concentration },
      volume: { score: Math.round(profitScore), total_usd: Math.round(totalVolume * 100) / 100, weight: weights.volume },
    },
    riskLevel: score >= 75 ? 'CRITICAL' : score >= 50 ? 'HIGH' : score >= 25 ? 'MEDIUM' : 'LOW',
  };
}

// ============================================
// API ROUTES
// ============================================

export function registerPrescienceRoutes(app) {

  // IMPORTANT: Register specific routes BEFORE the parameterized :address route

  // --- GET /prescience/leaderboard ---
  // Top suspicious wallets from recent resolved markets
  app.get('/prescience/leaderboard', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 20, 50);
      const markets = await getResolvedMarkets(20);

      // Collect trades from recent markets
      const allTrades = [];
      const fetchLimit = Math.min(markets.length, 10);
      for (let i = 0; i < fetchLimit; i++) {
        try {
          const trades = await getMarketTrades(markets[i].conditionId, 200);
          allTrades.push(...trades);
        } catch {}
      }

      // Group by wallet
      const walletTrades = {};
      for (const t of allTrades) {
        const w = t.proxyWallet?.toLowerCase();
        if (!w) continue;
        if (!walletTrades[w]) walletTrades[w] = [];
        walletTrades[w].push(t);
      }

      // Score each wallet
      const scored = [];
      for (const [wallet, trades] of Object.entries(walletTrades)) {
        if (trades.length < 2) continue;
        const result = computePrescienceScore(trades, markets);
        scored.push({ address: wallet, ...result });
      }

      scored.sort((a, b) => b.score - a.score);

      res.json({
        leaderboard: scored.slice(0, limit),
        total_wallets_analyzed: Object.keys(walletTrades).length,
        markets_scanned: fetchLimit,
        methodology: 'Wallets scored across recently resolved Polymarket markets. Higher score = more insider-like behavior.',
        engine: 'Prescience v1.0',
      });
    } catch (err) {
      console.error('Leaderboard error:', err);
      res.status(500).json({ error: 'Failed to generate leaderboard', detail: err.message });
    }
  });

  // --- GET /prescience/alerts ---
  app.get('/prescience/alerts', async (req, res) => {
    try {
      const threshold = parseInt(req.query.threshold) || 50;
      const markets = await getResolvedMarkets(10);

      const alerts = [];
      const scanLimit = Math.min(markets.length, 5);

      for (let i = 0; i < scanLimit; i++) {
        const market = markets[i];
        try {
          const trades = await getMarketTrades(market.conditionId, 300);
          
          const walletTrades = {};
          for (const t of trades) {
            const w = t.proxyWallet?.toLowerCase();
            if (!w) continue;
            if (!walletTrades[w]) walletTrades[w] = [];
            walletTrades[w].push(t);
          }

          for (const [wallet, wTrades] of Object.entries(walletTrades)) {
            if (wTrades.length < 2) continue;
            const result = computePrescienceScore(wTrades, [market]);
            if (result.score >= threshold) {
              const totalSize = wTrades.reduce((s, t) => s + t.size * t.price, 0);
              alerts.push({
                address: wallet,
                score: result.score,
                riskLevel: result.riskLevel,
                market: {
                  id: market.conditionId,
                  question: market.question,
                  volume: market.volumeNum,
                  closedTime: market.closedTime,
                },
                activity: {
                  trades: wTrades.length,
                  totalUSD: Math.round(totalSize * 100) / 100,
                  side: wTrades[0]?.side,
                  outcome: wTrades[0]?.outcome,
                },
                breakdown: result.breakdown,
              });
            }
          }
        } catch {}
      }

      alerts.sort((a, b) => b.score - a.score);

      res.json({
        alerts: alerts.slice(0, 50),
        threshold,
        markets_scanned: scanLimit,
        total_alerts: alerts.length,
        engine: 'Prescience v1.0',
      });
    } catch (err) {
      console.error('Alerts error:', err);
      res.status(500).json({ error: 'Failed to generate alerts', detail: err.message });
    }
  });

  // --- GET /prescience/pulse ---
  app.get('/prescience/pulse', async (req, res) => {
    try {
      const resolvedMarkets = await getResolvedMarkets(20);
      const activeMarkets = await getActiveMarkets(10);

      let totalSuspicious = 0;
      let totalWallets = 0;
      let totalVolume = 0;
      let highestScore = 0;
      let hotMarkets = [];

      const scanLimit = Math.min(resolvedMarkets.length, 5);
      for (let i = 0; i < scanLimit; i++) {
        const market = resolvedMarkets[i];
        try {
          const trades = await getMarketTrades(market.conditionId, 200);
          const mVolume = trades.reduce((s, t) => s + t.size * t.price, 0);
          totalVolume += mVolume;

          const wallets = {};
          for (const t of trades) {
            const w = t.proxyWallet?.toLowerCase();
            if (!w) continue;
            if (!wallets[w]) wallets[w] = [];
            wallets[w].push(t);
          }

          let marketSuspicious = 0;
          for (const [, wTrades] of Object.entries(wallets)) {
            if (wTrades.length < 2) continue;
            const r = computePrescienceScore(wTrades, [market]);
            if (r.score >= 50) marketSuspicious++;
            if (r.score > highestScore) highestScore = r.score;
          }

          totalWallets += Object.keys(wallets).length;
          totalSuspicious += marketSuspicious;

          if (marketSuspicious > 0) {
            hotMarkets.push({
              question: market.question,
              conditionId: market.conditionId,
              volume: market.volumeNum,
              suspicious_wallets: marketSuspicious,
              closedTime: market.closedTime,
            });
          }
        } catch {}
      }

      hotMarkets.sort((a, b) => b.suspicious_wallets - a.suspicious_wallets);

      res.json({
        pulse: {
          timestamp: new Date().toISOString(),
          markets_scanned: scanLimit,
          total_wallets: totalWallets,
          suspicious_wallets: totalSuspicious,
          suspicious_ratio: totalWallets > 0 ? Math.round((totalSuspicious / totalWallets) * 10000) / 100 : 0,
          highest_score: highestScore,
          total_volume_usd: Math.round(totalVolume * 100) / 100,
          threat_level: totalSuspicious >= 20 ? 'SEVERE' : totalSuspicious >= 10 ? 'ELEVATED' : totalSuspicious >= 3 ? 'GUARDED' : 'LOW',
        },
        hot_markets: hotMarkets.slice(0, 10),
        active_markets: activeMarkets.slice(0, 5).map(m => ({
          question: m.question,
          conditionId: m.conditionId,
          volume24hr: m.volume24hr,
          volumeTotal: m.volumeNum,
        })),
        engine: 'Prescience v1.0',
        tagline: 'See who sees first.',
      });
    } catch (err) {
      console.error('Pulse error:', err);
      res.status(500).json({ error: 'Failed to generate pulse', detail: err.message });
    }
  });

  // --- GET /prescience/market/:marketId ---
  app.get('/prescience/market/:marketId', async (req, res) => {
    try {
      const marketId = req.params.marketId;

      let marketInfo = null;
      try {
        const markets = await fetchJSON(`${GAMMA_API}/markets?condition_id=${marketId}&limit=1`);
        if (markets.length > 0) marketInfo = markets[0];
      } catch {}

      if (!marketInfo) {
        try {
          const markets = await fetchJSON(`${GAMMA_API}/markets?slug=${marketId}&limit=1`);
          if (markets.length > 0) marketInfo = markets[0];
        } catch {}
      }

      const conditionId = marketInfo?.conditionId || marketId;
      const trades = await getMarketTrades(conditionId, 500);

      if (!trades || trades.length === 0) {
        return res.json({
          marketId,
          market: marketInfo ? { question: marketInfo.question, volume: marketInfo.volumeNum } : null,
          message: 'No trades found for this market',
          wallets: [],
        });
      }

      const walletTrades = {};
      for (const t of trades) {
        const w = t.proxyWallet?.toLowerCase();
        if (!w) continue;
        if (!walletTrades[w]) walletTrades[w] = [];
        walletTrades[w].push(t);
      }

      const walletScores = [];
      for (const [wallet, wTrades] of Object.entries(walletTrades)) {
        const result = computePrescienceScore(wTrades, marketInfo ? [marketInfo] : []);
        const totalSize = wTrades.reduce((s, t) => s + t.size * t.price, 0);
        walletScores.push({
          address: wallet,
          score: result.score,
          riskLevel: result.riskLevel,
          trades: wTrades.length,
          totalUSD: Math.round(totalSize * 100) / 100,
          primarySide: wTrades.filter(t => t.side === 'BUY').length >= wTrades.filter(t => t.side === 'SELL').length ? 'BUY' : 'SELL',
          primaryOutcome: wTrades[0]?.outcome,
          breakdown: result.breakdown,
        });
      }

      walletScores.sort((a, b) => b.score - a.score);

      const totalVolume = trades.reduce((s, t) => s + t.size * t.price, 0);
      const suspiciousCount = walletScores.filter(w => w.score >= 50).length;

      res.json({
        market: marketInfo ? {
          question: marketInfo.question,
          conditionId: marketInfo.conditionId,
          volume: marketInfo.volumeNum,
          closed: marketInfo.closed,
          closedTime: marketInfo.closedTime,
          outcomes: marketInfo.outcomes,
          outcomePrices: marketInfo.outcomePrices,
        } : { conditionId: marketId },
        analysis: {
          total_trades: trades.length,
          unique_wallets: Object.keys(walletTrades).length,
          total_volume_usd: Math.round(totalVolume * 100) / 100,
          suspicious_wallets: suspiciousCount,
          insider_risk: suspiciousCount >= 5 ? 'HIGH' : suspiciousCount >= 2 ? 'MEDIUM' : 'LOW',
        },
        wallets: walletScores.slice(0, 30),
        engine: 'Prescience v1.0',
      });
    } catch (err) {
      console.error('Market analysis error:', err);
      res.status(500).json({ error: 'Failed to analyze market', detail: err.message });
    }
  });

  // --- GET /prescience/:address ---
  // Returns Prescience Score + breakdown for a wallet (MUST be after specific routes)
  app.get('/prescience/:address', async (req, res) => {
    try {
      const address = req.params.address.toLowerCase();
      const trades = await getWalletTrades(address);
      const markets = await getResolvedMarkets(100);

      if (!trades || trades.length === 0) {
        return res.json({
          address,
          score: 0,
          message: 'No Polymarket trades found for this address',
          tradeCount: 0,
        });
      }

      const result = computePrescienceScore(trades, markets);

      res.json({
        address,
        ...result,
        meta: {
          engine: 'Prescience v1.0',
          methodology: 'Composite score: wallet_age(15%) + bet_size(15%) + timing(25%) + win_rate(25%) + concentration(10%) + volume(10%)',
          tagline: 'See who sees first.',
        },
      });
    } catch (err) {
      console.error('Prescience score error:', err);
      res.status(500).json({ error: 'Failed to compute Prescience score', detail: err.message });
    }
  });

  // Update the root endpoint to include Prescience routes
  const originalRoot = app._router?.stack?.find(
    l => l.route?.path === '/' && l.route?.methods?.get
  );
  // We'll just add a /prescience root info endpoint
  app.get('/prescience', (req, res) => {
    res.json({
      name: 'Prescience',
      version: '1.0.0',
      tagline: 'See who sees first.',
      description: 'Prediction market insider tracking engine. Bloomberg terminal for on-chain surveillance.',
      by: 'Epistemic Observatory',
      endpoints: [
        'GET /prescience/:address — Prescience Score + breakdown for a wallet',
        'GET /prescience/leaderboard — Top suspicious wallets across recent markets',
        'GET /prescience/alerts — Recent high-score activity alerts',
        'GET /prescience/market/:marketId — Insider analysis for a specific market (conditionId or slug)',
        'GET /prescience/pulse — Overall market health + suspicious activity summary',
      ],
      scoring: {
        range: '0-100',
        signals: ['wallet_age', 'avg_bet_size', 'timing', 'win_rate', 'concentration', 'volume'],
        weights: 'timing(25%) + win_rate(25%) > wallet_age(15%) + bet_size(15%) > concentration(10%) + volume(10%)',
        thesis: 'Fresh wallet + big bets + late timing + high win rate = insider signal',
      },
      data_source: 'Polymarket (Gamma API + Data API)',
    });
  });
}
