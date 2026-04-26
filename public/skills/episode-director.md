# Episode Director — Cinematic/Commercial Quality

Default production skill for turning an episode of images into a cohesive video.

## Analysis Phase

For the first image in the episode, extract:
- Visual style (photorealistic, illustration, anime, etc.)
- Color palette (dominant 3-5 colors)
- Mood/tone (dramatic, serene, energetic, etc.)
- Lighting (natural, studio, golden hour, etc.)

This becomes the **cohesion prefix** — prepended to every clip's motion prompt.

## Motion Prompt Rules

For each keyframe image, build a motion prompt:
1. Start with the cohesion prefix (style + palette + mood)
2. Add camera movement appropriate to the content:
   - Establishing/landscape → slow pan or dolly back
   - Portrait/character → subtle push in, shallow depth of field
   - Action/dynamic → tracking shot, handheld energy
   - Detail/close-up → gentle drift, rack focus
   - Abstract → fluid morphing, dreamlike drift
3. Keep under 25 words (video models work best with concise prompts)
4. Do NOT re-describe what's in the image (the model sees it)
5. Focus on MOTION and MOOD, not objects

## Model Selection

| Episode style | Model | Reason |
|--------------|-------|--------|
| Photorealistic / cinematic | seedance-i2v | Best quality, up to 15s, audio |
| Cartoon / anime / illustration | seedance-i2v | Handles stylized content well |
| Fast preview / draft | seedance-i2v-fast | Quick iteration, lower quality |
| Maximum quality (final cut) | seedance-i2v | Most reliable across styles |

Default: `seedance-i2v`

## Duration Rules

| Content type | Duration | Reason |
|-------------|----------|--------|
| Title card / text overlay | 4-5s | Quick read |
| Establishing shot / landscape | 10-12s | Let the viewer absorb the scene |
| Character moment / portrait | 8-10s | Emotional connection |
| Action / dynamic scene | 6-8s | Maintain energy |
| Detail / close-up | 5-7s | Focus attention |
| Emotional beat / climax | 12-15s | Maximum impact |

Default: 10s

## Transition Style

- Between clips: **crossfade** (0.5s)
- Opening: fade from black (1s)
- Closing: fade to black (1s)

## Cohesion Rules

- ALL clips in one episode share the same cohesion prefix
- Color grading consistency is maintained by the prefix
- Camera movement style should be consistent (don't mix handheld with locked-off)
- Audio: if music is available, mix it. Seedance generates per-clip audio.
