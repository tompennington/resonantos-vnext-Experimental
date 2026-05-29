/**
 * addon-routes.test.mjs — Unit tests for browser-first addon bridge routes
 *
 * Tests all 12 routes in addon-routes.mjs using Node's built-in test runner.
 * No external dependencies. Uses a real temporary ~/.resonantos/ config dir
 * or overrides via mock to avoid touching the real user config.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// ── Temporary config root ─────────────────────────────────────────────────

const TEST_ROOT = path.join(os.tmpdir(), `addon-routes-test-${Date.now()}`);

// Patch os.homedir to point at our temp dir so addonRoutes uses it
const origHomedir = os.homedir;
os.homedir = () => TEST_ROOT;

// Now import after patching
const { addonRoutes } = await import("../host/addon-routes.mjs");

// Build a route lookup map for convenience
const routeMap = new Map(
  addonRoutes.map((r) => [`${r.method}:${r.path}`, r.handler])
);

function getHandler(method, path) {
  const h = routeMap.get(`${method}:${path}`);
  assert.ok(h, `Route not found: ${method} ${path}`);
  return h;
}

// ── Setup / Teardown ───────────────────────────────────────────────────────

before(async () => {
  await mkdir(TEST_ROOT, { recursive: true });
});

after(async () => {
  os.homedir = origHomedir;
  await rm(TEST_ROOT, { recursive: true, force: true });
});

// ── Route existence checks ─────────────────────────────────────────────────

describe("addonRoutes exports", () => {
  it("exports an array", () => {
    assert.ok(Array.isArray(addonRoutes), "addonRoutes should be an array");
    assert.ok(addonRoutes.length > 0, "addonRoutes should not be empty");
  });

  it("every route has method, path, handler", () => {
    for (const route of addonRoutes) {
      assert.ok(typeof route.method === "string",  `method missing in route: ${JSON.stringify(route)}`);
      assert.ok(typeof route.path === "string",    `path missing in route: ${route.method}`);
      assert.ok(typeof route.handler === "function", `handler missing in route: ${route.path}`);
    }
  });

  const expectedRoutes = [
    ["GET",  "/fleet/status"],
    ["GET",  "/tasks/list"],
    ["POST", "/tasks/update"],
    ["POST", "/tasks/create"],
    ["GET",  "/topology/status"],
    ["GET",  "/items/list"],
    ["POST", "/items/create"],
    ["POST", "/items/update"],
    ["POST", "/blackboard/save"],
    ["GET",  "/blackboard/list"],
    ["POST", "/blackboard/send-to-augmentor"],
    ["GET",  "/perf/status"],
  ];

  for (const [method, routePath] of expectedRoutes) {
    it(`registers ${method} ${routePath}`, () => {
      assert.ok(routeMap.has(`${method}:${routePath}`), `Missing route: ${method} ${routePath}`);
    });
  }
});

// ── Fleet ─────────────────────────────────────────────────────────────────

describe("GET /fleet/status", () => {
  it("returns nodes array", async () => {
    const handler = getHandler("GET", "/fleet/status");
    const result = await handler({});
    assert.ok(Array.isArray(result.nodes), "nodes should be an array");
    assert.ok(result.nodes.length > 0, "should seed at least one node");
  });

  it("each node has required fields", async () => {
    const handler = getHandler("GET", "/fleet/status");
    const result = await handler({});
    for (const node of result.nodes) {
      assert.ok(typeof node.name === "string", "node.name should be string");
      assert.ok(typeof node.ip === "string",   "node.ip should be string");
      assert.ok(["online", "offline", "unknown"].includes(node.status), `node.status invalid: ${node.status}`);
    }
  });

  it("creates fleet.json if missing", async () => {
    const fleetPath = path.join(TEST_ROOT, ".resonantos", "fleet.json");
    // Delete if exists
    if (existsSync(fleetPath)) await rm(fleetPath);
    const handler = getHandler("GET", "/fleet/status");
    await handler({});
    assert.ok(existsSync(fleetPath), "fleet.json should be created");
  });
});

// ── Tasks ─────────────────────────────────────────────────────────────────

describe("GET /tasks/list", () => {
  it("returns tasks array with seed data", async () => {
    const handler = getHandler("GET", "/tasks/list");
    const result = await handler({});
    assert.ok(Array.isArray(result.tasks), "tasks should be array");
    assert.ok(result.tasks.length > 0, "should have seed tasks");
  });

  it("tasks are sorted by priority", async () => {
    const handler = getHandler("GET", "/tasks/list");
    const result = await handler({});
    const pOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
    for (let i = 1; i < result.tasks.length; i++) {
      const prev = pOrder[result.tasks[i - 1].priority] ?? 9;
      const curr = pOrder[result.tasks[i].priority] ?? 9;
      assert.ok(prev <= curr, "tasks should be sorted by priority ascending");
    }
  });
});

describe("POST /tasks/create", () => {
  it("creates a task and returns it", async () => {
    const handler = getHandler("POST", "/tasks/create");
    const result = await handler({ title: "Test Task", priority: "P1", assignee: "Analog 6" });
    assert.ok(result.task, "should return task");
    assert.equal(result.task.title, "Test Task");
    assert.equal(result.task.priority, "P1");
    assert.equal(result.task.status, "ready");
  });

  it("uses default title when none provided", async () => {
    const handler = getHandler("POST", "/tasks/create");
    const result = await handler({});
    assert.equal(result.task.title, "Untitled Task");
  });
});

describe("POST /tasks/update", () => {
  it("updates task status", async () => {
    // First create a task
    const createHandler = getHandler("POST", "/tasks/create");
    const created = await createHandler({ title: "Update Me" });
    const id = created.task.id;

    const updateHandler = getHandler("POST", "/tasks/update");
    const updated = await updateHandler({ id, status: "in-progress" });
    assert.equal(updated.task.status, "in-progress");
  });

  it("throws for missing id", async () => {
    const handler = getHandler("POST", "/tasks/update");
    await assert.rejects(() => handler({}), /Missing task id/);
  });

  it("throws for non-existent task", async () => {
    const handler = getHandler("POST", "/tasks/update");
    await assert.rejects(() => handler({ id: "task-does-not-exist", status: "done" }), /not found/i);
  });
});

// ── Topology ──────────────────────────────────────────────────────────────

describe("GET /topology/status", () => {
  it("returns nodes and edges arrays", async () => {
    const handler = getHandler("GET", "/topology/status");
    const result = await handler({});
    assert.ok(Array.isArray(result.nodes), "nodes should be array");
    assert.ok(Array.isArray(result.edges), "edges should be array");
  });

  it("each node has id, name, status", async () => {
    const handler = getHandler("GET", "/topology/status");
    const result = await handler({});
    for (const node of result.nodes) {
      assert.ok(typeof node.id === "string",   "node.id should be string");
      assert.ok(typeof node.name === "string", "node.name should be string");
      assert.ok(typeof node.status === "string", "node.status should be string");
    }
  });
});

// ── Open Items ────────────────────────────────────────────────────────────

describe("GET /items/list", () => {
  it("returns items array and grouped object", async () => {
    const handler = getHandler("GET", "/items/list");
    const result = await handler({});
    assert.ok(Array.isArray(result.items), "items should be array");
    assert.ok(result.grouped, "grouped should exist");
    assert.ok(Array.isArray(result.grouped.attention), "grouped.attention should be array");
    assert.ok(Array.isArray(result.grouped.pending),   "grouped.pending should be array");
    assert.ok(Array.isArray(result.grouped.completed), "grouped.completed should be array");
  });
});

describe("POST /items/create", () => {
  it("creates an item", async () => {
    const handler = getHandler("POST", "/items/create");
    const result = await handler({ title: "Test Item", section: "attention", priority: "P0" });
    assert.ok(result.item, "should return item");
    assert.equal(result.item.title, "Test Item");
    assert.equal(result.item.section, "attention");
    assert.equal(result.item.priority, "P0");
  });
});

describe("POST /items/update", () => {
  it("moves item to completed", async () => {
    const createHandler = getHandler("POST", "/items/create");
    const created = await createHandler({ title: "Move Me", section: "pending" });
    const id = created.item.id;

    const updateHandler = getHandler("POST", "/items/update");
    const updated = await updateHandler({ id, section: "completed", status: "done" });
    assert.equal(updated.item.section, "completed");
    assert.equal(updated.item.status, "done");
  });

  it("throws for missing id", async () => {
    const handler = getHandler("POST", "/items/update");
    await assert.rejects(() => handler({}), /Missing item id/);
  });
});

// ── Blackboard ────────────────────────────────────────────────────────────

describe("POST /blackboard/save", () => {
  it("saves blackboard content and returns filename", async () => {
    const handler = getHandler("POST", "/blackboard/save");
    const result = await handler({ content: "Hello world", mode: "document", label: "test" });
    assert.ok(typeof result.filename === "string", "filename should be string");
    assert.ok(result.filename.startsWith("blackboard-"), "filename should start with 'blackboard-'");
  });
});

describe("GET /blackboard/list", () => {
  it("returns files array", async () => {
    // Save something first
    const saveHandler = getHandler("POST", "/blackboard/save");
    await saveHandler({ content: "list test", mode: "canvas" });

    const listHandler = getHandler("GET", "/blackboard/list");
    const result = await listHandler({});
    assert.ok(Array.isArray(result.files), "files should be array");
    assert.ok(result.files.length > 0, "should have at least one file");
  });

  it("files are sorted newest first", async () => {
    const handler = getHandler("GET", "/blackboard/list");
    const result = await handler({});
    for (let i = 1; i < result.files.length; i++) {
      const prev = new Date(result.files[i - 1].saved).getTime();
      const curr = new Date(result.files[i].saved).getTime();
      assert.ok(prev >= curr, "files should be sorted newest first");
    }
  });
});

describe("POST /blackboard/send-to-augmentor", () => {
  it("saves content and returns message", async () => {
    const handler = getHandler("POST", "/blackboard/send-to-augmentor");
    const result = await handler({ content: "Test content", mode: "document", label: "my doc" });
    assert.ok(typeof result.saved === "string", "saved should be filename string");
    assert.ok(typeof result.message === "string", "message should be string");
    assert.ok(result.message.includes("Test content"), "message should include content");
  });
});

// ── Perf ──────────────────────────────────────────────────────────────────

describe("GET /perf/status", () => {
  it("returns training, benchmarks, speeds arrays", async () => {
    const handler = getHandler("GET", "/perf/status");
    const result = await handler({});
    assert.ok(Array.isArray(result.training),   "training should be array");
    assert.ok(Array.isArray(result.benchmarks), "benchmarks should be array");
    assert.ok(Array.isArray(result.speeds),     "speeds should be array");
  });

  it("seeds example data if dirs are empty", async () => {
    // Ensure dirs are fresh
    const trainingDir = path.join(TEST_ROOT, ".resonantos", "training");
    const benchDir    = path.join(TEST_ROOT, ".resonantos", "benchmarks");
    await rm(trainingDir, { recursive: true, force: true });
    await rm(benchDir,    { recursive: true, force: true });

    const handler = getHandler("GET", "/perf/status");
    const result = await handler({});
    assert.ok(result.training.length > 0,   "should seed training run");
    assert.ok(result.benchmarks.length > 0, "should seed benchmark");
  });

  it("training run has required fields", async () => {
    const handler = getHandler("GET", "/perf/status");
    const result = await handler({});
    for (const run of result.training) {
      assert.ok(typeof run.name === "string",   "run.name should be string");
      assert.ok(typeof run.status === "string", "run.status should be string");
    }
  });

  it("speeds include node name and status", async () => {
    const handler = getHandler("GET", "/perf/status");
    const result = await handler({});
    for (const speed of result.speeds) {
      assert.ok(typeof speed.name === "string",   "speed.name should be string");
      assert.ok(typeof speed.status === "string", "speed.status should be string");
    }
  });
});
