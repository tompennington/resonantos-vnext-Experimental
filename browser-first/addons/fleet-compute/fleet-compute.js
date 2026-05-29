/**
 * fleet-compute.js — ResonantOS Fleet & Compute
 * Data layer: chrome.storage.local (extension) or localStorage (standalone/dev)
 * Probes Ollama on each node via direct fetch with AbortController timeout.
 */

// ── Storage Adapter ────────────────────────────────────────────────────────

const storage = {
  async get(keys) {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      return chrome.storage.local.get(keys);
    }
    const result = {};
    for (const key of (Array.isArray(keys) ? keys : [keys])) {
      const val = localStorage.getItem(key);
      if (val !== null) result[key] = JSON.parse(val);
    }
    return result;
  },
  async set(data) {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      return chrome.storage.local.set(data);
    }
    for (const [key, val] of Object.entries(data)) {
      localStorage.setItem(key, JSON.stringify(val));
    }
  }
};

// ── Storage Key ────────────────────────────────────────────────────────────

const STORAGE_KEY = 'resonantos_fleet';

const SEED_FLEET = [
  {
    id: 'node-localhost',
    name: 'localhost',
    ip: '127.0.0.1',
    port: 11434,
    kind: 'local',
    cpu: 'Local CPU',
    ram: '—',
    os: 'local',
    roles: ['inference'],
    trust: 'host',
    enrollment: 'host',
    status: 'unknown',
    uptime: null,
    notes: 'Default seed node — configure your fleet here',
  },
];

async function loadFleet() {
  const result = await storage.get(STORAGE_KEY);
  if (!result[STORAGE_KEY]) {
    await storage.set({ [STORAGE_KEY]: SEED_FLEET });
    return SEED_FLEET;
  }
  return Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
}

async function saveFleet(fleet) {
  await storage.set({ [STORAGE_KEY]: fleet });
}

// ── Ollama Probe ───────────────────────────────────────────────────────────

async function probeOllama(ip, port = 11434) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`http://${ip}:${port}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { online: false, models: [] };
    const data = await res.json().catch(() => ({}));
    const models = Array.isArray(data.models) ? data.models.map(m => m.name ?? m.model ?? String(m)) : [];
    return { online: true, models };
  } catch {
    clearTimeout(timer);
    return { online: false, models: [] };
  }
}

// ── App State ──────────────────────────────────────────────────────────────

let activeTab = 'fleet';
let liveFleet = [];
let refreshInterval = 30;
let refreshTimer = null;
let secondsSinceRefresh = 0;
let countdownTimer = null;

// ── Utility ────────────────────────────────────────────────────────────────

function el(id) { return document.getElementById(id); }
function qs(sel, ctx = document) { return ctx.querySelector(sel); }
function qsa(sel, ctx = document) { return Array.from(ctx.querySelectorAll(sel)); }

function statusPill(status, label) {
  const l = label || status;
  return `<span class="status-pill ${status}">
    <span class="pill-dot"></span>${l}
  </span>`;
}

function trustBadge(trust) {
  const map = {
    'verified': ['trust-verified', 'Verified'],
    'host':     ['trust-host',     'Host-Key'],
    'pending':  ['trust-pending',  'Pending'],
    'none':     ['trust-none',     'Unverified'],
  };
  const [cls, lbl] = map[trust] || ['trust-none', trust || 'Unverified'];
  return `<span class="trust-badge ${cls}">${lbl}</span>`;
}

function roleTags(roles) {
  if (!roles || !roles.length) return '<span class="info-value muted">—</span>';
  return roles.map((r, i) =>
    `<span class="role-tag ${i % 2 === 0 ? 'teal' : ''}">${esc(r)}</span>`
  ).join('');
}

function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Render: Fleet Tab ──────────────────────────────────────────────────────

function renderFleet() {
  const fleet = liveFleet;
  const online  = fleet.filter(n => n.status === 'online').length;
  const offline = fleet.filter(n => n.status === 'offline').length;
  const pending = fleet.filter(n => n.status === 'pending').length;
  const totalRam = fleet
    .filter(n => n.ram && n.ram !== '—')
    .reduce((acc, n) => acc + parseFloat(String(n.ram).replace(/[^0-9.]/g, '') || 0), 0);

  const summaryEl = el('fleet-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="summary-tile"><div class="tile-label">Online</div><div class="tile-value green">${online}</div><div class="tile-sub">nodes active</div></div>
      <div class="summary-tile"><div class="tile-label">Offline</div><div class="tile-value red">${offline}</div><div class="tile-sub">unreachable</div></div>
      <div class="summary-tile"><div class="tile-label">Pending</div><div class="tile-value amber">${pending}</div><div class="tile-sub">awaiting enrollment</div></div>
      <div class="summary-tile"><div class="tile-label">Fleet RAM</div><div class="tile-value teal">${totalRam.toFixed(0)}<span style="font-size:14px;color:var(--text-sec)">GB</span></div><div class="tile-sub">total across nodes</div></div>
      <div class="summary-tile"><div class="tile-label">Total Nodes</div><div class="tile-value white">${fleet.length}</div><div class="tile-sub">registered</div></div>`;
  }

  const engineEl = el('engine-table-body');
  if (engineEl) {
    engineEl.innerHTML = '<tr><td colspan="4" class="bridge-info">Engine status requires bridge connection</td></tr>';
  }

  const gridEl = el('nodes-grid');
  if (gridEl) {
    if (fleet.length === 0) {
      gridEl.innerHTML = '<div class="empty-state"><div class="empty-icon">◉</div><p>No fleet nodes configured. Click <strong>+ Add Node</strong> to get started.</p></div>';
    } else {
      gridEl.innerHTML = fleet.map(node => {
        const models = Array.isArray(node.models) ? node.models : [];
        const modelDisplay = models.length
          ? `<div class="model-bar">${models.slice(0, 3).map(m => `<span class="model-name">${esc(m)}</span>`).join('')}${models.length > 3 ? `<span style="color:var(--text-dim)">+${models.length - 3} more</span>` : ''}</div>`
          : `<div class="model-bar" style="opacity:0.4"><span class="model-name">no model loaded</span></div>`;

        return `
          <div class="node-card ${esc(node.status || 'unknown')}">
            <div class="node-header">
              <div class="node-name-block">
                <div class="node-name">${esc(node.name)}</div>
                <div class="node-ip">${esc(node.ip || 'No IP assigned')}</div>
              </div>
              ${statusPill(node.status || 'unknown')}
            </div>
            <div class="node-info-grid">
              <div class="info-row"><span class="info-label">Kind</span><span class="info-value">${esc(node.kind || '—')}</span></div>
              <div class="info-row"><span class="info-label">CPU</span><span class="info-value">${esc(node.cpu || '—')}</span></div>
              <div class="info-row"><span class="info-label">RAM</span><span class="info-value highlight">${esc(node.ram || '—')}</span></div>
              <div class="info-row"><span class="info-label">OS</span><span class="info-value">${esc(node.os || '—')}</span></div>
              ${node.uptime ? `<div class="info-row"><span class="info-label">Uptime</span><span class="info-value">${esc(node.uptime)}</span></div>` : ''}
              ${node.notes ? `<div class="info-row"><span class="info-label">Notes</span><span class="info-value muted">${esc(node.notes)}</span></div>` : ''}
            </div>
            <div class="role-tags">${roleTags(node.roles)}</div>
            ${modelDisplay}
            <div class="node-actions">
              <button class="btn-remove-node btn-secondary" data-id="${esc(node.id)}" style="margin-top:8px;font-size:11px;padding:2px 8px;">Remove</button>
            </div>
          </div>`;
      }).join('');

      // Wire up remove buttons
      gridEl.querySelectorAll('.btn-remove-node').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          liveFleet = liveFleet.filter(n => n.id !== id);
          await saveFleet(liveFleet);
          renderAll();
        });
      });
    }
  }

  const fleetBadge = qs('[data-tab="fleet"] .tab-badge');
  if (fleetBadge) fleetBadge.textContent = `${online}/${fleet.length}`;
}

// ── Render: Cloud Tab ──────────────────────────────────────────────────────

function renderCloud() {
  const cloudSummary = el('cloud-summary');
  if (cloudSummary) {
    cloudSummary.innerHTML = `<div class="bridge-info" style="padding:16px;color:var(--text-dim)">Configure cloud providers in extension settings.<br>Cloud status requires bridge connection.</div>`;
  }
  const hetznerEl = el('hetzner-resources');
  if (hetznerEl) hetznerEl.innerHTML = '';
  const servicesEl = el('services-grid');
  if (servicesEl) servicesEl.innerHTML = '';
  const domainsEl = el('domains-grid');
  if (domainsEl) domainsEl.innerHTML = '';
  const miniEl = el('cloud-mini-cards');
  if (miniEl) miniEl.innerHTML = '';
}

// ── Render: Compute Fabric Tab ─────────────────────────────────────────────

function renderFabric() {
  const fleet = liveFleet;
  const verified = fleet.filter(n => n.trust === 'verified').length;
  const unverified = fleet.filter(n => n.trust === 'none').length;
  const pendingTrust = fleet.filter(n => n.trust === 'pending').length;

  const fabricSummaryEl = el('fabric-summary');
  if (fabricSummaryEl) {
    fabricSummaryEl.innerHTML = `
      <div class="summary-tile"><div class="tile-label">Verified</div><div class="tile-value teal">${verified}</div><div class="tile-sub">trusted nodes</div></div>
      <div class="summary-tile"><div class="tile-label">Unverified</div><div class="tile-value amber">${unverified}</div><div class="tile-sub">no trust anchor</div></div>
      <div class="summary-tile"><div class="tile-label">Pending</div><div class="tile-value amber">${pendingTrust}</div><div class="tile-sub">enrollment needed</div></div>
      <div class="summary-tile"><div class="tile-label">Enrolled</div><div class="tile-value white">${fleet.filter(n => n.enrollment === 'host' || n.roles?.length).length}</div><div class="tile-sub">host-mediated</div></div>`;
  }

  const fabricNodesEl = el('fabric-nodes');
  if (fabricNodesEl) {
    fabricNodesEl.innerHTML = fleet.map((node, i) => {
      const enrollSteps = ['key', 'endpoint', 'probe', 'policy'];
      const doneSteps = node.enrollment === 'host' ? (node.status === 'pending' ? 2 : 4) : 1;
      return `
        <div class="fabric-node-row">
          <div style="width:28px;text-align:center;font-size:11px;font-family:var(--font-mono);color:var(--text-dim)">${i + 1}</div>
          ${statusPill(node.status || 'unknown')}
          <div class="fabric-node-name">
            <div class="fabric-node-main">${esc(node.name)}</div>
            <div class="fabric-node-sub">${esc(node.ip || 'No IP')} · ${esc(node.kind || '—')}</div>
          </div>
          ${trustBadge(node.trust)}
          <div class="enroll-step">
            ${enrollSteps.map((s, idx) =>
              `<span class="enroll-num ${idx < doneSteps ? 'done' : ''}" title="${s}">${idx + 1}</span>`
            ).join('')}
          </div>
        </div>`;
    }).join('');
  }

  const policyEl = el('policy-panels');
  if (policyEl) {
    policyEl.innerHTML = `
      <div class="policy-card">
        <div class="policy-card-header"><span class="policy-card-title">Execution Policy</span>${statusPill('online', 'Active')}</div>
        <div class="policy-card-body">
          <div class="policy-rule">No remote exec without host-mediated auth</div>
          <div class="policy-rule">SSH key-based auth only — no password fallback</div>
          <div class="policy-rule">Destructive ops require explicit approval</div>
          <div class="policy-rule">Model inference isolated per node</div>
        </div>
      </div>
      <div class="policy-card">
        <div class="policy-card-header"><span class="policy-card-title">Secrets Policy</span>${statusPill('online', 'Active')}</div>
        <div class="policy-card-body">
          <div class="policy-rule">API keys stay on host — never browser</div>
          <div class="policy-rule">No secret exfiltration via any channel</div>
          <div class="policy-rule">Chrome Storage: local device only</div>
        </div>
      </div>`;
  }

  const fabricBadge = qs('[data-tab="fabric"] .tab-badge');
  if (fabricBadge) fabricBadge.textContent = `${fleet.length} nodes`;
}

// ── Tab Switching ──────────────────────────────────────────────────────────

function switchTab(tab) {
  activeTab = tab;
  qsa('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  qsa('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `panel-${tab}`);
  });
}

// ── Refresh ────────────────────────────────────────────────────────────────

async function doRefresh() {
  secondsSinceRefresh = 0;
  updateLastUpdated();

  try {
    liveFleet = await loadFleet();
    // Probe Ollama for all nodes
    await Promise.all(liveFleet.map(async (node, idx) => {
      if (node.ip) {
        const port = node.port ?? 11434;
        const { online, models } = await probeOllama(node.ip, port);
        liveFleet[idx] = { ...liveFleet[idx], status: online ? 'online' : 'offline', models: online ? models : [] };
      }
    }));
    // Persist probed statuses
    await saveFleet(liveFleet);
  } catch (err) {
    console.warn('[Fleet] refresh error:', err.message);
  }

  renderAll();
}

function renderAll() {
  renderFleet();
  renderCloud();
  renderFabric();

  const pill = el('bridge-status-pill') || qs('.header-status span');
  if (pill) {
    pill.textContent = 'Chrome Storage';
  }

  const statusDot = qs('.status-dot');
  if (statusDot) statusDot.style.background = '#14F195';

  // Update header status text
  const statusSpans = qsa('.header-status span');
  if (statusSpans.length >= 1) statusSpans[0].textContent = 'Chrome Storage';
  if (statusSpans.length >= 3) {
    statusSpans[2].textContent = 'local';
    statusSpans[2].style.fontFamily = 'var(--font-mono)';
    statusSpans[2].style.fontSize = '11px';
    statusSpans[2].style.color = 'var(--text-dim)';
  }
}

function updateLastUpdated() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
  const timeEl = el('last-updated-time');
  const agoEl  = el('last-updated-ago');
  if (timeEl) timeEl.textContent = timeStr;
  if (agoEl)  agoEl.textContent = '0s ago';
  secondsSinceRefresh = 0;
}

function startCountdown() {
  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    secondsSinceRefresh++;
    const agoEl = el('last-updated-ago');
    if (agoEl) {
      agoEl.textContent = secondsSinceRefresh < 60
        ? `${secondsSinceRefresh}s ago`
        : `${Math.floor(secondsSinceRefresh / 60)}m ago`;
    }
  }, 1000);
}

function setRefreshInterval(seconds) {
  refreshInterval = seconds;
  clearInterval(refreshTimer);
  qsa('.refresh-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.interval) === seconds);
  });
  if (seconds > 0) {
    refreshTimer = setInterval(doRefresh, seconds * 1000);
  }
}

// ── Add Node Modal ─────────────────────────────────────────────────────────

function injectAddNodeModal() {
  if (document.getElementById('add-fleet-node-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'add-fleet-node-modal';
  modal.className = 'modal-overlay';
  modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:var(--surface,#13151c);border:1px solid var(--border-bright,#1e2332);border-radius:12px;padding:24px;width:340px;max-width:90vw;">
      <h3 style="margin:0 0 16px;color:var(--text-primary,#eef7f0)">Add Fleet Node</h3>
      <label style="display:block;margin-bottom:8px;font-size:12px;color:var(--text-sec,#a0a8b8)">Name
        <input id="fn-name" type="text" placeholder="e.g. Guardian" style="display:block;width:100%;margin-top:4px;padding:6px 8px;border-radius:6px;border:1px solid #333;background:#1a1d27;color:#eef7f0;font-size:13px;box-sizing:border-box;">
      </label>
      <label style="display:block;margin-bottom:8px;font-size:12px;color:var(--text-sec,#a0a8b8)">IP / Hostname
        <input id="fn-ip" type="text" placeholder="e.g. 192.168.4.88" style="display:block;width:100%;margin-top:4px;padding:6px 8px;border-radius:6px;border:1px solid #333;background:#1a1d27;color:#eef7f0;font-size:13px;box-sizing:border-box;">
      </label>
      <label style="display:block;margin-bottom:8px;font-size:12px;color:var(--text-sec,#a0a8b8)">Port
        <input id="fn-port" type="number" value="11434" style="display:block;width:100%;margin-top:4px;padding:6px 8px;border-radius:6px;border:1px solid #333;background:#1a1d27;color:#eef7f0;font-size:13px;box-sizing:border-box;">
      </label>
      <label style="display:block;margin-bottom:8px;font-size:12px;color:var(--text-sec,#a0a8b8)">CPU
        <input id="fn-cpu" type="text" placeholder="e.g. Apple M4 Pro" style="display:block;width:100%;margin-top:4px;padding:6px 8px;border-radius:6px;border:1px solid #333;background:#1a1d27;color:#eef7f0;font-size:13px;box-sizing:border-box;">
      </label>
      <label style="display:block;margin-bottom:8px;font-size:12px;color:var(--text-sec,#a0a8b8)">RAM (GB)
        <input id="fn-ram" type="text" placeholder="e.g. 32GB" style="display:block;width:100%;margin-top:4px;padding:6px 8px;border-radius:6px;border:1px solid #333;background:#1a1d27;color:#eef7f0;font-size:13px;box-sizing:border-box;">
      </label>
      <label style="display:block;margin-bottom:8px;font-size:12px;color:var(--text-sec,#a0a8b8)">Roles (comma-separated)
        <input id="fn-roles" type="text" placeholder="e.g. inference, training" style="display:block;width:100%;margin-top:4px;padding:6px 8px;border-radius:6px;border:1px solid #333;background:#1a1d27;color:#eef7f0;font-size:13px;box-sizing:border-box;">
      </label>
      <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;">
        <button id="fn-cancel" style="padding:6px 14px;border-radius:6px;border:1px solid #444;background:transparent;color:#a0a8b8;cursor:pointer;">Cancel</button>
        <button id="fn-confirm" style="padding:6px 14px;border-radius:6px;border:none;background:#14F195;color:#080a10;font-weight:700;cursor:pointer;">Add Node</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  document.getElementById('fn-cancel').addEventListener('click', () => { modal.style.display = 'none'; });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

  document.getElementById('fn-confirm').addEventListener('click', async () => {
    const name  = document.getElementById('fn-name').value.trim() || 'New Node';
    const ip    = document.getElementById('fn-ip').value.trim();
    const port  = parseInt(document.getElementById('fn-port').value) || 11434;
    const cpu   = document.getElementById('fn-cpu').value.trim();
    const ram   = document.getElementById('fn-ram').value.trim();
    const roles = document.getElementById('fn-roles').value.split(',').map(r => r.trim()).filter(Boolean);

    const newNode = {
      id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name, ip: ip || null, port,
      kind: ip?.startsWith('192.168') ? 'local' : 'remote',
      cpu: cpu || '—', ram: ram || '—',
      os: '—',
      roles,
      trust: 'none',
      enrollment: 'none',
      status: 'unknown',
    };

    liveFleet = [...liveFleet, newNode];
    await saveFleet(liveFleet);
    modal.style.display = 'none';
    await doRefresh();
  });
}

function injectAddNodeButton() {
  const header = qs('.header-logo')?.parentElement || qs('.app-header');
  if (!header || document.getElementById('btn-fleet-add-node')) return;

  const btn = document.createElement('button');
  btn.id = 'btn-fleet-add-node';
  btn.textContent = '+ Add Node';
  btn.style.cssText = 'padding:6px 12px;border-radius:6px;border:none;background:#14F195;color:#080a10;font-weight:700;cursor:pointer;font-size:12px;margin-right:8px;';
  btn.addEventListener('click', () => {
    injectAddNodeModal();
    document.getElementById('add-fleet-node-modal').style.display = 'flex';
  });

  const spacer = qs('.header-spacer');
  if (spacer) spacer.after(btn);
  else header.appendChild(btn);
}

// ── Init ───────────────────────────────────────────────────────────────────

function init() {
  qsa('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  qsa('.refresh-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const interval = parseInt(btn.dataset.interval);
      setRefreshInterval(interval);
      if (interval > 0) doRefresh();
    });
  });

  renderAll();
  updateLastUpdated();
  startCountdown();
  setRefreshInterval(30);
  switchTab('fleet');
  injectAddNodeButton();
  doRefresh();
}

document.addEventListener('DOMContentLoaded', init);
