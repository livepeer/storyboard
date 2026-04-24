# Refactor & Enhancement Plan

> **Branch:** `feat/refactoring` off `main`
> **Goal:** Transform the agent system from "works most of the time" to "robust, simple, and innovative"
> **Approach:** 6 phases with E2E gates — no phase merges until tests pass

---

## Phase 1: Foundation — Request Isolation & Error Propagation
*Eliminate the #1 source of bugs: concurrent state races and silent failures*

### Task 1.1: Request Context Object
Replace the global `currentUserText` and scattered state with a single `RequestContext` threaded through the entire call chain.

**Files:**
- Create: `packages/creative-kit/src/agent/request-context.ts`
- Modify: `lib/tools/compound-tools.ts` — remove module-level `currentUserText`, accept context param
- Modify: `lib/agents/gemini/index.ts` — create context, pass to tools
- Modify: `lib/agents/livepeer/index.ts` — same
- Modify: `lib/agents/storyboard-providers.ts` — pass context

```typescript
interface RequestContext {
  id: string;              // unique request ID for tracing
  userText: string;        // original user message
  intent: Intent;          // classified intent
  startedAt: number;       // timestamp
  cancelled: boolean;      // cancellation signal
}
```

### Task 1.2: Serial Request Queue
Replace ChatPanel's concurrent `processOne()` with a serial queue.

**Files:**
- Create: `packages/creative-kit/src/agent/request-queue.ts`
- Modify: `components/chat/ChatPanel.tsx` — use queue instead of fire-and-forget
- Modify: `apps/creative-stage/app/page.tsx` — same pattern

```typescript
class RequestQueue {
  private queue: Array<{ text: string; resolve: () => void }> = [];
  private running = false;

  async enqueue(text: string): Promise<void> {
    return new Promise(resolve => {
      this.queue.push({ text, resolve });
      this.drain();
    });
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    while (this.queue.length > 0) {
      const { text, resolve } = this.queue.shift()!;
      await this.processOne(text);
      resolve();
    }
    this.running = false;
  }
}
```

### Task 1.3: Structured Error Types
Replace silent try/catch swallowing with typed errors that propagate to users.

**Files:**
- Create: `packages/creative-kit/src/agent/errors.ts`
- Modify: `lib/agents/preprocessor.ts` — return errors instead of `{handled: false}`
- Modify: `lib/agents/context-builder.ts` — log when dynamic imports fail
- Modify: `lib/tools/compound-tools.ts` — propagate per-step errors
- Modify: `components/chat/ChatPanel.tsx` — show error cards in chat

```typescript
type AgentError =
  | { kind: "safety_filter"; model: string; hint: string }
  | { kind: "model_unavailable"; tried: string[] }
  | { kind: "extraction_failed"; fallback: boolean }
  | { kind: "timeout"; phase: string; elapsed_ms: number }
  | { kind: "auth"; message: string }
```

### E2E Gate: Phase 1
- [ ] Two rapid messages don't race (second waits for first)
- [ ] `currentUserText` global removed, tests pass without it
- [ ] Preprocessor failure shows user-facing error message
- [ ] Context builder logs when memory/episode imports fail
- [ ] All existing E2E tests pass (scope-recipes, creative-stage-source)

---

## Phase 2: Simplify — Split compound-tools.ts
*Break the 500-line monolith into focused, testable modules*

### Task 2.1: Extract Context Merger
Single function that resolves style from 4 sources with clear precedence.

**Files:**
- Create: `packages/creative-kit/src/agent/context-merger.ts`
- Modify: `lib/tools/compound-tools.ts` — replace inline style merging
- Modify: `lib/tools/project-tools.ts` — use same merger

```typescript
// Precedence: episode > active skill > session context > project style guide
function resolveEffectiveStyle(sources: {
  session?: CreativeContext;
  episode?: Partial<CreativeContext>;
  skills?: SkillMeta[];
  project?: StyleGuide;
}): { prefix: string; conflicts: string[] }
```

### Task 2.2: Extract Fallback Handler
Move fallback chain logic out of the execute loop.

**Files:**
- Create: `packages/creative-kit/src/routing/fallback-handler.ts`
- Modify: `lib/tools/compound-tools.ts` — use `executeWithFallback()`

```typescript
async function executeWithFallback(
  capability: string,
  prompt: string,
  params: Record<string, unknown>,
  chain: string[],
  onFallback?: (from: string, to: string) => void,
): Promise<InferenceResult>
```

### Task 2.3: Extract Media Executor
The actual inference call + result parsing + canvas update.

**Files:**
- Create: `packages/creative-kit/src/agent/media-executor.ts`
- Modify: `lib/tools/compound-tools.ts` — thin orchestrator only

### E2E Gate: Phase 2
- [ ] compound-tools.ts under 200 lines
- [ ] Each extracted module has unit tests
- [ ] `/story apply` works (uses project-tools → compound-tools chain)
- [ ] Fallback chains fire correctly (mock one model as unavailable)
- [ ] Style precedence: episode override > skill > session > project

---

## Phase 3: Human-in-the-Loop — Confirmation & Observability
*Make the creative process interactive and transparent*

### Task 3.1: Confirmation Gates
Add confirmation cards for expensive/destructive actions.

**Files:**
- Create: `packages/creative-kit/src/ui/ConfirmationCard.tsx`
- Modify: `lib/tools/compound-tools.ts` — check step count before executing
- Modify: `lib/tools/project-tools.ts` — confirm before regenerating
- Modify: `components/chat/ChatPanel.tsx` — render confirmation cards

Triggers:
- More than 5 scenes: "I'll generate 20 scenes in Ghibli style. Proceed?"
- Expensive model: "Using Kling O3 4K (~$4/scene). OK?"
- Batch regenerate: "This replaces 8 existing images. Continue?"
- Style change: "Switching from noir to watercolor. Affects all future generations."

### Task 3.2: Pipeline Trace View
Show expandable trace of what the agent is doing — like Claude Code's tool calls.

**Files:**
- Create: `packages/creative-kit/src/ui/PipelineTrace.tsx`
- Create: `packages/creative-kit/src/agent/trace.ts`
- Modify: `components/chat/ChatPanel.tsx` — render trace after completion
- Modify: `apps/creative-stage/app/page.tsx` — same

```
▸ Request: "create a 6-scene dragon story" (req_abc123)
  ├─ Intent: new_project (2ms)
  ├─ Style extracted: "fantasy illustration, warm palette" (340ms, 180 tokens)
  ├─ Project created: dragon-story_1 (6 scenes)
  ├─ Model locked: flux-dev (score: 7.8)
  ├─ Scene 1/6: "Dragon sleeping in cave" → flux-dev (3.2s) ✓
  ├─ Scene 2/6: "Dragon waking up" → flux-dev (2.8s) ✓
  └─ Done: 6 cards, 18.4s total, 1,240 tokens
```

### Task 3.3: Request Cancellation
Add stop button that cancels in-flight requests.

**Files:**
- Modify: `packages/creative-kit/src/agent/request-context.ts` — add `cancel()` method
- Modify: `lib/tools/compound-tools.ts` — check `ctx.cancelled` between steps
- Modify: `lib/tools/project-tools.ts` — check between batches
- Modify: `components/chat/ChatPanel.tsx` — stop button during execution

### E2E Gate: Phase 3
- [ ] Confirmation shows for > 5 scenes, user can cancel
- [ ] Pipeline trace visible after generation
- [ ] Cancel button stops mid-generation (partial results kept)
- [ ] All existing tests pass

---

## Phase 4: Architecture — Plugin Abstraction & State Machine
*DRY the plugins, formalize project lifecycle*

### Task 4.1: Unified Plugin Base
Single `StoryboardAgent` class with provider injection.

**Files:**
- Create: `lib/agents/storyboard-agent.ts`
- Modify: `lib/agents/gemini/index.ts` — delegate to StoryboardAgent
- Modify: `lib/agents/livepeer/index.ts` — delegate to StoryboardAgent
- Modify: `lib/agents/claude/index.ts` — delegate to StoryboardAgent
- Delete: duplicated tool registration, constraint building, event processing

```typescript
class StoryboardAgent implements AgentPlugin {
  constructor(
    private id: string,
    private name: string,
    private providerFactory: () => LLMProvider,
  ) {}

  async *sendMessage(text: string, context: CanvasContext): AsyncGenerator<AgentEvent> {
    // Shared: intent → context → tools → run → events
    // Only the LLM provider differs
  }
}

// Registration:
registerPlugin(new StoryboardAgent("gemini", "Gemini Agent", () => new GeminiProvider()));
registerPlugin(new StoryboardAgent("livepeer", "Livepeer Agent", () => new LivepeerProvider()));
```

### Task 4.2: Project State Machine
Explicit states for scene lifecycle.

**Files:**
- Create: `packages/creative-kit/src/agent/scene-state-machine.ts`
- Modify: `lib/projects/store.ts` — use state machine for transitions
- Modify: `lib/tools/project-tools.ts` — validate transitions

```typescript
type SceneState =
  | "planning"
  | "generating_image"
  | "image_done"
  | "generating_video"  // video projects only
  | "video_done"
  | "done"
  | "failed"

const TRANSITIONS: Record<SceneState, SceneState[]> = {
  planning: ["generating_image"],
  generating_image: ["image_done", "failed"],
  image_done: ["generating_video", "done"],
  generating_video: ["video_done", "failed"],
  video_done: ["done"],
  done: ["generating_image"], // regenerate
  failed: ["generating_image", "generating_video"], // retry
};
```

### Task 4.3: Skill Conflict Detection
Detect and resolve conflicting skills before applying.

**Files:**
- Modify: `lib/skills/store.ts` — add conflict detection
- Modify: `lib/tools/compound-tools.ts` — check conflicts before applying
- Create: `packages/creative-kit/src/routing/skill-resolver.ts`

### E2E Gate: Phase 4
- [ ] Gemini and Livepeer agents produce identical results for same prompt
- [ ] Adding a new LLM provider requires < 20 lines
- [ ] Scene state machine prevents stuck scenes
- [ ] Failed video phase can be retried without regenerating keyframe
- [ ] Conflicting skills show warning in chat

---

## Phase 5: Innovation — 5 Key Differentiators
*Features that make the Agent SDK unique in the market*

### 5.1: Adaptive Creative Memory
**What:** The system learns user preferences over time — preferred styles, aspect ratios, model choices, color palettes — and auto-applies them to new projects.

**Files:**
- Create: `packages/creative-kit/src/agent/creative-memory.ts`
- Create: `packages/creative-kit/src/stores/create-preference-store.ts`

```typescript
interface CreativePreference {
  category: "style" | "model" | "color" | "composition" | "mood";
  value: string;
  score: number;      // 0-1, increases with positive feedback
  usageCount: number;
  lastUsed: number;
}

// Auto-inferred from:
// - Which styles the user keeps vs regenerates
// - Which models produce images the user doesn't delete
// - /context edits (explicit preference signals)
// - "I like this" / "make it more like scene 3" (implicit signals)
```

### 5.2: Visual Remix — Reference-Driven Generation
**What:** Drag any existing card onto the canvas and say "make something like this but darker" — the system extracts style from the reference image and applies it to new generations. Uses Kling O3's reference-to-video and GPT Image's edit capabilities.

**Files:**
- Create: `lib/tools/remix-tools.ts`
- Modify: `components/canvas/ContextMenu.tsx` — add "Use as Reference" action
- Modify: `lib/tools/compound-tools.ts` — support `reference_url` in create_media steps

```typescript
// New tool: remix_media
{
  name: "remix_media",
  description: "Generate new media inspired by a reference image/video",
  parameters: {
    reference_url: "URL of the inspiration",
    prompt: "What to change or create",
    similarity: 0.0-1.0, // how close to the reference
  }
}
```

### 5.3: Collaborative Canvas — Multi-User Real-Time Editing
**What:** Share a canvas URL, multiple users see cards appear in real-time. Each user has a cursor color. Built on Vercel's real-time infrastructure or simple WebSocket sync.

**Files:**
- Create: `packages/creative-kit/src/collaboration/sync.ts`
- Create: `packages/creative-kit/src/collaboration/cursor.ts`
- Modify: `packages/creative-kit/src/stores/create-artifact-store.ts` — add sync layer

### 5.4: Auto-Storyboard from Voice
**What:** User speaks a story idea → transcribed → scene extraction → key frames generated. Like dictating to an illustrator. Uses Gemini's audio input or browser SpeechRecognition.

**Files:**
- Create: `lib/voice/transcriber.ts`
- Create: `lib/voice/story-from-voice.ts`
- Modify: `components/chat/ChatPanel.tsx` — microphone button
- Modify: `packages/creative-kit/src/ui/ChatPanel.tsx` — microphone button

### 5.5: Export Pipeline — From Canvas to Deliverable
**What:** One-click export of the entire canvas as:
- **Video**: stitch all scenes into a movie with transitions + music
- **PDF**: storyboard deck with scene descriptions
- **Website**: auto-generated portfolio page
- **Social**: optimized crops for Instagram/TikTok/YouTube

**Files:**
- Create: `lib/export/video-stitcher.ts`
- Create: `lib/export/pdf-generator.ts`
- Create: `lib/export/social-optimizer.ts`
- Create: `components/canvas/ExportPanel.tsx`

### E2E Gate: Phase 5
- [ ] Creative memory influences model selection after 10+ generations
- [ ] Visual remix produces style-consistent results
- [ ] Voice input creates a story card
- [ ] Export to video stitches scenes with transitions

---

## Phase 6: Polish & Performance
*Final cleanup, performance optimization, comprehensive testing*

### Task 6.1: Configuration Externalization
Move all magic numbers to a config object.

**Files:**
- Create: `packages/creative-kit/src/config.ts`

```typescript
const CONFIG = {
  staleThresholdMs: 30 * 60 * 1000,
  batchSize: 5,
  maxBatches: 10,
  maxCanvasCards: 15, // shown in system prompt
  digestMaxWords: 200,
  confirmationThreshold: 5, // scenes before asking
  modelLockEnabled: true,
  selfLearningEnabled: true,
};
```

### Task 6.2: Comprehensive E2E Test Suite
- [ ] `/story` → edit → add scenes → apply → images on canvas
- [ ] `/film` → hifi mode → GPT Image key frames → Seedance videos
- [ ] `/stream` → edit scenes → apply → prompt traveling
- [ ] Concurrent requests handled serially (no race)
- [ ] Preprocessor failure shows user error (not silent)
- [ ] Model locked across multi-scene generation
- [ ] Confirmation gate blocks expensive operations
- [ ] Cancel mid-generation keeps partial results
- [ ] Creative memory influences model selection
- [ ] Style conflict detected and warned
- [ ] Plugin swap (Gemini ↔ Livepeer) produces consistent results

### Task 6.3: Performance Audit
- [ ] Working memory sync is incremental (not full reconstruction)
- [ ] Skill content cache has TTL (expires after 1 hour)
- [ ] Tool registry initialization is instant (no lazy overhead)
- [ ] Model router self-learning doesn't degrade with > 1000 samples

---

## Implementation Schedule

| Phase | Focus | Effort | Dependencies |
|-------|-------|--------|-------------|
| **1** | Request isolation + errors | 3 days | None |
| **2** | Split compound-tools | 2 days | Phase 1 |
| **3** | Human-in-the-loop + traces | 2 days | Phase 1 |
| **4** | Plugin DRY + state machine | 2 days | Phase 2 |
| **5** | Innovation features | 5 days | Phase 1-2 |
| **6** | Polish + testing | 2 days | All |

**Total: ~16 days**

Each phase merges to `feat/refactoring` only after its E2E gate passes. Final merge to `main` after Phase 6 E2E suite is green.
