/**
 * task-board.js — ResonantOS Task Board
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

const STORAGE_KEY = 'resonantos_tasks';

const SEED_TASKS = [
  { id: 'demo-1', title: 'Configure your fleet', desc: 'Add machines to Fleet & Compute', priority: 'P1', status: 'ready', assignee: 'You' },
  { id: 'demo-2', title: 'Explore the Canvas', desc: 'Open the System Map to see your topology', priority: 'P2', status: 'ready', assignee: 'You' },
  { id: 'demo-3', title: 'Try the Blackboard', desc: 'Use /draw or /doc commands', priority: 'P3', status: 'ready', assignee: 'You' },
];

async function loadTasks() {
  const result = await storage.get(STORAGE_KEY);
  if (!result[STORAGE_KEY]) {
    // First run — seed example data
    await storage.set({ [STORAGE_KEY]: SEED_TASKS });
    return SEED_TASKS;
  }
  return Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
}

async function saveTasks(tasks) {
  await storage.set({ [STORAGE_KEY]: tasks });
}

// ── State ──────────────────────────────────────────────────────────────────

const COLUMNS = ['ready', 'in-progress', 'blocked', 'done'];
let draggedId = null;
let _tasks = [];

// ── DOM ────────────────────────────────────────────────────────────────────

const storageStatusEl = document.getElementById('bridge-status');
const boardErrorEl    = document.getElementById('board-error');
const btnNewTask      = document.getElementById('btn-new-task');
const btnRefresh      = document.getElementById('btn-refresh');
const modalOverlay    = document.getElementById('modal-overlay');
const modalCancel     = document.getElementById('modal-cancel');
const modalCreate     = document.getElementById('modal-create');
const newTitleEl      = document.getElementById('new-title');
const newDescEl       = document.getElementById('new-desc');
const newPriorityEl   = document.getElementById('new-priority');
const newAssigneeEl   = document.getElementById('new-assignee');

// ── Render ─────────────────────────────────────────────────────────────────

function statusToColId(status) {
  if (status === 'in-progress') return 'col-in-progress';
  if (status === 'blocked')     return 'col-blocked';
  if (status === 'done')        return 'col-done';
  return 'col-ready';
}

function countId(status) {
  if (status === 'in-progress') return 'count-in-progress';
  if (status === 'blocked')     return 'count-blocked';
  if (status === 'done')        return 'count-done';
  return 'count-ready';
}

function makeCard(task) {
  const card = document.createElement('div');
  card.className = 'task-card';
  card.dataset.id = task.id;
  card.draggable = true;

  const statusIndex = COLUMNS.indexOf(task.status ?? 'ready');
  const prevStatus  = statusIndex > 0 ? COLUMNS[statusIndex - 1] : null;
  const nextStatus  = statusIndex < COLUMNS.length - 1 ? COLUMNS[statusIndex + 1] : null;

  const moveBtns = [
    prevStatus ? `<button class="card-move-btn" data-move="${prevStatus}" title="Move to ${prevStatus}">←</button>` : '',
    nextStatus ? `<button class="card-move-btn" data-move="${nextStatus}" title="Move to ${nextStatus}">→</button>` : '',
  ].join('');

  card.innerHTML = `
    <div class="card-top">
      <div class="card-title">${escHtml(task.title)}</div>
      <span class="card-priority ${escHtml(task.priority)}">${escHtml(task.priority)}</span>
    </div>
    ${task.desc ? `<div class="card-desc">${escHtml(task.desc)}</div>` : ''}
    <div class="card-footer">
      <span class="card-assignee">${task.assignee ? escHtml(task.assignee) : ''}</span>
      <div class="card-move">${moveBtns}</div>
      <button class="card-delete-btn" data-id="${escHtml(task.id)}" title="Delete task">✕</button>
    </div>`;

  // Drag events
  card.addEventListener('dragstart', (e) => {
    draggedId = task.id;
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => {
    draggedId = null;
    card.classList.remove('dragging');
  });

  // Move buttons
  card.querySelectorAll('.card-move-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const newStatus = btn.dataset.move;
      const idx = _tasks.findIndex(t => t.id === task.id);
      if (idx !== -1) {
        _tasks[idx] = { ..._tasks[idx], status: newStatus };
        await saveTasks(_tasks);
        renderBoard(_tasks);
      }
    });
  });

  // Delete button
  card.querySelector('.card-delete-btn')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    _tasks = _tasks.filter(t => t.id !== task.id);
    await saveTasks(_tasks);
    renderBoard(_tasks);
  });

  return card;
}

function renderBoard(tasks) {
  COLUMNS.forEach((s) => {
    const colEl = document.getElementById(statusToColId(s));
    if (colEl) colEl.innerHTML = '';
    const countEl = document.getElementById(countId(s));
    if (countEl) countEl.textContent = '0';
  });

  const counts = {};
  for (const task of tasks) {
    const status = task.status ?? 'ready';
    const colEl = document.getElementById(statusToColId(status));
    if (colEl) {
      colEl.appendChild(makeCard(task));
      counts[status] = (counts[status] ?? 0) + 1;
    }
  }

  for (const [s, n] of Object.entries(counts)) {
    const countEl = document.getElementById(countId(s));
    if (countEl) countEl.textContent = String(n);
  }
}

function setStorageStatus() {
  if (!storageStatusEl) return;
  storageStatusEl.textContent = 'Chrome Storage';
  storageStatusEl.className = 'bridge-pill live';
}

function showError(msg) {
  if (!boardErrorEl) return;
  boardErrorEl.textContent = msg;
  boardErrorEl.style.display = 'block';
  setTimeout(() => { boardErrorEl.style.display = 'none'; }, 5000);
}

// ── Load ───────────────────────────────────────────────────────────────────

async function loadAndRender() {
  try {
    _tasks = await loadTasks();
    renderBoard(_tasks);
    setStorageStatus();
  } catch (err) {
    showError(`Storage error — ${err.message}`);
    renderBoard([]);
  }
}

// ── Drag & Drop (column targets) ──────────────────────────────────────────

document.querySelectorAll('.col-cards').forEach((col) => {
  col.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    col.classList.add('drag-over');
  });
  col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
  col.addEventListener('drop', async (e) => {
    e.preventDefault();
    col.classList.remove('drag-over');
    const newStatus = col.dataset.status;
    if (!draggedId || !newStatus) return;
    const idx = _tasks.findIndex(t => t.id === draggedId);
    if (idx !== -1) {
      _tasks[idx] = { ..._tasks[idx], status: newStatus };
      await saveTasks(_tasks);
      renderBoard(_tasks);
    }
  });
});

// ── New Task Modal ─────────────────────────────────────────────────────────

btnNewTask?.addEventListener('click', () => {
  if (newTitleEl) newTitleEl.value = '';
  if (newDescEl) newDescEl.value = '';
  if (newAssigneeEl) newAssigneeEl.value = '';
  if (newPriorityEl) newPriorityEl.value = 'P2';
  if (modalOverlay) modalOverlay.style.display = 'flex';
  newTitleEl?.focus();
});

modalCancel?.addEventListener('click', () => {
  if (modalOverlay) modalOverlay.style.display = 'none';
});

modalCreate?.addEventListener('click', async () => {
  const title    = newTitleEl?.value.trim() || 'Untitled Task';
  const desc     = newDescEl?.value.trim() || '';
  const priority = newPriorityEl?.value || 'P2';
  const assignee = newAssigneeEl?.value.trim() || '';

  const newTask = {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    desc,
    priority,
    assignee,
    status: 'ready',
  };

  try {
    _tasks = [..._tasks, newTask];
    await saveTasks(_tasks);
    if (modalOverlay) modalOverlay.style.display = 'none';
    renderBoard(_tasks);
  } catch (err) {
    showError(err.message);
  }
});

// Close modal on overlay click
modalOverlay?.addEventListener('click', (e) => {
  if (e.target === modalOverlay) modalOverlay.style.display = 'none';
});

btnRefresh?.addEventListener('click', loadAndRender);

// ── Utility ────────────────────────────────────────────────────────────────

function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Init ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', loadAndRender);
