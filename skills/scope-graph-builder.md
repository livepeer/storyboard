# Skill: Scope Graph Builder

Build and configure Scope graph pipelines for live video-to-video streaming. Graphs define how video flows through processing nodes.

## Node Types

| Type | Purpose | Required Fields |
|------|---------|----------------|
| `source` | Video input (webcam, video, spout, ndi) | `source_mode` |
| `pipeline` | AI processing (generation, preprocessing) | `pipeline_id` |
| `sink` | Output (WebRTC, spout, ndi) | optional `sink_mode` |
| `record` | File recording | — |

## Available Pipelines

### Generation (GPU-heavy, 20+ GB VRAM)
| Pipeline ID | What it does |
|---|---|
| `longlive` | Main LV2V model — text/video modes, LoRA, VACE, modulatable |
| `streamdiffusionv2` | StreamDiffusion V2 — fast real-time diffusion |
| `krea-realtime-video` | Krea Realtime — KV cache attention bias control |
| `reward-forcing` | Reward-forcing generation |
| `memflow` | MemFlow with memory bank |

### Preprocessors (lightweight)
| Pipeline ID | What it does |
|---|---|
| `video-depth-anything` | Depth map extraction (temporal consistency) |
| `scribble` | Contour/edge extraction (anime-style) |
| `optical-flow` | RAFT optical flow visualization |
| `gray` | Grayscale conversion (no model) |

### Postprocessors
| Pipeline ID | What it does |
|---|---|
| `rife` | 2x frame interpolation (smoother output) |

## Edge Format (CRITICAL)

```json
{"from": "node_id", "from_port": "video", "to_node": "target_id", "to_port": "video", "kind": "stream"}
```

**Port names:** `video`, `vace_input_frames`, `vace_input_masks`
**Edge kinds:** `stream` (frame-by-frame), `parameter` (reserved)

## Built-in Graph Templates

### simple-lv2v (default)
`source → longlive → sink`
Basic webcam/video transform. Use for most prompts.

### depth-guided
`source → depth_anything → longlive → sink`
Preserves depth/structure from input. Good for architecture, landscapes, maintaining spatial layout.

### scribble-guided
`source → scribble → longlive → sink`
Extracts contours, uses as structural guide. Good for anime, illustration, edge-based styles.

### interpolated
`source → longlive → rife → sink`
2x frame interpolation for smoother output. Good for slow, cinematic movement.

### text-only
`longlive → sink`
No input source — pure text-to-video generation. Good for abstract, generative art.

### multi-pipeline
`source → pipeline_a → pipeline_b → sink`
Chain two pipelines. Default: longlive → rife.

## Choosing the Right Graph

| User wants | Graph | Why |
|---|---|---|
| "transform my webcam" | simple-lv2v | Default, most reliable |
| "keep the structure/layout" | depth-guided | Depth map preserves spatial structure |
| "anime style from my drawing" | scribble-guided | Edge extraction → anime generation |
| "smooth cinematic look" | interpolated | RIFE doubles frame rate |
| "generate from text only" | text-only | No camera needed |
| "dreamy abstract visuals" | text-only | No input = pure generation |
| "multiple effects chained" | multi-pipeline | Sequential processing |

## LongLive Runtime Parameters

These can be changed mid-stream via `scope_control`:

| Parameter | Range | Default | What it does |
|---|---|---|---|
| `noise_scale` | 0.0–1.0 | 0.7 | Creativity level (0=faithful, 1=ignore input) |
| `kv_cache_attention_bias` | 0.01–1.0 | 1.0 | Temporal consistency (lower=more responsive) |
| `denoising_step_list` | [100–1000] | [1000,750,500,250] | Quality vs speed |
| `reset_cache` | bool | false | One-shot flush for dramatic style change |
| `noise_controller` | bool | true | Dynamic noise adjustment for video mode |

## Beat-Synced Modulation

Parameters with `modulatable=True` (noise_scale, denoising_steps) can oscillate with music:

| Wave | Shape |
|---|---|
| sine, cosine | Smooth oscillation |
| triangle | Linear ramp |
| saw | Sawtooth |
| square | On/off pulse |
| exp_decay | Pulse at beat, exponential falloff |

Rates: `half_beat`, `beat`, `2_beat`, `bar`, `2_bar`, `4_bar`

## LoRA Support

LongLive supports runtime LoRA adapters:
- `lora_merge_mode: "permanent_merge"` — max FPS, no runtime updates
- `lora_merge_mode: "runtime_peft"` — instant updates, reduced FPS
- `lora_scales` — adjust per-adapter strength mid-stream

## VACE (Visual Conditioning)

Enable structured guidance from reference images:
- `vace_enabled: true` — enable VACE conditioning
- `vace_ref_images` — reference image paths
- `vace_context_scale` — 0.0–2.0, hint influence strength
- `vace_use_input_video` — use input video for conditioning
