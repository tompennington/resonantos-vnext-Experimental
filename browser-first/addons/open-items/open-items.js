/**
 * open-items.js — ResonantOS Open Items
 * Real data via bridge routes /items/list, /items/create, /items/update
 */

// ── Bridge Client ──────────────────────────────────────────────────────────

const _cfg = (typeof globalThis !== 'undefined' && globalThis.__RESONANTOS_BRIDGE_CONFIG__) || {};
const _url = _cfg.bridgeUrl ?? 'http://127.0.0.1:47773';
const _tok = _cfg.bridgeToken ?? '';

async function apiFetch(route, options = {}) {
  const headers = {};
  if (_tok) headers['X-ResonantOS-Bridge-Token'] = _tok;
  if (options.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${_url}${route}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error ?? `Bridge error: HTTP ${res.status}`);
  return data;
}

async function fetchItems() {
  const data = await apiFetch('/items/list');
  return data.grouped ?? { attention: [], pending: [], completed: [] };
}

async function createItem(title, desc, priority, section) {
  return apiFetch('/items/create', {
    method: 'POST',
    body: { title, desc, priority, section },
  });
}

async function updateItem(id, section, status) {
  return apiFetch('/items/update', {
    method: 'POST',
    body: { id, section, status },
  });
}

// ── DOM ────────────────────────────────────────────────────────────────────

const bridgeEl     = document.getElementById('bridge-status');
const errorEl      = document.getElementById('items-error');
const btnNewItem   = document.getElementById('btn-new-item');
const btnRefresh   = document.getElementById('btn-refresh');
const modalOverlay = document.getElementById('modal-overlay');
const modalCancel  = document.getElementById('modal-cancel');
const modalCreate  = document.getElementById('modal-create');
const newTitleEl   = document.getElementById('new-title');
const newDescEl    = document.getElementById('new-desc');
const newPriorEl   = document.getElementById('new-priority');
const newSecEl     = document.getElementById('new-section');

// ── Render ─────────────────────────────────────────────────────────────────

const SECTIONS = ['attention', 'pending', 'completed'];

function makeCard(item) {
  const card = document.createElement('div');
  card.className = 'item-card';
  card.dataset.id = item.id;

  const secIdx = SECTIONS.indexOf(item.section ?? 'pending');

  const moveBtns = [];
  if (secIdx > 0) {
    const prev = SECTIONS[secIdx - 1];
    moveBtns.push(`<button class="item-move-btn" data-section="${prev}">← ${prev === 'attention' ? 'Attention' : 'Pending'}</button>`);
  }
  if (secIdx < SECTIONS.length - 1) {
    const next = SECTIONS[secIdx + 1];
    const label = next === 'completed' ? '✓ Complete' : '→ Pending';
    moveBtns.push(`<button class="item-move-btn${next === 'completed' ? ' complete' : ''}" data-section="${next}">${label}</button>`);
  }

  card.innerHTML = `
    <div class="item-top">
      <div class="item-title">${esc(item.title)}</div>
      <span class="item-priority ${esc(item.priority)}">${esc(item.priority)}</span>
    </div>
    ${item.desc ? `<div class="item-desc">${esc(item.desc)}</div>` : ''}
    <div class="item-actions">${moveBtns.join('')}</div>
  `;

  card.querySelectorAll('.item-move-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sec = btn.dataset.section;
      const status = sec === 'completed' ? 'done' : 'open';
      try {
        await updateItem(item.id, sec, status);
        await loadAndRender();
      } catch (err) {
        showError(err.message);
      }
    });
  });

  return card;
}

function renderSection(section, items) {
  const listEl  = document.getElementById(`list-${section}`);
  const countEl = document.getElementById(`count-${section}`);
  if (!listEl) return;
  listEl.innerHTML = '';
  for (const item of items) listEl.appendChild(makeCard(item));
  if (countEl) countEl.textContent = String(items.length);
}

function setBridgeStatus(ok) {
  if (!bridgeEl) return;
  bridgeEl.textContent = ok ? 'Live' : 'Bridge Offline';
  bridgeEl.className = ok ? 'bridge-pill live' : 'bridge-pill';
}

function showError(msg) {
  if (!errorEl) return;
  errorEl.textContent = msg;
  errorEl.style.display = 'block';
  setTimeout(() => { errorEl.style.display = 'none'; }, 5000);
}

async function loadAndRender() {
  try {
    const grouped = await fetchItems();
    for (const sec of SECTIONS) {
      renderSection(sec, grouped[sec] ?? []);
    }
    setBridgeStatus(true);
  } catch (err) {
    setBridgeStatus(false);
    showError(`Bridge disconnected — ${err.message}. Items stored in ~/.resonantos/items/`);
    for (const sec of SECTIONS) renderSection(sec, []);
  }
}

// ── Modal ──────────────────────────────────────────────────────────────────

btnNewItem?.addEventListener('click', () => {
  if (newTitleEl) newTitleEl.value = '';
  if (newDescEl) newDescEl.value = '';
  if (newPriorEl) newPriorEl.value = 'P2';
  if (newSecEl) newSecEl.value = 'pending';
  if (modalOverlay) modalOverlay.style.display = 'flex';
  newTitleEl?.focus();
});

modalCancel?.addEventListener('click', () => {
  if (modalOverlay) modalOverlay.style.display = 'none';
});

modalCreate?.addEventListener('click', async () => {
  const title    = newTitleEl?.value.trim() || 'Untitled Item';
  const desc     = newDescEl?.value.trim() || '';
  const priority = newPriorEl?.value || 'P2';
  const section  = newSecEl?.value || 'pending';
  try {
    await createItem(title, desc, priority, section);
    if (modalOverlay) modalOverlay.style.display = 'none';
    await loadAndRender();
  } catch (err) {
    showError(err.message);
  }
});

modalOverlay?.addEventListener('click', (e) => {
  if (e.target === modalOverlay) modalOverlay.style.display = 'none';
});

btnRefresh?.addEventListener('click', loadAndRender);

// ── Utility ────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Init ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', loadAndRender);
