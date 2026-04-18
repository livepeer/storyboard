# Skill: Seedance Cinematic Video

Seedance 2.0 (ByteDance) — state-of-the-art image-to-video model. Up to 15s cinematic video with synchronized audio from a single image. Best-in-class motion fidelity, temporal consistency, and dramatic camera work.

## When to use

- `/film apply` — every key frame gets animated with Seedance for cinematic quality
- `/story apply` then "animate scene N" — upgrade a still into a cinematic clip
- Right-click card → "Cinematic Video (Seedance)" — one-click cinematic transformation
- Any prompt mentioning "cinematic", "dramatic", "slow motion", "epic" + animation

## Models

| Capability | Use case | Duration | Speed |
|------------|----------|----------|-------|
| seedance-i2v | Hero shots — highest quality, best motion | 4-15s | Standard |
| seedance-i2v-fast | Draft/preview — 80% quality at 50% cost | 4-15s | Fast |
| seedream-5-lite | Image generation — ByteDance Seedream 5.0 | — | Fast |

## Prompt craft for Seedance

Seedance responds best to **action-forward** prompts with camera direction:

### Good prompts (describe motion + camera)
- "Camera slowly pushes in as the warrior raises her sword, wind whipping her cloak, dramatic backlighting"
- "Slow dolly across a rain-soaked cityscape, neon reflections rippling in puddles, cars passing"
- "The dragon unfurls its wings and launches skyward, camera tilts up tracking the flight, embers scatter"

### Weak prompts (static descriptions)
- "A beautiful sunset over the ocean" (no motion described)
- "A warrior standing in a field" (no action)

### Prompt formula
`[Camera movement], [subject action], [environmental detail], [lighting/mood]`

## Film integration

When `/film apply` animates key frames, each shot's `camera` field maps naturally to Seedance prompts:

| Film camera direction | Seedance prompt pattern |
|-----------------------|------------------------|
| Wide establishing | "Slow aerial pull-back revealing the full landscape, golden hour lighting" |
| Push-in close-up | "Camera pushes in on the character's face, subtle expression shift, shallow DOF" |
| Tracking shot | "Camera tracks alongside the subject, steady lateral movement, background blur" |
| Crane down | "Camera cranes down from above, revealing the scene below, atmospheric haze" |

## Duration guide

| Content | Duration | Why |
|---------|----------|-----|
| Reaction shot | 4s | Short emotional beat |
| Action beat | 6-8s | Enough for one dramatic action |
| Establishing/mood | 10-12s | Slow camera reveals need time |
| Epic sequence | 15s | Full cinematic moment |

## Audio

Seedance generates synchronized audio by default. The model predicts environmental sounds (wind, rain, footsteps, impacts) from the visual content. No separate TTS needed for ambient audio.
