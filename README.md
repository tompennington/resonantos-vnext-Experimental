# ResonantOS vNext

ResonantOS is an AI operating system that lives inside your browser. It combines an AI chat assistant, autonomous browser control, a wallet-aware DAO layer, and a security-first architecture into a single Chromium extension.

This repository contains both the **browser-first** product (active development) and the **desktop Tauri shell** (reference platform).

## What's In The Box

### Browser Extension (Side Panel)
- **Augmentor Chat** — AI assistant that reads your current page, answers questions, takes actions
- **Agent Control Mode** — autonomous observe → decide → act → verify loop with safety gates
- **Protocol Store** — browse and install AI protocols (full-tab)
- **Blackboard** — visual canvas for diagrams, tables, documents (full-tab)
- **Living Archive** — save, search, and retrieve anything you've browsed (full-tab)
- **R-Awareness** — real-time context richness meter showing what the AI sees (full-tab)
- **Shield** — security audit trail of what the AI blocked or approved (full-tab)
- **Wallet Adapter** — Solana/Phantom wallet integration (human-only signing)
- **Resonant Context SDK** — domain-aware context capture (scroll, clicks, visible text, form state, dwell time)
- **Resonator** — keyboard/mouse/click interaction forwarding
- **Settings** — provider API key management, model selection, theme toggle

### Supported Providers (14 models)
| Provider | Models |
|----------|--------|
| ResonantOS Alpha | Llama 3.3 70B (default) |
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

### Bridge-Only Mode (Headless / Linux Server)
```bash
bash install.sh --bridge-only
```
Runs just the bridge server without launching a browser — connect from any Chromium browser with the extension loaded manually.

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
┌─────────────────────────────────────────────────────┐
│  Browser (Chrome / Brave / Edge)                    │
│  ┌───────────────┐  ┌────────────────────────────┐  │
│  │  Side Panel    │  │  Active Webpage Tab        │  │
│  │  - Augmentor   │  │  - content.js (observer)   │  │
│  │  - Chat        │  │  - Resonant Context SDK    │  │
│  │  - Agent Ctrl  │  │  - Wallet Adapter          │  │
│  │  - Settings    │  │  - Inline Assistant        │  │
│  │  - Sidecar Nav │  │  - Resonator               │  │
│  └───────┬───────┘  └────────────┬───────────────┘  │
│          │    background.js      │                   │
│          └──────────┬────────────┘                   │
└─────────────────────┼───────────────────────────────┘
                      │ localhost + auth token
              ┌───────┴───────┐
              │ Bridge Server │
              │ (Node.js)     │
              │ - Provider    │
              │   routing     │
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
│       ├── side-panel.html/js/css — main UI (909 lines JS, 3394 lines CSS)
│       ├── background.js          — service worker + message relay
│       ├── content.js             — page observer + injection detection + agent control
│       ├── wallet-adapter.js      — Solana/Phantom integration
│       ├── resonant-context.js    — context capture SDK
│       ├── context-plugins.js     — domain-specific context plugins
│       ├── resonator.js           — interaction forwarding
│       ├── protocol-store.html/js — full-tab Protocol Store
│       ├── blackboard.html/js/css — full-tab Blackboard canvas
│       ├── shield-tab.html/js     — full-tab Shield audit trail
│       ├── archive-tab.html/js    — full-tab Living Archive
│       ├── awareness-tab.html/js  — full-tab R-Awareness
│       └── lib/                   — 22 modular libraries
│           ├── agent-control-planner.js
│           ├── agent-control-runner.js
│           ├── approval-policy.js
│           ├── browser-job-store.js
│           ├── browser-page-actions.js
│           ├── chat-session-store.js
│           ├── chat-turn-controller.js
│           ├── composer-controller.js
│           ├── control-page-observer.js
│           ├── control-planning-service.js
│           ├── control-reporting-service.js
│           ├── control-run-state.js
│           ├── control-step-executor.js
│           ├── message-action-controller.js
│           ├── monitor-renderers.js
│           ├── side-panel-command-router.js
│           ├── side-panel-renderers.js
│           ├── site-permission-store.js
│           └── tab-context-controller.js
├── host/
│   ├── run-browser-first.mjs      — bridge server + provider routing
│   ├── bridge-server.mjs          — crypto token auth
│   ├── provider-router.mjs        — multi-provider dispatch
│   ├── system-prompts.mjs         — agent system prompts
│   ├── audit-trail.mjs            — security audit logging
│   ├── living-archive.mjs         — memory bridge
│   └── update-check.mjs           — version check
├── test/                          — 105 deterministic tests
├── native-messaging/              — Chrome native messaging host
├── webstore/                      — Chrome Web Store submission prep
├── install.sh                     — macOS/Linux installer
├── install.ps1 / install.bat      — Windows installer
└── uninstall.ps1                  — Windows uninstaller
```

## Security

### Penetration Test Results (2026-05-26)
9 vulnerabilities found → 9 fixed. Grade: **B+**

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 5 | ✅ All fixed |
| High | 4 | ✅ All fixed |

**Key fixes:**
- XSS prevention: `escapeHtml()` on all dynamic content (blackboard, side panel, DAO panels)
- CSP hardened: removed `unsafe-eval` from blackboard
- URL sanitization: `javascript:`, `data:`, `vbscript:` protocols blocked
- Sensitive field redaction: passwords, credit cards, SSNs return `[redacted]` to AI
- Sender validation: background.js message relays verify `sender.id`
- Manifest lockdown: `web_accessible_resources` restricted from `<all_urls>` to `[]`
- Prompt injection detection: 10 regex patterns in content.js
- Security event logging: rolling 20-event buffer in extension storage

Full report: [SECURITY-REPORT-BROWSER-FIRST.md](docs/SECURITY-REPORT-BROWSER-FIRST.md)

### Security Architecture
- **Bridge auth:** startup-generated token, no unauthenticated requests accepted
- **No raw credentials in extension:** API keys stay in the bridge, never sent to browser
- **Wallet boundaries:** hard-coded blocks on all signing/transfer automation — no approval bypass exists
- **Site permissions:** per-site control over what the AI can see and do
- **Rate limiting:** page reads throttled to 1 per 2 seconds

## Tests

```bash
# Run all 105 browser-first tests
npm run test:browser-first

# Run live browser control test (launches real browser)
npm run test:browser-first-live

# Run native host tests
npm run test:browser-native

# Syntax check all source files
node --check browser-first/host/*.mjs
node --check browser-first/resonantos-side-panel-extension/src/*.js
```

## Desktop Shell (Reference Platform)

The Tauri + React desktop shell remains in this repository as the reference platform and feature reservoir. It is not the active product path.

```bash
npm install
npm run tauri:dev    # desktop app
npm run dev          # browser-only preview
```

See [docs/architecture/](docs/architecture/) for the 37 Architecture Decision Records (ADRs) documenting the full system design.

## Git Workflow

- **`tom/browser-first-merged`** — active merged development branch
- **`browser-first-preview`** — upstream branch (Manolo's agent layer)
- **`dev`** — desktop shell development
- **`main`** — stable preview/release branch

## License

Public source preview. Not a finished consumer release.
