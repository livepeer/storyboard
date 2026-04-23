"use client";

import { useState } from "react";

// ─── Documentation Sections ─────────────────────────────────────────────────

const NAV = [
  { id: "overview", label: "Overview" },
  { id: "quickstart", label: "Quick Start" },
  { id: "tools", label: "Tools" },
  { id: "skills", label: "Skills" },
  { id: "workflows", label: "Workflows" },
  { id: "streaming", label: "Live Streaming" },
  { id: "creative-kit", label: "Creative Kit" },
  { id: "rest-api", label: "REST API" },
  { id: "models", label: "Models" },
];

function Code({ children, lang }: { children: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative rounded-xl bg-black/40 border border-white/[0.04] overflow-hidden">
      {lang && <div className="px-4 py-1 border-b border-white/[0.04] text-[9px] text-white/30 font-mono">{lang}</div>}
      <pre className="p-4 text-[11px] leading-relaxed text-emerald-300/80 overflow-x-auto font-mono whitespace-pre-wrap">{children}</pre>
      <button
        onClick={() => { navigator.clipboard.writeText(children); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
        className="absolute top-2 right-2 rounded px-2 py-0.5 text-[9px] text-white/30 bg-white/[0.05] opacity-0 group-hover:opacity-100 transition-opacity"
      >{copied ? "Copied!" : "Copy"}</button>
    </div>
  );
}

function H2({ children, id }: { children: string; id: string }) {
  return <h2 id={id} className="text-xl font-bold mt-12 mb-4 scroll-mt-20">{children}</h2>;
}

function H3({ children }: { children: string }) {
  return <h3 className="text-sm font-bold text-white/80 mt-6 mb-2">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-white/50 leading-relaxed mb-3">{children}</p>;
}

function ToolCard({ name, description, params }: {
  name: string; description: string;
  params: { name: string; type: string; desc: string; required?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden mb-2">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.03] transition-colors">
        <code className="text-xs font-mono font-bold text-cyan-300">{name}</code>
        <span className="text-[11px] text-white/40 flex-1">{description}</span>
        <span className="text-white/20 text-xs">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="border-t border-white/[0.04] px-4 py-3">
          <table className="w-full text-[10px]">
            <thead><tr className="border-b border-white/[0.04]">
              <th className="text-left px-2 py-1 text-white/40">Param</th>
              <th className="text-left px-2 py-1 text-white/40">Type</th>
              <th className="text-left px-2 py-1 text-white/40">Description</th>
            </tr></thead>
            <tbody>{params.map((p) => (
              <tr key={p.name} className="border-b border-white/[0.02]">
                <td className="px-2 py-1 font-mono text-cyan-300/80">{p.name}{p.required && <span className="text-red-400">*</span>}</td>
                <td className="px-2 py-1 text-white/30">{p.type}</td>
                <td className="px-2 py-1 text-white/50">{p.desc}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("overview");

  // Override globals.css overflow:hidden + height:100vh on body
  if (typeof document !== "undefined") {
    document.body.style.overflow = "auto";
    document.body.style.height = "auto";
  }

  return (
    <div className="min-h-screen bg-[#0a0a0e] text-white flex">
      {/* Sidebar */}
      <nav className="w-52 shrink-0 border-r border-white/[0.06] bg-[rgba(10,10,14,0.95)] sticky top-0 h-screen overflow-y-auto">
        <div className="px-4 py-5">
          <a href="/" className="text-xs text-white/30 hover:text-white/60">← Back to App</a>
          <h1 className="text-base font-bold mt-3">
            <span className="text-[#6366f1]">Agent</span> SDK
          </h1>
          <p className="text-[10px] text-white/30 mt-1">Developer Documentation</p>
        </div>
        <div className="px-2 pb-6 space-y-0.5">
          {NAV.map((n) => (
            <a
              key={n.id}
              href={`#${n.id}`}
              onClick={() => setActiveSection(n.id)}
              className={`block rounded-lg px-3 py-1.5 text-xs transition-colors ${
                activeSection === n.id ? "bg-[#6366f1]/15 text-[#6366f1] font-medium" : "text-white/40 hover:bg-white/[0.04] hover:text-white/70"
              }`}
            >{n.label}</a>
          ))}
        </div>
        <div className="px-4 pb-4 border-t border-white/[0.04] pt-4">
          <a href="https://docs.daydream.live" target="_blank" className="block rounded-lg bg-[#6366f1]/20 border border-[#6366f1]/30 px-3 py-2 text-[10px] text-center text-[#6366f1] hover:bg-[#6366f1]/30 transition-colors">
            Get API Key →
          </a>
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 max-w-3xl px-8 py-8">

        {/* ─── Overview ─── */}
        <H2 id="overview">What is the Agent SDK?</H2>
        <P>The Storyboard Agent SDK is a framework for building AI-powered creative applications. It provides:</P>
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { icon: "🧠", title: "21 Agent Tools", desc: "Generate images, videos, 3D models, music, talking videos — all via tool calls" },
            { icon: "📡", title: "Live AI Streaming", desc: "Real-time video-to-video with Scope — prompt traveling, style morphing, 24fps" },
            { icon: "🎨", title: "Creative Kit", desc: "UI components, stores, model router — build creative apps fast" },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="text-2xl mb-2">{f.icon}</div>
              <div className="text-xs font-bold text-white/80 mb-1">{f.title}</div>
              <div className="text-[10px] text-white/40 leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>
        <P>The SDK has three layers:</P>
        <Code lang="architecture">{`┌─────────────────────────────────────────┐
│  Your App (Next.js, React, any JS)      │
├─────────────────────────────────────────┤
│  @livepeer/creative-kit                 │
│  Stores, UI, Model Router, Recipes      │
├─────────────────────────────────────────┤
│  @livepeer/agent                        │
│  AgentRunner, ToolRegistry, Memory      │
├─────────────────────────────────────────┤
│  SDK Service (sdk.daydream.monster)      │
│  48 AI models, Live Streaming, TTS      │
└─────────────────────────────────────────┘`}</Code>

        {/* ─── Quick Start ─── */}
        <H2 id="quickstart">Quick Start</H2>
        <H3>1. Install</H3>
        <Code lang="bash">{`npm install @livepeer/agent @livepeer/creative-kit @livepeer/scope-player`}</Code>

        <H3>2. Generate an Image (simplest possible)</H3>
        <Code lang="bash">{`curl -X POST https://sdk.daydream.monster/inference \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk_your_key" \\
  -d '{"capability":"flux-dev","prompt":"a dragon in a misty forest"}'

# → { "image_url": "https://v3b.fal.media/files/..." }`}</Code>

        <H3>3. Build an Agent (full tool-use loop)</H3>
        <Code lang="typescript">{`import { AgentRunner, ToolRegistry, WorkingMemoryStore } from "@livepeer/agent";

// 1. Register tools
const tools = new ToolRegistry();
tools.register({
  name: "generate_image",
  description: "Generate an image from a text prompt",
  parameters: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "Image description" },
    },
    required: ["prompt"],
  },
  execute: async (args) => {
    const res = await fetch("https://sdk.daydream.monster/inference", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer sk_..." },
      body: JSON.stringify({ capability: "flux-dev", prompt: args.prompt }),
    });
    const data = await res.json();
    return JSON.stringify({ url: data.image_url });
  },
});

// 2. Create agent with an LLM provider
const memory = new WorkingMemoryStore();
memory.setCriticalConstraints(["You are a creative assistant. Use tools to create media."]);

const runner = new AgentRunner(yourLLMProvider, tools, memory);

// 3. Run a conversation turn
for await (const event of runner.run("Create a dragon image")) {
  if (event.kind === "text") console.log("Agent:", event.text);
  if (event.kind === "tool_call") console.log("Calling:", event.name);
  if (event.kind === "tool_result") console.log("Result:", event.result);
}`}</Code>

        <H3>4. Use the Smart Model Router</H3>
        <Code lang="typescript">{`import { routeModel, recordModelLatency } from "@livepeer/creative-kit";

// Auto-select the best model based on speed (60%), style (30%), capacity (10%)
const result = routeModel({
  action: "generate",
  prompt: "a logo with readable text",
  userText: "make it fast",
});
// → { model: "flux-dev", type: "image", score: 7.8, reason: "speed=9 style=5 cap=9" }

// After generation, feed actual latency back (self-learning)
recordModelLatency("flux-dev", 3200); // 3.2 seconds`}</Code>

        {/* ─── Tools ─── */}
        <H2 id="tools">Tools Reference</H2>
        <P>The agent uses 21 tools to create and manipulate media. Each tool has typed parameters and returns structured results. Tools are composed into multi-step workflows automatically by the LLM.</P>

        <H3>Media Creation</H3>
        <ToolCard name="create_media" description="Generate images, videos, audio, or 3D models. Supports multi-step chains." params={[
          { name: "steps", type: "array", desc: "Array of generation steps [{action, prompt, title, source_url, duration}]", required: true },
        ]} />
        <ToolCard name="project_create" description="Create a multi-scene project for batch generation" params={[
          { name: "brief", type: "string", desc: "Project description", required: true },
          { name: "scenes", type: "array", desc: "Scene list [{title, prompt, action}]", required: true },
          { name: "style_guide", type: "object", desc: "{visual_style, color_palette, mood, prompt_prefix}" },
        ]} />
        <ToolCard name="project_generate" description="Generate all pending scenes in a project" params={[
          { name: "project_id", type: "string", desc: "From project_create result", required: true },
        ]} />

        <H3>Canvas Operations</H3>
        <ToolCard name="canvas_create" description="Add a card to the canvas" params={[
          { name: "type", type: "string", desc: "image | video | audio | text", required: true },
          { name: "title", type: "string", desc: "Card title", required: true },
          { name: "url", type: "string", desc: "Media URL" },
        ]} />
        <ToolCard name="canvas_get" description="Get card details by refId" params={[
          { name: "ref_id", type: "string", desc: "Card reference ID (e.g. img-1)", required: true },
        ]} />
        <ToolCard name="canvas_organize" description="Auto-layout cards on canvas" params={[
          { name: "mode", type: "string", desc: "grid | narrative | episode | movie-board" },
        ]} />

        <H3>Live Streaming (Scope)</H3>
        <ToolCard name="scope_start" description="Start a live AI video stream with full Scope config" params={[
          { name: "prompt", type: "string", desc: "Scene description", required: true },
          { name: "recipe", type: "string", desc: "classic | ltx-responsive | depth-lock | krea-hq | memflow-consistent" },
          { name: "preset", type: "string", desc: "dreamy | cinematic | anime | abstract | faithful | painterly" },
          { name: "pipeline_id", type: "string", desc: "longlive | ltx2 | krea_realtime_video | memflow" },
        ]} />
        <ToolCard name="scope_control" description="Update running stream parameters" params={[
          { name: "prompt", type: "string", desc: "New scene prompt" },
          { name: "noise_scale", type: "number", desc: "0.0 (faithful) to 1.0 (creative)" },
          { name: "reset_cache", type: "boolean", desc: "Flush KV cache for clean transition" },
        ]} />
        <ToolCard name="scope_stop" description="Stop the active stream" params={[]} />

        {/* ─── Skills ─── */}
        <H2 id="skills">Skills</H2>
        <P>Skills are markdown files that teach the agent domain knowledge. They&apos;re fetched at runtime from <code className="text-cyan-300/60">/skills/*.md</code> — edit them without code changes.</P>

        <div className="space-y-2">
          {[
            { name: "storyteller.md", desc: "Generates 6-scene visual stories with style, characters, and arc. Accepts story concepts, product campaigns, documentary ideas." },
            { name: "scope-agent.md", desc: "Translates natural language into Scope live stream configs. Maps presets, recipes, and parameters." },
            { name: "scope-pipelines.md", desc: "Pipeline catalog: LongLive, LTX 2.3, Krea, MemFlow. 9 composable recipes." },
            { name: "prompt-craft.md", desc: "7-layer prompt formula for cinematic scene descriptions: camera, subject, surface, background, lighting, colors, atmosphere." },
            { name: "hifi-video.md", desc: "Two-step pipeline: GPT Image 2 key frame → Seedance 2.0 animation." },
            { name: "film-hifi.md", desc: "Genre skill for /film — optimized for cartoon, anime, illustration styles." },
            { name: "scene-traveling.md", desc: "Multi-scene live stream direction. 3 laws of smooth morphing. Transition parameters." },
          ].map((s) => (
            <div key={s.name} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
              <code className="text-[11px] font-mono text-purple-300/80 shrink-0">{s.name}</code>
              <span className="text-[11px] text-white/40">{s.desc}</span>
            </div>
          ))}
        </div>

        <H3>Loading a Skill at Runtime</H3>
        <Code lang="typescript">{`// Skills are static files — fetch and inject into the system prompt
const skill = await fetch("/skills/storyteller.md").then(r => r.text());
memory.setCriticalConstraints([basePrompt, skill]);`}</Code>

        {/* ─── Workflows ─── */}
        <H2 id="workflows">Workflows</H2>
        <P>Slash commands orchestrate multi-step creative workflows. Each creates a draft, lets the user edit inline, then applies.</P>

        <div className="space-y-3 mb-6">
          {[
            { cmd: "/story <concept>", flow: "LLM generates 6 scenes → StoryCard with inline editing → Apply creates project → project_generate → images on canvas", models: "flux-dev (default), auto-routed by style" },
            { cmd: "/film <concept>", flow: "LLM generates 4 shots with camera → FilmCard → Apply: key frames (flux-dev or gpt-image) → animate each (seedance-i2v) → videos on canvas", models: "hifi mode: gpt-image → seedance" },
            { cmd: "/stream <concept>", flow: "LLM plans multi-scene stream → StreamPlanCard → Apply: scope_start → prompt traveling with transitions → auto-stop", models: "longlive, ltx2, krea, memflow (via recipes)" },
            { cmd: "/talk <text>", flow: "TTS (chatterbox or gemini-tts) → talking-head animation → video card", models: "chatterbox-tts, gemini-tts, talking-head" },
          ].map((w) => (
            <div key={w.cmd} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <code className="text-xs font-mono font-bold text-amber-300">{w.cmd}</code>
              <div className="text-[10px] text-white/50 mt-1.5 leading-relaxed">{w.flow}</div>
              <div className="text-[9px] text-white/30 mt-1">Models: {w.models}</div>
            </div>
          ))}
        </div>

        <H3>Conversation Continuity</H3>
        <Code lang="text">{`User: /story a dragon adventure
→ 6-scene story card (editable)

User: add more scenes about finding treasure
→ System detects continuation → generates 3 matching scenes → appends
→ Updated card with NEW badges → user deletes unwanted → Apply

User: /story a space adventure
→ resetForNewWork() clears old context → fresh story, no bleed`}</Code>

        {/* ─── Streaming ─── */}
        <H2 id="streaming">Live Streaming</H2>
        <P>Real-time AI video generation using Scope. The stream processes input frames through an AI pipeline, transforming them based on text prompts.</P>

        <H3>Stream Recipes</H3>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {[
            { recipe: "classic", pipeline: "LongLive", desc: "Default. Stable prompt traveling, LoRA, VACE" },
            { recipe: "ltx-responsive", pipeline: "LTX 2.3", desc: "24fps native, fast prompt response" },
            { recipe: "ltx-smooth", pipeline: "LTX+RIFE", desc: "48fps buttery smooth output" },
            { recipe: "depth-lock", pipeline: "LongLive+Depth", desc: "Preserve 3D structure" },
            { recipe: "krea-hq", pipeline: "Krea 14B", desc: "Highest visual fidelity" },
            { recipe: "memflow-consistent", pipeline: "MemFlow", desc: "Best character consistency" },
          ].map((r) => (
            <div key={r.recipe} className="rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2">
              <code className="text-[10px] font-mono text-red-300/80">{r.recipe}</code>
              <span className="text-[9px] text-white/20 ml-2">{r.pipeline}</span>
              <div className="text-[9px] text-white/30 mt-0.5">{r.desc}</div>
            </div>
          ))}
        </div>

        <H3>Stream Lifecycle</H3>
        <Code lang="typescript">{`import { ScopePlayer } from "@livepeer/scope-player";

// In your React component:
<ScopePlayer
  sdkUrl="https://sdk.daydream.monster"
  apiKey="sk_your_key"
  externalStreamId={streamId}
  onStateChange={(state) => console.log(state.status, state.fps)}
  onSourceReady={(setSource) => {
    // Drag an image onto the player to transform it live
    setSource({ type: "image", url: imageUrl });
  }}
/>`}</Code>

        <H3>Prompt Traveling (Scene Transitions)</H3>
        <Code lang="typescript">{`import { PerformanceEngine } from "./performance";

const engine = new PerformanceEngine();
engine.setScenes([
  { index: 0, title: "Dawn", prompt: "golden sunrise over mountains", preset: "cinematic", duration: 30 },
  { index: 1, title: "Storm", prompt: "dark storm clouds, lightning", preset: "abstract", duration: 15 },
  { index: 2, title: "Night", prompt: "starry sky, aurora borealis", preset: "dreamy", duration: 25 },
]);

// Transitions use noise_scale + kv_cache ramp for smooth morphing
engine.play(controlFn, onStateUpdate);
engine.pause();   // freeze at current point
engine.resume();  // continue from where paused`}</Code>

        {/* ─── Creative Kit ─── */}
        <H2 id="creative-kit">Creative Kit</H2>
        <P>Shared framework for building creative apps. Both Storyboard and Creative Stage use it.</P>

        <H3>Stores (Zustand)</H3>
        <Code lang="typescript">{`import {
  createArtifactStore,   // Canvas cards (images, videos, audio)
  createChatStore,       // Chat messages
  createProjectStore,    // Multi-scene projects
  createGroupManager,    // Episode/collection grouping
  createConversationContext, // Active work tracking
} from "@livepeer/creative-kit";

const artifacts = createArtifactStore({ maxArtifacts: 200 });
artifacts.getState().add({ type: "image", title: "Dragon", url: "...", refId: "img-1" });`}</Code>

        <H3>Model Router (Self-Learning)</H3>
        <Code lang="typescript">{`import { routeModel, recordModelLatency, getModelStats } from "@livepeer/creative-kit";

// Scores: speed (60%) + style match (30%) + capacity (10%)
const result = routeModel({
  action: "generate",
  prompt: "a logo with text",
  availableModels: new Set(["flux-dev", "gpt-image", "recraft-v4"]),
});
// After each inference, feed back actual speed → router learns
recordModelLatency(result.model, elapsedMs);

// Check learned stats
const stats = getModelStats();
// → Map { "flux-dev" → { avgMs: 3200, count: 47, currentSpeed: 8.9 } }`}</Code>

        <H3>Pipeline Registry</H3>
        <Code lang="typescript">{`import { createPipelineRegistry } from "@livepeer/creative-kit";

const registry = createPipelineRegistry();

// Resolve user intent to the best recipe
const recipe = registry.resolve("smooth 24fps stream");
// → { id: "ltx-responsive", pipeline: "ltx2", graph: {...}, defaults: { kv_cache: 0.3 } }

// List all recipes by quality tier
const quality = registry.listRecipes("quality");
// → [depth-lock, ltx-smooth, krea-hq, memflow-consistent, ...]`}</Code>

        {/* ─── REST API ─── */}
        <H2 id="rest-api">REST API Reference</H2>
        <P>Base URL: <code className="text-cyan-300/60">https://sdk.daydream.monster</code> · Auth: <code className="text-amber-300/60">Authorization: Bearer sk_...</code></P>

        <div className="space-y-1 mb-6">
          {[
            { m: "POST", p: "/inference", d: "Run AI inference (image, video, audio, 3D)" },
            { m: "GET", p: "/capabilities", d: "List all 48 available models" },
            { m: "GET", p: "/health", d: "Service health check" },
            { m: "POST", p: "/stream/start", d: "Start live AI stream" },
            { m: "POST", p: "/stream/{id}/publish", d: "Send input frame (JPEG)" },
            { m: "GET", p: "/stream/{id}/frame", d: "Get output frame (JPEG)" },
            { m: "POST", p: "/stream/{id}/control", d: "Update stream params" },
            { m: "POST", p: "/stream/{id}/stop", d: "Stop stream" },
            { m: "GET", p: "/streams", d: "List active streams" },
            { m: "POST", p: "/api/agent/gemini", d: "Gemini proxy (app route)" },
            { m: "POST", p: "/api/agent/chat", d: "Claude proxy (app route)" },
            { m: "POST", p: "/api/agent/openai", d: "OpenAI proxy (app route)" },
          ].map((e) => (
            <div key={e.p} className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-white/[0.02] transition-colors">
              <span className={`rounded px-2 py-0.5 text-[9px] font-bold ${e.m === "GET" ? "bg-emerald-500/20 text-emerald-300" : "bg-blue-500/20 text-blue-300"}`}>{e.m}</span>
              <code className="text-[11px] font-mono text-white/70 w-48">{e.p}</code>
              <span className="text-[11px] text-white/35">{e.d}</span>
            </div>
          ))}
        </div>

        <H3>Example: Generate Image → Animate → Get Video</H3>
        <Code lang="bash">{`# Step 1: Generate key frame
IMG=$(curl -s -X POST https://sdk.daydream.monster/inference \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk_your_key" \\
  -d '{"capability":"flux-dev","prompt":"a majestic eagle soaring"}' \\
  | jq -r '.image_url // .data.images[0].url')

echo "Image: $IMG"

# Step 2: Animate to video (10 seconds with audio)
curl -X POST https://sdk.daydream.monster/inference \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk_your_key" \\
  -d "{
    \\"capability\\": \\"seedance-i2v\\",
    \\"prompt\\": \\"eagle gliding through mountain valley, cinematic camera follow\\",
    \\"params\\": { \\"image_url\\": \\"$IMG\\", \\"duration\\": \\"10\\", \\"generate_audio\\": true }
  }"

# → { "data": { "video": { "url": "https://..." } } }`}</Code>

        {/* ─── Models ─── */}
        <H2 id="models">Available Models (48)</H2>
        <div className="space-y-4">
          {[
            { cat: "Image Generation", color: "text-blue-300", models: [
              { name: "flux-dev", speed: "~3s", desc: "Fast, reliable. Default for all styles." },
              { name: "flux-schnell", speed: "~1s", desc: "Fastest. Draft/preview quality." },
              { name: "gpt-image", speed: "~8s", desc: "Best for text, logos, products, cartoons." },
              { name: "recraft-v4", speed: "~6s", desc: "Professional illustration, editorial." },
              { name: "seedream-5-lite", speed: "~5s", desc: "Best photorealism." },
              { name: "gemini-image", speed: "~6s", desc: "Painterly, watercolor, artistic." },
            ]},
            { cat: "Video (Image → Video)", color: "text-red-300", models: [
              { name: "seedance-i2v", speed: "~30s", desc: "Default. 15s cinematic + audio." },
              { name: "kling-o3-i2v", speed: "~45s", desc: "4K premium. Cinema-grade." },
              { name: "veo-i2v", speed: "~20s", desc: "Google Veo. 8s max." },
              { name: "ltx-i2v", speed: "~15s", desc: "Fast, open-source." },
            ]},
            { cat: "Video (Text → Video)", color: "text-red-300", models: [
              { name: "kling-o3-t2v", speed: "~45s", desc: "4K text-to-video." },
              { name: "veo-t2v", speed: "~20s", desc: "Google Veo text-to-video." },
              { name: "ltx-t2v", speed: "~15s", desc: "Fast text-to-video." },
            ]},
            { cat: "Audio", color: "text-amber-300", models: [
              { name: "chatterbox-tts", speed: "~3s", desc: "TTS + voice cloning." },
              { name: "gemini-tts", speed: "~3s", desc: "TTS with persona/style control." },
              { name: "music", speed: "~20s", desc: "Background music generation." },
            ]},
            { cat: "3D Models", color: "text-emerald-300", models: [
              { name: "tripo-i3d", speed: "~30s", desc: "Image → 3D mesh." },
              { name: "tripo-t3d", speed: "~30s", desc: "Text → 3D mesh." },
            ]},
            { cat: "Live Streaming", color: "text-purple-300", models: [
              { name: "longlive", speed: "8-12fps", desc: "Default Scope pipeline. LoRA + VACE." },
              { name: "ltx2", speed: "24fps", desc: "LTX 2.3. Fast prompt response." },
              { name: "krea_realtime_video", speed: "6-8fps", desc: "14B model. Highest quality." },
              { name: "memflow", speed: "8fps", desc: "Memory bank. Best consistency." },
            ]},
          ].map((cat) => (
            <div key={cat.cat}>
              <div className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${cat.color}`}>{cat.cat}</div>
              <div className="grid grid-cols-2 gap-1.5">
                {cat.models.map((m) => (
                  <div key={m.name} className="flex items-center gap-2 rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-1.5">
                    <code className="text-[10px] font-mono text-cyan-300/80 shrink-0">{m.name}</code>
                    <span className="text-[9px] text-white/20">{m.speed}</span>
                    <span className="text-[9px] text-white/30 flex-1">{m.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-white/[0.04] pt-6 pb-10 mt-12 text-center text-xs text-white/20">
          <a href="https://livepeer.org" className="text-white/40 hover:text-white/60">Livepeer</a> ·
          <a href="https://docs.daydream.live" className="text-white/40 hover:text-white/60 ml-2">Daydream Docs</a> ·
          <a href="https://github.com/livepeer/storyboard" className="text-white/40 hover:text-white/60 ml-2">GitHub</a>
        </div>
      </main>
    </div>
  );
}
