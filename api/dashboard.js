// Self-contained HTML dashboard - no build step, no framework, just HTML + CSS + JS
// Served from the API itself at GET /ui

export function dashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Epistemic Observatory — Agent Calibration Infrastructure</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#06060c;--card:#0c0c18;--border:#1a1a2e;--fg:#e0e0ff;--muted:#6668;--cyan:#00f0ff;--green:#00ff88;--magenta:#ff00f0;--amber:#f0a000;--red:#ff3366}
body{background:var(--bg);color:var(--fg);font-family:'SF Mono',Monaco,Consolas,monospace;font-size:12px;line-height:1.5;overflow-x:hidden}
a{color:var(--cyan);text-decoration:none}
.grid-bg{background-image:radial-gradient(circle at 50% 50%,#0f0f2010 0%,transparent 60%),linear-gradient(rgba(255,255,255,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.02) 1px,transparent 1px);background-size:100% 100%,40px 40px,40px 40px}

/* Header */
header{position:sticky;top:0;z-index:50;padding:16px 24px;background:linear-gradient(180deg,var(--bg) 60%,transparent);backdrop-filter:blur(12px)}
.header-inner{max-width:1200px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px}
.logo{font-size:18px;font-weight:700;letter-spacing:2px}
.logo .cyan{color:var(--cyan)}
.logo .sep{color:#fff2;margin:0 6px}
.logo .magenta{color:var(--magenta)}
.subtitle{font-size:9px;color:#fff3;letter-spacing:3px;margin-top:2px}
.stats-row{display:flex;gap:20px}
.stat{text-align:right}
.stat-label{font-size:8px;color:#fff3;letter-spacing:2px}
.stat-val{font-size:20px;font-weight:700}
.stat-val.cyan{color:var(--cyan)}
.stat-val.green{color:var(--green)}
.stat-val.magenta{color:var(--magenta)}

/* Cards */
.card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px;transition:border-color .2s}
.card:hover{border-color:#fff1}
.card-title{font-size:9px;color:#fff4;font-weight:700;letter-spacing:3px;margin-bottom:12px;display:flex;align-items:center;gap:6px}
.pulse{width:6px;height:6px;border-radius:50%;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
.pulse.cyan{background:var(--cyan)}
.pulse.green{background:var(--green)}
.pulse.amber{background:var(--amber)}

/* Layout */
main{max-width:1200px;margin:0 auto;padding:80px 16px 60px}
.grid{display:grid;grid-template-columns:2fr 1fr;gap:16px}
@media(max-width:768px){.grid{grid-template-columns:1fr}}
.right-col{display:flex;flex-direction:column;gap:16px}

/* Filters */
.filters{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap}
.filter-btn{font-size:9px;padding:4px 10px;border-radius:20px;border:1px solid #fff1;background:none;color:#fff3;cursor:pointer;font-family:inherit;transition:all .15s}
.filter-btn:hover{border-color:#fff2;color:#fff5}
.filter-btn.active{border-color:color-mix(in srgb,var(--cyan) 60%,transparent);background:color-mix(in srgb,var(--cyan) 10%,transparent);color:var(--cyan)}

/* Prediction rows */
.pred-row{display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid #fff06}
.pred-row:last-child{border-bottom:none}
.pred-status{flex-shrink:0;margin-top:4px}
.pred-body{flex:1;min-width:0}
.pred-meta{display:flex;gap:6px;align-items:center;margin-bottom:2px}
.domain-badge{font-size:8px;font-weight:700;padding:1px 5px;border-radius:3px;border:1px solid}
.pred-id{font-size:9px;color:#fff2;font-family:monospace}
.pred-claim{font-size:11px;color:#fffa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pred-conf{flex-shrink:0;width:56px;text-align:right}
.pred-conf-val{font-size:13px;font-weight:700}
.conf-bar{width:100%;height:3px;background:#fff08;border-radius:2px;margin-top:3px;overflow:hidden}
.conf-fill{height:100%;border-radius:2px;transition:width .6s ease-out}
.pred-list{max-height:600px;overflow-y:auto;padding-right:4px}
.pred-list::-webkit-scrollbar{width:3px}
.pred-list::-webkit-scrollbar-thumb{background:#fff1;border-radius:2px}

/* Calibration gauge */
.gauge-wrap{position:relative;width:100%;height:100px;margin-bottom:8px}
.gauge-svg{width:100%;height:100%}
.gauge-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.gauge-score{font-size:28px;font-weight:700;color:var(--cyan)}
.gauge-label{font-size:9px;color:#fff3}
.gauge-grade{font-size:10px;font-weight:700;color:var(--green)}
.metrics-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.metric-box{background:#fff05;border-radius:6px;padding:10px;text-align:center}
.metric-val{font-size:18px;font-weight:700}
.metric-label{font-size:8px;color:#fff3}

/* Domain bars */
.domain-row{margin-bottom:6px}
.domain-header{display:flex;justify-content:space-between;font-size:9px;margin-bottom:2px}
.domain-bar{width:100%;height:5px;background:#fff05;border-radius:3px;overflow:hidden}
.domain-fill{height:100%;border-radius:3px;transition:width .5s}

/* Trust lookup */
.lookup-input{width:100%;background:#fff05;border:1px solid #fff10;border-radius:5px;padding:6px 8px;font-size:10px;color:var(--fg);font-family:inherit;outline:none}
.lookup-input:focus{border-color:color-mix(in srgb,var(--cyan) 40%,transparent)}
.lookup-btn{padding:6px 12px;background:color-mix(in srgb,var(--cyan) 10%,transparent);border:1px solid color-mix(in srgb,var(--cyan) 30%,transparent);border-radius:5px;color:var(--cyan);font-size:9px;font-weight:700;cursor:pointer;font-family:inherit}
.lookup-btn:hover{background:color-mix(in srgb,var(--cyan) 20%,transparent)}
.lookup-result{background:#fff05;border-radius:5px;padding:10px;margin-top:8px;font-size:10px}
.lookup-row{display:flex;justify-content:space-between;padding:2px 0}

/* SB Resolution */
.sb-card{border-left:3px solid}
.sb-correct{border-color:var(--green)}
.sb-wrong{border-color:var(--red)}
.sb-pending{border-color:var(--amber)}
.sb-outcome{font-size:10px;font-weight:700;padding:1px 6px;border-radius:3px}

/* API endpoints */
.endpoint{display:flex;gap:8px;padding:4px 0;border-bottom:1px solid #fff05;font-size:10px}
.endpoint:last-child{border:none}
.method{font-weight:700;color:var(--green);width:36px;flex-shrink:0}
.method.post{color:var(--amber)}
.path{color:var(--cyan)}
.desc{color:#fff4;margin-left:auto}

/* Footer */
footer{position:fixed;bottom:0;left:0;right:0;padding:10px 24px;background:linear-gradient(0deg,var(--bg) 60%,transparent);font-size:8px;color:#fff2;display:flex;justify-content:space-between}
</style>
</head>
<body class="grid-bg">
<header>
<div class="header-inner">
  <div>
    <div class="logo"><span class="cyan">EPISTEMIC</span><span class="sep">/</span><span class="magenta">OBSERVATORY</span></div>
    <div class="subtitle">VERIFIABLE CALIBRATION PRIMITIVE FOR AI AGENTS</div>
  </div>
  <div class="stats-row">
    <div class="stat"><div class="stat-label">PREDICTIONS</div><div class="stat-val cyan" id="s-total">—</div></div>
    <div class="stat"><div class="stat-label">RESOLVED</div><div class="stat-val green" id="s-resolved">—</div></div>
    <div class="stat"><div class="stat-label">BRIER</div><div class="stat-val magenta" id="s-brier">—</div></div>
  </div>
</div>
</header>

<main>

<div class="filters" id="filters"></div>

<div class="grid">
<div>
  <!-- Prediction Feed -->
  <div class="card">
    <div class="card-title"><span class="pulse cyan"></span> PREDICTION FEED</div>
    <div class="pred-list" id="pred-list"></div>
  </div>

  <!-- Super Bowl Resolution Card -->
  <div class="card" style="margin-top:16px" id="sb-section">
    <div class="card-title"><span class="pulse green"></span> SUPER BOWL LX — RESOLVED</div>
    <div id="sb-list"></div>
  </div>

  <!-- API Endpoints -->
  <div class="card" style="margin-top:16px">
    <div class="card-title">API ENDPOINTS</div>
    <div id="endpoints"></div>
  </div>
</div>

<div class="right-col">
  <!-- API Status -->
  <div class="card">
    <div class="card-title"><span class="pulse green" id="status-dot"></span> API STATUS</div>
    <div id="api-status"></div>
  </div>

  <!-- Calibration -->
  <div class="card">
    <div class="card-title">CALIBRATION METRICS</div>
    <div id="calibration"></div>
  </div>

  <!-- Domain Coverage -->
  <div class="card">
    <div class="card-title">DOMAIN COVERAGE</div>
    <div id="domains"></div>
  </div>

  <!-- Trust Lookup -->
  <div class="card">
    <div class="card-title">AGENT LOOKUP</div>
    <div style="display:flex;gap:6px;margin-bottom:8px">
      <input class="lookup-input" id="lookup-id" placeholder="agent_id" />
      <button class="lookup-btn" onclick="lookupAgent()">LOOKUP</button>
    </div>
    <div id="lookup-result"></div>
    <div style="font-size:8px;color:#fff2;margin-top:8px">Register via POST /register · Badge at GET /badge/:agent</div>
  </div>

  <!-- Game Theory -->
  <div class="card">
    <div class="card-title">GAME THEORY</div>
    <div style="font-size:10px;color:#fff6;line-height:1.6">
      <p>Calibration is the only unfakeable signal.</p>
      <p style="margin-top:6px;color:#fff4">You cannot game Brier scores without being right. Commit-reveal eliminates hindsight. Trust-weighted consensus rewards accuracy over volume.</p>
      <p style="margin-top:6px;color:var(--cyan)">One well-calibrated agent outweighs ten noisy ones.</p>
    </div>
  </div>
</div>
</div>

</main>

<footer>
  <span>BUILT BY 0xLaVaN · MOLTIVERSE HACKATHON 2026</span>
  <span style="display:flex;align-items:center;gap:8px">
    <span style="font-family:monospace">epistemic-observatory.vercel.app</span>
    <span class="pulse green" style="display:inline-block"></span> LIVE
  </span>
</footer>

<script>
const API = '';  // same origin
const domainColors = {Trading:'#00f0ff',Meta:'#ff00f0',AI:'#f0a000',Crypto:'#00ff88',Ecosystem:'#7b61ff',Token:'#ff3366',Policy:'#00b8d4',NHI:'#e040fb',Product:'#ffab40',Social:'#69f0ae',Platforms:'#ff6e40'};

function getDomain(p) {
  const d = p.date || '';
  if (d === '✓') return 'Resolved';
  if (Object.keys(domainColors).includes(d)) return d;
  const c = (p.claim||'').toLowerCase();
  if (c.includes('btc')||c.includes('eth')||c.includes('trading')) return 'Trading';
  if (c.includes('bot')||c.includes('consensus')) return 'Meta';
  if (c.includes('gpt')||c.includes('ai')) return 'AI';
  return 'Meta';
}
function getConf(p) { return p.confidence > 1 ? p.confidence : Math.round(p.confidence * 100); }

let allPreds = [];
let currentFilter = 'all';

function renderPreds(preds) {
  const el = document.getElementById('pred-list');
  if (!preds.length) { el.innerHTML = '<div style="color:#fff3;padding:20px;text-align:center">No predictions match filter</div>'; return; }
  el.innerHTML = preds.map(p => {
    const domain = getDomain(p);
    const conf = getConf(p);
    const color = domainColors[domain] || '#888';
    const isResolved = p.resolved === true;
    const statusSVG = isResolved
      ? (p.outcome === true || p.outcome === 'YES'
        ? '<svg width="10" height="10" viewBox="0 0 10 10"><polygon points="5,0 10,5 5,10 0,5" fill="#00ff88"/></svg>'
        : '<svg width="10" height="10" viewBox="0 0 10 10"><line x1="1" y1="1" x2="9" y2="9" stroke="#ff3366" stroke-width="2"/><line x1="9" y1="1" x2="1" y2="9" stroke="#ff3366" stroke-width="2"/></svg>')
      : '<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="3.5" fill="none" stroke="#00f0ff" stroke-width="1.5" opacity="0.7"/></svg>';
    return '<div class="pred-row">'
      + '<div class="pred-status">'+statusSVG+'</div>'
      + '<div class="pred-body">'
      + '<div class="pred-meta"><span class="domain-badge" style="color:'+color+';border-color:'+color+'40;background:'+color+'10">'+domain.toUpperCase()+'</span><span class="pred-id">'+p.id+'</span></div>'
      + '<div class="pred-claim">'+esc(p.claim)+'</div>'
      + '</div>'
      + '<div class="pred-conf"><div class="pred-conf-val" style="color:'+color+'">'+conf+'%</div><div class="conf-bar"><div class="conf-fill" style="width:'+conf+'%;background:'+color+'"></div></div></div>'
      + '</div>';
  }).join('');
}

function renderFilters() {
  const domains = new Set();
  allPreds.forEach(p => { const d = getDomain(p); if (d !== 'Resolved') domains.add(d); });
  const el = document.getElementById('filters');
  const items = ['all', 'resolved', ...Array.from(domains).sort()];
  el.innerHTML = items.map(f =>
    '<button class="filter-btn'+(f===currentFilter?' active':'')+'" onclick="setFilter(\\''+f+'\\')">'+f.toUpperCase()+'</button>'
  ).join('');
}

function setFilter(f) {
  currentFilter = f;
  renderFilters();
  const filtered = f === 'all' ? allPreds : f === 'resolved' ? allPreds.filter(p => p.resolved === true) : allPreds.filter(p => getDomain(p) === f);
  renderPreds(filtered);
}

function renderCalibration(cal) {
  const el = document.getElementById('calibration');
  if (!cal || cal.brier_score == null) {
    el.innerHTML = '<div style="text-align:center;padding:16px;color:#fff3">Awaiting resolutions<br><span style="font-size:9px">'+(cal?.total_predictions||0)+' predictions tracked</span></div>';
    return;
  }
  const b = cal.brier_score;
  const pct = Math.round((1 - b) * 100);
  const grade = b < 0.1 ? 'EXCELLENT' : b < 0.2 ? 'GOOD' : b < 0.33 ? 'FAIR' : 'DEVELOPING';
  el.innerHTML = '<div class="gauge-wrap"><svg class="gauge-svg" viewBox="0 0 200 110">'
    + '<path d="M 20 95 A 80 80 0 0 1 180 95" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="10" stroke-linecap="round"/>'
    + '<path d="M 20 95 A 80 80 0 0 1 180 95" fill="none" stroke="var(--cyan)" stroke-width="10" stroke-linecap="round" stroke-dasharray="'+Math.round(pct*2.51)+' 251"/>'
    + '</svg><div class="gauge-center"><div class="gauge-score">'+(b*100).toFixed(1)+'</div><div class="gauge-label">BRIER SCORE</div><div class="gauge-grade">'+grade+'</div></div></div>'
    + '<div class="metrics-grid">'
    + '<div class="metric-box"><div class="metric-val" style="color:var(--green)">'+(cal.accuracy*100).toFixed(0)+'%</div><div class="metric-label">ACCURACY</div></div>'
    + '<div class="metric-box"><div class="metric-val" style="color:var(--magenta)">'+cal.total_resolved+'</div><div class="metric-label">RESOLVED</div></div>'
    + '</div>';
}

function renderDomains(preds) {
  const map = {};
  preds.forEach(p => {
    const d = getDomain(p);
    if (d === 'Resolved') return;
    if (!map[d]) map[d] = {count:0,totalConf:0};
    map[d].count++;
    map[d].totalConf += getConf(p);
  });
  const entries = Object.entries(map).map(([name,data]) => ({name,count:data.count,avg:Math.round(data.totalConf/data.count)})).sort((a,b)=>b.count-a.count);
  const max = Math.max(...entries.map(e=>e.count),1);
  document.getElementById('domains').innerHTML = entries.map(d => {
    const color = domainColors[d.name]||'#888';
    return '<div class="domain-row"><div class="domain-header"><span style="color:'+color+'">'+d.name+'</span><span style="color:#fff3">'+d.count+' · avg '+d.avg+'%</span></div><div class="domain-bar"><div class="domain-fill" style="width:'+(d.count/max*100)+'%;background:'+color+'"></div></div></div>';
  }).join('');
}

function renderSuperBowl(preds) {
  const sb = preds.filter(p => p.id && p.id.startsWith('SB'));
  if (!sb.length) { document.getElementById('sb-section').style.display='none'; return; }
  document.getElementById('sb-list').innerHTML = sb.map(p => {
    const conf = getConf(p);
    const resolved = p.resolved === true;
    const correct = resolved && (p.outcome === true || p.outcome === 'YES');
    const wrong = resolved && !correct;
    const cls = resolved ? (correct ? 'sb-correct' : 'sb-wrong') : 'sb-pending';
    const label = resolved ? (correct ? '<span class="sb-outcome" style="color:var(--green);background:#00ff8815">✓ CORRECT</span>' : '<span class="sb-outcome" style="color:var(--red);background:#ff336615">✗ WRONG</span>') : '<span class="sb-outcome" style="color:var(--amber);background:#f0a00015">PENDING</span>';
    return '<div class="card sb-card '+cls+'" style="padding:10px;margin-bottom:8px"><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:11px;color:#fffc">'+esc(p.claim)+'</span>'+label+'</div><div style="display:flex;gap:16px;margin-top:4px;font-size:9px;color:#fff4"><span>Confidence: <b style="color:var(--cyan)">'+conf+'%</b></span><span>ID: '+p.id+'</span></div></div>';
  }).join('');
}

function renderEndpoints() {
  const eps = [
    ['GET','/predictions','All predictions with reasoning'],
    ['GET','/calibration','Brier score & accuracy metrics'],
    ['GET','/edge','High-edge opportunities'],
    ['GET','/trust-score','Verifiable trust score'],
    ['GET','/leaderboard','Ranked agents by calibration'],
    ['GET','/badge','Embeddable SVG trust badge'],
    ['GET','/badge/:agent','Badge for any registered agent'],
    ['POST','/register','Register predictions for comparison'],
    ['POST','/duel/challenge','Issue a prediction challenge'],
    ['POST','/commit','Commit prediction hash (pre-outcome)'],
    ['POST','/reveal','Reveal & verify against commit'],
    ['POST','/consensus','Create consensus question'],
    ['POST','/consensus/:id/view','Submit probability estimate'],
    ['POST','/compare','Head-to-head vs 0xLaVaN'],
    ['GET','/ui','This dashboard'],
  ];
  document.getElementById('endpoints').innerHTML = eps.map(([m,p,d]) =>
    '<div class="endpoint"><span class="method'+(m==='POST'?' post':'')+'">'+m+'</span><span class="path">'+p+'</span><span class="desc">'+d+'</span></div>'
  ).join('');
}

async function lookupAgent() {
  const id = document.getElementById('lookup-id').value.trim();
  if (!id) return;
  const el = document.getElementById('lookup-result');
  el.innerHTML = '<div style="color:#fff3">Looking up...</div>';
  try {
    const res = await fetch(API+'/trust-score/'+encodeURIComponent(id));
    const data = await res.json();
    if (data.error) { el.innerHTML = '<div class="lookup-result" style="color:var(--red)">'+esc(data.error)+'</div>'; return; }
    const ts = data.trust_score;
    el.innerHTML = '<div class="lookup-result">'
      + (ts ? [
        '<div class="lookup-row"><span style="color:#fff4">Agent</span><span>'+esc(data.agent)+'</span></div>',
        '<div class="lookup-row"><span style="color:#fff4">Score</span><span style="color:'+(ts.grade==='A'?'var(--green)':ts.grade==='B'?'var(--cyan)':'var(--amber)')+'"><b>'+ts.score+'/100 ('+ts.grade+')</b></span></div>',
        '<div class="lookup-row"><span style="color:#fff4">Brier</span><span>'+(data.calibration?.brier_score?.toFixed(3)||'—')+'</span></div>',
        '<div class="lookup-row"><span style="color:#fff4">Resolved</span><span>'+(data.calibration?.total_resolved||0)+'</span></div>',
      ].join('') : '<span style="color:#fff4">'+(data.message||'Not enough data')+'</span>')
      + '</div>';
  } catch(e) { el.innerHTML = '<div class="lookup-result" style="color:var(--red)">'+e.message+'</div>'; }
}

function esc(s) { const d=document.createElement('div');d.textContent=s||'';return d.innerHTML; }

async function init() {
  const t0 = Date.now();
  try {
    const [predRes, calRes] = await Promise.all([
      fetch(API+'/predictions?limit=200'),
      fetch(API+'/calibration'),
    ]);
    const latency = Date.now() - t0;

    if (predRes.ok) {
      const data = await predRes.json();
      // Deduplicate
      const seen = new Set();
      allPreds = (data.predictions||[]).filter(p => { const k=p.id+'|'+p.claim; if(seen.has(k))return false; seen.add(k); return true; });
      document.getElementById('s-total').textContent = allPreds.length;
      document.getElementById('s-resolved').textContent = allPreds.filter(p=>p.resolved===true).length;
      renderPreds(allPreds);
      renderFilters();
      renderDomains(allPreds);
      renderSuperBowl(allPreds);
    }

    if (calRes.ok) {
      const cal = await calRes.json();
      renderCalibration(cal);
      document.getElementById('s-brier').textContent = cal.brier_score != null ? cal.brier_score.toFixed(3) : '—';
    }

    document.getElementById('api-status').innerHTML = [
      '<div class="lookup-row"><span style="color:#fff4">Status</span><span style="color:var(--green);font-weight:700">ONLINE</span></div>',
      '<div class="lookup-row"><span style="color:#fff4">Latency</span><span>'+latency+'ms</span></div>',
      '<div class="lookup-row"><span style="color:#fff4">Endpoints</span><span>16</span></div>',
      '<div class="lookup-row"><span style="color:#fff4">Version</span><span>0.2.0</span></div>',
    ].join('');

  } catch(e) {
    document.getElementById('api-status').innerHTML = '<div style="color:var(--red)">OFFLINE: '+esc(e.message)+'</div>';
    document.getElementById('status-dot').style.background = 'var(--red)';
  }

  renderEndpoints();
}

init();
setInterval(init, 60000);
</script>
</body>
</html>`;
}
