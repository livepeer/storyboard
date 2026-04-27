# Happy Horse 1.0 — Cinematic Video Skill

Best-in-class motion quality with native 1080p + synced audio in one pass.

## Prompt Formula (~20 words)

```
[Subject] [action/motion] in [setting], [one cinematography cue]
```

### Rules
- **20 words is the sweet spot** — longer prompts degrade output
- Subject first, then what they're doing
- One setting detail (not paragraphs of world-building)
- Camera moves earn extra length — put them LAST
- **Cut these words** — they drag output to defaults:
  "stunning", "beautiful", "hyperrealistic", "cinematic masterpiece",
  "highly detailed", "4K", "8K", "photorealistic"

### Good examples
```
Woman in red dress walks through rainy Tokyo street, slow tracking shot
Golden retriever runs across beach at sunset, low-angle follow cam
Astronaut floats through abandoned space station, steady dolly forward
Chef plates a dessert in dim kitchen, close-up rack focus
```

### Bad examples (too long, filler words)
```
❌ A stunningly beautiful hyperrealistic woman in a gorgeous red dress walking
   dramatically through the rain-soaked streets of Tokyo at night with neon...
```

### Multi-beat (shot lists)
For sequences, use timecodes instead of prose:
```
0-3s: Wide shot, couple walking on pier, golden hour
3-6s: Close-up hands intertwining, shallow depth of field
6-9s: Pull back to reveal fireworks over water, slow crane up
```

## Model Parameters

| Param | Value | Notes |
|-------|-------|-------|
| duration | 5-10s | Sweet spot: 8s for most scenes |
| sound | true | Native audio synthesis (not stitched) |
| aspect_ratio | "16:9" | Default for cinematic |
| aspect_ratio | "9:16" | Vertical/mobile |
| aspect_ratio | "1:1" | Square/social |

## When to use Happy Horse vs others

| Scenario | Model | Why |
|----------|-------|-----|
| Hero shot, final cut | happy-horse-i2v | Best motion + audio |
| Quick iteration, draft | seedance-i2v-fast | Faster, good enough |
| 4K requirement | kling-o3-i2v | Native 4K |
| Fast preview | ltx-i2v | Fastest (~25s) |
| Character consistency | seedance-i2v | Best with face lock |
