import type { CanvasContext } from "../types";

let cachedBase: string | null = null;

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

  // Build context summary
  const parts = [cachedBase];

  if (context.cards.length > 0) {
    const cardList = context.cards
      .map((c) => `- ${c.refId} (${c.type}): "${c.title}"${c.url ? " [has media]" : ""}`)
      .join("\n");
    parts.push(`\n## Current canvas\n${cardList}`);
  }

  if (context.selectedCard) {
    parts.push(`\nThe user has selected card: ${context.selectedCard}`);
  }

  if (context.capabilities.length > 0) {
    const capList = context.capabilities.map((c) => c.id).join(", ");
    parts.push(`\n## Live capabilities\n${capList}`);
  }

  return parts.join("\n");
}
