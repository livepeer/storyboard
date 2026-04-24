/**
 * Context Merger — resolves the effective style prefix for media generation.
 *
 * Merges 4 sources with clear precedence:
 *   1. Episode Override (highest — episode-specific style patch)
 *   2. Active Skills (style-override skills like "ghibli", "noir")
 *   3. Session Context (creative DNA from the original brief)
 *   4. Project Style Guide (from project_create — lowest)
 *
 * Returns a prompt prefix string + list of contributing sources.
 */

export interface CreativeContextLike {
  style: string;
  palette: string;
  characters: string;
  setting: string;
  rules: string;
  mood: string;
}

export interface SkillOverride {
  prompt_prefix?: string;
  prompt_suffix?: string;
  video_prompt_addition?: string;
  model_hint?: string;
}

export interface StyleResolution {
  /** The final prompt prefix to prepend */
  prefix: string;
  /** The final prompt suffix to append (from skills) */
  suffix: string;
  /** Model hint from active skill (if any) */
  modelHint?: string;
  /** Which sources contributed to the resolution */
  sources: string[];
  /** Any detected conflicts between sources */
  conflicts: string[];
}

/**
 * Build a prompt prefix from a creative context.
 * Joins style + characters + palette + setting + mood (~50 words max).
 */
export function buildPrefix(ctx: CreativeContextLike): string {
  const parts: string[] = [];
  if (ctx.style) parts.push(ctx.style);
  if (ctx.characters) parts.push(ctx.characters);
  if (ctx.palette) parts.push(ctx.palette);
  if (ctx.setting) parts.push(ctx.setting);
  if (ctx.mood) parts.push(ctx.mood);
  const prefix = parts.join(", ");
  return prefix ? prefix + ", " : "";
}

/**
 * Build a motion-only prefix for video generation.
 * Drops characters + setting (already in source image visually).
 * Keeps style + mood + palette to maintain visual consistency.
 */
export function buildMotionPrefix(ctx: CreativeContextLike): string {
  const parts: string[] = [];
  if (ctx.style) parts.push(ctx.style);
  if (ctx.mood) parts.push(ctx.mood);
  if (ctx.palette) parts.push(ctx.palette);
  const prefix = parts.join(", ");
  return prefix ? prefix + ", " : "";
}

/**
 * Merge an episode override with a base context.
 * Episode fields override base fields (non-empty only).
 */
export function mergeWithEpisode(
  base: CreativeContextLike,
  episode: Partial<CreativeContextLike>,
): CreativeContextLike {
  return {
    style: episode.style || base.style,
    palette: episode.palette || base.palette,
    characters: episode.characters || base.characters,
    setting: episode.setting || base.setting,
    rules: episode.rules || base.rules,
    mood: episode.mood || base.mood,
  };
}

/**
 * Resolve the effective style for a media generation step.
 *
 * @param action - "generate" | "animate" | "restyle" | "tts"
 * @param prompt - The step's prompt text
 * @param sources - Available style sources
 */
export function resolveStyle(
  action: string,
  prompt: string,
  sources: {
    sessionContext?: CreativeContextLike | null;
    episodeOverride?: Partial<CreativeContextLike> | null;
    skills?: SkillOverride[];
    projectPrefix?: string;
    projectSuffix?: string;
  },
): StyleResolution {
  const resolution: StyleResolution = {
    prefix: "",
    suffix: "",
    sources: [],
    conflicts: [],
  };

  // TTS actions get no style prefix
  if (action === "tts") return resolution;

  const isAnimate = action === "animate";

  // 1. Start with session context (base)
  let effectiveCtx: CreativeContextLike | null = sources.sessionContext || null;

  // 2. Apply episode override if present (highest priority for context)
  if (effectiveCtx && sources.episodeOverride) {
    const episodeFields = Object.entries(sources.episodeOverride).filter(([, v]) => v);
    if (episodeFields.length > 0) {
      effectiveCtx = mergeWithEpisode(effectiveCtx, sources.episodeOverride);
      resolution.sources.push("episode");
    }
  }

  // 3. Build prefix from effective context
  if (effectiveCtx) {
    resolution.prefix = isAnimate
      ? buildMotionPrefix(effectiveCtx)
      : buildPrefix(effectiveCtx);
    if (resolution.prefix) {
      resolution.sources.push(sources.episodeOverride ? "session+episode" : "session");
    }
  }

  // 4. Fall back to project style guide if no session context
  if (!resolution.prefix && sources.projectPrefix) {
    resolution.prefix = sources.projectPrefix;
    resolution.sources.push("project");
  }

  // 5. Apply skill overrides (prefix/suffix/model_hint)
  if (sources.skills && sources.skills.length > 0) {
    for (const skill of sources.skills) {
      if (skill.prompt_prefix) {
        resolution.prefix = skill.prompt_prefix + resolution.prefix;
        resolution.sources.push("skill");
      }
      if (skill.prompt_suffix) {
        resolution.suffix += skill.prompt_suffix;
      }
      if (isAnimate && skill.video_prompt_addition) {
        resolution.suffix += ", " + skill.video_prompt_addition;
      }
      if (skill.model_hint && !resolution.modelHint) {
        resolution.modelHint = skill.model_hint;
      }
    }

    // Conflict detection: if session says one style and skill says another
    if (effectiveCtx?.style && sources.skills.some((s) => s.prompt_prefix?.includes("photorealistic")) && effectiveCtx.style.includes("anime")) {
      resolution.conflicts.push("Session style 'anime' conflicts with skill 'photorealistic'");
    }
  }

  // 6. Apply suffix from project
  if (sources.projectSuffix) {
    resolution.suffix += sources.projectSuffix;
  }

  return resolution;
}
