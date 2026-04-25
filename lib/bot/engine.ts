/**
 * Bot Engine — chat-client-agnostic creative bot.
 *
 * Handles: slash commands, creative pipeline, single generation.
 * Adapters (Telegram, Discord, Slack, etc.) provide the transport.
 *
 * Usage:
 *   const engine = createBotEngine({ sdkUrl, sdkKey });
 *   const response = await engine.handle("/compare a sunset", ctx);
 *   // response.actions = [{ type: "photo", url, caption }, { type: "text", text }]
 */

export interface BotAction {
  type: "text" | "photo" | "video" | "audio" | "buttons";
  text?: string;
  url?: string;
  caption?: string;
  buttons?: Array<Array<{ label: string; data: string }>>;
}

export interface BotResponse {
  actions: BotAction[];
}

export interface BotConfig {
  sdkUrl: string;
  sdkKey: string;
}

/** Run inference against SDK. Returns URL or null. */
async function infer(config: BotConfig, prompt: string, model: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000); // 55s (under Vercel 60s limit)

  try {
    const resp = await fetch(`${config.sdkUrl}/inference`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.sdkKey}` },
      body: JSON.stringify({ capability: model, prompt, params: {} }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) {
      const err = await resp.text().catch(() => "");
      console.error(`[Bot] Inference ${model} failed: ${resp.status} ${err.slice(0, 100)}`);
      return null;
    }

    const data = await resp.json();
    const r = data as Record<string, unknown>;
    const d = (r.data ?? r) as Record<string, unknown>;
    const images = d.images as Array<{ url: string }> | undefined;
    return (r.image_url as string) ?? images?.[0]?.url
      ?? (r.video_url as string) ?? (r.audio_url as string) ?? (d.url as string) ?? null;
  } catch (e) {
    clearTimeout(timer);
    console.error(`[Bot] Inference ${model} error:`, (e as Error).message);
    return null;
  }
}

export function createBotEngine(config: BotConfig) {
  return {
    async handle(text: string): Promise<BotResponse> {
      const actions: BotAction[] = [];
      const trimmed = text.trim();

      if (!config.sdkKey) {
        return { actions: [{ type: "text", text: "No API key configured." }] };
      }

      // /start
      if (trimmed === "/start") {
        return { actions: [{ type: "text", text:
          "🎨 Storyboard Bot\n\n" +
          "Generate AI images, videos and music using 40+ models.\n\n" +
          "Commands:\n" +
          "/compare prompt — 4 models side by side\n" +
          "/vary prompt — 4 creative variations\n" +
          "/styles prompt — 4 art styles\n" +
          "/video prompt — video clip\n" +
          "/music description — generate music\n" +
          "/models — list models\n" +
          "/help — all commands\n\n" +
          "Or just type anything to generate an image!"
        }] };
      }

      // /help
      if (trimmed === "/help") {
        return { actions: [{ type: "text", text:
          "Commands:\n\n" +
          "📸 Just type anything — generates an image\n" +
          "/compare prompt — 4 AI models side by side\n" +
          "/vary prompt — 4 variations\n" +
          "/styles prompt — watercolor, oil, pencil, digital\n" +
          "/video prompt — video clip\n" +
          "/music description — music track\n" +
          "/models — list available models\n\n" +
          "Tip: type \"use gpt-image for X\" for a specific model"
        }] };
      }

      // /models
      if (trimmed === "/models") {
        return { actions: [{ type: "text", text:
          "Available models:\n\n" +
          "🖼 Image: flux-dev, gpt-image, recraft-v4, nano-banana, gemini-image, seedream-5-lite\n" +
          "✏️ Edit: kontext-edit\n" +
          "🎬 Video: seedance-i2v, ltx-i2v, ltx-t2v\n" +
          "🎵 Audio: music, chatterbox-tts"
        }] };
      }

      // /compare <prompt>
      if (trimmed.startsWith("/compare ")) {
        const prompt = trimmed.slice(9).trim();
        if (!prompt) return { actions: [{ type: "text", text: "Usage: /compare `prompt`" }] };
        actions.push({ type: "text", text: `Comparing 4 models...` });
        const models = ["flux-dev", "gpt-image", "recraft-v4", "nano-banana"];
        const results = await Promise.allSettled(models.map((m) => infer(config, prompt, m)));
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          if (r.status === "fulfilled" && r.value) {
            actions.push({ type: "photo", url: r.value, caption: models[i] });
          } else {
            actions.push({ type: "text", text: `${models[i]}: failed` });
          }
        }
        return { actions };
      }

      // /vary <prompt>
      if (trimmed.startsWith("/vary ")) {
        const prompt = trimmed.slice(6).trim();
        if (!prompt) return { actions: [{ type: "text", text: "Usage: /vary `prompt`" }] };
        actions.push({ type: "text", text: "Generating 4 variations..." });
        const tweaks = [prompt, `alternative composition, ${prompt}`, `different angle, ${prompt}`, `dramatic lighting, ${prompt}`];
        const results = await Promise.allSettled(tweaks.map((p) => infer(config, p, "flux-dev")));
        for (const r of results) {
          if (r.status === "fulfilled" && r.value) actions.push({ type: "photo", url: r.value });
        }
        return { actions };
      }

      // /styles <prompt>
      if (trimmed.startsWith("/styles ")) {
        const prompt = trimmed.slice(8).trim();
        if (!prompt) return { actions: [{ type: "text", text: "Usage: /styles `prompt`" }] };
        const styles = ["watercolor painting", "oil painting", "pencil sketch", "digital art"];
        actions.push({ type: "text", text: "Style sweep in 4 styles..." });
        const results = await Promise.allSettled(styles.map((s) => infer(config, `${s} style, ${prompt}`, "flux-dev")));
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          if (r.status === "fulfilled" && r.value) actions.push({ type: "photo", url: r.value, caption: styles[i] });
        }
        return { actions };
      }

      // /video <prompt>
      if (trimmed.startsWith("/video ")) {
        const prompt = trimmed.slice(7).trim();
        if (!prompt) return { actions: [{ type: "text", text: "Usage: /video `prompt`" }] };
        actions.push({ type: "text", text: "Generating video (30-90s)..." });
        const url = await infer(config, prompt, "ltx-t2v");
        if (url) actions.push({ type: "video", url, caption: prompt.slice(0, 100) });
        else actions.push({ type: "text", text: "Video generation failed." });
        return { actions };
      }

      // /music <desc>
      if (trimmed.startsWith("/music ")) {
        const desc = trimmed.slice(7).trim();
        if (!desc) return { actions: [{ type: "text", text: "Usage: /music `description`" }] };
        actions.push({ type: "text", text: "Generating music..." });
        let resp: Response;
        try {
          resp = await fetch(`${config.sdkUrl}/inference`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.sdkKey}` },
            body: JSON.stringify({ capability: "music", prompt: desc, params: { prompt: desc, lyrics_prompt: `[Intro]\n[Verse]\n${desc}\n[Chorus]\n${desc}\n[Outro]` } }),
          });
        } catch {
          actions.push({ type: "text", text: "Music generation failed — SDK unreachable." });
          return { actions };
        }
        if (resp.ok) {
          const data = await resp.json();
          const url = data.audio_url || data.data?.audio?.url || data.url;
          if (url) actions.push({ type: "audio", url, caption: desc.slice(0, 60) });
          else actions.push({ type: "text", text: "No audio returned." });
        } else {
          actions.push({ type: "text", text: "Music generation failed." });
        }
        return { actions };
      }

      // ── Default: try Creative Pipeline, fallback to single generation ──
      try {
        const { createCreativePipeline } = await import("@livepeer/creative-kit");
        const pipeline = createCreativePipeline({
          executor: {
            async infer(prompt, model) {
              const url = await inferFn(config, prompt, model);
              return url ? { url } : null;
            },
            addResult({ url, model }) {
              const isVid = url.includes("video") || url.endsWith(".mp4");
              actions.push({ type: isVid ? "video" : "photo", url, caption: model });
            },
            say(m) { actions.push({ type: "text", text: m }); },
          },
        });
        const result = await pipeline.run(trimmed);
        if (result.handled) return { actions };
      } catch (pipelineErr) {
        console.error("[Bot] Pipeline error:", (pipelineErr as Error).message);
        // Fall through to single-image generation
      }

      // Single image
      actions.push({ type: "text", text: `🎨 Creating "${trimmed.slice(0, 40)}"...` });
      const url = await infer(config, trimmed, "flux-dev");
      if (url) {
        actions.push({ type: "photo", url, caption: trimmed.slice(0, 100) });
        actions.push({
          type: "buttons",
          text: "What next?",
          buttons: [
            [{ label: "🔀 Variations", data: `vary:${trimmed.slice(0, 50)}` }, { label: "🎬 Video", data: `model:ltx-t2v:${trimmed.slice(0, 40)}` }],
            [{ label: "🎨 GPT Image", data: `model:gpt-image:${trimmed.slice(0, 40)}` }, { label: "✏️ Recraft", data: `model:recraft-v4:${trimmed.slice(0, 40)}` }],
          ],
        });
      } else {
        actions.push({ type: "text", text: "❌ Generation failed. Check that the API key is valid and the SDK is reachable." });
      }

      return { actions };
    },

    /** Handle button callback data (e.g. "vary:prompt" or "model:gpt-image:prompt"). */
    async handleCallback(data: string): Promise<BotResponse> {
      const actions: BotAction[] = [];

      if (data.startsWith("vary:")) {
        const prompt = data.slice(5);
        actions.push({ type: "text", text: "Generating 4 variations..." });
        const results = await Promise.allSettled(
          ["flux-dev", "gpt-image", "recraft-v4", "nano-banana"].map((m) => infer(config, prompt, m))
        );
        for (const r of results) {
          if (r.status === "fulfilled" && r.value) actions.push({ type: "photo", url: r.value });
        }
      }

      if (data.startsWith("model:")) {
        const [, model, ...rest] = data.split(":");
        const prompt = rest.join(":");
        const url = await infer(config, prompt, model);
        if (url) {
          const isVid = model.includes("t2v") || model.includes("i2v");
          actions.push({ type: isVid ? "video" : "photo", url, caption: `${model}: ${prompt.slice(0, 80)}` });
        } else {
          actions.push({ type: "text", text: `${model} failed.` });
        }
      }

      return { actions };
    },
  };
}

const inferFn = infer;
