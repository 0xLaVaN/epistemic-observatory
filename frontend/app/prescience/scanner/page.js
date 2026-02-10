'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = 'https://epistemic-observatory.vercel.app';

const RISK_COLORS = {
  HIGH: '#ff3366',
  MEDIUM: '#f0a000',
  LOW: '#00ff88',
};

function AnimatedNumber({ value, duration = 800 }) {
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
      setDisplay(Math.round(target * eased));
      if (progress < 1) ref.current = requestAnimationFrame(animate);
    };
    ref.current = requestAnimationFrame(animate);
    return () => ref.current && cancelAnimationFrame(ref.current);
  }, [value, duration]);
  return <>{display.toLocaleString()}</>;
}

function SignalBar({ label, value, max = 100, color }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 text-gray-400 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
      <span className="w-10 text-right font-mono" style={{ color }}>{Math.round(value)}</span>
    </div>
  );
}

function MarketCard({ data, index }) {
  const [expanded, setExpanded] = useState(false);
  const risk = data.riskLevel;
  const color = RISK_COLORS[risk] || '#00ff88';
  const signals = data.signals;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="border border-gray-800 rounded-lg p-4 hover:border-gray-600 transition-all cursor-pointer"
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-100 leading-tight line-clamp-2">
            {data.market.question}
          </h3>
          <div className="flex gap-3 mt-1.5 text-xs text-gray-500">
            <span>Vol: ${(data.market.volumeTotal || 0).toLocaleString()}</span>
            <span>24h: ${(data.market.volume24hr || 0).toLocaleString()}</span>
            <span>{signals.total_wallets} wallets</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div
            className="text-2xl font-bold font-mono"
            style={{ color }}
          >
            <AnimatedNumber value={data.suspicion} />
          </div>
          <div className="text-[10px] font-medium tracking-wider" style={{ color }}>
            {risk}
          </div>
        </div>
      </div>

      {/* Current prices */}
      {data.market.currentPrices && Object.keys(data.market.currentPrices).length > 0 && (
        <div className="flex gap-2 mb-3">
          {Object.entries(data.market.currentPrices).map(([outcome, price]) => (
            <div key={outcome} className="bg-gray-900 rounded px-2 py-1 text-xs">
              <span className="text-gray-400">{outcome}: </span>
              <span className="text-gray-200 font-mono">{(price * 100).toFixed(0)}¢</span>
            </div>
          ))}
        </div>
      )}

      {/* Signal summary */}
      <div className="space-y-1.5">
        <SignalBar
          label="Whale consensus"
          value={signals.whale_consensus.strength * 100}
          color={signals.whale_consensus.strength > 0.75 ? '#ff3366' : signals.whale_consensus.strength > 0.6 ? '#f0a000' : '#00ff88'}
        />
        <SignalBar
          label="Fresh wallets"
          value={signals.fresh_wallet_surge.pct_of_total}
          max={50}
          color={signals.fresh_wallet_surge.pct_of_total > 30 ? '#ff3366' : signals.fresh_wallet_surge.pct_of_total > 15 ? '#f0a000' : '#00ff88'}
        />
        <SignalBar
          label="Flow imbalance"
          value={signals.flow_imbalance.magnitude * 100}
          color={signals.flow_imbalance.magnitude > 0.6 ? '#ff3366' : signals.flow_imbalance.magnitude > 0.3 ? '#f0a000' : '#00ff88'}
        />
      </div>

      {/* Whale consensus callout */}
      {signals.whale_consensus.strength > 0.6 && (
        <div className="mt-3 p-2 bg-gray-900/50 rounded text-xs">
          <span className="text-gray-400">🐋 {signals.whale_consensus.whale_count} whales aligned on </span>
          <span className="font-medium" style={{ color }}>
            {signals.whale_consensus.dominant_outcome}
          </span>
          <span className="text-gray-400"> ({Math.round(signals.whale_consensus.strength * 100)}% consensus)</span>
          {signals.flow_imbalance.direction !== 'NEUTRAL' && (
            <span className="text-gray-400"> · Flow: {signals.flow_imbalance.direction}</span>
          )}
        </div>
      )}

      {/* Expanded: whale details */}
      <AnimatePresence>
        {expanded && data.top_whales && data.top_whales.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-gray-800">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Top Whales</div>
              <div className="space-y-1">
                {data.top_whales.map((w, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-gray-500">
                      {w.address.slice(0, 6)}...{w.address.slice(-4)}
                    </span>
                    <span className="text-gray-400">${w.volume_usd.toLocaleString()}</span>
                    <span className={w.bias === 'BUY' ? 'text-green-400' : 'text-red-400'}>
                      {w.bias}
                    </span>
                    <span className="text-gray-500">→ {w.dominant_outcome}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-2 text-xs">
              <a
                href={`/prescience?market=${data.market.conditionId}`}
                className="text-cyan-400 hover:underline"
                onClick={e => e.stopPropagation()}
              >
                Full market analysis →
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function ScannerPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchData = async () => {
    try {
      const res = await fetch(`${API_BASE}/prescience/scanner?limit=15`);
      if (!res.ok) throw new Error(`API ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const highRisk = data?.scanner?.filter(m => m.riskLevel === 'HIGH') || [];
  const medRisk = data?.scanner?.filter(m => m.riskLevel === 'MEDIUM') || [];
  const lowRisk = data?.scanner?.filter(m => m.riskLevel === 'LOW') || [];

  return (
    <div className="min-h-screen bg-black text-gray-100">
      {/* Header */}
      <div className="border-b border-gray-800 bg-black/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <a href="/prescience" className="text-gray-500 hover:text-gray-300 text-sm">← Dashboard</a>
                <h1 className="text-lg font-bold tracking-tight">
                  <span className="text-cyan-400">PRESCIENCE</span>
                  <span className="text-gray-500 font-normal ml-2">Live Scanner</span>
                </h1>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Real-time whale & insider detection on active Polymarket markets
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`text-xs px-3 py-1.5 rounded border transition-all ${
                  autoRefresh
                    ? 'border-cyan-800 text-cyan-400 bg-cyan-950/30'
                    : 'border-gray-700 text-gray-500'
                }`}
              >
                {autoRefresh ? '● LIVE' : '○ Paused'}
              </button>
              <button
                onClick={() => { setLoading(true); fetchData(); }}
                className="text-xs px-3 py-1.5 rounded border border-gray-700 text-gray-400 hover:text-gray-200 transition-all"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Stats bar */}
        {data && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold font-mono text-gray-100">
                <AnimatedNumber value={data.meta.markets_scanned} />
              </div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Markets Scanned</div>
            </div>
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold font-mono" style={{ color: RISK_COLORS.HIGH }}>
                <AnimatedNumber value={highRisk.length} />
              </div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">High Risk</div>
            </div>
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold font-mono" style={{ color: RISK_COLORS.MEDIUM }}>
                <AnimatedNumber value={medRisk.length} />
              </div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Medium Risk</div>
            </div>
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold font-mono text-gray-400">
                {lastUpdate ? lastUpdate.toLocaleTimeString() : '—'}
              </div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Last Scan</div>
            </div>
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="text-cyan-400 text-lg mb-2">Scanning markets...</div>
              <div className="text-gray-500 text-sm">Analyzing whale activity across active Polymarket markets</div>
            </div>
          </div>
        )}

        {error && (
          <div className="text-center py-10">
            <div className="text-red-400 mb-2">Scanner Error</div>
            <div className="text-gray-500 text-sm">{error}</div>
          </div>
        )}

        {data && (
          <div className="space-y-3">
            {data.scanner.map((market, i) => (
              <MarketCard key={market.market.conditionId} data={market} index={i} />
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-800 text-center text-xs text-gray-600">
          <div>Prescience Scanner v1.0 · Epistemic Observatory</div>
          <div className="mt-1">Data: Polymarket Gamma + Data APIs · Not financial advice</div>
        </div>
      </div>
    </div>
  );
}
