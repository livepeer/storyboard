# Scope Live Stream (LV2V)

## Pipeline: longlive
- Cold start: ~3 min (VACE model weights download)
- Warm start: <1s

## Runtime Parameters
| Parameter | Default | Range | Effect |
|-----------|---------|-------|--------|
| prompts | required | string | Style description (keep under 20 words) |
| noise_scale | 0.7 | 0.0-1.0 | Lower=faithful to input, higher=creative |
| noise_controller | true | bool | Auto-adjust noise from motion |
| denoising_step_list | [1000,750,500,250] | list[int] | More steps=quality, fewer=speed |
| reset_cache | false | bool | One-shot cache flush for dramatic prompt changes |
| kv_cache_attention_bias | varies | 0.01-1.0 | Lower=responsive, higher=stable |

## Transitions (smooth prompt changes)
Use the `stream_control` tool with transition parameters:
```json
{
  "transition": {
    "target_prompts": [{"text": "new style description", "weight": 1.0}],
    "num_steps": 8,
    "temporal_interpolation_method": "slerp"
  }
}
```

## Scenario Recipes
| User says | noise_scale | Prompt style | Extras |
|-----------|-------------|-------------|--------|
| "painting" | 0.7 | "oil painting style warm colors" | — |
| "subtle" | 0.3 | "warm golden hour lighting" | — |
| "trippy" | 0.95 | "psychedelic fractal explosion" | — |
| "change style smoothly" | keep | use transition num_steps=8 slerp | — |
| "more responsive" | keep | keep | kv_cache_attention_bias=0.1 |
| "more stable" | keep | keep | kv_cache_attention_bias=0.8 |
| "different look completely" | keep | new prompt | reset_cache=true first |
