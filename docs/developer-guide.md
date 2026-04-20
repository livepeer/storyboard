# Building Creative Apps with Agent SDK + Creative Kit

A hands-on guide for developers who want to build AI-powered creative applications using Livepeer's open-source tools.

---

## What You Get

| Package | What it does | Use when |
|---------|-------------|----------|
| `@livepeer/agent` | LLM agent runtime with tool calling | You want an AI that reasons and uses tools |
| `@livepeer/creative-kit` | Canvas, stores, commands, UI components | You want a visual creative workspace |
| Both | Full agent-powered creative app | You want the complete experience |

You can use either package independently or both together.

---

## Option A: Agent SDK Only

Build an AI agent that can call tools — no UI framework needed. Works in Node.js, CLI, or browser.

### Install

```bash
npm install @livepeer/agent
```

### Basic Agent (5 lines)

```typescript
import { AgentRunner, ToolRegistry, GeminiProvider, WorkingMemoryStore, SessionMemoryStore } from "@livepeer/agent";

const provider = new GeminiProvider({ apiKey: process.env.GEMINI_API_KEY });
const tools = new ToolRegistry();
const runner = new AgentRunner(provider, tools, new WorkingMemoryStore(), new SessionMemoryStore());

const result = await runner.run({ user: "What's 2 + 2?" });
console.log(result.finalText); // "4"
```

### Add Tools

```typescript
tools.register({
  name: "get_weather",
  description: "Get current weather for a city",
  parameters: {
    type: "object",
    properties: {
      city: { type: "string", description: "City name" },
    },
    required: ["city"],
  },
  async execute(args) {
    const weather = await fetchWeather(args.city);
    return JSON.stringify(weather);
  },
});

// Now the agent can decide to call get_weather when relevant
const result = await runner.run({ user: "What's the weather in Tokyo?" });
// Agent calls get_weather("Tokyo"), gets result, responds with formatted weather
```

### Streaming (for UI)

```typescript
for await (const event of runner.runStream({ user: "Plan a trip to Paris" })) {
  switch (event.kind) {
    case "text":
      process.stdout.write(event.text);
      break;
    case "tool_call":
      console.log(`\n[Calling ${event.name}...]`);
      break;
    case "tool_result":
      console.log(`[${event.name}: ${event.ok ? "done" : "failed"}]`);
      break;
    case "done":
      console.log(`\n\nTokens: ${event.result.totalUsage.input}in / ${event.result.totalUsage.output}out`);
      break;
  }
}
```

### Swap Providers

```typescript
import { GeminiProvider, ClaudeProvider, OpenAIProvider } from "@livepeer/agent";

// Pick one — same AgentRunner, same tools, different LLM
const gemini = new GeminiProvider({ apiKey: "..." });
const claude = new ClaudeProvider({ apiKey: "..." });
const openai = new OpenAIProvider({ apiKey: "..." });

// Or use Livepeer's infrastructure (one key for everything)
import { LivepeerProvider } from "./livepeer-provider";
const livepeer = new LivepeerProvider({ proxyUrl: "/api/llm/chat" });
```

### Memory

```typescript
const working = new WorkingMemoryStore();

// Set creative context (always in system prompt, 800 token budget)
working.setContext({
  style: "Studio Ghibli watercolor",
  characters: "Luna the cat, Kai the boy",
  mood: "warm and magical",
});

// Pin facts (user preferences)
working.pin("User prefers landscape orientation");

// Set critical constraints (from skills/system prompts)
working.setCriticalConstraints([
  "Always use cartoon style for children's content",
  "Keep prompts under 30 words",
]);
```

---

## Option B: Creative Kit Only

Build a visual creative workspace without the agent. Good for tools where the user drives actions directly (no AI chat).

### Install

```bash
npm install @livepeer/creative-kit zustand react
```

### Artifact Store (canvas state)

```typescript
import { createArtifactStore } from "@livepeer/creative-kit";

const store = createArtifactStore();

// Add items to the canvas
const img = store.getState().add({ type: "image", title: "My Art", url: "https://..." });

// Connect items (dependency arrows)
store.getState().connect("img-1", "vid-2", { action: "animate" });

// Move items
store.getState().update(img.id, { x: 200, y: 100 });

// Auto-layout
store.getState().applyLayout([
  { id: "img-1", x: 0, y: 0 },
  { id: "vid-2", x: 350, y: 0 },
]);
```

### Visual Canvas

```tsx
import { InfiniteBoard, ArtifactCard, EdgeLayer } from "@livepeer/creative-kit";

function Canvas() {
  const store = useMyStore();

  return (
    <InfiniteBoard viewport={store.viewport} onViewportChange={store.setViewport}>
      <EdgeLayer artifacts={store.artifacts} edges={store.edges} />
      {store.artifacts.map(a => (
        <ArtifactCard
          key={a.id}
          artifact={a}
          onMove={(id, x, y) => store.update(id, { x, y })}
          onResize={(id, w, h) => store.update(id, { w, h })}
        >
          {a.type === "image" && <img src={a.url} />}
          {a.type === "video" && <video src={a.url} controls />}
        </ArtifactCard>
      ))}
    </InfiniteBoard>
  );
}
```

### Chat Panel

```tsx
import { ChatPanel } from "@livepeer/creative-kit";

function Chat() {
  const { messages, addMessage } = useChatStore();

  return (
    <ChatPanel
      messages={messages}
      onSend={(text) => {
        addMessage(text, "user");
        // Handle the message (call API, run command, etc.)
      }}
      cardRenderers={{
        "@@recipe@@": (text) => <RecipeCard data={JSON.parse(text)} />,
      }}
    />
  );
}
```

### Slash Commands

```typescript
import { createCommandRouter } from "@livepeer/creative-kit";

const router = createCommandRouter();

router.register({
  name: "recipe",
  description: "Generate a recipe",
  execute: async (args) => {
    const recipe = await generateRecipe(args);
    return `@@recipe@@${JSON.stringify(recipe)}@@/recipe@@`;
  },
});

// In your chat handler:
async function handleMessage(text) {
  const cmdResult = await router.execute(text);
  if (cmdResult) return addMessage(cmdResult, "system");  // was a /command
  // else: handle as regular message
}
```

### Capability Resolver (model routing)

```typescript
import { createCapabilityResolver } from "@livepeer/creative-kit";

const resolver = createCapabilityResolver({
  fallbackChains: {
    "fast-model": ["medium-model", "slow-model"],
  },
  actionDefaults: {
    generate: "fast-model",
    enhance: "medium-model",
  },
  userMentionPatterns: {
    "high quality": { capability: "slow-model", type: "image" },
  },
});

// Resolve which model to use
const { capability } = resolver.resolve("generate", { userText: "high quality sunset" });
// → "slow-model"

// Build fallback chain for retry on failure
const chain = resolver.buildAttemptChain("fast-model", liveModels);
// → ["fast-model", "medium-model", "slow-model"]
```

---

## Option C: Both Together (Full Creative App)

Combine Agent SDK + Creative Kit for an AI-powered creative workspace.

### Project Setup

```bash
npx create-next-app my-app
cd my-app
npm install @livepeer/agent @livepeer/creative-kit zustand
```

### Wire It Up

```typescript
// lib/agent.ts
import { AgentRunner, ToolRegistry, WorkingMemoryStore, SessionMemoryStore } from "@livepeer/agent";
import { createArtifactStore, createChatStore, createCommandRouter } from "@livepeer/creative-kit";
import { LivepeerProvider } from "./livepeer-provider";

// Stores
export const artifacts = createArtifactStore();
export const chat = createChatStore();
export const commands = createCommandRouter();

// Tools that modify the canvas
const tools = new ToolRegistry();
tools.register({
  name: "create_image",
  description: "Generate an image and add to canvas",
  parameters: {
    type: "object",
    properties: { prompt: { type: "string" } },
    required: ["prompt"],
  },
  async execute(args) {
    const result = await fetch("/api/inference", {
      method: "POST",
      body: JSON.stringify({ capability: "flux-dev", prompt: args.prompt }),
    }).then(r => r.json());

    const card = artifacts.getState().add({
      type: "image",
      title: args.prompt.slice(0, 30),
      url: result.image_url,
    });
    return JSON.stringify({ success: true, refId: card.refId });
  },
});

// Agent
const provider = new LivepeerProvider();
export const agent = new AgentRunner(provider, tools, new WorkingMemoryStore(), new SessionMemoryStore());

// Commands
commands.register({
  name: "clear",
  description: "Clear the canvas",
  execute: async () => {
    artifacts.getState().artifacts.forEach(a => artifacts.getState().remove(a.id));
    return "Canvas cleared";
  },
});
```

### The Page

```tsx
// app/page.tsx
"use client";
import { InfiniteBoard, ArtifactCard, ChatPanel } from "@livepeer/creative-kit";
import { artifacts, chat, commands, agent } from "../lib/agent";

export default function App() {
  const arts = artifacts((s) => s.artifacts);
  const viewport = artifacts((s) => s.viewport);
  const messages = chat((s) => s.messages);

  async function handleSend(text: string) {
    chat.getState().addMessage(text, "user");

    // Try command first
    const cmdResult = await commands.execute(text);
    if (cmdResult) {
      chat.getState().addMessage(cmdResult, "system");
      return;
    }

    // Otherwise send to agent
    for await (const event of agent.runStream({ user: text })) {
      if (event.kind === "text") {
        chat.getState().addMessage(event.text, "agent");
      }
    }
  }

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div style={{ flex: 1 }}>
        <InfiniteBoard viewport={viewport} onViewportChange={(v) => artifacts.getState().setViewport(v)}>
          {arts.map(a => (
            <ArtifactCard key={a.id} artifact={a}
              onMove={(id, x, y) => artifacts.getState().update(id, { x, y })}>
              <img src={a.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </ArtifactCard>
          ))}
        </InfiniteBoard>
      </div>
      <div style={{ width: 360, borderLeft: "1px solid #333" }}>
        <ChatPanel messages={messages} onSend={handleSend} />
      </div>
    </div>
  );
}
```

---

## Using Livepeer AI Models

Call 40+ AI models through one endpoint:

```typescript
// Server-side API route (app/api/inference/route.ts)
export async function POST(req: Request) {
  const { capability, prompt, params } = await req.json();

  const resp = await fetch("https://sdk.daydream.monster/inference", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DAYDREAM_API_KEY}`,
    },
    body: JSON.stringify({ capability, prompt, params }),
  });

  return new Response(resp.body, { headers: { "Content-Type": "application/json" } });
}
```

### Model Categories

```typescript
// Image generation
{ capability: "flux-dev", prompt: "a sunset" }
{ capability: "seedream-5-lite", prompt: "a portrait" }

// Image editing
{ capability: "kontext-edit", prompt: "make it watercolor", params: { image_url: "https://..." } }

// Image → Video
{ capability: "seedance-i2v", prompt: "camera pan left", params: { image_url: "...", duration: "10" } }

// Text → Video
{ capability: "veo-t2v", prompt: "a sunset timelapse" }

// Text → Speech
{ capability: "chatterbox-tts", prompt: "Hello world", params: { text: "Hello world" } }

// Image → 3D
{ capability: "tripo-i3d", prompt: "convert to 3D", params: { image_url: "..." } }

// Background removal
{ capability: "bg-remove", prompt: "remove background", params: { image_url: "..." } }
```

### Fallback Pattern

```typescript
import { createCapabilityResolver, extractFalError, isRecoverableFailure } from "@livepeer/creative-kit";

const resolver = createCapabilityResolver({
  fallbackChains: {
    "seedance-i2v": ["ltx-i2v", "veo-i2v"],
    "flux-dev": ["flux-schnell", "seedream-5-lite"],
  },
  actionDefaults: { generate: "flux-dev", animate: "seedance-i2v" },
  userMentionPatterns: {},
});

async function generateWithFallback(action, prompt, params) {
  const { capability } = resolver.resolve(action);
  const chain = resolver.buildAttemptChain(capability, liveCapabilities);

  for (const model of chain) {
    try {
      const result = await callInference(model, prompt, params);
      const error = extractFalError(result.data || {});
      if (error && isRecoverableFailure(error)) continue; // try next
      return result;
    } catch (e) {
      if (!isRecoverableFailure(e.message)) throw e;
    }
  }
  throw new Error("All models failed");
}
```

---

## Examples

### Music Production Tool

```typescript
// Agent with music-specific tools
tools.register({ name: "generate_beat", ... });
tools.register({ name: "add_vocals", ... });
tools.register({ name: "mix_tracks", ... });

// Creative Kit for the track timeline
const tracks = createArtifactStore();  // each track is an artifact
// ArtifactCard renders as a waveform instead of an image
```

### Design Tool

```typescript
// Slash commands for design workflows
commands.register({ name: "brand", description: "Generate brand kit", ... });
commands.register({ name: "resize", description: "Resize for social media", ... });

// Capability resolver for design-specific models
const resolver = createCapabilityResolver({
  actionDefaults: { logo: "recraft-v4", photo: "flux-dev" },
});
```

### Educational Platform

See `apps/creative-lab/` in the storyboard repo for a complete example — a kids' creative app with guided missions, safety filters, and a portfolio gallery.

---

## API Reference

### @livepeer/agent

| Export | Type | Purpose |
|--------|------|---------|
| `AgentRunner` | Class | LLM ↔ Tool loop with streaming |
| `ToolRegistry` | Class | Register and manage tools |
| `WorkingMemoryStore` | Class | Always-in-prompt memory (800 token budget) |
| `SessionMemoryStore` | Class | Queryable session logs |
| `GeminiProvider` | Class | Google Gemini LLM |
| `ClaudeProvider` | Class | Anthropic Claude LLM |
| `OpenAIProvider` | Class | OpenAI GPT LLM |
| `MockProvider` | Class | Testing (scripted responses) |

### @livepeer/creative-kit

| Export | Type | Purpose |
|--------|------|---------|
| `createArtifactStore` | Function | Canvas state (artifacts, edges, viewport) |
| `createChatStore` | Function | Chat messages |
| `createProjectStore` | Function | Batch pipeline with status tracking |
| `createGroupManager` | Function | Artifact grouping (episodes) |
| `createCommandRouter` | Function | Slash command registry |
| `createCapabilityResolver` | Function | Model routing + fallback chains |
| `createIntentClassifier` | Function | User intent detection |
| `extractFalError` | Function | Parse fal.ai error responses |
| `isRecoverableFailure` | Function | Should we try the next model? |
| `resizeImageForModel` | Function | Resize images for video model input |
| `InfiniteBoard` | Component | Pan/zoom canvas container |
| `ArtifactCard` | Component | Draggable/resizable card wrapper |
| `EdgeLayer` | Component | SVG arrows between artifacts |
| `ChatPanel` | Component | Message list + input |
| `MessageBubble` | Component | Styled chat message |
| `ToolPill` | Component | Tool call progress indicator |
| `useStyledPrompt` | Hook | Promise-based modal input dialog |
