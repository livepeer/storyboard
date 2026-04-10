# Scope Pipeline Graphs

LV2V streams use pipeline graphs to define the processing chain. The graph tells the fal runner what source, pipeline, and sink nodes to wire together.

## Graph Format

```json
{
  "nodes": [
    {"id": "input", "type": "source", "source_mode": "video"},
    {"id": "<pipeline_id>", "type": "pipeline", "pipeline_id": "<pipeline_id>"},
    {"id": "output", "type": "sink"}
  ],
  "edges": [
    {"from": "input", "from_port": "video", "to_node": "<pipeline_id>", "to_port": "video", "kind": "stream"},
    {"from": "<pipeline_id>", "from_port": "video", "to_node": "output", "to_port": "video", "kind": "stream"}
  ]
}
```

**CRITICAL:** Edges use `from`/`from_port`/`to_node`/`to_port`/`kind` — NOT `source`/`target`.

## Available Pipelines

### longlive (default)
Real-time style transfer using diffusion models. Best for creative live effects.
- Input: webcam video frames
- Output: stylized video frames at ~15-17fps
- Parameters: `prompts` (style description), `noise_scale` (0.0-1.0)
- Use when: user wants to transform webcam/video into artistic styles

```json
{"pipeline_ids": ["longlive"], "prompts": "cyberpunk neon city"}
```

### ltx2
LTX video generation pipeline. Text/image to video generation.
- Input: text prompt or image frames
- Output: generated video frames
- Parameters: `prompts` (scene description)
- Use when: user wants AI-generated video content
- Note: requires `scope-ltx-2` plugin installed on fal runner

```json
{"pipeline_ids": ["ltx2"], "prompts": "a dragon flying over mountains"}
```

## Graph Patterns

### Simple (source → pipeline → sink)
Default for webcam LV2V. One input, one pipeline, one output.
```
input (webcam) → longlive (style transfer) → output (display)
```

### Chain (source → pre-process → main → post-process → sink)
For multi-stage processing with pre/post processors.
```
input → preprocessor → longlive → postprocessor → output
```

### Multi-sink (source → pipeline → sink1 + sink2)
For recording while streaming.
```
input → longlive → output (display)
                  → record (save to file)
```

## Matching User Intent to Pipeline

| User says | Pipeline | Graph |
|-----------|----------|-------|
| "make me look like cyberpunk" | longlive | Simple |
| "transform my webcam into oil painting" | longlive | Simple |
| "stream my camera with dreamy style" | longlive | Simple |
| "generate a video of dragons" | ltx2 | Simple |
| "start live video with style transfer" | longlive | Simple |

## Parameters for longlive

| Parameter | Default | Description |
|-----------|---------|-------------|
| prompts | required | Style description, keep under 20 words |
| noise_scale | 0.7 | 0.0=faithful, 1.0=creative |
| noise_controller | true | Auto-adjust noise from motion |
| denoising_step_list | [1000,750,500,250] | More steps=quality, fewer=speed |

## SDK Integration

The SDK's `stream_start` handler builds the graph automatically based on `LV2V_PIPELINE` env var. The browser doesn't need to send the graph — just the prompt.

To override the pipeline, the agent can specify it in the `stream_start` params:
```json
{"model_id": "scope", "params": {"prompt": "oil painting", "pipeline_id": "longlive"}}
```
