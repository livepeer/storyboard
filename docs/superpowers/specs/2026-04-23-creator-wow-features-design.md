# Creator WOW Features — Design Specification

**Goal:** Eight high-impact features that turn storyboard/creative-stage from "cool AI demo" into "I shipped a video in 5 minutes." Zero regression to existing functionality.

**Architecture principle:** Every feature builds on existing infrastructure (creative-kit, compound-tools, canvas store, Scope params). No new backend services. No database. All state stays in localStorage + Zustand. Browser-first, with server-side optional enhancements later.

**Branch:** `feat/creator-wow-features` off `main`

---

## Feature 1: Final Cut Composer

### Problem
Creators generate images, videos, audio on the canvas — but can't stitch them into a single deliverable video. They have to export individually and assemble in Premiere/CapCut.

### Solution
A `/render` command and "Render" button that stitches selected cards (or an entire project/film) into a single playable video with transitions, narration overlay, and background music.

### Architecture

```
User: /render [project-name] [--music audio-card] [--format mp4|webm]
  → RenderEngine collects cards in layout order (narrative row order or selection order)
  → buildVideoManifest() produces ordered URL+duration list (already exists)
  → Browser MediaRecorder stitches video+audio via canvas.captureStream()
  → Progress bar in chat (RenderProgressCard component)
  → Result: downloadable video blob + preview card on canvas
```

### Interfaces

```typescript
// packages/creative-kit/src/agent/render-engine.ts

export interface RenderOptions {
  /** Cards to include, in order. If empty, use active project's scenes. */
  cardIds?: string[];
  /** Background music card refId or URL */
  musicSource?: string;
  /** Output format */
  format: "webm" | "mp4";
  /** Resolution (default: from first video/image card) */
  width?: number;
  height?: number;
  /** Transition between scenes */
  transition: "cut" | "crossfade" | "fade-black";
  /** Transition duration in seconds (default: 0.5) */
  transitionDuration?: number;
  /** Image hold duration when no video exists (default: 4s) */
  imageHoldDuration?: number;
  /** Progress callback */
  onProgress?: (pct: number) => void;
}

export interface RenderResult {
  /** Blob URL of the rendered video */
  url: string;
  /** Duration in seconds */
  duration: number;
  /** File size in bytes */
  size: number;
  /** Suggested filename */
  fileName: string;
}

export async function renderProject(opts: RenderOptions): Promise<RenderResult>;
```

### Key decisions
- **Browser-first via MediaRecorder** — no server needed. The existing `mixMedia()` in creative-kit already does canvas.captureStream + MediaRecorder. This extends it with transitions and image-hold support.
- **Crossfade transitions** — draw two frames with alpha blending during transition windows. Cut = instant switch. Fade-black = alpha ramp down then up.
- **MP4 not supported in MediaRecorder** on all browsers — fallback to WebM with a note. Future: server-side FFmpeg transcoding.
- **Audio mixing** — reuse `mixMedia()` infrastructure. Connect music track via Web Audio API `createMediaElementSource`.

### New files
- `packages/creative-kit/src/agent/render-engine.ts` — core render logic
- `packages/creative-kit/src/ui/RenderProgressCard.tsx` — progress bar UI
- Storyboard: `lib/skills/commands.ts` — `/render` command handler
- Storyboard: agent tool `render_project` in `lib/tools/render-tools.ts`

### Regression guard
- `buildVideoManifest()` and `mixMedia()` untouched — new code calls them
- No changes to canvas store or card types

---

## Feature 2: Canvas Time Machine

### Problem
No undo/redo. Delete a card and it's gone. Creators are afraid to experiment.

### Solution
An immutable snapshot stack in the canvas store. Cmd+Z undoes the last canvas mutation. Cmd+Shift+Z redoes. Named snapshots for "save this state." Snapshot comparison side-by-side.

### Architecture

```
Every canvas mutation (addCard, updateCard, removeCard, addEdge, applyLayout)
  → push current {cards, edges} to undoStack (max 50 entries)
  → clear redoStack
  
Cmd+Z → pop undoStack → push current to redoStack → restore popped state
Cmd+Shift+Z → pop redoStack → push current to undoStack → restore popped state

Named snapshots: /snapshot save "before experiment"
  → store {cards, edges, name, timestamp} in snapshotList (localStorage, max 20)
/snapshot restore "before experiment"
  → restore from snapshotList, push current to undoStack first
/snapshot list → show SnapshotListCard in chat
```

### Interfaces

```typescript
// packages/creative-kit/src/stores/history-manager.ts

export interface CanvasSnapshot {
  cards: Artifact[];
  edges: ArtifactEdge[];
}

export interface NamedSnapshot extends CanvasSnapshot {
  name: string;
  timestamp: number;
  /** Thumbnail: data URL of canvas at snapshot time (optional) */
  thumbnail?: string;
}

export interface HistoryManager {
  /** Push current state before a mutation */
  pushUndo(snapshot: CanvasSnapshot): void;
  /** Undo last mutation, returns state to restore */
  undo(): CanvasSnapshot | null;
  /** Redo last undone mutation */
  redo(): CanvasSnapshot | null;
  /** Whether undo/redo are available */
  canUndo: boolean;
  canRedo: boolean;
  /** Named snapshots */
  saveSnapshot(name: string, snapshot: CanvasSnapshot, thumbnail?: string): void;
  restoreSnapshot(name: string): CanvasSnapshot | null;
  listSnapshots(): NamedSnapshot[];
  removeSnapshot(name: string): void;
}

export function createHistoryManager(opts?: { maxUndo?: number; maxSnapshots?: number }): HistoryManager;
```

### Integration with canvas store
The canvas store wraps every mutating action with `pushUndo()` before applying the change. This is a 1-line addition per action — no restructuring needed.

```typescript
// In useCanvasStore:
addCard: (opts) => set((s) => {
  history.pushUndo({ cards: s.cards, edges: s.edges }); // NEW
  // ... existing addCard logic unchanged
}),
```

### Key decisions
- **Max 50 undo levels** — each snapshot is ~2-5KB (card metadata without media blobs). 50 levels = ~250KB max.
- **Media URLs are NOT duplicated** — snapshots store card metadata with URL references. The actual media files live on GCS/fal CDN. Undo restores the reference, not the bytes.
- **Named snapshots persist to localStorage** — max 20 entries with optional canvas thumbnail (small data URL via `canvas.toDataURL('image/jpeg', 0.3)`).
- **Undo stack is in-memory only** — cleared on page refresh. Named snapshots survive refresh.

### New files
- `packages/creative-kit/src/stores/history-manager.ts`
- `packages/creative-kit/src/ui/SnapshotListCard.tsx`
- Storyboard: keyboard handler in `app/page.tsx` (Cmd+Z/Cmd+Shift+Z)
- Storyboard: `/snapshot` command in `lib/skills/commands.ts`

### Regression guard
- Canvas store actions get a 1-line `pushUndo()` call prepended. Zero logic change to the actions themselves.
- No changes to card types, edge types, or layout algorithms.

---

## Feature 3: Face Lock — Pixel-Level Character Consistency

### Problem
`characterLock` is text-only ("girl with red hair"). Every scene generates a different face. AI filmmakers can't tell coherent stories.

### Solution
`/facelock <card-refId>` extracts a face/character reference from a card and injects its URL as a VACE `ref_image` into every subsequent generation in that project. The face stays consistent across all scenes.

### Architecture

```
/facelock img-3
  → Read img-3's URL from canvas
  → Store as project.faceLock = { refId: "img-3", url: "https://..." }
  → Every create_media call in this project auto-injects:
      params.ref_image_url = faceLock.url
      prompt prefix += "consistent character from reference image"
  → For Scope streams: auto-set vace_ref_images: [faceLock.url]

/facelock clear — remove the lock
/facelock — show which card is locked
```

### Interfaces

```typescript
// Extension to Project type (lib/projects/types.ts)
export interface FaceLock {
  /** The card whose image is the face/character reference */
  refId: string;
  /** Direct URL to the reference image */
  url: string;
  /** Optional: extracted character description */
  characterDescription?: string;
  /** When the lock was set */
  lockedAt: number;
}

// Added to Project:
export interface Project {
  // ... existing fields ...
  faceLock?: FaceLock;
}
```

### How it wires into create_media
In `compound-tools.ts`, after resolving the capability and before calling `runInference`:

```typescript
// If the active project has a face lock, inject the reference image
const activeProject = useProjectStore.getState().getActive();
if (activeProject?.faceLock?.url) {
  params.ref_image_url = activeProject.faceLock.url;
  // Models that support reference-guided generation:
  // kontext-edit, veo-i2v, seedance-i2v accept image_url/ref_image_url
}
```

### How it wires into Scope streams
In `scope-tools.ts` `scope_start`, if the active project has a face lock:
```typescript
if (activeProject?.faceLock?.url) {
  scopeParams.vace_ref_images = [activeProject.faceLock.url];
  scopeParams.vace_context_scale = 0.7; // strong reference adherence
}
```

### Key decisions
- **VACE is the mechanism for video streams** — already supported in Scope via `vace_ref_images`. Zero Scope changes needed.
- **kontext-edit for image generation** — when face lock is active and action is `generate`, route through kontext-edit with the reference image. This produces face-consistent images.
- **Not all models support reference images** — only inject ref_image_url when the resolved capability supports it (kontext-edit, veo-i2v, seedance-i2v). For models that don't (flux-dev, ltx-t2v), fall back to text-only character lock.
- **One face lock per project** — simple and clear. Multiple character references would be a separate feature.

### New files
- `lib/skills/commands.ts` — `/facelock` command handler
- No new tool files — wires into existing `compound-tools.ts` and `scope-tools.ts`

### Regression guard
- `compound-tools.ts` gets a 5-line conditional block that only fires when faceLock exists. No change to the non-facelock path.
- `scope-tools.ts` same — conditional injection. Existing scope_start behavior unchanged without a face lock.

---

## Feature 4: Creative Pipelines — Saved Workflow Chains

### Problem
Creators find a multi-step recipe (generate → remove bg → upscale → animate → add music) and want to repeat it on different inputs. Currently they manually re-type each step.

### Solution
Save a sequence of tool calls as a named pipeline. Replay it with new input. Built on the existing DAG executor.

### Architecture

```
User runs: /pipeline record "product-video"
  → System starts recording tool calls
  → User does their workflow manually (or via chat)
  → /pipeline stop
  → System saves the recorded tool calls as a Pipeline

User later: /pipeline run "product-video" --input img-5
  → System replays the recorded steps, substituting img-5 as the source
  → DAG executor runs steps (parallel where independent)

/pipeline list → show saved pipelines
/pipeline delete "product-video" → remove
```

### Interfaces

```typescript
// packages/creative-kit/src/agent/pipeline-recorder.ts

export interface PipelineStep {
  /** Tool name (e.g. "create_media", "canvas_update") */
  tool: string;
  /** Tool params (source_url will be templated) */
  params: Record<string, unknown>;
  /** Which previous step's output this depends on */
  dependsOn?: number;
  /** Human label */
  label: string;
}

export interface Pipeline {
  id: string;
  name: string;
  steps: PipelineStep[];
  createdAt: number;
  /** How many times this pipeline has been run */
  runCount: number;
  /** Description auto-generated from steps */
  description: string;
}

export interface PipelineRecorder {
  /** Start recording tool calls */
  startRecording(name: string): void;
  /** Record a tool call during recording */
  record(tool: string, params: Record<string, unknown>, label?: string): void;
  /** Stop recording and save the pipeline */
  stopRecording(): Pipeline;
  /** Whether currently recording */
  isRecording: boolean;
}

export interface PipelineRunner {
  /** Run a saved pipeline with a new input source */
  run(pipelineId: string, inputCardRefId?: string): Promise<void>;
}

export function createPipelineRecorder(): PipelineRecorder;
export function createPipelineRunner(executeTool: (name: string, params: Record<string, unknown>) => Promise<unknown>): PipelineRunner;
```

### Storage
- Pipelines stored in localStorage under `creative_pipelines` key
- Max 20 saved pipelines
- Each pipeline stores the tool calls as templates with `{{input}}` placeholder for the source URL

### Template substitution
When replaying, the runner:
1. Finds the first step's `source_url` or `image_url` and replaces it with the new input card's URL
2. For subsequent steps with `dependsOn`, chains the output URL from the dependency
3. Calls `executeDAG()` for parallel execution where possible

### Key decisions
- **Record tool calls, not chat messages** — pipelines are tool-level, not prompt-level. This makes them deterministic and replayable without LLM involvement.
- **DAG executor for replay** — `dependsOn` references enable parallel execution. A pipeline with independent upscale + remove_bg runs them concurrently.
- **No visual node editor in v1** — keep it simple. Record/replay. Visual editor can come later.

### New files
- `packages/creative-kit/src/agent/pipeline-recorder.ts`
- `packages/creative-kit/src/stores/pipeline-store.ts`
- `packages/creative-kit/src/ui/PipelineListCard.tsx`
- Storyboard: `/pipeline` command in `lib/skills/commands.ts`

### Regression guard
- Recording hooks into the tool registry's `executeTool()` wrapper — if recording, also call `recorder.record()`. No change to tool execution logic.
- No changes to compound-tools, canvas-tools, or project-tools.

---

## Feature 5: Variation Grid — Generate 4, Pick 1

### Problem
`create_media` generates 1 result. If you don't like it, you regenerate and hope. No structured way to compare alternatives.

### Solution
`/vary <card-refId>` (or right-click → "Variations") generates a 2x2 grid of alternatives. Same prompt, different parameters. Click to keep one, dismiss the rest. Creative memory learns from the choice.

### Architecture

```
/vary img-3
  → Read img-3's prompt and capability
  → Generate 4 variations using create_media with steps:
      [1] same prompt, same model (different seed)
      [2] same prompt, alternate model
      [3] slightly modified prompt (add "alternative composition")
      [4] slightly modified prompt (add "different angle")
  → All 4 run in parallel (no cross-step deps)
  → 4 cards appear in a 2x2 cluster on canvas
  → VariationPicker overlay: "Pick your favorite" with 1/2/3/4 buttons
  → User picks one → other 3 removed → recordPositive for chosen model/style
```

### Interfaces

```typescript
// packages/creative-kit/src/agent/variation-engine.ts

export interface VariationOptions {
  /** Source card to vary */
  sourceRefId: string;
  /** Source card URL */
  sourceUrl: string;
  /** Original prompt */
  prompt: string;
  /** Original capability */
  capability: string;
  /** Number of variations (default: 4) */
  count?: number;
  /** Variation strategy */
  strategy: "seed" | "model" | "prompt" | "mixed";
}

export interface VariationSet {
  id: string;
  sourceRefId: string;
  /** RefIds of the generated variation cards */
  variationRefIds: string[];
  /** Which was picked (null = none yet) */
  pickedRefId: string | null;
  createdAt: number;
}

export function buildVariationSteps(opts: VariationOptions): Array<{
  action: string;
  prompt: string;
  capability?: string;
  source_url?: string;
}>;

export function pickVariation(setId: string, pickedRefId: string): void;
```

### Context menu integration
Add to `ContextMenu.tsx` `ACTIONS` array:
```typescript
{ id: "variations", label: "Variations (x4)", icon: "🔀", forTypes: ["image"], requiresMedia: true, mode: "direct" }
```

### Key decisions
- **4 variations** — 2x2 grid is the sweet spot. Enough choice without overwhelming. All run in parallel.
- **Mixed strategy by default** — variation 1: same model/different seed, variation 2: alternate model, variation 3-4: prompt tweaks. Gives meaningful diversity.
- **Picking auto-cleans** — choosing one removes the other 3 cards. The dismissed cards feed `recordNegative()`, the chosen feeds `recordPositive()`. Creative memory gets 4 data points per interaction.
- **No extra model calls for seed variation** — pass different `seed` param to the same capability. Most fal models support `seed`.

### New files
- `packages/creative-kit/src/agent/variation-engine.ts`
- `packages/creative-kit/src/ui/VariationPicker.tsx` (small overlay component)
- Storyboard: `/vary` command in `lib/skills/commands.ts`
- Storyboard: `variations` entry in `ContextMenu.tsx`

### Regression guard
- Uses existing `create_media` with multi-step parallel execution. No changes to create_media.
- Context menu gets one new entry. No changes to existing entries.

---

## Feature 6: Music Video Mode — Beat-Synced Scene Transitions

### Problem
BPM detection and beat-synced modulation exist in creative-stage but not in the main storyboard canvas. Scene transitions are timer-based, not music-driven. Music videos are the highest-engagement content creators want to make.

### Solution
`/musicvideo <concept> --music <audio-card-or-url>` generates a multi-scene visual narrative timed to musical structure. Scene durations align to bar boundaries. Transitions fire on beats.

### Architecture

```
/musicvideo "neon city at night" --music aud-1
  → detectBpm(aud-1.url) → { bpm: 128, confidence: 0.9 }
  → Calculate bar duration: 60/128 * 4 = 1.875s per bar
  → LLM generates scene plan with durations snapped to bar boundaries:
      Scene 1: "aerial city lights" — 8 bars (15s) — verse
      Scene 2: "street level neon" — 8 bars (15s) — chorus (higher energy)
      Scene 3: "rainy alley close-up" — 4 bars (7.5s) — bridge
      Scene 4: "sunrise over skyline" — 8 bars (15s) — final chorus
  → project_create with these scenes
  → project_generate (parallel via DAG)
  → Auto-compose via render engine with crossfade transitions on beat boundaries
```

### Interfaces

```typescript
// packages/creative-kit/src/agent/music-video.ts

export interface MusicVideoOptions {
  concept: string;
  /** Audio source: card refId or URL */
  musicSource: string;
  /** Number of scenes (default: 4-6, auto from song length) */
  sceneCount?: number;
  /** Style override */
  style?: string;
}

export interface MusicVideoScene {
  index: number;
  title: string;
  prompt: string;
  /** Duration in bars */
  bars: number;
  /** Duration in seconds (computed from BPM) */
  durationSecs: number;
  /** Energy level 0-1 (maps to visual intensity) */
  energy: number;
  /** Section type */
  section: "intro" | "verse" | "chorus" | "bridge" | "outro";
}

export interface MusicVideoPlan {
  id: string;
  concept: string;
  bpm: number;
  barDuration: number; // seconds per bar
  totalDuration: number;
  scenes: MusicVideoScene[];
  musicUrl: string;
}

export function planMusicVideo(opts: MusicVideoOptions, bpm: BpmResult): MusicVideoPlan;
```

### BPM detection reuse
Move `bpm-detect.ts` from `apps/creative-stage/lib/` to `packages/creative-kit/src/agent/bpm-detect.ts`. Update creative-stage to import from creative-kit. This makes BPM detection available to both apps.

### Key decisions
- **Bar-snapped durations** — scenes are always a multiple of 4 beats (1 bar). This ensures transitions land on musically meaningful boundaries.
- **Energy mapping** — chorus scenes get higher `noise_scale` if streamed, or more dynamic prompts ("dramatic," "intense") if pre-rendered.
- **Auto-compose** — after generation, automatically runs the render engine (Feature 1) with `transition: "crossfade"` timed to bar boundaries. The music track is mixed in.
- **Reuse /film infrastructure** — `MusicVideoPlan` maps cleanly to `Film` with additional BPM metadata. Can reuse film generation pipeline.

### New files
- `packages/creative-kit/src/agent/music-video.ts`
- `packages/creative-kit/src/agent/bpm-detect.ts` (moved from creative-stage)
- Storyboard: `/musicvideo` command in `lib/skills/commands.ts`

### Regression guard
- BPM detect is moved, not copied — creative-stage import path updated.
- Film pipeline untouched. Music video uses its own plan + project_create.
- No changes to Scope or stream infrastructure.

---

## Feature 7: One-Command Social Export

### Problem
`getSocialSpecs()` has Instagram/TikTok/YouTube/Twitter dimensions but no actual crop, resize, or format logic. Creators post to 4+ platforms and manually reformat each time.

### Solution
`/export social <platform>` or `/export social all` auto-crops and resizes cards to platform specs. For video cards: trim to platform max duration, add text-safe zone overlay. For images: smart crop with face detection centering.

### Architecture

```
/export social instagram
  → Collect selected cards (or all cards)
  → For each card:
      Image: draw to canvas at 1080x1080 (center-crop, cover fit)
      Video: re-encode via MediaRecorder at 1080x1080, trim to 60s max
  → Download as ZIP: "storyboard-instagram-YYYY-MM-DD.zip"

/export social all
  → Run for each platform in parallel
  → Download as ZIP with platform subdirectories
```

### Interfaces

```typescript
// packages/creative-kit/src/agent/social-export.ts

export interface SocialExportOptions {
  /** Platform to export for */
  platform: SocialPlatform | "all";
  /** Card refIds to export. If empty, all cards with media. */
  cardRefIds?: string[];
  /** Add text-safe zone overlay guides */
  showSafeZones?: boolean;
  /** Add watermark text */
  watermark?: string;
  /** Progress callback */
  onProgress?: (pct: number) => void;
}

export interface SocialExportResult {
  platform: SocialPlatform;
  files: Array<{ name: string; blob: Blob; width: number; height: number }>;
}

export async function exportForSocial(opts: SocialExportOptions): Promise<SocialExportResult[]>;
```

### Smart crop algorithm
```typescript
// Center-crop with aspect ratio fit:
// 1. Calculate source and target aspect ratios
// 2. If source is wider: crop sides (center horizontally)
// 3. If source is taller: crop top/bottom (center vertically, bias toward top 1/3 for faces)
// 4. Draw cropped region to output canvas at target dimensions
```

### Key decisions
- **Canvas API for image cropping** — no server needed. `drawImage()` with source rect handles all cropping.
- **MediaRecorder for video re-encoding** — same technique as render engine. Draw video frames to a sized canvas, record the canvas stream.
- **Face-bias cropping** — when cropping vertically, bias toward the top 1/3 of the image (where faces typically are). Not true face detection, but good enough for most content.
- **ZIP packaging** — reuse the existing `downloadCards()` ZIP bundler pattern. Add platform subdirectories for "all" export.
- **Text-safe zones** — optional overlay that shows where text won't be covered by platform UI (Instagram caption area, TikTok buttons, etc.)

### New files
- `packages/creative-kit/src/agent/social-export.ts`
- Storyboard: extend `/export` command in `lib/skills/commands.ts` (or create `/export social`)

### Regression guard
- `getSocialSpecs()` and `listSocialPlatforms()` untouched — called by new code.
- Existing export pipeline (JSON, PDF) unchanged.
- No canvas store changes.

---

## Feature 8: Live Audience Canvas — Viewers Shape the Stream (via Livepeer Studio)

### Problem
Streams are creator-only. No viewer URL, no interaction. The scope-player package exists but has no viewer-facing UI. There's no way to share a stream with an audience.

### Solution
When streaming via Scope, `/stream share` pushes the output to **Livepeer Studio** as an RTMP/WebRTC stream, getting a shareable playback URL. Viewers watch via Livepeer's CDN (global, low-latency). A reaction overlay lets viewers influence Scope parameters in real-time.

### Architecture

```
Creator: /stream share
  → Create a Livepeer Studio stream via API: POST /api/stream
  → Get back: streamKey, playbackId, rtmpUrl
  → Scope output frames → re-encode to RTMP via MediaRecorder → push to Livepeer ingest
     OR: use Livepeer WebRTC ingest (lower latency)
  → Shareable viewer URL: https://lvpr.tv/?v={playbackId}
     OR: custom viewer page: /view/{playbackId}
  → Viewer page: Livepeer Player (iframe or @livepeer/react) + ReactionBar
  → Reactions: SSE from our API route (lightweight, in-memory)
  → Aggregated reactions → scope_control parameter updates on creator side

Flow:
  Scope output → canvas.captureStream(30) → MediaRecorder (WebM/H264)
    → fetch() chunks to Livepeer RTMP/WebRTC ingest
    → Livepeer CDN distributes globally
    → Viewers watch via HLS/WebRTC playback

Creator sees:
  → Shareable URL in chat (click to copy)
  → Viewer count badge on stream card (from Livepeer viewership API)
  → Reaction ticker overlay (last 10 reactions)
  → Can toggle "audience control" on/off
```

### Livepeer Studio Integration

```typescript
// lib/stream/livepeer-studio.ts

import Livepeer from "@livepeer/sdk";

const livepeer = new Livepeer({ apiKey: process.env.LIVEPEER_STUDIO_API_KEY });

export interface LivepeerStream {
  id: string;
  streamKey: string;
  playbackId: string;
  rtmpIngestUrl: string; // rtmp://rtmp.livepeer.com/live/{streamKey}
  webrtcIngestUrl: string;
  playbackUrl: string;   // https://livepeercdn.studio/hls/{playbackId}/index.m3u8
  shareUrl: string;       // https://lvpr.tv/?v={playbackId}
}

/** Create a Livepeer Studio stream for sharing */
export async function createLivepeerStream(name: string): Promise<LivepeerStream>;

/** Push canvas frames to Livepeer ingest via WebRTC */
export async function startLivepeerIngest(
  canvasStream: MediaStream,
  stream: LivepeerStream,
): Promise<{ stop: () => void }>;

/** Get viewer count from Livepeer viewership API */
export async function getViewerCount(playbackId: string): Promise<number>;

/** Delete the stream when done */
export async function deleteLivepeerStream(streamId: string): Promise<void>;
```

### Ingest method: WebRTC (preferred)
Livepeer Studio supports WebRTC ingest via WHIP protocol. This gives sub-second latency from creator to viewer.

```typescript
// WebRTC ingest via WHIP
const pc = new RTCPeerConnection();
canvasStream.getTracks().forEach(track => pc.addTrack(track, canvasStream));
const offer = await pc.createOffer();
await pc.setLocalDescription(offer);

const response = await fetch(stream.webrtcIngestUrl, {
  method: "POST",
  headers: { "Content-Type": "application/sdp", Authorization: `Bearer ${stream.streamKey}` },
  body: offer.sdp,
});
const answer = await response.text();
await pc.setRemoteDescription({ type: "answer", sdp: answer });
```

### Viewer page
```
app/view/[playbackId]/page.tsx
  → Livepeer Player component (@livepeer/react or iframe embed)
  → ReactionBar component (emoji buttons)
  → SSE connection to /api/stream/[playbackId]/events for reaction sync
```

### Reaction system (lightweight SSE — still our code)
Livepeer Studio handles video distribution. Reactions are our own lightweight layer:

```
app/api/stream/[playbackId]/react/route.ts   — POST: submit reaction
app/api/stream/[playbackId]/events/route.ts  — GET: SSE stream of aggregated reactions + viewer count
```

Reactions aggregate in 5-second windows. The dominant reaction maps to a scope_control param change on the creator's browser.

### Interfaces

```typescript
// packages/creative-kit/src/streaming/audience.ts

export interface AudienceReaction {
  type: "fire" | "calm" | "sparkle" | "heart" | "surprise";
  timestamp: number;
}

export interface AudienceState {
  viewerCount: number;
  reactionCounts: Record<AudienceReaction["type"], number>;
  audienceControlEnabled: boolean;
  /** Livepeer stream info (null if not sharing) */
  livepeerStream: LivepeerStream | null;
}

export interface ReactionToParamMapping {
  reaction: AudienceReaction["type"];
  param: string;
  delta: number;
  min?: number;
  max?: number;
}

export const DEFAULT_REACTION_MAPPINGS: ReactionToParamMapping[] = [
  { reaction: "fire", param: "noise_scale", delta: 0.1, min: 0, max: 1 },
  { reaction: "calm", param: "noise_scale", delta: -0.1, min: 0, max: 1 },
  { reaction: "sparkle", param: "reset_cache", delta: 1 },
  { reaction: "surprise", param: "kv_cache_attention_bias", delta: -0.1, min: 0.01, max: 1 },
];

export function aggregateReactions(reactions: AudienceReaction[], windowSecs: number): Record<string, number>;
export function reactionsToParamUpdates(counts: Record<string, number>, mappings: ReactionToParamMapping[]): Record<string, number>;
```

### Key decisions
- **Livepeer Studio for distribution** — global CDN, HLS + WebRTC playback, viewer metrics API, no infrastructure to manage. The `@livepeer/react` player handles adaptive bitrate automatically.
- **WebRTC ingest (WHIP)** — sub-second creator→viewer latency. Scope output canvas → `captureStream(30)` → WebRTC → Livepeer CDN. Fallback to RTMP via `MediaRecorder` if WebRTC fails.
- **Reactions stay as our SSE layer** — Livepeer handles video, we handle social interaction. Keeps the reaction system simple (in-memory, no database). Could migrate to Livepeer's webhook system later.
- **5-second aggregation window** — prevents spam. The dominant reaction in each window determines the param change. One reaction per viewer per window.
- **Creator controls** — audience influence is opt-in. Toggle on/off. Creator can override any param at any time via scope_control.
- **API key as env var** — `LIVEPEER_STUDIO_API_KEY` in `.env.local`. The Studio API route creates streams server-side.
- **Auto-cleanup** — when `/stream stop` fires, the Livepeer stream is deleted automatically. No orphan streams.

### New files
- `lib/stream/livepeer-studio.ts` — Livepeer Studio API client (create/delete/ingest)
- `packages/creative-kit/src/streaming/audience.ts` — reaction aggregation logic
- `app/view/[playbackId]/page.tsx` — viewer page with Livepeer Player + reactions
- `app/api/stream/livepeer/route.ts` — create/delete Livepeer streams (server-side, holds API key)
- `app/api/stream/[playbackId]/react/route.ts` — reaction submission
- `app/api/stream/[playbackId]/events/route.ts` — SSE event stream
- `components/stream/ReactionBar.tsx` — emoji reaction buttons
- `components/stream/ViewerBadge.tsx` — viewer count badge on stream card

### Dependencies
- `@livepeer/react` — player component for viewer page
- `livepeer` — server SDK for stream management API

### Regression guard
- Scope tools and stream session completely untouched. Livepeer ingest is a secondary output alongside the existing trickle-based Scope output — both run in parallel.
- Audience reactions call `scope_control` tool via the existing execution path.
- Stream cards get a ViewerBadge overlay — purely additive, no change to Card.tsx rendering logic.
- ScopePlayer package used as-is on the creator side. Viewer page uses Livepeer Player.

---

## Phase Plan

### Phase 1: Foundation (Features 2, 5, 7)
Low complexity, high immediate impact. No dependencies on each other.
- **Canvas Time Machine** — undo/redo + snapshots
- **Variation Grid** — generate-4-pick-1
- **Social Export** — platform-ready output

### Phase 2: Composition (Features 1, 6)
Build on Phase 1's snapshot/export infrastructure.
- **Final Cut Composer** — video stitching (needs social export's canvas crop logic)
- **Music Video Mode** — beat-synced scenes (needs render engine from Feature 1)

### Phase 3: Intelligence (Features 3, 4)
Build on Phase 2's rendering and creative memory.
- **Face Lock** — character consistency
- **Creative Pipelines** — workflow record/replay

### Phase 4: Social (Feature 8)
The most complex feature. Requires all others working.
- **Live Audience Canvas** — viewer sharing + reactions

### Phase Gates
- **After Phase 1:** E2E tests proving undo, variations, and social export work. Storyboard regression suite passes.
- **After Phase 2:** E2E test rendering a 4-scene film to video. Music video generates and renders.
- **After Phase 3:** E2E test face lock producing consistent characters across 4 scenes. Pipeline record/replay works.
- **After Phase 4:** E2E test viewer page loads, reactions flow, params update.

---

## Non-Regression Guarantee

Every feature follows these rules:
1. **Additive only** — new files, new commands, new context menu entries. No modification to existing tool execution logic unless it's a 1-5 line conditional injection.
2. **Feature-flagged by usage** — features only activate when explicitly invoked (command, context menu, keyboard shortcut). Existing workflows are untouched.
3. **Existing tests pass** — `npm run test` and `npx playwright test` must pass after each phase.
4. **Canvas store contract preserved** — `addCard`, `updateCard`, `removeCard`, `addEdge` signatures unchanged. History manager wraps them, doesn't replace them.
