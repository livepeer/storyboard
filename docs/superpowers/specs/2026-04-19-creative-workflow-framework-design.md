# Creative Workflow Framework — Design Spec

> **Branch:** `feat/creative-workflow-tool`
> **Goal:** Extract a reusable `@livepeer/creative-kit` framework from storyboard, rebuild storyboard on it (zero regression), then build a second app (Creative Lab for kids 8-16) to prove the framework works.
> **Constraint:** `@livepeer/agent` layer is UNTOUCHED. Main branch is never broken.

---

## 1. Architecture

```
Layer 0: @livepeer/agent                    (UNTOUCHED — 3.3K LOC)
  AgentRunner, ToolRegistry, Providers, WorkingMemory, SessionMemory

Layer 1: packages/creative-kit              (NEW — ~1,200 LOC)
  Interfaces: ArtifactStore, ProjectPipeline, GroupManager, ChatBus
  Defaults:   createArtifactStore(), createProjectStore(), createChatStore()
  Routing:    CommandRouter, CapabilityResolver, IntentClassifier
  UI:         InfiniteBoard, ArtifactCard, EdgeLayer, ChatPanel,
              MessageBubble, ToolPill, StyledPrompt

Layer 2a: apps/storyboard                   (REBUILT on creative-kit)
  Storyboard-specific: scope tools, stream-cmd, story/film generators,
  context menu, agent plugins, briefing, session context, skills

Layer 2b: apps/creative-lab                 (NEW — kids educational app)
  MissionEngine, StepGuide, MissionPicker, CreationGallery,
  SafetyWrapper, kid-friendly theme
```

### Monorepo Structure

```
storyboard-a3/
  packages/
    agent/                    # @livepeer/agent (UNTOUCHED)
    agent-pack-canvas/        # (UNTOUCHED)
    agent-pack-projects/      # (UNTOUCHED)
    creative-kit/             # NEW — @livepeer/creative-kit
      src/
        interfaces/           # Core contracts
        stores/               # Default zustand store factories
        routing/              # CommandRouter, CapabilityResolver, IntentClassifier
        ui/                   # React components
        index.ts              # Public API
      package.json
  app/                        # Storyboard Next.js app (REBUILT on kit)
    ...existing structure...
  apps/
    creative-lab/             # NEW — Kids educational app
      app/                    # Next.js app router
      lib/                    # Mission engine, safety wrapper
      components/             # Kid-friendly UI
      package.json
  lib/                        # Storyboard-specific code (refactored)
  components/                 # Storyboard-specific UI (refactored)
```

---

## 2. creative-kit — Core Interfaces

### 2.1 ArtifactStore

Replaces direct `useCanvasStore` coupling in tools. Every tool talks to this interface.

```typescript
// packages/creative-kit/src/interfaces/artifact-store.ts

interface Artifact {
  id: string;
  refId: string;
  type: string;                          // app-defined: "image", "video", "audio", "mission", etc.
  title: string;
  url?: string;
  error?: string;
  metadata?: Record<string, unknown>;    // app-specific data (capability, elapsed, batchId, etc.)
  // Positioning (optional — headless apps skip this)
  x: number; y: number; w: number; h: number;
}

interface ArtifactEdge {
  id: string;
  fromRefId: string;
  toRefId: string;
  metadata?: Record<string, unknown>;    // capability, prompt, action, elapsed
}

interface Viewport {
  x: number; y: number; scale: number;
}

interface ArtifactStore {
  // State
  artifacts: Artifact[];
  edges: ArtifactEdge[];
  viewport: Viewport;
  selectedIds: string[];

  // Artifacts
  add(opts: Partial<Artifact> & { type: string; title: string }): Artifact;
  update(id: string, patch: Partial<Artifact>): void;
  remove(id: string): void;
  getById(id: string): Artifact | undefined;
  getByRefId(refId: string): Artifact | undefined;

  // Edges
  connect(fromRefId: string, toRefId: string, meta?: Record<string, unknown>): void;
  disconnect(fromRefId: string, toRefId: string): void;

  // Selection
  select(ids: string[]): void;
  clearSelection(): void;

  // Viewport
  setViewport(v: Partial<Viewport>): void;
  zoomTo(scale: number, centerX?: number, centerY?: number): void;

  // Layout
  applyLayout(positions: Array<{ id: string; x: number; y: number; w?: number; h?: number }>): void;
}
```

**Factory:** `createArtifactStore(opts?: { maxArtifacts?: number })` returns a zustand store implementing this interface. Apps can extend it with app-specific methods.

### 2.2 ProjectPipeline

Generic batch-processing pipeline with status tracking. Replaces the scene-specific parts of `useProjectStore`.

```typescript
interface PipelineItem {
  index: number;
  title: string;
  prompt: string;
  action: string;
  status: "pending" | "generating" | "done" | "failed" | "regenerating";
  artifactRefId?: string;               // linked to ArtifactStore
  metadata?: Record<string, unknown>;    // app-specific (mediaType, sourceUrl, etc.)
}

interface Project {
  id: string;
  name: string;                          // friendly name
  brief: string;
  items: PipelineItem[];
  status: "planning" | "generating" | "complete";
  createdAt: number;
  metadata?: Record<string, unknown>;    // styleGuide, videoConsistency, tokensUsed, etc.
}

interface ProjectPipeline {
  projects: Project[];
  activeProjectId: string | null;

  create(brief: string, items: Omit<PipelineItem, "status">[], meta?: Record<string, unknown>): Project;
  getActive(): Project | undefined;
  setActive(id: string | null): void;
  getById(id: string): Project | undefined;
  getByName(name: string): Project | undefined;   // partial match

  updateItemStatus(projectId: string, index: number, status: PipelineItem["status"], artifactRefId?: string): void;
  getNextBatch(projectId: string, batchSize?: number): PipelineItem[];
  isComplete(projectId: string): boolean;
}
```

**Factory:** `createProjectPipeline(opts?: { maxProjects?: number, friendlyNames?: boolean })`.

### 2.3 ChatBus

Minimal message protocol.

```typescript
type MessageRole = "user" | "agent" | "system";

interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  timestamp: number;
}

interface ChatBus {
  messages: ChatMessage[];
  isProcessing: boolean;
  addMessage(text: string, role: MessageRole): ChatMessage;
  setProcessing(v: boolean): void;
  clearMessages(): void;
}
```

**Factory:** `createChatStore()`.

### 2.4 GroupManager

Generic grouping (replaces episode store).

```typescript
interface ArtifactGroup {
  id: string;
  name: string;
  artifactIds: string[];
  color: string;
  metadata?: Record<string, unknown>;    // context overrides, etc.
}

interface GroupManager {
  groups: ArtifactGroup[];
  activeGroupId: string | null;

  createGroup(name: string, artifactIds: string[]): ArtifactGroup;
  addToGroup(groupId: string, artifactIds: string[]): void;
  removeFromGroup(groupId: string, artifactIds: string[]): void;
  getGroupForArtifact(artifactId: string): ArtifactGroup | undefined;
  activate(id: string | null): void;
}
```

**Factory:** `createGroupManager()`.

---

## 3. creative-kit — Routing

### 3.1 CommandRouter

Replaces the 40-branch switch statement in `commands.ts`.

```typescript
interface CommandHandler {
  name: string;
  aliases?: string[];                    // e.g., ["ls"] for "list"
  description: string;
  subcommands?: CommandHandler[];        // nested: /project list, /project show
  execute(args: string): Promise<string>;
}

interface CommandRouter {
  register(handler: CommandHandler): void;
  execute(input: string): Promise<string | null>;  // null = not a command
  generateHelp(): string;                           // auto-generated from registered handlers
}

function createCommandRouter(): CommandRouter;
```

Apps call `router.register({ name: "story", description: "...", execute: handleStoryCommand })`. The router handles parsing, subcommand routing, and auto-generates `/help`.

### 3.2 CapabilityResolver

Extracts `selectCapability()`, `FALLBACK_CHAINS`, `buildAttemptChain()`, `extractFalError()`, `isRecoverableFailure()` from `compound-tools.ts`.

```typescript
interface CapabilityResult {
  capability: string;
  type: string;                          // "image" | "video" | "audio" | etc.
}

interface CapabilityResolverConfig {
  fallbackChains: Record<string, string[]>;
  actionDefaults: Record<string, string>;  // action → default capability
  userMentionPatterns: Record<string, CapabilityResult>;  // "seedance" → {capability, type}
}

interface CapabilityResolver {
  resolve(action: string, opts?: {
    styleHint?: string;
    modelOverride?: string;
    hasSourceUrl?: boolean;
    userText?: string;
  }): CapabilityResult;

  buildAttemptChain(initial: string, liveCapabilities: Set<string>): string[];
  isRecoverable(errorMsg: string): boolean;
  extractError(data: Record<string, unknown>): string | undefined;
}

function createCapabilityResolver(config: CapabilityResolverConfig): CapabilityResolver;
```

Storyboard passes its 40-capability config. Creative-lab passes a subset (safe models only).

### 3.3 IntentClassifier

Extracts `classifyIntent()` from `lib/agents/intent.ts`.

```typescript
interface IntentRule {
  type: string;
  test: (text: string, context: { hasActiveProject: boolean; pendingItems: number }) => boolean;
  priority?: number;
}

interface IntentClassifier {
  register(rule: IntentRule): void;
  classify(text: string, context: { hasActiveProject: boolean; pendingItems: number }): { type: string };
}

function createIntentClassifier(rules?: IntentRule[]): IntentClassifier;
```

Storyboard registers its existing rules (new_project, continue, scene iteration, etc.). Creative-lab registers mission-specific intents (start_mission, next_step, show_gallery).

---

## 4. creative-kit — UI Components

All components accept data via props or generic store interfaces. No storyboard-specific imports.

### 4.1 InfiniteBoard

Pan/zoom/grid container. Replaces the viewport logic in `InfiniteCanvas.tsx`.

```tsx
<InfiniteBoard
  viewport={viewport}
  onViewportChange={setViewport}
  gridSize={40}
  gridColor="rgba(255,255,255,0.03)"
  className="..."
>
  {/* App renders its own artifact cards here */}
  {artifacts.map(a => <MyCard key={a.id} artifact={a} />)}
</InfiniteBoard>
```

### 4.2 ArtifactCard

Drag/resize wrapper. App provides the inner content.

```tsx
<ArtifactCard
  artifact={artifact}
  onMove={(id, x, y) => store.update(id, { x, y })}
  onResize={(id, w, h) => store.update(id, { w, h })}
  selected={isSelected}
  onSelect={() => store.select([artifact.id])}
>
  {/* App's custom render */}
  <img src={artifact.url} />
  <div>{artifact.title}</div>
</ArtifactCard>
```

### 4.3 ChatPanel

Message list + input. App registers custom renderers for special message types.

```tsx
<ChatPanel
  messages={messages}
  onSend={handleSend}
  isProcessing={isProcessing}
  cardRenderers={{
    "@@story@@": (text) => <StoryCard story={parseStory(text)} />,
    "@@mission@@": (text) => <MissionCard mission={parseMission(text)} />,
  }}
/>
```

### 4.4 Other UI

- `<MessageBubble>` — role-based styling, error highlighting, copy-on-click
- `<ToolPill>` — tool call progress (name + spinner/checkmark)
- `<StyledPrompt>` — promise-based modal input dialog
- `<EdgeLayer>` — SVG arrows between artifacts (renders inside InfiniteBoard)

---

## 5. Storyboard Rebuild

### What Changes

| File | Change | Risk |
|------|--------|------|
| `lib/canvas/store.ts` | Implement `ArtifactStore` interface from creative-kit | Low — same zustand store, typed to interface |
| `lib/canvas/types.ts` | `Card` extends `Artifact`, `ArrowEdge` extends `ArtifactEdge` | Low — additive |
| `lib/projects/store.ts` | Implement `ProjectPipeline` interface | Low — same store, typed |
| `lib/episodes/store.ts` | Implement `GroupManager` interface | Low — same store, typed |
| `lib/chat/store.ts` | Implement `ChatBus` interface | Low — trivial |
| `lib/tools/compound-tools.ts` | Import `CapabilityResolver` from creative-kit instead of inline code | Medium — logic extraction |
| `lib/tools/canvas-tools.ts` | Accept `ArtifactStore` parameter instead of direct import | Medium |
| `lib/skills/commands.ts` | Migrate to `CommandRouter.register()` | Medium — structural change |
| `components/canvas/InfiniteCanvas.tsx` | Wrap `<InfiniteBoard>` from creative-kit | Low — composition |
| `components/canvas/Card.tsx` | Wrap `<ArtifactCard>` from creative-kit | Medium — move drag/resize logic to kit |
| `components/chat/ChatPanel.tsx` | Wrap `<ChatPanel>` from creative-kit, register card renderers | Medium |
| `components/chat/MessageBubble.tsx` | Use `<MessageBubble>` from creative-kit | Low |

### What Does NOT Change

- Agent plugins (`lib/agents/gemini/`, `claude/`, `openai/`) — same tool registry, same interface
- Scope tools (`lib/tools/scope-tools.ts`) — storyboard-specific, uses ArtifactStore interface
- Stream commands (`lib/stream-cmd/`) — storyboard-specific
- Story/film generators (`lib/story/`, `lib/film/`) — storyboard-specific
- Session context, active request, working memory — storyboard-specific
- Context menu actions (seedance, tryon, analyze, talking video) — storyboard-specific
- All API routes (`app/api/`) — unchanged
- Skills (`skills/*.md`) — unchanged

### Regression Testing

**CRITICAL GATE:** All existing E2E tests must pass on the rebuilt storyboard BEFORE any creative-lab work begins.

Existing tests:
- `tests/e2e/storyboard.spec.ts` — core app tests
- `tests/e2e/scope-phase*.spec.ts` — 58 scope integration tests
- `tests/e2e/stream-command.spec.ts` — stream command tests

New tests added during rebuild:
- `tests/e2e/creative-kit-integration.spec.ts` — verify ArtifactStore, CommandRouter, CapabilityResolver work through the full storyboard flow
- Covers: image generation, project creation, /organize, /story, /film, context menu actions

**Pass criteria:** 329+ unit tests pass, all E2E tests pass, manual smoke test of: generate image → restyle → animate → /story → /film → /stream → /project list.

---

## 6. Creative Lab — Educational App for Kids 8-16

### 6.1 Concept

A guided, playful creative workspace where kids learn AI art through missions. Not a stripped-down storyboard — a purpose-built app with its own personality, vocabulary, and UX patterns.

### 6.2 Core UX Principles

1. **Mission-driven** — not a blank canvas. Kids pick missions and get guided step by step
2. **Immediate delight** — every action produces a visible result fast
3. **Safe by default** — content filters on, curated model set, friendly error messages
4. **Progressive complexity** — start with "Generate a Cat" → advance to "Direct a Short Film"
5. **Celebrate creation** — confetti animations, star ratings, portfolio gallery
6. **No jargon** — "Make a Picture" not "Generate Image", "Make it Move" not "Animate"

### 6.3 Mission System

```typescript
interface Mission {
  id: string;
  title: string;                         // "Design Your Dream Pet"
  description: string;                   // "Create an amazing pet and bring it to life!"
  difficulty: "starter" | "explorer" | "creator" | "master";
  category: "image" | "video" | "story" | "music" | "mixed";
  steps: MissionStep[];
  unlockAfter?: string[];                // mission IDs required first
  stars: number;                         // max earnable (1-3)
}

interface MissionStep {
  id: string;
  instruction: string;                   // "Describe your dream pet — what does it look like?"
  hint?: string;                         // "Try: a fluffy dragon with rainbow wings"
  type: "text_input" | "generate" | "transform" | "review" | "celebrate";
  capability?: string;                   // which AI model to use
  action?: string;                       // "generate" | "animate" | "tts" | etc.
  autoPromptPrefix?: string;             // prepended to kid's input for quality
}
```

### 6.4 Mission Catalog

**Starter (age 8-10, no prerequisites):**
- "My Amazing Pet" — describe → generate image → make it talk
- "Superhero Portrait" — describe hero → generate → add powers (restyle)
- "Funny Animal" — pick animal + situation → generate → laugh

**Explorer (age 10-13, complete 3 starters):**
- "Comic Strip" — 4-panel story: describe → generate 4 scenes → arrange
- "Music Video" — describe scene → generate image → animate → add music
- "Fashion Designer" — design outfit → virtual try-on → runway video

**Creator (age 13-16, complete 3 explorers):**
- "Short Film Director" — 4-shot film with camera directions (wraps /film)
- "Album Cover" — generate art + add text + restyle variations
- "AI Art Gallery" — 6-piece exhibition with style consistency (wraps /story)

**Master (age 14-16, complete 3 creators):**
- "Live Stream DJ" — real-time visual generation (wraps /stream)
- "Voice Actor" — clone voice + animate characters (wraps /talk)
- "Creative Director" — free-form project with all tools unlocked

### 6.5 UI Components (creative-lab specific)

| Component | Purpose |
|---|---|
| `<MissionPicker>` | Grid of illustrated mission cards, difficulty badges, lock icons |
| `<StepGuide>` | Left sidebar: current step instruction, hint button, progress dots |
| `<CreationCanvas>` | Wraps `<InfiniteBoard>` with kid-friendly theme (pastel, rounded, large) |
| `<CreationCard>` | Wraps `<ArtifactCard>` with emoji labels, star badge, "wow!" animation |
| `<SafetyWrapper>` | Wraps all AI calls: content filter, friendly errors ("Oops! Let's try something different") |
| `<CelebrationOverlay>` | Confetti, star animation, "Amazing work!" message on step completion |
| `<PortfolioGallery>` | Grid of completed creations across all missions |
| `<ProgressDashboard>` | Stars earned, missions completed, current streak |

### 6.6 Safety & Content Filtering

- **Model allowlist:** Only safe models (flux-dev, seedream-5-lite, chatterbox-tts, ltx-i2v). No face-swap, no void-inpaint.
- **Prompt prefix:** All generation prepends "child-friendly, colorful, cartoon style, " to ensure safe outputs
- **Error wrapping:** Never show raw API errors. Map to friendly messages:
  - "Content policy" → "Hmm, let's try describing it differently!"
  - "No orchestrator" → "The AI is busy right now. Try again in a moment!"
  - "Network error" → "Check your internet connection and try again"
- **No free-form agent chat** in starter/explorer missions. Only guided step inputs.
- **Creator/master** missions unlock a simplified chat with curated tool set.

### 6.7 Tech Stack

- Next.js app in `apps/creative-lab/`
- Shares `packages/creative-kit` with storyboard
- Shares `packages/agent` (for creator/master missions that use the agent)
- Shares storyboard's API routes (`/api/agent/gemini`, `/api/upload`) via proxy env var `STORYBOARD_API_URL`
- Own theme (CSS variables), own layout, own page routes
- LocalStorage for mission progress, stars, portfolio
- Runs on a different port (e.g., 3001) during development

---

## 7. Implementation Order

### Phase 1: creative-kit extraction (~800 LOC new)
1. Create `packages/creative-kit/` with interfaces
2. Implement store factories (ArtifactStore, ProjectPipeline, ChatBus, GroupManager)
3. Extract CapabilityResolver from compound-tools.ts
4. Extract CommandRouter from commands.ts
5. Extract IntentClassifier from intent.ts
6. Move UI components (InfiniteBoard, ArtifactCard, ChatPanel, MessageBubble, ToolPill, StyledPrompt, EdgeLayer)

### Phase 2: storyboard rebuild (~400 LOC changed)
7. Canvas store implements ArtifactStore interface
8. Project store implements ProjectPipeline interface
9. Episode store implements GroupManager interface
10. Refactor compound-tools to use CapabilityResolver from kit
11. Migrate commands.ts to CommandRouter
12. Wrap canvas/chat components with creative-kit UI

### Phase 3: regression gate
13. Run all existing E2E tests — must pass
14. Run all unit tests (329+) — must pass
15. Add creative-kit integration E2E test
16. Manual smoke test of all features

### Phase 4: creative-lab app (~1,500 LOC new)
17. Scaffold Next.js app in apps/creative-lab/
18. Build MissionEngine + mission catalog (starter missions)
19. Build kid-friendly UI components (MissionPicker, StepGuide, CreationCanvas)
20. Build SafetyWrapper + content filtering
21. Wire up creative-kit stores + tools
22. Build CelebrationOverlay + PortfolioGallery
23. Add explorer + creator missions
24. E2E tests for creative-lab

---

## 8. File Inventory

### New Files (packages/creative-kit/)

```
packages/creative-kit/
  package.json
  tsconfig.json
  src/
    index.ts                              # Public API exports
    interfaces/
      artifact-store.ts                   # ArtifactStore interface
      project-pipeline.ts                 # ProjectPipeline interface
      chat-bus.ts                         # ChatBus interface
      group-manager.ts                    # GroupManager interface
    stores/
      create-artifact-store.ts            # Zustand factory
      create-project-store.ts             # Zustand factory
      create-chat-store.ts                # Zustand factory
      create-group-manager.ts             # Zustand factory
    routing/
      command-router.ts                   # Slash command registry + parser
      capability-resolver.ts             # Model selection + fallback chains
      intent-classifier.ts               # Regex-based intent detection
      fal-errors.ts                       # extractFalError, isRecoverableFailure
    ui/
      InfiniteBoard.tsx                   # Pan/zoom/grid container
      ArtifactCard.tsx                    # Drag/resize wrapper
      EdgeLayer.tsx                       # SVG arrow connections
      ChatPanel.tsx                       # Message list + input + custom renderers
      MessageBubble.tsx                   # Role-based message styling
      ToolPill.tsx                        # Tool call progress indicator
      StyledPrompt.tsx                    # Promise-based modal input
```

### New Files (apps/creative-lab/)

```
apps/creative-lab/
  package.json
  tsconfig.json
  next.config.ts
  app/
    layout.tsx                            # Kid-friendly theme wrapper
    page.tsx                              # Mission picker home
    mission/[id]/page.tsx                 # Active mission view
    gallery/page.tsx                      # Portfolio gallery
    globals.css                           # Pastel theme, large fonts, animations
  lib/
    missions/
      engine.ts                           # MissionEngine: progression, stars, unlocks
      catalog.ts                          # Mission definitions
      safety.ts                           # SafetyWrapper, prompt prefix, error mapping
    stores/
      progress-store.ts                   # Stars, completed missions, streak
  components/
    MissionPicker.tsx                     # Illustrated mission grid
    MissionCard.tsx                       # Single mission card (lock/unlock/stars)
    StepGuide.tsx                         # Step-by-step instruction panel
    CreationCanvas.tsx                    # Wraps InfiniteBoard with kid theme
    CreationCard.tsx                      # Wraps ArtifactCard with emoji/stars
    CelebrationOverlay.tsx               # Confetti + star animation
    PortfolioGallery.tsx                  # Grid of completed creations
    ProgressDashboard.tsx                 # Stars/missions/streak summary
    SafeErrorMessage.tsx                  # Friendly error display
  tests/
    e2e/
      creative-lab.spec.ts               # E2E tests for mission flow
```

### Modified Files (storyboard rebuild)

```
lib/canvas/store.ts                       # implements ArtifactStore
lib/canvas/types.ts                       # Card extends Artifact
lib/projects/store.ts                     # implements ProjectPipeline
lib/episodes/store.ts                     # implements GroupManager
lib/chat/store.ts                         # implements ChatBus
lib/tools/compound-tools.ts               # uses CapabilityResolver from kit
lib/tools/canvas-tools.ts                 # uses ArtifactStore interface
lib/skills/commands.ts                    # uses CommandRouter from kit
lib/agents/intent.ts                      # uses IntentClassifier from kit
components/canvas/InfiniteCanvas.tsx       # wraps InfiniteBoard
components/canvas/Card.tsx                # wraps ArtifactCard
components/canvas/ArrowEdge.tsx           # wraps EdgeLayer
components/chat/ChatPanel.tsx             # wraps ChatPanel from kit
components/chat/MessageBubble.tsx         # wraps MessageBubble from kit
```

---

## 9. Success Criteria

1. **creative-kit is a standalone package** — can be imported by any Next.js/React app, no storyboard dependencies
2. **Storyboard passes all existing tests** — 329+ unit tests, all E2E tests, same behavior as main branch
3. **Creative Lab works end-to-end** — kid can: pick mission → follow steps → generate image → animate → celebrate → see in gallery
4. **Shared code is meaningful** — creative-lab reuses >60% of creative-kit (not just trivial wrappers)
5. **No @livepeer/agent changes** — zero diff in packages/agent/

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Storyboard regression during rebuild | Feature branch only. E2E gate before creative-lab. Incremental commits. |
| Over-abstraction — interfaces too generic to be useful | Start with storyboard's exact needs, generalize only where creative-lab diverges |
| creative-kit becomes a thin wrapper adding complexity without value | Measure: if a tool file shrinks by <20% after migration, the abstraction isn't earning its keep |
| Creative Lab scope creep | Start with 3 starter missions only. Explorer/creator/master are stretch goals. |
| Content safety for kids | Allowlist-only models, prompt prefixing, error wrapping. No free-form agent in starter/explorer. |
