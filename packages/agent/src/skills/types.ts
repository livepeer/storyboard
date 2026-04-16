export interface Skill {
  name: string;
  description: string;
  prompt: string;
  body: string;
  path: string;
  hooks?: SkillHooks;
}

export interface SkillHooks {
  beforeTurn?: (ctx: SkillContext) => Promise<void> | void;
  afterTurn?: (ctx: SkillContext) => Promise<void> | void;
}

export interface SkillContext {
  turnIndex: number;
  message: string;
  toolCalls: string[];
}

export const SKILL_PROMPT_BUDGET = 600;
