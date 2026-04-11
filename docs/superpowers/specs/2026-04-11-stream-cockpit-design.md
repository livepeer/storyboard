# Stream Cockpit — Design Spec

**Goal:** Transform the cramped LV2V stream card into an interactive cockpit that auto-expands when streaming, pairs natural-language input with agent-driven Scope skills (presets, graphs, LoRA, params), shows live parameter visibility, and learns from user behavior (implicit + explicit pinning).

**Architecture:** When a stream starts, the existing stream card grows from `~320×280` to `640×580` in place. The expanded cockpit has a large live frame with HUD overlays, preset chips, a 60px intent textarea, agent suggestion chips that auto-apply the top suggestion (with 1-click rollback), an activity feed, and a hidden working-memory layer that tracks accept/reject patterns + lets users pin successful combinations as reusable "stream skills". When the stream stops, the card returns to its original size.

---

## 1. Card Sizing & Layout Behavior

### Auto-expand in place

When `card.type === "stream"` AND a session is active:
- Card width: `640px` (was `320px`)
- Card height: `~580px` (was `~280px`)
- Position: stays at original `card.x, card.y`
- Other cards reflow around it via `applyLayout()` — the layout agent is called to reorganize when expansion happens

When stream stops:
- Card width: returns to `320×280`
- Other cards reflow back

### Six zones inside the cockpit

```
┌─────────────────────────────────────────────────┐
│ ● Night Chase Stream    12fps · pub:142 · ⏸ ⤓  │  ← Title bar (32px)
├─────────────────────────────────────────────────┤
│ [HUD: noise 0.65 cache 0.4]   [⚙ depth-guided] │
│                                                  │  ← Live frame (300px)
│              live output                         │
│                                                  │
├─────────────────────────────────────────────────┤
│ [dreamy] [cinematic] [anime ●] [+]    [⚙ adv]  │  ← Preset row (32px)
├─────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────┐ │
│ │ Tell the stream what to do…                 │ │  ← Big input (60px)
│ └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│ Agent suggests:                                  │
│ [✓ applied dreamy] [+ load LoRA] [⌃ noise 0.75]│  ← Suggestion chips (40px)
├─────────────────────────────────────────────────┤
│ 12:34:21 ✓ applied "anime" preset      📌      │
│ 12:34:18 → "make it more anime"                 │  ← Activity feed (collapsible)
└─────────────────────────────────────────────────┘
```

### Stream-only zones

The 6 zones (title bar, live frame, presets, input, suggestions, activity feed) only render when the card is in stream mode AND has an active session. The compact stream controls (current `Card.tsx` lines 317-403) are replaced entirely by these zones when streaming.

---

## 2. HUD Overlays

Floating semi-transparent boxes inside the live frame, top-left and top-right corners:

- **Top-left HUD (params):** `noise 0.65 · cache 0.4 · steps [1000,500]` — monospace, color-coded values, updates live as params change
- **Top-right HUD (graph):** `⚙ depth-guided · longlive` — shows active graph template + pipeline ID

These read from the running session's last-applied params (tracked in a new `Lv2vSession.lastParams` field that captures every successful `controlStream` call).

---

## 3. Preset Chips

Reads from the existing `SCOPE_PRESETS` in `lib/stream/scope-params.ts` (7 presets: dreamy, cinematic, anime, abstract, faithful, painterly, psychedelic).

- Each chip is a 1-click action that calls `controlStream(session, "", presetParams)`
- Active preset highlighted with solid background
- "+" button → opens an inline name input → captures current params as a new user preset (stored in localStorage via a new `useStreamPresetStore`)
- "⚙ advanced" button → expands a drawer below preset row with raw param sliders (noise_scale, kv_cache_attention_bias, denoising_step_list, lora_scale, reset_cache toggle)

User-created presets appear after the 7 built-ins, with a small ★ marker.

---

## 4. Big Intent Input

A 60px-tall textarea, full card width, prominent border. Placeholder rotates between hints:
- "Tell the stream what to do — e.g. 'add neon rain'"
- "Try 'make it darker' or 'use depth preprocessor'"
- "Type intent — agent figures out the rest"

On Enter (without Shift):
1. Text is sent to the **stream agent** (a thin wrapper around the existing Gemini agent with a focused system prompt: "You translate user intent into Scope tool calls. Pick the best action, apply it, then suggest 2-3 alternatives.")
2. Agent returns: `{ applied: ToolCall, alternatives: ToolCall[] }` where each ToolCall is `{ tool: "scope_control" | "load_skill" | "scope_start", params: {...}, summary: string }`
3. The `applied` action runs immediately via the existing tool registry
4. Alternatives appear as suggestion chips below the input

If the user is offline / agent fails, fall back to slash-command parser (`/preset dreamy`, `/noise 0.7`, `/lora anime`).

---

## 5. Agent Suggestion Chips

After the agent applies an action and returns alternatives:

- Each chip is colored by action type:
  - **Green** (`✓ applied <name>`): the action that just ran (1-click rollback)
  - **Cyan** (`+ load <skill>`): load a skill
  - **Purple** (`⌃ <param> → <value>`): tweak a single parameter
  - **Amber** (`↻ reset cache`): system action

- Click the green chip → roll back the applied action (restore previous params)
- Click any other chip → roll back the green action AND apply the new one (so user can iterate quickly)
- Chips fade out after 30 seconds or when a new intent is sent

---

## 6. Activity Feed

Collapsible, scrollable log at the bottom of the cockpit. Each entry:

```
12:34:21 ✓ applied "anime" preset                       📌
12:34:18 → "make it more anime"
12:34:05 ✓ loaded depth-anything preprocessor           📌
```

- Shows the last 20 entries
- Each successful action has a 📌 pin button
- Click 📌 → action becomes a "learned skill" (stored in `useStreamMemoryStore`, see section 7)
- Pinned items get a colored 📌 highlight
- Click an entry to re-apply that action

---

## 7. Self-Learning (Implicit + Explicit)

### Implicit tracking

Every successful action (auto-applied or chip-selected) is recorded in `useStreamMemoryStore`:

```typescript
interface StreamPreference {
  intent: string;            // The user's natural language intent
  applied: ToolCall;         // What the agent did
  outcome: "kept" | "rolled_back" | "alternative_chosen";
  timestamp: number;
  sessionId: string;
}

interface StreamMemoryState {
  history: StreamPreference[];           // Last 100 interactions
  pinnedSkills: PinnedSkill[];           // User-pinned actions
  getBiasFor: (intent: string) => Bias;  // Statistics-based suggestion
}
```

The bias is computed from `history`: e.g., if "make it dreamy" was applied 8 times and 6 of those used `noise=0.75` (not the preset's `0.7`), the agent biases toward `0.75` next time.

### Explicit pinning

A "pinned skill" is a user-saved (intent → action) mapping:

```typescript
interface PinnedSkill {
  id: string;
  name: string;            // Auto-generated from the intent or user-named
  triggers: string[];      // Intent phrases that should match
  action: ToolCall;        // The action to apply
  createdAt: number;
  uses: number;
}
```

When the user pins an entry, the agent treats it as a high-priority shortcut. On the next intent, the agent first checks if any pinned skill matches (fuzzy keyword match) before calling the LLM. If matched, it applies the pinned action with no LLM call (instant + free).

Pinned skills are scoped per stream type (e.g., webcam vs depth-guided) so the agent doesn't apply a webcam-specific skill to a depth stream.

---

## 8. The Stream Agent (focused LLM)

A new file `lib/agents/stream-agent.ts` — a thin wrapper around the existing Gemini API call with:

- **System prompt** focused exclusively on Scope intent translation, including the Scope vocabulary from `skills/scope-agent.md` (presets, graph templates, parameter mappings)
- **Tool schema** limited to: `scope_control`, `scope_apply_preset`, `scope_change_graph`, `load_lora`, `apply_vace`, `reset_cache` (a curated subset)
- **Pinned skills** injected into the system prompt for high-priority matching
- **Bias hints** from `useStreamMemoryStore.getBiasFor()` injected as preferences
- **Output format:** `{ applied: ToolCall, alternatives: ToolCall[], reasoning: string }`

### Why a separate agent?

- Faster (smaller prompt, fewer tools = lower latency, ~500ms vs 2-3s)
- More reliable (focused vocabulary, less drift)
- Independent context (doesn't pollute the main chat history)
- Tunable per-stream (pinned skills are session-scoped)

---

## 9. File Structure

### New files

| File | Responsibility |
|------|---------------|
| `lib/stream/cockpit-types.ts` | StreamCockpitState, ToolCall, PinnedSkill, StreamPreference |
| `lib/stream/cockpit-store.ts` | Zustand store: pinnedSkills, history, custom presets, getBiasFor |
| `lib/stream/cockpit-agent.ts` | Stream agent: focused Gemini call returning applied + alternatives |
| `components/canvas/StreamCockpit.tsx` | The full 6-zone cockpit (title, frame, presets, input, chips, feed) |
| `components/canvas/StreamCockpit/HudOverlay.tsx` | Param + graph HUD overlays for the live frame |
| `components/canvas/StreamCockpit/PresetChips.tsx` | Preset row with active state + custom preset creation |
| `components/canvas/StreamCockpit/IntentInput.tsx` | Big textarea + submit handling |
| `components/canvas/StreamCockpit/SuggestionChips.tsx` | Auto-applied + alternatives chips with rollback |
| `components/canvas/StreamCockpit/ActivityFeed.tsx` | Collapsible log + pin button |
| `tests/unit/cockpit-store.test.ts` | Pin/unpin, bias computation, history tracking |
| `tests/unit/cockpit-agent.test.ts` | Intent parsing, fallback to slash commands |

### Modified files

| File | Changes |
|------|---------|
| `components/canvas/Card.tsx` | When `card.type === "stream"` and active session: render `<StreamCockpit card={card} />` instead of the cramped controls. Auto-resize card width/height when streaming. |
| `lib/stream/session.ts` | Add `lastParams` field to `Lv2vSession` to track current applied params for HUD display |

---

## 10. Data Flow

```
User types "add neon rain" in IntentInput
       │
       ▼
StreamCockpit.handleSubmit(intent)
       │
       ▼
cockpit-agent.translate(intent, session, pinnedSkills, bias)
       │
       ├─ Pinned skill match? → return immediately (no LLM call)
       │
       ▼ (no pinned match)
LLM call with focused system prompt
       │
       ▼
{ applied: ToolCall, alternatives: ToolCall[] }
       │
       ▼
StreamCockpit.applyAction(applied)
       │
       ├─ controlStream(session, prompt, params)  ← runs immediately
       ├─ session.lastParams = applied.params      ← updates HUD
       └─ cockpit-store.recordHistory(applied)     ← implicit learning
       │
       ▼
SuggestionChips renders applied (green) + alternatives
       │
       ▼ (user clicks alternative)
StreamCockpit.rollback() + applyAction(alternative)
```

---

## 11. What This Does NOT Include (YAGNI)

- No detached panel mode (we chose A: expand in place)
- No animation timeline editor for params (just current values)
- No multi-stream cockpit (one stream at a time, period)
- No collaborative editing (user-local)
- No export of pinned skills (localStorage only)
- No voice input (text-only for v1)
- No webcam preview switching inside the cockpit (still handled by CameraWidget)
