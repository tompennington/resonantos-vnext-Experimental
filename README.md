# ResonantOS vNext

ResonantOS is an AI operating system that lives inside your browser. It combines an AI chat assistant, autonomous browser control, a wallet-aware DAO layer, and a security-first architecture into a single Chromium extension.

This repository contains both the **browser-first** product (active development) and the **desktop Tauri shell** (reference platform).

## Two Modes

### Main Workspace (Full-Screen)
Opens as your new tab page — a full-screen AI workspace with:
- **Left rail** — Answer, Living Archive, Hermes, OpenCode workspaces + chat history
- **Answer view** — full-screen Augmentor chat with tabs (Answer / Links / Images)
- **Quick actions** — Research the web, Plan work, Control browser
- **Model selector** — 14 models across 7 providers
- **Thinking depth** — Low / Medium / High (maps to OpenAI reasoning_effort)

### Side Panel (Extension Mode)
Opens alongside any webpage — click the ResonantOS icon in your toolbar:
- **Augmentor chat** with chat rail and history
- **Agent Control** — AI reads and operates the active webpage
- **Sidecar tabs** — Protocol Store, Shield, Archive, R-Awareness (open as full tabs from the nav buttons)
- **Settings overlay** — API keys, theme, mobile access

## What's In The Box

### Core Features
- **Augmentor Chat** — AI assistant that reads your current page, answers questions, takes actions
- **Agent Control Mode** — autonomous observe → decide → act → verify loop with safety gates
- **Multi-Session Chat** — create, switch, and manage multiple conversations with full history
- **Protocol Store** — browse and install AI protocols (full-tab)
- **Blackboard** — visual canvas for diagrams, tables, documents, presentations (full-tab)
- **Living Archive** — save, search, and retrieve anything you've browsed (full-tab)
- **R-Awareness** — real-time context richness meter showing what the AI sees (full-tab)
- **Shield** — live security audit trail with real-time injection detection (full-tab)
- **Wallet Adapter** — Solana/Phantom wallet integration (human-only signing)
- **Resonant Context SDK** — domain-aware context capture (scroll, clicks, visible text, form state, dwell time)
- **Resonator** — keyboard/mouse/click interaction forwarding
- **Settings** — 7 provider API key management, model selection, theme toggle

### Supported Providers (14 models)
| Provider | Models |
|----------|--------|
| ResonantOS Alpha | Llama 3.3 70B (default, free via Groq) |
| OpenAI | GPT-5.5, GPT-5.4 Mini, GPT-4o |
| Anthropic | Claude Sonnet 4, Claude Opus 4 |
| MiniMax | M2.7, M2.7 High Speed |
| Groq | Llama 3.3 70B, Llama 4 Scout |
| DeepSeek | Chat, Reasoner |
| xAI | Grok-3, Grok-4 |
| RunPod | Serverless (zero config) |

### Agent Control — Browser Tools
```
/control <goal>          — autonomous browser task
/browser read            — read current page
/browser forms           — inspect forms
/browser click "text"    — click visible element
/browser type "text"     — type into field
/browser scroll up/down  — scroll page
/history                 — search browser history
/jobs                    — list durable browser jobs
/pause, /resume, /cancel — job control
```

### Safety Boundaries (Non-Negotiable)
- Wallet connect/sign/transfer — **human-only, never automated**
- Payment, checkout, buy/sell, bridge, mint, claim — **blocked from automation**
- Login, password, credential actions — **blocked from automation**
- Public form submit — **requires explicit approval**
- Site permission modes: blocked, read-only, ask-before-action, trusted-for-safe-actions

## Quick Start

### macOS / Linux
```bash
git clone https://github.com/tompennington/resonantos-vnext-Experimental.git
cd resonantos-vnext-Experimental
git checkout tom/browser-first-merged
cd browser-first
bash install.sh
```

### Windows
```powershell
git clone https://github.com/tompennington/resonantos-vnext-Experimental.git
cd resonantos-vnext-Experimental
git checkout tom/browser-first-merged
cd browser-first
powershell -ExecutionPolicy Bypass -File install.ps1
```

### Manual Setup (Any Platform)

**Step 1 — Start the bridge server:**
```bash
node browser-first/host/run-browser-first.mjs --bridge-only=true
```
Zero npm dependencies — just Node 22+. The bridge writes `bridge-config.generated.js` with the auth token.

**Step 2 — Load the extension:**
- Open Chrome/Brave/Edge → `chrome://extensions`
- Enable "Developer mode" (top right toggle)
- Click "Load unpacked" → select `browser-first/resonantos-side-panel-extension`

**Step 3 — Use it:**
- **New tab** (Cmd+T) → main workspace appears
- **Click ResonantOS icon** in toolbar → side panel opens next to your page
- **Click ⚙️** in side panel → enter your API key
- Start chatting

### Bridge-Only Mode (Headless / Linux Server)
```bash
node browser-first/host/run-browser-first.mjs --bridge-only=true
```
Runs just the bridge server — connect from any Chromium browser with the extension loaded manually.

### Requirements
| Requirement | Version |
|-------------|---------|
| Node.js | 22+ |
| Chrome, Brave, or Edge | Any recent |
| Git | Any |
| API key | At least one (Groq is free) |

**Free API key:** [Groq Console](https://console.groq.com) — sign up in 30 seconds, generous free tier.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Chrome / Brave / Edge)                            │
│  ┌──────────────────┐  ┌──────────────────────────────────┐ │
│  │  Side Panel       │  │  Active Webpage Tab              │ │
│  │  - Augmentor Chat │  │  - content.js (page observer)    │ │
│  │  - Chat History   │  │  - 20 injection detection rules  │ │
│  │  - Agent Control  │  │  - Resonant Context SDK          │ │
│  │  - Settings       │  │  - Wallet Adapter                │ │
│  │  - Sidecar Nav    │  │  - Inline Assistant              │ │
│  └────────┬─────────┘  │  - Resonator                     │ │
│           │             └───────────────┬──────────────────┘ │
│  ┌────────┴─────────────────────────────┘                   │
│  │  background.js (service worker)                          │
│  │  - Message relay with sender validation                  │
│  │  - Side panel API management                             │
│  └──────────────────────┬───────────────────────────────────┘
│                         │                                    │
│  ┌──────────────────────┴────────────────────────────────┐  │
│  │  Main Workspace (new tab override)                     │  │
│  │  - Full-screen Augmentor with left rail                │  │
│  │  - Answer / Living Archive / Hermes / OpenCode tabs    │  │
│  │  - Chat history + multi-session                        │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────┘
                          │ localhost + auth token
                  ┌───────┴───────┐
                  │ Bridge Server │
                  │ (Node.js)     │
                  │ - 7 providers │
                  │ - Memory ops  │
                  │ - Audit trail │
                  │ - System      │
                  │   prompts     │
                  └───────────────┘
```

### Extension Structure
```
browser-first/
├── resonantos-side-panel-extension/
│   ├── manifest.json              — MV3 permissions + CSP
│   └── src/
│       ├── side-panel.html/js/css — side panel UI (chat rail, settings, sidecar nav)
│       ├── main-workspace.html/js/css — full-screen workspace (new tab)
│       ├── background.js          — service worker + sender-validated relays
│       ├── content.js             — page observer + 20 injection patterns + rate limiting
│       ├── wallet-adapter.js      — Solana/Phantom integration
│       ├── resonant-context.js    — context capture SDK
│       ├── context-plugins.js     — domain-specific context plugins
│       ├── resonator.js           — interaction forwarding
│       ├── protocol-store.html/js — Protocol Store (full-tab sidecar)
│       ├── blackboard.html/js/css — Blackboard canvas (full-tab sidecar)
│       ├── shield-tab.html/js     — Shield audit trail (full-tab, live-updating)
│       ├── archive-tab.html/js    — Living Archive (full-tab sidecar)
│       ├── awareness-tab.html/js  — R-Awareness (full-tab sidecar)
│       └── lib/                   — 22 modular libraries
│           ├── agent-control-*.js — planner, runner, executor, observer, reporting
│           ├── approval-policy.js — wallet/payment/login enforcement
│           ├── browser-*.js       — command parser, page actions, job store
│           ├── chat-*.js          — session store, turn controller
│           ├── composer-controller.js
│           ├── monitor-renderers.js
│           ├── side-panel-*.js    — command router, renderers
│           ├── site-permission-store.js
│           └── tab-context-controller.js
├── host/
│   ├── run-browser-first.mjs      — bridge server + 7-provider routing
│   ├── bridge-server.mjs          — crypto token auth
│   ├── provider-router.mjs        — multi-provider dispatch
│   ├── system-prompts.mjs         — agent system prompts
│   ├── audit-trail.mjs            — security audit logging
│   ├── living-archive.mjs         — memory bridge
│   └── update-check.mjs           — version check
├── test/                          — 144 deterministic tests
├── native-messaging/              — Chrome native messaging host
├── webstore/                      — Chrome Web Store submission prep
├── dist/                          — Built extension + release ZIP
├── install.sh                     — macOS/Linux installer
├── install.ps1 / install.bat      — Windows installer
└── uninstall.ps1                  — Windows uninstaller
```

## Security

### Penetration Test Results (2026-05-28)
9 vulnerabilities found → 9 fixed. 6 additional hardening fixes applied. Grade: **A-**

| Category | Details |
|----------|---------|
| **XSS Prevention** | `escapeHtml()` on all dynamic content (blackboard, side panel, DAO panels, shield tab) |
| **CSP Hardened** | `unsafe-eval` removed from blackboard; CSP added to main-workspace |
| **URL Sanitization** | `javascript:`, `data:`, `vbscript:` protocols blocked |
| **Sensitive Fields** | Passwords, credit cards, SSNs return `[redacted]` to AI |
| **Sender Validation** | All `chrome.runtime.onMessage` handlers verify `sender.id` |
| **Manifest Lockdown** | `web_accessible_resources` restricted from `<all_urls>` to `[]` |
| **Injection Detection** | 20 regex patterns (prompt injection, role hijacking, delimiter injection, DAN mode) |
| **Unicode Hardening** | NFKC normalization + zero-width character stripping before pattern matching |
| **Iframe Sandboxing** | Hermes iframe sandboxed (allow-scripts, allow-same-origin, allow-forms) |
| **Prompt Sanitization** | `pendingSidebarPrompt` NFKC-normalized before submission |
| **Rate Limiting** | Page reads throttled to 1 per 2 seconds; violations logged |
| **Security Logging** | Rolling 20-event buffer in extension storage; Shield tab shows real-time audit trail |
| **Bridge Auth** | Startup-generated token required for all requests; all sidecar tabs authenticated |
| **Key Masking** | API keys masked to 4 chars in logs |

### Security Architecture
- **Bridge auth:** startup-generated token, no unauthenticated requests accepted
- **No raw credentials in extension:** API keys stay in the bridge, never sent to browser
- **Wallet boundaries:** hard-coded blocks on all signing/transfer automation — no approval bypass exists
- **Site permissions:** per-site control over what the AI can see and do
- **Shield audit trail:** live-updating, HTML-escaped, newest-first event log

## CI Pipeline

GitHub Actions runs on every push and PR:
1. **Manifest validation** — confirms valid JSON
2. **Syntax check** — `node --check` on all 36 source JS files
3. **Full test suite** — 144 tests must pass

No broken code merges without passing all gates.

## Tests

```bash
# Run all 144 browser-first tests
npm run test:browser-first

# Run live browser control test
npm run test:browser-first-live

# Syntax check all source files
find browser-first/resonantos-side-panel-extension/src -name "*.js" -exec node --check {} \;
```

### Test Coverage
| Area | Tests |
|------|-------|
| Agent Control (planner, runner, executor, observer, reporting) | 35 |
| Chat (sessions, turns, composer, messages) | 22 |
| Browser (commands, page actions, jobs, permissions) | 28 |
| Security (approval policy, contract validation) | 15 |
| Side Panel (routing, rendering, monitors) | 12 |
| Wallet Adapter | 7 |
| Protocol Store | 7 |
| Shield Tab | 9 |
| Archive Tab | 7 |
| Awareness Tab | 7 |
| **Total** | **144** |

## Desktop Shell (Reference Platform)

The Tauri + React desktop shell remains in this repository as the reference platform. It is not the active product path.

```bash
npm install
npm run tauri:dev    # desktop app
npm run dev          # browser-only preview
```

See [docs/architecture/](docs/architecture/) for the 37 Architecture Decision Records (ADRs).

## Git Workflow

- **`tom/browser-first-merged`** — active merged development branch
- **`browser-first-preview`** — upstream branch (agent control layer)
- **`dev`** — desktop shell development
- **`main`** — stable preview/release branch

### Branch Strategy for Parallel Development
- Feature branches: `tom/*` (product features, security) / `manolo/*` (UI, chat, agent control)
- PRs to `dev` — CI must pass before merge
- Shared files requiring coordination: `content.js`, `side-panel.js`, `manifest.json`, `run-browser-first.mjs`

## License

Public source preview. Not a finished consumer release.
