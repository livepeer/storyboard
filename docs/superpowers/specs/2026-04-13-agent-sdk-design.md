# Livepeer Agent SDK Design Spec

**Status:** brainstorming approved, plan pending
**Branch:** `feat/agent-sdk-design` (off `main` in `livepeer/storyboard`)
**Date:** 2026-04-13
**Companion repo:** `livepeer/simple-infra` for the hosted SDK contract changes

## Goals (from the original brief)

1. Extract the agent core from the storyboard app into a standalone SDK so building agent-first media apps becomes simple
2. Expose the SDK as an MCP server so other agents can use it (Claude Code, Cursor, etc.) and as an MCP client so it can use other agents' tools
3. Achieve **at least 10× token savings** producing the same artifacts vs a naive agent baseline
4. Use locally installed `claude` and `codex` CLIs as offload targets to extend the SDK's reasoning capabilities at zero API cost
5. Extensible via custom skills, including LLM-generated skills tailored to specific verticals (e.g., "luxury skincare ads")
6. Distributable via `npm install -g @livepeer/agent` and `brew install livepeer-agent`, requiring only `LIVEPEER_API_KEY` and `LIVEPEER_SDK_URL` env vars
7. Interactive CLI like Claude Code: instant startup, splash screen with logo, version, working directory, loads `livepeer.md` from the project for user-defined skills
8. As a result of all of the above, the storyboard web app becomes a thin shell on top of the SDK

## Non-goals

- Replacing the hosted SDK / BYOC orch / fal pipeline. The agent SDK is a client/orchestration layer; media generation still happens server-side via `sdk.daydream.monster`.
- Inventing a new agent protocol. The SDK consumes existing LLM provider APIs (Anthropic, Gemini, OpenAI, Ollama-compatible) and speaks standard MCP for inter-agent.
- Replacing the storyboard's React UI. The web app stays React + Next.js; only the non-UI logic moves to the SDK.
- Building a new media model. Models stay in fal/BYOC.
- Cloud sync as default. Sync is opt-in (privacy-first).

## Tech Stack

- **Runtime:** Bun (1.x) for the CLI binary; Node compatible source so the same code runs in the storyboard's Next.js app and in CI
- **CLI TUI:** ink (React for terminal — same library Claude Code uses)
- **Distribution:** `npm install -g @livepeer/agent` (JS package, runs on Bun or Node) and `brew install livepeer-agent` (bun-compiled standalone binary, no runtime needed)
- **Language:** TypeScript with strict types
- **Package layout:** monorepo with workspaces — core + optional domain packs
- **MCP:** stdio transport in v1, HTTP+SSE in v1.1
- **Hosted SDK:** Python FastAPI in `simple-infra/sdk-service-build/app.py` (existing); Layer 5 endpoints added as a paired PR

## Architecture overview

The SDK is a layered stack. Each layer can be replaced or extended without touching the others. The bottom is provider transports (LLMs, MCP, hosted SDK); the top is the interactive CLI / library API. The middle is where 95% of the value lives.

```
┌──────────────────────────────────────────────────────────────────┐
│  CLI / Library API                                               │
│    livepeer (interactive)  |  import { Agent } (programmatic)   │
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│  Agent Runner                                                    │
│    Tool-use loop · Streaming · Retry · ContextVar propagation    │
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│  Memory (4 tiers)             Skills              Tool registry  │
│    Working                       Markdown +          Built-in     │
│    Session                       optional TS         MCP-imported │
│    Long-term                     Vertical packs      User-added   │
│    Hosted sync (opt-in)          Skill gen                        │
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│  Token-savings layers (orthogonal, all active simultaneously)    │
│    L1 Pre-LLM  ·  L2 Call construction  ·  L3 Hygiene            │
│    L4 Routing  ·  L5 Hosted SDK cooperation                      │
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│  Provider/transport abstraction                                  │
│    LLM providers · MCP server · MCP client · Hosted SDK client   │
│    Local-agent subprocess (claude, codex)                        │
└──────────────────────────────────────────────────────────────────┘
```

## Package layout (Layered, Option C from Q1)

```
@livepeer/agent              ← thin core, the SDK itself
  src/
    agent/         ← Agent runner, tool-use loop, retry, streaming
    providers/     ← gemini, claude, openai, ollama, builtin, no-llm
    tools/         ← Built-in tool registry + core tools
    skills/        ← Skill loader, registry, /context system, slash commands
    memory/        ← Working / session / long-term tiers + memory tools
    mcp/           ← MCP server (stdio) + MCP client (config + spawn + register)
    preprocessor/  ← Multi-project split, scene extraction, smart routing
    capabilities/  ← Hosted-SDK client + capability resolver
    routing/       ← Layer 4 model routing policy
    cache/         ← Output cache (Layer 1 + L5b sync)
    cli/           ← ink TUI, splash screen, slash-command UI
    bench/         ← Benchmark harness
  package.json     ← exports the runtime + binary

@livepeer/agent-pack-projects     ← optional domain pack: project-aware media flows
@livepeer/agent-pack-episodes     ← optional domain pack: episode/series management
@livepeer/agent-pack-canvas       ← optional domain pack: spatial layout helpers
                                     (the storyboard app imports this one)

@livepeer/skill-pack-makeup-ads     ← example vertical pack
@livepeer/skill-pack-luxury-skincare ← example vertical pack
```

The base `@livepeer/agent` is what `npm install -g` and `brew install` deliver. Domain packs are opt-in; the storyboard app installs `@livepeer/agent` + `@livepeer/agent-pack-projects` + `@livepeer/agent-pack-canvas` and the React UI on top.

## Token savings stack (Layers 1–5)

The 10× claim only holds if all five layers are active simultaneously and the routing layer is smart enough to pick cheap models for routine work. Each layer protects against a different failure mode of "just send everything to Claude Opus."

### Layer 1 — Pre-LLM: skip the API entirely

Catch traffic before it reaches an LLM.

| Mechanism | Where | Status |
|---|---|---|
| Multi-project preprocessor | `preprocessor/` | Already exists, port verbatim |
| Fast intent classifier (regex) | `agent/intent.ts` | Already exists, port |
| Slash command runner | `skills/commands.ts` | Already exists, port |
| Pinned-skill matcher | `skills/registry.ts` | Already exists, port |
| Output cache | `cache/` | New — keyed by `(provider, model, prompt, params)`, file-backed in long-term memory, optional sync to hosted SDK |
| Local-agent offload | `agent/local.ts` | New — spawns `claude` / `codex` subprocesses for SDK-internal reasoning tasks; opt-in once at first run |

### Layer 2 — Call construction: minimize what you send

For traffic that genuinely needs an LLM.

- **Tool schema gating**: the agent runner consults the intent classifier to load only the relevant tool subset per call. Default: 3–5 tools per turn instead of all 20+.
- **System prompt budget**: hard cap of 600 chars on the system prompt. Skills extend the prompt only when they're actively loaded for the current turn.
- **Provider-side prompt caching**: the runner builds the prompt in a cache-friendly order (stable system + stable tool schemas + dynamic user content). Anthropic + Gemini + OpenAI all cache by prefix hash.
- **Lazy skill injection**: skill prompts only enter the system message when the skill is loaded for the current turn.
- **Tool result compression**: long tool returns (capability list, project state) are compressed before being added to the conversation history.

### Layer 3 — Conversation hygiene: keep history small

- Sliding window: last 5–10 turns verbatim, older turns progressively summarized
- Tool result archival: older tool results replaced with `[result: artifact_id]` references — recallable via `memory.show` if needed
- Branch / rewind without rebuilding the whole timeline

### Layer 4 — Model routing: cheapest tier that can do the job

Tiered routing policy:

| Tier | Models | Used for |
|---|---|---|
| 0 | regex / pattern match | Slash commands, intent classifier, simple confirmations |
| 1 | Gemini Flash, Claude Haiku, GPT-4o-mini | Routine tool calls, short responses, mechanical tool-use turns |
| 2 | Claude Sonnet, Gemini Pro, GPT-4o | Hard reasoning, multi-step planning, creative direction |
| 3 | Claude Opus, GPT-4 | Vertical-specific deep work, critical decisions, sparingly |

Default policy: Tier 1 for everything except turns flagged "needs reasoning" by the intent classifier. Skill authors can override per-skill via frontmatter (`tier: 3`).

### Layer 5 — Hosted SDK cooperation

The agent SDK and the hosted SDK (`sdk.daydream.monster`) cooperate via new endpoints. This is a paired contract — the spec lives here, the implementation lands as a parallel PR on `simple-infra`.

#### 5a — Server-side session context

```
POST /agent/session                       → { session_id }
POST /agent/session/:id/context           { creative_context }
POST /agent/inference                     { session_id, capability, prompt }
```

The hosted SDK stores the active CreativeContext per session in Redis (10-minute TTL). When a client calls `/agent/inference`, the hosted SDK auto-injects the context as a prompt prefix before forwarding to BYOC. The client never re-sends the context. Saves 30–50 words per call × all media-gen calls in a session.

#### 5b — Server-side output cache

Hash `(provider, model, full_resolved_prompt, params, daydream_user_id)`. If a matching artifact exists from the last 24 hours, return the cached URL immediately. Cache is shared across the user's sessions (cross-device) and optionally across all users for non-personal prompts. Saves real fal credit, not just tokens.

#### 5c — Server-side storyboard execution loop

```
POST /agent/storyboard/execute            { session_id, scenes[], style_guide }
       → SSE stream of { event: "scene_done", scene_id, url }
                       | { event: "all_done" }
```

The hosted SDK runs the full multi-scene generation loop server-side, parallel-fans-out to BYOC, streams results back via SSE. The agent SDK calls this **once** per storyboard. The LLM never re-enters the loop after planning. This is the linchpin of "storyboard becomes a thin shell" — in-flight project state lives server-side.

#### 5d — Server-side prompt enrichment

The SDK never calls Gemini directly for enrichment. It uses the existing `/enrich/v2` endpoint which routes through BYOC's enrichment pipeline (often a free or cheap model). All client-side enrichment LLM calls are eliminated.

#### 5e (deferred to v1.1) — Capability negotiation

```
POST /agent/inference { intent: "draft" | "final", prompt }
```

Server picks the cheapest capability that satisfies the intent. Quality/cost knowledge moves server-side so model upgrades propagate without an SDK release.

### Composition target

Conservative multipliers on a representative storyboard workload:

| Layer | Multiplier |
|---|---|
| L1: 60% of calls eliminated | 2.5× |
| L2: 4× per remaining call | 4× |
| L3: 2× over session lifetime | 2× |
| L4: 5× average API cost | 5× |
| L5: ~30% additional reduction via server-side state | 1.4× |

Combined floor: **~10× per dollar spent on LLM calls** for representative workloads. Verified by the benchmark suite (§ Benchmarks).

## Memory architecture (four-tier hybrid)

The SDK has one coherent memory model that supersedes the storyboard's current scattered stores (`lib/memory/`, `lib/projects/`, `lib/episodes/`, `lib/agents/session-context.ts`, `lib/agents/working-memory.ts`).

### Tier 1 — Working Memory (always injected, ~500–800 token budget)

```ts
interface WorkingMemory {
  context: CreativeContext;             // style, palette, characters, setting, rules, mood
  focus: { project_id?: string; scene_index?: number; mode?: string };
  recent_turns: ConversationTurn[];     // last 5–10 turns verbatim
  pinned: PinnedFact[];                 // user-pinned facts
  critical_constraints: string[];       // from active skills
}
```

Marshaled into a token-budgeted prompt prefix on every LLM call. The cacheable stable prefix Layer 2 talks about IS the marshaled working memory (modulo `recent_turns`).

### Tier 2 — Session Memory (queryable, in-process)

```ts
interface SessionMemory {
  conversation_log: Turn[];             // all turns, older ones progressively compressed
  tool_call_log: ToolCall[];            // every call: args, result, status, timestamp
  artifact_registry: Artifact[];        // every image/video/stream
  decisions_log: Decision[];            // acceptances, rejections, undos
  skill_log: SkillActivation[];
}
```

Not in the prompt by default. The LLM calls memory tools to recall:

- `memory.recall(query: string)` — keyword + structured search across artifacts and turns
- `memory.show(id: string)` — fetch a specific item by id
- `memory.thread(scope: string)` — fetch all artifacts and decisions related to a scope (e.g., a scene)
- `memory.pin(fact: string)` — promote to working memory
- `memory.forget(id: string)` — remove a pinned item
- `memory.summarize()` — one-paragraph session summary

**v1: keyword-only `memory.recall`.** Embedding-based semantic recall is opt-in v1.1 behind `--with-embeddings`.

### Tier 3 — Long-term Memory (persists across sessions)

```
~/.config/livepeer-agent/
  projects/<project_id>/
    manifest.json        # metadata, last opened, status
    memory.jsonl         # append-only conversation + tool log
    artifacts/           # generated media (URLs + optional local copies)
    working_memory.json  # last working-memory snapshot for fast resume
    summary.md           # auto-generated long-form project summary
  preferences.json       # user-wide preferences inferred over time
  skills/                # user's local skills (from `livepeer skill gen`)
  cache/                 # output cache (L1 + L5b combined)
```

`memory.jsonl` is **append-only**. Branching (undo / rewind / fork) is implemented as pointers into the log, never as deletions. CLI on startup offers `Resume <last_active>?` like Claude Code's resume flow.

### Tier 4 — Hosted SDK Sync (opt-in cloud continuity)

The hosted SDK's `/agent/session/:id/context` endpoint doubles as a sync target for Tier 3. After every meaningful event, the SDK pushes Tier 3 changes to the hosted store. The web storyboard reads from the same hosted store. Move device, continue session.

**v1: opt-in.** User runs `livepeer auth login` + `/sync on`. Default is local-only for privacy.

### Compaction (Layer 3 token savings tie-in)

| Age | Action |
|---|---|
| < 5 turns | Verbatim |
| 5–10 turns | Tool results replaced with `[result: artifact_id]` references |
| 10–20 turns | Older turn pairs summarized into one-liner entries |
| 20+ turns or budget breach | Aggressive rollup into a single "earlier in this session: ..." block |

All compaction is **lossless to long-term** — only affects what enters the next LLM call.

### Branching

- `/undo` — append undo entry, next prompt skips last turn
- `/rewind N` — branch a new timeline at turn N
- `/branch <name>` — explicit fork
- `/switch <branch>` — change active branch

Each artifact records its branch; `memory.recall` scopes to current branch by default.

### Memory linter (the "top 1%" piece)

Synchronous post-turn pass that flags issues to the user (not the LLM):
- Contradictions (latest gen contradicts an earlier rejection)
- Stale focus (user has been on the same scene for 30+ minutes)
- Over-pinning (>10 pinned items)
- Drift (latest gens don't match active CreativeContext)

Lightweight rule-based, <5 ms per turn. The polish that makes the SDK feel premium.

## Skill system (Markdown + optional TS hooks)

Default authoring path: a markdown file with YAML frontmatter, dropped in the user's `skills/` directory or referenced via `livepeer.md` in the project root.

```yaml
---
id: warm-night-lighting
name: Warm Night Lighting
description: Apply golden-hour and lantern lighting to night scenes
tier: 1                    # Layer 4 routing override
applies_to: [create_media] # which tools this skill influences
auto_load: false           # whether to load on every turn
---
When generating a night scene, prefer warm tungsten and golden lantern light over
cool moonlight unless the user explicitly asks for blue tones. Add subtle bloom
around light sources. Keep contrast moderate.
```

Markdown skills are pure prompt extension. The SDK loads them into the system message when active.

### Optional TypeScript hooks

Power users / vertical-pack authors can add a sibling `.ts` file with hooks:

```ts
// warm-night-lighting.ts
import type { SkillHooks } from "@livepeer/agent";

export const hooks: SkillHooks = {
  before_tool_call(call) {
    if (call.tool === "create_media" && /night|dark/.test(call.params.prompt)) {
      // Validate / transform / inject
      call.params.prompt = `${call.params.prompt}, warm golden lantern light`;
    }
  },
  after_tool_call(call, result) {
    // Record the decision in session memory
  },
  provide_context() {
    return { lighting_preference: "warm" };
  },
};
```

The SDK promises a stable `SkillHooks` interface across minor versions.

### Vertical packs

A vertical pack is a directory of markdown skills + optional hooks + an `index.ts` that re-exports them, published as an npm package:

```
@user/livepeer-pack-luxury-skincare/
  skills/
    skin-glow.md
    soft-lighting.md
    brand-voice-luxury.md
  vertical.config.ts        # bundle declaration
  index.ts                  # re-exports
  package.json
```

`vertical.config.ts` declares the pack's defaults — preset skills to load, tool subset to expose, model tier hints, branding strings:

```ts
export default {
  name: "Luxury Skincare",
  preload: ["skin-glow", "soft-lighting", "brand-voice-luxury"],
  tool_filter: ["create_media", "kontext-edit", "generate_storyboard"],
  default_tier: 2,
  splash_text: "Livepeer Agent · Luxury Skincare Pack",
};
```

User installs and activates:

```bash
npm install -g @user/livepeer-pack-luxury-skincare
livepeer pack load @user/livepeer-pack-luxury-skincare
```

### Skill generation

```bash
livepeer skill gen "luxury skincare ads, soft lighting, model looking down or to the side, cream/gold/pale rose palette, no product in first scene"
```

The SDK invokes a generator (preferring local-agent offload via `claude` / `codex` if available, falling back to Gemini Flash) that:
1. Drafts a markdown skill file with proper frontmatter
2. Optionally generates TypeScript hooks if the description implies validation logic
3. Drops it in `~/.config/livepeer-agent/skills/`
4. Auto-loads it for the current session

Same UX as the `/context gen` command from this session, one level up.

### Pack publishing flow

```bash
livepeer skill gen "..." # bootstrap a few skills
livepeer skill edit warm-lighting
livepeer pack create my-luxury-pack --from skills/
# scaffolds package.json, vertical.config.ts, README
cd my-luxury-pack && npm publish
```

## MCP integration

### Server side: livepeer as MCP server

`livepeer --mcp` launches the SDK as an MCP server speaking stdio. Standard Claude Desktop / Claude Code config:

```json
{
  "mcpServers": {
    "livepeer": {
      "command": "livepeer",
      "args": ["--mcp"],
      "env": {
        "LIVEPEER_API_KEY": "...",
        "LIVEPEER_SDK_URL": "https://sdk.daydream.monster"
      }
    }
  }
}
```

**Curated 8-tool MCP surface** (deliberately small and high-level):

| Tool | Purpose |
|---|---|
| `livepeer.create_media` | Generate image/video/audio from prompt |
| `livepeer.enrich_prompt` | Improve a creative prompt |
| `livepeer.extract_scenes` | Parse a brief into scene list (no LLM cost on caller) |
| `livepeer.generate_storyboard` | Full multi-scene storyboard, returns artifact array |
| `livepeer.start_stream` | Start an LV2V stream |
| `livepeer.list_capabilities` | Available models at the moment |
| `livepeer.apply_skill_pack` | Apply a vertical skill pack |
| `livepeer.gen_skill` | LLM-generate a skill from a description |

**Not exposed:** memory tools, canvas/UI tools, project iterate / batch, slash commands. External agents call high-level tools; they don't need to know about projects, scenes, or batches.

**v1.1:** add `livepeer mcp serve --port 7777` for HTTP+SSE remote scenarios with `Authorization: Bearer` header auth.

### Client side: livepeer as MCP host

Config at `~/.config/livepeer-agent/mcp.json` (Claude Desktop-shaped):

```json
{
  "mcpServers": {
    "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/Projects"] },
    "websearch":  { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-brave-search"], "env": { "BRAVE_API_KEY": "..." } },
    "github":     { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"], "env": { "GITHUB_TOKEN": "..." } }
  }
}
```

On startup the SDK spawns each configured server, fetches its tool list via the MCP handshake, and registers those tools in the same registry as built-in tools. Transparent to the LLM. Means the livepeer agent can natively chain `websearch.search → livepeer.create_media → github.create_gist` without glue code.

## Provider/transport abstraction

Single `LLMProvider` interface in `providers/types.ts`. All providers implement it.

```ts
interface LLMProvider {
  name: string;
  tiers: Tier[];
  call(req: LLMRequest): AsyncIterable<LLMChunk>;
}
```

The shared agent runner (`agent/runner.ts`) handles:
- Tool-use loop (parse tool calls from stream, execute, feed results back)
- Retry with exponential backoff
- Streaming and early termination
- ContextVar propagation (`asyncio.to_thread`-equivalent for Node — fine since we're not hitting the same blocking-I/O issues as the Python SDK)
- Provider-side cache headers (Anthropic, Gemini, OpenAI all support this differently — abstract behind `LLMRequest.cacheable_prefix`)

Providers shipped in v1:
- `gemini` — Gemini 2.5 Flash + Pro
- `claude` — Sonnet + Haiku + Opus
- `openai` — GPT-4o + GPT-4o-mini
- `ollama` — local OpenAI-compatible endpoint (`http://localhost:11434`)
- `builtin` — pure SDK enrichment, no LLM, for routine tool calls
- `none` — pattern-match-only mode for slash commands and high-confidence preprocessor paths

Mixed-provider routing per Layer 4 — different turns in the same session can use different providers based on the routing policy.

## CLI design

### Splash screen

Modeled on Claude Code. ASCII Livepeer logo, version, working directory, brief usage hint.

```
   ╭─────────────────────────────────────────────────────╮
   │   ██╗     ██╗██╗   ██╗███████╗██████╗ ███████╗     │
   │   ██║     ██║██║   ██║██╔════╝██╔══██╗██╔════╝     │
   │   ██║     ██║██║   ██║█████╗  ██████╔╝█████╗       │
   │   ██║     ██║╚██╗ ██╔╝██╔══╝  ██╔═══╝ ██╔══╝       │
   │   ███████╗██║ ╚████╔╝ ███████╗██║     ███████╗     │
   │   ╚══════╝╚═╝  ╚═══╝  ╚══════╝╚═╝     ╚══════╝     │
   │                                                     │
   │   Livepeer Agent · v1.0.0                           │
   │   working dir: /Users/me/Projects/ad-campaign       │
   │                                                     │
   │   loaded skills: livepeer.md (12 user skills)       │
   │   active pack:   @livepeer/skill-pack-makeup-ads    │
   │                                                     │
   │   /help · /context · /skills · /memory · /pack      │
   ╰─────────────────────────────────────────────────────╯

>
```

Splash first-paint target: <30 ms end-to-end (Bun cold start ~10 ms + module load ~5 ms + ink first render ~10 ms). Verified by the bench harness on every release. The "/" hint is interactive: typing `/` opens a slash-command menu like Claude Code.

### `livepeer.md` user-skill loader

On startup the CLI scans the working directory for a `livepeer.md` file. If present, it's parsed for sections (using `## Skill: <name>` headers) and each section becomes a session-local skill loaded into the active set. Same pattern as `CLAUDE.md` for Claude Code.

```markdown
# livepeer.md

## Skill: brand voice
Always speak in the voice of luxury skincare brand "Aura": refined, calm,
slightly poetic. Avoid superlatives. Reference natural elements.

## Skill: visual rules
Models must be shown looking away from the camera. Lighting is always soft
and golden. Never include the product in the first scene of any storyboard.
```

This is on top of any global skills installed via npm packs and any project-specific skills in `.livepeer/skills/`.

### Slash commands

The full slash-command set ported from the storyboard core:

- `/help`, `/context`, `/context gen`, `/skills`, `/memory`, `/pack`
- `/sync`, `/branch`, `/switch`, `/rewind`, `/undo`
- `/local-agent`, `/mcp`
- `/bench`, `/version`, `/quit`

Plus pack-specific commands declared in `vertical.config.ts`.

### Programmatic API

For embedding the SDK in another app (e.g., the storyboard web shell):

```ts
import { Agent, defaultRouting } from "@livepeer/agent";
import { ProjectsPack } from "@livepeer/agent-pack-projects";

const agent = new Agent({
  apiKey: process.env.LIVEPEER_API_KEY!,
  sdkUrl: process.env.LIVEPEER_SDK_URL!,
  routing: defaultRouting,
  packs: [ProjectsPack],
});

const result = await agent.run({
  user: "Create a 6-scene storyboard about a fisherman's daughter",
  on: {
    artifact: (a) => console.log(a.url),
    turn: (t) => console.log(t.text),
  },
});
```

## Distribution

### npm

```bash
npm install -g @livepeer/agent
livepeer  # interactive CLI
```

The npm package ships the JS source. Runs on Bun (preferred) or Node ≥ 20.

### brew

```bash
brew install livepeer/tap/livepeer-agent
```

The brew formula installs a bun-compiled standalone binary (~50 MB). No Node required. Same source code, packaged via `bun build --compile` in CI on each release.

### Required env vars

```bash
export LIVEPEER_API_KEY="sk_..."
export LIVEPEER_SDK_URL="https://sdk.daydream.monster"  # or a self-hosted SDK URL
```

The CLI prompts for these on first run and writes them to `~/.config/livepeer-agent/.env` for subsequent runs. They're also picked up from the user's shell env if already set.

## Benchmarks: how we prove the 10× and prevent regression

`livepeer bench` ships as a first-class subcommand. Runs N representative tasks against three baselines:

1. **Naive baseline** — full prompt to GPT-4 with all 21 tool schemas, no caching, no preprocessor
2. **SDK current** — same task through the SDK with all Layer 1–5 features active
3. **SDK no-cache** — SDK with output cache disabled (worst case for repeat tasks)

Tasks in `bench/tasks/`:

| Task | Description |
|---|---|
| `storyboard-10-scene` | 10-scene Studio Ghibli storyboard from a 1500-word brief |
| `single-image` | "Generate one red apple on white" |
| `iteration-5x` | Generate, refine 5 times with feedback |
| `multi-stream` | Start 3 LV2V streams concurrently |
| `vertical-pack` | Generate using a loaded vertical pack |
| `mcp-roundtrip` | Receive a task via MCP, dispatch internally, return artifact |

Output: JSON report with per-task token counts, wall time, savings ratios, model tier distribution. Markdown report to `bench/results/<date>.md` for human review.

CI runs `livepeer bench --ci` on every PR. **Hard fail** if any task regresses by >10% in tokens. Soft warn if wall time regresses.

The benchmark suite is also the documentation for the SDK's value claim — anyone can reproduce numbers themselves.

## Storyboard app refactor

After v1 of the SDK ships, the storyboard web app refactor:

1. Replace `lib/agents/*`, `lib/tools/*`, `lib/skills/*`, `lib/memory/*`, `lib/projects/*`, `lib/episodes/*`, `lib/sdk/*`, `lib/mcp/*` with imports from `@livepeer/agent` + `@livepeer/agent-pack-projects` + `@livepeer/agent-pack-canvas`
2. Replace the four `app/api/agent/*` routes with a single proxy to the SDK's MCP server
3. The chat panel and canvas remain React but call the SDK directly (or via the MCP transport) — no agent code in the React tree
4. Browser localStorage / Zustand stores collapse from ~10 down to 3 thin React hooks that read from SDK memory
5. Total LOC reduction estimate: **~60% of `lib/` deleted**, replaced with package imports

The storyboard app stays a real product but stops being the source of truth for any agent behavior — it's just a particularly nice-looking MCP host.

## Open risks and mitigations

| Risk | Mitigation |
|---|---|
| Bun compatibility issues with some npm packages | Audit `lib/agents/*` early in the plan; if anything breaks, fall back to pure Node + npm distribution and revisit Bun in v1.1 |
| Local-agent offload inconsistent (claude / codex versions vary) | Detect tool versions on first run, store min-version requirement, fail gracefully with a clear message |
| MCP protocol still moving | Pin to MCP spec rev as of v1 release; ship updates as patch versions |
| 10× claim slips on a specific workload | Benchmark suite catches regressions in CI; if a workload genuinely can't hit 10×, document it as a known limitation rather than ship false claims |
| Hosted SDK Layer 5 changes break existing storyboard production | Layer 5 endpoints are additive (new routes, no breaking changes to existing routes); deploy paired PR with feature flag |
| Memory grows unbounded for long projects | Compaction rules are aggressive; long-term store rolls up after configurable thresholds; user can `/memory clear` at any time |
| Vertical pack ecosystem fragments | Ship 3-5 reference packs with the SDK to set quality bar; document a `livepeer pack lint` command that checks pack hygiene |
| Provider API drift (Gemini schema changes, etc.) | Each provider plugin is small (~150 lines); ship version-pinned and update via patch releases |

## Hosted SDK contract changes

These land as a paired PR on `livepeer/simple-infra` against `feat/sdk-nonblocking-io` (or its successor branch).

New endpoints in `sdk-service-build/app.py`:

| Endpoint | Method | Purpose | Owner Layer |
|---|---|---|---|
| `/agent/session` | POST | Create a new agent session, returns session_id | 5a |
| `/agent/session/:id` | GET | Get session metadata | 5a |
| `/agent/session/:id` | DELETE | End session | 5a |
| `/agent/session/:id/context` | POST | Set/update CreativeContext | 5a |
| `/agent/session/:id/context` | GET | Get current CreativeContext | 5a |
| `/agent/inference` | POST | Inference with auto-injected session context | 5a |
| `/agent/cache/lookup` | POST | Output cache lookup by prompt hash | 5b |
| `/agent/cache/store` | POST | Output cache write | 5b |
| `/agent/storyboard/execute` | POST | Server-side storyboard generation loop, SSE stream | 5c |
| `/agent/enrich` | POST | Server-side prompt enrichment (existing, formalize) | 5d |

State storage:
- v1: in-process Python dicts with TTL, lost on container restart (acceptable since sessions are short)
- v1.1: Redis or sqlite for persistence across restarts

## v1 scope summary

Shipped in v1:
- @livepeer/agent core package
- @livepeer/agent-pack-projects domain pack
- @livepeer/agent-pack-canvas domain pack (used by storyboard)
- 4 LLM providers (gemini, claude, openai, ollama)
- 4-tier memory with keyword-only `recall`
- Markdown skills + optional TS hooks + skill gen
- MCP server (stdio) with 8 curated tools
- MCP client with config file
- All 5 token-savings layers (5a–5d server-side, 5e deferred)
- CLI with splash screen, livepeer.md loading, slash commands
- Bun-compiled binary for brew + npm package
- `livepeer bench` harness
- Hosted SDK Layer 5 endpoints (paired PR on simple-infra)

Deferred to v1.1:
- Embedding-based `memory.recall` (`--with-embeddings`)
- HTTP+SSE MCP server (`livepeer mcp serve`)
- Capability negotiation endpoint (5e)
- Skills-as-agents (Option C from Q4)
- Hosted SDK Redis state
- Storyboard app refactor (separate effort, depends on v1)

## What top-1% means

This isn't just a wrapper around an LLM with tool calls. The polish that matters:

1. **The 10× claim is real and measurable** — benchmark suite ships from day 1 and runs in CI
2. **Memory linter** — the agent stays coherent across long sessions, contradictions surface immediately
3. **Local-agent offload** — first SDK to seriously treat the user's existing Claude Code / Codex install as a free reasoning resource
4. **Hosted SDK cooperation** — first agent SDK designed as a contract with its serving infrastructure rather than as a thin wrapper
5. **MCP-native** — bidirectional MCP from day 1, the SDK is a citizen of the broader agent ecosystem, not a silo
6. **Vertical extensibility with quality** — `livepeer skill gen` + reference packs set a standard for community packs
7. **Instant CLI** — Bun-compiled, splash in <30 ms, feels like a native tool
8. **Privacy-first defaults** — sync opt-in, no telemetry without consent, all data local by default
9. **Reproducibility** — every commit benchmarks itself, every release is verifiable, no marketing claims without numbers
10. **Composable** — domain packs ship independently, the storyboard becomes one consumer among many
