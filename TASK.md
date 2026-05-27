# Task: Merge Step 8 — side-panel.js — modular base + our product features

## Context
His version (current): 776 lines — modular, imports 22 lib files, handles chat + agent control + jobs + site permissions
Our version: `git show pre-merge-backup:browser-first/resonantos-side-panel-extension/src/side-panel.js` — 3477 lines monolithic

## Strategy
Start with HIS 776-line modular file as the base. Add our product features on top. Do NOT rewrite his imports or module wiring — ADD to the end.

Read BOTH files. His is the current file on disk. Ours is on the pre-merge-backup branch.

## What to add (append AFTER his existing code, before the closing of the file)

### Block 1: DOM refs for our new elements
Add these querySelector calls near the top where he has his DOM refs (after line ~60):
```javascript
// === Tom/Analog6 product features ===
const bridgeBanner = document.getElementById("bridge-banner");
const walletBanner = document.getElementById("wallet-banner");
const themeToggle = document.getElementById("theme-toggle");
const settingsToggleBtn = document.getElementById("settings-toggle");
const settingsOverlay = document.getElementById("settings-overlay");
const settingsClose = document.getElementById("settings-close");
const settingsSave = document.getElementById("settings-save");
const settingsStatus = document.getElementById("settings-status");
const themeToggleSettings = document.getElementById("theme-toggle-settings");
const copyMobileUrl = document.getElementById("copy-mobile-url");
const openStoreBtn = document.getElementById("open-store-tab");
const archiveSearchBtn = document.getElementById("archive-search-btn");
const archiveSearchInput = document.getElementById("archive-search-input");
const archiveQuickSave = document.getElementById("archive-quick-save");
const awRefreshBtn = document.getElementById("aw-refresh-btn");
```

### Block 2: Settings overlay (append at end)
```javascript
// === Settings overlay ===
if (settingsToggleBtn && settingsOverlay) {
  settingsToggleBtn.addEventListener("click", () => { settingsOverlay.hidden = false; });
}
if (settingsClose && settingsOverlay) {
  settingsClose.addEventListener("click", () => { settingsOverlay.hidden = true; });
}
if (settingsSave) {
  settingsSave.addEventListener("click", async () => {
    const openaiKey = document.getElementById("key-openai")?.value?.trim() ?? "";
    const minimaxKey = document.getElementById("key-minimax")?.value?.trim() ?? "";
    const providers = {};
    if (openaiKey) providers["shared-openai"] = openaiKey;
    if (minimaxKey) providers["shared-minimax"] = minimaxKey;
    try {
      await bridgeRequest("/providers/save", { method: "POST", body: { providers } });
      if (settingsStatus) { settingsStatus.textContent = "Saved ✓"; setTimeout(() => { settingsStatus.textContent = ""; }, 2000); }
    } catch (err) {
      if (settingsStatus) settingsStatus.textContent = "Error: " + (err.message || err);
    }
  });
}
```

### Block 3: Theme toggle (append at end)
```javascript
// === Theme toggle ===
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  if (themeToggle) themeToggle.textContent = theme === "dark" ? "🌙" : "☀️";
  if (themeToggleSettings) themeToggleSettings.textContent = theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode";
}
const savedTheme = localStorage.getItem("resonantos-theme") || "dark";
applyTheme(savedTheme);
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem("resonantos-theme", next);
    applyTheme(next);
  });
}
if (themeToggleSettings) {
  themeToggleSettings.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem("resonantos-theme", next);
    applyTheme(next);
  });
}
```

### Block 4: Protocol Store tab opener (append at end)
```javascript
// === Protocol Store full tab ===
let storeTabId = null;
const openProtocolStore = async () => {
  if (storeTabId) {
    const alive = await chrome.tabs.get(storeTabId).catch(() => null);
    if (alive) { await chrome.tabs.update(storeTabId, { active: true }).catch(() => undefined); return; }
    storeTabId = null;
  }
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find(t => t.url?.includes("protocol-store.html"));
  if (existing) { storeTabId = existing.id; await chrome.tabs.update(storeTabId, { active: true }).catch(() => undefined); return; }
  const storeUrl = chrome.runtime.getURL("src/protocol-store.html");
  const tab = await chrome.tabs.create({ url: storeUrl });
  storeTabId = tab.id ?? null;
};
if (openStoreBtn) openStoreBtn.addEventListener("click", () => void openProtocolStore());
```

### Block 5: DAO panel data loaders (append at end)
```javascript
// === DAO panel data loaders ===
const walletSection = document.getElementById("wallet-section");
if (walletSection) {
  walletSection.addEventListener("toggle", async () => {
    if (!walletSection.open) return;
    const body = document.getElementById("wallet-body");
    if (!body) return;
    try {
      // Wallet detection is handled by wallet-adapter.js
      // Just show a status message for now
      body.innerHTML = '<p class="panel-section-placeholder">Wallet panel ready. Connect via Phantom.</p>';
    } catch {}
  });
}

const tribesSection = document.getElementById("tribes-section");
if (tribesSection) {
  tribesSection.addEventListener("toggle", async () => {
    if (!tribesSection.open) return;
    const body = document.getElementById("tribes-body");
    if (!body) return;
    try {
      const result = await bridgeRequest("/tribes/list");
      const tribes = result.tribes ?? [];
      if (!tribes.length) { body.innerHTML = '<p class="panel-section-placeholder">No tribes yet.</p>'; return; }
      body.innerHTML = tribes.map(t => `<div class="panel-card"><strong>${t.name || "Unnamed"}</strong><p>${t.description || ""}</p><span class="panel-badge">${t.focus || ""}</span></div>`).join("");
    } catch (err) { body.innerHTML = `<p class="panel-section-error">Tribes unavailable: ${err.message || err}</p>`; }
  });
}

const bountiesSection = document.getElementById("bounties-section");
if (bountiesSection) {
  bountiesSection.addEventListener("toggle", async () => {
    if (!bountiesSection.open) return;
    const body = document.getElementById("bounties-body");
    if (!body) return;
    try {
      const result = await bridgeRequest("/bounties/list");
      const bounties = result.bounties ?? [];
      if (!bounties.length) { body.innerHTML = '<p class="panel-section-placeholder">No bounties yet.</p>'; return; }
      body.innerHTML = bounties.map(b => `<div class="panel-card"><strong>${b.title || "Unnamed"}</strong><p>${b.description || ""}</p><span class="panel-badge">${b.reward ?? 0} ${b.rewardToken ?? "RES"}</span><span class="panel-badge status-${b.status ?? "open"}">${b.status ?? "open"}</span></div>`).join("");
    } catch (err) { body.innerHTML = `<p class="panel-section-error">Bounties unavailable: ${err.message || err}</p>`; }
  });
}

// Governance + Shield — load on expand (similar pattern)
const governanceSection = document.getElementById("governance-section");
if (governanceSection) {
  governanceSection.addEventListener("toggle", () => {
    if (!governanceSection.open) return;
    const body = document.getElementById("governance-body");
    if (body) body.innerHTML = '<p class="panel-section-placeholder">Governance proposals coming soon.</p>';
  });
}

const shieldSection = document.getElementById("shield-section");
if (shieldSection) {
  shieldSection.addEventListener("toggle", () => {
    if (!shieldSection.open) return;
    const body = document.getElementById("shield-body");
    if (body) body.innerHTML = '<p class="panel-section-placeholder">Security audit trail loading…</p>';
  });
}
```

### Block 6: Archive panel (append at end)
```javascript
// === Archive panel ===
if (archiveSearchBtn && archiveSearchInput) {
  archiveSearchBtn.addEventListener("click", async () => {
    const query = archiveSearchInput.value.trim();
    if (!query) return;
    const resultsDiv = document.getElementById("archive-results");
    if (!resultsDiv) return;
    resultsDiv.innerHTML = '<p class="panel-section-placeholder">Searching…</p>';
    try {
      const result = await bridgeRequest("/memory/search", { method: "POST", body: { query } });
      const hits = result.results ?? [];
      if (!hits.length) { resultsDiv.innerHTML = '<p class="panel-section-placeholder">No results.</p>'; return; }
      resultsDiv.innerHTML = hits.map(h => `<div class="archive-result"><strong>${h.title || h.path || "Untitled"}</strong><p>${(h.snippet || "").slice(0, 200)}</p></div>`).join("");
    } catch (err) { resultsDiv.innerHTML = `<p class="panel-section-error">${err.message || err}</p>`; }
  });
}

if (archiveQuickSave) {
  archiveQuickSave.addEventListener("click", async () => {
    archiveQuickSave.disabled = true;
    archiveQuickSave.textContent = "Saving…";
    try {
      const tab = await chrome.tabs.query({ active: true, currentWindow: true }).then(t => t[0]);
      if (!tab) throw new Error("No active tab");
      await bridgeRequest("/archive/intake", { method: "POST", body: { url: tab.url, title: tab.title, source: "quick-save" } });
      archiveQuickSave.textContent = "Saved ✓";
      setTimeout(() => { archiveQuickSave.textContent = "Quick Save Current Page"; archiveQuickSave.disabled = false; }, 2000);
    } catch (err) {
      archiveQuickSave.textContent = "Error";
      setTimeout(() => { archiveQuickSave.textContent = "Quick Save Current Page"; archiveQuickSave.disabled = false; }, 2000);
    }
  });
}
```

### Block 7: R-Awareness panel (append at end)
```javascript
// === R-Awareness panel ===
if (awRefreshBtn) {
  awRefreshBtn.addEventListener("click", async () => {
    try {
      const tab = await chrome.tabs.query({ active: true, currentWindow: true }).then(t => t[0]);
      if (!tab?.id) return;
      const response = await chrome.tabs.sendMessage(tab.id, { channel: "resonantos.browser_first.content", type: "read_page" });
      const ctx = response?.snapshot?.resonantContext;
      if (ctx) {
        const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
        el("aw-richness", `${ctx.richness ?? 0}%`);
        el("aw-sections", `${(ctx.visibleSections || []).length}`);
        el("aw-dwell", ctx.activeDwellSection?.label ?? "none");
        el("aw-plugin", ctx.domainPlugin ?? "generic");
      }
    } catch {}
  });
}
```

### Block 8: Copy mobile URL (append at end)
```javascript
// === Copy mobile URL ===
if (copyMobileUrl) {
  copyMobileUrl.addEventListener("click", () => {
    navigator.clipboard.writeText("https://resonantclaw.com").catch(() => {});
    copyMobileUrl.textContent = "Copied!";
    setTimeout(() => { copyMobileUrl.textContent = "Copy URL"; }, 1500);
  });
}
```

## Important notes
- `bridgeRequest` is already available from his `createBridgeClient()` call (line ~82 in his file)
- All new code goes AFTER his existing code at the bottom of the file
- DOM refs go near the top with his existing refs
- Do NOT modify any of his imports or module wiring
- Do NOT duplicate any function he already has
- Run `node --check` after writing
