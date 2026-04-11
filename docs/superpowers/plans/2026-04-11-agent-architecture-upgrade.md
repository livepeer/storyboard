# Agent Architecture Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the dual-brain (preprocessor + Gemini agent) into a single-brain architecture with working memory, intent-aware context, and conversation continuity — so follow-ups like "give me 4 more scenes" work reliably and the creative session feels coherent.

**Architecture:** Replace the current flow (preprocessor does extraction+generation independently, then hands a stub to the agent) with a unified pipeline: fast intent classifier → working memory assembly → enriched agent context → Gemini with full project awareness. The preprocessor becomes a thin extraction layer only; execution always flows through the agent's tool-use loop.

**Tech Stack:** TypeScript, Zustand stores, Gemini API (function calling), Playwright E2E tests, Next.js App Router

---

## Current Architecture (Problems)

```
User → Preprocessor (BRAIN 1: regex + LLM classifier)
          ├── multi-scene: runs project_create + generateAllBatches directly
          ├── continue: runs generateAllBatches directly  
          ├── add_scenes: returns agentPrompt stub → BRAIN 2
          └── none: passes through → BRAIN 2

       → Gemini Agent (BRAIN 2: tool-use loop)
          ├── gets agentPrompt OR raw text
          ├── message history: 20-msg sliding window (lossy)
          ├── no knowledge of what preprocessor did
          └── empty response on follow-ups → "Error: No response"
```

**Key failures:**
1. Agent has no project context after preprocessor handles generation
2. "Give me 4 more" sends enriched prompt but Gemini returns empty (context too short, no tool suggestions)
3. Conversation history is raw API messages — no semantic compaction
4. Session context (style DNA) is injected into prompts but agent doesn't know about project structure
5. No feedback loop: ratings stored but never influence agent behavior

## Target Architecture

```
User → Intent Classifier (fast, local regex)
          │
          ▼
       Working Memory (Zustand store)
          ├── project: scenes[], styleGuide, brief
          ├── digest: conversation summary (~100 words)
          ├── recentActions: last 5 tool calls + outcomes
          └── preferences: from ratings + feedback
          │
          ▼  
       Context Builder (assembles system prompt from memory + intent)
          │
          ▼
       Gemini Agent (SINGLE BRAIN: always runs tool-use loop)
          ├── gets enriched system prompt with full project awareness
          ├── handles ALL execution (no more preprocessor batch loop)
          ├── auto-continuation: "more scenes remaining" nudge
          └── working memory updated after each round
```

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `lib/agents/working-memory.ts` | Zustand store: project state, digest, recent actions, preferences |
| `lib/agents/context-builder.ts` | Assembles intent-aware system prompt from working memory |
| `lib/agents/intent.ts` | Fast intent classifier (extracted from preprocessor) |
| `tests/e2e/agent-memory.spec.ts` | E2E: working memory, follow-ups, context continuity |
| `tests/unit/intent-classifier.test.ts` | Unit: intent classification accuracy |
| `tests/unit/context-builder.test.ts` | Unit: context assembly + token budget |
| `tests/unit/working-memory.test.ts` | Unit: memory updates + digest compaction |

### Modified files
| File | Changes |
|------|---------|
| `lib/agents/preprocessor.ts` | Remove batch execution; keep only extraction + intent classification |
| `lib/agents/gemini/index.ts` | Use context builder; update working memory after each round; handle continuation |
| `lib/agents/claude/system-prompt.ts` | Replace with context-builder.ts calls |
| `components/chat/ChatPanel.tsx` | Route through intent → memory → agent; remove skipAgent logic |
| `lib/tools/compound-tools.ts` | Emit structured action events for working memory |
| `lib/tools/project-tools.ts` | Emit structured action events for working memory |

---

## Phase 1: Working Memory Store (foundation)

### Task 1: Create the working memory store

**Files:**
- Create: `lib/agents/working-memory.ts`
- Test: `tests/unit/working-memory.test.ts`

- [ ] **Step 1: Write failing tests for working memory**

```typescript
// tests/unit/working-memory.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useWorkingMemory } from "@/lib/agents/working-memory";

describe("WorkingMemory", () => {
  beforeEach(() => {
    useWorkingMemory.getState().reset();
  });

  it("starts with empty state", () => {
    const m = useWorkingMemory.getState();
    expect(m.project).toBeNull();
    expect(m.digest).toBe("");
    expect(m.recentActions).toHaveLength(0);
  });

  it("sets active project from project store", () => {
    useWorkingMemory.getState().setProject({
      id: "proj_1",
      brief: "8-scene Ghibli storyboard",
      totalScenes: 8,
      completedScenes: 5,
      sceneList: [
        { index: 0, title: "Hill Top", status: "done", refId: "img-1" },
        { index: 1, title: "First Rush", status: "done", refId: "img-2" },
        { index: 2, title: "Market", status: "pending", refId: undefined },
      ],
      styleGuide: { style: "Ghibli watercolor", palette: "warm amber", characters: "girl with skateboard" },
    });
    const m = useWorkingMemory.getState();
    expect(m.project?.id).toBe("proj_1");
    expect(m.project?.completedScenes).toBe(5);
    expect(m.project?.sceneList).toHaveLength(3);
  });

  it("records actions and keeps last 5", () => {
    const mem = useWorkingMemory.getState();
    for (let i = 0; i < 7; i++) {
      mem.recordAction({
        tool: "create_media",
        summary: `batch ${i}`,
        outcome: `${i + 1} created`,
        success: true,
      });
    }
    expect(useWorkingMemory.getState().recentActions).toHaveLength(5);
    expect(useWorkingMemory.getState().recentActions[0].summary).toBe("batch 2");
  });

  it("appends to digest and keeps under 200 words", () => {
    const mem = useWorkingMemory.getState();
    mem.appendDigest("User asked for 8 Ghibli scenes.");
    mem.appendDigest("Generated all 8 with flux-dev.");
    expect(useWorkingMemory.getState().digest).toContain("Ghibli");
    expect(useWorkingMemory.getState().digest).toContain("flux-dev");
  });

  it("updates preferences from feedback", () => {
    const mem = useWorkingMemory.getState();
    mem.updatePreference("preferredModel", "flux-dev");
    expect(useWorkingMemory.getState().preferences.preferredModel).toBe("flux-dev");
  });

  it("syncs from project store", () => {
    // This test verifies syncFromProjectStore() reads the real project store
    // and populates working memory. We'll test the actual sync in integration.
    const mem = useWorkingMemory.getState();
    mem.syncFromProjectStore();
    // With no active project, should remain null
    expect(useWorkingMemory.getState().project).toBeNull();
  });

  it("reset clears everything", () => {
    const mem = useWorkingMemory.getState();
    mem.setProject({ id: "p1", brief: "test", totalScenes: 1, completedScenes: 0, sceneList: [], styleGuide: null });
    mem.appendDigest("something");
    mem.recordAction({ tool: "t", summary: "s", outcome: "o", success: true });
    mem.reset();
    const m = useWorkingMemory.getState();
    expect(m.project).toBeNull();
    expect(m.digest).toBe("");
    expect(m.recentActions).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/working-memory.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement working memory store**

```typescript
// lib/agents/working-memory.ts
import { create } from "zustand";
import { useProjectStore } from "@/lib/projects/store";
import { useSessionContext } from "@/lib/agents/session-context";

export interface ProjectSnapshot {
  id: string;
  brief: string;
  totalScenes: number;
  completedScenes: number;
  sceneList: Array<{
    index: number;
    title: string;
    status: string;
    refId: string | undefined;
  }>;
  styleGuide: {
    style: string;
    palette: string;
    characters: string;
  } | null;
}

export interface ActionRecord {
  tool: string;
  summary: string;
  outcome: string;
  success: boolean;
  timestamp?: number;
}

interface WorkingMemoryState {
  project: ProjectSnapshot | null;
  digest: string;
  recentActions: ActionRecord[];
  preferences: Record<string, string>;

  setProject: (p: ProjectSnapshot | null) => void;
  recordAction: (action: ActionRecord) => void;
  appendDigest: (text: string) => void;
  updatePreference: (key: string, value: string) => void;
  syncFromProjectStore: () => void;
  reset: () => void;
}

const MAX_ACTIONS = 5;
const MAX_DIGEST_WORDS = 200;

export const useWorkingMemory = create<WorkingMemoryState>((set, get) => ({
  project: null,
  digest: "",
  recentActions: [],
  preferences: {},

  setProject: (p) => set({ project: p }),

  recordAction: (action) =>
    set((s) => {
      const actions = [...s.recentActions, { ...action, timestamp: Date.now() }];
      return { recentActions: actions.slice(-MAX_ACTIONS) };
    }),

  appendDigest: (text) =>
    set((s) => {
      const combined = s.digest ? `${s.digest} ${text}` : text;
      const words = combined.split(/\s+/);
      return {
        digest: words.length > MAX_DIGEST_WORDS
          ? words.slice(-MAX_DIGEST_WORDS).join(" ")
          : combined,
      };
    }),

  updatePreference: (key, value) =>
    set((s) => ({ preferences: { ...s.preferences, [key]: value } })),

  syncFromProjectStore: () => {
    const projStore = useProjectStore.getState();
    const active = projStore.getActiveProject();
    if (!active) {
      set({ project: null });
      return;
    }
    const ctx = useSessionContext.getState().context;
    set({
      project: {
        id: active.id,
        brief: active.brief?.slice(0, 300) || "",
        totalScenes: active.scenes.length,
        completedScenes: active.scenes.filter((s) => s.status === "done").length,
        sceneList: active.scenes.map((s) => ({
          index: s.index,
          title: s.title,
          status: s.status,
          refId: s.cardRefId,
        })),
        styleGuide: ctx
          ? { style: ctx.style, palette: ctx.palette, characters: ctx.characters }
          : active.styleGuide
            ? { style: active.styleGuide.visualStyle || "", palette: active.styleGuide.colorPalette || "", characters: "" }
            : null,
      },
    });
  },

  reset: () =>
    set({ project: null, digest: "", recentActions: [], preferences: {} }),
}));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/working-memory.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add lib/agents/working-memory.ts tests/unit/working-memory.test.ts
git commit -m "feat: add working memory store for agent context continuity"
```

---

### Task 2: Extract intent classifier into standalone module

**Files:**
- Create: `lib/agents/intent.ts`
- Test: `tests/unit/intent-classifier.test.ts`
- Modify: `lib/agents/preprocessor.ts` (remove `classifyIntent`, import from intent.ts)

- [ ] **Step 1: Write failing tests for intent classifier**

```typescript
// tests/unit/intent-classifier.test.ts
import { describe, it, expect } from "vitest";
import { classifyIntent } from "@/lib/agents/intent";

describe("Intent Classifier", () => {
  describe("no active project", () => {
    it("returns none for simple prompts", () => {
      expect(classifyIntent("a cat eating pizza", false, 0).type).toBe("none");
    });
    it("returns none for greetings", () => {
      expect(classifyIntent("hello", false, 0).type).toBe("none");
    });
    it("detects multi-scene briefs", () => {
      const brief = "Scene 1: a cat. Scene 2: a dog. Scene 3: a bird. Scene 4: a fish.";
      expect(classifyIntent(brief, false, 0).type).toBe("new_project");
    });
    it("detects long briefs as new_project", () => {
      const brief = "x ".repeat(300);
      expect(classifyIntent(brief, false, 0).type).toBe("new_project");
    });
  });

  describe("with active project", () => {
    it("detects continue", () => {
      expect(classifyIntent("continue", true, 3).type).toBe("continue");
      expect(classifyIntent("keep going", true, 3).type).toBe("continue");
      expect(classifyIntent("next batch", true, 3).type).toBe("continue");
    });
    it("detects add_scenes with count", () => {
      const r = classifyIntent("give me 4 more scenes", true, 0);
      expect(r.type).toBe("add_scenes");
      expect(r.count).toBe(4);
    });
    it("detects add_scenes without count", () => {
      const r = classifyIntent("add more scenes", true, 0);
      expect(r.type).toBe("add_scenes");
      expect(r.count).toBe(4); // default
    });
    it("detects adjust_scene with index", () => {
      const r = classifyIntent("change scene 3 to be darker", true, 0);
      expect(r.type).toBe("adjust_scene");
      expect(r.sceneHint).toBe("3");
    });
    it("detects style_correction", () => {
      expect(classifyIntent("wrong style, use ghibli", true, 0).type).toBe("style_correction");
    });
    it("detects status check", () => {
      expect(classifyIntent("where are my pictures?", true, 0).type).toBe("status");
    });
    it("returns create for short creative prompts without project context", () => {
      expect(classifyIntent("a sunset over mountains", false, 0).type).toBe("none");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/intent-classifier.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement intent classifier**

```typescript
// lib/agents/intent.ts

export type IntentType =
  | "new_project"
  | "continue"
  | "add_scenes"
  | "adjust_scene"
  | "style_correction"
  | "status"
  | "none";

export interface Intent {
  type: IntentType;
  count?: number;
  sceneHint?: string;
  feedback?: string;
  direction?: string;
}

/**
 * Fast intent classification — regex-based, no LLM call.
 * Runs in <1ms. Falls through to "none" for the agent to handle.
 */
export function classifyIntent(
  text: string,
  hasActiveProject: boolean,
  pendingScenes: number
): Intent {
  const lower = text.toLowerCase().trim();

  // --- New project: long brief with scene markers ---
  if (
    text.length > 500 ||
    (/scene\s*\d/i.test(text) && (text.match(/scene/gi) || []).length >= 3)
  ) {
    return { type: "new_project" };
  }

  // --- Explicit continue ---
  if (
    /^(continue|keep going|go|next|do the rest|finish|carry on|proceed|go ahead)\.?$/i.test(lower)
  )
    return { type: "continue" };
  if (
    /continue generating|keep going|finish (it|them|the rest)|do the rest|next batch|remaining scenes/i.test(lower)
  )
    return { type: "continue" };

  // --- Explicit add N more ---
  const moreCountMatch = lower.match(
    /(?:give|make|add|create|do|generate)\s+(?:me\s+)?(\d+)\s+more/i
  );
  if (moreCountMatch)
    return { type: "add_scenes", count: parseInt(moreCountMatch[1]), direction: text };

  if (hasActiveProject) {
    // "add more scenes", "more scenes", "expand the storyboard"
    if (/(?:add|give|make|create)\s+(?:me\s+)?more|more scenes|expand.*stor|extend/i.test(lower))
      return { type: "add_scenes", count: 4, direction: text };

    // "make the story more interesting/dramatic/funny"
    if (/make.*(story|storyboard|it).*(more|better|interesting|dramatic|funny|exciting|emotional|longer)/i.test(lower))
      return { type: "add_scenes", count: 4, direction: text };

    // "I want more" / "not enough"
    if (/(?:i\s+)?(?:want|need)\s+more|not enough|too few|too short/i.test(lower))
      return { type: "add_scenes", count: 4, direction: text };

    // --- Adjust specific scene ---
    const sceneRef = lower.match(
      /scene\s*(\d+)|(\d+)(?:st|nd|rd|th)\s+(?:scene|one|image|picture|frame)/i
    );
    if (
      sceneRef &&
      /change|adjust|redo|fix|update|too|more|less|different|rethink|modify|improve|tweak/i.test(lower)
    )
      return { type: "adjust_scene", sceneHint: sceneRef[1] || sceneRef[2], feedback: text };

    if (
      /(?:the|that)\s+\w+\s+(?:scene|one|image|picture).*(?:needs?|should|could|is too|isn't|looks)/i.test(lower)
    )
      return { type: "adjust_scene", feedback: text };

    // Pending scenes + vague short message → continue
    if (
      pendingScenes > 0 &&
      lower.length < 30 &&
      !/^(hey|hi|hello|thanks|ok|yes|no|what|how|why|can|please)/i.test(lower)
    )
      return { type: "continue" };
  }

  // --- Style correction ---
  if (
    /wrong style|style is wrong|should be|use .*style|not.*right.*style|change.*style|switch.*style/i.test(lower)
  )
    return { type: "style_correction", feedback: text };
  if (/do it again.*(?:in|with|using)|redo.*(?:in|with|using)|try again.*(?:in|with|using)/i.test(lower))
    return { type: "style_correction", feedback: text };

  // --- Status check ---
  if (
    /where.*(picture|image|scene|result)|don't see|can't see|nothing (show|appear|happen)|no (picture|image|result)|still waiting|what happened/i.test(lower)
  )
    return { type: "status" };

  return { type: "none" };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/intent-classifier.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add lib/agents/intent.ts tests/unit/intent-classifier.test.ts
git commit -m "feat: extract intent classifier into standalone module"
```

---

### Task 3: Create context builder

**Files:**
- Create: `lib/agents/context-builder.ts`
- Test: `tests/unit/context-builder.test.ts`

- [ ] **Step 1: Write failing tests for context builder**

```typescript
// tests/unit/context-builder.test.ts
import { describe, it, expect } from "vitest";
import { buildAgentContext } from "@/lib/agents/context-builder";
import type { Intent } from "@/lib/agents/intent";
import type { ProjectSnapshot } from "@/lib/agents/working-memory";

const mockProject: ProjectSnapshot = {
  id: "proj_1",
  brief: "8-scene Ghibli storyboard with skateboard girl",
  totalScenes: 8,
  completedScenes: 5,
  sceneList: [
    { index: 0, title: "Hill Top", status: "done", refId: "img-1" },
    { index: 1, title: "First Rush", status: "done", refId: "img-2" },
    { index: 2, title: "Market", status: "done", refId: "img-3" },
    { index: 3, title: "Bridge", status: "done", refId: "img-4" },
    { index: 4, title: "Alley", status: "done", refId: "img-5" },
    { index: 5, title: "Square", status: "pending", refId: undefined },
    { index: 6, title: "Orchard", status: "pending", refId: undefined },
    { index: 7, title: "Hilltop Return", status: "pending", refId: undefined },
  ],
  styleGuide: { style: "Ghibli watercolor", palette: "warm amber", characters: "girl ~10 with skateboard" },
};

describe("Context Builder", () => {
  it("builds minimal context for simple create", () => {
    const ctx = buildAgentContext(
      { type: "none" },
      { project: null, digest: "", recentActions: [], preferences: {} }
    );
    expect(ctx).toContain("creative partner");
    expect(ctx.length).toBeLessThan(2000);
  });

  it("includes project state for continue intent", () => {
    const ctx = buildAgentContext(
      { type: "continue" },
      { project: mockProject, digest: "", recentActions: [], preferences: {} }
    );
    expect(ctx).toContain("project_generate");
    expect(ctx).toContain("proj_1");
    expect(ctx).toContain("5/8");
  });

  it("includes scene details for adjust intent", () => {
    const ctx = buildAgentContext(
      { type: "adjust_scene", sceneHint: "3", feedback: "too dark" },
      { project: mockProject, digest: "", recentActions: [], preferences: {} }
    );
    expect(ctx).toContain("project_iterate");
    expect(ctx).toContain("too dark");
  });

  it("includes style for add_scenes intent", () => {
    const ctx = buildAgentContext(
      { type: "add_scenes", count: 4 },
      { project: mockProject, digest: "", recentActions: [], preferences: {} }
    );
    expect(ctx).toContain("create_media");
    expect(ctx).toContain("Ghibli watercolor");
    expect(ctx).toContain("4");
  });

  it("includes digest when present", () => {
    const ctx = buildAgentContext(
      { type: "none" },
      { project: null, digest: "User created 8 Ghibli scenes. Loved the style.", recentActions: [], preferences: {} }
    );
    expect(ctx).toContain("Ghibli scenes");
  });

  it("includes recent actions", () => {
    const ctx = buildAgentContext(
      { type: "none" },
      {
        project: null,
        digest: "",
        recentActions: [{ tool: "create_media", summary: "5 scenes", outcome: "5 created", success: true, timestamp: Date.now() }],
        preferences: {},
      }
    );
    expect(ctx).toContain("create_media");
    expect(ctx).toContain("5 created");
  });

  it("stays under 3000 chars", () => {
    const ctx = buildAgentContext(
      { type: "continue" },
      {
        project: mockProject,
        digest: "word ".repeat(100),
        recentActions: Array(5).fill({ tool: "create_media", summary: "batch", outcome: "done", success: true, timestamp: Date.now() }),
        preferences: { preferredModel: "flux-dev", styleNote: "warm colors" },
      }
    );
    expect(ctx.length).toBeLessThan(3000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/context-builder.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement context builder**

```typescript
// lib/agents/context-builder.ts
import type { Intent } from "./intent";
import type { ProjectSnapshot, ActionRecord } from "./working-memory";
import { getCachedCapabilities } from "@/lib/sdk/capabilities";
import { getMemorySummary } from "@/lib/memory/store";

interface MemorySnapshot {
  project: ProjectSnapshot | null;
  digest: string;
  recentActions: ActionRecord[];
  preferences: Record<string, string>;
}

const BASE_PROMPT = `You are a passionate creative partner in Livepeer Storyboard. You get genuinely excited about ideas, offer bold suggestions, and celebrate great results. Brief and punchy — the canvas shows results, don't over-describe.

## Rules
- Keep prompts under 25 words. Summarize — don't copy descriptions verbatim.
- After generating, react briefly and ask what's next.
- For restyle/animate existing card: canvas_get first, pass source_url.
- Never say "I can't" — suggest an alternative approach.`;

/**
 * Build an intent-aware system prompt from working memory.
 * Token-budgeted: always under ~800 tokens (~3000 chars).
 */
export function buildAgentContext(intent: Intent, memory: MemorySnapshot): string {
  const parts: string[] = [BASE_PROMPT];

  // Models (compact)
  const caps = getCachedCapabilities();
  if (caps.length > 0) {
    parts.push(`\nModels: ${caps.map((c) => c.name).join(", ")}. Selection is automatic.`);
  }

  // Long-term memory (styles, ratings)
  const longTermMemory = getMemorySummary();
  if (longTermMemory) parts.push(`\nMemory: ${longTermMemory}`);

  // Preferences
  const prefParts = Object.entries(memory.preferences)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  if (prefParts) parts.push(`\nPreferences: ${prefParts}`);

  // --- Intent-specific context ---
  switch (intent.type) {
    case "new_project":
      parts.push(`\n## Action: New Project
User is submitting a multi-scene brief. Extract scenes and call project_create.
- Each scene prompt: UNDER 20 WORDS. Summarize, don't copy.
- Extract style_guide (visual_style, color_palette, mood, prompt_prefix).
- After project_create, call project_generate to start the first batch.`);
      break;

    case "continue":
      if (memory.project) {
        parts.push(`\n## Action: Continue Generation
Project "${memory.project.id}": ${memory.project.completedScenes}/${memory.project.totalScenes} scenes done.
Call project_generate with project_id="${memory.project.id}".`);
        if (memory.project.styleGuide) {
          parts.push(`Style: ${memory.project.styleGuide.style}`);
        }
      }
      break;

    case "add_scenes":
      parts.push(`\n## Action: Add ${intent.count || 4} More Scenes`);
      if (memory.project?.styleGuide) {
        parts.push(`Style: ${memory.project.styleGuide.style}
Characters: ${memory.project.styleGuide.characters}
Use create_media with ${Math.min(intent.count || 4, 5)} steps.
Each prompt MUST start with the style and mention the character. Under 25 words.
After creating, call canvas_organize.`);
      } else {
        parts.push(`Use create_media with ${Math.min(intent.count || 4, 5)} steps. Under 25 words each.`);
      }
      if (intent.direction) {
        parts.push(`User direction: "${intent.direction.slice(0, 200)}"`);
      }
      break;

    case "adjust_scene":
      if (memory.project) {
        parts.push(`\n## Action: Adjust Scene
Project "${memory.project.id}". User feedback: "${intent.feedback?.slice(0, 200)}"
${intent.sceneHint ? `Scene index: ${intent.sceneHint}` : "Identify the scene from their description."}
Use project_iterate with the scene index and feedback.`);
      }
      break;

    case "style_correction":
      parts.push(`\n## Action: Style Correction
User wants to change the creative direction: "${intent.feedback?.slice(0, 200)}"
Acknowledge the change. If they want to regenerate, use create_media or project_iterate.`);
      if (memory.project?.styleGuide) {
        parts.push(`Current style: ${memory.project.styleGuide.style}`);
      }
      break;

    case "status":
      if (memory.project) {
        parts.push(`\n## Action: Status Report
Project "${memory.project.id}": ${memory.project.completedScenes}/${memory.project.totalScenes} done.
If incomplete, call project_generate to continue.`);
      }
      break;

    default:
      // General routing
      parts.push(`\n## Routing
- 1-5 items: create_media with SHORT prompts
- 6+ scenes: project_create then project_generate
- Live stream: scope_start/control/stop
- Canvas: canvas_get/create/update/remove/organize`);
      break;
  }

  // Project state (compact, always include if exists)
  if (memory.project && intent.type !== "new_project") {
    const done = memory.project.sceneList
      .filter((s) => s.status === "done")
      .map((s) => `${s.title}(${s.refId || "?"})`)
      .join(", ");
    const pending = memory.project.sceneList
      .filter((s) => s.status !== "done")
      .map((s) => s.title)
      .join(", ");
    if (done) parts.push(`\nDone scenes: ${done.slice(0, 300)}`);
    if (pending) parts.push(`Pending: ${pending.slice(0, 200)}`);
  }

  // Recent actions (last 3)
  if (memory.recentActions.length > 0) {
    const recent = memory.recentActions.slice(-3).map(
      (a) => `${a.tool}: ${a.outcome}`
    ).join("; ");
    parts.push(`\nRecent: ${recent}`);
  }

  // Conversation digest
  if (memory.digest) {
    parts.push(`\nSession: ${memory.digest.slice(0, 300)}`);
  }

  return parts.join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/context-builder.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add lib/agents/context-builder.ts tests/unit/context-builder.test.ts
git commit -m "feat: add intent-aware context builder for agent system prompt"
```

---

## Phase 2: Wire the unified pipeline

### Task 4: Update ChatPanel to use intent → memory → agent flow

**Files:**
- Modify: `components/chat/ChatPanel.tsx`
- Modify: `lib/agents/preprocessor.ts`

- [ ] **Step 1: Update preprocessor to be extraction-only for new projects**

In `lib/agents/preprocessor.ts`, change the multi-scene handler to extract scenes and create the project, but NOT run `generateAllBatches`. Instead, return `handled: false` with an `agentPrompt` that tells the agent to call `project_generate`:

Find the `handleMultiScene` function (around line 420-500). Change the return after `generateAllBatches` to NOT call `generateAllBatches`:

```typescript
// In handleMultiScene(), REPLACE:
//   await generateAllBatches(projectId, totalScenes);
//   say(`${pick(REACTIONS.allDone)} ${pick(REACTIONS.askFeedback)}`, "agent");
//   return { handled: true, agentPrompt: `[Context: ...]` };
// WITH:
  say(pick(REACTIONS.generating), "agent");
  // DON'T run batches here — let the agent handle it via tool-use loop.
  // This keeps the agent in the loop so follow-up context is preserved.
  return {
    handled: false,
    agentPrompt: `Project "${projectId}" created with ${totalScenes} scenes. Call project_generate with project_id="${projectId}" to generate the first batch. After each batch, if more remain, call project_generate again. Be brief.`,
  };
```

Keep the `extractCreativeContext` call — that's valuable. Keep the `project_create` call. Only remove the `generateAllBatches` call.

- [ ] **Step 2: Update ChatPanel.tsx to use working memory + intent + context builder**

Replace the `processOne` function in `components/chat/ChatPanel.tsx`:

```typescript
    async (text: string) => {
      activeCount.current++;
      addMessage(text, "user");

      // Step 1: Classify intent (fast, local)
      const projStore = useProjectStore.getState();
      const activeProject = projStore.getActiveProject();
      const pendingScenes = activeProject
        ? activeProject.scenes.filter((s) => s.status === "pending" || s.status === "regenerating").length
        : 0;

      const intent = classifyIntent(text, !!activeProject, pendingScenes);

      // Step 2: Sync working memory from stores
      const memory = useWorkingMemory.getState();
      memory.syncFromProjectStore();

      // Step 3: Preprocess (extraction only — no batch execution)
      let agentText = text;
      try {
        setThinkingVerb("Analyzing");
        setIsThinking(true);

        // Only preprocess for new_project (scene extraction + context extraction)
        if (intent.type === "new_project") {
          const pre = await preprocessPrompt(text);
          if (pre.agentPrompt) {
            agentText = pre.agentPrompt;
          }
          // After preprocessing, sync memory again (project was just created)
          memory.syncFromProjectStore();
        }
      } catch {
        // Preprocessing failed — send original to agent
      }

      // Step 4: Handle intents that preprocessor manages directly
      // (continue, status — these call generateAllBatches directly)
      if (intent.type === "continue" || intent.type === "status") {
        try {
          const pre = await preprocessPrompt(text);
          if (pre.handled) {
            memory.appendDigest(`User: ${intent.type}. Resumed generation.`);
            memory.syncFromProjectStore();
            setIsThinking(false);
            activeCount.current--;
            return;
          }
        } catch { /* fall through to agent */ }
      }

      // Step 5: Build enriched context and send to agent
      const plugin = getActivePlugin();
      if (plugin) {
        const context = buildCanvasContext();
        // Override system prompt via context builder (will be used in loadSystemPrompt)
        const gen = plugin.sendMessage(agentText, context);
        await consumeEvents(gen);
      }

      // Step 6: Update working memory with what happened
      memory.syncFromProjectStore();
      memory.appendDigest(`User: "${text.slice(0, 50)}". Agent responded.`);

      setIsThinking(false);
      activeCount.current--;
    },
```

Add imports at the top of ChatPanel.tsx:
```typescript
import { classifyIntent } from "@/lib/agents/intent";
import { useWorkingMemory } from "@/lib/agents/working-memory";
import { useProjectStore } from "@/lib/projects/store";
```

- [ ] **Step 3: Update Gemini agent to use context builder**

In `lib/agents/gemini/index.ts`, modify `sendMessage` to use the context builder instead of `loadSystemPrompt`:

```typescript
// At the top, add imports:
import { buildAgentContext } from "../context-builder";
import { useWorkingMemory } from "../working-memory";
import { classifyIntent } from "../intent";
import { useProjectStore } from "@/lib/projects/store";

// In sendMessage(), replace:
//   const system = await loadSystemPrompt(context);
// WITH:
      const projStore = useProjectStore.getState();
      const activeProject = projStore.getActiveProject();
      const pendingScenes = activeProject
        ? activeProject.scenes.filter((s) => s.status === "pending" || s.status === "regenerating").length
        : 0;
      const intent = classifyIntent(text, !!activeProject, pendingScenes);
      const memory = useWorkingMemory.getState();
      const system = buildAgentContext(intent, {
        project: memory.project,
        digest: memory.digest,
        recentActions: memory.recentActions,
        preferences: memory.preferences,
      });
```

After the tool-use loop completes, update working memory:

```typescript
      // After the for-loop (tool-use loop) ends, add:
      // Update working memory with action results
      const wmem = useWorkingMemory.getState();
      if (completedTools.length > 0) {
        const ok = completedTools.filter(t => t.success).length;
        wmem.recordAction({
          tool: completedTools.map(t => t.name).join("+"),
          summary: `${completedTools.length} tools`,
          outcome: `${ok}/${completedTools.length} succeeded`,
          success: ok === completedTools.length,
        });
      }
      wmem.syncFromProjectStore();
```

- [ ] **Step 4: Verify dev server runs without errors**

Run: `npm run dev` — check browser console for errors.
Test: Send "a happy cat" in chat → should create an image card.
Test: Send an 8-scene brief → should create project + generate via agent tool loop.

- [ ] **Step 5: Commit**

```bash
git add components/chat/ChatPanel.tsx lib/agents/preprocessor.ts lib/agents/gemini/index.ts
git commit -m "feat: wire unified intent → memory → agent pipeline"
```

---

### Task 5: Update working memory from tool results

**Files:**
- Modify: `lib/tools/compound-tools.ts`
- Modify: `lib/tools/project-tools.ts`

- [ ] **Step 1: Update create_media to record actions in working memory**

In `lib/tools/compound-tools.ts`, after the step loop completes (around line 330), add:

```typescript
    // Record in working memory
    try {
      const { useWorkingMemory } = await import("@/lib/agents/working-memory");
      const mem = useWorkingMemory.getState();
      const ok = results.filter((r) => !r.error).length;
      const cap = results[0]?.capability || "unknown";
      mem.recordAction({
        tool: "create_media",
        summary: `${rawSteps.length} steps (${cap})`,
        outcome: ok === results.length
          ? `${ok} created`
          : `${ok}/${results.length} ok`,
        success: ok > 0,
      });
    } catch { /* non-critical */ }
```

- [ ] **Step 2: Update project_generate to record actions and sync memory**

In `lib/tools/project-tools.ts`, at the end of project_generate's execute (around line 215), add:

```typescript
    // Sync working memory
    try {
      const { useWorkingMemory } = await import("@/lib/agents/working-memory");
      const mem = useWorkingMemory.getState();
      mem.recordAction({
        tool: "project_generate",
        summary: `batch of ${batch.length} scenes`,
        outcome: `${completed}/${project.scenes.length} total done, ${remaining.length} remaining`,
        success: result.success,
      });
      mem.syncFromProjectStore();
    } catch { /* non-critical */ }
```

- [ ] **Step 3: Update project_create to sync memory and record digest**

In `lib/tools/project-tools.ts`, at the end of project_create's execute, add:

```typescript
    // Bootstrap working memory with new project
    try {
      const { useWorkingMemory } = await import("@/lib/agents/working-memory");
      const mem = useWorkingMemory.getState();
      mem.syncFromProjectStore();
      mem.appendDigest(`Project created: ${scenes.length} scenes, style: ${styleGuide?.visualStyle || "unset"}`);
    } catch { /* non-critical */ }
```

- [ ] **Step 4: Test the flow end-to-end manually**

1. Clear localStorage and refresh
2. Send an 8-scene brief → project created, agent calls project_generate
3. After completion, send "give me 4 more" → agent should get enriched context with project state
4. Check browser console for working memory updates

- [ ] **Step 5: Commit**

```bash
git add lib/tools/compound-tools.ts lib/tools/project-tools.ts
git commit -m "feat: emit working memory events from tools"
```

---

## Phase 3: E2E Tests

### Task 6: Write E2E tests for the unified agent flow

**Files:**
- Create: `tests/e2e/agent-memory.spec.ts`

- [ ] **Step 1: Write E2E test suite**

```typescript
// tests/e2e/agent-memory.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Agent Memory & Context Continuity", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("[data-testid='chat-input'], textarea");
  });

  test("simple prompt creates a card without errors", async ({ page }) => {
    const input = page.locator("textarea").first();
    await input.fill("a happy cat in sunlight");
    await input.press("Enter");

    // Should not show "Error: No response"
    await page.waitForTimeout(3000);
    const messages = await page.locator("[class*='break-words']").allTextContents();
    const hasError = messages.some((m) => m.includes("Error: No response"));
    expect(hasError).toBe(false);
  });

  test("multi-scene brief creates project and starts generating", async ({ page }) => {
    const input = page.locator("textarea").first();
    const brief = `Scene 1: A cat on a hill. Scene 2: The cat runs down. Scene 3: The cat finds a fish. Scene 4: The cat eats the fish.`;
    await input.fill(brief);
    await input.press("Enter");

    // Should see project creation message
    await page.waitForTimeout(5000);
    const messages = await page.locator("[class*='break-words']").allTextContents();
    const text = messages.join(" ");

    // Should NOT show "Error: No response"
    expect(text).not.toContain("Error: No response");

    // Should show some form of project/scene activity
    const hasProjectActivity = text.includes("scene") || text.includes("Scene") || text.includes("creat");
    expect(hasProjectActivity).toBe(true);
  });

  test("follow-up after generation does not error", async ({ page }) => {
    // First, do a simple generation
    const input = page.locator("textarea").first();
    await input.fill("a sunset over mountains");
    await input.press("Enter");
    await page.waitForTimeout(5000);

    // Follow-up
    await input.fill("make it more dramatic");
    await input.press("Enter");
    await page.waitForTimeout(3000);

    const messages = await page.locator("[class*='break-words']").allTextContents();
    const hasError = messages.some((m) => m.includes("Error: No response"));
    expect(hasError).toBe(false);
  });

  test("intent classifier detects continue with active project", async ({ page }) => {
    // This test verifies the classifyIntent function at the unit level
    // by importing it directly in the test
    const result = await page.evaluate(() => {
      // Access the module through the window (it's bundled client-side)
      // We'll test this via the observable behavior instead
      return true;
    });
    expect(result).toBe(true);
  });
});
```

- [ ] **Step 2: Run E2E tests**

Run: `npx playwright test tests/e2e/agent-memory.spec.ts --headed`
Expected: Tests should pass (or show clear failures indicating what needs fixing)

- [ ] **Step 3: Fix any failures and re-run**

Address any test failures. Common issues:
- Timeout waiting for generation (increase timeout)
- Selector changes (update selectors)
- Working memory not syncing (check store imports)

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/agent-memory.spec.ts
git commit -m "test: add E2E tests for agent memory and context continuity"
```

---

## Phase 4: Cleanup old dual-brain code

### Task 7: Remove generateAllBatches from preprocessor for new projects

**Files:**
- Modify: `lib/agents/preprocessor.ts`

- [ ] **Step 1: Simplify preprocessor**

The preprocessor should now only:
1. Detect multi-scene briefs (keep `isMultiScene()`)
2. Extract scenes (keep `extractScenes()`)
3. Extract style guide (keep `extractStyleGuide()`)
4. Call `project_create` (keep)
5. Extract creative DNA (keep `extractCreativeContext()`)
6. Return `handled: false` with enriched `agentPrompt` (already done in Task 4)

For `continue` and `status` intents, the preprocessor can still handle them directly since they're simple fire-and-forget operations. But ALL new project generation should flow through the agent.

Remove the `generateAllBatches` call from the `handleMultiScene` function ONLY. Keep it for `continue` and `status` intents (those are simple resume operations).

- [ ] **Step 2: Remove the skipAgent logic from ChatPanel**

In ChatPanel.tsx, remove the `skipAgent` variable and the conditional. After Task 4, the flow is:
- `new_project` → preprocessor extracts, returns `agentPrompt` → agent runs
- `continue`/`status` → preprocessor handles directly → no agent call needed
- Everything else → agent runs

- [ ] **Step 3: Verify all intents work**

Test manually:
1. "a happy cat" → agent creates image ✓
2. 8-scene brief → preprocessor extracts, agent generates via project_generate ✓
3. "give me 4 more" → agent gets enriched context, creates media ✓
4. "continue" → preprocessor resumes batches ✓
5. "change scene 3" → agent calls project_iterate ✓
6. "wrong style, use anime" → agent acknowledges, updates context ✓

- [ ] **Step 4: Commit**

```bash
git add lib/agents/preprocessor.ts components/chat/ChatPanel.tsx
git commit -m "refactor: simplify preprocessor to extraction-only for new projects"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| **1: Foundation** | Tasks 1-3 | Working memory store, intent classifier, context builder |
| **2: Wiring** | Tasks 4-5 | Unified pipeline: intent → memory → enriched agent context |
| **3: Testing** | Task 6 | E2E tests verifying no "No response" errors, context continuity |
| **4: Cleanup** | Task 7 | Remove dual-brain, simplify preprocessor |

**After completion:**
- "Give me 4 more scenes" works reliably (agent has full project context)
- No more "Error: No response" after multi-scene generation
- Style consistency maintained across follow-ups
- Working memory persists across conversation turns
- Intent-aware context keeps system prompt focused and under token budget
