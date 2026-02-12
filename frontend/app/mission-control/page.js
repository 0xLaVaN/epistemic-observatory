'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── THEME ─────────────────────────────────────────────────────────
const COLORS = {
  void: '#0a0a0f',
  amber: '#f4a261',
  ice: '#48cae4',
  alert: '#ff3366',
  green: '#00ff88',
  dimAmber: 'rgba(244,162,97,0.15)',
  dimIce: 'rgba(72,202,228,0.1)',
};

const STATUS_MAP = {
  active: { color: COLORS.green, label: 'ACTIVE', pulse: true },
  idle: { color: COLORS.amber, label: 'IDLE', pulse: false },
  error: { color: COLORS.alert, label: 'ERROR', pulse: true },
};

const FALLBACK_AGENTS = [
  { id: 'quaczar', name: 'Quaczar', emoji: '🌋', role: 'Orchestrator — routes tasks, manages collective rhythm', status: 'active', lastActivity: null, recentActions: [] },
  { id: 'tars', name: 'TARS', emoji: '🛰️', role: 'Research & Intelligence — web scanning, data synthesis', status: 'idle', lastActivity: null, recentActions: [] },
  { id: 'case', name: 'CASE', emoji: '🌊', role: 'Market Analysis — crypto signals, risk assessment', status: 'idle', lastActivity: null, recentActions: [] },
  { id: 'gargantua', name: 'Gargantua', emoji: '🕳️', role: 'Deep Reasoning — complex analysis, calibration scoring', status: 'idle', lastActivity: null, recentActions: [] },
  { id: 'endurance', name: 'Endurance', emoji: '🚀', role: 'Builder — code, deploy, infrastructure', status: 'active', lastActivity: null, recentActions: [] },
];

// ─── STAR FIELD ────────────────────────────────────────────────────
function StarField() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    const stars = [];
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < 200; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.5 + 0.3,
        a: Math.random(),
        da: (Math.random() - 0.5) * 0.005,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const s of stars) {
        s.a += s.da;
        if (s.a > 1 || s.a < 0.1) s.da *= -1;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${s.a * 0.6})`;
        ctx.fill();
      }
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none" />;
}

// ─── STATUS DOT ────────────────────────────────────────────────────
function StatusDot({ status }) {
  const cfg = STATUS_MAP[status] || STATUS_MAP.idle;
  return (
    <span className="relative flex h-3 w-3">
      {cfg.pulse && (
        <motion.span
          className="absolute inline-flex h-full w-full rounded-full opacity-75"
          style={{ backgroundColor: cfg.color }}
          animate={{ scale: [1, 1.8, 1], opacity: [0.7, 0, 0.7] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
      <span className="relative inline-flex rounded-full h-3 w-3" style={{ backgroundColor: cfg.color }} />
    </span>
  );
}

// ─── CONNECTION LINE (SVG) ─────────────────────────────────────────
function ConnectionLines({ agents }) {
  // positions relative to a 5-card layout: center + 4 corners
  return (
    <svg className="absolute inset-0 w-full h-full z-0 pointer-events-none opacity-20" preserveAspectRatio="none">
      <defs>
        <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={COLORS.amber} stopOpacity="0.6" />
          <stop offset="100%" stopColor={COLORS.ice} stopOpacity="0.3" />
        </linearGradient>
      </defs>
      {/* Lines from center to each corner — rendered as simple diagonals */}
      <line x1="50%" y1="45%" x2="15%" y2="15%" stroke="url(#lineGrad)" strokeWidth="1" />
      <line x1="50%" y1="45%" x2="85%" y2="15%" stroke="url(#lineGrad)" strokeWidth="1" />
      <line x1="50%" y1="45%" x2="15%" y2="85%" stroke="url(#lineGrad)" strokeWidth="1" />
      <line x1="50%" y1="45%" x2="85%" y2="85%" stroke="url(#lineGrad)" strokeWidth="1" />
    </svg>
  );
}

// ─── AGENT STATION CARD ────────────────────────────────────────────
function AgentStation({ agent, index, isCenter }) {
  const statusCfg = STATUS_MAP[agent.status] || STATUS_MAP.idle;
  const timeAgo = agent.lastActivity
    ? formatTimeAgo(agent.lastActivity)
    : 'No recent activity';

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.12, duration: 0.6 }}
      className={`relative rounded-xl border backdrop-blur-md p-5 ${
        isCenter
          ? 'border-amber-500/40 bg-amber-950/10 shadow-[0_0_40px_rgba(244,162,97,0.08)]'
          : 'border-white/[0.06] bg-white/[0.02]'
      }`}
      style={{ minHeight: isCenter ? '220px' : '180px' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-2xl">{agent.emoji}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-mono text-sm font-semibold tracking-wider" style={{ color: isCenter ? COLORS.amber : COLORS.ice }}>
              {agent.name.toUpperCase()}
            </h3>
            <StatusDot status={agent.status} />
            <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: statusCfg.color }}>
              {statusCfg.label}
            </span>
          </div>
          <p className="text-[11px] text-white/40 mt-0.5">{agent.role}</p>
        </div>
      </div>

      {/* Separator */}
      <div className="h-px w-full mb-3" style={{ background: `linear-gradient(90deg, transparent, ${isCenter ? COLORS.amber : COLORS.ice}33, transparent)` }} />

      {/* Last Activity */}
      <div className="text-[10px] font-mono text-white/30 mb-2">
        LAST ACTIVE: <span className="text-white/50">{timeAgo}</span>
      </div>

      {/* Activity Feed */}
      <div className="space-y-1.5">
        {agent.recentActions?.length > 0 ? (
          agent.recentActions.slice(-3).map((a, i) => (
            <div key={i} className="flex items-start gap-2 text-[10px]">
              <span className="text-white/20 font-mono mt-px">▸</span>
              <span className="text-white/40 leading-tight">{a.action || a}</span>
            </div>
          ))
        ) : (
          <div className="text-[10px] text-white/20 italic">Awaiting signal...</div>
        )}
      </div>

      {/* Center badge */}
      {isCenter && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[9px] font-mono tracking-widest border border-amber-500/30 bg-amber-950/50" style={{ color: COLORS.amber }}>
          ORCHESTRATOR
        </div>
      )}
    </motion.div>
  );
}

// ─── TIME HELPERS ──────────────────────────────────────────────────
function formatTimeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function UTCClock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () => setTime(new Date().toISOString().replace('T', ' · ').slice(0, 22) + ' UTC');
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);
  return <span className="font-mono text-xs text-white/40">{time}</span>;
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────
export default function MissionControl() {
  const [agents, setAgents] = useState(FALLBACK_AGENTS);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/agents/status');
        if (res.ok) {
          const data = await res.json();
          if (data.agents?.length) setAgents(data.agents);
        }
      } catch { /* use fallback */ }
    };
    fetchStatus();
    const iv = setInterval(fetchStatus, 15000);
    return () => clearInterval(iv);
  }, []);

  const orchestrator = agents.find(a => a.id === 'quaczar') || agents[0];
  const specialists = agents.filter(a => a.id !== 'quaczar');

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ backgroundColor: COLORS.void }}>
      <StarField />

      {/* Top Bar */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 flex items-center justify-between px-8 py-4 border-b border-white/[0.04]"
      >
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-mono tracking-[0.3em] uppercase" style={{ color: COLORS.amber }}>
            Mission Control
          </h1>
          <span className="text-[10px] font-mono text-white/20 tracking-wider">— 0xLaVaN Collective</span>
        </div>
        <UTCClock />
      </motion.header>

      {/* Main Grid */}
      <main className="relative z-10 max-w-6xl mx-auto px-6 py-10">
        {/* Connection Lines */}
        <ConnectionLines agents={agents} />

        {/* Top Row: 2 specialists */}
        <div className="grid grid-cols-2 gap-6 mb-6 relative z-10">
          {specialists.slice(0, 2).map((agent, i) => (
            <AgentStation key={agent.id} agent={agent} index={i} isCenter={false} />
          ))}
        </div>

        {/* Center: Orchestrator */}
        <div className="flex justify-center mb-6 relative z-10">
          <div className="w-full max-w-lg">
            <AgentStation agent={orchestrator} index={2} isCenter={true} />
          </div>
        </div>

        {/* Bottom Row: 2 specialists */}
        <div className="grid grid-cols-2 gap-6 relative z-10">
          {specialists.slice(2, 4).map((agent, i) => (
            <AgentStation key={agent.id} agent={agent} index={i + 3} isCenter={false} />
          ))}
        </div>

        {/* Footer tagline */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="text-center mt-16"
        >
          <p className="text-[10px] font-mono tracking-[0.4em] uppercase text-white/10">
            Do not go gentle into that good night
          </p>
        </motion.div>
      </main>
    </div>
  );
}
