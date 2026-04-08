import type { ToolDefinition } from "./types";

const AVAILABLE_SKILLS = [
  { id: "text-to-image", description: "Model selection guide, prompt engineering, size rules" },
  { id: "image-editing", description: "kontext-edit usage, style transfer, composition preservation" },
  { id: "video", description: "i2v/v2v/t2v pipeline selection, motion prompts, chain constraints" },
  { id: "scope-lv2v", description: "Scope LV2V parameters: noise_scale, transitions, denoising, scenarios" },
  { id: "lora-training", description: "LoRA training: image count, trigger words, step count guide" },
  { id: "style-presets", description: "15 built-in style presets with optimized prompts" },
  { id: "storyboard", description: "Multi-shot storyboard from a script: shot breakdown, step planning, narrative order" },
  { id: "live-director", description: "Live Director Mode: chat commands to LV2V stream_control parameter mapping" },
  { id: "refinement", description: "Iterative refinement loop: generate, analyze, re-generate, upscale best" },
  { id: "remix", description: "Remix Canvas: combine multiple cards into composites" },
  { id: "daily-briefing", description: "Daily briefing videos from email, calendar, Slack, news via MCP" },
];

const skillCache = new Map<string, string>();

/**
 * load_skill — load detailed guidance for a specific topic.
 * Skills are loaded on-demand as tool results (not in system prompt).
 */
export const loadSkillTool: ToolDefinition = {
  name: "load_skill",
  description: `Load detailed guidance for an advanced topic. Available skills: ${AVAILABLE_SKILLS.map((s) => `${s.id} (${s.description})`).join("; ")}. Only load when you need the detail — not for simple tasks.`,
  parameters: {
    type: "object",
    properties: {
      skill_id: {
        type: "string",
        enum: AVAILABLE_SKILLS.map((s) => s.id),
        description: "Which skill to load",
      },
    },
    required: ["skill_id"],
  },
  execute: async (input) => {
    const skillId = input.skill_id as string;

    // Check cache
    const cached = skillCache.get(skillId);
    if (cached) {
      return { success: true, data: { skill_id: skillId, content: cached } };
    }

    // Fetch from public/skills/
    try {
      const resp = await fetch(`/skills/${skillId}.md`);
      if (!resp.ok) {
        return {
          success: false,
          error: `Skill "${skillId}" not found. Available: ${AVAILABLE_SKILLS.map((s) => s.id).join(", ")}`,
        };
      }
      const content = await resp.text();
      skillCache.set(skillId, content);
      return { success: true, data: { skill_id: skillId, content } };
    } catch (e) {
      return {
        success: false,
        error: `Failed to load skill: ${e instanceof Error ? e.message : "Unknown error"}`,
      };
    }
  },
};

export const skillTools: ToolDefinition[] = [loadSkillTool];
