/**
 * canvas.js — ResonantOS System Map
 * Fetches real topology from bridge /topology/status and renders it on an HTML canvas.
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

async function fetchTopology() {
  const data = await apiFetch('/topology/status');
  return {
    nodes: Array.isArray(data.nodes) ? data.nodes : [],
    edges: Array.isArray(data.edges) ? data.edges : [],
  };
}

// ── Canvas Renderer ────────────────────────────────────────────────────────

const canvasEl   = document.getElementById('topology-canvas');
const ctx        = canvasEl.getContext('2d');
const tooltip    = document.getElementById('node-tooltip');
const errorEl    = document.getElementById('canvas-error');
const emptyEl    = document.getElementById('canvas-empty');
const bridgeEl   = document.getElementById('bridge-status');
const btnRefresh = document.getElementById('btn-refresh');
const btnReset   = document.getElementById('btn-reset-view');

const COLORS = {
  online:   '#14F195',
  offline:  '#ff6b6b',
  unknown:  '#6b7280',
  service:  '#9945FF',
  edge:     'rgba(153,69,255,0.3)',
  nodeBg:   '#13151c',
  nodeBorder: '#1e2332',
};

const NODE_R = 28;
let nodePositions = [];   // [{ node, x, y, r }]
let viewOffset = { x: 0, y: 0 };
let viewScale  = 1;
let dragging   = false;
let dragStart  = null;

function resizeCanvas() {
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
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    return {
      node,
      x: n === 1 ? cx : cx + radius * Math.cos(angle),
      y: n === 1 ? cy : cy + radius * Math.sin(angle),
      r: NODE_R,
    };
  });
}

function colorForNode(node) {
  if (node.type === 'service') return COLORS.service;
  if (node.status === 'online')  return COLORS.online;
  if (node.status === 'offline') return COLORS.offline;
  return COLORS.unknown;
}

function drawScene(positions, edges) {
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

  ctx.save();
  ctx.translate(viewOffset.x, viewOffset.y);
  ctx.scale(viewScale, viewScale);

  // Draw edges
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

  // Draw nodes
  for (const pos of positions) {
    const color = colorForNode(pos.node);

    // Shadow glow
    ctx.shadowBlur = 12;
    ctx.shadowColor = color;

    // Circle fill
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, pos.r, 0, 2 * Math.PI);
    ctx.fillStyle = COLORS.nodeBg;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Status dot
    ctx.beginPath();
    ctx.arc(pos.x + pos.r - 8, pos.y - pos.r + 8, 5, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();

    // Label
    ctx.font = 'bold 11px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#eef7f0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const shortName = pos.node.name.length > 10 ? pos.node.name.slice(0, 9) + '…' : pos.node.name;
    ctx.fillText(shortName, pos.x, pos.y);

    // Roles / type hint below
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
    node.ip    ? `<div class="tooltip-row">IP: <span>${esc(node.ip)}</span></div>` : '',
    node.status ? `<div class="tooltip-row">Status: <span>${esc(node.status)}</span></div>` : '',
    node.roles?.length ? `<div class="tooltip-row">Roles: <span>${esc(node.roles.join(', '))}</span></div>` : '',
    node.models?.length ? `<div class="tooltip-row">Models: <span>${esc(node.models.slice(0,3).join(', '))}</span></div>` : '',
    node.port  ? `<div class="tooltip-row">Port: <span>${node.port}</span></div>` : '',
  ].join('');

  tooltip.innerHTML = lines;
  tooltip.style.display = 'block';
  tooltip.style.left = (e.offsetX + 16) + 'px';
  tooltip.style.top  = (e.offsetY + 8) + 'px';
}

function hideTooltip() {
  tooltip.style.display = 'none';
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

canvasEl.addEventListener('mousemove', (e) => {
  if (dragging && dragStart) {
    viewOffset.x += e.clientX - dragStart.x;
    viewOffset.y += e.clientY - dragStart.y;
    dragStart = { x: e.clientX, y: e.clientY };
    drawScene(nodePositions, currentEdges);
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
  dragging = true;
  dragStart = { x: e.clientX, y: e.clientY };
  canvasEl.style.cursor = 'grabbing';
});

canvasEl.addEventListener('mouseup', () => {
  dragging = false;
  dragStart = null;
  canvasEl.style.cursor = 'grab';
});

canvasEl.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  viewScale = Math.max(0.3, Math.min(3, viewScale * factor));
  drawScene(nodePositions, currentEdges);
}, { passive: false });

canvasEl.addEventListener('mouseleave', hideTooltip);

btnReset?.addEventListener('click', () => {
  viewOffset = { x: 0, y: 0 };
  viewScale  = 1;
  drawScene(nodePositions, currentEdges);
});

// ── Data + Render ──────────────────────────────────────────────────────────

let currentEdges = [];

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

async function loadAndRender() {
  resizeCanvas();
  try {
    const { nodes, edges } = await fetchTopology();
    currentEdges = edges;
    setBridgeStatus(true);

    if (nodes.length === 0) {
      if (emptyEl) emptyEl.style.display = 'block';
      canvasEl.style.display = 'none';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    canvasEl.style.display = 'block';

    nodePositions = layoutNodes(nodes);
    drawScene(nodePositions, currentEdges);
  } catch (err) {
    setBridgeStatus(false);
    showError(`Bridge disconnected — ${err.message}. Add nodes to ~/.resonantos/fleet.json`);
    if (emptyEl) emptyEl.style.display = 'block';
    canvasEl.style.display = 'none';
  }
}

btnRefresh?.addEventListener('click', loadAndRender);

window.addEventListener('resize', () => {
  resizeCanvas();
  drawScene(nodePositions, currentEdges);
});

// ── Utility ────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Init ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', loadAndRender);
