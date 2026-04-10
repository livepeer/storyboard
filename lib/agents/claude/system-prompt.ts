import type { CanvasContext } from "../types";
import { getMemorySummary, getActiveStyle } from "@/lib/memory/store";
import { getCachedCapabilities } from "@/lib/sdk/capabilities";
import { useProjectStore } from "@/lib/projects/store";
import { useSkillStore } from "@/lib/skills/store";
import { useSessionContext } from "@/lib/agents/session-context";

let cachedBase: string | null = null;

export function clearSystemPromptCache() {
  cachedBase = null;
}

export async function loadSystemPrompt(
  context: CanvasContext
): Promise<string> {
  if (!cachedBase) {
    try {
      const resp = await fetch("/skills/base.md");
      cachedBase = await resp.text();
    } catch {
      cachedBase = "You are the Storyboard assistant. Help users create media using the available tools.";
    }
  }

  const parts = [cachedBase];

  // Compact capabilities — just names, not full model IDs (saves ~500 tokens)
  const caps = getCachedCapabilities();
  if (caps.length > 0) {
    parts.push(`\nModels: ${caps.map((c) => c.name).join(", ")}. Model selection is automatic — just set the action.`);
  }

  // Memory (~100 tokens max)
  const memory = getMemorySummary();
  if (memory) parts.push(`\nMemory: ${memory}`);

  // Active style
  const style = getActiveStyle();
  if (style) {
    parts.push(`\nStyle: "${style.name}" prefix="${style.prompt_prefix}"`);
  }

  // Canvas — compact: max 10 cards, just title+type
  if (context.cards.length > 0) {
    const shown = context.cards.slice(-10);
    const list = shown.map((c) => `${c.title} (${c.type})`).join(", ");
    const extra = context.cards.length > 10 ? ` (+${context.cards.length - 10} more)` : "";
    parts.push(`\nCanvas: ${list}${extra}`);
  }

  if (context.selectedCard) {
    parts.push(`Selected: ${context.selectedCard}`);
  }

  // Active project — one line
  const proj = useProjectStore.getState().getActiveProject();
  if (proj) {
    const done = proj.scenes.filter((s) => s.status === "done").length;
    parts.push(`\nProject "${proj.id}": ${done}/${proj.scenes.length} scenes done. Use project_generate/project_iterate.`);
  }

  // Loaded skills — just names, not content (content loaded on-demand via load_skill)
  const loaded = useSkillStore.getState().loaded;
  if (loaded.length > 0) {
    parts.push(`\nSkills loaded: ${loaded.join(", ")}`);
  }

  // Style overrides
  const overrides = useSkillStore.getState().getActiveStyleOverrides();
  if (overrides.length > 0) {
    parts.push(`\nStyle override active: "${overrides[0].id}" (auto-injected, don't duplicate)`);
  }

  // Creative session context — auto-injected into all prompts, don't duplicate
  const sessionCtx = useSessionContext.getState().context;
  if (sessionCtx) {
    parts.push(`\nCreative context active (auto-injected): ${sessionCtx.style}, ${sessionCtx.characters || ""}, ${sessionCtx.setting || ""}. Don't repeat this in prompts.`);
  }

  return parts.join("\n");
}
