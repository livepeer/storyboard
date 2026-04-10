# Scope Advanced Integration Plan

## Status: DRAFT
## Date: 2026-04-10

---

## Executive Summary

Bring Scope's full power into Storyboard through a **Scope Domain Agent** — an expert subsystem that knows Scope's graph engine, pipelines, LoRA system, VACE features, and parameter space intimately. This agent operates as part of the Director framework, translating natural language into precise Scope configurations, managing stream lifecycles, and surfacing Scope's advanced features through an intuitive canvas experience.

**Key insight:** Scope runs in cloud mode on fal.ai — the SDK proxies control messages. We should NOT re-implement Scope's internals. Instead, we build an intelligent control layer that composes the right graph configs, parameters, and LoRA setups, then sends them through the existing SDK→fal pipeline.

---

## Phase 0: Research & Sync (Pre-work)

### 0.1 Pull Latest Scope Code
```bash
cd ~/Documents/mycodespace/Scope/scope && git pull origin main
```

### 0.2 Key Scope Architecture (from research)

| Component | What It Does | Key File |
|-----------|-------------|----------|
| **Graph Engine** | DAG of source→pipeline→sink nodes with port-based routing | `server/graph_schema.py`, `server/graph_executor.py` |
| **Pipelines** | AI model wrappers (longlive, streamdiffusionv2, krea, memflow, etc.) | `core/pipelines/*/pipeline.py` |
| **LoRA System** | 3 merge strategies (permanent, runtime_peft, module_targeted) | `core/pipelines/wan2_1/lora/manager.py` |
| **VACE** | Reference-to-video, video-to-video, inpainting, first/last frame | `server/schema.py` (vace_* params) |
| **Modulation** | Beat-synced parameter oscillation (sine, saw, square, etc.) | `server/modulation.py` |
| **Cloud Runner** | fal.ai WebSocket → trickle channels → MPEG-TS I/O | `cloud/livepeer_app.py` |
| **Control Protocol** | JSONLWriter for start_stream, parameters, stop | `server/livepeer_client.py` |

### 0.3 Current SDK LV2V Support (gap analysis)

**What works today:**
- Single linear graph: source→longlive→sink
- Prompt updates via `/stream/{id}/control`
- MPEG-TS publish/subscribe (webcam frames)
- Stream start/stop lifecycle

**What's missing:**
- Custom graph composition (multi-pipeline, preprocessing chains)
- LoRA loading/management
- VACE parameters (ref images, context scale, input video mode)
- Non-webcam inputs (image, video, URL)
- Advanced parameters (noise_scale, denoising_steps, cache control, seed)
- Per-node parameter targeting (node_id in updates)
- Multi-stream support with independent controls
- Audio output handling
- Graph templates / presets

---

## Phase 1: Scope Domain Agent

**Goal:** A specialized agent skill that translates natural language into precise Scope configurations.

### 1.1 Scope Agent Skill (`skills/scope-agent.md`)

A comprehensive skill document containing:
- Full parameter reference (every field from `schema.py` with ranges and effects)
- Graph composition patterns (linear, branching, preprocessing chains)
- Pipeline catalog with capabilities and VRAM requirements
- LoRA usage guide (merge strategies, when to use each)
- VACE mode reference (R2V, V2V, animate-anything, FFLF, inpainting)
- Common recipes: "make it dreamy" → noise_scale=0.7 + lower denoising steps

### 1.2 Scope Parameter Mapper (`lib/stream/scope-params.ts`)

```typescript
interface ScopeGraphConfig {
  nodes: Array<{
    id: string;
    type: "source" | "pipeline" | "sink" | "record";
    source_mode?: "video" | "camera";
    pipeline_id?: string;
    tempo_sync?: boolean;
  }>;
  edges: Array<{
    from: string;
    from_port: string;
    to_node: string;
    to_port: string;
    kind: "stream" | "parameter";
  }>;
}

interface ScopeStreamParams {
  pipeline_ids: string[];
  prompts: string | PromptItem[];
  graph: ScopeGraphConfig;
  // Advanced
  noise_scale?: number;        // 0.0-1.0, video mode strength
  noise_controller?: boolean;
  denoising_step_list?: number[];
  base_seed?: number;
  manage_cache?: boolean;
  reset_cache?: boolean;
  kv_cache_attention_bias?: number;  // 0.01-1.0
  // VACE
  vace_enabled?: boolean;
  vace_ref_images?: string[];
  vace_use_input_video?: boolean;
  vace_context_scale?: number;  // 0.0-2.0
  // LoRA
  lora_path?: string;
  lora_merge_strategy?: "permanent_merge" | "runtime_peft" | "module_targeted";
  lora_scales?: Array<{ adapter_name: string; scale: number }>;
  // First/Last frame
  first_frame_image?: string;
  last_frame_image?: string;
  // Input
  input_mode?: "text" | "video";
  // Per-node targeting
  node_id?: string;
}
```

### 1.3 Graph Templates (`lib/stream/scope-graphs.ts`)

Pre-built graph configs for common use cases:

| Template | Graph | Use Case |
|----------|-------|----------|
| `simple-lv2v` | source→longlive→sink | Basic webcam/video transform |
| `depth-guided` | source→depth_anything→longlive→sink | Depth-preserving transform |
| `scribble-guided` | source→scribble→longlive→sink | Edge-guided generation |
| `interpolated` | source→longlive→rife→sink | Smoother output (2x frame interp) |
| `text-only` | (no source)→longlive→sink | Pure text-to-video generation |
| `multi-pipeline` | source→pipeline_a→pipeline_b→sink | Chained transforms |

### 1.4 Scope Agent Tool (`lib/tools/scope-tools.ts`)

New tools exposed to the agent:

```
scope_start      — Start LV2V with full Scope config (graph, params, LoRA, VACE)
scope_control    — Update parameters mid-stream (prompt, noise, denoising, per-node)
scope_stop       — Stop a stream
scope_graph      — Build/validate a graph config from description
scope_lora       — Load/unload LoRA adapter (HuggingFace, CivitAI, URL)
scope_preset     — Apply a named preset (dreamy, cinematic, anime, etc.)
scope_status     — Get stream health, FPS, current params
```

### 1.5 Agent Integration

Register as a Director sub-agent:
- When user mentions "stream", "live", "lv2v", "scope", "real-time" → route to Scope agent
- Scope agent has full parameter knowledge, composes the optimal config
- Falls back to simple presets for vague requests ("make it look cool")
- Explains what it's doing in plain language

**Files to create/modify:**
- `skills/scope-agent.md` — comprehensive Scope knowledge base
- `lib/stream/scope-params.ts` — TypeScript types and validators
- `lib/stream/scope-graphs.ts` — graph template library
- `lib/tools/scope-tools.ts` — agent-facing tools
- `lib/tools/registry.ts` — register scope tools

---

## Phase 2: Enhanced SDK Proxy

**Goal:** Extend the SDK's `/stream/*` endpoints to pass through Scope's full parameter space. Minimal changes — the SDK is a proxy, not a reimplementation.

### 2.1 SDK Changes Required

The SDK currently hardcodes a simple linear graph. We need to:

**`/stream/start` — accept full graph + params:**
```python
# Current: only accepts model_id and prompt
# New: accepts full ScopeStreamParams
@app.post("/stream/start")
async def start_stream(request: Request):
    body = await request.json()
    params = body.get("params", {})
    
    # Extract graph (use default linear if not provided)
    graph = params.pop("graph", None) or default_linear_graph(params.get("pipeline_ids", [LV2V_PIPELINE]))
    
    # Pass ALL params through to start_stream control message
    # (SDK should not filter — Scope handles validation)
    start_stream_params = {
        "pipeline_ids": params.get("pipeline_ids", [LV2V_PIPELINE]),
        "prompts": params.get("prompts", params.get("prompt", "transform this scene")),
        "graph": graph,
        **{k: v for k, v in params.items() if k not in ("pipeline_ids", "prompts", "prompt", "graph")},
    }
```

**`/stream/{id}/control` — already passthrough** (no changes needed)

**`/stream/start` — accept input_mode for non-webcam sources:**
- `input_mode: "text"` → no publish needed, pure t2v
- `input_mode: "video"` → standard webcam/video publish

**SDK changes are minimal:** Just pass through the full params dict instead of hardcoding. The fal runner handles all Scope validation.

### 2.2 LoRA Support via SDK

LoRAs are loaded by the fal runner at stream start. The SDK just passes params:
```python
start_stream_params = {
    "lora_path": "/path/or/url/to/lora.safetensors",
    "lora_merge_strategy": "permanent_merge",
    ...
}
```

**No SDK changes needed for LoRA** — it's just another param passed through.

### 2.3 VACE Support via SDK

Same pattern — pass through:
```python
start_stream_params = {
    "vace_enabled": True,
    "vace_ref_images": ["https://example.com/ref.jpg"],
    "vace_context_scale": 1.5,
    ...
}
```

**No SDK changes needed for VACE.**

### 2.4 Summary of SDK Changes

| Change | Effort | Risk |
|--------|--------|------|
| Pass full params dict (not just prompt) in start_stream | Small | Low — additive |
| Accept custom graph in `/stream/start` | Small | Low — fallback to default |
| Return pipeline_ids in `/stream/status` | Trivial | None |
| **Total SDK delta: ~30 lines** | | |

---

## Phase 3: Multi-Source Input Support

**Goal:** Let users start LV2V from webcam, canvas image, canvas video, or a URL.

### 3.1 Input Source Types

| Source | How It Works | Canvas Behavior |
|--------|-------------|----------------|
| **Webcam** | Browser `getUserMedia` → JPEG publish to trickle | Camera widget (existing) |
| **Canvas image** | Fetch image URL → encode as JPEG → publish as repeated frame | Shows original image card + stream output card |
| **Canvas video** | Extract frames from `<video>` element → publish as JPEG stream | Shows original video card + stream output card |
| **URL (user provides)** | Fetch video → extract frames → publish | Creates source card (plays original) + stream output card |
| **Text only** | No publish, `input_mode: "text"` | Only stream output card |

### 3.2 Frame Extraction Service (`lib/stream/frame-extractor.ts`)

```typescript
interface FrameSource {
  type: "webcam" | "image" | "video" | "url";
  source: MediaStream | string;  // MediaStream for webcam, URL for others
}

class FrameExtractor {
  // Webcam: capture from video element via canvas
  // Image: draw to canvas, export as JPEG blob (repeated at target FPS)
  // Video: play hidden <video>, capture frames via canvas at playback rate
  // URL: same as video, but fetch URL first
  
  getFrame(): Promise<Blob>;  // Returns JPEG blob for MPEG-TS encoding
  start(fps: number): void;
  stop(): void;
}
```

### 3.3 Source Selection in Agent

The `scope_start` tool accepts a `source` parameter:

```typescript
scope_start({
  source: { type: "canvas_card", ref_id: "image_1234" },  // Use card as input
  prompt: "transform into anime style",
  graph: "simple-lv2v",
})
```

Agent flow:
1. Agent calls `canvas_get` to find the card's URL
2. Calls `scope_start` with the URL as source
3. Frontend creates a FrameExtractor for the URL
4. Stream output card appears on canvas next to source card
5. Edge drawn: source_card → stream_card

### 3.4 URL Source from Chat

When user says "stream this video: https://example.com/video.mp4":
1. Agent creates a video card on canvas (plays original)
2. Starts LV2V stream with video URL as source
3. Stream output card appears
4. User sees both original and transformed side by side

**Files to create/modify:**
- `lib/stream/frame-extractor.ts` — new, multi-source frame extraction
- `lib/stream/session.ts` — modify to accept different source types
- `lib/tools/scope-tools.ts` — source parameter in scope_start

---

## Phase 4: Stream Card Overhaul

**Goal:** Transform stream cards from simple image viewers into rich, interactive stream controllers.

### 4.1 Enhanced Stream Card (`components/canvas/StreamCard.tsx`)

```
┌─────────────────────────────────────┐
│  Stream: "Dreamy landscape"    ▶ ■  │  ← Title + Run/Stop controls
├─────────────────────────────────────┤
│                                     │
│         [Live Output]               │  ← <img> for JPEG frames (existing)
│         (or <video> for             │     or <video> for MPEG-TS
│          video+audio output)        │
│                                     │
├─────────────────────────────────────┤
│  FPS: 12  │ Pipeline: longlive      │  ← Status bar
│  Noise: 0.6 │ LoRA: anime-v3       │
├─────────────────────────────────────┤
│  🤖 Scope Agent Chat               │  ← Mini agent input
│  > "make the colors warmer"         │
│  ✓ Updated noise_scale=0.7,        │
│    prompt="warm golden sunset..."   │
└─────────────────────────────────────┘
```

### 4.2 Run/Stop Controls

- **Play button (▶):** Resume publishing + polling
- **Stop button (■):** Pause publishing, keep stream alive (saves GPU)
- **Close (X):** Full stream stop + remove card
- Multiple stream cards can coexist (each with independent session)

### 4.3 Audio Playback

Scope pipelines can produce audio (music generation, sound effects). When `produces_audio=true`:
- Stream card shows audio visualizer
- Uses Web Audio API for playback
- Audio arrives via separate trickle channel (or interleaved in MPEG-TS)

### 4.4 Video Playback Enhancement

For non-LV2V video cards (regular inference results):
- Use `<video>` with proper controls (play/pause/seek/volume)
- Show duration, current time
- Allow loop toggle
- Full-screen button

### 4.5 Inline Scope Agent

Each stream card has a mini chat input that routes to the Scope Domain Agent:
- User types "make it more abstract" → agent maps to `noise_scale += 0.15`
- User types "add anime lora" → agent sends lora_load command
- User types "slow down" → agent adjusts `denoising_steps`
- Shows what parameters were changed (transparency)

The agent enhances vague requests creatively:
- "make it dreamy" → noise_scale=0.7, denoising_steps=[1000,500], prompt prefix "ethereal, soft focus, "
- "go crazy" → noise_scale=0.95, rapid prompt cycling, beat sync if available
- "cinema mode" → denoising_steps=[1000,750,500,250], kv_cache_attention_bias=0.3

**Files to create/modify:**
- `components/canvas/StreamCard.tsx` — new component (extracted from Card.tsx)
- `components/canvas/StreamControls.tsx` — run/stop/status bar
- `components/canvas/StreamAgent.tsx` — inline chat input
- `components/canvas/Card.tsx` — delegate to StreamCard for type="stream"
- `lib/stream/audio.ts` — Web Audio API playback

---

## Phase 5: Camera Widget Improvements

**Goal:** Fix info display and make the camera widget a proper stream control surface.

### 5.1 Camera Info Bar

Currently shows incorrect/stale info. Fix to show:
- Stream status (connecting / streaming / stopped / error)
- Current FPS (publish rate and receive rate)
- Active pipeline name
- Active LoRA (if any)
- Prompt (truncated)
- Session duration

### 5.2 Camera as Source Selector

Allow switching source without stopping stream:
- Webcam (default)
- Screen share (`getDisplayMedia`)
- Canvas card (image/video)
- URL input

### 5.3 Prompt Control Enhancement

Current prompt bar is basic text input. Enhance to:
- Show active parameters (not just prompt)
- Quick preset buttons (dreamy, cinematic, anime, abstract)
- LoRA quick-load (dropdown of available LoRAs)
- Noise slider (0.0 - 1.0)
- Agent mode toggle (type natural language, agent translates)

**Files to modify:**
- `components/canvas/CameraWidget.tsx` — info bar fix, source selector, enhanced controls

---

## Phase 6: Director Integration

**Goal:** Wire Scope agent into the Director framework as a domain expert.

### 6.1 Director Routing

```
User: "Create a storyboard, then animate scene 3 as a live stream with anime style"

Director:
  1. project_create (9 scenes) → project_generate (batch images)
  2. For scene 3: scope_start with source=scene_3_card, lora="anime-style"
  3. Stream card appears, shows live anime transformation
```

### 6.2 Multi-Stream Orchestration

Director can manage multiple streams simultaneously:
- "Stream all 9 scenes with different styles" → 9 stream cards
- "Stop streams 4-6" → selective stop
- "Apply the same LoRA to all streams" → batch parameter update

### 6.3 Scope Agent as Sub-Agent

The Scope agent is NOT a standalone plugin. It's a tool available to all agent plugins (Gemini, Claude, OpenAI):
- Agent calls `scope_start/control/stop` tools
- Tool implementations use the Scope parameter mapper
- The skill document provides the domain knowledge
- Any LLM can drive Scope through these tools

**Files to modify:**
- `skills/director.md` — add Scope orchestration patterns
- `lib/agents/gemini/index.ts` — no change (uses shared tool registry)
- `lib/tools/registry.ts` — register scope tools alongside existing tools

---

## Implementation Order

```
Phase 1 (Scope Domain Agent)        ← Foundation — everything builds on this
  └── 1.1 Skill doc
  └── 1.2 Parameter types
  └── 1.3 Graph templates
  └── 1.4 Agent tools
  └── 1.5 Director integration

Phase 2 (SDK Proxy Enhancement)     ← Minimal changes, unlocks full param space
  └── 2.1 Pass-through params in start_stream (~30 lines)

Phase 3 (Multi-Source Input)        ← Canvas images/videos as LV2V input
  └── 3.1 Frame extractor
  └── 3.2 Source selection in tools
  └── 3.3 URL source from chat

Phase 4 (Stream Card Overhaul)      ← Rich stream experience
  └── 4.1 StreamCard component
  └── 4.2 Run/Stop controls
  └── 4.3 Audio playback
  └── 4.4 Video playback
  └── 4.5 Inline Scope agent chat

Phase 5 (Camera Widget)             ← Polish existing camera UI
  └── 5.1 Info bar fix
  └── 5.2 Source selector
  └── 5.3 Enhanced prompt controls

Phase 6 (Director Integration)      ← Orchestrate multi-stream from storyboards
  └── 6.1 Director routing
  └── 6.2 Multi-stream management
```

---

## What NOT to Change

- **No changes to Scope source code** — we consume it via fal cloud mode
- **No new Go code on orchestrators** — graph/params are fal-runner-side
- **Minimal SDK changes** — just pass through params, don't validate
- **No custom pipeline implementations** — use what Scope provides
- **No WebRTC in storyboard** — keep using trickle channels (MPEG-TS) via SDK proxy

---

## Success Criteria

1. User says "stream my image with anime lora" → Scope agent auto-configures graph + LoRA + optimal params
2. User pastes a video URL → original plays on canvas, LV2V output streams next to it
3. User types "make it more abstract" in stream card → parameters update in real-time
4. Multiple streams run simultaneously with independent controls
5. Director can orchestrate: generate storyboard → pick scenes → stream them live
6. Camera widget shows accurate FPS, pipeline, LoRA info
7. Audio from pipelines that produce it plays through stream card

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| fal runner doesn't accept all params | Test each param individually; fall back to defaults |
| LoRA download too slow on fal | Use pre-cached LoRAs; show loading state |
| MPEG-TS doesn't carry audio | Separate audio trickle channel; or poll audio endpoint |
| Multiple streams overwhelm GPU | Limit concurrent streams; show GPU usage warning |
| Graph validation errors from fal | Validate client-side using Scope's schema before sending |
| Gemini can't compose complex graphs | Pre-built templates cover 90% of cases; agent picks template |

---

## Appendix: Scope Parameter Quick Reference

### LongLive Pipeline Parameters

**Load-time (set at stream start, can't change during stream):**
- `base_seed`: 42 (deterministic generation)
- `height`: 320, `width`: 576
- `denoising_steps`: [1000, 750, 500, 250]
- `vae_type`: "bf16" | "fp16"
- `vace_context_scale`: 0.0-2.0
- `lora_merge_strategy`: "permanent_merge" | "runtime_peft" | "module_targeted"
- `manage_cache`: true/false
- `quantization`: true/false

**Runtime (change mid-stream via control):**
- `prompts`: string or [{text, weight}] array
- `noise_scale`: 0.0-1.0 (video mode blend strength)
- `noise_controller`: boolean
- `denoising_step_list`: override denoising schedule
- `reset_cache`: boolean (one-shot cache clear)
- `kv_cache_attention_bias`: 0.01-1.0
- `lora_scales`: [{adapter_name, scale}]
- `vace_ref_images`: [url, ...]
- `first_frame_image`/`last_frame_image`: url for FFLF mode

### Available Pipelines on fal (cloud mode)

| Pipeline ID | Description | VRAM | LoRA | VACE | Audio |
|------------|-------------|------|------|------|-------|
| `longlive` | LongLive 1.3B streaming diffusion | 20GB | Yes | Yes | No |
| `streamdiffusionv2` | StreamDiffusion v2 (fast) | 8GB | Yes | Yes | No |
| `krea_realtime_video` | Krea 14B realtime | 24GB | Yes | Yes | No |
| `reward_forcing` | Reward-forcing pipeline | 16GB | Yes | Yes | No |
| `memflow` | Memory flow | 12GB | Yes | Yes | No |
| `passthrough` | Identity (debugging) | 0 | No | No | No |
| `video_depth_anything` | Depth map preprocessor | 4GB | No | No | No |
| `scribble` | Contour extraction | 1GB | No | No | No |
| `rife` | Frame interpolation (2x) | 2GB | No | No | No |
| `gray` | Grayscale conversion | 0 | No | No | No |
| `optical_flow` | Optical flow computation | 2GB | No | No | No |

### Graph Edge Port Names

| Port | Direction | Used By |
|------|-----------|---------|
| `video` | in/out | All pipelines |
| `vace_input_frames` | in | VACE-enabled pipelines (ref frames) |
| `vace_input_masks` | in | VACE inpainting |
| `audio` | out | Audio-producing pipelines |

### Modulation Shapes (for beat-sync)

`sine`, `cosine`, `triangle`, `saw`, `square`, `exp_decay`

### Modulation Rates

`half_beat`, `beat`, `2_beat`, `bar`, `2_bar`, `4_bar`
