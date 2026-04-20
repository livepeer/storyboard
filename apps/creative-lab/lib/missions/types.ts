export type Difficulty = "starter" | "explorer" | "creator" | "master";
export type StepType =
  | "text_input"     // free-form text with spark suggestions
  | "spark_pick"     // pick from fun spark prompts (no typing needed)
  | "style_pick"     // choose a visual style before generating
  | "generate"       // create an image
  | "transform"      // modify an existing image (restyle, add effects)
  | "remix"          // one-tap variations of the last creation
  | "animate"        // turn image into video
  | "narrate"        // add voice to image (talking video)
  | "story_gen"      // generate a multi-scene story (/story pattern)
  | "film_gen"       // generate a 4-shot film (/film pattern)
  | "review"         // look at what you made
  | "celebrate";     // confetti + stars

/** A tappable spark suggestion — kids tap instead of typing */
export interface Spark {
  label: string;      // "🐲 Dragon with rainbow wings"
  prompt: string;     // actual prompt text
}

/** A visual style option */
export interface StyleOption {
  id: string;
  label: string;      // "Cartoon"
  icon: string;       // "🎨"
  promptPrefix: string; // prepended to user's prompt
  preview?: string;    // optional preview image URL
}

export interface MissionStep {
  id: string;
  instruction: string;
  hint?: string;
  type: StepType;
  capability?: string;
  action?: string;
  autoPromptPrefix?: string;
  /** Fun tappable spark suggestions — tap one to auto-fill */
  sparks?: Spark[];
  /** Visual style options for style_pick steps */
  styles?: StyleOption[];
  /** Number of remix variations to generate */
  remixCount?: number;
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

export interface SavedCreation {
  id: string;
  url: string;
  type: "image" | "video" | "audio";
  prompt: string;
  savedAt: number;
}

export interface MissionProgress {
  missionId: string;
  currentStep: number;
  completed: boolean;
  stars: number;
  artifacts: string[];
  /** Persisted creations the user explicitly saved or that were auto-saved on completion */
  savedCreations?: SavedCreation[];
  startedAt: number;
  completedAt?: number;
}
