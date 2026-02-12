/**
 * PRESCIENCE BACKTEST ENGINE
 * "Trust, but verify."
 * 
 * Validates the Prescience scoring model against resolved markets.
 * Shows: do high-score wallets actually predict outcomes better?
 * 
 * This is the killer feature — proof the model works.
 */

const GAMMA_API = 'https://gamma-api.polymarket.com';
const DATA_API = 'https://data-api.polymarket.com';

const cache = new Map();
function cached(key, ttl, fn) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < ttl) return Promise.resolve(entry.data);
  return fn().then(data => {
    cache.set(key, { data, ts: Date.now() });
    return data;
  });
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}: ${url}`);
  return res.json();
}

/**
 * Get recently resolved markets with outcome data
 */
async function getResolvedMarkets(limit = 20) {
  return cached(`bt_resolved_${limit}`, 15 * 60 * 1000, async () => {
    const markets = await fetchJSON(
      `${GAMMA_API}/markets?closed=true&limit=${limit}&order=closedTime&ascending=false`
    );
    return markets.filter(m => {
      try {
        const prices = JSON.parse(m.outcomePrices || '[]');
        return prices.some(p => parseFloat(p) === 1 || parseFloat(p) === 0);
      } catch { return false; }
    });
  });
}

/**
 * Get trades for a market
 */
async function getMarketTrades(conditionId, limit = 500) {
  return cached(`bt_trades_${conditionId}`, 10 * 60 * 1000, async () => {
    return fetchJSON(
      `${DATA_API}/trades?market=${conditionId}&limit=${limit}`
    );
  });
}

/**
 * Compute a simplified Prescience-like score for a set of trades
 * Focuses on the signals most predictive of insider behavior
 */
function quickScore(trades, market) {
  if (!trades.length) return { score: 0, signals: {} };

  const now = Date.now() / 1000;

  // Wallet age
  const timestamps = trades.map(t => t.timestamp).sort();
  const walletAgeDays = (now - timestamps[0]) / 86400;
  const ageScore = Math.max(0, Math.min(100, 100 - (walletAgeDays / 180) * 100));

  // Bet size
  const sizes = trades.map(t => (t.size || 0) * (t.price || 0));
  const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
  const sizeScore = Math.min(100, (Math.log10(Math.max(1, avgSize)) / 4) * 100);

  // Timing - how close to resolution
  const closeTime = market.closedTime ? new Date(market.closedTime).getTime() / 1000 : null;
  let timingScore = 50;
  if (closeTime) {
    const timingScores = trades.map(t => {
      if (t.timestamp >= closeTime) return 50;
      const hoursBefore = (closeTime - t.timestamp) / 3600;
      return Math.max(0, Math.min(100, 100 - (hoursBefore / 168) * 100));
    });
    timingScore = timingScores.reduce((a, b) => a + b, 0) / timingScores.length;
  }

  // Concentration (fewer markets = more suspicious, but here we only see one market)
  const concScore = trades.length <= 3 ? 80 : trades.length <= 10 ? 50 : 20;

  // Weighted composite
  const score = Math.round(
    ageScore * 0.15 +
    sizeScore * 0.20 +
    timingScore * 0.35 +
    concScore * 0.30
  );

  return {
    score: Math.min(100, Math.max(0, score)),
    signals: {
      wallet_age: Math.round(ageScore),
      bet_size: Math.round(sizeScore),
      timing: Math.round(timingScore),
      concentration: Math.round(concScore),
    },
  };
}

/**
 * Run backtest on resolved markets
 * For each market:
 *   1. Get all trades
 *   2. Identify winning outcome
 *   3. Group traders by score bucket (0-33 low, 34-66 mid, 67-100 high)
 *   4. Compare: what % of each bucket bet on the winning side?
 */
async function runBacktest(marketLimit = 10) {
  const markets = await getResolvedMarkets(marketLimit);
  
  const results = [];
  const buckets = { low: { correct: 0, total: 0 }, mid: { correct: 0, total: 0 }, high: { correct: 0, total: 0 } };
  let marketsAnalyzed = 0;
  let totalTraders = 0;

  for (const market of markets.slice(0, marketLimit)) {
    try {
      const outcomes = JSON.parse(market.outcomes || '[]');
      const outcomePrices = JSON.parse(market.outcomePrices || '[]');
      const winningIdx = outcomePrices.findIndex(p => parseFloat(p) === 1);
      if (winningIdx === -1) continue;
      const winningOutcome = outcomes[winningIdx];

      const trades = await getMarketTrades(market.conditionId);
      if (!trades || trades.length < 5) continue;

      // --- Filter: exclude consensus-aligned near-expiry entries ---
      // If entry odds were >90% consensus-aligned AND market resolves within 72hrs of entry,
      // these are near-certainty yield farms, not predictions. Exclude from hit rate calc.
      const closeTime = market.closedTime ? new Date(market.closedTime).getTime() / 1000 : null;
      let consensusOutcome = null;
      let maxOdds = 0;
      try {
        const mOutcomes = JSON.parse(market.outcomes || '[]');
        const mPrices = JSON.parse(market.outcomePrices || '[]');
        // Use pre-resolution prices from market snapshot (best available proxy)
        for (let pi = 0; pi < mPrices.length; pi++) {
          const p = parseFloat(mPrices[pi]) || 0;
          if (p > maxOdds) { maxOdds = p; consensusOutcome = mOutcomes[pi]; }
        }
      } catch {}

      const filteredTrades = trades.filter(t => {
        if (t.side !== 'BUY') return true; // only filter buys for hit rate
        // Was this trade on the consensus side at >90% odds?
        const onConsensusSide = t.outcome === consensusOutcome && maxOdds >= 0.90;
        if (!onConsensusSide) return true; // keep non-consensus trades
        // Did market resolve within 72hrs of this entry?
        if (!closeTime || !t.timestamp) return true;
        const hoursToClose = (closeTime - t.timestamp) / 3600;
        if (hoursToClose <= 72 && hoursToClose >= 0) return false; // exclude: yield farm
        return true;
      });

      // Group by trader (using filtered trades)
      const traderTrades = {};
      for (const t of filteredTrades) {
        const addr = t.proxyWallet || t.maker || t.taker || t.user;
        if (!addr) continue;
        if (!traderTrades[addr]) traderTrades[addr] = [];
        traderTrades[addr].push(t);
      }

      const marketResult = {
        question: market.question,
        slug: market.slug,
        conditionId: market.conditionId,
        closedTime: market.closedTime,
        winningOutcome,
        volume: market.volume,
        traderCount: Object.keys(traderTrades).length,
        bucketResults: { low: { correct: 0, total: 0 }, mid: { correct: 0, total: 0 }, high: { correct: 0, total: 0 } },
      };

      for (const [addr, tTrades] of Object.entries(traderTrades)) {
        const { score } = quickScore(tTrades, market);
        
        // Did this trader bet on the winning outcome? (look at their buys)
        const buys = tTrades.filter(t => t.side === 'BUY');
        if (buys.length === 0) continue;

        const boughtWinner = buys.some(t => t.outcome === winningOutcome);
        const bucket = score < 34 ? 'low' : score < 67 ? 'mid' : 'high';

        buckets[bucket].total++;
        marketResult.bucketResults[bucket].total++;
        totalTraders++;

        if (boughtWinner) {
          buckets[bucket].correct++;
          marketResult.bucketResults[bucket].correct++;
        }
      }

      marketsAnalyzed++;
      results.push(marketResult);

      // Rate limit - be nice to Polymarket APIs
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.warn(`Backtest skip market ${market.conditionId}: ${err.message}`);
    }
  }

  // Compute accuracy rates
  const accuracy = {};
  for (const [bucket, data] of Object.entries(buckets)) {
    accuracy[bucket] = {
      ...data,
      accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 1000) / 10 : null,
    };
  }

  // Model validation verdict
  const highAcc = accuracy.high.accuracy;
  const lowAcc = accuracy.low.accuracy;
  const lift = highAcc !== null && lowAcc !== null ? Math.round((highAcc - lowAcc) * 10) / 10 : null;

  let verdict = 'INSUFFICIENT_DATA';
  if (lift !== null) {
    if (lift > 15) verdict = 'STRONG_SIGNAL';
    else if (lift > 5) verdict = 'MODERATE_SIGNAL';
    else if (lift > 0) verdict = 'WEAK_SIGNAL';
    else verdict = 'NO_SIGNAL';
  }

  return {
    summary: {
      verdict,
      lift_pct: lift,
      markets_analyzed: marketsAnalyzed,
      total_traders: totalTraders,
      high_score_accuracy: accuracy.high.accuracy,
      low_score_accuracy: accuracy.low.accuracy,
      thesis: lift > 0
        ? `High-score wallets predicted outcomes ${lift}% more accurately than low-score wallets.`
        : `Model did not show predictive lift in this sample.`,
    },
    buckets: accuracy,
    markets: results.map(r => ({
      question: r.question,
      winningOutcome: r.winningOutcome,
      traders: r.traderCount,
      buckets: {
        high: r.bucketResults.high.total > 0
          ? `${Math.round((r.bucketResults.high.correct / r.bucketResults.high.total) * 100)}% (n=${r.bucketResults.high.total})`
          : 'n/a',
        mid: r.bucketResults.mid.total > 0
          ? `${Math.round((r.bucketResults.mid.correct / r.bucketResults.mid.total) * 100)}% (n=${r.bucketResults.mid.total})`
          : 'n/a',
        low: r.bucketResults.low.total > 0
          ? `${Math.round((r.bucketResults.low.correct / r.bucketResults.low.total) * 100)}% (n=${r.bucketResults.low.total})`
          : 'n/a',
      },
    })),
    meta: {
      engine: 'Prescience Backtest v1.0',
      timestamp: new Date().toISOString(),
      methodology: 'Traders scored by wallet age, bet size, timing proximity to resolution, and concentration. Grouped into low/mid/high buckets. Accuracy = % who bought the winning outcome. Consensus-aligned entries (>90% odds) within 72hrs of resolution are excluded as yield farms.',
      caveat: 'Sample size matters. Small n = noisy results. Run with more markets for confidence.',
    },
  };
}

/**
 * Register backtest routes
 */
export function registerBacktestRoutes(app) {
  // Main backtest endpoint
  app.get('/prescience/backtest', async (req, res) => {
    try {
      const limit = Math.min(30, Math.max(3, parseInt(req.query.markets) || 10));
      const result = await runBacktest(limit);
      res.json(result);
    } catch (err) {
      console.error('Backtest error:', err);
      res.status(500).json({ error: 'Backtest failed', detail: err.message });
    }
  });

  // Quick validation - just the summary
  app.get('/prescience/backtest/summary', async (req, res) => {
    try {
      const limit = Math.min(15, Math.max(3, parseInt(req.query.markets) || 8));
      const result = await runBacktest(limit);
      res.json(result.summary);
    } catch (err) {
      console.error('Backtest summary error:', err);
      res.status(500).json({ error: 'Backtest failed', detail: err.message });
    }
  });
}
