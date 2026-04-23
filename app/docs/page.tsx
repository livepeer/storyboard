"use client";

import { useState } from "react";

// ─── API Documentation Data ─────────────────────────────────────────────────

interface Endpoint {
  method: "GET" | "POST" | "DELETE";
  path: string;
  title: string;
  description: string;
  auth?: string;
  body?: { field: string; type: string; required: boolean; description: string }[];
  response?: string;
  example?: { request: string; response: string };
  tags: string[];
}

const ENDPOINTS: Endpoint[] = [
  // ─── Inference ───
  {
    method: "POST", path: "/inference", title: "Run AI Inference",
    description: "Generate images, videos, audio, or 3D models using any available AI model on the Livepeer network. The capability field selects the model — see /capabilities for the full list.",
    auth: "Bearer sk_... (Daydream API key)",
    tags: ["inference"],
    body: [
      { field: "capability", type: "string", required: true, description: "Model to use: flux-dev, seedance-i2v, gpt-image, chatterbox-tts, etc." },
      { field: "prompt", type: "string", required: true, description: "Text prompt describing what to generate" },
      { field: "params", type: "object", required: false, description: "Model-specific parameters (image_url, duration, size, etc.)" },
      { field: "timeout", type: "number", required: false, description: "Request timeout in seconds (default: 300)" },
    ],
    example: {
      request: `curl -X POST https://sdk.daydream.monster/inference \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk_your_key" \\
  -d '{
    "capability": "flux-dev",
    "prompt": "a serene mountain lake at sunset, cinematic lighting",
    "params": {}
  }'`,
      response: `{
  "image_url": "https://v3b.fal.media/files/...",
  "data": {
    "images": [{ "url": "https://...", "content_type": "image/png" }]
  }
}`,
    },
  },
  {
    method: "GET", path: "/capabilities", title: "List Available Models",
    description: "Returns all AI models currently available on the network. Each capability has a name (used in /inference), model ID, and capacity.",
    tags: ["inference"],
    example: {
      request: `curl https://sdk.daydream.monster/capabilities`,
      response: `[
  { "name": "flux-dev", "model_id": "fal-ai/flux/dev", "capacity": 100 },
  { "name": "seedance-i2v", "model_id": "bytedance/seedance-2.0/image-to-video", "capacity": 100 },
  { "name": "gpt-image", "model_id": "openai/gpt-image-2", "capacity": 100 },
  { "name": "kling-o3-i2v", "model_id": "fal-ai/kling-video/o3/standard/image-to-video", "capacity": 100 }
]`,
    },
  },

  // ─── Live Streaming ───
  {
    method: "POST", path: "/stream/start", title: "Start Live Stream",
    description: "Start a real-time AI video stream using Scope. The stream processes input frames through an AI pipeline and produces transformed output frames. Use with /stream/publish to send frames and /stream/frame to receive output.",
    auth: "Bearer sk_... (Daydream API key)",
    tags: ["streaming"],
    body: [
      { field: "model_id", type: "string", required: true, description: 'Always "scope"' },
      { field: "params.prompt", type: "string", required: true, description: "Scene description for the AI transformation" },
      { field: "params.pipeline_ids", type: "string[]", required: false, description: '["longlive"] (default), ["ltx2"], ["krea_realtime_video"]' },
      { field: "params.noise_scale", type: "number", required: false, description: "0.0 (faithful) to 1.0 (creative). Default: 0.7" },
      { field: "params.graph", type: "object", required: false, description: "Graph config with source/pipeline/sink nodes" },
    ],
    example: {
      request: `curl -X POST https://sdk.daydream.monster/stream/start \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk_your_key" \\
  -d '{
    "model_id": "scope",
    "params": {
      "prompt": "dreamy watercolor landscape",
      "pipeline_ids": ["longlive"],
      "noise_scale": 0.6
    }
  }'`,
      response: `{ "stream_id": "abc123", "manifest_id": "abc123" }`,
    },
  },
  {
    method: "POST", path: "/stream/{id}/publish", title: "Publish Frame",
    description: "Send a JPEG frame to the live stream pipeline. Publish at ~10fps. The pipeline transforms each frame and produces output available via /stream/{id}/frame.",
    auth: "Bearer sk_...",
    tags: ["streaming"],
    body: [
      { field: "(body)", type: "binary", required: true, description: "JPEG image data (Content-Type: image/jpeg)" },
    ],
    example: {
      request: `curl -X POST "https://sdk.daydream.monster/stream/abc123/publish?seq=0" \\
  -H "Content-Type: image/jpeg" \\
  -H "Authorization: Bearer sk_your_key" \\
  --data-binary @frame.jpg`,
      response: `(200 OK)`,
    },
  },
  {
    method: "GET", path: "/stream/{id}/frame", title: "Get Output Frame",
    description: "Poll for the latest AI-transformed output frame. Returns JPEG image data. Poll continuously at ~10-30fps for real-time video.",
    auth: "Bearer sk_...",
    tags: ["streaming"],
    example: {
      request: `curl "https://sdk.daydream.monster/stream/abc123/frame" \\
  -H "Authorization: Bearer sk_your_key" \\
  -o output.jpg`,
      response: `(JPEG binary data, Content-Type: image/jpeg)`,
    },
  },
  {
    method: "POST", path: "/stream/{id}/control", title: "Update Stream Parameters",
    description: "Change parameters on a running stream without restarting. Use to update the prompt, adjust noise_scale, switch presets, or flush the KV cache for clean transitions.",
    auth: "Bearer sk_...",
    tags: ["streaming"],
    body: [
      { field: "type", type: "string", required: true, description: '"parameters"' },
      { field: "params.prompts", type: "string", required: false, description: "New scene prompt" },
      { field: "params.noise_scale", type: "number", required: false, description: "Creativity level 0.0-1.0" },
      { field: "params.reset_cache", type: "boolean", required: false, description: "Flush KV cache for clean scene transition" },
      { field: "params.kv_cache_attention_bias", type: "number", required: false, description: "Temporal consistency 0.01-1.0" },
    ],
    example: {
      request: `curl -X POST "https://sdk.daydream.monster/stream/abc123/control" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk_your_key" \\
  -d '{
    "type": "parameters",
    "params": {
      "prompts": "cyberpunk city at night",
      "noise_scale": 0.7,
      "reset_cache": true
    }
  }'`,
      response: `{ "status": "sent", "type": "parameters" }`,
    },
  },
  {
    method: "POST", path: "/stream/{id}/stop", title: "Stop Stream",
    description: "Stop a running live stream and clean up resources.",
    auth: "Bearer sk_...",
    tags: ["streaming"],
    example: {
      request: `curl -X POST "https://sdk.daydream.monster/stream/abc123/stop" \\
  -H "Authorization: Bearer sk_your_key"`,
      response: `{ "status": "stopped", "stream_id": "abc123" }`,
    },
  },

  // ─── Agent ───
  {
    method: "POST", path: "/api/agent/gemini", title: "Gemini Agent Proxy",
    description: "Proxy to Google Gemini API. Send Gemini-format requests (contents + system_instruction + tools). Used by the storyboard agent for multi-turn tool-use conversations.",
    tags: ["agent"],
    body: [
      { field: "model", type: "string", required: false, description: "Model ID (default: gemini-2.5-flash)" },
      { field: "contents", type: "array", required: true, description: "Gemini conversation messages [{role, parts}]" },
      { field: "system_instruction", type: "object", required: false, description: "System prompt {parts: [{text}]}" },
      { field: "tools", type: "array", required: false, description: "Function declarations for tool use" },
    ],
    example: {
      request: `curl -X POST /api/agent/gemini \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gemini-2.5-flash",
    "contents": [
      { "role": "user", "parts": [{ "text": "Generate a sunset image" }] }
    ],
    "system_instruction": {
      "parts": [{ "text": "You are a creative assistant." }]
    }
  }'`,
      response: `{
  "candidates": [{
    "content": {
      "parts": [{ "text": "I\\'ll create that for you!" }]
    }
  }]
}`,
    },
  },

  // ─── Health ───
  {
    method: "GET", path: "/health", title: "Health Check",
    description: "Check if the SDK service is running and which orchestrator it's connected to.",
    tags: ["system"],
    example: {
      request: `curl https://sdk.daydream.monster/health`,
      response: `{ "status": "ok", "orchestrator": "https://byoc-staging-1.daydream.monster:8935" }`,
    },
  },
];

const TAG_COLORS: Record<string, string> = {
  inference: "bg-blue-500/20 text-blue-300",
  streaming: "bg-red-500/20 text-red-300",
  agent: "bg-purple-500/20 text-purple-300",
  system: "bg-gray-500/20 text-gray-300",
};

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-500/20 text-emerald-300",
  POST: "bg-blue-500/20 text-blue-300",
  DELETE: "bg-red-500/20 text-red-300",
};

// ─── Quick Start Guides ─────────────────────────────────────────────────────

const QUICKSTARTS = [
  {
    title: "Generate Your First Image",
    language: "bash",
    code: `# 1. Get your API key at https://docs.daydream.live
# 2. Generate an image:

curl -X POST https://sdk.daydream.monster/inference \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk_your_key" \\
  -d '{
    "capability": "flux-dev",
    "prompt": "a magical forest with glowing mushrooms, cinematic"
  }'

# Response: { "image_url": "https://..." }`,
  },
  {
    title: "Generate a Video from Image",
    language: "bash",
    code: `# Animate an existing image into a 10-second video:

curl -X POST https://sdk.daydream.monster/inference \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk_your_key" \\
  -d '{
    "capability": "seedance-i2v",
    "prompt": "gentle camera pan, leaves rustling in wind",
    "params": {
      "image_url": "https://your-image-url.jpg",
      "duration": "10",
      "generate_audio": true
    }
  }'`,
  },
  {
    title: "Start a Live AI Stream",
    language: "javascript",
    code: `// 1. Start the stream
const res = await fetch("https://sdk.daydream.monster/stream/start", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer sk_your_key"
  },
  body: JSON.stringify({
    model_id: "scope",
    params: { prompt: "dreamy watercolor landscape", noise_scale: 0.6 }
  })
});
const { stream_id } = await res.json();

// 2. Publish frames (10fps)
setInterval(async () => {
  const frame = captureFrame(); // your JPEG frame
  await fetch(\`https://sdk.daydream.monster/stream/\${stream_id}/publish?seq=\${seq++}\`, {
    method: "POST",
    headers: { "Content-Type": "image/jpeg", "Authorization": "Bearer sk_your_key" },
    body: frame
  });
}, 100);

// 3. Poll output frames
async function pollFrames() {
  while (true) {
    const res = await fetch(\`https://sdk.daydream.monster/stream/\${stream_id}/frame\`);
    if (res.ok) {
      const blob = await res.blob();
      renderToCanvas(blob); // display the AI-transformed frame
    }
    await new Promise(r => setTimeout(r, 33)); // ~30fps polling
  }
}`,
  },
];

// ─── Component ──────────────────────────────────────────────────────────────

function EndpointCard({ ep }: { ep: Endpoint }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
      >
        <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${METHOD_COLORS[ep.method]}`}>
          {ep.method}
        </span>
        <code className="text-xs font-mono text-[#e2e8f0]">{ep.path}</code>
        <span className="text-xs text-white/40 flex-1">{ep.title}</span>
        {ep.tags.map((t) => (
          <span key={t} className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${TAG_COLORS[t]}`}>{t}</span>
        ))}
        <span className="text-white/20 text-xs">{expanded ? "▾" : "▸"}</span>
      </button>

      {expanded && (
        <div className="border-t border-white/[0.04] px-4 py-3 space-y-3">
          <p className="text-xs text-white/60 leading-relaxed">{ep.description}</p>

          {ep.auth && (
            <div className="text-[10px] text-white/40">
              <span className="font-semibold text-amber-400/80">Auth:</span> {ep.auth}
            </div>
          )}

          {ep.body && (
            <div>
              <div className="text-[10px] font-semibold text-white/50 uppercase tracking-wider mb-1">Request Body</div>
              <div className="rounded-lg bg-black/30 overflow-hidden">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-white/[0.04]">
                      <th className="text-left px-3 py-1.5 text-white/40 font-medium">Field</th>
                      <th className="text-left px-3 py-1.5 text-white/40 font-medium">Type</th>
                      <th className="text-left px-3 py-1.5 text-white/40 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ep.body.map((f) => (
                      <tr key={f.field} className="border-b border-white/[0.02]">
                        <td className="px-3 py-1.5 font-mono text-cyan-300/80">
                          {f.field} {f.required && <span className="text-red-400">*</span>}
                        </td>
                        <td className="px-3 py-1.5 text-white/40">{f.type}</td>
                        <td className="px-3 py-1.5 text-white/50">{f.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {ep.example && (
            <div className="space-y-2">
              <div className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">Example</div>
              <pre className="rounded-lg bg-black/40 p-3 text-[10px] leading-relaxed text-emerald-300/80 overflow-x-auto font-mono whitespace-pre-wrap">
                {ep.example.request}
              </pre>
              <pre className="rounded-lg bg-black/40 p-3 text-[10px] leading-relaxed text-amber-300/70 overflow-x-auto font-mono whitespace-pre-wrap">
                {ep.example.response}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DocsPage() {
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const filtered = activeTag ? ENDPOINTS.filter((e) => e.tags.includes(activeTag)) : ENDPOINTS;
  const tags = ["inference", "streaming", "agent", "system"];

  return (
    <div className="min-h-screen bg-[#0a0a0e] text-white">
      {/* Header */}
      <div className="border-b border-white/[0.06] bg-[rgba(10,10,14,0.95)] backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">
              <span className="text-[#6366f1]">Storyboard</span> API
            </h1>
            <p className="text-xs text-white/40 mt-0.5">AI-powered creative tools via REST</p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/" className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/50 hover:bg-white/[0.05] transition-colors">
              ← Back to App
            </a>
            <a href="https://docs.daydream.live" target="_blank" className="rounded-lg bg-[#6366f1]/20 border border-[#6366f1]/30 px-3 py-1.5 text-xs text-[#6366f1] hover:bg-[#6366f1]/30 transition-colors">
              Get API Key
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Hero */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold mb-2">Build with AI Creative Tools</h2>
          <p className="text-sm text-white/50 leading-relaxed max-w-2xl">
            Generate images, videos, audio, and 3D models. Run real-time AI video streams.
            48 AI models available on the Livepeer network — one API, automatic model selection.
          </p>
          <div className="mt-4 flex gap-6 text-xs text-white/30">
            <span>Base URL: <code className="text-cyan-400/70">https://sdk.daydream.monster</code></span>
            <span>Auth: <code className="text-amber-400/70">Bearer sk_...</code></span>
            <span>48 models</span>
          </div>
        </div>

        {/* Quick Start */}
        <div className="mb-10">
          <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-4">Quick Start</h3>
          <div className="grid gap-4">
            {QUICKSTARTS.map((qs) => (
              <div key={qs.title} className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                <div className="px-4 py-2 border-b border-white/[0.04] flex items-center justify-between">
                  <span className="text-xs font-semibold text-white/70">{qs.title}</span>
                  <span className="text-[9px] text-white/30 font-mono">{qs.language}</span>
                </div>
                <pre className="p-4 text-[11px] leading-relaxed text-emerald-300/80 overflow-x-auto font-mono whitespace-pre-wrap">
                  {qs.code}
                </pre>
              </div>
            ))}
          </div>
        </div>

        {/* Filter tabs */}
        <div className="mb-6 flex items-center gap-2">
          <span className="text-xs text-white/40 mr-2">Filter:</span>
          <button
            onClick={() => setActiveTag(null)}
            className={`rounded-lg px-3 py-1 text-[10px] font-medium transition-colors ${!activeTag ? "bg-white/10 text-white" : "text-white/40 hover:bg-white/[0.05]"}`}
          >
            All
          </button>
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => setActiveTag(activeTag === t ? null : t)}
              className={`rounded-lg px-3 py-1 text-[10px] font-medium transition-colors ${activeTag === t ? TAG_COLORS[t] : "text-white/40 hover:bg-white/[0.05]"}`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Endpoints */}
        <div className="space-y-2">
          {filtered.map((ep) => (
            <EndpointCard key={`${ep.method}-${ep.path}`} ep={ep} />
          ))}
        </div>

        {/* Available Models */}
        <div className="mt-10 mb-10">
          <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-4">Popular Models</h3>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            {[
              { name: "flux-dev", type: "Image", desc: "Fast, reliable image generation" },
              { name: "gpt-image", type: "Image", desc: "Best for text, logos, products" },
              { name: "seedream-5-lite", type: "Image", desc: "Photorealistic images" },
              { name: "recraft-v4", type: "Image", desc: "Professional illustration" },
              { name: "seedance-i2v", type: "Video", desc: "Image → 15s cinematic video" },
              { name: "kling-o3-i2v", type: "Video", desc: "4K image → video" },
              { name: "veo-t2v", type: "Video", desc: "Text → video" },
              { name: "chatterbox-tts", type: "Audio", desc: "Text-to-speech + voice clone" },
              { name: "tripo-i3d", type: "3D", desc: "Image → 3D model" },
              { name: "longlive", type: "Stream", desc: "Real-time AI video pipeline" },
            ].map((m) => (
              <div key={m.name} className="flex items-center gap-2 rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2">
                <code className="font-mono text-cyan-300/80">{m.name}</code>
                <span className="text-white/20">·</span>
                <span className="text-white/40">{m.type}</span>
                <span className="text-white/20">·</span>
                <span className="text-white/30 flex-1">{m.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/[0.04] pt-6 pb-10 text-center text-xs text-white/20">
          Powered by <a href="https://livepeer.org" className="text-white/40 hover:text-white/60">Livepeer</a> ·
          <a href="https://docs.daydream.live" className="text-white/40 hover:text-white/60 ml-1">Full Documentation</a> ·
          <a href="https://github.com/livepeer/storyboard" className="text-white/40 hover:text-white/60 ml-1">GitHub</a>
        </div>
      </div>
    </div>
  );
}
