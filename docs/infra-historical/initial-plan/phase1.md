# Phase 1 Complete — Context for Phase 2

## What Phase 1 Built

Formalized the agent plugin system so multiple AI backends (Claude, OpenAI, built-in) share the same interface and tool registry. No user-visible behavior change — the built-in agent works identically.

### New Files (7)

| File | Purpose |
|------|---------|
| `lib/tools/types.ts` | `ToolDefinition` (name, description, JSON schema, execute fn), `ToolResult` |
| `lib/tools/registry.ts` | `registerTool()`, `getTool()`, `listTools()`, `executeTool()`, `clearTools()` |
| `lib/tools/sdk-tools.ts` | 6 tools: `inference`, `stream_start`, `stream_control`, `stream_stop`, `capabilities`, `train_lora` — each wraps the corresponding `sdkFetch` call |
| `lib/tools/canvas-tools.ts` | 3 tools: `canvas_create` (adds card + edge to Zustand store), `canvas_update`, `canvas_get` (returns card summaries) |
| `lib/tools/index.ts` | `initializeTools()` — registers all 9 built-in tools |
| `tests/unit/tool-registry.test.ts` | 10 tests: register, get, list, execute, clear, duplicate handling |
| `tests/unit/agent-plugin.test.ts` | 9 tests: plugin interface, event types, async generator protocol |

### Modified Files (5)

| File | What changed |
|------|-------------|
| `lib/agents/types.ts` | Added `AgentEvent` union type (text, tool_call, tool_result, card_created, error, done), `CanvasContext` (cards, selectedCard, capabilities), `CardSummary`, `ConfigField`. Made `AgentPlugin.sendMessage()` return `AsyncGenerator<AgentEvent>`. |
| `lib/agents/built-in/index.ts` | Refactored to yield `AgentEvent` objects during DAG execution. Still writes to stores directly for backward compat. |
| `lib/agents/registry.ts` | Added `getActivePluginId()`, `getPluginList()` |
| `components/chat/ChatPanel.tsx` | Consumes `AgentEvent` async generator from active plugin. Renders `tool_call` events as styled pills. Builds `CanvasContext` from Zustand stores. |
| `components/settings/SettingsPanel.tsx` | Added agent selector dropdown (Built-in / Claude coming soon). Persists choice in localStorage. |
| `app/page.tsx` | Calls `initializeTools()` on mount. Restores saved agent preference. |

### Key Interfaces

```typescript
// lib/agents/types.ts
interface AgentEvent {
  type: 'text' | 'tool_call' | 'tool_result' | 'card_created' | 'error' | 'done';
  content?: string;
  name?: string;
  input?: Record<string, unknown>;
  result?: unknown;
  refId?: string;
}

interface AgentPlugin {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly configFields: ConfigField[];
  configure(config: Record<string, string>): void;
  sendMessage(text: string, context: CanvasContext): AsyncGenerator<AgentEvent>;
  stop(): void;
}

interface CanvasContext {
  cards: CardSummary[];
  selectedCard?: string;
  capabilities: CapabilitySummary[];
}
```

```typescript
// lib/tools/types.ts
interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute: (input: Record<string, unknown>) => Promise<ToolResult>;
}
```

### 9 Registered Tools

| Name | Type | Description |
|------|------|-------------|
| `inference` | SDK | Run AI inference (image/video/audio/text) |
| `stream_start` | SDK | Start LV2V stream |
| `stream_control` | SDK | Update stream prompt/parameters |
| `stream_stop` | SDK | Stop LV2V stream |
| `capabilities` | SDK | List available models |
| `train_lora` | SDK | Start LoRA training |
| `canvas_create` | Canvas | Create card + edge on canvas |
| `canvas_update` | Canvas | Update existing card |
| `canvas_get` | Canvas | Get all cards as summaries |

### Test Results

- **40 unit tests pass** (21 Phase 0 + 10 tool registry + 9 agent plugin)
- **6 E2E tests pass** (page load, chat, settings, camera, health API)
- Build succeeds with no errors

---

## What Phase 2 Needs to Do

**Goal:** Add ClaudePlugin that uses Anthropic Messages API with tool_use.

Read `docs/plan/implementation.md` lines 264-400 for full Phase 2 specs. Key tasks:

1. **Build `lib/agents/claude/index.ts`** — ClaudePlugin class:
   - `sendMessage()` calls `/api/agent/chat` with messages + tool schemas
   - Tool-use loop: Claude calls tools → execute via tool registry → send results back → repeat until `end_turn`
   - Yields AgentEvent for each text block, tool call, and tool result

2. **Build `lib/agents/claude/system-prompt.ts`** — loads skills from `skills/base.md`

3. **Update `/api/agent/chat` route** — proxy to Anthropic with streaming SSE

4. **Add streaming support** — render Claude's text as it streams

5. **Add error handling** — SDK errors, rate limits, model 404s (see Phase 2.6 in implementation.md)

6. **Add budget controls** — token tracking, daily limit (see Phase 2.7)

7. **Add memory schema** — preferences, ratings, workflow patterns (see Phase 2.8)

### Key dependency: the tool schemas

The 9 tools in `lib/tools/` each have a `parameters` JSON schema. To pass them to Claude's API, convert to Anthropic's tool format:

```typescript
import { listTools } from '@/lib/tools/registry';

const claudeTools = listTools().map(t => ({
  name: t.name,
  description: t.description,
  input_schema: t.parameters,
}));
```

### How tool execution flows

```
User types "create a dragon" in ChatPanel
  → ChatPanel calls activePlugin.sendMessage(text, context)
  → ClaudePlugin sends to /api/agent/chat (Messages API)
  → Claude returns tool_use block: {name: "inference", input: {...}}
  → ClaudePlugin yields {type: 'tool_call', name: 'inference', input: {...}}
  → ClaudePlugin calls executeTool('inference', input) from registry
  → executeTool runs sdkFetch('/inference', ...) → returns {image_url: "..."}
  → ClaudePlugin yields {type: 'tool_result', name: 'inference', result: {...}}
  → ClaudePlugin sends tool_result back to Claude API
  → Claude returns text: "Here's your dragon!"
  → ClaudePlugin yields {type: 'text', content: "Here's your dragon!"}
  → Claude returns stop_reason: 'end_turn'
  → ClaudePlugin yields {type: 'done'}
  → ChatPanel renders all events in order
```

### Infrastructure ready

- SDK: `https://sdk.daydream.monster` (healthy, 12 capabilities)
- Vercel: `https://storyboard-rust.vercel.app` (deployed)
- API route: `app/api/agent/chat/route.ts` (exists, needs Anthropic proxy implementation)
- Env var needed: `ANTHROPIC_API_KEY` (set via `vercel env add`)
