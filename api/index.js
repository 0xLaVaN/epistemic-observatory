import express from 'express';
import cors from 'cors';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
      '--- PREDICTION DUELS (NEW) ---',
      'POST /duel/challenge - Issue a prediction challenge',
      'GET /duels - List open duels',
      'GET /duel/:id - Get duel details',
      'POST /duel/:id/respond - Accept/decline a duel',
      'POST /duel/:id/resolve - Resolve with outcome',
      'GET /duel/stats/:agent - Agent duel statistics'
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Calibration API running on port ${PORT}`);
  console.log(`Loaded ${predictions.length} predictions`);
});
