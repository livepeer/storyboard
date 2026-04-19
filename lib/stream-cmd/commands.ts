import { useStreamStore } from "./store";
import { generateStreamPlan } from "./generator";
import type { StreamPlan } from "./types";
import { createTracker } from "@/lib/utils/execution-tracker";
import { useChatStore } from "@/lib/chat/store";
import { useGraphStore } from "./graph-store";
import { GRAPH_TEMPLATES, buildGraph } from "@/lib/stream/scope-graphs";

export const STREAM_CARD_MARKER = "@@stream-plan@@";
export const STREAM_CARD_END = "@@/stream-plan@@";

export function renderStreamEnvelope(plan: StreamPlan): string {
  return `${STREAM_CARD_MARKER}${JSON.stringify(plan)}${STREAM_CARD_END}`;
}

export function isStreamPlanEnvelope(text: string): boolean {
  return text.startsWith(STREAM_CARD_MARKER) && text.includes(STREAM_CARD_END);
}

export function parseStreamPlanEnvelope(text: string): StreamPlan | null {
  if (!isStreamPlanEnvelope(text)) return null;
  try { return JSON.parse(text.slice(STREAM_CARD_MARKER.length, text.indexOf(STREAM_CARD_END))); }
  catch { return null; }
}

export async function handleStreamCommand(args: string): Promise<string> {
  const trimmed = args.trim();
  const [sub, ...rest] = trimmed.split(/\s+/);
  const lower = sub?.toLowerCase() ?? "";

  if (!trimmed) return streamHelp();
  if (lower === "list") return streamList();
  if (lower === "show") return streamShow(rest.join(" ").trim());
  if (lower === "apply") return streamApply(rest.join(" ").trim());
  if (lower === "stop") return streamStop();
  if (lower === "graphs") return streamGraphs(rest.join(" ").trim());
  if (lower === "ptravel") return streamPtravel(rest.join(" ").trim());

  return streamGenerate(trimmed);
}

function streamHelp(): string {
  return [
    "Usage:",
    "  /stream <concept>             — plan a multi-scene live stream",
    "  /stream list                  — recent stream plans",
    "  /stream apply [id]            — start the stream with prompt traveling",
    "  /stream stop                  — stop the active stream",
    "  /stream ptravel <desc> #N,#Ds — prompt-travel on active stream (N scenes, D sec each)",
    "  /stream graphs                — list all graph templates (built-in + saved)",
    "  /stream graphs save <name>    — save the last-used graph with a name",
    "  /stream graphs remove <name>  — delete a saved graph",
    "",
    "Examples:",
    '  /stream ptravel sunset over ocean morphing into aurora borealis #4,#15',
    '  /stream ptravel cyberpunk city to forest #6,#10',
    "",
    "Scenes transition automatically — like prompt traveling through a story.",
  ].join("\n");
}

function streamList(): string {
  const items = useStreamStore.getState().listRecent(10);
  if (items.length === 0) return "No stream plans yet. Try `/stream <your idea>`.";
  return items.map((p) => {
    const icon = p.status === "streaming" ? "🔴" : p.status === "done" ? "✓" : "→";
    return `  ${icon} ${p.id.slice(0, 18)}  ${p.title} (${p.scenes.length} scenes)`;
  }).join("\n");
}

function streamShow(id: string): string {
  if (!id) return "Usage: /stream show <id>";
  const plan = useStreamStore.getState().getById(id);
  if (!plan) return `No stream plan "${id}"`;
  useStreamStore.getState().setPending(plan.id);
  return renderStreamEnvelope(plan);
}

async function streamGenerate(prompt: string): Promise<string> {
  const tracker = createTracker("/stream");
  const result = await generateStreamPlan(prompt);
  if (!result.ok) return `Stream director: ${result.error}`;
  if (result.tokens) tracker.trackLLM(result.tokens.input, result.tokens.output);
  tracker.announce();
  const plan = useStreamStore.getState().addPlan(result.plan);
  return renderStreamEnvelope(plan);
}

async function streamApply(idOrEmpty: string): Promise<string> {
  const tracker = createTracker("/stream apply");
  const store = useStreamStore.getState();
  const plan = idOrEmpty ? store.getById(idOrEmpty) : store.getPending();
  if (!plan) return idOrEmpty ? `No stream plan "${idOrEmpty}"` : "No pending plan. Try /stream <idea> first.";

  const say = (text: string) => useChatStore.getState().addMessage(text, "system");

  // 1. Start the stream with the first scene's prompt
  try {
    const { listTools } = await import("@/lib/tools/registry");
    const tools = listTools();
    const scopeStart = tools.find((t) => t.name === "scope_start");
    if (!scopeStart) return "scope_start tool not registered.";

    const firstScene = plan.scenes[0];
    say(`Starting stream: "${plan.title}" — Scene 1: ${firstScene.title}`);
    tracker.trackTool("scope_start", true);

    const startResult = await scopeStart.execute({
      prompt: `${firstScene.prompt}, ${plan.style}`,
      graph_template: plan.graphTemplate,
      preset: firstScene.preset,
      noise_scale: firstScene.noiseScale,
    });

    if (!startResult.success) {
      return `Stream start failed: ${startResult.error}`;
    }

    // Get stream ID from the result
    const streamData = startResult.data as Record<string, unknown> | undefined;
    const streamId = (streamData?.stream_id || streamData?.message?.toString().match(/template=([^,]+)/)?.[1] || "") as string;

    store.markStreaming(plan.id, streamId);
    say(`⏳ Stream starting — waiting for first frame (cold start can take 1-2 min)…`);

    // 2. Wait for actual playback to begin before scheduling transitions.
    // The fal Scope runner cold-starts in 1-2 minutes — scheduling
    // scene transitions immediately would fire them before the first
    // frame arrives, wasting all the prompt traveling.
    const { getActiveSession } = await import("@/lib/stream/session");
    const POLL_INTERVAL = 2000;
    const MAX_WAIT = 300_000; // 5 min max wait
    const waitStart = Date.now();

    await new Promise<void>((resolve) => {
      const poll = setInterval(() => {
        const session = getActiveSession();
        const elapsed = Date.now() - waitStart;
        if (session && session.totalRecv > 0) {
          clearInterval(poll);
          resolve();
        } else if (elapsed > MAX_WAIT || !session || session.stopped) {
          clearInterval(poll);
          resolve(); // proceed anyway — timers will fire but stream may be dead
        }
      }, POLL_INTERVAL);
    });

    // Check if stream is still alive
    const sessionCheck = getActiveSession();
    if (!sessionCheck || sessionCheck.stopped) {
      store.markDone(plan.id);
      return "Stream failed to start — no frames received. Check your webcam/source.";
    }

    say(`🔴 Playback started! Scene 1: ${firstScene.title} (${firstScene.duration}s)`);

    // 3. NOW schedule prompt transitions — clock starts from first frame
    let sceneElapsed = 0;
    for (let i = 1; i < plan.scenes.length; i++) {
      const prevDuration = plan.scenes[i - 1].duration;
      sceneElapsed += prevDuration;
      const scene = plan.scenes[i];
      const sceneIdx = i;

      setTimeout(async () => {
        try {
          const scopeControl = listTools().find((t) => t.name === "scope_control");
          if (!scopeControl) return;

          say(`🔄 Transitioning to Scene ${sceneIdx + 1}: ${scene.title}`);
          await scopeControl.execute({
            prompt: `${scene.prompt}, ${plan.style}`,
            preset: scene.preset,
            noise_scale: scene.noiseScale,
          });
          say(`▶ Scene ${sceneIdx + 1}: ${scene.title} (${scene.duration}s)`);
          tracker.trackTool("scope_control", true);
        } catch (e) {
          say(`Scene ${sceneIdx + 1} transition failed: ${(e as Error).message}`);
        }
      }, sceneElapsed * 1000);
    }

    // 4. Schedule stream end
    const totalDuration = plan.scenes.reduce((sum, s) => sum + s.duration, 0);
    setTimeout(async () => {
      try {
        const scopeStop = listTools().find((t) => t.name === "scope_stop");
        if (scopeStop) await scopeStop.execute({});
        store.markDone(plan.id);
        say(`✓ Stream complete — "${plan.title}" finished (${totalDuration}s)`);
        tracker.announce();
      } catch { /* non-fatal */ }
    }, totalDuration * 1000);

    const timeline = plan.scenes.map((s, i) => {
      const start = plan.scenes.slice(0, i).reduce((sum, x) => sum + x.duration, 0);
      return `  ${i + 1}. [${start}s] ${s.title} — ${s.preset} (${s.duration}s)`;
    }).join("\n");

    return `🔴 Stream "${plan.title}" is live!\n\nTimeline:\n${timeline}\n\nTotal: ${totalDuration}s. Scenes transition automatically.`;

  } catch (e) {
    return `Stream failed: ${e instanceof Error ? e.message : "unknown"}`;
  }
}

function streamGraphs(args: string): string {
  const [sub, ...rest] = args.trim().split(/\s+/);
  const lowerSub = sub?.toLowerCase() ?? "";

  // /stream graphs save <name> [description]
  if (lowerSub === "save") {
    const name = rest[0];
    if (!name) return "Usage: /stream graphs save <name> [description]";
    // Find the most recent stream plan's graph
    const recentPlan = useStreamStore.getState().listRecent(1)[0];
    if (!recentPlan) return "No recent stream plan to save the graph from. Run /stream <concept> first.";
    const template = GRAPH_TEMPLATES.find((t) => t.id === recentPlan.graphTemplate);
    if (!template) return `Graph template "${recentPlan.graphTemplate}" not found.`;
    const graph = template.build();
    const desc = rest.slice(1).join(" ") || template.description;
    const saved = useGraphStore.getState().saveGraph(name, desc, graph);
    return `Saved graph "${saved.name}" — ${desc}`;
  }

  // /stream graphs remove <name>
  if (lowerSub === "remove" || lowerSub === "delete") {
    const name = rest.join(" ");
    if (!name) return "Usage: /stream graphs remove <name>";
    const found = useGraphStore.getState().getByName(name);
    if (!found) return `No saved graph "${name}".`;
    useGraphStore.getState().removeGraph(found.id);
    return `Removed graph "${found.name}".`;
  }

  // /stream graphs — list all
  const all = useGraphStore.getState().listAll();
  if (all.length === 0) return "No graph templates available.";

  const lines = ["Stream Graph Templates:"];
  const builtIn = all.filter((g) => g.builtIn);
  const user = all.filter((g) => !g.builtIn);

  lines.push("\n── Built-in ──");
  for (const g of builtIn) {
    lines.push(`  ${g.name.padEnd(18)} ${g.description}`);
  }
  if (user.length > 0) {
    lines.push("\n── Saved ──");
    for (const g of user) {
      lines.push(`  ${g.name.padEnd(18)} ${g.description}`);
    }
  }
  lines.push("");
  lines.push("  /stream graphs save <name>    — save from last stream plan");
  lines.push("  /stream graphs remove <name>  — delete a saved graph");
  return lines.join("\n");
}

/**
 * /stream ptravel <description> #<scenes>,#<duration>
 * Generate scenes from a description and apply as prompt traveling
 * on the currently active stream. Drives the stream from the chat.
 *
 * Examples:
 *   /stream ptravel sunset over ocean morphing into northern lights #4,#15
 *   /stream ptravel a walk through Tokyo streets at night #6,#10
 */
async function streamPtravel(args: string): Promise<string> {
  if (!args.trim()) {
    return [
      "Usage: /stream ptravel <description> #<scenes>,#<duration-per-scene>",
      "",
      "Examples:",
      "  /stream ptravel sunset morphing into aurora #4,#15   (4 scenes, 15s each)",
      "  /stream ptravel cyberpunk city to forest #6,#10      (6 scenes, 10s each)",
      "",
      "Requires an active stream — start one first with /stream <concept> then /stream apply",
    ].join("\n");
  }

  // Parse #N,#D from the end of the args
  const hashMatch = args.match(/#(\d+)\s*,\s*#(\d+)\s*$/);
  const numScenes = hashMatch ? Math.max(2, Math.min(10, parseInt(hashMatch[1], 10))) : 4;
  const sceneDuration = hashMatch ? Math.max(5, Math.min(60, parseInt(hashMatch[2], 10))) : 15;
  const description = args.replace(/#\d+\s*,\s*#\d+\s*$/, "").trim();

  if (description.length < 3) return "Give me a description for the prompt travel.";

  // Check for active stream
  const { getActiveSession } = await import("@/lib/stream/session");
  const session = getActiveSession();
  if (!session || session.stopped) {
    return "No active stream. Start one first:\n  /stream <concept>\n  /stream apply";
  }

  const say = (text: string) => useChatStore.getState().addMessage(text, "system");
  say(`Generating ${numScenes} prompt-travel scenes (${sceneDuration}s each)…`);

  // Generate scene prompts via Gemini
  const PTRAVEL_PROMPT = `Generate ${numScenes} scene prompts for a prompt-traveling live stream. The stream should smoothly evolve through these scenes over time.

Concept: "${description}"

Rules:
- Exactly ${numScenes} scenes, each runs ${sceneDuration} seconds
- Each prompt should flow naturally from the previous — smooth visual transitions
- Prompts under 40 words each, vivid and visual
- Pick a preset per scene: dreamy(0.7), cinematic(0.5), anime(0.6), abstract(0.95), faithful(0.2), painterly(0.65), psychedelic(0.9)

Output STRICT JSON only. No code fences.
{"scenes": [{"index": 1, "title": "short title", "prompt": "scene prompt", "preset": "cinematic", "noise_scale": 0.5}]}`;

  try {
    const resp = await fetch("/api/agent/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: PTRAVEL_PROMPT }] }],
      }),
    });
    if (!resp.ok) return `Scene generation failed: ${resp.status}`;

    const payload = await resp.json();
    const text = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
      .candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";

    const { extractJsonObject } = await import("@/lib/story/generator");
    const parsed = extractJsonObject(text) as Record<string, unknown> | null;
    if (!parsed?.scenes || !Array.isArray(parsed.scenes)) return "Scene generation returned invalid JSON.";

    const scenes = (parsed.scenes as Array<Record<string, unknown>>)
      .filter((s) => typeof s.prompt === "string" && (s.prompt as string).length >= 5)
      .map((s, i) => ({
        title: (s.title as string) || `Scene ${i + 1}`,
        prompt: (s.prompt as string).slice(0, 200),
        preset: (s.preset as string) || "cinematic",
        noiseScale: typeof s.noise_scale === "number" ? s.noise_scale : undefined,
      }));

    if (scenes.length === 0) return "No usable scenes generated.";

    // Apply first scene immediately
    const { listTools } = await import("@/lib/tools/registry");
    const scopeControl = listTools().find((t) => t.name === "scope_control");
    if (!scopeControl) return "scope_control tool not registered.";

    say(`▶ Prompt travel: ${scenes.length} scenes × ${sceneDuration}s — starting now`);

    await scopeControl.execute({
      prompt: scenes[0].prompt,
      preset: scenes[0].preset,
      noise_scale: scenes[0].noiseScale,
    });
    say(`▶ Scene 1/${scenes.length}: ${scenes[0].title}`);

    // Schedule remaining scenes
    for (let i = 1; i < scenes.length; i++) {
      const scene = scenes[i];
      const delay = i * sceneDuration;
      const sceneIdx = i;
      setTimeout(async () => {
        try {
          say(`🔄 Scene ${sceneIdx + 1}/${scenes.length}: ${scene.title}`);
          await scopeControl.execute({
            prompt: scene.prompt,
            preset: scene.preset,
            noise_scale: scene.noiseScale,
          });
        } catch (e) {
          say(`Scene ${sceneIdx + 1} failed: ${(e as Error).message}`);
        }
      }, delay * 1000);
    }

    const totalDuration = scenes.length * sceneDuration;
    const timeline = scenes.map((s, i) => {
      const start = i * sceneDuration;
      return `  ${i + 1}. [${start}s] ${s.title} — ${s.preset}`;
    }).join("\n");

    return `🎬 Prompt traveling: "${description}"\n\n${timeline}\n\nTotal: ${totalDuration}s. Scenes transition every ${sceneDuration}s.`;
  } catch (e) {
    return `Prompt travel failed: ${e instanceof Error ? e.message : "unknown"}`;
  }
}

async function streamStop(): Promise<string> {
  try {
    const { listTools } = await import("@/lib/tools/registry");
    const scopeStop = listTools().find((t) => t.name === "scope_stop");
    if (scopeStop) await scopeStop.execute({});
    const store = useStreamStore.getState();
    const active = store.plans.find((p) => p.status === "streaming");
    if (active) store.markDone(active.id);
    return "Stream stopped.";
  } catch (e) {
    return `Stop failed: ${(e as Error).message}`;
  }
}

// Natural-language apply
const APPLY_RE = [
  /^\s*(apply|yes|do it|go|start|stream it|let'?s go|start streaming)\s*[.!]*\s*$/i,
];

export function isStreamApplyIntent(text: string): boolean {
  if (text.length > 60) return false;
  if (!useStreamStore.getState().getPending()) return false;
  return APPLY_RE.some((re) => re.test(text.trim()));
}

export async function applyPendingStream(): Promise<string> {
  return streamApply("");
}
