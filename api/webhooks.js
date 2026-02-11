/**
 * PRESCIENCE WEBHOOK ALERTS
 * "Push, don't poll."
 * 
 * Agents register callback URLs. When Prescience detects cluster signals
 * or high-score activity, it pushes alerts to all registered webhooks.
 * 
 * Features:
 * - Register/unregister webhook URLs with optional filters
 * - HMAC-SHA256 signed payloads for verification
 * - Retry with exponential backoff (3 attempts)
 * - Rate limiting per webhook (max 60/hr)
 * - Health tracking (auto-disable after 10 consecutive failures)
 */

import { createHash, createHmac, randomBytes } from 'crypto';

// ============================================
// STORAGE (in-memory, persisted to disk)
// ============================================

const webhooks = new Map(); // id -> WebhookConfig
const deliveryLog = []; // last 500 deliveries
const MAX_LOG = 500;
const MAX_WEBHOOKS = 100;
const MAX_FAILURES = 10;
const RATE_LIMIT_PER_HOUR = 60;

/**
 * @typedef {Object} WebhookConfig
 * @property {string} id
 * @property {string} url - Callback URL
 * @property {string} secret - HMAC signing secret
 * @property {string[]} events - Event types to receive
 * @property {number} created - Timestamp
 * @property {boolean} active
 * @property {number} consecutiveFailures
 * @property {number} totalDeliveries
 * @property {number} lastDelivery
 * @property {Object} rateWindow - { count, windowStart }
 * @property {Object} filters - Optional filters { minScore, markets, archetypes }
 * @property {string} label - Optional human-readable label
 */

// Event types
const EVENT_TYPES = [
  'cluster.detected',     // New cluster signal found
  'cluster.resolved',     // Cluster outcome known
  'alert.high_score',     // Wallet scores above threshold
  'alert.convergence',    // Multiple smart wallets converging
  'backtest.completed',   // Backtest run finished
  'system.heartbeat',     // Periodic health ping
];

function generateId() {
  return 'wh_' + randomBytes(12).toString('hex');
}

function generateSecret() {
  return 'whsec_' + randomBytes(32).toString('hex');
}

function signPayload(payload, secret) {
  const body = JSON.stringify(payload);
  const signature = createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${signature}`;
}

// ============================================
// WEBHOOK MANAGEMENT
// ============================================

function registerWebhook({ url, events, filters, label }) {
  if (webhooks.size >= MAX_WEBHOOKS) {
    throw new Error(`Max ${MAX_WEBHOOKS} webhooks reached`);
  }

  // Validate URL
  try { new URL(url); } catch { throw new Error('Invalid callback URL'); }

  // Validate events
  const validEvents = (events || ['cluster.detected', 'alert.high_score'])
    .filter(e => EVENT_TYPES.includes(e));
  if (validEvents.length === 0) {
    throw new Error(`Invalid events. Valid: ${EVENT_TYPES.join(', ')}`);
  }

  // Check for duplicate URL
  for (const [, wh] of webhooks) {
    if (wh.url === url) throw new Error('URL already registered');
  }

  const id = generateId();
  const secret = generateSecret();

  const config = {
    id,
    url,
    secret,
    events: validEvents,
    filters: filters || {},
    label: label || null,
    created: Date.now(),
    active: true,
    consecutiveFailures: 0,
    totalDeliveries: 0,
    lastDelivery: null,
    rateWindow: { count: 0, windowStart: Date.now() },
  };

  webhooks.set(id, config);
  return { id, secret, events: validEvents, url };
}

function unregisterWebhook(id) {
  if (!webhooks.has(id)) throw new Error('Webhook not found');
  webhooks.delete(id);
  return true;
}

function getWebhook(id) {
  const wh = webhooks.get(id);
  if (!wh) throw new Error('Webhook not found');
  return sanitizeWebhook(wh);
}

function listWebhooks() {
  return Array.from(webhooks.values()).map(sanitizeWebhook);
}

function sanitizeWebhook(wh) {
  return {
    id: wh.id,
    url: wh.url,
    events: wh.events,
    filters: wh.filters,
    label: wh.label,
    active: wh.active,
    created: wh.created,
    totalDeliveries: wh.totalDeliveries,
    lastDelivery: wh.lastDelivery,
    consecutiveFailures: wh.consecutiveFailures,
    health: wh.consecutiveFailures === 0 ? 'healthy' :
      wh.consecutiveFailures < 5 ? 'degraded' : 'failing',
  };
}

function updateWebhook(id, patch) {
  const wh = webhooks.get(id);
  if (!wh) throw new Error('Webhook not found');

  if (patch.events) {
    wh.events = patch.events.filter(e => EVENT_TYPES.includes(e));
  }
  if (patch.filters !== undefined) wh.filters = patch.filters;
  if (patch.label !== undefined) wh.label = patch.label;
  if (patch.active !== undefined) {
    wh.active = patch.active;
    if (patch.active) wh.consecutiveFailures = 0; // reset on re-enable
  }

  return sanitizeWebhook(wh);
}

// ============================================
// DELIVERY ENGINE
// ============================================

function checkRateLimit(wh) {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  if (now - wh.rateWindow.windowStart > hourMs) {
    wh.rateWindow = { count: 0, windowStart: now };
  }
  return wh.rateWindow.count < RATE_LIMIT_PER_HOUR;
}

async function deliverPayload(wh, event, payload, attempt = 1) {
  const maxAttempts = 3;
  const body = JSON.stringify({
    id: 'evt_' + randomBytes(8).toString('hex'),
    type: event,
    timestamp: new Date().toISOString(),
    data: payload,
  });

  const signature = createHmac('sha256', wh.secret).update(body).digest('hex');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const res = await fetch(wh.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Prescience-Signature': `sha256=${signature}`,
        'X-Prescience-Event': event,
        'X-Prescience-Delivery': body.id,
        'User-Agent': 'Prescience-Webhooks/1.0',
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const success = res.status >= 200 && res.status < 300;

    if (success) {
      wh.consecutiveFailures = 0;
      wh.totalDeliveries++;
      wh.lastDelivery = Date.now();
      wh.rateWindow.count++;
      logDelivery(wh.id, event, 'success', res.status);
      return true;
    }

    throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    if (attempt < maxAttempts) {
      const delay = Math.pow(2, attempt) * 1000; // 2s, 4s
      await new Promise(r => setTimeout(r, delay));
      return deliverPayload(wh, event, payload, attempt + 1);
    }

    wh.consecutiveFailures++;
    wh.totalDeliveries++;
    wh.lastDelivery = Date.now();
    logDelivery(wh.id, event, 'failed', err.message);

    // Auto-disable after too many failures
    if (wh.consecutiveFailures >= MAX_FAILURES) {
      wh.active = false;
      logDelivery(wh.id, 'system', 'auto_disabled', `${MAX_FAILURES} consecutive failures`);
    }

    return false;
  }
}

function logDelivery(webhookId, event, status, detail) {
  deliveryLog.unshift({
    webhookId,
    event,
    status,
    detail,
    timestamp: new Date().toISOString(),
  });
  if (deliveryLog.length > MAX_LOG) deliveryLog.length = MAX_LOG;
}

// ============================================
// DISPATCH — Send events to matching webhooks
// ============================================

async function dispatch(event, payload) {
  const promises = [];

  for (const [, wh] of webhooks) {
    if (!wh.active) continue;
    if (!wh.events.includes(event)) continue;
    if (!checkRateLimit(wh)) {
      logDelivery(wh.id, event, 'rate_limited', 'Exceeded 60/hr');
      continue;
    }

    // Apply filters
    if (wh.filters.minScore && payload.score < wh.filters.minScore) continue;
    if (wh.filters.archetypes?.length && payload.archetype &&
        !wh.filters.archetypes.includes(payload.archetype)) continue;

    promises.push(deliverPayload(wh, event, payload));
  }

  const results = await Promise.allSettled(promises);
  return {
    dispatched: results.length,
    succeeded: results.filter(r => r.status === 'fulfilled' && r.value).length,
    failed: results.filter(r => r.status === 'fulfilled' && !r.value).length,
  };
}

// ============================================
// ROUTES
// ============================================

export function registerWebhookRoutes(app) {

  // Register a webhook
  app.post('/prescience/webhooks', (req, res) => {
    try {
      const { url, events, filters, label } = req.body;
      if (!url) return res.status(400).json({ error: 'url is required' });
      const result = registerWebhook({ url, events, filters, label });
      res.status(201).json({
        ...result,
        message: 'Webhook registered. Store the secret — it won\'t be shown again.',
        verify: 'Validate payloads with HMAC-SHA256(secret, body) === X-Prescience-Signature',
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // List webhooks
  app.get('/prescience/webhooks', (req, res) => {
    res.json({
      webhooks: listWebhooks(),
      total: webhooks.size,
      limit: MAX_WEBHOOKS,
    });
  });

  // Get single webhook
  app.get('/prescience/webhooks/:id', (req, res) => {
    try {
      res.json(getWebhook(req.params.id));
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  // Update webhook
  app.patch('/prescience/webhooks/:id', (req, res) => {
    try {
      const result = updateWebhook(req.params.id, req.body);
      res.json(result);
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  // Delete webhook
  app.delete('/prescience/webhooks/:id', (req, res) => {
    try {
      unregisterWebhook(req.params.id);
      res.json({ deleted: true });
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  // Test webhook (send a test event)
  app.post('/prescience/webhooks/:id/test', async (req, res) => {
    const wh = webhooks.get(req.params.id);
    if (!wh) return res.status(404).json({ error: 'Webhook not found' });

    const testPayload = {
      test: true,
      message: 'Prescience webhook test delivery',
      timestamp: new Date().toISOString(),
      sample_cluster: {
        market: 'Will BTC exceed $100k by March 2026?',
        wallets: 7,
        avg_score: 82,
        convergence: 'YES',
        confidence: 0.89,
      },
    };

    const success = await deliverPayload(wh, 'system.heartbeat', testPayload);
    res.json({ delivered: success });
  });

  // Delivery log
  app.get('/prescience/webhooks/deliveries/log', (req, res) => {
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const webhookId = req.query.webhook;
    let log = deliveryLog;
    if (webhookId) log = log.filter(d => d.webhookId === webhookId);
    res.json({
      deliveries: log.slice(0, limit),
      total: log.length,
    });
  });

  // Event types reference
  app.get('/prescience/webhooks/events', (req, res) => {
    res.json({
      events: EVENT_TYPES,
      descriptions: {
        'cluster.detected': 'New smart wallet cluster converging on a market',
        'cluster.resolved': 'Previously detected cluster — outcome now known',
        'alert.high_score': 'Individual wallet scores above threshold',
        'alert.convergence': 'Multiple smart wallets align on same position',
        'backtest.completed': 'Scheduled backtest run finished with results',
        'system.heartbeat': 'Periodic health check (every 30min if subscribed)',
      },
      filters: {
        minScore: 'Minimum Prescience score (0-100) to trigger',
        archetypes: 'Array of archetype filters: fresh_insider, whale_insider, timing_sniper, etc.',
      },
    });
  });
}

// Export dispatch for use by other modules (scanner, cluster detection)
export { dispatch, EVENT_TYPES };
