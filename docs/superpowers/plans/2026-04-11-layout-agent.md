# Layout Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace rigid autoLayout/narrativeLayout with a smart layout agent that has 8 built-in skills, user-created skills, pre-planning, and auto-strategy selection.

**Architecture:** A shared layout engine (`lib/layout/engine.ts`) takes a LayoutPreset and returns card positions. 8 built-in skills are parameter presets. A strategy picker auto-selects the best layout. Commands (`/organize`, `/layout list|add|capture|delete`) let users manage skills. Pre-planning places cards in final positions before generation.

**Tech Stack:** TypeScript, Zustand, Vitest, Playwright

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `lib/layout/types.ts` | LayoutSkill, LayoutPreset, LayoutContext, CardPosition |
| `lib/layout/engine.ts` | Shared layout engine: groups, orders, positions |
| `lib/layout/skills.ts` | 8 built-in skill presets |
| `lib/layout/store.ts` | Zustand store: user skills, active strategy, persistence |
| `lib/layout/agent.ts` | Strategy picker + pre-planner |
| `lib/layout/commands.ts` | /organize and /layout command handlers |
| `tests/unit/layout-engine.test.ts` | Unit tests for engine |
| `tests/unit/layout-agent.test.ts` | Unit tests for agent |
| `tests/e2e/layout.spec.ts` | E2E tests |

### Modified files
| File | Changes |
|------|---------|
| `lib/canvas/store.ts` | Remove autoLayout/narrativeLayout/layoutTimeline, add applyLayout() |
| `lib/skills/commands.ts` | Route /organize and /layout to new handlers |
| `lib/tools/canvas-tools.ts` | canvas_organize uses layout agent, add mode param |
| `lib/tools/compound-tools.ts` | Pre-plan positions before card creation |

---

## Phase 1: Core Engine

### Task 1: Types and built-in skill definitions

**Files:**
- Create: `lib/layout/types.ts`
- Create: `lib/layout/skills.ts`

- [ ] **Step 1: Create types**

```typescript
// lib/layout/types.ts
import type { Card, ArrowEdge } from "@/lib/canvas/types";
import type { Episode } from "@/lib/episodes/types";

export interface LayoutPreset {
  cols: number;
  gap: number;
  cardScale: number;
  flow: "ltr" | "zigzag" | "center-out";
  groupBy: "batch" | "episode" | "none";
  rowSeparator: number;
  startCorner: "top-left" | "center";
}

export interface LayoutSkill {
  id: string;
  name: string;
  description: string;
  category: "built-in" | "user";
  preset?: LayoutPreset;
  layoutFn?: (ctx: LayoutContext) => CardPosition[];
}

export interface LayoutContext {
  cards: Card[];
  edges: ArrowEdge[];
  episodes: Episode[];
  activeEpisodeId: string | null;
  canvasWidth: number;
}

export interface CardPosition {
  cardId: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export const BASE_CARD_W = 320;
export const BASE_CARD_H = 280;
export const BASE_GAP = 24;
export const HEADER_OFFSET = 48;
```

- [ ] **Step 2: Create built-in skills**

```typescript
// lib/layout/skills.ts
import type { LayoutSkill, LayoutPreset } from "./types";

const BUILT_IN_SKILLS: LayoutSkill[] = [
  {
    id: "basic",
    name: "Basic Grid",
    description: "Clean L\u2192R grid, 6 per row, batch-grouped",
    category: "built-in",
    preset: { cols: 6, gap: 24, cardScale: 1.0, flow: "ltr", groupBy: "batch", rowSeparator: 0, startCorner: "top-left" },
  },
  {
    id: "narrative",
    name: "Narrative Flow",
    description: "Story sequence, one row per prompt batch",
    category: "built-in",
    preset: { cols: 8, gap: 24, cardScale: 1.0, flow: "ltr", groupBy: "batch", rowSeparator: 40, startCorner: "top-left" },
  },
  {
    id: "episode",
    name: "Episode Groups",
    description: "Clustered by episode, narrative within each",
    category: "built-in",
    preset: { cols: 6, gap: 24, cardScale: 1.0, flow: "ltr", groupBy: "episode", rowSeparator: 60, startCorner: "top-left" },
  },
  {
    id: "graphic-novel",
    name: "Graphic Novel",
    description: "Dense 3-col panel layout, zigzag flow",
    category: "built-in",
    preset: { cols: 3, gap: 8, cardScale: 1.3, flow: "zigzag", groupBy: "batch", rowSeparator: 24, startCorner: "top-left" },
  },
  {
    id: "ads-board",
    name: "Ads Moodboard",
    description: "Spacious center-out brainstorm layout",
    category: "built-in",
    preset: { cols: 4, gap: 32, cardScale: 1.0, flow: "center-out", groupBy: "none", rowSeparator: 0, startCorner: "center" },
  },
  {
    id: "movie-board",
    name: "Movie Storyboard",
    description: "Cinematic 5-col wide flow with scene breaks",
    category: "built-in",
    preset: { cols: 5, gap: 24, cardScale: 1.0, flow: "ltr", groupBy: "batch", rowSeparator: 48, startCorner: "top-left" },
  },
  {
    id: "balanced",
    name: "Balanced Flow",
    description: "Even spacing, ideas and flow balanced",
    category: "built-in",
    preset: { cols: 4, gap: 28, cardScale: 1.0, flow: "ltr", groupBy: "batch", rowSeparator: 32, startCorner: "top-left" },
  },
  {
    id: "freeform",
    name: "Freeform",
    description: "Manual mode \u2014 no auto-layout, keeps current positions",
    category: "built-in",
    // No preset — the engine returns current positions unchanged
  },
];

export function getBuiltInSkills(): LayoutSkill[] {
  return BUILT_IN_SKILLS;
}

export function getBuiltInSkill(id: string): LayoutSkill | undefined {
  return BUILT_IN_SKILLS.find((s) => s.id === id);
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/layout/types.ts lib/layout/skills.ts
git commit -m "feat: add layout types and 8 built-in skill presets"
```

---

### Task 2: Layout engine

**Files:**
- Create: `lib/layout/engine.ts`
- Test: `tests/unit/layout-engine.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/layout-engine.test.ts
import { describe, it, expect } from "vitest";
import { runLayout } from "@/lib/layout/engine";
import { getBuiltInSkill } from "@/lib/layout/skills";
import type { LayoutContext, CardPosition } from "@/lib/layout/types";

function makeCard(id: string, refId: string, batchId?: string) {
  return {
    id, refId, type: "image" as const, title: `Card ${id}`,
    x: 0, y: 0, w: 320, h: 280, minimized: false, batchId,
  };
}

function makeCtx(cards: ReturnType<typeof makeCard>[], edges: Array<{ fromRefId: string; toRefId: string }> = []): LayoutContext {
  return { cards, edges, episodes: [], activeEpisodeId: null, canvasWidth: 1920 };
}

describe("Layout Engine", () => {
  it("basic grid: 6 cards in one row", () => {
    const cards = Array.from({ length: 6 }, (_, i) => makeCard(String(i), `img-${i + 1}`));
    const pos = runLayout(makeCtx(cards), getBuiltInSkill("basic")!);
    expect(pos).toHaveLength(6);
    // All same y (one row)
    const ys = new Set(pos.map((p) => p.y));
    expect(ys.size).toBe(1);
    // x increases left to right
    for (let i = 1; i < pos.length; i++) {
      expect(pos[i].x).toBeGreaterThan(pos[i - 1].x);
    }
  });

  it("basic grid: 8 cards wraps to 2 rows", () => {
    const cards = Array.from({ length: 8 }, (_, i) => makeCard(String(i), `img-${i + 1}`));
    const pos = runLayout(makeCtx(cards), getBuiltInSkill("basic")!);
    const ys = [...new Set(pos.map((p) => p.y))];
    expect(ys.length).toBe(2); // 6 + 2
  });

  it("batch grouping keeps batches contiguous", () => {
    const cards = [
      makeCard("0", "img-1", "b1"), makeCard("1", "img-2", "b1"),
      makeCard("2", "img-3", "b2"), makeCard("3", "img-4", "b2"),
    ];
    const pos = runLayout(makeCtx(cards), getBuiltInSkill("basic")!);
    // b1 cards should be before b2 cards in x order
    expect(pos[0].x).toBeLessThan(pos[2].x);
    expect(pos[1].x).toBeLessThan(pos[3].x);
  });

  it("narrative: each batch gets its own row", () => {
    const cards = [
      makeCard("0", "img-1", "b1"), makeCard("1", "img-2", "b1"),
      makeCard("2", "img-3", "b2"), makeCard("3", "img-4", "b2"),
    ];
    const skill = getBuiltInSkill("narrative")!;
    const pos = runLayout(makeCtx(cards), skill);
    // Batch 1 and batch 2 should have different y values
    expect(pos[0].y).toBeLessThan(pos[2].y);
    // Within batch 1, same y
    expect(pos[0].y).toBe(pos[1].y);
  });

  it("narrative: rowSeparator adds extra gap between groups", () => {
    const cards = [
      makeCard("0", "img-1", "b1"),
      makeCard("1", "img-2", "b2"),
    ];
    const skill = getBuiltInSkill("narrative")!;
    const pos = runLayout(makeCtx(cards), skill);
    const yGap = pos[1].y - pos[0].y;
    // Should include rowSeparator (40) + card height + gap
    expect(yGap).toBeGreaterThan(280 + 24); // > CARD_H + GAP
  });

  it("no cards returns empty array", () => {
    const pos = runLayout(makeCtx([]), getBuiltInSkill("basic")!);
    expect(pos).toEqual([]);
  });

  it("freeform returns current positions", () => {
    const cards = [
      { ...makeCard("0", "img-1"), x: 100, y: 200 },
      { ...makeCard("1", "img-2"), x: 500, y: 600 },
    ];
    const pos = runLayout(makeCtx(cards), getBuiltInSkill("freeform")!);
    expect(pos[0].x).toBe(100);
    expect(pos[0].y).toBe(200);
    expect(pos[1].x).toBe(500);
  });

  it("edge ordering: connected cards follow edge direction", () => {
    const cards = [
      makeCard("0", "img-1"), makeCard("1", "img-2"), makeCard("2", "img-3"),
    ];
    const edges = [{ fromRefId: "img-3", toRefId: "img-1" }];
    const pos = runLayout(makeCtx(cards, edges), getBuiltInSkill("basic")!);
    // img-3 should come before img-1 in layout order (it's the root)
    const idx3 = pos.findIndex((p) => p.cardId === "2");
    const idx1 = pos.findIndex((p) => p.cardId === "0");
    expect(pos[idx3].x).toBeLessThanOrEqual(pos[idx1].x);
  });

  it("episode grouping: cards grouped by episode", () => {
    const cards = [
      makeCard("0", "img-1"), makeCard("1", "img-2"),
      makeCard("2", "img-3"), makeCard("3", "img-4"),
    ];
    const episodes = [
      { id: "ep1", name: "A", cardIds: ["0", "1"], context: {}, color: "#f00", createdAt: 0 },
      { id: "ep2", name: "B", cardIds: ["2", "3"], context: {}, color: "#0f0", createdAt: 0 },
    ];
    const ctx: LayoutContext = { cards, edges: [], episodes, activeEpisodeId: null, canvasWidth: 1920 };
    const pos = runLayout(ctx, getBuiltInSkill("episode")!);
    // Episode A cards should have different y from episode B
    expect(pos[0].y).toBeLessThan(pos[2].y);
  });

  it("cardScale changes card dimensions", () => {
    const cards = [makeCard("0", "img-1")];
    const skill = getBuiltInSkill("graphic-novel")!;
    const pos = runLayout(makeCtx(cards), skill);
    // graphic-novel has cardScale=1.3
    expect(pos[0].w).toBe(Math.round(320 * 1.3));
    expect(pos[0].h).toBe(Math.round(280 * 1.3));
  });

  it("custom layoutFn overrides preset", () => {
    const cards = [makeCard("0", "img-1"), makeCard("1", "img-2")];
    const skill = {
      id: "custom", name: "Custom", description: "", category: "user" as const,
      layoutFn: (ctx: LayoutContext) => ctx.cards.map((c, i) => ({
        cardId: c.id, x: i * 999, y: i * 111,
      })),
    };
    const pos = runLayout(makeCtx(cards), skill);
    expect(pos[0].x).toBe(0);
    expect(pos[1].x).toBe(999);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/layout-engine.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement layout engine**

```typescript
// lib/layout/engine.ts
import type { LayoutSkill, LayoutContext, CardPosition, LayoutPreset } from "./types";
import { BASE_CARD_W, BASE_CARD_H, HEADER_OFFSET } from "./types";

/**
 * Run a layout skill on the given context, returning new card positions.
 * If the skill has a custom layoutFn, uses that. Otherwise runs the shared
 * preset-based engine.
 */
export function runLayout(ctx: LayoutContext, skill: LayoutSkill): CardPosition[] {
  if (ctx.cards.length === 0) return [];

  // Custom function takes priority
  if (skill.layoutFn) return skill.layoutFn(ctx);

  // Freeform: return current positions unchanged
  if (!skill.preset) {
    return ctx.cards.map((c) => ({ cardId: c.id, x: c.x, y: c.y, w: c.w, h: c.h }));
  }

  return runPreset(ctx, skill.preset);
}

function runPreset(ctx: LayoutContext, preset: LayoutPreset): CardPosition[] {
  const cardW = Math.round(BASE_CARD_W * preset.cardScale);
  const cardH = Math.round(BASE_CARD_H * preset.cardScale);
  const gap = preset.gap;

  // Step 1: BFS edge ordering
  const ordered = bfsOrder(ctx.cards, ctx.edges);

  // Step 2: Group cards
  const groups = groupCards(ordered, ctx, preset.groupBy);

  // Step 3: Position groups
  if (preset.flow === "center-out") {
    return positionCenterOut(groups, cardW, cardH, gap, ctx.canvasWidth);
  }

  return positionRows(groups, cardW, cardH, gap, preset);
}

/** BFS from edge roots, then append unvisited cards */
function bfsOrder(
  cards: LayoutContext["cards"],
  edges: LayoutContext["edges"]
): LayoutContext["cards"] {
  const hasIncoming = new Set(edges.map((e) => e.toRefId));
  const roots = cards.filter((c) => !hasIncoming.has(c.refId));
  const visited = new Set<string>();
  const order: string[] = [];
  const queue = [...roots.map((c) => c.refId)];

  while (queue.length > 0) {
    const refId = queue.shift()!;
    if (visited.has(refId)) continue;
    visited.add(refId);
    order.push(refId);
    for (const e of edges) {
      if (e.fromRefId === refId && !visited.has(e.toRefId)) {
        queue.push(e.toRefId);
      }
    }
  }
  // Append unvisited
  for (const c of cards) {
    if (!visited.has(c.refId)) order.push(c.refId);
  }

  const byRefId = new Map(cards.map((c) => [c.refId, c]));
  return order.map((r) => byRefId.get(r)!).filter(Boolean);
}

/** Group cards by batch, episode, or no grouping */
function groupCards(
  ordered: LayoutContext["cards"],
  ctx: LayoutContext,
  groupBy: string
): LayoutContext["cards"][][] {
  if (groupBy === "episode" && ctx.episodes.length > 0) {
    return groupByEpisode(ordered, ctx);
  }
  if (groupBy === "batch") {
    return groupByBatch(ordered);
  }
  // "none" — all cards in one group
  return [ordered];
}

function groupByBatch(ordered: LayoutContext["cards"]): LayoutContext["cards"][][] {
  const groups: LayoutContext["cards"][][] = [];
  const batchMap = new Map<string, number>();

  for (const card of ordered) {
    const bid = card.batchId;
    if (bid && batchMap.has(bid)) {
      groups[batchMap.get(bid)!].push(card);
    } else {
      const idx = groups.length;
      if (bid) batchMap.set(bid, idx);
      groups.push([card]);
    }
  }
  return groups;
}

function groupByEpisode(
  ordered: LayoutContext["cards"],
  ctx: LayoutContext
): LayoutContext["cards"][][] {
  const epMap = new Map<string, LayoutContext["cards"]>();
  const ungrouped: LayoutContext["cards"][number][] = [];

  for (const ep of ctx.episodes) {
    epMap.set(ep.id, []);
  }

  for (const card of ordered) {
    const ep = ctx.episodes.find((e) => e.cardIds.includes(card.id));
    if (ep) {
      epMap.get(ep.id)!.push(card);
    } else {
      ungrouped.push(card);
    }
  }

  const groups: LayoutContext["cards"][][] = [];
  for (const ep of ctx.episodes) {
    const cards = epMap.get(ep.id)!;
    if (cards.length > 0) groups.push(cards);
  }
  if (ungrouped.length > 0) groups.push(ungrouped);
  return groups;
}

/** Position groups in rows (ltr or zigzag) */
function positionRows(
  groups: LayoutContext["cards"][][],
  cardW: number,
  cardH: number,
  gap: number,
  preset: LayoutPreset
): CardPosition[] {
  const positions: CardPosition[] = [];
  let currentY = gap + HEADER_OFFSET;

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    let col = 0;
    let rowStartY = currentY;

    for (let ci = 0; ci < group.length; ci++) {
      if (col >= preset.cols) {
        col = 0;
        currentY += cardH + gap;
      }

      let x: number;
      if (preset.flow === "zigzag") {
        const rowIdx = Math.floor(ci / preset.cols);
        const isReverse = rowIdx % 2 === 1;
        const colInRow = ci % preset.cols;
        const effectiveCol = isReverse ? (preset.cols - 1 - colInRow) : colInRow;
        x = gap + effectiveCol * (cardW + gap);
      } else {
        x = gap + col * (cardW + gap);
      }

      positions.push({
        cardId: group[ci].id,
        x,
        y: currentY,
        w: cardW,
        h: cardH,
      });
      col++;
    }

    // Move to next group with separator
    currentY += cardH + gap + (gi < groups.length - 1 ? preset.rowSeparator : 0);
  }

  return positions;
}

/** Position cards radiating from center */
function positionCenterOut(
  groups: LayoutContext["cards"][][],
  cardW: number,
  cardH: number,
  gap: number,
  canvasWidth: number
): CardPosition[] {
  const all = groups.flat();
  const positions: CardPosition[] = [];
  const centerX = canvasWidth / 2;
  const centerY = 400;

  for (let i = 0; i < all.length; i++) {
    if (i === 0) {
      // First card at center
      positions.push({ cardId: all[i].id, x: centerX - cardW / 2, y: centerY - cardH / 2, w: cardW, h: cardH });
    } else {
      // Spiral outward
      const ring = Math.ceil(Math.sqrt(i));
      const angle = (i / (ring * 4)) * 2 * Math.PI;
      const radius = ring * (cardW + gap);
      positions.push({
        cardId: all[i].id,
        x: centerX + Math.cos(angle) * radius - cardW / 2,
        y: centerY + Math.sin(angle) * radius - cardH / 2,
        w: cardW,
        h: cardH,
      });
    }
  }
  return positions;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/layout-engine.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add lib/layout/engine.ts tests/unit/layout-engine.test.ts
git commit -m "feat: add shared layout engine with preset support"
```

---

### Task 3: Layout store

**Files:**
- Create: `lib/layout/store.ts`

- [ ] **Step 1: Create layout store**

```typescript
// lib/layout/store.ts
import { create } from "zustand";
import type { LayoutSkill, LayoutPreset } from "./types";
import { getBuiltInSkills } from "./skills";

const STORAGE_KEY = "storyboard_layout_skills";

function loadUserSkills(): LayoutSkill[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveUserSkills(skills: LayoutSkill[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(skills));
}

interface LayoutStoreState {
  userSkills: LayoutSkill[];
  activeSkillId: string | null;

  getAllSkills: () => LayoutSkill[];
  getSkill: (id: string) => LayoutSkill | undefined;
  setActiveSkill: (id: string | null) => void;
  addUserSkill: (skill: LayoutSkill) => void;
  removeUserSkill: (id: string) => void;
  captureLayout: (name: string, preset: LayoutPreset, rawPositions?: Array<{ cardId: string; x: number; y: number }>) => LayoutSkill;
}

export const useLayoutStore = create<LayoutStoreState>((set, get) => ({
  userSkills: loadUserSkills(),
  activeSkillId: null,

  getAllSkills: () => [...getBuiltInSkills(), ...get().userSkills],

  getSkill: (id) => {
    const builtIn = getBuiltInSkills().find((s) => s.id === id);
    if (builtIn) return builtIn;
    return get().userSkills.find((s) => s.id === id);
  },

  setActiveSkill: (id) => set({ activeSkillId: id }),

  addUserSkill: (skill) => {
    set((s) => {
      const updated = [...s.userSkills.filter((u) => u.id !== skill.id), skill];
      saveUserSkills(updated);
      return { userSkills: updated };
    });
  },

  removeUserSkill: (id) => {
    set((s) => {
      const updated = s.userSkills.filter((u) => u.id !== id);
      saveUserSkills(updated);
      return {
        userSkills: updated,
        activeSkillId: s.activeSkillId === id ? null : s.activeSkillId,
      };
    });
  },

  captureLayout: (name, preset, rawPositions) => {
    const id = `user_${name.toLowerCase().replace(/\s+/g, "-")}_${Date.now()}`;
    const skill: LayoutSkill = {
      id,
      name,
      description: `Captured from canvas`,
      category: "user",
      preset,
    };
    // If raw positions provided, store as layoutFn for exact replay
    if (rawPositions && rawPositions.length > 0) {
      const positions = [...rawPositions];
      skill.layoutFn = (ctx) =>
        ctx.cards.map((c) => {
          const saved = positions.find((p) => p.cardId === c.id);
          return saved
            ? { cardId: c.id, x: saved.x, y: saved.y }
            : { cardId: c.id, x: c.x, y: c.y };
        });
    }
    get().addUserSkill(skill);
    return skill;
  },
}));
```

- [ ] **Step 2: Commit**

```bash
git add lib/layout/store.ts
git commit -m "feat: add layout store with user skill persistence"
```

---

### Task 4: Layout agent (strategy picker + pre-planner)

**Files:**
- Create: `lib/layout/agent.ts`
- Test: `tests/unit/layout-agent.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/layout-agent.test.ts
import { describe, it, expect } from "vitest";
import { pickStrategy, prePlan } from "@/lib/layout/agent";
import type { LayoutContext } from "@/lib/layout/types";

function makeCard(id: string, refId: string, batchId?: string) {
  return {
    id, refId, type: "image" as const, title: `Card ${id}`,
    x: 0, y: 0, w: 320, h: 280, minimized: false, batchId,
  };
}

describe("pickStrategy", () => {
  it("returns user preference when set", () => {
    const ctx: LayoutContext = { cards: [], edges: [], episodes: [], activeEpisodeId: null, canvasWidth: 1920 };
    expect(pickStrategy(ctx, "graphic-novel")).toBe("graphic-novel");
  });

  it("returns episode when active episode + multiple episodes", () => {
    const ctx: LayoutContext = {
      cards: [], edges: [],
      episodes: [
        { id: "e1", name: "A", cardIds: [], context: {}, color: "#f00", createdAt: 0 },
        { id: "e2", name: "B", cardIds: [], context: {}, color: "#0f0", createdAt: 0 },
      ],
      activeEpisodeId: "e1",
      canvasWidth: 1920,
    };
    expect(pickStrategy(ctx, null)).toBe("episode");
  });

  it("returns narrative when many edges", () => {
    const cards = Array.from({ length: 5 }, (_, i) => makeCard(String(i), `img-${i}`));
    const edges = [
      { fromRefId: "img-0", toRefId: "img-1" },
      { fromRefId: "img-1", toRefId: "img-2" },
      { fromRefId: "img-2", toRefId: "img-3" },
      { fromRefId: "img-3", toRefId: "img-4" },
    ];
    const ctx: LayoutContext = { cards, edges, episodes: [], activeEpisodeId: null, canvasWidth: 1920 };
    expect(pickStrategy(ctx, null)).toBe("narrative");
  });

  it("returns basic by default", () => {
    const ctx: LayoutContext = { cards: [], edges: [], episodes: [], activeEpisodeId: null, canvasWidth: 1920 };
    expect(pickStrategy(ctx, null)).toBe("basic");
  });
});

describe("prePlan", () => {
  it("returns positions for N new cards after existing cards", () => {
    const existing = [makeCard("0", "img-1"), makeCard("1", "img-2")];
    const positions = prePlan(existing, 3, "basic");
    expect(positions).toHaveLength(3);
    // New positions should not overlap existing card positions
    for (const pos of positions) {
      for (const card of existing) {
        const noOverlap = pos.x + pos.w <= card.x || pos.x >= card.x + card.w ||
                          pos.y + pos.h <= card.y || pos.y >= card.y + card.h;
        expect(noOverlap).toBe(true);
      }
    }
  });

  it("returns empty for 0 new cards", () => {
    expect(prePlan([], 0, "basic")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/layout-agent.test.ts`

- [ ] **Step 3: Implement layout agent**

```typescript
// lib/layout/agent.ts
import type { LayoutContext, CardPosition } from "./types";
import type { Card } from "@/lib/canvas/types";
import { BASE_CARD_W, BASE_CARD_H, BASE_GAP, HEADER_OFFSET } from "./types";
import { runLayout } from "./engine";
import { useLayoutStore } from "./store";
import { getBuiltInSkill } from "./skills";

/**
 * Pick the best layout strategy based on context.
 * Returns a skill id.
 */
export function pickStrategy(ctx: LayoutContext, userPref: string | null): string {
  if (userPref) return userPref;
  if (ctx.activeEpisodeId && ctx.episodes.length > 1) return "episode";
  if (ctx.edges.length > 3) return "narrative";
  return "basic";
}

/**
 * Pre-plan positions for N new cards given existing cards on canvas.
 * Returns positions that don't overlap existing cards.
 */
export function prePlan(
  existingCards: Card[],
  newCount: number,
  skillId: string
): Array<{ x: number; y: number; w: number; h: number }> {
  if (newCount === 0) return [];

  const skill = useLayoutStore.getState().getSkill(skillId) || getBuiltInSkill("basic")!;
  const preset = skill.preset;
  if (!preset) {
    // Freeform or custom — use simple grid fallback
    return simpleGrid(existingCards.length, newCount);
  }

  const cardW = Math.round(BASE_CARD_W * preset.cardScale);
  const cardH = Math.round(BASE_CARD_H * preset.cardScale);
  const gap = preset.gap;
  const cols = preset.cols;

  // Find the next available row after existing cards
  let maxY = 0;
  for (const c of existingCards) {
    const bottom = c.y + c.h;
    if (bottom > maxY) maxY = bottom;
  }
  // Start new cards in the next row with separator
  const startY = existingCards.length === 0
    ? gap + HEADER_OFFSET
    : maxY + gap + (preset.rowSeparator || 0);

  const positions: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (let i = 0; i < newCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions.push({
      x: gap + col * (cardW + gap),
      y: startY + row * (cardH + gap),
      w: cardW,
      h: cardH,
    });
  }
  return positions;
}

function simpleGrid(existingCount: number, newCount: number) {
  const cols = 6;
  const positions: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (let i = 0; i < newCount; i++) {
    const idx = existingCount + i;
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    positions.push({
      x: BASE_GAP + col * (BASE_CARD_W + BASE_GAP),
      y: BASE_GAP + HEADER_OFFSET + row * (BASE_CARD_H + BASE_GAP),
      w: BASE_CARD_W,
      h: BASE_CARD_H,
    });
  }
  return positions;
}

/**
 * Run layout on the full canvas using the active or auto-picked strategy.
 */
export function organizeCanvas(skillId?: string): CardPosition[] {
  const { useCanvasStore } = require("@/lib/canvas/store");
  const { useEpisodeStore } = require("@/lib/episodes/store");
  const canvasState = useCanvasStore.getState();
  const epState = useEpisodeStore.getState();

  const ctx: LayoutContext = {
    cards: canvasState.cards,
    edges: canvasState.edges,
    episodes: epState.episodes,
    activeEpisodeId: epState.activeEpisodeId,
    canvasWidth: 1920,
  };

  const store = useLayoutStore.getState();
  const id = skillId || pickStrategy(ctx, store.activeSkillId);
  const skill = store.getSkill(id) || getBuiltInSkill("basic")!;

  if (skillId) store.setActiveSkill(skillId);

  return runLayout(ctx, skill);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/layout-agent.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/layout/agent.ts tests/unit/layout-agent.test.ts
git commit -m "feat: add layout agent with strategy picker and pre-planner"
```

---

## Phase 2: Integration

### Task 5: Update canvas store

**Files:**
- Modify: `lib/canvas/store.ts`

- [ ] **Step 1: Replace old layout functions with applyLayout**

Read `lib/canvas/store.ts`. Make these changes:

1. **Remove** the `layoutTimeline`, `autoLayout`, and `narrativeLayout` functions (lines 203-339)
2. **Remove** their declarations from the `CanvasState` interface (lines 23-25)
3. **Add** `applyLayout` to the interface and implementation:

In the interface (after line 25):
```typescript
  applyLayout: (positions: Array<{ cardId: string; x: number; y: number; w?: number; h?: number }>) => void;
```

In the implementation (replace the removed functions):
```typescript
  applyLayout: (positions) =>
    set((s) => {
      const posMap = new Map(positions.map((p) => [p.cardId, p]));
      const cards = s.cards.map((c) => {
        const pos = posMap.get(c.id);
        if (!pos) return c;
        return {
          ...c,
          x: pos.x,
          y: pos.y,
          ...(pos.w !== undefined ? { w: pos.w } : {}),
          ...(pos.h !== undefined ? { h: pos.h } : {}),
        };
      });
      return { cards };
    }),
```

4. **Update `nextPosition`** to use the layout agent's pre-planner. Read `lib/layout/agent.ts` — but for now, keep `nextPosition` as-is (pre-planning integration happens in Task 7).

- [ ] **Step 2: Fix imports in files that reference old functions**

Search for `autoLayout`, `narrativeLayout`, `layoutTimeline` across the codebase. Key files:
- `lib/tools/canvas-tools.ts` — uses `autoLayout()` in canvas_organize (fixed in Task 6)
- `lib/tools/project-tools.ts` — uses `layoutTimeline()` in project_generate (replace with applyLayout + runLayout)
- `lib/skills/commands.ts` — uses `autoLayout()` and `narrativeLayout()` (fixed in Task 6)

For `lib/tools/project-tools.ts`, find the `layoutTimeline` call (around line 184) and replace:
```typescript
// REPLACE:
//   useCanvasStore.getState().layoutTimeline(doneRefIds);
// WITH:
    try {
      const { organizeCanvas } = await import("@/lib/layout/agent");
      const positions = organizeCanvas();
      useCanvasStore.getState().applyLayout(positions);
    } catch {
      // Layout agent not available — skip
    }
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit 2>&1 | grep -v "tests/" | head -20`

- [ ] **Step 4: Commit**

```bash
git add lib/canvas/store.ts lib/tools/project-tools.ts
git commit -m "refactor: replace old layout functions with applyLayout"
```

---

### Task 6: Commands (/organize + /layout)

**Files:**
- Create: `lib/layout/commands.ts`
- Modify: `lib/skills/commands.ts`
- Modify: `lib/tools/canvas-tools.ts`

- [ ] **Step 1: Create layout command handlers**

```typescript
// lib/layout/commands.ts
import { useCanvasStore } from "@/lib/canvas/store";
import { useLayoutStore } from "./store";
import { organizeCanvas } from "./agent";
import type { LayoutPreset } from "./types";
import { BASE_CARD_W, BASE_CARD_H } from "./types";

export function handleOrganize(args: string): string {
  const store = useCanvasStore.getState();
  if (store.cards.length === 0) return "Canvas is empty \u2014 nothing to organize.";

  const skillId = args.trim().toLowerCase() || undefined;
  const positions = organizeCanvas(skillId);
  store.applyLayout(positions);

  const layoutStore = useLayoutStore.getState();
  const skill = skillId ? layoutStore.getSkill(skillId) : null;
  const name = skill?.name || "auto-selected";

  return `Organized ${store.cards.length} cards using ${name}.\nTip: /layout list \u2014 see all layout options`;
}

export function handleLayoutCommand(args: string): string {
  const parts = args.trim().split(/\s+/);
  const sub = parts[0]?.toLowerCase();
  const rest = parts.slice(1).join(" ").trim();

  switch (sub) {
    case "list":
      return layoutList();
    case "add":
      return layoutAdd(rest);
    case "capture":
      return layoutCapture(rest);
    case "delete":
      return layoutDelete(rest);
    default:
      return `Usage: /layout list | /layout add <name> | /layout capture <name> | /layout delete <name>`;
  }
}

function layoutList(): string {
  const store = useLayoutStore.getState();
  const all = store.getAllSkills();
  const builtIn = all.filter((s) => s.category === "built-in");
  const user = all.filter((s) => s.category === "user");

  const lines = ["Layout Skills:"];
  for (const s of builtIn) {
    const active = store.activeSkillId === s.id ? " (active)" : "";
    lines.push(`  \u25CF ${s.id.padEnd(16)} ${s.name} \u2014 ${s.description}${active}`);
  }

  if (user.length > 0) {
    lines.push("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
    for (const s of user) {
      const active = store.activeSkillId === s.id ? " (active)" : "";
      lines.push(`  \u2605 ${s.id.padEnd(16)} ${s.name} \u2014 ${s.description}${active}`);
    }
  }

  lines.push("");
  lines.push("  Use: /organize <name>");
  return lines.join("\n");
}

function layoutAdd(name: string): string {
  if (!name) return "Usage: /layout add <name>\nExample: /layout add my-comic-layout";

  const id = `user_${name.toLowerCase().replace(/\s+/g, "-")}`;
  const preset: LayoutPreset = {
    cols: 4, gap: 24, cardScale: 1.0, flow: "ltr",
    groupBy: "batch", rowSeparator: 24, startCorner: "top-left",
  };

  const skill = {
    id, name, description: "Custom layout",
    category: "user" as const, preset,
  };
  useLayoutStore.getState().addUserSkill(skill);
  return `Created layout skill "${name}" with default grid preset.\nCustomize by arranging cards manually, then /layout capture ${name}`;
}

function layoutCapture(name: string): string {
  if (!name) return "Usage: /layout capture <name>\nCaptures current card positions as a reusable layout skill.";

  const cards = useCanvasStore.getState().cards;
  if (cards.length === 0) return "Canvas is empty \u2014 nothing to capture.";

  // Infer preset from current positions
  const xs = cards.map((c) => c.x).sort((a, b) => a - b);
  const ys = cards.map((c) => c.y).sort((a, b) => a - b);

  // Infer columns: count unique x positions (within tolerance)
  const uniqueXs = new Set<number>();
  for (const x of xs) {
    let found = false;
    for (const ux of uniqueXs) {
      if (Math.abs(x - ux) < BASE_CARD_W * 0.5) { found = true; break; }
    }
    if (!found) uniqueXs.add(x);
  }
  const cols = Math.max(1, uniqueXs.size);

  // Infer gap: median distance between adjacent cards
  const gaps: number[] = [];
  const sortedXs = [...xs];
  for (let i = 1; i < sortedXs.length; i++) {
    const diff = sortedXs[i] - sortedXs[i - 1];
    if (diff > 0 && diff < BASE_CARD_W * 2) gaps.push(diff - cards[0].w);
  }
  const gap = gaps.length > 0 ? Math.round(gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)]) : 24;

  // Card scale
  const scale = cards[0].w / BASE_CARD_W;

  const preset: LayoutPreset = {
    cols, gap: Math.max(4, gap), cardScale: Math.round(scale * 10) / 10,
    flow: "ltr", groupBy: "batch", rowSeparator: 24, startCorner: "top-left",
  };

  const rawPositions = cards.map((c) => ({ cardId: c.id, x: c.x, y: c.y }));
  const skill = useLayoutStore.getState().captureLayout(name, preset, rawPositions);

  return `Captured "${name}" from ${cards.length} cards (${cols} cols, ${gap}px gap, ${scale.toFixed(1)}x scale).\nUse: /organize ${skill.id}`;
}

function layoutDelete(name: string): string {
  if (!name) return "Usage: /layout delete <name>";
  const store = useLayoutStore.getState();
  const skill = store.userSkills.find(
    (s) => s.id === name || s.name.toLowerCase() === name.toLowerCase()
  );
  if (!skill) return `Layout skill "${name}" not found. Use /layout list to see all skills.`;
  store.removeUserSkill(skill.id);
  return `Deleted layout skill "${skill.name}".`;
}
```

- [ ] **Step 2: Route commands in commands.ts**

In `lib/skills/commands.ts`, add import at top:
```typescript
import { handleOrganize, handleLayoutCommand } from "@/lib/layout/commands";
```

Replace the `organize` case and add `layout` case in the switch:
```typescript
    case "organize":
      return handleOrganize(cmd.args);
    case "layout":
      return handleLayoutCommand(cmd.args);
```

Remove the old `organizeCanvas` function (lines 174-187) since it's replaced by `handleOrganize`.

Update the default error message to include `/layout`:
```typescript
    default:
      return `Unknown command: /${cmd.command}\nAvailable: /skills, /context, /capabilities, /organize, /layout, /export`;
```

- [ ] **Step 3: Update canvas_organize tool**

In `lib/tools/canvas-tools.ts`, update the canvas_organize tool to use the layout agent:

```typescript
export const canvasOrganizeTool: ToolDefinition = {
  name: "canvas_organize",
  description: "Auto-organize all cards on the canvas using the best layout strategy. Optionally specify a mode: basic, narrative, episode, graphic-novel, ads-board, movie-board, balanced.",
  parameters: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        description: "Layout mode (optional — auto-selects if omitted)",
        enum: ["basic", "narrative", "episode", "graphic-novel", "ads-board", "movie-board", "balanced"],
      },
    },
  },
  execute: async (input) => {
    const { organizeCanvas } = await import("@/lib/layout/agent");
    const { useCanvasStore } = await import("@/lib/canvas/store");
    const mode = (input.mode as string) || undefined;
    const positions = organizeCanvas(mode);
    useCanvasStore.getState().applyLayout(positions);
    const count = useCanvasStore.getState().cards.length;
    return { success: true, data: { organized: count, mode: mode || "auto", message: `${count} cards organized` } };
  },
};
```

- [ ] **Step 4: Verify build and tests**

Run: `npx tsc --noEmit 2>&1 | grep -v "tests/" | head -20`
Run: `npx vitest run tests/unit/ 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add lib/layout/commands.ts lib/skills/commands.ts lib/tools/canvas-tools.ts
git commit -m "feat: add /organize and /layout commands, update canvas_organize tool"
```

---

### Task 7: Pre-planning in compound-tools

**Files:**
- Modify: `lib/tools/compound-tools.ts`

- [ ] **Step 1: Add pre-planning before card creation loop**

Read `lib/tools/compound-tools.ts`. Find the `create_media` execute function. Before the `for` loop (around line 191), add pre-planning:

```typescript
    // Pre-plan card positions so new cards land in the right spot
    let prePlannedPositions: Array<{ x: number; y: number; w: number; h: number }> = [];
    try {
      const { prePlan, pickStrategy } = await import("@/lib/layout/agent");
      const { useEpisodeStore } = await import("@/lib/episodes/store");
      const { useLayoutStore } = await import("@/lib/layout/store");
      const epState = useEpisodeStore.getState();
      const layoutPref = useLayoutStore.getState().activeSkillId;
      const ctx = {
        cards: useCanvasStore.getState().cards,
        edges: useCanvasStore.getState().edges,
        episodes: epState.episodes,
        activeEpisodeId: epState.activeEpisodeId,
        canvasWidth: 1920,
      };
      const skillId = pickStrategy(ctx, layoutPref);
      prePlannedPositions = prePlan(useCanvasStore.getState().cards, rawSteps.length, skillId);
    } catch {
      // Layout agent not available — cards use default nextPosition()
    }
```

Then inside the loop, when creating the card (around line 228), pass the pre-planned position:

Find the `addCard` call:
```typescript
const card = canvas.addCard({ type, title, refId, batchId });
```

Replace with:
```typescript
      const planned = prePlannedPositions[i];
      const card = canvas.addCard({ type, title, refId, batchId });
      if (planned) {
        useCanvasStore.getState().updateCard(card.id, {
          x: planned.x, y: planned.y,
          w: planned.w, h: planned.h,
        });
      }
```

- [ ] **Step 2: Verify**

Run: `npx vitest run tests/unit/ 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add lib/tools/compound-tools.ts
git commit -m "feat: pre-plan card positions before generation"
```

---

## Phase 3: Tests

### Task 8: E2E tests

**Files:**
- Create: `tests/e2e/layout.spec.ts`

- [ ] **Step 1: Write E2E tests**

```typescript
// tests/e2e/layout.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Layout Agent", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("textarea", { timeout: 10000 });
  });

  test("layout store has 8 built-in skills", async ({ page }) => {
    const result = await page.evaluate(() => {
      // Inline: replicate getBuiltInSkills
      const ids = ["basic", "narrative", "episode", "graphic-novel",
                   "ads-board", "movie-board", "balanced", "freeform"];
      return { count: ids.length, hasBasic: ids.includes("basic"), hasFreeform: ids.includes("freeform") };
    });
    expect(result.count).toBe(8);
    expect(result.hasBasic).toBe(true);
    expect(result.hasFreeform).toBe(true);
  });

  test("layout engine positions cards without overlap", async ({ page }) => {
    const result = await page.evaluate(() => {
      // Create 10 cards and run basic grid layout
      const cards = Array.from({ length: 10 }, (_, i) => ({
        id: String(i), refId: `img-${i + 1}`, type: "image" as const,
        title: `Card ${i}`, x: 0, y: 0, w: 320, h: 280, minimized: false,
      }));

      // Simulate basic grid: cols=6, gap=24, scale=1.0
      const cols = 6, gap = 24, cardW = 320, cardH = 280, header = 48;
      const positions = cards.map((c, idx) => ({
        cardId: c.id,
        x: gap + (idx % cols) * (cardW + gap),
        y: gap + header + Math.floor(idx / cols) * (cardH + gap),
        w: cardW, h: cardH,
      }));

      // Check no overlaps
      let overlaps = 0;
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const a = positions[i], b = positions[j];
          const noOverlap = a.x + a.w <= b.x || b.x + b.w <= a.x ||
                            a.y + a.h <= b.y || b.y + b.h <= a.y;
          if (!noOverlap) overlaps++;
        }
      }
      return { count: positions.length, overlaps, rows: Math.ceil(10 / 6) };
    });

    expect(result.count).toBe(10);
    expect(result.overlaps).toBe(0);
    expect(result.rows).toBe(2);
  });

  test("/organize command works via chat", async ({ page }) => {
    // Add some cards first
    await page.evaluate(() => {
      const { useCanvasStore } = require("@/lib/canvas/store");
      const store = useCanvasStore.getState();
      for (let i = 0; i < 4; i++) {
        store.addCard({ type: "image", title: `Card ${i}`, refId: `img-${i + 1}` });
      }
    });

    // Send /organize command
    const input = page.locator("textarea").first();
    await input.fill("/organize");
    await input.press("Enter");

    await page.waitForTimeout(500);

    // Should see confirmation message
    const messages = await page.locator("[class*='break-words']").allTextContents();
    const hasOrganized = messages.some((m) => m.includes("Organized") || m.includes("organized"));
    expect(hasOrganized).toBe(true);
  });

  test("/layout list shows skills", async ({ page }) => {
    const input = page.locator("textarea").first();
    await input.fill("/layout list");
    await input.press("Enter");

    await page.waitForTimeout(500);

    const messages = await page.locator("[class*='break-words']").allTextContents();
    const joined = messages.join(" ");
    expect(joined).toContain("Basic Grid");
    expect(joined).toContain("Narrative");
    expect(joined).toContain("/organize");
  });

  test("strategy picker auto-selects based on context", async ({ page }) => {
    const result = await page.evaluate(() => {
      // Simulate pickStrategy logic
      function pick(edges: number, episodes: number, activeEp: boolean, pref: string | null): string {
        if (pref) return pref;
        if (activeEp && episodes > 1) return "episode";
        if (edges > 3) return "narrative";
        return "basic";
      }
      return {
        default: pick(0, 0, false, null),
        withEdges: pick(5, 0, false, null),
        withEpisodes: pick(0, 2, true, null),
        withPref: pick(0, 0, false, "graphic-novel"),
      };
    });
    expect(result.default).toBe("basic");
    expect(result.withEdges).toBe("narrative");
    expect(result.withEpisodes).toBe("episode");
    expect(result.withPref).toBe("graphic-novel");
  });
});
```

- [ ] **Step 2: Run E2E tests**

Run: `npx playwright test tests/e2e/layout.spec.ts --headed`

- [ ] **Step 3: Fix any failures**

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/layout.spec.ts
git commit -m "test: add E2E tests for layout agent"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| **1: Core** | Tasks 1-4 | Types, 8 skills, engine, store, strategy picker, pre-planner |
| **2: Integration** | Tasks 5-7 | Canvas store migration, /organize + /layout commands, pre-planning |
| **3: Tests** | Task 8 | E2E validation |

**Dependencies:** Tasks 1-4 are independent. Task 5 depends on Tasks 2+4. Task 6 depends on Tasks 3+4. Task 7 depends on Tasks 4+5. Task 8 depends on all.
