# Skill: Scene Traveling — Multi-Scene Live Stream Direction

Guide the agent to create the best possible multi-scene live stream performances with smooth morphing, cohesive visuals, and cinematic prompt traveling through Scope.

## When This Skill Loads

Any request containing "live stream" + multiple scenes/journey/evolution/transformation.

## How Scope Prompt Traveling Works

Scope renders video frame-by-frame. Each frame is generated from:
- **Prompt** — the text description of the current scene
- **noise_scale** (0.0-1.0) — how much the generation deviates from the input frame. 0=faithful reproduction, 1=pure generation from prompt
- **kv_cache_attention_bias** (0.01-1.0) — temporal consistency. High=stable across frames (background holds), Low=responsive to changes (enables morphing)
- **transition** — slerp/lerp interpolation between current and target prompt over N steps

When the prompt changes mid-stream, Scope doesn't "cut" — it **morphs**. The visual latent space smoothly interpolates from the old prompt to the new one. This is "prompt traveling."

## The Three Laws of Smooth Morphing

### Law 1: Anchor Composition

Every scene must share the same spatial layout. Scope morphs pixel regions — if a car is center-frame in Scene 1 but top-left in Scene 2, the morph looks like visual noise.

**DO:**
- "low-angle front-quarter view, vehicle centered, filling 70% of frame"
- Same camera angle, same subject position, same direction of motion

**DON'T:**
- Scene 1: "wide shot of a car on a highway" → Scene 2: "close-up of a wheel"
- Changing camera angle between scenes

### Law 2: Bridge Materials

Consecutive scenes must share visual elements that Scope can morph between. The more shared elements, the smoother the transition.

**Bridge techniques:**
- Shape continuity: horse legs → wheel spokes, feathers → metal panels
- Color continuity: warm sepia → warm amber → warm gold (gradual shift)
- Texture continuity: wood grain → brushed metal → polished chrome
- Motion continuity: all subjects moving left-to-right at similar speed

**Example — BAD:**
```
Scene 1: "horse carriage on cobblestone road, sepia fog"
Scene 2: "Tesla on glass highway, blue neon lights"
```
The jump from sepia→neon, cobblestone→glass, horse→car is too extreme. Scope produces visual chaos.

**Example — GOOD:**
```
Scene 1: "horse carriage on cobblestone road, warm sepia fog, wooden wheels spinning"
Scene 2: "brass and iron machine emerging from wooden frame, steam and sparks, wheels thickening from wood to metal, cobblestone cracking into gravel"
Scene 3: "black Model T on dirt road, chrome radiator, thin spoked wheels, morning fog"
```
Scene 2 is a **bridge scene** — it shares elements from both sides.

### Law 3: Preset as Energy Control

Presets control how much Scope "pushes" the generation:

| Preset | noise_scale | kv_cache | Effect |
|--------|-------------|----------|--------|
| faithful | 0.2 | 0.85 | Almost frozen — holds composition rock-solid |
| cinematic | 0.5 | 0.6 | Stable but allows gradual change |
| dreamy | 0.7 | 0.3 | Soft, flowing transitions |
| painterly | 0.65 | 0.4 | Artistic, textured morphing |
| abstract | 0.95 | 0.08 | Wild transformation — maximum morph energy |
| psychedelic | 0.9 | 0.05 | Extreme morph + cache reset for dramatic breaks |

**Pattern: Stable → Morph → Stable**

The best transformation sequences alternate:
```
cinematic (hold car)  →  abstract (explode/morph)  →  cinematic (hold new car)
```

This gives the "Transformer" effect: stable shot, dramatic transformation, stable shot.

## Scene Architecture

### The 3-Act Scene Structure

For any transformation journey (e.g., car evolution):

**Act 1 — Establish (cinematic/faithful)**
- Hold the subject clearly for 20-30s
- High kv_cache (0.6+) keeps background stable
- Audience recognizes what they're looking at

**Act 2 — Transform (abstract/psychedelic)**
- 10-15s of dramatic morphing
- Low kv_cache (0.05-0.1) allows maximum visual change
- reset_cache=true breaks temporal persistence for clean visual break
- Describe the IN-BETWEEN state: "metal panels folding like origami, chrome flowing like mercury"

**Act 3 — Resolve (cinematic/faithful)**
- New subject emerges clearly for 20-30s
- High kv_cache stabilizes the new form
- Audience recognizes the new vehicle/object

### Duration Guidelines

| Scene type | Duration | Why |
|-----------|----------|-----|
| Establishing shot | 25-40s | Gives audience time to absorb |
| Transformation bridge | 10-20s | Short = dramatic, long = gradual |
| Final reveal | 30-45s | Lingering beauty shot |

### Transition Parameters

The `transition` field controls how Scope interpolates between prompts:

```json
{
  "transition": {
    "target_prompts": [{ "text": "new scene prompt", "weight": 1.0 }],
    "num_steps": 16,
    "temporal_interpolation_method": "slerp"
  }
}
```

- **num_steps**: How many frames to interpolate over. 6=fast snap, 16=smooth glide, 24=very gradual
- **slerp**: Spherical linear interpolation — smooth arc through latent space (preferred)
- **lerp**: Linear interpolation — straight line, can look abrupt

## Prompt Engineering for Scope

### The Anatomy of a Good Scene Prompt

```
[camera angle], [subject] [action] [on surface], [background elements] [in motion],
[lighting], [color palette], [texture/material], [atmosphere]
```

**Example:**
```
low-angle front-quarter tracking shot, red Ferrari Testarossa screaming toward camera
on rain-soaked highway, dark pine forest streaking past on both sides with headlight beams,
cinematic night lighting, red and cyan neon reflections, wet chrome and carbon fiber, rain
spray and mist
```

### Shared Anchors Checklist

Before finalizing scenes, verify each consecutive pair shares:
- [ ] Same camera angle and framing
- [ ] Same subject position in frame (center, left, right)
- [ ] Same motion direction and speed
- [ ] At least 2 shared colors
- [ ] At least 1 shared texture/material
- [ ] Same background structure (e.g., "trees on both sides" throughout)

### Words That Help Scope Morph

**Material transitions:** flowing, melting, dissolving, crystallizing, liquefying, solidifying, folding, unfolding, emerging, crumbling

**Energy words:** sparks, particles, electricity, steam, light trails, energy waves, ripples

**Temporal words:** gradually, slowly emerging, sweeping from left to right, wave of change

## Example: Car Evolution (Optimized)

```json
{
  "scenes": [
    {
      "title": "Horse Carriage",
      "prompt": "low-angle tracking shot, wooden horse carriage racing toward camera on cobblestone forest road, wooden wheels spinning with spoke blur, dense autumn trees with golden leaves streaking past both sides, warm sepia fog, dust trail",
      "preset": "cinematic",
      "duration": 30
    },
    {
      "title": "Carriage → Model T",
      "prompt": "low-angle tracking shot, the wooden carriage frame cracking apart as brass gears and iron panels push through the wood, wheels thickening from wooden spokes to metal, cobblestone crumbling into gravel, steam and sparks swirling, half-wood half-metal machine, autumn leaves mixing with industrial soot",
      "preset": "abstract",
      "duration": 15
    },
    {
      "title": "Model T",
      "prompt": "low-angle tracking shot, black Ford Model T rattling toward camera on dirt forest road, chrome radiator gleaming, thin spoked wheels spinning with blur, tall pine trees in morning fog streaking past both sides, exhaust smoke trailing",
      "preset": "cinematic",
      "duration": 25
    },
    {
      "title": "Model T → Chevy",
      "prompt": "low-angle tracking shot, the Model T body stretching and flowing like liquid mercury, black paint rippling into turquoise chrome, flat windshield raking backward, wheels fattening into whitewalls, dirt road smoothing into asphalt, pine trees dissolving into palm trees",
      "preset": "psychedelic",
      "duration": 12
    },
    {
      "title": "1957 Chevy Bel Air",
      "prompt": "low-angle tracking shot, turquoise 1957 Chevy Bel Air roaring toward camera on smooth highway, massive chrome grille and bumper, fat whitewall tires spinning, tropical palms and golden sunset light streaking past both sides, chrome reflections on road",
      "preset": "cinematic",
      "duration": 30
    }
  ]
}
```

**Why this works:**
- Every scene: same camera ("low-angle tracking shot, toward camera")
- Bridge scenes (2, 4) describe the exact mid-morph state
- Bridge presets are abstract/psychedelic (low kv_cache, high noise)
- Stable scenes are cinematic (high kv_cache, moderate noise)
- Materials bridge: wood → brass/iron → chrome → liquid mercury → turquoise chrome
- Background evolves gradually: autumn → pine → palm (never jumps)
- Motion constant: always "toward camera" with wheel spin

## VACE-Enhanced Scene Traveling

The performance engine automatically generates VACE key frame images for each scene in the background. This dramatically improves morphing quality.

### How It Works

```
User sends prompt → stage_scene fires
  │
  ├── Scenes load into timeline immediately
  ├── Scope stream starts (shows "warming up GPU…")
  │
  └── Background: flux-dev generates key frame images
        ├── Scene 1 key frame → attached as vaceRef
        ├── Scene 2 key frame → attached as vaceRef
        └── Scene N key frame → attached as vaceRef
              │
              ▼
        When performance transitions to Scene N:
          control message includes:
            prompts: "scene N prompt"
            vace_enabled: true
            vace_ref_images: [keyframe_N_url]
            vace_context_scale: 1.2
```

### Why VACE Key Frames Matter

Without VACE:
- Scope generates from text prompt + noise on black input frames
- Composition is unpredictable — the "car" might appear anywhere in frame
- Colors and lighting vary wildly between frames
- Background is inconsistent

With VACE key frames:
- Scope uses the pre-generated image as a visual anchor
- Composition matches the key frame — subject position is locked
- Colors and lighting are guided by the reference
- Background structure follows the key frame
- The prompt still controls the generation, but VACE adds spatial/color conditioning

### VACE Parameters (confirmed from Scope source: pipeline_processor.py:563)

VACE reference images are **one-shot** — Scope clears them after use. They must be resent in each control message to persist.

| Parameter | Value | Effect |
|-----------|-------|--------|
| vace_ref_images | [url] | One-shot reference image. Sent via control channel. |
| vace_context_scale | 0.8-1.0 | Moderate reference influence — lets prompt drive content |
| vace_context_scale | 1.2-1.5 | Strong reference — composition/colors closely match key frame |
| vace_context_scale | 1.8-2.0 | Very strong — almost reproduces the key frame with minor variation |

**Important:** `vace_enabled` must be set at **stream start** (pipeline load time). It cannot be toggled mid-stream. But `vace_ref_images` and `vace_context_scale` CAN be changed at runtime.

### Transition Parameters (confirmed from Scope source: schema.py:49-68)

The `transition` field enables smooth prompt morphing over N frames using slerp interpolation:

```json
{
  "transition": {
    "target_prompts": [{ "text": "new scene prompt", "weight": 1.0 }],
    "num_steps": 12,
    "temporal_interpolation_method": "slerp"
  }
}
```

When `transition` is provided, it takes **precedence over `prompts`** — the pipeline smoothly interpolates from the current prompt to the target over `num_steps` frames.

- **num_steps=4**: Fast snap (abstract/psychedelic presets)
- **num_steps=12**: Smooth glide (cinematic preset)
- **num_steps=16**: Very gradual (faithful preset)
- **slerp**: Spherical interpolation through latent space (preferred, smoother arc)
- **linear**: Straight line interpolation (can look abrupt)

For transformations, use **1.2** — strong enough to anchor composition but loose enough for Scope to morph between scenes.

### Key Frame Timing

Key frames generate at ~5-8s each via flux-dev. For a 10-scene performance:
- Total key frame generation: ~50-80s
- Stream starts immediately (doesn't wait)
- First key frames arrive during warm-up phase
- By the time the stream produces frames, most key frames are ready

If a scene transition happens before its key frame is ready, the transition works normally (text-only prompt) — VACE enhances it once the key frame arrives for subsequent transitions.

## Anti-Patterns

**DON'T: Jump between unrelated scenes**
```
Scene 1: "underwater coral reef" → Scene 2: "car on highway"
```
Scope can't morph water→asphalt. Add a bridge: "coral structures hardening into rocky road surface, fish scales becoming metal panels"

**DON'T: Change camera angle**
```
Scene 1: "front view of car" → Scene 2: "aerial view of car"
```
Scope morphs pixel positions. Camera angle change = everything moves = visual noise.

**DON'T: Use only cinematic preset**
All scenes at noise_scale=0.5 produce subtle, underwhelming transitions. Use abstract/psychedelic at the morph points for dramatic effect.

**DON'T: Make all scenes the same duration**
Vary it: 30s establish → 12s morph → 25s hold → 15s morph → 35s finale. Rhythm matters.

**DON'T: Forget the background**
If Scene 1 has "autumn forest" and Scene 3 has "palm trees" but Scene 2 (bridge) doesn't mention trees at all, the background will glitch. Always describe the background evolution in bridge scenes.

## Pipeline-Specific Notes

### LTX 2.3 (`ltx-responsive` / `ltx-smooth` recipes)

LTX 2.3 differs from LongLive in important ways for scene traveling:

- **kv_cache_attention_bias defaults to 0.3** (not 1.0). This makes LTX more responsive to prompt changes — morphing starts faster. Reduce bridge scene durations by ~30% (8-12s instead of 12-18s).
- **Native 24fps** gives smoother visual transitions. The `ltx-smooth` recipe adds RIFE for 48fps.
- **Prompt interpolation is faster** — the low kv_cache means less temporal inertia. You may need to increase kv_cache to 0.5-0.6 for stable holding scenes.
- **For stable scenes on LTX**: use `kv_cache_attention_bias: 0.6` (not 0.85 like longlive's faithful preset). LTX at 0.85 becomes overly static.

### MemFlow (`memflow-consistent` recipe)

- **Best for character consistency** — the memory bank preserves character identity across scenes.
- **Use when the story follows a specific character** that must look the same throughout.
- Higher kv_cache (0.7) by default for stability. Lower for morph bridges.

### Krea Realtime Video (`krea-hq` recipe)

- **14B model — highest visual quality** but slower (6-8fps).
- **Use for final performances** when quality matters more than responsiveness.
- Supports LoRA and VACE like longlive.
