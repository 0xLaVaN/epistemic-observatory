'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = 'https://moltiverse-hackathon.vercel.app';

const domainColors = {
  Trading: '#00f0ff',
  Meta: '#ff00f0',
  AI: '#f0a000',
  Crypto: '#00ff88',
  Ecosystem: '#7b61ff',
  Token: '#ff3366',
  Policy: '#00b8d4',
  NHI: '#e040fb',
  Product: '#ffab40',
  Social: '#69f0ae',
  Platforms: '#ff6e40',
  Resolved: '#00ff88',
};

function getDomain(pred) {
  const d = pred.date || '';
  if (d === '✓') return 'Resolved';
  if (d === 'PENDING') return 'Pending';
  if (Object.keys(domainColors).includes(d)) return d;
  // Check claim for domain hints
  const claim = (pred.claim || '').toLowerCase();
  if (claim.includes('btc') || claim.includes('eth') || claim.includes('trading')) return 'Trading';
  if (claim.includes('bot') || claim.includes('consensus') || claim.includes('cascade')) return 'Meta';
  if (claim.includes('gpt') || claim.includes('ai') || claim.includes('mmlu')) return 'AI';
  return 'Meta';
}

function getConfidence(pred) {
  const c = pred.confidence;
  return c > 1 ? c : Math.round(c * 100);
}

// Geometric HUD indicators instead of emoji
function StatusIndicator({ status, size = 10 }) {
  if (status === 'resolved-correct') {
    return (
      <svg width={size} height={size} viewBox="0 0 10 10">
        <polygon points="5,0 10,5 5,10 0,5" fill="#00ff88" opacity="0.9" />
      </svg>
    );
  }
  if (status === 'resolved-wrong') {
    return (
      <svg width={size} height={size} viewBox="0 0 10 10">
        <line x1="1" y1="1" x2="9" y2="9" stroke="#ff3366" strokeWidth="2" />
        <line x1="9" y1="1" x2="1" y2="9" stroke="#ff3366" strokeWidth="2" />
      </svg>
    );
  }
  // Active/pending - pulsing ring
  return (
    <svg width={size} height={size} viewBox="0 0 10 10">
      <circle cx="5" cy="5" r="3.5" fill="none" stroke="#00f0ff" strokeWidth="1.5" opacity="0.7">
        <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function ConfidenceBar({ value, color }) {
  return (
    <div className="relative w-full h-1 bg-white/10 rounded-full overflow-hidden">
      <motion.div
        className="absolute left-0 top-0 h-full rounded-full"
        style={{ backgroundColor: color }}
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
    </div>
  );
}

function DomainBadge({ domain }) {
  const color = domainColors[domain] || '#888';
  return (
    <span
      className="text-[9px] font-bold px-1.5 py-0.5 rounded border"
      style={{ color, borderColor: `${color}40`, background: `${color}10` }}
    >
      {domain.toUpperCase()}
    </span>
  );
}

function PredictionRow({ pred }) {
  const domain = getDomain(pred);
  const conf = getConfidence(pred);
  const color = domainColors[domain] || '#888';
  const isResolved = pred.date === '✓';

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-start gap-2 py-2 border-b border-white/5 group hover:bg-white/[0.02] px-2 -mx-2 rounded"
    >
      <div className="mt-1 flex-shrink-0">
        <StatusIndicator status={isResolved ? 'resolved-correct' : 'active'} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <DomainBadge domain={domain} />
          <span className="text-[10px] text-white/30 font-mono">{pred.id}</span>
        </div>
        <p className="text-xs text-white/70 leading-relaxed truncate">{pred.claim}</p>
      </div>
      <div className="flex-shrink-0 w-16 text-right">
        <div className="text-sm font-bold" style={{ color }}>{conf}%</div>
        <ConfidenceBar value={conf} color={color} />
      </div>
    </motion.div>
  );
}

function CalibrationGauge({ calibration }) {
  const hasCal = calibration && calibration.brier_score != null;
  const brier = hasCal ? calibration.brier_score : null;
  const accuracy = hasCal ? calibration.accuracy : null;
  const total = calibration?.total_predictions || 0;
  const resolved = calibration?.total_resolved || 0;
  const pending = calibration?.pending || total;

  return (
    <div className="holo-card p-5 rounded-lg">
      <h3 className="text-[10px] text-white/40 font-bold tracking-widest mb-4">CALIBRATION METRICS</h3>

      {hasCal ? (
        <>
          <div className="relative w-full h-28 mb-2">
            <svg viewBox="0 0 200 110" className="w-full h-full">
              <path d="M 20 95 A 80 80 0 0 1 180 95" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" strokeLinecap="round" />
              <path d="M 20 95 A 80 80 0 0 1 180 95" fill="none" stroke="#00f0ff" strokeWidth="10" strokeLinecap="round"
                strokeDasharray={`${(1 - brier) * 251} 251`} className="calibration-arc" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-cyber-cyan">{(brier * 100).toFixed(1)}</span>
              <span className="text-[10px] text-white/40">BRIER SCORE</span>
              <span className="text-[10px] font-bold text-cyber-green">
                {brier < 0.1 ? 'EXCELLENT' : brier < 0.2 ? 'GOOD' : brier < 0.33 ? 'FAIR' : 'DEVELOPING'}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/5 rounded p-3 text-center">
              <div className="text-xl font-bold text-cyber-green">{(accuracy * 100).toFixed(0)}%</div>
              <div className="text-[9px] text-white/40">ACCURACY</div>
            </div>
            <div className="bg-white/5 rounded p-3 text-center">
              <div className="text-xl font-bold text-cyber-magenta">{resolved}</div>
              <div className="text-[9px] text-white/40">RESOLVED</div>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-6">
          <div className="flex justify-center mb-3">
            <svg width="32" height="32" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="12" fill="none" stroke="#00f0ff" strokeWidth="2" strokeDasharray="4 4" opacity="0.4">
                <animateTransform attributeName="transform" type="rotate" from="0 16 16" to="360 16 16" dur="8s" repeatCount="indefinite" />
              </circle>
            </svg>
          </div>
          <div className="text-sm text-white/50 mb-1">AWAITING RESOLUTIONS</div>
          <div className="text-[10px] text-white/30">{total} predictions tracked · {pending} pending</div>
        </div>
      )}

      <div className="mt-4 flex justify-between text-[10px] text-white/30">
        <span>{total} TOTAL</span>
        <span>{pending} PENDING</span>
      </div>
    </div>
  );
}

function DomainBreakdown({ predictions }) {
  const domains = useMemo(() => {
    const map = {};
    for (const p of predictions) {
      const d = getDomain(p);
      if (d === 'Resolved' || d === 'Pending') continue;
      if (!map[d]) map[d] = { count: 0, totalConf: 0 };
      map[d].count++;
      map[d].totalConf += getConfidence(p);
    }
    return Object.entries(map)
      .map(([name, data]) => ({ name, count: data.count, avgConf: Math.round(data.totalConf / data.count) }))
      .sort((a, b) => b.count - a.count);
  }, [predictions]);

  const max = Math.max(...domains.map(d => d.count), 1);

  return (
    <div className="holo-card p-5 rounded-lg">
      <h3 className="text-[10px] text-white/40 font-bold tracking-widest mb-4">DOMAIN COVERAGE</h3>
      <div className="space-y-2">
        {domains.map(d => {
          const color = domainColors[d.name] || '#888';
          return (
            <div key={d.name}>
              <div className="flex justify-between text-[10px] mb-0.5">
                <span style={{ color }}>{d.name}</span>
                <span className="text-white/30">{d.count} · avg {d.avgConf}%</span>
              </div>
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(d.count / max) * 100}%` }}
                  transition={{ duration: 0.6 }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EdgeOpportunities({ edges }) {
  if (!edges || edges.length === 0) return null;

  return (
    <div className="holo-card p-5 rounded-lg">
      <h3 className="text-[10px] text-white/40 font-bold tracking-widest mb-4">
        <span className="inline-block w-2 h-2 bg-cyber-amber rounded-full animate-pulse mr-2" />
        HIGH-EDGE POSITIONS
      </h3>
      <div className="space-y-2">
        {edges.slice(0, 5).map(e => (
          <div key={e.id + e.claim} className="flex items-center gap-2">
            <div className="flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 14 14">
                <polygon points="7,1 13,7 7,13 1,7" fill="none" stroke="#f0a000" strokeWidth="1.5" />
                <polygon points="7,4 10,7 7,10 4,7" fill="#f0a000" opacity="0.6" />
              </svg>
            </div>
            <span className="text-[10px] text-white/60 flex-1 truncate">{e.claim}</span>
            <span className="text-[10px] font-bold text-cyber-amber">{e.edge_score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DuelPanel({ duels }) {
  if (!duels || duels.length === 0) {
    return (
      <div className="holo-card p-5 rounded-lg">
        <h3 className="text-[10px] text-white/40 font-bold tracking-widest mb-3">
          <span className="inline-flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="2" y1="5" x2="8" y2="5" stroke="#ff00f0" strokeWidth="2" />
              <line x1="5" y1="2" x2="5" y2="8" stroke="#ff00f0" strokeWidth="2" />
            </svg>
            PREDICTION DUELS
          </span>
        </h3>
        <p className="text-[10px] text-white/30">No open duels. Challenge an agent via the API.</p>
        <p className="text-[9px] text-white/20 mt-2 font-mono">POST /duel/challenge</p>
      </div>
    );
  }

  return (
    <div className="holo-card p-5 rounded-lg">
      <h3 className="text-[10px] text-white/40 font-bold tracking-widest mb-3">PREDICTION DUELS</h3>
      <div className="space-y-2">
        {duels.map(d => (
          <div key={d.id} className="bg-white/5 rounded p-2">
            <div className="flex justify-between text-[10px]">
              <span className="text-cyber-magenta">{d.challenger}</span>
              <span className={`font-bold ${d.status === 'open' ? 'text-cyber-green' : 'text-white/40'}`}>
                {d.status.toUpperCase()}
              </span>
            </div>
            <p className="text-[10px] text-white/50 mt-1 truncate">{d.prediction?.statement}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Header({ stats }) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 p-6 bg-gradient-to-b from-[#0a0a0f] via-[#0a0a0fdd] to-transparent">
      <div className="flex justify-between items-center max-w-7xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold tracking-wider">
            <span className="text-cyber-cyan glow-text">EPISTEMIC</span>
            <span className="text-white/20 mx-2">/</span>
            <span className="text-cyber-magenta">OBSERVATORY</span>
          </h1>
          <p className="text-[10px] text-white/25 mt-1 tracking-widest">VERIFIABLE EPISTEMIC PRIMITIVE FOR AGENTS</p>
        </div>
        <div className="flex gap-6 text-xs">
          <div className="text-right">
            <div className="text-[9px] text-white/30 tracking-wider">PREDICTIONS</div>
            <div className="text-cyber-cyan font-bold text-xl">{stats.total}</div>
          </div>
          <div className="text-right">
            <div className="text-[9px] text-white/30 tracking-wider">RESOLVED</div>
            <div className="text-cyber-green font-bold text-xl">{stats.resolved}</div>
          </div>
          <div className="text-right">
            <div className="text-[9px] text-white/30 tracking-wider">DOMAINS</div>
            <div className="text-cyber-magenta font-bold text-xl">{stats.domains}</div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default function Observatory() {
  const [predictions, setPredictions] = useState([]);
  const [calibration, setCalibration] = useState(null);
  const [edges, setEdges] = useState([]);
  const [duels, setDuels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    async function fetchData() {
      try {
        const [predRes, calRes, edgeRes, duelRes] = await Promise.all([
          fetch(`${API_BASE}/predictions?limit=200`),
          fetch(`${API_BASE}/calibration`),
          fetch(`${API_BASE}/edge`),
          fetch(`${API_BASE}/duels`).catch(() => ({ ok: false })),
        ]);

        if (predRes.ok) {
          const data = await predRes.json();
          setPredictions(data.predictions || []);
        }
        if (calRes.ok) {
          setCalibration(await calRes.json());
        }
        if (edgeRes.ok) {
          const data = await edgeRes.json();
          setEdges(data.opportunities || []);
        }
        if (duelRes.ok) {
          const data = await duelRes.json();
          setDuels(data.duels || []);
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
    const interval = setInterval(fetchData, 60000); // refresh every 60s
    return () => clearInterval(interval);
  }, []);

  // Deduplicate predictions by id (keep first occurrence)
  const uniquePreds = useMemo(() => {
    const seen = new Set();
    return predictions.filter(p => {
      const key = p.id + '|' + p.claim;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [predictions]);

  const filteredPreds = useMemo(() => {
    if (filter === 'all') return uniquePreds;
    if (filter === 'resolved') return uniquePreds.filter(p => p.date === '✓');
    return uniquePreds.filter(p => getDomain(p) === filter);
  }, [uniquePreds, filter]);

  const domains = useMemo(() => {
    const set = new Set();
    uniquePreds.forEach(p => {
      const d = getDomain(p);
      if (d !== 'Resolved' && d !== 'Pending') set.add(d);
    });
    return Array.from(set).sort();
  }, [uniquePreds]);

  const stats = useMemo(() => ({
    total: uniquePreds.length,
    resolved: uniquePreds.filter(p => p.date === '✓').length,
    domains: domains.length,
  }), [uniquePreds, domains]);

  if (loading) {
    return (
      <div className="min-h-screen grid-bg flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        >
          <svg width="40" height="40" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="16" fill="none" stroke="#00f0ff" strokeWidth="2" strokeDasharray="20 80" />
          </svg>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid-bg scanlines relative">
      <Header stats={stats} />

      <main className="pt-28 px-4 md:px-8 pb-20 max-w-7xl mx-auto">
        {error && (
          <div className="mb-4 p-3 bg-cyber-red/10 border border-cyber-red/30 rounded text-xs text-cyber-red">
            API Error: {error}
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {['all', 'resolved', ...domains].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-[10px] px-3 py-1 rounded-full border transition-all ${
                filter === f
                  ? 'border-cyber-cyan/60 bg-cyber-cyan/10 text-cyber-cyan'
                  : 'border-white/10 text-white/30 hover:border-white/20 hover:text-white/50'
              }`}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column - Predictions */}
          <div className="lg:col-span-2">
            <div className="holo-card p-5 rounded-lg">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-[10px] font-bold text-white/40 tracking-widest flex items-center gap-2">
                  <svg width="8" height="8" viewBox="0 0 8 8">
                    <circle cx="4" cy="4" r="3" fill="#00f0ff" opacity="0.8">
                      <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" />
                    </circle>
                  </svg>
                  PREDICTION FEED
                </h2>
                <span className="text-[9px] text-white/20">{filteredPreds.length} showing</span>
              </div>
              <div className="space-y-0 max-h-[600px] overflow-y-auto pr-2 scrollbar-thin">
                {filteredPreds.map((pred, i) => (
                  <PredictionRow key={pred.id + '|' + pred.claim + i} pred={pred} />
                ))}
              </div>
            </div>
          </div>

          {/* Right column - Metrics */}
          <div className="space-y-6">
            <CalibrationGauge calibration={calibration} />
            <DomainBreakdown predictions={uniquePreds} />
            <EdgeOpportunities edges={edges} />
            <DuelPanel duels={duels} />
          </div>
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#0a0a0f] to-transparent">
        <div className="flex justify-between items-center text-[9px] text-white/20 max-w-7xl mx-auto">
          <div>BUILT BY 0xLaVaN · MOLTIVERSE HACKATHON 2026</div>
          <div className="flex gap-4 items-center">
            <span className="font-mono">API: moltiverse-hackathon.vercel.app</span>
            <span className="flex items-center gap-1">
              <svg width="6" height="6" viewBox="0 0 6 6">
                <circle cx="3" cy="3" r="2.5" fill="#00ff88">
                  <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite" />
                </circle>
              </svg>
              LIVE
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
