# Agent SDK — Decisions Reference (compact)

> A compact lookup of every binding decision from the brainstorming
> session. The implementation plan and reviewers reference this file
> instead of re-reading the full spec on every task. Single source of
> truth for "did we say X?". If something here contradicts the full
> spec, the full spec wins — but please file a fix.
>
> Full spec: `docs/superpowers/specs/2026-04-13-agent-sdk-design.md`

## Decisions, indexed by Q

| # | Question | Decision |
|---|---|---|
| Q1 | Package boundary | **Layered (Option C)**: thin core + optional domain packs (`@livepeer/agent` + `@livepeer/agent-pack-projects` + `@livepeer/agent-pack-canvas` + vertical skill packs) |
| Q2 | CLI runtime | **Bun + ink + bun-compiled binary** (Option B); npm install -g for devs, brew install for end users; same source |
| Q3a | Token savings layers | **All 4 client-side layers in v1** (L1 pre-LLM, L2 call construction, L3 hygiene, L4 routing) |
| Q3b | Local-agent offload | **Hybrid b1+b3**: SDK-internal reasoning auto-routes to local `claude`/`codex` (b1, opt-in once), main agent can also explicitly call them via tool (b3) |
| Q3+ | Server-side cooperation | **Layer 5 added**: paired hosted-SDK endpoints for session context, output cache, server-side storyboard loop, formalized enrichment. Layer 5e (capability negotiation) deferred to v1.1 |
| Q4 | Skill system | **Markdown + optional TS hooks (Option B)** with progressive disclosure; vertical packs are npm packages; `livepeer skill gen` LLM-generates skills |
| Q5a | Memory architecture | **4-tier hybrid (Option D)**: Working / Session / Long-term / Hosted-sync |
| Q5b1 | `memory.recall` impl | **Keyword-only in v1**, embeddings opt-in v1.1 behind `--with-embeddings` flag |
| Q5b2 | Cloud sync default | **Opt-in** (`livepeer auth login` + `/sync on` to enable); local-only default for privacy |
| Q6 | MCP server packaging | **Single binary `--mcp` flag in v1**, HTTP+SSE in v1.1; curated 8-tool MCP surface |
| Q7 | Provider abstraction | **Single LLMProvider interface**; gemini, claude, openai, ollama, builtin, no-llm shipped in v1 |
| Q8 | Benchmark harness | **`livepeer bench` ships in v1**; CI fails on >10% token regression |

## Hard invariants the plan must not violate

These are non-negotiable. Any task that breaks one of these is wrong.

1. **The core package has zero React/Next.js/browser dependencies.** The CLI uses ink (which is React, but for terminals — pure Node/Bun). The browser-side storyboard imports the core via NPM as a normal library; the core does not import from the browser.

2. **The `@livepeer/agent` core compiles and runs on Bun ≥ 1.0 AND Node ≥ 20** without modification. CI tests both.

3. **No skill is allowed to inject more than 600 chars into the system prompt** (Layer 2 budget). Skills declare their prompt via frontmatter; the SDK enforces the budget at load time.

4. **Memory writes are append-only.** `memory.jsonl` lines are never modified or deleted. Branching, undo, and rewind all work via pointers and new entries, not destructive edits.

5. **Long-term memory is local-only by default.** Cloud sync is opt-in via `livepeer auth login` + `/sync on`. No telemetry without explicit consent.

6. **The 10× claim is verified, not asserted.** Benchmarks ship in v1 and run in CI. Any task that adds an LLM call without a corresponding benchmark coverage is incomplete.

7. **MCP-exposed tool surface is exactly 8 high-level tools.** Memory, canvas, project-internal, and slash-command tools are NOT exposed via MCP. Adding a 9th tool requires a design discussion.

8. **The hosted SDK contract is additive.** New `/agent/*` endpoints; existing `/inference`, `/capabilities`, `/stream/*` endpoints are not changed.

9. **Provider plugins implement a single interface.** No provider-specific code in the agent runner. Adding a new provider is one file under `providers/`, not a refactor.

10. **The CLI splash first-paint target is <30 ms.** Verified by `livepeer bench --splash` on every release.

## v1 scope (what ships)

### Core package: `@livepeer/agent`

- `agent/runner.ts` — tool-use loop, retry, streaming, ContextVar propagation
- `providers/{gemini,claude,openai,ollama,builtin,none}.ts` — LLM transports
- `tools/registry.ts` + built-in tools (the curated 8-tool set + memory tools)
- `skills/{loader,registry,gen}.ts` — markdown skills + optional TS hooks
- `skills/commands.ts` — slash command runner (port from current storyboard)
- `memory/{working,session,longterm,sync}.ts` — 4-tier memory
- `mcp/{server,client}.ts` — MCP server (stdio) + MCP client (config-driven)
- `preprocessor/{multi-project,scenes,intent}.ts` — port from current storyboard
- `capabilities/{client,resolver}.ts` — hosted-SDK client + capability resolver
- `routing/policy.ts` — tier 0–3 routing
- `cache/{hash,store,sync}.ts` — output cache with optional cloud sync
- `cli/{splash,repl,prompt,slash}.tsx` — ink-based TUI
- `bench/{tasks,runner,report}.ts` — benchmark harness
- `local-agent/{detect,run}.ts` — claude/codex subprocess offload

### Domain packs

- `@livepeer/agent-pack-projects` — Project store + project_create/iterate/generate tools
- `@livepeer/agent-pack-canvas` — Canvas state + spatial layout helpers (used by storyboard web app)
- `@livepeer/agent-pack-episodes` — (optional v1.1)

### Hosted SDK (paired PR on `simple-infra`)

- `POST /agent/session` — create session
- `POST /agent/session/:id/context` — set CreativeContext
- `POST /agent/inference` — inference with auto-injected context (5a)
- `POST /agent/cache/lookup` + `/store` — output cache (5b)
- `POST /agent/storyboard/execute` — server-side loop with SSE (5c)
- `POST /agent/enrich` — formalized enrichment (5d)

### CLI

- `livepeer` — interactive TUI with splash, slash commands, livepeer.md loading
- `livepeer --mcp` — MCP server mode (stdio)
- `livepeer bench` — run benchmark suite
- `livepeer skill gen "..."` — generate a new skill
- `livepeer pack create ...` — scaffold a vertical pack
- `livepeer auth login` — opt in to cloud sync

### Distribution

- `npm install -g @livepeer/agent`
- `brew install livepeer/tap/livepeer-agent`
- Both deliver the same source; brew formula installs a bun-compiled binary

## v1.1 scope (deferred)

- `--with-embeddings` semantic memory recall
- `livepeer mcp serve --port 7777` (HTTP+SSE remote MCP)
- `/agent/inference` capability negotiation (5e)
- Skills-as-agents (sub-agent skills)
- Hosted SDK Redis state (currently in-process)
- Storyboard web app refactor (separate effort, depends on this v1)

## Reference IDs the plan should cite

When tasks reference design decisions, use these IDs so the reviewer can check against this file:

- `[Q1-Layered]`, `[Q2-Bun]`, `[Q3a-AllLayers]`, `[Q3b-Hybrid]`, `[Q3-L5]`, `[Q4-MdHooks]`, `[Q5a-4Tier]`, `[Q5b1-Keyword]`, `[Q5b2-OptIn]`, `[Q6-StdioMCP]`, `[Q7-LLMProvider]`, `[Q8-Bench]`
- `[INV-1]` through `[INV-10]` for the hard invariants
- `[Pkg-Core]`, `[Pkg-Projects]`, `[Pkg-Canvas]` for package-level scope
- `[L5a]`, `[L5b]`, `[L5c]`, `[L5d]` for hosted SDK contract layers

## Out of scope (explicitly NOT in v1)

- Telemetry / analytics on user sessions (privacy-first)
- Web-based skill marketplace (publish via npm directly)
- Built-in payment / billing (use Daydream API key budget)
- Provider-specific model fine-tuning hooks
- Real-time collaboration (one-user-one-session in v1)
- Mobile / iOS / Android (CLI only in v1)
- Authoring GUI for vertical packs (CLI scaffold only)
