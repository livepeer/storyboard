/**
 * Episode-specific commands — /episode animate, /episode list (enhanced).
 */

import { useEpisodeStore } from "./store";
import { useCanvasStore } from "@/lib/canvas/store";
import { animateEpisode } from "./animate";
import { produceEpisodeVideo } from "./production-manager";
import { FOCUSABLE_MARKER, FOCUSABLE_END } from "./commands";

function focusable(name: string, cardIds: string[]): string {
  return `${FOCUSABLE_MARKER}${JSON.stringify({ name, cardIds })}${FOCUSABLE_END}`;
}

export async function handleEpisodeCommand(args: string): Promise<string> {
  const parts = args.trim().split(/\s+/);
  const sub = parts[0]?.toLowerCase();
  const rest = parts.slice(1).join(" ").trim();
  const store = useEpisodeStore.getState();

  if (sub === "animate") {
    // Find the episode: from selected cards, or by name
    let episode = undefined;

    // Try by name first
    if (rest && rest !== "cinematic" && rest !== "fast") {
      episode = store.episodes.find((ep) =>
        ep.name.toLowerCase().includes(rest.toLowerCase())
      );
    }

    // Fall back to selected cards → find their episode
    if (!episode) {
      const selected = useCanvasStore.getState().selectedCardIds;
      for (const cardId of selected) {
        const ep = store.getEpisodeForCard(cardId);
        if (ep) { episode = ep; break; }
      }
    }

    // Fall back to the most recent episode with cards
    if (!episode) {
      episode = store.episodes
        .filter((ep) => ep.cardIds.length >= 2)
        .sort((a, b) => b.createdAt - a.createdAt)[0];
    }

    if (!episode) {
      return "No episode found. Select cards in an episode, or specify: /episode animate <name>";
    }

    const style = (rest === "fast" || rest === "cinematic") ? rest : undefined;
    const result = await animateEpisode({
      episodeId: episode.id,
      style,
    });

    if (!result) return "Animation failed — check chat for details.";
    return `"${episode.name}" animated: ${result.clipCount} clips → ${result.duration.toFixed(1)}s video (${result.model})`;
  }

  if (sub === "produce") {
    // Full production pipeline: analyze → LLM review → animate → transitions → soundtrack → stitch
    let episode = undefined;
    const prodStyle = rest === "fast" ? "fast" : undefined;
    const prodName = rest && rest !== "fast" ? rest : undefined;

    if (prodName) {
      episode = store.episodes.find((ep) => ep.name.toLowerCase().includes(prodName.toLowerCase()));
    }
    if (!episode) {
      const selected = useCanvasStore.getState().selectedCardIds;
      for (const cardId of selected) {
        const ep = store.getEpisodeForCard(cardId);
        if (ep) { episode = ep; break; }
      }
    }
    if (!episode) {
      episode = store.episodes.filter((ep) => ep.cardIds.length >= 2).sort((a, b) => b.createdAt - a.createdAt)[0];
    }
    if (!episode) return "No episode found. Select cards in an episode, or specify: /episode produce <name>";

    try {
      const result = await produceEpisodeVideo({
        episodeId: episode.id,
        style: prodStyle,
        withTransitions: true,
        withSoundtrack: true,
      });
      if (result.phase === "done") {
        const doneCount = result.clips.filter((c) => c.status === "done").length;
        return `"${episode.name}" produced: ${doneCount} clips + transitions + soundtrack`;
      }
      return `Production ended in phase: ${result.phase}`;
    } catch (e) {
      return `Production failed: ${(e as Error).message?.slice(0, 80)}`;
    }
  }

  if (sub === "list") {
    if (store.episodes.length === 0) return "No episodes. Drag cards together or select 2+ cards → Group into Episode.";
    const lines = store.episodes.map((ep) => {
      const epic = store.getEpicForEpisode(ep.id);
      const parentInfo = epic ? ` (epic: ${epic.name})` : "";
      const imgCount = useCanvasStore.getState().cards.filter(
        (c) => ep.cardIds.includes(c.id) && c.type === "image" && c.url
      ).length;
      return `  ${focusable(ep.name, ep.cardIds)} — ${ep.cardIds.length} cards (${imgCount} images)${parentInfo}`;
    });
    return ["── Episodes ──", ...lines, "", "Tip: /episode animate <name> to turn an episode into a video"].join("\n");
  }

  return "Usage:\n  /episode animate [name] — quick animation (per-clip stitch)\n  /episode produce [name] — full production (LLM review + transitions + soundtrack)\n  /episode list — show all episodes";
}
