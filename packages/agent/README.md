# @livepeer/agent

Bun-compiled multi-provider agent SDK for creative AI workflows. Powers the Livepeer storyboard, available as a CLI, library, and MCP server.

## Install

    npm install -g @livepeer/agent
    # or
    brew install livepeer/tap/livepeer-agent

## Use

    livepeer                 # interactive REPL
    livepeer --mcp           # stdio MCP server
    livepeer bench           # run benchmark suite

## As a library

```ts
import {
  AgentRunner,
  ToolRegistry,
  WorkingMemoryStore,
  SessionMemoryStore,
} from "@livepeer/agent";
import { GeminiProvider } from "@livepeer/agent";

const provider = new GeminiProvider({ apiKey: process.env.GEMINI_API_KEY! });
const tools = new ToolRegistry();
const runner = new AgentRunner(
  provider,
  tools,
  new WorkingMemoryStore(),
  new SessionMemoryStore(),
);
const result = await runner.run({ user: "hello" });
console.log(result.finalText);
```

## Vertical packs

    npm install @livepeer/agent-pack-projects
    npm install @livepeer/agent-pack-canvas

See `docs/superpowers/specs/2026-04-13-agent-sdk-design.md` for the full design.
