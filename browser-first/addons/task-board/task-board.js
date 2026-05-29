/**
 * task-board.js — ResonantOS Task Board
 * Real data via bridge routes /tasks/list, /tasks/update, /tasks/create
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

async function fetchTasks() {
  const data = await apiFetch('/tasks/list');
  return Array.isArray(data.tasks) ? data.tasks : [];
}

async function updateTask(id, status) {
  return apiFetch('/tasks/update', { method: 'POST', body: { id, status } });
}

async function createTask(title, desc, priority, assignee) {
  return apiFetch('/tasks/create', {
    method: 'POST',
    body: { title, desc, priority, assignee },
  });
}

// ── State ──────────────────────────────────────────────────────────────────

const COLUMNS = ['ready', 'in-progress', 'blocked', 'done'];
let draggedId = null;

// ── DOM ────────────────────────────────────────────────────────────────────

const bridgeStatusEl = document.getElementById('bridge-status');
const boardErrorEl   = document.getElementById('board-error');
const btnNewTask     = document.getElementById('btn-new-task');
const btnRefresh     = document.getElementById('btn-refresh');
const modalOverlay   = document.getElementById('modal-overlay');
const modalCancel    = document.getElementById('modal-cancel');
const modalCreate    = document.getElementById('modal-create');
const newTitleEl     = document.getElementById('new-title');
const newDescEl      = document.getElementById('new-desc');
const newPriorityEl  = document.getElementById('new-priority');
const newAssigneeEl  = document.getElementById('new-assignee');

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
      try {
        await updateTask(task.id, newStatus);
        await loadAndRender();
      } catch (err) {
        showError(err.message);
      }
    });
  });

  return card;
}

function renderBoard(tasks) {
  // Clear columns
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

function setBridgeStatus(connected) {
  if (!bridgeStatusEl) return;
  if (connected) {
    bridgeStatusEl.textContent = 'Live';
    bridgeStatusEl.className = 'bridge-pill live';
  } else {
    bridgeStatusEl.textContent = 'Bridge Offline';
    bridgeStatusEl.className = 'bridge-pill';
  }
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
    const tasks = await fetchTasks();
    renderBoard(tasks);
    setBridgeStatus(true);
  } catch (err) {
    setBridgeStatus(false);
    showError(`Bridge disconnected — ${err.message}. Tasks stored in ~/.resonantos/tasks/`);
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
    try {
      await updateTask(draggedId, newStatus);
      await loadAndRender();
    } catch (err) {
      showError(err.message);
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
  const title = newTitleEl?.value.trim() || 'Untitled Task';
  const desc = newDescEl?.value.trim() || '';
  const priority = newPriorityEl?.value || 'P2';
  const assignee = newAssigneeEl?.value.trim() || '';

  try {
    await createTask(title, desc, priority, assignee);
    if (modalOverlay) modalOverlay.style.display = 'none';
    await loadAndRender();
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
