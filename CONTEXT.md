# Storyboard A3 — Phase 0 Complete Context

> Use this file to resume work in a new Claude session. Paste it or reference it to get full context.

## How to Start a New Session

```bash
cd /Users/qiang.han/Documents/mycodespace/storyboard-a3
claude
```

Then say:

> Read CONTEXT.md and CLAUDE.md for full project context. Then read docs/plan/implementation.md for Phase 1 specs and start executing.

---

## What Was Built

Storyboard A3 is a Next.js 16 app that migrates the 4,007-line `storyboard.html` prototype into a production React application. It's an agent-powered creative tool where artists chat with an AI assistant to generate, edit, animate, and live-stream media using Livepeer's AI model network.

**Phase 0 is complete.** All storyboard.html features are migrated, tests pass, infrastructure is deployed, and the app is live on Vercel.

## Live URLs

| Service | URL |
|---------|-----|
| **Vercel app** | https://storyboard-rust.vercel.app |
| **SDK service** | https://sdk-a3-staging-1.daydream.monster |
| **BYOC orchestrator** | https://byoc-a3-staging-1.daydream.monster:8935 |
| **GitHub repo** | https://github.com/livepeer/storyboard |

## Codebase Overview (~2,800 lines across 26 source files)

### App layer
| File | Purpose |
|------|---------|
| `app/page.tsx` | Main page — composes canvas, topbar, chat, camera, context menu, training modal |
| `app/layout.tsx` | Root layout — Geist fonts, metadata |
| `app/globals.css` | Dark theme CSS variables (migrated from storyboard.html) |
| `app/api/health/route.ts` | `GET /api/health` → `{"status":"ok"}` |
| `app/api/agent/chat/route.ts` | `POST /api/agent/chat` — server-side proxy to Anthropic Messages API (for Phase 2) |

### Canvas components (`components/canvas/`)
| Component | What it does |
|-----------|-------------|
| `InfiniteCanvas.tsx` | Pan (pointer drag on background), zoom (wheel + buttons), dot grid, renders cards + arrows |
| `Card.tsx` | Draggable header, resize handle, typed badge (image/video/audio/stream/camera), media rendering (img/video/audio), minimize/close, right-click dispatches context menu |
| `ArrowEdge.tsx` | SVG layer — cubic bezier paths between cards, hit areas for click, selection highlight |
| `TopBar.tsx` | Logo, zoom in/out/fit controls, Train button, Settings gear |
| `ContextMenu.tsx` | Right-click card actions: animate, restyle, upscale, transform-video, LV2V, custom prompt |
| `CameraWidget.tsx` | Webcam capture via getUserMedia, LV2V stream trigger, minimize/start/stop |

### Chat components (`components/chat/`)
| Component | What it does |
|-----------|-------------|
| `ChatPanel.tsx` | Floating/draggable panel, message list with auto-scroll, textarea input, sends to active agent plugin |
| `MessageBubble.tsx` | Renders user (right-aligned), agent (left), system (centered mono) messages |

### Other components
| Component | What it does |
|-----------|-------------|
| `components/settings/SettingsPanel.tsx` | Modal: SDK URL, API key, orchestrator URL — saves to localStorage, tests `/health` |
| `components/training/TrainingModal.tsx` | LoRA training: ZIP URL or file upload, trigger word, steps, model, progress bar, polls `/train/{jobId}` |

### State management (`lib/`)

**Canvas store** (`lib/canvas/store.ts` + `types.ts`):
- Zustand store: `viewport` (panX, panY, scale), `cards[]`, `edges[]`, `selectedCardId`, `selectedEdgeIdx`
- Actions: addCard, updateCard, removeCard (also removes edges), selectCard
- Actions: addEdge (upsert), removeEdgesFor, selectEdge
- Actions: setViewport, zoomTo (clamp 0.1–5, world-coord preserving), fitAll
- Card positioning: grid layout (5 cols, 320x280 + 24px gap)

**Chat store** (`lib/chat/store.ts`):
- Messages array with `{id, role, text, timestamp}`
- `isProcessing` flag, `addMessage`, `clearMessages`

**SDK client** (`lib/sdk/client.ts` + `types.ts`):
- `sdkFetch<T>(path, body?, timeout=300s)` — GET or POST, Bearer auth from localStorage, AbortController timeout
- `loadConfig()` / `saveConfig()` — localStorage: `sdk_service_url`, `sdk_api_key`, `orch_url`
- `checkHealth()`, `listCapabilities()`, `runInference(req)`

**Agent system** (`lib/agents/`):
- `types.ts` — `AgentPlugin` interface: `{id, name, handleMessage(text)}`
- `registry.ts` — `registerPlugin()`, `setActivePlugin()`, `getActivePlugin()`
- `built-in/index.ts` — The main agent logic:
  1. Command detection (`ls capabilities`, etc.)
  2. `enrichTask(text)` → calls SDK `/enrich/v2` then `/enrich` (fallback: single flux step)
  3. `executeDag(steps)` — concurrent independent steps via `Promise.allSettled()`, then wave-based dependent execution
  4. Each step: creates card (spinner) → `runInference()` → updates card (url or error) → adds arrow edge
  5. URL extraction handles nested SDK response shapes (`result.image_url`, `data.images[0].url`, etc.)

**Stream system** (`lib/stream/`):
- `session.ts` — Full LV2V lifecycle: `startStream(prompt)`, `waitForReady(session)`, `startPublishing(session, getFrame, 100ms)`, `startPolling(session, 200ms)`, `controlStream(session, prompt)`, `stopStream(session)`
- `webcam.ts` — `startWebcam(videoEl)`, `stopWebcam()`, `captureFrame(videoEl)` → JPEG Blob

### Tests
- **21 unit tests** (vitest): canvas store (13), chat store (5), SDK client (3)
- **6 E2E tests** (playwright): page load, chat, settings modal, camera widget, health API
- Config: `vitest.config.ts` (jsdom, excludes e2e), `playwright.config.ts` (port 3100, chromium)

## Infrastructure

### GCP VMs (project: `livepeer-simple-infra`, zone: `us-west1-b`)

| VM | Type | IP | Services |
|----|------|-----|----------|
| `sdk-a3-staging-1` | e2-small | 34.83.203.245 | SDK service + Caddy (TLS) |
| `byoc-a3-staging-1` | e2-medium | 136.109.56.80 | BYOC orch + Caddy + serverless-proxy + inference-adapter |

**12 capabilities:** nano-banana, recraft-v4, flux-schnell, flux-dev, ltx-t2v, ltx-i2v, kontext-edit, bg-remove, topaz-upscale, chatterbox-tts, gemini-image, gemini-text

### Vercel
- **Org:** Livepeer Foundation (`livepeer-foundation`)
- **Project:** `storyboard`
- **Production:** https://storyboard-rust.vercel.app
- **Region:** iad1
- **Env vars set:** `NEXT_PUBLIC_SDK_URL`, `NEXT_PUBLIC_DEFAULT_AGENT`
- **Pending:** `ANTHROPIC_API_KEY` (Phase 2), custom domain `storyboard.livepeer.org`

## Key Rules

1. **GitHub push:** Always use `seanhanca` (`gh auth switch --user seanhanca` before push, switch back after). `qianghan` does NOT have push access.
2. **Infrastructure isolation:** DO NOT touch existing simple-infra VMs (sdk-staging-1, byoc-staging-1). A3 has its own parallel infra.
3. **Context save protocol:** After each task, update CLAUDE.md + docs/plan/status.md + commit
4. **Source reference:** Original storyboard.html at `/Users/qiang.han/Documents/mycodespace/simple-infra/storyboard.html`
5. **Vercel deploy:** Use `./scripts/dev.sh deploy` or `vercel deploy --prod --scope livepeer-foundation`

## Quick Start

```bash
./scripts/dev.sh          # Install deps + start dev server
./scripts/dev.sh test     # Unit tests
./scripts/dev.sh e2e      # E2E tests
./scripts/dev.sh build    # Production build
./scripts/dev.sh deploy   # Build + deploy to Vercel
./scripts/dev.sh push     # Git push via seanhanca
```

## Git History (Phase 0)

```
0ac9c88 Add GitHub push instructions to CLAUDE.md
e59d515 Phase 0.8: A3 infra VMs provisioned on GCP
4d739f1 Phase 0 complete — migration done, all tests pass
5863559 Phase 0.9: acceptance tests pass — 21 unit + 6 E2E
c9903e6 Phase 0.7: CLAUDE.md updated with full project state
5a4b076 Phase 0.6: Vercel deployment prep — agent chat API route
a91df5d Phase 0.5d: camera + LV2V + training migrated
beb68ce Phase 0.5c: built-in agent works end-to-end
cf9fa64 Phase 0.5b: chat panel + SDK client
71509ed Phase 0.5a: canvas core — pan/zoom/drag/resize/arrows
56cc306 Phase 0.4: scaffold Next.js app with CI/CD
```

## What's Next: Phase 1 — Agent Plugin Interface

Per `docs/plan/implementation.md`:
1. Formalize the `AgentPlugin` contract with event system
2. Build shared Tool Registry (5 smart tools: `create_media`, `edit_media`, `canvas_*`, `load_skill`, `stream_control`)
3. Plugin hot-swap UI (switch between BuiltIn/Claude/OpenAI at runtime)
4. This sets the foundation for Phase 2 (Claude Plugin with Messages API + tool_use)
