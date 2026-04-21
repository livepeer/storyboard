/**
 * 6 agent tools for Creative Stage — all route through SDK /stream/* endpoints.
 */

import type { ScopeParams } from "@livepeer/scope-player";

// Default text-only graph (no video input needed)
function textOnlyGraph() {
  return {
    nodes: [
      { id: "longlive", type: "pipeline", pipeline_id: "longlive" },
      { id: "output", type: "sink" },
    ],
    edges: [
      { from: "longlive", from_port: "video", to_node: "output", to_port: "video", kind: "stream" },
    ],
  };
}

export interface StageToolContext {
  sdkUrl: string;
  apiKey: string;
  streamId: string | null;
  setStreamId: (id: string | null) => void;
  controlStream: (params: Partial<ScopeParams>) => Promise<void>;
  setScenes: (scenes: Array<{ title: string; prompt: string; preset: string; duration: number }>) => void;
  playPerformance: () => void;
  stopPerformance: () => void;
}

export function createStageTools(ctx: StageToolContext) {
  const headers = () => ({
    "Content-Type": "application/json",
    ...(ctx.apiKey ? { Authorization: `Bearer ${ctx.apiKey}` } : {}),
  });

  return [
    {
      name: "stage_start",
      description: "Start a live AI video stream from a scene description",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Scene description" },
          preset: { type: "string", description: "Visual preset: dreamy, cinematic, anime, abstract, faithful, painterly, psychedelic" },
        },
        required: ["prompt"],
      },
      async execute(args: Record<string, unknown>) {
        const prompt = args.prompt as string;
        const presetMap: Record<string, number> = {
          dreamy: 0.7, cinematic: 0.5, anime: 0.6, abstract: 0.95,
          faithful: 0.2, painterly: 0.65, psychedelic: 0.9,
        };
        const noise = presetMap[(args.preset as string) || "cinematic"] ?? 0.5;

        const resp = await fetch(`${ctx.sdkUrl}/stream/start`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            model_id: "scope",
            params: {
              prompts: prompt,
              graph: textOnlyGraph(),
              pipeline_ids: ["longlive"],
              noise_scale: noise,
              denoising_step_list: [1000, 750, 500, 250],
            },
          }),
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          return JSON.stringify({ error: `Start failed: ${resp.status} ${text.slice(0, 100)}` });
        }
        const data = await resp.json();
        ctx.setStreamId(data.stream_id);
        return JSON.stringify({ stream_id: data.stream_id, status: "started", prompt });
      },
    },

    {
      name: "stage_prompt",
      description: "Update the live stream prompt — morphs seamlessly, no restart",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "New scene description" },
          noise_scale: { type: "number", description: "Creativity 0.0-1.0" },
        },
        required: ["prompt"],
      },
      async execute(args: Record<string, unknown>) {
        if (!ctx.streamId) return JSON.stringify({ error: "No active stream" });
        const params: Partial<ScopeParams> = { prompts: args.prompt as string };
        if (args.noise_scale !== undefined) params.noise_scale = args.noise_scale as number;
        await ctx.controlStream(params);
        return JSON.stringify({ status: "updated", prompt: args.prompt });
      },
    },

    {
      name: "stage_reference",
      description: "Add a visual reference image to influence the stream colors and structure",
      parameters: {
        type: "object",
        properties: {
          image_url: { type: "string", description: "Public URL of reference image" },
          scale: { type: "number", description: "Influence strength 0.0-2.0 (default 0.8)" },
        },
        required: ["image_url"],
      },
      async execute(args: Record<string, unknown>) {
        if (!ctx.streamId) return JSON.stringify({ error: "No active stream" });
        await ctx.controlStream({
          vace_enabled: true,
          vace_ref_images: [args.image_url as string],
          vace_context_scale: (args.scale as number) ?? 0.8,
        });
        return JSON.stringify({ status: "reference_applied" });
      },
    },

    {
      name: "stage_style",
      description: "Load a visual style (LoRA) into the live pipeline",
      parameters: {
        type: "object",
        properties: {
          lora_path: { type: "string", description: "LoRA file path or URL" },
          scale: { type: "number", description: "Style strength -10 to 10 (default 0.6)" },
        },
        required: ["lora_path"],
      },
      async execute(args: Record<string, unknown>) {
        if (!ctx.streamId) return JSON.stringify({ error: "No active stream" });
        await ctx.controlStream({
          lora_scales: [{ path: args.lora_path as string, scale: (args.scale as number) ?? 0.6 }] as unknown as undefined,
        } as Partial<ScopeParams>);
        return JSON.stringify({ status: "style_loaded" });
      },
    },

    {
      name: "stage_sync",
      description: "Sync a visual parameter to the music beat",
      parameters: {
        type: "object",
        properties: {
          param: { type: "string", description: "Parameter to modulate (default: noise_scale)" },
          wave: { type: "string", description: "Wave shape: sine, cosine, triangle, saw, square, exp_decay" },
          rate: { type: "string", description: "Sync rate: half_beat, beat, 2_beat, bar, 2_bar, 4_bar" },
          depth: { type: "number", description: "Modulation depth 0.0-1.0" },
        },
      },
      async execute(args: Record<string, unknown>) {
        if (!ctx.streamId) return JSON.stringify({ error: "No active stream" });
        await ctx.controlStream({
          modulation: {
            [args.param as string || "noise_scale"]: {
              enabled: true,
              shape: (args.wave as string) || "cosine",
              rate: (args.rate as string) || "bar",
              depth: (args.depth as number) ?? 0.3,
            },
          },
        });
        return JSON.stringify({ status: "modulation_set" });
      },
    },

    {
      name: "stage_record",
      description: "Start or stop recording the live stream",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["start", "stop"], description: "Start or stop recording" },
        },
        required: ["action"],
      },
      async execute(args: Record<string, unknown>) {
        if (!ctx.streamId) return JSON.stringify({ error: "No active stream" });
        await ctx.controlStream({ recording: args.action === "start" });
        return JSON.stringify({ status: args.action === "start" ? "recording" : "stopped" });
      },
    },

    {
      name: "stage_scene",
      description: "Create a multi-scene performance timeline. Each scene has a title, prompt, visual preset, and duration. The stream will auto-transition through scenes using prompt traveling.",
      parameters: {
        type: "object",
        properties: {
          scenes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "Short scene title" },
                prompt: { type: "string", description: "Visual description for this scene" },
                preset: { type: "string", description: "Visual preset: dreamy, cinematic, anime, abstract, faithful, painterly, psychedelic" },
                duration: { type: "number", description: "Scene duration in seconds (10-120)" },
              },
              required: ["title", "prompt", "preset", "duration"],
            },
            description: "Array of scenes in performance order",
          },
        },
        required: ["scenes"],
      },
      async execute(args: Record<string, unknown>) {
        const scenes = args.scenes as Array<{ title: string; prompt: string; preset: string; duration: number }>;
        if (!scenes || scenes.length === 0) return JSON.stringify({ error: "No scenes provided" });
        ctx.setScenes(scenes);
        const total = scenes.reduce((s, sc) => s + sc.duration, 0);
        return JSON.stringify({
          status: "scenes_loaded",
          count: scenes.length,
          total_duration: total,
          message: `${scenes.length} scenes loaded (${total}s). Use stage_perform to start.`,
        });
      },
    },

    {
      name: "stage_perform",
      description: "Start or stop the performance — auto-plays through all loaded scenes with prompt traveling transitions",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["play", "stop"], description: "Play or stop the performance" },
        },
        required: ["action"],
      },
      async execute(args: Record<string, unknown>) {
        if (args.action === "stop") {
          ctx.stopPerformance();
          return JSON.stringify({ status: "stopped" });
        }
        if (!ctx.streamId) return JSON.stringify({ error: "Start a stream first with stage_start, then play the performance" });
        ctx.playPerformance();
        return JSON.stringify({ status: "playing" });
      },
    },
  ];
}
