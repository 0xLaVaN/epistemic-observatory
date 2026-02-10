'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = 'https://epistemic-observatory.vercel.app';

// ─── THEME ─────────────────────────────────────────────────────────
const RISK_COLORS = {
  CRITICAL: '#ff3366',
  HIGH: '#f0a000',
  MEDIUM: '#00f0ff',
  LOW: '#00ff88',
};

const THREAT_CONFIG = {
  SEVERE: { color: '#ff3366', bg: 'from-red-900/30', pulse: 0.6, label: 'SEVERE' },
  HIGH: { color: '#f0a000', bg: 'from-amber-900/30', pulse: 1.2, label: 'HIGH' },
  ELEVATED: { color: '#f0a000', bg: 'from-amber-900/20', pulse: 1.8, label: 'ELEVATED' },
  MODERATE: { color: '#00f0ff', bg: 'from-cyan-900/20', pulse: 2.5, label: 'MODERATE' },
  GUARDED: { color: '#00f0ff', bg: 'from-cyan-900/10', pulse: 3, label: 'GUARDED' },
  LOW: { color: '#00ff88', bg: 'from-green-900/10', pulse: 4, label: 'LOW' },
};

// ─── ANIMATED COUNTER ──────────────────────────────────────────────
function AnimatedNumber({ value, duration = 1200 }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(null);
  
  useEffect(() => {
    if (value == null) return;
    const target = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(target)) { setDisplay(value); return; }
    
    const start = performance.now();
    const from = 0;
    const animate = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (target - from) * eased));
      if (progress < 1) ref.current = requestAnimationFrame(animate);
    };
    ref.current = requestAnimationFrame(animate);
    return () => ref.current && cancelAnimationFrame(ref.current);
  }, [value, duration]);
  
  return <>{typeof display === 'number' ? display.toLocaleString() : display}</>;
}

// ─── PARTICLE CANVAS ───────────────────────────────────────────────
function ParticleField() {
  const canvasRef = useRef(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    let particles = [];
    
    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener('resize', resize);
    
    const W = () => canvas.offsetWidth;
    const H = () => canvas.offsetHeight;
    
    // Create particles
    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * 2000,
        y: Math.random() * 1000,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.5 + 0.1,
        color: Math.random() > 0.7 ? '#ff3366' : '#00f0ff',
      });
    }
    
    const draw = () => {
      ctx.clearRect(0, 0, W(), H());
      
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = W();
        if (p.x > W()) p.x = 0;
        if (p.y < 0) p.y = H();
        if (p.y > H()) p.y = 0;
        
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.opacity;
        ctx.fill();
      }
      
      // Draw connections
      ctx.globalAlpha = 0.05;
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            ctx.globalAlpha = 0.03 * (1 - dist / 150);
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
      
      animId = requestAnimationFrame(draw);
    };
    draw();
    
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);
  
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

// ─── THREAT HEXAGON ────────────────────────────────────────────────
function ThreatHexagon({ level, score }) {
  const config = THREAT_CONFIG[level] || THREAT_CONFIG.LOW;
  
  return (
    <div className="relative flex items-center justify-center">
      {/* Outer pulsing rings */}
      <div className="absolute w-56 h-56">
        <svg viewBox="0 0 200 200" className="w-full h-full animate-spin" style={{ animationDuration: '30s' }}>
          <circle cx="100" cy="100" r="95" fill="none" stroke={config.color} strokeWidth="0.5" strokeDasharray="8 12" opacity="0.3" />
        </svg>
      </div>
      <div className="absolute w-48 h-48">
        <svg viewBox="0 0 200 200" className="w-full h-full animate-spin" style={{ animationDuration: '20s', animationDirection: 'reverse' }}>
          <circle cx="100" cy="100" r="90" fill="none" stroke={config.color} strokeWidth="0.3" strokeDasharray="4 8" opacity="0.2" />
        </svg>
      </div>
      
      {/* Main hexagon */}
      <div className="relative w-40 h-40">
        <svg viewBox="0 0 200 200" className="w-full h-full">
          {/* Outer glow hexagon */}
          <polygon
            points="100,10 180,55 180,145 100,190 20,145 20,55"
            fill="none"
            stroke={config.color}
            strokeWidth="2"
            opacity="0.4"
            filter="url(#glow)"
          />
          {/* Inner fill */}
          <polygon
            points="100,10 180,55 180,145 100,190 20,145 20,55"
            fill={config.color}
            opacity="0.08"
          />
          {/* Pulsing inner */}
          <polygon
            points="100,30 165,65 165,135 100,170 35,135 35,65"
            fill="none"
            stroke={config.color}
            strokeWidth="1"
            opacity="0.3"
          >
            <animate attributeName="opacity" values="0.1;0.5;0.1" dur={`${config.pulse}s`} repeatCount="indefinite" />
          </polygon>
          
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
        </svg>
        
        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.div
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: config.pulse, repeat: Infinity }}
            className="text-4xl font-black tracking-wider"
            style={{ color: config.color, textShadow: `0 0 30px ${config.color}` }}
          >
            {score || '—'}
          </motion.div>
          <div className="text-[9px] tracking-[0.3em] mt-1" style={{ color: config.color, opacity: 0.7 }}>
            THREAT LEVEL
          </div>
          <motion.div
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: config.pulse, repeat: Infinity }}
            className="text-lg font-black tracking-[0.2em] mt-0.5"
            style={{ color: config.color }}
          >
            {config.label}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

// ─── SCORE GAUGE ───────────────────────────────────────────────────
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
          transition={{ duration: 1.2, ease: 'easeOut' }}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-black" style={{ color }}>{score}</span>
      </div>
    </div>
  );
}

// ─── RADAR CHART ───────────────────────────────────────────────────
function RadarChart({ breakdown, size = 200 }) {
  if (!breakdown) return null;
  
  const dimensions = [
    { key: 'wallet_age', label: 'AGE' },
    { key: 'avg_bet_size', label: 'BET SIZE' },
    { key: 'timing', label: 'TIMING' },
    { key: 'win_rate', label: 'WIN RATE' },
    { key: 'concentration', label: 'CONC.' },
    { key: 'volume', label: 'VOLUME' },
  ].filter(d => breakdown[d.key]);
  
  const n = dimensions.length;
  const cx = size / 2, cy = size / 2, r = size * 0.38;
  
  const getPoint = (i, val) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const dist = (val / 100) * r;
    return { x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist };
  };
  
  const dataPoints = dimensions.map((d, i) => getPoint(i, breakdown[d.key].score));
  const pathD = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
  
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full" style={{ maxWidth: size }}>
      {/* Grid rings */}
      {[0.25, 0.5, 0.75, 1].map(scale => (
        <polygon
          key={scale}
          points={dimensions.map((_, i) => {
            const p = getPoint(i, scale * 100);
            return `${p.x},${p.y}`;
          }).join(' ')}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="0.5"
        />
      ))}
      
      {/* Axis lines */}
      {dimensions.map((_, i) => {
        const p = getPoint(i, 100);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />;
      })}
      
      {/* Data polygon */}
      <motion.polygon
        points={dataPoints.map(p => `${p.x},${p.y}`).join(' ')}
        fill="rgba(255, 51, 102, 0.15)"
        stroke="#ff3366"
        strokeWidth="1.5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        style={{ filter: 'drop-shadow(0 0 4px rgba(255,51,102,0.4))' }}
      />
      
      {/* Data points */}
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="#ff3366" opacity="0.9">
          <animate attributeName="r" values="2.5;3.5;2.5" dur="2s" repeatCount="indefinite" />
        </circle>
      ))}
      
      {/* Labels */}
      {dimensions.map((d, i) => {
        const p = getPoint(i, 120);
        return (
          <text key={d.key} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
            fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="monospace"
          >
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}

// ─── BREAKDOWN BARS ────────────────────────────────────────────────
function BreakdownBar({ label, score, detail, weight }) {
  const color = score >= 75 ? '#ff3366' : score >= 50 ? '#f0a000' : score >= 25 ? '#00f0ff' : '#00ff88';
  return (
    <div className="mb-2.5">
      <div className="flex justify-between text-[9px] mb-1">
        <span className="text-white/50 uppercase tracking-wider">{label} <span className="text-white/20">({Math.round(weight * 100)}%)</span></span>
        <span className="font-bold" style={{ color }}>{score}</span>
      </div>
      <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}40` }}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
      {detail && <div className="text-[8px] text-white/20 mt-0.5">{detail}</div>}
    </div>
  );
}

// ─── COPY BUTTON ───────────────────────────────────────────────────
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={copy} title="Copy address" className={`text-[10px] px-1 transition-colors ${copied ? 'text-[#00ff88]' : 'text-white/20 hover:text-white/50'}`}>
      {copied ? '✓' : '⧉'}
    </button>
  );
}

// ─── EXTERNAL LINK ─────────────────────────────────────────────────
function ExtLink({ href, children, className = '' }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-0.5 ${className}`} onClick={e => e.stopPropagation()}>
      {children}
      <svg width="8" height="8" viewBox="0 0 12 12" fill="currentColor" opacity="0.4"><path d="M3.5 1.5v1h4.793L1.146 9.646l.708.708L9 3.207V8h1V1.5z"/></svg>
    </a>
  );
}

// ─── WATCH LIST ────────────────────────────────────────────────────
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

// ─── RISK BADGE ────────────────────────────────────────────────────
function RiskBadge({ level }) {
  const color = RISK_COLORS[level] || '#888';
  return (
    <span
      className="text-[8px] font-black px-2 py-0.5 rounded tracking-wider border"
      style={{ color, borderColor: `${color}50`, background: `${color}15`, textShadow: `0 0 8px ${color}60` }}
    >
      {level}
    </span>
  );
}

// ─── SECTION NAVIGATION ────────────────────────────────────────────
function NavBar({ active, onChange }) {
  const tabs = [
    { id: 'pulse', label: 'PULSE', icon: '◈' },
    { id: 'leaderboard', label: 'LEADERBOARD', icon: '◆' },
    { id: 'alerts', label: 'ALERTS', icon: '⚡' },
    { id: 'lookup', label: 'WALLET SCAN', icon: '⬡' },
    { id: 'news', label: 'NEWS', icon: '📡' },
    { id: 'scanner', label: 'SCANNER', icon: '⊛' },
    { id: 'signals', label: 'SIGNALS', icon: '◎', href: '/prescience/signals' },
    { id: 'backtest', label: 'BACKTEST', icon: '▣', href: '/prescience/backtest' },
    { id: 'markets', label: 'MARKETS', icon: '◇' },
  ];
  
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#0a0a0f]/80 border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <a href="/" className="text-white/20 hover:text-white/40 transition-colors text-xs mr-2">←</a>
            <div>
              <h1 className="text-lg font-black tracking-[0.15em]">
                <span className="text-[#ff3366]" style={{ textShadow: '0 0 20px rgba(255,51,102,0.5)' }}>PRESCIENCE</span>
              </h1>
            </div>
            <span className="text-[8px] text-white/20 tracking-widest hidden md:block">SEE WHO SEES FIRST</span>
          </div>
          
          {/* Tabs */}
          <div className="flex items-center gap-1">
            {tabs.map(tab => tab.href ? (
              <a
                key={tab.id}
                href={tab.href}
                className="relative text-[10px] px-3 py-2 rounded transition-all tracking-wider font-bold text-green-400/70 hover:text-green-400 hover:bg-green-500/10"
              >
                <span className="mr-1">{tab.icon}</span>
                <span className="hidden md:inline">{tab.label}</span>
              </a>
            ) : (
              <button
                key={tab.id}
                onClick={() => onChange(tab.id)}
                className={`relative text-[10px] px-3 py-2 rounded transition-all tracking-wider font-bold ${
                  active === tab.id
                    ? 'text-[#ff3366] bg-[#ff3366]/10'
                    : 'text-white/30 hover:text-white/60 hover:bg-white/5'
                }`}
              >
                <span className="mr-1">{tab.icon}</span>
                <span className="hidden md:inline">{tab.label}</span>
                {active === tab.id && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                    style={{ background: '#ff3366', boxShadow: '0 0 8px #ff3366' }}
                  />
                )}
              </button>
            ))}
          </div>
          
          {/* Status */}
          <div className="hidden md:flex items-center gap-2 text-[9px]">
            <span className="flex items-center gap-1.5 text-white/30">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff3366] opacity-50"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ff3366]"></span>
              </span>
              LIVE
            </span>
          </div>
        </div>
      </div>
    </nav>
  );
}

// ─── STAT CARD ─────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = '#00f0ff', large }) {
  return (
    <div className="relative group">
      <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: `radial-gradient(ellipse at center, ${color}08, transparent 70%)` }} />
      <div className="relative bg-white/[0.03] border border-white/[0.06] rounded-lg p-4 hover:border-white/10 transition-all">
        <div className="text-[9px] text-white/30 tracking-[0.2em] mb-2 uppercase">{label}</div>
        <div className={`font-black ${large ? 'text-3xl' : 'text-2xl'}`} style={{ color, textShadow: `0 0 20px ${color}40` }}>
          <AnimatedNumber value={value} />
        </div>
        {sub && <div className="text-[9px] text-white/20 mt-1">{sub}</div>}
      </div>
    </div>
  );
}

// ─── HOT MARKET ROW ────────────────────────────────────────────────
function HotMarketRow({ market, maxSus, onClick }) {
  const pct = maxSus > 0 ? (market.suspicious_wallets / maxSus) * 100 : 0;
  const color = pct > 60 ? '#ff3366' : pct > 30 ? '#f0a000' : '#00f0ff';
  
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      whileHover={{ x: 4 }}
      className="w-full text-left p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] border border-transparent hover:border-white/5 transition-all group"
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 text-right w-8">
          <span className="text-sm font-black" style={{ color }}>{market.suspicious_wallets}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-white/70 truncate group-hover:text-white/90 transition-colors">
            {market.question}
          </div>
          <div className="mt-1.5 w-full h-1 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}40` }}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, delay: 0.1 }}
            />
          </div>
        </div>
        <div className="text-[8px] text-white/20 flex-shrink-0">
          ${Math.round(market.volume || 0).toLocaleString()}
        </div>
      </div>
    </motion.button>
  );
}

// ─── ACTIVE MARKET ROW ─────────────────────────────────────────────
function ActiveMarketRow({ market }) {
  return (
    <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
      <div className="text-[11px] text-white/60 truncate mb-1">{market.question}</div>
      <div className="flex justify-between text-[9px] text-white/30">
        <span>24h: ${Math.round(market.volume24hr || 0).toLocaleString()}</span>
        <span>Total: ${Math.round(market.volumeTotal || 0).toLocaleString()}</span>
      </div>
    </div>
  );
}

// ─── PULSE SECTION ─────────────────────────────────────────────────
function PulseSection({ pulse, hotMarkets, activeMarkets, setView }) {
  if (!pulse) return (
    <div className="space-y-6 animate-pulse">
      <div className="h-64 rounded-2xl bg-white/[0.02] border border-white/5" />
      <div className="grid grid-cols-2 gap-4">
        <div className="h-20 rounded-lg bg-white/[0.02]" />
        <div className="h-20 rounded-lg bg-white/[0.02]" />
      </div>
    </div>
  );
  
  const maxSus = Math.max(...(hotMarkets || []).map(m => m.suspicious_wallets), 1);
  
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent">
        <ParticleField />
        <div className="relative z-10 py-12 px-8">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
            {/* Threat indicator */}
            <div className="flex-shrink-0">
              <ThreatHexagon level={pulse.threat_level} score={pulse.highest_score} />
            </div>
            
            {/* Stats grid */}
            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
              <StatCard label="Markets Scanned" value={pulse.markets_scanned} color="#00f0ff" />
              <StatCard label="Wallets Tracked" value={pulse.total_wallets} color="#00f0ff" />
              <StatCard label="Suspicious" value={pulse.suspicious_wallets} color="#ff3366" sub={`${pulse.suspicious_ratio}% of total`} />
              <StatCard label="Total Volume" value={`$${Math.round(pulse.total_volume_usd).toLocaleString()}`} color="#00ff88" />
            </div>
          </div>
          
          {/* Scrolling ticker */}
          <div className="mt-8 overflow-hidden border-t border-white/5 pt-4">
            <div className="flex animate-scroll-x gap-8 text-[10px] text-white/30">
              {(hotMarkets || []).concat(hotMarkets || []).map((m, i) => (
                <span key={i} className="whitespace-nowrap flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ff3366] inline-block" style={{ opacity: 0.5 + (m.suspicious_wallets / maxSus) * 0.5 }} />
                  <span className="text-white/50">{m.question}</span>
                  <span className="text-[#ff3366]">{m.suspicious_wallets} SUS</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {/* Hot Markets + Active Markets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hot markets */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-black tracking-[0.15em] text-white/50 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff3366] opacity-50"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ff3366]"></span>
              </span>
              HOT MARKETS — INSIDER ACTIVITY DETECTED
            </h2>
          </div>
          <div className="space-y-2">
            {(hotMarkets || []).map((m, i) => (
              <HotMarketRow key={m.conditionId || i} market={m} maxSus={maxSus} onClick={() => setView('markets')} />
            ))}
          </div>
        </div>
        
        {/* Active markets */}
        <div>
          <h2 className="text-xs font-black tracking-[0.15em] text-white/50 mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#00f0ff] opacity-50 inline-block" />
            ACTIVE HIGH-VOLUME MARKETS
          </h2>
          <div className="space-y-2">
            {(activeMarkets || []).map((m, i) => (
              <ActiveMarketRow key={m.conditionId || i} market={m} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── LEADERBOARD SECTION ───────────────────────────────────────────
function LeaderboardSection({ leaderboard }) {
  const [expandedWallet, setExpandedWallet] = useState(null);
  
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xs font-black tracking-[0.15em] text-white/50 flex items-center gap-2">
          <span className="text-[#ff3366]">◆</span>
          SUSPICIOUS WALLET LEADERBOARD
        </h2>
        <span className="text-[9px] text-white/20">{leaderboard.length} wallets ranked</span>
      </div>
      
      {/* Table header */}
      <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[9px] text-white/30 tracking-wider border-b border-white/5 mb-2">
        <div className="col-span-1">#</div>
        <div className="col-span-3">WALLET</div>
        <div className="col-span-1 text-center">SCORE</div>
        <div className="col-span-1 text-center">RISK</div>
        <div className="col-span-1 text-center">TRADES</div>
        <div className="col-span-2 text-center">TIMING</div>
        <div className="col-span-1 text-center">WIN %</div>
        <div className="col-span-2 text-center">CONFIDENCE</div>
      </div>
      
      <div className="space-y-1">
        {leaderboard.map((w, i) => {
          const addr = w.address || '';
          const short = addr ? `${addr.slice(0, 8)}...${addr.slice(-6)}` : 'unknown';
          const expanded = expandedWallet === addr;
          const scoreColor = w.score >= 75 ? '#ff3366' : w.score >= 50 ? '#f0a000' : '#00f0ff';
          const winRate = w.breakdown?.win_rate?.rate != null ? Math.round(w.breakdown.win_rate.rate * 100) : '—';
          
          return (
            <div key={addr + i}>
              <motion.button
                onClick={() => setExpandedWallet(expanded ? null : addr)}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className={`w-full grid grid-cols-12 gap-2 items-center px-4 py-3 rounded-lg transition-all text-left ${
                  expanded ? 'bg-white/[0.04] border border-white/10' : 'hover:bg-white/[0.02] border border-transparent'
                }`}
              >
                <div className="col-span-1 text-[10px] text-white/30 font-mono">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div className="col-span-3 text-[11px] font-mono text-white/60 flex items-center gap-1">
                  <ExtLink href={`https://polymarket.com/profile/${addr}`} className="text-white/60 hover:text-[#00f0ff] transition-colors">{short}</ExtLink>
                  <CopyButton text={addr} />
                </div>
                <div className="col-span-1 text-center">
                  <span className="text-sm font-black" style={{ color: scoreColor, textShadow: `0 0 10px ${scoreColor}40` }}>
                    {w.score}
                  </span>
                </div>
                <div className="col-span-1 text-center">
                  <RiskBadge level={w.riskLevel} />
                </div>
                <div className="col-span-1 text-center text-[10px] text-white/50">
                  {w.tradeCount || 0}
                </div>
                <div className="col-span-2 text-center">
                  <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ 
                      width: `${w.breakdown?.timing?.score || 0}%`, 
                      backgroundColor: scoreColor,
                      boxShadow: `0 0 4px ${scoreColor}` 
                    }} />
                  </div>
                </div>
                <div className="col-span-1 text-center text-[10px] font-bold" style={{ color: scoreColor }}>
                  {winRate}%
                </div>
                <div className="col-span-2 text-center text-[9px] text-white/30 uppercase">
                  {w.confidence || '—'}
                </div>
              </motion.button>
              
              {/* Expanded detail */}
              <AnimatePresence>
                {expanded && w.breakdown && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 py-4 ml-8 mr-4 mb-2 border-l-2 border-[#ff3366]/30">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <h4 className="text-[9px] text-white/30 tracking-widest mb-3">SIGNAL BREAKDOWN</h4>
                          {w.breakdown.wallet_age && (
                            <BreakdownBar label="Wallet Age" score={w.breakdown.wallet_age.score} weight={w.breakdown.wallet_age.weight} detail={`${w.breakdown.wallet_age.days}d old`} />
                          )}
                          {w.breakdown.avg_bet_size && (
                            <BreakdownBar label="Bet Size" score={w.breakdown.avg_bet_size.score} weight={w.breakdown.avg_bet_size.weight} detail={`avg $${w.breakdown.avg_bet_size.usd?.toFixed(2)}`} />
                          )}
                          {w.breakdown.timing && (
                            <BreakdownBar label="Timing" score={w.breakdown.timing.score} weight={w.breakdown.timing.weight} detail={`${w.breakdown.timing.samples} samples`} />
                          )}
                          {w.breakdown.win_rate && (
                            <BreakdownBar label="Win Rate" score={w.breakdown.win_rate.score} weight={w.breakdown.win_rate.weight} detail={`${w.breakdown.win_rate.wins}W / ${w.breakdown.win_rate.losses}L`} />
                          )}
                          {w.breakdown.concentration && (
                            <BreakdownBar label="Concentration" score={w.breakdown.concentration.score} weight={w.breakdown.concentration.weight} detail={`${w.breakdown.concentration.unique_markets} markets`} />
                          )}
                          {w.breakdown.volume && (
                            <BreakdownBar label="Volume" score={w.breakdown.volume.score} weight={w.breakdown.volume.weight} detail={`$${Math.round(w.breakdown.volume.total_usd).toLocaleString()}`} />
                          )}
                        </div>
                        <div className="flex flex-col items-center justify-center">
                          <h4 className="text-[9px] text-white/30 tracking-widest mb-3">SIGNAL RADAR</h4>
                          <RadarChart breakdown={w.breakdown} size={180} />
                        </div>
                      </div>
                      <div className="mt-3 flex gap-3">
                        <a
                          href={`https://polygonscan.com/address/${addr}`}
                          target="_blank"
                          rel="noopener"
                          className="text-[9px] text-[#00f0ff]/50 hover:text-[#00f0ff] transition-colors"
                        >
                          POLYGONSCAN →
                        </a>
                        <a
                          href={`https://polymarket.com/profile/${addr}`}
                          target="_blank"
                          rel="noopener"
                          className="text-[9px] text-[#00f0ff]/50 hover:text-[#00f0ff] transition-colors"
                        >
                          POLYMARKET PROFILE →
                        </a>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── ALERTS SECTION ────────────────────────────────────────────────
function AlertsSection({ alerts }) {
  const [lastUpdate, setLastUpdate] = useState(new Date());
  
  useEffect(() => {
    setLastUpdate(new Date());
  }, [alerts]);
  
  if (!alerts || alerts.length === 0) {
    return <div className="text-center py-20 text-white/30 text-sm">No alerts detected. Markets are clean.</div>;
  }
  
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xs font-black tracking-[0.15em] text-white/50 flex items-center gap-2">
          <span className="text-[#ff3366]">⚡</span>
          INSIDER ACTIVITY ALERTS
        </h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(alerts, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = `prescience-alerts-${new Date().toISOString().slice(0,10)}.json`;
              a.click(); URL.revokeObjectURL(url);
            }}
            className="text-[9px] text-white/20 hover:text-[#00f0ff] transition-colors border border-white/5 px-2 py-1 rounded"
          >
            ↓ EXPORT JSON
          </button>
          <span className="text-[9px] text-white/20">
            {alerts.length} alerts · Updated {lastUpdate.toLocaleTimeString()}
          </span>
        </div>
      </div>
      
      <div className="space-y-2">
        {alerts.map((alert, i) => {
          const scoreColor = alert.score >= 80 ? '#ff3366' : alert.score >= 60 ? '#f0a000' : '#00f0ff';
          return (
            <motion.div
              key={alert.address + alert.market?.id + i}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="relative rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all overflow-hidden group"
            >
              {/* Severity indicator line */}
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg" style={{ backgroundColor: scoreColor, boxShadow: `0 0 8px ${scoreColor}60` }} />
              
              <div className="flex items-center gap-4 p-4 pl-5">
                <ScoreGauge score={alert.score} size={48} />
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <ExtLink href={`https://polymarket.com/profile/${alert.address}`} className="text-[11px] font-mono text-white/70 hover:text-[#00f0ff] transition-colors">
                      {alert.address?.slice(0, 8)}...{alert.address?.slice(-6)}
                    </ExtLink>
                    <CopyButton text={alert.address} />
                    <RiskBadge level={alert.riskLevel} />
                  </div>
                  <div className="text-[10px] text-white/40 truncate">
                    {alert.market?.question}
                  </div>
                </div>
                
                <div className="flex-shrink-0 text-right">
                  <div className="text-[10px] text-white/50">
                    {alert.activity?.trades} trades · <span className="font-bold" style={{ color: scoreColor }}>${Math.round(alert.activity?.totalUSD || 0).toLocaleString()}</span>
                  </div>
                  <div className="text-[9px] text-white/25 mt-0.5">
                    {alert.activity?.side} {alert.activity?.outcome}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ─── WALLET LOOKUP SECTION ─────────────────────────────────────────
function WalletLookupSection() {
  const [address, setAddress] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const lookup = async () => {
    if (!address.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/prescience/${encodeURIComponent(address.trim())}`);
      const data = await res.json();
      if (data.error) setError(data.error);
      else setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-black tracking-[0.1em] text-white/80 mb-2">WALLET SCANNER</h2>
        <p className="text-[11px] text-white/30">Enter any Polymarket wallet address to analyze insider behavior signals</p>
      </div>
      
      {/* Search */}
      <div className="relative mb-8">
        <div className="flex gap-2 p-2 rounded-xl bg-white/[0.03] border border-white/10 focus-within:border-[#ff3366]/30 transition-colors">
          <input
            type="text"
            value={address}
            onChange={e => setAddress(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && lookup()}
            placeholder="0x..."
            className="flex-1 bg-transparent text-sm text-white/80 font-mono px-4 py-3 placeholder:text-white/15 focus:outline-none"
          />
          <button
            onClick={lookup}
            disabled={loading || !address.trim()}
            className="px-6 py-3 bg-[#ff3366]/10 border border-[#ff3366]/30 rounded-lg text-[11px] text-[#ff3366] font-black tracking-wider hover:bg-[#ff3366]/20 transition-all disabled:opacity-30"
          >
            {loading ? (
              <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="inline-block">⬡</motion.span>
            ) : 'SCAN'}
          </button>
        </div>
      </div>
      
      {error && (
        <div className="text-center p-4 rounded-lg bg-[#ff3366]/10 border border-[#ff3366]/20 text-[11px] text-[#ff3366]">
          {error}
        </div>
      )}
      
      {result && result.score != null && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Score hero */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8">
            <div className="flex flex-col md:flex-row items-center gap-8">
              <ScoreGauge score={result.score} size={120} />
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <ExtLink href={`https://polymarket.com/profile/${result.address || address}`} className="text-sm font-mono text-white/60 hover:text-[#00f0ff] transition-colors">
                    {result.address || address}
                  </ExtLink>
                  <CopyButton text={result.address || address} />
                  <RiskBadge level={result.riskLevel} />
                </div>
                <div className="text-[10px] text-white/30 space-y-1">
                  <div>{result.tradeCount} trades analyzed · {result.confidence} confidence</div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Breakdown + Radar */}
          {result.breakdown && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
                <h3 className="text-[9px] text-white/30 tracking-widest mb-4">SIGNAL BREAKDOWN</h3>
                {result.breakdown.wallet_age && <BreakdownBar label="Wallet Age" score={result.breakdown.wallet_age.score} weight={result.breakdown.wallet_age.weight} detail={`${result.breakdown.wallet_age.days}d old`} />}
                {result.breakdown.avg_bet_size && <BreakdownBar label="Bet Size" score={result.breakdown.avg_bet_size.score} weight={result.breakdown.avg_bet_size.weight} detail={`avg $${result.breakdown.avg_bet_size.usd?.toFixed(2)}`} />}
                {result.breakdown.timing && <BreakdownBar label="Timing" score={result.breakdown.timing.score} weight={result.breakdown.timing.weight} detail={`${result.breakdown.timing.samples} samples`} />}
                {result.breakdown.win_rate && <BreakdownBar label="Win Rate" score={result.breakdown.win_rate.score} weight={result.breakdown.win_rate.weight} detail={`${result.breakdown.win_rate.wins}W / ${result.breakdown.win_rate.losses}L`} />}
                {result.breakdown.concentration && <BreakdownBar label="Concentration" score={result.breakdown.concentration.score} weight={result.breakdown.concentration.weight} detail={`${result.breakdown.concentration.unique_markets} markets`} />}
                {result.breakdown.volume && <BreakdownBar label="Volume" score={result.breakdown.volume.score} weight={result.breakdown.volume.weight} detail={`$${Math.round(result.breakdown.volume.total_usd).toLocaleString()}`} />}
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 flex flex-col items-center justify-center">
                <h3 className="text-[9px] text-white/30 tracking-widest mb-4">SIGNAL RADAR</h3>
                <RadarChart breakdown={result.breakdown} size={200} />
              </div>
            </div>
          )}
          
          {/* Recent activity */}
          {result.recentActivity && result.recentActivity.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
              <h3 className="text-[9px] text-white/30 tracking-widest mb-4">RECENT TRADES</h3>
              <div className="space-y-2">
                {result.recentActivity.map((a, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded bg-white/[0.02] text-[10px]">
                    <span className="text-white/50 truncate flex-1">{a.market || a.question || 'Unknown market'}</span>
                    <span className="text-white/30 mx-2">{a.side}</span>
                    <span className="text-white/60 font-bold">${a.amount?.toFixed(2) || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="flex gap-3 justify-center">
            <a href={`https://polygonscan.com/address/${result.address || address}`} target="_blank" rel="noopener"
              className="text-[10px] text-[#00f0ff]/50 hover:text-[#00f0ff] transition-colors border border-[#00f0ff]/20 px-4 py-2 rounded-lg hover:bg-[#00f0ff]/5">
              POLYGONSCAN →
            </a>
            <a href={`https://polymarket.com/profile/${result.address || address}`} target="_blank" rel="noopener"
              className="text-[10px] text-[#00f0ff]/50 hover:text-[#00f0ff] transition-colors border border-[#00f0ff]/20 px-4 py-2 rounded-lg hover:bg-[#00f0ff]/5">
              POLYMARKET →
            </a>
          </div>
        </motion.div>
      )}
      
      {result && result.score == null && !error && (
        <div className="text-center p-8 rounded-xl border border-white/5 bg-white/[0.02] text-[11px] text-white/30">
          {result.message || 'No data found for this wallet. It may not have traded on recently resolved markets.'}
        </div>
      )}
    </div>
  );
}

// ─── CTA BANNER ────────────────────────────────────────────────────
function CTABanner() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [tab, setTab] = useState('agent'); // 'agent' | 'human'

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('prescience_cta_dismissed')) {
      setDismissed(true);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    try {
      await fetch(`${API_BASE}/prescience/interest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), source: `prescience-cta-${tab}`, timestamp: new Date().toISOString() }),
      }).catch(() => {});
      setSubmitted(true);
      localStorage.setItem('prescience_cta_submitted', 'true');
    } catch {}
  };

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem('prescience_cta_dismissed', 'true');
  };

  if (dismissed) return null;

  const codeSnippet = `// Before any Polymarket trade:
const scan = await fetch(
  '${API_BASE}/prescience/' + walletAddress
);
const { score, archetype, riskLevel } = await scan.json();

if (score > 70 && archetype === 'insider') {
  // Smart money detected — follow or fade
  console.log('Insider signal:', riskLevel);
}`;

  return (
    <div className="fixed bottom-12 left-0 right-0 z-50 px-4">
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 3, duration: 0.5 }}
        className="max-w-2xl mx-auto"
      >
        <div className="relative bg-gradient-to-r from-[#ff3366]/10 via-[#0a0a0f] to-[#ff3366]/10 border border-[#ff3366]/20 rounded-xl p-4 backdrop-blur-xl">
          <button onClick={dismiss} className="absolute top-2 right-3 text-white/20 hover:text-white/50 text-xs">✕</button>
          
          {/* Tab switcher */}
          <div className="flex gap-2 mb-3 justify-center">
            <button 
              onClick={() => setTab('agent')} 
              className={`text-[9px] font-black tracking-widest px-3 py-1 rounded-md transition-colors ${tab === 'agent' ? 'bg-[#ff3366]/20 text-[#ff3366] border border-[#ff3366]/30' : 'text-white/30 hover:text-white/50'}`}
            >
              🤖 FOR AGENTS
            </button>
            <button 
              onClick={() => setTab('human')} 
              className={`text-[9px] font-black tracking-widest px-3 py-1 rounded-md transition-colors ${tab === 'human' ? 'bg-[#ff3366]/20 text-[#ff3366] border border-[#ff3366]/30' : 'text-white/30 hover:text-white/50'}`}
            >
              👤 FOR HUMANS
            </button>
          </div>

          {!submitted ? (
            tab === 'agent' ? (
              <div className="space-y-3">
                <div className="text-center">
                  <div className="text-xs font-black tracking-widest text-[#ff3366]">PLUG INTO YOUR TRADING BOT</div>
                  <div className="text-[10px] text-white/40 mt-0.5">One API call before every trade. No auth needed. Free during beta.</div>
                </div>
                <pre className="bg-black/60 border border-white/5 rounded-lg p-3 text-[9px] text-[#00ff88]/80 font-mono overflow-x-auto leading-relaxed">
                  {codeSnippet}
                </pre>
                <div className="flex flex-wrap justify-center gap-2 text-[8px] text-white/25 tracking-wider">
                  <span className="bg-white/5 px-2 py-0.5 rounded">GET /prescience/:address</span>
                  <span className="bg-white/5 px-2 py-0.5 rounded">GET /prescience/signals</span>
                  <span className="bg-white/5 px-2 py-0.5 rounded">GET /prescience/scanner</span>
                  <span className="bg-white/5 px-2 py-0.5 rounded">GET /prescience/alerts</span>
                </div>
                <div className="flex gap-2 justify-center">
                  <a href={`${API_BASE}/prescience`} target="_blank" rel="noopener noreferrer" className="bg-[#ff3366] hover:bg-[#ff3366]/80 text-white text-[10px] font-black tracking-wider px-4 py-2 rounded-lg transition-colors">
                    API DOCS →
                  </a>
                  <a href="https://github.com/0xLaVaN/epistemic-observatory" target="_blank" rel="noopener noreferrer" className="bg-white/5 hover:bg-white/10 text-white/60 text-[10px] font-black tracking-wider px-4 py-2 rounded-lg transition-colors border border-white/10">
                    GITHUB
                  </a>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="flex-1 text-center sm:text-left">
                  <div className="text-xs font-black tracking-widest text-[#ff3366]">EARLY ACCESS</div>
                  <div className="text-[10px] text-white/40 mt-0.5">Get Prescience alerts + API key. Free during beta.</div>
                </div>
                <form onSubmit={handleSubmit} className="flex gap-2 w-full sm:w-auto">
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    required
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/80 placeholder:text-white/15 focus:outline-none focus:border-[#ff3366]/30 flex-1 sm:w-48"
                  />
                  <button type="submit" className="bg-[#ff3366] hover:bg-[#ff3366]/80 text-white text-xs font-black tracking-wider px-4 py-2 rounded-lg transition-colors whitespace-nowrap">
                    GET ACCESS
                  </button>
                </form>
              </div>
            )
          ) : (
            <div className="text-center py-1">
              <div className="text-xs font-black text-[#00ff88] tracking-widest">YOU'RE IN</div>
              <div className="text-[10px] text-white/40 mt-0.5">We'll send your API key shortly. See who sees first.</div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── NEWS SECTION ──────────────────────────────────────────────────
const SEVERITY_COLORS = { critical: '#ff3366', high: '#f0a000', medium: '#00f0ff', low: '#666' };
const SEVERITY_LABELS = { critical: 'CRITICAL', high: 'HIGH', medium: 'MEDIUM', low: 'LOW' };

function NewsSection() {
  const [news, setNews] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/prescience/news`);
        const data = await res.json();
        setNews(data);
      } catch {}
      setLoading(false);
    };
    load();
    const iv = setInterval(load, 300000); // 5 min
    return () => clearInterval(iv);
  }, []);

  if (loading && !news) {
    return (
      <div className="text-center py-20">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }} className="inline-block mb-4">
          <span className="text-3xl text-[#ff3366]">📡</span>
        </motion.div>
        <div className="text-[11px] text-white/30 tracking-widest">GENERATING INTELLIGENCE FEED...</div>
      </div>
    );
  }

  const items = news?.news || [];

  return (
    <div>
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-black tracking-[0.1em] text-white/80 mb-2">PRESCIENCE NEWS FEED</h2>
        <p className="text-[11px] text-white/30 italic">"Truth has a price. See who's paying it."</p>
        {news?.generated && (
          <p className="text-[9px] text-white/15 mt-1">Generated {new Date(news.generated).toLocaleTimeString()} · {news.engine}</p>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-20 text-white/30 text-sm">No news items generated. Markets may be quiet.</div>
      ) : (
        <div className="space-y-3 max-w-4xl mx-auto">
          {items.map((item, i) => {
            const sevColor = SEVERITY_COLORS[item.severity] || '#666';
            const odds = Object.entries(item.currentOdds || {});

            return (
              <motion.div
                key={item.slug + i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="relative rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all overflow-hidden group"
              >
                {/* Severity bar */}
                <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl" style={{ backgroundColor: sevColor, boxShadow: `0 0 10px ${sevColor}60` }} />

                <div className="p-5 pl-6">
                  {/* Top row: severity badge + timestamp */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[8px] font-black px-2 py-0.5 rounded tracking-wider border"
                        style={{ color: sevColor, borderColor: `${sevColor}50`, background: `${sevColor}15` }}
                      >
                        {SEVERITY_LABELS[item.severity]}
                      </span>
                      {item.flowDirection && item.flowDirection !== 'NEUTRAL' && (
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${item.flowDirection === 'BUY' ? 'text-[#00ff88] bg-[#00ff88]/10' : 'text-[#ff3366] bg-[#ff3366]/10'}`}>
                          {item.flowDirection === 'BUY' ? '▲ BUY' : '▼ SELL'} PRESSURE
                        </span>
                      )}
                      {item.freshWallets > 0 && (
                        <span className="text-[8px] text-[#f0a000]/70 bg-[#f0a000]/10 px-1.5 py-0.5 rounded">
                          🆕 {item.freshWallets} fresh
                        </span>
                      )}
                    </div>
                    <span className="text-[8px] text-white/15">{new Date(item.timestamp).toLocaleTimeString()}</span>
                  </div>

                  {/* Headline */}
                  <h3 className="text-sm font-bold text-white/80 mb-1 group-hover:text-white transition-colors">
                    {item.headline}
                  </h3>

                  {/* Market name */}
                  <div className="text-[10px] text-white/40 mb-3">
                    {item.slug ? (
                      <a href={`https://polymarket.com/event/${item.slug}`} target="_blank" rel="noopener noreferrer" className="hover:text-[#00f0ff] transition-colors">
                        {item.market} <span className="text-white/15">↗</span>
                      </a>
                    ) : item.market}
                  </div>

                  {/* Odds bar */}
                  {odds.length > 0 && (
                    <div className="mb-3">
                      <div className="flex rounded-full overflow-hidden h-3 bg-white/5">
                        {odds.map(([outcome, prob], oi) => {
                          const barColor = oi === 0 ? '#00ff88' : '#ff3366';
                          return (
                            <motion.div
                              key={outcome}
                              className="h-full relative"
                              style={{ backgroundColor: barColor, opacity: 0.7 }}
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.round(prob * 100)}%` }}
                              transition={{ duration: 0.8, delay: 0.1 }}
                            />
                          );
                        })}
                      </div>
                      <div className="flex justify-between mt-1">
                        {odds.map(([outcome, prob]) => (
                          <span key={outcome} className="text-[8px] text-white/30">
                            {outcome}: <span className="font-bold text-white/50">{Math.round(prob * 100)}%</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bottom row: volume + signal */}
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-white/25">
                      24h Vol: <span className="font-bold text-white/40">${item.volume24h >= 1e6 ? `${(item.volume24h / 1e6).toFixed(1)}M` : `${Math.round(item.volume24h / 1000)}K`}</span>
                    </span>
                    <span className="text-[9px] text-white/30 italic">{item.signal}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── MARKETS SECTION ───────────────────────────────────────────────
function MarketsSection({ hotMarkets, activeMarkets }) {
  const [selectedMarket, setSelectedMarket] = useState(null);
  const [marketData, setMarketData] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const loadMarket = async (conditionId) => {
    setLoading(true);
    setSelectedMarket(conditionId);
    try {
      const res = await fetch(`${API_BASE}/prescience/market/${encodeURIComponent(conditionId)}`);
      const data = await res.json();
      // Enrich with sidebar data if API market info is stale/wrong
      const sidebarMatch = allMarkets.find(m => m.conditionId === conditionId);
      if (sidebarMatch && data.market) {
        data.market.question = sidebarMatch.question || data.market.question;
        data.market.polymarketUrl = `https://polymarket.com/event/${sidebarMatch.slug || conditionId}`;
      }
      setMarketData(data);
    } catch (e) {
      setMarketData({ error: e.message });
    } finally {
      setLoading(false);
    }
  };
  
  const allMarkets = [...(hotMarkets || []), ...(activeMarkets || [])];
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Market list */}
      <div>
        <h2 className="text-xs font-black tracking-[0.15em] text-white/50 mb-4">SELECT MARKET</h2>
        <div className="space-y-1 max-h-[600px] overflow-y-auto scrollbar-thin">
          {allMarkets.map((m, i) => (
            <button
              key={m.conditionId || i}
              onClick={() => loadMarket(m.conditionId)}
              className={`w-full text-left p-3 rounded-lg transition-all text-[10px] ${
                selectedMarket === m.conditionId
                  ? 'bg-[#ff3366]/10 border border-[#ff3366]/30 text-white/80'
                  : 'bg-white/[0.02] border border-transparent hover:bg-white/[0.04] text-white/50'
              }`}
            >
              <div className="truncate">{m.question} {m.slug && <a href={`https://polymarket.com/event/${m.slug}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-white/10 hover:text-[#00f0ff]">↗</a>}</div>
              <div className="text-[8px] text-white/20 mt-1">
                {m.suspicious_wallets != null && <span className="text-[#ff3366]">{m.suspicious_wallets} suspicious · </span>}
                ${Math.round(m.volume || m.volumeTotal || 0).toLocaleString()}
              </div>
            </button>
          ))}
        </div>
      </div>
      
      {/* Market detail */}
      <div className="lg:col-span-2">
        {!selectedMarket && (
          <div className="flex items-center justify-center h-full text-white/20 text-sm">
            ← Select a market to analyze
          </div>
        )}
        
        {loading && (
          <div className="flex items-center justify-center h-full">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}>
              <span className="text-2xl text-[#ff3366]">⬡</span>
            </motion.div>
          </div>
        )}
        
        {!loading && marketData && !marketData.error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
              <h3 className="text-sm text-white/70 mb-2">
                {marketData.market?.polymarketUrl ? (
                  <a href={marketData.market.polymarketUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[#00f0ff] transition-colors">
                    {marketData.market?.question || 'Market Analysis'} <span className="text-[9px] text-white/20">↗</span>
                  </a>
                ) : (marketData.market?.question || 'Market Analysis')}
              </h3>
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div className="text-center">
                  <div className="text-xl font-black text-[#ff3366]">{marketData.analysis?.suspicious_wallets || marketData.suspicious_wallets || 0}</div>
                  <div className="text-[9px] text-white/30">SUSPICIOUS</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-black text-white/60">{marketData.analysis?.unique_wallets || marketData.total_wallets || 0}</div>
                  <div className="text-[9px] text-white/30">TOTAL</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-black text-[#00f0ff]">${Math.round(marketData.analysis?.total_volume_usd || marketData.market?.volume || 0).toLocaleString()}</div>
                  <div className="text-[9px] text-white/30">VOLUME</div>
                </div>
              </div>
              {marketData.analysis?.insider_risk && (
                <div className="mt-3 text-center">
                  <span className={`text-[10px] font-black tracking-widest px-3 py-1 rounded-full ${
                    marketData.analysis.insider_risk === 'HIGH' ? 'bg-[#ff3366]/10 text-[#ff3366]' :
                    marketData.analysis.insider_risk === 'MEDIUM' ? 'bg-amber-500/10 text-amber-400' :
                    'bg-green-500/10 text-green-400'
                  }`}>{marketData.analysis.insider_risk} INSIDER RISK</span>
                </div>
              )}
            </div>
            
            {/* Wallet list for this market */}
            {marketData.wallets && marketData.wallets.length > 0 && (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
                <h4 className="text-[9px] text-white/30 tracking-widest mb-4">SUSPICIOUS WALLETS IN THIS MARKET</h4>
                <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin">
                  {marketData.wallets.map((w, i) => {
                    const scoreColor = w.score >= 75 ? '#ff3366' : w.score >= 50 ? '#f0a000' : '#00f0ff';
                    return (
                      <div key={w.address + i} className="flex items-center gap-3 p-2 rounded bg-white/[0.02]">
                        <span className="text-sm font-black w-8 text-center" style={{ color: scoreColor }}>{w.score}</span>
                        <ExtLink href={`https://polymarket.com/profile/${w.address}`} className="text-[10px] font-mono text-white/50 hover:text-[#00f0ff] flex-1 transition-colors">{w.address?.slice(0, 10)}...{w.address?.slice(-6)}</ExtLink>
                        <CopyButton text={w.address} />
                        <RiskBadge level={w.riskLevel} />
                        <span className="text-[9px] text-white/30">{w.trades || w.tradeCount || 0} trades</span>
                        <span className="text-[9px] text-white/30">${Math.round(w.totalUSD || 0).toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* Score distribution */}
            {marketData.wallets && marketData.wallets.length > 0 && (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
                <h4 className="text-[9px] text-white/30 tracking-widest mb-4">SCORE DISTRIBUTION</h4>
                <ScoreDistribution wallets={marketData.wallets} />
              </div>
            )}
          </motion.div>
        )}
        
        {!loading && marketData?.error && (
          <div className="text-center p-8 text-[11px] text-[#ff3366]">{marketData.error}</div>
        )}
      </div>
    </div>
  );
}

function ScoreDistribution({ wallets }) {
  const buckets = [0, 0, 0, 0, 0]; // 0-20, 20-40, 40-60, 60-80, 80-100
  const labels = ['0-20', '20-40', '40-60', '60-80', '80-100'];
  const colors = ['#00ff88', '#00f0ff', '#f0a000', '#f0a000', '#ff3366'];
  
  for (const w of wallets) {
    const idx = Math.min(Math.floor(w.score / 20), 4);
    buckets[idx]++;
  }
  
  const max = Math.max(...buckets, 1);
  
  return (
    <div className="flex items-end gap-2 h-24">
      {buckets.map((count, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-[8px] text-white/30">{count}</span>
          <motion.div
            className="w-full rounded-t"
            style={{ backgroundColor: colors[i], opacity: 0.7 }}
            initial={{ height: 0 }}
            animate={{ height: `${(count / max) * 80}px` }}
            transition={{ duration: 0.6, delay: i * 0.1 }}
          />
          <span className="text-[7px] text-white/20">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

// ─── SCANNER SECTION ───────────────────────────────────────────────
function ScannerSection() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/prescience/scanner?limit=20`);
        const json = await res.json();
        setData(json);
      } catch (e) {
        // scanner fetch error — silently degrade
      } finally {
        setLoading(false);
      }
    };
    load();
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, []);

  if (loading && !data) {
    return (
      <div className="text-center py-20">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }} className="inline-block mb-4">
          <span className="text-3xl text-[#ff3366]">⊛</span>
        </motion.div>
        <div className="text-[11px] text-white/30 tracking-widest">SCANNING ACTIVE MARKETS...</div>
      </div>
    );
  }

  const results = data?.scanner || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xs font-black tracking-[0.15em] text-white/50 flex items-center gap-2">
          <span className="text-[#ff3366]">⊛</span>
          LIVE MARKET SCANNER — WHALE & INSIDER DETECTION
        </h2>
        <span className="text-[9px] text-white/20">
          {results.length} markets · {data?.meta?.timestamp ? new Date(data.meta.timestamp).toLocaleTimeString() : ''}
        </span>
      </div>

      {results.length === 0 ? (
        <div className="text-center py-20 text-white/30 text-sm">No active markets with sufficient data.</div>
      ) : (
        <div className="space-y-3">
          {results.map((r, i) => {
            const isExpanded = expanded === i;
            const color = r.suspicion >= 60 ? '#ff3366' : r.suspicion >= 30 ? '#f0a000' : '#00f0ff';
            const prices = r.market?.currentPrices || {};
            const priceEntries = Object.entries(prices);

            return (
              <div key={r.market?.conditionId || i}>
                <motion.button
                  onClick={() => setExpanded(isExpanded ? null : i)}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={`w-full text-left rounded-xl border transition-all overflow-hidden ${
                    isExpanded ? 'bg-white/[0.04] border-white/10' : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.03]'
                  }`}
                >
                  {/* Suspicion indicator */}
                  <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}60` }} />
                  
                  <div className="flex items-center gap-4 p-4 pl-5">
                    <ScoreGauge score={r.suspicion} size={56} />
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] text-white/70 truncate">{r.market?.question}</span>
                        <RiskBadge level={r.riskLevel} />
                      </div>
                      <div className="flex gap-4 text-[9px] text-white/30">
                        {r.signals?.whale_consensus?.whale_count > 0 && (
                          <span>🐋 {r.signals.whale_consensus.whale_count} whales → <span style={{ color }}>{r.signals.whale_consensus.dominant_outcome}</span> ({Math.round(r.signals.whale_consensus.strength * 100)}%)</span>
                        )}
                        {r.signals?.fresh_wallet_surge?.count > 0 && (
                          <span>🆕 {r.signals.fresh_wallet_surge.count} fresh wallets ({r.signals.fresh_wallet_surge.pct_of_total}%)</span>
                        )}
                        {r.signals?.flow_imbalance?.direction !== 'NEUTRAL' && (
                          <span>📊 Flow: {r.signals.flow_imbalance.direction} ({Math.round(r.signals.flow_imbalance.magnitude * 100)}%)</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex-shrink-0 text-right">
                      {priceEntries.length > 0 && (
                        <div className="flex gap-2">
                          {priceEntries.map(([outcome, price]) => (
                            <div key={outcome} className="text-center">
                              <div className="text-[9px] text-white/30 truncate max-w-[60px]">{outcome}</div>
                              <div className="text-sm font-black" style={{ color: price > 0.7 ? '#00ff88' : price < 0.3 ? '#ff3366' : '#f0a000' }}>
                                {Math.round(price * 100)}¢
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="text-[8px] text-white/20 mt-1">
                        24h: ${Math.round(r.market?.volume24hr || 0).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </motion.button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 py-4 border-x border-b border-white/5 rounded-b-xl bg-white/[0.01]">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          {/* Signal breakdown */}
                          <div>
                            <h4 className="text-[9px] text-white/30 tracking-widest mb-3">SIGNALS</h4>
                            <div className="space-y-3">
                              <div>
                                <div className="flex justify-between text-[9px] mb-1">
                                  <span className="text-white/40">Whale Consensus</span>
                                  <span style={{ color }}>{Math.round((r.signals?.whale_consensus?.strength || 0) * 100)}%</span>
                                </div>
                                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${(r.signals?.whale_consensus?.strength || 0) * 100}%`, backgroundColor: color }} />
                                </div>
                              </div>
                              <div>
                                <div className="flex justify-between text-[9px] mb-1">
                                  <span className="text-white/40">Fresh Wallet Surge</span>
                                  <span style={{ color }}>{r.signals?.fresh_wallet_surge?.pct_of_total || 0}%</span>
                                </div>
                                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, (r.signals?.fresh_wallet_surge?.pct_of_total || 0))}%`, backgroundColor: color }} />
                                </div>
                              </div>
                              <div>
                                <div className="flex justify-between text-[9px] mb-1">
                                  <span className="text-white/40">Flow Imbalance</span>
                                  <span style={{ color }}>{r.signals?.flow_imbalance?.direction} {Math.round((r.signals?.flow_imbalance?.magnitude || 0) * 100)}%</span>
                                </div>
                                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, (r.signals?.flow_imbalance?.magnitude || 0) * 100)}%`, backgroundColor: color }} />
                                </div>
                              </div>
                            </div>
                            <div className="mt-3 text-[9px] text-white/20">
                              {r.signals?.total_wallets} wallets · {r.signals?.total_trades} trades
                            </div>
                          </div>

                          {/* Top whales */}
                          <div className="md:col-span-2">
                            <h4 className="text-[9px] text-white/30 tracking-widest mb-3">TOP WHALES</h4>
                            {r.top_whales && r.top_whales.length > 0 ? (
                              <div className="space-y-1.5">
                                {r.top_whales.map((w, wi) => (
                                  <div key={w.address + wi} className="flex items-center gap-3 p-2 rounded bg-white/[0.02] text-[10px]">
                                    <span className="text-white/20 w-4">#{wi + 1}</span>
                                    <ExtLink href={`https://polymarket.com/profile/${w.address}`} className="font-mono text-white/50 hover:text-[#00f0ff] flex-1 transition-colors">{w.address?.slice(0, 10)}...{w.address?.slice(-6)}</ExtLink>
                                    <CopyButton text={w.address} />
                                    <span className={`font-bold ${w.bias === 'BUY' ? 'text-[#00ff88]' : 'text-[#ff3366]'}`}>{w.bias}</span>
                                    <span className="text-white/40">{w.dominant_outcome}</span>
                                    <span className="text-white/30">${Math.round(w.volume_usd).toLocaleString()}</span>
                                    <span className="text-white/20">{w.trades}t</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-[10px] text-white/20">No significant whales detected</div>
                            )}
                            
                            <div className="mt-3 flex gap-2">
                              <div className="text-[9px] text-white/15">
                                Liquidity: ${Math.round(r.market?.liquidity || 0).toLocaleString()} ·
                                Total Vol: ${Math.round(r.market?.volumeTotal || 0).toLocaleString()}
                                {r.market?.endDate && ` · Ends: ${new Date(r.market.endDate).toLocaleDateString()}`}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── MAIN DASHBOARD ────────────────────────────────────────────────
export default function PrescienceDashboard() {
  const [view, setView] = useState('pulse');
  const [pulse, setPulse] = useState(null);
  const [hotMarkets, setHotMarkets] = useState([]);
  const [activeMarkets, setActiveMarkets] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [pulseRes, leaderRes, alertRes] = await Promise.all([
        fetch(`${API_BASE}/prescience/pulse`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API_BASE}/prescience/leaderboard?limit=30`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API_BASE}/prescience/alerts?threshold=40`).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      if (pulseRes?.pulse) {
        setPulse(pulseRes.pulse);
        setHotMarkets(pulseRes.hot_markets || []);
        setActiveMarkets(pulseRes.active_markets || []);
      }
      if (leaderRes?.leaderboard) setLeaderboard(leaderRes.leaderboard);
      if (alertRes?.alerts) setAlerts(alertRes.alerts);
    } catch (e) {
      // fetch error — silently degrade
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="inline-block mb-4"
          >
            <svg width="48" height="48" viewBox="0 0 48 48">
              <polygon points="24,4 44,24 24,44 4,24" fill="none" stroke="#ff3366" strokeWidth="2" strokeDasharray="15 5" />
            </svg>
          </motion.div>
          <div className="text-sm font-black tracking-[0.2em] text-[#ff3366] mb-2">PRESCIENCE</div>
          <div className="text-[10px] text-white/30 tracking-widest">INITIALIZING SURVEILLANCE...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] grid-bg relative">
      {/* Scanlines overlay */}
      <div className="scanlines pointer-events-none fixed inset-0 z-[100]" />
      
      <NavBar active={view} onChange={setView} />

      <main className="pt-20 px-4 md:px-8 pb-20 max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {view === 'pulse' && <PulseSection pulse={pulse} hotMarkets={hotMarkets} activeMarkets={activeMarkets} setView={setView} />}
            {view === 'leaderboard' && <LeaderboardSection leaderboard={leaderboard} />}
            {view === 'alerts' && <AlertsSection alerts={alerts} />}
            {view === 'lookup' && <WalletLookupSection />}
            {view === 'news' && <NewsSection />}
            {view === 'scanner' && <ScannerSection />}
            {view === 'markets' && <MarketsSection hotMarkets={hotMarkets} activeMarkets={activeMarkets} />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* CTA Banner */}
      <CTABanner />

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 p-3 bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0fcc] to-transparent">
        <div className="flex justify-between items-center text-[9px] text-white/15 max-w-7xl mx-auto">
          <div className="tracking-wider">PRESCIENCE v2.0 · EPISTEMIC OBSERVATORY</div>
          <div className="flex gap-4 items-center">
            <span className="font-mono">See who sees first.</span>
            <span className="flex items-center gap-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff3366] opacity-40"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#ff3366]"></span>
              </span>
              SCANNING
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
