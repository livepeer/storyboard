# Storyboard A3 — Project Instructions

## What This Is

A Next.js 16 app that transforms the single-file `storyboard.html` prototype (from `simple-infra`) into a production agent-powered creative tool. Artists chat with AI agents (Gemini/Claude/OpenAI) to generate, edit, animate, and live-stream media using Livepeer's AI model network.

## Current State

Phases 0-7 + Scope Advanced Integration complete. 21 tools, 17 skills, 4 agent plugins (Built-in, Claude, OpenAI, Gemini). Default agent: Gemini 2.5 Flash. Default SDK: `sdk.daydream.monster`.

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
./scripts/dev.sh     # one-command dev setup
```

---

## SKILL: Infrastructure Architecture

### The Full Stack

```
Browser (Next.js on Vercel)
  → SDK Service (sdk.daydream.monster) — Python FastAPI on GCP VM
    → BYOC Orchestrator (byoc-staging-1.daydream.monster) — go-livepeer for inference
      → fal.ai / Gemini (actual AI model execution)
    → Scope Orchestrators (orch-staging-1/2.daydream.monster) — go-livepeer for LV2V
      → fal.ai Scope runner (live video-to-video pipeline)
  → Signer (signer.daydream.live) — payment ticket signing
```

### VMs (GCP project: livepeer-simple-infra)

| VM | Purpose | IP | Domain |
|----|---------|-----|--------|
| sdk-staging-1 | SDK Service (inference + LV2V proxy) | 34.168.200.215 | sdk.daydream.monster |
| byoc-staging-1 | BYOC orch (image/video/audio inference) | 8.229.77.130 | byoc-staging-1.daydream.monster |
| byoc-a3-staging-1 | A3 BYOC orch (storyboard capabilities) | 136.109.56.80 | byoc-a3-staging-1.daydream.monster |
| orch-staging-1 | Scope LV2V orch (shared, us-west) | 34.169.235.70 | orch-staging-1.daydream.monster |
| orch-staging-2 | Scope LV2V orch (shared, us-east) | — | orch-staging-2.daydream.monster |

### SSH Access
```bash
gcloud compute ssh <vm-name> --zone=us-west1-b --project=livepeer-simple-infra
# Docker commands need sudo:
sudo docker ps
sudo docker logs sdk-service --tail 50
sudo docker exec sdk-service env | grep LV2V
```

### Config Locations
- SDK: `/opt/sdk/docker-compose.yaml` + `/opt/sdk/.env`
- BYOC: `/opt/byoc/docker-compose.yaml` + `/opt/byoc/.env`
- Orch: Docker run args (no compose file)

---

## SKILL: SDK Service (sdk.daydream.monster)

### What It Does
Python FastAPI app wrapping `livepeer-python-gateway`. Handles:
- `/inference` — run AI model (image/video/audio) via BYOC orch
- `/capabilities` — list available models (live from BYOC orch)
- `/stream/start|stop|status|publish|frame|control` — LV2V proxy
- `/smart/inference` — multi-step inference with model selection
- `/streams` — list active LV2V streams (monitoring)
- `/streams/cleanup` — emergency kill all streams

### Key Environment Variables
```
ORCH_URL=https://byoc-staging-1.daydream.monster:8935    # BYOC for inference
SIGNER_URL=https://signer.daydream.live                   # Payment signer
LV2V_ORCH_URLS=https://orch-staging-1.daydream.monster:8935,https://orch-staging-2.daydream.monster:8935
LV2V_MODEL=scope
LV2V_PIPELINE=longlive                                    # Pipeline name on fal runner
```

### Authentication Flow
1. Browser sends `Authorization: Bearer sk_...` (Daydream API key) to SDK
2. SDK's `_extract_signer_headers()` forwards it to signer for payment tickets
3. SDK's `_resolve_daydream_user_id()` calls Daydream API to get Clerk user ID
4. User ID passed to fal runner as `daydream_user_id` (required for auth)

**CRITICAL: Without the Daydream API key, ALL inference fails (signer 401) and LV2V streams get ACCESS_DENIED from fal.**

### Updating SDK Code
```bash
gcloud compute scp app.py sdk-staging-1:/tmp/app.py --zone=us-west1-b --project=livepeer-simple-infra
gcloud compute ssh sdk-staging-1 --zone=us-west1-b --project=livepeer-simple-infra --command="sudo docker cp /tmp/app.py sdk-service:/app/app.py && sudo docker restart sdk-service"
```

---

## SKILL: BYOC Orchestrator

### What It Does
go-livepeer in BYOC mode. Routes inference requests to fal.ai/Gemini providers via a serverless proxy adapter.

### Capabilities (fal model IDs — MUST match fal.ai exactly)

| Capability | fal Model ID | Verified |
|------------|-------------|----------|
| flux-dev | fal-ai/flux/dev | ✅ |
| flux-schnell | fal-ai/flux/schnell | ✅ |
| recraft-v4 | fal-ai/recraft/v4/pro/text-to-image | ✅ |
| gemini-image | gemini/gemini-2.5-flash-image | ✅ |
| ltx-i2v | fal-ai/ltx-2.3/image-to-video | ✅ |
| ltx-t2v | fal-ai/ltx-2.3/text-to-video | ✅ |
| kontext-edit | fal-ai/flux-pro/kontext | ✅ |
| bg-remove | fal-ai/birefnet | ✅ (NOT fal-ai/bg-remove) |
| topaz-upscale | fal-ai/aura-sr | ✅ (NOT fal-ai/topaz-upscale) |
| chatterbox-tts | fal-ai/chatterbox/text-to-speech | ✅ (NOT fal-ai/chatterbox-tts) |
| gemini-text | gemini/gemini-2.5-flash | ✅ |
| nano-banana | fal-ai/nano-banana-2 | ✅ |

**CRITICAL: fal renames models. Always verify with `curl https://fal.ai/models/<model_id>` before adding.**

### Updating Capabilities
```bash
gcloud compute ssh byoc-a3-staging-1 --zone=us-west1-b --project=livepeer-simple-infra
sudo vi /opt/byoc/.env  # Edit CAPABILITIES_JSON
cd /opt/byoc && sudo docker compose up -d
```

---

## SKILL: LV2V (Live Video-to-Video) Streaming

**Full debugging guide:** `docs/key-insights-scope.md`

### The 4 Required Fixes (all must be present)

1. **Orch timeout:** `-liveOutSegmentTimeout 300s` on orch (prevents 30s watchdog kill)
2. **Fal keepalive:** PR 864 ping/pong in fal app (prevents WebSocket disconnect)
3. **Graph params:** `start_stream` MUST include graph with source/pipeline/sink nodes (creates input trickle channel)
4. **Edge format:** Edges MUST use `from/from_port/to_node/to_port/kind` NOT `source/target` (enables pipeline wiring)

### Graph Format (CRITICAL — must match Scope exactly)

```python
start_stream_params = {
    "pipeline_ids": ["longlive"],
    "prompts": prompt,
    "graph": {
        "nodes": [
            {"id": "input", "type": "source", "source_mode": "video"},
            {"id": "longlive", "type": "pipeline", "pipeline_id": "longlive"},
            {"id": "output", "type": "sink"},
        ],
        "edges": [
            {"from": "input", "from_port": "video", "to_node": "longlive", "to_port": "video", "kind": "stream"},
            {"from": "longlive", "from_port": "video", "to_node": "output", "to_port": "video", "kind": "stream"},
        ],
    },
}
```

### Trickle Channel URLs

```
Job-level (DON'T use for MediaPublish/MediaOutput):
  {id}, {id}-out, {id}-control, {id}-events

Per-stream (USE these — created by start_stream with graph):
  {id}-1-in   — input (MediaPublish writes here)
  {id}-2-out  — output (MediaOutput reads here)
```

### Diagnostic Checklist (check in order)

| Symptom | Check |
|---------|-------|
| 503 on stream start | Daydream API key? daydream_user_id resolved? FAL_API_KEY on orch? |
| Stream dies <30s | `-liveOutSegmentTimeout 300s` on orch? PR 864 deployed? |
| Publish 404 | Graph in start_stream? "start_stream returned 2 channels"? |
| Publish OK but no output | Edge format correct? Pipeline node ID = pipeline_id? |
| Output OK but black screen | Card renders as `<img>` not `<video>`? |

### Orch Requirements

```
-liveOutSegmentTimeout 300s
FAL_API_KEY=<key>
FAL_KEY=<key>
LIVE_AI_WS_PREFIX=wss://fal.run/daydream
```

### fal Runner Auth

Requires `daydream_user_id` in `start_lv2v` params. SDK resolves from Daydream API key via `_resolve_daydream_user_id()`. Without it: `ACCESS_DENIED`.

### Stream Health Monitoring

```bash
# Check active streams
curl -s https://sdk.daydream.monster/streams | python3 -m json.tool

# Kill zombie streams
curl -s -X POST https://sdk.daydream.monster/streams/cleanup

# Monitor a specific stream
./scripts/monitor-stream.sh <stream_id> [sdk_url] [api_key]
```

### Zombie Stream Prevention
- SDK has a stream reaper (checks every 30s, kills idle >2min or age >1hr)
- Browser has `beforeunload` handler to stop streams on page close
- Client-side dead stream detection (auto-stop after 30 consecutive publish failures)

---

## SKILL: Signer (signer.daydream.live)

### What It Does
Signs payment tickets for on-chain Arbitrum payments. Used by BOTH inference and LV2V.

### Endpoints
- `/sign-orchestrator-info` — sign orch info for job creation
- `/generate-live-payment` — create payment tickets for LV2V streams
- `/discovery/staging.json` — orchestrator discovery

### Auth
All signer requests require `Authorization: Bearer sk_...` (Daydream API key). The SDK forwards this from the browser's request headers via `_extract_signer_headers()`.

---

## SKILL: Capability Resolution (LLM Model Name Hallucination)

LLMs hallucinate model names (e.g., `flux-pro`, `kling-i2v`, `lux-tts`). The storyboard defends against this:

1. **Live capability list** fetched from SDK `/capabilities` on app startup
2. **`resolveCapability()`** fuzzy-matches invalid names: prefix match → keyword match → action default
3. **`create_media` tool** has NO `model_override` in schema — agent can't pick models
4. **`selectCapability()`** maps action → model deterministically
5. **Validation** at execution time in both `create_media` and `inference` tools

### Resolution chain
```
"flux-pro" → prefix "flux-" → "flux-dev"
"kling-i2v" → keyword "i2v" → "ltx-i2v"
"lux-tts" → keyword "tts" → "chatterbox-tts"
```

---

## SKILL: Agent Plugins

### 4 Plugins Available
| Plugin | Model | API Route | Tool Format |
|--------|-------|-----------|-------------|
| Built-in | None (SDK enrich) | — | Direct SDK calls |
| Claude | claude-sonnet-4-6 | /api/agent/chat | Anthropic tool_use |
| OpenAI | gpt-4o | /api/agent/openai | function calling |
| Gemini | gemini-2.5-flash | /api/agent/gemini | functionDeclarations |

### Common Patterns
- All plugins share the same 21-tool registry
- System prompt loaded from `skills/base.md` + live capabilities + memory + canvas context
- Tool-use loop: LLM calls tool → execute → send result → loop until done
- Concurrent prompt execution (no queue unless depends_on)

### Gemini Quirk
Gemini sometimes returns empty `content` (no `parts`) after tool execution. This is normal — the tool results are on the canvas. Don't show an error.

---

## SKILL: Scope Domain Agent (Advanced LV2V)

### Architecture
The Scope Domain Agent is an expert subsystem that translates natural language into precise Scope configurations. It runs as a tool layer accessible by all agent plugins (Gemini, Claude, OpenAI) — NOT a standalone plugin.

```
User: "stream my image with anime style"
  → Agent loads scope-agent skill (domain knowledge)
  → Agent calls scope_start tool (graph=simple-lv2v, preset=anime, source.ref_id=card)
  → scope_start builds ScopeStreamParams (graph, pipeline_ids, noise_scale, etc.)
  → session.ts passes scopeParams to SDK /stream/start
  → SDK passes full params through to fal runner (cloud/livepeer_app.py)
  → Scope validates graph, loads pipeline, starts stream
```

### Key Principle: SDK as Passthrough
The SDK does NOT validate Scope params. It passes them through to the fal runner which validates against Scope's `graph_schema.py`. This means:
- **Adding new Scope features requires zero SDK changes** — just send the right params
- **SDK only needs changes when the transport protocol changes** (new channel types, etc.)
- **feat branch `feat/scope-advanced-params`** in simple-infra contains the passthrough change

### 6 Scope Tools
| Tool | Purpose |
|------|---------|
| `scope_start` | Start LV2V with full config (graph, preset, LoRA, VACE, source) |
| `scope_control` | Update params mid-stream (prompt, noise, denoising, LoRA scale) |
| `scope_stop` | Stop a stream |
| `scope_preset` | List/apply named presets (dreamy, cinematic, anime, etc.) |
| `scope_graph` | List/build graph templates |
| `scope_status` | Stream health, FPS, frames published/received |

### 6 Graph Templates
| Template | Graph | Use Case |
|----------|-------|----------|
| `simple-lv2v` | source→longlive→sink | Default webcam/video transform |
| `depth-guided` | source→depth_anything→longlive→sink | Preserve depth/structure |
| `scribble-guided` | source→scribble→longlive→sink | Edge-guided generation |
| `interpolated` | source→longlive→rife→sink | 2x frame interpolation |
| `text-only` | longlive→sink | Pure text-to-video (no input) |
| `multi-pipeline` | source→pipeline_a→pipeline_b→sink | Chained transforms |

### 7 Presets
dreamy (noise=0.7), cinematic (0.5), anime (0.6), abstract (0.95), faithful (0.2), painterly (0.65), psychedelic (0.9)

### Key Scope Parameters (runtime, change mid-stream)
- `noise_scale` (0.0-1.0): creativity level. 0=faithful, 1=ignore input
- `kv_cache_attention_bias` (0.01-1.0): temporal consistency. Low=responsive, high=stable
- `denoising_step_list` [1000,750,500,250]: quality vs speed
- `reset_cache`: one-shot flush for dramatic style change
- `lora_scales`: adjust LoRA strength without restart
- `prompts`: string or [{text, weight}] for spatial blending

### Scope Source Code Reference
- **Graph schema:** `Scope/scope/src/scope/server/graph_schema.py` — node types, edge format, validation
- **Graph executor:** `Scope/scope/src/scope/server/graph_executor.py` — builds queues, wires processors
- **Pipeline registry:** `Scope/scope/src/scope/core/pipelines/registry.py` — auto-registration by VRAM
- **LongLive config:** `Scope/scope/src/scope/core/pipelines/longlive/schema.py` — all params with ranges
- **Server schema:** `Scope/scope/src/scope/server/schema.py` — Parameters model, VACE, transitions
- **LoRA manager:** `Scope/scope/src/scope/core/pipelines/wan2_1/lora/manager.py` — 3 merge strategies
- **Cloud runner:** `Scope/scope/src/scope/cloud/livepeer_app.py` — fal.ai WebSocket + trickle I/O
- **Modulation:** `Scope/scope/src/scope/server/modulation.py` — beat-synced param oscillation

### Multi-Source Input
FrameExtractor (`lib/stream/frame-extractor.ts`) supports: webcam, image, video, URL. All produce JPEG blobs at configurable FPS for trickle publish.

### Stream Card Controls
Stream-type cards have: run/stop buttons, pub/recv stats, inline agent input (type natural language to control stream in real-time). Video cards have fullscreen button.

---

## SKILL: Canvas Layout & BatchId Grouping

### BatchId System
Each `create_media` call tags all its cards with a shared `batchId` (`batch_<timestamp>`). This groups cards by the prompt that created them.

### Layout Modes
- **`autoLayout()`** — Grid layout. Cards with the same batchId stay contiguous in the grid.
- **`narrativeLayout()`** — **One row per batchId**. Cards from the same prompt flow horizontally; different prompts stack as separate rows.
- **`layoutTimeline()`** — Arrange specific refIds in grid order (used by project_generate).

### Layout Commands
- `/organize` or `/organize grid` — autoLayout (grid, grouped by batch)
- `/organize narrative` or `/organize flow` — narrativeLayout (one row per prompt batch)

---

## SKILL: Long Prompt Handling & Preprocessor

### The Core Problem
Gemini (and other LLMs) choke on large prompts combined with many tool schemas. A 800-word storyboard brief + 500-char system prompt + 21 tool schemas = empty STOP or MALFORMED_FUNCTION_CALL. This is **not fixable by prompt engineering** — the model is token-overwhelmed.

### The Solution: Client-Side Preprocessor (`lib/agents/preprocessor.ts`)
Multi-scene prompts are intercepted BEFORE reaching the LLM:
1. **Detect** multi-scene: regex for `Scene N —`, numbered lists, or >1500 chars with "storyboard"/"scenes"
2. **Extract** scenes client-side: title + first-sentence summary (≤25 words each)
3. **Extract** style guide: visual_style, color_palette, mood → prompt_prefix
4. **Call `project_create` directly** — no LLM needed for parsing
5. **Send 1-line instruction** to agent: "Project created. Call project_generate."
6. Agent just manages the generation loop (small context per call)

**The LLM never sees the full brief.** It gets a 50-word instruction instead of 800 words.

### Stress-Tested
- 20-scene, 8,651-char, 1,399-word prompt → all 20 scenes extracted, all prompts ≤25 words
- Style guide correctly parsed (visual_style, color_palette, mood)
- Preprocessing takes <50ms (pure regex, no LLM)
- Short prompts ("cat eating cheez-it") bypass preprocessor correctly

### Key Design Rules
- **System prompt must stay under ~500 chars.** Don't list tool descriptions in base.md — Gemini sees them in function declarations already. Just routing rules.
- **Never send raw user text >500 words to Gemini.** Preprocess or summarize first.
- **Empty STOP handler must detect prompt type.** Multi-scene → route to project_create. Single image → enhance creatively. Don't try to "create a stunning image" from a storyboard brief.
- **MALFORMED_FUNCTION_CALL retry must be short.** One sentence, not 4 lines of instructions.
- **Auto-continuation nudges must merge into the function response message** (same user turn). Consecutive user messages cause Gemini 400 "function call turn" errors.

### MALFORMED_FUNCTION_CALL Recovery
Gemini hits this when function calls are too large. Recovery: short 1-line instruction to use project_create or fewer steps.

### Empty STOP Recovery
- Multi-scene detected → replace with project_create instruction (from preprocessor)
- Single image → enhance creatively into 30-word prompt
- Round limit: 2 retries max, then show error

### Gemini Turn Ordering
Gemini requires strict user/model alternation. The agent sanitizes messages before each API call — merges consecutive same-role messages. On 400 "function call turn" error, resets conversation and retries.

### Completion Summary
After all tool calls finish, if Gemini didn't provide text, an auto-summary appears:
- `Done in 4.2s — media: 3 created (flux-dev)`
- `2/5 succeeded (12.1s) — media: 2 ok, 3 failed`

### Error Humanization
Raw errors are mapped to friendly messages in `compound-tools.ts`:
- "Failed to fetch" → "Can't reach SDK — check connection & API key"
- "503 / no orchestrator" → "No GPU available — try again in a moment"
- Error messages show as red-bordered bubbles in chat, red icons on cards

### Network Retry
`sdkFetch()` retries once after 2s on network errors (Failed to fetch, CORS, timeout). HTTP errors (4xx, 5xx) are NOT retried.

---

## SKILL: VM Health & Auto-Recovery

### SDK VM Health Check
`/opt/sdk/healthcheck.sh` runs every 2 minutes via cron on sdk-staging-1:
1. Checks `http://localhost:8000/capabilities`
2. If unhealthy: restarts `sdk-service` Docker container
3. If 3 consecutive Docker restarts fail: reboots the VM
4. Logs to `/var/log/sdk-healthcheck.log`

### GCP Monitoring
- Uptime check every 5 minutes on `https://sdk.daydream.monster/capabilities`
- Alert policy emails `sean@livepeer.org` if check fails for 5+ minutes
- Alert policy ID: `projects/livepeer-simple-infra/alertPolicies/10364248248890653369`

### Common VM Failure Mode
GCP metadata server (`169.254.169.254`) becomes unreachable → snapd crash-loops → SSH hangs → all services degrade. Fix: `gcloud compute instances reset sdk-staging-1 --zone=us-west1-b --project=livepeer-simple-infra`

---

## SKILL: Context Menu + Card Transformations

### Right-click Context Menu
- Uses `card-context-menu` CustomEvent (dispatched from Card.tsx `onContextMenu`)
- ContextMenu.tsx listens for the event, shows at cursor position
- **Dismiss race condition fix:** 10ms delay before attaching dismiss listeners (prevents the opening right-click from immediately closing the menu)

### Direct vs Agent Actions
- **Direct:** Upscale, Remove BG (one-click), Restyle/Animate/Transform (prompt then execute)
- **Agent:** Restyle with AI, Animate with AI, Ask Claude (routes to chat)
- **LV2V from card:** Captures card image as input for live stream

### create_media `source_url`
When restyling/animating an existing canvas card via chat, the agent must:
1. Call `canvas_get` to find the card's URL
2. Pass `source_url` in the `create_media` step
Without `source_url`, restyle has no input image and fails.

---

## SKILL: Hydration & SSR

The page renders `null` on server and defers all UI to client-side `useEffect`. This avoids hydration mismatches from localStorage, Zustand stores, and Date.now().

**NEVER use `Date.now()`, `Math.random()`, or `localStorage` in initial state or render.** Use `0` or `""` as defaults, set real values in `useEffect`.

---

## Key Files

### App
- `app/page.tsx` — Main page, plugin registration, mounted gate
- `app/api/agent/chat/route.ts` — Claude API proxy + MCP tool routing
- `app/api/agent/gemini/route.ts` — Gemini API proxy
- `app/api/agent/openai/route.ts` — OpenAI API proxy

### Canvas
- `components/canvas/InfiniteCanvas.tsx` — Pan/zoom, dot grid, card/arrow rendering
- `components/canvas/Card.tsx` — Drag, resize, media display, info bar, stream controls + inline agent, video fullscreen
- `components/canvas/ArrowEdge.tsx` — SVG arrows + HTML click targets + inline popup
- `components/canvas/ContextMenu.tsx` — Right-click actions (direct + agent)
- `components/canvas/CameraWidget.tsx` — Webcam + LV2V with prompt control, info bar (FPS/pub/recv), 5 preset buttons

### Agent & Tools
- `lib/agents/gemini/index.ts` — Gemini plugin (default), MALFORMED_FUNCTION_CALL recovery, auto-continuation
- `lib/agents/claude/index.ts` — Claude plugin
- `lib/tools/compound-tools.ts` — `create_media` (main tool for all media creation), batchId tagging
- `lib/tools/canvas-tools.ts` — `canvas_get/create/update/remove/organize`
- `lib/tools/scope-tools.ts` — `scope_start/control/stop/preset/graph/status` (Scope Domain Agent)
- `lib/tools/project-tools.ts` — `project_create/generate/iterate/status` (Director)
- `lib/sdk/capabilities.ts` — Live capability registry + resolveCapability

### Stream & Scope
- `lib/stream/session.ts` — LV2V session lifecycle (start, publish, poll, control, stop), scopeParams passthrough
- `lib/stream/scope-params.ts` — Scope TypeScript types, presets, validation
- `lib/stream/scope-graphs.ts` — 6 graph templates (simple-lv2v, depth-guided, etc.)
- `lib/stream/frame-extractor.ts` — Multi-source frame extraction (webcam, image, video, URL)

### Skills (17 total)
- `skills/scope-agent.md` — Scope Domain Agent: full parameter reference + natural language mapping
- `skills/director.md` — Director workflow + Scope integration for multi-stream orchestration
- `skills/base.md` — Base system prompt (rules for create_media, project_create routing)
- `skills/scope-lv2v.md`, `skills/live-director.md`, `skills/scope-graphs.md` — LV2V reference

### Infrastructure
- `simple-infra/sdk-service-build/app.py` — SDK service code
- `simple-infra/environments/staging/byoc-a3.yaml` — BYOC config
- `simple-infra/environments/staging/fleet.yaml` — Orch fleet config

### Plans & Docs
- `docs/scope-adv-plan.md` — Scope Advanced Integration plan (6 phases, architecture, parameter reference)
- `docs/key-insights-scope.md` — LV2V debugging guide

### E2E Tests
- `tests/e2e/scope-phase{1-6}.spec.ts` — Scope integration tests (58 tests total)
- `tests/e2e/storyboard.spec.ts` — Core app tests
- Run: `npx playwright test tests/e2e/scope-phase*.spec.ts tests/e2e/storyboard.spec.ts`

## Source Material
- **Original storyboard:** `/Users/qiang.han/Documents/mycodespace/simple-infra/storyboard.html`
- **SDK service:** `/Users/qiang.han/Documents/mycodespace/simple-infra/sdk-service-build/app.py`
- **SDK feat branch:** `feat/scope-advanced-params` in simple-infra (Scope param passthrough)
- **Scope source:** `/Users/qiang.han/Documents/mycodespace/Scope/scope/src/scope/`
- **Scope client:** `/Users/qiang.han/Documents/mycodespace/Scope/scope/src/scope/server/livepeer_client.py`
- **Scope cloud app:** `/Users/qiang.han/Documents/mycodespace/Scope/scope/src/scope/cloud/livepeer_app.py`
- **go-livepeer LV2V:** `/Users/qiang.han/Documents/mycodespace/livepeer/go-livepeer/server/ai_live_video.go`
