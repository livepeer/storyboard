# Film Skill: HiFi Video

Two-step pipeline: GPT Image 2 → Seedance 2.0. Use for animation, cartoon, product demos, children's content, or any style that benefits from GPT Image's superior text rendering and character consistency.

## Style Override

When this skill is active, the film generator should produce shots optimized for the hifi pipeline:
- Key frame prompts should be descriptive, composition-focused, frozen-moment descriptions
- Camera directions become Seedance motion prompts
- Character lock must be very specific (GPT Image follows detailed descriptions faithfully)

## Shot Structure

Each shot has TWO prompts:
1. **Key frame prompt** (for GPT Image 2): Static scene description, no motion words. Focus on composition, lighting, character pose, background details.
2. **Motion prompt** (for Seedance 2.0): Camera movement + subtle character/environment motion. Short (15-25 words).

The motion prompt is derived from the camera direction field in the film JSON.

## Visual Style

Choose one coherent style for the entire film. GPT Image 2 is best at:
- **3D rendered** (Pixar, DreamWorks, Disney style)
- **Watercolor illustration** (Ghibli, children's book)
- **Anime cel shading** (clean lines, vibrant)
- **Comic / graphic novel** (bold outlines, dynamic)
- **Product photography** (studio lit, clean)

Avoid photorealistic live-action — use `seedance` or `veo` directly for that.

## Duration

Slightly longer durations work better with hifi (the animation is smoother from a clean key frame):
- Establishing: 10-12s
- Character moment: 8-10s
- Action: 5-8s
- Emotional beat: 12-15s
