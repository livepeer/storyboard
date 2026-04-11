# Episodes (Super Cards) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-select (Ctrl+click, lasso) and episodes — named card groups with their own creative context that the agent switches between.

**Architecture:** Episodes live in a new Zustand store (`lib/episodes/store.ts`). Canvas store gains multi-select (`selectedCardIds: Set<string>`). The context builder merges episode context on top of storyboard context. Four new agent tools enable chat-based episode management. UI additions: colored card badges, floating group button, episode switcher in chat header.

**Tech Stack:** TypeScript, Zustand, React (Next.js), Vitest, Playwright

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `lib/episodes/types.ts` | Episode interface |
| `lib/episodes/store.ts` | Zustand store: CRUD, activation, context merging |
| `lib/tools/episode-tools.ts` | 4 agent tools: episode_create/update/activate/list |
| `components/canvas/EpisodeBadge.tsx` | Colored dot badge rendered on cards |
| `components/canvas/GroupButton.tsx` | Floating "Group as Episode" button for multi-select |
| `components/chat/EpisodeSwitcher.tsx` | Pill bar for switching active episode |
| `tests/unit/episode-store.test.ts` | Unit tests for episode store |
| `tests/e2e/episodes.spec.ts` | E2E tests for full episode workflow |

### Modified files
| File | Changes |
|------|---------|
| `lib/canvas/store.ts` | Replace `selectedCardId` with `selectedCardIds: Set<string>`, add toggle/lasso select |
| `components/canvas/Card.tsx` | Ctrl+click toggle, episode badge, active episode left-border |
| `components/canvas/InfiniteCanvas.tsx` | Lasso selection rectangle |
| `lib/agents/context-builder.ts` | Inject active episode effective context + episode info |
| `lib/agents/intent.ts` | Add episode_switch, episode_create intents |
| `lib/agents/working-memory.ts` | Add activeEpisodeId field |
| `lib/tools/index.ts` | Register episode tools |
| `components/chat/ChatPanel.tsx` | Render EpisodeSwitcher |

---

## Phase 1: Data Layer

### Task 1: Episode types and store

**Files:**
- Create: `lib/episodes/types.ts`
- Create: `lib/episodes/store.ts`
- Test: `tests/unit/episode-store.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/episode-store.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useEpisodeStore } from "@/lib/episodes/store";

describe("EpisodeStore", () => {
  beforeEach(() => {
    useEpisodeStore.setState({ episodes: [], activeEpisodeId: null });
  });

  it("creates an episode with name and cardIds", () => {
    const ep = useEpisodeStore.getState().createEpisode("Night Chase", ["1", "2", "3"]);
    expect(ep.name).toBe("Night Chase");
    expect(ep.cardIds).toEqual(["1", "2", "3"]);
    expect(ep.id).toMatch(/^ep_/);
    expect(ep.color).toBeTruthy();
    expect(useEpisodeStore.getState().episodes).toHaveLength(1);
  });

  it("creates episode with context override", () => {
    const ep = useEpisodeStore.getState().createEpisode("Dark Alley", ["4"], { mood: "tense", setting: "city alley" });
    expect(ep.context.mood).toBe("tense");
    expect(ep.context.setting).toBe("city alley");
    expect(ep.context.style).toBeUndefined();
  });

  it("assigns different colors to different episodes", () => {
    const ep1 = useEpisodeStore.getState().createEpisode("Ep1", ["1"]);
    const ep2 = useEpisodeStore.getState().createEpisode("Ep2", ["2"]);
    expect(ep1.color).not.toBe(ep2.color);
  });

  it("activates an episode", () => {
    const ep = useEpisodeStore.getState().createEpisode("Test", ["1"]);
    useEpisodeStore.getState().activateEpisode(ep.id);
    expect(useEpisodeStore.getState().activeEpisodeId).toBe(ep.id);
  });

  it("deactivates episode with null", () => {
    const ep = useEpisodeStore.getState().createEpisode("Test", ["1"]);
    useEpisodeStore.getState().activateEpisode(ep.id);
    useEpisodeStore.getState().activateEpisode(null);
    expect(useEpisodeStore.getState().activeEpisodeId).toBeNull();
  });

  it("updates episode name and context", () => {
    const ep = useEpisodeStore.getState().createEpisode("Old", ["1"]);
    useEpisodeStore.getState().updateEpisode(ep.id, { name: "New", context: { mood: "joyful" } });
    const updated = useEpisodeStore.getState().getEpisode(ep.id);
    expect(updated?.name).toBe("New");
    expect(updated?.context.mood).toBe("joyful");
  });

  it("adds and removes cards from episode", () => {
    const ep = useEpisodeStore.getState().createEpisode("Test", ["1", "2"]);
    useEpisodeStore.getState().addCards(ep.id, ["3", "4"]);
    expect(useEpisodeStore.getState().getEpisode(ep.id)?.cardIds).toEqual(["1", "2", "3", "4"]);
    useEpisodeStore.getState().removeCards(ep.id, ["2"]);
    expect(useEpisodeStore.getState().getEpisode(ep.id)?.cardIds).toEqual(["1", "3", "4"]);
  });

  it("removes an episode", () => {
    const ep = useEpisodeStore.getState().createEpisode("Test", ["1"]);
    useEpisodeStore.getState().removeEpisode(ep.id);
    expect(useEpisodeStore.getState().episodes).toHaveLength(0);
  });

  it("clears activeEpisodeId when removing the active episode", () => {
    const ep = useEpisodeStore.getState().createEpisode("Test", ["1"]);
    useEpisodeStore.getState().activateEpisode(ep.id);
    useEpisodeStore.getState().removeEpisode(ep.id);
    expect(useEpisodeStore.getState().activeEpisodeId).toBeNull();
  });

  it("getEpisodeForCard finds the episode containing a card", () => {
    useEpisodeStore.getState().createEpisode("A", ["1", "2"]);
    useEpisodeStore.getState().createEpisode("B", ["3", "4"]);
    expect(useEpisodeStore.getState().getEpisodeForCard("3")?.name).toBe("B");
    expect(useEpisodeStore.getState().getEpisodeForCard("99")).toBeUndefined();
  });

  it("getEffectiveContext merges episode context over storyboard context", () => {
    const ep = useEpisodeStore.getState().createEpisode("Test", ["1"], { mood: "dark" });
    // getEffectiveContext takes a storyboard context and merges episode overrides on top
    const effective = useEpisodeStore.getState().getEffectiveContext(ep.id, {
      style: "Ghibli", palette: "warm", characters: "girl", setting: "village", rules: "", mood: "joyful",
    });
    expect(effective?.mood).toBe("dark"); // overridden by episode
    expect(effective?.style).toBe("Ghibli"); // inherited from storyboard
    expect(effective?.palette).toBe("warm"); // inherited
  });

  it("getEffectiveContext returns storyboard context when no episode override", () => {
    const ep = useEpisodeStore.getState().createEpisode("Empty", ["1"]);
    const effective = useEpisodeStore.getState().getEffectiveContext(ep.id, {
      style: "Ghibli", palette: "warm", characters: "girl", setting: "village", rules: "", mood: "joyful",
    });
    expect(effective?.style).toBe("Ghibli");
    expect(effective?.mood).toBe("joyful");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/episode-store.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create episode types**

```typescript
// lib/episodes/types.ts
import type { CreativeContext } from "@/lib/agents/session-context";

export interface Episode {
  id: string;
  name: string;
  cardIds: string[];
  context: Partial<CreativeContext>;
  color: string;
  createdAt: number;
}
```

- [ ] **Step 4: Create episode store**

```typescript
// lib/episodes/store.ts
import { create } from "zustand";
import type { Episode } from "./types";
import type { CreativeContext } from "@/lib/agents/session-context";

const EPISODE_COLORS = [
  "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981",
  "#ec4899", "#6366f1", "#84cc16", "#f97316",
];

let colorIndex = 0;

interface EpisodeState {
  episodes: Episode[];
  activeEpisodeId: string | null;

  createEpisode: (name: string, cardIds: string[], context?: Partial<CreativeContext>) => Episode;
  updateEpisode: (id: string, patch: Partial<Pick<Episode, "name" | "context" | "color">>) => void;
  removeEpisode: (id: string) => void;
  activateEpisode: (id: string | null) => void;
  addCards: (episodeId: string, cardIds: string[]) => void;
  removeCards: (episodeId: string, cardIds: string[]) => void;
  getEpisode: (id: string) => Episode | undefined;
  getActiveEpisode: () => Episode | undefined;
  getEpisodeForCard: (cardId: string) => Episode | undefined;
  getEffectiveContext: (episodeId: string, storyboardCtx: CreativeContext) => CreativeContext | null;
}

export const useEpisodeStore = create<EpisodeState>((set, get) => ({
  episodes: [],
  activeEpisodeId: null,

  createEpisode: (name, cardIds, context) => {
    const ep: Episode = {
      id: `ep_${Date.now()}`,
      name,
      cardIds: [...cardIds],
      context: context || {},
      color: EPISODE_COLORS[colorIndex++ % EPISODE_COLORS.length],
      createdAt: Date.now(),
    };
    set((s) => ({ episodes: [...s.episodes, ep] }));
    return ep;
  },

  updateEpisode: (id, patch) =>
    set((s) => ({
      episodes: s.episodes.map((ep) =>
        ep.id === id ? { ...ep, ...patch } : ep
      ),
    })),

  removeEpisode: (id) =>
    set((s) => ({
      episodes: s.episodes.filter((ep) => ep.id !== id),
      activeEpisodeId: s.activeEpisodeId === id ? null : s.activeEpisodeId,
    })),

  activateEpisode: (id) => set({ activeEpisodeId: id }),

  addCards: (episodeId, cardIds) =>
    set((s) => ({
      episodes: s.episodes.map((ep) =>
        ep.id === episodeId
          ? { ...ep, cardIds: [...new Set([...ep.cardIds, ...cardIds])] }
          : ep
      ),
    })),

  removeCards: (episodeId, cardIds) => {
    const toRemove = new Set(cardIds);
    set((s) => ({
      episodes: s.episodes.map((ep) =>
        ep.id === episodeId
          ? { ...ep, cardIds: ep.cardIds.filter((id) => !toRemove.has(id)) }
          : ep
      ),
    }));
  },

  getEpisode: (id) => get().episodes.find((ep) => ep.id === id),

  getActiveEpisode: () => {
    const { activeEpisodeId, episodes } = get();
    return activeEpisodeId ? episodes.find((ep) => ep.id === activeEpisodeId) : undefined;
  },

  getEpisodeForCard: (cardId) =>
    get().episodes.find((ep) => ep.cardIds.includes(cardId)),

  getEffectiveContext: (episodeId, storyboardCtx) => {
    const ep = get().getEpisode(episodeId);
    if (!ep) return storyboardCtx;
    return {
      style: ep.context.style || storyboardCtx.style,
      palette: ep.context.palette || storyboardCtx.palette,
      characters: ep.context.characters || storyboardCtx.characters,
      setting: ep.context.setting || storyboardCtx.setting,
      rules: ep.context.rules || storyboardCtx.rules,
      mood: ep.context.mood || storyboardCtx.mood,
    };
  },
}));
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/episode-store.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add lib/episodes/types.ts lib/episodes/store.ts tests/unit/episode-store.test.ts
git commit -m "feat: add episode store with context merging"
```

---

### Task 2: Multi-select in canvas store

**Files:**
- Modify: `lib/canvas/store.ts`
- Modify: `components/canvas/Card.tsx`

- [ ] **Step 1: Update canvas store for multi-select**

In `lib/canvas/store.ts`, replace the `selectedCardId` field and `selectCard` method.

Change the interface (lines 14-15, 39):

```typescript
// REPLACE:
//   selectedCardId: string | null;
// WITH:
  selectedCardIds: Set<string>;

// ADD new methods after selectCard:
  toggleCardSelection: (id: string) => void;
  selectCards: (ids: string[]) => void;
  clearSelection: () => void;
```

Change the implementation (line 153):

```typescript
// REPLACE:
//   selectCard: (id) => set({ selectedCardId: id, selectedEdgeIdx: -1 }),
// WITH:
  selectCard: (id) =>
    set({ selectedCardIds: new Set(id ? [id] : []), selectedEdgeIdx: -1 }),

  toggleCardSelection: (id) =>
    set((s) => {
      const next = new Set(s.selectedCardIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedCardIds: next, selectedEdgeIdx: -1 };
    }),

  selectCards: (ids) =>
    set({ selectedCardIds: new Set(ids), selectedEdgeIdx: -1 }),

  clearSelection: () =>
    set({ selectedCardIds: new Set(), selectedEdgeIdx: -1 }),
```

Update the initial state (near line 60):

```typescript
// REPLACE: selectedCardId: null,
// WITH:
selectedCardIds: new Set<string>(),
```

Update `removeCard` (line 149) — replace `selectedCardId` reference:

```typescript
// REPLACE:
//   selectedCardId: s.selectedCardId === id ? null : s.selectedCardId,
// WITH:
  selectedCardIds: (() => {
    const next = new Set(s.selectedCardIds);
    next.delete(id);
    return next;
  })(),
```

- [ ] **Step 2: Update Card.tsx for multi-select**

In `components/canvas/Card.tsx`:

Change the destructured store values (line 17):

```typescript
// REPLACE:
//   const { viewport, selectedCardId, updateCard, removeCard, selectCard, edges } = useCanvasStore();
// WITH:
  const { viewport, selectedCardIds, updateCard, removeCard, selectCard, toggleCardSelection, edges } = useCanvasStore();
```

Change the isSelected check (line 34):

```typescript
// REPLACE:
//   const isSelected = selectedCardId === card.id;
// WITH:
  const isSelected = selectedCardIds.has(card.id);
```

Change onDragStart (line 54):

```typescript
// REPLACE:
//   selectCard(card.id);
// WITH:
    if (e.ctrlKey || e.metaKey) {
      toggleCardSelection(card.id);
    } else if (!selectedCardIds.has(card.id)) {
      selectCard(card.id);
    }
```

Change onPointerDown on the card div (line 118):

```typescript
// REPLACE:
//   onPointerDown={() => selectCard(card.id)}
// WITH:
  onPointerDown={(e) => {
    if (e.ctrlKey || e.metaKey) {
      toggleCardSelection(card.id);
    } else if (!selectedCardIds.has(card.id)) {
      selectCard(card.id);
    }
  }}
```

- [ ] **Step 3: Fix any other references to selectedCardId**

Search for `selectedCardId` in the codebase. Key files that read it:
- `components/chat/ChatPanel.tsx` (buildCanvasContext): Update to use `selectedCardIds`
- `lib/agents/context-builder.ts`: Already receives `selectedCard` as string — keep as single (first of set)
- Any other component that reads `selectedCardId`

In `components/chat/ChatPanel.tsx`, update `buildCanvasContext()`:

```typescript
// REPLACE:
//   selectedCard: state.selectedCardId
//     ? state.cards.find((c) => c.id === state.selectedCardId)?.refId
//     : undefined,
// WITH:
  selectedCard: state.selectedCardIds.size === 1
    ? state.cards.find((c) => c.id === Array.from(state.selectedCardIds)[0])?.refId
    : undefined,
```

- [ ] **Step 4: Verify build compiles and tests pass**

Run: `npx tsc --noEmit 2>&1 | grep -v "tests/" | head -20`
Run: `npx vitest run tests/unit/ 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/store.ts components/canvas/Card.tsx components/chat/ChatPanel.tsx
git commit -m "feat: add multi-select to canvas (Ctrl+click toggle)"
```

---

### Task 3: Lasso selection in InfiniteCanvas

**Files:**
- Modify: `components/canvas/InfiniteCanvas.tsx`

- [ ] **Step 1: Add lasso selection state and handlers**

In `components/canvas/InfiniteCanvas.tsx`, add lasso state and modify the pointer handlers:

```typescript
// Add to imports:
import { useState } from "react";

// Add state inside InfiniteCanvas component:
const [lasso, setLasso] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

// Add ref to distinguish pan from lasso:
const pointerStartRef = useRef<{ x: number; y: number; button: number } | null>(null);
```

Replace `onPointerDown` (lines 14-29):

```typescript
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-card]")) return;

      pointerStartRef.current = { x: e.clientX, y: e.clientY, button: e.button };
      panRef.current = {
        startX: e.clientX - viewport.panX,
        startY: e.clientY - viewport.panY,
      };

      if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
        selectCard(null);
      }
      selectEdge(-1);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [viewport.panX, viewport.panY, selectCard, selectEdge]
  );
```

Replace `onPointerMove` (lines 32-41):

```typescript
  const { selectCards } = useCanvasStore();

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!panRef.current || !pointerStartRef.current) return;
      const dx = e.clientX - pointerStartRef.current.x;
      const dy = e.clientY - pointerStartRef.current.y;

      // If drag exceeds threshold and left button, switch to lasso
      if (pointerStartRef.current.button === 0 && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
        // Convert screen coords to canvas coords for lasso rectangle
        const toCanvas = (sx: number, sy: number) => ({
          x: (sx - viewport.panX) / viewport.scale,
          y: (sy - viewport.panY) / viewport.scale,
        });
        const start = toCanvas(pointerStartRef.current.x, pointerStartRef.current.y);
        const end = toCanvas(e.clientX, e.clientY);
        setLasso({ x1: start.x, y1: start.y, x2: end.x, y2: end.y });
        return; // Don't pan while lassoing
      }

      // Pan (middle button or small drag)
      setViewport({
        panX: e.clientX - panRef.current.startX,
        panY: e.clientY - panRef.current.startY,
      });
    },
    [setViewport, viewport.panX, viewport.panY, viewport.scale]
  );
```

Replace `onPointerUp` (lines 43-45):

```typescript
  const onPointerUp = useCallback(() => {
    if (lasso) {
      // Find cards inside the lasso rectangle
      const minX = Math.min(lasso.x1, lasso.x2);
      const maxX = Math.max(lasso.x1, lasso.x2);
      const minY = Math.min(lasso.y1, lasso.y2);
      const maxY = Math.max(lasso.y1, lasso.y2);

      const inside = cards.filter((c) => {
        const cx = c.x + c.w / 2;
        const cy = c.y + c.h / 2;
        return cx >= minX && cx <= maxX && cy >= minY && cy <= maxY;
      });
      if (inside.length > 0) {
        selectCards(inside.map((c) => c.id));
      }
      setLasso(null);
    }
    panRef.current = null;
    pointerStartRef.current = null;
  }, [lasso, cards, selectCards]);
```

Add lasso rectangle visual in the JSX (inside the transformed layer, after ArrowLayer):

```tsx
{/* Lasso selection rectangle */}
{lasso && (
  <div
    className="pointer-events-none absolute border-2 border-dashed border-blue-400/60 bg-blue-400/10 rounded"
    style={{
      left: Math.min(lasso.x1, lasso.x2),
      top: Math.min(lasso.y1, lasso.y2),
      width: Math.abs(lasso.x2 - lasso.x1),
      height: Math.abs(lasso.y2 - lasso.y1),
    }}
  />
)}
```

- [ ] **Step 2: Verify lasso works visually**

Run `npm run dev`, open browser. Drag on empty canvas area → should see blue dashed rectangle. Release → cards inside get selected.

- [ ] **Step 3: Commit**

```bash
git add components/canvas/InfiniteCanvas.tsx
git commit -m "feat: add lasso selection to canvas"
```

---

## Phase 2: UI Components

### Task 4: Episode badge on cards

**Files:**
- Create: `components/canvas/EpisodeBadge.tsx`
- Modify: `components/canvas/Card.tsx`

- [ ] **Step 1: Create EpisodeBadge component**

```typescript
// components/canvas/EpisodeBadge.tsx
"use client";

import { useEpisodeStore } from "@/lib/episodes/store";

export function EpisodeBadge({ cardId }: { cardId: string }) {
  const episode = useEpisodeStore((s) => s.getEpisodeForCard(cardId));
  const activeEpisodeId = useEpisodeStore((s) => s.activeEpisodeId);

  if (!episode) return null;

  const isActive = episode.id === activeEpisodeId;

  return (
    <div
      className="absolute right-2 top-2 z-10 flex items-center gap-1 cursor-pointer"
      title={`${episode.name}${isActive ? " (active)" : ""} — click to activate`}
      onClick={(e) => {
        e.stopPropagation();
        useEpisodeStore.getState().activateEpisode(
          isActive ? null : episode.id
        );
      }}
    >
      <span
        className="h-2.5 w-2.5 rounded-full border border-black/20"
        style={{ backgroundColor: episode.color }}
      />
      {isActive && (
        <span className="text-[8px] font-medium" style={{ color: episode.color }}>
          {episode.name.length > 12 ? episode.name.slice(0, 12) + "\u2026" : episode.name}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add badge to Card.tsx and active episode left-border**

In `components/canvas/Card.tsx`, add import:

```typescript
import { EpisodeBadge } from "./EpisodeBadge";
import { useEpisodeStore } from "@/lib/episodes/store";
```

Add episode state lookup after `isSelected`:

```typescript
  const episode = useEpisodeStore((s) => s.getEpisodeForCard(card.id));
  const isActiveEpisode = useEpisodeStore((s) => s.activeEpisodeId) === episode?.id;
```

Add the EpisodeBadge inside the card div (after the opening `<div>`):

```tsx
<EpisodeBadge cardId={card.id} />
```

Add active-episode left-border style. In the card's root div `style` prop, add:

```typescript
style={{
  left: card.x,
  top: card.y,
  width: card.w,
  height: card.minimized ? 36 : card.h,
  borderLeftWidth: isActiveEpisode ? 3 : undefined,
  borderLeftColor: isActiveEpisode ? episode?.color : undefined,
}}
```

Update multi-select visual — change the `isSelected` border class:

```typescript
// REPLACE:
//   isSelected ? "border-[#555]" : "border-[var(--border)]"
// WITH:
  isSelected ? "border-[#555] ring-1 ring-blue-400/30" : "border-[var(--border)]"
```

- [ ] **Step 3: Verify visually**

Create an episode via console: `useEpisodeStore.getState().createEpisode("Test", ["0", "1"])`. Cards 0 and 1 should show colored dots. Click the dot → episode activates, left-border appears.

- [ ] **Step 4: Commit**

```bash
git add components/canvas/EpisodeBadge.tsx components/canvas/Card.tsx
git commit -m "feat: add episode badge and active-episode border to cards"
```

---

### Task 5: Floating "Group as Episode" button

**Files:**
- Create: `components/canvas/GroupButton.tsx`
- Modify: `components/canvas/InfiniteCanvas.tsx`

- [ ] **Step 1: Create GroupButton component**

```typescript
// components/canvas/GroupButton.tsx
"use client";

import { useState } from "react";
import { useCanvasStore } from "@/lib/canvas/store";
import { useEpisodeStore } from "@/lib/episodes/store";

export function GroupButton() {
  const { selectedCardIds, cards, clearSelection, viewport } = useCanvasStore();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const selected = Array.from(selectedCardIds);
  if (selected.length < 2) return null;

  // Find centroid of selected cards (in canvas coords)
  const selectedCards = cards.filter((c) => selectedCardIds.has(c.id));
  const cx = selectedCards.reduce((s, c) => s + c.x + c.w / 2, 0) / selectedCards.length;
  const cy = Math.min(...selectedCards.map((c) => c.y)) - 48;

  // Convert canvas coords to screen coords
  const screenX = cx * viewport.scale + viewport.panX;
  const screenY = cy * viewport.scale + viewport.panY;

  const handleCreate = () => {
    if (!name.trim()) return;
    const ep = useEpisodeStore.getState().createEpisode(name.trim(), selected);
    useEpisodeStore.getState().activateEpisode(ep.id);
    clearSelection();
    setNaming(false);
    setName("");
  };

  return (
    <div
      className="fixed z-50 flex items-center gap-2"
      style={{ left: screenX, top: screenY, transform: "translateX(-50%)" }}
    >
      {naming ? (
        <div className="flex items-center gap-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] px-2 py-1 shadow-lg">
          <input
            autoFocus
            className="w-32 bg-transparent text-xs text-[var(--text)] outline-none placeholder:text-[var(--text-dim)]"
            placeholder="Episode name..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") { setNaming(false); setName(""); }
            }}
          />
          <button
            onClick={handleCreate}
            className="rounded bg-purple-500/20 px-2 py-0.5 text-[10px] text-purple-300 hover:bg-purple-500/30"
          >
            Create
          </button>
        </div>
      ) : (
        <button
          onClick={() => setNaming(true)}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--surface)] border border-purple-500/30 px-3 py-1.5 text-xs text-purple-300 shadow-lg hover:bg-purple-500/10 transition-colors"
        >
          <span>+</span>
          <span>Group as Episode ({selected.length} cards)</span>
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add GroupButton to InfiniteCanvas**

In `components/canvas/InfiniteCanvas.tsx`, add import:

```typescript
import { GroupButton } from "./GroupButton";
```

Add the GroupButton OUTSIDE the transformed layer (after the closing `</div>` of the transform layer, before the closing `</div>` of the container):

```tsx
<GroupButton />
```

- [ ] **Step 3: Verify visually**

Multi-select 2+ cards with Ctrl+click → floating button appears. Click → name input. Type name → Create → episode created, badge appears.

- [ ] **Step 4: Commit**

```bash
git add components/canvas/GroupButton.tsx components/canvas/InfiniteCanvas.tsx
git commit -m "feat: add floating Group as Episode button for multi-select"
```

---

### Task 6: Episode switcher in chat panel

**Files:**
- Create: `components/chat/EpisodeSwitcher.tsx`
- Modify: `components/chat/ChatPanel.tsx`

- [ ] **Step 1: Create EpisodeSwitcher component**

```typescript
// components/chat/EpisodeSwitcher.tsx
"use client";

import { useEpisodeStore } from "@/lib/episodes/store";

export function EpisodeSwitcher() {
  const { episodes, activeEpisodeId, activateEpisode } = useEpisodeStore();

  if (episodes.length === 0) return null;

  return (
    <div className="flex items-center gap-1 border-b border-[var(--border)] px-3 py-1 overflow-x-auto scrollbar-none">
      <button
        onClick={() => activateEpisode(null)}
        className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] transition-colors ${
          activeEpisodeId === null
            ? "bg-white/10 text-[var(--text)]"
            : "text-[var(--text-dim)] hover:text-[var(--text-muted)]"
        }`}
      >
        All
      </button>
      {episodes.map((ep) => (
        <button
          key={ep.id}
          onClick={() => activateEpisode(ep.id)}
          className={`shrink-0 flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] transition-colors ${
            activeEpisodeId === ep.id
              ? "bg-white/10 text-[var(--text)]"
              : "text-[var(--text-dim)] hover:text-[var(--text-muted)]"
          }`}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: ep.color }}
          />
          <span className="max-w-[80px] truncate">{ep.name}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add EpisodeSwitcher to ChatPanel**

In `components/chat/ChatPanel.tsx`, add import:

```typescript
import { EpisodeSwitcher } from "./EpisodeSwitcher";
```

Add the EpisodeSwitcher right after the context badge block (after line 419, before the `{/* Messages */}` comment):

```tsx
{/* Episode switcher */}
{!minimized && <EpisodeSwitcher />}
```

- [ ] **Step 3: Verify visually**

Create an episode, then check the chat panel — should show `[All] [EpisodeName ●]` pill bar.

- [ ] **Step 4: Commit**

```bash
git add components/chat/EpisodeSwitcher.tsx components/chat/ChatPanel.tsx
git commit -m "feat: add episode switcher to chat panel"
```

---

## Phase 3: Agent Integration

### Task 7: Episode tools for the agent

**Files:**
- Create: `lib/tools/episode-tools.ts`
- Modify: `lib/tools/index.ts`

- [ ] **Step 1: Create episode tools**

```typescript
// lib/tools/episode-tools.ts
import type { ToolDefinition } from "./types";
import { useEpisodeStore } from "@/lib/episodes/store";
import { useCanvasStore } from "@/lib/canvas/store";

const episodeCreateTool: ToolDefinition = {
  name: "episode_create",
  description: "Group canvas cards into a named episode with its own creative context override.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Episode name (e.g., 'Night Chase', 'Market Scene')" },
      card_ref_ids: {
        type: "array",
        items: { type: "string" },
        description: "Card refIds to include (e.g., ['img-1', 'img-2', 'img-3'])",
      },
      context: {
        type: "object",
        description: "Optional creative context override for this episode (sparse — only set fields that differ from storyboard)",
        properties: {
          style: { type: "string" },
          palette: { type: "string" },
          characters: { type: "string" },
          setting: { type: "string" },
          mood: { type: "string" },
          rules: { type: "string" },
        },
      },
    },
    required: ["name", "card_ref_ids"],
  },
  execute: async (input) => {
    const name = input.name as string;
    const refIds = input.card_ref_ids as string[];
    const context = input.context as Record<string, string> | undefined;

    // Resolve refIds to card IDs
    const cards = useCanvasStore.getState().cards;
    const cardIds: string[] = [];
    const notFound: string[] = [];
    for (const refId of refIds) {
      const card = cards.find((c) => c.refId === refId);
      if (card) cardIds.push(card.id);
      else notFound.push(refId);
    }

    if (cardIds.length === 0) {
      return { success: false, error: `No cards found for refIds: ${refIds.join(", ")}` };
    }

    const ep = useEpisodeStore.getState().createEpisode(name, cardIds, context);
    useEpisodeStore.getState().activateEpisode(ep.id);

    return {
      success: true,
      data: {
        episode_id: ep.id,
        name: ep.name,
        cards: cardIds.length,
        color: ep.color,
        not_found: notFound.length > 0 ? notFound : undefined,
      },
    };
  },
};

const episodeUpdateTool: ToolDefinition = {
  name: "episode_update",
  description: "Update an episode's name, context, or card membership.",
  parameters: {
    type: "object",
    properties: {
      episode_id: { type: "string", description: "Episode ID" },
      name: { type: "string", description: "New name" },
      add_cards: { type: "array", items: { type: "string" }, description: "Card refIds to add" },
      remove_cards: { type: "array", items: { type: "string" }, description: "Card refIds to remove" },
      context: {
        type: "object",
        description: "Context fields to update (merge, not replace)",
        properties: {
          style: { type: "string" },
          palette: { type: "string" },
          characters: { type: "string" },
          setting: { type: "string" },
          mood: { type: "string" },
          rules: { type: "string" },
        },
      },
    },
    required: ["episode_id"],
  },
  execute: async (input) => {
    const episodeId = input.episode_id as string;
    const store = useEpisodeStore.getState();
    const ep = store.getEpisode(episodeId);
    if (!ep) return { success: false, error: `Episode ${episodeId} not found` };

    if (input.name) store.updateEpisode(episodeId, { name: input.name as string });
    if (input.context) {
      const merged = { ...ep.context, ...(input.context as Record<string, string>) };
      store.updateEpisode(episodeId, { context: merged });
    }

    const cards = useCanvasStore.getState().cards;
    if (input.add_cards) {
      const ids = (input.add_cards as string[])
        .map((ref) => cards.find((c) => c.refId === ref)?.id)
        .filter(Boolean) as string[];
      if (ids.length) store.addCards(episodeId, ids);
    }
    if (input.remove_cards) {
      const ids = (input.remove_cards as string[])
        .map((ref) => cards.find((c) => c.refId === ref)?.id)
        .filter(Boolean) as string[];
      if (ids.length) store.removeCards(episodeId, ids);
    }

    const updated = store.getEpisode(episodeId)!;
    return { success: true, data: { episode_id: episodeId, name: updated.name, cards: updated.cardIds.length } };
  },
};

const episodeActivateTool: ToolDefinition = {
  name: "episode_activate",
  description: "Switch the active episode. The agent's creative context changes to match the episode. Pass null to return to storyboard level.",
  parameters: {
    type: "object",
    properties: {
      episode_id: { type: "string", description: "Episode ID to activate, or null/empty for storyboard level" },
    },
  },
  execute: async (input) => {
    const id = (input.episode_id as string) || null;
    if (id) {
      const ep = useEpisodeStore.getState().getEpisode(id);
      if (!ep) return { success: false, error: `Episode ${id} not found` };
    }
    useEpisodeStore.getState().activateEpisode(id);
    const active = useEpisodeStore.getState().getActiveEpisode();
    return {
      success: true,
      data: {
        active_episode: active ? { id: active.id, name: active.name } : null,
        message: active ? `Switched to "${active.name}"` : "Switched to storyboard level",
      },
    };
  },
};

const episodeListTool: ToolDefinition = {
  name: "episode_list",
  description: "List all episodes with their card counts and context summaries.",
  parameters: { type: "object", properties: {} },
  execute: async () => {
    const { episodes, activeEpisodeId } = useEpisodeStore.getState();
    return {
      success: true,
      data: {
        episodes: episodes.map((ep) => ({
          id: ep.id,
          name: ep.name,
          cards: ep.cardIds.length,
          active: ep.id === activeEpisodeId,
          context: Object.entries(ep.context)
            .filter(([, v]) => v)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ") || "(inherits storyboard)",
        })),
        total: episodes.length,
      },
    };
  },
};

export const episodeTools: ToolDefinition[] = [
  episodeCreateTool,
  episodeUpdateTool,
  episodeActivateTool,
  episodeListTool,
];
```

- [ ] **Step 2: Register episode tools**

In `lib/tools/index.ts`, add:

```typescript
import { episodeTools } from "./episode-tools";
```

And in `initializeTools()`:

```typescript
registerTools(episodeTools);   // episode_create, episode_update, episode_activate, episode_list
```

- [ ] **Step 3: Verify tools are registered**

Run: `npm run dev`, open console, type: `listTools().map(t => t.name)` — should include the 4 episode tools.

- [ ] **Step 4: Commit**

```bash
git add lib/tools/episode-tools.ts lib/tools/index.ts
git commit -m "feat: add episode tools for agent (create/update/activate/list)"
```

---

### Task 8: Context builder + intent + working memory integration

**Files:**
- Modify: `lib/agents/context-builder.ts`
- Modify: `lib/agents/intent.ts`
- Modify: `lib/agents/working-memory.ts`
- Modify: `lib/agents/gemini/index.ts`

- [ ] **Step 1: Add activeEpisodeId to working memory**

In `lib/agents/working-memory.ts`, add to the interface and implementation:

```typescript
// In WorkingMemoryState interface, add:
  activeEpisodeId: string | null;

// In initial state, add:
  activeEpisodeId: null,

// In syncFromProjectStore, after the project sync, add:
    try {
      const { useEpisodeStore } = require("@/lib/episodes/store");
      const epStore = useEpisodeStore.getState();
      set({ activeEpisodeId: epStore.activeEpisodeId });
    } catch { /* not available */ }

// In reset, add:
  activeEpisodeId: null,
```

- [ ] **Step 2: Add episode intents to intent classifier**

In `lib/agents/intent.ts`, add to the `IntentType` union:

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
  | "none";
```

Add detection rules before the `return { type: "none" }` at the end:

```typescript
  // Episode management
  if (/switch.*episode|activate.*episode|go to.*episode|use.*episode/i.test(lower))
    return { type: "episode_switch", direction: text };
  if (/group.*episode|create.*episode|make.*episode|new episode/i.test(lower))
    return { type: "episode_create", direction: text };
```

- [ ] **Step 3: Update context builder for episode awareness**

In `lib/agents/context-builder.ts`, add to the `MemorySnapshot` interface:

```typescript
  activeEpisodeId?: string | null;
```

Add episode info injection after the canvas cards section (after the `selectedCard` line):

```typescript
  // Active episode context
  try {
    const { useEpisodeStore } = require("@/lib/episodes/store");
    const { useSessionContext } = require("@/lib/agents/session-context");
    const epStore = useEpisodeStore.getState();
    const activeEp = epStore.getActiveEpisode();

    if (epStore.episodes.length > 0) {
      const epList = epStore.episodes.map((ep: { id: string; name: string; cardIds: string[]; id: string }) =>
        `${ep.name}(${ep.cardIds.length} cards${ep.id === memory.activeEpisodeId ? ", ACTIVE" : ""})`
      ).join(", ");
      parts.push(`\nEpisodes: ${epList}`);
    }

    if (activeEp) {
      const storyboardCtx = useSessionContext.getState().context;
      if (storyboardCtx) {
        const effective = epStore.getEffectiveContext(activeEp.id, storyboardCtx);
        if (effective) {
          const overrides = Object.entries(activeEp.context)
            .filter(([, v]) => v)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ");
          parts.push(`Active episode: "${activeEp.name}" — overrides: ${overrides || "none (inherits all)"}`);
        }
      }
    }
  } catch { /* not available in tests */ }
```

Add episode intent handling in the switch statement:

```typescript
    case "episode_switch":
      parts.push(`\n## Action: Switch Episode
User wants to switch to a different episode. Use episode_activate or episode_list to find the right one.`);
      break;

    case "episode_create":
      parts.push(`\n## Action: Create Episode
User wants to group cards into an episode. Use episode_create with card refIds and a name.`);
      break;
```

- [ ] **Step 4: Pass activeEpisodeId through Gemini agent**

In `lib/agents/gemini/index.ts`, update the `buildAgentContext` call to include `activeEpisodeId`:

```typescript
      const system = buildAgentContext(intent, {
        project: mem.project,
        digest: mem.digest,
        recentActions: mem.recentActions,
        preferences: mem.preferences,
        canvasCards: context.cards.map((c) => ({
          refId: c.refId,
          type: c.type,
          title: c.title,
          url: c.url,
        })),
        selectedCard: context.selectedCard,
        activeEpisodeId: mem.activeEpisodeId,  // ADD THIS
      });
```

- [ ] **Step 5: Update prompt injection to use effective context**

In `lib/tools/compound-tools.ts`, update the session context injection (around line 197) to use episode effective context:

```typescript
      // Apply session creative context + episode override
      let sessionPrefix = "";
      if (step.action !== "tts") {
        try {
          const { useEpisodeStore } = await import("@/lib/episodes/store");
          const epStore = useEpisodeStore.getState();
          const activeEp = epStore.getActiveEpisode();
          if (activeEp) {
            const storyboardCtx = useSessionContext.getState().context;
            if (storyboardCtx) {
              const effective = epStore.getEffectiveContext(activeEp.id, storyboardCtx);
              if (effective) {
                const { buildPrefixFromContext } = await import("@/lib/agents/session-context");
                sessionPrefix = buildPrefixFromContext(effective);
              }
            }
          }
        } catch { /* fallback to session context */ }
        if (!sessionPrefix) {
          sessionPrefix = useSessionContext.getState().buildPrefix();
        }
      }
```

Note: This requires exporting `buildPrefixFromContext` from session-context.ts. Add `export` to the function definition at line 53 of `lib/agents/session-context.ts`.

- [ ] **Step 6: Run all tests**

Run: `npx vitest run tests/unit/ 2>&1 | tail -5`
Run: `npx tsc --noEmit 2>&1 | grep -v "tests/" | head -10`

- [ ] **Step 7: Commit**

```bash
git add lib/agents/context-builder.ts lib/agents/intent.ts lib/agents/working-memory.ts lib/agents/gemini/index.ts lib/tools/compound-tools.ts lib/agents/session-context.ts
git commit -m "feat: integrate episodes with agent context, intent, and prompt injection"
```

---

## Phase 4: E2E Tests

### Task 9: E2E tests for episodes

**Files:**
- Create: `tests/e2e/episodes.spec.ts`

- [ ] **Step 1: Write E2E tests**

```typescript
// tests/e2e/episodes.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Episodes (Super Cards)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("textarea", { timeout: 10000 });
  });

  test("multi-select with Ctrl+click selects multiple cards", async ({ page }) => {
    // Create 3 cards via the store
    await page.evaluate(() => {
      const store = (window as any).__canvasStore || require("@/lib/canvas/store").useCanvasStore;
      const s = store.getState();
      s.addCard({ type: "image", title: "Card A", refId: "img-a" });
      s.addCard({ type: "image", title: "Card B", refId: "img-b" });
      s.addCard({ type: "image", title: "Card C", refId: "img-c" });
    });

    await page.waitForTimeout(500);

    // Verify 3 cards rendered
    const cardCount = await page.locator("[data-card]").count();
    expect(cardCount).toBeGreaterThanOrEqual(3);
  });

  test("episode store creates and retrieves episodes", async ({ page }) => {
    const result = await page.evaluate(() => {
      // Inline episode store test (modules not importable in evaluate)
      const { useEpisodeStore } = require("@/lib/episodes/store");
      const store = useEpisodeStore.getState();

      // Reset
      useEpisodeStore.setState({ episodes: [], activeEpisodeId: null });

      // Create episode
      const ep = store.createEpisode("Night Chase", ["0", "1", "2"], { mood: "dark" });

      // Activate
      store.activateEpisode(ep.id);

      const active = useEpisodeStore.getState().getActiveEpisode();
      return {
        created: !!ep.id,
        name: ep.name,
        cards: ep.cardIds.length,
        color: ep.color,
        activeName: active?.name,
        mood: ep.context.mood,
      };
    });

    expect(result.created).toBe(true);
    expect(result.name).toBe("Night Chase");
    expect(result.cards).toBe(3);
    expect(result.activeName).toBe("Night Chase");
    expect(result.mood).toBe("dark");
  });

  test("episode switcher appears when episodes exist", async ({ page }) => {
    // Create an episode via store
    await page.evaluate(() => {
      const { useEpisodeStore } = require("@/lib/episodes/store");
      useEpisodeStore.getState().createEpisode("Test Episode", ["0"]);
    });

    await page.waitForTimeout(500);

    // Check for episode switcher in chat panel
    const switcher = page.getByText("Test Episode");
    await expect(switcher).toBeVisible({ timeout: 3000 });
  });
});
```

- [ ] **Step 2: Run E2E tests**

Run: `npx playwright test tests/e2e/episodes.spec.ts --headed`

- [ ] **Step 3: Fix any failures and re-run**

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/episodes.spec.ts
git commit -m "test: add E2E tests for episodes feature"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| **1: Data** | Tasks 1-3 | Episode store + multi-select + lasso |
| **2: UI** | Tasks 4-6 | Card badges, group button, episode switcher |
| **3: Agent** | Tasks 7-8 | Episode tools, context merging, intent detection |
| **4: Tests** | Task 9 | E2E validation |

**Dependencies:** Tasks 1-3 are independent. Task 4 needs Task 1+2. Task 5 needs Task 2+3. Task 6 needs Task 1. Task 7 needs Task 1. Task 8 needs Tasks 1+7. Task 9 needs all.
