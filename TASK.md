# Task: Release Layout Changes — Clean Side Panel + Move Panels to Tabs

## Context
File: `browser-first/resonantos-side-panel-extension/src/side-panel.html` (265 lines)
File: `browser-first/resonantos-side-panel-extension/src/side-panel.js` (948 lines)

## Changes Required

### 1. side-panel.html — Remove DAO panels, add nav buttons for remaining features

In the `.side-panels-container` div, make these changes:

**REMOVE entirely (hide until blockchain ready):**
- The `<details id="wallet-section">` block
- The `<details id="tribes-section">` block  
- The `<details id="bounties-section">` block
- The `<details id="governance-section">` block

**KEEP but convert to nav buttons (open as sidecar tab):**
- Shield → convert from `<details>` to a nav button like Protocol Store
- Archive → convert from `<details>` to a nav button
- R-Awareness → convert from `<details>` to a nav button

**KEEP as-is:**
- Protocol Store nav button (already opens as full tab)

The side-panels-container should end up with just 4 buttons:
```html
<div class="side-panels-container">
  <div class="panel-section panel-section-link" id="store-section">
    <button type="button" class="panel-section-summary panel-nav-btn" id="open-store-tab">◈ Protocol Store</button>
  </div>
  <div class="panel-section panel-section-link" id="shield-section">
    <button type="button" class="panel-section-summary panel-nav-btn" id="open-shield-tab">◈ Shield</button>
  </div>
  <div class="panel-section panel-section-link" id="archive-section">
    <button type="button" class="panel-section-summary panel-nav-btn" id="open-archive-tab">◈ Archive</button>
  </div>
  <div class="panel-section panel-section-link" id="awareness-section">
    <button type="button" class="panel-section-summary panel-nav-btn" id="open-awareness-tab">◈ R-Awareness</button>
  </div>
</div>
```

Also REMOVE the wallet-banner div (no wallet = no banner needed):
```html
<!-- REMOVE THIS -->
<div id="wallet-banner" class="wallet-banner" hidden aria-live="polite"></div>
```

### 2. Create sidecar tab pages

Create THREE new HTML files that are self-contained sidecar tab pages (following the protocol-store.html pattern):

#### A. `src/shield-tab.html`
```html
<!doctype html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src http://127.0.0.1:47773; img-src 'self' data:;" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Shield — ResonantOS</title>
  <link rel="stylesheet" href="./side-panel.css" />
</head>
<body>
  <div class="sidecar-page">
    <header class="sidecar-header">
      <h1 class="sidecar-title">◈ Shield</h1>
      <button type="button" class="sidecar-close" onclick="window.close()">✕ Close Tab</button>
    </header>
    <div class="sidecar-body">
      <div class="shield-status-row">
        <span class="status-dot active"></span>
        <strong>Shield Active</strong>
      </div>
      <div class="shield-stats">
        <div class="shield-stat"><span class="shield-stat-value" id="shield-blocks">—</span><span class="shield-stat-label">Blocks</span></div>
        <div class="shield-stat"><span class="shield-stat-value" id="shield-approvals">—</span><span class="shield-stat-label">Approvals</span></div>
        <div class="shield-stat"><span class="shield-stat-value" id="shield-rules">—</span><span class="shield-stat-label">Rules</span></div>
      </div>
      <h2 class="sidecar-section-title">Recent Security Events</h2>
      <div id="shield-events" class="shield-events">
        <p class="sidecar-placeholder">Loading events…</p>
      </div>
      <h2 class="sidecar-section-title">Active Rules</h2>
      <div id="shield-rules-list" class="shield-rules-list">
        <p class="sidecar-placeholder">Loading rules…</p>
      </div>
    </div>
  </div>
  <script src="./bridge-config.generated.js"></script>
  <script type="module" src="./shield-tab.js"></script>
</body>
</html>
```

#### B. `src/archive-tab.html`
```html
<!doctype html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src http://127.0.0.1:47773; img-src 'self' data:;" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Archive — ResonantOS</title>
  <link rel="stylesheet" href="./side-panel.css" />
</head>
<body>
  <div class="sidecar-page">
    <header class="sidecar-header">
      <h1 class="sidecar-title">◈ Living Archive</h1>
      <button type="button" class="sidecar-close" onclick="window.close()">✕ Close Tab</button>
    </header>
    <div class="sidecar-body">
      <div class="archive-search-row">
        <input id="archive-search-input" type="search" class="archive-search" placeholder="Search Living Archive…" autocomplete="off" />
        <button type="button" class="sidecar-action-btn" id="archive-search-btn">Search</button>
      </div>
      <div id="archive-results" class="archive-results">
        <p class="sidecar-placeholder">Enter a query to search your archive.</p>
      </div>
      <hr class="sidecar-divider" />
      <div class="archive-meta-row">
        <div class="archive-meta-item"><span class="archive-meta-label">Wiki pages</span><span class="archive-meta-value" id="archive-wiki-pages">—</span></div>
        <div class="archive-meta-item"><span class="archive-meta-label">Intakes</span><span class="archive-meta-value" id="archive-intakes">—</span></div>
      </div>
      <button type="button" class="sidecar-action-btn full-width" id="archive-quick-save">Quick Save Current Page</button>
    </div>
  </div>
  <script src="./bridge-config.generated.js"></script>
  <script type="module" src="./archive-tab.js"></script>
</body>
</html>
```

#### C. `src/awareness-tab.html`
```html
<!doctype html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src http://127.0.0.1:47773; img-src 'self' data:;" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>R-Awareness — ResonantOS</title>
  <link rel="stylesheet" href="./side-panel.css" />
</head>
<body>
  <div class="sidecar-page">
    <header class="sidecar-header">
      <h1 class="sidecar-title">◈ R-Awareness</h1>
      <button type="button" class="sidecar-close" onclick="window.close()">✕ Close Tab</button>
    </header>
    <div class="sidecar-body">
      <div class="awareness-grid">
        <div class="awareness-card"><span class="awareness-card-label">Context Richness</span><span class="awareness-card-value" id="aw-richness">—</span></div>
        <div class="awareness-card"><span class="awareness-card-label">Visible Sections</span><span class="awareness-card-value" id="aw-sections">—</span></div>
        <div class="awareness-card"><span class="awareness-card-label">Active Dwell</span><span class="awareness-card-value" id="aw-dwell">—</span></div>
        <div class="awareness-card"><span class="awareness-card-label">Domain Plugin</span><span class="awareness-card-value" id="aw-plugin">—</span></div>
      </div>
      <button type="button" class="sidecar-action-btn full-width" id="aw-refresh-btn">Refresh Context</button>
      <h2 class="sidecar-section-title">Visible Sections</h2>
      <div id="aw-sections-list" class="aw-sections-list">
        <p class="sidecar-placeholder">Click refresh to capture current page context.</p>
      </div>
    </div>
  </div>
  <script src="./bridge-config.generated.js"></script>
  <script type="module" src="./awareness-tab.js"></script>
</body>
</html>
```

### 3. Create JS files for sidecar tabs

Each sidecar tab needs a small self-contained JS file with bridgeRequest copied from protocol-store.js pattern:

#### A. `src/shield-tab.js` — loads security events from bridge
#### B. `src/archive-tab.js` — search + quick save (move logic from side-panel.js)
#### C. `src/awareness-tab.js` — reads page context via chrome.tabs.sendMessage

### 4. Update side-panel.js

- Remove all DAO panel toggle handlers (wallet, tribes, bounties, governance, shield sections)
- Remove archive search/quick-save handlers (moved to archive-tab.js)
- Remove R-Awareness refresh handler (moved to awareness-tab.js)
- Add tab opener functions for Shield, Archive, R-Awareness (same pattern as openProtocolStore)
- Wire click handlers on the new nav buttons: `open-shield-tab`, `open-archive-tab`, `open-awareness-tab`
- Remove wallet-banner related code
- Keep: settings overlay, theme toggle, Protocol Store opener, copy mobile URL

### 5. Update manifest.json

Add new pages to `web_accessible_resources`:
- `src/shield-tab.html`, `src/shield-tab.js`
- `src/archive-tab.html`, `src/archive-tab.js`
- `src/awareness-tab.html`, `src/awareness-tab.js`

### 6. Add sidecar CSS to side-panel.css

Add styles for the sidecar pages at the end of side-panel.css:
```css
/* === Sidecar Tab Pages === */
.sidecar-page { max-width: 900px; margin: 0 auto; padding: 24px; }
.sidecar-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
.sidecar-title { font-size: 1.4rem; font-weight: 700; color: var(--fg, #e8e8e8); margin: 0; }
.sidecar-close { background: none; border: 1px solid var(--border, #333); color: var(--muted, #888); padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; }
.sidecar-close:hover { color: var(--fg, #e8e8e8); border-color: var(--fg, #e8e8e8); }
.sidecar-body { display: flex; flex-direction: column; gap: 16px; }
.sidecar-section-title { font-size: 0.9rem; font-weight: 600; color: var(--muted, #888); margin: 8px 0 4px; text-transform: uppercase; letter-spacing: 0.05em; }
.sidecar-placeholder { color: var(--muted, #888); font-size: 0.85rem; font-style: italic; }
.sidecar-action-btn { background: var(--accent, #14F195); color: #000; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.85rem; }
.sidecar-action-btn:hover { opacity: 0.9; }
.sidecar-action-btn.full-width { width: 100%; }
.sidecar-divider { border: none; border-top: 1px solid var(--border, #333); margin: 8px 0; }

/* Shield sidecar */
.shield-status-row { display: flex; align-items: center; gap: 8px; padding: 12px; background: var(--card-bg, #1a1a1a); border-radius: 8px; }
.shield-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.shield-stat { text-align: center; padding: 12px; background: var(--card-bg, #1a1a1a); border-radius: 8px; }
.shield-stat-value { display: block; font-size: 1.5rem; font-weight: 700; color: var(--accent, #14F195); }
.shield-stat-label { font-size: 0.75rem; color: var(--muted, #888); text-transform: uppercase; }
.shield-events { display: flex; flex-direction: column; gap: 8px; }

/* Archive sidecar */
.archive-search-row { display: flex; gap: 8px; }
.archive-search { flex: 1; background: var(--input-bg, #1a1a1a); border: 1px solid var(--border, #333); color: var(--fg, #e8e8e8); padding: 8px 12px; border-radius: 6px; font-size: 0.9rem; }
.archive-results { min-height: 100px; }
.archive-meta-row { display: flex; gap: 24px; }
.archive-meta-item { display: flex; flex-direction: column; }
.archive-meta-label { font-size: 0.75rem; color: var(--muted, #888); text-transform: uppercase; }
.archive-meta-value { font-size: 1.1rem; font-weight: 600; color: var(--fg, #e8e8e8); }

/* Awareness sidecar */
.awareness-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.awareness-card { padding: 16px; background: var(--card-bg, #1a1a1a); border-radius: 8px; text-align: center; }
.awareness-card-label { display: block; font-size: 0.75rem; color: var(--muted, #888); text-transform: uppercase; margin-bottom: 4px; }
.awareness-card-value { display: block; font-size: 1.3rem; font-weight: 700; color: var(--accent, #14F195); }
```

## After all changes
- Run `node --check` on all new + modified JS files
- Run `python3 -m json.tool` on manifest.json
- Run `npm run test:browser-first`
