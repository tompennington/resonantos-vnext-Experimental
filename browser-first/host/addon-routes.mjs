/**
 * addon-routes.mjs — Bridge routes for ResonantOS add-ons
 *
 * All addon-specific bridge handlers live here.
 * Import and spread into the bridgeRoutes array in run-browser-first.mjs.
 *
 * Covered addons:
 *   1. Fleet & Compute   — /fleet/status
 *   2. Task Board        — /tasks/list, /tasks/update, /tasks/create
 *   3. Canvas / Topology — /topology/status
 *   4. Open Items        — /items/list, /items/create, /items/update
 *   5. Blackboard        — /blackboard/save, /blackboard/list, /blackboard/send-to-augmentor
 *   6. Gradient Perf     — /perf/status
 *
 * Config directory: ~/.resonantos/
 * No external dependencies — Node built-ins only.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

// ── Paths ─────────────────────────────────────────────────────────────────────

const resonantosRoot = path.join(os.homedir(), ".resonantos");

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function readJsonFile(filePath, fallback = null) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath, data) {
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

// ── TCP Probe ─────────────────────────────────────────────────────────────────

function tcpProbe(ip, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: ip, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

// ── Fleet Config ──────────────────────────────────────────────────────────────

const fleetConfigPath = path.join(resonantosRoot, "fleet.json");

const defaultFleetConfig = {
  nodes: [
    {
      id: "local",
      name: "Local",
      ip: "127.0.0.1",
      port: 11434,
      roles: ["inference"],
      model: "auto",
      cpu: "auto",
      ram: "auto",
    },
  ],
};

async function readFleetConfig() {
  await ensureDir(resonantosRoot);
  if (!existsSync(fleetConfigPath)) {
    await writeJsonFile(fleetConfigPath, defaultFleetConfig);
    return defaultFleetConfig;
  }
  return readJsonFile(fleetConfigPath, defaultFleetConfig);
}

// ─────────────────────────────────────────────────────────────────────────────
// ADDON 1 — Fleet & Compute
// ─────────────────────────────────────────────────────────────────────────────

async function executeFleetStatus() {
  const config = await readFleetConfig();
  const nodes = Array.isArray(config.nodes) ? config.nodes : [];

  const probeResults = await Promise.all(
    nodes.map(async (node) => {
      const port = node.port ?? 11434;
      let status = "unknown";
      let models = null;

      const reachable = await tcpProbe(node.ip, port);
      if (reachable) {
        status = "online";
        // Try fetching Ollama model list
        try {
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort(), 2000);
          const res = await fetch(`http://${node.ip}:${port}/api/tags`, {
            signal: controller.signal,
          });
          clearTimeout(t);
          if (res.ok) {
            const data = await res.json();
            models = Array.isArray(data.models)
              ? data.models.map((m) => m.name)
              : null;
          }
        } catch {
          // Ollama may not be present even if port is open
        }
      } else {
        status = "offline";
      }

      return {
        id: node.id ?? node.name?.toLowerCase().replace(/\s+/g, "-") ?? "node",
        name: node.name ?? node.ip,
        ip: node.ip,
        port,
        status,
        roles: node.roles ?? [],
        model: node.model ?? (models?.[0] ?? null),
        models,
        cpu: node.cpu ?? null,
        ram: node.ram ?? null,
      };
    })
  );

  return { nodes: probeResults };
}

// ─────────────────────────────────────────────────────────────────────────────
// ADDON 2 — Task Board
// ─────────────────────────────────────────────────────────────────────────────

const tasksDir = path.join(resonantosRoot, "tasks");

const SEED_TASKS = [
  {
    id: "task-001",
    title: "Set up fleet monitoring",
    desc: "Configure fleet.json with all nodes and verify TCP probes are working.",
    priority: "P1",
    status: "ready",
    assignee: "Analog 6",
    nextAction: "Edit ~/.resonantos/fleet.json",
    state: "Waiting on config",
    blocker: "",
  },
  {
    id: "task-002",
    title: "Connect bridge to real data sources",
    desc: "Replace all mock data in addon JS files with live bridge API calls.",
    priority: "P0",
    status: "in-progress",
    assignee: "Analog 6",
    nextAction: "Deploy addon-routes.mjs",
    state: "In development",
    blocker: "",
  },
  {
    id: "task-003",
    title: "Review training run metrics",
    desc: "Check gradient-perf dashboard for loss trends and ETA.",
    priority: "P2",
    status: "blocked",
    assignee: "Tom",
    nextAction: "Check ~/.resonantos/training/ directory",
    state: "Waiting on training data",
    blocker: "No training runs started yet",
  },
];

async function ensureTasks() {
  await ensureDir(tasksDir);
  const entries = await readdir(tasksDir).catch(() => []);
  const jsonFiles = entries.filter((f) => f.endsWith(".json"));
  if (jsonFiles.length === 0) {
    for (const task of SEED_TASKS) {
      await writeJsonFile(path.join(tasksDir, `${task.id}.json`), task);
    }
  }
}

const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };

async function executeTasksList() {
  await ensureTasks();
  const entries = await readdir(tasksDir).catch(() => []);
  const tasks = [];
  for (const file of entries.filter((f) => f.endsWith(".json"))) {
    const task = await readJsonFile(path.join(tasksDir, file));
    if (task) tasks.push(task);
  }
  tasks.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 9;
    const pb = PRIORITY_ORDER[b.priority] ?? 9;
    return pa - pb;
  });
  return { tasks };
}

async function executeTasksUpdate({ id, status }) {
  if (!id) throw new Error("Missing task id");
  const filePath = path.join(tasksDir, `${id}.json`);
  const task = await readJsonFile(filePath);
  if (!task) throw new Error(`Task not found: ${id}`);
  if (status) task.status = status;
  await writeJsonFile(filePath, task);
  return { task };
}

async function executeTasksCreate({ title, desc, priority, assignee }) {
  await ensureDir(tasksDir);
  const id = `task-${Date.now()}`;
  const task = {
    id,
    title: title ?? "Untitled Task",
    desc: desc ?? "",
    priority: priority ?? "P2",
    status: "ready",
    assignee: assignee ?? "",
    nextAction: "",
    state: "New",
    blocker: "",
  };
  await writeJsonFile(path.join(tasksDir, `${id}.json`), task);
  return { task };
}

// ─────────────────────────────────────────────────────────────────────────────
// ADDON 3 — Canvas / System Map (Topology)
// ─────────────────────────────────────────────────────────────────────────────

const topologyConfigPath = path.join(resonantosRoot, "topology.json");

const defaultTopology = {
  edges: [],
  services: [],
};

async function readTopologyConfig() {
  await ensureDir(resonantosRoot);
  if (!existsSync(topologyConfigPath)) {
    await writeJsonFile(topologyConfigPath, defaultTopology);
    return defaultTopology;
  }
  return readJsonFile(topologyConfigPath, defaultTopology);
}

async function executeTopologyStatus() {
  const [fleetConfig, topology] = await Promise.all([
    readFleetConfig(),
    readTopologyConfig(),
  ]);

  const rawNodes = Array.isArray(fleetConfig.nodes) ? fleetConfig.nodes : [];

  const probedNodes = await Promise.all(
    rawNodes.map(async (node) => {
      const port = node.port ?? 11434;
      const online = await tcpProbe(node.ip, port);
      return {
        id: node.id ?? node.name?.toLowerCase().replace(/\s+/g, "-") ?? "node",
        name: node.name ?? node.ip,
        ip: node.ip,
        port,
        status: online ? "online" : "offline",
        roles: node.roles ?? [],
        type: "node",
      };
    })
  );

  const services = Array.isArray(topology.services) ? topology.services : [];
  const edges = Array.isArray(topology.edges) ? topology.edges : [];

  return {
    nodes: [...probedNodes, ...services],
    edges,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ADDON 4 — Open Items
// ─────────────────────────────────────────────────────────────────────────────

const itemsDir = path.join(resonantosRoot, "items");

const SEED_ITEMS = [
  {
    id: "item-001",
    title: "Configure bridge token for all addon pages",
    desc: "Ensure bridge-config.generated.js is accessible from all addon HTML pages.",
    status: "open",
    priority: "P1",
    section: "attention",
    source: "manual",
    created: new Date().toISOString(),
  },
  {
    id: "item-002",
    title: "Add more nodes to fleet.json",
    desc: "Add HAL 9000, Guardian, The OG, and Blade R730 to ~/.resonantos/fleet.json for real TCP probes.",
    status: "open",
    priority: "P2",
    section: "pending",
    source: "manual",
    created: new Date().toISOString(),
  },
];

async function ensureItems() {
  await ensureDir(itemsDir);
  const entries = await readdir(itemsDir).catch(() => []);
  if (entries.filter((f) => f.endsWith(".json")).length === 0) {
    for (const item of SEED_ITEMS) {
      await writeJsonFile(path.join(itemsDir, `${item.id}.json`), item);
    }
  }
}

async function executeItemsList() {
  await ensureItems();
  const entries = await readdir(itemsDir).catch(() => []);
  const items = [];
  for (const file of entries.filter((f) => f.endsWith(".json"))) {
    const item = await readJsonFile(path.join(itemsDir, file));
    if (item) items.push(item);
  }
  const grouped = {
    attention: items.filter((i) => i.section === "attention"),
    pending: items.filter((i) => i.section === "pending"),
    completed: items.filter((i) => i.section === "completed"),
  };
  return { items, grouped };
}

async function executeItemsCreate({ title, desc, priority, section }) {
  await ensureDir(itemsDir);
  const id = `item-${Date.now()}`;
  const item = {
    id,
    title: title ?? "Untitled Item",
    desc: desc ?? "",
    priority: priority ?? "P2",
    status: "open",
    section: section ?? "pending",
    source: "manual",
    created: new Date().toISOString(),
  };
  await writeJsonFile(path.join(itemsDir, `${id}.json`), item);
  return { item };
}

async function executeItemsUpdate({ id, section, status }) {
  if (!id) throw new Error("Missing item id");
  const filePath = path.join(itemsDir, `${id}.json`);
  const item = await readJsonFile(filePath);
  if (!item) throw new Error(`Item not found: ${id}`);
  if (section) item.section = section;
  if (status) item.status = status;
  await writeJsonFile(filePath, item);
  return { item };
}

// ─────────────────────────────────────────────────────────────────────────────
// ADDON 5 — Blackboard
// ─────────────────────────────────────────────────────────────────────────────

const blackboardDir = path.join(resonantosRoot, "blackboard");

async function executeBlackboardSave({ content, mode, label }) {
  await ensureDir(blackboardDir);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `blackboard-${ts}.json`;
  const filePath = path.join(blackboardDir, filename);
  const entry = {
    filename,
    saved: new Date().toISOString(),
    mode: mode ?? "unknown",
    label: label ?? "",
    content: content ?? "",
  };
  await writeJsonFile(filePath, entry);
  return { filename, path: filePath };
}

async function executeBlackboardList() {
  await ensureDir(blackboardDir);
  const entries = await readdir(blackboardDir).catch(() => []);
  const files = [];
  for (const file of entries.filter((f) => f.endsWith(".json"))) {
    const entry = await readJsonFile(path.join(blackboardDir, file));
    if (entry) {
      files.push({
        filename: entry.filename ?? file,
        saved: entry.saved,
        mode: entry.mode,
        label: entry.label,
      });
    }
  }
  files.sort((a, b) => new Date(b.saved) - new Date(a.saved));
  return { files };
}

async function executeBlackboardSendToAugmentor({ content, mode, label }) {
  // This route just persists the payload; the caller can invoke /augmentor/chat
  // directly. We save it as context and return formatted for the chat handler.
  const saved = await executeBlackboardSave({ content, mode, label });
  return {
    saved: saved.filename,
    message: `[Blackboard: ${label || mode || "content"}]\n\n${content ?? ""}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ADDON 6 — Gradient Performance
// ─────────────────────────────────────────────────────────────────────────────

const trainingDir = path.join(resonantosRoot, "training");
const benchmarksDir = path.join(resonantosRoot, "benchmarks");

const SEED_TRAINING = {
  name: "ResonantOS Base Run",
  machine: "Local",
  status: "paused",
  step: 0,
  totalSteps: 10000,
  lr: "3e-4",
  lossHistory: [],
  eta: "—",
};

const SEED_BENCHMARK = {
  model: "Baseline",
  score: 0,
  ours: false,
};

async function ensurePerfDirs() {
  await Promise.all([
    ensureDir(trainingDir),
    ensureDir(benchmarksDir),
  ]);
  const trainFiles = await readdir(trainingDir).catch(() => []);
  if (trainFiles.filter((f) => f.endsWith(".json")).length === 0) {
    await writeJsonFile(
      path.join(trainingDir, "example-run.json"),
      SEED_TRAINING
    );
  }
  const benchFiles = await readdir(benchmarksDir).catch(() => []);
  if (benchFiles.filter((f) => f.endsWith(".json")).length === 0) {
    await writeJsonFile(
      path.join(benchmarksDir, "baseline.json"),
      SEED_BENCHMARK
    );
  }
}

async function executePerfStatus() {
  await ensurePerfDirs();

  // Read training runs
  const trainFiles = await readdir(trainingDir).catch(() => []);
  const training = [];
  for (const f of trainFiles.filter((x) => x.endsWith(".json"))) {
    const run = await readJsonFile(path.join(trainingDir, f));
    if (run) training.push(run);
  }

  // Read benchmarks
  const benchFiles = await readdir(benchmarksDir).catch(() => []);
  const benchmarks = [];
  for (const f of benchFiles.filter((x) => x.endsWith(".json"))) {
    const bench = await readJsonFile(path.join(benchmarksDir, f));
    if (bench) benchmarks.push(bench);
  }

  // Fleet speed: probe Ollama nodes
  const fleetConfig = await readFleetConfig();
  const fleetNodes = Array.isArray(fleetConfig.nodes) ? fleetConfig.nodes : [];
  const speeds = await Promise.all(
    fleetNodes.map(async (node) => {
      const port = node.port ?? 11434;
      const online = await tcpProbe(node.ip, port);
      let models = [];
      if (online) {
        try {
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort(), 2000);
          const res = await fetch(`http://${node.ip}:${port}/api/tags`, {
            signal: controller.signal,
          });
          clearTimeout(t);
          if (res.ok) {
            const data = await res.json();
            models = Array.isArray(data.models)
              ? data.models.map((m) => m.name)
              : [];
          }
        } catch {
          // Ollama may not be present
        }
      }
      return {
        name: node.name ?? node.ip,
        ip: node.ip,
        status: online ? "online" : "offline",
        models,
      };
    })
  );

  return { training, benchmarks, speeds };
}

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────

export const addonRoutes = [
  // Fleet & Compute
  { method: "GET",  path: "/fleet/status",               handler: executeFleetStatus },

  // Task Board
  { method: "GET",  path: "/tasks/list",                 handler: executeTasksList },
  { method: "POST", path: "/tasks/update",               handler: executeTasksUpdate },
  { method: "POST", path: "/tasks/create",               handler: executeTasksCreate },

  // Canvas / Topology
  { method: "GET",  path: "/topology/status",            handler: executeTopologyStatus },

  // Open Items
  { method: "GET",  path: "/items/list",                 handler: executeItemsList },
  { method: "POST", path: "/items/create",               handler: executeItemsCreate },
  { method: "POST", path: "/items/update",               handler: executeItemsUpdate },

  // Blackboard
  { method: "POST", path: "/blackboard/save",            handler: executeBlackboardSave },
  { method: "GET",  path: "/blackboard/list",            handler: executeBlackboardList },
  { method: "POST", path: "/blackboard/send-to-augmentor", handler: executeBlackboardSendToAugmentor },

  // Gradient Perf
  { method: "GET",  path: "/perf/status",               handler: executePerfStatus },
];
