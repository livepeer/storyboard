# Creative Stage — Product Spec

> **What you think is what you see and hear — in real time.**

Creative Stage is a real-time AI creative performance workspace. Type what you imagine, drag to shape it, hear it respond to music, and watch it evolve live. One surface. One flow. No mode-switching.

---

## The Problem

The creative pipeline from idea to live visual output is fractured across 5+ disconnected tools:

1. **Ideate** in Runway/Midjourney (batch, not real-time)
2. **Sequence** in Premiere/After Effects (offline, minutes to render)
3. **Perform** in Resolume/TouchDesigner (real-time but no AI, steep learning curve)
4. **Stream** in OBS (just a transport, no creativity)
5. **Mix audio** in Ableton/Logic (separate app, manual sync)

**No tool on Earth lets you do this today:**

> Type "dreamy forest morphing into underwater city" → see it live → drag a reference photo to shift the colors → drop a music track and watch the visuals sync to the beat → say "record this" → get a finished music video.

Creative Stage does this in one workspace.

---

## Five Market Gaps We Fill

Based on research across TouchDesigner, Resolume, Runway, ComfyUI, Kaiber, Notch, disguise, Unreal:

| Gap | What's missing today | Creative Stage answer |
|-----|---------------------|---------------------|
| **1. NL → Live Stream** | No tool goes from text to streamable video with scene transitions | Agent builds Scope graph from natural language, prompt-traveling transitions scenes |
| **2. Mid-stream style morph** | Changing style = restart pipeline (black screen) | Scope's prompt-traveling morphs seamlessly, no restart |
| **3. Semantic audio-reactivity** | Tools react to amplitude, not musical meaning | Agent maps verse/chorus/drop to prompt changes, modulation syncs to beat structure |
| **4. Storyboard → Live performance** | 6 storyboard scenes can't become a live stream | `/performance` takes a storyboard project and performs it live with transitions |
| **5. Spatial prompt composition** | Prompts are text strings, not visual objects | Canvas cards → drag reference images, LoRAs, modulations as spatial elements |

---

## The Experience

### One Surface, Three Verbs

```
TYPE → DRAG → PLAY
```

No modes. No panels. No settings dialogs. Everything happens on a single canvas.

**TYPE** = tell the AI what you want (Chat input at bottom)
**DRAG** = shape it visually (move images, LoRAs, scenes on the canvas)
**PLAY** = perform it live (scenes transition, music syncs, stream outputs)

### The Canvas

```
┌──────────────────────────────────────────────────────┐
│                                                       │
│   [Ref: neon signs]  ─edge─→  ┌────────────────┐    │
│                                │                │    │
│   [LoRA: oil paint]  ─edge─→  │  LIVE OUTPUT    │    │
│                                │  (WebRTC)      │    │
│   [♪ lo-fi track]   ─edge─→  │                │    │
│                                └────────────────┘    │
│                                                       │
│   Timeline: [Scene 1]──[Scene 2]──[Scene 3]──[Scene 4]│
│   Music:    ▁▂▃▅▆▇█▇▆▅▃▂▁▂▃▅▆▇▅▃▂ ♪ 92bpm          │
│   Mod:      ∿∿∿∿∿∿ noise_scale (cosine/bar)          │
│                                                       │
├──────────────────────────────────────────────────────┤
│  💬 make the forest glow with bioluminescence        │
└──────────────────────────────────────────────────────┘
```

### Everything is a Card

| Card type | What it represents | Drag behavior |
|-----------|-------------------|---------------|
| **Live Output** | The real-time stream (always visible, center) | Resize to fill |
| **Reference Image** | A visual reference | Drag onto Live → becomes VACE input |
| **LoRA Style** | A fine-tuned style adapter | Drag onto Live → loads into pipeline |
| **Music Track** | Audio file or generated music | Drag onto Timeline → syncs modulation |
| **Scene** | A prompt + preset + duration | Drag to reorder in timeline |
| **Modulation** | A parameter oscillation | Drag onto a param → beat-syncs it |
| **Recording** | A captured segment | Appears after "record this" |

No menus. No file dialogs. Everything is visible, spatial, connected with edges showing the data flow.

---

## User Journey: 2 Minutes to Magic

### Step 1: Start (0:00)
User opens Creative Stage. Empty canvas with one card: the Live Output (dark, waiting).

Chat says: *"Describe a scene, or drop an image to begin."*

### Step 2: Type (0:10)
```
a journey through Tokyo at night, neon reflections on wet streets
```

Agent:
- Generates 4 scene prompts (Tokyo streets → neon alleys → rooftop view → train station)
- Builds a Scope graph (text-only → longlive → sink)
- Starts the stream
- Scene cards appear on the canvas timeline

Live Output: stream starts rendering scene 1. The canvas shows:
```
[Scene 1: Wet Streets] ─ [Scene 2: Neon Alleys] ─ [Scene 3: Rooftop] ─ [Scene 4: Train]
```

### Step 3: Drag (0:30)
User has a photo of actual Tokyo neon signs. Drags it from desktop onto the canvas.

Reference card appears. User drags it onto the Live Output → edge connects → Scope receives VACE conditioning → the live stream immediately shifts to incorporate the neon sign colors and shapes.

User types: `"more rain"`

Agent calls `scope_control` with updated prompt. The stream morphs — rain appears, reflections deepen. No restart, no cut — seamless morph.

### Step 4: Music (0:45)
User types: `/music lo-fi Japanese city pop, mellow, 85bpm`

Music card appears. User drags it onto the Timeline.

Agent:
- Detects BPM (85)
- Sets modulation: noise_scale synced to bar rate, cosine wave, depth 0.3
- Transitions between scenes now aligned to musical bars

The Live Output: visuals pulse subtly with the beat. Scene transitions happen on bar boundaries. The rain ripples sync to the rhythm.

### Step 5: Iterate (1:15)
User doesn't like scene 3 (rooftop). Types:

```
change scene 3 to a crowded subway car, warm lighting
```

Agent updates scene 3's prompt. When the timeline reaches scene 3, the stream morphs into a subway interior. The other scenes remain unchanged.

User also drags a LoRA card ("anime style") onto the canvas → connects to Live Output → the entire stream shifts to anime-influenced rendering. The LoRA scale slider appears on the card — user adjusts from 0.6 to 0.8.

### Step 6: Record + Export (1:45)
```
record this from the beginning
```

Agent:
- Rewinds timeline to scene 1
- Starts recording (Scope's recording API)
- Scenes play through with all the customizations
- Music continues as the audio track

After the last scene:
- Recording stops
- `/mix` auto-runs: video recording + music track → final video card
- `"Performance captured: mix-1 (4 scenes, 2:15). Play it or save to file."`

**Total time: under 2 minutes. Zero technical knowledge required.**

---

## Differentiating Features

### 1. Semantic Audio Intelligence

Not just BPM detection. The agent understands music structure:

```
User drops a song.

Agent analyzes:
  0:00-0:15  Intro (quiet, ambient)      → Scene: misty landscape, low noise
  0:15-0:45  Verse (building, rhythmic)  → Scene: city emerging from mist
  0:45-1:15  Chorus (peak, energetic)    → Scene: neon explosion, high noise
  1:15-1:30  Bridge (drop, minimal)      → Scene: single light in darkness
  1:30-2:00  Chorus 2 (bigger, layered)  → Scene: full panoramic, max energy
```

The agent maps song structure to visual intensity, preset switches, and prompt changes. The performance FEELS like it was hand-choreographed to the music.

### 2. Branching Iteration

Not undo/redo. Parallel creative exploration:

```
User: "try two versions — one cyberpunk, one watercolor"

Canvas splits:
  Thread A: [Cyber 1] ─ [Cyber 2] ─ [Cyber 3]
  Thread B: [Water 1] ─ [Water 2] ─ [Water 3]

User watches both streams side-by-side.
"I like cyberpunk scenes but watercolor colors."

Agent: cherry-picks cyberpunk prompts + watercolor LoRA → Thread C.
```

Each thread is a row on the canvas. The user sees all explorations simultaneously. No lost work. Every idea is preserved as a card.

### 3. Audience Reactive (Live Streaming)

For concerts/events — the stream responds to audience input:

```
/stage live --audience-prompt

Audience members text prompts via a shared URL.
Top-voted prompt becomes the next scene transition.
Performer sees incoming prompts as cards on their canvas.
They approve/reject/modify before it hits the stream.
```

The performer is the curator, the audience is the creative crowd. The AI executes.

### 4. Multi-Modal Pipeline

40+ capabilities in one flow:

```
Scene concept (text)
  → Image generation (flux-dev)           → Reference for VACE
  → Live stream (Scope longlive)          → Real-time output
  → Speech generation (chatterbox-tts)    → Narrator voice
  → Music generation (minimax-music)      → Background track
  → Sound effects (mmaudio)              → Synced to video
  → 3D model (tripo3d)                   → Stage element
  → Mix (media-mixer)                    → Final export
```

All orchestrated by the agent, all visible as cards on the canvas, all connected with edges showing the pipeline.

### 5. "What You Think Is What You See"

The feedback loop is under 2 seconds:

| Action | Latency | What happens |
|--------|---------|-------------|
| Type a prompt change | ~1-2s | Stream morphs to new prompt |
| Drag reference image | ~0.5s | VACE updates, colors shift |
| Adjust LoRA scale slider | Instant | Style intensity changes frame-by-frame |
| Change modulation depth | Instant | Beat-sync amplitude changes |
| Reorder scenes | Next transition | Scene sequence updates |

This is not "generate and wait." This is play an instrument.

---

## Use Cases

### Live Concert Visuals
VJ drops the DJ's set onto the canvas. Agent auto-maps song structure to scenes. VJ drags reference images from the artist's brand kit. Audience votes on visual themes. Stream outputs to LED wall via NDI.

### Movie Story Prototyping
Director types a 6-scene synopsis. Agent generates key frames. Director drags reference stills from films they love → VACE adopts the cinematography. Each scene gets animated via Seedance. Director types "make scene 3 more tense" → AI adjusts lighting, pace. 30-minute rough cut assembled on the canvas.

### Commercial Storyboard
Ad agency types the brief. Agent creates 4-shot storyboard with brand colors (LoRA trained on brand assets). Client reviews scenes live — "make the product bigger in shot 2" → instant update. Approved scenes get animated + music + voiceover. Final mixed video exported for client presentation. Same afternoon.

### Music Video Production
Artist uploads their track. Agent analyzes structure, generates scene concepts per section. Artist iterates: "more abstract during the bridge, underwater feeling." Each iteration is a thread on the canvas. Artist picks the best thread, polishes, records. Music video done in one session.

### Educational Content
Teacher types lesson plan. Agent generates illustrated scenes for each concept. Teacher records narration (voice clone from their own voice sample). Scenes animated with talking-head. Mixed into a video lesson. Teacher iterates: "make the dinosaur friendlier" → instant regen. 20-minute lesson produced in 1 hour.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Creative Stage (Next.js web app)                │
│                                                   │
│  @livepeer/creative-kit                          │
│    InfiniteBoard · ArtifactCard · ChatPanel      │
│    CommandRouter · CapabilityResolver             │
│                                                   │
│  @livepeer/agent                                 │
│    AgentRunner · ToolRegistry · WorkingMemory     │
│    LivepeerProvider                               │
│                                                   │
│  Stage-specific:                                  │
│    ScopeClient (HTTP + WebRTC to Scope backend)  │
│    PerformanceEngine (timeline + music sync)      │
│    AudienceReactive (shared prompt voting)        │
│    SemanticAudioAnalyzer (song structure → scenes)│
│                                                   │
├─────────────────────────────────────────────────┤
│  Scope Backend (existing, untouched)              │
│    Graph Executor · Pipeline Manager              │
│    Modulation Engine · WebRTC · Recording         │
│    LoRA Manager · VACE · Asset System             │
│                                                   │
├─────────────────────────────────────────────────┤
│  Livepeer Infrastructure                          │
│    SDK Service → BYOC Orch → 41 AI capabilities  │
│    Scope Orchestrators → fal.ai Scope runner      │
│    Signer → payment tickets                       │
└─────────────────────────────────────────────────┘
```

**Key principle:** Scope backend is untouched. Creative Stage is a new frontend that calls Scope's existing APIs. All Scope capabilities (graphs, modulation, VACE, LoRA, recording, NDI/Spout) are accessible through the canvas + chat.

---

## What Makes This a Masterpiece

| Axis | Status quo | Creative Stage |
|------|-----------|---------------|
| **Simple** | TouchDesigner: 6 months to learn. Resolume: pre-render clips. | Type what you want. Drag to refine. Play to perform. |
| **Effective** | 5 tools, 3 exports, 2 hours | One canvas, one flow, 2 minutes |
| **Human in the loop** | AI generates, human waits and approves | AI generates in real-time, human shapes with every gesture |
| **WYTIWYSH** | Generate → wait → review → re-prompt → wait | Think → see it live → adjust → see it change → feel the music |

The magic is the **feedback loop speed**. When the gap between intention and result is under 2 seconds, creativity becomes *play* — not *work*.

No tool in the market offers this today. The closest (ComfyUI streaming, Krea Canvas) are single-user, single-scene, no music sync, no scene sequencing, no agent intelligence. Creative Stage combines real-time AI generation + spatial canvas + agent reasoning + music intelligence + 41 AI models into one experience where thinking and creating happen simultaneously.

---

## Implementation Phases

| Phase | What | Builds on |
|-------|------|-----------|
| **1. Canvas + Scope** | Live Output card, reference image → VACE, basic chat → scope_control | creative-kit + Scope API |
| **2. Scene Timeline** | Scene cards, drag to reorder, auto-transitions, prompt-traveling | Performance engine |
| **3. Music Intelligence** | Drop music → BPM detect → modulation sync → semantic scene mapping | Audio analysis + modulation API |
| **4. Branching Iteration** | Multi-thread canvas, side-by-side streams, cherry-pick between threads | ArtifactStore extensions |
| **5. Audience Reactive** | Shared URL, prompt voting, performer approval queue | WebSocket + voting system |
| **6. Export Pipeline** | Record → mix → final video with music | Scope recording + media-mixer |
