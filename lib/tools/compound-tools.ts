import type { ToolDefinition } from "./types";
import { useCanvasStore } from "@/lib/canvas/store";
import { runInference } from "@/lib/sdk/client";
import { resolveCapability, isValidCapability } from "@/lib/sdk/capabilities";
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
  modelOverride?: string
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

  switch (action) {
    case "generate": {
      const hint = styleHint?.toLowerCase() || "";
      if (hint.includes("fast") || hint.includes("draft")) return { capability: "flux-schnell", type: "image" };
      if (hint.includes("professional") || hint.includes("illustration")) return { capability: "recraft-v4", type: "image" };
      if (hint.includes("photo")) return { capability: "flux-dev", type: "image" };
      return { capability: "flux-dev", type: "image" };
    }
    case "restyle":
      return { capability: "kontext-edit", type: "image" };
    case "animate":
      return { capability: "ltx-i2v", type: "video" };
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

    for (let i = 0; i < rawSteps.length; i++) {
      const step = rawSteps[i];

      // Apply session creative context + style-override skills
      // Session context = persistent style/character/setting from the original brief
      // Style overrides = loaded skills (ghibli, kids-drawing, etc.)
      const sessionPrefix = step.action !== "tts"
        ? useSessionContext.getState().buildPrefix()
        : "";
      const styled = step.action !== "tts"
        ? applyStyleOverrides(step.prompt, step.action)
        : { prompt: step.prompt };
      const effectivePrompt = sessionPrefix + styled.prompt;
      if (sessionPrefix) {
        console.log(`[create_media] Session context injected (${sessionPrefix.split(/\s+/).length} words): "${sessionPrefix.slice(0, 80)}..."`);
      }

      // Resolve capability through live registry (fuzzy-matches invalid names)
      const { capability, type } = selectCapability(
        step.action,
        step.style_hint,
        step.model_override || ("modelHint" in styled ? styled.modelHint : undefined) as string | undefined
      );

      const refId = `media_${Date.now()}_${i}`;
      const title = step.title || step.prompt.slice(0, 40); // Use original prompt for title

      // Create card (spinner shows while generating)
      const card = canvas.addCard({ type, title, refId, batchId });

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

        if (effectiveError) {
          const friendly = humanizeError(effectiveError);
          canvas.updateCard(card.id, { error: friendly });
          results.push({ refId, cardId: card.id, error: friendly, capability, elapsed });
        } else if (url) {
          canvas.updateCard(card.id, { url });
          results.push({ refId, cardId: card.id, url, capability, elapsed });
        } else {
          // Log the full response for debugging
          console.warn(`[create_media] No URL extracted for ${capability}:`, JSON.stringify(r).slice(0, 300));
          // Try one more extraction: some models return url at data level as string
          const fallbackUrl = typeof data === "object"
            ? (Object.values(data).find((v) => typeof v === "string" && (v as string).startsWith("http")) as string | undefined)
            : undefined;
          if (fallbackUrl) {
            canvas.updateCard(card.id, { url: fallbackUrl });
            results.push({ refId, cardId: card.id, url: fallbackUrl, capability, elapsed });
          } else {
            const noMediaMsg = `No output from ${capability} — try a different prompt`;
            canvas.updateCard(card.id, { error: noMediaMsg });
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
