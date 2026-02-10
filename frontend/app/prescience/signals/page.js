'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = 'https://epistemic-observatory.vercel.app';

// ─── THEME ─────────────────────────────────────────────────────────
const STRENGTH_CONFIG = {
  STRONG: { color: '#00ff88', bg: 'bg-green-500/10', border: 'border-green-500/30', label: 'STRONG', icon: '◆' },
  MODERATE: { color: '#f0a000', bg: 'bg-amber-500/10', border: 'border-amber-500/30', label: 'MODERATE', icon: '◇' },
  SPECULATIVE: { color: '#00f0ff', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', label: 'SPEC', icon: '○' },
};

// ─── ANIMATED NUMBER ───────────────────────────────────────────────
function AnimatedNumber({ value, decimals = 0, prefix = '', suffix = '', duration = 800 }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    if (value == null) return;
    const target = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(target)) { setDisplay(value); return; }
    const start = performance.now();
    const animate = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(target * eased);
      if (progress < 1) ref.current = requestAnimationFrame(animate);
    };
    ref.current = requestAnimationFrame(animate);
    return () => ref.current && cancelAnimationFrame(ref.current);
  }, [value, duration]);
  return <>{prefix}{typeof display === 'number' ? display.toFixed(decimals) : display}{suffix}</>;
}

// ─── PARTICLE BACKGROUND ───────────────────────────────────────────
function ParticleField() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    const particles = [];
    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener('resize', resize);
    const W = () => canvas.offsetWidth;
    const H = () => canvas.offsetHeight;
    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * 2000, y: Math.random() * 1000,
        vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2,
        size: Math.random() * 1.5 + 0.5, opacity: Math.random() * 0.4 + 0.1,
        color: Math.random() > 0.6 ? '#00ff88' : '#00f0ff',
      });
    }
    const draw = () => {
      ctx.clearRect(0, 0, W(), H());
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W(); if (p.x > W()) p.x = 0;
        if (p.y < 0) p.y = H(); if (p.y > H()) p.y = 0;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color; ctx.globalAlpha = p.opacity; ctx.fill();
      }
      ctx.globalAlpha = 1;
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

// ─── CONFIDENCE RING ───────────────────────────────────────────────
function ConfidenceRing({ value, size = 64, color }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90">
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
        <motion.circle
          cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth="3"
          strokeLinecap="round" strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-mono font-bold" style={{ color }}>{value}</span>
      </div>
    </div>
  );
}

// ─── EDGE BAR ──────────────────────────────────────────────────────
function EdgeBar({ edge, ev }) {
  const edgeColor = edge > 15 ? '#00ff88' : edge > 5 ? '#f0a000' : '#00f0ff';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-gray-500 font-mono uppercase">
        <span>Edge</span>
        <span style={{ color: edgeColor }}>{edge.toFixed(1)}%</span>
      </div>
      <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, edge * 2)}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ backgroundColor: edgeColor }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-500 font-mono uppercase">
        <span>EV Ratio</span>
        <span className={ev > 1.3 ? 'text-green-400' : ev > 1 ? 'text-amber-400' : 'text-red-400'}>
          {ev.toFixed(2)}x
        </span>
      </div>
    </div>
  );
}

// ─── SIGNAL CARD ───────────────────────────────────────────────────
function SignalCard({ signal, index }) {
  const [expanded, setExpanded] = useState(false);
  const config = STRENGTH_CONFIG[signal.signal.strength] || STRENGTH_CONFIG.SPECULATIVE;
  const s = signal.signal;
  const sm = signal.smart_money;
  const m = signal.market;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
      className={`relative border ${config.border} rounded-lg overflow-hidden cursor-pointer hover:border-opacity-60 transition-all duration-300`}
      style={{ background: 'rgba(10,10,20,0.8)' }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Glow accent */}
      <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: `linear-gradient(90deg, transparent, ${config.color}40, transparent)` }} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <ConfidenceRing value={s.confidence} size={52} color={config.color} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${config.bg}`} style={{ color: config.color }}>
                {config.icon} {config.label}
              </span>
              <span className="text-[10px] font-mono text-gray-500">
                {sm.wallet_count} wallet{sm.wallet_count !== 1 ? 's' : ''}
              </span>
            </div>
            <h3 className="text-sm text-gray-200 font-medium leading-tight line-clamp-2">
              {m.question}
            </h3>
          </div>
        </div>

        {/* Signal direction */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-gray-500 uppercase">Smart Money Says</span>
            <span className="text-sm font-bold" style={{ color: config.color }}>
              {s.direction}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-gray-500">
              Mkt: <span className="text-gray-300">{(s.current_price * 100).toFixed(0)}¢</span>
            </span>
            <span className="text-gray-500">
              SM: <span style={{ color: config.color }}>{(s.smart_money_implied * 100).toFixed(0)}¢</span>
            </span>
          </div>
        </div>

        {/* Edge bar */}
        <div className="mt-3">
          <EdgeBar edge={s.edge_pct} ev={s.expected_value} />
        </div>

        {/* Expanded details */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="mt-4 pt-3 border-t border-gray-800/50 space-y-3">
                {/* Smart Money Stats */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-900/50 rounded p-2">
                    <div className="text-[10px] font-mono text-gray-500 uppercase">Total Volume</div>
                    <div className="text-sm font-mono text-gray-200">${sm.total_volume_usd.toLocaleString()}</div>
                  </div>
                  <div className="bg-gray-900/50 rounded p-2">
                    <div className="text-[10px] font-mono text-gray-500 uppercase">24h Volume</div>
                    <div className="text-sm font-mono text-gray-200">${sm.recent_volume_usd.toLocaleString()}</div>
                  </div>
                  <div className="bg-gray-900/50 rounded p-2">
                    <div className="text-[10px] font-mono text-gray-500 uppercase">Avg Win Rate</div>
                    <div className="text-sm font-mono text-green-400">{(sm.avg_win_rate * 100).toFixed(0)}%</div>
                  </div>
                  <div className="bg-gray-900/50 rounded p-2">
                    <div className="text-[10px] font-mono text-gray-500 uppercase">Consensus</div>
                    <div className="text-sm font-mono text-cyan-400">{(sm.consensus_strength * 100).toFixed(0)}%</div>
                  </div>
                </div>

                {/* Risk */}
                <div className="flex items-center gap-2 text-[10px] font-mono">
                  <span className={signal.risk.liquidity_ok ? 'text-green-400' : 'text-red-400'}>
                    {signal.risk.liquidity_ok ? '● LIQ OK' : '● LOW LIQ'}
                  </span>
                  <span className="text-gray-600">|</span>
                  <span className="text-gray-400">{signal.risk.max_loss}</span>
                  <span className="text-gray-600">→</span>
                  <span className="text-green-400">{signal.risk.max_gain}</span>
                </div>

                {/* Market info */}
                <div className="flex items-center justify-between text-[10px] font-mono text-gray-500">
                  <span>Vol: ${(m.volumeTotal || 0).toLocaleString()}</span>
                  <span>Liq: ${(m.liquidity || 0).toLocaleString()}</span>
                  {m.endDate && <span>Ends: {new Date(m.endDate).toLocaleDateString()}</span>}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────
export default function SignalsPage() {
  const [signals, setSignals] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [minConfidence, setMinConfidence] = useState(50);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchSignals = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/prescience/signals?min_confidence=${minConfidence}&limit=20`);
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      setSignals(data.signals || []);
      setMeta(data.meta || null);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [minConfidence]);

  useEffect(() => { fetchSignals(); }, [fetchSignals]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchSignals, 120000); // 2 min
    return () => clearInterval(interval);
  }, [autoRefresh, fetchSignals]);

  const strongCount = signals.filter(s => s.signal.strength === 'STRONG').length;
  const modCount = signals.filter(s => s.signal.strength === 'MODERATE').length;
  const avgEdge = signals.length > 0
    ? signals.reduce((s, x) => s + x.signal.edge_pct, 0) / signals.length
    : 0;

  return (
    <div className="relative min-h-screen bg-[#050510] text-white overflow-hidden">
      <ParticleField />

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-2 mb-1">
            <a href="/prescience" className="text-[10px] font-mono text-gray-500 hover:text-cyan-400 transition-colors uppercase tracking-widest">
              ← Prescience
            </a>
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-green-400 via-cyan-400 to-green-400 bg-clip-text text-transparent">
            Smart Money Signals
          </h1>
          <p className="text-gray-500 text-sm font-mono mt-1">
            Follow the wallets that see first. Copy-trade intelligence from on-chain behavior.
          </p>
        </motion.div>

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-4 gap-3 mb-6"
        >
          {[
            { label: 'Active Signals', value: signals.length, color: '#00f0ff' },
            { label: 'Strong', value: strongCount, color: '#00ff88' },
            { label: 'Moderate', value: modCount, color: '#f0a000' },
            { label: 'Avg Edge', value: `${avgEdge.toFixed(1)}%`, color: avgEdge > 10 ? '#00ff88' : '#00f0ff' },
          ].map((stat, i) => (
            <div key={i} className="bg-gray-900/30 border border-gray-800/50 rounded-lg p-3 text-center">
              <div className="text-[10px] font-mono text-gray-500 uppercase">{stat.label}</div>
              <div className="text-lg font-bold font-mono mt-0.5" style={{ color: stat.color }}>
                {stat.value}
              </div>
            </div>
          ))}
        </motion.div>

        {/* Controls */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <label className="text-[10px] font-mono text-gray-500 uppercase">Min Confidence</label>
            <div className="flex gap-1">
              {[40, 50, 60, 70, 80].map(v => (
                <button
                  key={v}
                  onClick={() => setMinConfidence(v)}
                  className={`px-2 py-1 text-xs font-mono rounded transition-all ${
                    minConfidence === v
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : 'bg-gray-900/50 text-gray-500 border border-gray-800/50 hover:text-gray-300'
                  }`}
                >
                  {v}+
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`text-[10px] font-mono uppercase px-2 py-1 rounded border transition-all ${
                autoRefresh
                  ? 'text-green-400 border-green-500/30 bg-green-500/10'
                  : 'text-gray-500 border-gray-800/50 bg-gray-900/50'
              }`}
            >
              {autoRefresh ? '● LIVE' : '○ PAUSED'}
            </button>
            <button
              onClick={fetchSignals}
              className="text-[10px] font-mono text-gray-400 hover:text-cyan-400 transition-colors"
              disabled={loading}
            >
              {loading ? '⟳ Loading...' : '↻ Refresh'}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-xs text-red-400 font-mono">
            ✕ {error}
          </div>
        )}

        {/* Signals feed */}
        {loading && signals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-12 h-12 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
            <p className="text-gray-500 text-sm font-mono mt-4">Scanning smart money positions...</p>
          </div>
        ) : signals.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-500 font-mono">No signals above confidence threshold.</p>
            <p className="text-gray-600 text-xs font-mono mt-1">Try lowering the minimum confidence filter.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {signals.map((signal, i) => (
              <SignalCard key={`${signal.market.conditionId}-${i}`} signal={signal} index={i} />
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-800/30 flex items-center justify-between">
          <div className="text-[10px] font-mono text-gray-600">
            {meta?.engine || 'Prescience Signals v1.0'} — {meta?.total_signals || 0} signals generated
          </div>
          {lastUpdate && (
            <div className="text-[10px] font-mono text-gray-600">
              Updated {lastUpdate.toLocaleTimeString()}
            </div>
          )}
        </div>

        {/* Disclaimer */}
        <div className="mt-4 text-[9px] font-mono text-gray-700 text-center leading-relaxed">
          Not financial advice. Signals reflect on-chain behavior patterns, not guaranteed outcomes.
          <br />Built by Epistemic Observatory. See who sees first.
        </div>
      </div>
    </div>
  );
}
