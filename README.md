# Storyboard

An agent-powered creative platform built on [Livepeer](https://livepeer.org). Chat with AI to generate, edit, animate, and live-stream media — all on an infinite canvas.

**Live:** https://storyboard-rust.vercel.app

## What It Does

Type a prompt, and the agent orchestrates 40+ AI models to produce media on a visual canvas:

```
"Create a 6-scene story about a brave knight, animate the best scene,
 and start a live stream with cyberpunk style"
```

The agent plans, selects models, runs inference in parallel, and places results as draggable cards connected by dependency arrows.

## Features

- **Generate** — images, videos, audio, 3D models from text prompts
- **Edit** — restyle, upscale, remove background, replace objects, LEGO/logo/isometric styles
- **Animate** — image → video via Seedance 2.0, Veo, LTX with automatic fallback chains
- **Talking Video** — generate speech + animate face (`/talk`)
- **Live Stream** — real-time LV2V with Scope pipeline + prompt traveling (`/stream`)
- **Stories** — 6-scene illustrated stories with style consistency (`/story`)
- **Films** — 4-shot mini-films with camera directions (`/film`)
- **Projects** — manage, replay, and organize creative projects (`/project`)
- **Voice Clone** — clone voice from audio sample for TTS
- **Image Analysis** — Gemini Vision extracts style/characters/mood (`/analyze`)
- **Episode Groups** — drag cards into episodes, context overrides

Type `/help` for all 25+ slash commands.

---

## Architecture

```
┌───────────────────────────────────────────────────────────┐
│                    Your Application                        │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              @livepeer/creative-kit                  │  │
│  │  ArtifactStore · ChatPanel · InfiniteBoard          │  │
│  │  CommandRouter · CapabilityResolver · IntentClassifier│  │
│  └───────────────────────┬─────────────────────────────┘  │
│                          │                                 │
│  ┌───────────────────────┴─────────────────────────────┐  │
│  │                @livepeer/agent                       │  │
│  │  AgentRunner · ToolRegistry · WorkingMemory          │  │
│  │  GeminiProvider · ClaudeProvider · LivepeerProvider   │  │
│  └───────────────────────┬─────────────────────────────┘  │
└──────────────────────────┼────────────────────────────────┘
                           │
┌──────────────────────────┴────────────────────────────────┐
│                  Livepeer Infrastructure                    │
│                                                            │
│  SDK Service (sdk.daydream.monster)                        │
│    /inference · /capabilities · /llm/chat                  │
│    /stream/start · /stream/publish · /stream/control       │
│         │                                                  │
│  BYOC Orchestrator (go-livepeer)                          │
│    40 capabilities · fal.ai adapter · payment tickets      │
│         │                                                  │
│  Scope Orchestrators (LV2V)                               │
│    longlive pipeline · real-time video transform            │
│         │                                                  │
│  AI Model Providers                                        │
│    fal.ai · Gemini · ByteDance · Tripo3D · xAI            │
└────────────────────────────────────────────────────────────┘
```

### Three Layers

**Layer 0 — Agent SDK** (`@livepeer/agent`)
Provider-agnostic agent runtime. AgentRunner manages the LLM ↔ Tool loop. Swap providers (Gemini, Claude, OpenAI, Livepeer) without changing app code. Working memory (800 token budget) + session memory (queryable logs).

**Layer 1 — Creative Kit** (`@livepeer/creative-kit`)
Reusable framework for creative AI apps. ArtifactStore (canvas state), ProjectPipeline (batch generation), CommandRouter (slash commands), CapabilityResolver (model selection + fallback chains), UI components (InfiniteBoard, ChatPanel, ArtifactCard).

**Layer 2 — Applications**
- **Storyboard** — Professional creative workspace (this app)
- **Creative Lab** — Educational app for kids 8-16 (`apps/creative-lab/`)

### LLM Providers

| Provider | Route | API Key |
|----------|-------|---------|
| Gemini (default) | `/api/agent/gemini` → Google API | `GEMINI_API_KEY` |
| Claude | `/api/agent/chat` → Anthropic API | `ANTHROPIC_API_KEY` |
| OpenAI | `/api/agent/openai` → OpenAI API | `OPENAI_API_KEY` |
| **Livepeer** | `/api/llm/chat` → SDK → Gemini/Claude/OpenAI | `DAYDREAM_API_KEY` only |

The Livepeer provider routes all LLM calls through Livepeer infrastructure — one API key for everything.

### AI Capabilities (40 models)

| Category | Models |
|----------|--------|
| Image | flux-dev, flux-schnell, recraft-v4, gemini-image, seedream-5-lite, nano-banana, flux-flex |
| Edit | kontext-edit, flux-fill |
| Video T2V | veo-t2v, ltx-t2v, pixverse-t2v |
| Video I2V | seedance-i2v, seedance-i2v-fast, veo-i2v, ltx-i2v, pixverse-i2v, kling-i2v |
| TTS | chatterbox-tts, gemini-tts, inworld-tts, grok-tts |
| 3D | tripo-t3d, tripo-i3d, tripo-mv3d |
| Other | bg-remove, topaz-upscale, talking-head, face-swap, lipsync, music, sfx |

All models have automatic fallback chains — if one rejects (content policy, size limit), the next sibling model tries automatically.

---

## Quick Start

```bash
git clone https://github.com/livepeer/storyboard.git
cd storyboard
npm install
npm run dev          # Storyboard on http://localhost:3000
```

### Creative Lab (kids app)

```bash
cd apps/creative-lab
npm run dev          # Creative Lab on http://localhost:3001
```

### Commands

```bash
npm run dev          # Development server
npm run build        # Production build
npm test             # Unit tests (481 tests)
npm run test:e2e     # Playwright E2E tests
```

### Configuration

Click the gear icon to configure:
- **SDK Service URL** — `https://sdk.daydream.monster` (default)
- **API Key** — Daydream API key for inference

---

## Project Structure

```
storyboard/
├── packages/
│   ├── agent/                   # @livepeer/agent — AgentRunner, providers, memory
│   ├── creative-kit/            # @livepeer/creative-kit — stores, routing, UI
│   ├── agent-pack-canvas/       # Canvas tools for agent
│   └── agent-pack-projects/     # Project tools for agent
├── app/                         # Next.js App Router
│   ├── page.tsx                 # Main page + plugin registration
│   └── api/
│       ├── agent/               # LLM proxy routes (gemini, chat, openai)
│       ├── llm/chat/            # Livepeer unified LLM endpoint
│       ├── mcp/                 # MCP proxy (discover, call, auth)
│       └── upload/              # GCS file upload
├── lib/
│   ├── agents/                  # Agent plugins (gemini, claude, openai, livepeer)
│   ├── tools/                   # 21 storyboard tools (create_media, scope_*, project_*)
│   ├── canvas/                  # Canvas store + types (extends creative-kit Artifact)
│   ├── projects/                # Project store + /project commands
│   ├── story/                   # /story generator + StoryCard
│   ├── film/                    # /film generator + FilmCard
│   ├── stream-cmd/              # /stream planner + prompt traveling
│   ├── stream/                  # LV2V session (scope params, graphs, frame extraction)
│   ├── layout/                  # Layout engine (grid, narrative, episode, project grouping)
│   ├── skills/                  # Slash command router + 23 skills
│   ├── sdk/                     # SDK client (inference, capabilities)
│   └── mcp/                     # MCP tool discovery + execution
├── components/
│   ├── canvas/                  # InfiniteCanvas, Card, ContextMenu, CameraWidget
│   └── chat/                    # ChatPanel, MessageBubble, StoryCard, FilmCard
├── apps/
│   └── creative-lab/            # Kids educational app (missions, gallery, safety)
├── skills/                      # 23 skill files (.md) — agent system prompts
├── tests/
│   ├── unit/                    # Vitest (481 tests)
│   └── e2e/                     # Playwright
└── docs/
    ├── how-to-agent-sdk-arch.md # Architecture guide for building creative apps
    └── superpowers/             # Design specs + implementation plans
```

## Documentation

| Document | What it covers |
|----------|---------------|
| [`docs/how-to-agent-sdk-arch.md`](docs/how-to-agent-sdk-arch.md) | How to build creative apps with Agent SDK + Creative Kit + Livepeer |
| [`CLAUDE.md`](CLAUDE.md) | Full project instructions — infrastructure, capabilities, debugging |
| [`docs/key-insights-scope.md`](docs/key-insights-scope.md) | LV2V debugging guide (Scope pipeline) |
| [`docs/superpowers/specs/`](docs/superpowers/specs/) | Design specs for major features |
| [`docs/superpowers/plans/`](docs/superpowers/plans/) | Implementation plans |

## License

Copyright Livepeer Foundation.
