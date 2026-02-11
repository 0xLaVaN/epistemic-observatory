'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = 'https://epistemic-observatory.vercel.app';

const HEALTH_COLORS = {
  healthy: '#00ff88',
  degraded: '#ffab40',
  failing: '#ff3366',
};

function WebhookCard({ wh, onDelete, onTest, onToggle }) {
  const [expanded, setExpanded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const healthColor = HEALTH_COLORS[wh.health] || '#666';

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API_BASE}/prescience/webhooks/${wh.id}/test`, { method: 'POST' });
      const data = await res.json();
      setTestResult(data.delivered ? 'delivered' : 'failed');
    } catch {
      setTestResult('error');
    }
    setTesting(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      style={{
        background: '#0a0a1a',
        border: `1px solid ${wh.active ? '#1a1a2e' : '#331111'}`,
        borderRadius: 12,
        padding: 20,
        marginBottom: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: healthColor, boxShadow: `0 0 8px ${healthColor}` }} />
            <span style={{ fontSize: 14, color: '#ccc', fontWeight: 500 }}>{wh.label || 'Unnamed Webhook'}</span>
            {!wh.active && <span style={{ fontSize: 10, color: '#ff3366', background: '#ff336622', padding: '2px 6px', borderRadius: 4 }}>DISABLED</span>}
          </div>
          <div style={{ fontSize: 11, color: '#555', fontFamily: 'monospace' }}>{wh.url}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleTest} disabled={testing} style={btnStyle('#00f0ff')}>{testing ? '...' : 'TEST'}</button>
          <button onClick={() => onToggle(wh.id, !wh.active)} style={btnStyle(wh.active ? '#ffab40' : '#00ff88')}>
            {wh.active ? 'PAUSE' : 'ENABLE'}
          </button>
          <button onClick={() => setExpanded(!expanded)} style={btnStyle('#666')}>
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {testResult && (
        <div style={{ marginTop: 8, fontSize: 11, color: testResult === 'delivered' ? '#00ff88' : '#ff3366' }}>
          {testResult === 'delivered' ? '✓ Test delivered successfully' : '✕ Test delivery failed'}
        </div>
      )}

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden', marginTop: 16 }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
              <Stat label="Deliveries" value={wh.totalDeliveries} />
              <Stat label="Failures" value={wh.consecutiveFailures} color={wh.consecutiveFailures > 0 ? '#ff3366' : '#666'} />
              <Stat label="Events" value={wh.events.length} />
              <Stat label="Created" value={new Date(wh.created).toLocaleDateString()} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Subscribed Events</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {wh.events.map(e => (
                  <span key={e} style={{ fontSize: 10, color: '#00f0ff', background: '#00f0ff11', border: '1px solid #00f0ff33', padding: '2px 8px', borderRadius: 4 }}>{e}</span>
                ))}
              </div>
            </div>
            {wh.filters && Object.keys(wh.filters).length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Filters</div>
                <pre style={{ fontSize: 11, color: '#888', background: '#050510', padding: 8, borderRadius: 6, margin: 0 }}>
                  {JSON.stringify(wh.filters, null, 2)}
                </pre>
              </div>
            )}
            <button onClick={() => onDelete(wh.id)} style={{ ...btnStyle('#ff3366'), marginTop: 8 }}>DELETE WEBHOOK</button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: '#050510', borderRadius: 8, padding: 12, textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: color || '#fff', marginTop: 4 }}>{value}</div>
    </div>
  );
}

function btnStyle(color) {
  return {
    background: 'transparent',
    border: `1px solid ${color}44`,
    color,
    padding: '4px 12px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: 600,
  };
}

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newEvents, setNewEvents] = useState(['cluster.detected', 'alert.high_score']);
  const [minScore, setMinScore] = useState('');
  const [registerResult, setRegisterResult] = useState(null);
  const [events, setEvents] = useState([]);

  const fetchWebhooks = async () => {
    try {
      const res = await fetch(`${API_BASE}/prescience/webhooks`);
      const data = await res.json();
      setWebhooks(data.webhooks || []);
    } catch {} finally { setLoading(false); }
  };

  const fetchEvents = async () => {
    try {
      const res = await fetch(`${API_BASE}/prescience/webhooks/events`);
      setEvents(await res.json());
    } catch {}
  };

  useEffect(() => { fetchWebhooks(); fetchEvents(); }, []);

  const register = async () => {
    try {
      const body = { url: newUrl, label: newLabel, events: newEvents };
      if (minScore) body.filters = { minScore: parseInt(minScore) };
      const res = await fetch(`${API_BASE}/prescience/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setRegisterResult(data);
        setNewUrl(''); setNewLabel(''); setMinScore('');
        fetchWebhooks();
      } else {
        setRegisterResult({ error: data.error });
      }
    } catch (err) {
      setRegisterResult({ error: err.message });
    }
  };

  const deleteWebhook = async (id) => {
    await fetch(`${API_BASE}/prescience/webhooks/${id}`, { method: 'DELETE' });
    fetchWebhooks();
  };

  const toggleWebhook = async (id, active) => {
    await fetch(`${API_BASE}/prescience/webhooks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    });
    fetchWebhooks();
  };

  const inputStyle = {
    background: '#0a0a1a', border: '1px solid #222', color: '#fff',
    padding: '10px 14px', borderRadius: 6, fontSize: 13, width: '100%',
    outline: 'none',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#fff', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <div style={{ position: 'fixed', inset: 0, background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,240,255,0.015) 2px, rgba(0,240,255,0.015) 4px)', pointerEvents: 'none', zIndex: 1 }} />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px', position: 'relative', zIndex: 2 }}>
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <div style={{ fontSize: 10, letterSpacing: 4, color: '#00f0ff', textTransform: 'uppercase', marginBottom: 4 }}>Prescience</div>
          <h1 style={{ fontSize: 32, fontWeight: 200, margin: 0, letterSpacing: -1 }}>Webhook Alerts</h1>
          <p style={{ color: '#555', fontSize: 13, marginTop: 8, fontStyle: 'italic' }}>
            "Push, don't poll." — Register callback URLs for real-time cluster signals.
          </p>
        </motion.div>

        {/* Register Form */}
        <div style={{ marginTop: 32, marginBottom: 32 }}>
          <button onClick={() => setShowRegister(!showRegister)} style={{
            background: showRegister ? '#111' : 'linear-gradient(135deg, #00f0ff22, #ff336622)',
            border: '1px solid #00f0ff44', color: '#00f0ff', padding: '10px 24px',
            borderRadius: 8, cursor: 'pointer', fontSize: 13, letterSpacing: 1,
          }}>
            {showRegister ? 'CANCEL' : '+ REGISTER WEBHOOK'}
          </button>

          <AnimatePresence>
            {showRegister && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ background: '#0a0a1a', border: '1px solid #1a1a2e', borderRadius: 12, padding: 24, marginTop: 16 }}>
                  <div style={{ display: 'grid', gap: 16 }}>
                    <div>
                      <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Callback URL *</label>
                      <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://your-agent.com/webhook" style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Label</label>
                      <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="My Trading Bot" style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Min Score Filter (0-100)</label>
                      <input value={minScore} onChange={e => setMinScore(e.target.value)} placeholder="70" type="number" style={{ ...inputStyle, width: 120 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 8 }}>Events</label>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {(events.events || ['cluster.detected', 'alert.high_score', 'alert.convergence', 'cluster.resolved', 'backtest.completed', 'system.heartbeat']).map(evt => (
                          <label key={evt} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: newEvents.includes(evt) ? '#00f0ff' : '#555', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={newEvents.includes(evt)}
                              onChange={e => {
                                if (e.target.checked) setNewEvents([...newEvents, evt]);
                                else setNewEvents(newEvents.filter(x => x !== evt));
                              }}
                            />
                            {evt}
                          </label>
                        ))}
                      </div>
                    </div>
                    <button onClick={register} disabled={!newUrl} style={{
                      background: newUrl ? 'linear-gradient(135deg, #00ff8822, #00f0ff22)' : '#111',
                      border: '1px solid #00ff8844', color: '#00ff88', padding: '10px 24px',
                      borderRadius: 6, cursor: newUrl ? 'pointer' : 'not-allowed', fontSize: 13,
                    }}>REGISTER</button>
                  </div>

                  {registerResult && (
                    <div style={{
                      marginTop: 16, padding: 16, borderRadius: 8,
                      background: registerResult.error ? '#1a000022' : '#001a0022',
                      border: `1px solid ${registerResult.error ? '#ff3366' : '#00ff88'}44`,
                    }}>
                      {registerResult.error ? (
                        <div style={{ color: '#ff3366', fontSize: 13 }}>✕ {registerResult.error}</div>
                      ) : (
                        <div>
                          <div style={{ color: '#00ff88', fontSize: 13, marginBottom: 8 }}>✓ Webhook registered!</div>
                          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ID: <code style={{ color: '#fff' }}>{registerResult.id}</code></div>
                          <div style={{ fontSize: 11, color: '#ffab40', marginBottom: 4 }}>
                            ⚠ Secret (save this — shown once only):
                          </div>
                          <code style={{ fontSize: 12, color: '#ff3366', background: '#111', padding: '8px 12px', borderRadius: 4, display: 'block', wordBreak: 'break-all' }}>
                            {registerResult.secret}
                          </code>
                          <div style={{ fontSize: 10, color: '#555', marginTop: 8 }}>
                            Verify payloads: HMAC-SHA256(secret, body) === X-Prescience-Signature header
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Webhook List */}
        {loading ? (
          <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 2, repeat: Infinity }}
            style={{ textAlign: 'center', padding: 60, color: '#00f0ff', fontSize: 14 }}>
            Loading webhooks...
          </motion.div>
        ) : webhooks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#333' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔔</div>
            <div style={{ fontSize: 16 }}>No webhooks registered</div>
            <div style={{ fontSize: 12, marginTop: 8 }}>Register a callback URL to receive real-time Prescience alerts</div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 12, color: '#444', marginBottom: 12 }}>{webhooks.length} webhook{webhooks.length !== 1 ? 's' : ''} registered</div>
            <AnimatePresence>
              {webhooks.map(wh => (
                <WebhookCard key={wh.id} wh={wh} onDelete={deleteWebhook} onTest={() => {}} onToggle={toggleWebhook} />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Code Example */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          style={{ marginTop: 48, background: '#050510', border: '1px solid #111', borderRadius: 12, padding: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 400, color: '#666', margin: '0 0 16px', letterSpacing: 2, textTransform: 'uppercase' }}>Quick Integration</h3>
          <pre style={{ fontSize: 12, color: '#888', lineHeight: 1.6, margin: 0, overflow: 'auto' }}>{`// Register your webhook
const res = await fetch('${API_BASE}/prescience/webhooks', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://your-agent.com/prescience-alerts',
    label: 'My Trading Agent',
    events: ['cluster.detected', 'alert.convergence'],
    filters: { minScore: 75 }
  })
});
const { id, secret } = await res.json();

// Verify incoming webhooks (Node.js)
import { createHmac } from 'crypto';
function verify(body, signature, secret) {
  const expected = 'sha256=' + createHmac('sha256', secret)
    .update(JSON.stringify(body)).digest('hex');
  return signature === expected;
}`}</pre>
        </motion.div>

        {/* Footer */}
        <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #111', display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#333' }}>
          <span>Prescience by Epistemic Observatory</span>
          <span>Push, don't poll.</span>
        </div>
      </div>
    </div>
  );
}
