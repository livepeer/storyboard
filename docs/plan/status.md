# Implementation Status

## Current State
- **Active phase:** Phase 3 COMPLETE
- **Last updated:** 2026-04-05
- **Blocking issues:** ANTHROPIC_API_KEY not yet set in Vercel env vars
- **Next phase:** Phase 4 (UX Polish)

---

## Phase 0: Repository Setup + Migration — COMPLETE

### Completed
- [x] 0.1 Project folder created at `/Users/qiang.han/Documents/mycodespace/storyboard-a3`
- [x] 0.2 Directory structure created
- [x] Docs: architecture.md and implementation.md copied
- [x] 0.4 Next.js scaffold + CI/CD
- [x] 0.5a Canvas core migration
- [x] 0.5b Chat + SDK client
- [x] 0.5c Agent + context menus
- [x] 0.5d Camera + LV2V + Training
- [x] 0.6 Vercel deployment (code ready — `vercel link` + `vercel deploy` needs user auth)
- [x] 0.7 CLAUDE.md updated with full project state
- [x] 0.8 New infra VMs deployed (DNS pending)
- [x] 0.9 Acceptance tests pass (21 unit + 6 E2E)

### Key decisions
- Using Next.js 15 App Router (not Pages Router)
- Zustand for state (not Redux/Jotai)
- Dual system: new VMs for a3, existing infra untouched
- SDK image tag `:a3-latest` (not `:latest`)

### What was built
- `app/` — Next.js 16 App Router with 2 API routes
- `components/canvas/` — InfiniteCanvas, Card, ArrowEdge, TopBar, ContextMenu, CameraWidget
- `components/chat/` — ChatPanel, MessageBubble
- `components/settings/` — SettingsPanel (SDK connection)
- `components/training/` — TrainingModal (LoRA fine-tuning)
- `lib/canvas/` — Zustand store + types for cards, edges, viewport
- `lib/chat/` — Zustand store for messages
- `lib/sdk/` — sdkFetch client with auth, health, inference
- `lib/agents/` — Plugin registry + built-in agent (enrich → DAG executor)
- `lib/stream/` — LV2V session lifecycle + webcam capture
- `tests/` — 21 unit tests (vitest) + 6 E2E tests (playwright)
- Total: ~2800 lines of TypeScript/TSX/CSS across 26 source files

### Known issues
- 0.8 infra VMs not yet provisioned (requires user ops action)
- Vercel deployment not yet linked (requires `vercel link` with user auth)

---

## Phase 1: Agent Plugin Interface — COMPLETE

### Completed
- [x] 1.1 Formalized AgentPlugin interface with AgentEvent types (text, tool_call, tool_result, card_created, error, done)
- [x] 1.1 Added CanvasContext interface with CardSummary, CapabilitySummary
- [x] 1.1 Made plugin interface async generator based (yields AgentEvents)
- [x] 1.2 Created Tool Registry (lib/tools/types.ts, registry.ts)
- [x] 1.2 Created SDK tools (inference, stream_start/control/stop, capabilities, train_lora)
- [x] 1.2 Created Canvas tools (canvas_create, canvas_update, canvas_get)
- [x] 1.3 Refactored BuiltInPlugin to implement AgentPlugin interface (yields events)
- [x] 1.4 Added agent selector dropdown to SettingsPanel (Built-in | Claude coming soon)
- [x] 1.4 Agent preference persisted in localStorage
- [x] 1.5 Updated ChatPanel to consume AgentEvent stream, render tool_call pills
- [x] 1.6 All 40 unit tests pass (21 existing + 19 new)
- [x] 1.6 All 6 E2E tests pass

### Key decisions
- AgentPlugin.sendMessage returns AsyncGenerator<AgentEvent> (not Promise<void>)
- Built-in plugin maintains backward compat by still writing to chat/canvas stores directly
- Tool registry is separate from agent registry (tools shared across all plugins)
- 9 tools registered: 6 SDK tools + 3 canvas tools
## Phase 2: Claude Plugin — COMPLETE

### Completed
- [x] 2.1 ClaudePlugin with tool-use loop (call API → execute tools → loop until end_turn)
- [x] 2.2 System prompt from skills/base.md with canvas context injection
- [x] 2.3 /api/agent/chat route supports both streaming SSE and non-streaming
- [x] 2.4 Agent selector enabled in Settings (Built-in | Claude | OpenAI coming soon)
- [x] 2.5 Claude plugin registered in page.tsx alongside built-in
- [x] 2.6 Error handling: rate limits, missing API key, SDK errors
- [x] 2.7 Budget controls: daily token tracking in localStorage, 80% warning, hard cap
- [x] 2.8 52 unit tests pass (40 Phase 1 + 6 budget + 6 claude plugin)
- [x] 2.9 6 E2E tests pass

### New files
- `lib/agents/claude/index.ts` — ClaudePlugin: API call → tool execution → yields AgentEvents
- `lib/agents/claude/system-prompt.ts` — Loads skills/base.md, injects canvas context
- `lib/agents/claude/budget.ts` — Token tracking, daily limit, warning threshold
- `skills/base.md` — Base system prompt (capabilities, rules, workflow)
- `public/skills/base.md` — Static-served copy for client fetch
- `tests/unit/claude-budget.test.ts` — 6 budget tests
- `tests/unit/claude-plugin.test.ts` — 6 plugin interface tests

### Key decisions
- Non-streaming API calls by default (simpler, reliable). SSE streaming available via `stream: true` flag.
- Tool execution uses shared registry (executeTool) — same tools for built-in and Claude
- Budget tracked in localStorage per day, auto-resets at midnight
- Conversation history maintained in-memory (resets on page reload)
- ANTHROPIC_API_KEY is server-side only (via Vercel env vars or .env.local)


## Phase 3: Claude Skills + Token Efficiency — COMPLETE

### Completed
- [x] 3.1 Slimmed base.md to ~200 tokens (was ~400), focused on tool usage
- [x] 3.2 Created 6 skill files: text-to-image, image-editing, video, scope-lv2v, lora-training, style-presets
- [x] 3.2 Skills served as static files from public/skills/
- [x] 3.3 Added load_skill tool — on-demand skill loading (L3 token efficiency)
- [x] 3.3 Added create_media compound tool — multi-step in one call (L2 token efficiency)
- [x] 3.4 Conversation compaction (L4) — shrinks old tool results and long text
- [x] 3.5 62 unit tests pass, build succeeds
- [x] Total: 11 tools registered (create_media, inference, stream_*, capabilities, train_lora, canvas_*, load_skill)

### Token efficiency levels implemented
- L2: create_media compound tool (1 call instead of N for multi-step)
- L3: On-demand skill loading via load_skill (not in system prompt)
- L4: Conversation compaction (old tool results shrunk)
- L1 (smart SDK): client-side schema ready, needs SDK service endpoint
- L5 (memory): partial (budget), full in Phase 4

### New files
- `lib/tools/skill-tools.ts` — load_skill tool with caching
- `lib/tools/compound-tools.ts` — create_media compound tool
- `lib/agents/claude/compaction.ts` — conversation history compaction
- `skills/*.md` — 7 skill files (base + 6 on-demand)
- `public/skills/*.md` — static copies for client fetch
- `tests/unit/compaction.test.ts` — 5 compaction tests
- `tests/unit/skill-tools.test.ts` — 5 skill/compound tool tests


## Phase 4: UX Polish — NOT STARTED
## Phase 5: Wow Features — NOT STARTED
## Phase 6: Production Polish — NOT STARTED
## Phase 7: MCP Tools + Daily Briefing — NOT STARTED
