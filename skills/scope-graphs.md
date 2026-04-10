# Scope Pipeline Graphs & Workflow Recipes

LV2V streams use pipeline graphs to define the processing chain. The agent should select the best workflow based on user intent.

## Graph Format (CRITICAL)

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

Edges MUST use `from`/`from_port`/`to_node`/`to_port`/`kind`.

## Available Pipelines

| Pipeline | Type | FPS | Best For |
|----------|------|-----|----------|
| longlive | Style transfer (diffusion) | 15-17 | Live webcam transformation, artistic styles |
| ltx2 | Video generation (LTX) | 5-10 | AI-generated video from text/image |

## Workflow Recipes

### Recipe 1: Live Style Transfer (default)
**When:** User wants to transform webcam into a style in real-time.
**Graph:** Simple (source → longlive → sink)
**Params:** `prompts` (style description), `noise_scale` 0.5-0.8

Best for: "transform my webcam into cyberpunk", "make me look like an oil painting"

### Recipe 2: High-Fidelity Style Transfer
**When:** User wants subtle, faithful transformation — close to original but stylized.
**Graph:** Simple (source → longlive → sink)
**Params:** `noise_scale: 0.3`, `denoising_step_list: [1000,750,500,250]`

Best for: "enhance my webcam with warm cinematic lighting", "subtle anime filter"

### Recipe 3: Creative / Psychedelic
**When:** User wants wild, creative, heavily transformed output.
**Graph:** Simple (source → longlive → sink)
**Params:** `noise_scale: 0.9-1.0`, `prompts` with vivid style descriptors

Best for: "trippy psychedelic", "go wild", "abstract art from my webcam"

### Recipe 4: Storyboard-to-Stream
**When:** User created a storyboard and wants to enter one of those scenes live via webcam.
**Graph:** Simple (source → longlive → sink)
**How:**
1. Agent reads the scene's prompt from the project
2. Uses that prompt + style guide as the LV2V prompt
3. Sets noise_scale based on how faithful vs creative the style needs to be

Best for: "start a live stream using scene 1's style", "put me in the cyberpunk world from scene 3"

### Recipe 5: AI Video Generation (no webcam)
**When:** User wants generated video, not webcam transformation.
**Graph:** Simple (source → ltx2 → sink)
**Params:** `prompts` (scene description)
**Note:** ltx2 must be installed on the fal runner

Best for: "generate a video of dragons", "create animated footage of aurora borealis"

## Matching Intent to Recipe

| User Intent | Recipe | noise_scale | Key Params |
|-------------|--------|-------------|------------|
| "transform my webcam into [style]" | 1 | 0.5-0.7 | prompts: style description |
| "subtle/gentle/faithful filter" | 2 | 0.2-0.4 | prompts: enhancement description |
| "go wild / trippy / psychedelic" | 3 | 0.9-1.0 | prompts: vivid descriptors |
| "put me in [storyboard scene]" | 4 | 0.5-0.7 | prompts: from project style guide + scene |
| "make it dreamier / more creative" | increase | +0.2 | via stream_control |
| "more faithful / realistic" | decrease | -0.2 | via stream_control |
| "generate a video of X" | 5 | N/A | prompts: scene description |

## Combining Director + LV2V

When a project is active and user asks to "stream" or "go live" using a scene:

1. Load project's style guide (`promptPrefix` + `promptSuffix`)
2. Get the target scene's prompt
3. Combine: `{stylePrefix}{scenePrompt}{styleSuffix}`
4. Start LV2V with `longlive` pipeline and the combined prompt
5. Set `noise_scale` based on style intensity:
   - Photorealistic scenes: 0.3-0.5
   - Illustrated/artistic scenes: 0.5-0.7
   - Abstract/psychedelic scenes: 0.8-1.0

## Runtime Control (via stream_control)

During streaming, the agent can adjust parameters:
- `prompts`: change style description (smooth transition with `num_steps: 8, slerp`)
- `noise_scale`: adjust creativity (0.0-1.0)
- `reset_cache`: true for dramatic style changes
- `kv_cache_attention_bias`: responsiveness (lower=responsive, higher=stable)

Load the `live-director` skill for natural language command mapping.
