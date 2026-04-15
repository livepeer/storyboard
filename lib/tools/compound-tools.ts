import type { ToolDefinition } from "./types";
import { useCanvasStore } from "@/lib/canvas/store";
import { runInference } from "@/lib/sdk/client";
import { resolveCapability, isValidCapability, getCachedCapabilities } from "@/lib/sdk/capabilities";
import { useSkillStore } from "@/lib/skills/store";
import { useChatStore } from "@/lib/chat/store";
import { useSessionContext } from "@/lib/agents/session-context";
import type { CardType } from "@/lib/canvas/types";

/** Convert raw technical errors into short, user-friendly messages */
function humanizeError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("failed to fetch") || lower.includes("err_connection") || lower.includes("networkerror"))
    return "Can't reach SDK — check connection & API key";
  if (lower.includes("cors"))
    return "Connection blocked (CORS) — SDK may be down";
  if (lower.includes("401") || lower.includes("payment failed") || lower.includes("signer"))
    return "Authentication failed — check your API key";
  if (lower.includes("503") || lower.includes("no orchestrator"))
    return "No GPU available — try again in a moment";
  if (lower.includes("timeout") || lower.includes("abort"))
    return "Request timed out — model may be overloaded";
  if (lower.includes("safety") || lower.includes("blocked"))
    return "Content blocked by safety filter";
  if (lower.includes("429") || lower.includes("rate"))
    return "Rate limited — wait a moment";
  if (lower.includes("500"))
    return "Server error — try again";
  // Keep short errors as-is, truncate long ones
  return raw.length > 80 ? raw.slice(0, 77) + "…" : raw;
}

/** Extract a short 3-5 word title from a prompt */
function extractShortTitle(prompt: string): string {
  // Remove style prefixes (session context, style overrides) — they're not the subject
  const cleaned = prompt
    .replace(/^[^,]*(?:style|watercolor|ghibli|cinematic|photorealistic|anime)[^,]*,\s*/i, "")
    .replace(/^[^,]*palette[^,]*,\s*/i, "")
    .trim();
  // Take first 4-5 meaningful words
  const words = (cleaned || prompt)
    .split(/\s+/)
    .filter(w => w.length > 2) // skip tiny words
    .slice(0, 5)
    .join(" ");
  return words.length > 0 ? words.charAt(0).toUpperCase() + words.slice(1) : "Untitled";
}

/** Apply active style-override skills to a prompt */
function applyStyleOverrides(prompt: string, action: string): { prompt: string; modelHint?: string } {
  const overrides = useSkillStore.getState().getActiveStyleOverrides();
  if (overrides.length === 0) return { prompt };

  let modified = prompt;
  let modelHint: string | undefined;

  for (const style of overrides) {
    if (style.prompt_prefix) modified = style.prompt_prefix + modified;
    if (style.prompt_suffix) modified = modified + style.prompt_suffix;
    if (action === "animate" && style.video_prompt_addition) {
      modified += ", " + style.video_prompt_addition;
    }
    if (style.model_hint && !modelHint) modelHint = style.model_hint;
  }

  return { prompt: modified, modelHint };
}

interface MediaStep {
  action: "generate" | "restyle" | "animate" | "upscale" | "remove_bg" | "tts";
  prompt: string;
  title?: string;
  style_hint?: string;
  model_override?: string;
  depends_on?: number;
  source_url?: string;
}

/**
 * Select the best capability for an action.
 * If model_override is provided, resolves it against the LIVE capability list.
 * Invalid/hallucinated names are fuzzy-matched or mapped to the correct model.
 */
function selectCapability(
  action: string,
  styleHint?: string,
  modelOverride?: string,
  hasSourceUrl?: boolean,
  promptText?: string
): { capability: string; type: CardType } {
  // If model_override provided, resolve it (fuzzy match against live capabilities)
  if (modelOverride) {
    const resolved = resolveCapability(modelOverride, action);
    if (resolved) {
      const id = resolved.toLowerCase();
      const isVideo = id.includes("i2v") || id.includes("t2v") || id.includes("ltx");
      const isAudio = id.includes("tts");
      return {
        capability: resolved,
        type: isVideo ? "video" : isAudio ? "audio" : "image",
      };
    }
    // Could not resolve — fall through to action-based selection
  }

  // Detect "user wants video" from the prompt text. This must be
  // STRICT — the step.prompt here is what Gemini wrote, not what the
  // user said. Gemini inherits style language ("cinematic", "Ghibli",
  // "8-second") from the CreativeContext, so a loose regex matches
  // every generate call when there's a cinematic context active. The
  // rule: require BOTH an explicit duration AND a video noun.
  const lowerPrompt = (promptText ?? "").toLowerCase();
  const lowerHint = (styleHint ?? "").toLowerCase();
  const hasVideoNoun = /\b(video|clip|footage|animation)\b/.test(lowerPrompt);
  const hasDuration = /\b\d+[- ]second\b/.test(lowerPrompt);
  const explicitMakeVideo = /\b(make|generate|create|produce)\s+(a|an|me\s+a|me\s+an)?\s*\d*[- ]?\s*seconds?\s*(video|clip|animation|movie)\b/.test(lowerPrompt);
  const asksForVideo = (hasVideoNoun && hasDuration) || explicitMakeVideo;

  // Motion verbs that indicate the user wants an animation (image -> video).
  // If none of these are present AND the prompt has visual-edit verbs, the
  // user most likely wants to EDIT an image, not animate it.
  const motionVerbs = /\b(pan|tilt|zoom|push(?:-in| in)?|pull(?:-out| out)?|dolly|drift|sweep|rotate|move|fly|float|rise|fall|swirl|spin|shake|tremble|rustl\w*|flutter\w*|wind|breeze|ripple|wave|flow|cascade|gust|storm|rain|snow|drip|splash)\b/;
  const editVerbs = /\b(add|remove|change|make\s+\w+\s+(darker|lighter|brighter|softer|warmer|cooler|redder|bluer|greener)|with\s+a\s|without\s|replace|adjust|tweak|darken|lighten|brighten|deepen|soften|sharpen|crop|blur|recolor|tint)\b/;
  const hasMotion = motionVerbs.test(lowerPrompt);
  const hasEditIntent = editVerbs.test(lowerPrompt);

  const valid = getCachedCapabilities();
  const hasVeoT2V = !!valid && valid.some((c) => c.name === "veo-t2v");
  const hasVeoI2V = !!valid && valid.some((c) => c.name === "veo-i2v");

  switch (action) {
    case "generate": {
      // Text-to-video path: ONLY if the prompt has an unambiguous video
      // intent (duration + video noun, or "make a video" phrasing).
      // Plain "cinematic watercolor" inherited from a style context
      // should NOT fire this branch.
      if (asksForVideo) {
        if (hasVeoT2V) return { capability: "veo-t2v", type: "video" };
        if (valid && valid.some((c) => c.name === "ltx-t2v")) {
          return { capability: "ltx-t2v", type: "video" };
        }
      }
      const hint = lowerHint;
      if (hint.includes("fast") || hint.includes("draft")) return { capability: "flux-schnell", type: "image" };
      if (hint.includes("professional") || hint.includes("illustration")) return { capability: "recraft-v4", type: "image" };
      if (hint.includes("photo")) return { capability: "flux-dev", type: "image" };
      return { capability: "flux-dev", type: "image" };
    }
    case "restyle":
      return { capability: "kontext-edit", type: "image" };
    case "animate": {
      // animate = image → video. Requires a source_url to work.
      // Three branches, most specific first:
      //
      // 1) animate WITHOUT source: user said "make a video" but no
      //    canvas card was attached. Rescue with text-to-video (veo-t2v).
      // 2) animate WITH source BUT the prompt has visual-edit verbs
      //    (add/remove/change/darker/with a...) AND NO motion verbs:
      //    the LLM misclassified an image edit as an animation. Route
      //    to kontext-edit (image→image) to produce a refined still.
      // 3) animate WITH source AND motion: the real animation case.
      //    Route to veo-i2v (with ltx-i2v fallback).
      if (!hasSourceUrl) {
        if (hasVeoT2V) return { capability: "veo-t2v", type: "video" };
        if (valid && valid.some((c) => c.name === "ltx-t2v")) {
          return { capability: "ltx-t2v", type: "video" };
        }
      }
      if (hasSourceUrl && hasEditIntent && !hasMotion) {
        // Image edit disguised as an animate call. Produce a still,
        // not a video. kontext-edit is image-to-image refinement.
        return { capability: "kontext-edit", type: "image" };
      }
      // Route to Veo 3.1 (via fal.ai) when available — dramatically
      // better quality + audio than LTX. Falls back to ltx-i2v if the
      // live capability registry doesn't include veo-i2v.
      if (hasVeoI2V) return { capability: "veo-i2v", type: "video" };
      return { capability: "ltx-i2v", type: "video" };
    }
    case "upscale":
      return { capability: "topaz-upscale", type: "image" };
    case "remove_bg":
      return { capability: "bg-remove", type: "image" };
    case "tts":
      return { capability: "chatterbox-tts", type: "audio" };
    default:
      return { capability: "flux-dev", type: "image" };
  }
}

/**
 * create_media — compound tool that handles multi-step media creation.
 * Model selection is automatic based on action type. model_override is
 * validated against the live capability list and fuzzy-matched if invalid.
 * This is the ONLY tool Claude should use for media creation.
 */
export const createMediaTool: ToolDefinition = {
  name: "create_media",
  description:
    "Create media and add to canvas. Model selection is AUTOMATIC. For large storyboards (6+ scenes), call this tool MULTIPLE TIMES with up to 5 steps each. Keep prompts concise (under 40 words).",
  parameters: {
    type: "object",
    properties: {
      steps: {
        type: "array",
        maxItems: 5,
        description: "1-5 media creation steps. For more, call create_media multiple times.",
        items: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["generate", "restyle", "animate", "upscale", "remove_bg", "tts"],
              description: "What to do: generate=new image, restyle=edit image, animate=image→video, tts=text→speech",
            },
            prompt: { type: "string", description: "Text prompt" },
            title: { type: "string", description: "Card label on canvas" },
            style_hint: {
              type: "string",
              description: "Style hint: illustration, photorealistic, fast, cinematic (affects model choice for generate)",
            },
            depends_on: {
              type: "number",
              description: "Index of a prior step whose output is used as input (0-based)",
            },
            source_url: {
              type: "string",
              description: "URL of an existing canvas card to use as input (for restyle/animate/upscale/remove_bg). Get URLs from canvas_get.",
            },
          },
          required: ["action", "prompt"],
        },
      },
    },
    required: ["steps"],
  },
  execute: async (input) => {
    const rawSteps = input.steps as MediaStep[];
    if (!rawSteps?.length) {
      return { success: false, error: "No steps provided" };
    }

    // Client-side model selection and execution — all model names validated
    const canvas = useCanvasStore.getState();
    const batchId = `batch_${Date.now()}`;
    const results: Array<{
      refId: string;
      cardId: string;
      url?: string;
      error?: string;
      capability: string;
      elapsed: number;
    }> = [];

    // Pre-plan card positions so new cards land in the right spot
    let prePlannedPositions: Array<{ x: number; y: number; w: number; h: number }> = [];
    try {
      const { prePlan, pickStrategy } = await import("@/lib/layout/agent");
      const { useEpisodeStore } = await import("@/lib/episodes/store");
      const { useLayoutStore } = await import("@/lib/layout/store");
      const epState = useEpisodeStore.getState();
      const layoutPref = useLayoutStore.getState().activeSkillId;
      const ctx = {
        cards: useCanvasStore.getState().cards,
        edges: useCanvasStore.getState().edges,
        episodes: epState.episodes,
        activeEpisodeId: epState.activeEpisodeId,
        canvasWidth: 1920,
      };
      const skillId = pickStrategy(ctx, layoutPref);
      prePlannedPositions = prePlan(useCanvasStore.getState().cards, rawSteps.length, skillId);
    } catch {
      // Layout agent not available — cards use default nextPosition()
    }

    for (let i = 0; i < rawSteps.length; i++) {
      const step = rawSteps[i];

      // Apply session creative context + style-override skills
      // Session context = persistent style/character/setting from the original brief
      // Style overrides = loaded skills (ghibli, kids-drawing, etc.)
      let sessionPrefix = "";
      if (step.action !== "tts") {
        // Check for active episode — use its effective context if present
        try {
          const { useEpisodeStore } = await import("@/lib/episodes/store");
          const { buildPrefixFromContext } = await import("@/lib/agents/session-context");
          const epStore = useEpisodeStore.getState();
          const activeEp = epStore.getActiveEpisode();
          if (activeEp) {
            const storyboardCtx = useSessionContext.getState().context;
            if (storyboardCtx) {
              const effective = epStore.getEffectiveContext(activeEp.id, storyboardCtx);
              if (effective) {
                sessionPrefix = buildPrefixFromContext(effective);
              }
            }
          }
        } catch { /* episode store not available */ }
        // Fallback to session context if no episode active
        if (!sessionPrefix) {
          sessionPrefix = useSessionContext.getState().buildPrefix();
        }
      }
      const styled = step.action !== "tts"
        ? applyStyleOverrides(step.prompt, step.action)
        : { prompt: step.prompt };
      const effectivePrompt = sessionPrefix + styled.prompt;
      if (sessionPrefix) {
        console.log(`[create_media] Session context injected (${sessionPrefix.split(/\s+/).length} words): "${sessionPrefix.slice(0, 80)}..."`);
      }

      // Resolve capability through live registry (fuzzy-matches invalid names).
      // Pass hasSourceUrl + promptText so the resolver can:
      // - route animate-without-source to veo-t2v instead of failing on veo-i2v
      // - route generate-with-video-intent to veo-t2v instead of flux-dev
      const stepSourceUrl = step.source_url
        || (step.depends_on !== undefined && results[step.depends_on]?.url);
      const { capability, type } = selectCapability(
        step.action,
        step.style_hint,
        step.model_override || ("modelHint" in styled ? styled.modelHint : undefined) as string | undefined,
        !!stepSourceUrl,
        effectivePrompt,
      );

      // Friendly names: short, memorable, easy to reference in chat
      // "img-1", "vid-2", "aud-3" — type prefix + sequential number
      const typePrefix: Record<string, string> = {
        image: "img", video: "vid", audio: "aud", stream: "str",
      };
      // Read FRESH state each iteration — the snapshot from line 180 is stale
      // after addCard() calls in previous loop iterations
      const cardNum = useCanvasStore.getState().cards.length + 1;
      const refId = `${typePrefix[type] || "med"}-${cardNum}`;
      // Title: use step.title if agent provided one, else extract 3-5 key words from prompt
      const title = step.title || extractShortTitle(step.prompt);

      // Create card (spinner shows while generating)
      console.log(`[create_media] Step ${i}/${rawSteps.length}: refId=${refId}, cardNum=${cardNum}, canvasCards=${useCanvasStore.getState().cards.length}, capability=${capability}`);
      const card = canvas.addCard({ type, title, refId, batchId });
      if (prePlannedPositions[i]) {
        const pos = prePlannedPositions[i];
        useCanvasStore.getState().updateCard(card.id, {
          x: pos.x, y: pos.y, w: pos.w, h: pos.h,
        });
      }

      // Build params — inject source URL from depends_on or source_url
      const params: Record<string, unknown> = {};
      if (step.depends_on !== undefined && results[step.depends_on]) {
        const dep = results[step.depends_on];
        if (dep.url) {
          params.image_url = dep.url;
        }
        canvas.addEdge(dep.refId, refId, {
          capability,
          prompt: step.prompt,
          action: step.action,
        });
      } else if (step.source_url) {
        // Source from existing canvas card (agent passes URL from canvas_get)
        params.image_url = step.source_url;
      }

      // Run inference with the validated capability and styled prompt
      const t0 = performance.now();
      try {
        const result = await runInference({
          capability,
          prompt: effectivePrompt,
          params,
        });
        const elapsed = performance.now() - t0;

        const r = result as Record<string, unknown>;
        const data = (r.data ?? r) as Record<string, unknown>;
        const images = data.images as Array<{ url: string }> | undefined;
        const image = data.image as { url: string } | undefined;
        const video = data.video as { url: string } | undefined;
        const audio = data.audio as { url: string } | undefined;
        const audioFile = data.audio_file as { url: string } | undefined;
        const output = data.output as { url: string } | undefined;

        const url =
          (r.image_url as string) ??
          images?.[0]?.url ??
          image?.url ??
          (r.video_url as string) ??
          video?.url ??
          (r.audio_url as string) ??
          audio?.url ??
          audioFile?.url ??
          output?.url ??
          (data.url as string) ??
          undefined;

        // Check both top-level and nested errors
        const topError = r.error as string | undefined;
        const dataError = data.error as string | undefined;
        const effectiveError = topError || dataError;

        // Store generation metadata on the card for the info banner
        const genMeta = { capability, prompt: effectivePrompt, elapsed };

        if (effectiveError) {
          const friendly = humanizeError(effectiveError);
          canvas.updateCard(card.id, { error: friendly, ...genMeta });
          results.push({ refId, cardId: card.id, error: friendly, capability, elapsed });
        } else if (url) {
          canvas.updateCard(card.id, { url, ...genMeta });
          results.push({ refId, cardId: card.id, url, capability, elapsed });
        } else {
          // Log the full response for debugging
          console.warn(`[create_media] No URL extracted for ${capability}:`, JSON.stringify(r).slice(0, 300));
          // Try one more extraction: some models return url at data level as string
          const fallbackUrl = typeof data === "object"
            ? (Object.values(data).find((v) => typeof v === "string" && (v as string).startsWith("http")) as string | undefined)
            : undefined;
          if (fallbackUrl) {
            canvas.updateCard(card.id, { url: fallbackUrl, ...genMeta });
            results.push({ refId, cardId: card.id, url: fallbackUrl, capability, elapsed });
          } else {
            const noMediaMsg = `No output from ${capability} — try a different prompt`;
            canvas.updateCard(card.id, { error: noMediaMsg, ...genMeta });
            results.push({ refId, cardId: card.id, error: noMediaMsg, capability, elapsed });
          }
        }

        if (step.depends_on !== undefined && results[step.depends_on]) {
          canvas.addEdge(results[step.depends_on].refId, refId, {
            capability,
            prompt: step.prompt,
            action: step.action,
            elapsed,
          });
        }
      } catch (e) {
        const elapsed = performance.now() - t0;
        const raw = e instanceof Error ? e.message : "Unknown error";
        const friendly = humanizeError(raw);
        canvas.updateCard(card.id, { error: friendly });
        results.push({ refId, cardId: card.id, error: friendly, capability, elapsed });
      }
    }

    // Show error summary in agent chat if any steps failed
    const failures = results.filter((r) => r.error);
    if (failures.length > 0) {
      const ok = results.length - failures.length;
      const errMsg = failures.length === results.length
        ? `All ${failures.length} failed: ${failures[0].error}`
        : `${ok}/${results.length} succeeded, ${failures.length} failed: ${failures.map(f => f.error).join("; ")}`;
      useChatStore.getState().addMessage(errMsg, "system");
    }

    const summary = results
      .map(
        (r) =>
          `${r.refId}: ${r.capability} (${(r.elapsed / 1000).toFixed(1)}s)${r.error ? ` — ${r.error}` : ""}`
      )
      .join("; ");

    // Record in working memory
    try {
      const { useWorkingMemory } = await import("@/lib/agents/working-memory");
      const mem = useWorkingMemory.getState();
      const ok = results.filter((r) => !r.error).length;
      const cap = results[0]?.capability || "unknown";
      mem.recordAction({
        tool: "create_media",
        summary: `${rawSteps.length} steps (${cap})`,
        outcome: ok === results.length
          ? `${ok} created`
          : `${ok}/${results.length} ok`,
        success: ok > 0,
      });
    } catch { /* non-critical */ }

    return {
      success: results.every((r) => !r.error),
      data: {
        cards_created: results.map((r) => r.refId),
        summary,
        results: results.map((r) => ({
          refId: r.refId,
          url: r.url,
          capability: r.capability,
          elapsed_ms: Math.round(r.elapsed),
        })),
      },
    };
  },
};

export const compoundTools: ToolDefinition[] = [createMediaTool];
