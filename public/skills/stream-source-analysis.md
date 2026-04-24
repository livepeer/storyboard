# Stream Source Analysis Skill

When an image is dropped onto a live stream as a source, analyze it to extract visual DNA and inject it as the stream's prompt.

## How it works

1. **Source set** — the image is published as video frames to the pipeline
2. **Analyze** — Gemini Vision extracts style, palette, mood, setting, description
3. **Prompt inject** — the analysis becomes the stream's prompt via /control
4. **Noise scale** — set to 0.3-0.4 (preserve source closely while adding style)

## Why not VACE?

VACE (Video Attribute Conditioning Engine) can only be enabled at stream **start**. The pipeline graph is fixed at init — you cannot add new processor nodes mid-stream. Attempting to send `vace_enabled: true` via `/control` crashes the Scope session.

The analysis → prompt approach achieves a similar visual match without touching the pipeline graph. The prompt tells the pipeline "make it look like this style/palette/mood" and the low noise_scale preserves the source image's structure.

## Customizing the behavior

Modify this skill to change:
- **noise_scale** — lower = more faithful (0.2), higher = more creative (0.6)
- **What to extract** — edit the analysis prompt in `lib/tools/image-analysis.ts`
- **How to build the stream prompt** — customize the prompt construction in the drag handler

## Agent integration

The agent can also do this via natural language:
- "use this image as a reference for the stream"
- "make the stream look like this painting"
- "match the colors and mood of this photo"

The agent calls `stage_source` (sets frames) then `stage_prompt` (updates prompt with analysis).
