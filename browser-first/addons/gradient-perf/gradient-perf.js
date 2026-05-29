/**
 * gradient-perf.js — ResonantOS Gradient Performance
 * Real data via bridge route /perf/status
 */

// ── Bridge Client ──────────────────────────────────────────────────────────

const _cfg = (typeof globalThis !== 'undefined' && globalThis.__RESONANTOS_BRIDGE_CONFIG__) || {};
const _url = _cfg.bridgeUrl ?? 'http://127.0.0.1:47773';
const _tok = _cfg.bridgeToken ?? '';

async function apiFetch(route) {
  const headers = {};
  if (_tok) headers['X-ResonantOS-Bridge-Token'] = _tok;
  const res = await fetch(`${_url}${route}`, { method: 'GET', headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error ?? `Bridge error: HTTP ${res.status}`);
  return data;
}

async function fetchPerfStatus() {
  const data = await apiFetch('/perf/status');
  return {
    training:   Array.isArray(data.training)   ? data.training   : [],
    benchmarks: Array.isArray(data.benchmarks) ? data.benchmarks : [],
    speeds:     Array.isArray(data.speeds)      ? data.speeds      : [],
  };
}

// ── State ──────────────────────────────────────────────────────────────────

let activeTab = 'training';

// ── DOM ────────────────────────────────────────────────────────────────────

const bridgeEl   = document.getElementById('bridge-status');
const errorEl    = document.getElementById('perf-error');
const btnRefresh = document.getElementById('btn-refresh');

// ── Tab Switching ──────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    activeTab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((t) => t.style.display = 'none');
    btn.classList.add('active');
    const tabId = `tab-${activeTab.replace('-', '-')}`;
    const tabEl = document.getElementById(tabId);
    if (tabEl) tabEl.style.display = 'block';
  });
});

// ── Render: Training ───────────────────────────────────────────────────────

function renderTraining(runs) {
  const grid = document.getElementById('training-grid');
  const emptyEl = document.getElementById('training-empty');
  if (!grid) return;

  if (!runs.length) {
    grid.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  grid.innerHTML = runs.map((run) => {
    const pct = run.totalSteps > 0 ? Math.round((run.step / run.totalSteps) * 100) : 0;
    const history = Array.isArray(run.lossHistory) ? run.lossHistory : [];
    const maxLoss = history.length ? Math.max(...history) : 1;
    const lossBars = history.slice(-20).map((v) => {
      const h = maxLoss > 0 ? Math.max(4, Math.round((v / maxLoss) * 32)) : 4;
      return `<div class="loss-bar" style="height:${h}px" title="${v.toFixed(4)}"></div>`;
    }).join('');

    return `
      <div class="run-card">
        <div class="run-header">
          <div class="run-name">${esc(run.name ?? 'Unnamed Run')}</div>
          <span class="run-status ${esc(run.status ?? 'unknown')}">${esc(run.status ?? 'unknown')}</span>
        </div>
        <div class="run-progress">
          <div class="run-progress-bar">
            <div class="run-progress-fill" style="width:${pct}%"></div>
          </div>
          <div class="run-progress-label">
            <span>Step ${run.step?.toLocaleString() ?? 0} / ${run.totalSteps?.toLocaleString() ?? '?'}</span>
            <span>${pct}%</span>
          </div>
        </div>
        <div class="run-meta">
          <div class="run-meta-item">Machine: <span>${esc(run.machine ?? '—')}</span></div>
          <div class="run-meta-item">LR: <span>${esc(run.lr ?? '—')}</span></div>
          <div class="run-meta-item">ETA: <span>${esc(run.eta ?? '—')}</span></div>
          ${history.length ? `<div class="run-meta-item">Latest loss: <span>${history[history.length - 1]?.toFixed(4) ?? '—'}</span></div>` : ''}
        </div>
        ${history.length ? `
          <div class="run-loss">
            <div class="loss-label">Loss history (last ${Math.min(20, history.length)})</div>
            <div class="loss-chart">${lossBars}</div>
          </div>` : ''}
      </div>`;
  }).join('');
}

// ── Render: Benchmarks ─────────────────────────────────────────────────────

function renderBenchmarks(benchmarks) {
  const tbody  = document.getElementById('bench-tbody');
  const emptyEl = document.getElementById('bench-empty');
  if (!tbody) return;

  if (!benchmarks.length) {
    tbody.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  const maxScore = Math.max(...benchmarks.map((b) => b.score ?? 0), 1);
  const sorted = [...benchmarks].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  tbody.innerHTML = sorted.map((bench) => {
    const pct = Math.round(((bench.score ?? 0) / maxScore) * 100);
    return `
      <tr class="${bench.ours ? 'bench-ours' : ''}">
        <td>${esc(bench.model ?? '—')}</td>
        <td class="bench-score">${bench.score ?? 0}</td>
        <td>${bench.ours ? '<span class="bench-ours-badge">Ours</span>' : '—'}</td>
        <td>
          <div class="bench-bar-wrap">
            <div class="bench-bar-fill" style="width:${pct}%"></div>
          </div>
        </td>
      </tr>`;
  }).join('');
}

// ── Render: Fleet Speed ────────────────────────────────────────────────────

function renderSpeeds(speeds) {
  const grid   = document.getElementById('speeds-grid');
  const emptyEl = document.getElementById('speeds-empty');
  if (!grid) return;

  if (!speeds.length) {
    grid.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  grid.innerHTML = speeds.map((node) => {
    const online = node.status === 'online';
    const models = Array.isArray(node.models) ? node.models : [];
    const modelTags = models.slice(0, 5).map((m) => `<span class="speed-model-tag">${esc(m)}</span>`).join('');
    const more = models.length > 5 ? `<span class="speed-model-tag">+${models.length - 5} more</span>` : '';

    return `
      <div class="speed-card">
        <div class="speed-header">
          <div class="speed-name">${esc(node.name ?? node.ip)}</div>
          <span class="speed-online ${online ? 'yes' : 'no'}">${online ? 'Online' : 'Offline'}</span>
        </div>
        <div class="speed-ip">${esc(node.ip)}</div>
        <div class="speed-models">
          <strong>${online ? `${models.length} model${models.length !== 1 ? 's' : ''} via Ollama` : 'Unreachable'}</strong>
          ${online && models.length ? modelTags + more : ''}
          ${online && !models.length ? '<span style="color:var(--text-dim)">No models loaded (Ollama not responding)</span>' : ''}
        </div>
      </div>`;
  }).join('');
}

// ── Status ─────────────────────────────────────────────────────────────────

function setBridgeStatus(ok) {
  if (!bridgeEl) return;
  bridgeEl.textContent = ok ? 'Live' : 'Bridge Offline';
  bridgeEl.className = ok ? 'bridge-pill live' : 'bridge-pill';
}

function showError(msg) {
  if (!errorEl) return;
  errorEl.textContent = msg;
  errorEl.style.display = 'block';
  setTimeout(() => { errorEl.style.display = 'none'; }, 6000);
}

// ── Load ───────────────────────────────────────────────────────────────────

async function loadAndRender() {
  try {
    const { training, benchmarks, speeds } = await fetchPerfStatus();
    renderTraining(training);
    renderBenchmarks(benchmarks);
    renderSpeeds(speeds);
    setBridgeStatus(true);
  } catch (err) {
    setBridgeStatus(false);
    showError(`Bridge disconnected — ${err.message}`);
    renderTraining([]);
    renderBenchmarks([]);
    renderSpeeds([]);
  }
}

btnRefresh?.addEventListener('click', loadAndRender);

// ── Utility ────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Init ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', loadAndRender);
