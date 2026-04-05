export interface AgentStep {
  id: string;
  type: "image" | "video" | "audio" | "music";
  prompt: string;
  capability: string;
  depends_on?: string;
  params?: Record<string, unknown>;
  title?: string;
}

export interface EnrichResponse {
  steps: AgentStep[];
  reasoning?: {
    intent?: string;
    narrative?: string;
  };
}

export interface AgentPlugin {
  id: string;
  name: string;
  handleMessage: (text: string) => Promise<void>;
}
