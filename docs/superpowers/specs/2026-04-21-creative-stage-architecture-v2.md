# Creative Stage — Architecture v2

> **Design principle:** A professional creator should be productive in 30 seconds, masterful in 30 minutes.

> **Branch:** `feat/creative-stage` off latest `main`
> **Hard constraint:** Zero regression for storyboard. Storyboard on `main` is untouched.

---

## 1. Branch Strategy

```
main (storyboard works, verified, deployed on Vercel)
  └── feat/creative-stage
        ├── packages/creative-kit/       (shared, additions only — no breaking changes)
        ├── packages/scope-player/       (NEW — extracted from Scope frontend)
        ├── apps/creative-stage/         (NEW — the app)
        └── tests/e2e/creative-stage-*.spec.ts
```

**Rules:**
- `main` is never touched during development. Feature branch only.
- `packages/creative-kit/` — additive changes only. No type changes, no removed exports.
- New package `packages/scope-player/` — extracted Scope WebRTC + VideoOutput components. Scope frontend repo is NOT modified.
- `apps/creative-stage/` — completely new, no shared files with storyboard app.
- Before merge: full storyboard regression suite must pass (481+ unit tests, E2E, build).

---

## 2. The Stream Playback Problem

**Storyboard's stream card today:**
- Polls for JPEG frames via HTTP (`/stream/{id}/frame`)
- Displays as `<img>` tags in sequence — no real video player
- **No audio** — JPEG frames can't carry audio
- Laggy — HTTP polling at 200ms intervals, visible stutter
- No resolution control, no fullscreen, no volume

**Scope's VideoOutput today:**
- WebRTC `MediaStream` → `<video>` element — real video playback
- **Full audio support** — mute/unmute button, starts muted (browser policy)
- Sub-100ms latency (WebRTC peer connection)
- Resolution scaling ("fit" / "native" modes)
- Play/pause overlay
- Handles audio-only streams gracefully

**Decision:** Creative Stage uses Scope's WebRTC playback — not storyboard's HTTP polling.

---

## 3. New Package: `packages/scope-player/`

Extracted from Scope's frontend. Provides WebRTC connection + video output for any app.

```
packages/scope-player/
  package.json                    # @livepeer/scope-player
  tsconfig.json
  src/
    index.ts                      # Public exports
    ScopePlayer.tsx               # Combined player: WebRTC + video + audio + controls
    use-scope-stream.ts           # Hook: manages WebRTC connection to Scope backend
    types.ts                      # Shared types (ScopeParams, StreamState, etc.)
```

### ScopePlayer Component

```tsx
interface ScopePlayerProps {
  /** Scope backend URL (e.g., "http://localhost:8000" or cloud URL) */
  scopeUrl: string;
  /** Initial parameters for the stream */
  initialParams?: ScopeParams;
  /** Whether to start streaming immediately */
  autoStart?: boolean;
  /** Scale mode: "fit" fills container, "native" shows actual resolution */
  scaleMode?: "fit" | "native";
  /** Called when stream state changes */
  onStateChange?: (state: StreamState) => void;
  /** Called on parameter updates from the backend (modulation, etc.) */
  onParamsUpdate?: (params: Record<string, unknown>) => void;
  /** Called on tempo updates (beat sync) */
  onTempoUpdate?: (tempo: TempoState) => void;
  /** CSS class for the container */
  className?: string;
  /** Children rendered as overlay (e.g., recording indicator) */
  children?: ReactNode;
}

export function ScopePlayer(props: ScopePlayerProps): JSX.Element
```

**What it provides:**
- WebRTC connection to Scope backend (ICE negotiation, SDP exchange)
- `<video>` element with audio track support
- Mute/unmute button (bottom-right, starts muted)
- Play/pause overlay
- Connection state indicator (connecting → streaming → error)
- Data channel for parameter updates (bidirectional)
- Clean disconnect on unmount

### useScopeStream Hook

For apps that need more control than the component:

```typescript
interface UseScopeStreamReturn {
  /** The remote MediaStream (video + audio) */
  remoteStream: MediaStream | null;
  /** Connection state */
  state: "idle" | "connecting" | "streaming" | "error";
  /** Start the stream */
  start: (params?: ScopeParams) => Promise<void>;
  /** Stop the stream */
  stop: () => void;
  /** Update parameters mid-stream (prompt, noise, preset, etc.) */
  updateParams: (params: Partial<ScopeParams>) => void;
  /** Current tempo/beat state (if modulation active) */
  tempo: TempoState | null;
}

export function useScopeStream(scopeUrl: string, opts?: UseScopeStreamOptions): UseScopeStreamReturn
```

### Extraction from Scope

The code is adapted (not copied verbatim) from:
- `Scope/scope/frontend/src/components/VideoOutput.tsx` → `ScopePlayer.tsx`
- `Scope/scope/frontend/src/hooks/useUnifiedWebRTC.ts` → `use-scope-stream.ts`

**Adaptations:**
- Remove Scope-specific contexts (BillingContext, CloudStatus)
- Remove controller input / pointer lock (not needed for Creative Stage)
- Remove Spout/NDI/Syphon sink management (WebRTC only)
- Keep: audio handling, mute/unmute, resolution scaling, data channel
- Add: React 19 compatibility, Next.js "use client" directives

---

## 4. App Architecture

```
apps/creative-stage/
  package.json                          # deps: creative-kit, scope-player, agent
  next.config.ts
  app/
    layout.tsx                          # Minimal: dark bg, no header chrome
    page.tsx                            # THE page
    globals.css                         # #0a0a0f dark, minimal
    api/
      scope/[...path]/route.ts          # Proxy: /api/scope/* → Scope backend (CORS)
  lib/
    scope-client.ts                     # HTTP client for Scope REST API (non-WebRTC)
    stage-tools.ts                      # 6 agent tools
    performance.ts                      # Scene sequencer
    commands.ts                         # /scene, /record, /mix, /performance
  components/
    Stage.tsx                           # Main layout
    LiveCard.tsx                        # ScopePlayer wrapped as an ArtifactCard
    SceneStrip.tsx                      # Horizontal scene timeline
    WaveformBar.tsx                     # Audio waveform
```

### The LiveCard — ScopePlayer as a Canvas Card

```tsx
// components/LiveCard.tsx
import { ScopePlayer } from "@livepeer/scope-player";
import { ArtifactCard } from "@livepeer/creative-kit";

export function LiveCard({ artifact, scopeUrl, onMove, onResize }) {
  return (
    <ArtifactCard artifact={artifact} onMove={onMove} onResize={onResize}>
      <ScopePlayer
        scopeUrl={scopeUrl}
        autoStart={true}
        scaleMode="fit"
        onTempoUpdate={(t) => /* update WaveformBar beat indicator */}
      >
        {/* Overlay: scene name, recording indicator */}
        <div className="absolute bottom-2 left-2 text-xs text-white/60">
          Scene 1 of 4 — "dreamy forest"
        </div>
      </ScopePlayer>
    </ArtifactCard>
  );
}
```

The live stream IS an artifact card. It has the same drag/resize behavior as any other card. But instead of `<img>` or `<video>`, it renders `<ScopePlayer>` — a real WebRTC video player with audio.

---

## 5. Scope Client — REST API Only

The ScopePlayer handles WebRTC. The ScopeClient handles everything else via HTTP:

```typescript
// lib/scope-client.ts
export class ScopeClient {
  constructor(private proxyUrl = "/api/scope") {}

  // Pipeline
  async loadPipeline(id: string, params?: Record<string, unknown>): Promise<void> {
    await fetch(`${this.proxyUrl}/api/v1/pipeline/load`, {
      method: "POST", body: JSON.stringify({ pipeline_id: id, ...params }),
    });
  }

  async updateParams(params: Record<string, unknown>): Promise<void> {
    // Uses the data channel via ScopePlayer for real-time params
    // Falls back to REST for non-streaming updates
    await fetch(`${this.proxyUrl}/api/v1/pipeline/parameters`, {
      method: "PATCH", body: JSON.stringify(params),
    });
  }

  // Assets (for VACE reference images)
  async uploadAsset(blob: Blob, name: string): Promise<string> { ... }

  // LoRA
  async loadLora(path: string, scale: number): Promise<void> { ... }

  // Modulation
  async setModulation(param: string, config: ModulationConfig): Promise<void> { ... }

  // Recording
  async startRecording(sessionId: string): Promise<void> { ... }
  async stopRecording(sessionId: string): Promise<RecordingResult> { ... }
}
```

### Proxy Route — CORS Bypass

```typescript
// app/api/scope/[...path]/route.ts
const SCOPE_URL = process.env.SCOPE_URL || "http://localhost:8000";

export async function GET(req: Request, { params }: { params: { path: string[] } }) {
  const path = params.path.join("/");
  const resp = await fetch(`${SCOPE_URL}/api/v1/${path}`);
  return new Response(resp.body, { status: resp.status, headers: { "Content-Type": "application/json" } });
}

export async function POST(req: Request, { params }: { params: { path: string[] } }) {
  const path = params.path.join("/");
  const body = await req.text();
  const resp = await fetch(`${SCOPE_URL}/api/v1/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body,
  });
  return new Response(resp.body, { status: resp.status, headers: { "Content-Type": "application/json" } });
}
```

---

## 6. Agent Tools — 6 Tools

```typescript
const stageTools = {
  stage_start: {
    // Build graph template + start WebRTC stream
    // Uses ScopeClient.loadPipeline() + ScopePlayer.start()
  },
  stage_prompt: {
    // Update prompt mid-stream via data channel (instant, no restart)
    // Uses ScopePlayer.updateParams({ prompts: "..." })
  },
  stage_reference: {
    // Upload image to Scope assets, set VACE
    // Uses ScopeClient.uploadAsset() + .updateParams({ vace_ref_images })
  },
  stage_style: {
    // Load LoRA into pipeline
    // Uses ScopeClient.loadLora(path, scale)
  },
  stage_sync: {
    // Set modulation on a parameter (beat sync)
    // Uses ScopeClient.setModulation(param, { wave, rate, depth })
  },
  stage_record: {
    // Start/stop recording via Scope recording API
    // Uses ScopeClient.startRecording() / .stopRecording()
  },
};
```

---

## 7. Regression Safety

### Before merge to main:

```bash
# 1. Storyboard unit tests (must match main baseline)
npm test                    # 481+ pass, same 2 pre-existing failures

# 2. Storyboard build
npm run build               # Clean, no errors

# 3. Storyboard E2E
npx playwright test tests/e2e/storyboard.spec.ts
npx playwright test tests/e2e/stream-command.spec.ts

# 4. Creative-kit unit tests (must not regress)
npx vitest run packages/creative-kit/src/__tests__/

# 5. Creative Stage E2E (new)
npx playwright test tests/e2e/creative-stage-*.spec.ts
```

### What can't regress:

| Component | Protection |
|-----------|-----------|
| Storyboard app (`app/`, `lib/`, `components/`) | Zero files modified |
| creative-kit interfaces | Additive only — no type changes |
| creative-kit stores | No behavior changes to existing factories |
| creative-kit UI | No prop changes to existing components |
| Agent SDK (`packages/agent/`) | Zero files modified |
| Existing tests | All must pass at merge time |

### What's new (no regression risk):

| Component | Why safe |
|-----------|---------|
| `packages/scope-player/` | New package, no existing consumers |
| `apps/creative-stage/` | New app, isolated directory |
| `tests/e2e/creative-stage-*.spec.ts` | New tests |

---

## 8. Phased Plan

### Phase 1: Foundation — Live Stream on Canvas (Week 1-2)

**Branch:** `feat/creative-stage`

**Build:**
1. Scaffold `apps/creative-stage/` (Next.js, dark theme, one page)
2. Create `packages/scope-player/` (extract from Scope frontend)
   - `ScopePlayer` component (WebRTC video + audio)
   - `useScopeStream` hook
   - Remove Scope-specific contexts, add "use client"
3. `LiveCard` — ScopePlayer wrapped in ArtifactCard on InfiniteBoard
4. `ScopeClient` — HTTP client for Scope REST API
5. `/api/scope/[...path]/` — CORS proxy
6. `stage_start` + `stage_prompt` tools
7. ChatPanel wired to agent → type prompt → stream starts

**Test (E2E):**
```typescript
test("type prompt → live stream with audio appears on canvas", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await page.fill("textarea", "a dreamy forest");
  await page.press("textarea", "Enter");
  // Verify: video element appears, is playing
  await expect(page.locator("video")).toBeVisible({ timeout: 30000 });
  // Verify: mute button exists (audio track present)
  await expect(page.locator("button[title*='mute' i]")).toBeVisible();
});

test("type new prompt → stream updates without restart", async ({ page }) => {
  // Start stream, then send new prompt
  // Verify: no video interruption (no "connecting" state flash)
});
```

**Regression check:**
```bash
npm test && npm run build   # storyboard still works
```

**Milestone:** WebRTC live stream with audio on a creative-kit canvas, controlled by natural language.

---

### Phase 2: Drag to Shape (Week 3)

**Build:**
1. Import media (right-click canvas → From Computer/URL) — reuse pattern from storyboard ContextMenu
2. `stage_reference` tool — upload image to Scope assets API, set VACE
3. `stage_style` tool — load LoRA via Scope LoRA API
4. Drop detection: artifact card dropped near LiveCard → connect edge → call tool
5. LoRA scale slider rendered on style cards

**Test:**
```typescript
test("drag reference image near live output → VACE activates", ...);
test("load LoRA → style changes in stream", ...);
```

**Milestone:** Spatial composition — drag images to influence the live stream.

---

### Phase 3: Scene Timeline (Week 4)

**Build:**
1. `SceneStrip` component — horizontal row at bottom
2. `PerformanceEngine` — scene sequencer using `stage_prompt` tool
3. Agent generates scenes from concept text
4. Drag scenes to reorder
5. `/scene add`, `/scene remove`, `/performance play`

**Test:**
```typescript
test("generate 4 scenes → timeline shows 4 cards", ...);
test("play → scenes transition via prompt updates", ...);
test("drag reorder → sequence changes", ...);
```

**Milestone:** Prompt traveling with visual timeline control.

---

### Phase 4: Music Sync (Week 5)

**Build:**
1. `WaveformBar` — audio waveform display with beat indicators
2. BPM detection via Web Audio API AnalyserNode
3. `stage_sync` tool — sets modulation via Scope modulation API
4. Drop music → auto-detect BPM → set modulation → align scene transitions to bars
5. Tempo data from ScopePlayer `onTempoUpdate` → beat dots on WaveformBar

**Test:**
```typescript
test("drop audio → BPM detected → beat indicators appear", ...);
test("modulation active → noise_scale oscillates with beat", ...);
```

**Milestone:** Music-reactive live AI visuals.

---

### Phase 5: Record + Export (Week 6)

**Build:**
1. `stage_record` tool — Scope recording API
2. Record button overlay on LiveCard
3. `/performance record` — play all scenes + record + auto-mix with music
4. Uses `mixMedia()` from creative-kit for final export

**Test:**
```typescript
test("record → play scenes → stop → mixed video card appears", ...);
```

**Milestone:** Complete pipeline — type to final video.

---

### Phase 6: Polish (Week 7-8)

**Build (stretch goals):**
- Branching iteration (parallel scene threads)
- Semantic audio analysis (verse/chorus → scene mapping)
- Audience reactive mode

---

## 9. Dependencies

```json
// apps/creative-stage/package.json
{
  "dependencies": {
    "@livepeer/creative-kit": "workspace:*",
    "@livepeer/scope-player": "workspace:*",
    "@livepeer/agent": "workspace:*",
    "next": "16.2.2",
    "react": "19.2.4",
    "zustand": "^5.0.12"
  }
}

// packages/scope-player/package.json
{
  "peerDependencies": {
    "react": ">=18"
  }
}
```

### Environment Variables

```env
# apps/creative-stage/.env.local
SCOPE_URL=http://localhost:8000       # Local Scope backend
# Or for cloud:
SCOPE_URL=https://scope.daydream.live
GEMINI_API_KEY=...                    # For agent LLM calls
```

---

## 10. What We Don't Build

| Temptation | Why not | What we use instead |
|-----------|---------|-------------------|
| Custom WebRTC stack | Scope already has one | `packages/scope-player/` extracted from Scope |
| Graph editor UI | Scope has one, and the agent hides graphs | Agent builds graphs via `stage_start` |
| Parameter panels | Sliders are for power users, not creators | Chat: "make it dreamier" |
| Audio editor | Not an audio tool | Drop music, agent syncs |
| Custom video player | Browser `<video>` + WebRTC is correct | ScopePlayer component |
| User auth | Use Daydream API key | Same as storyboard |
| Collaboration | Phase 6 stretch, not core | Single-user first |

---

## 11. Success Gate per Phase

| Phase | Gate | Metric |
|-------|------|--------|
| 1 | Live stream from text, with audio | Video + audio playing in <15s |
| 2 | Reference image changes stream | VACE applied in <2s |
| 3 | 4-scene auto-transition | Scenes change on schedule |
| 4 | Beat-synced modulation | Modulation active, verified via API |
| 5 | Final mixed video | Playable .webm with video + music |
| **Merge gate** | All storyboard tests pass | 481+ unit, E2E, build clean |
