# How to Stream in Storyboard

A simple guide to creating multi-scene live streams with automatic prompt traveling.

## Quick Start (30 seconds)

```
/stream a sunset over the ocean, golden hour to starry night
```

Wait ~5 seconds. A cyan stream plan card appears with 3-6 scenes and a visual timeline.

Type `start streaming` (or click 📡 Start Stream).

Watch the stream evolve scene-by-scene on the canvas. The prompt transitions automatically at the times shown in the timeline.

## What is Prompt Traveling?

The stream's visual content evolves over time. Instead of one static prompt, you give a *story* — and the stream walks through it:

```
Scene 1 (0-20s):   "golden hour, warm orange sky, calm waves"
Scene 2 (20-40s):  "sun touching the horizon, pink and purple clouds"
Scene 3 (40-60s):  "deep twilight, first stars appearing, dark blue"
Scene 4 (60-80s):  "starry night sky, moonlight on the water, peaceful"
```

Each transition uses `scope_control` to update the prompt and preset mid-stream. The viewer sees a smooth morphing from one scene to the next.

## Stream vs Story vs Film

| | /story | /film | /stream |
|---|---|---|---|
| Output | Static images | Images + video clips | Live real-time stream |
| Scenes | 6 | 4 | 3-6 |
| Apply | project_create → images | project_create → images → animate | scope_start → scope_control loop |
| Duration | — | ~15s video total | 1-3 min live |
| View | Cards on canvas | Cards + video cards | Live stream card |

## Commands

```
/stream <concept>       — generate a multi-scene stream plan
/stream list            — show recent plans
/stream show <id>       — re-display a saved plan
/stream apply [id]      — start streaming (or type "start streaming")
/stream stop            — stop the active stream
```

## Example Prompts

### Nature transitions
```
/stream a forest through the four seasons, spring blossoms to winter snow
```

### City timelapse
```
/stream a city street from morning rush hour to midnight emptiness
```

### Abstract art
```
/stream abstract paint swirls that evolve from warm reds to cool blues to electric purples
```

### Webcam + style shift
```
/stream my webcam transforming from dreamy watercolor to anime to psychedelic
```
(Uses `simple-lv2v` graph since it mentions webcam — requires camera)

### Story-driven
```
/stream a dragon egg in a cave, it cracks, a baby dragon emerges, takes first flight
```

## How It Works Under the Hood

1. **Plan generation** — Gemini receives the concept + the stream director prompt. Returns JSON with title, style, graph_template, and 3-6 scenes (each with prompt, preset, noise_scale, duration).

2. **Plan review** — The StreamPlanCard renders with:
   - Visual timeline bar (colored segments proportional to duration)
   - Scene list with preset, noise_scale, and time markers
   - Start Stream button

3. **Stream start** — `scope_start` fires with Scene 1's prompt + the chosen graph template + preset. A stream card appears on the canvas.

4. **Prompt traveling** — `setTimeout` schedules `scope_control` calls for each subsequent scene at the right time offset. Each call updates:
   - `prompts` (the new scene description)
   - `preset` (cinematic → dreamy → psychedelic → etc.)
   - `noise_scale` (if specified per scene)

5. **Auto-stop** — After the last scene's duration, `scope_stop` fires and the stream card shows "done".

## Graph Templates

| Template | When to use | Input needed? |
|---|---|---|
| `text-only` | Pure generation from text (default) | No |
| `simple-lv2v` | Webcam/video transformation | Yes (webcam or video) |
| `depth-guided` | Preserve structure from source | Yes (image/video) |

The LLM auto-selects `text-only` unless the user mentions webcam/camera/video.

## Presets (per-scene)

| Preset | Noise Scale | Best for |
|---|---|---|
| faithful | 0.2 | Close to source, minimal creativity |
| cinematic | 0.5 | Film-quality, balanced |
| anime | 0.6 | Anime style |
| painterly | 0.65 | Oil painting, artistic |
| dreamy | 0.7 | Soft, ethereal |
| abstract | 0.95 | Heavy transformation |
| psychedelic | 0.9 | Maximum creativity |

Scenes can use different presets — the stream smoothly transitions between them.

## Troubleshooting

| Issue | Fix |
|---|---|
| Stream returns 503 | SDK/orch infrastructure issue. Check `/health` and signer wallet deposit. |
| Stream starts but shows nothing | Graph template needs input source but none provided. Switch to `text-only`. |
| Transitions don't fire | Check browser console for scope_control errors. The setTimeout timers are client-side. |
| Stream dies after first scene | Orch or fal runner timed out. Try shorter scene durations (15s instead of 30s). |
| "scope_start tool not registered" | Tool registry not loaded. Hard-refresh the page. |
