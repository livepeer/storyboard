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
  /** Add an artifact card to the canvas */
  addArtifact: (artifact: { type: string; title: string; url: string; refId: string; x?: number; y?: number }) => void;
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
              kv_cache_attention_bias: 0.5,
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
      description: "Create a LIVE STREAM with multi-scene timeline. Use for ANY request containing 'stream', 'live', or 'real-time'. The stream morphs between scenes via prompt traveling — no cuts, continuous visual evolution.",
      parameters: {
        type: "object",
        properties: {
          scenes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "Short scene title" },
                prompt: { type: "string", description: "30-40 words. MUST start with camera angle (same in every scene). Include: subject position, motion direction, background, lighting, colors, textures. Between consecutive scenes share at least 2 colors and 1 material." },
                preset: { type: "string", description: "cinematic=stable hold(0.5), abstract=dramatic morph(0.95), psychedelic=extreme morph+cache reset(0.9), dreamy=soft transition(0.7), faithful=frozen(0.2), painterly=artistic(0.65)" },
                duration: { type: "number", description: "25-40s for stable shots, 10-15s for transformation bridges" },
              },
              required: ["title", "prompt", "preset", "duration"],
            },
            description: "SCENE TRAVELING PATTERN: alternate stable→bridge→stable. Stable scenes (cinematic preset, 25-40s) hold the subject clearly. Bridge scenes (abstract/psychedelic preset, 10-15s) describe the MID-TRANSFORMATION state between two subjects — e.g. 'wooden frame cracking as brass gears push through, wheels thickening from wood to metal'. Every scene MUST use the same camera angle. Background must evolve gradually (autumn trees→pine trees→palm trees, never jump). For transformations: use at least 2x as many scenes as subjects (1 stable + 1 bridge per subject).",
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
                kv_cache_attention_bias: 0.5,
                denoising_step_list: [1000, 750, 500, 250],
              },
            }),
          }).then(async (resp) => {
            if (resp.ok) {
              const data = await resp.json();
              if (data.stream_id) {
                console.log("[stage_scene] Stream started:", data.stream_id);
                ctx.setStreamId(data.stream_id);
                // Queue performance to auto-play when stream is ready (first frame)
                ctx.playWhenReady();
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
        if (!ctx.streamId) {
          // Stream might be starting in background — queue play for when ready
          ctx.playWhenReady();
          return JSON.stringify({ status: "queued", message: "Performance queued — will start when stream is ready." });
        }
        ctx.playPerformance();
        return JSON.stringify({ status: "playing" });
      },
    },

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

        // ── Step 2: Generate transition videos ──
        ctx.say(`Creating ${imageUrls.length - 1} transition videos via seedance…`);

        for (let i = 0; i < imageUrls.length - 1; i++) {
          const fromUrl = imageUrls[i];
          const toScene = scenes[i + 1];
          const toPrompt = stylePrefix
            ? `${stylePrefix}, smooth cinematic morphing transition, ${toScene?.prompt || ""}`
            : `smooth cinematic morphing transition, ${toScene?.prompt || ""}`;
          const dur = toScene?.duration || 5;
          ctx.say(`Transition ${i + 1}/${imageUrls.length - 1}: ${scenes[i]?.title} → ${toScene?.title}…`);

          let videoUrl: string | null = null;

          // Try seedance first, fallback to ltx
          for (const cap of ["seedance-i2v", "ltx-i2v"]) {
            try {
              // Pass image URL via params.image_url (not image_data which expects base64)
              // The SDK merges params into the BYOC payload, and fal models read image_url directly
              const params: Record<string, unknown> = cap === "seedance-i2v"
                ? { image_url: fromUrl, duration: String(dur), aspect_ratio: "16:9" }
                : { image_url: fromUrl, duration: dur };

              const resp = await fetch(`${ctx.sdkUrl}/inference`, {
                method: "POST",
                headers: headers(),
                body: JSON.stringify({ capability: cap, prompt: toPrompt, params }),
              });

              if (resp.ok) {
                const data = await resp.json();
                videoUrl = extractUrl(data);
                if (videoUrl) {
                  ctx.say(`Transition ${i + 1} complete (${cap})`);
                  break;
                } else {
                  console.log(`[cinematic] Transition ${i+1} ${cap} ok but no URL:`, JSON.stringify(data).slice(0, 200));
                }
              } else {
                const errText = await resp.text().catch(() => "");
                console.log(`[cinematic] Transition ${i+1} ${cap} failed ${resp.status}:`, errText.slice(0, 150));
                ctx.say(`Transition ${i + 1} (${cap}): ${resp.status} — trying next model…`);
              }
            } catch (e) {
              console.log(`[cinematic] Transition ${i+1} ${cap} error:`, (e as Error).message);
            }
          }

          if (videoUrl) {
            videoUrls.push(videoUrl);
            console.log(`[cinematic] Transition ${i+1} video URL:`, videoUrl);
            ctx.say(`Transition ${i + 1} video: ${videoUrl.slice(0, 80)}…`);
            ctx.addArtifact({ type: "video", title: `${scenes[i]?.title} → ${toScene?.title}`, url: videoUrl, refId: `trans-${i}`, x: cardX, y: 250 });
            cardX += 360;
          } else {
            ctx.say(`Transition ${i + 1} failed on all models`);
          }
        }

        // ── Step 3: Start VACE-enhanced Scope stream ──
        // Use the key frame images as VACE references for live morphing
        if (imageUrls.length >= 2) {
          ctx.say("Starting VACE-enhanced live stream with key frames as references…");

          // Load scenes into timeline for live morphing (each scene uses its key frame as VACE ref)
          const liveScenes = scenes.map((s, i) => ({
            title: s.title,
            prompt: stylePrefix ? `${stylePrefix}, ${s.prompt}` : s.prompt,
            preset: "cinematic" as const,
            duration: s.duration + 10,
            vaceRef: imageUrls[i] || undefined, // key frame as VACE anchor
          }));
          ctx.setScenes(liveScenes);

          // Start stream with first key frame as VACE reference
          fetch(`${ctx.sdkUrl}/stream/start`, {
            method: "POST",
            headers: headers(),
            body: JSON.stringify({
              model_id: "scope",
              params: {
                prompt: liveScenes[0].prompt,
                prompts: liveScenes[0].prompt,
                pipeline_ids: ["longlive"],
                noise_scale: 0.45,
                kv_cache_attention_bias: 0.65,
                denoising_step_list: [1000, 750, 500, 250],
                vace_enabled: true,
                vace_ref_images: [imageUrls[0]],
                vace_context_scale: 1.2,
              },
            }),
          }).then(async (resp) => {
            if (resp.ok) {
              const data = await resp.json();
              if (data.stream_id) {
                ctx.setStreamId(data.stream_id);
                ctx.playWhenReady();
                ctx.say(`VACE stream started: ${data.stream_id}`);
              }
            } else {
              ctx.say(`Stream start failed: ${resp.status}`);
            }
          }).catch((e) => ctx.say(`Stream error: ${(e as Error).message}`));
        }

        return JSON.stringify({
          status: "cinematic_complete",
          key_frames: imageUrls.length,
          transitions: videoUrls.length,
          message: `${imageUrls.length} key frames + ${videoUrls.length} transition videos on canvas. VACE-enhanced live stream starting with key frames as visual anchors.`,
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
