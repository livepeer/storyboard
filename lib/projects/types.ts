export type SceneStatus = "pending" | "generating" | "done" | "rejected" | "regenerating";
export type ProjectStatus = "planning" | "generating" | "reviewing" | "iterating" | "complete";
export type SceneMediaType = "image" | "video" | "audio";

export interface Scene {
  index: number;
  description: string;
  prompt: string;
  title: string;
  cardRefId?: string;
  status: SceneStatus;
  dependsOn?: number[];
  mediaType: SceneMediaType;
  feedback?: string;
  iterations: number;
  action: "generate" | "restyle" | "animate" | "upscale" | "remove_bg" | "tts";
  sourceUrl?: string;
}

export interface StyleGuide {
  visualStyle: string;
  colorPalette: string;
  mood: string;
  promptPrefix: string;
  promptSuffix: string;
}

export interface Project {
  id: string;
  brief: string;
  styleGuide?: StyleGuide;
  scenes: Scene[];
  status: ProjectStatus;
  feedback: string[];
  createdAt: number;
  batchSize: number;
}
