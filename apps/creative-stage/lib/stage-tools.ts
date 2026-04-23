/**
 * 6 agent tools for Creative Stage — all route through SDK /stream/* endpoints.
 */

import type { ScopeParams } from "@livepeer/scope-player";
import { createPipelineRegistry } from "@livepeer/creative-kit";

/** Shared pipeline registry — single source of truth for recipes across all apps. */
const registry = createPipelineRegistry();

interface ResolvedRecipe {
  pipeline: string;
  kv_cache: number;
  denoising: number[];
  extras?: Record<string, unknown>;
}

function resolveStageRecipe(recipeId?: string): ResolvedRecipe {
  const recipe = recipeId ? registry.getRecipe(recipeId) : undefined;
  if (recipe) {
    const d = recipe.defaults as Record<string, unknown>;
    const { kv_cache_attention_bias, denoising_step_list, ...extras } = d;
    return {
      pipeline: recipe.pipeline,
      kv_cache: (kv_cache_attention_bias as number) ?? 0.5,
      denoising: (denoising_step_list as number[]) ?? [1000, 750, 500, 250],
      extras: Object.keys(extras).length > 0 ? extras : undefined,
    };
  }
  return { pipeline: "longlive", kv_cache: 0.5, denoising: [1000, 750, 500, 250] };
}

/** Build a source→pipeline→sink graph. The source node creates the trickle
 *  input channel so published frames actually reach the pipeline. Without
 *  this graph, Scope runs in text-only mode and ignores published frames. */
function buildStreamGraph(pipelineId = "longlive") {
  return {
    nodes: [
      { id: "input", type: "source", source_mode: "video" },
      { id: pipelineId, type: "pipeline", pipeline_id: pipelineId },
      { id: "output", type: "sink" },
    ],
    edges: [
      { from: "input", from_port: "video", to_node: pipelineId, to_port: "video", kind: "stream" },
      { from: pipelineId, from_port: "video", to_node: "output", to_port: "video", kind: "stream" },
    ],
  };
}

/** Enrich a short music description into a detailed prompt for better generation */
function enrichMusicPrompt(desc: string): string {
  const lower = desc.toLowerCase();
  const parts: string[] = [desc];

  // Add instrument hints if missing
  if (!lower.match(/piano|guitar|drum|synth|violin|bass|orchestra|flute|saxophone/)) {
    if (lower.includes("calm") || lower.includes("peaceful") || lower.includes("serene")) {
      parts.push("soft piano and ambient pads");
    } else if (lower.includes("epic") || lower.includes("cinematic")) {
      parts.push("orchestral strings and percussion");
    } else if (lower.includes("electronic") || lower.includes("edm") || lower.includes("techno")) {
      parts.push("synthesizers and electronic drums");
    } else if (lower.includes("jazz") || lower.includes("lounge")) {
      parts.push("jazz piano and smooth saxophone");
    } else {
      parts.push("melodic instrumental arrangement");
    }
  }

  // Add quality descriptors
  if (!lower.includes("quality") && !lower.includes("professional")) {
    parts.push("high quality production, studio mastered");
  }

  return parts.join(", ");
}

/** Guess BPM from mood description */
function guessBpm(desc: string): number {
  const lower = desc.toLowerCase();
  if (lower.match(/slow|calm|peaceful|serene|ambient|chill|relaxed|gentle/)) return 75;
  if (lower.match(/moderate|medium|steady|walking/)) return 100;
  if (lower.match(/upbeat|happy|bright|cheerful|playful/)) return 120;
  if (lower.match(/fast|energetic|intense|driving|dance|edm/)) return 140;
  if (lower.match(/very fast|frantic|extreme|hardcore/)) return 170;
  return 110; // default moderate
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
  playWhenReady: () => void;
  setAudioUrl: (url: string) => void;
  setBpm: (bpm: number) => void;
  setMusicPrompt?: (prompt: string) => void;
  /** Set the publish source for the live stream (image/video replaces blank frames) */
  setStreamSource?: (type: "blank" | "image" | "video", url?: string, label?: string) => void;
  /** Add an artifact card to the canvas */
  addArtifact: (artifact: { type: string; title: string; url: string; refId: string; x?: number; y?: number }) => void;
  /** Attach a VACE reference image to a scene by index */
  setSceneVaceRef: (idx: number, url: string) => void;
  /** Get current scene count */
  getSceneCount?: () => number;
  /** Save current scene set as a tab */
  saveSceneSet: () => void;
  /** Notify user via chat */
  say: (msg: string) => void;
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
          recipe: { type: "string", description: "Stream recipe: classic, ltx-responsive, ltx-smooth, fast-preview, krea-hq, memflow-consistent. Default: classic" },
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
        const recipe = resolveStageRecipe(args.recipe as string | undefined);

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
              pipeline_ids: [recipe.pipeline],
              graph: buildStreamGraph(recipe.pipeline),
              noise_scale: noise,
              kv_cache_attention_bias: recipe.kv_cache,
              denoising_step_list: recipe.denoising,
              ...recipe.extras,
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
      description: "Create a LIVE STREAM with multi-scene timeline. Use for ANY request containing 'stream', 'live', or 'real-time'. If a stream is already running, the previous one is saved and can be switched back to via stage_switch.",
      parameters: {
        type: "object",
        properties: {
          recipe: {
            type: "string",
            description: "Stream recipe: classic, ltx-responsive, ltx-smooth, fast-preview, krea-hq, memflow-consistent. Controls pipeline and quality. Default: classic",
          },
          style_prefix: {
            type: "string",
            description: "A style prefix prepended to EVERY scene prompt for visual consistency. Include: camera angle, lighting mood, color grading, art style.",
          },
          scenes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "Short scene title" },
                prompt: { type: "string", description: "20-35 words describing THIS scene only (style_prefix handles the rest). Focus on: subject, action, unique colors, unique textures. Share visual anchors with neighboring scenes." },
                preset: { type: "string", description: "cinematic=stable(0.5), abstract=dramatic morph(0.95), psychedelic=extreme morph(0.9), dreamy=soft(0.7), faithful=frozen(0.2), painterly=artistic(0.65)" },
                duration: { type: "number", description: "25-40s for beauty shots, 10-15s for morph bridges" },
              },
              required: ["title", "prompt", "preset", "duration"],
            },
            description: "PATTERN: alternate stable→bridge→stable. Bridge scenes describe the MID-TRANSFORMATION between two subjects. Every scene inherits style_prefix for consistency.",
          },
        },
        required: ["scenes"],
      },
      async execute(args: Record<string, unknown>) {
        const rawScenes = args.scenes as Array<{ title: string; prompt: string; preset: string; duration: number }>;
        if (!rawScenes || rawScenes.length === 0) return JSON.stringify({ error: "No scenes provided" });

        const stylePrefix = (args.style_prefix as string) || "";
        const recipe = resolveStageRecipe(args.recipe as string | undefined);
        const scenes = rawScenes.map((s) => ({
          ...s,
          prompt: stylePrefix ? `${stylePrefix}, ${s.prompt}` : s.prompt,
        }));

        // Save current scenes as a tab (if any exist)
        if ((ctx.getSceneCount?.() ?? 0) > 0) {
          ctx.saveSceneSet();
          ctx.stopPerformance();
        }

        // Load new scenes — creates a new tab automatically
        ctx.setScenes(scenes);
        const total = scenes.reduce((s, sc) => s + sc.duration, 0);

        // Start stream if none running (reuse existing stream for new scenes)
        if (!ctx.streamId && ctx.apiKey) {
          const first = scenes[0];
          const presetMap: Record<string, number> = {
            dreamy: 0.7, cinematic: 0.5, anime: 0.6, abstract: 0.95,
            faithful: 0.2, painterly: 0.65, psychedelic: 0.9,
          };
          const noise = presetMap[first.preset] ?? 0.5;

          fetch(`${ctx.sdkUrl}/stream/start`, {
            method: "POST",
            headers: headers(),
            body: JSON.stringify({
              model_id: "scope",
              params: {
                prompt: first.prompt,
                prompts: first.prompt,
                pipeline_ids: [recipe.pipeline],
                graph: buildStreamGraph(recipe.pipeline),
                noise_scale: noise,
                kv_cache_attention_bias: recipe.kv_cache,
                denoising_step_list: recipe.denoising,
                ...recipe.extras,
              },
            }),
          }).then(async (resp) => {
            if (resp.ok) {
              const data = await resp.json();
              if (data.stream_id) {
                ctx.setStreamId(data.stream_id);
                ctx.playWhenReady();
              }
            } else {
              const text = await resp.text().catch(() => "");
              ctx.say(`Stream failed (${resp.status}): ${text.slice(0, 80)}`);
            }
          }).catch((e) => ctx.say(`Stream error: ${(e as Error).message}`));
        } else if (ctx.streamId) {
          // Stream already running — just play the new scenes on it
          ctx.playPerformance();
        }

        return JSON.stringify({
          status: "scenes_loaded",
          count: scenes.length,
          total_duration: total,
          message: `${scenes.length} scenes loaded (${total}s). ${ctx.streamId ? "Playing on active stream." : "Stream starting…"}`,
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
        if (!ctx.streamId) {
          // Stream might be starting in background — queue play for when ready
          ctx.playWhenReady();
          return JSON.stringify({ status: "queued", message: "Performance queued — will start when stream is ready." });
        }
        ctx.playPerformance();
        return JSON.stringify({ status: "playing" });
      },
    },

    // stage_switch removed — switching is now purely UI via scene set tabs

    {
      name: "stage_music",
      description: "Generate background music for the performance. Accepts a mood/style description and auto-generates lyrics structure for best results.",
      parameters: {
        type: "object",
        properties: {
          description: { type: "string", description: "Music mood, genre, tempo, and feel. E.g. 'happy upbeat electronic, 120bpm, energetic and playful' or 'calm ambient piano, slow tempo, peaceful and serene'" },
          lyrics: { type: "string", description: "Optional song structure/lyrics. Auto-generated if omitted." },
        },
        required: ["description"],
      },
      async execute(args: Record<string, unknown>) {
        const description = args.description as string;

        // Enrich the prompt for better music generation
        const enrichedPrompt = enrichMusicPrompt(description);

        // Auto-generate lyrics structure if not provided
        const lyrics = (args.lyrics as string)
          || `[Intro]\n[Verse]\n${enrichedPrompt}\n[Chorus]\n${enrichedPrompt}\n[Outro]`;

        // minimax-music/v2 requires both prompt AND lyrics_prompt
        let resp: Response;
        try {
          resp = await fetch(`${ctx.sdkUrl}/inference`, {
            method: "POST",
            headers: headers(),
            body: JSON.stringify({
              capability: "music",
              prompt: enrichedPrompt,
              params: {
                prompt: enrichedPrompt,
                lyrics_prompt: lyrics,
              },
            }),
          });
        } catch (e) {
          return JSON.stringify({ error: `SDK unreachable: ${(e as Error).message}` });
        }

        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          return JSON.stringify({ error: `Music generation failed (${resp.status}): ${text.slice(0, 150)}` });
        }

        const data = await resp.json();
        // Extract audio URL from various response shapes
        const audioUrl = (data.audio_url as string)
          ?? ((data.data as Record<string, unknown>)?.audio ? ((data.data as Record<string, unknown>).audio as { url: string })?.url : undefined)
          ?? (data.url as string);

        if (!audioUrl) {
          return JSON.stringify({ error: "No audio URL in response", details: JSON.stringify(data).slice(0, 200) });
        }

        ctx.setAudioUrl(audioUrl);
        ctx.setMusicPrompt?.(description);

        // Estimate BPM from description
        const bpmMatch = description.match(/(\d{2,3})\s*bpm/i);
        const estimatedBpm = bpmMatch ? parseInt(bpmMatch[1]) : guessBpm(description);
        ctx.setBpm(estimatedBpm);

        // Auto-enable beat sync if streaming
        if (ctx.streamId) {
          await ctx.controlStream({
            modulation: {
              noise_scale: { enabled: true, shape: "cosine", rate: "bar", depth: 0.3 },
            },
          });
        }

        return JSON.stringify({
          status: "music_generated",
          audio_url: audioUrl,
          bpm: estimatedBpm,
          message: `Music generated (${estimatedBpm} BPM). ${ctx.streamId ? "Beat sync enabled on noise_scale." : "Start a stream to enable beat sync."}`,
        });
      },
    },

    {
      name: "stage_cinematic",
      description: "ONLY use when user explicitly says 'cinematic' or 'high quality video'. Generates key frame images + transition videos. Do NOT use for 'live stream' or 'stream' requests — those MUST use stage_scene instead.",
      parameters: {
        type: "object",
        properties: {
          scenes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "Scene title" },
                prompt: { type: "string", description: "30-50 words. Same camera angle, same subject position, same framing in every scene." },
                duration: { type: "number", description: "Video transition duration: 5 or 8 seconds" },
              },
              required: ["title", "prompt", "duration"],
            },
            description: "Scenes in order. Same camera, same composition, same framing across ALL scenes.",
          },
          style_prefix: { type: "string", description: "Prepended to every prompt. E.g. 'cinematic low-angle tracking shot, motion blur, 4K, photorealistic'" },
        },
        required: ["scenes"],
      },
      async execute(args: Record<string, unknown>) {
        const scenes = args.scenes as Array<{ title: string; prompt: string; duration: number }>;
        const stylePrefix = (args.style_prefix as string) || "";
        if (!scenes || scenes.length < 2) return JSON.stringify({ error: "Need at least 2 scenes" });
        if (!ctx.apiKey) return JSON.stringify({ error: "No Daydream API key" });

        const imageUrls: string[] = [];
        const videoUrls: string[] = [];
        let cardX = 900;

        // ── Step 1: Generate key frame images ──
        ctx.say(`Generating ${scenes.length} key frames via flux-dev…`);

        for (let i = 0; i < scenes.length; i++) {
          const scene = scenes[i];
          const fullPrompt = stylePrefix ? `${stylePrefix}, ${scene.prompt}` : scene.prompt;
          ctx.say(`Key frame ${i + 1}/${scenes.length}: ${scene.title}…`);

          try {
            const resp = await fetch(`${ctx.sdkUrl}/inference`, {
              method: "POST",
              headers: headers(),
              body: JSON.stringify({
                capability: "flux-dev",
                prompt: fullPrompt,
                params: { width: 1280, height: 720, num_inference_steps: 28 },
              }),
            });

            if (resp.ok) {
              const data = await resp.json();
              console.log(`[cinematic] Key frame ${i + 1} response keys:`, Object.keys(data), data.data ? Object.keys(data.data as object) : "no .data");
              const url = extractUrl(data);
              if (url) {
                imageUrls.push(url);
                ctx.addArtifact({ type: "image", title: scene.title, url, refId: `kf-${i}`, x: cardX, y: 50 });
                cardX += 220;
                ctx.say(`Key frame ${i + 1} done`);
              } else {
                ctx.say(`Key frame ${i + 1} returned no URL — response: ${JSON.stringify(data).slice(0, 150)}`);
              }
            } else {
              const errText = await resp.text().catch(() => "");
              ctx.say(`Key frame ${i + 1} failed (${resp.status}): ${errText.slice(0, 100)}`);
            }
          } catch (e) {
            ctx.say(`Key frame ${i + 1} error: ${(e as Error).message}`);
          }
        }

        if (imageUrls.length < 2) {
          return JSON.stringify({ error: `Only ${imageUrls.length} key frames generated — need at least 2` });
        }

        // ── Step 2: Generate transition videos via veo-transition ──
        // veo-transition takes FIRST frame + LAST frame → generates a smooth morph video.
        // This is dramatically better than i2v models for transformations because it
        // understands BOTH endpoints and generates the in-between motion.
        // Fallback chain: veo-transition → pixverse-transition → seedance-i2v
        ctx.say(`Creating ${imageUrls.length - 1} morph videos via veo-transition…`);

        for (let i = 0; i < imageUrls.length - 1; i++) {
          const fromUrl = imageUrls[i];
          const toUrl = imageUrls[i + 1];
          const fromScene = scenes[i];
          const toScene = scenes[i + 1];
          const transPrompt = stylePrefix
            ? `${stylePrefix}, smooth cinematic transformation from ${fromScene?.prompt || ""} into ${toScene?.prompt || ""}`
            : `smooth cinematic transformation, morphing between two scenes`;
          ctx.say(`Morph ${i + 1}/${imageUrls.length - 1}: ${fromScene?.title} → ${toScene?.title}…`);

          let videoUrl: string | null = null;

          // Try veo-transition first (best: knows both start + end frames)
          // Then pixverse-transition (also first+last frame)
          // Then seedance-i2v (only knows start frame)
          const models: Array<{ cap: string; params: Record<string, unknown> }> = [
            {
              cap: "veo-transition",
              params: { first_frame_image: fromUrl, last_frame_image: toUrl },
            },
            {
              cap: "pixverse-transition",
              params: { first_frame_image: fromUrl, last_frame_image: toUrl },
            },
            {
              cap: "seedance-i2v",
              params: { image_url: fromUrl, duration: "5", aspect_ratio: "16:9" },
            },
          ];

          for (const model of models) {
            try {
              const resp = await fetch(`${ctx.sdkUrl}/inference`, {
                method: "POST",
                headers: headers(),
                body: JSON.stringify({
                  capability: model.cap,
                  prompt: transPrompt,
                  params: model.params,
                }),
              });

              if (resp.ok) {
                const data = await resp.json();
                videoUrl = extractUrl(data);
                if (videoUrl) {
                  ctx.say(`Morph ${i + 1} done (${model.cap})`);
                  break;
                }
              } else {
                const errText = await resp.text().catch(() => "");
                ctx.say(`${model.cap}: ${resp.status} — trying next…`);
                console.log(`[cinematic] ${model.cap} failed:`, errText.slice(0, 100));
              }
            } catch (e) {
              console.log(`[cinematic] ${model.cap} error:`, (e as Error).message);
            }
          }

          if (videoUrl) {
            videoUrls.push(videoUrl);
            ctx.addArtifact({
              type: "video",
              title: `${fromScene?.title} → ${toScene?.title}`,
              url: videoUrl,
              refId: `morph-${i}`,
              x: cardX, y: 250,
            });
            cardX += 360;
          } else {
            ctx.say(`Morph ${i + 1} failed on all models`);
          }
        }

        return JSON.stringify({
          status: "cinematic_complete",
          key_frames: imageUrls.length,
          morphs: videoUrls.length,
          message: `${imageUrls.length} key frames + ${videoUrls.length} morph videos on canvas.`,
        });
      },
    },

    {
      name: "stage_generate",
      description: "Generate an image or short video on the canvas. Use this when the user wants to create a visual asset (key frame, reference image, or video clip) without starting a live stream.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Description of what to generate" },
          type: { type: "string", enum: ["image", "video"], description: "What to create. Default: image" },
          model: { type: "string", description: "Optional model: flux-dev, gpt-image, seedance-i2v, seedream-5-lite. Default: flux-dev for images, seedance-i2v for video" },
        },
        required: ["prompt"],
      },
      async execute(args: Record<string, unknown>) {
        const prompt = args.prompt as string;
        const type = (args.type as string) || "image";
        const isVideo = type === "video";
        const model = (args.model as string) || (isVideo ? "seedance-i2v" : "flux-dev");

        if (!ctx.apiKey) {
          return JSON.stringify({ error: "No API key — open Settings" });
        }

        ctx.say(`Generating ${type}: "${prompt.slice(0, 50)}"…`);

        try {
          const resp = await fetch(`${ctx.sdkUrl}/inference`, {
            method: "POST",
            headers: headers(),
            body: JSON.stringify({
              capability: model,
              prompt,
              params: isVideo ? { duration: "5" } : {},
            }),
          });

          if (!resp.ok) {
            const text = await resp.text().catch(() => "");
            return JSON.stringify({ error: `Generation failed (${resp.status}): ${text.slice(0, 100)}` });
          }

          const data = await resp.json();
          const url = extractUrl(data);
          if (!url) {
            return JSON.stringify({ error: "No URL in response" });
          }

          const refId = `gen-${Date.now()}`;
          ctx.addArtifact({
            type: isVideo ? "video" : "image",
            title: prompt.slice(0, 30),
            url,
            refId,
            x: 100 + Math.random() * 200,
            y: 50 + Math.random() * 100,
          });

          return JSON.stringify({
            status: "generated",
            type,
            refId,
            url,
            message: `${type} created: ${refId}. Drag onto Live Output to use as stream source.`,
          });
        } catch (e) {
          return JSON.stringify({ error: `Generation error: ${(e as Error).message}` });
        }
      },
    },

    {
      name: "stage_source",
      description: "Set the video/image input source for the live stream. The source content is published to the pipeline instead of blank frames, enabling real video-to-video transformation. Use noise_scale to control how much the AI transforms the input (0.2=faithful, 0.8=creative). Drag an image/video card onto the Live Output for the same effect.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["image", "video", "blank"], description: "Source type. 'blank' clears the source back to black frames." },
          url: { type: "string", description: "URL of the image or video to use as input" },
          noise_scale: { type: "number", description: "How much to transform the input. 0.0=carbon copy, 0.5=blend, 1.0=ignore input. Recommended: 0.3-0.6 for video-to-video" },
        },
        required: ["type"],
      },
      async execute(args: Record<string, unknown>) {
        const type = args.type as "image" | "video" | "blank";

        if (type === "blank") {
          ctx.setStreamSource?.("blank");
          return JSON.stringify({ status: "source_cleared", message: "Source cleared — publishing blank frames." });
        }

        // Resolve URL from direct url param
        const url = args.url as string | undefined;
        if (!url) return JSON.stringify({ error: "No URL provided. Pass the image or video URL." });

        ctx.setStreamSource?.(type, url, url.split("/").pop()?.slice(0, 25));

        // Also set noise_scale if provided
        if (args.noise_scale !== undefined && ctx.streamId) {
          await ctx.controlStream({ noise_scale: args.noise_scale as number });
        }

        return JSON.stringify({
          status: "source_set",
          type,
          message: `${type} source set. ${args.noise_scale !== undefined ? `noise_scale=${args.noise_scale}` : "Use noise_scale 0.3-0.6 for best video-to-video results."}`,
        });
      },
    },
  ];
}

/** Extract URL from various SDK response shapes — matches storyboard's compound-tools.ts */
function extractUrl(resp: Record<string, unknown>): string | null {
  // The SDK nests results: { data: { images: [{ url }], video: { url }, ... } }
  const data = (resp.data ?? resp) as Record<string, unknown>;

  // Direct URL fields
  if (typeof resp.url === "string") return resp.url;
  if (typeof resp.image_url === "string") return resp.image_url;
  if (typeof resp.video_url === "string") return resp.video_url;
  if (typeof resp.audio_url === "string") return resp.audio_url;

  // Nested in data
  if (typeof data.url === "string") return data.url;
  const images = data.images as Array<{ url: string }> | undefined;
  if (images?.[0]?.url) return images[0].url;
  const image = data.image as { url: string } | undefined;
  if (image?.url) return image.url;
  const video = data.video as { url: string } | undefined;
  if (video?.url) return video.url;
  const audio = data.audio as { url: string } | undefined;
  if (audio?.url) return audio.url;
  const audioFile = data.audio_file as { url: string } | undefined;
  if (audioFile?.url) return audioFile.url;
  const output = data.output as { url: string } | undefined;
  if (output?.url) return output.url;

  // Last resort: find any https URL in the response
  const json = JSON.stringify(resp);
  const match = json.match(/"(https:\/\/[^"]+\.(png|jpg|jpeg|mp4|webm|wav|mp3)[^"]*)"/i);
  if (match) return match[1];

  return null;
}
