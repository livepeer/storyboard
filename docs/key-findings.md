# Agent SDK Architecture — Key Findings & 10 Major Improvements

## Executive Summary

The agent system shows rapid organic growth with strong individual components but fragile cross-cutting concerns. The three highest-risk areas are: concurrent request races, silent failures in the preprocessor, and the monolithic `compound-tools.ts`. The 10 improvements below would transform the architecture from "works most of the time" to "robust and extensible."

---

## Current Architecture (5 Layers)

```
User Input
    ↓
┌─────────────────────────────────────────────────────────┐
│  Layer 1: Chat Panel (routing)                          │
│  sendMessage → /command? → preprocessor? → agent?       │
│  ⚠ Concurrent requests race on mutable global state     │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Intent + Preprocessor (fast classification)   │
│  Regex intent → scene extraction → creative DNA → batch │
│  ⚠ Silent failures cascade — agent never sees the brief │
├─────────────────────────────────────────────────────────┤
│  Layer 3: Context Builder + Memory (system prompt)      │
│  Session DNA + Active Request + Working Memory + Episode │
│  ⚠ 4 style sources with no unified precedence           │
├─────────────────────────────────────────────────────────┤
│  Layer 4: Agent + Tools (execution)                     │
│  Gemini/Livepeer plugin → AgentRunner → 21 tools        │
│  ⚠ compound-tools.ts is 500+ lines with 10 concerns     │
├─────────────────────────────────────────────────────────┤
│  Layer 5: SDK + Models (inference)                      │
│  48 models, smart router, fallback chains, self-learning │
│  ✓ Most robust layer — clean abstractions                │
└─────────────────────────────────────────────────────────┘
```

---

## 10 Major Improvements

### 1. Serialize the Request Queue
**Problem:** ChatPanel fires concurrent `processOne()` calls that race on `currentUserText` (global), working memory, and session context. Three rapid messages produce unpredictable interleaving.

**Fix:** Replace concurrent queue with serial execution + optional priority lanes. Like Claude Code's tool-use loop — one turn at a time, tool results fed back before the next user message is processed.

```typescript
// Before: fire-and-forget concurrent
processOne(text); // fires immediately, races

// After: serial queue with priority
requestQueue.enqueue({ text, priority: "user" });
// Queue processes one at a time, awaits completion
```

**Impact:** Eliminates race conditions, predictable tool execution order, no mutable global state needed.

---

### 2. Split compound-tools.ts into Single-Responsibility Modules
**Problem:** `create_media` tool contains: capability routing, fallback retry, style application, session context merging, canvas layout, edge creation, video phase tracking — 500+ lines, 10 concerns.

**Fix:** Extract into focused modules in creative-kit:

| Module | Responsibility |
|--------|---------------|
| `model-router.ts` | ✅ Already done — scores speed/style/capacity |
| `fallback-handler.ts` | Retry chain with per-model param adaptation |
| `context-merger.ts` | Merge session + episode + skill + project styles |
| `layout-planner.ts` | Plan card positions on canvas |
| `media-executor.ts` | The actual inference call + result handling |

`create_media.execute()` becomes a thin orchestrator that calls these modules.

**Impact:** Each module testable independently, new models/features don't touch unrelated code.

---

### 3. Unified Style Context with Clear Precedence
**Problem:** 4 sources of style with no documented priority:
- Session Context (creative DNA from brief)
- Episode Override (per-episode style patch)
- Active Skills (loaded style-override skills)
- Project Style Guide (from project_create)

When they conflict (session says "Ghibli", skill says "photorealistic"), both are applied → incoherent prompt.

**Fix:** Single `resolveStyle()` function with explicit precedence:

```
Episode Override > Active Skill > Session Context > Project Style Guide
```

With conflict detection: if two sources contradict, warn the user and ask which to use.

**Impact:** Consistent style across all generations, no silent contradictions.

---

### 4. Human-in-the-Loop Confirmation Points
**Problem:** The system auto-executes everything. User says "create a 20-scene epic" → system generates all 20 without asking. No checkpoint to review the plan before committing GPU time and tokens.

**Fix:** Add confirmation gates at key moments (inspired by Claude Code's permission model):

| Action | Gate |
|--------|------|
| > 5 scenes | "I'll create 20 scenes in Ghibli style. Proceed?" |
| Style change | "Switching from noir to watercolor. This affects all future generations. OK?" |
| Expensive model | "Using Kling O3 4K (~$4/scene). Standard model is 10x cheaper. Which?" |
| Batch regenerate | "Regenerating 8 scenes will replace existing images. Continue?" |

Show a compact confirmation card in chat, user clicks "Go" or "Edit".

**Impact:** Users feel in control, avoid expensive mistakes, more engaged creative process.

---

### 5. Explicit State Machine for Project Lifecycle
**Problem:** Project/scene status is implicit strings ("pending", "generating", "done"). Video projects have hidden phase states — a scene can be "pending" meaning either "waiting for keyframe" or "waiting for animate". If animate fails, the scene is stuck with no recovery path.

**Fix:** Explicit state machine per scene:

```
         ┌──────────┐
         │ planning  │
         └─────┬─────┘
               ↓
      ┌────────────────┐
      │ keyframe_pending│ (video only)
      └────────┬───────┘
               ↓
      ┌────────────────┐
      │ keyframe_done   │
      └────────┬───────┘
               ↓
      ┌────────────────┐
      │ animate_pending │
      └────────┬───────┘
               ↓
     ┌─────────────────┐
     │      done        │
     └─────────────────┘

Any state → failed (with reason + retry action)
```

**Impact:** Clear recovery paths, no stuck scenes, debuggable status.

---

### 6. Structured Error Propagation (No Silent Failures)
**Problem:** Errors are handled inconsistently:
- Preprocessor: catches exception → returns `{handled: false}` → agent never knows
- Context builder: wraps `require()` in try/catch → continues without memory context
- Tool registry: `executeTool` catches all exceptions → returns `{success: false}` with no stack trace

Users see "nothing happened" when the system silently swallowed an error.

**Fix:** Structured error types that propagate through all layers:

```typescript
type AgentError =
  | { kind: "safety_filter"; model: string; prompt_snippet: string }
  | { kind: "model_unavailable"; capability: string; tried: string[] }
  | { kind: "context_extraction_failed"; brief_length: number; fallback_used: boolean }
  | { kind: "timeout"; elapsed_ms: number; phase: string }
  | { kind: "auth"; message: string }

// Every layer returns Result<T, AgentError> instead of swallowing
```

**Impact:** Users always see actionable feedback, developers can trace failures.

---

### 7. Skill Composition with Conflict Detection
**Problem:** Skills are applied as prompt prefix/suffix without checking for conflicts. Loading "ghibli" + "photorealistic" produces "ghibli style photorealistic {prompt}" — incoherent. Auto-unload of style-overrides is too aggressive (can't combine two styles).

**Fix:**
- Allow combining compatible skills (e.g., "ghibli" + "dark mood")
- Detect conflicts: if two skills modify the same field (style), ask the user
- Skill categories: `style`, `mood`, `technique`, `character` — only conflict within category
- Skill priority: most recently loaded wins for conflicting fields

**Impact:** Users can experiment with skill combinations, no incoherent prompts.

---

### 8. Request-Scoped Context (Eliminate Globals)
**Problem:** `currentUserText` is a module-level global in compound-tools.ts, set by the plugin before running the agent. If two requests run concurrently, the second overwrites the first's context.

**Fix:** Pass a `RequestContext` object through the entire call chain:

```typescript
interface RequestContext {
  requestId: string;
  userText: string;
  intent: Intent;
  sessionSnapshot: CreativeContext | null;
  activeProject: ProjectSnapshot | null;
  startedAt: number;
}

// Threaded through: plugin → runner → tool.execute(args, ctx)
```

**Impact:** No global state, safe concurrent execution, full request traceability.

---

### 9. Plugin Abstraction (DRY Gemini/Livepeer/Claude)
**Problem:** Gemini, Livepeer, and Claude plugins duplicate 80% of the same logic (tool registration, constraint setting, event consumption, error handling). Adding a feature to one plugin requires manually adding it to all three.

**Fix:** Single `AgentPlugin` base class with provider injection:

```typescript
class StoryboardAgent {
  constructor(private provider: LLMProvider) {}
  
  async *sendMessage(text: string, context: CanvasContext): AsyncGenerator<AgentEvent> {
    // Shared: tool filtering, constraint building, event processing
    // Only the LLM provider differs
  }
}

// Usage:
const geminiAgent = new StoryboardAgent(new GeminiProvider());
const livepeerAgent = new StoryboardAgent(new LivepeerProvider());
const claudeAgent = new StoryboardAgent(new ClaudeProvider());
```

**Impact:** Features added once, work everywhere. New LLM providers in 10 lines.

---

### 10. Observable Agent Pipeline with Trace Logging
**Problem:** When something goes wrong, there's no way to trace what happened. Errors are swallowed at multiple layers, logs are `console.warn` without structure, no request IDs to correlate tool calls with user messages.

**Fix:** Structured event pipeline (inspired by Claude Code's tool-use logging):

```typescript
// Every operation emits structured events:
pipeline.emit({
  requestId: "req_abc123",
  phase: "intent_classify",
  result: { type: "new_project", confidence: 0.95 },
  elapsed_ms: 2,
});

pipeline.emit({
  requestId: "req_abc123",
  phase: "tool_execute",
  tool: "create_media",
  capability: "flux-dev",
  elapsed_ms: 3200,
  result: "success",
});
```

Show in UI: expandable "pipeline view" (like Claude Code's tool calls) showing each phase with timing.

**Impact:** Users see exactly what the system is doing, developers can debug failures in production.

---

## Priority Matrix

| # | Improvement | Effort | Impact | Risk Reduction |
|---|-------------|--------|--------|----------------|
| 1 | Serialize request queue | Medium | High | Critical |
| 2 | Split compound-tools | High | High | Critical |
| 3 | Unified style context | Medium | High | High |
| 4 | Human-in-the-loop gates | Low | High | Medium |
| 5 | Project state machine | Medium | Medium | High |
| 6 | Structured errors | Medium | High | High |
| 7 | Skill conflict detection | Low | Medium | Medium |
| 8 | Request-scoped context | Medium | High | Critical |
| 9 | Plugin abstraction (DRY) | Medium | Medium | Medium |
| 10 | Observable pipeline | High | Medium | High |

**Recommended order:** 1 → 8 → 6 → 4 → 3 → 2 → 9 → 5 → 7 → 10

Start with serialization (#1) and request context (#8) — they eliminate the concurrency bugs that cause the most user-visible failures. Then structured errors (#6) and confirmation gates (#4) — they make the system trustworthy. The rest improve maintainability and extensibility.
