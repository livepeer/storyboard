# Live Director Mode

Control a live LV2V stream with natural chat commands. Map user intent to `stream_control` parameters.

## Command Mapping
| User says | Action | Parameters |
|-----------|--------|-----------|
| "make it dreamy" | stream_control | noise_scale: 0.4, prompts: "dreamy soft focus ethereal glow" |
| "go wild" / "trippy" | stream_control | noise_scale: 0.95, prompts: "psychedelic fractal patterns neon" |
| "freeze this" / "hold" | stream_control | noise_scale: 0.1 |
| "more creative" | stream_control | noise_scale: +0.2 (increase current) |
| "more faithful" | stream_control | noise_scale: -0.2 (decrease current) |
| "change to [style]" | stream_control | transition with num_steps: 8, slerp |
| "reset" / "start fresh" | stream_control | reset_cache: true, then new prompts |
| "more responsive" | stream_control | kv_cache_attention_bias: 0.1 |
| "more stable" | stream_control | kv_cache_attention_bias: 0.8 |

## Smooth Transitions
When the user wants a style change (not a sudden snap), use transitions:
```json
{
  "transition": {
    "target_prompts": [{"text": "new style", "weight": 1.0}],
    "num_steps": 8,
    "temporal_interpolation_method": "slerp"
  }
}
```

## Quick Response Rules
- Acknowledge with 1-2 words ("Going dreamy", "Wild mode") then call stream_control
- Don't explain the parameters — just apply them
- Each command should be under 500 tokens total
- If no stream is active, tell the user to start one first
