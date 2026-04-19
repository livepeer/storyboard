import type { PipelineItem } from "@livepeer/creative-kit";

export type SceneStatus = "pending" | "generating" | "done" | "rejected" | "regenerating";
export type ProjectStatus = "planning" | "generating" | "reviewing" | "iterating" | "complete";
export type SceneMediaType = "image" | "video" | "audio";

/**
 * Scene extends PipelineItem from creative-kit.
 * cardRefId is the storyboard name for artifactRefId.
 */
export interface Scene extends Omit<PipelineItem, "status"> {
  description: string;
  /** @deprecated Use artifactRefId. Kept for backwards compat. */
  cardRefId?: string;
  status: SceneStatus;
  dependsOn?: number[];
  mediaType: SceneMediaType;
  feedback?: string;
  iterations: number;
  action: "generate" | "restyle" | "animate" | "upscale" | "remove_bg" | "tts" | "video_keyframe";
  sourceUrl?: string;
  /** Per-scene visual language (appended to keyframe + video prompts) */
  visualLanguage?: string;
  /** Per-scene camera notes (appended to motion prompts only) */
  cameraNotes?: string;
  /** Per-scene score notes (stored, unused for now) */
  score?: string;
  /** For video_keyframe: how many video clips to generate from the keyframe */
  clipsPerScene?: number;
  /** For video_keyframe: pre-extracted beat prompts (length = clipsPerScene) */
  beats?: string[];
  /** Once keyframe is generated, store its refId so animate steps can use it */
  keyframeRefId?: string;
}

export interface StyleGuide {
  visualStyle: string;
  colorPalette: string;
  mood: string;
  promptPrefix: string;
  promptSuffix: string;
}

export interface VideoConsistency {
  /** Locked storyboard prefix prepended to every keyframe and clip */
  lockedPrefix: string;
  /** Per-scene color phrases from the brief's color arc */
  colorArc: string[];
  /** Character lock token (descriptions force-prepended to every motion prompt) */
  characterLock: string;
  /** Style anchor card refId (set after the first keyframe is generated) */
  styleAnchorRefId?: string;
  /** Base seed for cross-scene continuity (best-effort) */
  baseSeed?: number;
}

export interface Project {
  id: string;
  brief: string;
  styleGuide?: StyleGuide;
  scenes: Scene[];
  status: ProjectStatus;
  feedback: string[];
  createdAt: number;
  batchSize: number;
  /** Set when this project is a video brief */
  isVideo?: boolean;
  /** Cross-video consistency layers — only set when isVideo is true */
  videoConsistency?: VideoConsistency;
  /**
   * Cumulative token usage across every agent turn that referenced this
   * project. Incremented by the plugins whenever they record usage
   * during a run that called project_create/project_generate/etc. for
   * this project id. Displayed in the chat completion summary.
   */
  tokensUsed?: {
    input: number;
    output: number;
    cached: number;
    turns: number;
  };
}
