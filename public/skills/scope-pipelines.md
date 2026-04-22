# Scope Pipeline & Recipe Guide

Scope supports multiple video generation pipelines and composable graph recipes. Use this guide to choose the right configuration.

## Pipelines

| Pipeline | Quality | Speed | Strengths | kv_cache default |
|----------|---------|-------|-----------|-----------------|
| `longlive` | Good | 8-12fps | Prompt traveling, LoRA, VACE, proven stable | 1.0 |
| `ltx2` | Good | 24fps native | Faster prompt response, smoother playback | 0.3 |
| `krea_realtime_video` | Best | 6-8fps | 14b Wan2.1 model, highest visual fidelity | 1.0 |
| `memflow` | Great | 8fps | Memory bank for best temporal consistency | 1.0 |

### Pipeline Details

**longlive** (default) — CausalWan 1.3B. The workhorse. Best LoRA and VACE support. Variable framerate. Good prompt traveling. Use when no specific need.

**ltx2** — LTX 2.3 plugin. Native 24fps for fluid motion. Lower default kv_cache (0.3) means it responds faster to prompt changes — ideal for reactive scene morphing. When using ltx2, set `kv_cache_attention_bias: 0.3` (not 1.0).

**krea_realtime_video** — Wan2.1 14B with Self-Forcing. Requires 32GB VRAM. Highest visual quality but slower. Use for final renders or when quality matters more than speed.

**memflow** — Kling-based with memory bank. Best at maintaining character/object consistency across long sequences. Great for narrative streams where the same character must persist.

## Recipes

A recipe bundles a pipeline + optional preprocessor + optional postprocessor + optimized defaults.

| Recipe | Pipeline | Pre/Post | Quality | Best For |
|--------|----------|----------|---------|----------|
| `classic` | longlive | — | balanced | Default, prompt traveling, LoRA |
| `ltx-responsive` | ltx2 | — | balanced | Fast prompt response, 24fps |
| `ltx-smooth` | ltx2 | rife | quality | Smooth 48fps output |
| `depth-lock` | longlive | depth_anything | quality | Preserve structure/composition |
| `scribble-guide` | longlive | scribble | quality | Edge-guided generation |
| `interpolated` | longlive | rife | quality | 2x frame interpolation |
| `fast-preview` | longlive | — | fast | Quick preview, fewer denoising steps |
| `krea-hq` | krea_realtime_video | — | quality | Highest visual fidelity |
| `memflow-consistent` | memflow | — | quality | Best character consistency |

## Recipe Selection (Natural Language → Recipe)

| User Says | Recipe | Why |
|-----------|--------|-----|
| nothing specific | `classic` | Safe default |
| "smooth" / "fluid" / "24fps" | `ltx-responsive` | Native 24fps |
| "buttery smooth" / "48fps" | `ltx-smooth` | LTX + RIFE interpolation |
| "preserve depth" / "keep structure" | `depth-lock` | Depth preprocessor |
| "sketch-guided" / "edge-based" | `scribble-guide` | Scribble preprocessor |
| "interpolated" / "smoother frames" | `interpolated` | RIFE postprocessor |
| "fast" / "preview" / "quick" | `fast-preview` | 2 denoising steps |
| "highest quality" / "best quality" | `krea-hq` | 14B model |
| "consistent characters" / "same face" | `memflow-consistent` | Memory bank |

## Recipe Defaults

### classic (longlive)
```
pipeline_ids: ["longlive"]
kv_cache_attention_bias: 0.5
denoising_step_list: [1000, 750, 500, 250]
noise_scale: 0.5
```

### ltx-responsive (ltx2)
```
pipeline_ids: ["ltx2"]
kv_cache_attention_bias: 0.3
denoising_step_list: [1000, 750, 500, 250]
noise_scale: 0.5
manage_cache: true
```

### fast-preview (longlive, speed mode)
```
pipeline_ids: ["longlive"]
kv_cache_attention_bias: 0.5
denoising_step_list: [1000, 500]
noise_scale: 0.5
```

## Preprocessor Pipelines

These run before the main pipeline to extract guidance signals:

| Preprocessor | Output | Use With |
|-------------|--------|----------|
| `video_depth_anything` | Depth map | depth-lock recipe — preserves 3D structure |
| `scribble` | Edge/contour map | scribble-guide recipe — cartoon/sketch guidance |
| `optical_flow` | Motion vectors | Future: motion-guided generation |

## Postprocessor Pipelines

| Postprocessor | Effect | Use With |
|--------------|--------|----------|
| `rife` | 2x frame interpolation | ltx-smooth, interpolated recipes |

## Rules

1. Default to `classic` recipe unless user specifies otherwise
2. When using ltx2, always set `kv_cache_attention_bias: 0.3` (not longlive's 1.0)
3. Preprocessor recipes (depth-lock, scribble-guide) need video input — don't use with text-only
4. `krea-hq` requires 32GB VRAM GPU — may not always be available
5. Recipes can be combined with presets: recipe controls the pipeline topology, preset controls the visual style (noise_scale, etc.)
6. Pass `recipe` to scope_start or stage_scene — the tool resolves the full graph
