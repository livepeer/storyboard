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
  setAudioUrl: (url: string) => void;
  setBpm: (bpm: number) => void;
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

        if (!ctx.apiKey) {
          return JSON.stringify({ error: "No Daydream API key — open Settings and enter your sk_... key" });
        }

        // Fire-and-forget — don't block the agent on SDK cold start
        fetch(`${ctx.sdkUrl}/stream/start`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            model_id: "scope",
            params: {
              prompt: prompt,
              prompts: prompt,
              pipeline_ids: ["longlive"],
              noise_scale: noise,
              denoising_step_list: [1000, 750, 500, 250],
            },
          }),
        }).then(async (resp) => {
          if (resp.ok) {
            const data = await resp.json();
            if (data.stream_id) {
              console.log("[stage_start] Stream started:", data.stream_id);
              ctx.setStreamId(data.stream_id);
            }
          } else {
            const text = await resp.text().catch(() => "");
            console.error("[stage_start] Failed:", resp.status, text.slice(0, 100));
          }
        }).catch((e) => {
          console.error("[stage_start] SDK unreachable:", e);
        });

        return JSON.stringify({ status: "starting", prompt, message: "Stream starting — warming up GPU (~30-90s). The Live Output will show frames when ready." });
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

        // Load scenes into timeline immediately (non-blocking)
        ctx.setScenes(scenes);
        const total = scenes.reduce((s, sc) => s + sc.duration, 0);

        // Auto-start stream in the background — don't block the agent
        if (!ctx.streamId && ctx.apiKey) {
          const first = scenes[0];
          const presetMap: Record<string, number> = {
            dreamy: 0.7, cinematic: 0.5, anime: 0.6, abstract: 0.95,
            faithful: 0.2, painterly: 0.65, psychedelic: 0.9,
          };
          const noise = presetMap[first.preset] ?? 0.5;

          // Fire-and-forget: start stream in background
          fetch(`${ctx.sdkUrl}/stream/start`, {
            method: "POST",
            headers: headers(),
            body: JSON.stringify({
              model_id: "scope",
              params: {
                prompt: first.prompt,
                prompts: first.prompt,
                pipeline_ids: ["longlive"],
                noise_scale: noise,
                denoising_step_list: [1000, 750, 500, 250],
              },
            }),
          }).then(async (resp) => {
            if (resp.ok) {
              const data = await resp.json();
              if (data.stream_id) {
                console.log("[stage_scene] Stream started:", data.stream_id);
                ctx.setStreamId(data.stream_id);
                // Auto-play once stream is ready
                setTimeout(() => ctx.playPerformance(), 500);
              }
            } else {
              const text = await resp.text().catch(() => "");
              console.error("[stage_scene] Stream start failed:", resp.status, text.slice(0, 100));
            }
          }).catch((e) => {
            console.error("[stage_scene] SDK unreachable:", e);
          });
        } else if (ctx.streamId) {
          // Stream already running — just play
          ctx.playPerformance();
        }

        return JSON.stringify({
          status: "scenes_loaded",
          count: scenes.length,
          total_duration: total,
          message: `${scenes.length} scenes loaded (${total}s). Stream starting in background — warming up GPU (~30-90s).`,
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

    {
      name: "stage_music",
      description: "Generate background music for the performance, then sync visuals to its beat",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Music description (mood, genre, tempo)" },
          bpm: { type: "number", description: "Target BPM if known (60-200)" },
          sync_param: { type: "string", description: "Visual parameter to modulate with the beat (default: noise_scale)" },
          sync_depth: { type: "number", description: "Modulation depth 0.0-1.0 (default: 0.3)" },
        },
        required: ["prompt"],
      },
      async execute(args: Record<string, unknown>) {
        const prompt = args.prompt as string;

        // Generate music via SDK inference
        const resp = await fetch(`${ctx.sdkUrl}/inference`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            model_id: "music",
            params: { prompt, duration: 30 },
          }),
        });

        if (!resp.ok) {
          return JSON.stringify({ error: `Music generation failed: ${resp.status}` });
        }

        const data = await resp.json();
        const audioUrl = data.url || data.audio_url;
        if (!audioUrl) return JSON.stringify({ error: "No audio URL returned" });

        ctx.setAudioUrl(audioUrl);

        // Apply beat sync if stream active
        const targetBpm = args.bpm as number || 120;
        ctx.setBpm(targetBpm);

        if (ctx.streamId) {
          const syncParam = (args.sync_param as string) || "noise_scale";
          const depth = (args.sync_depth as number) ?? 0.3;
          await ctx.controlStream({
            modulation: {
              [syncParam]: {
                enabled: true, shape: "cosine", rate: "bar", depth,
              },
            },
          });
        }

        return JSON.stringify({
          status: "music_loaded",
          audio_url: audioUrl,
          bpm: targetBpm,
          message: `Music generated and loaded. ${ctx.streamId ? "Beat sync active." : "Start a stream to enable beat sync."}`,
        });
      },
    },
  ];
}
