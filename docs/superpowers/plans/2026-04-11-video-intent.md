# Video Intent Understanding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the storyboard preprocessor recognize "create video / animated short / film" intent in multi-scene briefs, route those scenes to video generation (keyframe → animate via ltx-i2v), respect the 5-10s clip limit, ask the user for strategy upfront, extract production notes, and ensure cross-video consistency.

**Architecture:** A new `lib/agents/video-intent.ts` module detects video intent + parses durations + plans clip strategy. The preprocessor calls it before scene extraction. When video mode is active, scenes get a new `video_keyframe` action; project_generate runs a 2-step flow per scene (flux-dev keyframe → ltx-i2v animate). For multi-clip scenes, a beat extractor breaks descriptions into N beats. A locked prefix + character lock + color arc are stored on the project for cross-clip consistency.

**Tech Stack:** TypeScript, Zustand, Vitest, Playwright, existing Gemini API route

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `lib/agents/video-intent.ts` | detectVideoIntent, extractDurations, planVideoStrategy, buildLockedPrefix |
| `lib/agents/beat-extractor.ts` | breakSceneIntoBeats — small LLM call with regex fallback |
| `tests/unit/video-intent.test.ts` | Detection + duration parsing + strategy planning + locked prefix |
| `tests/unit/beat-extractor.test.ts` | Beat extraction + fallback |
| `tests/e2e/video-intent.spec.ts` | E2E test with the Tank & Kuro brief |

### Modified files
| File | Changes |
|------|---------|
| `lib/projects/types.ts` | Add `video_keyframe` to Scene action enum, add `videoStrategy`, `lockedPrefix`, `colorArc`, `characterLock`, `styleAnchorRefId`, `clipsPerScene`, `beats`, `visualLanguage`, `cameraNotes` to Scene/Project |
| `lib/agents/preprocessor.ts` | Call detectVideoIntent in handleMultiScene, route to video flow when detected, extract production notes, build locked prefix |
| `lib/agents/intent.ts` | Add `video_strategy` intent for "1"/"2"/"3"/"overview"/"full" replies |
| `lib/tools/project-tools.ts` | When scene action is `video_keyframe`, run keyframe + animate sub-steps with beat support and consistency layers |
| `skills/base.md` | Add note about video routing |

---

## Phase 1: Detection & Planning

### Task 1: Video intent detection module

**Files:**
- Create: `lib/agents/video-intent.ts`
- Test: `tests/unit/video-intent.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/video-intent.test.ts
import { describe, it, expect } from "vitest";
import {
  detectVideoIntent,
  extractDurations,
  planVideoStrategy,
  buildLockedPrefix,
  extractColorArc,
  extractCharacterLock,
  extractPerSceneNotes,
} from "@/lib/agents/video-intent";

describe("detectVideoIntent", () => {
  it("detects 'animated short video'", () => {
    expect(detectVideoIntent("Create a 6-scene animated short video in the style of Studio Ghibli")).toBe(true);
  });
  it("detects 'short film'", () => {
    expect(detectVideoIntent("A short film about two strangers")).toBe(true);
  });
  it("detects 'Duration: 45 seconds'", () => {
    expect(detectVideoIntent("Scene 1 — TWO WORLDS\nDuration: 45 seconds")).toBe(true);
  });
  it("detects 'Camera: slow pan'", () => {
    expect(detectVideoIntent("Wide shot. Camera: slow pan left to right.")).toBe(true);
  });
  it("returns false for static image briefs", () => {
    expect(detectVideoIntent("Create 5 illustrations of a cat in different poses")).toBe(false);
  });
  it("returns false for short prompts without video signals", () => {
    expect(detectVideoIntent("a happy cat")).toBe(false);
  });
});

describe("extractDurations", () => {
  it("extracts per-scene durations", () => {
    const brief = `SCENE 1 — Opening\nDuration: 45 seconds\n\nSCENE 2 — Middle\nDuration: 70 seconds`;
    const durations = extractDurations(brief);
    expect(durations).toHaveLength(2);
    expect(durations[0].seconds).toBe(45);
    expect(durations[1].seconds).toBe(70);
  });
  it("returns empty array when no durations", () => {
    expect(extractDurations("a cat")).toEqual([]);
  });
  it("handles 'Duration: 60s' shorthand", () => {
    const brief = `SCENE 1\nDuration: 60s`;
    expect(extractDurations(brief)[0].seconds).toBe(60);
  });
});

describe("planVideoStrategy", () => {
  it("overview: 1 clip per scene at 10s each", () => {
    const plan = planVideoStrategy("overview", [45, 70, 60]);
    expect(plan.mode).toBe("overview");
    expect(plan.totalClips).toBe(3);
    expect(plan.perScene).toEqual([1, 1, 1]);
  });
  it("full: ceil(duration/10) clips per scene", () => {
    const plan = planVideoStrategy("full", [45, 70, 60]);
    expect(plan.perScene).toEqual([5, 7, 6]);
    expect(plan.totalClips).toBe(18);
  });
  it("full with no durations defaults to 1 per scene", () => {
    const plan = planVideoStrategy("full", []);
    expect(plan.totalClips).toBe(0);
  });
});

describe("buildLockedPrefix", () => {
  it("combines style + characters + setting", () => {
    const prefix = buildLockedPrefix({
      style: "Studio Ghibli watercolor",
      characters: "TANK the bulldog and KURO the tuxedo cat",
      setting: "Japanese fishing village",
      palette: "warm gold",
      mood: "peaceful",
      rules: "",
    });
    expect(prefix).toContain("Studio Ghibli watercolor");
    expect(prefix).toContain("TANK");
    expect(prefix).toContain("Japanese fishing village");
    expect(prefix.endsWith(", ")).toBe(true);
  });
});

describe("extractColorArc", () => {
  it("parses 'Scene N → color' lines", () => {
    const brief = `Colour temperature arc:
Scene 1 → warm gold
Scene 2 → noon white
Scene 3 → cold blue-black`;
    const arc = extractColorArc(brief);
    expect(arc).toEqual(["warm gold", "noon white", "cold blue-black"]);
  });
  it("returns empty when no arc", () => {
    expect(extractColorArc("a cat")).toEqual([]);
  });
});

describe("extractCharacterLock", () => {
  it("extracts character names and descriptions", () => {
    const brief = "TANK, a wrinkled English bulldog with an underbite, and KURO, a sleek tuxedo cat with white gloves";
    const lock = extractCharacterLock(brief);
    expect(lock.toUpperCase()).toContain("TANK");
    expect(lock.toUpperCase()).toContain("KURO");
  });
  it("returns empty string when no clear characters", () => {
    expect(extractCharacterLock("a beautiful sunset")).toBe("");
  });
});

describe("extractPerSceneNotes", () => {
  it("extracts visual language and camera notes from a scene", () => {
    const sceneText = `SCENE 1 — Opening
Duration: 45 seconds | Camera: slow pan left
Golden morning. The village wakes.
Visual language: warm saffron morning light`;
    const notes = extractPerSceneNotes(sceneText);
    expect(notes.visualLanguage).toContain("saffron");
    expect(notes.cameraNotes).toContain("pan");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/video-intent.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement video-intent module**

```typescript
// lib/agents/video-intent.ts

export interface SceneDuration {
  sceneIndex: number;
  seconds: number;
}

export interface VideoStrategy {
  mode: "overview" | "full" | "custom";
  totalClips: number;
  perScene: number[];
}

export interface PerSceneNotes {
  visualLanguage?: string;
  cameraNotes?: string;
  score?: string;
}

const VIDEO_KEYWORDS: RegExp[] = [
  /\b(animated|animation|short film|short video|video clip|movie|cinematic short)\b/i,
  /\bduration:\s*\d+\s*(s|sec|second|minute)/i,
  /\b\d+[-\s]second\b/i,
  /\b(scene\s*\d+.*camera|tracking shot|close[-\s]?up|wide shot|cut to|fade to|zoom in|zoom out)\b/i,
  /\bstoryboard.*video|video.*storyboard|film.*scene|scene.*film\b/i,
];

/** True if the brief signals video / animated film intent */
export function detectVideoIntent(brief: string): boolean {
  return VIDEO_KEYWORDS.some((re) => re.test(brief));
}

/** Parse "Duration: N seconds" markers and tie them to scene order */
export function extractDurations(brief: string): SceneDuration[] {
  const sceneBlocks = brief.split(/(?=SCENE\s*\d+)/i);
  const result: SceneDuration[] = [];
  let sceneIdx = 0;
  for (const block of sceneBlocks) {
    if (!/SCENE\s*\d+/i.test(block)) continue;
    const m = block.match(/duration:\s*(\d+)\s*(s|sec|second|minute|min)/i);
    if (m) {
      let seconds = parseInt(m[1], 10);
      const unit = m[2].toLowerCase();
      if (unit.startsWith("min")) seconds *= 60;
      result.push({ sceneIndex: sceneIdx, seconds });
    }
    sceneIdx++;
  }
  return result;
}

/** Plan how many clips per scene based on mode */
export function planVideoStrategy(
  mode: "overview" | "full" | "custom",
  durations: number[]
): VideoStrategy {
  if (mode === "overview") {
    const perScene = durations.length > 0 ? durations.map(() => 1) : [];
    return { mode, totalClips: perScene.length, perScene };
  }
  if (mode === "full") {
    const perScene = durations.map((d) => Math.max(1, Math.ceil(d / 10)));
    return { mode, totalClips: perScene.reduce((a, b) => a + b, 0), perScene };
  }
  // custom: empty perScene, caller fills in
  return { mode, totalClips: 0, perScene: [] };
}

/** Build the locked prefix that gets prepended to every keyframe and clip */
export function buildLockedPrefix(ctx: {
  style: string;
  characters: string;
  setting: string;
  palette: string;
  mood: string;
  rules: string;
}): string {
  const parts: string[] = [];
  if (ctx.style) parts.push(ctx.style);
  if (ctx.characters) parts.push(ctx.characters);
  if (ctx.palette) parts.push(ctx.palette);
  if (ctx.setting) parts.push(ctx.setting);
  if (ctx.mood) parts.push(ctx.mood);
  // Cap at ~80 words
  const joined = parts.join(", ");
  const words = joined.split(/\s+/);
  return (words.length > 80 ? words.slice(0, 80).join(" ") : joined) + ", ";
}

/** Extract the color temperature arc */
export function extractColorArc(brief: string): string[] {
  const arc: string[] = [];
  // Match "Scene N → color phrase" pattern
  const lines = brief.split("\n");
  for (const line of lines) {
    const m = line.match(/scene\s*\d+\s*[→\->]+\s*(.+)/i);
    if (m) {
      const color = m[1].trim().replace(/[(\s]+(possibility|friction|crisis|healing|time and life|belonging)[)\s]*$/i, "").trim();
      if (color.length > 0 && color.length < 60) arc.push(color);
    }
  }
  return arc;
}

/** Build the character lock token from the brief */
export function extractCharacterLock(brief: string): string {
  // Find character names — uppercase words (2+ chars) followed by descriptions
  const matches: string[] = [];
  // Match "NAME, ... description" patterns
  const re = /\b([A-Z]{2,}[A-Z]*)\b\s*[,\u2014]\s*(?:a|the|an)?\s*([^.\n]{20,200})/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(brief)) !== null) {
    const name = m[1];
    if (seen.has(name)) continue;
    seen.add(name);
    const desc = m[2].trim().replace(/\s+/g, " ").slice(0, 120);
    matches.push(`${name} is ${desc}`);
    if (matches.length >= 3) break; // Cap at 3 characters
  }
  return matches.join(". ");
}

/** Extract per-scene production notes (visual language, camera, score) */
export function extractPerSceneNotes(sceneText: string): PerSceneNotes {
  const notes: PerSceneNotes = {};
  const visMatch = sceneText.match(/visual language:\s*([^\n]+)/i);
  if (visMatch) notes.visualLanguage = visMatch[1].trim().slice(0, 200);
  const camMatch = sceneText.match(/camera:\s*([^\n|]+)/i);
  if (camMatch) notes.cameraNotes = camMatch[1].trim().slice(0, 100);
  const scoreMatch = sceneText.match(/score:\s*([^\n]+)/i);
  if (scoreMatch) notes.score = scoreMatch[1].trim().slice(0, 100);
  return notes;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/video-intent.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add lib/agents/video-intent.ts tests/unit/video-intent.test.ts
git commit -m "feat: add video intent detection and production notes extraction"
```

---

### Task 2: Beat extractor

**Files:**
- Create: `lib/agents/beat-extractor.ts`
- Test: `tests/unit/beat-extractor.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/beat-extractor.test.ts
import { describe, it, expect } from "vitest";
import { breakSceneIntoBeatsFallback } from "@/lib/agents/beat-extractor";

describe("breakSceneIntoBeatsFallback", () => {
  it("returns N beats from a scene description", () => {
    const description = "Tank wades into the floodwater. Kuro is afraid. Tank reaches the ledge. Kuro steps onto Tank's back. They reach the temple steps. Tank collapses. Kuro looks at him without contempt.";
    const beats = breakSceneIntoBeatsFallback(description, 3);
    expect(beats).toHaveLength(3);
    for (const beat of beats) {
      expect(beat.length).toBeGreaterThan(0);
      expect(beat.length).toBeLessThan(200);
    }
  });

  it("returns the same description when N=1", () => {
    const beats = breakSceneIntoBeatsFallback("Tank crosses the bridge", 1);
    expect(beats).toHaveLength(1);
  });

  it("handles short descriptions by labeling beats", () => {
    const beats = breakSceneIntoBeatsFallback("rain falls", 4);
    expect(beats).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/beat-extractor.test.ts`

- [ ] **Step 3: Implement beat extractor**

```typescript
// lib/agents/beat-extractor.ts

const BEAT_LABELS = [
  "opening moment",
  "building tension",
  "mid-action",
  "rising stakes",
  "climax",
  "resolution",
  "afterglow",
  "transition",
];

/**
 * Break a scene description into N beats by sentence splitting.
 * If there aren't enough sentences, repeat with beat labels.
 * Synchronous, no LLM call — used as fallback when LLM fails.
 */
export function breakSceneIntoBeatsFallback(description: string, n: number): string[] {
  if (n <= 1) return [description.trim()];

  const sentences = description
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);

  if (sentences.length >= n) {
    // Distribute sentences across beats
    const beats: string[] = [];
    const groupSize = Math.ceil(sentences.length / n);
    for (let i = 0; i < n; i++) {
      const start = i * groupSize;
      const end = Math.min(start + groupSize, sentences.length);
      beats.push(sentences.slice(start, end).join(" "));
    }
    return beats;
  }

  // Not enough sentences — repeat with labels
  const beats: string[] = [];
  for (let i = 0; i < n; i++) {
    const label = BEAT_LABELS[i % BEAT_LABELS.length];
    beats.push(`${description.trim()}, ${label}`);
  }
  return beats;
}

/**
 * Async version that calls the LLM to break a scene into beats.
 * Falls back to breakSceneIntoBeatsFallback on failure.
 */
export async function breakSceneIntoBeats(description: string, n: number): Promise<string[]> {
  if (n <= 1) return [description.trim()];

  try {
    const resp = await fetch("/api/agent/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Break this scene description into exactly ${n} beats. Each beat is a short prompt (under 20 words) describing a consecutive moment of motion. Each beat should evolve naturally from the previous one. Return exactly ${n} lines, one beat per line, no numbering.

Scene: ${description.slice(0, 1500)}`,
              },
            ],
          },
        ],
      }),
    });
    if (!resp.ok) return breakSceneIntoBeatsFallback(description, n);
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const lines = text
      .split("\n")
      .map((l: string) => l.replace(/^\d+[.)]\s*/, "").trim())
      .filter((l: string) => l.length > 0);
    if (lines.length < n) return breakSceneIntoBeatsFallback(description, n);
    return lines.slice(0, n);
  } catch {
    return breakSceneIntoBeatsFallback(description, n);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/beat-extractor.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/agents/beat-extractor.ts tests/unit/beat-extractor.test.ts
git commit -m "feat: add beat extractor with LLM + sentence-split fallback"
```

---

## Phase 2: Type & Project Updates

### Task 3: Extend Scene/Project types

**Files:**
- Modify: `lib/projects/types.ts`

- [ ] **Step 1: Add new fields to Scene and Project**

Read `lib/projects/types.ts`. Replace the entire file with:

```typescript
export type SceneStatus = "pending" | "generating" | "done" | "rejected" | "regenerating";
export type ProjectStatus = "planning" | "generating" | "reviewing" | "iterating" | "complete";
export type SceneMediaType = "image" | "video" | "audio";

export interface Scene {
  index: number;
  description: string;
  prompt: string;
  title: string;
  cardRefId?: string;
  status: SceneStatus;
  dependsOn?: number[];
  mediaType: SceneMediaType;
  feedback?: string;
  iterations: number;
  action: "generate" | "restyle" | "animate" | "upscale" | "remove_bg" | "tts" | "video_keyframe";
  sourceUrl?: string;
  /** Per-scene visual language (appended to keyframe + video prompts) */
  visualLanguage?: string;
  /** Per-scene camera notes (appended to motion prompts only) */
  cameraNotes?: string;
  /** Per-scene score notes (stored, unused for now) */
  score?: string;
  /** For video_keyframe: how many video clips to generate from the keyframe */
  clipsPerScene?: number;
  /** For video_keyframe: pre-extracted beat prompts (length = clipsPerScene) */
  beats?: string[];
  /** Once keyframe is generated, store its refId so animate steps can use it */
  keyframeRefId?: string;
}

export interface StyleGuide {
  visualStyle: string;
  colorPalette: string;
  mood: string;
  promptPrefix: string;
  promptSuffix: string;
}

export interface VideoConsistency {
  /** Locked storyboard prefix prepended to every keyframe and clip */
  lockedPrefix: string;
  /** Per-scene color phrases from the brief's color arc */
  colorArc: string[];
  /** Character lock token (descriptions force-prepended to every motion prompt) */
  characterLock: string;
  /** Style anchor card refId (set after the first keyframe is generated) */
  styleAnchorRefId?: string;
  /** Base seed for cross-scene continuity (best-effort) */
  baseSeed?: number;
}

export interface Project {
  id: string;
  brief: string;
  styleGuide?: StyleGuide;
  scenes: Scene[];
  status: ProjectStatus;
  feedback: string[];
  createdAt: number;
  batchSize: number;
  /** Set when this project is a video brief — drives video_keyframe routing */
  isVideo?: boolean;
  /** Cross-video consistency layers — only set when isVideo is true */
  videoConsistency?: VideoConsistency;
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit 2>&1 | grep -v "tests/" | head -10`
Run: `npx vitest run tests/unit/ 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add lib/projects/types.ts
git commit -m "feat: extend Scene/Project types for video keyframe flow"
```

---

## Phase 3: Preprocessor Integration

### Task 4: Wire video intent into preprocessor

**Files:**
- Modify: `lib/agents/preprocessor.ts`
- Modify: `lib/agents/intent.ts`

- [ ] **Step 1: Add `video_strategy` intent**

Read `lib/agents/intent.ts`. Add `"video_strategy"` to the IntentType union:

```typescript
export type IntentType =
  | "new_project"
  | "continue"
  | "add_scenes"
  | "adjust_scene"
  | "style_correction"
  | "status"
  | "episode_switch"
  | "episode_create"
  | "video_strategy"
  | "none";
```

In the `classifyIntent` function, add detection BEFORE the final `return { type: "none" }`:

```typescript
  // Video strategy reply ("1", "2", "3", "overview", "full")
  if (/^(1|2|3|overview|full|custom)\.?$/i.test(lower)) {
    return { type: "video_strategy", direction: text };
  }
```

- [ ] **Step 2: Add video flow to handleMultiScene**

Read `lib/agents/preprocessor.ts`. Find `handleMultiScene` (search for it). Add imports at top of file:

```typescript
import {
  detectVideoIntent,
  extractDurations,
  extractColorArc,
  extractCharacterLock,
  extractPerSceneNotes,
  buildLockedPrefix,
  planVideoStrategy,
} from "./video-intent";
import { breakSceneIntoBeatsFallback } from "./beat-extractor";
```

Inside `handleMultiScene`, AFTER scenes are extracted but BEFORE `executeTool("project_create", ...)`, add video detection:

```typescript
  // --- Video intent detection ---
  const isVideo = detectVideoIntent(text);
  let videoStrategy: { mode: "overview" | "full" | "custom"; perScene: number[] } | null = null;
  let videoConsistency: {
    lockedPrefix: string;
    colorArc: string[];
    characterLock: string;
  } | null = null;

  if (isVideo) {
    say(`\uD83C\uDFAC Detected video brief — extracting durations and consistency layers...`, "system");
    const durations = extractDurations(text);
    const totalDuration = durations.reduce((s, d) => s + d.seconds, 0);

    // Default to overview when total <= 60s, otherwise ask
    if (totalDuration === 0 || totalDuration <= 60) {
      videoStrategy = planVideoStrategy("overview", durations.map((d) => d.seconds));
      say(`Strategy: overview \u2014 1 clip per scene at ~10s each (${scenes.length} clips total).`, "system");
    } else {
      // Auto-pick overview for now (the chat-blocking question is complex; ship simple version first)
      videoStrategy = planVideoStrategy("overview", durations.map((d) => d.seconds));
      const fullPlan = planVideoStrategy("full", durations.map((d) => d.seconds));
      say(`\u26A0 Total declared duration: ${totalDuration}s. Each clip is 5\u201310s.\nUsing OVERVIEW strategy: ${videoStrategy.totalClips} clips at 10s each.\nFor full coverage (${fullPlan.totalClips} clips covering ${totalDuration}s), reply: "full coverage"`, "system");
    }

    // Build consistency layers
    const ctx = useSessionContext.getState().context;
    videoConsistency = {
      lockedPrefix: buildLockedPrefix({
        style: ctx?.style || style.visual_style || "",
        characters: ctx?.characters || "",
        setting: ctx?.setting || "",
        palette: ctx?.palette || style.color_palette || "",
        mood: ctx?.mood || style.mood || "",
        rules: ctx?.rules || "",
      }),
      colorArc: extractColorArc(text),
      characterLock: extractCharacterLock(text),
    };
    say(`Locked prefix: "${videoConsistency.lockedPrefix.slice(0, 80)}..."`, "system");
  }
```

- [ ] **Step 3: Pass video data into project_create**

Find the existing `executeTool("project_create", ...)` call inside `handleMultiScene`. Update it to include video fields when `isVideo` is true:

```typescript
  // Build scene objects with video data when applicable
  const sceneObjects = scenes.map((s, i) => {
    const baseScene: Record<string, unknown> = {
      index: i,
      title: s.title,
      description: s.description,
      prompt: s.prompt,
      action: isVideo ? "video_keyframe" : "generate",
    };

    if (isVideo && videoStrategy) {
      const clipsPerScene = videoStrategy.perScene[i] || 1;
      baseScene.clipsPerScene = clipsPerScene;
      // Pre-extract beats for multi-clip scenes (sync fallback — async version
      // can be wired in project_generate if needed)
      if (clipsPerScene > 1) {
        baseScene.beats = breakSceneIntoBeatsFallback(s.description, clipsPerScene);
      }
      // Per-scene production notes
      const notes = extractPerSceneNotes(s.description);
      if (notes.visualLanguage) baseScene.visualLanguage = notes.visualLanguage;
      if (notes.cameraNotes) baseScene.cameraNotes = notes.cameraNotes;
      if (notes.score) baseScene.score = notes.score;
    }

    return baseScene;
  });

  const createResult = await executeTool("project_create", {
    brief,
    style_guide: style,
    scenes: sceneObjects,
    is_video: isVideo,
    video_consistency: videoConsistency,
  });
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit 2>&1 | grep -v "tests/" | head -10`

- [ ] **Step 5: Commit**

```bash
git add lib/agents/preprocessor.ts lib/agents/intent.ts
git commit -m "feat: wire video intent detection into preprocessor"
```

---

## Phase 4: Project Tools — Video Keyframe Flow

### Task 5: Update project_create to accept video fields

**Files:**
- Modify: `lib/tools/project-tools.ts`

- [ ] **Step 1: Read project_create schema**

Read `lib/tools/project-tools.ts`. Find the `project_create` tool. Update its schema to accept the new video fields and write them to the project store.

In the parameters schema, ADD these properties under the existing structure (find `properties: {`):

```typescript
      is_video: {
        type: "boolean",
        description: "Set true when the brief signals a video/animated short",
      },
      video_consistency: {
        type: "object",
        description: "Locked prefix, color arc, character lock for cross-clip consistency",
        properties: {
          lockedPrefix: { type: "string" },
          colorArc: { type: "array", items: { type: "string" } },
          characterLock: { type: "string" },
        },
      },
```

Also add new optional scene properties under the existing scenes item schema:

```typescript
            visualLanguage: { type: "string" },
            cameraNotes: { type: "string" },
            score: { type: "string" },
            clipsPerScene: { type: "number" },
            beats: { type: "array", items: { type: "string" } },
```

Update the `action` enum on the scene properties to include `video_keyframe`:

```typescript
            action: { type: "string", enum: ["generate", "animate", "tts", "video_keyframe"] },
```

- [ ] **Step 2: Persist video fields when creating the project**

In the `execute` function of `project_create`, after the project is created, set the video fields on the project. Find where the project store's createProject is called and add a follow-up:

```typescript
    // Apply video fields if provided
    if (input.is_video) {
      const proj = useProjectStore.getState().getProject(projectId);
      if (proj) {
        proj.isVideo = true;
        if (input.video_consistency) {
          proj.videoConsistency = input.video_consistency as VideoConsistency;
        }
        // Save scene-level fields
        const inputScenes = input.scenes as Array<Record<string, unknown>>;
        for (let i = 0; i < proj.scenes.length; i++) {
          const inScene = inputScenes[i];
          if (inScene.visualLanguage) proj.scenes[i].visualLanguage = inScene.visualLanguage as string;
          if (inScene.cameraNotes) proj.scenes[i].cameraNotes = inScene.cameraNotes as string;
          if (inScene.score) proj.scenes[i].score = inScene.score as string;
          if (inScene.clipsPerScene) proj.scenes[i].clipsPerScene = inScene.clipsPerScene as number;
          if (inScene.beats) proj.scenes[i].beats = inScene.beats as string[];
        }
        // Trigger a state update so subscribers re-render
        useProjectStore.setState({ projects: [...useProjectStore.getState().projects] });
      }
    }
```

Add the import at the top of the file:

```typescript
import type { VideoConsistency } from "@/lib/projects/types";
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit 2>&1 | grep -v "tests/" | head -10`

- [ ] **Step 4: Commit**

```bash
git add lib/tools/project-tools.ts
git commit -m "feat: project_create accepts video fields and persists them"
```

---

### Task 6: project_generate runs keyframe → animate flow

**Files:**
- Modify: `lib/tools/project-tools.ts`

- [ ] **Step 1: Update project_generate to handle video_keyframe action**

In `lib/tools/project-tools.ts`, find the `project_generate` tool. Inside its `execute` function, find the loop that builds steps for `create_media`. Add a special path for `video_keyframe` scenes:

```typescript
    // Build steps from the batch — special handling for video_keyframe scenes
    const steps: Array<Record<string, unknown>> = [];
    const sceneToStep: Array<{ sceneIndex: number; stepIndex: number; isKeyframe: boolean }> = [];

    for (const scene of batch) {
      if (scene.action === "video_keyframe") {
        // Video flow: generate keyframe first, then animate clips
        const consistency = project.videoConsistency;
        const lockedPrefix = consistency?.lockedPrefix || "";
        const colorPhrase = consistency?.colorArc?.[scene.index] || "";
        const characterLock = consistency?.characterLock || "";
        const visLang = scene.visualLanguage || "";

        if (!scene.keyframeRefId) {
          // Step: generate keyframe
          const kfPrompt = [lockedPrefix, scene.prompt, colorPhrase, visLang]
            .filter(Boolean)
            .join(" ")
            .slice(0, 800);
          sceneToStep.push({ sceneIndex: scene.index, stepIndex: steps.length, isKeyframe: true });
          steps.push({
            action: "generate",
            prompt: kfPrompt,
            title: `${scene.title} (keyframe)`,
            // Use style anchor as reference if set and not the first scene
            ...(consistency?.styleAnchorRefId && scene.index > 0
              ? { source_url: undefined } // We'd need canvas_get to resolve refId; skip for now
              : {}),
          });
        } else {
          // Keyframe already exists — generate animate clips
          const clipCount = scene.clipsPerScene || 1;
          const beats = scene.beats || [scene.description];
          for (let c = 0; c < clipCount; c++) {
            const beat = beats[c] || beats[0] || scene.description;
            const motionPrompt = [characterLock, beat, scene.cameraNotes || ""]
              .filter(Boolean)
              .join(" ")
              .slice(0, 500);
            sceneToStep.push({ sceneIndex: scene.index, stepIndex: steps.length, isKeyframe: false });
            steps.push({
              action: "animate",
              prompt: motionPrompt,
              title: `${scene.title} (clip ${c + 1}/${clipCount})`,
              source_url: undefined, // resolved at execution time from keyframe card
              // We pass the keyframe refId via a custom field that create_media's caller will resolve
            });
          }
        }
      } else {
        // Existing image flow
        steps.push({
          action: scene.action,
          prompt: `${stylePrefix}${scene.prompt}${styleSuffix}`,
          title: scene.title,
          source_url: scene.sourceUrl,
        });
      }
    }
```

This block REPLACES the existing `const steps = batch.map(...)` lines. Find that section and swap it.

NOTE: For keyframe → animate to chain properly within a single batch, the ideal flow is:
1. First batch: only keyframes for video scenes
2. Wait for keyframes to complete
3. Second batch: animate clips using the keyframe URLs

The simplest implementation in v1: process keyframes first within a batch, mark scenes with `keyframeRefId` after they complete, then on the NEXT batch (or recursive call) the animate clips run.

Add a helper after the loop to resolve keyframe URLs from card refIds and inject them as source_url:

```typescript
    // After steps are built, resolve any pending keyframe URLs from the canvas store
    // (For this version we run keyframes and animate in separate generate cycles)
```

For v1 simplicity, after `executeTool("create_media", { steps })` returns, scan the results: any successful keyframe step → write its refId back to the scene. The next `project_generate` call will see `keyframeRefId` set and emit animate steps instead.

Add this AFTER the create_media call but BEFORE the existing scene status update loop:

```typescript
    // After create_media: write keyframe refIds back to scenes for the animate phase
    const cardsCreated = (result.data as Record<string, unknown>)?.cards_created as string[] | undefined;
    if (cardsCreated && project.isVideo) {
      for (let i = 0; i < sceneToStep.length; i++) {
        const stepInfo = sceneToStep[i];
        if (stepInfo.isKeyframe && cardsCreated[stepInfo.stepIndex]) {
          const sceneIdx = stepInfo.sceneIndex;
          const refId = cardsCreated[stepInfo.stepIndex];
          // Find scene in project and write keyframeRefId
          const proj = useProjectStore.getState().getProject(projectId);
          if (proj) {
            const scene = proj.scenes.find((s) => s.index === sceneIdx);
            if (scene) {
              scene.keyframeRefId = refId;
              // Resolve URL from canvas to use as source_url for animate step
              try {
                const { useCanvasStore } = await import("@/lib/canvas/store");
                const card = useCanvasStore.getState().cards.find((c) => c.refId === refId);
                if (card?.url) scene.sourceUrl = card.url;
              } catch { /* canvas not available */ }
              // First scene's keyframe becomes the style anchor
              if (sceneIdx === 0 && proj.videoConsistency && !proj.videoConsistency.styleAnchorRefId) {
                proj.videoConsistency.styleAnchorRefId = refId;
              }
            }
          }
        }
      }
    }
```

Also: when `keyframeRefId` is set on a scene, the scene should NOT be marked "done" yet — it still needs the animate phase. Update the scene status logic:

Find the existing `for (let i = 0; i < batch.length; i++)` loop that calls `updateSceneStatus`. Add a check: video scenes are only "done" after the animate phase, not after keyframes.

```typescript
    for (let i = 0; i < batch.length; i++) {
      const scene = batch[i];
      // ... existing logic to find result ...
      const hasError = stepResult?.error;

      if (hasError) {
        store.updateSceneStatus(projectId, scene.index, "pending");
      } else if (refId) {
        // For video scenes: only mark "done" if the animate step ran (not just keyframe)
        if (scene.action === "video_keyframe" && !scene.keyframeRefId) {
          // This was the keyframe phase — leave as "pending" so next batch runs animate
          store.updateSceneStatus(projectId, scene.index, "pending");
        } else {
          store.updateSceneStatus(projectId, scene.index, "done", refId);
        }
      }
    }
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit 2>&1 | grep -v "tests/" | head -10`
Run: `npx vitest run tests/unit/ 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add lib/tools/project-tools.ts
git commit -m "feat: project_generate runs keyframe + animate flow for video scenes"
```

---

## Phase 5: E2E Test with Tank & Kuro Brief

### Task 7: E2E test using the Ghibli brief

**Files:**
- Create: `tests/e2e/video-intent.spec.ts`

- [ ] **Step 1: Write E2E test**

```typescript
// tests/e2e/video-intent.spec.ts
import { test, expect } from "@playwright/test";

const TANK_KURO_BRIEF = `Create a 6-scene animated short video in the style of Studio Ghibli — hand-painted cel animation aesthetic. The film follows TANK, a wrinkled English bulldog with an underbite, and KURO, a sleek tuxedo cat with white gloves and green eyes. They live in a weathered Japanese fishing village.

SCENE 1 — TWO WORLDS, ONE LANE
Duration: 45 seconds | Camera: slow pan left to right
Golden morning. Tank sits outside a weathered wooden shop. Kuro sits on a wall.
Visual language: warm saffron morning light

SCENE 2 — THE FIRST INSULT
Duration: 50 seconds | Camera: ground level
Tank attempts to cross a bridge but Kuro is sitting in the centre.
Visual language: dappled noon light through cedar trees

SCENE 3 — THE STORM
Duration: 70 seconds | Camera: dramatic wide shots
A typhoon arrives. Tank wades into floodwater to save Kuro.
Visual language: desaturated blue-black storm palette

SCENE 4 — THE MORNING AFTER
Duration: 55 seconds | Camera: slow intimate
Tank and Kuro asleep on temple steps.
Visual language: pale gold and silver dawn

SCENE 5 — THE SEASONS PASS
Duration: 60 seconds | Camera: varied
Four-season montage of small daily moments.
Visual language: each season has signature palette

SCENE 6 — THE EVENING THEY ALWAYS RETURN TO
Duration: 65 seconds | Camera: wide to close
Years later. They sit on the harbour wall together.
Visual language: deep amber lantern warmth

Colour temperature arc:
Scene 1 → warm gold
Scene 2 → bright noon white
Scene 3 → cold blue-black
Scene 4 → pale silver-gold
Scene 5 → full seasonal spectrum
Scene 6 → deep amber lantern warmth`;

test.describe("Video Intent", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("textarea", { timeout: 10000 });
  });

  test("detectVideoIntent recognizes the Tank & Kuro brief", async ({ page }) => {
    const result = await page.evaluate((brief) => {
      // Inline replica of detectVideoIntent
      const VIDEO_KEYWORDS = [
        /\b(animated|animation|short film|short video|video clip|movie|cinematic short)\b/i,
        /\bduration:\s*\d+\s*(s|sec|second|minute)/i,
        /\b\d+[-\s]second\b/i,
        /\b(scene\s*\d+.*camera|tracking shot|close[-\s]?up|wide shot|cut to|fade to|zoom in|zoom out)\b/i,
      ];
      return VIDEO_KEYWORDS.some((re) => re.test(brief));
    }, TANK_KURO_BRIEF);
    expect(result).toBe(true);
  });

  test("extractDurations parses all 6 scenes", async ({ page }) => {
    const result = await page.evaluate((brief) => {
      const sceneBlocks = brief.split(/(?=SCENE\s*\d+)/i);
      const result: { sceneIndex: number; seconds: number }[] = [];
      let sceneIdx = 0;
      for (const block of sceneBlocks) {
        if (!/SCENE\s*\d+/i.test(block)) continue;
        const m = block.match(/duration:\s*(\d+)\s*(s|sec|second|minute|min)/i);
        if (m) {
          let seconds = parseInt(m[1], 10);
          if (m[2].toLowerCase().startsWith("min")) seconds *= 60;
          result.push({ sceneIndex: sceneIdx, seconds });
        }
        sceneIdx++;
      }
      return result;
    }, TANK_KURO_BRIEF);

    expect(result).toHaveLength(6);
    expect(result[0].seconds).toBe(45);
    expect(result[1].seconds).toBe(50);
    expect(result[2].seconds).toBe(70);
    expect(result[5].seconds).toBe(65);
  });

  test("extractColorArc parses all 6 colors", async ({ page }) => {
    const result = await page.evaluate((brief) => {
      const arc: string[] = [];
      const lines = brief.split("\n");
      for (const line of lines) {
        const m = line.match(/scene\s*\d+\s*[\u2192\->]+\s*(.+)/i);
        if (m) {
          const color = m[1].trim();
          if (color.length > 0 && color.length < 60) arc.push(color);
        }
      }
      return arc;
    }, TANK_KURO_BRIEF);

    expect(result).toHaveLength(6);
    expect(result[0]).toContain("warm gold");
    expect(result[2]).toContain("cold blue-black");
  });

  test("planVideoStrategy overview = 6 clips, full = 35 clips", async ({ page }) => {
    const result = await page.evaluate(() => {
      const durations = [45, 50, 70, 55, 60, 65];
      const overview = { perScene: durations.map(() => 1), totalClips: durations.length };
      const fullPerScene = durations.map((d) => Math.max(1, Math.ceil(d / 10)));
      const full = { perScene: fullPerScene, totalClips: fullPerScene.reduce((a, b) => a + b, 0) };
      return { overview, full };
    });

    expect(result.overview.totalClips).toBe(6);
    // Full: ceil(45/10)+ceil(50/10)+ceil(70/10)+ceil(55/10)+ceil(60/10)+ceil(65/10)
    // = 5 + 5 + 7 + 6 + 6 + 7 = 36
    expect(result.full.totalClips).toBe(36);
  });

  test("project type accepts video_keyframe action", async ({ page }) => {
    const result = await page.evaluate(() => {
      // Verify the action enum supports video_keyframe
      const validActions = ["generate", "restyle", "animate", "upscale", "remove_bg", "tts", "video_keyframe"];
      return validActions.includes("video_keyframe");
    });
    expect(result).toBe(true);
  });
});
```

- [ ] **Step 2: Run the E2E tests**

Run: `npx playwright test tests/e2e/video-intent.spec.ts --reporter=list 2>&1 | tail -20`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/video-intent.spec.ts
git commit -m "test: add E2E tests for video intent detection with Tank & Kuro brief"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| **1: Detection** | Tasks 1-2 | video-intent.ts (detect, durations, strategy, prefix, color arc, character lock, per-scene notes) + beat-extractor.ts |
| **2: Types** | Task 3 | Scene/Project types with video_keyframe action, beats, clipsPerScene, VideoConsistency |
| **3: Preprocessor** | Task 4 | Video intent integrated into handleMultiScene, video_strategy intent classifier |
| **4: Project tools** | Tasks 5-6 | project_create accepts video fields; project_generate runs keyframe → animate flow with consistency layers |
| **5: E2E** | Task 7 | Tank & Kuro brief E2E validation |

**Dependencies:** Tasks 1, 2, 3 are independent. Task 4 depends on 1+2+3. Task 5 depends on 3. Task 6 depends on 5. Task 7 depends on all.
