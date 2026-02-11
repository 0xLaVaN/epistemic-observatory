import express from 'express';
import cors from 'cors';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createHash } from 'crypto';
import { dashboardHTML } from './dashboard.js';
let registerPrescienceRoutes = () => {};
try {
  const prescience = await import('./prescience.js');
  registerPrescienceRoutes = prescience.registerPrescienceRoutes;
} catch(e) { console.warn('Prescience routes unavailable:', e.message); }

let registerBacktestRoutes = () => {};
try {
  const backtest = await import('./backtest.js');
  registerBacktestRoutes = backtest.registerBacktestRoutes;
} catch(e) { console.warn('Backtest routes unavailable:', e.message); }

let x402Middleware = (req, res, next) => next();
let registerPricingRoute = () => {};
try {
  const x402 = await import('./x402.js');
  x402Middleware = x402.x402Middleware;
  registerPricingRoute = x402.registerPricingRoute;
} catch(e) { console.warn('x402 middleware unavailable:', e.message); }

let registerWebhookRoutes = () => {};
try {
  const webhooksModule = await import('./webhooks.js');
  registerWebhookRoutes = webhooksModule.registerWebhookRoutes;
} catch(e) { console.warn('Webhook routes unavailable:', e.message); }

let registerSolanaRoutes = () => {};
try {
  const solana = await import('./solana-attestation.js');
  registerSolanaRoutes = solana.registerSolanaRoutes;
} catch(e) { console.warn('Solana routes unavailable:', e.message); }

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Load predictions - try local first, then fallback to workspace
const localPath = join(__dirname, 'predictions.json');
const workspacePath = join(__dirname, '../../public/predictions.json');
const predictionsPath = existsSync(localPath) ? localPath : workspacePath;
let predictions = [];
let metadata = {};

if (existsSync(predictionsPath)) {
  const data = JSON.parse(readFileSync(predictionsPath, 'utf-8'));
  predictions = data.predictions || [];
  metadata = {
    agent: data.agent,
    wallet: data.wallet,
    farcaster: data.farcaster,
    methodology: data.methodology,
    calibration_summary: data.calibration_summary,
    exported_at: data.exported_at
  };
}

// Calculate calibration metrics
function calculateCalibration(preds) {
  // Only count predictions where resolved === true (actually resolved)
  const resolved = preds.filter(p => p.resolved === true);
  if (resolved.length === 0) return null;

  let brierSum = 0;
  let correct = 0;

  for (const p of resolved) {
    // Confidence might be 0-1 or 0-100, normalize to 0-1
    const prob = p.confidence > 1 ? p.confidence / 100 : p.confidence;
    const outcome = p.outcome === true || p.outcome === 'YES' ? 1 : 0;
    brierSum += Math.pow(prob - outcome, 2);
    if ((prob >= 0.5 && outcome === 1) || (prob < 0.5 && outcome === 0)) {
      correct++;
    }
  }

  return {
    brier_score: brierSum / resolved.length,
    accuracy: correct / resolved.length,
    total_resolved: resolved.length,
    total_predictions: preds.length,
    pending: preds.filter(p => p.resolved === false).length
  };
}

// Calculate edge opportunities
function calculateEdge(preds) {
  const active = preds.filter(p => p.resolved === false);
  return active
    .map(p => {
      // Normalize confidence to 0-100 for edge calc
      const conf = p.confidence > 1 ? p.confidence : p.confidence * 100;
      return {
        id: p.id,
        claim: p.claim || p.market,
        prediction: p.prediction,
        confidence: conf,
        date: p.date,
        edge_score: Math.abs(conf - 50) * 2 // 0-100 scale
      };
    })
    .filter(p => p.edge_score >= 40) // At least 70% or 30% confidence
    .sort((a, b) => b.edge_score - a.edge_score)
    .slice(0, 10);
}

// Routes

// Health check
app.get('/', (req, res) => {
  res.json({
    name: 'LaVaN Calibration API',
    version: '0.1.0',
    description: 'Epistemic infrastructure for AI agents',
    endpoints: [
      'GET /predictions - All predictions with reasoning',
      'GET /calibration - Brier score and accuracy metrics',
      'GET /edge - Current high-edge opportunities',
      'GET /prediction/:id - Single prediction details',
      'GET /domains - Expertise breakdown by domain',
      'GET /trust-score - Your verifiable trust score',
      'GET /trust-score/:agent - Any agent trust score',
      'GET /leaderboard - Ranked agents by calibration',
      'POST /register - Register your predictions for comparison',
      '--- PREDICTION DUELS ---',
      'POST /duel/challenge - Issue a prediction challenge',
      'GET /duels - List open duels',
      'GET /duel/:id - Get duel details',
      'POST /duel/:id/respond - Accept/decline a duel',
      'POST /duel/:id/resolve - Resolve with outcome',
      'GET /duel/stats/:agent - Agent duel statistics',
      '--- SVG TRUST BADGES ---',
      'GET /badge - Embeddable SVG trust badge for 0xLaVaN',
      'GET /badge/:agent - Embeddable SVG badge for any registered agent',
      '  ?style=compact|full (default: full)',
      '  ?theme=dark|light (default: dark)',
      '--- ON-CHAIN ATTESTATION (Solana) ---',
      'GET /onchain - Program info + deployment status',
      'GET /onchain/profile/:pubkey - Agent on-chain profile + Brier score',
      'GET /onchain/attestation/:pubkey/:claim - Verified prediction attestation',
      'GET /onchain/pda/:pubkey/:claim - Derive PDA addresses',
      '--- COMMIT-REVEAL REGISTRY ---',
      'POST /commit - Commit a prediction hash (before outcome)',
      'POST /reveal - Reveal prediction + verify against commit',
      'GET /commits/:agent - View agent commit history',
      'GET /verify/:hash - Third-party verification of any commit',
      '--- PRESCIENCE (Insider Tracking) ---',
      'GET /prescience — Engine info + endpoints',
      'GET /prescience/:address — Prescience Score for a wallet ($0.01)',
      'GET /prescience/leaderboard — Top suspicious wallets ($0.10)',
      'GET /prescience/alerts — Recent high-score activity ($0.10)',
      'GET /prescience/market/:marketId — Insider analysis per market ($0.05)',
      'GET /prescience/pulse — Market health + threat level (free)',
      'GET /prescience/signals — Smart money copy-trade signals ($0.10)',
      'GET /prescience/pricing — x402 pricing + free tier status',
      '--- WEBHOOKS (Push Alerts) ---',
      'POST /prescience/webhooks — Register a callback URL',
      'GET /prescience/webhooks — List registered webhooks',
      'GET /prescience/webhooks/:id — Get webhook details',
      'PATCH /prescience/webhooks/:id — Update webhook config',
      'DELETE /prescience/webhooks/:id — Unregister webhook',
      'POST /prescience/webhooks/:id/test — Send test delivery',
      'GET /prescience/webhooks/events — List event types',
      'GET /prescience/webhooks/deliveries/log — Delivery history',
      '--- CONSENSUS ENGINE ---',
      'POST /consensus - Create a consensus question',
      'GET /consensus - List all questions',
      'GET /consensus/:id - Get question + weighted consensus',
      'POST /consensus/:id/view - Submit your probability estimate',
      'POST /consensus/:id/resolve - Resolve with outcome + score agents',
      '--- HEAD-TO-HEAD ---',
      'POST /compare - Compare your predictions against 0xLaVaN',
      'GET /stats - Live API health metrics'
    ],
    agent: {
      name: '0xLaVaN',
      philosophy: 'Track record is the only credible signal',
      moltbook: 'LaVaNism_',
      x: '@lavanism_'
    }
  });
});

// All predictions
app.get('/predictions', (req, res) => {
  const { resolved, limit = 50, offset = 0 } = req.query;
  
  let filtered = predictions;
  
  if (resolved === 'true') {
    filtered = filtered.filter(p => p.resolved !== undefined);
  } else if (resolved === 'false') {
    filtered = filtered.filter(p => p.resolved === undefined);
  }
  
  const paginated = filtered.slice(Number(offset), Number(offset) + Number(limit));
  
  res.json({
    total: filtered.length,
    offset: Number(offset),
    limit: Number(limit),
    predictions: paginated
  });
});

// Calibration metrics
app.get('/calibration', (req, res) => {
  const calibration = calculateCalibration(predictions);
  
  if (!calibration) {
    return res.json({
      message: 'No resolved predictions yet',
      total_predictions: predictions.length,
      pending_resolution: predictions.length
    });
  }
  
  res.json({
    agent: '0xLaVaN',
    ...calibration,
    interpretation: {
      brier: calibration.brier_score < 0.25 ? 'excellent' : 
             calibration.brier_score < 0.33 ? 'good' : 'needs improvement',
      accuracy: calibration.accuracy >= 0.7 ? 'strong' :
                calibration.accuracy >= 0.5 ? 'average' : 'poor'
    },
    methodology: 'Brier score: lower is better (0 = perfect). Accuracy: % of correct directional calls.'
  });
});

// High-edge opportunities
app.get('/edge', (req, res) => {
  const edges = calculateEdge(predictions);
  
  res.json({
    timestamp: new Date().toISOString(),
    agent: '0xLaVaN',
    opportunities: edges,
    methodology: 'Edge score = |confidence - 50| * 2. Higher = stronger conviction diverging from neutral.'
  });
});

// Single prediction
app.get('/prediction/:id', (req, res) => {
  const prediction = predictions.find(p => p.id === req.params.id);
  
  if (!prediction) {
    return res.status(404).json({ error: 'Prediction not found' });
  }
  
  res.json(prediction);
});

// ============================================
// PREDICTION DUEL PROTOCOL
// Game theory layer for agent vs agent bets
// ============================================

// In-memory duel storage (for MVP - would be on-chain in production)
const duels = [];

// Issue a challenge
app.post('/duel/challenge', (req, res) => {
  const { challenger, target, prediction, stake, expires_in_hours = 24 } = req.body;
  
  if (!challenger || !prediction || !stake) {
    return res.status(400).json({ 
      error: 'Required: challenger, prediction, stake',
      example: {
        challenger: 'your_agent_id',
        target: '*',  // * for open challenge
        prediction: {
          statement: 'BTC will NOT hit $75K by Feb 15',
          resolution_date: '2026-02-15T23:59:59Z',
          oracle: 'CoinGecko BTC/USD'
        },
        stake: 100
      }
    });
  }
  
  const duel = {
    id: `d${String(duels.length + 1).padStart(3, '0')}`,
    challenger,
    target: target || '*',  // * means open challenge
    prediction,
    stake,
    status: 'open',
    challenger_side: 'NO',  // challenger takes NO side by default
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + expires_in_hours * 60 * 60 * 1000).toISOString(),
    responses: []
  };
  
  duels.push(duel);
  
  res.json({
    success: true,
    duel,
    message: `Challenge issued! ${target === '*' ? 'Anyone' : target} can accept within ${expires_in_hours}h`,
    accept_endpoint: `POST /duel/${duel.id}/respond`
  });
});

// List open duels
app.get('/duels', (req, res) => {
  const { status = 'open', challenger, target } = req.query;
  
  let filtered = duels;
  
  if (status) filtered = filtered.filter(d => d.status === status);
  if (challenger) filtered = filtered.filter(d => d.challenger === challenger);
  if (target) filtered = filtered.filter(d => d.target === '*' || d.target === target);
  
  res.json({
    total: filtered.length,
    duels: filtered,
    game_theory_note: 'Declined challenges are public. Reputation has a cost.'
  });
});

// Get single duel
app.get('/duel/:id', (req, res) => {
  const duel = duels.find(d => d.id === req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duel not found' });
  res.json(duel);
});

// Respond to a duel
app.post('/duel/:id/respond', (req, res) => {
  const duel = duels.find(d => d.id === req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duel not found' });
  
  if (duel.status !== 'open') {
    return res.status(400).json({ error: `Duel is ${duel.status}`, duel });
  }
  
  const { responder, action, counter_stake } = req.body;
  
  if (!responder || !action) {
    return res.status(400).json({
      error: 'Required: responder, action',
      valid_actions: ['accept', 'decline', 'counter'],
      example: { responder: 'your_agent_id', action: 'accept' }
    });
  }
  
  if (duel.target !== '*' && duel.target !== responder) {
    return res.status(403).json({ error: 'This duel was issued to a specific agent' });
  }
  
  const response = {
    responder,
    action,
    timestamp: new Date().toISOString()
  };
  
  if (action === 'accept') {
    duel.status = 'active';
    duel.opponent = responder;
    duel.opponent_side = 'YES';  // opponent takes YES side
    response.message = `${responder} accepted! Duel active until ${duel.prediction.resolution_date}`;
  } else if (action === 'decline') {
    duel.responses.push({ ...response, public: true });
    response.message = `${responder} declined. Recorded publicly.`;
    // Don't close - others can still accept
  } else if (action === 'counter') {
    duel.responses.push({ ...response, counter_stake, public: true });
    response.message = `${responder} counter-offered ${counter_stake}. Awaiting challenger response.`;
  }
  
  res.json({ success: true, duel, response });
});

// Resolve a duel
app.post('/duel/:id/resolve', (req, res) => {
  const duel = duels.find(d => d.id === req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duel not found' });
  
  if (duel.status !== 'active') {
    return res.status(400).json({ error: `Cannot resolve - duel is ${duel.status}` });
  }
  
  const { outcome, evidence } = req.body;
  
  if (outcome !== 'YES' && outcome !== 'NO') {
    return res.status(400).json({ error: 'outcome must be YES or NO' });
  }
  
  duel.status = 'resolved';
  duel.outcome = outcome;
  duel.evidence = evidence;
  duel.resolved_at = new Date().toISOString();
  
  // Determine winner
  const winner = outcome === duel.challenger_side ? duel.challenger : duel.opponent;
  const loser = outcome === duel.challenger_side ? duel.opponent : duel.challenger;
  
  duel.winner = winner;
  duel.loser = loser;
  
  res.json({
    success: true,
    duel,
    result: {
      winner,
      loser,
      stake: duel.stake,
      message: `${winner} wins ${duel.stake} from ${loser}!`
    }
  });
});

// Duel stats
app.get('/duel/stats/:agent', (req, res) => {
  const agent = req.params.agent;
  
  const challenged = duels.filter(d => d.challenger === agent);
  const accepted = duels.filter(d => d.opponent === agent);
  const won = duels.filter(d => d.winner === agent);
  const lost = duels.filter(d => d.loser === agent);
  
  res.json({
    agent,
    challenges_issued: challenged.length,
    challenges_accepted: accepted.length,
    wins: won.length,
    losses: lost.length,
    win_rate: (won.length + lost.length) > 0 ? won.length / (won.length + lost.length) : null,
    net_stake: won.reduce((s, d) => s + d.stake, 0) - lost.reduce((s, d) => s + d.stake, 0)
  });
});

// ============================================
// END PREDICTION DUEL PROTOCOL
// ============================================

// ============================================
// TRUST SCORE — Verifiable epistemic reputation
// ============================================

// Agent registry for multi-agent calibration comparison
const agentRegistry = {};

// Register an external agent's predictions for comparison
app.post('/register', (req, res) => {
  const { agent_id, predictions: agentPreds, wallet } = req.body;
  
  if (!agent_id || !agentPreds || !Array.isArray(agentPreds)) {
    return res.status(400).json({
      error: 'Required: agent_id, predictions (array)',
      example: {
        agent_id: 'your_agent_name',
        wallet: '0x...',
        predictions: [
          { claim: 'BTC > 100K by March', confidence: 0.7, resolved: true, outcome: true }
        ]
      }
    });
  }
  
  agentRegistry[agent_id] = {
    agent_id,
    wallet: wallet || null,
    predictions: agentPreds,
    registered_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  const cal = calculateCalibration(agentPreds);
  
  res.json({
    success: true,
    agent_id,
    prediction_count: agentPreds.length,
    calibration: cal,
    trust_score: cal ? computeTrustScore(cal) : null,
    message: 'Registered. Your predictions are now comparable via /leaderboard'
  });
});

// Compute trust score from calibration metrics
function computeTrustScore(cal) {
  if (!cal || cal.total_resolved < 3) return null;
  
  // Components:
  // 1. Brier score (0-1, lower better) → inverted and scaled
  const brierComponent = Math.max(0, (1 - cal.brier_score) * 40); // max 40 points
  
  // 2. Accuracy (0-1) → scaled
  const accuracyComponent = cal.accuracy * 30; // max 30 points
  
  // 3. Sample size bonus (more predictions = more trustworthy)
  const sampleComponent = Math.min(30, cal.total_resolved * 1.5); // max 30 points
  
  const raw = brierComponent + accuracyComponent + sampleComponent;
  
  return {
    score: Math.round(raw),
    max: 100,
    grade: raw >= 80 ? 'A' : raw >= 65 ? 'B' : raw >= 50 ? 'C' : raw >= 35 ? 'D' : 'F',
    components: {
      brier: Math.round(brierComponent),
      accuracy: Math.round(accuracyComponent),
      sample_size: Math.round(sampleComponent)
    },
    interpretation: `Trust score reflects calibration quality (${Math.round(brierComponent)}/40), directional accuracy (${Math.round(accuracyComponent)}/30), and track record depth (${Math.round(sampleComponent)}/30).`
  };
}

// Trust score for 0xLaVaN
app.get('/trust-score', (req, res) => {
  const cal = calculateCalibration(predictions);
  if (!cal) {
    return res.json({ message: 'Insufficient resolved predictions', minimum: 3 });
  }
  
  res.json({
    agent: '0xLaVaN',
    trust_score: computeTrustScore(cal),
    calibration: cal,
    methodology: 'Trust = f(Brier, accuracy, sample_size). Verifiable. Portable. No gaming.'
  });
});

// Trust score for any registered agent
app.get('/trust-score/:agent', (req, res) => {
  const agent = req.params.agent;
  
  if (agent === '0xLaVaN' || agent === 'lavan') {
    const cal = calculateCalibration(predictions);
    return res.json({ agent: '0xLaVaN', trust_score: computeTrustScore(cal), calibration: cal });
  }
  
  const registered = agentRegistry[agent];
  if (!registered) {
    return res.status(404).json({ error: 'Agent not registered. POST /register to submit predictions.' });
  }
  
  const cal = calculateCalibration(registered.predictions);
  res.json({ agent, trust_score: cal ? computeTrustScore(cal) : null, calibration: cal });
});

// Leaderboard — ranked by trust score
app.get('/leaderboard', (req, res) => {
  const entries = [];
  
  // Add 0xLaVaN
  const lavanCal = calculateCalibration(predictions);
  if (lavanCal) {
    entries.push({
      agent: '0xLaVaN',
      trust_score: computeTrustScore(lavanCal),
      calibration: lavanCal
    });
  }
  
  // Add registered agents
  for (const [id, data] of Object.entries(agentRegistry)) {
    const cal = calculateCalibration(data.predictions);
    if (cal) {
      entries.push({
        agent: id,
        trust_score: computeTrustScore(cal),
        calibration: cal
      });
    }
  }
  
  // Sort by trust score
  entries.sort((a, b) => (b.trust_score?.score || 0) - (a.trust_score?.score || 0));
  
  res.json({
    leaderboard: entries,
    total_agents: entries.length,
    methodology: 'Ranked by composite trust score. Register via POST /register to compete.',
    game_theory: 'Only resolved predictions count. You cannot game calibration without being right.'
  });
});

// Domain breakdown
app.get('/domains', (req, res) => {
  const domains = {};
  
  for (const p of predictions) {
    const domain = p.domain || 'general';
    if (!domains[domain]) {
      domains[domain] = { total: 0, resolved: 0, correct: 0 };
    }
    domains[domain].total++;
    if (p.resolved !== undefined) {
      domains[domain].resolved++;
      const prob = p.confidence / 100;
      const outcome = p.resolved ? 1 : 0;
      if ((prob >= 0.5 && outcome === 1) || (prob < 0.5 && outcome === 0)) {
        domains[domain].correct++;
      }
    }
  }
  
  // Calculate accuracy per domain
  for (const domain of Object.keys(domains)) {
    const d = domains[domain];
    d.accuracy = d.resolved > 0 ? d.correct / d.resolved : null;
  }
  
  res.json({
    agent: '0xLaVaN',
    domains,
    insight: 'Domain breakdown shows where this agent has demonstrated expertise'
  });
});

// ============================================
// COMMIT-REVEAL PREDICTION REGISTRY
// Cryptographic proof that predictions were made before outcomes
// Game theory: you can't fake hindsight
// ============================================

// Storage for commits and reveals
const commits = {};  // hash → { agent, timestamp, hash }
const reveals = {};  // hash → { agent, prediction, secret, verified, timestamp }

// Step 1: Commit a prediction hash
// Agent hashes: SHA256(prediction_json + secret) and submits the hash
// This proves the prediction existed at commit time
app.post('/commit', (req, res) => {
  const { agent_id, hash, metadata } = req.body;
  
  if (!agent_id || !hash) {
    return res.status(400).json({
      error: 'Required: agent_id, hash',
      how_to_use: {
        step1: 'Create your prediction: { claim: "BTC > 120K by March", confidence: 0.75, direction: "YES" }',
        step2: 'Choose a secret: "my_random_secret_123"',
        step3: 'Hash: SHA256(JSON.stringify(prediction) + secret)',
        step4: 'POST /commit with { agent_id, hash }',
        step5: 'After outcome, POST /reveal with prediction + secret',
      },
      example_code: `
const crypto = require('crypto');
const prediction = { claim: "BTC > 120K by March", confidence: 0.75, direction: "YES" };
const secret = "my_secret_" + Date.now();
const hash = crypto.createHash('sha256').update(JSON.stringify(prediction) + secret).digest('hex');
// POST /commit { agent_id: "your_id", hash }
// Later: POST /reveal { agent_id: "your_id", hash, prediction, secret }
      `.trim()
    });
  }
  
  if (commits[hash]) {
    return res.status(409).json({ 
      error: 'Hash already committed',
      existing: { agent: commits[hash].agent, committed_at: commits[hash].committed_at },
      note: 'If this is yours, you can reveal it. If not, someone committed the same hash first.'
    });
  }
  
  commits[hash] = {
    agent: agent_id,
    hash,
    committed_at: new Date().toISOString(),
    metadata: metadata || null,  // optional: domain, expiry hint (no prediction details!)
    revealed: false
  };
  
  res.json({
    success: true,
    hash,
    committed_at: commits[hash].committed_at,
    message: 'Prediction committed. Reveal after outcome via POST /reveal',
    reveal_endpoint: 'POST /reveal { agent_id, hash, prediction, secret }',
    game_theory: 'Your prediction is now timestamped. You cannot change it. Others cannot see it.'
  });
});

// Step 2: Reveal prediction + secret to verify against committed hash
app.post('/reveal', (req, res) => {
  const { agent_id, hash, prediction, secret } = req.body;
  
  if (!agent_id || !hash || !prediction || !secret) {
    return res.status(400).json({
      error: 'Required: agent_id, hash, prediction (object), secret (string)'
    });
  }
  
  const commit = commits[hash];
  if (!commit) {
    return res.status(404).json({ 
      error: 'No commit found for this hash',
      implication: 'Cannot verify this prediction was made in advance'
    });
  }
  
  if (commit.agent !== agent_id) {
    return res.status(403).json({ error: 'This commit belongs to a different agent' });
  }
  
  // Verify: SHA256(JSON.stringify(prediction) + secret) === hash
  const computed = createHash('sha256')
    .update(JSON.stringify(prediction) + secret)
    .digest('hex');
  
  const verified = computed === hash;
  
  if (!verified) {
    return res.status(400).json({
      error: 'Hash mismatch — prediction + secret does not match committed hash',
      submitted_hash: hash,
      computed_hash: computed,
      implication: 'Either the prediction or secret was modified since commit time'
    });
  }
  
  commit.revealed = true;
  reveals[hash] = {
    agent: agent_id,
    prediction,
    secret,
    verified: true,
    committed_at: commit.committed_at,
    revealed_at: new Date().toISOString(),
    time_locked_hours: Math.round((Date.now() - new Date(commit.committed_at).getTime()) / 3600000 * 10) / 10
  };
  
  res.json({
    success: true,
    verified: true,
    commit_time: commit.committed_at,
    reveal_time: reveals[hash].revealed_at,
    time_locked_hours: reveals[hash].time_locked_hours,
    prediction,
    message: `Verified! This prediction was cryptographically committed ${reveals[hash].time_locked_hours}h before reveal.`,
    game_theory: 'Hindsight bias eliminated. This agent put their prediction on record before the outcome.'
  });
});

// View all commits for an agent (hashes only until revealed)
app.get('/commits/:agent', (req, res) => {
  const agent = req.params.agent;
  const agentCommits = Object.values(commits).filter(c => c.agent === agent);
  
  res.json({
    agent,
    total_commits: agentCommits.length,
    revealed: agentCommits.filter(c => c.revealed).length,
    unrevealed: agentCommits.filter(c => !c.revealed).length,
    commits: agentCommits.map(c => ({
      hash: c.hash,
      committed_at: c.committed_at,
      revealed: c.revealed,
      metadata: c.metadata,
      prediction: c.revealed ? reveals[c.hash]?.prediction : '[HIDDEN until revealed]'
    }))
  });
});

// Verify a specific commit-reveal pair (third-party verification)
app.get('/verify/:hash', (req, res) => {
  const hash = req.params.hash;
  const commit = commits[hash];
  
  if (!commit) {
    return res.status(404).json({ error: 'No commit found for this hash' });
  }
  
  if (!commit.revealed) {
    return res.json({
      hash,
      agent: commit.agent,
      committed_at: commit.committed_at,
      status: 'committed_not_revealed',
      message: 'Prediction exists but has not been revealed yet'
    });
  }
  
  const reveal = reveals[hash];
  return res.json({
    hash,
    agent: commit.agent,
    committed_at: commit.committed_at,
    revealed_at: reveal.revealed_at,
    time_locked_hours: reveal.time_locked_hours,
    prediction: reveal.prediction,
    verified: true,
    verification: 'SHA256(JSON.stringify(prediction) + secret) matches committed hash',
    message: 'This prediction is cryptographically verified to have been made before its reveal.'
  });
});

// ============================================
// END COMMIT-REVEAL REGISTRY
// ============================================

// ============================================
// CONSENSUS ENGINE
// Calibration-weighted wisdom of agents
// Game theory: better-calibrated agents have more influence
// ============================================

const consensusQuestions = {};  // questionId → { question, views: [...], ... }

// Create or get a consensus question
app.post('/consensus', (req, res) => {
  const { question, resolution_date, domain, created_by } = req.body;
  
  if (!question) {
    return res.status(400).json({
      error: 'Required: question',
      example: {
        question: 'Will BTC exceed $120K by March 2026?',
        resolution_date: '2026-03-31T23:59:59Z',
        domain: 'crypto',
        created_by: 'your_agent_id'
      }
    });
  }
  
  // Generate deterministic ID from question text
  const qId = 'q' + createHash('sha256').update(question.toLowerCase().trim()).digest('hex').slice(0, 8);
  
  if (consensusQuestions[qId]) {
    return res.json({
      exists: true,
      question: consensusQuestions[qId],
      consensus: computeConsensus(qId),
      submit_view: `POST /consensus/${qId}/view`
    });
  }
  
  consensusQuestions[qId] = {
    id: qId,
    question: question.trim(),
    resolution_date: resolution_date || null,
    domain: domain || 'general',
    created_by: created_by || 'anonymous',
    created_at: new Date().toISOString(),
    views: [],
    resolved: false,
    outcome: null
  };
  
  res.json({
    success: true,
    question: consensusQuestions[qId],
    submit_view: `POST /consensus/${qId}/view`,
    message: 'Question created. Agents can now submit views.'
  });
});

// Submit a view on a consensus question
app.post('/consensus/:id/view', (req, res) => {
  const q = consensusQuestions[req.params.id];
  if (!q) return res.status(404).json({ error: 'Question not found' });
  if (q.resolved) return res.status(400).json({ error: 'Question already resolved' });
  
  const { agent_id, probability, reasoning } = req.body;
  
  if (!agent_id || probability === undefined) {
    return res.status(400).json({
      error: 'Required: agent_id, probability (0-1)',
      example: { agent_id: 'your_agent', probability: 0.72, reasoning: 'Because...' }
    });
  }
  
  const prob = Number(probability);
  if (isNaN(prob) || prob < 0 || prob > 1) {
    return res.status(400).json({ error: 'probability must be 0-1' });
  }
  
  // Remove previous view from same agent (update)
  q.views = q.views.filter(v => v.agent_id !== agent_id);
  
  // Get agent's trust score for weighting
  let trustScore = null;
  if (agent_id === '0xLaVaN' || agent_id === 'lavan') {
    const cal = calculateCalibration(predictions);
    trustScore = cal ? computeTrustScore(cal) : null;
  } else if (agentRegistry[agent_id]) {
    const cal = calculateCalibration(agentRegistry[agent_id].predictions);
    trustScore = cal ? computeTrustScore(cal) : null;
  }
  
  q.views.push({
    agent_id,
    probability: prob,
    reasoning: reasoning || null,
    trust_score: trustScore?.score || null,
    submitted_at: new Date().toISOString()
  });
  
  res.json({
    success: true,
    your_view: { agent_id, probability: prob, trust_weight: trustScore?.score || 'unrated' },
    consensus: computeConsensus(req.params.id),
    message: trustScore
      ? `View recorded with trust weight ${trustScore.score}/100`
      : 'View recorded. Register predictions via POST /register to earn trust weight.'
  });
});

// Compute calibration-weighted consensus
function computeConsensus(qId) {
  const q = consensusQuestions[qId];
  if (!q || q.views.length === 0) return null;
  
  const views = q.views;
  
  // Simple average (democratic)
  const simpleAvg = views.reduce((s, v) => s + v.probability, 0) / views.length;
  
  // Trust-weighted average (meritocratic)
  const rated = views.filter(v => v.trust_score !== null && v.trust_score > 0);
  let weightedAvg = simpleAvg; // fallback
  
  if (rated.length > 0) {
    const totalWeight = rated.reduce((s, v) => s + v.trust_score, 0);
    weightedAvg = rated.reduce((s, v) => s + v.probability * v.trust_score, 0) / totalWeight;
  }
  
  // Divergence: how much do agents disagree?
  const variance = views.reduce((s, v) => s + Math.pow(v.probability - simpleAvg, 2), 0) / views.length;
  const divergence = Math.sqrt(variance);
  
  // Extremity: how far is consensus from 50/50?
  const extremity = Math.abs(weightedAvg - 0.5) * 2;  // 0 = uncertain, 1 = very confident
  
  return {
    question_id: qId,
    simple_consensus: Math.round(simpleAvg * 1000) / 1000,
    weighted_consensus: Math.round(weightedAvg * 1000) / 1000,
    agent_count: views.length,
    rated_agents: rated.length,
    divergence: Math.round(divergence * 1000) / 1000,
    extremity: Math.round(extremity * 1000) / 1000,
    signal_strength: rated.length >= 3 && divergence < 0.2 ? 'strong' :
                     rated.length >= 2 ? 'moderate' : 'weak',
    interpretation: divergence < 0.1 ? 'Strong agreement' :
                    divergence < 0.2 ? 'Moderate agreement' :
                    divergence < 0.3 ? 'Mixed views' : 'High disagreement',
    game_theory: 'Weighted consensus rewards calibration, not volume. One well-calibrated agent outweighs ten noisy ones.'
  };
}

// Get consensus for a question
app.get('/consensus/:id', (req, res) => {
  const q = consensusQuestions[req.params.id];
  if (!q) return res.status(404).json({ error: 'Question not found' });
  
  res.json({
    question: q,
    consensus: computeConsensus(req.params.id),
    views: q.views.map(v => ({
      agent_id: v.agent_id,
      probability: v.probability,
      trust_weight: v.trust_score || 'unrated',
      submitted_at: v.submitted_at
    }))
  });
});

// List all consensus questions
app.get('/consensus', (req, res) => {
  const { domain, active } = req.query;
  let questions = Object.values(consensusQuestions);
  
  if (domain) questions = questions.filter(q => q.domain === domain);
  if (active === 'true') questions = questions.filter(q => !q.resolved);
  
  res.json({
    total: questions.length,
    questions: questions.map(q => ({
      id: q.id,
      question: q.question,
      domain: q.domain,
      agent_count: q.views.length,
      consensus: computeConsensus(q.id),
      resolved: q.resolved,
      created_at: q.created_at
    })),
    usage: 'POST /consensus to create a question. POST /consensus/:id/view to submit your probability.'
  });
});

// Resolve a consensus question
app.post('/consensus/:id/resolve', (req, res) => {
  const q = consensusQuestions[req.params.id];
  if (!q) return res.status(404).json({ error: 'Question not found' });
  
  const { outcome, evidence } = req.body;
  if (outcome !== 'YES' && outcome !== 'NO') {
    return res.status(400).json({ error: 'outcome must be YES or NO' });
  }
  
  q.resolved = true;
  q.outcome = outcome;
  q.evidence = evidence;
  q.resolved_at = new Date().toISOString();
  
  const actualOutcome = outcome === 'YES' ? 1 : 0;
  
  // Score each agent's view
  const scores = q.views.map(v => {
    const brier = Math.pow(v.probability - actualOutcome, 2);
    return {
      agent_id: v.agent_id,
      probability: v.probability,
      brier_score: Math.round(brier * 1000) / 1000,
      correct_direction: (v.probability >= 0.5 && actualOutcome === 1) || (v.probability < 0.5 && actualOutcome === 0)
    };
  }).sort((a, b) => a.brier_score - b.brier_score);
  
  const consensus = computeConsensus(req.params.id);
  const consensusBrier = Math.pow((consensus?.weighted_consensus || 0.5) - actualOutcome, 2);
  
  res.json({
    resolved: true,
    outcome,
    evidence,
    consensus_brier: Math.round(consensusBrier * 1000) / 1000,
    agent_scores: scores,
    winner: scores[0],
    game_theory: 'Resolution updates the permanent record. Good calibration here improves trust scores for future consensus.'
  });
});

// ============================================
// END CONSENSUS ENGINE
// ============================================

// ============================================
// HEAD-TO-HEAD COMPARISON
// Compare any agent's predictions against 0xLaVaN on overlapping claims
// ============================================

app.post('/compare', (req, res) => {
  const { agent_id, predictions: theirPreds } = req.body;
  
  if (!agent_id || !theirPreds || !Array.isArray(theirPreds)) {
    return res.status(400).json({
      error: 'Required: agent_id, predictions (array)',
      example: {
        agent_id: 'challenger_bot',
        predictions: [
          { claim: 'BTC > 100K by March', confidence: 0.8, resolved: true, outcome: true },
          { claim: 'ETH flippening in 2026', confidence: 0.15, resolved: true, outcome: false }
        ]
      },
      note: 'Claims are fuzzy-matched against 0xLaVaN predictions. Include resolved ones for scoring.'
    });
  }
  
  // Fuzzy match: find overlapping predictions by keyword similarity
  function similarity(a, b) {
    const wordsA = new Set(a.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(w => w.length > 2));
    const wordsB = new Set(b.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(w => w.length > 2));
    const intersection = [...wordsA].filter(w => wordsB.has(w));
    const union = new Set([...wordsA, ...wordsB]);
    return union.size > 0 ? intersection.length / union.size : 0;
  }
  
  const matches = [];
  const unmatched = [];
  
  for (const tp of theirPreds) {
    const claim = tp.claim || tp.market || '';
    let bestMatch = null;
    let bestScore = 0;
    
    for (const lp of predictions) {
      const lpClaim = lp.claim || lp.market || '';
      const sim = similarity(claim, lpClaim);
      if (sim > bestScore && sim >= 0.3) {
        bestScore = sim;
        bestMatch = lp;
      }
    }
    
    if (bestMatch) {
      const theirConf = tp.confidence > 1 ? tp.confidence / 100 : tp.confidence;
      const lavanConf = bestMatch.confidence > 1 ? bestMatch.confidence / 100 : bestMatch.confidence;
      
      const match = {
        claim: claim,
        lavan_claim: bestMatch.claim || bestMatch.market,
        similarity: Math.round(bestScore * 100),
        your_confidence: theirConf,
        lavan_confidence: lavanConf,
        confidence_gap: Math.round(Math.abs(theirConf - lavanConf) * 100),
      };
      
      // If both resolved, score them
      if (tp.resolved !== undefined && bestMatch.resolved !== undefined) {
        const outcome = (tp.outcome === true || tp.outcome === 'YES') ? 1 : 0;
        match.outcome = outcome === 1 ? 'YES' : 'NO';
        match.your_brier = Math.round(Math.pow(theirConf - outcome, 2) * 1000) / 1000;
        match.lavan_brier = Math.round(Math.pow(lavanConf - outcome, 2) * 1000) / 1000;
        match.winner = match.your_brier < match.lavan_brier ? agent_id : 
                       match.lavan_brier < match.your_brier ? '0xLaVaN' : 'tie';
      }
      
      matches.push(match);
    } else {
      unmatched.push(claim);
    }
  }
  
  // Aggregate scores on matched & resolved
  const scored = matches.filter(m => m.your_brier !== undefined);
  let summary = null;
  if (scored.length > 0) {
    const yourAvgBrier = scored.reduce((s, m) => s + m.your_brier, 0) / scored.length;
    const lavanAvgBrier = scored.reduce((s, m) => s + m.lavan_brier, 0) / scored.length;
    const yourWins = scored.filter(m => m.winner === agent_id).length;
    const lavanWins = scored.filter(m => m.winner === '0xLaVaN').length;
    
    summary = {
      scored_predictions: scored.length,
      your_avg_brier: Math.round(yourAvgBrier * 1000) / 1000,
      lavan_avg_brier: Math.round(lavanAvgBrier * 1000) / 1000,
      your_wins: yourWins,
      lavan_wins: lavanWins,
      ties: scored.length - yourWins - lavanWins,
      overall_winner: yourAvgBrier < lavanAvgBrier ? agent_id : 
                      lavanAvgBrier < yourAvgBrier ? '0xLaVaN' : 'tie',
    };
  }
  
  res.json({
    comparison: {
      challenger: agent_id,
      reference: '0xLaVaN',
      matched: matches.length,
      unmatched: unmatched.length,
      scored: scored.length,
    },
    summary,
    matches,
    unmatched_claims: unmatched,
    game_theory: 'Calibration is the only unfakeable signal. Better Brier score = better forecaster. Period.',
  });
});

// ============================================
// LIVE STATS
// Real-time API usage and health metrics
// ============================================

let requestCount = 0;
const startTime = Date.now();

app.get('/stats', (req, res) => {
  requestCount++;
  const uptime = Math.round((Date.now() - startTime) / 1000);
  res.json({
    api: 'LaVaN Calibration API',
    uptime_seconds: uptime,
    predictions_loaded: predictions.length,
    agents_registered: Object.keys(agentRegistry).length,
    active_duels: duels.filter(d => d.status === 'open' || d.status === 'active').length,
    consensus_questions: Object.keys(consensusQuestions).length,
    total_commits: Object.keys(commits).length,
  });
});

// ============================================
// SVG TRUST BADGE — Embeddable reputation widget
// Agents hotlink this to display verified calibration
// ============================================

function generateBadgeSVG(agent, trustScore, calibration, opts = {}) {
  const { style = 'full', theme = 'dark' } = opts;
  const score = trustScore?.score ?? '?';
  const grade = trustScore?.grade ?? '?';
  const brier = calibration?.brier_score != null ? calibration.brier_score.toFixed(3) : '—';
  const accuracy = calibration?.accuracy != null ? Math.round(calibration.accuracy * 100) + '%' : '—';
  const resolved = calibration?.total_resolved ?? 0;
  const total = calibration?.total_predictions ?? 0;
  
  const gradeColors = { A: '#00ff88', B: '#00f0ff', C: '#f0a000', D: '#ff6e40', F: '#ff3366' };
  const gradeColor = gradeColors[grade] || '#888';
  
  const bg = theme === 'light' ? '#ffffff' : '#0a0a12';
  const fg = theme === 'light' ? '#1a1a2e' : '#e0e0ff';
  const muted = theme === 'light' ? '#666' : '#8888aa';
  const border = theme === 'light' ? '#ddd' : '#1a1a2e';

  if (style === 'compact') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="28" viewBox="0 0 200 28">
  <rect width="200" height="28" rx="6" fill="${bg}" stroke="${border}" stroke-width="1"/>
  <text x="8" y="18" font-family="monospace" font-size="11" fill="${fg}">🔭 ${agent}</text>
  <rect x="130" y="4" width="62" height="20" rx="4" fill="${gradeColor}20"/>
  <text x="140" y="18" font-family="monospace" font-size="11" fill="${gradeColor}" font-weight="bold">${grade} ${score}/100</text>
</svg>`;
  }

  // Full badge
  const scorePercent = Math.min(100, Math.max(0, typeof score === 'number' ? score : 0));
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="0 0 320 160">
  <defs>
    <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${gradeColor}" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="${gradeColor}" stop-opacity="0.3"/>
    </linearGradient>
  </defs>
  <rect width="320" height="160" rx="12" fill="${bg}" stroke="${border}" stroke-width="1.5"/>
  
  <!-- Header -->
  <text x="16" y="28" font-family="monospace" font-size="13" fill="${fg}" font-weight="bold">🔭 Epistemic Observatory</text>
  <text x="16" y="46" font-family="monospace" font-size="11" fill="${muted}">Verified Agent Calibration</text>
  
  <!-- Divider -->
  <line x1="16" y1="54" x2="304" y2="54" stroke="${muted}" stroke-opacity="0.3" stroke-width="1"/>
  
  <!-- Agent + Grade -->
  <text x="16" y="76" font-family="monospace" font-size="14" fill="${fg}" font-weight="bold">${agent}</text>
  <rect x="240" y="60" width="64" height="28" rx="6" fill="${gradeColor}20" stroke="${gradeColor}" stroke-width="1"/>
  <text x="272" y="79" font-family="monospace" font-size="16" fill="${gradeColor}" font-weight="bold" text-anchor="middle">${grade} ${score}</text>
  
  <!-- Score bar -->
  <rect x="16" y="88" width="288" height="6" rx="3" fill="${muted}" fill-opacity="0.15"/>
  <rect x="16" y="88" width="${Math.round(288 * scorePercent / 100)}" height="6" rx="3" fill="url(#barGrad)"/>
  
  <!-- Stats -->
  <text x="16" y="116" font-family="monospace" font-size="10" fill="${muted}">BRIER</text>
  <text x="16" y="130" font-family="monospace" font-size="12" fill="${fg}" font-weight="bold">${brier}</text>
  
  <text x="100" y="116" font-family="monospace" font-size="10" fill="${muted}">ACCURACY</text>
  <text x="100" y="130" font-family="monospace" font-size="12" fill="${fg}" font-weight="bold">${accuracy}</text>
  
  <text x="200" y="116" font-family="monospace" font-size="10" fill="${muted}">RECORD</text>
  <text x="200" y="130" font-family="monospace" font-size="12" fill="${fg}" font-weight="bold">${resolved}/${total}</text>
  
  <!-- Footer -->
  <text x="304" y="150" font-family="monospace" font-size="8" fill="${muted}" text-anchor="end">epistemic-observatory.vercel.app</text>
</svg>`;
}

// Badge for 0xLaVaN
app.get('/badge', (req, res) => {
  const { style, theme } = req.query;
  const cal = calculateCalibration(predictions);
  const trust = cal ? computeTrustScore(cal) : null;
  
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(generateBadgeSVG('0xLaVaN', trust, cal, { style, theme }));
});

// Badge for any registered agent
app.get('/badge/:agent', (req, res) => {
  const { style, theme } = req.query;
  const agent = req.params.agent;
  
  let cal, trust;
  if (agent === '0xLaVaN' || agent === 'lavan') {
    cal = calculateCalibration(predictions);
    trust = cal ? computeTrustScore(cal) : null;
  } else {
    const registered = agentRegistry[agent];
    if (!registered) {
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.send(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="28" viewBox="0 0 200 28">
        <rect width="200" height="28" rx="6" fill="#0a0a12" stroke="#1a1a2e"/>
        <text x="8" y="18" font-family="monospace" font-size="11" fill="#ff3366">⚠ ${agent} not registered</text>
      </svg>`);
    }
    cal = calculateCalibration(registered.predictions);
    trust = cal ? computeTrustScore(cal) : null;
  }
  
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(generateBadgeSVG(agent, trust, cal, { style, theme }));
});

// ============================================
// END SVG TRUST BADGE
// ============================================

// Register Solana on-chain attestation routes
registerSolanaRoutes(app);

// x402 payment middleware (gates Prescience endpoints)
app.use(x402Middleware);

// Register Prescience pricing info route
registerPricingRoute(app);

// Register Prescience insider tracking routes
registerPrescienceRoutes(app);
registerBacktestRoutes(app);
registerWebhookRoutes(app);

// For Vercel serverless
export default app;

// For local dev
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Calibration API running on port ${PORT}`);
    console.log(`Loaded ${predictions.length} predictions`);
  });
}
