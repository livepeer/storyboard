# Advanced Models Guide

Beyond the base models, these capabilities enable powerful creative workflows.

## Video Generation — Choosing the Right Model

| Model | Speed | Quality | Audio | Best For |
|-------|-------|---------|-------|----------|
| ltx-i2v | Fast (5s) | Good | No | Quick storyboard animation, iteration |
| ltx-t2v | Fast (5s) | Good | No | Quick video from text |
| veo-i2v | Slow (30s) | Excellent | Yes | Hero shot animation with audio |
| veo-t2v | Medium (15s) | Excellent | Yes | Premium scene generation |
| veo-transition | Slow (30s) | Excellent | Yes | Smooth scene-to-scene transitions |
| kling-i2v | Medium (20s) | Excellent | Yes | Cinematic, fluid motion |

**Decision tree:**
- Quick iteration → ltx-i2v or ltx-t2v
- Final hero shot → veo-i2v (best quality + audio)
- Scene transitions → veo-transition (give first and last frame)
- Cinematic motion → kling-i2v

## Audio — Matching Sound to Vision

| Model | Type | Best For |
|-------|------|----------|
| chatterbox-tts | Speech | Narration, voiceover |
| music | Music | Background score from lyrics+style description |
| sfx | SFX | Sound effects matched to video content |
| lipsync | Lip sync | Make character stills speak with audio |

**Workflow: Full audio storyboard**
1. Generate narration: `chatterbox-tts` with script
2. Generate background music: `music` with mood description
3. Add SFX to video clips: `sfx` auto-matches audio to video
4. Lip sync characters: `lipsync` with character image + audio

## Image Editing — Beyond Restyle

| Model | Best For |
|-------|----------|
| kontext-edit | Style transfer, composition-preserving edits |
| flux-fill | Inpainting (fix regions), outpainting (extend frame), remove objects |
| face-swap | Replace faces while preserving scene — character consistency |
| sam3 | Select specific objects for targeted editing |
| bg-remove | Remove background for compositing |
| transparent-bg | Generate elements with transparent background for layering |

**Workflow: Character consistency across scenes**
1. Generate hero character close-up (Scene 1)
2. Generate other scenes with similar description
3. Face-swap hero face into each scene → consistent character across storyboard

## Enhancement & Export

| Model | Best For |
|-------|----------|
| topaz-upscale | Upscale images to 4K+ for print/export |
| video-upscale | Upscale videos up to 16K with face enhancement |
| depth-map | Generate depth maps for parallax effects |

## 3D & Experimental

| Model | Best For |
|-------|----------|
| image-to-3d | Instant 3D mesh from any storyboard frame (<0.5s) |
| talking-head | Generate talking video from still image + audio |

## Choosing Models for Storyboard Phases

### Planning & Drafting
Use fast models: `flux-schnell`, `ltx-t2v`, `nano-banana`
Get ideas on canvas quickly, iterate fast.

### Hero Frames
Use quality models: `flux-dev`, `recraft-v4`, `gemini-image`
Generate the key frames that define the look.

### Animation
Use the right video model:
- Storyboard animation (quick): `ltx-i2v`
- Hero animation (quality): `veo-i2v` or `kling-i2v`
- Scene transitions: `veo-transition`

### Audio & Music
- Narration: `chatterbox-tts`
- Background music: `music` with mood/lyrics prompt
- Sound effects: `sfx` from video content

### Polish & Export
- Upscale heroes: `topaz-upscale`
- Upscale videos: `video-upscale`
- Face consistency: `face-swap`
