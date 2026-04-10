import type { CanvasContext } from "../types";
import { getMemorySummary, getActiveStyle } from "@/lib/memory/store";
import { buildCapabilitySummary, getCachedCapabilities } from "@/lib/sdk/capabilities";
import { useProjectStore } from "@/lib/projects/store";
import { useSkillStore } from "@/lib/skills/store";

let cachedBase: string | null = null;

/** Clear cached base prompt (call after updating skills/base.md) */
export function clearSystemPromptCache() {
  cachedBase = null;
}

export async function loadSystemPrompt(
  context: CanvasContext
): Promise<string> {
  // Load base skill (cached after first fetch)
  if (!cachedBase) {
    try {
      const resp = await fetch("/skills/base.md");
      cachedBase = await resp.text();
    } catch {
      cachedBase =
        "You are the Storyboard assistant. Help users create media using the available tools.";
    }
  }

  const parts = [cachedBase];

  // Inject LIVE capabilities from the SDK (the single source of truth)
  const capSummary = buildCapabilitySummary();
  if (capSummary) {
    const capNames = getCachedCapabilities().map((c) => c.name);
    parts.push(
      `\n## Available models (live from SDK — ONLY these exist)\n${capSummary}\n\nValid capability names: ${capNames.join(", ")}\nDo NOT invent model names. If you use create_media, just set the action — model selection is automatic.`
    );
  }

  // Inject memory summary (~100 tokens)
  const memory = getMemorySummary();
  if (memory) {
    parts.push(`\n## Memory\n${memory}`);
  }

  // Inject active style DNA
  const style = getActiveStyle();
  if (style) {
    parts.push(
      `\n## Active Style DNA: "${style.name}"\nPrepend to all generation prompts: "${style.prompt_prefix}"${style.model_hint ? `\nPreferred model: ${style.model_hint}` : ""}`
    );
  }

  if (context.cards.length > 0) {
    const cardList = context.cards
      .map((c) => `- ${c.refId} (${c.type}): "${c.title}"${c.url ? " [has media]" : ""}`)
      .join("\n");
    parts.push(`\n## Current canvas\n${cardList}`);
  }

  if (context.selectedCard) {
    parts.push(`\nThe user has selected card: ${context.selectedCard}`);
  }

  // Inject active project context
  const activeProject = useProjectStore.getState().getActiveProject();
  if (activeProject) {
    const done = activeProject.scenes.filter((s) => s.status === "done").length;
    const total = activeProject.scenes.length;
    const styleDesc = activeProject.styleGuide
      ? `Style: "${activeProject.styleGuide.visualStyle}" (prefix: "${activeProject.styleGuide.promptPrefix}")`
      : "";
    parts.push(
      `\n## Active Project: ${activeProject.id}\nBrief: ${activeProject.brief.slice(0, 150)}\nStatus: ${activeProject.status} (${done}/${total} scenes done)\n${styleDesc}\nUse project_generate to continue, project_iterate to redo rejected scenes, project_status for details.`
    );
  }

  // Inject loaded skill content
  const loadedSkillContent = useSkillStore.getState().getLoadedContent();
  if (loadedSkillContent) {
    parts.push(`\n## Loaded Skills\n${loadedSkillContent.slice(0, 2000)}`);
  }

  // Inject active style override info
  const styleOverrides = useSkillStore.getState().getActiveStyleOverrides();
  if (styleOverrides.length > 0) {
    const desc = styleOverrides.map((s) => `"${s.id}": prefix="${s.prompt_prefix || ""}" suffix="${s.prompt_suffix || ""}"`).join("\n");
    parts.push(`\n## Active Style Override (auto-injected into all prompts)\n${desc}\nDo NOT add these style keywords yourself.`);
  }

  return parts.join("\n");
}
