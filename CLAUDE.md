# Storyboard A3 — Project Instructions

## What This Is

A Next.js 16 app that transforms the single-file `storyboard.html` prototype (from `simple-infra`) into a production agent-powered creative tool. Artists chat with AI agents (Gemini/Claude/OpenAI) to generate, edit, animate, and live-stream media using Livepeer's AI model network.

## Current State

Phases 0-7 complete. 15 tools, 11 skills, 4 agent plugins (Built-in, Claude, OpenAI, Gemini). Default agent: Gemini 2.5 Flash. Default SDK: `sdk.daydream.monster`.

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

### Architecture
```
Browser webcam → SDK /stream/publish (JPEG) → MediaPublish (MPEG-TS) → trickle input
  → Scope Orch → fal runner (Scope pipeline) → output trickle
  → SDK MediaOutput (decode MPEG-TS → JPEG) → /stream/frame endpoint
Browser polls /stream/frame → displays as <img> (JPEG per frame)
```

### The Scope Protocol (CRITICAL — must follow exactly)

The SDK's `_init_stream_session` must execute this sequence:

1. **Start events/ping/payment loops** concurrently
2. **Wait for `runner_ready`** from events channel (up to 120s)
3. **Send `load_pipeline`** API request via control channel
4. **Wait for `pipeline_loaded`** from log events (up to 300s)
5. **Send `start_stream`** with `pipeline_ids` and `prompts` params
6. **Wait for `stream_started`** response with **per-stream channel URLs**
7. **Create `MediaPublish`** on the **per-stream input URL** (e.g., `{id}-1-in`)
8. **Create `MediaOutput`** on the **per-stream output URL** (e.g., `{id}-1-out`)

### KNOWN BUG: Job-level vs Per-stream URLs

**Root cause of publish 404 errors:**

The orch creates job-level trickle channels (`{id}`, `{id}-out`). After `start_stream`, the fal runner creates per-stream channels (`{id}-1-in`, `{id}-1-out`). 

**If `_init_stream_session` fails or times out**, it falls back to job-level URLs:
```
WRONG: MediaPublish on https://orch.../ai/trickle/{id}     → 404 "Stream not found"
RIGHT: MediaPublish on https://orch.../ai/trickle/{id}-1-in → works
```

**Diagnosis:** Check SDK logs for:
- `"per-stream channels ready"` = good (got per-stream URLs)
- `"protocol failed...using job-level URLs"` = bad (fallback, publish will fail)
- `"Trickle publisher channel does not exist"` = publishing to wrong URL

### Orch Configuration for LV2V

The orch MUST have:
- `-liveOutSegmentTimeout 300s` — prevents 30s output watchdog kill
- `FAL_API_KEY` env var — fal runner requires auth
- `LIVE_AI_WS_PREFIX` env var — WebSocket URL prefix for fal

Without `-liveOutSegmentTimeout 300s`, the orch kills streams after 30s because the output segment watchdog fires. The default is 30s (hardcoded in go-livepeer `ai_live_video.go:256`).

### fal Runner Auth

The fal runner requires `daydream_user_id` in the `start_lv2v` params. Without it:
```
ERROR: serverless handshake failed (ACCESS_DENIED): Access denied
```
The SDK resolves this from the Daydream API key via `_resolve_daydream_user_id()`.

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
- All plugins share the same 15-tool registry
- System prompt loaded from `skills/base.md` + live capabilities + memory + canvas context
- Tool-use loop: LLM calls tool → execute → send result → loop until done
- Concurrent prompt execution (no queue unless depends_on)

### Gemini Quirk
Gemini sometimes returns empty `content` (no `parts`) after tool execution. This is normal — the tool results are on the canvas. Don't show an error.

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
- `components/canvas/Card.tsx` — Drag, resize, media display, info bar on click
- `components/canvas/ArrowEdge.tsx` — SVG arrows + HTML click targets + inline popup
- `components/canvas/ContextMenu.tsx` — Right-click actions (direct + agent)
- `components/canvas/CameraWidget.tsx` — Webcam + LV2V with prompt control bar

### Agent & Tools
- `lib/agents/gemini/index.ts` — Gemini plugin (default)
- `lib/agents/claude/index.ts` — Claude plugin
- `lib/tools/compound-tools.ts` — `create_media` (main tool for all media creation)
- `lib/tools/canvas-tools.ts` — `canvas_get/create/update/remove`
- `lib/sdk/capabilities.ts` — Live capability registry + resolveCapability

### Infrastructure
- `simple-infra/sdk-service-build/app.py` — SDK service code
- `simple-infra/environments/staging/byoc-a3.yaml` — BYOC config
- `simple-infra/environments/staging/fleet.yaml` — Orch fleet config

## Source Material
- **Original storyboard:** `/Users/qiang.han/Documents/mycodespace/simple-infra/storyboard.html`
- **SDK service:** `/Users/qiang.han/Documents/mycodespace/simple-infra/sdk-service-build/app.py`
- **Scope client:** `/Users/qiang.han/Documents/mycodespace/Scope/scope/src/scope/server/livepeer_client.py`
- **Scope cloud app:** `/Users/qiang.han/Documents/mycodespace/Scope/scope/src/scope/cloud/livepeer_app.py`
- **go-livepeer LV2V:** `/Users/qiang.han/Documents/mycodespace/livepeer/go-livepeer/server/ai_live_video.go`
