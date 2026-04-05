# Storyboard A3 — Project Instructions

## What This Is

A Next.js 15 app that transforms the single-file `storyboard.html` prototype (from `simple-infra`) into a production agent-powered creative tool. Artists chat with Claude to generate, edit, animate, and live-stream media using Livepeer's AI model network.

## Current State: Phase 0 — Scaffold Complete, Migration Next

Next.js 16 app scaffolded with TypeScript, Tailwind CSS v4, Zustand. Build passes.

### What exists
- `docs/plan/implementation.md` — Full 2000-line implementation plan (8 phases, 9 weeks)
- `docs/plan/status.md` — Phase tracking (Phase 0.4 complete)
- `docs/plan/review.md` — Critical review (score: 96/100)
- `docs/design/architecture.md` — Architecture comparison (Option A chosen: Claude API in browser chat)
- Next.js app scaffold: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- API health route: `app/api/health/route.ts`
- Vitest config: `vitest.config.ts`
- Vercel config: `vercel.json` (region: iad1)

### What needs to happen next (Phase 0)
1. **Milestone 0.5a** — Canvas core migration (InfiniteCanvas, Card, ArrowEdge)
2. **Milestone 0.5b** — Chat panel + SDK client
3. **Milestone 0.5c** — Agent + context menus
4. **Milestone 0.5d** — Camera + LV2V + Training
5. **Deploy to Vercel** — Livepeer Foundation org (`qiang@livepeer.org`)
6. **Spin up new infra VMs** — `sdk-a3-staging-1` + `byoc-a3-staging-1`

## Key Architecture Decisions

### Agent Plugin System
- **BuiltInPlugin** — migrated current code (Phase 1)
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

## Source Material
- **Storyboard to migrate:** `/Users/qiang.han/Documents/mycodespace/simple-infra/storyboard.html`
- **SDK service code:** `/Users/qiang.han/Documents/mycodespace/simple-infra/sdk-service-build/app.py`
- **Gateway SDK:** `/Users/qiang.han/Documents/mycodespace/livepeer-python-gateway/`
- **Scope reference:** `/Users/qiang.han/Documents/mycodespace/Scope/scope/src/scope/`
- **BYOC config:** `/Users/qiang.han/Documents/mycodespace/simple-infra/environments/staging/byoc.yaml`
- **Deploy scripts:** `/Users/qiang.han/Documents/mycodespace/simple-infra/scripts/`

## Vercel
- **Org:** Livepeer Foundation
- **Account:** `qiang@livepeer.org`
- **Project:** `storyboard`
- **Domain:** `storyboard.livepeer.org`
- **Secrets:** via `vercel env add` (ANTHROPIC_API_KEY, NEXT_PUBLIC_SDK_URL)

## Key Commands
```bash
npm run dev        # local dev at localhost:3000
npm run test       # vitest unit tests
npx playwright test # E2E tests
vercel deploy      # deploy to Vercel
```

## Context Preservation
After completing any task, update:
1. This file (CLAUDE.md) with current state
2. `docs/plan/status.md` with completion checkboxes
3. Git commit with descriptive message
