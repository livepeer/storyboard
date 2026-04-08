import type { ToolDefinition } from "./types";
import { useCanvasStore } from "@/lib/canvas/store";
import { runInference } from "@/lib/sdk/client";
import { resolveCapability, isValidCapability } from "@/lib/sdk/capabilities";
import type { CardType } from "@/lib/canvas/types";

interface MediaStep {
  action: "generate" | "restyle" | "animate" | "upscale" | "remove_bg" | "tts";
  prompt: string;
  title?: string;
  style_hint?: string;
  model_override?: string;
  depends_on?: number;
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
    "Create media and add to canvas. Model selection is AUTOMATIC — just specify the action (generate/restyle/animate/upscale/remove_bg/tts) and prompt. Do NOT set model_override; the system picks the best available model. Use this for ALL media creation.",
  parameters: {
    type: "object",
    properties: {
      steps: {
        type: "array",
        description: "Array of media creation steps. Steps with depends_on execute after their dependency.",
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

      // Resolve capability through live registry (fuzzy-matches invalid names)
      const { capability, type } = selectCapability(
        step.action,
        step.style_hint,
        step.model_override
      );

      const refId = `media_${Date.now()}_${i}`;
      const title = step.title || step.prompt.slice(0, 40);

      // Create card (spinner shows while generating)
      const card = canvas.addCard({ type, title, refId });

      // Build params — inject dependency URL
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
      }

      // Run inference with the validated capability
      const t0 = performance.now();
      try {
        const result = await runInference({
          capability,
          prompt: step.prompt,
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

        if (r.error) {
          canvas.updateCard(card.id, { error: r.error as string });
          results.push({ refId, cardId: card.id, error: r.error as string, capability, elapsed });
        } else if (url) {
          canvas.updateCard(card.id, { url });
          results.push({ refId, cardId: card.id, url, capability, elapsed });
        } else {
          canvas.updateCard(card.id, { error: "No media returned" });
          results.push({ refId, cardId: card.id, error: "No media returned", capability, elapsed });
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
        const error = e instanceof Error ? e.message : "Unknown error";
        canvas.updateCard(card.id, { error });
        results.push({ refId, cardId: card.id, error, capability, elapsed });
      }
    }

    const summary = results
      .map(
        (r) =>
          `${r.refId}: ${r.capability} (${(r.elapsed / 1000).toFixed(1)}s)${r.error ? ` ERROR: ${r.error}` : ""}`
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
