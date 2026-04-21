# Creative Stage — Demo Script

## Setup

```bash
cd apps/creative-stage && npm run dev
```

Open **http://localhost:3002**

---

## Demo 1: First-Time Setup (10s)

1. Settings dialog auto-opens (no API key)
2. Enter SDK URL: `https://sdk.daydream.monster`
3. Enter API key: your `sk_...` Daydream key
4. Click **Save & Connect** — dialog closes

---

## Demo 2: Start a Live Stream (30s)

Type in chat:

> Start a cinematic stream of bioluminescent jellyfish drifting through deep ocean darkness, cyan and magenta glow, dark water

- Agent calls `stage_start` → ScopePlayer connects → warm-up spinner → live frames
- "Live" badge pulses on stream + green "Streaming" in chat header
- FPS counter shows in top-right of the player

---

## Demo 3: Multi-Scene Performance (60s)

Type in chat:

> Create a 4-scene visual journey: start with underwater coral reef, transition to aurora borealis over arctic ice, then into a neon Tokyo cityscape, finish with a serene mountain sunrise

- Agent calls `stage_scene` → 4 scene cards appear in the bottom timeline
- Each card shows title, duration, color-coded preset badge
- Click **play** (or press **Space**) → scenes auto-transition via prompt traveling
- Progress bar sweeps across, scene cards highlight as they play

---

## Demo 4: Morph the Stream Live (15s)

While streaming, type:

> Change the scene to a dreamlike forest with floating lanterns and fireflies

- Agent calls `stage_prompt` → stream morphs seamlessly, no restart
- The visual continuously evolves from the previous scene

---

## Demo 5: Import Reference + VACE (20s)

1. Click **Import** → select a reference image (painting, photo, artwork)
2. Card appears on canvas with system message
3. **Drag the imported card near the Live Output** card
4. System message: "Reference applied" → stream morphs to match reference colors/structure

---

## Demo 6: Music + Beat Sync (30s)

1. Click **Import** → select an audio file (.wav or .mp3)
2. System message: `Audio loaded: track-name — 120 BPM (85% confidence)`
3. Waveform bar appears above the scene strip with BPM badge
4. Click **Sync** → noise_scale modulates to the beat

---

## Demo 7: Record & Export (15s)

1. Click the red **Record** button (top-left, appears when streaming)
2. Pulsing recording indicator shows elapsed time
3. Click **Stop** → green **Download** button appears
4. Click **Download** → saves `.webm` file

---

## Demo 8: Style Presets (15s)

Type in chat:

> Switch to psychedelic style with maximum creativity

- Agent calls `stage_prompt` with `noise_scale: 0.9`
- Stream goes wild and abstract

Then:

> Go back to faithful, keep the composition close to the reference

- `noise_scale: 0.2` → stream calms down, follows input closely

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Space** | Play / Stop performance timeline |
| **R** | Start / Stop recording |

Only active outside text inputs.

---

## Talking Points

- "Everything runs through Livepeer's decentralized GPU network — no centralized AI provider"
- "Prompt traveling creates seamless visual transitions between scenes — the stream morphs, never restarts"
- "VACE reference is spatial conditioning — drag any image near the live output and it becomes a style guide"
- "Beat sync modulates visual parameters in real-time to the audio tempo"
- "The entire app is ~1,200 lines of code — built on creative-kit + agent SDK + scope-player"

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "GEMINI_API_KEY not configured" | Add key to `apps/creative-stage/.env.local` |
| Settings button shows red "Setup" | Enter API key in Settings dialog |
| Stream stuck on "Warming up" | Cold start takes 1-2 min on first use |
| 410 error / stream dies | SDK restarted — just send a new prompt to restart |
| Low FPS (<10) | Normal for first few seconds; stabilizes to 15-25 FPS |
