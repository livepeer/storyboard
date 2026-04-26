/**
 * Hierarchy commands — /epic, /arc, /find.
 *
 * /epic create|list|remove — manage epics (groups of episodes)
 * /arc create|list|remove — manage story arcs (groups of epics)
 * /find <query> — search across all hierarchy levels
 */

import { useEpisodeStore } from "./store";
import { useCanvasStore } from "@/lib/canvas/store";
import { getCardIdsForEpic, getCardIdsForStory } from "./bounding-box";

// ── Focusable envelope markers for clickable chat links ──
export const FOCUSABLE_MARKER = "@@focusable@@";
export const FOCUSABLE_END = "@@/focusable@@";

function focusable(name: string, cardIds: string[]): string {
  return `${FOCUSABLE_MARKER}${JSON.stringify({ name, cardIds })}${FOCUSABLE_END}`;
}

// ── /epic ──

export async function handleEpicCommand(args: string): Promise<string> {
  const parts = args.trim().split(/\s+/);
  const sub = parts[0]?.toLowerCase();
  const rest = parts.slice(1).join(" ").trim();
  const store = useEpisodeStore.getState();

  if (sub === "create") {
    const name = rest || `Epic ${store.epics.length + 1}`;
    // Find selected episodes (via selected cards → which episodes they belong to)
    const selected = useCanvasStore.getState().selectedCardIds;
    const episodeIds = new Set<string>();
    for (const cardId of selected) {
      const ep = store.getEpisodeForCard(cardId);
      if (ep && !ep.epicId) episodeIds.add(ep.id);
    }
    if (episodeIds.size < 2) {
      // Try all episodes without epics
      const unepiced = store.episodes.filter((ep) => !ep.epicId);
      if (unepiced.length >= 2) {
        return `Select cards from 2+ episodes first, or try:\n${unepiced.map((ep) => `  ${ep.name} (${ep.cardIds.length} cards)`).join("\n")}`;
      }
      return "Select cards from at least 2 episodes to group into an epic.";
    }
    const epic = store.createEpic(name, Array.from(episodeIds));
    return `Epic "${epic.name}" created with ${episodeIds.size} episodes.`;
  }

  if (sub === "list") {
    if (store.epics.length === 0) return "No epics. Select cards from 2+ episodes, then /epic create <name>.";
    const lines = store.epics.map((e) => {
      const cardIds = getCardIdsForEpic(e.id);
      const parent = store.getStoryForEpic(e.id);
      const parentInfo = parent ? ` (in arc: ${parent.name})` : "";
      return `  ${focusable(e.name, cardIds)} — ${e.episodeIds.length} episodes, ${cardIds.length} cards${parentInfo}`;
    });
    return ["── Epics ──", ...lines].join("\n");
  }

  if (sub === "remove") {
    if (!rest) return "Usage: /epic remove <name>";
    const epic = store.epics.find((e) => e.name.toLowerCase().includes(rest.toLowerCase()));
    if (!epic) return `Epic "${rest}" not found.`;
    store.removeEpic(epic.id);
    return `Epic "${epic.name}" removed. Episodes kept.`;
  }

  return "Usage: /epic create <name> | /epic list | /epic remove <name>";
}

// ── /arc (story arcs) ──

export async function handleArcCommand(args: string): Promise<string> {
  const parts = args.trim().split(/\s+/);
  const sub = parts[0]?.toLowerCase();
  const rest = parts.slice(1).join(" ").trim();
  const store = useEpisodeStore.getState();

  if (sub === "create") {
    const name = rest || `Arc ${store.stories.length + 1}`;
    // Find selected epics (via selected cards → episodes → epics)
    const selected = useCanvasStore.getState().selectedCardIds;
    const epicIdSet = new Set<string>();
    for (const cardId of selected) {
      const ep = store.getEpisodeForCard(cardId);
      if (ep) {
        const epic = store.getEpicForEpisode(ep.id);
        if (epic && !epic.storyId) epicIdSet.add(epic.id);
      }
    }
    if (epicIdSet.size < 2) {
      const unstoried = store.epics.filter((e) => !e.storyId);
      if (unstoried.length >= 2) {
        return `Select cards from 2+ epics first, or try:\n${unstoried.map((e) => `  ${e.name} (${e.episodeIds.length} episodes)`).join("\n")}`;
      }
      return "Need at least 2 epics to group into a story arc. Create epics first with /epic create.";
    }
    const story = store.createStory(name, Array.from(epicIdSet));
    return `Story arc "${story.name}" created with ${epicIdSet.size} epics.`;
  }

  if (sub === "list") {
    if (store.stories.length === 0) return "No story arcs. Create epics first, then /arc create <name>.";
    const lines = store.stories.map((s) => {
      const cardIds = getCardIdsForStory(s.id);
      return `  ${focusable(s.name, cardIds)} — ${s.epicIds.length} epics, ${cardIds.length} cards`;
    });
    return ["── Story Arcs ──", ...lines].join("\n");
  }

  if (sub === "remove") {
    if (!rest) return "Usage: /arc remove <name>";
    const story = store.stories.find((s) => s.name.toLowerCase().includes(rest.toLowerCase()));
    if (!story) return `Arc "${rest}" not found.`;
    store.removeStory(story.id);
    return `Arc "${story.name}" removed. Epics kept.`;
  }

  return "Usage: /arc create <name> | /arc list | /arc remove <name>";
}

// ── /find ──

export async function handleFindCommand(args: string): Promise<string> {
  const query = args.trim().toLowerCase();
  if (!query) return "Usage: /find <query> — searches stories, epics, episodes, and cards";

  const store = useEpisodeStore.getState();
  const cards = useCanvasStore.getState().cards;
  const results: string[] = [];

  // Search stories
  for (const s of store.stories) {
    if (s.name.toLowerCase().includes(query)) {
      const cardIds = getCardIdsForStory(s.id);
      results.push(`🏛 Arc: ${focusable(s.name, cardIds)}`);
    }
  }

  // Search epics
  for (const e of store.epics) {
    if (e.name.toLowerCase().includes(query)) {
      const cardIds = getCardIdsForEpic(e.id);
      results.push(`📚 Epic: ${focusable(e.name, cardIds)}`);
    }
  }

  // Search episodes
  for (const ep of store.episodes) {
    if (ep.name.toLowerCase().includes(query)) {
      results.push(`📁 Episode: ${focusable(ep.name, ep.cardIds)}`);
    }
  }

  // Search cards
  for (const c of cards) {
    const text = `${c.title} ${c.prompt || ""} ${c.refId}`.toLowerCase();
    if (text.includes(query)) {
      results.push(`🃏 Card: ${focusable(c.title || c.refId, [c.id])}`);
    }
  }

  if (results.length === 0) return `No results for "${query}".`;
  return [`Found ${results.length} result${results.length > 1 ? "s" : ""} for "${query}":`, "", ...results.slice(0, 20)].join("\n");
}
