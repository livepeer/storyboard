# Layout Agent — Design Spec

**Goal:** Replace the current rigid autoLayout/narrativeLayout with a smart, extensible layout agent that picks the best strategy based on context, pre-plans card positions before generation, and supports user-created layout skills via `/layout capture` and `/layout add`.

**Architecture:** A pure-function layout engine driven by parameter presets. 8 built-in layout skills, user-created skills stored in Zustand/localStorage. The layout agent reads canvas state + episodes + edges to pick the best strategy automatically. Commands: `/organize <skill>`, `/layout list|add|capture|delete`.

---

## 1. Layout Skill Interface

```typescript
// lib/layout/types.ts

interface LayoutPreset {
  cols: number;              // Max cards per row (1-10)
  gap: number;               // Pixel gap between cards
  cardScale: number;         // Multiplier on CARD_W/CARD_H (0.5-2.0)
  flow: "ltr" | "zigzag" | "center-out";
  groupBy: "batch" | "episode" | "none";
  rowSeparator: number;      // Extra gap between groups (px)
  startCorner: "top-left" | "center";
}

interface LayoutSkill {
  id: string;
  name: string;
  description: string;
  category: "built-in" | "user";
  preset?: LayoutPreset;
  layoutFn?: (ctx: LayoutContext) => CardPosition[];
}

interface LayoutContext {
  cards: Card[];
  edges: ArrowEdge[];
  episodes: Episode[];
  activeEpisodeId: string | null;
  canvasWidth: number;
}

interface CardPosition {
  cardId: string;
  x: number;
  y: number;
  w?: number;   // Optional resize (for cardScale)
  h?: number;
}
```

Engine checks `layoutFn` first, falls back to `preset`. New skills default to preset mode. Power users can provide `layoutFn` for full custom behavior.

---

## 2. Shared Layout Engine

```typescript
// lib/layout/engine.ts

function runLayout(ctx: LayoutContext, skill: LayoutSkill): CardPosition[]
```

The engine:
1. Groups cards by `groupBy` (batch, episode, or none)
2. Orders within groups using BFS edge traversal (same as current autoLayout)
3. Lays out groups sequentially with `rowSeparator` between them
4. Within each group, applies `flow` pattern:
   - `ltr`: left-to-right row wrap at `cols`
   - `zigzag`: alternating L→R and R→L rows (comic book feel)
   - `center-out`: places first card at center, radiates outward (moodboard)
5. Applies `cardScale` to dimensions
6. Uses `startCorner` for origin offset

Constants from current code preserved:
- Base CARD_W = 320, CARD_H = 280 (scaled by `cardScale`)
- GAP overridden by preset `gap`
- 48px top margin for UI header

---

## 3. Built-in Skills (8)

| ID | Name | Preset | When auto-selected |
|----|------|--------|-------------------|
| `basic` | Basic Grid | cols=6, gap=24, scale=1.0, ltr, batch, sep=0, top-left | Default. Simple prompts, no episodes |
| `narrative` | Narrative Flow | cols=8, gap=24, scale=1.0, ltr, batch, sep=40, top-left | Multiple edges (story flow detected) |
| `episode` | Episode Groups | cols=6, gap=24, scale=1.0, ltr, episode, sep=60, top-left | Multiple episodes exist + one active |
| `graphic-novel` | Graphic Novel | cols=3, gap=8, scale=1.3, zigzag, batch, sep=24, top-left | User selects |
| `ads-board` | Ads Moodboard | cols=4, gap=32, scale=1.0, center-out, none, sep=0, center | User selects |
| `movie-board` | Movie Storyboard | cols=5, gap=24, scale=1.0, ltr, batch, sep=48, top-left | User selects |
| `balanced` | Balanced Flow | cols=4, gap=28, scale=1.0, ltr, batch, sep=32, top-left | User selects |
| `freeform` | Freeform | (no-op) | User selects — disables auto-layout |

---

## 4. Smart Strategy Selection

```typescript
// lib/layout/agent.ts

function pickStrategy(ctx: LayoutContext, userPref: string | null): string {
  // Explicit user preference sticks
  if (userPref) return userPref;

  // Episode active with multiple episodes → episode layout
  if (ctx.activeEpisodeId && ctx.episodes.length > 1) return "episode";

  // Many edges → story flow → narrative
  if (ctx.edges.length > 3) return "narrative";

  // Default
  return "basic";
}
```

The picked strategy is stored in the layout store so it persists across the session. It resets when the user explicitly calls `/organize <different-skill>`.

---

## 5. Pre-planning (Hybrid)

When `create_media` starts a batch of N cards:

1. Layout agent reads current canvas state
2. Calculates N open positions using the active strategy
3. Cards are created at those pre-planned positions (not `nextPosition()`)
4. After batch completes, a validation pass checks for overlap and corrects

Integration point in `compound-tools.ts`: before the step loop, call `prePlan(count, activeSkill)` to get positions. Pass each position to `addCard()`.

```typescript
// lib/layout/agent.ts

function prePlan(
  existingCards: Card[],
  newCount: number,
  skill: LayoutSkill
): Array<{ x: number; y: number; w: number; h: number }>
```

This computes where `newCount` cards should go given the existing cards on canvas, without moving existing cards.

---

## 6. Commands

### `/organize [skill-id]`

Run a layout skill on all canvas cards. If no skill-id, uses `pickStrategy()` to auto-select.

```
/organize              → auto-pick and organize
/organize narrative    → run narrative layout
/organize episode      → run episode layout
/organize graphic-novel → run graphic novel layout
/organize my-layout    → run user-created layout
```

### `/layout list`

Shows all layout skills in a formatted display in chat:

```
Layout Skills:
  ● basic          Basic Grid — Clean L→R grid, 6 per row, batch-grouped
  ● narrative      Narrative Flow — Story sequence, one row per prompt
  ● episode        Episode Groups — Clustered by episode
  ● graphic-novel  Graphic Novel — Dense 3-col panel layout
  ● ads-board      Ads Moodboard — Spacious center-out brainstorm
  ● movie-board    Movie Storyboard — Cinematic 5-col wide flow
  ● balanced       Balanced Flow — Even spacing, ideas + flow
  ● freeform       Freeform — Manual mode (no auto-layout)
  ─────────────
  ★ my-comic       My Comic Layout — Captured from canvas

  Use: /organize <name>
```

Skill names in the display are clickable (dispatched as `/organize <name>` via `chat-prefill` event, same pattern as existing `/skills/load` clickable commands in MessageBubble.tsx).

### `/layout add [name]`

Interactive skill creation:

1. If `name` provided: use it. Otherwise ask "What should I call this layout?"
2. Ask for parameters via multiple choice:
   - Columns (1-8)
   - Spacing (tight/normal/spacious)
   - Grouping (batch/episode/none)
   - Flow (left-to-right/zigzag/center-out)
3. Create a `LayoutSkill` with `category: "user"` and the preset
4. Save to layout store (persisted in localStorage)

### `/layout capture [name]`

Snapshot current canvas layout as a named skill:

1. Read all card positions from canvas
2. Infer preset parameters:
   - `cols`: count max cards in any horizontal band (within CARD_H tolerance)
   - `gap`: median distance between adjacent cards
   - `cardScale`: median(card.w / CARD_W)
   - `groupBy`: check if batchId or episodeId clusters are spatially grouped
3. Store both inferred preset AND raw positions (as `layoutFn` fallback)
4. Save with `category: "user"`

### `/layout delete [name]`

Remove a user-created layout skill. Cannot delete built-in skills.

---

## 7. Layout Store

```typescript
// lib/layout/store.ts

interface LayoutState {
  skills: LayoutSkill[];           // Built-in + user skills
  activeSkillId: string | null;    // Current strategy (null = auto-pick)
  userPreference: string | null;   // Explicit user choice (resets on context change)

  getSkill: (id: string) => LayoutSkill | undefined;
  getAllSkills: () => LayoutSkill[];
  addUserSkill: (skill: LayoutSkill) => void;
  removeUserSkill: (id: string) => void;
  setActiveSkill: (id: string | null) => void;
}
```

User skills persisted to localStorage. Built-in skills are hardcoded constants.

---

## 8. Integration with Existing Code

### Canvas Store Changes

- **Remove**: `autoLayout()`, `narrativeLayout()`, `layoutTimeline()` (replaced by engine)
- **Add**: `applyLayout(positions: CardPosition[])` — batch-update card x/y/w/h
- **Modify**: `nextPosition()` — calls `prePlan()` from layout agent instead of simple grid math

### Commands Integration

- **Modify**: `lib/skills/commands.ts` — route `/organize` and `/layout` to layout command handlers
- **Remove**: old `organizeCanvas()` function (replaced by layout agent)

### canvas_organize Tool

- **Modify**: `lib/tools/canvas-tools.ts` — `canvas_organize` calls layout agent instead of `autoLayout()` directly
- **Add parameter**: `mode` to canvas_organize tool schema so agent can request specific layouts

### compound-tools.ts

- **Modify**: card creation in `create_media` — call `prePlan()` before the step loop, use returned positions for `addCard()`

---

## 9. File Structure

### New files

| File | Responsibility |
|------|---------------|
| `lib/layout/types.ts` | LayoutSkill, LayoutPreset, LayoutContext, CardPosition interfaces |
| `lib/layout/engine.ts` | Shared layout engine: groups → orders → positions |
| `lib/layout/skills.ts` | 8 built-in skill preset definitions |
| `lib/layout/store.ts` | Zustand store: user skills, active strategy, localStorage persistence |
| `lib/layout/agent.ts` | Strategy picker + pre-planner |
| `lib/layout/commands.ts` | /organize and /layout command handlers |
| `tests/unit/layout-engine.test.ts` | Unit tests for the layout engine |
| `tests/unit/layout-agent.test.ts` | Unit tests for strategy picker + pre-planner |
| `tests/e2e/layout.spec.ts` | E2E tests for commands and visual layout |

### Modified files

| File | Changes |
|------|---------|
| `lib/canvas/store.ts` | Remove old layout functions, add `applyLayout()` |
| `lib/skills/commands.ts` | Route /organize and /layout to new handlers |
| `lib/tools/canvas-tools.ts` | canvas_organize uses layout agent, add `mode` param |
| `lib/tools/compound-tools.ts` | Pre-plan positions before card creation |

---

## 10. What This Does NOT Include (YAGNI)

- No LLM calls for layout decisions — pure function, deterministic
- No animation between layouts (cards snap to new positions)
- No per-card custom sizing in presets (only uniform cardScale)
- No import/export of layout skills (localStorage only)
- No layout undo (use `/organize` to re-run)
- No responsive layout based on browser viewport (canvas is infinite, scrollable)
- No drag-and-drop reordering within a layout
