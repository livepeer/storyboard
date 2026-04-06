# Image Editing Guide

## kontext-edit (Primary Editor)
Use for: restyle, modify, transform existing images while preserving composition.

### How to use
- Set `params.image_url` to the source image
- Prompt describes the desired change, NOT the entire image
- Always include: "Keep all subjects, poses, and composition the same. Only change [what you want changed]."

### Good prompts
- "Restyle as watercolor painting. Keep all subjects and composition identical."
- "Change the background to a sunset beach. Keep the person exactly the same."
- "Add dramatic lighting and shadows. Preserve all details and composition."

### Bad prompts
- "A dragon" (too vague — will regenerate, not edit)
- "Make it better" (no specific direction)

## Style Transfer Pattern
```
Restyle this image: [user's style description]. IMPORTANT: Keep all subjects, people, objects, poses, and spatial composition exactly the same. Only change the artistic style, colors, and rendering technique.
```

## Upscaling
Use `topaz-upscale` for resolution enhancement. No prompt needed — just pass image_url.

## Background Removal
Use `bg-remove` with image_url. Returns image with transparent background.
