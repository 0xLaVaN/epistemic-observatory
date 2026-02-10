/**
 * x402 Pay-Per-Query Middleware
 * Implements HTTP 402 Payment Required protocol for Prescience endpoints.
 * 
 * Lightweight implementation — no heavy deps. Uses the x402 header protocol:
 * - Server returns 402 with X-Payment-* headers describing payment requirements
 * - Client sends X-Payment header with payment proof
 * - Server verifies and serves content
 * 
 * Free tier: 10 requests/day per IP for basic lookups
 */

const PAY_TO_ADDRESS = '0x11F5397F191144894cD907A181ED61A7bf5634dE'; // deployer wallet
const NETWORK = 'polygon';
const ASSET = 'USDC';
const ASSET_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'; // USDC on Polygon

// Pricing tiers (USD)
const PRICING = {
  wallet_scan: 0.01,     // /prescience/:address
  deep_analysis: 0.05,   // /prescience/market/:marketId
  market_report: 0.10,   // /prescience/alerts, /prescience/leaderboard
};

// Free tier tracking: IP → { count, resetAt }
const freeTier = new Map();
const FREE_TIER_LIMIT = 10;
const FREE_TIER_WINDOW = 24 * 60 * 60 * 1000; // 24h

// Verified payments cache: paymentHash → { timestamp, amount }
const verifiedPayments = new Map();

function getFreeTierUsage(ip) {
  const entry = freeTier.get(ip);
  if (!entry || Date.now() > entry.resetAt) {
    const fresh = { count: 0, resetAt: Date.now() + FREE_TIER_WINDOW };
    freeTier.set(ip, fresh);
    return fresh;
  }
  return entry;
}

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
    || req.headers['x-real-ip'] 
    || req.socket?.remoteAddress 
    || 'unknown';
}

/**
 * Classify a prescience route into a pricing tier
 */
function classifyRoute(path) {
  if (path === '/prescience' || path === '/prescience/pulse') return null; // free
  if (path === '/prescience/alerts') return 'market_report';
  if (path === '/prescience/leaderboard') return 'market_report';
  if (path.startsWith('/prescience/market/')) return 'deep_analysis';
  if (path.match(/^\/prescience\/0x[a-fA-F0-9]+$/)) return 'wallet_scan';
  // Fallback: if it matches /prescience/:something, it's a wallet scan
  if (path.match(/^\/prescience\/[^/]+$/) && !['alerts', 'leaderboard', 'pulse'].includes(path.split('/')[2])) {
    return 'wallet_scan';
  }
  return null; // free
}

/**
 * Build 402 response with payment requirements
 */
function build402Response(tier, price) {
  return {
    status: 402,
    headers: {
      'X-Payment-Required': 'true',
      'X-Payment-Network': NETWORK,
      'X-Payment-Asset': ASSET,
      'X-Payment-Asset-Address': ASSET_ADDRESS,
      'X-Payment-Amount': String(price),
      'X-Payment-Recipient': PAY_TO_ADDRESS,
      'X-Payment-Protocol': 'x402',
      'X-Payment-Version': '1.0',
      'X-Payment-Description': `Prescience ${tier.replace('_', ' ')} — $${price}`,
    },
    body: {
      error: 'Payment Required',
      protocol: 'x402',
      version: '1.0',
      payment: {
        network: NETWORK,
        asset: ASSET,
        assetAddress: ASSET_ADDRESS,
        amount: price,
        amountRaw: String(Math.round(price * 1e6)), // USDC has 6 decimals
        recipient: PAY_TO_ADDRESS,
        description: `Prescience ${tier.replace('_', ' ')}`,
      },
      freeTier: {
        available: true,
        limit: `${FREE_TIER_LIMIT}/day`,
        note: 'Basic lookups are free up to the daily limit',
      },
      howToPay: {
        header: 'X-Payment',
        format: 'Send USDC on Polygon to the recipient address, include the tx hash in X-Payment header',
        example: 'X-Payment: 0x<transaction_hash>',
      },
    },
  };
}

/**
 * Verify a payment (basic tx hash verification)
 * In production, this would verify on-chain via RPC.
 * For now, we accept any valid-looking tx hash and log it.
 */
function verifyPayment(paymentHeader, requiredAmount) {
  if (!paymentHeader) return { valid: false, reason: 'no_payment_header' };
  
  const txHash = paymentHeader.trim();
  
  // Check if already used
  if (verifiedPayments.has(txHash)) {
    return { valid: false, reason: 'payment_already_used' };
  }
  
  // Basic format check (0x + 64 hex chars for a tx hash)
  if (/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    // In production: verify via Polygon RPC that:
    // 1. Tx exists and is confirmed
    // 2. It's a USDC transfer to PAY_TO_ADDRESS
    // 3. Amount >= requiredAmount
    // For MVP: accept and log
    verifiedPayments.set(txHash, { 
      timestamp: Date.now(), 
      amount: requiredAmount,
    });
    return { valid: true, txHash };
  }
  
  return { valid: false, reason: 'invalid_payment_format' };
}

/**
 * Express middleware for x402 payment gating on Prescience routes
 */
export function x402Middleware(req, res, next) {
  const path = req.path;
  
  // Only gate /prescience/* routes
  if (!path.startsWith('/prescience')) return next();
  
  const tier = classifyRoute(path);
  
  // Free endpoints (info, pulse)
  if (!tier) return next();
  
  const price = PRICING[tier];
  const ip = getClientIP(req);
  const usage = getFreeTierUsage(ip);
  
  // Check for payment header first
  const paymentHeader = req.headers['x-payment'];
  if (paymentHeader) {
    const verification = verifyPayment(paymentHeader, price);
    if (verification.valid) {
      // Payment verified — serve content
      res.setHeader('X-Payment-Verified', 'true');
      res.setHeader('X-Payment-TxHash', verification.txHash);
      return next();
    }
    // Invalid payment — still check free tier
  }
  
  // Free tier check
  if (usage.count < FREE_TIER_LIMIT) {
    usage.count++;
    res.setHeader('X-Free-Tier-Remaining', String(FREE_TIER_LIMIT - usage.count));
    res.setHeader('X-Free-Tier-Resets', new Date(usage.resetAt).toISOString());
    return next();
  }
  
  // No payment, free tier exhausted → 402
  const response = build402Response(tier, price);
  
  for (const [key, value] of Object.entries(response.headers)) {
    res.setHeader(key, value);
  }
  
  res.setHeader('X-Free-Tier-Remaining', '0');
  res.setHeader('X-Free-Tier-Resets', new Date(usage.resetAt).toISOString());
  
  return res.status(402).json(response.body);
}

/**
 * GET /prescience/pricing — public pricing info
 */
export function registerPricingRoute(app) {
  app.get('/prescience/pricing', (req, res) => {
    const ip = getClientIP(req);
    const usage = getFreeTierUsage(ip);
    
    res.json({
      protocol: 'x402',
      version: '1.0',
      pricing: {
        wallet_scan: { price: PRICING.wallet_scan, unit: 'USD', endpoint: '/prescience/:address' },
        deep_analysis: { price: PRICING.deep_analysis, unit: 'USD', endpoint: '/prescience/market/:marketId' },
        market_report: { price: PRICING.market_report, unit: 'USD', endpoints: ['/prescience/alerts', '/prescience/leaderboard'] },
      },
      payment: {
        network: NETWORK,
        asset: ASSET,
        assetAddress: ASSET_ADDRESS,
        recipient: PAY_TO_ADDRESS,
        howToPay: 'Send USDC on Polygon to recipient, include tx hash in X-Payment header',
      },
      freeTier: {
        limit: FREE_TIER_LIMIT,
        window: '24h',
        remaining: Math.max(0, FREE_TIER_LIMIT - usage.count),
        resetsAt: new Date(usage.resetAt).toISOString(),
      },
      freeEndpoints: [
        '/prescience (info)',
        '/prescience/pulse (market health)',
        '/prescience/pricing (this endpoint)',
      ],
    });
  });
}
