import type { ToolDefinition } from "./types";
import { useCanvasStore } from "@/lib/canvas/store";
import { runInference } from "@/lib/sdk/client";
import type { CardType } from "@/lib/canvas/types";

interface MediaStep {
  action: "generate" | "restyle" | "animate" | "upscale" | "remove_bg" | "tts";
  prompt: string;
  title?: string;
  style_hint?: string;
  model_override?: string;
  depends_on?: number;
}

// Map action+style to best capability
function selectCapability(
  action: string,
  styleHint?: string,
  modelOverride?: string
): { capability: string; type: CardType } {
  if (modelOverride) {
    const isVideo = ["ltx-t2v", "ltx-i2v", "wan-v2v"].includes(modelOverride);
    const isAudio = ["chatterbox-tts"].includes(modelOverride);
    return {
      capability: modelOverride,
      type: isVideo ? "video" : isAudio ? "audio" : "image",
    };
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
 * Executes steps in dependency order, creates canvas cards, adds edges.
 * This is the main tool Claude should use for all media creation.
 */
export const createMediaTool: ToolDefinition = {
  name: "create_media",
  description:
    "Create media (image, video, audio, edit, upscale) and add to canvas. Handles model selection, parameters, and canvas placement. Use this for ALL media creation — single or multi-step.",
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
              description: "What to do",
            },
            prompt: { type: "string", description: "Text prompt" },
            title: { type: "string", description: "Card label on canvas" },
            style_hint: {
              type: "string",
              description: "Style hint for model selection: illustration, photorealistic, fast, cinematic",
            },
            model_override: {
              type: "string",
              description: "Override automatic model selection with a specific capability ID",
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
    const steps = input.steps as MediaStep[];
    if (!steps?.length) {
      return { success: false, error: "No steps provided" };
    }

    const canvas = useCanvasStore.getState();
    const results: Array<{
      refId: string;
      cardId: string;
      url?: string;
      error?: string;
      capability: string;
      elapsed: number;
    }> = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
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
          if (step.action === "animate") {
            params.image_url = dep.url;
          } else {
            params.image_url = dep.url;
          }
        }
        // Add edge
        canvas.addEdge(dep.refId, refId, {
          capability,
          prompt: step.prompt,
          action: step.action,
        });
      }

      // Run inference
      const t0 = performance.now();
      try {
        const result = await runInference({
          capability,
          prompt: step.prompt,
          params,
        });
        const elapsed = performance.now() - t0;

        // Extract URL
        const r = result as Record<string, unknown>;
        const data = (r.data ?? r) as Record<string, unknown>;
        const images = data.images as Array<{ url: string }> | undefined;
        const image = data.image as { url: string } | undefined;
        const video = data.video as { url: string } | undefined;

        const url =
          (r.image_url as string) ??
          images?.[0]?.url ??
          image?.url ??
          (r.video_url as string) ??
          video?.url ??
          (r.audio_url as string);

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

        // Update edge with elapsed
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
