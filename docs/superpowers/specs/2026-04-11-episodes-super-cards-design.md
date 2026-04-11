# Episodes (Super Cards) — Design Spec

**Goal:** Add a 3-level context hierarchy (Card → Episode → Storyboard) so users can group cards into named episodes, each with its own creative context override, and the agent switches context when the active episode changes.

**Architecture:** Episodes are a lightweight grouping layer stored in a new Zustand store. Each episode holds a sparse `Partial<CreativeContext>` that merges on top of the storyboard-level session context. Multi-select (Ctrl+click, lasso) enables grouping. The agent's context builder reads the active episode to assemble the system prompt.

---

## 1. Data Model

### Episode Type

```typescript
// lib/episodes/types.ts

interface Episode {
  id: string;                          // "ep_<timestamp>"
  name: string;                        // User-given name
  cardIds: string[];                   // Canvas card IDs belonging to this episode
  context: Partial<CreativeContext>;    // Override fields (sparse — unset fields inherit from storyboard)
  color: string;                       // Visual color for badges/borders
  createdAt: number;
}
```

- Cards belong to **zero or one** episode. Ungrouped cards use storyboard context.
- `context` is partial: `{ mood: "dark, tense" }` means only mood is overridden; style/palette/characters fall through from storyboard.

### Episode Store

```typescript
// lib/episodes/store.ts

interface EpisodeState {
  episodes: Episode[];
  activeEpisodeId: string | null;

  createEpisode: (name: string, cardIds: string[], context?: Partial<CreativeContext>) => Episode;
  updateEpisode: (id: string, patch: Partial<Omit<Episode, "id" | "createdAt">>) => void;
  removeEpisode: (id: string) => void;
  activateEpisode: (id: string | null) => void;

  addCards: (episodeId: string, cardIds: string[]) => void;
  removeCards: (episodeId: string, cardIds: string[]) => void;

  getEpisode: (id: string) => Episode | undefined;
  getActiveEpisode: () => Episode | undefined;
  getEpisodeForCard: (cardId: string) => Episode | undefined;

  /** Merge episode context on top of storyboard context */
  getEffectiveContext: (episodeId: string) => CreativeContext | null;
}
```

Color assignment: cycle through a fixed palette of 8 muted colors (`#8b5cf6`, `#06b6d4`, `#f59e0b`, `#10b981`, `#ec4899`, `#6366f1`, `#84cc16`, `#f97316`) on creation.

---

## 2. Multi-Select

### Canvas Store Changes

```typescript
// lib/canvas/store.ts — changes

// REPLACE:
//   selectedCardId: string | null;
//   selectCard: (id: string | null) => void;
// WITH:
  selectedCardIds: Set<string>;
  selectCard: (id: string | null) => void;        // Single select (clears others)
  toggleCardSelection: (id: string) => void;       // Ctrl+click toggle
  selectCards: (ids: string[]) => void;            // Lasso bulk select
  clearSelection: () => void;
```

`selectCard(id)` clears the set and adds the single id (backward compatible). `toggleCardSelection(id)` adds or removes from set. `selectCards(ids)` replaces the set.

### Backward Compatibility

Existing code uses `selectedCardId`. Add a computed getter:

```typescript
// Derived for backward compat — returns first selected card or null
get selectedCardId(): string | null {
  const ids = Array.from(this.selectedCardIds);
  return ids.length === 1 ? ids[0] : null;
}
```

Components that read `selectedCardId` (Card.tsx info banner, CanvasContext, context menu) continue to work for single selection. Multi-select only matters for episode creation.

### Card.tsx Changes

```typescript
// In onDragStart / onPointerDown:
if (e.ctrlKey || e.metaKey) {
  toggleCardSelection(card.id);
} else {
  selectCard(card.id);
}
```

Visual: cards in `selectedCardIds` get the selected border. Additionally, cards in an episode show a small colored dot badge in the top-right corner with the episode color. The active episode's cards get a left-border accent in the episode color.

### Lasso Selection (InfiniteCanvas.tsx)

On pointer-down on empty canvas (no card under cursor), if the drag exceeds 10px threshold:
- Draw a translucent selection rectangle
- On pointer-up, find all cards whose bounding box intersects the rectangle
- Call `selectCards(intersecting)`

If drag stays under 10px, treat as a click → `clearSelection()` (current behavior preserved).

---

## 3. Episode Creation

### Visual Path: Floating Action Button

When `selectedCardIds.size >= 2`, render a floating pill above the selection centroid:

```
[ + Group as Episode ]
```

On click:
1. Small inline input appears (replacing the pill): `Episode name: [________] [Create]`
2. On submit: calls `createEpisode(name, Array.from(selectedCardIds))`
3. Auto-extracts context from selected cards' prompts (lightweight LLM call)
4. Clears multi-selection, activates the new episode

### Chat Path: Agent Tool

`episode_create` tool:

```typescript
{
  name: "episode_create",
  description: "Group canvas cards into a named episode with its own creative context",
  parameters: {
    name: { type: "string", description: "Episode name" },
    card_ref_ids: { type: "array", items: { type: "string" }, description: "Card refIds to group" },
    context: {
      type: "object",
      description: "Optional context override (style, palette, characters, setting, mood, rules)",
      properties: { style, palette, characters, setting, mood, rules }
    }
  },
  required: ["name", "card_ref_ids"]
}
```

The agent can say "I'll group those into a Night Chase episode" and call this tool.

### Context Auto-Extraction

On episode creation (both paths), if no explicit context is provided:

1. Collect `prompt` and `capability` from each card in the episode
2. Call the same LLM extraction pattern as `extractCreativeContext()` in session-context.ts
3. Prompt: "Extract the creative essence from these prompts: [card prompts]. Return STYLE/PALETTE/CHARACTERS/SETTING/RULES/MOOD."
4. Store result as `episode.context` (partial — only fields the LLM identified)
5. User can edit via episode panel or chat

---

## 4. Active Episode & Agent Context

### Activation

- Click the episode badge on any card → activates that episode
- Episode switcher: small dropdown in the chat panel header showing `[Storyboard] [Ep 1: Night Chase] [Ep 2: Market]`
- Chat: "switch to the Night Chase episode" → agent calls `episode_activate`
- Tool: `episode_activate(id)` or `episode_activate(null)` for storyboard level

### Context Merging

When building the agent's system prompt:

```typescript
function getEffectiveContext(episodeId: string): CreativeContext | null {
  const storyboard = useSessionContext.getState().context;
  const episode = episodeStore.getEpisode(episodeId);
  if (!storyboard && !episode?.context) return null;

  return {
    style: episode?.context?.style || storyboard?.style || "",
    palette: episode?.context?.palette || storyboard?.palette || "",
    characters: episode?.context?.characters || storyboard?.characters || "",
    setting: episode?.context?.setting || storyboard?.setting || "",
    rules: episode?.context?.rules || storyboard?.rules || "",
    mood: episode?.context?.mood || storyboard?.mood || "",
  };
}
```

### Context Builder Integration

In `buildAgentContext()`:

1. If an episode is active, inject its effective context instead of the raw session context
2. Add episode info to system prompt:
   ```
   Active episode: "Night Chase" (5 cards: img-3, img-4, img-5, img-6, img-7)
   Episode context: mood=dark/tense, setting=city alley at night (other fields from storyboard)
   ```
3. The `buildPrefix()` for prompt injection uses the effective (merged) context

### Working Memory

Add `activeEpisodeId: string | null` to working memory so the agent knows which episode is active across turns.

---

## 5. Visual Design

### Card Badges

Cards in an episode show a small dot in the top-right corner, colored with the episode's color. On hover, a tooltip shows the episode name.

```
┌──────────────────────────────●─┐  ← colored dot (episode color)
│  img-5: Market Scene           │
│  ┌────────────────────────┐    │
│  │                        │    │
│  │      [image]           │    │
│  │                        │    │
│  └────────────────────────┘    │
│  flux-dev · 2.1s               │
└────────────────────────────────┘
```

Active episode's cards additionally get a 3px left-border in the episode color.

### Multi-Select Visual

Selected cards (Ctrl+click or lasso) get a dashed border + slight blue glow, distinct from single-select's solid border.

### Episode Switcher (Chat Panel Header)

Small horizontal pill bar above the chat input:

```
[All] [Night Chase ●] [Market ●] [Sunset ●]
```

Active episode is highlighted. Click to switch. `[All]` = storyboard level (no episode active).

### Floating Group Button

When 2+ cards are selected:

```
        ┌──────────────────────┐
        │  + Group as Episode  │
        └──────────────────────┘
```

Appears centered above the selection bounding box. Disappears on deselect.

---

## 6. Tools

| Tool | Schema | Purpose |
|------|--------|---------|
| `episode_create` | `name`, `card_ref_ids[]`, `context?` | Group cards into named episode |
| `episode_update` | `episode_id`, `name?`, `add_cards?[]`, `remove_cards?[]`, `context?` | Modify episode |
| `episode_activate` | `episode_id` (null for storyboard level) | Switch active episode |
| `episode_list` | (no params) | List all episodes with card counts and context summaries |

These are registered alongside canvas/project/scope tools. The agent's system prompt includes active episode info so it knows the current context.

---

## 7. Intent Detection

Add to the intent classifier (`lib/agents/intent.ts`):

```typescript
// "switch to night chase episode", "activate the market episode"
if (/switch.*episode|activate.*episode|go to.*episode/i.test(lower))
  return { type: "episode_switch", direction: text };

// "group these as...", "make an episode from..."
if (/group.*episode|create.*episode|make.*episode/i.test(lower))
  return { type: "episode_create", direction: text };
```

Context builder handles these intents by including episode list and available cards.

---

## 8. File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `lib/episodes/types.ts` | Episode interface |
| `lib/episodes/store.ts` | Zustand store: CRUD, activation, context merging |
| `lib/tools/episode-tools.ts` | 4 episode tools for the agent |
| `components/canvas/EpisodeBadge.tsx` | Colored dot badge on cards |
| `components/canvas/GroupButton.tsx` | Floating "Group as Episode" button |
| `components/chat/EpisodeSwitcher.tsx` | Pill bar for episode switching |
| `tests/unit/episode-store.test.ts` | Unit tests for store |
| `tests/unit/episode-tools.test.ts` | Unit tests for tools |
| `tests/e2e/episodes.spec.ts` | E2E: create, switch, context merge |

### Modified Files

| File | Changes |
|------|---------|
| `lib/canvas/store.ts` | `selectedCardIds: Set<string>`, toggle/lasso select, backward compat |
| `lib/canvas/types.ts` | No changes needed — episode membership is in episode store, not on Card |
| `components/canvas/Card.tsx` | Ctrl+click toggle, episode badge, active episode left-border |
| `components/canvas/InfiniteCanvas.tsx` | Lasso selection rectangle |
| `lib/agents/context-builder.ts` | Inject active episode context, episode info in system prompt |
| `lib/agents/intent.ts` | Add episode_switch, episode_create intents |
| `lib/agents/working-memory.ts` | Add activeEpisodeId |
| `lib/agents/session-context.ts` | Add getEffectiveContext(episodeId) helper |
| `lib/tools/index.ts` | Register episode tools |
| `components/chat/ChatPanel.tsx` | Render EpisodeSwitcher |

---

## 9. What This Does NOT Include (YAGNI)

- No drag-and-drop reordering of episodes
- No episode-level generation (generating all scenes for an episode at once) — use project_generate
- No episode templates or presets
- No episode export/import
- No nested episodes (episodes are flat, one level only)
- No episode-specific tool restrictions — all tools available in all episodes
- No timeline view per episode — cards stay on the infinite canvas with visual grouping only
