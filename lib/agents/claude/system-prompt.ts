import type { CanvasContext } from "../types";
import { getMemorySummary, getActiveStyle } from "@/lib/memory/store";
import { buildCapabilitySummary, getCachedCapabilities } from "@/lib/sdk/capabilities";

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

  return parts.join("\n");
}
