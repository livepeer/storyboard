# How to Build Agent-Native Creative Applications

> Architecture guide for building AI-powered creative apps using the Livepeer Agent SDK, Creative Kit, and Livepeer infrastructure.

---

## Stack Overview

```
Your App (React/Next.js)
    |
    |--- @livepeer/creative-kit    UI components, stores, routing
    |--- @livepeer/agent           AgentRunner, providers, memory, tools
    |--- Livepeer Infra            SDK Service → BYOC Orch → fal.ai/Gemini
```

Three layers, each independently usable:

| Layer | Package | What it provides |
|-------|---------|-----------------|
| **Agent** | `@livepeer/agent` | LLM tool-use loop, memory, provider abstraction |
| **Creative Kit** | `@livepeer/creative-kit` | Artifact management, UI components, slash commands, capability routing |
| **Infrastructure** | Livepeer SDK + BYOC | AI model inference (40+ models), live video streaming |

---

## Layer 0: Agent SDK (`@livepeer/agent`)

The foundation. A portable, provider-agnostic agent runtime that manages the LLM ↔ Tool loop.

### Core Concepts

```
User Message
    ↓
AgentRunner.runStream()
    ↓
LLMProvider.call() ←→ ToolRegistry.execute()
    ↓                       ↓
  LLM Response         Tool Results
    ↓                       ↓
  RunEvents (streamed to your UI)
```

### AgentRunner

The agent loop. Sends messages to an LLM, executes tool calls, feeds results back, repeats until the LLM stops calling tools.

```typescript
import { AgentRunner, ToolRegistry, WorkingMemoryStore, SessionMemoryStore } from "@livepeer/agent";

const tools = new ToolRegistry();
const working = new WorkingMemoryStore();
const session = new SessionMemoryStore();
const runner = new AgentRunner(provider, tools, working, session);

// Streaming (recommended for UI)
for await (const event of runner.runStream({ user: "create a sunset image" })) {
  switch (event.kind) {
    case "text":        console.log(event.text); break;
    case "tool_call":   console.log(`Calling ${event.name}...`); break;
    case "tool_result": console.log(`${event.name}: ${event.ok ? "ok" : "failed"}`); break;
    case "usage":       console.log(`${event.usage.input}in / ${event.usage.output}out tokens`); break;
    case "done":        console.log("Done:", event.result.finalText); break;
  }
}

// One-shot (for scripts/CLI)
const result = await runner.run({ user: "create a sunset image" });
```

### LLM Providers

Swap providers without changing app code. Each implements `LLMProvider`:

```typescript
import { GeminiProvider } from "@livepeer/agent";

// Direct API access (CLI, server-side)
const provider = new GeminiProvider({ apiKey: "..." });

// Browser proxy (keys stay server-side)
import { StoryboardGeminiProvider } from "./storyboard-providers";
const provider = new StoryboardGeminiProvider("/api/agent/gemini");
```

Built-in providers:

| Provider | Models | Best for |
|----------|--------|----------|
| `GeminiProvider` | gemini-2.5-flash/pro | Fast, multimodal, free tier |
| `ClaudeProvider` | claude-sonnet/opus | Reasoning, code, long context |
| `OpenAIProvider` | gpt-4o/mini | Broad compatibility |
| `BuiltinProvider` | Pattern matching | Deterministic responses, no LLM cost |

### Tool Registry

Register tools the agent can call. Each tool has a name, description, JSON Schema parameters, and an execute function.

```typescript
import { ToolRegistry } from "@livepeer/agent";

const tools = new ToolRegistry();

tools.register({
  name: "generate_image",
  description: "Generate an image from a text prompt",
  parameters: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "Image description" },
      style: { type: "string", enum: ["photo", "cartoon", "watercolor"] },
    },
    required: ["prompt"],
  },
  async execute(args) {
    const result = await callInferenceAPI(args.prompt, args.style);
    return JSON.stringify({ url: result.url });
  },
});
```

### Memory System

Two tiers of memory, both injected automatically:

**Working Memory** (Tier 1) — always in the system prompt, 800 token budget:
```typescript
const working = new WorkingMemoryStore();
working.setContext({ style: "watercolor", characters: "a cat named Luna" });
working.setCriticalConstraints(["Always use cartoon style", "Keep prompts under 30 words"]);
working.pin("User prefers landscape orientation");
// → Marshalled into system prompt automatically by AgentRunner
```

**Session Memory** (Tier 2) — queryable logs, not in prompt:
```typescript
const session = new SessionMemoryStore();
session.recordArtifact({ kind: "image", url: "...", prompt: "sunset" });
session.recall("sunset"); // → finds the artifact
```

### Tiers

Each provider supports 4 tiers (0=cheapest/fastest, 3=most capable):

| Tier | Use case | Gemini model | Claude model |
|------|----------|-------------|-------------|
| 0 | Drafts, classification | flash-lite | haiku |
| 1 | Standard tasks | flash | haiku |
| 2 | Complex reasoning | pro | sonnet |
| 3 | Architecture, review | pro | opus |

```typescript
runner.runStream({ user: "...", tier: 2 }); // Use tier 2 model
```

---

## Layer 1: Creative Kit (`@livepeer/creative-kit`)

Reusable building blocks for creative applications. Use as much or as little as you need.

### Artifact Store

The central data model. An "artifact" is any creative output — image, video, audio, text, 3D model.

```typescript
import { createArtifactStore } from "@livepeer/creative-kit";

const store = createArtifactStore({ maxArtifacts: 100 });

// Create
const img = store.getState().add({ type: "image", title: "Sunset", url: "https://..." });

// Update
store.getState().update(img.id, { url: "https://new-url..." });

// Connect (edges between artifacts)
store.getState().connect("img-1", "vid-2", { action: "animate" });

// Layout
store.getState().applyLayout([
  { id: img.id, x: 100, y: 200 },
]);
```

### UI Components

Composable React components. Your app provides the content, the kit provides behavior.

```tsx
import { InfiniteBoard, ArtifactCard, EdgeLayer, ChatPanel } from "@livepeer/creative-kit";

function MyApp() {
  const store = useMyStore();
  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Canvas */}
      <InfiniteBoard
        viewport={store.viewport}
        onViewportChange={store.setViewport}
      >
        <EdgeLayer artifacts={store.artifacts} edges={store.edges} />
        {store.artifacts.map(a => (
          <ArtifactCard
            key={a.id}
            artifact={a}
            onMove={(id, x, y) => store.update(id, { x, y })}
          >
            <img src={a.url} />
          </ArtifactCard>
        ))}
      </InfiniteBoard>

      {/* Chat */}
      <ChatPanel
        messages={messages}
        onSend={handleSend}
        cardRenderers={{
          "@@mycard@@": (text) => <MyCustomCard data={parse(text)} />,
        }}
      />
    </div>
  );
}
```

### Slash Command Router

Register commands with auto-generated `/help`:

```typescript
import { createCommandRouter } from "@livepeer/creative-kit";

const router = createCommandRouter();

router.register({
  name: "story",
  description: "Generate a multi-scene story",
  execute: async (args) => { /* ... */ return "Story created!"; },
});

router.register({
  name: "project",
  aliases: ["proj"],
  description: "Manage projects",
  execute: async (args) => { /* ... */ },
});

// In your chat handler:
const result = await router.execute(userInput); // returns null if not a /command
```

### Capability Resolver

Route actions to the best AI model with automatic fallback:

```typescript
import { createCapabilityResolver } from "@livepeer/creative-kit";

const resolver = createCapabilityResolver({
  fallbackChains: {
    "flux-dev": ["flux-schnell", "seedream-5-lite"],
    "seedance-i2v": ["ltx-i2v", "veo-i2v"],
  },
  actionDefaults: {
    generate: "flux-dev",
    animate: "seedance-i2v",
    tts: "chatterbox-tts",
  },
  userMentionPatterns: {
    "seedance": { capability: "seedance-i2v", type: "video" },
    "pixverse": { capability: "pixverse-i2v", type: "video" },
  },
});

const { capability, type } = resolver.resolve("generate", { userText: "using seedance" });
// → { capability: "seedance-i2v", type: "video" }

const chain = resolver.buildAttemptChain("seedance-i2v", liveCapabilities);
// → ["seedance-i2v", "ltx-i2v", "veo-i2v"] (only live models)
```

### Intent Classifier

Classify user messages before sending to the LLM:

```typescript
import { createIntentClassifier } from "@livepeer/creative-kit";

const classifier = createIntentClassifier([
  { type: "new_project", test: (t) => t.length > 500, priority: 10 },
  { type: "continue", test: (t) => /^(continue|next|go)$/i.test(t), priority: 5 },
  { type: "help", test: (t) => t.startsWith("/help") },
]);

classifier.classify("continue", { hasActiveProject: true, pendingItems: 3 });
// → { type: "continue" }
```

---

## Layer 2: Livepeer Infrastructure

### The Inference Pipeline

```
Your App
  → SDK Service (sdk.daydream.monster)
    → Signer (payment tickets)
    → BYOC Orchestrator (go-livepeer)
      → Inference Adapter
        → fal.ai / Gemini (AI models)
  ← Media URL (image/video/audio)
```

### Calling Inference

```typescript
// Direct SDK call
const response = await fetch("https://sdk.daydream.monster/inference", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer sk_your_daydream_api_key",
  },
  body: JSON.stringify({
    capability: "flux-dev",
    prompt: "a beautiful sunset over the ocean",
    params: { image_size: { width: 1024, height: 1024 } },
  }),
});

const result = await response.json();
// result.image_url → "https://v3b.fal.media/files/..."
// result.data.images[0].url → same
```

### Available Capabilities (40 models)

| Category | Models |
|----------|--------|
| **Image Generation** | flux-dev, flux-schnell, recraft-v4, gemini-image, seedream-5-lite, nano-banana |
| **Image Editing** | kontext-edit, flux-fill |
| **Video (text→video)** | veo-t2v, ltx-t2v, pixverse-t2v |
| **Video (image→video)** | seedance-i2v, seedance-i2v-fast, veo-i2v, ltx-i2v, pixverse-i2v, kling-i2v |
| **Video (misc)** | veo-transition, pixverse-transition, void-inpaint |
| **TTS** | chatterbox-tts, gemini-tts, inworld-tts, grok-tts |
| **3D** | tripo-t3d, tripo-i3d, tripo-mv3d |
| **Other** | bg-remove, topaz-upscale, talking-head, face-swap, lipsync, music, sfx |

### Live Video-to-Video (Scope)

Real-time AI video transformation via trickle protocol:

```
Webcam/Video → /stream/start → Scope Pipeline → /stream/output → Browser
                                     ↕
                              /stream/control (change prompt mid-stream)
```

Graph templates: `simple-lv2v`, `depth-guided`, `scribble-guided`, `interpolated`, `text-only`, `multi-pipeline`.

---

## Building Your App: Step by Step

### Step 1: Scaffold

```bash
npx create-next-app my-creative-app
cd my-creative-app
npm install @livepeer/agent @livepeer/creative-kit zustand
```

### Step 2: Create your stores

```typescript
// lib/stores.ts
import { createArtifactStore, createChatStore } from "@livepeer/creative-kit";

export const useArtifacts = createArtifactStore();
export const useChat = createChatStore();
```

### Step 3: Set up the agent

```typescript
// lib/agent.ts
import { AgentRunner, ToolRegistry, WorkingMemoryStore, SessionMemoryStore } from "@livepeer/agent";
import { GeminiProvider } from "@livepeer/agent";

const tools = new ToolRegistry();

// Register your domain tools
tools.register({
  name: "create_artwork",
  description: "Generate artwork and add to canvas",
  parameters: { /* ... */ },
  async execute(args) {
    const result = await fetch("/api/inference", { /* ... */ });
    const { url } = await result.json();
    useArtifacts.getState().add({ type: "image", title: args.title, url });
    return JSON.stringify({ success: true, url });
  },
});

export function createAgent(apiKey: string) {
  return new AgentRunner(
    new GeminiProvider({ apiKey }),
    tools,
    new WorkingMemoryStore(),
    new SessionMemoryStore(),
  );
}
```

### Step 4: Build the UI

```tsx
// app/page.tsx
"use client";
import { InfiniteBoard, ArtifactCard, ChatPanel } from "@livepeer/creative-kit";
import { useArtifacts, useChat } from "../lib/stores";
import { createAgent } from "../lib/agent";

export default function App() {
  const { artifacts, viewport, setViewport, update } = useArtifacts();
  const { messages, addMessage } = useChat();

  async function handleSend(text: string) {
    addMessage(text, "user");
    const agent = createAgent(process.env.NEXT_PUBLIC_GEMINI_KEY!);
    for await (const event of agent.runStream({ user: text })) {
      if (event.kind === "text") addMessage(event.text, "agent");
    }
  }

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div style={{ flex: 1 }}>
        <InfiniteBoard viewport={viewport} onViewportChange={setViewport}>
          {artifacts.map(a => (
            <ArtifactCard key={a.id} artifact={a} onMove={(id, x, y) => update(id, { x, y })}>
              <img src={a.url} style={{ width: "100%", height: "100%" }} />
            </ArtifactCard>
          ))}
        </InfiniteBoard>
      </div>
      <div style={{ width: 360 }}>
        <ChatPanel messages={messages} onSend={handleSend} />
      </div>
    </div>
  );
}
```

### Step 5: Add inference via Livepeer

```typescript
// app/api/inference/route.ts
export async function POST(req: Request) {
  const { capability, prompt, params } = await req.json();
  const resp = await fetch("https://sdk.daydream.monster/inference", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.DAYDREAM_API_KEY}`,
    },
    body: JSON.stringify({ capability, prompt, params }),
  });
  return new Response(resp.body, { headers: { "Content-Type": "application/json" } });
}
```

---

## Architecture Patterns

### Pattern 1: Agent-Driven Creation

The LLM decides which tools to call based on user intent.

```
User: "Create a 6-scene story about a brave knight"
  → Agent classifies intent: new_project
  → Agent calls project_create(brief, scenes)
  → Agent calls project_generate(project_id)
  → For each scene: calls create_media(action: "generate", prompt)
  → Returns: "Story created with 6 scenes on the canvas"
```

### Pattern 2: Fast Path (No LLM)

Deterministic routing bypasses the LLM entirely. Zero tokens, instant response.

```
User: "/story a brave knight"
  → CommandRouter parses /story
  → Calls Gemini once for story JSON generation
  → User reviews StoryCard in chat
  → User types "apply"
  → project_create + project_generate called directly
  → No agent loop needed
```

### Pattern 3: Fallback Chain

When one model rejects (content policy, size limit), automatically try the next.

```
User right-clicks image → Animate
  → seedance-i2v: "content policy violation" (real people)
  → veo-i2v: "dimensions too large"
  → ltx-i2v: success! → video card created
```

### Pattern 4: Proxy Provider

Browser never sees API keys. Server-side routes inject credentials.

```
Browser → POST /api/agent/gemini (no API key)
  → Next.js route injects GEMINI_API_KEY from env
  → Forwards to Google API
  → Returns response to browser
```

---

## Example Apps

### Storyboard (Professional Creative Tool)

Full-featured creative workspace with 40+ AI models, 25+ slash commands, infinite canvas, agent chat, live streaming.

**Uses:** All three layers. Custom tools for scope/stream, story/film generators, context menu with 15+ actions.

### Creative Lab (Kids Educational App)

Mission-driven creative tool for ages 8-16. Guided steps, spark prompts, style picker, safety filters.

**Uses:** Creative Kit stores + UI, Agent SDK for advanced missions, Livepeer inference with model allowlist.

**Key difference:** Creative Lab doesn't use the full agent loop for starter missions — it calls inference directly with safety-prefixed prompts. Agent SDK is only used in creator/master missions that need multi-step reasoning.

---

## Key Design Principles

1. **Agent layer is provider-agnostic** — swap Gemini for Claude with one line
2. **Creative Kit is app-agnostic** — same stores/UI work for any creative domain
3. **Infrastructure is capability-based** — request by name ("flux-dev"), not by URL
4. **Tools are the API** — everything the agent can do is a registered tool
5. **Memory is layered** — working (always visible) + session (queryable) + long-term (persistent)
6. **Fallback chains are automatic** — content policy rejection → next model, transparent to user
7. **Browser never holds secrets** — API keys live server-side, requests proxied through Next.js
