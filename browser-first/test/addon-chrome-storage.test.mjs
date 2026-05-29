/**
 * addon-chrome-storage.test.mjs
 *
 * Verifies that all 6 browser-first addons have been correctly migrated
 * from the bridge server data layer to chrome.storage.local.
 *
 * Checks:
 *  - No bridge fetch calls remain in JS files
 *  - Storage adapter (bbStorage / storage) function exists in each file
 *  - HTML files do not reference bridge-config.generated.js
 *  - HTML CSP no longer points at 127.0.0.1:47773
 *  - Seed data function / constant exists for data-bearing addons
 *  - No __RESONANTOS_BRIDGE_CONFIG__ references
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADDONS_DIR = path.resolve(__dirname, "../addons");

// ── Helpers ────────────────────────────────────────────────────────────────

async function readAddon(addonName, filename) {
  const filePath = path.join(ADDONS_DIR, addonName, filename);
  return readFile(filePath, "utf8");
}

// ── Addon definitions ──────────────────────────────────────────────────────

const ADDONS = [
  { name: "task-board",    js: "task-board.js",    html: "task-board.html",    storageKey: "resonantos_tasks",         seedConst: "SEED_TASKS" },
  { name: "open-items",    js: "open-items.js",    html: "open-items.html",    storageKey: "resonantos_items",         seedConst: "SEED_ITEMS" },
  { name: "canvas",        js: "canvas.js",        html: "canvas.html",        storageKey: "resonantos_fleet_nodes",   seedConst: "SEED_NODES" },
  { name: "fleet-compute", js: "fleet-compute.js", html: "fleet-compute.html", storageKey: "resonantos_fleet",         seedConst: "SEED_FLEET" },
  { name: "gradient-perf", js: "gradient-perf.js", html: "gradient-perf.html", storageKey: "resonantos_training_runs", seedConst: "SEED_TRAINING" },
  { name: "blackboard",    js: "blackboard.js",    html: "blackboard.html",    storageKey: "resonantos_blackboard_saves", seedConst: null },
];

// ── JS File Tests ──────────────────────────────────────────────────────────

for (const addon of ADDONS) {
  test(`[${addon.name}] JS: no bridge fetch calls to 127.0.0.1:47773`, async () => {
    const js = await readAddon(addon.name, addon.js);
    assert.ok(
      !js.includes("127.0.0.1:47773"),
      `${addon.js} still contains hardcoded bridge URL 127.0.0.1:47773`
    );
  });

  test(`[${addon.name}] JS: no apiFetch / bridgeFetch / bbBridgeFetch function`, async () => {
    const js = await readAddon(addon.name, addon.js);
    assert.ok(
      !js.includes("function apiFetch") &&
      !js.includes("function bridgeFetch") &&
      !js.includes("function bbBridgeFetch"),
      `${addon.js} still contains a bridge fetch function`
    );
  });

  test(`[${addon.name}] JS: no __RESONANTOS_BRIDGE_CONFIG__ reference`, async () => {
    const js = await readAddon(addon.name, addon.js);
    assert.ok(
      !js.includes("__RESONANTOS_BRIDGE_CONFIG__"),
      `${addon.js} still references __RESONANTOS_BRIDGE_CONFIG__`
    );
  });

  test(`[${addon.name}] JS: no bridgeUrl / bridgeToken config references`, async () => {
    const js = await readAddon(addon.name, addon.js);
    assert.ok(
      !js.includes("bridgeUrl") && !js.includes("bridgeToken"),
      `${addon.js} still references bridgeUrl or bridgeToken`
    );
  });

  test(`[${addon.name}] JS: storage adapter exists (chrome.storage.local + localStorage fallback)`, async () => {
    const js = await readAddon(addon.name, addon.js);
    assert.ok(
      js.includes("chrome.storage?.local") || js.includes("chrome.storage.local"),
      `${addon.js} missing chrome.storage.local usage`
    );
    assert.ok(
      js.includes("localStorage"),
      `${addon.js} missing localStorage fallback`
    );
  });

  test(`[${addon.name}] JS: storage key is defined`, async () => {
    const js = await readAddon(addon.name, addon.js);
    assert.ok(
      js.includes(addon.storageKey),
      `${addon.js} missing storage key '${addon.storageKey}'`
    );
  });

  if (addon.seedConst) {
    test(`[${addon.name}] JS: seed data constant '${addon.seedConst}' exists`, async () => {
      const js = await readAddon(addon.name, addon.js);
      assert.ok(
        js.includes(addon.seedConst),
        `${addon.js} missing seed data constant '${addon.seedConst}'`
      );
    });
  }
}

// ── HTML File Tests ────────────────────────────────────────────────────────

for (const addon of ADDONS) {
  test(`[${addon.name}] HTML: no bridge-config.generated.js script tag`, async () => {
    const html = await readAddon(addon.name, addon.html);
    assert.ok(
      !html.includes("bridge-config.generated.js"),
      `${addon.html} still references bridge-config.generated.js`
    );
  });

  test(`[${addon.name}] HTML: CSP connect-src does not point to 127.0.0.1:47773`, async () => {
    const html = await readAddon(addon.name, addon.html);
    // The old bridge-specific CSP should be gone
    assert.ok(
      !html.includes("connect-src http://127.0.0.1:47773"),
      `${addon.html} CSP still restricts to 127.0.0.1:47773`
    );
  });
}

// ── canvas/fleet-compute: Ollama probe ─────────────────────────────────────

test("[canvas] JS: uses AbortController for Ollama probe timeout", async () => {
  const js = await readAddon("canvas", "canvas.js");
  assert.ok(js.includes("AbortController"), "canvas.js should use AbortController for probe timeout");
  assert.ok(js.includes("/api/tags"), "canvas.js should probe /api/tags endpoint");
});

test("[fleet-compute] JS: uses AbortController for Ollama probe timeout", async () => {
  const js = await readAddon("fleet-compute", "fleet-compute.js");
  assert.ok(js.includes("AbortController"), "fleet-compute.js should use AbortController for probe timeout");
  assert.ok(js.includes("/api/tags"), "fleet-compute.js should probe /api/tags endpoint");
});

test("[gradient-perf] JS: uses AbortController for Ollama probe timeout", async () => {
  const js = await readAddon("gradient-perf", "gradient-perf.js");
  assert.ok(js.includes("AbortController"), "gradient-perf.js should use AbortController for probe timeout");
});

// ── Data management: CRUD buttons ─────────────────────────────────────────

test("[task-board] JS: has delete button logic", async () => {
  const js = await readAddon("task-board", "task-board.js");
  assert.ok(js.includes("card-delete-btn") || js.includes("btn-delete"), "task-board.js should have delete button");
});

test("[open-items] JS: has delete button logic", async () => {
  const js = await readAddon("open-items", "open-items.js");
  assert.ok(js.includes("item-delete-btn") || js.includes("btn-delete"), "open-items.js should have delete button");
});

test("[canvas] JS: has Add Node functionality", async () => {
  const js = await readAddon("canvas", "canvas.js");
  assert.ok(js.includes("Add Node") || js.includes("btn-add-node"), "canvas.js should have Add Node button");
});

test("[canvas] JS: has Add Connection functionality", async () => {
  const js = await readAddon("canvas", "canvas.js");
  assert.ok(js.includes("Add Connection") || js.includes("btn-add-conn"), "canvas.js should have Add Connection button");
});

test("[fleet-compute] JS: has Add Node and Remove Node functionality", async () => {
  const js = await readAddon("fleet-compute", "fleet-compute.js");
  assert.ok(js.includes("Add Node") || js.includes("btn-fleet-add-node"), "fleet-compute.js should have Add Node button");
  assert.ok(js.includes("btn-remove-node") || js.includes("Remove Node"), "fleet-compute.js should have Remove Node button");
});

test("[gradient-perf] JS: has New Training Run functionality", async () => {
  const js = await readAddon("gradient-perf", "gradient-perf.js");
  assert.ok(js.includes("New Training Run") || js.includes("btn-add-run"), "gradient-perf.js should have New Training Run button");
});

test("[gradient-perf] JS: has Add Benchmark functionality", async () => {
  const js = await readAddon("gradient-perf", "gradient-perf.js");
  assert.ok(js.includes("Add Benchmark") || js.includes("btn-add-bench"), "gradient-perf.js should have Add Benchmark button");
});

test("[blackboard] JS: has Save/Load functionality using storage", async () => {
  const js = await readAddon("blackboard", "blackboard.js");
  assert.ok(js.includes("resonantos_blackboard_saves"), "blackboard.js should define storage key for saves");
  assert.ok(js.includes("loadBlackboardSaves"), "blackboard.js should have loadBlackboardSaves function");
  assert.ok(js.includes("saveBlackboardEntry"), "blackboard.js should have saveBlackboardEntry function");
});

test("[blackboard] JS: Send to Augmentor uses chrome.runtime or storage fallback (no bridge)", async () => {
  const js = await readAddon("blackboard", "blackboard.js");
  // Should NOT use bridge fetch
  assert.ok(
    !js.includes("bbBridgeFetch") || !js.includes("/blackboard/send-to-augmentor"),
    "blackboard.js should not call /blackboard/send-to-augmentor via bridge"
  );
  // Should use chrome.runtime or storage
  assert.ok(
    js.includes("chrome.runtime.sendMessage") || js.includes("saveBlackboardEntry"),
    "blackboard.js Send to Augmentor should use chrome.runtime.sendMessage or saveBlackboardEntry"
  );
});

// ── Storage adapter shape ──────────────────────────────────────────────────

test("[task-board] JS: storage.get and storage.set pattern is correct", async () => {
  const js = await readAddon("task-board", "task-board.js");
  assert.ok(js.includes("async get(keys)"), "storage adapter should have async get(keys)");
  assert.ok(js.includes("async set(data)"), "storage adapter should have async set(data)");
});

test("[blackboard] JS: bbStorage adapter has get and set", async () => {
  const js = await readAddon("blackboard", "blackboard.js");
  assert.ok(js.includes("bbStorage"), "blackboard.js should define bbStorage");
  assert.ok(js.includes("async get(keys)"), "bbStorage should have async get(keys)");
  assert.ok(js.includes("async set(data)"), "bbStorage should have async set(data)");
});
