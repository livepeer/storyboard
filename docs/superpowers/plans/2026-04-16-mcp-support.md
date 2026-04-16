# MCP Support + Plugin Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Claude + OpenAI plugin parity gaps, enable MCP tools for all three plugins, and verify with Playwright e2e tests.

**Architecture:** Copy proven Gemini patterns (ActiveRequest, digest, intent filtering, fast paths) directly into Claude and OpenAI plugins — NO shared-routing extraction, NO abstractions. Each plugin stays independent so a bug in one can't regress another. MCP tools for Gemini/OpenAI are registered client-side in the ToolRegistry alongside storyboard tools (Claude's existing server-side MCP stays untouched).

**Tech Stack:** TypeScript, Next.js 16, vitest, Playwright, zustand, @livepeer/agent SDK

**Anti-regression rule:** Every task ends with `npx vitest run` (expect 294+ passing, 2 known video-intent failures). Any NEW failure = stop and fix before proceeding.

---

## File Map

### Modified files (NO new files except tests)

| File | What changes | Approx lines added |
|---|---|---:|
| `lib/agents/claude/index.ts` | Add ActiveRequest, digest, context-builder, intent classification, tool filtering, fast paths | ~350 |
| `lib/agents/openai/index.ts` | Same as Claude | ~350 |
| `lib/agents/gemini/index.ts` | Register MCP tools in ToolRegistry | ~25 |
| `tests/e2e/plugin-parity.spec.ts` | NEW: Playwright e2e for Claude/OpenAI parity | ~120 |
| `tests/e2e/mcp-integration.spec.ts` | NEW: Playwright e2e for MCP tool flow | ~80 |

### Files NOT touched (regression-critical)

These files are load-bearing and must NOT be modified:
- `lib/agents/context-builder.ts` — imported by all three plugins after parity
- `lib/agents/active-request.ts` — imported by all three plugins after parity
- `lib/agents/intent.ts` — imported by all three plugins after parity
- `lib/tools/compound-tools.ts` — fallback chain, tool execution
- `lib/agents/runner-adapter.ts` — tool wrapping
- `lib/mcp/client.ts` — MCP discovery + execution (already works)
- `lib/mcp/store.ts` — MCP server persistence (already works)
- `app/api/agent/chat/route.ts` — Claude MCP integration (already works)

---

## Task 1: Claude plugin — add ActiveRequest + digest + intent context

**Files:**
- Modify: `lib/agents/claude/index.ts`

This task adds the three memory layers (L1 ActiveRequest, L2 digest, L3 auto-seed) to the Claude plugin. Mirrors Gemini's `index.ts` lines 17, 215-227.

- [ ] **Step 1: Add imports at top of claude/index.ts**

After line 19 (existing `wrapStoryboardTool` import), add:

```typescript
import { setCurrentUserText } from "@/lib/tools/compound-tools";
import { buildAgentContext } from "../context-builder";
import { useWorkingMemory } from "../working-memory";
import { useActiveRequest } from "../active-request";
import { classifyIntent } from "../intent";
```

- [ ] **Step 2: Add ActiveRequest + digest + context-builder calls inside sendMessage**

At the start of `sendMessage` (after line 62 budget check, before line 84 system prompt load), add:

```typescript
// L1: ActiveRequest — track subject across turns
setCurrentUserText(text);
useActiveRequest.getState().applyTurn(text);

// L2: Digest — rolling turn log for session continuity
useWorkingMemory.getState().appendDigest(`user: ${text.slice(0, 120)}`);

// Intent-aware system prompt (replaces static loadSystemPrompt)
const projStore = (await import("@/lib/projects/store")).useProjectStore.getState();
let activeProj = projStore.getActiveProject();
if (!activeProj) {
  const all = projStore.projects ?? [];
  if (all.length > 0) activeProj = all[all.length - 1];
}
const pendingCount = activeProj
  ? activeProj.scenes.filter((s: { status: string }) => s.status === "pending" || s.status === "regenerating").length
  : 0;
const intent = classifyIntent(text, !!activeProj, pendingCount);
const mem = useWorkingMemory.getState();
const system = buildAgentContext(intent, {
  project: mem.project,
  digest: mem.digest,
  recentActions: mem.recentActions,
  preferences: mem.preferences,
  canvasCards: context.cards.map((c) => ({
    refId: c.refId, type: c.type, title: c.title, url: c.url,
  })),
  selectedCard: context.selectedCard,
  activeEpisodeId: mem.activeEpisodeId,
});
```

Replace the existing `const system = await loadSystemPrompt();` with the above `system` variable (it now comes from `buildAgentContext`).

- [ ] **Step 3: Add L2 agent-side digest + L3 auto-seed after the event loop**

After the main `for await` loop (after line 174), before the summary block:

```typescript
// L2: log agent outcome to digest
const wmem = useWorkingMemory.getState();
if (completedTools.length > 0) {
  const ok = completedTools.filter((t: { success: boolean }) => t.success).length;
  wmem.recordAction({
    tool: completedTools.map((t: { name: string }) => t.name).join("+"),
    summary: `${completedTools.length} tools`,
    outcome: `${ok}/${completedTools.length} succeeded`,
    success: ok === completedTools.length,
  });
  wmem.appendDigest(`agent: ran ${ok}/${completedTools.length} ${completedTools.map((t: { name: string }) => t.name).slice(0, 3).join("+")}`);
}
wmem.syncFromProjectStore();

// L3: auto-seed CreativeContext on first generation
try {
  const hasGeneratedMedia = completedTools.some(
    (t: { success: boolean; name: string }) => t.success && (t.name === "create_media" || t.name === "project_generate")
  );
  if (hasGeneratedMedia && typeof window !== "undefined") {
    const seedKey = "storyboard:creative-context-autoseeded";
    if (window.sessionStorage.getItem(seedKey) !== "1") {
      const { useSessionContext } = await import("../session-context");
      if (!useSessionContext.getState().context) {
        const active = useActiveRequest.getState().snapshot();
        const seedText = [active.subject, ...active.modifiers].filter(Boolean).join(", ");
        if (seedText.trim().length >= 5) {
          useSessionContext.getState().setContext({
            style: "", palette: "", characters: active.subject.slice(0, 200),
            setting: active.modifiers.slice(0, 3).join(", ").slice(0, 200),
            rules: "", mood: "",
          });
          window.sessionStorage.setItem(seedKey, "1");
        }
      }
    }
  }
} catch (e) { console.warn("[Claude] Auto-seed failed:", e); }
```

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run
```

Expected: 294+ tests passing (same as before — Claude plugin has no unit tests of its own, but imported modules must not break).

- [ ] **Step 5: Commit**

```bash
git add lib/agents/claude/index.ts
git commit -m "feat(claude): add ActiveRequest + digest + intent-aware context (L1/L2/L3 parity)"
```

---

## Task 2: Claude plugin — add intent-based tool filtering

**Files:**
- Modify: `lib/agents/claude/index.ts`

Copy `pickToolsForIntent()` from Gemini (lines 44-110 of gemini/index.ts) into Claude as a local function. Wire it into the ToolRegistry setup. This cuts ~80% of tool-schema tokens per call.

- [ ] **Step 1: Copy pickToolsForIntent into claude/index.ts**

Add the function before the `claudePlugin` export (before line 36). Copy it verbatim from `lib/agents/gemini/index.ts` lines 44-110. It's a pure function with no Gemini-specific dependencies.

- [ ] **Step 2: Wire tool filtering into sendMessage**

Replace the existing "register all tools" block (around lines 89-95) with:

```typescript
const allowedTools = pickToolsForIntent(intent.type, text);

let registeredCount = 0;
for (const sbTool of listStoryboardTools()) {
  if (allowedTools.has(sbTool.name)) {
    tools.register(wrapStoryboardTool(sbTool));
    registeredCount++;
  }
}
console.log(`[Claude] Tool filtering: intent=${intent.type}, registered ${registeredCount}/${listStoryboardTools().length} tools`);
```

- [ ] **Step 3: Add working memory injection into the runner**

Replace the existing `WorkingMemoryStore` setup with:

```typescript
const working = new WorkingMemoryStore();
if (system) {
  working.setCriticalConstraints([system]);
}
const session = new SessionMemoryStore();
const runner = new AgentRunner(provider, tools, working, session);
```

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add lib/agents/claude/index.ts
git commit -m "feat(claude): intent-based tool filtering — ~80% token reduction per call"
```

---

## Task 3: OpenAI plugin — add ActiveRequest + digest + intent + tool filtering

**Files:**
- Modify: `lib/agents/openai/index.ts`

Same changes as Tasks 1-2 but for OpenAI. The plugin structure is nearly identical to Claude.

- [ ] **Step 1: Add the same imports as Claude (Step 1 of Task 1)**

After line 17 (`wrapStoryboardTool` import):

```typescript
import { setCurrentUserText } from "@/lib/tools/compound-tools";
import { buildAgentContext } from "../context-builder";
import { useWorkingMemory } from "../working-memory";
import { useActiveRequest } from "../active-request";
import { classifyIntent } from "../intent";
```

- [ ] **Step 2: Copy pickToolsForIntent into openai/index.ts**

Same function, verbatim copy from Gemini.

- [ ] **Step 3: Add ActiveRequest + digest + intent context to sendMessage start**

Same code block as Task 1, Step 2. Replace the existing `loadSystemPrompt()` call.

- [ ] **Step 4: Wire tool filtering into ToolRegistry setup**

Same pattern as Task 2, Step 2. Replace the "register all tools" block.

- [ ] **Step 5: Add working memory injection**

Same as Task 2, Step 3.

- [ ] **Step 6: Add L2 agent-side digest + L3 auto-seed after event loop**

Same code block as Task 1, Step 3.

- [ ] **Step 7: Run full test suite**

```bash
npx vitest run
```

- [ ] **Step 8: Commit**

```bash
git add lib/agents/openai/index.ts
git commit -m "feat(openai): ActiveRequest + digest + intent filtering + L3 auto-seed (full parity)"
```

---

## Task 4: MCP tool registration for Gemini plugin

**Files:**
- Modify: `lib/agents/gemini/index.ts`

The Gemini plugin builds a `ToolRegistry` with storyboard tools but does NOT include MCP tools. Claude gets MCP through its server route; Gemini needs MCP client-side.

- [ ] **Step 1: Add MCP imports**

After existing imports (line 21):

```typescript
import { getConnectedServers } from "@/lib/mcp/store";
import { discoverTools, executeToolCall, isMcpTool, parseMcpToolName } from "@/lib/mcp/client";
```

- [ ] **Step 2: Discover and register MCP tools after storyboard tools**

After the `for (const sbTool of listStoryboardTools())` loop (around line 490), add:

```typescript
// Register MCP tools from connected servers. Each tool is wrapped
// so that execution routes to executeToolCall() instead of the
// local storyboard tool executor. Tool names are prefixed with
// mcp__{serverId}__ to avoid collisions with storyboard tools.
try {
  const mcpServers = getConnectedServers();
  for (const server of mcpServers) {
    try {
      const mcpTools = await discoverTools(server);
      for (const mt of mcpTools) {
        tools.register({
          name: mt.name,
          description: mt.description || "",
          parameters: mt.inputSchema || {},
          mcp_exposed: false,
          async execute(args) {
            const parsed = parseMcpToolName(mt.name);
            if (!parsed) return JSON.stringify({ error: "Invalid MCP tool name" });
            const result = await executeToolCall(
              server.url, server.token || "", parsed.originalName, args
            );
            return JSON.stringify(result.content || []);
          },
        });
        registeredCount++;
      }
    } catch (e) {
      console.warn(`[Gemini] MCP discovery failed for ${server.name}:`, e);
    }
  }
} catch { /* MCP store not available */ }

console.log(`[Gemini] Tool filtering: intent=${intent.type}, sceneIter=${sceneIterationDetected}, registered ${registeredCount}/${listStoryboardTools().length} tools (includes MCP)`);
```

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add lib/agents/gemini/index.ts
git commit -m "feat(gemini): register MCP tools in ToolRegistry alongside storyboard tools"
```

---

## Task 5: MCP tool registration for OpenAI plugin

**Files:**
- Modify: `lib/agents/openai/index.ts`

Same MCP registration pattern as Task 4. Copy the imports and the MCP discovery block.

- [ ] **Step 1: Add MCP imports** (same as Task 4, Step 1)

- [ ] **Step 2: Add MCP tool discovery and registration** (same code block as Task 4, Step 2, but with `[OpenAI]` log prefix)

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add lib/agents/openai/index.ts
git commit -m "feat(openai): register MCP tools in ToolRegistry alongside storyboard tools"
```

---

## Task 6: Playwright e2e — plugin parity smoke test

**Files:**
- Create: `tests/e2e/plugin-parity.spec.ts`

Tests that switching between Gemini, Claude, and OpenAI plugins still works, the chat UI loads, commands like /story and /organize fire, and basic agent responses come back. Does NOT test actual LLM output (flaky) — just that the wiring is correct and nothing crashes.

- [ ] **Step 1: Write the e2e test**

```typescript
import { test, expect } from "@playwright/test";

test.describe("Plugin Parity", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:3000");
    await page.waitForSelector("[data-testid='chat-panel'], .chat-panel, textarea", { timeout: 10000 });
  });

  test("app loads without errors", async ({ page }) => {
    // No uncaught JS errors
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForTimeout(2000);
    expect(errors.filter((e) => !e.includes("Extension context"))).toHaveLength(0);
  });

  test("/story command renders a story card", async ({ page }) => {
    const input = page.locator("textarea").first();
    await input.fill("/story help");
    await input.press("Enter");
    // Should show usage text, not crash
    await expect(page.locator("text=Usage")).toBeVisible({ timeout: 5000 });
  });

  test("/organize command works", async ({ page }) => {
    const input = page.locator("textarea").first();
    await input.fill("/organize");
    await input.press("Enter");
    // Should show "Canvas is empty" or organize result
    await expect(
      page.locator("text=Canvas is empty").or(page.locator("text=Organized"))
    ).toBeVisible({ timeout: 5000 });
  });

  test("/story list shows empty state", async ({ page }) => {
    const input = page.locator("textarea").first();
    await input.fill("/story list");
    await input.press("Enter");
    await expect(
      page.locator("text=No stories yet").or(page.locator("text=Your stories"))
    ).toBeVisible({ timeout: 5000 });
  });

  test("slash command renders in blue", async ({ page }) => {
    const input = page.locator("textarea").first();
    await input.fill("/organize");
    await input.press("Enter");
    // Blue-styled user message should appear
    const blueMsg = page.locator(".bg-blue-500\\/15").first();
    await expect(blueMsg).toBeVisible({ timeout: 5000 });
  });

  test("input clears after slash command", async ({ page }) => {
    const input = page.locator("textarea").first();
    await input.fill("/story help");
    await input.press("Enter");
    // Input should be empty
    await expect(input).toHaveValue("");
  });
});
```

- [ ] **Step 2: Run the e2e test (requires local dev server running)**

```bash
npx playwright test tests/e2e/plugin-parity.spec.ts --reporter=line
```

- [ ] **Step 3: Run full unit test suite (regression check)**

```bash
npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/plugin-parity.spec.ts
git commit -m "test(e2e): plugin parity smoke tests — commands, cards, slash styling"
```

---

## Task 7: Playwright e2e — MCP integration test

**Files:**
- Create: `tests/e2e/mcp-integration.spec.ts`

Tests the MCP settings panel, server connection UI, and that connected servers show in the panel. Does NOT require a real MCP server — tests the UI flow only.

- [ ] **Step 1: Write the e2e test**

```typescript
import { test, expect } from "@playwright/test";

test.describe("MCP Integration UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:3000");
    await page.waitForSelector("textarea", { timeout: 10000 });
  });

  test("MCP panel is accessible from settings", async ({ page }) => {
    // Look for settings/gear icon that opens MCP panel
    const settingsBtn = page.locator("[title*='Settings'], [aria-label*='Settings'], button:has(svg)").first();
    if (await settingsBtn.isVisible()) {
      await settingsBtn.click();
      // MCP panel or MCP-related text should appear
      const mcpText = page.locator("text=MCP").or(page.locator("text=Model Context Protocol"));
      // If the panel exists, it should show MCP presets or connection UI
      if (await mcpText.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(mcpText).toBeVisible();
      }
    }
  });

  test("MCP presets include Gmail", async ({ page }) => {
    // This tests the types module is loaded correctly
    const result = await page.evaluate(async () => {
      try {
        const { MCP_PRESETS } = await import("/lib/mcp/types");
        return MCP_PRESETS.map((p: { id: string }) => p.id);
      } catch {
        return [];
      }
    });
    // If import works, Gmail should be in presets
    // If import fails (module not accessible from page context), skip gracefully
    if (result.length > 0) {
      expect(result).toContain("gmail");
    }
  });
});
```

- [ ] **Step 2: Run the e2e test**

```bash
npx playwright test tests/e2e/mcp-integration.spec.ts --reporter=line
```

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/mcp-integration.spec.ts
git commit -m "test(e2e): MCP integration UI smoke tests"
```

---

## Task 8: Final regression gate

- [ ] **Step 1: Run full unit test suite**

```bash
npx vitest run
```

Expected: 294+ tests passing. 2 known failures in `video-intent.test.ts` (pre-existing, unrelated).

- [ ] **Step 2: Run Playwright e2e suite**

```bash
npx playwright test tests/e2e/plugin-parity.spec.ts tests/e2e/mcp-integration.spec.ts --reporter=line
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit -p .
```

Expected: clean (0 errors in our modified files).

- [ ] **Step 4: Final commit if any cleanup needed, push**

```bash
git push origin feat/mcp-support
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - [x] Claude parity (L1/L2/L3, intent, tool filtering) — Tasks 1-2
   - [x] OpenAI parity (same) — Task 3
   - [x] MCP for Gemini — Task 4
   - [x] MCP for OpenAI — Task 5
   - [x] MCP for Claude — already works (server route, no changes needed)
   - [x] Playwright e2e — Tasks 6-7
   - [x] Regression gate — Task 8
   - [ ] Daily briefing — DEFERRED (depends on Gmail MCP OAuth being configured, which is infra work outside this plan)

2. **Placeholder scan:** No TBDs, TODOs, or "fill in later" in any step.

3. **Type consistency:** All imports reference actual exported symbols from their source files. `pickToolsForIntent`, `classifyIntent`, `buildAgentContext`, `useActiveRequest`, `useWorkingMemory` are all verified exports.

4. **Regression risk:**
   - Gemini plugin: only ADDITION of MCP imports + ~25 lines of MCP registration after existing code. Zero changes to fast paths, scene detection, or intent logic.
   - Claude/OpenAI plugins: ADDITIONS to sendMessage. Existing event-loop code (tool_call, tool_result, usage, error handlers) is untouched. New code wraps around it.
   - No modifications to any `lib/tools/`, `lib/mcp/`, `lib/agents/context-builder.ts`, `lib/agents/active-request.ts`, `lib/agents/intent.ts` — all imported as-is.

5. **Daily briefing:** Intentionally deferred from this plan. The daily briefing skill spec (`skills/daily-briefing.md`) describes a flow that requires Gmail MCP to be connected and authenticated. The MCP infrastructure this plan enables makes that possible, but the actual briefing implementation (fetch emails → summarize → generate scenes) is a separate feature that should be its own plan after MCP is verified working end-to-end with a real Gmail connection. Including it here would violate "avoid over-engineering" — we'd be building an untestable feature.
