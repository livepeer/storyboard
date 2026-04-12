import type { ToolCall, IntentResult } from "./cockpit-types";
import { useCockpitStore } from "./cockpit-store";
import { SCOPE_PRESETS } from "./scope-params";

/**
 * Parse slash commands like /preset dreamy, /noise 0.7, /reset, /cache 0.4, /lora <path>
 * Returns null if not a slash command.
 */
export function parseSlashCommand(input: string): ToolCall | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const match = trimmed.match(/^\/(\w+)(?:\s+(.+))?$/);
  if (!match) return null;
  const cmd = match[1].toLowerCase();
  const arg = (match[2] || "").trim();

  switch (cmd) {
    case "preset":
      if (!arg) return null;
      return {
        tool: "scope_apply_preset",
        params: { preset: arg },
        summary: `applied ${arg} preset`,
        kind: "preset",
      };
    case "noise": {
      const v = parseFloat(arg);
      if (isNaN(v)) return null;
      return {
        tool: "scope_control",
        params: { noise_scale: v },
        summary: `noise → ${v}`,
        kind: "param",
      };
    }
    case "cache": {
      const v = parseFloat(arg);
      if (isNaN(v)) return null;
      return {
        tool: "scope_control",
        params: { kv_cache_attention_bias: v },
        summary: `cache → ${v}`,
        kind: "param",
      };
    }
    case "reset":
      return {
        tool: "scope_control",
        params: { reset_cache: true },
        summary: "reset cache",
        kind: "system",
      };
    case "lora":
      if (!arg) return null;
      return {
        tool: "scope_control",
        params: { lora_path: arg },
        summary: `loaded LoRA: ${arg}`,
        kind: "skill",
      };
  }
  return null;
}

/** Match an intent to a Scope preset by keyword fuzzy match */
function matchPresetByKeyword(intent: string): ToolCall | null {
  const lower = intent.toLowerCase();
  for (const preset of SCOPE_PRESETS) {
    if (lower.includes(preset.id) || lower.includes(preset.name.toLowerCase())) {
      return {
        tool: "scope_apply_preset",
        params: { preset: preset.id, ...preset.params },
        summary: `applied ${preset.name} preset`,
        kind: "preset",
      };
    }
  }
  return null;
}

/** Build alternative actions from other presets */
function buildAlternatives(applied: ToolCall): ToolCall[] {
  const appliedPreset = applied.params.preset as string | undefined;
  return SCOPE_PRESETS
    .filter((p) => p.id !== appliedPreset)
    .slice(0, 3)
    .map((p) => ({
      tool: "scope_apply_preset",
      params: { preset: p.id, ...p.params },
      summary: `try ${p.name}`,
      kind: "preset" as const,
    }));
}

/**
 * Translate user intent into a Scope action.
 * Priority: pinned skills → slash commands → keyword preset match → fallback.
 */
export async function translateIntent(intent: string): Promise<IntentResult> {
  // 1. Check pinned skills first (no LLM call)
  const pinned = useCockpitStore.getState().findPinnedSkill(intent);
  if (pinned) {
    useCockpitStore.getState().incrementSkillUses(pinned.id);
    return {
      applied: pinned.action,
      alternatives: buildAlternatives(pinned.action),
      reasoning: `Matched pinned skill "${pinned.name}"`,
    };
  }

  // 2. Slash commands
  const slash = parseSlashCommand(intent);
  if (slash) {
    return {
      applied: slash,
      alternatives: buildAlternatives(slash),
      reasoning: "Slash command",
    };
  }

  // 3. Keyword preset match
  const preset = matchPresetByKeyword(intent);
  if (preset) {
    return {
      applied: preset,
      alternatives: buildAlternatives(preset),
      reasoning: "Keyword match",
    };
  }

  // 4. Fallback: send raw text as prompt update
  const fallback: ToolCall = {
    tool: "scope_control",
    params: { prompts: intent },
    summary: `prompt → "${intent.slice(0, 30)}"`,
    kind: "param",
  };
  return {
    applied: fallback,
    alternatives: SCOPE_PRESETS.slice(0, 3).map((p) => ({
      tool: "scope_apply_preset",
      params: { preset: p.id, ...p.params },
      summary: `try ${p.name}`,
      kind: "preset" as const,
    })),
    reasoning: "Sent as prompt",
  };
}
