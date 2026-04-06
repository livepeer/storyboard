# Video Generation Guide

## Pipelines
| Pipeline | Input | Best for |
|----------|-------|----------|
| ltx-t2v | Text only | Short clips from description |
| ltx-i2v | Image + text | Animating still images (recommended for storyboards) |

## Image-to-Video (i2v) — Most Common
1. Generate or select a source image
2. Call inference with capability `ltx-i2v`, set `params.image_url`
3. Prompt describes the MOTION, not the scene: "camera slowly pans left", "wind blowing through hair"

### Motion Prompts
- Camera: "camera pans left", "slow zoom in", "tracking shot", "aerial flyover"
- Subject: "walking forward", "turning head", "wind blowing", "water flowing"
- Keep prompts short and focused on movement

## Chain Constraints
- Source image should be square or 16:9 for best results
- Base64 images may fail in some video pipelines — use URLs when possible
- Video generation takes 15-60 seconds depending on model

## Text-to-Video
Use `ltx-t2v` when no source image exists. Describe both the scene AND the motion in the prompt.
