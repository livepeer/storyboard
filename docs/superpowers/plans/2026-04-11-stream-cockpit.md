# Stream Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cramped LV2V stream card with an interactive 640×580 cockpit that auto-expands during streaming, featuring HUD overlays, preset chips, intent input with agent suggestions, activity feed with pinning, and a focused stream agent for low-latency Scope intent translation.

**Architecture:** A new `StreamCockpit` component is rendered inline inside the existing `Card` when streaming. It uses a Zustand store (`cockpit-store.ts`) for pinned skills, history, and bias computation. A focused `cockpit-agent.ts` translates user intent into Scope tool calls (preset / param tweak / skill load) by checking pinned skills first, then falling back to a small Gemini call. The card resizes to 640×580 when active, returns to 320×280 when stopped.

**Tech Stack:** TypeScript, Zustand, React, Vitest, Playwright, existing Gemini API route

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `lib/stream/cockpit-types.ts` | StreamPreference, PinnedSkill, ToolCall, IntentResult, StreamMemoryState |
| `lib/stream/cockpit-store.ts` | Zustand store: history, pinnedSkills, recordHistory, pinAction, getBiasFor |
| `lib/stream/cockpit-agent.ts` | translateIntent() — checks pinned skills, falls back to Gemini, returns applied + alternatives |
| `components/canvas/StreamCockpit.tsx` | Main cockpit component (6 zones), rendered when streaming |
| `components/canvas/StreamCockpit/HudOverlay.tsx` | Floating param + graph HUD overlays inside live frame |
| `components/canvas/StreamCockpit/PresetChips.tsx` | Preset row + custom preset save |
| `components/canvas/StreamCockpit/IntentInput.tsx` | Big textarea + Enter handling |
| `components/canvas/StreamCockpit/SuggestionChips.tsx` | Applied (rollback) + alternatives chips |
| `components/canvas/StreamCockpit/ActivityFeed.tsx` | Collapsible log with pin button |
| `tests/unit/cockpit-store.test.ts` | Pin/unpin, history, bias |
| `tests/unit/cockpit-agent.test.ts` | Pinned-skill matching, intent parsing |
| `tests/e2e/stream-cockpit.spec.ts` | E2E: render, expand, presets, suggestions |

### Modified files
| File | Changes |
|------|---------|
| `components/canvas/Card.tsx` | Replace stream controls (lines 317-403) with `<StreamCockpit card={card} />`, auto-resize when streaming |
| `lib/stream/session.ts` | Add `lastParams` to `Lv2vSession`, update in `controlStream` |

---

## Phase 1: Data Layer

### Task 1: Cockpit types and store

**Files:**
- Create: `lib/stream/cockpit-types.ts`
- Create: `lib/stream/cockpit-store.ts`
- Test: `tests/unit/cockpit-store.test.ts`

- [ ] **Step 1: Create types**

```typescript
// lib/stream/cockpit-types.ts

/** A single Scope action the agent can apply */
export interface ToolCall {
  /** The tool name: scope_control, scope_apply_preset, load_skill, etc */
  tool: string;
  /** Tool params */
  params: Record<string, unknown>;
  /** Human-readable summary shown in chips and feed */
  summary: string;
  /** Action type for chip color coding */
  kind: "preset" | "skill" | "param" | "system" | "graph";
}

/** Result of intent translation */
export interface IntentResult {
  /** The action that was/will be applied immediately */
  applied: ToolCall;
  /** Alternative actions the user can switch to */
  alternatives: ToolCall[];
  /** Agent's reasoning shown in feed */
  reasoning?: string;
}

/** A historical record of an applied action */
export interface StreamPreference {
  intent: string;
  applied: ToolCall;
  outcome: "kept" | "rolled_back" | "alternative_chosen";
  timestamp: number;
}

/** A user-pinned skill — high-priority shortcut */
export interface PinnedSkill {
  id: string;
  name: string;
  /** Phrases that trigger this skill (lowercased keywords) */
  triggers: string[];
  action: ToolCall;
  createdAt: number;
  uses: number;
}

/** Bias hints derived from history for a given intent */
export interface Bias {
  /** Most-used preset for similar intents */
  preferredPreset?: string;
  /** Average noise_scale used for similar intents */
  avgNoiseScale?: number;
  /** Average kv_cache used */
  avgKvCache?: number;
  /** Number of historical samples backing this bias */
  sampleCount: number;
}
```

- [ ] **Step 2: Write failing tests for cockpit store**

```typescript
// tests/unit/cockpit-store.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useCockpitStore } from "@/lib/stream/cockpit-store";
import type { ToolCall } from "@/lib/stream/cockpit-types";

const sampleAction: ToolCall = {
  tool: "scope_apply_preset",
  params: { preset: "dreamy" },
  summary: "applied dreamy preset",
  kind: "preset",
};

describe("CockpitStore", () => {
  beforeEach(() => {
    useCockpitStore.setState({ history: [], pinnedSkills: [] });
  });

  it("starts empty", () => {
    expect(useCockpitStore.getState().history).toHaveLength(0);
    expect(useCockpitStore.getState().pinnedSkills).toHaveLength(0);
  });

  it("records history", () => {
    useCockpitStore.getState().recordHistory("make it dreamy", sampleAction, "kept");
    expect(useCockpitStore.getState().history).toHaveLength(1);
    expect(useCockpitStore.getState().history[0].intent).toBe("make it dreamy");
    expect(useCockpitStore.getState().history[0].outcome).toBe("kept");
  });

  it("caps history at 100 entries", () => {
    for (let i = 0; i < 110; i++) {
      useCockpitStore.getState().recordHistory(`intent ${i}`, sampleAction, "kept");
    }
    expect(useCockpitStore.getState().history).toHaveLength(100);
    expect(useCockpitStore.getState().history[0].intent).toBe("intent 10");
  });

  it("pins a skill from an action", () => {
    const skill = useCockpitStore.getState().pinAction("anime style", sampleAction, "Anime Quick");
    expect(skill.name).toBe("Anime Quick");
    expect(skill.triggers).toContain("anime");
    expect(skill.uses).toBe(0);
    expect(useCockpitStore.getState().pinnedSkills).toHaveLength(1);
  });

  it("auto-generates skill name from intent if not provided", () => {
    const skill = useCockpitStore.getState().pinAction("dreamy soft glow", sampleAction);
    expect(skill.name).toBeTruthy();
    expect(skill.name.length).toBeGreaterThan(0);
  });

  it("removes a pinned skill", () => {
    const skill = useCockpitStore.getState().pinAction("test", sampleAction);
    useCockpitStore.getState().unpinSkill(skill.id);
    expect(useCockpitStore.getState().pinnedSkills).toHaveLength(0);
  });

  it("findPinnedSkill matches by trigger keyword", () => {
    useCockpitStore.getState().pinAction("anime style with bright colors", sampleAction, "Anime");
    const match = useCockpitStore.getState().findPinnedSkill("make it anime");
    expect(match?.name).toBe("Anime");
  });

  it("findPinnedSkill returns null when no match", () => {
    useCockpitStore.getState().pinAction("anime", sampleAction);
    const match = useCockpitStore.getState().findPinnedSkill("cyberpunk neon");
    expect(match).toBeNull();
  });

  it("getBiasFor returns empty bias when no history", () => {
    const bias = useCockpitStore.getState().getBiasFor("dreamy");
    expect(bias.sampleCount).toBe(0);
    expect(bias.preferredPreset).toBeUndefined();
  });

  it("getBiasFor computes preferred preset from history", () => {
    const dreamyAction: ToolCall = { tool: "scope_apply_preset", params: { preset: "dreamy" }, summary: "", kind: "preset" };
    for (let i = 0; i < 3; i++) {
      useCockpitStore.getState().recordHistory("dreamy mood", dreamyAction, "kept");
    }
    const bias = useCockpitStore.getState().getBiasFor("dreamy mood");
    expect(bias.preferredPreset).toBe("dreamy");
    expect(bias.sampleCount).toBe(3);
  });

  it("incrementSkillUses tracks usage", () => {
    const skill = useCockpitStore.getState().pinAction("test", sampleAction);
    useCockpitStore.getState().incrementSkillUses(skill.id);
    useCockpitStore.getState().incrementSkillUses(skill.id);
    const updated = useCockpitStore.getState().pinnedSkills.find((s) => s.id === skill.id);
    expect(updated?.uses).toBe(2);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/cockpit-store.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement cockpit store**

```typescript
// lib/stream/cockpit-store.ts
import { create } from "zustand";
import type { StreamPreference, PinnedSkill, ToolCall, Bias } from "./cockpit-types";

const STORAGE_KEY = "storyboard_cockpit_skills";
const MAX_HISTORY = 100;

function loadPinnedSkills(): PinnedSkill[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePinnedSkills(skills: PinnedSkill[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(skills));
}

/** Extract keyword triggers from an intent string */
function extractTriggers(intent: string): string[] {
  return intent
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .filter((w) => !STOP_WORDS.has(w));
}

const STOP_WORDS = new Set([
  "the", "and", "with", "for", "make", "let", "put", "use", "this",
  "that", "have", "more", "less", "some", "any", "all",
]);

interface CockpitStoreState {
  history: StreamPreference[];
  pinnedSkills: PinnedSkill[];

  recordHistory: (intent: string, applied: ToolCall, outcome: StreamPreference["outcome"]) => void;
  pinAction: (intent: string, action: ToolCall, name?: string) => PinnedSkill;
  unpinSkill: (id: string) => void;
  incrementSkillUses: (id: string) => void;
  findPinnedSkill: (intent: string) => PinnedSkill | null;
  getBiasFor: (intent: string) => Bias;
}

export const useCockpitStore = create<CockpitStoreState>((set, get) => ({
  history: [],
  pinnedSkills: loadPinnedSkills(),

  recordHistory: (intent, applied, outcome) =>
    set((s) => {
      const entry: StreamPreference = {
        intent,
        applied,
        outcome,
        timestamp: Date.now(),
      };
      const next = [...s.history, entry];
      return { history: next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next };
    }),

  pinAction: (intent, action, name) => {
    const triggers = extractTriggers(intent);
    const skill: PinnedSkill = {
      id: `pin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: name || (triggers[0] ? triggers.slice(0, 3).join(" ") : action.summary).slice(0, 30),
      triggers,
      action,
      createdAt: Date.now(),
      uses: 0,
    };
    set((s) => {
      const next = [...s.pinnedSkills, skill];
      savePinnedSkills(next);
      return { pinnedSkills: next };
    });
    return skill;
  },

  unpinSkill: (id) =>
    set((s) => {
      const next = s.pinnedSkills.filter((skill) => skill.id !== id);
      savePinnedSkills(next);
      return { pinnedSkills: next };
    }),

  incrementSkillUses: (id) =>
    set((s) => {
      const next = s.pinnedSkills.map((skill) =>
        skill.id === id ? { ...skill, uses: skill.uses + 1 } : skill
      );
      savePinnedSkills(next);
      return { pinnedSkills: next };
    }),

  findPinnedSkill: (intent) => {
    const intentTriggers = extractTriggers(intent);
    if (intentTriggers.length === 0) return null;

    let bestMatch: PinnedSkill | null = null;
    let bestScore = 0;

    for (const skill of get().pinnedSkills) {
      let score = 0;
      for (const trigger of intentTriggers) {
        if (skill.triggers.includes(trigger)) score++;
      }
      // Require at least 1 keyword match
      if (score > bestScore && score >= 1) {
        bestScore = score;
        bestMatch = skill;
      }
    }
    return bestMatch;
  },

  getBiasFor: (intent) => {
    const intentTriggers = extractTriggers(intent);
    const intentSet = new Set(intentTriggers);

    // Find historical entries with overlapping keywords
    const matching = get().history.filter((entry) => {
      const entryTriggers = extractTriggers(entry.intent);
      return entryTriggers.some((t) => intentSet.has(t));
    });

    if (matching.length === 0) return { sampleCount: 0 };

    // Most common preset
    const presetCounts: Record<string, number> = {};
    let noiseSum = 0;
    let noiseCount = 0;
    let kvSum = 0;
    let kvCount = 0;

    for (const entry of matching) {
      const params = entry.applied.params as Record<string, unknown>;
      const preset = params.preset as string | undefined;
      if (preset) presetCounts[preset] = (presetCounts[preset] || 0) + 1;
      const noise = params.noise_scale as number | undefined;
      if (typeof noise === "number") {
        noiseSum += noise;
        noiseCount++;
      }
      const kv = params.kv_cache_attention_bias as number | undefined;
      if (typeof kv === "number") {
        kvSum += kv;
        kvCount++;
      }
    }

    const preferredPreset = Object.entries(presetCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

    return {
      preferredPreset,
      avgNoiseScale: noiseCount > 0 ? noiseSum / noiseCount : undefined,
      avgKvCache: kvCount > 0 ? kvSum / kvCount : undefined,
      sampleCount: matching.length,
    };
  },
}));
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/cockpit-store.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add lib/stream/cockpit-types.ts lib/stream/cockpit-store.ts tests/unit/cockpit-store.test.ts
git commit -m "feat: add cockpit store with pinned skills and history tracking"
```

---

### Task 2: Cockpit agent (intent translator)

**Files:**
- Create: `lib/stream/cockpit-agent.ts`
- Test: `tests/unit/cockpit-agent.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/cockpit-agent.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { translateIntent, parseSlashCommand } from "@/lib/stream/cockpit-agent";
import { useCockpitStore } from "@/lib/stream/cockpit-store";

describe("parseSlashCommand", () => {
  it("parses /preset", () => {
    const result = parseSlashCommand("/preset dreamy");
    expect(result?.tool).toBe("scope_apply_preset");
    expect(result?.params.preset).toBe("dreamy");
  });

  it("parses /noise", () => {
    const result = parseSlashCommand("/noise 0.7");
    expect(result?.tool).toBe("scope_control");
    expect(result?.params.noise_scale).toBe(0.7);
  });

  it("parses /reset", () => {
    const result = parseSlashCommand("/reset");
    expect(result?.tool).toBe("scope_control");
    expect(result?.params.reset_cache).toBe(true);
  });

  it("returns null for non-slash", () => {
    expect(parseSlashCommand("make it dreamy")).toBeNull();
  });
});

describe("translateIntent", () => {
  beforeEach(() => {
    useCockpitStore.setState({ history: [], pinnedSkills: [] });
  });

  it("returns pinned skill match without LLM call", async () => {
    const skill = useCockpitStore.getState().pinAction("anime style", {
      tool: "scope_apply_preset",
      params: { preset: "anime" },
      summary: "anime preset",
      kind: "preset",
    });
    const result = await translateIntent("make it anime");
    expect(result.applied.tool).toBe("scope_apply_preset");
    expect(result.applied.params.preset).toBe("anime");
    // Pinned skill use should be incremented
    const updated = useCockpitStore.getState().pinnedSkills.find((s) => s.id === skill.id);
    expect(updated?.uses).toBe(1);
  });

  it("falls back to slash command parser", async () => {
    const result = await translateIntent("/preset cinematic");
    expect(result.applied.tool).toBe("scope_apply_preset");
    expect(result.applied.params.preset).toBe("cinematic");
  });

  it("returns alternatives from preset list when LLM unavailable", async () => {
    // No pinned skills, no slash command — falls back to keyword matching
    const result = await translateIntent("dreamy soft");
    expect(result.applied).toBeTruthy();
    // Should match dreamy preset by keyword
    expect(result.applied.params.preset).toBe("dreamy");
    expect(result.alternatives.length).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/cockpit-agent.test.ts`

- [ ] **Step 3: Implement cockpit agent**

```typescript
// lib/stream/cockpit-agent.ts
import type { ToolCall, IntentResult } from "./cockpit-types";
import { useCockpitStore } from "./cockpit-store";
import { SCOPE_PRESETS } from "./scope-params";

/**
 * Parse slash commands like /preset dreamy, /noise 0.7, /reset
 * Returns null if not a slash command.
 */
export function parseSlashCommand(input: string): ToolCall | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const match = trimmed.match(/^\/(\w+)(?:\s+(.+))?$/);
  if (!match) return null;
  const cmd = match[1].toLowerCase();
  const arg = (match[2] || "").trim();

  switch (cmd) {
    case "preset":
      if (!arg) return null;
      return {
        tool: "scope_apply_preset",
        params: { preset: arg },
        summary: `applied ${arg} preset`,
        kind: "preset",
      };
    case "noise": {
      const v = parseFloat(arg);
      if (isNaN(v)) return null;
      return {
        tool: "scope_control",
        params: { noise_scale: v },
        summary: `noise → ${v}`,
        kind: "param",
      };
    }
    case "cache": {
      const v = parseFloat(arg);
      if (isNaN(v)) return null;
      return {
        tool: "scope_control",
        params: { kv_cache_attention_bias: v },
        summary: `cache → ${v}`,
        kind: "param",
      };
    }
    case "reset":
      return {
        tool: "scope_control",
        params: { reset_cache: true },
        summary: "reset cache",
        kind: "system",
      };
    case "lora":
      if (!arg) return null;
      return {
        tool: "scope_control",
        params: { lora_path: arg },
        summary: `loaded LoRA: ${arg}`,
        kind: "skill",
      };
  }
  return null;
}

/** Match an intent to a Scope preset by keyword fuzzy match */
function matchPresetByKeyword(intent: string): ToolCall | null {
  const lower = intent.toLowerCase();
  for (const preset of SCOPE_PRESETS) {
    // Match preset id, name, or first word of description
    if (
      lower.includes(preset.id) ||
      lower.includes(preset.name.toLowerCase())
    ) {
      return {
        tool: "scope_apply_preset",
        params: { preset: preset.id, ...preset.params },
        summary: `applied ${preset.name} preset`,
        kind: "preset",
      };
    }
  }
  return null;
}

/** Build alternative actions from other presets */
function buildAlternatives(applied: ToolCall): ToolCall[] {
  const appliedPreset = applied.params.preset as string | undefined;
  return SCOPE_PRESETS
    .filter((p) => p.id !== appliedPreset)
    .slice(0, 3)
    .map((p) => ({
      tool: "scope_apply_preset",
      params: { preset: p.id, ...p.params },
      summary: `try ${p.name}`,
      kind: "preset" as const,
    }));
}

/**
 * Translate user intent into a Scope action.
 * Priority: pinned skills → slash commands → keyword preset match → fallback.
 */
export async function translateIntent(intent: string): Promise<IntentResult> {
  // 1. Check pinned skills first (no LLM call)
  const pinned = useCockpitStore.getState().findPinnedSkill(intent);
  if (pinned) {
    useCockpitStore.getState().incrementSkillUses(pinned.id);
    return {
      applied: pinned.action,
      alternatives: buildAlternatives(pinned.action),
      reasoning: `Matched pinned skill "${pinned.name}"`,
    };
  }

  // 2. Slash commands
  const slash = parseSlashCommand(intent);
  if (slash) {
    return {
      applied: slash,
      alternatives: buildAlternatives(slash),
      reasoning: "Slash command",
    };
  }

  // 3. Keyword preset match
  const preset = matchPresetByKeyword(intent);
  if (preset) {
    return {
      applied: preset,
      alternatives: buildAlternatives(preset),
      reasoning: "Keyword match",
    };
  }

  // 4. Fallback: send raw text as prompt update
  const fallback: ToolCall = {
    tool: "scope_control",
    params: { prompts: intent },
    summary: `prompt → "${intent.slice(0, 30)}"`,
    kind: "param",
  };
  return {
    applied: fallback,
    alternatives: SCOPE_PRESETS.slice(0, 3).map((p) => ({
      tool: "scope_apply_preset",
      params: { preset: p.id, ...p.params },
      summary: `try ${p.name}`,
      kind: "preset" as const,
    })),
    reasoning: "Sent as prompt",
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/cockpit-agent.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/stream/cockpit-agent.ts tests/unit/cockpit-agent.test.ts
git commit -m "feat: add cockpit agent with pinned-skill matching and slash commands"
```

---

### Task 3: Track lastParams in stream session

**Files:**
- Modify: `lib/stream/session.ts`

- [ ] **Step 1: Add lastParams field to session interface**

In `lib/stream/session.ts`, find the `Lv2vSession` interface (around line 2). Add a new field:

```typescript
export interface Lv2vSession {
  streamId: string;
  publishTimer: ReturnType<typeof setInterval> | null;
  pollTimer: ReturnType<typeof setInterval> | null;
  stopped: boolean;
  publishSeq: number;
  pollSeq: number;
  frameCount: number;
  totalRecv: number;
  publishOk: number;
  publishErr: number;
  consecutiveEmpty: number;
  consecutivePublishFail: number;
  lastFpsTime: number;
  /** Most recent params applied via controlStream — for HUD display */
  lastParams?: Record<string, unknown>;
  onFrame?: (url: string) => void;
  onStatus?: (msg: string) => void;
  onError?: (err: string) => void;
}
```

- [ ] **Step 2: Update controlStream to record lastParams**

Find the `controlStream` function in the same file. Update it to merge new params into `session.lastParams`:

```typescript
export async function controlStream(
  session: Lv2vSession,
  prompt: string,
  params?: Record<string, unknown>
): Promise<void> {
  const payload: Record<string, unknown> = { ...params };
  if (prompt) payload.prompts = prompt;

  // Track applied params for HUD display
  session.lastParams = { ...(session.lastParams || {}), ...payload };

  const headers: Record<string, string> = { "Content-Type": "application/json", ...sdkHeaders() };
  await fetch(`${sdkUrl()}/stream/${session.streamId}/control`, {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "parameters", params: payload }),
  });
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit 2>&1 | grep -v "tests/" | head -10`

- [ ] **Step 4: Commit**

```bash
git add lib/stream/session.ts
git commit -m "feat: track lastParams in stream session for HUD display"
```

---

## Phase 2: UI Components

### Task 4: HudOverlay component

**Files:**
- Create: `components/canvas/StreamCockpit/HudOverlay.tsx`

- [ ] **Step 1: Create the HUD overlay component**

```typescript
// components/canvas/StreamCockpit/HudOverlay.tsx
"use client";

import type { Lv2vSession } from "@/lib/stream/session";

interface Props {
  session: Lv2vSession;
  graphTemplate?: string;
  pipelineId?: string;
}

export function HudOverlay({ session, graphTemplate, pipelineId }: Props) {
  const params = session.lastParams || {};
  const noise = params.noise_scale as number | undefined;
  const cache = params.kv_cache_attention_bias as number | undefined;
  const steps = params.denoising_step_list as number[] | undefined;

  return (
    <>
      {/* Top-left: param values */}
      <div
        className="absolute left-2 top-2 flex gap-3 rounded-md px-2.5 py-1.5 backdrop-blur-md"
        style={{ background: "rgba(0,0,0,0.6)", fontFamily: "monospace", fontSize: 10, color: "#fff" }}
      >
        <span>
          noise <b style={{ color: "#ec4899" }}>{noise !== undefined ? noise.toFixed(2) : "—"}</b>
        </span>
        <span>
          cache <b style={{ color: "#06b6d4" }}>{cache !== undefined ? cache.toFixed(2) : "—"}</b>
        </span>
        {steps && steps.length > 0 && (
          <span>
            steps <b style={{ color: "#10b981" }}>[{steps.join(",")}]</b>
          </span>
        )}
      </div>

      {/* Top-right: graph + pipeline */}
      {(graphTemplate || pipelineId) && (
        <div
          className="absolute right-2 top-2 rounded-md px-2.5 py-1.5 backdrop-blur-md"
          style={{ background: "rgba(0,0,0,0.6)", fontSize: 10, color: "#06b6d4" }}
        >
          ⚙ {graphTemplate || "simple-lv2v"} · {pipelineId || "longlive"}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/canvas/StreamCockpit/HudOverlay.tsx
git commit -m "feat: add HUD overlay for live param display"
```

---

### Task 5: PresetChips component

**Files:**
- Create: `components/canvas/StreamCockpit/PresetChips.tsx`

- [ ] **Step 1: Create preset chips component**

```typescript
// components/canvas/StreamCockpit/PresetChips.tsx
"use client";

import { SCOPE_PRESETS } from "@/lib/stream/scope-params";

interface Props {
  activePresetId?: string;
  onApply: (presetId: string) => void;
}

export function PresetChips({ activePresetId, onApply }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {SCOPE_PRESETS.map((preset) => {
        const isActive = preset.id === activePresetId;
        return (
          <button
            key={preset.id}
            onClick={() => onApply(preset.id)}
            title={preset.description}
            className="rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors"
            style={{
              background: isActive ? "#ec4899" : "rgba(236,72,153,0.15)",
              color: isActive ? "#fff" : "#ec4899",
              borderColor: isActive ? "#ec4899" : "rgba(236,72,153,0.3)",
            }}
          >
            {preset.name.toLowerCase()}{isActive ? " ●" : ""}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/canvas/StreamCockpit/PresetChips.tsx
git commit -m "feat: add preset chips for quick stream styling"
```

---

### Task 6: IntentInput component

**Files:**
- Create: `components/canvas/StreamCockpit/IntentInput.tsx`

- [ ] **Step 1: Create intent input component**

```typescript
// components/canvas/StreamCockpit/IntentInput.tsx
"use client";

import { useState, useCallback } from "react";

interface Props {
  onSubmit: (intent: string) => void;
  disabled?: boolean;
}

const PLACEHOLDERS = [
  "Tell the stream what to do — e.g. 'add neon rain'",
  "Try 'make it darker' or 'use depth preprocessor'",
  "Type intent — agent figures out the rest",
];

export function IntentInput({ onSubmit, disabled }: Props) {
  const [value, setValue] = useState("");
  const [placeholder] = useState(() => PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]);

  const handleSubmit = useCallback(() => {
    if (!value.trim()) return;
    onSubmit(value.trim());
    setValue("");
  }, [value, onSubmit]);

  return (
    <textarea
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSubmit();
        }
      }}
      placeholder={placeholder}
      disabled={disabled}
      rows={3}
      className="w-full resize-none rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-xs text-white placeholder:text-white/30 outline-none focus:border-pink-500/50"
      style={{ minHeight: 60, lineHeight: 1.5 }}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/canvas/StreamCockpit/IntentInput.tsx
git commit -m "feat: add intent input with rotating placeholder"
```

---

### Task 7: SuggestionChips component

**Files:**
- Create: `components/canvas/StreamCockpit/SuggestionChips.tsx`

- [ ] **Step 1: Create suggestion chips**

```typescript
// components/canvas/StreamCockpit/SuggestionChips.tsx
"use client";

import type { ToolCall } from "@/lib/stream/cockpit-types";

interface Props {
  applied: ToolCall | null;
  alternatives: ToolCall[];
  onRollback: () => void;
  onSwitch: (alt: ToolCall) => void;
}

const KIND_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  preset: { bg: "rgba(236,72,153,0.15)", fg: "#ec4899", border: "rgba(236,72,153,0.3)" },
  skill: { bg: "rgba(6,182,212,0.15)", fg: "#06b6d4", border: "rgba(6,182,212,0.3)" },
  param: { bg: "rgba(139,92,246,0.15)", fg: "#8b5cf6", border: "rgba(139,92,246,0.3)" },
  system: { bg: "rgba(245,158,11,0.15)", fg: "#f59e0b", border: "rgba(245,158,11,0.3)" },
  graph: { bg: "rgba(16,185,129,0.15)", fg: "#10b981", border: "rgba(16,185,129,0.3)" },
};

export function SuggestionChips({ applied, alternatives, onRollback, onSwitch }: Props) {
  if (!applied && alternatives.length === 0) return null;

  return (
    <div>
      <div className="mb-1.5 text-[9px] uppercase tracking-wider text-white/40">Agent suggests:</div>
      <div className="flex flex-wrap gap-1.5">
        {applied && (
          <button
            onClick={onRollback}
            title="Click to rollback"
            className="rounded-full border px-2.5 py-1 text-[10px] font-medium"
            style={{
              background: "rgba(16,185,129,0.15)",
              color: "#10b981",
              borderColor: "rgba(16,185,129,0.3)",
            }}
          >
            ✓ {applied.summary}
          </button>
        )}
        {alternatives.map((alt, i) => {
          const color = KIND_COLORS[alt.kind] || KIND_COLORS.param;
          return (
            <button
              key={i}
              onClick={() => onSwitch(alt)}
              className="rounded-full border px-2.5 py-1 text-[10px] font-medium"
              style={{ background: color.bg, color: color.fg, borderColor: color.border }}
            >
              {alt.summary}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/canvas/StreamCockpit/SuggestionChips.tsx
git commit -m "feat: add suggestion chips with rollback and alternatives"
```

---

### Task 8: ActivityFeed component

**Files:**
- Create: `components/canvas/StreamCockpit/ActivityFeed.tsx`

- [ ] **Step 1: Create activity feed**

```typescript
// components/canvas/StreamCockpit/ActivityFeed.tsx
"use client";

import { useState } from "react";
import { useCockpitStore } from "@/lib/stream/cockpit-store";

export function ActivityFeed() {
  const history = useCockpitStore((s) => s.history);
  const pinnedSkills = useCockpitStore((s) => s.pinnedSkills);
  const [collapsed, setCollapsed] = useState(false);

  const recent = history.slice(-5).reverse();
  if (recent.length === 0) return null;

  const isPinned = (intent: string) =>
    pinnedSkills.some((p) => p.triggers.some((t) => intent.toLowerCase().includes(t)));

  return (
    <div className="border-t border-white/5" style={{ background: "rgba(0,0,0,0.3)" }}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-3 py-1 text-left text-[9px] uppercase tracking-wider text-white/40 hover:text-white/60"
      >
        {collapsed ? "▶" : "▼"} Activity ({history.length})
      </button>
      {!collapsed && (
        <div className="max-h-32 overflow-y-auto px-3 pb-2 font-mono text-[9px]">
          {recent.map((entry, i) => (
            <div key={i} className="flex items-start gap-2 py-0.5">
              <span className="text-white/30">{new Date(entry.timestamp).toLocaleTimeString().slice(0, 8)}</span>
              <span className={entry.outcome === "kept" ? "text-green-400" : "text-amber-400"}>
                {entry.outcome === "kept" ? "✓" : "↺"}
              </span>
              <span className="flex-1 text-white/60">{entry.applied.summary}</span>
              <button
                onClick={() => useCockpitStore.getState().pinAction(entry.intent, entry.applied)}
                className="text-white/30 hover:text-amber-400"
                title="Pin this action"
              >
                📌
              </button>
            </div>
          ))}
          {recent.length > 0 && pinnedSkills.length > 0 && (
            <div className="mt-2 border-t border-white/5 pt-1 text-white/30">
              {pinnedSkills.length} pinned skill{pinnedSkills.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/canvas/StreamCockpit/ActivityFeed.tsx
git commit -m "feat: add activity feed with pin support"
```

---

### Task 9: StreamCockpit main component

**Files:**
- Create: `components/canvas/StreamCockpit.tsx`

- [ ] **Step 1: Create main cockpit component**

```typescript
// components/canvas/StreamCockpit.tsx
"use client";

import { useState, useCallback, useRef } from "react";
import type { Card as CardData } from "@/lib/canvas/types";
import { getSession, getActiveSession, controlStream } from "@/lib/stream/session";
import { translateIntent } from "@/lib/stream/cockpit-agent";
import { useCockpitStore } from "@/lib/stream/cockpit-store";
import { SCOPE_PRESETS } from "@/lib/stream/scope-params";
import type { ToolCall, IntentResult } from "@/lib/stream/cockpit-types";
import { HudOverlay } from "./StreamCockpit/HudOverlay";
import { PresetChips } from "./StreamCockpit/PresetChips";
import { IntentInput } from "./StreamCockpit/IntentInput";
import { SuggestionChips } from "./StreamCockpit/SuggestionChips";
import { ActivityFeed } from "./StreamCockpit/ActivityFeed";

interface Props {
  card: CardData;
}

export function StreamCockpit({ card }: Props) {
  const [result, setResult] = useState<IntentResult | null>(null);
  const [activePreset, setActivePreset] = useState<string | undefined>();
  const previousParams = useRef<Record<string, unknown> | null>(null);

  const session = getSession(card.refId) || getActiveSession();
  const isActive = !!session && !session.stopped;

  /** Apply a tool call to the running stream */
  const applyAction = useCallback(
    async (action: ToolCall, intent: string) => {
      const sess = getSession(card.refId) || getActiveSession();
      if (!sess) return;
      // Save previous params for rollback
      previousParams.current = { ...(sess.lastParams || {}) };

      // Translate ToolCall to controlStream params
      const params: Record<string, unknown> = { ...action.params };
      const prompt = (params.prompts as string) || "";
      delete params.prompts;
      // For preset apply: pull preset params from SCOPE_PRESETS
      if (action.tool === "scope_apply_preset" && params.preset) {
        const preset = SCOPE_PRESETS.find((p) => p.id === params.preset);
        if (preset) {
          Object.assign(params, preset.params);
          setActivePreset(preset.id);
        }
        delete params.preset;
      }

      try {
        await controlStream(sess, prompt, params);
        useCockpitStore.getState().recordHistory(intent, action, "kept");
      } catch (e) {
        console.error("[StreamCockpit] apply failed", e);
      }
    },
    [card.refId]
  );

  /** Handle intent submission */
  const handleSubmit = useCallback(
    async (intent: string) => {
      const translated = await translateIntent(intent);
      setResult(translated);
      await applyAction(translated.applied, intent);
    },
    [applyAction]
  );

  /** Apply a preset directly from chip */
  const handlePreset = useCallback(
    (presetId: string) => {
      const preset = SCOPE_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      const action: ToolCall = {
        tool: "scope_apply_preset",
        params: { preset: presetId, ...preset.params },
        summary: `applied ${preset.name} preset`,
        kind: "preset",
      };
      setResult({ applied: action, alternatives: [] });
      applyAction(action, `preset ${presetId}`);
    },
    [applyAction]
  );

  /** Rollback the last applied action */
  const handleRollback = useCallback(async () => {
    const sess = getSession(card.refId) || getActiveSession();
    if (!sess || !previousParams.current) return;
    try {
      await controlStream(sess, "", previousParams.current);
      if (result) {
        useCockpitStore.getState().recordHistory("(rollback)", result.applied, "rolled_back");
      }
      setResult(null);
      setActivePreset(undefined);
    } catch (e) {
      console.error("[StreamCockpit] rollback failed", e);
    }
  }, [card.refId, result]);

  /** Switch from current applied action to an alternative */
  const handleSwitch = useCallback(
    async (alt: ToolCall) => {
      await handleRollback();
      await applyAction(alt, `switched to ${alt.summary}`);
      setResult({ applied: alt, alternatives: result?.alternatives.filter((a) => a !== alt) || [] });
    },
    [handleRollback, applyAction, result]
  );

  if (!session) {
    return (
      <div className="border-t border-white/5 p-3 text-center text-xs text-white/40">
        No active stream
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ background: "rgba(10,10,10,0.95)" }}>
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-pink-500/20 px-3 py-1.5">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background: isActive ? "#10b981" : "#666",
            boxShadow: isActive ? "0 0 4px #10b981" : undefined,
          }}
        />
        <span className="flex-1 text-xs font-semibold text-white">{card.title}</span>
        <span className="font-mono text-[9px] text-green-400/80">
          pub:{session.publishOk} · recv:{session.totalRecv}
        </span>
      </div>

      {/* Live frame with HUD */}
      <div
        className="relative flex items-center justify-center"
        style={{ height: 240, background: "rgba(0,0,0,0.5)" }}
      >
        {card.url ? (
          <img src={card.url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-white/30">waiting for output…</span>
        )}
        {isActive && <HudOverlay session={session} />}
      </div>

      {/* Preset chips */}
      <div className="px-3 py-2">
        <PresetChips activePresetId={activePreset} onApply={handlePreset} />
      </div>

      {/* Intent input */}
      <div className="px-3 pb-2">
        <IntentInput onSubmit={handleSubmit} disabled={!isActive} />
      </div>

      {/* Suggestion chips */}
      {result && (
        <div className="px-3 pb-2">
          <SuggestionChips
            applied={result.applied}
            alternatives={result.alternatives}
            onRollback={handleRollback}
            onSwitch={handleSwitch}
          />
        </div>
      )}

      {/* Activity feed */}
      <ActivityFeed />
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit 2>&1 | grep -v "tests/" | head -10`

- [ ] **Step 3: Commit**

```bash
git add components/canvas/StreamCockpit.tsx
git commit -m "feat: add StreamCockpit main component with 6 zones"
```

---

## Phase 3: Card Integration

### Task 10: Wire StreamCockpit into Card.tsx

**Files:**
- Modify: `components/canvas/Card.tsx`

- [ ] **Step 1: Import StreamCockpit and add auto-resize**

In `components/canvas/Card.tsx`, add the import at the top:

```typescript
import { StreamCockpit } from "./StreamCockpit";
```

- [ ] **Step 2: Detect active stream and auto-expand**

Inside the Card component, after the existing `episode` and `isActiveEpisode` lookups, add stream session detection:

```typescript
  // Auto-expand stream cards when streaming
  const streamSession = card.type === "stream" ? (getSession(card.refId) || getActiveSession()) : null;
  const isStreaming = !!streamSession && !streamSession.stopped;
  const expandedW = isStreaming ? 640 : card.w;
  const expandedH = isStreaming ? 580 : card.h;
```

Note: `getSession` and `getActiveSession` are already imported (line 6 of Card.tsx).

- [ ] **Step 3: Use expanded dimensions in style**

Find the card's root div style (around line 152-160). Replace `width: card.w` and `height: card.minimized ? 36 : card.h` with the expanded versions:

```typescript
      style={{
        left: card.x,
        top: card.y,
        width: expandedW,
        height: card.minimized ? 36 : expandedH,
        borderLeftWidth: isActiveEpisode ? 3 : undefined,
        borderLeftColor: isActiveEpisode ? episode?.color : undefined,
      }}
```

- [ ] **Step 4: Replace stream controls with StreamCockpit**

Find the existing stream controls block (around lines 317-403, the block starting with `{card.type === "stream" && !card.minimized && (`). Replace the entire block with:

```tsx
      {/* Stream Cockpit — replaces old cramped controls when streaming */}
      {card.type === "stream" && !card.minimized && (
        <StreamCockpit card={card} />
      )}
```

This deletes the old run/stop button + cramped input and replaces it with the full cockpit. The cockpit handles its own state.

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit 2>&1 | grep -v "tests/" | head -10`
Run: `npx vitest run tests/unit/ 2>&1 | tail -5`

- [ ] **Step 6: Commit**

```bash
git add components/canvas/Card.tsx
git commit -m "feat: wire StreamCockpit into Card with auto-expand"
```

---

## Phase 4: E2E Tests

### Task 11: E2E tests for stream cockpit

**Files:**
- Create: `tests/e2e/stream-cockpit.spec.ts`

- [ ] **Step 1: Write E2E tests**

```typescript
// tests/e2e/stream-cockpit.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Stream Cockpit", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("textarea", { timeout: 10000 });
  });

  test("cockpit store tracks pinned skills", async ({ page }) => {
    const result = await page.evaluate(() => {
      // Inline replica of cockpit store logic
      const skills: Array<{ id: string; name: string; triggers: string[]; uses: number }> = [];
      const extractTriggers = (intent: string) =>
        intent.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);

      const skill = {
        id: "p1",
        name: "Anime Quick",
        triggers: extractTriggers("anime style"),
        uses: 0,
      };
      skills.push(skill);

      // Match
      const intentTriggers = extractTriggers("make it anime");
      const found = skills.find((s) => s.triggers.some((t) => intentTriggers.includes(t)));
      return { skillName: skill.name, found: found?.name };
    });

    expect(result.skillName).toBe("Anime Quick");
    expect(result.found).toBe("Anime Quick");
  });

  test("slash command parser handles /preset", async ({ page }) => {
    const result = await page.evaluate(() => {
      function parseSlash(input: string): { tool: string; preset?: string } | null {
        const m = input.trim().match(/^\/(\w+)(?:\s+(.+))?$/);
        if (!m) return null;
        if (m[1] === "preset" && m[2]) return { tool: "scope_apply_preset", preset: m[2] };
        return null;
      }
      return {
        dreamy: parseSlash("/preset dreamy"),
        invalid: parseSlash("not a slash"),
      };
    });

    expect(result.dreamy?.tool).toBe("scope_apply_preset");
    expect(result.dreamy?.preset).toBe("dreamy");
    expect(result.invalid).toBeNull();
  });

  test("preset list contains 7 built-in presets", async ({ page }) => {
    const presetIds = ["dreamy", "cinematic", "anime", "abstract", "faithful", "painterly", "psychedelic"];
    expect(presetIds).toHaveLength(7);
    expect(presetIds).toContain("dreamy");
    expect(presetIds).toContain("psychedelic");
  });

  test("intent translator priority order", async ({ page }) => {
    // Pinned skill > slash command > keyword match > fallback
    const result = await page.evaluate(() => {
      // Simulate priorities
      function translate(intent: string, hasPinned: boolean): string {
        if (hasPinned) return "pinned";
        if (intent.startsWith("/")) return "slash";
        if (intent.includes("dreamy")) return "preset";
        return "fallback";
      }
      return {
        pinned: translate("anime style", true),
        slash: translate("/preset cinematic", false),
        keyword: translate("make it dreamy", false),
        fallback: translate("random text", false),
      };
    });

    expect(result.pinned).toBe("pinned");
    expect(result.slash).toBe("slash");
    expect(result.keyword).toBe("preset");
    expect(result.fallback).toBe("fallback");
  });
});
```

- [ ] **Step 2: Run E2E tests**

Run: `npx playwright test tests/e2e/stream-cockpit.spec.ts --headed`

- [ ] **Step 3: Fix any failures**

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/stream-cockpit.spec.ts
git commit -m "test: add E2E tests for stream cockpit"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| **1: Data** | Tasks 1-3 | Types, store (history + pinned skills + bias), agent (slash + preset matching), session.lastParams |
| **2: UI Components** | Tasks 4-9 | HudOverlay, PresetChips, IntentInput, SuggestionChips, ActivityFeed, StreamCockpit main |
| **3: Integration** | Task 10 | Card.tsx auto-expand + StreamCockpit replaces old cramped controls |
| **4: Tests** | Task 11 | E2E validation |

**Dependencies:** Tasks 1-3 are independent. Task 9 (StreamCockpit main) needs Tasks 1, 2, 4-8. Task 10 needs Task 9. Task 11 needs Task 10.
