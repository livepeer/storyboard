# fal.ai Models Roadmap for Storyboard

## Priority Additions (High Impact)

### Tier 1 — Immediate (transforms storyboard experience)

| Capability Name | fal Model ID | Why | Price |
|----------------|-------------|-----|-------|
| veo-i2v | fal-ai/veo3.1/image-to-video | Best-in-class scene animation with audio | ~$0.50/vid |
| veo-t2v | fal-ai/veo3.1/fast | Fast text-to-video iteration | ~$0.25/vid |
| veo-transition | fal-ai/veo3.1/first-last-frame-to-video | Smooth transitions between storyboard keyframes | ~$0.50/vid |
| flux-fill | fal-ai/flux-pro/v1/fill | Inpainting/outpainting/style transfer | $0.05/MP |
| lipsync | fal-ai/sync-lipsync/v3 | Add dialogue to character stills | ~$0.10/sec |
| music | fal-ai/minimax-music/v2 | Background music from lyrics+style | $0.02/sec |
| sfx | fal-ai/mmaudio-v2 | Auto-generate matching audio for videos | $0.001/sec |

### Tier 2 — Next Sprint (enriches workflows)

| Capability Name | fal Model ID | Why |
|----------------|-------------|-----|
| sam3 | fal-ai/sam-3/image | Select/isolate objects for compositing |
| depth-map | fal-ai/depth-anything-video | Depth maps for parallax/3D effects |
| face-swap | easel-ai/advanced-face-swap | Character face replacement |
| talking-head | fal-ai/bytedance/omnihuman/v1.5 | Generate talking video from still + audio |
| video-upscale | fal-ai/topaz/upscale/video | Production-quality video upscale |
| transparent-bg | fal-ai/ideogram/v3/generate-transparent | Layered element generation |

### Tier 3 — Future (experimental)

| Capability Name | fal Model ID | Why |
|----------------|-------------|-----|
| image-to-3d | fal-ai/triposr | 3D assets from storyboard frames |
| world-gen | fal-ai/hunyuan_world/image-to-world | Full 3D world from concept art |
| voice-clone | fal-ai/dia-tts/voice-clone | Clone voices for character dialogue |
| kling-i2v | fal-ai/kling-video/v3/pro/image-to-video | Alternative premium video gen |
| sora-i2v | fal-ai/sora-2/image-to-video | OpenAI video gen |

## Current Capabilities (12 registered)

| Name | Model ID | Status |
|------|---------|--------|
| flux-dev | fal-ai/flux/dev | ✅ |
| flux-schnell | fal-ai/flux/schnell | ✅ |
| recraft-v4 | fal-ai/recraft/v4/pro/text-to-image | ✅ |
| kontext-edit | fal-ai/flux-pro/kontext | ✅ |
| ltx-t2v | fal-ai/ltx-2.3/text-to-video | ✅ |
| ltx-i2v | fal-ai/ltx-2.3/image-to-video | ✅ |
| bg-remove | fal-ai/birefnet | ✅ |
| topaz-upscale | fal-ai/aura-sr | ✅ |
| chatterbox-tts | fal-ai/chatterbox/text-to-speech | ✅ |
| gemini-image | gemini/gemini-2.5-flash-image | ✅ |
| gemini-text | gemini/gemini-2.5-flash | ✅ |
| nano-banana | fal-ai/nano-banana-2 | ✅ |

## Wow Workflows Enabled by New Models

### 1. "Make My Storyboard Talk"
Scene image → lipsync + TTS → talking character video with matching audio
```
create storyboard → select character scene → add dialogue → lipsync generates video
```

### 2. "Cinematic Scene Transitions"
Scene 1 image + Scene 2 image → veo-transition → smooth cinematic bridge
```
9 scenes → 8 transitions → seamless ad narrative
```

### 3. "Full Soundtrack"
Storyboard brief → music generates matching background track → sfx adds ambient audio per scene
```
"dramatic orchestral, building tension" → 30s background music
video scene → auto-generate wind/traffic/rain SFX
```

### 4. "Character Consistency via Face Swap"
Generate reference character → face-swap into every scene
```
scene 1: generate hero character close-up
scenes 2-9: face-swap hero into each scene for consistent look
```

### 5. "3D Previsualization"
Storyboard frame → instant 3D mesh → rotate/explore the scene
```
concept art → triposr → 3D preview in <0.5s
```
