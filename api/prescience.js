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
const WATCHLIST_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours for watchlist
const CLUSTER_CACHE_TTL = 5 * 60 * 1000; // 5 min for cluster scans

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
// PRESCIENCE v2 SCORING ENGINE
// ============================================

/**
 * Classify wallet into archetype based on trading patterns.
 * Returns: 'scalper' | 'insider' | 'whale' | 'retail'
 */
function classifyArchetype(trades, markets = []) {
  const uniqueMarkets = new Set(trades.map(t => t.conditionId)).size;
  const betSizes = trades.map(t => (t.size || 0) * (t.price || 0));
  const totalVolume = betSizes.reduce((a, b) => a + b, 0);
  const avgBetSize = betSizes.length > 0 ? totalVolume / betSizes.length : 0;

  // Build market duration map
  const marketDurations = {};
  for (const m of markets) {
    if (m.conditionId) {
      const created = m.createdAt ? new Date(m.createdAt).getTime() : null;
      const closed = m.closedTime ? new Date(m.closedTime).getTime() : null;
      if (created && closed && closed > created) {
        marketDurations[m.conditionId] = (closed - created) / 3600000; // hours
      }
    }
  }

  // Compute win rate (with price-movement proxy for unresolved markets)
  const { wins, losses, softWins, softLosses } = computeWinLoss(trades, markets);
  const totalBets = wins + losses;
  const softTotal = softWins + softLosses;
  // Blend: resolved wins count full, soft wins count at 0.5 weight
  const blendedWins = wins + softWins * 0.5;
  const blendedTotal = totalBets + softTotal * 0.5;
  const winRate = blendedTotal > 0 ? blendedWins / blendedTotal : 0.5;

  // Avg market duration for this wallet's trades
  const durations = trades.map(t => marketDurations[t.conditionId]).filter(Boolean);
  const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
  const shortMarketPref = durations.length > 0 ? durations.filter(d => d < 24).length / durations.length : 0;

  // Avg liquidity-relative size
  const marketLiqMap = {};
  for (const m of markets) {
    if (m.conditionId && m.liquidityNum) marketLiqMap[m.conditionId] = parseFloat(m.liquidityNum) || 0;
  }
  const liqRelSizes = trades.map(t => {
    const liq = marketLiqMap[t.conditionId];
    if (!liq || liq === 0) return null;
    return ((t.size || 0) * (t.price || 0)) / liq;
  }).filter(Boolean);
  const avgLiqRelSize = liqRelSizes.length > 0 ? liqRelSizes.reduce((a, b) => a + b, 0) / liqRelSizes.length : 0;

  // Wallet age detection: fresh wallets betting big = strongest insider signal
  const timestamps = trades.map(t => t.timestamp).filter(Boolean).sort();
  const firstTradeTs = timestamps.length > 0 ? timestamps[0] : Date.now() / 1000;
  const walletAgeDays = (Date.now() / 1000 - firstTradeTs) / 86400;
  const isFreshWallet = walletAgeDays < 14; // less than 2 weeks old
  const isVeryFresh = walletAgeDays < 3; // less than 3 days old

  // Fresh wallet + large bets = highest conviction insider signal
  // But require >2% odds movement to filter out yield farmers on consensus markets
  const hasOddsMovement = markets.some(m => {
    const walletTrades = trades.filter(t => t.conditionId === m.conditionId);
    if (walletTrades.length === 0) return false;
    // Check if market has recent price movement (using volume as proxy for activity)
    const recentVolume = parseFloat(m.volume24hr || m.volume24h || 0);
    const totalLiq = parseFloat(m.liquidityNum || 0);
    // >2% movement proxy: significant recent volume relative to liquidity
    return totalLiq > 0 && (recentVolume / totalLiq) > 0.02;
  });

  if (isFreshWallet && avgBetSize > 500 && hasOddsMovement) {
    return 'fresh_insider'; // new archetype: brand new account, immediately large, with price impact
  }
  if (isVeryFresh && avgBetSize > 100 && hasOddsMovement) {
    return 'fresh_insider'; // even moderate bets on a 3-day-old wallet are suspicious if moving odds
  }
  // Fallback: fresh wallet with large bets but no odds movement = yield farmer, not insider
  if (isFreshWallet && avgBetSize > 500) {
    // Check for systematic yield farming: >5 unrelated categories, all consensus side, no odds correlation
    const categories = new Set();
    let allConsensus = true;
    for (const m of markets) {
      if (!m.conditionId) continue;
      const walletTrades = trades.filter(t => t.conditionId === m.conditionId);
      if (walletTrades.length === 0) continue;
      categories.add(m.category || m.tags?.[0] || 'unknown');
      // Check if on consensus side (>90%)
      try {
        const prices = JSON.parse(m.outcomePrices || '[]');
        const outcomes = JSON.parse(m.outcomes || '[]');
        const maxPrice = Math.max(...prices.map(p => parseFloat(p) || 0));
        const maxIdx = prices.findIndex(p => parseFloat(p) === maxPrice);
        const consensusOutcome = outcomes[maxIdx];
        const onConsensus = walletTrades.every(t => t.side !== 'BUY' || t.outcome === consensusOutcome);
        if (maxPrice < 0.90 || !onConsensus) allConsensus = false;
      } catch { allConsensus = false; }
    }
    if (categories.size >= 5 && allConsensus) {
      return 'systematic_yield_farmer';
    }
    return 'yield_farmer';
  }

  // Classification logic
  if (uniqueMarkets > 10 && avgBetSize < 200 && shortMarketPref > 0.5 && winRate < 0.65) {
    return 'scalper';
  }
  if (totalVolume >= 10000) {
    return 'whale';
  }
  if (uniqueMarkets <= 5 && avgLiqRelSize > 0.02 && winRate > 0.7 && totalBets >= 2) {
    return 'insider';
  }
  if (uniqueMarkets <= 8 && winRate > 0.65 && avgLiqRelSize > 0.01 && totalBets >= 2) {
    return 'insider';
  }
  // Fresh wallet with moderate activity still suspicious even if doesn't hit insider thresholds
  if (isFreshWallet && totalVolume > 1000 && uniqueMarkets <= 3) {
    return 'insider';
  }
  if (totalVolume >= 5000) {
    return 'whale';
  }
  return 'retail';
}

/**
 * Helper: compute wins/losses from trades + markets
 */
function computeWinLoss(trades, markets) {
  const tradesByMarket = {};
  for (const t of trades) {
    if (!tradesByMarket[t.conditionId]) tradesByMarket[t.conditionId] = [];
    tradesByMarket[t.conditionId].push(t);
  }
  let wins = 0, losses = 0;
  // Price-movement proxy for unresolved markets
  let softWins = 0, softLosses = 0;
  for (const [cid, mTrades] of Object.entries(tradesByMarket)) {
    const market = markets.find(m => m.conditionId === cid);
    if (!market || !market.outcomePrices) continue;
    try {
      const prices = JSON.parse(market.outcomePrices);
      const outcomes = JSON.parse(market.outcomes || '[]');
      const winningIdx = prices.findIndex(p => parseFloat(p) === 1);
      if (winningIdx !== -1) {
        // Resolved market — use actual outcome
        const winningOutcome = outcomes[winningIdx];
        const buys = mTrades.filter(t => t.side === 'BUY');
        for (const buy of buys) {
          if (buy.outcome === winningOutcome) wins++;
          else losses++;
        }
      } else {
        // Unresolved market — price-movement proxy
        // If wallet bought outcome X at price P and current price > P, that's a soft win
        const buys = mTrades.filter(t => t.side === 'BUY');
        for (const buy of buys) {
          const outcomeIdx = outcomes.indexOf(buy.outcome);
          if (outcomeIdx === -1) continue;
          const currentPrice = parseFloat(prices[outcomeIdx]) || 0;
          const buyPrice = parseFloat(buy.price) || 0;
          if (buyPrice <= 0 || currentPrice <= 0) continue;
          const priceMove = currentPrice - buyPrice;
          // Require meaningful movement (>5 cents) to count
          if (priceMove > 0.05) softWins++;
          else if (priceMove < -0.05) softLosses++;
        }
      }
    } catch {}
  }
  return { wins, losses, softWins, softLosses };
}

/**
 * Compute Prescience Score v2 for a wallet.
 * 0-100 scale. Higher = more suspicious (insider-like behavior).
 *
 * v2 improvements:
 * - Market duration normalization (short markets ≠ insider signal)
 * - Archetype classification (scalper/insider/whale/retail)
 * - Outcome-weighted timing (late + correct + long market = signal)
 * - Topic/domain edge detection
 * - Liquidity-relative sizing
 */
function computePrescienceScore(trades, markets = []) {
  if (!trades || trades.length === 0) {
    return { score: 0, breakdown: {}, confidence: 'none', tradeCount: 0, archetype: 'unknown' };
  }

  const now = Date.now() / 1000;

  // --- Archetype classification ---
  const archetype = classifyArchetype(trades, markets);

  // --- Build lookups ---
  const marketMap = {};
  const marketCloseTimes = {};
  const marketCreateTimes = {};
  const marketLiqMap = {};
  const marketTagMap = {};
  for (const m of markets) {
    if (m.conditionId) {
      marketMap[m.conditionId] = m;
      if (m.closedTime) marketCloseTimes[m.conditionId] = new Date(m.closedTime).getTime() / 1000;
      if (m.createdAt) marketCreateTimes[m.conditionId] = new Date(m.createdAt).getTime() / 1000;
      if (m.liquidityNum) marketLiqMap[m.conditionId] = parseFloat(m.liquidityNum) || 0;
      marketTagMap[m.conditionId] = m.tags || m.category || null;
    }
  }

  // --- Determine winning outcomes per market ---
  const winningOutcomes = {};
  for (const m of markets) {
    if (!m.conditionId || !m.outcomePrices) continue;
    try {
      const prices = JSON.parse(m.outcomePrices);
      const outcomes = JSON.parse(m.outcomes || '[]');
      const winIdx = prices.findIndex(p => parseFloat(p) === 1);
      if (winIdx !== -1) winningOutcomes[m.conditionId] = outcomes[winIdx];
    } catch {}
  }

  // --- wallet_age ---
  const timestamps = trades.map(t => t.timestamp).sort();
  const firstTrade = timestamps[0];
  const walletAgeDays = (now - firstTrade) / 86400;
  const walletAgeScore = Math.max(0, Math.min(100, 100 - (walletAgeDays / 180) * 100));

  // --- Liquidity-relative sizing ---
  const liqRelSizes = [];
  for (const t of trades) {
    const liq = marketLiqMap[t.conditionId];
    const size = (t.size || 0) * (t.price || 0);
    if (liq && liq > 0) {
      liqRelSizes.push(size / liq);
    }
  }
  const avgLiqRelSize = liqRelSizes.length > 0 ? liqRelSizes.reduce((a, b) => a + b, 0) / liqRelSizes.length : 0;
  // 5%+ of liquidity = 100, 0.01% = 0
  const liquiditySizeScore = Math.max(0, Math.min(100, (avgLiqRelSize / 0.05) * 100));

  // --- Duration-normalized, outcome-weighted timing ---
  let timingScores = [];
  for (const t of trades) {
    const closeTime = marketCloseTimes[t.conditionId];
    const createTime = marketCreateTimes[t.conditionId];
    if (!closeTime || t.timestamp >= closeTime) continue;

    const marketDurationHrs = createTime ? (closeTime - createTime) / 3600 : null;
    const hoursBeforeClose = (closeTime - t.timestamp) / 3600;

    // Duration normalization: ratio of "time remaining" to "total market life"
    // Low ratio = bet placed very late relative to market duration
    let normalizedTiming;
    if (marketDurationHrs && marketDurationHrs > 0) {
      const fractionRemaining = hoursBeforeClose / marketDurationHrs;
      // fractionRemaining close to 0 = late bet. But only meaningful on long markets.
      // Scale by market duration: short markets (<24h) get dampened
      const durationMultiplier = Math.min(1, marketDurationHrs / (24 * 7)); // ramps 0→1 over a week
      normalizedTiming = Math.max(0, Math.min(100, (1 - fractionRemaining) * 100 * durationMultiplier));
    } else {
      // No duration info, use absolute timing with moderate weight
      normalizedTiming = Math.max(0, Math.min(100, 100 - (hoursBeforeClose / 168) * 100)) * 0.5;
    }

    // Outcome weighting: was this the CORRECT side?
    const winOutcome = winningOutcomes[t.conditionId];
    if (winOutcome && t.side === 'BUY') {
      if (t.outcome === winOutcome) {
        // Late + correct = strong signal, keep full score
        timingScores.push(normalizedTiming);
      } else {
        // Late + wrong = NOT insider, score 0 for this trade
        timingScores.push(0);
      }
    } else {
      // No outcome data or not a buy, use dampened score
      timingScores.push(normalizedTiming * 0.3);
    }
  }
  const timingScore = timingScores.length > 0
    ? timingScores.reduce((a, b) => a + b, 0) / timingScores.length
    : 30; // neutral-low if no data

  // --- Win rate (with price-movement proxy for unresolved markets) ---
  const { wins, losses, softWins, softLosses } = computeWinLoss(trades, markets);
  const totalBets = wins + losses;
  const softTotal = softWins + softLosses;
  // Blend: resolved wins count full, soft wins (price moved in wallet's direction) count at 0.5 weight
  const blendedWins = wins + softWins * 0.5;
  const blendedTotal = totalBets + softTotal * 0.5;
  const winRate = blendedTotal > 0 ? blendedWins / blendedTotal : 0.5;
  const winRateScore = Math.max(0, Math.min(100, (winRate - 0.5) * 200));

  // --- Market concentration ---
  const uniqueMarkets = new Set(trades.map(t => t.conditionId)).size;
  const concentrationScore = Math.max(0, Math.min(100, 100 - (uniqueMarkets / 20) * 100));

  // --- Topic/domain edge detection ---
  const tagWins = {}; // tag → { wins, total }
  const tradesByMarket = {};
  for (const t of trades) {
    if (!tradesByMarket[t.conditionId]) tradesByMarket[t.conditionId] = [];
    tradesByMarket[t.conditionId].push(t);
  }
  for (const [cid, mTrades] of Object.entries(tradesByMarket)) {
    const tag = marketTagMap[cid];
    const tagKey = Array.isArray(tag) ? tag[0] : (tag || 'unknown');
    if (!tagWins[tagKey]) tagWins[tagKey] = { wins: 0, total: 0 };
    const winOutcome = winningOutcomes[cid];
    if (!winOutcome) continue;
    for (const t of mTrades) {
      if (t.side !== 'BUY') continue;
      tagWins[tagKey].total++;
      if (t.outcome === winOutcome) tagWins[tagKey].wins++;
    }
  }

  // Domain edge: high win rate concentrated in one topic
  let domainEdgeScore = 0;
  let topDomain = null;
  const tagEntries = Object.entries(tagWins).filter(([, v]) => v.total >= 2);
  if (tagEntries.length > 0) {
    for (const [tag, { wins: tw, total: tt }] of tagEntries) {
      const rate = tw / tt;
      if (rate > 0.7 && tt >= 3) {
        const score = Math.min(100, (rate - 0.5) * 200 * Math.min(1, tt / 5));
        if (score > domainEdgeScore) {
          domainEdgeScore = score;
          topDomain = tag;
        }
      }
    }
    // Winning across many random topics = lower domain edge (more likely luck)
    const winningDomains = tagEntries.filter(([, v]) => v.total >= 2 && v.wins / v.total > 0.6).length;
    if (winningDomains > 3) domainEdgeScore *= 0.5; // spread = less suspicious
  }

  // --- Volume ---
  const betSizes = trades.map(t => (t.size || 0) * (t.price || 0));
  const totalVolume = betSizes.reduce((a, b) => a + b, 0);
  const volumeScore = Math.min(100, (Math.log10(Math.max(1, totalVolume)) / 5) * 100);

  // --- COMPOSITE SCORE (v2 weights) ---
  const weights = {
    wallet_age: 0.10,
    timing: 0.25,         // duration-normalized + outcome-weighted
    win_rate: 0.20,
    liquidity_size: 0.20, // NEW: liquidity-relative sizing
    domain_edge: 0.10,    // NEW: topic concentration
    concentration: 0.08,
    volume: 0.07,
  };

  let rawScore =
    walletAgeScore * weights.wallet_age +
    timingScore * weights.timing +
    winRateScore * weights.win_rate +
    liquiditySizeScore * weights.liquidity_size +
    domainEdgeScore * weights.domain_edge +
    concentrationScore * weights.concentration +
    volumeScore * weights.volume;

  // --- Expiry proximity discount ---
  // Markets within 48hrs of resolution with >95% consensus are yield farming, not insider flow
  let expiryDiscount = 1.0;
  let expiryProximityHours = null;
  let consensusPct = null;
  for (const m of markets) {
    if (!m.conditionId) continue;
    const endDate = m.endDate || m.closedTime;
    if (!endDate) continue;
    const msToExpiry = new Date(endDate).getTime() - Date.now();
    const hrsToExpiry = msToExpiry / 3600000;
    if (hrsToExpiry <= 0 || hrsToExpiry > 48) continue;

    // Calculate consensus percentage from current prices
    let maxPrice = 0;
    try {
      const prices = JSON.parse(m.outcomePrices || '[]');
      maxPrice = Math.max(...prices.map(p => parseFloat(p) || 0));
    } catch {}

    if (maxPrice >= 0.95 && hrsToExpiry <= 48) {
      const thisDiscount = hrsToExpiry <= 24 && maxPrice >= 0.99 ? 0.3
        : hrsToExpiry <= 48 && maxPrice >= 0.95 ? 0.3
        : 1.0;
      if (thisDiscount < expiryDiscount) {
        expiryDiscount = thisDiscount;
        expiryProximityHours = Math.round(hrsToExpiry * 10) / 10;
        consensusPct = Math.round(maxPrice * 100);
      }
    }
  }
  rawScore *= expiryDiscount;

  // --- Archetype-based capping/boosting ---
  if (archetype === 'fresh_insider') {
    // Fresh wallet + big bets = minimum score of 75, no cap
    // But respect expiry discount — yield farmers on expiring markets shouldn't get boosted
    if (expiryDiscount >= 1.0) {
      rawScore = Math.max(rawScore, 75);
    }
  } else if (archetype === 'systematic_yield_farmer') {
    rawScore = Math.min(rawScore, 20); // auto-cap: cross-category consensus farming
  } else if (archetype === 'yield_farmer') {
    rawScore = Math.min(rawScore, 30); // consensus-side, no odds movement
  } else if (archetype === 'scalper') {
    rawScore = Math.min(rawScore, 25);
  } else if (archetype === 'retail') {
    rawScore = Math.min(rawScore, 40);
  }
  // insider and whale: no cap

  const score = Math.round(Math.max(0, Math.min(100, rawScore)));

  const confidence = totalBets >= 10 ? 'high'
    : totalBets >= 5 ? 'medium'
    : totalBets >= 2 ? 'low'
    : 'insufficient';

  return {
    score,
    confidence,
    tradeCount: trades.length,
    archetype,
    breakdown: {
      wallet_age: { score: Math.round(walletAgeScore), days: Math.round(walletAgeDays), weight: weights.wallet_age },
      timing: { score: Math.round(timingScore), samples: timingScores.length, weight: weights.timing, note: 'duration-normalized, outcome-weighted' },
      win_rate: { score: Math.round(winRateScore), rate: Math.round(winRate * 100) / 100, wins, losses, soft_wins: softWins, soft_losses: softLosses, weight: weights.win_rate, note: softTotal > 0 ? 'includes price-movement proxy for unresolved markets (0.5x weight)' : undefined },
      liquidity_size: { score: Math.round(liquiditySizeScore), avg_pct_of_liquidity: Math.round(avgLiqRelSize * 10000) / 100, weight: weights.liquidity_size },
      domain_edge: { score: Math.round(domainEdgeScore), top_domain: topDomain, domains_analyzed: tagEntries.length, weight: weights.domain_edge },
      concentration: { score: Math.round(concentrationScore), unique_markets: uniqueMarkets, weight: weights.concentration },
      volume: { score: Math.round(volumeScore), total_usd: Math.round(totalVolume * 100) / 100, weight: weights.volume },
      expiry_discount: { factor: expiryDiscount, expiry_proximity_hours: expiryProximityHours, consensus_pct: consensusPct },
    },
    riskLevel: score >= 75 ? 'CRITICAL' : score >= 50 ? 'HIGH' : score >= 25 ? 'MEDIUM' : 'LOW',
  };
}

// ============================================
// SMART WALLET WATCHLIST
// ============================================

/**
 * Build a watchlist of "smart money" wallets from resolved markets.
 * Criteria: win rate >60% across 5+ resolved markets.
 * Returns top 500 wallets sorted by win rate * sqrt(markets).
 */
async function buildSmartWatchlist() {
  return cached('smart_watchlist', WATCHLIST_CACHE_TTL, async () => {
    const resolvedMarkets = await getResolvedMarkets(100);
    
    // Build winning outcomes per market
    const winningOutcomes = {};
    for (const m of resolvedMarkets) {
      if (!m.conditionId || !m.outcomePrices) continue;
      try {
        const prices = JSON.parse(m.outcomePrices);
        const outcomes = JSON.parse(m.outcomes || '[]');
        const winIdx = prices.findIndex(p => parseFloat(p) === 1);
        if (winIdx !== -1) winningOutcomes[m.conditionId] = outcomes[winIdx];
      } catch {}
    }

    // Collect trades from resolved markets and compute per-wallet stats
    const walletStats = {}; // address → { wins, losses, markets: Set, totalVolume }
    const batchSize = Math.min(resolvedMarkets.length, 30);
    
    for (let i = 0; i < batchSize; i++) {
      const market = resolvedMarkets[i];
      const winOutcome = winningOutcomes[market.conditionId];
      if (!winOutcome) continue;
      
      try {
        const trades = await getMarketTrades(market.conditionId, 500);
        for (const t of trades) {
          if (t.side !== 'BUY') continue;
          const w = (t.proxyWallet || '').toLowerCase();
          if (!w) continue;
          
          if (!walletStats[w]) walletStats[w] = { wins: 0, losses: 0, markets: new Set(), totalVolume: 0 };
          const s = walletStats[w];
          s.markets.add(market.conditionId);
          const vol = (t.size || 0) * (t.price || 0);
          s.totalVolume += vol;
          
          if (t.outcome === winOutcome) s.wins++;
          else s.losses++;
        }
      } catch {}
    }

    // Filter: win rate >60%, 5+ resolved markets
    const qualified = [];
    for (const [address, s] of Object.entries(walletStats)) {
      const total = s.wins + s.losses;
      if (total < 5) continue;
      const winRate = s.wins / total;
      if (winRate <= 0.6) continue;
      qualified.push({
        address,
        win_rate: Math.round(winRate * 1000) / 1000,
        wins: s.wins,
        losses: s.losses,
        total_bets: total,
        markets_traded: s.markets.size,
        total_volume_usd: Math.round(s.totalVolume * 100) / 100,
        // Score for ranking: win rate weighted by sample size
        _rank_score: winRate * Math.sqrt(total),
      });
    }

    qualified.sort((a, b) => b._rank_score - a._rank_score);
    const top500 = qualified.slice(0, 500);
    // Clean up internal field
    for (const w of top500) delete w._rank_score;
    
    return {
      wallets: top500,
      built_at: new Date().toISOString(),
      markets_analyzed: batchSize,
      total_wallets_scanned: Object.keys(walletStats).length,
    };
  });
}

// ============================================
// CLUSTER DETECTION ENGINE
// ============================================

/**
 * Detect temporal clusters: N+ smart wallets entering the same side
 * of the same market within a configurable time window.
 */
async function detectClusters(options = {}) {
  const {
    minWallets = 3,
    minConviction = 0,
    windowHours = 2,
    lookbackHours = 24,
  } = options;

  const cacheKey = `clusters_${minWallets}_${minConviction}_${windowHours}_${lookbackHours}`;
  
  return cached(cacheKey, CLUSTER_CACHE_TTL, async () => {
    const watchlistData = await buildSmartWatchlist();
    const smartAddresses = new Set(watchlistData.wallets.map(w => w.address));
    const smartLookup = {};
    for (const w of watchlistData.wallets) smartLookup[w.address] = w;

    const activeMarkets = await getActiveMarkets(30);
    const windowMs = windowHours * 3600 * 1000;
    const cutoff = Date.now() - lookbackHours * 3600 * 1000;
    const clusters = [];

    for (const market of activeMarkets) {
      try {
        const trades = await getMarketTrades(market.conditionId, 500);
        if (!trades || trades.length < 3) continue;

        // Parse current prices
        let currentPrices = {};
        try {
          const outcomes = JSON.parse(market.outcomes || '[]');
          const prices = JSON.parse(market.outcomePrices || '[]');
          outcomes.forEach((o, i) => { currentPrices[o] = parseFloat(prices[i]); });
        } catch {}

        // Filter to smart wallet BUY trades within lookback
        const smartTrades = trades.filter(t => {
          if (t.side !== 'BUY') return false;
          const w = (t.proxyWallet || '').toLowerCase();
          if (!smartAddresses.has(w)) return false;
          const ts = t.timestamp ? (typeof t.timestamp === 'number' ? t.timestamp * 1000 : new Date(t.timestamp).getTime()) : 0;
          return ts >= cutoff;
        }).map(t => ({
          address: (t.proxyWallet || '').toLowerCase(),
          outcome: t.outcome || 'unknown',
          volume_usd: (t.size || 0) * (t.price || 0),
          timestamp: t.timestamp ? (typeof t.timestamp === 'number' ? t.timestamp * 1000 : new Date(t.timestamp).getTime()) : 0,
          price: t.price || 0,
        }));

        if (smartTrades.length < minWallets) continue;

        // Group by outcome side
        const bySide = {};
        for (const t of smartTrades) {
          if (!bySide[t.outcome]) bySide[t.outcome] = [];
          bySide[t.outcome].push(t);
        }

        // For each side, find temporal clusters using sliding window
        for (const [outcome, sideTrades] of Object.entries(bySide)) {
          // Dedupe by wallet (keep latest trade per wallet)
          const byWallet = {};
          for (const t of sideTrades) {
            if (!byWallet[t.address] || t.timestamp > byWallet[t.address].timestamp) {
              byWallet[t.address] = t;
            }
          }
          const uniqueTrades = Object.values(byWallet);
          if (uniqueTrades.length < minWallets) continue;

          uniqueTrades.sort((a, b) => a.timestamp - b.timestamp);

          // Sliding window to find best cluster
          let bestCluster = null;
          let bestScore = 0;

          for (let i = 0; i < uniqueTrades.length; i++) {
            const windowEnd = uniqueTrades[i].timestamp + windowMs;
            const inWindow = uniqueTrades.filter(t => t.timestamp >= uniqueTrades[i].timestamp && t.timestamp <= windowEnd);
            if (inWindow.length < minWallets) continue;

            const walletCount = inWindow.length;
            const totalVolume = inWindow.reduce((s, t) => s + t.volume_usd, 0);
            const avgWinRate = inWindow.reduce((s, t) => s + (smartLookup[t.address]?.win_rate || 0.6), 0) / walletCount;
            const firstTs = inWindow[0].timestamp;
            const lastTs = inWindow[inWindow.length - 1].timestamp;
            const spreadMin = (lastTs - firstTs) / 60000;

            // Timing tightness: 0-1, higher = tighter
            const tightness = windowMs > 0 ? 1 - (spreadMin / (windowHours * 60)) : 1;

            // --- Conviction score v2: signal quality over volume ---

            // 1. Contrarian positioning: wallets betting AGAINST consensus get 3x weight
            const currentPrice = currentPrices[outcome] || 0.5;
            const isContrarian = currentPrice < 0.4; // betting on outcome with <40% odds = contrarian
            const contrarianMultiplier = isContrarian ? 3.0 : 1.0;

            // 2. Odds movement correlation: if odds moved >2% toward entry direction recently
            const vol24 = parseFloat(market.volume24hr || market.volume24h || 0);
            const liq = parseFloat(market.liquidityNum || 0);
            const oddsMoving = liq > 0 && (vol24 / liq) > 0.02;
            const oddsMovementMultiplier = oddsMoving ? 2.0 : 1.0;

            // 3. Timing: entries clustered before known event dates get 2x
            const endDate = market.endDate ? new Date(market.endDate).getTime() : null;
            const avgEntryTime = inWindow.reduce((s, t) => s + t.timestamp, 0) / walletCount;
            const hoursBeforeEvent = endDate ? (endDate - avgEntryTime) / 3600000 : null;
            // Sweet spot: 12-72 hours before resolution = likely pre-event positioning
            const timingMultiplier = (hoursBeforeEvent !== null && hoursBeforeEvent >= 12 && hoursBeforeEvent <= 72) ? 2.0 : 1.0;

            // 4. Raw wallet count: capped contribution at +2 conviction regardless of count
            const walletCountScore = Math.min(2, walletCount - minWallets + 1) * 5; // max 10 pts

            // Base signal quality score
            const signalQuality =
              walletCountScore +                                           // max 10 (capped)
              Math.min(20, (avgWinRate - 0.5) * 80) +                    // win rate: max 20
              tightness * 20 +                                             // tightness: max 20
              (isContrarian ? 25 : 0) +                                   // contrarian bonus: 25
              (oddsMoving ? 15 : 0) +                                     // odds movement: 15
              (timingMultiplier > 1 ? 10 : 0);                            // pre-event timing: 10

            const conviction = Math.round(Math.min(100, signalQuality * contrarianMultiplier * Math.min(oddsMovementMultiplier, 1.5)));

            if (conviction > bestScore) {
              bestScore = conviction;
              bestCluster = { inWindow, walletCount, totalVolume, avgWinRate, firstTs, lastTs, spreadMin, tightness, conviction };
            }
          }

          if (!bestCluster || bestCluster.conviction < minConviction) continue;

          // Expiry proximity discount: near-certain markets about to expire aren't insider signals
          const currentPrice = currentPrices[outcome] || 0.5;
          const maxPrice = Math.max(...Object.values(currentPrices).map(Number).filter(Boolean), 0.5);
          if (market.endDate) {
            const msToExpiry = new Date(market.endDate).getTime() - Date.now();
            const hrsToExpiry = msToExpiry / 3600000;
            if (hrsToExpiry > 0 && hrsToExpiry <= 24 && maxPrice >= 0.99) {
              bestCluster.conviction = Math.round(bestCluster.conviction * 0.5);
            } else if (hrsToExpiry > 0 && hrsToExpiry <= 48 && maxPrice >= 0.95) {
              bestCluster.conviction = Math.round(bestCluster.conviction * 0.7);
            }
          }

          if (bestCluster.conviction < minConviction) continue;
          const smartImplied = Math.min(0.95, bestCluster.avgWinRate); // smart money implied probability

          clusters.push({
            market: {
              question: market.question,
              conditionId: market.conditionId,
              slug: market.slug,
              currentPrices,
            },
            signal: {
              direction: outcome,
              conviction: bestCluster.conviction,
              strength: bestCluster.conviction >= 80 ? 'STRONG' : bestCluster.conviction >= 60 ? 'MODERATE' : 'EMERGING',
              wallet_count: bestCluster.walletCount,
              total_volume_usd: Math.round(bestCluster.totalVolume * 100) / 100,
              avg_win_rate: Math.round(bestCluster.avgWinRate * 1000) / 1000,
              first_trade: new Date(bestCluster.firstTs).toISOString(),
              last_trade: new Date(bestCluster.lastTs).toISOString(),
              window_minutes: Math.round(bestCluster.spreadMin),
            },
            wallets: bestCluster.inWindow.map(t => ({
              address: t.address,
              volume_usd: Math.round(t.volume_usd * 100) / 100,
              win_rate: smartLookup[t.address]?.win_rate || 0,
              trade_time: new Date(t.timestamp).toISOString(),
            })),
            edge: {
              current_price: currentPrice,
              smart_money_implied: Math.round(smartImplied * 100) / 100,
              edge_pct: Math.round((smartImplied - currentPrice) * 100),
            },
          });
        }
      } catch {}
    }

    clusters.sort((a, b) => b.signal.conviction - a.signal.conviction);

    return {
      clusters,
      meta: {
        watchlist_size: watchlistData.wallets.length,
        markets_scanned: activeMarkets.length,
        timestamp: new Date().toISOString(),
        engine: 'Prescience v2.1 — Cluster Detection',
        parameters: { min_wallets: minWallets, min_conviction: minConviction, window_hours: windowHours, lookback_hours: lookbackHours },
      },
    };
  });
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
        engine: 'Prescience v2.1',
      });
    } catch (err) {
      console.error('Leaderboard error:', err);
      res.status(500).json({ error: 'Failed to generate leaderboard', detail: err.message });
    }
  });

  // --- GET /prescience/watchlist ---
  app.get('/prescience/watchlist', async (req, res) => {
    try {
      const watchlistData = await buildSmartWatchlist();
      const limit = Math.min(parseInt(req.query.limit) || 500, 500);
      res.json({
        watchlist: watchlistData.wallets.slice(0, limit),
        meta: {
          total: watchlistData.wallets.length,
          built_at: watchlistData.built_at,
          markets_analyzed: watchlistData.markets_analyzed,
          total_wallets_scanned: watchlistData.total_wallets_scanned,
          criteria: 'Win rate >60% across 5+ resolved markets',
          cache_ttl_hours: 6,
          engine: 'Prescience v2.1 — Smart Watchlist',
        },
      });
    } catch (err) {
      console.error('Watchlist error:', err);
      res.status(500).json({ error: 'Failed to build watchlist', detail: err.message });
    }
  });

  // --- GET /prescience/clusters ---
  app.get('/prescience/clusters', async (req, res) => {
    try {
      const minWallets = parseInt(req.query.min_wallets) || 3;
      const minConviction = parseInt(req.query.min_conviction) || 0;
      const hours = parseInt(req.query.hours) || 24;
      const windowHours = parseFloat(req.query.window_hours) || 2;

      const result = await detectClusters({
        minWallets,
        minConviction,
        windowHours,
        lookbackHours: hours,
      });

      res.json(result);
    } catch (err) {
      console.error('Clusters error:', err);
      res.status(500).json({ error: 'Failed to detect clusters', detail: err.message });
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
        engine: 'Prescience v2.1',
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
              slug: market.slug,
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
          slug: m.slug,
          volume24hr: m.volume24hr,
          volumeTotal: m.volumeNum,
        })),
        engine: 'Prescience v2.1',
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
        // Only use result if conditionId actually matches (Gamma does fuzzy matching)
        if (markets.length > 0 && markets[0].conditionId === marketId) marketInfo = markets[0];
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
          market: marketInfo ? { question: marketInfo.question, slug: marketInfo.slug, volume: marketInfo.volumeNum, conditionId: marketInfo.conditionId } : null,
          analysis: { total_trades: 0, unique_wallets: 0, total_volume_usd: 0, suspicious_wallets: 0, insider_risk: 'LOW' },
          message: 'No trades found for this market — it may have recently closed or have low activity',
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
        engine: 'Prescience v2.1',
      });
    } catch (err) {
      console.error('Market analysis error:', err);
      res.status(500).json({ error: 'Failed to analyze market', detail: err.message });
    }
  });

  // --- GET /prescience/scanner ---
  // Live scan of ACTIVE markets for suspicious whale activity
  // NOTE: Must be before /:address to avoid being caught by param route
  app.get('/prescience/scanner', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 15, 30);
      const minVolume = parseFloat(req.query.min_volume) || 0;
      const activeMarkets = await getActiveMarkets(limit);

      const results = [];

      for (const market of activeMarkets) {
        if (minVolume && (market.volumeNum || 0) < minVolume) continue;
        try {
          const trades = await getMarketTrades(market.conditionId, 300);
          if (!trades || trades.length < 5) continue;

          const wallets = {};
          let buyVolume = 0, sellVolume = 0;
          let recentBuyVolume = 0, recentSellVolume = 0;
          const now = Date.now() / 1000;
          const oneDayAgo = now - 86400;

          for (const t of trades) {
            const w = t.proxyWallet?.toLowerCase();
            if (!w) continue;
            if (!wallets[w]) wallets[w] = { buys: 0, sells: 0, volume: 0, trades: 0, firstSeen: t.timestamp, lastSeen: t.timestamp, outcomes: {} };
            const entry = wallets[w];
            const size = (t.size || 0) * (t.price || 0);
            entry.volume += size;
            entry.trades++;
            if (t.timestamp < entry.firstSeen) entry.firstSeen = t.timestamp;
            if (t.timestamp > entry.lastSeen) entry.lastSeen = t.timestamp;

            if (t.side === 'BUY') {
              entry.buys += size;
              buyVolume += size;
              if (t.timestamp >= oneDayAgo) recentBuyVolume += size;
            } else {
              entry.sells += size;
              sellVolume += size;
              if (t.timestamp >= oneDayAgo) recentSellVolume += size;
            }

            const outcome = t.outcome || 'unknown';
            entry.outcomes[outcome] = (entry.outcomes[outcome] || 0) + size;
          }

          const walletList = Object.entries(wallets).map(([addr, data]) => ({ address: addr, ...data }));
          walletList.sort((a, b) => b.volume - a.volume);

          const whaleThreshold = walletList.length > 0 ? walletList[Math.max(0, Math.floor(walletList.length * 0.05))].volume : 0;
          const whales = walletList.filter(w => w.volume >= whaleThreshold && w.volume > 100);

          const whaleOutcomeVolume = {};
          for (const whale of whales) {
            for (const [outcome, vol] of Object.entries(whale.outcomes)) {
              whaleOutcomeVolume[outcome] = (whaleOutcomeVolume[outcome] || 0) + vol;
            }
          }
          const totalWhaleVol = Object.values(whaleOutcomeVolume).reduce((a, b) => a + b, 0);
          let dominantOutcome = null;
          let consensusStrength = 0;
          for (const [outcome, vol] of Object.entries(whaleOutcomeVolume)) {
            const pct = totalWhaleVol > 0 ? vol / totalWhaleVol : 0;
            if (pct > consensusStrength) {
              consensusStrength = pct;
              dominantOutcome = outcome;
            }
          }

          const freshWallets = walletList.filter(w => {
            const ageDays = (now - w.firstSeen) / 86400;
            return ageDays < 7 && w.volume > 50;
          });

          const totalFlow = recentBuyVolume + recentSellVolume;
          const flowImbalance = totalFlow > 0 ? (recentBuyVolume - recentSellVolume) / totalFlow : 0;
          const freshSurge = freshWallets.length / Math.max(1, walletList.length);

          // Conviction v2: detect if whale activity is just consensus-aligned (yield farming)
          let consensusDiscount = 1.0; // no discount by default
          let isContrarian = false;
          try {
            const outcomes = JSON.parse(market.outcomes || '[]');
            const prices = JSON.parse(market.outcomePrices || '[]');
            if (outcomes.length && prices.length && dominantOutcome) {
              const idx = outcomes.indexOf(dominantOutcome);
              const dominantPrice = idx >= 0 ? parseFloat(prices[idx]) : 0;
              const maxPrice = Math.max(...prices.map(p => parseFloat(p)));
              const marketConsensusPct = Math.round(maxPrice * 100);
              
              if (dominantPrice > 0.8) {
                // Whales betting on the side that's already >80% — this is yield farming, not insider signal
                consensusDiscount = 0.3;
              } else if (dominantPrice > 0.6) {
                consensusDiscount = 0.6;
              } else if (dominantPrice < 0.4) {
                // Whales betting AGAINST consensus — genuinely suspicious, boost
                isContrarian = true;
                consensusDiscount = 1.5;
              }

              // Near-expiry consensus discount: markets within 48hrs of resolution with >90% consensus
              const hoursToExpiry = market.endDate ? (new Date(market.endDate).getTime() - Date.now()) / 3600000 : Infinity;
              if (hoursToExpiry < 48 && marketConsensusPct > 90) {
                consensusDiscount *= 0.3; // near-certainty yield farm
              }
            }
          } catch {}

          const rawSuspicion = 
            (consensusStrength > 0.75 ? 30 : consensusStrength > 0.6 ? 15 : 0) +
            (freshSurge > 0.3 ? 25 : freshSurge > 0.15 ? 12 : 0) +
            (Math.abs(flowImbalance) > 0.6 ? 25 : Math.abs(flowImbalance) > 0.3 ? 12 : 0) +
            (whales.some(w => w.volume > 5000) ? 20 : whales.some(w => w.volume > 1000) ? 10 : 0);
          
          const marketSuspicion = Math.round(Math.min(100, rawSuspicion * consensusDiscount));

          let currentPrices = {};
          try {
            const outcomes = JSON.parse(market.outcomes || '[]');
            const prices = JSON.parse(market.outcomePrices || '[]');
            outcomes.forEach((o, i) => { currentPrices[o] = parseFloat(prices[i]); });
          } catch {}

          results.push({
            market: {
              question: market.question,
              conditionId: market.conditionId,
              slug: market.slug,
              volume24hr: market.volume24hr,
              volumeTotal: market.volumeNum,
              liquidity: market.liquidityNum,
              endDate: market.endDate,
              currentPrices,
            },
            suspicion: marketSuspicion,
            conviction_context: { raw_score: rawSuspicion, consensus_discount: Math.round(consensusDiscount * 100) / 100, is_contrarian: isContrarian },
            riskLevel: marketSuspicion >= 60 ? 'HIGH' : marketSuspicion >= 30 ? 'MEDIUM' : 'LOW',
            signals: {
              whale_consensus: {
                dominant_outcome: dominantOutcome,
                strength: Math.round(consensusStrength * 100) / 100,
                whale_count: whales.length,
              },
              fresh_wallet_surge: {
                count: freshWallets.length,
                pct_of_total: Math.round(freshSurge * 10000) / 100,
              },
              flow_imbalance: {
                direction: flowImbalance > 0.1 ? 'BUY' : flowImbalance < -0.1 ? 'SELL' : 'NEUTRAL',
                magnitude: Math.round(Math.abs(flowImbalance) * 100) / 100,
                recent_buy_usd: Math.round(recentBuyVolume * 100) / 100,
                recent_sell_usd: Math.round(recentSellVolume * 100) / 100,
              },
              total_wallets: walletList.length,
              total_trades: trades.length,
            },
            top_whales: whales.slice(0, 5).map(w => ({
              address: w.address,
              volume_usd: Math.round(w.volume * 100) / 100,
              trades: w.trades,
              bias: w.buys > w.sells ? 'BUY' : 'SELL',
              dominant_outcome: Object.entries(w.outcomes).sort((a, b) => b[1] - a[1])[0]?.[0],
            })),
          });
        } catch (err) {
          // skip market on error
        }
      }

      results.sort((a, b) => b.suspicion - a.suspicion);

      res.json({
        scanner: results,
        meta: {
          markets_scanned: results.length,
          timestamp: new Date().toISOString(),
          engine: 'Prescience Scanner v2.1',
          description: 'Live scan of active Polymarket markets for whale clustering, fresh wallet surges, and flow imbalances.',
        },
      });
    } catch (err) {
      console.error('Scanner error:', err);
      res.status(500).json({ error: 'Scanner failed', detail: err.message });
    }
  });

  // --- GET /prescience/news ---
  // Auto-generated news feed from market movements + insider signals
  // NOTE: Must be before /:address to avoid being caught by param route
  app.get('/prescience/news', async (req, res) => {
    try {
      const result = await cached('prescience_news', CACHE_TTL, async () => {
        const activeMarkets = await getActiveMarkets(20);
        const newsItems = [];

        for (const market of activeMarkets) {
          try {
            const trades = await getMarketTrades(market.conditionId, 300);
            if (!trades || trades.length < 5) continue;

            const now = Date.now() / 1000;
            const oneDayAgo = now - 86400;

            let currentOdds = {};
            try {
              const outcomes = JSON.parse(market.outcomes || '[]');
              const prices = JSON.parse(market.outcomePrices || '[]');
              outcomes.forEach((o, i) => { currentOdds[o] = parseFloat(prices[i]); });
            } catch {}

            let recentVolume = 0, buyVol = 0, sellVol = 0;
            const wallets = {};
            let freshWalletCount = 0, largePositionCount = 0;

            for (const t of trades) {
              const size = (t.size || 0) * (t.price || 0);
              const w = (t.proxyWallet || '').toLowerCase();
              if (!w) continue;
              if (!wallets[w]) wallets[w] = { firstSeen: t.timestamp, totalVol: 0, trades: 0 };
              wallets[w].totalVol += size;
              wallets[w].trades++;
              if (t.timestamp < wallets[w].firstSeen) wallets[w].firstSeen = t.timestamp;
              if (t.timestamp >= oneDayAgo) {
                recentVolume += size;
                if (t.side === 'BUY') buyVol += size; else sellVol += size;
              }
            }

            for (const [, data] of Object.entries(wallets)) {
              const ageDays = (now - data.firstSeen) / 86400;
              if (ageDays < 7 && data.totalVol > 50) freshWalletCount++;
              if (data.totalVol > 1000) largePositionCount++;
            }

            const totalFlow = buyVol + sellVol;
            const flowImbalance = totalFlow > 0 ? (buyVol - sellVol) / totalFlow : 0;
            const vol24h = parseFloat(market.volume24hr) || recentVolume;

            let severity = 'low', signal = '';
            if (freshWalletCount >= 3 && largePositionCount >= 2) {
              severity = 'critical';
              signal = `${freshWalletCount} fresh wallets + ${largePositionCount} large positions detected`;
            } else if (freshWalletCount >= 2 || (largePositionCount >= 3 && Math.abs(flowImbalance) > 0.4)) {
              severity = 'high';
              signal = freshWalletCount >= 2 ? `${freshWalletCount} fresh wallets entered positions` : `${largePositionCount} large positions, ${Math.round(Math.abs(flowImbalance) * 100)}% flow imbalance`;
            } else if (vol24h > 500000 || Math.abs(flowImbalance) > 0.3) {
              severity = 'medium';
              signal = vol24h > 500000 ? `$${(vol24h / 1e6).toFixed(1)}M 24h volume` : `${Math.round(Math.abs(flowImbalance) * 100)}% ${flowImbalance > 0 ? 'buy' : 'sell'} flow imbalance`;
            } else {
              signal = `${Object.keys(wallets).length} active wallets`;
            }

            const dominantOutcome = Object.entries(currentOdds).sort((a, b) => b[1] - a[1])[0];
            const pctStr = dominantOutcome ? `${Math.round(dominantOutcome[1] * 100)}%` : '';
            const volStr = vol24h >= 1e6 ? `$${(vol24h / 1e6).toFixed(1)}M` : `$${Math.round(vol24h / 1000)}K`;
            const dirStr = flowImbalance > 0.2 ? 'surges' : flowImbalance < -0.2 ? 'drops' : 'holds';
            const headline = dominantOutcome ? `"${dominantOutcome[0]}" ${dirStr} to ${pctStr} — ${volStr} new volume` : `${volStr} volume surge on active market`;

            newsItems.push({ headline, market: market.question, slug: market.slug || '', volume24h: Math.round(vol24h), currentOdds, signal, severity, timestamp: new Date().toISOString(), flowDirection: flowImbalance > 0.1 ? 'BUY' : flowImbalance < -0.1 ? 'SELL' : 'NEUTRAL', freshWallets: freshWalletCount, largePositions: largePositionCount });
          } catch {}
        }

        const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        newsItems.sort((a, b) => (sevOrder[a.severity] - sevOrder[b.severity]) || (b.volume24h - a.volume24h));
        return { news: newsItems, generated: new Date().toISOString(), engine: 'Prescience News v1.0' };
      });
      res.json(result);
    } catch (err) {
      console.error('News error:', err);
      res.status(500).json({ error: 'Failed to generate news feed', detail: err.message });
    }
  });

  // --- GET /prescience/scan ---
  // Market scan: list of active markets with fresh wallet counts, volumes, threat levels
  // NOTE: Must be before /:address to avoid being caught by param route
  app.get('/prescience/scan', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 20, 30);
      const activeMarkets = await getActiveMarkets(limit);

      const markets = [];
      for (const market of activeMarkets) {
        try {
          const trades = await getMarketTrades(market.conditionId, 300);
          if (!trades || trades.length < 3) continue;

          const now = Date.now() / 1000;
          const wallets = {};
          let freshWalletCount = 0;
          let buyVolume = 0, sellVolume = 0;

          for (const t of trades) {
            const w = (t.proxyWallet || '').toLowerCase();
            if (!w) continue;
            const size = (t.size || 0) * (t.price || 0);
            if (!wallets[w]) wallets[w] = { firstSeen: t.timestamp, volume: 0, trades: 0 };
            wallets[w].volume += size;
            wallets[w].trades++;
            if (t.timestamp < wallets[w].firstSeen) wallets[w].firstSeen = t.timestamp;
            if (t.side === 'BUY') buyVolume += size; else sellVolume += size;
          }

          for (const [, data] of Object.entries(wallets)) {
            const ageDays = (now - data.firstSeen) / 86400;
            if (ageDays < 7 && data.volume > 50) freshWalletCount++;
          }

          const totalVolume = buyVolume + sellVolume;
          const flowImbalance = totalVolume > 0 ? (buyVolume - sellVolume) / totalVolume : 0;

          let currentPrices = {};
          try {
            const outcomes = JSON.parse(market.outcomes || '[]');
            const prices = JSON.parse(market.outcomePrices || '[]');
            outcomes.forEach((o, i) => { currentPrices[o] = parseFloat(prices[i]); });
          } catch {}

          const absImbalance = Math.abs(flowImbalance);
          const totalWallets = Object.keys(wallets).length;
          const freshWalletRatio = totalWallets > 0 ? freshWalletCount / totalWallets : 0;
          const isSampleCapped = trades.length >= 295; // near the 300 limit = likely capped

          // Baseline normalization: on capped samples, ~60% fresh wallets is normal
          // Only flag if ratio significantly exceeds baseline AND other signals confirm
          const BASELINE_FRESH_RATIO = isSampleCapped ? 0.60 : 0.30;
          const excessFreshRatio = Math.max(0, freshWalletRatio - BASELINE_FRESH_RATIO);

          // Conviction v3: weighted multi-signal formula
          // conviction = normalize(flow_imbalance * 4 + large_position_ratio * 3 + fresh_wallet_excess * 2 + volume_vs_liquidity_ratio * 1)
          const liq = parseFloat(market.liquidityNum) || 1;
          const largePositionThreshold = 1000; // $1000+ = large position
          const largePositions = Object.values(wallets).filter(w => w.volume >= largePositionThreshold).length;
          const largePositionRatio = totalWallets > 0 ? largePositions / totalWallets : 0;
          const vol24 = parseFloat(market.volume24hr) || totalVolume;
          const volumeVsLiquidityRatio = liq > 0 ? Math.min(vol24 / liq, 5) / 5 : 0; // normalize to 0-1, cap at 5x

          // Each component normalized to 0-1
          const normFlowImbalance = absImbalance; // already 0-1
          const normLargePositionRatio = Math.min(largePositionRatio, 1); // 0-1
          const normFreshExcess = Math.min(excessFreshRatio / 0.4, 1); // 0-1, 40%+ excess = max
          // Cap volume_vs_liquidity at 0.5x weight when flow_imbalance is low (<0.3)
          // Prevents high-volume but directionless markets from inflating threat scores
          const volLiqWeightMultiplier = absImbalance < 0.3 ? 0.5 : 1.0;
          const normVolLiq = volumeVsLiquidityRatio * volLiqWeightMultiplier; // already 0-1, dampened when no directional signal

          // Weighted sum (max raw = 4+3+2+1 = 10), normalize to 0-100
          const rawConviction = normFlowImbalance * 4 + normLargePositionRatio * 3 + normFreshExcess * 2 + normVolLiq * 1;
          let threatScore = Math.round((rawConviction / 10) * 100);

          // Near-expiry consensus discount: markets about to resolve at >95% aren't suspicious
          let nearExpiryConsensus = false;
          try {
            const prices = JSON.parse(market.outcomePrices || '[]');
            const maxPrice = Math.max(...prices.map(p => parseFloat(p) || 0));
            const hoursToExpiry = market.endDate ? (new Date(market.endDate).getTime() - Date.now()) / 3600000 : Infinity;
            if (hoursToExpiry < 48 && maxPrice >= 0.95) {
              nearExpiryConsensus = true;
              threatScore = Math.round(threatScore * 0.3);
            }
          } catch {}

          const threatLevel = threatScore >= 70 ? 'CRITICAL'
            : threatScore >= 45 ? 'HIGH'
            : threatScore >= 25 ? 'MODERATE'
            : 'LOW';

          markets.push({
            question: market.question,
            conditionId: market.conditionId,
            slug: market.slug,
            volume24hr: market.volume24hr,
            volumeTotal: market.volumeNum,
            liquidity: market.liquidityNum,
            endDate: market.endDate,
            currentPrices,
            fresh_wallets: freshWalletCount,
            fresh_wallet_ratio: Math.round(freshWalletRatio * 100) / 100,
            fresh_wallet_excess: Math.round(excessFreshRatio * 100) / 100,
            sample_capped: isSampleCapped,
            total_wallets: totalWallets,
            total_trades: trades.length,
            total_volume_usd: Math.round(totalVolume * 100) / 100,
            flow_direction: flowImbalance > 0.1 ? 'BUY' : flowImbalance < -0.1 ? 'SELL' : 'NEUTRAL',
            flow_imbalance: Math.round(Math.abs(flowImbalance) * 100) / 100,
            large_positions: largePositions,
            large_position_ratio: Math.round(largePositionRatio * 100) / 100,
            volume_vs_liquidity: Math.round(volumeVsLiquidityRatio * 100) / 100,
            threat_score: threatScore,
            threat_level: threatLevel,
            conviction_weights: { flow_imbalance: 4, large_position_ratio: 3, fresh_wallet_excess: 2, volume_vs_liquidity: 1 },
            near_expiry_consensus: nearExpiryConsensus,
          });
        } catch {}
      }

      markets.sort((a, b) => b.fresh_wallets - a.fresh_wallets);

      res.json({
        scan: markets,
        meta: {
          markets_scanned: markets.length,
          timestamp: new Date().toISOString(),
          engine: 'Prescience Scan v2.1',
          description: 'Market-level scan of active Polymarket markets with fresh wallet counts, volumes, and threat levels.',
        },
      });
    } catch (err) {
      console.error('Scan error:', err);
      res.status(500).json({ error: 'Market scan failed', detail: err.message });
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
        version: '2.1',
        meta: {
          engine: 'Prescience v2.1',
          methodology: 'v2: duration-normalized timing(25%) + win_rate(20%) + liquidity_size(20%) + wallet_age(10%) + domain_edge(10%) + concentration(8%) + volume(7%). Archetype classification caps scalper scores at 25.',
          tagline: 'See who sees first.',
        },
      });
    } catch (err) {
      console.error('Prescience score error:', err);
      res.status(500).json({ error: 'Failed to compute Prescience score', detail: err.message });
    }
  });

  // --- GET /prescience/signals ---
  // Actionable copy-trade signals: "Follow the smart money"
  // Identifies high-conviction whale positioning on active markets
  // and generates trade signals with confidence scores
  app.get('/prescience/signals', async (req, res) => {
    try {
      const minConfidence = parseInt(req.query.min_confidence) || 60;
      const limit = Math.min(parseInt(req.query.limit) || 10, 25);
      const activeMarkets = await getActiveMarkets(20);
      const resolvedMarkets = await getResolvedMarkets(30);

      // PRE-BUILD: wallet win/loss records from resolved markets (do this ONCE)
      const walletRecords = {}; // address → { wins, total }
      const resolvedSlice = resolvedMarkets.slice(0, 8); // limit API calls
      for (const rm of resolvedSlice) {
        try {
          const rmTrades = await getMarketTrades(rm.conditionId, 300);
          const prices = JSON.parse(rm.outcomePrices || '[]');
          const outcomes = JSON.parse(rm.outcomes || '[]');
          const winningIdx = prices.findIndex(p => parseFloat(p) === 1);
          if (winningIdx === -1) continue;
          const winningOutcome = outcomes[winningIdx];
          
          for (const t of rmTrades) {
            if (t.side !== 'BUY') continue;
            const w = t.proxyWallet?.toLowerCase();
            if (!w) continue;
            if (!walletRecords[w]) walletRecords[w] = { wins: 0, total: 0 };
            walletRecords[w].total++;
            if (t.outcome === winningOutcome) walletRecords[w].wins++;
          }
        } catch {}
      }

      const signals = [];

      for (const market of activeMarkets.slice(0, 15)) {
        try {
          const trades = await getMarketTrades(market.conditionId, 500);
          if (!trades || trades.length < 10) continue;

          const now = Date.now() / 1000;
          const oneDayAgo = now - 86400;
          const threeDaysAgo = now - 86400 * 3;

          // Parse current prices
          let currentPrices = {};
          try {
            const outcomes = JSON.parse(market.outcomes || '[]');
            const prices = JSON.parse(market.outcomePrices || '[]');
            outcomes.forEach((o, i) => { currentPrices[o] = parseFloat(prices[i]); });
          } catch {}

          // Analyze wallet behavior on THIS market
          const wallets = {};
          for (const t of trades) {
            const w = t.proxyWallet?.toLowerCase();
            if (!w) continue;
            if (!wallets[w]) wallets[w] = { buys: {}, sells: {}, totalVol: 0, trades: 0, timestamps: [] };
            const entry = wallets[w];
            const size = (t.size || 0) * (t.price || 0);
            entry.totalVol += size;
            entry.trades++;
            entry.timestamps.push(t.timestamp);
            const outcome = t.outcome || 'unknown';
            if (t.side === 'BUY') {
              entry.buys[outcome] = (entry.buys[outcome] || 0) + size;
            } else {
              entry.sells[outcome] = (entry.sells[outcome] || 0) + size;
            }
          }

          // Identify "smart money" using pre-built records
          const smartWallets = [];
          for (const [addr, data] of Object.entries(wallets)) {
            if (data.totalVol < 100) continue;
            const record = walletRecords[addr] || { wins: 0, total: 0 };
            const winRate = record.total > 0 ? record.wins / record.total : 0.5;
            const isRecent = data.timestamps.some(t => t >= threeDaysAgo);
            
            if (isRecent && (data.totalVol >= 500 || (record.total >= 3 && winRate >= 0.6))) {
              smartWallets.push({
                address: addr,
                ...data,
                winRate,
                historicalTotal: record.total,
                historicalWins: record.wins,
              });
            }
          }

          if (smartWallets.length === 0) continue;

          // Determine smart money consensus on this market
          const outcomeFlow = {};
          let totalSmartVol = 0;
          let recentSmartVol = 0;

          for (const sw of smartWallets) {
            for (const [outcome, vol] of Object.entries(sw.buys)) {
              outcomeFlow[outcome] = (outcomeFlow[outcome] || 0) + vol;
              totalSmartVol += vol;
              // Check if recent
              if (sw.timestamps.some(t => t >= oneDayAgo)) {
                recentSmartVol += vol;
              }
            }
          }

          if (totalSmartVol < 100) continue;

          // Find dominant outcome
          let dominantOutcome = null;
          let dominantVol = 0;
          for (const [outcome, vol] of Object.entries(outcomeFlow)) {
            if (vol > dominantVol) {
              dominantVol = vol;
              dominantOutcome = outcome;
            }
          }

          const consensusStrength = totalSmartVol > 0 ? dominantVol / totalSmartVol : 0;
          const currentPrice = currentPrices[dominantOutcome] || 0.5;

          // Signal confidence: weighted by consensus strength, smart wallet count, and edge vs current price
          const edge = Math.max(0, consensusStrength - currentPrice); // how much smart money disagrees with market
          const walletCount = smartWallets.length;
          const avgWinRate = smartWallets.reduce((s, w) => s + w.winRate, 0) / walletCount;

          const confidence = Math.round(Math.min(100,
            consensusStrength * 35 +          // how aligned smart money is (max 35)
            Math.min(25, walletCount * 5) +   // number of smart wallets (max 25)
            edge * 40 +                        // edge vs market price (max 40)
            (avgWinRate > 0.6 ? 10 : 0)       // bonus for proven winners
          ));

          if (confidence < minConfidence) continue;

          // Calculate suggested entry and target
          const suggestedEntry = currentPrice;
          const impliedProb = consensusStrength;
          const expectedValue = impliedProb / currentPrice; // EV ratio

          signals.push({
            market: {
              question: market.question,
              conditionId: market.conditionId,
              slug: market.slug,
              endDate: market.endDate,
              volume24hr: market.volume24hr,
              volumeTotal: market.volumeNum,
              liquidity: market.liquidityNum,
            },
            signal: {
              direction: dominantOutcome,
              confidence,
              strength: confidence >= 85 ? 'STRONG' : confidence >= 70 ? 'MODERATE' : 'SPECULATIVE',
              current_price: currentPrice,
              smart_money_implied: Math.round(impliedProb * 100) / 100,
              edge_pct: Math.round(edge * 10000) / 100,
              expected_value: Math.round(expectedValue * 100) / 100,
            },
            smart_money: {
              wallet_count: walletCount,
              total_volume_usd: Math.round(totalSmartVol * 100) / 100,
              recent_volume_usd: Math.round(recentSmartVol * 100) / 100,
              avg_win_rate: Math.round(avgWinRate * 100) / 100,
              consensus_strength: Math.round(consensusStrength * 100) / 100,
            },
            risk: {
              liquidity_ok: (market.liquidityNum || 0) > 10000,
              time_to_resolution: market.endDate || 'unknown',
              max_loss: `$${(suggestedEntry * 100).toFixed(0)} per $100 position`,
              max_gain: `$${((1 - suggestedEntry) * 100).toFixed(0)} per $100 position`,
            },
          });
        } catch {}
      }

      // Incorporate cluster data: boost signals that have active clusters
      try {
        const clusterData = await detectClusters({ minWallets: 3, minConviction: 30, windowHours: 2, lookbackHours: 24 });
        for (const signal of signals) {
          const matchingCluster = clusterData.clusters.find(
            c => c.market.conditionId === signal.market.conditionId && c.signal.direction === signal.signal.direction
          );
          if (matchingCluster) {
            const clusterBoost = Math.round(matchingCluster.signal.conviction * 0.15); // up to +15 points
            signal.signal.confidence = Math.min(100, signal.signal.confidence + clusterBoost);
            signal.signal.strength = signal.signal.confidence >= 85 ? 'STRONG' : signal.signal.confidence >= 70 ? 'MODERATE' : 'SPECULATIVE';
            signal.cluster = {
              active: true,
              conviction: matchingCluster.signal.conviction,
              wallet_count: matchingCluster.signal.wallet_count,
              boost_applied: clusterBoost,
            };
          }
        }
      } catch {}

      signals.sort((a, b) => b.signal.confidence - a.signal.confidence);

      res.json({
        signals: signals.slice(0, limit),
        meta: {
          total_signals: signals.length,
          min_confidence: minConfidence,
          timestamp: new Date().toISOString(),
          engine: 'Prescience Signals v2.1 — Cluster-Enhanced',
          description: 'Copy-trade signals derived from smart money positioning on active Polymarket markets.',
          methodology: 'Wallets are scored by historical win rate on resolved markets. High-volume, high-win-rate wallets form the "smart money" cohort. Their consensus positioning generates directional signals.',
          disclaimer: 'Not financial advice. Signals reflect on-chain behavior patterns, not guaranteed outcomes.',
        },
      });
    } catch (err) {
      console.error('Signals error:', err);
      res.status(500).json({ error: 'Failed to generate signals', detail: err.message });
    }
  });

  // --- GET /prescience/rings --- Coordination Ring Detector
  // Finds wallet clusters that trade the same side of markets within tight time windows.
  // Game theory: detects coordination games in on-chain data.
  app.get('/prescience/rings', async (req, res) => {
    try {
      const windowSec = parseInt(req.query.window) || 300; // 5 min default
      const minCoTrades = parseInt(req.query.min_co_trades) || 3;
      const limit = Math.min(parseInt(req.query.limit) || 10, 25);

      const resolvedMarkets = await getResolvedMarkets(20);
      const activeMarkets = await getActiveMarkets(15);
      const allMarkets = [...resolvedMarkets.slice(0, 10), ...activeMarkets.slice(0, 10)];

      // Collect trades per market, build co-occurrence matrix
      const pairScores = {}; // "addr1|addr2" → { coTrades, markets, sameSide, details }

      for (const market of allMarkets) {
        try {
          const trades = await getMarketTrades(market.conditionId, 500);
          if (!trades || trades.length < 5) continue;

          // Group by outcome side
          const sideBuckets = {}; // outcome → [{wallet, timestamp, size}]
          for (const t of trades) {
            if (t.side !== 'BUY') continue;
            const w = (t.proxyWallet || t.maker || '').toLowerCase();
            if (!w) continue;
            const ts = t.timestamp ? new Date(t.timestamp).getTime() / 1000 : (t.blockTimestamp || 0);
            const outcome = t.outcome || 'unknown';
            if (!sideBuckets[outcome]) sideBuckets[outcome] = [];
            sideBuckets[outcome].push({ wallet: w, ts, size: (t.size || 0) * (t.price || 0) });
          }

          // For each side, find wallets trading within windowSec of each other
          for (const [outcome, entries] of Object.entries(sideBuckets)) {
            entries.sort((a, b) => a.ts - b.ts);
            for (let i = 0; i < entries.length; i++) {
              for (let j = i + 1; j < entries.length; j++) {
                if (entries[j].ts - entries[i].ts > windowSec) break;
                const a = entries[i].wallet;
                const b = entries[j].wallet;
                if (a === b) continue;
                const key = a < b ? `${a}|${b}` : `${b}|${a}`;
                if (!pairScores[key]) pairScores[key] = { coTrades: 0, sameSide: 0, markets: new Set(), totalVol: 0 };
                pairScores[key].coTrades++;
                pairScores[key].sameSide++;
                pairScores[key].markets.add(market.conditionId);
                pairScores[key].totalVol += entries[i].size + entries[j].size;
              }
            }
          }
        } catch {}
      }

      // Filter and rank coordination pairs
      const rings = Object.entries(pairScores)
        .filter(([, v]) => v.coTrades >= minCoTrades && v.markets.size >= 2)
        .map(([key, v]) => {
          const [w1, w2] = key.split('|');
          const coordination_score = Math.min(100, Math.round(
            (v.sameSide / v.coTrades) * 40 +       // Same-side ratio (max 40)
            Math.min(v.markets.size, 5) * 8 +       // Cross-market spread (max 40)
            Math.min(v.coTrades, 10) * 2             // Frequency (max 20)
          ));
          return {
            wallets: [w1, w2],
            coordination_score,
            co_trades: v.coTrades,
            same_side_ratio: Math.round(v.sameSide / v.coTrades * 100),
            markets_shared: v.markets.size,
            combined_volume_usd: Math.round(v.totalVol * 100) / 100,
            risk_level: coordination_score >= 80 ? 'CRITICAL' : coordination_score >= 60 ? 'HIGH' : coordination_score >= 40 ? 'MODERATE' : 'LOW',
          };
        })
        .sort((a, b) => b.coordination_score - a.coordination_score)
        .slice(0, limit);

      // Build clusters (connected components of high-scoring pairs)
      const clusters = [];
      const visited = new Set();
      for (const ring of rings.filter(r => r.coordination_score >= 60)) {
        const [w1, w2] = ring.wallets;
        if (visited.has(w1) && visited.has(w2)) continue;
        // BFS to find cluster
        const cluster = new Set([w1, w2]);
        const queue = [w1, w2];
        while (queue.length > 0) {
          const current = queue.shift();
          visited.add(current);
          for (const r of rings) {
            if (r.wallets.includes(current)) {
              const other = r.wallets.find(w => w !== current);
              if (!cluster.has(other) && r.coordination_score >= 50) {
                cluster.add(other);
                queue.push(other);
              }
            }
          }
        }
        if (cluster.size >= 2) {
          clusters.push({
            size: cluster.size,
            wallets: [...cluster],
            max_coordination_score: Math.max(...rings.filter(r => r.wallets.some(w => cluster.has(w))).map(r => r.coordination_score)),
          });
        }
      }

      res.json({
        rings: rings,
        clusters: clusters.sort((a, b) => b.max_coordination_score - a.max_coordination_score).slice(0, 5),
        meta: {
          window_seconds: windowSec,
          min_co_trades: minCoTrades,
          markets_analyzed: allMarkets.length,
          total_pairs_found: Object.keys(pairScores).length,
          timestamp: new Date().toISOString(),
          engine: 'Prescience Rings v1.0',
          description: 'Coordination Ring Detector — finds wallet clusters trading the same side within tight time windows across multiple markets. Based on game-theoretic coordination game detection.',
          methodology: 'For each market, groups same-side trades within a configurable time window. Pairs appearing across multiple markets with consistent same-side timing are flagged as potential coordination rings.',
          game_theory: 'Coordination games require correlated strategies. Wallets repeatedly choosing the same action (outcome) within short windows across many markets cannot be explained by independent decision-making alone.',
        },
      });
    } catch (err) {
      console.error('Rings error:', err);
      res.status(500).json({ error: 'Failed to detect coordination rings', detail: err.message });
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
      version: '2.1',
      tagline: 'See who sees first.',
      description: 'Prediction market insider tracking engine v2. Eliminates false positives from short-duration market scalpers via archetype classification, duration-normalized timing, and liquidity-relative sizing.',
      by: 'Epistemic Observatory',
      endpoints: [
        'GET /prescience/:address — Prescience Score + breakdown + archetype for a wallet',
        'GET /prescience/leaderboard — Top suspicious wallets across recent markets',
        'GET /prescience/alerts — Recent high-score activity alerts',
        'GET /prescience/market/:marketId — Insider analysis for a specific market (conditionId or slug)',
        'GET /prescience/pulse — Overall market health + suspicious activity summary',
        'GET /prescience/scanner — Live scan of active markets for whale/insider activity',
        'GET /prescience/signals — Smart money copy-trade signals, now cluster-enhanced (?min_confidence=60&limit=10)',
        'GET /prescience/rings — Coordination ring detector (?window=300&min_co_trades=3&limit=10)',
        'GET /prescience/watchlist — Top 500 smart wallets by win rate (?limit=500). 6hr cache.',
        'GET /prescience/clusters — Temporal cluster detection: smart wallets converging on same position (?min_wallets=3&min_conviction=60&hours=24&window_hours=2)',
        'GET /prescience/news — Auto-generated news feed from market movements + insider signals. 5min cache.',
      ],
      scoring: {
        range: '0-100',
        signals: ['wallet_age', 'timing', 'win_rate', 'liquidity_size', 'domain_edge', 'concentration', 'volume'],
        weights: 'timing(25%) + win_rate(20%) + liquidity_size(20%) > wallet_age(10%) + domain_edge(10%) > concentration(8%) + volume(7%)',
        thesis: 'Late bet + correct outcome + long market + large liquidity share = insider signal. Short market scalpers auto-capped at 25.',
      },
      archetypes: {
        fresh_insider: 'Account <14 days old + large bets = highest conviction insider signal → score floor 75',
        scalper: 'Many markets, small positions, short-duration preference, ~50% win rate → score capped at 25',
        insider: 'Few markets, large positions relative to liquidity, high win rate, timing clusters on long markets',
        whale: 'High volume ($10K+), spread across markets, moderate win rate',
        retail: 'Small positions, no pattern → score capped at 40',
      },
      v2_improvements: [
        'Market duration normalization — betting late on a 15min market ≠ betting late on a 6-month market',
        'Archetype classification — scalpers no longer flagged as insiders',
        'Outcome-weighted timing — only correct-side late bets on long markets generate signal',
        'Topic/domain edge detection — consistent wins in one domain = real edge',
        'Liquidity-relative sizing — bet size scored relative to market liquidity, not absolute USD',
      ],
      data_source: 'Polymarket (Gamma API + Data API)',
    });
  });

  // --- POST /prescience/interest --- (email capture for early access)
  const interestList = [];
  app.post('/prescience/interest', (req, res) => {
    const { email, source, timestamp } = req.body || {};
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    interestList.push({ email, source: source || 'unknown', timestamp: timestamp || new Date().toISOString() });
    // Log to console so we can see signups in Vercel logs
    console.log(`[PRESCIENCE INTEREST] ${email} via ${source} at ${timestamp}`);
    res.json({ ok: true, message: 'You\'re on the list. We\'ll send your API key shortly.' });
  });

  // --- GET /prescience/interest/count --- (public counter)
  app.get('/prescience/interest/count', (req, res) => {
    res.json({ count: interestList.length });
  });
}
