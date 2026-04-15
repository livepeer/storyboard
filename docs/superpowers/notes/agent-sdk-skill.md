# SKILL: @livepeer/agent SDK

Captured 2026-04-14 from the completed `feat/agent-sdk-design` branch (75 commits, 187 unit tests, 119 Playwright baseline, 10 hard invariants approved, paired draft PR on `simple-infra`). Read this file first when you need to understand, extend, or debug any part of the agent SDK — core package, domain packs, storyboard integration, Vercel deployment, or the bench harness.

## What this SDK is

`@livepeer/agent` is a Bun-compiled multi-provider agent SDK that ships as a CLI, a library, and an MCP server from one source tree. It was extracted from the storyboard-a3 Next.js app's in-tree agent loop and shipped as three workspace packages:

- **`@livepeer/agent`** — core: types, `AgentRunner`, `ToolRegistry`, 4-tier memory, 6 LLM providers, MCP server/client, skills, slash commands, preprocessor, intent classifier, output cache, routing policy, local-agent offload, benchmark harness, ink CLI
- **`@livepeer/agent-pack-projects`** — domain pack: `ProjectStore` + 4 project tools (`project_create`, `project_iterate`, `project_generate`, `project_status`)
- **`@livepeer/agent-pack-canvas`** — domain pack: `CanvasStore` + spatial layout (`autoLayout`, `narrativeLayout`) + 5 canvas tools (`canvas_get/create/update/remove/organize`)

The storyboard Next.js app at the repo root is the **first consumer** of the SDK. Three of its four agent plugins (Gemini, Claude, OpenAI) delegate their inner tool-use loop to `AgentRunner.runStream()`. The built-in plugin has no LLM loop and is unchanged.

## Where the code lives

```
packages/
  agent/                                # @livepeer/agent core (187 unit tests + T1-T4/T6 e2e)
    src/
      types.ts                          # Message, ToolCall, TokenUsage, Tier, ConversationTurn,
                                        # RunEvent, RunResult, RunOptions
      providers/
        types.ts                        # LLMProvider interface + LLMRequest/LLMChunk union
        mock.ts                         # MockProvider — scripted test double
        gemini.ts                       # GeminiProvider — direct Google API (CLI path)
        claude.ts                       # ClaudeProvider — direct Anthropic API (CLI path)
        openai.ts                       # OpenAIProvider — direct OpenAI API (CLI path)
        ollama.ts                       # OllamaProvider — extends OpenAIProvider, localhost:11434
        builtin.ts                      # BuiltinProvider — SDK-internal deterministic responder
        none.ts                         # NoneProvider — refuses LLM calls (slash-command path)
      memory/
        types.ts                        # CreativeContext, Artifact, Decision, MemoryEvent, etc.
        working.ts                      # Tier 1: WorkingMemoryStore + 800-token budget marshal
        session.ts                      # Tier 2: SessionMemoryStore, keyword recall
        jsonl.ts                        # Append-only JSONL writer [INV-4]
        longterm.ts                     # Tier 3: per-project memory.jsonl replay [INV-5]
      tools/
        types.ts                        # ToolDefinition (snake_case mcp_exposed)
        registry.ts                     # ToolRegistry class
        builtin/
          index.ts                      # MCP_EXPOSED_TOOLS (exactly 8 [INV-7]) + MEMORY_TOOLS
          create_media.ts               # livepeer.create_media (stub — storyboard wraps)
          enrich_prompt.ts              # livepeer.enrich_prompt
          extract_scenes.ts             # livepeer.extract_scenes
          generate_storyboard.ts        # livepeer.generate_storyboard
          start_stream.ts               # livepeer.start_stream
          list_capabilities.ts          # livepeer.list_capabilities
          apply_skill_pack.ts           # livepeer.apply_skill_pack
          gen_skill.ts                  # livepeer.gen_skill
          memory/                       # 6 memory tools (recall/show/thread/pin/forget/summarize)
      agent/
        runner.ts                       # AgentRunner — run() + runStream() [INV-9]
        retry.ts                        # retry() with exponential backoff (429/5xx/timeouts)
        compress.ts                     # compressOldToolResults() — Layer 3 hygiene
        intent.ts                       # classifyIntent — regex-based router
      preprocessor/
        scenes.ts                       # extractScenes — regex scene parsing
        multi-project.ts                # extractProjects — smart-split on scene-number reset
      cache/
        hash.ts                         # hashCacheKey — SHA-256 canonical JSON
        store.ts                        # CacheStore — file-backed, TTL
      routing/
        policy.ts                       # pickTier — Layer 4 cheapest-that-works
      local-agent/
        detect.ts                       # detectLocalAgents — probes $PATH for claude/codex
        run.ts                          # runLocalAgent — spawn with timeout
      skills/
        types.ts                        # Skill interface + SKILL_PROMPT_BUDGET = 600 [INV-3]
        loader.ts                       # parseSkillFile + loadSkillDir (sync, recursive)
        registry.ts                     # SkillRegistry + progressive disclosure
        livepeer-md.ts                  # loadLivepeerMd project loader
        gen.ts                          # generateSkillFromDescription via LLMProvider
        commands.ts                     # SlashRegistry + handler dispatch
      mcp/
        types.ts                        # McpRequest/Response JSON-RPC 2.0
        server.ts                       # McpServer (stdio) [INV-7] exactly 8 tools exposed
        client.ts                       # McpClient — consume external MCP servers
      cli/
        index.ts                        # --version / --mcp / bench / runCli entry
        splash.tsx                      # Splash component [INV-10] <30ms first paint
        repl.tsx                        # Ink REPL with slash dispatch + streaming
        main.tsx                        # Lazy-bootstraps runner after splash mounts
      bench/
        types.ts                        # BenchTask, BenchResult, BenchReport
        tasks.ts                        # 6 representative tasks (B1-B6)
        runner.ts                       # BenchRunner — runOne/runAll
        report.ts                       # compareToBaseline + shouldFailCi (>10% [INV-6])
        baseline.json                   # 7800 tokens seeded baseline
        fixtures/                       # 4-scene multi-scene stress fixture

  agent-pack-projects/                  # @livepeer/agent-pack-projects (14 unit tests)
    src/
      store.ts                          # ProjectStore — in-memory Map, Project/Scene/Style types
      tools/
        create.ts                       # projectCreateTool
        iterate.ts                      # projectIterateTool
        generate.ts                     # projectGenerateTool
        status.ts                       # projectStatusTool
      index.ts                          # registerProjectsPack(opts)

  agent-pack-canvas/                    # @livepeer/agent-pack-canvas (21 unit tests)
    src/
      store.ts                          # CanvasStore + CanvasCard type
      layout.ts                         # autoLayout + narrativeLayout
      tools/
        get.ts / create.ts / update.ts / remove.ts / organize.ts
      index.ts                          # registerCanvasPack(opts)
```

The storyboard app's integration with this SDK lives in **`lib/agents/`** at the repo root (NOT in `packages/`):

```
lib/agents/
  runner-adapter.ts        143 lines   NEW: buildStoryboardRunner + wrapStoryboardTool
  storyboard-providers.ts  524 lines   NEW: 3 LLMProvider shims over Next.js /api/agent/* proxies
  gemini/index.ts          411 lines   MOD: delegates inner loop to runStream(), was 519
  claude/index.ts          223 lines   MOD: delegates inner loop to runStream(), was 263
  openai/index.ts          174 lines   MOD: delegates inner loop to runStream(), was 230
  built-in/index.ts        380 lines   UNCHANGED: no LLM loop, calls /enrich as a DAG
```

Grep this to find every line that touches the SDK from storyboard code:

```
@livepeer/agent | runStream | AgentRunner | ToolRegistry |
WorkingMemoryStore | SessionMemoryStore | StoryboardGeminiProvider |
StoryboardClaudeProvider | StoryboardOpenAIProvider | wrapStoryboardTool |
buildStoryboardRunner
```

That pattern returns **86 lines** across the 5 files. That's the total integration surface.

## Hard invariants (10 of them, all approved by Phase 12 final review)

Each has a specific grep you can run to verify it stays true on future branches:

| ID | Rule | How to verify |
|---|---|---|
| **INV-1** | Core has zero React/Next.js/browser deps | `grep -rn "from \"react\"\|from \"next\|from \"react-dom\"\|@/lib" packages/agent/src/` (ink is allowed as React-for-terminals; no `react-dom`) |
| **INV-2** | Core compiles on Bun ≥ 1.0 AND Node ≥ 20 | `.github/workflows/agent-sdk.yml` has `test-bun` + `test-node` jobs; `engines` field declares both; dist build is `--target=node` + externals |
| **INV-3** | No skill prompt > 600 chars | `parseSkillFile` throws at line 13-17 of `packages/agent/src/skills/loader.ts`; 600 is in `SKILL_PROMPT_BUDGET` |
| **INV-4** | Memory writes are append-only | `grep -nE "writeFile\|unlink\|truncate\|rm\(\|rename\|ftruncate" packages/agent/src/memory/jsonl.ts` — only `fs.appendFile` allowed |
| **INV-5** | Long-term memory local-only by default | `grep -nE "fetch\(\|http://\|https://\|axios\|got\(" packages/agent/src/memory/` — zero hits. Cloud sync gated behind `livepeer auth login` + `/sync on` |
| **INV-6** | CI fails on >10% token regression | `shouldFailCi` wired into `livepeer bench` exit code + GH workflow `bench` job on every PR |
| **INV-7** | MCP exposes EXACTLY 8 tools | `grep -rn "mcp_exposed: true" packages/agent/src/` returns exactly 8. `McpServer.listTools().length === 8` enforced by a unit test. Memory tools and pack tools MUST NOT have `mcp_exposed: true` |
| **INV-8** | Hosted SDK contract is additive | Paired PR on `livepeer/simple-infra` (feat/agent-layer-5 → base `feat/sdk-nonblocking-io`) adds `/agent/*` routes with only **+3 lines** in `app.py` for the router include |
| **INV-9** | Providers implement a single LLMProvider interface | `grep -iE "gemini\|anthropic\|openai\|ollama" packages/agent/src/agent/` returns zero hits. Runner is provider-agnostic |
| **INV-10** | CLI splash first paint < 30ms | T4 e2e measures median across 5 cold-starts; current median is **9.29ms** |

Add any new invariant only with a specific grep that a future reviewer can run mechanically. Unit-testable beats grep beats prose.

## Major decisions implemented (from the brainstorming session — all bound)

| # | Q | Decision | Lives in |
|---|---|---|---|
| Q1 | Package boundary | **Layered (Option C)**: thin core + optional domain packs + vertical skill packs | `packages/` monorepo |
| Q2 | CLI runtime | **Bun + ink + bun-compiled binary** (single source for npm + brew) | `packages/agent/src/cli/` + `build:binary` script |
| Q3a | Token savings layers | **All 4 client-side layers in v1** (L1 pre-LLM, L2 call construction, L3 hygiene, L4 routing) | preprocessor/, intent/, cache/, routing/, agent/compress.ts, agent/retry.ts |
| Q3b | Local-agent offload | **Hybrid b1+b3**: SDK-internal reasoning auto-routes to local claude/codex, main agent can call them as a tool | `packages/agent/src/local-agent/` (b3 tool wiring is Phase 6+ future) |
| Q3+ | Server-side cooperation | **Layer 5 added**: paired hosted-SDK endpoints. L5e capability negotiation deferred to v1.1 | `simple-infra/sdk-service-build/agent_layer.py` (draft PR #13) |
| Q4 | Skill system | **Markdown + optional TS hooks** with progressive disclosure; `livepeer skill gen` LLM-generates skills | `packages/agent/src/skills/` |
| Q5a | Memory architecture | **4-tier hybrid**: Working / Session / Long-term / Hosted-sync | `packages/agent/src/memory/` (hosted-sync deferred) |
| Q5b1 | `memory.recall` impl | **Keyword-only in v1**, embeddings opt-in v1.1 behind `--with-embeddings` | `SessionMemoryStore.recall()` — pure `includes()` match |
| Q5b2 | Cloud sync default | **Opt-in** (`livepeer auth login` + `/sync on`); local-only default for privacy | v1.1 deferred |
| Q6 | MCP server packaging | **Single binary `--mcp` flag in v1**, HTTP+SSE in v1.1; curated 8-tool MCP surface | `packages/agent/src/mcp/server.ts` + `cli/index.ts` `--mcp` branch |
| Q7 | Provider abstraction | **Single LLMProvider interface**; gemini, claude, openai, ollama, builtin, none shipped in v1 | `packages/agent/src/providers/` |
| Q8 | Benchmark harness | **`livepeer bench` ships in v1**; CI fails on >10% token regression | `packages/agent/src/bench/` + workflow |

## Architecture — how the pieces talk

### Core request flow (CLI or library consumer)

```
consumer.run({ user: "..." })
  │
  └─ AgentRunner.run() → internally calls runStream() and collects events
       │
       └─ AgentRunner.runStream() — yields RunEvent values progressively
            │
            ├─ marshals WorkingMemoryStore → system message at start
            ├─ records user turn into WorkingMemory + SessionMemory
            ├─ loops up to maxIterations (default 10):
            │    │
            │    ├─ compressOldToolResults(messages)  [Layer 3]
            │    ├─ retry(() => provider.call(req))   [Layer 2 resilience]
            │    │
            │    └─ for await (chunk of provider.call(req)):
            │         ├─ text → yield { kind: "text" }
            │         ├─ tool_call_start/args/end → assemble then
            │         │     yield { kind: "tool_call", id, name, args }
            │         ├─ usage → yield { kind: "usage", usage }
            │         └─ error → yield { kind: "error" } + return
            │
            ├─ execute each tool via registry.get(name).execute(args, ctx)
            ├─ for each tool result: yield { kind: "tool_result", ... }
            ├─ feed tool results back into messages, repeat loop
            │
            └─ when no more tool calls: yield { kind: "turn_done" } + { kind: "done", result }
```

### Storyboard integration flow (Phase 13 delegation path)

```
ChatPanel.sendMessage(text)
  │
  ├─ parseCommand(text) → null if not a slash command
  ├─ preprocessPrompt(text) → client-side scene extraction if multi-scene
  │
  └─ geminiPlugin.sendMessage(text, context)  [lib/agents/gemini/index.ts]
       │
       ├─ classifyIntent + buildAgentContext  [storyboard-specific prep]
       ├─ working.setCriticalConstraints([system])  [@livepeer/agent]
       ├─ tools = new ToolRegistry()  [@livepeer/agent]
       ├─ for sbTool of listStoryboardTools():
       │    tools.register(wrapStoryboardTool(sbTool))  [runner-adapter.ts]
       │
       ├─ provider = new StoryboardGeminiProvider()  [routes through /api/agent/gemini]
       ├─ runner = new AgentRunner(provider, tools, working, session)
       │
       ├─ for await (event of runner.runStream({ user: text })):
       │    ├─ text → yield AgentEvent{ type: "text" } → chat UI
       │    ├─ tool_call → yield AgentEvent{ type: "tool_call" } → chat UI
       │    ├─ tool_result → yield AgentEvent{ type: "tool_result" } → chat UI + canvas
       │    └─ usage → promptTokens[input/output/cached] += ...
       │
       ├─ say("Done in Ns — media: N created — X tokens (IN in / OUT out)")
       │
       └─ for pid of touchedProjectIds:
            useProjectStore.getState().addProjectTokens(pid, promptTokens)
            say(`Project "..." — N tokens across M turns`)
```

**Key insight:** the storyboard plugin is the **outer orchestration** (context building, intent classification, zustand integration, error humanization, completion summaries). The SDK's `runStream` is the **inner tool-use loop**. The seam is clean — plugins keep 100% of their UX logic, SDK takes over the retry/compress/streaming mechanics.

### StoryboardXxxProvider pattern

All three rewritten providers follow the same shape:

```typescript
class StoryboardXxxProvider implements LLMProvider {
  readonly name = "xxx-proxy";
  readonly tiers: Tier[] = [0, 1, 2, 3];

  async *call(req: LLMRequest): AsyncIterable<LLMChunk> {
    const body = this.buildBody(req);           // translate LLMRequest → native format
    const resp = await fetch("/api/agent/xxx", {...});
    if (!resp.ok) { yield { kind: "error" }; return; }
    const data = await resp.json();
    // yield text chunks
    // yield tool_call_start/args/end for each function call
    // yield { kind: "usage", usage } from response metadata
    yield { kind: "done" };
  }

  private buildBody(req: LLMRequest) {
    // Translate portable Message[] into provider-native format
    // Handle role mapping (assistant+tool_calls → Gemini functionCall parts,
    // Anthropic tool_use blocks, OpenAI tool_calls arrays)
    // Merge consecutive same-role messages (Gemini/Anthropic alternation rule)
    // Extract system message → top-level system field
  }
}
```

The API-key-holding Next.js proxy routes (`/api/agent/gemini`, `/api/agent/chat`, `/api/agent/openai`) are unchanged — they accept the same native-format bodies they always have. Only the browser side of the contract changed.

## Operational state — current branch

- **Branch:** `feat/agent-sdk-design` @ **~75 commits** ahead of `main`
- **Main is untouched on both repos.** `git checkout main` returns a fully working storyboard instantly.
- **Unit tests:** 152 core + 14 pack-projects + 21 pack-canvas = **187 passing**
- **E2E green:** T2 (MCP stdio), T3 (CLI smoke), T4 (splash <30ms, median 9.29ms), T6 (pack composition), T10 (regression gate 2/2), storyboard smoke 6/6
- **E2E gated:** T1 (GEMINI_API_KEY), T5 (DAYDREAM_API_KEY && RUN_T5=1), T7 (both keys), T8 (`SKIP_T8=1`), T9 (`SKIP_T9=1`)
- **Playwright baseline frozen:** 119 passing test titles in `tests/e2e/fixtures/baseline-passing.txt`. T10 enforces the list stays intact structurally; full pass-rate check is a manual gate.
- **Storyboard typecheck:** 31 lines of pre-existing errors (down from 43 after Phase 13 fixed the `lib/layout/engine.ts` `Card[][]` type bug). Matches main.
- **Paired PR:** `livepeer/simple-infra#13` (DRAFT, base `feat/sdk-nonblocking-io`) — +3 lines in `app.py` for the agent_layer router include, full additive new routes
- **Vercel preview alias:** `https://storyboard-feat-agent-sdk.vercel.app` — auto-follows the latest deploy of this branch. Still behind Vercel SSO Deployment Protection (manual dashboard toggle to disable for preview)
- **Local prod server:** `http://localhost:3000` (background task, restarts on every rebuild). Uses the same build chain as Vercel.

## Build + deployment

### Local dev loop (fastest)

```bash
# From repo root
bun install                              # once, wires workspace symlinks
cd packages/agent && bun run build       # bun bundle for CLI + libs
cd ../agent-pack-projects && bun run build  # tsc
cd ../agent-pack-canvas && bun run build    # tsc
cd ../.. && npm run dev                     # Next.js dev on :3000
```

### Production / Vercel-style build (portable, npm-only)

```bash
# Clean state
rm -rf packages/agent/dist packages/agent-pack-projects/dist \
       packages/agent-pack-canvas/dist .next

# Pre-build workspace deps using tsc-only (no bun required)
npm run build:workspaces
# runs:
#   npm run build:lib --workspace=@livepeer/agent        (tsc -p tsconfig.lib.json)
#   npm run build --workspace=@livepeer/agent-pack-projects
#   npm run build --workspace=@livepeer/agent-pack-canvas

# Then build Next.js
npm run build                            # next build
```

**Why two tsconfigs in `packages/agent`:**
- `tsconfig.json` — full build including CLI `.tsx` files (requires @types/react 18 via ink). Used by bun-based local build.
- `tsconfig.lib.json` — excludes `src/cli/**/*` entirely, enables `skipLibCheck`. Used by Vercel's npm+tsc build chain, which resolves `@types/react` from the hoisted root (React 19, incompatible with ink's `@types/react 18`). The storyboard app only imports the library entry (`src/index.ts`), not the CLI, so the exclusion is free.

### Vercel build chain

```json
// vercel.json
{
  "framework": "nextjs",
  "regions": ["iad1"],
  "installCommand": "bun install --frozen-lockfile",
  "buildCommand": "npm run build:workspaces && next build"
}
```

**Why `bun install` on Vercel:**
The repo uses `workspace:*` protocol in `package.json` dependencies. Vercel's default npm is too old (`EUNSUPPORTEDPROTOCOL — Unsupported URL Type "workspace:"`). `bun install` handles `workspace:*` natively and uses the existing `bun.lock` for reproducibility. Vercel's build image has bun available.

**Vercel env vars set (preview + production):**
- `ANTHROPIC_API_KEY` — mirrored from `.env.local` (108 chars)
- `GEMINI_API_KEY` — mirrored from `.env.local` (39 chars)
- `NEXT_PUBLIC_SDK_URL` — pre-existing
- `NEXT_PUBLIC_DEFAULT_AGENT` — pre-existing
- **Not yet set:** `OPENAI_API_KEY` — the OpenAI plugin on Vercel will 500 until this is added

**Gotcha:** `vercel env add NAME preview` reads value from stdin. Piping raw `grep/cut` output captures trailing newlines that corrupt the stored value. Use `awk '/^NAME=/ { gsub(/[[:space:]]+$/, "", $2); printf "%s", $2 }' .env.local | vercel env add NAME preview` to sanitize. The `printf "%s"` (no `\n`) matters.

**Also note:** Vercel `env pull` writes values wrapped in literal `"..."` quotes in the output `.env` file. The wrapping is for shell-sourcing, not corruption — if you see `len = stored_len + 2` it's just the quotes, the actual value is correct.

**Deployment Protection:** project has Vercel SSO auth on all preview/production deploys. Browser hits 401 for unauthenticated requests. To disable for Preview only (recommended for demo): web dashboard → **Project Settings → Deployment Protection → Vercel Authentication** → set to "Only Production". Alternatively generate a **Protection Bypass for Automation** secret and append `?x-vercel-protection-bypass=<secret>&x-vercel-set-bypass-cookie=true` to any URL.

**Stable alias:** `vercel alias set <deploy-url> storyboard-feat-agent-sdk.vercel.app --scope livepeer-foundation`. The alias follows subsequent `vercel deploy --yes` invocations automatically.

### Live BYOC orchestrator state

`byoc-staging-1.daydream.monster` (NOT `byoc-a3-staging-1` — that VM was decommissioned; CLAUDE.md is stale on that row). Current `CAPABILITIES_JSON` already includes **all three Veo 3.1 variants** via fal.ai:

```json
{"name": "veo-t2v",       "model_id": "fal-ai/veo3.1/fast"}
{"name": "veo-i2v",       "model_id": "fal-ai/veo3.1/image-to-video"}
{"name": "veo-transition","model_id": "fal-ai/veo3.1/first-last-frame-to-video"}
```

Plus the existing Gemini/fal capabilities (flux-dev, flux-schnell, recraft-v4, gemini-image, gemini-text, ltx-i2v, ltx-t2v, kontext-edit, bg-remove, topaz-upscale, chatterbox-tts, nano-banana, lipsync, music, sfx, talking-head, sam3, face-swap, flux-fill).

The storyboard now routes `action=animate` → `veo-i2v` (fallback `ltx-i2v`) via a 1-line change in `lib/tools/compound-tools.ts::selectCapability`. Text-to-video is handled by detecting the "user wants video" intent (regex: `video|clip|cinematic|animat*|N-second|footage`) on the prompt text, which rescues both `generate+video` and `animate-without-source` into `veo-t2v`.

## Recent bug fixes after the 13-phase completion (chronological)

1. **Empty STOP clarifier** (`lib/agents/gemini/index.ts`): when `runStream` finishes with no text and no tool calls (common when Gemini returns `finishReason: STOP` with empty content on vague prompts + many tools), the plugin now makes a **second** `runStream` call with a **tool-less** ToolRegistry and a meta-prompt asking Gemini to generate 2-3 clarifying questions in natural language. Result streams back as normal text events. No hardcoded templates. If even the clarifier fails, a static "tell me visual style + shot differentiation" fallback fires. Replaces the former "Couldn't process that. Try rephrasing?" UX.

2. **Veo i2v routing** (`lib/tools/compound-tools.ts::selectCapability`): `action=animate` was hardcoded to `ltx-i2v`. Now prefers `veo-i2v` when present in the live capability registry. Quality jump: Veo 3.1 produces 8-second 720p/1080p/4k output with **native synchronized audio**; LTX 2.3 is silent 5-second video.

3. **Text-to-video rescue** (same file): `selectCapability` now accepts `hasSourceUrl` and `promptText` parameters. Handles:
   - `generate` + video intent → `veo-t2v`
   - `animate` + no source → `veo-t2v` (rescue misroute)
   - `animate` + source → `veo-i2v` (correct)
   - `generate` + no video intent → `flux-dev` (unchanged)
   Fixes the "All 1 failed: No output from veo-i2v" error when the LLM picked `animate` for a text-to-video request.

4. **Multi-line slash commands** (`lib/skills/commands.ts::parseCommand`): the regex `^\/(\S+)(?:\s+(.*))?$` used `.` which in JS does NOT match newlines by default. Any multi-line paste of `/context gen <long description>` with actual `\n` characters failed the match, `parseCommand` returned `null`, and the raw text fell through to the normal agent path — Gemini saw literal `/context gen A cinematic short film...` as a creative request and got confused. Fix: `(.*) → ([\s\S]*)`. One-character-class change, applies to every slash command with a prose body.

5. **Per-prompt + per-project token summary** (all three plugins + `lib/projects/store.ts`): the plugins now accumulate `usage` events into `promptTokens` during each runStream call, capture any `project_id` from `tool_result` events, and:
   - append `— N tokens (IN in / OUT out)` to the completion summary line
   - call `store.addProjectTokens(pid, usage)` for every touched project
   - emit a second line: `Project "..." — X tokens across M turns`
   Per-project totals **persist to localStorage** alongside the rest of the project state.

6. **`lib/layout/engine.ts` type bug**: `LayoutContext["cards"][][]` parsed as `Card[][][]` (3D) because indexed-access binds tighter than the array suffix — but the code expected `Card[][]`. Pre-existing on `main`, unblocked Vercel's strict tsc build during Phase 13.9.

## Gaps remaining — v1.1 and beyond

### Phase 13 explicitly deferred

- **13.6 Zustand ↔ SDK store proxies** — was supposed to add `asAgentStore()` methods so zustand stores could implement the SDK's memory store interface. No longer needed because plugins keep zustand as authoritative for UI state and use fresh `WorkingMemoryStore`/`SessionMemoryStore` per-run as ephemeral scratch. Revisit only if SDK memory persistence across sessions becomes a requirement.
- **13.7 Slash command port to core `SlashRegistry`** — 491 lines in `lib/skills/commands.ts` are zustand-bound handlers (`/skills`, `/organize`, `/context gen` with multi-turn flow). Migrating to core `SlashRegistry` is mechanical renaming with zero semantic win. Deferred.
- **13.5e Built-in plugin rewrite** — no-op by construction. The built-in plugin has no LLM tool-use loop; it calls the SDK `/enrich` endpoint and executes steps as a DAG via `sdkFetch`. There's nothing to delegate.

### v1.1 original scope

- **`--with-embeddings` semantic memory recall** — gated behind a flag. Keyword-only today per [Q5b1].
- **`livepeer mcp serve --port 7777`** — HTTP+SSE remote MCP server. Stdio only today per [Q6].
- **L5e capability negotiation** — the hosted SDK `/agent/inference` endpoint doesn't yet negotiate which Layer (client, L5a, L5b, etc.) should handle a request. Deferred from Phase 10.
- **Skills-as-agents** — sub-agent skills that can spawn their own runner. Deferred.
- **Hosted SDK Redis state** — session/context/cache in `agent_layer.py` are in-process dicts for v1. Multi-instance or long-lived deployments need Redis.
- **OpenAI key on Vercel** — add `OPENAI_API_KEY` as a project env var (`vercel env add`) so the OpenAI plugin works on the deployed preview.
- **Vercel SSO toggle for Preview** — manual dashboard step to flip off Vercel Authentication for preview branches so the demo URL is publicly accessible without a bypass secret.

### Direct-Gemini Veo path (not yet planned, but researched)

Google made Veo 3.1 accessible via the Gemini API directly (models `veo-3.1-generate-preview`, `veo-3.1-lite-generate-preview`, `veo-3.1-fast-generate-preview`) via a long-running-operation (`:predictLongRunning` + poll `operations/{id}`). The BYOC orch currently routes through fal.ai (which handles the polling internally). A direct-Gemini path in the BYOC orch would **save the fal.ai markup (~30-40%)** but requires:

1. A new async adapter in the go-livepeer BYOC fork that handles `predictLongRunning` + polling every few seconds
2. The existing `gemini/` namespace in `CAPABILITIES_JSON` is synchronous (`gemini/gemini-2.5-flash-image`, `gemini/gemini-2.5-flash` are both single-shot). Adding Veo would need either a new async provider class or a polling wrapper around the existing one.

**Recommendation:** keep routing Veo through fal.ai for now. The three `fal-ai/veo3.1/*` capabilities already work end-to-end and were already registered before Phase 13 started. Direct-Gemini Veo is a v1.1 cost optimization, not a functionality gap.

### Testing gaps

- **T1 live Gemini** runs only when `GEMINI_API_KEY` is set. Burns ~1 cent per run. Not in default CI.
- **T5 hosted session** double-gated behind `DAYDREAM_API_KEY && RUN_T5=1`. Needs the paired simple-infra PR to deploy before it can pass. Currently permanently skipped in CI.
- **T7 full-stack** requires both keys. Nightly-only.
- **T8/T9 distribution** slow (30-60s each). Opt-in via `SKIP_T8=` / `SKIP_T9=` unset.
- **Full 119-test Playwright baseline** runs manually before merge. NOT in CI — 8 pre-existing Gemini-workflow timeouts would produce noise. CI runs only T10 + `storyboard.spec.ts` structural smoke.
- **Claude/OpenAI plugin migrations** don't have dedicated Playwright coverage. The 119 baseline tests all use the default (Gemini) plugin.

## How to extend the SDK

### Adding a new LLM provider

1. Create `packages/agent/src/providers/<name>.ts` implementing `LLMProvider`
2. Use `async *call(req: LLMRequest): AsyncIterable<LLMChunk>` — yield text / tool_call_start / tool_call_args / tool_call_end / usage / done / error chunks
3. Extract streaming parse into a private `parseChunk()` method (pattern established by gemini.ts and claude.ts — openai.ts was fixed in Phase 5 review for this)
4. Add 4+ unit tests with `vi.fn` mocked `globalThis.fetch`, restore in `afterEach`
5. Gate any live test behind an env var via `describe.skipIf(!process.env.XXX_API_KEY)`
6. Re-export from `packages/agent/src/index.ts` top-level
7. **Never** import provider-specific code anywhere outside `src/providers/` — [INV-9]

### Adding a new tool to the curated MCP surface

You almost certainly shouldn't. The surface is frozen at exactly 8 per [INV-7]. To add a 9th requires a design discussion per the decisions reference. If you need a new tool that's internal to a consumer, add it via a domain pack with `mcp_exposed: false`.

### Adding a new domain pack

1. Create `packages/agent-pack-<name>/` with `package.json` (workspace dep on `@livepeer/agent`), `tsconfig.json` extending `../../tsconfig.base.json`, `src/store.ts`, `src/tools/*.ts`, `src/index.ts` with a `register<Name>Pack(opts)` helper
2. Each tool gets `mcp_exposed: false`
3. Tests under `tests/` (not `test/`)
4. Update `package.json` root `build:workspaces` script to include the new pack
5. Update `lib/agents/runner-adapter.ts::buildStoryboardRunner` if the storyboard should auto-register the pack

### Adding a new invariant

Only if you can write a grep or unit test that enforces it mechanically. Prose-only invariants drift. See the invariant table format above.

### Adding a new bench task

1. Append to `BENCH_TASKS` in `packages/agent/src/bench/tasks.ts`
2. Set `maxTokens` conservatively based on the naive baseline, not the optimized target
3. Provide at least one positive path and one error path
4. Update `baseline.json` with the new cumulative total (ship the delta in the same commit)
5. CI automatically picks it up on the next bench run

### Debugging a failed agent turn

1. Check the browser console for `[Gemini]` / `[Claude]` / `[OpenAI]` logs — the plugin prints request shape and response summary
2. Check the per-prompt token summary at the bottom of the chat — if it's 0, the provider errored before reporting usage
3. DevTools Network tab → filter `/api/agent/` → inspect the raw response from the proxy
4. If the agent says "Couldn't process that" OR "No output from X": check the StoryboardXxxProvider's `buildBody()` to see what shape it's sending — most misroutes are a mismatch between the LLM's tool_call format and the provider's native format
5. If it's an infinite loop: check the `stopped` flag plumbing and the `maxIterations` cap

### Demo prompts that exercise the full stack

Use the "Luca, Amalfi courier" prompt chain from the Phase 13 wow demo (see `docs/superpowers/notes/2026-04-14-phase-13-complete.md` for the full script). Short version:

1. `/context gen <multi-line creative brief>` — locks CreativeContext in zustand, marshals into every future runStream call
2. **6-scene multi-scene brief** (with `SCENE N —` markers) — preprocessor extracts client-side, project_create + project_generate stream cards in batches
3. `/organize narrative` — pack-canvas spatial layout, tier-0 no-LLM
4. `animate the <emotional scene>` with source_url — routes to `veo-i2v` → fal.ai → Gemini API → Veo 3.1 → video card with native audio
5. Read the per-project token total at the bottom: ~2,000 tokens for a short film including an 8-second Veo clip. Screenshot it.

## References

- **Plan:** `docs/superpowers/plans/2026-04-13-agent-sdk.md` (7500 lines, 13 phases, 89 tasks)
- **Decisions reference:** `docs/superpowers/specs/2026-04-13-agent-sdk-decisions-ref.md` (compact Q1-Q8 + INV-1..10 lookup)
- **Full spec:** `docs/superpowers/specs/2026-04-13-agent-sdk-design.md` (701 lines)
- **Phase 13 completion note:** `docs/superpowers/notes/2026-04-14-phase-13-complete.md`
- **Storyboard consumer code:** `lib/agents/runner-adapter.ts`, `lib/agents/storyboard-providers.ts`, `lib/agents/gemini/index.ts`, `lib/agents/claude/index.ts`, `lib/agents/openai/index.ts`
- **Paired hosted-SDK PR:** `livepeer/simple-infra#13` (DRAFT, base `feat/sdk-nonblocking-io`)
