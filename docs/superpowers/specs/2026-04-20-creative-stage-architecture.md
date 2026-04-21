# Creative Stage — Architecture & Implementation Plan

> **Design principle:** A professional creator should be productive in 30 seconds, masterful in 30 minutes. No tutorials needed.

---

## 1. Architecture: Three Layers, Zero Glue Code

```
apps/creative-stage/
  app/page.tsx                    ← ONE page. That's the whole app.
  lib/
    scope-client.ts               ← HTTP + WebRTC to Scope backend
    stage-tools.ts                ← 6 agent tools (start, control, vace, lora, record, mix)
    performance.ts                ← Timeline sequencer (scenes + music sync)
  components/
    Stage.tsx                     ← The single main component
    LiveOutput.tsx                ← WebRTC video display (center of canvas)
    SceneStrip.tsx                ← Horizontal scene timeline (bottom)
    WaveformBar.tsx               ← Music waveform + beat indicators (bottom)
```

That's it. ~15 files. Everything else comes from creative-kit and agent SDK.

### What We Build vs What We Reuse

| Need | Source | Lines to write |
|------|--------|---------------|
| Canvas with pan/zoom/drag | `creative-kit: InfiniteBoard, ArtifactCard` | 0 |
| Chat input + messages | `creative-kit: ChatPanel, MessageBubble` | 0 |
| Slash commands (/scene, /record, /mix) | `creative-kit: CommandRouter` | ~100 |
| Model fallback + error handling | `creative-kit: CapabilityResolver, extractFalError` | 0 |
| Video+audio mixing | `creative-kit: mixMedia` | 0 |
| Agent reasoning + tool calling | `agent: AgentRunner, ToolRegistry` | 0 |
| Agent memory (current scene, graph) | `agent: WorkingMemoryStore` | 0 |
| LLM provider | `agent: LivepeerProvider` | 0 |
| Real-time video pipeline | Scope backend (existing API) | 0 |
| Graph execution | Scope graph executor (existing) | 0 |
| Modulation + beat sync | Scope modulation engine (existing) | 0 |
| VACE + LoRA | Scope asset system (existing) | 0 |
| Recording | Scope recording API (existing) | 0 |
| **Scope HTTP+WebRTC client** | **New** | ~200 |
| **6 stage agent tools** | **New** | ~300 |
| **Performance timeline sequencer** | **New** | ~250 |
| **Stage UI (LiveOutput, SceneStrip, Waveform)** | **New** | ~400 |
| **Page + wiring** | **New** | ~150 |
| **Total new code** | | **~1,400 LOC** |

The app is thin. The intelligence is in the layers below.

---

## 2. The Single Page

```tsx
// apps/creative-stage/app/page.tsx
export default function Stage() {
  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Left: Canvas (80% width) */}
      <div style={{ flex: 1, position: "relative" }}>
        <InfiniteBoard viewport={viewport} onViewportChange={setViewport}>
          {/* Center: Live Output (WebRTC video) */}
          <LiveOutput streamUrl={scopeStreamUrl} />

          {/* Cards: references, LoRAs, recordings — draggable */}
          {artifacts.map(a => (
            <ArtifactCard key={a.id} artifact={a} onDrop={handleDrop}>
              <CardContent artifact={a} />
            </ArtifactCard>
          ))}

          {/* Bottom: Scene strip + waveform */}
          <SceneStrip scenes={scenes} currentScene={activeScene} onReorder={reorderScenes} />
          <WaveformBar audioUrl={musicUrl} bpm={bpm} currentTime={elapsed} />
        </InfiniteBoard>
      </div>

      {/* Right: Chat (20% width) */}
      <div style={{ width: 340, borderLeft: "1px solid #333" }}>
        <ChatPanel messages={messages} onSend={handleSend} />
      </div>
    </div>
  );
}
```

One page. One layout. Canvas left, chat right. Everything else is a card on the canvas.

---

## 3. Scope Client — 200 Lines

The bridge between Creative Stage and Scope's existing backend:

```typescript
// lib/scope-client.ts

export class ScopeClient {
  constructor(private baseUrl: string) {}

  // Pipeline
  async loadPipeline(id: string, params?: Record<string, unknown>): Promise<void>
  async updateParams(params: Record<string, unknown>): Promise<void>
  async getPipelineStatus(): Promise<PipelineStatus>

  // Graph
  async resolveWorkflow(graph: GraphConfig): Promise<void>

  // WebRTC (for LiveOutput)
  async createSession(): Promise<RTCSessionDescription>
  async addCandidate(candidate: RTCIceCandidate): Promise<void>

  // VACE
  async uploadAsset(file: Blob, name: string): Promise<string>
  async setVace(refImages: string[], scale?: number): Promise<void>

  // LoRA
  async loadLora(path: string, scale: number): Promise<void>
  async unloadLora(path: string): Promise<void>

  // Modulation
  async setModulation(param: string, config: ModulationConfig): Promise<void>
  async setTempo(bpm: number): Promise<void>

  // Recording
  async startRecording(): Promise<string>
  async stopRecording(): Promise<RecordingResult>
}
```

Each method is one `fetch()` call to Scope's existing REST API. No new Scope code needed.

---

## 4. Agent Tools — 6 Tools, 300 Lines

The agent doesn't call Scope directly. It calls tools. The tools call the ScopeClient.

```typescript
// lib/stage-tools.ts

const tools = [
  // 1. Start/build a stream from natural language
  {
    name: "stage_start",
    description: "Start a live stream from a scene description. Builds the Scope graph automatically.",
    parameters: { prompt: "string", preset: "string?", graph_template: "string?" },
    execute: async (args) => {
      const graph = buildGraphFromTemplate(args.graph_template || "text-only");
      await scopeClient.resolveWorkflow(graph);
      await scopeClient.updateParams({ prompts: args.prompt, ... });
      return { success: true, stream_active: true };
    },
  },

  // 2. Change the prompt mid-stream (no restart)
  {
    name: "stage_prompt",
    description: "Update the live stream prompt. The visual morphs seamlessly.",
    parameters: { prompt: "string", preset: "string?", noise_scale: "number?" },
    execute: async (args) => { ... },
  },

  // 3. Set VACE reference images
  {
    name: "stage_reference",
    description: "Add a visual reference to influence the stream's style/colors.",
    parameters: { image_url: "string", scale: "number?" },
    execute: async (args) => { ... },
  },

  // 4. Load/adjust LoRA
  {
    name: "stage_style",
    description: "Load a style (LoRA) into the live pipeline.",
    parameters: { style: "string", scale: "number?" },
    execute: async (args) => { ... },
  },

  // 5. Set modulation (beat sync)
  {
    name: "stage_sync",
    description: "Sync a parameter to the music beat.",
    parameters: { param: "string", wave: "string?", rate: "string?", depth: "number?" },
    execute: async (args) => { ... },
  },

  // 6. Record the stream
  {
    name: "stage_record",
    description: "Start or stop recording the live stream.",
    parameters: { action: "start|stop" },
    execute: async (args) => { ... },
  },
];
```

6 tools. Each one sentence description. The agent picks which to call based on what the user says. "Make it dreamy" → `stage_prompt`. "Use this photo for colors" → `stage_reference`. "Sync the glow to the beat" → `stage_sync`.

---

## 5. Performance Engine — 250 Lines

Sequences scenes over time, synced to music.

```typescript
// lib/performance.ts

export class PerformanceEngine {
  private scenes: Scene[] = [];
  private musicBpm = 0;
  private currentSceneIdx = 0;
  private timers: number[] = [];

  // Set scenes (from agent or user reordering)
  setScenes(scenes: Scene[]): void

  // Start the performance — transitions happen automatically
  async play(scopeClient: ScopeClient): Promise<void> {
    // Apply scene 1 immediately
    await scopeClient.updateParams({ prompts: this.scenes[0].prompt, ... });

    // Schedule transitions
    let elapsed = 0;
    for (let i = 1; i < this.scenes.length; i++) {
      elapsed += this.scenes[i - 1].duration;
      this.timers.push(setTimeout(async () => {
        await scopeClient.updateParams({ prompts: this.scenes[i].prompt, ... });
        this.currentSceneIdx = i;
        this.onSceneChange?.(i);
      }, elapsed * 1000));
    }
  }

  // Stop and clear timers
  stop(): void

  // Music sync — align scene transitions to bar boundaries
  syncToMusic(bpm: number, barsPerScene?: number): void

  // Callbacks
  onSceneChange?: (index: number) => void;
  onProgress?: (elapsed: number, total: number) => void;
}
```

This is the same pattern as `/stream apply` in storyboard, but extracted and generalized.

---

## 6. The UX That Wins Hearts

### For the Professional Creator

**What they see first:** A dark canvas with one element — the Live Output card (empty, pulsing softly). A chat input at the bottom right. Nothing else.

**What they do:** Type a scene. See it live in 2 seconds. Drag a photo. See it influence the stream instantly. Drop music. Feel the beat sync.

**Why they stay:**

1. **Repeatability** — same workflow every time: type → drag → play → record. No setup, no configuration, no "wait, which panel was that in?"

2. **Progressive disclosure** — the first minute is dead simple. The second minute reveals power: LoRAs, modulation, branching. The tenth session reveals mastery: custom graphs, semantic audio mapping, multi-thread iteration. But the surface is always the same canvas.

3. **No dead ends** — every action is undoable (it's a card — remove it). Every experiment is preserved (it's a thread on the canvas). Nothing is lost. Nothing requires starting over.

4. **The instrument feel** — a pianist doesn't think "I need to open the piano settings panel and adjust the velocity curve." They sit down and play. Creative Stage is the same: sit down, type, drag, play. The technical complexity is invisible.

### Visual Design Principles

| Principle | Implementation |
|-----------|---------------|
| **One focal point** | Live Output is always center, always largest |
| **Dark background, bright content** | Canvas is #0a0a0f. Cards have subtle borders. Live Output glows. |
| **No chrome** | No toolbars, no menus, no ribbons. Chat is the only persistent UI element. |
| **Spatial hierarchy** | Cards near the Live Output have stronger influence. Distance = relevance. |
| **Motion = alive** | Live Output is always moving. Beat indicators pulse. Scene transitions animate. The app never feels static. |
| **Sound = feedback** | Subtle audio cues: card snap, scene transition whoosh, recording beep. The app speaks back. |

---

## 7. Phased Implementation

### Phase 1: Live Canvas (Week 1-2)

**Goal:** Type a prompt → see live Scope stream on the canvas.

**Build:**
- App scaffold (`apps/creative-stage/`)
- `ScopeClient` — connect to Scope backend (HTTP + WebRTC)
- `LiveOutput` component — WebRTC video display as a card on InfiniteBoard
- `stage_start` and `stage_prompt` tools
- Agent wired with ChatPanel → sends text → agent calls stage_start

**Test:**
```
Type "a dreamy forest" → Live Output shows Scope stream → 
Type "add rain" → stream morphs seamlessly
```

**E2E test:** `creative-stage-phase1.spec.ts`
- App loads with empty canvas
- Type prompt → Live Output appears
- Type second prompt → stream updates (no restart)

**Milestone:** Live AI video from natural language, on a canvas, with real-time prompt updates.

---

### Phase 2: Drag to Shape (Week 3)

**Goal:** Drag reference images and LoRAs onto the canvas → they influence the live stream.

**Build:**
- Import media (right-click canvas → From Computer/URL) — reuse from storyboard
- `stage_reference` tool — uploads image to Scope assets, sets VACE
- `stage_style` tool — loads LoRA
- Drag detection: when a card is dropped near LiveOutput → connect edge → call tool
- LoRA scale slider on LoRA cards

**Test:**
```
Drag photo onto canvas → drag near Live Output → 
edge connects → stream adopts reference colors/structure
```

**E2E test:** `creative-stage-phase2.spec.ts`
- Import image → drag near Live Output → VACE activates
- Load LoRA → style changes in stream

**Milestone:** Visual prompt composition — spatial, intuitive, instant feedback.

---

### Phase 3: Scene Timeline (Week 4)

**Goal:** Multiple scenes that transition automatically (prompt traveling).

**Build:**
- `SceneStrip` component — horizontal row of scene cards at bottom of canvas
- `PerformanceEngine` — schedules scene transitions via `stage_prompt`
- Agent generates scenes from concept (reuses story/film generation pattern)
- Scene reordering via drag
- `/scene add <prompt>`, `/scene remove <index>`, `/performance play`

**Test:**
```
"Create a 4-scene journey through Tokyo" → 
4 scene cards appear → performance plays → 
scenes transition automatically
```

**E2E test:** `creative-stage-phase3.spec.ts`
- Generate scenes → SceneStrip shows 4 cards
- Play → scenes transition (verify prompt changes)
- Drag to reorder → sequence changes

**Milestone:** Prompt traveling with visual timeline.

---

### Phase 4: Music Sync (Week 5)

**Goal:** Drop music → beat detection → modulation sync → scene transitions on bar boundaries.

**Build:**
- `WaveformBar` component — audio waveform display with playhead
- BPM detection (use Web Audio API `AnalyserNode` or send to Gemini for analysis)
- `stage_sync` tool — sets modulation on Scope
- Music drop → auto-set BPM → auto-set modulation → scene durations align to bars
- `/music` integration (generate music, then sync)

**Test:**
```
Drop lo-fi track → BPM detected (85) → 
noise_scale modulates to cosine/bar → 
scene transitions snap to bar boundaries
```

**E2E test:** `creative-stage-phase4.spec.ts`
- Drop audio file → WaveformBar appears
- Modulation activates → verify beat indicators
- Scene transitions align to music bars

**Milestone:** Audio-reactive AI visuals with musical intelligence.

---

### Phase 5: Record + Export (Week 6)

**Goal:** Record the performance → mix with music → export final video.

**Build:**
- `stage_record` tool — calls Scope recording API
- "Record" button on Live Output card (or `/record start`)
- Auto-mix: recording + music track → final video via `mixMedia()`
- Export card with download button
- `/performance record` — plays all scenes + records + mixes in one command

**Test:**
```
"Record this from scene 1" → 
performance plays → recording captures → 
auto-mix with music → final video card appears
```

**E2E test:** `creative-stage-phase5.spec.ts`
- Start recording → play scenes → stop → mix → video card created
- Video card is playable in browser

**Milestone:** Complete creative pipeline — type to final video in one session.

---

### Phase 6: Polish + Power Features (Week 7-8)

**Goal:** Branching iteration, audience reactive, semantic audio.

**Build:**
- Branching: fork scene timeline into parallel threads (Thread A / Thread B on canvas)
- Cherry-pick: "use cyberpunk prompts but watercolor style" → agent merges threads
- Audience mode: shared URL → prompt voting → performer approval queue
- Semantic audio: agent analyzes song structure (verse/chorus/bridge) → maps to scenes

**These are stretch goals.** Phase 1-5 is the core product. Phase 6 adds the differentiators.

---

## 8. File Inventory

```
apps/creative-stage/
  package.json                          # Next.js app, depends on creative-kit + agent
  next.config.ts                        # transpilePackages: creative-kit
  app/
    layout.tsx                          # Minimal dark layout, no header
    page.tsx                            # The ONE page
    globals.css                         # Dark theme (#0a0a0f)
    api/
      scope/[...path]/route.ts          # Proxy to Scope backend (CORS bypass)
  lib/
    scope-client.ts                     # HTTP + WebRTC client for Scope
    stage-tools.ts                      # 6 agent tools
    performance.ts                      # Timeline sequencer
    audio-analyzer.ts                   # BPM detection via Web Audio
  components/
    Stage.tsx                           # Main layout (canvas + chat)
    LiveOutput.tsx                      # WebRTC video card
    SceneStrip.tsx                      # Horizontal scene timeline
    SceneCard.tsx                       # Individual scene in strip
    WaveformBar.tsx                     # Music waveform + beat dots
    RecordButton.tsx                    # Record indicator on LiveOutput
  tests/
    e2e/
      creative-stage-phase1.spec.ts     # Live stream from text
      creative-stage-phase2.spec.ts     # Drag to shape
      creative-stage-phase3.spec.ts     # Scene timeline
      creative-stage-phase4.spec.ts     # Music sync
      creative-stage-phase5.spec.ts     # Record + export
```

~15 source files. ~1,400 lines of new code. The rest is creative-kit + agent SDK + Scope.

---

## 9. What We Don't Build

| Temptation | Why not |
|-----------|---------|
| Custom graph editor | Scope already has one. Creative Stage hides the graph — the agent builds it. |
| Parameter panels | Scope has them. Creative Stage uses chat + drag. "Make it dreamier" > noise_scale slider. |
| Audio editor | Not needed. Drop audio, agent handles sync. `/mix` handles merge. |
| User accounts / auth | Reuse Daydream API key. No new auth system. |
| Video editor / timeline | Not a video editor. It's a performance instrument. The timeline is scenes, not frames. |
| Collaboration server | Phase 6 stretch. Not core. |

---

## 10. Success Metrics

| Metric | Target | How measured |
|--------|--------|-------------|
| Time to first live stream | < 10 seconds | From page load to visible stream |
| Time from prompt change to visual update | < 2 seconds | Prompt → Scope → frame |
| Session-to-export conversion | > 50% | Users who start a stream AND export a video |
| Power feature adoption | > 30% use LoRA or VACE by session 3 | Track tool calls |
| Repeat usage | > 60% return within 7 days | Analytics |

The North Star: **"I typed one sentence and got a live music video."**
