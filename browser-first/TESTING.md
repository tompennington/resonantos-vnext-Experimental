# ResonantOS Browser Extension — Tester Install Guide

> **Time to first run: ~5 minutes**
> **Skill level: Basic — if you can install a Chrome extension, you can do this**

---

## What You're Testing

ResonantOS is an AI-powered browser extension that lives in your Chrome/Brave/Edge sidebar. It gives you:

- **Augmentor** — an AI chat assistant that can *see* what's on your screen
- **Wallet integration** — connects to Phantom (Solana wallet) natively
- **Protocol Store** — browse and install AI protocols
- **Living Archive** — save and search anything you've browsed
- **Blackboard** — visual display canvas (opens as full tab)
- **DAO panels** — Tribes, Bounties, Governance, Shield
- **Voice dictation** — speak your questions

The extension talks to a local bridge server on your machine. Your API keys never leave your computer.

---

## Prerequisites

| Requirement | Version | Check |
|-------------|---------|-------|
| **Node.js** | **22+ required** (22 LTS recommended) | `node -v` |
| **Chrome, Brave, or Edge** | Any recent version | Must support Manifest V3 side panels |
| **Git** | Any | `git --version` |
| **API key** | At least one | OpenAI, Anthropic, Groq, DeepSeek, MiniMax, or xAI |

> **Free option:** [Groq](https://console.groq.com) gives free API keys with generous rate limits.
>
> **Node version note:** The bridge server uses `import.meta.dirname` which requires Node 21.2+. We recommend Node 22 LTS.

---

## Step 1: Clone the Repo

```bash
git clone https://github.com/ResonantOS/resonantos-vnext.git
cd resonantos-vnext
git checkout browser-first-preview
```

---

## Step 2: Start the Bridge Server

The bridge is a lightweight local Node.js server (zero npm dependencies — pure Node).

```bash
node browser-first/host/bridge-daemon.mjs
```

You should see:
```
[bridge] ResonantOS Bridge listening on http://127.0.0.1:47773
```

> **Leave this terminal running.** The bridge handles all AI provider calls, archive storage, and protocol management.

> **Tip:** If port 47773 is taken, set `RESONANTOS_BRIDGE_PORT=<port>` before starting.

---

## Step 3: Load the Extension

1. Open **Chrome** or **Brave**
2. Go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top right)
4. Click **"Load unpacked"**
5. Select the folder: `browser-first/resonantos-side-panel-extension/`
6. The ResonantOS icon (◈) appears in your toolbar

---

## Step 4: Open the Side Panel

- Click the **ResonantOS icon** in the toolbar, OR
- Press **Alt+Shift+A** (keyboard shortcut)

The side panel opens on the right side of your browser.

---

## Step 5: Add Your API Key

1. Click the **⚙ gear icon** in the side panel header
2. Enter at least one API key. The Settings panel has fields for:
   - **OpenAI** → `sk-proj-...` (GPT-4o, GPT-5.5)
   - **MiniMax** → `eyJ...` (MiniMax 2.7)
3. Click **"Save Keys"**
4. The connection status line should show "Connected to [model] · Ready"

> **More providers:** Anthropic, Groq, DeepSeek, and xAI keys can be added via the bridge API. The extension auto-detects them once saved. Additional provider fields are coming in a future UI update.

> **Keys are stored locally** in `~/ResonantOS_User/Secrets/provider-secrets.json` — never sent anywhere except the provider's API.

---

## What to Test

### Basic Chat
- Type a question in the "Message Augmentor" box at the bottom
- Verify you get an AI response
- Try different questions — it should be conversational

### Screen Awareness (Context SDK)
- Navigate to any website (e.g., Wikipedia, a news site)
- Ask Augmentor: **"What am I looking at?"** or **"Summarize this page"**
- It should describe the content on your current tab

### Voice Dictation
- Click the **🎙 microphone** button next to the message input
- Speak your question
- It should transcribe and send automatically

### Panels (Sidebar Sections)
Click each section to expand:
- **◈ Wallet** — Shows wallet connection status. If you have Phantom installed, it should detect it.
- **◈ Tribes** — DAO membership panel
- **◈ Bounties** — Task bounty system
- **◈ Governance** — Proposal voting
- **◈ Shield** — Security audit trail
- **◈ Protocol Store** — Opens as a **full browser tab** with protocol marketplace
- **◈ Archive** — Search your saved pages
- **◈ R-Awareness** — Shows context awareness metrics

### Blackboard
- Ask Augmentor to show something on the Blackboard (e.g., "Show me a table of...")
- Or the extension may open it automatically for visual content
- Opens as a full browser tab

### Theme Toggle
- Click **🌙** in the header to switch between dark and light mode

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Bridge offline" banner at top | Make sure `node bridge-daemon.mjs` is running in your terminal |
| "Store unavailable: Failed to fetch" | Bridge server not running, or wrong port |
| No AI response | Check Settings — did you save a valid API key? |
| Extension doesn't appear | Did you load the right folder? Should be `resonantos-side-panel-extension/`, not `browser-first/` |
| Side panel won't open | Try right-clicking the extension icon → "Open side panel" |
| Port conflict | `RESONANTOS_BRIDGE_PORT=47774 node bridge-daemon.mjs` |

---

## Project Structure (What You're Looking At)

```
browser-first/
├── resonantos-side-panel-extension/   ← THE EXTENSION (load this in Chrome)
│   ├── manifest.json                  ← Chrome MV3 manifest
│   ├── icon16.png / icon48.png / icon128.png
│   └── src/
│       ├── side-panel.html/.js/.css   ← Main sidebar UI
│       ├── background.js              ← Service worker
│       ├── content.js                 ← Page content script
│       ├── protocol-store.html/.js    ← Full-tab Protocol Store
│       ├── blackboard.html/.js/.css   ← Full-tab Blackboard canvas
│       ├── wallet-adapter.js          ← Phantom wallet integration
│       ├── resonant-context.js        ← Context awareness SDK
│       ├── context-plugins.js         ← Domain-specific context plugins
│       └── resonator.js               ← Visual annotation overlay
│
├── host/                              ← BRIDGE SERVER (run this with Node)
│   ├── bridge-daemon.mjs             ← Main server (port 47773)
│   ├── provider-router.mjs           ← Multi-provider AI routing
│   ├── living-archive.mjs            ← Archive storage engine
│   ├── audit-trail.mjs               ← Security event logging
│   ├── system-prompts.mjs            ← AI system prompt management
│   └── update-check.mjs              ← Version checking
│
├── install.sh                         ← macOS/Linux one-line installer
├── install.ps1 / install.bat         ← Windows installer
└── TESTING.md                         ← This file
```

---

## Reporting Issues

When reporting a bug, include:
1. **Browser + version** (e.g., Brave 1.75.x)
2. **OS** (macOS, Windows, Linux)
3. **Bridge server console output** (copy any errors from the terminal)
4. **Browser console errors** (F12 → Console tab while side panel is open)
5. **Steps to reproduce** — what did you click/type?
6. **Screenshot** if visual

---

## Supported AI Providers

| Provider | Models | Key Format | Free Tier? |
|----------|--------|-----------|------------|
| OpenAI | GPT-4o, GPT-4o-mini | `sk-proj-...` | No |
| Anthropic | Claude Sonnet, Opus | `sk-ant-...` | No |
| Groq | Llama 3.3, Mixtral | `gsk_...` | **Yes** ✅ |
| DeepSeek | V3, R1 Reasoner | `sk-...` | Yes (cheap) |
| xAI | Grok-3, Grok-4 | `xai-...` | No |
| MiniMax | MiniMax 2.7 | `eyJ...` | No |

---

*Last updated: May 26, 2026*
