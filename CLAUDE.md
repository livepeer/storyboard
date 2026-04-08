# Storyboard A3 — Project Instructions

## What This Is

A Next.js 16 app that transforms the single-file `storyboard.html` prototype (from `simple-infra`) into a production agent-powered creative tool. Artists chat with Claude to generate, edit, animate, and live-stream media using Livepeer's AI model network.

## Current State: Phase 7 — ALL PHASES COMPLETE

Phases 0-7 complete. Build passes. All tests pass (110 unit + 6 E2E). 15 tools, 11 skills, 3 agent plugins, MCP support.

### Key Files

#### App
- `app/page.tsx` — Main page: canvas + topbar + chat + camera + context menu + training
- `app/layout.tsx` — Root layout with Geist fonts
- `app/globals.css` — Dark theme CSS variables from storyboard.html
- `app/api/health/route.ts` — Health check endpoint
- `app/api/agent/chat/route.ts` — Server-side Anthropic API proxy (Phase 2)

#### Canvas (`components/canvas/`)
- `InfiniteCanvas.tsx` — Pan/zoom with matrix transforms, dot grid background
- `Card.tsx` — Draggable, resizable, typed media cards (image/video/audio/stream)
- `ArrowEdge.tsx` — SVG cubic bezier dependency arrows with hit areas
- `TopBar.tsx` — Zoom controls, fit-all, settings, training button
- `ContextMenu.tsx` — Right-click: animate, restyle, upscale, transform, custom
- `CameraWidget.tsx` — Webcam capture, LV2V streaming trigger

#### Chat (`components/chat/`)
- `ChatPanel.tsx` — Floating/draggable message panel, wired to agent
- `MessageBubble.tsx` — User/agent/system message rendering

#### Settings & Training
- `components/settings/SettingsPanel.tsx` — SDK URL, API key, orchestrator URL
- `components/training/TrainingModal.tsx` — LoRA training: ZIP URL, upload, progress

#### State (`lib/`)
- `lib/canvas/store.ts` — Zustand: cards, edges, viewport, CRUD
- `lib/canvas/types.ts` — Card, ArrowEdge, CanvasViewport types
- `lib/chat/store.ts` — Zustand: messages, processing state
- `lib/sdk/client.ts` — `sdkFetch` wrapper with auth, timeout, health/inference
- `lib/sdk/types.ts` — SDK request/response types
- `lib/agents/types.ts` — AgentPlugin (async generator), AgentEvent, CanvasContext, ConfigField
- `lib/agents/registry.ts` — Plugin registration, activation, getPluginList
- `lib/agents/built-in/index.ts` — Built-in agent: enrich → DAG executor (yields AgentEvents)
- `lib/tools/types.ts` — ToolDefinition, ToolResult, JSONSchema interfaces
- `lib/tools/registry.ts` — Tool registry: register, get, list, execute, clear
- `lib/tools/sdk-tools.ts` — SDK tools: inference, stream_start/control/stop, capabilities, train_lora
- `lib/tools/canvas-tools.ts` — Canvas tools: canvas_create, canvas_update, canvas_get
- `lib/tools/index.ts` — Tool initialization (registers all built-in tools)
- `lib/stream/session.ts` — LV2V lifecycle: start/publish/poll/control/stop
- `lib/stream/webcam.ts` — getUserMedia, frame capture

#### Tests
- `tests/unit/canvas-store.test.ts` — Zustand store unit tests
- `tests/unit/chat-store.test.ts` — Chat store unit tests
- `tests/unit/sdk-client.test.ts` — SDK client unit tests
- `tests/unit/tool-registry.test.ts` — Tool registry unit tests
- `tests/unit/agent-plugin.test.ts` — Agent plugin interface unit tests
- `tests/e2e/storyboard.spec.ts` — Playwright E2E smoke tests

### All phases complete
- Remaining: Set ANTHROPIC_API_KEY + OPENAI_API_KEY in Vercel env vars, custom domain storyboard.livepeer.org

## Key Architecture Decisions

### Agent Plugin System
- **BuiltInPlugin** — migrated current code (done)
- **ClaudePlugin** — Messages API + tool_use in browser chat panel (Phase 2)
- **OpenAIPlugin** — Chat Completions + functions (Phase 6)
- All share the same Tool Registry (5 smart tools)

### Token Optimization (Critical — Read implementation.md "Token Efficiency Architecture")
- Claude calls `create_media` (ONE smart SDK tool) instead of reasoning about 20 models
- SDK handles model selection, chain constraints, size rules server-side
- System prompt: 500 tokens (base.md only), skills loaded on-demand via `load_skill` tool
- Conversation compaction: old tool results shrunk to summaries
- Prompt caching: system + tool schemas cached (90% discount on repeats)

### Infrastructure Isolation (IRON RULE)
**DO NOT TOUCH existing simple-infra VMs.** New infra runs in parallel:

| Existing (DO NOT TOUCH) | New (storyboard-a3) |
|--------------------------|---------------------|
| sdk-staging-1 → sdk.daydream.monster | sdk-a3-staging-1 → sdk-a3.daydream.monster |
| byoc-staging-1 → byoc-staging-1.daydream.monster | byoc-a3-staging-1 → byoc-a3-staging-1.daydream.monster |
| orch-staging-1/2 (Scope LV2V) — shared read-only | Uses same orchs for LV2V |
| signer-staging-1/2 — shared | Uses same signers |

### Branching
| Repo | Branch | Purpose |
|------|--------|---------|
| `livepeer/livepeer-python-gateway` | `feat/storyboard-a3` (off `main`) | SDK smart tools |
| `livepeer/simple-infra` | `feat/storyboard-a3-infra` (off `main`) | New VM configs |
| `livepeer/storyboard` | `main` | This repo (Vercel app) |

## Infrastructure — Deployed
| VM | Type | IP | Domain |
|----|------|-----|--------|
| `sdk-a3-staging-1` | e2-small | 34.83.203.245 | sdk-a3-staging-1.daydream.monster |
| `byoc-a3-staging-1` | e2-medium | 136.109.56.80 | byoc-a3-staging-1.daydream.monster |

Config: `/Users/qiang.han/Documents/mycodespace/simple-infra/environments/staging/byoc-a3.yaml`

## Source Material
- **Storyboard migrated from:** `/Users/qiang.han/Documents/mycodespace/simple-infra/storyboard.html`
- **SDK service code:** `/Users/qiang.han/Documents/mycodespace/simple-infra/sdk-service-build/app.py`
- **Gateway SDK:** `/Users/qiang.han/Documents/mycodespace/livepeer-python-gateway/`
- **Scope reference:** `/Users/qiang.han/Documents/mycodespace/Scope/scope/src/scope/`

## Vercel
- **Org:** Livepeer Foundation
- **Account:** `qiang@livepeer.org`
- **Project:** `storyboard`
- **Domain:** `storyboard.livepeer.org`
- **Secrets:** via `vercel env add` (ANTHROPIC_API_KEY, NEXT_PUBLIC_SDK_URL)
- **Production URL:** https://storyboard-rust.vercel.app
- **Deploy:** `./scripts/dev.sh deploy` or `vercel deploy --prod --scope livepeer-foundation`
- **Pending:** `ANTHROPIC_API_KEY` (Phase 2), custom domain `storyboard.livepeer.org`

## GitHub
- **Repo:** `livepeer/storyboard` — https://github.com/livepeer/storyboard
- **Push access:** Use `seanhanca` account. `qianghan` does NOT have push access.
- **Before pushing:** `gh auth switch --user seanhanca`
- **After pushing:** `gh auth switch --user qianghan`

## Key Commands
```bash
npm run dev          # local dev at localhost:3000
npm run build        # production build
npm run test         # vitest unit tests
npm run test:e2e     # playwright E2E tests
vercel deploy        # deploy to Vercel
```

## Context Preservation
After completing any task, update:
1. This file (CLAUDE.md) with current state
2. `docs/plan/status.md` with completion checkboxes
3. Git commit with descriptive message
