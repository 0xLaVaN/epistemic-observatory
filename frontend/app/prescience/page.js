'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = 'https://epistemic-observatory.vercel.app';

const RISK_COLORS = {
  CRITICAL: '#ff3366',
  HIGH: '#f0a000',
  MEDIUM: '#00f0ff',
  LOW: '#00ff88',
};

function RiskBadge({ level }) {
  const color = RISK_COLORS[level] || '#888';
  return (
    <span
      className="text-[9px] font-bold px-1.5 py-0.5 rounded border"
      style={{ color, borderColor: `${color}40`, background: `${color}10` }}
    >
      {level}
    </span>
  );
}

function ThreatLevel({ level }) {
  const colors = { SEVERE: '#ff3366', ELEVATED: '#f0a000', GUARDED: '#00f0ff', LOW: '#00ff88' };
  const color = colors[level] || '#888';
  return (
    <div className="flex items-center gap-2">
      <svg width="12" height="12" viewBox="0 0 12 12">
        <polygon points="6,1 11,6 6,11 1,6" fill={color} opacity="0.8">
          {level === 'SEVERE' && <animate attributeName="opacity" values="0.4;1;0.4" dur="0.8s" repeatCount="indefinite" />}
          {level === 'ELEVATED' && <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite" />}
        </polygon>
      </svg>
      <span className="text-sm font-bold" style={{ color }}>{level}</span>
    </div>
  );
}

function ScoreGauge({ score, size = 80 }) {
  const color = score >= 75 ? '#ff3366' : score >= 50 ? '#f0a000' : score >= 25 ? '#00f0ff' : '#00ff88';
  const circumference = 2 * Math.PI * 32;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
        <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
        <motion.circle
          cx="40" cy="40" r="32" fill="none" stroke={color} strokeWidth="6"
          strokeLinecap="round" strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold" style={{ color }}>{score}</span>
        <span className="text-[8px] text-white/30">SCORE</span>
      </div>
    </div>
  );
}

function BreakdownBar({ label, score, detail, weight }) {
  const color = score >= 75 ? '#ff3366' : score >= 50 ? '#f0a000' : score >= 25 ? '#00f0ff' : '#00ff88';
  return (
    <div className="mb-2">
      <div className="flex justify-between text-[9px] mb-0.5">
        <span className="text-white/50">{label} <span className="text-white/20">({Math.round(weight * 100)}%)</span></span>
        <span style={{ color }}>{score}</span>
      </div>
      <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.6 }}
        />
      </div>
      {detail && <div className="text-[8px] text-white/20 mt-0.5">{detail}</div>}
    </div>
  );
}

function WalletCard({ wallet, expanded, onToggle }) {
  const addr = wallet.address;
  const short = addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : 'unknown';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="holo-card rounded-lg overflow-hidden mb-2"
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 hover:bg-white/[0.02] transition-colors text-left"
      >
        <ScoreGauge score={wallet.score} size={48} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[11px] font-mono text-white/70">{short}</span>
            <RiskBadge level={wallet.riskLevel} />
          </div>
          <div className="text-[9px] text-white/30">
            {wallet.tradeCount || wallet.trades || 0} trades · ${Math.round(wallet.totalUSD || 0).toLocaleString()}
          </div>
        </div>
        <svg width="10" height="10" viewBox="0 0 10 10" className={`text-white/20 transition-transform ${expanded ? 'rotate-180' : ''}`}>
          <polyline points="2,3 5,7 8,3" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>

      <AnimatePresence>
        {expanded && wallet.breakdown && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-3 pb-3 overflow-hidden"
          >
            <div className="border-t border-white/5 pt-3">
              {wallet.breakdown.wallet_age && (
                <BreakdownBar label="WALLET AGE" score={wallet.breakdown.wallet_age.score} weight={wallet.breakdown.wallet_age.weight} detail={`${wallet.breakdown.wallet_age.days}d old`} />
              )}
              {wallet.breakdown.avg_bet_size && (
                <BreakdownBar label="BET SIZE" score={wallet.breakdown.avg_bet_size.score} weight={wallet.breakdown.avg_bet_size.weight} detail={`avg $${wallet.breakdown.avg_bet_size.usd}`} />
              )}
              {wallet.breakdown.timing && (
                <BreakdownBar label="TIMING" score={wallet.breakdown.timing.score} weight={wallet.breakdown.timing.weight} detail={`${wallet.breakdown.timing.samples} samples`} />
              )}
              {wallet.breakdown.win_rate && (
                <BreakdownBar label="WIN RATE" score={wallet.breakdown.win_rate.score} weight={wallet.breakdown.win_rate.weight} detail={`${wallet.breakdown.win_rate.wins}W / ${wallet.breakdown.win_rate.losses}L (${Math.round(wallet.breakdown.win_rate.rate * 100)}%)`} />
              )}
              {wallet.breakdown.concentration && (
                <BreakdownBar label="CONCENTRATION" score={wallet.breakdown.concentration.score} weight={wallet.breakdown.concentration.weight} detail={`${wallet.breakdown.concentration.unique_markets} markets`} />
              )}
              {wallet.breakdown.volume && (
                <BreakdownBar label="VOLUME" score={wallet.breakdown.volume.score} weight={wallet.breakdown.volume.weight} detail={`$${Math.round(wallet.breakdown.volume.total_usd).toLocaleString()}`} />
              )}
              <div className="mt-2 text-right">
                <a
                  href={`https://polygonscan.com/address/${addr}`}
                  target="_blank"
                  rel="noopener"
                  className="text-[9px] text-cyber-cyan/50 hover:text-cyber-cyan transition-colors"
                >
                  VIEW ON CHAIN →
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function PulsePanel({ pulse }) {
  if (!pulse) return null;
  return (
    <div className="holo-card p-5 rounded-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] text-white/40 font-bold tracking-widest">MARKET PULSE</h3>
        <ThreatLevel level={pulse.threat_level} />
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white/5 rounded p-3 text-center">
          <div className="text-xl font-bold text-cyber-cyan">{pulse.markets_scanned}</div>
          <div className="text-[9px] text-white/30">MARKETS</div>
        </div>
        <div className="bg-white/5 rounded p-3 text-center">
          <div className="text-xl font-bold text-white/70">{pulse.total_wallets}</div>
          <div className="text-[9px] text-white/30">WALLETS</div>
        </div>
        <div className="bg-white/5 rounded p-3 text-center">
          <div className="text-xl font-bold" style={{ color: pulse.suspicious_wallets > 10 ? '#ff3366' : '#f0a000' }}>
            {pulse.suspicious_wallets}
          </div>
          <div className="text-[9px] text-white/30">SUSPICIOUS</div>
        </div>
        <div className="bg-white/5 rounded p-3 text-center">
          <div className="text-xl font-bold text-cyber-green">{pulse.suspicious_ratio}%</div>
          <div className="text-[9px] text-white/30">RATIO</div>
        </div>
      </div>
      <div className="flex justify-between text-[9px] text-white/20">
        <span>${Math.round(pulse.total_volume_usd).toLocaleString()} volume</span>
        <span>Peak score: {pulse.highest_score}</span>
      </div>
    </div>
  );
}

function HotMarkets({ markets }) {
  if (!markets || markets.length === 0) return null;
  return (
    <div className="holo-card p-5 rounded-lg">
      <h3 className="text-[10px] text-white/40 font-bold tracking-widest mb-4 flex items-center gap-2">
        <span className="inline-block w-2 h-2 bg-cyber-red rounded-full animate-pulse" />
        HOT MARKETS
      </h3>
      <div className="space-y-2">
        {markets.slice(0, 8).map((m, i) => (
          <a
            key={m.conditionId || i}
            href={`/prescience/market/${m.conditionId}`}
            className="block bg-white/[0.02] hover:bg-white/[0.04] rounded p-2 transition-colors"
          >
            <div className="flex items-start gap-2">
              <span className="text-[9px] text-cyber-red font-bold flex-shrink-0 mt-0.5">
                {m.suspicious_wallets} SUS
              </span>
              <span className="text-[10px] text-white/60 flex-1 line-clamp-2">{m.question}</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function WalletLookup() {
  const [address, setAddress] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const lookup = async () => {
    if (!address.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/prescience/${encodeURIComponent(address.trim())}`);
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setResult({ error: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="holo-card p-5 rounded-lg">
      <h3 className="text-[10px] text-white/40 font-bold tracking-widest mb-4">WALLET SCANNER</h3>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={address}
          onChange={e => setAddress(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && lookup()}
          placeholder="0x..."
          className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white/70 font-mono placeholder:text-white/20 focus:outline-none focus:border-cyber-cyan/40"
        />
        <button
          onClick={lookup}
          disabled={loading}
          className="px-3 py-1.5 bg-cyber-red/10 border border-cyber-red/30 rounded text-[10px] text-cyber-red font-bold hover:bg-cyber-red/20 transition-colors disabled:opacity-40"
        >
          {loading ? '...' : 'SCAN'}
        </button>
      </div>
      {result && (
        <div className="mt-3">
          {result.error ? (
            <div className="text-[10px] text-cyber-red">{result.error}</div>
          ) : result.score != null ? (
            <div className="flex items-center gap-4">
              <ScoreGauge score={result.score} size={64} />
              <div className="text-[10px] space-y-1">
                <div className="flex items-center gap-2">
                  <RiskBadge level={result.riskLevel} />
                  <span className="text-white/30">{result.confidence} confidence</span>
                </div>
                <div className="text-white/40">{result.tradeCount} trades analyzed</div>
              </div>
            </div>
          ) : (
            <div className="text-[10px] text-white/40">{result.message || 'No data'}</div>
          )}
        </div>
      )}
    </div>
  );
}

function AlertsFeed({ alerts }) {
  if (!alerts || alerts.length === 0) {
    return (
      <div className="text-center py-8 text-[10px] text-white/30">
        No alerts above threshold. Market is clean.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert, i) => (
        <motion.div
          key={alert.address + i}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          className="holo-card rounded-lg p-3"
        >
          <div className="flex items-center gap-3">
            <ScoreGauge score={alert.score} size={40} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-mono text-white/60">
                  {alert.address?.slice(0, 6)}...{alert.address?.slice(-4)}
                </span>
                <RiskBadge level={alert.riskLevel} />
              </div>
              <div className="text-[9px] text-white/40 truncate">
                {alert.market?.question}
              </div>
              <div className="text-[9px] text-white/25 mt-0.5">
                {alert.activity?.trades} trades · ${alert.activity?.totalUSD} · {alert.activity?.side} {alert.activity?.outcome}
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

export default function PrescienceDashboard() {
  const [view, setView] = useState('leaderboard'); // leaderboard | alerts
  const [leaderboard, setLeaderboard] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [pulse, setPulse] = useState(null);
  const [hotMarkets, setHotMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedWallet, setExpandedWallet] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [pulseRes, leaderRes, alertRes] = await Promise.all([
          fetch(`${API_BASE}/prescience/pulse`).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch(`${API_BASE}/prescience/leaderboard?limit=30`).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch(`${API_BASE}/prescience/alerts?threshold=40`).then(r => r.ok ? r.json() : null).catch(() => null),
        ]);

        if (pulseRes?.pulse) {
          setPulse(pulseRes.pulse);
          setHotMarkets(pulseRes.hot_markets || []);
        }
        if (leaderRes?.leaderboard) setLeaderboard(leaderRes.leaderboard);
        if (alertRes?.alerts) setAlerts(alertRes.alerts);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 120000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen grid-bg flex items-center justify-center">
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="inline-block mb-4"
          >
            <svg width="40" height="40" viewBox="0 0 40 40">
              <polygon points="20,2 38,20 20,38 2,20" fill="none" stroke="#ff3366" strokeWidth="2" strokeDasharray="15 5" />
            </svg>
          </motion.div>
          <div className="text-[10px] text-white/30 tracking-widest">SCANNING MARKETS...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid-bg scanlines relative">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 p-6 bg-gradient-to-b from-[#0a0a0f] via-[#0a0a0fdd] to-transparent">
        <div className="flex justify-between items-center max-w-7xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold tracking-wider">
              <span className="text-cyber-red glow-text">PRESCIENCE</span>
            </h1>
            <p className="text-[10px] text-white/25 mt-1 tracking-widest">SEE WHO SEES FIRST</p>
          </div>
          <div className="flex items-center gap-4">
            <a href="/" className="text-[10px] text-white/30 hover:text-white/60 transition-colors border border-white/10 px-3 py-1.5 rounded">
              ← OBSERVATORY
            </a>
            <div className="flex gap-1">
              {['leaderboard', 'alerts'].map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`text-[10px] px-3 py-1.5 rounded border transition-all ${
                    view === v
                      ? 'border-cyber-red/60 bg-cyber-red/10 text-cyber-red'
                      : 'border-white/10 text-white/30 hover:text-white/50'
                  }`}
                >
                  {v.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="pt-28 px-4 md:px-8 pb-20 max-w-7xl mx-auto">
        {/* Hero */}
        <div className="mb-8 holo-card p-6 rounded-lg border border-cyber-red/20 bg-gradient-to-r from-cyber-red/5 to-transparent">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white mb-1">Prediction Market Insider Tracker</h2>
              <p className="text-[12px] text-white/50 max-w-lg">
                Bloomberg terminal for on-chain surveillance. Scan Polymarket wallets for insider-like behavior.
                Score wallets 0-100 on timing, win rate, concentration, and more.
              </p>
            </div>
            <div className="text-right">
              <div className="text-[9px] text-white/30">ENGINE</div>
              <div className="text-sm font-bold text-cyber-red">Prescience v1.0</div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-cyber-red/10 border border-cyber-red/30 rounded text-xs text-cyber-red">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[10px] font-bold text-white/40 tracking-widest flex items-center gap-2">
                <svg width="8" height="8" viewBox="0 0 8 8">
                  <polygon points="4,0 8,4 4,8 0,4" fill="#ff3366" opacity="0.8">
                    <animate attributeName="opacity" values="0.4;1;0.4" dur="1.5s" repeatCount="indefinite" />
                  </polygon>
                </svg>
                {view === 'leaderboard' ? 'SUSPICIOUS WALLET LEADERBOARD' : 'INSIDER ALERTS'}
              </h2>
              <span className="text-[9px] text-white/20">
                {view === 'leaderboard' ? `${leaderboard.length} wallets` : `${alerts.length} alerts`}
              </span>
            </div>

            {view === 'leaderboard' ? (
              <div className="space-y-0">
                {leaderboard.map((w, i) => (
                  <WalletCard
                    key={w.address + i}
                    wallet={w}
                    expanded={expandedWallet === w.address}
                    onToggle={() => setExpandedWallet(expandedWallet === w.address ? null : w.address)}
                  />
                ))}
                {leaderboard.length === 0 && (
                  <div className="text-center py-12 text-[10px] text-white/30">
                    No suspicious wallets detected. Market looks clean.
                  </div>
                )}
              </div>
            ) : (
              <AlertsFeed alerts={alerts} />
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <PulsePanel pulse={pulse} />
            <WalletLookup />
            <HotMarkets markets={hotMarkets} />

            {/* Methodology */}
            <div className="holo-card p-5 rounded-lg">
              <h3 className="text-[10px] text-white/40 font-bold tracking-widest mb-4">METHODOLOGY</h3>
              <div className="space-y-2 text-[10px] text-white/40">
                <div className="flex justify-between">
                  <span>Timing (25%)</span>
                  <span className="text-white/60">Late bets before resolution</span>
                </div>
                <div className="flex justify-between">
                  <span>Win Rate (25%)</span>
                  <span className="text-white/60">Abnormally high accuracy</span>
                </div>
                <div className="flex justify-between">
                  <span>Wallet Age (15%)</span>
                  <span className="text-white/60">Fresh wallets = suspicious</span>
                </div>
                <div className="flex justify-between">
                  <span>Bet Size (15%)</span>
                  <span className="text-white/60">Large concentrated bets</span>
                </div>
                <div className="flex justify-between">
                  <span>Concentration (10%)</span>
                  <span className="text-white/60">Few markets = targeted</span>
                </div>
                <div className="flex justify-between">
                  <span>Volume (10%)</span>
                  <span className="text-white/60">Total trading volume</span>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-white/5 text-[9px] text-white/20">
                Scores 0-100. Higher = more insider-like behavior.
                Data sourced from Polymarket on-chain activity.
              </div>
            </div>

            {/* API */}
            <div className="holo-card p-5 rounded-lg">
              <h3 className="text-[10px] text-white/40 font-bold tracking-widest mb-3">API ENDPOINTS</h3>
              <div className="space-y-1.5 text-[9px] font-mono text-white/30">
                <div>GET /prescience/:address</div>
                <div>GET /prescience/leaderboard</div>
                <div>GET /prescience/alerts</div>
                <div>GET /prescience/market/:id</div>
                <div>GET /prescience/pulse</div>
              </div>
              <a
                href={`${API_BASE}/prescience`}
                target="_blank"
                rel="noopener"
                className="block mt-3 text-[9px] text-cyber-cyan/50 hover:text-cyber-cyan transition-colors"
              >
                FULL DOCS →
              </a>
            </div>
          </div>
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#0a0a0f] to-transparent">
        <div className="flex justify-between items-center text-[9px] text-white/20 max-w-7xl mx-auto">
          <div>PRESCIENCE by 0xLaVaN · EPISTEMIC OBSERVATORY</div>
          <div className="flex gap-4 items-center">
            <span className="font-mono">See who sees first.</span>
            <span className="flex items-center gap-1">
              <svg width="6" height="6" viewBox="0 0 6 6">
                <polygon points="3,0 6,3 3,6 0,3" fill="#ff3366">
                  <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite" />
                </polygon>
              </svg>
              SCANNING
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
