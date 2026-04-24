import type { Artifact, ArtifactEdge, Viewport } from "@livepeer/creative-kit";

export type CardType = "image" | "video" | "audio" | "stream" | "camera";

/**
 * Card extends the creative-kit Artifact with storyboard-specific fields.
 * All Artifact fields (id, refId, type, title, url, error, x, y, w, h, metadata)
 * are inherited. Storyboard adds visual/media-specific properties.
 */
export interface Card extends Artifact {
  type: CardType;
  minimized: boolean;
  /** Cards from the same create_media call share a batchId */
  batchId?: string;
  /** The capability/model used to generate this card */
  capability?: string;
  /** The prompt used to generate this card */
  prompt?: string;
  /** Floating bottom caption — shown as an overlay banner on the card */
  caption?: string;
  /** Full-card text overlay — renders as a slide cover (title, subtitle, stats). */
  coverText?: { title: string; subtitle?: string; stats?: string };
  /** Generation time in ms */
  elapsed?: number;
  /** Why this model was chosen: "auto", "face lock", "user override", "fallback from X" */
  routeReason?: string;
  /** Pinned cards stay fixed on screen when panning/zooming */
  pinned?: boolean;
  /** Screen-space position captured at pin time */
  pinX?: number;
  pinY?: number;
  /** Viewport scale at pin time */
  pinScale?: number;
}

/**
 * ArrowEdge extends ArtifactEdge with storyboard's meta shape.
 * The `meta` field is storyboard-specific; ArtifactEdge's `metadata`
 * is the generic equivalent. Both are available.
 */
export interface ArrowEdge extends ArtifactEdge {
  meta?: {
    capability?: string;
    prompt?: string;
    model?: string;
    elapsed?: number;
    action?: string;
  };
}

/**
 * CanvasViewport — storyboard uses panX/panY naming for historical reasons.
 * Maps to creative-kit's Viewport (x, y, scale).
 */
export interface CanvasViewport {
  panX: number;
  panY: number;
  scale: number;
}

/** Convert between CanvasViewport (panX/panY) and Viewport (x/y) */
export function toViewport(cv: CanvasViewport): Viewport {
  return { x: cv.panX, y: cv.panY, scale: cv.scale };
}

export function toCanvasViewport(v: Viewport): CanvasViewport {
  return { panX: v.x, panY: v.y, scale: v.scale };
}
