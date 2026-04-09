# Storyboard Agent Architecture

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Browser (localhost:3000)                                                    │
│                                                                              │
│  ┌──────────────┐  ┌─────────────────────────────────────────────────────┐  │
│  │  TopBar       │  │  InfiniteCanvas                                    │  │
│  │  [Zoom][Fit]  │  │  ┌──────┐ ┌──────┐ ┌──────┐                      │  │
│  │  [Train][⚙]  │  │  │Card 1│→│Card 2│→│Card 3│  (edges = arrows)    │  │
│  └──────────────┘  │  │image │ │video │ │audio │                      │  │
│                     │  └──────┘ └──────┘ └──────┘                      │  │
│  ┌──────────────┐  │         ↑ Canvas Store (Zustand)                   │  │
│  │  ContextMenu  │  └─────────────────────────────────────────────────────┘  │
│  │  [Upscale]   │                                                           │
│  │  [Animate…]  │  ┌─────────────────────────────────────────────────────┐  │
│  │  [Restyle…]  │  │  ChatPanel                                          │  │
│  │  [AI Ask…]   │──│  ┌─────────────────────────────────┐               │  │
│  └──────────────┘  │  │ Messages (Chat Store - Zustand)  │               │  │
│                     │  │ [user] Create a dragon storyboard│               │  │
│                     │  │ [agent] Planning…                │               │  │
│                     │  │ [●  create_media: 5 steps]       │  ← ToolPills │  │
│                     │  │ [✓  create_media: 5 cards]       │               │  │
│                     │  └─────────────────────────────────┘               │  │
│                     │  [Generate][Restyle][Animate][LV2V][Train] ← Quick │  │
│                     │  [Type to queue next message...___________] ← Input│  │
│                     └─────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  Agent Plugin Layer                                                    │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                │  │
│  │  │ Built-in │ │  Claude   │ │  OpenAI   │ │ Gemini ● │ ← active     │  │
│  │  │ (no LLM) │ │ Sonnet4.6│ │  GPT-4o   │ │ 2.5 Pro  │              │  │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘              │  │
│  │       │             │             │             │                     │  │
│  │       │  ┌──────────┴─────────────┴─────────────┘                    │  │
│  │       │  │  Shared Tool Registry (15 tools)                          │  │
│  │       │  │  ┌─────────────┬───────────┬──────────┬──────────────┐   │  │
│  │       │  │  │ create_media│ canvas_*  │ memory_* │  load_skill  │   │  │
│  │       │  │  │ inference   │ canvas_get│ mem_style│  stream_*    │   │  │
│  │       │  │  │             │ canvas_rm │ mem_rate │  capabilities│   │  │
│  │       │  │  └──────┬──────┴─────┬─────┴─────┬────┴──────────────┘   │  │
│  │       │  │         │            │           │                        │  │
│  │       │  │  ┌──────▼──────┐ ┌───▼───┐ ┌────▼─────┐                 │  │
│  │       │  │  │ Capability  │ │Canvas │ │ Memory   │                 │  │
│  │       │  │  │ Registry    │ │Store  │ │ Store    │                 │  │
│  │       │  │  │ (live SDK)  │ │(Zustand)│(localStorage)│             │  │
│  │       │  │  └──────┬──────┘ └───────┘ └──────────┘                 │  │
│  └───────┼──┼─────────┼──────────────────────────────────────────────┘  │
│           │  │         │                                                  │
└───────────┼──┼─────────┼──────────────────────────────────────────────────┘
            │  │         │
            │  │         ▼
            │  │  ┌─────────────────────────────┐
            │  │  │ SDK Service                  │
            │  │  │ sdk.daydream.monster │
            │  │  │                               │
            │  │  │ /capabilities → live model list│
            │  │  │ /inference   → run model       │
            │  │  │ /enrich      → plan steps      │
            │  │  └──────────┬──────────────────┘
            │  │             │
            │  │             ▼
            │  │  ┌─────────────────────────────┐
            │  │  │ BYOC Orchestrator            │
            │  │  │ byoc-a3-staging-1.daydream.monster │
            │  │  │                               │
            │  │  │  Signer ← Daydream API Key   │
            │  │  │  ↓                            │
            │  │  │  fal.ai / Gemini / Livepeer   │
            │  │  │  (actual model execution)     │
            │  │  └─────────────────────────────┘
            │  │
            │  ▼
     ┌──────┴──────────────────────────────────┐
     │ Vercel API Routes (server-side)          │
     │                                          │
     │ /api/agent/chat    → Anthropic API       │
     │ /api/agent/openai  → OpenAI API          │
     │ /api/agent/gemini  → Google Gemini API   │
     │ /api/health        → health check        │
     │                                          │
     │ (API keys stay server-side, never in browser) │
     └─────────────────────────────────────────┘
```

## Sequence Diagram — User sends "Create a 5-shot storyboard"

```
User          ChatPanel       GeminiPlugin     /api/agent/gemini    Gemini API       ToolRegistry     create_media     SDK Service      BYOC/fal.ai
 │                │                │                │                  │                 │                │                │                │
 │ "Create a      │                │                │                  │                 │                │                │                │
 │  5-shot..."    │                │                │                  │                 │                │                │                │
 │───────────────>│                │                │                  │                 │                │                │                │
 │                │ queue message  │                │                  │                 │                │                │                │
 │                │ addMessage()   │                │                  │                 │                │                │                │
 │                │───────────────>│                │                  │                 │                │                │                │
 │                │                │ loadSystemPrompt()                │                 │                │                │                │
 │                │                │ (base.md + live capabilities      │                 │                │                │                │
 │                │                │  + memory + canvas context)       │                 │                │                │                │
 │                │                │                │                  │                 │                │                │                │
 │                │  ···thinking···│ POST /api/agent/gemini            │                 │                │                │                │
 │                │                │ {contents, tools(15), system}     │                 │                │                │                │
 │                │                │───────────────>│                  │                 │                │                │                │
 │                │                │                │ POST generativelanguage.googleapis.com              │                │                │
 │                │                │                │ {contents, tools, system_instruction}                │                │                │
 │                │                │                │─────────────────>│                 │                │                │                │
 │                │                │                │                  │                 │                │                │                │
 │                │                │                │                  │ ···thinking···  │                │                │                │
 │                │                │                │                  │                 │                │                │                │
 │                │                │                │  {functionCall: "create_media",    │                │                │                │
 │                │                │                │   args: {steps: [5 shots]}}        │                │                │                │
 │                │                │                │<─────────────────│                 │                │                │                │
 │                │                │<───────────────│                  │                 │                │                │                │
 │                │                │                │                  │                 │                │                │                │
 │                │ yield          │ executeTool("create_media", args) │                 │                │                │                │
 │                │ tool_call      │────────────────────────────────────────────────────>│                │                │                │
 │                │<───────────────│                │                  │                 │                │                │                │
 │                │ show ToolPill  │                │                  │                 │                │                │                │
 │  [● create_media: 5 steps]     │                │                  │                 │                │                │                │
 │                │                │                │                  │                 │                │                │                │
 │                │                │                │                  │         for each step:           │                │                │
 │                │                │                │                  │                 │                │                │                │
 │                │                │                │                  │                 │ selectCapability│                │                │
 │                │                │                │                  │                 │ action:"generate"               │                │
 │                │                │                │                  │                 │ → "flux-dev"   │                │                │
 │                │                │                │                  │                 │                │                │                │
 │                │                │                │                  │                 │ resolveCapability               │                │
 │                │                │                │                  │                 │ (validate against live caps)    │                │
 │                │                │                │                  │                 │                │                │                │
 │                │                │                │                  │                 │  canvas.addCard│                │                │
 │  [Card appears with spinner]   │                │                  │                 │  (type: image) │                │                │
 │                │                │                │                  │                 │                │                │                │
 │                │                │                │                  │                 │                │ POST /inference│                │
 │                │                │                │                  │                 │                │ {capability:   │                │
 │                │                │                │                  │                 │                │  "flux-dev",   │                │
 │                │                │                │                  │                 │                │  prompt: "..."}│                │
 │                │                │                │                  │                 │                │───────────────>│                │
 │                │                │                │                  │                 │                │                │ submit_byoc_job│
 │                │                │                │                  │                 │                │                │───────────────>│
 │                │                │                │                  │                 │                │                │                │
 │                │                │                │                  │                 │                │                │  fal.ai runs   │
 │                │                │                │                  │                 │                │                │  flux-dev      │
 │                │                │                │                  │                 │                │                │  (~8 seconds)  │
 │                │                │                │                  │                 │                │                │                │
 │                │                │                │                  │                 │                │  {image_url}   │<───────────────│
 │                │                │                │                  │                 │                │<───────────────│                │
 │                │                │                │                  │                 │                │                │                │
 │                │                │                │                  │                 │ canvas.updateCard(url)          │                │
 │  [Card shows generated image]  │                │                  │                 │                │                │                │
 │                │                │                │                  │                 │                │                │                │
 │                │                │                │                  │         ─── repeat for steps 2-5 ───             │                │
 │                │                │                │                  │         (animate→ltx-i2v, tts→chatterbox-tts)    │                │
 │                │                │                │                  │                 │                │                │                │
 │                │                │                │                  │                 │ return {success, cards_created} │                │
 │                │                │<──────────────────────────────────────────────────── │                │                │                │
 │                │                │                │                  │                 │                │                │                │
 │                │                │ send functionResponse back to Gemini               │                │                │                │
 │                │                │───────────────>│─────────────────>│                 │                │                │                │
 │                │                │                │                  │                 │                │                │                │
 │                │                │                │  {text: "Your storyboard is ready!"}                │                │                │
 │                │                │                │<─────────────────│                 │                │                │                │
 │                │                │<───────────────│                  │                 │                │                │                │
 │                │ yield text     │                │                  │                 │                │                │                │
 │                │ yield done     │                │                  │                 │                │                │                │
 │                │<───────────────│                │                  │                 │                │                │                │
 │                │                │                │                  │                 │                │                │                │
 │  [✓ create_media: 5 cards created]              │                  │                 │                │                │                │
 │  [Agent: "Your storyboard is ready!"]           │                  │                 │                │                │                │
 │  [5 cards on canvas with arrows]                │                  │                 │                │                │                │
 │                │                │                │                  │                 │                │                │                │
```

## Key Data Flow

1. **User → ChatPanel** — message queued (never blocked)
2. **ChatPanel → Plugin** — `sendMessage()` starts async generator
3. **Plugin → API Route** — messages + 15 tool schemas + system prompt
4. **API Route → LLM** — proxied with server-side API key
5. **LLM → Plugin** — `functionCall` with tool name + args
6. **Plugin → Tool Registry** — `executeTool()` dispatches to the right tool
7. **Tool → Capability Registry** — `resolveCapability()` validates model name
8. **Tool → SDK → BYOC → fal.ai** — actual inference
9. **Tool → Canvas Store** — card created/updated with result URL
10. **Plugin → LLM** — `functionResponse` with result, loop continues
11. **LLM → Plugin → ChatPanel** — final text response, done

## Capability Resolution (defense against hallucinated model names)

```
LLM says "flux-pro"
       │
       ▼
resolveCapability("flux-pro")
       │
       ├─ exact match in live cache?  → NO
       ├─ longest prefix match?       → "flux-" matches "flux-dev" (5 chars) ✓
       │
       ▼
  returns "flux-dev"
       │
       ▼
  SDK receives valid capability
```

Fallback chain: exact match → longest prefix → keyword match → action default → "flux-dev"
