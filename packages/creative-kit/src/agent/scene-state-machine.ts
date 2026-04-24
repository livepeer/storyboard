/**
 * Scene State Machine — explicit lifecycle states for project scenes.
 *
 * Replaces the ambiguous "pending" status that could mean:
 * - waiting for initial image generation
 * - waiting for video animation (keyframe exists)
 * - waiting for regeneration after rejection
 *
 * Each state has valid transitions. Invalid transitions throw.
 */

export type SceneState =
  | "planning"           // initial state
  | "generating_image"   // image inference in progress
  | "image_done"         // image generated, can proceed to video or finish
  | "generating_video"   // video inference in progress (keyframe exists)
  | "video_done"         // video clip generated
  | "done"               // fully complete (image or image+video)
  | "failed";            // generation failed (with reason)

/** Valid transitions from each state. */
const TRANSITIONS: Record<SceneState, SceneState[]> = {
  planning:          ["generating_image"],
  generating_image:  ["image_done", "failed"],
  image_done:        ["generating_video", "done", "generating_image"], // regen goes back
  generating_video:  ["video_done", "failed"],
  video_done:        ["done", "generating_video"], // regen video
  done:              ["generating_image"], // full regenerate
  failed:            ["generating_image", "generating_video", "planning"], // retry
};

/** Check if a transition is valid. */
export function canTransition(from: SceneState, to: SceneState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Validate and perform a transition. Returns the new state or throws. */
export function transition(from: SceneState, to: SceneState): SceneState {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid scene transition: ${from} → ${to}`);
  }
  return to;
}

/** Map legacy status strings to SceneState. */
export function fromLegacyStatus(status: string, hasKeyframe: boolean): SceneState {
  switch (status) {
    case "pending":
      return hasKeyframe ? "image_done" : "planning";
    case "generating":
      return hasKeyframe ? "generating_video" : "generating_image";
    case "regenerating":
      return hasKeyframe ? "generating_video" : "generating_image";
    case "done":
      return "done";
    case "failed":
      return "failed";
    default:
      return "planning";
  }
}

/** Map SceneState back to legacy status string for backward compat. */
export function toLegacyStatus(state: SceneState): string {
  switch (state) {
    case "planning":
      return "pending";
    case "generating_image":
    case "generating_video":
      return "generating";
    case "image_done":
      return "pending"; // waiting for next phase
    case "video_done":
    case "done":
      return "done";
    case "failed":
      return "failed";
  }
}

/** Check if a scene needs more work. */
export function isActionable(state: SceneState): boolean {
  return state === "planning" || state === "image_done" || state === "failed";
}

/** Check if a scene is in a terminal state. */
export function isTerminal(state: SceneState): boolean {
  return state === "done";
}

/** Get a human-readable label for the state. */
export function stateLabel(state: SceneState): string {
  const labels: Record<SceneState, string> = {
    planning: "Planned",
    generating_image: "Generating image…",
    image_done: "Image ready",
    generating_video: "Generating video…",
    video_done: "Video ready",
    done: "Complete",
    failed: "Failed",
  };
  return labels[state];
}
