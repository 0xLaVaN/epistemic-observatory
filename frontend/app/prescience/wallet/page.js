'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = 'https://epistemic-observatory.vercel.app';

const RISK_COLORS = {
  CRITICAL: '#ff0044',
  HIGH: '#ff3366',
  MEDIUM: '#ffab40',
  LOW: '#00f0ff',
};

// ─── EXTERNAL LINK ICON ────────────────────────────────────────────
function ExtLink({ href, children, className = '' }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 hover:underline ${className}`}>
      {children}
      <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" opacity="0.5"><path d="M3.5 1.5v1h4.793L1.146 9.646l.708.708L9 3.207V8h1V1.5z"/></svg>
    </a>
  );
}

// ─── COPY BUTTON ───────────────────────────────────────────────────
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} title="Copy address" style={{ cursor: 'pointer', background: 'none', border: 'none', color: copied ? '#00ff88' : '#555', fontSize: 12, padding: '2px 4px' }}>
      {copied ? '✓' : '⧉'}
    </button>
  );
}

// ─── WATCH LIST (localStorage) ─────────────────────────────────────
function useWatchList() {
  const [list, setList] = useState([]);
  useEffect(() => {
    try { setList(JSON.parse(localStorage.getItem('prescience_watchlist') || '[]')); } catch {}
  }, []);
  const toggle = (addr) => {
    const next = list.includes(addr) ? list.filter(a => a !== addr) : [...list, addr];
    setList(next);
    localStorage.setItem('prescience_watchlist', JSON.stringify(next));
  };
  return { list, toggle, has: (a) => list.includes(a) };
}

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

// ─── ALERT THRESHOLD INDICATOR ─────────────────────────────────────
function ThresholdBadge({ score }) {
  if (score >= 90) return <span style={{ background: '#ff004422', border: '1px solid #ff0044', color: '#ff0044', fontSize: 9, padding: '2px 6px', borderRadius: 4, letterSpacing: 1, fontWeight: 700 }}>⚠ EXTREME</span>;
  if (score >= 80) return <span style={{ background: '#ff336622', border: '1px solid #ff3366', color: '#ff3366', fontSize: 9, padding: '2px 6px', borderRadius: 4, letterSpacing: 1, fontWeight: 700 }}>HIGH ALERT</span>;
  if (score >= 70) return <span style={{ background: '#ffab4022', border: '1px solid #ffab40', color: '#ffab40', fontSize: 9, padding: '2px 6px', borderRadius: 4, letterSpacing: 1, fontWeight: 700 }}>ELEVATED</span>;
  return null;
}

// ─── SIGNAL STRENGTH INDICATOR ─────────────────────────────────────
function TopSignal({ breakdown }) {
  if (!breakdown) return null;
  const signals = Object.entries(breakdown).map(([key, val]) => ({ key, score: val.score, weight: val.weight }));
  signals.sort((a, b) => (b.score * b.weight) - (a.score * a.weight));
  const top = signals[0];
  if (!top) return null;
  const label = top.key.replace(/_/g, ' ');
  return (
    <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
      Top signal: <span style={{ color: '#00f0ff', fontWeight: 600 }}>{label}</span> ({top.score}/100 × {Math.round(top.weight * 100)}%)
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

// ─── SKELETON LOADING ──────────────────────────────────────────────
function Skeleton({ width = '100%', height = 16 }) {
  return (
    <div style={{ width, height, background: 'linear-gradient(90deg, #1a1a2e 25%, #222240 50%, #1a1a2e 75%)', backgroundSize: '200% 100%', borderRadius: 4, animation: 'shimmer 1.5s infinite' }}>
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}

export default function WalletPage() {
  const [address, setAddress] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const watchList = useWatchList();

  // Read address from URL params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const addr = params.get('address');
    if (addr) {
      setAddress(addr);
      // Auto-scan
      (async () => {
        setLoading(true);
        setError(null);
        try {
          const res = await fetch(`${API_BASE}/prescience/${addr.trim()}`);
          if (!res.ok) throw new Error(`API ${res.status}`);
          setData(await res.json());
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      })();
    }
  }, []);

  const lookup = async (e) => {
    e?.preventDefault();
    if (!address.trim()) return;
    setLoading(true);
    setError(null);
    // Update URL for shareability
    const url = new URL(window.location);
    url.searchParams.set('address', address.trim());
    window.history.replaceState({}, '', url);
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

  const shareUrl = data?.address ? `${window.location.origin}/prescience/wallet?address=${data.address}` : null;
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

        {/* Watch List Quick Access */}
        {watchList.list.length > 0 && (
          <div style={{ marginTop: 16, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#555', letterSpacing: 1, textTransform: 'uppercase' }}>Watched:</span>
            {watchList.list.map(addr => (
              <button
                key={addr}
                onClick={() => { setAddress(addr); }}
                style={{ background: '#0a0a1a', border: '1px solid #222', color: '#00f0ff', padding: '4px 8px', borderRadius: 6, fontSize: 10, fontFamily: 'monospace', cursor: 'pointer' }}
              >
                {addr.slice(0, 6)}...{addr.slice(-4)}
              </button>
            ))}
          </div>
        )}

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
            ⚠ {error}. Please check the address and try again.
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !data && (
          <div style={{ padding: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}><Skeleton width={180} height={180} /></div>
            <Skeleton width="60%" height={12} />
            <div style={{ marginTop: 12 }}><Skeleton height={8} /></div>
            <div style={{ marginTop: 12 }}><Skeleton height={8} /></div>
            <div style={{ marginTop: 12 }}><Skeleton height={8} /></div>
          </div>
        )}

        <AnimatePresence>
          {data && !data.message && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {/* Score */}
              <div style={{ background: '#0a0a1a', border: '1px solid #1a1a2e', borderRadius: 12, padding: 32, marginBottom: 24, textAlign: 'center' }}>
                <ScoreGauge score={data.score} riskLevel={data.riskLevel} />
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}>
                  <ThresholdBadge score={data.score} />
                </div>
                <div style={{ marginTop: 12, fontSize: 11, color: '#555' }}>
                  {data.tradeCount} trades analyzed · {data.confidence} confidence
                </div>
                <TopSignal breakdown={data.breakdown} />
                <div style={{ fontSize: 11, color: '#333', fontFamily: 'monospace', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  {data.address}
                  <CopyButton text={data.address} />
                  <button
                    onClick={() => watchList.toggle(data.address)}
                    title={watchList.has(data.address) ? 'Remove from watch list' : 'Watch this wallet'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: watchList.has(data.address) ? '#f0a000' : '#333' }}
                  >
                    {watchList.has(data.address) ? '★' : '☆'}
                  </button>
                </div>

                {/* External links */}
                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center', gap: 16 }}>
                  <ExtLink href={`https://polygonscan.com/address/${data.address}`} className="" style={{ fontSize: 11, color: '#00f0ff88' }}>
                    <span style={{ fontSize: 11, color: '#00f0ff88' }}>Polygonscan</span>
                  </ExtLink>
                  <ExtLink href={`https://polymarket.com/profile/${data.address}`}>
                    <span style={{ fontSize: 11, color: '#00f0ff88' }}>Polymarket Profile</span>
                  </ExtLink>
                </div>

                {/* Share button */}
                {shareUrl && (
                  <div style={{ marginTop: 12 }}>
                    <button
                      onClick={() => { navigator.clipboard.writeText(shareUrl); }}
                      style={{ background: '#111', border: '1px solid #222', color: '#555', padding: '6px 12px', borderRadius: 6, fontSize: 10, cursor: 'pointer', letterSpacing: 1 }}
                    >
                      📋 COPY SHARE LINK
                    </button>
                  </div>
                )}
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
