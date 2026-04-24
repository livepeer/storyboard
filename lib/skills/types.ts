export type SkillCategory = "core" | "creation" | "workflow" | "live" | "style" | "integration" | "user" | "intent";

export interface SkillMeta {
  id: string;
  category: SkillCategory;
  type?: "standard" | "style-override";
  description: string;
  tags?: string[];
  path?: string;
  // Style-override fields
  prompt_prefix?: string;
  prompt_suffix?: string;
  model_hint?: string;
  video_prompt_addition?: string;
  // User-created
  created_by?: "user" | "built-in";
  created_at?: number;
  iterations?: number;
}
