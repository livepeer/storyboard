# Storyboard Agent Architecture — Implementation Plan

## Vision

Transform the storyboard from a single-file prototype into a **production web application** — an agent-powered creator tool where artists chat naturally with an AI assistant that understands Livepeer's full model catalog, orchestrates multi-step workflows, controls live streams with expert parameters, and learns user preferences.

**Target persona:** Artists and amateur creators who want to produce professional media artifacts using the world's best AI models in real-time.

**Deployed as:** Vercel web app at `storyboard.livepeer.org` (or similar).

**Definition of done:** A user can open the web app, type "Create a 4-shot storyboard of a knight fighting a dragon, animate the best shot, and start a live stream with cyberpunk style" — and Claude executes the entire workflow in under 2 minutes, producing 4 image cards, 1 video card, and a live LV2V stream, using fewer than 3,000 tokens total.

---

## Context Preservation Protocol

**Every phase and every major task MUST end with a context save.** This ensures the next Claude session can resume without re-reading the entire codebase.

### What to save after each phase

1. **Update `CLAUDE.md`** in the storyboard-a3 repo with:
   - Current architecture state (what's built, what's not)
   - Active branches and their purpose
   - Key files and their roles
   - Known issues and technical debt
   - What the next task should be

2. **Update `docs/plan/status.md`** with:
   - Phase completion status (checkboxes)
   - Decisions made and why
   - Deviations from the original plan
   - Blockers encountered and how they were resolved

3. **Git commit with descriptive message** summarizing:
   - What was built
   - What was tested
   - What's ready for the next session

### Context save template (copy into status.md after each phase)

```markdown
## Phase N: [Name] — COMPLETED [date]

### What was built
- [file]: [what it does]
- [file]: [what it does]

### Key decisions
- [decision]: [why]

### What works (verified)
- [feature]: tested via [method]

### Known issues
- [issue]: [workaround or TODO]

### Next task
- [exact task description with file paths]
- [what to read first]
- [what to test after]
```

---

## Phase 0: Repository Setup + Migration (Week 0-1)

**Goal:** Create `livepeer/storyboard` repo, establish project structure, migrate storyboard.html, deploy to Vercel.

### 0.1. Create repository

**Local development:** `/Users/qiang.han/Documents/mycodespace/storyboard-a3`
**Source context:** `/Users/qiang.han/Documents/mycodespace/simple-infra` (SDK service, deployment scripts, storyboard.html to migrate)

```bash
# Local project already initialized at:
#   /Users/qiang.han/Documents/mycodespace/storyboard-a3

# When ready to publish to GitHub:
gh auth switch --user seanhanca
gh repo create livepeer/storyboard --public --description \
  "AI-powered creative storyboard — generate, edit, animate, and stream media with Livepeer"
gh auth switch --user qianghan
cd /Users/qiang.han/Documents/mycodespace/storyboard-a3
git remote add origin git@github.com:livepeer/storyboard.git
git push -u origin main
```

### 0.2. Project structure

```
livepeer/storyboard/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout — fonts, metadata, theme
│   ├── page.tsx                  # Main storyboard page
│   ├── api/
│   │   ├── agent/
│   │   │   └── chat/route.ts    # Claude/OpenAI proxy (server-side API keys)
│   │   └── health/route.ts
│   └── globals.css
│
├── components/
│   ├── canvas/
│   │   ├── InfiniteCanvas.tsx    # Pan/zoom canvas with card rendering
│   │   ├── Card.tsx              # Draggable, resizable media card
│   │   ├── ArrowEdge.tsx         # Dependency arrows between cards
│   │   ├── ContextMenu.tsx       # Right-click actions
│   │   └── CameraWidget.tsx      # Webcam capture + LV2V trigger
│   ├── chat/
│   │   ├── ChatPanel.tsx         # Agent chat panel
│   │   ├── MessageBubble.tsx     # Text, tool_call, tool_result rendering
│   │   ├── ThinkingIndicator.tsx # Animated dots while agent reasons
│   │   └── QuickActions.tsx      # Generate / Restyle / Animate buttons
│   ├── settings/
│   │   ├── SettingsPanel.tsx     # SDK URL, API keys, agent selector
│   │   └── AgentSelector.tsx     # Plugin dropdown
│   └── training/
│       └── TrainingModal.tsx     # LoRA training UI
│
├── lib/
│   ├── agents/                   # Agent plugin system
│   │   ├── types.ts              # AgentPlugin interface, AgentEvent types
│   │   ├── registry.ts           # Plugin registry, active plugin management
│   │   ├── built-in/
│   │   │   └── index.ts          # BuiltInPlugin (migrated current code)
│   │   ├── claude/
│   │   │   ├── index.ts          # ClaudePlugin (Messages API + tool_use)
│   │   │   └── system-prompt.ts  # Loads from skills/ directory
│   │   └── openai/
│   │       └── index.ts          # OpenAIPlugin (Chat Completions + functions)
│   │
│   ├── tools/                    # Shared tool registry
│   │   ├── types.ts              # Tool interface, ToolResult types
│   │   ├── registry.ts           # Tool registration + execution
│   │   ├── sdk-tools.ts          # inference, stream_*, capabilities, train
│   │   └── canvas-tools.ts       # canvas_create, canvas_update, canvas_get
│   │
│   ├── sdk/                      # SDK service client
│   │   ├── client.ts             # sdkFetch wrapper, auth, error handling
│   │   └── types.ts              # API request/response types
│   │
│   ├── canvas/                   # Canvas state management
│   │   ├── store.ts              # Zustand store — cards, registry, layout
│   │   └── layout.ts             # DAG auto-layout algorithm
│   │
│   └── stream/                   # LV2V stream management
│       ├── session.ts            # Stream lifecycle, frame publish/poll
│       └── webcam.ts             # Webcam capture + frame extraction
│
├── skills/                       # Claude agent skills (markdown)
│   ├── text-to-image.md          # Model selection + prompt engineering
│   ├── image-editing.md          # kontext-edit, reve-edit expertise
│   ├── video.md                  # i2v, v2v, t2v parameters
│   ├── scope-lv2v.md            # Scope pipeline parameters, transitions
│   ├── lora-training.md         # LoRA training guide
│   ├── style-presets.md         # 15 built-in style presets
│   └── daily-briefing.md        # Email/calendar/news → video briefing
│
├── docs/
│   ├── design/
│   │   ├── architecture.md       # claude-as-an-agent.md (from simple-infra)
│   │   ├── agent-plugins.md      # Plugin interface specification
│   │   └── tool-registry.md      # Tool schemas and contracts
│   └── plan/
│       └── implementation.md     # This file (claude-a3-plan.md)
│
├── tests/
│   ├── e2e/
│   │   ├── storyboard.spec.ts   # Playwright — canvas, cards, chat
│   │   ├── agent-builtin.spec.ts # Built-in plugin regression
│   │   ├── agent-claude.spec.ts  # Claude plugin workflows
│   │   └── lv2v.spec.ts         # LV2V streaming E2E
│   └── unit/
│       ├── agents/              # Plugin interface tests
│       ├── tools/               # Tool registry tests
│       └── canvas/              # Canvas store tests
│
├── public/
│   └── fonts/                   # Inter, JetBrains Mono
│
├── next.config.ts               # Next.js config
├── vercel.json                  # Vercel deployment config
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── CLAUDE.md                    # Project instructions for Claude Code
└── README.md
```

### 0.3. Technology choices

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js 15 (App Router) | Vercel-native, API routes for proxy, SSR for SEO |
| Styling | Tailwind CSS | Matches existing dark theme; utility-first |
| State | Zustand | Lightweight, no boilerplate, works with canvas |
| Canvas | Custom (migrated) | Existing pan/zoom/drag code is solid |
| Testing | Playwright + Vitest | E2E + unit; matches simple-infra pattern |
| Deploy | Vercel | Zero-config Next.js hosting, edge functions |

### 0.4. Next.js project scaffold + CI/CD (1 day)

```bash
cd /Users/qiang.han/Documents/mycodespace/storyboard-a3
npx create-next-app@latest . --typescript --tailwind --app --src-dir=false --import-alias="@/*"
npm install zustand
npm install -D playwright @playwright/test vitest
```

- Configure `vercel.json`, `tailwind.config.ts`
- Setup GitHub Actions: lint + type-check + vitest on PR
- Vercel auto-deploy on push to main
- **Context save:** Commit "Phase 0.4: scaffold with CI/CD"

### 0.5. Migrate storyboard.html → Next.js (8 days)

Break into 4 milestones, each independently testable:

**Milestone 0.5a: Canvas core (2 days)**
- Extract CSS variables → `globals.css` + Tailwind
- `InfiniteCanvas.tsx` — pan/zoom with matrix transforms
- `Card.tsx` — draggable, resizable, typed (image/video/audio/stream)
- `ArrowEdge.tsx` — SVG dependency arrows
- **Test:** Canvas renders, cards drag, arrows follow. No chat, no SDK.
- **Context save:** Commit "Phase 0.5a: canvas core — pan/zoom/drag works"

**Milestone 0.5b: Chat + SDK client (2 days)**
- `ChatPanel.tsx` — messages, input, floating/draggable
- `lib/sdk/client.ts` — `sdkFetch` wrapper with auth
- `SettingsPanel.tsx` — SDK URL, API key fields
- **Test:** Chat renders, SDK health check succeeds, settings persist.
- **Context save:** Commit "Phase 0.5b: chat panel + SDK client"

**Milestone 0.5c: Agent + context menus (2 days)**
- `ContextMenu.tsx` — right-click actions
- `lib/agents/built-in/index.ts` — migrate handleUserMessage + enrich + DAG executor
- Wire chat → built-in agent → SDK → canvas card creation
- **Test:** Type "create a dragon" → image card appears on canvas.
- **Context save:** Commit "Phase 0.5c: built-in agent works end-to-end"

**Milestone 0.5d: Camera + LV2V + Training (2 days)**
- `CameraWidget.tsx` — webcam capture
- `lib/stream/session.ts` — LV2V publish/poll/control
- `TrainingModal.tsx` — LoRA training UI
- **Test:** Webcam starts, LV2V creates stream card. Training modal opens.
- **Context save:** Commit "Phase 0.5d: camera + LV2V + training migrated"

### 0.6. Vercel deployment

**Vercel org:** Livepeer Foundation (existing org where NaaP is deployed)
**Account:** `qiang@livepeer.org` (already has access)
**Project:** `storyboard` under the Livepeer Foundation team

```bash
# 1. Link repo to Livepeer Foundation Vercel team
cd /Users/qiang.han/Documents/mycodespace/storyboard-a3
npx vercel link
#   → Select "Livepeer Foundation" team
#   → Link to existing project? No → create new "storyboard"

# 2. Set environment variables via Vercel CLI
npx vercel env add ANTHROPIC_API_KEY production
npx vercel env add OPENAI_API_KEY production
npx vercel env add NEXT_PUBLIC_SDK_URL production
#   → value: https://sdk-a3.daydream.monster

# 3. Deploy
npx vercel deploy --prod
```

```json
// vercel.json
{
  "framework": "nextjs",
  "regions": ["iad1"]
}
```

All secrets managed via `vercel env` — not in `vercel.json`. Environment variables:

| Variable | Scope | Value |
|----------|-------|-------|
| `ANTHROPIC_API_KEY` | Production + Preview | `sk-ant-...` (server-side only) |
| `OPENAI_API_KEY` | Production + Preview | `sk-...` (server-side only, Phase 6) |
| `NEXT_PUBLIC_SDK_URL` | Production + Preview | `https://sdk-a3.daydream.monster` |
| `NEXT_PUBLIC_DEFAULT_AGENT` | Production + Preview | `claude` |

**Domain:** Configure `storyboard.livepeer.org` in Vercel project settings → Domains (requires DNS A/CNAME record on livepeer.org).

**Preview deployments:** Every PR auto-deploys to a preview URL (`storyboard-*.vercel.app`) for code review.

API route for agent proxy:
```typescript
// app/api/agent/chat/route.ts
export async function POST(req: Request) {
  const { messages, tools, system } = await req.json();
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4096, system, tools, messages }),
  });
  return new Response(resp.body, { headers: { 'Content-Type': 'application/json' } });
}
```

### 0.7. Create CLAUDE.md for the new repo

```markdown
# CLAUDE.md — Storyboard A3

## Project Overview
Next.js 15 app (App Router) with Tailwind CSS, Zustand state, Playwright + Vitest tests.
Deployed to Vercel (Livepeer Foundation org, qiang@livepeer.org). Backend: SDK service at sdk-a3.daydream.monster.

## Architecture
- components/canvas/ — infinite canvas with draggable cards
- components/chat/ — agent chat panel
- lib/agents/ — plugin system (built-in, claude, openai)
- lib/tools/ — shared tool registry (inference, canvas, stream, train)
- lib/sdk/ — SDK service client
- skills/ — Claude agent skills (markdown, served as static assets)

## Infrastructure (DO NOT TOUCH existing simple-infra)
- sdk-a3.daydream.monster — NEW SDK with smart tools (Docker tag :a3-latest)
- byoc-a3-staging-1.daydream.monster — NEW BYOC with enriched metadata
- Shared (read-only): signer.daydream.live, orch-staging-1/2

## Key Commands
npm run dev        # local dev at localhost:3000
npm run test       # vitest unit tests
npx playwright test # E2E tests
vercel deploy      # deploy to Vercel

## Branching
- livepeer/storyboard — this repo (main)
- livepeer/livepeer-python-gateway — feat/storyboard-a3 (SDK changes)
- livepeer/simple-infra — feat/storyboard-a3-infra (VM configs)
```

### 0.8. Setup new infrastructure VMs

(See "Infrastructure Isolation" section for full details)

- Create `sdk-a3-staging-1` and `byoc-a3-staging-1` GCP VMs
- Deploy BYOC stack with enriched `byoc-a3.yaml`
- Deploy SDK service with `:a3-latest` image tag
- Verify health endpoints
- **Context save:** Commit "Phase 0.8: infra VMs deployed, health checks passing"

### 0.9. Phase 0 acceptance tests

```bash
# All must pass before Phase 0 is complete:
npx playwright test tests/e2e/storyboard.spec.ts  # migrated from simple-infra

# Manual verification:
# 1. Canvas: pan, zoom, drag card, resize card, right-click context menu
# 2. Chat: type "create a dragon" → image card appears
# 3. Settings: SDK URL, API key persist across reload
# 4. Camera: webcam starts, LV2V button visible
# 5. Context menu: restyle, animate, upscale actions work
# 6. Vercel: production deployment accessible at storyboard URL
# 7. Existing infra: sdk.daydream.monster, byoc-staging-1 still responding
```

**Context save:** Update `docs/plan/status.md` with Phase 0 completion. Update `CLAUDE.md` with current state.

---

## Phase 1: Agent Plugin Interface + Built-in Plugin (Week 1)

**Goal:** Extract the agent logic into a plugin interface. No behavior change.

### 1.1. Define Agent Plugin interface

```typescript
// lib/agents/types.ts
export interface AgentEvent {
  type: 'text' | 'tool_call' | 'tool_result' | 'card_created' | 'error' | 'done';
  content?: string;
  name?: string;
  input?: Record<string, unknown>;
  result?: unknown;
  refId?: string;
}

export interface AgentPlugin {
  readonly name: string;
  readonly description: string;
  readonly configFields: ConfigField[];  // for settings panel
  configure(config: Record<string, string>): void;
  sendMessage(text: string, context: CanvasContext): AsyncGenerator<AgentEvent>;
  stop(): void;
}

export interface CanvasContext {
  cards: CardSummary[];       // current canvas state
  selectedCard?: string;      // refId of right-clicked card
  capabilities: Capability[]; // cached model catalog
}
```

### 1.2. Define Tool Registry

```typescript
// lib/tools/types.ts
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;         // for Claude/OpenAI tool_use
  execute: (input: any) => Promise<ToolResult>;
}

// lib/tools/registry.ts — 9 shared tools
export const tools: ToolDefinition[] = [
  inferenceToolDef,       // calls SDK /inference
  streamStartToolDef,     // calls SDK /stream/start
  streamControlToolDef,   // calls SDK /stream/{id}/control
  streamStopToolDef,      // calls SDK /stream/{id}/stop
  canvasCreateToolDef,    // manipulates Zustand store
  canvasUpdateToolDef,    // manipulates Zustand store
  canvasGetToolDef,       // reads Zustand store
  capabilitiesToolDef,    // calls SDK /capabilities
  trainLoraToolDef,       // calls SDK /train
];
```

### 1.3. Extract BuiltInPlugin (2 days)

Move current `handleUserMessage`, `ENRICH_SYSTEM_PROMPT`, `resolveCapability`, DAG executor into `lib/agents/built-in/index.ts`. The plugin yields events as the DAG executes.

### 1.4. Agent selector in settings + wiring (1 day)

### 1.5. Phase 1 acceptance criteria

```
# These prompts must produce identical results to storyboard.html:
"create a dragon"                    → 1 image card (same model as before)
"create a dragon and restyle it"     → 2 cards with dependency arrow
"restyle the image as watercolor"    → right-click context menu works
"animate this to video"              → video card created

# Plugin switching:
Settings → Agent → switch to "Claude (coming soon)" → switch back → no state lost
```

**Context save:** Commit "Phase 1: plugin interface complete, BuiltInPlugin passes all tests". Update CLAUDE.md with plugin architecture summary.

---

## Phase 2: Claude Plugin (Week 2)

### 2.1. ClaudePlugin implementation

```typescript
// lib/agents/claude/index.ts
export class ClaudePlugin implements AgentPlugin {
  name = 'claude';
  description = 'Claude AI — intelligent model selection, multi-step reasoning, creative direction';

  async *sendMessage(text: string, context: CanvasContext): AsyncGenerator<AgentEvent> {
    this.messages.push({ role: 'user', content: text });

    while (true) {
      const resp = await this.callAPI(this.messages, context);
      for (const block of resp.content) {
        if (block.type === 'text') yield { type: 'text', content: block.text };
        if (block.type === 'tool_use') {
          yield { type: 'tool_call', name: block.name, input: block.input };
          const result = await toolRegistry.execute(block.name, block.input);
          yield { type: 'tool_result', name: block.name, result };
          this.appendToolResult(resp.content, block.id, result);
        }
      }
      if (resp.stop_reason === 'end_turn') { yield { type: 'done' }; break; }
    }
  }

  private async callAPI(messages, context) {
    // Route through /api/agent/chat (server-side key) or direct (dev mode)
    const systemPrompt = await loadSkills(context);
    return fetch('/api/agent/chat', { ... });
  }
}
```

### 2.2. System prompt from skills/ directory

```typescript
// lib/agents/claude/system-prompt.ts
export async function loadSkills(context: CanvasContext): string {
  const base = await fetch('/skills/base.md').then(r => r.text());
  const modelSkill = await fetch('/skills/text-to-image.md').then(r => r.text());
  const editSkill = await fetch('/skills/image-editing.md').then(r => r.text());
  const videoSkill = await fetch('/skills/video.md').then(r => r.text());

  // Inject active streams if LV2V is running
  const hasActiveStream = context.cards.some(c => c.type === 'stream');
  const scopeSkill = hasActiveStream
    ? await fetch('/skills/scope-lv2v.md').then(r => r.text())
    : '';

  return [base, modelSkill, editSkill, videoSkill, scopeSkill].filter(Boolean).join('\n\n---\n\n');
}
```

### 2.3. Streaming + proxy (1.5 days)

- `/api/agent/chat` streams via Claude's SSE streaming
- Chat panel renders tokens as they arrive
- Tool calls show spinner pills

### 2.4. Conversation persistence (0.5 day)

- Zustand store + localStorage for messages
- "New conversation" button

### 2.5. Smart tool fallback: `model_override` + `raw_inference`

When `create_media` picks the wrong model, Claude needs an escape hatch:

```typescript
// In create_media tool schema, add optional override:
steps: [{
  action: "generate",
  prompt: "...",
  style_hint: "illustration",
  model_override: "flux-pro",  // OPTIONAL: bypass smart selection
}]
```

Also keep `raw_inference` as a low-level tool for power users:
```typescript
// raw_inference — direct model call, no smart selection
{ name: "raw_inference", description: "Direct inference call. Use create_media instead unless the user specifically requests a model.", ... }
```

### 2.6. Error handling design

| Error | User sees in chat | Claude sees |
|-------|-------------------|-------------|
| SDK unreachable | "SDK service is not responding. Check your connection." | `{error: "SDK_UNREACHABLE", detail: "..."}` |
| Model 404 | Claude auto-retries with alternative | `{error: "MODEL_NOT_FOUND", model: "..."}` → Claude picks different model |
| Rate limited (Anthropic) | "Thinking is taking longer than usual..." | 429 → retry with backoff (3 retries max) |
| Rate limited (SDK) | "The AI service is busy. Retrying..." | 429 → retry with backoff |
| Inference timeout | Claude informs user, suggests faster model | `{error: "TIMEOUT", model: "...", elapsed_ms: ...}` |
| Invalid chain | SDK returns clear error | `{error: "CHAIN_INVALID", detail: "base64 output cannot feed video"}` |

### 2.7. Budget controls

```typescript
// lib/agents/claude/budget.ts
const DEFAULT_DAILY_LIMIT = 50000;  // tokens (~$0.15)
const WARNING_THRESHOLD = 0.8;      // warn at 80%

interface BudgetState {
  daily_tokens_used: number;
  daily_limit: number;
  last_reset: string;  // ISO date
}

// Check before each API call:
if (budget.daily_tokens_used > budget.daily_limit * WARNING_THRESHOLD) {
  yield { type: 'text', content: `⚠️ Token usage at ${pct}%. Daily limit: ${budget.daily_limit}.` };
}
if (budget.daily_tokens_used > budget.daily_limit) {
  yield { type: 'error', content: 'Daily token limit reached. Reset tomorrow or increase in Settings.' };
  return;
}
```

Settings panel shows: `Usage today: 12,450 / 50,000 tokens (~$0.04 / $0.15)`

### 2.8. Memory schema

```typescript
// lib/agents/claude/memory.ts — stored in localStorage
interface AgentMemory {
  version: 1;
  preferences: {
    preferred_models: Record<string, string>;  // { "illustration": "recraft-v4", "photo": "flux-pro" }
    default_style_dna: string | null;           // "clean illustration, vibrant colors"
    lv2v_defaults: { noise_scale: number; pipeline: string } | null;
  };
  ratings: Array<{
    date: string;
    prompt_summary: string;
    model: string;
    rating: 1 | 2 | 3 | 4 | 5;
  }>;
  workflow_patterns: Array<{
    trigger: string;     // "storyboard" | "restyle" | "animate"
    pattern: string;     // "4 shots, animate best, no need to ask"
  }>;
}

// Injected into Claude context as a compact summary (~100 tokens):
function memoryToContext(mem: AgentMemory): string {
  const prefs = Object.entries(mem.preferences.preferred_models)
    .map(([k, v]) => `${k}→${v}`).join(', ');
  return `User preferences: ${prefs}. Style: ${mem.preferences.default_style_dna || 'none set'}.`;
}
```

### 2.9. Phase 2 acceptance criteria

```
# Test prompts (with expected behavior):
"create a dragon"
  → Claude calls create_media({steps:[{action:"generate", prompt:"..."}]})
  → 1 image card appears on canvas
  → Claude says something about the result

"create a dragon, restyle as watercolor, animate to video"
  → Claude calls create_media with 3 steps in ONE tool call
  → 3 cards appear with dependency arrows
  → Total < 2,000 tokens

"use flux-pro to create a landscape"
  → Claude passes model_override: "flux-pro"
  → Correct model used despite smart selection

# Error handling:
Disconnect SDK → type "create a dragon"
  → Chat shows "SDK service is not responding" (not a stack trace)

# Token tracking:
Settings → Usage → shows token count for this session
```

**Context save:** Commit "Phase 2: Claude plugin with smart tools, streaming, error handling, budget controls". Update CLAUDE.md. Write `docs/plan/status.md` Phase 2 entry.

---

## Phase 3: Claude Skills (Week 3)

### 3.1. Base skill — the core system prompt

```markdown
# skills/base.md (~300 tokens — this is the ONLY skill loaded every turn)

You are a creative director assistant in Livepeer Storyboard — an AI-powered
media creation tool. Artists talk to you in natural language. You create media
using tools and place results on an infinite canvas.

## How you work
- Use `create_media` for all image/video/audio/editing tasks. It handles model
  selection, chain constraints, and canvas placement automatically.
- Use `stream` for live video-to-video (LV2V) streaming.
- Use `canvas` to read or modify the canvas state.
- Use `load_skill` to get detailed guidance for advanced scenarios (Scope LV2V
  parameters, LoRA training, style presets).

## Rules
- Prefer ONE compound create_media call over multiple separate calls.
- Always include a title for each step (used as card label).
- For multi-shot storyboards: generate all images first, then animate the best one.
- When the user references a card by name, use canvas({action:"get"}) to find its URL.
- If a tool fails, explain what happened and suggest an alternative.
- Keep responses SHORT. The canvas shows the results — don't describe what the user can see.

## Style hints for create_media
- "illustration" → sharp details, vibrant colors (recraft-v4)
- "photorealistic" → photographic quality (flux-pro)
- "fast" → quick draft (nano-banana)
- "cinematic" → film-quality video (kling-i2v)
```

### 3.2. Skills files

All skills live in `skills/` as markdown files, served as static assets:

| File | Content |
|------|---------|
| `skills/base.md` | **Defined above** — core persona + tool usage conventions (~300 tokens) |
| `skills/text-to-image.md` | Model selection guide, prompt engineering per model, size rules |
| `skills/image-editing.md` | kontext-edit vs reve-edit, instruction-style prompts, 15 style presets |
| `skills/video.md` | i2v/v2v/t2v pipeline selection, motion prompts, chain constraints |
| `skills/scope-lv2v.md` | Scope parameters: noise_scale, transitions, denoising, VACE, common scenarios |
| `skills/lora-training.md` | Image count, trigger words, step count guide |
| `skills/style-presets.md` | 15 presets with optimized prompts for each model type |

### 3.2. Scope LV2V skill (detailed)

```markdown
# skills/scope-lv2v.md
## Scope Live Stream (LV2V)

### Pipeline: longlive
- Cold start: ~3 min (VACE model weights download)
- Warm start: <1s

### Runtime Parameters
| Parameter | Default | Range | Effect |
|-----------|---------|-------|--------|
| prompts | required | string | Style description (keep under 20 words) |
| noise_scale | 0.7 | 0.0-1.0 | Lower=faithful to input, higher=creative |
| noise_controller | true | bool | Auto-adjust noise from motion |
| denoising_step_list | [1000,750,500,250] | list[int] | More steps=quality, fewer=speed |
| reset_cache | false | bool | One-shot cache flush for dramatic prompt changes |
| kv_cache_attention_bias | varies | 0.01-1.0 | Lower=responsive, higher=stable |

### Transitions (smooth prompt changes)
{ "transition": { "target_prompts": [{"text":"...", "weight":1.0}], "num_steps": 8, "temporal_interpolation_method": "slerp" } }

### Scenario Recipes
| User says | noise_scale | prompt style | extras |
|-----------|-------------|-------------|--------|
| "painting" | 0.7 | "oil painting style warm colors" | — |
| "subtle" | 0.3 | "warm golden hour lighting" | — |
| "trippy" | 0.95 | "psychedelic fractal explosion" | — |
| "change style smoothly" | keep | use transition num_steps=8 slerp | — |
| "more responsive" | keep | keep | kv_cache_attention_bias=0.1 |
| "more stable" | keep | keep | kv_cache_attention_bias=0.8 |
| "different look completely" | keep | new prompt | reset_cache=true first |
```

### 3.4. Phase 3 acceptance criteria

```
# Skill loading:
Claude calls load_skill("scope-lv2v") → skill content appears in tool result
Claude doesn't load scope skill when user asks "create an image" (no LV2V)

# Scope parameters:
"Start LV2V with dreamy style" → noise_scale=0.5, prompt has "dreamy" tokens
"Make it more responsive" → kv_cache_attention_bias lowered
"Change style smoothly" → transition with slerp, num_steps=8

# Token measurement:
System prompt ≤ 500 tokens (verify with tiktoken)
No skill content in system prompt (only in tool results when loaded)
```

**Context save:** Commit "Phase 3: skills complete, Scope parameters verified". Update CLAUDE.md with skills architecture.

---

## Phase 4: UX Polish (Week 4)

### 4.1. Agent thinking indicator (0.5 day)
- Animated dots while Claude API call in progress
- Tool call pills: `[create_media: 3 steps]` with spinner → `✓` on completion
- Collapsible tool results: thumbnail for images, duration for videos

### 4.2. Context menu → agent chat (1 day)
- Right-click "Restyle" → chat panel opens with pre-filled: `Restyle [Card Name] —`
- Cursor in chat input, user types style, presses Enter
- Claude receives context: `{selectedCard: "dragon_01", action: "restyle"}`

### 4.3. Canvas awareness (1 day)
- `canvas({action:"get"})` returns: `[{refId, title, type, url_suffix, position}]` (~10 tokens per card)
- "What's on my canvas?" → Claude describes cards
- "Remove the video cards" → Claude calls `canvas({action:"remove", filter:{type:"video"}})`

### 4.4. Quick actions toolbar (1 day)
- 5 buttons below chat input: Generate | Restyle | Animate | LV2V | Train
- Each opens chat with template prompt and any selected card as context

### 4.5. Conversation compaction implementation (0.5 day)
- After each Claude turn, compact tool results older than 4 messages
- URL results → `[image: ...abc123.jpg]`
- Summary results → `[created 3 cards]`
- Show compacted token savings in Settings → Usage

### 4.6. Phase 4 acceptance criteria

```
# UX:
Tool pills animate correctly (spinner → checkmark)
Right-click card → "Restyle" → chat opens with card context
Quick action "Generate" → chat gets "Generate an image of " template
"What's on my canvas?" → Claude lists all cards accurately

# Token compaction:
After 10 tool calls, conversation < 5,000 tokens (not 20,000)
Settings shows "Saved X tokens via compaction"
```

**Context save:** Commit "Phase 4: UX polish complete". Update CLAUDE.md.

---

## Phase 5: Wow Features (Week 5-6)

### Feature 1: "Storyboard from a Script" (2 days)
User pastes a scene description → Claude calls ONE `create_media` with 4-8 steps → multi-shot storyboard with images, animations, narration. All cards laid out in narrative order.

**Acceptance:** "A knight approaches a dragon's cave at sunset. The dragon emerges." → 4+ image cards + 1 video card + 1 audio card. Under 3,000 tokens.

### Feature 2: "Style DNA" (2 days)
Upload a reference image → Claude extracts visual style → stores as `style_dna` in memory → applies to all future `create_media` calls via `style_hint`.

**Acceptance:** Upload Moebius art → "Create a robot" → robot in Moebius style without user specifying.

### Feature 3: "Live Director Mode" (2 days)
Webcam LV2V + chat commands → Claude calls `stream({action:"control"})` with scenario parameters.

**Acceptance:** "Make it dreamy" → smooth transition. "Go wild" → high noise. "Freeze this" → low noise. Each command < 500 tokens.

### Feature 4: "Iterative Refinement" (1.5 days)
Claude generates → calls `canvas({action:"get"})` to see result URL → uses vision to analyze → re-generates with improved prompt → upscales best version.

**Acceptance:** "Create a professional product photo" → 2-3 iterations visible on canvas, final card is upscaled.

### Feature 5: "Remix Canvas" (1.5 days)
"Combine the dragon with the city background" → Claude calls `canvas({action:"get"})` to find both cards → passes both URLs to `create_media({action:"restyle"})`.

**Acceptance:** References 2 canvas cards → composite output card with arrows from both sources.

### 5.6. Memory + quality ratings (1 day)
- After each workflow: optional 1-5 star rating inline in chat
- Ratings stored in memory schema (see Phase 2.8)
- Claude reads memory summary at start of each conversation (~100 tokens)
- "User prefers recraft for illustrations" → Claude uses it without asking

### 5.7. Phase 5 acceptance criteria

**Context save:** Commit "Phase 5: [feature] complete" after EACH feature. Tag: `v0.5.N`.

---

## Phase 6: OpenAI Plugin + Production Polish (Week 7)

- OpenAI plugin (Chat Completions + function calling, same tool registry)
- Plugin marketplace UI in settings
- Full Playwright regression suite across all three plugins
- Performance benchmarks (time-to-first-card per plugin)
- README, contributor docs, deployment docs

### 6.1. Phase 6 acceptance + token efficiency A/B test

Run the 10-prompt A/B test suite (see Token Efficiency → Evaluation → A/B):
- All 10 prompts produce correct output with both naive and optimized approaches
- Optimized uses ≤ 20% of naive token count on every test
- Quality ratings are equal or better

**Context save:** Commit "Phase 6: production ready". Tag `v1.0.0`. Update CLAUDE.md as "stable".

---

## Phase 7: Universal MCP Tools + Adaptive Workflows (Week 8-9)

### The Big Idea

Instead of hardcoding every integration (YouTube, Gmail, Slack, etc.), **let Claude use any MCP tool the user connects.** The storyboard becomes infinitely extensible — not because we build every integration, but because Claude can use the entire MCP ecosystem.

```
User: "Upload this video to my YouTube channel"
Claude: [uses mcp__youtube__upload_video tool]
  → Done. Here's the link: https://youtu.be/...

User: "Scan my email and make a daily briefing video"
Claude: [uses mcp__gmail__search_emails tool]
  → [uses inference tool for TTS narration]
  → [uses inference tool for background images]
  → [uses inference tool for video composition]
  → Here's your 15s daily briefing video.

User: "Post the dragon storyboard to my Slack channel"
Claude: [uses canvas_get tool to get all cards]
  → [uses mcp__slack__post_message tool with images]
  → Posted to #design-reviews.
```

**The user doesn't configure tools per-feature. They connect MCP servers once, and everything just works.**

### 7.1. Architecture: MCP Tool Passthrough

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (Storyboard)                                                │
│                                                                       │
│  Chat Panel ──────► POST /api/agent/chat ──────────────────────┐    │
│                      {messages, userMcpServers: [...]}          │    │
│                                                                  │    │
│  ◄── SSE stream ◄── Vercel API Route ◄─────────────────────────┘    │
│                                                                       │
│  Tool execution:                                                      │
│   • Storyboard tools (inference, canvas, stream) → execute locally   │
│   • MCP tools (gmail, youtube, slack) → forwarded to API route       │
│     which connects to MCP servers and executes server-side           │
└─────────────────────────────────────────────────────────────────────┘
         │                          │
         ▼                          ▼
  SDK Service               MCP Servers (user-configured)
  (media tools)              ├── gmail.mcp.claude.com
                             ├── youtube-mcp-server (user's)
                             ├── slack-mcp-server (user's)
                             └── ... any MCP server
```

### 7.2. How it works

**Step 1: User connects MCP servers in Settings**

```
Settings → Connected Tools
  ┌──────────────────────────────────────────────┐
  │ Gmail     ✅ Connected  [Disconnect]         │
  │ YouTube   ✅ Connected  [Disconnect]         │
  │ Slack     ○ Not connected  [Connect]          │
  │                                                │
  │ [+ Add custom MCP server]                      │
  │   URL: https://my-mcp-server.com/mcp           │
  │   Auth: Bearer token / OAuth                    │
  └──────────────────────────────────────────────┘
```

Pre-configured popular servers (one-click connect with OAuth):
- **Gmail** — `gmail.mcp.claude.com` (Anthropic official)
- **YouTube** — community MCP or custom
- **Slack** — community MCP
- **Google Drive** — for file access
- **Notion** — for content publishing
- **Custom** — any MCP server URL

**Step 2: Vercel API route discovers tools at chat time**

```typescript
// app/api/agent/chat/route.ts
export async function POST(req: Request) {
  const { messages, system, mcpServers } = await req.json();

  // 1. Connect to user's MCP servers and discover their tools
  const mcpTools = [];
  for (const server of mcpServers) {
    const client = new McpClient(server.url, server.auth);
    const tools = await client.listTools();
    mcpTools.push(...tools.map(t => ({
      ...t,
      _mcpServer: server.url,  // track which server owns this tool
    })));
  }

  // 2. Combine storyboard tools + MCP tools
  const allTools = [...STORYBOARD_TOOLS, ...mcpTools];

  // 3. Call Claude with ALL tools
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    system,
    tools: allTools,
    messages,
    stream: true,
  });

  // 4. Stream response, execute MCP tool calls server-side
  return new Response(streamToolCalls(response, mcpClients), {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
```

**Step 3: Tool call routing**

When Claude calls a tool:
- **Storyboard tool** (inference, canvas_create, etc.) → result sent back to browser, browser executes locally, sends result back to API route for next Claude turn
- **MCP tool** (gmail_search, youtube_upload, etc.) → API route executes via MCP client server-side, sends result to Claude directly

**Step 4: Claude decides what to use**

Claude sees ALL available tools in a single conversation. It naturally picks the right ones:
- "Make a video" → `inference` tool
- "Upload it" → `mcp__youtube__upload_video` tool
- "Email it to my team" → `mcp__gmail__send_email` tool
- "Summarize my inbox" → `mcp__gmail__search_emails` + Claude reasoning

No special routing. No hardcoded integrations. Claude just picks from its toolbox.

### 7.3. UX: Seamless tool discovery

When a user asks for something that needs an unconnected tool:

```
User: "Upload this to YouTube"

Claude: I'd love to help! You'll need to connect YouTube first.
  Go to Settings → Connected Tools → YouTube → Connect.
  Once connected, I can upload directly from the canvas.
```

When a tool IS connected:

```
User: "Upload this to YouTube with title 'Dragon Storyboard'"

Claude: Uploading the video from card "Dragon Animation"...
  [mcp__youtube__upload_video: {title: "Dragon Storyboard", video_url: "..."}]
  Done! https://youtu.be/abc123
```

### 7.4. Daily Email Briefing — Adaptive Workflow Skill

Add to `skills/`:

```markdown
# skills/daily-briefing.md

## Daily Briefing Skill

You can create personalized daily briefing videos from any data source.

### Email Briefing (requires Gmail connection)
When the user asks for an email briefing or daily summary:

1. **Fetch emails**: Use gmail search tool for last 24h inbox
2. **Analyze & prioritize**: Identify urgent, important, and FYI emails
3. **Write narration script** (~150 words for 15s, ~300 words for 30s):
   - Open with "Good morning, here's your briefing for [date]"
   - Group by priority: urgent items first, then important, then FYI
   - Close with "That's your update. Have a productive day."
4. **Generate visuals**: Create 3-5 thematic background images using text-to-image
   - Match visual tone to content (urgent=bold red/orange, calm=blue/green)
   - Use abstract/artistic styles, not literal email screenshots
5. **Generate narration**: Use TTS tool with professional voice
6. **Compose video**: Use video-compose tool to stitch images (3s each) + audio
7. **Present on canvas**: Create a video card with the briefing

### Adaptation Rules
- **Busy inbox (>20 emails)**: Focus on top 5-7 most important, mention count of others
- **Light inbox (<5 emails)**: Expand each email summary, add more detail
- **Recurring senders**: Learn which senders the user cares about over sessions
- **Time of day**: Morning = full briefing; evening = "end of day wrap-up" tone
- **User preference signals**: If user says "shorter" → reduce to 10s; "more detail" → expand to 30s

### Other Data Sources (adapt the same pattern)
- **Calendar**: "What's my day look like?" → fetch calendar events → narrate schedule
- **Slack**: "What happened in #engineering?" → fetch channel history → summarize
- **News/RSS**: "Tech news briefing" → fetch headlines → narrate top stories
- **GitHub**: "What PRs need my review?" → fetch notifications → narrate

The pattern is always: **fetch → analyze → script → visuals → narrate → compose → present**.
Adapt the visual style, narration tone, and length to the content and user preferences.
```

### 7.5. New capabilities to onboard to Livepeer network

For the email-to-video pipeline to run through Livepeer's payment network:

| Capability | Provider | model_id | Status | Onboarding |
|-----------|----------|----------|--------|------------|
| `text-summarization` | Gemini | `gemini/gemini-2.5-flash` | **Already registered** as `gemini-text` | None needed |
| `tts-narration` | fal.ai | `fal-ai/chatterbox-tts` | **Already registered** | Verify model not 404'd |
| `text-to-image` | fal.ai | `fal-ai/recraft/v4/pro/text-to-image` | **Already registered** | None needed |
| `video-compose` | fal.ai | `fal-ai/ffmpeg-api/compose` | **Not registered** | Add to byoc.yaml |
| `tts-lux` | fal.ai | `fal-ai/lux-tts` | **Not registered** | Add to byoc.yaml (48kHz, voice cloning) |

**New byoc.yaml entries:**
```yaml
capabilities:
  - name: video-compose
    model_id: fal-ai/ffmpeg-api/compose
    capacity: 4
    price_per_unit: 2
  - name: lux-tts
    model_id: fal-ai/lux-tts
    capacity: 4
    price_per_unit: 2
```

**New SDK service endpoint:**
```python
@app.post("/pipeline/compose-video")
async def compose_video(req: ComposeVideoRequest):
    """Compose images + audio into a video.
    Chains: text-to-image (N images) → TTS → fal ffmpeg-api/compose.
    """
    # Generate images
    images = await asyncio.gather(*[
        submit_byoc_job("text-to-image", {"prompt": scene.prompt})
        for scene in req.scenes
    ])
    # Generate narration
    audio = await submit_byoc_job("tts-narration", {"text": req.narration})
    # Compose
    return await submit_byoc_job("video-compose", {
        "tracks": [
            *[{"type": "image", "keyframes": [{"url": img.url, "timestamp": i*3000, "duration": 3000}]}
              for i, img in enumerate(images)],
            {"type": "audio", "keyframes": [{"url": audio.url, "timestamp": 0}]},
        ]
    })
```

### 7.6. Implementation tasks

| Task | Days | Description |
|------|------|-------------|
| MCP client in API route | 2 | Connect to user's MCP servers, discover tools, execute calls |
| Settings UI for MCP servers | 1.5 | Connect/disconnect, OAuth flow, custom URL input |
| Tool routing (local vs server) | 1.5 | Storyboard tools local, MCP tools server-side |
| Gmail OAuth flow | 1 | Pre-configured one-click connect for Gmail MCP |
| Daily briefing skill | 1 | `skills/daily-briefing.md` with adaptive rules |
| video-compose capability | 1 | Register `fal-ai/ffmpeg-api/compose` in BYOC, add SDK endpoint |
| E2E test: email → video | 1 | Mock Gmail, verify full pipeline |

### 7.7. Phase 7 acceptance criteria

```
# MCP tools:
Connect Gmail MCP → "search my inbox" → Claude returns email summaries
"Upload to YouTube" (not connected) → Claude suggests connecting YouTube
Connect mock YouTube → "upload this video" → tool call succeeds

# Daily briefing:
"Make me a daily email briefing video" (Gmail connected)
  → Gmail tool fetches emails
  → Claude writes narration script
  → create_media generates images + TTS + composes video
  → Video card on canvas with briefing

# Token budget with MCP:
10-tool MCP server connected → tool schemas add ≤ 1,500 tokens
MCP tool results compacted after use (same as storyboard tools)
```

**Context save:** Commit "Phase 7: MCP tools + daily briefing". Tag `v2.0.0`. Update CLAUDE.md with MCP architecture.

---

## Vercel Deployment Architecture

```
┌───────────────────────────────────────────────────────────┐
│  Vercel                                                    │
│                                                             │
│  ┌───────────────────────────────────────────────────┐    │
│  │  Next.js App (Static + Fluid Compute)              │    │
│  │                                                     │    │
│  │  Static:  / (storyboard SPA)                        │    │
│  │           /skills/*.md (agent skills)                │    │
│  │                                                     │    │
│  │  API Routes (Fluid Compute — up to 300s):           │    │
│  │                                                     │    │
│  │    POST /api/agent/chat                             │    │
│  │      → Connects to user's MCP servers               │    │
│  │      → Discovers all available tools                 │    │
│  │      → Calls Claude API with storyboard + MCP tools │    │
│  │      → Executes MCP tool calls server-side           │    │
│  │      → Streams results via SSE                       │    │
│  │      → Storyboard tool results routed to browser     │    │
│  │                                                     │    │
│  │    POST /api/mcp/connect                            │    │
│  │      → OAuth flow for Gmail, YouTube, etc.           │    │
│  │      → Returns tool list for connected server        │    │
│  │                                                     │    │
│  │    GET /api/health                                  │    │
│  └────────────────────┬──────────────┬─────────────────┘    │
│                       │              │                       │
└───────────────────────┼──────────────┼───────────────────────┘
                        │              │
            ┌───────────┘              └───────────┐
            ▼                                      ▼
  SDK Service                           MCP Servers
  (sdk.daydream.monster)                 ├── gmail.mcp.claude.com
  — inference, stream,                   ├── user's YouTube MCP
    training, compose                    ├── user's Slack MCP
  — called from browser                 └── any MCP server URL
    (CORS) for media tools                 (connected from API route)
```

**Vercel org:** Livepeer Foundation (same org as NaaP)
**Account:** `qiang@livepeer.org`
**Project:** `storyboard` → `storyboard.livepeer.org`

**Environment variables (managed via `vercel env`, NOT in vercel.json):**

| Variable | Where | Purpose |
|----------|-------|---------|
| `ANTHROPIC_API_KEY` | Server-only | Claude API proxy |
| `OPENAI_API_KEY` | Server-only | OpenAI plugin proxy (Phase 6) |
| `NEXT_PUBLIC_SDK_URL` | Client + Server | `https://sdk-a3.daydream.monster` |
| `NEXT_PUBLIC_DEFAULT_AGENT` | Client | `claude` |

**Key decisions:**
- Browser calls SDK service directly (existing CORS) — no Vercel proxy for media
- Agent API calls route through Vercel API routes (hides LLM API keys + executes MCP tools)
- MCP tool calls execute server-side in the API route (MCP servers may not support CORS)
- Skills are static `.md` files in `public/skills/` — no build step needed to edit them
- Canvas state is client-side only (Zustand + localStorage) — no database needed
- User MCP server configs stored in localStorage (URLs + OAuth tokens)
- Secrets managed via `vercel env` — linked project inherits from Livepeer Foundation team

---

## Token Efficiency Architecture

### The Problem

A naive implementation burns tokens fast:
- System prompt with all skills: ~3,000 tokens
- 9 tool schemas: ~2,000 tokens
- MCP tool schemas (Gmail=12 tools, YouTube=8, etc.): ~3,000 tokens
- Each tool result (image URL + metadata): ~200 tokens
- A 10-step storyboard workflow: 10 tool calls × 2 turns × (prompt + result) = ~20,000 tokens accumulated
- After 5 workflows in one session: ~100K+ tokens in conversation history

At Sonnet pricing ($3/$15 per M tokens), a heavy session could cost $1-3. More importantly, long contexts degrade Claude's tool-call accuracy. **Token efficiency is not just about cost — it's about quality.**

### Strategy: Make the SDK MCP Do the Heavy Lifting

The core principle: **Claude should reason and decide; the SDK should know and execute.** Don't teach Claude what every model can do — give it a single smart tool that figures it out.

#### Level 1: Smart SDK Tool (replaces model catalog in system prompt)

**Current approach (token-heavy):**
```
System prompt: "Here are 20 models with their capabilities, latency, quality scores,
chain constraints, size rules, prompt engineering tips for each..."
→ ~2,500 tokens in system prompt, EVERY turn

Claude reasons: "For a photorealistic landscape, I should use flux-pro with
width=1024, height=768, and describe lighting/camera angle..."
→ ~200 tokens of reasoning per tool call
```

**Efficient approach: `smart_inference` tool**
```
SDK MCP exposes ONE tool: smart_inference({
  intent: "photorealistic landscape for video chain",
  style_hint: "cinematic sunset",
  prompt: "vast mountain landscape at golden hour...",
  chain_next: "image-to-video"   // SDK handles size/format constraints
})

SDK returns: {
  model_used: "flux-pro",
  image_url: "https://...",
  width: 1024, height: 1024,    // auto-capped for video chain
  metadata: { latency_ms: 12000, quality_tier: "premium" }
}
```

Claude doesn't need to know model names, parameters, chain constraints, or size rules. The SDK encodes all that expertise. **Saves ~2,500 tokens from system prompt + ~200 tokens per tool call.**

#### Level 2: Compound Tools (reduce tool-call round-trips)

**Current approach (many round-trips):**
```
Turn 1: Claude → inference("text-to-image", "recraft-v4", "dragon...") → image_url
Turn 2: Claude → canvas_create("image", image_url, "Dragon") → ok
Turn 3: Claude → inference("img2img", "kontext-edit", "watercolor...", image_url) → image2_url
Turn 4: Claude → canvas_create("image", image2_url, "Watercolor Dragon") → ok
Turn 5: Claude → inference("image-to-video", "kling-i2v", "camera pan...", image2_url) → video_url
Turn 6: Claude → canvas_create("video", video_url, "Dragon Animation") → ok
= 6 tool calls, 12 message turns, ~6,000 tokens in tool results alone
```

**Efficient approach: SDK compound tools**
```
Turn 1: Claude → create_media({
  intent: "generate a dragon, restyle as watercolor, animate to video",
  steps: [
    { action: "generate", prompt: "majestic dragon...", style: "illustration" },
    { action: "restyle", prompt: "watercolor painting style", depends_on: 0 },
    { action: "animate", prompt: "camera slowly pans left", depends_on: 1 }
  ]
})

SDK executes all 3 steps, creates all canvas cards, returns:
{
  cards_created: ["Dragon_01", "Watercolor_02", "Animation_03"],
  summary: "Created 3 cards: dragon illustration → watercolor restyle → 4s animation"
}
= 1 tool call, 2 message turns, ~300 tokens total
```

**This is a 20x token reduction for multi-step workflows.**

#### Level 3: Adaptive Skill Loading (reduce system prompt)

**Current approach:** Load ALL skills into system prompt every turn.
```
System = base + text-to-image + image-editing + video + scope-lv2v + ...
= ~3,000 tokens, even when user just wants "upload to YouTube"
```

**Efficient approach: Two-phase skill loading**
```
Phase 1 — Lightweight system prompt (~500 tokens):
  "You are a creative director. You have tools for media generation,
   live streaming, canvas management, and external services.
   Use smart_inference for any media task — it handles model selection.
   For advanced scenarios, call load_skill(topic) to get detailed guidance."

Phase 2 — On-demand skill loading (only when needed):
  Claude: load_skill("scope-lv2v")  → returns skill content as tool result
  Claude: [now knows transition parameters, noise_scale recipes, etc.]
```

Skills are loaded as tool results (within conversation context), not as system prompt (repeated every turn). A skill loaded once costs tokens once; system prompt costs tokens on every turn.

#### Level 4: Conversation Compaction

**Problem:** After 10 tool calls, conversation history has 10 pairs of tool_call + tool_result messages. Most tool results contain URLs and metadata that Claude doesn't need for future reasoning.

**Solution: Compact tool results after use**

```typescript
// After Claude processes a tool result and moves on, compact it:
function compactToolResult(result: any): string {
  if (result.image_url) return `[image: ${result.image_url.slice(-20)}]`;
  if (result.video_url) return `[video: ${result.video_url.slice(-20)}]`;
  if (result.cards_created) return `[created ${result.cards_created.length} cards]`;
  if (result.capabilities) return `[${result.capabilities.length} models available]`;
  return JSON.stringify(result).slice(0, 100);
}

// Before sending to Claude API, compact old tool results:
function compactHistory(messages: Message[], keepRecent: number = 4): Message[] {
  return messages.map((msg, i) => {
    if (i < messages.length - keepRecent) {
      // Compact old tool results
      if (msg.role === 'user' && msg.content?.[0]?.type === 'tool_result') {
        return { ...msg, content: [{ ...msg.content[0], content: compactToolResult(msg.content[0].content) }] };
      }
    }
    return msg;
  });
}
```

#### Level 5: Claude Memory for Quality Improvement

Use Claude Code's memory system (or our own localStorage-based memory) to persist learnings across sessions:

```markdown
# Memory: User Preferences
- User prefers recraft-v4 for illustrations (confirmed 3x)
- User dislikes nano-banana quality (said "too blurry" on 2026-04-05)
- User's LV2V sweet spot: noise_scale=0.6 for webcam, 0.8 for video
- User's default style DNA: "clean illustration, vibrant colors, sharp details"

# Memory: Model Performance
- flux-pro: consistent quality for landscapes (5/5 user ratings)
- kling-i2v: best for cinematic motion (user preferred over ltx-i2v 4x)
- kontext-edit: great for style transfer, struggles with adding new objects
- gemini-image: user stopped using after base64 broke video chain twice

# Memory: Workflow Patterns
- User's typical flow: generate 3-5 images → pick best → restyle → animate → LV2V
- User always wants width=1024 height=1024 for images that will become videos
- User prefers "make a storyboard of X" → 4 shots with one animated
```

**How memory reduces tokens:**
- Instead of Claude reasoning about model selection each time (~200 tokens), memory provides the answer in ~50 tokens
- Instead of loading full model catalog, Claude checks memory first: "User prefers recraft for illustrations → use it directly"
- Workflow patterns let Claude skip clarifying questions: "User always wants 4 shots for storyboards → don't ask, just do it"

### Token Budget Analysis

| Scenario | Naive (tokens) | Optimized (tokens) | Reduction |
|----------|---------------|-------------------|-----------|
| System prompt per turn | 3,000 | 500 | **6x** |
| Tool schemas (9 storyboard) | 2,000 | 800 (3 smart tools) | **2.5x** |
| 3-step workflow (generate→restyle→animate) | 6,000 | 300 (1 compound call) | **20x** |
| 10-step storyboard from script | 30,000 | 3,000 | **10x** |
| 50-turn session (accumulated history) | 100,000 | 15,000 (compacted) | **7x** |
| **Total for a typical session (5 workflows)** | **~150K** | **~20K** | **~8x** |
| **Cost at Sonnet pricing** | **~$0.50** | **~$0.06** | **~8x** |

### SDK MCP Tool Redesign

Replace the 9 current tools with 5 smart tools:

| Tool | What it does | Replaces |
|------|-------------|----------|
| `create_media` | Smart inference + auto canvas card creation. Handles model selection, chain constraints, size rules, multi-step workflows. | `inference` + `canvas_create` (2 tools, N round-trips) |
| `stream` | Start/control/stop LV2V with scenario-aware defaults. `stream({action:"start", style:"dreamy webcam"})` auto-sets noise_scale, prompt, denoising. | `stream_start` + `stream_control` + `stream_stop` (3 tools) |
| `canvas` | Read/write canvas state. `canvas({action:"get"})` or `canvas({action:"remove", filter:"video"})`. | `canvas_create` + `canvas_update` + `canvas_get` (3 tools) |
| `load_skill` | Load a specific skill on-demand. Returns skill content as tool result. | Skills in system prompt (constant cost → on-demand cost) |
| `capabilities` | Returns a COMPACT summary (name + one-line description), not full schemas. | `capabilities` (same name, smaller response) |

**The `create_media` tool is the biggest win.** Claude says WHAT it wants; the SDK figures out HOW:

```typescript
// SDK MCP tool: create_media
{
  name: "create_media",
  description: "Create media (image, video, audio, edit, upscale) and add to canvas. Handles model selection, parameters, chain constraints, and canvas placement automatically.",
  parameters: {
    type: "object",
    properties: {
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            action: { enum: ["generate", "restyle", "animate", "upscale", "remove_bg", "tts", "compose_video", "v2v"] },
            prompt: { type: "string" },
            style_hint: { type: "string", description: "e.g. 'photorealistic', 'illustration', 'cinematic'" },
            depends_on: { type: "integer", description: "Index of prior step to use as input" },
            title: { type: "string" },
          },
          required: ["action", "prompt"]
        }
      }
    },
    required: ["steps"]
  }
}
```

### Evaluation Framework

#### Token consumption tracking (built into the API route)

```typescript
// app/api/agent/chat/route.ts — track per-session token usage
const usage = {
  session_id: sessionId,
  turns: 0,
  input_tokens: 0,
  output_tokens: 0,
  tool_calls: 0,
  tools_used: {},       // { create_media: 5, stream: 2, canvas: 3 }
  cache_hits: 0,        // prompt caching hits
  compacted_tokens: 0,  // tokens saved by compaction
};

// After each Claude API call:
usage.input_tokens += response.usage.input_tokens;
usage.output_tokens += response.usage.output_tokens;

// Expose to storyboard UI:
// Settings → Usage → "This session: 12,450 tokens (~$0.04)"
```

#### Quality evaluation (per-workflow)

After each workflow completes, the storyboard optionally asks:

```
Claude created 4 cards. Rate this result:
[1 ★] [2 ★] [3 ★] [4 ★] [5 ★]  [Skip]
```

Ratings are stored in memory:
```markdown
# Memory: Quality Ratings
- "generate dragon illustration" → recraft-v4 → 5★ (2026-04-05)
- "animate dragon" → kling-i2v → 4★ (2026-04-05)
- "webcam cyberpunk LV2V" → longlive noise_scale=0.7 → 3★ (needs lower noise)
```

Claude uses ratings to improve future model selection and parameter tuning.

#### A/B evaluation: naive vs optimized

Run the same 10 test prompts through both approaches:

| Test prompt | Naive tokens | Optimized tokens | Quality match? |
|------------|-------------|-----------------|----------------|
| "Create a dragon" | ~4,000 | ~800 | [ ] |
| "Dragon → watercolor → video" | ~12,000 | ~1,200 | [ ] |
| "4-shot storyboard of a battle scene" | ~35,000 | ~4,000 | [ ] |
| "Webcam LV2V cyberpunk" | ~6,000 | ~1,500 | [ ] |
| "Restyle card 1 as anime" | ~4,000 | ~600 | [ ] |
| "Daily email briefing video" | ~15,000 | ~3,000 | [ ] |

**Quality match criteria:** The optimized approach must:
- Select the same or better model for the task
- Produce output with equal or higher user rating
- Complete in fewer or equal wall-clock seconds
- Use correct parameters (size, format, chain constraints)

### Implementation — Where Each Level Fits in Phases

| Level | Phase | What changes |
|-------|-------|-------------|
| L1: Smart SDK tool (`create_media`) | **Phase 2** (Claude Plugin) | SDK service gets new `/mcp/create_media` endpoint; tool schema is lean |
| L2: Compound tools | **Phase 2** | `create_media` handles multi-step in one call |
| L3: Adaptive skill loading | **Phase 3** (Skills) | System prompt shrinks to 500 tokens; `load_skill` tool added |
| L4: Conversation compaction | **Phase 4** (UX Polish) | `compactHistory()` in ClaudePlugin before each API call |
| L5: Memory for quality | **Phase 5** (Wow Features) | Rating UI + memory persistence + memory injection into context |
| Evaluation framework | **Phase 6** (Production) | Token tracking in API route + quality ratings + A/B test suite |

### SDK MCP Endpoint for Smart Inference

```python
# sdk-service-build/app.py — new endpoint

@app.post("/mcp/create_media")
async def mcp_create_media(req: CreateMediaRequest):
    """Execute a multi-step media workflow. Handles model selection,
    chain constraints, size rules, and canvas card creation.

    This is the primary tool for the Claude agent — it encodes all
    model expertise so Claude doesn't need to carry it in context.
    """
    results = []
    for i, step in enumerate(req.steps):
        # Resolve input from prior step
        input_url = results[step.depends_on].url if step.depends_on is not None else None

        # Auto-select model based on action + style_hint
        model = _select_model(step.action, step.style_hint, chain_next=_peek_next(req.steps, i))

        # Auto-set parameters (size for video chains, format constraints)
        params = _build_params(step, model, input_url, chain_next=_peek_next(req.steps, i))

        # Execute inference
        result = await _run_inference(model, step.prompt, params)
        results.append(result)

    return {
        "cards": [{"title": s.title or f"Step {i+1}", "type": r.media_type, "url": r.url}
                  for i, (s, r) in enumerate(zip(req.steps, results))],
        "summary": f"Created {len(results)} media items",
    }

def _select_model(action, style_hint, chain_next):
    """Encode all model selection logic that used to live in Claude's system prompt."""
    if action == "generate":
        if style_hint and "photo" in style_hint: return "flux-pro"
        if style_hint and "illustration" in style_hint: return "recraft-v4"
        if style_hint and "fast" in style_hint: return "nano-banana"
        if chain_next in ("animate", "v2v"): return "recraft-v4"  # URL-returning, good quality
        return "flux-schnell"  # balanced default
    if action == "restyle": return "kontext-edit"
    if action == "animate":
        if style_hint and "cinematic" in style_hint: return "kling-i2v"
        return "ltx-i2v"  # fast default
    if action == "tts": return "chatterbox-tts"
    # ...etc

def _build_params(step, model, input_url, chain_next):
    """Encode chain constraints, size rules, format rules."""
    params = {"prompt": step.prompt}
    if input_url:
        params["image_url"] = input_url
    # Auto-cap size for video chains
    if chain_next in ("animate", "v2v") and model in ("recraft-v4", "flux-pro", "flux-dev"):
        params["width"] = 1024
        params["height"] = 1024
    return params
```

### Token Efficiency Completeness Assessment

| Requirement | Addressed? | How |
|-------------|-----------|-----|
| Reduce system prompt tokens | Yes | L3: Adaptive skill loading (3000→500 per turn) |
| Reduce tool schema tokens | Yes | L1+L2: 9 tools→5 smart tools (2000→800) |
| Reduce tool call round-trips | Yes | L2: Compound `create_media` (6 calls→1) |
| Reduce accumulated history | Yes | L4: Conversation compaction (100K→15K over session) |
| Improve model selection accuracy | Yes | L1: SDK encodes expertise + L5: Memory ratings |
| Reduce reasoning tokens | Yes | L1: Claude says "what" not "how" + L5: Memory shortcuts |
| Track and measure efficiency | Yes | Evaluation framework: per-session token tracking + A/B |
| Improve over time | Yes | L5: Memory persists ratings, preferences, workflow patterns |
| No quality regression | Yes | A/B evaluation: same prompts, compare tokens + quality |

**Remaining gap:** Prompt caching. Anthropic's API supports prompt caching — if the system prompt + tool schemas are identical across turns (which they are with L3), cached tokens cost 90% less. The API route should set `cache_control` on the system prompt block.

```typescript
// In API route — enable prompt caching
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
  tools: toolSchemas.map(t => ({ ...t, cache_control: { type: 'ephemeral' } })),
  messages: compactHistory(messages),
  stream: true,
});
```

With caching: the 500-token system prompt + 800-token tool schemas = 1,300 tokens cached. On subsequent turns, these cost ~130 tokens equivalent (90% discount). **Over a 20-turn session, this saves ~25,000 input tokens.**

### Infrastructure Changes Required (simple-infra)

The token optimization requires changes at every layer of the stack. Without these, the "smart tool" concept can't work — Claude would still need model knowledge in its context.

#### Layer 1: byoc.yaml — Rich Capability Metadata

**Current state:** Each capability has only `name`, `model_id`, `capacity`, `price_per_unit`. Zero semantic metadata.

**Required:** Add fields so the SDK service can make intelligent decisions without the client (or Claude) needing a model catalog.

```yaml
# environments/staging/byoc.yaml — BEFORE
capabilities:
  - name: recraft-v4
    model_id: fal-ai/recraft/v4/pro/text-to-image
    capacity: 4
    price_per_unit: 2

# environments/staging/byoc.yaml — AFTER
capabilities:
  - name: recraft-v4
    model_id: fal-ai/recraft/v4/pro/text-to-image
    capacity: 4
    price_per_unit: 2
    # ── New metadata (used by SDK smart tools) ──
    type: image                     # image | video | audio | stream | text
    sub_type: text-to-image         # text-to-image | image-to-image | image-to-video | etc.
    output_format: url              # url | base64 (critical for chain constraints)
    requires_input: false           # true for editing/i2v/v2v models
    input_types: []                 # ["image"] for img2img, ["video"] for v2v
    latency_tier: medium            # fast (<3s) | medium (3-15s) | slow (>15s)
    quality_tier: high              # draft | good | high | best
    best_for:                       # natural language tags for smart routing
      - illustration
      - typography
      - sharp details
    prompt_style: descriptive       # descriptive | instruction | motion
    max_output_size: null           # null = unlimited, or {width: 1024, height: 1024}
    chain_restrictions:             # explicit chain rules
      can_feed_video: true          # URL output, safe for video pipelines
      can_feed_editing: true        # can be used as source for kontext/reve
```

**Full enriched catalog (all 12 current capabilities):**

| name | type | sub_type | output_format | requires_input | latency_tier | quality_tier | best_for |
|------|------|----------|---------------|----------------|-------------|-------------|----------|
| nano-banana | image | text-to-image | url | false | fast | draft | drafts, previews |
| recraft-v4 | image | text-to-image | url | false | medium | high | illustration, typography |
| flux-schnell | image | text-to-image | url | false | fast | good | balanced, general |
| flux-dev | image | text-to-image | url | false | medium | high | quality, detailed |
| gemini-image | image | text-to-image | base64 | false | medium | high | creative, photorealistic |
| kontext-edit | image | image-to-image | url | true | medium | high | style transfer, editing |
| bg-remove | image | image-to-image | url | true | fast | high | background removal |
| topaz-upscale | image | image-to-image | url | true | medium | best | upscaling, enhancement |
| ltx-t2v | video | text-to-video | url | false | slow | good | text-to-video |
| ltx-i2v | video | image-to-video | url | true | slow | good | animation, motion |
| chatterbox-tts | audio | text-to-speech | url | false | medium | good | dialogue, narration |
| gemini-text | text | text-to-text | text | false | fast | high | summarization, planning |

**Deployment:** `./scripts/deploy-byoc.sh --env staging` reads the enriched YAML. The adaptor registration (`POST /capability/register`) doesn't need the new fields — they're consumed only by the SDK service.

#### Layer 2: Inference Adaptor — Pass Metadata Through

**Current state:** The adaptor registers capabilities with the orchestrator using only `name`, `url`, `capacity`, `price_per_unit`. The enriched metadata lives in byoc.yaml but never reaches the SDK service.

**Required:** The adaptor should serve the full metadata via its `/capabilities` endpoint.

```python
# livepeer-inference-adapter/livepeer_adapter/proxy.py
# Currently returns: [{"name": "recraft-v4", "model_id": "fal-ai/...", "capacity": 4}]
# Needs to return: [{"name": "recraft-v4", "model_id": "...", "type": "image",
#                     "sub_type": "text-to-image", "output_format": "url", ...}]
```

**Change:** When the adaptor loads `CAPABILITIES_JSON` (injected by deploy script from byoc.yaml), it preserves ALL fields, not just the registration fields. The `GET /capabilities` endpoint returns the full metadata.

**Impact:** The SDK service's `/capabilities` call to the adaptor now gets rich metadata without any local hardcoding.

#### Layer 3: SDK Service (app.py) — Smart Endpoints

**3a. Enriched `/capabilities` response**

```python
# BEFORE — app.py:195
class CapabilityItem(BaseModel):
    name: str
    model_id: str
    capacity: int = 0
    source: str = ""

# AFTER
class CapabilityItem(BaseModel):
    name: str
    model_id: str
    capacity: int = 0
    source: str = ""
    # ── New fields from enriched byoc.yaml ──
    type: str = ""                  # image | video | audio | stream | text
    sub_type: str = ""              # text-to-image | image-to-video | etc.
    output_format: str = "url"      # url | base64
    requires_input: bool = False
    input_types: list[str] = []
    latency_tier: str = "medium"    # fast | medium | slow
    quality_tier: str = "good"      # draft | good | high | best
    best_for: list[str] = []
    prompt_style: str = "descriptive"
    chain_restrictions: dict = {}
```

This eliminates the client-side `MODELS` dict (2,500 tokens in Claude's system prompt) and the `DEFAULT_CAPABILITY_CATALOG` hardcoded string (another 1,500 tokens in `/enrich/v2` prompt).

**3b. New `/smart/inference` endpoint — model selection server-side**

```python
@app.post("/smart/inference")
async def smart_inference(req: SmartInferenceRequest):
    """Intelligent inference — SDK selects the best model based on intent.

    Claude calls this ONE tool instead of reasoning about 20 models.
    All model expertise is encoded here, not in Claude's context.
    """
    caps = await get_capabilities()  # live catalog with metadata

    # Select model based on intent + constraints
    model = _select_best_model(
        caps,
        action=req.action,           # "generate" | "restyle" | "animate" | "upscale" | "tts" | ...
        style_hint=req.style_hint,   # "photorealistic" | "illustration" | "cinematic" | "fast"
        chain_next=req.chain_next,   # if output feeds another model, apply constraints
        user_preference=req.preference,  # from Claude memory: "user prefers recraft"
    )

    # Auto-build params with chain constraints
    params = _auto_params(model, req, caps)

    # Run inference through BYOC
    result = await _run_inference(model.name, req.prompt, params, request)

    return {
        "model_used": model.name,
        "quality_tier": model.quality_tier,
        "latency_ms": int((time.time() - t0) * 1000),
        **result,  # image_url / video_url / audio_url / text
    }

def _select_best_model(caps, action, style_hint, chain_next, user_preference):
    """All the intelligence that used to be in Claude's system prompt."""
    candidates = [c for c in caps if c.sub_type == _action_to_subtype(action)]

    # Filter by chain constraints
    if chain_next in ("animate", "v2v"):
        candidates = [c for c in candidates if c.output_format == "url"]
        # Also cap output size
    if action in ("restyle", "upscale", "bg-remove"):
        candidates = [c for c in candidates if c.requires_input]

    # Score by preference
    if user_preference:
        for c in candidates:
            if c.name == user_preference:
                return c

    # Score by style hint
    if style_hint:
        for c in candidates:
            if any(style_hint.lower() in bf for bf in c.best_for):
                return c

    # Fallback: highest quality
    tier_rank = {"best": 4, "high": 3, "good": 2, "draft": 1}
    candidates.sort(key=lambda c: tier_rank.get(c.quality_tier, 0), reverse=True)
    return candidates[0] if candidates else None
```

**3c. New `/smart/compose` endpoint — multi-step pipeline server-side**

```python
@app.post("/smart/compose")
async def smart_compose(req: ComposeRequest):
    """Execute a multi-step media workflow. Claude sends one request,
    SDK handles model selection, chain constraints, size rules,
    and executes all steps in sequence/parallel as appropriate.

    Example: { steps: [
      { action: "generate", prompt: "dragon", style_hint: "illustration" },
      { action: "restyle", prompt: "watercolor", depends_on: 0 },
      { action: "animate", prompt: "camera pan left", depends_on: 1 }
    ]}
    Returns: { results: [{model, url, type}, ...], summary: "Created 3 items" }
    """
    results = []
    for i, step in enumerate(req.steps):
        input_url = results[step.depends_on]["url"] if step.depends_on is not None else None
        chain_next = req.steps[i + 1].action if i + 1 < len(req.steps) else None

        # Smart model selection with chain awareness
        model = _select_best_model(caps, step.action, step.style_hint, chain_next, step.preference)

        # Auto-params
        params = _auto_params(model, step, caps)
        if input_url:
            params["image_url" if model.sub_type != "video-to-video" else "video_url"] = input_url

        result = await _run_inference(model.name, step.prompt, params, request)
        results.append({"model": model.name, "type": model.type, **result})

    return {
        "results": results,
        "summary": f"Created {len(results)} items using {', '.join(r['model'] for r in results)}",
    }
```

**3d. New `/smart/stream` endpoint — scenario-aware LV2V**

```python
@app.post("/smart/stream")
async def smart_stream(req: SmartStreamRequest):
    """Start/control LV2V stream with scenario-aware defaults.

    Claude says: stream({action: "start", scenario: "dreamy webcam"})
    SDK translates to: noise_scale=0.5, prompt="soft dreamy ethereal...",
                       denoising_step_list=[1000,750,500,250], pipeline="longlive"
    """
    SCENARIOS = {
        "dreamy": {"noise_scale": 0.5, "prompt_prefix": "soft dreamy ethereal "},
        "cyberpunk": {"noise_scale": 0.7, "prompt_prefix": "neon cyberpunk "},
        "subtle": {"noise_scale": 0.3, "prompt_prefix": "gentle "},
        "wild": {"noise_scale": 0.95, "prompt_prefix": "psychedelic vivid "},
        "stable": {"noise_scale": 0.7, "kv_cache_attention_bias": 0.8},
        "responsive": {"noise_scale": 0.7, "kv_cache_attention_bias": 0.1},
    }
    if req.action == "start":
        scenario = SCENARIOS.get(req.scenario, {})
        return await stream_start(...)  # with scenario defaults applied
    elif req.action == "control":
        return await stream_control(...)
    elif req.action == "stop":
        return await stream_stop(...)
```

#### Layer 4: Serverless Proxy — No Changes Needed

The proxy's job is to route `model_id` → provider API call. It doesn't need to know about metadata, chain constraints, or model selection. Those are handled by the SDK service layer above it.

The only proxy change would be adding new providers (e.g., Replicate for PixVerse/Runway/Kling, or direct API integrations for Veo3/Sora). Each new provider is a Python class implementing `InferenceProvider.inference()`:

| Provider | Models | Status |
|----------|--------|--------|
| fal-ai | flux, recraft, ltx, kontext, bg-remove, topaz, chatterbox, ffmpeg-compose | Already supported |
| gemini | gemini-2.5-flash, gemini-2.5-flash-image | Already supported |
| replicate | PixVerse, Kling, MiniMax | Add `replicate` provider class |
| runway | Gen-4 | Add `runway` provider class (custom API) |
| google | Veo3 | Via gemini provider (predictLongRunning) |

#### Layer 5: Orchestrator (go-livepeer) — No Changes Needed

The orchestrator handles payment validation and routing. The smart inference logic lives entirely in the SDK service. No go-livepeer changes required.

### Infrastructure Change Summary

| Component | File(s) | Change | Effort | Token Impact |
|-----------|---------|--------|--------|-------------|
| **byoc.yaml** | `environments/staging/byoc.yaml` | Add 10 metadata fields per capability | 0.5 day | Enables L1 (eliminates MODELS dict from Claude context) |
| **deploy-byoc.sh** | `scripts/deploy-byoc.sh` | Pass enriched YAML as `CAPABILITIES_JSON` | 0.5 day | Metadata reaches adaptor |
| **Inference Adaptor** | `NaaP/containers/livepeer-inference-adapter/` | Preserve all YAML fields in `/capabilities` response | 0.5 day | Metadata reaches SDK service |
| **SDK CapabilityItem** | `sdk-service-build/app.py` | Extend Pydantic model with 10 new fields | 0.5 day | `/capabilities` returns rich metadata |
| **SDK `/smart/inference`** | `sdk-service-build/app.py` | New endpoint: model selection + auto-params | 2 days | **L1: Eliminates ~2,500 tokens from system prompt** |
| **SDK `/smart/compose`** | `sdk-service-build/app.py` | New endpoint: multi-step pipeline execution | 1.5 days | **L2: 6 tool calls → 1 (saves ~5,000 tokens per workflow)** |
| **SDK `/smart/stream`** | `sdk-service-build/app.py` | New endpoint: scenario-aware LV2V | 1 day | **Eliminates scope-lv2v.md from Claude context unless advanced use** |
| **Remove `DEFAULT_CAPABILITY_CATALOG`** | `sdk-service-build/app.py:493–519` | Delete stale hardcoded catalog | 0.5 day | **Eliminates 1,500 tokens from /enrich/v2 prompt** |
| **Total** | | | **~7 days** | **~12,000 tokens saved per session** |

### Infrastructure Phase Integration

These changes fit into the existing phases:

| Phase | Infrastructure Work |
|-------|-------------------|
| **Phase 0** (Week 0) | Enrich `byoc.yaml` with metadata. Update `deploy-byoc.sh`. Update adaptor to pass metadata through. Deploy. |
| **Phase 2** (Week 2) | Build `/smart/inference` and `/smart/compose` on SDK service. Claude plugin uses these instead of raw `/inference`. |
| **Phase 3** (Week 3) | Build `/smart/stream` with scenario presets. Remove `DEFAULT_CAPABILITY_CATALOG`. Update `/enrich/v2` to use live enriched caps. |
| **Phase 6** (Week 7) | Add Replicate/Runway providers to proxy. Register PixVerse, Kling-3, Veo3 in byoc.yaml with metadata. |

### Validation: Is Token Optimization Fully Met?

After infrastructure changes, walk through a real workflow to verify:

**Scenario: "Create a 4-shot dragon storyboard with animation"**

**Without optimization (current):**
```
System prompt: 3,000 tokens (full model catalog + all skills)
Tool schemas: 2,000 tokens (9 tools)
Turn 1: Claude reasons about model selection (200 tokens) → inference call → result (200 tokens)
Turn 2: canvas_create → result (100 tokens)
...repeat for 8 steps (4 images + 1 restyle + 1 animate + 2 canvas cards)...
Total: ~3,000 + 2,000 + (8 × 500) = ~9,000 tokens per turn × 8 turns
Accumulated: ~72,000 tokens
```

**With full optimization:**
```
System prompt: 500 tokens (lightweight — no model catalog)
Tool schemas: 400 tokens (2 smart tools: create_media + canvas)
Turn 1: Claude → create_media({steps: [4 generates + 1 restyle + 1 animate]}) → 1 compound result (300 tokens)
Turn 2: Claude says "Here's your storyboard" (end_turn)
Total: 500 + 400 + 300 + 200 = ~1,400 tokens
Accumulated: ~1,400 tokens
```

**Reduction: 72,000 → 1,400 = 51x**

Even with conversation compaction and caching in the "without" case, the compound tool approach is fundamentally better because it eliminates round-trips entirely.

| Check | Status |
|-------|--------|
| Model catalog removed from Claude context? | Yes — SDK `/smart/inference` encodes selection |
| Chain constraints handled server-side? | Yes — `_auto_params` caps size, blocks base64→video |
| Multi-step = 1 tool call? | Yes — `/smart/compose` handles N steps |
| LV2V params = scenarios not raw values? | Yes — `/smart/stream` translates scenarios |
| `/capabilities` returns rich metadata? | Yes — adaptor passes through from enriched byoc.yaml |
| Stale `DEFAULT_CAPABILITY_CATALOG` removed? | Yes — replaced by live enriched caps |
| New providers (PixVerse, Kling, Veo3) addable? | Yes — add to byoc.yaml with metadata, add proxy provider class |
| Prompt caching works? | Yes — system prompt + tool schemas are stable across turns |
| Conversation compaction works? | Yes — old tool results compacted to summaries |
| Quality evaluation tracks improvement? | Yes — per-workflow ratings + A/B test suite |

---

## Infrastructure Isolation — Dual System Architecture

**Iron rule:** The existing simple-infra deployment (SDK, BYOC, orch-serverless, signers) is NEVER touched. Storyboard-a3 spins up its own parallel infrastructure.

### What exists (DO NOT TOUCH)

| VM | Role | Domain | Status |
|----|------|--------|--------|
| signer-staging-1/2 | Shared signers | signer.daydream.live | **Shared — no change** |
| orch-staging-1/2 | AI-Serverless (Scope LV2V) | *.daydream.monster | **DO NOT TOUCH** |
| byoc-staging-1 | BYOC orch + adaptor + proxy | byoc-staging-1.daydream.monster | **DO NOT TOUCH** |
| sdk-staging-1 | SDK service (non-MCP) | sdk.daydream.monster | **DO NOT TOUCH** |

### What storyboard-a3 creates (NEW)

| VM | Role | Domain | Notes |
|----|------|--------|-------|
| sdk-a3-staging-1 | SDK service with smart tools + MCP | sdk-a3.daydream.monster | New VM, new Docker image tag |
| byoc-a3-staging-1 | BYOC orch + adaptor + proxy (enriched metadata) | byoc-a3-staging-1.daydream.monster | New VM, enriched byoc-a3.yaml |

**Shared resources (read-only access):**
- Signers (`signer.daydream.live`) — shared, both SDK instances use the same signer
- AI-Serverless Orchs (`orch-staging-1/2`) — shared for LV2V (Scope streams)
- Arbitrum RPC, wallets — shared
- fal.ai API keys — can share or use separate keys

### Branching Strategy

| Repo | Branch | Purpose |
|------|--------|---------|
| `livepeer/livepeer-python-gateway` | `feat/storyboard-a3` (off `main`) | SDK changes for smart tools, enriched capabilities |
| `livepeer/simple-infra` | `feat/storyboard-a3-infra` (off `main`) | New VM configs, enriched byoc-a3.yaml, deploy scripts |
| `livepeer/storyboard` | `main` | The new storyboard app (Vercel) |

### Configuration Files

```
# simple-infra — new files (don't modify existing)
environments/staging/
  byoc.yaml           # EXISTING — unchanged
  byoc-a3.yaml        # NEW — enriched metadata, new capabilities
  sdk-a3.yaml         # NEW — SDK with smart tools config

docker-compose/
  sdk-service.yaml          # EXISTING — unchanged
  sdk-service-a3.yaml       # NEW — uses new image tag

scripts/
  deploy-byoc.sh            # EXISTING — unchanged
  deploy-storyboard-a3.sh   # NEW — deploys byoc-a3 + sdk-a3 VMs
```

### Deployment Flow

```bash
# 1. Create new VMs (Phase 0)
gcloud compute instances create sdk-a3-staging-1 \
  --project=livepeer-simple-infra --zone=us-west1-b \
  --machine-type=e2-small --image-family=ubuntu-2204-lts ...

gcloud compute instances create byoc-a3-staging-1 \
  --project=livepeer-simple-infra --zone=us-west1-b \
  --machine-type=e2-medium --image-family=ubuntu-2204-lts ...

# 2. Deploy BYOC stack with enriched metadata
./scripts/deploy-storyboard-a3.sh --env staging

# 3. DNS
# sdk-a3.daydream.monster → sdk-a3-staging-1 IP
# byoc-a3-staging-1.daydream.monster → byoc-a3-staging-1 IP

# 4. Gateway SDK branch
cd /Users/qiang.han/Documents/mycodespace/livepeer-python-gateway
git checkout main && git pull
git checkout -b feat/storyboard-a3
# ... add smart tool endpoints, enriched CapabilityItem ...
# Build Docker image with tag :a3-latest (not :latest)
docker buildx build --platform linux/amd64 \
  -t us-docker.pkg.dev/livepeer-simple-infra/simple-infra/sdk-service:a3-latest --push .
```

### Environment Configuration

```bash
# sdk-a3-staging-1 — /opt/sdk/.env
SDK_IMAGE=us-docker.pkg.dev/livepeer-simple-infra/simple-infra/sdk-service:a3-latest
BYOC_ORCH_URL=https://byoc-a3-staging-1.daydream.monster:8935
ADAPTER_URLS=http://<byoc-a3-staging-1-internal-ip>:9090
SIGNER_URL=https://signer.daydream.live              # shared signer
DISCOVERY_URL=https://signer.daydream.live/discovery/staging.json  # shared discovery
LV2V_ORCH_URLS=https://orch-staging-1.daydream.monster:8935  # shared LV2V orchs
```

### Storyboard-a3 Vercel Config

Deployed under Livepeer Foundation Vercel org (`qiang@livepeer.org`).
Env vars set via `vercel env add` — NOT committed to repo.

```bash
# Set once during Phase 0.6:
vercel env add NEXT_PUBLIC_SDK_URL production   # → https://sdk-a3.daydream.monster
vercel env add ANTHROPIC_API_KEY production     # → sk-ant-...
```

### Verification Checklist

Before each deployment:
- [ ] `sdk.daydream.monster` still responds (old SDK untouched)
- [ ] `byoc-staging-1.daydream.monster` still responds (old BYOC untouched)
- [ ] `orch-staging-1/2` still serve Scope LV2V (never touched)
- [ ] `signer.daydream.live` still works (shared, read-only)
- [ ] New `sdk-a3.daydream.monster` responds to `/health`
- [ ] New `byoc-a3-staging-1` registers capabilities with enriched metadata
- [ ] Storyboard-a3 on Vercel connects to new SDK, not old

---

## Migration Strategy (no regression)

1. **Phase 0:** New repo + new VMs. Migrate storyboard.html → Next.js. Deploy to Vercel pointing to new SDK. Existing infra untouched.
2. **Phase 1:** Add plugin interface. Current behavior is `BuiltInPlugin`. No user-visible change.
3. **Phase 2:** Add Claude plugin + smart SDK endpoints on new SDK VM.
4. **Phase 3-5:** Add skills, UX polish, wow features. All on new infra.
5. **Phase 6:** OpenAI plugin. Production polish.
6. **Phase 7:** Universal MCP tools. Daily briefing. New providers on byoc-a3.
7. **simple-infra:** Existing storyboard.html + sdk.daydream.monster unchanged. Add banner: "Try the new storyboard at storyboard.livepeer.org"

Each phase has its own PR with:
- [ ] Code review by at least 1 reviewer
- [ ] Playwright E2E tests pass
- [ ] Vercel preview deployment tested
- [ ] No regression checklist on EXISTING infra (sdk.daydream.monster, byoc-staging-1, orch-staging-1/2)
- [ ] New infra health checks pass

---

## UX Design Principles

1. **Chat is the command center.** Every action starts or ends in chat. Context menus route to chat.
2. **Show, don't tell.** Cards appear on canvas before Claude explains them.
3. **One-click magic, infinite depth.** Quick action buttons → chat for nuance → parameters for experts.
4. **The canvas tells the story.** Dependency arrows = creative lineage. Layout = narrative order.
5. **Never lose work.** Auto-save conversation + canvas state. Every generation is a card.
6. **Connect once, use everywhere.** MCP servers are connected once in settings; Claude uses them naturally whenever relevant — no per-feature configuration.

---

## Risk Register

| Risk | Impact | Likelihood | Mitigation | Fallback |
|------|--------|-----------|------------|----------|
| Phase 0 migration takes 2x longer | Delays all phases | High | Break into 4 milestones, test each independently | Ship canvas-only first, add chat in Phase 0.5b |
| Smart tool picks wrong model | User frustration | Medium | `model_override` parameter + `raw_inference` fallback | User says "use flux-pro" → Claude passes override |
| Anthropic API rate limits | Session interrupted | Medium | Retry with backoff (3x). Use Haiku for simple tasks. | Switch to BuiltInPlugin (no Claude API needed) |
| Scope LV2V protocol changes | Streams break | Low | SDK service abstracts protocol; storyboard never calls orch directly | Fall back to existing LV2V code in BuiltInPlugin |
| MCP server OAuth tokens expire | Tool calls fail | Medium | Detect 401 → prompt user to reconnect | Show "Reconnect [Service]" button in chat |
| Token costs exceed user budget | Unexpected charges | Medium | Budget controls (Phase 2.7), daily limit, warning at 80% | Hard cap at daily limit; user must increase |
| New Claude session loses context | Wasted time re-reading | High | Context saves at every phase boundary (see Protocol above) | CLAUDE.md + status.md + descriptive commits |
| Vercel API route timeout (300s) | Complex workflows fail | Low | Long-running: return job ID, poll for result | Stream partial results as they complete |

---

## Success Metrics

| Metric | Current (storyboard.html) | Target (Phase 7) |
|--------|---------------------------|-------------------|
| Steps to create image+video storyboard | 3 messages + manual | 1 sentence |
| Model selection accuracy | ~60% (regex) | ~95% (Claude reasoning) |
| Error recovery | single-shot replan | multi-turn conversational |
| LV2V parameter quality | defaults only | expert per-scenario |
| Time to first output | ~15s | ~8s (streaming + parallel) |
| Deployment | `npx serve` (local) | Vercel (global CDN) |
| External integrations | 0 | Unlimited (any MCP server) |
| "Upload to YouTube" | impossible | 1 sentence |
| "Daily email briefing video" | impossible | 1 sentence + Gmail connected |
