// lib/agents/intent.ts

export type IntentType =
  | "new_project"
  | "continue"
  | "add_scenes"
  | "adjust_scene"
  | "style_correction"
  | "status"
  | "episode_switch"
  | "episode_create"
  | "video_strategy"
  | "none";

export interface Intent {
  type: IntentType;
  count?: number;
  sceneHint?: string;
  feedback?: string;
  direction?: string;
}

/**
 * Fast intent classification — regex-based, no LLM call.
 * Runs in <1ms. Falls through to "none" for the agent to handle.
 */
export function classifyIntent(
  text: string,
  hasActiveProject: boolean,
  pendingScenes: number
): Intent {
  const lower = text.toLowerCase().trim();

  // New project: long brief with scene markers
  if (
    text.length > 500 ||
    (/scene\s*\d/i.test(text) && (text.match(/scene/gi) || []).length >= 3)
  ) {
    return { type: "new_project" };
  }

  // Explicit continue
  if (/^(continue|keep going|go|next|do the rest|finish|carry on|proceed|go ahead)\.?$/i.test(lower))
    return { type: "continue" };
  if (/continue generating|keep going|finish (it|them|the rest)|do the rest|next batch|remaining scenes/i.test(lower))
    return { type: "continue" };

  // Add N more
  const moreCountMatch = lower.match(/(?:give|make|add|create|do|generate)\s+(?:me\s+)?(\d+)\s+more/i);
  if (moreCountMatch)
    return { type: "add_scenes", count: parseInt(moreCountMatch[1]), direction: text };

  if (hasActiveProject) {
    if (/(?:add|give|make|create)\s+(?:me\s+)?more|more scenes|expand.*stor|extend/i.test(lower))
      return { type: "add_scenes", count: 4, direction: text };
    if (/make.*(story|storyboard|it).*(more|better|interesting|dramatic|funny|exciting|emotional|longer)/i.test(lower))
      return { type: "add_scenes", count: 4, direction: text };
    if (/(?:i\s+)?(?:want|need)\s+more|not enough|too few|too short/i.test(lower))
      return { type: "add_scenes", count: 4, direction: text };

    // Adjust specific scene
    const sceneRef = lower.match(/scene\s*(\d+)|(\d+)(?:st|nd|rd|th)\s+(?:scene|one|image|picture|frame)/i);
    if (sceneRef && /change|adjust|redo|fix|update|too|more|less|different|rethink|modify|improve|tweak/i.test(lower))
      return { type: "adjust_scene", sceneHint: sceneRef[1] || sceneRef[2], feedback: text };
    if (/(?:the|that)\s+\w+\s+(?:scene|one|image|picture).*(?:needs?|should|could|is too|isn't|looks)/i.test(lower))
      return { type: "adjust_scene", feedback: text };

    // Pending scenes + vague short message → continue
    if (pendingScenes > 0 && lower.length < 30 && !/^(hey|hi|hello|thanks|ok|yes|no|what|how|why|can|please)/i.test(lower))
      return { type: "continue" };
  }

  // Style correction
  if (/wrong style|style is wrong|should be|use .*style|not.*right.*style|change.*style|switch.*style/i.test(lower))
    return { type: "style_correction", feedback: text };
  if (/do it again.*(?:in|with|using)|redo.*(?:in|with|using)|try again.*(?:in|with|using)/i.test(lower))
    return { type: "style_correction", feedback: text };

  // Status check
  if (/where.*(picture|image|scene|result)|don't see|can't see|nothing.*(show\w*|appear\w*|happen\w*)|no (picture|image|result)|still waiting|what happened/i.test(lower))
    return { type: "status" };

  // Episode management
  if (/switch.*episode|activate.*episode|go to.*episode|use.*episode/i.test(lower))
    return { type: "episode_switch", direction: text };
  if (/group.*episode|create.*episode|make.*episode|new episode/i.test(lower))
    return { type: "episode_create", direction: text };

  // Video strategy reply ("1", "2", "3", "overview", "full", "custom")
  if (/^(1|2|3|overview|full|custom|full coverage)\.?$/i.test(lower)) {
    return { type: "video_strategy", direction: text };
  }

  return { type: "none" };
}
