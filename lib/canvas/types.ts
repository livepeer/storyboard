export type CardType = "image" | "video" | "audio" | "stream" | "camera";

export interface Card {
  id: string;
  refId: string;
  type: CardType;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minimized: boolean;
  url?: string;
  error?: string;
  /** Cards from the same create_media call share a batchId */
  batchId?: string;
  /** The capability/model used to generate this card */
  capability?: string;
  /** The prompt used to generate this card */
  prompt?: string;
  /** Floating bottom caption — shown as an overlay banner on the card */
  caption?: string;
  /** Generation time in ms */
  elapsed?: number;
  /** Pinned cards stay fixed on screen when panning/zooming */
  pinned?: boolean;
  /** Screen-space position captured at pin time — used when pinned is true */
  pinX?: number;
  pinY?: number;
  /** Viewport scale at pin time — used to size the pinned card 1:1 with how it looked when pinned */
  pinScale?: number;
}

export interface ArrowEdge {
  fromRefId: string;
  toRefId: string;
  meta?: {
    capability?: string;
    prompt?: string;
    model?: string;
    elapsed?: number;
    action?: string;
  };
}

export interface CanvasViewport {
  panX: number;
  panY: number;
  scale: number;
}
