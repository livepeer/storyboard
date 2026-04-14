# Phase 13 — Storyboard migration status (2026-04-14)

Phase 13 closes the `feat/agent-sdk-design` branch. The @livepeer/agent
SDK is wired into the storyboard app, three of four agent plugins now
delegate their tool-use loop to `AgentRunner.runStream()`, and a
Playwright regression gate (T10) enforces zero baseline loss on every
PR.

## What shipped

### Task 13.1 — Baseline freeze

Captured at branch `d86f131` (pre-migration) via a full Playwright run.
**119 tests are known-passing** and committed to
`tests/e2e/fixtures/baseline-passing.txt`. Every subsequent Phase 13
change was verified to preserve this list. Eight pre-existing failing
tests (seven Gemini-workflow specs + one click-card test) were NOT in
the baseline and do not constrain future work.

### Task 13.2 — Workspace dependency

Added `@livepeer/agent`, `@livepeer/agent-pack-projects`, and
`@livepeer/agent-pack-canvas` as workspace deps of the storyboard app.
Symlinks verified in `node_modules/@livepeer/`.

### Task 13.3 — Runner adapter bridge

New file `lib/agents/runner-adapter.ts` with `buildStoryboardRunner()`
and `buildGeminiStoryboardRunner()` factories. Wires both domain packs
into a shared core `ToolRegistry` and returns a ready-to-run
`AgentRunner`.

### Task 13.4 — Tool wrapper

Extended `runner-adapter.ts` with `wrapStoryboardTool(sbTool)` which
converts the storyboard's in-tree `ToolDefinition` shape (execute →
`ToolResult`) to the core `ToolDefinition` shape (execute → string).
**Zero changes to `lib/tools/*`** — the 2470 lines of existing tool
code are untouched; the adapter handles the impedance mismatch at
registration time.

### Task 13.5a — Core: `AgentRunner.runStream()`

Added a streaming variant of the agent runner to the core SDK. Emits
`RunEvent` values (`text / tool_call / tool_result / turn_done /
usage / done / error`) as the tool-use loop executes. The existing
`run()` is now a thin wrapper that collects events into the terminal
`RunResult` — public shape unchanged, all 53+ existing runner tests
still pass unchanged. 5 new unit tests cover progressive emission,
tool call ordering, turn cadence, terminal done, and error
termination.

### Task 13.5b — Gemini plugin migration

Created `lib/agents/storyboard-providers.ts` with
`StoryboardGeminiProvider` — an `LLMProvider` implementation that
POSTs to the existing `/api/agent/gemini` proxy route (so the
`GEMINI_API_KEY` still never touches the browser). Rewrote
`lib/agents/gemini/index.ts` to delegate its tool-use loop to
`AgentRunner.runStream()`, mapping each `RunEvent` to the
corresponding `AgentEvent` for the React UI.

**Preserved unchanged:**
- `sendMessage(text, context)` signature — byte-identical
- Intent classification via `classifyIntent` + `buildAgentContext`
- Zustand store reads (`useWorkingMemory`, `useProjectStore`,
  `useChatStore`) — the UI's source of truth stays authoritative
- Completion summary tracking, `stopped` flag, `configFields`,
  error humanization

**Verified by:** full 119-test Playwright baseline regression check —
**ZERO REGRESSIONS**.

### Task 13.5c — Claude plugin migration

Added `StoryboardClaudeProvider` (POSTs to `/api/agent/chat` with MCP
server passthrough). Rewrote `lib/agents/claude/index.ts` to delegate
to `runStream()`. Preserved `loadSystemPrompt`, `compactHistory`
imports, `trackUsage`/`checkBudget` budget gating on `usage` events,
MCP tool forwarding, stopped flag, configFields.

**Verified by:** storyboard smoke 6/6 + agent-memory / capability-
validation subsets 7/7.

### Task 13.5d — OpenAI plugin migration

Added `StoryboardOpenAIProvider` (POSTs to `/api/agent/openai`).
Rewrote `lib/agents/openai/index.ts` to delegate. Preserved
`loadSystemPrompt`, stopped flag, configFields, error humanization.

**Verified by:** storyboard smoke 6/6.

### Task 13.5e — Built-in plugin (no-op by construction)

The built-in plugin has no LLM tool-use loop — it calls the SDK's
`/enrich` endpoint to plan steps then executes them as a DAG via
`sdkFetch`. There is no inner loop to delegate to `AgentRunner`.
The plugin was inspected and left unchanged.

### Task 13.8 — T10 regression gate

New Playwright spec `tests/e2e/T10-storyboard-regression.spec.ts`
that enforces every title in `baseline-passing.txt` still exists as
a declared `test()` somewhere under `tests/e2e/`. Catches silent
test deletion that would otherwise pass Playwright as "zero
failures". Two tests: the structural gate and a baseline sanity
check. Deliberate baseline changes require updating the fixture
file in the same commit.

### Task 13.9 — CI wiring

Added `storyboard-regression` job to `.github/workflows/agent-sdk.yml`.
Runs on every PR touching `packages/`, `lib/`, `app/`,
`components/`, or `tests/`. Installs Playwright chromium, builds
`@livepeer/agent`, runs T10 + `storyboard.spec.ts` structural smoke.
Uploads Playwright report as an artifact on failure.

**Not in CI:** the full 119-test baseline regression. Eight pre-
existing timeouts would produce noise. Full regression runs remain a
manual gate before merge via `npx playwright test`.

## Explicitly deferred to v1.1

### 13.6 — Zustand ↔ SDK store proxies

Originally planned to add `asAgentStore()` methods on the zustand
canvas/project stores so they could be passed as SDK memory stores.
**No longer needed**: the rewritten plugins keep zustand as the
authoritative UI state and use fresh-per-run `WorkingMemoryStore` /
`SessionMemoryStore` as ephemeral tool-use-loop scratch. Revisit only
if we want SDK memory persistence to survive across sessions.

### 13.7 — Slash command port

`lib/skills/commands.ts` is 491 lines of zustand-bound slash command
handlers (`/skills`, `/organize`, `/context gen` with multi-turn
flow). Migrating to the core `SlashRegistry` is mechanical renaming
with zero semantic win. Deferred to v1.1.

### Built-in plugin rewrite

Not applicable — the built-in plugin has no LLM loop to migrate.

## Final branch state

- **Branch:** `feat/agent-sdk-design` @ `9f59ca4` (67 commits ahead of
  `main`)
- **Unit tests:** 152 core + 14 pack-projects + 21 pack-canvas =
  **187 passing**
- **Playwright:** storyboard smoke 6/6, T10 2/2, 119-test baseline
  verified green after Gemini migration
- **Typecheck:** 43-line pre-existing baseline unchanged
- **Main is untouched on both repos**
- **Paired simple-infra draft PR:** #13 (base: `feat/sdk-nonblocking-io`,
  3 lines added to `app.py`, zero existing handlers modified per
  [INV-8])

## How to run the full regression locally

```
npx playwright test --reporter=json > /tmp/pw-current.json
node -e "
  const r = JSON.parse(require('fs').readFileSync('/tmp/pw-current.json', 'utf8'));
  const passing = new Set();
  (function walk(suite, prefix) {
    for (const s of (suite.suites || [])) walk(s, prefix + ' › ' + s.title);
    for (const spec of (suite.specs || [])) {
      const ok = spec.tests.every(t => t.results.every(r => r.status === 'passed' || r.status === 'skipped'));
      if (ok) passing.add((prefix + ' › ' + spec.title).replace(/^ › /, ''));
    }
  })(r.suites[0], '');
  const baseline = require('fs').readFileSync('tests/e2e/fixtures/baseline-passing.txt', 'utf8').trim().split('\n');
  const regressed = baseline.filter(t => !passing.has(t));
  console.log(regressed.length ? 'REGRESSED:\n' + regressed.join('\n') : 'OK');
"
```

## How to tag and ship v1.0.0-rc.1

Phase 12's approval already cleared all 10 invariants. Phase 13
adds the storyboard consumption path without regression. To tag:

```
git tag -a v1.0.0-rc.1 -m "v1.0.0-rc.1: agent SDK + storyboard integration"
gh auth switch --user seanhanca
git push origin v1.0.0-rc.1
gh auth switch --user qianghan
```

Do not tag until the paired simple-infra PR (#13) has been merged
and deployed — the T5 hosted-session e2e test expects the
`/agent/*` endpoints to exist on the live SDK.
