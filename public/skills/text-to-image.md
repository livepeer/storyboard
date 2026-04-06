# Text-to-Image Guide

## Model Selection
| Model | Best for | Speed | Quality |
|-------|----------|-------|---------|
| flux-schnell | Quick drafts, iteration | Fast (~2s) | Good |
| flux-dev | General purpose, balanced | Medium (~8s) | Very good |
| recraft-v4 | Professional illustration, sharp details | Medium (~10s) | Excellent |
| gemini-image | Multimodal, text-in-image | Medium (~6s) | Good |
| nano-banana | Testing, placeholder | Very fast (<1s) | Basic |

## Prompt Engineering
- Be specific about subject, setting, lighting, style
- Include camera angle for cinematic shots: "low angle", "bird's eye", "close-up"
- For flux models: detailed natural language works best
- For recraft: include "illustration", "vector", or "realistic" style keywords

## Size Rules for Video Chains
When an image will be animated (i2v), use square or 16:9 aspect ratios. Avoid very wide/tall images as they may fail in video pipelines.

## Quality Tips
- Add "high quality, detailed, sharp" for better results
- Specify lighting: "golden hour", "studio lighting", "dramatic shadows"
- Include medium: "oil painting", "watercolor", "digital art", "photograph"
