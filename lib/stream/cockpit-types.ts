export interface ToolCall {
  tool: string;
  params: Record<string, unknown>;
  summary: string;
  kind: "preset" | "skill" | "param" | "system" | "graph";
}

export interface IntentResult {
  applied: ToolCall;
  alternatives: ToolCall[];
  reasoning?: string;
}

export interface StreamPreference {
  intent: string;
  applied: ToolCall;
  outcome: "kept" | "rolled_back" | "alternative_chosen";
  timestamp: number;
}

export interface PinnedSkill {
  id: string;
  name: string;
  triggers: string[];
  action: ToolCall;
  createdAt: number;
  uses: number;
}

export interface Bias {
  preferredPreset?: string;
  avgNoiseScale?: number;
  avgKvCache?: number;
  sampleCount: number;
}
