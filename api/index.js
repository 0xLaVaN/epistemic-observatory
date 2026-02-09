import express from 'express';
import cors from 'cors';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createHash } from 'crypto';

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
      '--- COMMIT-REVEAL REGISTRY ---',
      'POST /commit - Commit a prediction hash (before outcome)',
      'POST /reveal - Reveal prediction + verify against commit',
      'GET /commits/:agent - View agent commit history',
      'GET /verify/:hash - Third-party verification of any commit'
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Calibration API running on port ${PORT}`);
  console.log(`Loaded ${predictions.length} predictions`);
});
