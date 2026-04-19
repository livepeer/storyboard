export type Difficulty = "starter" | "explorer" | "creator" | "master";
export type StepType = "text_input" | "generate" | "transform" | "review" | "celebrate";

export interface MissionStep {
  id: string;
  instruction: string;
  hint?: string;
  type: StepType;
  capability?: string;
  action?: string;
  autoPromptPrefix?: string;
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  icon: string;
  difficulty: Difficulty;
  category: "image" | "video" | "story" | "music" | "mixed";
  steps: MissionStep[];
  unlockAfter?: string[];
  maxStars: number;
}

export interface MissionProgress {
  missionId: string;
  currentStep: number;
  completed: boolean;
  stars: number;
  artifacts: string[];
  startedAt: number;
  completedAt?: number;
}
