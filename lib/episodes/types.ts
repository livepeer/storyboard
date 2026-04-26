import type { CreativeContext } from "@/lib/agents/session-context";

export interface Episode {
  id: string;
  name: string;
  cardIds: string[];
  context: Partial<CreativeContext>;
  color: string;
  createdAt: number;
  /** Parent epic ID (if grouped into an epic) */
  epicId?: string;
}

export interface Epic {
  id: string;
  name: string;
  episodeIds: string[];
  color: string;
  createdAt: number;
  /** Parent story ID (if grouped into a story) */
  storyId?: string;
}

export interface Story {
  id: string;
  name: string;
  epicIds: string[];
  color: string;
  createdAt: number;
}
