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
| seedream-5-lite | fal-ai/bytedance/seedream/v5/lite/text-to-image | ✅ |
| seedance-i2v | bytedance/seedance-2.0/image-to-video | ✅ |
| seedance-i2v-fast | bytedance/seedance-2.0/fast/image-to-video | ✅ |

**CRITICAL: fal renames models. Always verify with `curl https://fal.ai/models/<model_id>` before adding.**

### Adding / Updating BYOC Capabilities

Capabilities are registered by the inference adapter. The adapter reads `CAPABILITIES_JSON` from `/opt/byoc/.env` on startup and auto-registers each entry with the BYOC orch. No go-livepeer code changes needed.

**Step 1: Find the fal model ID.** Go to `https://fal.ai/models/<model_path>` and confirm the model exists. fal renames models — always verify.

**Step 2: Add to CAPABILITIES_JSON on the VM.** Use Python to avoid shell quoting issues with JSON:
```bash
gcloud compute ssh byoc-staging-1 --zone=us-west1-b --project=livepeer-simple-infra
sudo python3 -c "
import json
with open('/opt/byoc/.env') as f: content = f.read()
# Find the existing CAPABILITIES_JSON line and parse it
for line in content.splitlines():
    if line.startswith('CAPABILITIES_JSON='):
        caps = json.loads(line.split('=', 1)[1])
        break
# Append new capability
caps.append({'name': 'my-new-cap', 'model_id': 'fal-ai/some/model', 'capacity': 2, 'price_per_unit': 3})
# Write back
import re
content = re.sub(r'^CAPABILITIES_JSON=.*$', 'CAPABILITIES_JSON=' + json.dumps(caps), content, flags=re.MULTILINE)
with open('/opt/byoc/.env', 'w') as f: f.write(content)
print(f'Wrote {len(caps)} capabilities')
"
```

**Step 3: Restart the adapter** (must be `down && up`, not `restart`, so compose re-reads `.env`):
```bash
sudo bash -c 'cd /opt/byoc && docker compose down && docker compose up -d'
```

**Step 4: Verify registration:**
```bash
sudo docker logs byoc-adapter --tail 10  # Look for "Registered capability 'my-new-cap'"
curl -s https://sdk.daydream.monster/capabilities | python3 -c "import sys,json; [print(c['name']) for c in json.load(sys.stdin) if 'my-new' in c['name']]"
```

**Step 5: Update storyboard code** (in storyboard-a3 repo):
- `lib/sdk/capabilities.ts` — add to `FALLBACK_CAPABILITIES` set + keyword resolution
- `lib/tools/compound-tools.ts` — add to `FALLBACK_CHAINS` + `selectCapability` routing + user mention detection
- `CLAUDE.md` — update capabilities table and count

**Each capability entry:**
```json
{"name": "capability-name", "model_id": "fal-ai/vendor/model", "capacity": 2, "price_per_unit": 3}
```
- `name`: short kebab-case name used in storyboard code (e.g., `seedance-i2v`)
- `model_id`: exact fal model path (e.g., `bytedance/seedance-2.0/image-to-video`). Some models omit the `fal-ai/` prefix.
- `capacity`: max concurrent jobs (2 for video/3D, 4 for image/audio)
- `price_per_unit`: relative cost tier (1=cheap, 5=expensive)

**Common mistakes:**
- Using `docker restart` instead of `down && up` — won't re-read `.env`
- Using `sed` or shell quoting for JSON — use Python instead, JSON with `{}` breaks shell interpolation
- Wrong model_id — fal renames models; verify the URL works first
- The BYOC VM is `byoc-staging-1` (not `byoc-a3-staging-1` — that VM no longer exists)

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
| Publish 404 (fresh stream) | Graph in start_stream? "start_stream returned 2 channels"? |
| Publish 410 Gone | SDK restarted — stream session lost. Client should auto-stop on first 410. Restart the stream from the UI. |
| Publish OK but no output | Edge format correct? Pipeline node ID = pipeline_id? |
| Output OK but black screen | Card renders as `<img>` not `<video>`? |
| SDK unreachable from CLI but browser works | GCP metadata server failure mode — `gcloud compute instances reset sdk-staging-1 --zone=us-west1-b --project=livepeer-simple-infra` then `cd /opt/sdk && sudo docker compose down && sudo docker compose up -d` to recreate the stale docker network |

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
- **SDK returns HTTP 410 Gone for unknown stream IDs** — the publish handler checks both `_stream_sessions` and `_lv2v_jobs` first; if neither has the stream, it raises `HTTPException(410, "Stream no longer exists")`. Client treats first 410 as terminal and stops immediately. This is the primary defense against zombies after SDK restarts (the in-memory state is wiped but browsers don't know).

### LV2V Failure Pattern: SDK Restart → Browser Zombies (RECURRING)

**Symptom:** User reports "videos work sometimes, fail other times" with `404` or `410` on `/stream/{id}/publish?seq=NNNN` where seq is in the thousands.

**Root cause chain:**
1. SDK container crashes/restarts (commonly OOM `Exited (137)` under load, or the GCP metadata-server failure mode)
2. `_stream_sessions` and `_lv2v_jobs` dicts are wiped (in-memory only)
3. Browser tabs holding old streams keep publishing frames at 10fps to dead stream IDs
4. Newly-started streams work fine (they get fresh IDs in the new SDK process)
5. Old streams should auto-stop on the first 410 — verify the client has the 410-handling code in `lib/stream/session.ts`

**Diagnosis steps:**
```bash
# 1. Is the SDK reachable?
curl -s --max-time 10 -o /dev/null -w "%{http_code}\n" https://sdk.daydream.monster/capabilities

# 2. What containers are running?
gcloud compute ssh sdk-staging-1 --zone=us-west1-b --project=livepeer-simple-infra --command="sudo docker ps -a --format '{{.Names}} {{.Status}}'"

# 3. Why did sdk-service exit? (137 = SIGKILL/OOM, 0 = clean restart)
gcloud compute ssh sdk-staging-1 --zone=us-west1-b --project=livepeer-simple-infra --command="sudo docker inspect sdk-service --format '{{.State.OOMKilled}} {{.State.ExitCode}} {{.RestartCount}}'"

# 4. Recent healthcheck activity?
gcloud compute ssh sdk-staging-1 --zone=us-west1-b --project=livepeer-simple-infra --command="sudo tail -30 /var/log/sdk-healthcheck.log"

# 5. List active streams (server-side state)
curl -s https://sdk.daydream.monster/streams | python3 -m json.tool

# 6. Test publish to a known-dead stream — should return 410, not 404
curl -X POST -H "Content-Type: image/jpeg" --data-binary "test" "https://sdk.daydream.monster/stream/DEADBEEF/publish?seq=1" -w "\nHTTP %{http_code}\n"
```

**Recovery steps (in order):**
```bash
# A. Server-side cleanup (kills any zombies still in SDK memory)
curl -X POST https://sdk.daydream.monster/streams/cleanup

# B. If SDK is unreachable but VM is RUNNING — likely the GCP metadata bug
gcloud compute instances reset sdk-staging-1 --zone=us-west1-b --project=livepeer-simple-infra

# C. After reset, the docker network reference is stale — rebuild it
gcloud compute ssh sdk-staging-1 --zone=us-west1-b --project=livepeer-simple-infra --command="cd /opt/sdk && sudo docker compose down && sudo docker compose up -d"

# D. Verify SDK is back
curl -s https://sdk.daydream.monster/capabilities | head -c 200
```

**Why 410 instead of 404:** The old SDK fell through to a non-existent BYOC trickle URL which returned 404. The client treated 404 as "transient" and only auto-stopped after 30 consecutive failures — which rarely happened because the orch returned mixed results. Now the SDK returns 410 immediately for unknown stream IDs, and the client stops on the very first one. See `lib/stream/session.ts` — look for `if (r.status === 410)` in `startPublishing`.

**Why this keeps happening:** LV2V stream sessions are intentionally ephemeral — persisting them across SDK restarts would create stale-state bugs and slow startup. The right pattern is "server says I'm gone clearly, client trusts it and stops." The 410 fix is the systematic defense; the underlying SDK crash is a separate operational concern (memory limits on the e2-medium VM, fal runner bugs, etc).

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

### SDK VM Health Check (current state — as of 2026-04-12)
`/opt/sdk/healthcheck.sh` runs every 2 minutes via cron on sdk-staging-1 but now does **only** a GCP metadata-server probe. If the metadata server fails twice in a row the script reboots the VM. There is no longer any probe of the SDK process itself — recovery for the SDK is entirely delegated to uvicorn (multi-worker, below) and Docker's `restart: always` policy.

**Why the SDK probe was removed (important — don't put it back):** the old script polled `/capabilities` with a 5s+15s timeout and `docker restart sdk-service` after 3 fails. Because `/capabilities` did a synchronous HTTP round-trip to the BYOC orch from inside an async handler on a single uvicorn worker, any `ltx-i2v` video render (20–60s on BYOC) would stall the event loop long enough to trip the probe. The cron then killed the container **every 2 minutes during video gen**, which also killed any concurrent `/stream/start` POSTs mid-flight — this looked like "LV2V failing before reaching fal.ai" because the CORS preflight 200'd but the POST was dropped when the container bounced. Script backup: `/opt/sdk/healthcheck.sh.bak`. Compose backup: `/opt/sdk/docker-compose.yaml.bak`.

### SDK uvicorn config (current state — as of 2026-04-12, post-revert)
`/opt/sdk/docker-compose.yaml` overrides the image CMD with:
```
command: uvicorn app:app --host 0.0.0.0 --port 8000 --workers 1
```
**Must stay at `--workers 1`.** LV2V session state in `app.py` is module-level in-process dicts (`_stream_sessions` at line ~1330, `_lv2v_jobs` at line ~1191). With multi-worker uvicorn, each worker has its own copy, and `/stream/start` + subsequent `/stream/{id}/publish` / `/stream/{id}/frame` calls get load-balanced across workers by the OS accept queue. Non-owning workers return 410 Gone, `lib/stream/session.ts:167` treats the first 410 as terminal and auto-stops the stream, and LV2V dies within one frame while the fal runner keeps rolling. An earlier attempt to set `--workers 4` to fix an unrelated blocking problem broke LV2V this way — confirmed and reverted 2026-04-12.

**How the original blocking problem is addressed:**
- **Non-blocking I/O:** Every blocking call inside an `async def` handler is wrapped in `await asyncio.to_thread(fn, *args)`. That includes `submit_byoc_job` (`/inference`, `/train`, `/enrich`), `submit_training_job`, `get_training_status`, `wait_for_training`, `list_capabilities` (`/capabilities` cache miss), `_llm_call`, `_resolve_daydream_user_id`, `_orch_request`. A 64-thread default `ThreadPoolExecutor` is installed at app startup to handle this. `asyncio.to_thread` copies `contextvars.Context` into the worker thread so `_current_signer_headers` still propagates — this is why `to_thread` is used instead of `run_in_executor`.
- **`/capabilities` in-process cache with 60s TTL + stale-on-error.** Hot path has no orch round-trip, so a stalled `/inference` (in the rare case one still slips through the non-blocking wrap) doesn't stall the probe the frontend hammers on every page load.
- **Healthcheck cron no longer probes the SDK at all**, so a busy worker can't trigger a container restart.
- **Per-stream `asyncio.Lock`** for `/stream/{id}/publish`, keyed by `stream_id` in `_publish_locks: dict[str, asyncio.Lock]`. Prevents the go-livepeer trickle server's 5-slot ring buffer (`trickle_server.go:82`) from slot-evicting an in-flight segment when a later seq catches up. Created in `/stream/start`, popped in `/stream/stop` and by the reaper.
- **LV2V stream reaper** (new, scans `_lv2v_jobs` every 30s, kills idle >120s or age >3600s). Fixes a pre-existing leak where browser crashes without `/stream/stop` left orphan session state forever. Also cleans up `_publish_locks` entries.

All of the above landed in `livepeer/simple-infra#11` (`feat/sdk-nonblocking-io` branch off `feat/sdk-capabilities-cache`). Verified by a 9-test e2e suite running against live sdk-staging-1. See `docs/superpowers/specs/2026-04-12-sdk-nonblocking-io-design.md` and `docs/superpowers/plans/2026-04-12-sdk-nonblocking-io.md`.

**Do not "fix" this by adding more workers** until LV2V session state is moved to a shared store (Redis, sqlite, or equivalent). With `asyncio.to_thread` on every blocking call, a single worker handles arbitrary concurrent load without session-state coherency issues. Multi-worker is neither needed nor safe.

### Tier 1 resilience (as of 2026-04-16)
Five improvements deployed on `feat/sdk-nonblocking-io` (commit `b7ed3ec`), all in app.py only — zero gateway library changes:

1. **Structured error responses** — `/stream/start` and `/inference` error paths now return `{"error":"...", "rejections":[{"url":"...","reason":"..."}], "hint":"..."}` instead of bare strings. Clients can parse rejection details and show actionable hints.
2. **Per-orch rejection logging** — every `NoOrchestratorAvailableError` logs each orch's URL + rejection reason at ERROR level. Eliminates the "30-min debug cycle" pattern from 2026-04-15.
3. **Deposit-aware hint** — when LV2V 503s because `ticket faceValue > max faceValue`, the error includes: `"hint": "Broadcaster deposit too low for LV2V ticket. Fund the signer wallet on Arbitrum."`. Would have diagnosed the 2026-04-15 LV2V outage in 2 seconds.
4. **Signer failover (SIGNER_URLS)** — new env var, comma-separated. `_signer_request_with_retry` tries each URL with one retry on 5xx/network errors. Handles mid-restart LB gaps.
5. **Graceful shutdown** — `@app.on_event("shutdown")` explicitly stops every active LV2V stream via `job.stop()`, cleans up `_publish_locks`, `_stream_started_at`, `_stream_last_publish`. Prevents the "SDK restart → browser publishes to dead streams → 404 → 410 cascade" pattern.

### /capabilities caching (as of 2026-04-12)
`/capabilities` in app.py is wrapped with a 60s in-process TTL cache plus stale-on-error fallback. Capability lists only change on byoc-orch deploy, so 60s is fine. Single uvicorn worker = single cache, so worst case is 1 orch hit per minute. On refresh failure, the old list is returned rather than an empty response — a transient orch blip no longer blanks out the capability registry in every browser tab. The change is on `feat/sdk-capabilities-cache` in `livepeer/simple-infra` (commits `3019c51` baseline snapshot + `cc2aa23` feat), and landed for real on `feat/sdk-nonblocking-io` (#11). Currently hot-patched onto the running container via `docker cp`; will be baked in on next SDK image rebuild.

### GCP Monitoring
- Uptime check every 5 minutes on `https://sdk.daydream.monster/health` (**changed 2026-04-12** — was `/capabilities`; switched because `/capabilities` depends on the BYOC orch being reachable, so a BYOC outage was paging the SDK oncall).
- `/health` is in-process (`return {"status": "ok", "orchestrator": ORCH_URL}`) — no I/O, instant response, only fires when the SDK is actually down.
- Alert policy emails `sean@livepeer.org` if check fails for 5+ minutes.
- Uptime check ID: `sdk-service-health-xI5Sggu-Fq8`
- Alert policy ID: `projects/livepeer-simple-infra/alertPolicies/10364248248890653369`

### Common VM Failure Mode
GCP metadata server (`169.254.169.254`) becomes unreachable → snapd crash-loops → SSH hangs → all services degrade. Fix: `gcloud compute instances reset sdk-staging-1 --zone=us-west1-b --project=livepeer-simple-infra`. After a reset the docker network reference can be stale — follow with `cd /opt/sdk && sudo docker compose down && sudo docker compose up -d` to rebuild it.

### Lessons from the 2026-04-11 outage (don't relearn these)
- **"SDK keeps crashing during video gen"** is almost never OOM or a code crash. Check `OOMKilled`, `ExitCode`, and kernel `dmesg` first — if they're clean, it's healthcheck-driven or worker-exhaustion, not a real death.
- **Symptom correlation check:** grep SDK logs for `Started server process` (restart marker) and correlate with `ltx-i2v` dispatch lines. A 1:1 cadence = healthcheck killing a busy server, not a memory problem.
- **"LV2V stream failed without hitting fal"** + no POST to `/stream/start` in SDK logs (only the OPTIONS preflight) = the POST was dropped because the container bounced between preflight and POST. Root cause is upstream of LV2V — look at why the container bounced.
- **Do not add a new external process killer** as a reaction to "SDK feels slow." The right fix is always either more workers or cheaper endpoints. External killers misdiagnose busy as dead.
- **Hot-patching app.py:** `gcloud compute scp app.py sdk-staging-1:/tmp/ ; docker cp /tmp/app.py sdk-service:/app/app.py ; docker restart sdk-service`. This is ephemeral — a `docker compose up -d` (e.g. from editing compose) **recreates** the container from the image and wipes the hot patch. Bake important changes into the image, not just the running container.
- **The deployed SDK image is built from source that isn't in any branch of `simple-infra`** (1788 lines vs the 2172 on `feat/scope-advanced-params`). The baseline is now captured on `feat/sdk-capabilities-cache` — future SDK source changes should branch from there.
- **Multi-worker uvicorn breaks LV2V on this service.** `_stream_sessions` and `_lv2v_jobs` are per-process dicts; 4 workers means 3 out of every 4 publish/poll requests hit a worker that doesn't know about the stream and return 410 Gone, which the client treats as terminal. Symptom: stream "starts" (card shows streaming), then card turns black within one frame while the fal runner keeps running (it was already dispatched and doesn't know the SDK lost track). If you're ever tempted to add workers again to fix a latency problem, move LV2V state to a shared store first — or wrap the blocking BYOC call in `asyncio.to_thread` instead so a single worker can handle concurrent requests.
- **Test thresholds calibrated to single happy-path runs are flaky.** During the non-blocking I/O PR (`#11`), T3 was initially asserting on `/stream/start` total duration under 15s — which was true in one run (34.1s), false in another (17.9s), and catastrophically false in a third (111.3s) because fal Scope runner cold-start variance swings wildly. The fix was to decouple the test from total duration and instead measure the actual invariant ( `/health` p95 during the crossfire window) which is immune to fal warmth. Similarly T1/T2/T7 thresholds had to be relaxed from "sub-100ms" (calibrated for in-VM probes) to "sub-1500ms" (calibrated for over-the-internet through Caddy+TLS). Rule: tests should measure invariants, not proxies, and thresholds should be loose enough to tolerate ambient jitter while tight enough to catch multi-second regressions.
- **Verifying a lock from inside the lock is tautological.** T4 initially tried to verify the per-stream publish lock by reading `Lp-Trickle-Seq` response headers, but the SDK's MPEG-TS publisher batches frames and doesn't expose per-frame seqs. Then tried timing-based verification, but the un-locked portions of each request (HTTP parse, body read, lock acquire wait) dwarf the in-lock work, so wall-clock measurements show high "parallelism" even when the lock is serializing the protected region. Final design: direct in-lock instrumentation via a thread-safe `_publish_in_lock_max: dict[str, int]` counter updated inside `async with lock:` and exposed via `/debug/stream/{id}/publish-stats`. Assert `in_lock_max == 1`. This IS tautological if you trust your code, but that's fine — the test's purpose is to fail-loudly if a future refactor moves the lock out of scope.

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

## SKILL: Slash Commands — /story, /film, /stream, /briefing

### /story — Multi-scene story generator
```
/story <concept>        — generate 6-scene story with style + characters
/story list             — recent stories
/story apply [id]       — create project + generate images
/story show <id>        — re-display a saved story
```
Architecture: Gemini generates JSON (title, audience, arc, context, 6 scenes) → user reviews in StoryCard → apply calls project_create + project_generate directly (image fast path, 0 LLM tokens). Natural-language apply: "yes", "apply them", "I like it".
Files: `lib/story/`, `components/chat/StoryCard.tsx`, `skills/storyteller.md`

### /film — 4-shot mini-film with camera directions
```
/film <concept>         — generate 4-shot film script
/film/load <genre>      — load genre skill (animation, action, documentary, noir, scifi)
/film apply [id]        — generate key frames → animate each to video via kling-i2v
/film skills            — list available genre skills
```
Architecture: Gemini generates JSON (title, style, character_lock, 4 shots with camera directions) → user reviews in FilmCard → apply calls project_create + project_generate + per-shot create_media(animate) + canvas_organize(narrative). Auto-detects genre from keywords.
Files: `lib/film/`, `components/chat/FilmCard.tsx`, `skills/film-*.md`

### /stream — Live stream with prompt traveling
```
/stream <concept>       — plan multi-scene live stream
/stream apply [id]      — start stream, scenes transition automatically
/stream stop            — stop active stream
/stream list            — recent stream plans
```
Architecture: Gemini generates JSON (title, style, graph_template, 3-6 scenes with prompts/presets/durations) → user reviews in StreamPlanCard with visual timeline → apply calls scope_start with Scene 1 → setTimeout schedules scope_control for each subsequent scene → scope_stop auto-fires after total duration. Each transition updates the prompt + preset via the Scope control API. Like "prompt traveling" through a visual story.

Key concept: **prompt traveling** — the stream's visual content evolves over time as the prompt changes scene-by-scene. The viewer sees the stream morph from one scene to the next, creating a narrative arc in real-time.
Files: `lib/stream-cmd/`, `components/chat/StreamPlanCard.tsx`

### Daily Briefing — Email-powered visual deck
```
daily briefing [style]  — fetch Gmail → generate visual slides
```
Styles: modern, dark, light, colorful, corporate, scenic, vivid, isometric, iso, lego
Requires Gmail MCP connection (local server at scripts/gmail-mcp-server.ts).
Architecture: briefing fast path in gemini/index.ts → gmail_list via MCP → LLM summarization → analyzeEmail (urgency/action/date) → project_create + project_generate → canvas_organize → caption banners with CaptionBanner component (date=cyan, action=amber, expandable). Cover slide uses coverText field.

### /talk — Talking Video with Voice Cloning
```
/talk <text> --face <card>                Generate talking video with default voice
/talk <text> --face img-1 --voice aud-2   Clone voice from audio card
```
Pipeline: `chatterbox-tts` (text + optional `audio_url` for voice clone) → `talking-head` (image + audio → lip-synced video).
Right-click image card → "Talking Video" for the UI version (multi-step dialog: text → voice picker).
Import voice samples: right-click canvas → Import → select .wav/.mp3 file.
Files: `lib/skills/commands.ts` (handleTalk), `components/canvas/ContextMenu.tsx` (talking-video action)

### /project — Project Management
```
/project list              — show all projects (blue clickable names)
/project show [name]       — details + scene list of active or named project
/project switch <name>     — set as active (partial match works)
/project add <brief>       — create empty project
/project replay [name]     — regenerate all scenes from stored prompts
/project clear             — remove all projects
```
Projects auto-created by agent. Friendly names from brief ("ev-bikes", "sunset-story"). Capped at 30 in localStorage.
Cards get project-prefixed refIds: `ev-bikes.img-1` instead of bare `img-1`.
ProjectListCard renders with blue names, switch buttons, active badge.
Files: `lib/projects/commands.ts`, `components/chat/ProjectListCard.tsx`, `lib/projects/store.ts`

### /analyze — Image/Video Analysis via Gemini Vision
```
/analyze <card-name>       — extract style, characters, setting, mood from image/video
```
Right-click card → "Analyze Media" for the UI version.
Sends media to Gemini 2.5 Flash vision → extracts CreativeContext (style, palette, characters, setting, mood, description).
Auto-applies as creative context if none exists. Supports images and short videos (<15MB).
Files: `lib/tools/image-analysis.ts`, `lib/skills/commands.ts` (handleAnalyze)

### /stream graphs — Scope Graph Management
```
/stream graphs              — list built-in + saved graph templates
/stream graphs save <name>  — save last stream's graph for reuse
/stream graphs remove <name> — delete a saved graph
```
6 built-in templates: simple-lv2v, depth-guided, scribble-guided, interpolated, text-only, multi-pipeline.
User-saved graphs persisted in localStorage (max 20). Referenced by name in `/stream` plans.
Skill reference: `skills/scope-graph-builder.md` — full pipeline/node/param reference.
Files: `lib/stream-cmd/graph-store.ts`, `lib/stream-cmd/commands.ts`, `lib/stream/scope-graphs.ts`

### Canvas Time Machine — undo/redo + snapshots
```
Cmd+Z                        Undo last canvas action
Cmd+Shift+Z                  Redo
/snapshot save <name>         Named checkpoint (persists in localStorage)
/snapshot restore <name>      Restore saved state (pushes current to undo first)
/snapshot list                Show all named snapshots
/snapshot delete <name>       Remove a snapshot
```
History manager: `packages/creative-kit/src/stores/history-manager.ts`. In-memory undo/redo (max 50), localStorage snapshots (max 20). Canvas store wraps every mutating action with `pushUndo()`.

### Variation Grid — generate 4, pick 1
```
/vary <card-refId>            Generate 4 alternatives (mixed strategy)
Right-click card → "Variations (x4)"
```
Strategies: seed (same model, different seeds), model (alternate models), prompt (prompt tweaks), mixed (default: 1 seed + 1 model + 2 prompt variations). All 4 run in parallel via create_media. Creative memory learns from which you keep.
Files: `packages/creative-kit/src/agent/variation-engine.ts`

### Final Cut Composer — render canvas to video
```
/render                       Render all canvas cards into a single video
/render <project>             Render a specific project's scenes
/render <project> --music aud-1  Add background music from an audio card
```
Browser-side via MediaRecorder + canvas.captureStream(30fps). Supports crossfade/cut/fade-black transitions. Music mixed via Web Audio API. Output: WebM video (auto-download + canvas card).
Files: `packages/creative-kit/src/agent/render-engine.ts`

### Face Lock — character consistency across scenes
```
/facelock <card-refId>        Lock character reference for this project
/facelock                     Show current lock status
/facelock clear               Remove the lock
```
How it works: When face lock is active, all `generate`/`restyle` actions route through `kontext-edit` with the locked image as `image_url`. For `animate`, the locked image becomes the first frame. This preserves face identity because kontext-edit is an image-edit model that retains the source face.
Limitations: This is reference-image consistency, not face-ID embedding (no IP-Adapter on BYOC). Works well for same-character-different-scene, less well for radically different poses.
Injection point: `lib/tools/compound-tools.ts` — 15-line conditional block before inference closure capture.

### Social Export — platform-ready crops
```
/export social instagram      1080x1080 center-crop
/export social tiktok          1080x1920 portrait
/export social youtube         1920x1080 landscape
/export social twitter         1200x675
/export social all             All platforms at once
```
Smart crop with face-bias heuristic (biases toward top 1/3 when cropping vertically). Currently images only; video cropping planned.
Files: `packages/creative-kit/src/agent/social-export.ts`

### Creative Tools — context menu + slash commands
| Tool | Context Menu | Slash Command | Capability |
|---|---|---|---|
| Variations | 🔀 right-click card | `/vary <card>` | mixed strategy |
| LEGO Style | 🧱 right-click card | `/lego <desc>` | kontext-edit |
| Make Logo | 🎨 right-click card | `/logo <desc>` | kontext-edit / flux-dev |
| Replace Object | 🔄 right-click card | — | kontext-edit |
| Isometric | ◆ right-click card | `/iso <desc>` | kontext-edit / flux-dev |
| Virtual Try-On | 👕 right-click card | `/tryon <person> <garment>` | fashn-tryon |
| Video Try-On | 🎥 right-click card | — | fashn-tryon → seedance/veo/ltx |
| Talking Video | 🗣 right-click card | `/talk <text> --face <card>` | chatterbox-tts → talking-head |
| Weather Effect | ⛅ right-click card | — | kontext-edit → kling-i2v |
| Cinematic Video | 🎬 right-click card | — | seedance-i2v (up to 15s + audio) |
| Analyze Media | 🔍 right-click card | `/analyze <card>` | Gemini Vision |
| Edit with GPT Image | ✏️ right-click card | — | gpt-image-edit |
| Product Briefing | 📋 right-click card | — | gpt-image-edit |
| GPT Image 2 | 🎨 right-click canvas | — | gpt-image (text, logos, products) |
| Convert to 3D | 🖥 right-click card | — | tripo-i3d |
| Import Media | 📁/🔗 right-click canvas | — | image/video/audio (GCS upload) |

### Capabilities (41 on BYOC orch)
Image: flux-dev, flux-schnell, recraft-v4, gemini-image, nano-banana, flux-flex, seedream-5-lite
Edit: kontext-edit, flux-fill
Video T2V: veo-t2v, ltx-t2v, pixverse-t2v
Video I2V: veo-i2v, ltx-i2v, pixverse-i2v, kling-i2v, seedance-i2v, seedance-i2v-fast
Video misc: veo-transition, pixverse-transition, pixverse-ref2v, void-inpaint
TTS: chatterbox-tts, gemini-tts, inworld-tts, grok-tts
3D: tripo-t3d, tripo-i3d, tripo-mv3d, tripo-p1-t3d, tripo-p1-i3d
GPT: gpt-image, gpt-image-edit
Other: bg-remove, topaz-upscale, lipsync, music, sfx, face-swap, sam3, talking-head, fashn-tryon
Fallback chains: all video/image/TTS models have 2-4 siblings for automatic retry on failure.
Seedance 2.0: primary i2v model for /film and context menu animate. Up to 15s cinematic video with audio.

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

### Slash Commands
- `lib/story/` — /story generator, store, commands, storyteller prompt
- `lib/film/` — /film generator, store, commands, film prompt + 5 genre skills
- `lib/stream-cmd/` — /stream generator, store, commands, stream prompt
- `components/chat/StoryCard.tsx` — Story card (purple theme, per-scene copy/edit)
- `components/chat/FilmCard.tsx` — Film card (orange theme, camera icons)
- `components/chat/StreamPlanCard.tsx` — Stream card (cyan theme, visual timeline)

### MCP
- `lib/mcp/client.ts` — MCP tool discovery + execution (discoverToolsViaProxy, executeToolCallViaProxy)
- `lib/mcp/store.ts` — MCP server persistence (localStorage)
- `lib/mcp/types.ts` — McpServerConfig, McpToolDef, MCP_PRESETS (5 presets including Gmail Local)
- `app/api/mcp/discover/route.ts` — Server-side MCP discovery proxy (CORS bypass)
- `app/api/mcp/call/route.ts` — Server-side MCP tool execution proxy
- `app/api/mcp/auth/route.ts` — OAuth 2.0 + PKCE flow for Anthropic remote MCP
- `scripts/gmail-mcp-server.ts` — Local Gmail MCP server (Google OAuth + 3 tools)

### Skills (23 total)
- `skills/scope-agent.md` — Scope Domain Agent: full parameter reference + natural language mapping
- `skills/director.md` — Director workflow + Scope integration for multi-stream orchestration
- `skills/base.md` — Base system prompt (rules for create_media, project_create routing)
- `skills/scope-lv2v.md`, `skills/live-director.md`, `skills/scope-graphs.md` — LV2V reference
- `skills/seedance-cinematic.md` — Seedance 2.0 cinematic video: prompt craft, film integration, duration guide

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
