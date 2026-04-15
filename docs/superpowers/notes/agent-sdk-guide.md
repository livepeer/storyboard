# @livepeer/agent — how to use it

A practical copy-paste guide for building with the agent SDK. Target audience: a dev who wants to **consume** the SDK in their own code. For the full architecture, invariants, and extension recipes, read `agent-sdk-skill.md` instead.

---

## 1. Install

### As a library in your project

```bash
npm install @livepeer/agent
# or
bun add @livepeer/agent
```

Optional domain packs:

```bash
npm install @livepeer/agent-pack-projects
npm install @livepeer/agent-pack-canvas
```

### As a standalone CLI

```bash
npm install -g @livepeer/agent
# or
brew install livepeer/tap/livepeer-agent
```

After install you get a `livepeer` command:

```bash
livepeer                      # interactive ink TUI on your terminal
livepeer --version            # 1.0.0-rc.1
livepeer --mcp                # run as stdio MCP server
livepeer bench                # run the 6-task benchmark suite
livepeer skill gen "..."      # LLM-generate a skill from a description
```

### From this monorepo (local dev)

```bash
cd /path/to/storyboard-a3
bun install
cd packages/agent && bun run build
node dist/cli.js --version    # livepeer 1.0.0-rc.1
```

---

## 2. Hello world — 10 lines against MockProvider

Zero LLM cost. Deterministic. Great for tests.

```ts
import {
  AgentRunner,
  ToolRegistry,
  WorkingMemoryStore,
  SessionMemoryStore,
  MockProvider,
} from "@livepeer/agent";

const provider = new MockProvider({
  responses: [[{ kind: "text", text: "hello from the SDK" }, { kind: "done" }]],
});

const runner = new AgentRunner(
  provider,
  new ToolRegistry(),
  new WorkingMemoryStore(),
  new SessionMemoryStore(),
);

const result = await runner.run({ user: "ping" });
console.log(result.finalText); // → "hello from the SDK"
```

The `MockProvider` replays a scripted sequence of `LLMChunk` events per `call()` invocation, so you can script exactly what the LLM would return and assert against the runner's behavior.

---

## 3. Using a real provider (Gemini)

```ts
import { AgentRunner, ToolRegistry, WorkingMemoryStore, SessionMemoryStore, GeminiProvider } from "@livepeer/agent";

const provider = new GeminiProvider({
  apiKey: process.env.GEMINI_API_KEY!,
  // Optional: per-tier model override
  models: { 1: "gemini-2.5-flash", 2: "gemini-2.5-pro" },
});

const runner = new AgentRunner(
  provider,
  new ToolRegistry(),
  new WorkingMemoryStore(),
  new SessionMemoryStore(),
);

const result = await runner.run({
  user: "Give me three uses for a paperclip in under 30 words.",
  tier: 1,
});
console.log(result.finalText);
console.log(result.totalUsage); // { input: 22, output: 41, cached: 0 }
```

**All six providers follow the same constructor + interface:**

| Provider | Import | Config |
|---|---|---|
| Gemini | `GeminiProvider` | `{ apiKey, endpoint?, models? }` |
| Claude | `ClaudeProvider` | `{ apiKey, endpoint?, models? }` |
| OpenAI | `OpenAIProvider` | `{ apiKey, endpoint?, models? }` |
| Ollama | `OllamaProvider` | `{ apiKey?, endpoint? }` (defaults to `http://localhost:11434/v1`) |
| Builtin | `BuiltinProvider` | (no config — returns empty text, tier 0 only) |
| None | `NoneProvider` | (no config — refuses all calls, used for slash commands) |

Swap providers by changing one line — the runner never knows the difference.

---

## 4. The tool-use loop — `run()` vs `runStream()`

### `run()` — one-shot, returns the final result

```ts
const result = await runner.run({ user: "make me something" });

result.finalText       // string — the last assistant text
result.turns           // ConversationTurn[] — every user/assistant/tool message
result.totalUsage      // { input, output, cached } — summed across all iterations
result.iterations      // number — how many provider calls were made
```

Use this when you want a single answer and don't need progressive UI feedback.

### `runStream()` — yields events progressively

```ts
for await (const event of runner.runStream({ user: "make me something" })) {
  switch (event.kind) {
    case "text":
      process.stdout.write(event.text); // stream text as it arrives
      break;
    case "tool_call":
      console.log(`[tool] ${event.name}(`, event.args, `)`);
      break;
    case "tool_result":
      console.log(`[tool result] ${event.ok ? "ok" : "fail"}: ${event.content}`);
      break;
    case "usage":
      console.log(`[${event.usage.input}+${event.usage.output}]`);
      break;
    case "done":
      console.log(`done: ${event.result.finalText}`);
      break;
    case "error":
      throw new Error(event.error);
  }
}
```

Use this when you want to render progressively in a UI (chat bubbles, progress bars, tool-call spinners). The storyboard app uses `runStream` for exactly this.

**The seven `RunEvent` kinds** — treat them as a discriminated union:

| Kind | Fires when | Payload |
|---|---|---|
| `text` | provider streams a text chunk | `text: string` |
| `tool_call` | LLM requested a tool call (after full args assembly) | `id`, `name`, `args` |
| `tool_result` | tool execution finished (success or failure) | `id`, `name`, `ok`, `content` |
| `turn_done` | a full assistant turn was recorded | `turn: ConversationTurn` |
| `usage` | provider reported token counts | `usage: { input, output, cached? }` |
| `done` | the entire loop completed | `result: RunResult` |
| `error` | provider or runner error | `error: string` |

Events are yielded in roughly the order they happen, but text chunks can interleave with each other within a turn. The loop terminates on `done` or `error`.

---

## 5. Registering custom tools

```ts
import { ToolRegistry, type ToolDefinition } from "@livepeer/agent";

const registry = new ToolRegistry();

const weatherTool: ToolDefinition = {
  name: "get_weather",
  description: "Get the current weather for a city. Returns temperature in Celsius and conditions.",
  parameters: {
    type: "object",
    properties: {
      city: { type: "string", description: "City name" },
    },
    required: ["city"],
  },
  // mcp_exposed: true,  // set to true ONLY if you want this via `livepeer --mcp`.
  // The built-in curated set is frozen at 8 tools [INV-7].
  // tier: 1,            // Optional routing hint
  async execute(args, _ctx) {
    const { city } = args as { city: string };
    const r = await fetch(`https://api.example.com/weather?city=${encodeURIComponent(city)}`);
    const data = await r.json();
    // Return value MUST be a string. JSON.stringify objects.
    return JSON.stringify({ tempC: data.temp, conditions: data.summary });
  },
};

registry.register(weatherTool);
```

Now use it:

```ts
const runner = new AgentRunner(provider, registry, working, session);
const result = await runner.run({
  user: "What's the weather in Tokyo?",
});
// The LLM will see the tool schema, decide to call it, execute, and return the final answer.
```

**Three things to remember:**

1. **`execute` must return a `Promise<string>`.** Objects get JSON-stringified by your code, not by the runner. The runner feeds the string back to the LLM verbatim.
2. **Tool errors shouldn't throw.** If your tool can fail, catch the error inside `execute` and return `JSON.stringify({ error: "..." })`. The runner DOES catch exceptions and wraps them as failed tool results, but returning a structured error is more readable.
3. **`mcp_exposed: true` is reserved for the curated 8-tool set** per [INV-7]. If you're consuming the SDK, your tools should stay `mcp_exposed: false` (the default).

---

## 6. Using memory stores

The runner comes with two ephemeral in-process stores by default. Both get re-created per `run()` invocation if you don't pass them.

### WorkingMemoryStore — always marshaled into the system prompt

```ts
import { WorkingMemoryStore } from "@livepeer/agent";

const working = new WorkingMemoryStore();

// Set the creative context (carried into every future run as critical constraints)
working.setContext({
  style: "Studio Ghibli watercolor",
  palette: "warm sienna, sage green",
  characters: "a young courier, an old fisherman",
  setting: "Amalfi village",
  rules: "no dialogue, golden hour",
  mood: "nostalgic",
});

// Pin a fact
working.pin("the courier always wears a red cap");

// Add a critical constraint (goes into system prompt verbatim)
working.setCriticalConstraints(["Never generate text in the images."]);

// Check what would be marshaled
const { text, estimated_tokens, truncated } = working.marshal();
console.log(text);              // full prompt prefix
console.log(estimated_tokens);  // caps at 800
console.log(truncated);         // true if constraints had to drop
```

The store enforces an **800-token budget** on the marshaled system prompt. If the combined context + constraints + pinned facts + recent turns exceeds that, it truncates oldest-first in this order: `recent_turns → pinned → critical_constraints`.

### SessionMemoryStore — in-process artifact/decision log

```ts
import { SessionMemoryStore } from "@livepeer/agent";

const session = new SessionMemoryStore();

// Record an artifact produced by a tool
const art = session.recordArtifact({
  kind: "image",
  prompt: "a red cap on a wooden fence",
  url: "https://...",
});
console.log(art.id);  // "art_1712..._abc"

// Query
session.recall("red cap");                    // keyword search
session.show(art.id);                          // fetch by id
session.thread("scene 3");                     // all items related to scope
session.summarize();                           // "N turns, N tool calls, N artifacts on branch 'main'"
```

Session memory is **per-run ephemeral** in the SDK's own types. If you want to persist across runs, attach a `LongtermMemory` (see below) or write your own persistence adapter.

### LongtermMemory — per-project append-only JSONL on disk

```ts
import { LongtermMemory } from "@livepeer/agent";

const lt = new LongtermMemory();  // default root: ~/.config/livepeer-agent

// Append an event
await lt.log("my-project").append({
  kind: "session_start",
  session_id: "s1",
  ts: Date.now(),
});

// Resume a project by replaying its event log into fresh stores
const { working, session, eventCount } = await lt.resume("my-project");
console.log(`Replayed ${eventCount} events`);
```

The JSONL file is **append-only** by design ([INV-4]). There's no delete or update primitive — every state change is a new event. Undo, rewind, and branching all work by appending new events.

---

## 7. Using the domain packs

### Projects pack — multi-scene project orchestration

```ts
import { AgentRunner, ToolRegistry, WorkingMemoryStore, SessionMemoryStore, GeminiProvider } from "@livepeer/agent";
import { registerProjectsPack, ProjectStore } from "@livepeer/agent-pack-projects";

const tools = new ToolRegistry();
const projectStore = new ProjectStore();  // optional — pack creates one if omitted
registerProjectsPack({ tools, store: projectStore });

// Now tools.get("project_create") / project_iterate / project_generate / project_status exist
const runner = new AgentRunner(
  new GeminiProvider({ apiKey: process.env.GEMINI_API_KEY! }),
  tools,
  new WorkingMemoryStore(),
  new SessionMemoryStore(),
);

const result = await runner.run({
  user: "Create a 3-scene project about a dragon. Then generate all scenes.",
});
// The LLM can now call project_create({title, scenes, style}) and project_generate({project_id})
```

Direct store access (bypassing the LLM):

```ts
const project = projectStore.create({
  title: "Dragon tale",
  scenes: [
    { id: "s1", title: "Dawn", prompt: "a dragon in misty mountains at sunrise" },
    { id: "s2", title: "Flight", prompt: "the dragon soaring over a forest" },
  ],
  style: { visual_style: "watercolor", mood: "epic" },
});

projectStore.updateScene(project.id, "s1", { status: "done", url: "..." });

const all = projectStore.list();
```

### Canvas pack — spatial layout for visual cards

```ts
import { registerCanvasPack, CanvasStore, autoLayout, narrativeLayout } from "@livepeer/agent-pack-canvas";

const canvasStore = new CanvasStore();
registerCanvasPack({ tools, store: canvasStore });

// Add cards manually
canvasStore.add({
  id: "card_1",
  refId: "img-1",
  type: "image",
  url: "https://...",
  x: 0, y: 0, w: 320, h: 200,
  batchId: "batch_abc",
});

// Spatial layout
autoLayout(canvasStore, 4);        // grid, 4 columns, batches stay contiguous
narrativeLayout(canvasStore);      // one row per batch (storyboard-style)

// Query
canvasStore.list();                 // all cards
canvasStore.byBatch("batch_abc");   // filter by batch
canvasStore.get("card_1");          // fetch by id
```

Both packs register their tools with `mcp_exposed: false` — they're internal, not part of the 8-tool MCP surface.

---

## 8. CLI usage

After `npm install -g @livepeer/agent`:

### Interactive TUI

```bash
livepeer
# Splash appears in <30ms. Then the ink REPL:
# › hello
#   ✦ Hi! What would you like to create today?
# › make me an image of a cat
#   [tool_call] create_media { prompt: "a cat" }
#   ✦ Done — 1 image created
```

### MCP server mode (stdio)

```bash
livepeer --mcp
# Sends/receives JSON-RPC 2.0 over stdin/stdout.
# Exposes exactly 8 curated tools to any MCP client.
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | livepeer --mcp
# → { "jsonrpc": "2.0", "id": 1, "result": { "tools": [ ...8 tools... ] } }
```

### Benchmark suite

```bash
GEMINI_API_KEY=... livepeer bench
# Runs 6 representative tasks, compares against baseline.json.
# Exits 1 if delta > +10% (the CI regression gate).
# Prints a markdown table with per-task tokens + timing.
```

### Skill generation

```bash
livepeer skill gen "luxury skincare ad campaigns with soft lighting"
# Uses an LLM (tier 2) to generate a markdown skill file with frontmatter.
# Output piped to stdout — redirect to save:
livepeer skill gen "..." > my-skill.md
```

---

## 9. Integration pattern — using the SDK from a Next.js / browser app

The storyboard app is the reference implementation. Key insight: **the browser can't hit provider APIs directly** (no API key exposure, no CORS). You write a thin `LLMProvider` shim that routes through a Next.js API proxy that holds the key server-side.

### Server side — Next.js API route (holds the key)

`app/api/agent/gemini/route.ts`:

```ts
export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }
  const body = await req.json();
  // Forward to Google
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  return Response.json(await r.json());
}
```

### Browser side — custom LLMProvider shim

```ts
import type { LLMProvider, LLMRequest, LLMChunk, Tier } from "@livepeer/agent";

export class ProxyGeminiProvider implements LLMProvider {
  readonly name = "gemini-proxy";
  readonly tiers: Tier[] = [0, 1, 2, 3];

  async *call(req: LLMRequest): AsyncIterable<LLMChunk> {
    const body = this.buildBody(req);  // translate portable → Gemini native
    const resp = await fetch("/api/agent/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      yield { kind: "error", error: `${resp.status}: ${await resp.text()}` };
      return;
    }
    const data = await resp.json();
    // Parse the response, yield text/tool_call_*/usage/done events
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.text) yield { kind: "text", text: part.text };
      if (part.functionCall) {
        const id = `call_${Math.random().toString(36).slice(2, 10)}`;
        yield { kind: "tool_call_start", id, name: part.functionCall.name };
        yield { kind: "tool_call_args", id, args_delta: JSON.stringify(part.functionCall.args ?? {}) };
        yield { kind: "tool_call_end", id };
      }
    }
    if (data.usageMetadata) {
      yield {
        kind: "usage",
        usage: {
          input: data.usageMetadata.promptTokenCount ?? 0,
          output: data.usageMetadata.candidatesTokenCount ?? 0,
          cached: data.usageMetadata.cachedContentTokenCount ?? 0,
        },
      };
    }
    yield { kind: "done" };
  }

  private buildBody(req: LLMRequest): Record<string, unknown> {
    // Translate req.messages → Gemini contents[]/systemInstruction/tools format
    // (See packages/agent/src/providers/gemini.ts for the reference implementation
    //  or lib/agents/storyboard-providers.ts in this repo for the proxy variant.)
    // ...
  }
}
```

### React component — drive the runner from an event loop

```tsx
import { useState } from "react";
import { AgentRunner, ToolRegistry, WorkingMemoryStore, SessionMemoryStore } from "@livepeer/agent";
import { ProxyGeminiProvider } from "@/lib/providers";

export function ChatBox() {
  const [messages, setMessages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function send(text: string) {
    setBusy(true);
    const runner = new AgentRunner(
      new ProxyGeminiProvider(),
      new ToolRegistry(),  // register your tools here
      new WorkingMemoryStore(),
      new SessionMemoryStore(),
    );
    for await (const event of runner.runStream({ user: text })) {
      if (event.kind === "text") {
        setMessages((m) => [...m, event.text]);
      }
      if (event.kind === "tool_call") {
        setMessages((m) => [...m, `[calling ${event.name}]`]);
      }
      if (event.kind === "done") break;
    }
    setBusy(false);
  }
  // ...
}
```

The storyboard's `lib/agents/gemini/index.ts`, `lib/agents/claude/index.ts`, and `lib/agents/openai/index.ts` are working examples of this pattern with production-grade UI handling (completion summaries, clarifier fallback, token tracking, stopped-flag for cancel, error humanization). Use them as a reference if you're building something substantial.

---

## 10. Common gotchas

### The runner returns `Promise<RunResult>`, not an async iterable

`run()` resolves when the whole loop completes. If you want progressive events use `runStream()` instead:

```ts
// WRONG — run() is not an async iterable
for await (const event of runner.run({ user: "..." })) { ... }

// RIGHT — one-shot
const result = await runner.run({ user: "..." });

// RIGHT — streaming
for await (const event of runner.runStream({ user: "..." })) { ... }
```

### `AgentRunner` constructor takes 4 **positional** args

Not an options object:

```ts
// WRONG
new AgentRunner({ provider, tools, workingMemory, sessionMemory });

// RIGHT
new AgentRunner(provider, tools, working, session);
```

### Tool definitions use `mcp_exposed` (snake_case)

Not `mcpExposed`:

```ts
{
  name: "my_tool",
  // ...
  mcp_exposed: false,   // ← snake_case. Default is false.
}
```

### `execute` must return a string

The runner feeds the return value verbatim to the LLM as the tool result content. Objects must be `JSON.stringify`'d:

```ts
// WRONG — the runner will fail or pass "[object Object]" to the LLM
async execute(args) { return { result: 42 }; }

// RIGHT
async execute(args) { return JSON.stringify({ result: 42 }); }
```

### Provider API keys live on the server, never in the browser

If you're building a browser app, don't instantiate `GeminiProvider` directly in client code — it would try to fetch Google's API with your key in the browser. Write a proxy route + a custom `LLMProvider` shim (pattern above).

### The 800-token working memory budget truncates silently

`WorkingMemoryStore.marshal()` drops recent_turns → pinned → constraints to fit. If your system prompt is critical, pass it via `setCriticalConstraints([...])` — it's the LAST thing to get dropped. Check `truncated === false` in the return value if you need to guarantee nothing was dropped.

### Tests use `{ responses: LLMChunk[][] }` for MockProvider

Not `{ script }` or `{ chunks }`:

```ts
// RIGHT
const mock = new MockProvider({
  responses: [
    // First provider.call() returns these chunks:
    [{ kind: "text", text: "hi" }, { kind: "done" }],
    // Second provider.call() returns these chunks:
    [{ kind: "text", text: "bye" }, { kind: "done" }],
  ],
});
```

Each inner array is one `call()` invocation's chunk sequence. The MockProvider replays them in order and auto-emits `done` if your script forgets it.

### Running the CLI under Node vs Bun

The bundled `dist/cli.js` targets Node-compatible output with `react`, `ink`, and `ws` marked as external. Run it under either:

```bash
node dist/cli.js --version       # works
bun dist/cli.js --version        # also works
```

The standalone `build:binary` target produces a bun-compiled self-contained executable (`dist/livepeer`) that doesn't need node_modules at runtime — that's what the brew formula ships.

---

## 11. Typical recipes

### Recipe: stream an answer to a user's question with no tools

```ts
const runner = new AgentRunner(provider, new ToolRegistry(), new WorkingMemoryStore(), new SessionMemoryStore());
for await (const event of runner.runStream({ user: "explain quantum entanglement in one paragraph" })) {
  if (event.kind === "text") process.stdout.write(event.text);
}
```

### Recipe: one-shot completion, return the text and token count

```ts
const { finalText, totalUsage } = await runner.run({ user: "summarize this: ..." });
return { text: finalText, tokens: totalUsage.input + totalUsage.output };
```

### Recipe: multi-tool agent with logging

```ts
const registry = new ToolRegistry();
registry.register(weatherTool);
registry.register(calculatorTool);
registry.register(searchTool);

const runner = new AgentRunner(provider, registry, working, session);

for await (const event of runner.runStream({ user: "What's 2+2 and the weather in Paris?" })) {
  if (event.kind === "tool_call") {
    console.log(`→ ${event.name}(${JSON.stringify(event.args)})`);
  }
  if (event.kind === "tool_result") {
    console.log(`← ${event.name}: ${event.content.slice(0, 100)}`);
  }
  if (event.kind === "done") {
    console.log(`finalText: ${event.result.finalText}`);
    console.log(`tokens: ${event.result.totalUsage.input + event.result.totalUsage.output}`);
  }
}
```

### Recipe: projects + canvas integration

```ts
import { registerProjectsPack } from "@livepeer/agent-pack-projects";
import { registerCanvasPack } from "@livepeer/agent-pack-canvas";

const tools = new ToolRegistry();
registerProjectsPack({ tools });
registerCanvasPack({ tools });
// Register your own `create_media` tool that reads from canvasStore
tools.register({
  name: "create_media",
  description: "Generate an image or video from a prompt.",
  parameters: { /* ... */ },
  async execute(args) {
    // Call your inference backend, add the result to canvasStore, return JSON with refId
  },
});

const runner = new AgentRunner(provider, tools, working, session);
const result = await runner.run({
  user: "Create a 4-scene storyboard about a fox in autumn. Generate each scene.",
});
// LLM calls: project_create → project_generate → create_media (× 4) → canvas_organize
```

### Recipe: cost tracking across a session

```ts
let sessionTotal = { input: 0, output: 0 };

async function runWithTracking(user: string) {
  const result = await runner.run({ user });
  sessionTotal.input += result.totalUsage.input;
  sessionTotal.output += result.totalUsage.output;
  return result;
}

await runWithTracking("make a cat");
await runWithTracking("now a dog");
console.log(`Total cost this session: ${sessionTotal.input + sessionTotal.output} tokens`);
```

### Recipe: swap providers at runtime (user toggle in settings)

```ts
const providers = {
  gemini: new GeminiProvider({ apiKey: process.env.GEMINI_API_KEY! }),
  claude: new ClaudeProvider({ apiKey: process.env.ANTHROPIC_API_KEY! }),
  openai: new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY! }),
};

function makeRunner(name: keyof typeof providers) {
  return new AgentRunner(providers[name], tools, working, session);
}

// In your UI handler:
const runner = makeRunner(user.selectedProvider);  // "gemini" | "claude" | "openai"
await runner.run({ user: prompt });
```

Since all three implement the same `LLMProvider` interface and share the same tool registry and memory stores, switching providers mid-session is stateless — no migration, no re-hydration.

---

## 12. Where to go next

- **Extending the SDK** (adding a provider / pack / tool / invariant): read `agent-sdk-skill.md` in the same directory. It has the architecture + recipes.
- **Debugging a failed run:** browser DevTools console → filter for `[Gemini]` / `[Claude]` / `[OpenAI]`. Or add a temporary `console.log` inside your tool's `execute` to see what args the LLM is passing.
- **Measuring token savings vs a naive implementation:** `livepeer bench` for a controlled 6-task suite, or DevTools Network tab → filter `/api/agent/*` → inspect response `usage` / `usageMetadata` fields for a real conversation.
- **Integrating MCP:** the CLI's `--mcp` mode gives you a working stdio MCP server out of the box with the 8 curated tools. Point any MCP client (Claude Desktop, Zed, Cursor) at `livepeer --mcp` and you're done.

---

## Quick reference: everything re-exported from `@livepeer/agent`

```ts
// Types
import type {
  Message, ToolCall, ToolResult, TokenUsage, Tier, ConversationTurn,
  LLMProvider, LLMRequest, LLMChunk, ToolSchema,
  ToolDefinition,
  RunEvent, RunResult, RunOptions,
  CreativeContext, WorkingMemory, Artifact, Decision, MemoryEvent,
} from "@livepeer/agent";

// Runtime classes
import {
  AgentRunner,
  ToolRegistry,
  WorkingMemoryStore,
  SessionMemoryStore,
  LongtermMemory,
  MockProvider,
  GeminiProvider,   ClaudeProvider,   OpenAIProvider,
  OllamaProvider,   BuiltinProvider,  NoneProvider,
} from "@livepeer/agent";
```

That's the entire public surface. Anything else (memory tools, routing policy internals, preprocessor, bench harness) is available via deep imports like `@livepeer/agent/preprocessor/scenes` or `@livepeer/agent/bench/runner` if you need them, but the top-level exports cover 95% of consumer use cases.
