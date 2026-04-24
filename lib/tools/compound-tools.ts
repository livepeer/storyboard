import type { ToolDefinition } from "./types";
import { useCanvasStore } from "@/lib/canvas/store";
import { runInference } from "@/lib/sdk/client";
import { resolveCapability, isValidCapability, getCachedCapabilities } from "@/lib/sdk/capabilities";
import { useSkillStore } from "@/lib/skills/store";
import { useChatStore } from "@/lib/chat/store";
import { useSessionContext } from "@/lib/agents/session-context";
import { useProjectStore } from "@/lib/projects/store";
import { routeModel, recordModelLatency } from "@livepeer/creative-kit";
import type { CardType } from "@/lib/canvas/types";

/**
 * Request-scoped user text. Preferred over the legacy global.
 * Set by the plugin before running the agent, read by selectCapability.
 *
 * Legacy global kept for backward compatibility during transition.
 * New code should use RequestContext instead.
 */
let currentUserText = "";
let _activeRequestId = "";

export function setCurrentUserText(text: string, requestId?: string): void {
  currentUserText = text;
  if (requestId) _activeRequestId = requestId;
}

/** Get the current user text (from active request context or legacy global). */
function getUserText(): string {
  return currentUserText;
}

/**
 * Fallback chains for capability-level retry. When a capability fails
 * with a recoverable error (empty response, upstream policy rejection,
 * 5xx from upstream), we try the next capability in its chain BEFORE
 * reporting failure to the user. Only same-type fallbacks (image→image,
 * video→video) so the card type never flips mid-step.
 *
 * Rationale: Google Veo has aggressive safety filters and rejects
 * benign content like "young girl + sky lantern". LTX-i2v, trained on
 * different data with less content filtering, usually accepts the
 * same prompt. Rather than forcing the user to re-prompt, cycle
 * transparently and only surface failure if every option in the
 * chain has exhausted.
 */
export const FALLBACK_CHAINS: Record<string, string[]> = {
  // Image generation
  "flux-dev": ["seedream-5-lite", "flux-schnell", "recraft-v4", "gemini-image", "nano-banana"],
  "flux-schnell": ["flux-dev", "recraft-v4"],
  "recraft-v4": ["flux-dev", "flux-schnell"],
  "gemini-image": ["flux-dev", "nano-banana"],
  "nano-banana": ["flux-dev", "gemini-image"],
  "seedream-5-lite": ["flux-dev", "flux-schnell", "recraft-v4"],

  // Image edit
  "kontext-edit": ["flux-fill", "gemini-image"],
  "flux-fill": ["kontext-edit"],

  // Video image-to-video (Kling O3 4K is the premium tier)
  "kling-o3-i2v": ["kling-v3-i2v", "seedance-i2v", "veo-i2v"],
  "kling-v3-i2v": ["kling-o3-i2v", "seedance-i2v", "veo-i2v"],
  "veo-i2v": ["seedance-i2v", "kling-o3-i2v", "ltx-i2v", "pixverse-i2v"],
  "seedance-i2v": ["seedance-i2v-fast", "kling-o3-i2v", "veo-i2v", "ltx-i2v"],
  "seedance-i2v-fast": ["seedance-i2v", "veo-i2v", "ltx-i2v"],
  "ltx-i2v": ["seedance-i2v-fast", "veo-i2v", "pixverse-i2v"],
  "pixverse-i2v": ["seedance-i2v-fast", "veo-i2v", "ltx-i2v"],
  "kling-i2v": ["kling-o3-i2v", "seedance-i2v", "veo-i2v", "ltx-i2v"],

  // Video text-to-video (Kling O3 4K for premium)
  "kling-o3-t2v": ["kling-v3-t2v", "veo-t2v", "ltx-t2v"],
  "kling-v3-t2v": ["kling-o3-t2v", "veo-t2v", "ltx-t2v"],
  "veo-t2v": ["kling-o3-t2v", "ltx-t2v", "pixverse-t2v"],
  "ltx-t2v": ["veo-t2v", "kling-v3-t2v", "pixverse-t2v"],
  "pixverse-t2v": ["veo-t2v", "ltx-t2v"],

  // Kling O3 reference-to-video (unique — no direct fallback)
  "kling-o3-ref2v": ["kling-o3-i2v", "seedance-i2v"],

  // Video transition
  "veo-transition": ["pixverse-transition"],
  "pixverse-transition": ["veo-transition"],

  // TTS
  "chatterbox-tts": ["gemini-tts", "inworld-tts", "grok-tts"],
  "gemini-tts": ["chatterbox-tts", "inworld-tts", "grok-tts"],
  "inworld-tts": ["gemini-tts", "chatterbox-tts"],
  "grok-tts": ["gemini-tts", "chatterbox-tts"],
  // 3D models
  "tripo-i3d": ["tripo-p1-i3d"],
  "tripo-t3d": ["tripo-p1-t3d"],
  "tripo-p1-i3d": ["tripo-i3d"],
  "tripo-p1-t3d": ["tripo-t3d"],
  // bg-remove, topaz-upscale, chatterbox-tts, lipsync, music, sfx,
  // face-swap, sam3, talking-head, veo-transition → single model,
  // no fallback chain.
};

/**
 * Given a capability name and the live capability list, return the
 * ordered attempt list: [initial, ...chained-fallbacks-that-exist].
 * Fallbacks that aren't in the live registry are silently dropped.
 */
export function buildAttemptChain(initialCap: string, liveCapNames: Set<string>): string[] {
  const chain = FALLBACK_CHAINS[initialCap] ?? [];
  const liveFallbacks = chain.filter((c) => liveCapNames.has(c));
  // If the initial capability itself isn't live (cold cache, etc.),
  // don't waste a round-trip on it — start with the first live sibling.
  // Only drop it if we actually have a live alternative.
  const attempts = liveCapNames.size > 0 && !liveCapNames.has(initialCap) && liveFallbacks.length > 0
    ? liveFallbacks
    : [initialCap, ...liveFallbacks];
  // De-duplicate while preserving order
  return Array.from(new Set(attempts));
}

// Re-export from creative-kit — these were originally defined here,
// now extracted to the framework for reuse across apps.
import { extractFalError as _extractFalError, isRecoverableFailure as _isRecoverableFailure } from "@livepeer/creative-kit";
export const extractFalError = _extractFalError;
export const isRecoverableFailure = _isRecoverableFailure;

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
  /** Video duration in seconds (for animate action). Passed to i2v models. */
  duration?: number;
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
      const isVideo = id.includes("i2v") || id.includes("t2v") || id.includes("transition") || id.includes("pixverse") || id.includes("inpaint") || id.includes("seedance");
      const isAudio = id.includes("tts");
      const is3D = id.includes("3d");
      return {
        capability: resolved,
        type: isVideo ? "video" : isAudio ? "audio" : is3D ? "image" : "image",
      };
    }
  }

  // Detect explicit model name in user text: "using pixverse", "with tripo",
  // "grok tts", etc. This lets users bypass the automatic routing.
  const userModelMention = getUserText().match(
    /\b(?:using|with|via|use)\s+(pixverse|tripo|grok|inworld|gemini.tts|void|seedance|seedream)/i
  ) || getUserText().match(
    /\b(pixverse|tripo|grok.tts|inworld.tts|void.inpaint|seedance|seedream|kling)\b/i
  );
  if (userModelMention) {
    const mention = userModelMention[1].toLowerCase().replace(/[.\s]+/g, "-");
    // Map user mentions to capability names
    const mentionMap: Record<string, { capability: string; type: CardType }> = {
      "pixverse": { capability: hasSourceUrl ? "pixverse-i2v" : "pixverse-t2v", type: "video" },
      "pixverse-t2v": { capability: "pixverse-t2v", type: "video" },
      "pixverse-i2v": { capability: "pixverse-i2v", type: "video" },
      "tripo": { capability: hasSourceUrl ? "tripo-i3d" : "tripo-t3d", type: "image" },
      "tripo-t3d": { capability: "tripo-t3d", type: "image" },
      "tripo-i3d": { capability: "tripo-i3d", type: "image" },
      "grok-tts": { capability: "grok-tts", type: "audio" },
      "inworld-tts": { capability: "inworld-tts", type: "audio" },
      "gemini-tts": { capability: "gemini-tts", type: "audio" },
      "void-inpaint": { capability: "void-inpaint", type: "video" },
      "seedance": { capability: hasSourceUrl ? "seedance-i2v" : "veo-t2v", type: "video" },
      "seedream": { capability: "seedream-5-lite", type: "image" },
      "kling": { capability: hasSourceUrl ? "kling-o3-i2v" : "kling-o3-t2v", type: "video" },
    };
    const match = mentionMap[mention];
    if (match) {
      // Check live registry first, fall back to known capabilities if cache is cold.
      // Without this fallback, a cold cache silently drops the user's model request.
      const live = getCachedCapabilities();
      const isLive = live
        ? live.some((c) => c.name === match.capability)
        : isValidCapability(match.capability);
      if (isLive) {
        console.log(`[selectCapability] User requested "${mention}" → ${match.capability}`);
        return match;
      }
    }
  }

  // Detect "user wants video" from the prompt text. This must be
  // STRICT — the step.prompt here is what Gemini wrote, not what the
  // user said. Gemini inherits style language ("cinematic", "Ghibli",
  // "8-second") from the CreativeContext, so a loose regex matches
  // every generate call when there's a cinematic context active. The
  // rule: require BOTH an explicit duration AND a video noun.
  //
  // We also check `currentUserText` (set by the plugin before
  // runStream) because Gemini often rewrites the user's edit request
  // as a pure scene description in step.prompt, stripping the edit
  // verbs. The user-text fallback catches cases where the user
  // clearly wanted an edit but Gemini's expansion lost the intent.
  const lowerPrompt = (promptText ?? "").toLowerCase();
  const lowerUser = getUserText().toLowerCase();
  const combinedText = `${lowerPrompt} ${lowerUser}`.trim();
  const lowerHint = (styleHint ?? "").toLowerCase();
  // Video-intent check uses USER text (strict) not Gemini's rewritten
  // prompt. This prevents cinematic style inheritance from routing
  // image requests to veo-t2v.
  const hasVideoNoun = /\b(video|clip|footage|animation)\b/.test(lowerUser);
  const hasDuration = /\b\d+[- ]second\b/.test(lowerUser);
  const explicitMakeVideo = /\b(make|generate|create|produce)\s+(a|an|me\s+a|me\s+an)?\s*\d*[- ]?\s*seconds?\s*(video|clip|animation|movie)\b/.test(lowerUser);
  const mentionsVideoModel = /\b(pixverse|veo|ltx|seedance)\b/.test(lowerUser) && hasVideoNoun;
  const asksForVideo = (hasVideoNoun && hasDuration) || explicitMakeVideo || mentionsVideoModel;

  // Motion verbs that indicate the user wants an animation (image -> video).
  // Checked on BOTH the user text AND Gemini's expanded prompt (either
  // source is allowed to signal motion).
  const motionVerbs = /\b(pan|tilt|zoom|push(?:-in| in)?|pull(?:-out| out)?|dolly|drift|sweep|rotate|move|fly|float|rise|fall|swirl|spin|shake|tremble|rustl\w*|flutter\w*|wind|breeze|ripple|wave|flow|cascade|gust|storm|rain|snow|drip|splash)\b/;
  // Edit verbs — checked primarily on USER text (Gemini strips them
  // when rewriting prompts). Extended keyword set: explicit iteration
  // words ("regenerate", "redo", "redraw", "iterate", "fix"), visual
  // modifiers ("deeper shadows", "tear", "still"), and any "scene N"
  // reference (a strong signal the user is editing an existing scene).
  const editVerbs = /\b(add|remove|change|make\s+\w+\s+(darker|lighter|brighter|softer|warmer|cooler|redder|bluer|greener)|with\s+(a|an|some|deeper|softer|stronger)\s|without\s|replace|adjust|tweak|darken|lighten|brighten|deepen|soften|sharpen|crop|blur|recolor|tint|regenerate|redo|redraw|re-?do|iterate|fix|refine|tweak|update|edit|modify|scene\s*#?\s*\d+|deeper\s+\w+|a\s+single\s+|too\s+(bright|dark|warm|cold|busy|empty|light)|feels\s+(too|like|kind\s+of))\b/;
  const hasMotion = motionVerbs.test(combinedText);
  const hasEditIntent = editVerbs.test(lowerUser) || editVerbs.test(lowerPrompt);

  const valid = getCachedCapabilities();
  const hasVeoT2V = !!valid && valid.some((c) => c.name === "veo-t2v");
  const hasVeoI2V = !!valid && valid.some((c) => c.name === "veo-i2v");

  switch (action) {
    case "generate": {
      // Text-to-video path: ONLY if the prompt has an unambiguous video
      // intent (duration + video noun, or "make a video" phrasing).
      if (asksForVideo) {
        const wants4KGen = /\b(4k|ultra|highest.quality|cinema|premium)\b/.test(lowerUser);
        const hasKlingT2V = !!valid && valid.some((c) => c.name === "kling-o3-t2v");
        if (wants4KGen && hasKlingT2V) return { capability: "kling-o3-t2v", type: "video" };
        if (hasVeoT2V) return { capability: "veo-t2v", type: "video" };
        if (valid && valid.some((c) => c.name === "ltx-t2v")) {
          return { capability: "ltx-t2v", type: "video" };
        }
      }

      // Smart model router — scores speed (60%), style match (30%), capacity (10%).
      // flux-dev wins by default (speed=9) unless the prompt has strong style
      // signals that favor another model (e.g., "logo" → gpt-image).
      const liveSet = new Set((valid || []).map((c: { name: string }) => c.name));
      const routed = routeModel({
        action: "generate",
        prompt: lowerPrompt,
        styleHint: lowerHint,
        userText: lowerUser,
        availableModels: liveSet.size > 0 ? liveSet : undefined,
      });
      console.log(`[selectCapability] generate → ${routed.model} (${routed.reason})`);
      return { capability: routed.model, type: routed.type as CardType };
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
      // Detect 4K / high-quality intent from user text
      const userText = getUserText().toLowerCase();
      const wants4K = /\b(4k|ultra|highest.quality|cinema|premium)\b/.test(userText);
      const hasKlingO3 = !!valid && valid.some((c) => c.name === "kling-o3-i2v");
      const hasKlingO3T2V = !!valid && valid.some((c) => c.name === "kling-o3-t2v");

      if (!hasSourceUrl) {
        // Text-to-video: prefer Kling O3 4K for premium requests
        if (wants4K && hasKlingO3T2V) return { capability: "kling-o3-t2v", type: "video" };
        if (hasVeoT2V) return { capability: "veo-t2v", type: "video" };
        if (valid && valid.some((c) => c.name === "ltx-t2v")) {
          return { capability: "ltx-t2v", type: "video" };
        }
      }
      if (hasSourceUrl && hasEditIntent && !hasMotion) {
        return { capability: "kontext-edit", type: "image" };
      }
      // Image-to-video: Kling O3 4K for premium, Seedance for default
      if (wants4K && hasKlingO3) return { capability: "kling-o3-i2v", type: "video" };
      const hasSeedance = !!valid && valid.some((c) => c.name === "seedance-i2v");
      if (hasSeedance) return { capability: "seedance-i2v", type: "video" };
      if (hasKlingO3) return { capability: "kling-o3-i2v", type: "video" };
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

    // Lock model per action across all steps for style consistency.
    // Once the router picks "flux-dev" for step 0 (generate), ALL subsequent
    // generate steps use the same model. Prevents mixed styles in multi-scene projects.
    const lockedCapability: Record<string, { capability: string; type: CardType }> = {};

    // Whether steps can run in parallel — true when no step depends on another step's output.
    // steps with depends_on reference results[N].url, so they must wait for step N.
    // Film animation, storyboard generation: all steps are independent → parallel.
    const hasCrossStepDeps = rawSteps.some((s) => s.depends_on !== undefined);

    // Per-step inference closures — populated in setup loop, fired in parallel or serial.
    type InferenceTask = () => Promise<void>;
    const inferenceTasks: InferenceTask[] = [];

    for (let i = 0; i < rawSteps.length; i++) {
      const step = rawSteps[i];

      // Apply session creative context + style-override skills
      // Session context = persistent style/character/setting from the original brief
      // Style overrides = loaded skills (ghibli, kids-drawing, etc.)
      //
      // IMPORTANT: for action:"animate" steps (image-to-video), we use
      // a motion-only prefix that keeps style+mood+palette but drops
      // characters+setting. The source image already carries character
      // and setting visually; re-declaring them in the prompt confuses
      // the video model AND trips safety filters (Google Veo rejects
      // "young girl + fire" even when the scene is a benign lantern
      // festival). See buildMotionPrefixFromContext for the rationale.
      let sessionPrefix = "";
      if (step.action !== "tts") {
        const isAnimate = step.action === "animate";
        // Check for active episode — use its effective context if present
        try {
          const { useEpisodeStore } = await import("@/lib/episodes/store");
          const { buildPrefixFromContext, buildMotionPrefixFromContext } = await import(
            "@/lib/agents/session-context"
          );
          const epStore = useEpisodeStore.getState();
          const activeEp = epStore.getActiveEpisode();
          if (activeEp) {
            const storyboardCtx = useSessionContext.getState().context;
            if (storyboardCtx) {
              const effective = epStore.getEffectiveContext(activeEp.id, storyboardCtx);
              if (effective) {
                sessionPrefix = isAnimate
                  ? buildMotionPrefixFromContext(effective)
                  : buildPrefixFromContext(effective);
              }
            }
          }
        } catch { /* episode store not available */ }
        // Fallback to session context if no episode active
        if (!sessionPrefix) {
          if (isAnimate) {
            const ctx = useSessionContext.getState().context;
            if (ctx) {
              const { buildMotionPrefixFromContext } = await import(
                "@/lib/agents/session-context"
              );
              sessionPrefix = buildMotionPrefixFromContext(ctx);
            }
          } else {
            sessionPrefix = useSessionContext.getState().buildPrefix();
          }
        }
      }
      const styled = step.action !== "tts"
        ? applyStyleOverrides(step.prompt, step.action)
        : { prompt: step.prompt };
      const effectivePrompt = sessionPrefix + styled.prompt;
      if (sessionPrefix) {
        console.log(`[create_media] Session context injected (${sessionPrefix.split(/\s+/).length} words): "${sessionPrefix.slice(0, 80)}..."`);
      }

      // Resolve capability — locked per action for style consistency.
      // First step of each action type selects the model; all subsequent
      // steps of the same action reuse it (prevents mixed styles).
      const stepSourceUrl = step.source_url
        || (step.depends_on !== undefined && results[step.depends_on]?.url);

      let capability: string;
      let type: CardType;
      let routeReason = "auto";
      const explicitOverride = step.model_override || ("modelHint" in styled ? styled.modelHint : undefined) as string | undefined;

      if (explicitOverride) {
        // Explicit model override always wins (no locking)
        ({ capability, type } = selectCapability(step.action, step.style_hint, explicitOverride, !!stepSourceUrl, effectivePrompt));
        routeReason = "user override";
      } else if (lockedCapability[step.action]) {
        // Reuse the model selected for the first step of this action
        ({ capability, type } = lockedCapability[step.action]);
        routeReason = "model locked (consistency)";
      } else {
        // First step of this action — select and lock
        ({ capability, type } = selectCapability(step.action, step.style_hint, undefined, !!stepSourceUrl, effectivePrompt));
        lockedCapability[step.action] = { capability, type };
        if (rawSteps.filter((s) => s.action === step.action).length > 1) {
          console.log(`[create_media] Locked model for "${step.action}": ${capability} (${rawSteps.filter((s) => s.action === step.action).length} steps)`);
        }
      }

      // Friendly names: project-prefixed, easy to reference in chat
      // With project: "ev-bikes.img-1", "sunset.vid-2"
      // Without: "img-1", "vid-2"
      const typePrefix: Record<string, string> = {
        image: "img", video: "vid", audio: "aud", stream: "str",
      };
      const cardNum = useCanvasStore.getState().cards.length + 1;
      const activeProj = useProjectStore?.getState?.()?.getActiveProject?.();
      const projPrefix = activeProj ? `${activeProj.id.split("_")[0]}.` : "";
      const refId = `${projPrefix}${typePrefix[type] || "med"}-${cardNum}`;
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

      // Auto-detect portrait orientation for person/fashion prompts.
      // Flux-dev defaults to landscape 1024×768 which squeezes full-body
      // subjects into a small area, causing perceived "blur". Setting
      // portrait (768×1024) fills the frame properly.
      if (
        type === "image" &&
        !step.source_url &&
        /\b(person|woman|man|girl|boy|portrait|full.body|standing|fashion|model|wear|clothing|dress|outfit)\b/i.test(effectivePrompt)
      ) {
        params.image_size = { width: 768, height: 1024 };
      }
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

      // Store raw duration for per-model adaptation in the fallback loop.
      // Each i2v model has different duration formats — seedance wants
      // string "10", veo/ltx don't accept it at all.
      const rawDuration = step.duration && step.action === "animate" ? step.duration : 0;

      // Face Lock: inject reference image for character consistency.
      // Must happen BEFORE attemptChain is built so the chain uses kontext-edit.
      try {
        const faceLockProject = useProjectStore?.getState?.()?.getActiveProject?.();
        const faceLock = (faceLockProject as any)?.faceLock as { refId: string; url: string } | undefined;
        if (faceLock?.url && !params.image_url) {
          if (step.action === "generate" || step.action === "restyle") {
            params.image_url = faceLock.url;
            // Override capability to kontext-edit — it's the only model that
            // preserves the reference face. Text-to-image models ignore image_url.
            capability = "kontext-edit";
            routeReason = "face lock active";
            console.log(`[create_media] Face lock active (${faceLock.refId}) → kontext-edit`);
          } else if (step.action === "animate" && !step.source_url) {
            params.image_url = faceLock.url;
            console.log(`[create_media] Face lock active (${faceLock.refId}) → first frame`);
          }
        }
      } catch { /* non-critical */ }

      // Build the fallback chain AFTER face lock override so it uses
      // the correct capability (kontext-edit when locked, original otherwise).
      const liveCapNames = new Set(
        (getCachedCapabilities() || []).map((c: { name: string }) => c.name)
      );
      const attemptChain = buildAttemptChain(capability, liveCapNames);

      // Capture all loop-local variables for the inference closure.
      // The setup loop keeps running (model locking, card creation)
      // while inferences are deferred until Phase 2.
      const _i = i;
      const _step = step;
      const _card = card;
      const _refId = refId;
      const _params = { ...params };
      const _capability = capability;
      const _effectivePrompt = effectivePrompt;
      const _attemptChain = [...attemptChain];
      const _rawDuration = rawDuration;
      const _routeReason = routeReason;

      inferenceTasks.push(async () => {
        let stepDone = false;
        let lastAttempt:
          | { error: string; capability: string; elapsed: number }
          | undefined;

        for (let attemptIdx = 0; attemptIdx < _attemptChain.length; attemptIdx++) {
          const currentCap = _attemptChain[attemptIdx];

          if (attemptIdx > 0) {
            const prev = _attemptChain[attemptIdx - 1];
            useChatStore
              .getState()
              .addMessage(`${prev} failed — trying ${currentCap}…`, "system");
            console.log(`[create_media] Fallback: ${prev} → ${currentCap} (step ${_i})`);
          }

          const capParams = { ..._params };
          if (_rawDuration && currentCap.startsWith("seedance")) {
            capParams.duration = String(_rawDuration);
            capParams.generate_audio = true;
          } else if (currentCap.startsWith("kling-")) {
            if (currentCap === "kling-v3-i2v" && capParams.image_url) {
              capParams.start_image_url = capParams.image_url;
              delete capParams.image_url;
            }
            if (_rawDuration) capParams.duration = _rawDuration;
            capParams.generate_audio = true;
            if (currentCap.includes("-o3-")) {
              delete capParams.negative_prompt;
              delete capParams.cfg_scale;
            }
          } else {
            delete capParams.duration;
            delete capParams.generate_audio;
          }

          const t0 = performance.now();
          try {
            const result = await runInference({
              capability: currentCap,
              prompt: _effectivePrompt,
              params: capParams,
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

            let url: string | undefined =
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

            if (!url && typeof data === "object") {
              url = Object.values(data).find(
                (v) => typeof v === "string" && (v as string).startsWith("http")
              ) as string | undefined;
            }

            const topError = r.error as string | undefined;
            const dataError = data.error as string | undefined;
            const falError = extractFalError(data);
            const effectiveError = topError || dataError || falError;

            if (url && !effectiveError) {
              recordModelLatency(currentCap, elapsed);
              const fallbackNote = attemptIdx > 0 ? ` (fallback from ${_attemptChain[0]})` : "";
              const genMeta = { capability: currentCap, prompt: _effectivePrompt, elapsed, routeReason: _routeReason + fallbackNote };
              console.log(`[create_media] ${_refId} → ${currentCap} → ${url.slice(0, 120)} (${(elapsed / 1000).toFixed(1)}s)`);
              // Debug: log response keys to help diagnose black images
              console.log(`[create_media] ${_refId} response keys:`, Object.keys(data).join(","), "| nsfw:", (data as any).has_nsfw_concepts, (data as any).nsfw_content_detected);

              // Detect filtered/black images from content safety
              const nsfwFlags = [
                (data as any).has_nsfw_concepts,
                (data as any).nsfw_content_detected,
                (r as any).has_nsfw_concepts,
                (r as any).nsfw_content_detected,
              ];
              const isFiltered = nsfwFlags.some((f) =>
                f === true || (Array.isArray(f) && f[0] === true)
              );
              if (isFiltered) {
                console.warn(`[create_media] ${_refId}: NSFW/safety filter triggered — image may be black`);
                canvas.updateCard(_card.id, {
                  url, // still set URL so user can inspect
                  error: "Content filter triggered — the image may be black. Try rephrasing the prompt.",
                  ...genMeta,
                });
                results[_i] = { refId: _refId, cardId: _card.id, url, error: "Content filter", capability: currentCap, elapsed };
                stepDone = true;
                break;
              }

              canvas.updateCard(_card.id, { url, error: undefined, ...genMeta });
              results[_i] = { refId: _refId, cardId: _card.id, url, capability: currentCap, elapsed };
              if (_step.depends_on !== undefined && results[_step.depends_on]) {
                canvas.addEdge(results[_step.depends_on].refId, _refId, {
                  capability: currentCap,
                  prompt: _step.prompt,
                  action: _step.action,
                  elapsed,
                });
              }
              stepDone = true;
              break;
            }

            const failMsg = effectiveError
              ? humanizeError(effectiveError)
              : `No output from ${currentCap}`;
            console.warn(`[create_media] ${currentCap} attempt failed: ${failMsg}`);
            lastAttempt = { error: failMsg, capability: currentCap, elapsed };

            if (!isRecoverableFailure(failMsg)) break;
          } catch (e) {
            const elapsed = performance.now() - t0;
            const raw = e instanceof Error ? e.message : "Unknown error";
            const friendly = humanizeError(raw);
            console.warn(`[create_media] ${currentCap} threw: ${raw}`);
            lastAttempt = { error: friendly, capability: currentCap, elapsed };
            if (!isRecoverableFailure(friendly)) break;
          }
        }

        if (!stepDone) {
          const finalErr = lastAttempt?.error || `No output from any of: ${_attemptChain.join(", ")}`;
          const finalCap = lastAttempt?.capability || _capability;
          const finalElapsed = lastAttempt?.elapsed || 0;
          canvas.updateCard(_card.id, {
            error: finalErr,
            capability: finalCap,
            prompt: _effectivePrompt,
            elapsed: finalElapsed,
          });
          results[_i] = {
            refId: _refId,
            cardId: _card.id,
            error: finalErr,
            capability: finalCap,
            elapsed: finalElapsed,
          };
        }
      });

      // For cross-step deps: run this step's inference immediately (sequential)
      // so subsequent steps can read results[i].url in their setup.
      if (hasCrossStepDeps) {
        await inferenceTasks[inferenceTasks.length - 1]();
      }
    }

    // Phase 2: fire all independent inferences in parallel.
    // (Cross-dep steps were already awaited above in the setup loop.)
    if (!hasCrossStepDeps && inferenceTasks.length > 0) {
      await Promise.allSettled(inferenceTasks.map((t) => t()));
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
