# Storyboard

An agent-powered creative tool for [Livepeer](https://livepeer.org). Artists chat with an AI assistant to generate, edit, animate, and live-stream media — all on an infinite canvas.

**Try it:** https://storyboard-rust.vercel.app

## What It Does

Type a natural language prompt, and the agent orchestrates Livepeer's AI model network to produce media artifacts on a visual canvas:

```
"Create a 4-shot storyboard of a knight fighting a dragon,
 animate the best shot, and start a live stream with cyberpunk style"
```

The agent plans the work, selects models, runs inference in parallel, and places results as draggable cards connected by dependency arrows — all in under 2 minutes.

## User Stories

**Generate** — "Create an image of a sunset over Tokyo in watercolor style"
→ Agent selects the best model (Flux, Recraft, Gemini), generates the image, and places it on the canvas.

**Edit** — Right-click any image card → Restyle, Upscale, or enter a custom prompt
→ Creates a new card linked to the original with an arrow showing the transformation.

**Animate** — "Animate this image" or right-click → Animate
→ Converts a still image to video using LTX or Lucy image-to-video models.

**Chain** — "Create a dragon, restyle it as pixel art, then animate it"
→ Agent builds a DAG: image → restyle → animate, executing steps in dependency order.

**Live Stream** — Click the camera widget → LV2V
→ Captures webcam frames, sends them through Livepeer's live video-to-video pipeline (Scope), and displays the stylized output in real-time.

**Train** — Click Train in the top bar
→ Upload images or a ZIP, set a trigger word, and fine-tune a LoRA model on Livepeer's network.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Next.js App                     │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Infinite  │  │  Chat    │  │   Camera     │  │
│  │ Canvas    │  │  Panel   │  │   Widget     │  │
│  │           │  │          │  │              │  │
│  │ Cards ────┼──┤ Agent ───┼──┤ LV2V Stream  │  │
│  │ Arrows    │  │ Messages │  │ Webcam       │  │
│  └──────────┘  └────┬─────┘  └──────────────┘  │
│                      │                           │
│              ┌───────┴───────┐                   │
│              │ Agent Plugin  │                   │
│              │   Registry    │                   │
│              └───────┬───────┘                   │
│                      │                           │
│         ┌────────────┼────────────┐              │
│         │            │            │              │
│    BuiltIn      Claude       OpenAI             │
│    Plugin       Plugin       Plugin             │
│    (done)      (Phase 2)   (Phase 6)            │
│         │            │            │              │
│         └────────────┼────────────┘              │
│                      │                           │
│              ┌───────┴───────┐                   │
│              │  SDK Client   │                   │
│              │  (sdkFetch)   │                   │
│              └───────┬───────┘                   │
└──────────────────────┼───────────────────────────┘
                       │
          ┌────────────┴────────────┐
          │   SDK Service (A3)      │
          │  sdk-a3-staging-1       │
          │  /health /capabilities  │
          │  /inference /enrich     │
          │  /stream/* /train       │
          └────────────┬────────────┘
                       │
          ┌────────────┴────────────┐
          │   BYOC Orchestrator     │
          │  byoc-a3-staging-1      │
          │  12 AI capabilities     │
          │  fal.ai + Gemini proxy  │
          └─────────────────────────┘
```

### Key Design Decisions

- **Agent plugin system** — Swappable AI backends (BuiltIn, Claude, OpenAI) sharing a common tool registry
- **SDK-side intelligence** — The SDK service handles model selection, not the agent. One `create_media` tool instead of 20 model-specific tools. This keeps token usage low.
- **DAG execution** — Multi-step prompts are planned as a dependency graph. Independent steps run concurrently; dependent steps execute in waves.
- **Infrastructure isolation** — A3 runs on its own VMs, completely separate from the existing simple-infra deployment

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Styling | Tailwind CSS v4 |
| State | Zustand |
| Canvas | Custom — pointer events + CSS transforms |
| Arrows | SVG cubic beziers |
| Streaming | Livepeer LV2V (Scope pipeline) |
| Testing | Vitest (unit) + Playwright (E2E) |
| Hosting | Vercel (iad1 region) |
| Backend | Livepeer SDK Service + BYOC orchestrator |

### Available AI Models (12)

| Capability | What it does |
|-----------|-------------|
| flux-schnell, flux-dev | Fast/quality text-to-image |
| recraft-v4 | Professional text-to-image |
| gemini-image | Gemini multimodal image generation |
| kontext-edit | Image editing (restyle, modify) |
| ltx-t2v, ltx-i2v | Text/image to video |
| topaz-upscale | Image upscaling |
| bg-remove | Background removal |
| chatterbox-tts | Text-to-speech |
| gemini-text | Text generation (enrichment) |
| nano-banana | Fast test model |

## Quick Start

### Prerequisites

- Node.js 20+
- npm

### Development

```bash
git clone https://github.com/livepeer/storyboard.git
cd storyboard

# One-command setup + dev server
./scripts/dev.sh

# Or manually:
npm install
npm run dev
```

Open http://localhost:3000. The app connects to the staging SDK service by default.

### Other Commands

```bash
./scripts/dev.sh test     # Run unit tests (21 tests)
./scripts/dev.sh e2e      # Run E2E tests (6 tests, needs Playwright)
./scripts/dev.sh build    # Production build
./scripts/dev.sh deploy   # Deploy to Vercel
```

### Configuration

Click the gear icon (top right) to configure:
- **SDK Service URL** — defaults to `https://sdk.daydream.monster`
- **API Key** — optional, for authenticated access

Settings are saved to localStorage.

## Project Structure

```
storyboard/
├── app/                        # Next.js App Router
│   ├── page.tsx                # Main page
│   ├── globals.css             # Dark theme CSS variables
│   └── api/
│       ├── health/route.ts     # Health check
│       └── agent/chat/route.ts # Anthropic API proxy
├── components/
│   ├── canvas/                 # InfiniteCanvas, Card, ArrowEdge, TopBar, ContextMenu, CameraWidget
│   ├── chat/                   # ChatPanel, MessageBubble
│   ├── settings/               # SettingsPanel
│   └── training/               # TrainingModal
├── lib/
│   ├── canvas/                 # Zustand store + types
│   ├── chat/                   # Chat message store
│   ├── sdk/                    # SDK client (sdkFetch, types)
│   ├── agents/                 # Plugin system + built-in agent
│   └── stream/                 # LV2V session + webcam capture
├── tests/
│   ├── unit/                   # Vitest (canvas, chat, SDK)
│   └── e2e/                    # Playwright (smoke tests)
├── scripts/
│   └── dev.sh                  # Dev/test/deploy helper
└── docs/
    ├── design/architecture.md  # Architecture decisions
    └── plan/
        ├── implementation.md   # Full 8-phase implementation plan
        └── status.md           # Phase completion tracking
```

## Roadmap

| Phase | What | Status |
|-------|------|--------|
| 0 | Repository setup + migration from storyboard.html | Done |
| 1 | Agent plugin interface + tool registry | Next |
| 2 | Claude plugin (Messages API + tool_use) | Planned |
| 3 | Claude skills (on-demand prompt loading) | Planned |
| 4 | UX polish | Planned |
| 5 | Wow features | Planned |
| 6 | Production polish + OpenAI plugin | Planned |
| 7 | MCP tools + daily briefing | Planned |

See `docs/plan/implementation.md` for the full 2,000-line plan.

## License

Copyright Livepeer Foundation.
