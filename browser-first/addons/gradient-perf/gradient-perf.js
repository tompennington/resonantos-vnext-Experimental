/**
 * gradient-perf.js — ResonantOS Gradient Performance
 * Data layer: chrome.storage.local (extension) or localStorage (standalone/dev)
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

// ── Storage Keys ───────────────────────────────────────────────────────────

const KEY_TRAINING   = 'resonantos_training_runs';
const KEY_BENCHMARKS = 'resonantos_benchmarks';
const KEY_FLEET      = 'resonantos_fleet';

const SEED_TRAINING = [
  {
    id: 'run-demo-1',
    name: 'Ternary Sunrise v1',
    machine: 'Blade R730',
    totalSteps: 10000,
    step: 2350,
    lr: '1e-4',
    status: 'running',
    eta: '~6h',
    lossHistory: [2.4, 2.1, 1.9, 1.8, 1.75, 1.72, 1.68, 1.65, 1.62, 1.59],
  },
];

const SEED_BENCHMARKS = [
  { id: 'bench-gpt4',    model: 'GPT-4',       score: 86,  ours: false },
  { id: 'bench-ours-v1', model: 'Ternary v0.1', score: 60,  ours: true  },
];

async function loadTrainingRuns() {
  const result = await storage.get(KEY_TRAINING);
  if (!result[KEY_TRAINING]) {
    await storage.set({ [KEY_TRAINING]: SEED_TRAINING });
    return SEED_TRAINING;
  }
  return Array.isArray(result[KEY_TRAINING]) ? result[KEY_TRAINING] : [];
}

async function loadBenchmarks() {
  const result = await storage.get(KEY_BENCHMARKS);
  if (!result[KEY_BENCHMARKS]) {
    await storage.set({ [KEY_BENCHMARKS]: SEED_BENCHMARKS });
    return SEED_BENCHMARKS;
  }
  return Array.isArray(result[KEY_BENCHMARKS]) ? result[KEY_BENCHMARKS] : [];
}

async function loadFleetNodes() {
  const result = await storage.get(KEY_FLEET);
  return Array.isArray(result[KEY_FLEET]) ? result[KEY_FLEET] : [];
}

async function saveTrainingRuns(runs) {
  await storage.set({ [KEY_TRAINING]: runs });
}

async function saveBenchmarks(benchmarks) {
  await storage.set({ [KEY_BENCHMARKS]: benchmarks });
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

// ── State ──────────────────────────────────────────────────────────────────

let activeTab = 'training';
let _training   = [];
let _benchmarks = [];

// ── DOM ────────────────────────────────────────────────────────────────────

const storageEl  = document.getElementById('bridge-status');
const errorEl    = document.getElementById('perf-error');
const btnRefresh = document.getElementById('btn-refresh');

// ── Tab Switching ──────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    activeTab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((t) => { t.style.display = 'none'; });
    btn.classList.add('active');
    const tabEl = document.getElementById(`tab-${activeTab}`);
    if (tabEl) tabEl.style.display = 'block';
  });
});

// ── Render: Training ───────────────────────────────────────────────────────

function renderTraining(runs) {
  const grid    = document.getElementById('training-grid');
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
          <div class="run-progress-bar"><div class="run-progress-fill" style="width:${pct}%"></div></div>
          <div class="run-progress-label">
            <span>Step ${(run.step ?? 0).toLocaleString()} / ${(run.totalSteps ?? 0).toLocaleString()}</span>
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
        <div class="run-actions" style="margin-top:8px;display:flex;gap:6px;align-items:center;">
          <input class="run-step-input" data-id="${esc(run.id)}" type="number" value="${run.step ?? 0}" min="0" style="width:90px;padding:3px 6px;border-radius:4px;border:1px solid #333;background:#1a1d27;color:#eef7f0;font-size:12px;" title="Update step count">
          <button class="btn-update-step btn-secondary" data-id="${esc(run.id)}" style="font-size:11px;padding:3px 8px;">Update Step</button>
          <button class="btn-delete-run btn-secondary" data-id="${esc(run.id)}" style="font-size:11px;padding:3px 8px;color:#ff6b6b;">Delete</button>
        </div>
      </div>`;
  }).join('');

  // Wire buttons
  grid.querySelectorAll('.btn-update-step').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id    = btn.dataset.id;
      const input = grid.querySelector(`.run-step-input[data-id="${id}"]`);
      const step  = parseInt(input?.value ?? '0') || 0;
      const idx   = _training.findIndex(r => r.id === id);
      if (idx !== -1) {
        _training[idx] = { ..._training[idx], step };
        await saveTrainingRuns(_training);
        renderTraining(_training);
      }
    });
  });

  grid.querySelectorAll('.btn-delete-run').forEach(btn => {
    btn.addEventListener('click', async () => {
      _training = _training.filter(r => r.id !== btn.dataset.id);
      await saveTrainingRuns(_training);
      renderTraining(_training);
    });
  });
}

// ── Render: Benchmarks ─────────────────────────────────────────────────────

function renderBenchmarks(benchmarks) {
  const tbody   = document.getElementById('bench-tbody');
  const emptyEl = document.getElementById('bench-empty');
  if (!tbody) return;

  if (!benchmarks.length) {
    tbody.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  const maxScore = Math.max(...benchmarks.map((b) => b.score ?? 0), 1);
  const sorted   = [...benchmarks].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  tbody.innerHTML = sorted.map((bench) => {
    const pct = Math.round(((bench.score ?? 0) / maxScore) * 100);
    return `
      <tr class="${bench.ours ? 'bench-ours' : ''}">
        <td>${esc(bench.model ?? '—')}</td>
        <td class="bench-score">${bench.score ?? 0}</td>
        <td>${bench.ours ? '<span class="bench-ours-badge">Ours</span>' : '—'}</td>
        <td>
          <div class="bench-bar-wrap"><div class="bench-bar-fill" style="width:${pct}%"></div></div>
        </td>
        <td><button class="btn-delete-bench btn-secondary" data-id="${esc(bench.id)}" style="font-size:11px;padding:2px 6px;color:#ff6b6b;">✕</button></td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('.btn-delete-bench').forEach(btn => {
    btn.addEventListener('click', async () => {
      _benchmarks = _benchmarks.filter(b => b.id !== btn.dataset.id);
      await saveBenchmarks(_benchmarks);
      renderBenchmarks(_benchmarks);
    });
  });
}

// ── Render: Fleet Speed ────────────────────────────────────────────────────

async function renderSpeeds() {
  const grid    = document.getElementById('speeds-grid');
  const emptyEl = document.getElementById('speeds-empty');
  if (!grid) return;

  const fleetNodes = await loadFleetNodes();

  if (!fleetNodes.length) {
    grid.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  // Probe each node
  const speeds = await Promise.all(fleetNodes.map(async (node) => {
    if (!node.ip) return { ...node, online: false, models: [] };
    const port = node.port ?? 11434;
    const { online, models } = await probeOllama(node.ip, port);
    return { ...node, online, models };
  }));

  grid.innerHTML = speeds.map((node) => {
    const models = Array.isArray(node.models) ? node.models : [];
    const modelTags = models.slice(0, 5).map((m) => `<span class="speed-model-tag">${esc(m)}</span>`).join('');
    const more = models.length > 5 ? `<span class="speed-model-tag">+${models.length - 5} more</span>` : '';

    return `
      <div class="speed-card">
        <div class="speed-header">
          <div class="speed-name">${esc(node.name ?? node.ip)}</div>
          <span class="speed-online ${node.online ? 'yes' : 'no'}">${node.online ? 'Online' : 'Offline'}</span>
        </div>
        <div class="speed-ip">${esc(node.ip || '—')}</div>
        <div class="speed-models">
          <strong>${node.online ? `${models.length} model${models.length !== 1 ? 's' : ''} via Ollama` : 'Unreachable'}</strong>
          ${node.online && models.length ? modelTags + more : ''}
          ${node.online && !models.length ? '<span style="color:var(--text-dim)">No models loaded (Ollama not responding)</span>' : ''}
        </div>
      </div>`;
  }).join('');
}

// ── Status ─────────────────────────────────────────────────────────────────

function setStorageStatus() {
  if (!storageEl) return;
  storageEl.textContent = 'Chrome Storage';
  storageEl.className = 'bridge-pill live';
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
    [_training, _benchmarks] = await Promise.all([loadTrainingRuns(), loadBenchmarks()]);
    renderTraining(_training);
    renderBenchmarks(_benchmarks);
    await renderSpeeds();
    setStorageStatus();
  } catch (err) {
    showError(`Storage error — ${err.message}`);
    renderTraining([]);
    renderBenchmarks([]);
  }
}

btnRefresh?.addEventListener('click', loadAndRender);

// ── Inject "Add" Buttons ───────────────────────────────────────────────────

function injectAddButtons() {
  // Training tab — Add training run button
  const trainingTab = document.getElementById('tab-training');
  if (trainingTab && !document.getElementById('btn-add-run')) {
    const btn = document.createElement('button');
    btn.id = 'btn-add-run';
    btn.className = 'btn-primary';
    btn.textContent = '+ New Training Run';
    btn.style.cssText = 'margin-bottom:12px;display:block;';
    trainingTab.insertBefore(btn, trainingTab.firstChild);

    const form = document.createElement('div');
    form.id = 'add-run-form';
    form.style.display = 'none';
    form.style.cssText = 'background:#13151c;border:1px solid #1e2332;border-radius:8px;padding:16px;margin-bottom:12px;';
    form.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <label style="font-size:12px;color:#a0a8b8;">Name <input id="run-name" type="text" placeholder="Run name" style="display:block;width:100%;margin-top:4px;padding:5px 8px;border-radius:5px;border:1px solid #333;background:#1a1d27;color:#eef7f0;font-size:12px;box-sizing:border-box;"></label>
        <label style="font-size:12px;color:#a0a8b8;">Machine <input id="run-machine" type="text" placeholder="e.g. Blade R730" style="display:block;width:100%;margin-top:4px;padding:5px 8px;border-radius:5px;border:1px solid #333;background:#1a1d27;color:#eef7f0;font-size:12px;box-sizing:border-box;"></label>
        <label style="font-size:12px;color:#a0a8b8;">Total Steps <input id="run-steps" type="number" value="10000" style="display:block;width:100%;margin-top:4px;padding:5px 8px;border-radius:5px;border:1px solid #333;background:#1a1d27;color:#eef7f0;font-size:12px;box-sizing:border-box;"></label>
        <label style="font-size:12px;color:#a0a8b8;">Learning Rate <input id="run-lr" type="text" placeholder="e.g. 1e-4" style="display:block;width:100%;margin-top:4px;padding:5px 8px;border-radius:5px;border:1px solid #333;background:#1a1d27;color:#eef7f0;font-size:12px;box-sizing:border-box;"></label>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="run-save" style="padding:5px 14px;border-radius:5px;border:none;background:#14F195;color:#080a10;font-weight:700;cursor:pointer;font-size:12px;">Create</button>
        <button id="run-cancel" style="padding:5px 14px;border-radius:5px;border:1px solid #444;background:transparent;color:#a0a8b8;cursor:pointer;font-size:12px;">Cancel</button>
      </div>`;
    trainingTab.insertBefore(form, trainingTab.children[1]);

    btn.addEventListener('click', () => { form.style.display = form.style.display === 'none' ? 'block' : 'none'; });
    document.getElementById('run-cancel').addEventListener('click', () => { form.style.display = 'none'; });
    document.getElementById('run-save').addEventListener('click', async () => {
      const name  = document.getElementById('run-name').value.trim() || 'New Run';
      const machine = document.getElementById('run-machine').value.trim();
      const totalSteps = parseInt(document.getElementById('run-steps').value) || 10000;
      const lr    = document.getElementById('run-lr').value.trim() || '1e-4';
      const newRun = {
        id: `run-${Date.now()}`,
        name, machine, totalSteps, lr,
        step: 0, status: 'pending', eta: '—', lossHistory: [],
      };
      _training = [..._training, newRun];
      await saveTrainingRuns(_training);
      form.style.display = 'none';
      renderTraining(_training);
    });
  }

  // Benchmarks tab — Add benchmark button
  const benchTab = document.getElementById('tab-benchmarks');
  if (benchTab && !document.getElementById('btn-add-bench')) {
    const btn = document.createElement('button');
    btn.id = 'btn-add-bench';
    btn.className = 'btn-primary';
    btn.textContent = '+ Add Benchmark';
    btn.style.cssText = 'margin-bottom:12px;display:block;';
    benchTab.insertBefore(btn, benchTab.firstChild);

    const form = document.createElement('div');
    form.id = 'add-bench-form';
    form.style.display = 'none';
    form.style.cssText = 'background:#13151c;border:1px solid #1e2332;border-radius:8px;padding:16px;margin-bottom:12px;';
    form.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;">
        <label style="font-size:12px;color:#a0a8b8;">Model <input id="bench-model" type="text" placeholder="e.g. GPT-4o" style="display:block;width:100%;margin-top:4px;padding:5px 8px;border-radius:5px;border:1px solid #333;background:#1a1d27;color:#eef7f0;font-size:12px;box-sizing:border-box;"></label>
        <label style="font-size:12px;color:#a0a8b8;">Score <input id="bench-score" type="number" placeholder="0–100" style="display:block;width:100%;margin-top:4px;padding:5px 8px;border-radius:5px;border:1px solid #333;background:#1a1d27;color:#eef7f0;font-size:12px;box-sizing:border-box;"></label>
        <label style="font-size:12px;color:#a0a8b8;">Ours?
          <select id="bench-ours" style="display:block;width:100%;margin-top:4px;padding:5px 8px;border-radius:5px;border:1px solid #333;background:#1a1d27;color:#eef7f0;font-size:12px;">
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        </label>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="bench-save" style="padding:5px 14px;border-radius:5px;border:none;background:#14F195;color:#080a10;font-weight:700;cursor:pointer;font-size:12px;">Add</button>
        <button id="bench-cancel" style="padding:5px 14px;border-radius:5px;border:1px solid #444;background:transparent;color:#a0a8b8;cursor:pointer;font-size:12px;">Cancel</button>
      </div>`;
    benchTab.insertBefore(form, benchTab.children[1]);

    btn.addEventListener('click', () => { form.style.display = form.style.display === 'none' ? 'block' : 'none'; });
    document.getElementById('bench-cancel').addEventListener('click', () => { form.style.display = 'none'; });
    document.getElementById('bench-save').addEventListener('click', async () => {
      const model = document.getElementById('bench-model').value.trim() || 'Unknown';
      const score = parseFloat(document.getElementById('bench-score').value) || 0;
      const ours  = document.getElementById('bench-ours').value === 'true';
      const newBench = { id: `bench-${Date.now()}`, model, score, ours };
      _benchmarks = [..._benchmarks, newBench];
      await saveBenchmarks(_benchmarks);
      form.style.display = 'none';
      renderBenchmarks(_benchmarks);
    });
  }
}

// ── Utility ────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Init ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  injectAddButtons();
  loadAndRender();
});
