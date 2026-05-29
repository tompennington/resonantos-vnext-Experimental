/**
 * canvas.js — ResonantOS System Map
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

// ── Storage Keys ───────────────────────────────────────────────────────────

const KEY_NODES = 'resonantos_fleet_nodes';
const KEY_EDGES = 'resonantos_topology_edges';

const SEED_NODES = [
  { id: 'node-localhost', name: 'localhost', ip: '127.0.0.1', type: 'machine', roles: ['inference'], port: 11434, status: 'unknown', x: null, y: null },
];

async function loadTopology() {
  const result = await storage.get([KEY_NODES, KEY_EDGES]);
  let nodes = result[KEY_NODES];
  let edges = result[KEY_EDGES];

  if (!nodes) {
    nodes = SEED_NODES;
    await storage.set({ [KEY_NODES]: nodes, [KEY_EDGES]: [] });
  }
  if (!edges) edges = [];

  return {
    nodes: Array.isArray(nodes) ? nodes : [],
    edges: Array.isArray(edges) ? edges : [],
  };
}

async function saveTopology(nodes, edges) {
  await storage.set({ [KEY_NODES]: nodes, [KEY_EDGES]: edges });
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

// ── Canvas Renderer ────────────────────────────────────────────────────────

const canvasEl   = document.getElementById('topology-canvas');
const ctx        = canvasEl ? canvasEl.getContext('2d') : null;
const tooltip    = document.getElementById('node-tooltip');
const errorEl    = document.getElementById('canvas-error');
const emptyEl    = document.getElementById('canvas-empty');
const storageEl  = document.getElementById('bridge-status');
const btnRefresh = document.getElementById('btn-refresh');
const btnReset   = document.getElementById('btn-reset-view');

const COLORS = {
  online:      '#14F195',
  offline:     '#ff6b6b',
  unknown:     '#6b7280',
  service:     '#9945FF',
  edge:        'rgba(153,69,255,0.3)',
  nodeBg:      '#13151c',
  nodeBorder:  '#1e2332',
};

const NODE_R = 28;
let nodePositions = [];
let viewOffset  = { x: 0, y: 0 };
let viewScale   = 1;
let dragging    = false;
let dragStart   = null;
let dragNode    = null; // node being dragged by user
let _nodes      = [];
let _edges      = [];

function resizeCanvas() {
  if (!canvasEl) return;
  const rect = canvasEl.parentElement.getBoundingClientRect();
  canvasEl.width  = rect.width;
  canvasEl.height = rect.height;
}

function layoutNodes(nodes) {
  const w = canvasEl.width;
  const h = canvasEl.height;
  const n = nodes.length;
  if (n === 0) return [];

  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) * 0.32;

  return nodes.map((node, i) => {
    // Use persisted position if available
    const px = typeof node.x === 'number' ? node.x : (n === 1 ? cx : cx + radius * Math.cos((2 * Math.PI * i) / n - Math.PI / 2));
    const py = typeof node.y === 'number' ? node.y : (n === 1 ? cy : cy + radius * Math.sin((2 * Math.PI * i) / n - Math.PI / 2));
    return { node, x: px, y: py, r: NODE_R };
  });
}

function colorForNode(node) {
  if (node.type === 'service') return COLORS.service;
  if (node.status === 'online')  return COLORS.online;
  if (node.status === 'offline') return COLORS.offline;
  return COLORS.unknown;
}

function drawScene(positions, edges) {
  if (!ctx || !canvasEl) return;
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  ctx.save();
  ctx.translate(viewOffset.x, viewOffset.y);
  ctx.scale(viewScale, viewScale);

  for (const edge of edges) {
    const fromPos = positions.find((p) => p.node.id === edge.from);
    const toPos   = positions.find((p) => p.node.id === edge.to);
    if (!fromPos || !toPos) continue;
    ctx.beginPath();
    ctx.moveTo(fromPos.x, fromPos.y);
    ctx.lineTo(toPos.x, toPos.y);
    ctx.strokeStyle = COLORS.edge;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (const pos of positions) {
    const color = colorForNode(pos.node);
    ctx.shadowBlur = 12;
    ctx.shadowColor = color;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, pos.r, 0, 2 * Math.PI);
    ctx.fillStyle = COLORS.nodeBg;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.arc(pos.x + pos.r - 8, pos.y - pos.r + 8, 5, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.font = 'bold 11px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#eef7f0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const shortName = pos.node.name.length > 10 ? pos.node.name.slice(0, 9) + '…' : pos.node.name;
    ctx.fillText(shortName, pos.x, pos.y);

    const sub = pos.node.type === 'service' ? 'service' : (pos.node.roles?.[0] ?? '');
    if (sub) {
      ctx.font = '9px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#6b7280';
      ctx.fillText(sub, pos.x, pos.y + 14);
    }
  }

  ctx.restore();
}

// ── Tooltip ────────────────────────────────────────────────────────────────

function showTooltip(pos, e) {
  const { node } = pos;
  const lines = [
    `<div class="tooltip-name">${esc(node.name)}</div>`,
    node.ip     ? `<div class="tooltip-row">IP: <span>${esc(node.ip)}</span></div>` : '',
    node.status ? `<div class="tooltip-row">Status: <span>${esc(node.status)}</span></div>` : '',
    node.roles?.length ? `<div class="tooltip-row">Roles: <span>${esc(node.roles.join(', '))}</span></div>` : '',
    node.models?.length ? `<div class="tooltip-row">Models: <span>${esc(node.models.slice(0, 3).join(', '))}</span></div>` : '',
    node.port   ? `<div class="tooltip-row">Port: <span>${node.port}</span></div>` : '',
  ].join('');
  if (tooltip) {
    tooltip.innerHTML = lines;
    tooltip.style.display = 'block';
    tooltip.style.left = (e.offsetX + 16) + 'px';
    tooltip.style.top  = (e.offsetY + 8) + 'px';
  }
}

function hideTooltip() {
  if (tooltip) tooltip.style.display = 'none';
}

function hitTest(e) {
  const mx = (e.offsetX - viewOffset.x) / viewScale;
  const my = (e.offsetY - viewOffset.y) / viewScale;
  for (const pos of nodePositions) {
    const dx = mx - pos.x;
    const dy = my - pos.y;
    if (dx * dx + dy * dy <= pos.r * pos.r) return pos;
  }
  return null;
}

// ── Mouse Events ───────────────────────────────────────────────────────────

if (canvasEl) {
  canvasEl.addEventListener('mousemove', (e) => {
    if (dragging && dragStart) {
      if (dragNode) {
        // Dragging a node
        const nx = (e.clientX - canvasEl.getBoundingClientRect().left - viewOffset.x) / viewScale;
        const ny = (e.clientY - canvasEl.getBoundingClientRect().top  - viewOffset.y) / viewScale;
        dragNode.x = nx;
        dragNode.y = ny;
        drawScene(nodePositions, _edges);
      } else {
        // Panning
        viewOffset.x += e.clientX - dragStart.x;
        viewOffset.y += e.clientY - dragStart.y;
        dragStart = { x: e.clientX, y: e.clientY };
        drawScene(nodePositions, _edges);
      }
      return;
    }
    const hit = hitTest(e);
    if (hit) {
      canvasEl.style.cursor = 'pointer';
      showTooltip(hit, e);
    } else {
      canvasEl.style.cursor = 'grab';
      hideTooltip();
    }
  });

  canvasEl.addEventListener('mousedown', (e) => {
    const hit = hitTest(e);
    dragging = true;
    dragStart = { x: e.clientX, y: e.clientY };
    if (hit) {
      dragNode = hit;
      canvasEl.style.cursor = 'grabbing';
      hideTooltip();
    } else {
      dragNode = null;
      canvasEl.style.cursor = 'grabbing';
    }
  });

  canvasEl.addEventListener('mouseup', async () => {
    if (dragNode) {
      // Persist updated positions
      const idx = _nodes.findIndex(n => n.id === dragNode.node.id);
      if (idx !== -1) {
        _nodes[idx] = { ..._nodes[idx], x: dragNode.x, y: dragNode.y };
        await saveTopology(_nodes, _edges);
      }
      dragNode = null;
    }
    dragging = false;
    dragStart = null;
    if (canvasEl) canvasEl.style.cursor = 'grab';
  });

  canvasEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    viewScale = Math.max(0.3, Math.min(3, viewScale * factor));
    drawScene(nodePositions, _edges);
  }, { passive: false });

  canvasEl.addEventListener('mouseleave', hideTooltip);
}

btnReset?.addEventListener('click', () => {
  viewOffset = { x: 0, y: 0 };
  viewScale  = 1;
  drawScene(nodePositions, _edges);
});

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

// ── Load & Render ──────────────────────────────────────────────────────────

async function loadAndRender() {
  resizeCanvas();
  try {
    const { nodes, edges } = await loadTopology();
    _nodes = nodes;
    _edges = edges;
    setStorageStatus();

    // Probe Ollama status for each node with an IP
    await Promise.all(_nodes.map(async (node, idx) => {
      if (node.ip) {
        const port = node.port ?? 11434;
        const { online } = await probeOllama(node.ip, port);
        _nodes[idx] = { ..._nodes[idx], status: online ? 'online' : 'offline' };
      }
    }));

    // Update storage with probed statuses
    await saveTopology(_nodes, _edges);

    if (_nodes.length === 0) {
      if (emptyEl) emptyEl.style.display = 'block';
      if (canvasEl) canvasEl.style.display = 'none';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    if (canvasEl) canvasEl.style.display = 'block';

    nodePositions = layoutNodes(_nodes);
    drawScene(nodePositions, _edges);
  } catch (err) {
    showError(`Storage error — ${err.message}`);
    if (emptyEl) emptyEl.style.display = 'block';
    if (canvasEl) canvasEl.style.display = 'none';
  }
}

btnRefresh?.addEventListener('click', loadAndRender);

window.addEventListener('resize', () => {
  resizeCanvas();
  drawScene(nodePositions, _edges);
});

// ── Add Node Modal ─────────────────────────────────────────────────────────

function injectAddNodeModal() {
  const existing = document.getElementById('add-node-modal');
  if (existing) return;

  const modal = document.createElement('div');
  modal.id = 'add-node-modal';
  modal.className = 'modal-overlay';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="modal">
      <h3>Add Node</h3>
      <label>Name <input id="node-name" type="text" placeholder="e.g. Guardian" autocomplete="off"></label>
      <label>IP / Hostname <input id="node-ip" type="text" placeholder="e.g. 192.168.4.88" autocomplete="off"></label>
      <label>Port <input id="node-port" type="number" value="11434" min="1" max="65535"></label>
      <label>Type
        <select id="node-type">
          <option value="machine">Machine</option>
          <option value="service">Service</option>
          <option value="protocol">Protocol</option>
        </select>
      </label>
      <label>Role <input id="node-role" type="text" placeholder="e.g. inference, training" autocomplete="off"></label>
      <div class="modal-actions">
        <button id="add-node-cancel" class="btn-secondary">Cancel</button>
        <button id="add-node-confirm" class="btn-primary">Add Node</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  document.getElementById('add-node-cancel').addEventListener('click', () => { modal.style.display = 'none'; });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

  document.getElementById('add-node-confirm').addEventListener('click', async () => {
    const name = document.getElementById('node-name').value.trim() || 'New Node';
    const ip   = document.getElementById('node-ip').value.trim();
    const port = parseInt(document.getElementById('node-port').value) || 11434;
    const type = document.getElementById('node-type').value;
    const role = document.getElementById('node-role').value.trim();

    const newNode = {
      id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      ip: ip || null,
      port,
      type,
      roles: role ? [role] : [],
      status: 'unknown',
      x: null,
      y: null,
    };

    _nodes = [..._nodes, newNode];
    await saveTopology(_nodes, _edges);
    modal.style.display = 'none';
    await loadAndRender();
  });
}

function injectAddConnectionModal() {
  const existing = document.getElementById('add-conn-modal');
  if (existing) return;

  const modal = document.createElement('div');
  modal.id = 'add-conn-modal';
  modal.className = 'modal-overlay';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="modal">
      <h3>Add Connection</h3>
      <label>From Node <select id="conn-from"></select></label>
      <label>To Node <select id="conn-to"></select></label>
      <div class="modal-actions">
        <button id="add-conn-cancel" class="btn-secondary">Cancel</button>
        <button id="add-conn-confirm" class="btn-primary">Add Connection</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  document.getElementById('add-conn-cancel').addEventListener('click', () => { modal.style.display = 'none'; });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

  document.getElementById('add-conn-confirm').addEventListener('click', async () => {
    const from = document.getElementById('conn-from').value;
    const to   = document.getElementById('conn-to').value;
    if (!from || !to || from === to) return;

    const edge = { id: `edge-${Date.now()}`, from, to };
    _edges = [..._edges, edge];
    await saveTopology(_nodes, _edges);
    modal.style.display = 'none';
    drawScene(nodePositions, _edges);
  });
}

function injectToolbarButtons() {
  const header = document.querySelector('.header-actions');
  if (!header) return;

  if (!document.getElementById('btn-add-node')) {
    const btnAddNode = document.createElement('button');
    btnAddNode.id = 'btn-add-node';
    btnAddNode.className = 'btn-primary';
    btnAddNode.textContent = '+ Add Node';
    btnAddNode.addEventListener('click', () => {
      injectAddNodeModal();
      document.getElementById('add-node-modal').style.display = 'flex';
    });
    header.insertBefore(btnAddNode, header.firstChild);
  }

  if (!document.getElementById('btn-add-conn')) {
    const btnAddConn = document.createElement('button');
    btnAddConn.id = 'btn-add-conn';
    btnAddConn.className = 'btn-secondary';
    btnAddConn.textContent = '+ Connection';
    btnAddConn.addEventListener('click', () => {
      injectAddConnectionModal();
      // Populate selects
      const fromSel = document.getElementById('conn-from');
      const toSel   = document.getElementById('conn-to');
      fromSel.innerHTML = _nodes.map(n => `<option value="${n.id}">${esc(n.name)}</option>`).join('');
      toSel.innerHTML   = _nodes.map(n => `<option value="${n.id}">${esc(n.name)}</option>`).join('');
      document.getElementById('add-conn-modal').style.display = 'flex';
    });
    header.insertBefore(btnAddConn, header.firstChild.nextSibling);
  }
}

// ── Utility ────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Init ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  injectToolbarButtons();
  loadAndRender();
});
