import type { CreativeContext } from "@/lib/agents/session-context";

export interface Episode {
  id: string;
  name: string;
  cardIds: string[];
  context: Partial<CreativeContext>;
  color: string;
  createdAt: number;
}
