/**
 * open-items.js — ResonantOS Open Items
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

// ── Storage Key ────────────────────────────────────────────────────────────

const STORAGE_KEY = 'resonantos_items';

const SEED_ITEMS = [
  { id: 'item-demo-1', title: 'Set up SSH keys for fleet', desc: 'Configure key-based auth across all fleet machines', priority: 'P1', section: 'attention', status: 'open' },
  { id: 'item-demo-2', title: 'Review Ternary Sunrise checkpoints', desc: 'Check training logs on Blade R730', priority: 'P2', section: 'pending', status: 'open' },
];

async function loadItems() {
  const result = await storage.get(STORAGE_KEY);
  if (!result[STORAGE_KEY]) {
    await storage.set({ [STORAGE_KEY]: SEED_ITEMS });
    return SEED_ITEMS;
  }
  return Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
}

async function saveItems(items) {
  await storage.set({ [STORAGE_KEY]: items });
}

// ── State ──────────────────────────────────────────────────────────────────

let _items = [];

// ── DOM ────────────────────────────────────────────────────────────────────

const storageEl    = document.getElementById('bridge-status');
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
    <div class="item-actions">
      ${moveBtns.join('')}
      <button class="item-delete-btn" data-id="${esc(item.id)}" title="Delete item">✕</button>
    </div>
  `;

  card.querySelectorAll('.item-move-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sec = btn.dataset.section;
      const status = sec === 'completed' ? 'done' : 'open';
      const idx = _items.findIndex(i => i.id === item.id);
      if (idx !== -1) {
        _items[idx] = { ..._items[idx], section: sec, status };
        await saveItems(_items);
        renderItems(_items);
      }
    });
  });

  card.querySelector('.item-delete-btn')?.addEventListener('click', async () => {
    _items = _items.filter(i => i.id !== item.id);
    await saveItems(_items);
    renderItems(_items);
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

function renderItems(items) {
  const grouped = { attention: [], pending: [], completed: [] };
  for (const item of items) {
    const sec = item.section ?? 'pending';
    if (grouped[sec]) grouped[sec].push(item);
  }
  for (const sec of SECTIONS) {
    renderSection(sec, grouped[sec] ?? []);
  }
}

function setStorageStatus() {
  if (!storageEl) return;
  storageEl.textContent = 'Chrome Storage';
  storageEl.className = 'bridge-pill live';
}

function showError(msg) {
  if (!errorEl) return;
  errorEl.textContent = msg;
  errorEl.style.display = 'block';
  setTimeout(() => { errorEl.style.display = 'none'; }, 5000);
}

async function loadAndRender() {
  try {
    _items = await loadItems();
    renderItems(_items);
    setStorageStatus();
  } catch (err) {
    showError(`Storage error — ${err.message}`);
    renderItems([]);
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

  const newItem = {
    id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    desc,
    priority,
    section,
    status: section === 'completed' ? 'done' : 'open',
  };

  try {
    _items = [..._items, newItem];
    await saveItems(_items);
    if (modalOverlay) modalOverlay.style.display = 'none';
    renderItems(_items);
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
