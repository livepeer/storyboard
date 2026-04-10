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
