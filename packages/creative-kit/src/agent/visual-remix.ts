/**
 * Visual Remix — reference-driven generation.
 *
 * "Make something like this but darker" → takes a reference image,
 * extracts style signals, and applies them to new generations.
 *
 * Supports multiple remix modes:
 * - style_transfer: keep the visual style, change the content
 * - variation: similar content with creative variation
 * - mashup: combine reference with a new prompt
 * - evolve: iteratively refine toward a direction
 */

export type RemixMode = "style_transfer" | "variation" | "mashup" | "evolve";

export interface RemixRequest {
  /** URL of the reference image/video */
  referenceUrl: string;
  /** What to change or create */
  prompt: string;
  /** How close to stay to the reference (0.0 = very different, 1.0 = nearly identical) */
  similarity: number;
  /** Remix mode */
  mode: RemixMode;
  /** Optional: specific aspects to preserve (e.g., "color palette", "composition") */
  preserve?: string[];
}

export interface RemixPlan {
  /** The capability to use */
  capability: string;
  /** The effective prompt (reference + user prompt merged) */
  effectivePrompt: string;
  /** Parameters for the inference call */
  params: Record<string, unknown>;
  /** Why this approach was chosen */
  reasoning: string;
}

/**
 * Plan a remix — decides which capability and params to use
 * based on the remix mode and similarity level.
 */
export function planRemix(request: RemixRequest): RemixPlan {
  const { referenceUrl, prompt, similarity, mode, preserve } = request;

  // Build effective prompt based on mode
  let effectivePrompt: string;
  let capability: string;
  const params: Record<string, unknown> = {};
  let reasoning: string;

  switch (mode) {
    case "style_transfer":
      // Use kontext-edit: strongest style guidance
      capability = "kontext-edit";
      effectivePrompt = `Apply the visual style of the reference image. ${prompt}. Maintain the exact artistic technique, color palette, and rendering style.`;
      params.image_url = referenceUrl;
      reasoning = "kontext-edit preserves style while changing content";
      break;

    case "variation":
      // Use the reference as init image with controlled noise
      if (similarity > 0.7) {
        // High similarity: kontext-edit with subtle changes
        capability = "kontext-edit";
        effectivePrompt = `Subtle variation: ${prompt}. Keep composition and style very close to the original.`;
        params.image_url = referenceUrl;
      } else {
        // Lower similarity: generate new with style hints from reference
        capability = "flux-dev";
        effectivePrompt = `Inspired by the reference image style: ${prompt}`;
        // Use VACE-style reference if available
        params.image_url = referenceUrl;
      }
      reasoning = `Variation at ${Math.round(similarity * 100)}% similarity`;
      break;

    case "mashup":
      // Combine reference with new prompt — reference-to-video for video, kontext for image
      capability = "kontext-edit";
      effectivePrompt = `Blend the reference image with: ${prompt}. Create a seamless fusion of both visual concepts.`;
      params.image_url = referenceUrl;
      reasoning = "Mashup blends reference with new concept";
      break;

    case "evolve":
      // Iterative refinement — low noise, keep structure
      capability = "kontext-edit";
      effectivePrompt = `Evolve this image: ${prompt}. ${preserve?.length ? `Preserve: ${preserve.join(", ")}.` : ""} Make subtle, refined changes.`;
      params.image_url = referenceUrl;
      reasoning = "Evolve makes incremental refinements";
      break;
  }

  return { capability, effectivePrompt, params, reasoning };
}

/**
 * Detect remix intent from natural language.
 * Returns a partial RemixRequest if detected, null otherwise.
 */
export function detectRemixIntent(text: string): Partial<RemixRequest> | null {
  const lower = text.toLowerCase();

  // "like this but..." patterns
  if (/\b(like this|similar to|inspired by|based on|remix|variation of|evolve|refine|same style|same aesthetic|same vibe|same look)\b/.test(lower)) {
    let mode: RemixMode = "variation";
    let similarity = 0.5;

    if (/\b(style|aesthetic|look|feel|vibe)\b/.test(lower)) {
      mode = "style_transfer";
      similarity = 0.7;
    }
    if (/\b(but|with|change|make it|transform)\b/.test(lower)) {
      mode = "mashup";
      similarity = 0.4;
    }
    if (/\b(evolve|refine|subtle|slightly|tweak)\b/.test(lower)) {
      mode = "evolve";
      similarity = 0.8;
    }
    if (/\b(very similar|almost the same|close to|faithful)\b/.test(lower)) {
      similarity = 0.9;
    }
    if (/\b(very different|completely new|reimagine|radical)\b/.test(lower)) {
      similarity = 0.2;
    }

    return { mode, similarity, prompt: text };
  }

  return null;
}
