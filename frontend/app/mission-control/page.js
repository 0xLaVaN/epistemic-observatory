'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── THEME ─────────────────────────────────────────────────────────
const COLORS = {
  void: '#0a0a0f',
  amber: '#f59e0b',
  ice: '#38bdf8',
  alert: '#ff3366',
  green: '#00ff88',
  purple: '#a78bfa',
};

const STATUS_MAP = {
  active: { color: COLORS.green, label: 'ONLINE', pulse: true },
  idle: { color: COLORS.amber, label: 'STANDBY', pulse: false },
  error: { color: COLORS.alert, label: 'ALERT', pulse: true },
};

// ─── CREW PERSONAS ─────────────────────────────────────────────────
const CREW = {
  quaczar: {
    tagline: '"Sees the whole board."',
    personality: 'Calm. Strategic. Chief of staff energy.',
    station: "Captain's Chair",
    accent: COLORS.amber,
    glowColor: 'rgba(245,158,11,0.15)',
    borderColor: 'rgba(245,158,11,0.4)',
    icon: '⬡', // hexagonal command icon
  },
  tars: {
    tagline: '"Data doesn\'t lie. People do."',
    personality: 'Alert. Vigilant. Terse.',
    station: 'Sensor Array',
    accent: COLORS.ice,
    glowColor: 'rgba(56,189,248,0.12)',
    borderColor: 'rgba(56,189,248,0.3)',
    icon: '◈',
  },
  case: {
    tagline: '"Reading the room — and the timeline."',
    personality: 'Smooth. Engaging. Cultural pulse.',
    station: 'Comms Array',
    accent: '#34d399',
    glowColor: 'rgba(52,211,153,0.12)',
    borderColor: 'rgba(52,211,153,0.3)',
    icon: '◎',
  },
  gargantua: {
    tagline: '"Pulling signal from the noise."',
    personality: 'Deep. Contemplative. Sees patterns.',
    station: 'Science Lab',
    accent: COLORS.purple,
    glowColor: 'rgba(167,139,250,0.12)',
    borderColor: 'rgba(167,139,250,0.3)',
    icon: '◉',
  },
  endurance: {
    tagline: '"Ship it. Break nothing."',
    personality: 'Fast. Reliable. The engine room.',
    station: 'Engineering Bay',
    accent: '#fb923c',
    glowColor: 'rgba(251,146,60,0.12)',
    borderColor: 'rgba(251,146,60,0.3)',
    icon: '⬢',
  },
};

const FALLBACK_AGENTS = [
  { id: 'quaczar', name: 'Quaczar', emoji: '🌋', role: 'Orchestrator', status: 'active', lastActivity: null, recentActions: [] },
  { id: 'tars', name: 'TARS', emoji: '🛰️', role: 'Scanner', status: 'idle', lastActivity: null, recentActions: [] },
  { id: 'case', name: 'CASE', emoji: '🌊', role: 'Social', status: 'idle', lastActivity: null, recentActions: [] },
  { id: 'gargantua', name: 'Gargantua', emoji: '🕳️', role: 'Analyst', status: 'idle', lastActivity: null, recentActions: [] },
  { id: 'endurance', name: 'Endurance', emoji: '🚀', role: 'Builder', status: 'active', lastActivity: null, recentActions: [] },
];

// ─── DATA FLOW CONNECTIONS ─────────────────────────────────────────
// scanner→analyst→social, orchestrator↔all
const DATA_FLOWS = [
  { from: 'tars', to: 'gargantua', label: 'raw intel' },
  { from: 'gargantua', to: 'case', label: 'insights' },
  { from: 'quaczar', to: 'tars', label: 'directives' },
  { from: 'quaczar', to: 'case', label: 'directives' },
  { from: 'quaczar', to: 'gargantua', label: 'directives' },
  { from: 'quaczar', to: 'endurance', label: 'build orders' },
  { from: 'endurance', to: 'quaczar', label: 'deploy status' },
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

    // More stars, with subtle color variation
    for (let i = 0; i < 350; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.8 + 0.2,
        a: Math.random(),
        da: (Math.random() - 0.5) * 0.008,
        hue: Math.random() > 0.85 ? (Math.random() > 0.5 ? 38 : 200) : 0, // some amber/ice tinted
        sat: Math.random() > 0.85 ? 60 : 0,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const s of stars) {
        s.a += s.da;
        if (s.a > 1 || s.a < 0.05) s.da *= -1;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        if (s.hue) {
          ctx.fillStyle = `hsla(${s.hue},${s.sat}%,80%,${s.a * 0.5})`;
        } else {
          ctx.fillStyle = `rgba(255,255,255,${s.a * 0.5})`;
        }
        ctx.fill();
      }
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none" />;
}

// ─── NEBULA GLOW (subtle background atmosphere) ────────────────────
function NebulaGlow() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full opacity-[0.03]"
        style={{ background: `radial-gradient(circle, ${COLORS.amber}, transparent 70%)` }} />
      <div className="absolute bottom-1/4 left-1/3 w-[600px] h-[600px] rounded-full opacity-[0.02]"
        style={{ background: `radial-gradient(circle, ${COLORS.ice}, transparent 70%)` }} />
    </div>
  );
}

// ─── ANIMATED CONNECTION LINES ─────────────────────────────────────
function ShipConnections({ positions }) {
  if (!positions || Object.keys(positions).length < 5) return null;

  return (
    <svg className="absolute inset-0 w-full h-full z-[1] pointer-events-none" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="flowAmber" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={COLORS.amber} stopOpacity="0.5" />
          <stop offset="50%" stopColor={COLORS.amber} stopOpacity="0.15" />
          <stop offset="100%" stopColor={COLORS.amber} stopOpacity="0.5" />
        </linearGradient>
        <linearGradient id="flowIce" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={COLORS.ice} stopOpacity="0.4" />
          <stop offset="50%" stopColor={COLORS.ice} stopOpacity="0.1" />
          <stop offset="100%" stopColor={COLORS.ice} stopOpacity="0.4" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {DATA_FLOWS.map((flow, i) => {
        const from = positions[flow.from];
        const to = positions[flow.to];
        if (!from || !to) return null;
        const isFromCenter = flow.from === 'quaczar';
        const grad = isFromCenter ? 'url(#flowAmber)' : 'url(#flowIce)';
        return (
          <g key={i}>
            <line
              x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              stroke={grad} strokeWidth="1" opacity="0.3" filter="url(#glow)"
              strokeDasharray="6 4"
            >
              <animate attributeName="stroke-dashoffset" from="0" to="-20" dur="2s" repeatCount="indefinite" />
            </line>
            {/* Traveling particle */}
            <circle r="2" fill={isFromCenter ? COLORS.amber : COLORS.ice} opacity="0.6" filter="url(#glow)">
              <animateMotion
                dur={`${2.5 + i * 0.3}s`}
                repeatCount="indefinite"
                path={`M${from.x},${from.y} L${to.x},${to.y}`}
              />
            </circle>
          </g>
        );
      })}
    </svg>
  );
}

// ─── STATUS INDICATOR ──────────────────────────────────────────────
function StatusIndicator({ status, accent }) {
  const cfg = STATUS_MAP[status] || STATUS_MAP.idle;
  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-2.5 w-2.5">
        {cfg.pulse && (
          <motion.span
            className="absolute inline-flex h-full w-full rounded-full"
            style={{ backgroundColor: cfg.color }}
            animate={{ scale: [1, 2.2, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: cfg.color }} />
      </span>
      <span className="text-[9px] font-mono uppercase tracking-[0.2em]" style={{ color: cfg.color }}>
        {cfg.label}
      </span>
    </div>
  );
}

// ─── AGENT STATION CARD ────────────────────────────────────────────
function CrewStation({ agent, isCenter, delay, onPosition }) {
  const persona = CREW[agent.id] || CREW.quaczar;
  const cardRef = useRef(null);

  // Report position for connection lines
  useEffect(() => {
    const report = () => {
      if (cardRef.current && onPosition) {
        const rect = cardRef.current.getBoundingClientRect();
        const parent = cardRef.current.closest('.crew-grid');
        const parentRect = parent?.getBoundingClientRect() || { left: 0, top: 0 };
        onPosition(agent.id, {
          x: rect.left - parentRect.left + rect.width / 2,
          y: rect.top - parentRect.top + rect.height / 2,
        });
      }
    };
    report();
    window.addEventListener('resize', report);
    const t = setTimeout(report, 500);
    return () => { window.removeEventListener('resize', report); clearTimeout(t); };
  }, [agent.id, onPosition]);

  const timeAgo = agent.lastActivity ? formatTimeAgo(agent.lastActivity) : null;
  const isActive = agent.status === 'active';

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 40, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ scale: 1.02, y: -2 }}
      className="relative z-10 group"
    >
      {/* Outer glow on active */}
      {isActive && (
        <motion.div
          className="absolute -inset-1 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{ background: `radial-gradient(ellipse, ${persona.glowColor}, transparent 70%)` }}
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      <div
        className={`relative rounded-2xl border backdrop-blur-xl overflow-hidden ${
          isCenter ? 'p-6' : 'p-5'
        }`}
        style={{
          borderColor: persona.borderColor,
          background: `linear-gradient(135deg, ${persona.glowColor}, rgba(10,10,15,0.9))`,
          boxShadow: isActive
            ? `0 0 30px ${persona.glowColor}, inset 0 1px 0 rgba(255,255,255,0.05)`
            : 'inset 0 1px 0 rgba(255,255,255,0.03)',
        }}
      >
        {/* Station label */}
        <div className="absolute top-0 right-0 px-3 py-1 rounded-bl-lg text-[8px] font-mono tracking-[0.25em] uppercase"
          style={{ color: persona.accent, opacity: 0.5, background: 'rgba(0,0,0,0.3)' }}>
          {persona.station}
        </div>

        {/* Center badge */}
        {isCenter && (
          <motion.div
            className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-[9px] font-mono tracking-[0.3em] uppercase border"
            style={{
              color: COLORS.amber,
              borderColor: 'rgba(245,158,11,0.4)',
              background: 'rgba(245,158,11,0.1)',
              backdropFilter: 'blur(10px)',
            }}
            animate={{ boxShadow: ['0 0 10px rgba(245,158,11,0.1)', '0 0 20px rgba(245,158,11,0.2)', '0 0 10px rgba(245,158,11,0.1)'] }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            ◆ COMMAND ◆
          </motion.div>
        )}

        {/* Avatar + Identity */}
        <div className="flex items-start gap-4 mb-4 mt-1">
          {/* Avatar circle */}
          <div className="relative flex-shrink-0">
            <motion.div
              className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl relative overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${persona.glowColor}, rgba(0,0,0,0.5))`,
                border: `1px solid ${persona.borderColor}`,
              }}
              animate={isActive ? {
                boxShadow: [
                  `0 0 0px ${persona.accent}33`,
                  `0 0 15px ${persona.accent}44`,
                  `0 0 0px ${persona.accent}33`,
                ],
              } : {}}
              transition={{ duration: 2, repeat: Infinity }}
            >
              {agent.emoji}
              {/* Scan line effect */}
              {isActive && (
                <motion.div
                  className="absolute inset-0 w-full"
                  style={{ background: `linear-gradient(transparent, ${persona.accent}15, transparent)`, height: '30%' }}
                  animate={{ top: ['-30%', '130%'] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                />
              )}
            </motion.div>
            {/* Status ring */}
            <div className="absolute -bottom-1 -right-1">
              <StatusIndicator status={agent.status} accent={persona.accent} />
            </div>
          </div>

          {/* Name + Role */}
          <div className="flex-1 min-w-0">
            <h3 className="font-mono text-base font-bold tracking-[0.15em]" style={{ color: persona.accent }}>
              {agent.name.toUpperCase()}
            </h3>
            <p className="text-[11px] text-white/30 font-mono uppercase tracking-wider mt-0.5">
              {agent.role}
            </p>
            <p className="text-[11px] italic mt-1.5" style={{ color: `${persona.accent}99` }}>
              {persona.tagline}
            </p>
          </div>
        </div>

        {/* Separator with accent */}
        <div className="h-px w-full mb-3" style={{
          background: `linear-gradient(90deg, transparent, ${persona.accent}40, transparent)`,
        }} />

        {/* Personality line */}
        <p className="text-[10px] text-white/25 mb-3 font-mono">
          {persona.personality}
        </p>

        {/* Activity Feed */}
        <div className="space-y-1.5">
          {agent.recentActions?.length > 0 ? (
            agent.recentActions.slice(-3).map((a, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: delay + 0.3 + i * 0.1 }}
                className="flex items-start gap-2 text-[10px]"
              >
                <span style={{ color: persona.accent, opacity: 0.5 }} className="font-mono mt-px">▸</span>
                <span className="text-white/40 leading-tight font-mono">{a.action || a}</span>
              </motion.div>
            ))
          ) : (
            <div className="flex items-center gap-2 text-[10px] text-white/15 italic font-mono">
              <motion.span
                animate={{ opacity: [0.3, 0.8, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
                style={{ color: persona.accent }}
              >
                ◇
              </motion.span>
              Awaiting signal...
            </div>
          )}
        </div>

        {/* Timestamp */}
        {timeAgo && (
          <div className="mt-3 text-[9px] font-mono text-white/20">
            Last ping: <span className="text-white/35">{timeAgo}</span>
          </div>
        )}

        {/* Bottom accent bar */}
        <motion.div
          className="absolute bottom-0 left-0 right-0 h-[2px]"
          style={{
            background: isActive
              ? `linear-gradient(90deg, transparent, ${persona.accent}, transparent)`
              : `linear-gradient(90deg, transparent, ${persona.accent}33, transparent)`,
          }}
          animate={isActive ? { opacity: [0.5, 1, 0.5] } : {}}
          transition={{ duration: 2, repeat: Infinity }}
        />
      </div>
    </motion.div>
  );
}

// ─── SHIP HULL OUTLINE ─────────────────────────────────────────────
function ShipHull() {
  return (
    <div className="absolute inset-0 z-0 pointer-events-none flex items-center justify-center">
      <motion.svg
        viewBox="0 0 900 700"
        className="w-full h-full max-w-5xl opacity-[0.04]"
        preserveAspectRatio="xMidYMid meet"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.04 }}
        transition={{ delay: 0.5, duration: 2 }}
      >
        {/* Ship outline — sleek delta shape */}
        <path
          d="M450,50 L800,350 L700,600 L200,600 L100,350 Z"
          fill="none"
          stroke={COLORS.amber}
          strokeWidth="1.5"
          strokeDasharray="8 4"
        >
          <animate attributeName="stroke-dashoffset" from="0" to="-24" dur="4s" repeatCount="indefinite" />
        </path>
        {/* Center ring */}
        <circle cx="450" cy="340" r="80" fill="none" stroke={COLORS.amber} strokeWidth="0.8" opacity="0.5" />
        <circle cx="450" cy="340" r="100" fill="none" stroke={COLORS.ice} strokeWidth="0.3" opacity="0.3"
          strokeDasharray="4 8">
          <animate attributeName="stroke-dashoffset" from="0" to="24" dur="6s" repeatCount="indefinite" />
        </circle>
      </motion.svg>
    </div>
  );
}

// ─── SYSTEM STATUS BAR ─────────────────────────────────────────────
function SystemBar({ agents }) {
  const activeCount = agents.filter(a => a.status === 'active').length;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1 }}
      className="flex items-center justify-center gap-8 py-3 mb-8"
    >
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
        <span className="text-[10px] font-mono text-white/30 tracking-wider">
          {activeCount}/{agents.length} STATIONS ACTIVE
        </span>
      </div>
      <div className="h-3 w-px bg-white/10" />
      <span className="text-[10px] font-mono text-white/20 tracking-wider">
        HULL INTEGRITY: 100%
      </span>
      <div className="h-3 w-px bg-white/10" />
      <span className="text-[10px] font-mono text-white/20 tracking-wider">
        MISSION: ACTIVE
      </span>
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
  return <span className="font-mono text-[10px] text-white/30 tracking-wider">{time}</span>;
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────
export default function MissionControl() {
  const [agents, setAgents] = useState(FALLBACK_AGENTS);
  const [positions, setPositions] = useState({});

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

  const handlePosition = useMemo(() => (id, pos) => {
    setPositions(prev => ({ ...prev, [id]: pos }));
  }, []);

  const orchestrator = agents.find(a => a.id === 'quaczar') || agents[0];
  const specialists = agents.filter(a => a.id !== 'quaczar');

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ backgroundColor: COLORS.void }}>
      <StarField />
      <NebulaGlow />

      {/* Top Bar */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-20 flex items-center justify-between px-8 py-4 border-b border-white/[0.04]"
        style={{ background: 'linear-gradient(180deg, rgba(10,10,15,0.8), transparent)' }}
      >
        <div className="flex items-center gap-4">
          <motion.div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: COLORS.amber }}
            animate={{ boxShadow: [`0 0 4px ${COLORS.amber}`, `0 0 12px ${COLORS.amber}`, `0 0 4px ${COLORS.amber}`] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <h1 className="text-sm font-mono tracking-[0.35em] uppercase" style={{ color: COLORS.amber }}>
            Mission Control
          </h1>
          <span className="text-[9px] font-mono text-white/15 tracking-[0.2em] uppercase">
            USS 0xLaVaN — Bridge View
          </span>
        </div>
        <UTCClock />
      </motion.header>

      {/* Main Content */}
      <main className="relative z-10 max-w-6xl mx-auto px-6 py-8">
        <SystemBar agents={agents} />

        {/* Crew Grid with Ship Hull */}
        <div className="relative crew-grid" style={{ minHeight: '600px' }}>
          <ShipHull />
          <ShipConnections positions={positions} />

          {/* Top Row: TARS + CASE (Scanner + Social) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 relative z-10">
            <CrewStation agent={specialists.find(a => a.id === 'tars') || specialists[0]} delay={0.1} onPosition={handlePosition} />
            <CrewStation agent={specialists.find(a => a.id === 'case') || specialists[1]} delay={0.2} onPosition={handlePosition} />
          </div>

          {/* Center: Quaczar (Captain) */}
          <div className="flex justify-center mb-6 relative z-10">
            <div className="w-full max-w-xl">
              <CrewStation agent={orchestrator} isCenter={true} delay={0.35} onPosition={handlePosition} />
            </div>
          </div>

          {/* Bottom Row: Gargantua + Endurance (Analyst + Builder) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
            <CrewStation agent={specialists.find(a => a.id === 'gargantua') || specialists[2]} delay={0.5} onPosition={handlePosition} />
            <CrewStation agent={specialists.find(a => a.id === 'endurance') || specialists[3]} delay={0.6} onPosition={handlePosition} />
          </div>
        </div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2, duration: 1.5 }}
          className="text-center mt-16 space-y-3"
        >
          <div className="h-px w-32 mx-auto" style={{ background: `linear-gradient(90deg, transparent, ${COLORS.amber}30, transparent)` }} />
          <p className="text-[10px] font-mono tracking-[0.5em] uppercase text-white/10">
            Do not go gentle into that good night
          </p>
          <p className="text-[9px] font-mono tracking-[0.3em] uppercase text-white/[0.06]">
            — Dylan Thomas
          </p>
        </motion.div>
      </main>
    </div>
  );
}
