import type { CreativeContext } from "@/lib/agents/session-context";

export interface FilmShot {
  index: number;
  title: string;
  description: string;
  camera: string;
  duration: number;
}

export interface Film {
  id: string;
  originalPrompt: string;
  title: string;
  style: string;
  characterLock: string;
  context: CreativeContext;
  shots: FilmShot[];
  status: "draft" | "applied" | "archived";
  createdAt: number;
  appliedAt?: number;
}

export interface FilmListItem {
  id: string;
  title: string;
  status: Film["status"];
  createdAt: number;
  shotCount: number;
  ageLabel: string;
}
