import type { Card, ArrowEdge } from "@/lib/canvas/types";
import type { Episode } from "@/lib/episodes/types";

export interface LayoutPreset {
  cols: number;
  gap: number;
  cardScale: number;
  flow: "ltr" | "zigzag" | "center-out";
  groupBy: "batch" | "episode" | "none";
  rowSeparator: number;
  startCorner: "top-left" | "center";
}

export interface LayoutSkill {
  id: string;
  name: string;
  description: string;
  category: "built-in" | "user";
  preset?: LayoutPreset;
  layoutFn?: (ctx: LayoutContext) => CardPosition[];
}

export interface LayoutContext {
  cards: Card[];
  edges: ArrowEdge[];
  episodes: Episode[];
  activeEpisodeId: string | null;
  canvasWidth: number;
}

export interface CardPosition {
  cardId: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export const BASE_CARD_W = 320;
export const BASE_CARD_H = 280;
export const BASE_GAP = 24;
export const HEADER_OFFSET = 48;
