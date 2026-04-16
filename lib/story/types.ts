/**
 * Story — a multi-scene narrative generated from a short user prompt
 * by the /story command. Stories live in a zustand store with
 * localStorage persistence so users can browse their history, re-apply
 * drafts, and remix favorites.
 *
 * A Story encapsulates BOTH the narrative (scenes) and the visual
 * direction (CreativeContext) so applying a story sets both at once:
 * scene prompts go to project_create, the CreativeContext goes to
 * session-context. That's what makes /story a single-shot "go from
 * idea to canvas" — the user types 10 words and gets a curated,
 * style-locked storyboard with one click.
 */

import type { CreativeContext } from "@/lib/agents/session-context";

export type StoryStatus = "draft" | "applied" | "archived";

export interface StoryScene {
  /** 1-based index for user display (converted to 0-based on apply). */
  index: number;
  /** Short "Scene N — <title>" label. */
  title: string;
  /** 30–60 word prose description that becomes the generation prompt. */
  description: string;
  /** Optional shot/beat hints the storyteller flagged. Freeform. */
  beats?: string[];
}

export interface Story {
  /** `story_${timestamp}_${randhash}`. Short enough to paste into a command. */
  id: string;
  /** The user's original /story <prompt> input, verbatim. */
  originalPrompt: string;
  /** Short human title (5-8 words). */
  title: string;
  /** "4-year-olds" / "10-year-olds" / "young adults" / "all ages". */
  audience: string;
  /** One-line arc summary. "meet → trial → reconciliation → bond". */
  arc: string;
  /** Full visual direction — plugged straight into useSessionContext on apply. */
  context: CreativeContext;
  /** Ordered scene breakdown. Default 6, user can override. */
  scenes: StoryScene[];
  status: StoryStatus;
  createdAt: number;
  appliedAt?: number;
  /** When this was remixed from another story, link back for traceability. */
  parentStoryId?: string;
}

/**
 * Short-form view used by /story list. One line per story — enough to
 * scan a dozen drafts at a glance.
 */
export interface StoryListItem {
  id: string;
  title: string;
  status: StoryStatus;
  createdAt: number;
  sceneCount: number;
  /** "2m" / "1h" / "3d" — human-friendly age since creation. */
  ageLabel: string;
}

/**
 * Max story count before the store prunes the oldest archived entries.
 * Generous enough that a power user can accumulate a library without
 * bumping into the cap mid-session.
 */
export const STORY_STORE_CAP = 50;

/**
 * Drafts older than this are auto-archived on next store load. Keeps
 * `/story list` readable and lets localStorage breathe.
 */
export const STORY_DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
