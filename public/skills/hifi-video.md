# Skill: HiFi Video — GPT Image 2 + Seedance 2.0 Pipeline

Two-step high-fidelity video creation: GPT Image 2 generates a perfect key frame, then Seedance 2.0 animates it into a cinematic video clip.

## Why This Combination Works

**GPT Image 2** excels at what other image models can't:
- Pixel-perfect text rendering (labels, signs, titles)
- Clean graphic design (logos, UI elements, infographics)
- Consistent character design with precise details
- Product photography with callouts and annotations
- Illustration styles (cartoon, anime, comic, children's book)

**Seedance 2.0** then brings the still frame to life:
- Up to 15 seconds of cinematic video with natural motion
- Synchronized audio generation (ambient sound, music)
- Motion follows the prompt (camera movement, character action, environment)
- Preserves the key frame's composition and style faithfully

## When to Use HiFi

| Scenario | Why HiFi Wins |
|----------|---------------|
| Animation / cartoon film | GPT Image nails character consistency + text/signs |
| Product demo video | GPT Image creates perfect product shot → Seedance animates |
| Children's content | GPT Image draws clear, age-appropriate illustration → Seedance adds gentle motion |
| Title cards / intros | GPT Image renders title text perfectly → Seedance adds cinematic reveal |
| Comic / manga style | GPT Image creates clean panel art → Seedance adds subtle animation |
| Explainer / educational | GPT Image creates diagram/infographic → Seedance adds callout animations |

## Key Frame Prompt Rules (GPT Image 2)

### DO
- **Be extremely specific** about composition: "centered character, 3/4 view, clean background"
- **Describe the FROZEN MOMENT** that Seedance will animate: "character mid-jump, hair flowing upward"
- **Include text/labels** if the scene needs them — GPT Image renders text accurately
- **Specify style precisely**: "Pixar 3D rendered, soft subsurface scattering, studio lighting"
- **Lock the character**: "a 10-year-old girl with red braids, freckles, green overalls, yellow rain boots"

### DON'T
- Don't use vague styles ("nice illustration") — be precise ("Studio Ghibli watercolor, gouache texture")
- Don't describe motion in the key frame prompt — save that for the Seedance step
- Don't overcrowd the frame — Seedance needs clear subjects to animate

## Animation Prompt Rules (Seedance 2.0)

### DO
- **Describe the motion**: "character turns head slowly, wind blows through hair"
- **Include camera direction**: "slow dolly in", "gentle pan left", "crane up reveal"
- **Add atmosphere**: "leaves drifting across frame", "light flickering", "rain falling"
- **Keep it short**: 15-25 words focused on motion + camera

### DON'T
- Don't re-describe the scene (Seedance sees the key frame)
- Don't request impossible physics ("character flies then shrinks to ant size" in 5s)
- Don't fight the key frame composition — motion should enhance what's already there

## Duration Guide

| Content | Duration | Why |
|---------|----------|-----|
| Title card / intro | 4-5s | Short reveal, text fade-in |
| Character moment | 8-10s | Expression change, subtle gesture |
| Action sequence | 5-8s | Quick motion, dynamic camera |
| Establishing shot | 10-12s | Slow pan, environment reveal |
| Emotional beat | 12-15s | Lingering moment, subtle animation |

## Style Presets for HiFi

| Style | GPT Image Prompt Prefix | Seedance Motion Style |
|-------|------------------------|----------------------|
| Pixar 3D | "Pixar-style 3D render, soft lighting, expressive characters, clean background" | "smooth cinematic motion, gentle camera drift" |
| Ghibli Watercolor | "Studio Ghibli hand-painted watercolor, soft edges, warm light, nature" | "gentle breeze, floating particles, serene motion" |
| Comic Book | "bold comic book art, thick outlines, dynamic composition, halftone dots" | "dramatic camera push, action lines dissolve" |
| Anime Cel | "anime cel shading, clean lines, vibrant colors, detailed eyes" | "anime-style motion, hair flowing, sparkle effects" |
| Children's Book | "children's book illustration, warm colors, simple shapes, friendly characters" | "gentle swaying, soft bounce, playful motion" |
| Product Hero | "product photography, studio lighting, white background, hero angle" | "slow 360 rotation, light sweep, subtle shadow drift" |
