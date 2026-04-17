export interface StreamScene {
  index: number;
  title: string;
  prompt: string;
  /** Duration in seconds before transitioning to next scene */
  duration: number;
  /** Scope preset to apply */
  preset: string;
  /** Noise scale override (0.0-1.0) */
  noiseScale?: number;
}

export interface StreamPlan {
  id: string;
  originalPrompt: string;
  title: string;
  style: string;
  graphTemplate: string;
  scenes: StreamScene[];
  status: "draft" | "streaming" | "done";
  createdAt: number;
  streamId?: string;
}
