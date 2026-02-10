'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = 'https://epistemic-observatory.vercel.app';

const RISK_COLORS = {
  CRITICAL: '#ff0044',
  HIGH: '#ff3366',
  MEDIUM: '#ffab40',
  LOW: '#00f0ff',
};

function ScoreGauge({ score, riskLevel }) {
  const color = RISK_COLORS[riskLevel] || '#00f0ff';
  const circumference = 2 * Math.PI * 70;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: 180, height: 180, margin: '0 auto' }}>
      <svg width="180" height="180" viewBox="0 0 180 180">
        <circle cx="90" cy="90" r="70" fill="none" stroke="#1a1a2e" strokeWidth="6" />
        <motion.circle
          cx="90" cy="90" r="70" fill="none" stroke={color} strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
          transform="rotate(-90 90 90)"
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 }}
          style={{ fontSize: 42, fontWeight: 200, color }}
        >
          {score}
        </motion.div>
        <div style={{ fontSize: 10, letterSpacing: 2, color: '#555', textTransform: 'uppercase' }}>
          {riskLevel}
        </div>
      </div>
    </div>
  );
}

function BreakdownBar({ label, score, detail, weight }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
        <span style={{ color: '#888' }}>{label} <span style={{ color: '#333' }}>({Math.round(weight * 100)}%)</span></span>
        <span style={{ color: '#ccc' }}>{score}/100 <span style={{ color: '#555' }}>{detail}</span></span>
      </div>
      <div style={{ background: '#1a1a2e', borderRadius: 3, height: 8, overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.8 }}
          style={{
            height: '100%',
            borderRadius: 3,
            background: score >= 70 ? '#ff3366' : score >= 40 ? '#ffab40' : '#00f0ff',
          }}
        />
      </div>
    </div>
  );
}

export default function WalletPage() {
  const [address, setAddress] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const lookup = async (e) => {
    e?.preventDefault();
    if (!address.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/prescience/${address.trim()}`);
      if (!res.ok) throw new Error(`API ${res.status}`);
      setData(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const bd = data?.breakdown;

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#fff', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <div style={{ position: 'fixed', inset: 0, background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,240,255,0.015) 2px, rgba(0,240,255,0.015) 4px)', pointerEvents: 'none', zIndex: 1 }} />

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '40px 20px', position: 'relative', zIndex: 2 }}>
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <div style={{ fontSize: 10, letterSpacing: 4, color: '#00f0ff', textTransform: 'uppercase', marginBottom: 4 }}>Prescience</div>
          <h1 style={{ fontSize: 32, fontWeight: 200, margin: 0, letterSpacing: -1 }}>Wallet Scanner</h1>
          <p style={{ color: '#555', fontSize: 13, marginTop: 8 }}>
            Enter a Polymarket wallet address to compute its insider probability score.
          </p>
        </motion.div>

        <form onSubmit={lookup} style={{ display: 'flex', gap: 8, marginTop: 24, marginBottom: 32 }}>
          <input
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="0x..."
            style={{
              flex: 1,
              background: '#0a0a1a',
              border: '1px solid #222',
              color: '#fff',
              padding: '12px 16px',
              borderRadius: 8,
              fontSize: 14,
              fontFamily: 'monospace',
            }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              background: 'linear-gradient(135deg, #00f0ff22, #ff336622)',
              border: '1px solid #00f0ff44',
              color: '#00f0ff',
              padding: '12px 24px',
              borderRadius: 8,
              cursor: loading ? 'wait' : 'pointer',
              fontSize: 13,
              letterSpacing: 1,
            }}
          >
            {loading ? '...' : 'SCAN'}
          </button>
        </form>

        {error && (
          <div style={{ background: '#1a0000', border: '1px solid #ff3366', borderRadius: 8, padding: 16, color: '#ff3366', fontSize: 13 }}>
            {error}
          </div>
        )}

        <AnimatePresence>
          {data && !data.message && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {/* Score */}
              <div style={{ background: '#0a0a1a', border: '1px solid #1a1a2e', borderRadius: 12, padding: 32, marginBottom: 24, textAlign: 'center' }}>
                <ScoreGauge score={data.score} riskLevel={data.riskLevel} />
                <div style={{ marginTop: 16, fontSize: 11, color: '#555' }}>
                  {data.tradeCount} trades analyzed · {data.confidence} confidence
                </div>
                <div style={{ fontSize: 11, color: '#333', fontFamily: 'monospace', marginTop: 8 }}>
                  {data.address}
                </div>
              </div>

              {/* Breakdown */}
              {bd && (
                <div style={{ background: '#0a0a1a', border: '1px solid #1a1a2e', borderRadius: 12, padding: 24, marginBottom: 24 }}>
                  <h3 style={{ fontSize: 12, color: '#666', margin: '0 0 16px', letterSpacing: 2, textTransform: 'uppercase' }}>Signal Breakdown</h3>
                  <BreakdownBar label="Timing" score={bd.timing?.score || 0} detail={`${bd.timing?.samples || 0} samples`} weight={bd.timing?.weight || 0.25} />
                  <BreakdownBar label="Win Rate" score={bd.win_rate?.score || 0} detail={`${bd.win_rate?.wins || 0}W/${bd.win_rate?.losses || 0}L`} weight={bd.win_rate?.weight || 0.25} />
                  <BreakdownBar label="Bet Size" score={bd.avg_bet_size?.score || 0} detail={`$${bd.avg_bet_size?.usd || 0} avg`} weight={bd.avg_bet_size?.weight || 0.15} />
                  <BreakdownBar label="Wallet Age" score={bd.wallet_age?.score || 0} detail={`${bd.wallet_age?.days || '?'}d`} weight={bd.wallet_age?.weight || 0.15} />
                  <BreakdownBar label="Concentration" score={bd.concentration?.score || 0} detail={`${bd.concentration?.unique_markets || 0} markets`} weight={bd.concentration?.weight || 0.10} />
                  <BreakdownBar label="Volume" score={bd.volume?.score || 0} detail={`$${bd.volume?.total_usd || 0}`} weight={bd.volume?.weight || 0.10} />
                </div>
              )}
            </motion.div>
          )}

          {data?.message && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: 'center', padding: 40, color: '#555' }}>
              {data.message}
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #111', display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#333' }}>
          <span>Prescience by Epistemic Observatory</span>
          <span>See who sees first.</span>
        </div>
      </div>
    </div>
  );
}
