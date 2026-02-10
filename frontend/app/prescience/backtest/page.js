'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = 'https://epistemic-observatory.vercel.app';

const BUCKET_COLORS = {
  high: '#ff3366',
  mid: '#ffab40',
  low: '#00f0ff',
};

const BUCKET_LABELS = {
  high: 'High Suspicion (67-100)',
  mid: 'Medium (34-66)',
  low: 'Low (0-33)',
};

const VERDICT_STYLES = {
  STRONG_SIGNAL: { color: '#00ff88', label: 'STRONG SIGNAL', icon: '◆' },
  MODERATE_SIGNAL: { color: '#ffab40', label: 'MODERATE SIGNAL', icon: '◇' },
  WEAK_SIGNAL: { color: '#ff6e40', label: 'WEAK SIGNAL', icon: '○' },
  NO_SIGNAL: { color: '#ff3366', label: 'NO SIGNAL', icon: '✕' },
  INSUFFICIENT_DATA: { color: '#666', label: 'INSUFFICIENT DATA', icon: '—' },
};

function Bar({ value, max, color, label, count }) {
  const width = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#888', marginBottom: 4 }}>
        <span style={{ color }}>{label}</span>
        <span>{value !== null ? `${value}%` : 'n/a'} <span style={{ color: '#555' }}>n={count}</span></span>
      </div>
      <div style={{ background: '#1a1a2e', borderRadius: 4, height: 24, overflow: 'hidden', border: '1px solid #222' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${width}%` }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          style={{ height: '100%', background: `linear-gradient(90deg, ${color}22, ${color})`, borderRadius: 4 }}
        />
      </div>
    </div>
  );
}

function MarketRow({ market, index }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      style={{
        background: '#0a0a1a',
        border: '1px solid #1a1a2e',
        borderRadius: 8,
        padding: 16,
        marginBottom: 8,
        cursor: 'pointer',
      }}
      onClick={() => setExpanded(!expanded)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ flex: 1, fontSize: 13, color: '#ccc' }}>{market.question}</div>
        <div style={{ fontSize: 11, color: '#00ff88', marginLeft: 12, whiteSpace: 'nowrap' }}>
          ✓ {market.winningOutcome}
        </div>
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden', marginTop: 12 }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {['high', 'mid', 'low'].map(bucket => (
                <div key={bucket} style={{ background: '#111', borderRadius: 6, padding: 10, textAlign: 'center', border: `1px solid ${BUCKET_COLORS[bucket]}33` }}>
                  <div style={{ fontSize: 10, color: BUCKET_COLORS[bucket], textTransform: 'uppercase', letterSpacing: 1 }}>{bucket}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: BUCKET_COLORS[bucket], marginTop: 4 }}>{market.buckets[bucket]}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: '#555', marginTop: 8 }}>{market.traders} traders analyzed</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function BacktestPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [marketCount, setMarketCount] = useState(10);

  const runBacktest = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/prescience/backtest?markets=${marketCount}`);
      if (!res.ok) throw new Error(`API ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { runBacktest(); }, []);

  const verdict = data?.summary?.verdict ? VERDICT_STYLES[data.summary.verdict] : null;
  const maxAcc = data?.buckets ? Math.max(
    data.buckets.high?.accuracy || 0,
    data.buckets.mid?.accuracy || 0,
    data.buckets.low?.accuracy || 0,
    100
  ) : 100;

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#fff', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {/* Scan lines effect */}
      <div style={{ position: 'fixed', inset: 0, background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,240,255,0.015) 2px, rgba(0,240,255,0.015) 4px)', pointerEvents: 'none', zIndex: 1 }} />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px', position: 'relative', zIndex: 2 }}>
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <div style={{ fontSize: 10, letterSpacing: 4, color: '#00f0ff', textTransform: 'uppercase', marginBottom: 4 }}>Prescience</div>
          <h1 style={{ fontSize: 32, fontWeight: 200, margin: 0, letterSpacing: -1 }}>
            Model Validation
          </h1>
          <p style={{ color: '#555', fontSize: 13, marginTop: 8, fontStyle: 'italic' }}>
            "Trust, but verify." — Do high-score wallets actually predict outcomes?
          </p>
        </motion.div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 24, marginBottom: 32 }}>
          <select
            value={marketCount}
            onChange={e => setMarketCount(parseInt(e.target.value))}
            style={{ background: '#0a0a1a', border: '1px solid #222', color: '#fff', padding: '8px 12px', borderRadius: 6, fontSize: 13 }}
          >
            {[5, 10, 15, 20, 25, 30].map(n => (
              <option key={n} value={n}>{n} markets</option>
            ))}
          </select>
          <button
            onClick={runBacktest}
            disabled={loading}
            style={{
              background: loading ? '#111' : 'linear-gradient(135deg, #00f0ff22, #ff336622)',
              border: '1px solid #00f0ff44',
              color: '#00f0ff',
              padding: '8px 20px',
              borderRadius: 6,
              cursor: loading ? 'wait' : 'pointer',
              fontSize: 13,
              letterSpacing: 1,
            }}
          >
            {loading ? 'RUNNING...' : 'RUN BACKTEST'}
          </button>
        </div>

        {error && (
          <div style={{ background: '#1a0000', border: '1px solid #ff3366', borderRadius: 8, padding: 16, marginBottom: 24, color: '#ff3366', fontSize: 13 }}>
            {error}
          </div>
        )}

        {loading && !data && (
          <motion.div
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
            style={{ textAlign: 'center', padding: 60, color: '#00f0ff', fontSize: 14 }}
          >
            Analyzing resolved markets...
          </motion.div>
        )}

        {data && (
          <>
            {/* Verdict Card */}
            {verdict && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{
                  background: `linear-gradient(135deg, ${verdict.color}08, ${verdict.color}15)`,
                  border: `1px solid ${verdict.color}44`,
                  borderRadius: 12,
                  padding: 24,
                  marginBottom: 32,
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 36, marginBottom: 8 }}>{verdict.icon}</div>
                <div style={{ fontSize: 22, fontWeight: 600, color: verdict.color, letterSpacing: 2 }}>
                  {verdict.label}
                </div>
                {data.summary.lift_pct !== null && (
                  <div style={{ fontSize: 42, fontWeight: 200, color: '#fff', margin: '12px 0' }}>
                    +{data.summary.lift_pct}%
                    <span style={{ fontSize: 14, color: '#666', marginLeft: 8 }}>lift</span>
                  </div>
                )}
                <div style={{ fontSize: 13, color: '#888', maxWidth: 500, margin: '0 auto' }}>
                  {data.summary.thesis}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginTop: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>Markets</div>
                    <div style={{ fontSize: 18, fontWeight: 600 }}>{data.summary.markets_analyzed}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>Traders</div>
                    <div style={{ fontSize: 18, fontWeight: 600 }}>{data.summary.total_traders}</div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Accuracy Bars */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              style={{ background: '#0a0a1a', border: '1px solid #1a1a2e', borderRadius: 12, padding: 24, marginBottom: 32 }}
            >
              <h3 style={{ fontSize: 14, fontWeight: 400, color: '#666', marginTop: 0, letterSpacing: 2, textTransform: 'uppercase' }}>
                Accuracy by Score Bucket
              </h3>
              <p style={{ fontSize: 11, color: '#444', marginBottom: 20 }}>
                % of wallets in each bucket that bought the winning outcome
              </p>
              {['high', 'mid', 'low'].map(bucket => (
                <Bar
                  key={bucket}
                  value={data.buckets[bucket]?.accuracy}
                  max={maxAcc}
                  color={BUCKET_COLORS[bucket]}
                  label={BUCKET_LABELS[bucket]}
                  count={data.buckets[bucket]?.total || 0}
                />
              ))}
            </motion.div>

            {/* Market Breakdown */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
              <h3 style={{ fontSize: 14, fontWeight: 400, color: '#666', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>
                Market-by-Market Results
              </h3>
              <p style={{ fontSize: 11, color: '#444', marginBottom: 16 }}>
                Click to expand. Shows accuracy per score bucket for each resolved market.
              </p>
              {data.markets?.map((m, i) => (
                <MarketRow key={i} market={m} index={i} />
              ))}
            </motion.div>

            {/* Methodology */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              style={{ marginTop: 32, padding: 20, background: '#050510', border: '1px solid #111', borderRadius: 8 }}
            >
              <h4 style={{ fontSize: 12, color: '#333', margin: '0 0 8px', letterSpacing: 2, textTransform: 'uppercase' }}>Methodology</h4>
              <p style={{ fontSize: 11, color: '#444', lineHeight: 1.6, margin: 0 }}>
                {data.meta?.methodology}
              </p>
              <p style={{ fontSize: 10, color: '#333', marginTop: 8, fontStyle: 'italic' }}>
                {data.meta?.caveat}
              </p>
            </motion.div>
          </>
        )}

        {/* Footer */}
        <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #111', display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#333' }}>
          <span>Prescience by Epistemic Observatory</span>
          <span>See who sees first.</span>
        </div>
      </div>
    </div>
  );
}
